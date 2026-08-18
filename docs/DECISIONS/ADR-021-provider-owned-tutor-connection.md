# ADR-021 — Provider-owned tutor connection

Date: 2026-08-14 · Status: accepted; Claude release posture amended by ADR-025

## Decision

Lerience may detect the learner's canonical Claude Code and Codex authentication state and, on
an explicit learner action, launch the provider's own sign-in ceremony. The provider owns the
browser page, credentials, token storage, refresh, and account lifecycle. Lerience owns only the
calm product flow around that ceremony: provider choice, waiting, completion, cancellation, and
an actionable retry.

This is a narrow amendment to ADR-004's original “never performs authentication” wording. The
security invariant was that Lerience must never own or manipulate authentication, not that a
non-terminal product must send a learner elsewhere to begin it. Calling a vendor-supported
login command or App Server method is allowed; accepting a password, token, API key, auth file,
or raw provider payload is not.

The app adds a provider registry around the existing `TutorAgent` seam. Provider selection is
an app-wide preference used only when a fresh runtime starts. One provider serves one runtime;
selection cannot replace a live session. Course, transcript, pedagogy, recovery, and renderer
logic remain provider-neutral.

## Authentication boundary

- Readiness probes use provider-owned status interfaces and return only safe display facts.
- Existing valid authentication is reused. Login never runs as an automatic repair.
- Claude login uses Claude Code's own browser ceremony. Codex login uses App Server over local
  stdio and its managed ChatGPT browser flow.
- Canonical provider homes and settings are inherited. Lerience never replaces `HOME`, sets an
  isolated `CODEX_HOME`, reads credential files, or copies credentials.
- Lerience does not expose logout or “disconnect”. Provider credentials are shared with the
  learner's normal clients, so that action would have effects outside this app.
- Renderer IPC exposes normalized connection facts, never commands, environment variables,
  auth paths, stderr, JSON-RPC, or provider payloads.

## Usage boundary

Usage is shown only when a provider exposes a direct machine-readable source. Codex App Server
rate-limit reads and updates are allowed. Claude's stable rate-limit events are allowed; its
experimental active-session usage read may fail closed to “Unavailable”. Lerience starts no
hidden session, scrapes no provider UI, and invents no estimate to fill a missing limit.

## Why

The product is for subscription holders who should not need a terminal. Detecting an existing
provider but refusing to conduct its own supported browser handoff would leave the most fragile
part of setup outside the product. The normalized registry also makes the promised provider
choice real without forking the learning experience.

## Rejected

- API-key and pasted-token forms.
- App-owned OAuth callbacks or credential persistence.
- Automatic login/refresh during startup or readiness checks.
- Provider-specific course or renderer flows.
- Offering a provider in the product before it can start a real tutor session.
- Switching providers during a live session.

## Reopens if

A provider removes the supported status/login surface, its terms prohibit this use, or a probe
cannot avoid credential mutation. That provider becomes unavailable; the boundary is not
weakened to keep a card green.

## 2026-08-15 release-policy posture

ADR-025 supersedes the earlier blanket Claude block. Anthropic's legal/Agent SDK restriction and
its June 2026 support statement about subscription-backed third-party Agent SDK usage do not give a
single unambiguous answer for Lerience's official-harness, provider-installed shape. The maintainer has
decided to keep Claude enabled while this is monitored and re-reviewed before public promotion.
Lerience does not package Claude, own its login, or copy its credentials.

OpenAI's App Server documentation continues to describe deep integration in a developer's own
product and Codex-managed ChatGPT login/rate-limit methods. Both providers remain subject to M5's
installed-runtime compatibility matrix; Codex's experimental interface remains the higher
technical-drift risk. See `distribution/PROVIDER-READINESS.md`.
