import path from "node:path";
import { PRODUCT_NAME } from "../shared/product";

export type DistributionPlatform = "win32" | "darwin";
export type DistributionArchitecture = "x64" | "arm64";

export interface RuntimeLayout {
  mode: "development" | "packaged";
  platform: NodeJS.Platform;
  architecture: NodeJS.Architecture;
  root: string | null;
  manifestPath: string | null;
  courseTemplateRoot: string;
  gitExecutable: string;
  npmCliPath: string;
  nodeShimPath: string;
  toolDirectories: readonly string[];
}

export interface DevelopmentRuntimeLayout {
  courseTemplateRoot: string;
  npmCliPath: string;
  gitExecutable?: string;
  nodeShimPath?: string;
}

export interface ResolveRuntimeLayoutOptions {
  packaged: boolean;
  resourcesPath: string;
  platform?: NodeJS.Platform;
  architecture?: NodeJS.Architecture;
  development?: DevelopmentRuntimeLayout;
}

/** Preserve the learner's environment while making installer-owned tools the
 * first resolution candidates for provider shells and engine scripts. */
export function createRuntimeEnvironment(
  toolDirectories: readonly string[],
  source: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  electronExecutable?: string,
): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0].toLowerCase() !== "praxeum_electron_executable",
    ),
  );
  const pathKeys = Object.keys(environment).filter((key) => key.toLowerCase() === "path");
  const pathKey = platform === "win32" ? (pathKeys[0] ?? "Path") : "PATH";
  const inheritedPath = pathKeys.map((key) => environment[key]).find((value) => value !== "") ?? "";
  for (const key of pathKeys) delete environment[key];
  const delimiter = platform === "win32" ? ";" : ":";
  environment[pathKey] = [...toolDirectories, inheritedPath]
    .filter((value) => value !== "")
    .join(delimiter);
  if (electronExecutable !== undefined) {
    environment.PRAXEUM_ELECTRON_EXECUTABLE = electronExecutable;
  }
  return environment;
}

function packagedTarget(
  platform: NodeJS.Platform,
  architecture: NodeJS.Architecture,
): {
  platform: DistributionPlatform;
  architecture: DistributionArchitecture;
} {
  if (platform !== "win32" && platform !== "darwin") {
    throw new Error(`${PRODUCT_NAME} has no packaged runtime for ${platform}-${architecture}.`);
  }
  if (architecture !== "x64" && architecture !== "arm64") {
    throw new Error(`${PRODUCT_NAME} has no packaged runtime for ${platform}-${architecture}.`);
  }
  return { platform, architecture };
}

/**
 * The one place that knows where app-owned dependencies live.
 *
 * Development inputs stay injectable so the source checkout remains useful.
 * A packaged build deliberately ignores every development path and resolves
 * only beneath Electron's installer-owned resources directory. Provider-owned
 * installations are discovered separately at the provider seam (ADR-025).
 */
export function resolveRuntimeLayout(options: ResolveRuntimeLayoutOptions): RuntimeLayout {
  const platform = options.platform ?? process.platform;
  const architecture = options.architecture ?? process.arch;

  if (!options.packaged) {
    const development = options.development;
    if (development === undefined) {
      throw new Error("Development runtime paths were not supplied.");
    }
    const gitExecutable = development.gitExecutable ?? "git";

    return {
      mode: "development",
      platform,
      architecture,
      root: null,
      manifestPath: null,
      courseTemplateRoot: development.courseTemplateRoot,
      gitExecutable,
      npmCliPath: development.npmCliPath,
      nodeShimPath: development.nodeShimPath ?? "node",
      toolDirectories: [],
    };
  }

  const target = packagedTarget(platform, architecture);
  return resolvePackagedRuntimeRoot(
    path.join(options.resourcesPath, "runtime"),
    target.platform,
    target.architecture,
  );
}

/** Resolve an already assembled root. Release acceptance uses this before the
 * tree is copied under Electron's resources directory. */
export function resolvePackagedRuntimeRoot(
  root: string,
  platform: DistributionPlatform,
  architecture: DistributionArchitecture,
): RuntimeLayout {
  const windows = platform === "win32";
  const gitExecutable = path.join(
    root,
    "tools",
    "git",
    windows ? "cmd" : "bin",
    windows ? "git.exe" : "git",
  );
  const npmBin = path.join(root, "tools", "npm", "bin");

  return {
    mode: "packaged",
    platform,
    architecture,
    root,
    manifestPath: path.join(root, "manifest.json"),
    courseTemplateRoot: path.join(root, "course-engine", "template"),
    gitExecutable,
    npmCliPath: path.join(npmBin, "npm-cli.js"),
    nodeShimPath: path.join(npmBin, windows ? "node.cmd" : "node"),
    toolDirectories: [path.dirname(gitExecutable), npmBin],
  };
}
