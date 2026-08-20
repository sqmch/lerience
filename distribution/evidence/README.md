# Release evidence

This directory holds exact release-candidate evidence, not a chronological development
log. A record may distinguish package acceptance from learner-path acceptance; publication
still requires every release-blocking check named by that record to pass.

## Candidate record requirements

Each record must identify:

- the source tag, commit, and tree digest;
- the GitHub Actions workflow run and reviewed workflow commit;
- every downloaded draft asset by exact filename, byte size, and SHA-256 digest;
- the signed manifest and signature digests plus the trusted public-key fingerprint;
- the combined corresponding-source archive and its included source files, ledgers, checksums, and
  third-party notices;
- package inventory and `--verify-installation` results for every exact native package build;
- the install, Gatekeeper or publisher-warning handling, launch, provider-discovery,
  course-creation, update, uninstall, and data-preservation checks actually performed on each
  supported platform;
- separate macOS arm64 and macOS x64 results. One Mac architecture does not accept the other
  package, and the Intel release requires a physical Intel Mac Gatekeeper and learner-path run; and
- every warning, limitation, skipped check, or failed check without converting it into a pass.

Evidence must come from the exact draft assets downloaded from GitHub. Local build output, an
expiring CI artifact, source tests, or an earlier rehearsal cannot substitute for those bytes.

Do not record credentials, signing-key material, personal filesystem paths, learner course data,
private session/task traces, or disposable local setup details. Record release-key custody as a
verified fact and public-key fingerprint only.

The workflow may create a draft but never publishes it. A maintainer publishes only after the
candidate record is complete and every required check passes.
