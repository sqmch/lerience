import { describe, expect, it } from "vitest";
import { buildSessionOpener } from "../src/main/agent/opener";

describe("buildSessionOpener", () => {
  it("conducts the desktop surface, states the known fact, and preserves the learner opener", () => {
    const opener = buildSessionOpener({ currentModuleId: "02-vectors" });

    expect(opener).toContain("designed chat, not a terminal");
    expect(opener).toContain("renders course files live");
    expect(opener).toContain("their own editor");
    expect(opener).toContain("Current module: 02-vectors");
    expect(opener).toContain("Facts as of session open");
    expect(opener).toMatch(/start session$/);
  });

  it("states the absence of a current module instead of fabricating one", () => {
    expect(buildSessionOpener({ currentModuleId: null })).toContain(
      "Current module: none selected",
    );
  });

  it("does not add a second pedagogy or shape agent capability", () => {
    const opener = buildSessionOpener({ currentModuleId: null });

    expect(opener).not.toMatch(/be concise|teaching style|permission mode|allowed tools|model:/i);
  });

  it("adds only supplied script facts and preserves a different lifecycle opener", () => {
    const opener = buildSessionOpener({
      currentModuleId: "02-vectors",
      doctorReport: "ok: course state is consistent",
      dueItems: "2 due, most overdue first",
      journalTail: "## 2026-08-11 — Paused midway",
      observedAt: "2026-08-12T03:00:00.000Z",
      learnerOpener: "new course",
    });

    expect(opener).toContain("Facts as of 2026-08-12T03:00:00.000Z");
    expect(opener).toContain("Doctor report:\nok: course state is consistent");
    expect(opener).toContain("Due items:\n2 due, most overdue first");
    expect(opener).toContain("Recent journal:\n## 2026-08-11");
    expect(opener).toMatch(/new course$/);
  });
});
