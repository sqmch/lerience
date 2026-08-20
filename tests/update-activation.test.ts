import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { registerUpdateActivationCheck } from "../src/main/update/activation";

describe("update checks on app activation", () => {
  it("checks again when a still-running macOS app is reopened", () => {
    const app = new EventEmitter();
    const updates = {
      current: vi.fn(() => ({ phase: "current" }) as const),
      checkForUpdate: vi.fn(async () => ({ phase: "current" }) as const),
    };

    registerUpdateActivationCheck(app, updates);
    app.emit("activate");

    expect(updates.checkForUpdate).toHaveBeenCalledOnce();
  });

  it("preserves an update that is already available or downloaded", () => {
    const app = new EventEmitter();
    const updates = {
      current: vi.fn(
        () =>
          ({
            phase: "ready",
            version: "0.0.6",
            releaseNotes: "",
            action: "open-package",
          }) as const,
      ),
      checkForUpdate: vi.fn(),
    };

    registerUpdateActivationCheck(app, updates);
    app.emit("activate");

    expect(updates.checkForUpdate).not.toHaveBeenCalled();
  });

  it("retries a failed update check on activation", () => {
    const app = new EventEmitter();
    const updates = {
      current: vi.fn(
        () =>
          ({
            phase: "error",
            operation: "check",
            detail: "Updates could not be checked.",
          }) as const,
      ),
      checkForUpdate: vi.fn(async () => ({ phase: "current" }) as const),
    };

    registerUpdateActivationCheck(app, updates);
    app.emit("activate");

    expect(updates.checkForUpdate).toHaveBeenCalledOnce();
  });
});
