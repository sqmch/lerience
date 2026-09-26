# Provider information and controls

See the [register and session order](README.md) for each item's current status.
Provider contracts have not been externally verified during catalogue creation. Inspect the
current official documentation and the relevant runtime/SDK versions when taking up an item.

<a id="lb-006"></a>
## LB-006: Claude allowance warnings show misleading percentages and labels

P1, bug. Sources S02 and S11 are consolidated here.

Investigation owner: task `01a0d9c2-efab-73d3-8d60-00aa9866e30b`, branch
`codex/lb-006-claude-allowance`, starting from `5361f65` on 2026-09-25.

The yellow weekly banner said "Claude weekly overage limit", 1% used, resetting at 8:00 PM,
while the Claude app showed 77% weekly usage. A five-hour banner likewise showed 1% against
92% in Claude. The learner interprets yellow as approaching the limit, and finds both the
percentage and overage wording confusing. A persistent Thinking state co-occurred in one
report; LB-002 owns that symptom and the relationship is unproven.

Verified cause: [`claude.ts`](../../src/main/agent/claude.ts) treated fractional utilization
as a percentage. The renderer rounded 0.77 and 0.92 to 1%. The old fixture also supplied
percentages, so it did not catch the error. The weekly overage label additionally confused
a model-specific subscription bucket with usage credits.

Contract evidence, checked 2026-09-25:

- The pinned `@anthropic-ai/claude-agent-sdk` 0.3.233 `SDKRateLimitInfo` declares the six
  bucket values, three statuses, and optional utilization/reset fields. Neither its types
  nor the current [official TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript#sdkratelimitevent)
  explains the utilization units or all bucket semantics.
- The installed Windows Claude Code reports 2.1.282. Its binary SHA-256 is
  `fc0e3af017705624b9e1bce913f72761864ff994804514da1f5e41380fca4484`.
  Read-only inspection of its embedded rate-limit schema confirms that utilization is a
  fraction, can exceed 1, and uses Unix seconds for resets. Its native warning formatter
  multiplies the fraction by 100. The schema describes the top-level fields as the currently
  limiting window, and `seven_day_overage_included` as a model-specific weekly window.
  Its native labels distinguish that bucket from `overage`, the usage credit limit.
- The [official status-line reference](https://code.claude.com/docs/en/statusline#available-data)
  separately defines `used_percentage` as 0..100. That is a different field, not the SDK
  event's utilization unit. No status-line values or token counts are used by this fix.

The adapter converts fractions to percent, preserves values above 100%, and labels the
model-specific weekly bucket without guessing a model name absent from the pinned event.
Usage credits remain distinct. Unknown buckets use a generic label; missing or invalid
numbers stay absent; unknown statuses are ignored rather than invented rejections. Healthy
provider events clear the prior warning. The notice names warning/rejected state even when a
percentage exists, and includes the local reset date as well as time. It never substitutes
`surpassedThreshold`, an overage reset, or a different bucket's utilization.

Adapter/state fixtures and rendered-component tests cover all six pinned buckets, fractional
and above-cap values, warning/rejected/healthy transitions, unknown payloads, missing fields,
invalid reset timestamps, date display, and separation from foreground completion. No preserved native warning payload was available in
the earlier activity probes, which logged only the event type. No model turns will be spent
to manufacture a warning. The learner's original 77%/92% comparisons lack paired timestamps
and exact bucket identities; these are useful regression values, not proof that the weekly
model-specific and all-model buckets were equivalent.

Delivery: implemented in source; [PR #90](https://github.com/sqmch/lerience/pull/90) records
full source checks, native application smoke, CI and merge outcomes. Native warning acceptance,
installed-app update, and release remain separate. No provider, engine, model, effort, context,
or session admission changes are included.

Done when fixtures derived from the documented contract produce accurate percentages, window
names, warning state, and reset times, including unknown/missing data. Show a true overage
bucket distinctly if the provider actually reports one. Verify with a native Claude warning
when available; record separately if only adapter fixtures have been tested. Begin with
[`claude-agent.test.ts`](../../tests/claude-agent.test.ts) and the warning display in
[`parts.tsx`](../../src/renderer/src/seminar/parts.tsx).

<a id="lb-007"></a>
## LB-007: Verify effort options for each provider and model

P2, compatibility investigation. Source S06.

Investigation owner: task `01a0dd91-e6a7-7be1-9cf4-8b112d001ca4`, branch
`codex/lb-007-effort-options`, starting from `406c399` on 2026-09-26.

The learner sees low, medium, high, very high, max for Claude, but reports high, extra, max in
the Claude app. They suspect generic or OpenAI labels and ask for API-documentation checking
for both providers. Matching another app's label alone does not establish the wire value or
the capability of a particular installed model.

Verified on 2026-09-26: Claude's five wire values are valid. The installed client's
`supportedModels()` advertises `low`, `medium`, `high`, `xhigh`, `max` for its current Opus
and Sonnet rows; the 4.6 rows omit `xhigh`, and Haiku offers no effort control. Matching the
Claude app's shorter label is not evidence of a different wire value. Lerience now displays
`xhigh` as "Extra high effort" and preserves the provider's option order.

The investigation did confirm related compatibility defects:

- Both adapters and saved choices used a fixed five-value list. Codex 0.155.1 offers `ultra`
  on some models, but the app discarded it. Effort IDs now remain provider-owned strings,
  with model-specific validation before applying or staging a change. Familiar IDs have
  readable labels; a future offered ID remains visible without an invented mapping.
- Claude acknowledged an invalid `effortLevel` without throwing. The adapter now validates
  against the offered model before mutations. A model switch previously cleared an
  incompatible effort only in local state. It now clears the actual flag-layer override
  with `applyFlagSettings({ effortLevel: null })`.
- Codex `turn/start` with `effort: null` retained the previous override. A switch now sends
  the target model's advertised `defaultReasoningEffort` explicitly. If discovery supplies
  no supported default, the change is refused locally. Resetting the model similarly names
  the provider-confirmed startup model. Choices stay pending until `turn/start` accepts them;
  a rejected start preserves current and pending controls.
- A model switch forgets a saved effort when the adapter resolves to a different value, so
  reopening cannot restore the newly incompatible pair. Claude's separate control calls can
  partially succeed; after rejection the renderer re-reads confirmed values and avoids
  claiming every previous setting is still active.

Contract sources, checked 2026-09-26:

- [Claude Code model configuration](https://code.claude.com/docs/en/model-config#adjust-effort-level)
  and [Claude effort](https://platform.claude.com/docs/en/build-with-claude/effort) distinguish
  model effort from the separate `ultracode` workflow setting. No workflow setting is added
  to Claude's effort choices. The exact pinned Agent SDK 0.3.233 `ModelInfo`, `EffortLevel`,
  and `Query.applyFlagSettings` declarations confirm the capability fields and session-only
  `max`/null override contract. The hosted TypeScript reference was unavailable during this
  check; installed declarations and native control calls were inspected instead.
- [Codex App Server](https://developers.openai.com/codex/app-server#models) requires discovery
  through `model/list`; its values depend on client and account. The schema generated by
  installed Codex 0.155.1 defines `ReasoningEffort` as a non-empty advertised string.
  `supportedReasoningEfforts`, `defaultReasoningEffort`, and `turn/start.effort` are the
  fields used here. No model catalogue or model-to-effort table is compiled into the app.

Validation and limits:

- Regressions failed on the original filter, Claude validation/reset, and renderer labels,
  then passed after correction. Adapter, conductor, and rendered-control tests cover
  unfamiliar offered IDs, unsupported pairs, reset payloads, refused updates, current versus
  pending state, partial acceptance, and saved-choice cleanup.
- Native Windows probe used Electron 43.4.0, SDK 0.3.233, Claude Code 2.1.282 and Codex 0.155.1.
  Capability discovery required no model turns. Claude accepted a session `xhigh` override
  and null reset; an invalid raw flag was also acknowledged, proving the need for adapter
  validation. A finite raw Codex probe proved null retention through two failed requests;
  it did not generate a successful model response.
- The corrected production adapters each completed one short native reply in a synthetic
  disposable course. Claude traversed Sonnet/xhigh, Haiku, then Sonnet/default; its Stop hook
  reported `high`. Codex exposed and staged `ultra`, refused an unoffered ID locally, then
  switched to the narrower GPT-5.5 row, staged its advertised `medium`, sent that exact wire
  value, and completed with current `medium` and no pending patch. No ultra inference or
  broad model/effort matrix was run.
- The probe verified entry compilation before Electron launch, isolated app-data and course
  paths under `%TEMP%`, persisted stdout/stderr, and used a 180-second deadline with bounded
  cleanup. No private course, provider settings, installed app, or release was changed.
  These are adapter/control observations, not a provider-wide guarantee under managed policy.
  Claude has no typed effort readback in this control response; the representative Stop hook
  supplies separate effective-effort evidence.

Source fix in [PR #97](https://github.com/sqmch/lerience/pull/97), branch
`codex/lb-007-effort-options`. `pnpm check` passed on Windows x64 with Node 24.18.0 and
pnpm 11.9.0: 560 application tests and 61 Course Engine tests passed, six platform tests
skipped. A separate `pnpm dev` run verified native startup and preload with disposable
app-data; it did not exercise an interactive picker. The PR records final-head CI.
Merged in PR #97 at `4b0e5b0c7fe34fd38e511c88313e270774be10a1` after clear reviews and
green final-head Windows CI. Release and installed-app acceptance remain separate.

Done when each model offers supported values with faithful display names, switching models
handles an invalid prior effort, and accepted/rejected updates leave truthful current and
pending state. Add adapter/control coverage and a native check where supported. Start with
[`claude.ts`](../../src/main/agent/claude.ts), [`codex.ts`](../../src/main/agent/codex.ts),
[`seminar.ts`](../../src/shared/seminar.ts), and
[`parts.tsx`](../../src/renderer/src/seminar/parts.tsx).

<a id="lb-008"></a>
## LB-008: Select the model before the opening turn

P2, requested feature. Source S08.

Owner: task `01a0ddab-f53b-7cf2-9016-19906d6b3f7b`, branch
`codex/lb-008-model-before-opener`. Baseline: PR #97 merge `4b0e5b0`.

Implementation, 2026-09-26:

- Both new-course onboarding and reopened courses prepare the provider runtime and show the
  same model choice before sending any tutor input. The learner keeps the shown model,
  selects a supported model, or chooses **Use provider default**, then **Start tutor**.
  Existing effort, autonomy and access labels remain visible and use their existing controls.
- The conductor holds the opener, validates the confirmation against that runtime, and
  refuses other send paths while waiting. Cancellation closes an unused new transcript;
  cancellation of recovery preserves the prior unverified transcript byte for byte.
- Per-course/provider memory restores before this choice. A refused saved model requires a
  new choice or explicit default reset. Current and staged values stay distinct. Recovery's
  follow-on runtime continues with the confirmed choice when still supported; a changed
  provider, removed model, or refused restore pauses before fallback work.
- [ADR-040](../DECISIONS/ADR-040-remembered-session-controls.md), SPEC and DESIGN record the
  deliberate first-turn boundary. Provider configuration and course access policy are unchanged.

Validation:

- Conductor regressions cover both entry paths, send/retry/end bypass attempts, duplicate and
  stale confirmation, cancellation during async model validation, recovery transcript preservation,
  current versus pending state, default reset, remembered choices and recovery replacement under
  unchanged, removed-model and switched-provider conditions. The rendered hook/component test
  covers default reset, the closed send path and explicit confirmation.
- Actual production renderer components were inspected in the browser harness for onboarding
  and recovery at desktop width, including the model menu, staged label, default reset and
  first reply after confirmation. The harness uses synthetic state and does not prove providers.
- `dev/model-choice/run.ts` exercised the production conductor and adapters in disposable
  Windows fixtures, with Electron 43.4.0 / Node 24.18.1, SDK 0.3.233, Claude Code 2.1.282,
  and discovered Codex 0.155.0-alpha.16.4. Claude used Sonnet. Codex staged GPT-5.5 while
  current remained GPT-6 Astra, sent `model: gpt-5.5` on its first `turn/start`, and confirmed
  GPT-5.5 after the reply. Each provider received zero inputs before confirmation and exactly
  one after, producing `MODEL_CHOICE_OK`. Codex retained Course folder/on-request access.
- The native entry build and file existence were checked before launch. App-data and courses
  lived under `%TEMP%`; stdout/stderr and normalized capture were retained outside Git.
  Each provider had a 180-second work deadline and ten-second cleanup budget. The native
  process exited after both checks. These are representative source-runtime checks, not
  a broad model matrix, native recovery exercise, packaged acceptance, or a release.

Source ready in [PR #98](https://github.com/sqmch/lerience/pull/98), implementation `672d3be`
and reviewed correction `c9a4db9`. Standards and Spec re-reviews cleared both corrections:
accepted opener save failure retires the runtime before buffered events can seal recovery;
replacement controls must match the prepared runtime before Start becomes available.

The single local `pnpm check` passed publication hygiene, typechecks, harness checks,
571 application tests and 61 Course Engine tests, with six platform skips. It stopped at
formatting while review corrections were being edited. After correction, all 52 affected tests,
both TypeScript projects, complete lint/format checks and the production build passed.
An isolated `pnpm dev` startup also passed its IPC round-trip and exposed both prepare/confirm
preload methods, then exited. The PR records full final-head Windows CI. Merge, installed-app
acceptance and release remain separate; the orchestration task owns merge.

Original request and discovery:

The dashboard offers a provider choice, but entering a course starts work automatically before
the learner can choose a model. Provide an explicit choice before that first work, including
the first session where no model has yet been remembered.

[ADR-040](../DECISIONS/ADR-040-remembered-session-controls.md) already restores explicit choices
per course and provider before the opener. Reuse that ownership and provider-confirmation
model. Investigate when model discovery is available without sending an opening turn. Decide
the smallest suitable point of use for new courses, reopening, and recovery; identify any
bootstrap limitations rather than displaying an invented model list.

LB-007 discovery, 2026-09-26: installed Claude 2.1.282 through SDK 0.3.233 returns
`supportedModels()` before the first input, and Codex 0.155.1 returns `model/list` before
`turn/start`. Both were verified without a model turn. This makes capability discovery
available for a pre-opener choice; picker placement and first-turn lifecycle remain LB-008.

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
