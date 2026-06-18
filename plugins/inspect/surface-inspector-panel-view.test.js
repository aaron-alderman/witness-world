import test from "node:test";
import assert from "node:assert/strict";
import {
  renderSurfaceInspectorEditorView,
  renderSurfaceInspectorMenuView,
  renderSurfaceInspectorPanelView,
  renderSurfaceInspectorPanelViewFactory
} from "./surface-inspector-panel-view.js";

test("surface inspector editor view renders editable and proposal branches through shared helpers", () => {
  const saveHtml = renderSurfaceInspectorEditorView({
    widgetId: "todo_form",
    authoredWidget: { props: { text: "Todo", hidden: true } },
    widgetsLoaded: true,
    authority: { ok: true },
    escapeHtml: value => String(value)
  });
  assert.equal(saveHtml.includes('data-surface-inspector-edit-form'), true);
  assert.equal(saveHtml.includes('class="surface-form"'), true);
  assert.equal(saveHtml.includes('class="surface-field"'), true);
  assert.equal(saveHtml.includes("Save Widget"), true);

  const proposalHtml = renderSurfaceInspectorEditorView({
    widgetId: "todo_form",
    authoredWidget: { props: { text: "Todo" } },
    widgetsLoaded: true,
    authority: { ok: false, reason: "steward required" },
    currentActorPresent: true,
    escapeHtml: value => String(value)
  });
  assert.equal(proposalHtml.includes('data-surface-inspector-proposal-form'), true);
  assert.equal(proposalHtml.includes('class="surface-actions-compact"'), true);
  assert.equal(proposalHtml.includes("Propose Save-Back"), true);
});

test("surface inspector panel and menu views render inspector chrome, versions, and handoff actions", () => {
  const panelHtml = renderSurfaceInspectorPanelView({
    liveSurfaceInspectable: true,
    surfaceInspectorOpen: true,
    widgetId: "todo_form",
    selectedRouteId: "home_route",
    selectedProgramId: "todo_frontend_program",
    selectedNodeKind: "widget",
    selectedNodeContext: "todo",
    selectedElementTag: "form",
    selectedSourceFile: "todo.wtoml",
    processEvent: "submit",
    ownershipSummary: "Selected widget inherits runtime behavior from mounted route home_route.",
    ownershipRows: [
      ["Runtime Profile", "full"],
      ["Server Runner", "demo_server"],
      ["Frontend Program", "todo_frontend_program"],
      ["Route", "home_route"],
      ["Owner Class", "generic-host"],
      ["Handler", "page.home"]
    ],
    ownershipChain: [
      { class: "generic-host", bundleId: "bundle-core-runtime", handlerId: "page.home", note: "Runtime behavior is owned by shared host/runtime code." }
    ],
    runtimeCorrelationSummary: "Authored event submit:todo_form in todo_frontend_program is active in the shared runtime probe for this surface.",
    runtimeCorrelationRows: [
      ["Frontend Program", "todo_frontend_program"],
      ["Frontend Event", "submit:todo_form"],
      ["Process Active", "yes"],
      ["Current Process Refs", "todo_frontend_program"],
      ["Trace Entries", "12"]
    ],
    runtimeCorrelationOps: [
      { label: "POST /api/todos", summary: "Lowers through /api/todos with owner backend-program / todo.todos.create / backendProgram.run.", selectTarget: "todo.todos.create", selectLabel: "Show Backend Program" }
    ],
    versionState: { rollbackAvailable: true, soul: "todo_form", rollbackVersion: "v1" },
    versionRows: [{ soul: "todo_form", version: "v2", isActive: false }],
    versionAuthority: { ok: true },
    editorHtml: "<section>Editor</section>",
    escapeHtml: value => String(value)
  });
  assert.equal(panelHtml.includes("Live Page Inspector"), true);
  assert.equal(panelHtml.includes('class="surface-status-box"'), false);
  assert.equal(panelHtml.includes("Open In World"), true);
  assert.equal(panelHtml.includes("Show Route"), true);
  assert.equal(panelHtml.includes("Show Frontend Program"), true);
  assert.equal(panelHtml.includes("Activate"), true);
  assert.equal(panelHtml.includes("Rollback To v1"), true);
  assert.equal(panelHtml.includes("Runtime Owner"), true);
  assert.equal(panelHtml.includes("Runtime Profile"), true);
  assert.equal(panelHtml.includes("demo_server"), true);
  assert.equal(panelHtml.includes("Runtime Correlation"), true);
  assert.equal(panelHtml.includes("submit:todo_form"), true);
  assert.equal(panelHtml.includes("POST /api/todos"), true);
  assert.equal(panelHtml.includes("Show Backend Program"), true);
  assert.equal(panelHtml.includes("home_route"), true);
  assert.equal(panelHtml.includes("generic-host"), true);
  assert.equal(panelHtml.includes("<section>Editor</section>"), true);

  const menuHtml = renderSurfaceInspectorMenuView({
    liveSurfaceInspectable: true,
    widgetId: "todo_form",
    x: 20,
    y: 30,
    selectedSourceFile: "todo.wtoml",
    hasProcessSelection: true,
    windowWidth: 800,
    windowHeight: 600,
    escapeHtml: value => String(value)
  });
  assert.equal(menuHtml.includes('data-surface-inspector-menu'), true);
  assert.equal(menuHtml.includes("Inspect Widget"), true);
  assert.equal(menuHtml.includes("Show Source"), true);
  assert.equal(menuHtml.includes("Open Process View"), true);
});

test("surface inspector panel view factory exposes the shared browser helpers", () => {
  const factory = renderSurfaceInspectorPanelViewFactory();
  assert.equal(factory.includes("const renderSurfaceInspectorEditorView ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorVersionsView ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorOwnershipView ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorRuntimeCorrelationView ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorPanelView ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorMenuView ="), true);
});
