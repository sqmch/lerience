# ADR-019 — The course workspace

Date: 2026-08-13 · Status: accepted 2026-08-14
Amends: nothing. Extends ADR-015 (Lens), ADR-016 (app-drawn frame), ADR-017 (Tailwind from
tokens). Discharges the one-chat rule recorded in STATUS's ledger (2026-08-12 night).

## Context

The course view is the surface a learner lives in, and it is the last one still wearing the
first prototype. The maintainer's audit called it "closest to right" but named four specific
faults: the title bar and navigation have no app-shell convention (a bare "Courses" link with
poor contrast and no back affordance, the title placed oddly), the seams do not resize, the
lab overlay is broken and the wrong shape, and the seminar is prototypey. Underneath those,
two structural facts:

1. **The course view is the only surface that does not use `AppShell`.** It draws its own
   `.app-shell` grid and its own `.course-bar`, so it has no status bar, no theme control, and
   a different frame from the dashboard and onboarding — in the same window, one keystroke
   apart.
2. **It is the last surface on the D2 signature CSS.** The styling boundary in `docs/DESIGN.md`
   says one styling idiom per surface and no surface left half-migrated.

## Decision

### 1. One frame. The course view is a surface inside `AppShell`, like every other

`.course-bar` is deleted, not restyled. Its four jobs are redistributed to the places the app
already has for them:

| Was in the course bar | Now |
| --- | --- |
| "Courses" text link | A real back control in the **title bar**, with a glyph and a hit area |
| Course name | The **title bar**'s title — it is the window's identity, so it belongs in the window's frame |
| Folder / Lab / Record | The **rail's footer** — they are course-scoped, and the rail is the course-scoped column |
| Progress meter | The **rail's header**, beside the count it is a picture of |
| — | The **status bar** gains the ambient facts: course path, session phase, session cost |

The title bar keeps its right end clear: Windows draws the caption buttons into that strip
(ADR-016), so nothing may be right-aligned there. The bar's content is left-aligned and
truncates, with reserved padding equal to the caption strip.

**Why the rail's footer rather than a second horizontal band:** a band costs every reader
~44px of vertical space forever to hold three controls used a few times a session. The rail
already runs the full height and already owns course-scope. Removing the band is what buys
the reading surface its height back.

### 2. The three columns resize, and the resize is a real control

Two splitters, each a `role="separator"` with `aria-orientation="vertical"`,
`aria-valuenow/min/max`, `tabindex=0`, arrow keys (±1 step, ±4 with Shift), Home/End to the
clamp, and double-click to reset. Drag and keyboard clamp identically because both read the
SAME numbers: the `--rail-w-*` / `--talk-w-*` / `--page-w-min` tokens, read off computed style
at runtime rather than restated as literals in TypeScript. tokens.css already anticipated this
("the two disagreeing is how a keyboard resize parks a pane where a drag can never reach it").

The reading pane is the residue: the rail and the seminar are sized, and the material pane
takes what is left, floored at `--page-w-min`. When the window is too narrow to honour every
floor, the seminar yields first — it is the column with the smallest usable width.

**Persistence: app-wide, in `settings.json`, not per course.** A learner arranges their window
once. Making it per-course would mean the same app rearranging itself as you move between
courses, which reads as a bug. It is a window preference and it lives with the other one
(theme).

### 3. The lab is a stage, not a page with a stage on it

The audit's finding is a layout bug and a design error in one: a 288px nav column plus a
44rem reading measure squeezed the visual — the thing the overlay exists for — into a small
canvas. ADR-012 says the app is a stage; this is where that has to be true.

The visual now fills the overlay. The switcher becomes a compact menu in the head row (a
single control naming the current visual, only present when the course has more than one),
and the blurb/focus note becomes one line under it. The reading-measure column does not apply
to the stage — a visual answers to its own geometry, not to a prose measure.

### 4. There is one chat, and this is where that gets proved

The seminar column renders `seminar/parts.tsx` — the same `Composer`, `TutorTurn`,
`LearnerTurn`, `ApprovalCard`, `FailureNotice` and `Thinking` the onboarding surface renders,
driven by the same `use-seminar.ts`. The `.course-talk` / `.turn-*` / `.composer` /
`.approval-*` families are deleted. This was recorded as binding when onboarding shipped
("the course view's seminar column adopts it when that surface is rebuilt"); this ADR is the
moment it is discharged, so the promise does not quietly expire.

Consequence the maintainer should know: the course view's conversation gains everything
onboarding earned across five live runs — the auto-growing composer, the session-control
pills (ADR-018), mid-turn queued sends, the file-edit grant, the silent-turn retry, and the
ResizeObserver scroll pinning. It loses the TUTOR/YOU eyebrow labels, because the two type
voices are the labels.

### 5. `course.css` retires to the markdown stylesheet

What is left after this migration is `.prose` and the two `.doc-visual-*` classes. Those stay
CSS on purpose and are not a migration debt: they style HTML that markdown generates and
DOMPurify sanitizes, which cannot carry utility classes. `labs/lab.css` stays hand-written
forever (ADR-012 port). Everything else in the file dies with the surface it belonged to.

## Rejected

- **A second horizontal toolbar under the title bar.** Conventional, and the reason so many
  Electron apps feel cramped. See above: it is a permanent vertical tax for occasional
  controls.
- **Putting the instruments in the title bar's right end.** The caption strip owns that space
  on Windows, and a row that is partly ours and partly the OS's is exactly the seam that
  breaks on a DPI change or a Snap Layouts hover.
- **Radix Dialog for the overlays.** The native `<dialog>` already gives focus trap, ESC, and
  `::backdrop`, and it is proven here. Swapping it would be churn for parity.
- **Per-course pane widths.** See above.
- **A "workspace layout" preset menu** (focus mode, reading mode). Real feature, wrong moment:
  the seams have to exist before presets over them mean anything.
- **Persisting pane widths in `localStorage`.** App state lives in app-data (ADR-010), and the
  renderer already has no other private store.

## Amended the same day, from the maintainer's first run of the built surface

Six findings, five of them mine to fix and one a question:

1. **Control glyphs were not laid out.** `PRIMARY`/`QUIET` carried no
   `inline-flex`, so any button with a glyph put it on the text baseline with no
   gap — "Run checks" shipped with the glyph jammed into the R and the spinner
   riding over the border. The layout is in the control vocabulary now, since
   every button in the app can carry a glyph.
2. **Sidebar section labels were indented to the module titles**, which left
   them hanging in the middle of the column. They sit at the sidebar's own left
   axis now, which is the convention every editor and app shell shares. The
   spine moved with them: it belongs to a PHASE rather than to the whole track,
   which also draws what it means — these modules are one run of work.
3. **The reading measure was too narrow at 34rem.** Widened to 40rem; the
   reasoning is in tokens.css, and it settles the code-width trade at the same
   time (~71 mono characters, so ordinary lesson code stops scrolling).
4. **Three vertical rules where one division exists**: the seam's own rule, the
   seminar's `border-l`, and the OS scrollbar's track edge. One divider per
   division — the border is gone and scrollbars are chrome now (ADR-020).
5. **The record overlay vanished into the page.** Fixed as ADR-020 §4.
6. **"Where's the lab?"** — working as specified, not a bug: the Lab instrument
   renders only when the course actually claims a visualization (ADR-013,
   presence-based affordances). The maintainer's course claims none. Flagged
   because "correct but confusing" is worth knowing: if a hidden affordance
   costs more than a dead one here, that is a change to ADR-013's application,
   not to this surface.

## Reopens if

- The maintainer wants the instruments discoverable without the rail (e.g. the rail becomes
  collapsible, which would strand its footer).
- A third pane appears (a terminal is a non-goal, but a diff or a file tree is not
  unthinkable), at which point a layout model beats two splitters.
- Codex's adapter reports session controls the composer row cannot hold (M6).
