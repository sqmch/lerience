# ADR-007 — Git is session-close persistence, not a transaction protocol

Date: 2026-08-11 · Status: accepted

## Decision

Git keeps exactly the role it has in the engine: the tutor commits at session close (or
wrap-up), doctor verifies that the close landed, and history is the course's audit trail. The
app builds **no machinery on top of it** — no WIP refs, no rescue refs, no private-index
checkpoints, no compare-and-swap on heads, no lease files. The learner never sees a SHA;
"your course is saved" is the entire user-facing story.

Mid-session durability comes from what already exists: course files on disk are whatever the
tutor has written (crash-safe by nature), and the app's transcript checkpoints continuously to
app-data (ADR-010).

## Why

- The engine's arrangement — commit at close, doctor verifies — is simple, proven across real
  courses, and sufficient once close is recovery-first (ADR-009): an unclosed session is wrapped
  up at next open, so there is no window where an elaborate mid-session Git safety net earns its
  complexity.
- The previous project promoted Git into the product's transaction protocol and paid ~1,800
  lines of refs/CAS/rescue machinery for it — the single biggest source of the "mess" being
  escaped. Its original justification (a hosted runner that could crash while holding the only
  copy of a learner's work) does not exist in a local-first app where the files are already on
  the learner's own disk.
- Git remains the cheapest robust "snapshot a folder of text with history" tool; replacing it
  with hand-rolled snapshots would be more code for less capability.

## Rejected

- WIP/rescue-ref checkpoint machinery (complexity without the hosted threat model that
  motivated it). Removing Git entirely (loses the audit trail, doctor's uncommitted-state
  check, and engine compatibility). Auto-committing on every file change (noisy history that
  breaks doctor's close semantics).

## Reopens if

- Real data loss occurs that a close-time commit plus on-disk files didn't cover — evidence
  first, machinery second.
