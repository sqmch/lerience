import { createHash, generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ReleaseTrustError,
  verifyAndSelectRelease,
  verifyReleaseArtifact,
  type ReleaseTarget,
  type VerifiedReleaseCandidate,
} from "../src/main/update/release-manifest";

const temporaryRoots: string[] = [];
const windowsInstalled: ReleaseTarget = {
  platform: "win32",
  architecture: "x64",
  installation: "nsis",
};
const releaseBaseUrl = "https://github.com/example/releases/download/v0.1.2/";

function signedManifest(value: unknown): {
  bytes: Buffer;
  signature: string;
  publicKey: string;
} {
  const bytes = Buffer.from(JSON.stringify(value));
  const pair = generateKeyPairSync("ed25519");
  return {
    bytes,
    signature: sign(null, bytes, pair.privateKey).toString("base64"),
    publicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function validManifest(): Record<string, unknown> & { artifacts: Array<Record<string, unknown>> } {
  return {
    schemaVersion: 1,
    productId: "praxeum-desktop",
    channel: "stable",
    version: "0.1.2",
    publishedAt: "2026-08-14T18:00:00.000Z",
    releaseNotes: "A safer update foundation.",
    artifacts: [
      {
        platform: "win32",
        architecture: "x64",
        packageType: "nsis",
        fileName: "Lerience-0.1.2-x64.exe",
        size: 7,
        sha256: "0".repeat(64),
      },
      {
        platform: "win32",
        architecture: "x64",
        packageType: "portable",
        fileName: "Lerience-Portable-0.1.2-x64.exe",
        size: 8,
        sha256: "1".repeat(64),
      },
      {
        platform: "darwin",
        architecture: "arm64",
        packageType: "zip",
        fileName: "Lerience-0.1.2-arm64.zip",
        size: 10,
        sha256: "3".repeat(64),
      },
      {
        platform: "darwin",
        architecture: "arm64",
        packageType: "dmg",
        fileName: "Lerience-0.1.2-arm64.dmg",
        size: 9,
        sha256: "2".repeat(64),
      },
    ],
  };
}

function select(
  value: unknown,
  target: ReleaseTarget = windowsInstalled,
  currentVersion = "0.1.1",
) {
  const signed = signedManifest(value);
  return verifyAndSelectRelease(signed.bytes, signed.signature, signed.publicKey, {
    currentVersion,
    target,
    artifactBaseUrl: releaseBaseUrl,
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("release trust boundary", () => {
  it("verifies exact signed bytes before selecting and binding an artifact", () => {
    const source = validManifest();
    const signed = signedManifest(source);
    const candidate = verifyAndSelectRelease(signed.bytes, signed.signature, signed.publicKey, {
      currentVersion: "0.1.1",
      target: windowsInstalled,
      artifactBaseUrl: releaseBaseUrl,
    });
    expect(candidate).toMatchObject({
      version: "0.1.2",
      releaseNotes: "A safer update foundation.",
      artifact: {
        packageType: "nsis",
        downloadUrl: `${releaseBaseUrl}Lerience-0.1.2-x64.exe`,
      },
    });

    const tampered = Buffer.from(signed.bytes);
    const tamperedIndex = tampered.length - 2;
    tampered[tamperedIndex] = (tampered[tamperedIndex] ?? 0) ^ 1;
    expect(() =>
      verifyAndSelectRelease(tampered, signed.signature, signed.publicKey, {
        currentVersion: "0.1.1",
        target: windowsInstalled,
        artifactBaseUrl: releaseBaseUrl,
      }),
    ).toThrowError(ReleaseTrustError);
  });

  it("rejects signed but contradictory package data and untrusted release locations", () => {
    const unsafe = validManifest();
    unsafe.artifacts[0]!["fileName"] = "Lerience.zip";
    expect(() => select(unsafe)).toThrow("invalid shape");

    const signed = signedManifest(validManifest());
    expect(() =>
      verifyAndSelectRelease(signed.bytes, signed.signature, signed.publicKey, {
        currentVersion: "0.1.1",
        target: windowsInstalled,
        artifactBaseUrl: "https://user:secret@example.test/releases/",
      }),
    ).toThrow("not trusted");
  });

  it("selects self-install only for installed Windows and prefers DMG for macOS", () => {
    expect(select(validManifest(), windowsInstalled)?.artifact.packageType).toBe("nsis");
    expect(
      select(validManifest(), {
        platform: "win32",
        architecture: "x64",
        installation: "portable",
      })?.artifact.packageType,
    ).toBe("portable");
    expect(
      select(validManifest(), {
        platform: "darwin",
        architecture: "arm64",
        installation: "app-bundle",
      })?.artifact.packageType,
    ).toBe("dmg");
  });

  it("returns no candidate for equal, older, or unavailable target releases", () => {
    expect(select(validManifest(), windowsInstalled, "0.1.2")).toBeNull();
    expect(select(validManifest(), windowsInstalled, "1.0.0")).toBeNull();
    expect(
      select(validManifest(), {
        platform: "darwin",
        architecture: "x64",
        installation: "app-bundle",
      }),
    ).toBeNull();
  });

  it("verifies only an artifact selected from a trusted signed manifest", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-release-test-"));
    temporaryRoots.push(root);
    const artifactPath = path.join(root, "update.bin");
    const bytes = Buffer.from("trusted update bytes");
    fs.writeFileSync(artifactPath, bytes);
    const manifest = validManifest();
    manifest.artifacts[0]!["size"] = bytes.length;
    manifest.artifacts[0]!["sha256"] = createHash("sha256").update(bytes).digest("hex");
    const candidate = select(manifest);
    if (candidate === null) throw new Error("fixture produced no update candidate");

    await expect(verifyReleaseArtifact(artifactPath, candidate)).resolves.toBeUndefined();

    const forged = {
      ...candidate,
      artifact: { ...candidate.artifact, sha256: "0".repeat(64) },
    } as VerifiedReleaseCandidate;
    await expect(verifyReleaseArtifact(artifactPath, forged)).rejects.toThrow("trust boundary");
  });
});
