# Project status

Last reviewed: 2026-08-18

Lerience has a protected pipeline for its first unsigned Windows x64 community release. The earlier
draft passed package checks but remained unpublished and is being replaced with a minimal six-upload
layout. No binary is public yet.

## What works

- Learners can create and reopen local courses through the desktop interface without installing
  developer Node, learning Git, or running a localhost service.
- Tutor sessions use supported Claude Code or Codex installations already owned and authenticated
  by the learner. Lerience does not bundle provider clients or copy provider credentials.
- The app-owned Windows runtime, Course Engine, Git capability, and npm tooling are assembled from
  pinned inputs and completely inventoried before packaging.
- The renderer is isolated behind a narrow preload API. Course labs run without network access and
  course files remain local.
- Windows NSIS and portable packages are fail-closed on the committed Lerience identity, exact
  runtime manifest, third-party notices, and package inventory.
- Update checks use an app-owned Ed25519 signature and bind each artifact by filename, size, and
  SHA-256 digest. Download and installation remain learner-approved actions.

## Release boundary

The public product and repository name are Lerience. The Windows executable is `Lerience` and the
stable application ID is `io.github.sqmch.lerience`. Internal `praxeum:` IPC names,
`.praxeum.json`, `PRAXEUM_*` build variables, and the `praxeum-desktop` release-manifest product ID
remain compatibility seams rather than visible branding.

The protected signing environment and repository-owned release workflow have been proved. Before
publication, the first release still requires:

1. a replacement reviewed `v0.0.1` tag and minimal draft, followed by downloaded-byte package
   acceptance of that exact candidate;
2. confirmation that the signing key has an encrypted offline recovery copy;
3. one normal learner-path smoke check of the exact package on a clean Windows account or machine,
   including provider discovery and course creation without developer tooling; and
4. manual publication of the accepted draft.

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
