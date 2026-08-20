import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertDistributionInventory } from "./distribution-inventory.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const require = createRequire(import.meta.url);
const COMPONENT_IDS = ["course-engine", "git", "npm"];
const NPM_INSTALLATION_BYPRODUCTS = new Set(["node_modules/.bin"]);

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const platform = process.platform;
  const architecture = process.arch;
  if (!["win32", "darwin"].includes(platform) || !["x64", "arm64"].includes(architecture)) {
    throw new Error(`Runtime assembly is unsupported on ${platform}-${architecture}.`);
  }
  const targetKey = `${platform}-${architecture}`;
  const ledger = await readJson(path.join(repositoryRoot, "distribution", "runtime-ledger.json"));
  if (!ledger.targets.includes(targetKey))
    throw new Error(`The ledger has no ${targetKey} target.`);

  const sources = await resolveInstalledSources(targetKey, ledger);
  const outputRoot = path.resolve(options.outputRoot);
  await assembleRuntime({
    platform,
    architecture,
    targetKey,
    ledger,
    sources,
    outputRoot,
  });
  process.stdout.write(`${outputRoot}\n`);
}

export async function assembleRuntime({
  platform,
  architecture,
  targetKey,
  ledger,
  sources,
  outputRoot,
}) {
  if (await exists(outputRoot)) throw new Error(`Runtime output already exists: ${outputRoot}`);
  await mkdir(path.dirname(outputRoot), { recursive: true });
  await mkdir(outputRoot);
  let complete = false;
  try {
    const manifest = await materializeRuntime({
      platform,
      architecture,
      targetKey,
      ledger,
      sources,
      root: outputRoot,
    });
    const manifestPath = path.join(outputRoot, "manifest.json");
    const temporaryManifestPath = path.join(outputRoot, ".manifest.json.tmp");
    await writeFile(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: "wx",
    });
    await publishPath(temporaryManifestPath, manifestPath);
    complete = true;
  } finally {
    if (!complete) await rm(outputRoot, { recursive: true, force: true });
  }
}

function parseArguments(args) {
  if (args[0] === "--") args = args.slice(1);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error("Usage: assemble-runtime [--output <directory>]");
    }
    values.set(name, value);
  }
  for (const name of values.keys()) {
    if (name !== "--output") throw new Error(`Unknown runtime assembly option: ${name}`);
  }
  const targetKey = `${process.platform}-${process.arch}`;
  return {
    outputRoot: path.resolve(values.get("--output") ?? `dist/runtime/${targetKey}`),
  };
}

async function resolveInstalledSources(targetKey, ledger) {
  const dugitePackage = path.dirname(require.resolve("dugite/package.json"));
  const dugiteManifest = await readJson(path.join(dugitePackage, "package.json"));
  assertVersion("Dugite", dugiteManifest.version, ledger.components.git.packageVersion);
  const embeddedGit = await readJson(path.join(dugitePackage, "script", "embedded-git.json"));
  const ledgerGit = ledger.components.git.targets[targetKey];
  if (
    embeddedGit[targetKey]?.url !== ledgerGit.url ||
    embeddedGit[targetKey]?.checksum !== ledgerGit.sha256
  ) {
    throw new Error(`Dugite's ${targetKey} payload does not match the reviewed ledger.`);
  }

  const npmPackage = path.dirname(require.resolve("npm/package.json"));
  const npmManifest = await readJson(path.join(npmPackage, "package.json"));
  assertVersion("npm", npmManifest.version, ledger.components.npm.version);
  const gitLicense = await downloadVerifiedSource(ledger.components.notices.git);
  const gitLfsLicense = await downloadVerifiedSource(ledger.components.notices.gitLfs);

  return {
    courseEngineRoot: path.join(repositoryRoot, "course-engine"),
    gitRoot: path.join(dugitePackage, "git"),
    npmRoot: npmPackage,
    licenseSources: {
      dugite: path.join(dugitePackage, "LICENSE"),
      npm: path.join(npmPackage, "LICENSE"),
      notices: path.join(repositoryRoot, "distribution", "THIRD-PARTY-NOTICES.md"),
    },
    remoteLicenses: { "git.txt": gitLicense, "git-lfs.md": gitLfsLicense },
  };
}

async function materializeRuntime({ platform, architecture, targetKey, ledger, sources, root }) {
  await mkdir(root, { recursive: true });
  const destinations = {
    "course-engine": path.join(root, "course-engine"),
    git: path.join(root, "tools", "git"),
    npm: path.join(root, "tools", "npm"),
  };

  await mkdir(destinations["course-engine"], { recursive: true });
  await copyEntry(
    path.join(sources.courseEngineRoot, "manifest.json"),
    path.join(destinations["course-engine"], "manifest.json"),
    sources.courseEngineRoot,
  );
  await copyEntry(
    path.join(sources.courseEngineRoot, "template"),
    path.join(destinations["course-engine"], "template"),
    sources.courseEngineRoot,
  );
  await copyEntry(sources.gitRoot, destinations.git, sources.gitRoot);
  await copyNpmTree(sources.npmRoot, destinations.npm);
  await writeJavaScriptToolShims(destinations.npm, platform);
  await materializeLicenses(root, sources);
  await assertDistributionInventory(root);

  const engineManifest = await readJson(path.join(sources.courseEngineRoot, "manifest.json"));
  const metadata = {
    "course-engine": {
      version: engineManifest.engineVersion,
      license: "MIT",
      source: `${engineManifest.source.repository}#${engineManifest.source.commit}`,
      required: [
        "course-engine/manifest.json",
        "course-engine/template/CLAUDE.md",
        "course-engine/template/scripts/doctor.mjs",
      ],
    },
    git: {
      version: ledger.components.git.nativeVersion,
      license: ledger.components.git.license,
      source: ledger.components.git.targets[targetKey].url,
      required: [platform === "win32" ? "tools/git/cmd/git.exe" : "tools/git/bin/git"],
    },
    npm: {
      version: ledger.components.npm.version,
      license: ledger.components.npm.license,
      source: ledger.components.npm.url,
      required: [
        "tools/npm/bin/npm-cli.js",
        `tools/npm/bin/${platform === "win32" ? "npm.cmd" : "npm"}`,
        `tools/npm/bin/${platform === "win32" ? "node.cmd" : "node"}`,
      ],
    },
  };

  const candidateTrees = {};
  for (const id of COMPONENT_IDS) {
    candidateTrees[id] = await hashTree(destinations[id]);
  }
  const acceptedTrees = ledger.acceptedComponentTrees?.[targetKey];
  if (acceptedTrees === undefined) {
    throw new Error(
      `The reviewed ledger has no accepted component trees for ${targetKey}. Candidate component trees: ${JSON.stringify(candidateTrees)}.`,
    );
  }

  const components = [];
  for (const id of COMPONENT_IDS) {
    const tree = candidateTrees[id];
    const acceptedTree = acceptedTrees[id];
    if (
      acceptedTree?.fileCount !== tree.fileCount ||
      acceptedTree?.treeSha256 !== tree.treeSha256
    ) {
      throw new Error(
        `The assembled ${id} tree does not match the reviewed ${targetKey} input: ${JSON.stringify(tree)}.`,
      );
    }
    const { required, ...componentMetadata } = metadata[id];
    const requiredFiles = [];
    for (const relativePath of required) {
      requiredFiles.push(
        await describeRequiredFile(
          root,
          relativePath,
          platform !== "win32" && isExecutableRuntimePath(relativePath),
        ),
      );
    }
    components.push({ id, ...componentMetadata, ...tree, requiredFiles });
  }
  const appManifest = await readJson(path.join(repositoryRoot, "package.json"));
  const payload = await hashTree(root);
  return {
    schemaVersion: 4,
    appVersion: appManifest.version,
    target: { platform, architecture },
    components,
    payload,
  };
}

async function writeJavaScriptToolShims(npmRoot, platform) {
  const bin = path.join(npmRoot, "bin");
  await mkdir(bin, { recursive: true });
  if (platform === "win32") {
    await writeFile(
      path.join(bin, "npm.cmd"),
      '@echo off\r\nif "%PRAXEUM_ELECTRON_EXECUTABLE%"=="" exit /b 1\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"%PRAXEUM_ELECTRON_EXECUTABLE%" "%~dp0npm-cli.js" %*\r\n',
    );
    await writeFile(
      path.join(bin, "node.cmd"),
      '@echo off\r\nif "%PRAXEUM_ELECTRON_EXECUTABLE%"=="" exit /b 1\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"%PRAXEUM_ELECTRON_EXECUTABLE%" %*\r\n',
    );
    return;
  }
  await writeFile(
    path.join(bin, "npm"),
    '#!/bin/sh\nif [ -z "$PRAXEUM_ELECTRON_EXECUTABLE" ]; then exit 1; fi\nSCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nELECTRON_RUN_AS_NODE=1 exec "$PRAXEUM_ELECTRON_EXECUTABLE" "$SCRIPT_DIR/npm-cli.js" "$@"\n',
  );
  await writeFile(
    path.join(bin, "node"),
    '#!/bin/sh\nif [ -z "$PRAXEUM_ELECTRON_EXECUTABLE" ]; then exit 1; fi\nELECTRON_RUN_AS_NODE=1 exec "$PRAXEUM_ELECTRON_EXECUTABLE" "$@"\n',
  );
  await chmod(path.join(bin, "npm"), 0o755);
  await chmod(path.join(bin, "node"), 0o755);
}

async function materializeLicenses(root, sources) {
  const licenses = path.join(root, "licenses");
  await mkdir(licenses, { recursive: true });
  for (const [name, source] of Object.entries(sources.licenseSources)) {
    await copyFile(source, path.join(licenses, `${name}${path.extname(source) || ".txt"}`));
  }
  for (const [name, bytes] of Object.entries(sources.remoteLicenses)) {
    await writeFile(path.join(licenses, name), bytes, { flag: "wx" });
  }
}

async function downloadVerifiedSource(source) {
  const response = await globalThis.fetch(source.url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Could not download reviewed notice source: ${source.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== source.sha256) {
    throw new Error(`Reviewed notice checksum mismatch for ${source.url}.`);
  }
  return bytes;
}

export async function copyNpmTree(source, destination) {
  await copyEntry(source, destination, source, NPM_INSTALLATION_BYPRODUCTS);
}

async function copyEntry(source, destination, sourceRoot, ignoredRelativePaths = new Set()) {
  const relativeSource = path.relative(sourceRoot, source).split(path.sep).join("/");
  if (
    relativeSource !== "" &&
    [...ignoredRelativePaths].some(
      (ignored) => relativeSource === ignored || relativeSource.startsWith(`${ignored}/`),
    )
  ) {
    return;
  }
  const info = await lstat(source);
  if (info.isSymbolicLink()) {
    const target = await readlink(source);
    const resolved = path.resolve(path.dirname(source), target);
    if (!isWithin(sourceRoot, resolved) && path.resolve(sourceRoot) !== resolved) {
      throw new Error(`Source link escapes its component: ${source}`);
    }
    await symlink(target, destination, info.isDirectory() ? "dir" : "file");
    return;
  }
  if (info.isDirectory()) {
    await mkdir(destination, {
      recursive: true,
      mode: process.platform === "win32" ? info.mode : 0o755,
    });
    const entries = await readdir(source, { withFileTypes: true });
    entries.sort((left, right) => lexicalCompare(left.name, right.name));
    for (const entry of entries) {
      await copyEntry(
        path.join(source, entry.name),
        path.join(destination, entry.name),
        sourceRoot,
        ignoredRelativePaths,
      );
    }
    return;
  }
  if (!info.isFile()) throw new Error(`Unsupported runtime source entry: ${source}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  await chmod(destination, normalizeRuntimeFileMode(info.mode));
}

/** Package-manager caches may restore equivalent POSIX payloads with different
 * writable bits. Runtime outputs deliberately keep only the executable class. */
export function normalizeRuntimeFileMode(mode, platform = process.platform) {
  if (platform === "win32") return mode;
  return (mode & 0o111) === 0 ? 0o644 : 0o755;
}

async function hashTree(root) {
  const entries = [];
  await collectTree(root, root, entries);
  entries.sort((left, right) => lexicalCompare(left.path, right.path));
  const aggregate = createHash("sha256");
  for (const entry of entries) {
    aggregate.update(
      `${entry.type}\0${entry.path}\0${entry.mode ?? "link"}\0${entry.size}\0${entry.sha256}\n`,
    );
  }
  return { fileCount: entries.length, treeSha256: aggregate.digest("hex") };
}

async function collectTree(root, current, entries) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    if (entry.isDirectory()) {
      await collectTree(root, absolutePath, entries);
    } else if (entry.isSymbolicLink()) {
      const target = await readlink(absolutePath);
      entries.push({
        type: "link",
        path: relativePath,
        size: Buffer.byteLength(target),
        sha256: createHash("sha256").update(target).digest("hex"),
      });
    } else if (entry.isFile()) {
      const info = await stat(absolutePath);
      entries.push({
        type: "file",
        path: relativePath,
        mode: info.mode & 0o777,
        size: info.size,
        sha256: await sha256File(absolutePath),
      });
    } else throw new Error(`Unsupported assembled runtime entry: ${absolutePath}`);
  }
}

async function describeRequiredFile(root, relativePath, executable) {
  const absolutePath = path.join(root, ...relativePath.split("/"));
  const info = await lstat(absolutePath);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Required runtime file is not an ordinary file: ${relativePath}`);
  }
  return {
    path: relativePath,
    size: info.size,
    sha256: await sha256File(absolutePath),
    ...(executable ? { executable: true } : {}),
  };
}

function isExecutableRuntimePath(relativePath) {
  return (
    relativePath.endsWith(".exe") ||
    relativePath.endsWith("/git") ||
    relativePath.endsWith("/npm") ||
    relativePath.endsWith("/node")
  );
}

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function sha256File(filePath) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function assertVersion(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label} is ${actual}; expected ${expected}.`);
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function exists(candidate) {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

/** A complete manifest is the publication marker. Windows can hold large
 * copied binaries open for scanning, so renaming their parent directory is
 * not reliable; the final small manifest rename remains atomic. */
async function publishPath(temporaryPath, finalPath) {
  const retryDelays = [0, 100, 250, 500, 1000, 2000];
  let lastError;
  for (const delay of retryDelays) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await rename(temporaryPath, finalPath);
      return;
    } catch (error) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(error?.code)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
