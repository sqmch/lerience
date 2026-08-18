# ADR-014 — The app-conducted session preamble: content and boundaries

Date: 2026-08-12 · Status: accepted (built in M2; flagged for maintainer review at the M2 gate)

## Context

ADR-003 settled the mechanism: app-conducted sessions get an app-supplied preamble, the
engine's `CLAUDE.md` stays untouched, and the preamble travels *inside the opener message* —
the "send a message" surface is the only agent interface guaranteed to survive future
releases. What remained open (SPEC §9) was the preamble's **content**.

## Decision

The opener message the app sends at session start has three parts, in order:

1. **A conduction note** — a short bracketed block telling the tutor it is being driven
   through the desktop app: the learner sees a designed chat, not a terminal; the app renders
   course files live (rail, material pane, labs), so file edits are visible to the learner the
   moment they land; the learner writes code in their own editor and runs checks from the app.
   Nothing else about *how* to teach.
2. **The factual context block** (ADR-003) — script-computed facts: doctor verdict, due quiz
   items most-overdue first, journal tail, current module. Stated as *facts as of session
   open*, with one clarification sentence: the block is computed by the engine's own scripts
   at open, so the tutor may treat it as satisfying the protocol's "gather state first" steps
   and need not re-run them unless something looks inconsistent. In M2 the block carries only
   what already exists (current module); doctor/due/journal arrive with M3's session
   lifecycle.
3. **The learner's actual opener** — "start session", or whatever the flow requires.

Hard boundaries, in force from M2 on:

- **No pedagogy.** The preamble never restates, summarizes, or adjusts a single protocol
  rule. One pedagogy source (ADR-003); two is the corruption.
- **No capability shaping.** No tool guidance, no tone instructions, no "be concise" — the
  protocol owns tone, the learner's own agent config owns capability (ADR-004).
- **Facts only, minimal, deletable.** The whole preamble is one function
  (`buildSessionOpener`) that a future session can delete without touching anything else —
  ADR-003's reopens-if mitigation, kept structural.

## Protocol equivalence (adapter configuration, not preamble)

For the preamble to be *additive* the baseline must match the raw harness: the SDK session
must load the course folder's `CLAUDE.md` (the protocol) and the learner's own settings
exactly as an interactive `claude` in that folder would. The Claude adapter therefore runs
with the SDK's Claude Code system prompt preset and full setting sources (user + project +
local), cwd = the course folder, and no model/tool overrides. If a future SDK default changes
what gets loaded, restoring equivalence is adapter work, not preamble work.

## Rejected

- Delivering the preamble as a system-prompt append (couples to an SDK-specific surface;
  ADR-003 chose the message surface deliberately).
- An "authoritative for due items" *rule* (stronger than a clarification): it would edge into
  protocol territory and risks the tutor trusting stale app data over files — the exact
  reopens-if condition of ADR-003.
- No preamble at all: the tutor would address a terminal user ("run npm run dev"), which the
  learner never sees. The conduction note exists to close that seam.

## Reopens if

- The tutor is ever observed treating the context block as more current than the files
  (ADR-003's condition — shrink the block).
- A protocol version adds first-class support for conducted sessions (the note may then
  shrink to nothing).
