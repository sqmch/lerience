export interface WindowsReleaseStageOptions {
  nsis: string;
  portable: string;
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

export interface WindowsReleaseBundle {
  schemaVersion: 1;
  productName: string;
  executableName: string;
  version: string;
  tag: string;
  sourceCommit: string;
  artifacts: {
    nsis: {
      versioned: string;
      bytes: number;
      sha256: string;
    };
    portable: {
      versioned: string;
      bytes: number;
      sha256: string;
    };
  };
  correspondingSource: {
    fileName: string;
    bytes: number;
    sha256: string;
  };
}

export function stageWindowsRelease(
  options: WindowsReleaseStageOptions,
): Promise<{ output: string; bundle: WindowsReleaseBundle }>;
