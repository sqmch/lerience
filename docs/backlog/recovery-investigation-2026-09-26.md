# Recovery latency and context investigation

LB-004 / LB-005, 2026-09-26. Owner task `01a0dd1a-ad92-79d1-a183-c57bcb25869d`,
branch `codex/lb-004-005-recovery`. Current source baseline `ef2dd8a`, after PR #90.

## Finding and decision

The long waits in the inspected history occur inside the provider's recovery turn.
Local preparation and close verification are much smaller. Some recovery turns perform
QA, review and dependency work as well as recording learning. A smaller journal excerpt
or faster transcript scan would not address the dominant measured interval.

Keep ADR-009's recovery-first close. Do not gate recovery on file changes, remove the
close ritual, truncate learner history, or declare a module complete without review.
This PR changes documentation only. The next bounded experiment should test a protocol
distinction between **recording an interrupted session** and **finishing its unfinished
module generation**. The latter should remain explicitly pending unless it is necessary
to reconcile learning records or the learner chooses to continue it. That is a proposed
protocol decision, not an implemented shortcut or a proven speedup.

## Evidence and method

Read-only inspection of one authorized course and its matching app-data found 29 session
JSONL files, 11,345,431 bytes, and 52 dated journal entries. This is a later snapshot than
S14's reported 37 entries. Historical app/provider versions are not recorded per session,
so these timings are not a benchmark of current `main` or proof of the exact S14 incident.
No course script, provider session, engine update, or Git mutation ran against the course.
Private content, identifiers, paths, commands, and timestamps are omitted here.

Method: parse JSONL read-only, order sessions by header time, and match each `wrapping`
lifecycle record to its next `closed` or `close_failed` record. Include a recovery attempt
only when the intervening operator message contains `[Recovery-first close]`. Explicit
End turns are separate. Durations use recorded timestamps, not the displayed Thinking
timer. The provider interval includes tool execution, approval waits, scheduling and
event persistence; these records cannot divide it into pure model and tool latency.

The table labels are chronological zero-based session ordinals, not learner identifiers.
There are 22 recovery attempts, 21 successful and one failed. Successful recovery elapsed
time ranges from 9.218 to 2,201.414 seconds, median 194.522 seconds. Seven exceed seven
minutes. The failed attempt takes 30.251 seconds and is followed by a successful retry.

| Sample | Wrap to operator, s | Operator to result, s | Result to closed, s | Total, s | Tool activities |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.963 | 41.332 | 0.404 | 42.699 | 9 |
| 4 | 1.281 | 2,199.671 | 0.462 | 2,201.414 | 42 |
| 6 | 5.010 | 743.730 | 0.302 | 749.042 | 70 |
| 9, successful retry | 0.341 | 845.233 | 0.391 | 845.965 | 66 |
| 10 | 5.341 | 417.648 | 0.385 | 423.374 | 44 |
| 11 | 5.778 | 3.079 | 0.361 | 9.218 | 0 |
| 12 | 2.701 | 191.508 | 0.313 | 194.522 | 20 |
| 18 | 9.289 | 843.697 | 0.294 | 853.280 | 46 |
| 20 | 4.182 | 789.681 | 0.364 | 794.227 | 33 |

Across successful recoveries, wrap-to-operator preparation is 0.341–11.706 seconds and
result-to-closed verification is 0.294–0.462 seconds. The latter includes the app's doctor
inspection and transcript sealing, not doctor commands the tutor may run during its turn.
Navigation and initial active-transcript lookup precede `wrapping` and are not timed by
these records. Provider startup continues after operator admission, so it cannot be
separated from first-response latency here.

The next opener is another cost. For example, sample 19 closes in 185.560 seconds, sends
its fresh opener 2.888 seconds later, then waits 719.254 seconds for that opener's first
`turn_complete`. Do not describe close time as total time to resume. Another inter-session
gap is 1,364 seconds; there is insufficient evidence to attribute that gap to automatic
handoff rather than intervening user/runtime activity, so it is not a handoff benchmark.

### What the long turn contains

Sample 9's successful retry has 66 tool activities. Relative to `wrapping`, metadata
identifies QA at 68, 74, 81 and 160 seconds; review Agent calls at 183 and 595 seconds;
progress/quiz work around 611–657 seconds; journal work at 662 seconds; dependency
installation at 674 seconds; and more QA through 768 seconds. The result arrives at
about 845 seconds. These are tool-start/activity timestamps and category matches, not
tool-completion durations or proof that every operation was unnecessary.

Samples 6, 18 and 20 include respectively 6, 14 and 11 Agent activities. Some providers
use that label for agent management too; those counts are not counts of distinct reviews.
Sample 4 has an approximately 1,846-second gap between tool activities. Its generic
metadata cannot establish whether that gap was a long tool, approval, provider stall,
or other work. Do not assign that entire interval to journaling or review.

### Journal and recovery context

The current journal is 259,260 bytes. Individual dated entries span 1,170–13,097 bytes.
The production `journalTail()` returns 8,191 bytes from the current last three entries.
Across 51 historical opening/recovery fact blocks, injected journal excerpts range from
zero to 16,384 bytes. This rejects whole-journal injection as the explanation for those
openers. It does not reject subsequent whole-file reads.

Current `recoveryRequest()` separately budgets 24,000 JavaScript string units for visible
conversation evidence, with labels/separators beyond that budget. This is not a token or
UTF-8 byte cap. Complete recorded recovery operator messages contain 19,940–44,143
characters because they also include doctor, due-item and journal facts. Provider protocol,
system context, subsequent reads and tool results are additional. No total model-context
or token-use claim can be derived from operator length alone.

Only 711 of 2,936 historical tool records have a `detail` field. Earlier Shell/Files
records omit targets; newer shell details are often descriptions rather than the actual
command. Journal-related descriptions establish later journal work, but do not reliably
distinguish reading from writing, selected ranges, or returned bytes. App transcripts do
not retain tool results. A zero target match is missing evidence, not proof of no read.

Nineteen journal headings mention recovery and 26 mention close, with possible overlap.
Headings and entry counts do not establish redundant learning evidence. There is no
durable session-to-entry identifier, and journal additions can occur during conversation
as well as app closure. Exact entry creation by transition type therefore remains
unmeasured. Preserve all existing entries. Assess concise maintenance-only entries in the
next controlled experiment, without dropping independent/assisted evidence or open gaps.

### Current local processing check

A temporary Vitest probe copied only the 29 transcript artifacts into disposable app-data,
then called the production `FileTranscriptStore.openActive()` and `snapshot()` five times.
The source transcript hashes matched before and after. Windows, standalone Node 24.18.0:
1,153, 731, 666, 700 and 596 milliseconds. These repeated local runs are cache-sensitive,
not cold-start percentiles. The production journal-tail function averaged 0.164 ms over
100 calls on the current journal. These measurements are far below the historical
multi-minute provider intervals. No native app launch or installed-app speedup is claimed.

## Unexpected Tutor not available

Eight transcript errors precede `agent_ended: died`: six generic Codex turn failures,
one generic Claude turn failure, and one explicit Claude sign-in failure. The renderer
maps errors other than auth/rate-limit to unavailable. The generic strings are deliberate
provider error normalization, not original provider diagnostics. Current code is in
`src/main/agent/{claude,codex}.ts`, `src/main/session/conductor.ts`, and
`src/renderer/src/seminar/seminar-state.ts`.

The sign-in case has a supported auth explanation, but cannot be identified as S14's
incident. The seven generic failures do not establish context exhaustion, rate limiting,
process death, or the background-turn bug addressed by PR #89. The exact missing evidence
is the provider's structured failure subtype, process exit code/signal if applicable, and
its ordering against root results and background activity. A repeated normalized error
message will not resolve this. Retain credential redaction and do not log raw provider
payloads to obtain it.

## Next bounded task and acceptance

Implement one disposable capture experiment, then decide whether a protocol amendment is
justified. Do not expand this into a general session-lifecycle redesign.

1. Capture the production conductor with an unchanged source baseline and one fixed
   provider/model/effort. Record monotonic phase times for dashboard abandon, active lookup,
   inspection, provider creation, accepted recovery request, first event, root result,
   verification, shutdown and fresh opener completion. Keep numeric lengths, allowlisted
   tool categories, completion durations and structured failure codes. For journal reads,
   capture requested range and returned bytes, including shell reads and child agents.
   Missing instrumentation is reported as unknown, never zero.
2. Use disposable synthetic courses for a settled opener with no learner turn, actual
   conversation-only study, and interrupted generation with pending QA/review. Capture
   journal/progress/quiz deltas before and after each transition. The historical auth-failed
   opener with zero learner messages is not an ordinary no-op control. Existing conductor
   tests establish state transitions, not native latency or pedagogical completeness.
3. Compare the same unfinished-generation fixture with a candidate canonical protocol
   instruction: close from observed learning evidence, record unfinished generation and its
   outstanding checks, and defer completing/reviewing that material until continuation.
   Required record reconciliation, honest journal entry, quiz seeds for concepts actually
   covered, commit and doctor remain mandatory. Never infer no learning from unchanged files.
   Never present pending material as reviewed. Do not add a second policy to Electron prompts.
4. Proposed experiment targets, not release promises: no-op wrap below 30 seconds and
   ordinary study wrap below 60 seconds in three runs each; interrupted-generation wrap to
   an honest pending state below 90 seconds. Compare against the same provider baseline.
   Require no lost open gaps, no invented independent answers, no duplicate grades/seeds,
   retained older-evidence retrieval, and no QA/review for material merely left pending.
   If no-op still exceeds the target, inspect its measured phase before changing lifecycle.
5. In the same disposable capture, inject a provider failure and verify its normalized
   structured code and `close_failed` behavior. One real occurrence of the generic failure
   is still needed to explain the historical unavailability. Stop after that captured event
   or the finite experiment; do not retry live failures indefinitely or scan private provider
   archives. A protocol change requires its own review and engine-version delivery plan.

This identifies the dominant stage and gives the next decision without claiming a fixed
20-minute incident. LB-004's initial investigation is complete; its failure diagnosis remains
bounded by missing provider evidence. LB-005's whole-journal-injection hypothesis is rejected
for the inspected openers; subsequent-read cost and record duplication remain open measurements.
There is no source fix, merge, release, or installed-course change in this work.

## Validation and delivery

Focused production conductor, transcript-store and engine-script tests pass, as does the
temporary read-only/copy measurement probe. Publication preflight, changed-document
formatting and `git diff --check` pass. The temporary private-data probe was removed before
commit. Full hosted source validation and dependency audit are recorded on the draft PR.
No source implementation, native provider run, package acceptance or latency improvement
is claimed. The draft PR is for orchestrator review; merge and release are separate.
