# Native context sample

`run.ts` checks one short synthetic reply per installed provider through the production adapters
and conductor. It logs only version, selected control, numeric telemetry and completion evidence.
The fixture uses temporary course/app-data directories and existing provider authentication.

Bundle it with Vite SSR into `out/context-usage/run.js`, with `electron` and
`@anthropic-ai/claude-agent-sdk` external. Check the build exit and entry existence before launching
with the worktree Electron executable. On Windows use a hidden process with stdout/stderr
redirected to `out/context-usage.stdout.log` and `out/context-usage.stderr.log`.

The fixture path is recorded in `out/context-usage-location.txt`; `capture.jsonl` there contains
the retained numerical evidence. Each provider has a 180-second deadline and ten-second cleanup
budget. Successful output includes `context-verified` and `passed` for both providers.
No long conversation, forced compaction, private course or provider upgrade is needed.
