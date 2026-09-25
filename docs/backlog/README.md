# Learner backlog

Intake: 2026-09-25. Source baseline inspected: `0023ff9`, app 0.0.14, Course Engine 0.2.0.
Reported versions are less precise: the notes describe use after 0.0.14, but do not establish
the exact app, installed provider, or course-engine version for every incident.

This is the working catalogue for the [intake notes](intake-2026-09-25.md). The original 16
bullets and one follow-up are accounted for below in 16 work items. Repeated symptoms are
consolidated, while potentially related failures retain separate acceptance criteria. The initial
catalogue did not reproduce or fix reported bugs. Subsequent investigation evidence is recorded
under each item; initial code observations identify starting points, not causes.
LB-016 also includes a read-only course inspection on 2026-09-25, against app source `704e358`.

## Pick the next session

LB-001 has a source fix and disposable regression evidence in [PR #88](https://github.com/sqmch/lerience/pull/88).
An app release and explicit existing-course update remain separate. The
session states in **LB-002 and LB-003** have a shared source fix implemented in
[PR #89](https://github.com/sqmch/lerience/pull/89), with native Claude and renderer evidence below. Small interface fixes can proceed
independently; they do not need to wait for the recovery investigation.

| Order | Session scope | Deliverable and stopping point |
| --- | --- | --- |
| 1 | LB-001, QA cleanup | Source fix and regression in PR #88. Release and existing-course update remain separate. |
| 2 | LB-002 + LB-003, Claude activity | Implemented in source. PR #89 records CI and merge; native Claude and renderer evidence is recorded. Release remains separate. |
| 3 | LB-006, usage warnings | Verify provider units and limit categories, then correct mapping and copy with fixture evidence. |
| 4 | LB-004 + LB-005, recovery and journal | Measure where recovery time and context go. End the first session with a supported cause or a bounded follow-up, before changing lifecycle rules. |
| 5 | LB-010, duplicate labs | Establish lab identity and fix repeated choices without merging distinct module configurations. |
| 6 | LB-011, streaming scroll | Make a small upward scroll release auto-follow and verify reattachment at the bottom. |
| 7 | LB-012, then LB-013, compact UI | Two independent small fixes. Keep each change separately reviewable; LB-013 also updates the remembered-label decision. |
| 8 | LB-007, then LB-008, tutor controls | Verify effort capabilities, then provide an explicit model choice before the opening turn. These can be separate sessions. |
| 9 | LB-014, Windows window flashes | Identify the process that opens a console, then fix that launch path if unintended. |
| 10 | LB-009, context visibility | Establish available context telemetry and implement an honest readout. Can move earlier if it helps LB-004. |
| 11 | LB-016, in-app assessment | Define how learners answer non-code exercises, compare standard and tutor-authored interactions, and select one bounded prototype. |
| 12 | LB-015, interactive reading | Choose or reject a small learner-useful experiment. Discovery does not commit to building every idea. |

These are work packages, not estimates or a promise to finish each package in one sitting.

## Register

Priority is provisional. P1 means investigate first because work or trustworthy session state
may be affected. P2 means normal bug or usability work. P3 means product discovery.
The register owns status. "Reported" is learner evidence, "code observed" is a static observation,
and "discovery" needs a product or provider-contract decision before implementation.

| ID | Item | Kind | Priority | Evidence | Intake | Status |
| --- | --- | --- | --- | --- | --- | --- |
| [LB-001](reliability.md#lb-001) | QA may delete real scaffold dependencies | Bug | P1 | Reproduced under Windows Electron; regression passes | S16 | Implemented |
| [LB-002](reliability.md#lb-002) | Claude stays Thinking after apparent completion | Bug | P1 | Reproduced; source regression and native Claude pass | S02, S07 | Implemented |
| [LB-003](reliability.md#lb-003) | Cold review appears idle while work continues | Bug / missing activity state | P1 | Native background sequence; renderer states verified | S09 | Implemented |
| [LB-004](reliability.md#lb-004) | Slow recovery, including after Tutor not available | Reliability investigation | P1 | Reported | S10, S14 | Open |
| [LB-005](reliability.md#lb-005) | Journal growth and repeated recovery overhead | Investigation | P2 | Reported; opener bound observed | S14 | Open |
| [LB-006](providers.md#lb-006) | Claude percentage and overage labels mislead | Bug | P1 | Contract and mapping investigation | S02, S11 | Investigating |
| [LB-007](providers.md#lb-007) | Effort choices need provider-specific verification | Compatibility investigation | P2 | Reported; filtering observed | S06 | Open |
| [LB-008](providers.md#lb-008) | Choose a model before the first session work | Feature | P2 | Requested | S08 | Open |
| [LB-009](providers.md#lb-009) | Show context use and capacity | Feature | P2 | Requested; telemetry discovery needed | S13 | Open |
| [LB-010](experience.md#lb-010) | Lab dropdown repeats entries | Bug | P2 | Reported | S01 | Open |
| [LB-011](experience.md#lb-011) | Streaming chat pulls the reader back down | Bug / behavior change | P2 | Reported; follow threshold observed | S05 | Open |
| [LB-012](experience.md#lb-012) | Build elapsed time wraps vertically | Bug | P2 | Reported | S03 | Open |
| [LB-013](experience.md#lb-013) | Remove the remembered suffix from controls | UX change | P2 | Requested; suffix observed | S04 | Open |
| [LB-014](reliability.md#lb-014) | Brief console windows during tutor work | Bug investigation | P2 | Reported on Windows | S12 | Open |
| [LB-015](experience.md#lb-015) | Interactive lesson reading | Product discovery | P3 | Ideas, not committed scope | S15 | Open |
| [LB-016](assessment.md#lb-016) | Answer non-code exercises in the app | Product / assessment discovery | P2 | Requested; 13-module course inspected | S17 | Open |

## Source coverage

S01-S16 follow the original bullet order, including the quoted tutor diagnosis. S17 is the
follow-up about answer files. The source archive preserves wording and uncertainty, with its
stated path redaction; read only the relevant report when starting an item.

| Source | Captured concern | Work item |
| --- | --- | --- |
| S01 | Lab duplicates after the 0.0.14 dropdown fix | LB-010 |
| S02 | Weekly 77% versus 1%, overage wording, and 207-minute Thinking state | LB-006, LB-002 |
| S03 | A duration such as 5m 33s wraps | LB-012 |
| S04 | Remembered suffix widens and wraps controls | LB-013 |
| S05 | Release streaming auto-follow on a small upward scroll | LB-011 |
| S06 | Claude effort labels differ from the Claude app | LB-007 |
| S07 | Repeated indefinite Thinking after module generation | LB-002 |
| S08 | Model selection before automatic opening work | LB-008 |
| S09 | Cold-read review looks finished before it resumes | LB-003 |
| S10 | Back to dashboard and straight back triggers slow recovery | LB-004 |
| S11 | Five-hour 92% versus 1% | LB-006 |
| S12 | Momentary Windows terminal or PowerShell windows | LB-014 |
| S13 | Used context versus maximum to anticipate compaction | LB-009 |
| S14 | Seven modules, 37 journal entries, 20-minute recovery after unavailability | LB-004, LB-005 |
| S15 | Highlights, selection-to-tutor, editing, comments, folding, learning value | LB-015 |
| S16 | Repeated dependency deletion and tutor's claimed junction diagnosis | LB-001 |
| S17 | Repeated answers.json editing, in-app questions, and tutor-authored assessment | LB-016 |

## Continue in another session

Use a request such as:

> Work on the next open item from docs/backlog/README.md. Reproduce it safely, fix it if confirmed,
> run the relevant checks, and update the item with evidence and remaining limits.

At pickup, read repository guidance, refresh the branch and relevant PR state, and read the
chosen item plus its source reports. Record an owner or task/branch reference and change its
status to investigating. Keep diagnosis separate from assumptions. For provider-contract work,
consult current official documentation and the exact installed or pinned SDK/runtime version.

At handoff, update the item with the cause or unresolved question, validation performed, and
commit/PR link. Use statuses open, investigating, ready, in progress, blocked, implemented,
or closed. A blocked item names the missing evidence and exact next action. Implementation and
release are separate: record source validation, native acceptance, merge, and shipped version
only when each is verified. Link follow-up work instead of silently widening a session.

Keep IDs stable. Append new IDs for new reports, cross-link duplicates, and retain closure
evidence. This catalogue does not replace SPEC or accepted ADRs; update those when a chosen
implementation changes a durable product rule.
