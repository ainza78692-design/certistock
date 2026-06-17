import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..", "..");
const releaseDir = path.join(rootDir, "release");
const updatesDir = path.join(rootDir, "server", "updates");

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const data = await fs.readFile(filePath);
  hash.update(data);
  return hash.digest("hex");
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
    console.error(`\n❌ Error: Installer not found at ${exePath}`);
    console.error(`Did you forget to run 'npm run desktop:build'?\n`);
    process.exit(1);
  }

  await fs.mkdir(updatesDir, { recursive: true });

  console.log(`Calculating SHA-256 for ${exeName}...`);
  const sha256 = await sha256File(exePath);

  const targetExeName = exeName.replace(/ /g, "-");
  const targetExePath = path.join(updatesDir, targetExeName);
  
  console.log(`Copying installer to server/updates...`);
  await fs.copyFile(exePath, targetExePath);

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
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log("\n✅ Update published successfully!");
  console.log(`- Installer: server/updates/${targetExeName}`);
  console.log(`- Manifest: server/updates/version.json`);
  console.log(`\nWhen users open the app, it will automatically download this update.\n`);
}

publishUpdate().catch(console.error);
