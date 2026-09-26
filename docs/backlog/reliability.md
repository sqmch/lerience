# Session and course reliability

See the [register and session order](README.md) for each item's current status.
Evidence is from intake on 2026-09-25 and static inspection at `0023ff9` unless stated otherwise.

<a id="lb-001"></a>
## LB-001: QA may delete scaffold dependencies

P1, bug. Source S16. Implemented in source, unreleased; see the evidence below.

The learner reports `node_modules` disappearing more than once during one session. The quoted
tutor claims three occurrences and a deterministic Windows Node 24 junction-cleanup cause.
It says QA links a temporary scaffold to the real install, then
`fs.rmSync(link, { recursive: true, force: true })` empties the target. Its claimed test left
the real directory present but empty, with `isSymbolicLink: true` and `isDirectory: false`.
It claims `unlinkSync` and `rmdirSync` preserve the target and proposes a tiny fix. Those are
third-party diagnostic claims from the tutor, not a reproduction accepted here. The learner
has not established whether the problem affects other courses or runtime versions.

Code observed: `safeRemove` in
[`qa-module.mjs`](../../course-engine/template/scripts/qa-module.mjs) contains the reported
recursive removal and a later whole-tree removal. The text alone does not establish how the
affected runtime handles junctions. The tutor also says it cannot patch engine-owned files and
has been reinstalling dependencies after QA. Preserve this as history, not the product remedy.

Initial investigation plan: record the affected engine copy, Node patch version, OS, and actual QA launch path. Use
disposable fixtures with sentinel files both in the target install and beside it; reproduce
the complete QA success and failure cleanup paths. A standalone junction experiment may
isolate a cause, but does not alone validate the QA workflow. If deletion does not reproduce,
investigate other writers instead of adopting the quoted conclusion.

Done when QA cleanup preserves target contents and neighboring files on the affected Windows
runtime, including failure paths, with a meaningful regression check. If an engine change is
needed, cover its manifest/runtime-ledger requirements and explicit existing-course update
path under [ADR-027](../DECISIONS/ADR-027-explicit-course-engine-update-core.md). New app code
does not silently fix older course copies. Start with
[`qa.test.mjs`](../../course-engine/tests/qa.test.mjs). No real learner dependency tree is a
reproduction fixture.

### Investigation and fix, 2026-09-25

Owner: `codex/lb-001-qa-dependency-preservation`. Source baseline `a8ade1f`, Course Engine
0.2.0. Implementation: [PR #88](https://github.com/sqmch/lerience/pull/88), source commit
[`678ac6e`](https://github.com/sqmch/lerience/commit/678ac6e1e891b34e57ed6d5ada47bb52ed5cd269).
The PR records the CI and merge outcome separately from the unreleased engine change.
Read-only inspection found the affected course's QA script byte-identical to the
canonical script, SHA-256 `4801a74510f2c547aa5d7819b5c03fce91925de68c1d45e88bd5b52f618c1b3d`.
Its course-level QA command is `node scripts/qa-module.mjs`. The installed app carries engine
0.2.0 and launches Node/npm through Electron shims. Journal entries identify bundled-runtime
failures and both Node 24.18.0 and 24.18.1, but are tutor accounts, not captured process traces.
No QA, install, cleanup, engine update, or learning-record writes were run against that course.

Disposable sentinel experiments on Windows 11 build 26200 established the failure under the
installed Electron 43.4.0 / Node 24.18.1 runtime in `ELECTRON_RUN_AS_NODE=1` mode. Both recursive
removal of the junction and recursive removal of its parent deleted target contents. Direct
`unlinkSync` and `rmdirSync` preserved them. Standalone Node 24.18.0 preserved the same targets
for all four operations. The tutor's broad claim about Node 24 is therefore too imprecise; the
reproduced runtime is Electron's bundled Node. This does not establish an upstream Node or
Electron source regression or reconstruct every historical incident.

The complete QA CLI reproduced the dependency deletion before the fix, including after check
crashes and simulated spawn/timeout failures. The check fixture only reads its synthetic
dependency, so neither npm installation nor check-code deletion is needed to cause the loss.
The old cleanup's recursive fallback also makes replacing only the first removal insufficient
when unlinking fails. Check-created links elsewhere in the temporary tree need the same care.

Engine 0.2.1 removes each temporary entry using `lstatSync`, unlinks files and links without
traversing link targets, and removes emptied ordinary directories with `rmdirSync`. It never
falls back to recursive removal. A failure retains remaining temporary files and emits a
cleanup warning. Reusing installed dependencies still avoids a copy or install for each QA run.
This is cleanup protection, not a sandbox: course-authored checks remain trusted code and can
write through the shared dependency link. No broader isolation or speed claim is made.

Regression command: `node --test course-engine/tests/qa-cleanup.test.mjs`. The fixture covers
as-is assertion failures plus a passing reference, crashing checks, overlay-copy failure,
injected timeout and spawn errors, failed unlink, dangling junctions, nested check-created
links, neighboring sentinels, and temporary-tree removal or deliberate retention. Windows tests
run under standalone Node and the pinned Electron binary. Electron cases use the production
Node/npm shims with host Node excluded from PATH. OS/process failures are injected to exercise
the cleanup branches; they do not prove termination of a real hung process tree.

Validation: the 14 regression cases pass with both the pinned development Electron and the
installed app executable and npm shims. The latter run uses only disposable fixtures. Two
Windows runtime assemblies produced identical manifests, SHA-256
`2f2325e92b82c3dec4b869d1164bb12bcc7b2576177efa3b09f0b91544391f96`, with 2,356 inventoried
files and zero violations. Focused assembled-runtime, engine-ledger, and updater tests pass
16/16. The engine manifest is bumped with course format 0 unchanged. All three accepted engine
tree hashes are updated; Mac hashes use tracked file modes and a hashing model checked against
the previous accepted hashes, not a native Mac run.

The linked PR records required `pnpm check`, publication-prose, dependency-audit, and final-head
CI results before merge. Initial local full-suite attempts hit the existing packaged-npm launch
timeout and, on one run, a Vitest worker-start timeout. The local follow-up limits Vitest to two
workers without changing tests or timeout limits. Hosted Windows CI passed the application and
all 61 engine tests before identifying a missing explicit `URL` import in the new fixture;
commit `240b913` supplies that import. These validation failures are separate from the
dependency-deletion reproduction.

Delivery boundary: merging this change does not update the installed app or existing course.
A future app release must carry engine 0.2.1. An existing course then requires ADR-027's separate
explicit, provenance-bound preview/apply operation after the tutor session is closed, with a
clean named branch and no conflicting engine edits. The updater core exists, but this change
adds no learner update UI and applies no update. Previously deleted dependencies are not
restored by replacing the script.

<a id="lb-002"></a>
## LB-002: Claude remains Thinking after apparent completion

P1, bug. Sources S02 and S07 are consolidated here.

Investigation owner, 2026-09-25: task `01a0d98e-2e1d-77b3-b590-0d493b1bb779`, branch
`codex/lb-002-003-session-activity`, baseline `2b67c62`. Tracing provider terminal events,
background tasks, conductor state, renderer state, and reconnect snapshots alongside LB-003.

After course or module generation, Claude appears to have written the expected material and
sent the course-start messages, but the Thinking loader and timer continue indefinitely. One
report reached 207 minutes. A yellow weekly-limit banner was also visible. Its causal role is
unknown, and apparent material completion does not prove all provider work has finished.

Trace provider result/turn boundaries through
[`claude.ts`](../../src/main/agent/claude.ts),
[`conductor.ts`](../../src/main/session/conductor.ts), and
[`seminar-state.ts`](../../src/renderer/src/seminar/seminar-state.ts). Capture a sanitized event
sequence with actual pending tool/review work, warnings, terminal events, and renderer state.
Compare normal completion, completion with a usage warning, background review, interruption,
and provider failure. LB-003 is related work, not an assumed explanation. LB-006 owns warning
accuracy independently.

Done when a completed or failed turn clears the busy state and timer, while real pending work
remains truthfully represented. Verify the event sequence in adapter/state tests and a native
Claude run. An arbitrary timeout that hides the loader is not evidence of completion.

### Shared LB-002 / LB-003 findings, 2026-09-25

Implemented in source in [PR #89](https://github.com/sqmch/lerience/pull/89),
source commit [`76bc9a2`](https://github.com/sqmch/lerience/commit/76bc9a25715386f9ac94ac66d653a53e3c1787b1)
on `codex/lb-002-003-session-activity`. PR #89 records final CI, review, and merge outcomes;
source implementation alone is not a merge or release claim.
App 0.0.14 and Course Engine 0.2.1 remain unchanged and unreleased by this
work. No installed app or course was updated. The private course and its learning history were
not used as a reproduction fixture or edited.

Pinned and installed SDK: `@anthropic-ai/claude-agent-sdk` 0.3.233. Installed provider:
Claude Code 2.1.282 on Windows. The SDK's `SDKBackgroundTasksChangedMessage` documents a full,
replace-only live task list whose ordering against task-start/notification edges is unspecified.
`SDKTaskNotificationMessage` carries completed, failed, and stopped outcomes. The current
[official streaming docs](https://code.claude.com/docs/en/agent-sdk/streaming-output) distinguish
root message starts from final results and child messages;
[subagent docs](https://code.claude.com/docs/en/agent-sdk/subagents) describe background execution.
The actual installed types and native event sequence, not assumptions about prose, determine
the mapping in this fix.

Two disposable synthetic lesson/brief runs established this sanitized sequence, first through
the SDK and then through the production adapter and conductor in Electron:

```text
app send
root Agent tool call
background_tasks_changed: one live task
root text, result success                  -> foreground idle, task still running
child Read calls and child reply
background_tasks_changed: empty
task_notification: completed
root message_start, root reply            -> automatic foreground turn
result success                            -> foreground idle, no tasks
```

The adapter previously ignored background membership and outcomes. After the first result,
`turnInFlight` was false. The automatic reply still reached the renderer, making it busy, but
`finishTurn()` suppressed the second `turn_complete`. The renderer could therefore remain
busy indefinitely. The background work before that reply was invisible. This is a supported
shared cause for LB-002 and LB-003, not proof that every historical 207-minute incident followed
that sequence or that a subscription warning caused it. LB-006 remains separate.

The fix reports genuine automatic root turns and completes them at their result. It reports
background membership separately, without extending Thinking or disabling the composer after
a foreground result. The conductor includes live task state in snapshots and clears it when
the runtime ends. Child text, task output files, and task result summaries are not added to the
learner transcript. See [ADR-043](../DECISIONS/ADR-043-provider-initiated-turns-and-background-activity.md).
The engine's learner-side review requirement and existing queue/steering behavior are preserved.

Validation:

- `pnpm exec vitest run tests/claude-agent.test.ts -t provider-initiated` failed before the fix
  because the resumed root turn was not busy. The fixed focused suite passes 76 tests across
  the adapter, conductor and renderer. It covers independent multiple tasks, edge/level order,
  child-message exclusion, interrupted late results, failed turns, process death, snapshot
  rehydration, transcript finalization, and one-time queued-message delivery.
- Review reproduced foreground admission races in send, retry, and End, lost queued text,
  and untracked root output after a missing interrupted result. Regression tests failed before
  their repairs. Provider acceptance now precedes saving, with output held until the request
  is durable; save failure after acceptance stops the runtime without inviting resubmission.
  Queued text survives rejection, with a manual retry and no retry loop. Ambiguous post-interrupt
  root output retires the runtime before display because the pinned SDK cannot correlate it.
  The late-old-result-first path remains supported. ADR-043 records these boundaries.
- A further review fixture reproduced a complete automatic reply buffered behind an earlier
  result's disk write. Claude now refuses admission while old foreground boundaries remain
  queued; the conductor already waits for handed-off results to finish saving. The production
  Claude adapter and real conductor regression verifies both cases and permits closure only
  after the closing request's own result. No new event protocol was introduced.
- The new Codex routing fixture hit its 5-second CI timeout because its shared setup launches
  a real PowerShell write probe. That event-routing test now stubs only the write-verification
  dependency and always closes its session; the separate sandbox tests retain real probes.
  Its timeout was not raised. Final-head CI remains required for this repair.
- A guarded native Electron 43.4.0 / Node 24.18.1 probe used the production Claude adapter,
  SessionConductor, transcript store and renderer reducer with synthetic lesson/brief files and
  temporary app data. The provider performed a real background read review. Two results and
  one automatic turn start produced an idle final reducer and reconnect snapshot, zero tasks,
  and two finalized tutor messages. Read and Agent were allowed only in the disposable probe.
  Provider authentication and configuration were neither copied nor changed. No generated
  module, installed package, macOS acceptance, or historical course reproduction is claimed.
- The first native launch attempt failed to build its entry and mistakenly launched Electron,
  producing a visible missing-entry dialog. That was a verification failure. Subsequent launches
  checked build success and entry files separately and installed no-dialog error handlers. An
  initial top-level-await probe stalled before provider work; a corrected guarded entry passed.
- `pnpm check` passed publication preflight, type checks, renderer harness build, 485 application
  tests with 6 skipped, all 61 engine tests, lint/format, and production build. An additional
  Codex boundary assessment test then passed with all 19 Codex adapter tests.
- Headless Chromium inspection of the production renderer harness verified `background`,
  `continuing`, and `settled`: two named tasks without Thinking/Stop, automatic Thinking/Stop,
  then finalized reply without Thinking/Stop. Screenshots were visually inspected. Component
  checks cover task failure and disappearance. These synthetic UI states are separate from
  the native provider evidence.
- `pnpm dev --entry <temporary guarded entry>` booted the actual application main process,
  preload and renderer with isolated app data. Provider choice rendered, the IPC ping passed,
  and `currentSeminar()` returned a closed snapshot through the preload API. The entry showed
  the window without activation; no desktop mouse or keyboard automation was used. A prior
  NODE_OPTIONS preload attempt failed before app startup and is not counted as acceptance.

Codex assessment is separate. Installed Codex is 0.155.1; the repository minimum is 0.144.6.
The [official App Server documentation](https://developers.openai.com/codex/app-server) and
`codex app-server generate-json-schema` for 0.155.1 confirm thread/turn boundaries and
`collabAgentToolCall` items with receiver IDs and agent states. The adapter currently maps
collaboration starts to generic tool activity and settles only its matched parent turn.
The added assessment test verifies that a completed collaboration item and child-thread
completion do not end that parent turn. No native Codex background-review run was performed;
automatic parent continuation and detached-task visibility remain unverified there. This
change neither claims provider parity nor applies Claude's event mapping to Codex.

Delivery: implemented in source with native evidence; PR #89 records CI and merge outcomes.
Release, installer publication, and installed-course updates are separate and not performed.

<a id="lb-003"></a>
## LB-003: Cold review has no visible waiting state

P1, activity-state bug or missing behavior. Source S09.

Investigation owner, 2026-09-25: task `01a0d98e-2e1d-77b3-b590-0d493b1bb779`, branch
`codex/lb-002-003-session-activity`, baseline `2b67c62`. Shares investigation with LB-002;
the shared event-lifetime cause and validation are recorded under LB-002 above. Implemented in
source; PR #89 records CI and merge outcomes. No release is claimed.

Claude announces a cold-read review, then the turn appears to end. Minutes later, Thinking
returns and work resumes. The learner suspects a background subagent; its actual execution
mode and Codex behavior remain unverified.

[ADR-041](../DECISIONS/ADR-041-learner-side-review-before-handover.md) requires a learner-side
review and permits a subagent or a cold pass. Trace the installed provider's supported task,
tool, and completion events and compare them with the normalized event contract in
[`seminar.ts`](../../src/shared/seminar.ts). Use official SDK documentation when diagnosing
this. A sentence saying a review started is not sufficient runtime state.

Done when genuine review work has an understandable active/waiting state, followed by a clear
completion, failure, or cancellation transition. Keep activity truthful across delayed results
and multiple tasks, without implying the learner should wait when no task remains. Verify
Claude natively and assess Codex separately. Preserve the review requirement in the
[`canonical protocol`](../../course-engine/template/CLAUDE.md).

<a id="lb-004"></a>
## LB-004: Recovery and session transitions take too long

P1, reliability investigation. Sources S10 and S14.

Investigation owner, 2026-09-26: task `01a0dd1a-ad92-79d1-a183-c57bcb25869d`, branch
`codex/lb-004-005-recovery`, baseline `ef2dd8a`. Measuring recovery phases and context
alongside LB-005, with read-only historical evidence and disposable reproductions.

Returning to the dashboard and immediately reopening a course asks to recover, then spends a
long time on "Finishing your previous session". In a longer course, "Tutor not available"
appeared for no understood reason, and resuming reportedly took 20 minutes. Capture the
unexpected unavailability as a failure to explain, not merely the trigger for a slow recovery.
The learner asks whether some transitions can safely take a shorter path and explicitly wants
careful investigation before removing necessary work.

Measure dashboard navigation, provider shutdown/startup, inspection scripts, previous-session
wrap, journal/progress/quiz writes, review/QA work, commit, and the opening turn separately.
Compare a no-op visit, a normal study session, interruption during generation, and provider
failure. Capture the failure reason and timing where "Tutor not available" occurs. Use
repository fixtures; an affected-course inspection, if needed later, should be read-only and
its contents kept out of committed evidence.

Start with [`conductor.ts`](../../src/main/session/conductor.ts),
[`course-session.ts`](../../src/main/course-session.ts),
[`engine-script-service.ts`](../../src/main/scripts/engine-script-service.ts), and
[ADR-009](../DECISIONS/ADR-009-recovery-first-close.md). LB-002/LB-003 can explain misleading
waiting states; LB-005 can explain some context cost. Neither relationship is established.

The first investigation is complete when timings identify the dominant stage or the exact
missing measurement, and the unexpected failure has a supported explanation or bounded
follow-up. An implementation is complete when the proposed shorter path has before/after
evidence and preserves required learning records and recovery after real interruption.
Choose a measurable latency target after obtaining the baseline. Any lifecycle rule change
needs a decision record; do not infer that unchanged files mean no learning happened.

### Investigation outcome, 2026-09-26

The [measured investigation and next experiment](recovery-investigation-2026-09-26.md)
identify the provider recovery turn as the dominant historical interval. Of 21 successful
recoveries, seven exceed seven minutes; preparation takes at most 11.706 seconds and
post-result verification at most 0.462 seconds. One detailed recovery includes QA, reviews
and dependency work. A subsequent opener can add substantial time too. These are historical
records, not current-native latency acceptance or attribution of the exact reported incident.

The proposed next task tests closing interrupted generation with its unfinished work
explicitly pending, while preserving the learning-record ritual and doctor verification.
Generic provider failures need one bounded structured-error capture. An explicit sign-in
failure is supported, but is not identified as the learner's reported incident. Status Ready
means the investigation and follow-up are ready for review, not that a latency fix exists.
No lifecycle, source, installed-course or release change was made.

### Bounded comparison outcome, 2026-09-26

Task `01a0dd2a-44c5-7001-b027-19d6d7004085`, branch `codex/lb-004-recovery-boundary`,
completed [one native baseline/candidate comparison](recovery-comparison-2026-09-26.md).
Both left generation pending without QA/review, so the fixture does not reproduce the
historical heavy recovery. Candidate verified close took 111.1 seconds; baseline produced its
result at 165.6 seconds but failed doctor verification with missing output. Stable-output
replay passed unchanged, and a disposable exit-code substitution timed out. No production
fix or protocol amendment is justified. The reported EPIPE popup may have come from the
developer probe's inherited output pipe; attribution is unconfirmed.

Status Blocked means the historical issue remains unresolved, with the finite experiment
finished. Reopen on a representative capture of actual extra QA/review or a naturally occurring
incident with stable stdout/stderr, stream/exit ordering and structured provider error evidence.
Do not repeat this fixture to chase a result. Proceed to LB-010; source, release and
existing-course application remain separate.

<a id="lb-005"></a>
## LB-005: Journal growth may waste context and recovery work

P2, investigation. Source S14. Usually investigate alongside LB-004.

Investigation owner: the LB-004 task and branch above, 2026-09-26.

The learner reports seven modules and 37 journal entries, with verbose entries potentially
added on repeated close/start or crash recovery within one module. They worry that the tutor
reads the whole journal every time and want to retain useful learning history while limiting
overhead. Module changes or review tasks are alternative explanations for the delay.

Code observed: [`journalTail`](../../src/main/scripts/parsers.ts) defaults to the latest three
entries and 16 KiB. [`engine-script-service.ts`](../../src/main/scripts/engine-script-service.ts)
calls it for the startup facts. This bounds the injected journal excerpt; it does not prove
what the agent subsequently reads, how large the rest of recovery context is, or why it waits.
The canonical protocol also allows retrieval of older detail.

Measure entry creation by transition type, injected context, recovery transcript size, and
subsequent file reads. Determine whether verbosity is required learning evidence, repeated
maintenance narration, or repeated records of the same event. Work on the
[`engine protocol`](../../course-engine/template/CLAUDE.md) for pedagogy changes; avoid a second
journaling policy inside Electron prompts.

Done when a justified change reduces measured unnecessary records or context without losing
open gaps, assisted-versus-independent evidence, quiz state, or retrieval of older learning.
If no change is justified, record the measured result and close the hypothesis explicitly.
Preserve existing learner history; pruning or migration would require its own concrete scope.

### Investigation outcome, 2026-09-26

The [shared evidence](recovery-investigation-2026-09-26.md) measures a 259,260-byte journal
with 52 entries, but at most 16,384 bytes of journal in each of 51 historical fact blocks.
Whole-journal injection is not the cause in those openers. Subsequent reads are not reliably
measurable from retained tool metadata, and entry counts do not prove redundant evidence.
The follow-up specifies read-range/byte capture and before/after learning-record deltas for
no-op, study and interrupted-generation fixtures. Preserve the existing journal. Status
Ready means a concrete experiment is prepared; no context-saving implementation is claimed.

The [bounded native comparison](recovery-comparison-2026-09-26.md) is now complete. Both variants
preserved older journal text and appended one entry, but this small fixture cannot establish
long-journal read cost or duplicate learning records. The candidate also differed in how it
recorded a repeated independent answer. No journaling-policy change, pruning or migration is
justified. Status Blocked names the remaining evidence: a representative long-course capture
of requested read ranges/returned content sizes and session-to-entry learning deltas. Preserve
history and advance the backlog rather than expanding this experiment.

<a id="lb-014"></a>
## LB-014: Windows console windows flash during tutor work

P2, bug investigation. Source S12.

Brief terminal or PowerShell windows appear, sometimes several in succession, while the tutor
works. File changes during module generation are a suspected trigger. The report is Windows
specific; the launching process and provider are not established.

Reproduce in the real Electron app with a disposable course and identify the process tree and
launch options at the flash. Distinguish app-owned scripts, provider children, and intended
editor or sign-in windows. Existing app-owned launches already use `windowsHide` in several
places, so a blanket launch-option edit would not establish the cause.

Start with [`process-runner.ts`](../../src/main/scripts/process-runner.ts),
[`utility-process-runner.ts`](../../src/main/scripts/utility-process-runner.ts), the provider
adapters, and generated QA/check commands. Done when the identified background path runs
without a visible console while preserving output, exit/error handling, and intended native
interactions. A native Windows reproduction and rerun are required evidence.

### Bounded investigation outcome, 2026-09-26

Task `01a0ddc8-a5fe-75f0-a687-f6dc3cc27551`, branch `codex/lb-014-console-flashes`,
baseline PR #98 merge `4c0258c`, completed one representative native doctor/Git observation.
The [investigation record](console-investigation-2026-09-26.md) records the launch audit,
disposable fixture, process ancestry, output and observation limits. Electron 43.4.0 ran
the production utility-process adapter and all three doctor Git queries. The observer saw
Git and console-host descendants, but no visible console window; doctor returned valid JSON,
exit 0 and empty stderr.

No production launch change or candidate rerun is justified by this result. Status Blocked
names missing incident evidence, not an external-provider diagnosis. Reopen on a captured
visible window and its parent chain during actual tutor work, identifying the provider/version
and tool stage. Do not rerun the same doctor fixture to chase a failure. Proceed to LB-009.
Source investigation, installed-app acceptance and release remain separate.
