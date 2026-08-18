import type { ModuleManifest, Progress, QuizBank } from "../src/shared/engine/schemas";

export const validModuleManifest: ModuleManifest = {
  id: "02-vector-store",
  title: "A Vector Store from Scratch",
  phase: 1,
  phaseName: "Retrieval",
  prerequisites: ["01-embeddings"],
  runtime: "node",
  estimatedHours: 2.5,
  provenance: "core",
  volatileLayer: "generated-at-start",
  bossCheck: true,
};

export const validProgress: Progress = {
  learner: {
    profile: "Experienced TypeScript developer",
    paceHoursPerWeek: "3-5",
    started: "2026-07-01",
  },
  currentModule: "02-vector-store",
  modules: {
    "01-embeddings": {
      status: "completed",
      startedAt: "2026-07-02",
      completedAt: "2026-07-04",
      hintsUsed: ["hint-1"],
      checkAttempts: 2,
      notes: "Recovered the geometric intuition on the second attempt.",
      bossCheck: {
        passedAt: "2026-07-04",
        attempts: [
          {
            date: "2026-07-03",
            outcome: "failed",
            notes: "Could not explain cosine similarity.",
          },
          {
            date: "2026-07-04",
            outcome: "passed",
            notes: "Explained and defended the trade-offs cleanly.",
          },
        ],
      },
    },
  },
};

export const validQuizBank: QuizBank = {
  items: [
    {
      id: "01-vector-distance",
      module: "01-embeddings",
      question: "Why does cosine similarity ignore vector magnitude?",
      interval: 3,
      due: "2026-07-08",
      history: [
        {
          date: "2026-07-05",
          result: "correct",
          note: "First correct recall earned three days.",
        },
      ],
      moves: [
        {
          date: "2026-07-06",
          action: "rescheduled",
          to: "2026-07-09",
          note: "Travel day.",
        },
      ],
    },
  ],
};

export const validLegacyQuizBank: QuizBank = {
  items: [
    {
      id: "00-statelessness",
      module: "00-orientation",
      question: "Where does the tutor's durable memory live?",
      interval: 2,
      due: "2026-07-10",
      history: [
        { date: "2026-07-06", result: "correct" },
        { date: "2026-07-07", result: "rescheduled", note: "Learner unavailable." },
      ],
    },
  ],
};
