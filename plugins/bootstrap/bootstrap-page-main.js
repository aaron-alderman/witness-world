import {
  renderBootstrapAuthoredWidget,
  replaceBootstrapSectionSlot
} from "./bootstrap-page-helpers.js";

export function renderBootstrapAuthoredPageMain(slots = {}) {
  let html = renderBootstrapAuthoredWidget({
    wtomlFile: "bootstrap-page-main.wtoml",
    rootWidget: "bootstrap_page_main_root",
    frontendProgram: "bootstrap_page_main_program",
    frontendProgramScriptId: "witness-bootstrap-page-main-program"
  });
  for (const [domId, content] of Object.entries(slots)) {
    html = replaceBootstrapSectionSlot(html, domId, content);
  }
  return html;
}
