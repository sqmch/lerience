# ADR-022 - App-owned cross-platform runtime

Date: 2026-08-14 - Status: accepted in part; provider and Node ownership superseded by ADR-025,
source and release mechanics amended by ADR-023/024

> Historical decision record. ADR-025 now owns the runtime split: Lerience retains the Course
> Engine, npm/course tooling, and Git capability, reuses Electron's Node, and discovers
> provider-owned Claude Code/Codex installations.

## Decision

M5 uses one distribution architecture for Windows and macOS. Windows x64 is the first
acceptance target, but it is not a Windows-only implementation: each installer carries a native,
platform-and-architecture-specific runtime behind the same app-owned layout and provider-neutral
interfaces. macOS arm64 and x64 follow through native macOS build jobs, not by cross-compiling
the final application on Windows. Trusted OS signing/notarization is deferred under ADR-024.

The application owns every dependency needed to create and teach a course:

- the immutable internal Course Engine template defined by ADR-023;
- a portable Git distribution;
- an official Node.js runtime and the pinned npm CLI;
- the native Claude CLI carried by the pinned Claude Agent SDK; and
- a pinned native Codex CLI/App Server distribution.

Native executables and the Course Engine template live outside the ASAR under
`process.resourcesPath`. `src/main/runtime-layout.ts` is the single module that maps the current
build target to those resources. Course creation, provider readiness, provider login, and tutor
sessions receive exact paths through their existing seams. A packaged build never falls back to
a host `PATH`, a sibling checkout, an installed desktop client, or a learner-managed runtime.
Development keeps explicit injected fallbacks so contributors can run the source checkout.

The runtime has a build-time manifest recording its target, component versions, sources,
licenses, checksums, and engine revision. Runtime assembly verifies every download against an
approved checksum. Release acceptance verifies the assembled manifest and required files. The
application does not download or independently update these components at runtime; they move as
one versioned application update.

Provider authentication remains canonical under ADR-021. Child processes inherit the learner's
normal environment with only app-owned tool directories prepended to `PATH`. Lerience never
replaces `HOME`, `USERPROFILE`, `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, credential files, or provider
settings. Direct executable injection is preferred wherever a vendor interface supports it.

## Distribution targets

| Target | Artifact | Initial trust gate | M5 order |
| --- | --- | --- | --- |
| Windows x64 | unsigned per-user NSIS plus optional portable archive | app-signed release manifest; OS warning accepted | first acceptance target |
| macOS arm64 | unsigned DMG or ZIP | app-signed release manifest; documented Gatekeeper override | required follow-on |
| macOS x64 | unsigned DMG or ZIP | app-signed release manifest; documented Gatekeeper override | required follow-on |
| Windows arm64 | separate native installer | same release-manifest verification | supported by the architecture; schedule after demand/QA hardware |

Separate macOS artifacts keep native provider payloads and platform behavior inspectable. A
universal binary can be reconsidered after both native artifacts pass, but is not the first
release shape.

## Release boundary

`electron-builder` is the packaging layer. Production builds set a stable product/application
identity, include runtime assets through `extraResources`, and publish immutable versioned
artifacts. ADR-024 owns the user-approved update flow: the app verifies a detached
Ed25519-signed manifest and artifact digest before Windows installer launch, and provides a
guided package-open flow on unsigned macOS. OS signing is an optional later promotion gate, not
an M5 prerequisite.

Uninstall removes application-owned files only. It does not remove courses, provider auth/config,
or learner-created content. Existing-course engine migration is a separate explicit,
app-conducted operation with its own safety design; installing an app update never silently
rewrites a course repository.

## Why

An installer that still depends on Git, Node, a sibling repository, or a separately installed
provider client does not meet the product promise. A Windows-only path layer would make macOS a
rewrite exactly where native binaries and provider behavior differ most. One deep runtime module
keeps those differences below stable course/provider interfaces while native release jobs keep
platform-specific behavior explicit.

## Rejected

- Treating an unsigned developer-directory build as release proof; M5 still requires an exact
  packaged artifact and clean-machine acceptance under ADR-024.
- Downloading runtimes during first launch.
- Depending on system package managers, terminal setup, or host `PATH`.
- Copying or isolating provider credentials into app-owned homes.
- One runtime updater per bundled component.
- Cross-building and claiming macOS acceptance without native clean-Mac QA.
- Automatically changing existing course history during an app update.

## Reopens if

A vendor does not permit redistribution, Codex App Server compatibility cannot be pinned safely,
or real installer-size/update economics make whole-app delivery untenable. The response is to
revisit that component or provider, not to restore an undocumented host dependency. OS signing
can be added under ADR-024 without reopening the app-owned runtime layout.
