import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { constants } from "node:fs";

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
  assert.equal(shellSource.includes("clientRendererHref"), false);
  assert.equal(shellSource.includes("clientRendererExport"), false);
  assert.equal(shellSource.includes("clientConfigHref"), false);
  assert.equal(runtimeSource.includes("pageModuleHref"), false);
  assert.equal(runtimeSource.includes("pageModuleExport"), false);
  assert.equal(runtimeSource.includes("bootstrapSurfacePage"), false);
  assert.equal(runtimeSource.includes("surfaceBrowserClientConfig"), false);
  assert.equal(runtimeSource.includes("renderSurfaceBrowserRuntime"), false);
});

test("runtime-surface-shell stays a blocked reset host without contaminated shell concepts", async () => {
  const runtimeSource = await readFile(path.join(process.cwd(), "src", "runtime-surface-shell.js"), "utf8");
  const forbidden = [
    "auth-screen",
    "module-card",
    "mounted-panel",
    "iframe",
    "/chart?chart=",
    "sidebar-grid",
    "viewer-sidebar-main",
    "viewer-sidebar-main-metrics",
    "viewer-sidebar-tabs",
    "profile-menu",
    "password-toggle",
    "tab-group",
    "buildMountedChartRuntime",
    "surfaceRuntimeManifest",
    "createSurfaceInteractionRuntime"
  ];

  for (const token of forbidden) {
    assert.equal(runtimeSource.includes(token), false, `runtime-surface-shell.js must not contain ${token}`);
  }
});

test("engentus no longer ships executable presenter or client authority trees", async () => {
  const [presenterFiles, clientFiles, runtimeFiles] = await Promise.all([
    listJsFiles(path.join(process.cwd(), "examples", "engentus", "app", "presenters")),
    listJsFiles(path.join(process.cwd(), "examples", "engentus", "app", "client")),
    listJsFiles(path.join(process.cwd(), "examples", "engentus", "app", "runtime"))
  ]);

  assert.deepEqual(presenterFiles, []);
  assert.deepEqual(clientFiles, []);
  assert.deepEqual(runtimeFiles, []);
});

test("engentus app README points back to DESIRE-SPA as the canonical plan", async () => {
  const readme = await readFile(path.join(process.cwd(), "examples", "engentus", "app", "README.md"), "utf8");
  assert.match(readme, /canonical/i);
  assert.match(readme, /DESIRE-SPA\.md/);
  assert.doesNotMatch(readme, /pageModuleHref/);
  assert.doesNotMatch(readme, /presenters\//);
});

test("the removed surface-browser loader seam is absent from core", async () => {
  const browserLoader = path.join(process.cwd(), "src", "runtime-surface-browser.js");
  const browserClient = path.join(process.cwd(), "src", "runtime-surface-browser-client.js");

  await assert.rejects(access(browserLoader, constants.F_OK));
  await assert.rejects(access(browserClient, constants.F_OK));
});
