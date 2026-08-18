/**
 * The course lens's data: engine course files shaped into what the surface
 * renders. Adapted from the previous project's `lib/course-data.ts`; the Zod
 * schemas in `engine/schemas.ts` own every on-disk shape and this file never
 * restates one.
 *
 * Two deliberate departures from the old module:
 *
 * - There is NO course mode. The old app read a hosted `course.json` and gated
 *   affordances on `builder`/`seminar`; ADR-013 replaces that with per-module
 *   presence facts (`hasChecks`, `hasScaffold`, `hasVisual`) read off what the
 *   course files actually contain.
 * - Assembly is synchronous over a `CourseFileMap` the caller gathers. The main
 *   process feeds it from disk; tests feed it from memory. No transport lives
 *   here.
 *
 * Everything tolerates a partly-built course, because that is the normal state:
 * a brand-new course has no COURSE.md, no curriculum/, an empty bank and an
 * empty journal. One malformed module manifest costs that module's row, not
 * the whole surface.
 */

import {
  moduleManifestSchema,
  progressSchema,
  quizBankSchema,
  type ModuleManifest,
  type Progress,
  type QuizItem,
} from "./engine/schemas";
import stockLabManifest from "../../course-engine/template/docs/stock-labs.json" with { type: "json" };

export type ModuleStatus = "completed" | "in-progress" | "not-started";
/** The four grades. The engine's `rescheduled` history entry is bookkeeping,
 *  not a grade, and never reaches the UI. */
export type RecallResult = "correct" | "partial" | "wrong" | "tutored";

export interface CourseModule {
  id: string;
  title: string;
  phase: number;
  phaseName: string;
  runtime: string;
  estimatedHours: number;
  status: ModuleStatus;
  /** a boss check gates the end of a phase */
  bossCheck: boolean;
  /** the module claims a stock lab or ships an HTML visual (lab.json) */
  hasVisual: boolean;
  /** the scaffold's package.json exposes a runnable `check` script — the
   *  engine's own "has checks" test, and the Run-checks affordance gate */
  hasChecks: boolean;
  /** the module has a scaffold/ directory — the open-in-editor affordance gate */
  hasScaffold: boolean;
  checkAttempts: number;
  hintsUsed: string[];
  /** the tutor's own prose note from progress.json — deliberately long */
  note?: string;
  /** course-relative paths of this module's reading material, when they exist */
  lessonPath: string | null;
  briefPath: string | null;
  /** The module's own retrieval questions (the engine's `quiz.md`: "4–8
   *  retrieval questions"). Distinct from the SCHEDULED bank slice, which is
   *  the tutor's state rather than the module's material — the Quiz tab shows
   *  the document first and the schedule under it. */
  quizPath: string | null;
}

export interface CourseQuizItem {
  id: string;
  module: string;
  question: string;
  interval: number;
  due: string;
  history: { date: string; result: RecallResult; note: string }[];
}

export interface CourseJournalEntry {
  date: string;
  title: string;
  body: string;
}

export interface CourseLabEntry {
  key: string;
  title: string;
  blurb: string;
  /** every module that claims this visualization */
  modules: string[];
  /** for HTML visuals: the claiming module and file inside its visuals/ */
  visual?: { moduleId: string; file: string };
}

export interface CourseData {
  currentModuleId: string | null;
  learner: { profile: string; paceHoursPerWeek: string; started: string };
  modules: CourseModule[];
  /** Module directories present on disk whose manifest the engine contract rejected. */
  unreadableModuleIds: string[];
  quiz: CourseQuizItem[];
  journal: CourseJournalEntry[];
  labs: CourseLabEntry[];
  /** Each readable module's parsed lab.json, verbatim — the stock labs read
   *  their per-module configuration out of these. */
  labClaims: { moduleId: string; lab: unknown }[];
  /** COURSE.md — the arc, once onboarding has proposed one. */
  courseDoc: string | null;
  /** The course's own name, as the tutor wrote it into COURSE.md. Null until
   *  onboarding has written the arc — before that a course has only a folder
   *  name, which is the learner's rough words rather than the course's title. */
  title: string | null;
  /** Every course-relative path the walk saw, so the surface can tell
   *  "not written yet" from "not fetched". */
  files: string[];
}

/** Documents fetched on demand, keyed by course-relative path. */
export type CourseDocs = Record<string, string>;

/**
 * What assembly consumes. `files` is the bounded walk (forward-slash relative
 * paths, node_modules and dot-directories excluded); `contents` carries the
 * small files assembly parses. Reading LESSON/BRIEF stays on demand.
 */
export interface CourseFileMap {
  files: readonly string[];
  contents: Readonly<Record<string, string>>;
}

/** The Course Engine manifest is the single source of stock-lab display facts.
 *  The renderer maps these ids to the app-owned React implementations. */
export const STOCK_LABS: { key: string; title: string; blurb: string }[] =
  stockLabManifest.labs.map(({ id, title, blurb }) => ({ key: id, title, blurb }));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  try {
    // Tolerate a UTF-8 BOM: learner-edited files on Windows often carry one.
    return JSON.parse(text.replace(/^\uFEFF/, "")) as unknown;
  } catch {
    return null;
  }
}

/** The module directories the course has, in curriculum order. */
export function moduleDirectories(files: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const file of files) {
    const match = /^curriculum\/([^/]+)\/module\.json$/.exec(file);
    if (match?.[1] !== undefined) seen.add(match[1]);
  }
  return [...seen].sort((left, right) => left.localeCompare(right));
}

/** The engine's own "has checks" test (study/server/helpers.ts): only a string
 *  `scripts.check` in the scaffold's package.json counts. */
export function hasRunnableCheck(pkg: unknown): boolean {
  if (!isRecord(pkg)) return false;
  const scripts = pkg.scripts;
  if (!isRecord(scripts)) return false;
  return typeof scripts.check === "string";
}

/**
 * `rescheduled` history entries are dropped here rather than downstream.
 *
 * They are bookkeeping, not grades — the engine's format notes are explicit
 * that a reader must never treat one as a grade. A bank migrated from that era
 * would otherwise paint a recall mark for a day the learner was never asked
 * anything, and it would be the LAST mark, so it would be the one on screen.
 */
function quizItems(bank: { items: QuizItem[] }): CourseQuizItem[] {
  return bank.items.map((item) => ({
    id: item.id,
    module: item.module,
    question: item.question,
    interval: item.interval,
    due: item.due,
    history: item.history.flatMap((entry) =>
      entry.result === "rescheduled"
        ? []
        : [{ date: entry.date, result: entry.result, note: entry.note ?? "" }],
    ),
  }));
}

/**
 * Split `tutor/journal.md` into entries.
 *
 * The file is append-only prose with `## YYYY-MM-DD — Title` headings, a
 * preamble above the first one, and `---` rules between entries. Everything
 * before the first heading is the file's own explanation of itself and is not
 * an entry.
 */
export function parseJournal(markdown: string): CourseJournalEntry[] {
  const entries: CourseJournalEntry[] = [];
  const heading = /^## (\d{4}-\d{2}-\d{2}(?:\/\d{1,2})?)[ \t]*(?:—|-|–)?[ \t]*(.*)$/;
  let current: CourseJournalEntry | null = null;
  const body: string[] = [];

  const flush = () => {
    if (current === null) return;
    entries.push({
      ...current,
      body: body
        .join("\n")
        .replace(/\n*(?:---\s*)?$/, "")
        .trim(),
    });
    body.length = 0;
  };

  for (const line of markdown.split(/\r?\n/)) {
    const match = heading.exec(line);
    if (match?.[1] !== undefined) {
      flush();
      current = { date: match[1], title: (match[2] ?? "").trim(), body: "" };
      continue;
    }
    if (current !== null) body.push(line);
  }
  flush();
  // Newest first: the file grows downwards, the reader wants the last session.
  return entries.reverse();
}

/**
 * The course's name out of COURSE.md's first heading.
 *
 * The engine's format documents the line as `# COURSE.md — <course name>`, and
 * every real course writes it that way, so the file-name half is stripped: a
 * dashboard reading "COURSE.md — Typed REST APIs" would be showing the reader
 * our plumbing. A heading in any other shape is taken at face value, and a
 * heading that is only the file name yields nothing rather than a placeholder.
 */
export function courseTitle(markdown: string | null): string | null {
  if (markdown === null) return null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^#[ \t]+(.+?)[ \t]*$/.exec(line);
    if (heading?.[1] === undefined) continue;
    const named = /^COURSE\.md[ \t]*(?:—|–|-|:)[ \t]*(.+)$/.exec(heading[1]);
    const title = (named?.[1] ?? heading[1]).trim();
    return title === "" || /^COURSE\.md$/i.test(title) ? null : title;
  }
  return null;
}

function moduleFrom(
  manifest: ModuleManifest,
  progress: Progress,
  lab: unknown,
  input: CourseFileMap,
  present: ReadonlySet<string>,
): CourseModule {
  const state = progress.modules[manifest.id];
  const labKeys = isRecord(lab) ? lab : {};
  const hasStockLab = STOCK_LABS.some((entry) => entry.key in labKeys);
  const hasHtmlVisual = Array.isArray(labKeys.visuals) && labKeys.visuals.length > 0;
  const lessonPath = `curriculum/${manifest.id}/LESSON.md`;
  const briefPath = `curriculum/${manifest.id}/BRIEF.md`;
  const quizPath = `curriculum/${manifest.id}/quiz.md`;
  const scaffoldPrefix = `curriculum/${manifest.id}/scaffold/`;
  const scaffoldPkg = parseJson(input.contents[`${scaffoldPrefix}package.json`] ?? "");
  const note = state?.notes ?? "";

  return {
    id: manifest.id,
    title: manifest.title,
    phase: manifest.phase,
    phaseName: manifest.phaseName ?? `Phase ${String(manifest.phase)}`,
    runtime: manifest.runtime,
    estimatedHours: manifest.estimatedHours,
    status: state?.status ?? "not-started",
    bossCheck: manifest.bossCheck ?? false,
    hasVisual: hasStockLab || hasHtmlVisual,
    hasChecks: hasRunnableCheck(scaffoldPkg),
    hasScaffold: input.files.some((file) => file.startsWith(scaffoldPrefix)),
    checkAttempts: state?.checkAttempts ?? 0,
    hintsUsed: state?.hintsUsed ?? [],
    ...(note === "" ? {} : { note }),
    lessonPath: present.has(lessonPath) ? lessonPath : null,
    briefPath: present.has(briefPath) ? briefPath : null,
    quizPath: present.has(quizPath) ? quizPath : null,
  };
}

function labEntries(claims: { moduleId: string; lab: unknown }[]): CourseLabEntry[] {
  const entries = new Map<string, CourseLabEntry>();
  for (const { moduleId, lab } of claims) {
    if (!isRecord(lab)) continue;
    for (const stock of STOCK_LABS) {
      if (!(stock.key in lab)) continue;
      const existing = entries.get(stock.key);
      if (existing === undefined) entries.set(stock.key, { ...stock, modules: [moduleId] });
      else existing.modules.push(moduleId);
    }
    const visuals = Array.isArray(lab.visuals) ? lab.visuals : [];
    for (const visual of visuals) {
      if (
        !isRecord(visual) ||
        typeof visual.file !== "string" ||
        typeof visual.title !== "string"
      ) {
        continue; // one malformed entry must not brick the lab
      }
      const file = visual.file.replace(/^visuals\//, "");
      entries.set(`${moduleId}/${file}`, {
        key: `${moduleId}/${file}`,
        title: visual.title,
        blurb: typeof visual.blurb === "string" ? visual.blurb : "",
        modules: [moduleId],
        visual: { moduleId, file },
      });
    }
  }
  return [...entries.values()];
}

/** The whole lab.json object a stock lab receives when opened from a module
 *  that claims it (labs read their own key out of it) — or null when the
 *  module doesn't claim, in which case the lab runs on its own defaults
 *  rather than borrowing another module's framing (the study's configFor). */
export function stockLabConfig(
  claims: readonly { moduleId: string; lab: unknown }[],
  stockKey: string,
  moduleId: string | null,
): unknown {
  const claim = claims.find((entry) => entry.moduleId === moduleId);
  if (claim === undefined || !isRecord(claim.lab)) return null;
  return stockKey in claim.lab ? claim.lab : null;
}

/** A module's lab.json focus note + focusLab pointer, when present. */
export function labFocus(
  claims: readonly { moduleId: string; lab: unknown }[],
  moduleId: string | null,
): { focus: string | null; focusLab: string | null } {
  const claim = claims.find((entry) => entry.moduleId === moduleId);
  if (claim === undefined || !isRecord(claim.lab)) return { focus: null, focusLab: null };
  return {
    focus: typeof claim.lab.focus === "string" ? claim.lab.focus : null,
    focusLab: typeof claim.lab.focusLab === "string" ? claim.lab.focusLab : null,
  };
}

export function assembleCourseData(input: CourseFileMap): CourseData {
  const files = [...input.files];
  const present = new Set(files);
  const directories = moduleDirectories(files);
  const read = (path: string): string | null =>
    present.has(path) ? (input.contents[path] ?? null) : null;

  const parsedProgress = progressSchema.safeParse(parseJson(read("tutor/progress.json") ?? ""));
  const progress: Progress = parsedProgress.success
    ? parsedProgress.data
    : {
        learner: { profile: "", paceHoursPerWeek: "", started: "" },
        currentModule: null,
        modules: {},
      };
  const parsedQuiz = quizBankSchema.safeParse(parseJson(read("tutor/quiz-bank.json") ?? ""));
  const journalText = read("tutor/journal.md");
  const courseDoc = read("COURSE.md");

  const claims: { moduleId: string; lab: unknown }[] = [];
  const modules: CourseModule[] = [];
  const unreadableModuleIds: string[] = [];
  for (const id of directories) {
    const parsed = moduleManifestSchema.safeParse(
      parseJson(read(`curriculum/${id}/module.json`) ?? ""),
    );
    if (!parsed.success || parsed.data.id !== id) {
      unreadableModuleIds.push(id);
      continue; // one bad manifest costs its row, not the rail
    }
    const labText = read(`curriculum/${id}/lab.json`);
    const lab = labText === null ? null : parseJson(labText);
    claims.push({ moduleId: parsed.data.id, lab });
    modules.push(moduleFrom(parsed.data, progress, lab, input, present));
  }

  return {
    currentModuleId: progress.currentModule,
    learner: progress.learner,
    modules,
    unreadableModuleIds,
    quiz: parsedQuiz.success ? quizItems(parsedQuiz.data) : [],
    journal: journalText === null ? [] : parseJournal(journalText),
    labs: labEntries(claims),
    labClaims: claims,
    courseDoc,
    title: courseTitle(courseDoc),
    files,
  };
}

/** Whole days between `due` and today. Positive means overdue. */
export function daysOverdue(due: string, today: Date = new Date()): number {
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((midnight - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
}

/** The items due on or before today, most overdue first — the order the tutor
 *  drains them in, and the count the record chip carries. */
export function dueItems(quiz: readonly CourseQuizItem[], today?: Date): CourseQuizItem[] {
  return quiz
    .filter((item) => daysOverdue(item.due, today) >= 0)
    .sort((left, right) => daysOverdue(right.due, today) - daysOverdue(left.due, today));
}
