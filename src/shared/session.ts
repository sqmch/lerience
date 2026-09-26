/** App-conducted lifecycle state. Provider events stay in `seminar.ts`; these
 *  values describe durable logical sessions around the provider process. */
export type SeminarLifecycle =
  "closed" | "recoverable" | "opening" | "recovering" | "open" | "wrapping" | "close-failed";

export interface SeminarTranscriptMessage {
  id: string;
  role: "learner" | "tutor";
  content: string;
  partial: boolean;
}

export interface SeminarSnapshot {
  lifecycle: SeminarLifecycle;
  /** Live pre-turn gate. Never persisted or reconstructed from a transcript. */
  modelChoice?: { runtimeId: number; recovery: boolean; notice?: string };
  sessionId: string | null;
  messages: SeminarTranscriptMessage[];
  totalCostUsd: number;
  /** Live sample only; never restored from durable billing/transcript totals. */
  contextUsage?: import("./seminar").ContextUsage | null;
  /** Main-process truth. A live opener is already a turn even before its first
   *  visible delta reaches the renderer. */
  turnInProgress: boolean;
  /** The running provider can take a learner message into the turn in
   *  flight (ADR-042). False for a closed session and for providers that
   *  only queue; the composer reports whichever applies. */
  steerable: boolean;
  /** Live provider activity, never reconstructed from an old transcript. */
  backgroundTasks?: import("./seminar").BackgroundTask[];
  taskNotice?: import("./seminar").TaskOutcome | null;
  detail?: string;
}

export interface CheckRunSummary {
  outcome: "pass" | "fail" | "crash" | "no-checks";
  total: number;
  passed: number;
  failed: number;
  failedNames?: string[];
  detail?: string;
}

export type RunChecksReply =
  | { ok: true; result: CheckRunSummary }
  | { ok: false; reason: "bad-module" | "busy" | "error"; detail: string };
