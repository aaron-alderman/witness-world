import { renderBootstrapGuidanceStateFactory } from "../../src/runtime-guidance-bootstrap-client.js";
import { renderBootstrapGuidanceControllerFactory } from "../../src/runtime-guidance-bootstrap-controller-client.js";
import { renderBootstrapBackendAuthoringSubmitFactory } from "./bootstrap-backend-authoring-submit.js";
import { renderBootstrapBackendAuthoringControlsViewFactory } from "./bootstrap-backend-authoring-controls-view.js";
import { renderBootstrapBackendVersionSubmitFactory } from "./bootstrap-backend-version-submit.js";
import { renderBootstrapBackendVersionControlsViewFactory } from "./bootstrap-backend-version-controls-view.js";
import { renderBootstrapCapabilitySubmitFactory } from "./bootstrap-capability-submit.js";
import { renderBootstrapCapabilityControlsSyncFactory } from "./bootstrap-capability-controls-sync.js";
import { renderBootstrapClientHttpFactory } from "./bootstrap-client-http.js";
import { renderBootstrapClientRuntimeBindersFactory } from "./bootstrap-client-runtime-binders.js";
import { renderBootstrapClientRuntimeGuidanceFactory } from "./bootstrap-client-runtime-guidance.js";
import { renderBootstrapClientRuntimeOrchestrationFactory } from "./bootstrap-client-runtime-orchestration.js";
import { renderBootstrapClientRuntimeFactory } from "./bootstrap-client-runtime.js";
import { renderBootstrapClientRuntimeSupportFactory } from "./bootstrap-client-runtime-support.js";
import { renderBootstrapControlsRuntimeFactory } from "./bootstrap-controls-runtime.js";
import { renderBootstrapControlsSyncFactory } from "./bootstrap-controls-sync.js";
import { renderBootstrapDesktopControlsViewFactory } from "./bootstrap-desktop-controls-view.js";
import { renderBootstrapDomHelpersFactory } from "./bootstrap-dom-helpers.js";
import { renderBootstrapFormAccessViewFactory } from "./bootstrap-form-access-view.js";
import { renderBootstrapHostActionFactory } from "./bootstrap-host-actions.js";
import { renderBootstrapHostNavigationFactory } from "./bootstrap-host-navigation.js";
import { renderBootstrapHostRefreshFactory } from "./bootstrap-host-refresh.js";
import { renderBootstrapLiveStateFactory } from "./bootstrap-live-state.js";
import { renderBootstrapScopedControlsSyncFactory } from "./bootstrap-scoped-controls-sync.js";
import { renderBootstrapScopedSubmitFactory } from "./bootstrap-scoped-submit.js";
import { renderBootstrapScopedControlsViewFactory } from "./bootstrap-scoped-controls-view.js";
import { renderBootstrapStarterControlsViewFactory } from "./bootstrap-starter-controls-view.js";
import { renderBootstrapTopCardsSubmitFactory } from "./bootstrap-top-cards-submit.js";
import { renderBootstrapVersionGuidanceFactory } from "./bootstrap-version-guidance.js";
import { renderBootstrapProposalAdjacentFactory } from "./bootstrap-proposal-adjacent.js";
import { renderBootstrapProposalAdjacentControlsViewFactory } from "./bootstrap-proposal-adjacent-controls-view.js";
import { renderBootstrapProposalAdjacentSubmitFactory } from "./bootstrap-proposal-adjacent-submit.js";
import { renderBootstrapProposalAdjacentSyncFactory } from "./bootstrap-proposal-adjacent-sync.js";
import { renderBootstrapProposalControlsSyncFactory } from "./bootstrap-proposal-controls-sync.js";
import { renderBootstrapProposalSubmitFactory } from "./bootstrap-proposal-submit.js";
import { renderBootstrapProposalControlsViewFactory } from "./bootstrap-proposal-controls-view.js";
import { renderBootstrapRuntimeIntegrationDirectControlsSyncFactory } from "./bootstrap-runtime-integration-direct-controls-sync.js";
import { renderBootstrapRuntimeIntegrationDirectSubmitFactory } from "./bootstrap-runtime-integration-direct-submit.js";
import { renderBootstrapRuntimeIntegrationStateFactory } from "./bootstrap-runtime-integration-state.js";
import { renderBootstrapRuntimeIntegrationControlsViewFactory } from "./bootstrap-runtime-integration-controls-view.js";
import { renderBootstrapRuntimeIntegrationOptionsViewFactory } from "./bootstrap-runtime-integration-options-view.js";
import { renderBootstrapAppAuthoringSubmitFactory } from "./bootstrap-app-authoring-submit.js";
import { renderBootstrapRefreshRuntimeFactory } from "./bootstrap-refresh-runtime.js";
import { renderBootstrapRouteAuthoringSyncFactory } from "./bootstrap-route-authoring-sync.js";
import { renderBootstrapRuntimePluginReviewSyncFactory } from "./bootstrap-runtime-plugin-review-sync.js";
import { renderBootstrapRuntimePluginReviewViewFactory } from "./bootstrap-runtime-plugin-review-view.js";
import { renderBootstrapShellRenderViewFactory } from "./bootstrap-shell-render-view.js";
import { renderBootstrapShellRenderRuntimeFactory } from "./bootstrap-shell-render-runtime.js";
import { renderBootstrapStateListRenderFactory } from "./bootstrap-state-list-render.js";
import { renderBootstrapGuidanceRuntimeFactory } from "./bootstrap-guidance-runtime.js";
import { renderBootstrapGuidanceRuntimeViewFactory } from "./bootstrap-guidance-runtime-view.js";
import { renderBootstrapShellViewStateFactory } from "./bootstrap-shell-view-state.js";
import { renderBootstrapJsonForScript } from "./bootstrap-page-helpers.js";

export function renderBootstrapPageScript({ guidance = null } = {}) {
  return `${renderBootstrapGuidanceStateFactory()}
${renderBootstrapGuidanceControllerFactory()}
${renderBootstrapBackendAuthoringSubmitFactory()}
${renderBootstrapBackendAuthoringControlsViewFactory()}
${renderBootstrapBackendVersionSubmitFactory()}
${renderBootstrapBackendVersionControlsViewFactory()}
${renderBootstrapCapabilitySubmitFactory()}
${renderBootstrapCapabilityControlsSyncFactory()}
${renderBootstrapClientHttpFactory()}
${renderBootstrapClientRuntimeBindersFactory()}
${renderBootstrapClientRuntimeGuidanceFactory()}
${renderBootstrapClientRuntimeOrchestrationFactory()}
${renderBootstrapClientRuntimeSupportFactory()}
${renderBootstrapClientRuntimeFactory()}
${renderBootstrapControlsRuntimeFactory()}
${renderBootstrapControlsSyncFactory()}
${renderBootstrapDesktopControlsViewFactory()}
${renderBootstrapDomHelpersFactory()}
${renderBootstrapFormAccessViewFactory()}
${renderBootstrapHostActionFactory()}
${renderBootstrapHostNavigationFactory()}
${renderBootstrapHostRefreshFactory()}
${renderBootstrapLiveStateFactory()}
${renderBootstrapScopedControlsSyncFactory()}
${renderBootstrapScopedSubmitFactory()}
${renderBootstrapScopedControlsViewFactory()}
${renderBootstrapStarterControlsViewFactory()}
${renderBootstrapTopCardsSubmitFactory()}
${renderBootstrapVersionGuidanceFactory()}
${renderBootstrapProposalAdjacentFactory()}
${renderBootstrapProposalAdjacentControlsViewFactory()}
${renderBootstrapProposalAdjacentSubmitFactory()}
${renderBootstrapProposalAdjacentSyncFactory()}
${renderBootstrapProposalControlsSyncFactory()}
${renderBootstrapProposalSubmitFactory()}
${renderBootstrapProposalControlsViewFactory()}
${renderBootstrapRuntimeIntegrationDirectControlsSyncFactory()}
${renderBootstrapRuntimeIntegrationDirectSubmitFactory()}
${renderBootstrapRuntimeIntegrationStateFactory()}
${renderBootstrapRuntimeIntegrationControlsViewFactory()}
${renderBootstrapRuntimeIntegrationOptionsViewFactory()}
${renderBootstrapAppAuthoringSubmitFactory()}
${renderBootstrapRefreshRuntimeFactory()}
${renderBootstrapRouteAuthoringSyncFactory()}
${renderBootstrapRuntimePluginReviewSyncFactory()}
${renderBootstrapRuntimePluginReviewViewFactory()}
${renderBootstrapShellRenderViewFactory()}
${renderBootstrapShellRenderRuntimeFactory()}
${renderBootstrapStateListRenderFactory()}
${renderBootstrapGuidanceRuntimeFactory()}
${renderBootstrapGuidanceRuntimeViewFactory()}
${renderBootstrapShellViewStateFactory()}
    const bootstrapGuidance = ${renderBootstrapJsonForScript(guidance)};
    startBootstrapClientRuntime({
      guidance: bootstrapGuidance,
      currentSurfacePage: "bootstrap",
      documentTarget: document,
      windowTarget: window,
      fetchFn: (...args) => fetch(...args)
    });
`;
}
