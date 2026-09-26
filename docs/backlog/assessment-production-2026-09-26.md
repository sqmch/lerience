# Optional assessment for new courses

ADR-044 authorizes the implemented Course Engine 0.3.0 capability. Newly created courses may
include a numeric prediction and explanation activity in a module. The authored Brief remains
available with its prose, code and commands. Modules may omit assessment or combine it with
working artifacts and checks.

The application saves raw drafts through the canonical engine writer. Explicit local submission
freezes an attempt, reveals numeric checks and preserves assistance history. Tutor reasoning
feedback remains separate and requires an explicit review request through the existing session
conductor. Feedback binds to the submitted question version, source digest and criteria. Revised
answers create a separate attempt. Failed or unconfirmed saves retain the visible input and
offer retry, copying or explicit discard and reload.

Portable records live in `tutor/assessments/`. No assessment action automatically changes
progress, mastery or the quiz bank. Unsupported and legacy courses retain the ordinary Brief;
this work does not convert them. Reading annotations remain LB-015.

## Acceptance on 2026-09-26

The disposable native probe in `dev/assessment/` used Windows, Electron 43.4.0 and its embedded
Node 24.18.1. It created a new course through CourseCreator, invoked the real sandboxed preload
API and executed the canonical writer in an Electron utility process. It passed:

- A 35,479-character request through structured IPC, without command-line answer data.
- Save, explicit submission, repeated idempotent submission and a reopened hidden window.
- Identical history after copying the course and changing the active root.
- A 1,567,856-byte reply containing 34 attempts. The next save was refused before writing, and
  all existing attempts remained readable.
- Zero provider requests and no progress or quiz-bank files.

This probe exposed truncated large stdout replies. Assessment now sends its JSON reply through
the utility message channel and waits for the parent acknowledgement before exiting. Ordinary
script callers retain their existing transport. The runner regression covers a 1.5 MB reply.

The renderer check used the production assessment component in the development course shell
with a synthetic mixed module. Authored code, commands, editor and Run checks remained visible.
Submitting `5, 1, 6, 2` with an explanation showed immutable answers, `4/4` number checks and
reasoning awaiting tutor review. The view had no horizontal overflow or browser errors.

Engine tests cover immutable attempts, raw invalid drafts, source changes, unsupported capability,
path aliases, feedback bindings, blank supported evidence, quotas and competing stale-lock
recovery. Renderer and service tests cover failed-save recovery, acknowledgement loss followed
by new typing, stale course replies and explicit review delivery.

Full source validation and final hosted CI are recorded in the implementation PR. The browser,
temporary preview server and hidden probe process were stopped after acceptance. These checks
establish storage and interaction behavior. They do not establish improved learning outcomes,
live tutor feedback quality, signed package acceptance or release availability.
