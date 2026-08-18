// Session-close doctor: verify the protocol's atomic close actually happened.
// The close step — update progress + quiz-bank + journal, then commit — is prose,
// and on 2026-07-05 in instance #1 it half-ran: quiz-bank graded, journal never
// written, progress untouched, nothing committed, and no one noticed for days.
// This is the mechanical check that prose couldn't be. It is READ-ONLY: it
// inspects state and shells out to git only to read it, never to write.
//
// Usage:  node scripts/doctor.mjs [repoPath] [--json]
//   repoPath   an instance to inspect; default walks up from cwd for .git/CLAUDE.md
//   PRAXEUM_COURSE   env var honored too
//   --json     print a stable [{ id, level, message }] array (feeds the app)
//
// Exit 0 when clean (warnings allowed), 1 when any check fails.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const STALE_HOURS = 12;

// ---- repo root: explicit arg > PRAXEUM_COURSE > walk up for .git/CLAUDE.md ----
// An explicit target is taken as given; only the default case discovers the
// root by walking up from cwd.
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

const isoDate = (s) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const trim = (arr, n = 4) =>
  arr.length <= n ? arr.join(", ") : `${arr.slice(0, n).join(", ")}, +${arr.length - n} more`;

function readJson(repoRoot, rel) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return { missing: true };
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(abs, "utf8")) };
  } catch (err) {
    return { error: String(err?.message ?? err) };
  }
}

// git status --porcelain, one relative path per changed file. Rename lines
// ("orig -> new") report the current path; quoted paths (special chars) unwrap.
export function parsePorcelain(out) {
  const paths = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let rest = line.slice(3); // strip the 2-char XY status + its trailing space
    const arrow = rest.indexOf(" -> ");
    if (arrow !== -1) rest = rest.slice(arrow + 4);
    if (rest.startsWith('"') && rest.endsWith('"')) rest = rest.slice(1, -1);
    paths.push(rest);
  }
  return paths;
}
export const isCourseState = (rel) => {
  const p = rel.replace(/\\/g, "/");
  return p.startsWith("tutor/") || p.startsWith("curriculum/") || p === "COURSE.md";
};

// The spine check: a course (a curriculum/ with modules in it) must carry its
// COURSE.md spine. Onboarding writes COURSE.md at step 3, before module 00 exists
// (step 4), so a curriculum/ with no COURSE.md means onboarding step 3 never
// finished or the file was lost. Both absent is the not-yet-onboarded engine repo
// (or a fresh clone): fine. Pure over two booleans so it tests without a filesystem.
export function checkSpine({ hasCurriculum, hasCourse }) {
  if (hasCourse) return { level: "ok", message: "COURSE.md present" };
  if (hasCurriculum)
    return {
      level: "fail",
      message:
        "curriculum/ exists but COURSE.md is missing — a course without its spine (onboarding step 3 never completed or the file was lost)",
    };
  return { level: "ok", message: "no COURSE.md and no curriculum/ — not onboarded yet" };
}

// Every generated module directory must be represented in progress.json. A
// filesystem-only module is durable evidence that generation was not reconciled
// into course state, even when the generating session committed its files. Pure
// over two arrays so the invariant can be tested without a fixture filesystem.
export function findMissingProgressModules(curriculumModules, progressModules) {
  const tracked = new Set(progressModules);
  return [...new Set(curriculumModules)].filter((id) => !tracked.has(id)).sort();
}

// Completing a module seeds its retrieval questions into quiz-bank.json. A
// completed module with no bank items is therefore a half-finished close. This
// is the same set-difference shape as module coverage and stays failed until the
// missing close step is genuinely reconciled.
export function findCompletedModulesWithoutQuiz(completedModules, quizModules) {
  const seeded = new Set(quizModules);
  return [...new Set(completedModules)].filter((id) => !seeded.has(id)).sort();
}

// Newest "## YYYY-MM-DD …" heading date in a journal, or null. Tolerant: a
// range heading like "## 2026-06-15/16 — …" contributes its first date.
export function newestJournalDate(text) {
  const re = /^##\s+(\d{4}-\d{2}-\d{2})/gm;
  let newest = null;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!newest || m[1] > newest) newest = m[1];
  }
  return newest;
}

// Newest dated quiz activity that a session must have journaled — over BOTH
// history[] grades and moves[] reschedules. A reschedule performed in a session
// is session activity too (the 06-13 maintenance reschedules WERE journaled —
// that's the precedent), so a move newer than the last journal entry is just as
// much an unclosed session as an ungraded one. Returns { date, kind } where kind
// is "graded" | "rescheduled" | null; ties go to "graded" (the stronger signal).
export function newestQuizActivity(bank) {
  let grade = null;
  let move = null;
  for (const item of bank?.items ?? []) {
    for (const h of item?.history ?? []) {
      const d = isoDate(h?.date);
      if (d && (!grade || d > grade)) grade = d;
    }
    for (const mv of item?.moves ?? []) {
      const d = isoDate(mv?.date);
      if (d && (!move || d > move)) move = d;
    }
  }
  const date = [grade, move].filter(Boolean).sort().at(-1) ?? null;
  const kind = date === null ? null : date === grade ? "graded" : "rescheduled";
  return { date, kind };
}

function main() {
  // ---- argv: flags vs the one optional positional path (order-independent) ----
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes("--json");
  const repoArg = argv.find((a) => !a.startsWith("--"));

  const chosen = repoArg ?? process.env.PRAXEUM_COURSE ?? walkUp(process.cwd()) ?? process.cwd();
  const repoRoot = path.resolve(chosen);

  // ---- results: one entry per check, worst level wins the exit code ----
  const results = [];
  const add = (id, level, message) => results.push({ id, level, message });

  // 0) SPINE — a curriculum/ without its COURSE.md is a course missing its spine.
  //    Runs regardless of tutor/: the spine can be lost independently of state.
  const spine = checkSpine({
    hasCurriculum: fs.existsSync(path.join(repoRoot, "curriculum")),
    hasCourse: fs.existsSync(path.join(repoRoot, "COURSE.md")),
  });
  add("spine", spine.level, spine.message);

  if (!fs.existsSync(path.join(repoRoot, "tutor"))) {
    // Not an instance (or not onboarded yet) — nothing to check, and that's fine.
    add("course-state", "ok", `no tutor/ directory under ${repoRoot} — no course state to check`);
  } else {
    // 1) PARSE — the state files the tutor read/writes must be readable.
    const progress = readJson(repoRoot, "tutor/progress.json");
    const quizBank = readJson(repoRoot, "tutor/quiz-bank.json");
    const journalPath = path.join(repoRoot, "tutor", "journal.md");
    const journalExists = fs.existsSync(journalPath);

    const parseProblems = [];
    if (progress.missing) parseProblems.push("tutor/progress.json is missing");
    else if (!progress.ok)
      parseProblems.push(`tutor/progress.json is not valid JSON (${progress.error})`);
    if (quizBank.missing) parseProblems.push("tutor/quiz-bank.json is missing");
    else if (!quizBank.ok)
      parseProblems.push(`tutor/quiz-bank.json is not valid JSON (${quizBank.error})`);
    if (!journalExists) parseProblems.push("tutor/journal.md is missing");

    if (parseProblems.length === 0) {
      add("parse", "ok", "progress.json and quiz-bank.json parse; journal.md present");
    } else {
      add("parse", "fail", parseProblems.join("; "));
    }

    // 2) MODULE COVERAGE — a generated curriculum directory cannot exist only
    //    on disk; progress.json.modules must carry the matching state key.
    let curriculumModules = null;
    try {
      const curriculumPath = path.join(repoRoot, "curriculum");
      curriculumModules = fs.existsSync(curriculumPath)
        ? fs
            .readdirSync(curriculumPath, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
        : [];
    } catch (err) {
      add(
        "module-coverage",
        "warn",
        `could not read curriculum/ (${String(err?.message ?? err)}) — skipping module coverage`,
      );
    }
    if (curriculumModules !== null) {
      if (!progress.ok) {
        add("module-coverage", "warn", "skipped — progress.json did not parse");
      } else {
        const progressModules = Object.keys(progress.value?.modules ?? {});
        const missing = findMissingProgressModules(curriculumModules, progressModules);
        if (missing.length > 0) {
          add(
            "module-coverage",
            "fail",
            `curriculum module directories missing from progress.json.modules: ${trim(missing.map((id) => `"${id}"`))}`,
          );
        } else {
          add(
            "module-coverage",
            "ok",
            `${curriculumModules.length} curriculum module(s) represented in progress.json.modules`,
          );
        }
      }
    }

    // 3) COMPLETED QUIZ COVERAGE — completion includes seeding retrieval items.
    if (!progress.ok || !quizBank.ok) {
      const unreadable = [!progress.ok && "progress.json", !quizBank.ok && "quiz-bank.json"]
        .filter(Boolean)
        .join(" and ");
      add("completed-quiz", "warn", `skipped — ${unreadable} did not parse`);
    } else {
      const completedModules = Object.entries(progress.value?.modules ?? {})
        .filter(([, state]) => state?.status === "completed" || state?.status === "complete")
        .map(([id]) => id);
      const quizModules = (quizBank.value?.items ?? [])
        .map((item) => item?.module)
        .filter((id) => typeof id === "string");
      const missing = findCompletedModulesWithoutQuiz(completedModules, quizModules);
      if (missing.length > 0) {
        add(
          "completed-quiz",
          "fail",
          `completed modules with zero quiz-bank items: ${trim(missing.map((id) => `"${id}"`))}`,
        );
      } else {
        add(
          "completed-quiz",
          "ok",
          `${completedModules.length} completed module(s) have quiz-bank items`,
        );
      }
    }

    // 4) UNCOMMITTED STATE — dirty course files warn; dirty AND stale (>12h) fail,
    //    because that is a session whose state was never committed.
    let gitOut = null;
    try {
      // stderr ignored: git's own "fatal: not a git repository" is noise here —
      // the check reports that state itself, in its own voice.
      gitOut = execFileSync("git", ["-C", repoRoot, "status", "--porcelain"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      add(
        "uncommitted",
        "warn",
        "could not run git status (not a git repo, or git unavailable) — skipping the uncommitted-state check",
      );
    }
    if (gitOut !== null) {
      const dirty = parsePorcelain(gitOut).filter(isCourseState);
      if (dirty.length === 0) {
        add(
          "uncommitted",
          "ok",
          "no uncommitted course state (tutor/, curriculum/, COURSE.md clean)",
        );
      } else {
        const stale = [];
        for (const rel of dirty) {
          let mt;
          try {
            mt = fs.statSync(path.join(repoRoot, rel)).mtimeMs;
          } catch {
            continue; // deleted file: dirty, but there's no mtime to age
          }
          const ageH = (Date.now() - mt) / 3_600_000;
          if (ageH > STALE_HOURS) stale.push(`${rel} (${ageH.toFixed(0)}h)`);
        }
        if (stale.length > 0) {
          add(
            "uncommitted",
            "fail",
            `uncommitted course state older than ${STALE_HOURS}h — a session's state was never committed: ${trim(stale)}`,
          );
        } else {
          add(
            "uncommitted",
            "warn",
            `uncommitted course state (commit at session close): ${trim(dirty)}`,
          );
        }
      }
    }

    // 5) UNJOURNALED COMMITS — compare history by ancestry, never by calendar
    //    dates. Any curriculum/ or tutor/ commit reachable after the newest
    //    journal commit is session work not covered by an atomic close. Recent
    //    commits may be a live mid-session checkpoint; stale ones fail.
    if (gitOut === null) {
      add(
        "unjournaled-commits",
        "warn",
        "could not inspect git history (not a git repo, or git unavailable) — skipping the committed-session check",
      );
    } else {
      try {
        const gitOptions = {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        };
        const journalCommit = execFileSync(
          "git",
          ["-C", repoRoot, "rev-list", "-1", "HEAD", "--", "tutor/journal.md"],
          gitOptions,
        ).trim();
        const range = journalCommit ? `${journalCommit}..HEAD` : "HEAD";
        const out = execFileSync(
          "git",
          ["-C", repoRoot, "log", "--format=%H%x09%ct%x09%s", range, "--", "curriculum", "tutor"],
          gitOptions,
        );
        const commits = out
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => {
            const [hash, seconds, ...subject] = line.split("\t");
            return { hash, timeMs: Number(seconds) * 1000, subject: subject.join("\t") };
          });

        if (commits.length === 0) {
          add(
            "unjournaled-commits",
            "ok",
            journalCommit
              ? `no curriculum/tutor commits after journal commit ${journalCommit.slice(0, 7)}`
              : "no committed curriculum/tutor activity yet — nothing to journal",
          );
        } else {
          const now = Date.now();
          const stale = commits.filter((commit) => (now - commit.timeMs) / 3_600_000 > STALE_HOURS);
          const shown = (stale.length > 0 ? stale : commits).map((commit) => {
            const ageH = Math.max(0, (now - commit.timeMs) / 3_600_000);
            return `${commit.hash.slice(0, 7)} "${commit.subject}" (${ageH.toFixed(0)}h)`;
          });
          const baseline = journalCommit
            ? `journal commit ${journalCommit.slice(0, 7)}`
            : "any committed journal entry";
          if (stale.length > 0) {
            add(
              "unjournaled-commits",
              "fail",
              `committed course activity older than ${STALE_HOURS}h is newer than ${baseline}: ${trim(shown)}`,
            );
          } else {
            add(
              "unjournaled-commits",
              "warn",
              `committed course activity is newer than ${baseline} (session may still be in progress): ${trim(shown)}`,
            );
          }
        }
      } catch {
        add(
          "unjournaled-commits",
          "warn",
          "could not inspect git history (repository has no commits, or history is unavailable) — skipping the committed-session check",
        );
      }
    }

    // 6) UNJOURNALED QUIZ ACTIVITY — the newest quiz activity vs the newest journal
    //    entry. Activity newer than the last journal entry means a session touched
    //    the bank but was never journaled (the 2026-07-05 failure exactly). Both
    //    grades (history[]) and reschedules (moves[]) count — a maintenance
    //    reschedule is session work that must leave a journal trace.
    const activity = quizBank.ok ? newestQuizActivity(quizBank.value) : { date: null, kind: null };
    let newestJournal = null;
    if (journalExists) {
      // tolerant: any "## YYYY-MM-DD …" heading; a "…-15/16" range takes the first date
      newestJournal = newestJournalDate(fs.readFileSync(journalPath, "utf8"));
    }
    // "quiz items were graded" for grade activity; "a quiz item was rescheduled"
    // for a move — so the message names what actually went unjournaled.
    const didWhat =
      activity.kind === "rescheduled"
        ? `a quiz item was rescheduled on ${activity.date}`
        : `quiz items were graded on ${activity.date}`;
    if (!quizBank.ok) {
      add("unjournaled", "warn", "skipped — quiz-bank.json did not parse");
    } else if (!activity.date) {
      add("unjournaled", "ok", "no graded or rescheduled quiz items yet — nothing to journal");
    } else if (!newestJournal) {
      add("unjournaled", "fail", `${didWhat} but journal.md has no dated session entries`);
    } else if (activity.date > newestJournal) {
      add(
        "unjournaled",
        "fail",
        `${didWhat} but that session was never journaled (last journal entry ${newestJournal})`,
      );
    } else {
      add(
        "unjournaled",
        "ok",
        `last journal entry (${newestJournal}) is current with the newest quiz activity (${activity.date})`,
      );
    }

    // 7) PROGRESS SYNC — currentModule points at a real module dir; statuses are
    //    from the known vocabulary ("complete" is the UI's word, tolerated with a warn).
    if (!progress.ok) {
      add("progress-sync", "warn", "skipped — progress.json did not parse");
    } else {
      const prog = progress.value ?? {};
      const problems = [];
      const warns = [];
      const cur = prog.currentModule;
      if (cur && !fs.existsSync(path.join(repoRoot, "curriculum", cur))) {
        problems.push(`currentModule "${cur}" has no directory under curriculum/`);
      }
      const VALID = new Set(["not-started", "in-progress", "completed"]);
      for (const [id, m] of Object.entries(prog.modules ?? {})) {
        const st = m?.status;
        if (st === undefined) continue;
        if (st === "complete")
          warns.push(
            `module "${id}" status "complete" (UI vocabulary; disk vocabulary is "completed")`,
          );
        else if (!VALID.has(st)) problems.push(`module "${id}" has unknown status "${st}"`);
      }
      if (problems.length > 0) add("progress-sync", "fail", [...problems, ...warns].join("; "));
      else if (warns.length > 0) add("progress-sync", "warn", warns.join("; "));
      else
        add(
          "progress-sync",
          "ok",
          cur
            ? `currentModule "${cur}" exists; all module statuses valid`
            : "no currentModule set; all module statuses valid",
        );
    }
  }

  // ---- render + exit ----
  const anyFail = results.some((r) => r.level === "fail");
  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    const glyph = { ok: "✓", warn: "⚠", fail: "✗" };
    console.log(`doctor — ${repoRoot}`);
    for (const r of results) console.log(`${glyph[r.level]} ${r.id}: ${r.message}`);
    const fails = results.filter((r) => r.level === "fail").length;
    const warns = results.filter((r) => r.level === "warn").length;
    console.log(
      anyFail
        ? `\n${fails} check(s) failing${warns ? `, ${warns} warning(s)` : ""} — reconcile before continuing.`
        : warns
          ? `\nclean, ${warns} warning(s).`
          : `\nall clear.`,
    );
  }
  process.exit(anyFail ? 1 : 0);
}

// Run only as a CLI; on import (tests) the pure helpers above are used directly.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
