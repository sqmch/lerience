import { describe, expect, it, vi } from "vitest";
import {
  compatibilityState,
  createProviderRuntimeProbe,
  parseProviderVersion,
  PROVIDER_COMPATIBILITY,
  readinessForRuntime,
  type VersionCommandRunner,
} from "../src/main/provider/compatibility";

function result(stdout: string, exitCode = 0) {
  return { stdout, exitCode, missing: false, timedOut: false };
}

describe("provider runtime compatibility", () => {
  it("parses only a safe semantic version from public version output", () => {
    expect(parseProviderVersion("2.1.223 (Claude Code)\n")).toBe("2.1.223");
    expect(parseProviderVersion("codex-cli 0.144.6")).toBe("0.144.6");
    expect(parseProviderVersion("token=secret C:\\Users\\learner")).toBeNull();
  });

  it("normalizes provider minimum and major-version boundaries", () => {
    expect(compatibilityState("claude", "2.1.222")).toBe("provider-update-required");
    expect(compatibilityState("claude", PROVIDER_COMPATIBILITY.claude.minimum)).toBe("ready");
    expect(compatibilityState("claude", "2.99.0")).toBe("ready");
    expect(compatibilityState("claude", "3.0.0")).toBe("praxeum-update-required");
    expect(compatibilityState("codex", "0.144.5")).toBe("provider-update-required");
    expect(compatibilityState("codex", PROVIDER_COMPATIBILITY.codex.minimum)).toBe("ready");
    expect(compatibilityState("codex", "0.144.7")).toBe("ready");
    expect(compatibilityState("codex", "0.148.0")).toBe("ready");
  });

  it("runs the exact discovered executable with a minimal environment and no shell lookup", async () => {
    const executablePath = "C:\\Program Files\\OpenAI\\Codex\\bin\\codex.exe";
    const environment = { Path: "C:\\runtime\\git\\cmd" };
    const runner = vi.fn<VersionCommandRunner>(async () => result("codex-cli 0.144.6"));
    const probe = createProviderRuntimeProbe(
      { providerId: "codex", executablePath, source: "well-known" },
      environment,
      runner,
    );

    await expect(probe()).resolves.toEqual({ state: "ready", version: "0.144.6" });
    expect(runner).toHaveBeenCalledWith(executablePath, environment);
  });

  it("fails closed for missing, changed, and temporarily unavailable runtimes", async () => {
    const missing = createProviderRuntimeProbe({
      providerId: "claude",
      executablePath: null,
      source: null,
    });
    const changed = createProviderRuntimeProbe(
      { providerId: "claude", executablePath: "C:\\tools\\claude.exe", source: "path" },
      undefined,
      async () => result("Claude changed its version output"),
    );
    const unavailable = createProviderRuntimeProbe(
      { providerId: "claude", executablePath: "C:\\tools\\claude.exe", source: "path" },
      undefined,
      async () => ({ ...result(""), timedOut: true }),
    );

    await expect(missing()).resolves.toEqual({ state: "not-installed", version: null });
    await expect(changed()).resolves.toEqual({
      state: "praxeum-update-required",
      version: null,
    });
    await expect(unavailable()).resolves.toEqual({
      state: "temporarily-unavailable",
      version: null,
    });
  });

  it("keeps runtime failures free of executable paths and provider output", () => {
    expect(
      readinessForRuntime(
        { id: "codex", label: "Codex", description: "Use Codex." },
        { state: "temporarily-unavailable", version: null },
      ),
    ).toEqual({
      id: "codex",
      label: "Codex",
      description: "Use Codex.",
      runtime: { state: "temporarily-unavailable", version: null },
      connection: "unavailable",
      accountLabel: null,
      planLabel: null,
      usage: null,
      canLogin: false,
      detail: "Codex could not be reached just now. Check again in a moment.",
    });
  });

  it("describes an actual compatibility failure without claiming an app update exists", () => {
    expect(
      readinessForRuntime(
        { id: "claude", label: "Claude Code", description: "Use Claude." },
        { state: "praxeum-update-required", version: "3.0.0" },
      )?.detail,
    ).toBe(
      "The installed Claude Code 3.0.0 is not compatible with this Lerience build. Check for a newer release or choose another tutor.",
    );
  });
});
