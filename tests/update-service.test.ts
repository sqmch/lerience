import { createHash, generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdateService, type UpdateReleaseConfig } from "../src/main/update/service";
import type { UpdateStatus } from "../src/shared/update";

const roots: string[] = [];
const config: UpdateReleaseConfig = {
  manifestUrl:
    "https://github.com/example/praxeum-releases/releases/latest/download/release-manifest.json",
  signatureUrl:
    "https://github.com/example/praxeum-releases/releases/latest/download/release-manifest.sig",
  artifactRootUrl: "https://github.com/example/praxeum-releases/releases/download/",
  releasePageRootUrl: "https://github.com/example/praxeum-releases/releases/tag/",
  publicKeyPem: "",
};

function fixture(options: { version?: string; artifact?: Buffer; servedArtifact?: Buffer } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-update-service-"));
  roots.push(root);
  const artifact = options.artifact ?? Buffer.from("verified installer bytes");
  const servedArtifact = options.servedArtifact ?? artifact;
  const version = options.version ?? "0.0.2";
  const fileName = `Lerience-Setup-${version}-x64.exe`;
  const pair = generateKeyPairSync("ed25519");
  const manifestBytes = Buffer.from(
    `${JSON.stringify({
      schemaVersion: 1,
      productId: "praxeum-desktop",
      channel: "stable",
      version,
      publishedAt: "2026-08-17T14:30:00.000Z",
      releaseNotes: "A safer preview update.",
      artifacts: [
        {
          platform: "win32",
          architecture: "x64",
          packageType: "nsis",
          fileName,
          size: artifact.length,
          sha256: createHash("sha256").update(artifact).digest("hex"),
        },
      ],
    })}\n`,
  );
  const signature = sign(null, manifestBytes, pair.privateKey).toString("base64");
  const artifactUrl = `${config.artifactRootUrl}v${version}/${fileName}`;
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === config.manifestUrl) return response(manifestBytes);
    if (url === config.signatureUrl) return response(Buffer.from(`${signature}\n`));
    if (url === artifactUrl) return response(servedArtifact);
    return new Response("missing", { status: 404 });
  }) as unknown as typeof fetch;
  const statuses: UpdateStatus[] = [];
  const prepareForHandoff = vi.fn(async () => undefined);
  const launchArtifact = vi.fn(async () => undefined);
  const quit = vi.fn();
  const service = new UpdateService({
    config: {
      ...config,
      publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    },
    currentVersion: "0.0.1",
    target: { platform: "win32", architecture: "x64", installation: "nsis" },
    downloadRoot: root,
    emitStatus: (status) => statuses.push(status),
    prepareForHandoff,
    launchArtifact,
    quit,
    fetch: fetcher,
  });
  return {
    root,
    fileName,
    artifact,
    fetcher,
    statuses,
    prepareForHandoff,
    launchArtifact,
    quit,
    service,
  };
}

function response(bytes: Uint8Array): Response {
  return new Response(Uint8Array.from(bytes).buffer, {
    status: 200,
    headers: { "content-length": String(bytes.byteLength) },
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("update service", () => {
  it("performs no network work without compiled release identity", async () => {
    const fetcher = vi.fn();
    const service = new UpdateService({
      config: null,
      currentVersion: "0.0.1",
      target: { platform: "win32", architecture: "x64", installation: "nsis" },
      downloadRoot: "unused",
      emitStatus: vi.fn(),
      prepareForHandoff: vi.fn(),
      launchArtifact: vi.fn(),
      quit: vi.fn(),
      fetch: fetcher as unknown as typeof fetch,
    });
    await expect(service.checkForUpdate()).resolves.toEqual({ phase: "unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("checks signed metadata, verifies exact download bytes, and hands off only after prepare", async () => {
    const value = fixture();
    expect(value.service.releasePageUrl()).toBeNull();
    await expect(value.service.checkForUpdate()).resolves.toMatchObject({
      phase: "available",
      version: "0.0.2",
    });
    expect(value.service.releasePageUrl()).toBe(
      "https://github.com/example/praxeum-releases/releases/tag/v0.0.2",
    );
    await expect(value.service.downloadUpdate()).resolves.toMatchObject({
      phase: "ready",
      action: "install-restart",
    });
    const downloaded = path.join(value.root, "0.0.2", value.fileName);
    expect(fs.readFileSync(downloaded)).toEqual(value.artifact);

    await value.service.handoffUpdate();
    expect(value.prepareForHandoff).toHaveBeenCalledOnce();
    expect(value.launchArtifact).toHaveBeenCalledWith(downloaded, "install-restart");
    expect(value.prepareForHandoff.mock.invocationCallOrder[0]).toBeLessThan(
      value.launchArtifact.mock.invocationCallOrder[0]!,
    );
    expect(value.quit).toHaveBeenCalledOnce();
    expect(value.statuses.some((status) => status.phase === "downloading")).toBe(true);
  });

  it("keeps a tampered download behind the trust boundary", async () => {
    const artifact = Buffer.from("verified installer bytes");
    const tampered = Buffer.from(artifact);
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    const value = fixture({ artifact, servedArtifact: tampered });
    await value.service.checkForUpdate();
    await expect(value.service.downloadUpdate()).resolves.toEqual({
      phase: "error",
      operation: "download",
      detail: "The update could not be downloaded and verified. Try again.",
    });
    expect(value.prepareForHandoff).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(value.root, "0.0.2", value.fileName))).toBe(false);
  });

  it("stays quiet when the signed channel is not newer", async () => {
    const value = fixture({ version: "0.0.1" });
    await expect(value.service.checkForUpdate()).resolves.toEqual({ phase: "current" });
  });
});
