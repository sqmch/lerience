# Context telemetry inventory

LB-009, source baseline `ccdc9da84ef5570ad3df18e08af263dd9acf21bd`. PR #99 was a docs-only
LB-014 investigation; its merged state and final Windows CI were checked before this work.
LB-004, LB-005 and LB-014 retain their recorded evidence blockers.

## Contract and interpretation

Sources inspected on 2026-09-26:

- [Claude SDK cost and usage](https://code.claude.com/docs/en/agent-sdk/cost-tracking):
  assistant input/cache fields describe individual requests, while per-message output can be
  a placeholder. Result/model totals are cumulative in streaming sessions and include work
  that does not describe the main conversation's current occupancy.
- Pinned `@anthropic-ai/claude-agent-sdk` 0.3.233, `sdk.d.ts`: `Query.getContextUsage()` and
  `SDKControlGetContextUsageResponse` expose `totalTokens`, `rawMaxTokens`, `maxTokens`,
  `model` and categories. The sibling `SDKContextUsage` documents estimated, unclamped use
  against the provider-resolved autocompact window, potentially smaller than the model's hard
  limit. Deferred tool categories are outside usage; free space and reserve are not used tokens.
  `SDKStatusMessage.status = compacting` and `SDKCompactBoundaryMessage` are explicit signals.
- [Codex App Server](https://learn.chatgpt.com/docs/app-server):
  `thread/tokenUsage/updated` reports thread usage; `contextCompaction` items announce
  compaction through their started/completed lifecycle. The old `thread/compacted` notification
  is deprecated. The installed 0.155.0-alpha.16.4 runtime's `app-server generate-ts` output
  defines `ThreadTokenUsage` as `total`, `last`, and nullable `modelContextWindow`.
  `TokenUsageBreakdown` contains total, input, cached input, cache write, output and reasoning
  output counts. Use `last.totalTokens`, never the cumulative `total` or a sum of subsets.

| Provider | Occupancy | Capacity | Uncertainty |
| --- | --- | --- | --- |
| Claude | `getContextUsage().totalTokens` | `rawMaxTokens` from the same response | Current-context estimate sampled after a foreground result; window may reflect compaction policy. |
| Codex | `tokenUsage.last.totalTokens` | `modelContextWindow` from the same notification | Latest reported context estimate, not continuous measurement; includes the latest input/output. |

The numerical capacity is exactly the provider's reported value, not an app catalogue or a
guarantee that all remaining tokens can be used. Neither readout claims exact live occupancy.
Cached input is already part of context. Account allowance stays in LB-006; accumulated billing
or session tokens never supply occupancy. Missing, malformed or nonpositive capacity hides the
readout. Valid over-window use remains unclamped. Provider-controlled compaction cannot be
precisely predicted or prevented by these samples.

## Smallest interface and lifecycle

The shared composer has a neutral `Context ~15,487 / 1,000,000 tokens` disclosure. Keyboard
users can open its source/timing and compaction explanation. It offers no invented warning
threshold, remaining-token promise or compaction control.

`context_usage` replaces a whole sample or clears it with null. The conductor includes it in
live reconnect snapshots and excludes it from transcripts. New and replacement runtimes begin
empty. Turn admission clears the previous sample. Model changes and explicit compaction clear
use and capacity together; a later valid provider sample can restore them. Session end clears
the renderer and live snapshot.

Claude's optional query follows completion without delaying the boundary or next admission.
Its five-second timeout disables further queries for that runtime. A generation check rejects
responses overtaken by a new turn, model change, compaction or shutdown. Unsupported runtime
queries hide context without failing the tutor. Codex ignores other threads and stale turns;
compaction-start suppresses reports until compaction completes, then waits for a fresh report.

## Representative native evidence

Windows x64, Electron 43.4.0 / embedded Node 24.18.1, SDK 0.3.233, installed Claude Code
2.1.282 and discovered Codex 0.155.0-alpha.16.4. No provider was upgraded.

The initial no-inference Claude inventory returned 15,487 / 1,000,000 from its default model
after initialization. An initial call made before awaiting initialization exceeded the bounded
probe; the corrected initialized query succeeded. Production queries occur after real results.

`dev/context-usage/run.ts` then exercised the production adapters and conductor using one short
reply per provider in synthetic disposable course/app-data directories:

- Claude Sonnet: `totalTokens: 43495`, `rawMaxTokens: 1000000`, model `claude-sonnet-5`.
  The normalized event and live conductor snapshot both contained 43,495 / 1,000,000.
- Codex GPT-5.5: `last.totalTokens: 29238`, `inputTokens: 29231`, `cachedInputTokens: 5504`,
  `cacheWriteInputTokens: 0`, `outputTokens: 7`, `reasoningOutputTokens: 0`,
  `modelContextWindow: 258400`. The normalized event and snapshot both contained
  29,238 / 258,400. Cached input was not added again. Course-folder/on-request access remained.

The probe checked entry build success/existence before its hidden Electron launch, retained
stdout/stderr and numeric payload captures outside Git, bounded each provider to 180 seconds
plus ten-second cleanup, closed both handles and exited successfully. It did not inspect private
courses, edit provider settings, change installed courses, force compaction, package or release.
Compaction and delayed-response ordering are deterministic contract regressions, not native
compaction acceptance. Renderer harness observations are synthetic UI evidence, not provider proof.

## Validation at source checkpoint

Adapter/parser regressions cover current versus cumulative counts, cache double-counting,
malformed/absent capacity, over-window estimates, thread/turn isolation, compaction boundaries,
and stale Claude responses after model, turn and session changes. Conductor and reducer coverage
checks live snapshot replacement and clearing on replacement/end. Rendered component coverage
checks the disclosure and absent state. Final check and CI results belong in the PR handoff.
