# Lerience

Lerience is a local-first learning environment for structured, agent-guided courses. It
turns a supported, learner-installed tutor provider into a focused learn-by-building application:
course creation, onboarding, seminar dialogue, exercises, checks, progress, and recovery all live
in one desktop experience.

The public source and release repository is `sqmch/lerience`. The Windows product and executable
name are `Lerience`, with the stable application ID `io.github.sqmch.lerience`. Internal
`praxeum-*` protocol identifiers are compatibility seams rather than public branding and remain
unchanged.

> **Status:** pre-release source. Windows preview packaging and a learner-approved update path
> exist, but no artifact is an accepted public release. Provider policy, release
> signing custody, third-party notice/source review, and exact-artifact acceptance remain explicit
> gates.

## Product principles

- **Ordinary learner experience.** Learners do not install Node, learn Git, edit `PATH`, use a
  terminal, run localhost services, or operate a hosted control plane.
- **Learner-owned work.** Courses are ordinary folders with their own Git history. App updates do
  not silently rewrite course content or provider state.
- **Local authority.** Course files, transcripts, and tool execution remain on the learner's
  machine. There is no Lerience account or hosted backend.
- **Provider-owned clients.** Lerience discovers supported Claude Code or Codex installations. It
  does not bundle, download, update, or copy their executables, credentials, or configuration.
- **Fail-closed distribution.** App-owned runtime files are completely hashed. Updates require an
  application-owned Ed25519 signature plus exact artifact size and SHA-256 verification, and the
  learner still approves download and installation.

Provider support is experimental and subject to each provider's current product and authentication
terms. Architecture proof is not vendor permission; public distribution will not proceed while
that boundary is unresolved.

## Architecture

Lerience is an Electron and TypeScript application with three deliberate trust boundaries:

1. The sandboxed renderer displays local application and sanitized course content through a narrow,
   typed preload API.
2. The main process owns course access, session lifecycle, provider discovery, updates, and the
   deterministic application runtime.
3. Provider processes remain separately installed, provider-authenticated tools. Lerience supplies
   app-owned Git and course tooling without replacing the learner's provider home or account.

The internal [`course-engine/`](course-engine/) module is the canonical course format, tutor
protocol, schemas, and script implementation.

## Development

Requirements:

- Node.js 24
- pnpm 11.9.0
- Windows for the current packaging target; source validation is otherwise cross-platform by design

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

`pnpm check` runs both TypeScript configurations, the application and Course Engine tests, ESLint,
Prettier, the production build, and the synthetic
[renderer harness](dev/renderer-harness/README.md) typecheck/build. `pnpm audit:production` checks
the production dependency graph. Windows packaging additionally requires an explicit preview or
final application identity and an assembled target runtime; see
[the distribution guide](distribution/README.md).

## Documentation

- [Product and architecture specification](docs/SPEC.md)
- [Interface design](docs/DESIGN.md)
- [Current status and decision ledger](docs/STATUS.md)
- [Architecture decision records](docs/DECISIONS/)
- [Release operations](distribution/RELEASE-OPERATIONS.md)

## Project policy and license

Development and review expectations are in [CONTRIBUTING.md](CONTRIBUTING.md). Security reports
belong in the private reporting process described by [SECURITY.md](SECURITY.md), never in a public
issue.

The desktop source is licensed under the [MIT License](LICENSE). The independently licensed Course
Engine template retains its existing [MIT license](course-engine/template/LICENSE), and bundled
dependencies retain their own terms.
