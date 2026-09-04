import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverInstalledProviderRuntime } from "../src/main/provider/installed-runtime";

describe("installed provider runtime discovery", () => {
  it("finds a complete desktop runtime without Codex's injected PATH", () => {
    const root = "C:\\Local\\OpenAI\\Codex\\bin";
    const complete = path.win32.join(root, "0123456789abcdef");
    const files = new Set(
      ["codex.exe", "codex-command-runner.exe", "codex-windows-sandbox-setup.exe"].map((name) =>
        path.win32.join(complete, name),
      ),
    );
    expect(
      discoverInstalledProviderRuntime("codex", {
        platform: "win32",
        environment: { LOCALAPPDATA: "C:\\Local", Path: "C:\\Windows" },
        directories: (candidate) =>
          candidate === root ? ["abcdef0123456789", "0123456789abcdef", "../untrusted"] : [],
        isFile: (candidate) => files.has(candidate),
      }),
    ).toEqual({
      providerId: "codex",
      executablePath: path.win32.join(complete, "codex.exe"),
      source: "well-known",
    });
  });
  it("reports an incomplete Windows Codex installation as unavailable", () => {
    expect(
      discoverInstalledProviderRuntime("codex", {
        platform: "win32",
        environment: { Path: "C:\\incomplete" },
        isFile: (candidate) => candidate === "C:\\incomplete\\codex.exe",
      }),
    ).toMatchObject({ executablePath: null });
  });
  it("skips an incomplete Windows Codex install in favor of a complete PATH install", () => {
    const stale = "C:\\old\\codex.exe";
    const complete = "C:\\current\\codex.exe";
    const files = new Set([
      stale,
      complete,
      "C:\\current\\codex-command-runner.exe",
      "C:\\current\\codex-windows-sandbox-setup.exe",
    ]);
    expect(
      discoverInstalledProviderRuntime("codex", {
        platform: "win32",
        environment: { Path: "C:\\old;C:\\current" },
        isFile: (candidate) => files.has(candidate),
      }),
    ).toMatchObject({ executablePath: complete });
  });
  it("finds official Windows install locations without requiring terminal PATH", () => {
    const expected = path.win32.join(
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
        isFile: (candidate) =>
          [expected, "codex-command-runner.exe", "codex-windows-sandbox-setup.exe"].some(
            (file) =>
              candidate === file ||
              candidate === path.win32.join(path.win32.dirname(expected), file),
          ),
      }),
    ).toEqual({ providerId: "codex", executablePath: expected, source: "well-known" });
  });

  it("finds native provider executables on PATH and ignores command wrappers", () => {
    const expected = path.win32.join("C:/Program Files/Claude Code", "claude.exe");
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
    const expected = path.posix.join("/opt/provider tools/bin", "codex");
    expect(
      discoverInstalledProviderRuntime("codex", {
        platform: "linux",
        environment: { PATH: "/usr/bin:/opt/provider tools/bin" },
        isFile: (candidate) => candidate === expected,
      }),
    ).toEqual({ providerId: "codex", executablePath: expected, source: "path" });
  });

  it.each(["Codex.app", "ChatGPT.app"])(
    "finds the Codex CLI bundled in the macOS %s app with Finder's minimal PATH",
    (appName) => {
      const expected = `/Applications/${appName}/Contents/Resources/codex`;
      expect(
        discoverInstalledProviderRuntime("codex", {
          platform: "darwin",
          environment: {
            HOME: "/Users/learner",
            PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
          },
          isFile: (candidate) => candidate === expected,
        }),
      ).toEqual({ providerId: "codex", executablePath: expected, source: "well-known" });
    },
  );

  it("prefers the macOS desktop app over a separate global Codex CLI", () => {
    const bundled = "/Applications/Codex.app/Contents/Resources/codex";
    expect(
      discoverInstalledProviderRuntime("codex", {
        platform: "darwin",
        environment: {
          HOME: "/Users/learner",
          PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
        },
        isFile: (candidate) => candidate === bundled || candidate === "/usr/local/bin/codex",
      }),
    ).toEqual({ providerId: "codex", executablePath: bundled, source: "well-known" });
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
