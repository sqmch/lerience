# Runtime third-party notices

The desktop runtime redistributes the following app-owned tools. Their complete license texts and
the license/notice files shipped by their own dependency trees are preserved in the runtime. This
file records reproducible source locations; it is not a legal opinion.

## Packaged application libraries

The Electron application ASAR retains the license/terms files shipped by its production libraries.
The package inventory fails if either of these records is absent:

- `@anthropic-ai/claude-agent-sdk` `0.3.233`: © Anthropic PBC, all rights reserved; use is
  governed by Anthropic's linked legal agreements rather than a standard open-source license. The
  package retains `node_modules/@anthropic-ai/claude-agent-sdk/LICENSE.md`.
- `zod` `4.4.3`: MIT. The package retains `node_modules/zod/LICENSE`.

`pnpm licenses list --prod --long` remains the source-checkout inventory for transitive production
dependencies. It is reviewed on dependency changes; the package inventory is the release check for
what electron-builder actually ships.

## Bundled font assets

The renderer imports these exact Fontsource variable packages. Vite emits the required WOFF2
subsets into the packaged application; the repository does not carry a second set of font binaries.

- `@fontsource-variable/inter 5.3.0`: Copyright 2016 The Inter Project Authors
  (<https://github.com/rsms/inter>).
- `@fontsource-variable/literata 5.3.0`: Copyright 2017 The Literata Project Authors
  (<https://github.com/googlefonts/literata>).
- `@fontsource-variable/jetbrains-mono 5.3.0`: Copyright 2020 The JetBrains Mono Project Authors
  (<https://github.com/JetBrains/JetBrainsMono>).

Each package declares `OFL-1.1`, includes its family copyright and license in the exact npm package,
and points to the Fontsource font-files source repository. The locked packages and their integrity
records are in `pnpm-lock.yaml`; their exact package archives are available from the npm registry.
The common license text follows so it travels with both installed packages and staged release
notices.

### SIL Open Font License 1.1

The common license body is reproduced verbatim from the three installed package license files:

```text
-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## Portable Git payload

- Payload: Git for Windows `2.53.0.windows.4`, built by Dugite Native `v2.53.0-4`.
- Primary license: GPL-2.0-only. The runtime includes `licenses/git.txt`, and the portable tree
  retains its own `share/licenses` directories and Git Credential Manager notice.
- Exact build source: <https://github.com/desktop/dugite-native/tree/4098283a7ecb8a227b9d43580336c78a06f90e5d>
- Source archive: <https://github.com/desktop/dugite-native/archive/4098283a7ecb8a227b9d43580336c78a06f90e5d.tar.gz>
- Exact Git for Windows source package: <https://github.com/git-for-windows/git/releases/download/v2.53.0.windows.4/mingw-w64-git-2.52.0.1-1.src.tar.gz>
- Exact MinGit package manifest: <https://github.com/git-for-windows/git/releases/download/v2.53.0.windows.4/package-versions-2.53.0.4-MinGit.txt>
- Dugite package source: <https://github.com/desktop/dugite/tree/84cd716e0bf0f177dfc984a3ce05dec639bf79b9>

The payload also contains Git LFS `3.7.1` and Git Credential Manager `2.9.0`. The assembler fetches
Git LFS's exact checksum-pinned license as `licenses/git-lfs.md`; Git Credential Manager's license
and notice remain inside the portable tree. The Dugite Native build inputs identify the exact
bundled revisions. The reviewed archive names, byte lengths, URLs, and SHA-256 digests are pinned in
`release-source-ledger.json`. The production candidate workflow downloads and verifies every entry,
then packages the exact source set and these notices into one corresponding-source archive beside
the installers. Legal adequacy remains a release review; a GitHub link alone is not treated as
completion of that gate.

## npm

- Payload: npm `11.19.0`.
- License: Artistic-2.0. The runtime includes `licenses/npm.txt`; npm's package tree retains its
  dependency license metadata.
- Exact source package: <https://registry.npmjs.org/npm/-/npm-11.19.0.tgz>

The exact npm source package is also pinned in `release-source-ledger.json` and included in the
staged corresponding-source archive.

## Dugite package wrapper

The assembler consumes Dugite `3.2.3` to obtain and verify the portable Git payload. Its MIT license
is included as `licenses/dugite.txt` even though the Dugite JavaScript wrapper is not copied into the
runtime.
