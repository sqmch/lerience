import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ID = /^[a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*){2,}$/u;
const EXECUTABLE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const PRODUCT_NAME = /^[^<>:"/\\|?*]{1,80}$/u;

export function readWindowsPackageInputs(environment = process.env) {
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

  const packageJson = JSON.parse(
    readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
      "utf8",
    ),
  );
  const manifest = JSON.parse(readFileSync(path.join(runtimeRoot, "manifest.json"), "utf8"));
  if (
    manifest.schemaVersion !== 4 ||
    manifest.appVersion !== packageJson.version ||
    manifest.target?.platform !== "win32" ||
    manifest.target?.architecture !== "x64"
  ) {
    throw new Error("PRAXEUM_RUNTIME_ROOT does not match this Windows x64 app build.");
  }

  return { productName, appId, executableName, runtimeRoot };
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

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const inputs = readWindowsPackageInputs();
    process.stdout.write(
      `${JSON.stringify({ ...inputs, runtimeRoot: path.resolve(inputs.runtimeRoot) }, null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
