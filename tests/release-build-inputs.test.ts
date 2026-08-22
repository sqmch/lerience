import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readReleaseBuildInputs } from "../build/release-build-inputs";

function publicKey(): string {
  return generateKeyPairSync("ed25519")
    .publicKey.export({ type: "spki", format: "pem" })
    .toString();
}

describe("release build inputs", () => {
  it("keeps private preview builds network-disabled when no release identity is supplied", () => {
    expect(readReleaseBuildInputs({}, () => publicKey())).toBeNull();
  });

  it("compiles one exact GitHub release channel and Ed25519 public key", () => {
    const inputs = readReleaseBuildInputs(
      {
        PRAXEUM_RELEASE_REPOSITORY_URL: "https://github.com/example/praxeum-releases/releases/",
        PRAXEUM_RELEASE_PUBLIC_KEY_PATH: "C:/keys/release-public.pem",
      },
      () => publicKey(),
    );
    expect(inputs).toMatchObject({
      manifestUrl:
        "https://github.com/example/praxeum-releases/releases/latest/download/release-manifest.json",
      signatureUrl:
        "https://github.com/example/praxeum-releases/releases/latest/download/release-manifest.sig",
      artifactRootUrl: "https://github.com/example/praxeum-releases/releases/download/",
      releasePageRootUrl: "https://github.com/example/praxeum-releases/releases/tag/",
    });
    expect(inputs?.publicKeyPem).toContain("BEGIN PUBLIC KEY");
  });

  it("rejects partial channels, non-GitHub locations, and private key material", () => {
    expect(() =>
      readReleaseBuildInputs({ PRAXEUM_RELEASE_REPOSITORY_URL: "https://example.test/releases/" }),
    ).toThrow("must be supplied together");
    expect(() =>
      readReleaseBuildInputs(
        {
          PRAXEUM_RELEASE_REPOSITORY_URL: "https://example.test/releases/",
          PRAXEUM_RELEASE_PUBLIC_KEY_PATH: "public.pem",
        },
        () => publicKey(),
      ),
    ).toThrow("must be https://github.com");
    const privatePem = generateKeyPairSync("ed25519").privateKey.export({
      type: "pkcs8",
      format: "pem",
    });
    expect(() =>
      readReleaseBuildInputs(
        {
          PRAXEUM_RELEASE_REPOSITORY_URL: "https://github.com/example/praxeum-releases/releases/",
          PRAXEUM_RELEASE_PUBLIC_KEY_PATH: "private.pem",
        },
        () => privatePem,
      ),
    ).toThrow("must never point at a private key");
  });
});
