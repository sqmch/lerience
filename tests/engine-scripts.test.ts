import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEngineScriptService } from "../src/main/scripts/engine-script-service";
import {
  guardModuleDirectory,
  hasRunnableCheck,
  journalTail,
  parseCheckRun,
  parseDoctorResults,
} from "../src/main/scripts/parsers";
import {
  CHECK_MAX_OUTPUT_BYTES,
  CHECK_TIMEOUT_MS,
  type ProcessRunRequest,
  type ProcessRunner,
  type ProcessRunResult,
} from "../src/main/scripts/process-runner";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    }),
  );
});

describe("doctor result contract", () => {
  it("accepts only the stable array shape and strips a UTF-8 BOM", () => {
    expect(
      parseDoctorResults(
        '\uFEFF[{"id":"parse","level":"ok","message":"course files parse","extra":1}]',
      ),
    ).toEqual([{ id: "parse", level: "ok", message: "course files parse" }]);
    expect(parseDoctorResults("[]")).toEqual([]);
  });

  it("rejects malformed JSON, unknown levels, and partial rows", () => {
    expect(parseDoctorResults("not json")).toBeNull();
    expect(parseDoctorResults('{"id":"parse"}')).toBeNull();
    expect(parseDoctorResults('[{"id":"x","level":"maybe","message":"no"}]')).toBeNull();
    expect(parseDoctorResults('[{"id":"x","level":"fail"}]')).toBeNull();
  });
});

describe("journal context tail", () => {
  it("drops the preamble and keeps only the last three dated entries in source order", () => {
    const markdown = [
      "# Tutor journal",
      "Preamble that is not session context.",
      "",
      "## 2026-08-01 — One",
      "first",
      "---",
      "## 2026-08-02 — Two",
      "second",
      "---",
      "## 2026-08-03 — Three",
      "third",
      "---",
      "## 2026-08-04 — Four",
      "fourth",
    ].join("\n");

    const tail = journalTail(markdown);
    expect(tail).not.toContain("Preamble");
    expect(tail).not.toContain("One");
    expect(tail).toContain("## 2026-08-02 — Two");
    expect(tail.indexOf("Two")).toBeLessThan(tail.indexOf("Four"));
  });

  it("bounds oversized Unicode content by UTF-8 bytes", () => {
    const tail = journalTail(`## 2026-08-04 — Large\n${"🙂".repeat(200)}`, 3, 128);
    expect(Buffer.byteLength(tail, "utf8")).toBeLessThanOrEqual(128);
    expect(tail).toContain("earlier journal content omitted");
    expect(tail).not.toContain("�");
  });

  it("returns no context for a template-only journal", () => {
    expect(journalTail("# Tutor journal\n\nAppend-only session log.\n")).toBe("");
  });
});

describe("check guard and package affordance", () => {
  const root = path.resolve(tmpdir(), "course-repo");

  it("resolves a schema-valid module directly under curriculum", () => {
    const guarded = guardModuleDirectory(root, "02-vector-store");
    expect(guarded.ok).toBe(true);
    expect(guarded.scaffoldDir).toBe(path.join(root, "curriculum", "02-vector-store", "scaffold"));
  });

  it("refuses traversal, nesting, absolute paths, and non-schema ids", () => {
    for (const id of ["", ".", "..", "../evil", "02/../../etc", "a/b", "plain-name"]) {
      expect(guardModuleDirectory(root, id).ok, id).toBe(false);
    }
    expect(guardModuleDirectory(root, path.resolve(root, "outside")).ok).toBe(false);
  });

  it("counts only a string scripts.check", () => {
    expect(hasRunnableCheck({ scripts: { check: "vitest run --dir ../checks" } })).toBe(true);
    expect(hasRunnableCheck({ scripts: { test: "vitest" } })).toBe(false);
    expect(hasRunnableCheck({ scripts: { check: 1 } })).toBe(false);
    expect(hasRunnableCheck({ scripts: "nope" })).toBe(false);
  });
});

describe("parseCheckRun", () => {
  const failOutput = [
    " \x1b[31m❯\x1b[39m ../checks/vector-store.test.ts \x1b[2m(\x1b[22m10 tests | \x1b[31m10 failed\x1b[39m\x1b[2m)\x1b[22m",
    "\x1b[31m\x1b[1m\x1b[7m FAIL \x1b[27m\x1b[22m\x1b[39m ../checks/vector-store.test.ts\x1b[2m > \x1b[22mchunk\x1b[2m > \x1b[22mmatches the worked example",
    "\x1b[31m\x1b[1m\x1b[7m FAIL \x1b[27m\x1b[22m\x1b[39m ../checks/vector-store.test.ts\x1b[2m > \x1b[22mVectorStore\x1b[2m > \x1b[22mhonours k",
    "\x1b[2m Test Files \x1b[22m \x1b[1m\x1b[31m1 failed\x1b[39m\x1b[22m\x1b[90m (1)\x1b[39m",
    "\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[31m10 failed\x1b[39m\x1b[22m\x1b[90m (10)\x1b[39m",
  ].join("\n");

  it("ports the engine study's ANSI, count, and failed-name behavior", () => {
    expect(parseCheckRun(failOutput)).toEqual({
      outcome: "fail",
      total: 10,
      failed: 10,
      passed: 0,
      failedNames: ["chunk > matches the worked example", "VectorStore > honours k"],
    });
    expect(parseCheckRun("      Tests  1 failed | 5 passed (6)\n")).toMatchObject({
      outcome: "fail",
      total: 6,
      failed: 1,
      passed: 5,
    });
    expect(parseCheckRun("      Tests  6 passed (6)\n")).toEqual({
      outcome: "pass",
      total: 6,
      failed: 0,
      passed: 6,
    });
  });

  it("distinguishes no checks from crashes and distrusts timed-out partial output", () => {
    expect(parseCheckRun("No test files found, exiting with code 1").outcome).toBe("no-checks");
    expect(parseCheckRun("      Tests  0 passed (0)\n").outcome).toBe("no-checks");
    expect(parseCheckRun("SyntaxError: Unexpected token").outcome).toBe("crash");
    expect(parseCheckRun("      Tests  3 passed (3)\n", true).outcome).toBe("crash");
  });
});

describe("engine script service context inspection", () => {
  it("runs course-local doctor and due scripts with their exact contracts", async () => {
    const courseDir = await courseFixture();
    const runner = new RecordingRunner(async (request) => {
      if (request.entryPoint.endsWith("doctor.mjs")) {
        return exited(1, '[{"id":"unjournaled","level":"fail","message":"open session"}]');
      }
      return exited(0, "2 quiz item(s) due — most overdue first.\n");
    });
    const service = createEngineScriptService({ runner });

    const context = await service.inspectContext({
      courseDir,
      currentModuleId: "02-vector-store",
    });

    expect(context.doctor).toEqual({
      available: true,
      value: [{ id: "unjournaled", level: "fail", message: "open session" }],
    });
    expect(context.due).toEqual({
      available: true,
      value: "2 quiz item(s) due — most overdue first.\n",
    });
    expect(context.currentModuleId).toBe("02-vector-store");
    expect(context.journalTail.available).toBe(true);

    const doctor = runner.requests.find((request) => request.entryPoint.endsWith("doctor.mjs"));
    const due = runner.requests.find((request) => request.entryPoint.endsWith("quiz.mjs"));
    expect(doctor?.args).toEqual([path.resolve(courseDir), "--json"]);
    expect(due?.args).toEqual(["due", "--limit", "0", path.resolve(courseDir)]);
  });

  it("does not accept doctor exit 2 or structurally invalid JSON", async () => {
    const courseDir = await courseFixture();
    const runner = new RecordingRunner(async (request) =>
      request.entryPoint.endsWith("doctor.mjs")
        ? exited(2, '[{"id":"x","level":"ok","message":"looks valid"}]')
        : exited(0, "none due\n"),
    );
    const service = createEngineScriptService({ runner });
    const first = await service.inspectContext({ courseDir, currentModuleId: null });
    expect(first.doctor).toEqual({
      available: false,
      reason: "course doctor exited without a valid result",
    });

    runner.handler = async (request) =>
      request.entryPoint.endsWith("doctor.mjs")
        ? exited(1, '[{"id":"x","level":"unknown","message":"bad"}]')
        : exited(0, "none due\n");
    const second = await service.inspectContext({ courseDir, currentModuleId: null });
    expect(second.doctor).toEqual({
      available: false,
      reason: "course doctor produced an invalid result",
    });
  });
});

describe("engine script service check lens", () => {
  it("returns study-compatible preflight states without spawning", async () => {
    const courseDir = await courseFixture();
    const runner = new RecordingRunner(async () => exited(0, "      Tests  1 passed (1)\n"));
    const service = createEngineScriptService({ runner });

    expect(await service.runChecks({ courseDir, moduleId: "nope" })).toEqual({
      error: "bad module id",
    });
    expect(await service.runChecks({ courseDir, moduleId: "01-no-scaffold" })).toMatchObject({
      outcome: "no-checks",
      detail: "this module has no scaffold to run checks in",
    });

    await scaffoldFixture(courseDir, "02-no-script", { scripts: { test: "vitest" } }, false);
    expect(await service.runChecks({ courseDir, moduleId: "02-no-script" })).toMatchObject({
      outcome: "no-checks",
      detail: "this module's scaffold has no check script",
    });

    await scaffoldFixture(courseDir, "03-no-deps", { scripts: { check: "vitest run" } }, false);
    expect(await service.runChecks({ courseDir, moduleId: "03-no-deps" })).toMatchObject({
      outcome: "crash",
      detail: "scaffold dependencies aren't installed — run `npm install` in the scaffold first",
    });
    expect(runner.requests).toHaveLength(0);
  });

  it("has no system-npm fallback when the packaged runtime is not injected", async () => {
    const courseDir = await courseFixture();
    await scaffoldFixture(courseDir, "02-vector-store", { scripts: { check: "vitest run" } }, true);
    const runner = new RecordingRunner(async () => exited(0, "      Tests  1 passed (1)\n"));
    const service = createEngineScriptService({ runner });

    expect(await service.runChecks({ courseDir, moduleId: "02-vector-store" })).toMatchObject({
      outcome: "crash",
      detail: "the packaged check runtime is unavailable",
    });
    expect(runner.requests).toHaveLength(0);
  });

  it("runs injected npm with fixed args, bounds, cwd, and the study parser", async () => {
    const courseDir = await courseFixture();
    await scaffoldFixture(courseDir, "02-vector-store", { scripts: { check: "vitest run" } }, true);
    const npmCliPath = path.join(courseDir, "runtime", "npm-cli.js");
    await write(npmCliPath, "// packaged npm placeholder\n");
    const runner = new RecordingRunner(async () =>
      exited(1, "      Tests  1 failed | 5 passed (6)\n", "assertion details\n"),
    );
    const service = createEngineScriptService({ runner, npmCliPath });

    expect(await service.runChecks({ courseDir, moduleId: "02-vector-store" })).toMatchObject({
      outcome: "fail",
      total: 6,
      failed: 1,
      passed: 5,
    });
    expect(runner.requests).toEqual([
      expect.objectContaining({
        entryPoint: path.resolve(npmCliPath),
        args: ["run", "check"],
        cwd: path.join(courseDir, "curriculum", "02-vector-store", "scaffold"),
        timeoutMs: CHECK_TIMEOUT_MS,
        maxOutputBytes: CHECK_MAX_OUTPUT_BYTES,
      }),
    ]);
  });

  it("is single-flight and clears busy after the active run settles", async () => {
    const courseDir = await courseFixture();
    await scaffoldFixture(courseDir, "02-vector-store", { scripts: { check: "vitest run" } }, true);
    const npmCliPath = path.join(courseDir, "runtime", "npm-cli.js");
    await write(npmCliPath, "// packaged npm placeholder\n");

    let finish: ((result: ProcessRunResult) => void) | undefined;
    const runner = new RecordingRunner(
      async () =>
        await new Promise<ProcessRunResult>((resolve) => {
          finish = resolve;
        }),
    );
    const service = createEngineScriptService({ runner, npmCliPath });

    const active = service.runChecks({ courseDir, moduleId: "02-vector-store" });
    await waitFor(() => runner.requests.length === 1);
    expect(await service.runChecks({ courseDir, moduleId: "02-vector-store" })).toEqual({
      error: "a check run is already in progress",
      busy: true,
    });

    finish?.(exited(0, "      Tests  1 passed (1)\n"));
    expect(await active).toMatchObject({ outcome: "pass" });

    runner.handler = async () => ({
      termination: "timeout",
      exitCode: null,
      stdout: "      Tests  1 passed (1)\n",
      stderr: "",
    });
    expect(await service.runChecks({ courseDir, moduleId: "02-vector-store" })).toMatchObject({
      outcome: "crash",
      detail: "the check run timed out (over 120s)",
    });
  });

  it("treats output-limit and spawn failure as loud crashes", async () => {
    const courseDir = await courseFixture();
    await scaffoldFixture(courseDir, "02-vector-store", { scripts: { check: "vitest run" } }, true);
    const npmCliPath = path.join(courseDir, "runtime", "npm-cli.js");
    await write(npmCliPath, "// packaged npm placeholder\n");
    const runner = new RecordingRunner(async () => ({
      termination: "output-limit",
      exitCode: null,
      stdout: "",
      stderr: "",
    }));
    const service = createEngineScriptService({ runner, npmCliPath });
    expect(await service.runChecks({ courseDir, moduleId: "02-vector-store" })).toMatchObject({
      outcome: "crash",
      detail: "the check run produced over 8 MiB of output",
    });

    runner.handler = async () => ({
      termination: "spawn-error",
      exitCode: null,
      stdout: "",
      stderr: "",
    });
    expect(await service.runChecks({ courseDir, moduleId: "02-vector-store" })).toMatchObject({
      outcome: "crash",
      detail: "the checks could not be started",
    });
  });
});

class RecordingRunner implements ProcessRunner {
  readonly requests: ProcessRunRequest[] = [];

  constructor(public handler: (request: ProcessRunRequest) => Promise<ProcessRunResult>) {}

  async run(request: ProcessRunRequest): Promise<ProcessRunResult> {
    this.requests.push(request);
    return await this.handler(request);
  }
}

function exited(exitCode: number, stdout = "", stderr = ""): ProcessRunResult {
  return { termination: "exit", exitCode, stdout, stderr };
}

async function courseFixture(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "praxeum-engine-scripts-"));
  temporaryDirectories.push(directory);
  await Promise.all([
    write(path.join(directory, "scripts", "doctor.mjs"), "// doctor placeholder\n"),
    write(path.join(directory, "scripts", "quiz.mjs"), "// quiz placeholder\n"),
    write(
      path.join(directory, "tutor", "journal.md"),
      "# Tutor journal\n\n## 2026-08-10 — Session\nReviewed vectors.\n",
    ),
  ]);
  return directory;
}

async function scaffoldFixture(
  courseDir: string,
  moduleId: string,
  packageJson: unknown,
  withDependencies: boolean,
): Promise<void> {
  const scaffold = path.join(courseDir, "curriculum", moduleId, "scaffold");
  await mkdir(scaffold, { recursive: true });
  await writeFile(path.join(scaffold, "package.json"), JSON.stringify(packageJson), "utf8");
  if (withDependencies) await mkdir(path.join(scaffold, "node_modules"));
}

async function write(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition was not reached");
}
