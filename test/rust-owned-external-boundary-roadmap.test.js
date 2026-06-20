import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(repoRoot, "src");

async function listJavaScriptFiles(rootPath) {
  const files = [];
  async function visit(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) {
        files.push(absolutePath);
      }
    }
  }
  await visit(rootPath);
  return files.sort((left, right) => left.localeCompare(right));
}

function relativeRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll("\\", "/");
}

async function matchSourceFiles(pattern) {
  const matches = [];
  for (const absolutePath of await listJavaScriptFiles(srcRoot)) {
    const source = await fs.readFile(absolutePath, "utf8");
    if (pattern.test(source)) matches.push(relativeRepoPath(absolutePath));
    pattern.lastIndex = 0;
  }
  return matches.sort((left, right) => left.localeCompare(right));
}

test("roadmap doc includes live checkbox markers", async () => {
  const docPath = path.join(repoRoot, "docs", "RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md");
  const source = await fs.readFile(docPath, "utf8");
  assert.match(source, /\[x\]/i);
  assert.match(source, /\[ \]/);
});

test("transitional node external-boundary owners stay contained to the known exception set", async () => {
  const sqliteOwners = await matchSourceFiles(/\bnode:sqlite\b|\bDatabaseSync\b/g);
  const publicHttpOwners = await matchSourceFiles(/\bnode:http\b|createServer\s*\(|server\.listen\s*\(/g);
  const canonicalWatcherOwners = await matchSourceFiles(/\bfsWatch\.watch\s*\(/g);

  assert.deepEqual(sqliteOwners, [
    "src/runtime-verification-persistence.js"
  ]);

  assert.deepEqual(publicHttpOwners, [
    "src/runtime-server.js"
  ]);

  assert.deepEqual(canonicalWatcherOwners, [
    "src/app-snapshot-manager.js"
  ]);
});
