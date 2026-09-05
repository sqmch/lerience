# ADR-038 — Mermaid diagrams in module documents

Date: 2026-09-05 · Status: accepted

Lessons already contain Mermaid fences. Showing them as raw code makes a responsibility map
harder to read. The document renderer now recognizes conventional `mermaid` code fences in lessons
and briefs and renders them using a bundled, lazily loaded Mermaid dependency.

Rendering uses strict security, disabled HTML labels, bounded input size and edge count, and
protected security configuration. The SVG is sanitized and displayed as an image so diagram CSS,
links and scripts cannot become app controls. No CDN or hosted diagram service is used. The source
remains available under the diagram and opens automatically if rendering fails. The library owns
diagram geometry; the app's tokens own the surrounding controls. Theme changes rerender the image.

Diagrams fit the reading column by default. Actual size enables scrolling when fitting makes labels
too small. Asynchronous results cannot replace a newer document. Parent rerenders preserve the
mounted diagram, using the same stable HTML ownership as embedded course visuals.

This is an app rendering capability, not a new course format. Models already author Mermaid fences;
the engine needs no additional instruction to force diagrams into lessons. Interactive HTML visuals
continue to use the existing sandbox and remain the choice when interaction teaches the concept.

Validation includes renderer lifecycle and SVG isolation tests plus a browser check with the real
bundled library. This does not establish native package acceptance or support for every Mermaid
diagram type. See [Mermaid usage and security configuration](https://mermaid.js.org/config/usage.html).
