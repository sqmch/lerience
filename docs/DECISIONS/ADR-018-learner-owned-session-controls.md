# ADR-018 — The app offers session controls; it never imposes them

Date: 2026-08-13 · Status: accepted; amended 2026-08-14 · Amends ADR-004

## Decision

The app may present the learner with runtime controls over their own tutor session —
**which model answers, how hard it thinks, and how much it may do without asking** — and
apply them to the running session through the provider's own control surface.

The invariants that make this safe, all mechanized in the adapter:

1. **A session still STARTS on the learner's own configuration.** `query()` is created with
   no `model`, no `permissionMode`, no effort. Whatever their CLI config resolves to is what
   runs, exactly as before.
2. **Changes are session-scoped and learner-initiated.** Claude applies them through the SDK's
   runtime methods (`setModel`, `setPermissionMode`, `applyFlagSettings`). Codex App Server has
   no client-side thread-settings mutation: its supported surface is the model, effort, and
   approval-policy overrides on `turn/start`, which apply to that turn and later turns. Codex
   choices are therefore staged without a hidden provider turn, visibly labelled "applies to
   your next reply," and attached to the next real learner turn. Neither path writes the
   learner's settings files. A new session starts from their config again.
3. **The app reports rather than assumes.** `current` comes from the provider's own init or
   thread-settings frames. A provider that can apply only on the next turn reports the
   learner's choice separately as `pending`; the renderer must not present it as already
   active. This is how the surface can answer "which model am I talking to" truthfully.
4. **The autonomy ladder is a curated subset, ordered least to most.** `default`,
   `acceptEdits`, `auto`, and — **added 2026-08-13 at the maintainer's explicit request, after a
   run that asked ~30 times across one course build** — `bypassPermissions`, labelled "Never
   ask" and described as what it is ("Full access to this course folder and your shell").
   `plan` (executes no tools) and `dontAsk` (silently denies what is not pre-approved) stay
   out, because both read as the tutor mysteriously failing. An id outside the ladder is
   refused by the adapter.

   The session is started with `allowDangerouslySkipPermissions: true`. That flag **enables
   the rung; it bypasses nothing on its own** — without it the provider refuses the mode, so
   the learner could not choose it even deliberately. Nothing is skipped until the learner
   picks "Never ask", and the pick dies with the session like every other control.

5. **A tool whose only effect is asking the learner something is auto-allowed.**
   `AskUserQuestion` produced a permission card asking permission to show a prompt. It touches
   nothing, and denying it breaks the interview.
6. **Provider-neutral at the seam.** `SessionControls` carries opaque ids plus display copy;
   the renderer never knows a Claude model name or a Claude permission mode. A Codex adapter
   answers the same two methods with its own ladder, or with empty lists if it has none — in
   which case the app shows no controls rather than lying about them.
7. **A control failure is local, not a dead tutor.** A rejected control request preserves the
   provider-confirmed values, keeps the composer usable, and explains beside the controls that
   the tutor is still connected. It never enters the conversation's fatal failure state.

## Why

ADR-004 says the app must not set `model`, `tools`, or `permissionMode`, because the learner's
subscription and configuration are theirs and the app must not silently downgrade or widen
them. That rule was written against the app **imposing** choices at startup, and it holds.

What it accidentally also prevented was the learner making those choices for themselves. Two
consequences showed up in real runs:

- **The learner could not tell which model was answering.** The app never displayed it because
  it never asked. "I don't even know what model we are using" (maintainer, 2026-08-13).
- **Permission fatigue with no lever.** A course build is dozens of file writes; every one
  raised a card. The session-scoped edit grant (round 5) fixed the file-edit case, but
  commands still asked and the learner had no equivalent of the terminal's own mode switch.
  The result was ~30 approval prompts per course and a maintainer watching an approval queue for
  ten minutes.

Offering the controls resolves both without touching what ADR-004 protects: the learner's
configuration remains the starting point and the persistent truth, and every change is theirs,
explicit, and gone when the session ends.

## Rejected

- **Persisting the learner's choice** to their provider settings, or to app settings that
  pre-set the next session. That re-creates exactly what ADR-004 forbids — the app deciding
  how their subscription runs — one indirection away.
- ~~**Offering `bypassPermissions`**~~ — rejected on 2026-08-12, reversed on 2026-08-13. The
  blast radius argument is real and the label carries it, but withholding the rung did not make
  anyone safer: it made a course build a ten-minute approval queue, which teaches learners to
  click Allow without reading. An honest, clearly-named opt-out beats habituated consent.
- **An app-invented autonomy vocabulary** ("safe / balanced / fast") mapped onto provider
  modes. It reads better and lies: the semantics are the provider's, and a mapping would drift
  the moment a provider adds a mode.
- **Hiding the controls until a provider supports all three.** Empty lists render nothing,
  so a thinner provider simply shows fewer pills.

## Reopens if

- A provider silently accepts a control but later reports a different resolved value. The
  adapter must keep the provider's next init/settings frame authoritative rather than trusting
  the requested value. (The 2026-08-14 Codex rejection was a different issue: the app called a
  nonexistent request method; the amendment above records the supported next-turn boundary.)
- Learners report that a session-scoped choice they liked is annoying to re-make every session
  — at which point the honest answer is an explicit, visible app preference, decided in its own
  ADR, not a silent memory of the last session.
