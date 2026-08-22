/* The one deep boundary around a logical study session. It assembles facts,
   checkpoints normalized evidence, recovers abandoned work before a new open,
   and lets code (doctor) decide whether a close landed. The conversation
   itself remains a transparent pipe (ADR-003/005/009/011). */

import type { StartSeminarReply } from "../../shared/ipc";
import type {
  AgentEvent,
  AgentSession,
  SessionControlPatch,
  SessionControls,
  TutorAgent,
} from "../../shared/seminar";
import type { RunChecksReply, SeminarSnapshot } from "../../shared/session";
import { buildSessionOpener, type SessionOpenerFacts } from "../agent/opener";
import { getOrCreateCourseIdentity, readCourseIdentity } from "../course-identity";
import type {
  CourseContextInspection,
  EngineScriptService,
  RunChecksResult,
} from "../scripts/engine-script-service";
import {
  FileTranscriptStore,
  type TranscriptEntryInput,
  type TranscriptSnapshot,
} from "./transcript-store";

type RuntimeFlow = "normal" | "recovery" | "wrapping";

interface ActiveRuntime {
  id: number;
  courseDir: string;
  currentModuleId: string | null;
  onboarding: boolean;
  flow: RuntimeFlow;
  session: AgentSession;
  transcript: FileTranscriptStore;
  suppressEndedPersistence: boolean;
  suppressEndedUi: boolean;
  wrapFinishing: boolean;
  /** The wrap turn errored or was stopped by the learner: the ritual did not
   *  complete, so a clean doctor run must NOT seal the evidence (ADR-009). */
  wrapTurnFailed: boolean;
  /** toolName per pending approval request, so the journal records the real
   *  tool rather than a placeholder. */
  approvalToolNames: Map<string, string>;
  /** The last request delivered to the tutor, kept verbatim with its kind so a
   *  turn that completed without answering can be asked again as the same kind
   *  of message it originally was. */
  lastRequest: { kind: "operator" | "learner"; text: string } | null;
  /** The learner granted file edits inside the course folder for the rest of
   *  THIS runtime. Never persisted, never provider config (ADR-004): a fresh
   *  session starts back at ask-every-time. */
  autoAllowCourseEdits: boolean;
  /** Update handoff waits here while a learner-approved provider turn finishes.
   * Resolved by turn completion or process end; never persisted. */
  idleWaiters: Set<() => void>;
  /** The pump's own completion — the only truthful "all trailing events are
   *  persisted" signal. Replacement and abandon must await it before another
   *  store instance may touch the same JSONL. */
  pump: Promise<void>;
}

export interface StartConductedSessionOptions {
  courseDir: string;
  currentModuleId: string | null;
  onboarding: boolean;
}

export interface SessionConductorOptions {
  /** Resolved only when a fresh provider runtime starts. Selection changes
   * never replace the live AgentSession (ADR-021). */
  createAgent: () => TutorAgent;
  scripts: Pick<EngineScriptService, "inspectContext" | "runChecks">;
  userDataPath: string;
  emitAgentEvent: (event: AgentEvent) => void;
  emitSnapshot: (snapshot: SeminarSnapshot) => void;
  clock?: () => Date;
  createId?: () => string;
}

export class SessionConductor {
  private active: ActiveRuntime | null = null;
  private nextRuntimeId = 1;
  private readonly clock: () => Date;
  /** Serializes start/end/abandon and wrap follow-ons. Two rapid starts (or a
   *  start racing an abandon) must never observe each other's half-installed
   *  runtime — that is how two store instances end up writing one JSONL. */
  private lifecycleQueue: Promise<unknown> = Promise.resolve();
  /** The wrap's follow-on open (recovery → fresh session), cancellable by any
   *  abandon/start that lands before it runs. */
  private followOn: (() => Promise<void>) | null = null;
  private followOnEpoch = 0;

  constructor(private readonly options: SessionConductorOptions) {
    this.clock = options.clock ?? (() => new Date());
  }

  async current(courseDir: string): Promise<SeminarSnapshot> {
    const root = this.resolveRoot(courseDir);
    if (this.active?.courseDir === root) return await this.snapshotFor(this.active.transcript);

    // A read path never mints identity or touches the course folder.
    const identity = await readCourseIdentity(root);
    if (identity === null) return closedSnapshot();
    const transcript = await FileTranscriptStore.openActive({
      userDataPath: this.options.userDataPath,
      courseId: identity.courseId,
      clock: this.clock,
    });
    return transcript === null ? closedSnapshot() : await this.snapshotFor(transcript);
  }

  async start(options: StartConductedSessionOptions): Promise<StartSeminarReply> {
    return await this.serializeLifecycle(() => this.startLocked(options));
  }

  private async startLocked(options: StartConductedSessionOptions): Promise<StartSeminarReply> {
    const courseDir = this.resolveRoot(options.courseDir);
    await this.abandonLocked();

    try {
      const identity = await getOrCreateCourseIdentity(courseDir, this.identityOptions());
      const previous = await FileTranscriptStore.openActive({
        userDataPath: this.options.userDataPath,
        courseId: identity.courseId,
        clock: this.clock,
      });
      if (previous !== null) {
        await this.beginRecovery(previous, { ...options, courseDir });
      } else {
        await this.beginNormal(identity.courseId, { ...options, courseDir });
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: "unavailable",
        detail: error instanceof Error ? error.message : "The tutor could not start.",
      };
    }
  }

  async send(message: string): Promise<void> {
    const active = this.requireActive("open");
    // Busy check BEFORE persisting: the adapter would refuse the send, and the
    // durable transcript must never record a message the tutor never received.
    if (active.session.busy) throw new Error("A tutor turn is already in progress.");
    await active.transcript.append({ kind: "learner", text: message });
    active.lastRequest = { kind: "learner", text: message };
    active.session.send(message);
  }

  /** What the learner may change about the running session. A closed session
   *  offers nothing rather than failing: the surface just shows no controls. */
  async sessionControls(): Promise<SessionControls | null> {
    const active = this.active;
    if (active === null) return null;
    try {
      return await active.session.describeControls();
    } catch {
      return null;
    }
  }

  /** Apply a learner-initiated session change (ADR-018). Session-scoped: it
   *  dies with the runtime and never reaches the learner's own config. */
  async applySessionControls(patch: SessionControlPatch): Promise<SessionControls | null> {
    const active = this.requireActive();
    return await active.session.applyControls(patch);
  }

  /** Ask the last request again, unchanged. A provider turn can complete having
   *  produced no answer at all (observed live); the learner's only honest
   *  recourse is to repeat the request, and the transcript records that it was
   *  repeated rather than pretending a new one was made. */
  async retry(): Promise<void> {
    const active = this.requireActive("open");
    if (active.session.busy) throw new Error("A tutor turn is already in progress.");
    const request = active.lastRequest;
    if (request === null) throw new Error("There is nothing to ask again.");
    await active.transcript.append({ kind: request.kind, text: request.text });
    active.session.send(request.text);
  }

  async respondToApproval(requestId: string, allow: boolean, reason?: string): Promise<void> {
    const active = this.requireActive();
    await active.transcript.append({
      kind: "approval",
      requestId,
      toolName: active.approvalToolNames.get(requestId) ?? "unknown",
      summary: "Learner response to a tutor permission request",
      outcome: allow ? "allowed" : "denied",
      ...(reason === undefined ? {} : { reason }),
    });
    active.approvalToolNames.delete(requestId);
    active.session.respondToApproval(requestId, allow, reason);
  }

  /** The learner granted course-folder file edits for the rest of this
   *  session, answering the pending request in the same gesture. The grant is
   *  runtime state, not configuration: it dies with the session and the
   *  transcript records both the grant and every approval it later covers. */
  async allowCourseEditsForSession(requestId: string): Promise<void> {
    const active = this.requireActive();
    active.autoAllowCourseEdits = true;
    await active.transcript.append({
      kind: "approval",
      requestId,
      toolName: active.approvalToolNames.get(requestId) ?? "unknown",
      summary: "Learner response to a tutor permission request",
      outcome: "allowed",
      reason: "The learner also allowed course-folder file edits for the rest of this session.",
    });
    active.approvalToolNames.delete(requestId);
    active.session.respondToApproval(requestId, true);
  }

  async interrupt(): Promise<void> {
    const active = this.active;
    if (active === null) return;
    // Stopping the wrap turn aborts the close ritual mid-flight; the session
    // must stay recoverable rather than letting a clean doctor seal it.
    if (active.flow !== "normal") active.wrapTurnFailed = true;
    await active.session.interrupt();
  }

  /** Explicit End uses the same wrap path recovery uses; it never merely kills
   *  the provider process. */
  async end(): Promise<void> {
    await this.serializeLifecycle(async () => {
      const active = this.requireActive("open");
      // Refuse cleanly BEFORE mutating lifecycle state: sending "end session"
      // mid-turn would throw after the transcript was already marked wrapping,
      // locking the learner out and letting the in-flight turn trigger a wrap
      // verdict on a ritual the tutor never ran.
      if (active.session.busy) {
        throw new Error("The tutor is still working. Wait for the turn to finish, then end.");
      }
      active.flow = "wrapping";
      await active.transcript.markLifecycle("wrapping");
      await active.transcript.append({ kind: "operator", text: "end session" });
      this.options.emitSnapshot(await this.snapshotFor(active.transcript));
      active.session.send("end session");
    });
  }

  /** App/window shutdown: release the provider only. The logical transcript
   *  deliberately stays open so next start recovers it (ADR-009). */
  async abandon(): Promise<void> {
    await this.serializeLifecycle(() => this.abandonLocked());
  }

  /** Learner-approved update handoff: do not interrupt a provider turn. Wait
   * for it to settle, then release the provider and drain every queued event
   * through the same recoverable-session path as ordinary app shutdown. */
  async prepareForUpdate(): Promise<void> {
    await this.serializeLifecycle(async () => {
      const active = this.active;
      if (active === null) return;
      if (active.session.busy) {
        await new Promise<void>((resolve) => active.idleWaiters.add(resolve));
      }
      if (this.active?.id === active.id) await this.abandonLocked();
    });
  }

  private async abandonLocked(): Promise<void> {
    this.followOn = null;
    this.followOnEpoch += 1;
    const active = this.active;
    if (active === null) return;
    active.suppressEndedUi = true;
    await active.session.end();
    // end() resolves when the adapter has QUEUED its trailing events; only the
    // pump's completion proves they are persisted. A second store instance on
    // the same JSONL before that point interleaves sequence numbers and
    // corrupts the chain for every later open.
    await active.pump;
    if (this.active?.id === active.id) this.active = null;
  }

  private serializeLifecycle<T>(task: () => Promise<T>): Promise<T> {
    const run = this.lifecycleQueue.then(task, task);
    this.lifecycleQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async runChecks(courseDir: string, moduleId: string): Promise<RunChecksReply> {
    return toCheckReply(await this.options.scripts.runChecks({ courseDir, moduleId }));
  }

  private async beginNormal(
    courseId: string,
    options: StartConductedSessionOptions,
  ): Promise<void> {
    const transcript = await FileTranscriptStore.create({
      userDataPath: this.options.userDataPath,
      courseId,
      clock: this.clock,
      ...(this.options.createId === undefined ? {} : { createId: this.options.createId }),
    });
    const inspection = await this.options.scripts.inspectContext(options);
    const opener = buildSessionOpener({
      ...openerFacts(inspection, this.clock()),
      learnerOpener: options.onboarding ? "new course" : "start session",
    });

    try {
      await this.startRuntime(options, transcript, "normal", opener);
    } catch (error) {
      await transcript.markLifecycle(
        "closed",
        "Tutor process never accepted the opening message; no course work occurred.",
      );
      throw error;
    }
  }

  private async beginRecovery(
    transcript: FileTranscriptStore,
    options: StartConductedSessionOptions,
  ): Promise<void> {
    const previous = await transcript.snapshot();
    await transcript.markLifecycle("wrapping");
    const inspection = await this.options.scripts.inspectContext(options);
    const opener = buildSessionOpener({
      ...openerFacts(inspection, this.clock()),
      learnerOpener: recoveryRequest(previous),
    });

    try {
      await this.startRuntime(options, transcript, "recovery", opener);
    } catch (error) {
      await transcript.markLifecycle("close_failed", "The recovery tutor could not start.");
      throw error;
    }
  }

  private async startRuntime(
    options: StartConductedSessionOptions,
    transcript: FileTranscriptStore,
    flow: RuntimeFlow,
    opener: string,
  ): Promise<void> {
    const session = this.options.createAgent().startSession({ courseDir: options.courseDir });
    const active: ActiveRuntime = {
      id: this.nextRuntimeId++,
      courseDir: options.courseDir,
      currentModuleId: options.currentModuleId,
      onboarding: options.onboarding,
      flow,
      session,
      transcript,
      suppressEndedPersistence: false,
      suppressEndedUi: false,
      wrapFinishing: false,
      wrapTurnFailed: false,
      approvalToolNames: new Map(),
      lastRequest: { kind: "operator", text: opener },
      autoAllowCourseEdits: false,
      idleWaiters: new Set(),
      pump: Promise.resolve(),
    };
    this.active = active;
    active.pump = this.pump(active);
    try {
      await transcript.append({ kind: "operator", text: opener });
      session.send(opener);
      // send() accepted the hidden opener synchronously. Report that turn as
      // busy even when a test double or provider has not updated its getter.
      this.options.emitSnapshot(await this.snapshotFor(transcript, true));
    } catch (error) {
      // A half-started runtime must not stay registered with a live provider
      // process behind it (the caller marks the transcript's lifecycle).
      if (this.active.id === active.id) this.active = null;
      void session.end();
      throw error;
    }
  }

  private async pump(active: ActiveRuntime): Promise<void> {
    try {
      for await (const event of active.session.events) {
        if (this.active?.id !== active.id) return;
        // Once doctor has verified the close, the JSONL artifact is immutable.
        // Provider adapters may still drain a final usage/error/end frame while
        // their process exits; those are runtime cleanup, not logical-session
        // evidence, and must not race the fresh session opened after recovery.
        if (!active.suppressEndedPersistence) {
          const entry = transcriptEntry(event);
          if (entry !== null) await active.transcript.append(entry);
        }

        if (event.type === "approval_request") {
          // A granted course edit is answered here and never shown: the pump
          // already persisted the request above, so the pair of entries reads
          // "requested → allowed (standing grant)" — evidence, not silence.
          if (event.editWithinCourse && active.autoAllowCourseEdits) {
            if (!active.suppressEndedPersistence) {
              await active.transcript.append({
                kind: "approval",
                requestId: event.requestId,
                toolName: event.toolName,
                summary: event.summary,
                outcome: "allowed",
                reason: "Covered by the session's file-edit grant.",
              });
            }
            active.session.respondToApproval(event.requestId, true);
            continue;
          }
          active.approvalToolNames.set(event.requestId, event.toolName);
        }
        // A wrap turn that errored did NOT run the ritual; a clean doctor
        // verdict on it must not seal the evidence (ADR-009).
        if (event.type === "error" && active.flow !== "normal") {
          active.wrapTurnFailed = true;
        }

        if (!(event.type === "session_ended" && active.suppressEndedUi)) {
          this.options.emitAgentEvent(event);
        }

        if (event.type === "turn_complete") {
          this.resolveIdleWaiters(active);
          if (active.flow !== "normal" && !active.wrapFinishing) {
            active.wrapFinishing = true;
            await this.finishWrap(active);
          }
        }
        if (event.type === "session_ended") {
          this.resolveIdleWaiters(active);
          this.runtimeEnded(active);
          return;
        }
      }
    } catch (error) {
      if (this.active?.id !== active.id) return;
      this.resolveIdleWaiters(active);
      // Whatever broke the loop (stream death or an append failure), the
      // provider must not keep streaming into an unconsumed queue.
      void active.session.end();
      const snapshot = await active.transcript.snapshot();
      if (snapshot.lifecycle === "closed") {
        this.runtimeEnded(active);
        return;
      }
      try {
        await active.transcript.markLifecycle(
          "close_failed",
          error instanceof Error ? error.message : "The tutor process stopped.",
        );
      } finally {
        this.active = null;
        this.options.emitSnapshot(await this.snapshotFor(active.transcript));
      }
    }
  }

  private async finishWrap(active: ActiveRuntime): Promise<void> {
    // The adapter will emit session_ended after end(). Persist the logical end
    // before closing the transcript, then suppress that trailing duplicate.
    const sealTurn = async (): Promise<void> => {
      await active.transcript.append({ kind: "agent_ended", reason: "ended" });
      active.suppressEndedPersistence = true;
    };

    // An errored/stopped wrap turn never ran the ritual — doctor cannot see
    // "the journal entry was never written" for a conversation-only session,
    // so the trigger itself must refuse to seal (ADR-009).
    if (active.wrapTurnFailed) {
      await sealTurn();
      await active.transcript.markLifecycle(
        "close_failed",
        "The closing turn did not complete; the session stays recoverable.",
      );
      active.suppressEndedUi = false;
      this.followOn = null;
      this.options.emitSnapshot(await this.snapshotFor(active.transcript));
      void active.session.end();
      return;
    }

    const inspection = await this.options.scripts.inspectContext({
      courseDir: active.courseDir,
      currentModuleId: active.currentModuleId,
    });
    const verdict = closeVerdict(inspection);

    await sealTurn();
    if (!verdict.clean) {
      await active.transcript.markLifecycle("close_failed", verdict.detail);
      active.suppressEndedUi = false;
      this.followOn = null;
    } else {
      await active.transcript.markLifecycle("closed");
      // suppressEndedUi already true means an abandon is draining this
      // runtime — never install a follow-on that would open a session the
      // learner is walking away from.
      const abandoning = active.suppressEndedUi;
      active.suppressEndedUi = abandoning || active.flow === "recovery";
      this.followOn =
        active.flow === "recovery" && !abandoning
          ? async () => {
              const identity = await getOrCreateCourseIdentity(
                active.courseDir,
                this.identityOptions(),
              );
              await this.beginNormal(identity.courseId, {
                courseDir: active.courseDir,
                currentModuleId: active.currentModuleId,
                onboarding: active.onboarding,
              });
            }
          : null;
    }
    this.options.emitSnapshot(await this.snapshotFor(active.transcript));
    void active.session.end();
  }

  private runtimeEnded(active: ActiveRuntime): void {
    if (this.active?.id !== active.id) return;
    this.resolveIdleWaiters(active);
    this.active = null;
    const follow = this.followOn;
    this.followOn = null;
    const epoch = this.followOnEpoch;

    // The follow-on open runs OUTSIDE the pump, through the same lifecycle
    // queue as start/abandon (the pump must stay awaitable by abandonLocked
    // without deadlock). An abandon or start that lands first bumps the epoch
    // and cancels it.
    void this.serializeLifecycle(async () => {
      if (epoch !== this.followOnEpoch) return;
      if (follow === null) {
        this.options.emitSnapshot(await this.snapshotFor(active.transcript));
        return;
      }
      try {
        await follow();
      } catch {
        this.options.emitSnapshot(await this.snapshotFor(active.transcript));
      }
    });
  }

  private resolveIdleWaiters(active: ActiveRuntime): void {
    for (const resolve of active.idleWaiters) resolve();
    active.idleWaiters.clear();
  }

  private async snapshotFor(
    transcript: FileTranscriptStore,
    knownTurnInProgress?: boolean,
  ): Promise<SeminarSnapshot> {
    const snapshot = await transcript.snapshot();
    const runtime =
      this.active?.transcript.sessionId === snapshot.header.sessionId ? this.active : null;
    const latestLifecycle = [...snapshot.entries]
      .reverse()
      .find((entry) => entry.kind === "lifecycle");
    return {
      lifecycle:
        snapshot.lifecycle === "close_failed"
          ? "close-failed"
          : snapshot.lifecycle === "closed"
            ? "closed"
            : runtime?.flow === "recovery"
              ? "recovering"
              : runtime?.flow === "wrapping"
                ? "wrapping"
                : runtime?.flow === "normal"
                  ? "open"
                  : snapshot.active
                    ? "recoverable"
                    : "closed",
      sessionId: snapshot.header.sessionId,
      messages: snapshot.messages,
      totalCostUsd: latestUsage(snapshot),
      turnInProgress: knownTurnInProgress ?? runtime?.session.busy ?? false,
      ...(latestLifecycle?.kind === "lifecycle" && latestLifecycle.detail !== undefined
        ? { detail: latestLifecycle.detail }
        : {}),
    };
  }

  private requireActive(requiredFlow?: "open"): ActiveRuntime {
    const active = this.active;
    if (active === null) throw new Error("No tutor session is open.");
    if (requiredFlow === "open" && active.flow !== "normal") {
      throw new Error("The previous session must finish closing first.");
    }
    return active;
  }

  private identityOptions(): { createId: () => string } | undefined {
    return this.options.createId === undefined ? undefined : { createId: this.options.createId };
  }

  private resolveRoot(courseDir: string): string {
    return courseDir.replace(/[\\/]$/, "");
  }
}

function openerFacts(inspection: CourseContextInspection, observedAt: Date): SessionOpenerFacts {
  return {
    currentModuleId: inspection.currentModuleId,
    doctorReport: inspection.doctor.available
      ? inspection.doctor.value
          .map((result) => `${result.level.toUpperCase()}: ${result.message}`)
          .join("\n")
      : `Unavailable: ${inspection.doctor.reason}`,
    dueItems: inspection.due.available
      ? inspection.due.value.trim()
      : `Unavailable: ${inspection.due.reason}`,
    journalTail: inspection.journalTail.available
      ? inspection.journalTail.value
      : `Unavailable: ${inspection.journalTail.reason}`,
    observedAt: observedAt.toISOString(),
  };
}

/** Tail-biased cap on inlined recovery evidence. A session abandoned hours in
 *  must still produce an opener a model can accept; the freshest exchanges
 *  carry the close-relevant facts (what was covered LAST). */
const RECOVERY_EVIDENCE_BUDGET = 24_000;

function recoveryRequest(snapshot: TranscriptSnapshot): string {
  const rendered = snapshot.messages.map(
    (message) => `${message.role === "learner" ? "Learner" : "Tutor"}: ${message.content}`,
  );
  const kept: string[] = [];
  let budget = RECOVERY_EVIDENCE_BUDGET;
  for (let index = rendered.length - 1; index >= 0; index -= 1) {
    const entry = rendered[index];
    if (entry === undefined) continue;
    if (entry.length > budget) {
      if (kept.length === 0) kept.unshift(`…${entry.slice(entry.length - budget)}`);
      break;
    }
    kept.unshift(entry);
    budget -= entry.length;
  }
  const omitted = rendered.length - kept.length;
  const evidence = [
    ...(omitted > 0
      ? [`(${String(omitted)} earlier message${omitted === 1 ? "" : "s"} omitted for length.)`]
      : []),
    ...kept,
  ].join("\n\n");
  return [
    "[Recovery-first close]",
    "The prior desktop-app session ended without a doctor-verified close.",
    "Using the transcript evidence below and the current course files, finish that prior session by following the course protocol's own recovery and session-close steps. Do not open a new recall session yet.",
    "",
    evidence === "" ? "(The prior session contained no visible conversation.)" : evidence,
  ].join("\n");
}

function closeVerdict(inspection: CourseContextInspection): { clean: boolean; detail: string } {
  if (!inspection.doctor.available) {
    return { clean: false, detail: inspection.doctor.reason };
  }
  const failures = inspection.doctor.value.filter((result) => result.level === "fail");
  return failures.length === 0
    ? { clean: true, detail: "" }
    : { clean: false, detail: failures.map((result) => result.message).join("\n") };
}

function transcriptEntry(event: AgentEvent): TranscriptEntryInput | null {
  if (event.type === "message_delta") return { kind: "tutor_delta", delta: event.delta };
  if (event.type === "tool_activity") {
    return {
      kind: "tool_activity",
      name: event.name,
      summary: event.summary,
      ...(event.detail === undefined ? {} : { detail: event.detail }),
    };
  }
  if (event.type === "approval_request") {
    return {
      kind: "approval",
      requestId: event.requestId,
      toolName: event.toolName,
      summary: event.summary,
      outcome: "requested",
    };
  }
  if (event.type === "usage_update") {
    return { kind: "usage", totalCostUsd: event.totalCostUsd };
  }
  // Rolling subscription limits are transient account state, not course or
  // session evidence. The renderer receives them live; transcripts do not.
  if (event.type === "limit_warning") return null;
  if (event.type === "turn_complete") return { kind: "turn_complete" };
  if (event.type === "session_ended") return { kind: "agent_ended", reason: event.reason };
  return {
    kind: "tool_activity",
    name: "error",
    summary: event.message,
  };
}

function latestUsage(snapshot: TranscriptSnapshot): number {
  for (let index = snapshot.entries.length - 1; index >= 0; index -= 1) {
    const entry = snapshot.entries[index];
    if (entry?.kind === "usage") return entry.totalCostUsd;
  }
  return 0;
}

function closedSnapshot(): SeminarSnapshot {
  return {
    lifecycle: "closed",
    sessionId: null,
    messages: [],
    totalCostUsd: 0,
    turnInProgress: false,
  };
}

function toCheckReply(result: RunChecksResult): RunChecksReply {
  if ("outcome" in result) return { ok: true, result };
  if (result.busy) return { ok: false, reason: "busy", detail: result.error };
  return {
    ok: false,
    reason: result.error === "bad module id" ? "bad-module" : "error",
    detail: result.error,
  };
}
