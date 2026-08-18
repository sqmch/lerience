import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeRuntimeTree,
  describeRuntimePayloadTree,
  inspectPackagedRuntime,
  type RuntimeManifest,
} from "../src/main/runtime-manifest";
import { resolvePackagedRuntimeRoot, resolveRuntimeLayout } from "../src/main/runtime-layout";

const temporaryRoots: string[] = [];

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fixture(): Promise<{ root: string; manifest: RuntimeManifest }> {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-runtime-test-"));
  temporaryRoots.push(resources);
  const layout = resolveRuntimeLayout({
    packaged: true,
    resourcesPath: resources,
    platform: "win32",
    architecture: "x64",
  });
  if (layout.root === null) throw new Error("fixture did not create a packaged layout");

  const componentFiles: Record<RuntimeManifest["components"][number]["id"], string[]> = {
    "course-engine": [
      "course-engine/manifest.json",
      "course-engine/template/CLAUDE.md",
      "course-engine/template/scripts/doctor.mjs",
    ],
    git: ["tools/git/cmd/git.exe"],
    npm: ["tools/npm/bin/npm-cli.js", "tools/npm/bin/npm.cmd", "tools/npm/bin/node.cmd"],
  };
  const components = await Promise.all(
    Object.entries(componentFiles).map(async ([id, files]) => {
      const requiredFiles = files.map((file) => {
        const bytes = Buffer.from(`fixture:${file}`);
        const absolutePath = path.join(layout.root as string, ...file.split("/"));
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, bytes);
        return { path: file, size: bytes.length, sha256: sha256(bytes) };
      });
      const componentRoots: Record<string, string[]> = {
        "course-engine": ["course-engine"],
        git: ["tools", "git"],
        npm: ["tools", "npm"],
      };
      const componentRoot = path.join(layout.root as string, ...(componentRoots[id] ?? []));
      const tree = await describeRuntimeTree(componentRoot);
      return {
        id: id as RuntimeManifest["components"][number]["id"],
        version: "1.0.0",
        license: "test",
        source: "https://example.test/source",
        ...tree,
        requiredFiles,
      };
    }),
  );
  const payload = await describeRuntimePayloadTree(layout.root);
  const manifest: RuntimeManifest = {
    schemaVersion: 4,
    appVersion: "0.0.1",
    target: { platform: "win32", architecture: "x64" },
    components,
    payload,
  };
  fs.writeFileSync(layout.manifestPath as string, JSON.stringify(manifest));
  return { root: resources, manifest };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("packaged runtime manifest", () => {
  it("accepts an exact target with every critical file declared and verified", async () => {
    const { root, manifest } = await fixture();
    const layout = resolveRuntimeLayout({
      packaged: true,
      resourcesPath: root,
      platform: "win32",
      architecture: "x64",
    });
    await expect(inspectPackagedRuntime(layout, "0.0.1")).resolves.toEqual({ ok: true, manifest });
  });

  it.runIf(process.env["PRAXEUM_RUNTIME_ROOT"] !== undefined)(
    "accepts the exact assembled Windows runtime",
    async () => {
      const runtimeRoot = process.env["PRAXEUM_RUNTIME_ROOT"];
      if (runtimeRoot === undefined) throw new Error("PRAXEUM_RUNTIME_ROOT was removed");
      const layout = resolvePackagedRuntimeRoot(runtimeRoot, "win32", "x64");
      await expect(inspectPackagedRuntime(layout, "0.0.1")).resolves.toMatchObject({ ok: true });
    },
    60_000,
  );

  it("fails closed on a corrupt file, a wrong target, or an omitted critical path", async () => {
    const corrupt = await fixture();
    let layout = resolveRuntimeLayout({
      packaged: true,
      resourcesPath: corrupt.root,
      platform: "win32",
      architecture: "x64",
    });
    fs.appendFileSync(layout.gitExecutable, "tampered");
    await expect(inspectPackagedRuntime(layout, "0.0.1")).resolves.toMatchObject({ ok: false });

    const wrongTarget = await fixture();
    layout = resolveRuntimeLayout({
      packaged: true,
      resourcesPath: wrongTarget.root,
      platform: "win32",
      architecture: "arm64",
    });
    await expect(inspectPackagedRuntime(layout, "0.0.1")).resolves.toEqual({
      ok: false,
      reason: "The packaged runtime targets a different system.",
    });

    const omitted = await fixture();
    const manifestPath = path.join(omitted.root, "runtime", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as RuntimeManifest;
    const gitComponent = manifest.components.find((component) => component.id === "git");
    if (gitComponent === undefined) throw new Error("fixture has no Git component");
    gitComponent.requiredFiles = [
      { ...gitComponent.requiredFiles[0]!, path: "tools/git/other.exe" },
    ];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    layout = resolveRuntimeLayout({
      packaged: true,
      resourcesPath: omitted.root,
      platform: "win32",
      architecture: "x64",
    });
    await expect(inspectPackagedRuntime(layout, "0.0.1")).resolves.toEqual({
      ok: false,
      reason: "The runtime manifest omits tools/git/cmd/git.exe.",
    });
  });

  it("fails closed when a noncritical component file is changed, added, or removed", async () => {
    const changed = await fixture();
    let layout = resolveRuntimeLayout({
      packaged: true,
      resourcesPath: changed.root,
      platform: "win32",
      architecture: "x64",
    });
    fs.writeFileSync(path.join(layout.root as string, "tools", "npm", "helper.js"), "extra");
    await expect(inspectPackagedRuntime(layout, "0.0.1")).resolves.toEqual({
      ok: false,
      reason: "The packaged npm runtime tree is corrupt.",
    });

    const removed = await fixture();
    layout = resolveRuntimeLayout({
      packaged: true,
      resourcesPath: removed.root,
      platform: "win32",
      architecture: "x64",
    });
    fs.rmSync(path.join(layout.root as string, "tools", "npm", "bin", "node.cmd"));
    await expect(inspectPackagedRuntime(layout, "0.0.1")).resolves.toMatchObject({ ok: false });
  });

  it("fails closed when an undeclared root payload is added", async () => {
    const changed = await fixture();
    const layout = resolveRuntimeLayout({
      packaged: true,
      resourcesPath: changed.root,
      platform: "win32",
      architecture: "x64",
    });
    fs.writeFileSync(path.join(layout.root as string, "codex.exe"), "unexpected provider binary");

    await expect(inspectPackagedRuntime(layout, "0.0.1")).resolves.toEqual({
      ok: false,
      reason: "The packaged runtime payload is corrupt.",
    });
  });

  it("rejects a complete runtime from a different app build", async () => {
    const stale = await fixture();
    const layout = resolveRuntimeLayout({
      packaged: true,
      resourcesPath: stale.root,
      platform: "win32",
      architecture: "x64",
    });
    await expect(inspectPackagedRuntime(layout, "0.0.2")).resolves.toEqual({
      ok: false,
      reason: "The packaged runtime belongs to a different app version.",
    });
  });
});
