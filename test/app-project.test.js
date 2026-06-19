import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyWitnessDocsWithRuntimePlugins } from "../src/dsl.js";
import { applyDesire } from "../src/desire/index.js";
import { createWorld } from "../src/kernel.js";
import {
  APP_MANIFEST_BASENAME,
  loadAppProject,
  resolveAppProjectEntry,
  resolveDesktopTarget,
  resolveMcpTarget,
  resolveServeTarget
} from "../src/app-project.js";

async function writeFile(targetPath, contents) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, contents, "utf8");
}

test("app project resolver accepts a directory or canonical app.wtoml file", async () => {
  const byDirectory = await resolveAppProjectEntry(path.join(process.cwd(), "examples", "demo-todo-app"));
  const byFile = await resolveAppProjectEntry(path.join(process.cwd(), "examples", "demo-todo-app", APP_MANIFEST_BASENAME));

  assert.equal(byDirectory.appRoot, byFile.appRoot);
  assert.equal(byDirectory.manifestPath, byFile.manifestPath);
  assert.equal(path.basename(byDirectory.manifestPath), APP_MANIFEST_BASENAME);
});

test("app project resolver rejects non-canonical manifest filenames", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-app-project-"));
  const nonCanonical = path.join(tempRoot, "main.wtoml");
  await writeFile(nonCanonical, "[app]\nid = \"bad\"\n");
  try {
    await assert.rejects(
      resolveAppProjectEntry(nonCanonical),
      error => error?.code === "APP_ENTRY_NOT_CANONICAL"
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("app project diagnostics report manifest roots, shell targets, and grouped imports", async () => {
  const appProject = await loadAppProject(path.join(process.cwd(), "examples", "engentus"));

  assert.equal(appProject.appRoot, path.join(process.cwd(), "examples", "engentus"));
  assert.equal(appProject.manifestPath, path.join(process.cwd(), "examples", "engentus", "app.wtoml"));
  assert.equal(appProject.targets.server.some(row => row.id === "engentus_server" && row.default === true), true);
  assert.equal(appProject.targets.desktop.some(row => row.id === "engentus_desktop" && row.default === true), true);
  assert.equal(appProject.diagnostics.imports["shared-lib"].some(file => file.endsWith(path.join("examples", "_lib", "common.wtoml"))), true);
  assert.equal(appProject.diagnostics.imports["app-owned"].some(file => file.endsWith(path.join("examples", "engentus", "app", "shell.rvm"))), true);
  assert.deepEqual(appProject.diagnostics.imports["plugin/runtime"], []);
});

test("app project loads authored runtime plugin registries for later DESIRE application", async () => {
  const appProject = await loadAppProject(path.join(process.cwd(), "examples", "engentus"), {
    runtimeProfile: "full"
  });
  const world = createWorld();

  await applyWitnessDocsWithRuntimePlugins(world, appProject.witnessDocs, {
    runtimeProfile: "full"
  });
  for (const desire of appProject.authoredDesireDocs) {
    applyDesire(world, desire, {
      runtimeDeclarationRegistry: appProject.runtimePluginRegistries?.runtimeDeclarationRegistry ?? null
    });
  }

  assert.equal(appProject.runtimePluginRegistries?.rvmFormRegistry?.knows("sql_table"), true);
  assert.equal(appProject.runtimePluginRegistries?.runtimeDeclarationRegistry?.has("sql_table"), true);
});

test("shell target selection auto-selects single targets and honors explicit overrides", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-app-targets-"));
  const appRoot = path.join(tempRoot, "apps", "sample");
  await writeFile(path.join(appRoot, "app.wtoml"), `
[[serverRunner]]
id = "runner_a"
backendHost = "backendHost"
frontendHost = "frontendHost"
default = true

[[serverRunner]]
id = "runner_b"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[mcpServer]]
actor = "system"
id = "mcp_a"
serverRunner = "runner_a"
default = true

[[desktopTarget]]
id = "desktop_a"
serverRunner = "runner_a"
default = true

[[desktopTarget]]
id = "desktop_b"
serverRunner = "runner_b"
`);
  try {
    const appProject = await loadAppProject(appRoot);
    assert.equal(resolveServeTarget(appProject).serverRunner.id, "runner_a");
    assert.equal(resolveServeTarget(appProject, { serverRunnerId: "runner_b" }).serverRunner.id, "runner_b");
    assert.equal(resolveMcpTarget(appProject).mcpServer.id, "mcp_a");
    assert.equal(resolveDesktopTarget(appProject).desktopTarget.id, "desktop_a");
    assert.equal(resolveDesktopTarget(appProject, { desktopTargetId: "desktop_b" }).serverRunner.id, "runner_b");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("shell target selection rejects ambiguous defaults", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-app-targets-ambiguous-"));
  const appRoot = path.join(tempRoot, "apps", "sample");
  await writeFile(path.join(appRoot, "app.wtoml"), `
[[serverRunner]]
id = "runner_a"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[serverRunner]]
id = "runner_b"
backendHost = "backendHost"
frontendHost = "frontendHost"
`);
  try {
    const appProject = await loadAppProject(appRoot);
    assert.throws(() => resolveServeTarget(appProject), /multiple server runners defined but none marked default/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("app project boundaries reject imports outside app root and _lib, including pipeline assets", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-app-boundaries-"));
  const appRoot = path.join(tempRoot, "examples", "sample");
  const invalidRoot = path.join(tempRoot, "examples_rvm", "engentus");
  await writeFile(path.join(invalidRoot, "PIPELINE.rvm"), "# pipeline specimen\n");
  await writeFile(path.join(appRoot, "app.wtoml"), `
[app]
id = "bad_app"
imports = ["../../examples_rvm/engentus/PIPELINE.rvm"]
`);
  try {
    await assert.rejects(
      loadAppProject(appRoot),
      error => error?.code === "APP_IMPORT_OUT_OF_BOUNDS"
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("examples root contains only the standardized app directories and shared library", async () => {
  const entries = (await fs.readdir(path.join(process.cwd(), "examples"))).sort();
  assert.deepEqual(entries, ["_lib", "demo-todo-app", "eden", "engentus", "master"]);
});
