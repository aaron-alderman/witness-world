import { renderGuidanceCompanionActionsFactory } from "../../src/runtime-guidance-companion-actions.js";
import {
  getOrCreateSourceryCompanionShell,
  renderSourceryCompanionShellFactory
} from "../../src/runtime-guidance-companion-shell.js";
import {
  bindSourceryCompanionSuggestionActions,
  renderSourceryCompanionSyncFactory,
  syncSourceryCompanionShell
} from "../../src/runtime-guidance-companion-sync.js";
import {
  buildLiveGuidanceSuggestions,
  renderLiveGuidanceSuggestionsFactory
} from "../../src/runtime-guidance-live-suggestions.js";

export function renderWorldTutorialCompanionFactory() {
  return String.raw`
    ${renderGuidanceCompanionActionsFactory()}
    ${renderSourceryCompanionShellFactory()}
    ${renderSourceryCompanionSyncFactory()}
    ${renderLiveGuidanceSuggestionsFactory()}
    const buildWorldTutorialCompanionGuidanceState = ${buildWorldTutorialCompanionGuidanceState.toString()};
    const ensureWorldTutorialCompanionShell = ${ensureWorldTutorialCompanionShell.toString()};
    const syncWorldTutorialCompanionShell = ${syncWorldTutorialCompanionShell.toString()};
  `;
}

export function buildWorldTutorialCompanionGuidanceState({
  progress = null,
  tutorialSurfaceState = () => ({ kind: "" }),
  tutorialPageLabel = page => String(page || ""),
  onResume = null
} = {}) {
  const recoverySurfaceKinds = new Set(["hidden", "disabled", "disabled-context", "offpage"]);
  const surface = tutorialSurfaceState(progress);
  if (!progress || progress.completedAt || !recoverySurfaceKinds.has(surface.kind)) {
    return { visible: false, label: "Sourcery", onResume: null };
  }
  const resumeLabel = surface.kind === "offpage"
    ? ("Continue On " + tutorialPageLabel(surface.page))
    : (surface.kind === "disabled-context"
        ? "Enable Sourcery In This Context"
        : (surface.kind === "disabled" ? "Enable Sourcery Here" : "Resume Tutorial"));
  return {
    visible: true,
    label: resumeLabel,
    onResume: typeof onResume === "function" ? onResume : null
  };
}

export function ensureWorldTutorialCompanionShell({
  documentTarget = globalThis?.document || null,
  windowTarget = globalThis?.window || globalThis,
  runSuggestion = async () => false
} = {}) {
  getOrCreateSourceryCompanionShell({
    document: documentTarget,
    window: windowTarget,
    enabled: true,
    inspection: windowTarget?.world || windowTarget?.__surfaceRuntimeInspection || null,
    issueLedger: windowTarget?.__surfaceRuntimeIssueLedger || null
  });
  bindSourceryCompanionSuggestionActions({
    windowTarget,
    runSuggestion
  });
}

export function syncWorldTutorialCompanionShell({
  windowTarget = globalThis?.window || globalThis,
  documentTarget = globalThis?.document || null,
  progress = null,
  currentStep = null,
  tutorialSurfaceState = () => ({ kind: "" }),
  tutorialPageLabel = page => String(page || ""),
  tutorialStepScope = () => null,
  tutorialStepSurfaceContext = () => null,
  tutorialContextInfo = () => null,
  isTutorialContextDisabled = () => false,
  isTutorialScopeDisabled = () => false,
  scopeInventoryRowsFn = () => [],
  onResume = null
} = {}) {
  const surface = tutorialSurfaceState(progress);
  const disabledRows = scopeInventoryRowsFn().filter(row => row.status === "muted");
  syncSourceryCompanionShell({
    windowTarget,
    documentTarget,
    inspection: windowTarget?.world || windowTarget?.__surfaceRuntimeInspection || null,
    issueLedger: windowTarget?.__surfaceRuntimeIssueLedger || null,
    guidanceSuggestions: buildLiveGuidanceSuggestions({
      progress,
      currentStep: currentStep(progress),
      surface,
      disabledRows,
      tutorialPageLabel,
      tutorialStepScope,
      tutorialStepSurfaceContext,
      tutorialContextInfo,
      tutorialContextLabel: contextId => tutorialContextInfo(contextId)?.label || contextId,
      isTutorialContextDisabled,
      isTutorialScopeDisabled
    }),
    guidanceState: buildWorldTutorialCompanionGuidanceState({
      progress,
      tutorialSurfaceState,
      tutorialPageLabel,
      onResume
    })
  });
}