# Renderer harness

This developer-only browser harness mounts production renderer components against a narrow stub of
the preload API. It makes dashboard, course, onboarding, provider-connection, session-control, and
slow transition states inspectable without starting Electron or contacting a tutor provider.

The harness is source tooling, not an alternate application or learner workflow. Electron Builder
packages only the compiled application output, `package.json`, the assembled runtime, and the
third-party notice; nothing under `dev/` is shipped in an installer.

## Fixture provenance

All paths, courses, learner details, account labels, dates, provider events, tutor prose, journals,
quiz items, and check results in this directory were written specifically for the public harness.
They are fictional and do not come from a learner course, a provider transcript, a development
session, or a retired example repository.

Keep future fixtures deterministic and visibly synthetic:

- use the `C:\PraxeumFixture\...` namespace for artificial Windows paths;
- use `example.invalid` for account labels;
- avoid copying screenshots, prose, timestamps, random suffixes, or course state from a live run;
- model only the fields required to exercise a real renderer branch; and
- add a purpose comment when a value resembles sensitive or machine-specific data by necessity.

## Commands

```powershell
pnpm harness:dev
pnpm harness:typecheck
pnpm harness:build
pnpm harness:check
```

`harness:dev` serves the harness at `http://localhost:5199`. `harness:build` writes an ignored static
bundle to `dist/renderer-harness/`. `harness:check` runs its dedicated TypeScript project and build;
the root `pnpm check` includes that gate.

The bar at the bottom selects deterministic screens. Hide it when inspecting the application's own
status bar. The theme control changes the same root data attribute used by the production renderer.

## Tool adapter

The repository-level `.claude/launch.json` points compatible developer tooling at port 5199. It is
an optional preview adapter only: it does not contain the harness, ship in the app, configure the
Claude provider, or replace root `CLAUDE.md` repository guidance.
