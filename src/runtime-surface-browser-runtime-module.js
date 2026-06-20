import { renderProcessRuntimeModuleSource } from "./desire/process-eval.js";
import {
  buildRenderedHostTree,
  collectReconcileSurfaceStates,
  createReconcilePlan
} from "./runtime-reconcile-service.js";
import {
  applySurfaceDomHostPlan,
  clearRouteUnderlay,
  dematerializeHiddenSurface,
  fallbackActiveRootNode,
  formatInlineText,
  materializeMissingVisibleSurface,
  nextPresentSiblingRoot,
  patchSurfaceDom,
  readSurfaceDomHostTree,
  surfaceIsPresentInDom,
  surfaceViewNodeIds,
  updateSurfaceRouteUnderlay
} from "./runtime-surface-dom-host.js";
import {
  activeRuntimeSurfaceIds,
  cloneInspectionValue,
  collectCapabilityOutputsFromDom,
  collectSurfaceDescendants,
  eventValueFromSpec,
  normalizeInteractionTiming,
  normalizeCapabilityAssets,
  normalizeRouteStateDescriptor,
  overlaySurfaceProps,
  readBindingSource,
  readCapabilityOutput,
  resolveRouteStateDescriptor,
  resolveSurfaceCapabilities,
  resolveSurfaceRuntimeBinding,
  stateIdsFromWitnesses,
  trimString
} from "./runtime-surface-runtime-shared.js";
import {
  activeRouteTargetForPath,
  createBrowserRouteInvoker,
  domParserForWindow,
  forceDocumentNavigation,
  interpolateRouteTemplate,
  loadRouteSurfacePage,
  normalizeRouteResponsePayload,
  parseFirstElement,
  parseRouteResponseBody,
  parseRouteSurfacePage,
  queryBindingsForProcess,
  readSurfaceRuntimeManifest,
  routeStateBindingForProcess,
  routeTargetForManifestState,
  routeTargetForProcessState,
  routeTemplateValue,
  supportsSameDocumentRouteReplacement,
  syncQueryStateToUrl,
  syncRouteStateToUrl,
  syncUrlToQueryState,
  syncUrlToRouteState
} from "./runtime-surface-route-runtime.js";
import {
  bootSurfaceCapabilities,
  capabilityAssetHash,
  capabilityBootIssueId,
  ensureSurfaceCapabilityAssets,
  surfaceAssetRegistrySnapshot,
  waitForNodeLoad,
  waitForSurfaceCapabilityModuleRegistration,
  waitForSurfaceCapabilityModuleSettle
} from "./runtime-surface-capability-runtime.js";
import { renderSourceryCompanionShellFactory } from "./runtime-guidance-companion-shell.js";
import {
  capabilityAssetPresence,
  createSurfaceInspectionPoint,
  createSurfaceRuntimeIssueLedger,
  createSurfaceRuntimeProbe,
  installSurfaceInspectionPoint,
  installSurfaceRuntimeBootFailure,
  mountedCapabilityMarkersForSurface,
  summarizeExecutionBlockers,
  summarizeSurfaceRuntimeExpectationIssues,
  summarizeSurfaceRuntimeIssues,
  surfaceDiagnosticsOverlayEnabled,
  surfaceExpectedVisible,
  surfaceHasVisibleBinding,
  surfaceParentId,
  surfaceRuntimeIssueSeverityRank
} from "./runtime-surface-diagnostics.js";
import {
  buildRuntimeManifestDiagnostics,
  childSurfaceIds,
  classTokensForSurface,
  collectRelevantProcessWitnesses,
  collectRouteTargets,
  collectRuleStepReferences,
  createBlockedInteractionRuntime,
  createSurfaceInteractionRuntime,
  currentWitnessCount,
  genericSurfaceRuntimeView,
  normalizeCapabilityPreloadAssets,
  normalizePreloadPolicies,
  normalizePreloadPolicyLoadList,
  normalizePreloadPolicyTarget,
  normalizePreloadPolicyWhen,
  normalizeQueryBindings,
  normalizeRuntimeArray,
  normalizeRuntimeObject,
  normalizeViewTargets,
  resolvedSurfaceDomId,
  runtimeSpecForSurface,
  surfaceHasRuntimeMeaning,
  trimmedIdSet,
  addToGroupedSet,
  addToIndexedSet,
  buildProcessWitnessCatalog
} from "./runtime-surface-interaction-runtime.js";

function browserHelpersSource() {
  return [
    `const SURFACE_INTERACTION_FORMATTERS = {
  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  },
  formattedText(value) {
    return this.escapeHtml(String(value ?? "")).replace(/\\n/g, "<br>");
  }
};
const processWitnessCatalogCache = new WeakMap();
const PROCESS_WITNESS_KINDS = new Set([
  "desire.defineProcess",
  "desire.defineMessage",
  "desire.defineType",
  "desire.defineBoundary",
  "desire.defineProjection",
  "desire.definePolicy"
]);`,
    currentWitnessCount.toString(),
    trimString.toString(),
    resolvedSurfaceDomId.toString(),
    normalizeRuntimeArray.toString(),
    normalizeRuntimeObject.toString(),
    buildRenderedHostTree.toString(),
    collectReconcileSurfaceStates.toString(),
    createReconcilePlan.toString(),
    normalizePreloadPolicyWhen.toString(),
    normalizePreloadPolicyLoadList.toString(),
    normalizePreloadPolicyTarget.toString(),
    normalizePreloadPolicies.toString(),
    normalizeQueryBindings.toString(),
    normalizeCapabilityPreloadAssets.toString(),
    runtimeSpecForSurface.toString(),
    surfaceHasRuntimeMeaning.toString(),
    trimmedIdSet.toString(),
    addToGroupedSet.toString(),
    addToIndexedSet.toString(),
    collectRuleStepReferences.toString(),
    buildProcessWitnessCatalog.toString(),
    collectRelevantProcessWitnesses.toString(),
    buildRuntimeManifestDiagnostics.toString(),
    childSurfaceIds.toString(),
    collectRouteTargets.toString(),
    normalizeViewTargets.toString(),
    classTokensForSurface.toString(),
    genericSurfaceRuntimeView.toString(),
    formatInlineText.toString(),
    surfaceViewNodeIds.toString(),
    nextPresentSiblingRoot.toString(),
    materializeMissingVisibleSurface.toString(),
    dematerializeHiddenSurface.toString(),
    fallbackActiveRootNode.toString(),
    clearRouteUnderlay.toString(),
    updateSurfaceRouteUnderlay.toString(),
    readSurfaceDomHostTree.toString(),
    applySurfaceDomHostPlan.toString(),
    normalizeRouteStateDescriptor.toString(),
    resolveRouteStateDescriptor.toString(),
    `function toSurfaceMap(manifest) {
  return new Map((manifest?.surfaces ?? []).map(surface => [surface.id, surface]));
}`,
    stateIdsFromWitnesses.toString(),
    eventValueFromSpec.toString(),
    normalizeInteractionTiming.toString(),
    routeTemplateValue.toString(),
    interpolateRouteTemplate.toString(),
    parseRouteResponseBody.toString(),
    normalizeRouteResponsePayload.toString(),
    createBrowserRouteInvoker.toString(),
    readCapabilityOutput.toString(),
    collectCapabilityOutputsFromDom.toString(),
    readBindingSource.toString(),
    overlaySurfaceProps.toString(),
    resolveSurfaceRuntimeBinding.toString(),
    resolveSurfaceCapabilities.toString(),
    collectSurfaceDescendants.toString(),
    activeRuntimeSurfaceIds.toString(),
    activeRouteTargetForPath.toString(),
    queryBindingsForProcess.toString(),
    routeStateBindingForProcess.toString(),
    routeTargetForProcessState.toString(),
    routeTargetForManifestState.toString(),
    syncUrlToQueryState.toString(),
    syncUrlToRouteState.toString(),
    syncQueryStateToUrl.toString(),
    syncRouteStateToUrl.toString(),
    forceDocumentNavigation.toString(),
    parseFirstElement.toString(),
    supportsSameDocumentRouteReplacement.toString(),
    domParserForWindow.toString(),
    readSurfaceRuntimeManifest.toString(),
    parseRouteSurfacePage.toString(),
    loadRouteSurfacePage.toString(),
    capabilityBootIssueId.toString(),
    bootSurfaceCapabilities.toString(),
    capabilityAssetHash.toString(),
    waitForNodeLoad.toString(),
    waitForSurfaceCapabilityModuleSettle.toString(),
    waitForSurfaceCapabilityModuleRegistration.toString(),
    normalizeCapabilityAssets.toString(),
    ensureSurfaceCapabilityAssets.toString(),
    cloneInspectionValue.toString(),
    surfaceAssetRegistrySnapshot.toString(),
    summarizeExecutionBlockers.toString(),
    createSurfaceInspectionPoint.toString(),
    installSurfaceInspectionPoint.toString(),
    surfaceDiagnosticsOverlayEnabled.toString(),
    createSurfaceRuntimeIssueLedger.toString(),
    `const { createSurfaceDiagnosticsOverlay } = (() => {
${renderSourceryCompanionShellFactory()}
  return { createSurfaceDiagnosticsOverlay };
})();`,
    installSurfaceRuntimeBootFailure.toString(),
    mountedCapabilityMarkersForSurface.toString(),
    capabilityAssetPresence.toString(),
    surfaceIsPresentInDom.toString(),
    surfaceParentId.toString(),
    surfaceHasVisibleBinding.toString(),
    surfaceExpectedVisible.toString(),
    createSurfaceRuntimeProbe.toString(),
    summarizeSurfaceRuntimeExpectationIssues.toString(),
    patchSurfaceDom.toString(),
    createBlockedInteractionRuntime.toString(),
    createSurfaceInteractionRuntime.toString(),
    `function bootSurfaceInteractionRuntime(manifest) {
  if (!manifest || !Array.isArray(manifest.surfaces) || !manifest.surfaces.length) return;
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    window.__surfaceRuntimeBootStarted = true;
    try {
        window.__surfaceInteractionRuntime = createSurfaceInteractionRuntime({
          document,
          window,
          manifest,
        createProcessRuntimeImpl({ witnesses, executionRunner, routeInvoker }) {
          return createProcessRuntime(witnesses, {
            executionRunner,
            routeInvoker
          });
        },
        expectationProviders: Array.isArray(window.__surfaceRuntimeExpectationProviders)
          ? window.__surfaceRuntimeExpectationProviders
          : []
      });
      window.__surfaceRuntimeBootError = null;
    } catch (error) {
      window.__surfaceRuntimeBootError = {
        name: error?.name || "Error",
        message: String(error?.message || error),
        stack: String(error?.stack || "")
      };
      window.__surfaceInteractionRuntime = installSurfaceRuntimeBootFailure({
        document,
        window,
        manifest,
        error
      });
      window.console?.error?.("surface interaction runtime boot failed", error);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}`
  ].join("\n\n");
}

let cachedSurfaceInteractionRuntimeModuleSource = null;

export function renderSurfaceInteractionRuntimeModule() {
  if (!cachedSurfaceInteractionRuntimeModuleSource) {
    cachedSurfaceInteractionRuntimeModuleSource = `const __surfaceRuntimeGlobal = typeof window === "object" && window
  ? window
  : (typeof self === "object" && self ? self : {});
__surfaceRuntimeGlobal.__surfaceRuntimeModuleLoaded = true;

${renderProcessRuntimeModuleSource()}

${browserHelpersSource()}

try {
  const surfaceRuntimeManifest = readSurfaceRuntimeManifest(document);
  bootSurfaceInteractionRuntime(surfaceRuntimeManifest);
} catch (error) {
  __surfaceRuntimeGlobal.__surfaceRuntimeBootError = {
    name: error?.name || "Error",
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  };
  __surfaceRuntimeGlobal.console?.error?.("surface interaction runtime module failed", error);
}
`;
  }
  return cachedSurfaceInteractionRuntimeModuleSource;
}
