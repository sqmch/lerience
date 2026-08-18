# Release operations

Status: process defined and Lerience identity fixed; an external `preview-v1` key and committed
public key exist, but production custody is not yet accepted.

This runbook applies ADR-024's unsigned, learner-approved release model. Operating-system signing is
deferred, but application-level release authenticity is not.

## Roles and protected material

- The canonical public source repository owns code, reviewed inputs, workflows, public keys,
  evidence, and GitHub Releases.
- GitHub Releases in that repository hosts immutable versioned artifacts only after acceptance.
- The Ed25519 private key remains outside the source checkout and ordinary build artifacts. The
  release process may receive it only through a protected environment or offline signing step.
- At least one encrypted offline recovery copy must exist before the first public release. A
  GitHub-only secret with no recovery copy is not an acceptable key ceremony.
- Only the corresponding public key is committed and compiled into the app.

The preview key allows package/feed integration to be proved before production custody is accepted.
It does not waive the attended custody step: before the first public release, the maintainer must
create and test the encrypted offline recovery copy, record custody without recording secret bytes,
and import the private key into the protected release environment. Custody is not complete merely
because a key exists.

## Generate or replace the preview key

Run from the repository root in PowerShell. Choose a new versioned filename for every replacement;
the command refuses to overwrite either half and refuses any private-key path inside the checkout.

```powershell
$privateKey = Join-Path $env:LOCALAPPDATA "Lerience\release-keys\preview-v1-private.pem"
pnpm release:generate-key -- --private-key $privateKey --public-key distribution/release-public-key.pem
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls $privateKey /inheritance:r /grant:r "${identity}:(F)" "SYSTEM:(F)"
```

Record only the printed public-key fingerprint, never the private PEM. Confirm the ACL with
`icacls $privateKey`, verify a manifest signed with the private half against the committed public
half, and then create the encrypted offline recovery copy on separate media. A same-disk copy or a
GitHub secret is not an offline recovery copy.

Before any public release, replacement is simple: generate a new versioned pair, replace the
committed public key in a reviewed change, rebuild every preview artifact, and securely retire the
old private half after proving that no distributed build trusts it. After a public release, never
perform that direct replacement; use the bridge process under **Key rotation and compromise**.

## Protected GitHub environments

The production candidate workflow separates signing from same-repository draft creation:

- `release-signing` owns `RELEASE_PRIVATE_KEY_PEM`. Its value must be the private half matching
  `distribution/release-public-key.pem` and should require maintainer approval where the repository
  plan supports environment reviewers.
- `release-publishing` is an approval boundary for creating a draft. The drafting job receives only
  the job-scoped `GITHUB_TOKEN` with `contents: write` in the canonical repository; it owns no
  cross-repository or long-lived token.

Import or replace the signing secret only after verifying the local key fingerprint and offline
recovery copy. PowerShell can stream the key without printing it:

```powershell
Get-Content -Raw -LiteralPath $privateKey |
  gh secret set RELEASE_PRIVATE_KEY_PEM --env release-signing --repo <owner>/<source-repository>
```

Changing the key before the first public release requires a reviewed public-key commit, a rebuild,
and replacing this environment secret. Changing it after publication follows the bridge or
compromise procedure below. Configure both protected environments in the final canonical repository
before creating a release draft.

## Version and release layout

- Stable versions use strict `MAJOR.MINOR.PATCH` values in `package.json`.
- Git tags and GitHub releases use `vMAJOR.MINOR.PATCH`.
- `releases/latest/download/release-manifest.json` and `.sig` identify the latest candidate.
- Signed artifact filenames resolve only beneath `releases/download/vMAJOR.MINOR.PATCH/`.
- Published releases include both Windows package types when supported; omitting a target means the
  app offers no update for that installation type.

Required Windows assets:

```text
<Executable>-Setup-<version>-x64.exe
<Executable>-Portable-<version>-x64.exe
release-manifest.json
release-manifest.sig
<Executable>-<version>-corresponding-source.tar.gz
SHA256SUMS
```

The combined corresponding-source archive contains the third-party notices, reviewed source ledger,
source checksums, and approved corresponding-source files. GitHub displays the tagged release notes
as the release description and automatically adds its own source snapshots; those are not duplicate
prepared assets. `SHA256SUMS` covers the other five prepared assets.

## Promotion

1. Start from a clean, reviewed `main` commit with required checks green.
2. Update the version and release notes in a focused pull request. Reconcile runtime/provider pins and
   all compatibility evidence that changed since the prior release.
3. Merge without bypassing required checks, then create the signed `v<version>` tag from the exact
   merge commit.
4. Assemble the native runtime and package on the declared release runner using the Lerience identity,
   the canonical repository's `https://github.com/<owner>/<repository>/releases/` URL, and committed
   public key. Draft creation fails while the repository is private because an anonymous app cannot
   consume private GitHub Releases.
5. Run package inventory and `--verify-installation` against the exact unpacked application and each
   wrapper artifact. Record file sizes and SHA-256 digests.
6. Sign the exact manifest bytes with `pnpm release:sign-manifest`; immediately verify the emitted
   signature, selected targets, artifact sizes, and hashes independently.
7. Run the Windows release-candidate workflow with `create_draft: true`. It creates a **draft** in
   the canonical public source repository and attaches exactly the six required uploads above. It
   cannot publish the release. Do not replace accepted bytes in place.
8. Perform target acceptance against the draft's downloaded bytes. Compare the downloaded hashes to
   the signed manifest and recorded build evidence.
9. Publish only when the acceptance record names the tag, commit, manifest digest, and exact artifact
   digests. Keep the accepted release immutable.

The repository's manual Windows distribution workflow is a non-promotable rehearsal. It uses the preview
identity, compiles the repository-derived feed URL and committed preview public key, creates no
GitHub Release, and retains artifacts for seven days. Its output cannot be promoted.

The production candidate workflow is also non-publishing by default. It requires an annotated tag,
reviewed version-specific notes, the repository-owned Lerience identity, and the `release-signing` environment's
private key. Enabling `create_draft` additionally crosses the protected `release-publishing`
environment and uses the job-scoped same-repository token. A human publishes an accepted draft
through GitHub only after the downloaded-byte acceptance record is complete.

## Failed release and rollback

- Before publication: delete the draft and rebuild from a new reviewed commit; never reuse a tag or
  version that another person may have downloaded.
- After publication: stop advertising the affected release by withdrawing its latest-channel
  manifest asset or unpublishing the release, then publish a fixed **higher** version. The updater
  intentionally does not perform silent downgrades.
- If immediate manual rollback is necessary, publish explicit package/version instructions and
  verify that courses, app data, and provider-owned state survive. Preserve the withdrawn artifacts
  privately for incident analysis.
- Record cause, affected hashes, exposure window, remediation, and proof that the replacement release
  was built from a reviewed commit.

Removing the latest manifest causes update checks to fail closed and leaves installed applications
usable. It is an emergency brake, not a routine release-management technique.

## Key rotation and compromise

Planned rotation uses a bridge release signed by the old key and compiled with the new public key.
Only after that bridge is available should later manifests be signed by the new private key.

If the private key may be compromised, do not trust an in-band rotation signed by it. Disable the
feed, preserve evidence, create a new key ceremony, ship a manually acquired application build with
the new public key, and explain the trust reset. Revoke and replace any release-environment copy.

## Provider and component cadence

- Provider clients remain vendor-owned and are never updated by Lerience.
- A compatibility-range change requires schema/behavior tests and one native provider session before
  release.
- Course Engine, Git, npm, Electron, and SDK changes require reviewed version/source/license updates,
  deterministic runtime reconstruction, and package inventory.
- Existing courses are not silently migrated. ADR-027's separate engine-maintenance module now
  provides provenance-bound preview, conflict refusal, clean-tree candidate validation, and a
  race-checked fast-forward commit. It is invoked only by a future explicit learner action when a
  reviewed Course Engine version actually changes.
