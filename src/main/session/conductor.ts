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
import {
  REMEMBERED_CONTROL_KEYS,
  type ControlMemory,
  type RememberedControlKey,
} from "./control-memory";
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
  courseId: string;
  providerId: TutorAgent["providerId"];
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
  /** Controls this runtime restored from the course's memory (ADR-040) and the
   *  learner has not changed since. Reported so the bar can say "remembered"
   *  rather than presenting a restored grant as a fresh default. */
  remembered: Set<RememberedControlKey>;
  /** Update handoff waits here while a learner-approved provider turn finishes.
   * Resolved by turn completion or process end; never persisted. */
  idleWaiters: Set<() => void>;
  /** Hold provider output until an accepted request has been saved. */
  admission: Promise<void> | null;
  /** Includes a result queued by the adapter but not yet saved by this pump. */
  turnPending: boolean;
  backgroundTasks: NonNullable<SeminarSnapshot["backgroundTasks"]>;
  taskNotice: NonNullable<SeminarSnapshot["taskNotice"]> | null;
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
  /** Per-course memory of the learner's explicit control choices (ADR-040).
   *  Absent means nothing is remembered and every session starts on config. */
  controlMemory?: ControlMemory;
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
    await this.deliver(active, { kind: "learner", text: message }, { allowSteer: true });
  }

  private async deliver(
    active: ActiveRuntime,
    request: { kind: "operator" | "learner"; text: string },
    options: { allowSteer?: boolean; closing?: boolean } = {},
  ): Promise<void> {
    if (active.admission !== null) throw new Error("A tutor turn is already in progress.");
    // Drain the previous result before a new closing request can own it.
    while (!active.session.busy && active.turnPending) {
      await new Promise<void>((resolve) => active.idleWaiters.add(resolve));
      if (this.active !== active) throw new Error("The tutor session changed.");
    }
    if (this.requireActive("open") !== active) throw new Error("The tutor session changed.");
    if (active.admission !== null) throw new Error("A tutor turn is already in progress.");
    const steer = active.session.busy && options.allowSteer && active.session.steerable;
    if (active.session.busy && !steer) {
      throw new Error(
        options.closing
          ? "The tutor is still working. Wait for the turn to finish, then end."
          : "A tutor turn is already in progress.",
      );
    }
    let release!: () => void;
    active.admission = new Promise<void>((resolve) => {
      release = resolve;
    });
    let accepted = false;
    try {
      // Admission is synchronous for new turns. No persistence await can let
      // an automatic continuation win after a learner entry was written.
      if (steer) await active.session.steer(request.text);
      else active.session.send(request.text);
      accepted = true;
      active.turnPending = true;
      if (!steer) active.lastRequest = request;
      if (options.closing) {
        active.flow = "wrapping";
        await active.transcript.markLifecycle("wrapping");
      }
      await active.transcript.append(request);
      if (options.closing) this.options.emitSnapshot(await this.snapshotFor(active.transcript));
    } catch (error) {
      if (!accepted) throw error;
      // The provider already received this request. A rejected IPC promise
      // would invite resending it. End the runtime and report the save failure
      // instead, retaining the learner's visible text for recovery.
      await active.session.interrupt().catch(() => undefined);
      await active.session.end().catch(() => undefined);
      this.active = null;
      this.followOn = null;
      this.followOnEpoch += 1;
      this.resolveIdleWaiters(active);
      this.options.emitAgentEvent({
        type: "error",
        code: "process-exited",
        message:
          "The tutor received your message, but it could not be saved. The session stopped. Keep a copy of your message before reopening.",
      });
      this.options.emitAgentEvent({ type: "session_ended", reason: "died" });
    } finally {
      active.admission = null;
      release();
    }
  }

  /** What the learner may change about the running session. A closed session
   *  offers nothing rather than failing: the surface just shows no controls. */
  async sessionControls(): Promise<SessionControls | null> {
    const active = this.active;
    if (active === null) return null;
    try {
      return this.withRemembered(active, await active.session.describeControls());
    } catch {
      return null;
    }
  }

  /** Apply a learner-initiated session change (ADR-018) and remember it for
   *  this course and provider (ADR-040). It never reaches the learner's own
   *  provider configuration; a provider rejection remembers nothing. */
  async applySessionControls(patch: SessionControlPatch): Promise<SessionControls | null> {
    const active = this.requireActive();
    const controls = await active.session.applyControls(patch);
    for (const key of REMEMBERED_CONTROL_KEYS) {
      if (patch[key] !== undefined) active.remembered.delete(key);
    }
    this.options.controlMemory?.remember(active.courseId, active.providerId, patch);
    return this.withRemembered(active, controls);
  }

  private withRemembered(active: ActiveRuntime, controls: SessionControls): SessionControls {
    return active.remembered.size === 0
      ? controls
      : { ...controls, remembered: [...active.remembered] };
  }

  /** Re-apply what the learner chose for this course last time (ADR-040).
   *  Runs before the opener so the first turn already honours the choice —
   *  Codex can only apply on a turn start. A failure is local, exactly as a
   *  refused control is: the session still opens on the learner's config. */
  private async restoreRememberedControls(active: ActiveRuntime): Promise<void> {
    const memory = this.options.controlMemory;
    if (memory === undefined) return;
    const remembered = memory.read(active.courseId, active.providerId);
    const keys = REMEMBERED_CONTROL_KEYS.filter((key) => remembered[key] !== undefined);
    if (keys.length === 0) return;
    try {
      await active.session.applyControls(remembered);
      for (const key of keys) active.remembered.add(key);
    } catch {
      // The provider's own init frame stays authoritative (ADR-018).
    }
  }

  /** Ask the last request again, unchanged. A provider turn can complete having
   *  produced no answer at all (observed live); the learner's only honest
   *  recourse is to repeat the request, and the transcript records that it was
   *  repeated rather than pretending a new one was made. */
  async retry(): Promise<void> {
    const active = this.requireActive("open");
    const request = active.lastRequest;
    if (request === null) throw new Error("There is nothing to ask again.");
    await this.deliver(active, request);
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
      await this.deliver(active, { kind: "operator", text: "end session" }, { closing: true });
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
      if (active.session.busy || active.turnPending) {
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
    if (active.admission !== null) await active.admission;
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
      await this.startRuntime(courseId, options, transcript, "normal", opener);
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
      await this.startRuntime(transcript.courseId, options, transcript, "recovery", opener);
    } catch (error) {
      await transcript.markLifecycle("close_failed", "The recovery tutor could not start.");
      throw error;
    }
  }

  private async startRuntime(
    courseId: string,
    options: StartConductedSessionOptions,
    transcript: FileTranscriptStore,
    flow: RuntimeFlow,
    opener: string,
  ): Promise<void> {
    const agent = this.options.createAgent();
    const session = agent.startSession({ courseDir: options.courseDir });
    const active: ActiveRuntime = {
      id: this.nextRuntimeId++,
      courseDir: options.courseDir,
      courseId,
      providerId: agent.providerId,
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
      remembered: new Set(),
      idleWaiters: new Set(),
      admission: null,
      turnPending: true,
      backgroundTasks: [],
      taskNotice: null,
      pump: Promise.resolve(),
    };
    this.active = active;
    active.pump = this.pump(active);
    try {
      await this.restoreRememberedControls(active);
      if (this.active?.id !== active.id) return;
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
        while (active.admission !== null) await active.admission;
        if (this.active?.id !== active.id) return;
        if (event.type === "turn_started") active.turnPending = true;
        if (event.type === "background_tasks") {
          if (
            event.tasks.some((task) => !active.backgroundTasks.some((old) => old.id === task.id))
          ) {
            active.taskNotice = null;
          }
          active.backgroundTasks = event.tasks;
        }
        if (event.type === "task_notification") active.taskNotice = event.status;
        if (event.type === "session_ended") {
          active.backgroundTasks = [];
          active.taskNotice = null;
        }
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

        if (event.type === "turn_complete" || event.type === "session_ended") {
          active.turnPending = false;
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
      turnInProgress:
        knownTurnInProgress ?? (runtime !== null && (runtime.turnPending || runtime.session.busy)),
      steerable: runtime?.session.steerable ?? false,
      backgroundTasks: runtime?.backgroundTasks ?? [],
      taskNotice: runtime?.taskNotice ?? null,
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
  // Live activity is not learning evidence and must not revive after restart.
  if (
    event.type === "turn_started" ||
    event.type === "background_tasks" ||
    event.type === "task_notification"
  )
    return null;
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
  if (event.type === "limit_warning" || event.type === "limit_cleared") return null;
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
    steerable: false,
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
