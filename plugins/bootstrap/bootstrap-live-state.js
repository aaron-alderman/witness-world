import { buildBootstrapRuntimeIntegrationState } from "./bootstrap-runtime-integration-state.js";

export function renderBootstrapLiveStateFactory() {
  return String.raw`
    const createBootstrapLiveStateReaders = ${createBootstrapLiveStateReaders.toString()};
  `;
}

export function createBootstrapLiveStateReaders({
  state = {},
  buildBootstrapRuntimeIntegrationStateFn = buildBootstrapRuntimeIntegrationState
} = {}) {
  const uniqueStrings = values => [...new Set((values || []).map(value => String(value)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const canonicalIdPolicyClasses = ["same-context-convenience", "imported-target-reference", "legacy-only-path"];
  return {
    authored() {
      return state.bootstrapState || {};
    },
    session() {
      return state.session || {};
    },
    model() {
      return state.model || {};
    },
    runtimeProfile() {
      return state.model?.runtimeProfile || "full";
    },
    supportedMcpActingModes() {
      return state.model?.supportedMcpActingModes || [];
    },
    contextRows() {
      return state.bootstrapState?.contexts || [];
    },
    packageRows() {
      return state.bootstrapState?.packages || [];
    },
    packageRevisionRows(packageId = null) {
      const rows = state.bootstrapState?.packageRevisions || [];
      const id = typeof packageId === "string" ? packageId.trim() : "";
      return id ? rows.filter(row => row.package === id || row.id === id) : rows;
    },
    packagePatchRows(revisionId = null) {
      const rows = state.bootstrapState?.packagePatches || [];
      const id = typeof revisionId === "string" ? revisionId.trim() : "";
      return id ? rows.filter(row => row.revision === id || row.id === id || row.package === id) : rows;
    },
    packageNamespaceRows(id = null) {
      const rows = state.bootstrapState?.packageNamespaces || [];
      const target = typeof id === "string" ? id.trim() : "";
      return target ? rows.filter(row =>
        row.id === target
        || row.package === target
        || row.revision === target
        || row.context === target
        || row.name === target
        || `${row.context}:${row.name}` === target
      ) : rows;
    },
    packageDependencyRows(id = null) {
      const rows = state.bootstrapState?.packageDependencies || [];
      const target = typeof id === "string" ? id.trim() : "";
      return target ? rows.filter(row =>
        row.id === target
        || row.sourcePackage === target
        || row.sourceRevision === target
        || row.targetId === target
      ) : rows;
    },
    packageTransformerRows(id = null) {
      const rows = state.bootstrapState?.packageTransformers || [];
      const target = typeof id === "string" ? id.trim() : "";
      return target ? rows.filter(row =>
        row.id === target
        || row.package === target
        || row.sourceRevision === target
        || row.targetRevision === target
        || row.sourceNamespace === target
        || row.targetNamespace === target
      ) : rows;
    },
    packageCoexistenceRows(id = null) {
      const rows = state.bootstrapState?.packageCoexistence || [];
      const target = typeof id === "string" ? id.trim() : "";
      return target ? rows.filter(row =>
        row.id === target
        || row.packageId === target
        || (row.revisionIds || []).includes(target)
        || (row.selectedRevisionIds || []).includes(target)
        || (row.namespaceSelections || []).some(namespace =>
          namespace.id === target
          || namespace.context === target
          || namespace.name === target
          || `${namespace.context}:${namespace.name}` === target
          || namespace.revision === target
        )
      ) : rows;
    },
    packageConvergenceRows(id = null) {
      const rows = state.bootstrapState?.packageConvergence || [];
      const target = typeof id === "string" ? id.trim() : "";
      return target ? rows.filter(row =>
        row.id === target
        || row.packageId === target
        || row.coexistenceId === target
        || (row.transformerIds || []).includes(target)
        || (row.convergencePatchIds || []).includes(target)
      ) : rows;
    },
    packageApplyPreviewRows(id = null) {
      const rows = state.bootstrapState?.packageApplyPreviews || [];
      const target = typeof id === "string" ? id.trim() : "";
      return target ? rows.filter(row =>
        row.id === target
        || row.packageId === target
        || row.revisionId === target
        || row.coexistenceId === target
        || row.convergenceId === target
        || (row.selectedNamespaceIds || []).includes(target)
        || (row.manifestConflictIds || []).includes(target)
        || (row.relatedTransformerIds || []).includes(target)
        || (row.relatedConvergencePatchIds || []).includes(target)
      ) : rows;
    },
    compatibilityBridgeRows() {
      return state.bootstrapState?.compatibilityBridges || [];
    },
    legacyCapabilityCompatibilityMode() {
      return state.bootstrapState?.legacyCapabilityCompatibilityMode || {
        mode: "first-class-only",
        pendingCount: 0,
        bridgeSources: []
      };
    },
    legacyCapabilityMigrationRows() {
      return state.bootstrapState?.legacyCapabilityMigration?.pending || [];
    },
    capabilityRevisionHistoryRows(capabilityId = null) {
      const rows = state.bootstrapState?.capabilityRevisionHistory || [];
      const id = typeof capabilityId === "string" ? capabilityId.trim() : "";
      return id ? rows.filter(row => row.capabilityId === id || row.witnessId === id) : rows;
    },
    governanceRouteRows() {
      return state.bootstrapState?.governanceRoutes || [];
    },
    proposalTargetGovernanceRows() {
      return state.bootstrapState?.proposalTargetGovernance || [];
    },
    contextBindableTargets(contextId) {
      return (state.model?.contextBindableTargets || []).filter(row => !row.context || row.context === contextId);
    },
    contextScopeRows(contextId, sourceKind = null) {
      return (state.bootstrapState?.contextScopes || [])
        .filter(row => row.context === contextId && (!sourceKind || row.sourceKind === sourceKind));
    },
    contextExportRows(contextId) {
      return (state.bootstrapState?.contextExports || []).filter(row => row.context === contextId);
    },
    contextNameResolutionRows(contextId, resolution = null) {
      return (state.bootstrapState?.contextNameResolutions || [])
        .filter(row => row.context === contextId && (!resolution || row.resolution === resolution));
    },
    contextNameConflictRows(contextId) {
      return (state.bootstrapState?.contextNameConflicts || []).filter(row => row.context === contextId);
    },
    canonicalIdPolicyClasses() {
      return state.bootstrapState?.canonicalIdPolicyClasses || canonicalIdPolicyClasses;
    },
    explainContextualName(contextId, name) {
      const context = typeof contextId === "string" ? contextId.trim() : "";
      const localName = typeof name === "string" ? name.trim() : "";
      if (!context || !localName) {
        return {
          ok: false,
          context: context || null,
          name: localName || null,
          resolution: "invalid",
          target: null,
          targets: [],
          rows: [],
          reason: "context and name are required for contextual resolution"
        };
      }
      const row = (state.bootstrapState?.contextNameResolutions || [])
        .find(entry => entry.context === context && entry.name === localName) || null;
      if (!row) {
        return {
          ok: false,
          context,
          name: localName,
          resolution: "missing",
          target: null,
          targets: [],
          rows: [],
          reason: "name not visible in context: " + localName
        };
      }
      if (row.resolution !== "resolved" || !row.target) {
        return {
          ok: false,
          context,
          name: localName,
          resolution: "ambiguous",
          target: null,
          targets: row.targets || [],
          rows: row.rows || [],
          reason: "name resolves ambiguously in context: " + localName
        };
      }
      return {
        ok: true,
        context,
        name: localName,
        resolution: (row.sourceKinds || []).includes("local") ? "local" : "import",
        target: row.target,
        targets: row.targets || [],
        rows: row.rows || [],
        reason: ((row.sourceKinds || []).includes("local")
          ? "name resolves through a local binding in context: "
          : "name resolves through an imported binding in context: ") + localName
      };
    },
    explainTargetVisibility(contextId, targetId) {
      const context = typeof contextId === "string" ? contextId.trim() : "";
      const target = typeof targetId === "string" ? targetId.trim() : "";
      if (!context || !target) {
        return {
          ok: false,
          context: context || null,
          target: target || null,
          visible: false,
          visibility: "invalid",
          targetContext: null,
          names: [],
          rows: [],
          reason: "context and target are required for visibility explanation"
        };
      }
      const rows = (state.bootstrapState?.contextScopes || []).filter(row => row.context === context && row.target === target);
      const names = uniqueStrings(rows.map(row => row.name));
      const contextualTarget = (state.bootstrapState?.contextualTargets || []).find(row => row.id === target) || null;
      if (!contextualTarget && rows.length) {
        return {
          ok: true,
          context,
          target,
          visible: true,
          visibility: rows.some(row => row.sourceKind === "import") ? "import" : "local",
          targetContext: null,
          names,
          rows,
          reason: rows.some(row => row.sourceKind === "import")
            ? "target is visible in context " + context + " through explicit import or binding"
            : "target is locally bound in context " + context
        };
      }
      if (!contextualTarget) {
        return {
          ok: true,
          context,
          target,
          visible: true,
          visibility: "unscoped",
          targetContext: null,
          names,
          rows,
          reason: "target is unscoped and remains canonically visible in context " + context
        };
      }
      if (contextualTarget.context === context) {
        return {
          ok: true,
          context,
          target,
          visible: true,
          visibility: rows.some(row => row.sourceKind === "local") ? "local" : "same-context",
          targetContext: contextualTarget.context,
          names,
          rows,
          reason: rows.some(row => row.sourceKind === "local")
            ? "target is locally bound in context " + context
            : "target belongs to authoring context " + context
        };
      }
      if (rows.length) {
        return {
          ok: true,
          context,
          target,
          visible: true,
          visibility: "import",
          targetContext: contextualTarget.context,
          names,
          rows,
          reason: "target is visible in context " + context + " through explicit import or binding"
        };
      }
      return {
        ok: false,
        context,
        target,
        visible: false,
        visibility: "hidden",
        targetContext: contextualTarget.context,
        names,
        rows,
        reason: "target " + target + " belongs to context " + contextualTarget.context + " and is not visible in authoring context " + context
      };
    },
    classifyCanonicalIdPolicy(contextId, targetId) {
      const context = typeof contextId === "string" ? contextId.trim() : "";
      const target = typeof targetId === "string" ? targetId.trim() : "";
      if (!context || !target) {
        return {
          ok: false,
          policyClass: null,
          reason: "context and target are required for canonical-id policy classification"
        };
      }
      const visibility = this.explainTargetVisibility(context, target);
      if (!visibility.ok) {
        return {
          ok: false,
          policyClass: null,
          reason: visibility.reason,
          visibility
        };
      }
      if (visibility.targetContext === context) {
        return {
          ok: true,
          policyClass: "same-context-convenience",
          visibility
        };
      }
      if (visibility.targetContext) {
        return {
          ok: true,
          policyClass: "imported-target-reference",
          visibility
        };
      }
      if (visibility.visibility === "unscoped") {
        return {
          ok: true,
          policyClass: "legacy-only-path",
          visibility
        };
      }
      return {
        ok: true,
        policyClass: null,
        visibility
      };
    },
    stewardshipTargetKinds() {
      return state.model?.stewardshipTargetKinds || [];
    },
    stewardshipTargetsFor(targetKind) {
      const authored = state.bootstrapState || {};
      if (targetKind === "context") return authored.contexts || [];
      if (targetKind === "perspective") return authored.perspectives || [];
      return [];
    },
    runtimeIntegrationState() {
      return buildBootstrapRuntimeIntegrationStateFn({
        authored: state.bootstrapState || {},
        model: state.model || {}
      });
    }
  };
}
