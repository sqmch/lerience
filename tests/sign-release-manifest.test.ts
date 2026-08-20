import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { verifyAndSelectRelease } from "../src/main/update/release-manifest";

const roots: string[] = [];
const script = path.resolve("scripts/sign-release-manifest.mjs");
const packageVersion = (
  JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")) as {
    version: string;
  }
).version;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-release-sign-"));
  roots.push(root);
  const keys = generateKeyPairSync("ed25519");
  const privateKey = path.join(root, "release-private.pem");
  const notes = path.join(root, "notes.txt");
  const artifacts = path.join(root, "artifacts");
  fs.mkdirSync(artifacts);
  const nsis = path.join(artifacts, `ApprovedProduct-Setup-${packageVersion}-x64.exe`);
  const dmg = path.join(artifacts, `ApprovedProduct-${packageVersion}-arm64.dmg`);
  const output = path.join(root, "release", "signed");
  fs.writeFileSync(privateKey, keys.privateKey.export({ type: "pkcs8", format: "pem" }));
  fs.writeFileSync(notes, "A bounded release test.");
  fs.writeFileSync(nsis, "installer");
  fs.writeFileSync(dmg, "mac package");
  return { keys, privateKey, notes, artifacts, nsis, dmg, output };
}

function run(value: ReturnType<typeof fixture>, privateKey = value.privateKey) {
  return spawnSync(
    process.execPath,
    [
      script,
      "--artifacts",
      value.artifacts,
      "--executable-name",
      "ApprovedProduct",
      "--notes",
      value.notes,
      "--published-at",
      "2026-08-15T12:00:00+03:00",
      "--private-key",
      privateKey,
      "--output",
      value.output,
    ],
    { encoding: "utf8" },
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("release manifest signer", () => {
  it("hashes both desktop artifacts and signs the exact emitted bytes", () => {
    const value = fixture();
    const result = run(value);
    expect(result.status).toBe(0);
    const bytes = fs.readFileSync(path.join(value.output, "release-manifest.json"));
    const signature = fs.readFileSync(path.join(value.output, "release-manifest.sig"), "utf8");
    const publicKey = value.keys.publicKey.export({ type: "spki", format: "pem" });

    expect(
      verifyAndSelectRelease(bytes, signature, publicKey, {
        currentVersion: "0.0.0",
        target: { platform: "win32", architecture: "x64", installation: "nsis" },
        artifactBaseUrl: `https://example.test/releases/v${packageVersion}/`,
      }),
    ).toMatchObject({
      version: packageVersion,
      artifact: { fileName: path.basename(value.nsis), size: 9 },
    });
    expect(
      verifyAndSelectRelease(bytes, signature, publicKey, {
        currentVersion: "0.0.0",
        target: { platform: "darwin", architecture: "arm64", installation: "app-bundle" },
        artifactBaseUrl: `https://example.test/releases/v${packageVersion}/`,
      }),
    ).toMatchObject({
      version: packageVersion,
      artifact: { fileName: path.basename(value.dmg), size: 11 },
    });
    const sums = fs.readFileSync(path.join(value.output, "SHA256SUMS"), "utf8");
    expect(sums).toContain(path.basename(value.nsis));
    expect(sums).toContain(path.basename(value.dmg));
    expect(sums.trim().split("\n")).toHaveLength(3);
  });

  it("refuses to create or use a repository-owned release key", () => {
    const value = fixture();
    const repositoryKey = path.resolve("dist", "forbidden-private-key.pem");
    fs.mkdirSync(path.dirname(repositoryKey), { recursive: true });
    fs.copyFileSync(value.privateKey, repositoryKey);
    try {
      const result = run(value, repositoryKey);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("must stay outside the repository");
    } finally {
      fs.rmSync(repositoryKey, { force: true });
    }
  });
});
