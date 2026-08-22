/* Turning what a learner types into a course folder name.
 *
 * The create field takes a rough answer — "Applied AI systems", or a whole
 * sentence — and course creation must work with no provider at all (ADR-004),
 * so nothing waits on a model to name the folder. The real title arrives later,
 * written by the tutor into COURSE.md, and every surface prefers it from then
 * on. What lands on disk in the meantime should still be a folder name a person
 * is happy to see in their file manager: lowercase, dash-joined, and not a
 * paragraph.
 *
 * Pure string work, in shared so the renderer can preview the exact folder the
 * main process will create. The portability guard (validateCourseName, in the
 * creator) still runs on the result — this shapes the name, it does not vouch
 * for it. */

/** Long enough for a real title, short enough that a folder list stays
 *  readable; a sentence gets cut here, at a word boundary. */
const MAX_SLUG_LENGTH = 48;

/**
 * A folder-safe slug: lowercase, words joined by single dashes, accents
 * flattened on scripts that decompose, other scripts kept intact (a Japanese
 * or Greek course name stays itself rather than vanishing). Returns "" when
 * the input holds nothing usable — all punctuation, say — which the caller
 * treats as "not a name yet".
 */
export function slugifyCourseName(raw: string): string {
  const flattened = raw
    .normalize("NFKD")
    // Drop combining marks left by the decomposition ("é" → "e"). Letters that
    // do not decompose (CJK, and the like) are untouched.
    .replace(/\p{M}+/gu, "");
  const dashed = flattened
    .toLowerCase()
    // Any run of non-(letter or number) becomes one dash: spaces, punctuation,
    // emoji, the lot.
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (dashed.length <= MAX_SLUG_LENGTH) return dashed;

  // Too long: cut to the budget, then back up to the last whole word so the
  // name never ends mid-token. If the first word already overruns, a hard cut
  // is the only option.
  const clipped = dashed.slice(0, MAX_SLUG_LENGTH);
  const lastDash = clipped.lastIndexOf("-");
  return (lastDash > 0 ? clipped.slice(0, lastDash) : clipped).replace(/-+$/u, "");
}
