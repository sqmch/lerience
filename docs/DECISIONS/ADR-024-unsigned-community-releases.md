# ADR-024 - Unsigned community releases with user-approved updates

Date: 2026-08-14 - Status: accepted

Amends ADR-001 and ADR-022.

## Decision

The initial Lerience releases are unsigned community previews. Versioned application artifacts,
release notes, integrity metadata, and checksums are published through GitHub Releases in the
canonical public source repository.

Windows x64 is the first distribution target. It receives an unsigned per-user NSIS installer
and may additionally receive a portable archive. The app checks the stable release feed without
user intervention, but downloading and installing are learner-approved actions:

1. A non-blocking in-app notice announces an available version, the status bar keeps it
   visible, and the learner can open the version's GitHub release page to read its notes.
2. The learner chooses **Download**; progress and recoverable failure stay in the app.
3. Lerience verifies the release manifest and downloaded artifact.
4. The learner chooses **Restart to update**. Lerience waits for the current tutor turn to
   settle, releases the provider, and persists trailing transcript events before stopping the
   process tree. It leaves the logical session recoverable under ADR-009; it does not force the
   course close ritual as a condition of updating.
5. The app launches the verified NSIS package with electron-builder's standard silent-update and
   force-run flags, exits, and reopens after installation. The learner does not step through the
   installer wizard. Windows may still show its unsigned-publisher warning.

The NSIS-installed Windows build can complete that flow in-app. A Windows portable build uses the
same verified notification and download experience, then offers **Open downloaded package**; a
portable executable cannot replace itself through the NSIS updater.

The update channel does not rely on an unsigned-code fail-open. Release metadata, including the
plain-text release notes it carries, is signed with an application-owned Ed25519 release key
and each artifact is bound by a filename, byte size, and SHA-256 digest. The app binds that signed
filename to its configured release repository/version directory rather than trusting an arbitrary
manifest URL. The
verification public key ships in the app; the private key remains outside the source repository
and is available only to the protected release process. A missing, malformed, untrusted, or
wrong-channel manifest fails closed without affecting the installed app.

On macOS, the app may provide the same check, notice, download, and verification flow, then
open the downloaded package. While the app is unsigned and unnotarized, installation still
requires the learner to complete the normal Finder/Gatekeeper override. Lerience does not claim a
seamless self-replacing macOS update until Developer ID signing and notarization exist.

Application updates replace application-owned files only. They never modify courses, provider
credentials/configuration, or app-data migration state outside a versioned, tested migration.
Automatic background installation is out of scope; the silent NSIS handoff happens only after the
learner explicitly approves it. Automatic update checks are not out of scope.

## Why

The project has no paying users and the maintainer does not want recurring signing costs during the
initial iteration-heavy phase. Requiring paid signing would delay clean-machine packaging and
real learner feedback, while browser-only re-downloads would make frequent early patches
unnecessarily clumsy.

A user-approved updater gives the expected desktop experience on Windows without pretending that
an unsigned executable has OS publisher trust. The application-level signature supplies a stable
update identity for installed copies at no certificate cost, while GitHub release immutability and
checksums make the artifacts inspectable. It does not suppress SmartScreen or Gatekeeper, and the
product copy must say so honestly.

## Rejected

- Treating signing credentials as a prerequisite for any distributable M5 artifact.
- Silent background download or installation without an explicit learner action.
- Sending every update through a browser and requiring the learner to find the correct asset.
- Depending on `electron-updater` skipping Windows signature verification when `publisherName`
  is absent; that behavior is fail-open and explicitly deprecated upstream.
- A self-signed OS certificate presented as equivalent to a trusted publisher identity.
- A macOS self-replacement flow that bypasses the platform's unsigned-app protections.

## Reopens if

Usage, support burden, store distribution, enterprise policy, or the desired first-run quality
justifies trusted publisher identities. Windows signing and Apple Developer signing/notarization
can then be added without changing the user-approved update state model; the application-level
manifest signature remains useful defense in depth.
