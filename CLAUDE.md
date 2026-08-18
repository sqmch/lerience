# Repository guidance

Start with [`docs/STATUS.md`](docs/STATUS.md), then read [`docs/SPEC.md`](docs/SPEC.md) and the
relevant records in [`docs/DECISIONS/`](docs/DECISIONS/). Read
[`docs/DESIGN.md`](docs/DESIGN.md) before changing established interface behavior.

## Sources of truth

- Treat this repository as self-contained. Use repository fixtures or temporary directories for
  development and tests; do not depend on sibling repositories or personal course folders.
- `course-engine/` is the canonical Course Engine module. Its template owns the course format,
  schemas, scripts, and tutor protocol.
- Product and architecture decisions live in `docs/SPEC.md` and accepted ADRs. Record a new ADR for
  a durable change to architecture, compatibility, distribution trust, or learner authority.
- Raw design values live in `src/renderer/src/design/tokens.css`. Tailwind and component styles
  derive from that layer.

## Working agreement

1. Preserve unrelated working-tree changes and keep each branch focused on one invariant.
2. Prefer repository-owned fixtures and deterministic checks over machine-specific assumptions.
3. Run `pnpm check` before handing off a source change. Distribution changes also run the narrow
   package, inventory, or release checks named in `distribution/README.md`.
4. Keep generated output, dependency trees, credentials, and private release keys out of Git.
5. Describe validation precisely: source checks, packaging rehearsal, and native acceptance are
   separate kinds of evidence.

## Product boundaries

- The application is local-first and opens to the course dashboard. Learners should not need Git,
  npm, a terminal, localhost services, or a hosted control plane.
- Stable compatibility names such as `praxeum:` IPC channels and `.praxeum.json` are independent of
  the provisional public brand.
- The application owns its Course Engine and packaged runtime inputs. Externally installed tutor
  clients remain outside the package and are discovered through explicit native paths.
- Learner-owned course files and credentials stay on the learner's machine. Renderer code receives
  only the narrow preload API.

## Common commands

- `pnpm dev` starts Electron in development mode.
- `pnpm check` runs type checks, tests, linting, formatting checks, and the production build.
- `pnpm package:windows:dir` builds the unpacked Windows x64 application with explicit distribution
  inputs.
- `pnpm package:windows` builds the Windows x64 installer.
- `pnpm publication:preflight` checks the tracked tree for private machine-specific remnants.
