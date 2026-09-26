// In-memory bridge fixture; production UI, never a filesystem/recovery proof.
import type {
  AssessmentAttempt,
  AssessmentCommand,
  AssessmentQuestion,
  AssessmentReply,
  AssessmentView,
} from "../../src/shared/assessment";
export function fixtureQuestion(moduleId: string): AssessmentQuestion {
  return {
    schemaVersion: 1,
    moduleId,
    questionId: "trace",
    version: 1,
    title: "Record your prediction",
    prompt: "Record the stored count after each event, then explain the last spill.",
    fields: [
      { id: "add", kind: "integer", label: "After adding 3", units: "tokens" },
      { id: "remove", kind: "integer", label: "After removing 4", units: "tokens" },
      { id: "full", kind: "integer", label: "After adding 7", units: "tokens" },
      {
        id: "spill",
        kind: "integer",
        label: "Tokens spilled on the last addition",
        units: "tokens",
      },
      { id: "why", kind: "explanation", label: "Why does the last addition spill?", units: "" },
    ],
    criteria: [
      { id: "capacity", description: "Account for the prior count, incoming tokens and capacity." },
    ],
  };
}
export function createAssessmentFixtureStore(seed = "initial") {
  const attempts: AssessmentAttempt[] = [];
  let failSave = seed === "save-error";
  const sourceDigest = "a".repeat(64);
  const expected: Record<string, number> = { add: 5, remove: 1, full: 6, spill: 2 };
  return async (_root: string, c: AssessmentCommand): Promise<AssessmentReply> => {
    const question = fixtureQuestion(c.moduleId);
    const present = c.moduleId !== "00-reading-state";
    const read = (): AssessmentView => ({
      state: present ? "available" : "none",
      detail: "",
      question: present ? question : null,
      sourceDigest: present ? sourceDigest : null,
      attempts: structuredClone(attempts.filter((a) => a.question.moduleId === c.moduleId)),
    });
    if (!present || c.operation === "read") return { ok: true, view: read() };
    const a = attempts.find((record) => record.id === c.id);
    if (c.operation === "save") {
      if (failSave) {
        failSave = false;
        return { ok: false, detail: "Simulated save failure. Your answers are still here." };
      }
      const now = new Date().toISOString();
      if (a) {
        a.raw = structuredClone(c.raw);
        a.help = c.help;
        a.revision++;
        a.updatedAt = now;
      } else
        attempts.push({
          schemaVersion: 1,
          id: c.id,
          courseId: "123e4567-e89b-42d3-a456-426614174000",
          sourceDigest,
          question,
          revision: 1,
          status: "draft",
          raw: structuredClone(c.raw),
          help: c.help,
          afterFeedback: c.revisesAttemptId !== null,
          revisesAttemptId: c.revisesAttemptId,
          createdAt: now,
          updatedAt: now,
          submittedAt: null,
          objective: [],
          feedback: [],
          events: [],
        });
    } else if (a && c.operation === "submit") {
      const fields: Record<string, string> = {};
      for (const f of a.question.fields)
        if (!a.raw[f.id]?.trim() || (f.kind === "integer" && !/^-?\d+$/.test(a.raw[f.id] ?? "")))
          fields[f.id] = "Enter an answer in the requested form.";
      if (Object.keys(fields).length)
        return { ok: false, detail: "Check the marked answers.", fields };
      a.status = "submitted";
      a.submittedAt = new Date().toISOString();
      a.objective = Object.entries(expected).map(([fieldId, value]) => ({
        fieldId,
        state: Number(a.raw[fieldId]) === value ? "correct" : "incorrect",
        expected: value,
      }));
    } else if (a && c.operation === "review") {
      a.feedback.push({
        id: crypto.randomUUID(),
        attemptId: a.id,
        sourceDigest,
        author: "tutor",
        createdAt: new Date().toISOString(),
        criteria: [
          {
            criterionId: "capacity",
            state: "uncertain",
            excerpt: "",
            rationale:
              "Synthetic fixture feedback: explain the prior count and incoming tokens. This is not an actual tutor review.",
          },
        ],
      });
    } else if (a && c.operation === "event")
      a.events.push({
        id: c.eventId,
        kind: c.kind,
        text: c.text,
        createdAt: new Date().toISOString(),
      });
    return { ok: true, view: read() };
  };
}
