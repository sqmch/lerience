# Windows console investigation

LB-014, source S12. Baseline `4c0258c`, Windows x64, Electron 43.4.0 and embedded
Node 24.18.1. Branch `codex/lb-014-console-flashes`. No production fix is proposed.
S12 does not establish the original provider/version, launching process or tool command.

## Launch audit

The app's Git creation/update launches, provider version probes, Claude readiness/login
launcher and Codex app-server launcher already set `windowsHide: true`. Claude tutor work
uses the installed client through the pinned Agent SDK, a different boundary from the
readiness launcher. Provider-owned shell descendants were not observed in this experiment.

The app runs doctor, quiz and npm checks through `ElectronUtilityProcessRunner`, which
captures stdout/stderr, bounds output and waits for exit. Doctor invokes Git synchronously
for status, the latest journal commit and subsequent course commits. These nested launches
do not specify `windowsHide`. QA also launches Git, validation and `npm run check`, the last
through a shell. Missing options identify candidates; they do not establish visible windows.
Course-authored check commands add another child-process boundary.

Editor launch deliberately uses `windowsHide: false` and detaches. Update installation and
provider sign-in are explicit learner actions. Nothing in S12 identifies those paths, and
this investigation changes none of them. ADR-004, ADR-013, ADR-021, ADR-025 and ADR-034
preserve provider ownership, course checks and intended native interactions.

## Native observation

The temporary diagnostic command
`pwsh -NoProfile -File dev/console-flashes/observe.ps1 -Label doctor-baseline` built and
verified the native entry before launch. It ran an Electron main process using the production
utility runner against a disposable template copy with synthetic tutor state and a committed
Git repository. It did not start the seminar UI or a live provider turn. App-data and course
files lived under `%TEMP%`; stable stdout/stderr files and capture remained under ignored `out/`.

The observer sampled Win32 process ancestry and visible `ConsoleWindowClass` windows, with
a two-millisecond delay between samples. Enumeration itself adds time. It collected no window
titles, command lines, screenshots or input. Electron launched hidden, with a 30-second outer
deadline and the production runner's 15-second child timeout. No physical interaction occurred.

The counted run had root PID 21280 and utility PID 14760. Three direct Git children of that
utility were 9920, 11116 and 37032, with console hosts 25100, 38792 and 14100 respectively.
Fixture-setup Git commands belonged to the main process and were distinguishable from these.
The console-host processes alone do not imply visible windows.

- Visible descendant console windows observed: zero.
- Doctor result: normal exit, code 0, parseable JSON and empty stderr.
- Both `uncommitted` and `unjournaled-commits` results were present and `ok`, confirming that
  the intended Git branches actually ran. All eight doctor results were `ok`.
- No provider was invoked, upgraded or reconfigured, and no installed course was inspected.

One earlier setup attempt stopped before launch because Electron's executable was missing.
After installing the pinned local development runtime, the first fixture lacked tutor state
and skipped Git inspection. That fixture was rejected and corrected; it is not evidence about
the suspected path. The counted run above is the only representative doctor observation.

## Conclusion and next action

The app-owned doctor path did not reproduce the reported flash. This does not rule out a
window shorter than the sampling interval, another window class or host outside the captured
ancestry, QA/npm children, provider shell work, or an installed-app environment difference.
The observer has no positive visible-window control, so this is bounded negative evidence,
not proof that all background windows stay hidden. No candidate fix or rerun was warranted.

Keep LB-014 Blocked pending a naturally occurring flash captured with the visible window's
PID/class and parent chain, provider version and tool stage. Arrange that capture with the
learner before observing an actual course; retain only metadata and keep course contents out
of published evidence. Use the capture to select one launch path and compare baseline versus
candidate while checking stdout/stderr and exit/error handling. Do not repeat this fixture or
expand a provider/model matrix without that new signal. Continue with LB-009.

The temporary diagnostic and local capture are retained under ignored `out/`; they are not
application changes or a supported monitoring tool. This report is source-runtime evidence,
not full learner-path acceptance, a packaged fix or a release.
