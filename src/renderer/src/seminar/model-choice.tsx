import { useState } from "react";
import { PRIMARY, QUIET } from "../components/controls";
import { SessionControlBar } from "./parts";
import type { SeminarController } from "./use-seminar";

/** Both course entry paths wait here before any tutor turn, including recovery. */
export function ModelChoice({ seminar }: { seminar: SeminarController }): React.JSX.Element {
  const [working, setWorking] = useState(false);
  const choice = seminar.state.modelChoice;
  const controls = seminar.controls;
  const run = (action: () => Promise<unknown>): void => {
    if (working) return;
    setWorking(true);
    void action().finally(() => setWorking(false));
  };
  return (
    <div className="flex flex-col items-start gap-3" aria-label="Choose your tutor model">
      <p className="text-hi text-sm font-medium">Choose a model before your tutor starts</p>
      <p className="text-ink-dim text-sm leading-normal">
        {choice?.recovery
          ? "Your tutor will finish the previous session, then open the next one with this choice."
          : "Keep the model shown, choose another, or use your provider default."}
      </p>
      {choice?.notice ? (
        <p className="text-attention text-sm" role="status">
          {choice.notice}
        </p>
      ) : null}
      <fieldset disabled={working} className="m-0 w-full min-w-0 border-0 p-0 disabled:opacity-60">
        {controls === null ? (
          <p className="text-ink-dim text-sm">Loading model choices.</p>
        ) : (
          <SessionControlBar
            controls={controls}
            onChange={(patch) => run(() => seminar.setControls(patch))}
            notice={seminar.state.controlNotice}
          />
        )}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${PRIMARY} text-sm`}
          disabled={working || controls === null}
          onClick={() => run(seminar.confirmModel)}
        >
          Start tutor
        </button>
        <button
          type="button"
          className={`${QUIET} text-sm`}
          disabled={working || controls === null}
          onClick={() => run(() => seminar.setControls({ model: null }))}
        >
          Use provider default
        </button>
      </div>
    </div>
  );
}
