# ADR-015 — The Lens palette: monochrome chrome, colour only where it means something

Date: 2026-08-12 · Status: accepted · Supersedes the palette clause of ADR-008

## Decision

The re-cut ADR-008 reserved is done. The palette is **Lens**, and it is a set of rules, not just
values (the values live where they always did, in `tokens.css`):

- **Chrome carries no brand hue.** The primary action is plain near-white on dark and near-black
  on light. There is no accent colour in the interface's furniture.
- **Colour is reserved for meaning.** `--attention` marks work waiting (recall due), `--warn`
  marks a state the learner must repair (a moved folder), `--ok`/`--bad` stay grade feedback.
  The accent never doubles as a status, and a status hue is never used decoratively.
- **Grounds step far enough apart to read.** Workspace, raised, and panel surfaces are separated
  by real value steps, and hairlines are strong enough to read as edges.
- **The frame sits a step above the workspace** in value, so a window reads as a window
  (see ADR-016).
- **Two voices, correctly scoped.** Literata is the *course* speaking: lesson prose, tutor turns,
  and the titles belonging to them. Everything the *app* says is Satoshi, including every
  dashboard and chrome surface. Mono stays data.
- **One radius rule:** controls (buttons, inputs, chips) are fully round; cards are 14px.
- **Both themes are first-class.** The app follows the OS by default and offers an explicit
  override that wins in both directions. Neither theme is a tinted afterthought of the other.

## Why

- The maintainer-led audit rejected the carried D2 palette as plain and dated: the warm umber greys
  sat within about six points of each other so cards never read as cards, the hairlines were too
  faint to read as edges, and serif headings on chrome made a desktop tool read as an editorial
  blog. Composition was not the problem; the surface was.
- Monochrome chrome is the lens thesis made visible. The app renders course files and owns
  nothing (ADR-006, ADR-012); giving its furniture a brand hue makes the chrome compete with
  course material for the eye. With no accent in the frame, the only coloured things on screen
  are the course's own content and the states the learner must act on.
- Separating semantic colour from the accent is what keeps colour informative. A candidate
  direction that used one warm accent for the primary action, the live state, and the due count
  lit six places at once, and the colour stopped meaning anything in particular.
- ADR-008 predicted the cost correctly: the structure survived intact and the re-cut was a
  values-and-rules change, not a rebuild. The two-voice split also survived; it was only ever
  mis-scoped, applied by heading-vs-body instead of by whose words these are.

## Rejected

Keeping the D2 palette (the maintainer rejected it on sight, and ADR-008 always named the colours as
the cheap, contested part). A single branded accent hue — the "Lamp" candidate, a warm signal on a
cool ground — which was attractive and kept a thread to the old identity, but degraded its own
signal by carrying action, liveness and attention at once, and put a brand colour back in front of
course content. A light-led "Paper" direction as the sole answer (its reasoning survives in the
first-class light theme and in the reading surface's paper treatment, but a single-theme default
is not something this product needs to choose). Deferring the re-cut again, as ADR-008 allowed:
it had become the blocker for every remaining surface's design.

## Reopens if

- A surface genuinely needs a second accent, or monochrome chrome proves too flat once the
  seminar is built — that surface has far more live state than the dashboard, and is where a
  colourless frame would show strain first. The rule that would bend is "no hue in chrome", not
  "semantic colour stays separate"; the latter is the load-bearing half.
