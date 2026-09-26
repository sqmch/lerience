# Native model-choice acceptance

`run.ts` is an opt-in, bounded first-turn check through the production conductor and both
provider adapters. It uses a synthetic one-line protocol, temporary app-data, installed provider
executables and their existing authentication. It never changes provider settings or permissions.

Bundle `run.ts` as a Vite SSR entry with `electron` and `@anthropic-ai/claude-agent-sdk` external,
into `out/model-choice/run.js`. Verify the build exit code and that entry's existence, then launch
it with the worktree's Electron executable. On Windows use a hidden process and redirect stdout
and stderr to files under `out/`. The probe writes its fixture location to
`out/model-choice-location.txt` and normalized evidence to `capture.jsonl` there.

Each provider has a 180-second work budget and a ten-second cleanup budget. The probe retains and
closes the SDK/App Server handles before abandoning the conductor. Successful output contains one
`before-confirmation` record with zero inputs and one `passed` record with exactly one input per
provider, along with the chosen and confirmed model. Codex also records the first turn's wire model.
The fixture asks for a short reply and no tools; it does not generate or recover a real course.
