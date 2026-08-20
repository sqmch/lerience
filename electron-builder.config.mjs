import { assertDistributionInventory } from "./scripts/distribution-inventory.mjs";
import { readDesktopPackageInputs } from "./scripts/desktop-artifacts.mjs";

const inputs = readDesktopPackageInputs();
const MAX_UNPACKED_BYTES = 600 * 1024 * 1024;

const platformConfiguration =
  inputs.target.platform === "win32"
    ? {
        win: {
          icon: "build/icon.ico",
          executableName: inputs.executableName,
          compression: "maximum",
          target: [{ target: "nsis", arch: [inputs.target.architecture] }],
        },
        nsis: {
          oneClick: false,
          perMachine: false,
          allowToChangeInstallationDirectory: true,
          deleteAppDataOnUninstall: false,
          artifactName: `${inputs.executableName}-Setup-\${version}-\${arch}.\${ext}`,
        },
      }
    : {
        mac: {
          icon: "build/icon.png",
          category: "public.app-category.education",
          executableName: inputs.executableName,
          extendInfo: { LSFileQuarantineEnabled: true },
          identity: null,
          hardenedRuntime: false,
          notarize: false,
          target: [{ target: "dmg", arch: [inputs.target.architecture] }],
        },
        dmg: {
          artifactName: `${inputs.executableName}-\${version}-\${arch}.\${ext}`,
        },
      };

export default {
  appId: inputs.appId,
  productName: inputs.productName,
  asar: true,
  npmRebuild: false,
  files: ["out/**/*", "package.json"],
  extraResources: [
    { from: inputs.runtimeRoot, to: "runtime", filter: ["**/*"] },
    { from: "distribution/THIRD-PARTY-NOTICES.md", to: "THIRD-PARTY-NOTICES.md" },
  ],
  directories: { output: inputs.target.outputDirectory },
  publish: null,
  generateUpdatesFilesForAllChannels: false,
  forceCodeSigning: false,
  ...platformConfiguration,
  afterPack: async (context) => {
    const report = await assertDistributionInventory(context.appOutDir, {
      maxBytes: MAX_UNPACKED_BYTES,
    });
    globalThis.process.stdout.write(
      `[praxeum] unpacked inventory: ${report.fileCount} files, ${report.asarEntryCount} asar entries, ${report.totalBytes} bytes\n`,
    );
  },
};
