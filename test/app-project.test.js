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
  loadAppProjectWithStableFallback,
  resolveAppProjectEntry,
  resolveDesktopTarget,
  resolveMcpTarget,
  resolveServeTarget
} from "../src/app-project.js";
import { persistStableAppSourceCache } from "../src/runtime-stable-source-cache.js";

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

test("app project collects compute modules and surfaces diagnostics for their host bindings", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-app-compute-modules-"));
  const appRoot = path.join(tempRoot, "app");
  await writeFile(path.join(appRoot, "app.wtoml"), `
[app]
id = "compute_module_app"

[[computeModule]]
actor = "system"
id = "engentus.health.classify"
source = "./app/modules/health-classify/assembly/index.ts"
hostOperation = "engentus.health.classify"
allowedBindings = ["host.log", "host.metric"]
`);
  await writeFile(path.join(appRoot, "app", "modules", "health-classify", "assembly", "index.ts"), `
export function invoke(): i32 {
  return 1;
}
`);
  try {
    const appProject = await loadAppProject(appRoot);
    assert.equal(appProject.computeModules.length, 1);
    assert.deepEqual(appProject.computeModules[0], {
      id: "engentus.health.classify",
      source: "./app/modules/health-classify/assembly/index.ts",
      resolvedSourcePath: path.join(appRoot, "app", "modules", "health-classify", "assembly", "index.ts"),
      language: "assemblyscript",
      abi: "world.hostOperation.v1",
      export: "invoke",
      hostOperation: "engentus.health.classify",
      maxMemoryPages: null,
      timeoutMs: null,
      allowedBindings: ["host.log", "host.metric"],
      context: null,
      file: path.join(appRoot, "app.wtoml"),
      line: 5,
      values: {
        actor: "system",
        id: "engentus.health.classify",
        source: "./app/modules/health-classify/assembly/index.ts",
        hostOperation: "engentus.health.classify",
        allowedBindings: ["host.log", "host.metric"]
      }
    });
    assert.deepEqual(appProject.diagnostics.computeModules, [{
      id: "engentus.health.classify",
      source: "./app/modules/health-classify/assembly/index.ts",
      hostOperation: "engentus.health.classify",
      language: "assemblyscript",
      abi: "world.hostOperation.v1",
      export: "invoke",
      maxMemoryPages: null,
      timeoutMs: null,
      allowedBindings: ["host.log", "host.metric"],
      file: path.join(appRoot, "app.wtoml"),
      line: 5
    }]);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("app project rejects duplicate compute module host operations", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-app-compute-dup-"));
  const appRoot = path.join(tempRoot, "app");
  await writeFile(path.join(appRoot, "app.wtoml"), `
[app]
id = "compute_module_app"

[[computeModule]]
actor = "system"
id = "engentus.health.classify"
source = "./app/modules/health-classify/assembly/index.ts"
hostOperation = "engentus.health.classify"

[[computeModule]]
actor = "system"
id = "engentus.health.classify.v2"
source = "./app/modules/health-classify-v2/assembly/index.ts"
hostOperation = "engentus.health.classify"
`);
  try {
    await assert.rejects(
      loadAppProject(appRoot),
      error => error?.code === "APP_COMPUTE_MODULE_DUPLICATE_HOST_OPERATION"
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
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

test("app project builds operator workbench definitions from authored operator screen RVM", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-operator-screen-"));
  const appRoot = path.join(tempRoot, "app");
  await writeFile(path.join(appRoot, "app.wtoml"), `
[app]
id = "operator_screen_app"
imports = ["./shell.rvm"]
`);
  await writeFile(path.join(appRoot, "shell.rvm"), `
operator_dataset trace_dataset {
  title "Trace Dataset"
  provider provenance
  row_filter_action open-source
  primary_action none
}

operator_screen trace {
  title "Trace"
  subtitle "Authored trace screen"
  pane right
  shape table-detail
  shortcut F5
  left_screen trace_left
  default_section trace_rows
  section trace_summary
  section trace_rows
}

operator_screen trace_left {
  title "Trace Left"
  pane left
  shape table
  data_source references
}

operator_screen_section trace_summary {
  screen trace
  title "Summary"
  kind detail
  data_source inspect
  collapsible false
  priority 1
}

operator_screen_section trace_rows {
  screen trace
  title "Rows"
  kind table
  dataset trace_dataset
  collapsed true
  priority 2
}

operator_setup shell {
  screen trace
  screen references
  shortcut F5 trace
  default_screen trace
  default_left_screen trace_left
}
`);
  try {
    const appProject = await loadAppProject(appRoot, {
      runtimePluginIds: ["plugin.operator-workbench"]
    });
    assert.equal(appProject.operatorWorkbench.datasets.some(dataset => dataset.id === "trace_dataset" && dataset.provider === "provenance"), true);
    const traceScreen = appProject.operatorWorkbench.screens.find(screen => screen.id === "trace");
    assert.equal(Boolean(traceScreen), true);
    assert.equal(traceScreen.datasetId, null);
    assert.equal(traceScreen.defaultSectionId, "trace_rows");
    assert.deepEqual(traceScreen.sectionIds, ["trace_summary", "trace_rows"]);
    assert.deepEqual(traceScreen.sections.map(section => section.id), ["trace_summary", "trace_rows"]);
    assert.deepEqual(traceScreen.sections.map(section => section.kind), ["detail", "table"]);
    assert.equal(traceScreen.leftScreenId, "trace_left");
    assert.equal(traceScreen.sections[0].collapsible, false);
    assert.equal(traceScreen.sections[1].collapsed, true);
    assert.equal(appProject.operatorWorkbench.leftScreens.some(screen => screen.id === "trace_left" && screen.shape === "table"), true);
    assert.equal(appProject.operatorWorkbench.defaultScreen, "trace");
    assert.equal(appProject.operatorWorkbench.defaultLeftScreen, "trace_left");
    assert.equal(appProject.operatorWorkbench.shortcuts.get("F5"), "trace");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("app project rejects invalid authored left-pane references in operator workbench RVM", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-operator-left-screen-invalid-"));
  const appRoot = path.join(tempRoot, "app");
  await writeFile(path.join(appRoot, "app.wtoml"), `
[app]
id = "operator_screen_invalid_app"
imports = ["./shell.rvm"]
`);
  await writeFile(path.join(appRoot, "shell.rvm"), `
operator_screen trace {
  title "Trace"
  pane right
  shape list-detail
  data_source references
  left_screen missing_left
}

operator_setup shell {
  screen trace
  default_screen trace
}
`);
  try {
    await assert.rejects(
      loadAppProject(appRoot, {
        runtimePluginIds: ["plugin.operator-workbench"]
      }),
      /left_screen not found: missing_left/
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
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

test("app project loader can fall back to the persisted stable source cache", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-app-stable-fallback-"));
  const appRoot = path.join(tempRoot, "app");
  const manifestPath = path.join(appRoot, "app.wtoml");
  await writeFile(manifestPath, "[app\nid = \"broken\"\n");

  await persistStableAppSourceCache(manifestPath, {
    appProject: { appRoot },
    compiledUnits: new Map([[
      manifestPath,
      {
        filePath: manifestPath,
        sourceId: "app.wtoml",
        sourceLanguage: "wtoml",
        contentHash: "stable-hash",
        content: "[app]\nid = \"stable_app\"\n"
      }
    ]])
  }, {
    cwd: tempRoot
  });

  try {
    const loaded = await loadAppProjectWithStableFallback(appRoot, { cwd: tempRoot });
    assert.equal(loaded.fallbackUsed, true);
    assert.equal(loaded.source, "stable-cache");
    assert.equal(loaded.appProject.appId, "stable_app");
    assert.equal(loaded.appProject.stableSourceCacheUsed, true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("app project startup loading can resolve and read canonical sources through witness-core capabilities", async () => {
  const tempRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-witness-app-project-"));
  const appRoot = path.join(tempRoot, "examples", "sample");
  const manifestPath = path.join(appRoot, "app.wtoml");
  const contentPath = path.join(appRoot, "content.wtoml");
  await writeFile(manifestPath, `[app]\nid = "bridge_loader"\nimports = ["./content.wtoml"]\n`);
  await writeFile(contentPath, `[[heading]]\nactor = "system"\nid = "hero"\ntext = "Bridge Loader"\nlevel = 1\n`);

  const relativeEntryPath = path.relative(process.cwd(), appRoot);
  const bridgeCalls = [];
  const sourceById = new Map([
    [normalize(path.relative(process.cwd(), manifestPath)), `[app]\nid = "bridge_loader"\nimports = ["./content.wtoml"]\n`],
    [normalize(path.relative(process.cwd(), contentPath)), `[[heading]]\nactor = "system"\nid = "hero"\ntext = "Bridge Loader"\nlevel = 1\n`]
  ]);
  const bridge = {
    async readSource({ path: sourceId }) {
      bridgeCalls.push({ kind: "read", path: sourceId });
      return {
        path: sourceId,
        content: sourceById.get(sourceId) ?? ""
      };
    },
    async statSource({ path: sourceId }) {
      bridgeCalls.push({ kind: "stat", path: sourceId });
      const content = sourceById.get(sourceId);
      return {
        path: sourceId,
        exists: sourceId === normalize(path.relative(process.cwd(), appRoot))
          || typeof content === "string",
        isFile: typeof content === "string",
        isDirectory: sourceId === normalize(path.relative(process.cwd(), appRoot)),
        size: typeof content === "string" ? Buffer.byteLength(content, "utf8") : 0,
        modifiedAt: "1700000000000"
      };
    }
  };
  const guardedFs = {
    ...fs,
    async readFile(target, encoding) {
      const resolved = path.resolve(String(target || ""));
      if (resolved.startsWith(appRoot)) {
        throw new Error(`startup canonical read escaped witness-core bridge: ${resolved}`);
      }
      return await fs.readFile(target, encoding);
    },
    async stat(target) {
      const resolved = path.resolve(String(target || ""));
      if (resolved.startsWith(appRoot)) {
        throw new Error(`startup canonical stat escaped witness-core bridge: ${resolved}`);
      }
      return await fs.stat(target);
    }
  };

  try {
    const loaded = await loadAppProjectWithStableFallback(relativeEntryPath, {
      cwd: process.cwd(),
      generationBridge: bridge,
      fsModule: guardedFs
    });
    assert.equal(loaded.fallbackUsed, false);
    assert.equal(loaded.appProject.appId, "bridge_loader");
    assert.equal(bridgeCalls.some(call => call.kind === "stat" && call.path === normalize(path.relative(process.cwd(), appRoot))), true);
    assert.equal(bridgeCalls.some(call => call.kind === "stat" && call.path === normalize(path.relative(process.cwd(), manifestPath))), true);
    assert.equal(bridgeCalls.some(call => call.kind === "read" && call.path === normalize(path.relative(process.cwd(), manifestPath))), true);
    assert.equal(bridgeCalls.some(call => call.kind === "read" && call.path === normalize(path.relative(process.cwd(), contentPath))), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("app project startup fails closed when a core-connected canonical path is outside witness-core scope", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-app-project-outside-"));
  const appRoot = path.join(tempRoot, "sample");
  const manifestPath = path.join(appRoot, "app.wtoml");
  await writeFile(manifestPath, `[app]\nid = "outside_scope"\n`);

  const guardedFs = {
    ...fs,
    async readFile(target, encoding) {
      throw new Error(`startup canonical read escaped witness-core boundary: ${target} ${encoding ?? ""}`);
    },
    async stat(target) {
      throw new Error(`startup canonical stat escaped witness-core boundary: ${target}`);
    }
  };

  try {
    await assert.rejects(
      loadAppProject(appRoot, {
        cwd: process.cwd(),
        generationBridge: {
          async readSource() {
            throw new Error("bridge should not be called for out-of-scope startup path");
          },
          async statSource() {
            throw new Error("bridge should not be called for out-of-scope startup path");
          }
        },
        fsModule: guardedFs,
        requireGenerationBridgeForCanonicalReads: true
      }),
      error => error?.code === "WITNESS_CORE_REQUIRED" && error?.status === 503
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("app project startup fails closed when witness-core authority is required but the bridge is unavailable", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-app-project-core-required-"));
  const appRoot = path.join(tempRoot, "app");
  await writeFile(path.join(appRoot, "app.wtoml"), `[app]\nid = "missing_bridge"\n`);
  try {
    await assert.rejects(
      loadAppProject(appRoot, {
        fsModule: {
          async readFile(target, encoding) {
            throw new Error(`canonical startup read escaped missing witness-core bridge: ${target} ${encoding ?? ""}`);
          },
          async stat(target) {
            throw new Error(`canonical startup stat escaped missing witness-core bridge: ${target}`);
          }
        },
        requireGenerationBridgeForCanonicalReads: true
      }),
      error => error?.code === "WITNESS_CORE_REQUIRED" && error?.status === 503
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

function normalize(value) {
  return String(value || "").replaceAll("\\", "/");
}
