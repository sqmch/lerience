# Release evidence

This directory holds exact release-candidate evidence, not a chronological development
log. No accepted release candidate exists yet.

## Candidate record requirements

Each record must identify:

- the source tag, commit, and tree digest;
- the GitHub Actions workflow run and reviewed workflow commit;
- every downloaded draft asset by exact filename, byte size, and SHA-256 digest;
- the signed manifest and signature digests plus the trusted public-key fingerprint;
- the corresponding-source archives and third-party notices included in the draft;
- package inventory and `--verify-installation` results for the exact installer and portable build;
- the Windows install, launch, provider-discovery, course-creation, update, uninstall, and
  data-preservation checks actually performed; and
- every warning, limitation, skipped check, or failed check without converting it into a pass.

Evidence must come from the exact draft assets downloaded from GitHub. Local build output, an
expiring CI artifact, source tests, or an earlier rehearsal cannot substitute for those bytes.

Do not record credentials, signing-key material, personal filesystem paths, learner course data,
private session/task traces, or disposable local setup details. Record release-key custody as a
verified fact and public-key fingerprint only.

The workflow may create a draft but never publishes it. A maintainer publishes only after the
candidate record is complete and every required check passes.
