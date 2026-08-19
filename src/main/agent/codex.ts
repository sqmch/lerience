import fs from "node:fs";
import path from "node:path";
import type {
  AgentErrorCode,
  AgentEvent,
  AgentSession,
  SessionAutonomyOption,
  SessionControlPatch,
  SessionControls,
  SessionEffort,
  SessionModelOption,
  StartSessionOptions,
  TutorAgent,
} from "../../shared/seminar";
import {
  CodexAppServerFailure,
  type CodexAppServerConnection,
  type CodexAppServerFactory,
} from "../provider/codex-app-server";
import { AsyncQueue } from "./async-queue";

const PROTOCOL_LIMIT = 512 * 1024;
const INTERRUPT_FALLBACK_MS = 5_000;
const EFFORTS: SessionEffort[] = ["low", "medium", "high", "xhigh", "max"];

const AUTONOMY: SessionAutonomyOption[] = [
  {
    id: "untrusted",
    label: "Ask every time",
    description: "Your tutor checks with you before actions Codex does not already trust.",
  },
  {
    id: "on-request",
    label: "Decide for me",
    description: "Your tutor works inside its sandbox and asks when it needs to go beyond it.",
  },
  {
    id: "never",
    label: "Never ask",
    description: "Codex will not pause for approval. Its configured sandbox still applies.",
  },
];

interface NormalizedError {
  code: AgentErrorCode;
  message: string;
}

interface PendingApproval {
  rpcId: string | number;
  allowResult: unknown;
  denyResult: unknown;
}

interface ModelRecord extends SessionModelOption {
  wireModel: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function knownEffort(value: unknown): SessionEffort | null {
  return typeof value === "string" && EFFORTS.includes(value as SessionEffort)
    ? (value as SessionEffort)
    : null;
}

function knownAutonomy(value: unknown): string | null {
  return typeof value === "string" && AUTONOMY.some((option) => option.id === value) ? value : null;
}

export function normalizeCodexError(value: unknown): NormalizedError {
  const info = isRecord(value) && "codexErrorInfo" in value ? value.codexErrorInfo : value;
  if (info === "unauthorized") {
    return {
      code: "auth",
      message: "Codex needs you to sign in again with ChatGPT, then start a new session.",
    };
  }
  if (info === "usageLimitExceeded" || info === "sessionBudgetExceeded") {
    return {
      code: "rate-limit",
      message: "Codex's usage limit has been reached. Try again after the limit resets.",
    };
  }
  if (value instanceof CodexAppServerFailure && ["missing", "exited"].includes(value.code)) {
    return {
      code: "process-exited",
      message: "Codex stopped unexpectedly. Start a new session and try again.",
    };
  }
  return {
    code: "turn-failed",
    message: "Codex could not complete this turn. Please try again.",
  };
}

export function summarizeCodexItem(item: unknown): AgentEvent | null {
  if (!isRecord(item) || typeof item.type !== "string") return null;
  switch (item.type) {
    case "commandExecution":
      return { type: "tool_activity", name: "Shell", summary: "Run a shell command" };
    case "fileChange":
      return { type: "tool_activity", name: "Files", summary: "Change course files" };
    case "webSearch":
      return { type: "tool_activity", name: "Web", summary: "Search the web" };
    case "imageView":
      return { type: "tool_activity", name: "Image", summary: "View an image" };
    case "mcpToolCall":
    case "dynamicToolCall":
      return { type: "tool_activity", name: "Tool", summary: "Use a connected tool" };
    case "collabAgentToolCall":
    case "subAgentActivity":
      return { type: "tool_activity", name: "Agent", summary: "Delegate a task" };
    case "contextCompaction":
      return { type: "tool_activity", name: "Context", summary: "Organize session context" };
    default:
      return null;
  }
}

function pathInsideCourse(target: string, courseDir: string, allowRoot = false): boolean {
  const root = path.resolve(courseDir);
  const absolute = path.resolve(root, target);
  const relative = path.relative(root, absolute);
  return (
    (allowRoot && relative === "") ||
    (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function codexFileEditWithinCourse(
  item: unknown,
  courseDir: string,
  grantRoot?: unknown,
): boolean {
  if (isRecord(item) && item.type === "fileChange" && Array.isArray(item.changes)) {
    const paths = item.changes.map((change) =>
      isRecord(change) && typeof change.path === "string" ? change.path : null,
    );
    if (
      paths.length > 0 &&
      paths.every((target) => target !== null && pathInsideCourse(target, courseDir))
    ) {
      return true;
    }
  }
  return typeof grantRoot === "string" && pathInsideCourse(grantRoot, courseDir, true);
}

function readCourseProtocol(courseDir: string): string {
  const protocolPath = path.join(courseDir, "CLAUDE.md");
  const stats = fs.statSync(protocolPath);
  if (!stats.isFile() || stats.size > PROTOCOL_LIMIT) {
    throw new Error("This course's tutor protocol is unavailable.");
  }
  return fs.readFileSync(protocolPath, "utf8");
}

export class CodexTutorAgent implements TutorAgent {
  readonly providerId = "codex" as const;

  constructor(private readonly appServer: CodexAppServerFactory) {}

  startSession({ courseDir }: StartSessionOptions): AgentSession {
    return new CodexAgentSession(courseDir, readCourseProtocol(courseDir), this.appServer);
  }
}

export class CodexAgentSession implements AgentSession {
  private readonly output = new AsyncQueue<AgentEvent>();
  private readonly client: CodexAppServerConnection;
  private readonly ready: Promise<boolean>;
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly turnFinishWaiters: Array<() => void> = [];
  private readonly items = new Map<string, unknown>();
  private readonly streamedAgentItems = new Set<string>();
  private readonly earlyTurnCompletions = new Map<string, Record<string, unknown>>();
  private turnInFlight = false;
  private turnStart: Promise<void> | null = null;
  private currentTurnId: string | null = null;
  private threadId: string | null = null;
  private interruptRequested = false;
  private terminal = false;
  private endRequested = false;
  private models: ModelRecord[] | null = null;
  private currentModel: string | null = null;
  private currentEffort: SessionEffort | null = null;
  private currentAutonomy: string | null = null;
  /** App Server has no thread-settings mutation request. Learner choices are
   *  therefore staged here and sent as overrides on the next real turn. */
  private pendingControls: SessionControlPatch = {};

  readonly events: AsyncIterable<AgentEvent> = this.output;

  get busy(): boolean {
    return this.turnInFlight;
  }

  constructor(
    private readonly courseDir: string,
    private readonly protocol: string,
    appServer: CodexAppServerFactory,
  ) {
    this.client = appServer();
    this.client.onNotification((method, params) => this.handleNotification(method, params));
    this.client.onRequest((id, method, params) => this.handleRequest(id, method, params));
    this.client.onExit((failure) => {
      if (!this.endRequested) this.failSession(failure);
    });
    this.ready = this.initialize().then(
      () => true,
      (error: unknown) => {
        if (!this.endRequested) this.failSession(error);
        return false;
      },
    );
  }

  send(message: string): void {
    if (this.terminal) throw new Error("This tutor session has ended.");
    if (this.turnInFlight) throw new Error("A tutor turn is already in progress.");
    this.turnInFlight = true;
    this.interruptRequested = false;
    const starting = this.startTurn(message);
    this.turnStart = starting;
    void starting;
  }

  respondToApproval(requestId: string, allow: boolean): void {
    const pending = this.pendingApprovals.get(requestId);
    if (pending === undefined) return;
    this.pendingApprovals.delete(requestId);
    this.client.respond(pending.rpcId, allow ? pending.allowResult : pending.denyResult);
  }

  async describeControls(): Promise<SessionControls> {
    if (!(await this.ready)) return this.controls([]);
    return this.controls(await this.loadModels());
  }

  async applyControls(patch: SessionControlPatch): Promise<SessionControls> {
    if (!(await this.ready) || this.threadId === null) throw new Error("Codex is unavailable.");
    const models = await this.loadModels();
    const next: SessionControlPatch = { ...this.pendingControls, ...patch };

    if (patch.model !== undefined) {
      if (patch.model !== null && !models.some((model) => model.id === patch.model)) {
        throw new Error("That model is not available in this session.");
      }
    }
    if (patch.effort !== undefined) {
      if (patch.effort !== null && knownEffort(patch.effort) === null) {
        throw new Error("That effort level is not available in this session.");
      }
      const selectedModel = next.model !== undefined ? next.model : this.currentModel;
      const selected = models.find((model) => model.id === selectedModel);
      if (patch.effort !== null && !selected?.efforts.includes(patch.effort)) {
        throw new Error("That effort level is not available for this model.");
      }
    }
    if (patch.autonomy !== undefined) {
      if (knownAutonomy(patch.autonomy) === null) {
        throw new Error("That autonomy level is not available in this session.");
      }
    }

    // Moving to a model that cannot accept the current/staged effort restores
    // that model's default rather than sending a combination model/list says
    // is invalid.
    if (patch.model !== undefined && patch.model !== null) {
      const selected = models.find((model) => model.id === patch.model);
      const effectiveEffort = next.effort !== undefined ? next.effort : this.currentEffort;
      if (effectiveEffort !== null && !selected?.efforts.includes(effectiveEffort)) {
        next.effort = null;
      }
    }

    this.pendingControls = this.onlyChangedControls(next);
    return this.controls(models);
  }

  async interrupt(): Promise<void> {
    if (!this.turnInFlight) return;
    this.interruptRequested = true;
    await this.turnStart;
    if (!this.turnInFlight || this.threadId === null || this.currentTurnId === null) return;
    const turnId = this.currentTurnId;
    try {
      await this.client.request("turn/interrupt", { threadId: this.threadId, turnId });
    } catch {
      // The bounded completion below is the learner-facing guarantee.
    }
    if (!this.turnInFlight || this.currentTurnId !== turnId) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        const index = this.turnFinishWaiters.indexOf(done);
        if (index >= 0) this.turnFinishWaiters.splice(index, 1);
        this.finishTurn();
        resolve();
      }, INTERRUPT_FALLBACK_MS);
      const done = (): void => {
        clearTimeout(timer);
        resolve();
      };
      this.turnFinishWaiters.push(done);
    });
  }

  async end(): Promise<void> {
    if (this.terminal) return;
    this.endRequested = true;
    this.terminal = true;
    this.turnInFlight = false;
    this.pendingApprovals.clear();
    this.client.close();
    this.output.push({ type: "session_ended", reason: "ended" });
    this.output.end();
  }

  private async initialize(): Promise<void> {
    await this.client.initialize();
    const response = await this.client.request("thread/start", {
      cwd: this.courseDir,
      ephemeral: true,
      developerInstructions: this.protocol,
    });
    if (
      !isRecord(response) ||
      !isRecord(response.thread) ||
      typeof response.thread.id !== "string"
    ) {
      throw new Error("Codex returned an invalid session.");
    }
    this.threadId = response.thread.id;
    this.currentModel = nonEmptyString(response.model);
    this.currentEffort = knownEffort(response.reasoningEffort);
    this.currentAutonomy = knownAutonomy(response.approvalPolicy);
  }

  private async startTurn(message: string): Promise<void> {
    if (!(await this.ready) || this.threadId === null || this.terminal) return;
    const pending = { ...this.pendingControls };
    try {
      const params: Record<string, unknown> = {
        threadId: this.threadId,
        input: [{ type: "text", text: message, text_elements: [] }],
      };
      if (pending.model !== undefined) {
        params.model =
          pending.model === null
            ? null
            : (this.models?.find((model) => model.id === pending.model)?.wireModel ??
              pending.model);
      }
      if (pending.effort !== undefined) params.effort = pending.effort;
      if (pending.autonomy !== undefined) params.approvalPolicy = pending.autonomy;

      const response = await this.client.request("turn/start", params);
      if (!isRecord(response) || !isRecord(response.turn) || typeof response.turn.id !== "string") {
        throw new Error("Codex returned an invalid turn.");
      }
      this.acceptPendingControls(pending);
      this.currentTurnId = response.turn.id;
      const completion = this.earlyTurnCompletions.get(response.turn.id) ?? response.turn;
      this.earlyTurnCompletions.delete(response.turn.id);
      this.completeFromTurn(completion);
    } catch (error) {
      if (this.terminal) return;
      this.output.push({ type: "error", ...normalizeCodexError(error) });
      this.finishTurn();
    }
  }

  private handleNotification(method: string, params: unknown): void {
    if (this.terminal || !isRecord(params)) return;
    if ("threadId" in params && this.threadId !== null && params.threadId !== this.threadId) return;

    if (method === "item/agentMessage/delta") {
      if (typeof params.itemId !== "string" || typeof params.delta !== "string") return;
      this.streamedAgentItems.add(params.itemId);
      if (params.delta !== "") this.output.push({ type: "message_delta", delta: params.delta });
      return;
    }
    if (method === "item/started" && isRecord(params.item)) {
      const id = nonEmptyString(params.item.id);
      if (id !== null) this.items.set(id, params.item);
      const activity = summarizeCodexItem(params.item);
      if (activity !== null) this.output.push(activity);
      return;
    }
    if (method === "item/completed" && isRecord(params.item)) {
      const id = nonEmptyString(params.item.id);
      if (id !== null) this.items.set(id, params.item);
      if (
        params.item.type === "agentMessage" &&
        id !== null &&
        !this.streamedAgentItems.has(id) &&
        typeof params.item.text === "string" &&
        params.item.text !== ""
      ) {
        this.output.push({ type: "message_delta", delta: params.item.text });
      }
      return;
    }
    if (method === "thread/settings/updated" && isRecord(params.threadSettings)) {
      this.currentModel = nonEmptyString(params.threadSettings.model);
      this.currentEffort = knownEffort(params.threadSettings.effort);
      this.currentAutonomy = knownAutonomy(params.threadSettings.approvalPolicy);
      return;
    }
    if (method === "turn/completed" && isRecord(params.turn)) {
      const turnId = nonEmptyString(params.turn.id);
      if (turnId === null) return;
      if (this.currentTurnId === null && this.turnInFlight) {
        this.earlyTurnCompletions.set(turnId, params.turn);
        return;
      }
      if (turnId === this.currentTurnId) this.completeFromTurn(params.turn);
    }
  }

  private handleRequest(id: string | number, method: string, params: unknown): void {
    if (!isRecord(params)) {
      this.client.respond(id, {});
      return;
    }
    const requestId = `codex:${String(id)}`;
    if (method === "item/commandExecution/requestApproval") {
      this.pendingApprovals.set(requestId, {
        rpcId: id,
        allowResult: { decision: "accept" },
        denyResult: { decision: "decline" },
      });
      this.output.push({
        type: "approval_request",
        requestId,
        toolName: "Shell",
        summary: "Codex wants to run a shell command",
        editWithinCourse: false,
      });
      return;
    }
    if (method === "item/fileChange/requestApproval") {
      this.pendingApprovals.set(requestId, {
        rpcId: id,
        allowResult: { decision: "accept" },
        denyResult: { decision: "decline" },
      });
      this.output.push({
        type: "approval_request",
        requestId,
        toolName: "Files",
        summary: "Codex wants to change files",
        editWithinCourse: codexFileEditWithinCourse(
          this.items.get(String(params.itemId)),
          this.courseDir,
          params.grantRoot,
        ),
      });
      return;
    }
    if (method === "item/permissions/requestApproval") {
      const permissions = isRecord(params.permissions) ? params.permissions : {};
      this.pendingApprovals.set(requestId, {
        rpcId: id,
        allowResult: { permissions, scope: "turn" },
        denyResult: { permissions: {}, scope: "turn" },
      });
      this.output.push({
        type: "approval_request",
        requestId,
        toolName: "Permissions",
        summary: "Codex wants additional permissions for this turn",
        editWithinCourse: false,
      });
      return;
    }
    // Unknown future request methods fail closed without leaving the provider
    // waiting forever. No unknown payload reaches the learner.
    this.client.respond(id, {});
  }

  private async loadModels(): Promise<ModelRecord[]> {
    if (this.models !== null) return this.models;
    try {
      const response = await this.client.request("model/list", {
        limit: 100,
        includeHidden: false,
      });
      if (!isRecord(response) || !Array.isArray(response.data)) return (this.models = []);
      this.models = response.data.flatMap((value): ModelRecord[] => {
        if (!isRecord(value) || value.hidden === true) return [];
        const id = nonEmptyString(value.id);
        const wireModel = nonEmptyString(value.model);
        const label = nonEmptyString(value.displayName);
        if (id === null || wireModel === null || label === null) return [];
        const effortRows = Array.isArray(value.supportedReasoningEfforts)
          ? value.supportedReasoningEfforts
          : [];
        const efforts = EFFORTS.filter((effort) =>
          effortRows.some((row) => isRecord(row) && row.reasoningEffort === effort),
        );
        return [
          {
            id,
            wireModel,
            label,
            description: nonEmptyString(value.description) ?? undefined,
            efforts,
          },
        ];
      });
      const match = this.models.find(
        (model) => model.id === this.currentModel || model.wireModel === this.currentModel,
      );
      if (match !== undefined) this.currentModel = match.id;
      return this.models;
    } catch {
      return (this.models = []);
    }
  }

  private controls(models: ModelRecord[]): SessionControls {
    return {
      models: models.map((model) => ({
        id: model.id,
        label: model.label,
        description: model.description,
        efforts: model.efforts,
      })),
      autonomy: AUTONOMY,
      ...(Object.keys(this.pendingControls).length === 0
        ? {}
        : { pending: { ...this.pendingControls } }),
      current: {
        model: this.currentModel,
        effort: this.currentEffort,
        autonomy: this.currentAutonomy,
      },
    };
  }

  private onlyChangedControls(patch: SessionControlPatch): SessionControlPatch {
    const changed: SessionControlPatch = {};
    if (patch.model !== undefined && patch.model !== this.currentModel) changed.model = patch.model;
    if (patch.effort !== undefined && patch.effort !== this.currentEffort) {
      changed.effort = patch.effort;
    }
    if (patch.autonomy !== undefined && patch.autonomy !== this.currentAutonomy) {
      changed.autonomy = patch.autonomy;
    }
    return changed;
  }

  private acceptPendingControls(applied: SessionControlPatch): void {
    const remaining = { ...this.pendingControls };
    if (applied.model !== undefined && remaining.model === applied.model) {
      this.currentModel = applied.model;
      delete remaining.model;
    }
    if (applied.effort !== undefined && remaining.effort === applied.effort) {
      this.currentEffort = applied.effort;
      delete remaining.effort;
    }
    if (applied.autonomy !== undefined && remaining.autonomy === applied.autonomy) {
      this.currentAutonomy = applied.autonomy;
      delete remaining.autonomy;
    }
    this.pendingControls = remaining;
  }

  private finishTurn(): void {
    if (!this.turnInFlight) return;
    this.turnInFlight = false;
    this.currentTurnId = null;
    this.interruptRequested = false;
    this.output.push({ type: "turn_complete" });
    for (const waiter of this.turnFinishWaiters.splice(0)) waiter();
  }

  private completeFromTurn(turn: Record<string, unknown>): void {
    if (turn.status === "completed" || turn.status === "interrupted") {
      this.finishTurn();
      return;
    }
    if (turn.status === "failed") {
      if (!this.interruptRequested) {
        this.output.push({ type: "error", ...normalizeCodexError(turn.error) });
      }
      this.finishTurn();
    }
  }

  private failSession(error: unknown): void {
    if (this.terminal) return;
    this.terminal = true;
    this.turnInFlight = false;
    this.output.push({ type: "error", ...normalizeCodexError(error) });
    this.output.push({ type: "session_ended", reason: "died" });
    this.output.end();
    this.client.close();
  }
}
