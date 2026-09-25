# Course Engine

This directory is the canonical Course Engine owned by Lerience. It is a deep module
whose durable interface is the on-disk course contract, not a repository URL.

- `template/` is materialized into each new course before that course's Git repository is
  initialized.
- `tests/` proves the deterministic scripts and their command-line behavior without shipping
  test machinery into learner courses.
- `manifest.json` versions the engine independently from the course-file format and records the
  exact open-source prototype revision from which the initial internal engine was imported.

The old `learning-harness` repository is provenance and a legacy reference client only. It is
not a build or runtime input. Change the template, its tests, the Desktop compatibility adapters,
and the engine version together when the course contract changes.

Existing courses do not receive those changes with an app update. ADR-027's explicit updater first
previews only provenance-bound engine paths, refuses learner edits/collisions, and applies a
validated engine commit only from a future learner action. Increment `engineVersion` whenever a
reviewed template delta should become such an offered update.

Engine 0.2.1 fixes Windows QA cleanup under Electron by removing temporary files and links
without recursive deletion through junctions. Dependencies remain shared to avoid copying or
reinstalling them for each check run. Cleanup failures leave a warning and retain the remaining
temporary files. This does not sandbox course-authored check scripts. Existing courses require
the explicit engine update described above; an app update alone does not replace their scripts.

Engine 0.2.0 replaces sealed hint files with three assistance levels given live, and requires a
learner's-eye `REVIEW.md` before handover, cross-checked by QA where a structured answer file
exists (ADR-041). Course format 0, schemas and record locations are unchanged; `hintsUsed` keeps
its values with the new meaning, and a module carrying legacy `hints/` still validates. Engine
0.1.2 scoped modules around one outcome and a complete learning cycle, distinguished daily
availability from module size, and added an advisory lesson-scope QA check. Existing courses retain their own protocol and materials; this patch adds no update
UI or automatic migration. The updater core remains subject to ADR-027's explicit action boundary.

The repository-owned [teaching protocol evaluation](evaluations/teaching-protocol.md) records the
audit, worked cases, mechanical evidence, and limits of the qualitative review. It is development
material and is not copied into courses.
