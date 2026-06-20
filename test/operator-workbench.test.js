import assert from "node:assert/strict";
import test from "node:test";
import { createOperatorTuiEngine } from "../src/operator-tui.js";
import { createOperatorWorkbenchController } from "../src/operator-workbench/core.js";
import { renderOperatorWorkbenchPage } from "../src/operator-workbench/page.js";
import { buildOperatorWorkbenchDefinition } from "../src/operator-screen-specs.js";
import {
  renderOperatorWorkbenchState,
  startOperatorWorkbenchRuntime
} from "../src/operator-workbench/runtime.js";

function makeState() {
  const worldRecords = [
    {
      scope: "world",
      id: "thing.alpha",
      kind: "thing",
      title: "Alpha",
      summary: "backend/runtime",
      raw: {},
      metadata: {
        context: "backend/runtime",
        surfaceTier: null,
        surfaceLabel: null,
        badges: [],
        properties: [],
        values: [],
        recentWitnesses: [],
        processEvents: [],
        processSelection: null
      },
      sourceHints: [{
        file: "C:/tmp/world/alpha.rvm",
        line: 3,
        section: "view",
        sourceLanguage: "rvm"
      }]
    },
    {
      scope: "world",
      id: "thing.alphabet",
      kind: "thing",
      title: "Alphabet",
      summary: "backend/runtime",
      raw: {},
      metadata: {
        context: "backend/runtime",
        surfaceTier: null,
        surfaceLabel: null,
        badges: [],
        properties: [],
        values: [],
        recentWitnesses: [],
        processEvents: [],
        processSelection: null
      },
      sourceHints: []
    },
    {
      scope: "world",
      id: "backend/runtime",
      kind: "context",
      title: "backend/runtime",
      summary: "backend/runtime",
      raw: {},
      metadata: {
        context: "backend/runtime",
        surfaceTier: null,
        surfaceLabel: null,
        badges: [],
        properties: [],
        values: [],
        recentWitnesses: [],
        processEvents: [],
        processSelection: null
      },
      sourceHints: []
    }
  ];
  const platformRecords = [{
    scope: "platform",
    id: "plugin.platform",
    kind: "plugin",
    title: "Platform Plugin",
    summary: "active | plugin.platform",
    raw: {},
    metadata: {
      owner: "plugin.platform",
      status: "active",
      source: "plugins/platform/runtime.js",
      lifecycle: ["execute"],
      command: null,
      sourceDependencies: []
    },
    sourceHints: [{
      file: "C:/repo/plugins/platform/runtime.js",
      line: null,
      section: null,
      sourceLanguage: null
    }]
  }];
  const recordIndex = new Map();
  for (const record of [...worldRecords, ...platformRecords]) {
    recordIndex.set(record.id, record);
    recordIndex.set(`${record.scope}:${record.id}`, record);
  }
  return {
    runtimeContext: {
      world: {
        allWitnesses() { return []; },
        project() { return []; }
      },
      appProject: null,
      appSnapshotManager: null,
      appPreviewSessionManager: null,
      operatorContract: {
        worldHome: "C:/tmp/world-home"
      },
      close: async () => {}
    },
    worldGraph: { nodes: [] },
    platformModel: { nodes: [] },
    worldRecords,
    platformRecords,
    recordIndex,
    containerIndex: new Map()
  };
}

function withAuthoredScreen(state, {
  screenId = "trace",
  datasetId = `${screenId}.dataset`,
  shortcut = "F5",
  shape = "list-detail",
  provider = "provenance",
  columns = [],
  primaryAction = null,
  rowFilterKind = null,
  rowFilterAction = null,
  defaultSectionId = null,
  sections = [],
  leftScreens = [],
  defaultLeftScreenId = null,
  leftScreenId = null
} = {}) {
  const sectionRows = sections.map(section => ({
    name: section.id,
    body: {
      declarationKind: "operator_screen_section",
      values: {
        id: section.id,
        screen: screenId,
        title: section.title ?? section.id,
        kind: section.kind ?? "detail",
        dataset: section.dataset ?? null,
        dataSource: section.dataSource ?? null,
        columns: section.columns ?? [],
        emptyMessage: section.emptyMessage ?? null,
        collapsible: section.collapsible ?? null,
        collapsed: section.collapsed ?? null,
        rowFilterKind: section.rowFilterKind ?? null,
        rowFilterAction: section.rowFilterAction ?? null,
        priority: section.priority ?? null
      }
    }
  }));
  const leftScreenRows = leftScreens.map(screen => ({
    name: screen.id,
    body: {
      declarationKind: "operator_screen",
      values: {
        id: screen.id,
        title: screen.title ?? screen.id,
        subtitle: screen.subtitle ?? null,
        pane: "left",
        shape: screen.shape ?? "list",
        dataset: screen.dataset ?? null,
        dataSource: screen.dataSource ?? null,
        helpText: screen.helpText ?? null
      }
    }
  }));
  state.runtimeContext.appProject = {
    authoredDesireDocs: [],
    operatorWorkbench: buildOperatorWorkbenchDefinition({
      authoredDesireDocs: [{
        runtimeResiduals: [
          {
            name: datasetId,
            body: {
              declarationKind: "operator_dataset",
              values: {
                id: datasetId,
                title: "Trace Dataset",
                provider,
                columns,
                primaryAction,
                rowFilterKind,
                rowFilterAction
              }
            }
          },
          {
            name: screenId,
            body: {
              declarationKind: "operator_screen",
              values: {
                id: screenId,
                title: "Trace",
                subtitle: "Authored trace screen",
                pane: "right",
                shape,
                dataset: datasetId,
                shortcut,
                leftScreen: leftScreenId,
                defaultSection: defaultSectionId,
                sections: sections.map(section => section.id)
              }
            }
          },
          ...leftScreenRows,
          ...sectionRows,
          {
            name: "shell",
            body: {
              declarationKind: "operator_setup",
              values: {
                screens: [screenId, "references", "source", "provenance"],
                shortcuts: [{ shortcut, screenId }],
                defaultScreen: screenId,
                defaultLeftScreen: defaultLeftScreenId
              }
            }
          }
        ]
      }]
    })
  };
  return state;
}

function makeElement() {
  return {
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    value: "",
    dataset: {},
    attributes: new Map(),
    style: {
      values: new Map(),
      setProperty(name, value) {
        this.values.set(name, value);
      }
    },
    listeners: new Map(),
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    focus() {
      this.focused = true;
    }
  };
}

function makeFakeDocument() {
  const elements = new Map();
  const ids = [
    "operator-canvas",
    "operator-window-drag",
    "operator-window-controls",
    "operator-window-minimize",
    "operator-window-maximize",
    "operator-window-close",
    "operator-bootstrap-status",
    "operator-title",
    "operator-subtitle",
    "operator-nav-strip",
    "operator-nav-meta",
    "operator-left-header",
    "operator-left-title",
    "operator-left-rows",
    "operator-inspector-title",
    "operator-tab-inspect",
    "operator-tab-references",
    "operator-tab-source",
    "operator-tab-provenance",
    "operator-inspector-body",
    "operator-references-body",
    "operator-source-body",
    "operator-provenance-body",
    "operator-custom-screen-body",
    "operator-command-input",
    "operator-command-preview",
    "operator-command-matches",
    "operator-last-output",
    "operator-last-status",
    "operator-number-buffer",
    "operator-help",
    "operator-help-context",
    "operator-help-summary",
    "operator-setting-font-size",
    "operator-setting-row-density",
    "operator-setting-pane-split",
    "operator-setting-page-size",
    "operator-setting-color-mode"
  ];
  for (const id of ids) elements.set(id, makeElement());
  const canvas = elements.get("operator-canvas");
  canvas.clientWidth = 1280;
  canvas.clientHeight = 900;
  canvas.width = 1280;
  canvas.height = 900;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: canvas.clientWidth, height: canvas.clientHeight });
  canvas.getContext = () => ({
    fillStyle: "#000000",
    font: "",
    textBaseline: "top",
    setTransform() {},
    measureText(text) {
      return { width: String(text ?? "").length * 8 };
    },
    fillRect() {},
    fillText() {}
  });
  const documentTarget = {
    body: {
      dataset: {},
      style: {
        values: new Map(),
        setProperty(name, value) {
          this.values.set(name, value);
        }
      }
    },
    listeners: new Map(),
    defaultView: {
      innerWidth: 1280,
      innerHeight: 900,
      devicePixelRatio: 1
    },
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };
  return { documentTarget, elements };
}

test("workbench controller exposes root tree and primary navigation action", async () => {
  const state = makeState();
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  const initial = await controller.snapshot();
  assert.equal(initial.leftPane.mode, "tree");
  assert.deepEqual(initial.leftPane.rows.map(row => row.label), ["Session", "World", "Platform"]);
  assert.equal(initial.leftPane.activeRowIndex, 0);
  assert.equal(initial.leftPane.activeRow?.primaryAction?.command, "open 1");
  assert.equal(initial.leftPane.rows[1].primaryAction?.command, "open 2");

  await controller.dispatchIntent({ type: "set-left-cursor", index: 1 });
  const activated = await controller.dispatchIntent({ type: "activate-primary" });
  assert.equal(activated.snapshot.path, "World");
  assert.equal(activated.snapshot.leftPane.rows.some(row => row.label === "Things"), true);
});

test("workbench controller inspects records as the primary left-pane action", async () => {
  const state = makeState();
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({
    state,
    engine,
    displaySettings: {
      fontSize: 16,
      rowDensity: "compact",
      paneSplit: 0.5,
      defaultColumns: ["title", "id"],
      pageSize: 10,
      colorMode: "off"
    }
  });

  const searched = await controller.executeCommand("search alpha");
  assert.equal(searched.snapshot.leftPane.mode, "results");
  assert.deepEqual(searched.snapshot.leftPane.columns, ["title", "id"]);
  assert.equal(searched.snapshot.leftPane.rows.length >= 2, true);
  assert.equal(searched.snapshot.leftPane.paging?.page, 1);
  assert.equal(searched.snapshot.leftPane.paging?.query, "alpha");
  assert.equal(searched.snapshot.leftPane.rows[0].primaryAction?.command, "inspect 1");

  await controller.dispatchIntent({ type: "set-left-cursor", index: 0 });
  const inspected = await controller.dispatchIntent({ type: "activate-primary" });
  assert.equal(inspected.snapshot.session.selectionId, null);
  assert.equal(inspected.snapshot.rightPane.bodyLines.some(line => line.includes("thing.alpha")), true);
});

test("workbench controller resolves a default authored left screen when no search overlay is active", async () => {
  const state = withAuthoredScreen(makeState(), {
    leftScreens: [{
      id: "left.refs",
      title: "Reference Rail",
      shape: "table",
      dataSource: "references"
    }],
    defaultLeftScreenId: "left.refs"
  });
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  await controller.executeCommand("inspect thing.alpha");
  const next = await controller.snapshot();

  assert.equal(next.leftPane.screenId, "left.refs");
  assert.equal(next.leftPane.shape, "table");
  assert.equal(next.leftPane.origin, "authored");
  assert.equal(next.leftPane.rows.length >= 1, true);
});

test("workbench controller lets the active right screen override the authored left screen", async () => {
  const state = withAuthoredScreen(makeState(), {
    leftScreens: [
      { id: "left.refs", title: "Reference Rail", shape: "table", dataSource: "references" },
      { id: "left.source", title: "Source Rail", shape: "table", dataSource: "source" }
    ],
    defaultLeftScreenId: "left.refs",
    leftScreenId: "left.source"
  });
  state.recordIndex.get("thing.alpha").sourceHints = [
    { file: "C:/tmp/world/alpha-one.rvm", line: 3, section: "view", sourceLanguage: "rvm" }
  ];
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  await controller.executeCommand("inspect thing.alpha");
  let next = await controller.snapshot();
  assert.equal(next.leftPane.screenId, "left.refs");

  next = (await controller.executeCommand("screen trace")).snapshot;
  assert.equal(next.leftPane.screenId, "left.source");
  assert.equal(next.leftPane.title, "Source Rail");
  assert.equal(next.leftPane.rows.length, 1);
});

test("search overlay takes precedence over authored left screens and clear restores them", async () => {
  const state = withAuthoredScreen(makeState(), {
    leftScreens: [{
      id: "left.refs",
      title: "Reference Rail",
      shape: "table",
      dataSource: "references"
    }],
    defaultLeftScreenId: "left.refs"
  });
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  await controller.executeCommand("inspect thing.alpha");
  let next = await controller.snapshot();
  assert.equal(next.leftPane.screenId, "left.refs");

  next = (await controller.executeCommand("search alpha")).snapshot;
  assert.equal(next.leftPane.screenId, "builtin.search");
  assert.equal(next.leftPane.overlay, true);

  next = (await controller.executeCommand("clear")).snapshot;
  assert.equal(next.leftPane.screenId, "left.refs");
  assert.equal(next.leftPane.overlay, false);
});

test("operator TUI raw shell accepts a bare index as the current row primary action", async () => {
  const state = makeState();
  const engine = createOperatorTuiEngine(state);

  await engine.execute("search alpha");
  const inspected = await engine.execute("1");

  assert.equal(inspected.output.includes("id: thing.alpha"), true);
});

test("workbench controller pins inspected records and activates typed references", async () => {
  const state = makeState();
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  await controller.executeCommand("search alpha");
  await controller.dispatchIntent({ type: "set-left-cursor", index: 0 });
  let next = await controller.dispatchIntent({ type: "activate-primary" });
  const pinnedTargetId = next.snapshot.rightPane.target.id;

  next = await controller.dispatchIntent({ type: "set-left-cursor", index: 1 });
  assert.equal(next.snapshot.rightPane.target.id, pinnedTargetId);

  await controller.dispatchIntent({ type: "set-focused-pane", pane: "right" });
  await controller.dispatchIntent({ type: "set-inspector-tab", tab: "references" });
  next = await controller.dispatchIntent({ type: "activate-primary" });

  assert.equal(next.snapshot.path, "context:backend/runtime");
  assert.equal(next.snapshot.rightPane.target.id, "backend/runtime");
  assert.equal(next.snapshot.rightPane.target.kind, "context");
});

test("workbench controller can open source representations from references and direct commands", async () => {
  const state = makeState();
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  await controller.executeCommand("search alpha");
  await controller.dispatchIntent({ type: "set-left-cursor", index: 0 });
  await controller.dispatchIntent({ type: "activate-primary" });
  await controller.dispatchIntent({ type: "set-focused-pane", pane: "right" });
  await controller.dispatchIntent({ type: "set-inspector-tab", tab: "references" });
  await controller.dispatchIntent({ type: "set-right-cursor", index: 1 });

  let next = await controller.dispatchIntent({ type: "activate-primary" });
  assert.equal(next.snapshot.rightPane.tab, "source");
  assert.equal(next.snapshot.rightPane.target.kind, "source");
  assert.equal(next.snapshot.rightPane.bodyLines.some(line => line.includes("path: C:/tmp/world/alpha.rvm")), true);

  next = await controller.executeCommand("provenance thing.alpha");
  assert.equal(next.snapshot.rightPane.tab, "provenance");
  assert.equal(next.snapshot.rightPane.provenanceEntries.length >= 1, true);
  assert.equal(next.snapshot.rightPane.bodyLines.some(line => line.includes("active entry:")), true);
});

test("workbench controller activates source rows from the source tab", async () => {
  const state = makeState();
  state.recordIndex.get("thing.alpha").sourceHints = [
    {
      file: "C:/tmp/world/alpha-one.rvm",
      line: 3,
      section: "view",
      sourceLanguage: "rvm"
    },
    {
      file: "C:/tmp/world/alpha-two.rvm",
      line: 19,
      section: "trait",
      sourceLanguage: "rvm"
    }
  ];
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  let next = await controller.executeCommand("source thing.alpha");
  assert.equal(next.snapshot.rightPane.tab, "source");
  assert.equal(next.snapshot.rightPane.sourceEntries.length, 2);
  assert.equal(next.snapshot.rightPane.cursor, 0);

  await controller.dispatchIntent({ type: "set-focused-pane", pane: "right" });
  await controller.dispatchIntent({ type: "set-inspector-tab", tab: "source" });
  await controller.dispatchIntent({ type: "set-right-cursor", index: 1 });
  next = await controller.dispatchIntent({ type: "activate-primary" });

  assert.equal(next.snapshot.rightPane.tab, "source");
  assert.equal(next.snapshot.rightPane.cursor, 1);
  assert.equal(next.snapshot.rightPane.bodyLines.some(line => line.includes("path: C:/tmp/world/alpha-two.rvm")), true);
});

test("workbench controller activates provenance source rows from the provenance tab", async () => {
  const state = makeState();
  state.recordIndex.get("thing.alpha").sourceHints = [
    {
      file: "C:/tmp/world/alpha-one.rvm",
      line: 3,
      section: "view",
      sourceLanguage: "rvm"
    },
    {
      file: "C:/tmp/world/alpha-two.rvm",
      line: 19,
      section: "trait",
      sourceLanguage: "rvm"
    }
  ];
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  let next = await controller.executeCommand("provenance thing.alpha");
  assert.equal(next.snapshot.rightPane.tab, "provenance");
  assert.equal(next.snapshot.rightPane.provenanceEntries.length, 2);

  await controller.dispatchIntent({ type: "set-focused-pane", pane: "right" });
  await controller.dispatchIntent({ type: "set-inspector-tab", tab: "provenance" });
  await controller.dispatchIntent({ type: "set-right-cursor", index: 1 });
  next = await controller.dispatchIntent({ type: "activate-primary" });

  assert.equal(next.snapshot.rightPane.tab, "source");
  assert.equal(next.snapshot.rightPane.bodyLines.some(line => line.includes("path: C:/tmp/world/alpha-two.rvm")), true);
});

test("workbench controller escape unwinds number buffer, help, references, and results in order", async () => {
  const state = makeState();
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  await controller.executeCommand("search alpha");
  await controller.dispatchIntent({ type: "append-digit", digit: "1" });
  await controller.dispatchIntent({ type: "toggle-help" });
  await controller.dispatchIntent({ type: "set-inspector-tab", tab: "references" });

  let next = await controller.dispatchIntent({ type: "escape" });
  assert.equal(next.snapshot.ui.numberBuffer, "");
  assert.equal(next.snapshot.ui.helpOpen, true);
  assert.equal(next.snapshot.ui.inspectorTab, "references");

  next = await controller.dispatchIntent({ type: "escape" });
  assert.equal(next.snapshot.ui.helpOpen, false);
  assert.equal(next.snapshot.ui.inspectorTab, "references");

  next = await controller.dispatchIntent({ type: "escape" });
  assert.equal(next.snapshot.ui.inspectorTab, "inspect");

  next = await controller.dispatchIntent({ type: "escape" });
  assert.equal(next.snapshot.leftPane.mode, "tree");
});

test("workbench controller persists updated display settings through the host seam", async () => {
  const state = makeState();
  const engine = createOperatorTuiEngine(state);
  const saved = [];
  const controller = createOperatorWorkbenchController({
    state,
    engine,
    saveDisplaySettings: async settings => {
      saved.push(settings);
      return settings;
    }
  });

  const updated = await controller.updateDisplaySettings({
    fontSize: 18,
    colorMode: "on",
    pageSize: 30
  });
  assert.equal(saved.length, 1);
  assert.equal(updated.snapshot.ui.displaySettings.fontSize, 18);
  assert.equal(updated.snapshot.ui.displaySettings.colorMode, "on");
  assert.equal(updated.snapshot.ui.displaySettings.pageSize, 30);
});

test("workbench controller exposes navigation chips and supports top-pane breadcrumb navigation", async () => {
  const state = makeState();
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  await controller.executeCommand("open world");
  await controller.executeCommand("open things");
  await controller.executeCommand("search alpha");

  let next = await controller.snapshot();
  assert.deepEqual(next.topPane.navigation.chips.map(chip => chip.type), ["root", "path", "path", "preview", "view", "mode"]);

  await controller.dispatchIntent({ type: "set-focused-pane", pane: "top" });
  await controller.dispatchIntent({ type: "set-top-cursor", index: 1 });
  next = await controller.dispatchIntent({ type: "activate-primary" });

  assert.equal(next.snapshot.leftPane.mode, "tree");
  assert.equal(next.snapshot.path, "World");
  assert.equal(next.snapshot.topPane.navigation.chips.some(chip => chip.type === "view"), false);
});

test("workbench controller cycles inspector modes and escapes back from the top pane", async () => {
  const state = makeState();
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  await controller.executeCommand("search alpha");
  await controller.dispatchIntent({ type: "set-left-cursor", index: 0 });
  await controller.dispatchIntent({ type: "activate-primary" });
  await controller.dispatchIntent({ type: "set-focused-pane", pane: "right" });
  await controller.dispatchIntent({ type: "set-inspector-tab", tab: "references" });
  await controller.dispatchIntent({ type: "set-focused-pane", pane: "top" });

  let next = await controller.snapshot();
  const modeIndex = next.topPane.navigation.chips.findIndex(chip => chip.type === "mode");
  assert.equal(modeIndex >= 0, true);

  await controller.dispatchIntent({ type: "set-top-cursor", index: modeIndex });
  next = await controller.dispatchIntent({ type: "activate-primary" });
  assert.equal(next.snapshot.rightPane.tab, "inspect");

  next = await controller.dispatchIntent({ type: "escape" });
  assert.equal(next.snapshot.ui.focusedPane, "right");
  assert.equal(next.snapshot.rightPane.tab, "inspect");
});

test("engine link output includes typed operator URIs and open-link reopens source targets", async () => {
  const state = makeState();
  const engine = createOperatorTuiEngine(state);

  let result = await engine.execute("link thing.alpha");
  assert.equal(result.output.includes("uri: operator://record/world/thing.alpha"), true);

  result = await engine.execute("open-link operator://source/world/thing.alpha?file=C%3A%2Ftmp%2Fworld%2Falpha.rvm&line=3");
  assert.equal(result.output.includes("path: C:/tmp/world/alpha.rvm"), true);
  assert.equal(result.ui?.inspectorTab, "source");
});

test("engine open-link restores saved result views", async () => {
  const state = makeState();
  const engine = createOperatorTuiEngine(state);

  await engine.execute("search alpha");
  await engine.execute("view save alpha-view");
  const result = await engine.execute("open-link operator://view/alpha-view");

  assert.equal(engine.session.resultView?.activeViewName, "alpha-view");
  assert.equal(result.ui?.rightScreenMode, "custom-screen");
  assert.equal(result.ui?.activeScreenId, "inspect");
});

test("engine screen commands expose source and provenance custom screens for the shell adapter", async () => {
  const state = makeState();
  const engine = createOperatorTuiEngine(state);

  let result = await engine.execute("inspect thing.alpha");
  assert.equal(result.ui?.inspectorSpec?.targetId, "thing.alpha");

  result = await engine.execute("screen source");
  assert.equal(result.ui?.rightScreenMode, "custom-screen");
  assert.equal(result.ui?.activeScreenId, "source");
  assert.equal(result.ui?.inspectorTab, "source");

  result = await engine.execute("screen provenance");
  assert.equal(result.ui?.rightScreenMode, "custom-screen");
  assert.equal(result.ui?.activeScreenId, "provenance");
  assert.equal(result.ui?.inspectorTab, "provenance");
});

test("engine screen command lists available authored screens and opens them", async () => {
  const state = withAuthoredScreen(makeState(), {
    screenId: "trace",
    provider: "provenance",
    rowFilterAction: "open-source"
  });
  const engine = createOperatorTuiEngine(state);

  let result = await engine.execute("screen");
  assert.equal(result.output.includes("trace [F5]"), true);

  result = await engine.execute("screen trace thing.alpha");
  assert.equal(result.ui?.rightScreenMode, "custom-screen");
  assert.equal(result.ui?.activeScreenId, "trace");
  assert.equal(result.ui?.inspectorTab, "trace");
});

test("workbench controller opens the generic references screen on F2 and activates rows through operator URIs", async () => {
  const state = makeState();
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  await controller.executeCommand("search alpha");
  await controller.dispatchIntent({ type: "set-left-cursor", index: 0 });
  await controller.dispatchIntent({ type: "activate-primary" });
  await controller.dispatchIntent({ type: "set-right-screen-mode", mode: "custom-screen", screenId: "references" });

  const next = await controller.snapshot();
  assert.equal(next.rightPane.screenMode, "custom-screen");
  assert.equal(next.rightPane.activeScreenId, "references");
  assert.equal(next.rightPane.screen.rows.some(row => row.uri?.startsWith("operator://source/")), true);

  const sourceIndex = next.rightPane.screen.rows.findIndex(row => row.uri?.startsWith("operator://source/"));
  await controller.dispatchIntent({ type: "set-focused-pane", pane: "right" });
  await controller.dispatchIntent({ type: "set-right-cursor", index: sourceIndex });
  const activated = await controller.dispatchIntent({ type: "activate-primary" });

  assert.equal(activated.snapshot.rightPane.screenMode, "custom-screen");
  assert.equal(activated.snapshot.rightPane.activeScreenId, "source");
  assert.equal(activated.snapshot.rightPane.tab, "source");
  assert.equal(activated.snapshot.rightPane.bodyLines.some(line => line.includes("path: C:/tmp/world/alpha.rvm")), true);
});

test("workbench controller opens built-in source and provenance custom screens and preserves in-place activation", async () => {
  const state = makeState();
  state.recordIndex.get("thing.alpha").sourceHints = [
    {
      file: "C:/tmp/world/alpha-one.rvm",
      line: 3,
      section: "view",
      sourceLanguage: "rvm"
    },
    {
      file: "C:/tmp/world/alpha-two.rvm",
      line: 19,
      section: "trait",
      sourceLanguage: "rvm"
    }
  ];
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  await controller.executeCommand("search alpha");
  await controller.dispatchIntent({ type: "set-left-cursor", index: 0 });
  await controller.dispatchIntent({ type: "activate-primary" });
  await controller.dispatchIntent({ type: "set-focused-pane", pane: "right" });

  let next = await controller.dispatchIntent({ type: "set-right-screen-mode", mode: "custom-screen", screenId: "source" });
  assert.equal(next.snapshot.rightPane.screenMode, "custom-screen");
  assert.equal(next.snapshot.rightPane.activeScreenId, "source");
  assert.equal(next.snapshot.rightPane.screen.rows.length, 2);

  await controller.dispatchIntent({ type: "set-right-cursor", index: 1 });
  next = await controller.dispatchIntent({ type: "activate-primary" });
  assert.equal(next.snapshot.rightPane.screenMode, "custom-screen");
  assert.equal(next.snapshot.rightPane.activeScreenId, "source");
  assert.equal(next.snapshot.rightPane.screen.detailLines.some(line => line.includes("path: C:/tmp/world/alpha-two.rvm")), true);

  next = await controller.dispatchIntent({ type: "set-right-screen-mode", mode: "custom-screen", screenId: "provenance" });
  assert.equal(next.snapshot.rightPane.screenMode, "custom-screen");
  assert.equal(next.snapshot.rightPane.activeScreenId, "provenance");
  assert.equal(next.snapshot.rightPane.screen.rows.length >= 1, true);

  const sourceRowIndex = next.snapshot.rightPane.screen.rows.findIndex(row => row.actionKind === "open-source");
  assert.equal(sourceRowIndex >= 0, true);
  await controller.dispatchIntent({ type: "set-right-cursor", index: sourceRowIndex });
  next = await controller.dispatchIntent({ type: "activate-primary" });
  assert.equal(next.snapshot.rightPane.screenMode, "custom-screen");
  assert.equal(next.snapshot.rightPane.activeScreenId, "source");
  assert.equal(next.snapshot.rightPane.screen.detailLines.some(line => line.includes("path: C:/tmp/world/alpha")), true);
});

test("workbench controller opens authored custom screens and preserves screen mode on activation", async () => {
  const state = withAuthoredScreen(makeState(), {
    screenId: "trace",
    provider: "provenance",
    rowFilterAction: "open-source"
  });
  state.recordIndex.get("thing.alpha").sourceHints = [
    {
      file: "C:/tmp/world/alpha-one.rvm",
      line: 3,
      section: "view",
      sourceLanguage: "rvm"
    }
  ];
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  await controller.executeCommand("inspect thing.alpha");
  let next = await controller.executeCommand("screen trace");
  assert.equal(next.snapshot.rightPane.screenMode, "custom-screen");
  assert.equal(next.snapshot.rightPane.activeScreenId, "trace");
  assert.equal(next.snapshot.rightPane.screen.rows.some(row => row.actionKind === "open-source"), true);

  const rowIndex = next.snapshot.rightPane.screen.rows.findIndex(row => row.actionKind === "open-source");
  await controller.dispatchIntent({ type: "set-focused-pane", pane: "right" });
  await controller.dispatchIntent({ type: "set-right-cursor", index: rowIndex });
  next = await controller.dispatchIntent({ type: "activate-primary" });
  assert.equal(next.snapshot.rightPane.screenMode, "custom-screen");
  assert.equal(next.snapshot.rightPane.activeScreenId, "source");
  assert.equal(next.snapshot.rightPane.screen.detailLines.some(line => line.includes("path: C:/tmp/world/alpha-one.rvm")), true);
});

test("workbench controller normalizes sectioned authored screens and activates the first actionable section", async () => {
  const state = withAuthoredScreen(makeState(), {
    provider: "references",
    columns: ["kind", "label", "detail"],
    sections: [
      { id: "trace.summary", title: "Summary", kind: "detail", dataSource: "inspect", priority: 1 },
      { id: "trace.meta", title: "Meta", kind: "kv", dataSource: "inspect", priority: 2 },
      { id: "trace.links", title: "Links", kind: "table", dataset: "trace.dataset", priority: 3 }
    ]
  });
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  const next = await controller.executeCommand("screen trace thing.alpha");

  assert.equal(next.snapshot.rightPane.activeScreenId, "trace");
  assert.equal(next.snapshot.rightPane.screen.sections.length, 3);
  assert.deepEqual(next.snapshot.rightPane.screen.sections.map(section => section.kind), ["detail", "kv", "table"]);
  assert.equal(next.snapshot.rightPane.screen.activeSectionIndex, 2);
  assert.equal(next.snapshot.rightPane.screen.sections[1].rows.some(row => row.columns?.key === "title"), true);
  assert.equal(next.snapshot.rightPane.screen.rows.some(row => String(row.primaryCommand || "").startsWith("open-link ")), true);
});

test("workbench controller honors authored default sections on first open", async () => {
  const state = withAuthoredScreen(makeState(), {
    provider: "references",
    columns: ["kind", "label", "detail"],
    defaultSectionId: "trace.meta",
    sections: [
      { id: "trace.summary", title: "Summary", kind: "detail", dataSource: "inspect", priority: 1 },
      { id: "trace.meta", title: "Meta", kind: "kv", dataSource: "inspect", priority: 2 },
      { id: "trace.links", title: "Links", kind: "table", dataset: "trace.dataset", priority: 3 }
    ]
  });
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  const next = await controller.executeCommand("screen trace thing.alpha");

  assert.equal(next.snapshot.rightPane.screen.activeSectionIndex, 1);
  assert.equal(next.snapshot.rightPane.screen.activeSectionId, "trace.meta");
  assert.equal(next.snapshot.rightPane.activeSection?.id, "trace.meta");
  assert.equal(next.snapshot.rightPane.activeSection?.actionable, false);
  assert.equal(next.snapshot.rightPane.screen.sections[1].rows.some(row => row.columns?.key === "title"), true);
});

test("workbench controller remembers per-section cursors and can collapse the active section", async () => {
  const state = withAuthoredScreen(makeState(), {
    provider: "references",
    columns: ["kind", "label", "detail"],
    sections: [
      { id: "trace.sources", title: "Sources", kind: "table", dataSource: "source", priority: 1 },
      { id: "trace.links", title: "Links", kind: "table", dataset: "trace.dataset", priority: 2 }
    ]
  });
  state.recordIndex.get("thing.alpha").sourceHints = [
    { file: "C:/tmp/world/alpha-one.rvm", line: 3, section: "view", sourceLanguage: "rvm" },
    { file: "C:/tmp/world/alpha-two.rvm", line: 19, section: "route", sourceLanguage: "rvm" }
  ];
  const engine = createOperatorTuiEngine(state);
  const controller = createOperatorWorkbenchController({ state, engine });

  await controller.executeCommand("screen trace thing.alpha");
  await controller.dispatchIntent({ type: "set-focused-pane", pane: "right" });
  await controller.dispatchIntent({ type: "set-right-cursor", index: 1 });
  let next = await controller.dispatchIntent({ type: "move-right-section", direction: "next" });
  assert.equal(next.snapshot.rightPane.screen.activeSectionId, "trace.links");
  next = await controller.dispatchIntent({ type: "move-right-section", direction: "prev" });
  assert.equal(next.snapshot.rightPane.screen.activeSectionId, "trace.sources");
  assert.equal(next.snapshot.rightPane.screen.activeRowIndex, 1);

  next = await controller.dispatchIntent({ type: "collapse-right-section" });
  assert.equal(next.snapshot.rightPane.screen.rows.length, 0);

  next = await controller.dispatchIntent({ type: "escape" });
  assert.equal(next.snapshot.rightPane.screen.rows.length > 0, true);
});

test("operator TUI raw shell section commands switch and collapse authored sections", async () => {
  const state = withAuthoredScreen(makeState(), {
    provider: "references",
    columns: ["kind", "label", "detail"],
    sections: [
      { id: "trace.summary", title: "Summary", kind: "detail", dataSource: "inspect", priority: 1 },
      { id: "trace.links", title: "Links", kind: "table", dataset: "trace.dataset", priority: 2 }
    ]
  });
  const engine = createOperatorTuiEngine(state);

  await engine.execute("screen trace thing.alpha");
  let result = await engine.execute("section");
  assert.match(result.output, /Trace sections/);
  assert.match(result.output, /active=Links \| rows=3 \| state=expanded \| actionable/);
  assert.match(result.output, /\[\*\s\]/);

  result = await engine.execute("section 2");
  assert.match(result.output, /\[\*\s\] 2\. Links/);

  result = await engine.execute("section collapse");
  assert.match(result.output, /Links <table> rows=\d+ state=actionable id=trace.links/);
  assert.match(result.output, /\[\*-]/);
});

test("renderOperatorWorkbenchState renders dynamic result columns and ASCII-safe markers", () => {
  const { documentTarget, elements } = makeFakeDocument();
  renderOperatorWorkbenchState({
    snapshot: {
      path: "root",
      focus: { active: false, kind: null, id: null },
      preview: { available: false, status: "inactive" },
      topPane: {
        title: "Operator Workbench",
        subtitle: "global",
        navigation: {
          selectedIndex: 0,
          chips: [
            { type: "root", label: "root", tone: "default", active: true, helpText: "Return to root." },
            { type: "preview", label: "preview unavailable", tone: "muted", active: false, helpText: "Preview unavailable." },
            { type: "mode", label: "Inspect", tone: "default", active: true, helpText: "Inspect mode." }
          ]
        }
      },
      leftPane: {
        mode: "results",
        title: "Search Results",
        header: 'query="alpha"',
        columns: ["title", "id"],
        cursor: 0,
        rows: [{
          index: 1,
          type: "record",
          label: "Alpha",
          summary: "backend/runtime",
          selected: true,
          columns: { title: "Alpha", id: "thing.alpha" }
        }]
      },
      rightPane: {
        title: "Inspector",
        tab: "inspect",
        bodyLines: ["Alpha", "id: thing.alpha"],
        references: [],
        cursor: 0,
        tabs: {
          inspect: true,
          references: true,
          source: true,
          provenance: true
        },
        target: {
          kind: "record",
          id: "thing.alpha",
          mode: "record",
          previewBacked: true,
          sourceBacked: true
        }
      },
      ui: {
        focusedPane: "left",
        inspectorTab: "inspect",
        helpOpen: true,
        numberBuffer: "12",
        lastOutput: "Ready.",
        lastStatus: "info",
        displaySettings: {
          fontSize: 14,
          paneSplit: 0.42,
          rowDensity: "comfortable",
          colorMode: "auto"
        }
      }
    },
    documentTarget,
    commandDraft: "",
    autocomplete: { preview: "", matches: [] }
  });

  assert.equal(elements.get("operator-left-rows").innerHTML.includes("repeat(2, minmax(0, 1fr))"), true);
  assert.equal(elements.get("operator-left-rows").innerHTML.includes('data-selected="true"'), true);
  assert.equal(elements.get("operator-nav-strip").innerHTML.includes('data-nav-chip="0"'), true);
  assert.equal(elements.get("operator-nav-meta").textContent.includes("Return to root"), true);
  assert.equal(elements.get("operator-left-rows").innerHTML.includes("â"), false);
  assert.equal(elements.get("operator-help-summary").textContent.includes("Move the active row"), true);
});

test("renderOperatorWorkbenchState renders the built-in inspect detail screen", () => {
  const { documentTarget, elements } = makeFakeDocument();
  renderOperatorWorkbenchState({
    snapshot: {
      path: "root",
      focus: { active: false, kind: null, id: null },
      preview: { available: true, status: "active" },
      topPane: { title: "Operator Workbench", subtitle: "global" },
      leftPane: {
        mode: "tree",
        title: "Tree",
        header: "root",
        columns: [],
        cursor: 0,
        rows: []
      },
      rightPane: {
        title: "Alpha",
        screenMode: "custom-screen",
        activeScreenId: "inspect",
        tab: "inspect",
        bodyLines: ["Alpha"],
        screen: {
          title: "Alpha",
          shape: "detail",
          rows: [],
          activeRowIndex: 0,
          detailLines: [
            "Alpha",
            "id: thing.alpha",
            "kind: thing"
          ]
        },
        cursor: 0,
        tabs: {
          inspect: true,
          references: true,
          source: true,
          provenance: true
        },
        target: {
          kind: "record",
          id: "thing.alpha",
          mode: "record"
        }
      },
      ui: {
        focusedPane: "right",
        inspectorTab: "inspect",
        rightScreenMode: "custom-screen",
        helpOpen: false,
        numberBuffer: "",
        lastOutput: "Ready.",
        lastStatus: "info",
        displaySettings: {
          fontSize: 14,
          paneSplit: 0.42,
          rowDensity: "comfortable",
          colorMode: "auto"
        }
      }
    },
    documentTarget,
    commandDraft: "",
    autocomplete: { preview: "", matches: [] }
  });

  assert.equal(elements.get("operator-custom-screen-body").hidden, false);
  assert.equal(elements.get("operator-custom-screen-body").innerHTML.includes("id: thing.alpha"), true);
  assert.equal(elements.get("operator-tab-inspect").dataset.active, "true");
});

test("renderOperatorWorkbenchState renders the built-in source custom screen", () => {
  const { documentTarget, elements } = makeFakeDocument();
  renderOperatorWorkbenchState({
    snapshot: {
      path: "root",
      focus: { active: false, kind: null, id: null },
      preview: { available: true, status: "active" },
      topPane: { title: "Operator Workbench", subtitle: "global" },
      leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
      rightPane: {
        title: "Alpha Source",
        screenMode: "custom-screen",
        activeScreenId: "source",
        tab: "source",
        bodyLines: ["Alpha"],
        screen: {
          title: "Alpha Source",
          shape: "list-detail",
          rows: [
            {
              label: "C:/tmp/world/alpha-one.rvm:3",
              detail: "record-hint | view | rvm",
              sourcePath: "C:/tmp/world/alpha-one.rvm",
              sourceLine: 3,
              primaryCommand: "source thing.alpha"
            },
            {
              label: "C:/tmp/world/alpha-two.rvm:19",
              detail: "record-hint | trait | rvm",
              sourcePath: "C:/tmp/world/alpha-two.rvm",
              sourceLine: 19,
              primaryCommand: "source thing.alpha"
            }
          ],
          activeRowIndex: 1,
          detailLines: [
            "Alpha Source",
            "path: C:/tmp/world/alpha-two.rvm",
            "excerpt:",
            ">    19 | route('/alpha')"
          ]
        },
        sourceEntries: [],
        provenanceEntries: [],
        references: [],
        cursor: 1,
        tabs: { inspect: true, references: true, source: true, provenance: true },
        target: { kind: "source", id: "thing.alpha", mode: "source" }
      },
      ui: {
        focusedPane: "right",
        inspectorTab: "source",
        rightScreenMode: "custom-screen",
        helpOpen: false,
        numberBuffer: "",
        lastOutput: "Ready.",
        lastStatus: "info",
        displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto" }
      }
    },
    documentTarget,
    commandDraft: "",
    autocomplete: { preview: "", matches: [] }
  });

  assert.equal(elements.get("operator-custom-screen-body").hidden, false);
  assert.equal(elements.get("operator-custom-screen-body").innerHTML.includes('data-custom-screen-row="1"'), true);
  assert.equal(elements.get("operator-custom-screen-body").innerHTML.includes("alpha-two.rvm"), true);
  assert.equal(elements.get("operator-custom-screen-body").innerHTML.includes("route(&#39;/alpha&#39;)"), true);
});

test("renderOperatorWorkbenchState keeps fixed tabs active from the active screen id", () => {
  const { documentTarget, elements } = makeFakeDocument();
  renderOperatorWorkbenchState({
    snapshot: {
      path: "root",
      focus: { active: false, kind: null, id: null },
      preview: { available: true, status: "active" },
      topPane: { title: "Operator Workbench", subtitle: "global" },
      leftPane: {
        mode: "tree",
        title: "Tree",
        header: "root",
        columns: [],
        cursor: 0,
        rows: []
      },
      rightPane: {
        title: "Alpha Provenance",
        screenMode: "custom-screen",
        activeScreenId: "provenance",
        tab: "provenance",
        bodyLines: ["Alpha"],
        screen: {
          title: "Alpha Provenance",
          shape: "list-detail",
          rows: [
            {
              kind: "source",
              label: "C:/tmp/world/alpha-two.rvm:19",
              detail: "trait | rvm | open-source",
              primaryCommand: "source thing.alpha"
            }
          ],
          activeRowIndex: 0,
          detailLines: [
            "active entry:",
            "kind: source",
            "label: C:/tmp/world/alpha-two.rvm:19",
            "action: open-source"
          ]
        },
        cursor: 1,
        tabs: {
          inspect: true,
          references: true,
          source: true,
          provenance: true
        },
        target: {
          kind: "provenance",
          id: "thing.alpha",
          mode: "provenance"
        }
      },
      ui: {
        focusedPane: "right",
        inspectorTab: "provenance",
        helpOpen: false,
        numberBuffer: "",
        lastOutput: "Ready.",
        lastStatus: "info",
        displaySettings: {
          fontSize: 14,
          paneSplit: 0.42,
          rowDensity: "comfortable",
          colorMode: "auto"
        }
      }
    },
    documentTarget,
    commandDraft: "",
    autocomplete: { preview: "", matches: [] }
  });

  assert.equal(elements.get("operator-tab-provenance").dataset.active, "true");
  assert.equal(elements.get("operator-custom-screen-body").innerHTML.includes("[SOURCE]"), true);
  assert.equal(elements.get("operator-custom-screen-body").innerHTML.includes("action: open-source"), true);
});

test("renderOperatorWorkbenchState renders the built-in references custom screen", () => {
  const { documentTarget, elements } = makeFakeDocument();
  renderOperatorWorkbenchState({
    snapshot: {
      path: "root",
      focus: { active: false, kind: null, id: null },
      preview: { available: true, status: "active" },
      topPane: {
        title: "Operator Workbench",
        subtitle: "global",
        navigation: {
          selectedIndex: 0,
          chips: [
            { type: "root", label: "root", tone: "default", active: true, helpText: "Return to root." }
          ]
        }
      },
      leftPane: {
        mode: "tree",
        title: "Tree",
        header: "root",
        columns: [],
        cursor: 0,
        rows: []
      },
      rightPane: {
        title: "Alpha References",
        screenMode: "custom-screen",
        activeScreenId: "references",
        tab: "references",
        bodyLines: ["Alpha"],
        references: [],
        screen: {
          title: "Alpha References",
          shape: "list-detail",
          rows: [
            {
              kind: "source",
              label: "C:/tmp/world/alpha.rvm:3",
              detail: "record-hint | view",
              actionable: true,
              uri: "operator://source/world/thing.alpha?file=C%3A%2Ftmp%2Fworld%2Falpha.rvm&line=3",
              primaryCommand: "open-link operator://source/world/thing.alpha?file=C%3A%2Ftmp%2Fworld%2Falpha.rvm&line=3"
            }
          ],
          activeRowIndex: 0,
          detailLines: [
            "SOURCE C:/tmp/world/alpha.rvm:3",
            "action: open",
            "uri: operator://source/world/thing.alpha?file=C%3A%2Ftmp%2Fworld%2Falpha.rvm&line=3"
          ]
        },
        sourceEntries: [],
        provenanceEntries: [],
        cursor: 0,
        tabs: {
          inspect: true,
          references: true,
          source: true,
          provenance: true
        },
        target: {
          kind: "record",
          id: "thing.alpha",
          mode: "record"
        }
      },
      ui: {
        focusedPane: "right",
        inspectorTab: "references",
        rightScreenMode: "custom-screen",
        helpOpen: false,
        numberBuffer: "",
        lastOutput: "Ready.",
        lastStatus: "info",
        displaySettings: {
          fontSize: 14,
          paneSplit: 0.42,
          rowDensity: "comfortable",
          colorMode: "auto"
        }
      }
    },
    documentTarget,
    commandDraft: "",
    autocomplete: { preview: "", matches: [] }
  });

  assert.equal(elements.get("operator-custom-screen-body").hidden, false);
  assert.equal(elements.get("operator-custom-screen-body").innerHTML.includes('data-custom-screen-row="0"'), true);
  assert.equal(elements.get("operator-custom-screen-body").innerHTML.includes("operator://source/world/thing.alpha"), true);
});

test("renderOperatorWorkbenchState renders the built-in provenance custom screen", () => {
  const { documentTarget, elements } = makeFakeDocument();
  renderOperatorWorkbenchState({
    snapshot: {
      path: "root",
      focus: { active: false, kind: null, id: null },
      preview: { available: true, status: "active" },
      topPane: { title: "Operator Workbench", subtitle: "global" },
      leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
      rightPane: {
        title: "Alpha Provenance",
        screenMode: "custom-screen",
        activeScreenId: "provenance",
        tab: "provenance",
        bodyLines: ["Alpha"],
        screen: {
          title: "Alpha Provenance",
          shape: "list-detail",
          rows: [
            {
              kind: "source",
              label: "C:/tmp/world/alpha-two.rvm:19",
              detail: "trait | rvm | open-source",
              actionable: true,
              primaryCommand: "source thing.alpha"
            }
          ],
          activeRowIndex: 0,
          detailLines: [
            "active entry:",
            "kind: source",
            "label: C:/tmp/world/alpha-two.rvm:19",
            "action: open-source"
          ]
        },
        sourceEntries: [],
        provenanceEntries: [],
        references: [],
        cursor: 0,
        tabs: { inspect: true, references: true, source: true, provenance: true },
        target: { kind: "provenance", id: "thing.alpha", mode: "provenance" }
      },
      ui: {
        focusedPane: "right",
        inspectorTab: "provenance",
        rightScreenMode: "custom-screen",
        helpOpen: false,
        numberBuffer: "",
        lastOutput: "Ready.",
        lastStatus: "info",
        displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto" }
      }
    },
    documentTarget,
    commandDraft: "",
    autocomplete: { preview: "", matches: [] }
  });

  assert.equal(elements.get("operator-custom-screen-body").hidden, false);
  assert.equal(elements.get("operator-custom-screen-body").innerHTML.includes("[SOURCE]"), true);
  assert.equal(elements.get("operator-custom-screen-body").innerHTML.includes("action: open-source"), true);
});

test("renderOperatorWorkbenchState renders authored custom screen tables", () => {
  const { documentTarget, elements } = makeFakeDocument();
  renderOperatorWorkbenchState({
    snapshot: {
      path: "root",
      focus: { active: false, kind: null, id: null },
      preview: { available: true, status: "active" },
      screens: {
        activeScreenId: "trace",
        available: [],
        shortcuts: [{ shortcut: "F5", screenId: "trace", title: "Trace", origin: "authored" }]
      },
      topPane: { title: "Operator Workbench", subtitle: "global" },
      leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
      rightPane: {
        title: "Trace",
        screenMode: "custom-screen",
        activeScreenId: "trace",
        tab: "provenance",
        bodyLines: [],
        screen: {
          title: "Trace",
          shape: "table-detail",
          dataSource: "provenance",
          columns: ["kind", "action", "target", "detail"],
          rows: [
            {
              kind: "source",
              actionKind: "open-source",
              targetId: "thing.alpha",
              detail: "trait | rvm",
              primaryCommand: "provenance open 1",
              columns: {
                kind: "source",
                action: "open-source",
                target: "thing.alpha",
                detail: "trait | rvm"
              }
            }
          ],
          activeRowIndex: 0,
          detailLines: ["active entry:", "path: C:/tmp/world/alpha.rvm"]
        },
        references: [],
        sourceEntries: [],
        provenanceEntries: [],
        cursor: 0,
        tabs: { inspect: true, references: true, source: true, provenance: true },
        target: { kind: "provenance", id: "thing.alpha", mode: "provenance" }
      },
      ui: {
        focusedPane: "right",
        inspectorTab: "provenance",
        rightScreenMode: "custom-screen",
        helpOpen: false,
        numberBuffer: "",
        lastOutput: "Ready.",
        lastStatus: "info",
        displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto" }
      }
    },
    documentTarget,
    commandDraft: "",
    autocomplete: { preview: "", matches: [] }
  });

  assert.equal(elements.get("operator-custom-screen-body").hidden, false);
  assert.equal(elements.get("operator-custom-screen-body").innerHTML.includes("open-source"), true);
  assert.equal(elements.get("operator-custom-screen-body").innerHTML.includes('data-custom-screen-row="0"'), true);
});

test("renderOperatorWorkbenchState renders stacked screen sections and only activates the chosen section rows", () => {
  const { documentTarget, elements } = makeFakeDocument();
  renderOperatorWorkbenchState({
    snapshot: {
      path: "root",
      focus: { active: false, kind: null, id: null },
      preview: { available: true, status: "active" },
      topPane: { title: "Operator Workbench", subtitle: "global" },
      leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
      rightPane: {
        title: "Trace",
        screenMode: "custom-screen",
        activeScreenId: "trace",
        tab: "trace",
        screen: {
          title: "Trace",
          helpText: "Trace screen.",
          activeSectionIndex: 1,
          sections: [
            {
              id: "summary",
              title: "Summary",
              kind: "detail",
              detailLines: ["Alpha", "id: thing.alpha"],
              emptyMessage: "n/a",
              rows: []
            },
            {
              id: "links",
              title: "Links",
              kind: "table",
              columns: ["kind", "label", "detail"],
              rows: [
                {
                  kind: "source",
                  label: "C:/tmp/world/alpha.rvm:3",
                  detail: "record-hint | view",
                  primaryCommand: "open-link operator://source/world/thing.alpha",
                  columns: {
                    kind: "source",
                    label: "C:/tmp/world/alpha.rvm:3",
                    detail: "record-hint | view"
                  }
                }
              ],
              detailLines: ["SOURCE C:/tmp/world/alpha.rvm:3"],
              emptyMessage: "(no links)"
            }
          ],
          rows: [
            {
              kind: "source",
              label: "C:/tmp/world/alpha.rvm:3",
              detail: "record-hint | view",
              primaryCommand: "open-link operator://source/world/thing.alpha",
              columns: {
                kind: "source",
                label: "C:/tmp/world/alpha.rvm:3",
                detail: "record-hint | view"
              }
            }
          ],
          columns: ["kind", "label", "detail"],
          detailLines: ["SOURCE C:/tmp/world/alpha.rvm:3"]
        },
        cursor: 0,
        tabs: { inspect: true, references: true, source: true, provenance: true },
        target: { kind: "record", id: "thing.alpha", mode: "record" }
      },
      ui: {
        focusedPane: "right",
        inspectorTab: "trace",
        rightScreenMode: "custom-screen",
        helpOpen: false,
        numberBuffer: "",
        lastOutput: "Ready.",
        lastStatus: "info",
        displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto" }
      }
    },
    documentTarget,
    commandDraft: "",
    autocomplete: { preview: "", matches: [] }
  });

  const html = elements.get("operator-custom-screen-body").innerHTML;
  assert.equal(html.includes("Summary"), true);
  assert.equal(html.includes("Links"), true);
  assert.equal(html.includes("data-screen-section-header"), true);
  assert.equal(html.includes("data-screen-section-toggle"), true);
  assert.equal(html.includes('data-custom-screen-row="0"'), true);
});

test("renderOperatorWorkbenchState renders collapsed sections header-only", () => {
  const { documentTarget, elements } = makeFakeDocument();
  renderOperatorWorkbenchState({
    snapshot: {
      path: "root",
      focus: { active: false, kind: null, id: null },
      preview: { available: true, status: "active" },
      topPane: { title: "Operator Workbench", subtitle: "global" },
      leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
      rightPane: {
        title: "Trace",
        screenMode: "custom-screen",
        activeScreenId: "trace",
        activeSection: {
          id: "summary",
          title: "Summary",
          rowCount: 0,
          actionable: false,
          collapsible: true,
          collapsed: true
        },
        tab: "trace",
        screen: {
          title: "Trace",
          activeSectionIndex: 0,
          sections: [
            {
              id: "summary",
              title: "Summary",
              kind: "detail",
              collapsed: true,
              rows: [],
              detailLines: ["Alpha"]
            }
          ],
          rows: [],
          activeRowIndex: 0,
          detailLines: ["Summary is collapsed."]
        },
        cursor: 0,
        tabs: { inspect: true, references: true, source: true, provenance: true },
        target: { kind: "record", id: "thing.alpha", mode: "record" }
      },
      ui: {
        focusedPane: "right",
        inspectorTab: "trace",
        rightScreenMode: "custom-screen",
        helpOpen: false,
        numberBuffer: "",
        lastOutput: "Ready.",
        lastStatus: "info",
        displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto" }
      }
    },
    documentTarget,
    commandDraft: "",
    autocomplete: { preview: "", matches: [] }
  });

  const html = elements.get("operator-custom-screen-body").innerHTML;
  assert.equal(html.includes('data-collapsed="true"'), true);
  assert.equal(html.includes('data-custom-screen-row='), false);
  assert.equal(html.includes("data-screen-section-header"), true);
  assert.equal(html.includes("data-screen-section-toggle"), true);
});

test("renderOperatorWorkbenchState preserves right-pane box padding in the canvas buffer", () => {
  const { documentTarget } = makeFakeDocument();
  renderOperatorWorkbenchState({
    snapshot: {
      path: "root",
      focus: { active: false, kind: null, id: null },
      preview: { available: true, status: "active" },
      topPane: { title: "Operator Workbench", subtitle: "global", navigation: { selectedIndex: 0, chips: [] } },
      leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
      rightPane: {
        title: "Trace",
        activeScreenId: "references",
        screen: {
          title: "Trace",
          activeSectionIndex: 0,
          sections: [
            {
              id: "session",
              title: "Session",
              kind: "detail",
              rows: [],
              detailLines: [],
              collapsible: true,
              collapsed: false,
              actionable: false
            }
          ]
        },
        tabs: { inspect: true, references: true, source: true, provenance: true },
        target: { kind: "record", id: "thing.alpha", mode: "record" }
      },
      ui: {
        focusedPane: "right",
        inspectorTab: "references",
        rightScreenMode: "custom-screen",
        helpOpen: false,
        numberBuffer: "",
        lastOutput: "Ready.",
        lastStatus: "info",
        displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto", pageSize: 25 }
      }
    },
    documentTarget,
    commandDraft: "",
    autocomplete: { preview: "", matches: [] }
  });

  const rows = documentTarget.__operatorCanvasState.buffer.map(row => row.map(cell => cell.ch).join(""));
  const headerRow = rows.find(line => line.includes("Session"));
  assert.ok(headerRow);
  assert.match(headerRow, /Session \[-\]\s+\S/);
});

test("renderOperatorWorkbenchState gives left-pane containers a distinct canvas color", () => {
  const { documentTarget } = makeFakeDocument();
  renderOperatorWorkbenchState({
    snapshot: {
      path: "root",
      focus: { active: false, kind: null, id: null },
      preview: { available: true, status: "active" },
      topPane: { title: "Operator Workbench", subtitle: "global", navigation: { selectedIndex: 0, chips: [] } },
      leftPane: {
        mode: "tree",
        title: "Tree",
        header: "root",
        columns: [],
        cursor: 1,
        rows: [
          { index: 1, type: "container", label: "World", summary: "Live modeled world graph", actionable: true },
          { index: 2, type: "record", label: "Alpha", summary: "backend/runtime", actionable: true }
        ]
      },
      rightPane: {
        title: "Inspect",
        activeScreenId: "inspect",
        screen: { title: "Inspect", activeSectionIndex: 0, sections: [] },
        tabs: { inspect: true, references: true, source: true, provenance: true },
        target: { kind: "record", id: "thing.alpha", mode: "record" }
      },
      ui: {
        focusedPane: "left",
        inspectorTab: "inspect",
        rightScreenMode: "custom-screen",
        helpOpen: false,
        numberBuffer: "",
        lastOutput: "Ready.",
        lastStatus: "info",
        displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto", pageSize: 25 }
      }
    },
    documentTarget,
    commandDraft: "",
    autocomplete: { preview: "", matches: [] }
  });

  const state = documentTarget.__operatorCanvasState;
  const rows = state.buffer.map(row => row.map(cell => cell.ch).join(""));
  const worldRowIndex = rows.findIndex(line => line.includes("World"));
  const alphaRowIndex = rows.findIndex(line => line.includes("Alpha"));
  const worldColumnIndex = rows[worldRowIndex].indexOf("World");
  const alphaColumnIndex = rows[alphaRowIndex].indexOf("Alpha");

  assert.equal(state.buffer[worldRowIndex][worldColumnIndex].fg, "#8fd8c5");
  assert.equal(state.buffer[alphaRowIndex][alphaColumnIndex].fg, "#b6ffd7");
});

test("renderOperatorWorkbenchState composes deterministic shared frame junctions", () => {
  const { documentTarget } = makeFakeDocument();
  renderOperatorWorkbenchState({
    snapshot: {
      path: "root",
      focus: { active: false, kind: null, id: null },
      preview: { available: true, status: "active" },
      topPane: { title: "Operator Workbench", subtitle: "global", navigation: { selectedIndex: 0, chips: [] } },
      leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
      rightPane: {
        title: "Trace",
        activeScreenId: "references",
        screen: {
          title: "Trace",
          activeSectionIndex: 0,
          sections: []
        },
        tabs: { inspect: true, references: true, source: true, provenance: true },
        target: { kind: "record", id: "thing.alpha", mode: "record" }
      },
      ui: {
        focusedPane: "right",
        inspectorTab: "references",
        rightScreenMode: "custom-screen",
        helpOpen: false,
        numberBuffer: "",
        lastOutput: "Ready.",
        lastStatus: "info",
        displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto", pageSize: 25 }
      }
    },
    documentTarget,
    commandDraft: "",
    autocomplete: { preview: "", matches: [] }
  });

  const state = documentTarget.__operatorCanvasState;
  const separatorX = Math.floor(state.cols * 0.42) - 1;
  const topSeparatorY = 4;
  const bottomSeparatorY = state.rows - 6;
  assert.equal(state.buffer[topSeparatorY][0].ch, "\u251c");
  assert.equal(state.buffer[topSeparatorY][separatorX].ch, "\u252c");
  assert.equal(state.buffer[topSeparatorY][state.cols - 1].ch, "\u2524");
  assert.equal(state.buffer[topSeparatorY + 1][separatorX].ch, "\u2502");
  assert.equal(state.buffer[bottomSeparatorY][separatorX].ch, "\u2534");
  assert.equal(state.buffer[topSeparatorY][20].fg, "#51665d");
  assert.equal(state.buffer[topSeparatorY][separatorX + 20].fg, "#6ee7a8");
  assert.equal(state.buffer[topSeparatorY + 2][separatorX].fg, "#6ee7a8");
});

test("renderOperatorWorkbenchState surfaces active section context in help copy", () => {
  const { documentTarget, elements } = makeFakeDocument();
  renderOperatorWorkbenchState({
    snapshot: {
      path: "root",
      focus: { active: false, kind: null, id: null },
      preview: { available: true, status: "active" },
      topPane: { title: "Operator Workbench", subtitle: "global" },
      leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
      rightPane: {
        title: "Trace",
        screenMode: "custom-screen",
        activeScreenId: "trace",
        activeSection: {
          id: "links",
          title: "Links",
          rowCount: 3,
          actionable: true,
          collapsible: true,
          collapsed: false
        },
        tab: "trace",
        screen: {
          title: "Trace",
          helpText: null,
          activeSectionIndex: 0,
          sections: [],
          rows: [],
          activeRowIndex: 0,
          detailLines: []
        },
        cursor: 0,
        tabs: { inspect: true, references: true, source: true, provenance: true },
        target: { kind: "record", id: "thing.alpha", mode: "record" }
      },
      ui: {
        focusedPane: "right",
        inspectorTab: "trace",
        rightScreenMode: "custom-screen",
        helpOpen: true,
        numberBuffer: "",
        lastOutput: "Ready.",
        lastStatus: "info",
        displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto" }
      }
    },
    documentTarget,
    commandDraft: "",
    autocomplete: { preview: "", matches: [] }
  });

  assert.equal(elements.get("operator-help-context").textContent.includes("section=Links"), true);
  assert.equal(elements.get("operator-help-summary").textContent.includes("[ and ]"), true);
});

test("startOperatorWorkbenchRuntime reports bridge unavailability clearly", async () => {
  const { documentTarget, elements } = makeFakeDocument();
  const runtime = startOperatorWorkbenchRuntime({
    windowTarget: {},
    documentTarget
  });
  assert.equal(typeof runtime.refresh, "function");
  await runtime.started;
  assert.equal(elements.get("operator-command-input").disabled, true);
  assert.equal(elements.get("operator-last-status").textContent, "error");
  assert.equal(elements.get("operator-last-output").textContent.includes("Operator bridge unavailable"), true);
  assert.equal(elements.get("operator-bootstrap-status").innerHTML.includes("unavailable"), true);
});

test("startOperatorWorkbenchRuntime routes top-pane navigation keys through the bridge", async () => {
  const { documentTarget } = makeFakeDocument();
  const calls = [];
  const snapshot = {
    path: "World/Things",
    focus: { active: false, kind: null, id: null },
    preview: { available: true, status: "active" },
    topPane: {
      title: "Operator Workbench",
      subtitle: "global",
      navigation: {
        selectedIndex: 0,
        chips: [
          { type: "root", label: "root", tone: "default", active: true, helpText: "Return to root." },
          { type: "path", label: "World", tone: "default", active: false, helpText: "Jump to World." },
          { type: "mode", label: "Inspect", tone: "default", active: true, helpText: "Cycle the mode." }
        ]
      }
    },
    leftPane: {
      mode: "tree",
      title: "Tree",
      header: "World/Things",
      columns: [],
      cursor: 0,
      rows: []
    },
    rightPane: {
      title: "Inspector",
      tab: "inspect",
      bodyLines: ["Alpha"],
      references: [],
      sourceEntries: [],
      provenanceEntries: [],
      cursor: 0,
      tabs: {
        inspect: true,
        references: true,
        source: false,
        provenance: false
      },
      target: null
    },
    ui: {
      focusedPane: "left",
      inspectorTab: "inspect",
      helpOpen: false,
      numberBuffer: "",
      lastOutput: "Ready.",
      lastStatus: "info",
      displaySettings: {
        fontSize: 14,
        paneSplit: 0.42,
        rowDensity: "comfortable",
        colorMode: "auto",
        pageSize: 25
      }
    }
  };
  const windowTarget = {
    listeners: new Map(),
    witnessOperatorWorkbench: {
      async getSnapshot() {
        return snapshot;
      },
      async getAutocomplete() {
        return { preview: "", matches: [] };
      },
      async runCommand() {
        return { snapshot };
      },
      async dispatchIntent(intent) {
        calls.push(intent);
        if (intent.type === "set-focused-pane" && intent.pane === "top") snapshot.ui.focusedPane = "top";
        if (intent.type === "move-cursor" && intent.direction === "right") snapshot.topPane.navigation.selectedIndex = 1;
        return { snapshot };
      },
      async updateDisplaySettings() {
        return { snapshot };
      }
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };

  const runtime = startOperatorWorkbenchRuntime({
    windowTarget,
    documentTarget
  });
  await runtime.started;

  const keydown = windowTarget.listeners.get("keydown");
  await keydown({ altKey: true, key: "ArrowUp", preventDefault() {}, target: null });
  await keydown({ altKey: false, key: "ArrowRight", preventDefault() {}, target: null });
  await keydown({ altKey: false, key: "Enter", preventDefault() {}, target: null });

  assert.deepEqual(calls.map(call => call.type), ["set-focused-pane", "move-cursor", "activate-primary"]);
  assert.equal(calls[0].pane, "top");
  assert.equal(calls[1].direction, "right");
});

test("startOperatorWorkbenchRuntime maps F2 to the generic references screen", async () => {
  const { documentTarget } = makeFakeDocument();
  const calls = [];
  const snapshot = {
    path: "root",
    focus: { active: false, kind: null, id: null },
    preview: { available: true, status: "active" },
    topPane: {
      title: "Operator Workbench",
      subtitle: "global",
      navigation: {
        selectedIndex: 0,
        chips: [
          { type: "root", label: "root", tone: "default", active: true, helpText: "Return to root." }
        ]
      }
    },
    leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
    rightPane: {
      title: "Inspector",
      screenMode: "inspector",
      tab: "inspect",
      bodyLines: ["Alpha"],
      references: [],
      referencesWorkbench: { groups: [], rows: [], activeRowIndex: 0, detailLines: [] },
      sourceEntries: [],
      provenanceEntries: [],
      cursor: 0,
      tabs: { inspect: true, references: true, source: false, provenance: false },
      target: null
    },
    ui: {
      focusedPane: "left",
      inspectorTab: "inspect",
      rightScreenMode: "inspector",
      helpOpen: false,
      numberBuffer: "",
      lastOutput: "Ready.",
      lastStatus: "info",
      displaySettings: {
        fontSize: 14,
        paneSplit: 0.42,
        rowDensity: "comfortable",
        colorMode: "auto",
        pageSize: 25
      }
    }
  };
  const windowTarget = {
    listeners: new Map(),
    witnessOperatorWorkbench: {
      async getSnapshot() { return snapshot; },
      async getAutocomplete() { return { preview: "", matches: [] }; },
      async runCommand() { return { snapshot }; },
      async dispatchIntent(intent) {
        calls.push(intent);
        return { snapshot };
      },
      async updateDisplaySettings() { return { snapshot }; }
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };

  const runtime = startOperatorWorkbenchRuntime({ windowTarget, documentTarget });
  await runtime.started;

  const keydown = windowTarget.listeners.get("keydown");
  await keydown({ altKey: false, key: "F2", preventDefault() {}, target: null });

  assert.deepEqual(calls.map(call => `${call.type}:${call.mode ?? ""}:${call.screenId ?? ""}`), [
    "set-focused-pane::",
    "set-right-screen-mode:custom-screen:references"
  ]);
});

test("startOperatorWorkbenchRuntime maps F3 and F4 to source and provenance custom screens", async () => {
  const { documentTarget } = makeFakeDocument();
  const calls = [];
  const snapshot = {
    path: "root",
    focus: { active: false, kind: null, id: null },
    preview: { available: true, status: "active" },
    topPane: {
      title: "Operator Workbench",
      subtitle: "global",
      navigation: {
        selectedIndex: 0,
        chips: [{ type: "root", label: "root", tone: "default", active: true, helpText: "Return to root." }]
      }
    },
    leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
    rightPane: {
      title: "Inspector",
      screenMode: "inspector",
      tab: "inspect",
      bodyLines: ["Alpha"],
      references: [],
      referencesWorkbench: { groups: [], rows: [], activeRowIndex: 0, detailLines: [] },
      sourceWorkbench: { rows: [], activeRowIndex: 0, detailLines: [] },
      provenanceWorkbench: { rows: [], activeRowIndex: 0, detailLines: [] },
      sourceEntries: [],
      provenanceEntries: [],
      cursor: 0,
      tabs: { inspect: true, references: true, source: true, provenance: true },
      target: null
    },
    ui: {
      focusedPane: "left",
      inspectorTab: "inspect",
      rightScreenMode: "inspector",
      helpOpen: false,
      numberBuffer: "",
      lastOutput: "Ready.",
      lastStatus: "info",
      displaySettings: {
        fontSize: 14,
        paneSplit: 0.42,
        rowDensity: "comfortable",
        colorMode: "auto",
        pageSize: 25
      }
    }
  };
  const windowTarget = {
    listeners: new Map(),
    witnessOperatorWorkbench: {
      async getSnapshot() { return snapshot; },
      async getAutocomplete() { return { preview: "", matches: [] }; },
      async runCommand() { return { snapshot }; },
      async dispatchIntent(intent) {
        calls.push(intent);
        return { snapshot };
      },
      async updateDisplaySettings() { return { snapshot }; }
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };

  const runtime = startOperatorWorkbenchRuntime({ windowTarget, documentTarget });
  await runtime.started;

  const keydown = windowTarget.listeners.get("keydown");
  await keydown({ altKey: false, key: "F3", preventDefault() {}, target: null });
  await keydown({ altKey: false, key: "F4", preventDefault() {}, target: null });

  assert.deepEqual(calls.map(call => `${call.type}:${call.mode ?? call.pane}:${call.screenId ?? ""}`), [
    "set-focused-pane:right:",
    "set-right-screen-mode:custom-screen:source",
    "set-focused-pane:right:",
    "set-right-screen-mode:custom-screen:provenance"
  ]);
});

test("startOperatorWorkbenchRuntime maps authored F5 shortcuts to custom screens", async () => {
  const { documentTarget } = makeFakeDocument();
  const calls = [];
  const snapshot = {
    path: "root",
    focus: { active: false, kind: null, id: null },
    preview: { available: true, status: "active" },
    screens: {
      activeScreenId: null,
      available: [{ id: "trace", title: "Trace", subtitle: null, shape: "table-detail", datasetId: "trace.dataset", dataSource: "provenance", shortcut: "F5", origin: "authored" }],
      shortcuts: [{ shortcut: "F5", screenId: "trace", title: "Trace", origin: "authored" }]
    },
    topPane: {
      title: "Operator Workbench",
      subtitle: "global",
      navigation: {
        selectedIndex: 0,
        chips: [{ type: "root", label: "root", tone: "default", active: true, helpText: "Return to root." }]
      }
    },
    leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
    rightPane: {
      title: "Inspector",
      screenMode: "inspector",
      tab: "inspect",
      bodyLines: ["Alpha"],
      references: [],
      sourceEntries: [],
      provenanceEntries: [],
      cursor: 0,
      tabs: { inspect: true, references: true, source: true, provenance: true },
      target: null
    },
    ui: {
      focusedPane: "left",
      inspectorTab: "inspect",
      rightScreenMode: "inspector",
      helpOpen: false,
      numberBuffer: "",
      lastOutput: "Ready.",
      lastStatus: "info",
      displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto", pageSize: 25 }
    }
  };
  const windowTarget = {
    listeners: new Map(),
    witnessOperatorWorkbench: {
      async getSnapshot() { return snapshot; },
      async getAutocomplete() { return { preview: "", matches: [] }; },
      async runCommand() { return { snapshot }; },
      async dispatchIntent(intent) {
        calls.push(intent);
        return { snapshot };
      },
      async updateDisplaySettings() { return { snapshot }; }
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };

  const runtime = startOperatorWorkbenchRuntime({ windowTarget, documentTarget });
  await runtime.started;

  const keydown = windowTarget.listeners.get("keydown");
  await keydown({ altKey: false, key: "F5", preventDefault() {}, target: null });

  assert.deepEqual(calls.map(call => `${call.type}:${call.mode ?? call.pane ?? ""}:${call.screenId ?? ""}`), [
    "set-focused-pane:right:",
    "set-right-screen-mode:custom-screen:trace"
  ]);
});

test("startOperatorWorkbenchRuntime maps right-pane section keys onto section intents", async () => {
  const { documentTarget } = makeFakeDocument();
  const calls = [];
  const snapshot = {
    path: "root",
    focus: { active: false, kind: null, id: null },
    preview: { available: true, status: "active" },
    topPane: { title: "Operator Workbench", subtitle: "global", navigation: { selectedIndex: 0, chips: [] } },
    leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
    rightPane: {
      title: "Trace",
      screenMode: "custom-screen",
      activeScreenId: "trace",
      tab: "trace",
      screen: {
        title: "Trace",
        activeSectionIndex: 0,
        sections: [
          { id: "summary", title: "Summary", kind: "detail", rows: [], detailLines: ["Alpha"], collapsible: true, collapsed: false }
        ],
        rows: [],
        activeRowIndex: 0,
        detailLines: ["Alpha"]
      },
      cursor: 0,
      tabs: { inspect: true, references: true, source: true, provenance: true },
      target: { kind: "record", id: "thing.alpha", mode: "record" }
    },
    ui: {
      focusedPane: "right",
      inspectorTab: "trace",
      rightScreenMode: "custom-screen",
      helpOpen: false,
      numberBuffer: "",
      lastOutput: "Ready.",
      lastStatus: "info",
      displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto", pageSize: 25 }
    }
  };
  const windowTarget = {
    listeners: new Map(),
    witnessOperatorWorkbench: {
      async getSnapshot() { return snapshot; },
      async getAutocomplete() { return { preview: "", matches: [] }; },
      async runCommand() { return { snapshot }; },
      async dispatchIntent(intent) {
        calls.push(intent);
        return { snapshot };
      },
      async updateDisplaySettings() { return { snapshot }; }
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };

  const runtime = startOperatorWorkbenchRuntime({ windowTarget, documentTarget });
  await runtime.started;

  const keydown = windowTarget.listeners.get("keydown");
  await keydown({ key: "[", preventDefault() {}, target: null });
  await keydown({ key: "]", preventDefault() {}, target: null });
  await keydown({ key: "-", preventDefault() {}, target: null });
  await keydown({ key: "=", preventDefault() {}, target: null });

  assert.deepEqual(calls.map(call => call.type), [
    "move-right-section",
    "move-right-section",
    "collapse-right-section",
    "expand-right-section"
  ]);
});

test("startOperatorWorkbenchRuntime routes custom window chrome controls through the bridge", async () => {
  const { documentTarget, elements } = makeFakeDocument();
  const windowCalls = [];
  const snapshot = {
    path: "root",
    focus: { active: false, kind: null, id: null },
    preview: { available: true, status: "active" },
    hostWindow: { maximized: false, minimizable: true, maximizable: true, closable: true },
    topPane: { title: "Operator Workbench", subtitle: "global", navigation: { selectedIndex: 0, chips: [] } },
    leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
    rightPane: {
      title: "Trace",
      activeScreenId: "inspect",
      screen: { title: "Trace", activeSectionIndex: 0, sections: [], rows: [], activeRowIndex: 0, detailLines: [] },
      tabs: { inspect: true, references: true, source: true, provenance: true },
      target: { kind: "record", id: "thing.alpha", mode: "record" }
    },
    ui: {
      focusedPane: "left",
      inspectorTab: "inspect",
      rightScreenMode: "custom-screen",
      helpOpen: false,
      numberBuffer: "",
      lastOutput: "Ready.",
      lastStatus: "info",
      displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto", pageSize: 25 }
    }
  };
  const windowTarget = {
    listeners: new Map(),
    witnessOperatorWorkbench: {
      async getSnapshot() { return snapshot; },
      async getAutocomplete() { return { preview: "", matches: [] }; },
      async runCommand() { return { snapshot }; },
      async dispatchIntent() { return { snapshot }; },
      async updateDisplaySettings() { return { snapshot }; },
      async windowControl(action) {
        windowCalls.push(action);
        if (action === "toggle-maximize") {
          snapshot.hostWindow.maximized = !snapshot.hostWindow.maximized;
        }
        return snapshot;
      }
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };

  const runtime = startOperatorWorkbenchRuntime({ windowTarget, documentTarget });
  await runtime.started;

  await elements.get("operator-window-minimize").listeners.get("click")({ preventDefault() {} });
  await elements.get("operator-window-maximize").listeners.get("click")({ preventDefault() {} });
  await elements.get("operator-window-drag").listeners.get("dblclick")({ preventDefault() {} });
  await elements.get("operator-window-close").listeners.get("click")({ preventDefault() {} });

  assert.deepEqual(windowCalls, [
    "minimize",
    "toggle-maximize",
    "toggle-maximize",
    "close"
  ]);
});

test("startOperatorWorkbenchRuntime routes section header clicks and toggles through the bridge", async () => {
  const { documentTarget } = makeFakeDocument();
  const calls = [];
  const snapshot = {
    path: "root",
    focus: { active: false, kind: null, id: null },
    preview: { available: true, status: "active" },
    topPane: { title: "Operator Workbench", subtitle: "global", navigation: { selectedIndex: 0, chips: [] } },
    leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
    rightPane: {
      title: "Trace",
      screenMode: "custom-screen",
      activeScreenId: "trace",
      activeSection: {
        id: "summary",
        title: "Summary",
        rowCount: 0,
        actionable: false,
        collapsible: true,
        collapsed: false
      },
      tab: "trace",
      screen: {
        title: "Trace",
        activeSectionIndex: 0,
        sections: [
          { id: "summary", title: "Summary", kind: "detail", rows: [], detailLines: ["Alpha"], collapsible: true, collapsed: false, actionable: false }
        ],
        rows: [],
        activeRowIndex: 0,
        detailLines: ["Alpha"]
      },
      cursor: 0,
      tabs: { inspect: true, references: true, source: true, provenance: true },
      target: { kind: "record", id: "thing.alpha", mode: "record" }
    },
    ui: {
      focusedPane: "right",
      inspectorTab: "trace",
      rightScreenMode: "custom-screen",
      helpOpen: false,
      numberBuffer: "",
      lastOutput: "Ready.",
      lastStatus: "info",
      displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto", pageSize: 25 }
    }
  };
  const windowTarget = {
    listeners: new Map(),
    witnessOperatorWorkbench: {
      async getSnapshot() { return snapshot; },
      async getAutocomplete() { return { preview: "", matches: [] }; },
      async runCommand() { return { snapshot }; },
      async dispatchIntent(intent) {
        calls.push(intent);
        return { snapshot };
      },
      async updateDisplaySettings() { return { snapshot }; }
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };

  const runtime = startOperatorWorkbenchRuntime({ windowTarget, documentTarget });
  await runtime.started;

  const click = documentTarget.listeners.get("click");
  const dblclick = documentTarget.listeners.get("dblclick");
  const targetFor = (selector, datasetKey, value) => ({
    closest(query) {
      if (query === selector) return { dataset: { [datasetKey]: String(value) } };
      return null;
    }
  });

  await click({ target: targetFor("[data-screen-section-header]", "screenSectionHeader", 0) });
  await click({ target: targetFor("[data-screen-section-toggle]", "screenSectionToggle", 0) });
  await dblclick({ target: targetFor("[data-screen-section-header]", "screenSectionHeader", 0) });

  assert.deepEqual(calls.map(call => call.type), [
    "set-focused-pane",
    "set-right-section",
    "set-focused-pane",
    "set-right-section",
    "toggle-right-section-collapsed",
    "set-focused-pane",
    "set-right-section",
    "toggle-right-section-collapsed"
  ]);
});

test("startOperatorWorkbenchRuntime copies selected canvas text", async () => {
  const { documentTarget } = makeFakeDocument();
  const clipboardWrites = [];
  const snapshot = {
    path: "root",
    focus: { active: false, kind: null, id: null },
    preview: { available: true, status: "active" },
    topPane: { title: "Operator Workbench", subtitle: "global", navigation: { selectedIndex: 0, chips: [] } },
    leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
    rightPane: {
      title: "Trace",
      activeScreenId: "references",
      screen: {
        title: "Trace",
        activeSectionIndex: 0,
        sections: [
          {
            id: "session",
            title: "Session",
            kind: "detail",
            rows: [],
            detailLines: [],
            collapsible: true,
            collapsed: false,
            actionable: false
          }
        ]
      },
      tabs: { inspect: true, references: true, source: true, provenance: true },
      target: { kind: "record", id: "thing.alpha", mode: "record" }
    },
    ui: {
      focusedPane: "right",
      inspectorTab: "references",
      rightScreenMode: "custom-screen",
      helpOpen: false,
      numberBuffer: "",
      lastOutput: "Ready.",
      lastStatus: "info",
      displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto", pageSize: 25 }
    }
  };
  const windowTarget = {
    listeners: new Map(),
    navigator: {
      clipboard: {
        async writeText(text) {
          clipboardWrites.push(text);
        }
      }
    },
    witnessOperatorWorkbench: {
      async getSnapshot() { return snapshot; },
      async getAutocomplete() { return { preview: "", matches: [] }; },
      async runCommand() { return { snapshot }; },
      async dispatchIntent() { return { snapshot }; },
      async updateDisplaySettings() { return { snapshot }; }
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };

  const runtime = startOperatorWorkbenchRuntime({ windowTarget, documentTarget });
  await runtime.started;

  const rows = documentTarget.__operatorCanvasState.buffer.map(row => row.map(cell => cell.ch).join(""));
  const rowIndex = rows.findIndex(line => line.includes("Session"));
  const line = rows[rowIndex];
  const startColumn = line.indexOf("Session");
  const endColumn = startColumn + "Session".length - 1;
  documentTarget.__operatorCanvasSelection = {
    anchor: { row: rowIndex, column: startColumn },
    focus: { row: rowIndex, column: endColumn }
  };

  const keydown = windowTarget.listeners.get("keydown");
  await keydown({ ctrlKey: true, metaKey: false, key: "c", preventDefault() {}, target: null });

  assert.deepEqual(clipboardWrites, ["Session"]);
});

test("startOperatorWorkbenchRuntime selects a canvas word on double click", async () => {
  const { documentTarget, elements } = makeFakeDocument();
  const snapshot = {
    path: "root",
    focus: { active: false, kind: null, id: null },
    preview: { available: true, status: "active" },
    topPane: { title: "Operator Workbench", subtitle: "global", navigation: { selectedIndex: 0, chips: [] } },
    leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
    rightPane: {
      title: "Trace",
      activeScreenId: "references",
      screen: {
        title: "Trace",
        activeSectionIndex: 0,
        sections: [
          {
            id: "session",
            title: "Session",
            kind: "detail",
            rows: [],
            detailLines: [],
            collapsible: true,
            collapsed: false,
            actionable: false
          }
        ]
      },
      tabs: { inspect: true, references: true, source: true, provenance: true },
      target: { kind: "record", id: "thing.alpha", mode: "record" }
    },
    ui: {
      focusedPane: "right",
      inspectorTab: "references",
      rightScreenMode: "custom-screen",
      helpOpen: false,
      numberBuffer: "",
      lastOutput: "Ready.",
      lastStatus: "info",
      displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto", pageSize: 25 }
    }
  };
  const windowTarget = {
    listeners: new Map(),
    witnessOperatorWorkbench: {
      async getSnapshot() { return snapshot; },
      async getAutocomplete() { return { preview: "", matches: [] }; },
      async runCommand() { return { snapshot }; },
      async dispatchIntent() { return { snapshot }; },
      async updateDisplaySettings() { return { snapshot }; }
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };

  const runtime = startOperatorWorkbenchRuntime({ windowTarget, documentTarget });
  await runtime.started;

  const rows = documentTarget.__operatorCanvasState.buffer.map(row => row.map(cell => cell.ch).join(""));
  const rowIndex = rows.findIndex(line => line.includes("Session"));
  const line = rows[rowIndex];
  const startColumn = line.indexOf("Session");
  const canvas = elements.get("operator-canvas");
  const click = canvas.listeners.get("click");
  const state = documentTarget.__operatorCanvasState;

  await click({
    detail: 2,
    clientX: startColumn * state.cellWidth + 1,
    clientY: rowIndex * state.cellHeight + 1,
    preventDefault() {}
  });

  assert.deepEqual(documentTarget.__operatorCanvasSelection, {
    mode: "linear",
    anchor: { row: rowIndex, column: startColumn },
    focus: { row: rowIndex, column: startColumn + "Session".length - 1 }
  });
});

test("startOperatorWorkbenchRuntime selects the visible canvas line on triple click", async () => {
  const { documentTarget, elements } = makeFakeDocument();
  const snapshot = {
    path: "root",
    focus: { active: false, kind: null, id: null },
    preview: { available: true, status: "active" },
    topPane: { title: "Operator Workbench", subtitle: "global", navigation: { selectedIndex: 0, chips: [] } },
    leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
    rightPane: {
      title: "Trace",
      activeScreenId: "references",
      screen: {
        title: "Trace",
        activeSectionIndex: 0,
        sections: [
          {
            id: "session",
            title: "Session",
            kind: "detail",
            rows: [],
            detailLines: [],
            collapsible: true,
            collapsed: false,
            actionable: false
          }
        ]
      },
      tabs: { inspect: true, references: true, source: true, provenance: true },
      target: { kind: "record", id: "thing.alpha", mode: "record" }
    },
    ui: {
      focusedPane: "right",
      inspectorTab: "references",
      rightScreenMode: "custom-screen",
      helpOpen: false,
      numberBuffer: "",
      lastOutput: "Ready.",
      lastStatus: "info",
      displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto", pageSize: 25 }
    }
  };
  const windowTarget = {
    listeners: new Map(),
    witnessOperatorWorkbench: {
      async getSnapshot() { return snapshot; },
      async getAutocomplete() { return { preview: "", matches: [] }; },
      async runCommand() { return { snapshot }; },
      async dispatchIntent() { return { snapshot }; },
      async updateDisplaySettings() { return { snapshot }; }
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };

  const runtime = startOperatorWorkbenchRuntime({ windowTarget, documentTarget });
  await runtime.started;

  const rows = documentTarget.__operatorCanvasState.buffer.map(row => row.map(cell => cell.ch).join(""));
  const rowIndex = rows.findIndex(line => line.includes("Session"));
  const line = rows[rowIndex];
  const startColumn = line.search(/\S/u);
  const endColumn = line.length - 1 - line.split("").reverse().join("").search(/\S/u);
  const sessionColumn = line.indexOf("Session");
  const canvas = elements.get("operator-canvas");
  const click = canvas.listeners.get("click");
  const state = documentTarget.__operatorCanvasState;

  await click({
    detail: 3,
    clientX: sessionColumn * state.cellWidth + 1,
    clientY: rowIndex * state.cellHeight + 1,
    preventDefault() {}
  });

  assert.deepEqual(documentTarget.__operatorCanvasSelection, {
    mode: "linear",
    anchor: { row: rowIndex, column: startColumn },
    focus: { row: rowIndex, column: endColumn }
  });
});

test("startOperatorWorkbenchRuntime copies rectangular canvas selections with exact box drawing", async () => {
  const { documentTarget, elements } = makeFakeDocument();
  const clipboardWrites = [];
  const snapshot = {
    path: "root",
    focus: { active: false, kind: null, id: null },
    preview: { available: true, status: "active" },
    topPane: { title: "Operator Workbench", subtitle: "global", navigation: { selectedIndex: 0, chips: [] } },
    leftPane: { mode: "tree", title: "Tree", header: "root", columns: [], cursor: 0, rows: [] },
    rightPane: {
      title: "Trace",
      activeScreenId: "references",
      screen: {
        title: "Trace",
        activeSectionIndex: 0,
        sections: [
          {
            id: "session",
            title: "Session",
            kind: "detail",
            rows: [],
            detailLines: [],
            collapsible: true,
            collapsed: false,
            actionable: false
          }
        ]
      },
      tabs: { inspect: true, references: true, source: true, provenance: true },
      target: { kind: "record", id: "thing.alpha", mode: "record" }
    },
    ui: {
      focusedPane: "right",
      inspectorTab: "references",
      rightScreenMode: "custom-screen",
      helpOpen: false,
      numberBuffer: "",
      lastOutput: "Ready.",
      lastStatus: "info",
      displaySettings: { fontSize: 14, paneSplit: 0.42, rowDensity: "comfortable", colorMode: "auto", pageSize: 25 }
    }
  };
  const windowTarget = {
    listeners: new Map(),
    navigator: {
      clipboard: {
        async writeText(text) {
          clipboardWrites.push(text);
        }
      }
    },
    witnessOperatorWorkbench: {
      async getSnapshot() { return snapshot; },
      async getAutocomplete() { return { preview: "", matches: [] }; },
      async runCommand() { return { snapshot }; },
      async dispatchIntent() { return { snapshot }; },
      async updateDisplaySettings() { return { snapshot }; }
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
  };

  const runtime = startOperatorWorkbenchRuntime({ windowTarget, documentTarget });
  await runtime.started;

  const rows = documentTarget.__operatorCanvasState.buffer.map(row => row.map(cell => cell.ch).join(""));
  const labelRowIndex = rows.findIndex(line => line.includes("Session"));
  const borderRowIndex = labelRowIndex - 1;
  const borderLine = rows[borderRowIndex];
  const labelLine = rows[labelRowIndex];
  const startColumn = borderLine.search(/\S/u);
  const endColumn = labelLine.indexOf("Session") + "Session".length + 4;
  const canvas = elements.get("operator-canvas");
  const mousedown = canvas.listeners.get("mousedown");
  const mousemove = canvas.listeners.get("mousemove");
  const keydown = windowTarget.listeners.get("keydown");
  const state = documentTarget.__operatorCanvasState;
  const expected = [borderLine, labelLine]
    .map(text => text.slice(startColumn, endColumn + 1))
    .join("\n");

  mousedown({
    button: 0,
    altKey: true,
    clientX: startColumn * state.cellWidth + 1,
    clientY: borderRowIndex * state.cellHeight + 1
  });
  mousemove({
    clientX: endColumn * state.cellWidth + 1,
    clientY: labelRowIndex * state.cellHeight + 1
  });
  windowTarget.listeners.get("mouseup")({ button: 0 });
  await keydown({ ctrlKey: true, metaKey: false, key: "c", preventDefault() {}, target: null });

  assert.equal(documentTarget.__operatorCanvasSelection.mode, "rectangular");
  assert.deepEqual(clipboardWrites, [expected]);
});

test("operator workbench page renders the multi-pane shell", () => {
  const html = renderOperatorWorkbenchPage();
  assert.match(html, /operator-window-drag/);
  assert.match(html, /operator-window-minimize/);
  assert.match(html, /operator-window-maximize/);
  assert.match(html, /operator-window-close/);
  assert.match(html, /operator-bootstrap-status/);
  assert.match(html, /Booting operator workbench/);
  assert.match(html, /__operatorWorkbenchBooted/);
  assert.match(html, /\[_\]/);
  assert.match(html, /operator-left-rows/);
  assert.equal(html.includes("operator-inspector-body"), false);
  assert.match(html, /operator-nav-strip/);
  assert.equal(html.includes("operator-reference-screen-body"), false);
  assert.match(html, /operator-tab-source/);
  assert.match(html, /operator-tab-provenance/);
  assert.match(html, /operator-custom-screen-body/);
  assert.match(html, /operator-command-input/);
  assert.match(html, /witnessOperatorWorkbench/);
  assert.match(html, /operator-canvas/);
  assert.equal(html.includes("operator-titlebar"), false);
  assert.equal(html.includes("detached workbench"), false);
  return;
  assert.equal(html.includes("â"), false);
});
