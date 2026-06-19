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
  assert.deepEqual(handlerCatalog.dispatchHandlers, []);
  assert.deepEqual(routes, []);
  assert.equal(providers.some(provider => provider.kind === "guidanceDefinitions" && provider.definitions?.some(definition => definition.id === TODO_TUTORIAL_ID)), true);
  assert.equal(providers.some(provider => provider.kind === "runtimeBuiltinSeeds"), false);
  assert.deepEqual(createHandlers({
    sendJson() {},
    readJson: async () => ({}),
    tutorialProgressFor: () => null,
    setTutorialProgress() {}
  }), {});
});

test("tutorial plugin keeps authored guidance content while delegating generic client runtime to core", async () => {
  const tutorialSource = await readFile(new URL("./tutorials.js", import.meta.url), "utf8");
  const appClientSource = await readFile(new URL("./tutorial-app-client.js", import.meta.url), "utf8");
  const runtimeUiSource = await readFile(new URL("./tutorial-runtime-ui.js", import.meta.url), "utf8");
  const bootstrapUiSource = await readFile(new URL("./tutorial-bootstrap-ui.js", import.meta.url), "utf8");
  const progressStateSource = await readFile(new URL("./tutorial-progress-state.js", import.meta.url), "utf8");
  const coreClientSource = await readFile(new URL("../../src/runtime-guidance-client.js", import.meta.url), "utf8");
  const coreProgressStateSource = await readFile(new URL("../../src/runtime-guidance-progress-state.js", import.meta.url), "utf8");
  const starterBlueprintSource = await readFile(new URL("../starter/starter-blueprints.js", import.meta.url), "utf8");
  const tutorialSeedSource = await readFile(new URL("./todo-tutorial-seed.js", import.meta.url), "utf8");
  const tutorial = tutorialDefinition(TODO_TUTORIAL_ID);

  assert.equal(tutorial?.id, TODO_TUTORIAL_ID);
  assert.equal(normalizeTutorialProgress(tutorial, { stepId: tutorial.steps[0].id })?.stepId, tutorial.steps[0].id);
  assert.equal(tutorialSource.includes("export function tutorialDefinition"), true);
  assert.equal(tutorialSource.includes('../starter/starter-blueprints.js'), true);
  assert.equal(tutorialSource.includes('./todo-tutorial-seed.js'), false);
  assert.equal(starterBlueprintSource.includes("native_todo_surface_root"), true);
  assert.equal(tutorialSeedSource.includes("TODO_TUTORIAL_SEED_BASE64"), true);
  assert.equal(tutorialSeedSource.includes("Historical legacy tutorial/demo substrate"), true);
  await assert.rejects(readFile(new URL("./runtime-builtins.js", import.meta.url), "utf8"));

  assert.equal(appClientSource.includes('../../src/runtime-guidance-client.js'), true);
  assert.equal(appClientSource.includes('./tutorials.js'), true);
  assert.equal(appClientSource.includes("renderCoreGuidanceClient"), true);
  assert.equal(progressStateSource.includes('../../src/runtime-guidance-progress-state.js'), true);

  assert.equal(coreClientSource.includes("../plugins/"), false);
  assert.equal(coreClientSource.includes("export function renderGuidanceClient"), true);
  assert.equal(coreClientSource.includes("startTutorialClientRuntimeApp"), true);
  assert.equal(coreProgressStateSource.includes("export function createTutorialProgressState"), true);
  assert.equal(coreProgressStateSource.includes("export function tutorialStepScope"), true);

  assert.equal(runtimeUiSource.includes('from "../../src/runtime-guidance.js"'), true);
  assert.equal(runtimeUiSource.includes("export function appGuidanceConfigForSession"), true);
  assert.equal(runtimeUiSource.includes("export const appTutorialConfigForSession = appGuidanceConfigForSession;"), true);
  assert.equal(bootstrapUiSource.includes('../../src/runtime-guidance-bootstrap-ui.js'), true);
  assert.equal(bootstrapUiSource.includes("renderBootstrapTutorialCard"), true);
  await assert.rejects(readFile(new URL("../../src/tutorials.js", import.meta.url), "utf8"));
  await assert.rejects(readFile(new URL("../../src/tutorial-runtime-ui.js", import.meta.url), "utf8"));
});
