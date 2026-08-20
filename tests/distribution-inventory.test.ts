import { execFileSync, spawnSync } from "node:child_process";
import { createPackage } from "@electron/asar";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const script = path.resolve("scripts/distribution-inventory.mjs");

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-inventory-test-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "runtime", "tools", "npm", "bin"), { recursive: true });
  fs.writeFileSync(path.join(root, "runtime", "tools", "npm", "bin", "node"), "shim");
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("distribution inventory", () => {
  it("allows the Electron Node shim and ordinary app payload", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "app.bin"), "app");
    const output = execFileSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
    expect(JSON.parse(output)).toMatchObject({ violations: [] });
  });

  it.each([
    ["provider executable", ["resources", "codex.exe"]],
    ["standalone Node", ["resources", "node.exe"]],
    ["Claude native package", ["node_modules", "@anthropic-ai", "claude-agent-sdk-win32-x64"]],
    ["Codex native package", ["node_modules", "@openai", "codex"]],
  ])("rejects a %s", (_label, segments) => {
    const root = fixture();
    const forbidden = path.join(root, ...segments);
    fs.mkdirSync(path.dirname(forbidden), { recursive: true });
    if (path.extname(forbidden) !== "") fs.writeFileSync(forbidden, "forbidden");
    else {
      fs.mkdirSync(forbidden, { recursive: true });
      fs.writeFileSync(path.join(forbidden, "package.json"), "{}");
    }
    const result = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Distribution inventory contains forbidden payloads");
  });

  it("inspects provider payloads inside app.asar", async () => {
    const root = fixture();
    const source = path.join(root, "asar-source");
    fs.mkdirSync(path.join(source, "node_modules", "@openai", "codex"), { recursive: true });
    fs.writeFileSync(path.join(source, "node_modules", "@openai", "codex", "package.json"), "{}");
    await createPackage(source, path.join(root, "app.asar"));

    const result = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("provider-native-package");
  });

  it("requires packaged application dependency notices", async () => {
    const root = fixture();
    const source = path.join(root, "asar-source");
    fs.mkdirSync(path.join(source, "node_modules", "zod"), { recursive: true });
    fs.writeFileSync(path.join(source, "node_modules", "zod", "package.json"), "{}");
    await createPackage(source, path.join(root, "app.asar"));

    const result = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing-license-notice");
    expect(result.stderr).toContain("claude-agent-sdk/LICENSE.md");
  });

  it("accepts the exact package notice beneath a macOS app Resources directory", async () => {
    const root = fixture();
    const source = path.join(root, "asar-source");
    const applicationResources = path.join(root, "Lerience.app", "Contents", "Resources");
    fs.mkdirSync(path.join(source, "node_modules", "@anthropic-ai", "claude-agent-sdk"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(source, "node_modules", "zod"), { recursive: true });
    fs.writeFileSync(
      path.join(source, "node_modules", "@anthropic-ai", "claude-agent-sdk", "LICENSE.md"),
      "license",
    );
    fs.writeFileSync(path.join(source, "node_modules", "zod", "LICENSE"), "license");
    fs.mkdirSync(applicationResources, { recursive: true });
    await createPackage(source, path.join(applicationResources, "app.asar"));
    fs.writeFileSync(path.join(applicationResources, "THIRD-PARTY-NOTICES.md"), "notices");

    const output = execFileSync(process.execPath, [script, "--root", root], { encoding: "utf8" });

    expect(JSON.parse(output)).toMatchObject({ violations: [] });
  });

  it("does not accept the notice filename outside a Resources path", async () => {
    const root = fixture();
    const source = path.join(root, "asar-source");
    const applicationRoot = path.join(root, "Lerience.app", "Contents");
    const applicationResources = path.join(applicationRoot, "Resources");
    fs.mkdirSync(path.join(source, "node_modules", "@anthropic-ai", "claude-agent-sdk"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(source, "node_modules", "zod"), { recursive: true });
    fs.writeFileSync(
      path.join(source, "node_modules", "@anthropic-ai", "claude-agent-sdk", "LICENSE.md"),
      "license",
    );
    fs.writeFileSync(path.join(source, "node_modules", "zod", "LICENSE"), "license");
    fs.mkdirSync(applicationResources, { recursive: true });
    await createPackage(source, path.join(applicationResources, "app.asar"));
    fs.writeFileSync(path.join(applicationRoot, "THIRD-PARTY-NOTICES.md"), "notices");

    const result = spawnSync(process.execPath, [script, "--root", root], { encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing-license-notice: resources/third-party-notices.md");
  });

  it("enforces a physical unpacked-size ceiling", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "large.bin"), Buffer.alloc(64));
    const result = spawnSync(process.execPath, [script, "--root", root, "--max-bytes", "10"], {
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("limit is 10");
  });
});
