# Interface design

Status: accepted baseline

This document is the durable interface contract for Lerience. It describes the product
posture, visual language, interaction rules, and established surface behavior that contributors
should preserve unless new evidence justifies a deliberate change. It is not a chronology or a
substitute for the product specification and architecture decisions.

Read this document before changing established interface behavior. For deeper rationale, follow the
accepted records in [`DECISIONS/`](DECISIONS/), especially ADR-015 through ADR-020. Raw design
values live in `src/renderer/src/design/tokens.css`; the implementation and its tests are
authoritative when prose and code disagree.

## Product posture

Lerience is a focused desktop learning environment, not a web landing page or a generic chat wrapper.
The interface should feel like an installed application whose material is the learner's course:

- Orient people and let them act; do not market to someone who already installed the product.
- Prefer one clear next action over diagrams that explain a process before it begins.
- Keep learner work visible as lessons, files, checks, progress, and recoverable sessions. Chat is
  one instrument in that workspace, not the product's entire shape.
- Do not require terminal, Git, npm, localhost, or hosted-control-plane concepts in learner-facing
  flows.
- Keep provider language neutral. Supported providers differ, but the app voice must not assume one
  vendor unless the surface is reporting that provider's own state.
- Never claim all learner data stays on the machine. Course files and app state are local, but tutor
  conversation is sent through the learner's provider. The accurate trust boundary is in ADR-001
  and ADR-004.

## Visual system

### Colour is quiet until it carries meaning

The accepted Lens system uses neutral monochrome chrome. Application furniture does not compete
with course material through a decorative brand hue. Colour is reserved for semantic states:
attention, repair, success, and failure. An action accent must not double as a status colour.

Workspace, raised, panel, reading, input, and chrome grounds have visible value steps. Hairlines
must read as edges. Dark and light themes are first-class; the app follows the operating system by
default, while an explicit in-app override wins in either direction.

Text tokens have distinct jobs:

- `--ink-hi` and `--ink` carry primary text.
- `--ink-dim` is supporting text people are expected to read, such as captions and ledes. It must
  remain comfortable, not merely legal.
- `--ink-faint` is peripheral furniture, disabled text, and placeholders.

The contrast tests enforce an ordered ink scale on every ground, at least 7:1 for dim text, and at
least 4.5:1 for faint text. Do not repair one low-contrast symptom by inverting that hierarchy.

See [ADR-015](DECISIONS/ADR-015-lens-palette.md) and
[ADR-020](DECISIONS/ADR-020-neutral-palette-and-inter.md).

### Type identifies who is speaking

Typography follows ownership rather than generic heading/body categories:

- **Inter** is the app voice: chrome, navigation, controls, labels, status, and app-authored help.
- **Literata** is the course voice: lesson prose, tutor turns, and titles belonging to that
  material.
- **JetBrains Mono** is for code and compact data such as file paths, module ids, and measurements.

Mono is not a shortcut for technical atmosphere, and Literata is not decoration for app headings.
Small interface text must remain crisp on Windows rather than relying on display-oriented faces or
font-smoothing tricks.

### Shape, elevation, and motion

- Buttons, inputs, and chips use the pill radius; cards use the shared 14px card radius.
- Hover changes border, fill, or ink. Controls and cards do not lift or translate on hover.
- A floating modal layer separates itself with ground value, a strong edge, shadow, and a dimmed,
  blurred backdrop. Adding arbitrary nested cards is not an elevation system.
- Use one divider for one division. Avoid doubled borders beside seams or scrollbar tracks.
- Motion explains a state transition, pending action, or handoff. It is subtle, tokenized, and must
  not be the only carrier of meaning.
- Decorative uppercase eyebrow labels and generic numbered steps are not part of the vocabulary.
  Hierarchy should come from real titles, spacing, type, and the thing being stepped through.

## Application shell

Every main surface lives inside one `AppShell` and shares one window frame.

- The renderer draws the title-bar content while Windows retains the native caption buttons through
  the title-bar overlay. Interactive children opt out of the drag region, and the caption strip is
  reserved rather than filled with app controls.
- The title bar carries window identity and navigation. Do not add a second course toolbar below it.
- The thin, full-bleed status bar carries ambient facts, not marketing or privacy slogans.
- An available update is one of those facts, not a banner over the workspace. The status bar
  carries it for as long as it stands (version offered, download progress, ready to install) as
  an item that opens a small update dialog with the action, what it will do, and a way to the
  version's release page in the browser. A dismissible notice above the status bar announces each
  moment that deserves a glance — an offer, a verified download, a failed action — once per run;
  a failed automatic check only shows in the bar. Release notes are never rendered inside the app.
- Theme changes update both renderer tokens and the native title-bar overlay.
- Scrollbars are quiet chrome: thin, trackless, and subordinate to actual pane seams.

See [ADR-016](DECISIONS/ADR-016-app-drawn-window-frame.md) and
[ADR-019](DECISIONS/ADR-019-the-course-workspace.md).

## Course lifecycle surfaces

The interface follows course and session truth instead of maintaining a second pedagogical state
machine.

### Dashboard and first run

The returning dashboard is continue-first and uses actual registry/course data. The first-run view
is one centred question with one primary action. It may offer a quiet way to open an existing
course, but it must not promote advanced folder choices or explain the entire course lifecycle
before the learner starts.

The first name is a deterministic working folder name. The tutor may later write the real course
title into `COURSE.md`, and the dashboard should prefer that title when it exists. Course creation
remains provider-free so a provider outage cannot prevent the local folder from being created.

### Choosing a tutor

A learner with no courses and no connected tutor opens on the tutor gate, not on the first-run
question. The prerequisite is asked before the work, not discovered after a folder already exists.
The gate carries one quiet way past it, because a learner who cannot connect anything must still
reach the dashboard.

This is the only place the app opens on something other than course work, and it is deliberately
narrow. A learner who already has courses opens on their courses: reading finished material needs
no provider, so their dashboard is not repurposed as a connection prompt. That dashboard states the
missing tutor instead — an amber dot on the tutor menu, and one line on the create screen — and
the same gate still stands where onboarding needs a live tutor.

Provider readiness earns colour under the ADR-015 rule and nothing more. Amber marks a state the
learner has to repair: no tutor chosen, signed out, not installed, update needed. A card is given
the app's emphasis only when it is both chosen and connected, so an unusable provider is never the
loudest thing on the screen. Usage meters are readouts, not actions, and are drawn in ink rather
than in the action colour.

### Onboarding

A course with no modules does not have a meaningful rail or reading pane. On create and reopen, any
course with no modules uses the full-window onboarding surface. During that live onboarding flow,
the handoff waits until module 00 exists and the build turn has completed. The route is latched for
the open operation so a file landing mid-turn does not tear the interface away while the tutor is
still speaking.

Onboarding is protocol-owned and file-derived:

- The existing tutor session conducts the interview and records the course arc. The renderer does
  not invent a parallel wizard state machine.
- App-authored system lines report filesystem facts; tutor turns remain the course voice.
- The app cannot infer a pedagogical assent gate from `COURSE.md` existence. The conversation is
  authoritative. Any shortcut button sends an explicit learner message through the same path as
  typed input.
- `COURSE.md`, curriculum files, modules, session phase, and turn completion can change the
  presentation only where they are truthful signals.
- Failures are recoverable conversation states. They must not imply that the local course creation
  failed or that the learner's folder is unsafe.

### Building the first module

The build is a dedicated wait surface, not a transcript with a tiny activity row. It shows the
course identity, a plain-language expectation, indeterminate then complete progress, elapsed time,
meaningful landed files, and current tool activity. Temporary write files are noise and stay
filtered.

The live edge of conversation remains available for real questions and approvals, but earlier
interview prose is not repeated as status. A closing tutor summary belongs in the course workspace,
where it can be read. The build and handoff are one surface whose state changes; do not flash an
extra ready page that can be missed.

### Course workspace

The established workspace is rail, material, and seminar inside the shared shell:

- The rail owns course navigation and instruments. The material pane takes the remaining width and
  keeps a readable prose/code measure. The seminar is the live tutor edge.
- A rail entry clips at a fixed height so the track keeps one rhythm. Titles and runtime strings a
  tutor writes long are read from the tooltip, which opens only while text is genuinely cut off.
- Both seams are real accessible separators. Drag and keyboard resizing use the same token-derived
  clamps; widths persist app-wide because they are a window preference, not course content.
- Course-scoped instruments appear when the course claims their underlying material. Hidden
  affordances follow file presence rather than speculative disabled controls.
- The Lab overlay is a stage: the visual owns the space, while switching and context remain compact.
- The Record overlay is a distinct modal layer, with tabs using the same active-rule idiom as other
  tabbed material.
- Generated markdown and course visuals answer to their content geometry rather than being forced
  into app-chrome layout patterns.

See [ADR-012](DECISIONS/ADR-012-the-app-is-a-stage.md),
[ADR-013](DECISIONS/ADR-013-presence-based-affordances.md), and
[ADR-019](DECISIONS/ADR-019-the-course-workspace.md).

## Conversation, controls, and consent

There is one conversation implementation. Onboarding and the seminar column share the same tutor
turns, learner turns, composer, thinking state, approvals, retry notices, queue behavior, session
controls, and scroll-follow logic. A surface may compose those parts differently; it must not fork
their behavior.

- The composer grows with its content and remains usable while the tutor is working. A submitted
  mid-turn reply is visibly queued, cancellable, and sent through the normal path when the turn
  settles.
- Recovery keeps the previous conversation and its closing reply readable while the fresh session
  opens below a labeled boundary. The learner may collapse the previous session; the app never
  hides it automatically during the handoff.
- The waiting state's live line is whatever is actually happening: the current tool work in the
  present progressive ("Reading a file", with its target underneath), "Thinking" only when no tool
  is in flight, and "Waiting for your answer" behind an approval card. The words breathe with the
  dots, and elapsed time appears once a step passes ten seconds. Activity copy never addresses the
  learner in the imperative, and a command never appears; the model's own one-line description of
  it stands in when there is one.
- Silent or failed provider turns get honest retryable states. Do not leave permanent thinking
  indicators after a turn completed without visible content.
- Permission prompts are trust moments. State the actual action and scope; never hide a command or
  outside-course effect inside a broad file-edit label.
- Session controls report provider-confirmed current values. Pending next-turn values must look
  pending, not active.
- Model, effort, edit grants, and autonomy changes are learner-initiated and session-scoped. A new
  session starts from the learner's provider configuration, and the app never edits provider auth
  or settings files.
- Dangerous autonomy must be named plainly with its shell/course scope. Convenience is not grounds
  for silent escalation.

See [ADR-004](DECISIONS/ADR-004-agent-seam-claude-first.md) and
[ADR-018](DECISIONS/ADR-018-learner-owned-session-controls.md).

## Controls and accessibility

- Start with native semantics or established primitives. Separators, menus, tabs, dialogs,
  progress, and form controls retain keyboard behavior and accessible names.
- Primary first-run controls share a measured 44px height. Compact pill controls use the inset
  `focus-frame`; ordinary controls use the standard focus-visible ring.
- Mouse interaction must not leave a fake keyboard-focus ring. Keyboard focus must remain clearly
  visible without resizing the control.
- Native select popups are not used where their operating-system palette would break the app theme;
  use the shared token-styled menu primitive.
- Do not communicate only through colour, animation, hover, or a tooltip.
- There is one tooltip, and it is a second door rather than the only one: it recovers text a column
  deliberately clips, or explains a control whose meaning is already carried elsewhere. Use the
  shared component, so a second floating layer does not grow a second look.
- Responsive behavior is earned and tested. Breakpoints and container sizes must compile to literal
  queries; token namespace clearing can otherwise make responsive utilities silently disappear.

## Copy

- Write for an ordinary learner at the moment of action. Prefer concrete verbs and the learner's
  object: open the course, build module 00, request changes.
- Use provider-neutral copy unless reporting a selected provider's actual value or error.
- Do not use numbered step markers when the states can name themselves.
- Do not promise that all data stays local. Explain the precise app/provider boundary only where
  there is enough room for the caveat.
- Copy sets like typography. Tighten wording, choose a deliberate measure, use balanced wrapping for
  short display blocks and pretty wrapping for longer prose, then verify rendered line boxes. Avoid
  orphaned final words and brittle manual line breaks.
- Labels must tell the truth when context changes. For example, distinguish a live session from a
  recoverable last session, and identify provider-reported cost rather than presenting an
  unexplained number.

## Implementation boundaries

The token layer is the only home for raw design values. Tailwind is derived from it and its stock
palette is cleared; a non-token colour utility must not compile. shadcn/Radix components are
vendored or composed onto the semantic token system rather than shipped with default styling.

Use one styling model per surface. Do not leave a surface half utility-based and half signature
CSS. The deliberate exceptions are:

- `design/prose.css`, which styles sanitized HTML generated from markdown and therefore cannot put
  utilities on source elements;
- `labs/lab.css`, the Course Engine visual port whose own document structure is an established
  compatibility boundary.

Component-specific geometry belongs in shared tokens or a deep component interface when multiple
callers need it. Avoid literal copies in TypeScript and CSS that can drift apart. A class that
silently fails to compile is a testable defect, not a visual-review concern.

See [ADR-017](DECISIONS/ADR-017-tailwind-derives-from-tokens.md).

## Verification

Validate design claims at the layer that can prove them:

- Use the repository renderer harness for real components, synthetic states, DOM behavior,
  accessible names, console errors, and measurable geometry.
- Use compiled CSS and design-discipline tests for token resolution, class generation, contrast,
  namespace clearing, and styling boundaries.
- Use the real Electron app for native frame behavior, caption overlays, operating-system theme and
  DPI behavior, preload/main-process changes, and provider-owned runtime flows.
- Native package acceptance, animation timing, observer delivery, and a human visual read remain
  distinct evidence. A browser screenshot or successful source build does not prove them.

Run `pnpm check` after the final edit, not before it. When a change touches an established surface,
add the narrowest durable test that would have caught the defect rather than relying only on a
screenshot.

## Deliberately deferred

These ideas do not reopen the accepted baseline on their own:

- a broader Settings surface, until enough durable preferences earn one;
- a custom arc-drafting state, until the engine/provider exposes a truthful signal;
- generated-file rows that open an external editor;
- workspace layout presets or additional panes;
- a provider selector when more than one compatible provider is available.

Evaluate them against the product specification and relevant ADRs when evidence makes them active.
