import { describe, expect, it } from "vitest";
import { parseSettings } from "../src/main/settings";

describe("parseSettings", () => {
  it("keeps a valid tutor provider preference", () => {
    expect(parseSettings({ tutorProvider: "codex" })).toEqual({ tutorProvider: "codex" });
  });

  it("drops unknown provider values without dropping other preferences", () => {
    expect(parseSettings({ tutorProvider: "other", theme: "dark" })).toEqual({ theme: "dark" });
  });
});
