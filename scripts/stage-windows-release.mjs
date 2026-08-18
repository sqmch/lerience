import { createHash, createPublicKey, verify } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertLedger } from "./collect-release-sources.mjs";
import { createCorrespondingSourceArchive } from "./create-corresponding-source-archive.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const SAFE_EXECUTABLE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SAFE_PRODUCT_NAME = /^[^<>:"/\\|?*]{1,80}$/u;
const SOURCE_COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export async function stageWindowsRelease(options) {
  assertOptions(options);
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  const version = packageJson.version;
  if (!/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new Error("package.json must contain a stable semantic version.");
  }
  const tag = `v${version}`;
  const expectedNames = {
    nsis: `${options.executableName}-Setup-${version}-x64.exe`,
  };
  if (path.basename(options.nsis) !== expectedNames.nsis) {
    throw new Error(`The NSIS artifact must be named ${expectedNames.nsis}.`);
  }

  const artifacts = {
    nsis: await describeFile(options.nsis),
  };
  const signedDirectory = path.resolve(options.signedDir);
  const manifestBytes = await readFile(path.join(signedDirectory, "release-manifest.json"));
  const signatureText = (
    await readFile(path.join(signedDirectory, "release-manifest.sig"), "utf8")
  ).trim();
  const trustedPublicKey = createPublicKey(await readFile(path.resolve(options.publicKey)));
  const signerPublicKey = createPublicKey(
    await readFile(path.join(signedDirectory, "release-public-key.pem")),
  );
  if (
    trustedPublicKey.asymmetricKeyType !== "ed25519" ||
    signerPublicKey.asymmetricKeyType !== "ed25519" ||
    !trustedPublicKey
      .export({ type: "spki", format: "der" })
      .equals(signerPublicKey.export({ type: "spki", format: "der" }))
  ) {
    throw new Error("The signer key does not match the public key compiled into the application.");
  }
  const signature = Buffer.from(signatureText, "base64");
  if (signature.length !== 64 || !verify(null, manifestBytes, trustedPublicKey, signature)) {
    throw new Error("The release manifest signature is invalid.");
  }

  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assertManifest(manifest, version, artifacts);
  const notes = (await readFile(path.resolve(options.notes), "utf8")).trim();
  if (notes === "" || notes !== manifest.releaseNotes) {
    throw new Error("The release notes do not match the signed manifest.");
  }

  const sources = await verifySourceSet(
    path.resolve(options.sources),
    options.sourceLedgerPath === undefined
      ? path.join(repositoryRoot, "distribution", "release-source-ledger.json")
      : path.resolve(options.sourceLedgerPath),
  );
  const output = path.resolve(options.output);
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length !== 0) {
    throw new Error("The release output directory must be empty.");
  }
  const copy = async (source, destinationName) => {
    await copyFile(
      path.resolve(source),
      path.join(output, destinationName),
      fsConstants.COPYFILE_EXCL,
    );
  };

  await copy(options.nsis, expectedNames.nsis);
  await copy(path.join(signedDirectory, "release-manifest.json"), "release-manifest.json");
  await copy(path.join(signedDirectory, "release-manifest.sig"), "release-manifest.sig");
  const correspondingSourceName = `${options.executableName}-${version}-corresponding-source.tar.gz`;
  const correspondingSourceBytes = await createCorrespondingSourceArchive({
    sourceDirectory: path.resolve(options.sources),
    sourceFileNames: sources.fileNames,
    noticesPath: path.resolve(options.notices),
  });
  await writeFile(path.join(output, correspondingSourceName), correspondingSourceBytes, {
    flag: "wx",
  });
  const correspondingSource = await describeFile(path.join(output, correspondingSourceName));

  const bundle = {
    schemaVersion: 1,
    productName: options.productName,
    executableName: options.executableName,
    version,
    tag,
    sourceCommit: options.sourceCommit,
    artifacts: {
      nsis: {
        versioned: expectedNames.nsis,
        bytes: artifacts.nsis.bytes,
        sha256: artifacts.nsis.sha256,
      },
    },
    correspondingSource,
  };

  const stagedNames = (await readdir(output)).sort((left, right) => left.localeCompare(right));
  const sums = [];
  for (const fileName of stagedNames) {
    const described = await describeFile(path.join(output, fileName));
    sums.push(`${described.sha256}  ${fileName}`);
  }
  await writeFile(path.join(output, "SHA256SUMS"), `${sums.join("\n")}\n`, { flag: "wx" });
  globalThis.process.stdout.write(`${output}\n`);
  return { output, bundle };
}

function assertOptions(options) {
  if (
    !SAFE_PRODUCT_NAME.test(options.productName) ||
    !SAFE_EXECUTABLE_NAME.test(options.executableName) ||
    options.executableName.toLowerCase().endsWith(".exe") ||
    !SOURCE_COMMIT.test(options.sourceCommit)
  ) {
    throw new Error("The release identity or source commit is unsafe.");
  }
  for (const name of ["nsis", "signedDir", "sources", "notes", "notices", "publicKey", "output"]) {
    if (typeof options[name] !== "string" || options[name].trim() === "") {
      throw new Error(`The release option ${name} is required.`);
    }
  }
}

function assertManifest(manifest, version, artifacts) {
  if (
    manifest?.schemaVersion !== 1 ||
    manifest.productId !== "praxeum-desktop" ||
    manifest.channel !== "stable" ||
    manifest.version !== version ||
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length !== 1
  ) {
    throw new Error("The signed release manifest does not describe this stable release.");
  }
  for (const packageType of ["nsis"]) {
    const expected = artifacts[packageType];
    const candidate = manifest.artifacts.find((artifact) => artifact.packageType === packageType);
    if (
      candidate?.platform !== "win32" ||
      candidate.architecture !== "x64" ||
      candidate.fileName !== expected.fileName ||
      candidate.size !== expected.bytes ||
      candidate.sha256 !== expected.sha256
    ) {
      throw new Error(`The signed ${packageType} artifact does not match the staged bytes.`);
    }
  }
}

async function verifySourceSet(sourceDirectory, canonicalLedgerPath) {
  const canonicalLedgerBytes = await readFile(canonicalLedgerPath);
  const stagedLedgerBytes = await readFile(
    path.join(sourceDirectory, "release-source-ledger.json"),
  );
  if (!canonicalLedgerBytes.equals(stagedLedgerBytes)) {
    throw new Error("The collected source ledger does not match the reviewed repository ledger.");
  }
  const ledger = JSON.parse(canonicalLedgerBytes.toString("utf8"));
  assertLedger(ledger);
  const expectedSums = [];
  for (const source of ledger.sources) {
    const described = await describeFile(path.join(sourceDirectory, source.fileName));
    if (described.bytes !== source.bytes || described.sha256 !== source.sha256) {
      throw new Error(`${source.component} corresponding source does not match its ledger.`);
    }
    expectedSums.push(`${source.sha256}  ${source.fileName}`);
  }
  const sourceSums = await readFile(path.join(sourceDirectory, "SOURCE-SHA256SUMS"), "utf8");
  if (sourceSums !== `${expectedSums.join("\n")}\n`) {
    throw new Error("The corresponding-source checksum file is not canonical.");
  }
  const fileNames = [
    ...ledger.sources.map((source) => source.fileName),
    "release-source-ledger.json",
    "SOURCE-SHA256SUMS",
  ].sort((left, right) => left.localeCompare(right));
  const actualNames = (await readdir(sourceDirectory)).sort((left, right) =>
    left.localeCompare(right),
  );
  if (JSON.stringify(actualNames) !== JSON.stringify(fileNames)) {
    throw new Error("The corresponding-source directory contains missing or unreviewed files.");
  }
  return { fileNames };
}

async function describeFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const information = await stat(absolutePath);
  if (!information.isFile() || information.size <= 0)
    throw new Error(`${absolutePath} is not a file.`);
  const bytes = await readFile(absolutePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (!SHA256.test(sha256)) throw new Error("Could not hash a release file.");
  return { fileName: path.basename(absolutePath), bytes: information.size, sha256 };
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
    "--nsis",
    "--signed-dir",
    "--sources",
    "--notes",
    "--notices",
    "--public-key",
    "--product-name",
    "--executable-name",
    "--source-commit",
    "--output",
  ];
  if (values.size !== names.length || names.some((name) => !values.has(name))) {
    throw new Error(usage());
  }
  return Object.fromEntries(names.map((name) => [toCamelCase(name), values.get(name)]));
}

function toCamelCase(value) {
  return value.slice(2).replace(/-([a-z])/gu, (_, character) => character.toUpperCase());
}

function usage() {
  return "Usage: stage-windows-release --nsis <exe> --signed-dir <directory> --sources <directory> --notes <md> --notices <md> --public-key <pem> --product-name <name> --executable-name <name> --source-commit <sha> --output <directory>";
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  stageWindowsRelease(parseArguments(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
