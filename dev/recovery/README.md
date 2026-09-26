# Interrupted-generation recovery comparison

This opt-in experiment runs the production conductor, Claude adapter and Electron utility
process runner against two disposable synthetic courses. It spends provider usage. It never
opens the installed app or an existing course. Run from the repository root after installing
the locked dependencies and Electron runtime:

```powershell
$env:RECOVERY_CLAUDE_EXE = (Get-Command claude).Source
node dev/recovery/launch.mjs --run
```

The launcher verifies the client and Electron paths, builds the native entry, checks that it
exists, and launches it with hidden windows. Output lives in a new OS temporary directory;
`out/recovery-location.txt` points to it. Nothing is deleted automatically, so the records and
Git history remain available for inspection. Never point this experiment at a real course.
Native stdout/stderr use timestamped files under `out/`, so a shell closing its output pipe
cannot turn a probe warning into a broken-pipe dialog. Probe exceptions are recorded locally
and exit the probe; production error handling is unchanged.

Both variants use Claude Sonnet 4.6 at medium effort, project instructions only, and automatic
tool approval inside the disposable experiment. The baseline copies the checked-out template.
The candidate inserts one proposed close instruction into its copy. This is an experimental
candidate, not a shipped tutor policy. The captured run's source revision belongs in its report.

The fixture includes independent accumulator evidence, a level-2 assisted empty-array answer,
unattempted transfer, an existing quiz history and an unfinished next-module lesson. That
module is initially absent from progress, so recovery must reconcile coverage without claiming
the draft was reviewed. No teaching or learning about the draft module occurred.

After fixture setup, each variant has an eight-minute asynchronous deadline covering
`conductor.start()`, recovery, the fresh opener and record capture. Success, failure and timeout
all abort the SDK controller and close every retained query before awaiting conductor cleanup.
A start that resumes after cancellation cannot create another query. Cleanup has a separate
ten-second limit; exceeding either deadline fails the probe and prevents the next variant.
This uses the SDK's process-termination API, not an interruption request followed by an
unbounded drain. A stalled-stub test covers admission and cleanup without contacting a provider.
Normalized provider errors and close failures are recorded. A completed capture is not a successful
close. Inspect the durable transcript lifecycle and learning-record deltas. Timings use a
monotonic clock; the provider interval includes model, tools and scheduling. Tool-result byte
counts describe serialized result envelopes, not tokens or journal text alone. File read
offsets and limits are recorded when supplied; shell reads and child-agent internals may be
unknown. No result contents or shell command bodies are retained by the committed runner.

This is one comparison, not a latency benchmark or native renderer acceptance. A negative
result does not disprove the historical learner incident. Do not repeat it to chase a desired
outcome. Normal `pnpm check` typechecks this code but never makes provider calls.
