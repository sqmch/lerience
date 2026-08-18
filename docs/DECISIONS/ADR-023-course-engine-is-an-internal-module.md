# ADR-023 - The Course Engine is an internal module

Date: 2026-08-14 - Status: accepted

Amends ADR-002, ADR-003, ADR-006, and ADR-011. Supersedes ADR-022's external
`learning-harness` bundle.

## Decision

Lerience owns the canonical Course Engine in this repository. The engine is a distinct
module under `course-engine/`, with the files materialized into a new course under
`course-engine/template/`: the tutor protocol, agent pointer, course format and schemas,
templates, deterministic doctor/quiz/validation/QA scripts, and their tests.

`learning-harness` is the original open-source prototype and reference client. It is not a
development, build, packaging, update, or runtime dependency of Lerience. Once the
internal engine passes compatibility and creation acceptance, that repository may be labelled
legacy or archived without changing the desktop release process.

New courses are created by copying the immutable app-owned template into an exclusively owned
temporary sibling, initializing a fresh Git repository, committing the engine baseline, adding
the app-owned `.praxeum.json` identity in a second commit, and atomically publishing the folder.
The course has no Git remote. It remains an ordinary visible repository that Claude Code, Codex,
or another compatible local agent can use directly.

Existing learning-harness courses remain valid inputs. Format version 0 and the course-local
script interface remain compatible; internalizing the source does not authorize a new private
course format. The app continues to execute the scripts carried by each course, so an older
course is interpreted by the engine version it contains.

An application update never silently changes an existing course. A future explicit course-engine
update operation must identify engine-owned paths, preview the change, detect local modifications,
preserve recoverable state, and either complete atomically or refuse without disturbing learner
work. That operation is app-conducted; course repositories never gain an upstream engine remote.

## Module interface

The durable interface is the on-disk course contract, not a repository URL:

- `CLAUDE.md` is the single pedagogy source and `AGENTS.md` points compatible agents to it.
- `docs/FORMAT.md` plus `docs/schema/` define the course format.
- `scripts/doctor.mjs`, `quiz.mjs`, `validate.mjs`, and `qa-module.mjs` are the deterministic
  maintenance commands.
- `templates/tutor/` seeds protocol-owned course state after the learner accepts the arc.
- `course-engine/manifest.json` records the internal engine version and import provenance used by the
  release build.

Desktop parsing and stock-lab rendering are adapters at this seam. Conformance tests compare
them with the canonical engine artifacts so copied schemas or registry metadata cannot drift.

## Why

There is one actively developed product and one developer. A second repository no longer creates
independent release value; it creates synchronized commits, duplicate schemas and lab metadata,
build-time checkout assumptions, Git-bundle machinery, and two places to decide what the engine
means. Moving the implementation behind one small course-format interface gives changes locality
without collapsing the conceptual module.

The learner-visible strengths of the old arrangement survive: courses are plain files, Git is
their audit trail, the tutor protocol is readable, deterministic scripts remain runnable, and
the app does not own learner content. What disappears is only the accidental repository-level
coupling to the prototype.

## Rejected

- Keeping `learning-harness` as an active upstream solely because that is how the prototype began.
- Copying selected files into Desktop while continuing to call the external repository canonical.
- Shipping a full-history engine Git bundle inside every installer.
- Moving protocol or course state into opaque application code.
- Silently rewriting course engine files during an application update.

## Reopens if

The Course Engine gains a genuinely independent release cadence and at least one maintained
non-Desktop consumer. It may then be extracted or mirrored from the internal module deliberately;
the course-format interface and compatibility fixtures remain the seam.
