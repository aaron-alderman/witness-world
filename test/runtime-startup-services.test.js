import assert from "node:assert/strict";
import test from "node:test";
import { moduleProjectors } from "../src/modules.js";
import {
  createRuntimeAppContextForRunner,
  createRuntimeResolverForServer
} from "../src/runtime-startup-services.js";

test("runtime startup services build app context inputs from runner storage and runtime config", async () => {
  const calls = [];
  const appContext = await createRuntimeAppContextForRunner({
    world: {},
    serverRunner: {
      id: "runner-1",
      backendHost: "backendHost",
      frontendHost: "frontendHost",
      storage: { assetsRoot: "assets" },
      runtimeConfig: { demo: true }
    },
    runtimeRoot: "/runtime",
    sendJson: () => {},
    readJson: () => {},
    handlerSetFactories: {},
    createBuiltinAssetJobHandlers: () => ({}),
    createBuiltinNotificationJobHandlers: () => ({}),
    createBuiltinWebhookJobHandlers: () => ({}),
    createInProcessJobQueue: () => ({}),
    createDbSqlRuntime: () => ({}),
    createSearchIndexRuntime: () => ({}),
    resolveStorageConfig: (storage, root) => ({ storage, root, resolved: true }),
    resolveRuntimeConfig: (runtimeConfig, env) => ({ ok: true, values: { runtimeConfig, env }, fields: [] }),
    env: { DEMO: "1" },
    createRuntimeAppContext: async config => {
      calls.push(config);
      return { ok: true, storage: config.storage, runtimeConfig: config.runtimeConfig.values };
    }
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].storage, { storage: { assetsRoot: "assets" }, root: "/runtime", resolved: true });
  assert.deepEqual(calls[0].runtimeConfig, { ok: true, values: { runtimeConfig: { demo: true }, env: { DEMO: "1" } }, fields: [] });
  assert.equal(appContext.ok, true);
});

test("runtime startup services create resolver bindings for live and unavailable contexts", async () => {
  const world = {
    project(projector) {
      if (projector === moduleProjectors.identityIndex) {
        return { rows: [{ actor: "adam", label: "Adam" }] };
      }
      return null;
    }
  };
  const captured = [];
  const resolver = createRuntimeResolverForServer({
    world,
    bootstrapRunner: { id: "bootstrap" },
    bootstrapContext: { ok: true, label: "bootstrap" },
    runtimeRoot: "/runtime",
    sendJson: () => {},
    readJson: () => {},
    handlerSetFactories: {},
    createBuiltinAssetJobHandlers: () => ({}),
    createBuiltinNotificationJobHandlers: () => ({}),
    createBuiltinWebhookJobHandlers: () => ({}),
    createInProcessJobQueue: () => ({}),
    createDbSqlRuntime: () => ({}),
    createSearchIndexRuntime: () => ({}),
    resolveStorageConfig: storage => ({ storage }),
    resolveRuntimeConfig: runtimeConfig => ({ ok: true, values: runtimeConfig ?? {}, fields: [] }),
    env: {},
    createRuntimeAppContext: async config => {
      captured.push(config);
      return { ok: true, serverRunnerId: config.serverRunner.id };
    },
    createUnavailableRuntimeAppContext: ({ reason, identities }) => ({ ok: false, reason, identities }),
    createRuntimeContextResolver: config => config,
    resolveLiveRunner: () => ({ ok: true, runner: { id: "live", backendHost: "b", frontendHost: "f", storage: {}, runtimeConfig: {} } })
  });

  const liveContext = await resolver.createContextForRunner({ id: "live", backendHost: "b", frontendHost: "f", storage: {}, runtimeConfig: {} });
  const unavailable = resolver.createUnavailableContext("broken");

  assert.equal(captured.length, 1);
  assert.equal(captured[0].serverRunner.id, "live");
  assert.deepEqual(liveContext, { ok: true, serverRunnerId: "live" });
  assert.deepEqual(unavailable, {
    ok: false,
    reason: "broken",
    identities: [{ actor: "adam", label: "Adam" }]
  });
});
