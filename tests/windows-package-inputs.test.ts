import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const script = path.resolve("scripts/windows-package-inputs.mjs");

function runtimeFixture(overrides: Record<string, unknown> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-package-inputs-"));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, "manifest.json"),
    JSON.stringify({
      schemaVersion: 4,
      appVersion: "0.0.2",
      target: { platform: "win32", architecture: "x64" },
      ...overrides,
    }),
  );
  return root;
}

function run(runtimeRoot: string, overrides: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PRAXEUM_PRODUCT_NAME: "Approved Product",
      PRAXEUM_APP_ID: "com.example.approved-product",
      PRAXEUM_EXECUTABLE_NAME: "ApprovedProduct",
      PRAXEUM_RUNTIME_ROOT: runtimeRoot,
      ...overrides,
    },
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("Windows package inputs", () => {
  it("accepts an explicit durable identity and matching runtime", () => {
    const result = run(runtimeFixture());
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      productName: "Approved Product",
      appId: "com.example.approved-product",
      executableName: "ApprovedProduct",
    });
  });

  it("fails closed instead of inventing missing product identity", () => {
    const result = run(runtimeFixture(), { PRAXEUM_APP_ID: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("PRAXEUM_APP_ID is required");
  });

  it("rejects a stale or wrong-target runtime", () => {
    const result = run(runtimeFixture({ target: { platform: "darwin", architecture: "arm64" } }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not match this Windows x64 app build");
  });

  it("materializes only the pinned NSIS configuration", () => {
    const runtimeRoot = runtimeFixture();
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        "const c=(await import('./electron-builder.config.mjs')).default; console.log(JSON.stringify({appId:c.appId,productName:c.productName,publish:c.publish,win:c.win,nsis:c.nsis,resources:c.extraResources}))",
      ],
      {
        cwd: path.resolve("."),
        encoding: "utf8",
        env: {
          ...process.env,
          PRAXEUM_PRODUCT_NAME: "Approved Product",
          PRAXEUM_APP_ID: "com.example.approved-product",
          PRAXEUM_EXECUTABLE_NAME: "ApprovedProduct",
          PRAXEUM_RUNTIME_ROOT: runtimeRoot,
        },
      },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      appId: "com.example.approved-product",
      productName: "Approved Product",
      publish: null,
      win: {
        icon: "build/icon.ico",
        executableName: "ApprovedProduct",
        target: [{ target: "nsis", arch: ["x64"] }],
      },
      nsis: { perMachine: false, artifactName: "ApprovedProduct-Setup-${version}-${arch}.${ext}" },
      resources: [
        { to: "runtime" },
        { from: "distribution/THIRD-PARTY-NOTICES.md", to: "THIRD-PARTY-NOTICES.md" },
      ],
    });
  });
});
