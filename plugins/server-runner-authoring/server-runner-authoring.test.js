import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { bundleId, createHandlers, handlerCatalog, routes } from "./runtime.js";
import { executeServerRunnerAuthoringProposalTarget } from "./server-runner-proposal-targets.js";

const SERVER_RUNNER_HANDLER_IDS = [
  "serverRunner.create",
  "runtimePlugin.install",
  "runtimePlugin.remove"
];

const SERVER_RUNNER_PROCESS_EXPORTS = [
  "requestBootstrapServerRunnerDefine",
  "requestBootstrapRuntimePluginInstall",
  "requestBootstrapRuntimePluginRemove"
];

test("server-runner-authoring plugin owns server-runner routes and handlers", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "plugin.server-runner-authoring");
  assert.deepEqual(manifest.activatesBundles, ["bundle-server-runner-authoring"]);
  assert.equal(manifest.runtime.entry, "./runtime.js");
  assert.equal(bundleId, "bundle-server-runner-authoring");
  assert.deepEqual(handlerCatalog.authorableHandlers, ["runtimePlugin.install", "runtimePlugin.remove"]);
  assert.deepEqual(handlerCatalog.dispatchHandlers, SERVER_RUNNER_HANDLER_IDS);
  assert.equal(routes.some(route => route.path === "/api/server-runners" && route.handler === "serverRunner.create"), true);
  assert.equal(routes.some(route => route.path === "/api/runtime-plugin-installs" && route.handler === "runtimePlugin.install"), true);
  assert.equal(routes.some(route => route.method === "DELETE" && route.path === "/api/runtime-plugin-installs" && route.handler === "runtimePlugin.remove"), true);

  const handlers = createHandlers({
    world: createWorld(),
    backendHost: "backendHost",
    runtimeProfile: "minimal",
    readJson: async () => ({}),
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" },
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: () => ({ ok: true })
    },
    sendGateFailure() {},
    sendJson() {},
    supportedHandlerSets: [],
    getRuntimePluginCatalog: async () => ({ packages: [] })
  });
  for (const handlerId of SERVER_RUNNER_HANDLER_IDS) {
    assert.equal(typeof handlers[handlerId], "function");
  }
});

test("server-runner-authoring plugin owns process helpers and proposal targets", async () => {
  const processesSource = await readFile(new URL("./server-runner-processes.js", import.meta.url), "utf8");
  const proposalTargetSource = await readFile(new URL("./server-runner-proposal-targets.js", import.meta.url), "utf8");
  const authoringMeta = JSON.parse(await readFile(new URL("../authoring/plugin.json", import.meta.url), "utf8"));

  for (const exportName of SERVER_RUNNER_PROCESS_EXPORTS) {
    assert.equal(processesSource.includes(`export function ${exportName}`), true);
  }
  await assert.rejects(readFile(new URL("../../src/bootstrap-authoring.js", import.meta.url), "utf8"));
  for (const targetProcess of [
    "serverRunner.define",
    "runtimePlugin.install",
    "runtimePlugin.remove"
  ]) {
    assert.equal(proposalTargetSource.includes(`case "${targetProcess}"`), true);
  }
  assert.equal(authoringMeta.runtime, undefined);
  assert.equal(authoringMeta.activatesBundles, undefined);
  assert.equal(authoringMeta.dependsOnPlugins.includes("plugin.server-runner-authoring"), true);

  const unsupported = await executeServerRunnerAuthoringProposalTarget({
    world: createWorld(),
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "not.serverRunner" },
    body: {},
    supportedHandlerSets: [],
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true }),
    getRuntimePluginCatalog: async () => ({ packages: [] })
  });
  assert.equal(unsupported, null);
});
