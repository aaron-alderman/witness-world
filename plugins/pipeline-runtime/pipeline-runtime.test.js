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
  assert.match(json[0].body.summary, /would run against datasource "pg_main"/);
  assert.equal(json[0].body.request.datasourceId, "pg_main");
});

test("pipeline platform-config snapshot presents human-readable table content", async () => {
  const json = [];
  const handlers = runtimeModule.createHandlers({
    world: { observe() {} },
    backendHost: "backendHost",
    sendJson: (res, status, body) => json.push({ res, status, body }),
    readJson: async () => ({ secretQuery: "", datasourceQuery: "" })
  });

  await handlers["pipeline.platform-config.snapshot"]({
    req: {},
    res: {},
    requestActor: "aaron",
    appContext: {
      secretStore: {
        listMetadata: async () => [{
          id: "secret_alpha",
          title: "Primary Postgres Password",
          status: "ready",
          hasValue: true,
          updatedAt: "2026-06-17T00:00:00.000Z"
        }]
      },
      dbSql: {
        listDatasources: () => [{
          id: "pg_main",
          title: "Primary Postgres",
          provider: "postgres",
          status: "ready",
          lastTestResult: "succeeded",
          updatedAt: "2026-06-17T00:00:00.000Z"
        }]
      }
    }
  });

  assert.equal(json.length, 1);
  assert.equal(json[0].status, 200);
  assert.equal(json[0].body.secrets[0].hasValueText, "Stored");
  assert.equal(json[0].body.secrets[0].updatedAtTitle, "2026-06-17T00:00:00.000Z");
  assert.equal(typeof json[0].body.secrets[0].updatedAtText, "string");
  assert.equal(json[0].body.datasources[0].providerText, "Postgres");
  assert.equal(json[0].body.datasources[0].lastTestResultText, "succeeded");
  assert.equal(json[0].body.datasources[0].updatedAtTitle, "2026-06-17T00:00:00.000Z");
});
