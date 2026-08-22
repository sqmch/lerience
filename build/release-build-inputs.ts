import { createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export interface ReleaseBuildInputs {
  manifestUrl: string;
  signatureUrl: string;
  artifactRootUrl: string;
  /** Where a version's human-readable release page lives: `tag/v<version>`. */
  releasePageRootUrl: string;
  publicKeyPem: string;
}

type ReadPublicKey = (filePath: string) => string | Buffer;

/** Compile release identity into the main bundle without ever making it a
 * runtime environment concern. Supplying neither input is the supported
 * private-preview mode; supplying only one is a broken release build. */
export function readReleaseBuildInputs(
  environment: NodeJS.ProcessEnv = process.env,
  readPublicKey: ReadPublicKey = (filePath) => readFileSync(filePath),
): ReleaseBuildInputs | null {
  const repositoryUrl = environment["PRAXEUM_RELEASE_REPOSITORY_URL"]?.trim() ?? "";
  const publicKeyPath = environment["PRAXEUM_RELEASE_PUBLIC_KEY_PATH"]?.trim() ?? "";
  if (repositoryUrl === "" && publicKeyPath === "") return null;
  if (repositoryUrl === "" || publicKeyPath === "") {
    throw new Error(
      "PRAXEUM_RELEASE_REPOSITORY_URL and PRAXEUM_RELEASE_PUBLIC_KEY_PATH must be supplied together.",
    );
  }

  const repository = parseReleaseRepository(repositoryUrl);
  const source = readPublicKey(path.resolve(publicKeyPath));
  const text = Buffer.isBuffer(source) ? source.toString("utf8") : source;
  if (/PRIVATE KEY/u.test(text)) {
    throw new Error("PRAXEUM_RELEASE_PUBLIC_KEY_PATH must never point at a private key.");
  }
  let publicKey;
  try {
    publicKey = createPublicKey(text);
  } catch (error) {
    throw new Error("The configured release public key is invalid.", { cause: error });
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error("The configured release public key must be Ed25519.");
  }

  return {
    manifestUrl: new URL("latest/download/release-manifest.json", repository).toString(),
    signatureUrl: new URL("latest/download/release-manifest.sig", repository).toString(),
    artifactRootUrl: new URL("download/", repository).toString(),
    releasePageRootUrl: new URL("tag/", repository).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function parseReleaseRepository(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new Error("PRAXEUM_RELEASE_REPOSITORY_URL is invalid.", { cause: error });
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    segments.length !== 3 ||
    segments[2] !== "releases"
  ) {
    throw new Error(
      "PRAXEUM_RELEASE_REPOSITORY_URL must be https://github.com/<owner>/<repository>/releases/.",
    );
  }
  url.pathname = `/${segments.join("/")}/`;
  return url;
}
