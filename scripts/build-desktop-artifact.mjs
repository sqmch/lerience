import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDesktopPackageInputs, resolveDesktopTarget } from "./desktop-artifacts.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const PREFLIGHT_TESTS = [
  "tests/runtime-manifest.test.ts",
  "tests/course-creator.test.ts",
  "tests/course-engine-updater.test.ts",
];
const TOOL_PATHS = Object.freeze({
  build: path.join(repositoryRoot, "node_modules", "electron-vite", "bin", "electron-vite.js"),
  installElectron: path.join(repositoryRoot, "node_modules", "electron", "install.js"),
  test: path.join(repositoryRoot, "node_modules", "vitest", "vitest.mjs"),
  package: path.join(repositoryRoot, "node_modules", "electron-builder", "cli.js"),
});

export function unsignedBuildEnvironment(source, targetKey) {
  const environment = { ...source, PRAXEUM_DESKTOP_TARGET: targetKey };
  environment.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  for (const name of [
    "CSC_LINK",
    "CSC_NAME",
    "CSC_KEY_PASSWORD",
    "WIN_CSC_LINK",
    "WIN_CSC_KEY_PASSWORD",
    "APPLE_API_KEY",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
    "APPLE_KEYCHAIN",
    "APPLE_KEYCHAIN_PROFILE",
  ]) {
    delete environment[name];
  }
  return environment;
}

export function assertNativeTarget(target, host = process) {
  if (host.platform !== target.platform || host.arch !== target.architecture) {
    throw new Error(
      `${target.key} must be built on ${target.platform}-${target.architecture}; this host is ${host.platform}-${host.arch}.`,
    );
  }
}

function parseArguments(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  let targetKey;
  let directoryOnly = false;
  let preflightOnly = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const value = normalized[index];
    if (value === "--target" && normalized[index + 1] !== undefined) {
      targetKey = normalized[index + 1];
      index += 1;
    } else if (value === "--dir") {
      directoryOnly = true;
    } else if (value === "--preflight") {
      preflightOnly = true;
    } else {
      throw new Error(usage());
    }
  }
  if (targetKey === undefined || (directoryOnly && preflightOnly)) throw new Error(usage());
  return { targetKey, directoryOnly, preflightOnly };
}

function run(command, args, environment, label = path.basename(command)) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
    shell: false,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} ${args.join(" ")} failed with exit code ${String(result.status)}.`);
  }
}

function runTool(tool, args, environment) {
  run(process.execPath, [TOOL_PATHS[tool], ...args], environment, tool);
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const target = resolveDesktopTarget(options.targetKey);
  assertNativeTarget(target);
  const environment = unsignedBuildEnvironment(process.env, target.key);
  readDesktopPackageInputs({ targetKey: target.key, environment });

  if (!options.preflightOnly) runTool("build", ["build"], environment);
  runTool("installElectron", [], environment);
  runTool("test", ["run", ...PREFLIGHT_TESTS], environment);
  if (options.preflightOnly) return;

  const builderArguments = [
    "--config",
    "electron-builder.config.mjs",
    target.builderPlatformFlag,
    target.builderArchitectureFlag,
  ];
  if (options.directoryOnly) builderArguments.push("--dir");
  runTool("package", builderArguments, environment);
}

function usage() {
  return "Usage: build-desktop-artifact --target <win32-x64|darwin-arm64|darwin-x64> [--dir|--preflight]";
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
