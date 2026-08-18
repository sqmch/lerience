# Provider release readiness

Reviewed: 2026-08-18

This records the public provider-policy and installed-client evidence used by M5. It is a release
risk register, not a legal opinion and not a substitute for a real packaged-provider acceptance run.
ADR-025 owns the distribution split: Lerience does not redistribute either provider binary.

## Codex - enabled; experimental compatibility and publication review

OpenAI's Codex App Server documentation describes App Server as the interface for deep integration
inside a developer's own product. The same interface documents Codex-managed ChatGPT login,
account/plan facts, rate-limit reads and updates, and client identity. Lerience discovers the
learner's installed Codex client, launches its App Server over local stdio, and never receives or
persists the provider token.

Sources:

- <https://learn.chatgpt.com/docs/app-server.md>
- <https://learn.chatgpt.com/docs/auth.md>
- <https://github.com/openai/codex/tree/main/codex-rs/app-server>
- <https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan>

App Server remains experimental. Every supported Codex bump requires protocol tests plus a real
installed-client pass for login, session, controls, usage, expiry, interruption, and recovery.
`clientInfo` must identify Lerience accurately. Missing or incompatible installations must produce
official install/update guidance, not a raw process or protocol error.

## Claude - private development enabled; public release blocked

Lerience uses the official Claude Agent SDK as the Claude Code harness library and always points it
at the learner's provider-owned Claude Code executable. It does not redistribute Claude, replace
the learner's config home, copy credentials, or implement a sampling loop around a raw model API.

Anthropic's current controlling guidance is explicit for third-party products:

- Developers building products with the Agent SDK should use API-key or supported cloud-provider
  authentication.
- Third-party developers may not offer Claude.ai login or route Free, Pro, or Max credentials for
  their users without prior approval.
- The TypeScript Agent SDK is governed by Anthropic's commercial terms rather than a standard
  open-source license.

Sources:

- <https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use>
- <https://code.claude.com/docs/en/agent-sdk/overview>
- <https://github.com/anthropics/claude-agent-sdk-typescript#license-and-terms>

### T3 Code comparison

T3 Code was inspected as a current open-source implementation precedent on 2026-08-18. Its install
guide requires the user to install and authenticate Claude Code separately. Its MIT-licensed server
depends on `@anthropic-ai/claude-agent-sdk`; the Claude adapter calls the SDK's `query()` with an
explicit `pathToClaudeCodeExecutable`, and its provider probe reads account/subscription metadata
from the SDK initialization result. That is materially similar to this repository's provider-owned
CLI plus SDK-harness shape.

Sources:

- <https://github.com/pingdotgg/t3code/blob/main/docs/user/install.md>
- <https://github.com/pingdotgg/t3code/blob/main/apps/server/package.json>
- <https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/ClaudeAdapter.ts>
- <https://github.com/pingdotgg/t3code/blob/main/LICENSE>

This comparison confirms technical feasibility, not authorization. T3 Code's publication does not
amend Anthropic's terms for another developer, and the controlling documentation does not state an
exception for free or non-commercial products. The public-release choices below therefore remain.

The earlier monitored-ambiguity posture is no longer sufficient for public promotion. The adapter
may remain enabled in private development and non-distributed evidence builds, but a public artifact
must do one of the following: obtain written Anthropic approval for this exact provider-owned client
shape, move Claude to a compliant user-supplied API/cloud authentication architecture, or exclude
Claude and its Agent SDK from that artifact. The provider-neutral product and Codex path remain
independent of this decision.

## Release rule

A provider is enabled in a public artifact only when all of these are true:

1. current primary-source policy has been reviewed and any ambiguity is recorded explicitly;
2. Lerience discovers and invokes the provider-owned native client without copying credentials;
3. a supported version/capability contract exists and fails with actionable install/update guidance;
4. the exact packaged Lerience artifact passes the provider's native-target acceptance matrix; and
5. the provider's own binary is absent from Lerience's package inventory.

## Implemented compatibility contract

The main-process seam discovers an absolute provider-owned executable without a shell, including
well-known Windows locations and inherited `PATH` entries containing spaces. It runs a bounded
`--version` probe before auth or session work and exposes only a parsed semantic version.

| Provider    | Accepted by this build              | Older              | Newer/changed   |
| ----------- | ----------------------------------- | ------------------ | --------------- |
| Claude Code | `>=2.1.223 <3.0.0`                  | update Claude Code | update Lerience |
| Codex       | exact `0.144.6` App Server contract | update Codex       | update Lerience |

The learner-facing states are `ready`, `not installed`, `provider update required`, `Lerience update
required`, and `temporarily unavailable`. Missing/old providers link only to the official Claude
installation page or official Codex CLI page. The learner's selected provider is retained while
opening guidance or checking again. No state exposes process stderr, executable paths, raw protocol
frames, credentials, or a provider-specific settings surface.

On the 2026-08-15 source machine, provider-owned Claude Code `2.1.223` and Codex `0.144.6` matched
the supported version contract. This version check is not a substitute for the exact packaged
clean-machine login/session matrix.
