import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { buildPlatformModel } from "./platform-model.js";
import { renderPlatformPage } from "./platform-page.js";

function packageWorld() {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.alpha"

[[context]]
actor = "system"
id = "ctx.beta"

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

[[packageDependency]]
actor = "system"
sourcePackage = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v2"
targetKind = "capability"
targetId = "dom.render"
versionRange = "*"
runtimeProfiles = ["full"]
`);
  return world;
}

test("platform model surfaces remaining authored package nouns as first-class nodes", async () => {
  const world = packageWorld();
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: [],
      routes: [],
      surfaces: [],
      plugins: {
        activePluginIds: [],
        effectivePluginIds: [],
        rejectedPlugins: []
      }
    },
    project: projector => world.project(projector)
  });

  const patchNode = model.nodes.find(node => node.kind === "packagePatch");
  assert.ok(patchNode);
  assert.equal(patchNode.title, "plugins/inspect/runtime.js");
  assert.equal(model.nodes.some(node => node.id === "packageDependency:packageRevision.plugin.inspect.v2:capability:dom.render" && node.kind === "packageDependency"), true);
  assert.equal(model.nodes.some(node => node.id === "packageConvergence:package.plugin.inspect" && node.kind === "packageConvergence"), true);
  assert.equal(model.nodes.some(node => node.id === "packageApplyPreview:packageRevision.plugin.inspect.v2" && node.kind === "packageApplyPreview"), true);
  assert.equal(model.edges.some(edge => edge.from === "packageRevision.plugin.inspect.v2" && edge.rel === "contains" && edge.to === patchNode.id), true);
  assert.equal(model.edges.some(edge => edge.from === patchNode.id && edge.rel === "convergesVia" && edge.to === "packageTransformer.inspect.v1-to-v2"), true);
  assert.equal(model.edges.some(edge => edge.from === "packageDependency:packageRevision.plugin.inspect.v2:capability:dom.render" && edge.rel === "targets" && edge.to === "dom.render"), true);
  assert.equal(model.edges.some(edge => edge.from === "packageConvergence:package.plugin.inspect" && edge.rel === "includes" && edge.to === patchNode.id), true);
  assert.equal(model.edges.some(edge => edge.from === "packageApplyPreview:packageRevision.plugin.inspect.v2" && edge.rel === "tracks" && edge.to === "packageRevision.plugin.inspect.v2"), true);
});

test("platform page routes bridge, governance, semantics, and package nouns to dedicated platform views", async () => {
  const world = packageWorld();
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: [],
      routes: [{ method: "POST", matcher: "/api/platform-change-sets/demo/apply", handler: "platform.changeSet.apply" }],
      surfaces: [],
      plugins: {
        activePluginIds: [],
        effectivePluginIds: [],
        rejectedPlugins: []
      },
      proposalTargetGovernance: [{
        id: "governanceProposalTarget:runtimePlugin.install",
        targetProcess: "runtimePlugin.install",
        operationSemantics: "governed-mutation",
        governanceMode: "proposal-fallback",
        authorityMechanism: "bootstrap-target-authority",
        sharedAuthorityPath: true,
        workflowRole: "proposal-target",
        bootstrapSelectable: true,
        notes: "Runtime-plugin install proposals execute through shared server-runner target authority once approved."
      }]
    },
    project: projector => world.project(projector)
  });

  const bridgeId = model.compatibilityBridges[0].id;
  const governanceRouteId = model.governanceRoutes[0].id;
  const governanceTargetId = model.proposalTargetGovernance[0].id;
  const semanticsId = "mutableSurface:demo.privateNotes";
  const packageId = "package.plugin.inspect";
  const revisionId = "packageRevision.plugin.inspect.v1";
  const applyPreviewId = "packageApplyPreview:packageRevision.plugin.inspect.v2";
  const transformerId = "packageTransformer.inspect.v1-to-v2";
  const patchId = model.nodes.find(node => node.kind === "packagePatch")?.id;

  const bridgeHtml = renderPlatformPage(model, {
    requestUrl: new URL(`http://platform.local/platform?view=bridges&id=${encodeURIComponent(bridgeId)}`)
  });
  const governanceRouteHtml = renderPlatformPage(model, {
    requestUrl: new URL(`http://platform.local/platform?view=governance&id=${encodeURIComponent(governanceRouteId)}`)
  });
  const governanceTargetHtml = renderPlatformPage(model, {
    requestUrl: new URL(`http://platform.local/platform?view=governance&id=${encodeURIComponent(governanceTargetId)}`)
  });
  const semanticsHtml = renderPlatformPage(model, {
    requestUrl: new URL(`http://platform.local/platform?view=semantics&id=${encodeURIComponent(semanticsId)}`)
  });
  const packageHtml = renderPlatformPage(model, {
    requestUrl: new URL(`http://platform.local/platform?view=packageCoexistence&id=${encodeURIComponent(packageId)}`)
  });
  const revisionHtml = renderPlatformPage(model, {
    requestUrl: new URL(`http://platform.local/platform?view=packageCoexistence&id=${encodeURIComponent(revisionId)}`)
  });
  const transformerHtml = renderPlatformPage(model, {
    requestUrl: new URL(`http://platform.local/platform?view=packageConvergence&id=${encodeURIComponent(transformerId)}`)
  });
  const applyPreviewHtml = renderPlatformPage(model, {
    requestUrl: new URL(`http://platform.local/platform?view=packageApplyPreview&id=${encodeURIComponent(applyPreviewId)}`)
  });
  const patchHtml = renderPlatformPage(model, {
    requestUrl: new URL(`http://platform.local/platform?view=packageConvergence&id=${encodeURIComponent(patchId)}`)
  });

  assert.match(bridgeHtml, /Platform Console - Advanced \/ Bridges/);
  assert.match(bridgeHtml, /canonical-id-sugar/);
  assert.match(bridgeHtml, /\/platform\?area=advanced&amp;section=bridges/);
  assert.match(governanceRouteHtml, /Platform Console - Advanced \/ Governance/);
  assert.match(governanceRouteHtml, /platform\.changeSet\.apply/);
  assert.match(governanceRouteHtml, /\/platform\?area=advanced&amp;section=governance/);
  assert.match(governanceTargetHtml, /runtimePlugin\.install/);
  assert.match(governanceTargetHtml, /\/platform\?area=advanced&amp;section=governance/);
  assert.match(semanticsHtml, /Platform Console - Advanced \/ Semantics/);
  assert.match(semanticsHtml, /actor-private/);
  assert.match(semanticsHtml, /\/platform\?area=advanced&amp;section=semantics/);
  assert.match(packageHtml, /Platform Console - Advanced \/ Packages/);
  assert.match(packageHtml, /packageRevision\.plugin\.inspect\.v1/);
  assert.match(packageHtml, /\/platform\?area=advanced&amp;section=packages/);
  assert.match(revisionHtml, /packageRevision\.plugin\.inspect\.v1/);
  assert.match(revisionHtml, /\/platform\?area=advanced&amp;section=packages/);
  assert.match(transformerHtml, /Platform Console - Advanced \/ Packages/);
  assert.match(transformerHtml, /glue-required/);
  assert.match(transformerHtml, /\/platform\?area=advanced&amp;section=packages/);
  assert.match(applyPreviewHtml, /Platform Console - Advanced \/ Packages/);
  assert.match(applyPreviewHtml, /packageApplyPreview:packageRevision\.plugin\.inspect\.v2/);
  assert.match(applyPreviewHtml, /\/platform\?area=advanced&amp;section=packages/);
  assert.match(patchHtml, /packagePatch:[0-9a-f]{64}/);
  assert.match(patchHtml, /\/platform\?area=advanced&amp;section=packages/);
});

test("platform page renders package apply preview through its dedicated review surface", async () => {
  const world = packageWorld();
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: [],
      routes: [],
      surfaces: [],
      plugins: {
        activePluginIds: [],
        effectivePluginIds: [],
        rejectedPlugins: []
      }
    },
    project: projector => world.project(projector)
  });

  const html = renderPlatformPage(model, {
    requestUrl: new URL("http://platform.local/platform?view=packageApplyPreview&id=packageRevision.plugin.inspect.v2")
  });

  assert.match(html, /Platform Console - Advanced \/ Packages/);
  assert.match(html, /Package Apply Preview Rows/);
  assert.match(html, /Package Apply Preview Detail/);
  assert.match(html, /glue-required/);
  assert.match(html, /packageApplyPreview:packageRevision\.plugin\.inspect\.v2/);
});
