export type UpdateAction = "install-restart" | "open-package";

interface ReleaseSummary {
  version: string;
  releaseNotes: string;
}

export type UpdateStatus =
  | { phase: "unavailable" }
  | { phase: "checking" }
  | { phase: "current" }
  | ({ phase: "available" } & ReleaseSummary)
  | ({ phase: "downloading"; receivedBytes: number; totalBytes: number } & ReleaseSummary)
  | ({ phase: "ready"; action: UpdateAction } & ReleaseSummary)
  | ({ phase: "preparing"; action: UpdateAction } & ReleaseSummary)
  | {
      phase: "error";
      operation: "check" | "download" | "handoff";
      detail: string;
    };
