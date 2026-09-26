# ADR-040 — Session controls are remembered per course

Date: 2026-09-11 · Status: accepted · Amends ADR-018 and ADR-037

Presentation amended 2026-09-26 by [LB-013](../backlog/experience.md#lb-013).
First-turn confirmation amended 2026-09-26 by [LB-008](../backlog/providers.md#lb-008).

## Decision

The explicit session-control choices a learner makes for a course — model, effort, autonomy
("Never ask" included), and Codex access ("Full access" included) — are remembered per course
and per provider, and re-applied when a tutor runtime starts for that course.

1. **A session still starts on the learner's own provider configuration.** The adapter creates
   the session exactly as before (ADR-018 invariant 1). The conductor then applies the
   remembered choices through the same control surface the learner's own clicks use — Claude's
   runtime methods, Codex's staged next-turn overrides — before the opener is sent, so the
   first turn already honours them. The provider's own init or settings frame stays
   authoritative (ADR-018 invariant 3); a refused restore is shown before any tutor work. A refused saved model requires another
   selection or an explicit provider-default reset.
2. **Only explicit choices are stored, keyed by course identity and provider.** The memory is
   `course-controls.json` in app userData (ADR-010), never the course folder: a git-tracked
   access grant would travel with the course to another machine. Choosing the provider default
   forgets the key rather than storing a value. A course created tomorrow starts with nothing
   remembered, and Codex's course-scoped startup check (ADR-036) runs unchanged before any
   remembered access is staged.
3. **The actual selected value stays visible; restoration needs no suffix.** The session bar
   shows model, effort, autonomy, and access labels without "· remembered". Full access and
   Never ask remain plainly named and changeable. A remembered Full access is re-armed each
   session and remains one menu choice from Course folder. Values staged for the next turn
   retain "· next reply" until provider confirmation. This amends ADR-018's presentation
   condition: explicit saved choices and their actual permission values remain visible, while
   the fact that a value was restored is quiet.
4. **App-initiated runtime replacement carries the choices too.** The conductor replaces the
   provider runtime on recovery of an unverified close and on the wrap's follow-on open. Both
   now restore from the same memory, so a choice no longer dies at a module boundary the
   learner never asked to cross. Under ADR-018 as written that reset was a defect, not a rule.
5. **Nothing is written to the learner's provider configuration** (ADR-004). The session-scoped
   file-edit grant stays session-scoped: it has no pill to make it visible, and "Never ask"
   covers its use case for a learner who wants it every time.

6. **The learner confirms the model before the first tutor work.** New-course onboarding and
   ordinary course entry prepare the provider and show its supported choices in the conversation.
   The learner may keep the shown selection, select another, or use the provider default, then
   press Start tutor. This also gates recovery's first turn. Leaving before confirmation performs
   no tutor work and preserves the prior recovery evidence. Confirmation is tied to the prepared
   runtime; a stale confirmation cannot start its replacement. Recovery's automatic follow-on
   reuses the confirmed choice without another prompt while the provider and supported selection
   still match. A changed provider, removed model or refused restore returns to the same choice.
   Runtime preparation and capability discovery may start a provider process, but send no input.

## Why

ADR-018 scoped controls to a session and wrote down when to revisit that: "learners report that
a session-scoped choice they liked is annoying to re-make every session — at which point the
honest answer is an explicit, visible app preference, decided in its own ADR". The maintainer
reported exactly that after a four-module course run on 2026-09-11, including resets mid-course
at module boundaries. Two things were wrong. The mid-course resets were the conductor replacing
the adapter instance, where the controls lived, with no decision behind it. The daily resets were
the accepted rule, and the clause above had fired.

Per course rather than per provider because the choices are about this folder's work. Never ask
and Full access are trust statements about a course build, not about Codex in general; a new
course must start course-scoped under ADR-036. Model and effort follow the same key for one
rule's sake; an app-wide default remains a Settings candidate if anyone asks for it.

LB-013 reported that the restoration suffix widened controls and wrapped the row. The learner
requested its removal while keeping saved choices. The visible Full access and Never ask
values communicate the permission; repeating how they were restored adds no needed state.

## Rejected

- **Hide the actual permission value.** A restored sandbox policy must remain visible through
  its selected label. The original restoration suffix requirement was superseded by LB-013;
  restoration itself no longer needs a separate label.
- **Exclude Full access from memory.** Considered, because a remembered Full access plus Never
  ask is an unattended agent with the learner's whole filesystem and network every time the
  course opens. The maintainer chose to remember their own prior choice with its actual access
  value visibly labelled. ADR-018's own reasoning applies: withholding the rung
  did not make anyone safer, it made a course build an approval queue.
- **Per-provider memory in `settings.json`.** Loses the course boundary that makes remembering
  an access grant defensible.
- **Storing in `.praxeum.json` or another course file.** Learner-owned course files are
  git-tracked and portable; an access grant is neither.

## Verification

Deterministic tests cover: an applied choice is remembered and a default forgets it; the next
runtime for the course applies the memory before its opener and reports the keys as remembered;
a learner change clears the restoration metadata and updates memory; memory is isolated per
course and provider; a provider that refuses model restoration pauses for a visible choice before work. Renderer
checks cover restored values without the suffix and staged values with "· next reply" in
narrow layouts. Native acceptance for restoration mechanics:
choose Never ask and Full access in a disposable Codex course, end the session, reopen, and see
both controls show their actual values, with "· next reply" only while staged; return to Course
folder and confirm a fresh open no longer restores access.

## Reopens if

- A provider rejects a remembered value at startup in a way the learner cannot see, or applies
  it later than the pill claims. The pill must never say more than the provider confirmed.
- Learners ask for the same choice across courses, which is the Settings candidate
  `docs/POTENTIAL-SETTINGS.md` reserves.
