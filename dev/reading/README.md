# Native reading storage acceptance

Build the production app so `out/preload/index.cjs` exists, then bundle `run.ts` with Vite SSR
into `out/reading/run.js`, externalizing Electron. Verify both build success and entry existence
before launching the worktree Electron executable with a hidden window and persistent logs.

The finite two-minute probe creates a synthetic course through CourseCreator, invokes the real
preload/service/utility writer, deliberately loses a save acknowledgement, retries its ID,
reopens the hidden renderer, copies the folder, retains a missing-source quote, and removes it.
It verifies original lesson/progress/quiz bytes and uses no provider or private course.

`out/reading-location.txt` identifies the owned temporary fixture and its `capture.jsonl`.
Keep the log as evidence, then remove only that verified temporary directory. This is native
storage/IPC evidence; contextual controls have separate renderer and headless browser checks.
