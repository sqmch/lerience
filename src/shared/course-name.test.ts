import { describe, expect, it } from "vitest";
import { slugifyCourseName } from "./course-name";

describe("slugifyCourseName", () => {
  it("lowercases and joins words with single dashes", () => {
    expect(slugifyCourseName("Applied AI Systems")).toBe("applied-ai-systems");
    expect(slugifyCourseName("  Software architecture patterns  ")).toBe(
      "software-architecture-patterns",
    );
  });

  it("collapses punctuation and symbols into single dashes", () => {
    expect(slugifyCourseName("C++ & Rust: a comparison!")).toBe("c-rust-a-comparison");
    expect(slugifyCourseName("data —— science")).toBe("data-science");
  });

  it("flattens accents but keeps scripts that do not decompose", () => {
    expect(slugifyCourseName("Café résumé")).toBe("cafe-resume");
    expect(slugifyCourseName("天気予報")).toBe("天気予報");
  });

  it("cuts a long sentence at a word boundary, never mid-word", () => {
    const slug = slugifyCourseName(
      "Software architecture patterns through repair and design across large systems",
    );
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug).toBe("software-architecture-patterns-through-repair");
    expect(slug.endsWith("-")).toBe(false);
  });

  it("hard-cuts a single word longer than the budget", () => {
    expect(slugifyCourseName("a".repeat(60))).toBe("a".repeat(48));
  });

  it("returns empty when nothing usable is left", () => {
    expect(slugifyCourseName("")).toBe("");
    expect(slugifyCourseName("!!! ??? ...")).toBe("");
  });
});
