# Contributing

Contributions are welcome. Lerience is pre-release, so open an issue before a substantial product,
architecture, dependency, or distribution change. Small, focused fixes and documentation
improvements may go directly to a pull request. All contributions are licensed under the repository's
MIT License.

## Before changing code

1. Read `docs/STATUS.md`, then `docs/SPEC.md` and the relevant records in `docs/DECISIONS/`.
2. Confirm the change does not weaken the local-only, learner-owned, or provider-owned boundaries.
3. Discuss consequential product or architecture decisions before implementation and record accepted
   decisions as a short ADR.
4. Keep generated artifacts, credentials, provider configuration, and real learner courses outside
   the repository.

## Development workflow

- Branch from the current `main` branch and keep each pull request focused on one coherent change.
- Preserve the narrow renderer/main/provider interfaces; validate untrusted IPC values in main.
- Add or update tests for behavior and trust-boundary changes.
- Do not edit real courses or retired sibling repositories as part of this project.
- Use conventional, imperative commit subjects that explain the completed change.

Before opening a pull request, run:

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm audit:all
pnpm audit:production
```

Distribution changes also require the relevant runtime inventory and packaging preflight. Add a
release evidence record only when it satisfies [`distribution/evidence/`](distribution/evidence/);
source-machine results must not be described as clean-machine or public-release acceptance.

## Pull requests

Pull requests should explain what changed, why, learner/developer impact, trust-boundary impact, and
the exact validation performed. Screenshots are appropriate for visible UI changes; secrets,
provider credentials, personal course content, and private filesystem paths are not.

Security vulnerabilities must follow [SECURITY.md](SECURITY.md) instead of the normal issue flow.
