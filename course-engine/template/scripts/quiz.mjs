// Deterministic spaced-repetition bookkeeping. The tutor JUDGES an answer
// (correct / partial / wrong / taught-it); this script does the ARITHMETIC and
// the history write, so intervals can't drift by hand. They already did once: on
// 2026-06-16 a close-time reseed flattened every earned interval back to 1 and
// module 01's quiz silently never came due again. Judgment is the model's job;
// counting is not — hand-edited intervals are how that quiz went dark.
//
// The formula (earned from that failure, matched to the live bank's numbers):
//   correct → interval = max(2, round(interval × 2.5))
//   partial → interval = 2
//   wrong   → interval = 1
//   tutored → interval = 1   (asked, but effectively taught not recalled — re-test soon)
//   due     = today + interval days
// Intervals are stored as whole days, as the live bank does; round-half-up, so a
// fresh item's first correct earns 3 days (round(2.5)), not 2 — verified against
// the real quiz-bank's clean 2026-07-05 grades.
//
// Usage:  node scripts/quiz.mjs <command> [...args] [--today YYYY-MM-DD] [repoPath]
//   due        [--limit N]                     list what's due, most overdue first
//   grade      <id> <correct|partial|wrong>    judge → arithmetic + history append
//   tutored    <id>                            asked but taught; schedules like a miss
//   seed       <module> <id> "<question>"      add a new item (interval 1, due tomorrow)
//   reschedule <id> <YYYY-MM-DD>               move due; bookkeeping, lands in moves[]
//   migrate                                    move legacy rescheduled history → moves[]
//   --note "…"     attach a note to the entry (grade / tutored / reschedule)
//   repoPath / PRAXEUM_COURSE / cwd walk-up      which course to write (as doctor.mjs)
//
// GRADES vs BOOKKEEPING (the split earned when the synthetic "rescheduled" grade
// strained the format): history[] holds grades only — correct|partial|wrong|tutored,
// entries for items actually asked. A reschedule moves a due date without judging
// recall, so it lands in moves[] ({ date, action:"rescheduled", to, note? }), never
// in history[]. Legacy banks that predate moves[] carry rescheduled entries inside
// history[]; those are ignored as grades on read (the arithmetic never looks at
// history), and `quiz.mjs migrate` relocates them into moves[] byte-stably.
//
// WRITER OF RECORD for tutor/quiz-bank.json intervals, history & moves. Emits
// 2-space JSON with one-line history/moves entries and a trailing newline —
// byte-identical to the hand format, so the human git diff of a grade stays a few
// lines.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

const BANK_REL = "tutor/quiz-bank.json";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// ---- dates: whole calendar days, computed in UTC so DST never shifts one ----
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
export function validIso(s) {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}
export function daysBetween(fromIso, toIso) {
  const [ay, am, ad] = fromIso.split("-").map(Number);
  const [by, bm, bd] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

// ---- the interval rule. `prev` is the stored (whole-day) interval. ----
export function nextInterval(prev, result) {
  switch (result) {
    case "correct":
      return Math.max(2, Math.round((prev ?? 1) * 2.5));
    case "partial":
      return 2;
    case "wrong":
      return 1;
    case "tutored":
      return 1; // taught, not recalled: re-surface tomorrow like a miss
    default:
      return die(`internal: no interval rule for result "${result}"`);
  }
}

// ---- repo root: explicit trailing [repoPath] > PRAXEUM_COURSE > walk up from cwd.
//      Mirrors scripts/doctor.mjs. ----
function walkUp(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git")) || fs.existsSync(path.join(dir, "CLAUDE.md"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function resolveRepo(repoPath) {
  return path.resolve(
    repoPath ?? process.env.PRAXEUM_COURSE ?? walkUp(process.cwd()) ?? process.cwd(),
  );
}

// ---- argv: separate --flags (each takes a value) from positionals ----
function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[a.slice(2)] = next;
          i++;
        } else {
          flags[a.slice(2)] = true; // bare flag; commands that need a value reject it
        }
      }
    } else {
      pos.push(a);
    }
  }
  return { flags, pos };
}

// A command's fixed positionals, plus one optional trailing repoPath.
function take(rest, arity, usage) {
  if (rest.length < arity) die(`usage: node scripts/quiz.mjs ${usage}`);
  if (rest.length > arity + 1) die(`too many arguments.\nusage: node scripts/quiz.mjs ${usage}`);
  return { args: rest.slice(0, arity), repoPath: rest.length > arity ? rest[arity] : undefined };
}

function resolveToday(flags) {
  if (flags.today === undefined) return todayISO();
  if (!validIso(flags.today)) die(`--today must be a real YYYY-MM-DD date`);
  return flags.today;
}
function resolveNote(flags) {
  if (flags.note === undefined) return undefined;
  if (flags.note === true) die(`--note requires a value`);
  return String(flags.note);
}

// Count legacy { result: "rescheduled" } entries still living in history[] — the
// pre-moves[] bookkeeping shape. Migrate relocates them; every other command that
// touches a bank carrying them prints a one-line hint.
export function countLegacyRescheduled(bank) {
  let n = 0;
  for (const item of bank?.items ?? []) {
    for (const h of item?.history ?? []) {
      if (h?.result === "rescheduled") n++;
    }
  }
  return n;
}

// ---- quiz-bank I/O ----
// hintLegacy: on by default, so any command surfacing a legacy bank nudges toward
// `migrate`. migrate itself passes false — it's the fix, not a place to advertise it.
function loadBank(repoRoot, { hintLegacy = true } = {}) {
  const abs = path.join(repoRoot, BANK_REL);
  if (!fs.existsSync(abs)) die(`no ${BANK_REL} under ${repoRoot}`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (err) {
    die(`${BANK_REL} is not valid JSON: ${err?.message ?? err}`);
  }
  if (!data || !Array.isArray(data.items)) die(`${BANK_REL} has no "items" array`);
  if (hintLegacy) {
    const legacy = countLegacyRescheduled(data);
    if (legacy > 0) {
      // stderr: advisory, must not pollute stdout that other tools may parse.
      console.error(
        `note: ${BANK_REL} has ${legacy} legacy "rescheduled" ${
          legacy === 1 ? "entry" : "entries"
        } in history — run \`npm run quiz -- migrate\` to move them into moves[].`,
      );
    }
  }
  return { abs, data };
}
const findItem = (bank, id) => bank.items.find((it) => it && it.id === id);

// Relocate every legacy { result: "rescheduled" } history entry into moves[],
// in place, preserving order. Grades stay in history[]; the migrated entries keep
// their date and note but drop "to" — the destination due date is unrecoverable
// from a legacy entry. Returns the count moved (0 = nothing to do). Idempotent:
// a second pass finds no rescheduled history entries and moves nothing.
export function migrateBank(bank) {
  let moved = 0;
  for (const item of bank?.items ?? []) {
    if (!Array.isArray(item?.history)) continue;
    const legacy = item.history.filter((h) => h?.result === "rescheduled");
    if (legacy.length === 0) continue;
    item.history = item.history.filter((h) => h?.result !== "rescheduled");
    if (!Array.isArray(item.moves)) item.moves = [];
    for (const h of legacy) {
      const entry = { date: h.date, action: "rescheduled" };
      if (h.note !== undefined) entry.note = h.note; // "to" omitted: unknowable for legacy
      item.moves.push(entry);
      moved++;
    }
  }
  return moved;
}

// ---- serializer: JSON.stringify(_, null, 2) shape, but history AND moves entries
//      stay on one line each — the hand format, so a grade or a reschedule diffs to
//      a handful of lines.
const IND = "  ";
const INLINE_ENTRY_ARRAYS = new Set(["history", "moves"]);
function serializeInlineEntry(entry) {
  const parts = Object.entries(entry).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{ ${parts.join(", ")} }`;
}
function serializeItem(item, depth) {
  const pad = IND.repeat(depth);
  const inner = IND.repeat(depth + 1);
  const lines = [];
  for (const [k, v] of Object.entries(item)) {
    if (INLINE_ENTRY_ARRAYS.has(k)) {
      if (!Array.isArray(v) || v.length === 0) {
        lines.push(`${inner}${JSON.stringify(k)}: []`);
      } else {
        const entries = v
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
export function serializeBank(bank) {
  const lines = [];
  for (const [k, v] of Object.entries(bank)) {
    if (k === "items" && Array.isArray(v)) {
      const items = v.map((it) => serializeItem(it, 2)).join(",\n");
      lines.push(`${IND}"items": [\n${items}\n${IND}]`);
    } else {
      lines.push(`${IND}${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    }
  }
  return `{\n${lines.join(",\n")}\n}\n`;
}
function saveBank(abs, bank) {
  fs.writeFileSync(abs, serializeBank(bank), "utf8");
}

// ---- commands ----
function cmdDue(flags, rest) {
  const { repoPath } = take(rest, 0, "due [--limit N] [--today YYYY-MM-DD] [repoPath]");
  const { data: bank } = loadBank(resolveRepo(repoPath));
  const today = resolveToday(flags);

  let limit = Infinity;
  if (flags.limit !== undefined) {
    const n = Number(flags.limit);
    if (!Number.isInteger(n) || n < 0) die(`--limit must be a non-negative integer (0 = all)`);
    if (n > 0) limit = n;
  }

  const due = bank.items
    .filter((it) => validIso(it?.due))
    .map((it) => ({ it, over: daysBetween(it.due, today) }))
    .filter((x) => x.over >= 0) // today >= due
    .sort((a, b) =>
      a.it.due < b.it.due
        ? -1
        : a.it.due > b.it.due
          ? 1
          : a.it.id < b.it.id
            ? -1
            : a.it.id > b.it.id
              ? 1
              : 0,
    );

  const total = due.length;
  console.log(`${total} quiz item(s) due as of ${today}${total ? " — most overdue first." : "."}`);
  if (total === 0) return 0;

  const rows = due.slice(0, limit);
  if (rows.length < total) {
    console.log(
      `showing ${rows.length}; ${total - rows.length} more due (raise --limit, or --limit 0 for all).`,
    );
  }
  console.log("");

  const idW = Math.max(...rows.map((r) => r.it.id.length));
  const modW = Math.max(...rows.map((r) => String(r.it.module ?? "").length));
  const label = ({ over }) => (over === 0 ? "due today" : `${over}d overdue`);
  const whenW = Math.max(...rows.map((r) => label(r).length));
  for (const r of rows) {
    const q = String(r.it.question ?? "");
    const qt = q.length > 72 ? `${q.slice(0, 71)}…` : q;
    console.log(
      `  ${r.it.id.padEnd(idW)}  ${String(r.it.module ?? "").padEnd(modW)}  ${label(r).padEnd(whenW)}  interval ${String(
        r.it.interval,
      ).padStart(2)}  ${qt}`,
    );
  }
  return 0;
}

function cmdGrade(flags, rest) {
  const { args, repoPath } = take(
    rest,
    2,
    'grade <id> <correct|partial|wrong> [--note "…"] [--today YYYY-MM-DD] [repoPath]',
  );
  const [id, result] = args;
  if (!["correct", "partial", "wrong"].includes(result)) {
    die(`grade result must be correct | partial | wrong (got "${result}")`);
  }
  const repoRoot = resolveRepo(repoPath);
  const { abs, data: bank } = loadBank(repoRoot);
  const item = findItem(bank, id);
  if (!item) die(`no quiz item with id "${id}" in ${BANK_REL}`);

  const today = resolveToday(flags);
  const note = resolveNote(flags);
  const oldIv = item.interval;
  const oldDue = item.due;
  const iv = nextInterval(oldIv, result);
  item.interval = iv;
  item.due = addDays(today, iv);
  if (!Array.isArray(item.history)) item.history = [];
  item.history.push(note !== undefined ? { date: today, result, note } : { date: today, result });

  saveBank(abs, bank);
  console.log(`graded ${id}: ${result} — interval ${oldIv}d→${iv}d, due ${oldDue}→${item.due}`);
  return 0;
}

function cmdTutored(flags, rest) {
  const { args, repoPath } = take(
    rest,
    1,
    'tutored <id> [--note "…"] [--today YYYY-MM-DD] [repoPath]',
  );
  const [id] = args;
  const repoRoot = resolveRepo(repoPath);
  const { abs, data: bank } = loadBank(repoRoot);
  const item = findItem(bank, id);
  if (!item) die(`no quiz item with id "${id}" in ${BANK_REL}`);

  const today = resolveToday(flags);
  const note = resolveNote(flags);
  const oldIv = item.interval;
  const oldDue = item.due;
  item.interval = 1;
  item.due = addDays(today, 1);
  if (!Array.isArray(item.history)) item.history = [];
  item.history.push(
    note !== undefined
      ? { date: today, result: "tutored", note }
      : { date: today, result: "tutored" },
  );

  saveBank(abs, bank);
  console.log(
    `tutored ${id}: interval ${oldIv}d→1d, due ${oldDue}→${item.due} (asked but taught — re-tests tomorrow)`,
  );
  return 0;
}

function cmdSeed(flags, rest) {
  const { args, repoPath } = take(
    rest,
    3,
    'seed <module> <id> "<question>" [--today YYYY-MM-DD] [repoPath]',
  );
  const [module, id, question] = args;
  const repoRoot = resolveRepo(repoPath);
  const { abs, data: bank } = loadBank(repoRoot);
  if (findItem(bank, id)) die(`quiz item "${id}" already exists — ids must be unique`);

  const today = resolveToday(flags);
  const item = { id, module, question, interval: 1, due: addDays(today, 1), history: [] };
  bank.items.push(item);

  saveBank(abs, bank);
  console.log(`seeded ${id} (${module}) — interval 1d, due ${item.due}, history empty`);
  return 0;
}

function cmdReschedule(flags, rest) {
  const { args, repoPath } = take(
    rest,
    2,
    'reschedule <id> <YYYY-MM-DD> [--note "…"] [--today YYYY-MM-DD] [repoPath]',
  );
  const [id, newDue] = args;
  if (!validIso(newDue)) die(`reschedule date must be a real YYYY-MM-DD date (got "${newDue}")`);
  const repoRoot = resolveRepo(repoPath);
  const { abs, data: bank } = loadBank(repoRoot);
  const item = findItem(bank, id);
  if (!item) die(`no quiz item with id "${id}" in ${BANK_REL}`);

  const today = resolveToday(flags);
  const note = resolveNote(flags);
  const oldDue = item.due;
  item.due = newDue; // interval untouched — a reschedule moves the date, it does not grade
  if (!Array.isArray(item.moves)) item.moves = [];
  item.moves.push(
    note !== undefined
      ? { date: today, action: "rescheduled", to: newDue, note }
      : { date: today, action: "rescheduled", to: newDue },
  );

  saveBank(abs, bank);
  console.log(`rescheduled ${id}: due ${oldDue}→${newDue} (bookkeeping in moves[], not a grade)`);
  return 0;
}

function cmdMigrate(flags, rest) {
  const { repoPath } = take(rest, 0, "migrate [repoPath]");
  const repoRoot = resolveRepo(repoPath);
  // hintLegacy off: this command IS the fix, no point nagging about it.
  const { abs, data: bank } = loadBank(repoRoot, { hintLegacy: false });
  const moved = migrateBank(bank);
  if (moved === 0) {
    console.log('nothing to migrate — no legacy "rescheduled" entries in history');
    return 0; // exit 0 even when there's nothing to do
  }
  saveBank(abs, bank);
  console.log(
    `migrated ${moved} legacy "rescheduled" ${
      moved === 1 ? "entry" : "entries"
    } from history[] into moves[]`,
  );
  return 0;
}

// ---- dispatch ----
const USAGE = `usage: node scripts/quiz.mjs <command> [...args] [--today YYYY-MM-DD] [repoPath]
  due        [--limit N]                     list what's due, most overdue first
  grade      <id> <correct|partial|wrong>    judge → arithmetic + history append
  tutored    <id>                            asked but taught; schedules like a miss
  seed       <module> <id> "<question>"      add a new item (interval 1, due tomorrow)
  reschedule <id> <YYYY-MM-DD>               move due; bookkeeping, lands in moves[]
  migrate                                    legacy rescheduled history[] → moves[]`;

function main() {
  const { flags, pos } = parseArgs(process.argv.slice(2));
  const cmd = pos[0];
  const rest = pos.slice(1);

  let code = 0;
  switch (cmd) {
    case "due":
      code = cmdDue(flags, rest);
      break;
    case "grade":
      code = cmdGrade(flags, rest);
      break;
    case "tutored":
      code = cmdTutored(flags, rest);
      break;
    case "seed":
      code = cmdSeed(flags, rest);
      break;
    case "reschedule":
      code = cmdReschedule(flags, rest);
      break;
    case "migrate":
      code = cmdMigrate(flags, rest);
      break;
    default:
      die(cmd ? `unknown command "${cmd}".\n${USAGE}` : USAGE);
  }
  process.exit(code);
}

// Run only as a CLI; on import (tests) the pure units above are used directly.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
