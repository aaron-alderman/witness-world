import {
  renderBootstrapAuthoredWidget,
  replaceBootstrapWholeSection
} from "./bootstrap-page-helpers.js";

export function renderBootstrapAuthoredPageShell({
  mainHtml = "",
  auxiliaryHtml = ""
} = {}) {
  let html = renderBootstrapAuthoredWidget({
    wtomlFile: "bootstrap-page-shell.wtoml",
    rootWidget: "bootstrap_page_shell_root"
  });
  html = replaceBootstrapWholeSection(html, "bootstrap-page-main-slot", mainHtml);
  html = replaceBootstrapWholeSection(html, "bootstrap-page-aux-slot", auxiliaryHtml);
  return html;
}
