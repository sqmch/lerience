/* Synthetic material mounted with the production assessment component. */
import type { CourseSnapshot } from "../../src/shared/ipc";
import { CourseView } from "../../src/renderer/src/course/course-view";

const MODULE_ID = "01-tracing-changes";
const MIXED_ID = "02-implementing-the-rule";
export const ASSESSMENT_COURSE: CourseSnapshot = {
  rootPath: "C:\\PraxeumFixture\\Courses\\State changes",
  folderName: "State changes",
  data: {
    title: "Making sense of state changes",
    currentModuleId: MODULE_ID,
    learner: { profile: "Synthetic learner", paceHoursPerWeek: "3", started: "2026-01-01" },
    unreadableModuleIds: [],
    quiz: [],
    journal: [],
    labs: [],
    labClaims: [],
    files: [],
    courseDoc: null,
    modules: [
      {
        id: "00-reading-state",
        title: "Reading a state",
        phase: 0,
        phaseName: "Follow the change",
        runtime: "",
        estimatedHours: 0.5,
        status: "completed",
        bossCheck: false,
        hasVisual: false,
        hasChecks: false,
        hasScaffold: false,
        checkAttempts: 0,
        hintsUsed: [],
        lessonPath: null,
        briefPath: "curriculum/00-reading-state/BRIEF.md",
        quizPath: null,
      },
      {
        id: MODULE_ID,
        title: "Tracing changes",
        phase: 0,
        phaseName: "Follow the change",
        runtime: "",
        estimatedHours: 0.5,
        status: "in-progress",
        bossCheck: false,
        hasVisual: false,
        hasChecks: false,
        hasScaffold: false,
        checkAttempts: 0,
        hintsUsed: [],
        lessonPath: `curriculum/${MODULE_ID}/LESSON.md`,
        briefPath: `curriculum/${MODULE_ID}/BRIEF.md`,
        quizPath: null,
      },
      {
        id: MIXED_ID,
        title: "Implementing the rule",
        phase: 0,
        phaseName: "Follow the change",
        runtime: "node",
        estimatedHours: 0.5,
        status: "not-started",
        bossCheck: false,
        hasVisual: false,
        hasChecks: true,
        hasScaffold: true,
        checkAttempts: 0,
        hintsUsed: [],
        lessonPath: null,
        briefPath: `curriculum/${MIXED_ID}/BRIEF.md`,
        quizPath: null,
      },
    ],
  },
};

export function readAssessmentDoc(path: string): string | null {
  if (path === "curriculum/00-reading-state/BRIEF.md")
    return `# Read a state, describe a change

Sketch two snapshots of a token bin, before and after an addition. Label what changed and
what stayed the same. Discuss your sketch with the tutor when you are ready.

This activity uses a sketch and a conversation. There is no answer form to fill in.`;
  if (path === `curriculum/${MODULE_ID}/LESSON.md`)
    return `# A change starts with the previous state

A bin has a fixed capacity. When tokens arrive, keep as many as fit and discard the excess.
When tokens leave, the stored count cannot fall below zero.

For example, a bin with capacity 5 starts with 3 tokens. Adding 1 leaves 4 stored. Adding
another 3 leaves 5 stored and spills 2. Each event starts where the previous event finished.

In the Brief, trace a different sequence and explain the last change.`;
  const scenario =
    "A bin holds up to **6 tokens** and starts with 2. Follow the events in order. Additions spill when the bin is full; removals stop at zero.";
  if (path === `curriculum/${MODULE_ID}/BRIEF.md`) return `# Trace the token bin\n\n${scenario}`;
  if (path === `curriculum/${MIXED_ID}/BRIEF.md`)
    return `# Implement the bin rule

Use **Open in editor** to work in \`scaffold/src/bin.ts\`. Implement one state transition:

\`\`\`ts
step(stored, event, capacity)
// returns { stored, spilled }
\`\`\`

Keep stored tokens between zero and capacity. The spill count belongs to the current addition,
not earlier events. Cover exact fill, overflow and removal past zero.

Use **Run checks** to exercise your implementation. The project's check command is:

\`\`\`sh
npm test
\`\`\`

## Predict before running

${scenario}

The prediction below supports the coding task. Passing its number checks does not verify your code.`;
  return null;
}

export function AssessmentFixture(): React.JSX.Element {
  return (
    <>
      <CourseView course={ASSESSMENT_COURSE} initialTab="brief" onLeaveCourse={() => undefined} />
      <div className="bg-surface-raised border-line text-ink-dim fixed bottom-8 left-3 z-10 rounded-pill border px-3 py-1 text-2xs">
        Assessment fixture · memory only
      </div>
    </>
  );
}
