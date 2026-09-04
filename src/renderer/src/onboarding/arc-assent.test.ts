import { describe, expect, it, vi } from "vitest";
import { sendArcAssent } from "./arc-assent";

describe("arc assent", () => {
  it.each(["never", "bypassPermissions"])(
    "waits for offered %s before sending the build",
    async (id) => {
      let applied!: (value: boolean) => void;
      const setControls = vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            applied = resolve;
          }),
      );
      const send = vi.fn(async () => true);
      const pending = sendArcAssent(
        { id, label: "Never ask", description: "Provider scope" },
        setControls,
        send,
      );
      expect(setControls).toHaveBeenCalledWith({ autonomy: id });
      expect(send).not.toHaveBeenCalled();
      applied(true);
      expect(await pending).toBe(true);
      expect(send).toHaveBeenCalledExactlyOnceWith("The arc looks right — build module 00.");
    },
  );

  it("does not send assent when the control change fails", async () => {
    const send = vi.fn(async () => true);
    expect(
      await sendArcAssent(
        { id: "never", label: "Never ask", description: "" },
        async () => false,
        send,
      ),
    ).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("preserves current settings when the learner declines or no option is offered", async () => {
    const setControls = vi.fn(async () => true);
    const send = vi.fn(async () => false);
    expect(await sendArcAssent(undefined, setControls, send)).toBe(false);
    expect(setControls).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  });
});
