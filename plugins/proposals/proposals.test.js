import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { bundleId, createHandlers, handlerCatalog, routes } from "./runtime.js";
import { createAuthoringProposalExecutor } from "./proposal-executor.js";
import { providers as platformProviders } from "../platform/runtime.js";

test("proposals plugin owns proposal bundle routes and handlers", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "plugin.proposals");
  assert.deepEqual(manifest.activatesBundles, ["bundle-proposals"]);
  assert.equal(manifest.runtime.entry, "./runtime.js");
  assert.equal(bundleId, "bundle-proposals");
  assert.deepEqual(handlerCatalog.dispatchHandlers, [
    "proposal.create",
    "proposal.approve",
    "proposal.reject"
  ]);
  assert.equal(routes.some(route => route.path === "/api/proposals" && route.handler === "proposal.create"), true);
  assert.equal(routes.some(route => route.handler === "proposal.approve"), true);
  assert.equal(routes.some(route => route.handler === "proposal.reject"), true);

  const handlers = createHandlers({
    world: createWorld(),
    backendHost: "backendHost",
    readJson: async () => ({}),
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" },
      executeBootstrapProposal: actor => async () => ({ ok: true, witnessIds: [`executed-by-${actor}`] })
    },
    sendGateFailure() {},
    sendJson() {}
  });
  assert.equal(typeof handlers["proposal.create"], "function");
  assert.equal(typeof handlers["proposal.approve"], "function");
  assert.equal(typeof handlers["proposal.reject"], "function");
});

test("proposals plugin owns the proposal executor dispatch", async () => {
  const executorSource = await readFile(new URL("./proposal-executor.js", import.meta.url), "utf8");
  assert.equal(executorSource.includes("../authoring-core/authoring-core-proposal-targets.js"), true);
  assert.equal(executorSource.includes("../capability-authoring/capability-proposal-targets.js"), true);
  assert.equal(executorSource.includes("../program-authoring/program-proposal-targets.js"), true);
  assert.equal(executorSource.includes("../server-runner-authoring/server-runner-proposal-targets.js"), true);
  assert.equal(executorSource.includes("../mcp-authoring/mcp-proposal-targets.js"), true);
  assert.equal(executorSource.includes("../demo/demo-proposal-targets.js"), true);
  assert.equal(executorSource.includes("../platform/platform-proposal-targets.js"), true);
  assert.equal(executorSource.includes('case "branch.merge"'), true);
  assert.equal(executorSource.includes('case "branch.rebase"'), true);
  assert.equal(executorSource.includes("../../src/todo-runtime.js"), false);
  assert.equal(executorSource.includes("requestTodoCreate"), false);
  assert.equal(executorSource.includes("requestTodoUpdate"), false);
  assert.equal(executorSource.includes("requestTodoDelete"), false);
  assert.equal(executorSource.includes("requestBootstrapCapabilityDefine"), false);
  assert.equal(executorSource.includes("requestBootstrapCapabilityInstall"), false);
  assert.equal(executorSource.includes("requestBootstrapCapabilityRemove"), false);
  assert.equal(executorSource.includes("requestBootstrapFrontendProgramDefine"), false);
  assert.equal(executorSource.includes("requestBootstrapFrontendStepDefine"), false);
  assert.equal(executorSource.includes("requestBootstrapBackendProgramDefine"), false);
  assert.equal(executorSource.includes("requestBootstrapBackendProgramVersionDefine"), false);
  assert.equal(executorSource.includes("requestBootstrapBackendStepDefine"), false);
  assert.equal(executorSource.includes("requestBootstrapBackendProgramVersionActivate"), false);
  assert.equal(executorSource.includes("requestBootstrapBackendProgramVersionRollback"), false);
  assert.equal(executorSource.includes("requestBootstrapServerRunnerDefine"), false);
  assert.equal(executorSource.includes("requestBootstrapRuntimePluginInstall"), false);
  assert.equal(executorSource.includes("requestBootstrapRuntimePluginRemove"), false);
  assert.equal(executorSource.includes("requestBootstrapMcpServerDefine"), false);
  assert.equal(executorSource.includes("requestBootstrapMcpToolInstall"), false);
  assert.equal(executorSource.includes("requestBootstrapMcpToolRemove"), false);
  assert.equal(executorSource.includes("requestBootstrapIdentityUpdate"), false);
  assert.equal(executorSource.includes("requestBootstrapContextDefine"), false);
  assert.equal(executorSource.includes("requestBootstrapRouteDefine"), false);
  assert.equal(executorSource.includes("requestBootstrapServeDefine"), false);
  assert.equal(executorSource.includes("requestWidgetDefine"), false);

  const execute = createAuthoringProposalExecutor({
    world: createWorld(),
    backendHost: "backendHost",
    supportedHandlerSets: [],
    supportedHandlers: [],
    supportedFrontendOps: [],
    supportedBackendOps: [],
    ensureIdentityAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true }),
    ensureContextAuthority: () => ({ ok: true }),
    mcpToolNames: () => [],
    getRuntimePluginCatalog: async () => ({ packages: [] })
  });

  const result = await execute("aaron")({
    targetProcess: "proposal.executor.unsupported",
    body: {}
  });
  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: "proposal target process not supported"
  });
});

test("proposals plugin executor dispatches platform change-set and branch intent targets", async () => withRegisteredPluginProjectors(platformProviders, async () => {
  const world = createWorld();
  const execute = createAuthoringProposalExecutor({
    world,
    backendHost: "backendHost",
    supportedHandlerSets: [],
    supportedHandlers: [],
    supportedFrontendOps: [],
    supportedBackendOps: [],
    ensureIdentityAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true }),
    ensureContextAuthority: () => ({ ok: true }),
    mcpToolNames: () => [],
    getRuntimePluginCatalog: async () => ({ packages: [] })
  });

  const created = await execute("aaron")({
    targetProcess: "changeSet.create",
    targetId: "changeset.platform.executor",
    body: {
      id: "changeset.platform.executor",
      title: "Executor change set"
    }
  });
  assert.equal(created.ok, true);
  assert.equal(world.project(moduleProjectors.changeSetIndex).byId["changeset.platform.executor"].id, "changeset.platform.executor");
  assert.equal(world.project(moduleProjectors.branchIndex).byId["branch:platform-executor"].id, "branch:platform-executor");

  const sourceBranch = await execute("aaron")({
    targetProcess: "branch.create",
    targetId: "branch.merge.source",
    body: {
      id: "branch.merge.source",
      title: "Merge Source"
    }
  });
  assert.equal(sourceBranch.ok, true);

  const targetBranch = await execute("aaron")({
    targetProcess: "branch.create",
    targetId: "branch.merge.target",
    body: {
      id: "branch.merge.target",
      title: "Merge Target"
    }
  });
  assert.equal(targetBranch.ok, true);

  const mergeIntent = await execute("aaron")({
    targetProcess: "branch.merge",
    targetId: "branch.merge.source",
    body: {
      branchId: "branch.merge.source",
      intoBranchId: "branch.merge.target"
    }
  });
  assert.equal(mergeIntent.ok, true);
  assert.equal(mergeIntent.witnessIds.length, 1);

  const rebaseIntent = await execute("aaron")({
    targetProcess: "branch.rebase",
    targetId: "branch.merge.source",
    body: {
      branchId: "branch.merge.source",
      ontoBranchId: "branch.merge.target"
    }
  });
  assert.equal(rebaseIntent.ok, true);
  assert.equal(rebaseIntent.witnessIds.length, 1);
}));

test("proposals plugin owns proposal process helpers", async () => {
  const processesSource = await readFile(new URL("./proposal-processes.js", import.meta.url), "utf8");

  assert.equal(processesSource.includes("export function requestBootstrapProposalCreate"), true);
  assert.equal(processesSource.includes("export async function requestBootstrapProposalApprove"), true);
  assert.equal(processesSource.includes("export function requestBootstrapProposalReject"), true);
  await assert.rejects(readFile(new URL("../../src/bootstrap-authoring.js", import.meta.url), "utf8"));
});

test("proposal create lowers targetId refs through context scope visibility", async () => {
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

  const sent = [];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async () => ({
      id: "proposal.runtime-plugin.source",
      targetProcess: "runtimePlugin.install",
      targetKind: "serverRunner",
      context: "ctx.target",
      targetIdRef: "importedRunner",
      bodyJson: "{}",
      reason: "Need runtime plugin install review"
    }),
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      executeBootstrapProposal: () => async () => ({ ok: true, witnessIds: [] })
    },
    sendGateFailure(_res, gate) {
      sent.push({ gate });
    },
    sendJson(_res, status, body) {
      sent.push({ status, body });
    }
  });

  await handlers["proposal.create"]({ req: {}, res: {}, requestActor: "aaron" });

  assert.equal(sent[0]?.status, 201);
  assert.equal(sent[0]?.body?.proposal?.targetId, "source_server");
  assert.equal(world.project(moduleProjectors.proposals).some(row =>
    row.id === "proposal.runtime-plugin.source"
    && row.targetId === "source_server"
  ), true);
});

test("proposal create rejects unsupported target processes before proposal storage", async () => {
  const world = createWorld();
  const sent = [];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    readJson: async () => ({
      id: "proposal.unsupported.target",
      targetProcess: "proposal.executor.unsupported",
      targetKind: "thing",
      targetId: "anything",
      bodyJson: "{}",
      reason: "Should fail early"
    }),
    authoringServices: {
      requireBootstrapActor: actor => ({ ok: true, actor }),
      executeBootstrapProposal: () => async () => ({ ok: true, witnessIds: [] })
    },
    sendGateFailure(_res, gate) {
      sent.push({ gate });
    },
    sendJson(_res, status, body) {
      sent.push({ status, body });
    }
  });

  await handlers["proposal.create"]({ req: {}, res: {}, requestActor: "aaron" });

  assert.equal(sent[0]?.status, 400);
  assert.equal(sent[0]?.body?.error, "proposal target process not supported");
  assert.equal(world.project(moduleProjectors.proposals).some(row => row.id === "proposal.unsupported.target"), false);
});
