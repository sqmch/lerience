/* Synthetic interaction model only. No engine, disk, IPC or provider writes. */
export const TRACE_FIELDS = [
  { id: "add", label: "After adding 3", expected: 5 },
  { id: "remove", label: "After removing 4", expected: 1 },
  { id: "final", label: "After adding 7", expected: 6 },
  { id: "spill", label: "Tokens spilled on the last addition", expected: 2 },
] as const;

export type FieldId = (typeof TRACE_FIELDS)[number]["id"] | "explanation";
export type Answers = Record<FieldId, string>;
export type Help = "unknown" | "none" | "hint";
export type Attempt = {
  id: number;
  answers: Answers;
  help: Help;
  reviewed: boolean;
  afterFeedback: boolean;
};
export type AssessmentState = {
  answers: Answers;
  help: Help;
  errors: Partial<Record<FieldId, string>>;
  attempts: Attempt[];
  current: number | null;
  afterFeedback: boolean;
  saveFailed: boolean;
  historyOpen: boolean;
};
export const PREVIEW_STATES = [
  "initial",
  "editing",
  "validation",
  "submitted",
  "feedback",
  "revision",
  "history",
  "save-error",
] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];
const EMPTY: Answers = { add: "", remove: "", final: "", spill: "", explanation: "" };
const SAMPLE: Answers = {
  add: "5",
  remove: "1",
  final: "6",
  spill: "3",
  explanation: "The bin has room for six tokens, so the last addition fills it and the rest spill.",
};

export function validateAnswers(answers: Answers): AssessmentState["errors"] {
  const errors: AssessmentState["errors"] = {};
  for (const field of TRACE_FIELDS) {
    const value = answers[field.id].trim();
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
      errors[field.id] = "Enter a whole number, zero or more.";
    }
  }
  if (!answers.explanation.trim()) errors.explanation = "Add your explanation before submitting.";
  return errors;
}

export function initialAssessment(preview: PreviewState = "initial"): AssessmentState {
  const state: AssessmentState = {
    answers: { ...EMPTY },
    help: "unknown",
    errors: {},
    attempts: [],
    current: null,
    afterFeedback: false,
    saveFailed: false,
    historyOpen: false,
  };
  if (preview === "initial") return state;
  if (preview === "editing") return { ...state, answers: { ...EMPTY, add: "5", remove: "1" } };
  if (preview === "validation") {
    const answers = { ...EMPTY, add: "5", remove: "one" };
    return { ...state, answers, errors: validateAnswers(answers) };
  }
  if (preview === "save-error") return { ...state, answers: { ...SAMPLE }, saveFailed: true };
  const attempt: Attempt = {
    id: 1,
    answers: { ...SAMPLE },
    help: "none",
    reviewed: preview !== "submitted",
    afterFeedback: false,
  };
  return {
    ...state,
    answers: { ...SAMPLE },
    help: "none",
    attempts: [attempt],
    current: preview === "revision" ? null : 1,
    afterFeedback: preview === "revision",
    historyOpen: preview === "history",
  };
}

export type AssessmentAction =
  | { type: "edit"; field: FieldId; value: string }
  | { type: "help"; value: Help }
  | { type: "submit" }
  | { type: "review" }
  | { type: "revise" }
  | { type: "history" }
  | { type: "retry-save" }
  | { type: "reset"; preview: PreviewState };

export function assessmentReducer(
  state: AssessmentState,
  action: AssessmentAction,
): AssessmentState {
  switch (action.type) {
    case "reset":
      return initialAssessment(action.preview);
    case "edit": {
      if (state.current !== null) return state;
      const errors = { ...state.errors };
      delete errors[action.field];
      return { ...state, answers: { ...state.answers, [action.field]: action.value }, errors };
    }
    case "help":
      return state.current === null ? { ...state, help: action.value } : state;
    case "submit": {
      if (state.current !== null || state.saveFailed) return state;
      const errors = validateAnswers(state.answers);
      if (Object.keys(errors).length) return { ...state, errors };
      const attempt: Attempt = {
        id: state.attempts.length + 1,
        answers: { ...state.answers },
        help: state.help,
        reviewed: false,
        afterFeedback: state.afterFeedback,
      };
      return { ...state, errors: {}, current: attempt.id, attempts: [...state.attempts, attempt] };
    }
    case "review":
      return {
        ...state,
        attempts: state.attempts.map((attempt) =>
          attempt.id === state.current ? { ...attempt, reviewed: true } : attempt,
        ),
      };
    case "revise": {
      const previous = state.attempts.find((attempt) => attempt.id === state.current);
      return previous === undefined
        ? state
        : {
            ...state,
            answers: { ...previous.answers },
            current: null,
            errors: {},
            afterFeedback: true,
          };
    }
    case "history":
      return { ...state, historyOpen: !state.historyOpen };
    case "retry-save":
      return { ...state, saveFailed: false };
  }
}
