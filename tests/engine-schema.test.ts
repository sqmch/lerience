import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";

import engineManifest from "../course-engine/manifest.json" with { type: "json" };
import labSchema from "../course-engine/template/docs/schema/lab.schema.json" with { type: "json" };
import moduleSchema from "../course-engine/template/docs/schema/module.schema.json" with { type: "json" };
import progressSchema from "../course-engine/template/docs/schema/progress.schema.json" with { type: "json" };
import quizBankSchema from "../course-engine/template/docs/schema/quiz-bank.schema.json" with { type: "json" };
import { validLegacyQuizBank, validModuleManifest, validProgress, validQuizBank } from "./fixtures";
import {
  moduleManifestSchema,
  progressSchema as progressLens,
  quizBankSchema as quizBankLens,
} from "../src/shared/engine/schemas";

const vendoredSchemas = {
  "lab.schema.json": labSchema,
  "module.schema.json": moduleSchema,
  "progress.schema.json": progressSchema,
  "quiz-bank.schema.json": quizBankSchema,
};

const roundTripCases = [
  {
    name: "module manifest",
    schema: moduleSchema,
    fixtures: [validModuleManifest],
  },
  {
    name: "progress",
    schema: progressSchema,
    fixtures: [validProgress],
  },
  {
    name: "modern and legacy quiz banks",
    schema: quizBankSchema,
    fixtures: [validQuizBank, validLegacyQuizBank],
  },
];

describe("canonical Course Engine JSON Schemas", () => {
  it("records the exact source import independently from the course format version", () => {
    expect(engineManifest).toMatchObject({
      schemaVersion: 1,
      engineVersion: "0.1.1",
      courseFormatVersion: 0,
      templateDirectory: "template",
      source: {
        kind: "learning-harness-import",
        commit: "a55d29cdc43a8caee655cf39cc96e078b224f436",
      },
    });
    expect(Object.keys(vendoredSchemas).sort()).toEqual([
      "lab.schema.json",
      "module.schema.json",
      "progress.schema.json",
      "quiz-bank.schema.json",
    ]);
  });

  for (const roundTripCase of roundTripCases) {
    it(`accepts the Zod-valid ${roundTripCase.name} fixtures`, () => {
      const ajv = new Ajv({ allErrors: true, strict: true });
      const validate = ajv.compile(roundTripCase.schema);

      for (const fixture of roundTripCase.fixtures) {
        expect(validate(fixture), ajv.errorsText(validate.errors)).toBe(true);
      }
    });
  }

  it("keeps the desktop lens open to canonical format-v0 boundary values", () => {
    expect(moduleManifestSchema.safeParse({ ...validModuleManifest, title: "" }).success).toBe(
      true,
    );
    expect(
      progressLens.safeParse({
        learner: { profile: "", paceHoursPerWeek: "", started: "onboarding-pending" },
        currentModule: "00-orientation",
        modules: {
          "00-orientation": {
            status: "in-progress",
            startedAt: "2026-02-30",
            bossCheck: {
              passedAt: null,
              attempts: [{ date: "2026-02-30", outcome: "failed" }],
            },
          },
        },
      }).success,
    ).toBe(true);
    expect(
      quizBankLens.safeParse({
        items: [{ id: "", module: "", question: "", interval: 1, due: "2026-02-30", history: [] }],
      }).success,
    ).toBe(true);
    expect(
      quizBankLens.safeParse({
        items: [{ id: "x", module: "m", question: "q", interval: 1, due: "2026-01-01" }],
      }).success,
    ).toBe(false);
  });
});
