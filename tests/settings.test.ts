import { describe, expect, it } from "vitest";
import { parseSettings } from "../src/main/settings";

describe("parseSettings", () => {
  it("keeps a valid tutor provider preference", () => {
    expect(parseSettings({ tutorProvider: "codex" })).toEqual({ tutorProvider: "codex" });
  });

  it("drops unknown provider values without dropping other preferences", () => {
    expect(parseSettings({ tutorProvider: "other", theme: "dark" })).toEqual({ theme: "dark" });
  });

  it("keeps a valid editor preference and drops a malformed one", () => {
    expect(parseSettings({ editor: { id: "zed" } })).toEqual({ editor: { id: "zed" } });
    expect(parseSettings({ editor: { id: "custom", executablePath: "C:/e.exe" } })).toEqual({
      editor: { id: "custom", executablePath: "C:/e.exe" },
    });
    expect(parseSettings({ editor: "zed", theme: "light" })).toEqual({ theme: "light" });
  });
});
