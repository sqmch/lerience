# Provider information and controls

See the [register and session order](README.md) for each item's current status.
Provider contracts have not been externally verified during catalogue creation. Inspect the
current official documentation and the relevant runtime/SDK versions when taking up an item.

<a id="lb-006"></a>
## LB-006: Claude allowance warnings show misleading percentages and labels

P1, bug. Sources S02 and S11 are consolidated here.

The yellow weekly banner said "Claude weekly overage limit", 1% used, resetting at 8:00 PM,
while the Claude app showed 77% weekly usage. A five-hour banner likewise showed 1% against
92% in Claude. The learner interprets yellow as approaching the limit, and finds both the
percentage and overage wording confusing. A persistent Thinking state co-occurred in one
report; LB-002 owns that symptom and the relationship is unproven.

Code observed: [`claude.ts`](../../src/main/agent/claude.ts) clamps `info.utilization` directly
to 0..100 and maps `seven_day_overage_included` to "Claude weekly overage limit". Investigate
the units and semantics of the exact provider payload before changing arithmetic or labels.
The provider app comparison must use the same time and allowance bucket.

Done when fixtures derived from the documented contract produce accurate percentages, window
names, warning state, and reset times, including unknown/missing data. Show a true overage
bucket distinctly if the provider actually reports one. Verify with a native Claude warning
when available; record separately if only adapter fixtures have been tested. Begin with
[`claude-agent.test.ts`](../../tests/claude-agent.test.ts) and the warning display in
[`parts.tsx`](../../src/renderer/src/seminar/parts.tsx).

<a id="lb-007"></a>
## LB-007: Verify effort options for each provider and model

P2, compatibility investigation. Source S06.

The learner sees low, medium, high, very high, max for Claude, but reports high, extra, max in
the Claude app. They suspect generic or OpenAI labels and ask for API-documentation checking
for both providers. Matching another app's label alone does not establish the wire value or
the capability of a particular installed model.

Code observed: Claude's `knownEfforts` intersects offered model capabilities with an app list
containing `low`, `medium`, `high`, `xhigh`, `max`. Trace that filtering, shared types, labels,
and mutation payloads against current official Claude and Codex contracts. Check the pinned
SDK and installed provider separately, including model-specific and default choices.

Done when each model offers supported values with faithful display names, switching models
handles an invalid prior effort, and accepted/rejected updates leave truthful current and
pending state. Add adapter/control coverage and a native check where supported. Start with
[`claude.ts`](../../src/main/agent/claude.ts), [`codex.ts`](../../src/main/agent/codex.ts),
[`seminar.ts`](../../src/shared/seminar.ts), and
[`parts.tsx`](../../src/renderer/src/seminar/parts.tsx).

<a id="lb-008"></a>
## LB-008: Select the model before the opening turn

P2, requested feature. Source S08.

The dashboard offers a provider choice, but entering a course starts work automatically before
the learner can choose a model. Provide an explicit choice before that first work, including
the first session where no model has yet been remembered.

[ADR-040](../DECISIONS/ADR-040-remembered-session-controls.md) already restores explicit choices
per course and provider before the opener. Reuse that ownership and provider-confirmation
model. Investigate when model discovery is available without sending an opening turn. Decide
the smallest suitable point of use for new courses, reopening, and recovery; identify any
bootstrap limitations rather than displaying an invented model list.

Done when the learner can select or retain the provider default before tutor work begins,
and the first real turn uses the supported choice. Cover remembered choices, provider switches,
rejected or removed models, and recovery runtime replacement. Keep scope per course/provider
unless a separate decision justifies an app-wide default. Verify the actual first-turn
behavior in native Claude and Codex runs, not only the picker rendering.

Start with [`conductor.ts`](../../src/main/session/conductor.ts),
[`course-view.tsx`](../../src/renderer/src/course/course-view.tsx), and
[`onboarding-surface.tsx`](../../src/renderer/src/onboarding/onboarding-surface.tsx).

<a id="lb-009"></a>
## LB-009: Show usable context information

P2, requested feature with telemetry discovery. Source S13.

The learner wants to see used tokens versus the session maximum to decide when to start a new
session and avoid compaction. First distinguish current context occupancy from cumulative
session token usage and account allowance. Only context occupancy against a known capacity
answers how close the current conversation is to filling its window.

Inventory the supported telemetry for each provider, including context capacity, cache-related
counts, and any explicit compaction events. Record which values are exact, estimates, or
unavailable. Decide placement and refresh behavior after that inventory. LB-006 owns account
limits; its warning percentage must not double as a context gauge.

Done when available context use/capacity is displayed with honest units and uncertainty,
updates across turns, model changes, compaction and new sessions, and remains absent or
explicitly unavailable when the provider cannot support it. Cumulative tokens may be useful
separately, but must not masquerade as window occupancy. State any limits on predicting or
avoiding provider-controlled compaction. Reuse the provider adapters and shared session event
contract; native evidence should name which providers actually supplied the values.
