/* Original synthetic material for the disposable reading preview. */
import type { CourseSnapshot } from "../../src/shared/ipc";
import type { ReadingRevision } from "./reading-state";
export const READING_MODULE = "01-parcel-tray";
const COLLECTION =
  "One collection removes one parcel from the tray. Parcels on the waiting shelf stay there until a separate refill event moves them into available tray spaces. **Collection alone does not refill the tray.**";
const START = `# The parcel tray

A small model for following changes, one event at a time. Read at your own pace; marking a passage is optional.

## Arrivals

The tray has **four spaces**. Each arrival fills a free space if one is available. When the tray is full, a new parcel goes to the waiting shelf. An arrival never moves a parcel already in the tray.
`;
const END = `
## A short trace

Start with three parcels in the tray and none on the shelf. Two arrivals leave four in the tray and one on the shelf. One collection leaves three in the tray and one on the shelf. A refill then leaves four in the tray and none on the shelf.

## Read the event, then the state

Keep the two places separate as you trace. A parcel on the shelf has not entered the tray. The event tells you what can move; available space alone does not tell you what happens next.

If you want to try a case, start with a full tray and two waiting parcels. Describe what changes after a collection, then after a refill. A sketch or a spoken explanation is enough.

The [companion brief](BRIEF.md) offers another case to discuss. There is no required response form or completion action on this page.
`;
export const READING_LESSONS: Record<ReadingRevision, string> = {
  original: `${START}\n## Collection\n\n${COLLECTION}\n${END}`,
  inserted: `${START}\nAn arrival and a collection are different events. We will track them separately.\n\n## Collection\n\n${COLLECTION}\n${END}`,
  changed: `${START}\n## Collection\n\nOne collection removes one parcel, then immediately refills one free space from the waiting shelf if possible.\n${END}`,
  ambiguous: `${START}\n## Collection\n\n${COLLECTION}\n\n${COLLECTION}\n${END}`,
  missing: `${START}\n## Collection\n\n${END}`,
};
export const READING_COURSE: CourseSnapshot = {
  rootPath: "C:\\PraxeumFixture\\Courses\\Parcel tray",
  folderName: "Parcel tray",
  data: {
    title: "Following a change",
    currentModuleId: READING_MODULE,
    learner: { profile: "Synthetic reader", paceHoursPerWeek: "2", started: "2026-01-01" },
    unreadableModuleIds: [],
    quiz: [],
    journal: [],
    labs: [],
    labClaims: [],
    files: [],
    courseDoc: null,
    modules: [
      {
        id: READING_MODULE,
        title: "The parcel tray",
        phase: 0,
        phaseName: "Read and reason",
        runtime: "",
        estimatedHours: 0.25,
        status: "in-progress",
        bossCheck: false,
        hasVisual: false,
        hasChecks: false,
        hasScaffold: false,
        checkAttempts: 0,
        hintsUsed: [],
        lessonPath: `curriculum/${READING_MODULE}/LESSON.md`,
        briefPath: `curriculum/${READING_MODULE}/BRIEF.md`,
        quizPath: null,
      },
    ],
  },
};
export function readReadingDoc(path: string): string | null {
  if (path.endsWith("/LESSON.md")) return READING_LESSONS.original;
  if (path.endsWith("/BRIEF.md"))
    return "# Another way to follow the tray\n\nSketch a full tray with two waiting parcels. Explain a collection and a refill in your own words. Discuss it when you want to. There is no form to complete.";
  return null;
}
