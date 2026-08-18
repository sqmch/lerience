import { createPrivateKey, createPublicKey } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const script = path.join(repositoryRoot, "scripts", "generate-release-key.mjs");
const roots: string[] = [];

function createRepositoryOutput(): string {
  const generatedRoot = path.join(repositoryRoot, "dist");
  fs.mkdirSync(generatedRoot, { recursive: true });
  return fs.mkdtempSync(path.join(generatedRoot, "release-key-test-"));
}

function run(privateKey: string, publicKey: string) {
  return spawnSync(
    process.execPath,
    [script, "--private-key", privateKey, "--public-key", publicKey],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("release key generator", () => {
  it("creates a matching Ed25519 pair with the private half outside the repository", () => {
    const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-release-key-"));
    const repositoryOutput = createRepositoryOutput();
    roots.push(externalRoot, repositoryOutput);
    const privateKeyPath = path.join(externalRoot, "private.pem");
    const publicKeyPath = path.join(repositoryOutput, "public.pem");

    const result = run(privateKeyPath, publicKeyPath);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      algorithm: "Ed25519",
      fingerprint: expect.stringMatching(/^SHA256:[A-Za-z0-9_-]{43}$/u),
    });
    const privateKey = createPrivateKey(fs.readFileSync(privateKeyPath));
    const publicKey = createPublicKey(fs.readFileSync(publicKeyPath));
    expect(privateKey.asymmetricKeyType).toBe("ed25519");
    expect(publicKey.asymmetricKeyType).toBe("ed25519");
    expect(createPublicKey(privateKey).export({ type: "spki", format: "der" })).toEqual(
      publicKey.export({ type: "spki", format: "der" }),
    );
    expect(fs.readFileSync(publicKeyPath, "utf8")).not.toContain("PRIVATE KEY");
  });

  it("refuses repository-owned private keys and never overwrites an existing key", () => {
    const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-release-key-"));
    const repositoryOutput = createRepositoryOutput();
    roots.push(externalRoot, repositoryOutput);
    const publicKeyPath = path.join(repositoryOutput, "public.pem");
    const repositoryPrivateKey = path.join(repositoryOutput, "private.pem");
    expect(run(repositoryPrivateKey, publicKeyPath).stderr).toContain(
      "private key must stay outside the repository",
    );

    const externalPrivateKey = path.join(externalRoot, "private.pem");
    expect(run(externalPrivateKey, publicKeyPath).status).toBe(0);
    const second = run(externalPrivateKey, path.join(repositoryOutput, "second-public.pem"));
    expect(second.status).toBe(1);
    expect(second.stderr).toMatch(/EEXIST|exist/u);
  });
});
