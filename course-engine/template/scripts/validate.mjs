// Validate the course's JSON against the schemas in docs/schema/. Format
// vocabulary drifts in the wild — "completed" vs "complete", volatileLayer
// values, a stray status typo would sail straight into a `status-${…}` CSS class
// — and prose (FORMAT.md) can't catch that. The schemas are the precise spec;
// this is their mechanical check, for CI and for the tutor after generation. It
// is READ-ONLY: it parses files and reports, it never writes.
//
// The schemas double as documentation, so this validator implements only the
// draft-07 subset they use (type, required, properties, additionalProperties as
// bool-or-schema, enum, items, pattern, minimum/maximum, minItems/maxItems). It
// only ever runs against schemas that live in this repo — small and boring on
// purpose. No dependencies.
//
// Usage:  node scripts/validate.mjs [repoPath] [--json]
//   repoPath   a repo to inspect; default walks up from cwd for .git/CLAUDE.md
//   PRAXEUM_COURSE   env var honored too (same precedence as doctor.mjs)
//   --json     print a stable [{ id, level, message }] array (as doctor.mjs does)
//
// Validates, when present under the target repo: every curriculum/*/module.json
// and lab.json, tutor/progress.json, tutor/quiz-bank.json — and ALWAYS
// templates/tutor/*.json, so the engine repo itself always has state to validate
// in CI. Schemas are resolved next to this script, never from the target, so an
// instance is checked against the engine version it pulled.
//
// Exit 0 when every file validates, 1 when any file fails.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---- repo root: explicit arg > PRAXEUM_COURSE > walk up for .git/CLAUDE.md.
//      Same resolution as doctor.mjs. ----
function walkUp(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git")) || fs.existsSync(path.join(dir, "CLAUDE.md"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Schemas live next to this script, under ../docs/schema — the engine's copy, not
// the target's, so a pulled instance is checked against the version it received.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.join(scriptDir, "..", "docs", "schema");

// ============================================================================
//  Minimal JSON Schema (draft-07 subset) validator.
//  validate(schema, value, path) -> [{ path, message }]  (empty = valid)
// ============================================================================

function typeName(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v; // "string" | "number" | "boolean" | "object" | ...
}

function matchesType(value, type) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true; // unknown type keyword: don't block
  }
}

function eq(a, b) {
  if (a === b) return true;
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

const joinPath = (base, key) => (base === "" ? String(key) : `${base}.${key}`);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function validate(schema, value, at, errors) {
  // --- type ---
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push({
        path: at,
        message: `expected type ${types.join(" | ")}, got ${typeName(value)}`,
      });
      return errors; // a wrong type makes every deeper check noise
    }
  }

  // --- enum ---
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => eq(e, value))) {
    errors.push({
      path: at,
      message: `value ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`,
    });
  }

  // --- string: pattern ---
  if (typeof value === "string" && typeof schema.pattern === "string") {
    if (!new RegExp(schema.pattern).test(value)) {
      errors.push({
        path: at,
        message: `${JSON.stringify(value)} does not match pattern /${schema.pattern}/`,
      });
    }
  }

  // --- number: minimum / maximum ---
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push({ path: at, message: `${value} is below minimum ${schema.minimum}` });
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push({ path: at, message: `${value} exceeds maximum ${schema.maximum}` });
    }
  }

  // --- array: items / minItems / maxItems ---
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push({
        path: at,
        message: `array has ${value.length} item(s), fewer than minItems ${schema.minItems}`,
      });
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push({
        path: at,
        message: `array has ${value.length} item(s), more than maxItems ${schema.maxItems}`,
      });
    }
    if (schema.items) {
      value.forEach((el, i) => validate(schema.items, el, joinPath(at, i), errors));
    }
  }

  // --- object: required / properties / additionalProperties ---
  if (isPlainObject(value)) {
    if (Array.isArray(schema.required)) {
      for (const name of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(value, name)) {
          errors.push({ path: joinPath(at, name), message: "required property is missing" });
        }
      }
    }
    const props = schema.properties ?? {};
    const addl = schema.additionalProperties;
    for (const [key, sub] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
        validate(props[key], sub, joinPath(at, key), errors);
      } else if (addl === false) {
        errors.push({
          path: joinPath(at, key),
          message: "unexpected property (not allowed by schema)",
        });
      } else if (isPlainObject(addl)) {
        // additionalProperties as a schema: applies to every unlisted property
        validate(addl, sub, joinPath(at, key), errors);
      }
      // addl === true or undefined: extra properties are allowed
    }
  }

  return errors;
}

// ============================================================================
//  Load schemas (from the engine, next to this script)
// ============================================================================

function loadSchema(name) {
  const abs = path.join(schemaDir, `${name}.schema.json`);
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (err) {
    console.error(`[validate] cannot load schema ${abs}: ${err?.message ?? err}`);
    process.exit(2);
  }
}

// ============================================================================
//  Discover which files to validate under the target repo
// ============================================================================

const schemaForBasename = (base) =>
  ({
    "module.json": "module",
    "lab.json": "lab",
    "progress.json": "progress",
    "quiz-bank.json": "quiz-bank",
  })[base] ?? null;

function targets(root) {
  const list = []; // { rel, schema }
  const add = (rel, schema) => list.push({ rel, schema });

  // curriculum/*/module.json and lab.json
  const curriculum = path.join(root, "curriculum");
  if (fs.existsSync(curriculum) && fs.statSync(curriculum).isDirectory()) {
    for (const ent of fs
      .readdirSync(curriculum, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (!ent.isDirectory()) continue;
      for (const [file, schema] of [
        ["module.json", "module"],
        ["lab.json", "lab"],
      ]) {
        if (fs.existsSync(path.join(curriculum, ent.name, file)))
          add(`curriculum/${ent.name}/${file}`, schema);
      }
    }
  }

  // tutor state
  for (const [rel, schema] of [
    ["tutor/progress.json", "progress"],
    ["tutor/quiz-bank.json", "quiz-bank"],
  ]) {
    if (fs.existsSync(path.join(root, rel))) add(rel, schema);
  }

  // templates/tutor/*.json — ALWAYS (the engine repo's guaranteed CI fixture)
  const templates = path.join(root, "templates", "tutor");
  if (fs.existsSync(templates) && fs.statSync(templates).isDirectory()) {
    for (const name of fs.readdirSync(templates).sort()) {
      if (!name.endsWith(".json")) continue;
      const schema = schemaForBasename(name);
      if (schema) add(`templates/tutor/${name}`, schema);
    }
  }

  return list;
}

// ============================================================================
//  Validate each target, collect results (doctor.mjs shape: {id, level, message})
// ============================================================================

function validateFile(root, rel, schemaName, schemas) {
  const abs = path.join(root, rel);
  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch (err) {
    return { id: rel, level: "fail", message: `cannot read: ${err?.message ?? err}`, errors: [] };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return {
      id: rel,
      level: "fail",
      message: `not valid JSON: ${err?.message ?? err}`,
      errors: [],
    };
  }
  const errors = validate(schemas[schemaName], data, "", []);
  if (errors.length === 0) {
    return { id: rel, level: "ok", message: `valid against ${schemaName}.schema.json`, errors: [] };
  }
  return {
    id: rel,
    level: "fail",
    message: errors.map((e) => `${e.path === "" ? "(root)" : e.path}: ${e.message}`).join("; "),
    errors,
  };
}

function main() {
  // ---- argv: --json flag vs the one optional positional path (order-independent).
  //      Mirrors scripts/doctor.mjs. ----
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes("--json");
  const repoArg = argv.find((a) => !a.startsWith("--"));

  const chosen = repoArg ?? process.env.PRAXEUM_COURSE ?? walkUp(process.cwd()) ?? process.cwd();
  const repoRoot = path.resolve(chosen);

  const SCHEMAS = {
    module: loadSchema("module"),
    progress: loadSchema("progress"),
    "quiz-bank": loadSchema("quiz-bank"),
    lab: loadSchema("lab"),
  };

  const found = targets(repoRoot);
  const results = found.map((t) => validateFile(repoRoot, t.rel, t.schema, SCHEMAS));

  if (results.length === 0) {
    // Nothing to validate. Not a validation failure — but say so loudly, never silently.
    results.push({
      id: "validate",
      level: "warn",
      message: `no validatable files found under ${repoRoot}`,
      errors: [],
    });
  }

  // ---- render + exit ----
  const anyFail = results.some((r) => r.level === "fail");

  if (jsonMode) {
    console.log(
      JSON.stringify(
        results.map(({ id, level, message }) => ({ id, level, message })),
        null,
        2,
      ),
    );
  } else {
    const glyph = { ok: "✓", warn: "⚠", fail: "✗" };
    console.log(`validate — ${repoRoot}`);
    for (const r of results) {
      console.log(`${glyph[r.level]} ${r.id}`);
      if (r.level === "fail") {
        if (r.errors && r.errors.length) {
          for (const e of r.errors)
            console.log(`    ${e.path === "" ? "(root)" : e.path}: ${e.message}`);
        } else {
          console.log(`    ${r.message}`);
        }
      }
    }
    const fails = results.filter((r) => r.level === "fail").length;
    const oks = results.filter((r) => r.level === "ok").length;
    console.log(
      anyFail
        ? `\n${fails} file(s) failed validation${oks ? `, ${oks} valid` : ""} — fix before continuing.`
        : results.some((r) => r.level === "warn")
          ? `\nnothing to validate.`
          : `\nall ${oks} file(s) valid.`,
    );
  }

  process.exit(anyFail ? 1 : 0);
}

// Run only as a CLI; on import (tests) the pure validate() above is used directly.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
