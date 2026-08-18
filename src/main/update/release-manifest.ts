import { createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { z } from "zod";

const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const ReleaseArtifactSchema = z
  .object({
    platform: z.enum(["win32", "darwin"]),
    architecture: z.enum(["x64", "arm64"]),
    packageType: z.enum(["nsis", "portable", "dmg", "zip"]),
    fileName: z.string().regex(FILE_NAME),
    size: z.number().int().positive(),
    sha256: z.string().regex(SHA256),
  })
  .strict();

const ReleaseManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    productId: z.literal("praxeum-desktop"),
    channel: z.literal("stable"),
    version: z.string().regex(VERSION),
    publishedAt: z.iso.datetime({ offset: true }),
    releaseNotes: z
      .string()
      .min(1)
      .max(4_000)
      .refine((value) =>
        [...value].every((character) => {
          const code = character.charCodeAt(0);
          return code === 0x09 || code === 0x0a || code === 0x0d || (code >= 0x20 && code !== 0x7f);
        }),
      ),
    artifacts: z.array(ReleaseArtifactSchema).min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const targets = new Set<string>();
    for (const artifact of manifest.artifacts) {
      const target = `${artifact.platform}-${artifact.architecture}-${artifact.packageType}`;
      if (targets.has(target)) {
        context.addIssue({
          code: "custom",
          path: ["artifacts"],
          message: `Duplicate release artifact target: ${target}`,
        });
      }
      targets.add(target);
      const validPackage =
        (artifact.platform === "win32" &&
          ["nsis", "portable"].includes(artifact.packageType) &&
          artifact.fileName.toLowerCase().endsWith(".exe")) ||
        (artifact.platform === "darwin" &&
          artifact.packageType === "dmg" &&
          artifact.fileName.toLowerCase().endsWith(".dmg")) ||
        (artifact.platform === "darwin" &&
          artifact.packageType === "zip" &&
          artifact.fileName.toLowerCase().endsWith(".zip"));
      if (!validPackage) {
        context.addIssue({
          code: "custom",
          path: ["artifacts"],
          message: "The artifact package type, platform, and filename do not agree.",
        });
      }
    }
  });

type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>;
type ReleaseArtifact = z.infer<typeof ReleaseArtifactSchema>;

export class ReleaseTrustError extends Error {
  constructor(
    readonly code: "signature" | "manifest" | "artifact",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ReleaseTrustError";
  }
}

export type ReleaseTarget =
  | {
      platform: "win32";
      architecture: "x64" | "arm64";
      installation: "nsis" | "portable";
    }
  | {
      platform: "darwin";
      architecture: "x64" | "arm64";
      installation: "app-bundle";
    };

export interface VerifiedReleaseCandidate {
  readonly version: string;
  readonly publishedAt: string;
  readonly releaseNotes: string;
  readonly artifact: Readonly<ReleaseArtifact & { downloadUrl: string }>;
}

export interface VerifyReleaseOptions {
  readonly currentVersion: string;
  readonly target: ReleaseTarget;
  /** Trusted, app-configured release directory ending in `/`, for example the
   * immutable GitHub release directory for the signed manifest's version. A
   * resolver is called only after signature and schema verification. */
  readonly artifactBaseUrl: string | ((version: string) => string);
}

const verifiedCandidates = new WeakSet<object>();

/** Verify exact manifest bytes, validate their shape, require a newer version,
 * select one deterministic target, and bind its signed filename to the
 * app-configured release directory. No unsigned structural manifest escapes. */
export function verifyAndSelectRelease(
  manifestBytes: Uint8Array,
  signatureBase64: string,
  publicKeyPem: string | Uint8Array,
  options: VerifyReleaseOptions,
): VerifiedReleaseCandidate | null {
  const manifest = verifyReleaseManifest(manifestBytes, signatureBase64, publicKeyPem);
  if (!isNewerRelease(options.currentVersion, manifest.version)) return null;

  const artifact = selectReleaseArtifact(manifest, options.target);
  if (artifact === null) return null;
  const artifactBaseUrl =
    typeof options.artifactBaseUrl === "function"
      ? options.artifactBaseUrl(manifest.version)
      : options.artifactBaseUrl;
  const downloadUrl = resolveArtifactUrl(artifactBaseUrl, artifact.fileName);
  const candidate: VerifiedReleaseCandidate = Object.freeze({
    version: manifest.version,
    publishedAt: manifest.publishedAt,
    releaseNotes: manifest.releaseNotes,
    artifact: Object.freeze({ ...artifact, downloadUrl }),
  });
  verifiedCandidates.add(candidate);
  return candidate;
}

/** Verify both the signed byte count and digest before an artifact can reach
 * an installer/open-package adapter. Only a candidate produced by
 * verifyAndSelectRelease in this process is accepted. */
export async function verifyReleaseArtifact(
  filePath: string,
  candidate: VerifiedReleaseCandidate,
): Promise<void> {
  if (!verifiedCandidates.has(candidate)) {
    throw new ReleaseTrustError(
      "artifact",
      "The update candidate did not cross the trust boundary.",
    );
  }
  const fileInfo = await stat(filePath);
  if (!fileInfo.isFile() || fileInfo.size !== candidate.artifact.size) {
    throw new ReleaseTrustError("artifact", "The downloaded update has an unexpected size.");
  }

  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  const actual = digest.digest();
  const expected = Buffer.from(candidate.artifact.sha256, "hex");
  if (!timingSafeEqual(actual, expected)) {
    throw new ReleaseTrustError("artifact", "The downloaded update failed integrity checks.");
  }
}

/** Verify the exact downloaded bytes before parsing them. Re-serializing JSON
 * first would make the signature ambiguous and is deliberately forbidden. */
function verifyReleaseManifest(
  manifestBytes: Uint8Array,
  signatureBase64: string,
  publicKeyPem: string | Uint8Array,
): ReleaseManifest {
  const signature = decodeSignature(signatureBase64);
  let trusted: boolean;
  try {
    trusted = verify(null, manifestBytes, createPublicKey(publicKeyPem), signature);
  } catch (error) {
    throw new ReleaseTrustError("signature", "The release signature could not be verified.", {
      cause: error,
    });
  }
  if (!trusted) throw new ReleaseTrustError("signature", "The release manifest is not trusted.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(manifestBytes).toString("utf8")) as unknown;
  } catch (error) {
    throw new ReleaseTrustError("manifest", "The release manifest is not valid JSON.", {
      cause: error,
    });
  }
  const result = ReleaseManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new ReleaseTrustError("manifest", "The release manifest has an invalid shape.", {
      cause: result.error,
    });
  }
  return result.data;
}

/** Installed Windows builds can self-replace. Portable Windows and unsigned
 * macOS builds intentionally use a guided package-open flow. */
function selectReleaseArtifact(
  manifest: ReleaseManifest,
  target: ReleaseTarget,
): ReleaseArtifact | null {
  const packagePreference =
    target.platform === "win32" ? [target.installation] : (["dmg", "zip"] as const);
  for (const packageType of packagePreference) {
    const match = manifest.artifacts.find(
      (artifact) =>
        artifact.platform === target.platform &&
        artifact.architecture === target.architecture &&
        artifact.packageType === packageType,
    );
    if (match !== undefined) return match;
  }
  return null;
}

function isNewerRelease(currentVersion: string, candidateVersion: string): boolean {
  const [currentMajor, currentMinor, currentPatch] = parseVersion(currentVersion);
  const [candidateMajor, candidateMinor, candidatePatch] = parseVersion(candidateVersion);
  if (candidateMajor !== currentMajor) return candidateMajor > currentMajor;
  if (candidateMinor !== currentMinor) return candidateMinor > currentMinor;
  return candidatePatch > currentPatch;
}

function resolveArtifactUrl(baseUrl: string, fileName: string): string {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch (error) {
    throw new ReleaseTrustError("manifest", "The configured release location is invalid.", {
      cause: error,
    });
  }
  if (
    base.protocol !== "https:" ||
    base.username !== "" ||
    base.password !== "" ||
    base.search !== "" ||
    base.hash !== "" ||
    !base.pathname.endsWith("/")
  ) {
    throw new ReleaseTrustError("manifest", "The configured release location is not trusted.");
  }
  const resolved = new URL(fileName, base);
  if (resolved.origin !== base.origin || !resolved.pathname.startsWith(base.pathname)) {
    throw new ReleaseTrustError(
      "manifest",
      "The release artifact escapes its configured location.",
    );
  }
  return resolved.toString();
}

function decodeSignature(source: string): Buffer {
  const encoded = source.trim();
  if (!/^[A-Za-z0-9+/]{86}==$/u.test(encoded)) {
    throw new ReleaseTrustError("signature", "The release signature is malformed.");
  }
  const signature = Buffer.from(encoded, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== encoded) {
    throw new ReleaseTrustError("signature", "The release signature is malformed.");
  }
  return signature;
}

function parseVersion(version: string): [number, number, number] {
  if (!VERSION.test(version)) throw new TypeError(`Invalid stable release version: ${version}`);
  const values = version.split(".").map(Number);
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}
