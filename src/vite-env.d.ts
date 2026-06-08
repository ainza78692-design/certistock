/// <reference types="vite/client" />

type CertiStockUpdateManifest = {
  app?: string;
  channel?: string;
  latestVersion?: string;
  minimumSupportedVersion?: string;
  mandatory?: boolean;
  releaseDate?: string;
  installerUrl?: string;
  sha256?: string;
  signatureUrl?: string;
  releaseNotesUrl?: string;
  rollbackVersion?: string;
};

interface Window {
  certistockDesktop?: {
    platform: string;
    electron: string;
    getAppInfo: () => Promise<{
      version: string;
      name: string;
      platform: string;
      electron: string;
    }>;
    checkForUpdates: (manifestUrl: string) => Promise<{
      currentVersion: string;
      updateAvailable: boolean;
      mandatory: boolean;
      manifest: CertiStockUpdateManifest;
    }>;
    downloadUpdate: (manifest: CertiStockUpdateManifest) => Promise<{
      filePath: string;
      sha256: string;
    }>;
    installUpdate: (filePath: string) => Promise<{ started: boolean }>;
  };
}
