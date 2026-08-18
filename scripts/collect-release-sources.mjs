import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultLedgerPath = path.join(repositoryRoot, "distribution", "release-source-ledger.json");
const SAFE_SOURCE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\.tar\.gz|\.tgz|\.txt)$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const ALLOWED_HOSTS = new Set(["github.com", "registry.npmjs.org"]);

export async function collectReleaseSources({
  ledgerPath = defaultLedgerPath,
  output,
  fetcher = globalThis.fetch,
}) {
  if (typeof fetcher !== "function") throw new Error("A fetch implementation is required.");
  const absoluteLedgerPath = path.resolve(ledgerPath);
  const ledger = JSON.parse(await readFile(absoluteLedgerPath, "utf8"));
  assertLedger(ledger);
  const outputDirectory = path.resolve(output);
  await mkdir(outputDirectory, { recursive: true });

  const sums = [];
  for (const source of ledger.sources) {
    const response = await fetcher(source.url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Could not download ${source.component}: HTTP ${response.status}.`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== source.bytes || bytes.length > MAX_SOURCE_BYTES) {
      throw new Error(`${source.component} source archive has an unexpected size.`);
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== source.sha256) {
      throw new Error(`${source.component} source archive failed SHA-256 verification.`);
    }
    await writeFile(path.join(outputDirectory, source.fileName), bytes, { flag: "wx" });
    sums.push(`${digest}  ${source.fileName}`);
  }

  await writeFile(
    path.join(outputDirectory, "release-source-ledger.json"),
    await readFile(absoluteLedgerPath),
    { flag: "wx" },
  );
  await writeFile(path.join(outputDirectory, "SOURCE-SHA256SUMS"), `${sums.join("\n")}\n`, {
    flag: "wx",
  });
  globalThis.process.stdout.write(`${outputDirectory}\n`);
  return { outputDirectory, ledger };
}

export function assertLedger(ledger) {
  if (
    ledger?.schemaVersion !== 1 ||
    !Array.isArray(ledger.sources) ||
    ledger.sources.length === 0
  ) {
    throw new Error("The release source ledger is not schema version 1.");
  }
  const names = new Set();
  for (const source of ledger.sources) {
    let url;
    try {
      url = new URL(source.url);
    } catch {
      throw new Error("The release source ledger contains an invalid URL.");
    }
    if (
      typeof source.component !== "string" ||
      source.component.trim() === "" ||
      typeof source.version !== "string" ||
      source.version.trim() === "" ||
      typeof source.revision !== "string" ||
      source.revision.trim() === "" ||
      !SAFE_SOURCE_NAME.test(source.fileName) ||
      names.has(source.fileName) ||
      url.protocol !== "https:" ||
      !ALLOWED_HOSTS.has(url.hostname) ||
      !Number.isSafeInteger(source.bytes) ||
      source.bytes <= 0 ||
      source.bytes > MAX_SOURCE_BYTES ||
      !SHA256.test(source.sha256)
    ) {
      throw new Error("The release source ledger contains an unsafe or duplicate entry.");
    }
    names.add(source.fileName);
  }
}

function parseArguments(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (normalized.length !== 2 || normalized[0] !== "--output") {
    throw new Error("Usage: collect-release-sources --output <directory>");
  }
  return { output: normalized[1] };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  collectReleaseSources(parseArguments(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
