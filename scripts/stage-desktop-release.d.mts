export interface DesktopReleaseStageOptions {
  artifactsDir: string;
  signedDir: string;
  sources: string;
  notes: string;
  notices: string;
  publicKey: string;
  productName: string;
  executableName: string;
  sourceCommit: string;
  sourceLedgerPath?: string;
  output: string;
}

export interface DesktopReleaseArtifact {
  platform: "win32" | "darwin";
  architecture: "x64" | "arm64";
  packageType: "nsis" | "dmg";
  versioned: string;
  bytes: number;
  sha256: string;
}

export interface DesktopReleaseBundle {
  schemaVersion: 1;
  productName: string;
  executableName: string;
  version: string;
  tag: string;
  sourceCommit: string;
  artifacts: DesktopReleaseArtifact[];
  correspondingSource: {
    fileName: string;
    bytes: number;
    sha256: string;
  };
}

export function stageDesktopRelease(
  options: DesktopReleaseStageOptions,
): Promise<{ output: string; bundle: DesktopReleaseBundle }>;
