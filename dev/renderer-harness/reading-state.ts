/* Synthetic source revisions for the renderer harness. */
export const READING_REVISIONS = [
  "original",
  "inserted",
  "changed",
  "ambiguous",
  "missing",
] as const;
export type ReadingRevision = (typeof READING_REVISIONS)[number];
