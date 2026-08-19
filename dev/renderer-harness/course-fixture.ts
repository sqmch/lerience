/* Purpose-authored public fixture for inspecting the course view.
 *
 * Every path, date, learner detail, module, journal entry, and quiz item in
 * this file is fictional. Nothing was copied from a learner course, provider
 * transcript, development session, or external example repository. */

import type { CourseData, CourseModule } from "../../src/shared/course-data";
import type { CourseSnapshot } from "../../src/shared/ipc";

export const COURSE_ROOT = "C:\\PraxeumFixture\\Courses\\Map vectors";

const LESSON = `# Comparing directions on a map

A direction can be represented as a **vector**. For example, \`[3, 4]\` means
three grid squares east and four north. The pair records both direction and
scale, which are useful for different questions.

## Direction is not distance

Two walkers can head the same way while taking different-sized steps. Their
vectors have different lengths, but their cosine similarity is still \`1\`.

| Pair | Geometric relationship | Cosine similarity |
| --- | --- | --- |
| \`[1, 0]\`, \`[4, 0]\` | same direction | \`1\` |
| \`[1, 0]\`, \`[0, 2]\` | right angle | \`0\` |
| \`[1, 0]\`, \`[-3, 0]\` | opposite directions | \`-1\` |

### The calculation

The dot product supplies the numerator. Vector lengths normalize away the
size of each step:

\`\`\`ts
function cosine(left: number[], right: number[]): number {
  const dot = left.reduce((sum, value, index) => sum + value * right[index]!, 0);
  const leftLength = Math.hypot(...left);
  const rightLength = Math.hypot(...right);
  return dot / (leftLength * rightLength);
}
\`\`\`

There is one boundary worth naming: a zero vector has no direction. Production
code must decide whether to reject it or return a documented sentinel.

## Vocabulary

- vector and magnitude
- dot product
- cosine similarity
- zero-vector boundary
`;

const BRIEF = `# Brief — compare two route segments

Complete three functions in \`scaffold/src/direction.ts\`:

1. \`magnitude(vector)\`
2. \`dot(left, right)\`
3. \`cosineSimilarity(left, right)\`

The checks cover same, perpendicular, and opposite directions plus a rejected
zero vector.

**Time budget:** about one hour. Ask for a hint after two serious attempts.
`;

const QUIZ_DOC = `# Recall — comparing directions

1. What information does vector magnitude carry?
2. Why does cosine similarity divide by both magnitudes?
3. What cosine value represents perpendicular directions?
4. Why does the zero vector need explicit handling?
`;

export function readFixtureDoc(path: string): string | null {
  if (path.endsWith("/LESSON.md")) return LESSON;
  if (path.endsWith("/BRIEF.md")) return BRIEF;
  if (path.endsWith("/quiz.md")) return QUIZ_DOC;
  return null;
}

function module(
  id: string,
  title: string,
  phase: number,
  phaseName: string,
  extra: Partial<CourseModule> = {},
): CourseModule {
  return {
    id,
    title,
    phase,
    phaseName,
    runtime: "node",
    estimatedHours: 1.5,
    status: "not-started",
    bossCheck: false,
    hasVisual: false,
    hasChecks: true,
    hasScaffold: true,
    checkAttempts: 0,
    hintsUsed: [],
    lessonPath: `curriculum/${id}/LESSON.md`,
    briefPath: `curriculum/${id}/BRIEF.md`,
    quizPath: null,
    ...extra,
  };
}

const MODULES: CourseModule[] = [
  module("00-coordinate-vocabulary", "Coordinates and displacement", 0, "Read the map", {
    status: "completed",
    checkAttempts: 2,
    hintsUsed: ["hint-1"],
    note: "Distinguished a position from a displacement after one worked example.",
  }),
  module("01-vector-length", "Vector length", 0, "Read the map", {
    status: "completed",
    checkAttempts: 1,
  }),
  module("02-direction-comparison", "Comparing directions", 0, "Read the map", {
    status: "in-progress",
    estimatedHours: 2,
    hasVisual: true,
    checkAttempts: 2,
    quizPath: "curriculum/02-direction-comparison/quiz.md",
  }),
  module("03-grid-navigation", "Compose a route", 1, "Build with vectors", {
    estimatedHours: 2.5,
  }),
  module("04-projections", "Project onto an axis", 1, "Build with vectors"),
  module("05-route-check", "Explain a route from evidence", 1, "Build with vectors", {
    bossCheck: true,
    estimatedHours: 3,
  }),
  module("06-error-bounds", "Reason about measurement error", 2, "Use the model honestly", {
    estimatedHours: 2,
    runtime: "",
  }),
  module("07-bearings", "Convert vectors to bearings", 2, "Use the model honestly", {
    estimatedHours: 3.5,
  }),
  module("08-field-demo", "Field notebook demo", 2, "Use the model honestly", {
    bossCheck: true,
    estimatedHours: 2.5,
  }),
  /* Deliberately overlong, in both lines a rail entry clips: a title past two
     lines and a runtime string past one. A tutor writes these freely, and no
     rail width holds them — this is the entry that exercises the tooltip. */
  module(
    "09-long-entry-fixture",
    "Reconcile a surveyed traverse against its plotted bearings and close the loop",
    2,
    "Use the model honestly",
    {
      estimatedHours: 4,
      runtime: "node 22 LTS + a fixture check adapter; checks run through the packaged runtime",
    },
  ),
];

const JOURNAL = [
  {
    date: "2000-02-12",
    title: "Direction without step size",
    body: `Compared two route segments that pointed northeast at different scales.
The useful correction was to normalize only when the question is about
direction; distance still needs the original magnitude.

**Left open:** decide how the implementation reports a zero vector.`,
  },
  {
    date: "2000-02-11",
    title: "Length from components",
    body: `Derived the distance formula from a right triangle, then implemented
it with \`Math.hypot\`. Seeded two recall items.`,
  },
];

const QUIZ = [
  {
    id: "fixture-magnitude",
    module: "00-coordinate-vocabulary",
    question: "What does vector magnitude represent in the map model?",
    interval: 4,
    due: "2000-02-09",
    history: [
      {
        date: "2000-02-05",
        result: "partial" as const,
        note: "Described direction first, then corrected to distance.",
      },
    ],
  },
  {
    id: "fixture-normalization",
    module: "00-coordinate-vocabulary",
    question: "Why normalize vectors before comparing direction?",
    interval: 7,
    due: "2000-02-13",
    history: [
      {
        date: "2000-02-06",
        result: "correct" as const,
        note: "Explained that step size should not change the direction score.",
      },
    ],
  },
  {
    id: "fixture-dot-product",
    module: "01-vector-length",
    question: "What does a zero dot product say about two nonzero vectors?",
    interval: 2,
    due: "2000-02-14",
    history: [],
  },
  {
    id: "fixture-zero-vector",
    module: "02-direction-comparison",
    question: "Why is cosine similarity undefined for a zero vector?",
    interval: 1,
    due: "2000-02-20",
    history: [
      {
        date: "2000-02-12",
        result: "tutored" as const,
        note: "Connected the missing direction to division by zero.",
      },
    ],
  },
  {
    id: "fixture-opposite",
    module: "00-coordinate-vocabulary",
    question: "Which cosine value represents opposite directions?",
    interval: 9,
    due: "2000-02-04",
    history: [
      {
        date: "2000-01-26",
        result: "wrong" as const,
        note: "Answered zero, which represents a right angle.",
      },
    ],
  },
];

const DATA: CourseData = {
  currentModuleId: "02-direction-comparison",
  learner: {
    profile: "Fictional fixture learner; comfortable with arithmetic and new to vectors.",
    paceHoursPerWeek: "4",
    started: "2000-02-04",
  },
  modules: MODULES,
  unreadableModuleIds: [],
  quiz: QUIZ,
  journal: JOURNAL,
  labs: [
    {
      key: "vectors",
      title: "Vectors & Similarity",
      blurb: "Drag two arrows. Feel dot product, length, cosine, and distance move.",
      modules: ["02-direction-comparison"],
    },
  ],
  labClaims: [{ moduleId: "02-direction-comparison", lab: { vectors: {} } }],
  courseDoc: "# COURSE.md — Map vectors: direction, distance, and projection\n",
  title: "Map vectors: direction, distance, and projection",
  files: [],
};

export const FIXTURE_COURSE: CourseSnapshot = {
  rootPath: COURSE_ROOT,
  folderName: "Map vectors",
  data: DATA,
};
