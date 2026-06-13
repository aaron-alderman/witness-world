import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { activateWidgetVersion, defineWidgetVersion, defineWidgetVersionTransition } from "../../src/widgets.js";
import { worldGraphProjection, astNodesProjection } from "./world-graph.js";
import { processRunProjection, processViewProjection, renderProcessPage } from "./process-view.js";
import { renderWidgetPage } from "./widget-page.js";
import { requestWidgetVersionActivation, rollbackWidgetVersion } from "./widget-versions.js";

test("inspect plugin owns inspect bundle catalog, routes, and surfaces", async () => {
  const source = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  assert.equal(source.includes('bundleId = "bundle-inspect"'), true);
  assert.equal(source.includes('"worldGraph.read"'), true);
  assert.equal(source.includes('id: "surface:world"'), true);
});

test("inspect plugin owns world graph projections without a src compatibility facade", async () => {
  const pluginWorldGraph = await readFile(new URL("./world-graph.js", import.meta.url), "utf8");
  const runtimeSource = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  const graph = worldGraphProjection([]);

  assert.equal(typeof worldGraphProjection, "function");
  assert.equal(typeof astNodesProjection, "function");
  assert.deepEqual(graph.nodes.some(node => node.id === "genesis"), true);
  assert.equal(pluginWorldGraph.includes("export function worldGraphProjection"), true);
  assert.equal(pluginWorldGraph.includes("export function astNodesProjection"), true);
  assert.equal(runtimeSource.includes('from "./world-graph.js"'), true);
  await assert.rejects(readFile(new URL("../../src/world-graph.js", import.meta.url), "utf8"));
});

test("inspect plugin owns process view projections and page rendering without a src compatibility facade", async () => {
  const pluginProcessView = await readFile(new URL("./process-view.js", import.meta.url), "utf8");
  const runtimeSource = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  const model = processViewProjection({ witnesses: [], observations: [] }, {});

  assert.equal(typeof processViewProjection, "function");
  assert.equal(typeof processRunProjection, "function");
  assert.equal(typeof renderProcessPage, "function");
  assert.deepEqual(model.catalog, []);
  assert.match(renderProcessPage(model), /Process View/);
  assert.equal(pluginProcessView.includes("export function processViewProjection"), true);
  assert.equal(pluginProcessView.includes("export function processRunProjection"), true);
  assert.equal(pluginProcessView.includes("export function renderProcessPage"), true);
  assert.equal(runtimeSource.includes('from "./process-view.js"'), true);
  await assert.rejects(readFile(new URL("../../src/process-view.js", import.meta.url), "utf8"));
});

test("inspect plugin owns widget page rendering while src widgets stays model-focused", async () => {
  const pluginWidgetPage = await readFile(new URL("./widget-page.js", import.meta.url), "utf8");
  const runtimeSource = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  const srcWidgets = await readFile(new URL("../../src/widgets.js", import.meta.url), "utf8");

  assert.equal(typeof renderWidgetPage, "function");
  assert.equal(pluginWidgetPage.includes("export function renderWidgetPage"), true);
  assert.equal(pluginWidgetPage.includes("renderTutorialClient"), true);
  assert.equal(pluginWidgetPage.includes("resolveEdenPageTheme"), true);
  assert.equal(runtimeSource.includes('from "./widget-page.js"'), true);
  assert.equal(srcWidgets.includes("function renderDocument"), false);
  assert.equal(srcWidgets.includes("renderTutorialClient"), false);
  assert.equal(srcWidgets.includes("resolveEdenPageTheme"), false);
  assert.equal(srcWidgets.includes("../plugins/inspect/widget-page.js"), false);
});

test("inspect plugin owns widget-version request and rollback workflows", async () => {
  const pluginWidgetVersions = await readFile(new URL("./widget-versions.js", import.meta.url), "utf8");
  const runtimeSource = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  const proposalsSource = await readFile(new URL("../proposals/proposal-executor.js", import.meta.url), "utf8");
  const srcWidgets = await readFile(new URL("../../src/widgets.js", import.meta.url), "utf8");
  const world = createWorld();

  defineWidgetVersion(world, { actor: "adam", soul: "banner", version: "banner_v1", kind: "Banner", props: { text: "One" } });
  defineWidgetVersion(world, { actor: "adam", soul: "banner", version: "banner_v2", kind: "Banner", props: { text: "Two" } });
  defineWidgetVersionTransition(world, { actor: "adam", soul: "banner", from: "banner_v1", to: "banner_v2", strategy: "migrate" });
  activateWidgetVersion(world, { actor: "adam", soul: "banner", version: "banner_v1" });

  const activated = requestWidgetVersionActivation(world, { actor: "adam", soul: "banner", version: "banner_v2" });
  const rolledBack = rollbackWidgetVersion(world, { actor: "adam", soul: "banner" });

  assert.equal(typeof requestWidgetVersionActivation, "function");
  assert.equal(typeof rollbackWidgetVersion, "function");
  assert.equal(activated.status, "migrated");
  assert.equal(rolledBack.status, "rolledBack");
  assert.equal(pluginWidgetVersions.includes("export function requestWidgetVersionActivation"), true);
  assert.equal(pluginWidgetVersions.includes("export function rollbackWidgetVersion"), true);
  assert.equal(runtimeSource.includes('from "./widget-versions.js"'), true);
  assert.equal(proposalsSource.includes('from "../inspect/widget-versions.js"'), true);
  assert.equal(srcWidgets.includes("export function requestWidgetVersionActivation"), false);
  assert.equal(srcWidgets.includes("export function rollbackWidgetVersion"), false);
  assert.equal(srcWidgets.includes("../plugins/inspect/widget-versions.js"), false);
});
