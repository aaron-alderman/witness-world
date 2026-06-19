import test from "node:test";
import assert from "node:assert/strict";
import {
  renderSurfaceInspectorChildCreateView,
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

test("surface inspector child create view renders direct and proposal branches through shared helpers", () => {
  const directHtml = renderSurfaceInspectorChildCreateView({
    widgetId: "todo_form",
    authoredWidget: { id: "todo_form", kind: "Form", context: "frontend" },
    widgetsLoaded: true,
    authority: { ok: true },
    currentActorPresent: true,
    kindOptions: [{ value: "Text", label: "Text" }],
    escapeHtml: value => String(value)
  });
  assert.equal(directHtml.includes('data-surface-inspector-child-create-form'), true);
  assert.equal(directHtml.includes("Add Child Widget"), true);

  const proposalHtml = renderSurfaceInspectorChildCreateView({
    widgetId: "todo_form",
    authoredWidget: { id: "todo_form", kind: "Form", context: "frontend" },
    widgetsLoaded: true,
    authority: { ok: false, reason: "steward required" },
    currentActorPresent: true,
    kindOptions: [{ value: "Text", label: "Text" }],
    escapeHtml: value => String(value)
  });
  assert.equal(proposalHtml.includes('data-surface-inspector-child-create-form'), true);
  assert.equal(proposalHtml.includes("Request Child Widget"), true);
  assert.equal(proposalHtml.includes("widget.define"), true);
});

test("surface inspector panel and menu views render inspector chrome, versions, and handoff actions", () => {
  const childCreateHtml = renderSurfaceInspectorChildCreateView({
    widgetId: "todo_form",
    authoredWidget: { id: "todo_form", kind: "Form", context: "frontend" },
    widgetsLoaded: true,
    authority: { ok: false, reason: "Read-only: this widget lives in context frontend and the current actor lacks authority for that context." },
    currentActorPresent: true,
    kindOptions: [{ value: "Text", label: "Text" }],
    escapeHtml: value => String(value)
  });
  const panelHtml = renderSurfaceInspectorPanelView({
    liveSurfaceInspectable: true,
    surfaceInspectorOpen: true,
    widgetId: "todo_form",
    selectedRouteId: "todo_create_route",
    selectedProgramId: "todo_frontend_program",
    selectedNodeKind: "widget",
    selectedNodeContext: "todo",
    selectedElementTag: "form",
    selectedSourceFile: "todo.wtoml",
    processEvent: "submit",
    ownershipSummary: "Selected widget inherits runtime behavior from mounted route todo_create_route.",
    ownershipRows: [
      ["Runtime Profile", "full"],
      ["Server Runner", "demo_server"],
      ["Frontend Program", "todo_frontend_program"],
      ["Route", "todo_create_route"],
      ["Owner Class", "backend-program"],
      ["Handler", "backendProgram.run"],
      ["Backend Program", "todo.todos.create"],
      ["Operation Semantics", "governed-mutation"],
      ["Governance Mode", "proposal-fallback"],
      ["Authority Mechanism", "widget-target-authority"],
      ["Shared Authority Path", "yes"],
      ["Workflow Role", "direct-mutation"]
    ],
    ownershipChain: [
      { class: "route", routeId: "todo_create_route", method: "POST", path: "/api/todos", serves: "backendProgram", note: "Visible behavior enters through mounted route todo_create_route." },
      { class: "backend-program", backendProgramSoul: "todo.todos.create", handlerId: "backendProgram.run", note: "Authored backend program todo.todos.create is selected by mounted route params." },
      { class: "generic-host", bundleId: "bundle-core-runtime", handlerId: "backendProgram.run", note: "Runtime behavior is owned by shared host/runtime code." }
    ],
    scopeSummary: "This widget currently lowers inside context frontend. The active live surface exposes 2 mounted capabilities for local behavior inspection.",
    scopeRows: [
      ["Context", "frontend"],
      ["Active Surface", "surface:home"],
      ["Mounted Capabilities", "dom.render, http.fetch"]
    ],
    scopeContextId: "frontend",
    scopeCapabilities: [
      { id: "dom.render", label: "dom.render" },
      { id: "http.fetch", label: "http.fetch" }
    ],
    capabilitySummary: "These rows are explicit authored capability installs for context frontend. Submit uses the shared capability runtime instead of a client-only shortcut.",
    capabilityRows: [
      ["Context", "frontend"],
      ["Installed", "dom.render"],
      ["Available", "notes.sidebar"]
    ],
    capabilityTargetId: "frontend",
    capabilityTargetKind: "context",
    capabilityAuthority: { mode: "proposal", reason: "Read-only: this context is stewarded elsewhere." },
    installedCapabilities: [
      { id: "dom.render", label: "dom.render", summary: "placements: context / source catalog-only" }
    ],
    availableCapabilities: [
      { id: "notes.sidebar", label: "notes.sidebar [v1]", summary: "placements: context / source both" }
    ],
    compositionSummary: "The full runtime is using authored runner server_runner while plugin activation still comes from profile-or-operator-defaults.",
    compositionRows: [
      ["Story", "authored-runner-driven"],
      ["Startup Mode", "profile"],
      ["Active Runner", "server_runner (authored-server-runner)"],
      ["Runner Source", "authored-server-runner"],
      ["Plugin Source", "profile-or-operator-defaults"],
      ["Uses Authored Runner", "yes"],
      ["Uses Authored Plugin Installs", "no"],
      ["Notes", "Authored runtimePluginInstall rows participate in the active runtime plugin composition."]
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
      { label: "POST /api/todos", summary: "Lowers through /api/todos with owner backend-program / todo.todos.create / backendProgram.run. Governance is proposal-fallback via widget-target-authority on the shared authority path (direct-mutation). Widget proposals use the shared target-authority lane.", selectTarget: "todo.todos.create", selectLabel: "Show Backend Program" }
    ],
    versionState: { rollbackAvailable: true, soul: "todo_form", rollbackVersion: "v1" },
    versionRows: [{ soul: "todo_form", version: "v2", isActive: false }],
    versionAuthority: { ok: true },
    currentActorPresent: true,
    childCreateHtml,
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
  assert.equal(panelHtml.includes("proposal-fallback"), true);
  assert.equal(panelHtml.includes("widget-target-authority"), true);
  assert.equal(panelHtml.includes("Shared Authority Path"), true);
  assert.equal(panelHtml.includes("Surface Scope"), true);
  assert.equal(panelHtml.includes("Show Context"), true);
  assert.equal(panelHtml.includes("Show Capability dom.render"), true);
  assert.equal(panelHtml.includes("frontend"), true);
  assert.equal(panelHtml.includes("Authored Capabilities"), true);
  assert.equal(panelHtml.includes("Request Install"), true);
  assert.equal(panelHtml.includes("Request Remove"), true);
  assert.equal(panelHtml.includes("explicit authored capability installs"), true);
  assert.equal(panelHtml.includes("Child Widget"), true);
  assert.equal(panelHtml.includes("Request Child Widget"), true);
  assert.equal(panelHtml.includes("Runtime Composition"), true);
  assert.equal(panelHtml.includes("authored-runner-driven"), true);
  assert.equal(panelHtml.includes("server_runner (authored-server-runner)"), true);
  assert.equal(panelHtml.includes("profile-or-operator-defaults"), true);
  assert.equal(panelHtml.includes("Runtime Correlation"), true);
  assert.equal(panelHtml.includes("submit:todo_form"), true);
  assert.equal(panelHtml.includes("POST /api/todos"), true);
  assert.equal(panelHtml.includes("Show Backend Program"), true);
  assert.equal(panelHtml.includes("todo_create_route"), true);
  assert.equal(panelHtml.includes("backend-program"), true);
  assert.equal(panelHtml.includes("route todo_create_route"), true);
  assert.equal(panelHtml.includes("POST /api/todos"), true);
  assert.equal(panelHtml.includes("backend program todo.todos.create"), true);
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
  assert.equal(factory.includes("const renderSurfaceInspectorChildCreateView ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorVersionsView ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorOwnershipView ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorScopeView ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorCapabilitiesView ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorCompositionView ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorRuntimeCorrelationView ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorPanelView ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorMenuView ="), true);
});
