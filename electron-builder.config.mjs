import { assertDistributionInventory } from "./scripts/distribution-inventory.mjs";
import { readWindowsPackageInputs } from "./scripts/windows-package-inputs.mjs";

const inputs = readWindowsPackageInputs();
const MAX_UNPACKED_BYTES = 600 * 1024 * 1024;

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
  directories: { output: "dist/package/windows-x64" },
  publish: null,
  generateUpdatesFilesForAllChannels: false,
  forceCodeSigning: false,
  win: {
    icon: "build/icon.ico",
    executableName: inputs.executableName,
    compression: "maximum",
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    artifactName: `${inputs.executableName}-Setup-\${version}-\${arch}.\${ext}`,
  },
  afterPack: async (context) => {
    const report = await assertDistributionInventory(context.appOutDir, {
      maxBytes: MAX_UNPACKED_BYTES,
    });
    globalThis.process.stdout.write(
      `[praxeum] unpacked inventory: ${report.fileCount} files, ${report.asarEntryCount} asar entries, ${report.totalBytes} bytes\n`,
    );
  },
};
