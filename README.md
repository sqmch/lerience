# Lerience

<img src="build/icon.svg" alt="Lerience icon" width="96" height="96" />

Lerience is a desktop learning environment for people who want to learn by building with a
frontier-model tutor, not just ask one-off questions in a chat. It gives a supported,
learner-installed Codex or Claude Code client the durable structure of a real course: an onboarding
interview, a curriculum the learner reviews, substantial lessons, practical work, checks, graduated
hints, retrieval practice, progress, and recovery across sessions.

The course itself remains an ordinary folder on the learner's computer. Lerience supplies the
focused interface and deterministic Course Engine around it, while the learner's provider supplies
the tutor. There is no Lerience account, hosted backend, or separate developer setup.

The public source and release repository is `sqmch/lerience`. The Windows product and executable
name are `Lerience`, with the stable application ID `io.github.sqmch.lerience`. Internal
`praxeum-*` protocol identifiers are compatibility seams rather than public branding and remain
unchanged.

> **Status:** first Windows community preview. Releases are unsigned at the operating-system level,
> so Windows may show an unknown-publisher warning. Lerience separately verifies updates with its
> own signed manifest.

## Download

Windows x64 downloads are published on the
[GitHub Releases](https://github.com/sqmch/lerience/releases/latest) page. Choose the versioned
`Lerience-Setup-...exe` installer.

Lerience requires a compatible, separately installed Codex or Claude Code client. Provider
installation, sign-in, billing, and updates remain with the provider; Lerience never packages or
copies provider credentials.

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
terms. Lerience does not claim ownership of, or authorization beyond, those provider products.

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
