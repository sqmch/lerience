# ADR-006 — Visible course folders, the learner's own editor, chat-only surface

Date: 2026-08-11 · Status: accepted; escape-hatch mechanics amended by ADR-023

## Decision

- Courses live in **visible folders** (default `~/Lerience/<name>`, learner-changeable) — never
  in hidden app-data.
- The learner writes code in **their own editor**; the app provides an "Open in editor" button
  and a per-module **check lens** ("Run checks" → red/green rendered in place). The app embeds
  no code editor.
- The app's interactive surface is the **designed chat plus course lens only** — no embedded
  terminal (maintainer decision, 2026-08-11).

## Why

- The protocol's core loop is *learner-operated*: "you write code in your own editor and run the
  module's checks — red → green is the unit of progress." An app that hid the folder or ran the
  checks for the learner would break the pedagogy it exists to deliver, not package it.
- The study's own definition — "a lens over the same files, never a dependency" — is the right
  relationship and is kept. The app is a better lens and a conductor, not a container.
- Chat-only is safe because the course folder carries the readable protocol, format, and
  deterministic scripts. A power user can always run Claude Code, Codex, or another compatible
  agent directly in it and can run the maintenance scripts through npm. ADR-023 retires the
  prototype study UI and its `npm run dev` command from new Desktop courses.
- The check lens keeps "the learner runs the checks" true for non-terminal users: they click,
  they watch it go red or green. The engine's study already proved this pattern
  (`POST /api/checks/:id`).

## Rejected

- Hidden managed workspace (fits a chat-only tutor product, not learn-by-building). Embedded
  Monaco/CodeMirror (competes with real editors, huge scope, drifts from the proven loop).
  First-class embedded terminal (undoes the product differentiation from the raw study).

## Reopens if

- Real learner friction shows the own-editor handoff losing people (then evaluate an embedded
  editor as an *addition*), or a chat-protocol gap in M2/M3 proves undrivable without a
  terminal surface (then reconsider the escape-hatch decision with evidence).
