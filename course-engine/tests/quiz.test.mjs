// Unit tests for the pure spaced-repetition units in scripts/quiz.mjs:
// the interval rule, the UTC calendar-day math, and the byte-stable serializer.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  nextInterval,
  addDays,
  daysBetween,
  validIso,
  serializeBank,
  migrateBank,
  countLegacyRescheduled,
} from "../template/scripts/quiz.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("nextInterval: the rule, derived from the real bank's numbers", () => {
  // correct → max(2, round(prev × 2.5)); round-half-up, so a fresh item earns 3
  assert.equal(nextInterval(1, "correct"), 3); // round(2.5) = 3, not 2
  assert.equal(nextInterval(3, "correct"), 8); // round(7.5) = 8
  assert.equal(nextInterval(2, "correct"), 5); // round(5.0) = 5
  assert.equal(nextInterval(undefined, "correct"), 3); // prev ?? 1 → round(2.5) = 3
  // partial → 2; wrong / tutored → 1 (tutored = asked but taught, re-test tomorrow)
  assert.equal(nextInterval(6, "partial"), 2);
  assert.equal(nextInterval(8, "wrong"), 1);
  assert.equal(nextInterval(8, "tutored"), 1);
  // the max(2, ·) floor binds only when round(prev × 2.5) would be < 2
  assert.equal(nextInterval(0, "correct"), 2);
});

test("addDays: plain step and month / year rollover, in both directions", () => {
  assert.equal(addDays("2026-07-08", 3), "2026-07-11");
  assert.equal(addDays("2026-01-31", 1), "2026-02-01"); // month rollover
  assert.equal(addDays("2026-12-31", 1), "2027-01-01"); // year rollover
  assert.equal(addDays("2026-03-01", -1), "2026-02-28"); // 2026 is not a leap year
  assert.equal(addDays("2024-03-01", -1), "2024-02-29"); // 2024 is
});

test("daysBetween: spans, including month / year boundaries and negatives", () => {
  assert.equal(daysBetween("2026-06-16", "2026-07-08"), 22);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(daysBetween("2026-07-08", "2026-07-08"), 0);
  assert.equal(daysBetween("2026-07-08", "2026-07-01"), -7); // today < due → not yet due
});

test("validIso: format shape AND real-calendar validity", () => {
  assert.equal(validIso("2026-07-08"), true);
  assert.equal(validIso("2026-13-01"), false); // month 13
  assert.equal(validIso("2026-02-30"), false); // Feb 30 rolls over → not a real date
  assert.equal(validIso("2026-2-8"), false); // not zero-padded
  assert.equal(validIso("2026/07/08"), false); // wrong separators
  assert.equal(validIso("not-a-date"), false);
  assert.equal(validIso(20260708), false); // not a string
  assert.equal(validIso(undefined), false);
});

test("serializeBank: round-trips a real-shaped fixture byte-for-byte", () => {
  const raw = fs.readFileSync(path.join(here, "fixtures", "quiz-bank.sample.json"), "utf8");
  // A Windows checkout may store the fixture with CRLF; the serializer emits LF.
  const lf = raw.replace(/\r\n/g, "\n");
  const out = serializeBank(JSON.parse(lf));
  // Key order, one-line history entries, empty-history `[]`, and the trailing
  // newline must all survive — that is what keeps one grade's git diff small.
  assert.equal(out, lf);
});

test("serializeBank: moves entries are one-line too (grades-vs-bookkeeping split)", () => {
  const raw = fs.readFileSync(path.join(here, "fixtures", "quiz-bank.moves.json"), "utf8");
  const lf = raw.replace(/\r\n/g, "\n");
  const out = serializeBank(JSON.parse(lf));
  // moves[] round-trips exactly like history[]: one entry per line, empty `[]`
  // inline, trailing newline — a reschedule's git diff stays a handful of lines.
  assert.equal(out, lf);
});

test("countLegacyRescheduled: only rescheduled *history* entries count", () => {
  const legacy = JSON.parse(
    fs
      .readFileSync(path.join(here, "fixtures", "quiz-bank.legacy.json"), "utf8")
      .replace(/\r\n/g, "\n"),
  );
  assert.equal(countLegacyRescheduled(legacy), 3); // 00-statelessness, 00-output-pricing, 01-cosine-formula
  // a modern move[] rescheduled entry is NOT legacy history and must not be counted
  const modern = {
    items: [{ moves: [{ date: "2026-07-01", action: "rescheduled" }], history: [] }],
  };
  assert.equal(countLegacyRescheduled(modern), 0);
  assert.equal(countLegacyRescheduled({ items: [] }), 0);
});

test("migrateBank: legacy rescheduled history → moves, idempotent (twice = once)", () => {
  const legacyRaw = fs
    .readFileSync(path.join(here, "fixtures", "quiz-bank.legacy.json"), "utf8")
    .replace(/\r\n/g, "\n");
  const bank = JSON.parse(legacyRaw);

  const moved = migrateBank(bank);
  assert.equal(moved, 3); // the three legacy rescheduled history entries

  // history[] is grades-only now; nothing rescheduled remains anywhere in it
  for (const it of bank.items) {
    for (const h of it.history) assert.notEqual(h.result, "rescheduled");
  }
  // the migrated entries live in moves[], carry date+note, and DROP "to"
  const migrated = bank.items.flatMap((it) => it.moves ?? []).filter((m) => !("to" in m));
  assert.equal(migrated.length, 3);
  for (const m of migrated) {
    assert.equal(m.action, "rescheduled");
    assert.ok(validIso(m.date));
    assert.equal("to" in m, false); // unknowable for legacy → omitted
  }
  // 01-cosine-formula already had a modern move[] entry (with "to"); migrate must
  // preserve it and append the legacy entry AFTER it — order preserved, "to" kept
  const cosine = bank.items.find((it) => it.id === "01-cosine-formula");
  assert.equal(cosine.moves.length, 2);
  assert.equal(cosine.moves[0].to, "2026-07-05"); // the pre-existing modern move, untouched
  assert.equal("to" in cosine.moves[1], false); // the migrated legacy entry, appended after

  // idempotent + byte-stable: a second pass moves nothing, serialization is identical
  const bytes1 = serializeBank(bank);
  const moved2 = migrateBank(bank);
  assert.equal(moved2, 0);
  assert.equal(serializeBank(bank), bytes1);
});
