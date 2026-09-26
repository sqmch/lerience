# Assessment visual preview

LB-016. Branch `codex/lb-016-assessment-visual-prototype`, owner task `01a0ddef`,
baseline `f1f88a243c23e57b913630d31b472f03e2dc1e38`.

The learner asked to judge a solid design using Lerience's existing visual language. This
implements the selected trace and explanation as a disposable renderer preview. The production
CourseView and Brief accept optional composed content; ordinary course rendering stays the default.
All assessment state and original synthetic material live under `dev/renderer-harness/`.
No schema, engine protocol, preload capability or production assessment is introduced.

## What to judge

The task sits directly on the existing reading surface. Literata carries the question and
explanation; Inter carries controls and status; Mono carries submitted numeric data. Inputs
and actions use the existing pill geometry. Feedback uses semantic colour only for an actual
incorrect numeric prediction or failed-save example. There are no survey cards, extra panes,
new palette values or per-question toolbars. The multiline explanation uses the existing
large radius rather than forcing a four-line field into a capsule.

The main action changes with the task: Submit answers, Preview tutor feedback, then Revise
answers. History is a secondary disclosure. Before feedback, the learner's explanation remains
unreviewed. The example review names its scripted nature and records no mastery or completion.
The persistent development badge says that state is memory-only.

Open the renderer harness using the [preview instructions](../../dev/renderer-harness/README.md#assessment-interaction-preview).
Start with initial light, feedback dark, and editing at a narrow material width. The failed-save
example is useful for judging whether recovery stays clear without taking over the page.
The learner should confirm the fit and flow or name what feels wrong; that visual decision
does not authorize course-file persistence, release or conversion of existing courses.

## Evidence and limits

Programmatic headless Chromium checks on Windows exercised:

- Blank submission rejects all five missing fields and focuses the first input. Tab follows
  the answer order with a visible 2-pixel focus outline. Explanation Enter inserts a newline.
- A partial draft survives Lesson/Brief navigation. Submission displays separate numeric
  feedback and an unreviewed explanation. Scripted feedback can be viewed, revised and
  submitted again; history retains the earlier incorrect spill alongside the revised answer.
- Simulated save failure retains all entered values. Retry restores the Submit action without
  changing them. This is an interaction demonstration, not a filesystem failure test.
- Desktop light/dark and a 420-pixel material pane have no document or pane horizontal overflow.
  Controls fit without clipped text. All three bundled font families loaded. No browser errors
  or Vite error overlay were reported. Screenshots were read visually, not only generated.

The four focused regressions cover raw invalid drafts, zero answers, failed-save retry,
duplicate submission, immutable prior attempts, feedback/help on revision, and ordinary
Brief fallback. Production packaging excludes the development harness as before.

Screenshot names are `initial-light.png`, `feedback-dark.png`, `narrow-light.png` and
`save-error-narrow-dark.png`, retained in the task's local visualizations directory and linked
in the handoff. They contain only synthetic course data. The feedback view is scrolled to its
actions; the rest of the course remains visible. No native-provider, disk-persistence, learner
acceptance or learning-quality result is claimed. Full local `pnpm check` passed on Windows x64,
Node 24.18.0 and pnpm 11.9.0: 595 application tests passed with six platform skips, 61 Course
Engine tests passed, plus publication hygiene, both typecheck projects, harness build,
lint/format and production build. Final-head review and hosted CI are recorded in the PR.

The [portable-record proposal](assessment-design-2026-09-26.md) remains a separate product and
architecture decision. This preview does not amend ADR-002/010 or ADR-012. LB-015 reading work
is separate and follows review of this result.
