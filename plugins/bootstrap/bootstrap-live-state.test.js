import test from "node:test";
import assert from "node:assert/strict";
import { createBootstrapLiveStateReaders, renderBootstrapLiveStateFactory } from "./bootstrap-live-state.js";

test("live bootstrap state readers resolve authored, model, session, scoped selectors, and runtime integration at event time", () => {
  const state = {
    bootstrapState: {
      identities: [],
      contexts: [{ id: "ctx.one" }],
      perspectives: [{ id: "perspective.one" }],
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
