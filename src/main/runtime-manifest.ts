import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { RuntimeLayout } from "./runtime-layout";

const SHA256 = /^[a-f0-9]{64}$/u;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const SAFE_RELATIVE_PATH = z.string().min(1).refine(isSafeRelativePath, {
  message: "Runtime paths must be normalized relative paths.",
});

const RuntimeFileSchema = z
  .object({
    path: SAFE_RELATIVE_PATH,
    size: z.number().int().nonnegative(),
    sha256: z.string().regex(SHA256),
    executable: z.boolean().optional(),
  })
  .strict();

const COMPONENT_IDS = ["course-engine", "git", "npm"] as const;

const RuntimeComponentSchema = z
  .object({
    id: z.enum(COMPONENT_IDS),
    version: z.string().min(1),
    license: z.string().min(1),
    source: z.url(),
    fileCount: z.number().int().positive(),
    treeSha256: z.string().regex(SHA256),
    requiredFiles: z.array(RuntimeFileSchema).min(1),
  })
  .strict();

export const RuntimeManifestSchema = z
  .object({
    schemaVersion: z.literal(4),
    appVersion: z.string().regex(VERSION),
    target: z
      .object({ platform: z.enum(["win32", "darwin"]), architecture: z.enum(["x64", "arm64"]) })
      .strict(),
    components: z.array(RuntimeComponentSchema).length(COMPONENT_IDS.length),
    /** Complete runtime payload excluding manifest.json itself. This closes
     * the gap between component verification and root-level notices/files. */
    payload: z
      .object({
        fileCount: z.number().int().positive(),
        treeSha256: z.string().regex(SHA256),
      })
      .strict(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const ids = manifest.components.map((component) => component.id);
    for (const id of COMPONENT_IDS) {
      if (ids.filter((candidate) => candidate === id).length !== 1) {
        context.addIssue({
          code: "custom",
          path: ["components"],
          message: `Runtime component ${id} must appear exactly once.`,
        });
      }
    }
    const files = new Set<string>();
    for (const component of manifest.components) {
      for (const file of component.requiredFiles) {
        if (files.has(file.path)) {
          context.addIssue({
            code: "custom",
            path: ["components"],
            message: `Duplicate required runtime file: ${file.path}`,
          });
        }
        files.add(file.path);
      }
    }
  });

export type RuntimeManifest = z.infer<typeof RuntimeManifestSchema>;

export type RuntimeInspection =
  { ok: true; manifest: RuntimeManifest } | { ok: false; reason: string };

/** Validate the target, complete component trees, and critical-file metadata
 * without trusting paths from the manifest to escape the installer-owned root.
 * The complete payload and component hashes share one disk traversal: they
 * cover the same bytes at different relative roots, so reading them twice
 * would only make the learner wait longer at every packaged startup. */
export async function inspectPackagedRuntime(
  layout: RuntimeLayout,
  expectedAppVersion: string,
): Promise<RuntimeInspection> {
  if (layout.mode !== "packaged" || layout.root === null || layout.manifestPath === null) {
    return { ok: false, reason: "Packaged runtime inspection requires a packaged layout." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(layout.manifestPath, "utf8")) as unknown;
  } catch {
    return { ok: false, reason: "The packaged runtime manifest is unavailable." };
  }
  const result = RuntimeManifestSchema.safeParse(parsed);
  if (!result.success) return { ok: false, reason: "The packaged runtime manifest is invalid." };
  const manifest = result.data;
  if (manifest.appVersion !== expectedAppVersion) {
    return { ok: false, reason: "The packaged runtime belongs to a different app version." };
  }
  if (
    manifest.target.platform !== layout.platform ||
    manifest.target.architecture !== layout.architecture
  ) {
    return { ok: false, reason: "The packaged runtime targets a different system." };
  }

  const declaredFiles = new Set(
    manifest.components.flatMap((component) => component.requiredFiles.map((file) => file.path)),
  );
  for (const requiredPath of criticalRuntimePaths(layout)) {
    if (!declaredFiles.has(requiredPath)) {
      return { ok: false, reason: `The runtime manifest omits ${requiredPath}.` };
    }
  }

  let inventory: RuntimeInventoryDescription;
  try {
    inventory = await describeRuntimeInventory(layout.root);
  } catch {
    return { ok: false, reason: "The packaged runtime payload is unavailable." };
  }
  for (const component of manifest.components) {
    const tree = inventory.components[component.id];
    if (tree.fileCount !== component.fileCount || tree.treeSha256 !== component.treeSha256) {
      return { ok: false, reason: `The packaged ${component.id} runtime tree is corrupt.` };
    }
    for (const file of component.requiredFiles) {
      const absolutePath = path.resolve(layout.root, ...file.path.split("/"));
      if (!isWithin(layout.root, absolutePath)) {
        return { ok: false, reason: "The runtime manifest contains an unsafe path." };
      }
      try {
        const info = await lstat(absolutePath);
        if (!info.isFile() || info.isSymbolicLink() || info.size !== file.size) {
          return { ok: false, reason: `The packaged runtime file ${file.path} is invalid.` };
        }
        if (file.executable === true && (info.mode & 0o111) === 0) {
          return { ok: false, reason: `The packaged runtime file ${file.path} is not executable.` };
        }
        if ((await sha256File(absolutePath)) !== file.sha256) {
          return { ok: false, reason: `The packaged runtime file ${file.path} is corrupt.` };
        }
      } catch {
        return { ok: false, reason: `The packaged runtime file ${file.path} is unavailable.` };
      }
    }
  }
  if (
    inventory.payload.fileCount !== manifest.payload.fileCount ||
    inventory.payload.treeSha256 !== manifest.payload.treeSha256
  ) {
    return { ok: false, reason: "The packaged runtime payload is corrupt." };
  }
  return { ok: true, manifest };
}

export interface RuntimeTreeDescription {
  fileCount: number;
  treeSha256: string;
}

interface RuntimeTreeEntry {
  type: "file" | "link";
  path: string;
  mode?: number;
  size: number;
  sha256: string;
}

/** An entry whose digest is not settled yet. A link's digest is of its target
 * string and is known during the walk; a file's is taken afterwards, so the
 * reads can overlap. */
interface ScannedEntry extends RuntimeTreeEntry {
  pendingFile: string | null;
}

type RuntimeComponentId = (typeof COMPONENT_IDS)[number];

interface RuntimeInventoryDescription {
  payload: RuntimeTreeDescription;
  components: Record<RuntimeComponentId, RuntimeTreeDescription>;
}

const COMPONENT_PREFIXES: Record<RuntimeComponentId, string> = {
  "course-engine": "course-engine/",
  git: "tools/git/",
  npm: "tools/npm/",
};

/** Reading and hashing the runtime is what a packaged launch waits on, and
 * nearly all of that wait is the disk rather than SHA-256. A small pool keeps
 * several reads in flight, which is worth roughly a threefold cut on the
 * 2 300-file Windows payload. It changes no result: the digest depends on the
 * sorted entry order, which summarizeTree establishes after every entry is
 * settled. */
const HASH_CONCURRENCY = 8;

async function settleScannedFiles(entries: ScannedEntry[]): Promise<void> {
  const pending = entries.filter((entry) => entry.pendingFile !== null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(HASH_CONCURRENCY, pending.length) }, async () => {
      for (;;) {
        const entry = pending[next];
        next += 1;
        if (entry === undefined) return;
        const filePath = entry.pendingFile;
        if (filePath !== null) entry.sha256 = await sha256File(filePath);
      }
    }),
  );
}

/** Canonical tree algorithm shared by startup inspection and test fixtures.
 * It intentionally matches scripts/assemble-runtime.mjs byte for byte. */
export async function describeRuntimeTree(root: string): Promise<RuntimeTreeDescription> {
  return describeTree(root, new Set());
}

/** Hash every runtime payload entry while excluding the self-describing
 * manifest publication marker. */
export async function describeRuntimePayloadTree(root: string): Promise<RuntimeTreeDescription> {
  return describeTree(root, new Set(["manifest.json"]));
}

async function describeTree(
  root: string,
  excludedRelativePaths: ReadonlySet<string>,
): Promise<RuntimeTreeDescription> {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("Runtime component root is not an ordinary directory.");
  }
  const entries: ScannedEntry[] = [];
  await scanRuntimeTree(root, root, entries, excludedRelativePaths);
  await settleScannedFiles(entries);
  return summarizeTree(entries);
}

async function describeRuntimeInventory(root: string): Promise<RuntimeInventoryDescription> {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("Runtime payload root is not an ordinary directory.");
  }
  const payload: ScannedEntry[] = [];
  await scanRuntimeInventory(root, root, payload);
  await settleScannedFiles(payload);

  /* The components are the same bytes at a different relative root, so they
     are cut from the settled payload rather than walked or hashed again. */
  const components: Record<RuntimeComponentId, RuntimeTreeEntry[]> = {
    "course-engine": [],
    git: [],
    npm: [],
  };
  for (const entry of payload) {
    const component = runtimeComponentEntry(entry.path);
    if (component !== null) {
      components[component.id].push({ ...entry, path: component.relativePath });
    }
  }
  return {
    payload: summarizeTree(payload),
    components: {
      "course-engine": summarizeTree(components["course-engine"]),
      git: summarizeTree(components.git),
      npm: summarizeTree(components.npm),
    },
  };
}

function summarizeTree(entries: RuntimeTreeEntry[]): RuntimeTreeDescription {
  entries.sort((left, right) => lexicalCompare(left.path, right.path));
  const aggregate = createHash("sha256");
  for (const entry of entries) {
    aggregate.update(
      `${entry.type}\0${entry.path}\0${entry.mode ?? "link"}\0${entry.size}\0${entry.sha256}\n`,
    );
  }
  return { fileCount: entries.length, treeSha256: aggregate.digest("hex") };
}

async function scanRuntimeInventory(
  root: string,
  current: string,
  payload: ScannedEntry[],
): Promise<void> {
  const names = await readdir(current);
  names.sort(lexicalCompare);
  for (const name of names) {
    const absolutePath = path.join(current, name);
    const relativePath = toManifestPath(root, absolutePath);
    if (relativePath === "manifest.json") continue;
    const info = await lstat(absolutePath);
    if (info.isDirectory() && !info.isSymbolicLink()) {
      await scanRuntimeInventory(root, absolutePath, payload);
      continue;
    }

    if (info.isSymbolicLink()) {
      /* A link inside a component may not leave that component, and a link
         outside every component may not leave the payload. */
      const component = runtimeComponentEntry(relativePath);
      const boundary =
        component === null
          ? root
          : path.join(root, ...COMPONENT_PREFIXES[component.id].slice(0, -1).split("/"));
      payload.push(await scanLink(absolutePath, relativePath, boundary));
    } else if (info.isFile()) {
      payload.push(scanFile(absolutePath, relativePath, info.mode, info.size));
    } else {
      throw new Error("Runtime payload contains an unsupported entry.");
    }
  }
}

function runtimeComponentEntry(
  relativePath: string,
): { id: RuntimeComponentId; relativePath: string } | null {
  for (const id of COMPONENT_IDS) {
    const prefix = COMPONENT_PREFIXES[id];
    if (relativePath.startsWith(prefix)) {
      return { id, relativePath: relativePath.slice(prefix.length) };
    }
  }
  return null;
}

async function scanRuntimeTree(
  root: string,
  current: string,
  entries: ScannedEntry[],
  excludedRelativePaths: ReadonlySet<string>,
): Promise<void> {
  const names = await readdir(current);
  names.sort(lexicalCompare);
  for (const name of names) {
    const absolutePath = path.join(current, name);
    const relativePath = toManifestPath(root, absolutePath);
    if (excludedRelativePaths.has(relativePath)) continue;
    const info = await lstat(absolutePath);
    if (info.isDirectory() && !info.isSymbolicLink()) {
      await scanRuntimeTree(root, absolutePath, entries, excludedRelativePaths);
    } else if (info.isSymbolicLink()) {
      entries.push(await scanLink(absolutePath, relativePath, root));
    } else if (info.isFile()) {
      entries.push(scanFile(absolutePath, relativePath, info.mode, info.size));
    } else {
      throw new Error("Runtime component contains an unsupported entry.");
    }
  }
}

async function scanLink(
  absolutePath: string,
  relativePath: string,
  boundary: string,
): Promise<ScannedEntry> {
  const target = await readlink(absolutePath);
  const resolvedTarget = path.resolve(path.dirname(absolutePath), target);
  if (!isWithin(boundary, resolvedTarget)) throw new Error("Runtime link escapes its component.");
  return {
    type: "link",
    path: relativePath,
    size: Buffer.byteLength(target),
    sha256: createHash("sha256").update(target).digest("hex"),
    pendingFile: null,
  };
}

function scanFile(
  absolutePath: string,
  relativePath: string,
  mode: number,
  size: number,
): ScannedEntry {
  return {
    type: "file",
    path: relativePath,
    mode: mode & 0o777,
    size,
    sha256: "",
    pendingFile: absolutePath,
  };
}

function criticalRuntimePaths(layout: RuntimeLayout): string[] {
  if (layout.root === null) return [];
  const npmShim = layout.platform === "win32" ? "npm.cmd" : "npm";
  return [
    path.join(path.dirname(layout.courseTemplateRoot), "manifest.json"),
    path.join(layout.courseTemplateRoot, "CLAUDE.md"),
    path.join(layout.courseTemplateRoot, "scripts", "doctor.mjs"),
    layout.gitExecutable,
    layout.npmCliPath,
    path.join(path.dirname(layout.npmCliPath), npmShim),
    layout.nodeShimPath,
  ].map((filePath) => toManifestPath(layout.root as string, filePath));
}

function toManifestPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function isSafeRelativePath(value: string): boolean {
  if (
    value.includes("\\") ||
    value.includes(":") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    [...value].some((character) => character.charCodeAt(0) < 0x20)
  ) {
    return false;
  }
  const segments = value.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function sha256File(filePath: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}

function lexicalCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
