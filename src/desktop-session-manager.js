import fs from "node:fs/promises";
import path from "node:path";
import { createDesktopShellState, DESKTOP_ONLY_POWERS } from "./desktop-bridge.js";
import { renderDesktopLauncherPage } from "./desktop-launcher-page.js";

const DESKTOP_STATE_FILE = "desktop-shell-state.json";
const RECENT_WORLD_LIMIT = 8;

function toDataUrl(html) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function normalizeWorldHomeList(rows = []) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const value = typeof row === "string" ? row.trim() : "";
    if (!value) continue;
    const resolved = path.resolve(value);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    result.push(resolved);
  }
  return result.slice(0, RECENT_WORLD_LIMIT);
}

async function readDesktopStateFile(filePath, fsModule) {
  try {
    const text = await fsModule.readFile(filePath, "utf8");
    const parsed = JSON.parse(text);
    return {
      recentWorldHomes: normalizeWorldHomeList(parsed?.recentWorldHomes || [])
    };
  } catch {
    return { recentWorldHomes: [] };
  }
}

async function writeDesktopStateFile(filePath, state, fsModule) {
  await fsModule.mkdir(path.dirname(filePath), { recursive: true });
  await fsModule.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function updateRecentWorldHomes(recentWorldHomes, worldHome) {
  return normalizeWorldHomeList([worldHome, ...recentWorldHomes]);
}

export function createDesktopSessionManager({
  app,
  BrowserWindow,
  dialog,
  shell,
  launcher,
  prepareWorldHome,
  preloadPath,
  requestedRuntimeProfile = "full",
  runtimeProfileExplicit = false,
  runtimePluginIds = [],
  cwd = process.cwd(),
  env = process.env,
  fsModule = fs
} = {}) {
  const userDataRoot = typeof app?.getPath === "function"
    ? app.getPath("userData")
    : path.join(cwd, ".desktop-shell");
  const stateFilePath = path.join(userDataRoot, DESKTOP_STATE_FILE);

  let launcherWindow = null;
  let mainWindow = null;
  let recentWorldHomes = [];
  let activeRuntimeServer = null;
  let currentWorldHome = null;
  let currentRuntimeProfile = requestedRuntimeProfile;
  let launcherRequired = true;
  let runtimeStatus = "idle";

  const desktopShellState = () => createDesktopShellState({
    worldHome: currentWorldHome,
    runtimeProfile: currentRuntimeProfile,
    availablePowers: DESKTOP_ONLY_POWERS,
    recentWorldHomes,
    launcherRequired,
    runtimeStatus
  });

  const ensureLauncherWindow = () => {
    if (launcherWindow && !launcherWindow.isDestroyed?.()) return launcherWindow;
    launcherWindow = new BrowserWindow({
      width: 560,
      height: 560,
      resizable: false,
      minimizable: true,
      maximizable: false,
      show: false,
      title: "Witness Desktop",
      webPreferences: {
        contextIsolation: true,
        preload: preloadPath
      }
    });
    launcherWindow.once?.("ready-to-show", () => launcherWindow.show?.());
    launcherWindow.on?.("closed", () => {
      launcherWindow = null;
    });
    return launcherWindow;
  };

  const ensureMainWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed?.()) return mainWindow;
    mainWindow = new BrowserWindow({
      width: 1320,
      height: 900,
      show: false,
      title: "Witness Desktop",
      webPreferences: {
        contextIsolation: true,
        preload: preloadPath
      }
    });
    mainWindow.once?.("ready-to-show", () => mainWindow.show?.());
    mainWindow.on?.("closed", () => {
      mainWindow = null;
    });
    return mainWindow;
  };

  const showLauncherWindow = async (message = "") => {
    launcherRequired = true;
    const window = ensureLauncherWindow();
    await window.loadURL(toDataUrl(renderDesktopLauncherPage({ message })));
    window.show?.();
    return window;
  };

  const hideLauncherWindow = () => {
    launcherWindow?.hide?.();
  };

  const closeActiveRuntime = async () => {
    if (!activeRuntimeServer?.close) return;
    const closing = activeRuntimeServer;
    activeRuntimeServer = null;
    await closing.close();
  };

  const persistRecentWorldHomes = async () => {
    await writeDesktopStateFile(stateFilePath, { recentWorldHomes }, fsModule);
  };

  const loadPersistedState = async () => {
    const persisted = await readDesktopStateFile(stateFilePath, fsModule);
    recentWorldHomes = persisted.recentWorldHomes;
  };

  const launchWorld = async ({
    worldHome,
    createIfMissing = false
  }) => {
    const hadActiveRuntime = Boolean(activeRuntimeServer);
    const previousServer = activeRuntimeServer;
    const previousWorldHome = currentWorldHome;
    const previousRuntimeProfile = currentRuntimeProfile;
    const previousLauncherRequired = launcherRequired;

    runtimeStatus = "launching";
    if (!hadActiveRuntime) launcherRequired = true;

    let nextRuntime = null;
    try {
      const operatorContract = await prepareWorldHome({
        worldHome,
        createIfMissing,
        cwd,
        env,
        fsModule
      });
      nextRuntime = await launcher({
        startupMode: "desktop",
        worldHome: operatorContract.worldHome,
        runtimeProfile: requestedRuntimeProfile,
        runtimeProfileExplicit,
        runtimePluginIds,
        cwd,
        env,
        port: 0
      });
      if (!nextRuntime?.server?.ok) {
        const error = new Error(nextRuntime?.server?.reason || nextRuntime?.reason || "desktop runtime failed to start");
        error.code = "DESKTOP_RUNTIME_FAILED";
        throw error;
      }
      const window = ensureMainWindow();
      await window.loadURL(nextRuntime.server.url);

      activeRuntimeServer = nextRuntime.server;
      currentWorldHome = nextRuntime.operatorContract.worldHome;
      currentRuntimeProfile = nextRuntime.runtimeProfile;
      launcherRequired = false;
      runtimeStatus = "ready";
      recentWorldHomes = updateRecentWorldHomes(recentWorldHomes, currentWorldHome);
      await persistRecentWorldHomes();
      hideLauncherWindow();

      if (previousServer?.close && previousServer !== activeRuntimeServer) {
        await previousServer.close();
      }

      return desktopShellState();
    } catch (error) {
      if (nextRuntime?.server?.close && nextRuntime.server !== activeRuntimeServer) {
        await nextRuntime.server.close();
      }
      currentWorldHome = previousWorldHome;
      currentRuntimeProfile = previousRuntimeProfile;
      launcherRequired = hadActiveRuntime ? previousLauncherRequired : true;
      runtimeStatus = hadActiveRuntime ? "ready" : "error";
      if (!hadActiveRuntime) await showLauncherWindow(error instanceof Error ? error.message : String(error));
      throw error;
    }
  };

  const resolveRequestedWorldHome = async ({
    request = null,
    createNew = false
  }) => {
    const explicitWorldHome = typeof request?.worldHome === "string" ? request.worldHome.trim() : "";
    if (explicitWorldHome) return explicitWorldHome;
    const selected = await dialog.showOpenDialog(mainWindow ?? launcherWindow ?? null, {
      title: createNew ? "Create Or Choose WORLD_HOME" : "Open WORLD_HOME",
      properties: createNew ? ["openDirectory", "createDirectory"] : ["openDirectory"],
      buttonLabel: createNew ? "Use World Home" : "Open World Home"
    });
    if (selected.canceled || !selected.filePaths?.[0]) return null;
    return selected.filePaths[0];
  };

  const openWorldHome = async (request = null) => {
    const selectedWorldHome = await resolveRequestedWorldHome({ request, createNew: false });
    if (!selectedWorldHome) return { canceled: true, state: desktopShellState() };
    try {
      return {
        ok: true,
        state: await launchWorld({ worldHome: selectedWorldHome, createIfMissing: false })
      };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        state: desktopShellState()
      };
    }
  };

  const createWorldHome = async (request = null) => {
    const selectedWorldHome = await resolveRequestedWorldHome({ request, createNew: true });
    if (!selectedWorldHome) return { canceled: true, state: desktopShellState() };
    try {
      return {
        ok: true,
        state: await launchWorld({ worldHome: selectedWorldHome, createIfMissing: true })
      };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        state: desktopShellState()
      };
    }
  };

  const revealWorldHome = async () => {
    if (!currentWorldHome) return { ok: false, reason: "no active world home" };
    await shell.openPath(currentWorldHome);
    return { ok: true, worldHome: currentWorldHome };
  };

  const initialize = async ({
    worldHome = null,
    createIfMissing = false
  } = {}) => {
    await loadPersistedState();
    if (worldHome) {
      try {
        await launchWorld({ worldHome, createIfMissing });
        return desktopShellState();
      } catch {
        return desktopShellState();
      }
    }
    await showLauncherWindow();
    return desktopShellState();
  };

  return {
    stateFilePath,
    initialize,
    getDesktopShellState: async () => desktopShellState(),
    openWorldHome,
    createWorldHome,
    revealWorldHome,
    close: async () => {
      await closeActiveRuntime();
    }
  };
}
