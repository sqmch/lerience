# New-course reading highlights

LB-015 owner task `01a0ddfc-3365-7a51-bc76-1503db3a117a`, branch
`codex/lb-015-new-course-highlights`, baseline `d9d3d08bb1336dae4564e7677f18ef3f7c57c1b8`.
Status: production implementation and validation in progress. ADR-045 accepts the narrow
new-course authority. Earlier PR #104 was a memory-only visual prototype.

Engine 0.4.0 negotiates portable learner highlights separately from assessment. Production
CourseView uses ReadingLesson; the renderer harness reuses it with stub storage. Contextual
selection, right-click, Shift+F10 / Context Menu, keyboard paragraph choice and a compact
course-wide list preserve ordinary reading. No permanent action row, count or banner.

Records survive reopen and folder copy in `tutor/reading-marks.json`. The bounded engine writer
validates record revisions, source digests, paragraph/range/quote agreement, links and conflicts.
Same-ID retry resolves an uncertain acknowledgement. Missing/changed/ambiguous anchors retain
saved quotes without guessing a target. Marks never send tutor messages or change lesson,
progress, quiz or assessment state. Missing/unknown capability leaves ordinary reading.

Validation evidence will record focused engine/service/renderer cases, contextual browser
checks, one disposable CourseCreator + real preload/utility save/reopen/copy run, full source
checks, independent review and final-head hosted Windows CI. No provider matrix, private course
inspection, existing-course migration, learner-benefit claim or distributable release is included.
