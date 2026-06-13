import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createDesktopShellState,
  createWitnessDesktopApi,
  DESKTOP_IPC_CHANNELS
} from "../src/desktop-bridge.js";
import {
  createDesktopShell,
  prepareDesktopWorldHome
} from "../src/desktop-main.js";
import { renderDesktopLauncherPage } from "../src/desktop-launcher-page.js";

test("desktop preload bridge exposes only explicit ownership methods", async () => {
  const calls = [];
  const api = createWitnessDesktopApi({
    invoke: async (channel, payload) => {
      calls.push({ channel, payload });
      return { ok: true };
    }
  });

  assert.deepEqual(Object.keys(api).sort(), [
    "createWorldHome",
    "getDesktopShellState",
    "openWorldHome",
    "revealWorldHome"
  ]);
  assert.equal("openFileDialog" in api, false);

  await api.openWorldHome({ worldHome: "C:/worlds/demo" });
  await api.createWorldHome({ worldHome: "C:/worlds/new-world" });
  await api.revealWorldHome();
  await api.getDesktopShellState();

  assert.deepEqual(calls, [
    {
      channel: DESKTOP_IPC_CHANNELS.openWorldHome,
      payload: { worldHome: "C:/worlds/demo" }
    },
    {
      channel: DESKTOP_IPC_CHANNELS.createWorldHome,
      payload: { worldHome: "C:/worlds/new-world" }
    },
    {
      channel: DESKTOP_IPC_CHANNELS.revealWorldHome,
      payload: undefined
    },
    {
      channel: DESKTOP_IPC_CHANNELS.getDesktopShellState,
      payload: undefined
    }
  ]);
});

test("desktop launcher page reports a clear status when the desktop bridge is unavailable", () => {
  const html = renderDesktopLauncherPage();

  assert.equal(html.includes("Desktop bridge unavailable. Restart the desktop shell."), true);
  assert.equal(html.includes("window.witnessDesktop"), true);
  assert.equal(html.includes("renderDesktopRecentWorlds"), true);
  assert.equal(html.includes("bindDesktopRecentWorlds"), true);
  assert.equal(html.includes("root.innerHTML = rows.map"), false);
});

test("desktop world-home preparation validates open-vs-create semantics and creates world-home-v1 layouts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-desktop-home-"));
  const filePath = path.join(tempRoot, "not-a-directory.txt");
  const emptyDirectory = path.join(tempRoot, "empty-directory");
  const invalidWorld = path.join(tempRoot, "invalid-world");
  const worldHome = path.join(tempRoot, "world-home");
  await fs.writeFile(filePath, "x", "utf8");
  await fs.mkdir(emptyDirectory, { recursive: true });
  await fs.mkdir(invalidWorld, { recursive: true });
  await fs.writeFile(path.join(invalidWorld, "README.txt"), "occupied", "utf8");

  try {
    await assert.rejects(
      prepareDesktopWorldHome({ worldHome: filePath }),
      error => error?.code === "WORLD_HOME_NOT_DIRECTORY"
    );
    await assert.rejects(
      prepareDesktopWorldHome({ worldHome: emptyDirectory }),
      error => error?.code === "WORLD_HOME_INVALID_LAYOUT"
    );
    await assert.rejects(
      prepareDesktopWorldHome({ worldHome: invalidWorld, createIfMissing: true }),
      error => error?.code === "WORLD_HOME_NOT_INITIALIZABLE"
    );

    const contract = await prepareDesktopWorldHome({
      worldHome,
      createIfMissing: true
    });
    assert.equal(contract.layout, "world-home-v1");
    assert.equal(contract.worldHome, path.resolve(worldHome));
    for (const directory of ["logs", "runtime", "backups", "exports", "imports"]) {
      const stat = await fs.stat(path.join(worldHome, directory));
      assert.equal(stat.isDirectory(), true);
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("desktop shell starts on a launcher window, persists recent worlds, and retargets through explicit IPC methods", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-desktop-shell-"));
  const userDataRoot = path.join(tempRoot, "desktop-user-data");
  const firstWorld = path.join(tempRoot, "first-world");
  const secondWorld = path.join(tempRoot, "second-world");
  const dialogs = [{ canceled: false, filePaths: [secondWorld] }];
  const handled = new Map();
  const loadedUrls = [];
  const revealedPaths = [];
  let closeCalls = 0;
  const windows = [];

  class MockWindow {
    constructor(options) {
      this.options = options;
      windows.push(this);
    }

    once() {}

    on() {}

    show() {}

    isDestroyed() {
      return false;
    }

    async loadURL(url) {
      loadedUrls.push(url);
    }
  }

    const electron = {
    app: {
      async whenReady() {},
      on() {},
      getPath(kind) {
        return kind === "userData" ? userDataRoot : tempRoot;
      },
      quit() {}
    },
    BrowserWindow: MockWindow,
    dialog: {
      async showOpenDialog() {
        return dialogs.shift() || { canceled: true, filePaths: [] };
      }
    },
    ipcMain: {
      handle(channel, fn) {
        handled.set(channel, fn);
      }
    },
    shell: {
      async openPath(targetPath) {
        revealedPaths.push(targetPath);
        return "";
      }
    }
  };

  const launcher = async ({ startupMode, worldHome, runtimeProfile }) => ({
    server: {
      ok: true,
      url: `http://127.0.0.1/${path.basename(worldHome)}`,
      async close() {
        closeCalls += 1;
      }
    },
    operatorContract: {
      worldHome: path.resolve(worldHome)
    },
    runtimeProfile
  });

  const prepareWorldHome = async ({ worldHome }) => ({
    layout: "world-home-v1",
    worldHome: path.resolve(worldHome),
    directories: { runtimeRoot: path.join(path.resolve(worldHome), "runtime") },
    canonicalTruth: { witnessLogPath: "", observationLogPath: "" }
  });

  try {
    const desktop = await createDesktopShell({
      electron,
      args: [],
      launcher,
      prepareWorldHome
    });

    assert.equal(loadedUrls.length, 1);
    assert.equal(loadedUrls[0].startsWith("data:text/html"), true);
    assert.equal(windows[0].options.width, 560);

    const initialState = await handled.get(DESKTOP_IPC_CHANNELS.getDesktopShellState)();
    assert.deepEqual(initialState, createDesktopShellState({
      worldHome: null,
      runtimeProfile: "full",
      recentWorldHomes: [],
      launcherRequired: true,
      runtimeStatus: "idle"
    }));

    const openedFirst = await handled.get(DESKTOP_IPC_CHANNELS.openWorldHome)(null, { worldHome: firstWorld });
    assert.equal(openedFirst.ok, true);
    assert.deepEqual(loadedUrls, [
      loadedUrls[0],
      "http://127.0.0.1/first-world"
    ]);
    assert.deepEqual(openedFirst.state, createDesktopShellState({
      worldHome: path.resolve(firstWorld),
      runtimeProfile: "full",
      recentWorldHomes: [path.resolve(firstWorld)],
      launcherRequired: false,
      runtimeStatus: "ready"
    }));

    const switched = await handled.get(DESKTOP_IPC_CHANNELS.openWorldHome)();
    assert.equal(switched.ok, true);
    assert.deepEqual(switched.state.recentWorldHomes, [
      path.resolve(secondWorld),
      path.resolve(firstWorld)
    ]);
    assert.deepEqual(loadedUrls, [
      loadedUrls[0],
      "http://127.0.0.1/first-world",
      "http://127.0.0.1/second-world"
    ]);
    assert.equal(closeCalls, 1);

    const reveal = await handled.get(DESKTOP_IPC_CHANNELS.revealWorldHome)();
    assert.equal(reveal.ok, true);
    assert.deepEqual(revealedPaths, [path.resolve(secondWorld)]);

    const persisted = JSON.parse(await fs.readFile(path.join(userDataRoot, "desktop-shell-state.json"), "utf8"));
    assert.deepEqual(persisted.recentWorldHomes, [
      path.resolve(secondWorld),
      path.resolve(firstWorld)
    ]);
    await desktop.close();
    assert.equal(closeCalls, 2);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("desktop shell can launch an authored app target directly without the launcher flow", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-desktop-app-shell-"));
  const userDataRoot = path.join(tempRoot, "desktop-user-data");
  const handled = new Map();
  const loadedUrls = [];
  const windows = [];
  let closeCalls = 0;

  class MockWindow {
    constructor(options) {
      this.options = options;
      windows.push(this);
    }

    once() {}

    on() {}

    show() {}

    hide() {}

    isDestroyed() {
      return false;
    }

    async loadURL(url) {
      loadedUrls.push(url);
    }
  }

  const electron = {
    app: {
      async whenReady() {},
      on() {},
      getPath(kind) {
        return kind === "userData" ? userDataRoot : tempRoot;
      },
      quit() {}
    },
    BrowserWindow: MockWindow,
    dialog: {
      async showOpenDialog() {
        return { canceled: true, filePaths: [] };
      }
    },
    ipcMain: {
      handle(channel, fn) {
        handled.set(channel, fn);
      }
    },
    shell: {
      async openPath() {
        return "";
      }
    }
  };

  try {
    await createDesktopShell({
      electron,
      args: ["examples/demo-todo-app", "--desktop-target", "demo_todo_desktop"],
      loadAppProjectImpl: async appPath => ({
        appRoot: path.join(process.cwd(), "examples", "demo-todo-app"),
        manifestPath: path.join(process.cwd(), "examples", "demo-todo-app", "app.wtoml"),
        witnessDocs: [],
        authoredDesireDocs: [],
        targets: {
          server: [{ id: "demo_server", default: true }],
          mcp: [],
          desktop: [{ id: "demo_todo_desktop", serverRunner: "demo_server", default: true }]
        }
      }),
      startAppRuntimeImpl: async ({ appProject }) => ({
        server: {
          ok: true,
          url: "http://127.0.0.1/demo-app",
          async close() {
            closeCalls += 1;
          }
        },
        operatorContract: { worldHome: null },
        runtimeProfile: "full",
        appProject
      })
    });

    assert.deepEqual(loadedUrls, ["http://127.0.0.1/demo-app"]);
    assert.equal(windows.length, 1);
    assert.equal(windows[0].options.width, 1320);

    const state = await handled.get(DESKTOP_IPC_CHANNELS.getDesktopShellState)();
    assert.deepEqual(state, createDesktopShellState({
      worldHome: null,
      runtimeProfile: "full",
      appRoot: path.join(process.cwd(), "examples", "demo-todo-app"),
      manifestPath: path.join(process.cwd(), "examples", "demo-todo-app", "app.wtoml"),
      selectedTarget: "demo_todo_desktop",
      recentWorldHomes: [],
      launcherRequired: false,
      runtimeStatus: "ready"
    }));
  } finally {
    assert.equal(closeCalls, 0);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
