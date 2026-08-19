# Lerience

<img src="build/icon.svg" alt="Lerience icon" width="96" height="96" />

Lerience is an open-source desktop app for learning a skill with a frontier model as your tutor —
not in a chat window, but in a structured course that is generated for you, module by module, and
that keeps adjusting to how you are actually doing.

The whole course is an ordinary folder on your computer. Your own installed Claude Code or Codex
client does the teaching. A small set of markdown guidance files turns that general-purpose agent
into a tutor with a protocol: it interviews you, drafts a curriculum you review, writes each lesson
and exercise when you reach it, checks your work, keeps a journal of where you struggled, and
builds the next module with that in mind. Lerience is the interface and the deterministic machinery
around that folder. There is no Lerience account, no hosted backend, and nothing to run in a
terminal.

> **Status:** first Windows community preview (v0.0.1). Releases are unsigned at the
> operating-system level, so Windows may show an unknown-publisher warning. Lerience separately
> verifies its own updates with a signed manifest. Provider support is experimental; see
> [Honest limits](#honest-limits).

## Why this exists

Frontier models are genuinely good to learn from. Anyone who has spent an afternoon asking one to
explain something, probe their understanding, and review their attempts has felt it. But the
ordinary way of getting at that — a chat window — loses almost all of it between sessions. There is
no curriculum, no memory of what you found hard last week, no exercises that are checked, no reason
for the model to hold back the answer, and nothing that accumulates into a course.

People who are comfortable with developer tooling have found the other way: put an agent in a
folder, give it instructions in a markdown file, let it write and run things, and keep the state in
files and Git. That works remarkably well. It is also only accessible if you already understand
agents, terminals, repositories, and the vocabulary around them — which rules out most of the
people who would benefit.

Lerience is the middle path. It takes the folder-plus-guidance-files way of working, which is
where the real value is, and wraps it in a desktop app that an ordinary learner can install and use.
The model stays at the centre and keeps its full capability. The structure comes from the files.
The app makes it usable without any of the setup.

## How it works

A Lerience course is a folder. Inside it:

- **`CLAUDE.md` — the tutor protocol.** Plain markdown telling the model how to behave as a tutor:
  how to run the onboarding interview, how to open and close a session, how to generate a module,
  how to grade, when to reveal hints, what never to do. Every rule in it came from a real course
  with a real learner. `AGENTS.md` points agent-agnostic clients at the same file.
- **`COURSE.md` — the spine.** Your learner profile, the phases, the module arc, pacing, and where
  the gates between phases fall. The tutor drafts it from the interview; you review it and push
  back before anything is built. The spine is stable once agreed.
- **`curriculum/NN-name/` — one directory per module**, created only when you reach it. Each has a
  `LESSON.md` (the actual teaching, written like a textbook chapter), a `BRIEF.md` (the task), a
  runnable `scaffold/` with the load-bearing parts left as gaps, `checks/` you run yourself, three
  sealed hints of increasing specificity, retrieval questions, and optionally a visual.
- **`tutor/` — the durable learning record.** `progress.json` (module status, hint usage, check
  attempts, gate results), `quiz-bank.json` (spaced-retrieval items with real intervals), and
  `journal.md`, where the tutor writes after every session what was covered and, specifically,
  where you struggled or shone. The repo remembers so the model doesn't have to.
- **Deterministic scripts** (`doctor`, `validate`, `qa`, `quiz`) that the tutor runs for the parts
  that should not depend on the model's judgement: checking state is consistent, validating
  module formats, doing the spaced-repetition arithmetic, and proving a module's checks pass
  against a reference solution and fail against the bare scaffold before you ever see it.

The app supplies what the folder can't: a designed chat with the tutor, a reading pane for the
lesson and brief, a view of your progress and record, one-click course creation, session recovery
when a conversation is interrupted, and a sandboxed stage for interactive visuals. It also
discovers your installed provider client and supplies its own Git and Node runtime so you never
install any of that.

## What makes this kind of learning different

**It adapts to you, continuously — not once at the start.** The spine is fixed when you agree to
it, but the content is not. Only the current module exists in full at any moment; the next one is
written when you get there, calibrated to how the previous one actually went. If you passed the
checks first try with no hints, the scaffold gaps get wider. If you needed the last hint, an
intermediate stepping-stone task appears. The journal carries forward what confused you, what
connected to your background, which tangents you raised. Every session opens with a short recall
quiz of the items that are actually due for you. Hints are revealed one level at a time, and only
when you ask or are clearly stuck. This is the part that a chat window cannot do and a fixed
course cannot do, and that otherwise only a personal mentor does. It is, in our experience, the
single most valuable property of learning this way.

**The model teaches; it doesn't do the work for you.** The prime directive in the protocol is
*never write solution code*. The learning happens in the gap between the scaffold and the passing
checks. The tutor explains, asks, points at the line, and reveals the next hint — it does not fill
the gap, even when asked. Lessons are delivered as proper chapters you read, then discussed, rather
than compressed into chat. Phase gates require you to genuinely pass before advancing. Assessment
is honest: "that passes, but why is this approach a problem at scale?" is the tone, not praise.

**It builds visuals when a picture actually teaches.** Frontier agents are good at building
custom things, and Lerience uses that instead of fencing it off. When a module's core concept is
spatial or dynamic, the tutor can claim one of the polished interactive labs shipped with the app,
or write a self-contained interactive visualization of its own — derived from the lesson it just
wrote, using the same examples and vocabulary — and embed it in the chapter. Mid-session, when a
specific misconception surfaces, it can retarget that visual at it. The app renders these as
first-class surfaces in a sandbox with no network and no file access. The design intent
([ADR-012](docs/DECISIONS/ADR-012-the-app-is-a-stage.md)) is to be a stage for what the model can
build rather than a fixed set of widgets, so the product grows as the models do.

**Your course is yours.** It is files and Git history on your disk. You can read every rule the
tutor follows, see exactly what it recorded about you, and open the folder directly in Claude Code
or Codex without Lerience at all. App updates never silently rewrite course content or your record.

## Principles

- **Ordinary learner experience.** No Node, Git, `PATH`, terminal, localhost service, or hosted
  control plane. Install, connect your provider, start a course.
- **The model at full capability.** The tutor is a real agent in a real folder. It writes
  scaffolds, runs checks, and executes the QA ritual. A typed-tools-only tutor could not run the
  protocol, which is why there is no hosted, API-metered version.
- **Structure from files, not from the app.** The course format, tutor protocol, and scripts live
  in the course folder as the [Course Engine](course-engine/). The app is a lens on those files, a
  conductor for the agent and scripts, and a stage for course-authored visuals — it owns none of
  the content.
- **Learner-owned work and local authority.** Course files, transcripts, and tool execution stay
  on your machine. There is no Lerience account or backend.
- **Provider-owned clients.** Lerience discovers your installed Claude Code or Codex client. It
  does not bundle, download, update, or copy their executables, credentials, or configuration.
  Sign-in, billing, and terms stay with the provider.
- **Fail-closed distribution.** App-owned runtime files are completely hashed. Updates require an
  application-owned Ed25519 signature plus exact artifact size and SHA-256 verification, and you
  still approve download and installation.

## Honest limits

- **It is for learn-by-building domains where progress is machine-checkable.** Programming and
  adjacent technical skills fit naturally. If a topic can't produce runnable checks, the tutor is
  instructed to say so plainly rather than quietly degrade — and you should expect less from it.
- **You need your own frontier-model subscription** and a compatible, separately installed Claude
  Code or Codex client. Lerience is free and open source, but the tutor is not.
- **Quality is the model's quality.** The guidance files raise the floor considerably and the
  deterministic scripts catch a class of mistakes, but a generated module can still be wrong, and
  the tutor can still misjudge. The QA ritual exists because that happened.
- **Provider support is experimental** and subject to each provider's current product and
  authentication terms. Lerience claims no ownership of, or authorization beyond, those products.
- **Windows x64 only, unsigned, early.** This is a first community preview.

## Download

Windows x64 downloads are published on the
[GitHub Releases](https://github.com/sqmch/lerience/releases/latest) page. Choose the versioned
`Lerience-Setup-...exe` installer. You will also need Claude Code or Codex installed and signed in;
the app points you to the official installer if it finds neither.

## Architecture

Lerience is an Electron and TypeScript application with three deliberate trust boundaries:

1. The sandboxed renderer displays local application and sanitized course content through a narrow,
   typed preload API.
2. The main process owns course access, session lifecycle, provider discovery, updates, and the
   deterministic application runtime.
3. Provider processes remain separately installed, provider-authenticated tools. Lerience supplies
   app-owned Git and course tooling without replacing the learner's provider home or account.

The internal [`course-engine/`](course-engine/) module is the canonical course format, tutor
protocol, schemas, and script implementation. The public source and release repository is
`sqmch/lerience`; the Windows product and executable name are `Lerience`, with the stable
application ID `io.github.sqmch.lerience`. Internal `praxeum-*` protocol identifiers are
compatibility seams rather than public branding and remain unchanged.

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
- [The tutor protocol](course-engine/template/CLAUDE.md) and
  [course visuals](course-engine/template/docs/LABS.md)
- [Release operations](distribution/RELEASE-OPERATIONS.md)

## Project policy and license

Development and review expectations are in [CONTRIBUTING.md](CONTRIBUTING.md). Security reports
belong in the private reporting process described by [SECURITY.md](SECURITY.md), never in a public
issue.

The desktop source is licensed under the [MIT License](LICENSE). The independently licensed Course
Engine template retains its existing [MIT license](course-engine/template/LICENSE), and bundled
dependencies retain their own terms.
