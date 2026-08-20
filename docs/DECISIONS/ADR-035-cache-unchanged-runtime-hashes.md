# ADR-035 — Cache unchanged runtime hashes

Date: 2026-08-20 · Status: accepted

Amends ADR-022's packaged-runtime verification mechanics. The ownership and release boundaries in
ADR-022, ADR-024 and ADR-025 are unchanged.

## Context

An ordinary packaged launch walked and SHA-256 hashed the complete app-owned runtime before opening
the dashboard. The Windows x64 payload is 2,355 files and about 125 MiB. PR #13 reduced repeated
work to one pooled traversal, but a cold packaged verification still took 13.6 seconds on the
maintainer's Windows machine. Repeating that disk read on every launch is disproportionate to the
gate it implements.

The gate detects incomplete installation, accidental corruption, antivirus quarantine and a
runtime from another application build. It is not an anti-tamper boundary. A user who can replace
runtime files can also replace the per-user executable and any app-data cache.

## Decision

Ordinary packaged startup keeps a private runtime-hash cache in app data.

1. The cache identity binds its schema, resolved runtime root, application version, target platform
   and architecture, and the SHA-256 of the exact runtime manifest bytes. A mismatch discards every
   cached hash.
2. Each file hash is reusable only while device, inode, size, permission mode, nanosecond
   modification time and nanosecond change time all match the successful inspection that recorded
   it. Startup still walks the complete tree. New or metadata-changed files are hashed; missing and
   added entries still change the complete-tree result and fail the gate.
3. The seven critical Course Engine, Git and npm files remain directly hashed on every launch even
   when their payload-tree hashes came from the cache.
4. A missing, malformed or unreadable cache degrades to a complete inspection. The app replaces the
   cache only after the runtime passes, using a private temporary file and same-directory rename. A
   cache write failure does not turn a valid installation into a startup failure.
5. `--verify-installation` never reads or writes this cache. Release jobs and downloaded-byte
   acceptance continue to hash every payload file from the exact packaged executable.

The accepted tradeoff is that silent corruption of a noncritical file which changes no recorded
filesystem metadata can retain its earlier hash. Ordinary interrupted writes, replacement,
quarantine, addition and deletion change at least one recorded value. This small residual risk is
consistent with the declared corruption boundary and preferable to making every learner reread the
whole runtime on every launch.

## Rejected

- **Remember only that a version passed.** A single success flag would miss later deletion,
  quarantine and ordinary file replacement.
- **Hash the whole runtime after showing the dashboard.** That still spends the disk and antivirus
  cost on every launch and starts the app before its installation gate has settled.
- **Use cached hashes in release acceptance.** The headless verifier is evidence about exact
  packaged bytes and must always perform the complete inspection.

## Reopens if

Real installations show metadata-preserving corruption, metadata traversal itself remains visibly
slow, or trusted OS signing changes the useful division between installer, operating-system and
application verification.
