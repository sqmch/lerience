// Explicit opt-in: uses the signed-in external Claude client for two real turns
// and their fresh openers. It creates only disposable synthetic courses.
import { createRequire } from "node:module";
import process from "node:process";
import { access } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

if (process.argv[2] !== "--run" || !process.env.RECOVERY_CLAUDE_EXE) {
  throw new Error("Set RECOVERY_CLAUDE_EXE to the provider-owned client, then pass --run.");
}
await access(process.env.RECOVERY_CLAUDE_EXE);
const require = createRequire(import.meta.url);
const electron = require("electron");
await access(electron);
// Use Vite's pinned build dependency, without fetching a separate executable.
const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
const entry = path.resolve("out/recovery.cjs");
await build({
  entryPoints: ["dev/recovery/run.ts"],
  outfile: entry,
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
});
await access(entry);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
// Electron can outlive the invoking shell. A closed inherited output pipe can
// otherwise turn a runtime warning into an EPIPE main-process error dialog.
const prefix = path.resolve(`out/recovery-native-${Date.now()}`);
const stdout = openSync(`${prefix}.stdout.log`, "w");
const stderr = openSync(`${prefix}.stderr.log`, "w");
const child = spawn(electron, [entry], {
  env,
  stdio: ["ignore", stdout, stderr],
  windowsHide: true,
});
closeSync(stdout);
closeSync(stderr);
child.on("error", (error) => {
  throw error;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
