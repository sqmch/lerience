/* Tiny inline glyphs (were Tabler icons; inlined to keep the renderer
   dependency-light until the component layer lands). Size comes from the
   consuming CSS — these only carry geometry. */

export function DiamondGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3.5 L20.5 12 L12 20.5 L3.5 12 Z" />
    </svg>
  );
}

export function PlayGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 4.5 L19 12 L7 19.5 Z" />
    </svg>
  );
}

/** A ring with one bright arc. The track keeps the shape readable while it
 *  turns, which is what separates a spinner from a flickering line. */
export function SpinnerGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path
        d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CheckGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12.5 L10 17.5 L19 6.5" />
    </svg>
  );
}

/** The back affordance. A chevron rather than an arrow: an arrow reads as
 *  "undo/previous item", a chevron as "out of here, up a level". */
export function ChevronLeftGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M14.5 5 L7.5 12 L14.5 19" />
    </svg>
  );
}

/** The disclosure mark every menu trigger carries. Its own 10-unit box rather
 *  than the 24-unit one the others use: at 10px the stroke has to be drawn for
 *  the size it is shown at, or the chevron reads as a smudge. */
export function ChevronDownGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2.5 4 L5 6.5 L7.5 4" />
    </svg>
  );
}

/** The record: stacked leaves, because that is what it is — the quiz bank, the
 *  journal, and progress, kept one on top of the other in `tutor/`. */
export function StackGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3.5 L21 8 L12 12.5 L3 8 Z" />
      <path d="M3.5 12.5 L12 16.75 L20.5 12.5" />
      <path d="M3.5 16.75 L12 21 L20.5 16.75" />
    </svg>
  );
}

export function FolderGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 6.5 A1.5 1.5 0 0 1 4.5 5 H9 L11.5 7.5 H19.5 A1.5 1.5 0 0 1 21 9 V17.5 A1.5 1.5 0 0 1 19.5 19 H4.5 A1.5 1.5 0 0 1 3 17.5 Z" />
    </svg>
  );
}

/** The learner's own editor: angle brackets, the one mark every editor and
 *  every learner already reads as "code". Drawn in the 24-unit grid with the
 *  same 2-unit stroke as the folder and stack glyphs it sits beside. */
export function CodeGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8.5 7 L3.5 12 L8.5 17" />
      <path d="M15.5 7 L20.5 12 L15.5 17" />
    </svg>
  );
}

/** Ending something: the cross every window and every dialog closes on. Same
 *  24-unit grid and 2-unit stroke as the glyphs it sits beside, drawn a little
 *  inside their bounds so it does not read heavier than they do at the same
 *  size — a diagonal covers more of a box than an upright shape does. */
export function CloseGlyph({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6.5 6.5 L17.5 17.5" />
      <path d="M17.5 6.5 L6.5 17.5" />
    </svg>
  );
}
