# In-app assessment

<a id="lb-016"></a>
## LB-016: Answer non-code exercises in the app

P2, product and assessment discovery. Source S17. See the [register](README.md) for status.
The portable assessment architecture remains proposed. A development-only visual preview below
supports interface review before production implementation. Schedule it ahead of LB-015.

Discovery owner: task `01a0ddef-68d1-7222-ba4d-785225359c96`, branch
`codex/lb-016-assessment-design`, under orchestrator `01a0d98c-a787-7223-9b86-5fd61f99abf6`.
Source baseline: `affd3a480b17e8b8116a8f645069efc5e5de0e21`, current main on 2026-09-26.

Discovery is ready for product review. The [concrete recommendation](assessment-design-2026-09-26.md)
compares three original tasks and selects one standard in-app trace with explanation, portable
drafts and attempt history. The remaining decision is whether to accept engine-owned attempt
records and a bounded app writer, amending ADR-002/010 before implementation. Custom submission
is deferred; ADR-012's sandbox stays unchanged. This completes the discovery stopping point
below, not the feature. Implementation stages and evaluation limits are in the recommendation.

[PR #101](https://github.com/sqmch/lerience/pull/101) contains the documentation proposal.
Independent Standards and Spec reviews cleared `f8fc9cc`. Publication hygiene, whitespace,
45 local document links and the synthetic answer arithmetic passed. This is documentation
evidence only; final-head hosted CI and merge review are tracked in the PR. No runtime or
private-course probe was needed, and no source change required a full local `pnpm check`.

## Visual preview

Visual follow-up, 2026-09-26: the learner authorized disposable assessment and reading previews
to judge fit with the existing design language. Assessment proceeds first in task `01a0ddef`,
branch `codex/lb-016-assessment-visual-prototype`, from main `f1f88a2`. It mounts a synthetic
trace and explanation in the real course shell and Brief. Saves and reviews are simulated
in the development renderer harness; no production assessment, disk persistence, provider
review or private-course conversion is enabled. Visual acceptance and portable-record authority
are separate decisions. Reading preview work remains LB-015.

The learner provisionally accepted the visual direction and explicitly required topic-driven,
optional assessment. The preview now supplements ordinary Brief prose rather than replacing it.
A mixed coding example retains instructions, commands, editor access and Run checks, while
another activity uses only a sketch and conversation. This is not a universal course format.

The [preview and evidence](assessment-preview-2026-09-26.md) in
[PR #103](https://github.com/sqmch/lerience/pull/103) are ready for review. Source checks
and synthetic interaction checks do not establish saved course attempts or learner acceptance.

## Learner problem

The learner repeatedly had to open a repository and enter answers as JSON values even when
the task was conceptual reasoning or interview preparation. They propose in-app questions
and tutor-authored interactions, including more creative ways to demonstrate knowledge. They
also ask whether the exercise format itself serves learning, rather than assuming a new form
would make every existing question worthwhile.

Working product principle: choose the response interaction for the skill being practised.
Writing JSON should be required when JSON authoring is part of the intended outcome. It need
not be the interface for a numeric prediction, choice, explanation, or ordered trace.
Local files can remain the storage format while the app handles entry and serialization.

## Evidence from the course

Read-only inspection on 2026-09-25 of the maintainer-designated interview-preparation course:

- All 13 generated modules, 00 through 12, contain `scaffold/answers.json`, and every brief
  names it. This establishes prevalence in this course, not in all Lerience courses.
- Module 06 explicitly calls its exercise a state trace rather than an implementation task.
  It asks for numbers, Booleans, categories, and request/file names across successive states.
  Module 11 explicitly calls itself interview preparation rather than a build; its JSON
  fields include multiple-choice answers and Booleans. Module 12 uses JSON for an on-screen
  fact-finding exercise before a spoken mock.
- Module 10 mixes factual answer entry with a real regression test and configuration change.
  A course-wide technical/nontechnical switch would mishandle that mixture.
- The module 11 review records JSON answer-form clarification after number-versus-string
  errors in module 10. It also records missing actual questions, answer-revealing wording,
  and string-matching exercises that needed revision. The journal says the learner still
  caught missing questions after two cold reviews.
- Module 11's check reads JSON, trims strings, and compares digests of exact expected values.
  That checks encoded choices; it does not establish the quality of the learner's explanation.
  Exact matching may suit a fixed choice or identifier, but is not a general reasoning rubric.
- The journal records a later correction to a terminology judgment that had been too strict.
  It does not establish that an automated checker made that particular mistake.
- The course already separates chat comprehension checks, checked artifacts, and spoken or
  chat-based completion gates with changed scenarios. Preserve that distinction. Moving the
  same answers into a form does not by itself establish independent understanding.

Inspection included the course plan, briefs across all modules, representative exercises,
module 11 checks/review, and relevant journal entries. It was not a full audit of every lesson
or grader. No course scripts were run or course files changed. Keep personal answers, journal
text, source snapshots, and identifying paths out of the public backlog and future fixtures.
Use original synthetic exercises to reproduce these interaction patterns.

## What may generalize

There are two connected questions to investigate separately:

1. **Response entry.** Can the learner answer where the question appears, save partial work,
   submit deliberately, understand feedback, and return without handling serialization?
2. **Assessment quality.** Is the question clear, does the response demonstrate the intended
   skill, and does the feedback distinguish an incorrect concept from a formatting mistake?

The current [engine protocol](../../course-engine/template/CLAUDE.md) describes a brief as a
build task and scaffolds as runnable gaps. [ADR-013](../DECISIONS/ADR-013-presence-based-affordances.md)
then exposes editor controls whenever a scaffold exists. A plausible design pressure is that
non-code questions get packaged as code exercises to fit that loop. This is a hypothesis about
the format, not proof of why the tutor made each authoring choice. The inspected course also
explicitly required runnable checks for a factual or behavioral portion of every module, so
its own instructions may have reinforced the pattern.

Question-answer practice can have learning value. In controlled experiments, repeated testing
improved delayed retention and transfer compared with restudying, including new inference
questions. [Butler, 2010](https://pubmed.ncbi.nlm.nih.gov/20804289/). Practice applying a concept
to different examples also improved transfer to new examples compared with repeating the same
example. [Butler and colleagues, 2017](https://pubmed.ncbi.nlm.nih.gov/29265856/). These studies
support testing retrieval and application in a prototype; they do not validate this course's
graders, prove one UI format best, or justify turning all tasks into multiple choice.

## Direction to evaluate

Let the tutor author the question, scenario, and suitable interaction. Let Lerience own a
consistent attempt lifecycle: draft, explicit submission, feedback, revision, and retrieval
of prior attempts. That boundary can support both ordinary controls and custom course tools.

| Learning task | Candidate interaction | Evidence boundary |
| --- | --- | --- |
| Recall or explanation | Short free response or the existing tutor conversation | Assess the reasoning against stated criteria; preserve independent and assisted attempts separately. |
| Numeric prediction or genuine fixed choice | Native numeric/choice controls with question text and units | App validates entry shape; the assessment checks the subject answer. |
| Trace, ordering, classification | A state table, ordering exercise, or matching interaction | Use a changed case and consider an explanation; correct arrangement alone may be insufficient. |
| Dynamic scenario | Tutor-authored sandboxed tool, such as predict then reveal or diagnose a simulated fault | Record the learner's prediction before revealing feedback, and define what the attempt proves. |
| Implementation, configuration, or source navigation | Real editor and working artifacts where those are the skill | Keep behavioral checks and independent explanation of the work. |

Compare a standard app-rendered question contract, custom tutor-authored tools using a narrow
submission contract, and the existing chat flow. A hybrid is a candidate, not a decision.
The goal is useful authoring freedom with a predictable learner experience, not a fixed
widget-only product or a new handwritten mini-app for every simple question.

[ADR-012](../DECISIONS/ADR-012-the-app-is-a-stage.md) already supports open-ended course-authored
HTML tools. Its sandbox deliberately has no filesystem or IPC capability; persistence is an
explicit reason to revisit the decision. An assessment tool therefore needs an app-mediated
submission/persistence design, not general disk access. Presentation and storage schema
validation must also remain distinct from permission to record completion or mastery.

## First discovery session

1. Use three synthetic tasks: a choice/numeric question, a changed-state trace with explanation,
   and a mixed module with genuine code work. Compare current JSON entry, standard in-app
   entry, and whether a custom interaction adds anything useful. Include chat as the simpler
   option for a one-off reasoning question.
2. Define the minimum question/attempt contract: stable IDs, question version, prompt and
   response shape, drafts, explicit submission, feedback, assistance, and interrupted-session
   recovery. Decide ownership and portable local storage. Clarify how source edits or tutor
   regeneration invalidate or preserve earlier attempts.
3. Define grading by task: deterministic checks where the answer is objective, explicit tutor
   criteria for explanations, and a visible uncertain/disputed result where needed. Decide
   how the tutor receives an attempt and how existing progress and spaced-recall records use
   it without turning a passing form check into automatic mastery.
4. Review engine generation, QA, and learner-side review requirements so questions have prompts,
   answerable tasks, correct feedback, and no accidental answer disclosure. Reconcile existing
   courses through explicit compatibility/update behavior. JSON answers can remain supported
   for legacy exercises without remaining the default learner interaction.
5. Choose one bounded prototype and record the architectural decisions it needs before building
   persistence or expanding assessment authority. Update canonical pedagogy in the engine.

Discovery is done when it selects that prototype or documents why to defer it, with an
interaction sketch, contract, compatibility plan, and testable evaluation. A prototype should
show that a non-code exercise can be completed, interrupted, reopened, and reviewed entirely
in the app; a mixed exercise must still support genuine editor work. Include keyboard access,
clear error feedback, and no answer loss or duplicate submissions.

Evaluate entry/format errors and friction separately from learning evidence. A learner run
should also include an independent explanation or changed case after the exercise, with
assistance recorded. A successful UI test proves interaction behavior, not better teaching.
Split implementation into focused follow-ups after discovery; do not build all formats here.

Start with the canonical protocol and `docs/FORMAT.md` under `course-engine/template/`,
[`qa-module.mjs`](../../course-engine/template/scripts/qa-module.mjs),
[`material.tsx`](../../src/renderer/src/course/material.tsx),
[`lab-overlay.tsx`](../../src/renderer/src/course/lab-overlay.tsx), and
[`visual-protocol.ts`](../../src/main/visual-protocol.ts). Coordinate with LB-015 on selection
and tutor context, and LB-003 on honest review activity. None of those existing items covers
assessment entry or grading quality on its own.
