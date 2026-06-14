import {
  renderBootstrapGuidanceOverlay,
  renderBootstrapGuidanceStyles
} from "../../src/runtime-guidance-bootstrap-ui.js";
import { buildBootstrapPageMainSlots } from "./bootstrap-page-main-slots.js";
import { renderBootstrapAuthoredPageMain } from "./bootstrap-page-main.js";
import { renderBootstrapPageDocument } from "./bootstrap-page-document.js";
import { renderBootstrapPageScript } from "./bootstrap-page-script.js";
import { renderBootstrapAuthoredPageShell } from "./bootstrap-page-shell.js";
import { renderBootstrapShellHead } from "./bootstrap-shell-head.js";

export function renderBootstrapPage({ bootstrapState = null, bootstrapModel = null, requestUrl = "/_bootstrap" } = {}) {
  const guidance = bootstrapState?.activeBootstrapGuidance?.definition ?? null;
  const main = renderBootstrapAuthoredPageMain(buildBootstrapPageMainSlots({
    bootstrapState,
    bootstrapModel,
    requestUrl,
    guidance
  }));
  const body = renderBootstrapAuthoredPageShell({
    mainHtml: main,
    auxiliaryHtml: guidance ? renderBootstrapGuidanceOverlay() : ""
  });
  const scriptBody = renderBootstrapPageScript({ guidance });
  return renderBootstrapPageDocument({
    headHtml: renderBootstrapShellHead({ guidanceStyles: guidance ? renderBootstrapGuidanceStyles() : "" }),
    bodyHtml: body,
    scriptBody
  });
}

export function bootstrapSummary(model = {}) {
  return {
    appReady: model.appReady === true,
    homeReason: model.appReady === true ? "reachable home route" : (model.homeReason || "bootstrap fallback active")
  };
}
