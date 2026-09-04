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

The `building` fixture starts at 0 of 7 parts with an uncounted synthetic module README. Tutor prose
streams after 60 ms, and the command approval appears after about 2 seconds. At 5 seconds, a single
directory-change notification publishes a snapshot containing all seven parts. The counter should
jump to 7 of 7 while the approval remains visible. The `ready` fixture starts with all seven parts.

## Tool adapter

The repository-level `.claude/launch.json` points compatible developer tooling at port 5199. It is
an optional preview adapter only: it does not contain the harness, ship in the app, configure the
Claude provider, or replace root `CLAUDE.md` repository guidance.

## Showcase page

`showcase.html` mounts the production course view mid-course with a scripted tutor. It exists for
the public landing site, which serves the built page from a subfolder and embeds it in an iframe so
a visitor can use the real interface before installing anything. The tutor there is a short script:
it replies in the order the protocol would, cannot read what the visitor typed, and says so in its
last reply. The page reads `?theme=light|dark` at load and accepts a
`{ type: "lerience:theme", theme }` window message afterwards, so the page around it can keep the
window's theme in step with its own.

`harness:build` writes both pages, with a relative asset base, to `dist/renderer-harness/`. The
landing site copies `showcase.html` and `assets/` from there; nothing in this folder ships in an
installer.
