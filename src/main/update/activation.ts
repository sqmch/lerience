import type { UpdateStatus } from "../../shared/update";

export interface AppActivationSource {
  on(event: "activate", listener: () => void): unknown;
}

export interface UpdateActivationTarget {
  current(): UpdateStatus;
  checkForUpdate(): Promise<UpdateStatus>;
}

export function registerUpdateActivationCheck(
  app: AppActivationSource,
  updates: UpdateActivationTarget,
): void {
  app.on("activate", () => {
    const status = updates.current();
    const canRecheck =
      status.phase === "current" || (status.phase === "error" && status.operation === "check");
    if (canRecheck) void updates.checkForUpdate();
  });
}
