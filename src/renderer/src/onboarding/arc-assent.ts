import type {
  SessionAccessOption,
  SessionAutonomyOption,
  SessionControlPatch,
} from "../../../shared/seminar";

/** The build turn must start only after the learner's chosen control is applied or staged. */
export async function sendArcAssent(
  option: SessionAutonomyOption | undefined,
  setControls: (patch: SessionControlPatch) => Promise<boolean>,
  send: (message: string) => Promise<boolean>,
  access?: SessionAccessOption,
): Promise<boolean> {
  const patch: SessionControlPatch = {
    ...(option ? { autonomy: option.id } : {}),
    ...(access ? { access: access.id } : {}),
  };
  if (Object.keys(patch).length > 0 && !(await setControls(patch))) return false;
  return send("The arc looks right — build module 00.");
}
