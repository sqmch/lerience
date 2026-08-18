// Zod adapters over the internal Course Engine format. SOURCE OF TRUTH is:
// course-engine/template/docs/FORMAT.md + course-engine/template/docs/schema/.
// When these disagree with the engine spec, the engine wins and this file gets fixed.
// The compatibility invariant (ADR-002): a course the app opens must pass the engine's
// `npm run validate` unchanged; tests/engine-schema.test.ts mechanizes the mirror.
// Carried from the previous project's @praxeum/core (its tests came along too).

import { z } from "zod";

/** Canonical format-v0 date field: shape only, matching the engine JSON Schemas. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---------------------------------------------------------------- module.json

export const moduleManifestSchema = z.object({
  id: z.string().regex(/^[0-9]{2}-[a-z0-9-]+$/), // = directory name, e.g. "02-vector-store"
  title: z.string(),
  phase: z.number().int().nonnegative(),
  phaseName: z.string().optional(),
  prerequisites: z.array(z.string()),
  runtime: z.string(), // empty string is the honest value for seminar-mode modules
  estimatedHours: z.number().nonnegative(),
  provenance: z.enum(["core", "tutor-generated"]),
  volatileLayer: z.enum(["generated-at-start", "present"]),
  bossCheck: z.boolean().optional(),
});
export type ModuleManifest = z.infer<typeof moduleManifestSchema>;

// ---------------------------------------------------------- tutor/progress.json

export const bossCheckAttemptSchema = z.object({
  date: isoDate,
  outcome: z.enum(["passed", "failed"]),
  notes: z.string().optional(),
});

export const moduleProgressSchema = z.object({
  status: z.enum(["not-started", "in-progress", "completed"]),
  startedAt: isoDate.optional(),
  completedAt: isoDate.nullish(),
  hintsUsed: z.array(z.string()).default([]),
  checkAttempts: z.number().int().nonnegative().default(0),
  notes: z.string().default(""),
  bossCheck: z
    .object({
      passedAt: isoDate.nullable(),
      attempts: z.array(bossCheckAttemptSchema),
    })
    .optional(),
});

export const progressSchema = z.object({
  learner: z.object({
    profile: z.string(),
    paceHoursPerWeek: z.string(),
    // Format v0 intentionally permits any string; the template starts empty.
    started: z.string(),
  }),
  // The engine template uses null before the first curriculum module exists.
  currentModule: z.string().nullable(),
  modules: z.record(z.string(), moduleProgressSchema),
});
export type Progress = z.infer<typeof progressSchema>;

// --------------------------------------------------------- tutor/quiz-bank.json

/** Grades only. "rescheduled" is the tolerated LEGACY shape (pre-moves banks); readers
 *  must never treat it as a grade — the interval arithmetic ignores history entirely. */
export const quizHistoryEntrySchema = z.object({
  date: isoDate,
  result: z.enum(["correct", "partial", "wrong", "tutored", "rescheduled"]),
  note: z.string().optional(),
});

/** Bookkeeping that is NOT a grade. `to` is absent on entries migrated from legacy banks. */
export const quizMoveEntrySchema = z.object({
  date: isoDate,
  action: z.literal("rescheduled"),
  to: isoDate.optional(),
  note: z.string().optional(),
});

export const quizItemSchema = z.object({
  id: z.string(), // module prefix + slug, unique in the bank
  module: z.string(),
  question: z.string(),
  interval: z.number().int().positive(), // whole days
  due: isoDate,
  history: z.array(quizHistoryEntrySchema),
  moves: z.array(quizMoveEntrySchema).optional(),
});
export type QuizItem = z.infer<typeof quizItemSchema>;

export const quizBankSchema = z.object({
  items: z.array(quizItemSchema),
});
export type QuizBank = z.infer<typeof quizBankSchema>;
