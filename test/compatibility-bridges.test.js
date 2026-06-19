import test from "node:test";
import assert from "node:assert/strict";
import { buildCompatibilityBridgeLedger, compatibilityBridgeCatalog } from "../src/compatibility-bridges.js";

test("compatibility bridge catalog declares owners, migration targets, and surfaces", () => {
  const catalog = compatibilityBridgeCatalog();

  assert.ok(catalog.length >= 8);
  for (const bridge of catalog) {
    assert.match(bridge.id, /^compatibilityBridge:/);
    assert.equal(typeof bridge.owner, "string");
    assert.equal(Boolean(bridge.owner), true);
    assert.equal(typeof bridge.migrationTarget, "string");
    assert.equal(Boolean(bridge.migrationTarget), true);
    assert.equal(Array.isArray(bridge.surfaces), true);
    assert.equal(bridge.surfaces.length > 0, true);
  }
});

test("compatibility bridge ledger projects observed legacy relations and placeholder synthesis without hiding policy bridges", () => {
  const ledger = buildCompatibilityBridgeLedger({
    capabilities: [
      { id: "cap.search", provenance: { source: "dsl.context.capabilities" } },
      { id: "cap.http", provenance: { source: "host.declare.backend" } },
      { id: "cap.dom", provenance: { source: "server.start.defaultHostCapabilities" } }
    ],
    capabilityInstalls: [
      { target: "ctx.demo", capability: "cap.search", source: "legacy-context" },
      { target: "backendHost", capability: "cap.http", source: "legacy-host" }
    ]
  });

  const byId = Object.fromEntries(ledger.map(row => [row.id, row]));
  assert.equal(byId["compatibilityBridge:legacyCapabilityRelation.contextCapability"].status, "active");
  assert.equal(byId["compatibilityBridge:legacyCapabilityRelation.contextCapability"].activeCount, 1);
  assert.equal(byId["compatibilityBridge:legacyCapabilityRelation.hostCapability"].status, "active");
  assert.equal(byId["compatibilityBridge:placeholderCapabilitySynthesis.dslContextCapabilities"].status, "active");
  assert.equal(byId["compatibilityBridge:placeholderCapabilitySynthesis.hostDeclareDefaults"].status, "active");
  assert.equal(byId["compatibilityBridge:placeholderCapabilitySynthesis.serverStartDefaults"].status, "active");
  assert.equal(byId["compatibilityBridge:canonicalIdSugar.sameContextVisibleTarget"].status, "policy");
  assert.equal(byId["compatibilityBridge:canonicalIdSugar.sameContextVisibleTarget"].active, null);
});

test("compatibility bridge ledger rejects unregistered bridge emissions", () => {
  assert.throws(() => buildCompatibilityBridgeLedger({
    additionalObservedBridges: [{ bridgeId: "compatibilityBridge:unregistered.future.shortcut" }]
  }), /Unregistered compatibility bridge emitted/i);
});
