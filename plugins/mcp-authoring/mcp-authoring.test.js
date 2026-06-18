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
