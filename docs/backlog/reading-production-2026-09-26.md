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

## Verification

Windows x64, Node 24.18.0, pnpm 11.9.0. Seven engine cases cover portable save/remove,
uncertain acknowledgement retry, duplicates/overlaps, source/revision/identity conflicts,
conservative edited/missing anchors, linked paths, corrupt scalar records, external writes and
quota refusal. Focused service tests cover inactive/legacy rejection and lost-reply recovery.
Renderer regressions cover legacy reading, failed-write quote/ID retention, cross-module pending
navigation, and the saved list after deleting the only lesson/module. A same-event navigation
case verifies the synchronous guard before React commits its state update.

Headless Chromium exercised 17 checks with the real production component: ordinary pointer
selection/copy, actual right-click Copy/Highlight, unchanged lesson DOM, keyboard range saving,
Shift+F10 / Context Menu, return focus, removal, Lesson reopen, conservative source changes,
normal link context and zero tutor sends. Clean/selected/list screenshots were inspected.
The harness storage adapter is memory-only; these checks do not prove persistence.

The hidden native probe passed with Electron 43.4.0 / Node 24.18.1 after verified production and
probe builds. It created a new CourseCreator course, used real preload and utility-process IPC,
lost a post-commit acknowledgement and retried the same ID, reopened a renderer, copied the course
without app-data, retained the missing-source quote, and removed it. Original lesson, progress
and quiz bytes stayed unchanged. The initial native probe caught a sandbox-incompatible Zod
import from the channel constant; the constant now uses the existing shared IPC module. Both
attempts have persistent logs. No provider, private course, foreground takeover or release ran.

Independent Standards and Spec reviews cleared correction head `8434b4f`. Its hosted Windows
run passed all 609 app tests with 6 skipped and all 76 engine tests, then found two lint issues.
The correction imports Node URL explicitly and gives the read-generation cleanup a stable
callback. Final-head CI remains the merge gate.

The local full `pnpm check` attempt passed publication/type/harness checks but ended with
580 app tests passed, 6 failed, 6 skipped and 4 worker-start errors. Failures included the
existing piped PowerShell launcher, timeouts in provider/updater/runtime tests and a reading
service case that had passed in isolation. No timeout or test configuration was weakened.
Remaining engine, lint and build stages are recorded separately before handoff. This is
bounded storage/interaction acceptance, not learning-benefit or screen-reader acceptance.

The owned browser and port 5297 preview server were stopped; both hidden probes exited.
Native logs and screenshots were retained outside the repository. Automatic approval review
rejected deletion of two verified reading-only temporary fixtures with a generic policy block.
They remain at `%TEMP%/lerience-reading-native-1o5veV` and
`%TEMP%/lerience-reading-native-6y430f`; deletion was not retried. The six assessment fixtures
were not touched.
