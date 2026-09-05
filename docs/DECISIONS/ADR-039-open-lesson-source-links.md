# ADR-039 — Open source references from module documents

Date: 2026-09-05 · Status: accepted

Module lessons cite local reference files with Markdown links. Native navigation is intentionally
blocked, so those links previously appeared clickable without doing anything.

The renderer now sends a module id and the clicked href through the existing editor IPC channel.
Main resolves relative paths from that module's directory, verifies containment in the active
course both before and after resolving symlinks, and requires an existing file. It rejects absolute
paths, unsupported protocols and links outside the course. The renderer cannot choose a program.

Text and source files use the learner's existing editor preference and detached, shell-free launch.
VS Code and its known derivatives request window reuse; Zed receives the file and lets its project
routing choose a window; Sublime adds it to the current window. Executable editor launches support
line fragments such as `#L12` and `#L12C3`. Custom programs and macOS application bundles receive
the ordinary file path because no portable line-navigation contract exists for them. Opening an
existing matching project and bringing it forward ultimately belong to the editor and OS.

XLSX, PDF and common image references open through their associated desktop app. This is a fixed
document-extension allowlist, never a general executable association. Explicit HTTP(S) citations
open in the system browser. Missing targets and launch failures produce a dismissible notice in
the lesson. Existing folder and scaffold editor controls keep their behavior.

The change extends ADR-034 without adding a file browser or editor to Lerience. Source files remain
learner-owned. A file link opens a file; it does not run its contents or prove a citation is correct.
