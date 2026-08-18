# ADR-003 — One pedagogy source; the app mechanizes session-open, not the rules

Date: 2026-08-11 · Status: accepted; source location amended by ADR-023

## Decision

The tutor protocol — the engine's `CLAUDE.md` in the course folder — is the **only** pedagogy
source. The app never maintains a parallel prompt set that restates the rules.

ADR-023 moves the canonical source of that file into this repository's internal Course Engine;
it does not change the one-pedagogy rule or the authority of the copy carried by each course.

At session open the app assembles a compact, factual context block — doctor verdict, due quiz
items (most-overdue first, from `quiz.mjs`), journal tail, current module — and prepends it to
the opener. If app-conducted sessions need any protocol clarification (e.g. "the opening context
block is authoritative for due items"), it ships as a small app-supplied session preamble, not
as an engine edit (open question in SPEC §9; decide before M2).

## Why

- The previous project re-implemented pedagogy as its own prompt files beside the protocol, and
  the two drifted. Two pedagogies is the corruption the audit was run to prevent.
- The protocol's session-open steps ("run doctor **first**", "most-overdue first", "never
  silently skip the backlog") are patches over the agent forgetting to gather state correctly —
  each rule was earned from a real failure. Handing the tutor script-computed facts closes that
  failure mode deterministically.
- The injection is purely additive: no tool is removed, no loop is wrapped, nothing depends on
  any agent interface beyond "send a message" — the one surface guaranteed to survive future
  agent releases. The app already parses these files to render the rail and due counter, so the
  block is nearly free.
- It extends the engine's own philosophy: the due-list is *already* script-owned because
  model-computed intervals drifted once and silently starved a module's recall.

## Rejected

- Pure free-form open (keeps the documented failure mode). App-owned pedagogy prompts (drift).
  Editing the engine's protocol for app needs (breaks the engine-updates flow for raw-harness
  users).

## Reopens if

- The context block is ever observed causing the tutor to trust stale app data over the files —
  the mitigation is keeping the block minimal and factual, and it remains one deletable
  function.
