import { z } from "zod";

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const uuid = z.string().uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const assessmentModuleId = z.string().regex(/^[0-9]{2}-[a-z0-9-]{1,80}$/);
export const assessmentHelp = z.enum(["unknown", "none", "hint-1", "hint-2", "hint-3", "outside"]);
export const assessmentQuestion = z
  .object({
    schemaVersion: z.literal(1),
    moduleId: assessmentModuleId,
    questionId: id,
    version: z.number().int().positive(),
    title: z.string().min(1).max(300),
    prompt: z.string().min(1).max(12000),
    fields: z
      .array(
        z
          .object({
            id,
            kind: z.enum(["integer", "explanation"]),
            label: z.string().min(1).max(500),
            units: z.string().max(100),
          })
          .strict(),
      )
      .min(2)
      .max(12),
    criteria: z
      .array(z.object({ id, description: z.string().min(1).max(1000) }).strict())
      .min(1)
      .max(8),
  })
  .strict();
export const assessmentFeedback = z
  .object({
    id: uuid,
    attemptId: uuid,
    sourceDigest: digest,
    author: z.literal("tutor"),
    createdAt: z.string(),
    criteria: z
      .array(
        z
          .object({
            criterionId: id,
            state: z.enum(["supported", "needs-work", "uncertain"]),
            excerpt: z.string().max(4000),
            rationale: z.string().min(1).max(4000),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();
export const assessmentAttempt = z
  .object({
    schemaVersion: z.literal(1),
    id: uuid,
    courseId: uuid,
    sourceDigest: digest,
    question: assessmentQuestion,
    revision: z.number().int().positive(),
    status: z.enum(["draft", "submitted"]),
    raw: z.record(id, z.string().max(4000)),
    help: assessmentHelp,
    afterFeedback: z.boolean(),
    revisesAttemptId: uuid.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    submittedAt: z.string().nullable(),
    objective: z.array(
      z
        .object({
          fieldId: id,
          state: z.enum(["correct", "incorrect", "check-error"]),
          expected: z.number().nullable(),
        })
        .strict(),
    ),
    feedback: z.array(assessmentFeedback).max(40),
    events: z
      .array(
        z
          .object({
            id: uuid,
            kind: z.enum(["help", "dispute", "review"]),
            text: z.string().max(4000),
            createdAt: z.string(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export const assessmentView = z
  .object({
    state: z.enum(["available", "none", "unsupported"]),
    detail: z.string(),
    question: assessmentQuestion.nullable(),
    sourceDigest: digest.nullable(),
    attempts: z.array(assessmentAttempt).max(100),
  })
  .strict();
export const assessmentCommand = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("read"), moduleId: assessmentModuleId }).strict(),
  z
    .object({
      operation: z.literal("save"),
      moduleId: assessmentModuleId,
      id: uuid,
      sourceDigest: digest,
      revision: z.number().int().nonnegative(),
      raw: z.record(id, z.string().max(4000)),
      help: assessmentHelp,
      revisesAttemptId: uuid.nullable(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("submit"),
      moduleId: assessmentModuleId,
      id: uuid,
      sourceDigest: digest,
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("event"),
      moduleId: assessmentModuleId,
      id: uuid,
      eventId: uuid,
      kind: z.enum(["help", "dispute"]),
      text: z.string().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      operation: z.literal("review"),
      moduleId: assessmentModuleId,
      id: uuid,
      requestId: uuid,
    })
    .strict(),
]);
export type AssessmentQuestion = z.infer<typeof assessmentQuestion>;
export type AssessmentAttempt = z.infer<typeof assessmentAttempt>;
export type AssessmentView = z.infer<typeof assessmentView>;
export type AssessmentCommand = z.infer<typeof assessmentCommand>;
export type AssessmentReply =
  | { ok: true; view: AssessmentView }
  | { ok: false; detail: string; fields?: Record<string, string> };
