import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  OPERATOR_WORKBENCH_IPC_CHANNELS,
  createWitnessOperatorWorkbenchApi
} from "../src/operator-workbench/bridge.js";
import {
  createOperatorWorkbenchSettingsStore,
  createOperatorWorkbenchWorkspaceKey
} from "../src/operator-workbench/settings.js";
import { createOperatorWorkbenchShell } from "../src/operator-workbench/main.js";

test("operator workbench preload bridge exposes only explicit workbench methods", async () => {
  const calls = [];
  const api = createWitnessOperatorWorkbenchApi({
    invoke: async (channel, payload) => {
      calls.push({ channel, payload });
      return { ok: true };
    }
  });

  assert.deepEqual(Object.keys(api).sort(), [
    "dispatchIntent",
    "getAutocomplete",
    "getSnapshot",
    "runCommand",
    "updateDisplaySettings",
    "windowControl"
  ]);

  await api.getSnapshot();
  await api.runCommand("inspect this");
  await api.dispatchIntent({ type: "activate-primary" });
  await api.updateDisplaySettings({ fontSize: 18 });
  await api.getAutocomplete("ins");
  await api.windowControl("toggle-maximize");

  assert.deepEqual(calls, [
    {
      channel: OPERATOR_WORKBENCH_IPC_CHANNELS.getSnapshot,
      payload: undefined
    },
    {
      channel: OPERATOR_WORKBENCH_IPC_CHANNELS.runCommand,
      payload: { command: "inspect this" }
    },
    {
      channel: OPERATOR_WORKBENCH_IPC_CHANNELS.dispatchIntent,
      payload: { type: "activate-primary" }
    },
    {
      channel: OPERATOR_WORKBENCH_IPC_CHANNELS.updateDisplaySettings,
      payload: { fontSize: 18 }
    },
    {
      channel: OPERATOR_WORKBENCH_IPC_CHANNELS.getAutocomplete,
      payload: { line: "ins" }
    },
    {
      channel: OPERATOR_WORKBENCH_IPC_CHANNELS.windowControl,
      payload: { action: "toggle-maximize" }
    }
  ]);
});

test("operator workbench settings store persists normalized workspace-scoped display settings", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-operator-settings-"));
  try {
    const store = createOperatorWorkbenchSettingsStore({ userDataRoot: tempRoot });
    const key = createOperatorWorkbenchWorkspaceKey({
      cwd: "C:/repo",
      appPath: "examples/demo/app.wtoml",
      worldHome: "C:/worlds/demo"
    });
    const initial = await store.load(key);
    assert.equal(initial.fontSize, 14);

    const saved = await store.save(key, {
      fontSize: 19,
      rowDensity: "compact",
      paneSplit: 0.61,
      defaultColumns: ["title", "id"],
      pageSize: 40,
      colorMode: "on"
    });
    assert.equal(saved.fontSize, 19);
    assert.equal(saved.pageSize, 40);

    const reloaded = await store.load(key);
    assert.deepEqual(reloaded, saved);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("package scripts promote the rich tui host while keeping the raw shell explicit", async () => {
  const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts.tui, "node scripts/run-tui.mjs");
  assert.equal(packageJson.scripts["tui:shell"], "node src/cli.js tui");
  assert.equal(packageJson.scripts.operator, "node src/cli.js operator");
});

test("operator workbench shell registers IPC handlers, loads a generated html page, and cleans up once", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-operator-shell-"));
  const handled = new Map();
  const removed = [];
  const loadedUrls = [];
  const appHandlers = new Map();
  let coreCloseCalls = 0;
  let createCoreOptions = null;
  const windows = [];

  class MockWindow {
    constructor(options) {
      this.options = options;
      this.events = new Map();
      this.webContentsEvents = new Map();
      this.webContents = {
        on: (event, handler) => {
          this.webContentsEvents.set(event, handler);
        },
        isDevToolsOpened: () => Boolean(this.devToolsOpened),
        openDevTools: options => {
          this.devToolsOpened = true;
          this.devToolsOptions = options;
        },
        closeDevTools: () => {
          this.devToolsOpened = false;
        }
      };
      windows.push(this);
    }

    once(event, handler) {
      this.events.set(`once:${event}`, handler);
    }

    on(event, handler) {
      this.events.set(event, handler);
    }

    show() {}

    isMaximized() {
      return Boolean(this.maximized);
    }

    isMinimizable() {
      return true;
    }

    isMaximizable() {
      return true;
    }

    isClosable() {
      return true;
    }

    minimize() {
      this.minimized = true;
    }

    maximize() {
      this.maximized = true;
    }

    unmaximize() {
      this.maximized = false;
    }

    close() {
      this.closed = true;
    }

    removeMenu() {
      this.menuRemoved = true;
    }

    setMenuBarVisibility(value) {
      this.menuBarVisible = value;
    }

    async loadURL(url) {
      loadedUrls.push(url);
    }

    async loadFile(filePath) {
      loadedUrls.push(`file:${filePath}`);
    }
  }

  const electron = {
    app: {
      async whenReady() {},
      on(event, handler) {
        appHandlers.set(event, handler);
      },
      getPath(kind) {
        return kind === "userData" ? tempRoot : tempRoot;
      },
      quit() {
        this.quitCalled = true;
      }
    },
    BrowserWindow: MockWindow,
    ipcMain: {
      handle(channel, fn) {
        handled.set(channel, fn);
      },
      removeHandler(channel) {
        removed.push(channel);
        handled.delete(channel);
      }
    }
  };

  const shell = await createOperatorWorkbenchShell({
    electron,
    args: ["examples/demo/app.wtoml", "--world-home", "C:/worlds/demo"],
    createCoreImpl: async options => {
      createCoreOptions = options;
      return {
        async snapshot() {
          return { ok: true };
        },
        async executeCommand(command) {
          return { result: { output: command }, snapshot: { ok: true, command } };
        },
        async dispatchIntent(intent) {
          return { snapshot: { ok: true, intent } };
        },
        async updateDisplaySettings(patch) {
          const persisted = await options.saveDisplaySettings(patch);
          return { snapshot: { ui: { displaySettings: persisted } } };
        },
        autocomplete(line) {
          return { preview: line, matches: [] };
        },
        async close() {
          coreCloseCalls += 1;
        }
      };
    },
    renderPageImpl: () => "<html><body>operator shell</body></html>"
  });

  try {
    assert.equal(Boolean(createCoreOptions), true);
    assert.equal(windows.length, 1);
    assert.equal(windows[0].options.width, 1480);
    assert.equal(windows[0].options.title, "Operator TUI");
    assert.equal(windows[0].options.frame, false);
    assert.equal(windows[0].options.autoHideMenuBar, true);
    assert.equal(windows[0].menuRemoved, true);
    assert.equal(windows[0].menuBarVisible, false);
    assert.equal(windows[0].webContentsEvents.has("before-input-event"), true);
    assert.equal(loadedUrls.length, 1);
    assert.equal(loadedUrls[0].startsWith("file:"), true);
    const loadedFilePath = loadedUrls[0].slice("file:".length);
    const loadedHtml = await fs.readFile(loadedFilePath, "utf8");
    assert.equal(loadedHtml.includes("operator shell"), true);
    assert.deepEqual([...handled.keys()].sort(), Object.values(OPERATOR_WORKBENCH_IPC_CHANNELS).sort());

    const updated = await handled.get(OPERATOR_WORKBENCH_IPC_CHANNELS.updateDisplaySettings)(null, { fontSize: 17 });
    assert.equal(updated.snapshot.ui.displaySettings.fontSize, 17);
    assert.equal(updated.snapshot.hostWindow.maximized, false);

    const maximized = await handled.get(OPERATOR_WORKBENCH_IPC_CHANNELS.windowControl)(null, { action: "toggle-maximize" });
    assert.equal(maximized.hostWindow.maximized, true);

    const beforeInput = windows[0].webContentsEvents.get("before-input-event");
    const keyboardEvent = { prevented: false, preventDefault() { this.prevented = true; } };
    beforeInput?.(keyboardEvent, { key: "F12", control: false, meta: false, shift: false });
    assert.equal(keyboardEvent.prevented, true);
    assert.equal(windows[0].devToolsOpened, true);
    beforeInput?.({ preventDefault() {} }, { key: "W", control: true, meta: false, shift: false });
    assert.equal(windows[0].closed, true);

    const settingsStore = createOperatorWorkbenchSettingsStore({ userDataRoot: tempRoot });
    const savedSettings = await settingsStore.load(createOperatorWorkbenchWorkspaceKey({
      cwd: process.cwd(),
      appPath: "examples/demo/app.wtoml",
      worldHome: "C:/worlds/demo"
    }));
    assert.equal(savedSettings.fontSize, 17);

    await shell.close();
    assert.equal(coreCloseCalls, 1);

    await appHandlers.get("window-all-closed")?.();
    assert.equal(coreCloseCalls, 1);
    assert.deepEqual(removed.sort(), Object.values(OPERATOR_WORKBENCH_IPC_CHANNELS).sort());
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
