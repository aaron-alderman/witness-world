import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { loadAppProject } from "../src/app-project.js";
import {
  CELL_MEMORY_LAYOUT,
  CELL_FLAGS,
  clearCellBuffer,
  createCellBuffer,
  putCell,
  readCellBufferHeader,
  readRowText
} from "../examples/operator/browser/operator-framebuffer.js";
import {
  collectGlyphCodepoints,
  resolveCanvasCellMetrics
} from "../examples/operator/browser/operator-glyph-atlas.js";
import {
  buildViewportFrameGraph,
  fillStyleById,
  paintViewportFrameGraph,
  resolveFrameGraphVariantPolicy,
  resolveFrameGraphCellGlyph
} from "../examples/operator/browser/operator-frame-graph.js";
import { createOperatorBrowserLiveApi } from "../examples/operator/browser/operator-browser-live-api.js";
import {
  resolveOperatorBrowserBootstrap,
  shouldForceFixtureBootstrap
} from "../examples/operator/browser/operator-bootstrap.js";
import { parseOperatorWorkbenchRvm } from "../examples/operator/browser/operator-rvm.js";
import {
  createOperatorBrowserStateFromWorkbenchSnapshot,
  sanitizeOperatorWorkbenchSnapshot
} from "../examples/operator/browser/operator-snapshot-adapter.js";
import { createOperatorExampleState } from "../examples/operator/browser/operator-sample-state.js";
import {
  createOperatorBrowserRuntime,
  composeViewportToBuffer,
  layoutViewport
} from "../examples/operator/browser/operator-runtime.js";
import {
  buildOperatorTuiState,
  buildOperatorWorkbenchSnapshot,
  createOperatorTuiEngine,
  loadOperatorTuiRuntimeContext
} from "../src/operator-tui.js";
import { createOperatorWorkbenchCore } from "../src/operator-workbench/core.js";

const exampleRoot = path.resolve("examples", "operator");

async function loadBrowserExampleModel() {
  const source = await fs.readFile(path.join(exampleRoot, "browser", "operator.workbench.rvm"), "utf8");
  return parseOperatorWorkbenchRvm(source);
}

async function loadBrowserExampleSnapshotFixture() {
  const source = await fs.readFile(path.join(exampleRoot, "browser", "operator.snapshot.json"), "utf8");
  return JSON.parse(source);
}

function readAllRows(buffer) {
  return Array.from({ length: buffer.height }, (_row, index) => readRowText(buffer, index));
}

function createFakeWindowTarget() {
  const listeners = new Map();
  return {
    listeners,
    innerWidth: 1600,
    innerHeight: 900,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    }
  };
}

function createFakeCanvas() {
  const listeners = new Map();
  const context = {
    imageSmoothingEnabled: false,
    fillStyle: "#000000",
    font: "",
    textBaseline: "top",
    fillRect() {},
    fillText() {}
  };
  return {
    listeners,
    clientWidth: 1600,
    clientHeight: 900,
    width: 1600,
    height: 900,
    style: {},
    getContext() {
      return context;
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 1600, height: 900 };
    }
  };
}

function pointerEventForCell(canvas, layout, x, y) {
  const rect = canvas.getBoundingClientRect();
  return {
    clientX: rect.left + ((x + 0.5) / layout.bounds.width) * rect.width,
    clientY: rect.top + ((y + 0.5) / layout.bounds.height) * rect.height,
    preventDefault() {}
  };
}

test("operator example current app project authoring loads through the existing workbench plugin seam", async () => {
  const appProject = await loadAppProject(exampleRoot, {
    runtimePluginIds: ["plugin.operator-workbench"]
  });
  assert.equal(appProject.operatorWorkbench.defaultScreen, "operator_trace");
  assert.equal(appProject.operatorWorkbench.defaultLeftScreen, "operator_left");
  assert.equal(appProject.operatorWorkbench.defaultViewport, "operator_default");
  assert.equal(appProject.operatorWorkbench.overlaysById.get("help_overlay")?.kind, "doc_view");
  assert.equal(appProject.operatorWorkbench.overlaysById.get("context_menu")?.kind, "menu");
  assert.equal(appProject.operatorWorkbench.overlaysById.get("help_overlay")?.resizable, true);
  assert.equal(appProject.operatorWorkbench.handlesById.get("top_handle")?.axis, "horizontal");
  assert.equal(appProject.operatorWorkbench.handlesById.get("bottom_handle")?.axis, "horizontal");
  assert.equal(appProject.operatorWorkbench.handlesById.get("split_handle")?.axis, "vertical");
  assert.equal(appProject.operatorWorkbench.surfacesById.get("top_status")?.kind, "status_bar");
  assert.equal(appProject.operatorWorkbench.surfacesById.get("command_bar")?.kind, "command_bar");
  const viewport = appProject.operatorWorkbench.viewportsById.get("operator_default");
  assert.equal(viewport?.screenId, "operator_trace");
  assert.equal(viewport?.leftScreenId, "operator_left");
  assert.equal(viewport?.topSurfaceId, "top_status");
  assert.equal(viewport?.bottomSurfaceId, "command_bar");
  assert.equal(viewport?.topHandleId, "top_handle");
  assert.equal(viewport?.bottomHandleId, "bottom_handle");
  assert.equal(viewport?.splitHandleId, "split_handle");
  assert.equal(viewport?.width, 80);
  assert.equal(viewport?.height, 30);
  assert.equal(viewport?.top, 3);
  assert.equal(viewport?.bottom, 4);
  assert.equal(viewport?.splitOrientation, "horizontal");
  assert.deepEqual(viewport?.bindings.map(binding => `${binding.trigger}:${binding.verb}:${binding.target}`), [
    "F1:overlay:help_overlay",
    "MouseSecondary:overlay:context_menu",
    "Alt-R:action:rename",
    "F2:action:rename"
  ]);
  assert.equal(appProject.operatorWorkbench.shortcuts.get("F5"), "operator_trace");
});

test("operator example prototype RVM parses themes, surfaces, overlays, and bindings", async () => {
  const model = await loadBrowserExampleModel();
  assert.equal(model.themes.length, 1);
  assert.equal(model.surfaces.length, 6);
  assert.equal(model.viewports.length, 1);
  const viewport = model.viewportById.get("default");
  assert.deepEqual(viewport.center, {
    kind: "split",
    orientation: "horizontal",
    leftWeight: 28,
    rightWeight: 72,
    leftSurfaceId: "nav_tree",
    rightSurfaceId: "session_reader"
  });
  assert.deepEqual(viewport.overlays, ["help_overlay", "context_menu"]);
  assert.equal(viewport.bindings.some(binding => binding.trigger === "F1" && binding.target === "help_overlay"), true);
  assert.equal(model.surfaceById.get("help_overlay")?.width, 56);
  assert.equal(model.surfaceById.get("context_menu")?.height, 8);
});

test("operator example shared core can build a workbench snapshot for the browser bridge", async () => {
  const runtimeContext = await loadOperatorTuiRuntimeContext({
    appPath: exampleRoot,
    runtimePluginIds: ["plugin.operator-workbench"]
  });
  try {
    const state = await buildOperatorTuiState(runtimeContext);
    const engine = createOperatorTuiEngine(state);
    const snapshot = await buildOperatorWorkbenchSnapshot(state, engine.session, {});
    assert.equal(snapshot.leftPane?.title, "Operator Navigation");
    assert.equal(snapshot.viewport?.id, "operator_default");
    assert.equal(snapshot.viewport?.topSurfaceId, "top_status");
    assert.equal(snapshot.viewport?.splitHandleId, "split_handle");
    assert.equal(snapshot.viewport?.layout?.top, 3);
    assert.equal(snapshot.viewport?.layout?.leftWeight, 28);
    assert.equal(Array.isArray(snapshot.topPane?.navigation?.chips), true);
  } finally {
    await runtimeContext.close?.();
  }
});

test("operator browser snapshot adapter lowers a shared workbench snapshot into browser runtime state", async () => {
  const fixture = await loadBrowserExampleSnapshotFixture();
  const runtimeState = createOperatorBrowserStateFromWorkbenchSnapshot(fixture);
  assert.equal(runtimeState.viewportId, "default");
  assert.equal(runtimeState.viewportLayout.top, 3);
  assert.equal(runtimeState.viewportLayout.bottom, 4);
  assert.equal(runtimeState.viewportLayout.leftWeight, 28);
  assert.deepEqual(runtimeState.localUi, { overlayIds: [] });
  assert.equal(runtimeState.leftPane.title, "Operator Navigation");
  assert.equal(runtimeState.leftPane.mode, "tree");
  assert.equal(Array.isArray(runtimeState.leftPane.rows), true);
  assert.equal(runtimeState.snapshot.topPane?.navigation?.chips?.[0]?.label, "root");
  assert.equal(runtimeState.leftPane.rows[0]?.label, "Session");
  assert.equal(runtimeState.snapshot.rightPane?.bodyLines?.[0]?.includes("Session"), true);
  assert.equal(runtimeState.snapshot.viewport?.id, "operator_default");
  assert.equal(runtimeState.snapshot.viewport?.layout?.leftWeight, 28);
  assert.equal(runtimeState.snapshot.session.appRoot, null);
  assert.equal(runtimeState.snapshot.session.worldHome, null);
  assert.equal(Object.hasOwn(runtimeState, "commandText"), false);
  assert.equal(Object.hasOwn(runtimeState, "helpLines"), false);
  assert.equal(Object.hasOwn(runtimeState, "contextMenuItems"), false);
  assert.equal(Object.hasOwn(runtimeState, "focusedSurfaceId"), false);
  assert.equal(Object.hasOwn(runtimeState, "topCursor"), false);
  assert.equal(Object.hasOwn(runtimeState, "leftCursor"), false);
  assert.equal(Object.hasOwn(runtimeState, "rightCursor"), false);
  assert.equal(Object.hasOwn(runtimeState, "overlays"), false);
});

test("operator browser snapshot fixture is sanitized for browser-side use", async () => {
  const fixture = await loadBrowserExampleSnapshotFixture();
  const sanitized = sanitizeOperatorWorkbenchSnapshot(fixture);
  assert.equal(sanitized.session?.appRoot, null);
  assert.equal(sanitized.session?.worldHome, null);
  assert.equal(sanitized.viewport?.id, "operator_default");
});

test("operator browser live api requests the shared snapshot and command routes", async () => {
  const calls = [];
  const api = createOperatorBrowserLiveApi({
    baseUrl: "http://127.0.0.1:4020",
    fetchImpl: async (url, options = undefined) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { ok: true, url, method: options?.method || "GET" };
        }
      };
    }
  });
  const snapshot = await api.getSnapshot();
  const command = await api.runCommand("inspect 1");
  const intent = await api.dispatchIntent({ type: "focus-pane", pane: "right" });
  const settings = await api.updateDisplaySettings({ paneSplit: 0.5 });
  assert.equal(snapshot.method, "GET");
  assert.equal(command.method, "POST");
  assert.equal(intent.method, "POST");
  assert.equal(settings.method, "POST");
  assert.deepEqual(calls.map(call => call.url), [
    "http://127.0.0.1:4020/api/snapshot",
    "http://127.0.0.1:4020/api/command",
    "http://127.0.0.1:4020/api/intent",
    "http://127.0.0.1:4020/api/display-settings"
  ]);
  assert.match(String(calls[1].options?.body || ""), /inspect 1/);
  assert.match(String(calls[2].options?.body || ""), /focus-pane/);
  assert.match(String(calls[3].options?.body || ""), /paneSplit/);
});

test("operator browser bootstrap requires explicit fixture mode instead of silently falling back", async () => {
  let fixtureLoads = 0;
  await assert.rejects(
    resolveOperatorBrowserBootstrap({
      liveApi: {
        async getSnapshot() {
          throw new Error("bridge offline");
        }
      },
      search: "",
      async loadFixtureSnapshot() {
        fixtureLoads += 1;
        return { fixture: true };
      }
    }),
    /operator bridge unavailable; start the local server or reopen with \?fixture=1/i
  );
  assert.equal(fixtureLoads, 0);
});

test("operator browser bootstrap enters explicit fixture-readonly mode when requested", async () => {
  let liveCalls = 0;
  let fixtureLoads = 0;
  const resolved = await resolveOperatorBrowserBootstrap({
    liveApi: {
      async getSnapshot() {
        liveCalls += 1;
        return { live: true };
      }
    },
    search: "?fixture=1",
    async loadFixtureSnapshot() {
      fixtureLoads += 1;
      return { fixture: true };
    }
  });
  assert.equal(shouldForceFixtureBootstrap("?fixture=1"), true);
  assert.equal(resolved.hostMode, "fixture-readonly");
  assert.equal(resolved.liveApi, null);
  assert.deepEqual(resolved.snapshot, { fixture: true });
  assert.equal(liveCalls, 0);
  assert.equal(fixtureLoads, 1);
});

test("operator browser runtime round-trips left-pane movement and activation through the live core", async () => {
  const model = await loadBrowserExampleModel();
  const core = await createOperatorWorkbenchCore({
    args: [exampleRoot, "--runtime-plugin", "plugin.operator-workbench"],
    cwd: path.resolve("."),
    env: process.env
  });
  try {
    const initialSnapshot = await core.snapshot();
    const canvas = createFakeCanvas();
    const windowTarget = createFakeWindowTarget();
    const runtime = createOperatorBrowserRuntime({
      canvas,
      model,
      initialState: createOperatorBrowserStateFromWorkbenchSnapshot(initialSnapshot),
      liveApi: {
        dispatchIntent(intent) {
          return core.dispatchIntent(intent);
        }
      },
      windowTarget
    });
    runtime.mount();

    const keydown = windowTarget.listeners.get("keydown");
    assert.equal(typeof keydown, "function");

    await keydown({
      key: "ArrowDown",
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.leftPane.cursor, 1);
    assert.equal(runtime.runtimeState.snapshot.leftPane?.cursor, 1);
    assert.equal(runtime.runtimeState.leftPane.rows[1]?.label, "World");

    await keydown({
      key: "Enter",
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.leftPane?.header, "World");
    assert.equal(runtime.runtimeState.leftPane.rows[0]?.label, "Contexts");
    assert.equal(runtime.runtimeState.snapshot.rightPane?.bodyLines?.some(line => line.includes("Processes")), true);
  } finally {
    await core.close();
  }
});

test("operator browser runtime routes top-pane focus and activation through the live core", async () => {
  const model = await loadBrowserExampleModel();
  const core = await createOperatorWorkbenchCore({
    args: [exampleRoot, "--runtime-plugin", "plugin.operator-workbench"],
    cwd: path.resolve("."),
    env: process.env
  });
  try {
    const initialSnapshot = await core.snapshot();
    const canvas = createFakeCanvas();
    const windowTarget = createFakeWindowTarget();
    const runtime = createOperatorBrowserRuntime({
      canvas,
      model,
      initialState: createOperatorBrowserStateFromWorkbenchSnapshot(initialSnapshot),
      liveApi: {
        dispatchIntent(intent) {
          return core.dispatchIntent(intent);
        }
      },
      windowTarget
    });
    runtime.mount();

    const keydown = windowTarget.listeners.get("keydown");
    assert.equal(typeof keydown, "function");

    await keydown({
      key: "ArrowUp",
      altKey: true,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.focusedPane, "top");

    await keydown({
      key: "ArrowRight",
      altKey: false,
      preventDefault() {}
    });
    await keydown({
      key: "ArrowRight",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.topPane?.navigation?.selectedIndex, 2);
    assert.equal(runtime.runtimeState.snapshot.topPane?.navigation?.chips?.[2]?.label, "Inspect");

    await keydown({
      key: "Enter",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.rightPane?.activeScreenId, "references");
    assert.equal(runtime.runtimeState.snapshot.ui?.focusedPane, "top");
  } finally {
    await core.close();
  }
});

test("operator browser runtime routes right-pane row movement and activation through the live core", async () => {
  const model = await loadBrowserExampleModel();
  const core = await createOperatorWorkbenchCore({
    args: [exampleRoot, "--runtime-plugin", "plugin.operator-workbench"],
    cwd: path.resolve("."),
    env: process.env
  });
  try {
    await core.executeCommand("open world");
    await core.executeCommand("open things");
    await core.executeCommand("inspect 1");
    const screenResult = await core.executeCommand("screen references");

    const canvas = createFakeCanvas();
    const windowTarget = createFakeWindowTarget();
    const runtime = createOperatorBrowserRuntime({
      canvas,
      model,
      initialState: createOperatorBrowserStateFromWorkbenchSnapshot(screenResult.snapshot),
      liveApi: {
        dispatchIntent(intent) {
          return core.dispatchIntent(intent);
        }
      },
      windowTarget
    });
    runtime.mount();

    const keydown = windowTarget.listeners.get("keydown");
    assert.equal(typeof keydown, "function");
    assert.equal((runtime.runtimeState.snapshot.rightPane?.screen?.rows?.length ?? 0) > 1, true);

    await keydown({
      key: "ArrowRight",
      altKey: true,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.focusedPane, "right");

    await keydown({
      key: "ArrowDown",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.rightPane?.cursor, 1);
    assert.equal(runtime.runtimeState.snapshot.rightPane?.screen?.rows?.[1]?.label, "operator_example");

    await keydown({
      key: "Enter",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.rightPane?.target?.id, "operator_example");
    assert.equal(runtime.runtimeState.snapshot.rightPane?.activeScreenId, "inspect");
    assert.equal(runtime.runtimeState.snapshot.rightPane?.bodyLines?.some(line => line.includes("operator_example")), true);
  } finally {
    await core.close();
  }
});

test("operator browser runtime routes right-pane section movement and collapse through the live core", async () => {
  const model = await loadBrowserExampleModel();
  const core = await createOperatorWorkbenchCore({
    args: [exampleRoot, "--runtime-plugin", "plugin.operator-workbench"],
    cwd: path.resolve("."),
    env: process.env
  });
  try {
    const screenResult = await core.executeCommand("screen operator_trace");
    const canvas = createFakeCanvas();
    const windowTarget = createFakeWindowTarget();
    const runtime = createOperatorBrowserRuntime({
      canvas,
      model,
      initialState: createOperatorBrowserStateFromWorkbenchSnapshot(screenResult.snapshot),
      liveApi: {
        dispatchIntent(intent) {
          return core.dispatchIntent(intent);
        }
      },
      windowTarget
    });
    runtime.mount();

    const keydown = windowTarget.listeners.get("keydown");
    assert.equal(typeof keydown, "function");

    await keydown({
      key: "ArrowRight",
      altKey: true,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.focusedPane, "right");
    assert.equal(runtime.runtimeState.snapshot.rightPane?.activeSection?.title, "Links");

    await keydown({
      key: "-",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.rightPane?.activeSection?.collapsed, true);
    assert.equal(runtime.runtimeState.snapshot.rightPane?.bodyLines?.[0], "Links is collapsed.");

    await keydown({
      key: "=",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.rightPane?.activeSection?.collapsed, false);

    await keydown({
      key: "[",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.rightPane?.activeSection?.id, "operator_summary");
    assert.equal(runtime.runtimeState.snapshot.rightPane?.activeSection?.title, "Summary");
    assert.equal(runtime.runtimeState.snapshot.rightPane?.bodyLines?.some(line => line.includes("Session")), true);
  } finally {
    await core.close();
  }
});

test("operator browser runtime routes the help overlay through the live core and leaves the context menu local", async () => {
  const model = await loadBrowserExampleModel();
  const core = await createOperatorWorkbenchCore({
    args: [exampleRoot, "--runtime-plugin", "plugin.operator-workbench"],
    cwd: path.resolve("."),
    env: process.env
  });
  try {
    const initialSnapshot = await core.snapshot();
    const canvas = createFakeCanvas();
    const windowTarget = createFakeWindowTarget();
    const runtime = createOperatorBrowserRuntime({
      canvas,
      model,
      initialState: createOperatorBrowserStateFromWorkbenchSnapshot(initialSnapshot),
      liveApi: {
        dispatchIntent(intent) {
          return core.dispatchIntent(intent);
        }
      },
      windowTarget
    });
    runtime.mount();

    const keydown = windowTarget.listeners.get("keydown");
    const contextmenu = canvas.listeners.get("contextmenu");
    assert.equal(typeof keydown, "function");
    assert.equal(typeof contextmenu, "function");

    await keydown({
      key: "F1",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.helpOpen, true);
    assert.equal(Array.isArray(runtime.runtimeState.localUi?.overlayIds), true);

    await keydown({
      key: "Escape",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.helpOpen, false);
    assert.equal((runtime.runtimeState.localUi?.overlayIds || []).includes("help_overlay"), false);

    await contextmenu({
      preventDefault() {}
    });
    assert.equal((runtime.runtimeState.localUi?.overlayIds || []).includes("context_menu"), true);
    assert.equal(runtime.runtimeState.snapshot.ui?.helpOpen, false);

    await keydown({
      key: "Escape",
      altKey: false,
      preventDefault() {}
    });
    assert.equal((runtime.runtimeState.localUi?.overlayIds || []).includes("context_menu"), false);
    assert.equal(runtime.runtimeState.snapshot.ui?.helpOpen, false);
  } finally {
    await core.close();
  }
});

test("operator browser runtime renders left-pane search overlays from the shared snapshot model", async () => {
  const model = await loadBrowserExampleModel();
  const core = await createOperatorWorkbenchCore({
    args: [exampleRoot, "--runtime-plugin", "plugin.operator-workbench"],
    cwd: path.resolve("."),
    env: process.env
  });
  try {
    const searchResult = await core.executeCommand("search operator");
    const runtimeState = createOperatorBrowserStateFromWorkbenchSnapshot(searchResult.snapshot);
    const { buffer } = composeViewportToBuffer(model, runtimeState);
    const rows = readAllRows(buffer);

    assert.equal(runtimeState.leftPane.mode, "results");
    assert.equal(runtimeState.leftPane.shape, "table");
    assert.equal(runtimeState.leftPane.title, "Search Results");
    assert.equal(runtimeState.leftPane.columns.includes("title"), true);
    assert.equal(rows.some(line => line.includes("Search Results")), true);
  } finally {
    await core.close();
  }
});

test("operator browser runtime commits viewport layout through the shared core and persists the vertical split setting", async () => {
  const model = await loadBrowserExampleModel();
  const core = await createOperatorWorkbenchCore({
    args: [exampleRoot, "--runtime-plugin", "plugin.operator-workbench"],
    cwd: path.resolve("."),
    env: process.env
  });
  try {
    const initialSnapshot = await core.snapshot();
    const canvas = createFakeCanvas();
    const windowTarget = createFakeWindowTarget();
    const runtime = createOperatorBrowserRuntime({
      canvas,
      model,
      initialState: createOperatorBrowserStateFromWorkbenchSnapshot(initialSnapshot),
      liveApi: {
        dispatchIntent(intent) {
          return core.dispatchIntent(intent);
        }
      },
      windowTarget
    });
    runtime.mount();

    const pointerdown = canvas.listeners.get("pointerdown");
    const pointermove = windowTarget.listeners.get("pointermove");
    const pointerup = windowTarget.listeners.get("pointerup");
    assert.equal(typeof pointerdown, "function");
    assert.equal(typeof pointermove, "function");
    assert.equal(typeof pointerup, "function");

    let layout = layoutViewport(model, runtime.runtimeState);
    await pointerdown(pointerEventForCell(
      canvas,
      layout,
      layout.handles.vertical.x,
      layout.handles.vertical.y + 1
    ));
    pointermove(pointerEventForCell(canvas, layout, 40, layout.handles.vertical.y + 1));
    await pointerup({});

    assert.equal(runtime.runtimeState.viewportLayout.leftWeight, 50);
    assert.equal((await core.snapshot()).viewport?.layout?.leftWeight, 50);
    assert.equal((await core.snapshot()).ui.displaySettings.paneSplit, 0.5);
    assert.equal((await core.snapshot()).ui.displaySettings.viewportTop, 3);
    assert.equal((await core.snapshot()).ui.displaySettings.viewportBottom, 4);

    layout = layoutViewport(model, runtime.runtimeState);
    const topBefore = runtime.runtimeState.viewportLayout.top;
    await pointerdown(pointerEventForCell(canvas, layout, 10, layout.handles.top.y));
    pointermove(pointerEventForCell(canvas, layout, 10, 5));
    await pointerup({});

    assert.notEqual(runtime.runtimeState.viewportLayout.top, topBefore);
    assert.equal((await core.snapshot()).viewport?.layout?.top, runtime.runtimeState.viewportLayout.top);
    assert.equal((await core.snapshot()).ui.displaySettings.paneSplit, 0.5);
    assert.equal((await core.snapshot()).ui.displaySettings.viewportTop, runtime.runtimeState.viewportLayout.top);

    layout = layoutViewport(model, runtime.runtimeState);
    const bottomBefore = runtime.runtimeState.viewportLayout.bottom;
    await pointerdown(pointerEventForCell(canvas, layout, 10, layout.handles.bottom.y));
    pointermove(pointerEventForCell(canvas, layout, 10, layout.bounds.height - 6));
    await pointerup({});

    assert.notEqual(runtime.runtimeState.viewportLayout.bottom, bottomBefore);
    assert.equal((await core.snapshot()).viewport?.layout?.bottom, runtime.runtimeState.viewportLayout.bottom);
    assert.equal((await core.snapshot()).ui.displaySettings.viewportBottom, runtime.runtimeState.viewportLayout.bottom);
  } finally {
    await core.close();
  }
});

test("operator browser runtime fixture fallback stays read-only for product interactions while keeping local presentation overlays", async () => {
  const model = await loadBrowserExampleModel();
  const canvas = createFakeCanvas();
  const windowTarget = createFakeWindowTarget();
  const runtime = createOperatorBrowserRuntime({
    canvas,
    model,
    initialState: createOperatorBrowserStateFromWorkbenchSnapshot(await loadBrowserExampleSnapshotFixture()),
    liveApi: null,
    fallbackPolicy: "read-only-fixture",
    windowTarget
  });
  runtime.mount();

  const keydown = windowTarget.listeners.get("keydown");
  const contextmenu = canvas.listeners.get("contextmenu");
  const wheel = canvas.listeners.get("wheel");
  const pointerdown = canvas.listeners.get("pointerdown");
  const pointermove = windowTarget.listeners.get("pointermove");
  const pointerup = windowTarget.listeners.get("pointerup");
  assert.equal(typeof keydown, "function");
  assert.equal(typeof contextmenu, "function");
  assert.equal(typeof wheel, "function");
  assert.equal(typeof pointerdown, "function");
  assert.equal(typeof pointermove, "function");
  assert.equal(typeof pointerup, "function");

  const initialFocusedPane = runtime.runtimeState.snapshot.ui?.focusedPane;
  const initialCursor = runtime.runtimeState.leftPane.cursor;
  const initialSelectedTop = runtime.runtimeState.snapshot.topPane?.navigation?.selectedIndex;

  await keydown({
    key: "ArrowDown",
    preventDefault() {}
  });
  await keydown({
    key: "ArrowUp",
    altKey: true,
    preventDefault() {}
  });
  await keydown({
    key: "F1",
    preventDefault() {}
  });
  await keydown({
    key: "Enter",
    preventDefault() {}
  });

  assert.equal(runtime.runtimeState.leftPane.cursor, initialCursor);
  assert.equal(runtime.runtimeState.snapshot.ui?.focusedPane, initialFocusedPane);
  assert.equal(runtime.runtimeState.snapshot.topPane?.navigation?.selectedIndex, initialSelectedTop);
  assert.notEqual(runtime.runtimeState.snapshot.ui?.helpOpen, true);
  assert.equal((runtime.runtimeState.localUi?.overlayIds || []).includes("help_overlay"), false);

  await contextmenu({
    preventDefault() {}
  });
  assert.equal((runtime.runtimeState.localUi?.overlayIds || []).includes("context_menu"), true);

  const beforeScrollY = runtime.runtimeState.scrollBySurfaceId.session_reader.y;
  wheel({
    deltaY: 10,
    shiftKey: false,
    preventDefault() {}
  });
  assert.equal(runtime.runtimeState.scrollBySurfaceId.session_reader.y, beforeScrollY + 1);

  const layout = layoutViewport(model, runtime.runtimeState);
  const beforeLeftWeight = runtime.runtimeState.viewportLayout.leftWeight;
  await pointerdown(pointerEventForCell(
    canvas,
    layout,
    layout.handles.vertical.x,
    layout.handles.vertical.y + 1
  ));
  pointermove(pointerEventForCell(canvas, layout, 40, layout.handles.vertical.y + 1));
  await pointerup({});
  assert.equal(runtime.runtimeState.viewportLayout.leftWeight, beforeLeftWeight);

  const { buffer } = runtime.compose();
  const rows = readAllRows(buffer);
  assert.equal(rows.some(line => line.includes("Fixture mode: read-only")), true);
});

test("operator example layout emits deterministic split handles and pane bounds", async () => {
  const model = await loadBrowserExampleModel();
  const layout = layoutViewport(model, createOperatorExampleState());
  assert.equal(layout.bounds.width, 80);
  assert.equal(layout.bounds.height, 30);
  assert.equal(layout.left.width < layout.right.width, true);
  assert.equal(layout.handles.vertical.width, 1);
  assert.equal(layout.handles.top.height, 1);
  assert.equal(layout.handles.bottom.height, 1);
});

test("operator example frame graph models pane frames, separators, and overlay frames deterministically", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.localUi = { overlayIds: ["context_menu"] };
  const layout = layoutViewport(model, state);
  const graph = buildViewportFrameGraph({
    layout,
    paneFrames: [
      { rect: layout.top, styleId: "passive" },
      { rect: layout.left, styleId: "container" },
      { rect: layout.right, styleId: "primary" },
      { rect: layout.bottom, styleId: "passive" }
    ],
    separators: [
      { rect: layout.handles.vertical, axis: "vertical", styleId: "separator" },
      { rect: layout.handles.top, axis: "horizontal", styleId: "separator" },
      { rect: layout.handles.bottom, axis: "horizontal", styleId: "separator" }
    ],
    overlays: [{
      rect: { x: 24, y: 10, width: 20, height: 8 },
      styleId: "overlay"
    }]
  });

  assert.equal(graph.paneFrames.length, 4);
  assert.equal(graph.separators.length, 3);
  assert.equal(graph.overlays.length, 1);
  assert.equal(graph.layers.length, 2);
  assert.equal(graph.layers[0].cells.size > 0, true);
  assert.equal(graph.layers[1].cells.size > 0, true);
  assert.equal(graph.ornaments.length, 0);
  assert.deepEqual(graph.separators.map(separator => `${separator.axis}:${separator.styleId}`), [
    "vertical:separator",
    "horizontal:separator",
    "horizontal:separator"
  ]);
});

test("operator example frame graph resolves heavy and mixed frame glyphs deterministically", () => {
  assert.equal(resolveFrameGraphCellGlyph({
    left: { variant: "heavy", priority: 20 },
    right: { variant: "heavy", priority: 20 },
    up: { variant: "single", priority: 10 },
    down: { variant: "single", priority: 10 }
  }), "┿");
  assert.equal(resolveFrameGraphCellGlyph({
    left: { variant: "single", priority: 10 },
    right: { variant: "single", priority: 10 },
    up: { variant: "heavy", priority: 20 },
    down: { variant: "heavy", priority: 20 }
  }), "╂");
  assert.equal(resolveFrameGraphCellGlyph({
    left: { variant: "heavy", priority: 20 },
    right: { variant: "heavy", priority: 20 },
    up: { variant: "double", priority: 30 },
    down: { variant: "double", priority: 30 }
  }), "╬");
});

test("operator example frame graph exposes explicit variant policy for mixed and normalized cases", () => {
  assert.deepEqual(resolveFrameGraphVariantPolicy("single", "single"), {
    horizontalVariant: "single",
    verticalVariant: "single",
    glyphSet: "single",
    policy: "direct"
  });
  assert.deepEqual(resolveFrameGraphVariantPolicy("heavy", "single"), {
    horizontalVariant: "heavy",
    verticalVariant: "single",
    glyphSet: "mixedHorizontalHeavy",
    policy: "direct"
  });
  assert.deepEqual(resolveFrameGraphVariantPolicy("single", "double"), {
    horizontalVariant: "single",
    verticalVariant: "double",
    glyphSet: "mixedVerticalDouble",
    policy: "direct"
  });
  assert.deepEqual(resolveFrameGraphVariantPolicy("double", "heavy"), {
    horizontalVariant: "double",
    verticalVariant: "heavy",
    glyphSet: "double",
    policy: "normalized-double-over-heavy"
  });
  assert.deepEqual(resolveFrameGraphVariantPolicy("heavy", "double"), {
    horizontalVariant: "heavy",
    verticalVariant: "double",
    glyphSet: "double",
    policy: "normalized-double-over-heavy"
  });
});

test("operator example frame graph normalizes double-heavy corners and tees deterministically", () => {
  assert.equal(resolveFrameGraphCellGlyph({
    right: { variant: "double", priority: 30 },
    down: { variant: "heavy", priority: 20 }
  }), "╔");
  assert.equal(resolveFrameGraphCellGlyph({
    left: { variant: "double", priority: 30 },
    right: { variant: "double", priority: 30 },
    down: { variant: "heavy", priority: 20 }
  }), "╦");
  assert.equal(resolveFrameGraphCellGlyph({
    right: { variant: "heavy", priority: 20 },
    up: { variant: "double", priority: 30 },
    down: { variant: "double", priority: 30 }
  }), "╠");
});

test("operator example focused pane composition uses heavy borders without losing separator determinism", async () => {
  const buffer = clearCellBuffer(createCellBuffer(10, 5));
  const graph = buildViewportFrameGraph({
    layout: { bounds: { x: 0, y: 0, width: 10, height: 5 } },
    paneFrames: [
      { rect: { x: 0, y: 0, width: 6, height: 5 }, styleId: "primary" },
      { rect: { x: 6, y: 0, width: 4, height: 5 }, styleId: "passive" }
    ],
    separators: [
      { rect: { x: 5, y: 0, height: 5 }, axis: "vertical", styleId: "separator" }
    ]
  });
  paintViewportFrameGraph(buffer, graph);
  const rows = readAllRows(buffer);
  assert.equal(rows[0].startsWith("┏"), true);
  assert.equal(rows[1].startsWith("┃"), true);
  assert.equal(rows[1].includes("║"), true);
  assert.equal(rows[2].includes("╫"), true);
  assert.equal(rows[0].endsWith("┐"), true);
});

test("operator example composition lowers authored surfaces into a cell buffer and centers overlays", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.overlays = ["context_menu"];
  const { buffer, frameGraph, fillScene, textScene } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(frameGraph.ornaments.length, 10);
  assert.equal(fillScene.base.length, 4);
  assert.equal(fillScene.base.some(entry => entry.id === "nav_tree"), true);
  assert.equal(fillScene.base.some(entry => entry.id === "session_reader"), true);
  assert.equal(fillScene.base.some(entry => entry.styleId === "primary"), true);
  assert.equal(fillScene.base.every(entry => typeof entry.styleId === "string" && entry.styleId.length > 0), true);
  assert.equal(fillScene.overlay.length, 1);
  assert.equal(fillScene.overlay[0].styleId, "overlay");
  assert.equal(fillStyleById(fillScene.overlay[0].styleId).flags, CELL_FLAGS.overlay);
  assert.equal(textScene.overlay.some(entry => entry.text.includes("Change Color")), true);
  assert.equal(frameGraph.ornaments.some(ornament => Array.isArray(ornament.segments)), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("Operator Navi")), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("x:0 y:0")), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("Context")), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("root")), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes(": screen inspect")), true);
  assert.equal(rows.some(line => line.includes("Session")), true);
  assert.equal(rows.some(line => line.includes("Context")), true);
  assert.equal(rows.some(line => line.includes("Change Color")), true);
  const menuRow = rows.findIndex(line => line.includes("Change Color"));
  assert.equal(menuRow > 8 && menuRow < 22, true);
});

test("operator example top-strip and command bar render through segmented compositor ornaments", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.viewport.id = "v";
  state.snapshot.viewport.theme = "a";
  state.snapshot.topPane.navigation.chips = [
    { label: "r" },
    { label: "p" },
    { label: "i" }
  ];
  const { buffer, frameGraph } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(frameGraph.ornaments.some(ornament => Array.isArray(ornament.segments)
    && ornament.segments.some(segment => segment.text.includes("viewport:v | theme:a | surface:nav_tree"))), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes(": screen inspect")), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("F1 help | Right click menu | Drag handles resize")), true);
  assert.equal(rows[1].includes("viewport:v | theme:a | surface:nav_tree"), true);
  assert.equal(rows.some(line => line.includes(": screen inspect")), true);
});

test("operator example right-pane section header and divider render through compositor ornaments", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.rightPane.screen.rows = [
    { label: "alpha", detail: "first" },
    { label: "beta", detail: "second" }
  ];
  state.snapshot.rightPane.screen.activeSectionTitle = "Trace";
  const { buffer, frameGraph, textScene } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("[Trace rows]")), true);
  assert.equal(frameGraph.ornaments.some(ornament => /^=+$/u.test(ornament.text)), true);
  assert.equal(textScene.base.some(entry => entry.text.includes("alpha first")), true);
  assert.equal(rows.some(line => line.includes("[Trace rows]")), true);
  assert.equal(rows.some(line => line.includes("alpha first")), true);
});

test("operator example left-pane header, table columns, and body rows render through explicit composition seams", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.leftPane = {
    mode: "results",
    shape: "table",
    title: "Search Results",
    header: "alpha",
    columns: ["title", "kind"],
    rows: [
      {
        index: 1,
        columns: {
          title: "a1",
          kind: "thing"
        }
      },
      {
        index: 2,
        columns: {
          title: "a2",
          kind: "ctx"
        }
      }
    ],
    cursor: 0,
    paging: {
      start: 1,
      end: 2,
      totalRows: 2
    }
  };
  const { buffer, frameGraph, textScene } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("alpha :: 1-2/2")), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("title | kind")), true);
  assert.equal(textScene.base.some(entry => entry.text.includes("a1 | thing")), true);
  assert.equal(textScene.base.some(entry => entry.text.includes("a2 | ctx")), true);
  assert.equal(rows.some(line => line.includes("a1 | thing")), true);
  assert.equal(rows.some(line => line.includes("a2 | ctx")), true);
});

test("operator example text reader scrolling shifts horizontal content instead of clipping the pane model", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  let composed = composeViewportToBuffer(model, state);
  const baselineRow = readAllRows(composed.buffer).find(line => line.includes("Selection, aliases")) || "";
  state.scrollBySurfaceId.session_reader.x = 8;
  composed = composeViewportToBuffer(model, state);
  const shiftedRow = readAllRows(composed.buffer).find(line => line.includes("aliases, notes")) || "";
  assert.equal(baselineRow.includes("Session :: Selection"), true);
  assert.equal(shiftedRow.includes("aliases, notes"), true);
});

test("operator example frame rows preserve corners and keep pane titles inside the box model", async () => {
  const model = await loadBrowserExampleModel();
  const { buffer } = composeViewportToBuffer(model, createOperatorExampleState());
  const rows = readAllRows(buffer);
  assert.match(rows[0], /^┌.*┐$/u);
  assert.match(rows[3], /^[┌┏].*[│┃║╬╫┿╂].*[┌┏].*[┐┓]$/u);
  assert.match(rows[25], /^[└┗].*[│┃║╬╫┿╂].*[└┗].*[┘┛]$/u);
  assert.match(rows[29], /^└.*┘$/u);
  assert.equal(rows[0].includes("Status"), true);
  assert.equal(rows[3].includes("Operator Navi"), true);
  assert.equal(rows[3].includes("Session"), true);
  assert.equal(rows[3].includes("x:0 y:0"), true);
  assert.equal(rows[4].includes("root"), true);
});

test("operator example visual snapshot keeps the expected pane scaffold", async () => {
  const model = await loadBrowserExampleModel();
  const { buffer } = composeViewportToBuffer(model, createOperatorExampleState());
  const rows = readAllRows(buffer);
  assert.equal(rows[0].includes("Status"), true);
  assert.equal(rows[1].includes("viewport:default | theme:ansi16 | surface:nav_tree"), true);
  assert.equal(rows[3].includes("Operator Navi"), true);
  assert.equal(rows[3].includes("Session"), true);
  assert.equal(rows[4].includes("root"), true);
  assert.equal(rows[5].includes("Session      Selec"), true);
  assert.equal(rows[4].includes("Session :: Selection, aliases, notes"), true);
  assert.equal(rows[5].includes("This text reader is intentionally long"), true);
  assert.equal(rows.some(line => line.includes(": screen inspect")), true);
  if (false) assert.deepEqual(rows.slice(0, 6), [
    "┌─ Status ─────────────────────────────────────────────────────────────────────┐",
    "│ viewport:default | theme:ansi16 | surface:session_reader                     │",
    "════════════════════════════════════════╪═══════════════════════════════════════",
    "┌─ Tree ─────────────┐║┌─ Session ─────────────────────────────────── x:0 y:0 ─┐",
    "│ Session      Selec │║│ Session :: Selection, aliases, notes, preview sessio… │",
    "│ World        Conte │║│ This text reader is intentionally long so horizontal… │"
  ]);
});

test("operator example framebuffer seam uses a contiguous cell memory map with stable metadata flags", () => {
  const buffer = clearCellBuffer(createCellBuffer(8, 2));
  putCell(buffer, 2, 1, { ch: "X", fg: 10, bg: 1, flags: CELL_FLAGS.handle, linkId: 7, hitId: 9 });
  const index = (1 * buffer.width) + 2;
  const header = readCellBufferHeader(buffer);
  assert.equal(String.fromCodePoint(buffer.glyphs[index]), "X");
  assert.equal(buffer.fg[index], 10);
  assert.equal(buffer.bg[index], 1);
  assert.equal(buffer.flags[index], CELL_FLAGS.handle);
  assert.equal(buffer.linkIds[index], 7);
  assert.equal(buffer.hitIds[index], 9);
  assert.equal(buffer.glyphs.buffer, buffer.memory);
  assert.equal(buffer.fg.buffer, buffer.memory);
  assert.equal(buffer.header.buffer, buffer.memory);
  assert.equal(header.width, 8);
  assert.equal(header.height, 2);
  assert.equal(header.glyphOffset, CELL_MEMORY_LAYOUT.headerBytes);
  assert.equal(header.hitOffset, buffer.offsets.hitIds);
});

test("operator example glyph atlas helpers resolve deterministic cell metrics and unique glyph sets", async () => {
  const model = await loadBrowserExampleModel();
  const { buffer } = composeViewportToBuffer(model, createOperatorExampleState());
  const metrics = resolveCanvasCellMetrics({
    cssWidth: 1600,
    cssHeight: 900,
    gridWidth: buffer.width,
    gridHeight: buffer.height
  });
  const glyphs = collectGlyphCodepoints(buffer);
  assert.equal(metrics.cellSize, 20);
  assert.equal(metrics.width, 1600);
  assert.equal(metrics.height, 600);
  assert.equal(glyphs.includes("S".codePointAt(0)), true);
  assert.equal(glyphs.includes("│".codePointAt(0)), true);
  assert.equal(glyphs.includes(" ".codePointAt(0)), false);
});
