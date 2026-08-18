// Spaced-repetition arithmetic — a faithful port of the engine's scripts/quiz.mjs.
// The tutor JUDGES an answer; this module does the ARITHMETIC and the append, so
// intervals can't drift by hand. (In the engine's history, a hand-edited reseed once
// flattened every earned interval and a module's quiz silently went dark — that failure
// is why the writer of record is code, not the model. Preserve that property.)
//
// The formula (matched to the engine and its live banks):
//   correct → interval = max(2, round(interval × 2.5))   // fresh item's first correct = 3d
//   partial → interval = 2
//   wrong   → interval = 1
//   tutored → interval = 1   // asked but effectively taught, not recalled — re-test soon
//   due     = today + interval (whole calendar days, UTC — DST can never shift a date)
//
// GRADES vs BOOKKEEPING: history[] holds grades only (correct|partial|wrong|tutored).
// A reschedule moves a due date without judging recall → it lands in moves[], never in
// history[]. Legacy banks carry { result: "rescheduled" } inside history[]; readers
// ignore those as grades, and migrateBank() relocates them.
//
// All functions are pure: they take a bank, return a new bank + a report. Callers own
// persistence (and must use serializeBank for byte-stable, few-line git diffs).

import type { QuizBank, QuizItem } from "./schemas";

export type { QuizBank, QuizItem } from "./schemas";

export type GradeResult = "correct" | "partial" | "wrong" | "tutored";

// ---- date helpers (UTC whole-day arithmetic) ----

export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const [ay, am, ad] = fromIso.split("-").map(Number) as [number, number, number];
  const [by, bm, bd] = toIso.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

// ---- the interval rule ----

export function nextInterval(prev: number | undefined, result: GradeResult): number {
  switch (result) {
    case "correct":
      return Math.max(2, Math.round((prev ?? 1) * 2.5));
    case "partial":
      return 2;
    case "wrong":
    case "tutored":
      return 1;
  }
}

// ---- pure bank operations ----

export interface DueItem {
  item: QuizItem;
  overdueDays: number; // 0 = due today
}

/** Items due as of `today`, most-overdue first (ties broken by id, as the engine sorts). */
export function listDue(bank: QuizBank, today: string): DueItem[] {
  return bank.items
    .map((item) => ({ item, overdueDays: daysBetween(item.due, today) }))
    .filter((x) => x.overdueDays >= 0)
    .sort((a, b) =>
      a.item.due < b.item.due
        ? -1
        : a.item.due > b.item.due
          ? 1
          : a.item.id < b.item.id
            ? -1
            : a.item.id > b.item.id
              ? 1
              : 0,
    );
}

function mustFind(bank: QuizBank, id: string): QuizItem {
  const item = bank.items.find((it) => it.id === id);
  if (!item) throw new Error(`no quiz item with id "${id}"`);
  return item;
}

export interface GradeReport {
  id: string;
  result: GradeResult;
  oldInterval: number;
  newInterval: number;
  oldDue: string;
  newDue: string;
}

/** Judge → arithmetic + history append. Covers "tutored" (engine's separate command). */
export function applyGrade(
  bank: QuizBank,
  id: string,
  result: GradeResult,
  today: string,
  note?: string,
): { bank: QuizBank; report: GradeReport } {
  const next = structuredClone(bank);
  const item = mustFind(next, id);
  const oldInterval = item.interval;
  const oldDue = item.due;
  item.interval = nextInterval(oldInterval, result);
  item.due = addDays(today, item.interval);
  item.history.push(note !== undefined ? { date: today, result, note } : { date: today, result });
  return {
    bank: next,
    report: { id, result, oldInterval, newInterval: item.interval, oldDue, newDue: item.due },
  };
}

/** New item: interval 1, due tomorrow, empty history. Seed-only at close — no pre-test. */
export function seedItem(
  bank: QuizBank,
  module: string,
  id: string,
  question: string,
  today: string,
): QuizBank {
  if (bank.items.some((it) => it.id === id)) {
    throw new Error(`quiz item "${id}" already exists — ids must be unique`);
  }
  const next = structuredClone(bank);
  next.items.push({ id, module, question, interval: 1, due: addDays(today, 1), history: [] });
  return next;
}

/** Move a due date WITHOUT grading: interval untouched, entry lands in moves[]. */
export function rescheduleItem(
  bank: QuizBank,
  id: string,
  newDue: string,
  today: string,
  note?: string,
): QuizBank {
  const next = structuredClone(bank);
  const item = mustFind(next, id);
  item.due = newDue;
  item.moves ??= [];
  item.moves.push(
    note !== undefined
      ? { date: today, action: "rescheduled", to: newDue, note }
      : { date: today, action: "rescheduled", to: newDue },
  );
  return next;
}

/** Relocate legacy { result: "rescheduled" } history entries into moves[] (idempotent).
 *  Migrated entries keep date/note, drop `to` — unknowable for legacy entries. */
export function migrateBank(bank: QuizBank): { bank: QuizBank; moved: number } {
  const next = structuredClone(bank);
  let moved = 0;
  for (const item of next.items) {
    const legacy = item.history.filter((h) => h.result === "rescheduled");
    if (legacy.length === 0) continue;
    item.history = item.history.filter((h) => h.result !== "rescheduled");
    item.moves ??= [];
    for (const h of legacy) {
      item.moves.push(
        h.note !== undefined
          ? { date: h.date, action: "rescheduled", note: h.note }
          : { date: h.date, action: "rescheduled" },
      );
      moved++;
    }
  }
  return { bank: next, moved };
}

export function countLegacyRescheduled(bank: QuizBank): number {
  let n = 0;
  for (const item of bank.items) {
    for (const h of item.history) if (h.result === "rescheduled") n++;
  }
  return n;
}

// ---- serializer: byte-identical to the engine's hand format ----
// 2-space JSON, history/moves entries on ONE line each, trailing newline — so a single
// grade's git diff stays a few lines. Do not "simplify" to JSON.stringify(_, null, 2).

const IND = "  ";
const INLINE_ENTRY_ARRAYS = new Set(["history", "moves"]);

function serializeInlineEntry(entry: Record<string, unknown>): string {
  const parts = Object.entries(entry).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{ ${parts.join(", ")} }`;
}

function serializeItem(item: Record<string, unknown>, depth: number): string {
  const pad = IND.repeat(depth);
  const inner = IND.repeat(depth + 1);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(item)) {
    if (INLINE_ENTRY_ARRAYS.has(k)) {
      const arr = v as Record<string, unknown>[] | undefined;
      if (!Array.isArray(arr) || arr.length === 0) {
        lines.push(`${inner}${JSON.stringify(k)}: []`);
      } else {
        const entries = arr
          .map((e) => `${IND.repeat(depth + 2)}${serializeInlineEntry(e)}`)
          .join(",\n");
        lines.push(`${inner}${JSON.stringify(k)}: [\n${entries}\n${inner}]`);
      }
    } else {
      lines.push(`${inner}${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    }
  }
  return `${pad}{\n${lines.join(",\n")}\n${pad}}`;
}

export function serializeBank(bank: QuizBank): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(bank)) {
    if (k === "items" && Array.isArray(v)) {
      const items = v
        .map((it) => serializeItem(it as unknown as Record<string, unknown>, 2))
        .join(",\n");
      lines.push(`${IND}"items": [\n${items}\n${IND}]`);
    } else {
      lines.push(`${IND}${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    }
  }
  return `{\n${lines.join(",\n")}\n}\n`;
}
