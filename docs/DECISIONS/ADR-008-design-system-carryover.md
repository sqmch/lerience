# ADR-008 — Carry the D2 design system; re-cut the palette

Date: 2026-08-11 · Status: accepted · Palette clause superseded by ADR-015 (2026-08-12)

## Decision

The app's renderer uses the D2 design system from the previous project: the token architecture
(`tokens.css` — the only file where raw values live), the two-voice typography split (app voice /
course voice / mono data), the spatial ladder, the one-accent discipline, the two-theme
token-for-token mirroring, and the component layer (shadcn/ui vendored and re-themed onto the
tokens). The **palette will be re-cut** — colors and theme character are an open design
decision and are explicitly not being carried.

## Why

- The audit confirmed D2 is a descendant of the engine study's design (`study/UI.md`), not a
  deviation: same spatial-scale philosophy, same one-accent rule, same theme mirroring —
  matured through a documented design session (D2) with earned traps written down (glyph-box
  centering, `ch`-measure misalignment, cascade-layer overrides).
- The system is cleanly recolorable by construction: every color is a custom property in three
  mirrored blocks of one file; the contrast-tiered ink scale, type voices, and spacing are
  theme-independent. Changing the palette is ~25 hex values; the structure — the expensive
  part — survives any recolor.
- Rebuilding a design system from scratch would re-derive the same conclusions (the "looks like
  a template" root causes are already documented: preset radii, centred-hero shapes, chrome
  without architecture) at full price.

## Rejected

- Starting design from zero (discards earned, documented work whose only contested part — the
  colors — is the cheap part). Carrying the current palette as-is (the maintainer will re-theme;
  pretending otherwise just delays it). Adopting the engine study's CSS directly (D2 already
  *is* that lineage, matured, and is shadcn-integrated for component velocity).

## Reopens if

- The re-cut palette fights the token structure itself (e.g. a design direction that needs more
  than one accent) — then the system evolves in a named design session, not ad hoc.

## Outcome

The re-cut happened on 2026-08-12 (ADR-015). The prediction held: the structure survived
untouched and the change was values plus rules. One correction came out of it — the two-voice
split was being applied by heading-vs-body rather than by whose words these are, which put the
course's serif on the app's own chrome. ADR-017 records how the component layer joins without
introducing a second value system.
