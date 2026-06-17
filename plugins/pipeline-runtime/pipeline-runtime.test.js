import assert from "node:assert/strict";
import test from "node:test";
import { handlerCatalog } from "./handler-catalog.js";
import runtimeModule from "./runtime.js";

test("pipeline runtime exposes the platform-config demo handlers and no plugin-owned routes", () => {
  assert.deepEqual(handlerCatalog.authorableHandlers, [
    "pipeline.platform-config.snapshot",
    "pipeline.platform-config.secret.read",
    "pipeline.platform-config.secret.create",
    "pipeline.platform-config.secret.write",
    "pipeline.platform-config.secret.delete",
    "pipeline.platform-config.datasource.read",
    "pipeline.platform-config.datasource.create",
    "pipeline.platform-config.datasource.update",
    "pipeline.platform-config.datasource.delete",
    "pipeline.platform-config.datasource.test",
    "pipeline.script.run"
  ]);
  assert.deepEqual(handlerCatalog.pageHandlers, []);
  assert.deepEqual(runtimeModule.routes, []);
  assert.equal(runtimeModule.bundleId, "bundle-pipeline-runtime");
});

test("pipeline runtime handlers render the page and return a stub script response", async () => {
  const json = [];
  const handlers = runtimeModule.createHandlers({
    world: { observe() {} },
    backendHost: "backendHost",
    sendJson: (res, status, body) => json.push({ res, status, body }),
    readJson: async () => ({
      scriptName: "demo",
      datasourceId: "pg_main",
      payload: { run: true }
    })
  });

  await handlers["pipeline.script.run"]({
    req: {},
    res: {},
    requestActor: "aaron",
    appContext: { serverRunnerId: "engentus_server" }
  });
  assert.equal(json.length, 1);
  assert.equal(json[0].status, 200);
  assert.equal(json[0].body.stub, true);
  assert.equal(json[0].body.request.datasourceId, "pg_main");
});
