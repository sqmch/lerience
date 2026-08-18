# ADR-004 — Provider-neutral agent seam; Claude first, Codex later

Date: 2026-08-11 · Status: accepted

## Decision

The app drives the learner's own agentic CLI through a small provider-neutral seam
(`TutorAgent`/`AgentSession`, SPEC §7) that yields a normalized event stream (text deltas, tool
activity, approvals, file changes, usage, terminal states). The renderer never sees provider
shapes.

The first adapter is **Claude Code** via the supported Agent SDK / `claude -p
--output-format stream-json`. A **Codex** adapter (App Server, stdio JSON-RPC) follows behind
the same seam once the Claude path is proven.

## Credential and capability invariants (carried from the previous project, hard-won)

- The app never performs, stores, inspects, copies, or refreshes provider authentication; the
  learner signs in through the vendor's own flow, and uninstalling the app never touches it.
- No product-isolation config home (no `CODEX_HOME`-style override, no replaced HOME); the
  agent inherits the learner's canonical environment and settings.
- The agent keeps its full normal capability — model, shell, filesystem, web, MCP, skills,
  sandbox, and approval settings are the learner's. The app is a conductor, not a jail.
- Agent stderr is drained, never logged; transcripts and app-data are checked to contain no
  credential-shaped content.

## Why Claude first

Anthropic ships the Agent SDK as a supported, documented embedding surface. OpenAI marks
`codex app-server` experimental and unsupported for production. Starting on the stable interface
de-risks M2; the previous project's T0 evidence shows the Codex path works when its turn comes.

**Provider policy is a standing risk**: the product drives subscription clients
programmatically. Verify each vendor's terms before that adapter ships; one vendor's policy
change must be a bad quarter, not an extinction event — which is what the second adapter is for.

## Rejected

- Embedding a terminal as the product surface (chat-only is the maintainer decision; the raw
  harness in the course folder is the escape hatch). Raw API loops (amputated agent, cost —
  SPEC §2). Wrapping/intercepting the agent's toolchain (couples to internals that will change).

## Reopens if

- A vendor's terms prohibit programmatic subscription use (that adapter dies; the seam and the
  other adapter are the survival plan), or the Agent SDK's event surface cannot express
  approvals honestly (discover in M2).
