/* The record — a read-only lens over everything the tutor keeps in `tutor/`
 * that the learner would otherwise never see: the quiz bank, the journal, and
 * progress. COURSE-scoped on purpose; the material pane separately shows the
 * current module's slice.
 *
 * The three sections were a 288px nav column holding three words. They are tabs
 * in the head row now (ADR-019), which gives the reading surface the whole
 * overlay and matches how the material pane already switches documents — one
 * idiom for "same surface, different document", in both places it happens. */

import * as Tabs from "@radix-ui/react-tabs";
import {
  daysOverdue,
  dueItems,
  type CourseData,
  type CourseModule,
  type CourseQuizItem,
  type ModuleStatus,
} from "../../../shared/course-data";
import { CourseMarkdown } from "../components/markdown-view";
import { EmptyNote } from "./material";
import { GRADE_WORD, RecallMark } from "./recall-mark";
import { OverlayShell } from "./overlay-shell";

export type RecordTab = "quiz" | "journal" | "progress";

interface Counts {
  due: number;
  entries: number;
  done: number;
  total: number;
}

const TABS: { id: RecordTab; label: string; count: (n: Counts) => string }[] = [
  { id: "quiz", label: "Quiz", count: (n) => `${String(n.due)} due` },
  { id: "journal", label: "Journal", count: (n) => `${String(n.entries)}` },
  { id: "progress", label: "Progress", count: (n) => `${String(n.done)}/${String(n.total)}` },
];

const TODAY = new Intl.DateTimeFormat("en", { day: "numeric", month: "long" });

/** Every section opens the same way: a title in the reading voice, one line of
 *  orientation under it. Declared once so the three cannot drift. */
function SectionHead({ title, lede }: { title: string; lede?: string }): React.JSX.Element {
  return (
    <header className="mb-8">
      <h3 className="text-hi font-course text-xl font-semibold text-balance">{title}</h3>
      {lede === undefined ? null : (
        <p className="text-ink-dim mt-2 text-sm leading-normal text-pretty">{lede}</p>
      )}
    </header>
  );
}

function QuizRow({ item }: { item: CourseQuizItem }): React.JSX.Element {
  const over = daysOverdue(item.due);
  const last = item.history.at(-1);
  return (
    <article className="border-line-soft flex flex-col gap-1.5 border-t py-4 first:border-t-0">
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
      <p className="text-ink-dim flex flex-wrap items-baseline gap-x-2.5 gap-y-1 pl-6 text-xs">
        <span className="text-ink-faint font-data text-2xs">{item.module}</span>
        {last === undefined ? (
          <span>Never asked — seeded, waiting for its first outing.</span>
        ) : (
          <>
            <span className="text-ink-faint">{GRADE_WORD[last.result]}</span>
            <span className="min-w-0">{last.note}</span>
          </>
        )}
      </p>
    </article>
  );
}

/** "1 hint", not "1 hints". English is not optional because the number is
 *  usually small — the singular case is the COMMON one here. */
function count(n: number, noun: string): string {
  return `${String(n)} ${noun}${n === 1 ? "" : "s"}`;
}

const STATUS_WORD: Record<ModuleStatus, string> = {
  completed: "complete",
  "in-progress": "in progress",
  "not-started": "not started",
};

/**
 * One module's record.
 *
 * The first cut laid four different KINDS of fact on one baseline at one
 * weight — an id, a status, two counts, and a paragraph of the tutor's prose —
 * so nothing led and the interesting part (the note) read as more furniture.
 * Three tiers now: the module's TITLE leads, because a
 * directory name is data and not a heading; the id and counts drop to a mono
 * meta line; and the tutor's note is set off as the quoted observation it is —
 * it is the only thing here written about the learner rather than measured.
 */
function ProgressRow({ module }: { module: CourseModule }): React.JSX.Element {
  const done = module.status === "completed";
  return (
    <article className="border-line-soft flex flex-col gap-1.5 border-t py-5 first:border-t-0">
      <div className="flex items-baseline gap-3">
        <h4
          className={
            done
              ? "text-ink font-course min-w-0 flex-1 text-md font-semibold"
              : "text-hi font-course min-w-0 flex-1 text-md font-semibold"
          }
        >
          {module.title}
        </h4>
        <span
          className={
            done
              ? "border-ok/40 text-ok shrink-0 rounded-pill border px-2 py-0.5 text-2xs font-medium"
              : module.status === "in-progress"
                ? "border-attention/45 text-attention shrink-0 rounded-pill border px-2 py-0.5 text-2xs font-medium"
                : "border-line text-ink-faint shrink-0 rounded-pill border px-2 py-0.5 text-2xs font-medium"
          }
        >
          {STATUS_WORD[module.status]}
        </span>
      </div>
      <p className="text-ink-faint font-data flex flex-wrap items-baseline gap-x-2.5 text-2xs">
        <span>{module.id}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">
          {count(module.checkAttempts, "attempt")} · {count(module.hintsUsed.length, "hint")}
        </span>
      </p>
      {module.note === undefined ? null : (
        <p className="border-line-strong font-course text-ink-dim mt-1.5 border-l-2 pl-3.5 text-sm leading-read text-pretty">
          {module.note}
        </p>
      )}
    </article>
  );
}

export function RecordOverlay({
  open,
  onOpenChange,
  course,
  tab,
  onTab,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: CourseData;
  tab: RecordTab;
  onTab: (tab: RecordTab) => void;
}): React.JSX.Element {
  const done = course.modules.filter((entry) => entry.status === "completed").length;
  // The WHOLE bank, most overdue first — the same order the tutor drains it in.
  // Hiding the items merely scheduled ahead would answer a different question
  // than the one the learner opened the record to ask.
  const queue = [...course.quiz].sort(
    (left, right) => daysOverdue(right.due) - daysOverdue(left.due),
  );
  const counts: Counts = {
    due: dueItems(course.quiz).length,
    entries: course.journal.length,
    done,
    total: course.modules.length,
  };
  const learner = [
    course.learner.profile,
    course.learner.paceHoursPerWeek === "" ? null : `${course.learner.paceHoursPerWeek} h/week`,
    course.learner.started === "" ? null : `started ${course.learner.started}`,
  ].filter((entry) => entry !== null && entry !== "");

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(next) => {
        onTab(next as RecordTab);
      }}
      activationMode="automatic"
      /* Not `asChild`: the shell renders a <dialog>, which lives in the top
         layer, so this Root is only a context provider in the tree. The tab
         list travels to the head row as a prop and still sees that context —
         React context follows where an element is RENDERED. */
    >
      <OverlayShell
        open={open}
        onOpenChange={onOpenChange}
        title="Record"
        srDescription="The quiz bank, journal, and progress the tutor keeps for this course."
        size="reading"
        actions={
          /* A rule under the selected word — the same tab idiom the material
             pane uses, so the app has ONE way of saying "same surface,
             different document". The previous cut filled the active tab with
             --bg-raised, which is the overlay's own ground since ADR-020: an
             active state painted in the colour behind it is no state at all. */
          <Tabs.List className="flex items-stretch gap-5" aria-label="Tutor state">
            {TABS.map((entry) => (
              <Tabs.Trigger
                key={entry.id}
                value={entry.id}
                className="group text-ink-dim hover:text-ink data-[state=active]:text-hi focus-visible:outline-focus relative flex items-center gap-2 rounded-xs text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4"
              >
                {entry.label}
                <span className="text-ink-faint text-2xs tabular-nums">{entry.count(counts)}</span>
                <span className="bg-accent absolute inset-x-0 -bottom-px hidden h-(--stroke) rounded-pill group-data-[state=active]:block" />
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        }
      >
        <div className="bg-surface-read min-h-0 flex-1 overflow-y-auto">
          {/* Gutters outside the measure — see the material pane's note. */}
          <div className="px-6 pt-8 pb-16">
            <div className="mx-auto w-full max-w-(--container-read)">
              <Tabs.Content value="quiz">
                {queue.length === 0 ? (
                  <EmptyNote
                    title="Nothing in the bank yet"
                    desc="Your tutor seeds recall items as you finish a module, then asks them back at widening intervals."
                  />
                ) : (
                  <>
                    <SectionHead
                      title={`${String(counts.due)} due as of ${TODAY.format(new Date())}`}
                      lede={
                        counts.due === queue.length
                          ? "Most overdue first."
                          : `Most overdue first, then the ${String(queue.length - counts.due)} scheduled ahead.`
                      }
                    />
                    <div className="flex flex-col">
                      {queue.map((item) => (
                        <QuizRow key={item.id} item={item} />
                      ))}
                    </div>
                  </>
                )}
              </Tabs.Content>

              <Tabs.Content value="journal">
                {course.journal.length === 0 ? (
                  <EmptyNote
                    title="No sessions recorded yet"
                    desc="Your tutor writes an entry at the end of every session. This is what it remembers about you between them."
                  />
                ) : (
                  <>
                    <SectionHead
                      title="Session journal"
                      lede={`${String(counts.entries)} entries, newest first.`}
                    />
                    <div className="flex flex-col">
                      {course.journal.map((entry, index) => (
                        <article
                          key={`${entry.date}-${String(index)}`}
                          className="border-line not-first:mt-10 not-first:border-t not-first:pt-10"
                        >
                          {/* Date above the title: it reads as a stamp on the
                            entry, and the title gets the full measure. */}
                          <header className="mb-5 flex flex-col gap-1.5">
                            <span className="text-ink-faint font-data text-2xs tracking-wide">
                              {entry.date}
                            </span>
                            <h4 className="text-hi font-course text-lg leading-snug font-semibold text-balance">
                              {entry.title}
                            </h4>
                          </header>
                          {/* The journal is a RECORD, not a lesson: one step down
                            in size fits a third more per line, which is what
                            actually creates the air. A deliberate exception. */}
                          <CourseMarkdown
                            className="prose max-w-none text-md"
                            markdown={entry.body}
                          />
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </Tabs.Content>

              <Tabs.Content value="progress">
                {course.modules.length === 0 ? (
                  <EmptyNote
                    title="No modules to report on"
                    desc="Progress is kept per module. Once the arc has modules, this is where their attempts, hints, and your tutor's notes on you live."
                  />
                ) : (
                  <>
                    <SectionHead
                      title={`${String(counts.done)} of ${String(counts.total)} modules complete`}
                      {...(learner.length === 0 ? {} : { lede: learner.join(" · ") })}
                    />
                    <div className="flex flex-col">
                      {course.modules.map((entry) => (
                        <ProgressRow key={entry.id} module={entry} />
                      ))}
                    </div>
                  </>
                )}
              </Tabs.Content>
            </div>
          </div>
        </div>
      </OverlayShell>
    </Tabs.Root>
  );
}
