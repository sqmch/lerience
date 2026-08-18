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
  sessionId: string | null;
  messages: SeminarTranscriptMessage[];
  totalCostUsd: number;
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
