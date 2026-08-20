/* The control vocabulary, in one place because two surfaces now speak it.
   Lens (ADR-015) expressed as classes: the primary action is a value contrast
   rather than a hue, every control is fully round (the ratified radius rule),
   and hover changes border or background only — never position.

   Full literal strings, never interpolated fragments: Tailwind scans source
   text, so a class name assembled at runtime compiles to nothing. */

/* `inline-flex items-center gap-2` is not decoration: without it a button that
   carries a glyph lays the glyph out as an inline box on the text baseline,
   with no gap and no vertical centring. Every button in the app can carry a
   glyph, so the layout belongs in the vocabulary rather than at each call site. */
const SHAPE = "inline-flex items-center justify-center gap-2 whitespace-nowrap ";

export const PRIMARY =
  SHAPE +
  "bg-accent text-accent-ink rounded-pill px-4 py-2 font-medium transition-[filter] " +
  "hover:brightness-95 disabled:opacity-50 disabled:hover:brightness-100 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export const QUIET =
  SHAPE +
  "border-line-strong text-ink rounded-pill border px-4 py-2 font-medium transition-colors " +
  "hover:bg-accent-wash hover:border-ink-faint disabled:opacity-50 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/* A ghost button: navigation and other "get me out of here" actions that must
   be findable without competing with the one primary action on the surface.
   It reads as a control (hit area, hover ground, focus ring) rather than as a
   link — an underlined sentence floating under a form reads as fine print,
   which is exactly how the first-run screen's way out was landing. */
export const GHOST =
  SHAPE +
  "text-ink-dim hover:bg-accent-wash hover:text-hi rounded-pill px-2.5 py-1.5 transition-colors " +
  "disabled:opacity-50 focus-visible:outline-2 focus-visible:-outline-offset-2 " +
  "focus-visible:outline-focus";

export const LINKISH =
  "text-ink-dim hover:text-hi decoration-line-strong hover:decoration-ink-faint text-sm underline " +
  "underline-offset-4 transition-colors rounded-xs focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-focus";

/* An instrument: a chrome control, quiet where it sits until you reach for
   it. No border at rest — a head row or a footer full of outlined pills reads
   as a toolbar competing with the work — and border, ground and full ink
   together on hover, so the whole thing arrives as one control rather than
   lighting up in pieces. `aria-pressed` holds that state for the ones that
   toggle something open.

   The transparent border is drawn, not omitted: it holds the pixel the hover
   border needs, so nothing shifts under the pointer. */
export const INSTRUMENT =
  "border-transparent text-ink-dim hover:bg-surface-raised hover:border-line hover:text-hi " +
  "focus-visible:outline-focus flex min-w-0 items-center gap-1.5 rounded-pill border px-2.5 py-1.5 " +
  "text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 " +
  "aria-pressed:bg-surface-raised aria-pressed:border-line aria-pressed:text-hi";

export const CHIP = "font-data rounded-pill px-2 py-0.5 text-2xs font-medium tabular-nums";
