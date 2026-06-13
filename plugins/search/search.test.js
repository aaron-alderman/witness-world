import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { bundleId, handlerCatalog, providers, routes, createHandlers } from "./runtime.js";

test("search plugin owns search.index bundle catalog, routes, and handler factory", () => {
  assert.equal(bundleId, "bundle-search");
  assert.equal(handlerCatalog.dispatchHandlers.includes("search.index.inspect"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("search.index.build"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("search.index.reindex"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("search.index.query"), true);
  assert.equal(routes.some(route => route.handler === "search.index.query"), true);
  assert.equal(typeof createHandlers, "function");
});

test("search plugin registers search index read-model projectors", () => withRegisteredPluginProjectors(providers, () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "system" });
  createThing(world, { actor: "system", id: "search.main" });
  world.emit({
    process: "defineSearchIndex",
    actor: "system",
    claims: [
      relation("search.main", "hasModuleKind", "searchIndex"),
      relation("search.main", "hasTitle", "Main Search")
    ],
    body: { id: "search.main" }
  });
  world.emit({
    process: "search.index.query",
    actor: "system",
    body: {
      id: "search.main",
      serverRunner: "runner.demo",
      provider: "memory",
      name: "main",
      documentCount: 4,
      assetCount: 1,
      queryCount: 2,
      lastQueryAt: "2026-06-13T00:00:00.000Z"
    }
  });

  assert.deepEqual(world.project(moduleProjectors.searchIndexes), [{
    id: "search.main",
    title: "Main Search",
    owner: "system",
    context: null,
    serverRunner: "runner.demo",
    provider: "memory",
    name: "main",
    status: "ready",
    sourceCount: 0,
    documentCount: 4,
    assetCount: 1,
    queryCount: 2,
    lastBuiltAt: null,
    lastQueryAt: "2026-06-13T00:00:00.000Z",
    path: null,
    lastError: null
  }]);
  assert.equal(world.project(moduleProjectors.searchIndexIndex).byId["search.main"].provider, "memory");
}));
