# Portable Git payload decision

Decision: retain the complete reviewed Dugite Native payload for M5.1. Do not maintain a Lerience
fork or delete individual binaries from it.

## Why full Dugite is the safe baseline

Lerience directly uses a narrow Git surface today:

- course creation: `init --initial-branch`, `add --all`, and `commit`;
- recovery and doctor: `status --porcelain`, `rev-list`, and `log`;
- course QA: `ls-files` and `check-ignore`;
- the local tutor can use ordinary Git from the same runtime-owned PATH while working in a
  learner-owned course.

Dugite Native is already an application-oriented reduction: it omits Perl, Tcl/Tk, translations,
and dependencies on system libraries. Its remaining executables and libraries are a tested unit.
Pruning undocumented files would make ordinary Git subcommands, HTTPS transport, credential
handling, or recovery fail according to implementation details that can change on each native
upgrade. That creates a private distribution fork without a supported compatibility contract.

The Windows x64 payload measured on 2026-08-15 is 384 files and 119,142,397 bytes (113.62 MiB).
The largest optional-looking features are Git Credential Manager (about 18.24 MiB) and Git LFS
(about 12.15 MiB), but deleting either does not remove all of its transitive libraries and does not
produce a vendor-tested payload. The size is accepted for the M5 Windows baseline. Future reduction
requires a reproducible upstream build profile, a complete command/capability matrix, HTTPS and
recovery tests, a new supply-ledger hash, and clean-machine proof.

## Redistribution boundary

`THIRD-PARTY-NOTICES.md` records exact source revisions and the public-release source obligation.
The complete component tree remains checksum-pinned by `runtime-ledger.json`; no release task may
silently prune or replace it to meet a size target.
