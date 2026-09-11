# ADR-041 — Modules are reviewed from the learner's side before handover; hint files retire

Date: 2026-09-11 · Status: accepted · Amends ADR-002 (course format) and ADR-003 (pedagogy source)

## Decision

Course Engine 0.2.0 changes the handover contract for a generated module in three ways.

1. **A learner's-eye review is required.** Before handover, a reader with none of the author's
   context — a subagent where the provider offers one, otherwise a deliberately cold pass —
   reads only `LESSON.md`, `BRIEF.md`, the scaffold as handed over, and the learner's evidenced
   prerequisites, and writes `REVIEW.md` in the module directory under four headings: terms
   before use, answer form, doable from the page, assumptions about the learner. Each is a
   per-item list ending in a location, "fixed", or "removed". `npm run qa` fails a generated
   module without the file, fails an incomplete one, and warns when it is older than the
   lesson or brief.
2. **QA cross-checks the answer contract where it can.** Where the scaffold carries a
   structured answer file, a placeholder must be `null` or the type a correct answer has,
   and every answer field must be named in the brief. Every code-span term the brief uses must
   appear in the lesson or the scaffold, as a warning. A module whose deliverable is source
   code has no answer file, and the contract lint says so and stays silent rather than
   inventing a contract.
3. **Sealed hint files retire; assistance levels stay.** The three levels keep their
   definitions — nudge, approach with no pasteable expressions, near-spoiler pseudocode as the
   ceiling — but they are moves the tutor makes about the learner's actual stuck point, named
   as given and recorded in `hintsUsed` with the existing `hint-1..3` values. The tutor is
   told to prefer teaching the concept behind a gap over climbing the ladder. No level is
   mandatory before the next, and the answer is never given.

Course format stays at version 0: no schema changes, `hintsUsed` keeps its shape, and a module
carrying legacy `hints/` still validates; QA reads it as legacy and warns rather than fails.
Existing courses keep their own engine copy under ADR-027 and receive this only through an
explicit engine update.

## Why

Four consecutive modules of one real course were handed over with the same defect class: a
brief that used labels the lesson never defined and an answer file whose format was never
stated. The tutor diagnosed it correctly after each handover, repaired the module, and wrote
the rule into its journal — and the next module failed again. The journal did carry the rule
forward, and module 03 was generated with explicit per-field types; it then failed on
terminology and answer form in a different shape. A defect ledger would have been one module
behind every time. The failure is authoring from the author's point of view: the author knows
the answers, so an undefined label looks obvious. The general fix is a reader without that
context, and an artifact QA can require, because a protocol rule that produces no artifact is a
promise this protocol already contained and the same model agreed with and broke four times.

The two contract lints were validated against module 00 of that course as the learner met it:
fourteen of twenty-four answer fields were named in the brief and ten were not, and the ten
were exactly the fields the journal records the learner objecting to; eight brief-only terms
were flagged and all eight were the labels the learner had asked about. No false positives on
that module. The lints are mechanized as course-independent contracts, gated on an answer file
existing, and the term lint stays a warning because it is a heuristic.

Hint files were opened twice in four modules, hint-2 and hint-3 never, and both openings were
generic, because a file written at generation can only address the difficulty its author
predicted. When the learner was actually stuck, hint-1 was revealed and was useless, the
learner asked for no more hint files, and what worked was a parallel worked example. What kept
assistance honest across those modules was the journal's accounting of assisted versus
independent answers, not sealed files. The record and the ceiling survive; the files and the
mandatory sequence do not.

## Rejected

- **A `tutor/materials.md` defect ledger read at generation.** The journal already carries
  fixes forward and demonstrably did not close the loop; a list of past defects is always one
  module behind a new one.
- **Stronger prose rules in the protocol alone.** The protocol already said "never hand over a
  brief cold"; adding a fifth sentence to a document the model agrees with and does not follow
  is the change most likely to feel like progress and produce none.
- **A second provider as reviewer.** The most general answer and the most expensive: another
  provider session per module on a local-first product. A fresh context of the same provider
  gets the property that matters, which is the absence of the author's knowledge.
- **Keeping hint files and making them adaptive mid-module.** Costs a mid-session write the
  tutor may simply not do, which is the same enforcement problem this decision exists to end.
- **Removing assistance levels and the record entirely.** Throws away the part that was
  load-bearing: without a named ceiling, "I'm stuck" plus a model under social pressure to be
  useful produces the solution, and the completion record loses the line between what the
  learner did and what they were given.

## Verification

Deterministic engine tests cover the review checklist (complete, missing, empty, free heading
wording), the answer contract (null placeholders pass, wrong types fail, unnamed fields fail,
a reference-only leaf fails, no-reference mode checks naming only), and the term lint (paths,
commands, literals and fenced code are skipped). The desktop's build-progress view counts
`REVIEW.md` as the module part that replaced hints. Not verified: whether a tutor writes an
honest review rather than a compliant one, and whether the review catches comprehension
defects a lint cannot see; those are learner-run evidence and belong in the next course's
journal.

## Reopens if

- Learner-run evidence shows the review passing modules that still hand over undefined terms
  or unstated answer forms; the next step is a separate model as reviewer.
- A course type needs a no-tutor affordance, which is what sealed hint files were.
