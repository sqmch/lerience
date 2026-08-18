# Project status

Last reviewed: 2026-08-18

Lerience has a private draft of its first unsigned Windows x64 community release. The exact draft
packages passed signature, checksum, portable, isolated install, installed-app verification, and
uninstall checks. No binary is public yet because the final learner-path smoke check, signing-key
recovery confirmation, and manual publication are still pending.

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

The protected signing environment, reviewed `v0.0.1` tag, repository-owned release workflow, draft
creation, and downloaded-byte package acceptance are complete. Before publication, the first release
still requires:

1. confirmation that the signing key has an encrypted offline recovery copy;
2. one normal learner-path smoke check of the exact package on a clean Windows account or machine,
   including provider discovery and course creation without developer tooling; and
3. manual publication of the accepted draft.

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
