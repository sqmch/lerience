# Reading, navigation, and lesson ideas

See the [register and session order](README.md) for each item's current status.
Use the real renderer components in the repository harness for interface checks; native
provider behavior remains a separate claim.

<a id="lb-010"></a>
## LB-010: Lab dropdown repeats entries

P2, reported regression. Source S01.

Owner: task `01a0dd48-87be-7901-a0ff-337c384d55f9`, branch
`codex/lb-010-lab-choices`, started from current `main` on 2026-09-26.

After the lab dropdown layering fix in 0.0.14, labs appear multiple times in the top-left
menu, with different repetition counts. The earlier fixed bug made the dropdown inaccessible;
this report concerns the choices inside it.

Trace [`labEntries`](../../src/shared/course-data.ts) and
[`lab-overlay.tsx`](../../src/renderer/src/course/lab-overlay.tsx) with a synthetic multi-module
course. Determine whether these are duplicate records, distinct instances with the same
title, repeated claims, or menu rendering. Repeated titles alone are not a safe deduplication
key because module configurations can differ.

Done when a logical lab choice appears once, genuinely distinct choices remain understandable
and selectable, selection is stable across refresh/module changes, and the dropdown stays
accessible above the overlay. Cover the data identity in
[`course-data.test.ts`](../../tests/course-data.test.ts) and verify the rendered menu.

### Investigation and source fix, 2026-09-26

Source fix and validation: [PR #93](https://github.com/sqmch/lerience/pull/93), implementation
commit `81b7f11`. Merged on 2026-09-26 at `8db35b64966141b889fa81339e85d66b1537fa08`
after final-head Windows CI passed. Implemented in source; release remains separate.

The synthetic multi-module reproduction produces three identical-looking "The loop" choices.
Their identities are different module/file pairs. `labEntries` already collapses repeated stock
claims by registry ID and repeated HTML claims by module plus file, after stripping `visuals/`.
It is the overlay's title-only labels that conceal the difference. The fixture's stock lab
appears once and retains a different configuration for each claiming module.

The fix adds module titles only to ambiguous visual names, with the module/file address as a
fallback when module titles also collide. It preserves the original keys, files, and configuration
lookup. It does not infer equality from a title, copy content between modules, or alter course files.

Evidence:

- A renderer regression failed before the fix with `The loop` instead of `The loop · Position`.
- Data regressions cover repeated claims, the `visuals/` alias, separate module files, different
  stock configurations, repeated inventory paths, reordered snapshots, and title changes.
- The production overlay in the repository's `labs` harness fixture shows four unique menu
  choices. Headless Chromium hit tests confirm all rows are reachable inside the open dialog.
  Selecting Velocity opens `01-velocity/loop.html` with `allow-scripts` sandboxing. Selection
  survives snapshot refresh and a change to Force context.
- Keyboard opening and selection work. Escape closes the menu while preserving the overlay
  and returning focus to the trigger. Switching stock context renders the Force and Velocity
  configurations separately. The browser reports no runtime errors.
- Windows x64, Node 24.18.0, pnpm 11.9.0: `pnpm check` passed publication hygiene,
  application/harness typechecks and harness build. Vitest had 534 passes and 6 skips, with one
  unrelated `EPERM` temporary-directory rename failure in `course-session.test.ts`. All four
  tests in that file passed on the targeted rerun without changes. The remaining gates ran
  separately: all 61 Course Engine tests, ESLint/Prettier, and production build passed.
- Windows CI passed for the final PR head, including the complete `pnpm check`, published prose
  check, and dependency audit. PR #93 merged at `8db35b6` on 2026-09-26.

Limits: this establishes the ambiguous-label mechanism with public synthetic data; no private
course was inspected to claim the historical report had identical inputs. Browser verification
checks iframe identity and sandbox attributes, not Electron's custom-protocol document loading.
No provider, native package, release, or existing-course update is part of this fix.

<a id="lb-011"></a>
## LB-011: Small upward scrolls should release streaming auto-follow

P2, bug and explicit behavior request. Source S05.

Owner: task `01a0dd5a-0c85-74a3-980d-cc9814897fbb`, branch
`codex/lb-011-streaming-scroll`, started from current `main` on 2026-09-26.

During a long streamed reply, a small upward scroll snaps back to the bottom. The learner must
scroll aggressively to read stationary text. Requested behavior: follow while at the bottom;
release on even a small intentional upward scroll; show the jump-to-latest control; reattach
when the learner reaches the bottom manually or uses that control.

Code observed: [`useFollowBottom`](../../src/renderer/src/seminar/parts.tsx) treats distances up
to a quarter of the viewport height as near-bottom. Inspect user intent separately from
programmatic scrolling and content resize events before replacing that rule.

Done when a small wheel, trackpad, keyboard, or scrollbar movement away from the bottom keeps
the reading position stable during subsequent tokens and late layout changes. Reattachment
must work by both paths, and following must continue when already pinned. Verify long replies
and growing rich content in the harness; account for rounding at the bottom without reintroducing
a large release buffer. Check both seminar and onboarding consumers of the shared hook.

### Investigation and source fix, 2026-09-26

Source fix: [PR #94](https://github.com/sqmch/lerience/pull/94), implementation commit `226d8e0`.
Merged on 2026-09-26 at `546026cad809a1f42c6d9180b61a2fbdac785d71` after green CI.
Implemented in source; release remains separate.

The production hook kept following after an 8px upward scroll because its release threshold was
one quarter of the viewport. The next token and resize moved the regression viewport from 1592px
to 1700px instead of preserving 1592px. A second regression showed resize pinning could also run
between upward wheel input and its scroll event, moving 1600px to 1680px.

The shared hook now releases immediately on upward wheel or scrolling-key input. Upward scroll
movement covers the scrollbar path. Programmatic pinning records its applied position so queued,
unchanged scroll events do not reattach after user input. Detached text stays stationary through
tokens and late content layout. Downward movement back to the bottom uses a 1px rounding tolerance;
the existing jump button also reattaches. No consumer-specific follow behavior was added.

Evidence:

- `pnpm exec vitest run src/renderer/src/seminar/follow-bottom.test.tsx`: the two reproduction
  tests failed before the fix; all 12 focused regressions pass after it. Coverage includes small
  and fractional upward movement, input before resize, queued scroll events, four upward keys,
  both reattachment paths, continued pinning, control/editing keys, and observer/listener cleanup.
- The production seminar and onboarding layouts pass headless Chromium checks using the public
  `scroll-seminar` and `scroll-onboarding` harness fixtures. Protocol-delivered 1px and 8px wheel
  input and ArrowUp release follow. An 8px `scrollTop` change with a browser-generated scroll event
  separately verifies release without a wheel/key handler, as used by scrollbar movement.
- Streamed prose and highlighted code leave the detached position unchanged. Expanding a table
  disclosure adds 912px in seminar and 913px in onboarding while preserving scrollTop at 3395px
  and 2541px respectively. The same late growth remains pinned when follow is active.
- The jump button and downward wheel scrolling back to the bottom both resume following through
  another streamed chunk. Both consumers finish at a 0px bottom gap. Browser runtime errors: none.
- Windows x64, Node 24.18.0, pnpm 11.9.0. Source gate: `pnpm check`; the PR records its local
  result and final-head Windows CI, including publication prose and dependency audit.

Limits: browser checks exercise production renderer components with synthetic events and content,
not native Electron acceptance. Physical trackpad gestures and native scrollbar-thumb dragging
were not exercised; the headless browser did not expose a draggable thumb. No provider/model turns,
native package, release, or private-course changes are included. LB-004 and LB-005 remain blocked.

<a id="lb-012"></a>
## LB-012: Elapsed time wraps during module building

P2, visual bug. Source S03.

Owner: task `01a0dd70-f853-7632-acf9-ef2842d020b7`, branch
`codex/lb-012-duration-layout`, started from current `main` at `546026c` on 2026-09-26.

A duration such as "5m 33s" breaks across lines during module building. A long following task
description squeezing the clock is the learner's hypothesis, not an established layout cause.

Locate the exact row using long synthetic activity text and narrow supported pane/window
sizes. Inspect [`onboarding-surface.tsx`](../../src/renderer/src/onboarding/onboarding-surface.tsx)
and the shared activity rows in [`parts.tsx`](../../src/renderer/src/seminar/parts.tsx).

Done when the duration stays together and readable while the description wraps appropriately,
with no overlap or horizontal overflow. Verify minutes and longer durations in the actual
build states. Keep the change local to the affected row.

### Investigation and source fix, 2026-09-26

The build row allowed its clock to shrink while a long activity description competed for
space. In the production `BuildStage` at the native minimum window width of 960px, synthetic
activity text reduced `5m 33s` to two line boxes and a 36px-high timer. The description was
truncated. The shared seminar `Thinking` clock already resists shrinking and is unchanged.

The build clock now resists shrinking and wrapping. Activity text wraps, including unbroken
paths, and both spans align on their first baseline. The fix changes only this row's layout.

Evidence from headless Chromium against the existing `building` renderer fixture:

- A controlled browser clock and synthetic `tool_activity` events exercise the real elapsed
  formatter and build states without provider calls or direct DOM text replacement.
- `5m 33s` and `123m 33s` occupy one line and 18px height after the fix. The long description
  wraps to 38px at 960px and 1280px window widths. Bounding-box and scroll-width checks find
  no overlap, clipped activity, row overflow, or document overflow.
- A 640px viewport, below the native minimum and used only as a stress check, also passes.
  An unbroken synthetic file path wraps at both 640px and 960px without horizontal overflow.
- Waiting for approval, activity cleared by tutor prose, and the settled ready state pass
  the same geometry checks. The ready label is `built in 123m 33s`. Browser runtime errors: none.
- Source gate: `pnpm check` on Windows x64, Node 24.18.0, pnpm 11.9.0. The PR records the
  local result and CI for its final head.

Implemented in [PR #95](https://github.com/sqmch/lerience/pull/95), merged at
`715c5593d4870d8f5ed69da27e735805596e6b5f` after green final-head Windows x64 CI.
Release remains separate.
This is production-renderer evidence with synthetic data. Native Electron, packaging, provider
turns, releases, and private-course changes are outside this fix. LB-013 remains separate.

<a id="lb-013"></a>
## LB-013: Remove the remembered suffix from session controls

P2, explicit UX request. Source S04.

Owner: task `01a0dd80-161b-71a3-bbc9-43e4bf0050fd`, branch
`codex/lb-013-control-labels`, started from current `main` at `715c559` on 2026-09-26.

Labels such as "Full access · remembered" widen the controls and wrap the row. Remove the
remembered suffix quietly while preserving saved choices and the actual selected-value label.
This request does not ask to remove the Full access or Never ask controls.

Initial code observation: [`SessionControlBar`](../../src/renderer/src/seminar/parts.tsx) appended
the suffix for restored values, as the original [ADR-040](../DECISIONS/ADR-040-remembered-session-controls.md)
required. The request authorizes changing that presentation rule and its affected expectations.

Done when restored controls render without the suffix, persistence still works, and current
versus pending values remain honest. Preserve "next reply" when a choice is only staged; that
is a different state. Verify narrow layouts and the relevant control tests. No redesign of
permission storage or broader settings UI is needed.

### Source fix and renderer evidence, 2026-09-26

The shared control bar now appends a suffix only for pending values. Saved choices still show
their actual model, effort, autonomy, and access labels. Full access and Never ask remain
available. Preference storage, restoration metadata, per-course/provider isolation, and the
provider's current/pending state are unchanged. ADR-040 and DESIGN now distinguish visible
permission values from the unnecessary restoration suffix.

- The shared renderer tests cover all four restored labels and pending access, autonomy,
  default effort, and an unknown provider-reported model. The existing conductor regressions
  cover saving, forgetting, restoration before the opener, runtime replacement, provider
  isolation, and refusal of a restored choice.
- Headless Chromium inspected production controls through the `controls-restored` fixture at
  960px and 1280px window widths. Restored and staged states had no clipped labels, overlapping
  controls, or horizontal overflow. At 960px the 360px seminar gives the controls 258px beside
  Send; all labels stay on one line while the group wraps. At 1280px all restored values fit
  on one row. Selecting Course folder retains `· next reply` while Full access is current.
- Browser runtime errors: none. These are synthetic renderer states, not native provider or
  installed-app acceptance. No provider calls, private-course edits, packaging, or release.
- Source gate: `pnpm check` on Windows x64, Node 24.18.0, pnpm 11.9.0. The PR records the local
  result and CI for its final head.

Source fix in [PR #96](https://github.com/sqmch/lerience/pull/96) on
`codex/lb-013-control-labels`; merge and release remain separate.

<a id="lb-015"></a>
## LB-015: Explore interactive lesson reading

P3, product discovery. Source S15. No feature set is committed.

[LB-016](assessment.md#lb-016) separately covers answering exercises and recording assessment
attempts. Coordinate lesson selection and tutor context where useful, but annotation and
assessment have different completion criteria.

The concrete behavior behind this idea is selecting sentences while reading. Persistent
highlighting could make those selections useful later. The learner also wonders about talking
to the tutor about a selection, notes/comments, editing lessons, collapsing sections, and
extending some behavior to the brief. They explicitly want learning value rather than more
controls for their own sake.

| Candidate | Question to settle before implementation |
| --- | --- |
| Persistent highlights | What does the learner return to, and how are marks found again? Can select, mark, unmark, and reopen stay simple? |
| Ask the tutor about a selection | What does this save over copy/paste: source location, surrounding context, or a clearer question flow? How does it behave while the tutor is busy? |
| Notes or comments on passages | Would these record a question, explanation, or misconception that helps later practice? Who can read or change them? |
| Editable lesson text | What learner problem needs editing the source? How do edits remain visible to the tutor and survive regeneration or review? |
| Collapsible sections | Does folding help orientation in long material without hiding needed prerequisites or disrupting reading position? |
| Brief support | Which chosen interaction also helps while doing an exercise, and which would add distraction? |
| Other reading/learning tools | Identify an actual difficulty and a way to evaluate improvement before proposing another feature. |

Start discovery with highlighting as a candidate, not a foregone conclusion. Walk through
reading, marking, returning later, and a tutor-modified lesson. Any persistent annotation
design must decide ownership, local storage, course portability, anchoring after content
edits, and behavior when an anchor no longer matches. Reading a mark must not silently mutate
the canonical lesson or count as learning progress.

Done with discovery when a short decision selects one bounded experiment or explicitly
defers the idea, explains the learner benefit, sketches the interaction, records storage and
update implications, and defines how a learner run will evaluate it. Keep rejected or deferred
candidates visible. A future implementation becomes its own work item with acceptance checks.

Start with [`material.tsx`](../../src/renderer/src/course/material.tsx),
[DESIGN](../DESIGN.md), [SPEC](../SPEC.md), and the course/app-data ownership decisions.
Permanent learner annotations or lesson editing may warrant an ADR. Mechanical UI tests can
prove persistence and selection behavior; learning usefulness needs a real reading exercise.
