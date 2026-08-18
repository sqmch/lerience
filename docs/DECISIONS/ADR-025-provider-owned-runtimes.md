# ADR-025 - Provider-owned tutor runtimes; Electron-reused JavaScript tooling

Date: 2026-08-15 - Status: accepted

Supersedes ADR-022's ownership of standalone Node, Claude, and Codex payloads. Amends ADR-021's
2026-08-14 Claude release block to the monitored posture below.

## Decision

Lerience packages what defines the learning product: the desktop application, internal Course
Engine, npm/course tooling, and an app-owned Git capability. It does **not** package, download, or
update Claude Code, Codex, or a separate Node.js distribution.

Claude Code and Codex are provider-owned installations. One deep discovery module locates their
official native clients through well-known installation paths and the inherited `PATH`, without
reading credentials or invoking a shell. The provider adapters receive those exact paths. Missing
providers remain first-class readiness states with official install guidance; Lerience's no-terminal
promise begins once a supported provider is installed and authenticated. Provider install, auth,
and updates remain vendor-owned.

The Claude Agent SDK remains an integration library because its event and approval interface is
the implemented Claude adapter. Its optional native CLI packages are explicitly excluded from
dependency installation and packaging, and Lerience always supplies the discovered executable path
so the SDK cannot silently fall back to a bundled binary. Codex App Server is launched from the
discovered Codex installation over local stdio.

Electron already contains a compatible Node runtime. Lerience uses `utilityProcess` for its own
engine scripts and ships small `node`/`npm` command shims that explicitly re-run the installed
Electron executable with `ELECTRON_RUN_AS_NODE=1` for provider shell work. The variable is scoped by
the shim; provider processes are not launched in Electron-as-Node mode. No second Node binary is
carried.

Provider compatibility is an app concern, not an ownership claim. M5 must probe version and real
capabilities, fail with actionable provider-specific guidance, and test every supported provider
bump. It must not mutate, pin, or replace the learner's provider installation.

## Claude release posture

Anthropic's published material is currently inconsistent for this exact product shape: its legal
and Agent SDK pages restrict third-party Claude.ai login, while its June 2026 support update says
Agent SDK, `claude -p`, and third-party app usage continue to draw from subscriptions. Lerience uses
the real Claude Code harness through the official Agent SDK and leaves install/auth/config to the
official client. The maintainer therefore keeps Claude enabled and treats policy as a monitored
release risk, not a current blocker. Re-review is mandatory before public promotion and after a
material Anthropic policy or enforcement change.

## Why

The first app-owned runtime measured 937,658,106 bytes before Electron or app assets. Claude and
Codex accounted for roughly 669 MiB and standalone Node for another 101 MiB. That architecture
contradicted the product bet: target learners already use at least one provider subscription/client,
and provider applications are the canonical owners of their binaries, auth, configuration, and
update cadence.

Keeping the Course Engine and local Git capability app-owned preserves reliable course creation,
plain-file ownership, and session history without turning provider installation into Lerience's
supply-chain and release problem. The remaining full Dugite payload is accepted as the safe M5.1
baseline, but its unused remote/auth/LFS surface is a measured size-optimization target before the
first artifact.

## Rejected

- Bundling both provider runtimes for a zero-prerequisite but roughly 1.2 GiB installed app.
- Downloading provider binaries during first launch.
- Falling back silently to the Agent SDK's optional Claude binary.
- Requiring a separate Node installation when Electron already embeds Node.
- Requiring host Git immediately; Lerience's course lifecycle depends on Git even when a provider
  installation does not supply it.

## Reopens if

A provider removes a stable local integration surface, external CLI drift cannot be bounded with
capability checks, Electron removes the supported Node execution mode, or an app-owned Git payload
cannot meet the final size/licensing acceptance budget.
