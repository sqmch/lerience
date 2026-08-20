import { describe, expect, it, vi } from "vitest";
import { createUpdatePlatform } from "../src/main/update/platform";

function fixture(overrides: Partial<Parameters<typeof createUpdatePlatform>[0]> = {}) {
  const openPath = vi.fn(async () => "");
  const launchDetached = vi.fn();
  const platform = createUpdatePlatform({
    platform: "win32",
    architecture: "x64",
    portableExecutable: false,
    openPath,
    launchDetached,
    ...overrides,
  });
  return { platform, openPath, launchDetached };
}

describe("update platform", () => {
  it("silently updates and reopens an installed Windows build through NSIS", async () => {
    const value = fixture();

    expect(value.platform.target).toEqual({
      platform: "win32",
      architecture: "x64",
      installation: "nsis",
    });

    await value.platform.launchArtifact("Lerience-Setup.exe", "install-restart");

    expect(value.launchDetached).toHaveBeenCalledWith("Lerience-Setup.exe", [
      "--updated",
      "/S",
      "--force-run",
    ]);
    expect(value.openPath).not.toHaveBeenCalled();
  });

  it("keeps Windows portable packages on the visible open-package path", async () => {
    const value = fixture({ portableExecutable: true });

    expect(value.platform.target).toEqual({
      platform: "win32",
      architecture: "x64",
      installation: "portable",
    });

    await value.platform.launchArtifact("Lerience-Portable.exe", "open-package");

    expect(value.launchDetached).toHaveBeenCalledWith("Lerience-Portable.exe", []);
  });

  it("opens the verified macOS package without applying Windows policy", async () => {
    const value = fixture({ platform: "darwin", architecture: "arm64" });

    expect(value.platform.target).toEqual({
      platform: "darwin",
      architecture: "arm64",
      installation: "app-bundle",
    });

    await value.platform.launchArtifact("Lerience.dmg", "open-package");

    expect(value.openPath).toHaveBeenCalledWith("Lerience.dmg");
    expect(value.launchDetached).not.toHaveBeenCalled();
  });

  it("fails closed when the state machine requests the wrong platform action", async () => {
    const value = fixture({ platform: "darwin" });

    await expect(value.platform.launchArtifact("Lerience.dmg", "install-restart")).rejects.toThrow(
      "That update action is unavailable.",
    );
  });

  it("surfaces a macOS package-open failure", async () => {
    const value = fixture({
      platform: "darwin",
      openPath: vi.fn(async () => "The package could not be opened."),
    });

    await expect(value.platform.launchArtifact("Lerience.dmg", "open-package")).rejects.toThrow(
      "The package could not be opened.",
    );
  });
});
