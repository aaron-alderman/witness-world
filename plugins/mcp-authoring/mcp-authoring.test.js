import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { parseWitnessToml, applyWitnessDocsWithRuntimePlugins } from "../../src/dsl.js";
import { createModuleProjectorContext } from "../../src/modules.js";
import { bundleId, createHandlers, desireExtensions, handlerCatalog, providers, routes } from "./runtime.js";
import { executeMcpAuthoringProposalTarget } from "./mcp-proposal-targets.js";
import { mcpModuleProjectors } from "../mcp/projections.js";

const MCP_AUTHORING_HANDLER_IDS = [
  "mcpServer.create",
  "mcpTool.install",
  "mcpTool.remove"
];

const MCP_AUTHORING_PROCESS_EXPORTS = [
  "requestBootstrapMcpServerDefine",
  "requestBootstrapMcpToolInstall",
  "requestBootstrapMcpToolRemove"
];

test("mcp-authoring plugin owns MCP authoring routes and handlers", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "plugin.mcp-authoring");
  assert.deepEqual(manifest.activatesBundles, ["bundle-mcp-authoring"]);
  assert.equal(manifest.runtime.entry, "./runtime.js");
  assert.equal(bundleId, "bundle-mcp-authoring");
  assert.deepEqual(handlerCatalog.authorableHandlers, MCP_AUTHORING_HANDLER_IDS);
  assert.deepEqual(handlerCatalog.dispatchHandlers, MCP_AUTHORING_HANDLER_IDS);
  assert.equal(routes.some(route => route.path === "/api/mcp-servers" && route.handler === "mcpServer.create"), true);
  assert.equal(routes.some(route => route.path === "/api/mcp-tool-installs" && route.handler === "mcpTool.install"), true);
  assert.equal(routes.some(route => route.method === "DELETE" && route.path === "/api/mcp-tool-installs" && route.handler === "mcpTool.remove"), true);
  assert.equal(providers.some(provider => provider.kind === "runtimeBuiltinSeeds" && provider.processSpecs?.some(spec => spec.id === "mcp_server_define_spec")), true);
  assert.deepEqual(desireExtensions.runtimeDeclarations.map(entry => entry.kind), [
    "mcpServer",
    "mcpToolInstall",
    "mcpToolRemove"
  ]);

  const handlers = createHandlers({
    world: createWorld(),
    backendHost: "backendHost",
    readJson: async () => ({}),
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" },
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: () => ({ ok: true })
    },
    sendGateFailure() {},
    sendJson() {},
    mcpToolNames: () => ["example.tool"]
  });
  for (const handlerId of MCP_AUTHORING_HANDLER_IDS) {
    assert.equal(typeof handlers[handlerId], "function");
  }
});

test("mcp-authoring plugin owns process helpers and proposal targets", async () => {
  const processesSource = await readFile(new URL("./mcp-processes.js", import.meta.url), "utf8");
  const proposalTargetSource = await readFile(new URL("./mcp-proposal-targets.js", import.meta.url), "utf8");
  const authoringMeta = JSON.parse(await readFile(new URL("../authoring/plugin.json", import.meta.url), "utf8"));

  for (const exportName of MCP_AUTHORING_PROCESS_EXPORTS) {
    assert.equal(processesSource.includes(`export function ${exportName}`), true);
  }
  await assert.rejects(readFile(new URL("../../src/bootstrap-authoring.js", import.meta.url), "utf8"));
  for (const targetProcess of [
    "mcpServer.define",
    "mcpTool.install",
    "mcpTool.remove"
  ]) {
    assert.equal(proposalTargetSource.includes(`case "${targetProcess}"`), true);
  }
  assert.equal(authoringMeta.runtime, undefined);
  assert.equal(authoringMeta.activatesBundles, undefined);
  assert.equal(authoringMeta.dependsOnPlugins.includes("plugin.mcp-authoring"), true);

  const unsupported = executeMcpAuthoringProposalTarget({
    world: createWorld(),
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "not.mcp" },
    body: {},
    mcpToolNames: () => [],
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: () => ({ ok: true })
  });
  assert.equal(unsupported, null);
});

test("mcp-authoring handlers lower server refs before authority checks", async () => {
  const world = createWorld();
  await applyWitnessDocsWithRuntimePlugins(world, parseWitnessToml(`
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

[[mcpServer]]
actor = "system"
id = "source_mcp"
serverRunner = "source_server"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceMcp"
target = "source_mcp"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceMcp"
target = "source_mcp"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceMcp"
name = "importedMcp"
  `), {
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.mcp-authoring"]
  });
  const projectionContext = createModuleProjectorContext(mcpModuleProjectors, {
    owner: "plugins/mcp-authoring/mcp-authoring.test.js"
  });
  const removeProjectionContext = world._pushProjectionContext(projectionContext);

  try {
    const seenTargets = [];
    const sent = [];
    const handlers = createHandlers({
      world,
      backendHost: "backendHost",
      readJson: async () => ({
        context: "ctx.target",
        serverRef: "importedMcp",
        tool: "world.read"
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
      mcpToolNames: () => ["world.read"]
    });

    await handlers["mcpTool.install"]({ req: {}, res: {}, requestActor: "aaron", appContext: {} });

    assert.deepEqual(seenTargets, ["source_mcp"]);
    assert.equal(sent[0]?.status, 201);
    assert.equal(sent[0]?.body?.mcpToolInstall?.server, "source_mcp");
  } finally {
    removeProjectionContext();
  }
});

test("mcp-authoring handlers reject hidden foreign canonical server ids before authority checks", async () => {
  const world = createWorld();
  await applyWitnessDocsWithRuntimePlugins(world, parseWitnessToml(`
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

[[mcpServer]]
actor = "system"
id = "source_mcp"
serverRunner = "source_server"
context = "ctx.source"
  `), {
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.mcp-authoring"]
  });
  const projectionContext = createModuleProjectorContext(mcpModuleProjectors, {
    owner: "plugins/mcp-authoring/mcp-authoring.test.js"
  });
  const removeProjectionContext = world._pushProjectionContext(projectionContext);

  try {
    const seenTargets = [];
    const sent = [];
    const handlers = createHandlers({
      world,
      backendHost: "backendHost",
      readJson: async () => ({
        context: "ctx.target",
        server: "source_mcp",
        tool: "world.read"
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
      mcpToolNames: () => ["world.read"]
    });

    await handlers["mcpTool.install"]({ req: {}, res: {}, requestActor: "aaron", appContext: {} });

    assert.deepEqual(seenTargets, []);
    assert.equal(sent[0]?.status, 400);
    assert.match(sent[0]?.body?.error ?? "", /mcp server id targets source_mcp in context ctx\.source and is not visible in authoring context ctx\.target/);
  } finally {
    removeProjectionContext();
  }
});

test("mcp-authoring handlers create proposals when direct authority is forbidden", async () => {
  const world = createWorld();
  await applyWitnessDocsWithRuntimePlugins(world, parseWitnessToml(`
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

[[mcpServer]]
actor = "system"
id = "source_mcp"
serverRunner = "source_server"

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

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceMcp"
target = "source_mcp"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceMcp"
target = "source_mcp"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceMcp"
name = "importedMcp"
  `), {
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.mcp-authoring"]
  });

  const seenTargets = [];
  const sent = [];
  const bodies = [
    {
      context: "ctx.target",
      id: "shared_mcp",
      label: "Shared MCP",
      serverRunnerRef: "importedRunner",
      transportsJson: JSON.stringify(["http"]),
      proposalId: "proposal.mcp.server.shared",
      reason: "Create a shared MCP server"
    },
    {
      context: "ctx.target",
      serverRef: "importedMcp",
      tool: "world.read",
      id: "proposal.mcp.tool.install.world-read",
      reason: "Install world.read on the shared MCP server"
    },
    {
      context: "ctx.target",
      serverRef: "importedMcp",
      tool: "world.read",
      id: "proposal.mcp.tool.remove.world-read",
      reason: "Remove world.read from the shared MCP server"
    }
  ];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
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
    mcpToolNames: () => ["world.read"]
  });

  await handlers["mcpServer.create"]({ req: {}, res: {}, requestActor: "callan", appContext: {} });
  await handlers["mcpTool.install"]({ req: {}, res: {}, requestActor: "callan", appContext: {} });
  await handlers["mcpTool.remove"]({ req: {}, res: {}, requestActor: "callan", appContext: {} });

  assert.deepEqual(seenTargets, ["source_server", "source_mcp", "source_mcp"]);
  assert.equal(sent[0]?.status, 202);
  assert.equal(sent[0]?.body?.proposal?.targetProcess, "mcpServer.define");
  assert.equal(sent[0]?.body?.proposal?.targetId, "source_server");
  assert.equal(sent[0]?.body?.proposal?.id, "proposal.mcp.server.shared");
  assert.equal(sent[0]?.body?.proposal?.reason, "Create a shared MCP server");
  assert.deepEqual(sent[0]?.body?.proposal?.body, {
    context: "ctx.target",
    id: "shared_mcp",
    label: "Shared MCP",
    serverRunnerRef: "importedRunner",
    transportsJson: JSON.stringify(["http"])
  });
  assert.equal(sent[1]?.status, 202);
  assert.equal(sent[1]?.body?.proposal?.targetProcess, "mcpTool.install");
  assert.equal(sent[1]?.body?.proposal?.targetId, "source_mcp");
  assert.equal(sent[1]?.body?.proposal?.id, "proposal.mcp.tool.install.world-read");
  assert.equal(sent[1]?.body?.proposal?.reason, "Install world.read on the shared MCP server");
  assert.deepEqual(sent[1]?.body?.proposal?.body, {
    context: "ctx.target",
    serverRef: "importedMcp",
    tool: "world.read"
  });
  assert.equal(sent[2]?.status, 202);
  assert.equal(sent[2]?.body?.proposal?.targetProcess, "mcpTool.remove");
  assert.equal(sent[2]?.body?.proposal?.targetId, "source_mcp");
  assert.equal(sent[2]?.body?.proposal?.id, "proposal.mcp.tool.remove.world-read");
  assert.equal(sent[2]?.body?.proposal?.reason, "Remove world.read from the shared MCP server");
  assert.deepEqual(sent[2]?.body?.proposal?.body, {
    context: "ctx.target",
    serverRef: "importedMcp",
    tool: "world.read"
  });
});

test("mcp-authoring proposal targets lower server refs before authority checks", async () => {
  const world = createWorld();
  await applyWitnessDocsWithRuntimePlugins(world, parseWitnessToml(`
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

[[mcpServer]]
actor = "system"
id = "source_mcp"
serverRunner = "source_server"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceMcp"
target = "source_mcp"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceMcp"
target = "source_mcp"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceMcp"
name = "importedMcp"
  `), {
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.mcp-authoring"]
  });
  const projectionContext = createModuleProjectorContext(mcpModuleProjectors, {
    owner: "plugins/mcp-authoring/mcp-authoring.test.js"
  });
  const removeProjectionContext = world._pushProjectionContext(projectionContext);

  try {
    const seenTargets = [];
    const result = executeMcpAuthoringProposalTarget({
      world,
      actor: "aaron",
      backendHost: "backendHost",
      proposal: { targetProcess: "mcpTool.install" },
      body: {
        context: "ctx.target",
        serverRef: "importedMcp",
        tool: "world.read"
      },
      mcpToolNames: () => ["world.read"],
      ensureContextAuthority: () => ({ ok: true }),
      ensureTargetAuthority: (_actor, target) => {
        seenTargets.push(target);
        return { ok: true };
      }
    });

    assert.deepEqual(seenTargets, ["source_mcp"]);
    assert.equal(result?.ok, true);
  } finally {
    removeProjectionContext();
  }
});

test("mcp-authoring proposal targets lower serverRunner refs before authority checks on mcpServer.define", async () => {
  const world = createWorld();
  await applyWitnessDocsWithRuntimePlugins(world, parseWitnessToml(`
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
  `), {
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.mcp-authoring"]
  });

  const seenTargets = [];
  const result = executeMcpAuthoringProposalTarget({
    world,
    actor: "aaron",
    backendHost: "backendHost",
    proposal: { targetProcess: "mcpServer.define" },
    body: {
      context: "ctx.target",
      id: "shared_mcp",
      label: "Shared MCP",
      serverRunnerRef: "importedRunner",
      transportsJson: JSON.stringify(["http"])
    },
    mcpToolNames: () => ["world.read"],
    ensureContextAuthority: () => ({ ok: true }),
    ensureTargetAuthority: (_actor, target) => {
      seenTargets.push(target);
      return { ok: true };
    }
  });

  assert.deepEqual(seenTargets, ["source_server"]);
  assert.equal(result?.ok, true);
});
