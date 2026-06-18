import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildGovernanceRouteInventory,
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
  assert.equal(byHandler.get("serverRunner.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("runtimePlugin.install")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("mcpServer.create")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("mcpTool.install")?.governanceMode, "proposal-fallback");
  assert.equal(byHandler.get("platform.changeSet.apply")?.governanceMode, "operator-only");
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
  assert.equal(proposalTargetProcessIds({ bootstrapSelectableOnly: true }).includes("changeSet.apply"), false);
  assert.equal(proposalTargetGovernanceEntry("changeSet.apply")?.governanceMode, "operator-only");
  assert.equal(proposalTargetGovernanceEntry("widget.define")?.governanceMode, "proposal-fallback");
});
