# ADR-029 - MIT root license

Date: 2026-08-18 - Status: accepted

Records the root-license decision independently of identity, third-party terms, and release-key
custody.

## Decision

The desktop source is licensed under the MIT License with the notice `Copyright (c) 2026 sqmch and
contributors`. The Course Engine template retains its existing independent MIT license.
Dependencies and redistributed tools retain their own terms; the root MIT license does not replace
any bundled notice, source-delivery obligation, or third-party agreement.

Selecting a source license does not authorize or accept a binary release.

## Why

MIT is a short, widely understood permissive license with minimal reuse friction. It matches the
Course Engine template and the current T3 Code project, making the project's intended reuse posture
obvious to individual contributors and small downstream projects. The maintainer prefers that
simplicity over Apache-2.0's additional express patent terms for this project.

## Consequences

- Copies or substantial portions of the desktop source must retain the MIT copyright and permission
  notice.
- The root license does not relicense third-party code or packaged runtime components.
- Public releases remain governed by the active release documentation and exact-artifact evidence.
- A later owner-name or legal-entity change may update the notice without changing the license.

## Rejected

- Retaining Apache-2.0 solely because it was the first permissive license considered.
- Delaying a clear root license until the source repository becomes public.
