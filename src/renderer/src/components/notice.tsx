/* "That did not work", said once. Two surfaces raise the same kind of small,
 * dismissible failure — a check run that errored, an editor that would not
 * start — and they were drawing their own cards. One card, one dismiss.
 *
 * Dismissible because these are all ephemeral: none of them touches saved
 * state, and a stale red strip over something you have since fixed is worse
 * than no strip at all. */

/** The × that closes a card. Small hit area, no ground, and it never moves the
 *  content it sits beside — the negative margins pull it into the padding. */
export function Dismiss({
  label,
  onDismiss,
}: {
  label: string;
  onDismiss: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="text-ink-faint hover:text-hi focus-visible:outline-focus -mt-1 -mr-1 shrink-0 rounded-pill p-1 text-xs transition-colors focus-visible:outline-2"
      onClick={onDismiss}
    >
      <span className="sr-only">{label}</span>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path
          d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

/** One sentence a control could not fit, in the app's voice. The left edge is
 *  the bad accent, so it reads as a failure without a banner's weight. */
export function Notice({
  detail,
  dismissLabel,
  onDismiss,
}: {
  detail: string;
  dismissLabel: string;
  onDismiss: () => void;
}): React.JSX.Element {
  return (
    <div
      className="border-line border-l-bad bg-surface-panel rounded-lg border border-l-2 p-4"
      role="status"
    >
      <div className="flex items-start gap-3">
        <p className="text-ink min-w-0 flex-1 text-sm leading-normal text-pretty">{detail}</p>
        <Dismiss label={dismissLabel} onDismiss={onDismiss} />
      </div>
    </div>
  );
}
