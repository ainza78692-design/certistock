const { spawnSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const electronBuilder = path.join(root, "node_modules", "electron-builder", "cli.js");

const result = spawnSync(process.execPath, [electronBuilder, "--win"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
