import assert from "node:assert/strict";
import test from "node:test";
import { createWorld, relation } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { createIdentity, grantIdentityActorAssumption, moduleProjectors, updateCapability } from "../../src/modules.js";
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

test("bootstrap read models expose canonical app-boundary status and plan summary", async () => {
  const world = createWorld();

  const { getBootstrapState } = createBootstrapReadModels({
    world,
    runtimeProfile: "minimal",
    runtimeBundleSummary: {
      routes: [{ method: "GET", path: "/_bootstrap", handler: "bootstrap.page" }]
    },
    supportedHandlers: [],
    supportedHandlerMetadata: {},
    supportedPageHandlers: [],
    supportedHandlerSets: [],
    supportedFrontendOps: [],
    supportedBackendOps: [],
    backendHosts: ["backendHost"],
    frontendHosts: ["frontendHost"],
    getRuntimePluginCatalog: async () => ({
      packages: [
        {
          id: "plugin.authoring",
          validation: { ok: true, errors: [] },
          execution: { executable: true },
          compatibility: { compatible: true }
        },
        {
          id: "plugin.inspect",
          validation: { ok: true, errors: [] },
          execution: { executable: true },
          compatibility: { compatible: true }
        }
      ],
      addedBundleIds: [],
      summary: null
    }),
    buildPluginCapabilitySourceIndex: ({ capabilityCatalog = [] } = {}) => ({
      capabilityCatalog,
      capabilityPackageSources: []
    })
  });

  const state = await getBootstrapState("aaron", {
    runtimeStartupMode: "bootstrap",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    bootstrapOnly: true
  });
  assert.equal(state.appBoundary.status, "missing");
  assert.deepEqual(state.appBoundary.missingKinds, [
    "serverRunner",
    "runtimePluginInstall",
    "surface",
    "route",
    "serveMount"
  ]);
  assert.equal(state.appBoundary.planSummary.serverRunners[0].id, "demo_server");
  assert.equal(state.appBoundary.planSummary.routes[0].handler, "page.surface");
  assert.equal(state.appBoundary.composition.root.source, "bootstrap-fallback");
  assert.equal(state.appBoundary.composition.bootstrap.path, "/_bootstrap");
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

test("bootstrap read models expose legacy frontend migration state and compatibility bridge inventory", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "home_route"
path = "/"
serves = "home_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "page_root", frontendProgram = "landing_program" }
`);

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
  assert.equal(state.legacyFrontendMigration.compatibilityMode, "bridge-active");
  assert.equal(state.legacyFrontendMigration.pending.some(row =>
    row.action === "route.rewrite"
    && row.routeId === "home_route"
  ), true);
  assert.equal(state.compatibilityBridges.some(row =>
    row.id === "compatibilityBridge:legacyFrontend.pageHomeShim"
    && row.status === "active"
  ), true);
});

test("bootstrap read models expose legacy frontend native uplift state as first-class authored nouns", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "home_route"
path = "/"
serves = "home_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "login_page", frontendProgram = "login_program" }

[[widget]]
actor = "system"
id = "login_page"
kind = "Page"
props = { title = "Login" }

[[widget]]
actor = "system"
id = "login_form"
kind = "Form"
props = { }

[[widget]]
actor = "system"
id = "email_input"
kind = "Input"
props = { name = "email" }

[[widget]]
actor = "system"
id = "submit_button"
kind = "Button"
props = { text = "Sign in", type = "submit" }

[[attachWidget]]
actor = "system"
parent = "login_page"
child = "login_form"
order = 0

[[attachWidget]]
actor = "system"
parent = "login_form"
child = "email_input"
order = 0

[[attachWidget]]
actor = "system"
parent = "login_form"
child = "submit_button"
order = 1

[[frontendProgram]]
actor = "system"
id = "login_program"
rootWidget = "login_page"

[[frontendStep]]
actor = "system"
program = "login_program"
event = "submit:login_form"
order = 0
op = "readForm"
params = { widget = "login_form", into = "credentials" }
`);

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
  assert.equal(state.legacyFrontendUplift.compatibilityMode, "bridge-active");
  assert.equal(state.legacyFrontendUplift.pending.some(row =>
    row.action === "route.rewrite"
    && row.routeId === "home_route"
    && row.authoredId === "legacyUplift.home_route.surface.root"
    && row.nextHandler === "page.surface"
  ), true);
  assert.equal(state.legacyFrontendUplift.blocked.length, 0);
});

test("bootstrap read models expose capability revision history rows for explicit update and rollback review", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[capability]]
actor = "system"
id = "cap.search"
label = "Search"
version = "1.0.0"
placement = ["context"]
`);
  updateCapability(world, {
    actor: "system",
    id: "cap.search",
    label: "Search",
    version: "2.0.0",
    placement: ["context"],
    previousDefinition: world.project(moduleProjectors.capabilityIndex).byId["cap.search"],
    previousVersion: "1.0.0"
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
  assert.equal(state.capabilityRevisionHistory.length, 2);
  assert.deepEqual(state.capabilityRevisionHistory.map(row => row.action), ["define", "update"]);
  assert.equal(state.capabilityRevisionHistory[1].capabilityId, "cap.search");
  assert.equal(state.capabilityRevisionHistory[1].previousVersion, "1.0.0");
});

test("bootstrap read models expose authored package nouns plus coexistence, convergence, and apply preview state", async () => {
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

[[packageDependency]]
actor = "system"
sourcePackage = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v2"
targetKind = "capability"
targetId = "dom.render"
`);

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
  assert.equal(state.packages.length, 1);
  assert.equal(state.packageRevisions.length, 2);
  assert.equal(state.packagePatches.length, 1);
  assert.equal(state.packageNamespaces.length, 2);
  assert.equal(state.packageDependencies.length, 1);
  assert.equal(state.packageTransformers.length, 1);
  assert.equal(state.packageCoexistence.length, 1);
  assert.equal(state.packageCoexistence[0].coexistenceMode, "coexisting");
  assert.deepEqual(state.packageCoexistence[0].selectedRevisionIds, [
    "packageRevision.plugin.inspect.v1",
    "packageRevision.plugin.inspect.v2"
  ]);
  assert.equal(state.packageConvergence.length, 1);
  assert.equal(state.packageConvergence[0].status, "glue-required");
  assert.deepEqual(state.packageConvergence[0].transformerIds, ["packageTransformer.inspect.v1-to-v2"]);
  assert.equal(state.packageApplyPreviews.length, 2);
  const preview = state.packageApplyPreviews.find(row => row.revisionId === "packageRevision.plugin.inspect.v2");
  assert.ok(preview);
  assert.equal(preview.status, "glue-required");
  assert.deepEqual(preview.relatedTransformerIds, ["packageTransformer.inspect.v1-to-v2"]);
  assert.equal(preview.bundle.revisionRecord.id, "packageRevision.plugin.inspect.v2");
});

test("bootstrap read models expose collections in authored state and context-bindable targets", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.collections"
`);
  world.emit({
    process: "desire.defineCollection",
    actor: "system",
    claims: [],
    body: {
      id: "collection.search.results",
      context: "ctx.collections"
    }
  });

  const { getBootstrapState, getBootstrapModel } = createBootstrapReadModels({
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
  assert.equal(state.collections.length, 1);
  assert.equal(state.collections[0].id, "collection.search.results");
  assert.equal(state.collections[0].context, "ctx.collections");

  const model = await getBootstrapModel(null);
  assert.equal(model.contextBindableTargets.some(row =>
    row.id === "collection.search.results" && row.context === "ctx.collections"
  ), true);
});

test("bootstrap model exposes authored package nouns as context-bindable composition targets", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.packages"

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

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"
path = "plugins/inspect/runtime.js"
operation = "replace"
sourceLanguage = "js"
body = { export = "inspect" }

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.packages:inspectLocal"
context = "ctx.packages"
name = "inspectLocal"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageDependency]]
actor = "system"
sourcePackage = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
targetKind = "capability"
targetId = "dom.render"

[[packageTransformer]]
actor = "system"
id = "packageTransformer.inspect.v1"
package = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
targetRevision = "packageRevision.plugin.inspect.v1"
`);

  const { getBootstrapModel } = createBootstrapReadModels({
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

  const model = await getBootstrapModel(null);
  assert.equal(model.contextBindableTargets.some(row => row.id === "package.plugin.inspect"), true);
  assert.equal(model.contextBindableTargets.some(row => row.id === "packageRevision.plugin.inspect.v1"), true);
  assert.equal(model.contextBindableTargets.some(row => String(row.id).startsWith("packagePatch:")), true);
  assert.equal(model.contextBindableTargets.some(row => row.id === "packageNamespace:ctx.packages:inspectLocal" && row.context === "ctx.packages"), true);
  assert.equal(model.contextBindableTargets.some(row => row.id === "packageDependency:packageRevision.plugin.inspect.v1:capability:dom.render"), true);
  assert.equal(model.contextBindableTargets.some(row => row.id === "packageTransformer.inspect.v1"), true);
});
