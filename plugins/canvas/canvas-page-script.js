import { renderCanvasAssetRuntimePrelude } from "./canvas-asset-runtime.js";
import { renderCanvasClientRuntimePrelude } from "./canvas-client-runtime.js";
import { renderCanvasCorePrelude } from "./canvas-core.js";
import { renderCanvasGestureRuntimePrelude } from "./canvas-gesture-runtime.js";
import { renderCanvasHistoryRuntimePrelude } from "./canvas-history-runtime.js";
import { renderCanvasInspectorRuntimePrelude } from "./canvas-inspector-runtime.js";
import { renderCanvasInteractionRuntimePrelude } from "./canvas-interaction-runtime.js";
import { renderCanvasIoRuntimePrelude } from "./canvas-io-runtime.js";
import { renderCanvasRenderRuntimePrelude } from "./canvas-render-runtime.js";
import { renderCanvasSessionRuntimePrelude } from "./canvas-session-runtime.js";
import { renderCanvasSyncRuntimePrelude } from "./canvas-sync-runtime.js";
import { renderCanvasToolbarRuntimePrelude } from "./canvas-toolbar-runtime.js";

export function renderCanvasPageScript() {
  return `(async () => {
  ${renderCanvasCorePrelude()}
  ${renderCanvasAssetRuntimePrelude()}
  ${renderCanvasGestureRuntimePrelude()}
  ${renderCanvasHistoryRuntimePrelude()}
  ${renderCanvasInspectorRuntimePrelude()}
  ${renderCanvasInteractionRuntimePrelude()}
  ${renderCanvasIoRuntimePrelude()}
  ${renderCanvasRenderRuntimePrelude()}
  ${renderCanvasSessionRuntimePrelude()}
  ${renderCanvasSyncRuntimePrelude()}
  ${renderCanvasToolbarRuntimePrelude()}
  ${renderCanvasClientRuntimePrelude()}
  await startCanvasClientRuntime({
    documentTarget: document,
    localStorageTarget: localStorage
  });
})();`;
}
