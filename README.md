<div align="center">

<img src="build/icon.svg" alt="" width="88" height="88" />

# Lerience

**A real course from the AI you already pay for.**

Lerience is a free, open-source app for Windows and Mac that turns your own Claude Code or Codex
into a personal tutor. Tell it what you want to learn, agree on a course plan, and work through
lessons and exercises that adapt to your progress.

[Website and demo](https://lerience.com/) · [Install](#install) · [How learning works](#how-learning-works) · [Development](#development)

[![Latest release](https://img.shields.io/github/v/release/sqmch/lerience?label=release&labelColor=1c1c1c&color=8c8c8c)](https://github.com/sqmch/lerience/releases/latest) [![CI](https://github.com/sqmch/lerience/actions/workflows/ci.yml/badge.svg)](https://github.com/sqmch/lerience/actions/workflows/ci.yml) [![MIT License](https://img.shields.io/badge/license-MIT-8c8c8c?labelColor=1c1c1c)](LICENSE)

</div>

<img src="docs/images/course-view.png" alt="A sample programming course: modules on the left, the lesson in the middle, and a conversation with the tutor on the right." width="100%" />

Courses can cover history, interview preparation, programming, and other subjects. The tutor helps
you practise, brings back questions from earlier lessons, and records what you understood and what
still needs work. When you return, it uses that record to pick up where you left off.

## Install

You need [Claude Code](https://code.claude.com/docs/en/setup) or
[Codex](https://developers.openai.com/codex/cli) installed, with a Claude or ChatGPT plan that
supports the corresponding tool. Lerience uses that plan's allowance. It does not install or update
these tools, and there is no separate Lerience subscription or account.

Download the installer for your computer from the
[latest release](https://github.com/sqmch/lerience/releases/latest):

| Computer                    | Download                           |
| --------------------------- | ---------------------------------- |
| Windows 10 or 11, x64       | `Lerience-Setup-<version>-x64.exe` |
| Mac with Apple Silicon      | `Lerience-<version>-arm64.dmg`     |
| Mac with an Intel processor | `Lerience-<version>-x64.dmg`       |

On a Mac, **About This Mac** tells you which chip or processor you have.

1. Install Lerience. On Windows, run the installer. On Mac, open the DMG and drag Lerience to
   Applications.
2. Open the app and choose your tutor. Lerience detects the installed client and lets you use the
   provider's own sign-in flow if needed.
3. Choose **New course**, give it a name, and start the conversation about what you want to learn.
   Lerience creates the course folder for you. You do not need to prepare a folder of documents.

> [!IMPORTANT]
> These are early community releases without trusted operating-system signatures. Windows may show
> an unknown-publisher or SmartScreen warning. On Mac, first try opening the app, then use
> **System Settings > Privacy & Security > Open Anyway** if Gatekeeper blocks it.
> See [Apple's instructions](https://support.apple.com/102445).
> Lerience verifies its own update downloads, but that does not remove these OS warnings.

## How learning works

1. **Plan together.** The tutor asks about your goal, background, available time, and any deadline.
   You review and approve the course plan before it writes the first lesson.
2. **Study and practise.** Each module combines a lesson, examples, exercises, and discussion.
   The tutor offers hints and feedback, then asks you to explain ideas in your own words and apply
   them to a new example. Lessons can include diagrams and interactive pictures when they help.
3. **Adapt the next step.** Future modules begin as an outline. The tutor writes each one when you
   reach it, using your progress to decide where you need more practice or a bigger challenge.
   Completed lessons remain available to revisit.
4. **Return and review.** A learning journal records each session. Review questions come back at
   intervals based on your previous answers, and the app can recover interrupted sessions.

The practice depends on the subject. A history course might use questions and short essays.
Interview preparation can use a job description and practice interviews. Programming courses
provide a starting project and automated tests: you write code in your own editor and run the
checks from Lerience. The programming tutor's instructions forbid filling in your solution.

## Your course and your data

Lerience saves each course as ordinary files on your computer: the plan, lessons, exercises,
progress, review questions, and learning journal. You can read and back up those files.
The app organises them for you; Git knowledge and a separate Node.js installation are not required
to use Lerience.

Chat transcripts and app settings are stored separately in the app's local data directory. Copying
a course folder preserves its materials and learning record, but does not transfer the full chat
history or settings. There is no built-in cloud sync.

Tutoring requires an internet connection. Your chosen provider receives your messages and the
course content used as context. Lerience has no backend for storing your courses or relaying tutor
conversations. Sign-in, credentials, billing, and usage terms remain with the provider.

For technical users, each course also has Git history and can be opened directly in Claude Code or
Codex. The [Course Engine](course-engine/) contains the teaching instructions, file format, and
scripts that manage the record and review schedule. Installing an app update does not silently
replace an existing course's materials or teaching instructions.

## Limits

- **Lessons and feedback can be wrong.** Teaching instructions and automated checks catch some
  mistakes, but they do not guarantee factual accuracy or a correct assessment of your understanding.
  Question explanations and verify important facts against reliable sources.
- **Assessment varies by subject.** Programming exercises can be checked with automated tests.
  Essays and other written answers rely on the AI tutor's judgement, which is less certain.
  The tutor should explain this tradeoff when planning a course without runnable checks.
- **Provider integrations are experimental.** They depend on compatible installed clients and the
  providers' current access rules and usage limits. Lerience does not promise unlimited tutoring
  or compatibility with every client version.

## Development

The app is built with Electron, TypeScript, and React. The main process manages courses, tutor
sessions, installed clients, and updates. The renderer accesses those capabilities through a
restricted preload API; interactive course visuals run without network or file access.

The [Course Engine](course-engine/) is maintained in this repository and copied into new courses.
It owns the course format, teaching instructions, validation, exercise checks, and review scheduling.

For development, use Node.js 24 and pnpm 11.9.0:

```sh
git clone https://github.com/sqmch/lerience.git
cd lerience
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` opens the Electron app. `pnpm harness:dev` runs the production renderer against a
simulated tutor at `http://localhost:5199`; see the
[renderer harness guide](dev/renderer-harness/README.md).

Run `pnpm check` for publication hygiene, type checks, application and Course Engine tests,
linting, formatting, and production and harness builds. Contribution and dependency-audit
requirements are in [CONTRIBUTING.md](CONTRIBUTING.md). Native packaging requires a matching host
and explicit runtime inputs; see the [distribution guide](distribution/README.md).

## Further reading

- [Product and architecture specification](docs/SPEC.md)
- [Interface design](docs/DESIGN.md) and [architecture decisions](docs/DECISIONS/)
- [Tutor instructions](course-engine/template/CLAUDE.md) and
  [course file format](course-engine/template/docs/FORMAT.md)
- [Release operations](distribution/RELEASE-OPERATIONS.md)

## Contributing, security, and license

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development and review workflow. Report security
issues privately through [SECURITY.md](SECURITY.md).

The desktop source and Course Engine template are MIT licensed. See [LICENSE](LICENSE) and the
[Course Engine license](course-engine/template/LICENSE). Bundled dependencies retain their own
terms.
