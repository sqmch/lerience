# Release notes

Each public candidate adds one reviewed `vMAJOR.MINOR.PATCH.md` file in this directory in the same
pull request that updates `package.json`. The Windows release-candidate workflow refuses a tag with
no exact matching notes file.

Write learner-facing changes, compatibility notes, known limitations, and upgrade guidance. Keep
private repository context, internal task history, credentials, and machine-specific paths out of
release notes. The file's trimmed text is embedded in the signed manifest and copied unchanged into
the public release bundle.
