# Security policy

There is no supported binary version yet. Security fixes target the latest `main`; preview artifacts
are accepted as reproduction inputs but are not maintained releases. This section will gain an
explicit supported-version table with the first public release.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Open the repository's **Security** tab,
choose **Report a vulnerability**, and include:

- the affected commit or artifact;
- a minimal reproduction;
- the expected and observed trust boundary;
- likely learner impact; and
- whether provider credentials, course data, or update integrity may be involved.

Do not include real credentials or personal course data. The maintainer will acknowledge a complete
report as soon as practical, coordinate validation privately, and publish remediation details only
after affected users have a safe path forward.

## Security model

The principal boundaries are documented in `docs/SPEC.md` and the ADRs. In particular:

- the renderer is sandboxed and receives a narrow typed preload API;
- course-authored HTML runs in a null-origin, network-blocked iframe;
- provider installations own their credentials and configuration;
- Lerience does not host or transmit learner course data;
- package runtime files and release artifacts cross explicit cryptographic verification gates; and
- no source-machine test is accepted as clean-machine release proof.

Provider or operating-system vulnerabilities should also be reported to their respective vendors.
