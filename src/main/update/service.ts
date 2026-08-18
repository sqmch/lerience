import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { PRODUCT_NAME } from "../../shared/product";
import type { UpdateAction, UpdateStatus } from "../../shared/update";
import {
  verifyAndSelectRelease,
  verifyReleaseArtifact,
  type ReleaseTarget,
  type VerifiedReleaseCandidate,
} from "./release-manifest";

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SIGNATURE_BYTES = 256;
const MAX_ARTIFACT_BYTES = 350 * 1024 * 1024;

export interface UpdateReleaseConfig {
  manifestUrl: string;
  signatureUrl: string;
  artifactRootUrl: string;
  publicKeyPem: string;
}

export interface UpdateServiceOptions {
  config: UpdateReleaseConfig | null;
  currentVersion: string;
  target: ReleaseTarget;
  downloadRoot: string;
  emitStatus: (status: UpdateStatus) => void;
  prepareForHandoff: () => Promise<void>;
  launchArtifact: (filePath: string, action: UpdateAction) => Promise<void>;
  quit: () => void;
  fetch?: typeof fetch;
}

/** One owner for the update state machine. Signed metadata is never exposed
 * to the renderer as authority: the main process selects a candidate, writes
 * and verifies exact bytes, and only bridges safe status/copy. */
export class UpdateService {
  private status: UpdateStatus;
  private candidate: VerifiedReleaseCandidate | null = null;
  private downloadedPath: string | null = null;
  private operation: Promise<UpdateStatus> | null = null;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: UpdateServiceOptions) {
    this.status = options.config === null ? { phase: "unavailable" } : { phase: "current" };
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  current(): UpdateStatus {
    return { ...this.status };
  }

  checkForUpdate(): Promise<UpdateStatus> {
    if (this.options.config === null) return Promise.resolve(this.current());
    return this.run(async () => {
      this.candidate = null;
      this.downloadedPath = null;
      this.setStatus({ phase: "checking" });
      try {
        const [manifestResponse, signatureResponse] = await Promise.all([
          this.fetch(this.options.config!.manifestUrl, metadataRequest()),
          this.fetch(this.options.config!.signatureUrl, metadataRequest()),
        ]);
        const manifestBytes = await readBoundedResponse(
          manifestResponse,
          MAX_MANIFEST_BYTES,
          "release manifest",
        );
        const signatureBytes = await readBoundedResponse(
          signatureResponse,
          MAX_SIGNATURE_BYTES,
          "release signature",
        );
        const candidate = verifyAndSelectRelease(
          manifestBytes,
          Buffer.from(signatureBytes).toString("utf8"),
          this.options.config!.publicKeyPem,
          {
            currentVersion: this.options.currentVersion,
            target: this.options.target,
            artifactBaseUrl: (version) =>
              new URL(`v${version}/`, this.options.config!.artifactRootUrl).toString(),
          },
        );
        if (candidate === null) {
          this.setStatus({ phase: "current" });
          return this.current();
        }
        if (candidate.artifact.size > MAX_ARTIFACT_BYTES) {
          throw new Error("The signed update exceeds the supported artifact size.");
        }
        this.candidate = candidate;
        this.setStatus(summaryStatus("available", candidate));
      } catch {
        this.setStatus({
          phase: "error",
          operation: "check",
          detail: `Updates could not be checked right now. ${PRODUCT_NAME} will keep working normally.`,
        });
      }
      return this.current();
    });
  }

  downloadUpdate(): Promise<UpdateStatus> {
    return this.run(async () => {
      const candidate = this.candidate;
      if (candidate === null) return this.current();
      try {
        const releaseRoot = path.join(this.options.downloadRoot, candidate.version);
        const destination = safeChild(releaseRoot, candidate.artifact.fileName);
        await mkdir(releaseRoot, { recursive: true });
        if (await isFile(destination)) {
          try {
            await verifyReleaseArtifact(destination, candidate);
            this.downloadedPath = destination;
            this.setStatus(readyStatus(candidate, this.options.target));
            return this.current();
          } catch {
            await rm(destination, { force: true });
          }
        }

        const partial = `${destination}.partial`;
        await rm(partial, { force: true });
        this.setStatus({
          ...summary(candidate),
          phase: "downloading",
          receivedBytes: 0,
          totalBytes: candidate.artifact.size,
        });
        try {
          await this.download(candidate, partial);
          await verifyReleaseArtifact(partial, candidate);
          await rename(partial, destination);
        } finally {
          await rm(partial, { force: true });
        }
        this.downloadedPath = destination;
        this.setStatus(readyStatus(candidate, this.options.target));
      } catch {
        this.downloadedPath = null;
        this.setStatus({
          phase: "error",
          operation: "download",
          detail: "The update could not be downloaded and verified. Try again.",
        });
      }
      return this.current();
    });
  }

  handoffUpdate(): Promise<UpdateStatus> {
    return this.run(async () => {
      const candidate = this.candidate;
      const downloadedPath = this.downloadedPath;
      if (candidate === null || downloadedPath === null) return this.current();
      const ready = readyStatus(candidate, this.options.target);
      this.setStatus({ ...ready, phase: "preparing" });
      try {
        await verifyReleaseArtifact(downloadedPath, candidate);
        await this.options.prepareForHandoff();
        await this.options.launchArtifact(downloadedPath, ready.action);
        this.options.quit();
      } catch {
        this.setStatus({
          phase: "error",
          operation: "handoff",
          detail: "The verified update could not be opened. Your current app is unchanged.",
        });
      }
      return this.current();
    });
  }

  private run(task: () => Promise<UpdateStatus>): Promise<UpdateStatus> {
    if (this.operation !== null) return this.operation;
    const operation = task().finally(() => {
      if (this.operation === operation) this.operation = null;
    });
    this.operation = operation;
    return operation;
  }

  private setStatus(status: UpdateStatus): void {
    this.status = status;
    this.options.emitStatus(this.current());
  }

  private async download(candidate: VerifiedReleaseCandidate, partialPath: string): Promise<void> {
    const response = await this.fetch(candidate.artifact.downloadUrl, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(30 * 60_000),
    });
    if (!response.ok || response.body === null) throw new Error("The update download failed.");
    const declaredLength = response.headers.get("content-length");
    if (declaredLength !== null && Number(declaredLength) !== candidate.artifact.size) {
      throw new Error("The update server returned an unexpected size.");
    }

    let receivedBytes = 0;
    let lastProgressAt = 0;
    const output = await open(partialPath, "wx", 0o600);
    try {
      for await (const chunk of response.body as never as AsyncIterable<Uint8Array>) {
        receivedBytes += chunk.byteLength;
        if (receivedBytes > candidate.artifact.size) {
          throw new Error("The update exceeded its signed size.");
        }
        const now = Date.now();
        if (now - lastProgressAt >= 150 || receivedBytes === candidate.artifact.size) {
          lastProgressAt = now;
          this.setStatus({
            ...summary(candidate),
            phase: "downloading",
            receivedBytes,
            totalBytes: candidate.artifact.size,
          });
        }
        let offset = 0;
        while (offset < chunk.byteLength) {
          const { bytesWritten } = await output.write(chunk, offset, chunk.byteLength - offset);
          if (bytesWritten === 0) throw new Error("The update download could not be written.");
          offset += bytesWritten;
        }
      }
      await output.sync();
    } finally {
      await output.close();
    }
    if (receivedBytes !== candidate.artifact.size) {
      throw new Error("The update ended before its signed size.");
    }
  }
}

function metadataRequest(): RequestInit {
  return { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(15_000) };
}

async function readBoundedResponse(
  response: Response,
  maximumBytes: number,
  label: string,
): Promise<Uint8Array> {
  if (!response.ok || response.body === null) throw new Error(`The ${label} is unavailable.`);
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of response.body as never as AsyncIterable<Uint8Array>) {
    length += chunk.byteLength;
    if (length > maximumBytes) throw new Error(`The ${label} is too large.`);
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function summary(candidate: VerifiedReleaseCandidate): {
  version: string;
  releaseNotes: string;
} {
  return { version: candidate.version, releaseNotes: candidate.releaseNotes };
}

function summaryStatus(phase: "available", candidate: VerifiedReleaseCandidate): UpdateStatus {
  return { phase, ...summary(candidate) };
}

function readyStatus(
  candidate: VerifiedReleaseCandidate,
  target: ReleaseTarget,
): Extract<UpdateStatus, { phase: "ready" }> {
  return {
    phase: "ready",
    ...summary(candidate),
    action:
      target.platform === "win32" && target.installation === "nsis"
        ? "install-restart"
        : "open-package",
  };
}

function safeChild(root: string, fileName: string): string {
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, fileName);
  const relative = path.relative(resolvedRoot, candidate);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("The signed update filename is unsafe.");
  }
  return candidate;
}

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
