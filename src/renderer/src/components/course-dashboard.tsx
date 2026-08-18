import { useState, type FormEvent, type ReactNode } from "react";
import type { DashboardCourse } from "../../../shared/ipc";
import { CHIP, GHOST, LINKISH, PRIMARY, QUIET } from "./controls";
import { ChevronLeftGlyph, SpinnerGlyph } from "./glyphs";

type ActionResult = Promise<string | null>;

export function CourseDashboard({
  courses,
  defaultParentDirectory,
  initialError,
  onOpen,
  onLocate,
  onForget,
  onOpenFolder,
  onCreate,
  tutorControl,
}: {
  courses: DashboardCourse[];
  defaultParentDirectory: string;
  initialError: string | null;
  onOpen: (courseId: string) => ActionResult;
  onLocate: (courseId: string) => ActionResult;
  onForget: (courseId: string) => ActionResult;
  onOpenFolder: () => ActionResult;
  onCreate: (name: string, parentDirectory: string) => ActionResult;
  tutorControl: ReactNode;
}): React.JSX.Element {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (action: () => ActionResult): Promise<void> => {
    if (pending) return;
    setPending(true);
    setActionError(null);
    try {
      setActionError(await action());
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "That course action could not be completed.",
      );
    } finally {
      setPending(false);
    }
  };

  const create = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (name.trim() === "") return;
    void run(() => onCreate(name.trim(), defaultParentDirectory));
  };

  const error = actionError ?? initialError;

  /* First run asks the product's own first question and takes the answer. It
     does not pitch: the person has already downloaded, installed and opened the
     app, so this surface owes them a way to start, not an argument. */
  /* One question, centred in the window, and nothing else on screen. No rules:
     a divider separates things that compete, and here the heading, the field
     and the one quiet way out are a single thought. Spacing does that job. */
  if (courses.length === 0 || creating) {
    return (
      <section
        className="relative flex flex-1 flex-col items-center justify-center px-10 pb-16"
        aria-label="Start a course"
      >
        {/* Top left, where a way back belongs, and absolutely positioned so it
            cannot pull the one centred question off centre (the centring was
            measured in round 12 and is worth keeping). It only exists when
            there is something to go back TO. */}
        {creating ? (
          <button
            type="button"
            className={`${GHOST} absolute top-4 left-4 text-sm`}
            disabled={pending}
            onClick={() => {
              setCreating(false);
              setActionError(null);
            }}
          >
            <ChevronLeftGlyph className="size-3.5 shrink-0" />
            <span>Your courses</span>
          </button>
        ) : null}
        <div className="absolute top-4 right-4">{tutorControl}</div>
        <div className="w-full max-w-(--container-start) text-center">
          <h1 className="text-hi text-3xl font-bold tracking-tight text-balance">
            What do you want to learn?
          </h1>
          <p className="text-ink-dim mx-auto mt-3 max-w-prose text-md text-balance">
            Your tutor interviews you first, then proposes an arc before writing anything.
          </p>

          {/* The field is a folder name, and says so, because course creation
              must work with no provider at all (ADR-004): nothing may wait on a
              model to name a folder. The real title arrives during onboarding,
              written by the tutor into COURSE.md, and every surface prefers it
              from then on — so a rough answer here costs the learner nothing.

              Both controls carry the same height token: they share a line, so a
              button shorter than its own field reads as a mistake. */}
          <form className="mt-8 flex items-stretch gap-2" onSubmit={create}>
            <label className="sr-only" htmlFor="course-name">
              Course name
            </label>
            <input
              id="course-name"
              className="bg-surface-input border-line-strong text-hi placeholder:text-ink-faint focus:outline-focus h-11 min-w-0 flex-1 rounded-pill border px-5 text-md focus:border-transparent focus:outline-2 focus:-outline-offset-1"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder='Name it, ex. "Applied AI systems"'
              disabled={pending}
            />
            <button
              type="submit"
              className={`${PRIMARY} flex h-11 shrink-0 items-center gap-2 text-md`}
              disabled={pending || name.trim() === ""}
            >
              {pending ? <SpinnerGlyph className="animate-spin size-4 shrink-0" /> : null}
              {pending ? "Creating…" : "Create course"}
            </button>
          </form>

          {error === null ? null : (
            <p className="text-bad mt-4 text-sm" role="alert">
              {error}
            </p>
          )}

          {/* The way BACK moved to the top-left corner; this line keeps only
              the way SIDEWAYS, which is genuinely fine print — almost nobody
              has a course folder on first run. */}
          {creating ? null : (
            <p className="mt-7">
              <span className="text-ink-dim mr-1.5 text-sm">Already have a course folder?</span>
              <button
                type="button"
                className={LINKISH}
                disabled={pending}
                onClick={() => void run(onOpenFolder)}
              >
                Open it
              </button>
            </p>
          )}
        </div>
      </section>
    );
  }

  const [recent, ...rest] = courses;

  return (
    <section
      className="mx-auto flex w-full max-w-(--container-page) flex-1 flex-col p-8"
      aria-label="Your courses"
    >
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-hi text-2xl font-bold tracking-tight">Your courses</h1>
        <div className="flex items-center gap-2">
          {tutorControl}
          <button
            type="button"
            className={`${QUIET} text-sm`}
            disabled={pending}
            onClick={() => void run(onOpenFolder)}
          >
            Open a course folder
          </button>
          <button
            type="button"
            className={`${PRIMARY} text-sm`}
            disabled={pending}
            onClick={() => {
              setName("");
              setActionError(null);
              setCreating(true);
            }}
          >
            New course
          </button>
        </div>
      </header>

      {error === null ? null : (
        <p className="text-bad border-bad mb-3 border-l-2 py-1 pl-3 text-sm" role="alert">
          {error}
        </p>
      )}

      {recent === undefined ? null : (
        <CourseCard
          course={recent}
          lead
          pending={pending}
          onOpen={onOpen}
          onLocate={onLocate}
          onForget={onForget}
          run={run}
        />
      )}

      {rest.length === 0 ? null : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {rest.map((course) => (
            <CourseCard
              key={course.courseId}
              course={course}
              pending={pending}
              onOpen={onOpen}
              onLocate={onLocate}
              onForget={onForget}
              run={run}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function CourseCard({
  course,
  lead = false,
  pending,
  onOpen,
  onLocate,
  onForget,
  run,
}: {
  course: DashboardCourse;
  lead?: boolean;
  pending: boolean;
  onOpen: (courseId: string) => ActionResult;
  onLocate: (courseId: string) => ActionResult;
  onForget: (courseId: string) => ActionResult;
  run: (action: () => ActionResult) => Promise<void>;
}): React.JSX.Element {
  /* The learning facts exist only when the folder is actually there: the type
     is a union for exactly that reason, so narrow once rather than defaulting
     each field and pretending a missing course has zero modules. */
  const facts = course.available
    ? {
        title: course.title,
        done: course.completedModules,
        total: course.totalModules,
        due: course.dueCount,
        onboarding: course.onboarding,
        currentModuleId: course.currentModuleId,
      }
    : null;
  const onboarding = facts?.onboarding ?? false;

  return (
    <article
      /* Full literal class strings on both branches: Tailwind scans source text,
         so an interpolated class name compiles to nothing. */
      className={
        lead
          ? "bg-surface-raised border-line hover:border-line-strong flex flex-wrap items-stretch justify-between gap-7 rounded-lg border p-6 transition-colors"
          : "bg-surface-panel border-line hover:border-line-strong flex flex-col gap-2.5 rounded-lg border p-5 transition-colors"
      }
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {/* The course's own name once it has one: the folder name is what the
              learner typed in a hurry, the title is what the course became. */}
          <h2 className={`text-hi font-bold tracking-tight ${lead ? "text-xl" : "text-lg"}`}>
            {facts?.title ?? course.folderName}
          </h2>
          {!course.available ? (
            <span className={`${CHIP} text-warn bg-warn/10`}>moved</span>
          ) : onboarding ? (
            <span className={`${CHIP} text-ink-dim bg-accent-wash`}>not started</span>
          ) : null}
        </div>

        {facts !== null ? (
          <>
            <span className="text-ink-dim text-sm">
              {onboarding ? (
                "The arc is unwritten. Your tutor interviews you first."
              ) : (
                <>
                  Current module{" "}
                  <b className="text-ink font-medium">{facts.currentModuleId ?? "none yet"}</b>
                </>
              )}
            </span>
            {facts.total > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className="bg-accent-wash rounded-pill h-1 w-48 overflow-hidden">
                  <i
                    className="bg-accent block h-full"
                    style={{
                      width: `${String(Math.round((facts.done / facts.total) * 100))}%`,
                    }}
                  />
                </span>
                <span className="text-ink-faint font-data text-2xs tabular-nums">
                  {facts.done} of {facts.total} modules
                </span>
                {facts.due > 0 ? (
                  <span className={`${CHIP} text-attention bg-attention/10`}>{facts.due} due</span>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-ink-dim text-sm text-pretty">
              This folder is not where it used to be. Point at it again to keep its session history,
              or remove just this shortcut. Nothing is deleted either way.
            </p>
            <span className="text-ink-faint font-data text-2xs break-all">{course.rootPath}</span>
          </>
        )}
      </div>

      <div
        className={
          lead ? "flex flex-col items-end justify-between gap-3" : "mt-auto flex gap-2 pt-2"
        }
      >
        {lead ? (
          <span className="text-ink-faint font-data text-2xs">
            opened {formatDate(course.lastOpenedAt)}
          </span>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {course.available ? (
            <button
              type="button"
              className={lead && !onboarding ? `${PRIMARY} text-md` : `${QUIET} text-sm`}
              disabled={pending}
              onClick={() => void run(() => onOpen(course.courseId))}
            >
              {onboarding ? "Begin onboarding" : lead ? "Continue" : "Open"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`${QUIET} text-sm`}
                disabled={pending}
                onClick={() => void run(() => onLocate(course.courseId))}
              >
                Locate folder
              </button>
              <button
                type="button"
                className={`${QUIET} text-sm`}
                disabled={pending}
                onClick={() => void run(() => onForget(course.courseId))}
              >
                Remove from list
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function formatDate(timestamp: string): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.valueOf())
    ? "previously"
    : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
