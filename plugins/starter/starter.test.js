import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { todoStarterBlueprint } from "./starter-blueprints.js";
import { applyTodoStarter } from "./starter-apply.js";
import { createWorld } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { declareBackendHost, declareFrontendHost } from "../../src/runtime-host-utils.js";
import { requestBootstrapServerRunnerDefine } from "../server-runner-authoring/server-runner-processes.js";
import { bundleId, handlerCatalog, providers } from "./runtime.js";

test("starter plugin contributes starter blueprint content only", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "plugin.starter");
  assert.deepEqual(manifest.activatesBundles, ["bundle-starter"]);
  assert.equal(bundleId, "bundle-starter");
  assert.deepEqual(handlerCatalog.dispatchHandlers, ["starter.todo.apply"]);
  assert.equal(providers.some(provider => provider.kind === "starterBlueprints"), true);
});

test("starter blueprint helper returns the authored todo starter as a fresh clone", () => {
  const first = todoStarterBlueprint();
  first.runner.id = "mutated_runner";
  first.widgets[0].id = "mutated_widget";
  first.surfaces[0].id = "mutated_surface";

  const second = todoStarterBlueprint();
  const serialized = JSON.stringify(second);
  assert.equal(second.program.context, "frontend");
  assert.equal(second.operatingPrograms.every(row => row.context === "frontend"), true);
  assert.equal(second.widgets.every(row => row.context === "frontend"), true);
  assert.equal(second.operatingWidgets.every(row => row.context === "frontend"), true);
  assert.equal(second.runner.id, "demo_server");
  assert.equal(second.widgets[0].id, "todo_app_widget");
  assert.equal(second.surfaces.at(-1).id, "native_todo_surface_root");
  assert.equal(second.requestPlan.some(step => step.url === "/api/frontend-programs"), false);
  assert.equal(second.requestPlan.some(step => step.url === "/api/frontend-steps"), false);
  assert.equal(second.requestPlan.some(step => step.url === "/api/surfaces"), true);
  assert.equal(second.requestPlan.some(step => step.url === "/api/context-bindings"), true);
  assert.equal(second.routes.find(row => row.id === "home_page_route")?.handler, "page.surface");
  assert.equal(second.routes.find(row => row.id === "home_page_route")?.rootSurfaceRef, "todoAppView");
  assert.equal(serialized.includes('"guidanceTarget"'), true);
  assert.equal(serialized.includes('"tutorialTarget"'), false);
  assert.equal(serialized.includes('"surface-card surface-stack session-panel"'), true);
  assert.equal(serialized.includes('"surface-card surface-stack private-notes"'), true);
  assert.equal(serialized.includes('"surface-card surface-stack surface-mono widget-editor"'), true);
  assert.equal(serialized.includes('"surface-item-list private-note-list"'), true);
  assert.equal(serialized.includes('"surface-item private-note surface-mono"'), true);
  assert.equal(serialized.includes('"surface-empty surface-empty-state surface-mono"'), true);
  assert.equal(serialized.includes('"surface-status"'), true);
  assert.equal(serialized.includes('"native_todo_surface_root"'), true);
});

test("starter apply authors the maintained starter directly onto page.surface", () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "system", id: "backendHost" });
  declareFrontendHost(world, { actor: "system", id: "frontendHost" });
  const blueprint = todoStarterBlueprint();
  delete blueprint.runner.handlerSet;
  blueprint.runtimePluginInstalls = [];

  const result = applyTodoStarter(world, {
    actor: "aaron",
    backendHost: "backendHost",
    blueprint
  });

  assert.equal(result.ok, true);
  const route = world.project(moduleProjectors.routes).find(row => row.id === "home_page_route");
  assert.equal(route?.handler, "page.surface");
  assert.equal(route?.params?.rootSurface, "native_todo_surface_root");
  assert.equal(world.allWitnesses().some(witness => witness.process === "desire.defineSurface" && witness.body?.id === "native_todo_surface_root"), true);
  assert.equal(world.allWitnesses().some(witness => witness.process === "desire.defineProcess" && witness.body?.id === "nativeTodoProcess"), true);
  assert.equal(world.allWitnesses().some(witness => witness.process === "frontend.upliftLegacy"), false);
});

test("starter apply tolerates a runner that was already authored by the guided bootstrap flow", () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "system", id: "backendHost" });
  declareFrontendHost(world, { actor: "system", id: "frontendHost" });
  const blueprint = todoStarterBlueprint();
  delete blueprint.runner.handlerSet;
  blueprint.runtimePluginInstalls = [];

  const runnerResult = requestBootstrapServerRunnerDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: blueprint.runner
  });
  assert.equal(runnerResult.ok, true);

  const result = applyTodoStarter(world, {
    actor: "aaron",
    backendHost: "backendHost",
    blueprint
  });

  assert.equal(result.ok, true);
  assert.equal(world.project(moduleProjectors.serverRunners).filter(row => row.id === "demo_server").length, 1);
  const route = world.project(moduleProjectors.routes).find(row => row.id === "home_page_route");
  assert.equal(route?.handler, "page.surface");
  assert.equal(route?.params?.rootSurface, "native_todo_surface_root");
});

test("starter apply uses runtime plugin catalog support and drops unsupported handler sets", () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "system", id: "backendHost" });
  declareFrontendHost(world, { actor: "system", id: "frontendHost" });
  const blueprint = todoStarterBlueprint();
  const pluginCatalog = {
    packages: blueprint.runtimePluginInstalls.map(row => ({
      id: row.plugin,
      validation: { ok: true, errors: [] },
      execution: { executable: true },
      compatibility: { compatible: true, reasons: [] },
      manifest: { dependsOnPlugins: [] },
      resolvedRuntimeContributions: { handlerSets: [], routes: [], surfaces: [], capabilities: [] }
    }))
  };

  const result = applyTodoStarter(world, {
    actor: "aaron",
    backendHost: "backendHost",
    blueprint,
    allowedHandlerSets: [],
    pluginCatalog
  });

  assert.equal(result.ok, true);
  const runner = world.project(moduleProjectors.serverRunners).find(row => row.id === "demo_server");
  assert.equal(runner?.handlerSet, null);
  assert.equal(world.project(moduleProjectors.runtimePluginInstalls).filter(row => row.serverRunner === "demo_server").length, 4);
});
