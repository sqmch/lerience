# ADR-037 - Explicit session-scoped Codex Full access

Date: 2026-09-04 · Status: accepted · Amends ADR-018 and ADR-036

## Decision

Codex starts with verified course-scoped write access under ADR-036. The learner may deliberately
select **Full access** in the existing session controls or while accepting the course arc. The
option states that the tutor can write outside the course folder and use the network. Claude has
no new access control.

Access and approval are separate choices. **Never ask** changes only approval policy. Full access
changes Codex's sandbox policy; combining both choices permits unattended work outside the course
and network access. The arc applies both selected controls in one awaited request before sending
assent. A rejected request leaves the arc visible with an error and sends no build message.

The provider-owned access IDs are `workspace-write` and `danger-full-access`. The adapter stages
access separately in `pending`, leaving `current` unchanged until the next real turn starts.
The session bar labels pending access as applying to the next reply. Codex's supported
`turn/start.sandboxPolicy` accepts `{ type: "dangerFullAccess" }` and applies the override to
subsequent turns. Returning to Course folder sends the exact validated startup sandbox policy,
including its temporary-directory exclusions, network restriction, and absence of outside writable
roots. Neither choice changes provider settings files; a fresh session starts course-scoped.

## Why

Course-only Never ask can deny required operations instead of prompting. An installed-provider
check reproduced offline npm pack/install failing with the default cache outside the course and
succeeding with a course-local cache. Registry downloads additionally require network access.
An explicit Full access option lets the learner authorize those capabilities without making the
approval-only control misleading or silently broadening every session.

The tradeoff is authority over the rest of the learner's writable filesystem and network. A tutor
mistake or an unsafe command can affect files outside the course. Course Engine gates and teaching
instructions still apply; they are not an operating-system sandbox.

## Verification

Deterministic tests cover provider IDs, staged/current separation, rejected controls, access
rollback, and the arc's explicit selection and ordering. Native acceptance uses a disposable
synthetic course and sibling files: Full access writes a sibling on two consecutive turns, then
Course folder refuses a sibling write. A fresh session reports Course folder again. No personal
course files or provider configuration are changed.
