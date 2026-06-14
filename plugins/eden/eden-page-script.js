import { renderCanvasCorePrelude } from "../canvas/canvas-core.js";
import { renderEdenActionRuntimePrelude } from "./eden-action-runtime.js";
import { renderEdenCapabilityInstallClientPrelude } from "./eden-capability-install-client.js";
import { renderEdenChapterClientPrelude } from "./eden-chapter-client.js";
import { renderEdenClientRuntimePrelude } from "./eden-client-runtime.js";
import { renderEdenEmbeddedBridgePrelude } from "./eden-embedded-bridge.js";
import { renderEdenEmbeddedClientPrelude } from "./eden-embedded-client.js";
import { renderEdenEmbeddedRuntimePrelude } from "./eden-embedded-runtime.js";
import { renderEdenEditClientPrelude } from "./eden-edit-client.js";
import { renderEdenOrganizationClientPrelude } from "./eden-organization-client.js";
import { renderEdenPersonalClientPrelude } from "./eden-personal-client.js";
import { renderEdenProcessClientPrelude } from "./eden-process-client.js";
import { renderEdenProjectionRuntimePrelude } from "./eden-projection-runtime.js";
import { renderEdenRefreshRuntimePrelude } from "./eden-refresh-runtime.js";
import { renderEdenStageRuntimePrelude } from "./eden-stage-runtime.js";
import { renderEdenSurfaceAdaptersPrelude } from "./eden-surface-adapters.js";
import { renderEdenSurfaceClientPrelude } from "./eden-surface-client.js";
import { renderEdenSurfaceRuntimePrelude } from "./eden-surface-runtime.js";
import { renderEdenTheoryClientPrelude } from "./eden-theory-client.js";
import { renderEdenVersionsClientPrelude } from "./eden-versions-client.js";
import { renderEdenViewRuntimePrelude } from "./eden-view-runtime.js";

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderEdenPageScript({ model }) {
  return `(() => {
  ${renderCanvasCorePrelude()}
  ${renderEdenActionRuntimePrelude()}
  ${renderEdenCapabilityInstallClientPrelude()}
  ${renderEdenChapterClientPrelude()}
  ${renderEdenEmbeddedBridgePrelude()}
  ${renderEdenEmbeddedClientPrelude()}
  ${renderEdenEmbeddedRuntimePrelude()}
  ${renderEdenEditClientPrelude()}
  ${renderEdenOrganizationClientPrelude()}
  ${renderEdenPersonalClientPrelude()}
  ${renderEdenProcessClientPrelude()}
  ${renderEdenProjectionRuntimePrelude()}
  ${renderEdenRefreshRuntimePrelude()}
  ${renderEdenStageRuntimePrelude()}
  ${renderEdenSurfaceClientPrelude()}
  ${renderEdenSurfaceAdaptersPrelude()}
  ${renderEdenSurfaceRuntimePrelude()}
  ${renderEdenTheoryClientPrelude()}
  ${renderEdenViewRuntimePrelude()}
  ${renderEdenVersionsClientPrelude()}
  ${renderEdenClientRuntimePrelude()}
  const edenModel = ${jsonForScript(model)};
  startEdenClientRuntime({
    model: edenModel,
    documentTarget: document,
    windowTarget: window
  });
})();`;
}
