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
