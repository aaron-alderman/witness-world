import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const mode = (process.argv[2] || "default").trim().toLowerCase();
const validModes = new Set(["default", "ui", "all"]);

if (!validModes.has(mode)) {
  console.error(`Unknown test mode: ${mode}`);
  console.error("Expected one of: default, ui, all");
  process.exit(1);
}

const rootDir = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const testDir = path.join(rootDir, "test");
const entries = await readdir(testDir, { withFileTypes: true });

const selectedTests = entries
  .filter(entry => entry.isFile() && entry.name.endsWith(".test.js"))
  .map(entry => entry.name)
  .filter(name => {
    if (mode === "all") return true;
    const isUi = name.startsWith("ui.");
    return mode === "ui" ? isUi : !isUi;
  })
  .sort((left, right) => left.localeCompare(right))
  .map(name => path.join(testDir, name));

if (selectedTests.length === 0) {
  console.error(`No tests matched mode: ${mode}`);
  process.exit(1);
}

const child = spawn(process.execPath, ["--test", ...selectedTests], {
  cwd: rootDir,
  stdio: "inherit",
  env: {
    ...process.env,
    WITNESS_LOG_LEVEL: process.env.WITNESS_LOG_LEVEL || "silent"
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
