# Reading discovery: return to a marked passage

LB-015, source [S15](intake-2026-09-25.md#s15). Baseline `f1c022fb517862205857f2fb8dd3ca00c3d59331`.
Owner task `01a0ddfc-3365-7a51-bc76-1503db3a117a`, branch `codex/lb-015-reading-design`.
Status: proposed experiment, ready for product review. No implementation or learner evidence.

This is the original discovery record. The later authorized development-only
[visual preview](reading-preview-2026-09-26.md) has separate evidence and limits; it does not
accept the production persistence proposal below.

## Recommendation

Try one disposable Lesson-only experiment: save a highlighted passage and return to it from a
small Highlights list. Use one mark style, with save, open and remove actions. The hypothesis
is specific: after an interruption, the learner can find the rule they meant to revisit and
read it in context without reconstructing its location. A coloured page alone is no benefit.

The original report establishes repeated text selection while reading. It does not establish
that the learner needs permanent marks, or that highlighting improves learning. Keep ordinary
selection unchanged and compare it against the proposed return flow before committing to a
production feature. Selection-to-tutor helps an immediate question, but does not solve this
return task unless the learner sends a message and later searches the conversation.

This discovery stops at the design and finite evaluation below. A separately scoped disposable
prototype is the next recommendation, followed by a build-or-defer decision from its evidence.
Its scratch files must stay outside registered learner courses and ship in no production path.
No disposable sketch is needed to settle this document's interaction or ownership choices.

## Alternatives considered

| Candidate | Specific possible benefit | Decision for this experiment |
| --- | --- | --- |
| Plain text selection | Keeps the eye on the sentence being read, with no saving decision. | Keep as the baseline. It may fully satisfy S15 if marks are never used after leaving. |
| Persistent highlights | Finds a deliberately chosen passage after leaving, beside its surrounding lesson. Copying text elsewhere loses this direct return and may retain an obsolete quote. | Select, with a visible list and honest handling of lesson changes. Test the return task, not the number of marks created. |
| Ask tutor about selection | Could attach module, source revision and bounded surrounding text to an editable question, avoiding manual context reconstruction. Copy/paste already handles the quote itself. | Defer. No observed failure of copy/paste justifies a new send action yet. Revisit only if learners repeatedly send ambiguous or stale quotes. |
| Notes/comments | Could retain the learner's own explanation or an unresolved question. | Defer. Writing and revisiting a note is a different task; a highlight must not silently mean confusion, agreement or a request for help. |
| Lesson editing | Could repair a mistake or restate an explanation in the learner's words. | Defer. Editing changes shared teaching content and review freshness. There is no concrete unmet editing need in S15; discuss corrections through the existing tutor flow. |
| Folding sections | Could shorten navigation through a long lesson. | Defer. No demonstrated orientation failure warrants hidden text and another saved view state. A highlight opens its full surrounding section. |
| Brief support | Could mark a requirement to revisit while doing an exercise. | Defer. A marked requirement can be mistaken for a completed requirement. Evaluate Lesson first; Brief and LB-016 response entry retain their own purposes. |
| Automatic summaries, quizzes from marks, colours/tags | Could turn marks into a study workflow. | Exclude. No automatic tutor work, grading, taxonomy or annotation framework is needed to test return-to-passage value. |

## Original synthetic walkthrough

Use a fictional lesson called **The parcel tray**, under `01-parcel-tray/LESSON.md`. This is
invented teaching material, not a model of a real service or a copy of a learner's course.

```text
# The parcel tray
## Arrivals
The tray has four spaces. Each arrival fills a free space if one is available.
When the tray is full, a new parcel goes to the waiting shelf. An arrival never
moves a parcel already in the tray.

## Collection
One collection removes one parcel from the tray. Parcels on the waiting shelf
stay there until a separate refill event moves them into available tray spaces.
Collection alone does not refill the tray.

## A short trace
Start with three parcels in the tray and none on the shelf. Two arrivals leave
four in the tray and one on the shelf. One collection leaves three in the tray
and one on the shelf. A refill then leaves four in the tray and none on the shelf.
```

1. Read. The learner selects `Collection alone does not refill the tray.` to keep their place.
   Selection remains temporary unless they choose Highlight. The app does not infer importance
   from selection duration or record every selection.
2. Mark. Highlight saves that quote with its paragraph and heading context. Only a successful
   save acknowledgement produces `Highlight saved`. The learner keeps reading at the same place.
3. Return. Close the disposable view and reopen it the next day. Open Highlights, choose the
   saved quote, and land on Collection with the full paragraph visible. Ask the learner why a
   collection from a full tray with two waiting parcels leaves three in the tray and two waiting.
   Finding the sentence is interaction evidence; explaining the separate refill event is different
   evidence. A mark and a correct copied sentence cannot establish understanding.
4. Tutor edit. Simulate a tutor inserting a paragraph under Arrivals. The unchanged Collection
   paragraph can still match. Show `Lesson changed since this highlight` because matching text
   does not establish unchanged meaning in the whole lesson. Do not jump the reader during refresh.
5. Changed rule. In a separate revision, replace Collection with `One collection removes one
   parcel, then immediately refills one free space from the waiting shelf if possible.` The old
   quote remains in Highlights as `Passage changed or missing`, with its saved context. It is
   never painted on the new rule. The learner can open the current lesson, remove the old mark,
   or leave the saved quote for reference. Creating a new highlight is explicit.

Also duplicate the original Collection paragraph under the same heading in a fixture revision.
That is ambiguous, even if one occurrence is close to the original position. Retain the saved
quote without a jump target. A filename/module rename is likewise unmatched; do not search
other lessons for similar text. The list keeps marks visible when their lesson or module is gone.

## Interaction and accessibility sketch

```text
Lesson prose, with a completed selection:
  Collection alone does not refill the tray.     [Highlight]

Highlights dialog, opened from the course rail:
  The parcel tray / Collection
  "Collection alone does not refill the tray."
  [Open passage] [Remove]

After the changed-rule revision:
  The parcel tray / Collection
  Passage changed or missing
  Saved quote: "Collection alone does not refill the tray."
  [Show saved context] [Open current lesson] [Remove]
```

Offer Highlight in a small selection popover without stealing focus on selection. Escape
dismisses it; copy, link activation and ordinary selection still work. Restrict the experiment
to one contiguous range within a prose paragraph, including inline emphasis or link text.
Selections across paragraphs, tables, code, diagrams or lab frames get a plain explanation
and no save. Do not alter the visual sandbox or add executable markup to saved text.

Use a small Highlights dialog from the existing rail instruments, with the current lesson's
marks first and other lessons grouped by name. This single list also preserves access to
marks whose module vanished; it needs no separate archive, tags, search or management pane.
Show the control once marks exist. In an unmarked lesson, a quiet `Highlight a passage`
action near the lesson title supplies the keyboard entry point and explains the feature.
No new full-width toolbar or permanent side pane is needed.

Do not depend on mouse selection or a screen reader exposing a DOM range. The keyboard entry
opens a dialog to choose a prose paragraph by heading and preview, then a labelled read-only
plain-text field. The learner can use normal Shift selection and a named Highlight button,
or highlight the whole chosen paragraph. Both routes save the same kind of range. This is a
proposed accessible alternative to verify in the prototype, not a claim that it already works.

Tab order follows reading order. Dialogs trap focus and return it to the invoking control on
Escape. Open passage closes the list, scrolls only on that explicit action, and focuses the
target paragraph without adding it permanently to the tab order. A polite status announces
save/failure/removal. A failed removal keeps its row and mark. Exact duplicate saves return the
same mark; overlapping marks remain distinct records and may share a visual fill. Remove is
available by quote in the list, so overlap does not require pointer precision.

Use existing type, focus and contrast tokens in both themes. A quiet fill plus an underline
identifies a saved range without relying only on colour. The list exposes the full quote and
state as text. Verify 200% zoom and the minimum supported window/pane sizes without clipping.
Highlight rendering must not reset embedded visuals, disturb links, or change the reading
position when files refresh. An unsupported selection cannot block ordinary reading.

Saving, returning and removing work while the tutor is busy, stopped or unavailable. They send
no message, start no session and append nothing to a send queue. The learner can still copy a
quote into the existing composer; its normal queued/steering/unavailable behavior remains the
only delivery contract. A future selection-to-tutor experiment would need an editable preview,
source binding and the existing admission path, never an invisible automatic send.

## Proposed persistence and ownership

The learner owns durable marks. The engine would own their format and bounded writer; the app
would request mark creation/removal and render the result. A full-capability tutor can read or
edit course files, so this is a protocol/validation boundary, not protection against that tutor.
The protocol should tell it to preserve marks and never treat them as completion or consent.
Nothing automatically includes highlights in the tutor's opener or creates a review obligation.

Recommend a single proposed `tutor/reading-marks.json` record file with a schema version and
revision, containing only marks. A mark needs an ID, course UUID, module ID, relative lesson
path, lesson digest at creation, heading ancestry, paragraph index in that snapshot, full
paragraph plain text, selected quote, start/end offsets in that paragraph, a text-extraction
version and creation time. Persist text
as data, never HTML. The saved paragraph is bounded context for an unmatched quote, not a copy
of the whole lesson. Define explicit size/count limits before a disk-writing implementation;
never truncate an acknowledged quote to fit them. No notes, colours, grades or attempt IDs.

The disposable prototype can exercise this record shape only inside its isolated scratch
fixture. This does not install a format extension in a real course. Production use requires
a separate accepted ADR amending ADR-002/010 and SPEC's state table, plus an engine schema,
writer, capability/version plan and explicit existing-course update under ADR-027. Unknown
versions must be visibly unsupported and preserved. The app must not silently add this file
to an old course. Accepting assessment records under LB-016 would not accept reading marks.

App-data-only storage is rejected for permanent marks: copying the course would lose learner
work and contradict the complete-course promise in ADR-010. Browser localStorage is also not
a durable source. Course-local records travel on folder copy and survive loss of app-data.
Moving the folder retains its UUID; divergent copies remain separate local records, with no
sync or automatic merging by UUID. The active folder determines which records are read/written.
Git at session close can capture history but is not the save operation.

The main process resolves the selected course and lesson. Renderer paths do not grant arbitrary
write access. A future writer needs contained paths, link refusal, expected record revision,
source-digest validation and atomic replacement. It serializes creates/removes and preserves
external edits on conflict. `Saving` becomes `Saved` only after acknowledgement. On failure,
retain the quote and offer Retry or Copy; a lost acknowledgement is resolved by reading the
same mark ID before retry. Reopening recovers acknowledged marks only. Corrupt storage stays
untouched with a readable error rather than being replaced by an empty list.

### Matching after edits

Use one versioned extraction of visible prose text for both selection and matching, with
explicit handling of inline markup, whitespace and Unicode. Do not save DOM paths, rendered
line numbers or pixel positions as identity. Freeze that extraction in the disposable fixture
before testing anchors; a changed extraction version must fail visibly rather than reinterpret
old offsets. Mark creation checks that quote and offsets agree with the source snapshot.

- With the same source digest, the indexed paragraph and range must match exactly. The index
  distinguishes identical paragraphs in that unchanged snapshot; it is never a fallback after edits.
- With a different digest, match only in the same lesson and heading ancestry, where the full
  saved paragraph has exactly one occurrence and the saved offsets still select the exact quote.
  An inserted earlier paragraph can move the range. This is textual relocation, not proof that
  the saved rule remains valid; retain the original digest and the lesson-changed label.
- A changed paragraph, duplicate candidate, missing heading/file/module or unsupported extraction
  leaves the saved quote unmatched. No fuzzy match, tutor repair or nearest-offset guess.
- Preserve unmatched quotes and saved context in the same list. Offer Open current lesson only
  if that lesson exists. Remove affects the mark alone. Re-marking current text creates a new
  record; do not silently rewrite the old quote or anchor.

These rules never write inline spans into `LESSON.md`, update canonical teaching content,
record a quiz answer, increment progress, seed recall, or mark a requirement done. A highlight
means only that the learner chose to save that passage. It does not mean read, understood,
confused, mastered or independently recalled.

## Finite evaluation and stop conditions

First implement only this interaction in an isolated synthetic prototype if that follow-up is
chosen. Mechanical checks cover select/save/remove/reopen, lost acknowledgement, write refusal,
concurrent edit rejection, folder copy without app-data, and original/inserted/changed/duplicate/
deleted source variants. Compare canonical lesson and progress bytes before/after. Check that
unmatched quotes remain accessible after deleting the module, and that busy/unavailable tutor
states do not affect marks. Renderer checks cover focus, selection, link/lab behavior, themes
and geometry; an isolated native disk/reopen check proves the actual storage path. None of
these checks establishes learner usefulness or native assistive-technology usability.

Then run one small comparison with two consenting readers over two short synthetic lessons
with different rules. Use The parcel tray and an equally short original companion lesson;
do not reuse an already-solved trace as the second task. Alternate which reader gets highlights
on the first lesson. Both may use ordinary selection and their usual copy/paste notes. Include
an interruption and a return on the following day. Record whether they chose to mark anything,
the passage they tried to recover, navigation actions, time to find it, abandoned searches and
any confusion about whether saved text still applies after the supplied edit. Record the
copy/paste baseline fairly, including any effort to make and reopen notes.

After finding the passage, ask for an explanation and one changed case. Keep their response
separate from retrieval time; this checks whether the recovered context was usable, not whether
highlighting caused learning. Ask whether they would keep the feature for their own study and
why. Include a keyboard-only pass and an assistive-technology pass before any production claim.
If a participant or required accessibility check is unavailable, report the evaluation incomplete.

Stop after these two readers and one repair/retest of a concrete interaction defect at most.
Recommend a production proposal only if both can save and return unaided, recover the intended
context on the next-day task, understand the stale/unmatched state, and describe a specific
return benefit over their baseline. Log the individual observations, not an invented general
speed or retention claim. Defer if selection/notes serve them as well, marks go unused, or
stale quotes mislead. Mixed results justify deferral, not adding notes, tutor sends or folding
to rescue the experiment. Two readers can expose defects; they cannot establish learning gains.

## Evidence and independent assessment boundary

This recommendation uses S15, the current material/markdown renderer, SPEC, DESIGN, ADR-002,
003, 005, 010, 013, 019 and 027, and the existing sanitized backlog observations. No private
course was read or written. The text sketch and walkthrough are design reasoning only; no
browser, native, provider or learner acceptance is claimed. Accepted architecture is unchanged.

[LB-016's assessment design](assessment-design-2026-09-26.md) merged through
[PR #101](https://github.com/sqmch/lerience/pull/101) at
`f1c022fb517862205857f2fb8dd3ca00c3d59331`. Its final head
`43f4507bf278274c3d72b9b08840c531e33e1a22` passed
[Quality / Windows x64](https://github.com/sqmch/lerience/actions/runs/36246213813/job/108415931376).
That is documentation delivery evidence. Its standard Brief trace/explanation prototype and
portable engine-owned attempts remain unaccepted proposals. This reading experiment does not
redesign assessment, share its records, or depend on its pending decision.
