import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createOperatorWorkbenchCore } from "./operator-workbench-core.js";
import { OPERATOR_WORKBENCH_IPC_CHANNELS } from "./operator-workbench-bridge.js";
import {
  createOperatorWorkbenchSettingsStore,
  createOperatorWorkbenchWorkspaceKey
} from "./operator-workbench-settings.js";
import { renderOperatorWorkbenchPage } from "./operator-workbench-page.js";

function toDataUrl(html) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function directModuleExecution() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

export async function createOperatorWorkbenchShell({
  electron,
  args = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  fsModule = fs,
  createCoreImpl = createOperatorWorkbenchCore,
  renderPageImpl = renderOperatorWorkbenchPage,
  preloadPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "desktop-preload.cjs")
} = {}) {
  const { app, BrowserWindow, ipcMain } = electron;
  const userDataRoot = typeof app?.getPath === "function"
    ? app.getPath("userData")
    : path.join(cwd, ".desktop-shell");
  const settingsStore = createOperatorWorkbenchSettingsStore({
    userDataRoot,
    fsModule
  });
  const appPath = args.length && !args[0].startsWith("--") ? args[0] : null;
  const worldHomeIndex = args.indexOf("--world-home");
  const worldHome = worldHomeIndex >= 0 ? (args[worldHomeIndex + 1] ?? null) : null;
  const workspaceKey = createOperatorWorkbenchWorkspaceKey({
    cwd,
    appPath,
    worldHome
  });
  const displaySettings = await settingsStore.load(workspaceKey);
  const core = await createCoreImpl({
    args,
    cwd,
    env,
    displaySettings,
    saveDisplaySettings: settings => settingsStore.save(workspaceKey, settings)
  });

  const handlers = new Map();
  const register = (channel, fn) => {
    const handler = async (_event, payload) => fn(payload);
    handlers.set(channel, handler);
    ipcMain.handle(channel, handler);
  };

  register(OPERATOR_WORKBENCH_IPC_CHANNELS.getSnapshot, () => core.snapshot());
  register(OPERATOR_WORKBENCH_IPC_CHANNELS.runCommand, payload => core.executeCommand(payload?.command ?? ""));
  register(OPERATOR_WORKBENCH_IPC_CHANNELS.dispatchIntent, payload => core.dispatchIntent(payload));
  register(OPERATOR_WORKBENCH_IPC_CHANNELS.updateDisplaySettings, payload => core.updateDisplaySettings(payload));
  register(OPERATOR_WORKBENCH_IPC_CHANNELS.getAutocomplete, payload => core.autocomplete(payload?.line ?? ""));

  let cleanedUp = false;
  async function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    await core.close();
    for (const [channel] of handlers) {
      ipcMain.removeHandler(channel);
    }
  }

  app.on?.("window-all-closed", async () => {
    await cleanup();
    app.quit?.();
  });

  await app.whenReady();
  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    title: "Witness Operator Workbench",
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath
    }
  });
  window.once?.("ready-to-show", () => window.show?.());
  window.on?.("closed", cleanup);
  await window.loadURL(toDataUrl(renderPageImpl()));
  return {
    close: cleanup,
    core
  };
}

export async function main({
  loadElectron = () => import("electron"),
  args = process.argv.slice(2)
} = {}) {
  const electron = await loadElectron();
  return createOperatorWorkbenchShell({ electron, args });
}

if (directModuleExecution()) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
