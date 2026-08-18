import fs from "node:fs";
import path from "node:path";
import type { TutorProviderId } from "../../shared/provider";

export interface InstalledProviderRuntime {
  providerId: TutorProviderId;
  executablePath: string | null;
  source: "well-known" | "path" | null;
}

export interface DiscoverInstalledProviderOptions {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  isFile?: (candidate: string) => boolean;
}

/** Discover a provider-owned native client without invoking a shell or reading
 * provider credentials/config. Official well-known locations cover desktop and
 * native installers; PATH covers a learner-managed native CLI installation. */
export function discoverInstalledProviderRuntime(
  providerId: TutorProviderId,
  options: DiscoverInstalledProviderOptions = {},
): InstalledProviderRuntime {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const isFile = options.isFile ?? ordinaryFile;

  for (const candidate of wellKnownCandidates(providerId, platform, environment)) {
    if (isFile(candidate)) return { providerId, executablePath: candidate, source: "well-known" };
  }
  for (const candidate of pathCandidates(providerId, platform, environment)) {
    if (isFile(candidate)) return { providerId, executablePath: candidate, source: "path" };
  }
  return { providerId, executablePath: null, source: null };
}

function wellKnownCandidates(
  providerId: TutorProviderId,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): string[] {
  const userHome = environment[platform === "win32" ? "USERPROFILE" : "HOME"];
  if (platform === "win32") {
    const localAppData = environment.LOCALAPPDATA;
    return unique([
      providerId === "codex" && localAppData
        ? path.join(localAppData, "Programs", "OpenAI", "Codex", "bin", "codex.exe")
        : null,
      userHome
        ? path.join(userHome, ".local", "bin", providerId === "claude" ? "claude.exe" : "codex.exe")
        : null,
    ]);
  }

  const executable = providerId === "claude" ? "claude" : "codex";
  return unique([
    userHome ? path.join(userHome, ".local", "bin", executable) : null,
    `/opt/homebrew/bin/${executable}`,
    `/usr/local/bin/${executable}`,
  ]);
}

function pathCandidates(
  providerId: TutorProviderId,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): string[] {
  const pathValue = Object.entries(environment).find(
    ([key, value]) => key.toLowerCase() === "path" && typeof value === "string",
  )?.[1];
  if (pathValue === undefined || pathValue === "") return [];
  const executable = providerId === "claude" ? "claude" : "codex";
  const names = platform === "win32" ? [`${executable}.exe`, executable] : [executable];
  return unique(
    pathValue
      .split(platform === "win32" ? ";" : ":")
      .map((directory) => directory.trim().replace(/^"(.*)"$/u, "$1"))
      .filter((directory) => directory !== "")
      .flatMap((directory) => names.map((name) => path.join(directory, name))),
  );
}

function ordinaryFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function unique(candidates: Array<string | null>): string[] {
  return [...new Set(candidates.filter((candidate): candidate is string => candidate !== null))];
}
