import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../../src/kernel.js";
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
