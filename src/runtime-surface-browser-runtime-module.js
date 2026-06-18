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
  readSurfaceRuntimeManifest,
  routeStateBindingForProcess,
  routeTargetForManifestState,
  routeTargetForProcessState,
  routeTemplateValue,
  supportsSameDocumentRouteReplacement,
  syncRouteStateToUrl,
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
import { createSurfaceInteractionRuntime } from "./runtime-surface-interaction-runtime.js";

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
};`,
    trimString.toString(),
    buildRenderedHostTree.toString(),
    collectReconcileSurfaceStates.toString(),
    createReconcilePlan.toString(),
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
    routeStateBindingForProcess.toString(),
    routeTargetForProcessState.toString(),
    routeTargetForManifestState.toString(),
    syncUrlToRouteState.toString(),
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
