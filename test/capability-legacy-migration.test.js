import assert from "node:assert/strict";
import test from "node:test";
import { createWorld, relation } from "../src/kernel.js";
import { applyWitnessToml } from "../src/dsl.js";
import { buildCompatibilityBridgeLedger } from "../src/compatibility-bridges.js";
import {
  applyLegacyCapabilityMigration,
  legacyCapabilityCompatibilityMode,
  legacyCapabilityCompatibilityModeFromProject,
  previewLegacyCapabilityMigrationFromProject,
  previewLegacyCapabilityMigration
} from "../src/capability-legacy-migration.js";
import { moduleProjectors } from "../src/modules.js";

test("legacy capability migration preview exposes placeholder definitions, legacy installs, and bridge-active mode", () => {
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

  const preview = previewLegacyCapabilityMigration(world);
  const mode = legacyCapabilityCompatibilityMode(world);

  assert.equal(preview.compatibilityMode, "bridge-active");
  assert.equal(mode.mode, "bridge-active");
  assert.equal(preview.pending.some(row => row.action === "definition.update" && row.capabilityId === "cap.search"), true);
  assert.equal(preview.pending.some(row => row.action === "definition.create" && row.capabilityId === "cap.legacyOnly"), true);
  assert.equal(preview.pending.some(row => row.action === "install.explicit" && row.capabilityId === "cap.search" && row.target === "ctx.shared"), true);
  assert.equal(preview.pending.some(row => row.action === "install.explicit" && row.capabilityId === "cap.legacyOnly" && row.target === "ctx.shared"), true);
});

test("legacy capability migration writes explicit authored state and retires observed bridge rows", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.shared"

[[thing]]
actor = "system"
id = "backendHost"

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
    process: "legacy.hostCapability",
    actor: "system",
    claims: [relation("backendHost", "hostCapability", "cap.hosted")],
    body: {}
  });

  const migrated = applyLegacyCapabilityMigration(world, { actor: "callan" });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.actions.some(action => action.action === "definition.update" && action.capabilityId === "cap.search"), true);
  assert.equal(migrated.actions.some(action => action.action === "definition.create" && action.capabilityId === "cap.hosted"), true);
  assert.equal(migrated.actions.some(action => action.action === "install.explicit" && action.capabilityId === "cap.search" && action.target === "ctx.shared"), true);
  assert.equal(migrated.actions.some(action => action.action === "install.explicit" && action.capabilityId === "cap.hosted" && action.target === "backendHost"), true);

  const capabilityIndex = world.project(moduleProjectors.capabilityIndex).byId;
  assert.equal(capabilityIndex["cap.search"]?.provenance?.source, "migration.legacyCapabilityBridge");
  assert.equal(capabilityIndex["cap.search"]?.provenance?.migratedFrom, "dsl.context.capabilities");
  assert.equal(capabilityIndex["cap.hosted"]?.provenance?.source, "migration.legacyCapabilityBridge");

  const installs = world.project(moduleProjectors.capabilityInstalls);
  const contextInstall = installs.find(row =>
    row.capability === "cap.search"
    && row.target === "ctx.shared"
    && row.targetKind === "context"
    && row.source === "explicit"
  );
  const hostInstall = installs.find(row =>
    row.capability === "cap.hosted"
    && row.target === "backendHost"
    && row.targetKind === "host"
    && row.source === "explicit"
  );
  assert.equal(contextInstall?.source, "explicit");
  assert.equal(hostInstall?.source, "explicit");

  const previewAfter = previewLegacyCapabilityMigration(world);
  assert.equal(previewAfter.pending.length, 0);
  assert.equal(legacyCapabilityCompatibilityMode(world).mode, "first-class-only");

  const ledger = buildCompatibilityBridgeLedger({
    capabilities: world.project(moduleProjectors.capabilities),
    capabilityInstalls: installs
  });
  const byId = Object.fromEntries(ledger.map(row => [row.id, row]));
  assert.notEqual(byId["compatibilityBridge:legacyCapabilityRelation.contextCapability"].status, "active");
  assert.notEqual(byId["compatibilityBridge:legacyCapabilityRelation.hostCapability"].status, "active");
  assert.notEqual(byId["compatibilityBridge:placeholderCapabilitySynthesis.dslContextCapabilities"].status, "active");
});

test("legacy capability migration projector helpers match the world-backed helpers", () => {
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

  const project = projector => world.project(projector);
  assert.deepEqual(previewLegacyCapabilityMigrationFromProject(project), previewLegacyCapabilityMigration(world));
  assert.deepEqual(legacyCapabilityCompatibilityModeFromProject(project), legacyCapabilityCompatibilityMode(world));
});
