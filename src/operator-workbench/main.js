import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createOperatorWorkbenchCore } from "./core.js";
import { startOperatorBrowserExampleServer } from "../operator-browser-example-server.js";
import { OPERATOR_WORKBENCH_IPC_CHANNELS } from "./bridge.js";
import {
  createOperatorWorkbenchSettingsStore,
  createOperatorWorkbenchWorkspaceKey
} from "./settings.js";
import { renderOperatorWorkbenchPage } from "./page.js";

async function writeWorkbenchPageFile({
  html,
  userDataRoot,
  fsModule = fs
} = {}) {
  const shellDir = path.join(userDataRoot, "operator-workbench");
  const pagePath = path.join(shellDir, "shell.html");
  await fsModule.mkdir(shellDir, { recursive: true });
  await fsModule.writeFile(pagePath, html, "utf8");
  return pagePath;
}

function directModuleExecution() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function decorateWorkbenchSnapshot(window, snapshot) {
  return {
    ...(snapshot && typeof snapshot === "object" ? snapshot : {}),
    hostWindow: {
      platform: process.platform,
      maximized: Boolean(window?.isMaximized?.()),
      minimizable: window?.isMinimizable?.() ?? true,
      maximizable: window?.isMaximizable?.() ?? true,
      closable: window?.isClosable?.() ?? true
    }
  };
}

function wireWorkbenchWindowShortcuts(window) {
  const webContents = window?.webContents;
  webContents?.on?.("before-input-event", (event, input) => {
    const key = String(input?.key || "");
    const lowerKey = key.toLowerCase();
    const controlLike = Boolean(input?.control || input?.meta);
    const shift = Boolean(input?.shift);
    if (key === "F12" || (controlLike && shift && lowerKey === "i")) {
      event?.preventDefault?.();
      if (webContents.isDevToolsOpened?.()) {
        webContents.closeDevTools?.();
      } else {
        webContents.openDevTools?.({ mode: "detach", activate: true });
      }
      return;
    }
    if (controlLike && lowerKey === "w") {
      event?.preventDefault?.();
      window.close?.();
    }
  });
}

function shouldLoadBrowserExample({ cwd, appPath }) {
  if (!appPath) return false;
  return path.resolve(cwd, appPath) === path.resolve(cwd, "examples", "operator");
}

export async function createOperatorWorkbenchShell({
  electron,
  args = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  fsModule = fs,
  createCoreImpl = createOperatorWorkbenchCore,
  startBrowserExampleServerImpl = startOperatorBrowserExampleServer,
  renderPageImpl = renderOperatorWorkbenchPage,
  preloadPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "desktop-preload.cjs")
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
  const browserExampleMode = shouldLoadBrowserExample({ cwd, appPath });
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

  let cleanedUp = false;
  let browserExampleServer = null;
  async function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    await browserExampleServer?.close?.();
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
    title: browserExampleMode ? "Operator Example" : "Operator TUI",
    backgroundColor: "#0b0f0d",
    frame: browserExampleMode ? true : false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath
    }
  });
  wireWorkbenchWindowShortcuts(window);
  register(OPERATOR_WORKBENCH_IPC_CHANNELS.getSnapshot, async () =>
    decorateWorkbenchSnapshot(window, await core.snapshot()));
  register(OPERATOR_WORKBENCH_IPC_CHANNELS.runCommand, async payload => {
    const result = await core.executeCommand(payload?.command ?? "");
    return {
      ...result,
      snapshot: decorateWorkbenchSnapshot(window, result?.snapshot)
    };
  });
  register(OPERATOR_WORKBENCH_IPC_CHANNELS.dispatchIntent, async payload => {
    const result = await core.dispatchIntent(payload);
    return {
      ...result,
      snapshot: decorateWorkbenchSnapshot(window, result?.snapshot)
    };
  });
  register(OPERATOR_WORKBENCH_IPC_CHANNELS.updateDisplaySettings, async payload => {
    const result = await core.updateDisplaySettings(payload);
    return {
      ...result,
      snapshot: decorateWorkbenchSnapshot(window, result?.snapshot)
    };
  });
  register(OPERATOR_WORKBENCH_IPC_CHANNELS.getAutocomplete, payload => core.autocomplete(payload?.line ?? ""));
  register(OPERATOR_WORKBENCH_IPC_CHANNELS.windowControl, payload => {
    const action = String(payload?.action || "");
    if (action === "minimize") {
      window.minimize?.();
    } else if (action === "toggle-maximize") {
      if (window.isMaximized?.()) {
        window.unmaximize?.();
      } else {
        window.maximize?.();
      }
    } else if (action === "close") {
      window.close?.();
    }
    return decorateWorkbenchSnapshot(window, null);
  });
  window.removeMenu?.();
  window.setMenuBarVisibility?.(false);
  window.once?.("ready-to-show", () => window.show?.());
  window.on?.("closed", cleanup);
  if (browserExampleMode) {
    browserExampleServer = await startBrowserExampleServerImpl({
      core,
      workspaceRoot: cwd,
      exampleRoot: path.resolve(cwd, appPath),
      host: "127.0.0.1",
      port: 4020
    });
    await window.loadURL(browserExampleServer.url);
    return {
      close: cleanup,
      core
    };
  }
  const pagePath = await writeWorkbenchPageFile({
    html: renderPageImpl(),
    userDataRoot,
    fsModule
  });
  if (typeof window.loadFile === "function") {
    await window.loadFile(pagePath);
  } else {
    await window.loadURL(pathToFileURL(pagePath).href);
  }
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
