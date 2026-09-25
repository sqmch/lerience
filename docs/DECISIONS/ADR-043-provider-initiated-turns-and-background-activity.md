# ADR-043 - Foreground turns and background tasks have separate lifetimes

Date: 2026-09-25. Status: accepted. Amends SPEC section 7 and DESIGN.md.

## Decision

The agent seam reports a provider-initiated foreground turn with `turn_started`.
Claude can start one after a background task returns without an app `send()`. A root
`message_start`, or a complete root assistant frame when partial messages are absent,
establishes that turn. Its result completes it through the existing `turn_complete`
path. Child messages, task notifications, model prose, and elapsed time do not start
or complete a foreground turn.

Background activity is separate. The seam carries the provider's full live task list
with replace semantics and a separate task outcome. Claude SDK 0.3.233 exposes these
as `background_tasks_changed` and `task_notification`. Task-start/progress edges are
not paired to invent membership; their ordering against the full list is unspecified.

The renderer shows the number and descriptions of running background tasks, and the
latest completed, failed, or stopped task outcome. It does not label arbitrary tasks
as reviews. A foreground result clears Thinking and its timer even when tasks remain.
The foreground turn still owns busy, Stop, and the existing steer-or-queue behavior.
The learner can send during background-only activity. This does not promise that a
task's completion means the tutor has finished interpreting its result.

The conductor keeps task state in the live runtime and includes it in reconnect
snapshots. It is not learning evidence, so it does not enter the durable transcript
or revive after process death. Existing transcript turn boundaries remain unchanged.
The canonical learner-side review requirement remains unchanged.

## Evidence and scope

Windows native Claude Code 2.1.282 emitted a foreground result, background review
completion, a fresh root message, and another result on one streaming-input query.
The old adapter forwarded the resumed text but suppressed its completion because
`turnInFlight` was false. That sequence explains both LB-002 and LB-003.

The fix maps only verified Claude signals. Codex has thread/turn identifiers and
collaboration items with a different contract. Its assessment and the precise native
and renderer evidence are in [the reliability backlog](../backlog/reliability.md#lb-002).
No timer, prose matching, provider upgrade, or course-engine update implements this rule.
