import { createBootstrapCapabilityControlsRuntime } from "./bootstrap-capability-controls-sync.js";
import { createBootstrapBackendControlsSyncDepsBuilder } from "./bootstrap-controls-sync.js";
import { createBootstrapProposalControlsSyncDepsBuilder } from "./bootstrap-proposal-controls-sync.js";
import { createBootstrapProposalAdjacentSyncDepsBuilder } from "./bootstrap-proposal-adjacent-sync.js";
import { createBootstrapRuntimeIntegrationDirectControlsSyncDepsBuilder } from "./bootstrap-runtime-integration-direct-controls-sync.js";
import { buildBootstrapRuntimeIntegrationState } from "./bootstrap-runtime-integration-state.js";
import { createBootstrapScopedControlsSyncDepsBuilder } from "./bootstrap-scoped-controls-sync.js";
import { createBootstrapDomHelpers } from "./bootstrap-dom-helpers.js";
import { createBootstrapLiveStateReaders } from "./bootstrap-live-state.js";

export function renderBootstrapControlsRuntimeFactory() {
  return String.raw`
    const createBootstrapControlsRuntimeFromBootstrap = ${createBootstrapControlsRuntimeFromBootstrap.toString()};
  `;
}

export function createBootstrapControlsRuntimeFromBootstrap({
  state = {},
  target = null,
  document = null,
  buildBootstrapRuntimeIntegrationStateFn = buildBootstrapRuntimeIntegrationState
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  const resolvedDocument = document || resolvedTarget?.document || globalThis?.document || null;
  const dom = createBootstrapDomHelpers({ document: resolvedDocument });
  const liveState = createBootstrapLiveStateReaders({
    state,
    buildBootstrapRuntimeIntegrationStateFn
  });

  return {
    dom,
    liveState,
    buildBackendControlsSyncDeps: createBootstrapBackendControlsSyncDepsBuilder({
      state,
      liveState,
      dom
    }),
    buildProposalControlsSyncDeps: createBootstrapProposalControlsSyncDepsBuilder({
      state,
      liveState,
      dom
    }),
    buildProposalAdjacentSyncDeps: createBootstrapProposalAdjacentSyncDepsBuilder({
      state,
      liveState,
      dom,
      buildBootstrapRuntimeIntegrationStateFn
    }),
    capabilityControls: createBootstrapCapabilityControlsRuntime({
      target: resolvedTarget,
      liveState,
      dom
    }),
    buildRuntimeIntegrationDirectControlsSyncDeps:
      createBootstrapRuntimeIntegrationDirectControlsSyncDepsBuilder({
        state,
        liveState,
        dom
      }),
    buildScopedControlsSyncDeps: createBootstrapScopedControlsSyncDepsBuilder({
      state,
      liveState,
      dom
    })
  };
}
