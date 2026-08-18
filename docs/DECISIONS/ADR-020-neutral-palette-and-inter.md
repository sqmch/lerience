# ADR-020 — The neutral re-cut, and Inter for the app voice

Date: 2026-08-13 · Status: accepted 2026-08-14
Amends: ADR-015 (Lens) — its RULES are unchanged; this changes the values that express them.
Amends: ADR-008's carried-over type stack.

## Context

The maintainer's read of the real app, verbatim in substance:

> Most importantly, I think we are due for a colour palette and typography
> overhaul. Whatever it is about the current system is not working. Fonts look
> weak and blurred and faint when text is small and everything looks a bit too
> blueish. I think our darks can be darker and our lights can be lighter… We
> want to get a great contrast crisp look… this feels slightly dated. Not
> horrible, but lacking crispness and contrast and modern professional and
> clean polish akin to Linear, T3 Code.

Three separable complaints, and all three turned out to be measurable rather
than a matter of taste.

## Decision

### 1. The greys are neutral

Every ground and every ink in the old ramp was blue-leaning — `#0d0e10` is
r13 g14 b16, and the bias ran +2 to +4 on blue the whole way up. A consistent
blue cast across an entire interface does not read as "cool"; it reads as a
screenshot with the white balance off, which is exactly the "slightly dated"
feeling. **The ramp is now neutral: r = g = b at every step.** The only hue
anywhere is the semantic set, which is what ADR-015 always said and never got.

### 2. The range reaches its ends, and the steps are real steps

Dark stopped at `#0d0e10` and light started at `#f7f7f8`, so neither end
reached its own extreme, and adjacent grounds sat 2–6 points apart — which is
why panels never read as panels and, concretely, why the record overlay
disappeared into the page behind it.

Dark now bottoms out at `#060606` with the workspace at `#0b0b0b`; light's
raised and reading surfaces are pure white. Steps between grounds are 4–8
points. The ink scale was re-measured against the new grounds and holds the
invariants the tests already enforce: ordered `hi > ink > dim > faint` on every
ground, `dim ≥ 7:1`, `faint ≥ 4.5:1`.

### 3. The app voice is Inter, not Satoshi

The small text in this app is *all* the app voice — rails, tabs, meta lines,
status bar, controls. Satoshi is a geometric, display-leaning sans: generous
curves, a modest x-height, and strokes that thin out badly at 11–13px on a
Windows subpixel grid. It was a good pick for a marketing surface and the wrong
one for a dense cockpit, and "weak and blurred and faint when text is small" is
what that looks like from the other side.

Inter was drawn for this job — tall x-height, open apertures, hinting tuned for
small sizes on screens — which is why Linear, Raycast and most of the current
crop of desktop apps run on it. One variable file covers every weight we use.

**Kept deliberately:** Literata for the READING voice (the complaints were
about chrome text, never about lesson prose, and the two-voice split is the
design's own idea — the course speaks in a reading face), and JetBrains Mono
for code and data.

**Publication cleanup, 2026-08-18:** the obsolete Satoshi `woff2` files were
removed before the public-source snapshot. They were unreferenced and absent
from Vite output; private history already preserves the earlier implementation,
so revert convenience did not justify redistributing unused font binaries.

### 4. A modal layer is separated four ways, not one

The record overlay was a dark panel on a dark ground behind a 50% scrim, and it
vanished. A floating layer now sits a step above the workspace in value
(`--bg-raised` over `--bg`), carries a real hairline (`--line-strong`) so its
edge is drawn rather than implied, casts a deeper shadow, and both dims and
**blurs** what is behind it (`--scrim` + `--blur-scrim`). Any one of those alone
was not enough.

### 5. Scrollbars are chrome

The default Windows scrollbar is a light slab with its own track edge. Sitting
next to a column seam it read as a second and third vertical rule. Scrollbars
are now `thin`, trackless, and thumbed in `--line-strong`.

## Rejected

- **Geist** as the app voice. A real alternative and arguably more of-the-
  moment, but Inter is the more battle-tested face for dense UI and is what the
  named reference apps actually use. Worth revisiting only as a whole-identity
  decision, not as a font swap.
- **Replacing Literata too.** Nothing in the feedback was about lesson prose,
  and collapsing to one face would delete the two-voice system (ADR-015) as a
  side effect of a legibility fix.
- **`-webkit-font-smoothing: antialiased`.** It makes light-on-dark text
  *thinner*, which is the reported problem, not the fix.
- **Pure black (`#000`) as the dark ground.** Vercel-style, and it makes every
  elevation step above it look like a smudge. `#0b0b0b` leaves room for the
  four grounds that sit on top of it.

## Reopens if

- The palette re-cut lands and the app still reads dated — at which point the
  problem is composition, not colour, and the next move is spacing and density
  rather than another set of hexes.
- A real brand identity arrives (the naming decision is parked, SPEC §9), which
  would give the accent an actual colour to be and change what "no brand hue in
  chrome" costs.
