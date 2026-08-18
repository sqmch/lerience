# ADR-001 — A local-first Electron app with no backend in v1

> **Amended 2026-08-14 by ADR-024:** initial community releases are unsigned. Local-first and
> no-backend remain unchanged; trusted OS signing is a later promotion, not an M5 prerequisite.

Date: 2026-08-11 · Status: accepted

## Decision

The product is a self-contained Electron desktop application. Initial community releases are
unsigned under ADR-024. Version 1 has **no server component**: no
accounts, no hosted tutor, no database, no telemetry backend. All state lives on the learner's
disk. The website is a landing page and a download link.

## Why

- Subscription authentication only exists inside the vendor's own client on the learner's
  device, so tutor execution is local by necessity — and local execution is also the *better*
  tutor, because the vendor's full agent harness (shell, files, planning, skills) comes free and
  improves with every release, while an API-driven reimplementation decays.
- Every prior topology that connected a hosted surface to the local machine (loopback
  companion, pairing secrets, tunnels, relays, credential snapshots) existed only to bridge that
  gap, and each one added desync and failure modes. Putting the UI and the agent in one process
  tree deletes the entire category.
- With no hosted tutor, nothing remaining (dashboard, course files, transcripts) needs a
  server. Accounts and sync are real future features; building them before anything demands them
  is pure ops surface.

## Rejected

- Hosted browser controlling localhost (compromised hosted code could drive a full-access local
  agent), managed reverse tunnels (public path to a local agent for a same-machine use case),
  hosted API-funded tutor as the primary product (cost plus amputated agent), Tauri (Rust
  backend forfeits TypeScript sharing with the agent/course tooling; a Node sidecar erases its
  size advantage).

## Reopens if

- Payments, team features, or cross-device sync become real requirements (add the smallest
  backend that serves them), or the "subscription holders who won't open a terminal" bet
  (SPEC §2) fails.
