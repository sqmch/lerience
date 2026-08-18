import { describe, expect, it } from "vitest";
import { scanPublicationText } from "../scripts/publication-hygiene.mjs";

function windowsHome(identity: string): string {
  return ["C:", "Users", identity, ".provider", "credentials.json"].join("/");
}

function unixHome(root: "Users" | "home", identity: string): string {
  return ["", root, identity, ".provider", "credentials.json"].join("/");
}

describe("publication hygiene", () => {
  it("permits exact synthetic identities only inside declared test roots", () => {
    expect(scanPublicationText("tests/provider.test.ts", "C:/Users/learner/.provider")).toEqual([]);
    expect(
      scanPublicationText("course-engine/tests/provider.test.mjs", "/Users/example/.provider"),
    ).toEqual([]);
    expect(scanPublicationText("tests/provider.test.ts", "/home/user/.provider")).toEqual([]);
    expect(scanPublicationText("tests\\provider.test.ts", "/home/learner/.provider")).toEqual([]);
  });

  it("rejects synthetic home paths outside declared test roots", () => {
    expect(scanPublicationText("src/provider.ts", "C:/Users/learner/.provider")).toMatchObject([
      { ruleId: "Windows-home-path", line: 1 },
    ]);
    expect(scanPublicationText("docs/provider.md", "/home/user/.provider")).toMatchObject([
      { ruleId: "Unix-home-path", line: 1 },
    ]);
    expect(scanPublicationText("tests-archive/provider.ts", "/home/user/.provider")).toMatchObject([
      { ruleId: "Unix-home-path", line: 1 },
    ]);
  });

  it("rejects unknown identities even inside test files", () => {
    expect(scanPublicationText("tests/provider.test.ts", windowsHome("maintainer"))).toMatchObject([
      { ruleId: "Windows-home-path", line: 1 },
    ]);
    expect(
      scanPublicationText("tests/provider.test.ts", windowsHome("owner").replace("C:", "D:")),
    ).toMatchObject([{ ruleId: "Windows-home-path", line: 1 }]);
    expect(
      scanPublicationText("course-engine/tests/provider.test.mjs", unixHome("Users", "owner")),
    ).toMatchObject([{ ruleId: "Unix-home-path", line: 1 }]);
  });

  it("detects both source-escaped and literal Windows separators", () => {
    const escaped = ["C:", "\\\\", "Users", "\\\\", "maintainer", "\\\\", ".provider"].join("");
    const literal = windowsHome("maintainer").replaceAll("/", "\\");

    expect(scanPublicationText("tests/provider.test.ts", escaped)).toHaveLength(1);
    expect(scanPublicationText("tests/provider.test.ts", literal)).toHaveLength(1);
  });

  it("reports line numbers for private contact and retired sibling paths", () => {
    const privateContact = ["sqmchh", "gmail.com"].join("@");
    const sibling = ["..", "praxeum-app"].join("/");
    const findings = scanPublicationText(
      "docs/example.md",
      `safe first line\n${privateContact}\n${sibling}/src`,
    );

    expect(findings).toMatchObject([
      { ruleId: "private-contact", line: 2 },
      { ruleId: "retired-sibling-repository", line: 3 },
    ]);
  });
});
