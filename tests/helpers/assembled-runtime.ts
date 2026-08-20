import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  createRuntimeEnvironment,
  resolvePackagedRuntimeRoot,
  type DistributionArchitecture,
  type DistributionPlatform,
  type RuntimeLayout,
} from "../../src/main/runtime-layout";

const require = createRequire(import.meta.url);

export interface AssembledRuntimeFixture {
  root: string;
  layout: RuntimeLayout;
  electronExecutable: string;
  environment: Record<string, string>;
}

export function loadAssembledRuntime(): AssembledRuntimeFixture {
  const configuredRoot = process.env["PRAXEUM_RUNTIME_ROOT"];
  if (configuredRoot === undefined) throw new Error("PRAXEUM_RUNTIME_ROOT was removed");
  const platform = nativePlatform(process.platform);
  const architecture = nativeArchitecture(process.arch);
  const root = path.resolve(configuredRoot);
  const layout = resolvePackagedRuntimeRoot(root, platform, architecture);
  const electronExecutable = resolveInstalledElectronExecutable();
  const environment = {
    ...createRuntimeEnvironment(layout.toolDirectories, process.env, platform, electronExecutable),
    ELECTRON_RUN_AS_NODE: "1",
  };
  return { root, layout, electronExecutable, environment };
}

function resolveInstalledElectronExecutable(): string {
  const packageRoot = path.dirname(require.resolve("electron/package.json"));
  const distributionRoot = path.join(packageRoot, "dist");
  const relativeExecutable = fs.readFileSync(path.join(packageRoot, "path.txt"), "utf8").trim();
  const executable = path.resolve(distributionRoot, relativeExecutable);
  const relative = path.relative(distributionRoot, executable);
  if (
    relativeExecutable === "" ||
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) ||
    !fs.statSync(executable).isFile()
  ) {
    throw new Error("The installed Electron executable is unavailable");
  }
  return executable;
}

function nativePlatform(platform: NodeJS.Platform): DistributionPlatform {
  if (platform !== "win32" && platform !== "darwin") {
    throw new Error(
      `The assembled runtime integration is unsupported on ${platform}-${process.arch}`,
    );
  }
  return platform;
}

function nativeArchitecture(architecture: NodeJS.Architecture): DistributionArchitecture {
  if (architecture !== "x64" && architecture !== "arm64") {
    throw new Error(
      `The assembled runtime integration is unsupported on ${process.platform}-${architecture}`,
    );
  }
  return architecture;
}
