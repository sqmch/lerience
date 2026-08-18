/* The recall marks — the second of the two hand-drawn marks in praxeum.
 *
 * Four grades and a not-yet-asked state, told by FILL rather than by colour
 * alone: filled is correct, half-filled is partial, hollow is wrong, ringed is
 * tutored, and a small solid dot means the item is seeded but never asked. The
 * colours reinforce that; they do not carry it, which is what keeps the marks
 * legible to a colour-blind reader and in a screenshot.
 *
 * They were CSS (border tricks, a gradient, a scaled pseudo-element) in the
 * carried-over D2 sheet. They are geometry, so they are geometry now. */

import type { RecallResult } from "../../../shared/course-data";

export const GRADE_WORD: Record<RecallResult, string> = {
  correct: "correct",
  partial: "partial",
  wrong: "not yet",
  tutored: "tutored",
};

const TONE: Record<RecallResult, string> = {
  correct: "text-ok",
  partial: "text-warn",
  wrong: "text-bad",
  tutored: "text-accent",
};

export function RecallMark({
  result,
  className = "",
}: {
  /** null = seeded and never asked. */
  result: RecallResult | null;
  className?: string;
}): React.JSX.Element {
  const tone = result === null ? "text-ink-faint" : TONE[result];
  return (
    <svg
      viewBox="0 0 10 10"
      className={`${tone} size-2.5 ${className}`}
      role="img"
      aria-label={result === null ? "never asked" : GRADE_WORD[result]}
    >
      {result === null ? (
        <circle cx="5" cy="5" r="2.2" fill="currentColor" />
      ) : (
        <>
          <circle
            cx="5"
            cy="5"
            r="4.1"
            fill={result === "correct" ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
          />
          {/* Half-filled by clipping the disc, not by a gradient: a gradient's
              midpoint softens at fractional device pixels and the mark stops
              reading as exactly half. */}
          {result === "partial" ? (
            <path d="M5 0.9 A4.1 4.1 0 0 0 5 9.1 Z" fill="currentColor" />
          ) : null}
          {result === "tutored" ? <circle cx="5" cy="5" r="1.9" fill="currentColor" /> : null}
        </>
      )}
    </svg>
  );
}
