import { listPackage, statFile } from "@electron/asar";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROVIDER_PACKAGE =
  /(?:^|\/)(?:@openai(?:\+|\/)codex|@anthropic-ai(?:\+|\/)claude-agent-sdk-(?:darwin|linux|win32))/u;
const PROVIDER_EXECUTABLE = /^(?:claude|codex)(?:\.exe)?$/u;
const STANDALONE_NODE = /^(?:node|node\.exe)$/u;
const REQUIRED_APP_ASAR_NOTICES = [
  "node_modules/@anthropic-ai/claude-agent-sdk/LICENSE.md",
  "node_modules/zod/LICENSE",
];
const REQUIRED_PACKAGE_NOTICE = "resources/third-party-notices.md";

export async function inspectDistributionInventory(root) {
  const absoluteRoot = path.resolve(root);
  const violations = [];
  let fileCount = 0;
  let totalBytes = 0;
  let asarEntryCount = 0;
  const physicalFiles = new Set();
  let appAsarEntries = null;

  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(absoluteRoot, absolutePath).split(path.sep).join("/");
      const normalized = relativePath.toLowerCase();
      if (PROVIDER_PACKAGE.test(normalized)) {
        violations.push({ path: relativePath, reason: "provider-native-package" });
        continue;
      }
      const info = await lstat(absolutePath);
      if (info.isDirectory() && !info.isSymbolicLink()) {
        await visit(absolutePath);
        continue;
      }
      if (!info.isFile()) continue;
      physicalFiles.add(normalized);
      fileCount += 1;
      totalBytes += info.size;
      const filename = entry.name.toLowerCase();
      if (PROVIDER_EXECUTABLE.test(filename)) {
        violations.push({ path: relativePath, reason: "provider-executable" });
      } else if (STANDALONE_NODE.test(filename) && !isElectronNodeShim(normalized)) {
        violations.push({ path: relativePath, reason: "standalone-node" });
      }
      if (filename.endsWith(".asar")) {
        const entries = listPackage(absolutePath, { isPack: false });
        asarEntryCount += entries.length;
        const normalizedEntries = new Set();
        for (const archivedPath of entries) {
          const normalizedArchivePath = archivedPath.replace(/^[/\\]+/u, "").replaceAll("\\", "/");
          normalizedEntries.add(normalizedArchivePath);
          if (PROVIDER_PACKAGE.test(normalizedArchivePath.toLowerCase())) {
            violations.push({
              path: `${relativePath}:${normalizedArchivePath}`,
              reason: "provider-native-package",
            });
            continue;
          }
          const archivedName = path.posix.basename(normalizedArchivePath).toLowerCase();
          if (!PROVIDER_EXECUTABLE.test(archivedName) && !STANDALONE_NODE.test(archivedName)) {
            continue;
          }
          const metadata = statFile(absolutePath, archivedPath);
          if (!("size" in metadata)) continue;
          const reason = PROVIDER_EXECUTABLE.test(archivedName)
            ? "provider-executable"
            : "standalone-node";
          violations.push({ path: `${relativePath}:${normalizedArchivePath}`, reason });
        }
        if (filename === "app.asar") appAsarEntries = normalizedEntries;
      }
    }
  }

  await visit(absoluteRoot);
  if (appAsarEntries !== null) {
    for (const notice of REQUIRED_APP_ASAR_NOTICES) {
      if (!appAsarEntries.has(notice)) {
        violations.push({ path: `app.asar:${notice}`, reason: "missing-license-notice" });
      }
    }
    if (
      ![...physicalFiles].some((candidate) =>
        hasNormalizedSuffix(candidate, REQUIRED_PACKAGE_NOTICE),
      )
    ) {
      violations.push({ path: REQUIRED_PACKAGE_NOTICE, reason: "missing-license-notice" });
    }
  }
  return { root: absoluteRoot, fileCount, totalBytes, asarEntryCount, violations };
}

export async function assertDistributionInventory(root, options = {}) {
  const report = await inspectDistributionInventory(root);
  if (report.violations.length > 0) {
    const summary = report.violations
      .slice(0, 5)
      .map((violation) => `${violation.reason}: ${violation.path}`)
      .join("; ");
    throw new Error(`Distribution inventory contains forbidden payloads: ${summary}`);
  }
  if (options.maxBytes !== undefined && report.totalBytes > options.maxBytes) {
    throw new Error(
      `Distribution inventory is ${report.totalBytes} bytes; limit is ${options.maxBytes}.`,
    );
  }
  return report;
}

function isElectronNodeShim(relativePath) {
  return relativePath.endsWith("tools/npm/bin/node");
}

function hasNormalizedSuffix(candidate, requiredPath) {
  return candidate === requiredPath || candidate.endsWith(`/${requiredPath}`);
}

function parseOptions(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (normalized.length !== 2 && normalized.length !== 4) {
    throw new Error("Usage: distribution-inventory --root <directory> [--max-bytes <integer>]");
  }
  const values = new Map();
  for (let index = 0; index < normalized.length; index += 2) {
    values.set(normalized[index], normalized[index + 1]);
  }
  const root = values.get("--root");
  const maxBytesText = values.get("--max-bytes");
  if (
    root === undefined ||
    [...values.keys()].some((key) => !["--root", "--max-bytes"].includes(key))
  ) {
    throw new Error("Usage: distribution-inventory --root <directory> [--max-bytes <integer>]");
  }
  const maxBytes = maxBytesText === undefined ? undefined : Number(maxBytesText);
  if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)) {
    throw new Error("--max-bytes must be a positive safe integer.");
  }
  return { root, ...(maxBytes === undefined ? {} : { maxBytes }) };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const options = parseOptions(process.argv.slice(2));
  assertDistributionInventory(options.root, options)
    .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
