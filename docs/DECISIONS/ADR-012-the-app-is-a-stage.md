# ADR-012 — The app is a stage for course-authored tools

Date: 2026-08-11 · Status: accepted

## Decision

Course-authored interactive teaching tools are a **first-class product surface**, not an
embellishment. The renderer ships a permanent, safe stage for them:

- **Stock labs** — the engine's registry of configurable visualizations, claimed by a module's
  `lab.json`, continue to work exactly as the engine defines them.
- **Custom visuals** — self-contained `visuals/*.html` written by the tutor for this learner's
  specific struggle, rendered in a hard sandbox: null-origin frame, CSP blocking all network,
  no IPC, no filesystem — the same discipline the engine's study already applies, kept under
  Electron.
- Labs embed in lessons where the picture belongs (the ```visual fence) and open full-screen.
  The lab surface gets the same design attention as the chat and the material pane.
- The set of tools is **open-ended by design**. The app defines the frame and the safety
  contract, never a fixed widget vocabulary. Whatever a frontier model can express as a
  self-contained interactive page, the course can teach with.

## Why

- This is where frontier models visibly shine, and the capability is compounding with every
  model release — a course that writes its own vector-math manipulative for the learner who is
  struggling with projections (the real `fundaimentals` example) teaches something prose
  cannot. Handcuffing it to a fixed widget kit would forfeit the product's clearest
  differentiation and contradict the core goal of growing with the models rather than aging
  against them.
- The engine already proved both the mechanism and the pedagogy rules ("only when a picture
  genuinely teaches", "never decorative", derive it from the LESSON just written, adapt it
  mid-session when a misconception surfaces). The app inherits earned design, not a new bet.
- The safety story is already solved by the same principle that protects the rest of the
  renderer (privilege separation): model-authored content runs where it can draw and compute
  but cannot reach disk, network, or IPC. Freedom of expression inside a hard boundary — the
  same capability-vs-authority split as ADR-005 and ADR-011.
- Product positioning: "courses that build their own teaching tools" is a landing-page pillar
  (SPEC §9). The claim must be true in the product before it is sharp in the copy.

## Rejected

- A fixed widget/chart library as the only visual vocabulary (the handcuffs this ADR exists to
  refuse). Unsandboxed rendering of course-authored HTML (model-written code with renderer
  privileges). Network-enabled visuals (a data-exfiltration path from model-authored code; the
  engine's no-network CSP stands). An app-curated visual marketplace (courses are personal
  artifacts; ADR-002).

## Reopens if

- A genuinely valuable class of course tool needs a capability the sandbox denies (e.g. local
  compute against course data, or persistence). Then design an explicit, narrow capability
  grant as its own decision — never a general loosening of the sandbox.
