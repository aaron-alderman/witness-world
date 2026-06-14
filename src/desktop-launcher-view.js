import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyWitnessToml } from "./dsl.js";
import { createWorld } from "./kernel.js";
import { renderRuntimeWidgetPage } from "./runtime-widget-page.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopLauncherShellWtoml = fs.readFileSync(path.join(__dirname, "desktop-launcher-shell.wtoml"), "utf8");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function replaceNodeInnerHtml(html, domId, content) {
  const escaped = String(domId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(new RegExp(`(<[^>]*id="${escaped}"[^>]*>)([\\s\\S]*?)(<\\/[^>]+>)`, "i"), `$1${content}$3`);
}

function injectBeforeBodyClose(html, addition) {
  if (html.includes("</body>")) return html.replace("</body>", `${addition}\n</body>`);
  return `${html}\n${addition}`;
}

export function renderDesktopLauncherShell({
  message = "",
  clientScript = ""
} = {}) {
  const world = createWorld();
  applyWitnessToml(world, desktopLauncherShellWtoml);
  let html = renderRuntimeWidgetPage(world, {
    actor: "frontendHost",
    rootWidget: "desktop_launcher_page",
    appConfig: {
      traceProcessEvents: false,
      pageChrome: {
        themeId: "paper",
        material: "wood",
        typography: "serif"
      }
    }
  });
  html = replaceNodeInnerHtml(html, "launcher-status", escapeHtml(message));
  return injectBeforeBodyClose(html, `<script>\n${clientScript}\n</script>`);
}
