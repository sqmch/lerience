/* The showcase: the production course view, mid-course, with a scripted tutor.

   This page exists for the public landing site, which embeds the built
   `showcase.html` in an iframe so a visitor can use the real interface before
   installing anything. It mounts the same production components the harness
   does, against a bridge whose tutor replies from a short script instead of a
   provider. Nothing here ships in the installer (see README.md).

   Every path, course detail, journal entry, quiz item, and line of tutor prose
   below is purpose-authored synthetic data. Nothing was copied from a learner
   course, provider transcript, or development session. */

/* The same self-hosted faces the desktop app imports in its own entry, so the
   showcase is set in Inter, Literata, and JetBrains Mono wherever it is served
   rather than in whatever the visitor's machine happens to substitute. */
import "@fontsource-variable/inter";
import "@fontsource-variable/literata";
import "@fontsource-variable/jetbrains-mono";
import { createRoot } from "react-dom/client";
import type { CourseQuizItem } from "../../src/shared/course-data";
import type {
  CourseSnapshot,
  DashboardCourse,
  ThemePreference,
  ThemeState,
} from "../../src/shared/ipc";
import type { ProviderCatalog } from "../../src/shared/provider";
import type { AgentEvent, SessionControlPatch, SessionControls } from "../../src/shared/seminar";
import type { SeminarSnapshot, SeminarTranscriptMessage } from "../../src/shared/session";
import { CourseDashboard } from "../../src/renderer/src/components/course-dashboard";
import { CourseView } from "../../src/renderer/src/course/course-view";
import { AppShell } from "../../src/renderer/src/shell/app-shell";
import { TutorControl } from "../../src/renderer/src/tutor/tutor-connection";
import { useTutorConnection } from "../../src/renderer/src/tutor/use-tutor-connection";
import { FIXTURE_COURSE } from "./course-fixture";
import { readShowcaseDoc } from "./showcase-material";
import "./harness.css";

/* ── the course, dated relative to today ─────────────────────────────────────
   The harness fixture is pinned to February 2000 so its screenshots never
   drift. A visitor reading "2000-02-12" in a journal would reasonably wonder
   what decade the app is from, so the showcase shifts every date so that the
   most recent journal entry is yesterday. The module deliberately written to
   overflow the rail (09) is a harness probe, not course material, and is left
   out. */

const FIXTURE_TODAY = new Date("2000-02-13T00:00:00.000Z");

function shiftDate(iso: string): string {
  const offsetDays = Math.round((Date.parse(iso) - FIXTURE_TODAY.getTime()) / 86_400_000);
  const shifted = new Date();
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return shifted.toISOString().slice(0, 10);
}

function shiftQuizItem(item: CourseQuizItem): CourseQuizItem {
  return {
    ...item,
    due: shiftDate(item.due),
    history: item.history.map((entry) => ({ ...entry, date: shiftDate(entry.date) })),
  };
}

const SHOWCASE_ROOT = "D:\\Courses\\Map vectors";

const SHOWCASE_COURSE: CourseSnapshot = {
  rootPath: SHOWCASE_ROOT,
  folderName: FIXTURE_COURSE.folderName,
  data: {
    ...FIXTURE_COURSE.data,
    /* Only the current module exists in full, and the two before it are
       finished: a module not yet reached has no lesson, brief, scaffold, or
       checks, and the material pane says so. The harness fixture gives every
       module paths because it is probing the pane; the showcase tells the
       protocol's truth instead. */
    modules: FIXTURE_COURSE.data.modules
      .filter((entry) => entry.id !== "09-long-entry-fixture")
      .map((entry) =>
        entry.status === "not-started"
          ? {
              ...entry,
              lessonPath: null,
              briefPath: null,
              quizPath: null,
              hasScaffold: false,
              hasChecks: false,
            }
          : /* A finished module keeps its quiz.md on disk; the harness fixture
               only gives the current module one. */
            { ...entry, quizPath: `curriculum/${entry.id}/quiz.md` },
      ),
    quiz: FIXTURE_COURSE.data.quiz.map(shiftQuizItem),
    journal: FIXTURE_COURSE.data.journal.map((entry) => ({
      ...entry,
      date: shiftDate(entry.date),
    })),
    learner: {
      ...FIXTURE_COURSE.data.learner,
      started: shiftDate(FIXTURE_COURSE.data.learner.started),
    },
  },
};

/* ── the dashboard: three courses, three subjects ───────────────────────────
   The course list a returning learner opens on. The three are deliberately
   from different worlds, because a course is whatever the learner asked for:
   the vector course the rest of the showcase walks through, a history course
   checked by comprehension questions and a short essay at each phase gate,
   and an interview-preparation course shaped by a job description and graded
   through mock rounds. All synthetic. */

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

const DASHBOARD_COURSES: DashboardCourse[] = [
  {
    courseId: "showcase-vectors",
    rootPath: "D:\\Courses\\Map vectors",
    folderName: "Map vectors",
    lastOpenedAt: daysAgo(0),
    available: true,
    title: "Map vectors: direction, distance, and projection",
    currentModuleId: "02-direction-comparison",
    completedModules: 2,
    totalModules: 9,
    dueCount: 3,
    onboarding: false,
  },
  {
    courseId: "showcase-pirates",
    rootPath: "D:\\Courses\\Golden age of piracy",
    folderName: "Golden age of piracy",
    lastOpenedAt: daysAgo(2),
    available: true,
    title: "The golden age of piracy in American waters, 1650 to 1730",
    currentModuleId: "04-charleston-blockade",
    completedModules: 4,
    totalModules: 7,
    dueCount: 5,
    onboarding: false,
  },
  {
    courseId: "showcase-interview",
    rootPath: "D:\\Courses\\Backend interview prep",
    folderName: "Backend interview prep",
    lastOpenedAt: daysAgo(6),
    available: true,
    title: "Interview prep: senior backend engineer, payments team",
    currentModuleId: "05-system-design-round",
    completedModules: 5,
    totalModules: 8,
    dueCount: 1,
    onboarding: false,
  },
];

function DashboardScreen(): React.JSX.Element {
  const connection = useTutorConnection();
  return (
    <AppShell status={<span className="truncate">{"D:\\Courses"}</span>}>
      <CourseDashboard
        courses={DASHBOARD_COURSES}
        defaultParentDirectory={"D:\\Courses"}
        initialError={null}
        onOpen={() => Promise.resolve(null)}
        onLocate={() => Promise.resolve(null)}
        onForget={() => Promise.resolve(null)}
        onOpenFolder={() => Promise.resolve(null)}
        onCreate={() => new Promise(() => undefined)}
        tutorControl={<TutorControl connection={connection} />}
        needsTutor={!connection.checking && !connection.ready}
      />
    </AppShell>
  );
}

/* ── the conversation so far ─────────────────────────────────────────────────
   A session that is already open: the tutor opened with the recall items that
   were due, the learner answered, and the tutor turned back to the work. */

const TRANSCRIPT: SeminarTranscriptMessage[] = [
  {
    id: "showcase-1",
    role: "tutor",
    partial: false,
    content: `Welcome back. Two recall items are due before we pick up module 02, so those first:

1. Why normalize vectors before comparing direction?
2. Which cosine value represents opposite directions? Last session you answered zero.

Answer in any order. Then we go back to \`cosineSimilarity\`.`,
  },
  {
    id: "showcase-2",
    role: "learner",
    partial: false,
    content:
      "Normalizing removes the step size so only direction counts. Opposite is -1. Zero is a right angle, that was my mistake last time.",
  },
  {
    id: "showcase-3",
    role: "tutor",
    partial: false,
    content: `Both right, and you corrected the one you missed without being told which it was. Both items are rescheduled.

Your last check run was 3 of 5. The two that fail are the zero-vector cases. Before you touch the code: what does \`Math.hypot(0, 0)\` return, and what happens to that value on line 14 of \`direction.ts\`?`,
  },
];

/* ── what the scripted tutor says next ───────────────────────────────────────
   The script cannot read what the visitor typed. It answers in the order the
   protocol would, and then says plainly what it is. */

const REPLIES = [
  `I won't write it for you. The gap between the scaffold and the passing checks is where this module happens, and filling it would take the module away from you.

Look at line 14. You divide by the product of the two lengths. What is that product when either vector is \`[0, 0]\`?`,
  `Hint 1 of 3, released.

A zero vector has length 0, so the denominator is 0 and the division returns \`NaN\`. The checks are not asking you to return \`NaN\`. They are asking you to decide what a function should do with a vector that has no direction, and to say so in the code. Read the last line of the brief again, then run the checks.`,
  `That passes, and it is the stronger of the two choices.

One question before I mark 02 done: your fix returns \`0\` for a zero vector, which the checks accept. Why might throwing be the better call in a larger program? One sentence is enough. Then I write module 03 around how this one went.`,
  `A plain note from the page this runs on: I am a short script standing in for the tutor, so I cannot read what you wrote. In Lerience the tutor is your own Claude Code or Codex, working in the course folder on your disk, and it reads every word.`,
];

function chunk(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}

/* ── the bridge ──────────────────────────────────────────────────────────────
   The narrow preload API the course view touches, answered from memory. */

function installBridge(initialTheme: ThemePreference): void {
  const eventListeners = new Set<(event: AgentEvent) => void>();
  const themeListeners = new Set<(state: ThemeState) => void>();
  let replyIndex = 0;
  let turnTimer: ReturnType<typeof setTimeout> | null = null;

  const snapshot: SeminarSnapshot = {
    lifecycle: "open",
    sessionId: "showcase",
    messages: TRANSCRIPT,
    totalCostUsd: 0,
  };

  const providerCatalog: ProviderCatalog = {
    selectedProviderId: "claude",
    providers: [
      {
        id: "claude",
        label: "Claude Code",
        description: "Use the Claude subscription already connected to Claude Code.",
        runtime: { state: "ready", version: null },
        connection: "connected",
        accountLabel: "you@example.invalid",
        planLabel: "Max",
        usage: {
          windows: [
            { label: "5-hour limit", usedPercent: 23, resetsAt: 1_800_000_000 },
            { label: "Weekly limit", usedPercent: 9, resetsAt: 1_800_086_400 },
          ],
        },
        canLogin: true,
        detail: null,
      },
      {
        id: "codex",
        label: "Codex",
        description: "Use your existing ChatGPT plan through Codex.",
        runtime: { state: "ready", version: null },
        connection: "signed-out",
        accountLabel: null,
        planLabel: null,
        usage: null,
        canLogin: true,
        detail: "Sign in with your ChatGPT plan to use Codex as the tutor.",
      },
    ],
  };

  const sessionControls: SessionControls = {
    models: [
      {
        id: "default",
        label: "Provider default",
        description: "Whatever your provider client is set to.",
        efforts: ["low", "medium", "high", "xhigh"],
      },
    ],
    autonomy: [
      { id: "untrusted", label: "Ask every time", description: "asks" },
      { id: "on-request", label: "Decide for me", description: "judges each request" },
      { id: "never", label: "Never ask", description: "does not pause for approval" },
    ],
    current: { model: "default", effort: "high", autonomy: "on-request" },
  };

  const emit = (event: AgentEvent): void => {
    for (const listener of eventListeners) listener(event);
  };

  const stopTurn = (): void => {
    if (turnTimer !== null) clearTimeout(turnTimer);
    turnTimer = null;
  };

  /* Streams one scripted reply the way a live turn arrives: a pause to think,
     then word-sized deltas, then the turn closes and the composer reopens. */
  const reply = (): void => {
    stopTurn();
    const text = REPLIES[replyIndex % REPLIES.length] ?? REPLIES[0]!;
    replyIndex += 1;
    const pieces = chunk(text);
    let index = 0;
    const step = (): void => {
      if (index >= pieces.length) {
        turnTimer = null;
        emit({ type: "turn_complete" });
        return;
      }
      emit({ type: "message_delta", delta: pieces[index]! });
      index += 1;
      turnTimer = setTimeout(step, 18 + Math.random() * 40);
    };
    turnTimer = setTimeout(step, 900);
  };

  let theme: ThemeState = resolveTheme(initialTheme);
  const applyTheme = (preference: ThemePreference): ThemeState => {
    theme = resolveTheme(preference);
    if (preference === "system") delete document.documentElement.dataset["theme"];
    else document.documentElement.dataset["theme"] = preference;
    for (const listener of themeListeners) listener(theme);
    return theme;
  };
  applyTheme(initialTheme);

  /* The embedding page owns the visible theme toggle; it posts the choice
     here so the window inside follows the page around it. */
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const record = data as { type?: unknown; theme?: unknown };
    if (record.type !== "lerience:theme") return;
    if (record.theme === "light" || record.theme === "dark" || record.theme === "system") {
      applyTheme(record.theme);
    }
  });

  // @ts-expect-error — the showcase supplies only what the course view touches.
  window.praxeum = {
    listTutorProviders: () => Promise.resolve(providerCatalog),
    selectTutorProvider: () => Promise.resolve(providerCatalog),
    loginTutorProvider: () => new Promise(() => undefined),
    cancelTutorProviderLogin: () => Promise.resolve(),
    startSeminar: () => Promise.resolve({ ok: true }),
    currentSeminar: () => Promise.resolve(snapshot),
    sendSeminarMessage: () => {
      reply();
      return Promise.resolve();
    },
    retrySeminarTurn: () => Promise.resolve(),
    respondToSeminarApproval: () => Promise.resolve(),
    allowSeminarCourseEdits: () => Promise.resolve(),
    seminarControls: () => Promise.resolve(sessionControls),
    setSeminarControls: (patch: SessionControlPatch) =>
      Promise.resolve({ ...sessionControls, pending: patch }),
    interruptSeminar: () => {
      stopTurn();
      emit({ type: "turn_complete" });
      return Promise.resolve();
    },
    endSeminar: () => Promise.resolve(),
    onSeminarEvent: (listener: (event: AgentEvent) => void) => {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
    onSeminarSnapshot: () => () => undefined,
    onCourseChanged: () => () => undefined,
    getTheme: () => Promise.resolve(theme),
    setTheme: (preference: ThemePreference) => Promise.resolve(applyTheme(preference)),
    onThemeChanged: (listener: (state: ThemeState) => void) => {
      themeListeners.add(listener);
      return () => {
        themeListeners.delete(listener);
      };
    },
    setTitleBarOverlay: () => Promise.resolve(),
    getLayout: () => Promise.resolve({}),
    setLayout: () => Promise.resolve(),
    readDoc: (path: string) => Promise.resolve(readShowcaseDoc(path)),
    revealCourse: () => Promise.resolve(),
    closeCourse: () => Promise.resolve(),
    runChecks: () =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            result: {
              outcome: "fail",
              total: 5,
              passed: 3,
              failed: 2,
              failedNames: [
                "cosineSimilarity > rejects a zero left vector",
                "cosineSimilarity > rejects a zero right vector",
              ],
            },
          });
        }, 1400);
      }),
  };
}

function resolveTheme(preference: ThemePreference): ThemeState {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return { preference, dark: preference === "system" ? systemDark : preference === "dark" };
}

function initialTheme(): ThemePreference {
  const requested = new URLSearchParams(window.location.search).get("theme");
  return requested === "light" || requested === "dark" ? requested : "system";
}

/* The composer focuses itself on mount, which is right in a window of its own
   and wrong inside someone else's page: the page would scroll to the iframe
   and a phone would open its keyboard. Programmatic focus on text fields is
   held back until the visitor has touched the window themselves, and even
   then never scrolls the page around it. */
function holdFocusUntilInteraction(): void {
  let interacted = false;
  const mark = (): void => {
    interacted = true;
  };
  window.addEventListener("pointerdown", mark, { capture: true, passive: true });
  window.addEventListener("keydown", mark, { capture: true, passive: true });
  const original = HTMLElement.prototype.focus;
  HTMLTextAreaElement.prototype.focus = function focus(options?: FocusOptions): void {
    if (!interacted) return;
    original.call(this, { ...options, preventScroll: true });
  };
}

holdFocusUntilInteraction();
installBridge(initialTheme());

/* `?screen=courses` mounts the dashboard instead of the course view. */
const screen = new URLSearchParams(window.location.search).get("screen");

createRoot(document.getElementById("root") as HTMLElement).render(
  screen === "courses" ? (
    <DashboardScreen />
  ) : (
    <CourseView course={SHOWCASE_COURSE} onLeaveCourse={() => undefined} />
  ),
);
