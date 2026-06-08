const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const compareVersions = (a, b) => {
  const pa = String(a || "0.0.0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = String(b || "0.0.0").split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const fetchJson = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Update manifest request failed: HTTP ${response.status}`);
  return response.json();
};

const sha256File = (filePath) => new Promise((resolve, reject) => {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("error", reject);
  stream.on("end", () => resolve(hash.digest("hex")));
});

const downloadFile = async (url, targetPath) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Update download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(targetPath, bytes);
  return targetPath;
};

ipcMain.handle("certistock:get-app-info", () => ({
  version: app.getVersion(),
  name: app.getName(),
  platform: process.platform,
  electron: process.versions.electron,
}));

ipcMain.handle("certistock:check-for-updates", async (_event, manifestUrl) => {
  if (!manifestUrl) throw new Error("Update manifest URL is required");
  const manifest = await fetchJson(manifestUrl);
  const currentVersion = app.getVersion();
  const latestVersion = manifest.latestVersion || manifest.version;
  const minimumSupportedVersion = manifest.minimumSupportedVersion || latestVersion;
  const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
  const mandatory = Boolean(manifest.mandatory) || compareVersions(currentVersion, minimumSupportedVersion) < 0;
  return {
    currentVersion,
    updateAvailable,
    mandatory,
    manifest,
  };
});

ipcMain.handle("certistock:download-update", async (_event, manifest) => {
  if (!manifest?.installerUrl) throw new Error("Update manifest does not include installerUrl");
  if (!manifest?.sha256) throw new Error("Update manifest does not include sha256");

  const fileName = path.basename(new URL(manifest.installerUrl).pathname) || "CertiStock-Setup.exe";
  const targetPath = path.join(os.tmpdir(), fileName);
  await downloadFile(manifest.installerUrl, targetPath);

  const actual = await sha256File(targetPath);
  const expected = String(manifest.sha256).trim().toLowerCase();
  if (actual.toLowerCase() !== expected) {
    await fs.promises.rm(targetPath, { force: true });
    throw new Error("Downloaded update failed SHA-256 verification");
  }

  return { filePath: targetPath, sha256: actual };
});

ipcMain.handle("certistock:install-update", async (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) throw new Error("Installer file not found");
  const result = await dialog.showMessageBox({
    type: "question",
    buttons: ["Install and restart", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: "Install CertiStock update",
    message: "CertiStock will close while the installer updates the application.",
  });
  if (result.response !== 0) return { started: false };
  await shell.openPath(filePath);
  app.quit();
  return { started: true };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: "CertiStock - Certified Stock Tracking",
    backgroundColor: "#fbfaf8",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
