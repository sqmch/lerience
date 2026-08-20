import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { stageDesktopRelease } from "../scripts/stage-desktop-release.mjs";

const roots: string[] = [];
const packageVersion = (
  JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")) as {
    version: string;
  }
).version;

it("loads as a direct Node CLI on the release workflow runtime", () => {
  const result = spawnSync(process.execPath, ["scripts/stage-desktop-release.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Usage: stage-desktop-release");
  expect(result.stderr).not.toContain("SyntaxError");
});

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function tarEntryNames(archive: Buffer): string[] {
  const tar = gunzipSync(archive);
  const names: string[] = [];
  let offset = 0;
  while (
    offset + 512 <= tar.length &&
    tar.subarray(offset, offset + 512).some((byte) => byte !== 0)
  ) {
    const header = tar.subarray(offset, offset + 512);
    const nameEnd = header.indexOf(0, 0);
    names.push(header.subarray(0, nameEnd === -1 ? 100 : nameEnd).toString("ascii"));
    const size = Number.parseInt(
      header.subarray(124, 136).toString("ascii").replaceAll("\0", "").trim(),
      8,
    );
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-stage-release-"));
  roots.push(root);
  const executableName = "ApprovedProduct";
  const artifactsDir = path.join(root, "artifacts");
  fs.mkdirSync(artifactsDir);
  const nsis = path.join(artifactsDir, `${executableName}-Setup-${packageVersion}-x64.exe`);
  const armDmg = path.join(artifactsDir, `${executableName}-${packageVersion}-arm64.dmg`);
  const intelDmg = path.join(artifactsDir, `${executableName}-${packageVersion}-x64.dmg`);
  const nsisBytes = Buffer.from("installer");
  const armDmgBytes = Buffer.from("arm mac package");
  const intelDmgBytes = Buffer.from("intel mac package");
  fs.writeFileSync(nsis, nsisBytes);
  fs.writeFileSync(armDmg, armDmgBytes);
  fs.writeFileSync(intelDmg, intelDmgBytes);
  const notes = path.join(root, "notes.md");
  const notices = path.join(root, "notices.md");
  fs.writeFileSync(notes, "A reviewed release candidate.\n");
  fs.writeFileSync(notices, "Reviewed third-party notices.\n");

  const keys = generateKeyPairSync("ed25519");
  const publicKey = path.join(root, "trusted-public.pem");
  fs.writeFileSync(publicKey, keys.publicKey.export({ type: "spki", format: "pem" }));
  const signedDir = path.join(root, "signed");
  fs.mkdirSync(signedDir);
  const manifest = {
    schemaVersion: 1,
    productId: "praxeum-desktop",
    channel: "stable",
    version: packageVersion,
    publishedAt: "2026-08-18T09:00:00.000Z",
    releaseNotes: "A reviewed release candidate.",
    artifacts: [
      {
        platform: "win32",
        architecture: "x64",
        packageType: "nsis",
        fileName: path.basename(nsis),
        size: nsisBytes.length,
        sha256: sha256(nsisBytes),
      },
      {
        platform: "darwin",
        architecture: "arm64",
        packageType: "dmg",
        fileName: path.basename(armDmg),
        size: armDmgBytes.length,
        sha256: sha256(armDmgBytes),
      },
      {
        platform: "darwin",
        architecture: "x64",
        packageType: "dmg",
        fileName: path.basename(intelDmg),
        size: intelDmgBytes.length,
        sha256: sha256(intelDmgBytes),
      },
    ],
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
  fs.writeFileSync(path.join(signedDir, "release-manifest.json"), manifestBytes);
  fs.writeFileSync(
    path.join(signedDir, "release-manifest.sig"),
    `${sign(null, manifestBytes, keys.privateKey).toString("base64")}\n`,
  );
  fs.copyFileSync(publicKey, path.join(signedDir, "release-public-key.pem"));

  const sources = path.join(root, "sources");
  fs.mkdirSync(sources);
  const sourceBytes = Buffer.from("corresponding source");
  const sourceFileName = "fixture-source.tar.gz";
  fs.writeFileSync(path.join(sources, sourceFileName), sourceBytes);
  const ledger = {
    schemaVersion: 1,
    sources: [
      {
        component: "Fixture",
        version: "1.0.0",
        revision: "fixture-revision",
        fileName: sourceFileName,
        url: "https://github.com/example/fixture/archive/revision.tar.gz",
        bytes: sourceBytes.length,
        sha256: sha256(sourceBytes),
      },
    ],
  };
  const sourceLedgerPath = path.join(root, "release-source-ledger.json");
  const ledgerBytes = `${JSON.stringify(ledger, null, 2)}\n`;
  fs.writeFileSync(sourceLedgerPath, ledgerBytes);
  fs.writeFileSync(path.join(sources, "release-source-ledger.json"), ledgerBytes);
  fs.writeFileSync(
    path.join(sources, "SOURCE-SHA256SUMS"),
    `${sha256(sourceBytes)}  ${sourceFileName}\n`,
  );

  return {
    root,
    options: {
      artifactsDir,
      signedDir,
      sources,
      notes,
      notices,
      publicKey,
      productName: "Approved Product",
      executableName,
      sourceCommit: "a".repeat(40),
      sourceLedgerPath,
      output: path.join(root, "bundle"),
    },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("desktop release staging", () => {
  it("verifies trust inputs and emits exactly seven intentional release uploads", async () => {
    const value = fixture();
    const result = await stageDesktopRelease(value.options);

    expect(result.bundle).toMatchObject({
      version: packageVersion,
      tag: `v${packageVersion}`,
      sourceCommit: "a".repeat(40),
      artifacts: [
        {
          platform: "win32",
          architecture: "x64",
          packageType: "nsis",
          versioned: `ApprovedProduct-Setup-${packageVersion}-x64.exe`,
        },
        {
          platform: "darwin",
          architecture: "arm64",
          packageType: "dmg",
          versioned: `ApprovedProduct-${packageVersion}-arm64.dmg`,
        },
        {
          platform: "darwin",
          architecture: "x64",
          packageType: "dmg",
          versioned: `ApprovedProduct-${packageVersion}-x64.dmg`,
        },
      ],
      correspondingSource: {
        fileName: `ApprovedProduct-${packageVersion}-corresponding-source.tar.gz`,
      },
    });
    expect(fs.readdirSync(value.options.output).sort()).toEqual([
      `ApprovedProduct-${packageVersion}-arm64.dmg`,
      `ApprovedProduct-${packageVersion}-corresponding-source.tar.gz`,
      `ApprovedProduct-${packageVersion}-x64.dmg`,
      `ApprovedProduct-Setup-${packageVersion}-x64.exe`,
      "SHA256SUMS",
      "release-manifest.json",
      "release-manifest.sig",
    ]);
    const archive = fs.readFileSync(
      path.join(
        value.options.output,
        `ApprovedProduct-${packageVersion}-corresponding-source.tar.gz`,
      ),
    );
    expect(tarEntryNames(archive)).toEqual([
      "fixture-source.tar.gz",
      "release-source-ledger.json",
      "SOURCE-SHA256SUMS",
      "THIRD-PARTY-NOTICES.md",
    ]);
    const sums = fs.readFileSync(path.join(value.options.output, "SHA256SUMS"), "utf8");
    expect(sums.trim().split("\n")).toHaveLength(6);
    expect(sums).toContain(`ApprovedProduct-Setup-${packageVersion}-x64.exe`);
    expect(sums).toContain(`ApprovedProduct-${packageVersion}-arm64.dmg`);
    expect(sums).toContain(`ApprovedProduct-${packageVersion}-x64.dmg`);
    expect(sums).toContain(`ApprovedProduct-${packageVersion}-corresponding-source.tar.gz`);
    expect(sums).toContain("release-manifest.sig");
    expect(sums).not.toContain("ApprovedProduct-Setup-x64.exe");
    expect(sums).not.toContain("fixture-source.tar.gz");
  });

  it("rejects a manifest signed by a key the application does not trust", async () => {
    const value = fixture();
    const otherKeys = generateKeyPairSync("ed25519");
    fs.writeFileSync(
      value.options.publicKey,
      otherKeys.publicKey.export({ type: "spki", format: "pem" }),
    );
    await expect(stageDesktopRelease(value.options)).rejects.toThrow("does not match");
  });

  it("rejects changed package bytes and unsafe public identities", async () => {
    const changed = fixture();
    fs.appendFileSync(
      path.join(changed.options.artifactsDir, `ApprovedProduct-Setup-${packageVersion}-x64.exe`),
      "changed",
    );
    await expect(stageDesktopRelease(changed.options)).rejects.toThrow("does not match");

    const unsafe = fixture();
    await expect(
      stageDesktopRelease({ ...unsafe.options, executableName: "Unsafe Product" }),
    ).rejects.toThrow("unsafe");
  });
});
