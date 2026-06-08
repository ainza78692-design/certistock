const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("certistockDesktop", {
  platform: process.platform,
  electron: process.versions.electron,
  getAppInfo: () => ipcRenderer.invoke("certistock:get-app-info"),
  checkForUpdates: (manifestUrl) => ipcRenderer.invoke("certistock:check-for-updates", manifestUrl),
  downloadUpdate: (manifest) => ipcRenderer.invoke("certistock:download-update", manifest),
  installUpdate: (filePath) => ipcRenderer.invoke("certistock:install-update", filePath),
});
