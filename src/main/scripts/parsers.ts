/* Pure parser and guard logic for the M3 engine-script lens. The engine's
   scripts remain authoritative; these functions validate their contracts and
   shape ephemeral UI facts without reimplementing their decisions. */

import path from "node:path";

export type DoctorLevel = "ok" | "warn" | "fail";

export interface DoctorResult {
  id: string;
  level: DoctorLevel;
  message: string;
}

export type CheckOutcome = "pass" | "fail" | "crash" | "no-checks";

export interface CheckSummary {
  outcome: CheckOutcome;
  total: number;
  passed: number;
  failed: number;
  /** Present on `fail`: the `describe > test` path of each failing test. */
  failedNames?: string[];
  /** A plain one-liner for `crash`/`no-checks`. */
  detail?: string;
}

export interface GuardedModuleDirectory {
  moduleDir: string;
  scaffoldDir: string;
  ok: boolean;
}

const MODULE_ID = /^[0-9]{2}-[a-z0-9-]+$/;
const JOURNAL_HEADING = /^## \d{4}-\d{2}-\d{2}(?:\/\d{1,2})?(?:[ \t]*(?:—|-|–)?[ \t]*.*)?$/m;

// Matching ESC is unavoidable when stripping terminal colour.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/** Validate and normalize the stable `doctor.mjs --json` result contract. */
export function parseDoctorResults(stdout: string): DoctorResult[] | null {
  let value: unknown;
  try {
    value = JSON.parse(stripBom(stdout)) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;

  const results: DoctorResult[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { id, level, message } = item;
    if (typeof id !== "string" || !isDoctorLevel(level) || typeof message !== "string") {
      return null;
    }
    results.push({ id, level, message });
  }
  return results;
}

/** The engine module schema plus resolve-first containment. A check process may
 *  run only in curriculum/<one valid module id>/scaffold. */
export function guardModuleDirectory(courseDir: string, moduleId: string): GuardedModuleDirectory {
  const curriculumDir = path.resolve(courseDir, "curriculum");
  const moduleDir = path.resolve(curriculumDir, moduleId);
  const directChild = path.dirname(moduleDir) === curriculumDir && moduleDir !== curriculumDir;
  const ok = MODULE_ID.test(moduleId) && directChild;
  return { moduleDir, scaffoldDir: path.join(moduleDir, "scaffold"), ok };
}

/** Exactly the engine study's runnable-check test: only a string
 *  package.json `scripts.check` counts. */
export function hasRunnableCheck(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.scripts)) return false;
  return typeof value.scripts.check === "string";
}

/**
 * Preserve the last dated journal entries in source order, without the file
 * preamble. The result is additionally bounded by UTF-8 bytes so it is safe to
 * add to an opener even when one hand-written entry is unusually large.
 */
export function journalTail(markdown: string, maxEntries = 3, maxBytes = 16 * 1024): string {
  if (maxEntries <= 0 || maxBytes <= 0) return "";

  const starts: number[] = [];
  const heading = new RegExp(JOURNAL_HEADING.source, "gm");
  for (let match = heading.exec(markdown); match !== null; match = heading.exec(markdown)) {
    starts.push(match.index);
  }
  if (starts.length === 0) return "";

  const first = starts[Math.max(0, starts.length - maxEntries)] ?? 0;
  const selected = markdown.slice(first).trim();
  return truncateUtf8Tail(selected, maxBytes);
}

/** Port of the engine study's proven Vitest summary parser. */
export function parseCheckRun(output: string, timedOut = false): CheckSummary {
  const zero = { total: 0, passed: 0, failed: 0 };
  if (timedOut) {
    return { outcome: "crash", ...zero, detail: "the check run timed out (over 120s)" };
  }

  const plain = output.replace(ANSI, "");
  if (/No test files? found/i.test(plain)) {
    return {
      outcome: "no-checks",
      ...zero,
      detail: "no test files found in this module",
    };
  }

  // Match the per-test line, never the adjacent `Test Files` summary.
  const summary = plain.match(/^\s*Tests\s+(.+)$/m);
  if (summary?.[1] === undefined) {
    return {
      outcome: "crash",
      ...zero,
      detail: "the checks produced no test summary — they crashed before running",
    };
  }

  const tail = summary[1];
  const failed = Number(tail.match(/(\d+)\s+failed/)?.[1] ?? 0);
  const passed = Number(tail.match(/(\d+)\s+passed/)?.[1] ?? 0);
  const total = Number(tail.match(/\((\d+)\)\s*$/)?.[1] ?? failed + passed);

  if (total === 0) return { outcome: "no-checks", ...zero, detail: "no tests ran" };
  if (failed === 0) return { outcome: "pass", total, passed, failed };
  return {
    outcome: "fail",
    total,
    passed,
    failed,
    failedNames: extractFailedNames(plain),
  };
}

function extractFailedNames(output: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*FAIL\s+(.+?)\s*$/);
    if (match?.[1] === undefined) continue;
    const separator = match[1].indexOf(" > ");
    const name = separator === -1 ? match[1] : match[1].slice(separator + 3);
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function truncateUtf8Tail(value: string, maxBytes: number): string {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.byteLength <= maxBytes) return value;

  const marker = "[earlier journal content omitted]\n";
  const markerBytes = Buffer.byteLength(marker, "utf8");
  if (markerBytes >= maxBytes) return Buffer.from(marker).subarray(0, maxBytes).toString("utf8");

  const budget = maxBytes - markerBytes;
  let start = encoded.byteLength - budget;
  // A byte cap may land inside a multi-byte code point. Skip continuation
  // bytes so decoding starts on the next complete UTF-8 character.
  while (start < encoded.byteLength && (encoded[start]! & 0xc0) === 0x80) start += 1;
  return marker + encoded.subarray(start).toString("utf8");
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDoctorLevel(value: unknown): value is DoctorLevel {
  return value === "ok" || value === "warn" || value === "fail";
}
