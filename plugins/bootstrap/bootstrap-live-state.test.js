import test from "node:test";
import assert from "node:assert/strict";
import { createBootstrapLiveStateReaders, renderBootstrapLiveStateFactory } from "./bootstrap-live-state.js";

test("live bootstrap state readers resolve authored, model, session, scoped selectors, and runtime integration at event time", () => {
  const state = {
    bootstrapState: {
      identities: [],
      contexts: [{ id: "ctx.one" }],
      perspectives: [{ id: "perspective.one" }],
      packages: [{ id: "package.plugin.one", label: "Plugin One" }],
      packageRevisions: [{ id: "packageRevision.plugin.one.v1", package: "package.plugin.one", version: "1.0.0" }],
      packagePatches: [{ id: "packagePatch:one", package: "package.plugin.one", revision: "packageRevision.plugin.one.v1", path: "plugins/one/plugin.json" }],
      packageNamespaces: [{ id: "packageNamespace:ctx.one:pluginOne", context: "ctx.one", name: "pluginOne", package: "package.plugin.one", revision: "packageRevision.plugin.one.v1" }],
      packageDependencies: [{ id: "packageDependency:one", sourcePackage: "package.plugin.one", sourceRevision: "packageRevision.plugin.one.v1", targetId: "dom.render" }],
      packageTransformers: [{ id: "packageTransformer.one", package: "package.plugin.one", sourceRevision: "packageRevision.plugin.one.v1", targetRevision: "packageRevision.plugin.one.v1" }],
      packageCoexistence: [{ id: "packageCoexistence:package.plugin.one", packageId: "package.plugin.one", revisionIds: ["packageRevision.plugin.one.v1"], selectedRevisionIds: ["packageRevision.plugin.one.v1"], namespaceSelections: [{ id: "packageNamespace:ctx.one:pluginOne", context: "ctx.one", name: "pluginOne", revision: "packageRevision.plugin.one.v1" }] }],
      packageConvergence: [{ id: "packageConvergence:package.plugin.one", packageId: "package.plugin.one", coexistenceId: "packageCoexistence:package.plugin.one", transformerIds: ["packageTransformer.one"], convergencePatchIds: ["packagePatch:one"] }],
      packageApplyPreviews: [{ id: "packageApplyPreview:packageRevision.plugin.one.v1", packageId: "package.plugin.one", revisionId: "packageRevision.plugin.one.v1", coexistenceId: "packageCoexistence:package.plugin.one", convergenceId: "packageConvergence:package.plugin.one", selectedNamespaceIds: ["packageNamespace:ctx.one:pluginOne"], manifestConflictIds: [], relatedTransformerIds: ["packageTransformer.one"], relatedConvergencePatchIds: ["packagePatch:one"] }],
      capabilityRevisionHistory: [{ capabilityId: "cap.one", action: "define", version: "1.0.0", witnessId: "w1" }],
      legacyCapabilityCompatibilityMode: { mode: "bridge-active", pendingCount: 1, bridgeSources: ["legacy-context"] },
      legacyCapabilityMigration: { pending: [{ id: "legacyCapabilityMigration:definition:cap.one", action: "definition.update", capabilityId: "cap.one" }] },
      compatibilityBridges: [{ id: "compatibilityBridge:canonicalIdSugar.sameContextVisibleTarget", bridgeClass: "canonical-id-sugar" }],
      governanceRoutes: [{ id: "governanceRoute:POST /api/widgets", handler: "widgets.create", governanceMode: "proposal-fallback" }],
      proposalTargetGovernance: [{ id: "governanceProposalTarget:widget.define", targetProcess: "widget.define", governanceMode: "proposal-fallback" }],
      canonicalIdPolicyClasses: ["same-context-convenience", "imported-target-reference", "legacy-only-path"],
      contextualTargets: [{ id: "widget.one", context: "ctx.one" }],
      contextScopes: [{ context: "ctx.one", sourceKind: "local", target: "widget.one", name: "homePage" }],
      contextExports: [{ context: "ctx.one", name: "homePage", target: "widget.one" }],
      contextNameResolutions: [{ context: "ctx.one", name: "homePage", resolution: "resolved", target: "widget.one", targets: ["widget.one"], sourceKinds: ["local"], rows: [{ context: "ctx.one", sourceKind: "local", target: "widget.one", name: "homePage" }] }],
      contextNameConflicts: []
    },
    session: { authenticated: false },
    model: {
      runtimeProfile: "minimal",
      supportedMcpActingModes: ["delegated"],
      contextBindableTargets: [{ id: "widget.one", context: "ctx.one" }]
    }
  };
  const readers = createBootstrapLiveStateReaders({
    state,
    buildBootstrapRuntimeIntegrationStateFn({ authored, model }) {
      return {
        snapshot: { authored, model },
        runtimePluginAvailabilityForRunner: runnerId => [{ plugin: "plugin." + runnerId }],
        runtimePluginAvailabilityRow: (runnerId, pluginId) => ({ runnerId, pluginId }),
        mcpSupportedTools: () => [{ name: "notes.write" }],
        mcpInstalledToolsForServer: () => [{ tool: "notes.search" }],
        mcpServerRow: () => ({ id: "notes" }),
        mcpSupportedToolRow: () => ({ name: "notes.write" }),
        mcpScopeSummary: () => "scoped"
      };
    }
  });

  state.bootstrapState = {
    identities: [{ id: "identity.aaron" }],
    contexts: [{ id: "ctx.two" }],
    perspectives: [{ id: "perspective.two" }],
    packages: [{ id: "package.plugin.inspect", label: "Inspect" }],
    packageRevisions: [
      { id: "packageRevision.plugin.inspect.v1", package: "package.plugin.inspect", version: "1.0.0" },
      { id: "packageRevision.plugin.inspect.v2", package: "package.plugin.inspect", version: "2.0.0" }
    ],
    packagePatches: [
      { id: "packagePatch:inspect", package: "package.plugin.inspect", revision: "packageRevision.plugin.inspect.v2", path: "plugins/inspect/runtime.js" }
    ],
    packageNamespaces: [
      { id: "packageNamespace:ctx.alpha:inspectA", context: "ctx.alpha", name: "inspectA", package: "package.plugin.inspect", revision: "packageRevision.plugin.inspect.v1" },
      { id: "packageNamespace:ctx.beta:inspectB", context: "ctx.beta", name: "inspectB", package: "package.plugin.inspect", revision: "packageRevision.plugin.inspect.v2" }
    ],
    packageDependencies: [
      { id: "packageDependency:inspect", sourcePackage: "package.plugin.inspect", sourceRevision: "packageRevision.plugin.inspect.v2", targetId: "dom.render" }
    ],
    packageTransformers: [
      { id: "packageTransformer.inspect.v1-to-v2", package: "package.plugin.inspect", sourceRevision: "packageRevision.plugin.inspect.v1", targetRevision: "packageRevision.plugin.inspect.v2", sourceNamespace: "packageNamespace:ctx.alpha:inspectA", targetNamespace: "packageNamespace:ctx.beta:inspectB" }
    ],
    packageCoexistence: [{
      id: "packageCoexistence:package.plugin.inspect",
      packageId: "package.plugin.inspect",
      revisionIds: ["packageRevision.plugin.inspect.v1", "packageRevision.plugin.inspect.v2"],
      selectedRevisionIds: ["packageRevision.plugin.inspect.v1", "packageRevision.plugin.inspect.v2"],
      namespaceSelections: [
        { id: "packageNamespace:ctx.alpha:inspectA", context: "ctx.alpha", name: "inspectA", revision: "packageRevision.plugin.inspect.v1" },
        { id: "packageNamespace:ctx.beta:inspectB", context: "ctx.beta", name: "inspectB", revision: "packageRevision.plugin.inspect.v2" }
      ]
    }],
    packageConvergence: [{
      id: "packageConvergence:package.plugin.inspect",
      packageId: "package.plugin.inspect",
      coexistenceId: "packageCoexistence:package.plugin.inspect",
      transformerIds: ["packageTransformer.inspect.v1-to-v2"],
      convergencePatchIds: ["packagePatch:inspect"]
    }],
    packageApplyPreviews: [{
      id: "packageApplyPreview:packageRevision.plugin.inspect.v2",
      packageId: "package.plugin.inspect",
      revisionId: "packageRevision.plugin.inspect.v2",
      coexistenceId: "packageCoexistence:package.plugin.inspect",
      convergenceId: "packageConvergence:package.plugin.inspect",
      selectedNamespaceIds: ["packageNamespace:ctx.beta:inspectB"],
      manifestConflictIds: ["packageManifestConflict:package.plugin.inspect:plugin.inspect"],
      relatedTransformerIds: ["packageTransformer.inspect.v1-to-v2"],
      relatedConvergencePatchIds: ["packagePatch:inspect"]
    }],
    capabilityRevisionHistory: [
      { capabilityId: "cap.two", action: "define", version: "1.0.0", witnessId: "w2" },
      { capabilityId: "cap.two", action: "update", version: "2.0.0", previousVersion: "1.0.0", witnessId: "w3" }
    ],
    legacyCapabilityCompatibilityMode: { mode: "first-class-only", pendingCount: 0, bridgeSources: [] },
    legacyCapabilityMigration: { pending: [] },
    compatibilityBridges: [{ id: "compatibilityBridge:canonicalIdSugar.importedVisibleTarget", bridgeClass: "canonical-id-sugar" }],
    governanceRoutes: [{ id: "governanceRoute:POST /api/widgets", handler: "widgets.create", governanceMode: "proposal-fallback" }],
    proposalTargetGovernance: [{ id: "governanceProposalTarget:widget.define", targetProcess: "widget.define", governanceMode: "proposal-fallback" }],
    canonicalIdPolicyClasses: ["same-context-convenience", "imported-target-reference", "legacy-only-path"],
    contextualTargets: [{ id: "widget.two", context: "ctx.two" }, { id: "widget.source", context: "ctx.source" }, { id: "widget.hidden", context: "ctx.hidden" }],
    contextScopes: [
      { context: "ctx.two", sourceKind: "local", target: "widget.two", name: "homePage" },
      { context: "ctx.two", sourceKind: "import", target: "widget.source", name: "sourcePage", sourceContext: "ctx.source", exportName: "homePage" }
    ],
    contextExports: [{ context: "ctx.two", name: "homePage", target: "widget.two" }],
    contextNameResolutions: [
      { context: "ctx.two", name: "homePage", resolution: "resolved", target: "widget.two", targets: ["widget.two"], sourceKinds: ["local"], rows: [{ context: "ctx.two", sourceKind: "local", target: "widget.two", name: "homePage" }] },
      { context: "ctx.two", name: "sourcePage", resolution: "resolved", target: "widget.source", targets: ["widget.source"], sourceKinds: ["import"], rows: [{ context: "ctx.two", sourceKind: "import", target: "widget.source", name: "sourcePage", sourceContext: "ctx.source", exportName: "homePage" }] },
      { context: "ctx.two", name: "collision", resolution: "ambiguous", target: null, targets: ["widget.source", "widget.two"], sourceKinds: ["import", "local"], rows: [] }
    ],
    contextNameConflicts: [{ context: "ctx.two", name: "collision", targets: ["widget.source", "widget.two"], sourceKinds: ["import", "local"], rows: [] }]
  };
  state.session = { authenticated: true };
  state.model = {
    runtimeProfile: "full",
    supportedMcpActingModes: ["delegated", "service"],
    contextBindableTargets: [{ id: "widget.two", context: "ctx.two" }]
  };

  assert.deepEqual(readers.authored(), state.bootstrapState);
  assert.deepEqual(readers.session(), { authenticated: true });
  assert.deepEqual(readers.model(), state.model);
  assert.equal(readers.runtimeProfile(), "full");
  assert.deepEqual(readers.supportedMcpActingModes(), ["delegated", "service"]);
  assert.deepEqual(readers.contextRows(), [{ id: "ctx.two" }]);
  assert.deepEqual(readers.packageRows(), [{ id: "package.plugin.inspect", label: "Inspect" }]);
  assert.deepEqual(readers.packageRevisionRows("package.plugin.inspect"), [
    { id: "packageRevision.plugin.inspect.v1", package: "package.plugin.inspect", version: "1.0.0" },
    { id: "packageRevision.plugin.inspect.v2", package: "package.plugin.inspect", version: "2.0.0" }
  ]);
  assert.deepEqual(readers.packagePatchRows("packageRevision.plugin.inspect.v2"), [
    { id: "packagePatch:inspect", package: "package.plugin.inspect", revision: "packageRevision.plugin.inspect.v2", path: "plugins/inspect/runtime.js" }
  ]);
  assert.deepEqual(readers.packageNamespaceRows("ctx.beta:inspectB"), [
    { id: "packageNamespace:ctx.beta:inspectB", context: "ctx.beta", name: "inspectB", package: "package.plugin.inspect", revision: "packageRevision.plugin.inspect.v2" }
  ]);
  assert.deepEqual(readers.packageDependencyRows("packageRevision.plugin.inspect.v2"), [
    { id: "packageDependency:inspect", sourcePackage: "package.plugin.inspect", sourceRevision: "packageRevision.plugin.inspect.v2", targetId: "dom.render" }
  ]);
  assert.deepEqual(readers.packageTransformerRows("packageRevision.plugin.inspect.v2"), [
    { id: "packageTransformer.inspect.v1-to-v2", package: "package.plugin.inspect", sourceRevision: "packageRevision.plugin.inspect.v1", targetRevision: "packageRevision.plugin.inspect.v2", sourceNamespace: "packageNamespace:ctx.alpha:inspectA", targetNamespace: "packageNamespace:ctx.beta:inspectB" }
  ]);
  assert.deepEqual(readers.packageCoexistenceRows("packageRevision.plugin.inspect.v2"), [{
    id: "packageCoexistence:package.plugin.inspect",
    packageId: "package.plugin.inspect",
    revisionIds: ["packageRevision.plugin.inspect.v1", "packageRevision.plugin.inspect.v2"],
    selectedRevisionIds: ["packageRevision.plugin.inspect.v1", "packageRevision.plugin.inspect.v2"],
    namespaceSelections: [
      { id: "packageNamespace:ctx.alpha:inspectA", context: "ctx.alpha", name: "inspectA", revision: "packageRevision.plugin.inspect.v1" },
      { id: "packageNamespace:ctx.beta:inspectB", context: "ctx.beta", name: "inspectB", revision: "packageRevision.plugin.inspect.v2" }
    ]
  }]);
  assert.deepEqual(readers.packageConvergenceRows("packageTransformer.inspect.v1-to-v2"), [{
    id: "packageConvergence:package.plugin.inspect",
    packageId: "package.plugin.inspect",
    coexistenceId: "packageCoexistence:package.plugin.inspect",
    transformerIds: ["packageTransformer.inspect.v1-to-v2"],
    convergencePatchIds: ["packagePatch:inspect"]
  }]);
  assert.deepEqual(readers.packageApplyPreviewRows("packageRevision.plugin.inspect.v2"), [{
    id: "packageApplyPreview:packageRevision.plugin.inspect.v2",
    packageId: "package.plugin.inspect",
    revisionId: "packageRevision.plugin.inspect.v2",
    coexistenceId: "packageCoexistence:package.plugin.inspect",
    convergenceId: "packageConvergence:package.plugin.inspect",
    selectedNamespaceIds: ["packageNamespace:ctx.beta:inspectB"],
    manifestConflictIds: ["packageManifestConflict:package.plugin.inspect:plugin.inspect"],
    relatedTransformerIds: ["packageTransformer.inspect.v1-to-v2"],
    relatedConvergencePatchIds: ["packagePatch:inspect"]
  }]);
  assert.deepEqual(readers.capabilityRevisionHistoryRows("cap.two"), [
    { capabilityId: "cap.two", action: "define", version: "1.0.0", witnessId: "w2" },
    { capabilityId: "cap.two", action: "update", version: "2.0.0", previousVersion: "1.0.0", witnessId: "w3" }
  ]);
  assert.deepEqual(readers.legacyCapabilityCompatibilityMode(), { mode: "first-class-only", pendingCount: 0, bridgeSources: [] });
  assert.deepEqual(readers.legacyCapabilityMigrationRows(), []);
  assert.deepEqual(readers.compatibilityBridgeRows(), [{ id: "compatibilityBridge:canonicalIdSugar.importedVisibleTarget", bridgeClass: "canonical-id-sugar" }]);
  assert.deepEqual(readers.governanceRouteRows(), [{ id: "governanceRoute:POST /api/widgets", handler: "widgets.create", governanceMode: "proposal-fallback" }]);
  assert.deepEqual(readers.proposalTargetGovernanceRows(), [{ id: "governanceProposalTarget:widget.define", targetProcess: "widget.define", governanceMode: "proposal-fallback" }]);
  assert.deepEqual(readers.contextBindableTargets("ctx.two"), [{ id: "widget.two", context: "ctx.two" }]);
  assert.deepEqual(readers.contextScopeRows("ctx.two", "local"), [{ context: "ctx.two", sourceKind: "local", target: "widget.two", name: "homePage" }]);
  assert.deepEqual(readers.contextExportRows("ctx.two"), [{ context: "ctx.two", name: "homePage", target: "widget.two" }]);
  assert.equal(readers.contextNameResolutionRows("ctx.two").length, 3);
  assert.deepEqual(readers.contextNameConflictRows("ctx.two"), [{ context: "ctx.two", name: "collision", targets: ["widget.source", "widget.two"], sourceKinds: ["import", "local"], rows: [] }]);
  assert.deepEqual(readers.canonicalIdPolicyClasses(), ["same-context-convenience", "imported-target-reference", "legacy-only-path"]);
  assert.equal(readers.explainContextualName("ctx.two", "homePage").target, "widget.two");
  assert.equal(readers.explainContextualName("ctx.two", "sourcePage").resolution, "import");
  assert.equal(readers.explainContextualName("ctx.two", "collision").ok, false);
  assert.equal(readers.explainTargetVisibility("ctx.two", "widget.source").visibility, "import");
  assert.equal(readers.explainTargetVisibility("ctx.two", "widget.two").visibility, "local");
  assert.equal(readers.explainTargetVisibility("ctx.two", "widget.missing").visibility, "unscoped");
  assert.equal(readers.classifyCanonicalIdPolicy("ctx.two", "widget.two").policyClass, "same-context-convenience");
  assert.equal(readers.classifyCanonicalIdPolicy("ctx.two", "widget.source").policyClass, "imported-target-reference");
  assert.equal(readers.classifyCanonicalIdPolicy("ctx.two", "widget.missing").policyClass, "legacy-only-path");
  assert.equal(readers.classifyCanonicalIdPolicy("ctx.two", "widget.hidden").ok, false);
  assert.deepEqual(readers.stewardshipTargetKinds(), []);
  assert.deepEqual(readers.stewardshipTargetsFor("context"), [{ id: "ctx.two" }]);
  assert.deepEqual(readers.stewardshipTargetsFor("perspective"), [{ id: "perspective.two" }]);
  assert.deepEqual(readers.runtimeIntegrationState().snapshot, {
    authored: state.bootstrapState,
    model: state.model
  });
  assert.deepEqual(readers.runtimeIntegrationState().runtimePluginAvailabilityForRunner("demo"), [{ plugin: "plugin.demo" }]);
});

test("live bootstrap state factory exposes the browser helper seam", () => {
  const factory = renderBootstrapLiveStateFactory();
  assert.equal(factory.includes("const createBootstrapLiveStateReaders ="), true);
});
