# ADR-034 — Open in editor: found, named, chosen, never shelled

Date: 2026-08-19 · Status: accepted

Discharges the "Open in editor" affordance promised by ADR-006 and gated by ADR-013. Extends
ADR-021's stance on externally installed programs to editors.

## Context

ADR-006 decided the learner writes code in their own editor and the app provides an "Open in
editor" button. The rebuilt course workspace (ADR-019) shipped a "Folder" instrument that reveals
the course in the file manager and left the editor handoff to the learner. A learner with a
coding course and two editors installed therefore had no direct way from the module they were
reading to the project they were meant to edit — the core loop's first step was a detour.

Two things made the obvious button non-trivial: the app must not guess which of several editors
a learner means, and it must reach them without a shell, a registry walk, or anything else the
product boundary forbids.

## Decision

1. **Presence-based placement, module-scoped.** The control renders in the material pane's head,
   beside "Run checks", only when the module being read has a `scaffold/` (ADR-013). The two
   controls are the build loop in one row: write in your editor, run the checks here. The rail's
   course-scoped "Folder" instrument is unchanged.

2. **The scaffold is the project.** The button opens `curriculum/<module>/scaffold/` — the
   directory holding the learner's `package.json`, the checks' working directory, and every
   `TODO(you)` gap. Opening it makes the editor's workspace, language server and terminal agree
   with what the app runs. The whole course folder is one menu row away for the learner who wants
   the journal or `COURSE.md` beside the code. The module directory itself is not offered: it is
   not a project root, and opening it would put the checks and hints one click from being edited.

3. **Editors are found, not configured.** The main process looks for a fixed catalog of editors
   (VS Code, Cursor, Zed, Windsurf, VS Code Insiders, Sublime Text) in the places their own
   installers put them, then along `PATH`, using only `stat`. A `PATH` hit that is a command
   wrapper (`code.cmd`) is followed to the real program; a wrapper with no program is not an
   editor. Nothing else is read — no registry, no `which`, no editor settings.

4. **The button names its editor, and the learner picks the default.** The control reads "Open
   in Zed", never "Open in editor" while something is installed. With nothing chosen, the first
   editor found is used and the menu labels it "found first". Choosing an editor in the menu opens
   the project in it *and* makes it the default, because for nearly everyone those are the same
   decision and the button's label shows it took. The choice is an app-wide preference in
   `settings.json` (`editor`), stored by id for known editors so a reinstall in a new place still
   resolves, and by path for a browsed-to program.

5. **Browse is the honest fallback.** When detection finds nothing, or the learner's editor is not
   in the catalog, "Browse for an editor…" opens the OS file picker for a program (an `.exe`, an
   `.app`, or any executable) and remembers it. There is no free-text command field: a command
   line is a shell.

6. **Launch is detached and shell-less.** The editor is spawned directly (or through `open -a` on
   macOS) with the directory as its one argument, detached, stdio ignored, and unreferenced, so the
   app neither waits on it nor is kept alive by it. `ELECTRON_RUN_AS_NODE` is stripped from the
   child's environment so an Electron-based editor starts as an editor. A failed launch is reported
   in the pane as a dismissible notice naming the editor; it never throws into the renderer.

7. **Renderer sees names, not paths.** The preload bridge carries an `EditorCatalog` (ids, labels,
   which is selected, whether the learner chose it) and an `EditorTarget` (a module id or "the
   course"). Executable paths, `PATH`, and the settings file stay in main. A module id is guarded
   exactly as the check runner guards it; a scaffold that does not exist is "no target", never a
   created directory.

## Rejected

- **A settings page for the editor.** `docs/POTENTIAL-SETTINGS.md` is explicit: a preference
  lives at its point of use until a Settings surface is earned. The menu beside the button is the
  point of use.
- **Detecting via the registry, `where`/`which`, or file associations.** Each is either a shell,
  a broader read of the machine than the product boundary allows, or wrong (the `.ts` association
  is rarely an editor).
- **Letting the learner type a command.** See 5.
- **Opening the module directory.** See 2.
- **Also bundling "open a terminal here".** Tempting for the `npm install` the check runner asks
  for, but ADR-006 keeps the terminal out of the product on purpose, and the better answer to
  that specific friction is for the app to install a scaffold's dependencies itself through its
  packaged npm — a separate decision with its own failure modes.

## Follow-ups this surfaces

- **Install scaffold dependencies from the app.** The check lens already refuses to run until
  `npm install` has happened and tells the learner to do it in a terminal the product says they
  do not need. The packaged runtime can do it; the UI should offer it where the refusal appears.
- **Seminar chips for the current project.** The tutor protocol could be told which editor is in
  use so its instructions say "open it in Zed" rather than "your editor". Cheap once the catalog
  exists; not done until the protocol has a place for it.

## Reopens if

- Real learners have editors the catalog misses often enough that "Browse" is the common path —
  then grow the catalog or read the platform's application list.
- A learner needs two different editors for two courses — then the preference becomes per-course,
  which ADR-019 rejected for layout but never considered for tools.
