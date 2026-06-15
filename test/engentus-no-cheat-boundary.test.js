import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function listJsFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".js")) files.push(fullPath);
  }
  return files;
}

test("engentus shell and core runtime do not expose the presenter bootstrap seam", async () => {
  const [shellSource, runtimeSource] = await Promise.all([
    readFile(path.join(process.cwd(), "examples", "engentus", "app", "shell.rvm"), "utf8"),
    readFile(path.join(process.cwd(), "src", "runtime-surface-shell.js"), "utf8")
  ]);

  assert.equal(shellSource.includes("pageModuleHref"), false);
  assert.equal(shellSource.includes("pageModuleExport"), false);
  assert.equal(runtimeSource.includes("pageModuleHref"), false);
  assert.equal(runtimeSource.includes("pageModuleExport"), false);
  assert.equal(runtimeSource.includes("bootstrapSurfacePage"), false);
});

test("engentus no longer ships executable presenter or client authority trees", async () => {
  const [presenterFiles, clientFiles] = await Promise.all([
    listJsFiles(path.join(process.cwd(), "examples", "engentus", "app", "presenters")),
    listJsFiles(path.join(process.cwd(), "examples", "engentus", "app", "client"))
  ]);

  assert.deepEqual(presenterFiles, []);
  assert.deepEqual(clientFiles, []);
});

test("engentus app README points back to DESIRE-SPA as the canonical plan", async () => {
  const readme = await readFile(path.join(process.cwd(), "examples", "engentus", "app", "README.md"), "utf8");
  assert.match(readme, /canonical/i);
  assert.match(readme, /DESIRE-SPA\.md/);
  assert.doesNotMatch(readme, /pageModuleHref/);
  assert.doesNotMatch(readme, /presenters\//);
});
