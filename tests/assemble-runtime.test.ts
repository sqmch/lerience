import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assembleRuntime,
  copyNpmTree,
  normalizeRuntimeFileMode,
} from "../scripts/assemble-runtime.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("runtime input normalization", () => {
  it("normalizes cached POSIX modes while preserving executable files", () => {
    expect(normalizeRuntimeFileMode(0o100664, "darwin")).toBe(0o644);
    expect(normalizeRuntimeFileMode(0o100775, "darwin")).toBe(0o755);
    expect(normalizeRuntimeFileMode(0o100664, "win32")).toBe(0o100664);
  });

  it("excludes package-manager shims nested inside the npm package", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-npm-copy-test-"));
    temporaryRoots.push(root);
    const source = path.join(root, "source");
    const destination = path.join(root, "destination");
    fs.mkdirSync(path.join(source, "bin"), { recursive: true });
    fs.mkdirSync(path.join(source, "node_modules", ".bin"), { recursive: true });
    fs.mkdirSync(path.join(source, "node_modules", "kept"), { recursive: true });
    fs.writeFileSync(path.join(source, "bin", "npm-cli.js"), "npm");
    fs.writeFileSync(path.join(source, "node_modules", ".bin", "npm.cmd"), "generated");
    fs.writeFileSync(path.join(source, "node_modules", "kept", "index.js"), "kept");

    await copyNpmTree(source, destination);

    expect(fs.readFileSync(path.join(destination, "bin", "npm-cli.js"), "utf8")).toBe("npm");
    expect(
      fs.readFileSync(path.join(destination, "node_modules", "kept", "index.js"), "utf8"),
    ).toBe("kept");
    expect(fs.existsSync(path.join(destination, "node_modules", ".bin"))).toBe(false);
  });

  it("reports every candidate tree and removes an unaccepted target without a manifest", async () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-runtime-candidate-test-"));
    temporaryRoots.push(fixtureRoot);
    const sourcesRoot = path.join(fixtureRoot, "sources");
    const courseEngineRoot = path.join(sourcesRoot, "course-engine");
    const gitRoot = path.join(sourcesRoot, "git");
    const npmRoot = path.join(sourcesRoot, "npm");
    const licensesRoot = path.join(sourcesRoot, "licenses");
    const outputRoot = path.join(fixtureRoot, "runtime-output");
    fs.mkdirSync(path.join(courseEngineRoot, "template", "scripts"), { recursive: true });
    fs.mkdirSync(path.join(gitRoot, "bin"), { recursive: true });
    fs.mkdirSync(path.join(npmRoot, "bin"), { recursive: true });
    fs.mkdirSync(licensesRoot, { recursive: true });
    fs.writeFileSync(
      path.join(courseEngineRoot, "manifest.json"),
      JSON.stringify({
        engineVersion: "1.0.0",
        source: { repository: "https://example.test/course-engine", commit: "abc123" },
      }),
    );
    fs.writeFileSync(path.join(courseEngineRoot, "template", "CLAUDE.md"), "course");
    fs.writeFileSync(path.join(courseEngineRoot, "template", "scripts", "doctor.mjs"), "doctor");
    fs.writeFileSync(path.join(gitRoot, "bin", "git"), "git");
    fs.writeFileSync(path.join(npmRoot, "bin", "npm-cli.js"), "npm");
    const licenseSources = Object.fromEntries(
      ["dugite", "git", "npm", "notices"].map((name) => {
        const filePath = path.join(licensesRoot, `${name}.txt`);
        fs.writeFileSync(filePath, `${name} license`);
        return [name, filePath];
      }),
    );
    const ledger = {
      acceptedComponentTrees: {},
      components: {
        git: {
          nativeVersion: "1.0.0",
          license: "test",
          targets: { "darwin-arm64": { url: "https://example.test/git.tar.gz" } },
        },
        npm: {
          version: "1.0.0",
          license: "test",
          url: "https://example.test/npm.tgz",
        },
      },
    };

    let failure: Error | undefined;
    try {
      await assembleRuntime({
        platform: "darwin",
        architecture: "arm64",
        targetKey: "darwin-arm64",
        ledger,
        sources: {
          courseEngineRoot,
          gitRoot,
          npmRoot,
          licenseSources,
          remoteLicenses: { "remote.txt": Buffer.from("remote license") },
        },
        outputRoot,
      });
    } catch (error) {
      failure = error as Error;
    }

    expect(failure?.message).toContain(
      "The reviewed ledger has no accepted component trees for darwin-arm64.",
    );
    expect(failure?.message).toMatch(
      /"course-engine":\{"fileCount":\d+,"treeSha256":"[a-f0-9]{64}"\}/u,
    );
    expect(failure?.message).toMatch(/"git":\{"fileCount":\d+,"treeSha256":"[a-f0-9]{64}"\}/u);
    expect(failure?.message).toMatch(/"npm":\{"fileCount":\d+,"treeSha256":"[a-f0-9]{64}"\}/u);
    expect(fs.existsSync(outputRoot)).toBe(false);
    expect(fs.existsSync(path.join(outputRoot, "manifest.json"))).toBe(false);
  });
});
