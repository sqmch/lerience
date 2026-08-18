# ADR-010 — App-owned state lives in app-data, keyed by course UUID

Date: 2026-08-11 · Status: accepted

## Decision

State the app owns — session transcripts, agent thread bindings, window/layout preferences, the
course registry — lives in Electron's `userData` directory, keyed by a **course UUID**. The
UUID lives in a small committed marker file in the course folder (`.praxeum.json`: UUID +
format version), written once at course creation (or on first open of a pre-existing course).

Course folders receive nothing else from the app: no `.praxeum/` state directory, no transcript
files, no cache.

## Why

- The engine already decided where durable memory lives: **in the course files** — journal,
  progress, quiz bank. The app-data layer therefore holds only ephemera whose durable essence
  the protocol already captures (a transcript's lasting value is the journal entry it produces).
  Copying a course folder to a new machine moves the complete course; losing chat history and
  window positions is the acceptable, by-design cost.
- Keying by UUID instead of by path survives folder moves and renames — the failure mode of
  path-keyed workspace state (the VS Code approach) — at the cost of one tiny marker file.
- Keeping app state out of the course folder keeps raw-harness coexistence clean (ADR-002): the
  engine's doctor, git status, and update flow never meet app droppings.

## Rejected

- `.praxeum/` state directory inside the course (pollutes the repo the raw harness also runs
  in; gitignore edits touch engine files). Path-keyed app-data (breaks on move/rename).
  Transcripts inside the course files (the protocol's journal *is* the curated durable record;
  raw transcripts would bloat every clone and duplicate its purpose).

## Reopens if

- A future sync/backup feature wants transcripts to travel with the course — then revisit
  what is ephemeral, deliberately, rather than by default.
