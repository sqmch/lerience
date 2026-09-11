# ADR-042 - Steering a running turn is a provider capability the app reports

Date: 2026-09-11 · Status: accepted · Amends ADR-018 and DESIGN.md

## Decision

A message typed while the tutor is working goes one of two ways, and the adapter says which.
`AgentSession` gains `steerable` and `steer(message)`. A steerable provider takes the message
into the turn in flight; the model sees it at its next step, after the tool call or reasoning
step under way, not instantly. A provider that cannot steer keeps today's behaviour: the renderer
holds the message, shows it as queued and cancellable, and sends it through the normal path when
the turn settles.

Codex is steerable. App Server 0.144.6 has a stable `turn/steer` method whose `expectedTurnId` is
a precondition: the request fails when the live turn is no longer that one. The adapter aims every
steer at the turn id it received from `turn/start`, checks that the returned turn carries the same
id, and rejects on any other answer. A steer is not a turn. It adds no result and no
`turn_complete`; the running turn's own completion is still the only boundary.

Claude is not steerable. Agent SDK 0.3.233 has no method that injects into a running turn, so
`steer()` rejects and the queue applies. Nothing else changes for Claude.

The conductor keeps persist-after-accept in both directions. An idle session persists the learner
entry and then sends. A busy steerable session awaits the provider's acceptance first and persists
the entry only after it; a refused steer persists nothing and the renderer queues the message for
the next turn. A busy session that cannot steer still refuses the send outright.

The snapshot carries `steerable` from the running session, so the renderer never assumes the
behaviour. When the turn is busy and the provider can steer, the composer's placeholder reads
"Your tutor sees this at its next step". When it cannot, the existing "Sending when the tutor
finishes" box shows the queued message. Neither surface promises what the provider has not
confirmed.

## Why

The queue was the honest floor: with one turn at a time, holding the message and sending it when
the turn ends never loses anything. It also means a learner who notices the tutor heading the
wrong way during a long build can only watch or stop it. Codex now exposes a supported way to
change course mid-turn, and using it is the difference between "also cover unit tests" landing on
the next step and landing after twenty more file writes.

The capability differs by provider and the app must not paper over that. ADR-018's rule that the
app reports rather than assumes applies here exactly: which behaviour a message gets is the
provider's fact, and the composer states it.

## Rejected

- **Interrupt and resend.** Stopping the turn and sending the original request plus the new
  message would work on every provider, but it discards the in-flight tool work: partial file
  writes, a half-run command, the reasoning already spent. That is a different, destructive
  action the learner already has as Stop.
- **Folding queued messages into a running Claude turn through the streaming input.** The Agent
  SDK's streaming-input push is documented to deliver a queued user message into the running
  turn. A native run to confirm what the model actually sees, and when, could not be completed:
  the installed CLI reported an expired OAuth session on 2026-09-11. An unverified path does not
  earn a "steerable" claim on screen, so it stays out.
- **Steering silently.** Sending the message and saying nothing about when the tutor reads it
  would invite the learner to expect an instant reply and read the tutor's continuing work as
  ignoring them.

## Verification

Deterministic tests cover the Codex request shape and turn-id precondition, rejection with no
turn in flight or a failed `turn/start`, a refused or mismatched response leaving the turn's
accounting untouched, Claude's refusal, the conductor's persist-after-accept ordering in both
outcomes, and the renderer's steer-or-queue fallback. A native Codex steer has not been
exercised in this change.

## Reopens if

- A native Claude run confirms that a message pushed during a turn is absorbed at the model's
  next step, with a way to detect refusal. Claude then earns `steerable` on the same terms.
- Codex changes `turn/steer`'s contract: drops the `expectedTurnId` precondition, returns a
  different turn, or starts emitting a completion for the steer itself.
