# Teaching protocol evaluation

Reviewed 2026-09-05 against the protocol at `7ddb1d9` and engine 0.1.1.
These are small repository-owned cases. No personal course or external service is an input.

## Audit and scope

| Concern                | Already supported in 0.1.0                                                                                                              | Remaining gap addressed in 0.1.1                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Context before detail  | Verified background probing, capability-based arc, learner approval, LESSON.md before tasks, comprehension questions                    | Conditional orientation with a concrete path through the system before syntax                                                |
| Cognitive load         | Pacing interview, work blocks mentioned, just-in-time generation, hint-based stepping stones                                            | A block now has an observable outcome and intermediate demonstration; simplify or split when a module cannot support these   |
| Truth of lesson claims | Technical precision, behavioral checks, sealed reference green and scaffold red on assertions                                           | Separate source/version review of important claims, actual callers and failure paths, explicit limits on simplified examples |
| Learning evidence      | Hint and check records, teach-back before completion, journal specifics, quiz history including `tutored`, recorded boss-check attempts | Independent explanation and changed-example transfer; record assistance and preserve unresolved or deferred gaps             |

ADR-003 and ADR-023 keep pedagogy in `template/CLAUDE.md`. The session opener supplies facts;
the conductor delegates recovery and close to the course's protocol. `journalTail` carries only
three recent entries, bounded by 16 KiB. It cannot keep an old gap visible indefinitely.
Existing module `notes` can retain the gap and a journal date while the journal retains detailed
evidence. The tutor must read those notes and retrieve older entries when needed. No conductor,
Electron prompt, schema, assessment database, or teaching UI change is needed for this contract.

The patch replaces the completion and calibration rules and clarifies existing lifecycle steps.
It preserves arc assent, learner-written solutions, sealed hints, phase gates, and generation of
only the current module's full content. There is no universal lesson duration or score.

## Case 1: an overloaded beginner lesson

Input: the learner has written a few loops but cannot explain how monthly files become a report.
The approved outcome is to follow a file through that system. A draft first lesson begins with
regular-expression groups, then teaches file traversal, exception handling, schema validation,
aggregation, and caching. Its only demonstration is a complete scanner implementation at the end.

Qualitative application of the revised protocol:

- Begin LESSON.md with a simple system map: incoming files -> filing scan -> content validation ->
  aggregation -> report. Trace one September file to a report row, naming what each step owns.
  Ask the learner to place the scanner and predict whether it knows the report total. If they
  cannot place it, stay with the map. An experienced learner who already can may skip this read.
- First work block: trace a correctly filed path and identify the scanner's input and output.
  Read a worked example using a different source, then demonstrate with a new path.
- Second block: distinguish a rejected filing from an accepted file with unchecked contents.
  Teach only the necessary path rule and `continue`; demonstrate by classifying two paths and
  explaining which reaches the reader. Delay regex internals until the learner needs them.
- Propose separating read failures into the next module and postponing aggregation and caching
  until their prerequisites exist. Review that arc revision with the learner before building it.
  Later modules remain outlines. If the learner prefers the existing arc, reduce the current
  task and agree a useful stopping point rather than silently expanding it.

Review result: this gives the beginner two visible demonstrations before adding exception
handling and keeps implementation detail attached to an understood role. This is an authored
design review, not an observed tutoring session. It does not establish how long the blocks take
or whether a real learner will understand the map.

## Case 2: green exercise checks with an inaccurate explanation

Input claim: "The scanner handles malformed inputs and filesystem failures, records errors, and
continues through all files." The exercise checks only a valid filing and an invalid month.

Authoritative source for this case: `tests/fixtures/teaching-scanner.ts`, function `scanFilings`,
at this evaluation's Git revision. It is a deliberately simplified system with an injected reader,
not Lerience's course scanner or a production ingestion system. Its exact revision is the commit
containing this evaluation; consult Git history when comparing a later version.

Source review: the regex branch records invalid paths. `read(path)` runs outside a `try` block;
an exception leaves the function and prevents the next iteration. No caller in this fixture catches
it. Contents are stored without parsing. The original exercise cases can both pass while the
quoted sentence is false.

Corrected lesson passage:

> This example scanner reports paths that do not match its source/month filing rule and continues
> past those paths. A matching path is read, but its contents are not validated here. If reading
> throws, this function propagates the error and stops before later files. A production scanner's
> guarantees depend on its implementation and callers; this simplified example does not establish
> them.

`tests/teaching-evidence.test.ts` mechanically checks the original two filing cases, unchecked
malformed contents, and propagation of an injected `EACCES` error before the next file. The injected
error is deterministic evidence about this function's control flow, not an OS permission test.
These checks establish the source facts used to correct the prose. They do not read or certify the
lesson, and do not replace the sealed-reference/scaffold QA required for generated exercises.

Review result: handover needs the narrowed passage even with green exercise checks. For a real
existing-code course, the tutor must inspect that repository's implementation and callers at its
studied revision. If access or version evidence is missing, the guarantee remains unverified.

## Case 3: assisted pass, then failed transfer

Authored learner trace using the same scanner:

1. The learner passes filing checks after hint-2 provides the step order. They independently explain
   why an invalid month never reaches the reader.
2. Asked without coaching what happens when the first correctly filed path throws a read error,
   they say it joins `filingErrors` and scanning continues. This changed condition exposes a gap.
3. The tutor explains the uncaught call. Repeating that explanation with prompts the next day is
   tutored recall. On a later unassisted missing-file example, the learner again predicts a filing
   error. They choose to pause before another attempt.

Qualitative assessment: the filing explanation is supported; independent transfer of error
propagation is not. Keep the module `in-progress`. Help is permitted and useful, but the green
checks and prompted explanation do not establish the module's independent outcome. Offer a smaller
trace and a later fresh example; a pause or agreed deferral leaves the gap visible.

The test writes this manually assessed trace to temporary copies of existing records:

- `progress.json`: `hintsUsed`, `checkAttempts`, `in-progress`, and notes naming the gap, source
  journal date, and next independent probe. These notes remain readable after the detailed entry
  falls outside the journal tail.
- `journal.md`: what the learner explained alone, what help supplied, the failed changed example,
  and the pending recheck. The latest entry carries the open thread forward.
- `quiz-bank.json`: seed at close; on later dates use the real `tutored` and `grade ... wrong`
  commands with notes. Both schedule another recall attempt in one day. The transfer conversation
  at initial close is not invented as quiz history or a close-time pre-test.

Mechanical result: the engine schemas and desktop parsers accept these records; the quiz CLI
preserves assistance and wrong-answer history with notes and correct due arithmetic. The existing
opener includes the bounded journal tail unchanged. The test authors the assessment and carries
the gap forward explicitly. It does not prove a tutor will assess correctly, write those notes,
retrieve them, or refuse premature completion.

## Validation and compatibility

Focused command: `pnpm exec vitest run tests/teaching-evidence.test.ts tests/engine-schema.test.ts
tests/agent-opener.test.ts tests/engine-scripts.test.ts tests/course-creator.test.ts
tests/course-engine-updater.test.ts tests/session-conductor.test.ts`.
Full source gate: `pnpm check`. Mechanical assertions concern behavior, schemas, transport, creation,
and explicit update safety. There are no protocol phrase-presence assertions or tutoring scores.

Windows x64 validation used Node 24.18.0 and pnpm 11.9.0. The focused suite passed 54 tests,
with two assembled-runtime cases skipped. Supplying a fresh assembled runtime to
`pnpm package:windows:preflight` then passed all 28 preflight tests, including those creation and
update cases. Two independent runtime assemblies produced identical manifests and the complete
payload digest `e2e743422a0ecb3f7e340ee2591e5cc6369e23c591c8ed923971d61ca751c850`;
`pnpm distribution:inventory -- --root <assembled-runtime>` reported zero violations.

The 22-file engine tree hashes are `edab88af142313706ae8de062fcb54b430c4cf54d236ad62da952d712d78dfa1`
on Windows and `d4538260a9675c9c53bb2c7f6df6c691e6ab50e8899bc32a054345593cc7e97b`
for both Mac targets. The Mac value is derived from the tracked LF bytes and Git's 0644 file
modes using the assembler's sorted-entry hash format. Recomputing the previous revision with
those modes reproduced the prior accepted Mac hash. This is source-derived compatibility
evidence, not a native Mac assembly or acceptance run; those release gates remain required.

Engine version is 0.1.1; course format remains 0. Existing schemas, scripts, and record locations
are unchanged, so legacy course parsing remains supported. The runtime ledger must bind the changed
engine bytes. New courses receive the new protocol; existing courses keep their course-local copy.
ADR-027's updater core remains explicit and provenance-bound, with no new UI or automatic invocation.
Neither this patch nor the updater regenerates existing lessons, learner solutions, or records.

This evaluation supports a small protocol clarification, not a claim of improved learning outcomes.
With real learners, observe whether orientation helps them place the work, whether block boundaries
produce useful demonstrations, whether tutors find overbroad claims despite passing checks, and
whether assistance and unresolved transfer gaps survive interruption and return. Also observe
whether transfer probes add useful evidence without turning sessions into repetitive testing.
No live learner study, provider tutoring comparison, native app acceptance, or app release is part
of this evaluation.
