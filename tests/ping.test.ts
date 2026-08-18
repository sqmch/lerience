import { describe, expect, it } from "vitest";
import { buildPingReply } from "../src/main/ping";
import { PING_CHANNEL } from "../src/shared/ipc";

describe("the ping IPC contract", () => {
  it("keeps the channel name stable (renderer bindings depend on it)", () => {
    expect(PING_CHANNEL).toBe("praxeum:ping");
  });

  it("reports the versions it was given", () => {
    const reply = buildPingReply("0.0.1", {
      electron: "43.0.0",
      chrome: "142.0.0",
      node: "22.0.0",
    });
    expect(reply).toEqual({
      pong: true,
      appVersion: "0.0.1",
      runtime: { electron: "43.0.0", chrome: "142.0.0", node: "22.0.0" },
    });
  });

  it("never fabricates a version", () => {
    const reply = buildPingReply("0.0.1", {});
    expect(reply.runtime).toEqual({ electron: "unknown", chrome: "unknown", node: "unknown" });
  });
});
