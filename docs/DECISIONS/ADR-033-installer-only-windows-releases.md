# ADR-033 - Windows community releases are installer-only

Date: 2026-08-19 - Status: accepted

Amends ADR-022 and ADR-024 for the supported Windows release surface.

## Decision

Lerience publishes one Windows x64 application package: the versioned per-user NSIS installer.
The build, signed release manifest, staging scripts, release workflow, checksums, evidence, and
public documentation all describe that single application artifact.

The manifest schema may continue to recognize historical or future package types, but the Windows
community release pipeline emits only `Lerience-Setup-<version>-x64.exe`. GitHub's source snapshots,
the corresponding-source archive, signed manifest, signature, and checksum file are supporting
records rather than additional application variants.

## Why

The Portable wrapper duplicated the complete application at roughly the same download size as the
installer while adding a second package, update behavior, verification path, release asset, and
support choice. Lerience is designed for an ordinary learner who installs a desktop application;
the no-install variant did not serve a demonstrated need.

Removing it before the first public release keeps the supported surface small. It does not remove
the portable Git payload used internally by the app-owned runtime; that separately reviewed runtime
component remains governed by the supply ledger and its upstream licenses.

## Rejected

- Publishing both wrappers because the build tool can produce both.
- Hiding Portable from the release notes while retaining it in the signed manifest or draft assets.
- Removing Portable only from the first draft without making the release pipeline reproducible.

## Reopens if

Real learner demand demonstrates a supported no-install use case that justifies its additional
update, verification, documentation, and support surface.
