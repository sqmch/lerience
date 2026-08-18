# ADR-027 - Existing-course engine updates are explicit, provenance-bound, and fail closed

Date: 2026-08-17 - Status: accepted

## Context

ADR-023 makes the Course Engine an internal immutable template and prohibits application updates
from silently rewriting an existing course. M5.4 still needs a way to move an older app-created
course to a newer template without treating learner files as disposable, adding an engine remote,
or rebuilding the session-persistence machinery rejected by ADR-007.

The operation has two different kinds of state. Engine files are replaceable only while they still
match an app-authored engine baseline. `COURSE.md`, `curriculum/`, `tutor/`, and the course marker
are learner-owned or identity-bearing and must never become update targets.

## Decision

`CourseEngineUpdater` is the one module that previews and applies an existing-course engine update.
Its interface exposes only those two product operations. Git commands, provenance recognition,
owned-path calculation, path validation, candidate construction, race checks, and cleanup remain
inside the module.

An update follows these rules:

1. The first root commit must be the app-authored `Initialize Praxeum Course Engine` baseline.
   Imported or unrelated histories remain compatible but are ineligible for automatic updates.
2. Engine-owned paths come from that initial tree and later commits carrying the app-authored
   engine-update subject and trailers. Ownership is never inferred from a broad folder glob.
3. The target template may not contain `.git`, `.praxeum.json`, `COURSE.md`, `curriculum/`, or
   `tutor/`; path traversal, links, control characters, case collisions, and file/directory
   collisions are rejected.
4. Preview is read-only. A changed, removed, linked, or learner-occupied engine path is a conflict;
   Lerience does not merge or overwrite it.
5. Apply requires a named branch and a completely clean repository. Closing or finishing current
   learner work remains the existing way to reach that state.
6. Lerience writes the target engine into an owned temporary clone, stages exactly the accepted path
   set, validates the candidate through an injected validator, and creates one app-authored engine
   update commit. Hooks are not run for the app-authored maintenance commit.
7. The original repository is inspected again before and after fetching the candidate object. Only
   the same clean branch, head, target fingerprint, and path plan may fast-forward. The previous
   commit remains the update commit's parent and therefore the ordinary recovery point.
8. The course gains no remote, app-data folder, upstream ref, stash, private index, or persistent
   rescue ref. An app update never invokes this operation; a learner-facing action must do so
   explicitly.

Git-filtered blob identities, rather than raw working-tree bytes, decide whether an engine file
still matches its baseline. This preserves exact edit detection across CRLF/LF checkout policy.

## Why

- A provenance-bound path set makes deletion as safe and reviewable as addition; a future template
  can remove an obsolete engine file without widening ownership to learner content.
- Refusal is the right conflict policy for the first implementation. A three-way engine merge would
  need to decide which protocol edits are meaningful and would turn a maintenance operation into a
  source-control interface for ordinary learners.
- Building the commit away from the learner's repository means validator failure cannot leave a
  half-written course. The final fast-forward is the only source mutation and preserves normal Git
  recovery without the hidden ref machinery rejected for session persistence.
- The same injected Git executable supports host development and the exact installer-owned runtime.

## Current product boundary

The maintenance core and exact-runtime acceptance are implemented before the first real engine
version delta exists. No banner or automatic invocation ships merely to expose a dormant action.
When a reviewed Course Engine change increments `course-engine/manifest.json`, the learner-facing
surface can map the existing `current`, `ready`, and refusal results without reopening the storage
or Git safety design. A live tutor session must be closed before that surface may call apply.

## Rejected

- Silently updating every course when the application starts or upgrades.
- Treating every path carried by the current template as overwriteable in an older course.
- Editing the source course first and attempting to restore files after candidate validation fails.
- Adding an upstream engine remote, stash, WIP ref, rescue ref, or app-private course directory.
- Automatically resolving a learner edit to an engine-owned file.

## Reopens if

- A real need emerges to update imported pre-internalization courses automatically.
- Engine files become intentionally customizable, requiring an explicit merge/customization model.
- Evidence shows a clean fast-forward can leave learner repositories unrecoverable on a supported
  filesystem; add the smallest recovery mechanism justified by that evidence.
