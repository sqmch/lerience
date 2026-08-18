# ADR-011 — The conversation is a pipe; the course is alive

Date: 2026-08-11 · Status: accepted; engine-update mechanism amended by ADR-023

## Decision

The seminar chat is a **transparent pipe** between learner and tutor. The app never parses
learner intent, defines a command grammar, restricts message content, or intermediates the
tutor's replies. Anything typeable at the raw agent CLI is typeable in the chat, and adaptive
behavior — rewriting lessons, regenerating or recalibrating modules, restructuring the arc in
`COURSE.md`, adapting `lab.json` mid-session, authoring new sandboxed `visuals/*.html` — is
ordinary tutor file work that passes through no gate of ours.

Constraint is confined to one layer, and it is the engine's own: the app refuses to take the
model's word only for **ledger verdicts** — quiz intervals (`quiz.mjs`), close validity
(doctor), check results (the module's tests). Validation guards the bookkeeping, never the
teaching (ADR-005).

The fixed line is the **instrument, not the course**: the agent does not modify the app binary
or the engine files (ADR-023 keeps them app-updatable and hash-verifiable without a Git remote).
Courses self-extend through the engine's existing mechanisms — labs, visuals, course-specific
tutor rules — and the tutor additionally inherits every extension the learner adds to their own
agent (MCP servers, skills, memory), since the app drives the canonical install (ADR-004).

## Why

- Freeform conversation and course self-adaptation are core product value, named explicitly by
  the maintainer: a course that changes with the learner is the point; over-standardization would
  squeeze the life out of it. The lifecycle machinery (open context, wrap-up) is scaffolding
  *around* the conversation, never a script *of* it — the tutor protocol itself imposes more
  session structure than the app does, and that structure is earned pedagogy.
- Capability and authority are different layers (ADR-005). Guarding the ledger makes
  improvisation safer, not smaller: a tutor that cannot fudge spaced-repetition math is free to
  improvise everywhere else on ground that doesn't drift.

## Standing risks (UI liabilities, not architecture)

1. **Legibility bottleneck:** unknown agent activity types must render as an honest generic
   activity row (unknown types skip, known-but-malformed types raise — the inherited wire
   rule), never be dropped silently.
2. **Approval amputation:** an approval request the UI has no specific card for gets a generic
   honest card — show what is known, let the learner decide — never an automatic refusal that
   silently removes a capability.

## Rejected

- Intent parsing, slash-command grammars, or "guided modes" that constrain what the learner may
  say. Validation of teaching content (only ledger state is verified). Agent self-modification
  of the app or engine (breaks signing, updates, and the engine-instance contract).

## Reopens if

- Never for the pipe itself. The instrument/course line could shift only through a deliberate
  engine-level decision (e.g. a future protocol version granting courses new extension points).
