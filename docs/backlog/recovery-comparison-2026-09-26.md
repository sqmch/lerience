# Interrupted-generation recovery comparison

LB-004 / LB-005, following the merged investigation in PR #91. Source baseline `93d792d`.
Owner task `01a0dd2a-44c5-7001-b027-19d6d7004085`, branch
`codex/lb-004-recovery-boundary`.
Delivery and hosted checks: [PR #92](https://github.com/sqmch/lerience/pull/92).

## Decision

Do not ship the proposed protocol amendment. Both variants left generation pending without
QA, reference work, dependency installation or learner review. This small fixture does not
reproduce the historical QA/review-heavy recovery, and its timing difference is confounded by
different doctor inspection results and record work. The candidate also missed the proposed
90-second verified-close target. LB-004's historical latency remains unresolved. Advance to
the next backlog item rather than repeating provider runs to seek a favorable result.

The only shipped changes in this PR are the opt-in developer runner, its typecheck inclusion,
and this evidence. The launcher keeps native stdout/stderr attached to files and fails probe
exceptions into a local record, preventing the probe's output lifetime from disturbing the
learner. No production error handling or session lifecycle changes.

## Scope

One baseline/candidate comparison used the production `SessionConductor`, `ClaudeTutorAgent`,
`EngineScriptService` and `ElectronUtilityProcessRunner`. The native entry was successfully
built and its existence checked before launch. Windows, Electron 43.4.0, bundled Node 24.18.1,
Claude Code 2.1.282 and SDK 0.3.233; both variants requested `claude-sonnet-4-6`, medium effort.
This was a native main-process capture, without a renderer or installed-app launch.

The repository-owned [runner](../../dev/recovery/README.md) creates two disposable synthetic
courses and independent app-data. Both carry the same prior quiz history, an independently
explained accumulator, a level-2 assisted empty-array answer and an unattempted transfer probe.
A next-module lesson draft exists without a brief, scaffold, checks, QA or learner review and
is missing from progress. Recovery must reconcile that module's existence while preserving
the actual learning evidence. The draft topic was never studied.
The interrupted state is seeded directly into a durable transcript and course files. This does
not measure dashboard navigation or interruption of a live generation call.

The candidate adds one experimental paragraph to its copied Course Engine protocol. It says
to record unfinished material and outstanding QA/review as pending, defer their completion,
retain learning evidence even without file changes, seed covered concepts without duplicate
grades, commit and verify with doctor. It keeps QA/review mandatory before handover and leaves
continuation to the learner. Electron's recovery prompt is unchanged.

The template in the application is unchanged. No engine version bump, ADR, existing-course
update, release or installed-app improvement follows from an experimental instruction alone.

## Results

Times below are seconds from each variant's monotonic reference, initialized immediately
after fixture setup. The start row makes the small measurement setup offset explicit.

| Boundary | Baseline | Candidate |
| --- | ---: | ---: |
| Conductor start called | 0.154 | 0.088 |
| Initial inspection finished | 0.989, invalid doctor result | 0.654, valid failing coverage result |
| Start returned after request admission | 1.034 | 0.701 |
| Recovery provider result | 165.638 | 110.549 |
| Verification finished | 166.999, invalid doctor result | 111.117, clean doctor |
| Durable close outcome | `close_failed`, 167.020 UI snapshot | `closed`, 111.123 UI snapshot |
| Fresh opener provider creation | none | 112.049 |
| Fresh opener result | none | 136.232 |
| Recovery tool starts | 17 | 10 |

Persisted lifecycle timestamps corroborate the outcomes: baseline wrapping-to-failure took
166.842 seconds; candidate wrapping-to-closed took 111.024 seconds. These wall-clock deltas
are distinct from the monotonic reference above. The candidate's next opener added about
25.1 seconds after the verified close. Neither outcome is evidence of a 90-second recovery.

The baseline's 17 tools include four reads, five edits and eight shell commands. The candidate
used three reads, one glob, two edits and four shell commands. Neither ran QA or a review
agent, wrote a reference solution, installed dependencies, or completed the draft. Both tried
a Bash-style heredoc through PowerShell and then retried the commit with PowerShell syntax.
Do not attribute every tool category keyword to executable work: commit messages mentioned QA
without running it. The baseline made three commits while reconciling the missing module
coverage and its journal; the candidate made one.

Both outcomes keep module 00 `in-progress`, record `hint-2`, retain the empty-array gap and
unverified transfer, and register module 01 as `not-started` with outstanding work in notes.
The only file in module 01 remains the unchanged lesson draft. Neither claims review or
handover. Both preserve the prior journal entry and append one new entry, with total journal
sizes 1,777 and 1,494 UTF-8 bytes respectively. Both seed one empty-array question with an empty
history and leave prefix sums unseeded. Both finish with a clean course Git working tree.

The learning deltas are not identical. The baseline adds one correct grade for the new
independent accumulator answer, advancing its interval from three to eight days. The candidate
keeps the previous grade and interval, describing the new answer in its journal as already
recorded the previous day. Its progress notes also say the preview was not on the learner's
radar, despite the explicit request. Independent-versus-assisted evidence remains visible,
but those chronology/intent errors prevent claiming full pedagogical equivalence or endorsing
the candidate. Neither duplicates the seed or adds a grade for the assisted empty-array answer.

Each recovery read the small journal once with no explicit range; serialized tool-result
envelopes were 385 and 386 bytes. Those are not journal-content byte measurements. Each
received the recent journal in the opener facts too. The candidate's fresh opener requested
no file-read tools. This small example does not establish the cost of subsequent reads in a
long course, nor unnecessary journal duplication. There was no normalized provider failure.

## Native inspection and popup follow-up

The baseline's two doctor inspections returned unavailable with `course doctor produced an
invalid result`, while its tutor-side doctor and a separate native direct invocation succeeded.
The bounded follow-up instrumented invocation arguments, exit status, stdout byte count and
parser input on the same synthetic baseline. Both a direct service call and a conductor-path
call reproduced exit 0 with **zero stdout**. Quiz output was also intermittently empty. That
narrows the failure to missing captured output; it does not establish a parser defect.

The user reported an Electron main-process `EPIPE` popup with a console warning stack during
this work. The initial developer launch inherited a shell pipe and returned before Electron
finished. The later inspection launch also lacked persistent stdout/stderr redirection. Either
probe is a plausible source of the popup, but neither retained main-process stderr, so the
exact window/PID and warning cannot be correlated. Attribution is **unconfirmed**. Both
comparison artifacts completed, and no Electron probe process remained when checked.

With persistent stdout/stderr redirection, one unchanged-script replay returned valid output
through both direct and conductor paths: doctor 1,027 bytes, due list 37 bytes, all exit 0.
A disposable clone replacing the final `process.exit(...)` calls with `process.exitCode = ...`
returned those bytes but left the Electron utility processes alive until the existing
15-second timeout, in both paths. Reject that substitution. No original learning fixture was
modified by the flush test. No production source defect is proven, and no broader native
matrix or further provider run followed.

## Remaining evidence and next work

LB-004 needs a representative interrupted-generation capture that actually performs the
historical extra QA/review, or an authorized naturally occurring incident with retained
output/error boundaries. To resolve the empty-output question, a capture needs the exact
doctor stdout/stderr and stream/exit ordering under a stable native launch when it fails.
The normalized historical "Tutor not available" cause still needs a real structured provider
failure; none occurred in this comparison. These are evidence requirements for reopening the
investigation, not an instruction to run another matrix now.

LB-005's whole-journal-injection hypothesis remains rejected by PR #91. Subsequent long-journal
read cost and duplicate learning-record creation remain unproven. This comparison preserves
history and demonstrates one appended entry in each case, but does not justify pruning,
migration or a journaling-policy change. Both backlog items stay investigated and unresolved,
not implemented. The orchestrator can proceed to LB-010.

## Evidence limits

One run per variant cannot establish latency percentiles or stable model behavior. The fixture
is deliberately small; it does not reproduce a large partially generated module or the exact
historical provider context. A failure to reproduce historical generation/review during close
does not disprove the learner's historical delay.

Provider result, doctor verification and fresh opener completion are separate boundaries.
The comparison records monotonic times and normalized activities. Tool-result byte counts
measure serialized envelopes, not token usage or journal text alone. Neither provider payloads
nor private course content are committed. The first capture retained synthetic tool inputs
locally for inspection; the committed runner records only allowlisted metadata.

The first runner had two reporting mistakes, corrected before committing it: it compared a UI
lifecycle to `close_failed` instead of `close-failed`, and it read the seed store's cached
snapshot instead of reopening the persisted transcript. Therefore its eight-minute timeout
must not be reported as recovery work, and its cached `after` snapshot is not lifecycle proof.
The persisted transcript and recorded UI lifecycle establish the actual close boundary.

## Validation

`pnpm check` passed publication preflight, both application typechecks and the renderer
harness check, then reported one existing Mermaid test exceeding its five-second limit.
The other 66 application test files passed, with one file skipped. The failed Mermaid file
passed both tests on its focused rerun. The remaining gates were run separately: all 61
Course Engine tests, lint/formatting and production build passed. The final developer-runner
edits passed a fresh Node typecheck. The committed launcher corrections were type/lint checked,
without another native provider run. Hosted PR CI records the full combined check and audit.
No passing provider comparison was repeated. No package, release or installed-course
acceptance is claimed.
