import { describe, expect, it } from "vitest";
import {
  assessmentReducer,
  initialAssessment,
  validateAnswers,
} from "../dev/renderer-harness/assessment-state";

describe("development assessment interaction", () => {
  it("keeps incomplete and malformed answers as drafts, including raw input", () => {
    let state = initialAssessment("editing");
    state = assessmentReducer(state, { type: "edit", field: "remove", value: "one" });
    state = assessmentReducer(state, { type: "submit" });
    expect(state.current).toBeNull();
    expect(state.attempts).toHaveLength(0);
    expect(state.answers.remove).toBe("one");
    expect(state.errors.remove).toBeDefined();
    expect(state.errors.explanation).toBeDefined();
    expect(
      validateAnswers({
        add: "0",
        remove: "0",
        final: "0",
        spill: "0",
        explanation: "My prediction",
      }),
    ).toEqual({});
  });

  it("keeps failed saves recoverable and repeated submits create one immutable attempt", () => {
    const failed = initialAssessment("save-error");
    expect(assessmentReducer(failed, { type: "submit" })).toBe(failed);
    const recovered = assessmentReducer(failed, { type: "retry-save" });
    expect(recovered.answers).toEqual(failed.answers);
    const submitted = assessmentReducer(recovered, { type: "submit" });
    expect(submitted.attempts).toHaveLength(1);
    expect(assessmentReducer(submitted, { type: "submit" })).toBe(submitted);
    expect(assessmentReducer(submitted, { type: "edit", field: "spill", value: "2" })).toBe(
      submitted,
    );
  });

  it("revises separately and retains prior answers, help and feedback exposure", () => {
    let state = assessmentReducer(initialAssessment("save-error"), { type: "retry-save" });
    state = assessmentReducer(state, { type: "help", value: "hint" });
    state = assessmentReducer(state, { type: "submit" });
    state = assessmentReducer(state, { type: "review" });
    state = assessmentReducer(state, { type: "revise" });
    state = assessmentReducer(state, { type: "edit", field: "spill", value: "2" });
    state = assessmentReducer(state, { type: "submit" });
    expect(state.attempts).toHaveLength(2);
    expect(state.attempts[0]).toMatchObject({
      help: "hint",
      reviewed: true,
      answers: { spill: "3" },
    });
    expect(state.attempts[1]).toMatchObject({
      help: "hint",
      reviewed: false,
      afterFeedback: true,
      answers: { spill: "2" },
    });
    expect(assessmentReducer(state, { type: "history" }).historyOpen).toBe(true);
  });
});
