# ADR-032 - Lerience public identity

Date: 2026-08-18 - Status: accepted

ADR-029 separately owns the root license. Release topology remains repository-owned and
human-published.

## Decision

The first public identity is:

- product and wordmark: `Lerience` / `lerience`;
- canonical public source and release repository: `sqmch/lerience`;
- Windows executable and installer identity: `Lerience`;
- stable reverse-domain application ID: `io.github.sqmch.lerience`; and
- provider client identifier: `lerience-desktop`.

The product name, repository slug, and visible application name can change later. GitHub repository
renames and display-name changes are ordinary maintenance but require public links, package metadata,
and release copy to be updated. The application ID, installed data location, update feed, trusted
release key, and release-manifest product ID are installed-user compatibility boundaries. A future
visible-brand rename should normally retain those values; changing them requires a tested migration
or bridge release.

Existing internal names remain unchanged where they are compatibility or implementation seams:
`praxeum:` IPC channels, `.praxeum.json`, `PRAXEUM_*` build variables, course-history markers, and
the `praxeum-desktop` signed-manifest product ID. Their presence does not make Praxeum the public
brand.

This decision records the maintainer's naming choice and repository identity. It does not claim a
registered trademark or legal clearance.

## Why

One committed identity prevents package, workflow, metadata, and update-feed drift as the first
public repository and Windows release are created. Separating visible branding from durable
compatibility identifiers also keeps a later naming change possible without needlessly stranding
installed users.

## Rejected

- Continuing to prompt for product, executable, and application ID on every release workflow run.
- Renaming course and IPC compatibility namespaces only to match the visible brand.
- Treating a future visible-brand change as requiring a new application identity by default.

## Reopens if

The repository owner changes before publication, a legal review rejects the name, or a deliberate
installed-user migration replaces the application identity.
