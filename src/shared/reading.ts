import { z } from "zod";
export const EXTRACTION_VERSION = "marked18-prose-v1" as const;
const uuid = z.string().uuid();
const moduleId = z.string().regex(/^[0-9]{2}-[a-z0-9-]{1,80}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const readingPassage = z
  .object({
    index: z.number().int().min(0).max(10000),
    heading: z.string().max(2000),
    text: z.string().max(16000),
  })
  .strict();
const anchor = {
  ...readingPassage.shape,
  sourceDigest: digest,
  extractionVersion: z.literal(EXTRACTION_VERSION),
  start: z.number().int().min(0).max(16000),
  end: z.number().int().min(1).max(16000),
  quote: z.string().min(1).max(16000),
};
export const readingMark = z
  .object({
    ...anchor,
    id: uuid,
    courseId: uuid,
    moduleId,
    lessonPath: z.string().max(120),
    createdAt: z.string().max(40),
  })
  .strict();
export const readingView = z
  .object({
    supported: z.boolean(),
    revision: z.number().int().nonnegative(),
    marks: z.array(readingMark).max(200),
    source: z
      .object({ digest, markdown: z.string(), passages: z.array(readingPassage) })
      .strict()
      .nullable(),
    matches: z.record(
      uuid,
      z.object({ index: z.number().int().nonnegative(), changed: z.boolean() }).strict().nullable(),
    ),
  })
  .strict();
export const readingCommand = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("read"), moduleId: moduleId.nullable() }).strict(),
  z
    .object({
      operation: z.literal("add"),
      moduleId,
      id: uuid,
      revision: z.number().int().nonnegative(),
      ...anchor,
    })
    .strict(),
  z
    .object({
      operation: z.literal("remove"),
      moduleId: moduleId.nullable(),
      id: uuid,
      revision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type ReadingMark = z.infer<typeof readingMark>;
export type ReadingView = z.infer<typeof readingView>;
export type ReadingCommand = z.infer<typeof readingCommand>;
export type ReadingReply = { ok: true; view: ReadingView } | { ok: false; detail: string };
