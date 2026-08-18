# File formats (v0 — documented from reality, subject to change until the source course completes)

These formats are the de facto schema extracted from the first live course. They are what the
tutor protocol reads/writes and what Lerience renders.

The precise, machine-checkable spec lives in [`docs/schema/`](schema/) (JSON Schema draft-07);
`npm run validate` checks a course against it. The prose below is the annotated tour.

## Repository layout

```
CLAUDE.md            ← the tutor protocol (the engine)
AGENTS.md            ← pointer to CLAUDE.md for agents that read the AGENTS.md convention (codex, …)
COURSE.md            ← generated at onboarding: learner profile, phases, module arc, boss-checks
curriculum/
  NN-name/           ← one directory per module, numbered
    module.json      ← manifest (below)
    LESSON.md        ← teaching (textbook chapter)
    BRIEF.md         ← task spec + acceptance criteria
    scaffold/        ← runnable starter project with TODO(you) gaps
    checks/          ← automated tests, run by the learner
    hints/           ← hint-1.md (nudge), hint-2.md (approach), hint-3.md (near-spoiler)
    quiz.md          ← 4–8 retrieval questions
    lab.json         ← optional: claims/configures the module's visualizations (below)
    visuals/         ← optional: self-contained interactive HTML, rendered sandboxed
tutor/
  progress.json      ← module status, hint usage, check attempts, tutor notes
  quiz-bank.json     ← spaced-repetition items with intervals, due dates, history
  journal.md         ← append-only session log; the tutor's cross-session memory
```

**Scaffold hygiene:** `scaffold/node_modules` must be gitignored — an installed dep tree is
hundreds of MB and committing it bloats every clone. **QA a generated module mechanically with
`npm run qa`** (`scripts/qa-module.mjs`, the entry point for the sealed-reference ritual): it
runs the reference all-green → stripped-scaffold red-*on-assertions* check and lints the earned
materials rules — `TODO(you)` gaps, no pasteable code in hint-2, no relative-timing checks, 4–8
quiz questions, `lab.json` claims that resolve, self-contained visuals, and no committed
node_modules.

## COURSE.md — the course spine

Generated at onboarding (`CLAUDE.md`, **Onboarding**) and reviewed by the learner before any
module is built; the tutor reads it first at every session open. Unlike the files below it is
**prose, not JSON** — it has no schema, and it is the one course file the tutor legitimately
hand-authors and maintains. It sits at the repo root beside `CLAUDE.md` (an engine file, never
edited): everything generic lives in the protocol, everything course-specific lives here, and
the two occupy disjoint paths so Lerience can preview an explicit engine update without touching
learner content.
`npm run doctor` fails a repo that has a `curriculum/` but no `COURSE.md` — a course without its
spine.

Required content blocks (instance #1's `COURSE.md` is the working reference):

- **Course-specific tutor rules** — the targets the generic protocol can't know, read as tutor
  instructions rather than docs: provider/SDK + env var; toolchain and how checks run; earned
  check-design specifics; cost policy (cheapest adequate tier, budget); how guidance fades
  across phases.
- **Learner profile** — one line: who they are, hours/week, expected run length, start date.
- **Phases, each with a goal and a boss-check** — a phase is a named arc whose **Goal** is
  stated as a *capability* ("understand RAG well enough to build one and explain it in an
  interview"), and whose **boss-check** is the gate the learner must genuinely pass to advance
  (one per phase). The boss-check here is the *plan*; the learner's trip through it is recorded
  in `progress.json`'s `bossCheck` (below).
- **The module arc** — every module named under its phase, one line of scope + the artifact it
  builds. Only the current module's full content is generated just-in-time; this arc is the
  stable plan the generation follows.
- **Pacing** — hours/week and a rough per-phase or whole-course estimate, so the arc stays
  honest about scope.

```markdown
# COURSE.md — <course name>

## Course-specific tutor rules
- **Provider target:** <SDK + `ENV_VAR`> — generate scaffolds/checks against it.
- **Toolchain:** <language>; checks are <runner>, run with `<command>`.
- **Check-design specifics (earned here):** <e.g. inject deps across the checks/→scaffold
  boundary; live-API checks auto-skip without a key and derive expected values from scaffold
  constants>.
- **Cost policy:** <cheapest adequate tier; print costs; per-phase / whole-course budget>.
- **Guidance fade:** <early phases teach in conversation; later phases the learner reads
  LESSON.md solo and the tutor only probes>.

# The curriculum spine

**Learner profile:** <who> · <hours/week> · <run length> · started <date>.

## Phase 0 — <name> (<pacing>)
**Goal:** <a capability, not a topic area>.
- 0.1 <module scope> → <artifact it builds>
- 0.2 <module scope> → <artifact>
**Phase boss-check:** <the gate to advance>.

## Phase 1 — <name> (<pacing>)
**Goal:** …
- 1.1 <module scope> → <artifact>
**Phase boss-check:** …
```

Instances carry extra prose freely — instance #1 adds a learning-science principles table, a
just-in-time design-stance note, and a cost-expectations section. That flavor is fine; the five
blocks above are what the tutor protocol relies on a `COURSE.md` having — the doctor's spine
check only enforces that the file exists.

## module.json

```jsonc
{
  "id": "02-vector-store",          // = directory name
  "title": "A Vector Store from Scratch",
  "phase": 1,
  "phaseName": "Retrieval — RAG",   // optional: display name for the phase in Lerience's
                                    // course rail (any module in the phase may carry it;
                                    // absent everywhere → "Phase N")
  "prerequisites": ["01-embeddings"],
  "runtime": "node",                // what the scaffold needs to run
  "estimatedHours": 4,
  "provenance": "core",             // "core" (reviewed curriculum) | "tutor-generated"
  "volatileLayer": "generated-at-start",  // scaffold/checks/hints are JIT-generated
  "bossCheck": true                 // optional: this module ends a phase gate
}
```

**Stable/volatile split:** `LESSON.md`, `BRIEF.md`, `quiz.md`, `module.json` are the *stable
layer* — written when the course spine is built. `scaffold/`, `checks/`, `hints/` are the
*volatile layer* — generated when the learner starts the module (facts drift: versions, prices,
APIs), and always QA'd against a sealed reference solution first.

## tutor/progress.json

```jsonc
{
  "learner": { "profile": "…", "paceHoursPerWeek": "3-5", "started": "2026-06-10" },
  "currentModule": "02-vector-store",
  "modules": {
    "00-orientation": {
      "status": "completed",        // "not-started" | "in-progress" | "completed"
      "startedAt": "2026-06-10",
      "completedAt": "2026-06-11",
      "hintsUsed": ["hint-1"],
      "checkAttempts": 3,
      "notes": "free-form tutor notes: struggles, calibration decisions, open threads",
      "bossCheck": {                // optional: the phase-gate trace for this module
        "passedAt": "2026-06-11",   // ISO date the gate was genuinely passed; null while still failing
        "attempts": [               // every attempt, pass OR fail — an auditable trace, not a memory
          { "date": "2026-06-11", "outcome": "failed", "notes": "missed the continuation pattern" },
          { "date": "2026-06-11", "outcome": "passed", "notes": "re-explained, then passed clean" }
        ]
      }
    }
  }
}
```

**`bossCheck` (optional, on modules that end a phase).** Distinct from
`module.json`'s boolean `bossCheck` (which only flags that a module *is* a phase
gate): this is the record of the learner going through that gate. `CLAUDE.md`
requires the tutor to log every attempt here — `outcome` (`passed` | `failed`) plus
one honest `notes` line — so a phase advance leaves an auditable trace rather than
living only in the journal prose. `passedAt` is the date the gate was genuinely
cleared, `null` until then.

## tutor/quiz-bank.json

```jsonc
{
  "items": [
    {
      "id": "00-statelessness",     // module prefix + slug
      "module": "00-orientation",
      "question": "…",
      "interval": 3,                // days; ×2.5 on correct, 2 on partial, 1 on wrong
      "due": "2026-06-16",          // ISO date; due when today ≥ due
      "history": [
        // GRADES ONLY — entries for items actually asked
        { "date": "2026-06-11", "result": "correct", "note": "…" }
        // results: correct | partial | wrong | tutored
      ],
      "moves": [                    // optional: bookkeeping that is NOT a grade
        { "date": "2026-06-13", "action": "rescheduled", "to": "2026-06-18", "note": "…" }
      ]
    }
  ]
}
```

**Grades vs. bookkeeping.** `history` holds *grades* — `correct | partial | wrong | tutored`,
one entry per item actually asked. A **reschedule** moves a due date without judging recall, so
it is not a grade; it lands in **`moves`** (`{ date, action: "rescheduled", to, note? }`). This
split exists because the old synthetic `"rescheduled"` *grade* was the format straining — a
bookkeeping row wearing a grade's clothes.

**Legacy banks (`rescheduled` in `history`).** Instances created before `moves` carry their
reschedules as `{ "result": "rescheduled" }` entries inside `history`. That shape stays
schema-valid (reality wins), and readers ignore it as a grade — the interval arithmetic never
looks at `history`. Modernize a bank with **`npm run quiz -- migrate`**: it relocates every
legacy `rescheduled` history entry into `moves`, carrying `date` and `note` but dropping `to`
(the destination due date is unrecoverable from a legacy entry). Migrate is idempotent — a
second run finds nothing and exits 0 — and byte-stable. Any command that loads a bank still
carrying legacy entries prints a one-line hint pointing at `migrate`.

**`scripts/quiz.mjs` is the writer of record** for `interval`, `due`, `history`, and `moves`
(`npm run quiz -- grade|tutored|seed|reschedule|migrate`): the tutor judges the answer, the
script does the arithmetic and the append, so an earned interval can't be flattened by a hand
edit (it was, once — a close-time reseed sent module 01's quiz dark). It emits exactly this
shape — 2-space JSON, one-line `history`/`moves` entries, trailing newline — to keep a single
grade's or reschedule's git diff to a few lines.

## tutor/journal.md

Append-only, newest at the bottom, one `## date — title` entry per session (or maintenance
event). Content contract: what was covered; where the learner struggled or shone, with
specifics; open threads; pedagogy/calibration decisions. The tutor reads the last few entries
at every session open.

## lab.json (optional, per module) — visualizations

A module gets a visualization in one (or both) of two ways, both declared here. Lerience
derives everything from this file: the ◇ lab button (hidden when no module claims anything),
the ◇ chips on the module's lesson, and the rail badge. **Nothing about visuals is hardcoded
in the engine.**

```jsonc
{
  "provenance": "tutor-generated",
  "focus": "one line: the live confusion this module's picture should target",
  "focusLab": "chunking",           // which entry the focus targets, when the module has several

  // 1) CLAIM A STOCK LAB: carrying a stock lab's config key claims it for this
  //    module. The app ships the components (see docs/stock-labs.json:
  //    "vectors", "chunking", "topk", "precision-recall"); the course decides
  //    which modules they serve.
  "vectors": { /* lab-specific config — axes, example vectors, presets */ },

  // 2) SHIP YOUR OWN: self-contained HTML files under this module's visuals/.
  "visuals": [
    {
      "file": "event-loop.html",    // inside visuals/; inline CSS/JS ONLY — Lerience
                                    // serves it under a CSP that blocks all network
      "title": "The event loop, animated",
      "blurb": "one line: what you'll feel by playing with it"
    }
  ]
}
```

A custom visual can also be embedded **inline in LESSON.md**, right where the picture
belongs, with a `visual` fence (Lerience renders it as a sandboxed iframe):

````markdown
```visual
{ "file": "event-loop.html", "height": 420, "title": "The event loop" }
```
````
