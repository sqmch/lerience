# ADR-002 — Courses carry the Course Engine format; compatibility is versioned

Date: 2026-08-11 · Status: accepted; repository mechanics superseded by ADR-023

## Amendment (2026-08-14)

ADR-023 internalizes the canonical Course Engine into `praxeum-desktop`. The format-compatibility,
visible-folder, course-local-script, and version-marker decisions below remain binding. The
external `learning-harness` source repository, full-history clone, and Git-upstream update
mechanics are historical and no longer describe new Desktop courses.

## Decision

A course created by the app materializes the internal Course Engine template in a visible folder
(default `~/Lerience/<name>`). That module is the single source of truth for the course format
(`docs/FORMAT.md`, `docs/schema/`) and tutor protocol (`CLAUDE.md`). The new course receives its
own Git history with an engine baseline commit, then one committed `.praxeum.json` marker (course
UUID + format version). It has no remote. The app otherwise writes only what the protocol writes.

The app executes the course's own engine scripts (`quiz.mjs`, `doctor.mjs`, `validate.mjs`,
`qa-module.mjs`, module `checks/`) via Electron's bundled Node runtime.

## Why

- Existing courses (`fundaimentals`, `learn-ts`, …) open in the app unchanged, and any
  app-created course remains a standard Git-backed workspace whose scripts and provider CLI can
  be run directly — the product's escape hatch by architecture instead of by feature.
- One format with one source of truth prevents the drift that hurt the previous attempt, where
  a parallel prompt/tool set diverged from the protocol.
- Running the course's own scripts avoids maintaining duplicate implementations. The security
  concern that would argue for app-pinned copies — executing code that arrived with the data —
  requires courses authored by third parties, and courses are personal artifacts generated from
  the individual learner; there is no sharing model (maintainer decision, 2026-08-11).
- Bundled Node means the learner needs no toolchain installed to run quizzes, doctor, or checks.

## Rejected

- A new app-private format (loses the proven schemas, the escape hatch, and the shared source of
  truth). App-shipped pinned scripts (duplication guarding against a distribution model that
  doesn't exist).

## Reopens if

- Courses ever come from anyone other than the learner's own engine workspace, or the engine format
  makes a breaking change (the version field in `.praxeum.json` is the detection point).
