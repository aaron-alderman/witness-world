import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBlankRuntime, ensureWorldHomeLayout } from "./runtime-local-launcher.js";
import { resolveRuntimeOperatorPaths } from "./runtime-operator-contract.js";
import { DESKTOP_IPC_CHANNELS } from "./desktop-bridge.js";
import { createDesktopSessionManager } from "./desktop-session-manager.js";

function parseDesktopArgs(args) {
  const result = {
    worldHome: null,
    runtimeProfile: "full",
    runtimeProfileExplicit: false,
    runtimePluginIds: []
  };
  const queue = [...args];
  while (queue.length) {
    const token = queue.shift();
    if (token === "--world-home") {
      result.worldHome = queue.shift() ?? null;
      continue;
    }
    if (token === "--runtime-profile") {
      result.runtimeProfile = queue.shift() ?? "full";
      result.runtimeProfileExplicit = true;
      continue;
    }
    if (token === "--runtime-plugin") {
      const pluginId = queue.shift() ?? "";
      if (pluginId) result.runtimePluginIds.push(pluginId);
    }
  }
  return result;
}

export async function prepareDesktopWorldHome({
  worldHome,
  createIfMissing = false,
  cwd = process.cwd(),
  env = process.env,
  resolveRuntimeOperatorPathsImpl = resolveRuntimeOperatorPaths,
  ensureWorldHomeLayoutImpl = ensureWorldHomeLayout,
  fsModule = fs
} = {}) {
  const raw = String(worldHome || "").trim();
  if (!raw) {
    const error = new Error("world home is required");
    error.code = "WORLD_HOME_REQUIRED";
    throw error;
  }
  const operatorContract = await resolveRuntimeOperatorPathsImpl({
    startupMode: "desktop",
    cwd,
    env: {
      ...env,
      WORLD_HOME: raw
    }
  });
  const requiredDirectories = [
    operatorContract.directories.runtimeRoot,
    operatorContract.directories.backupsRoot,
    operatorContract.directories.exportsRoot,
    operatorContract.directories.importsRoot,
    path.dirname(operatorContract.canonicalTruth.witnessLogPath),
    path.dirname(operatorContract.canonicalTruth.observationLogPath)
  ].filter(Boolean);
  let rootExists = false;
  let rootEntries = [];
  try {
    const stat = await fsModule.stat(operatorContract.worldHome);
    rootExists = true;
    if (!stat.isDirectory()) {
      const error = new Error("world home must be a directory");
      error.code = "WORLD_HOME_NOT_DIRECTORY";
      throw error;
    }
    rootEntries = await fsModule.readdir(operatorContract.worldHome);
  } catch (error) {
    if (!createIfMissing && error?.code !== "WORLD_HOME_NOT_DIRECTORY") {
      const wrapped = new Error("world home does not exist");
      wrapped.code = "WORLD_HOME_MISSING";
      throw wrapped;
    }
    if (error?.code === "WORLD_HOME_NOT_DIRECTORY") throw error;
    await fsModule.mkdir(operatorContract.worldHome, { recursive: true });
  }
  const layoutEntries = await Promise.all(requiredDirectories.map(async directory => {
    try {
      const stat = await fsModule.stat(directory);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }));
  const layoutReady = layoutEntries.every(Boolean);
  if (!createIfMissing && !layoutReady) {
    const error = new Error("world home must already use the world-home-v1 layout");
    error.code = "WORLD_HOME_INVALID_LAYOUT";
    throw error;
  }
  if (createIfMissing && rootExists && rootEntries.length > 0 && !layoutReady) {
    const error = new Error("existing directory is not empty and is not a world-home-v1 layout");
    error.code = "WORLD_HOME_NOT_INITIALIZABLE";
    throw error;
  }
  await ensureWorldHomeLayoutImpl(operatorContract, { fsModule });
  return operatorContract;
}

function directModuleExecution() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

export async function createDesktopShell({
  electron,
  args = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  launcher = startBlankRuntime,
  prepareWorldHome = prepareDesktopWorldHome,
  preloadPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "desktop-preload.js")
} = {}) {
  const parsed = parseDesktopArgs(args);
  const {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    shell
  } = electron;
  const desktopSession = createDesktopSessionManager({
    app,
    BrowserWindow,
    dialog,
    shell,
    launcher,
    prepareWorldHome,
    preloadPath,
    requestedRuntimeProfile: parsed.runtimeProfile,
    runtimeProfileExplicit: parsed.runtimeProfileExplicit,
    runtimePluginIds: parsed.runtimePluginIds,
    cwd,
    env
  });

  const handle = (channel, fn) => {
    ipcMain.handle(channel, fn);
  };

  handle(DESKTOP_IPC_CHANNELS.getDesktopShellState, () => desktopSession.getDesktopShellState());
  handle(DESKTOP_IPC_CHANNELS.openWorldHome, (_event, request) => desktopSession.openWorldHome(request));
  handle(DESKTOP_IPC_CHANNELS.createWorldHome, (_event, request) => desktopSession.createWorldHome(request));
  handle(DESKTOP_IPC_CHANNELS.revealWorldHome, () => desktopSession.revealWorldHome());

  app.on?.("window-all-closed", async () => {
    await desktopSession.close();
    app.quit?.();
  });

  await app.whenReady();

  const initialWorldSelection = parsed.worldHome
    ? { worldHome: parsed.worldHome, createNew: false }
    : null;
  const state = initialWorldSelection
    ? await desktopSession.initialize({
        worldHome: initialWorldSelection.worldHome,
        createIfMissing: initialWorldSelection.createNew
      })
    : await desktopSession.initialize();

  return {
    state,
    close: () => desktopSession.close()
  };
}

export async function main({
  loadElectron = () => import("electron"),
  args = process.argv.slice(2)
} = {}) {
  const electron = await loadElectron();
  return createDesktopShell({ electron, args });
}

if (directModuleExecution()) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
