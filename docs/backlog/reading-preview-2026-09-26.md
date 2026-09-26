# Reading visual preview

LB-015, following [the saved-highlight discovery](reading-design-2026-09-26.md).
Owner task `01a0ddfc-3365-7a51-bc76-1503db3a117a`, branch
`codex/lb-015-reading-visual-prototype`, baseline `df8fc6289621e784c2a67d85d0571fb53a4c9f3f`.
Status: development-only visual prototype ready for review. Production highlighting, durable
storage and learner usefulness remain unproven. No accepted architecture or engine format changes.
Review: [PR #104](https://github.com/sqmch/lerience/pull/104).

## What to try

Start the repository harness on a free port, for example:

```powershell
pnpm harness:dev --host 127.0.0.1 --port 5297
```

Open `/?screen=reading&bar=hidden&theme=light`. Use `theme=dark` for the other theme.
The fixture renders the original parcel-tray material through real DocMarkdown in the existing
CourseView and Lesson pane. Inter chrome, Literata prose, shared controls and neutral Lens tokens
remain unchanged. A quiet fill and underline identify saved ranges independently of colour.

1. Read normally, select a sentence in Collection and choose Highlight. Copy still works.
2. Right-click Lesson prose, choose Your highlights and return to the passage. Switch to Brief
   and back; the mark remains. Links and form controls keep their ordinary context behavior.
3. Focus the Lesson tabpanel and press Shift+F10 or the Context Menu key. Choose Highlight a
   passage, then a paragraph and a range in its read-only text field, or save the whole paragraph.
   Escape and saving return focus to the Lesson panel.
4. Change the development menu's lesson version. An inserted paragraph leaves the Collection
   range intact and labels the changed lesson. Changed, duplicated or missing Collection text
   keeps the saved quote/context, with no Open passage action and no paint on a guessed target.
5. Try the busy and unavailable tutor examples. Marks still work and send nothing to the tutor.
6. Remove a mark. Reload to observe the explicitly temporary memory boundary.

The optional instrument imposes no answer form, completion action, study order or annotation
requirement. The synthetic Brief remains a sketch/discussion task. Notes, lesson editing, tutor
sends, folding, Brief annotations and any new assessment workflow remain outside this preview.

## Implementation boundary

All highlight behavior, matching, fixture state and styles live under `dev/renderer-harness/`.
CourseView and MaterialPane expose one optional Lesson composition prop, with their original
DocMarkdown fallback intact. The production entrypoint imports no reading implementation.
The preview uses the same DocMarkdown component and no replacement markdown renderer.
CSS Custom Highlights preserve the DOM, including existing emphasis, links and copy behavior.

The record is held in the mounted fixture only. Lesson/Brief navigation retains it; reloading,
leaving the harness fixture or toggling the general harness bar clears it. There is no browser
storage, app-data, disk, engine or preload write. Named synthetic revisions stand in for source
identity; they are not a production compatibility/digest contract. This does not establish
portable saving, crash recovery or an accepted annotation schema.

The bounded preview handles direct prose paragraphs, including inline emphasis/link text,
with UTF-16 offsets. Unsupported selections keep normal selection and copy behavior; an invoked
context menu explains the single-paragraph limit. Code, tables, lists, diagrams and sandbox
contents are not highlight targets. There is no persistent reading action row, count, banner
or empty-state feature prompt. Selection exposes Highlight; the existing menu primitives expose
the paragraph chooser and, once marks exist, Your highlights. The Lesson panel advertises its
menu and keyboard shortcut to assistive technology without visible instructional copy.
A course-wide list and recovery
after deleting a whole module are deferred; the missing-passage example does not prove those.
The existing lab sandbox and provider APIs are unchanged.

## Verification

Windows x64, Node 24.18.0, pnpm 11.9.0. Source gate is `pnpm check`; the PR records its final
local result, independent Standards/Spec reviews and final-head hosted CI before merge.

- Eight regression cases cover exact matching, relocation after insertion, changed/ambiguous/
  missing passages, duplicate paragraph identity, changed headings, malformed ranges, Unicode
  and inline links/emphasis, cross-paragraph refusal and independently removable overlaps.
- Headless Chromium exercised actual pointer dragging, the contextual action, copy shortcut,
  right-click and Shift+F10 entry, and Escape/focus restoration. Clean and marked lessons have
  no permanent highlight buttons or counts. Saved ranges do not rewrite the lesson DOM.
  Reopening Lesson retains marks; reloading resets them. Removing one preserves the other.
- Returning focuses and scrolls to the source paragraph. Source version changes preserve the
  current scroll offset. Unmatched quotes remain readable, with saved context and no false jump.
  Busy/unavailable tutor examples do not block these operations. An instrumented send function
  received zero calls during highlight actions; the companion link used the normal document-link
  handler with its original destination.
- Screenshots were inspected at 1440 by 1000 in light/dark, and 1100 by 1000 with a narrow
  material pane. Selection, saved marks, list, unmatched and keyboard-dialog states were checked.
  There was no document or reading-content horizontal overflow at those unzoomed sizes.
- At 200% CSS zoom in a 1100-pixel window, the existing three-column shell reduces the material
  pane to zero width. The ordinary `course` fixture reproduces the same result without this
  preview. At 2880 pixels with 200% CSS zoom, reading controls remain inside a readable pane.
  This records a shell limitation; it is not full zoom accessibility acceptance or a shell redesign.

No physical input takeover, native Electron/provider run, screen-reader acceptance, private
course access or release occurred. Browser copy-shortcut behavior is evidence that selection
remains intact, not a native clipboard roundtrip. Custom visual rendering is Electron-owned
and was not exercised here. The finite next-day human comparison in the discovery remains
outstanding; successful mechanical interactions establish no learning or retention benefit.

## Assessment coordination

[Assessment preview PR #103](https://github.com/sqmch/lerience/pull/103) merged at
`df8fc6289621e784c2a67d85d0571fb53a4c9f3f`. Final head
`0abc43087fdbed8cc71e6c58db2e760fc8d0945e` passed
[Quality / Windows x64](https://github.com/sqmch/lerience/actions/runs/36249622110/job/108425091684).
Its preview remains development-only, with provisional appearance acceptance and optional
activities. This reading work neither changes assessment nor grants either proposal production
persistence authority.
