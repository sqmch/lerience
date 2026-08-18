/* The header vocabulary, in one place because more than one surface speaks it.
   A learner crossing from onboarding into the course view must not see the way
   out change shape underneath them. The course view and onboarding therefore
   use the same ghost-pill back control.

   Both the course view and onboarding hand these parts to the window's own
   title bar (ADR-016). The shared parts keep those surfaces from drifting. */

import { GHOST } from "../components/controls";
import { ChevronLeftGlyph } from "../components/glyphs";

/** The way out, and always the same one. `no-drag` unconditionally: it is
 *  required inside the title bar and harmless outside it, which is one rule
 *  fewer for a caller to get wrong. */
export function BackToCourses({ onLeaveCourse }: { onLeaveCourse: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onLeaveCourse}
      className={`${GHOST} no-drag -ml-1.5 shrink-0 gap-1 py-1 text-xs`}
    >
      <ChevronLeftGlyph className="size-3.5" />
      <span>Courses</span>
    </button>
  );
}

/** The hairline between the way out and where you are.
 *
 *  The margins are OPTICAL, not arithmetic, and that is the whole point. A
 *  ghost button carries ~10px of padding you cannot see, so a rule spaced
 *  evenly from the two BOXES sits 18px from the word "Courses" and 8px from
 *  the title, so it reads off-centre.
 *  Space it from the two things that are actually drawn instead: 12px each
 *  side, which still leaves the button's hover ground 2px of clearance so the
 *  pill never touches the rule. The title carries the other half (`ml-1`),
 *  because a margin that belongs to a gap has to be paid by both sides. */
export function TitleRule(): React.JSX.Element {
  return <span className="bg-line -ml-1.5 h-3.5 w-(--stroke-hair) shrink-0" aria-hidden="true" />;
}
