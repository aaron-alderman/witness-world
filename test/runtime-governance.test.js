import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildGovernanceRouteInventory,
  describeMountedRouteGovernance,
  isPotentiallyMutatingMethod,
  proposalTargetGovernanceCatalog,
  proposalTargetGovernanceEntry,
  proposalTargetProcessIds,
  runtimeGovernanceCoverageModes,
  runtimeGovernanceEntry
} from "../src/runtime-governance.js";
import { runtimeBundleManifests } from "../src/runtime-bundles.js";

function routeMatcher(route = {}) {
  return route.kind === "exact"
    ? String(route.path || "")
    : String(route.pattern || route.matcher || "");
}

async function collectRuntimeRoutes() {
  const routes = [];
  for (const bundle of runtimeBundleManifests()) {
    for (const route of bundle.contributes?.routes ?? []) {
      routes.push({
        bundleId: bundle.id,
        handler: String(route.handler || ""),
        method: String(route.method || "GET").toUpperCase(),
        matcher: routeMatcher(route)
      });
    }
  }

  const pluginsRoot = path.join(process.cwd(), "plugins");
  const pluginEntries = await fs.readdir(pluginsRoot, { withFileTypes: true });
  for (const entry of pluginEntries) {
    if (!entry.isDirectory()) continue;
    const runtimePath = path.join(pluginsRoot, entry.name, "runtime.js");
    try {
      await fs.access(runtimePath);
    } catch {
      continue;
    }
    const runtime = await import(pathToFileURL(runtimePath).href);
    for (const [bundleId, bundle] of Object.entries(runtime.bundles ?? runtime.default?.bundles ?? {})) {
      for (const route of bundle?.routes ?? []) {
        routes.push({
          bundleId: String(bundleId || entry.name),
          handler: String(route.handler || ""),
          method: String(route.method || "GET").toUpperCase(),
          matcher: routeMatcher(route)
        });
      }
    }
    for (const route of runtime.routes ?? []) {
      routes.push({
        bundleId: String(runtime.bundleId || entry.name),
        handler: String(route.handler || ""),
        method: String(route.method || "GET").toUpperCase(),
        matcher: routeMatcher(route)
      });
    }
  }

  return routes.filter(route => route.handler && isPotentiallyMutatingMethod(route.method));
}

test("governance catalog covers every mutating route handler across runtime bundles", async () => {
  const routes = await collectRuntimeRoutes();
  const missing = routes
    .filter(route => !runtimeGovernanceEntry(route.handler))
    .map(route => `${route.bundleId}\t${route.handler}\t${route.method}\t${route.matcher}`);

  assert.deepEqual(missing, []);

  const inventory = buildGovernanceRouteInventory(routes);
  assert.equal(inventory.length, routes.length);
  assert.equal(inventory.every(row => runtimeGovernanceCoverageModes().includes(row.governanceMode)), true);
  assert.equal(inventory.every(row => row.notes.length > 0), true);
});

test("governance inventory preserves proposal, operator, mixed, and session classifications", async () => {
  const inventory = buildGovernanceRouteInventory(await collectRuntimeRoutes());
  const byHandler = new Map();
  for (const row of inventory) {
    if (!byHandler.has(row.handler)) byHandler.set(row.handler, row);
  }

  assert.equal(byHandler.get("asset.attach")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("asset.attach")?.sharedAuthorityPath, true);
  assert.equal(byHandler.get("capability.update")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("capability.install")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("capability.remove")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("capability.rollback")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("capability.migrateLegacy")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("frontend.upliftLegacy")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("context.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("contextBinding.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("contextImport.remove")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("perspective.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("stewardship.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("surface.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("collection.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("process.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("type.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("projection.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("message.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("boundary.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("policy.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("package.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("packageRevision.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("packageRevision.publish")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("packagePatch.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("packageNamespace.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("packageDependency.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("packageTransformer.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("widgets.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("widgets.create")?.authorityMechanism, "bootstrap-context-or-target-authority");
  assert.equal(byHandler.get("widgets.update")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("backendProgramVersions.activate")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("route.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("serve.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("serverRunner.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("starter.todo.apply")?.governanceMode, "direct-authority");
  assert.equal(byHandler.get("runtimePlugin.install")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("mcpServer.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("mcpTool.install")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("platform.changeSet.apply")?.governanceMode, "direct-authority");
  assert.equal(byHandler.get("platform.changeSet.apply")?.sharedAuthorityPath, false);
  assert.equal(byHandler.get("mcp.http")?.operationSemantics, "mixed");
  assert.equal(byHandler.get("session.open")?.authorityMechanism, "credential-session");
  assert.equal(byHandler.get("webhook.inbound.receive")?.authorityMechanism, "external-signature");
});

test("proposal target governance catalog covers every supported executor target and drives bootstrap-selectable targets", async () => {
  const executorSource = await fs.readFile(path.join(process.cwd(), "plugins", "proposals", "proposal-executor.js"), "utf8");
  const executorTargets = [...new Set([...executorSource.matchAll(/case "([^"]+)":/g)].map(match => match[1]))];
  const missing = executorTargets.filter(targetProcess => !proposalTargetGovernanceEntry(targetProcess));

  assert.deepEqual(missing, []);

  const bootstrapCatalog = proposalTargetGovernanceCatalog({ bootstrapSelectableOnly: true });
  assert.deepEqual(proposalTargetProcessIds({ bootstrapSelectableOnly: true }), Object.keys(bootstrapCatalog));
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("runtimePlugin.install"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("mcpServer.define"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("capability.update"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("capability.rollback"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("capability.migrateLegacy"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("frontend.upliftLegacy"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("package.define"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("collection.define"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("boundary.define"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("policy.define"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("packageRevision.define"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("packageRevision.publish"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("packageTransformer.define"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("changeSet.apply"), true);
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("edenVersions.activate"), false);
  assert.equal(proposalTargetGovernanceEntry("changeSet.apply")?.governanceMode, "direct-authority");
  assert.equal(proposalTargetGovernanceEntry("widget.define")?.governanceMode, "proposal-fallback");
  assert.equal(proposalTargetGovernanceEntry("capability.update")?.governanceMode, "proposal-fallback");
  assert.equal(proposalTargetGovernanceEntry("capability.rollback")?.governanceMode, "proposal-fallback");
  assert.equal(proposalTargetGovernanceEntry("capability.migrateLegacy")?.governanceMode, "proposal-fallback");
  assert.equal(proposalTargetGovernanceEntry("frontend.upliftLegacy")?.governanceMode, "proposal-fallback");
  assert.equal(proposalTargetGovernanceEntry("collection.define")?.governanceMode, "proposal-fallback");
  assert.equal(proposalTargetGovernanceEntry("boundary.define")?.governanceMode, "proposal-fallback");
  assert.equal(proposalTargetGovernanceEntry("policy.define")?.governanceMode, "proposal-fallback");
  assert.equal(proposalTargetGovernanceEntry("packageRevision.publish")?.governanceMode, "proposal-fallback");
  assert.equal(proposalTargetGovernanceEntry("packagePatch.define")?.governanceMode, "proposal-fallback");
  assert.equal(proposalTargetGovernanceEntry("packageDependency.define")?.governanceMode, "proposal-fallback");
  assert.equal(proposalTargetGovernanceEntry("packageTransformer.define")?.governanceMode, "proposal-fallback");
  assert.equal(proposalTargetGovernanceEntry("edenVersions.activate")?.bootstrapSelectable, false);
  assert.equal(proposalTargetGovernanceEntry("edenVersions.rollback")?.governanceMode, "proposal-fallback");
});

test("mounted route governance reuses the shared governance inventory shape", () => {
  const governance = describeMountedRouteGovernance({
    route: {
      method: "POST",
      path: "/api/widgets",
      handler: "widget.define"
    },
    governanceRoutes: [{
      id: "governanceRoute:POST /api/widgets",
      routeId: "route:POST /api/widgets",
      method: "POST",
      matcher: "/api/widgets",
      handler: "widget.define",
      operationSemantics: "governed-mutation",
      governanceMode: "proposal-fallback",
      authorityMechanism: "widget-target-authority",
      sharedAuthorityPath: true,
      workflowRole: "direct-mutation",
      notes: "Widget creation lowers through the shared target-authority path."
    }]
  });

  assert.deepEqual(governance, {
    governanceRouteId: "governanceRoute:POST /api/widgets",
    operationSemantics: "governed-mutation",
    governanceMode: "proposal-fallback",
    authorityMechanism: "widget-target-authority",
    sharedAuthorityPath: true,
    workflowRole: "direct-mutation",
    governanceNotes: "Widget creation lowers through the shared target-authority path."
  });

  assert.deepEqual(describeMountedRouteGovernance({
    route: {
      method: "GET",
      path: "/",
      handler: "page.home"
    },
    governanceRoutes: []
  }), {
    governanceRouteId: null,
    operationSemantics: null,
    governanceMode: null,
    authorityMechanism: null,
    sharedAuthorityPath: null,
    workflowRole: null,
    governanceNotes: null
  });
});
