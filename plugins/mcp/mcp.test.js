import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld, createThing, relation } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { bindContextName, moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { bundleId, handlerCatalog, providers, routes } from "./runtime.js";
import { createMcpBundleSupportServices } from "./mcp-support-services.js";
import { MCP_PROTOCOL_VERSION, executeMcpTool, listSupportedMcpTools, mcpToolNames, resolveMcpToolScope } from "./mcp-tools.js";
import {
  createHandlers as createPlatformHandlers,
  handlerCatalog as platformHandlerCatalog,
  providers as platformProviders,
  routes as platformRoutes
} from "../platform/runtime.js";

function buildRequestUrl(path, query = {}) {
  const url = new URL(`http://localhost${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null) continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function normalizePlatformParity(value) {
  if (Array.isArray(value)) return value.map(normalizePlatformParity);
  if (!value || typeof value !== "object") return value;
  const normalized = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      key === "witness"
      || key === "startWitness"
      || key === "finishWitness"
      || key === "summaries"
      || key === "createdAt"
      || key === "updatedAt"
      || key === "capturedAt"
      || key === "producedAt"
      || key === "startedAt"
      || key === "finishedAt"
      || key === "latestActivityAt"
    ) {
      continue;
    }
    normalized[key] = normalizePlatformParity(entry);
  }
  return normalized;
}

function createPlatformParityHarness({
  world = createWorld(),
  appContext = null
} = {}) {
  const handlers = createPlatformHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async req => req.body,
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" }
    },
    platformTestRunner: async ({ command, timeoutMs }) => ({
      startedAt: "2026-06-18T00:00:00.000Z",
      finishedAt: "2026-06-18T00:00:01.000Z",
      durationMs: 1000,
      exitCode: 0,
      signal: null,
      status: "passed",
      stdout: `TAP version 13\n1..1\nok 1 - ran ${command}\n`,
      stderr: `<?xml version="1.0" encoding="UTF-8"?><testsuite name="platform" tests="1" failures="0" errors="0" skipped="0"></testsuite>`,
      timedOut: false,
      error: null,
      timeoutMs
    }),
    sendGateFailure: (res, gate) => {
      res.status = gate.status;
      res.body = { error: gate.reason };
    },
    send: (res, status, contentType, body) => {
      res.status = status;
      res.body = body;
      res.contentType = contentType;
    },
    sendJson: (res, status, body) => {
      res.status = status;
      res.body = body;
      res.contentType = "application/json";
    }
  });
  const resolvedAppContext = appContext ?? {
    runtimeProfile: "full",
    project: projector => world.project(projector)
  };
  return {
    world,
    async callHandler(request) {
      const res = {};
      await handlers[request.handler]({
        req: {
          body: request.body ?? {},
          headers: request.headers ?? {},
          on: () => {}
        },
        res,
        params: request.params ?? {},
        requestUrl: buildRequestUrl(request.path, request.query ?? {}),
        requestActor: "aaron",
        requestSession: { id: "session.platform" },
        appContext: resolvedAppContext
      });
      return {
        status: res.status ?? 500,
        body: res.body,
        contentType: res.contentType ?? "application/json",
        buffer: Buffer.from(typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? {}))
      };
    }
  };
}

test("mcp plugin exposes MCP HTTP route ownership", () => {
  assert.equal(bundleId, "bundle-mcp");
  assert.equal(handlerCatalog.dispatchHandlers.includes("mcp.http"), true);
  assert.equal(routes.some(route => route.handler === "mcp.http"), true);
});

test("mcp plugin owns protocol constants and supported tool catalog", () => {
  assert.equal(MCP_PROTOCOL_VERSION, "2025-06-18");
  const toolNames = mcpToolNames();
  assert.equal(toolNames.includes("world.read"), true);
  assert.equal(toolNames.includes("package.bundle"), true);
  assert.equal(toolNames.includes("authoring.write"), true);
  assert.equal(toolNames.includes("platform.read"), true);
  assert.equal(toolNames.includes("platform.docs"), true);
  assert.equal(toolNames.includes("platform.roadmap"), true);
  assert.equal(toolNames.includes("platform.telemetry"), true);
  // First-class documentation MCP tools
  assert.equal(toolNames.includes("docs.list"), true);
  assert.equal(toolNames.includes("docs.read"), true);
  assert.equal(toolNames.includes("docs.search"), true);
  assert.equal(toolNames.includes("docs.pack"), true);
  assert.equal(toolNames.includes("platform.branch"), true);
  assert.equal(toolNames.includes("platform.proposal"), true);
  assert.equal(toolNames.includes("platform.changeSet"), true);
  assert.equal(toolNames.includes("platform.test"), true);
  assert.equal(toolNames.includes("db.sql"), true);
  assert.equal(listSupportedMcpTools().every(tool => toolNames.includes(tool.name)), true);
  assert.deepEqual(resolveMcpToolScope("world.read", { view: "processRun", runId: "run-1" }), {
    contextIds: [],
    targetIds: ["run-1"]
  });
  assert.deepEqual(resolveMcpToolScope("world.read", { view: "packageCoexistence", id: "package.plugin.inspect" }), {
    contextIds: [],
    targetIds: ["package.plugin.inspect"]
  });
  assert.deepEqual(resolveMcpToolScope("world.read", { view: "packageApplyPreview", id: "packageRevision.plugin.inspect.v2" }), {
    contextIds: [],
    targetIds: ["packageRevision.plugin.inspect.v2"]
  });
  assert.deepEqual(resolveMcpToolScope("world.read", { view: "capabilityLegacyMigration", id: "cap.search" }), {
    contextIds: [],
    targetIds: ["cap.search"]
  });
  const worldRead = listSupportedMcpTools().find(tool => tool.name === "world.read");
  const packageBundle = listSupportedMcpTools().find(tool => tool.name === "package.bundle");
  const authoringWrite = listSupportedMcpTools().find(tool => tool.name === "authoring.write");
  const platformRead = listSupportedMcpTools().find(tool => tool.name === "platform.read");
  const platformDocs = listSupportedMcpTools().find(tool => tool.name === "platform.docs");
  const platformRoadmap = listSupportedMcpTools().find(tool => tool.name === "platform.roadmap");
  const platformTelemetry = listSupportedMcpTools().find(tool => tool.name === "platform.telemetry");
  const platformBranch = listSupportedMcpTools().find(tool => tool.name === "platform.branch");
  const platformProposal = listSupportedMcpTools().find(tool => tool.name === "platform.proposal");
  const platformChangeSet = listSupportedMcpTools().find(tool => tool.name === "platform.changeSet");
  const platformTest = listSupportedMcpTools().find(tool => tool.name === "platform.test");
  assert.equal(worldRead.inputSchema.properties.view.enum.includes("authoringMatrix"), true);
  assert.equal(worldRead.inputSchema.properties.view.enum.includes("contextNaming"), true);
  assert.equal(worldRead.inputSchema.properties.view.enum.includes("packageCoexistence"), true);
  assert.equal(worldRead.inputSchema.properties.view.enum.includes("packageConvergence"), true);
  assert.equal(worldRead.inputSchema.properties.view.enum.includes("packageApplyPreview"), true);
  assert.equal(worldRead.inputSchema.properties.view.enum.includes("capabilityLegacyMigration"), true);
  assert.deepEqual(packageBundle.inputSchema.properties.operation.enum, ["preview", "previewApply"]);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("docs"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("roadmap"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("telemetry"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("bridges"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("semantics"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("governance"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("gaps"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("proposals"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("branches"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("testGates"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("testRedGreen"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("testRuns"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("contextNaming"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("packageCoexistence"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("packageConvergence"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("packageApplyPreview"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("candidateSnapshots"), true);
  assert.equal(platformRead.inputSchema.properties.view.enum.includes("runtimeRevisions"), true);
  assert.deepEqual(platformDocs.inputSchema.properties.operation.enum, ["list", "read"]);
  assert.deepEqual(platformRoadmap.inputSchema.properties.operation.enum, ["list", "read"]);
  assert.deepEqual(platformTelemetry.inputSchema.properties.operation.enum, ["list", "read"]);
  assert.deepEqual(platformBranch.inputSchema.properties.operation.enum, ["list", "read", "create"]);
  assert.equal(Object.prototype.hasOwnProperty.call(platformBranch.inputSchema.properties, "parentBranchId"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(platformBranch.inputSchema.properties, "epic"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(platformBranch.inputSchema.properties, "feature"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(platformBranch.inputSchema.properties, "defect"), true);
  assert.equal(platformProposal.inputSchema.properties.action.enum.includes("runtimePlugin.install"), true);
  assert.equal(platformProposal.inputSchema.properties.action.enum.includes("changeSet.create"), true);
  assert.equal(platformProposal.inputSchema.properties.action.enum.includes("changeSet.apply"), true);
  assert.equal(platformProposal.inputSchema.properties.action.enum.includes("branch.create"), true);
  assert.deepEqual(platformProposal.inputSchema.properties.operation.enum, ["create", "approve", "reject"]);
  assert.deepEqual(platformChangeSet.inputSchema.properties.operation.enum, ["list", "read", "create", "edit", "removeEdit", "validate", "apply", "reject", "abandon"]);
  assert.deepEqual(platformTest.inputSchema.properties.operation.enum, ["list", "read", "run", "runSelected"]);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("process.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("type.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("projection.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("message.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("package.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("packageRevision.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("packageRevision.publish"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("packagePatch.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("packageNamespace.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("packageDependency.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("packageTransformer.create"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("capability.migrateLegacy"), true);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("frontendProgram.create"), false);
  assert.equal(authoringWrite.inputSchema.properties.action.enum.includes("widget.create"), false);
});

test("mcp world.read exposes legacy capability migration as projected first-class state", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.shared"

[[capability]]
actor = "system"
id = "cap.search"
label = "Search"
provenance = { source = "dsl.context.capabilities" }
placement = ["context"]
`);
  world.emit({
    process: "legacy.contextCapability",
    actor: "system",
    claims: [relation("ctx.shared", "contextCapability", "cap.search")],
    body: {}
  });
  world.emit({
    process: "legacy.contextCapability",
    actor: "system",
    claims: [relation("ctx.shared", "contextCapability", "cap.legacyOnly")],
    body: {}
  });

  const result = await executeMcpTool("world.read", {
    args: { view: "capabilityLegacyMigration" },
    appContext: {
      project: projector => world.project(projector)
    },
    callHandler: async () => {
      throw new Error("capabilityLegacyMigration read should not call HTTP handlers");
    }
  });

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.legacyCapabilityCompatibilityMode.mode, "bridge-active");
  assert.equal(result.structuredContent.legacyCapabilityCompatibilityMode.pendingCount, 4);
  assert.equal(result.structuredContent.legacyCapabilityMigration.pending.some(row =>
    row.action === "definition.update"
    && row.capabilityId === "cap.search"
  ), true);
  assert.equal(result.structuredContent.legacyCapabilityMigration.pending.some(row =>
    row.action === "definition.create"
    && row.capabilityId === "cap.legacyOnly"
  ), true);
});

test("mcp package.bundle previews canonical revision bundle from projected authored package state", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.shared"

[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"
exports = [{ id = "surface.world" }]

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"
path = "plugins/inspect/plugin.json"
operation = "replace"
sourceLanguage = "json"
body = { id = "plugin.inspect" }

[[packageNamespace]]
actor = "system"
context = "ctx.shared"
name = "inspectLocal"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageDependency]]
actor = "system"
sourcePackage = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
targetKind = "capability"
targetId = "dom.render"
`);

  const result = await executeMcpTool("package.bundle", {
    args: {
      operation: "preview",
      revisionId: "packageRevision.plugin.inspect.v1"
    },
    appContext: {
      project: projector => world.project(projector)
    },
    callHandler: async () => {
      throw new Error("package.bundle preview should not call HTTP handlers");
    }
  });

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.revisionRecord.id, "packageRevision.plugin.inspect.v1");
  assert.equal(result.structuredContent.packageRecord.id, "package.plugin.inspect");
  assert.equal(result.structuredContent.namespaces.length, 1);
  assert.equal(result.structuredContent.dependencies.length, 1);
  assert.deepEqual(result.structuredContent.files.map(file => file.path), [
    "package.wtoml",
    "revision.wtoml",
    "patches/0001-plugins-inspect-plugin-json.wtoml",
    "namespaces/0001-ctx-shared-inspectlocal.wtoml",
    "dependencies/0001-capability-dom-render.wtoml"
  ]);
});

test("mcp package.bundle includes namespace-scoped transformers that touch the selected revision namespace", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.shared:inspectLocal"
context = "ctx.shared"
name = "inspectLocal"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageTransformer]]
actor = "system"
id = "packageTransformer.inspect.namespace-only"
package = "package.plugin.inspect"
sourceNamespace = "packageNamespace:ctx.shared:inspectLocal"
targetNamespace = "packageNamespace:ctx.shared:inspectLocal"
strategy = "namespace-alias"
status = "active"
mappings = [{ kind = "alias", from = "ctx.shared:inspectLocal", to = "ctx.shared:inspectLocal" }]

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"
transformer = "packageTransformer.inspect.namespace-only"
path = "plugins/inspect/runtime.js"
operation = "replace"
sourceLanguage = "js"
body = { export = "namespaced" }
`);

  const result = await executeMcpTool("package.bundle", {
    args: {
      operation: "preview",
      revisionId: "packageRevision.plugin.inspect.v1"
    },
    appContext: {
      project: projector => world.project(projector)
    },
    callHandler: async () => {
      throw new Error("package.bundle preview should not call HTTP handlers");
    }
  });

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.transformers.length, 1);
  assert.equal(result.structuredContent.transformers[0].id, "packageTransformer.inspect.namespace-only");
  assert.equal(result.structuredContent.files.some(file => file.path === "transformers/0001-packagetransformer-inspect-namespace-only.wtoml"), true);
});

test("mcp package.bundle includes namespace docs referenced by cross-revision transformers", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v2"
package = "package.plugin.inspect"
version = "0.2.0"

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.alpha:inspectA"
context = "ctx.alpha"
name = "inspectA"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.beta:inspectB"
context = "ctx.beta"
name = "inspectB"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"

[[packageTransformer]]
actor = "system"
id = "packageTransformer.inspect.v1-to-v2"
package = "package.plugin.inspect"
sourceNamespace = "packageNamespace:ctx.alpha:inspectA"
targetNamespace = "packageNamespace:ctx.beta:inspectB"
strategy = "follow-up-revision"
status = "active"
mappings = [{ kind = "alias", from = "ctx.alpha:inspectA", to = "ctx.beta:inspectB" }]

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"
transformer = "packageTransformer.inspect.v1-to-v2"
path = "plugins/inspect/runtime.js"
operation = "replace"
sourceLanguage = "js"
body = { export = "migrated" }
`);

  const result = await executeMcpTool("package.bundle", {
    args: {
      operation: "preview",
      revisionId: "packageRevision.plugin.inspect.v2"
    },
    appContext: {
      project: projector => world.project(projector)
    },
    callHandler: async () => {
      throw new Error("package.bundle preview should not call HTTP handlers");
    }
  });

  assert.equal(result.isError, false);
  assert.deepEqual(
    result.structuredContent.namespaces.map(row => row.id),
    [
      "packageNamespace:ctx.alpha:inspectA",
      "packageNamespace:ctx.beta:inspectB"
    ]
  );
  assert.equal(result.structuredContent.files.some(file => file.path === "namespaces/0001-ctx-alpha-inspecta.wtoml"), true);
  assert.equal(result.structuredContent.files.some(file => file.path === "namespaces/0002-ctx-beta-inspectb.wtoml"), true);
});

test("mcp package.bundle previewApply exposes authored coexistence and convergence impact for a revision", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "published"
manifest = { pluginId = "plugin.inspect" }

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v2"
package = "package.plugin.inspect"
version = "0.2.0"
status = "review"
manifest = { pluginId = "plugin.inspect" }

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.alpha:inspectA"
context = "ctx.alpha"
name = "inspectA"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.beta:inspectB"
context = "ctx.beta"
name = "inspectB"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"

[[packageTransformer]]
actor = "system"
id = "packageTransformer.inspect.v1-to-v2"
package = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
sourceNamespace = "packageNamespace:ctx.alpha:inspectA"
targetRevision = "packageRevision.plugin.inspect.v2"
targetNamespace = "packageNamespace:ctx.beta:inspectB"
strategy = "follow-up-revision"
status = "active"
remainingGlue = ["rename remaining runtimePlugin installs"]

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"
transformer = "packageTransformer.inspect.v1-to-v2"
path = "plugins/inspect/runtime.js"
operation = "replace"
sourceLanguage = "js"
body = { export = "migrated" }
`);

  const result = await executeMcpTool("package.bundle", {
    args: {
      operation: "previewApply",
      revisionId: "packageRevision.plugin.inspect.v2"
    },
    appContext: {
      project: projector => world.project(projector)
    },
    callHandler: async () => {
      throw new Error("package.bundle previewApply should not call HTTP handlers");
    }
  });

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.kind, "packageRevisionApplyPreview");
  assert.equal(result.structuredContent.status, "glue-required");
  assert.equal(result.structuredContent.bundle.revisionRecord.id, "packageRevision.plugin.inspect.v2");
  assert.deepEqual(
    result.structuredContent.selectedNamespaces.map(row => row.id),
    ["packageNamespace:ctx.beta:inspectB"]
  );
  assert.deepEqual(
    result.structuredContent.relatedTransformers.map(row => row.id),
    ["packageTransformer.inspect.v1-to-v2"]
  );
  assert.deepEqual(result.structuredContent.remainingGlue, [{
    kind: "explicit-glue",
    transformerId: "packageTransformer.inspect.v1-to-v2",
    message: "rename remaining runtimePlugin installs"
  }]);
});

test("mcp world.read exposes package coexistence projection from projected authored package state", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "published"
manifest = { pluginId = "plugin.inspect" }

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v2"
package = "package.plugin.inspect"
version = "0.2.0"
status = "review"
manifest = { pluginId = "plugin.inspect" }

[[packageNamespace]]
actor = "system"
context = "ctx.alpha"
name = "inspectA"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageNamespace]]
actor = "system"
context = "ctx.beta"
name = "inspectB"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"
`);

  const result = await executeMcpTool("world.read", {
    args: {
      view: "packageCoexistence",
      id: "package.plugin.inspect"
    },
    appContext: {
      project: projector => world.project(projector)
    },
    callHandler: async () => {
      throw new Error("packageCoexistence projection should not call HTTP handlers");
    }
  });

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.packageCoexistence.length, 1);
  assert.equal(result.structuredContent.packageCoexistence[0].packageId, "package.plugin.inspect");
  assert.deepEqual(result.structuredContent.packageCoexistence[0].selectedRevisionIds, [
    "packageRevision.plugin.inspect.v1",
    "packageRevision.plugin.inspect.v2"
  ]);
});

test("mcp world.read exposes package convergence projection from projected authored package state", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "published"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v2"
package = "package.plugin.inspect"
version = "0.2.0"
status = "review"

[[packageNamespace]]
actor = "system"
context = "ctx.alpha"
name = "inspectA"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageNamespace]]
actor = "system"
context = "ctx.beta"
name = "inspectB"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"

[[packageTransformer]]
actor = "system"
id = "packageTransformer.inspect.v1-to-v2"
package = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
targetRevision = "packageRevision.plugin.inspect.v2"
remainingGlue = ["rename remaining runtimePlugin installs"]

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"
transformer = "packageTransformer.inspect.v1-to-v2"
path = "plugins/inspect/runtime.js"
operation = "replace"
sourceLanguage = "js"
body = { export = "migrated" }
`);

  const result = await executeMcpTool("world.read", {
    args: {
      view: "packageConvergence",
      id: "package.plugin.inspect"
    },
    appContext: {
      project: projector => world.project(projector)
    },
    callHandler: async () => {
      throw new Error("packageConvergence projection should not call HTTP handlers");
    }
  });

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.packageConvergence.length, 1);
  assert.equal(result.structuredContent.packageConvergence[0].status, "glue-required");
  assert.deepEqual(result.structuredContent.packageConvergence[0].transformerIds, ["packageTransformer.inspect.v1-to-v2"]);
});

test("mcp world.read exposes package apply preview projection from projected authored package state", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "published"
manifest = { pluginId = "plugin.inspect" }

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v2"
package = "package.plugin.inspect"
version = "0.2.0"
status = "review"
manifest = { pluginId = "plugin.inspect" }

[[packageNamespace]]
actor = "system"
context = "ctx.alpha"
name = "inspectA"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageNamespace]]
actor = "system"
context = "ctx.beta"
name = "inspectB"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"

[[packageTransformer]]
actor = "system"
id = "packageTransformer.inspect.v1-to-v2"
package = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
targetRevision = "packageRevision.plugin.inspect.v2"
remainingGlue = ["rename remaining runtimePlugin installs"]

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"
transformer = "packageTransformer.inspect.v1-to-v2"
path = "plugins/inspect/runtime.js"
operation = "replace"
sourceLanguage = "js"
body = { export = "migrated" }
`);

  const result = await executeMcpTool("world.read", {
    args: {
      view: "packageApplyPreview",
      id: "packageRevision.plugin.inspect.v2"
    },
    appContext: {
      project: projector => world.project(projector)
    },
    callHandler: async () => {
      throw new Error("packageApplyPreview projection should not call HTTP handlers");
    }
  });

  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.packageApplyPreview.length, 1);
  assert.equal(result.structuredContent.packageApplyPreview[0].status, "glue-required");
  assert.equal(result.structuredContent.packageApplyPreview[0].bundle.revisionRecord.id, "packageRevision.plugin.inspect.v2");
});

test("mcp world.read exposes contextual naming explanations from projected world state", async () => {
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

[[context]]
actor = "system"
id = "ctx.hidden"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx.source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[serverRunner]]
actor = "system"
id = "hidden_server"
context = "ctx.hidden"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[serverRunner]]
actor = "system"
id = "local_server"
context = "ctx.target"
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
  bindContextName(world, {
    actor: "system",
    context: "ctx.target",
    name: "importedRunner",
    target: "local_server"
  });

  const result = await executeMcpTool("world.read", {
    args: {
      view: "contextNaming",
      context: "ctx.target",
      name: "importedRunner",
      target: "hidden_server"
    },
    appContext: {
      project: projector => world.project(projector)
    },
    callHandler: async () => {
      throw new Error("contextNaming projection should not call HTTP handlers");
    }
  });

  assert.equal(result.isError, false);
  assert.deepEqual(result.structuredContent.contextNaming.canonicalIdPolicyClasses, [
    "same-context-convenience",
    "imported-target-reference",
    "legacy-only-path"
  ]);
  assert.equal(result.structuredContent.contextNaming.contextScopes.some(row =>
    row.context === "ctx.target"
    && row.name === "importedRunner"
    && row.target === "source_server"
    && row.sourceKind === "import"
  ), true);
  assert.equal(result.structuredContent.contextNaming.contextNameConflicts.length, 1);
  assert.equal(result.structuredContent.contextNaming.nameExplanation.ok, false);
  assert.equal(result.structuredContent.contextNaming.nameExplanation.resolution, "ambiguous");
  assert.equal(result.structuredContent.contextNaming.canonicalIdPolicy.ok, false);
  assert.equal(result.structuredContent.contextNaming.targetVisibility.ok, false);
  assert.equal(result.structuredContent.contextNaming.targetVisibility.visibility, "hidden");
});

test("mcp authoring.write exposes authored package actions and package-aware scope", () => {
  assert.deepEqual(resolveMcpToolScope("authoring.write", {
    action: "packageDependency.create",
    body: {
      context: "ctx.shared",
      sourcePackage: "package.plugin.inspect",
      sourceRevision: "packageRevision.plugin.inspect.v1",
      package: "package.plugin.inspect",
      revision: "packageRevision.plugin.inspect.v1",
      id: "packageDependency:packageRevision.plugin.inspect.v1:capability:dom.render"
    }
  }), {
    contextIds: ["ctx.shared"],
    targetIds: [
      "packageDependency:packageRevision.plugin.inspect.v1:capability:dom.render",
      "package.plugin.inspect",
      "packageRevision.plugin.inspect.v1"
    ]
  });
  assert.deepEqual(resolveMcpToolScope("authoring.write", {
    action: "packageTransformer.create",
    body: {
      package: "package.plugin.inspect",
      sourceRevision: "packageRevision.plugin.inspect.v1",
      targetRevision: "packageRevision.plugin.inspect.v2",
      sourceNamespace: "packageNamespace:ctx.alpha:inspectA",
      targetNamespace: "packageNamespace:ctx.beta:inspectB"
    }
  }), {
    contextIds: [],
    targetIds: [
      "package.plugin.inspect",
      "packageRevision.plugin.inspect.v1",
      "packageRevision.plugin.inspect.v2",
      "packageNamespace:ctx.alpha:inspectA",
      "packageNamespace:ctx.beta:inspectB"
    ]
  });
  assert.deepEqual(resolveMcpToolScope("authoring.write", {
    action: "capability.migrateLegacy",
    body: {}
  }), {
    contextIds: [],
    targetIds: []
  });
});

test("mcp authoring.write routes package authorship actions through shared package handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: 201, body: { ok: true, handler: request.handler, body: request.body } };
  };

  const cases = [
    {
      action: "package.create",
      path: "/api/packages",
      handler: "package.create",
      body: {
        id: "package.plugin.inspect",
        context: "ctx.shared",
        label: "Inspect",
        packageKind: "plugin"
      }
    },
    {
      action: "packageRevision.create",
      path: "/api/package-revisions",
      handler: "packageRevision.create",
      body: {
        id: "packageRevision.plugin.inspect.v1",
        package: "package.plugin.inspect",
        version: "0.1.0"
      }
    },
    {
      action: "packageRevision.publish",
      path: "/api/package-revisions/packageRevision.plugin.inspect.v1/publish",
      handler: "packageRevision.publish",
      body: {
        id: "packageRevision.plugin.inspect.v1",
        emittedBundleHash: "bundle123",
        manifest: { pluginId: "plugin.inspect" }
      }
    },
    {
      action: "packagePatch.create",
      path: "/api/package-patches",
      handler: "packagePatch.create",
      body: {
        package: "package.plugin.inspect",
        revision: "packageRevision.plugin.inspect.v1",
        path: "plugins/inspect/plugin.json",
        operation: "replace",
        sourceLanguage: "json",
        body: { id: "plugin.inspect" }
      }
    },
    {
      action: "packageNamespace.create",
      path: "/api/package-namespaces",
      handler: "packageNamespace.create",
      body: {
        context: "ctx.shared",
        name: "inspectLocal",
        package: "package.plugin.inspect",
        revision: "packageRevision.plugin.inspect.v1"
      }
    },
    {
      action: "packageDependency.create",
      path: "/api/package-dependencies",
      handler: "packageDependency.create",
      body: {
        sourcePackage: "package.plugin.inspect",
        sourceRevision: "packageRevision.plugin.inspect.v1",
        targetKind: "capability",
        targetId: "dom.render"
      }
    },
    {
      action: "packageTransformer.create",
      path: "/api/package-transformers",
      handler: "packageTransformer.create",
      body: {
        package: "package.plugin.inspect",
        sourceRevision: "packageRevision.plugin.inspect.v1",
        targetRevision: "packageRevision.plugin.inspect.v2",
        sourceNamespace: "packageNamespace:ctx.alpha:inspectA",
        targetNamespace: "packageNamespace:ctx.beta:inspectB",
        remainingGlue: ["rename remaining runtimePlugin installs"]
      }
    },
    {
      action: "capability.migrateLegacy",
      path: "/api/capability-migrations/legacy",
      handler: "capability.migrateLegacy",
      body: {}
    }
  ];

  for (const testCase of cases) {
    const result = await executeMcpTool("authoring.write", {
      args: {
        action: testCase.action,
        body: testCase.body
      },
      callHandler
    });
    assert.equal(result.isError, false, `${testCase.action} should succeed`);
    const call = calls.at(-1);
    assert.equal(call.handler, testCase.handler);
    assert.equal(call.method, "POST");
    assert.equal(call.path, testCase.path);
    assert.deepEqual(call.body, testCase.body);
  }
});

test("mcp plugin owns origin, principal, and scope support services", () => {
  const projected = {
    mcpServerIndex: { byId: { "mcp.demo": { id: "mcp.demo" } } },
    mcpToolInstalls: [{ server: "mcp.demo", tool: "world.read", actingMode: "delegated", scopeContexts: ["ctx.docs"], scopeTargets: [] }],
    modules: new Map([["ctx.docs", "context"]]),
    objectContexts: new Map(),
    backendCapabilities: new Set(["db.sql"])
  };
  const world = {
    project(projector) {
      if (projector === moduleProjectors.mcpServerIndex) return projected.mcpServerIndex;
      if (projector === moduleProjectors.mcpToolInstalls) return projected.mcpToolInstalls;
      if (projector === moduleProjectors.modules) return projected.modules;
      if (projector === moduleProjectors.objectContexts) return projected.objectContexts;
      return null;
    }
  };
  const services = createMcpBundleSupportServices({
    world,
    backendHost: {},
    mcpInternalToken: "secret",
    runtimeConfigLookup: (runtimeConfig, key) => runtimeConfig?.[key],
    resolveMcpToolScope: () => ({ contextIds: ["ctx.docs"], targetIds: [] }),
    hostCapabilities: () => projected.backendCapabilities,
    headerValue: value => String(value || "")
  });

  assert.equal(services.currentMcpServerIndex().byId["mcp.demo"].id, "mcp.demo");
  assert.deepEqual(services.currentMcpToolInstalls(), projected.mcpToolInstalls);
  assert.equal(services.mcpToolAvailable("db.sql"), true);
  assert.equal(services.mcpToolAvailable("storage.blob"), false);
  assert.equal(services.mcpToolAvailable("platform.read"), false);
  assert.equal(services.mcpToolAvailable("platform.docs"), false);
  assert.equal(services.mcpToolAvailable("platform.roadmap"), false);
  assert.equal(services.mcpToolAvailable("platform.telemetry"), false);
  assert.equal(services.mcpToolAvailable("platform.changeSet"), false);
  assert.equal(services.mcpToolAvailable("platform.test"), false);
  assert.equal(services.mcpToolAvailable("docs.list"), false);
  assert.equal(services.mcpToolAvailable("docs.read"), false);
  assert.equal(services.mcpToolAvailable("docs.search"), false);
  assert.equal(services.mcpToolAvailable("docs.pack"), false);
  projected.backendCapabilities.add("platform.self");
  assert.equal(services.mcpToolAvailable("platform.read"), true);
  assert.equal(services.mcpToolAvailable("platform.docs"), true);
  assert.equal(services.mcpToolAvailable("platform.roadmap"), true);
  assert.equal(services.mcpToolAvailable("platform.telemetry"), true);
  assert.equal(services.mcpToolAvailable("platform.changeSet"), true);
  assert.equal(services.mcpToolAvailable("platform.test"), true);
  assert.equal(services.mcpToolAvailable("docs.list"), true);
  assert.equal(services.mcpToolAvailable("docs.read"), true);
  assert.equal(services.mcpToolAvailable("docs.search"), true);
  assert.equal(services.mcpToolAvailable("docs.pack"), true);
  assert.deepEqual(
    services.validateMcpOrigin({ headers: { origin: "http://localhost:3000", host: "127.0.0.1:8787" } }),
    { ok: true }
  );
  assert.deepEqual(
    services.resolveMcpPrincipal({
      req: { headers: { authorization: "Bearer svc-token" } },
      requestActor: null,
      requestIdentity: null,
      requestSession: null,
      mcpServer: { id: "mcp.demo", serviceIdentity: "service.actor" },
      appContext: { runtimeConfig: { "mcp.mcp.demo.token": "svc-token" } }
    }),
    {
      ok: true,
      actingMode: "service",
      actor: "service.actor",
      identity: null,
      authenticatedIdentity: null,
      authenticatedActor: "service.actor",
      effectiveIdentity: null,
      effectiveActor: "service.actor",
      authorityMode: "service",
      assumptionGrantId: null,
      transport: "http"
    }
  );
  assert.equal(services.mcpScopeAllows(projected.mcpToolInstalls[0], {}, {}).ok, true);
});

test("platform MCP proposal tool routes through platform proposal handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: request.handler === "platform.proposal.create" ? 201 : 200, body: { ok: true, handler: request.handler } };
  };

  const created = await executeMcpTool("platform.proposal", {
    args: {
      action: "runtimePlugin.install",
      id: "proposal.platform.install",
      body: { serverRunner: "runner.platform", plugin: "plugin.platform" },
      reason: "Install platform"
    },
    callHandler
  });
  assert.equal(created.isError, false);
  assert.equal(calls.at(-1).handler, "platform.proposal.create");
  assert.equal(calls.at(-1).path, "/api/platform-proposals");
  assert.equal(calls.at(-1).body.action, "runtimePlugin.install");

  const approved = await executeMcpTool("platform.proposal", {
    args: { operation: "approve", proposalId: "proposal.platform.install" },
    callHandler
  });
  assert.equal(approved.isError, false);
  assert.equal(calls.at(-1).handler, "platform.proposal.approve");
  assert.equal(calls.at(-1).params.id, "proposal.platform.install");

  const rejected = await executeMcpTool("platform.proposal", {
    args: { operation: "reject", proposalId: "proposal.platform.install", reason: "Rejected in parity test" },
    callHandler
  });
  assert.equal(rejected.isError, false);
  assert.equal(calls.at(-1).handler, "platform.proposal.reject");
  assert.equal(calls.at(-1).params.id, "proposal.platform.install");
  assert.equal(calls.at(-1).body.reason, "Rejected in parity test");
});

test("current platform console mutation surfaces have MCP tool equivalents", () => {
  const tools = listSupportedMcpTools();
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]));
  const proposalOperations = byName["platform.proposal"].inputSchema.properties.operation.enum;
  const branchOperations = byName["platform.branch"].inputSchema.properties.operation.enum;
  const changeSetOperations = byName["platform.changeSet"].inputSchema.properties.operation.enum;
  const testOperations = byName["platform.test"].inputSchema.properties.operation.enum;

  assert.deepEqual(proposalOperations, ["create", "approve", "reject"]);
  assert.deepEqual(branchOperations, ["list", "read", "create"]);
  assert.equal(changeSetOperations.includes("create"), true);
  assert.equal(changeSetOperations.includes("edit"), true);
  assert.equal(changeSetOperations.includes("validate"), true);
  assert.equal(changeSetOperations.includes("apply"), true);
  assert.equal(changeSetOperations.includes("reject"), true);
  assert.equal(changeSetOperations.includes("abandon"), true);
  assert.equal(testOperations.includes("run"), true);
  assert.equal(testOperations.includes("runSelected"), true);
});

test("platform MCP mutation tools only target human-exposed platform handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: request.method === "POST" ? 200 : 200, body: { ok: true, handler: request.handler } };
  };
  const cases = [
    {
      tool: "platform.proposal",
      args: {
        operation: "create",
        action: "branch.create",
        id: "proposal.platform.guard.create",
        body: { id: "branch.guard.create", title: "Guard branch" }
      }
    },
    {
      tool: "platform.proposal",
      args: {
        operation: "approve",
        proposalId: "proposal.platform.guard.create"
      }
    },
    {
      tool: "platform.proposal",
      args: {
        operation: "reject",
        proposalId: "proposal.platform.guard.create",
        reason: "guard"
      }
    },
    {
      tool: "platform.branch",
      args: {
        operation: "create",
        id: "branch.guard.create",
        title: "Guard branch"
      }
    },
    {
      tool: "platform.changeSet",
      args: {
        operation: "create",
        id: "changeSet:guard",
        branchId: "branch.guard.create"
      }
    },
    {
      tool: "platform.changeSet",
      args: {
        operation: "edit",
        changeSetId: "changeSet:guard",
        edits: [{ path: "plugins/platform/platform-console.rvm", content: "surface PlatformConsolePage {}" }]
      }
    },
    {
      tool: "platform.changeSet",
      args: {
        operation: "validate",
        changeSetId: "changeSet:guard"
      }
    },
    {
      tool: "platform.changeSet",
      args: {
        operation: "apply",
        changeSetId: "changeSet:guard"
      }
    },
    {
      tool: "platform.changeSet",
      args: {
        operation: "reject",
        changeSetId: "changeSet:guard",
        reason: "guard"
      }
    },
    {
      tool: "platform.changeSet",
      args: {
        operation: "abandon",
        changeSetId: "changeSet:guard",
        reason: "guard"
      }
    },
    {
      tool: "platform.test",
      args: {
        operation: "run",
        id: "testRun.guard",
        gateId: "gate:plugins/platform/platform.test.js",
        branchId: "branch.guard.create"
      }
    },
    {
      tool: "platform.test",
      args: {
        operation: "runSelected",
        branchId: "branch.guard.create",
        changeSetId: "changeSet:guard"
      }
    }
  ];

  for (const testCase of cases) {
    const result = await executeMcpTool(testCase.tool, {
      args: testCase.args,
      callHandler
    });
    assert.equal(result.isError, false, `${testCase.tool} ${testCase.args.operation} should succeed`);
    const call = calls.at(-1);
    assert.equal(platformHandlerCatalog.dispatchHandlers.includes(call.handler), true, `${call.handler} should be owned by plugin.platform`);
    assert.equal(platformRoutes.some(route => route.handler === call.handler && route.method === call.method), true, `${call.handler} should map to a human-exposed platform route`);
  }
});

test("platform MCP read tool routes runtime revision view through platform model handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: 200, body: { ok: true, handler: request.handler, view: request.query?.view ?? null } };
  };

  const result = await executeMcpTool("platform.read", {
    args: { view: "runtimeRevisions", id: "branch.demo" },
    callHandler
  });
  assert.equal(result.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "runtimeRevisions");
  assert.equal(calls.at(-1).query.id, "branch.demo");

  const testGateResult = await executeMcpTool("platform.read", {
    args: { view: "testGates", id: "branch.demo" },
    callHandler
  });
  assert.equal(testGateResult.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "testGates");
  assert.equal(calls.at(-1).query.id, "branch.demo");

  const testRunResult = await executeMcpTool("platform.read", {
    args: { view: "testRuns", id: "branch.demo" },
    callHandler
  });
  assert.equal(testRunResult.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "testRuns");
  assert.equal(calls.at(-1).query.id, "branch.demo");

  const redGreenResult = await executeMcpTool("platform.read", {
    args: { view: "testRedGreen", id: "branch.demo" },
    callHandler
  });
  assert.equal(redGreenResult.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "testRedGreen");
  assert.equal(calls.at(-1).query.id, "branch.demo");

  const packageCoexistenceResult = await executeMcpTool("platform.read", {
    args: { view: "packageCoexistence", id: "package.plugin.inspect" },
    callHandler
  });
  assert.equal(packageCoexistenceResult.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "packageCoexistence");
  assert.equal(calls.at(-1).query.id, "package.plugin.inspect");

  const contextNamingResult = await executeMcpTool("platform.read", {
    args: { view: "contextNaming", context: "ctx.target", name: "importedRunner", target: "hidden_server" },
    callHandler
  });
  assert.equal(contextNamingResult.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "contextNaming");
  assert.equal(calls.at(-1).query.context, "ctx.target");
  assert.equal(calls.at(-1).query.name, "importedRunner");
  assert.equal(calls.at(-1).query.target, "hidden_server");

  const packageConvergenceResult = await executeMcpTool("platform.read", {
    args: { view: "packageConvergence", id: "package.plugin.inspect" },
    callHandler
  });
  assert.equal(packageConvergenceResult.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "packageConvergence");
  assert.equal(calls.at(-1).query.id, "package.plugin.inspect");

  const packageApplyPreviewResult = await executeMcpTool("platform.read", {
    args: { view: "packageApplyPreview", id: "packageRevision.plugin.inspect.v2" },
    callHandler
  });
  assert.equal(packageApplyPreviewResult.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "packageApplyPreview");
  assert.equal(calls.at(-1).query.id, "packageRevision.plugin.inspect.v2");
});

test("platform MCP read tool routes proposal, branch, change-set, candidate snapshot, telemetry, bridge, semantics, and governance views through platform model handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: 200, body: { ok: true, handler: request.handler, view: request.query?.view ?? null, id: request.query?.id ?? null } };
  };

  for (const view of ["proposals", "branches", "changeSets", "candidateSnapshots", "telemetry", "bridges", "semantics", "governance"]) {
    const result = await executeMcpTool("platform.read", {
      args: { view, id: "branch.demo" },
      callHandler
    });
    assert.equal(result.isError, false);
    assert.equal(calls.at(-1).handler, "platform.model.read");
    assert.equal(calls.at(-1).path, "/api/platform-model");
    assert.equal(calls.at(-1).query.view, view);
    assert.equal(calls.at(-1).query.id, "branch.demo");
  }
});

test("platform MCP docs tool routes docs and roadmap task reads through platform model handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: 200, body: { ok: true, handler: request.handler, view: request.query?.view ?? null, id: request.query?.id ?? null } };
  };

  const listed = await executeMcpTool("platform.docs", {
    args: { operation: "list" },
    callHandler
  });
  assert.equal(listed.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "docs");
  assert.equal(calls.at(-1).query.id, undefined);

  const read = await executeMcpTool("platform.docs", {
    args: { operation: "read", id: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" },
    callHandler
  });
  assert.equal(read.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "docs");
  assert.equal(calls.at(-1).query.id, "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md");

  // First-class new operations and dedicated docs.* tools
  const full = await executeMcpTool("platform.docs", {
    args: { operation: "readFull", id: "docs/intent/01-foundational-philosophy-ontology.md", includeRelations: true },
    callHandler
  });
  assert.equal(full.isError, false);

  const rels = await executeMcpTool("platform.docs", {
    args: { operation: "getRelations", id: "docs/intent/knowledge-relations.wtoml" },
    callHandler
  });
  assert.equal(rels.isError, false);

  const dedicatedList = await executeMcpTool("docs.list", { args: {}, callHandler });
  assert.equal(dedicatedList.isError, false);
  assert.equal(calls.at(-1).query.view, "docs");

  const dedicatedRead = await executeMcpTool("docs.read", {
    args: { id: "docs/intent/PRIMARY-INTENT.md", includeRelations: true },
    callHandler
  });
  assert.equal(dedicatedRead.isError, false);

  const search = await executeMcpTool("docs.search", {
    args: { query: "intent" },
    callHandler
  });
  assert.equal(search.isError, false);

  const pack = await executeMcpTool("docs.pack", {
    args: { id: "docs/intent/01-foundational-philosophy-ontology.md", maxRelations: 5 },
    callHandler
  });
  assert.equal(pack.isError, false);
  // The pack should include packId and summary indicating modeled relations
});

test("platform MCP roadmap tool routes roadmap reads through platform model handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: 200, body: { ok: true, handler: request.handler, view: request.query?.view ?? null, id: request.query?.id ?? null } };
  };

  const listed = await executeMcpTool("platform.roadmap", {
    args: { operation: "list" },
    callHandler
  });
  assert.equal(listed.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "roadmap");
  assert.equal(calls.at(-1).query.id, undefined);

  const read = await executeMcpTool("platform.roadmap", {
    args: { operation: "read", id: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" },
    callHandler
  });
  assert.equal(read.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "roadmap");
  assert.equal(calls.at(-1).query.id, "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md");
});

test("platform MCP telemetry tool routes telemetry reads through platform model handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: 200, body: { ok: true, handler: request.handler, view: request.query?.view ?? null, id: request.query?.id ?? null } };
  };

  const listed = await executeMcpTool("platform.telemetry", {
    args: { operation: "list" },
    callHandler
  });
  assert.equal(listed.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "telemetry");
  assert.equal(calls.at(-1).query.id, undefined);

  const read = await executeMcpTool("platform.telemetry", {
    args: { operation: "read", id: "telemetryMetric:platform.self" },
    callHandler
  });
  assert.equal(read.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "telemetry");
  assert.equal(calls.at(-1).query.id, "telemetryMetric:platform.self");
});

test("platform MCP branch tool routes through platform branch handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: request.handler === "platform.branch.create" ? 201 : 200, body: { ok: true, handler: request.handler, id: request.params?.id ?? null } };
  };

  const listed = await executeMcpTool("platform.branch", {
    args: { operation: "list" },
    callHandler
  });
  assert.equal(listed.isError, false);
  assert.equal(calls.at(-1).handler, "platform.branch.list");
  assert.equal(calls.at(-1).path, "/api/platform-branches");

  const created = await executeMcpTool("platform.branch", {
    args: {
      operation: "create",
      id: "branch.platform.console",
      title: "Platform Console",
      parentBranchId: "branch.platform.root",
      epic: "platform",
      feature: "console",
      defect: "none"
    },
    callHandler
  });
  assert.equal(created.isError, false);
  assert.equal(calls.at(-1).handler, "platform.branch.create");
  assert.equal(calls.at(-1).path, "/api/platform-branches");
  assert.equal(calls.at(-1).body.parentBranchId, "branch.platform.root");
  assert.equal(calls.at(-1).body.epic, "platform");
  assert.equal(calls.at(-1).body.feature, "console");
  assert.equal(calls.at(-1).body.defect, "none");

  const read = await executeMcpTool("platform.branch", {
    args: { operation: "read", id: "branch.platform.console" },
    callHandler
  });
  assert.equal(read.isError, false);
  assert.equal(calls.at(-1).handler, "platform.branch.read");
  assert.equal(calls.at(-1).params.id, "branch.platform.console");
});

test("platform MCP change-set tool routes through platform change-set handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: 200, body: { ok: true, handler: request.handler, id: request.params?.id ?? null } };
  };

  const listed = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "list"
    },
    callHandler
  });
  assert.equal(listed.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.list");
  assert.equal(calls.at(-1).path, "/api/platform-change-sets");

  const created = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "create",
      id: "changeset.platform.console",
      branchId: "branch.platform.console",
      title: "Platform console slice"
    },
    callHandler
  });
  assert.equal(created.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.create");
  assert.equal(calls.at(-1).path, "/api/platform-change-sets");

  const edited = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "edit",
      changeSetId: "changeset.platform.console",
      edits: [{ path: "plugins/platform/platform-console.rvm", content: "module plugin.platform.console {}" }]
    },
    callHandler
  });
  assert.equal(edited.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.edit");
  assert.equal(calls.at(-1).params.id, "changeset.platform.console");

  const read = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "read",
      changeSetId: "changeset.platform.console"
    },
    callHandler
  });
  assert.equal(read.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.read");
  assert.equal(calls.at(-1).params.id, "changeset.platform.console");

  const removed = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "removeEdit",
      changeSetId: "changeset.platform.console",
      pathHash: "abc123"
    },
    callHandler
  });
  assert.equal(removed.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.removeEdit");
  assert.equal(calls.at(-1).params.pathHash, "abc123");

  const validated = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "validate",
      changeSetId: "changeset.platform.console"
    },
    callHandler
  });
  assert.equal(validated.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.validate");
  assert.equal(calls.at(-1).params.id, "changeset.platform.console");

  const applied = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "apply",
      changeSetId: "changeset.platform.console"
    },
    callHandler
  });
  assert.equal(applied.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.apply");
  assert.equal(calls.at(-1).params.id, "changeset.platform.console");

  const rejected = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "reject",
      changeSetId: "changeset.platform.console",
      reason: "No longer needed"
    },
    callHandler
  });
  assert.equal(rejected.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.reject");

  const abandoned = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "abandon",
      changeSetId: "changeset.platform.console",
      reason: "Superseded"
    },
    callHandler
  });
  assert.equal(abandoned.isError, false);
  assert.equal(calls.at(-1).handler, "platform.changeSet.abandon");
});

test("platform MCP test tool routes through platform test-run handlers", async () => {
  const calls = [];
  const callHandler = async request => {
    calls.push(request);
    return { status: request.handler === "platform.testRun.create" ? 201 : 200, body: { ok: true, handler: request.handler, id: request.params?.id ?? null } };
  };

  const listed = await executeMcpTool("platform.test", {
    args: { operation: "list", id: "branch.demo" },
    callHandler
  });
  assert.equal(listed.isError, false);
  assert.equal(calls.at(-1).handler, "platform.model.read");
  assert.equal(calls.at(-1).path, "/api/platform-model");
  assert.equal(calls.at(-1).query.view, "testRuns");
  assert.equal(calls.at(-1).query.id, "branch.demo");

  const ran = await executeMcpTool("platform.test", {
    args: {
      operation: "run",
      id: "testRun.platform.demo",
      gateId: "gate:plugins/platform/platform.test.js",
      branchId: "branch.platform.demo",
      changeSetId: "changeSet:platform-demo",
      candidateSnapshotId: "candidateSnapshot:platform-demo:1"
    },
    callHandler
  });
  assert.equal(ran.isError, false);
  assert.equal(calls.at(-1).handler, "platform.testRun.create");
  assert.equal(calls.at(-1).path, "/api/platform-test-runs");
  assert.equal(calls.at(-1).body.id, "testRun.platform.demo");
  assert.equal(calls.at(-1).body.gateId, "gate:plugins/platform/platform.test.js");

  const selected = await executeMcpTool("platform.test", {
    args: {
      operation: "runSelected",
      branchId: "branch.platform.demo",
      changeSetId: "changeSet:platform-demo",
      candidateSnapshotId: "candidateSnapshot:platform-demo:1"
    },
    callHandler
  });
  assert.equal(selected.isError, false);
  assert.equal(calls.at(-1).handler, "platform.testRun.create");
  assert.equal(calls.at(-1).path, "/api/platform-test-runs");
  assert.equal(calls.at(-1).body.gateId, undefined);
  assert.equal(calls.at(-1).body.branchId, "branch.platform.demo");
  assert.equal(calls.at(-1).body.changeSetId, "changeSet:platform-demo");
  assert.equal(calls.at(-1).body.candidateSnapshotId, "candidateSnapshot:platform-demo:1");

  const read = await executeMcpTool("platform.test", {
    args: { operation: "read", id: "testRun.platform.demo" },
    callHandler
  });
  assert.equal(read.isError, false);
  assert.equal(calls.at(-1).handler, "platform.testRun.read");
  assert.equal(calls.at(-1).path, "/api/platform-test-runs/testRun.platform.demo");
  assert.equal(calls.at(-1).params.id, "testRun.platform.demo");
});

test("implemented platform MCP tools stay in parity with direct platform handler responses", async () => withRegisteredPluginProjectors(platformProviders, async () => {
  const direct = createPlatformParityHarness();
  const viaMcp = createPlatformParityHarness();

  const directDocs = await direct.callHandler({
    handler: "platform.model.read",
    method: "GET",
    path: "/api/platform-model",
    query: { view: "docs" }
  });
  const mcpDocs = await executeMcpTool("platform.docs", {
    args: { operation: "list" },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpDocs.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpDocs.structuredContent), normalizePlatformParity(directDocs.body));

  const directRoadmap = await direct.callHandler({
    handler: "platform.model.read",
    method: "GET",
    path: "/api/platform-model",
    query: { view: "roadmap", id: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" }
  });
  const mcpRoadmap = await executeMcpTool("platform.roadmap", {
    args: { operation: "read", id: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpRoadmap.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpRoadmap.structuredContent), normalizePlatformParity(directRoadmap.body));

  const directTelemetry = await direct.callHandler({
    handler: "platform.model.read",
    method: "GET",
    path: "/api/platform-model",
    query: { view: "telemetry", id: "telemetryMetric:platform.self" }
  });
  const mcpTelemetry = await executeMcpTool("platform.telemetry", {
    args: { operation: "read", id: "telemetryMetric:platform.self" },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpTelemetry.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpTelemetry.structuredContent), normalizePlatformParity(directTelemetry.body));

  const directProposalList = await direct.callHandler({
    handler: "platform.model.read",
    method: "GET",
    path: "/api/platform-model",
    query: { view: "proposals" }
  });
  const mcpProposalList = await executeMcpTool("platform.read", {
    args: { view: "proposals" },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpProposalList.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpProposalList.structuredContent), normalizePlatformParity(directProposalList.body));

  const branchBody = {
    id: "branch.parity.demo",
    title: "Parity branch",
    parentBranchId: null,
    epic: "platform",
    feature: "parity",
    defect: null
  };
  const directBranchCreate = await direct.callHandler({
    handler: "platform.branch.create",
    method: "POST",
    path: "/api/platform-branches",
    body: branchBody
  });
  const mcpBranchCreate = await executeMcpTool("platform.branch", {
    args: {
      operation: "create",
      id: branchBody.id,
      title: branchBody.title,
      epic: branchBody.epic,
      feature: branchBody.feature
    },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpBranchCreate.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpBranchCreate.structuredContent), normalizePlatformParity(directBranchCreate.body));

  const directBranchRead = await direct.callHandler({
    handler: "platform.branch.read",
    method: "GET",
    path: `/api/platform-branches/${encodeURIComponent(branchBody.id)}`,
    params: { id: branchBody.id }
  });
  const mcpBranchRead = await executeMcpTool("platform.branch", {
    args: { operation: "read", id: branchBody.id },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpBranchRead.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpBranchRead.structuredContent), normalizePlatformParity(directBranchRead.body));

  const directBranchView = await direct.callHandler({
    handler: "platform.model.read",
    method: "GET",
    path: "/api/platform-model",
    query: { view: "branches", id: branchBody.id }
  });
  const mcpBranchView = await executeMcpTool("platform.read", {
    args: { view: "branches", id: branchBody.id },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpBranchView.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpBranchView.structuredContent), normalizePlatformParity(directBranchView.body));

  const changeSetBody = {
    id: "changeset.parity.demo",
    branchId: branchBody.id,
    title: "Parity change set",
    reason: "Parity test"
  };
  const directChangeSetCreate = await direct.callHandler({
    handler: "platform.changeSet.create",
    method: "POST",
    path: "/api/platform-change-sets",
    body: changeSetBody
  });
  const mcpChangeSetCreate = await executeMcpTool("platform.changeSet", {
    args: {
      operation: "create",
      id: changeSetBody.id,
      branchId: changeSetBody.branchId,
      title: changeSetBody.title,
      reason: changeSetBody.reason
    },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpChangeSetCreate.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpChangeSetCreate.structuredContent), normalizePlatformParity(directChangeSetCreate.body));

  const directChangeSetRead = await direct.callHandler({
    handler: "platform.changeSet.read",
    method: "GET",
    path: `/api/platform-change-sets/${encodeURIComponent(changeSetBody.id)}`,
    params: { id: changeSetBody.id }
  });
  const mcpChangeSetRead = await executeMcpTool("platform.changeSet", {
    args: { operation: "read", changeSetId: changeSetBody.id },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpChangeSetRead.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpChangeSetRead.structuredContent), normalizePlatformParity(directChangeSetRead.body));

  const directChangeSetView = await direct.callHandler({
    handler: "platform.model.read",
    method: "GET",
    path: "/api/platform-model",
    query: { view: "changeSets", id: changeSetBody.id }
  });
  const mcpChangeSetView = await executeMcpTool("platform.read", {
    args: { view: "changeSets", id: changeSetBody.id },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpChangeSetView.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpChangeSetView.structuredContent), normalizePlatformParity(directChangeSetView.body));

  const proposalBody = {
    id: "proposal.platform.parity",
    action: "branch.create",
    body: {
      id: "branch.platform.proposal.parity",
      title: "Proposal parity branch"
    },
    reason: "Parity proposal"
  };
  const directProposalCreate = await direct.callHandler({
    handler: "platform.proposal.create",
    method: "POST",
    path: "/api/platform-proposals",
    body: proposalBody
  });
  const mcpProposalCreate = await executeMcpTool("platform.proposal", {
    args: proposalBody,
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpProposalCreate.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpProposalCreate.structuredContent), normalizePlatformParity(directProposalCreate.body));

  const directProposalReject = await direct.callHandler({
    handler: "platform.proposal.reject",
    method: "POST",
    path: `/api/platform-proposals/${encodeURIComponent(proposalBody.id)}/reject`,
    params: { id: proposalBody.id },
    body: { reason: "Parity reject" }
  });
  const mcpProposalReject = await executeMcpTool("platform.proposal", {
    args: { operation: "reject", proposalId: proposalBody.id, reason: "Parity reject" },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpProposalReject.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpProposalReject.structuredContent), normalizePlatformParity(directProposalReject.body));

  const directTestList = await direct.callHandler({
    handler: "platform.model.read",
    method: "GET",
    path: "/api/platform-model",
    query: { view: "testRuns", id: branchBody.id }
  });
  const mcpTestList = await executeMcpTool("platform.test", {
    args: { operation: "list", id: branchBody.id },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpTestList.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpTestList.structuredContent), normalizePlatformParity(directTestList.body));

  const directCandidateSnapshotView = await direct.callHandler({
    handler: "platform.model.read",
    method: "GET",
    path: "/api/platform-model",
    query: { view: "candidateSnapshots", id: changeSetBody.id }
  });
  const mcpCandidateSnapshotView = await executeMcpTool("platform.read", {
    args: { view: "candidateSnapshots", id: changeSetBody.id },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpCandidateSnapshotView.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpCandidateSnapshotView.structuredContent), normalizePlatformParity(directCandidateSnapshotView.body));

  const testRunBody = {
    id: "testRun.parity.demo",
    gateId: "gate:plugins/platform/platform.test.js",
    branchId: branchBody.id
  };
  const directTestRun = await direct.callHandler({
    handler: "platform.testRun.create",
    method: "POST",
    path: "/api/platform-test-runs",
    body: testRunBody
  });
  const mcpTestRun = await executeMcpTool("platform.test", {
    args: {
      operation: "run",
      id: testRunBody.id,
      gateId: testRunBody.gateId,
      branchId: testRunBody.branchId
    },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpTestRun.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpTestRun.structuredContent), normalizePlatformParity(directTestRun.body));

  const directTestRead = await direct.callHandler({
    handler: "platform.testRun.read",
    method: "GET",
    path: `/api/platform-test-runs/${encodeURIComponent(testRunBody.id)}`,
    params: { id: testRunBody.id }
  });
  const mcpTestRead = await executeMcpTool("platform.test", {
    args: { operation: "read", id: testRunBody.id },
    callHandler: viaMcp.callHandler
  });
  assert.equal(mcpTestRead.isError, false);
  assert.deepEqual(normalizePlatformParity(mcpTestRead.structuredContent), normalizePlatformParity(directTestRead.body));
}));

test("mcp runtime ownership is not implemented in core compatibility files", async () => {
  const routeHandlersSource = await readFile(new URL("../../src/runtime-route-handlers.js", import.meta.url), "utf8");

  await assert.rejects(readFile(new URL("../../src/mcp.js", import.meta.url), "utf8"));
  assert.equal(routeHandlersSource.includes("../plugins/mcp/mcp-tools.js"), false);
  assert.equal(routeHandlersSource.includes("../plugins/mcp/mcp-support-services.js"), false);
  assert.equal(routeHandlersSource.includes("from \"./mcp.js\""), false);
});

test("mcp plugin registers MCP server and tool install read-model projectors", () => withRegisteredPluginProjectors(providers, () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "system" });
  createThing(world, { actor: "system", id: "mcp.demo" });
  world.emit({
    process: "defineMcpServer",
    actor: "system",
    claims: [
      relation("mcp.demo", "hasModuleKind", "mcpServer"),
      relation("mcp.demo", "usesServerRunner", "runner.demo"),
      relation("mcp.demo", "serviceIdentity", "identity.mcp"),
      relation("mcp.demo", "supportsTransport", "stdio"),
      relation("mcp.demo", "supportsTransport", "http"),
      relation("mcp.demo", "supportsTransport", "invalid"),
      relation("mcp.demo", "exposesMcpTool", "world.read", {
        actingMode: "service",
        scopeContexts: ["ctx.demo", "ctx.demo"],
        scopeTargets: ["page.demo"]
      })
    ],
    body: {
      id: "mcp.demo",
      label: "Demo MCP",
      serverRunner: "runner.initial",
      serviceIdentity: "identity.initial",
      transports: ["stdio"]
    }
  });

  assert.deepEqual(world.project(moduleProjectors.mcpServers), [{
    id: "mcp.demo",
    label: "Demo MCP",
    serverRunner: "runner.demo",
    serviceIdentity: "identity.mcp",
    transports: ["http", "stdio"],
    context: null
  }]);
  assert.equal(world.project(moduleProjectors.mcpServerIndex).byId["mcp.demo"].serverRunner, "runner.demo");
  assert.deepEqual(world.project(moduleProjectors.mcpToolInstalls), [{
    server: "mcp.demo",
    tool: "world.read",
    actingMode: "service",
    scopeContexts: ["ctx.demo"],
    scopeTargets: ["page.demo"],
    witness: world.project(moduleProjectors.mcpToolInstalls)[0].witness
  }]);
  assert.equal(world.project(moduleProjectors.mcpToolInstallIndex).byServer["mcp.demo"][0].tool, "world.read");
}));
