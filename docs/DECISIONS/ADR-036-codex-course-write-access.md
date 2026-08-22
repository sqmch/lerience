# ADR-036 - Codex tutor threads request course-scoped write access

Date: 2026-08-22 · Status: accepted · Amends ADR-004

## Decision

The Codex adapter explicitly requests `workspace-write` when it starts an App Server thread and
checks the effective sandbox returned by Codex before the tutor can begin. The thread working
directory is the course root, so this mode lets the tutor create and update course files without
granting silent writes elsewhere.

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

## Rejected

- Keep omitting the sandbox field. This deterministically starts a read-only tutor on the minimum
  supported Codex version when no sandbox mode is configured.
- Request `danger-full-access`. Course operation does not require silent writes outside the course
  root, and broader actions can use Codex's approval flow.
- Ask learners to edit Codex configuration. Lerience's ordinary learner path cannot depend on a
  terminal or provider configuration file.

## Reopens if

- App Server adds a stable way to inherit the learner's interactive-client sandbox while
  guaranteeing course-root writes.
- A supported course workflow needs a filesystem capability that workspace-write plus explicit
  provider approval cannot express.
