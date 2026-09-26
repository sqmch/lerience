import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileTranscriptStore } from "../src/main/session/transcript-store";
import { AsyncQueue } from "../src/main/agent/async-queue";
import { ClaudeTutorAgent } from "../src/main/agent/claude";
import type { CourseContextInspection } from "../src/main/scripts/engine-script-service";
import { SessionConductor } from "../src/main/session/conductor";
import { FileControlMemory, type ControlMemory } from "../src/main/session/control-memory";
import type {
  AgentEvent,
  AgentSession,
  SessionControlPatch,
  SessionControls,
  StartSessionOptions,
  TutorAgent,
} from "../src/shared/seminar";
import type { SeminarSnapshot } from "../src/shared/session";

const roots: string[] = [];
const conductors: SessionConductor[] = [];
const COURSE_ID = "123e4567-e89b-42d3-a456-426614174000";
let sessionIdCounter = 1;

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-conductor-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  // Stop the conductors BEFORE the directories they write into go away. A
  // test that ends mid-stream leaves a pump still draining queued events into
  // the transcript; delete the tree under it and the append fails with ENOENT
  // inside `pump`'s own catch, where nothing awaits it — an unhandled
  // rejection attributed to whichever test happened to be running when it
  // landed. `abandon` releases the provider and awaits the pump, so teardown
  // is ordered instead of racing.
  for (const conductor of conductors.splice(0)) {
    await conductor.abandon().catch(() => undefined);
  }
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

class FakeSession implements AgentSession {
  readonly queue = new AsyncQueue<AgentEvent>();
  readonly events = this.queue;
  readonly sent: string[] = [];
  readonly approvals: Array<{ id: string; allow: boolean }> = [];
  /** Every control patch the conductor applied, in order. */
  readonly applied: SessionControlPatch[] = [];
  /** Tests flip this to exercise the conductor's in-flight guards. */
  busy = false;
  /** Tests flip this to exercise the steer path (ADR-042). */
  steerable = false;
  readonly steered: string[] = [];
  /** When set, the provider refuses the next steer (the turn moved on). */
  refuseSteer: Error | null = null;
  /** A provider that rejects every control change (ADR-018 invariant 7). */
  refuseControls = false;
  ended = false;
  controls: SessionControls = {
    models: [{ id: "sonnet", label: "Sonnet", efforts: ["low", "high"] }],
    autonomy: [{ id: "default", label: "Ask every time", description: "asks" }],
    current: { model: "sonnet", effort: null, autonomy: "default" },
  };

  send(message: string): void {
    this.sent.push(message);
  }

  async steer(message: string): Promise<void> {
    if (!this.steerable) throw new Error("This provider cannot take a message mid-turn.");
    if (!this.busy) throw new Error("No turn is in flight.");
    if (this.refuseSteer !== null) throw this.refuseSteer;
    this.steered.push(message);
  }

  respondToApproval(requestId: string, allow: boolean): void {
    this.approvals.push({ id: requestId, allow });
  }

  async describeControls(): Promise<SessionControls> {
    return this.controls;
  }

  async applyControls(patch: SessionControlPatch): Promise<SessionControls> {
    this.applied.push(patch);
    if (this.refuseControls) throw new Error("The provider refused that control.");
    this.controls = {
      ...this.controls,
      current: { ...this.controls.current, ...patch },
    };
    return this.controls;
  }

  async interrupt(): Promise<void> {
    this.queue.push({ type: "turn_complete" });
  }

  async end(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    // Real provider streams can drain a final non-terminal frame after the
    // doctor-verified logical close but before session_ended.
    this.queue.push({ type: "usage_update", totalCostUsd: 0.42 });
    this.queue.push({ type: "session_ended", reason: "ended" });
    this.queue.end();
  }

  emit(event: AgentEvent): void {
    this.queue.push(event);
  }
}

class FakeAgent implements TutorAgent {
  readonly providerId = "claude";
  readonly sessions: FakeSession[] = [];
  readonly starts: StartSessionOptions[] = [];
  refuseControls = false;

  startSession(options: StartSessionOptions): AgentSession {
    this.starts.push(options);
    const session = new FakeSession();
    session.refuseControls = this.refuseControls;
    this.sessions.push(session);
    return session;
  }
}

function inspection(fail = false): CourseContextInspection {
  return {
    doctor: {
      available: true,
      value: [{ id: "state", level: fail ? "fail" : "ok", message: fail ? "dirty" : "clean" }],
    },
    due: { available: true, value: "2 due, most overdue first" },
    journalTail: { available: true, value: "## 2026-08-11 — Previous" },
    currentModuleId: "02-vectors",
  };
}

function harness(options: {
  courseDir?: string;
  userData?: string;
  agent?: FakeAgent;
  inspections?: CourseContextInspection[];
  controlMemory?: ControlMemory;
}) {
  const courseDir = options.courseDir ?? temporaryRoot();
  const userData = options.userData ?? temporaryRoot();
  const agent = options.agent ?? new FakeAgent();
  const snapshots: SeminarSnapshot[] = [];
  const events: AgentEvent[] = [];
  const queued = [...(options.inspections ?? [inspection()])];
  const conductor = new SessionConductor({
    createAgent: () => agent,
    userDataPath: userData,
    clock: () => new Date("2026-08-12T03:00:00.000Z"),
    createId: () => {
      if (!fs.existsSync(path.join(courseDir, ".praxeum.json"))) return COURSE_ID;
      return `223e4567-e89b-42d3-a456-${String(sessionIdCounter++).padStart(12, "0")}`;
    },
    scripts: {
      inspectContext: async () => queued.shift() ?? inspection(),
      runChecks: async () => ({ outcome: "pass", total: 1, passed: 1, failed: 0 }),
    },
    emitAgentEvent: (event) => events.push(event),
    emitSnapshot: (snapshot) => snapshots.push(snapshot),
    ...(options.controlMemory === undefined ? {} : { controlMemory: options.controlMemory }),
  });
  conductors.push(conductor);
  return { conductor, courseDir, userData, agent, snapshots, events };
}

/** Wait for the conductor to reach a state, bounded by TIME rather than by a
 *  count of turns through the event loop.
 *
 *  It used to spin 100 times on a zero-delay timer. Node clamps those to a
 *  millisecond, so the whole budget was about 100ms — and what is being waited
 *  on is not scheduling, it is the pump persisting entries, each one an open,
 *  a write and an fsync. Two fsyncs on a loaded CI disk outlast 100ms easily,
 *  which made every one of these waits a bet on how fast the machine was. A
 *  deadline is the same wait everywhere; the budget is generous because it is
 *  only ever paid in full when something is genuinely broken. */
async function settleUntil(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 4_000;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error("Timed out waiting for conductor state");
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
}

describe("SessionConductor", () => {
  it.each([false, true])(
    "keeps prior Claude results separate from closing with a buffered continuation: %s",
    async (buffered) => {
      const courseDir = temporaryRoot();
      const sdk = new AsyncQueue<SDKMessage>();
      const inputs: SDKUserMessage[] = [];
      const events: AgentEvent[] = [];
      let consumedFrames = 0;
      const agent = new ClaudeTutorAgent(({ prompt }) => {
        if (typeof prompt === "string") throw new Error("Expected streaming input");
        void (async () => {
          for await (const input of prompt) inputs.push(input);
          sdk.end();
        })();
        return {
          interrupt: async () => undefined,
          async *[Symbol.asyncIterator]() {
            for await (const frame of sdk) {
              yield frame;
              consumedFrames++;
            }
          },
        };
      });
      let session!: AgentSession;
      const conductor = new SessionConductor({
        createAgent: () => ({
          providerId: "claude",
          startSession: (options) => (session = agent.startSession(options)),
        }),
        userDataPath: temporaryRoot(),
        scripts: {
          inspectContext: async () => inspection(),
          runChecks: async () => ({ outcome: "pass", total: 1, passed: 1, failed: 0 }),
        },
        emitAgentEvent: (event) => events.push(event),
        emitSnapshot: () => undefined,
      });
      conductors.push(conductor);
      await conductor.start({ courseDir, currentModuleId: null, onboarding: false });
      const originalAppend = FileTranscriptStore.prototype.append;
      let release!: () => void;
      let blocked = false;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(FileTranscriptStore.prototype, "append").mockImplementation(async function (
        this: FileTranscriptStore,
        input,
      ) {
        if (input.kind === "turn_complete" && !blocked) {
          blocked = true;
          await gate;
        }
        return originalAppend.call(this, input);
      });
      const result = (): void => {
        sdk.push({ type: "result", subtype: "success", total_cost_usd: 0.02 } as SDKMessage);
      };
      result();
      await settleUntil(() => blocked);
      if (buffered) {
        sdk.push({
          type: "stream_event",
          parent_tool_use_id: null,
          event: { type: "message_start" },
        } as SDKMessage);
        sdk.push({
          type: "assistant",
          parent_tool_use_id: null,
          message: { content: [{ type: "text", text: "Background conclusion" }] },
        } as SDKMessage);
        result();
        await settleUntil(() => consumedFrames === 4);
      }
      expect(session.busy).toBe(false);
      const ending = conductor.end().then(
        () => "accepted",
        () => "rejected",
      );
      await Promise.resolve();
      release();
      expect(await ending).toBe(buffered ? "rejected" : "accepted");
      await settleUntil(
        () =>
          events.filter((event) => event.type === "turn_complete").length === (buffered ? 2 : 1),
      );
      if (buffered) {
        expect(inputs).toHaveLength(1);
        expect((await conductor.current(courseDir)).lifecycle).toBe("open");
        expect(events.some((event) => event.type === "session_ended")).toBe(false);
        await conductor.end();
      }
      expect(inputs.at(-1)?.message.content).toBe("end session");
      expect(session.busy).toBe(true);
      expect((await conductor.current(courseDir)).lifecycle).toBe("wrapping");
      result();
      await settleUntil(() => events.some((event) => event.type === "session_ended"));
      expect((await conductor.current(courseDir)).lifecycle).toBe("closed");
    },
  );
  it.each(["send", "retry", "end"] as const)(
    "stops after an accepted %s cannot be saved without inviting a duplicate",
    async (operation) => {
      const { conductor, courseDir, agent, events } = harness({});
      await conductor.start({ courseDir, currentModuleId: null, onboarding: false });
      const session = agent.sessions[0]!;
      session.emit({ type: "turn_complete" });
      await settleUntil(() => events.some((event) => event.type === "turn_complete"));
      vi.spyOn(FileTranscriptStore.prototype, "append").mockRejectedValueOnce(
        new Error("disk full"),
      );
      await expect(
        operation === "send"
          ? conductor.send("keep this unsaved message")
          : operation === "retry"
            ? conductor.retry()
            : conductor.end(),
      ).resolves.toBeUndefined();
      expect(session.sent).toHaveLength(2);
      expect(session.ended).toBe(true);
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "error",
          message: expect.stringContaining("received your message"),
        }),
      );
      expect(events.at(-1)).toEqual({ type: "session_ended", reason: "died" });
      await conductor.abandon();
      expect((await conductor.current(courseDir)).lifecycle).toBe("recoverable");
      expect((await conductor.current(courseDir)).messages).toEqual([]);
    },
  );

  it("drains the previous result before a closing request can own completion", async () => {
    const { conductor, courseDir, agent, events } = harness({});
    await conductor.start({ courseDir, currentModuleId: null, onboarding: false });
    const session = agent.sessions[0]!;
    const originalAppend = FileTranscriptStore.prototype.append;
    let release!: () => void;
    let blocked = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(FileTranscriptStore.prototype, "append").mockImplementation(async function (
      this: FileTranscriptStore,
      input,
    ) {
      if (input.kind === "turn_complete" && !blocked) {
        blocked = true;
        await gate;
      }
      return originalAppend.call(this, input);
    });
    session.emit({ type: "turn_complete" });
    await settleUntil(() => blocked);
    const ending = conductor.end();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(session.sent).toHaveLength(1);
    release();
    await ending;
    expect(events.filter((event) => event.type === "turn_complete")).toHaveLength(1);
    expect(session.ended).toBe(false);
    expect((await conductor.current(courseDir)).lifecycle).toBe("wrapping");
    session.emit({ type: "turn_complete" });
    await settleUntil(() => session.ended);
    expect((await conductor.current(courseDir)).lifecycle).toBe("closed");
  });
  it.each(["send", "retry", "end"] as const)(
    "admits %s before its persistence await and gates the reply",
    async (operation) => {
      const { conductor, courseDir, agent, events } = harness({});
      await conductor.start({ courseDir, currentModuleId: null, onboarding: false });
      const session = agent.sessions[0]!;
      session.emit({ type: "turn_complete" });
      await settleUntil(() => events.some((event) => event.type === "turn_complete"));
      const originalSend = session.send.bind(session);
      session.send = (text) => {
        if (session.busy) throw new Error("A tutor turn is already in progress.");
        session.busy = true;
        originalSend(text);
      };
      const originalAppend = FileTranscriptStore.prototype.append;
      let release!: () => void;
      let blocked = false;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(FileTranscriptStore.prototype, "append").mockImplementation(async function (
        this: FileTranscriptStore,
        input,
      ) {
        if (
          !blocked &&
          (input.kind === "learner" || input.kind === "operator" || input.kind === "lifecycle")
        ) {
          blocked = true;
          await gate;
        }
        return originalAppend.call(this, input);
      });
      const command = (
        operation === "send"
          ? conductor.send("new question")
          : operation === "retry"
            ? conductor.retry()
            : conductor.end()
      ).then(
        () => "accepted",
        () => "rejected",
      );
      await settleUntil(() => blocked);
      const admittedBeforeWrite = session.sent.length === 2;
      session.busy = true;
      session.emit({ type: "turn_started" });
      session.emit({ type: "message_delta", delta: "reply" });
      session.busy = false;
      session.emit({ type: "turn_complete" });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const replyEscapedGate = events.some((event) => event.type === "message_delta");
      release();
      const outcome = await command;
      await settleUntil(() => events.some((event) => event.type === "message_delta"));
      expect(admittedBeforeWrite).toBe(true);
      expect(replyEscapedGate).toBe(false);
      expect(outcome).toBe("accepted");
      if (operation === "send")
        expect(
          (await conductor.current(courseDir)).messages.map((message) => message.role),
        ).toEqual(["learner", "tutor"]);
    },
  );

  it("writes nothing when automatic activity wins synchronous admission", async () => {
    const { conductor, courseDir, agent, events } = harness({});
    await conductor.start({ courseDir, currentModuleId: null, onboarding: false });
    const session = agent.sessions[0]!;
    session.emit({ type: "turn_complete" });
    await settleUntil(() => events.some((event) => event.type === "turn_complete"));
    session.send = () => {
      session.busy = true;
      throw new Error("A tutor turn is already in progress.");
    };
    await expect(conductor.send("not accepted")).rejects.toThrow("already in progress");
    expect((await conductor.current(courseDir)).messages).toEqual([]);
  });

  it("forwards allowance state without saving it as course evidence", async () => {
    const { conductor, courseDir, agent, events } = harness({});
    await conductor.start({ courseDir, currentModuleId: null, onboarding: false });
    const session = agent.sessions[0]!;
    session.emit({
      type: "limit_warning",
      label: "Claude weekly limit",
      usedPercent: 77,
      resetsAt: null,
      status: "warning",
    });
    session.emit({ type: "limit_cleared" });
    session.emit({ type: "turn_complete" });
    await settleUntil(() => events.some((event) => event.type === "turn_complete"));
    expect(events.some((event) => event.type === "limit_warning")).toBe(true);
    expect(events.some((event) => event.type === "limit_cleared")).toBe(true);
    expect((await conductor.current(courseDir)).messages).toEqual([]);
    await conductor.abandon();
    expect((await conductor.current(courseDir)).messages).toEqual([]);
  });

  it("rehydrates background activity only while its provider runtime is alive", async () => {
    const { conductor, courseDir, agent, events } = harness({});
    await conductor.start({ courseDir, currentModuleId: null, onboarding: false });
    const session = agent.sessions[0]!;
    session.emit({ type: "background_tasks", tasks: [{ id: "a", description: "Review lesson" }] });
    session.emit({ type: "task_notification", taskId: "b", status: "failed" });
    session.emit({ type: "message_delta", delta: "Review pending" });
    session.emit({ type: "turn_complete" });
    await settleUntil(() => events.some((event) => event.type === "turn_complete"));
    expect(await conductor.current(courseDir)).toMatchObject({
      turnInProgress: false,
      backgroundTasks: [{ id: "a", description: "Review lesson" }],
      taskNotice: "failed",
    });
    session.busy = true;
    session.emit({ type: "turn_started" });
    await settleUntil(() => events.some((event) => event.type === "turn_started"));
    expect((await conductor.current(courseDir)).turnInProgress).toBe(true);
    await expect(conductor.send("queued elsewhere")).rejects.toThrow("already in progress");
    await conductor.abandon();
    const restored = await conductor.current(courseDir);
    expect(restored.backgroundTasks).toEqual([]);
    expect(restored.taskNotice).toBeNull();
    expect(restored.messages.map((message) => message.content)).toEqual(["Review pending"]);
  });

  it("creates identity/transcript before a normal opener and rehydrates persisted turns", async () => {
    const { conductor, courseDir, agent } = harness({});

    await expect(
      conductor.start({ courseDir, currentModuleId: "02-vectors", onboarding: false }),
    ).resolves.toEqual({ ok: true });
    expect(fs.existsSync(path.join(courseDir, ".praxeum.json"))).toBe(true);
    expect(agent.sessions[0]?.sent[0]).toContain("Doctor report:\nOK: clean");
    expect(agent.sessions[0]?.sent[0]).toMatch(/start session$/);

    agent.sessions[0]?.emit({ type: "message_delta", delta: "Welcome" });
    agent.sessions[0]?.emit({ type: "turn_complete" });
    await settleUntil(async () => (await conductor.current(courseDir)).messages.length === 1);

    const snapshot = await conductor.current(courseDir);
    expect(snapshot.lifecycle).toBe("open");
    expect(snapshot.messages).toEqual([
      { id: expect.any(String), role: "tutor", content: "Welcome", partial: false },
    ]);
  });

  it("persists accepted learner input before allowing replies through", async () => {
    const { conductor, courseDir, agent } = harness({});
    await conductor.start({ courseDir, currentModuleId: null, onboarding: true });
    expect(agent.sessions[0]?.sent[0]).toMatch(/new course$/);
    agent.sessions[0]?.emit({ type: "turn_complete" });

    await conductor.send("I want to learn compilers");
    expect(agent.sessions[0]?.sent[1]).toBe("I want to learn compilers");
    expect((await conductor.current(courseDir)).messages.at(-1)).toMatchObject({
      role: "learner",
      content: "I want to learn compilers",
    });
  });

  it("asks the last request again, as the kind of message it was", async () => {
    const { conductor, courseDir, agent } = harness({});
    await conductor.start({ courseDir, currentModuleId: null, onboarding: true });

    // A turn that answered nothing: the opener is the outstanding request, so
    // asking again repeats it verbatim rather than inventing a nudge.
    agent.sessions[0]?.emit({ type: "turn_complete" });
    await conductor.retry();
    expect(agent.sessions[0]?.sent[1]).toBe(agent.sessions[0]?.sent[0]);
    // The opener is the app's own voice and stays out of the visible turns.
    expect((await conductor.current(courseDir)).messages).toEqual([]);

    agent.sessions[0]?.emit({ type: "turn_complete" });
    await conductor.send("I want to learn compilers");
    agent.sessions[0]?.emit({ type: "turn_complete" });
    await conductor.retry();
    expect(agent.sessions[0]?.sent[3]).toBe("I want to learn compilers");
    // Repeating a learner turn records it as one, so the transcript shows the
    // question was genuinely asked twice.
    expect((await conductor.current(courseDir)).messages).toEqual([
      {
        id: expect.any(String),
        role: "learner",
        content: "I want to learn compilers",
        partial: false,
      },
      {
        id: expect.any(String),
        role: "learner",
        content: "I want to learn compilers",
        partial: false,
      },
    ]);
  });

  it("auto-allows later course edits after the grant, with evidence, without UI noise", async () => {
    const { conductor, courseDir, agent, events, userData } = harness({});
    await conductor.start({ courseDir, currentModuleId: null, onboarding: true });
    const session = agent.sessions[0];
    if (session === undefined) throw new Error("no session started");

    const request = (id: string, edit: boolean): void => {
      session.emit({
        type: "approval_request",
        requestId: id,
        toolName: edit ? "Write" : "Bash",
        summary: edit ? `Write lesson ${id}` : "Run a shell command",
        editWithinCourse: edit,
      });
    };

    // Before the grant, an edit request reaches the renderer like any other.
    request("edit-1", true);
    await settleUntil(() => events.some((e) => e.type === "approval_request"));
    await conductor.allowCourseEditsForSession("edit-1");
    expect(session.approvals).toEqual([{ id: "edit-1", allow: true }]);

    // After it, edits are answered by the standing grant and never emitted...
    request("edit-2", true);
    await settleUntil(() => session.approvals.length === 2);
    expect(session.approvals[1]).toEqual({ id: "edit-2", allow: true });
    // ...but a command still asks: the grant covers exactly file edits.
    request("bash-1", false);
    await settleUntil(() =>
      events.some((e) => e.type === "approval_request" && e.requestId === "bash-1"),
    );
    expect(session.approvals).toHaveLength(2);
    expect(events.filter((e) => e.type === "approval_request" && e.requestId === "edit-2")).toEqual(
      [],
    );

    // The transcript keeps the whole story: request, grant, covered approval.
    const sessionsDir = path.join(userData, "courses", COURSE_ID, "sessions");
    const [transcriptFile] = fs.readdirSync(sessionsDir);
    if (transcriptFile === undefined) throw new Error("no transcript written");
    const raw = fs.readFileSync(path.join(sessionsDir, transcriptFile), "utf8");
    expect(raw).toContain("allowed course-folder file edits for the rest of this session");
    expect(raw).toContain("Covered by the session's file-edit grant.");
  });

  it("refuses to ask again while a turn is still running", async () => {
    const { conductor, courseDir, agent } = harness({});
    await conductor.start({ courseDir, currentModuleId: null, onboarding: true });
    const session = agent.sessions[0];
    if (session === undefined) throw new Error("no session started");

    session.busy = true;
    await expect(conductor.retry()).rejects.toThrow(/already in progress/);
    expect(session.sent).toHaveLength(1);
  });

  it("uses doctor to verify an explicit wrap instead of trusting tutor prose", async () => {
    const { conductor, courseDir, agent, events } = harness({
      inspections: [inspection(), inspection()],
    });
    await conductor.start({ courseDir, currentModuleId: "02-vectors", onboarding: false });
    agent.sessions[0]?.emit({ type: "turn_complete" });
    await settleUntil(() => events.some((event) => event.type === "turn_complete"));

    await conductor.end();
    expect(agent.sessions[0]?.sent.at(-1)).toBe("end session");
    agent.sessions[0]?.emit({ type: "message_delta", delta: "All saved." });
    agent.sessions[0]?.emit({ type: "turn_complete" });

    await settleUntil(() => agent.sessions[0]?.ended === true);
    expect((await conductor.current(courseDir)).lifecycle).toBe("closed");
  });

  it("keeps a failed doctor close recoverable", async () => {
    const { conductor, courseDir, agent, events } = harness({
      inspections: [inspection(), inspection(true)],
    });
    await conductor.start({ courseDir, currentModuleId: "02-vectors", onboarding: false });
    agent.sessions[0]?.emit({ type: "turn_complete" });
    await settleUntil(() => events.some((event) => event.type === "turn_complete"));
    await conductor.end();
    agent.sessions[0]?.emit({ type: "turn_complete" });

    await settleUntil(() => agent.sessions[0]?.ended === true);
    await expect(conductor.current(courseDir)).resolves.toMatchObject({
      lifecycle: "close-failed",
      detail: "dirty",
    });
  });

  it("refuses to send or End while a turn is in flight, persisting nothing", async () => {
    const { conductor, courseDir, agent } = harness({});
    await conductor.start({ courseDir, currentModuleId: "02-vectors", onboarding: false });
    const session = agent.sessions[0];
    if (session === undefined) throw new Error("no session started");
    session.busy = true;

    const before = (await conductor.current(courseDir)).messages.length;
    await expect(conductor.send("too eager")).rejects.toThrow(/already in progress/);
    expect((await conductor.current(courseDir)).messages.length).toBe(before);
    expect(session.sent).toHaveLength(1); // opener only

    await expect(conductor.end()).rejects.toThrow(/still working/);
    // The refusal must leave the lifecycle untouched: still open, not wrapping.
    expect((await conductor.current(courseDir)).lifecycle).toBe("open");
    session.busy = false;
    session.emit({ type: "turn_complete" });
    await expect(conductor.send("now it lands")).resolves.toBeUndefined();
  });

  it("steers a busy steerable session and persists the message only after acceptance", async () => {
    const { conductor, courseDir, agent } = harness({});
    await conductor.start({ courseDir, currentModuleId: "02-vectors", onboarding: false });
    const session = agent.sessions[0];
    if (session === undefined) throw new Error("no session started");
    session.busy = true;
    session.steerable = true;
    expect((await conductor.current(courseDir)).steerable).toBe(true);

    const before = (await conductor.current(courseDir)).messages.length;
    session.refuseSteer = new Error("expected turn is no longer active");
    await expect(conductor.send("too late for that turn")).rejects.toThrow(/no longer active/);
    expect((await conductor.current(courseDir)).messages.length).toBe(before);
    expect(session.steered).toEqual([]);

    session.refuseSteer = null;
    await expect(conductor.send("also cover the dot product")).resolves.toBeUndefined();
    expect(session.steered).toEqual(["also cover the dot product"]);
    expect(session.sent).toHaveLength(1); // the opener; a steer starts no turn
    expect((await conductor.current(courseDir)).messages.at(-1)).toMatchObject({
      role: "learner",
      content: "also cover the dot product",
    });
    expect((await conductor.current(courseDir)).turnInProgress).toBe(true);
  });

  it("waits for an in-flight turn before releasing the provider for update handoff", async () => {
    const { conductor, courseDir, agent } = harness({});
    await conductor.start({ courseDir, currentModuleId: "02-vectors", onboarding: false });
    const session = agent.sessions[0];
    if (session === undefined) throw new Error("no session started");
    session.busy = true;

    let prepared = false;
    const preparation = conductor.prepareForUpdate().then(() => {
      prepared = true;
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(prepared).toBe(false);
    expect(session.ended).toBe(false);

    session.busy = false;
    session.emit({ type: "turn_complete" });
    await preparation;
    expect(session.ended).toBe(true);
    await expect(conductor.current(courseDir)).resolves.toMatchObject({ lifecycle: "recoverable" });
  });

  it("keeps an errored wrap turn recoverable instead of sealing on a clean doctor", async () => {
    const { conductor, courseDir, agent, events } = harness({
      inspections: [inspection(), inspection()],
    });
    await conductor.start({ courseDir, currentModuleId: "02-vectors", onboarding: false });
    agent.sessions[0]?.emit({ type: "turn_complete" });
    await settleUntil(() => events.some((event) => event.type === "turn_complete"));

    await conductor.end();
    // The wrap turn dies (rate limit) before running the ritual.
    agent.sessions[0]?.emit({
      type: "error",
      code: "rate-limit",
      message: "limit reached",
    });
    agent.sessions[0]?.emit({ type: "turn_complete" });

    await settleUntil(() => agent.sessions[0]?.ended === true);
    await expect(conductor.current(courseDir)).resolves.toMatchObject({
      lifecycle: "close-failed",
      detail: expect.stringContaining("did not complete"),
    });
  });

  it("serializes rapid starts: one live session, no interleaved transcripts", async () => {
    const { conductor, courseDir, agent } = harness({
      inspections: [inspection(), inspection(), inspection(), inspection()],
    });

    const [first, second] = await Promise.all([
      conductor.start({ courseDir, currentModuleId: "02-vectors", onboarding: false }),
      conductor.start({ courseDir, currentModuleId: "02-vectors", onboarding: false }),
    ]);
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });

    // The first session was ended before the second began; only the second
    // is live, and the course's transcript state is still readable (no
    // sequence corruption from two writers).
    expect(agent.sessions).toHaveLength(2);
    expect(agent.sessions[0]?.ended).toBe(true);
    expect(agent.sessions[1]?.ended).toBe(false);
    const snapshot = await conductor.current(courseDir);
    expect(snapshot.lifecycle === "open" || snapshot.lifecycle === "recovering").toBe(true);
  });

  it("recovers an abandoned transcript, verifies it, then opens a fresh logical session", async () => {
    const courseDir = temporaryRoot();
    const userData = temporaryRoot();
    const agent = new FakeAgent();
    const first = harness({ courseDir, userData, agent, inspections: [inspection()] });
    await first.conductor.start({ courseDir, currentModuleId: "02-vectors", onboarding: false });
    agent.sessions[0]?.emit({ type: "turn_complete" });
    await first.conductor.send("I was halfway through chunking");
    agent.sessions[0]?.emit({ type: "message_delta", delta: "Let's continue" });
    agent.sessions[0]?.emit({ type: "turn_complete" });
    await first.conductor.abandon();
    await settleUntil(
      async () => (await first.conductor.current(courseDir)).lifecycle === "recoverable",
    );

    const second = harness({
      courseDir,
      userData,
      agent,
      inspections: [inspection(), inspection(), inspection()],
    });
    await second.conductor.start({
      courseDir,
      currentModuleId: "02-vectors",
      onboarding: false,
    });
    expect(agent.sessions[1]?.sent[0]).toContain("Recovery-first close");
    expect(agent.sessions[1]?.sent[0]).toContain("I was halfway through chunking");

    agent.sessions[1]?.emit({ type: "turn_complete" });
    await settleUntil(() => agent.sessions[2]?.sent.length === 1);
    expect(agent.sessions[2]?.sent[0]).toMatch(/start session$/);
    expect(second.snapshots.at(-1)).toMatchObject({
      lifecycle: "open",
      messages: [],
      turnInProgress: true,
    });
    expect((await second.conductor.current(courseDir)).lifecycle).toBe("open");
  });
});

describe("remembered session controls (ADR-040)", () => {
  it.each([null, "medium"])(
    "forgets an incompatible saved effort after a model change resolves to %s",
    async (effort) => {
      const memory = new FileControlMemory(temporaryRoot());
      const { conductor, courseDir, agent } = harness({ controlMemory: memory });
      await conductor.start({ courseDir, currentModuleId: null, onboarding: false });
      await conductor.applySessionControls({ effort: "ultra" });
      expect(memory.read(COURSE_ID, "claude").effort).toBe("ultra");
      const session = agent.sessions[0]!;
      session.applyControls = async () => ({
        ...session.controls,
        pending: { model: "narrow", effort },
      });
      await conductor.applySessionControls({ model: "narrow" });
      expect(memory.read(COURSE_ID, "claude")).toEqual({ model: "narrow" });
    },
  );

  it("remembers explicit choices per course and restores them before the opener", async () => {
    const userData = temporaryRoot();
    const memory = new FileControlMemory(userData);
    const first = harness({ userData, controlMemory: memory });
    await first.conductor.start({
      courseDir: first.courseDir,
      currentModuleId: null,
      onboarding: false,
    });
    await first.conductor.applySessionControls({ autonomy: "bypass", effort: "high" });
    expect(memory.read(COURSE_ID, "claude")).toEqual({ autonomy: "bypass", effort: "high" });
    // A choice the learner made in this session is theirs, live — not "remembered".
    expect((await first.conductor.sessionControls())?.remembered).toBeUndefined();
    // Back to the provider default forgets the key rather than storing it.
    await first.conductor.applySessionControls({ effort: null });
    expect(memory.read(COURSE_ID, "claude")).toEqual({ autonomy: "bypass" });
    await first.conductor.abandon();

    // The next runtime for this course — here the recovery of the abandoned
    // one, an app-initiated open — re-applies the choice before its opener.
    const second = harness({ courseDir: first.courseDir, userData, controlMemory: memory });
    await second.conductor.start({
      courseDir: first.courseDir,
      currentModuleId: null,
      onboarding: false,
    });
    const session = second.agent.sessions[0];
    if (session === undefined) throw new Error("no session started");
    expect(session.applied).toEqual([{ autonomy: "bypass" }]);
    expect(session.sent).toHaveLength(1);
    expect(session.controls.current.autonomy).toBe("bypass");
    expect((await second.conductor.sessionControls())?.remembered).toEqual(["autonomy"]);

    // Changing it makes it the learner's live choice again, and updates memory.
    const changed = await second.conductor.applySessionControls({ autonomy: "default" });
    expect(changed?.remembered).toBeUndefined();
    expect(memory.read(COURSE_ID, "claude")).toEqual({ autonomy: "default" });
  });

  it("keeps the memory per course and per provider", () => {
    const memory = new FileControlMemory(temporaryRoot());
    memory.remember(COURSE_ID, "codex", { access: "danger-full-access" });
    expect(memory.read(COURSE_ID, "claude")).toEqual({});
    expect(memory.read("other-course", "codex")).toEqual({});
    expect(memory.read(COURSE_ID, "codex")).toEqual({ access: "danger-full-access" });
    memory.remember(COURSE_ID, "codex", { access: "workspace-write" });
    expect(memory.read(COURSE_ID, "codex")).toEqual({ access: "workspace-write" });
  });

  it("still opens the session when the provider refuses the remembered controls", async () => {
    const userData = temporaryRoot();
    const memory = new FileControlMemory(userData);
    const agent = new FakeAgent();
    agent.refuseControls = true;
    memory.remember(COURSE_ID, "claude", { model: "sonnet" });
    const { conductor, courseDir } = harness({ userData, agent, controlMemory: memory });
    await expect(
      conductor.start({ courseDir, currentModuleId: null, onboarding: false }),
    ).resolves.toEqual({ ok: true });
    expect(agent.sessions[0]?.applied).toEqual([{ model: "sonnet" }]);
    expect(agent.sessions[0]?.sent[0]).toMatch(/start session$/);
    // Nothing restored, so nothing is labelled as remembered.
    expect((await conductor.sessionControls())?.remembered).toBeUndefined();
  });
});
