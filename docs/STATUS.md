# Project status

Last reviewed: 2026-08-19

Lerience has accepted the private installer-only draft of its first unsigned Windows x64 community
release. Its five intentional uploads passed downloaded-byte signature and checksum verification,
corresponding-source validation, isolated install, installed-app verification, and uninstall.
No binary is public yet. Manual publication is the only remaining release action.

The exact earlier Setup package also passed a normal visible learner-path run on Windows: provider
discovery, course creation, tutor operation, and generated course material all worked without
developer tooling. Encrypted recovery of the release key has been confirmed outside both the
repository and the protected release environment; no private-key material or storage detail is
recorded here.

## What works

- Learners can create and reopen local courses through the desktop interface without installing
  developer Node, learning Git, or running a localhost service.
- Tutor sessions use supported Claude Code or Codex installations already owned and authenticated
  by the learner. Lerience does not bundle provider clients or copy provider credentials.
- The app-owned Windows runtime, Course Engine, Git capability, and npm tooling are assembled from
  pinned inputs and completely inventoried before packaging.
- The renderer is isolated behind a narrow preload API. Course labs run without network access and
  course files remain local.
- The Windows NSIS package is fail-closed on the committed Lerience identity, exact
  runtime manifest, third-party notices, and package inventory.
- Update checks use an app-owned Ed25519 signature and bind each artifact by filename, size, and
  SHA-256 digest. Download and installation remain learner-approved actions.

## Release boundary

The public product and repository name are Lerience. The Windows executable is `Lerience` and the
stable application ID is `io.github.sqmch.lerience`. Internal `praxeum:` IPC names,
`.praxeum.json`, `PRAXEUM_*` build variables, and the `praxeum-desktop` release-manifest product ID
remain compatibility seams rather than visible branding.

The protected signing environment, signing-key recovery, repository-owned release workflow,
reviewed `v0.0.1` tag, five-upload draft, downloaded-byte acceptance, and normal learner-path smoke
check are complete. The exact accepted hashes and honest limits are recorded in
[`distribution/evidence/v0.0.1-windows-x64.md`](../distribution/evidence/v0.0.1-windows-x64.md).
The only remaining release action is manual publication of that accepted draft.

The prior learner-path run occurred on the maintainer's normal Windows account rather than a clean
machine. Because the installer-only change does not alter application or provider code, that result
is accepted for this first community preview; clean-machine and additional-provider exercises
remain useful follow-up evidence rather than publication blockers.

The initial packages are intentionally unsigned at the operating-system level, so Windows may show
an unknown-publisher warning. The application-level manifest signature verifies Lerience update
artifacts but does not suppress or replace that warning.

## Validation

Run `pnpm check` for source changes. It includes publication hygiene, both TypeScript projects, the
renderer harness, application and Course Engine tests, ESLint, Prettier, and the production build.
Use `pnpm audit:production` and `pnpm audit:all` for dependency review.

Windows distribution additionally uses:

```text
pnpm runtime:assemble -- --output <windows-runtime-directory>
pnpm package:windows
pnpm distribution:inventory -- --root <unpacked-application-directory>
pnpm release:sign-manifest -- <explicit signing inputs>
```

Source checks and package verification are not clean-machine acceptance. Release evidence must name
the exact source tag and commit plus the hashes of the downloaded artifacts it accepted.
