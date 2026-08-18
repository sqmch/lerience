/* The surface a course wears until it has a first module.
 *
 * It is not a wizard in the state-machine sense and deliberately owns no
 * onboarding state of its own: the engine protocol runs the interview, writes
 * COURSE.md, holds the assent gate, and builds module 00 (ADR-003). Every stage
 * below is READ from facts that already exist — whether COURSE.md is on disk,
 * whether any module is, and what the one shared seminar controller reports —
 * so the app can never disagree with the course folder about where onboarding
 * has got to.
 *
 * The conversation itself is the same one the course view docks (useSeminar +
 * seminar/parts). Only the frame is different: centred and full-window, because
 * a course with nothing in it has no rail to sit beside and no material to
 * read. */

import { useEffect, useState, type ReactNode } from "react";
import { PRIMARY, QUIET } from "../components/controls";
import { CheckGlyph } from "../components/glyphs";
import { AppShell } from "../shell/app-shell";
import { BackToCourses, TitleRule } from "../shell/surface-head";
import { CourseMarkdown } from "../components/markdown-view";
import type { CourseSnapshot } from "../../../shared/ipc";
import {
  ApprovalCard,
  Composer,
  FailureNotice,
  LimitNotice,
  LearnerTurn,
  Thinking,
  TutorTurn,
  useFollowBottom,
} from "../seminar/parts";
import { useSeminar } from "../seminar/use-seminar";
import { TutorConnectionGate } from "../tutor/tutor-connection";
import { useTutorConnection } from "../tutor/use-tutor-connection";

/** What the learner's assent says, in their voice, because it is sent as their
 *  message. The engine's gate wants explicit agreement in the conversation —
 *  the button is a way of typing this, not a way of bypassing it. */
const ASSENT = "The arc looks right — build module 00.";

/** How long the finished state is GUARANTEED to be readable before the course
 *  view takes over. Held deliberately: arriving and leaving inside a second
 *  reads as a glitch, so if the moment is worth showing it is worth showing
 *  long enough to read. */
const CROSSOVER_MS = 2600;

/** How long the tutor must be quiet before the build counts as finished. The
 *  build is many turns, and the pauses between them look exactly like the end
 *  — without this, a gap mid-build declares victory and cuts the tutor off
 *  mid-sentence (observed live, 2026-08-13). */
const SETTLE_MS = 1500;

/** True once `condition` has held continuously for `ms`. Any interruption
 *  resets the clock. */
function useSettled(condition: boolean, ms: number): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!condition) {
      setSettled(false);
      return;
    }
    const timer = setTimeout(() => {
      setSettled(true);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [condition, ms]);
  return settled;
}

/** Enough to show the shape of what is being built without turning the
 *  conversation into a file log. */
const WRITTEN_FILE_LIMIT = 8;

/** Ticks the elapsed clock on the build screen. A multi-minute wait with no
 *  moving number is where people start wondering whether it has hung. */
function useElapsed(since: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [since]);
  if (since === null) return null;
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes === 0 ? `${String(seconds)}s` : `${String(minutes)}m ${String(seconds % 60)}s`;
}

type Stage = "opening" | "interview" | "arc" | "building" | "ready";

const STEPS = [
  { key: "interview", label: "Interview" },
  { key: "arc", label: "Arc review" },
  { key: "building", label: "First module" },
  { key: "ready", label: "Course" },
] as const;

function stepIndex(stage: Stage): number {
  const key = stage === "opening" ? "interview" : stage;
  return STEPS.findIndex((step) => step.key === key);
}

/** The window's own row of state: where onboarding has reached, never a
 *  clickable stepper — the tutor moves this, not the learner.
 *
 *  It lives in the status bar rather than the title bar: the window's own frame
 *  carries where you are and the way out, and a four-step wizard path is neither.
 *  `font-app` because the status bar's default voice is the data mono, and these
 *  are words. */
function PathIndicator({ stage }: { stage: Stage | "arc" }): React.JSX.Element {
  const now = stepIndex(stage);
  return (
    <nav
      className="text-ink-faint font-app ml-auto flex shrink-0 items-center whitespace-nowrap"
      aria-label="Onboarding progress"
    >
      {STEPS.map((step, index) => (
        <span key={step.key} className="flex items-center">
          {index === 0 ? null : (
            <span className="mx-2.5 opacity-60" aria-hidden="true">
              →
            </span>
          )}
          <span
            className={index === now ? "text-hi font-medium" : index < now ? "text-ink-dim" : ""}
            aria-current={index === now ? "step" : undefined}
          >
            {step.label}
          </span>
        </span>
      ))}
    </nav>
  );
}

/** Onboarding's frame, written once because it wraps two screens (the
 *  conversation and the arc review) and two copies is how they drift.
 *
 *  Onboarding used to draw a header BAND of its own under the window's title
 *  bar — two chrome rows deep, with a back control that looked nothing like
 *  the course view's. There is one row now, and it is the window's own
 *  (ADR-016), carrying exactly what the course view's carries: the way out,
 *  then where you are. */
function OnboardingFrame({
  title,
  stage,
  rootPath,
  onLeaveCourse,
  children,
}: {
  title: string;
  stage: Stage | "arc";
  rootPath: string;
  onLeaveCourse: () => void;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <AppShell
      title={
        <>
          <BackToCourses onLeaveCourse={onLeaveCourse} />
          <TitleRule />
          <h1 className="text-hi font-course ml-1 min-w-0 truncate text-md font-semibold">
            {title}
          </h1>
        </>
      }
      status={
        <>
          <span className="min-w-0 flex-1 truncate" title={rootPath}>
            {rootPath}
          </span>
          <PathIndicator stage={stage} />
        </>
      }
    >
      {children}
    </AppShell>
  );
}

/** The app stating a fact about the learner's disk. Paths read as data inside
 *  an ordinary sentence; the mark is the app's, never the tutor's. */
function SysLine({
  tone = "done",
  children,
}: {
  tone?: "done" | "waiting";
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <p className="text-ink-dim flex items-start gap-2.5 text-sm leading-normal text-pretty">
      {tone === "done" ? (
        <CheckGlyph className="text-ok mt-1 size-3 shrink-0" />
      ) : (
        <span className="bg-attention mt-1.5 size-1.5 shrink-0 rounded-pill" aria-hidden="true" />
      )}
      <span>{children}</span>
    </p>
  );
}

interface OnboardingSurfaceProps {
  course: CourseSnapshot;
  justCreated: boolean;
  onLeaveCourse: () => void;
  onEnterCourse: () => void;
}

export function OnboardingSurface(props: OnboardingSurfaceProps): React.JSX.Element {
  const connection = useTutorConnection();
  /* The gate keeps the plain wordmark frame: it draws its own way out, and a
     second back control in the title bar above it would be two answers to the
     same question. */
  if (!connection.ready) {
    return (
      <AppShell
        status={
          <span className="min-w-0 flex-1 truncate" title={props.course.rootPath}>
            {props.course.rootPath}
          </span>
        }
      >
        <TutorConnectionGate connection={connection} onBack={props.onLeaveCourse} />
      </AppShell>
    );
  }
  return <ConnectedOnboardingSurface {...props} />;
}

function ConnectedOnboardingSurface({
  course,
  justCreated,
  onLeaveCourse,
  onEnterCourse,
}: OnboardingSurfaceProps): React.JSX.Element {
  const { data, rootPath, folderName } = course;
  const hasArc = data.courseDoc !== null;
  const hasModules = data.modules.length > 0;

  // Onboarding always drives its own session: this surface IS the course until
  // a module exists, so there is nothing else for the learner to press.
  const seminar = useSeminar({ currentModuleId: null, autoStart: true });
  const { state, busy } = seminar;
  const [draft, setDraft] = useState("");
  const [assented, setAssented] = useState(false);
  const [revising, setRevising] = useState(false);
  const [editsGranted, setEditsGranted] = useState(false);
  const [written, setWritten] = useState<string[]>([]);
  const spoken = state.items.length > 0;
  /* Module files landing is the fact; the assent click is only the fast signal
     that arrives before the first write does. Deriving from both means a window
     reopened mid-build still reads as building rather than as a spinner parked
     under the arc. */
  const buildingFiles = written.some((path) => path.startsWith("curriculum/"));
  /* Building is a ONE-WAY door. Without the latch the stage flapped every time
     a turn ended mid-build — review screen in, review screen out — because
     "COURSE.md exists and the tutor is idle" is true between every turn of the
     build, not only at the gate (observed live, 2026-08-13). */
  const [buildStarted, setBuildStarted] = useState<number | null>(null);
  /** Where the build's own conversation begins. Captured with the timestamp so
   *  the build screen starts on a clean page. */
  const [buildFromIndex, setBuildFromIndex] = useState(0);
  useEffect(() => {
    if (!(buildingFiles || hasModules || assented)) return;
    setBuildStarted((at) => {
      if (at !== null) return at;
      setBuildFromIndex(state.items.length);
      return Date.now();
    });
  }, [buildingFiles, hasModules, assented, state.items.length]);
  const elapsed = useElapsed(buildStarted);

  /* "ready" demands the module exists AND the tutor has gone quiet and STAYED
     quiet. module.json lands minutes before the build actually ends, and the
     pauses between build turns are indistinguishable from the finish — the
     settle window is what tells them apart. */
  const finished = useSettled(hasModules && !busy, SETTLE_MS);
  const stage: Stage = finished
    ? "ready"
    : !hasArc
      ? spoken
        ? "interview"
        : "opening"
      : buildStarted
        ? "building"
        : "arc";

  /* The arc card enters ONCE, when the turn that wrote it finishes — never
     mid-stream, where the tutor's next words would push it around the screen.
     After that first reveal it stays put through revisions and the build. */
  const [arcRevealed, setArcRevealed] = useState(false);
  useEffect(() => {
    if (hasArc && !busy) setArcRevealed(true);
  }, [hasArc, busy]);

  const { viewportRef, onScroll, showLatest, jumpToLatest } = useFollowBottom(state, [
    // Everything that renders OUTSIDE the conversation items but must pull the
    // view down the same way: the arc card and its milestone line, the build
    // list, the stage's own cards (decision bar, crossover), the granted line.
    stage,
    arcRevealed,
    written.length,
    editsGranted,
  ]);

  /* A new screen starts at its own top. The view was still scrolled to the
     bottom of the interview when the build screen mounted, so its header sat
     above the fold and pressing Build looked like it did nothing. */
  const enteringBuild = buildStarted !== null;
  useEffect(() => {
    if (enteringBuild) viewportRef.current?.scrollTo({ top: 0 });
  }, [enteringBuild, viewportRef]);

  // A turn that ends without a module means the tutor answered rather than
  // built — the arc is under discussion again, not being written.
  useEffect(() => {
    if (!busy && !hasModules) setAssented(false);
  }, [busy, hasModules]);

  useEffect(() => {
    if (stage !== "arc") setRevising(false);
  }, [stage]);

  /* What the tutor has written, as it lands. This is the fs-watch the course
     surface already uses, not a progress model: the app reports files it
     actually saw appear, in the order they appeared, and claims nothing about
     what is still to come. */
  useEffect(() => {
    return window.praxeum.onCourseChanged((paths) => {
      setWritten((seen) => {
        // The watch already reports course-relative, forward-slash paths and
        // already filters to the lens's own inputs, so a path arriving here is
        // by definition worth showing. A rewritten file moves to the end rather
        // than repeating: the list is "what has landed", not a log.
        /* Atomic-write temporaries are plumbing, not course files. They land
           beside every real write ("quiz.md.tmp.22568.1cd3b28fdf5e") and made
           the list read as noise. */
        const real = paths.filter((path) => !/\.tmp\.[\w.]+$/.test(path));
        const next = seen.filter((path) => !real.includes(path));
        next.push(...real);
        return next.slice(-WRITTEN_FILE_LIMIT);
      });
    });
  }, []);

  /* The crossover. "ready" already means the turn is over; the timer gives the
     card its beat and then hands the window to the course view. */
  const crossing = stage === "ready";
  useEffect(() => {
    if (!crossing) return;
    const timer = setTimeout(onEnterCourse, CROSSOVER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [crossing, onEnterCourse]);

  const sendDraft = async (): Promise<void> => {
    const text = draft;
    setDraft("");
    const sent = await seminar.send(text);
    if (!sent) setDraft(text);
  };

  /* The build is the moment permission fatigue actually happens: dozens of
     writes, several commands, over minutes, with the learner watching. So the
     choice is offered HERE, attached to the action that causes it, rather than
     defaulted globally — the learner sees what they are agreeing to at the
     moment they agree to it, and one click undoes it (ADR-018). */
  const [uninterrupted, setUninterrupted] = useState(true);

  const sendAssent = (): void => {
    setAssented(true);
    if (uninterrupted) void seminar.setControls({ autonomy: "bypassPermissions" });
    void seminar.send(ASSENT).then((sent) => {
      if (!sent) setAssented(false);
    });
  };

  /* The tutor proposes the arc TWICE: once as chat prose, once as COURSE.md.
     Showing both on the review screen means reading the same plan in two
     shapes, the shorter one first. The document is the truth — it is what gets
     built from — so only the tutor's closing paragraph survives here, which in
     practice is the question it wants answered ("...or wanting hands-on
     RediSearch instead of just a survey?"). */
  const latestTutorNote = (() => {
    const message = [...state.items].reverse().find((item) => item.role === "tutor")?.content ?? "";
    const paragraphs = message
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter((part) => part !== "");
    const last = paragraphs.at(-1) ?? "";
    // A closing line is short; a whole arc restated in prose is not.
    return last.length > 400 ? "" : last;
  })();

  const title = data.title ?? folderName;
  /* Building and the handover share one screen, so finishing changes the words
     on it rather than swapping a card in — the old crossover flashed by too
     fast to read because it was a different component arriving at the end. */
  const building = stage === "building" || stage === "ready";
  const composerVisible =
    stage === "interview" || (stage === "arc" && revising) || state.failure?.kind === "silent";

  /* THE REVIEW GATE IS ITS OWN MOMENT — WHEN IT IS ACTUALLY A MOMENT.
     The app cannot detect the engine's gate: the tutor protocol permits an arc
     proposal and assent in chat before COURSE.md is written as the first act
     of building. So this screen is offered only
     when it is genuinely actionable — the plan is on disk, nothing has been
     built, and the tutor is waiting — and never once building has begun. The
     conversation remains where assent actually happens (ADR-003); the buttons
     are a shortcut for typing it, not a gate the app owns. */
  if (stage === "arc" && !busy) {
    return (
      <OnboardingFrame title={title} stage="arc" rootPath={rootPath} onLeaveCourse={onLeaveCourse}>
        <ArcReview
          markdown={data.courseDoc ?? ""}
          busy={busy}
          revising={revising}
          draft={draft}
          onDraft={setDraft}
          onSend={() => void sendDraft()}
          onAccept={sendAssent}
          onRevise={() => {
            setRevising(true);
          }}
          latestTutorNote={latestTutorNote}
          uninterrupted={uninterrupted}
          onUninterrupted={setUninterrupted}
        />
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame title={title} stage={stage} rootPath={rootPath} onLeaveCourse={onLeaveCourse}>
      <section className="flex min-h-0 flex-1 flex-col" aria-label="New course">
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 w-full flex-col">
            <div ref={viewportRef} className="min-h-0 flex-1 overflow-y-auto" onScroll={onScroll}>
              {building ? (
                <BuildStage
                  title={title}
                  ready={stage === "ready"}
                  elapsed={elapsed}
                  written={written}
                  activity={state.toolActivity}
                >
                  <BuildConversation
                    seminar={seminar}
                    since={buildFromIndex}
                    onLeaveCourse={onLeaveCourse}
                  />
                </BuildStage>
              ) : (
                <div className="mx-auto flex w-full max-w-(--container-converse) flex-col gap-5 px-6 pt-7 pb-10">
                  {/* Stays for the whole interview rather than vanishing the moment
                  the tutor speaks: it is the only thing naming what this screen
                  IS, and swapping it out mid-flow reads as the app losing its
                  place. It retires once the plan exists, by which point the
                  course has its own name and document. */}
                  {hasArc ? null : (
                    <div className="mb-3">
                      <h2 className="text-hi text-2xl font-bold tracking-tight text-balance">
                        {title}
                      </h2>
                      <p className="text-ink-dim mt-2.5 max-w-(--container-start) text-md leading-normal text-pretty">
                        Your tutor interviews you first, proposes the course arc for your review,
                        and builds your first module. When that module is ready, the full course
                        opens around this conversation — files, lessons, and checks, not just chat.
                      </p>
                    </div>
                  )}

                  <SysLine>
                    {justCreated ? "Folder created at " : "Folder found at "}
                    <span className="text-ink font-data text-2xs break-all">{rootPath}</span>
                    {justCreated ? null : " — no modules yet"}
                  </SysLine>
                  {stage === "opening" ? (
                    <p className="text-ink-faint -mt-3.5 pl-6 text-sm leading-normal text-pretty">
                      That folder is the course — plain files you can open with any editor. The
                      default location for new courses lives in Settings.
                    </p>
                  ) : null}

                  {seminar.recoveryPending ? (
                    <SysLine tone="waiting">
                      The last conversation ended without a clean close — your tutor reviews it
                      before continuing.
                    </SysLine>
                  ) : null}

                  {state.items.map((item) =>
                    item.role === "learner" ? (
                      <LearnerTurn key={item.id} content={item.content} />
                    ) : (
                      <TutorTurn key={item.id} content={item.content} streaming={item.streaming} />
                    ),
                  )}

                  {hasArc && !arcRevealed ? (
                    <SysLine>
                      <span className="text-ink font-data text-2xs">COURSE.md</span> written — the
                      plan appears for your review when the tutor finishes.
                    </SysLine>
                  ) : null}

                  {busy || state.phase === "opening" ? (
                    <Thinking
                      label={
                        // Before the tutor's first words there is nothing on screen to
                        // explain the wait, so this line carries it. "Thinking" is only
                        // honest once a conversation visibly exists.
                        stage === "opening"
                          ? seminar.recoveryPending
                            ? "Picking up where you left off"
                            : "Your tutor is preparing your interview"
                          : "Your tutor is thinking"
                      }
                      detail={state.toolActivity}
                    />
                  ) : null}

                  {state.limitWarning === null ? null : (
                    <LimitNotice warning={state.limitWarning} />
                  )}

                  {state.failure === null ? null : (
                    <FailureNotice
                      failure={state.failure}
                      {...(state.failure.kind === "silent" && state.phase === "idle"
                        ? {
                            onRetry: () => {
                              void seminar.retry();
                            },
                          }
                        : {})}
                    >
                      {state.phase === "closed" ? (
                        <button
                          type="button"
                          className={`${PRIMARY} text-sm`}
                          onClick={() => {
                            void seminar.start();
                          }}
                        >
                          Try again
                        </button>
                      ) : null}
                      <button type="button" className={`${QUIET} text-sm`} onClick={onLeaveCourse}>
                        Back to courses
                      </button>
                    </FailureNotice>
                  )}

                  {state.approval === null ? null : (
                    <ApprovalCard
                      approval={state.approval}
                      answering={seminar.answering}
                      onAnswer={(allow) => void seminar.answerApproval(allow)}
                      onAllowEdits={() => {
                        void seminar.allowCourseEdits().then((granted) => {
                          if (granted) setEditsGranted(true);
                        });
                      }}
                    />
                  )}
                  {editsGranted ? (
                    <SysLine>
                      File edits in this folder are allowed for the rest of this session.
                    </SysLine>
                  ) : null}
                </div>
              )}

              {showLatest ? (
                <button
                  type="button"
                  className={`${QUIET} bg-surface-raised sticky bottom-4 left-1/2 -translate-x-1/2 text-sm shadow-popover`}
                  onClick={jumpToLatest}
                >
                  Jump to latest
                </button>
              ) : null}
            </div>

            {composerVisible ? (
              <div className="border-line-soft shrink-0 border-t">
                <div className="mx-auto w-full max-w-(--container-converse) px-6 pt-3.5 pb-4">
                  <Composer
                    draft={draft}
                    onDraft={setDraft}
                    onSend={() => void sendDraft()}
                    onStop={seminar.interrupt}
                    busy={busy}
                    controls={seminar.controls}
                    onControls={(patch) => void seminar.setControls(patch)}
                    controlNotice={state.controlNotice}
                    queued={seminar.queued}
                    onUnqueue={seminar.unqueue}
                    placeholder="Reply to your tutor…"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </OnboardingFrame>
  );
}

/** What the tutor says and asks while it builds. Only the live edge of the
 *  conversation: the transcript so far was the interview, and re-reading it is
 *  not what anyone is doing during a wait. */
function BuildConversation({
  seminar,
  since,
  onLeaveCourse,
}: {
  seminar: ReturnType<typeof useSeminar>;
  /** Index of the first message that belongs to the BUILD. Everything before
   *  it is the interview and the arc proposal — already read, already agreed
   *  to, and pages long. Carrying it into this screen makes the new build
   *  header mount above old text while the view remains scrolled past it. */
  since: number;
  onLeaveCourse: () => void;
}): React.JSX.Element | null {
  const { state } = seminar;
  const latest = [...state.items.slice(since)].reverse().find((item) => item.role === "tutor");

  return (
    <>
      {/* The tutor's latest words stay put until the next ones replace them,
          but CLAMPED: this is a status line, not reading material. The closing
          summary runs over a page, and a page of prose arriving under a
          progress bar is unreadable in the seconds before the handover — it is
          worth reading in the course view, where it stays. */}
      {latest === undefined ? null : (
        <div className="line-clamp-3 overflow-hidden">
          <TutorTurn content={latest.content} streaming={latest.streaming} />
        </div>
      )}

      {state.limitWarning === null ? null : <LimitNotice warning={state.limitWarning} />}

      {state.failure === null ? null : (
        <FailureNotice failure={state.failure}>
          <button type="button" className={`${QUIET} text-sm`} onClick={onLeaveCourse}>
            Back to courses
          </button>
        </FailureNotice>
      )}

      {state.approval === null ? null : (
        <ApprovalCard
          approval={state.approval}
          answering={seminar.answering}
          onAnswer={(allow) => void seminar.answerApproval(allow)}
          onAllowEdits={() => {
            void seminar.allowCourseEdits();
          }}
        />
      )}
    </>
  );
}

/**
 * The build, as its own screen.
 *
 * Everything else in onboarding is a conversation; this is a wait. The learner
 * has just agreed to something that takes minutes and runs without them, so
 * the screen's whole job is to say — unmistakably, from the middle of the
 * window — that work is happening, roughly how long it has been going, and
 * what has landed so far. Reporting it in the corner of a chat, as a small
 * activity row, was the fault: the most important thing on screen was the
 * least visible thing on screen.
 *
 * The conversation is still here, underneath, because the tutor asks real
 * questions mid-build ("do you already have an API key?") and permission
 * requests must be answered where the learner is looking.
 */
function BuildStage({
  title,
  ready,
  elapsed,
  written,
  activity,
  children,
}: {
  title: string;
  /** The build finished: the same screen becomes the handover. */
  ready: boolean;
  elapsed: string | null;
  written: string[];
  activity: string | null;
  /** The live conversation — questions, approvals, the composer. */
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-(--container-converse) flex-col gap-6 px-6 pt-10 pb-10">
      <div>
        {/* --ink-dim, not --ink-faint: this is content the learner reads, and
            faint is for peripheral marks only (tokens.css says so). */}
        <p className="text-ink-dim text-sm">{ready ? "Your course is ready" : title}</p>
        <h2 className="text-hi mt-1.5 text-2xl font-bold tracking-tight text-balance">
          {ready ? title : "Building your first module"}
        </h2>
        <p className="text-ink-dim mt-2.5 text-md leading-normal text-pretty">
          {ready
            ? "Opening it now — this conversation moves with you, into the seminar column."
            : "Your tutor is writing the lesson, a scaffold with the load-bearing parts left for you, and the checks that grade them. This usually takes a few minutes; you can leave it running."}
        </p>

        {/* The signal. Indeterminate while working, complete when done — the
            same bar in both states, so finishing reads as an arrival rather
            than as one card being swapped for another. */}
        <div
          className="bg-accent-wash mt-5 h-1 overflow-hidden rounded-pill"
          role="progressbar"
          aria-label={ready ? "Course ready" : "Building your first module"}
          {...(ready ? { "aria-valuenow": 100, "aria-valuemin": 0, "aria-valuemax": 100 } : {})}
        >
          <i
            className={
              ready
                ? "bg-ok block h-full w-full rounded-pill transition-[width] duration-(--dur-slow)"
                : "bg-accent animate-sweep block h-full w-2/5 rounded-pill"
            }
          />
        </div>

        <div className="text-ink-dim mt-2.5 flex items-center gap-3 text-xs">
          {elapsed === null ? null : (
            <span className="font-data tabular-nums">
              {ready ? `built in ${elapsed}` : elapsed}
            </span>
          )}
          {activity === null || ready ? null : (
            <span className="text-ink-faint min-w-0 truncate">{activity}</span>
          )}
        </div>
      </div>

      {written.length === 0 ? null : (
        <div className="border-line flex flex-col gap-2 border-l pl-4">
          <p className="text-ink-dim text-xs">In your course folder</p>
          {written.map((path) => (
            <p key={path} className="text-ink-dim font-data flex items-start gap-2 text-2xs">
              <CheckGlyph className="text-ok mt-px size-3 shrink-0" />
              <span className="break-all">{path}</span>
            </p>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}

/**
 * The review gate, as its own screen.
 *
 * The engine will not build a module until the learner has explicitly signed
 * off on this plan, and the spine is expensive to change afterwards — so this
 * is the one moment in onboarding that deserves the whole window. One column
 * of document, the tutor's closing note above it, and a decision bar that is
 * always on screen no matter how long the plan runs.
 */
function ArcReview({
  markdown,
  busy,
  revising,
  draft,
  onDraft,
  onSend,
  onAccept,
  onRevise,
  latestTutorNote,
  uninterrupted,
  onUninterrupted,
}: {
  markdown: string;
  busy: boolean;
  revising: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  onAccept: () => void;
  onRevise: () => void;
  latestTutorNote: string;
  uninterrupted: boolean;
  onUninterrupted: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Review your course plan">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-(--container-converse) px-6 pt-8 pb-8">
          <p className="text-ink-faint text-sm">Your tutor has drafted the plan</p>
          <h2 className="text-hi mt-1.5 text-2xl font-bold tracking-tight text-balance">
            Does this look like your course?
          </h2>
          <p className="text-ink-dim mt-2.5 text-md leading-normal text-pretty">
            Nothing gets built until you say so. The spine is cheap to change now and expensive once
            modules hang off it, so push back on anything that reads wrong.
          </p>

          {latestTutorNote === "" ? null : (
            <div className="border-line-strong mt-6 border-l-2 pl-4">
              <CourseMarkdown className="prose text-ink-dim" markdown={latestTutorNote} />
            </div>
          )}

          <div className="bg-surface-read border-line mt-6 overflow-hidden rounded-lg border">
            <div className="border-line-soft text-ink-faint flex items-center gap-2.5 border-b px-6 py-2.5 text-xs">
              <span
                className={
                  busy ? "bg-attention size-1.5 rounded-pill" : "bg-ok size-1.5 rounded-pill"
                }
                aria-hidden="true"
              />
              <span className="text-ink-dim font-data text-2xs">COURSE.md</span>
              <span>{busy ? "being revised" : "in your course folder"}</span>
            </div>
            <div className="px-7 py-7">
              <CourseMarkdown className="prose" markdown={markdown} />
            </div>
          </div>
        </div>
      </div>

      {/* Always on screen: the decision cannot be scrolled past. */}
      <div className="border-line-soft bg-surface shrink-0 border-t">
        <div className="mx-auto w-full max-w-(--container-converse) px-6 py-4">
          {revising ? (
            <div className="flex flex-col gap-2.5">
              <Composer
                draft={draft}
                onDraft={onDraft}
                onSend={onSend}
                busy={busy}
                placeholder="What should change about the plan?"
              />
              <button
                type="button"
                className="text-ink-faint hover:text-hi self-start text-xs underline underline-offset-4"
                onClick={onAccept}
              >
                Actually, the plan is right — build module 00
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={`${PRIMARY} text-md`}
                  disabled={busy}
                  onClick={onAccept}
                >
                  Build module 00
                </button>
                <button
                  type="button"
                  className={`${QUIET} text-md`}
                  disabled={busy}
                  onClick={onRevise}
                >
                  Request changes
                </button>
                <p className="text-ink-faint ml-auto text-xs">
                  {busy
                    ? "Your tutor is revising the plan…"
                    : "Your answer goes to your tutor as a message."}
                </p>
              </div>
              {/* Stated where the consequence is, not buried in settings. */}
              <label className="text-ink-dim hover:text-ink flex w-fit cursor-pointer items-center gap-2 text-xs transition-colors">
                <input
                  type="checkbox"
                  className="accent-accent size-3.5 cursor-pointer"
                  checked={uninterrupted}
                  onChange={(event) => {
                    onUninterrupted(event.target.checked);
                  }}
                />
                Let it work without asking permission — it writes many files and runs commands
                inside this course folder
              </label>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
