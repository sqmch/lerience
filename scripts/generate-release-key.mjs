import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const privateKeyPath = path.resolve(options.privateKey);
  const publicKeyPath = path.resolve(options.publicKey);

  if (isWithin(repositoryRoot, privateKeyPath)) {
    throw new Error("The release private key must stay outside the repository.");
  }
  if (!isWithin(repositoryRoot, publicKeyPath)) {
    throw new Error("The release public key must be written inside the repository.");
  }
  if (privateKeyPath === publicKeyPath) {
    throw new Error("The private and public key paths must be different.");
  }

  await mkdir(path.dirname(privateKeyPath), { recursive: true });
  await mkdir(path.dirname(publicKeyPath), { recursive: true });
  const canonicalRepositoryRoot = await realpath(repositoryRoot);
  const canonicalPrivateKeyPath = path.join(
    await realpath(path.dirname(privateKeyPath)),
    path.basename(privateKeyPath),
  );
  const canonicalPublicKeyPath = path.join(
    await realpath(path.dirname(publicKeyPath)),
    path.basename(publicKeyPath),
  );
  if (isWithin(canonicalRepositoryRoot, canonicalPrivateKeyPath)) {
    throw new Error("The release private key must stay outside the repository.");
  }
  if (!isWithin(canonicalRepositoryRoot, canonicalPublicKeyPath)) {
    throw new Error("The release public key must be written inside the repository.");
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
  const publicPem = publicKey.export({ type: "spki", format: "pem" });
  let privateCreated = false;
  let publicCreated = false;

  try {
    await writeFile(privateKeyPath, privatePem, { flag: "wx", mode: 0o600 });
    privateCreated = true;
    await writeFile(publicKeyPath, publicPem, { flag: "wx", mode: 0o644 });
    publicCreated = true;
  } catch (error) {
    await Promise.all([
      privateCreated ? rm(privateKeyPath, { force: true }) : Promise.resolve(),
      publicCreated ? rm(publicKeyPath, { force: true }) : Promise.resolve(),
    ]);
    throw error;
  }

  const storedPrivateKey = createPrivateKey(await readFile(privateKeyPath));
  const storedPublicKey = createPublicKey(await readFile(publicKeyPath));
  const derivedPublic = createPublicKey(storedPrivateKey).export({ type: "spki", format: "der" });
  const storedPublic = storedPublicKey.export({ type: "spki", format: "der" });
  if (!derivedPublic.equals(storedPublic)) {
    throw new Error("The stored release key pair did not verify after generation.");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        algorithm: "Ed25519",
        fingerprint: publicKeyFingerprint(storedPublic),
        privateKeyPath,
        publicKeyPath,
      },
      null,
      2,
    )}\n`,
  );
}

function parseArguments(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  const values = new Map();
  for (let index = 0; index < normalized.length; index += 2) {
    const name = normalized[index];
    const value = normalized[index + 1];
    if (!name?.startsWith("--") || value === undefined) throw new Error(usage());
    values.set(name, value);
  }
  const names = ["--private-key", "--public-key"];
  if (values.size !== names.length || names.some((name) => !values.has(name))) {
    throw new Error(usage());
  }
  return {
    privateKey: values.get("--private-key"),
    publicKey: values.get("--public-key"),
  };
}

function publicKeyFingerprint(der) {
  return `SHA256:${createHash("sha256").update(der).digest("base64url")}`;
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function usage() {
  return "Usage: generate-release-key --private-key <external-pem> --public-key <repository-pem>";
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
