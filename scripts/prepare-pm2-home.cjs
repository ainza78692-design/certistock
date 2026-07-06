const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

if (process.platform !== "linux") {
  process.exit(0);
}

const appDir = path.resolve(process.cwd());

if (appDir !== "/opt/certistock") {
  process.exit(0);
}

const pm2Home = process.env.PM2_HOME || path.join(appDir, ".pm2");

for (const dir of ["logs", "pids", "modules"]) {
  fs.mkdirSync(path.join(pm2Home, dir), { recursive: true });
}

for (const file of ["module_conf.json", "pm2.log"]) {
  const filePath = path.join(pm2Home, file);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, file === "module_conf.json" ? "{}\n" : "");
  }
}

try {
  const uid = execFileSync("id", ["-u"], { encoding: "utf8" }).trim();
  if (uid === "0") {
    execFileSync("chown", ["-R", "certistock:certistock", pm2Home], {
      stdio: "ignore",
    });
  }
} catch (error) {
  console.warn(`Could not adjust PM2 home ownership: ${error.message}`);
}