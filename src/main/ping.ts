import type { PingReply } from "../shared/ipc";

export function buildPingReply(
  appVersion: string,
  versions: Partial<Record<"electron" | "chrome" | "node", string>>,
): PingReply {
  return {
    pong: true,
    appVersion,
    runtime: {
      electron: versions.electron ?? "unknown",
      chrome: versions.chrome ?? "unknown",
      node: versions.node ?? "unknown",
    },
  };
}
