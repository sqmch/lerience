# In-app assessment discovery recommendation

LB-016, source S17. Baseline `affd3a480b17e8b8116a8f645069efc5e5de0e21`.
Owner task `01a0ddef-68d1-7222-ba4d-785225359c96`, branch
`codex/lb-016-assessment-design`. Status: proposed design, ready for product review.
This document selects a prototype. It does not authorize production persistence, change an
accepted ADR, implement assessment, or claim a learning improvement.

## Recommendation and decision

Build one disposable-course prototype: a standard in-app state trace with an explanation,
explicit submission, saved drafts and attempt history. Use the ordinary material pane beside
the seminar. A fixed set of number, choice and text fields is sufficient for this experiment;
it is not a restriction on the existing open-ended lab stage. Keep genuine code work in the
learner's editor. Use chat for a one-off reasoning probe that needs no structured trace.

The consequential product decision is whether submitted responses, drafts and feedback become
portable Course Engine learning records, with the app allowed to save them through a narrow
engine contract. Recommend yes for this prototype, subject to a proposed ADR being accepted
before implementing disk writes. This deliberately revisits ADR-010's rule that the app adds
no course state beyond the marker. Putting attempts in app-data instead would lose the promised
history when the learner copies a course. A document PR can be merged without accepting this
new write authority. If the decision is deferred, stop with this design and retain chat and
legacy exercises; do not build a browser-only store that appears to satisfy portability.

Defer custom assessment submission. None of the three tasks below needs animation or a custom
input to express the answer. Existing sandboxed visuals may still teach the scenario. Reopen
custom submission only for a concrete task where standard entry loses meaningful evidence,
such as a learner manipulating a simulation whose actions are themselves being assessed.

## Three original synthetic tasks

These are invented exercises, independent of the inspected private course. The arithmetic is
the exercise's own stated model, not a claim about a real system. The comparison is a design
walkthrough, not observed learner performance.

**A. Choice and numeric prediction.** A bin holds at most 8 tokens and starts with 3. Add 4.
Choose whether tokens spill, then give the number of free spaces. Correct answers are no spill
and 1 space. Prompt, capacity and units appear beside the controls. This samples applying a
capacity rule; choosing correctly alone cannot establish the learner's reasoning.

**B. Changed-state trace and explanation.** A bin holds at most 6 tokens and starts with 2.
Process `add 3`, `remove 4`, `add 7` in order. Addition keeps tokens up to capacity and discards
the excess; removal cannot take the count below zero. Give the stored count after each event,
the spill on the last event, and explain why it spills. The trace is 5, 1, 6, with 2 spilled.
A sufficient explanation relates the last starting count of 1 to the incoming 7 and capacity 6.
After feedback, use a fresh question changing `remove 4` to `remove 2`. The trace becomes
5, 3, 6, with 4 spilled. Ask why the final count stays the same while the spill changes.
This second question tests adapting the rule, not reproducing the earlier numbers.

**C. A mixed module with genuine code work.** Implement `step(stored, event, capacity)` in a
starter project. It returns `{ stored, spilled }` for one add/remove event; `spilled` is the
excess from that event, not a running total. Inputs are nonnegative integers, stored is within
capacity, and event kind is add or remove. Separately predict `step(4, add 5, 6)` in the app:
6 stored, 3 spilled. Editor checks cover add, exact fill, overflow, removal past zero and zero
input. Then explain a failing case and predict a changed input without help. A correct form
response does not establish the implementation, and green code checks do not establish the
explanation. This is one module with both response and artifact work, not a course type.

| Task | Current JSON entry | Standard in-app entry | Custom sandboxed interaction | Simpler chat |
| --- | --- | --- | --- | --- |
| A | Two JSON values need an editor and answer-type instructions for no subject benefit. | Two labelled controls next to the full question; no serialization work for the learner. Best structured option if practice repeats. | A clickable bin adds authoring and accessibility work without new response evidence. | Adequate for a one-off question. Tutor must distinguish the choice from the number in a message. |
| B | Arrays and a string store the trace, but answering requires matching indices to events and preserving JSON syntax. | Fixed event rows, numeric inputs and a text explanation keep question and response aligned. Select this prototype. | Animation could teach the rule but risks revealing the trace before prediction. Durable entry would need a new bridge. | Good for the independent follow-up; weaker for editing one trace cell and reopening a partially completed table. |
| C | Source editing is necessary; forcing the separate prediction into JSON is not. | Put the prediction beside the brief; keep Open in editor and Run checks for the real project. | A custom editor would duplicate the learner's real tools; no benefit demonstrated. | Suitable for code discussion and teach-back; keep behavioral checks on the actual artifact. |

## Interaction sketch

The Brief tab contains the task and its response area, discovered from a supported assessment
file in this module. It does not add a pane or replace the Quiz tab's recall material. For B:

```text
Brief                         [Run checks only if real checks exist]
Trace the token bin
Capacity 6. Starts at 2. Excess additions spill. Removal stops at zero.

Event             Stored after event
Add 3             [     ] tokens
Remove 4          [     ] tokens
Add 7             [     ] tokens
Spill on Add 7    [     ] tokens

Why does the last addition spill?
[                                                               ]

Help used: [Not recorded]   [Record help]   [Ask tutor for help]
Draft saved
[Submit answers]                       [Earlier attempts]
```

The starting view contains no solved example or selected correct option. The lesson can teach
a different worked example. Use course typography for prompts and app typography for controls,
the existing focus treatment, and explicit row/input labels including event and units. Tab
visits inputs and actions in reading order; Enter in the explanation inserts a line break.
Submitting requires the named button, never blur, field completion, navigation or session close.
An invalid field gets an inline explanation and focus, with a linked error summary. Empty,
zero and an invalid number are different. Preserve invalid raw input while the learner repairs it.

After a successful disk acknowledgement, show `Submitted locally` with an attempt number and
time. Objective results and reasoning feedback are separate sections. Example: `Number checks:
3 of 4 correct` and `Explanation: awaiting tutor review`. Error details describe the relevant
rule after submission; they do not replace the saved answer. `Revise answers` opens a new draft
copied from that attempt, labelled `After feedback`. Earlier attempts remain readable.

`Ask tutor to review` is separate from Submit. It names the submitted attempt and sends its
question, answers and assistance context through the existing conversation admission path.
The tutor may be unavailable while drafts, local submission, objective checking and history
remain usable. Queued review, accepted review, uncertain delivery and saved feedback are distinct
states. Background activity follows LB-003; an idle tutor is not evidence that feedback exists.
`Ask tutor for help` sends the current question and only the draft the learner chooses to share.
Neither action gives a sandbox frame new permissions.

## Minimum proposed contract

Use one question bundle per exercise, with stable field IDs for its parts. B has four numeric
fields and one explanation; it needs no general table builder. A and C are comparison cases,
not commitments to add other exercise formats in this prototype.

| Record | Required contents and rules |
| --- | --- |
| Question | `schemaVersion`, module ID, stable `questionId`, positive integer `version`, title, full prompt/scenario, ordered fields with stable IDs, kind, label, units and required/shape constraints; objective checker reference and explicit reasoning criteria. Choice options, when used later, have stable IDs independent of their labels. No executable markup in the contract. |
| Identity | Course UUID plus module ID, question ID, version and definition digest bind every draft/attempt. The digest covers prompt, field order/shape, criteria and grading specification digest. IDs are not titles or array indices. The app resolves the current course and module; a renderer-supplied path is never write authority. |
| Draft | App-generated attempt UUID, question snapshot/digest, draft revision, raw field text, assistance events and optional `revisesAttemptId`. Blank or malformed numbers may be saved; parsed values are only required on submission. Timestamps describe local events, not ordering across machines. |
| Submission | The same UUID, an immutable snapshot of parsed responses, original raw input, question/criteria snapshot, assistance known at submit and `submittedAt`. Submit compares the saved revision and source digest. A new revision creates a new UUID and retains its parent; it never overwrites submitted responses. |
| Feedback | Unique feedback ID, attempt UUID and digest, grading specification/checker version, author kind, objective results by field, and separate reasoning criteria with response excerpts and rationale. Objective states are correct, incorrect or check-error; reasoning states are supported, needs-work or uncertain. No combined pass/mastery flag. |
| History additions | Feedback, later-reported assistance, a learner dispute and a superseding review append with IDs and timestamps. Earlier feedback remains visible. The displayed state may be disputed without silently rewriting the original grade. A corrected checker adds a re-evaluation against the original submission. |

For the prototype, store an authored question in `curriculum/<module>/assessment.json` and
one attempt bundle per UUID in `tutor/assessments/<uuid>.json`. Each bundle contains the draft
or submitted response and its history additions. These paths are proposals for the engine
format, not new files introduced into any learner course by this discovery. Schema and writer
belong in the canonical engine; the app mediates allowed draft/submit/review operations through
its preload and main process. Raw-harness use calls the same engine writer. Presentation reads
the learner projection, with expected answers excluded until submission.

Objective keys are versioned course-local grading inputs read by the checker, not embedded in
question labels or sent to the learner renderer before submit. The submitted snapshot records
their digest so a later key edit cannot masquerade as the original grading. The prototype can
retain old grading inputs in the attempt's grading record for reproducibility while withholding
them from the pre-submit projection. A local owner or full-capability tutor can inspect course
files; this is prevention of accidental disclosure, not proctoring or cryptographic secrecy.
The canonical checker evaluates the numeric fields. Tutor feedback uses a schema-checked writer;
schema acceptance proves shape and binding only, not that its reasoning judgment is correct.

The learner owns the records, can inspect/copy them and can ask to correct feedback. Course
copying carries question snapshots, drafts and reviews; reopening must not depend on the old
app registry or transcript. Retain the course UUID on a folder move. Divergent copies are
independent histories, with no automatic merge or cross-machine ordering promise. Registering
a copied folder does not combine attempts merely because its UUID matches another folder.
Records save immediately to disk; session-close Git commits remain useful history, not the
save mechanism. App-data may cache view state, never the only copy of a saved response.

## Failure and lifecycle rules

| Event | Required behavior |
| --- | --- |
| Typing, navigation, interruption | Save draft revisions through one serialized writer. Show Saving until acknowledgement, then Saved. Navigation flushes pending edits; failure keeps the draft visible with Retry and Copy answers. Closing normally waits for the flush or reports unsaved work. After a crash, restore the last acknowledged revision; never claim unacknowledged keystrokes survived. |
| Invalid or failed submission | Shape errors stay on the draft and are not grades. A failed disk write stays retryable with the same UUID. Do not show Submitted, clear input or request tutor review before a durable commit. A malformed objective checker reports check-error without inventing an incorrect answer. |
| Double click or lost acknowledgement | Commit the full submission atomically with expected draft revision. Repeating the same UUID and payload returns the stored result; a different payload for a submitted UUID is a conflict. Reopen/read that UUID before retrying an uncertain acknowledgement. Disable controls while pending, but enforce idempotency in the writer too. |
| Concurrent or external edits | Compare expected revision/content digest under a per-course write lock; reject stale writes. Preserve the caller's draft for explicit reconciliation. Use bounded, contained paths with link/traversal refusal and atomic replacement. Do not silently take the newest timestamp or overwrite external edits. |
| Tutor review interrupted | Local submission survives. Use the existing accepted-send contract and associate delivery with the attempt ID. A definite refusal is retryable. If acceptance cannot be established after a crash, show delivery uncertain and offer an explicit review request for the same attempt. Do not automatically resend or promise exactly-once provider execution. Duplicate feedback IDs are idempotent; another review is a visible feedback revision, not another learner attempt. |
| Source edited or regenerated | Any prompt, field, rubric or grading change creates a new question version and digest. A digest change with an unchanged version is an authoring error and blocks submit. Keep the old draft and original question readable; offer a separate draft of the new question without silent answer remapping. Submitted attempts remain bound to their snapshot and are labelled Earlier question version. Deleted questions leave history intact. |
| Help or revealed feedback | Record hint-1..3 with who reported it and when, plus feedback exposure inherited by revisions. Unknown help is unknown, not independent. A learner can report outside help. Corrections append; neither a later restart nor a new attempt number erases exposure. A fresh changed case can carry new independent evidence when no help is reported, with that evidential limit visible. |
| Disputed or uncertain reasoning grade | Preserve the response and initial review, display the dispute or uncertainty, and offer discussion/review. Never coerce a nuanced explanation into string equality or count uncertainty as a failure. No automatic completion or recall-grade write follows any result. |

Save/submit operations need storage fault tests before an interface may claim recovery. A local
protocol cannot make a full-capability tutor unable to edit the files; validation must detect
inconsistent records rather than presenting them as certified evidence. No autosubmission,
automatic tutor startup, cloud store or new background recovery ritual is part of this proposal.

## Assessment and learner authority

The objective checker for B checks 5, 1, 6 and 2 as numbers, with exact integer comparison.
Its shape validator rejects a missing answer or non-number before checking correctness. It
does not infer understanding from four correct values. The explanation rubric asks whether
the learner identifies the prior count, applies the capacity rule and accounts for discarded
tokens. Accept equivalent wording. A terse or ambiguous explanation needs a follow-up, not a
keyword rule. The changed case asks for an explanation of the different spill and equal final
count, which the initial mechanical score cannot answer for the learner.

The tutor reviews the immutable submitted snapshot plus assistance and feedback history, then
offers evidence against each criterion. It can recommend more practice. The learner can pause,
dispute a result, ask for help or renegotiate the outcome; passing the form never advances the
module. Existing independent teach-back and changed-case requirements in the canonical protocol
remain the completion rule. Record assisted success honestly while leaving unverified outcomes
in progress. No new mastery score or override of learner authority is proposed.

Keep assessment attempts separate from `progress.json.checkAttempts`, which describes artifact
check runs, and from the spaced-recall quiz history. Initially the tutor cites attempt IDs in
existing progress notes and the journal. It may seed a weak concept through `quiz.mjs` under
the existing protocol. An exercise submission is not an actual due recall attempt and must not
call quiz grade, move an interval, populate a boss-check pass or mark a module completed.
Any later automated use of attempt evidence needs its own explicit authority decision.

## Required canonical changes and compatibility

These are implementation prerequisites, not changes made by this discovery PR.

- Amend ADR-002/010 and SPEC's state table through a new accepted ADR for engine-owned portable
  response records and the bounded app writer. Address format negotiation there. Keep ADR-005
  validation and ADR-003's single pedagogy source. ADR-013 presence-based behavior still applies.
- Add the question/attempt schemas, writer/checker and format documentation under
  `course-engine/template/`. Decide the capability/version marker before generating the first
  compatible course; unknown assessment versions must be visibly unsupported and read-only.
  Do not claim that existing format-v0 consumers automatically understand new records.
- Change canonical `CLAUDE.md` generation guidance to choose entry by the intended skill.
  A brief may specify response work, artifact work or both. Do not fabricate `scaffold/` and
  runnable checks for a conceptual explanation. Genuine coding keeps behavioral checks and
  the sealed-reference green/red ritual. Assistance and review rules live here, not in a
  second app prompt. Ship these changes with the engine version/manifest update.
- Update `qa-module.mjs` generation detection: it currently treats only scaffold/checks as
  volatile work and requires scaffold TODO gaps. A supported assessment file must establish
  generated work and require `REVIEW.md` even without a scaffold. Apply TODO and executable
  artifact checks only to genuine artifacts; do not weaken existing JSON exercise QA.
- QA question IDs, units, required fields, choice IDs, grading references, prompt coverage,
  and an empty unanswered initial state. Exercise the checker with reviewed correct and
  incorrect examples, including zero and malformed input. Keep reference answers out of
  learner-facing prompts, defaults and pre-submit payloads. Review freshness includes the
  question and grading version; a changed checker needs renewed grading review.
- Extend ADR-041's learner-side review inputs with the exact rendered question contract.
  Check terms before use, answer form, doable from the page and evidenced prerequisites.
  A cold reader solves the task before comparing to the key and checks for ambiguity or
  accidental clues. Separate semantic/key review from render/schema QA; neither guarantees
  a tutor review catches every learning defect.

Existing `answers.json` courses open and run checks unchanged. Do not auto-detect field names
and manufacture a form: the old file may omit the actual question, and exact-match scripts
may encode questionable grading. Existing courses keep their engine under ADR-027. After an
explicit compatible engine update, converting a module is a separate learner-approved content
change with the original question, answers and learning history recoverable. No retroactive
attempts, independent labels or grades are inferred from a filled JSON file. An old module
can stay legacy while a new module uses the new contract. A mixed module shows both in-app
entry and editor/check controls based on actual module files.

ADR-012 stays unchanged for this prototype: null-origin visuals, no disk, no IPC, no network.
A future custom submission proposal must separately approve an app-owned message bridge:
bind the active frame instance and question version, validate bounded response data, and
require Submit in trusted app chrome. Null origin alone cannot authenticate the sender. The
frame cannot choose paths, receive arbitrary course files, call preload, set feedback grades
or mark progress. No generic message relay or sandbox relaxation is authorized here.

## Focused follow-ups and stopping rules

1. Accept or defer the portable-record decision and its ADR/version plan. Review this concrete
   contract; do not restart an inventory of all possible assessment formats. This discovery
   ends at that handoff. LB-015 remains separate.
2. If accepted, implement only B in a disposable repository-owned course. Add engine schema,
   atomic draft/submit storage and objective checks with fault tests. Carry canonical protocol,
   QA and compatibility changes in this same bounded capability before asking a tutor to author
   it. No private-course conversion, general rubric engine or arbitrary custom controls.
3. Wire B into the Brief using existing tokens, CourseLens and the narrow preload seam. Add
   review handoff and schema-checked feedback without new provider APIs. Use synthetic feedback
   for UI failures; a finite tutor review can follow once persistence and authority are sound.
   Run required full source checks and an isolated native disk/reopen check for that source PR.
   No provider/model matrix is needed.
4. Evaluate the interaction, then one small learner run. Expand only if the results justify it.
   If entry still requires an editor or saved attempts cannot survive reopening, repair B before
   adding formats. If chat serves the task equally well, prefer chat for that class of question.

| Evaluation | Pass evidence and limits |
| --- | --- |
| Interaction | Complete B, save halfway, leave, reopen, submit, view feedback and revise entirely in the app with keyboard access. No missing acknowledged answer and one submission after repeated clicks, timeout and restart. Verify unreadable storage, stale source and conflicting draft errors retain recoverable input. Reopen a copied disposable course without app-data and read the same attempts. UI tests prove those cases only. |
| Mixed work | A synthetic C fixture retains Open in editor and Run checks while its prediction is in-app. Verify a failed code check cannot be hidden by a correct prediction and that no conceptual-only module needs a fake scaffold. The implementation and prediction remain separate evidence. |
| Entry friction | Compare A/B on JSON and standard entry using equivalent fresh values and alternating order. Record serialization errors, wrong-field entries, tutor clarification requests, time spent entering versus reasoning, and lost work. Report the counts, not a speed claim based on layout alone. |
| Learning evidence | After B, request an uncoached explanation and a fresh changed case; record assistance and actual reasoning. A later recall probe, if the learner agrees, tests retention separately. Keep these responses and reviewer rationale distinct from the objective score. A tiny run can expose defects; it cannot establish improved teaching, general transfer or retained mastery. |

## Discovery evidence

Static inspection covered the canonical protocol and FORMAT, `qa-module.mjs`, the material
pane, lab overlay and visual protocol, plus the ADRs cited above. The earlier sanitized
13-module course inspection in [assessment.md](assessment.md) suffices for the reported pattern.
No private course was read again, changed or copied. The examples and sketch here are new.
No renderer, native, persistence or learner acceptance is claimed by this document.
