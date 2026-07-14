import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..", "..");
const releaseDir = path.join(rootDir, "release");
const updatesDir = path.join(rootDir, "server", "updates");
const installerPartsDir = path.join(updatesDir, "installer-parts");
const chunkSizeBytes = 40 * 1024 * 1024;

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const data = await fs.readFile(filePath);
  hash.update(data);
  return hash.digest("hex");
}

async function splitInstaller(sourcePath, targetExeName) {
  await fs.rm(installerPartsDir, { recursive: true, force: true });
  await fs.mkdir(installerPartsDir, { recursive: true });

  const data = await fs.readFile(sourcePath);
  const partCount = Math.ceil(data.length / chunkSizeBytes);
  const partNames = [];

  for (let index = 0; index < partCount; index += 1) {
    const start = index * chunkSizeBytes;
    const end = Math.min(start + chunkSizeBytes, data.length);
    const partName = `${targetExeName}.part${String(index).padStart(3, "0")}`;
    await fs.writeFile(path.join(installerPartsDir, partName), data.subarray(start, end));
    partNames.push(partName);
  }

  return partNames;
}

async function publishUpdate() {
  console.log("Publishing update...");

  const pkgPath = path.join(rootDir, "package.json");
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
  const version = pkg.version;

  const exeName = `CertiStock Setup ${version}.exe`;
  const exePath = path.join(releaseDir, exeName);

  try {
    await fs.access(exePath);
  } catch {
    console.error(`\nError: Installer not found at ${exePath}`);
    console.error("Did you forget to run 'npm run desktop:build'?\n");
    process.exit(1);
  }

  await fs.mkdir(updatesDir, { recursive: true });

  console.log(`Calculating SHA-256 for ${exeName}...`);
  const sha256 = await sha256File(exePath);

  const targetExeName = exeName.replace(/ /g, "-");
  const targetExePath = path.join(updatesDir, targetExeName);

  console.log("Copying installer to server/updates for local verification...");
  await fs.copyFile(exePath, targetExePath);

  console.log("Creating deploy-safe installer chunks...");
  const partNames = await splitInstaller(exePath, targetExeName);

  const manifest = {
    version: version,
    latestVersion: version,
    minimumSupportedVersion: "1.0.0",
    installerUrl: `http://100.65.85.125:8787/updates/${targetExeName}`,
    sha256: sha256,
    releaseNotesUrl: "",
    mandatory: false
  };

  const manifestPath = path.join(updatesDir, "version.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("\nUpdate published successfully!");
  console.log(`- Installer: server/updates/${targetExeName}`);
  console.log(`- Manifest: server/updates/version.json`);
  console.log(`- Deploy chunks: ${partNames.length} files in server/updates/installer-parts`);
  console.log("\nWhen users open the app, it will automatically download this update.\n");
}

publishUpdate().catch((error) => {
  console.error(error);
  process.exit(1);
});