import path from "node:path";
import {
  query,
  type CanUseTool,
  type ModelInfo,
  type Options,
  type PermissionMode,
  type PermissionResult,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentErrorCode,
  AgentEvent,
  AgentSession,
  SessionControlPatch,
  SessionControls,
  SessionEffort,
  SessionModelOption,
  StartSessionOptions,
  TutorAgent,
} from "../../shared/seminar";
import { AsyncQueue } from "./async-queue";

interface ClaudeQuery extends AsyncIterable<SDKMessage> {
  interrupt(): Promise<unknown>;
  /* The runtime-control surface this adapter uses. Declared structurally
     rather than by importing `Query`, so a test double stays small and the
     adapter depends only on what it actually calls. */
  setModel?(model?: string): Promise<void>;
  setPermissionMode?(mode: PermissionMode): Promise<void>;
  applyFlagSettings?(settings: Record<string, unknown>): Promise<void>;
  supportedModels?(): Promise<ModelInfo[]>;
}

type QueryOptions = Parameters<typeof query>[0];
type ClaudeQueryFactory = (options: QueryOptions) => ClaudeQuery;

interface PendingApproval {
  settle(result: PermissionResult): void;
}

interface NormalizedError {
  code: AgentErrorCode;
  message: string;
}

const AUTH_ERROR =
  "Claude Code needs you to sign in again through Claude Code, then start a new session.";
const RATE_LIMIT_ERROR =
  "Claude Code's usage limit has been reached. Try again after the limit resets.";
const TURN_ERROR = "Claude could not complete this turn. Please try again.";
const PROCESS_ERROR = "Claude Code stopped unexpectedly. Start a new session and try again.";

/** Translate a provider error without forwarding credential-shaped provider output. */
export function normalizeClaudeError(error: unknown): NormalizedError {
  const source = error instanceof Error ? error.message : String(error);
  const text = source.toLowerCase();

  if (
    /auth|oauth|log[ -]?in|sign[ -]?in|credential|api[ _-]?key/.test(text) ||
    /token[^\n]*(expired|invalid)/.test(text)
  ) {
    return { code: "auth", message: AUTH_ERROR };
  }

  if (/rate[ _-]?limit|usage limit|quota|too many requests|billing|credit/.test(text)) {
    return { code: "rate-limit", message: RATE_LIMIT_ERROR };
  }

  if (
    /process[^\n]*(exit|spawn)|exited with|enoent|failed to spawn|claude code executable/.test(text)
  ) {
    return { code: "process-exited", message: PROCESS_ERROR };
  }

  return { code: "turn-failed", message: TURN_ERROR };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function pathSummary(input: Record<string, unknown>, verb: string): string {
  const filePath = nonEmptyString(input.file_path) ?? nonEmptyString(input.path);
  return filePath === null ? verb : `${verb} ${filePath}`;
}

function safeWebTarget(value: unknown): string | null {
  const raw = nonEmptyString(value);
  if (raw === null) return null;

  try {
    const url = new URL(raw);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return null;
  }
}

export interface ToolActivityCopy {
  summary: string;
  detail: string | null;
}

function activity(summary: string, detail: string | null = null): ToolActivityCopy {
  return { summary, detail };
}

/** The waiting state's live line: what the tutor is doing right now, in the
 *  present progressive, with the specific target as a second line when one is
 *  safe to show. Commands never appear — the model's own one-line description
 *  of a command (the Bash tool's `description` field, written for display)
 *  stands in for it. `summarizeClaudeTool` is the imperative twin used for
 *  approval cards, where the copy names a request rather than an activity. */
export function describeClaudeActivity(toolName: string, input: unknown): ToolActivityCopy {
  const fields = isRecord(input) ? input : {};
  const target = nonEmptyString(fields.file_path) ?? nonEmptyString(fields.path);

  switch (toolName) {
    case "Bash":
      return activity("Running a command", nonEmptyString(fields.description));
    case "Read":
      return activity("Reading a file", target);
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return activity("Editing a file", target ?? nonEmptyString(fields.notebook_path));
    case "Write":
      return activity("Writing a file", target);
    case "Glob":
      return activity("Finding files", nonEmptyString(fields.pattern));
    case "Grep":
      return activity("Searching course files", nonEmptyString(fields.pattern));
    case "WebFetch":
      return activity("Reading a web page", safeWebTarget(fields.url));
    case "WebSearch":
      return activity("Searching the web", nonEmptyString(fields.query));
    case "Task":
    case "Agent":
      return activity("Delegating a task", nonEmptyString(fields.description));
    default:
      return activity(`Using ${toolName}`);
  }
}

/** Human-shaped tool copy only; provider input is never rendered as raw JSON. */
export function summarizeClaudeTool(toolName: string, input: unknown): string {
  const fields = isRecord(input) ? input : {};

  switch (toolName) {
    case "Bash":
      return nonEmptyString(fields.description) ?? "Run a shell command";
    case "Read":
      return pathSummary(fields, "Read");
    case "Edit":
    case "MultiEdit":
      return pathSummary(fields, "Edit");
    case "Write":
      return pathSummary(fields, "Write");
    case "Glob": {
      const pattern = nonEmptyString(fields.pattern);
      return pattern === null ? "Find files" : `Find files matching ${pattern}`;
    }
    case "Grep": {
      const pattern = nonEmptyString(fields.pattern);
      return pattern === null ? "Search course files" : `Search for ${pattern}`;
    }
    case "WebFetch": {
      const target = safeWebTarget(fields.url);
      return target === null ? "Read a web page" : `Read ${target}`;
    }
    case "WebSearch": {
      const search = nonEmptyString(fields.query);
      return search === null ? "Search the web" : `Search the web for ${search}`;
    }
    case "Task":
    case "Agent":
      return nonEmptyString(fields.description) ?? "Delegate a task";
    default:
      return `Use ${toolName}`;
  }
}

/** The tools whose whole job is writing files. Bash/PowerShell can also write
 *  files, but they can do anything else too, so they never qualify — the grant
 *  covers exactly what it says and nothing that merely overlaps it. */
const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/** Is this approval a file edit that stays inside the course folder? Decided
 *  here because only the adapter sees the raw tool input; the seam carries the
 *  verdict, never the path. Unparseable or relative input fails closed. */
export function isEditWithinCourse(toolName: string, input: unknown, courseDir: string): boolean {
  if (!EDIT_TOOLS.has(toolName)) return false;
  const fields = isRecord(input) ? input : {};
  const target = nonEmptyString(fields.file_path) ?? nonEmptyString(fields.notebook_path);
  if (target === null || !path.isAbsolute(target)) return false;
  const relative = path.relative(path.resolve(courseDir), path.resolve(target));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * The autonomy ladder the app offers, least to most.
 *
 * Deliberately a SUBSET of the provider's modes. `bypassPermissions` is not
 * offered at all (it needs an explicit dangerous-skip flag, and a tutor with
 * full-capability tool access running unattended in the learner's filesystem
 * is not a setting this app hands over in a dropdown). `plan` executes no
 * tools, which would silently break course generation, and `dontAsk` denies
 * anything not pre-approved, which reads as the tutor mysteriously failing.
 */
const AUTONOMY: { id: PermissionMode; label: string; description: string }[] = [
  {
    id: "default",
    label: "Ask every time",
    description: "Your tutor asks before it touches anything.",
  },
  {
    id: "acceptEdits",
    label: "Auto-accept file edits",
    description: "File edits go through; commands and everything else still ask.",
  },
  {
    id: "auto",
    label: "Decide for me",
    description: "Your tutor judges each request itself and only asks when it is unsure.",
  },
  {
    id: "bypassPermissions",
    label: "Never ask",
    description:
      "Full access to this course folder and your shell. Fastest, and nothing is checked with you first.",
  },
];

const EFFORTS: SessionEffort[] = ["low", "medium", "high", "xhigh", "max"];

function knownEfforts(model: ModelInfo): SessionEffort[] {
  if (model.supportsEffort !== true) return [];
  const offered = model.supportedEffortLevels ?? [];
  return EFFORTS.filter((level) => offered.includes(level));
}

function resultError(message: Extract<SDKMessage, { type: "result" }>): NormalizedError {
  if (message.subtype === "success") return { code: "turn-failed", message: TURN_ERROR };
  return normalizeClaudeError(message.errors.join("\n") || message.subtype);
}

/** Map one SDK frame onto the provider-neutral seam. Unknown SDK frames skip.
 *
 *  `includeAssistantText` renders the assistant frame's OWN text blocks as
 *  deltas. Normally that text is a duplicate — `includePartialMessages` already
 *  streamed it — so the caller passes true only when nothing streamed for this
 *  message. That case is real and was observed live (2026-08-12): a turn ran
 *  three minutes, reported cost and completion, and emitted no root content
 *  frames at all, so the tutor appeared to say nothing. The words exist in the
 *  assistant frame; dropping them was the app's bug, not the provider's. */
export function normalizeClaudeMessage(
  message: SDKMessage,
  { includeAssistantText = false }: { includeAssistantText?: boolean } = {},
): AgentEvent[] {
  if (message.type === "rate_limit_event") {
    const info = message.rate_limit_info;
    if (info.status === "allowed") return [];
    const labels: Record<NonNullable<typeof info.rateLimitType>, string> = {
      five_hour: "Claude 5-hour limit",
      seven_day: "Claude weekly limit",
      seven_day_opus: "Claude Opus weekly limit",
      seven_day_sonnet: "Claude Sonnet weekly limit",
      seven_day_overage_included: "Claude weekly overage limit",
      overage: "Claude overage limit",
    };
    return [
      {
        type: "limit_warning",
        label: info.rateLimitType === undefined ? "Claude usage limit" : labels[info.rateLimitType],
        usedPercent:
          typeof info.utilization === "number" && Number.isFinite(info.utilization)
            ? Math.min(100, Math.max(0, info.utilization))
            : null,
        resetsAt:
          typeof info.resetsAt === "number" && Number.isFinite(info.resetsAt) && info.resetsAt > 0
            ? info.resetsAt
            : null,
        status: info.status === "allowed_warning" ? "warning" : "rejected",
      },
    ];
  }

  if (message.type === "stream_event") {
    if (message.parent_tool_use_id !== null) return [];
    if (message.event.type !== "content_block_delta") return [];
    if (message.event.delta.type !== "text_delta") return [];
    if (typeof message.event.delta.text !== "string") {
      throw new Error("Claude emitted a malformed text delta.");
    }
    return [{ type: "message_delta", delta: message.event.delta.text }];
  }

  if (message.type === "assistant") {
    if (message.parent_tool_use_id !== null) return [];

    const events: AgentEvent[] = [];
    for (const block of message.message.content) {
      if (block.type === "text") {
        if (includeAssistantText && typeof block.text === "string" && block.text !== "") {
          events.push({ type: "message_delta", delta: block.text });
        }
        continue;
      }
      if (block.type !== "tool_use") continue;
      if (typeof block.name !== "string" || block.name === "") {
        throw new Error("Claude emitted malformed tool activity.");
      }
      const copy = describeClaudeActivity(block.name, block.input);
      events.push({
        type: "tool_activity",
        name: block.name,
        summary: copy.summary,
        ...(copy.detail === null ? {} : { detail: copy.detail }),
      });
    }
    return events;
  }

  if (message.type === "result") {
    if (!Number.isFinite(message.total_cost_usd)) {
      throw new Error("Claude emitted malformed usage data.");
    }

    const events: AgentEvent[] = [{ type: "usage_update", totalCostUsd: message.total_cost_usd }];
    if (message.subtype !== "success") events.push({ type: "error", ...resultError(message) });
    events.push({ type: "turn_complete" });
    return events;
  }

  return [];
}

class ClaudeAgentSession implements AgentSession {
  private readonly input = new AsyncQueue<SDKUserMessage>();
  private readonly output = new AsyncQueue<AgentEvent>();
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly sdkQuery: ClaudeQuery;
  private readonly pumpPromise: Promise<void>;

  private turnInFlight = false;
  /** Whether text deltas have streamed since the last assistant frame. It is
   *  per-frame rather than per-turn on purpose: a turn can carry several
   *  assistant messages (text, tool use, text again), and each one has to be
   *  judged on whether ITS words reached the learner. */
  private streamedSinceAssistant = false;
  /** Monotonic turn number; result frames map to sends FIFO, which is what
   *  lets the pump tell a stale interrupted-turn result from the live turn's. */
  private turnCounter = 0;
  private currentTurnNumber = 0;
  /** How many result frames the pump has consumed (FIFO cursor into sends). */
  private resultCursor = 0;
  /** Turns interrupt's bounded fallback already completed: their late result
   *  frame must not complete (or fail-banner) a NEWER turn. */
  private readonly fallbackCompleted = new Set<number>();
  /** Set by interrupt(); the interrupted turn's own result error is a
   *  learner-initiated stop, not a fault to banner. */
  private interruptRequested = false;
  /** Interrupt calls waiting for the turn to finish (raced with the fallback
   *  timer so a prompt result frame resolves interrupt immediately). */
  private readonly turnFinishWaiters: Array<() => void> = [];
  private endRequested = false;
  private terminal = false;
  /* What the session is actually running, learned from the provider's own
     init frame rather than assumed — the app passes no model or permission
     mode at startup, so this is the only truthful source (ADR-018). */
  private currentModel: string | null = null;
  private currentAutonomy: string | null = null;
  /** The learner picked a model explicitly; provider announcements no longer
   *  overwrite it. */
  private modelPinned = false;
  private currentEffort: SessionEffort | null = null;
  private models: (SessionModelOption & { resolved?: string })[] | null = null;

  readonly events: AsyncIterable<AgentEvent> = this.output;

  get busy(): boolean {
    return this.turnInFlight;
  }

  constructor(
    private readonly courseDir: string,
    queryFactory: ClaudeQueryFactory,
    private readonly interruptFallbackMs: number,
    claudeExecutable: string | undefined,
    environment: Readonly<Record<string, string>> | undefined,
  ) {
    const canUseTool: CanUseTool = (toolName, input, options) =>
      this.requestApproval(toolName, input, options);

    const sdkOptions: Options = {
      cwd: courseDir,
      systemPrompt: { type: "preset", preset: "claude_code" },
      settingSources: ["user", "project", "local"],
      includePartialMessages: true,
      /* Enables the "Never ask" rung — it does NOT bypass anything by itself.
         Without the flag the provider refuses that mode outright, so the
         learner could not choose it even deliberately (ADR-018). */
      allowDangerouslySkipPermissions: true,
      canUseTool,
      // Required to drain the child stream, deliberately never logged (ADR-004).
      stderr: () => undefined,
      ...(claudeExecutable === undefined ? {} : { pathToClaudeCodeExecutable: claudeExecutable }),
      ...(environment === undefined ? {} : { env: environment }),
    };

    this.sdkQuery = queryFactory({ prompt: this.input, options: sdkOptions });
    this.pumpPromise = this.pump();
  }

  send(message: string): void {
    if (this.endRequested || this.terminal) throw new Error("The tutor session has ended.");
    if (this.turnInFlight) throw new Error("A tutor turn is already in progress.");

    this.turnInFlight = true;
    this.currentTurnNumber = ++this.turnCounter;
    this.interruptRequested = false;
    this.input.push({
      type: "user",
      message: { role: "user", content: message },
      parent_tool_use_id: null,
    });
  }

  respondToApproval(requestId: string, allow: boolean, reason?: string): void {
    const pending = this.pendingApprovals.get(requestId);
    if (pending === undefined) return;

    pending.settle(
      allow
        ? { behavior: "allow" }
        : { behavior: "deny", message: reason ?? "The learner denied this action." },
    );
  }

  async interrupt(): Promise<void> {
    if (this.endRequested || this.terminal || !this.turnInFlight) return;

    // The interrupted turn's own result frame finishes the turn (and its
    // non-success subtype is a learner-initiated stop, not a fault to show).
    // Finishing here instead would re-enable the composer while that result
    // is still in flight — a stale turn_complete could then end the NEXT
    // turn and strand the renderer mid-stream.
    this.interruptRequested = true;
    const interruptedTurn = this.currentTurnNumber;
    await this.sdkQuery.interrupt();
    if (!this.turnInFlight || this.currentTurnNumber !== interruptedTurn) return;

    // Bounded fallback for workers that drop the result after an interrupt:
    // wait for the result frame to finish the turn, but only so long. A turn
    // force-finished here remembers its number, so its result frame arriving
    // even later is recognized as stale rather than being misattributed to
    // whatever turn is live by then.
    await new Promise<void>((resolve) => {
      const settle = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(settle, this.interruptFallbackMs);
      this.turnFinishWaiters.push(settle);
    });
    if (this.turnInFlight && this.currentTurnNumber === interruptedTurn) {
      this.fallbackCompleted.add(interruptedTurn);
      this.finishTurn();
    }
  }

  async describeControls(): Promise<SessionControls> {
    if (this.models === null) {
      try {
        const supported = (await this.sdkQuery.supportedModels?.()) ?? [];
        this.models = supported.map((model) => ({
          id: model.value,
          label: model.displayName,
          ...(model.description === "" ? {} : { description: model.description }),
          efforts: knownEfforts(model),
          /* The wire id this row resolves to. The provider reports the RUNNING
             model as a wire id ("claude-sonnet-5") while the selectable rows
             are aliases ("sonnet"), so without this the app cannot match them
             and shows "default" for a session that is plainly running
             something — which is exactly what the learner cannot verify. */
          ...(model.resolvedModel === undefined ? {} : { resolved: model.resolvedModel }),
        }));
      } catch {
        // A provider that cannot answer offers nothing; the session still runs
        // on whatever the learner's own configuration chose.
        this.models = [];
      }
    }
    return {
      // `resolved` is adapter bookkeeping for matching wire ids; the seam
      // carries only what the surface renders.
      models: this.models.map((option) => ({
        id: option.id,
        label: option.label,
        ...(option.description === undefined ? {} : { description: option.description }),
        efforts: option.efforts,
      })),
      autonomy: AUTONOMY.map((mode) => ({ ...mode })),
      current: {
        model: this.selectedModelId(),
        effort: this.currentEffort,
        autonomy: this.currentAutonomy,
      },
    };
  }

  /** The running model expressed as one of the offered ids, matching a wire id
   *  back to the alias row that covers it. Falls back to the raw id so the
   *  surface can still show SOMETHING true rather than "default". */
  private selectedModelId(): string | null {
    const running = this.currentModel;
    if (running === null) return null;
    const rows = this.models ?? [];
    const match = rows.find((row) => row.id === running || row.resolved === running);
    return match?.id ?? running;
  }

  async applyControls(patch: SessionControlPatch): Promise<SessionControls> {
    if (this.endRequested || this.terminal) throw new Error("The tutor session has ended.");

    if (patch.model !== undefined) {
      await this.sdkQuery.setModel?.(patch.model ?? undefined);
      this.currentModel = patch.model;
      this.modelPinned = patch.model !== null;
      // A model change can invalidate the current effort: levels are per-model.
      const model = this.models?.find((candidate) => candidate.id === patch.model);
      if (this.currentEffort !== null && model !== undefined) {
        if (!model.efforts.includes(this.currentEffort)) this.currentEffort = null;
      }
    }
    if (patch.effort !== undefined) {
      await this.sdkQuery.applyFlagSettings?.({ effortLevel: patch.effort });
      this.currentEffort = patch.effort;
    }
    if (patch.autonomy !== undefined) {
      const mode = AUTONOMY.find((candidate) => candidate.id === patch.autonomy);
      // Only the offered ladder is settable: an unknown id must never become a
      // permission mode this app has not sanctioned.
      if (mode === undefined) throw new Error("That autonomy setting is not available.");
      await this.sdkQuery.setPermissionMode?.(mode.id);
      this.currentAutonomy = mode.id;
    }
    return await this.describeControls();
  }

  async end(): Promise<void> {
    if (this.terminal) return;
    if (!this.endRequested) {
      this.endRequested = true;
      this.input.end();
      this.settleAllApprovals("The tutor session ended before approval was answered.");
    }
    await this.pumpPromise;
  }

  private requestApproval(
    toolName: string,
    input: Record<string, unknown>,
    options: Parameters<CanUseTool>[2],
  ): Promise<PermissionResult> {
    if (this.endRequested || this.terminal || options.signal.aborted) {
      return Promise.resolve({ behavior: "deny", message: "The request was cancelled." });
    }
    /* Asking the learner a question is not an action to approve. Gating it
       behind a permission card creates a prompt asking permission to show a
       prompt. It touches nothing. */
    if (toolName === "AskUserQuestion") {
      return Promise.resolve({ behavior: "allow", updatedInput: input });
    }

    return new Promise<PermissionResult>((resolve) => {
      let settled = false;
      const settle = (result: PermissionResult): void => {
        if (settled) return;
        settled = true;
        options.signal.removeEventListener("abort", onAbort);
        this.pendingApprovals.delete(options.toolUseID);
        resolve(result.behavior === "allow" ? { ...result, updatedInput: input } : result);
      };
      const onAbort = (): void =>
        settle({ behavior: "deny", message: "The request was cancelled." });

      this.pendingApprovals.set(options.toolUseID, { settle });
      options.signal.addEventListener("abort", onAbort, { once: true });
      // A command approval states the command (DESIGN.md: never hide one in a
      // broad label). Bash runs in the course folder, so no cwd is reported.
      const command = toolName === "Bash" && isRecord(input) ? nonEmptyString(input.command) : null;
      this.output.push({
        type: "approval_request",
        requestId: options.toolUseID,
        toolName,
        summary:
          nonEmptyString(options.title) ??
          nonEmptyString(options.description) ??
          nonEmptyString(options.displayName) ??
          summarizeClaudeTool(toolName, input),
        editWithinCourse: isEditWithinCourse(toolName, input, this.courseDir),
        ...(command === null ? {} : { command }),
      });
    });
  }

  private async pump(): Promise<void> {
    let failure: NormalizedError | null = null;

    try {
      for await (const message of this.sdkQuery) {
        // Result frames map to sends FIFO. One whose turn the interrupt
        // fallback already completed is STALE: its turn_complete must not
        // end the live turn, and its error is not the live turn's fault.
        // The init frame is how the app learns what the learner's own config
        // resolved to. It is never rendered — it answers "which model am I
        // talking to", which the learner could otherwise only guess.
        if (message.type === "system" && message.subtype === "init") {
          // A learner's explicit pick outranks a later init frame: the CLI
          // re-announces its startup model, and letting that overwrite the
          // choice is what made the picker appear to reset itself.
          if (!this.modelPinned) {
            this.currentModel = nonEmptyString(message.model) ?? this.currentModel;
          }
          this.currentAutonomy = nonEmptyString(message.permissionMode) ?? this.currentAutonomy;
        }

        const resultTurn = message.type === "result" ? ++this.resultCursor : null;
        const stale = resultTurn !== null && this.fallbackCompleted.delete(resultTurn);
        const events = normalizeClaudeMessage(message, {
          includeAssistantText: message.type === "assistant" && !this.streamedSinceAssistant,
        });
        // Read the flag above, then reset: the frame just consumed it, and the
        // next assistant message answers for its own streaming.
        if (message.type === "assistant" || message.type === "result") {
          this.streamedSinceAssistant = false;
        }
        if (message.type === "stream_event" && events.some((e) => e.type === "message_delta")) {
          this.streamedSinceAssistant = true;
        }

        for (const event of events) {
          if (event.type === "turn_complete") {
            if (!stale) this.finishTurn();
          } else if (event.type === "error" && (stale || this.interruptRequested)) {
            // The learner pressed Stop; the interrupted turn's error subtype
            // is expected, not a fault worth a failure banner.
            this.interruptRequested = false;
          } else this.output.push(event);
        }
      }

      if (!this.endRequested) failure = { code: "process-exited", message: PROCESS_ERROR };
    } catch (error) {
      failure = normalizeClaudeError(error);
    } finally {
      this.input.end();
      this.settleAllApprovals("The tutor process stopped before approval was answered.");
      if (this.turnInFlight) this.finishTurn();

      if (failure !== null) this.output.push({ type: "error", ...failure });
      this.output.push({
        type: "session_ended",
        reason: failure === null && this.endRequested ? "ended" : "died",
      });
      this.terminal = true;
      this.output.end();
    }
  }

  private finishTurn(): void {
    if (!this.turnInFlight) return;
    this.turnInFlight = false;
    this.interruptRequested = false;
    this.output.push({ type: "turn_complete" });
    for (const waiter of this.turnFinishWaiters.splice(0)) waiter();
  }

  private settleAllApprovals(message: string): void {
    for (const approval of [...this.pendingApprovals.values()]) {
      approval.settle({ behavior: "deny", message });
    }
  }
}

/** Claude Code adapter preserving the learner's canonical CLI configuration. */
export class ClaudeTutorAgent implements TutorAgent {
  readonly providerId = "claude" as const;

  constructor(
    private readonly queryFactory: ClaudeQueryFactory = query,
    /** How long interrupt waits for the interrupted turn's own result frame
     *  before force-finishing the turn. Injectable so tests stay fast. */
    private readonly interruptFallbackMs = 1500,
    /** Always inject the provider-owned native CLI. Production must never let
     *  the SDK fall back to its optional bundled executable (ADR-025). */
    private readonly claudeExecutable?: string,
    /** Full inherited environment with packaged tools prepended to PATH. */
    private readonly environment?: Readonly<Record<string, string>>,
  ) {}

  startSession(options: StartSessionOptions): AgentSession {
    return new ClaudeAgentSession(
      options.courseDir,
      this.queryFactory,
      this.interruptFallbackMs,
      this.claudeExecutable,
      this.environment,
    );
  }
}
