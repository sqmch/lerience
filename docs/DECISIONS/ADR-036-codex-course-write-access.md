# ADR-036 - Codex tutor threads request course-scoped write access

Date: 2026-08-22 · Status: accepted · Amends ADR-004

## Decision

The Codex adapter explicitly requests `workspace-write` when it starts an App Server thread and
checks the effective sandbox returned by Codex before the tutor can begin. The App Server process
and thread both start in the course root. Session-local sandbox configuration excludes additional
writable roots and temporary directories, so unattended writes stay within the course.

As amended on 2026-09-04, metadata alone is insufficient. Before the first `turn/start`, Lerience
runs a fixed marker-write command through App Server's stable `command/exec` with the returned
sandbox policy and working directory. Lerience checks the actual marker bytes, removes only that
temporary marker, and then permits the interview. Missing bytes, a rejected command, a timeout, or
an unexpected working directory or write scope fails startup with Codex repair/update guidance.
This does not use a model turn or create course content.

On Windows, provider discovery requires Codex's command-runner and sandbox-setup helpers alongside
the executable or under `codex-resources`. It skips an incomplete candidate and continues through
the ordinary discovered locations. These include complete runtimes in the Windows desktop app's
content-addressed `%LOCALAPPDATA%/OpenAI/Codex/bin` directories, newest installed first. Explorer
does not inherit the PATH additions used by the Codex desktop terminal. It never copies helpers, downloads a provider, changes its
configuration, or falls back to unrestricted execution.

Lerience still leaves the model and approval policy unset at session start. Those values continue
to come from the learner's Codex configuration, and the learner may change the supported controls
for the current session under ADR-018. Actions outside the workspace-write policy remain subject to
Codex's own sandbox and approval behavior.

## Why

Codex App Server 0.144.6 resolves a `thread/start` request with no sandbox field to a read-only
sandbox when the learner has no configured sandbox mode. That default lets the tutor read an
unonboarded course but blocks its first required write, usually `COURSE.md`. The failure occurs in
the provider sandbox before Windows, Git, or the Course Engine sees the edit.

Course writes are not optional capability. Onboarding, module generation, learner artifacts,
tutor state, QA, and session-close persistence all depend on them. `workspace-write` is the
narrowest App Server mode that satisfies that contract. The adapter also checks Codex's returned
policy so a future provider default or protocol change fails at session startup instead of after a
learner completes the onboarding interview.

The second Windows incident showed why the reported policy is only a prerequisite. The selected
Codex 0.144.6 executable completed the handshake and reported `workspaceWrite`, but its installation
lacked the sandbox command runner. The sandbox log reported helper lookup failure and
`CreateProcessWithLogonW failed: 2`. A minimal provider-sandbox write reproduced the failure;
a complete installed provider passed with the same course path and package-owned tools.

The capability check is per session and per course. An interrupted onboarding keeps the existing
transcript and uses the conductor's recovery flow. Retry checks capability again before any tutor
turn. A successful startup check cannot guarantee that later external changes to the provider,
filesystem, or policy will remain writable.

Native regression acceptance runs `tests/codex-course-write.integration.test.ts` with
`LERIENCE_CODEX_ACCEPTANCE_RESOURCES` set to an unpacked package's `resources` directory. It uses a
temporary synthetic course, the discovered installed Codex, the package's tool environment, an
actual marker write, and patches inside and outside the course with approval policy `never`.
`LERIENCE_CODEX_ACCEPTANCE_EXECUTABLE` optionally selects an exact provider for diagnosis. This is
separate from ordinary deterministic source tests and from the visible learner-path acceptance.

ADR-037 adds a separate, explicit session-scoped Full access choice after this startup check.
Never ask remains approval-only. Returning to Course folder restores the validated startup policy;
a new session always starts with this course-scoped check.

## Rejected

- Keep omitting the sandbox field. This deterministically starts a read-only tutor on the minimum
  supported Codex version when no sandbox mode is configured.
- Request `danger-full-access` at startup. ADR-037 permits it only as a deliberate learner choice
  for the running session.
- Ask learners to edit Codex configuration. Lerience's ordinary learner path cannot depend on a
  terminal or provider configuration file.

## Reopens if

- App Server adds a stable way to inherit the learner's interactive-client sandbox while
  guaranteeing course-root writes.
- A supported course workflow needs a filesystem capability that workspace-write plus explicit
  provider approval cannot express.
