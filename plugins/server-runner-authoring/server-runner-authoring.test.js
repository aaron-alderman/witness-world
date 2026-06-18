import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { moduleProjectors } from "../../src/modules.js";
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

test("server-runner authoring handlers lower serverRunner refs before authority checks", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx.source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceRunner"
name = "importedRunner"
`);

  const seenTargets = [];
  const sent = [];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    runtimeProfile: "minimal",
    readJson: async () => ({
      context: "ctx.target",
      serverRunnerRef: "importedRunner",
      plugin: "plugin.inspect"
    }),
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: (_actor, target) => {
        seenTargets.push(target);
        return { ok: true };
      }
    },
    sendGateFailure(_res, gate) {
      sent.push({ gate });
    },
    sendJson(_res, status, body) {
      sent.push({ status, body });
    },
    supportedHandlerSets: [],
    getRuntimePluginCatalog: async () => ({
      packages: [{
        id: "plugin.inspect",
        validation: { ok: true, errors: [] },
        execution: { executable: true },
        compatibility: { compatible: true },
        dependencies: []
      }]
    })
  });

  await handlers["runtimePlugin.install"]({ req: {}, res: {}, requestActor: "aaron", appContext: {} });

  assert.deepEqual(seenTargets, ["source_server"]);
  assert.equal(sent[0]?.status, 201);
  assert.equal(world.project(moduleProjectors.runtimePluginInstalls).some(row =>
    row.serverRunner === "source_server" && row.plugin === "plugin.inspect"
  ), true);
});

test("server-runner authoring handlers reject hidden foreign canonical runner ids before authority checks", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx.source"
backendHost = "backendHost"
frontendHost = "frontendHost"
`);

  const seenTargets = [];
  const sent = [];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    runtimeProfile: "minimal",
    readJson: async () => ({
      context: "ctx.target",
      serverRunner: "source_server",
      plugin: "plugin.inspect"
    }),
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: (_actor, target) => {
        seenTargets.push(target);
        return { ok: true };
      }
    },
    sendGateFailure(_res, gate) {
      sent.push({ gate });
    },
    sendJson(_res, status, body) {
      sent.push({ status, body });
    },
    supportedHandlerSets: [],
    getRuntimePluginCatalog: async () => ({
      packages: [{
        id: "plugin.inspect",
        validation: { ok: true, errors: [] },
        execution: { executable: true },
        compatibility: { compatible: true },
        dependencies: []
      }]
    })
  });

  await handlers["runtimePlugin.install"]({ req: {}, res: {}, requestActor: "aaron", appContext: {} });

  assert.deepEqual(seenTargets, []);
  assert.equal(sent[0]?.status, 400);
  assert.match(sent[0]?.body?.error ?? "", /server runner id targets source_server in context ctx\.source and is not visible in authoring context ctx\.target/);
});

test("server-runner authoring handlers create proposals when direct authority is forbidden", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[context]]
actor = "system"
id = "ctx.shared"

[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx.source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceRunner"
name = "importedRunner"
`);

  const seenTargets = [];
  const sent = [];
  const bodies = [
    {
      id: "shared_runner",
      context: "ctx.shared",
      backendHost: "backendHost",
      frontendHost: "frontendHost"
    },
    {
      context: "ctx.target",
      serverRunnerRef: "importedRunner",
      plugin: "plugin.inspect"
    },
    {
      context: "ctx.target",
      serverRunnerRef: "importedRunner",
      plugin: "plugin.inspect"
    }
  ];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    runtimeProfile: "minimal",
    readJson: async () => bodies.shift(),
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      ensureContextAuthority: () => ({ ok: false, status: 403, reason: "forbidden context" }),
      ensureTargetAuthority: (_actor, target) => {
        seenTargets.push(target);
        return { ok: false, status: 403, reason: "forbidden target" };
      }
    },
    sendGateFailure(_res, gate) {
      sent.push({ gate });
    },
    sendJson(_res, status, body) {
      sent.push({ status, body });
    },
    supportedHandlerSets: [],
    getRuntimePluginCatalog: async () => ({ packages: [] })
  });

  await handlers["serverRunner.create"]({ req: {}, res: {}, requestActor: "callan" });
  await handlers["runtimePlugin.install"]({ req: {}, res: {}, requestActor: "callan", appContext: {} });
  await handlers["runtimePlugin.remove"]({ req: {}, res: {}, requestActor: "callan", appContext: {} });

  assert.deepEqual(seenTargets, ["source_server", "source_server"]);
  assert.equal(sent[0]?.status, 202);
  assert.equal(sent[0]?.body?.proposal?.targetProcess, "serverRunner.define");
  assert.equal(sent[0]?.body?.proposal?.targetId, "ctx.shared");
  assert.equal(sent[1]?.status, 202);
  assert.equal(sent[1]?.body?.proposal?.targetProcess, "runtimePlugin.install");
  assert.equal(sent[1]?.body?.proposal?.targetId, "source_server");
  assert.equal(sent[2]?.status, 202);
  assert.equal(sent[2]?.body?.proposal?.targetProcess, "runtimePlugin.remove");
  assert.equal(sent[2]?.body?.proposal?.targetId, "source_server");
});

test("server-runner authoring proposal targets lower serverRunner refs before authority checks", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx.source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceRunner"
name = "importedRunner"
`);

  const seenTargets = [];
  const result = await executeServerRunnerAuthoringProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "runtimePlugin.install" },
    body: {
      context: "ctx.target",
      serverRunnerRef: "importedRunner",
      plugin: "plugin.inspect"
    },
    supportedHandlerSets: [],
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: (_actor, target) => {
      seenTargets.push(target);
      return { ok: true };
    },
    getRuntimePluginCatalog: async () => ({
      packages: [{
        id: "plugin.inspect",
        validation: { ok: true, errors: [] },
        execution: { executable: true },
        compatibility: { compatible: true },
        dependencies: []
      }]
    })
  });

  assert.deepEqual(seenTargets, ["source_server"]);
  assert.equal(result?.ok, true);
  assert.equal(world.project(moduleProjectors.runtimePluginInstalls).some(row =>
    row.serverRunner === "source_server" && row.plugin === "plugin.inspect"
  ), true);
});
