import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginsRoot = path.join(repoRoot, "plugins");

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listPluginDirs() {
  const entries = await fs.readdir(pluginsRoot, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function findTests(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const tests = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      tests.push(...await findTests(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      tests.push(fullPath);
    }
  }
  return tests.sort((left, right) => left.localeCompare(right));
}

function runNodeTest(files) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ["--test", ...files], {
      cwd: repoRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        WITNESS_LOG_LEVEL: process.env.WITNESS_LOG_LEVEL ?? "silent"
      }
    });
    child.on("exit", code => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

const requestedPluginDirs = process.argv.slice(2).map(value => String(value || "").trim()).filter(Boolean);
const pluginDirs = requestedPluginDirs.length ? requestedPluginDirs : await listPluginDirs();
const missing = [];
const testFiles = [];

for (const pluginDir of pluginDirs) {
  const fullPath = path.join(pluginsRoot, pluginDir);
  if (!await pathExists(fullPath)) {
    missing.push(pluginDir);
    continue;
  }
  testFiles.push(...await findTests(fullPath));
}

if (missing.length) {
  console.error(`Unknown plugin directories: ${missing.join(", ")}`);
  process.exit(1);
}

if (!testFiles.length) {
  console.error(`No plugin tests found for: ${pluginDirs.join(", ")}`);
  process.exit(1);
}

process.exit(await runNodeTest(testFiles));
