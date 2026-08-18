# Lerience — product and architecture specification

Status: accepted product and architecture baseline; M0–M4.5 complete
Last updated: 2026-08-15
Decisions referenced here are recorded individually in `DECISIONS/`.

## 1. What this is

A self-contained Electron desktop application and Course Engine that turns the learner's installed
Claude Code or Codex client into a mainstream course product (ADR-025). Initial community releases
are unsigned but use an app-owned signed release manifest (ADR-024). The learner's own eligible
provider subscription is the tutor, with providers behind the same seam and running locally at full capability in a real course folder
on the learner's disk. The app supplies what the original raw prototype could not: a designed streaming chat,
a course lens (rail, material, record), one-click install, and a session lifecycle that
tolerates how people actually study.

The app has three roles of equal rank: a **lens** (renders what the course files say, owns
none of it), a **conductor** (supervises the agent and the engine scripts), and a **stage** —
the place where course-authored interactive teaching tools run. Courses claim stock labs or
write their own sandboxed visuals per module, adapted to the learner; the app renders them as
first-class surfaces, not as an afterthought. A rigid fixed-widget app would handcuff exactly
the thing frontier models are getting best at (ADR-012).

What it is **not**: a hosted service, an IDE, a terminal wrapper, a second engine implementation, a
sandbox around the learner's agent, or a fixed set of widgets.

## 2. The bet

> There is a large and growing population that pays for a frontier-model subscription
> (ChatGPT Plus/Pro, Claude Pro/Max) and will not open a terminal.

The implementation validates the broader provider-neutral bet, but public provider eligibility is
continuously reviewed. Codex's published App Server contract supports own-product integration and
managed ChatGPT login. Anthropic's legal/Agent SDK restrictions and June 2026 support statement
conflict for Lerience's official-harness, provider-installed shape; ADR-025 keeps Claude enabled and
monitored rather than treating that ambiguity as a current implementation block
(`distribution/PROVIDER-READINESS.md`).

If this is false — if subscription holders remain essentially developers — the correct product
is the existing `npx` harness plus better courses, not this app. The bet is named here so it can
be tested early and cheaply, and so a failed test redirects effort instead of sinking it.

Secondary premise (already proven by the engine): the tutor must be a **full-capability agent**.
Module generation writes scaffolds, runs sealed reference solutions against checks, and executes
the QA ritual. A typed-tools-only tutor cannot run the protocol. This is why the API-funded
hosted path is not the product: same model, amputated agent, plus unsustainable token cost.

## 3. Learner journey

1. **Install once.** Downloadable desktop package. No separate Node, no Git knowledge, no PATH.
   Initial previews are unsigned, so the OS warning/override is explained honestly (ADR-024).
2. **Connect the tutor.** The app detects an installed, compatible provider. If none is installed,
   it points to the official installer; if sign-in is needed, it hands off to the provider's own
   ceremony and re-checks. Lerience never packages provider binaries or accepts, stores, copies, or
   refreshes provider credentials (ADR-004, ADR-021, ADR-025).
3. **Create a course.** "New course" materializes the app-owned Course Engine into a visible folder
   (default `~/Lerience/<course-name>`, learner-changeable). The onboarding interview happens in
   the app's chat: topic, honest background, real hours/week, artifacts, deadline. The tutor
   drafts the arc; the learner reviews it in the material pane; explicit assent gates module 00
   (the engine's hard gate, preserved).
4. **Study.** One window: seminar chat (streaming, designed), course rail with progress, material
   pane (lesson/brief/quiz typeset), record overlay (quiz queue, journal, analytics), and the
   **lab** — interactive visualizations the course claims from the stock registry or writes for
   itself, embedded in lessons and available full-screen, rendered in a no-network sandbox
   (ADR-012). The learner
   writes code in **their own editor** ("Open in editor" button) and runs checks from the app's
   check lens (a "Run checks" button per module — red/green results rendered in place, powered by
   the module's own `checks/`). Workspace affordances are presence-based: they render only when
   the current module actually has a `scaffold/` or `checks/`, so a non-buildable course (history,
   theory) simply never shows them — no course-type classifier exists (ADR-013). Hints unseal one
   level at a time through the chat.
5. **Walk away.** Closing the laptop mid-session loses nothing. Abandonment is the normal end of
   a session (ADR-009).
6. **Come back.** Next open: the app detects the unclosed session, has the tutor wrap it up
   honestly from evidence (journal entry, quiz seeds, progress sync, commit), then opens the new
   session with the recall quiz. An explicit "End session" button runs the same ritual eagerly.
7. **Another course** is another folder. The dashboard lists known courses with cadence and due
   counts.

Never shown: a terminal, a SHA, a port, `npm`, or the word "agent" where "tutor" will do.

## 4. System overview

```text
Electron app
│
├── renderer — React, D2 design system
│     seminar chat · course rail · material pane · record · lab stage · dashboard
│     sandboxed: contextIsolation on, nodeIntegration off, no remote content
│         ▲
│         │  typed IPC — the renderer's only capability
│         ▼
├── main process
│     CourseRegistry    — known course folders (app-data)
│     CourseLens        — parse/watch course files for the UI
│     SessionConductor  — session lifecycle, context assembly,
│                         transcript persistence, wrap-up
│     AgentSeam         — provider-neutral streaming agent interface
│     ScriptRunner      — engine scripts via Electron's embedded Node
│         │
│         ├─ Agent SDK (stream) ──▶ installed Claude Code
│         │                          canonical auth, full capability
│         ├─ App Server (stdio) ──▶ installed Codex
│         │                          canonical auth, full capability
│         │
│         └─ fork (utilityProcess) ─▶ engine scripts
│                                      quiz.mjs · doctor · validate · qa · checks/
│
└── course folder  ~/Lerience/<name>/
      engine template + learner-owned Git history · visible · the learner's editor opens it
      git = session-close persistence
```

A rendered, annotated version of this diagram (with the session lifecycle and the design
principles each part stands on) lives in the "Lerience — Architecture" artifact.

No server. No accounts. No network components beyond the agent's own provider traffic, which
never transits anything of ours (ADR-001, ADR-004).

## 5. State model

| State | Where | Authority | Survives folder copy to a new machine |
| --- | --- | --- | --- |
| Course content, progress, quiz bank, journal | course folder (engine format) | the course files | yes — this is the course |
| Tutor protocol | `CLAUDE.md` in the course folder (engine file) | the engine | yes |
| Session transcript, thread bindings, window prefs | app-data, keyed by course UUID | the app | no — by design; the journal is the durable memory (ADR-010) |
| Course registry | app-data | the app | re-add by opening the folder |

A small marker file (`.praxeum.json`: course UUID + format version) is committed into the course
at creation. It keys app-data and marks format compatibility (ADR-002, ADR-010).

## 6. Session lifecycle

**Open.** App runs doctor and the quiz due-list script, reads the journal tail and progress,
then starts the agent session in the course folder with the protocol plus a compact factual
context block (doctor verdict, due items most-overdue first, journal tail, current module).
The block is additive — computed by the same scripts the protocol already trusts over the
model — and removes the "did the tutor actually read the files" failure mode without
restricting the agent in any way (ADR-003).

**Turn.** Learner message → agent streams → renderer renders one growing assistant message,
tool activity as quiet activity rows (never raw JSON), file changes refresh the material pane.
Approvals, when the agent surface emits them, are first-class cards.

**Abandonment (the normal case).** Transcript is checkpointed continuously to app-data. Nothing
else needs to happen. No timer fires, no unattended agent runs.

**Wrap-up (recovery-first close, ADR-009).** At next open — or on explicit "End session" — the
tutor performs the engine's close ritual from evidence: append an honest journal entry, seed
quiz items for concepts actually covered (via `quiz.mjs`), sync progress, commit. Doctor
verifies. A session in which nothing durable happened wraps up as exactly that — there is no
"progress must have changed" invariant to violate.

**Verification stance.** The model proposes; code decides (ADR-005). Interval arithmetic,
validation, doctor, and QA live in scripts. The app never interprets model prose as state.

## 7. Agent seam

```ts
interface TutorAgent {
  readonly providerId: "claude" | "codex";
  startSession(options: { courseDir: string }): AgentSession;
}

interface AgentSession {
  readonly events: AsyncIterable<AgentEvent>; // ONE lifetime stream: deltas, tool
  readonly busy: boolean;                     // activity, approvals, usage, turn
  send(message: string): void;                // boundaries, terminal states
  respondToApproval(requestId: string, allow: boolean, reason?: string): void;
  interrupt(): Promise<void>;
  end(): Promise<void>;
}
```

Turns are delimited by `turn_complete` events on the single lifetime stream (ratified
2026-08-12; an earlier sketch returned a per-send iterable, but session-level events —
an auth failure between turns, process death — have no turn to belong to, and the
renderer consumes one pushed IPC stream regardless). The opener is simply the first
`send`, so the opening turn's events flow like any other turn's; `busy` is the fact the
conductor checks before persisting a learner message, so the durable transcript never
records a message the provider refused.

Claude first via the supported Agent SDK / `claude -p --output-format stream-json`
(ADR-004). The Codex adapter (App Server) is implemented behind the same interface; the normalized
`AgentEvent` vocabulary is the compatibility surface, and the renderer never sees provider
shapes. Invariants carried from the previous project's hard-won list: never touch provider
auth or config homes, never login/logout, drain stderr without logging it, no credential-shaped
content in transcripts or app-data.

Provider readiness and explicit vendor-owned sign-in sit in a registry around this seam
(ADR-021). That registry may detect canonical auth state and launch the provider's supported
browser ceremony, but it never receives or persists credentials. Selection is app-wide and is
resolved only when a fresh runtime starts.

Provider executables are provider-owned prerequisites discovered through one installed-runtime
module (ADR-025). Missing/incompatible clients are readiness outcomes, not damaged-app failures.
Lerience never downloads or updates them. The Claude SDK receives the discovered executable path so
its optional bundled CLI cannot become an accidental fallback.

Session controls respect each provider's real mutation boundary (ADR-018). Immediate controls
apply immediately; Codex controls stage for the next real `turn/start`. The renderer keeps
provider-confirmed `current` state distinct from `pending`, and a control rejection never means
the tutor session itself failed.

Escape hatch, by architecture rather than by feature: the course folder is a standard Git-backed
Course Engine workspace, so a technical learner can run its scripts or provider CLI directly.
This is maintenance/power use, not a second study UI. The app embeds no terminal (ADR-006).

## 8. Non-goals (v1)

- No hosted tutor, credits, trial, or backend of any kind.
- No mobile/phone surface; no sync (the state model keeps a future sync layer possible).
- No embedded terminal; no embedded code editor.
- No course sharing or marketplace — courses are personal artifacts generated from the learner
  (also the reason ADR-002 can run course-local scripts).
- No remote/tunnel access.

## 9. Open questions

- Product identity — **`Lerience` selected 2026-08-18 under ADR-032** for the product, repository
  slug, and Windows executable. `io.github.sqmch.lerience` is the stable application identity.
  Internal `praxeum-*` protocol, course, environment, and update-manifest identifiers remain stable
  compatibility seams. This decision is not a trademark registration or legal-clearance claim.
- Tutor connection architecture: accepted in ADR-021.
- Trusted Windows/macOS signing logistics are deferred until usage/revenue justifies them; unsigned
  release behavior and the app-owned trust chain are fixed by ADR-024.
- Landing-page positioning: the stage pillar — "courses that build their own teaching tools" —
  is a headline differentiator and needs sharp copy in the positioning pass, alongside the
  existing "structure around the model" framing.

## 10. Milestones

| # | Deliverable | Proves | Status |
| --- | --- | --- | --- |
| M0 | electron-vite + React + strict TS scaffold boots; design tokens render a shell | stack works | Complete |
| M1 | Course lens, read-only: open a repository-owned fixture and render rail/material/record from files, including sandboxed stock and custom labs | format compat; the app can be a lens and a stage | Complete |
| M2 | Agent seam: real Claude session in a disposable course, streaming chat, one full tutored turn | the core bet's technical half | Complete |
| M3 | Session lifecycle: context assembly, transcript persistence, abandonment + wrap-up, check lens | the product loop end to end | Complete |
| M4 | Course creation: engine materialization + onboarding interview + arc review gate | new-learner journey | Complete; design accepted 2026-08-14 |
| M4.5 | Tutor connection: provider choice, vendor-owned sign-in, readiness, Codex adapter, and honest usage limits | the non-terminal connection journey | Complete |
| M5 | Packaging: lean app-owned artifacts, installed-provider compatibility, update trust, user-approved updates, uninstall | shippable | In progress: M5.1 installed-provider/lean-runtime work |
| M6 | Codex adapter behind the seam | provider independence | Absorbed into M4.5 |

Each milestone lands with typecheck, tests, and lint green and is reviewed against this spec before
the next starts.
