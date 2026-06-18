import assert from "node:assert/strict";
import test from "node:test";
import { createWorld, relation } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { createIdentity, grantIdentityActorAssumption } from "../../src/modules.js";
import { createBootstrapReadModels } from "./bootstrap-read-models.js";

test("bootstrap read models expose identity-to-actor assumption grants in authored state", async () => {
  const world = createWorld();
  createIdentity(world, {
    actor: "system",
    id: "identity.aaron",
    identityActor: "aaron",
    label: "Aaron",
    username: "aaron",
    password: "aaron"
  });
  createIdentity(world, {
    actor: "system",
    id: "identity.callan",
    identityActor: "callan",
    label: "Callan",
    username: "callan",
    password: "callan"
  });
  grantIdentityActorAssumption(world, {
    actor: "system",
    identityId: "identity.aaron",
    targetActor: "callan"
  });

  const { getBootstrapState } = createBootstrapReadModels({
    world,
    runtimeProfile: "minimal",
    runtimeBundleSummary: null,
    supportedHandlers: [],
    supportedHandlerMetadata: {},
    supportedPageHandlers: [],
    supportedHandlerSets: [],
    supportedFrontendOps: [],
    supportedBackendOps: [],
    backendHosts: [],
    frontendHosts: [],
    getRuntimePluginCatalog: async () => ({
      packages: [],
      addedBundleIds: [],
      summary: null
    }),
    buildPluginCapabilitySourceIndex: ({ capabilityCatalog = [] } = {}) => ({
      capabilityCatalog,
      capabilityPackageSources: []
    })
  });

  const state = await getBootstrapState("aaron", null);
  assert.deepEqual(state.identityActorAssumptionGrants, [{
    id: "identity.aaron=>callan",
    identityId: "identity.aaron",
    targetActor: "callan"
  }]);
});

test("bootstrap read models expose governance route and proposal-target ledgers in authored state", async () => {
  const world = createWorld();

  const { getBootstrapState } = createBootstrapReadModels({
    world,
    runtimeProfile: "minimal",
    runtimeBundleSummary: {
      routes: [{ method: "POST", path: "/api/widgets", handler: "widgets.create" }],
      governanceRoutes: [{ id: "governanceRoute:POST /api/widgets", method: "POST", matcher: "/api/widgets", handler: "widgets.create", governanceMode: "proposal-fallback" }],
      proposalTargetGovernance: [{ id: "governanceProposalTarget:widget.define", targetProcess: "widget.define", governanceMode: "proposal-fallback" }]
    },
    supportedHandlers: [],
    supportedHandlerMetadata: {},
    supportedPageHandlers: [],
    supportedHandlerSets: [],
    supportedFrontendOps: [],
    supportedBackendOps: [],
    backendHosts: [],
    frontendHosts: [],
    getRuntimePluginCatalog: async () => ({
      packages: [],
      addedBundleIds: [],
      summary: null
    }),
    buildPluginCapabilitySourceIndex: ({ capabilityCatalog = [] } = {}) => ({
      capabilityCatalog,
      capabilityPackageSources: []
    })
  });

  const state = await getBootstrapState("aaron", null);
  assert.deepEqual(state.governanceRoutes, [{
    id: "governanceRoute:POST /api/widgets",
    method: "POST",
    matcher: "/api/widgets",
    handler: "widgets.create",
    governanceMode: "proposal-fallback"
  }]);
  assert.deepEqual(state.proposalTargetGovernance, [{
    id: "governanceProposalTarget:widget.define",
    targetProcess: "widget.define",
    governanceMode: "proposal-fallback"
  }]);
});

test("bootstrap read models expose legacy capability migration state as first-class authored nouns", async () => {
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

  const { getBootstrapState } = createBootstrapReadModels({
    world,
    runtimeProfile: "minimal",
    runtimeBundleSummary: null,
    supportedHandlers: [],
    supportedHandlerMetadata: {},
    supportedPageHandlers: [],
    supportedHandlerSets: [],
    supportedFrontendOps: [],
    supportedBackendOps: [],
    backendHosts: [],
    frontendHosts: [],
    getRuntimePluginCatalog: async () => ({
      packages: [],
      addedBundleIds: [],
      summary: null
    }),
    buildPluginCapabilitySourceIndex: ({ capabilityCatalog = [] } = {}) => ({
      capabilityCatalog,
      capabilityPackageSources: []
    })
  });

  const state = await getBootstrapState("aaron", null);
  assert.equal(state.legacyCapabilityCompatibilityMode.mode, "bridge-active");
  assert.equal(state.legacyCapabilityCompatibilityMode.pendingCount, 4);
  assert.equal(state.legacyCapabilityCompatibilityMode.bridgeSources.includes("dsl.context.capabilities"), true);
  assert.equal(state.legacyCapabilityCompatibilityMode.bridgeSources.includes("legacyCapabilityRelation.contextCapability"), true);
  assert.equal(state.legacyCapabilityCompatibilityMode.bridgeSources.includes("legacy-context"), true);
  assert.equal(state.legacyCapabilityMigration.compatibilityMode, "bridge-active");
  assert.equal(state.legacyCapabilityMigration.pending.some(row =>
    row.action === "definition.update"
    && row.capabilityId === "cap.search"
  ), true);
  assert.equal(state.legacyCapabilityMigration.pending.some(row =>
    row.action === "definition.create"
    && row.capabilityId === "cap.legacyOnly"
  ), true);
});
