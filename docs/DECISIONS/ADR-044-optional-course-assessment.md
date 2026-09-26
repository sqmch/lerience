# ADR-044: Optional portable assessment records

Date: 2026-09-26. Status: accepted. Amends ADR-002 and ADR-010; preserves ADR-003,
ADR-005, ADR-012, ADR-013 and learner authority in ADR-041.

The learner authorized finishing assessment for new courses after reviewing the existing
Brief design. Assessment is optional per activity. An authored Brief remains arbitrary prose,
code, commands and practical work. A numeric prediction with explanation can supplement it;
no course classification or mandatory question-answer format is introduced.

New Course Engine 0.3.0 templates carry `assessment-capability.json` with schema version 1
and capability `numeric-explanation-v1`. Base course format 0 and its marker remain unchanged.
This separately negotiated additive capability permits the app to invoke the course's own
`scripts/assessment.mjs` writer. Missing or unknown capability permits no assessment writes.
Existing courses are not upgraded, converted or inferred from answer files in this change.

The engine owns question, key and attempt schemas, checking and portable storage. Its optional
`curriculum/<module>/assessment.json` has ordered integer/explanation fields and reasoning
criteria. A separate `assessment-key.json` binds objective answers to the same question/version.
Question and key digests bind every `tutor/assessments/<UUID>.json` draft or submission. The
app owns no assessment copy in app-data. A folder copy retains its history; divergent copies
are independent, and the existing registry collision check prevents accidental merging.

The app may save raw drafts, explicitly submit them, append learner help/dispute notes and
record explicit review delivery. The canonical writer rejects links and stale revisions,
uses a per-course cooperative process lock and atomic replacement, and preserves immutable
submitted snapshots. Repeat submission of the same saved revision is idempotent. Changed
questions require a new version and a separate draft. Read projections omit objective keys
until submission. This prevents accidental answer disclosure, not inspection by the owner.

Review is separate from local submission and uses existing provider admission. It never starts
a tutor automatically. An interrupted request stays uncertain and requires an explicit retry;
there is no exactly-once provider claim. Tutor feedback appends with an ID, original attempt
digest, criterion results, submitted excerpts and rationale. Schema/binding checks establish
record shape, not semantic correctness. A dispute or later review preserves previous feedback.

Numeric checks and reasoning feedback never update progress, mastery, boss checks or recall
grades. Existing tutor completion rules and learner decisions remain authoritative. The
app-mediated writer is the narrow exception to ADR-010's marker-only rule; transcripts and
preferences still live in app-data. Sandbox visuals gain no capability. New providers,
generic forms, reading annotations, existing-course migrations and releases are out of scope.

Acknowledged drafts survive interruption. Pending writes block ordinary module/course exit
and window close; failed input stays visible with retry/copy. A hard crash can lose input
not yet acknowledged. Cooperating app/CLI writers serialize; arbitrary owner edits are checked
for conflict but this is not a security boundary against an active filesystem attacker.
