import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bundleId, createHandlers, handlerCatalog, providers, routes } from "./runtime.js";
import { TODO_TUTORIAL_ID, normalizeTutorialProgress, tutorialDefinition } from "./tutorials.js";

test("tutorial plugin owns tutorial bundle routes and handlers", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "plugin.tutorial");
  assert.deepEqual(manifest.activatesBundles, ["bundle-tutorial"]);
  assert.equal(manifest.runtime.entry, "./runtime.js");
  assert.equal(bundleId, "bundle-tutorial");
  assert.deepEqual(handlerCatalog.dispatchHandlers, [
    "tutorial.progress.read",
    "tutorial.progress.write",
    "tutorial.progress.delete"
  ]);
  assert.equal(routes.some(route => route.handler === "tutorial.progress.read"), true);
  assert.equal(providers.some(provider => provider.kind === "runtimeBuiltinSeeds" && provider.valueTypes?.some(valueType => valueType.id === "widget.tutorialTarget")), true);
  assert.equal(typeof createHandlers({
    sendJson() {},
    readJson: async () => ({}),
    tutorialProgressFor: () => null,
    setTutorialProgress() {}
  })["tutorial.progress.read"], "function");
});

test("tutorial content and client helpers are plugin-owned without src compatibility facades", async () => {
  const tutorialSource = await readFile(new URL("./tutorials.js", import.meta.url), "utf8");
  const appClientSource = await readFile(new URL("./tutorial-app-client.js", import.meta.url), "utf8");
  const runtimeUiSource = await readFile(new URL("./tutorial-runtime-ui.js", import.meta.url), "utf8");
  const tutorial = tutorialDefinition(TODO_TUTORIAL_ID);

  assert.equal(tutorial?.id, TODO_TUTORIAL_ID);
  assert.equal(normalizeTutorialProgress(tutorial, { stepId: tutorial.steps[0].id })?.stepId, tutorial.steps[0].id);
  assert.equal(tutorialSource.includes("export function tutorialDefinition"), true);
  assert.equal(appClientSource.includes("export function renderTutorialClient"), true);
  assert.equal(runtimeUiSource.includes("export function appTutorialConfigForSession"), true);
  await assert.rejects(readFile(new URL("../../src/tutorials.js", import.meta.url), "utf8"));
  await assert.rejects(readFile(new URL("../../src/tutorial-runtime-ui.js", import.meta.url), "utf8"));
});
