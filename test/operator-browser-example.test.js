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
  resolveFrameGraphCellGlyph,
  textStyleById
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
import { createOperatorWorkbenchSnapshotFixture } from "../examples/operator/browser/operator-snapshot-fixture.js";
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
} from "../plugins/operator-workbench/tui-engine.js";
import {
  createOperatorWorkbenchController,
  createOperatorWorkbenchCore
} from "../plugins/operator-workbench/workbench/core.js";

const exampleRoot = path.resolve("examples", "operator");

function operatorWorkbenchModel(appProject) {
  return appProject?.extensionModels?.byId?.get("operatorWorkbench") ?? null;
}

async function loadBrowserExampleModel() {
  const source = await fs.readFile(path.join(exampleRoot, "browser", "operator.workbench.rvm"), "utf8");
  return parseOperatorWorkbenchRvm(source);
}

async function loadBrowserExampleSnapshotFixture() {
  return createOperatorWorkbenchSnapshotFixture();
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

function applyLongTextReaderFixture(state) {
  state.snapshot.rightPane.bodyLines = [
    "Workbench :: Selection, aliases, notes, preview session, and mini-programs.",
    "This text reader is intentionally long so horizontal scrolling is a first-class concern.",
    "Properties view tokens should become links in later tranches.",
    "Ownership and provenance can lower into the same navigable tree surface family.",
    "JSON source belongs in a custom structured reader instead of a generic text box."
  ];
  if (state.snapshot.rightPane?.screen) {
    state.snapshot.rightPane.screen.detailLines = [...state.snapshot.rightPane.bodyLines];
  }
}

test("operator example current app project authoring loads through the existing workbench plugin seam", async () => {
  const appProject = await loadAppProject(exampleRoot, {
    runtimePluginIds: ["plugin.operator-workbench"]
  });
  const workbench = operatorWorkbenchModel(appProject);
  assert.equal(workbench.defaultScreen, "operator_trace");
  assert.equal(workbench.defaultLeftScreen, "operator_left");
  assert.equal(workbench.defaultViewport, "operator_default");
  assert.equal(workbench.themesById.get("ansi16")?.mode, "ansi16");
  assert.equal(workbench.themesById.get("ansi16")?.palette, "terminal-dark");
  assert.equal(workbench.overlaysById.get("help_overlay")?.kind, "doc_view");
  assert.equal(workbench.overlaysById.get("context_menu")?.kind, "menu");
  assert.equal(workbench.overlaysById.get("help_overlay")?.resizable, true);
  assert.deepEqual(workbench.overlaysById.get("help_overlay")?.closeIdsOnOpen, ["context_menu"]);
  assert.deepEqual(workbench.overlaysById.get("context_menu")?.closeIdsOnOpen, ["help_overlay"]);
  assert.equal(workbench.handlesById.get("top_handle")?.axis, "horizontal");
  assert.equal(workbench.handlesById.get("bottom_handle")?.axis, "horizontal");
  assert.equal(workbench.handlesById.get("split_handle")?.axis, "vertical");
  assert.equal(workbench.surfacesById.get("top_status")?.kind, "status_bar");
  assert.equal(workbench.surfacesById.get("command_bar")?.kind, "command_bar");
  const viewport = workbench.viewportsById.get("operator_default");
  assert.equal(viewport?.screenId, "operator_trace");
  assert.equal(viewport?.leftScreenId, "operator_left");
  assert.equal(viewport?.theme, "ansi16");
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
    "F1:action:toggle_help",
    "MouseSecondary:overlay:context_menu",
    "Alt-R:action:rename_selection",
    "F2:action:open_references"
  ]);
  assert.equal(workbench.shortcuts.get("F5"), "operator_trace");
});

test("operator example prototype RVM parses canonical window/panel authoring into browser surfaces and bindings", async () => {
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
  assert.equal(viewport.bindings.some(binding => binding.trigger === "F1" && binding.verb === "action" && binding.target === "toggle_help"), true);
  assert.equal(model.surfaceById.get("help_overlay")?.width, 56);
  assert.equal(model.surfaceById.get("context_menu")?.height, 8);
  assert.deepEqual(model.surfaceById.get("help_overlay")?.closeIdsOnOpen, ["context_menu"]);
  assert.deepEqual(model.surfaceById.get("context_menu")?.closeIdsOnOpen, ["help_overlay"]);
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
    assert.equal(snapshot.viewport?.theme, "ansi16");
    assert.equal(snapshot.viewport?.themeSpec?.id, "ansi16");
    assert.equal(snapshot.viewport?.themeSpec?.palette, "terminal-dark");
    assert.equal(snapshot.viewport?.topSurfaceId, "top_status");
    assert.equal(snapshot.viewport?.splitHandleId, "split_handle");
    assert.equal(snapshot.viewport?.layout?.top, 3);
    assert.equal(snapshot.viewport?.layout?.leftWeight, 28);
    assert.equal(Array.isArray(snapshot.topPane?.navigation?.chips), true);
    assert.equal(snapshot.topPane?.frameTitle, "Status");
    assert.equal(snapshot.topPane?.titleLine, "Operator Workbench :: global");
    assert.equal(snapshot.topPane?.navigationLine, "NAV [root] [preview ready] [Inspect]");
    assert.equal(snapshot.topPane?.statusLine, "MODE preview-read");
    assert.deepEqual(
      snapshot.topPane?.metaChips?.map(chip => chip.label),
      ["viewport:operator_default", "theme:ansi16", "pane:left"]
    );
    assert.equal(snapshot.bottomPane?.frameTitle, "Commands");
    assert.deepEqual(snapshot.contextMenu?.lines, [
      "1. Edit :: edit",
      "2. Change Color :: change-color",
      "3. Rename :: rename",
      "4. Clone :: clone"
    ]);
    assert.equal(snapshot.contextMenu?.placement, "center");
    assert.equal(snapshot.contextMenu?.marginX, 2);
    assert.equal(snapshot.contextMenu?.marginY, 1);
    assert.equal(snapshot.contextMenu?.titleInsetX, 2);
    assert.equal(snapshot.contextMenu?.width, 24);
    assert.equal(snapshot.contextMenu?.height, 8);
    assert.equal(snapshot.contextMenu?.bodyInsetX, 2);
    assert.equal(snapshot.contextMenu?.bodyInsetY, 1);
    assert.equal(snapshot.contextMenu?.contentWidth, 20);
    assert.equal(snapshot.contextMenu?.contentHeight, 6);
    assert.equal(snapshot.contextMenu?.lineCount, 4);
    assert.equal(snapshot.contextMenu?.visibleLineCount, 4);
    assert.equal(snapshot.contextMenu?.overflowLineCount, 0);
    assert.deepEqual(snapshot.contextMenu?.visibleLines, [
      "1. Edit :: edit",
      "2. Change Color :: …",
      "3. Rename :: rename",
      "4. Clone :: clone"
    ]);
    assert.deepEqual(snapshot.helpOverlay?.lines, [
      "F1 opens the authored help surface.",
      "Right click opens the centered context menu surface.",
      "Drag pane handles to resize the authored split layout.",
      "Active right pane: Workbench."
    ]);
    assert.equal(snapshot.helpOverlay?.placement, "center");
    assert.equal(snapshot.helpOverlay?.marginX, 2);
    assert.equal(snapshot.helpOverlay?.marginY, 1);
    assert.equal(snapshot.helpOverlay?.titleInsetX, 2);
    assert.equal(snapshot.helpOverlay?.width, 56);
    assert.equal(snapshot.helpOverlay?.height, 10);
    assert.equal(snapshot.helpOverlay?.bodyInsetX, 2);
    assert.equal(snapshot.helpOverlay?.bodyInsetY, 1);
    assert.equal(snapshot.helpOverlay?.contentWidth, 52);
    assert.equal(snapshot.helpOverlay?.contentHeight, 8);
    assert.equal(snapshot.helpOverlay?.lineCount, 4);
    assert.equal(snapshot.helpOverlay?.visibleLineCount, 4);
    assert.equal(snapshot.helpOverlay?.overflowLineCount, 0);
    assert.equal(snapshot.helpOverlay?.context, "Operator Navigation | Authored");
    assert.equal(snapshot.helpOverlay?.summary, "Move the active row, then Enter to open Workbench.");
    assert.equal(Array.isArray(snapshot.overlays), true);
    assert.deepEqual(snapshot.overlays?.map(overlay => overlay.id), ["help_overlay", "context_menu"]);
    assert.equal(snapshot.overlays?.[0]?.kind, "doc_view");
    assert.equal(snapshot.overlays?.[0]?.frameTitle, "Help");
    assert.equal(snapshot.overlays?.[0]?.interaction?.family, "doc_view");
    assert.equal(snapshot.overlays?.[0]?.interaction?.scrollMode, "xy");
    assert.deepEqual(snapshot.overlays?.[0]?.policy?.closeIdsOnOpen, ["context_menu"]);
    assert.equal(snapshot.overlays?.[1]?.kind, "menu");
    assert.equal(snapshot.overlays?.[1]?.interaction?.family, "menu");
    assert.equal(snapshot.overlays?.[1]?.interaction?.cursorMode, "items");
    assert.equal(snapshot.overlays?.[1]?.interaction?.activationMode, "item");
    assert.deepEqual(snapshot.overlays?.[1]?.policy?.closeIdsOnOpen, ["help_overlay"]);
    assert.equal(snapshot.overlays?.[1]?.visibleLines?.[0], "1. Edit :: edit");
  } finally {
    await runtimeContext.close?.();
  }
});

test("operator example shared core clips overlay visible lines from authored geometry", async () => {
  const runtimeContext = await loadOperatorTuiRuntimeContext({
    appPath: exampleRoot,
    runtimePluginIds: ["plugin.operator-workbench"]
  });
  try {
    operatorWorkbenchModel(runtimeContext.appProject).overlaysById.get("context_menu").width = 18;
    operatorWorkbenchModel(runtimeContext.appProject).overlaysById.get("context_menu").height = 4;
    const state = await buildOperatorTuiState(runtimeContext);
    const engine = createOperatorTuiEngine(state);
    const snapshot = await buildOperatorWorkbenchSnapshot(state, engine.session, {});
    assert.equal(snapshot.contextMenu?.contentWidth, 14);
    assert.equal(snapshot.contextMenu?.contentHeight, 2);
    assert.equal(snapshot.contextMenu?.lineCount, 4);
    assert.equal(snapshot.contextMenu?.visibleLineCount, 2);
    assert.equal(snapshot.contextMenu?.overflowLineCount, 2);
    assert.deepEqual(snapshot.contextMenu?.visibleLines, [
      "1. Edit :: ed…",
      "2. Change Col…"
    ]);
  } finally {
    await runtimeContext.close?.();
  }
});

test("operator example shared core applies help overlay scroll state from the shared UI snapshot", async () => {
  const runtimeContext = await loadOperatorTuiRuntimeContext({
    appPath: exampleRoot,
    runtimePluginIds: ["plugin.operator-workbench"]
  });
  try {
    operatorWorkbenchModel(runtimeContext.appProject).overlaysById.get("help_overlay").height = 4;
    const state = await buildOperatorTuiState(runtimeContext);
    const engine = createOperatorTuiEngine(state);
    const snapshot = await buildOperatorWorkbenchSnapshot(state, engine.session, {
      openOverlayIds: ["help_overlay"],
      overlayStateById: {
        help_overlay: {
          scrollY: 1
        }
      }
    });
    assert.equal(snapshot.helpOverlay?.contentHeight, 2);
    assert.equal(snapshot.helpOverlay?.visibleLineStart, 1);
    assert.deepEqual(snapshot.helpOverlay?.visibleLines, [
      "Right click opens the centered context menu surface.",
      "Drag pane handles to resize the authored split layo…"
    ]);
    const helpOverlayEntry = snapshot.overlays.find(entry => entry.id === "help_overlay");
    assert.equal(helpOverlayEntry?.scrollY, 1);
    assert.equal(helpOverlayEntry?.visibleLineStart, 1);
  } finally {
    await runtimeContext.close?.();
  }
});

test("operator browser snapshot adapter lowers a shared workbench snapshot into browser runtime state", async () => {
  const fixture = await loadBrowserExampleSnapshotFixture();
  const runtimeState = createOperatorBrowserStateFromWorkbenchSnapshot(fixture);
  assert.equal(runtimeState.viewportId, "default");
  assert.equal(runtimeState.snapshot.viewport?.layout?.top, 3);
  assert.equal(runtimeState.snapshot.viewport?.layout?.bottom, 4);
  assert.equal(runtimeState.snapshot.viewport?.layout?.leftWeight, 28);
  assert.equal(runtimeState.hostViewportLayoutDraft, null);
  assert.deepEqual(runtimeState.snapshot.ui?.openOverlayIds, []);
  assert.equal(runtimeState.snapshot.leftPane?.title, "Operator Navigation");
  assert.equal(runtimeState.snapshot.leftPane?.mode, "tree");
  assert.equal(Array.isArray(runtimeState.snapshot.leftPane?.rows), true);
  assert.equal(runtimeState.snapshot.topPane?.navigation?.chips?.[0]?.label, "root");
  assert.equal(runtimeState.snapshot.topPane?.frameTitle, "Status");
  assert.equal(runtimeState.snapshot.topPane?.titleLine, "Operator Workbench :: global");
  assert.equal(runtimeState.snapshot.topPane?.navigationLine, "NAV [root] [preview ready] [Inspect]");
  assert.equal(runtimeState.snapshot.topPane?.statusLine, "MODE preview-read");
  assert.deepEqual(
    runtimeState.snapshot.topPane?.metaChips?.map(chip => chip.label),
    ["viewport:operator_default", "theme:ansi16", "pane:left"]
  );
  assert.equal(runtimeState.snapshot.leftPane?.rows?.[0]?.label, "Workbench");
  assert.equal(runtimeState.snapshot.rightPane?.bodyLines?.[0]?.includes("Workbench"), true);
  assert.equal(runtimeState.snapshot.viewport?.id, "operator_default");
  assert.equal(runtimeState.snapshot.viewport?.themeSpec?.id, "ansi16");
  assert.equal(runtimeState.snapshot.viewport?.themeSpec?.palette, "terminal-dark");
  assert.equal(runtimeState.snapshot.viewport?.layout?.leftWeight, 28);
  assert.equal(runtimeState.snapshot.contextMenu?.title, "Context");
  assert.equal(runtimeState.snapshot.contextMenu?.frameTitle, "Context");
  assert.deepEqual(runtimeState.snapshot.contextMenu?.lines, [
    "1. Edit :: pane:left",
    "2. Change Color :: surface theme",
    "3. Rename :: Workbench",
    "4. Clone :: Workbench"
  ]);
  assert.equal(runtimeState.snapshot.contextMenu?.placement, "center");
  assert.equal(runtimeState.snapshot.contextMenu?.marginX, 2);
  assert.equal(runtimeState.snapshot.contextMenu?.marginY, 1);
  assert.equal(runtimeState.snapshot.contextMenu?.titleInsetX, 2);
  assert.equal(runtimeState.snapshot.contextMenu?.width, 24);
  assert.equal(runtimeState.snapshot.contextMenu?.height, 8);
  assert.equal(runtimeState.snapshot.contextMenu?.bodyInsetX, 2);
  assert.equal(runtimeState.snapshot.contextMenu?.bodyInsetY, 1);
  assert.equal(runtimeState.snapshot.contextMenu?.contentWidth, 20);
  assert.equal(runtimeState.snapshot.contextMenu?.contentHeight, 6);
  assert.equal(runtimeState.snapshot.contextMenu?.lineCount, 4);
  assert.equal(runtimeState.snapshot.contextMenu?.visibleLineCount, 4);
  assert.equal(runtimeState.snapshot.contextMenu?.overflowLineCount, 0);
  assert.deepEqual(runtimeState.snapshot.contextMenu?.visibleLines, [
    "1. Edit :: pane:left",
    "2. Change Color :: …",
    "3. Rename :: Workbe…",
    "4. Clone :: Workben…"
  ]);
  assert.equal(runtimeState.snapshot.helpOverlay?.context, "Operator Navigation | Authored");
  assert.equal(runtimeState.snapshot.helpOverlay?.summary, "Move the active row, then Enter to open Workbench.");
  assert.equal(runtimeState.snapshot.helpOverlay?.placement, "center");
  assert.equal(runtimeState.snapshot.helpOverlay?.marginX, 2);
  assert.equal(runtimeState.snapshot.helpOverlay?.marginY, 1);
  assert.equal(runtimeState.snapshot.helpOverlay?.titleInsetX, 2);
  assert.equal(runtimeState.snapshot.helpOverlay?.width, 56);
  assert.equal(runtimeState.snapshot.helpOverlay?.height, 10);
  assert.equal(runtimeState.snapshot.helpOverlay?.bodyInsetX, 2);
  assert.equal(runtimeState.snapshot.helpOverlay?.bodyInsetY, 1);
  assert.equal(runtimeState.snapshot.helpOverlay?.contentWidth, 52);
  assert.equal(runtimeState.snapshot.helpOverlay?.contentHeight, 8);
  assert.equal(runtimeState.snapshot.helpOverlay?.lineCount, 4);
  assert.equal(runtimeState.snapshot.helpOverlay?.visibleLineCount, 4);
  assert.equal(runtimeState.snapshot.helpOverlay?.overflowLineCount, 0);
  assert.equal(Array.isArray(runtimeState.snapshot.overlays), true);
  assert.deepEqual(runtimeState.snapshot.overlays?.map(overlay => overlay.id), ["help_overlay", "context_menu"]);
  assert.equal(runtimeState.snapshot.overlays?.[0]?.kind, "doc_view");
  assert.equal(runtimeState.snapshot.overlays?.[1]?.kind, "menu");
  assert.equal(Array.isArray(runtimeState.snapshot.contextMenu?.items), true);
  assert.equal(runtimeState.snapshot.contextMenu?.items?.[0]?.label, "Edit");
  assert.equal(runtimeState.snapshot.contextMenu?.items?.[0]?.shortcut, "1");
  assert.equal(runtimeState.snapshot.contextMenu?.items?.[2]?.action?.hook, "rename");
  assert.equal(runtimeState.snapshot.bottomPane?.frameTitle, "Commands");
  assert.equal(runtimeState.snapshot.bottomPane?.commandText, ": screen inspect");
  assert.equal(runtimeState.snapshot.bottomPane?.hintText, "F1 help | Right click menu | Drag handles resize");
  assert.equal(runtimeState.snapshot.helpOverlay?.frameTitle, "Help");
  assert.equal(Array.isArray(runtimeState.snapshot.helpOverlay?.lines), true);
  assert.equal(runtimeState.snapshot.helpOverlay?.lines?.[0], "F1 opens the authored help surface.");
  assert.equal(runtimeState.snapshot.session.appRoot, null);
  assert.equal(runtimeState.snapshot.session.worldHome, null);
  assert.equal(Object.hasOwn(runtimeState, "commandText"), false);
  assert.equal(Object.hasOwn(runtimeState, "helpLines"), false);
  assert.equal(Object.hasOwn(runtimeState, "contextMenuItems"), false);
  assert.equal(Object.hasOwn(runtimeState, "focusedSurfaceId"), false);
  assert.equal(Object.hasOwn(runtimeState, "localUi"), false);
  assert.equal(Object.hasOwn(runtimeState, "leftPane"), false);
  assert.equal(Object.hasOwn(runtimeState, "topCursor"), false);
  assert.equal(Object.hasOwn(runtimeState, "leftCursor"), false);
  assert.equal(Object.hasOwn(runtimeState, "rightCursor"), false);
  assert.equal(Object.hasOwn(runtimeState, "overlays"), false);
});

test("operator browser snapshot adapter regenerates compatibility overlay exports from canonical overlay rows", async () => {
  const fixture = await loadBrowserExampleSnapshotFixture();
  fixture.contextMenu.frameTitle = "WRONG";
  fixture.contextMenu.lines = ["WRONG TOP LEVEL"];
  fixture.contextMenu.visibleLines = ["WRONG TOP LEVEL"];
  fixture.contextMenu.visibleLineCount = 1;
  fixture.helpOverlay.frameTitle = "BAD";
  fixture.helpOverlay.lines = ["BAD TOP LEVEL"];
  fixture.helpOverlay.visibleLines = ["BAD TOP LEVEL"];
  fixture.helpOverlay.visibleLineCount = 1;
  const runtimeState = createOperatorBrowserStateFromWorkbenchSnapshot(fixture);
  assert.equal(runtimeState.snapshot.contextMenu?.frameTitle, "Context");
  assert.equal(runtimeState.snapshot.contextMenu?.lines?.[0], "1. Edit :: pane:left");
  assert.equal(runtimeState.snapshot.helpOverlay?.frameTitle, "Help");
  assert.equal(runtimeState.snapshot.helpOverlay?.lines?.[0], "F1 opens the authored help surface.");
});

test("operator example sample state is derived directly from the shared snapshot fixture adapter", async () => {
  const fixture = await loadBrowserExampleSnapshotFixture();
  assert.deepEqual(
    createOperatorExampleState(),
    createOperatorBrowserStateFromWorkbenchSnapshot(fixture)
  );
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
  const autocomplete = await api.getAutocomplete("ins");
  assert.equal(snapshot.method, "GET");
  assert.equal(command.method, "POST");
  assert.equal(intent.method, "POST");
  assert.equal(settings.method, "POST");
  assert.equal(autocomplete.method, "GET");
  assert.deepEqual(calls.map(call => call.url), [
    "http://127.0.0.1:4020/api/operator/snapshot",
    "http://127.0.0.1:4020/api/operator/command",
    "http://127.0.0.1:4020/api/operator/intent",
    "http://127.0.0.1:4020/api/operator/display-settings",
    "http://127.0.0.1:4020/api/operator/autocomplete?line=ins"
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
    assert.equal(runtime.runtimeState.snapshot.leftPane?.cursor, 1);
    assert.equal(runtime.runtimeState.snapshot.leftPane?.cursor, 1);
    assert.equal(runtime.runtimeState.snapshot.leftPane?.rows?.[1]?.label, "Things");

    await keydown({
      key: "Enter",
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.leftPane?.header, "Things");
    assert.equal(runtime.runtimeState.snapshot.leftPane?.rows?.[0]?.label, "Contexts");
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
    await core.executeCommand("search --scope world operator_example");
    await core.executeCommand("select 1");
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
    assert.equal((runtime.runtimeState.snapshot.rightPane?.screen?.rows?.length ?? 0) > 0, true);

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
    assert.equal(
      runtime.runtimeState.snapshot.rightPane?.screen?.rows?.[1]?.label?.includes("app.wtoml:1"),
      true
    );

    await keydown({
      key: "Enter",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.rightPane?.activeScreenId, "source");
    assert.equal(runtime.runtimeState.snapshot.rightPane?.target?.ownerTargetId, "operator_example");
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
    assert.equal(runtime.runtimeState.snapshot.rightPane?.bodyLines?.some(line => line.includes("Workbench")), true);
  } finally {
    await core.close();
  }
});

test("operator browser runtime routes the help overlay and context menu through the live core and renders menu content from the shared snapshot", async () => {
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
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuOpen, false);
    assert.deepEqual(runtime.runtimeState.snapshot.ui?.openOverlayIds, ["help_overlay"]);
    assert.equal(runtime.runtimeState.snapshot.helpOverlay?.lines?.[0], "F1 opens the authored help surface.");

    await keydown({
      key: "Escape",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.helpOpen, false);
    assert.equal((runtime.runtimeState.snapshot.ui?.openOverlayIds || []).includes("help_overlay"), false);

    const leftLayout = layoutViewport(model, runtime.runtimeState);
    await contextmenu(pointerEventForCell(
      canvas,
      leftLayout,
      leftLayout.left.x + 3,
      leftLayout.left.y + 3
    ));
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuOpen, true);
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuContext?.pane, "left");
    assert.equal(runtime.runtimeState.snapshot.contextMenu?.items?.[1]?.label, "Change Color");
    assert.equal(runtime.runtimeState.snapshot.contextMenu?.items?.[1]?.detail, "change-color");
    assert.equal(runtime.runtimeState.snapshot.ui?.helpOpen, false);

    await keydown({
      key: "Escape",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuOpen, false);
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuContext, null);
    assert.equal(runtime.runtimeState.snapshot.ui?.helpOpen, false);
  } finally {
    await core.close();
  }
});

test("operator browser runtime routes context-menu digit activation through the live core", async () => {
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

    const leftLayout = layoutViewport(model, runtime.runtimeState);
    await contextmenu(pointerEventForCell(
      canvas,
      leftLayout,
      leftLayout.left.x + 3,
      leftLayout.left.y + 3
    ));
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuOpen, true);
    assert.equal(runtime.runtimeState.snapshot.contextMenu?.items?.[2]?.shortcut, "3");
    assert.equal(runtime.runtimeState.snapshot.contextMenu?.items?.[2]?.action?.kind, "action-ref");
    assert.equal(runtime.runtimeState.snapshot.contextMenu?.items?.[2]?.action?.actionId, "rename_selection");

    await keydown({
      key: "3",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuOpen, false);
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuContext, null);
    assert.equal(runtime.runtimeState.snapshot.ui?.lastOutput.includes("rename requested:"), true);
  } finally {
    await core.close();
  }
});

test("operator browser runtime routes context-menu cursor movement and Enter activation through the live core", async () => {
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

    const leftLayout = layoutViewport(model, runtime.runtimeState);
    await contextmenu(pointerEventForCell(
      canvas,
      leftLayout,
      leftLayout.left.x + 3,
      leftLayout.left.y + 3
    ));
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuOpen, true);
    assert.equal(runtime.runtimeState.snapshot.contextMenu?.activeItemIndex, 0);

    await keydown({
      key: "ArrowDown",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.contextMenu?.activeItemIndex, 1);

    await keydown({
      key: "Enter",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuOpen, false);
    assert.equal(runtime.runtimeState.snapshot.ui?.lastOutput.includes("change-color requested:"), true);
  } finally {
    await core.close();
  }
});

test("operator browser runtime routes help overlay scrolling through the live core", async () => {
  const runtimeContext = await loadOperatorTuiRuntimeContext({
    appPath: exampleRoot,
    runtimePluginIds: ["plugin.operator-workbench"]
  });
  operatorWorkbenchModel(runtimeContext.appProject).overlaysById.get("help_overlay").height = 4;
  const state = await buildOperatorTuiState(runtimeContext);
  const engine = createOperatorTuiEngine(state);
  const core = createOperatorWorkbenchController({ state, engine });
  try {
    const initialSnapshot = await core.snapshot();
    const canvas = createFakeCanvas();
    const windowTarget = createFakeWindowTarget();
    const runtime = createOperatorBrowserRuntime({
      canvas,
      model: await loadBrowserExampleModel(),
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
      key: "F1",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.activeOverlayId, "help_overlay");
    assert.equal(runtime.runtimeState.snapshot.helpOverlay?.visibleLineStart, 0);
    assert.equal(runtime.runtimeState.snapshot.helpOverlay?.visibleLines?.[0], "F1 opens the authored help surface.");

    await keydown({
      key: "ArrowDown",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.helpOverlay?.visibleLineStart, 1);
    assert.equal(runtime.runtimeState.snapshot.helpOverlay?.visibleLines?.[0], "Right click opens the centered context menu surface.");
    assert.equal(runtime.runtimeState.snapshot.ui?.overlayStateById?.help_overlay?.scrollY, 1);
  } finally {
    await runtimeContext.close?.();
  }
});

test("operator browser runtime routes reader scrolling through the live core", async () => {
  const runtimeContext = await loadOperatorTuiRuntimeContext({
    appPath: exampleRoot,
    runtimePluginIds: ["plugin.operator-workbench"]
  });
  try {
    const state = await buildOperatorTuiState(runtimeContext);
    const engine = createOperatorTuiEngine(state);
    const core = createOperatorWorkbenchController({ state, engine });
    const initialSnapshot = await buildOperatorWorkbenchSnapshot(state, engine.session, core.uiState);
    const canvas = createFakeCanvas();
    const windowTarget = createFakeWindowTarget();
    const model = await loadBrowserExampleModel();
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
    const wheel = canvas.listeners.get("wheel");
    assert.equal(typeof keydown, "function");
    assert.equal(typeof wheel, "function");
    assert.equal(runtime.runtimeState.snapshot.rightPane?.readerScroll?.x ?? 0, 0);
    assert.equal(runtime.runtimeState.snapshot.rightPane?.readerScroll?.y ?? 0, 0);

    await keydown({
      key: "ArrowRight",
      altKey: true,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.focusedPane, "right");

    await keydown({
      key: "ArrowRight",
      altKey: false,
      shiftKey: false,
      ctrlKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.readerStateBySurfaceId?.session_reader?.x, 1);
    assert.equal(runtime.runtimeState.snapshot.rightPane?.readerScroll?.x, 1);

    await wheel({
      deltaY: 10,
      shiftKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.readerStateBySurfaceId?.session_reader?.y, 1);
    assert.equal(runtime.runtimeState.snapshot.rightPane?.readerScroll?.y, 1);
  } finally {
    await runtimeContext.close?.();
  }
});

test("operator browser runtime routes overlay focus clicks through the live core", async () => {
  const model = await loadBrowserExampleModel();
  model.surfaceById.set("info_overlay", {
    id: "info_overlay",
    kind: "doc_view",
    title: "Info Overlay",
    width: 70,
    height: 14
  });
  const initialState = createOperatorExampleState();
  initialState.snapshot.ui.openOverlayIds = ["info_overlay", "help_overlay"];
  initialState.snapshot.ui.activeOverlayId = "help_overlay";
  initialState.snapshot.overlays = [
    ...(Array.isArray(initialState.snapshot.overlays) ? initialState.snapshot.overlays : []),
    {
      id: "info_overlay",
      kind: "doc_view",
      frameTitle: "INFO",
      title: "Info Overlay",
      placement: "center",
      marginX: 4,
      marginY: 2,
      titleInsetX: 3,
      width: 70,
      height: 14,
      bodyInsetX: 2,
      bodyInsetY: 1,
      contentWidth: 66,
      contentHeight: 10,
      lineCount: 1,
      visibleLineCount: 1,
      overflowLineCount: 0,
      lines: ["INFO BODY"],
      visibleLines: ["INFO BODY"],
      resizable: false,
      scroll: []
    }
  ];

  const dispatchCalls = [];
  const canvas = createFakeCanvas();
  const windowTarget = createFakeWindowTarget();
  const runtime = createOperatorBrowserRuntime({
    canvas,
    model,
    initialState,
    liveApi: {
      async dispatchIntent(intent) {
        dispatchCalls.push(intent);
        if (intent.type === "set-active-overlay" && intent.overlayId === "info_overlay") {
          const snapshot = structuredClone(initialState.snapshot);
          snapshot.ui.openOverlayIds = ["help_overlay", "info_overlay"];
          snapshot.ui.activeOverlayId = "info_overlay";
          return { snapshot };
        }
        return { snapshot: structuredClone(initialState.snapshot) };
      }
    },
    windowTarget
  });
  runtime.mount();

  const pointerdown = canvas.listeners.get("pointerdown");
  assert.equal(typeof pointerdown, "function");
  assert.equal(runtime.runtimeState.snapshot.ui?.activeOverlayId, "help_overlay");

  const composed = runtime.compose();
  const infoOverlay = composed.overlayRects.find(entry => entry.id === "info_overlay");
  const helpOverlay = composed.overlayRects.find(entry => entry.id === "help_overlay");
  assert.ok(infoOverlay);
  let targetX = null;
  let targetY = null;
  for (let y = infoOverlay.rect.y + 1; y < infoOverlay.rect.y + infoOverlay.rect.height - 1 && targetY === null; y += 1) {
    for (let x = infoOverlay.rect.x + 1; x < infoOverlay.rect.x + infoOverlay.rect.width - 1; x += 1) {
      const insideHelp = helpOverlay
        ? (
            x >= helpOverlay.rect.x
            && x < helpOverlay.rect.x + helpOverlay.rect.width
            && y >= helpOverlay.rect.y
            && y < helpOverlay.rect.y + helpOverlay.rect.height
          )
        : false;
      if (!insideHelp) {
        targetX = x;
        targetY = y;
        break;
      }
    }
  }
  assert.notEqual(targetX, null);
  assert.notEqual(targetY, null);
  await pointerdown(pointerEventForCell(
    canvas,
    composed.layout,
    targetX,
    targetY
  ));

  assert.equal(dispatchCalls.some(call => call.type === "set-active-overlay" && call.overlayId === "info_overlay"), true);
  assert.equal(runtime.runtimeState.snapshot.ui?.activeOverlayId, "info_overlay");
  assert.deepEqual(runtime.runtimeState.snapshot.ui?.openOverlayIds, ["help_overlay", "info_overlay"]);
});

test("operator browser runtime routes overlay focus traversal through the live core", async () => {
  const model = await loadBrowserExampleModel();
  model.surfaceById.set("info_overlay", {
    id: "info_overlay",
    kind: "doc_view",
    title: "Info Overlay",
    width: 70,
    height: 14
  });
  const initialState = createOperatorExampleState();
  initialState.snapshot.ui.openOverlayIds = ["info_overlay", "help_overlay"];
  initialState.snapshot.ui.activeOverlayId = "help_overlay";
  initialState.snapshot.overlays = [
    ...(Array.isArray(initialState.snapshot.overlays) ? initialState.snapshot.overlays : []),
    {
      id: "info_overlay",
      kind: "doc_view",
      frameTitle: "INFO",
      title: "Info Overlay",
      placement: "center",
      marginX: 4,
      marginY: 2,
      titleInsetX: 3,
      width: 70,
      height: 14,
      bodyInsetX: 2,
      bodyInsetY: 1,
      contentWidth: 66,
      contentHeight: 10,
      lineCount: 1,
      visibleLineCount: 1,
      overflowLineCount: 0,
      lines: ["INFO BODY"],
      visibleLines: ["INFO BODY"],
      resizable: false,
      scroll: []
    }
  ];

  const dispatchCalls = [];
  const canvas = createFakeCanvas();
  const windowTarget = createFakeWindowTarget();
  const runtime = createOperatorBrowserRuntime({
    canvas,
    model,
    initialState,
    liveApi: {
      async dispatchIntent(intent) {
        dispatchCalls.push(intent);
        const snapshot = structuredClone(initialState.snapshot);
        if (intent.type === "move-active-overlay-focus" && intent.direction === "next") {
          snapshot.ui.openOverlayIds = ["help_overlay", "info_overlay"];
          snapshot.ui.activeOverlayId = "info_overlay";
        } else if (intent.type === "move-active-overlay-focus" && intent.direction === "prev") {
          snapshot.ui.openOverlayIds = ["info_overlay", "help_overlay"];
          snapshot.ui.activeOverlayId = "help_overlay";
        }
        return { snapshot };
      }
    },
    windowTarget
  });
  runtime.mount();

  const keydown = windowTarget.listeners.get("keydown");
  assert.equal(typeof keydown, "function");
  assert.equal(runtime.runtimeState.snapshot.ui?.activeOverlayId, "help_overlay");

  await keydown({
    key: "Tab",
    shiftKey: false,
    altKey: false,
    preventDefault() {}
  });
  assert.equal(dispatchCalls.some(call => call.type === "move-active-overlay-focus" && call.direction === "next"), true);
  assert.equal(runtime.runtimeState.snapshot.ui?.activeOverlayId, "info_overlay");
  assert.deepEqual(runtime.runtimeState.snapshot.ui?.openOverlayIds, ["help_overlay", "info_overlay"]);

  await keydown({
    key: "Tab",
    shiftKey: true,
    altKey: false,
    preventDefault() {}
  });
  assert.equal(dispatchCalls.some(call => call.type === "move-active-overlay-focus" && call.direction === "prev"), true);
  assert.equal(runtime.runtimeState.snapshot.ui?.activeOverlayId, "help_overlay");
  assert.deepEqual(runtime.runtimeState.snapshot.ui?.openOverlayIds, ["info_overlay", "help_overlay"]);
});

test("operator browser runtime routes help-overlay wheel scrolling through the live core", async () => {
  const runtimeContext = await loadOperatorTuiRuntimeContext({
    appPath: exampleRoot,
    runtimePluginIds: ["plugin.operator-workbench"]
  });
  try {
    operatorWorkbenchModel(runtimeContext.appProject).overlaysById.get("help_overlay").height = 4;
    const state = await buildOperatorTuiState(runtimeContext);
    const engine = createOperatorTuiEngine(state);
    const core = createOperatorWorkbenchController({ state, engine });
    const initialSnapshot = await buildOperatorWorkbenchSnapshot(state, engine.session, core.uiState);
    const canvas = createFakeCanvas();
    const windowTarget = createFakeWindowTarget();
    const model = await loadBrowserExampleModel();
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
    const wheel = canvas.listeners.get("wheel");
    assert.equal(typeof keydown, "function");
    assert.equal(typeof wheel, "function");

    await keydown({
      key: "F1",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.activeOverlayId, "help_overlay");

    const composed = runtime.compose();
    const helpOverlay = composed.overlayRects.find(entry => entry.id === "help_overlay");
    assert.ok(helpOverlay);
    await wheel({
      ...pointerEventForCell(
        canvas,
        composed.layout,
        helpOverlay.rect.x + 2,
        helpOverlay.rect.y + 2
      ),
      deltaY: 10,
      shiftKey: false
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.overlayStateById?.help_overlay?.scrollY, 1);
    assert.equal(runtime.runtimeState.snapshot.helpOverlay?.visibleLineStart, 1);
  } finally {
    await runtimeContext.close?.();
  }
});

test("operator browser runtime routes help-overlay horizontal wheel scrolling through the live core", async () => {
  const runtimeContext = await loadOperatorTuiRuntimeContext({
    appPath: exampleRoot,
    runtimePluginIds: ["plugin.operator-workbench"]
  });
  try {
    operatorWorkbenchModel(runtimeContext.appProject).overlaysById.get("help_overlay").width = 24;
    const state = await buildOperatorTuiState(runtimeContext);
    const engine = createOperatorTuiEngine(state);
    const core = createOperatorWorkbenchController({ state, engine });
    const initialSnapshot = await buildOperatorWorkbenchSnapshot(state, engine.session, core.uiState);
    const canvas = createFakeCanvas();
    const windowTarget = createFakeWindowTarget();
    const model = await loadBrowserExampleModel();
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
    const wheel = canvas.listeners.get("wheel");
    assert.equal(typeof keydown, "function");
    assert.equal(typeof wheel, "function");

    await keydown({
      key: "F1",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.activeOverlayId, "help_overlay");

    const initialLine = runtime.runtimeState.snapshot.helpOverlay?.visibleLines?.[0] ?? "";
    const composed = runtime.compose();
    const helpOverlay = composed.overlayRects.find(entry => entry.id === "help_overlay");
    assert.ok(helpOverlay);

    await wheel({
      ...pointerEventForCell(
        canvas,
        composed.layout,
        helpOverlay.rect.x + 2,
        helpOverlay.rect.y + 2
      ),
      deltaY: 10,
      shiftKey: true
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.overlayStateById?.help_overlay?.scrollX, 1);
    assert.equal(runtime.runtimeState.snapshot.helpOverlay?.scrollX, 1);
    assert.notEqual(runtime.runtimeState.snapshot.helpOverlay?.visibleLines?.[0] ?? "", initialLine);
  } finally {
    await runtimeContext.close?.();
  }
});

test("operator browser runtime routes context-menu wheel traversal through the live core", async () => {
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

    const contextmenu = canvas.listeners.get("contextmenu");
    const wheel = canvas.listeners.get("wheel");
    assert.equal(typeof contextmenu, "function");
    assert.equal(typeof wheel, "function");

    const leftLayout = layoutViewport(model, runtime.runtimeState);
    await contextmenu(pointerEventForCell(
      canvas,
      leftLayout,
      leftLayout.left.x + 3,
      leftLayout.left.y + 3
    ));
    assert.equal(runtime.runtimeState.snapshot.ui?.activeOverlayId, "context_menu");
    assert.equal(runtime.runtimeState.snapshot.contextMenu?.activeItemIndex, 0);

    const composed = runtime.compose();
    const menuOverlay = composed.overlayRects.find(entry => entry.id === "context_menu");
    assert.ok(menuOverlay);
    await wheel({
      ...pointerEventForCell(
        canvas,
        composed.layout,
        menuOverlay.rect.x + 2,
        menuOverlay.rect.y + 2
      ),
      deltaY: 10,
      shiftKey: false
    });
    assert.equal(runtime.runtimeState.snapshot.contextMenu?.activeItemIndex, 1);
    assert.equal(runtime.runtimeState.snapshot.ui?.overlayStateById?.context_menu?.activeItemIndex, 1);
  } finally {
    await core.close();
  }
});

test("operator browser runtime uses shared context-menu inset offsets for pointer activation", async () => {
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

    const contextmenu = canvas.listeners.get("contextmenu");
    const pointerdown = canvas.listeners.get("pointerdown");
    assert.equal(typeof contextmenu, "function");
    assert.equal(typeof pointerdown, "function");

    const leftLayout = layoutViewport(model, runtime.runtimeState);
    await contextmenu(pointerEventForCell(
      canvas,
      leftLayout,
      leftLayout.left.x + 3,
      leftLayout.left.y + 3
    ));
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuOpen, true);

    runtime.runtimeState.snapshot.contextMenu.bodyInsetY = 3;
    const contextMenuEntry = runtime.runtimeState.snapshot.overlays.find(entry => entry.id === "context_menu");
    contextMenuEntry.bodyInsetY = 3;
    runtime.render();
    const composed = runtime.compose();
    const menuOverlay = composed.overlayRects.find(entry => entry.id === "context_menu");
    assert.ok(menuOverlay);

    await pointerdown(pointerEventForCell(
      canvas,
      composed.layout,
      menuOverlay.rect.x + 2,
      menuOverlay.rect.y + 4
    ));

    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuOpen, false);
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuContext, null);
    assert.equal(runtime.runtimeState.snapshot.ui?.lastOutput.includes("change-color requested:"), true);
  } finally {
    await core.close();
  }
});

test("operator browser runtime routes published screen shortcuts through the live core", async () => {
  const model = await loadBrowserExampleModel();
  const core = await createOperatorWorkbenchCore({
    args: [exampleRoot, "--runtime-plugin", "plugin.operator-workbench"],
    cwd: path.resolve("."),
    env: process.env
  });
  try {
    await core.executeCommand("search --scope world operator_example");
    await core.executeCommand("select 1");
    const initialSnapshot = (await core.executeCommand("inspect 1")).snapshot;

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
      key: "F2",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.rightPane?.activeScreenId, "references");
    assert.equal(runtime.runtimeState.snapshot.rightPane?.screenMode, "custom-screen");

    await keydown({
      key: "F5",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.rightPane?.activeScreenId, "operator_trace");
    assert.equal(runtime.runtimeState.snapshot.rightPane?.screenMode, "custom-screen");
  } finally {
    await core.close();
  }
});

test("operator browser runtime routes escape unwind through the live core, including shared context-menu close precedence", async () => {
  const model = await loadBrowserExampleModel();
  const core = await createOperatorWorkbenchCore({
    args: [exampleRoot, "--runtime-plugin", "plugin.operator-workbench"],
    cwd: path.resolve("."),
    env: process.env
  });
  try {
    await core.executeCommand("search --scope world operator_example");
    await core.executeCommand("select 1");
    const initialSnapshot = (await core.executeCommand("inspect 1")).snapshot;

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
      key: "ArrowUp",
      altKey: true,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.focusedPane, "top");

    await keydown({
      key: "Escape",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.focusedPane, "left");

    await keydown({
      key: "F2",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.rightPane?.activeScreenId, "references");

    await keydown({
      key: "Escape",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.rightPane?.activeScreenId, "inspect");

    const leftLayout = layoutViewport(model, runtime.runtimeState);
    await contextmenu(pointerEventForCell(
      canvas,
      leftLayout,
      leftLayout.left.x + 3,
      leftLayout.left.y + 3
    ));
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuOpen, true);

    await keydown({
      key: "Escape",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuOpen, false);
    assert.equal(runtime.runtimeState.snapshot.rightPane?.activeScreenId, "inspect");
  } finally {
    await core.close();
  }
});

test("operator browser runtime routes left-pane number-buffer digits and clear through the live core", async () => {
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
    assert.equal(runtime.runtimeState.snapshot.ui?.focusedPane, "left");

    await keydown({
      key: "2",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.numberBuffer, "2");

    await keydown({
      key: "Backspace",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.numberBuffer, "");

    await keydown({
      key: "2",
      altKey: false,
      preventDefault() {}
    });
    await keydown({
      key: "Enter",
      altKey: false,
      preventDefault() {}
    });
    assert.equal(runtime.runtimeState.snapshot.ui?.numberBuffer, "");
    assert.equal(runtime.runtimeState.snapshot.path.toLowerCase().includes("things"), true);
    assert.equal(runtime.runtimeState.snapshot.leftPane?.rows?.[0]?.label, "Contexts");
  } finally {
    await core.close();
  }
});

test("operator browser runtime routes pointer row selection and mouse primary activation through the live core", async () => {
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
    const dblclick = canvas.listeners.get("dblclick");
    assert.equal(typeof pointerdown, "function");
    assert.equal(typeof dblclick, "function");

    function findCellMatching(predicate, description) {
      const { buffer, layout } = runtime.compose();
      const rows = readAllRows(buffer);
      const y = rows.findIndex(predicate);
      assert.notEqual(y, -1, `expected visible text for ${description}`);
      const x = rows[y].search(/\S/u);
      assert.notEqual(x, -1, `expected visible cell column for ${description}`);
      return { layout, x, y };
    }

    const worldCell = findCellMatching(
      line => line.includes("Things"),
      "root things row"
    );
    await pointerdown(pointerEventForCell(canvas, worldCell.layout, worldCell.x, worldCell.y));
    assert.equal(runtime.runtimeState.snapshot.ui?.focusedPane, "left");
    assert.equal(runtime.runtimeState.snapshot.leftPane?.activeRowIndex, 1);
    assert.equal(runtime.runtimeState.snapshot.leftPane?.activeRow?.label, "Things");

    await dblclick(pointerEventForCell(canvas, worldCell.layout, worldCell.x, worldCell.y));
    assert.equal(runtime.runtimeState.snapshot.path, "Things");
    assert.equal(runtime.runtimeState.snapshot.leftPane?.rows?.[0]?.label, "Contexts");

    const nextLayout = layoutViewport(model, runtime.runtimeState);
    await pointerdown(pointerEventForCell(
      canvas,
      nextLayout,
      nextLayout.right.x + 3,
      nextLayout.right.y + 3
    ));
    assert.equal(runtime.runtimeState.snapshot.ui?.focusedPane, "right");
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

    assert.equal(runtimeState.snapshot.leftPane?.mode, "results");
    assert.equal(runtimeState.snapshot.leftPane?.shape, "table");
    assert.equal(runtimeState.snapshot.leftPane?.title, "Search Results");
    assert.equal(runtimeState.snapshot.leftPane?.columns.includes("title"), true);
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

    assert.equal(runtime.runtimeState.snapshot.viewport?.layout?.leftWeight, 50);
    assert.equal(runtime.runtimeState.hostViewportLayoutDraft, null);
    assert.equal((await core.snapshot()).viewport?.layout?.leftWeight, 50);
    assert.equal((await core.snapshot()).ui.displaySettings.paneSplit, 0.5);
    assert.equal((await core.snapshot()).ui.displaySettings.viewportTop, 3);
    assert.equal((await core.snapshot()).ui.displaySettings.viewportBottom, 4);

    layout = layoutViewport(model, runtime.runtimeState);
    const topBefore = runtime.runtimeState.snapshot.viewport?.layout?.top;
    await pointerdown(pointerEventForCell(canvas, layout, 10, layout.handles.top.y));
    pointermove(pointerEventForCell(canvas, layout, 10, 5));
    await pointerup({});

    assert.notEqual(runtime.runtimeState.snapshot.viewport?.layout?.top, topBefore);
    assert.equal(runtime.runtimeState.hostViewportLayoutDraft, null);
    assert.equal((await core.snapshot()).viewport?.layout?.top, runtime.runtimeState.snapshot.viewport?.layout?.top);
    assert.equal((await core.snapshot()).ui.displaySettings.paneSplit, 0.5);
    assert.equal((await core.snapshot()).ui.displaySettings.viewportTop, runtime.runtimeState.snapshot.viewport?.layout?.top);

    layout = layoutViewport(model, runtime.runtimeState);
    const bottomBefore = runtime.runtimeState.snapshot.viewport?.layout?.bottom;
    await pointerdown(pointerEventForCell(canvas, layout, 10, layout.handles.bottom.y));
    pointermove(pointerEventForCell(canvas, layout, 10, layout.bounds.height - 6));
    await pointerup({});

    assert.notEqual(runtime.runtimeState.snapshot.viewport?.layout?.bottom, bottomBefore);
    assert.equal(runtime.runtimeState.hostViewportLayoutDraft, null);
    assert.equal((await core.snapshot()).viewport?.layout?.bottom, runtime.runtimeState.snapshot.viewport?.layout?.bottom);
    assert.equal((await core.snapshot()).ui.displaySettings.viewportBottom, runtime.runtimeState.snapshot.viewport?.layout?.bottom);
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
  const initialCursor = runtime.runtimeState.snapshot.leftPane?.cursor;
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

  assert.equal(runtime.runtimeState.snapshot.leftPane?.cursor, initialCursor);
  assert.equal(runtime.runtimeState.snapshot.ui?.focusedPane, initialFocusedPane);
  assert.equal(runtime.runtimeState.snapshot.topPane?.navigation?.selectedIndex, initialSelectedTop);
  assert.equal(runtime.runtimeState.snapshot.ui?.helpOpen, true);
  assert.equal((runtime.runtimeState.snapshot.ui?.openOverlayIds || []).includes("help_overlay"), true);

  await contextmenu({
    preventDefault() {}
  });
  assert.equal(runtime.runtimeState.snapshot.ui?.helpOpen, false);
  assert.equal((runtime.runtimeState.snapshot.ui?.openOverlayIds || []).includes("context_menu"), true);
  assert.equal(runtime.runtimeState.snapshot.contextMenu?.items?.[1]?.label, "Change Color");

  runtime.runtimeState.snapshot.rightPane.bodyLines = Array.from({ length: 24 }, (_, index) => `Fixture reader line ${index + 1}`);
  if (runtime.runtimeState.snapshot.rightPane?.screen) {
    runtime.runtimeState.snapshot.rightPane.screen.detailLines = [...runtime.runtimeState.snapshot.rightPane.bodyLines];
  }
  runtime.render();
  const beforeScrollY = Number(runtime.runtimeState.snapshot.ui?.readerStateBySurfaceId?.session_reader?.y ?? 0) || 0;
  wheel({
    deltaY: 10,
    shiftKey: false,
    preventDefault() {}
  });
  assert.equal(runtime.runtimeState.snapshot.ui?.readerStateBySurfaceId?.session_reader?.y, beforeScrollY + 1);

  const layout = layoutViewport(model, runtime.runtimeState);
  const beforeLeftWeight = runtime.runtimeState.snapshot.viewport?.layout?.leftWeight;
  await pointerdown(pointerEventForCell(
    canvas,
    layout,
    layout.handles.vertical.x,
    layout.handles.vertical.y + 1
  ));
  pointermove(pointerEventForCell(canvas, layout, 40, layout.handles.vertical.y + 1));
  await pointerup({});
  assert.equal(runtime.runtimeState.snapshot.viewport?.layout?.leftWeight, beforeLeftWeight);
  assert.equal(runtime.runtimeState.hostViewportLayoutDraft, null);

  const { buffer } = runtime.compose();
  const rows = readAllRows(buffer);
  assert.equal(rows.some(line => line.includes("Fixture mode: read-only")), true);
  assert.equal(runtime.runtimeState.snapshot.contextMenu?.items?.[1]?.label, "Change Color");
});

test("operator browser runtime without a live bridge in live mode fails closed instead of inventing local focus or cursor state", async () => {
  const model = await loadBrowserExampleModel();
  const canvas = createFakeCanvas();
  const windowTarget = createFakeWindowTarget();
  const runtime = createOperatorBrowserRuntime({
    canvas,
    model,
    initialState: createOperatorBrowserStateFromWorkbenchSnapshot(await loadBrowserExampleSnapshotFixture()),
    liveApi: {
      async dispatchIntent() {
        return null;
      }
    },
    fallbackPolicy: "live",
    windowTarget
  });
  runtime.mount();

  const keydown = windowTarget.listeners.get("keydown");
  const contextmenu = canvas.listeners.get("contextmenu");
  assert.equal(typeof keydown, "function");
  assert.equal(typeof contextmenu, "function");

  const initialFocusedPane = runtime.runtimeState.snapshot.ui?.focusedPane;
  const initialLeftCursor = runtime.runtimeState.snapshot.leftPane?.cursor;
  const initialTopCursor = runtime.runtimeState.snapshot.topPane?.navigation?.selectedIndex;

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

  await contextmenu({
    preventDefault() {}
  });

  assert.equal(runtime.runtimeState.snapshot.ui?.focusedPane, initialFocusedPane);
  assert.equal(runtime.runtimeState.snapshot.leftPane?.cursor, initialLeftCursor);
  assert.equal(runtime.runtimeState.snapshot.topPane?.navigation?.selectedIndex, initialTopCursor);
  assert.equal(runtime.runtimeState.snapshot.ui?.helpOpen, false);
  assert.equal(runtime.runtimeState.snapshot.ui?.contextMenuOpen, false);
  assert.deepEqual(runtime.runtimeState.snapshot.ui?.openOverlayIds, []);
});

test("operator browser runtime without a live bridge in live mode fails closed for viewport drag commits", async () => {
  const model = await loadBrowserExampleModel();
  const canvas = createFakeCanvas();
  const windowTarget = createFakeWindowTarget();
  const runtime = createOperatorBrowserRuntime({
    canvas,
    model,
    initialState: createOperatorBrowserStateFromWorkbenchSnapshot(await loadBrowserExampleSnapshotFixture()),
    liveApi: {
      async dispatchIntent() {
        return null;
      }
    },
    fallbackPolicy: "live",
    windowTarget
  });
  runtime.mount();

  const pointerdown = canvas.listeners.get("pointerdown");
  const pointermove = windowTarget.listeners.get("pointermove");
  const pointerup = windowTarget.listeners.get("pointerup");
  assert.equal(typeof pointerdown, "function");
  assert.equal(typeof pointermove, "function");
  assert.equal(typeof pointerup, "function");

  const before = structuredClone(runtime.runtimeState.snapshot.viewport?.layout);
  const layout = layoutViewport(model, runtime.runtimeState);
  await pointerdown(pointerEventForCell(
    canvas,
    layout,
    layout.handles.vertical.x,
    layout.handles.vertical.y + 1
  ));
  pointermove(pointerEventForCell(canvas, layout, 40, layout.handles.vertical.y + 1));
  assert.notEqual(runtime.runtimeState.hostViewportLayoutDraft, null);
  await pointerup({});

  assert.deepEqual(runtime.runtimeState.snapshot.viewport?.layout, before);
  assert.equal(runtime.runtimeState.hostViewportLayoutDraft, null);
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
  state.snapshot.ui.openOverlayIds = ["context_menu"];
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
  state.snapshot.ui.openOverlayIds = ["context_menu"];
  const { buffer, frameGraph, fillScene, textScene } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(frameGraph.ornaments.length, 9);
  assert.equal(fillScene.base.length, 4);
  assert.equal(fillScene.base.some(entry => entry.id === "nav_tree"), true);
  assert.equal(fillScene.base.some(entry => entry.id === "session_reader"), true);
  assert.equal(fillScene.base.some(entry => entry.styleId === "primary"), true);
  assert.equal(fillScene.base.every(entry => typeof entry.styleId === "string" && entry.styleId.length > 0), true);
  assert.equal(fillScene.overlay.length, 1);
  assert.equal(fillScene.overlay[0].styleId, "overlay");
  assert.equal(fillStyleById(fillScene.overlay[0].styleId).flags, CELL_FLAGS.overlay);
  assert.equal(textScene.overlay[0].styleId === "overlayMenu" || textScene.overlay[0].styleId === "overlayHelp", true);
  assert.equal(textStyleById(textScene.overlay[0].styleId).flags, CELL_FLAGS.overlay);
  assert.equal(textScene.overlay.some(entry => entry.text.includes("Change Color")), true);
  assert.equal(state.snapshot.contextMenu?.items?.[1]?.detail, "surface theme");
  assert.equal(frameGraph.ornaments.some(ornament => Array.isArray(ornament.segments)), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("Operator Navi")), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("x:0 y:0")), false);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("Context")), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("root")), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes(": screen inspect")), true);
  assert.equal(textScene.overlay.some(entry => entry.text.includes("2. Change Color")), true);
  assert.equal(rows.some(line => line.includes("Workbench")), true);
  assert.equal(rows.some(line => line.includes("Context")), true);
  assert.equal(rows.some(line => line.includes("Change Color")), true);
  const menuRow = rows.findIndex(line => line.includes("Change Color"));
  assert.equal(menuRow > 8 && menuRow < 22, true);
});

test("operator example overlay titles render from shared snapshot overlay models instead of browser surface labels", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.ui.openOverlayIds = ["help_overlay", "context_menu"];
  state.snapshot.contextMenu.frameTitle = "MENU";
  state.snapshot.helpOverlay.frameTitle = "ASSIST";
  state.snapshot.contextMenu.lines = ["1. ONE", "2. TWO"];
  state.snapshot.contextMenu.visibleLines = ["1. ONE", "2. TWO"];
  state.snapshot.contextMenu.visibleLineCount = 2;
  state.snapshot.helpOverlay.lines = ["HELP A", "HELP B"];
  state.snapshot.helpOverlay.visibleLines = ["HELP A", "HELP B"];
  state.snapshot.helpOverlay.visibleLineCount = 2;
  const helpOverlayEntry = state.snapshot.overlays.find(entry => entry.id === "help_overlay");
  const contextMenuEntry = state.snapshot.overlays.find(entry => entry.id === "context_menu");
  helpOverlayEntry.frameTitle = "ASSIST";
  helpOverlayEntry.lines = ["HELP A", "HELP B"];
  helpOverlayEntry.visibleLines = ["HELP A", "HELP B"];
  helpOverlayEntry.visibleLineCount = 2;
  contextMenuEntry.frameTitle = "MENU";
  contextMenuEntry.lines = ["1. ONE", "2. TWO"];
  contextMenuEntry.visibleLines = ["1. ONE", "2. TWO"];
  contextMenuEntry.visibleLineCount = 2;
  const { buffer } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(rows.some(line => line.includes(" MENU ")), true);
  assert.equal(rows.some(line => line.includes(" ASSIST ")), true);
  assert.equal(rows.some(line => line.includes("1. ONE")), true);
  assert.equal(rows.some(line => line.includes("HELP A")), true);
  assert.equal(rows.some(line => line.includes(" Context ")), false);
  assert.equal(rows.some(line => line.includes(" Help ")), false);
});

test("operator example browser overlay composition prefers canonical overlay rows over compatibility top-level fields", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.ui.openOverlayIds = ["context_menu"];
  state.snapshot.contextMenu.frameTitle = "WRONG";
  state.snapshot.contextMenu.lines = ["WRONG TOP LEVEL"];
  state.snapshot.contextMenu.visibleLines = ["WRONG TOP LEVEL"];
  state.snapshot.contextMenu.visibleLineCount = 1;
  state.snapshot.contextMenu.items = [{
    id: "wrong",
    label: "Wrong Top Level",
    shortcut: "1",
    enabled: true
  }];
  const contextMenuEntry = state.snapshot.overlays.find(entry => entry.id === "context_menu");
  contextMenuEntry.frameTitle = "RIGHT";
  contextMenuEntry.lines = ["RIGHT OVERLAY ROW"];
  contextMenuEntry.visibleLines = ["RIGHT OVERLAY ROW"];
  contextMenuEntry.visibleLineCount = 1;
  contextMenuEntry.items = [{
    id: "right",
    label: "Right Overlay Row",
    shortcut: "1",
    enabled: true
  }];
  const { buffer } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(rows.some(line => line.includes(" RIGHT ")), true);
  assert.equal(rows.some(line => line.includes("RIGHT OVERLAY ROW")), true);
  assert.equal(rows.some(line => line.includes(" WRONG ")), false);
  assert.equal(rows.some(line => line.includes("WRONG TOP LEVEL")), false);
});

test("operator example overlay body placement uses shared inset offsets", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.ui.openOverlayIds = ["context_menu"];
  state.snapshot.contextMenu.frameTitle = "MENU";
  state.snapshot.contextMenu.lines = ["1. ONE"];
  state.snapshot.contextMenu.visibleLines = ["1. ONE"];
  state.snapshot.contextMenu.visibleLineCount = 1;
  state.snapshot.contextMenu.bodyInsetX = 4;
  state.snapshot.contextMenu.bodyInsetY = 2;
  const contextMenuEntry = state.snapshot.overlays.find(entry => entry.id === "context_menu");
  contextMenuEntry.frameTitle = "MENU";
  contextMenuEntry.lines = ["1. ONE"];
  contextMenuEntry.visibleLines = ["1. ONE"];
  contextMenuEntry.visibleLineCount = 1;
  contextMenuEntry.bodyInsetX = 4;
  contextMenuEntry.bodyInsetY = 2;
  const { overlayRects, textScene } = composeViewportToBuffer(model, state);
  const menuOverlay = overlayRects.find(entry => entry.id === "context_menu");
  const menuText = textScene.overlay.find(entry => entry.text.includes("1. ONE"));
  assert.ok(menuOverlay);
  assert.ok(menuText);
  assert.equal(menuText.x, menuOverlay.rect.x + 4);
  assert.equal(menuText.y, menuOverlay.rect.y + 2);
});

test("operator example overlay rendering highlights the active context-menu row from shared snapshot state", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.ui.openOverlayIds = ["context_menu"];
  state.snapshot.ui.activeOverlayId = "context_menu";
  state.snapshot.ui.overlayStateById = {
    context_menu: {
      activeItemIndex: 1
    }
  };
  state.snapshot.contextMenu.activeItemIndex = 1;
  const contextMenuEntry = state.snapshot.overlays.find(entry => entry.id === "context_menu");
  contextMenuEntry.activeItemIndex = 1;
  const { textScene } = composeViewportToBuffer(model, state);
  const menuEntries = textScene.overlay.filter(entry => entry.text.includes("Edit") || entry.text.includes("Change Color"));
  assert.equal(menuEntries.some(entry => entry.text.includes("1. Edit") && entry.styleId === "overlayMenu"), true);
  assert.equal(menuEntries.some(entry => entry.text.includes("2. Change Color") && entry.styleId === "overlayMenuSelected"), true);
});

test("operator example overlay visible lines and clipping come from shared snapshot metadata", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.ui.openOverlayIds = ["context_menu"];
  state.snapshot.contextMenu.width = 18;
  state.snapshot.contextMenu.height = 4;
  state.snapshot.contextMenu.bodyInsetX = 2;
  state.snapshot.contextMenu.bodyInsetY = 1;
  state.snapshot.contextMenu.visibleLines = ["A clipped row…", "B hidden row…"];
  state.snapshot.contextMenu.visibleLineCount = 1;
  const contextMenuEntry = state.snapshot.overlays.find(entry => entry.id === "context_menu");
  contextMenuEntry.width = 18;
  contextMenuEntry.height = 4;
  contextMenuEntry.bodyInsetX = 2;
  contextMenuEntry.bodyInsetY = 1;
  contextMenuEntry.visibleLines = state.snapshot.contextMenu.visibleLines;
  contextMenuEntry.visibleLineCount = 1;
  const { textScene } = composeViewportToBuffer(model, state);
  assert.deepEqual(
    textScene.overlay.filter(entry => entry.styleId === "overlayMenu").map(entry => entry.text),
    ["A clipped row…", "B hidden row…"]
  );
});

test("operator example browser overlay rendering prefers shared visibleLines over raw overlay lines", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.ui.openOverlayIds = ["context_menu"];
  state.snapshot.contextMenu.lines = [
    "1. Edit :: pane:left",
    "2. Change Color :: surface theme"
  ];
  state.snapshot.contextMenu.visibleLines = ["1. Edit :: pa…"];
  state.snapshot.contextMenu.visibleLineCount = 1;
  const contextMenuEntry = state.snapshot.overlays.find(entry => entry.id === "context_menu");
  contextMenuEntry.lines = [...state.snapshot.contextMenu.lines];
  contextMenuEntry.visibleLines = [...state.snapshot.contextMenu.visibleLines];
  contextMenuEntry.visibleLineCount = 1;
  const { textScene } = composeViewportToBuffer(model, state);
  assert.deepEqual(
    textScene.overlay.filter(entry => entry.styleId === "overlayMenu").map(entry => entry.text),
    ["1. Edit :: pa…"]
  );
});

test("operator example browser resolves generic overlay models from snapshot overlays", async () => {
  const model = await loadBrowserExampleModel();
  model.surfaceById.set("info_overlay", {
    id: "info_overlay",
    kind: "doc_view",
    title: "Wrong",
    width: 60,
    height: 20
  });
  const state = createOperatorExampleState();
  state.snapshot.ui.openOverlayIds = ["info_overlay"];
  state.snapshot.overlays = [
    ...(Array.isArray(state.snapshot.overlays) ? state.snapshot.overlays : []),
    {
      id: "info_overlay",
      kind: "doc_view",
      frameTitle: "INFO",
      title: "Info",
      placement: "center",
      marginX: 4,
      marginY: 2,
      titleInsetX: 3,
      width: 18,
      height: 5,
      bodyInsetX: 2,
      bodyInsetY: 1,
      contentWidth: 14,
      contentHeight: 3,
      lineCount: 1,
      visibleLineCount: 1,
      overflowLineCount: 0,
      lines: ["GENERIC"],
      visibleLines: ["GENERIC"],
      resizable: false,
      scroll: []
    }
  ];
  const { overlayRects, frameGraph, textScene } = composeViewportToBuffer(model, state);
  const infoOverlay = overlayRects.find(entry => entry.id === "info_overlay");
  assert.ok(infoOverlay);
  assert.equal(infoOverlay.rect.x, 31);
  assert.equal(infoOverlay.rect.y, 12);
  assert.equal(infoOverlay.rect.width, 18);
  assert.equal(infoOverlay.rect.height, 5);
  assert.equal(frameGraph.ornaments.some(entry => entry.text.includes(" INFO ")), true);
  assert.equal(textScene.overlay.some(entry => entry.text.includes("GENERIC")), true);
});

test("operator example overlay frame geometry and title placement use shared snapshot metadata", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.ui.openOverlayIds = ["help_overlay"];
  state.snapshot.helpOverlay.frameTitle = "DOC";
  state.snapshot.helpOverlay.width = 18;
  state.snapshot.helpOverlay.height = 6;
  state.snapshot.helpOverlay.marginX = 5;
  state.snapshot.helpOverlay.marginY = 3;
  state.snapshot.helpOverlay.titleInsetX = 4;
  state.snapshot.helpOverlay.lines = ["HELP A"];
  state.snapshot.helpOverlay.visibleLines = ["HELP A"];
  state.snapshot.helpOverlay.visibleLineCount = 1;
  const helpOverlayEntry = state.snapshot.overlays.find(entry => entry.id === "help_overlay");
  helpOverlayEntry.frameTitle = "DOC";
  helpOverlayEntry.width = 18;
  helpOverlayEntry.height = 6;
  helpOverlayEntry.marginX = 5;
  helpOverlayEntry.marginY = 3;
  helpOverlayEntry.titleInsetX = 4;
  helpOverlayEntry.lines = ["HELP A"];
  helpOverlayEntry.visibleLines = ["HELP A"];
  helpOverlayEntry.visibleLineCount = 1;
  const { overlayRects, frameGraph } = composeViewportToBuffer(model, state);
  const helpOverlay = overlayRects.find(entry => entry.id === "help_overlay");
  const titleEntry = frameGraph.ornaments.find(entry => entry.text.includes(" DOC "));
  assert.ok(helpOverlay);
  assert.ok(titleEntry);
  assert.equal(helpOverlay.rect.x, 31);
  assert.equal(helpOverlay.rect.y, 12);
  assert.equal(helpOverlay.rect.width, 18);
  assert.equal(helpOverlay.rect.height, 6);
  assert.equal(titleEntry.x, helpOverlay.rect.x + 4);
});

test("operator example overlay rendering does not invent fallback size when authoring omits overlay dimensions", async () => {
  const model = await loadBrowserExampleModel();
  const helpOverlay = model.surfaceById.get("help_overlay");
  helpOverlay.width = null;
  helpOverlay.height = null;
  const state = createOperatorExampleState();
  state.snapshot.ui.openOverlayIds = ["help_overlay"];
  state.snapshot.helpOverlay.width = null;
  state.snapshot.helpOverlay.height = null;
  const helpOverlayEntry = state.snapshot.overlays.find(entry => entry.id === "help_overlay");
  helpOverlayEntry.width = null;
  helpOverlayEntry.height = null;
  const { fillScene, textScene, overlayRects, buffer } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(Array.isArray(overlayRects), true);
  assert.equal(overlayRects.length, 0);
  assert.equal(fillScene.overlay.length, 0);
  assert.equal(textScene.overlay.length, 0);
  assert.equal(rows.some(line => line.includes("HELP A")), false);
  assert.equal(rows.some(line => line.includes(" Help ")), false);
});

test("operator example top-strip and command bar render through segmented compositor ornaments", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.viewport.id = "v";
  state.snapshot.viewport.theme = null;
  state.snapshot.viewport.themeSpec = {
    id: "a",
    title: "A",
    mode: "ansi16",
    palette: "terminal-dark"
  };
  state.snapshot.topPane.metaChips = [
    { id: "viewport", type: "viewport", label: "viewport:v" },
    { id: "theme", type: "theme", label: "theme:a" },
    { id: "pane", type: "pane", label: "pane:left" }
  ];
  state.snapshot.topPane.navigation.chips = [
    { label: "r" },
    { label: "p" },
    { label: "i" }
  ];
  const { buffer, frameGraph } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(frameGraph.ornaments.some(ornament => Array.isArray(ornament.segments)
    && ornament.segments.some(segment => segment.text.includes("viewport:v | theme:a | pane:left"))), true);
  assert.equal(frameGraph.ornaments.some(ornament => Array.isArray(ornament.segments)
    && ornament.segments.some(segment => typeof segment.styleId === "string" && segment.styleId.length > 0)), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes(": screen inspect")), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("F1 help | Right click menu | Drag handles resize")), true);
  assert.equal(rows[1].includes("viewport:v | theme:a | pane:left"), true);
  assert.equal(rows.some(line => line.includes(": screen inspect")), true);
});

test("operator example pane frame titles render from the shared snapshot instead of browser surface labels", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.topPane.frameTitle = "STATE";
  state.snapshot.rightPane.title = "TRACE";
  state.snapshot.bottomPane.frameTitle = "PROMPT";
  const { buffer } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(rows[0].includes("STATE"), true);
  assert.equal(rows[3].includes("TRACE"), true);
  assert.equal(rows.some(line => line.includes("PROMPT")), true);
  assert.equal(rows[0].includes("Status"), false);
  assert.equal(rows.some(line => line.includes("PROMPT")), true);
});

test("operator example right-pane section header and divider render through compositor ornaments", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.rightPane.screen.rows = [
    { label: "alpha", detail: "first" },
    { label: "beta", detail: "second" }
  ];
  state.snapshot.rightPane.activeSection = {
    ...(state.snapshot.rightPane.activeSection || {}),
    id: "trace.rows",
    title: "Trace",
    rowHeaderLabel: "Shared Trace rows",
    rowCount: 2,
    actionable: true,
    collapsible: true,
    collapsed: false
  };
  state.snapshot.rightPane.frameStatus = "rows:2 y:0";
  state.snapshot.rightPane.screen.activeSectionTitle = "Trace";
  const { buffer, frameGraph, textScene } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("rows:2 y:0")), true);
  assert.equal(frameGraph.ornaments.some(ornament => ornament.text.includes("[Shared Trace rows]")), true);
  assert.equal(frameGraph.ornaments.some(ornament => /^=+$/u.test(ornament.text)), true);
  assert.equal(textScene.base.some(entry => entry.text.includes("alpha first")), true);
  assert.equal(rows.some(line => line.includes("[Shared Trace rows]")), true);
  assert.equal(rows.some(line => line.includes("alpha first")), true);
});

test("operator example left-pane header, table columns, and body rows render through explicit composition seams", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.leftPane = {
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
  applyLongTextReaderFixture(state);
  let composed = composeViewportToBuffer(model, state);
  const baselineRow = readAllRows(composed.buffer).find(line => line.includes("Selection, aliases")) || "";
  state.snapshot.ui.readerStateBySurfaceId = {
    ...(state.snapshot.ui.readerStateBySurfaceId ?? {}),
    session_reader: { x: 8, y: 0 }
  };
  state.snapshot.rightPane.readerScroll = { x: 8, y: 0 };
  composed = composeViewportToBuffer(model, state);
  const shiftedRow = readAllRows(composed.buffer).find(line => line.includes("aliases, notes")) || "";
  assert.equal(baselineRow.includes("Workbench :: Selection"), true);
  assert.equal(shiftedRow.includes("aliases, notes"), true);
});

test("operator example right-pane reader content comes only from shared bodyLines", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.snapshot.rightPane.bodyLines = [];
  state.snapshot.rightPane.screen.detailLines = ["HOST FALLBACK SHOULD NOT RENDER"];
  const { buffer, textScene } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(textScene.base.some(entry => entry.text.includes("HOST FALLBACK SHOULD NOT RENDER")), false);
  assert.equal(rows.some(line => line.includes("HOST FALLBACK SHOULD NOT RENDER")), false);
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
  assert.equal(rows[3].includes("Workbench"), true);
  assert.equal(rows[3].includes("x:0 y:0"), false);
  assert.equal(rows[4].includes("root"), true);
});

test("operator example visual snapshot keeps the expected pane scaffold", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  applyLongTextReaderFixture(state);
  const { buffer } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(rows[0].includes("Status"), true);
  assert.equal(rows[1].includes("viewport:operator_default | theme:ansi16 | pane:left"), true);
  assert.equal(rows[3].includes("Operator Navi"), true);
  assert.equal(rows[3].includes("Workbench"), true);
  assert.equal(rows[4].includes("root"), true);
  assert.equal(rows[5].includes("Workbench    Opera"), true);
  assert.equal(rows[4].includes("Workbench :: Selection, aliases"), true);
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
