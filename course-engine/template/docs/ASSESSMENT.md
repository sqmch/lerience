# Optional numeric prediction and explanation

Use this only when numeric prediction with reasoning fits the module's learning objective.
The ordinary `BRIEF.md` remains the full practical brief. It can contain prose, code,
commands, discussion or sketching. A mixed module retains its real scaffold and checks.
For other response forms, use the existing brief, editor, conversation or sandboxed visual.

## Author a question

Create `curriculum/<module>/assessment.json` using the question schema in `docs/schema/`.
Its version starts at 1. Every change to the prompt, ordered fields, criteria or objective
key increments the version. Use stable field/criterion IDs, full self-contained prompt,
labels and explicit units. Fields are required whole numbers or explanations, initially
blank. There are no answer defaults. Put exact numeric answers in `assessment-key.json`,
which the app excludes from the draft view. Question and key share question ID and version.

For example, predict a bin starting at 2 with capacity 6 after adding 3, removing 4 and
adding 7. Four integer fields can ask for 5, 1, 6 stored and 2 spilled, with an explanation
field. The explanation criteria ask for the prior count, arriving tokens and discarded
excess. Equivalent wording is valid; no keyword or string-equality grade assesses reasoning.

```json
{
  "schemaVersion": 1,
  "moduleId": "00-token-bin",
  "questionId": "trace",
  "version": 1,
  "title": "Predict before running",
  "prompt": "A bin holds 6 tokens and starts with 1. Add 7. How many spill, and why?",
  "fields": [
    {"id":"spill","kind":"integer","label":"Tokens spilled","units":"tokens"},
    {"id":"why","kind":"explanation","label":"Why does it spill?","units":""}
  ],
  "criteria": [{"id":"capacity","description":"Account for the prior count, arriving tokens and capacity."}]
}
```

The corresponding key is
`{"schemaVersion":1,"questionId":"trace","version":1,"answers":{"spill":2}}`.
Keep keys out of prompts, labels, worked examples of this exact case and default input.
The learner owns these files and can inspect them; this is not a proctored system.

Before handover, a fresh reader solves the rendered question from the lesson and Brief
without seeing the key. Then compare to the key and repair ambiguous wording or arithmetic.
Include the question, labels, units and criteria in the existing four-heading `REVIEW.md`.
Record the correct and an incorrect numeric case and distinguish semantic review from
schema QA. `qa-module.mjs` treats assessment as generated work, requires that review and
checks question/key binding and freshness. A mixed scaffold still requires the sealed
reference green/red ritual; assessment-only work has no scaffold TODO requirement.

## Saving, submission and review

The app saves raw drafts locally through `scripts/assessment.mjs`. Only the learner's
explicit Submit action freezes answers and runs numeric checks. Invalid raw input is kept
as a draft. Saved records travel in `tutor/assessments/<UUID>.json`; their question/key
snapshots, digest, revision and submission identity are authoritative for that attempt.
Use the writer for all additions. Never edit an existing record directly.

An explicit review request names the submitted attempt and its source digest. Read that
immutable record, including reported assistance and prior feedback, and assess each original
criterion. Append a new feedback ID. A supported result needs an excerpt from the submitted
answer and rationale; uncertainty warrants a follow-up. Feedback states are `supported`,
`needs-work` or `uncertain`. A later review adds a record; it does not erase the first review.
The app shows later help reports and learner disputes alongside the original feedback.

Raw engine clients use stdin JSON, not shell-interpolated answer strings:

```text
node scripts/assessment.mjs <course-root> <module-id> read
node scripts/assessment.mjs <course-root> <module-id> feedback < review-request.json
```

`review-request.json` has `id` for the attempt and `feedback` matching
`docs/schema/assessment-feedback.schema.json`: UUID `id`, matching `attemptId` and
`sourceDigest`, `author: "tutor"`, ISO `createdAt`, and one result for each criterion.
Each result has `criterionId`, `state`, exact submitted `excerpt` and `rationale`.
Read the writer's JSON reply and require `ok: true` before claiming the review is recorded.
Schema and excerpt binding establish record consistency, not judgment correctness.

Do not infer independent work from unknown help. Revisions retain their parent and feedback
exposure. Ask for a fresh changed case when transfer needs evidence. Neither local submission
nor objective/reasoning results may automatically complete a module, write a boss pass,
change recall intervals or grade a due quiz. Existing completion and learner authority rules
remain in `CLAUDE.md`. Cite attempt IDs in discussion; any subsequent progress or quiz action
requires the existing protocol's evidence and learner interaction.

## Compatibility and recovery

`assessment-capability.json` negotiates `numeric-explanation-v1`; base course format stays 0.
New engine templates include it. Missing or unknown capability stays ordinary/unsupported
without writes. There is no automatic existing-course conversion or answer-file inference.
Copying a course retains acknowledged drafts, attempts and feedback; app-data is unnecessary.
Two live folders with the same course UUID cannot be registered together in one app profile.

Writes serialize through a cooperative process lock, compare revisions/source digests and
atomically replace complete bundles. Lost acknowledgements retry the same attempt and saved
revision. A changed question uses a separate draft; old records remain readable. Errors retain
unsaved input in the current window. A hard crash can lose unacknowledged edits. Review delivery
can be uncertain after interruption; inspect the seminar before explicitly retrying. No
automatic provider resend or exactly-once execution is promised.
