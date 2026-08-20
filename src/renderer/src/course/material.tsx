/* The material pane — the lit page in the middle of the workspace.
 *
 * MODULE-scoped: everything here answers "what is on this page?". Journal and
 * progress are course-level records and live in the record overlay; the Quiz
 * tab here shows only THIS module's material and its slice of the bank.
 *
 * Three changes from the prototype, beyond the migration to utilities:
 *
 * - The tabs are a real tab list (Radix), so arrow keys move between them and
 *   each panel is wired to the tab that owns it. They looked like tabs before
 *   and behaved like three buttons.
 * - `quiz.md` renders (STATUS ledger #5). The module's own retrieval questions
 *   are MATERIAL — the engine's format calls them "4–8 retrieval questions" and
 *   files them beside LESSON and BRIEF. What the bank holds is the tutor's
 *   SCHEDULE over them, which is a different fact, so the tab shows the
 *   document first and the schedule under it.
 * - One column governs the pane. Per-element `ch` measures were giving the
 *   serif prose and the sans rows different widths and so different left edges.
 */

import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useRef, useState } from "react";
import {
  daysOverdue,
  type CourseDocs,
  type CourseLabEntry,
  type CourseModule,
  type CourseQuizItem,
} from "../../../shared/course-data";
import type { CheckRunSummary } from "../../../shared/session";
import { CHIP, QUIET } from "../components/controls";
import { DiamondGlyph, PlayGlyph, SpinnerGlyph } from "../components/glyphs";
import { CourseMarkdown, DocMarkdown } from "../components/markdown-view";
import { Dismiss } from "../components/notice";
import { RecallMark } from "./recall-mark";

export type MaterialTab = "lesson" | "brief" | "quiz" | "visual";

type CheckRun =
  | { moduleId: string; phase: "running" }
  | { moduleId: string; phase: "done"; result: CheckRunSummary }
  | { moduleId: string; phase: "error"; detail: string };

export function EmptyNote({ title, desc }: { title: string; desc: string }): React.JSX.Element {
  return (
    <div className="mx-auto flex max-w-(--container-start) flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-hi font-course text-lg font-semibold text-balance">{title}</p>
      <p className="text-ink-dim text-sm leading-normal text-pretty">{desc}</p>
    </div>
  );
}

/** The pane's frame: sticky head, one scrolling column. Shared by the real
 *  pane and by the arc-only view a module-less course gets, so the two can
 *  never drift apart in geometry. */
function Pane({
  head,
  children,
  bodyRef,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  return (
    <section
      className="bg-surface-read @container flex min-h-0 min-w-0 flex-1 flex-col"
      aria-label="Course material"
    >
      {/* `overflow-hidden` is a guard, not a layout: the head's contents are
          all `whitespace-nowrap`, so without it a narrow pane paints them
          straight over the seam and into the seminar column. Clipped at the
          pane's own edge, a squeeze looks like a squeeze. */}
      <div className="border-line-soft bg-surface-read/92 flex h-12 shrink-0 items-center gap-4 overflow-hidden border-b px-6 backdrop-blur-(--blur-chrome) @max-pane:gap-2 @max-pane:px-4">
        {head}
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">
        {/* Gutters OUTSIDE the measure. `box-sizing: border-box` is on
            everything (base.css), so padding on the same element as the
            max-width eats the measure — the reading column came out 48px
            narrow, which is the whole difference between 68 and 62 characters
            a line. Two elements: one pads, one measures. */}
        <div className="px-6 pt-8 pb-16 @max-pane:px-4 @max-pane:pt-5 @max-pane:pb-10">
          <div className="mx-auto w-full max-w-(--container-read)">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** A tab is a rule under a word: no track, no pill. The rule is a real element
 *  rather than a border so it can be the accent without moving the baseline.
 *
 *  `group` is load-bearing: Radix puts `data-state` on the TRIGGER, so a
 *  `data-[state=active]:` utility on the child span matches nothing and the
 *  rule never appears at all. It shipped that way and only turned up when the
 *  record overlay needed the same idiom. */
function Tab({ value, label }: { value: MaterialTab; label: string }): React.JSX.Element {
  return (
    <Tabs.Trigger
      value={value}
      className="group text-ink-faint hover:text-ink data-[state=active]:text-hi focus-visible:outline-focus relative flex items-center rounded-xs px-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4"
    >
      {label}
      <span className="bg-accent absolute inset-x-0 -bottom-px hidden h-(--stroke) rounded-pill group-data-[state=active]:block" />
    </Tabs.Trigger>
  );
}

/**
 * A course with no modules yet is not a course with everything missing — it is
 * a course whose arc is still being written. Reachable only when a module-less
 * course somehow lands in the course view; onboarding owns that state normally.
 */
function UnwrittenCourse({ courseDoc }: { courseDoc: string | null }): React.JSX.Element {
  return (
    <Pane
      head={<p className="text-hi py-3.5 text-sm font-medium">The arc</p>}
      children={
        courseDoc === null ? (
          <EmptyNote
            title="Nothing written yet"
            desc="Your tutor interviews you first. What you decide together lands here as an arc, then as modules on the track."
          />
        ) : (
          <CourseMarkdown className="prose max-w-none" markdown={courseDoc} />
        )
      }
    />
  );
}

/** What a check run produced, as a card rather than a log line. Dismissible,
 *  because the result is ephemeral by design (ADR-005: it never touches
 *  progress) and a stale green banner over a module you have since changed is
 *  worse than no banner. */
function CheckResult({ run, onDismiss }: { run: CheckRun; onDismiss: () => void }) {
  const outcome = run.phase === "done" ? run.result.outcome : run.phase;
  const good = outcome === "pass";
  return (
    <div
      className={
        good
          ? "border-line border-l-ok bg-surface-panel mb-8 rounded-lg border border-l-2 p-4"
          : run.phase === "running"
            ? "border-line bg-surface-panel mb-8 rounded-lg border p-4"
            : "border-line border-l-bad bg-surface-panel mb-8 rounded-lg border border-l-2 p-4"
      }
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {run.phase === "running" ? (
            <p className="text-ink-dim flex items-center gap-2 text-sm">
              <SpinnerGlyph className="text-ink-faint animate-spin size-3.5" />
              Running this module&rsquo;s checks…
            </p>
          ) : run.phase === "error" ? (
            <p className="text-ink text-sm leading-normal text-pretty">{run.detail}</p>
          ) : (
            <>
              <p
                className={good ? "text-ok text-md font-semibold" : "text-hi text-md font-semibold"}
              >
                {run.result.outcome === "pass"
                  ? `All ${String(run.result.passed)} checks passed`
                  : run.result.outcome === "fail"
                    ? `${String(run.result.failed)} of ${String(run.result.total)} checks failed`
                    : run.result.detail}
              </p>
              {run.result.failedNames?.length ? (
                <ul className="mt-2.5 flex flex-col gap-1.5">
                  {run.result.failedNames.map((name) => (
                    <li
                      key={name}
                      className="text-ink-dim font-data flex items-start gap-2 text-2xs"
                    >
                      <span className="bg-bad mt-1.5 size-1 shrink-0 rounded-pill" aria-hidden />
                      <span className="break-words">{name}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
        {run.phase === "running" ? null : (
          <Dismiss label="Dismiss the check result" onDismiss={onDismiss} />
        )}
      </div>
    </div>
  );
}

/** This module's slice of the bank: what is scheduled, when, and how it went
 *  last time. Not a test — the tutor asks these in conversation. */
function QuizSchedule({ items }: { items: CourseQuizItem[] }): React.JSX.Element {
  return (
    <div className="flex flex-col">
      {items.map((item) => {
        const over = daysOverdue(item.due);
        const last = item.history.at(-1);
        return (
          <article
            key={item.id}
            className="border-line-soft flex flex-col gap-1.5 border-t py-3.5 first:border-t-0"
          >
            <div className="flex items-baseline gap-3">
              <RecallMark result={last?.result ?? null} className="mt-1.5 shrink-0" />
              <p className="font-course text-ink min-w-0 flex-1 text-md leading-normal text-pretty">
                {item.question}
              </p>
              <span
                className={
                  over > 0
                    ? "text-warn shrink-0 text-2xs tabular-nums"
                    : "text-ink-faint shrink-0 text-2xs tabular-nums"
                }
              >
                {over > 0 ? `${String(over)}d overdue` : `due ${item.due}`}
              </span>
            </div>
            {last === undefined ? null : (
              <p className="text-ink-dim flex flex-wrap items-baseline gap-x-2 gap-y-1 pl-6 text-xs">
                <span className="text-ink-faint">last time</span>
                <span>{last.note}</span>
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function MaterialPane({
  activeModule,
  docs,
  quiz,
  labs,
  courseDoc,
  tab,
  onTab,
  onOpenLab,
}: {
  activeModule: CourseModule | null;
  docs: CourseDocs;
  quiz: CourseQuizItem[];
  labs: CourseLabEntry[];
  courseDoc: string | null;
  tab: MaterialTab;
  onTab: (tab: MaterialTab) => void;
  onOpenLab: (key: string) => void;
}): React.JSX.Element {
  // Scroll belongs to the DOCUMENT, not to the pane: opening a different module
  // or tab starts at its top, while a tutor write under you changes neither and
  // so leaves your place alone. Declared above the early return — hooks cannot
  // hide behind a branch.
  const body = useRef<HTMLDivElement>(null);
  const [checkRun, setCheckRun] = useState<CheckRun | null>(null);
  const documentKey = `${activeModule?.id ?? ""}:${tab}`;
  useEffect(() => {
    if (body.current !== null) body.current.scrollTop = 0;
  }, [documentKey]);
  useEffect(() => {
    setCheckRun(null);
  }, [activeModule?.id]);

  if (activeModule === null) return <UnwrittenCourse courseDoc={courseDoc} />;

  const moduleQuiz = quiz.filter((item) => item.module === activeModule.id);
  const moduleVisuals = labs.filter((entry) => entry.modules.includes(activeModule.id));
  const lesson = activeModule.lessonPath === null ? null : docs[activeModule.lessonPath];
  const brief = activeModule.briefPath === null ? null : docs[activeModule.briefPath];
  const quizPath = activeModule.quizPath;
  const quizDoc = quizPath === null ? null : (docs[quizPath] ?? null);

  // A dead tab is worse than a missing one, and the engine declares visuals per
  // module — so the Visual tab exists only where there is one. If the selected
  // tab is not on offer for this module, the lesson answers instead of nothing.
  const tabs: { id: MaterialTab; label: string }[] = [
    { id: "lesson", label: "Lesson" },
    { id: "brief", label: "Brief" },
    { id: "quiz", label: "Quiz" },
    ...(moduleVisuals.length > 0 ? [{ id: "visual" as const, label: "Visual" }] : []),
  ];
  const active = tabs.some((entry) => entry.id === tab) ? tab : "lesson";

  const doc = (
    content: string | null | undefined,
    pathPresent: boolean,
    missing: { title: string; desc: string },
  ): React.JSX.Element =>
    content !== undefined && content !== null ? (
      <DocMarkdown className="prose max-w-none" markdown={content} moduleId={activeModule.id} />
    ) : pathPresent ? (
      <EmptyNote title="Reading the course" desc="The file is on its way from disk." />
    ) : (
      <EmptyNote title={missing.title} desc={missing.desc} />
    );

  const runChecks = (): void => {
    setCheckRun({ moduleId: activeModule.id, phase: "running" });
    void window.praxeum.runChecks(activeModule.id).then(
      (reply) => {
        setCheckRun(
          reply.ok
            ? { moduleId: activeModule.id, phase: "done", result: reply.result }
            : { moduleId: activeModule.id, phase: "error", detail: reply.detail },
        );
      },
      (error: unknown) => {
        setCheckRun({
          moduleId: activeModule.id,
          phase: "error",
          detail: error instanceof Error ? error.message : "The checks could not run.",
        });
      },
    );
  };

  return (
    <Tabs.Root
      value={active}
      onValueChange={(next) => {
        onTab(next as MaterialTab);
      }}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      activationMode="automatic"
    >
      <Pane
        bodyRef={body}
        head={
          <>
            {/* Stretched to the head's height so the active rule lands exactly
                on the head's own bottom edge rather than floating above it. */}
            {/* The gap closes up in a squeezed pane rather than the row
                growing past its edge. No scroll container here: the active
                rule is drawn a pixel BELOW its trigger, and any overflow on
                the list clips it away. */}
            <Tabs.List
              className="flex items-stretch gap-5 self-stretch @max-pane:gap-3.5"
              aria-label="Course material"
            >
              {tabs.map((entry) => (
                <Tab key={entry.id} value={entry.id} label={entry.label} />
              ))}
            </Tabs.List>
            {/* Presence-based (ADR-013): the checks render because THIS
                module ships a runnable check script. Its other half — the
                handoff to the learner's own editor — sits in the seminar
                column's head, which has room the tab row does not. */}
            {activeModule.hasChecks ? (
              <button
                type="button"
                className={`${QUIET} ml-auto shrink-0 px-3 py-1.5 text-xs`}
                disabled={checkRun?.phase === "running"}
                onClick={runChecks}
              >
                {checkRun?.phase === "running" ? (
                  <SpinnerGlyph className="animate-spin size-3.5" />
                ) : (
                  <PlayGlyph className="size-3.5" />
                )}
                <span>{checkRun?.phase === "running" ? "Running…" : "Run checks"}</span>
              </button>
            ) : null}
          </>
        }
      >
        {checkRun === null || checkRun.moduleId !== activeModule.id ? null : (
          <CheckResult
            run={checkRun}
            onDismiss={() => {
              setCheckRun(null);
            }}
          />
        )}

        <Tabs.Content value="lesson">
          {doc(lesson, activeModule.lessonPath !== null, {
            title: "No lesson yet",
            desc: "Your tutor writes this module's lesson when you start it.",
          })}
        </Tabs.Content>

        <Tabs.Content value="brief">
          {doc(brief, activeModule.briefPath !== null, {
            title: "No brief yet",
            desc: "A brief states the build task and how long it should take. This module has not been given one.",
          })}
        </Tabs.Content>

        <Tabs.Content value="quiz">
          {quizPath === null && moduleQuiz.length === 0 ? (
            <EmptyNote
              title="Nothing to recall from this module yet"
              desc="A module ships a handful of retrieval questions, and your tutor schedules them as you finish it. Your whole backlog lives in your record."
            />
          ) : (
            <>
              {/* The module's OWN questions: material, written beside the
                  lesson, and the thing you should be able to answer. The
                  document is a bare list and nothing on it is interactive, so
                  an app-voice line says what it is FOR — now (check yourself
                  after the lesson) and later (the tutor schedules it when the
                  module completes). Before seeding that "later" is the only
                  sign the tab has a future; after, the schedule below is it,
                  and the line says so instead of promising it again. */}
              {quizPath === null ? null : quizDoc === null ? (
                <EmptyNote title="Reading the course" desc="The file is on its way from disk." />
              ) : (
                <>
                  <p className="text-ink-dim mb-8 max-w-(--container-start) text-sm leading-normal text-pretty">
                    This module&rsquo;s retrieval questions. After the lesson, try answering them
                    from memory — there is nothing to fill in here.{" "}
                    {moduleQuiz.length === 0
                      ? "When you finish the module, your tutor adds them to your schedule and asks them in conversation at the start of later sessions."
                      : "Your tutor has added them to your schedule below and asks them in conversation at the start of sessions."}
                  </p>
                  <CourseMarkdown className="prose max-w-none" markdown={quizDoc} />
                </>
              )}
              {moduleQuiz.length === 0 ? null : (
                <section className={quizPath === null ? "" : "border-line mt-10 border-t pt-8"}>
                  <h2 className="text-hi font-course text-lg font-semibold">Your schedule</h2>
                  <p className="text-ink-dim mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-normal text-pretty">
                    <span className={`${CHIP} bg-accent-wash text-accent`}>
                      {moduleQuiz.length}
                    </span>
                    <span>
                      seeded from this module. Your tutor works through these in conversation — this
                      is the queue, not a test.
                    </span>
                  </p>
                  <div className="mt-4">
                    <QuizSchedule items={moduleQuiz} />
                  </div>
                </section>
              )}
            </>
          )}
        </Tabs.Content>

        {moduleVisuals.length === 0 ? null : (
          <Tabs.Content value="visual">
            {/* A way IN to the lab rather than a second copy of it: the stage
                stays one central place (ADR-012). */}
            <div className="flex flex-col gap-4">
              {moduleVisuals.map((entry) => (
                <article
                  key={entry.key}
                  className="border-line flex flex-col items-start gap-2 rounded-lg border p-5"
                >
                  <h2 className="text-hi font-course flex items-center gap-2.5 text-lg font-semibold">
                    <DiamondGlyph className="text-ink-faint size-3.5 shrink-0" />
                    {entry.title}
                  </h2>
                  {entry.blurb === "" ? null : (
                    <p className="text-ink-dim text-sm leading-normal text-pretty">{entry.blurb}</p>
                  )}
                  <button
                    type="button"
                    className={`${QUIET} mt-1 px-3.5 py-1.5 text-sm`}
                    onClick={() => {
                      onOpenLab(entry.key);
                    }}
                  >
                    Open on the stage
                  </button>
                </article>
              ))}
            </div>
          </Tabs.Content>
        )}
      </Pane>
    </Tabs.Root>
  );
}
