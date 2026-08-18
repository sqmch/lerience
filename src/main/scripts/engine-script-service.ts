/*
 * The app's deliberately narrow engine-script lens. Its public surface exposes
 * two product operations — inspect session-open context and run one module's
 * checks — rather than a generic process runner that could leak over IPC.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PRODUCT_NAME } from "../../shared/product";
import {
  guardModuleDirectory,
  hasRunnableCheck,
  journalTail,
  parseCheckRun,
  parseDoctorResults,
  type CheckSummary,
  type DoctorResult,
} from "./parsers";
import {
  CHECK_MAX_OUTPUT_BYTES,
  CHECK_TIMEOUT_MS,
  CONTEXT_SCRIPT_MAX_OUTPUT_BYTES,
  CONTEXT_SCRIPT_TIMEOUT_MS,
  type ProcessRunResult,
  type ProcessRunner,
} from "./process-runner";

export type InspectedFact<T> = { available: true; value: T } | { available: false; reason: string };

export interface CourseContextInspection {
  doctor: InspectedFact<DoctorResult[]>;
  /** Opaque `quiz.mjs due` stdout. The app never recomputes or parses it. */
  due: InspectedFact<string>;
  journalTail: InspectedFact<string>;
  /** A lens/controller fact supplied by the caller, never inferred here. */
  currentModuleId: string | null;
}

export interface InspectContextInput {
  courseDir: string;
  currentModuleId: string | null;
}

export interface RunChecksInput {
  courseDir: string;
  moduleId: string;
}

export interface CheckRunRefusal {
  error: string;
  /** Only a single-flight refusal is busy; invalid input is not. */
  busy?: true;
}

export type RunChecksResult = CheckSummary | CheckRunRefusal;

export interface EngineScriptService {
  inspectContext(input: InspectContextInput): Promise<CourseContextInspection>;
  runChecks(input: RunChecksInput): Promise<RunChecksResult>;
}

export interface EngineScriptServiceOptions {
  runner: ProcessRunner;
  /**
   * JavaScript entry point for the packaged npm runtime. M3 wires this once the
   * runtime dependency lands. Deliberately no `npm`/PATH fallback exists.
   */
  npmCliPath?: string | null;
}

const ZERO = { total: 0, passed: 0, failed: 0 } as const;

export function createEngineScriptService(
  options: EngineScriptServiceOptions,
): EngineScriptService {
  let checkInFlight = false;

  return {
    async inspectContext(input) {
      const courseDir = path.resolve(input.courseDir);
      const [doctor, due, journal] = await Promise.all([
        inspectDoctor(options.runner, courseDir),
        inspectDue(options.runner, courseDir),
        inspectJournal(courseDir),
      ]);
      return {
        doctor,
        due,
        journalTail: journal,
        currentModuleId: input.currentModuleId,
      };
    },

    async runChecks(input) {
      const courseDir = path.resolve(input.courseDir);
      const guarded = guardModuleDirectory(courseDir, input.moduleId);
      if (!guarded.ok) return { error: "bad module id" };

      const scaffold = await inspectScaffold(guarded.scaffoldDir);
      if (scaffold !== null) return scaffold;

      const npmCliPath = options.npmCliPath;
      if (npmCliPath === null || npmCliPath === undefined || !(await isFile(npmCliPath))) {
        return {
          outcome: "crash",
          ...ZERO,
          detail: "the packaged check runtime is unavailable",
        };
      }

      if (checkInFlight) return { error: "a check run is already in progress", busy: true };
      checkInFlight = true;
      try {
        const run = await options.runner.run({
          entryPoint: path.resolve(npmCliPath),
          args: ["run", "check"],
          cwd: guarded.scaffoldDir,
          timeoutMs: CHECK_TIMEOUT_MS,
          maxOutputBytes: CHECK_MAX_OUTPUT_BYTES,
          serviceName: `${PRODUCT_NAME} checks: ${input.moduleId}`,
        });
        return summarizeCheckProcess(run);
      } finally {
        checkInFlight = false;
      }
    },
  };
}

async function inspectDoctor(
  runner: ProcessRunner,
  courseDir: string,
): Promise<InspectedFact<DoctorResult[]>> {
  const entryPoint = path.join(courseDir, "scripts", "doctor.mjs");
  if (!(await isFile(entryPoint))) return unavailable("course doctor script is unavailable");

  const run = await runner.run({
    entryPoint,
    args: [courseDir, "--json"],
    cwd: courseDir,
    timeoutMs: CONTEXT_SCRIPT_TIMEOUT_MS,
    maxOutputBytes: CONTEXT_SCRIPT_MAX_OUTPUT_BYTES,
    serviceName: `${PRODUCT_NAME} course doctor`,
  });
  if (run.termination !== "exit" || (run.exitCode !== 0 && run.exitCode !== 1)) {
    return unavailable(processFailure("course doctor", run));
  }

  const results = parseDoctorResults(run.stdout);
  return results === null
    ? unavailable("course doctor produced an invalid result")
    : { available: true, value: results };
}

async function inspectDue(
  runner: ProcessRunner,
  courseDir: string,
): Promise<InspectedFact<string>> {
  const entryPoint = path.join(courseDir, "scripts", "quiz.mjs");
  if (!(await isFile(entryPoint))) return unavailable("course quiz script is unavailable");

  const run = await runner.run({
    entryPoint,
    args: ["due", "--limit", "0", courseDir],
    cwd: courseDir,
    timeoutMs: CONTEXT_SCRIPT_TIMEOUT_MS,
    maxOutputBytes: CONTEXT_SCRIPT_MAX_OUTPUT_BYTES,
    serviceName: `${PRODUCT_NAME} due quiz inspection`,
  });
  if (run.termination !== "exit" || run.exitCode !== 0) {
    return unavailable(processFailure("course quiz", run));
  }
  return { available: true, value: run.stdout };
}

async function inspectJournal(courseDir: string): Promise<InspectedFact<string>> {
  try {
    const markdown = await readFile(path.join(courseDir, "tutor", "journal.md"), "utf8");
    return { available: true, value: journalTail(markdown) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // A new course has no dated entries yet; doctor separately reports a
      // missing required file if the engine considers that unhealthy.
      return { available: true, value: "" };
    }
    return unavailable("course journal is unavailable");
  }
}

async function inspectScaffold(scaffoldDir: string): Promise<CheckSummary | null> {
  if (!(await isDirectory(scaffoldDir))) {
    return {
      outcome: "no-checks",
      ...ZERO,
      detail: "this module has no scaffold to run checks in",
    };
  }

  let packageJson: unknown;
  try {
    const source = await readFile(path.join(scaffoldDir, "package.json"), "utf8");
    packageJson = JSON.parse(stripBom(source)) as unknown;
  } catch {
    packageJson = null;
  }
  if (!hasRunnableCheck(packageJson)) {
    return {
      outcome: "no-checks",
      ...ZERO,
      detail: "this module's scaffold has no check script",
    };
  }

  if (!(await isDirectory(path.join(scaffoldDir, "node_modules")))) {
    return {
      outcome: "crash",
      ...ZERO,
      detail: "scaffold dependencies aren't installed — run `npm install` in the scaffold first",
    };
  }
  return null;
}

function summarizeCheckProcess(run: ProcessRunResult): CheckSummary {
  if (run.termination === "timeout") return parseCheckRun("", true);
  if (run.termination === "output-limit") {
    return {
      outcome: "crash",
      ...ZERO,
      detail: "the check run produced over 8 MiB of output",
    };
  }
  if (run.termination === "spawn-error") {
    return { outcome: "crash", ...ZERO, detail: "the checks could not be started" };
  }
  return parseCheckRun(`${run.stdout}\n${run.stderr}`);
}

function processFailure(label: string, run: ProcessRunResult): string {
  if (run.termination === "timeout") return `${label} timed out`;
  if (run.termination === "output-limit") return `${label} produced too much output`;
  if (run.termination === "spawn-error") return `${label} could not be started`;
  return `${label} exited without a valid result`;
}

function unavailable(reason: string): InspectedFact<never> {
  return { available: false, reason };
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(directoryPath: string): Promise<boolean> {
  try {
    return (await stat(directoryPath)).isDirectory();
  } catch {
    return false;
  }
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
