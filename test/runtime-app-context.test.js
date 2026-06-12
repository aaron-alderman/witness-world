import assert from "node:assert/strict";
import test from "node:test";
import {
  actorsFromIdentities,
  createRuntimeAppContext,
  createUnavailableRuntimeAppContext
} from "../src/runtime-app-context.js";

test("actorsFromIdentities deduplicates actor ids and preserves labels", () => {
  assert.deepEqual(
    actorsFromIdentities([
      { actor: "aaron", label: "Aaron" },
      { actor: "aaron", label: "Aaron Duplicate" },
      { actor: "  " },
      { actor: "callan" }
    ]),
    [
      { id: "aaron", label: "Aaron" },
      { id: "callan", label: "callan" }
    ]
  );
});

test("createUnavailableRuntimeAppContext exposes witness visibility and derived actors", () => {
  const witnesses = [{ id: "w1" }];
  const world = {
    allWitnesses: () => witnesses
  };

  const unavailable = createUnavailableRuntimeAppContext({
    world,
    reason: "broken live context",
    identities: [{ actor: "aaron", label: "Aaron" }]
  });

  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.reason, "broken live context");
  assert.deepEqual(unavailable.actors, [{ id: "aaron", label: "Aaron" }]);
  assert.deepEqual(unavailable.handlers, {});
  assert.equal(unavailable.visibleWitnesses(), witnesses);
});

test("createRuntimeAppContext composes the baseline runtime services outside host.js", async () => {
  const witnesses = [{ id: "w1" }];
  const identityIndex = {
    rows: [{ actor: "aaron", label: "Aaron" }],
    byId: {},
    byUsername: {}
  };
  const world = {
    allWitnesses: () => witnesses
  };
  const closed = [];
  let queuedConfig = null;

  const appContext = await createRuntimeAppContext({
    world,
    serverRunner: { id: "runner-1", handlerSet: null, actors: null },
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    runtimeRoot: "/runtime",
    storage: { assetsRoot: "/runtime/assets" },
    runtimeConfig: {
      ok: true,
      values: { "jobs.queue.maxAttempts": 9 },
      fields: [{ key: "jobs.queue.maxAttempts", resolved: true }]
    },
    sendJson: () => {},
    readJson: () => {},
    handlerSetFactories: {},
    createBuiltinAssetJobHandlers: () => ({ "asset.job": () => {} }),
    createBuiltinNotificationJobHandlers: () => ({ "notify.job": () => {} }),
    createBuiltinWebhookJobHandlers: () => ({ "webhook.job": () => {} }),
    createInProcessJobQueue: config => {
      queuedConfig = config;
      return { close: () => closed.push("jobs") };
    },
    createDbSqlRuntime: () => ({ close: () => closed.push("db") }),
    createSearchIndexRuntime: () => ({ close: () => closed.push("search") }),
    identityIndex
  });

  assert.equal(appContext.ok, true);
  assert.equal(appContext.serverRunnerId, "runner-1");
  assert.deepEqual(appContext.actors, [{ id: "aaron", label: "Aaron" }]);
  assert.equal(appContext.identityIndex, identityIndex);
  assert.deepEqual(appContext.handlers, {});
  assert.deepEqual(appContext.jobHandlers, {});
  assert.equal(typeof appContext.visibleWitnesses, "function");
  assert.equal(appContext.visibleWitnesses(), witnesses);
  assert.equal(queuedConfig.serverRunnerId, "runner-1");
  assert.deepEqual(Object.keys(queuedConfig.jobHandlers).sort(), ["asset.job", "notify.job", "webhook.job"]);
  assert.equal(queuedConfig.getAppContext(), appContext);
  assert.ok(appContext.authOAuth.pendingFlows instanceof Map);
  assert.ok(appContext.httpOutboundStubState instanceof Map);

  appContext.close();
  assert.deepEqual(closed, ["jobs", "db", "search"]);
});

test("createRuntimeAppContext preserves handler-set produced services and job handlers", async () => {
  const world = {
    allWitnesses: () => []
  };

  const appContext = await createRuntimeAppContext({
    world,
    serverRunner: { id: "runner-2", handlerSet: "demo", actors: [{ id: "preset", label: "Preset" }] },
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    runtimeRoot: "/runtime",
    storage: {},
    runtimeConfig: { ok: true, values: {}, fields: [] },
    sendJson: () => {},
    readJson: () => {},
    handlerSetFactories: {
      demo: async ({ actors }) => ({
        actors: [...actors, { id: "extra", label: "Extra" }],
        handlers: { "page.demo": () => "ok" },
        jobHandlers: { "demo.job": () => "ok" },
        visibleWitnesses: () => [{ id: "demo-witness" }]
      })
    },
    createBuiltinAssetJobHandlers: () => ({}),
    createBuiltinNotificationJobHandlers: () => ({}),
    createBuiltinWebhookJobHandlers: () => ({}),
    createInProcessJobQueue: ({ jobHandlers }) => ({ jobHandlers, close: () => {} }),
    createDbSqlRuntime: () => ({ close: () => {} }),
    createSearchIndexRuntime: () => ({ close: () => {} }),
    identityIndex: { rows: [], byId: {}, byUsername: {} }
  });

  assert.equal(appContext.ok, true);
  assert.deepEqual(appContext.actors, [
    { id: "preset", label: "Preset" },
    { id: "extra", label: "Extra" }
  ]);
  assert.equal(typeof appContext.handlers["page.demo"], "function");
  assert.equal(typeof appContext.jobs.jobHandlers["demo.job"], "function");
  assert.deepEqual(appContext.visibleWitnesses(), [{ id: "demo-witness" }]);
});
