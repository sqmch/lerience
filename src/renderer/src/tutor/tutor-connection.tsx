import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { PRODUCT_NAME } from "../../../shared/product";
import type { ProviderReadiness, TutorProviderId } from "../../../shared/provider";
import { GHOST, PRIMARY, QUIET } from "../components/controls";
import { CheckGlyph, ChevronDownGlyph, ChevronLeftGlyph, SpinnerGlyph } from "../components/glyphs";
import { MENU_PANEL, MENU_ROW, MENU_TICK } from "../components/menu";
import { isReady, needsRepair, providerPrimaryAction, statusLabel } from "./provider-presentation";
import type { TutorConnectionController } from "./use-tutor-connection";

/* `block` is load-bearing, not tidiness: a bare <span> is inline, and width and
   height do not apply to an inline box. As a direct flex child it was fine, but
   the moment it was wrapped in a plain span (the menu row) it painted at 0×0 —
   an invisible dot that still reserved a gap, which is why the menu's labels
   looked mysteriously indented. */
function StatusDot({ provider }: { provider: ProviderReadiness }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={
        isReady(provider)
          ? "bg-ok block size-1.5 shrink-0 rounded-pill"
          : needsRepair(provider)
            ? "bg-warn block size-1.5 shrink-0 rounded-pill"
            : "bg-ink-faint block size-1.5 shrink-0 rounded-pill"
      }
    />
  );
}

function resetLabel(resetsAt: number | null): string | null {
  if (resetsAt === null) return null;
  const reset = new Date(resetsAt * 1_000);
  if (!Number.isFinite(reset.getTime())) return null;
  const now = new Date();
  const sameDay =
    reset.getFullYear() === now.getFullYear() &&
    reset.getMonth() === now.getMonth() &&
    reset.getDate() === now.getDate();
  const formatted = new Intl.DateTimeFormat(undefined, {
    ...(sameDay ? {} : { weekday: "short" }),
    hour: "numeric",
    minute: "2-digit",
  }).format(reset);
  return `Resets ${sameDay ? "at " : ""}${formatted}`;
}

function UsageWindows({ provider }: { provider: ProviderReadiness }): React.JSX.Element | null {
  if (provider.usage === null || provider.usage.windows.length === 0) return null;
  return (
    <div
      className="border-line mt-4 space-y-3 border-t pt-3.5"
      aria-label={`${provider.label} usage`}
    >
      {provider.usage.windows.map((window) => {
        const percent = Math.round(window.usedPercent);
        return (
          <div key={window.label}>
            <div className="text-ink-faint flex items-baseline gap-2 text-2xs">
              <span>{window.label}</span>
              <span className="font-data ml-auto">{percent}% used</span>
            </div>
            {/* The track has to be VISIBLE or the meter is not a meter: at
                --line-soft it sat two points off the card's own ground, so a
                36% bar read as a stray underline under the label rather than
                as a third of something. The fill is --ink-dim, not --accent:
                a spent allowance is a readout, and ADR-015 keeps the action
                colour from doubling as a status. */}
            <div
              className="bg-line-strong mt-1.5 h-1 overflow-hidden rounded-pill"
              role="progressbar"
              aria-label={window.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <span
                className="bg-ink-dim block h-full rounded-pill"
                style={{ width: `${String(percent)}%` }}
              />
            </div>
            {resetLabel(window.resetsAt) === null ? null : (
              <p className="text-ink-faint mt-1 text-2xs">{resetLabel(window.resetsAt)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function menuDetail(provider: ProviderReadiness): string {
  const primary = provider.usage?.windows[0];
  const usage =
    primary === undefined
      ? null
      : `${String(Math.round(primary.usedPercent))}% of ${primary.label} used`;
  if (provider.connection !== "connected") return provider.detail ?? provider.description;
  return (
    [provider.accountLabel, usage].filter((value): value is string => value !== null).join(" · ") ||
    provider.description
  );
}

function WaitingForLogin({
  provider,
  cancelling,
  onCancel,
}: {
  provider: ProviderReadiness;
  cancelling: boolean;
  onCancel: () => void;
}): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-(--container-start) flex-col items-center text-center">
      <SpinnerGlyph className="text-ink-dim animate-spin size-5" />
      <h1 className="text-hi mt-5 text-2xl font-bold tracking-tight text-balance">
        Finish signing in to {provider.label}
      </h1>
      <p className="text-ink-dim mt-3 max-w-prose text-md leading-normal text-pretty">
        {provider.label} opened its own sign-in in your browser. {PRODUCT_NAME} will continue as
        soon as the provider confirms your account.
      </p>
      <button
        type="button"
        className={`${QUIET} mt-7 text-sm`}
        disabled={cancelling}
        onClick={onCancel}
      >
        {cancelling ? "Cancelling…" : "Cancel"}
      </button>
    </div>
  );
}

/** The one screen that answers "who teaches this".
 *
 *  It is reached two ways, and the difference is which way OUT it offers.
 *  `onBack` is the just-in-time gate: a course is already open and the way out
 *  is back to the courses list. `onDefer` is first run, where there is no
 *  behind yet — the app opened straight onto this question — so the way past
 *  is forward, into an empty dashboard, and it is deliberately the quietest
 *  thing on the screen. A surface can carry one or the other; carrying both
 *  would be two answers to "where does this button go". */
export function TutorConnectionGate({
  connection,
  onBack,
  onDefer,
}: {
  connection: TutorConnectionController;
  onBack?: () => void;
  onDefer?: () => void;
}): React.JSX.Element {
  const activeLogin =
    connection.loggingIn === null
      ? null
      : (connection.catalog.providers.find((provider) => provider.id === connection.loggingIn) ??
        null);

  return (
    <section
      className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-8 py-12"
      aria-label="Choose your tutor"
      aria-busy={connection.checking || activeLogin !== null}
    >
      {onBack === undefined ? null : (
        <button
          type="button"
          className={`${GHOST} absolute top-4 left-4 text-sm`}
          disabled={connection.cancelling}
          onClick={() => {
            if (connection.loggingIn === null) onBack();
            else void connection.cancelLogin().then(onBack);
          }}
        >
          <ChevronLeftGlyph className="size-3.5" />
          <span>Courses</span>
        </button>
      )}

      {activeLogin !== null ? (
        <WaitingForLogin
          provider={activeLogin}
          cancelling={connection.cancelling}
          onCancel={() => void connection.cancelLogin()}
        />
      ) : connection.checking ? (
        <div className="flex flex-col items-center gap-4" role="status">
          <SpinnerGlyph className="text-ink-dim animate-spin size-5" />
          <p className="text-ink-dim text-sm">Checking your tutors…</p>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-(--container-converse) text-center">
          <p className="text-ink-faint text-sm">One quick choice before the conversation starts</p>
          <h1 className="text-hi mt-1.5 text-3xl font-bold tracking-tight text-balance">
            Choose your tutor
          </h1>
          {/* The explicit space is load-bearing. JSX keeps the newline between
              two words as a space, but DROPS it between an expression and the
              next line — so this sentence shipped reading "Leriencenever sees
              your password". */}
          <p className="text-ink-dim mx-auto mt-3 max-w-(--container-start) text-md leading-normal text-pretty">
            Use a subscription you already have. Sign-in stays with the provider, and {PRODUCT_NAME}{" "}
            never sees your password or credentials.
          </p>

          <div
            className={
              connection.catalog.providers.length === 1
                ? "mx-auto mt-8 grid max-w-(--container-start) gap-3 text-left"
                : "mt-8 grid gap-3 text-left md:grid-cols-2"
            }
          >
            {connection.catalog.providers.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                selected={connection.catalog.selectedProviderId === provider.id}
                onSelect={(providerId) => void connection.select(providerId)}
                onLogin={(providerId) => void connection.login(providerId)}
                onGuide={(providerId) => void connection.openGuide(providerId)}
                onRefresh={(providerId) => void connection.recheck(providerId)}
              />
            ))}
          </div>

          {connection.catalog.providers.length === 0 ? (
            <p className="text-ink-dim bg-surface-raised border-line mt-8 rounded-lg border p-5 text-sm">
              This development build has no tutor runtime available yet.
            </p>
          ) : null}

          {connection.error === null ? null : (
            <div className="mt-5" role="alert">
              <p className="text-bad text-sm">{connection.error}</p>
              <button
                type="button"
                className={`${QUIET} mt-3 text-sm`}
                onClick={() => void connection.refresh()}
              >
                Check again
              </button>
            </div>
          )}

          {onDefer === undefined ? null : (
            <p className="mt-8">
              <button type="button" className={`${GHOST} text-sm`} onClick={onDefer}>
                Set this up later
              </button>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ProviderCard({
  provider,
  selected,
  onSelect,
  onLogin,
  onGuide,
  onRefresh,
}: {
  provider: ProviderReadiness;
  selected: boolean;
  onSelect: (providerId: TutorProviderId) => void;
  onLogin: (providerId: TutorProviderId) => void;
  onGuide: (providerId: TutorProviderId) => void;
  onRefresh: (providerId: TutorProviderId) => void;
}): React.JSX.Element {
  const connected = provider.connection === "connected";
  const action = providerPrimaryAction(provider);
  /* The white border says "this is the one that teaches your next session",
     so it may only appear on a card where that is TRUE. Keyed on `selected`
     alone it appeared on whichever provider the preference happened to name —
     which, on a fresh install with nothing signed in, meant the loudest card
     on the screen was the one that could not run anything. */
  const chosen = selected && connected;
  return (
    <article
      className={
        chosen
          ? "bg-surface-raised border-hi flex min-h-48 flex-col rounded-lg border p-5 transition-colors"
          : "bg-surface-panel border-line hover:border-line-strong flex min-h-48 flex-col rounded-lg border p-5 transition-colors"
      }
    >
      <div className="flex items-center gap-2">
        <StatusDot provider={provider} />
        <h2 className="text-hi text-lg font-bold tracking-tight">{provider.label}</h2>
        {/* Peripheral ink is for rules and placeholders. "Sign in" is neither:
            it is the one fact on the card the learner has to act on, and it was
            set two steps quieter than the plan label beside it. */}
        <span
          className={
            needsRepair(provider) ? "text-warn ml-auto text-xs" : "text-ink-faint ml-auto text-xs"
          }
        >
          {statusLabel(provider)}
        </span>
      </div>
      <p className="text-ink-dim mt-3 text-sm leading-normal text-pretty">{provider.description}</p>
      {provider.accountLabel === null ? null : (
        <p
          className="text-ink-faint font-data mt-3 truncate text-2xs"
          title={provider.accountLabel}
        >
          {provider.accountLabel}
        </p>
      )}
      {provider.detail === null ? null : (
        <p className="text-ink-faint mt-3 text-xs leading-normal text-pretty">{provider.detail}</p>
      )}
      <UsageWindows provider={provider} />
      {/* The wrapper is what carries the gap. `mt-auto` on the button itself
          pins it to the bottom and leaves NO room above it — which on a card
          whose usage block runs the full height put "Use Codex" flush against
          "Resets Sat 10:00 AM". An auto margin cannot also be a minimum, so
          the padding has to sit on a box that is not the one being pushed. */}
      <div className="mt-auto pt-5">
        <button
          type="button"
          className={`${connected ? PRIMARY : QUIET} text-sm`}
          onClick={() => {
            if (action.kind === "select") onSelect(provider.id);
            else if (action.kind === "login") onLogin(provider.id);
            else if (action.kind === "guide") onGuide(provider.id);
            else onRefresh(provider.id);
          }}
        >
          {action.kind === "select" && selected ? "Selected" : action.label}
        </button>
      </div>
    </article>
  );
}

/** Quiet dashboard control. The menu uses the same normalized facts as the
 * full gate, but does not turn the dashboard into a settings page.
 *
 * It is built from Radix's parts rather than from `components/menu.tsx`'s
 * `Menu`, because a row here carries four facts (which tutor, whether it is
 * connected, which plan, how much of it is spent) where `Menu` carries a label
 * and a line. It shares that menu's SURFACE — panel, row ground, tick column —
 * so the two cannot drift into two looks.
 *
 * The connection is passed in rather than probed here. Readiness costs a real
 * provider process, and the surface that shows this menu is also the one
 * deciding whether to show the first-run gate instead — two independent probes
 * could disagree, and the app would route past a question its own menu was
 * still asking. */
export function TutorControl({
  connection,
  className = "",
}: {
  connection: TutorConnectionController;
  className?: string;
}): React.JSX.Element {
  const selected = connection.selected;
  const triggerLabel = connection.checking
    ? "Checking tutor"
    : connection.loggingIn === null
      ? (selected?.label ?? "Choose tutor")
      : `Waiting for ${selected?.label ?? "tutor"}`;

  /* Choosing a tutor and signing one in are the same gesture from the
     learner's side — both answer "who teaches the next session" — so the
     radio group owns both, and `login` selects before it opens the browser. */
  const choose = (providerId: string): void => {
    const provider = connection.catalog.providers.find((candidate) => candidate.id === providerId);
    if (provider === undefined) return;
    const action = providerPrimaryAction(provider);
    if (action.kind === "select") void connection.select(provider.id);
    else if (action.kind === "login") void connection.login(provider.id);
    else if (action.kind === "guide") void connection.openGuide(provider.id);
    else void connection.recheck(provider.id);
  };

  return (
    <DropdownMenu.Root>
      {/* No focus ring: Radix returns focus to the trigger when the menu
          closes, and the browser counts that as focus-visible — so every use
          of the control left a blue ring sitting on the dashboard afterwards.
          Focus is still shown, in the menu's own vocabulary (the same wash the
          open and hover states use) rather than in the OS blue. */}
      <DropdownMenu.Trigger
        className={`text-ink-dim hover:text-hi hover:bg-accent-wash focus-visible:bg-accent-wash focus-visible:text-hi data-[state=open]:bg-accent-wash data-[state=open]:text-hi flex items-center gap-2 rounded-pill px-3 py-2 text-sm outline-none transition-colors ${className}`}
      >
        <span className="sr-only">Tutor for the next session:</span>
        {connection.checking || connection.loggingIn !== null ? (
          <SpinnerGlyph className="animate-spin size-3.5" />
        ) : selected === null ? (
          /* Amber, not the peripheral grey it used to be. "No tutor chosen" is
             precisely the state ADR-015 reserves colour for — one the learner
             has to repair before a session can start — and painting it grey is
             how the dashboard managed to say "Choose tutor" without anybody
             reading it as something they had to do. */
          <span className="bg-warn block size-1.5 rounded-pill" aria-hidden="true" />
        ) : (
          <StatusDot provider={selected} />
        )}
        <span>{triggerLabel}</span>
        <ChevronDownGlyph className="size-2.5 shrink-0 opacity-60" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className={`${MENU_PANEL} w-80`}
        >
          {/* Indented past the tick column so the heading starts on the same
              vertical as the names it heads, instead of hanging a step left of
              them the way a stray label does. */}
          <DropdownMenu.Label className="text-ink-dim pt-1.5 pr-2.5 pb-2 pl-7.5 text-2xs">
            Tutor for the next session
          </DropdownMenu.Label>

          <DropdownMenu.RadioGroup value={connection.catalog.selectedProviderId ?? ""}>
            {connection.catalog.providers.map((provider) => (
              <DropdownMenu.RadioItem
                key={provider.id}
                value={provider.id}
                onSelect={() => choose(provider.id)}
                className={`${MENU_ROW} data-[state=checked]:text-hi flex cursor-pointer flex-col gap-1 px-2.5 py-2`}
              >
                <span className="flex items-center gap-2">
                  <span className={MENU_TICK}>
                    <DropdownMenu.ItemIndicator className="flex">
                      <CheckGlyph className="text-accent size-3" />
                    </DropdownMenu.ItemIndicator>
                  </span>
                  <span className="truncate text-sm font-medium">{provider.label}</span>
                  {/* The one place colour is spent in this menu, and only when
                      the state is one the learner has to repair (ADR-015). */}
                  <span
                    className={
                      needsRepair(provider)
                        ? "text-warn ml-auto shrink-0 pl-3 text-2xs"
                        : "text-ink-dim ml-auto shrink-0 pl-3 text-2xs"
                    }
                  >
                    {statusLabel(provider)}
                  </span>
                </span>
                <span className="text-ink-dim pl-5 text-2xs leading-normal text-pretty">
                  {menuDetail(provider)}
                </span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>

          {connection.loggingIn === null ? null : (
            <>
              <DropdownMenu.Separator className="bg-line my-1 h-(--stroke-hair)" />
              <DropdownMenu.Item
                disabled={connection.cancelling}
                onSelect={(event) => {
                  event.preventDefault();
                  void connection.cancelLogin();
                }}
                className={`${MENU_ROW} cursor-pointer px-2.5 py-2 pl-7.5 text-sm`}
              >
                {connection.cancelling ? "Cancelling…" : "Cancel sign-in"}
              </DropdownMenu.Item>
            </>
          )}
          {connection.error === null ? null : (
            <p className="text-bad px-2.5 py-2 pl-7.5 text-2xs leading-normal" role="alert">
              {connection.error}
            </p>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
