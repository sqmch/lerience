# Runtime supply inputs

`runtime-ledger.json` is the reviewed input contract for Lerience-owned release resources. It pins
the portable Git and npm inputs and binds accepted native builds to complete-tree hashes. The
internal Course Engine is hashed into the emitted runtime manifest from its repository-owned
module. Bumps are deliberate source changes followed by native assembly and reproducibility proof;
clean-machine acceptance remains a separate release gate. The assembler never asks a registry for
"latest".

The ledger covers Windows x64 and both native Mac targets. Windows x64, macOS arm64, and macOS x64
have separate accepted complete-tree hashes for Course Engine, Git, and npm. Assembly fails closed
when the current native tree differs from its reviewed target record.
The npm assembly deliberately omits package-manager-generated `node_modules/.bin` wrappers: they
contain checkout-specific paths, are not part of npm's published payload, and are not used by the
packaged runtime.

Standalone Node, Claude, and Codex are deliberately absent under ADR-025:

- Electron is the JavaScript runtime. The assembler writes small `node`/`npm` shims that invoke the
  installed Electron executable in Node mode.
- Claude Code and Codex are provider-owned installations discovered by the app. Their binaries are
  not supply-ledger components, app resources, or independently updated payloads.
- The Claude Agent SDK remains a production integration library, while pnpm explicitly ignores its
  optional native CLI packages. The first packaged artifact must independently inventory this.

Supply decisions and gates:

- `GIT-PAYLOAD-DECISION.md` accepts the complete reviewed Dugite Native payload on Windows and
  macOS; custom pruning is forbidden without an upstream build profile and a new native acceptance
  matrix.
- `THIRD-PARTY-NOTICES.md` records packaged-library and font notices plus exact source revisions for
  payloads with corresponding-source delivery. A public release packages those notices, ledgers,
  checksums, and exact source archives into one versioned corresponding-source archive beside the
  desktop packages. `release-source-ledger.json` pins their archive URLs, byte lengths, and SHA-256
  digests; `pnpm release:collect-sources` fails closed on any changed byte.
- Renderer fonts come only from the exact locked Fontsource packages; the installed notice carries
  each family copyright and the full common OFL-1.1 text.
- npm redistribution must include its full license and dependency notices/source instructions.
- `PROVIDER-READINESS.md` controls policy and installed-version/capability acceptance separately
  from app-owned payload integrity.
- `pnpm distribution:inventory --root <unpacked-package>` must pass for every release artifact and
  fails if a provider binary, provider-native package, or standalone Node binary returns.

These are release evidence gates, not reasons to copy provider installations or credentials.

Release promotion, rollback, emergency feed disablement, and key rotation are defined in
[`RELEASE-OPERATIONS.md`](RELEASE-OPERATIONS.md). Source publication and binary acceptance remain
separate gates even though this repository owns both surfaces. The [`evidence/`](evidence/) policy
defines what enters a public release-acceptance record.

## What a packaged launch verifies

A packaged launch checks its own runtime before the app starts, behind the "Checking installation"
window. `inspectPackagedRuntime` reads the installed `runtime/manifest.json` and confirms that it
belongs to this app version and this platform/architecture, that every critical path is declared,
that each of the three components (Course Engine, Git, npm) matches its recorded complete-tree
digest, that the critical files are ordinary non-symlinked files of the recorded size, mode and
SHA-256, and that the payload as a whole matches its recorded file count and tree hash. Anything
short of that shows a repair dialog and quits; the app never starts on a half-installed runtime.

This is a completeness and corruption gate, not an anti-tamper boundary. It catches a truncated or
interrupted install, an antivirus quarantine that removed a file, a partly-applied update, and a
manifest from a different build. It cannot defend against someone who can already write to the
installation directory: a per-user NSIS install and the app's own data live in the same trust
domain, so an attacker with that access can replace the executable itself. OS-level code signing is
the control for that, and ADR-024 defers it.

The first launch of an installed build reads and hashes the Windows x64 payload's 2 355 files and
about 125 MiB. Reads run in a small pool (`HASH_CONCURRENCY`) because the wait is disk rather than
SHA-256. After a successful inspection, ordinary startup caches each payload digest against the
exact manifest/install identity and the file's device, inode, size, mode, modification time and
change time (ADR-035). An unchanged launch still walks the complete tree and directly hashes the
seven critical files, but it does not reread every file's contents. A missing or invalid cache
falls back to the complete check, and the app writes a replacement only after that check passes.

The headless release-acceptance contract never uses the cache: `Lerience.exe
--verify-installation` opens no window, starts no provider, touches no app data, hashes every
payload file, and reports package-owned facts through its exit code.

## Native desktop package scaffold

The non-publishing scaffold is pinned in `electron-builder.config.mjs`. It requires repository-owned
identity inputs, an explicit `win32-x64`, `darwin-arm64`, or `darwin-x64` target, and an exact
matching assembled runtime; it has no publish target. ADR-032 fixes the public Lerience identity
while the rehearsal workflow uses isolated `Lerience Preview` values. `pnpm package:windows` builds
the per-user NSIS target. The desktop builder creates separate unsigned DMGs for `darwin-arm64` and
`darwin-x64`. Its `--dir` mode retains the unpacked application. Every command rejects a non-native
build host, runs the same focused runtime preflight, and applies the same 600 MiB post-pack inventory
to physical files and ASAR contents. Preflight repeats CourseCreator and ADR-027 Course Engine
update acceptance with the exact assembled Git/runtime; a developer-machine Git success is not
package proof. The Mac package enables `LSFileQuarantineEnabled`, so DMGs downloaded by the app are
handed back to macOS Gatekeeper; both native jobs assert the key in the packaged `Info.plist`.

The runtime ledger pins the accepted npm input, while the lockfile policy applies the three-day
dependency quarantine and CI repeats the frozen-install checks.

`pnpm release:generate-key` creates an Ed25519 pair only when given an external private-key path and
a repository-owned public-key path; it refuses overwrites. `pnpm release:sign-manifest` is a
separate offline-key step. It consumes existing artifacts and an Ed25519 private key outside the
repository; it does not generate a key or upload anything. ADR-024 and `RELEASE-OPERATIONS.md`
define the remaining custody and promotion gates.

`pnpm release:stage-desktop` verifies the signer key against the public key compiled into the app,
the signature over the exact manifest bytes, all three versioned packages, release notes, and the
full corresponding-source set. It emits exactly seven uploads: Windows x64 EXE, macOS arm64 DMG,
macOS x64 DMG, the manifest and signature, one combined corresponding-source archive, and
`SHA256SUMS`. Release notes come from the tagged repository document. The signed updater selects
the package matching the installed platform and architecture.

`.github/workflows/desktop-release-candidate.yml` runs that chain from one existing annotated tag on
reviewed `main`. It validates the source once, builds Windows x64, macOS arm64, and macOS x64 on
matching native runners, and signs one combined manifest only after all three jobs pass. Its default
result is a short-lived Actions bundle. Its optional drafting job fails if the repository is private
and can create only a **draft** in the canonical public source repository. The `release-signing`
and `release-publishing` environments protect signing and draft creation; the latter uses the
job-scoped `GITHUB_TOKEN`, not a cross-repository secret. The workflow contains no release-publish
command.

## Update-channel build inputs

The non-promotable rehearsal compiles the repository-owned feed URL and committed preview public
key so the exact package crosses the same build-time trust boundary; it creates no GitHub Release.
Other development previews may still compile with neither input and make no update request. A release build supplies
both `PRAXEUM_RELEASE_REPOSITORY_URL` (the exact
`https://github.com/<owner>/<repository>/releases/` root) and
`PRAXEUM_RELEASE_PUBLIC_KEY_PATH` (an Ed25519 public-key PEM). Supplying only one, a non-GitHub
location, a non-Ed25519 key, or any private-key PEM fails the build. The resulting fixed feed URLs
and normalized public key are compiled into the main process; they are never renderer/runtime
configuration. ADR-024 and the updater tests define this boundary.

This repository's GitHub Releases page is the feed. Both rehearsal and
release workflows derive that URL from `github.repository`, so the clean public import and final
repository name are picked up by its builds rather than frozen in workflow source. While this
development archive remains private, rehearsal packages have no anonymous feed and no release is
created.
