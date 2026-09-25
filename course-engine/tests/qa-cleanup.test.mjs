// Run the real QA CLI and npm check lifecycle against repository-owned fixtures.
// Electron's Windows fs implementation matters here: standalone Node alone did
// not reproduce LB-001. No installed course is used, even for runtime acceptance.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { copyNpmTree, writeJavaScriptToolShims } from "../../scripts/assemble-runtime.mjs";

const require = createRequire(import.meta.url);
const qa = fileURLToPath(new URL("../template/scripts/qa-module.mjs", import.meta.url));
const runtimes = [["Node", process.execPath]];
if (process.platform === "win32") {
  runtimes.push(["Electron", process.env.QA_ELECTRON_EXECUTABLE || require("electron")]);
}
let toolsRoot;
let npmBin;
before(async () => {
  if (process.platform !== "win32") return;
  if (process.env.QA_RUNTIME_BIN) {
    npmBin = process.env.QA_RUNTIME_BIN;
    return;
  }
  toolsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-qa-tools-"));
  await copyNpmTree(path.dirname(require.resolve("npm/package.json")), toolsRoot);
  await writeJavaScriptToolShims(toolsRoot, "win32");
  npmBin = path.join(toolsRoot, "bin");
});
after(() => {
  if (toolsRoot) removeFixture(toolsRoot);
});

function write(root, rel, body) {
  const dest = path.join(root, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, typeof body === "string" ? body : JSON.stringify(body));
}

function removeFixture(root) {
  // A failed cleanup can deliberately leave a junction. Detach links before
  // recursively deleting this exclusively owned fixture, under either runtime.
  for (const entry of fs.readdirSync(root)) {
    const child = path.join(root, entry);
    const stat = fs.lstatSync(child);
    if (stat.isSymbolicLink()) fs.unlinkSync(child);
    else if (stat.isDirectory()) removeFixture(child);
  }
  fs.rmSync(root, { recursive: true, force: true });
}

for (const [runtime, executable] of runtimes) {
  for (const scenario of [
    "success",
    "check-crash",
    "overlay-error",
    "timeout",
    "spawn-error",
    "unlink-error",
    "dangling-link",
  ]) {
    test(`QA cleanup preserves dependencies: ${runtime}, ${scenario}`, () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-qa-cleanup-"));
      try {
        const moduleDir = path.join(root, "00-fixture");
        const temp = path.join(root, "temp");
        fs.mkdirSync(temp);
        write(root, "neighbor.txt", "neighbor sentinel");
        write(root, "linked-target/sentinel.txt", "linked sentinel");
        write(
          moduleDir,
          "scaffold/node_modules/fixture-dependency/index.cjs",
          "module.exports = 42;\n",
        );
        write(
          moduleDir,
          "scaffold/node_modules/fixture-dependency/nested/sentinel.txt",
          "dependency sentinel",
        );
        write(moduleDir, "scaffold/neighbor.txt", "scaffold sentinel");
        write(
          moduleDir,
          "scaffold/answer.cjs",
          "// TODO(you): return the expected value\nmodule.exports = 0;\n",
        );
        write(moduleDir, "scaffold/package.json", {
          scripts: { check: "node ../checks/check.cjs" },
        });
        write(
          moduleDir,
          "checks/check.cjs",
          `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
fs.appendFileSync(process.env.QA_FIXTURE_RUNS, JSON.stringify({ cwd: process.cwd(), node: process.versions.node, electron: process.versions.electron }) + '\\n');
const expected = require(path.join(process.cwd(), 'node_modules/fixture-dependency/index.cjs'));
fs.mkdirSync('generated/nested', { recursive: true });
fs.symlinkSync(path.join(process.env.QA_FIXTURE_ROOT, 'linked-target'), 'generated/nested/linked-input', process.platform === 'win32' ? 'junction' : 'dir');
if (process.env.QA_FIXTURE_SCENARIO === 'check-crash') throw new Error('fixture check crash');
try {
  assert.equal(require(path.join(process.cwd(), 'answer.cjs')), expected);
  console.log('Tests 1 passed (1)');
} catch (error) {
  console.error(error);
  console.log('Tests 1 failed (1)');
  process.exitCode = 1;
}
`,
        );
        write(moduleDir, "LESSON.md", "Return the expected value from the exercise.\n");
        write(moduleDir, "BRIEF.md", "Return 42 from the exercise.\n");
        write(moduleDir, "quiz.md", "1. First?\n2. Second?\n3. Third?\n4. Fourth?\n");
        write(moduleDir, "module.json", {
          id: "00-fixture",
          title: "Fixture",
          phase: 0,
          prerequisites: [],
          runtime: "node",
          estimatedHours: 0.5,
          provenance: "core",
          volatileLayer: "present",
        });
        // A legacy module is valid with an advisory warning; no learner records.
        fs.mkdirSync(path.join(moduleDir, "hints"));
        write(root, "reference/answer.cjs", "module.exports = 42;\n");
        if (scenario === "overlay-error") {
          fs.mkdirSync(path.join(moduleDir, "scaffold", "collision"));
          write(root, "reference/collision", "cannot overwrite a directory");
        }
        const events = path.join(root, "events.jsonl");
        const runs = path.join(root, "runs.jsonl");
        // Inject only exceptional OS/process outcomes; ordinary success/crash
        // cases execute unmodified filesystem operations and the real npm CLI.
        write(
          root,
          "faults.mjs",
          `
import fs from 'node:fs';
import cp from 'node:child_process';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const scenario = process.env.QA_FIXTURE_SCENARIO;
const record = event => fs.appendFileSync(process.env.QA_FIXTURE_EVENTS, JSON.stringify(event) + '\\n');
const originalUnlink = fs.unlinkSync;
fs.unlinkSync = function (file, ...args) {
  if (scenario === 'unlink-error' && path.basename(file) === 'node_modules') {
    record('unlink-error');
    throw Object.assign(new Error('fixture unlink denied'), { code: 'EACCES' });
  }
  return originalUnlink.call(this, file, ...args);
};
const originalRm = fs.rmSync;
fs.rmSync = function (file, ...args) {
  if (scenario === 'unlink-error' && file.includes('praxeum-qa-run-')) record('recursive-remove');
  return originalRm.call(this, file, ...args);
};
const originalSpawn = cp.spawnSync;
cp.spawnSync = function (command, ...args) {
  // Keep every child of the acceptance run hidden, including npm's shell.
  if (args[1]) args[1].windowsHide = true;
  if (command === 'npm' && ['timeout', 'spawn-error', 'dangling-link'].includes(scenario)) {
    record(scenario);
    if (scenario === 'dangling-link') {
      const link = path.join(args[1].cwd, 'node_modules');
      originalUnlink(link);
      fs.symlinkSync(path.join(process.env.QA_FIXTURE_ROOT, 'absent'), link, process.platform === 'win32' ? 'junction' : 'dir');
    }
    return { error: Object.assign(new Error('fixture process failure'), { code: scenario === 'timeout' ? 'ETIMEDOUT' : 'ENOENT' }), status: null };
  }
  return originalSpawn.call(this, command, ...args);
};
syncBuiltinESMExports();
`,
        );
        const environment = { ...process.env };
        if (runtime === "Electron") {
          // Exercise the production npm/node shims without a host Node fallback.
          for (const key of Object.keys(environment)) {
            if (/^(path|node_path|node_options)$/i.test(key)) delete environment[key];
          }
          environment.PATH = [npmBin, path.join(process.env.SystemRoot, "System32")].join(
            path.delimiter,
          );
          environment.PRAXEUM_ELECTRON_EXECUTABLE = executable;
        }
        const result = spawnSync(
          executable,
          [
            "--import",
            pathToFileURL(path.join(root, "faults.mjs")).href,
            qa,
            moduleDir,
            "--reference",
            path.join(root, "reference"),
            "--json",
          ],
          {
            encoding: "utf8",
            windowsHide: true,
            timeout: 30_000,
            env: {
              ...environment,
              ELECTRON_RUN_AS_NODE: "1",
              NODE_DISABLE_COMPILE_CACHE: "1",
              TMP: temp,
              TEMP: temp,
              TMPDIR: temp,
              QA_FIXTURE_ROOT: root,
              QA_FIXTURE_SCENARIO: scenario,
              QA_FIXTURE_EVENTS: events,
              QA_FIXTURE_RUNS: runs,
            },
          },
        );
        assert.ifError(result.error);
        // Check bytes before QA verdicts so deletion is the primary failure.
        assert.equal(
          fs.readFileSync(
            path.join(moduleDir, "scaffold/node_modules/fixture-dependency/index.cjs"),
            "utf8",
          ),
          "module.exports = 42;\n",
        );
        assert.equal(
          fs.readFileSync(
            path.join(moduleDir, "scaffold/node_modules/fixture-dependency/nested/sentinel.txt"),
            "utf8",
          ),
          "dependency sentinel",
        );
        assert.equal(
          fs.readFileSync(path.join(moduleDir, "scaffold/neighbor.txt"), "utf8"),
          "scaffold sentinel",
        );
        assert.equal(fs.readFileSync(path.join(root, "neighbor.txt"), "utf8"), "neighbor sentinel");
        assert.equal(
          fs.readFileSync(path.join(root, "linked-target/sentinel.txt"), "utf8"),
          "linked sentinel",
        );
        const report = JSON.parse(result.stdout);
        const dynamic = report.find((row) => row.id === "dynamic-run");
        const reference = report.find((row) => row.id === "reference-run");
        if (["success", "unlink-error"].includes(scenario)) {
          assert.equal(result.status, 0, result.stdout + result.stderr);
          assert.equal(dynamic.level, "ok");
          assert.equal(reference.level, "ok");
        } else if (scenario === "overlay-error") {
          assert.equal(dynamic.level, "ok");
          assert.match(reference.message, /could not run reference/);
        } else {
          assert.equal(result.status, 1, result.stdout + result.stderr);
          assert.equal(dynamic.level, "fail");
          assert.equal(reference.level, "fail");
        }
        if (["success", "check-crash", "unlink-error", "overlay-error"].includes(scenario)) {
          const invocations = fs.readFileSync(runs, "utf8").trim().split("\n").map(JSON.parse);
          assert.equal(invocations.length, scenario === "overlay-error" ? 1 : 2);
          for (const invocation of invocations) {
            assert.ok(invocation.cwd.startsWith(temp + path.sep));
            if (runtime === "Electron")
              assert.ok(invocation.electron, "checks also use Electron's Node runtime");
          }
        }
        if (scenario === "unlink-error") {
          assert.equal(
            report.filter((row) => row.id === "cleanup" && row.level === "warn").length,
            2,
          );
          assert.deepEqual(fs.readFileSync(events, "utf8").trim().split("\n").map(JSON.parse), [
            "unlink-error",
            "unlink-error",
          ]);
          assert.equal(fs.readdirSync(temp).length, 2, "retain temp trees when detachment fails");
        } else {
          assert.deepEqual(fs.readdirSync(temp), [], "QA removes its own temporary trees");
        }
      } finally {
        assert.equal(path.dirname(root), os.tmpdir());
        removeFixture(root);
      }
    });
  }
}
