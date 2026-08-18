import { describe, expect, it } from "vitest";

import {
  isoDate,
  moduleManifestSchema,
  progressSchema,
  quizBankSchema,
} from "../src/shared/engine/schemas";
import { validLegacyQuizBank, validModuleManifest, validProgress, validQuizBank } from "./fixtures";

describe("isoDate", () => {
  it("matches the canonical format-v0 date shape without inventing calendar semantics", () => {
    expect(isoDate.safeParse("2028-02-29").success).toBe(true);
    expect(isoDate.safeParse("2026-02-30").success).toBe(true);
  });

  it.each(["2026-8-5", "2026-08-05T12:00:00Z"])("rejects %s", (value) => {
    expect(isoDate.safeParse(value).success).toBe(false);
  });
});

describe("moduleManifestSchema", () => {
  it("parses a valid engine-compatible module manifest", () => {
    expect(moduleManifestSchema.parse(validModuleManifest)).toEqual(validModuleManifest);
  });

  it("rejects an invalid phase", () => {
    expect(moduleManifestSchema.safeParse({ ...validModuleManifest, phase: -1 }).success).toBe(
      false,
    );
  });

  it("matches the engine's required fields and module id contract", () => {
    expect(
      moduleManifestSchema.safeParse({ ...validModuleManifest, id: "module-02" }).success,
    ).toBe(false);
    expect(
      moduleManifestSchema.safeParse({
        ...validModuleManifest,
        prerequisites: undefined,
      }).success,
    ).toBe(false);
    expect(
      moduleManifestSchema.safeParse({
        ...validModuleManifest,
        runtime: undefined,
      }).success,
    ).toBe(false);
    expect(
      moduleManifestSchema.safeParse({
        ...validModuleManifest,
        volatileLayer: "eventually",
      }).success,
    ).toBe(false);
  });

  it("accepts the engine's zero-hour seminar representation", () => {
    expect(
      moduleManifestSchema.safeParse({
        ...validModuleManifest,
        runtime: "",
        estimatedHours: 0,
      }).success,
    ).toBe(true);
  });
});

describe("progressSchema", () => {
  it("parses progress with an auditable boss-check attempt trace", () => {
    expect(progressSchema.parse(validProgress)).toEqual(validProgress);
  });

  it("accepts the engine's pre-onboarding template state", () => {
    const template = {
      learner: { profile: "", paceHoursPerWeek: "", started: "" },
      currentModule: null,
      modules: {},
    };

    expect(progressSchema.parse(template)).toEqual(template);
  });

  it("rejects an invalid boss-check outcome", () => {
    const invalid = {
      ...validProgress,
      modules: {
        ...validProgress.modules,
        "01-embeddings": {
          ...validProgress.modules["01-embeddings"],
          bossCheck: {
            passedAt: null,
            attempts: [
              {
                date: "2026-07-03",
                outcome: "almost",
                notes: "Invalid fixture outcome.",
              },
            ],
          },
        },
      },
    };

    expect(progressSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("quizBankSchema", () => {
  it("parses a modern quiz bank", () => {
    expect(quizBankSchema.parse(validQuizBank)).toEqual(validQuizBank);
  });

  it("keeps legacy rescheduled history entries parseable", () => {
    expect(quizBankSchema.parse(validLegacyQuizBank)).toEqual(validLegacyQuizBank);
  });

  it("rejects non-positive intervals", () => {
    const invalid = structuredClone(validQuizBank);
    const item = invalid.items[0];
    if (!item) throw new Error("fixture lost its quiz item");
    item.interval = 0;

    expect(quizBankSchema.safeParse(invalid).success).toBe(false);
  });
});
