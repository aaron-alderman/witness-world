import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformHandlers } from "./handlers.js";
import { createWorld } from "../../src/kernel.js";
import { createMaterializedView } from "../../src/modules.js";
import { createMaterializedViewRegistry } from "../../src/materialized-views.js";

function buildRequestUrl(pathname) {
  return new URL(`http://platform.local${pathname}`);
}

test("platform model reads do not await automatic rollback proposal synthesis and coalesce pending scheduling", async () => {
  let ensureCalls = 0;
  const observed = [];
  const responses = [];
  const handlers = createPlatformHandlers({
    world: {
      emit(entry) {
        observed.push(entry);
        return entry;
      },
      observe(entry) {
        observed.push(entry);
        return entry;
      }
    },
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async () => ({}),
    authoringServices: {},
    send() {},
    sendJson(res, status, body) {
      responses.push({ status, body });
      res.status = status;
      res.body = body;
    },
    buildPlatformSliceImpl: async () => ({
      lifecycleVocabulary: [],
      lifecycleBoard: [],
      nodes: [],
      gaps: [],
      docs: [],
      profiles: [],
      testGates: [],
      summaries: {}
    }),
    ensureAutomaticShipRollbackProposalsImpl: () => {
      ensureCalls += 1;
      return new Promise(() => {});
    }
  });
  const appContext = { project: () => [] };

  const first = handlers["platform.model.read"]({
    res: {},
    requestUrl: buildRequestUrl("/api/platform-model?area=overview&section=summary"),
    requestActor: "adam",
    appContext
  });
  const second = handlers["platform.model.read"]({
    res: {},
    requestUrl: buildRequestUrl("/api/platform-model?area=overview&section=summary"),
    requestActor: "adam",
    appContext
  });

  const timeout = ms => new Promise(resolve => setTimeout(() => resolve("timeout"), ms));
  assert.equal(await Promise.race([first.then(() => "done"), timeout(50)]), "done");
  assert.equal(await Promise.race([second.then(() => "done"), timeout(50)]), "done");
  assert.equal(ensureCalls, 1);
  assert.equal(responses.length, 2);
  assert.equal(responses.every(response => response.status === 200), true);
  assert.equal(observed.filter(entry => entry.process === "backend.readPlatformModel").length, 2);
});

test("platform model reads use authored materialized platform slices when available", async () => {
  const world = createWorld();
  createMaterializedView(world, {
    actor: "adam",
    id: "platform.view.overview.summary",
    kind: "platformSlice",
    sliceKey: "overview",
    modelView: "summary",
    ttlMs: 1000
  });
  let builds = 0;
  const handlers = createPlatformHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async () => ({}),
    authoringServices: {},
    send() {},
    sendJson(res, status, body) {
      res.status = status;
      res.body = body;
    },
    buildPlatformSliceImpl: async () => {
      builds += 1;
      return {
        lifecycleVocabulary: [],
        lifecycleBoard: [],
        nodes: [],
        gaps: [],
        docs: [],
        profiles: [],
        testGates: [],
        summaries: {}
      };
    },
    ensureAutomaticShipRollbackProposalsImpl: async () => null
  });
  const appContext = {
    project: projector => world.project(projector, { observations: world.allObservations() }),
    materializedViews: createMaterializedViewRegistry({ world })
  };

  await handlers["platform.model.read"]({
    res: {},
    requestUrl: buildRequestUrl("/api/platform-model?area=overview&section=summary"),
    requestActor: "adam",
    appContext
  });
  await handlers["platform.model.read"]({
    res: {},
    requestUrl: buildRequestUrl("/api/platform-model?area=overview&section=summary"),
    requestActor: "adam",
    appContext
  });

  assert.equal(builds, 1);
});
