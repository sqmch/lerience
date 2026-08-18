# ADR-009 — Recovery-first close: abandonment is the normal end of a session

Date: 2026-08-11 · Status: accepted

## Decision

The app assumes sessions end by **walking away**, not by ritual. Design consequences:

- Abandoning a session loses nothing: the transcript checkpoints continuously (ADR-010) and
  course files are whatever the tutor already wrote. No timer fires; no unattended agent runs.
- The close ritual (journal entry, quiz seeds via `quiz.mjs`, progress sync, commit, doctor
  verification) runs at the **next open** as a wrap-up from evidence — transcript plus file
  state — before the new session starts. An explicit "End session" button runs the same ritual
  eagerly. One code path.
- A wrap-up honestly records whatever actually happened, including "nothing durable" — there is
  no invariant of the form "progress must have changed."

## Why

- The close ritual is where the engine's cross-session memory gets written: skip it and the
  next session opens amnesiac and the spaced-repetition queue silently starves (no seeds ever
  enter it). Closes **matter**; clean closes must not be **load-bearing**.
- The product's most motivated real user reports never closing cleanly — moving on mid-session
  and returning the next day is the actual usage pattern, not a discipline failure. A design
  that depends on a goodbye ritual fails daily for its best user.
- The engine already points here: doctor detects half-closed sessions and the protocol's resume
  rule reconstructs state before continuing. This ADR promotes that recovery path from
  exception to the normal case and automates it.
- It retroactively dissolves the previous project's close-failure class: a greeting-only
  session couldn't close because close demanded progress changes. With recovery-first close
  there is no such invariant to violate (ADR-005).

## Rejected

- Close-at-goodbye as the primary path (fails the real usage pattern). Idle-timeout auto-close
  (runs an unattended agent, spends tokens without oversight). Mechanical file-change
  invariants at close (punishes honest sessions).

## Reopens if

- Wrap-up-at-next-open proves too lossy in practice (e.g. tutors reconstructing poorly from
  transcript evidence after long gaps) — then consider incremental seeding/journaling during
  the session, which stays protocol-compatible.
