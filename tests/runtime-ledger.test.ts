import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import engineManifest from "../course-engine/manifest.json" with { type: "json" };
import packageJson from "../package.json" with { type: "json" };

interface TargetSource {
  url: string;
  sha256?: string;
  integrity?: string;
  package?: string;
}

interface RuntimeLedger {
  schemaVersion: number;
  targets: string[];
  acceptedComponentTrees: Record<string, Record<string, { fileCount: number; treeSha256: string }>>;
  components: {
    npm: { version: string; url: string; integrity: string };
    git: { packageVersion: string; targets: Record<string, TargetSource> };
    notices: {
      git: { version: string; license: string; url: string; sha256: string };
      gitLfs: { version: string; license: string; url: string; sha256: string };
    };
  };
}

const ledger = JSON.parse(
  readFileSync(path.resolve("distribution/runtime-ledger.json"), "utf8"),
) as RuntimeLedger;
const workspaceConfig = readFileSync(path.resolve("pnpm-workspace.yaml"), "utf8");
const lockfile = readFileSync(path.resolve("pnpm-lock.yaml"), "utf8");

describe("runtime supply ledger", () => {
  it("pins the package inputs consumed by the source and App Server contract", () => {
    expect(ledger.schemaVersion).toBe(2);
    expect(ledger.components.npm.version).toBe(packageJson.devDependencies.npm);
    expect(ledger.components.git.packageVersion).toBe(packageJson.devDependencies.dugite);
    expect(engineManifest.engineVersion).toBe("0.1.0");
  });

  it("cannot install provider-native payloads through the dependency graph", () => {
    const declared = { ...packageJson.dependencies, ...packageJson.devDependencies };
    expect(Object.keys(declared)).not.toContain("@openai/codex");
    expect(
      Object.keys(declared).some((name) => name.startsWith("@anthropic-ai/claude-agent-sdk-")),
    ).toBe(false);
    expect(workspaceConfig).toContain('"@anthropic-ai/claude-agent-sdk-*"');
    expect(lockfile).not.toContain("@anthropic-ai/claude-agent-sdk-win32");
    expect(lockfile).not.toContain("@anthropic-ai/claude-agent-sdk-darwin");
    expect(lockfile).not.toContain("@openai/codex");
  });

  it("keeps assembler-only npm and Dugite out of the packaged production dependency graph", () => {
    expect(packageJson.dependencies).not.toHaveProperty("npm");
    expect(packageJson.dependencies).not.toHaveProperty("dugite");
    expect(packageJson.devDependencies.npm).toBe("11.19.0");
    expect(packageJson.devDependencies.dugite).toBe("3.2.3");
  });

  it("packages only the two main-process dependencies left external by electron-vite", () => {
    expect(Object.keys(packageJson.dependencies).sort()).toEqual([
      "@anthropic-ai/claude-agent-sdk",
      "zod",
    ]);
  });

  it("has an immutable HTTPS source and checksum/integrity for every release target", () => {
    expect(ledger.targets).toEqual(["win32-x64", "darwin-arm64", "darwin-x64"]);
    for (const target of ledger.targets) {
      const source = ledger.components.git.targets[target];
      expect(source, `git:${target}`).toBeDefined();
      if (source === undefined) throw new Error(`ledger is missing git:${target}`);
      expect(new URL(source.url).protocol).toBe("https:");
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/u);
    }
    expect(ledger.components.npm.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+={0,2}$/u);
    expect(ledger.components.notices.gitLfs.version).toBe("3.7.1");
    expect(new URL(ledger.components.notices.gitLfs.url).protocol).toBe("https:");
    expect(ledger.components.notices.gitLfs.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(ledger.components.notices.git.version).toBe("2.53.0");
    expect(new URL(ledger.components.notices.git.url).protocol).toBe("https:");
    expect(ledger.components.notices.git.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("binds the accepted Windows assembly to reviewed complete component trees", () => {
    expect(Object.keys(ledger.acceptedComponentTrees)).toEqual(["win32-x64"]);
    const windowsTrees = ledger.acceptedComponentTrees["win32-x64"];
    expect(Object.keys(windowsTrees ?? {}).sort()).toEqual(["course-engine", "git", "npm"]);
    for (const tree of Object.values(windowsTrees ?? {})) {
      expect(tree.fileCount).toBeGreaterThan(0);
      expect(tree.treeSha256).toMatch(/^[a-f0-9]{64}$/u);
    }
  });
});
