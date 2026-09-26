// Mechanize the sealed-reference QA ritual and the materials-quality rules.
// CLAUDE.md demands, before a learner ever sees a module: write a sealed
// reference solution, run the checks against it (all green), strip back to the
// scaffold, confirm the checks fail ON ASSERTIONS (not crashes), delete the
// reference. That is pure discipline today, and it leaks — the *learner* has
// repeatedly caught what the ritual should have: a price-key mismatch, hardcoded
// dollar values, a flaky `secondMs < firstMs/2` timing check, a brief whose
// answer file lied about its own types, a refusal-contract hole. This is the
// mechanical check that prose couldn't be.
//
// Static lints read course files and `git ls-files`; dynamic runs copy the
// scaffold+checks into a throwaway temp dir and run there. Dependencies are
// reused via a directory junction. Cleanup removes links without traversing
// their targets. Course-authored checks still run as trusted code and can write
// through that shared install; the temporary workspace is not a sandbox.
//
// Usage:  node scripts/qa-module.mjs <module-dir-or-id> [--reference <dir>] [--json] [--skip-run]
//   <module-dir-or-id>   a path to a module dir, or a bare id (02-vector-store)
//                        looked up under <repo>/curriculum/. Repo resolution
//                        matches doctor.mjs/validate.mjs: PRAXEUM_COURSE, else walk
//                        up from cwd for .git/CLAUDE.md.
//   --reference <dir>    a sealed reference whose tree mirrors scaffold/ (e.g.
//                        src/store.ts); overlaid onto a scaffold copy — the
//                        checks must then go ALL GREEN.
//   --skip-run           static lints only; the dynamic run is skipped LOUDLY.
//   --json               print a stable [{ id, level, message }] array.
//
// Exit 0 when nothing fails (warnings allowed), 1 when any check fails. Nothing
// is ever skipped silently: a check that can't run says so as a warn.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateQuestion } from "./assessment.mjs";

const die = (msg) => {
  console.error(msg);
  process.exit(1);
};
const USAGE =
  "usage: node scripts/qa-module.mjs <module-dir-or-id> [--reference <dir>] [--json] [--skip-run]";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(scriptDir, "..");

// ---- repo root discovery (only for the bare-id form) — mirrors the sibling scripts ----
function walkUp(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git")) || fs.existsSync(path.join(dir, "CLAUDE.md")))
      return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// ---- module resolution: an existing path wins; else a bare id → <repo>/curriculum/<id> ----
function resolveModule(arg) {
  const asPath = path.resolve(arg);
  if (fs.existsSync(asPath) && fs.statSync(asPath).isDirectory()) {
    return { moduleDir: asPath, moduleId: path.basename(asPath) };
  }
  if (/^[0-9]{2}-[a-z0-9-]+$/.test(arg)) {
    const repo = process.env.PRAXEUM_COURSE
      ? path.resolve(process.env.PRAXEUM_COURSE)
      : walkUp(process.cwd());
    if (!repo)
      return {
        error: `bare module id "${arg}" given but no course found — set PRAXEUM_COURSE or run inside a course`,
      };
    const md = path.join(repo, "curriculum", arg);
    if (fs.existsSync(md) && fs.statSync(md).isDirectory()) return { moduleDir: md, moduleId: arg };
    return { error: `module "${arg}" not found under ${path.join(repo, "curriculum")}` };
  }
  return { error: `module directory not found: ${arg}` };
}

// ---- results: one entry per check, worst level wins the exit code ----
const results = [];
const add = (id, level, message) => results.push({ id, level, message });

// ============================================================================
//  small utilities
// ============================================================================
// stripping ANSI colour codes genuinely requires matching the ESC (\x1b) control char
// eslint-disable-next-line no-control-regex
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
const readText = (abs) => {
  try {
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
};
function walkFiles(dir, base = dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      walkFiles(abs, base, out);
    } else if (e.isFile()) {
      out.push(path.relative(base, abs).replace(/\\/g, "/"));
    }
  }
  return out;
}
// git run scoped to the module dir; git's own repo discovery does the walk-up.
function git(moduleDir, args) {
  const r = spawnSync("git", ["-C", moduleDir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: r.status === 0 && !r.error,
    status: r.status,
    out: r.stdout ?? "",
    err: r.stderr ?? "",
  };
}

// ---- module-level state, assigned by main(); the check functions below close
//      over it, and the guarded main() is the only writer. On import (tests) the
//      pure heuristics are used directly and this stays at its defaults. ----
let jsonMode = false;
let skipRun = false;
let referenceDir = null;
let positionals = [];
let moduleDir = null;
let moduleId = null;
let scaffoldDir = null;
let checksDir = null;
let visualsDir = null;
let hasScaffold = false;
let hasChecks = false;
let volatilePresent = false;

// ============================================================================
//  PURE HEURISTICS (exported for tests) — no I/O, no shared state
// ============================================================================

// The vitest-output classifier. Distinguishes: tests ran and reported assertion
// failures (the intended red) vs the process crashed / zero tests found (the
// harness measured nothing). `run` is { out, raw, timedOut }.
/** Approximate prose load, excluding fenced examples and reference destinations. */
export function lessonScope(text, estimatedHours) {
  const prose = (text ?? "")
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
    .replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
  const words = prose === "" ? 0 : prose.split(/\s+/u).length;
  return { words, review: words > 1500 || estimatedHours > 1 };
}

export function classify(run) {
  if (run.timedOut) return { verdict: "no-results", detail: "the check run timed out" };
  const out = run.out ?? "";
  if (/No test files? found/i.test(out))
    return { verdict: "no-results", detail: "no test files found", total: 0 };
  const m = out.match(/^\s*Tests\s+(.+)$/m); // the per-test summary, not "Test Files"
  if (!m)
    return {
      verdict: "no-results",
      detail: "no test summary emitted (checks crashed before running)",
      total: 0,
    };
  const tail = m[1];
  const failed = Number((tail.match(/(\d+)\s+failed/) || [])[1] || 0);
  const passed = Number((tail.match(/(\d+)\s+passed/) || [])[1] || 0);
  const total = Number((tail.match(/\((\d+)\)\s*$/) || [])[1] || failed + passed);
  if (total === 0)
    return { verdict: "no-results", detail: "zero tests ran", total: 0, failed, passed };
  if (failed === 0) return { verdict: "all-pass", total, failed, passed };
  const hasAssertion = /AssertionError/.test(run.raw ?? out);
  return { verdict: hasAssertion ? "assertion-fail" : "error-fail", total, failed, passed };
}

// The relative-timing anti-pattern: a comparison between two *measured* durations
// (the known flake — it breaks once earlier tests warm caches). `files` is an
// array of { rel, text }. Returns flagged "rel:line  <snippet>" strings. A single
// measured duration compared to an absolute bound is fine and is not flagged.
export function detectRelativeTiming(files) {
  const flagged = [];
  const CMP = /(<=?|>=?|toBeLessThan(?:OrEqual)?|toBeGreaterThan(?:OrEqual)?)/;
  const CLOCK =
    /performance\s*\.\s*now\s*\(|Date\s*\.\s*now\s*\(|process\s*\.\s*hrtime|\.hrtime\b/g;
  for (const { rel, text } of files) {
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    // pass 1: variables holding a timestamp/duration
    const timing = new Set();
    const declRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=([^;]*)/;
    for (const line of lines) {
      const m = line.match(declRe);
      if (
        m &&
        /performance\s*\.\s*now\s*\(|Date\s*\.\s*now\s*\(|process\s*\.\s*hrtime|\.hrtime\b/.test(
          m[2],
        )
      )
        timing.add(m[1]);
    }
    // pass 2: durations derived by subtracting known timing vars (transitive)
    for (let pass = 0; pass < 3; pass++) {
      for (const line of lines) {
        const m = line.match(declRe);
        if (!m || timing.has(m[1])) continue;
        const rhs = m[2];
        if (!rhs.includes("-")) continue;
        if ([...timing].some((v) => new RegExp(`\\b${v}\\b`).test(rhs))) timing.add(m[1]);
      }
    }
    // detect comparisons that reference >= 2 timing quantities on one line
    lines.forEach((line, i) => {
      if (!CMP.test(line)) return;
      let count = (line.match(CLOCK) || []).length;
      for (const v of timing) if (new RegExp(`\\b${v}\\b`).test(line)) count++;
      if (count >= 2) flagged.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
    });
  }
  return flagged;
}

// The learner's-eye review (CLAUDE.md "Learner's-eye review"): four headings,
// each a per-item list. Returns { missing, empty } — heading keys absent from
// the file, and headings present with nothing under them. Matching is by the
// key phrase so the reviewer may word the heading freely.
export const REVIEW_SECTIONS = [
  { key: "terms", heading: "Terms before use", pattern: /terms/i },
  { key: "answer-form", heading: "Answer form", pattern: /answer\s+form/i },
  { key: "doable", heading: "Doable from the page", pattern: /doable/i },
  { key: "assumptions", heading: "Assumptions about the learner", pattern: /assumption/i },
];
export function reviewChecklist(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const heading = /^\s*#{1,6}\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = { title: heading[1], body: [] };
      sections.push(current);
    } else if (current && line.trim() !== "") current.body.push(line);
  }
  const missing = [];
  const empty = [];
  for (const section of REVIEW_SECTIONS) {
    const found = sections.find((s) => section.pattern.test(s.title));
    if (!found) missing.push(section.heading);
    else if (found.body.length === 0) empty.push(section.heading);
  }
  return { missing, empty };
}

// The answer contract between a brief and a structured answer file. Leaves of
// the reference (or, without one, of the scaffold) are compared: a scaffold
// placeholder may be null ("unanswered"); anything else must be the type a
// correct answer has — a "" where a number goes taught one learner to type
// strings. And every leaf the learner must fill has to be NAMED in the brief.
// Keys under a top-level `instructions` are prose for the learner, not answers.
export function answerContract(scaffold, reference, brief) {
  const jtype = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
  const leaves = (value, prefix = "", out = []) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
    } else out.push([prefix, jtype(value)]);
    return out;
  };
  const scaffoldTypes = new Map(leaves(scaffold));
  const typeMismatch = [];
  const notInBrief = [];
  const source = reference === null ? leaves(scaffold) : leaves(reference);
  for (const [p, refType] of source) {
    if (p === "instructions" || p.startsWith("instructions.")) continue;
    const scaffoldType = scaffoldTypes.get(p);
    if (reference !== null) {
      if (scaffoldType === undefined)
        typeMismatch.push(`${p}: absent from the scaffold (a correct answer is ${refType})`);
      else if (scaffoldType !== refType && scaffoldType !== "null")
        typeMismatch.push(`${p}: placeholder is ${scaffoldType}, a correct answer is ${refType}`);
    }
    const field = p.split(".").pop();
    if (field && !brief.includes(field)) notInBrief.push(p);
  }
  return { typeMismatch, notInBrief };
}

// Closed vocabulary the brief uses has to be taught somewhere the learner can
// see. Every inline `code` span in the brief that reads as a TERM (no
// whitespace, slash or dot; not a number or a quoted literal) must appear in
// LESSON.md or in the scaffold text handed over. Fenced blocks are skipped.
export function untaughtTerms(brief, lesson, scaffoldTexts) {
  const stripped = brief.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
  const seen = new Set();
  const out = [];
  for (const match of stripped.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1].trim();
    if (seen.has(token)) continue;
    seen.add(token);
    if (/[\s/.]/.test(token) || token.length < 2) continue;
    if (/^[-+"'\d]/.test(token) || /^(null|true|false)$/.test(token)) continue;
    if (lesson.includes(token)) continue;
    if (scaffoldTexts.some((text) => text.includes(token))) continue;
    out.push(token);
  }
  return out;
}

// visuals external-reference linter (the serve-time CSP blocks all network).
// Returns { external, relative, usesNetworkApi }: external/relative are the
// referenced URLs (insertion order), usesNetworkApi flags a fetch/XHR/WS/... call.
export function lintVisualHtml(text) {
  const URL_ATTRS = [
    /(?:src|href)\s*=\s*["']([^"']+)["']/gi,
    /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
    /@import\s+["']([^"']+)["']/gi,
    /\bfrom\s+["']([^"']+)["']/gi,
    /\bimport\s*\(\s*["']([^"']+)["']/gi,
    /(?:fetch|EventSource|WebSocket)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
  ];
  const NET_API =
    /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\b|navigator\s*\.\s*sendBeacon/;
  const external = new Set();
  const relative = new Set();
  for (const re of URL_ATTRS) {
    for (const m of text.matchAll(re)) {
      const url = m[1].trim();
      if (/^(https?:)?\/\//i.test(url) || /^(wss?|ftp):/i.test(url)) external.add(url);
      else if (/^(data:|#|mailto:|tel:|javascript:|blob:)/i.test(url) || url === "") continue;
      else relative.add(url);
    }
  }
  return { external: [...external], relative: [...relative], usesNetworkApi: NET_API.test(text) };
}

// ============================================================================
//  STATIC 2 — module.json + lab.json against the schemas (reuse validate.mjs)
// ============================================================================
function schemaCheck() {
  const present = [
    ["module.json", "module"],
    ["lab.json", "lab"],
  ].filter(([f]) => fs.existsSync(path.join(moduleDir, f)));
  if (present.length === 0) {
    add("schema", "warn", "no module.json/lab.json to validate");
    return;
  }
  const validatePath = path.join(scriptDir, "validate.mjs");
  if (!fs.existsSync(validatePath)) {
    add("schema", "warn", `cannot validate — ${validatePath} not found`);
    return;
  }
  let tmp;
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-qa-schema-"));
    const cdir = path.join(tmp, "curriculum", moduleId);
    fs.mkdirSync(cdir, { recursive: true });
    for (const [f] of present) fs.copyFileSync(path.join(moduleDir, f), path.join(cdir, f));
    const r = spawnSync(process.execPath, [validatePath, tmp, "--json"], { encoding: "utf8" });
    let parsed;
    try {
      parsed = JSON.parse(r.stdout);
    } catch {
      add(
        "schema",
        "warn",
        `validate.mjs produced no parseable JSON (exit ${r.status})${r.stderr ? `: ${r.stderr.trim()}` : ""}`,
      );
      return;
    }
    const want = new Set(present.map(([f]) => `curriculum/${moduleId}/${f}`));
    const mine = parsed.filter((e) => want.has(e.id));
    if (mine.length === 0) {
      add("schema", "warn", "validate.mjs reported nothing for this module's manifests");
      return;
    }
    for (const e of mine) {
      const base = e.id.split("/").pop();
      add(`schema:${base}`, e.level, e.message);
    }
  } finally {
    if (tmp) safeRemove(tmp);
  }
}

// ============================================================================
//  STATIC 7 — lab.json: stock claims exist, visuals files exist
// ============================================================================
function labCheck() {
  const labPath = path.join(moduleDir, "lab.json");
  if (!fs.existsSync(labPath)) {
    add("lab", "ok", "no lab.json (optional) — no visualization claimed");
    return;
  }
  let lab;
  try {
    lab = JSON.parse(readText(labPath));
  } catch (err) {
    add("lab", "fail", `lab.json is not valid JSON: ${err?.message ?? err}`);
    return;
  }
  // Known stock lab ids come from the engine's machine-readable contract. The
  // Desktop renderer consumes the same manifest, so QA cannot drift from what
  // the learner can actually open.
  const registryPath = path.join(engineRoot, "docs", "stock-labs.json");
  let stockIds = null;
  try {
    const manifest = JSON.parse(readText(registryPath));
    if (
      manifest?.schemaVersion === 1 &&
      Array.isArray(manifest.labs) &&
      manifest.labs.every((entry) => typeof entry?.id === "string")
    ) {
      stockIds = manifest.labs.map((entry) => entry.id);
    }
  } catch {
    // Report one stable engine-contract error below when the module claims a lab.
  }
  const META = new Set(["provenance", "focus", "focusLab", "visuals"]);
  const claims = Object.keys(lab).filter((k) => !META.has(k));
  const problems = [];
  const warns = [];
  if (stockIds === null) {
    if (claims.length) {
      problems.push(
        `cannot verify stock claim(s) ${claims.join(", ")} — the Course Engine stock-lab manifest is missing or invalid`,
      );
    }
  } else {
    for (const c of claims) {
      if (!stockIds.includes(c))
        problems.push(
          `claims stock lab "${c}" but no such lab is shipped (available: ${stockIds.join(", ")}) — Lerience will ignore it`,
        );
    }
  }
  // visuals files must exist on disk
  const visuals = Array.isArray(lab.visuals) ? lab.visuals : [];
  for (const v of visuals) {
    if (!v || !v.file) {
      problems.push("a visuals[] entry has no file");
      continue;
    }
    const rel = String(v.file).replace(/^visuals\//, "");
    if (!fs.existsSync(path.join(visualsDir, rel)))
      problems.push(`visuals entry "${v.file}" has no file at visuals/${rel}`);
  }
  // focusLab, if set, should resolve to a claim or a visual (wrong target opens the wrong lab)
  if (lab.focusLab) {
    const stockOk = stockIds
      ? stockIds.includes(lab.focusLab) && claims.includes(lab.focusLab)
      : claims.includes(lab.focusLab);
    const visualKeys = visuals
      .filter((v) => v && v.file)
      .flatMap((v) => {
        const rel = String(v.file).replace(/^visuals\//, "");
        return [rel, `${moduleId}/${rel}`, v.file];
      });
    if (!stockOk && !visualKeys.includes(lab.focusLab))
      warns.push(
        `focusLab "${lab.focusLab}" resolves to no claimed lab or visual — the module would open on the wrong picture`,
      );
  }
  if (problems.length)
    add("lab", "fail", problems.join("; ") + (warns.length ? "; " + warns.join("; ") : ""));
  else if (warns.length) add("lab", "warn", warns.join("; "));
  else
    add(
      "lab",
      "ok",
      claims.length || visuals.length
        ? `lab.json valid (${[...claims, ...visuals.map(() => "visual")].join(", ")})`
        : "lab.json present, nothing claimed",
    );
}

// ============================================================================
//  DYNAMIC — run the checks in throwaway copies
// ============================================================================
function runDynamic() {
  // is there anything runnable?
  if (!hasScaffold || !hasChecks) {
    add(
      "dynamic-run",
      "warn",
      "no scaffold+checks to run — dynamic sealed-reference verification NOT performed",
    );
    if (referenceDir)
      add(
        "reference-run",
        "warn",
        "--reference given but there is no runnable scaffold+checks — skipped",
      );
    return;
  }
  const pkgPath = path.join(scaffoldDir, "package.json");
  const pkg = fs.existsSync(pkgPath) ? safeJson(readText(pkgPath)) : null;
  const hasCheckScript = pkg && pkg.scripts && typeof pkg.scripts.check === "string";
  if (!hasCheckScript) {
    add(
      "dynamic-run",
      "warn",
      "scaffold/package.json has no `check` script — cannot run the module's checks; dynamic verification NOT performed",
    );
    if (referenceDir)
      add(
        "reference-run",
        "warn",
        "--reference given but the scaffold has no `check` script — skipped",
      );
    return;
  }
  if (!fs.existsSync(path.join(scaffoldDir, "node_modules"))) {
    add(
      "dynamic-run",
      "warn",
      "scaffold dependencies not installed (no node_modules) — run `npm install` in the scaffold, then re-run; dynamic verification NOT performed",
    );
    if (referenceDir)
      add(
        "reference-run",
        "warn",
        "--reference given but scaffold node_modules is absent — skipped",
      );
    return;
  }
  if (skipRun) {
    add(
      "dynamic-run",
      "warn",
      "--skip-run: the as-is scaffold run and sealed-reference verification were NOT performed",
    );
    if (referenceDir)
      add("reference-run", "warn", "--skip-run: reference verification NOT performed");
    return;
  }

  // as-is: the virgin scaffold must FAIL, on assertions
  const asis = runChecks();
  if (asis.reason) add("dynamic-run", "warn", `could not run checks: ${asis.reason}`);
  else {
    const c = classify(asis);
    if (c.verdict === "assertion-fail")
      add(
        "dynamic-run",
        "ok",
        `as-is scaffold fails ${c.failed}/${c.total} check(s) on assertions, as a virgin scaffold must`,
      );
    else if (c.verdict === "all-pass")
      add(
        "dynamic-run",
        "fail",
        `as-is scaffold PASSES all ${c.total} check(s) — the gaps don't gate; a learner would have nothing to build (already completed?)`,
      );
    else if (c.verdict === "error-fail")
      add(
        "dynamic-run",
        "warn",
        `as-is scaffold fails ${c.failed}/${c.total}, but on thrown errors, not assertions — a virgin scaffold should fail ON ASSERTIONS, not crash (CLAUDE.md QA). Verify the gaps yield assertion failures`,
      );
    else
      add(
        "dynamic-run",
        "fail",
        `as-is scaffold produced no test results — ${c.detail} (a harness that measures nothing must fail loudly)`,
      );
  }

  // reference: overlay it and require ALL GREEN
  if (referenceDir) {
    const refAbs = path.resolve(referenceDir);
    if (!fs.existsSync(refAbs) || !fs.statSync(refAbs).isDirectory()) {
      add("reference-run", "fail", `--reference directory not found: ${refAbs}`);
      return;
    }
    const ref = runChecks(refAbs);
    if (ref.reason) add("reference-run", "warn", `could not run reference: ${ref.reason}`);
    else {
      const c = classify(ref);
      if (c.verdict === "all-pass")
        add("reference-run", "ok", `sealed reference passes all ${c.total} check(s) (green)`);
      else if (c.verdict === "assertion-fail" || c.verdict === "error-fail")
        add(
          "reference-run",
          "fail",
          `sealed reference FAILS ${c.failed}/${c.total} check(s) — a reference must go all-green before handover`,
        );
      else add("reference-run", "fail", `sealed reference produced no test results — ${c.detail}`);
    }
  }
}

// Copy scaffold(sans node_modules)+checks to a temp dir, junction node_modules
// back to the original (not copied), optionally overlay a
// reference, run `npm run check`. Returns captured output or a reason it couldn't.
function runChecks(overlayDir) {
  let tmp;
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "praxeum-qa-run-"));
    const tScaffold = path.join(tmp, "scaffold");
    fs.cpSync(scaffoldDir, tScaffold, {
      recursive: true,
      filter: (s) => !s.split(/[\\/]/).includes("node_modules"),
    });
    fs.cpSync(checksDir, path.join(tmp, "checks"), { recursive: true });
    if (overlayDir) {
      for (const rel of walkFiles(overlayDir)) {
        const dest = path.join(tScaffold, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(overlayDir, rel), dest);
      }
    }
    // junction (Windows) / dir symlink (POSIX) to the module's real install
    const link = path.join(tScaffold, "node_modules");
    fs.symlinkSync(
      path.join(scaffoldDir, "node_modules"),
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    const r = spawnSync("npm", ["run", "check"], {
      cwd: tScaffold,
      encoding: "utf8",
      timeout: 300_000,
      shell: true,
    });
    if (r.error && r.error.code === "ETIMEDOUT") return { timedOut: true };
    return {
      status: r.status,
      out: stripAnsi(`${r.stdout ?? ""}\n${r.stderr ?? ""}`),
      raw: `${r.stdout ?? ""}\n${r.stderr ?? ""}`,
    };
  } catch (err) {
    return { reason: err?.message ?? String(err) };
  } finally {
    if (tmp) safeRemove(tmp);
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
// Remove only entries owned by the temporary tree. Electron 43.4.0 on Windows
// follows junctions in recursive rmSync, unlike standalone Node 24.18.0.
// Handle every link, including dangling or check-created links, with unlink.
// Never fall back to recursive removal after a failed unlink or inspection.
function safeRemove(dir) {
  function removeEntry(entry) {
    const st = fs.lstatSync(entry);
    if (st.isSymbolicLink() || !st.isDirectory()) {
      fs.unlinkSync(entry);
      return;
    }
    for (const name of fs.readdirSync(entry)) removeEntry(path.join(entry, name));
    fs.rmdirSync(entry);
  }
  try {
    removeEntry(dir);
  } catch (err) {
    add(
      "cleanup",
      "warn",
      `temporary QA files may remain at ${dir}: ${err?.message ?? String(err)}`,
    );
  }
}

// ============================================================================
//  render + exit
// ============================================================================
function render() {
  const anyFail = results.some((r) => r.level === "fail");
  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    const glyph = { ok: "✓", warn: "⚠", fail: "✗" };
    console.log(`qa-module — ${moduleId ?? positionals[0]}${moduleDir ? ` (${moduleDir})` : ""}`);
    for (const r of results) console.log(`${glyph[r.level]} ${r.id}: ${r.message}`);
    const fails = results.filter((r) => r.level === "fail").length;
    const warns = results.filter((r) => r.level === "warn").length;
    console.log(
      anyFail
        ? `\n${fails} check(s) failing${warns ? `, ${warns} warning(s)` : ""} — fix before handover.`
        : warns
          ? `\nclean, ${warns} warning(s).`
          : `\nall clear — ready for handover.`,
    );
  }
  process.exit(anyFail ? 1 : 0);
}

// ============================================================================
//  main — argv, module resolution, the checks in order, render
// ============================================================================
function main() {
  // ---- argv: --json / --skip-run bare, --reference takes a value, one module positional ----
  {
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === "--json") jsonMode = true;
      else if (a === "--skip-run") skipRun = true;
      else if (a === "--reference") {
        referenceDir = argv[++i];
        if (referenceDir === undefined || referenceDir.startsWith("--"))
          die(`--reference requires a directory\n${USAGE}`);
      } else if (a.startsWith("--reference=")) referenceDir = a.slice("--reference=".length);
      else if (a.startsWith("--")) die(`unknown flag "${a}"\n${USAGE}`);
      else positionals.push(a);
    }
  }
  if (positionals.length === 0) die(USAGE);
  if (positionals.length > 1) die(`too many arguments (one module dir/id expected)\n${USAGE}`);

  // resolve the module, decide what layers exist
  {
    const resolved = resolveModule(positionals[0]);
    if (resolved.error) {
      add("module", "fail", resolved.error);
      render(); // exits; render tolerates null moduleDir/moduleId
    }
    moduleDir = resolved.moduleDir;
    moduleId = resolved.moduleId;
  }
  scaffoldDir = path.join(moduleDir, "scaffold");
  checksDir = path.join(moduleDir, "checks");
  visualsDir = path.join(moduleDir, "visuals");
  hasScaffold = fs.existsSync(scaffoldDir);
  hasChecks = fs.existsSync(checksDir);
  // The volatile layer (scaffold/checks/REVIEW.md) is generated when the
  // learner starts the module. A stable-only module (spine written, not yet
  // generated) can't be QA'd for handover — say so, don't fail it.
  const hasAssessment = fs.existsSync(path.join(moduleDir, "assessment.json"));
  volatilePresent = hasScaffold || hasChecks || hasAssessment;
  if (hasAssessment) {
    try {
      const question = JSON.parse(readText(path.join(moduleDir, "assessment.json")));
      const key = JSON.parse(readText(path.join(moduleDir, "assessment-key.json")));
      validateQuestion(question, key, moduleId);
      add(
        "assessment-contract",
        "ok",
        "Question fields, criteria and versioned numeric key agree. Correctness and learner clarity require the cold review.",
      );
    } catch (error) {
      add("assessment-contract", "fail", error.message);
    }
  }
  // Courses generated before engine 0.2.0 carry sealed hint files instead of a
  // review; those modules are read as legacy and warned about, never failed.
  const legacyHints = fs.existsSync(path.join(moduleDir, "hints"));

  // ---- STATIC 1 — required files ----
  {
    const stable = ["LESSON.md", "BRIEF.md", "module.json", "quiz.md"];
    const missingStable = stable.filter((f) => !fs.existsSync(path.join(moduleDir, f)));
    if (missingStable.length)
      add("required-files", "fail", `missing required file(s): ${missingStable.join(", ")}`);
    else if (!volatilePresent)
      add(
        "required-files",
        "warn",
        "stable layer present; volatile layer (scaffold/checks/REVIEW.md) not generated yet — QA the module after generating it",
      );
    else
      add(
        "required-files",
        "ok",
        "all required files present (LESSON, BRIEF, module.json, quiz.md)",
      );
  }

  // ---- STATIC 2 — module.json + lab.json against the schemas ----
  schemaCheck();

  // Advisory: size can reveal an overloaded lesson, but cannot judge its pedagogy.
  {
    const lesson = readText(path.join(moduleDir, "LESSON.md"));
    if (lesson !== null) {
      const manifest = safeJson(readText(path.join(moduleDir, "module.json")));
      const { words, review } = lessonScope(lesson, manifest?.estimatedHours);
      add(
        "lesson-scope",
        review ? "warn" : "ok",
        `approximately ${words} prose words; estimated total work: ${manifest?.estimatedHours ?? "unspecified"}h. ` +
          (review
            ? "Review scope before handover: split independently assessable outcomes or explain the longer exercise and stopping points in COURSE.md."
            : "Within the scope-review thresholds; outcome coverage still needs tutor review."),
      );
    }
  }

  // ---- STATIC 3 — scaffold carries at least one TODO(you) gap ----
  if (!hasScaffold) {
    add(
      "scaffold-todo",
      hasAssessment && !hasChecks ? "ok" : volatilePresent ? "fail" : "warn",
      volatilePresent
        ? hasAssessment && !hasChecks
          ? "Assessment-only activity needs no scaffold."
          : "no scaffold/ directory"
        : "no scaffold/ yet (volatile layer not generated)",
    );
  } else {
    const files = walkFiles(scaffoldDir);
    const gapped = files.filter((rel) =>
      (readText(path.join(scaffoldDir, rel)) ?? "").includes("TODO(you)"),
    );
    if (gapped.length > 0)
      add("scaffold-todo", "ok", `${gapped.length} scaffold file(s) carry TODO(you) gaps`);
    else
      add(
        "scaffold-todo",
        "fail",
        "scaffold has no TODO(you) gaps — a virgin scaffold must leave the conceptually load-bearing parts unbuilt (is this scaffold already completed?)",
      );
  }

  // ---- STATIC 4 — the learner's-eye review exists, is complete, and is current ----
  {
    const reviewPath = path.join(moduleDir, "REVIEW.md");
    const text = readText(reviewPath);
    if (text === null) {
      if (legacyHints)
        add(
          "review",
          "warn",
          "no REVIEW.md; this module carries legacy hints/ from an earlier engine — write the learner's-eye review before its next handover (CLAUDE.md)",
        );
      else
        add(
          "review",
          volatilePresent ? "fail" : "warn",
          volatilePresent
            ? "REVIEW.md not found — a fresh context must read LESSON.md, BRIEF.md and the scaffold with only what the learner has, and write the review before handover (CLAUDE.md)"
            : "no REVIEW.md yet (volatile layer not generated)",
        );
    } else {
      const { missing, empty } = reviewChecklist(text);
      const problems = [
        ...missing.map((h) => `missing section "${h}"`),
        ...empty.map((h) => `section "${h}" has no items`),
      ];
      if (problems.length)
        add(
          "review",
          "fail",
          `REVIEW.md is incomplete: ${problems.join("; ")} — every heading is a per-item list ending in a location, "fixed: …" or "removed: …"`,
        );
      else {
        const mtime = (f) => {
          try {
            return fs.statSync(path.join(moduleDir, f)).mtimeMs;
          } catch {
            return 0;
          }
        };
        const stale = [
          "LESSON.md",
          "BRIEF.md",
          ...(hasAssessment ? ["assessment.json", "assessment-key.json"] : []),
        ].filter((f) => mtime(f) > mtime("REVIEW.md"));
        if (stale.length)
          add(
            "review",
            "warn",
            `REVIEW.md is older than ${stale.join(" and ")} — re-run the learner's-eye review on the repaired files before handover`,
          );
        else
          add("review", "ok", "REVIEW.md covers all four headings and is newer than the material");
      }
    }
  }

  // ---- STATIC 4b — the answer contract, where a structured answer file exists ----
  // A scaffold whose deliverable is source code has no equivalent; the lint
  // stays silent rather than inventing a contract.
  {
    const answerFiles = hasScaffold
      ? walkFiles(scaffoldDir).filter((rel) => /(^|\/)answers[^/]*\.json$/i.test(rel))
      : [];
    const brief = readText(path.join(moduleDir, "BRIEF.md")) ?? "";
    if (answerFiles.length === 0)
      add(
        "answer-contract",
        "ok",
        "no structured answer file under scaffold/ — contract lint does not apply",
      );
    else {
      const fails = [];
      const notes = [];
      for (const rel of answerFiles) {
        const scaffoldJson = safeJson(readText(path.join(scaffoldDir, rel)));
        if (scaffoldJson === null) {
          fails.push(`${rel}: not valid JSON`);
          continue;
        }
        const refFile = referenceDir ? path.join(path.resolve(referenceDir), rel) : null;
        const referenceJson =
          refFile && fs.existsSync(refFile) ? safeJson(readText(refFile)) : null;
        const { typeMismatch, notInBrief } = answerContract(scaffoldJson, referenceJson, brief);
        for (const m of typeMismatch) fails.push(`${rel}: ${m}`);
        for (const p of notInBrief) fails.push(`${rel}: ${p} is never named in BRIEF.md`);
        if (referenceJson === null)
          notes.push(
            `${rel}: placeholder types not checked (no sealed reference copy of this file under --reference)`,
          );
      }
      if (fails.length)
        add(
          "answer-contract",
          "fail",
          `the brief and the answer file disagree — a placeholder must be null or the type a correct answer has, and every answer field must be named in the brief:\n    ${fails.join("\n    ")}`,
        );
      else if (notes.length) add("answer-contract", "warn", notes.join("; "));
      else
        add(
          "answer-contract",
          "ok",
          `${answerFiles.length} answer file(s): placeholders type-honest, every field named in BRIEF.md`,
        );
    }
  }

  // ---- STATIC 4c — closed vocabulary the brief uses is taught somewhere ----
  {
    const brief = readText(path.join(moduleDir, "BRIEF.md"));
    const lesson = readText(path.join(moduleDir, "LESSON.md"));
    if (brief === null || lesson === null)
      add("untaught-terms", "warn", "BRIEF.md or LESSON.md missing");
    else {
      const scaffoldTexts = hasScaffold
        ? walkFiles(scaffoldDir)
            .filter((rel) => /\.(md|json|txt|[cm]?[jt]sx?|py|ya?ml|csv)$/i.test(rel))
            .map((rel) => readText(path.join(scaffoldDir, rel)) ?? "")
        : [];
      const terms = untaughtTerms(brief, lesson, scaffoldTexts);
      if (terms.length)
        add(
          "untaught-terms",
          "warn",
          `${terms.length} term(s) the brief uses in \`code\` appear in neither LESSON.md nor the scaffold — define them before use or they are labels the learner must guess: ${terms.join(", ")}`,
        );
      else
        add(
          "untaught-terms",
          "ok",
          "every code-span term in BRIEF.md appears in LESSON.md or the scaffold",
        );
    }
  }

  // ---- STATIC 5 — checks contain no relative-timing anti-pattern ----
  if (!hasChecks) {
    add(
      "timing",
      hasAssessment && !hasScaffold ? "ok" : volatilePresent ? "fail" : "warn",
      hasAssessment && !hasScaffold
        ? "Assessment-only activity uses the canonical numeric checker."
        : volatilePresent
          ? "no checks/ directory"
          : "no checks/ yet (volatile layer not generated)",
    );
  } else {
    const files = walkFiles(checksDir)
      .filter((rel) => /\.(m?[jt]sx?)$/.test(rel))
      .map((rel) => ({ rel, text: readText(path.join(checksDir, rel)) }));
    const flagged = detectRelativeTiming(files);
    if (flagged.length > 0)
      add(
        "timing",
        "fail",
        `relative-timing assertion(s) — a duration compared to another measured duration flakes once earlier tests warm caches (CLAUDE.md check-design). Use a warm-up + absolute bound instead:\n    ${flagged.join("\n    ")}`,
      );
    else add("timing", "ok", "no relative-timing assertions in checks/");
  }

  // ---- STATIC 6 — quiz.md has 4–8 questions ----
  {
    const text = readText(path.join(moduleDir, "quiz.md"));
    if (text === null) add("quiz-count", "fail", "quiz.md not found");
    else {
      const n = (text.match(/^\s*\d+\.\s+\S/gm) || []).length;
      if (n >= 4 && n <= 8) add("quiz-count", "ok", `quiz.md has ${n} questions (4–8 expected)`);
      else add("quiz-count", "fail", `quiz.md has ${n} numbered question(s); the contract is 4–8`);
    }
  }

  // ---- STATIC 7 — lab.json: stock claims exist, visuals files exist ----
  labCheck();

  // ---- STATIC 8 — visuals HTML is self-contained (the serve-time CSP blocks network) ----
  {
    const htmls = fs.existsSync(visualsDir)
      ? walkFiles(visualsDir).filter((f) => /\.html?$/i.test(f))
      : [];
    if (htmls.length === 0) add("visuals-csp", "ok", "no visuals/*.html to lint");
    else {
      const fails = [];
      const warns = [];
      for (const rel of htmls) {
        const text = readText(path.join(visualsDir, rel)) ?? "";
        const { external, relative, usesNetworkApi } = lintVisualHtml(text);
        if (external.length)
          fails.push(`${rel}: external reference(s) ${external.slice(0, 5).join(", ")}`);
        if (relative.length)
          warns.push(
            `${rel}: relative reference(s) ${relative.slice(0, 5).join(", ")} — must be inlined (nothing external is served)`,
          );
        if (usesNetworkApi)
          warns.push(
            `${rel}: uses a network API (fetch/XHR/WebSocket/…) — the CSP blocks all network, so it fails silently`,
          );
      }
      if (fails.length)
        add(
          "visuals-csp",
          "fail",
          `${fails.join("; ")}${warns.length ? "; " + warns.join("; ") : ""} — visuals must inline all assets (served under a network-blocking CSP)`,
        );
      else if (warns.length) add("visuals-csp", "warn", warns.join("; "));
      else
        add(
          "visuals-csp",
          "ok",
          `${htmls.length} visual(s) are self-contained (no external references)`,
        );
    }
  }

  // ---- STATIC 9 — scaffold has no git-tracked node_modules ----
  if (!hasScaffold) {
    add("scaffold-hygiene", "ok", "no scaffold/ — nothing to check for committed node_modules");
  } else {
    const ls = git(moduleDir, ["ls-files", "--", "scaffold"]);
    if (!ls.ok) {
      add(
        "scaffold-hygiene",
        "warn",
        "module is not under a git working tree — cannot check for committed node_modules (run against the in-repo module)",
      );
    } else {
      const tracked = ls.out.split(/\r?\n/).filter((l) => /(^|\/)node_modules\//.test(l));
      if (tracked.length) {
        add(
          "scaffold-hygiene",
          "fail",
          `${tracked.length} node_modules file(s) are git-tracked under scaffold/ — gitignore node_modules and untrack it (it bloats every clone)`,
        );
      } else if (fs.existsSync(path.join(scaffoldDir, "node_modules"))) {
        const ci = git(moduleDir, ["check-ignore", "-q", "scaffold/node_modules"]);
        if (ci.status === 0)
          add(
            "scaffold-hygiene",
            "ok",
            "scaffold/node_modules present but gitignored (not tracked) — fine",
          );
        else
          add(
            "scaffold-hygiene",
            "warn",
            "scaffold/node_modules present on disk and NOT gitignored — a stray `git add` would commit 100s of MB; add it to .gitignore",
          );
      } else {
        add("scaffold-hygiene", "ok", "no node_modules under scaffold/");
      }
    }
  }

  // ---- DYNAMIC — run the checks in throwaway copies ----
  runDynamic();

  render();
}

// Run only as a CLI; on import (tests) the pure heuristics above are used directly.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
