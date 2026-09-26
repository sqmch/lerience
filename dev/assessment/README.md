# Native assessment storage acceptance

The probe creates a fresh synthetic course through CourseCreator and exercises the real
preload, assessment service and Electron utility-process writer in hidden windows. It verifies
large input transport, local save/submit/reopen, copied history and a near-limit flushed reply.
It makes no provider call and changes no installed app or private course.

Build the app first so the real preload exists. Bundle `run.ts` with Vite SSR into
`out/assessment/run.js`, externalizing Electron. Verify build success and entry existence before
launching the worktree Electron executable with a hidden process and persistent stdout/stderr.
The probe has a two-minute deadline. `out/assessment-location.txt` points to its temporary course
and `capture.jsonl`; the final record states the exact checks and runtime. Keep evidence until
review, then remove only that verified temporary directory. This is storage/IPC evidence,
separate from renderer behavior tests and manual learning evaluation.
