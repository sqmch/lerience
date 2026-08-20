import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeDesktopReleaseArtifacts } from "./desktop-artifacts.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
async function main() {
  const options = parseArguments(process.argv.slice(2));
  const privateKeyPath = path.resolve(options.privateKey);
  if (isWithin(await realpath(repositoryRoot), await realpath(privateKeyPath))) {
    throw new Error("The release private key must stay outside the repository.");
  }
  const privateKey = createPrivateKey(await readFile(privateKeyPath));
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("The release private key is not Ed25519.");
  }

  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  const releaseNotes = (await readFile(path.resolve(options.notes), "utf8")).trim();
  assertReleaseNotes(releaseNotes);
  const publishedAt = normalizePublishedAt(options.publishedAt);
  const describedArtifacts = await describeDesktopReleaseArtifacts({
    directory: options.artifacts,
    executableName: options.executableName,
    version: packageJson.version,
  });
  const artifacts = describedArtifacts.map(({ filePath: _filePath, ...artifact }) => artifact);
  const manifest = {
    schemaVersion: 1,
    productId: "praxeum-desktop",
    channel: "stable",
    version: packageJson.version,
    publishedAt,
    releaseNotes,
    artifacts,
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`, "utf8");
  const signature = sign(null, manifestBytes, privateKey).toString("base64");
  const publicKey = createPublicKey(privateKey).export({ type: "spki", format: "pem" });

  const output = path.resolve(options.output);
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "release-manifest.json"), manifestBytes, { flag: "wx" });
  await writeFile(path.join(output, "release-manifest.sig"), `${signature}\n`, { flag: "wx" });
  await writeFile(path.join(output, "release-public-key.pem"), publicKey, { flag: "wx" });
  const sums = [
    ...artifacts.map((artifact) => `${artifact.sha256}  ${artifact.fileName}`),
    `${createHash("sha256").update(manifestBytes).digest("hex")}  release-manifest.json`,
  ];
  await writeFile(path.join(output, "SHA256SUMS"), `${sums.join("\n")}\n`, { flag: "wx" });
  process.stdout.write(`${output}\n`);
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
  const names = [
    "--artifacts",
    "--executable-name",
    "--notes",
    "--published-at",
    "--private-key",
    "--output",
  ];
  if (values.size !== names.length || names.some((name) => !values.has(name))) {
    throw new Error(usage());
  }
  return {
    artifacts: values.get("--artifacts"),
    executableName: values.get("--executable-name"),
    notes: values.get("--notes"),
    publishedAt: values.get("--published-at"),
    privateKey: values.get("--private-key"),
    output: values.get("--output"),
  };
}

function assertReleaseNotes(value) {
  if (
    value.length === 0 ||
    value.length > 4_000 ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code !== 0x09 && code !== 0x0a && code !== 0x0d && (code < 0x20 || code === 0x7f);
    })
  ) {
    throw new Error("Release notes are empty or contain unsafe text.");
  }
}

function normalizePublishedAt(value) {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error("--published-at must be an explicit ISO-8601 timestamp with an offset.");
  }
  return new Date(value).toISOString();
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function usage() {
  return "Usage: sign-release-manifest --artifacts <directory> --executable-name <name> --notes <file> --published-at <iso> --private-key <pem> --output <directory>";
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
