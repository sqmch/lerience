# ADR-013 — Affordances derive from module structure, not a course type

Date: 2026-08-12 · Status: accepted

## Decision

The UI never classifies a course as "technical" or "non-technical." Workspace affordances
derive per-module from what the course files actually contain:

- **Run checks** renders when the current module has a non-empty `checks/`.
- The prominent scaffold/editor affordance renders when the module has a `scaffold/`.
- "Open in editor" for the course folder itself stays quietly available regardless (the folder
  always exists; a learner may want their journal in their own editor).

There is no course-type field, no classifier, no mode toggle, and no per-course setting.

Non-buildable subjects (history, theory) are **allowed but honestly framed**: the engine
protocol's onboarding topic-fit check ("say so plainly and describe what would be lost — don't
quietly degrade") stands unchanged. Spaced recall, journal, arc, and the lab stage transfer
fully to such courses; the red→green build loop does not, and the product does not pretend
otherwise.

## Why

- The question "does this course have computer-testable content" is not a property to deduce —
  it is a fact the format already records, module by module. Reading it is single-source-of-
  truth (ADR-005's UI corollary) applied once more; classifying it would add a stale-able flag
  and get mixed courses (e.g. history-of-computing with one data module) wrong.
- Presence-based rendering handles course evolution for free: when the tutor generates a
  module with checks into a previously check-less course, the affordance appears by itself.
- The engine already has the precedent: the study's check runner defines an explicit
  `no-checks` state for an empty checks directory.

## Rejected

- A course-type classifier or onboarding-set "course kind" flag (stale-able state, wrong on
  mixed courses, a mode to test). Hiding "Open in editor" entirely on check-less courses (the
  folder is always real and always the learner's). Building tutor-judged assessment pedagogy
  for non-buildable subjects now (a product expansion awaiting real learner demand, not a UI
  conditional).

## Reopens if

- Real usage shows non-buildable courses becoming a primary use case — then the *pedagogy*
  question (judged boss-checks, essay flows) gets its own decision; this presence-based UI rule
  survives either answer.
