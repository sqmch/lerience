import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const packageVersion = (
  JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")) as { version: string }
).version;

function runtimeFixture(
  platform: "win32" | "darwin",
  architecture: "x64" | "arm64",
  overrides: Record<string, unknown> = {},
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-desktop-artifacts-"));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, "manifest.json"),
    JSON.stringify({
      schemaVersion: 4,
      appVersion: packageVersion,
      target: { platform, architecture },
      ...overrides,
    }),
  );
  return root;
}

function packageEnvironment(
  targetKey: string,
  runtimeRoot: string,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PRAXEUM_DESKTOP_TARGET: targetKey,
    PRAXEUM_PRODUCT_NAME: "Approved Product",
    PRAXEUM_APP_ID: "com.example.approved-product",
    PRAXEUM_EXECUTABLE_NAME: "ApprovedProduct",
    PRAXEUM_RUNTIME_ROOT: runtimeRoot,
    ...overrides,
  };
}

function evaluate(source: string, environment: NodeJS.ProcessEnv = process.env) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: path.resolve("."),
    encoding: "utf8",
    env: environment,
  });
}

function readConfiguration(targetKey: string, runtimeRoot: string) {
  const result = evaluate(
    "const config=(await import('./electron-builder.config.mjs')).default; console.log(JSON.stringify(config));",
    packageEnvironment(targetKey, runtimeRoot),
  );
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("desktop artifact targets", () => {
  it.each([
    ["win32-x64", "win32", "x64"],
    ["darwin-arm64", "darwin", "arm64"],
    ["darwin-x64", "darwin", "x64"],
  ] as const)("binds %s to an exact runtime manifest", (targetKey, platform, architecture) => {
    const runtimeRoot = runtimeFixture(platform, architecture);
    const result = evaluate(
      "const {readDesktopPackageInputs}=await import('./scripts/desktop-artifacts.mjs'); console.log(JSON.stringify(readDesktopPackageInputs()));",
      packageEnvironment(targetKey, runtimeRoot),
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      productName: "Approved Product",
      appId: "com.example.approved-product",
      executableName: "ApprovedProduct",
      runtimeRoot,
      target: { key: targetKey, platform, architecture },
    });
  });

  it("fails closed on missing identity and a wrong-target runtime", () => {
    const runtimeRoot = runtimeFixture("darwin", "arm64");
    const missingIdentity = evaluate(
      "const {readDesktopPackageInputs}=await import('./scripts/desktop-artifacts.mjs'); readDesktopPackageInputs();",
      packageEnvironment("darwin-arm64", runtimeRoot, { PRAXEUM_APP_ID: "" }),
    );
    expect(missingIdentity.status).toBe(1);
    expect(missingIdentity.stderr).toContain("PRAXEUM_APP_ID is required");

    const wrongTarget = evaluate(
      "const {readDesktopPackageInputs}=await import('./scripts/desktop-artifacts.mjs'); readDesktopPackageInputs();",
      packageEnvironment("win32-x64", runtimeRoot),
    );
    expect(wrongTarget.status).toBe(1);
    expect(wrongTarget.stderr).toContain("does not match this win32-x64 app build");
  });

  it("rejects inherited object keys as unsupported targets", () => {
    const result = evaluate(
      "const {resolveDesktopTarget}=await import('./scripts/desktop-artifacts.mjs'); resolveDesktopTarget('__proto__');",
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported desktop target: __proto__");
  });

  it("preserves the Windows NSIS package contract", () => {
    const config = readConfiguration("win32-x64", runtimeFixture("win32", "x64"));

    expect(config).toMatchObject({
      appId: "com.example.approved-product",
      productName: "Approved Product",
      publish: null,
      forceCodeSigning: false,
      directories: { output: "dist/package/windows-x64" },
      win: {
        icon: "build/icon.ico",
        executableName: "ApprovedProduct",
        target: [{ target: "nsis", arch: ["x64"] }],
      },
      nsis: {
        oneClick: false,
        perMachine: false,
        artifactName: "ApprovedProduct-Setup-${version}-${arch}.${ext}",
      },
      extraResources: [
        { to: "runtime" },
        { from: "distribution/THIRD-PARTY-NOTICES.md", to: "THIRD-PARTY-NOTICES.md" },
      ],
    });
    expect(config).not.toHaveProperty("mac");
    expect(config).not.toHaveProperty("dmg");
  });

  it.each([
    ["darwin-arm64", "arm64", "dist/package/macos-arm64"],
    ["darwin-x64", "x64", "dist/package/macos-x64"],
  ] as const)("materializes one unsigned DMG for %s", (targetKey, architecture, output) => {
    const config = readConfiguration(targetKey, runtimeFixture("darwin", architecture));

    expect(config).toMatchObject({
      appId: "com.example.approved-product",
      productName: "Approved Product",
      publish: null,
      forceCodeSigning: false,
      directories: { output },
      mac: {
        icon: "build/icon.png",
        category: "public.app-category.education",
        executableName: "ApprovedProduct",
        extendInfo: { LSFileQuarantineEnabled: true },
        identity: null,
        hardenedRuntime: false,
        notarize: false,
        target: [{ target: "dmg", arch: [architecture] }],
      },
      dmg: { artifactName: "ApprovedProduct-${version}-${arch}.${ext}" },
    });
    expect(config).not.toHaveProperty("win");
    expect(config).not.toHaveProperty("nsis");
  });

  it("requires native target hardware", () => {
    const result = evaluate(
      "const {assertNativeTarget}=await import('./scripts/build-desktop-artifact.mjs'); const {resolveDesktopTarget}=await import('./scripts/desktop-artifacts.mjs'); assertNativeTarget(resolveDesktopTarget('darwin-arm64'), {platform:'win32',arch:'x64'});",
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "darwin-arm64 must be built on darwin-arm64; this host is win32-x64",
    );
  });

  it("disables signing discovery without leaking signing credentials", () => {
    const result = evaluate(
      "const {unsignedBuildEnvironment}=await import('./scripts/build-desktop-artifact.mjs'); console.log(JSON.stringify(unsignedBuildEnvironment({KEPT:'yes',CSC_LINK:'secret',CSC_KEY_PASSWORD:'secret',APPLE_API_KEY:'secret',APPLE_ID:'secret'}, 'darwin-arm64')));",
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      KEPT: "yes",
      PRAXEUM_DESKTOP_TARGET: "darwin-arm64",
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
    });
  });

  it("describes the exact current application artifacts once", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-release-artifacts-"));
    roots.push(directory);
    const windowsName = `Lerience-Setup-${packageVersion}-x64.exe`;
    const armMacName = `Lerience-${packageVersion}-arm64.dmg`;
    const intelMacName = `Lerience-${packageVersion}-x64.dmg`;
    fs.writeFileSync(path.join(directory, windowsName), "windows");
    fs.writeFileSync(path.join(directory, armMacName), "arm macos");
    fs.writeFileSync(path.join(directory, intelMacName), "intel macos");
    const result = evaluate(
      `const {describeDesktopReleaseArtifacts}=await import('./scripts/desktop-artifacts.mjs'); console.log(JSON.stringify(await describeDesktopReleaseArtifacts({directory:${JSON.stringify(directory)}, executableName:'Lerience'})));`,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      expect.objectContaining({
        platform: "win32",
        architecture: "x64",
        packageType: "nsis",
        fileName: windowsName,
        size: 7,
        sha256: createHash("sha256").update("windows").digest("hex"),
      }),
      expect.objectContaining({
        platform: "darwin",
        architecture: "arm64",
        packageType: "dmg",
        fileName: armMacName,
        size: 9,
        sha256: createHash("sha256").update("arm macos").digest("hex"),
      }),
      expect.objectContaining({
        platform: "darwin",
        architecture: "x64",
        packageType: "dmg",
        fileName: intelMacName,
        size: 11,
        sha256: createHash("sha256").update("intel macos").digest("hex"),
      }),
    ]);
  });

  it("rejects extra package variants and duplicate target requests", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-release-artifacts-"));
    roots.push(directory);
    fs.writeFileSync(path.join(directory, `Lerience-Setup-${packageVersion}-x64.exe`), "windows");
    fs.writeFileSync(path.join(directory, `Lerience-${packageVersion}-arm64.dmg`), "macos");
    fs.writeFileSync(path.join(directory, `Lerience-${packageVersion}-x64.dmg`), "intel macos");
    fs.writeFileSync(path.join(directory, `Lerience-${packageVersion}-arm64.zip`), "unwanted");
    const extraVariant = evaluate(
      `const {describeDesktopReleaseArtifacts}=await import('./scripts/desktop-artifacts.mjs'); await describeDesktopReleaseArtifacts({directory:${JSON.stringify(directory)}, executableName:'Lerience'});`,
    );
    expect(extraVariant.status).toBe(1);
    expect(extraVariant.stderr).toContain("does not contain the exact desktop artifacts");

    fs.rmSync(path.join(directory, `Lerience-${packageVersion}-arm64.zip`));
    const duplicateTarget = evaluate(
      `const {describeDesktopReleaseArtifacts}=await import('./scripts/desktop-artifacts.mjs'); await describeDesktopReleaseArtifacts({directory:${JSON.stringify(directory)}, executableName:'Lerience', targetKeys:['win32-x64','win32-x64']});`,
    );
    expect(duplicateTarget.status).toBe(1);
    expect(duplicateTarget.stderr).toContain("duplicate desktop target");
  });
});
