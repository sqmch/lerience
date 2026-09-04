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
  /** Child directory names, newest installed first. */
  directories?: (root: string) => string[];
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
  const usable = (candidate: string): boolean => {
    if (!isFile(candidate)) return false;
    if (providerId !== "codex" || platform !== "win32") return true;
    const directory = path.win32.dirname(candidate);
    // Codex may keep these beside the executable or in codex-resources.
    // A version/handshake-only check accepts a copied, unusable codex.exe.
    return ["codex-command-runner.exe", "codex-windows-sandbox-setup.exe"].every((helper) =>
      [directory, path.win32.join(directory, "codex-resources")].some((root) =>
        isFile(path.win32.join(root, helper)),
      ),
    );
  };

  const desktopRoot = environment.LOCALAPPDATA
    ? path.win32.join(environment.LOCALAPPDATA, "OpenAI", "Codex", "bin")
    : null;
  const desktopCandidates =
    providerId === "codex" && platform === "win32" && desktopRoot !== null
      ? (options.directories ?? installedDirectories)(desktopRoot)
          .filter((name) => /^[a-f0-9]{16,64}$/iu.test(name))
          .map((name) => path.win32.join(desktopRoot, name, "codex.exe"))
      : [];
  for (const candidate of [
    ...wellKnownCandidates(providerId, platform, environment),
    ...desktopCandidates,
  ]) {
    if (usable(candidate)) return { providerId, executablePath: candidate, source: "well-known" };
  }
  for (const candidate of pathCandidates(providerId, platform, environment)) {
    if (usable(candidate)) return { providerId, executablePath: candidate, source: "path" };
  }
  return { providerId, executablePath: null, source: null };
}

function wellKnownCandidates(
  providerId: TutorProviderId,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): string[] {
  const nativePath = platform === "win32" ? path.win32 : path.posix;
  const userHome = environment[platform === "win32" ? "USERPROFILE" : "HOME"];
  if (platform === "win32") {
    const localAppData = environment.LOCALAPPDATA;
    return unique([
      providerId === "codex" && localAppData
        ? nativePath.join(localAppData, "Programs", "OpenAI", "Codex", "bin", "codex.exe")
        : null,
      userHome
        ? nativePath.join(
            userHome,
            ".local",
            "bin",
            providerId === "claude" ? "claude.exe" : "codex.exe",
          )
        : null,
    ]);
  }

  const executable = providerId === "claude" ? "claude" : "codex";
  return unique([
    platform === "darwin" && providerId === "codex"
      ? "/Applications/ChatGPT.app/Contents/Resources/codex"
      : null,
    platform === "darwin" && providerId === "codex"
      ? "/Applications/Codex.app/Contents/Resources/codex"
      : null,
    platform === "darwin" && providerId === "codex" && userHome
      ? nativePath.join(userHome, "Applications", "ChatGPT.app", "Contents", "Resources", "codex")
      : null,
    platform === "darwin" && providerId === "codex" && userHome
      ? nativePath.join(userHome, "Applications", "Codex.app", "Contents", "Resources", "codex")
      : null,
    userHome ? nativePath.join(userHome, ".local", "bin", executable) : null,
    `/opt/homebrew/bin/${executable}`,
    `/usr/local/bin/${executable}`,
  ]);
}

function pathCandidates(
  providerId: TutorProviderId,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): string[] {
  const nativePath = platform === "win32" ? path.win32 : path.posix;
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
      .flatMap((directory) => names.map((name) => nativePath.join(directory, name))),
  );
}

function ordinaryFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** The Windows desktop app extracts its native runtimes into content-addressed
 * directories. Explorer's PATH need not contain them. Inspect only that
 * provider-owned location, without following directory links or copying files. */
function installedDirectories(root: string): string[] {
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        modified: fs.statSync(path.join(root, entry.name)).mtimeMs,
      }))
      .sort((left, right) => right.modified - left.modified || left.name.localeCompare(right.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function unique(candidates: Array<string | null>): string[] {
  return [...new Set(candidates.filter((candidate): candidate is string => candidate !== null))];
}
