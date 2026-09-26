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

Limits: this establishes the ambiguous-label mechanism with public synthetic data; no private
course was inspected to claim the historical report had identical inputs. Browser verification
checks iframe identity and sandbox attributes, not Electron's custom-protocol document loading.
No provider, native package, release, or existing-course update is part of this fix.

<a id="lb-011"></a>
## LB-011: Small upward scrolls should release streaming auto-follow

P2, bug and explicit behavior request. Source S05.

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

<a id="lb-012"></a>
## LB-012: Elapsed time wraps during module building

P2, visual bug. Source S03.

A duration such as "5m 33s" breaks across lines during module building. A long following task
description squeezing the clock is the learner's hypothesis, not an established layout cause.

Locate the exact row using long synthetic activity text and narrow supported pane/window
sizes. Inspect [`onboarding-surface.tsx`](../../src/renderer/src/onboarding/onboarding-surface.tsx)
and the shared activity rows in [`parts.tsx`](../../src/renderer/src/seminar/parts.tsx).

Done when the duration stays together and readable while the description wraps appropriately,
with no overlap or horizontal overflow. Verify minutes and longer durations in the actual
build states. Keep the change local to the affected row.

<a id="lb-013"></a>
## LB-013: Remove the remembered suffix from session controls

P2, explicit UX request. Source S04.

Labels such as "Full access · remembered" widen the controls and wrap the row. Remove the
remembered suffix quietly while preserving saved choices and the actual selected-value label.
This request does not ask to remove the Full access or Never ask controls.

Code observed: [`SessionControlBar`](../../src/renderer/src/seminar/parts.tsx) appends the suffix for
restored values. [ADR-040](../DECISIONS/ADR-040-remembered-session-controls.md) explicitly requires
that wording. The new request authorizes changing that presentation rule; update the decision
and affected expectations as part of the implementation. It does not require asking the
learner to approve the same request again.

Done when restored controls render without the suffix, persistence still works, and current
versus pending values remain honest. Preserve "next reply" when a choice is only staged; that
is a different state. Verify narrow layouts and the relevant control tests. No redesign of
permission storage or broader settings UI is needed.

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
