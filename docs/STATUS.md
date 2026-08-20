# Project status

Last reviewed: 2026-08-20

Public unsigned Windows x64 community releases are available from
`https://github.com/sqmch/lerience/releases/latest`. The first five-upload release passed
downloaded-byte signature and checksum verification, corresponding-source validation, isolated
install, installed-app verification, and uninstall before its accepted draft was published unchanged.

The exact earlier Setup package also passed a normal visible learner-path run on Windows: provider
discovery, course creation, tutor operation, and generated course material all worked without
developer tooling. Encrypted recovery of the release key has been confirmed outside both the
repository and the protected release environment; no private-key material or storage detail is
recorded here.

The release machinery now also builds unsigned native DMGs for Apple Silicon and Intel Macs. Each
native job assembles and reproduces its reviewed runtime, inventories the `.app`, and runs the
packaged installation verifier. The workflow stages both DMGs beside Windows under one signed
manifest. Physical Gatekeeper and learner-path acceptance remains a release evidence step. An
Intel Mac run is still required before the Intel DMG can be published.

## What works

- Learners can create and reopen local courses through the desktop interface without installing
  developer Node, learning Git, or running a localhost service.
- Tutor sessions use supported Claude Code or Codex installations already owned and authenticated
  by the learner. Lerience does not bundle provider clients or copy provider credentials.
- The app-owned Windows x64, macOS arm64, and macOS x64 runtimes, Course Engine, Git capability, and
  npm tooling are assembled from pinned inputs and completely inventoried before packaging.
- The renderer is isolated behind a narrow preload API. Course labs run without network access and
  course files remain local.
- The Windows NSIS package and both native Mac DMGs are fail-closed on the committed Lerience
  identity, exact platform runtime manifest, third-party notices, and package inventory.
- Update checks use an app-owned Ed25519 signature and bind each artifact by filename, size, and
  SHA-256 digest. Download and installation remain learner-approved actions. After that approval,
  installed Windows builds hand the verified package to NSIS silently and request an app restart;
  native installed-upgrade acceptance of that handoff remains required before release.

## Release boundary

The public product and repository name are Lerience. The Windows executable is `Lerience` and the
stable application ID is `io.github.sqmch.lerience`. Internal `praxeum:` IPC names,
`.praxeum.json`, `PRAXEUM_*` build variables, and the `praxeum-desktop` release-manifest product ID
remain compatibility seams rather than visible branding.

The protected signing environment, signing-key recovery, reviewed first-release tag, historical
five-upload Windows releases, downloaded-byte acceptance, normal Windows learner-path smoke check,
and publication are complete. The unified repository-owned workflow stages seven uploads for the
next desktop release: Windows EXE, Apple Silicon DMG, Intel DMG, one manifest and signature,
corresponding source, and checksums. Exact published hashes and honest limits belong in the
versioned records under [`distribution/evidence/`](../distribution/evidence/README.md).

The prior learner-path run occurred on the maintainer's normal Windows account rather than a clean
machine. Because the installer-only change does not alter application or provider code, that result
is accepted for this first community preview; clean-machine and additional-provider exercises
remain useful follow-up evidence rather than publication blockers.

The initial packages are intentionally unsigned at the operating-system level. Windows may show an
unknown-publisher warning. macOS Gatekeeper may block the first launch of the downloaded app; the
learner must first try to open it, then explicitly approve it with **Open Anyway** under System
Settings > Privacy & Security, following
[Apple's override instructions](https://support.apple.com/102445). The application-level manifest
signature verifies Lerience update artifacts but does not suppress either operating-system warning.

## Validation

Run `pnpm check` for source changes. It includes publication hygiene, both TypeScript projects, the
renderer harness, application and Course Engine tests, ESLint, Prettier, and the production build.
Use `pnpm audit:production` and `pnpm audit:all` for dependency review.

Native distribution additionally uses:

```text
pnpm runtime:assemble -- --output <windows-runtime-directory>
pnpm package:windows
pnpm runtime:assemble -- --output <macos-arm64-runtime-directory>
pnpm package:desktop -- --target darwin-arm64
pnpm runtime:assemble -- --output <macos-x64-runtime-directory>
pnpm package:desktop -- --target darwin-x64
pnpm distribution:inventory -- --root <unpacked-application-directory>
pnpm release:sign-manifest -- <explicit signing inputs>
```

Source checks and package verification are not clean-machine acceptance. Release evidence must name
the exact source tag and commit plus the hashes of the downloaded artifacts it accepted.
