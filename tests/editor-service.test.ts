import { describe, expect, it, vi } from "vitest";
import type { InstalledEditor } from "../src/main/editor/discovery";
import {
  EditorService,
  customEditorLabel,
  parseEditorPreference,
  type EditorPreference,
} from "../src/main/editor/service";

const CODE: InstalledEditor = {
  id: "vscode",
  label: "Visual Studio Code",
  launch: { kind: "executable", path: "C:/code/Code.exe" },
};
const ZED: InstalledEditor = {
  id: "zed",
  label: "Zed",
  launch: { kind: "executable", path: "C:/zed/Zed.exe" },
};

function service(installed: InstalledEditor[], initial?: EditorPreference) {
  let preference = initial;
  const launch = vi.fn(() => Promise.resolve());
  const editors = new EditorService({
    discover: () => installed,
    readPreference: () => preference,
    writePreference: (next) => {
      preference = next;
    },
    launch,
    platform: "win32",
    isRunnable: (executablePath) => executablePath.endsWith(".exe"),
  });
  return { editors, launch, preference: () => preference };
}

describe("EditorService", () => {
  it("names the first editor found when the learner has not chosen, without persisting it", () => {
    const { editors, preference } = service([CODE, ZED]);
    expect(editors.catalog()).toEqual({
      selectedEditorId: "vscode",
      chosen: false,
      editors: [
        { id: "vscode", label: "Visual Studio Code" },
        { id: "zed", label: "Zed" },
      ],
    });
    expect(preference()).toBeUndefined();
  });

  it("remembers a chosen installed editor and opens with it", async () => {
    const { editors, launch, preference } = service([CODE, ZED]);
    expect(editors.select("zed")).toMatchObject({ selectedEditorId: "zed", chosen: true });
    expect(preference()).toEqual({ id: "zed" });
    await expect(editors.open("C:/course/curriculum/00-x/scaffold")).resolves.toEqual({
      ok: true,
    });
    expect(launch).toHaveBeenCalledWith(ZED.launch, "C:/course/curriculum/00-x/scaffold");
  });

  it("ignores a choice that is not installed", () => {
    const { editors, preference } = service([CODE]);
    expect(editors.select("zed").selectedEditorId).toBe("vscode");
    expect(editors.select("nonsense").selectedEditorId).toBe("vscode");
    expect(preference()).toBeUndefined();
  });

  it("falls back to what is installed when the remembered editor is gone", () => {
    const { editors } = service([CODE], { id: "zed" });
    expect(editors.catalog()).toMatchObject({ selectedEditorId: "vscode", chosen: false });
  });

  it("offers and launches a browsed-to program, named by its file", async () => {
    const { editors, launch } = service([CODE]);
    const catalog = editors.chooseCustom("D:/Apps/notepad++.exe");
    expect(catalog).toEqual({
      selectedEditorId: "custom",
      chosen: true,
      editors: [
        { id: "vscode", label: "Visual Studio Code" },
        { id: "custom", label: "notepad++" },
      ],
    });
    await editors.open("C:/course");
    expect(launch).toHaveBeenCalledWith(
      { kind: "executable", path: "D:/Apps/notepad++.exe" },
      "C:/course",
    );
  });

  it("refuses a browsed-to path that cannot run and keeps the previous preference", () => {
    const { editors, preference } = service([CODE], { id: "vscode" });
    expect(editors.chooseCustom("D:/notes.txt")).toBeNull();
    expect(preference()).toEqual({ id: "vscode" });
  });

  it("reports no editor rather than launching nothing", async () => {
    const { editors, launch } = service([]);
    await expect(editors.open("C:/course")).resolves.toMatchObject({
      ok: false,
      reason: "no-editor",
    });
    expect(launch).not.toHaveBeenCalled();
  });

  it("turns a spawn failure into a learner-facing reply naming the editor", async () => {
    let preference: EditorPreference | undefined = { id: "vscode" };
    const editors = new EditorService({
      discover: () => [CODE],
      readPreference: () => preference,
      writePreference: (next) => {
        preference = next;
      },
      launch: () => Promise.reject(new Error("ENOENT")),
      platform: "win32",
    });
    await expect(editors.open("C:/course")).resolves.toEqual({
      ok: false,
      reason: "launch-failed",
      detail: "Visual Studio Code could not be started. ENOENT",
    });
  });
});

describe("editor preference parsing", () => {
  it("keeps known ids and custom paths, drops everything else", () => {
    expect(parseEditorPreference({ id: "zed" })).toEqual({ id: "zed" });
    expect(parseEditorPreference({ id: "custom", executablePath: "/opt/e" })).toEqual({
      id: "custom",
      executablePath: "/opt/e",
    });
    expect(parseEditorPreference({ id: "custom" })).toBeUndefined();
    expect(parseEditorPreference({ id: "emacs" })).toBeUndefined();
    expect(parseEditorPreference("zed")).toBeUndefined();
  });

  it("labels a custom editor by its program name", () => {
    expect(customEditorLabel("C:/Apps/Notepad++/notepad++.exe")).toBe("notepad++");
    expect(customEditorLabel("/Applications/Nova.app")).toBe("Nova");
    expect(customEditorLabel("/usr/bin/gedit")).toBe("gedit");
  });
});
