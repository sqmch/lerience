/* Mounts production renderer surfaces against a stubbed Lerience bridge.

   Every path, account label, course detail, provider event, and line of tutor
   prose in this harness is purpose-authored synthetic data. Nothing was copied
   from a learner course, provider transcript, or development session. */

import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { AgentEvent, SessionControlPatch, SessionControls } from "../../src/shared/seminar";
import type { SeminarSnapshot } from "../../src/shared/session";
import type { CourseSnapshot } from "../../src/shared/ipc";
import type { ProviderCatalog } from "../../src/shared/provider";
import { CourseDashboard } from "../../src/renderer/src/components/course-dashboard";
import { CourseView } from "../../src/renderer/src/course/course-view";
import { OnboardingSurface } from "../../src/renderer/src/onboarding/onboarding-surface";
import { AppShell } from "../../src/renderer/src/shell/app-shell";
import { TutorControl } from "../../src/renderer/src/tutor/tutor-connection";
import { COURSE_ROOT, FIXTURE_COURSE, readFixtureDoc } from "./course-fixture";
import "./harness.css";

const ROOT = "C:\\LerienceFixture\\Courses\\Weather display";

const INTERVIEW = `Let's shape this course before I draft it. I need three concrete details:

1. **What should the finished weather display help you decide?** Name a real use, not just a topic.
2. **What have you already built?** A spreadsheet, script, dashboard, or nothing yet are all useful answers.
3. **How many hours can you protect each week?** Use the number you can repeat.

Answer in any order. Rough answers are enough for a first pass.`;

const ARC = `# COURSE.md — A small weather display

**Learner profile:** comfortable with basic JavaScript and HTML; has not worked with sensor data.
Four hours per week, aiming for a desk-sized demo.

## Phase 0 — Make readings trustworthy

**Goal:** turn inconsistent samples into a small, explicit data model.

- **00 · One reading, named well** — parse temperature, humidity, and observation time.

## Phase 1 — Turn samples into a signal

**Goal:** summarize a short sequence without hiding missing or stale data.

- **01 · A rolling window** — keep only the newest samples.
- **02 · A useful average** — smooth noise and preserve units.
- **03 · The status panel** — render current conditions and honest empty states.

**Phase boss-check:** explain which reading the display trusts and why.`;

type Stage = "opening" | "interview" | "arc" | "building" | "ready" | "silent";

function courseFor(stage: Stage): CourseSnapshot {
  const modules =
    stage === "ready"
      ? [
          {
            id: "00-one-reading",
            title: "One reading, named well",
            phase: 0,
            phaseName: "Make readings trustworthy",
            runtime: "node",
            estimatedHours: 2,
            status: "not-started" as const,
            bossCheck: false,
            hasVisual: false,
            hasChecks: true,
            hasScaffold: true,
            checkAttempts: 0,
            hintsUsed: [],
            lessonPath: null,
            briefPath: null,
            quizPath: null,
          },
        ]
      : [];
  const courseDoc = stage === "arc" || stage === "building" || stage === "ready" ? ARC : null;
  return {
    rootPath: ROOT,
    folderName: "Weather display",
    data: {
      currentModuleId: null,
      learner: { profile: "", paceHoursPerWeek: "", started: "" },
      modules,
      unreadableModuleIds: [],
      quiz: [],
      journal: [],
      labs: [],
      labClaims: [],
      courseDoc,
      title: courseDoc === null ? null : "A small weather display",
      files: [],
    },
  };
}

/** The events each stage's session would already have produced. */
function scriptFor(stage: Stage): { events: AgentEvent[]; busy: boolean } {
  const interview: AgentEvent[] = [
    { type: "message_delta", delta: INTERVIEW },
    { type: "turn_complete" },
  ];
  if (stage === "opening") return { events: [], busy: true };
  if (stage === "interview") return { events: interview, busy: false };
  if (stage === "arc") {
    return {
      events: [
        ...interview,
        {
          type: "message_delta",
          delta:
            "That gives me enough to draft. The proposed arc is in **COURSE.md** below, and we can revise it before building anything.",
        },
        { type: "turn_complete" },
      ],
      busy: false,
    };
  }
  if (stage === "building") {
    return {
      events: [
        ...interview,
        {
          type: "message_delta",
          delta:
            "Building module 00 now: a short lesson, a reading parser scaffold, and checks for missing units and timestamps.",
        },
        {
          type: "tool_activity",
          name: "Write",
          summary: "Write curriculum/00-one-reading/scaffold/src/reading.ts",
        },
        {
          type: "approval_request",
          requestId: "harness-approval",
          toolName: "Write",
          summary: "Write curriculum/00-one-reading/scaffold/src/reading.ts",
          editWithinCourse: true,
        },
      ],
      busy: true,
    };
  }
  if (stage === "ready") {
    return {
      events: [
        ...interview,
        {
          type: "message_delta",
          delta: "Module 00 is ready and committed. Open it when you want to begin.",
        },
        { type: "turn_complete" },
      ],
      busy: false,
    };
  }
  // silent: the turn completed having produced nothing at all.
  return {
    events: [{ type: "usage_update", totalCostUsd: 0.34 }, { type: "turn_complete" }],
    busy: false,
  };
}

function installBridge(stage: Stage, connected: boolean, rejectControlChanges: boolean): void {
  const eventListeners: Array<(event: AgentEvent) => void> = [];
  const changeListeners: Array<(paths: string[]) => void> = [];
  const script = scriptFor(stage);

  const snapshot: SeminarSnapshot = {
    lifecycle: "open",
    sessionId: "harness",
    messages: [],
    totalCostUsd: 0,
  };
  const providerCatalog: ProviderCatalog = {
    selectedProviderId: connected ? "codex" : "claude",
    providers: [
      {
        id: "claude",
        label: "Claude Code",
        description: "Use the Claude subscription already connected to Claude Code.",
        runtime: { state: "ready", version: null },
        connection: connected ? "connected" : "signed-out",
        accountLabel: connected ? "fixture@example.invalid" : null,
        planLabel: connected ? "Fixture plan" : null,
        usage: null,
        canLogin: true,
        detail: connected
          ? null
          : "Sign in with your Claude subscription to start a tutor session.",
      },
      {
        id: "codex",
        label: "Codex",
        description: "Use your existing ChatGPT plan through Codex.",
        runtime: { state: "ready", version: null },
        connection: "connected",
        accountLabel: "fixture@example.invalid",
        planLabel: "Fixture plan",
        usage: {
          windows: [
            { label: "5-hour limit", usedPercent: 36, resetsAt: 1_800_000_000 },
            { label: "Weekly limit", usedPercent: 11, resetsAt: 1_800_086_400 },
          ],
        },
        canLogin: true,
        detail: null,
      },
    ],
  };
  const sessionControls: SessionControls = {
    models: [
      {
        id: "fixture-model",
        label: "Fixture model",
        description: "Synthetic model option",
        efforts: ["low", "medium", "high", "xhigh"],
      },
    ],
    autonomy: [
      { id: "untrusted", label: "Ask every time", description: "asks" },
      { id: "on-request", label: "Decide for me", description: "judges each request" },
      { id: "never", label: "Never ask", description: "does not pause for approval" },
    ],
    current: { model: "fixture-model", effort: "xhigh", autonomy: "on-request" },
  };

  // @ts-expect-error — the harness supplies only what this surface touches.
  window.praxeum = {
    listTutorProviders: () => Promise.resolve(providerCatalog),
    selectTutorProvider: () => Promise.resolve(providerCatalog),
    loginTutorProvider: () => new Promise(() => undefined),
    cancelTutorProviderLogin: () => Promise.resolve(),
    startSeminar: () => Promise.resolve({ ok: true }),
    currentSeminar: () => Promise.resolve(snapshot),
    sendSeminarMessage: () => Promise.resolve(),
    retrySeminarTurn: () => Promise.resolve(),
    respondToSeminarApproval: () => Promise.resolve(),
    allowSeminarCourseEdits: () => Promise.resolve(),
    seminarControls: () => Promise.resolve(sessionControls),
    setSeminarControls: (patch: SessionControlPatch) =>
      rejectControlChanges
        ? Promise.reject(new Error("The fixture provider rejected the control change."))
        : Promise.resolve({ ...sessionControls, pending: patch }),
    interruptSeminar: () => Promise.resolve(),
    endSeminar: () => Promise.resolve(),
    onSeminarEvent: (listener: (event: AgentEvent) => void) => {
      eventListeners.push(listener);
      // Replay after mount, the way a live session's stream arrives.
      setTimeout(() => {
        for (const event of script.events) listener(event);
        if (stage === "building") {
          for (const path of [
            "COURSE.md",
            // A temp twin lands beside every real write; the surface must
            // filter these out rather than showing write plumbing.
            "curriculum/00-one-reading/LESSON.md.tmp.99999.deadbeef",
            "curriculum/00-one-reading/LESSON.md",
            "curriculum/00-one-reading/BRIEF.md",
          ]) {
            // The real watch pushes course-relative, forward-slash paths.
            for (const notify of changeListeners) notify([path]);
          }
        }
      }, 30);
      return () => undefined;
    },
    onSeminarSnapshot: () => () => undefined,
    onCourseChanged: (listener: (paths: string[]) => void) => {
      changeListeners.push(listener);
      return () => undefined;
    },
    getTheme: () => Promise.resolve({ preference: "dark", dark: true }),
    setTheme: (preference: string) => Promise.resolve({ preference, dark: preference !== "light" }),
    onThemeChanged: () => () => undefined,
    setTitleBarOverlay: () => Promise.resolve(),
    /* The course view's own reads. Layout starts empty on purpose — that is a
       fresh install, and it is the path that has to look right by default. */
    getLayout: () => Promise.resolve({}),
    setLayout: () => Promise.resolve(),
    readDoc: (path: string) => Promise.resolve(readFixtureDoc(path)),
    revealCourse: () => Promise.resolve(),
    closeCourse: () => Promise.resolve(),
    runChecks: () =>
      Promise.resolve({
        ok: true,
        result: {
          outcome: "fail",
          total: 5,
          passed: 3,
          failed: 2,
          failedNames: [
            "parseReading > rejects a temperature without a unit",
            "parseReading > rejects a missing observation time",
          ],
        },
      }),
  };
}

const DASHBOARD_COURSES = [
  {
    courseId: "a",
    rootPath: "C:\\LerienceFixture\\Courses\\Map vectors",
    folderName: "Map vectors",
    lastOpenedAt: "2000-02-13T09:00:00.000Z",
    available: true as const,
    title: "Map vectors: direction, distance, and projection",
    currentModuleId: "02-direction-comparison",
    completedModules: 2,
    totalModules: 9,
    dueCount: 5,
    onboarding: false,
  },
  {
    courseId: "b",
    rootPath: "C:\\LerienceFixture\\Courses\\Weather display",
    folderName: "Weather display",
    lastOpenedAt: "2000-02-12T09:00:00.000Z",
    available: false as const,
  },
];

const STAGES: Stage[] = ["opening", "interview", "arc", "building", "ready", "silent"];

/** The dashboard's and the course view's surfaces, which are NOT onboarding
 *  stages — added so their geometry can be measured rather than assumed. */
type Screen = Stage | "first-run" | "courses" | "course" | "control-error" | "connect";
const SCREENS: Screen[] = ["first-run", "courses", "course", "control-error", "connect", ...STAGES];

function Harness(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>("course");
  const [bar, setBar] = useState(true);
  const stage = (STAGES as string[]).includes(screen) ? (screen as Stage) : "interview";
  installBridge(stage, screen !== "connect", screen === "control-error");

  if (!bar) {
    return (
      <div>
        <button
          type="button"
          className="bg-surface-deep border-line text-ink-dim fixed right-3 bottom-8 z-10 rounded-pill border px-3 py-1 text-2xs"
          onClick={() => {
            setBar(true);
          }}
        >
          harness
        </button>
        <Surface screen={screen} stage={stage} />
      </div>
    );
  }

  return (
    <div>
      {/* Fixed, not a flex row: AppShell owns the viewport (h-dvh) and nesting
          it under another full-height box squeezes the real title bar. Pinned
          to the BOTTOM so it covers the 26px status bar rather than the 38px
          title bar, and dismissible so both can be seen unobstructed. */}
      <div className="bg-surface-deep border-line fixed right-0 bottom-0 left-0 z-10 flex gap-1 border-t px-4 py-2">
        {SCREENS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={
              candidate === screen
                ? "bg-accent text-accent-ink rounded-pill px-3 py-1 text-sm"
                : "text-ink-dim hover:bg-accent-wash rounded-pill px-3 py-1 text-sm"
            }
            onClick={() => {
              setScreen(candidate);
            }}
          >
            {candidate}
          </button>
        ))}
        <button
          type="button"
          className="text-ink-dim hover:bg-accent-wash ml-auto rounded-pill px-3 py-1 text-sm"
          onClick={() => {
            const root = document.documentElement;
            root.dataset["theme"] = root.dataset["theme"] === "light" ? "dark" : "light";
          }}
        >
          theme
        </button>
        <button
          type="button"
          className="text-ink-faint hover:bg-accent-wash rounded-pill px-3 py-1 text-sm"
          title="Hide the harness bar so the status bar is unobstructed"
          onClick={() => {
            setBar(false);
          }}
        >
          hide
        </button>
      </div>
      <Surface screen={screen} stage={stage} />
    </div>
  );
}

function Surface({ screen, stage }: { screen: Screen; stage: Stage }): React.JSX.Element {
  /* The course view brings its OWN AppShell — it is a surface that owns its
     frame contents (ADR-019), not a child of someone else's. */
  if (screen === "course" || screen === "control-error") {
    return (
      <CourseView
        key={`${COURSE_ROOT}:${screen}`}
        course={FIXTURE_COURSE}
        onLeaveCourse={() => undefined}
      />
    );
  }
  /* Onboarding owns its frame too now — its back control and the course name
     live in the window's title bar, exactly like the course view's. Wrapping
     it in a second AppShell here would draw two title bars and two status
     bars, which is a harness artefact rather than anything the app does. */
  if (screen !== "first-run" && screen !== "courses") {
    return (
      <OnboardingSurface
        key={stage}
        course={courseFor(stage)}
        justCreated={stage === "opening"}
        onLeaveCourse={() => undefined}
        onEnterCourse={() => undefined}
      />
    );
  }
  return (
    <AppShell status={<span className="truncate">{ROOT}</span>}>
      <CourseDashboard
        courses={screen === "courses" ? DASHBOARD_COURSES : []}
        defaultParentDirectory="C:\\LerienceFixture\\Courses"
        initialError={null}
        onOpen={() => Promise.resolve(null)}
        onLocate={() => Promise.resolve(null)}
        onForget={() => Promise.resolve(null)}
        onOpenFolder={() => Promise.resolve(null)}
        onCreate={() => new Promise(() => undefined)}
        tutorControl={<TutorControl />}
      />
    </AppShell>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<Harness />);
