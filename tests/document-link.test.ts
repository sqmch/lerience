import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { resolveDocumentLink } from "../src/main/editor/document-link";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lerience-links-"));
  roots.push(root);
  const course = path.join(root, "course");
  const reference = path.join(course, "curriculum", "00-map", "reference");
  fs.mkdirSync(reference, { recursive: true });
  fs.writeFileSync(path.join(reference, "a file.py"), "source");
  fs.writeFileSync(path.join(course, "COURSE.md"), "course");
  return { root, course, reference };
}
it("opens module-relative references and course-contained parent paths, with optional locations", () => {
  const { course, reference } = fixture();
  expect(resolveDocumentLink(course, "00-map", "reference/a%20file.py#L12C3")).toEqual({
    kind: "file",
    path: fs.realpathSync(path.join(reference, "a file.py")),
    line: 12,
    column: 3,
  });
  expect(resolveDocumentLink(course, "00-map", "../../COURSE.md").kind).toBe("file");
  expect(resolveDocumentLink(course, "00-map", "reference\\a file.py#L12-L14")).toMatchObject({
    kind: "file",
    line: 12,
  });
});
it("rejects traversal, absolute paths, protocols, malformed encoding, directories and missing files", () => {
  const { course } = fixture();
  for (const href of [
    "../../../outside.py",
    "%2e%2e/%2e%2e/%2e%2e/outside.py",
    "C:/secret.txt",
    "C:secret.txt",
    "/etc/passwd",
    "//server/share",
    "\\\\server\\share",
    "file:///secret.txt",
    "javascript:alert(1)",
    "reference/%00a",
    "reference/%ZZ",
    "reference",
    "missing.py",
  ]) {
    expect(resolveDocumentLink(course, "00-map", href).kind, href).toBe("invalid");
  }
  expect(resolveDocumentLink(course, "../00-map", "reference/a file.py").kind).toBe("invalid");
});
it("rejects a course symlink escaping to an external file", () => {
  const { root, course, reference } = fixture();
  const outside = path.join(root, "outside");
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "secret.py"), "private");
  fs.symlinkSync(
    outside,
    path.join(reference, "escape"),
    process.platform === "win32" ? "junction" : "dir",
  );
  expect(resolveDocumentLink(course, "00-map", "reference/escape/secret.py").kind).toBe("invalid");
});
it("allows explicit HTTP sources and rejects embedded credentials", () => {
  const { course } = fixture();
  expect(resolveDocumentLink(course, "00-map", "https://example.invalid/docs#source")).toEqual({
    kind: "web",
    url: "https://example.invalid/docs#source",
  });
  expect(resolveDocumentLink(course, "00-map", "https://user:pass@example.invalid").kind).toBe(
    "invalid",
  );
});
