import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const APP_ID = /^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*){2,}$/u;
const EXECUTABLE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const PRODUCT_NAME = /^[^<>:"/\\|?*]{1,80}$/u;
const MAX_ARTIFACT_BYTES = 350 * 1024 * 1024;

const targetDefinitions = Object.freeze({
  "win32-x64": {
    key: "win32-x64",
    platform: "win32",
    architecture: "x64",
    packageType: "nsis",
    builderPlatformFlag: "--win",
    builderArchitectureFlag: "--x64",
    outputDirectory: "dist/package/windows-x64",
    artifactName: (executableName, version) => `${executableName}-Setup-${version}-x64.exe`,
  },
  "darwin-arm64": {
    key: "darwin-arm64",
    platform: "darwin",
    architecture: "arm64",
    packageType: "dmg",
    builderPlatformFlag: "--mac",
    builderArchitectureFlag: "--arm64",
    outputDirectory: "dist/package/macos-arm64",
    artifactName: (executableName, version) => `${executableName}-${version}-arm64.dmg`,
  },
  "darwin-x64": {
    key: "darwin-x64",
    platform: "darwin",
    architecture: "x64",
    packageType: "dmg",
    builderPlatformFlag: "--mac",
    builderArchitectureFlag: "--x64",
    outputDirectory: "dist/package/macos-x64",
    artifactName: (executableName, version) => `${executableName}-${version}-x64.dmg`,
  },
});

export const CURRENT_RELEASE_TARGET_KEYS = Object.freeze([
  "win32-x64",
  "darwin-arm64",
  "darwin-x64",
]);

export function resolveDesktopTarget(targetKey) {
  if (typeof targetKey !== "string" || !Object.hasOwn(targetDefinitions, targetKey)) {
    throw new Error(`Unsupported desktop target: ${String(targetKey)}.`);
  }
  const target = targetDefinitions[targetKey];
  return Object.freeze(target);
}

export function readDesktopPackageInputs({ targetKey, environment = process.env } = {}) {
  const target = resolveDesktopTarget(targetKey ?? required(environment, "PRAXEUM_DESKTOP_TARGET"));
  const productName = required(environment, "PRAXEUM_PRODUCT_NAME");
  const appId = required(environment, "PRAXEUM_APP_ID");
  const executableName = required(environment, "PRAXEUM_EXECUTABLE_NAME");
  const runtimeRoot = path.resolve(required(environment, "PRAXEUM_RUNTIME_ROOT"));

  if (
    !PRODUCT_NAME.test(productName) ||
    [...productName].some((character) => character.charCodeAt(0) < 0x20)
  ) {
    throw new Error("PRAXEUM_PRODUCT_NAME is not a safe name.");
  }
  if (!APP_ID.test(appId)) {
    throw new Error("PRAXEUM_APP_ID must be a stable lowercase reverse-domain identifier.");
  }
  if (!EXECUTABLE_NAME.test(executableName) || executableName.toLowerCase().endsWith(".exe")) {
    throw new Error("PRAXEUM_EXECUTABLE_NAME must be a safe extensionless filename.");
  }
  if (!isDirectory(runtimeRoot)) {
    throw new Error("PRAXEUM_RUNTIME_ROOT must be an assembled runtime directory.");
  }

  const packageJson = readPackageJson();
  const manifest = JSON.parse(readFileSync(path.join(runtimeRoot, "manifest.json"), "utf8"));
  if (
    manifest.schemaVersion !== 4 ||
    manifest.appVersion !== packageJson.version ||
    manifest.target?.platform !== target.platform ||
    manifest.target?.architecture !== target.architecture
  ) {
    throw new Error(
      `PRAXEUM_RUNTIME_ROOT does not match this ${target.platform}-${target.architecture} app build.`,
    );
  }

  return { productName, appId, executableName, runtimeRoot, target };
}

export async function describeDesktopReleaseArtifacts({
  directory,
  executableName,
  version = readPackageJson().version,
  targetKeys = CURRENT_RELEASE_TARGET_KEYS,
}) {
  if (!EXECUTABLE_NAME.test(executableName) || executableName.toLowerCase().endsWith(".exe")) {
    throw new Error("The release executable name is unsafe.");
  }
  if (!/^\d+\.\d+\.\d+$/u.test(version)) {
    throw new Error("The release version must be stable semantic versioning.");
  }

  const artifactDirectory = path.resolve(directory);
  if (new Set(targetKeys).size !== targetKeys.length) {
    throw new Error("The release target list contains a duplicate desktop target.");
  }
  const expectedTargets = targetKeys.map(resolveDesktopTarget);
  const expectedNames = new Set(
    expectedTargets.map((target) => target.artifactName(executableName, version)),
  );
  const applicationFiles = (await readdir(artifactDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(?:dmg|exe|zip)$/iu.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  if (
    applicationFiles.length !== expectedNames.size ||
    applicationFiles.some((fileName) => !expectedNames.has(fileName))
  ) {
    throw new Error("The release input directory does not contain the exact desktop artifacts.");
  }

  return await Promise.all(
    expectedTargets.map(async (target) => {
      const fileName = target.artifactName(executableName, version);
      const filePath = path.join(artifactDirectory, fileName);
      const information = await stat(filePath);
      if (!information.isFile() || information.size <= 0 || information.size > MAX_ARTIFACT_BYTES) {
        throw new Error(`The ${target.key} artifact is missing, empty, or over the 350 MiB limit.`);
      }
      const digest = createHash("sha256");
      for await (const chunk of createReadStream(filePath)) digest.update(chunk);
      return {
        platform: target.platform,
        architecture: target.architecture,
        packageType: target.packageType,
        fileName,
        filePath,
        size: information.size,
        sha256: digest.digest("hex"),
      };
    }),
  );
}

function readPackageJson() {
  return JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
}

function required(environment, name) {
  const value = environment[name]?.trim();
  if (value === undefined || value === "") throw new Error(`${name} is required for packaging.`);
  return value;
}

function isDirectory(candidate) {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}
