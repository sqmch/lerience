import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AsyncQueue } from "../src/main/agent/async-queue";
import type { CourseContextInspection } from "../src/main/scripts/engine-script-service";
import { SessionConductor } from "../src/main/session/conductor";
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
const COURSE_ID = "123e4567-e89b-42d3-a456-426614174000";
let sessionIdCounter = 1;

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-conductor-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

class FakeSession implements AgentSession {
  readonly queue = new AsyncQueue<AgentEvent>();
  readonly events = this.queue;
  readonly sent: string[] = [];
  readonly approvals: Array<{ id: string; allow: boolean }> = [];
  /** Tests flip this to exercise the conductor's in-flight guards. */
  busy = false;
  ended = false;
  controls: SessionControls = {
    models: [{ id: "sonnet", label: "Sonnet", efforts: ["low", "high"] }],
    autonomy: [{ id: "default", label: "Ask every time", description: "asks" }],
    current: { model: "sonnet", effort: null, autonomy: "default" },
  };

  send(message: string): void {
    this.sent.push(message);
  }

  respondToApproval(requestId: string, allow: boolean): void {
    this.approvals.push({ id: requestId, allow });
  }

  async describeControls(): Promise<SessionControls> {
    return this.controls;
  }

  async applyControls(patch: SessionControlPatch): Promise<SessionControls> {
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

  startSession(options: StartSessionOptions): AgentSession {
    this.starts.push(options);
    const session = new FakeSession();
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
  });
  return { conductor, courseDir, userData, agent, snapshots, events };
}

async function settleUntil(predicate: () => boolean | Promise<boolean>): Promise<void> {
  for (let count = 0; count < 100; count += 1) {
    if (await predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for conductor state");
}

describe("SessionConductor", () => {
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

  it("persists learner input before sending it through the agent pipe", async () => {
    const { conductor, courseDir, agent } = harness({});
    await conductor.start({ courseDir, currentModuleId: null, onboarding: true });
    expect(agent.sessions[0]?.sent[0]).toMatch(/new course$/);

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
    await expect(conductor.send("now it lands")).resolves.toBeUndefined();
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
    expect((await second.conductor.current(courseDir)).lifecycle).toBe("open");
  });
});
