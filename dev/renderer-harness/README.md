# Renderer harness

This developer-only browser harness mounts production renderer components against a narrow stub of
the preload API. It makes dashboard, course, onboarding, provider-connection, session-control, and
slow transition states inspectable without starting Electron or contacting a tutor provider.

The harness is source tooling, not an alternate application or learner workflow. Electron Builder
packages only the compiled application output, `package.json`, the assembled runtime, and the
third-party notice; nothing under `dev/` is shipped in an installer.

## Fixture provenance

All paths, courses, learner details, account labels, dates, provider events, tutor prose, journals,
quiz items, and check results in this directory were written specifically for the public harness.
They are fictional and do not come from a learner course, a provider transcript, a development
session, or a retired example repository.

Keep future fixtures deterministic and visibly synthetic:

- use the `C:\PraxeumFixture\...` namespace for artificial Windows paths;
- use `example.invalid` for account labels;
- avoid copying screenshots, prose, timestamps, random suffixes, or course state from a live run;
- model only the fields required to exercise a real renderer branch; and
- add a purpose comment when a value resembles sensitive or machine-specific data by necessity.

## Commands

```powershell
pnpm harness:dev
pnpm harness:typecheck
pnpm harness:build
pnpm harness:check
```

`harness:dev` serves the harness at `http://localhost:5199`. `harness:build` writes an ignored static
bundle to `dist/renderer-harness/`. `harness:check` runs its dedicated TypeScript project and build;
the root `pnpm check` includes that gate.

The bar at the bottom selects deterministic screens. Hide it when inspecting the application's own
status bar. The theme control changes the same root data attribute used by the production renderer.

The `building` fixture starts at 0 of 7 parts with an uncounted synthetic module README. Tutor prose
streams after 60 ms, and the command approval appears after about 2 seconds. At 5 seconds, a single
directory-change notification publishes a snapshot containing all seven parts. The counter should
jump to 7 of 7 while the approval remains visible. The `ready` fixture starts with all seven parts.

The `background`, `continuing`, and `settled` course fixtures exercise separate provider activity
lifetimes. Background shows two tasks after foreground completion, without Thinking or Stop.
Continuing shows a provider-initiated foreground turn after task completion. Settled shows its
finalized reply with Thinking and Stop cleared. These are synthetic states, not live-provider proof.

The `labs` fixture assembles three synthetic modules with different stock configurations and
same-title HTML visuals. Repeated claims of one file, including its `visuals/` alias, should
produce one choice per module. Open the lab menu to inspect the module-qualified labels.
Close the overlay, refresh the fixture or change its context, then reopen it to check selection
and stock configuration. Custom iframe addresses are inspectable here; their
`praxeum-visual:` content is served only by Electron, not this browser harness.

The `scroll-seminar` and `scroll-onboarding` fixtures put a long synthetic reply in both production
conversation layouts. `Stream chunk` adds prose and a code block through the stubbed event stream.
While pinned, each chunk should keep the viewport at the bottom. Scroll upward a few pixels, then
add another chunk: the reading position should stay put and `Jump to latest` should appear.
Expand `Expand synthetic rich content` to exercise late table layout independently of new tokens.
Check both manual scrolling back to the bottom and the jump button before adding another chunk.

The `controls-restored` fixture shows saved model, effort, Never ask, and Full access values
in the production course composer. Labels show the actual values without a restoration suffix.
Choose another option to see the stub provider stage it with `· next reply`. Inspect both states
at narrow seminar widths; this fixture does not exercise persistence or contact a provider.

The `model-onboarding` and `model-recovery` fixtures show the production pre-turn choice in
both layouts. No tutor event is replayed before Start tutor. Select a model or reset to provider
default to inspect the staged label, then start to expose the synthetic first reply. Hiding the
fixture bar remounts the fixture so its controls and listeners share the same bridge.

## Assessment interaction preview

Open `/?screen=assessment&bar=hidden&theme=light` or use the `assessment` harness button.
The preview mounts an original synthetic trace in the production course shell and Brief tab.
The response area supplements the authored Brief; it never replaces it. Select Implementing
the rule, then Brief, to see code instructions, command examples, Open in editor and Run checks
alongside an optional prediction. Reading a state has only a sketch/discussion brief, with no
form. Each assessment activity keeps its own draft. The interaction is chosen for the topic
and learning objective, not imposed on the course.
The harness imports the same bundled Inter, Literata and JetBrains Mono faces as the desktop
entrypoint. `theme=dark` selects the other theme, including its status-bar preference label.

The small `Assessment preview` menu selects initial, editing, validation, submitted, feedback,
revision, history and save-error examples. Direct links use `&assessment=feedback` and the
other menu values. These choices reset the example. All responses and attempts live only in
the mounted fixture's memory. Reloading, leaving the fixture or hiding/showing the general
harness bar resets them. Switching Lesson/Brief or modules within the course retains them.
No assessment code is loaded by the production entrypoint, and no disk, IPC, engine, provider,
progress or spaced-recall writes are added.

Try Submit with an empty response, then enter the trace and explanation. Enter in the
explanation inserts a newline. Submit freezes that attempt; Preview tutor feedback exposes
a clearly labelled fixed example, not an evaluation of the typed explanation. Revise opens
a new draft and Earlier attempts keeps prior responses readable. The save-error example
retains all input and requires Retry save before submission. This verifies interaction only,
not disk durability, grading accuracy, learner understanding or accepted production authority.

For a clean review, compare a 1440 by 1000 desktop with a 1100 by 1000 window whose material
pane reaches the supported 420-pixel floor. Use the existing separators to resize. The
learner's content scrolls within its pane; primary actions remain in document order.

## Reading interaction preview

Open `/?screen=reading&bar=hidden&theme=light`, or select `reading` in the harness.
The original parcel-tray lesson uses the production CourseView, Lesson pane, DocMarkdown and
bundled fonts. Marking is optional; its Brief remains a sketch/discussion activity without a form.

Select text within one prose paragraph and choose Highlight. Right-click Lesson prose, or
press Shift+F10 / Context Menu on its tabpanel, to open Lesson actions. Your highlights appears
there once marks exist and opens the list for returning or removal. Highlight a passage offers the same operation
with a paragraph picker and a read-only text field for keyboard selection. With no text selected
in that field, Highlight passage saves the whole paragraph. Escape closes dialogs and restores
focus to the Lesson panel. There is no persistent action row, count or empty-lesson prompt.
CSS Custom Highlight ranges paint a quiet fill and underline without rewriting markdown,
links or normal selection. This preview requires a browser with that API, such as current Chromium.

The small development menu changes the synthetic lesson between original, inserted, changed,
ambiguous and missing-passage versions. First save a Collection passage in original, then change
the version. Only the inserted variant can relocate that passage, with a lesson-changed notice.
The other three keep its quote and context in the list without a false jump target. Returning to
original restores the match. Tutor ready/busy/unavailable examples change only the stub seminar;
highlight actions never send messages. Version changes preserve the viewport's scroll offset.

Marks live only in the mounted fixture's memory. Switching Lesson/Brief retains them; reload,
leaving the fixture or toggling the general harness bar resets them. Nothing writes a course,
app-data, browser storage, progress or assessment records. The fixture uses named revisions,
not a production digest/format contract. The single-lesson preview opens its list contextually;
a course-wide rail list and deleted-module recovery are not implemented.

The [reading preview evidence](../../docs/backlog/reading-preview-2026-09-26.md) separates
renderer verification, the existing shell's zoom limitation and the outstanding learner run.

## Tool adapter

The `context-seminar` and `context-onboarding` fixtures show a synthetic provider context sample
below the production composer. Open its disclosure with the keyboard to inspect the estimate,
sample timing and compaction explanation at narrow and wide widths. Other fixtures omit the sample.

The repository-level `.claude/launch.json` points compatible developer tooling at port 5199. It is
an optional preview adapter only: it does not contain the harness, ship in the app, configure the
Claude provider, or replace root `CLAUDE.md` repository guidance.

## Showcase page

`showcase.html` mounts the production course view mid-course with a scripted tutor. It exists for
the public landing site, which serves the built page from a subfolder and embeds it in an iframe so
a visitor can use the real interface before installing anything. The tutor there is a short script:
it replies in the order the protocol would, cannot read what the visitor typed, and says so in its
last reply. The page reads `?theme=light|dark` at load and accepts a
`{ type: "lerience:theme", theme }` window message afterwards, so the page around it can keep the
window's theme in step with its own.

`harness:build` writes both pages, with a relative asset base, to `dist/renderer-harness/`. The
landing site copies `showcase.html` and `assets/` from there; nothing in this folder ships in an
installer.
