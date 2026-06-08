const { spawnSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const electronBuilder = path.join(root, "node_modules", ".bin", "electron-builder.cmd");

const result = spawnSync(electronBuilder, ["--win", "nsis"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
