# ADR-005 — The model proposes; code decides

Date: 2026-08-11 · Status: accepted

## Decision

Every state transition that must be correct is computed or verified by code, never by the model:

- **Quiz arithmetic** — the tutor judges answers; `quiz.mjs` owns intervals, due dates, history,
  and bookkeeping moves (the engine's existing rule, kept).
- **Close verification** — doctor and the schema validator decide whether a session close
  landed; the app renders their verdict. The tutor performs the close ritual; it does not
  self-certify it.
- **Checks** — the module's own `checks/` grade the learner's build; the tutor never grades by
  reading code and asserting success.
- **UI state** — the app parses course files itself (rail, due counts, record); model prose is
  never interpreted as state.

## Why

- This is the engine's own earned philosophy, generalized: hand-edited intervals once flattened
  a module's spacing and its quiz silently never came due — which is exactly why `quiz.mjs`
  exists. The app extends the same stance to everything the UI or the learner's record depends
  on.
- The previous project's worst live failure (a ~460k-token, 19-shell-command close that then
  failed on a mechanical invariant) came from the opposite stance: free-form prose asked to
  produce state, then policed after the fact. Validation beats interpretation.
- It keeps the tutor's *capability* untouched — the agent still has full shell and filesystem
  power. What's constrained is only what the app **accepts as true** without verification.
  Capability and authority are different things; conflating them was the old design's error.

## Rejected

- Mechanical close invariants of the form "file X must have changed" (a greeting-only session
  is a legitimate session; ADR-009 handles honest wrap-ups of any shape). Trusting model
  self-reports of state changes. Restricting the agent's tools to force structure.

## Reopens if

- Never, in spirit. Specific verifications may move (e.g. typed learning tools may later
  *assist* schema-correct writes), but the direction — code verifies, model proposes — is the
  project's spine.
