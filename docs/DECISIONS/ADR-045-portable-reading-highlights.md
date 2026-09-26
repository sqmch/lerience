# ADR-045: Portable learner-owned Lesson highlights

Date: 2026-09-26. Status: accepted. Amends ADR-002 and ADR-010. Preserves ADR-003,
005, 012, 013, 019, 027 and 044. The learner authorized completing highlights for new
courses after accepting the contextual-only interaction.

Course Engine 0.4.0 templates negotiate `passage-marks-v1` in `reading-capability.json`.
Course format 0 is unchanged. Missing or unknown capability means ordinary reading,
without writes or implicit upgrades. Existing-course migration and releases are excluded.

The engine owns `tutor/reading-marks.json`, its schema and `scripts/reading.mjs` writer.
A course-wide revision protects mutations. Each mark binds a UUID, course UUID, module,
fixed relative Lesson path, SHA-256 source bytes, extraction version, heading ancestry,
paragraph index/full text, quote, UTF-16 offsets and creation time. App-data holds no copy.
Folder copies retain records; divergent copies remain independent.

Extraction `marked18-prose-v1` uses a pinned MIT Marked 18.0.9 lexer shipped with the engine.
It projects top-level prose paragraphs and heading ancestry. Text, emphasis, inline code
and links contribute text. Images, inline HTML and unrecognized inline tokens refuse that
paragraph. Only common HTML entities and numeric entities are decoded; the app additionally
requires exact equality with displayed DOM text before exposing a mark action. Code blocks,
lists, tables, diagrams and sandbox visuals remain ordinary teaching material. This narrow
projection does not replace the renderer or require a particular teaching format.

Same-source matching requires exact paragraph index, heading, full text and range. Changed
source requires exactly one full-paragraph and heading match in the same module. Otherwise
retain the saved quote/context, with no paint or return target. A matching changed source
still gets a changed-lesson label. Never fuzzy-match, search other modules or repair a mark.

The app resolves the currently open course; the renderer supplies no write path. The engine
validates source and record revisions, rejects links including hard-linked files, serializes
cooperating writers with a process lock, fsyncs a temporary file and atomically replaces the
record. It checks external record edits and source changes again before commit. Owner edits
are preserved on detected conflict; this is not a security boundary against an active local
filesystem attacker. Unknown/corrupt files are never replaced. A dead writer lock may be
reclaimed under a separate exclusive recovery lock; an unreadable lock requires repair.

Limits are 200 marks, 1 MiB record bytes, 256 KiB source bytes, 16,000 UTF-16 units per
paragraph/quote, 2,000 heading units and 64,000 request characters. Exceeding a bound refuses
the operation before acknowledgement. Same-ID retries return the saved result; conflicting
reuse fails. Exact duplicate ranges do not add another mark. Removal is idempotent when the
ID is already absent. Unsaved input remains available for retry or copying. Ordinary exit
is blocked while a mutation is pending or unresolved; explicit discard releases it. A hard
crash may lose an unacknowledged quote, never an acknowledged record.

The production Lesson component and renderer harness share the implementation. Selection
exposes Highlight; right-click or Context Menu / Shift+F10 opens shared menu controls for
keyboard paragraph selection and the course-wide saved list. There is no permanent highlight
row, count, banner or empty-lesson prompt. Links retain ordinary context behavior. Returning
is explicit and focuses the paragraph; unmatched and vanished-module quotes remain in the list.

Marks indicate only that the learner saved a passage. They never change teaching content,
progress, quiz, assessment or completion, and never send to or start a tutor. No learning or
retention benefit is inferred from successful storage and interaction checks.
