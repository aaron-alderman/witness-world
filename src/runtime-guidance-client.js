import { renderTutorialDisabledScopesActionsFactory } from "./runtime-guidance-disabled-scopes-actions.js";
import { renderTutorialDisabledScopesViewFactory } from "./runtime-guidance-disabled-scopes-view.js";
import { renderTutorialClientAdapterFactory } from "./runtime-guidance-client-adapter.js";
import { renderTutorialClientBootstrapFactory } from "./runtime-guidance-client-bootstrap.js";
import { renderTutorialClientInteractionsFactory } from "./runtime-guidance-client-interactions.js";
import { renderTutorialClientRuntimeFactory } from "./runtime-guidance-client-runtime.js";
import { renderTutorialClientStateFactory } from "./runtime-guidance-client-state.js";
import { renderTutorialOverlayActionsFactory } from "./runtime-guidance-overlay-actions.js";
import { renderTutorialOverlayDragFactory } from "./runtime-guidance-overlay-drag.js";
import { renderTutorialOverlayDomFactory } from "./runtime-guidance-overlay-dom.js";
import { renderTutorialOverlayInteractionsFactory } from "./runtime-guidance-overlay-interactions.js";
import { renderTutorialOverlayViewFactory } from "./runtime-guidance-overlay-view.js";
import { renderTutorialProgressRuntimeFactory } from "./runtime-guidance-progress-runtime.js";
import { renderTutorialProgressStateFactory } from "./runtime-guidance-progress-state.js";
import { renderTutorialRuntimeActionsFactory } from "./runtime-guidance-runtime-actions.js";

function guidanceDefinitionForConfig(guidanceConfig) {
  if (guidanceConfig?.definition && typeof guidanceConfig.definition === "object") {
    return guidanceConfig.definition;
  }
  if (guidanceConfig && typeof guidanceConfig === "object" && Array.isArray(guidanceConfig.steps)) {
    return guidanceConfig;
  }
  return null;
}

export function renderGuidanceClient(guidanceConfig) {
  const guidance = guidanceDefinitionForConfig(guidanceConfig);
  if (!guidance) return "";
  const json = JSON.stringify(guidance).replace(/</g, "\\u003c");
  const configJson = JSON.stringify(guidanceConfig || {}).replace(/</g, "\\u003c");
  const engine = String.raw`(() => {
  ${renderTutorialOverlayDomFactory()}
  ${renderTutorialDisabledScopesActionsFactory()}
  ${renderTutorialDisabledScopesViewFactory()}
  ${renderTutorialClientAdapterFactory()}
  ${renderTutorialClientBootstrapFactory()}
  ${renderTutorialClientInteractionsFactory()}
  ${renderTutorialClientRuntimeFactory()}
  ${renderTutorialClientStateFactory()}
  ${renderTutorialOverlayActionsFactory()}
  ${renderTutorialOverlayDragFactory()}
  ${renderTutorialOverlayInteractionsFactory()}
  ${renderTutorialOverlayViewFactory()}
  ${renderTutorialProgressRuntimeFactory()}
  ${renderTutorialProgressStateFactory()}
  ${renderTutorialRuntimeActionsFactory()}
  const tutorial = ${json};
  const tutorialConfig = ${configJson};
  startTutorialClientRuntimeApp({
    tutorial,
    tutorialConfig,
    documentTarget: document,
    windowTarget: window,
    fetchFn: (...args) => fetch(...args)
  });
})();`;
  return `\n<script>\n${engine}\n</script>`;
}

export const renderTutorialClient = renderGuidanceClient;
