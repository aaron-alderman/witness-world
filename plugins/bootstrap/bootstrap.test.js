import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bundleId, createHandlers, handlerCatalog, routes, surfaces } from "./runtime.js";
import { renderBootstrapPage } from "./bootstrap-shell.js";

test("bootstrap plugin owns bootstrap routes, surface, and handlers", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "plugin.bootstrap");
  assert.deepEqual(manifest.dependsOnPlugins, ["plugin.tutorial"]);
  assert.deepEqual(manifest.activatesBundles, ["bundle-bootstrap"]);
  assert.equal(manifest.runtime.entry, "./runtime.js");
  assert.equal(bundleId, "bundle-bootstrap");
  assert.deepEqual(handlerCatalog.dispatchHandlers, [
    "bootstrap.model.read",
    "bootstrap.state.read",
    "bootstrap.page",
    "operator.state.read",
    "operator.backup",
    "operator.export",
    "operator.restore",
    "operator.import"
  ]);
  assert.equal(routes.some(route => route.path === "/_bootstrap" && route.handler === "bootstrap.page"), true);
  assert.equal(routes.some(route => route.path === "/api/bootstrap-state" && route.handler === "bootstrap.state.read"), true);
  assert.equal(surfaces.some(surface => surface.id === "surface:bootstrap" && surface.href === "/_bootstrap"), true);

  const handlers = createHandlers({
    world: { project() { return []; }, allWitnesses() { return []; } },
    runtimeProfile: "minimal",
    runtimeBundleSummary: { bundles: [], routes: [], surfaces: [], capabilities: [] },
    readJson: async () => ({}),
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" }
    },
    sendGateFailure() {},
    supportedPageHandlers: [],
    supportedHandlerSets: [],
    supportedHandlers: [],
    supportedHandlerMetadata: {},
    supportedFrontendOps: [],
    supportedBackendOps: [],
    backendHosts: [],
    frontendHosts: [],
    send() {},
    sendJson() {},
    getRuntimePluginCatalog: async () => ({ packages: [] }),
    buildPluginCapabilitySourceIndex: ({ capabilityCatalog }) => ({
      capabilityCatalog,
      capabilityPackageSources: []
    }),
    getRuntimeOperatorState: async () => null
  });
  assert.equal(typeof handlers["bootstrap.page"], "function");
  assert.equal(typeof handlers["bootstrap.state.read"], "function");
});

test("bootstrap shell implementation is plugin-owned without a src compatibility facade", async () => {
  const pluginShell = await readFile(new URL("./bootstrap-shell.js", import.meta.url), "utf8");

  assert.equal(typeof renderBootstrapPage, "function");
  assert.equal(pluginShell.includes("export function renderBootstrapPage"), true);
  assert.equal(pluginShell.includes("../tutorial/tutorials.js"), true);
  await assert.rejects(readFile(new URL("../../src/bootstrap-shell.js", import.meta.url), "utf8"));
});
