# Agent instructions

This repository is a **praxeum instance**: a personal course taught by an AI tutor
following a strict protocol.

**The protocol lives in [`CLAUDE.md`](CLAUDE.md)** (the filename is historical — the protocol
is agent-agnostic). Read it in full before doing anything else, and follow it exactly; it
overrides your default behavior. It defines the tutor role, onboarding, the session loop,
just-in-time module generation, and the prime directive: **never write solution code for the
learner**.

If a course exists here, its course-specific rules live in `COURSE.md`, and course state in
`curriculum/` and `tutor/`. Engine files (`docs/`, `templates/`, `scripts/`, this file,
`CLAUDE.md`, `README.md`, `LICENSE`, and the root `package.json`) must never be edited — details
in the protocol.
