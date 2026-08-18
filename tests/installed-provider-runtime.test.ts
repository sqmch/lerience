import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverInstalledProviderRuntime } from "../src/main/provider/installed-runtime";

describe("installed provider runtime discovery", () => {
  it("finds official Windows install locations without requiring terminal PATH", () => {
    const expected = path.join(
      "C:/Users/learner/AppData/Local",
      "Programs",
      "OpenAI",
      "Codex",
      "bin",
      "codex.exe",
    );
    expect(
      discoverInstalledProviderRuntime("codex", {
        platform: "win32",
        environment: {
          LOCALAPPDATA: "C:/Users/learner/AppData/Local",
          USERPROFILE: "C:/Users/learner",
          Path: "",
        },
        isFile: (candidate) => candidate === expected,
      }),
    ).toEqual({ providerId: "codex", executablePath: expected, source: "well-known" });
  });

  it("finds native provider executables on PATH and ignores command wrappers", () => {
    const expected = path.join("C:/Program Files/Claude Code", "claude.exe");
    expect(
      discoverInstalledProviderRuntime("claude", {
        platform: "win32",
        environment: {
          Path: 'C:/wrappers;"C:/Program Files/Claude Code"',
          USERPROFILE: "C:/Users/learner",
        },
        isFile: (candidate) => candidate === expected,
      }),
    ).toEqual({ providerId: "claude", executablePath: expected, source: "path" });
  });

  it("works with a minimal PATH-only environment", () => {
    const expected = path.join("/opt/provider tools/bin", "codex");
    expect(
      discoverInstalledProviderRuntime("codex", {
        platform: "linux",
        environment: { PATH: "/usr/bin:/opt/provider tools/bin" },
        isFile: (candidate) => candidate === expected,
      }),
    ).toEqual({ providerId: "codex", executablePath: expected, source: "path" });
  });

  it("reports a missing install as data instead of inventing a bundled fallback", () => {
    expect(
      discoverInstalledProviderRuntime("claude", {
        platform: "darwin",
        environment: { HOME: "/Users/learner", PATH: "/usr/bin" },
        isFile: () => false,
      }),
    ).toEqual({ providerId: "claude", executablePath: null, source: null });
  });
});
