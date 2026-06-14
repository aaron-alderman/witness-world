import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { todoStarterBlueprint } from "./starter-blueprints.js";
import { bundleId, handlerCatalog, providers } from "./runtime.js";

test("starter plugin contributes starter blueprint content only", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "plugin.starter");
  assert.deepEqual(manifest.activatesBundles, ["bundle-starter"]);
  assert.equal(bundleId, "bundle-starter");
  assert.deepEqual(handlerCatalog.dispatchHandlers, []);
  assert.equal(providers.some(provider => provider.kind === "starterBlueprints"), true);
});

test("starter blueprint helper returns the authored todo starter as a fresh clone", () => {
  const first = todoStarterBlueprint();
  first.runner.id = "mutated_runner";
  first.widgets[0].id = "mutated_widget";

  const second = todoStarterBlueprint();
  const serialized = JSON.stringify(second);
  assert.equal(second.program.context, "frontend");
  assert.equal(second.operatingPrograms.every(row => row.context === "frontend"), true);
  assert.equal(second.widgets.every(row => row.context === "frontend"), true);
  assert.equal(second.operatingWidgets.every(row => row.context === "frontend"), true);
  assert.equal(second.runner.id, "demo_server");
  assert.equal(second.widgets[0].id, "todo_app_widget");
  assert.equal(serialized.includes('"guidanceTarget"'), true);
  assert.equal(serialized.includes('"tutorialTarget"'), false);
  assert.equal(serialized.includes('"surface-card surface-stack session-panel"'), true);
  assert.equal(serialized.includes('"surface-card surface-stack private-notes"'), true);
  assert.equal(serialized.includes('"surface-card surface-stack surface-mono widget-editor"'), true);
  assert.equal(serialized.includes('"surface-item-list private-note-list"'), true);
  assert.equal(serialized.includes('"surface-item private-note surface-mono"'), true);
  assert.equal(serialized.includes('"surface-empty surface-empty-state surface-mono"'), true);
  assert.equal(serialized.includes('"surface-status"'), true);
});
