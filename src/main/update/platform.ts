import type { UpdateAction } from "../../shared/update";
import type { ReleaseTarget } from "./release-manifest";

const NSIS_SILENT_UPDATE_ARGUMENTS = ["--updated", "/S", "--force-run"] as const;

export interface UpdatePlatformOptions {
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly portableExecutable: boolean;
  readonly openPath: (filePath: string) => Promise<string>;
  readonly launchDetached: (filePath: string, args: readonly string[]) => void;
}

export interface UpdatePlatform {
  readonly target: ReleaseTarget;
  readonly launchArtifact: (filePath: string, action: UpdateAction) => Promise<void>;
}

/** Owns the one platform seam in the updater: release selection and the final
 * handoff. Download, verification, progress, and session shutdown stay shared. */
export function createUpdatePlatform(options: UpdatePlatformOptions): UpdatePlatform {
  const architecture = options.architecture === "arm64" ? "arm64" : "x64";

  if (options.platform === "darwin") {
    return {
      target: { platform: "darwin", architecture, installation: "app-bundle" },
      launchArtifact: async (filePath, action) => {
        assertAction(action, "open-package");
        const error = await options.openPath(filePath);
        if (error !== "") throw new Error(error);
      },
    };
  }

  const installation = options.portableExecutable ? "portable" : "nsis";
  const expectedAction = installation === "nsis" ? "install-restart" : "open-package";

  return {
    target: { platform: "win32", architecture, installation },
    launchArtifact: async (filePath, action) => {
      assertAction(action, expectedAction);
      // These are electron-builder's NSIS update flags. The learner approved
      // the handoff; NSIS then updates without its wizard and reopens Lerience.
      const args = action === "install-restart" ? NSIS_SILENT_UPDATE_ARGUMENTS : [];
      options.launchDetached(filePath, args);
    },
  };
}

function assertAction(actual: UpdateAction, expected: UpdateAction): void {
  if (actual !== expected) throw new Error("That update action is unavailable.");
}
