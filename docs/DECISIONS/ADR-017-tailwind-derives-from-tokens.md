# ADR-017 — Tailwind is derived from the tokens, and a non-token colour must not compile

Date: 2026-08-12 · Status: accepted

## Decision

ADR-008 named shadcn/ui as the component layer; this decides how it and Tailwind coexist with the
token architecture. Tailwind v4 is adopted, and its theme is **derived from `tokens.css`, never
parallel to it**:

- Tailwind's `@theme` defines its colour, radius, font and spacing namespaces as `var(--token)`
  references. The tokens remain the only place raw values live.
- **Tailwind's default palette is cleared**, not merely unused. `bg-zinc-900`, `text-slate-400`
  and every other stock colour utility must fail to compile. The rule stops depending on
  reviewer vigilance and becomes a build failure.
- shadcn components are vendored and re-themed onto the semantic tokens. They are never shipped
  in default state (ADR-008 already said this; it is repeated because it is the step everyone
  skips).
- Any override of a shadcn utility must itself be a utility. Cascade layers beat specificity, so
  a component-layer rule can never win against `sm:max-w-md` no matter how specific it is. This
  trap is already recorded in `tokens.css` and cost real time in the previous project.
- The discipline test grows to cover the new syntax for the old sin. Its existing rules already
  catch arbitrary-value utilities, because `bg-[#0d0e10]` and `p-[13px]` put the raw value in the
  source line where the hex and px scanners find it; what they cannot see is a stock palette
  class, so the test gains an explicit guard against those in case a future config re-introduces
  the defaults.

## Why

- The economy ADR-008 bought is "a re-cut is one file". ADR-015 has just proved re-cuts actually
  happen, and that they are triggered by taste rather than by schedule. A stock Tailwind palette
  living in class names would put colour in two places, and the next re-cut would stop being
  cheap in exactly the way ADR-008 was designed to prevent.
- The token rule has survived so far because a test enforces it rather than a convention asking
  nicely. Tailwind hands the codebase a second way to write a raw value; if the enforcement does
  not grow with it, the rule quietly becomes theatre while still appearing green.
- Clearing the defaults is stronger than testing for them, and cheaper: a class that cannot
  compile never reaches review, never reaches a screenshot, and never becomes a thing someone has
  to remember.
- The component layer earns its cost now. M1 deferred it deliberately and correctly, but the
  surfaces now queued are precisely the chrome-heavy ones it pays for: the onboarding wizard,
  dialogs and forms, the resizable seams, and the deferred motion layer.

## Rejected

Tailwind with its stock palette plus `dark:` variants, which is the ordinary way to use it: two
value systems, token-for-token theme mirroring lost, and every future re-cut doubled. Staying on
hand-written signature CSS (M1's deferral was right for M1, and wrong for a phase whose remaining
work is mostly chrome and interaction). Relaxing the discipline test so Tailwind fits through it,
which trades the one mechanism keeping the architecture honest for a little convenience.

## Reopens if

- Tailwind v4's `@theme` cannot express a token relationship the design needs, in which case the
  mapping layer earns a real design decision rather than a workaround.
