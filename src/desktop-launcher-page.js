import { renderDesktopLauncherActionsFactory } from "./desktop-launcher-actions.js";
import { renderDesktopRecentWorldsFactory } from "./desktop-launcher-recent-worlds.js";
import { renderDesktopLauncherRuntimeFactory } from "./desktop-launcher-runtime.js";
import { renderDesktopLauncherShell } from "./desktop-launcher-view.js";

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderDesktopLauncherPage({
  message = ""
} = {}) {
  const safeMessage = typeof message === "string" ? message : "";
  const clientScript = `
    ${renderDesktopLauncherActionsFactory()}
    ${renderDesktopRecentWorldsFactory()}
    ${renderDesktopLauncherRuntimeFactory()}
    (() => {
      startDesktopLauncherRuntime({
        windowTarget: window,
        documentTarget: document,
        initialMessage: ${jsonForScript(safeMessage)},
        bindDesktopLauncherAction,
        bindDesktopRecentWorlds,
        renderDesktopRecentWorlds
      });
    })();
  `;
  return renderDesktopLauncherShell({
    message: safeMessage,
    clientScript
  });
}
