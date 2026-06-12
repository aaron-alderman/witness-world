export const TODO_TUTORIAL_ID = "todo-from-scratch";

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).map(value => value.trim()).filter(Boolean))];
}

function withContext(rows, context) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    if (!row || typeof row !== "object" || row.context) return row;
    return { ...row, context };
  });
}

function withRecordContext(row, context) {
  if (!row || typeof row !== "object" || row.context) return row;
  return { ...row, context };
}

function tutorialPageLabel(page) {
  return page === "app" ? "App" : (page === "bootstrap" ? "Bootstrap" : (page === "world" ? "World" : String(page || "")));
}

export function tutorialPageScopeKey(page) {
  const normalized = typeof page === "string" ? page.trim() : "";
  return normalized ? `page:${normalized}` : null;
}

export function tutorialChapterScopeKey(chapterId) {
  const normalized = typeof chapterId === "string" ? chapterId.trim() : "";
  return normalized ? `chapter:${normalized}` : null;
}

function normalizeScopeFields(scope = {}) {
  return Object.fromEntries(Object.entries(scope).filter(([, value]) => value != null && value !== ""));
}

function tutorialContextLabel(contextId) {
  const normalized = typeof contextId === "string" ? contextId.trim() : "";
  if (!normalized) return null;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1) + " context";
}

function pageScope(page, label = null) {
  const scopePage = typeof page === "string" ? page.trim() : "";
  return scopePage
    ? normalizeScopeFields({
        scopeKey: tutorialPageScopeKey(scopePage),
        scopeKind: "page",
        scopePage,
        scopeLabel: label || tutorialPageLabel(scopePage)
      })
    : {};
}

function worldScope(label = null) {
  return normalizeScopeFields({
    scopeKey: "world",
    scopeKind: "world",
    scopePage: "world",
    scopeLabel: label || "World"
  });
}

function sectionScope(page, sectionId, label = null) {
  const scopePage = typeof page === "string" ? page.trim() : "";
  const normalizedSectionId = typeof sectionId === "string" ? sectionId.trim() : "";
  return scopePage && normalizedSectionId
    ? normalizeScopeFields({
        scopeKey: `section:${scopePage}:${normalizedSectionId}`,
        scopeKind: "section",
        scopePage,
        scopeSectionId: normalizedSectionId,
        scopeLabel: label || normalizedSectionId
      })
    : {};
}

function widgetScope(page, widgetId, label = null) {
  const scopePage = typeof page === "string" ? page.trim() : "";
  const normalizedWidgetId = typeof widgetId === "string" ? widgetId.trim() : "";
  return normalizedWidgetId
    ? normalizeScopeFields({
        scopeKey: `widget:${normalizedWidgetId}`,
        scopeKind: "widget",
        scopePage: scopePage || null,
        scopeWidgetId: normalizedWidgetId,
        scopeLabel: label || normalizedWidgetId
      })
    : {};
}

function withStepScope(step, scope = null) {
  const scoped = scope && typeof scope === "object" ? { ...scope } : null;
  if (!scoped) return step;
  if (!scoped.scopeLabel && step?.title) scoped.scopeLabel = step.title;
  return { ...step, ...normalizeScopeFields(scoped) };
}

function withStepSurfaceContext(step, contextId = null, label = null) {
  const normalizedContextId = typeof contextId === "string" ? contextId.trim() : "";
  if (!normalizedContextId) return step;
  return {
    ...step,
    surfaceContextId: normalizedContextId,
    surfaceContextLabel: typeof label === "string" && label.trim() ? label.trim() : tutorialContextLabel(normalizedContextId)
  };
}

function scopeAnchor(scope = null, target = null) {
  const scoped = scope && typeof scope === "object" ? { ...scope } : {};
  const normalizedTarget = typeof target === "string" && target.trim() ? target.trim() : "";
  return normalizedTarget ? { ...scoped, target: normalizedTarget } : scoped;
}

function tutorialConcept(id, label, summary) {
  return { id, label, summary };
}

function humanizeIdentifier(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return "";
  return normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function plainTutorialLabel(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.includes("${")) return "";
  return normalized;
}

function tutorialScopeLabelFromWidget(widget, childrenByParent = new Map()) {
  if (!widget || typeof widget !== "object") return "";
  const directCandidates = [
    widget.title,
    widget.label,
    widget.text,
    widget.placeholder,
    widget.role && humanizeIdentifier(widget.role),
    widget.name && humanizeIdentifier(widget.name),
    widget.id && humanizeIdentifier(widget.id)
  ];
  for (const candidate of directCandidates) {
    const label = plainTutorialLabel(candidate);
    if (label) return label;
  }
  for (const child of childrenByParent.get(widget.id) || []) {
    const label = tutorialScopeLabelFromWidget(child, childrenByParent);
    if (label) return label;
  }
  return widget.id ? humanizeIdentifier(widget.id) : "";
}

function tutorialScopeAnchorsFromWidgets(page, widgets = []) {
  const normalizedPage = typeof page === "string" ? page.trim() : "";
  if (!normalizedPage) return [];
  const rows = Array.isArray(widgets) ? widgets : [];
  const childrenByParent = new Map();
  for (const row of rows) {
    if (!row?.parent) continue;
    if (!childrenByParent.has(row.parent)) childrenByParent.set(row.parent, []);
    childrenByParent.get(row.parent).push(row);
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => Number(left?.order ?? 0) - Number(right?.order ?? 0));
  }
  const anchors = [];
  for (const row of rows) {
    const target = typeof row?.tutorialTarget === "string" ? row.tutorialTarget.trim() : "";
    if (!row?.id || !target) continue;
    const label = tutorialScopeLabelFromWidget(row, childrenByParent) || row.id;
    const isSection = row.kind === "Box" || row.kind === "Section" || row.kind === "Form";
    anchors.push(scopeAnchor(
      isSection
        ? sectionScope(normalizedPage, row.id, label)
        : widgetScope(normalizedPage, row.id, label),
      target
    ));
  }
  return anchors;
}

function tutorialStepWithConcepts(step, concepts) {
  return { ...step, concepts: Array.isArray(concepts) ? [...concepts] : [] };
}

function tutorialStepsWithConcepts(steps, concepts) {
  return steps.map(step => tutorialStepWithConcepts(step, concepts));
}

export function todoStarterBlueprint() {
  const runner = {
    id: "demo_server",
    handlerSet: "demo",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    todoProjection: "witness-world-bootstrap-todos.json",
    privateNotesProjection: "witness-world-bootstrap-private-notes.json"
  };
  const contexts = [
    {
      id: "backend",
      label: "Backend",
      owner: "backendHost",
      stewardsJson: JSON.stringify(["aaron"])
    },
    {
      id: "frontend",
      label: "Frontend",
      owner: "frontendHost",
      stewardsJson: JSON.stringify(["aaron"])
    }
  ];

  const frontendContext = "frontend";
  const widgets = withContext([
    { id: "todo_app_widget", kind: "Page", title: "Witness Todo", attach: false },
    { id: "todo_session", kind: "Box", parent: "todo_app_widget", order: 0, class: "session-panel", role: "session-panel", tutorialTarget: "app-session-panel" },
    { id: "todo_session_title", kind: "Text", parent: "todo_session", order: 0, text: "Personal Projection" },
    { id: "todo_session_form", kind: "Form", parent: "todo_session", order: 1, role: "login-form", tutorialTarget: "app-session-form" },
    { id: "todo_username_input", kind: "Input", parent: "todo_session_form", order: 0, name: "username", placeholder: "Username", autocomplete: "username", tutorialTarget: "app-session-username" },
    { id: "todo_password_input", kind: "Input", parent: "todo_session_form", order: 1, name: "password", placeholder: "Password", type: "password", autocomplete: "current-password", tutorialTarget: "app-session-password" },
    { id: "todo_open_button", kind: "Button", parent: "todo_session_form", order: 2, text: "Sign in", type: "submit", tutorialTarget: "app-session-submit" },
    { id: "todo_logout_button", kind: "Button", parent: "todo_session_form", order: 3, text: "Logout", type: "button", action: "logout", tutorialTarget: "app-session-logout" },
    { id: "todo_session_status", kind: "Text", parent: "todo_session", order: 2, text: "Not signed in", role: "session-status", tutorialTarget: "app-session-status" },
    { id: "todo_title", kind: "Heading", parent: "todo_app_widget", order: 1, text: "Witness Todo", level: 1, tutorialTarget: "app-title" },
    { id: "todo_form", kind: "Form", parent: "todo_app_widget", order: 2, role: "todo-form", tutorialTarget: "todo-form" },
    { id: "todo_input", kind: "Input", parent: "todo_form", order: 0, name: "title", placeholder: "New todo", tutorialTarget: "todo-input" },
    { id: "todo_add_button", kind: "Button", parent: "todo_form", order: 1, text: "Add", type: "submit", tutorialTarget: "todo-submit" },
    { id: "todo_status", kind: "Text", parent: "todo_app_widget", order: 3, text: "", class: "status", role: "app-status", tutorialTarget: "todo-status" },
    { id: "todo_list", kind: "Box", parent: "todo_app_widget", order: 4, role: "todo-list", tutorialTarget: "todo-list" },
    { id: "todo_private_notes", kind: "Box", parent: "todo_app_widget", order: 5, class: "private-notes", role: "private-notes", tutorialTarget: "private-notes-section" },
    { id: "todo_private_notes_title", kind: "Heading", parent: "todo_private_notes", order: 0, text: "Private Notes", level: 2 },
    { id: "todo_private_notes_status", kind: "Text", parent: "todo_private_notes", order: 1, text: "Sign in to see and save notes that belong only to you.", class: "status", role: "private-notes-status" },
    { id: "todo_private_notes_form", kind: "Form", parent: "todo_private_notes", order: 2, role: "private-note-form", tutorialTarget: "note-form" },
    { id: "todo_private_note_input", kind: "Input", parent: "todo_private_notes_form", order: 0, name: "text", placeholder: "Only your perspective can see this", tutorialTarget: "note-input" },
    { id: "todo_private_note_button", kind: "Button", parent: "todo_private_notes_form", order: 1, text: "Save note", type: "submit", tutorialTarget: "note-submit" },
    { id: "todo_private_note_list", kind: "Box", parent: "todo_private_notes", order: 3, class: "private-note-list", role: "private-note-list", tutorialTarget: "note-list" },
    { id: "todo_widget_editor", kind: "Box", parent: "todo_app_widget", order: 6, class: "widget-editor", role: "widget-editor", tutorialTarget: "widget-editor" },
    { id: "todo_widget_editor_title", kind: "Heading", parent: "todo_widget_editor", order: 0, text: "Widget Editor", level: 2 },
    { id: "todo_widget_editor_form", kind: "Form", parent: "todo_widget_editor", order: 1, role: "widget-editor-form" },
    { id: "todo_widget_kind", kind: "ValueEditor", parent: "todo_widget_editor_form", order: 0, name: "kind", valueType: "widget.kind", label: "Kind", placeholder: "Choose a widget kind" },
    { id: "todo_widget_text", kind: "ValueEditor", parent: "todo_widget_editor_form", order: 1, name: "text", valueType: "widget.text", label: "Text", placeholder: "Widget text" },
    { id: "todo_widget_parent", kind: "ValueEditor", parent: "todo_widget_editor_form", order: 2, name: "parent", valueType: "widget.parent", label: "Parent", placeholder: "Parent widget id, blank = root" },
    { id: "todo_widget_order", kind: "ValueEditor", parent: "todo_widget_editor_form", order: 3, name: "order", valueType: "widget.order", label: "Order", placeholder: "Optional order" },
    { id: "todo_widget_editor_button", kind: "Button", parent: "todo_widget_editor_form", order: 4, text: "Add Widget", type: "submit", tutorialTarget: "widget-editor-submit" },
    { id: "todo_item_template", kind: "Box", attach: false, template: true, class: "${item.done ? 'todo-row done' : 'todo-row'}" },
    { id: "todo_item_title_template", kind: "Text", parent: "todo_item_template", order: 0, template: true, text: "${item.title}", class: "todo-title" },
    { id: "todo_item_actions_template", kind: "Box", parent: "todo_item_template", order: 1, template: true, class: "todo-actions" },
    { id: "todo_item_toggle_template", kind: "Button", parent: "todo_item_actions_template", order: 0, template: true, text: "${state.todoResponse && state.todoResponse.authority && state.todoResponse.authority.mode === 'propose' ? (item.done ? 'Propose Undo' : 'Propose Done') : (item.done ? 'Undo' : 'Done')}", type: "button", action: "toggleTodo", dataId: "${item.id}", dataDone: "${!item.done}", tutorialTarget: "todo-toggle" },
    { id: "todo_item_delete_template", kind: "Button", parent: "todo_item_actions_template", order: 1, template: true, text: "${state.todoResponse && state.todoResponse.authority && state.todoResponse.authority.mode === 'propose' ? 'Propose Delete' : 'Delete'}", type: "button", action: "deleteTodo", dataId: "${item.id}", tutorialTarget: "todo-delete" },
    { id: "private_note_template", kind: "Text", attach: false, template: true, class: "private-note", text: "${item.text}" },
    { id: "private_note_empty_template", kind: "Text", attach: false, template: true, class: "private-note", text: "Sign in to see private notes." }
  ], frontendContext);
  const operatingWidgets = withContext([
    { id: "world_graph_page", kind: "Page", title: "Witness World Graph", attach: false },
    { id: "world_graph_back_link", kind: "Link", parent: "world_graph_page", order: 0, href: "/", text: "< Back to Todo", class: "world-graph-link", tutorialTarget: "world-back-link" },
    { id: "world_graph_process_link", kind: "Link", parent: "world_graph_page", order: 1, href: "/process", text: "Open Process View", class: "world-graph-link", tutorialTarget: "world-process-link" },
    { id: "world_session", kind: "Box", parent: "world_graph_page", order: 2, class: "session-panel", role: "session-panel", tutorialTarget: "world-session-panel" },
    { id: "world_session_title", kind: "Text", parent: "world_session", order: 0, text: "Personal Projection" },
    { id: "world_session_form", kind: "Form", parent: "world_session", order: 1, role: "login-form" },
    { id: "world_username_input", kind: "Input", parent: "world_session_form", order: 0, name: "username", placeholder: "Username", autocomplete: "username" },
    { id: "world_password_input", kind: "Input", parent: "world_session_form", order: 1, name: "password", placeholder: "Password", type: "password", autocomplete: "current-password" },
    { id: "world_open_button", kind: "Button", parent: "world_session_form", order: 2, text: "Sign in", type: "submit" },
    { id: "world_logout_button", kind: "Button", parent: "world_session_form", order: 3, text: "Logout", type: "button", action: "logout" },
    { id: "world_session_status", kind: "Text", parent: "world_session", order: 2, text: "Not signed in", role: "session-status" },
    { id: "world_graph_title", kind: "Heading", parent: "world_graph_page", order: 3, text: "World Graph", level: 1 },
    { id: "world_graph_canvas", kind: "Box", parent: "world_graph_page", order: 4, class: "world-graph-body", role: "world-graph-body" }
  ], frontendContext);

  const program = withRecordContext({ id: "todo_frontend_program", rootWidget: "todo_app_widget" }, frontendContext);
  const operatingPrograms = withContext([{ id: "world_graph_program", rootWidget: "world_graph_page" }], frontendContext);
  const backendPrograms = [
    { soul: "todo.todos.list", label: "Todo Todos List", context: "backend" },
    { soul: "todo.todos.create", label: "Todo Todos Create", context: "backend" },
    { soul: "todo.todos.update", label: "Todo Todos Update", context: "backend" },
    { soul: "todo.todos.delete", label: "Todo Todos Delete", context: "backend" },
    { soul: "todo.privateNotes.list", label: "Todo Private Notes List", context: "backend" },
    { soul: "todo.privateNotes.create", label: "Todo Private Notes Create", context: "backend" },
    { soul: "todo.widgets.create", label: "Todo Widgets Create", context: "backend" },
    { soul: "todo.witnesses.list", label: "Todo Witnesses List", context: "backend" },
    { soul: "todo.network.simulateError", label: "Todo Network Simulate Error", context: "backend" },
    { soul: "todo.worldGraph.read", label: "Todo World Graph Read", context: "backend" },
    { soul: "todo.processView.read", label: "Todo Process View Read", context: "backend" },
    { soul: "todo.processRun.read", label: "Todo Process Run Read", context: "backend" },
    { soul: "todo.processEvents.record", label: "Todo Process Events Record", context: "backend" }
  ];
  const backendProgramVersions = [
    { soul: "todo.todos.list", version: "todo.todos.list.v1", index: 0, context: "backend" },
    { soul: "todo.todos.create", version: "todo.todos.create.v1", index: 0, context: "backend" },
    { soul: "todo.todos.update", version: "todo.todos.update.v1", index: 0, context: "backend" },
    { soul: "todo.todos.delete", version: "todo.todos.delete.v1", index: 0, context: "backend" },
    { soul: "todo.privateNotes.list", version: "todo.privateNotes.list.v1", index: 0, context: "backend" },
    { soul: "todo.privateNotes.create", version: "todo.privateNotes.create.v1", index: 0, context: "backend" },
    { soul: "todo.widgets.create", version: "todo.widgets.create.v1", index: 0, context: "backend" },
    { soul: "todo.witnesses.list", version: "todo.witnesses.list.v1", index: 0, context: "backend" },
    { soul: "todo.network.simulateError", version: "todo.network.simulateError.v1", index: 0, context: "backend" },
    { soul: "todo.worldGraph.read", version: "todo.worldGraph.read.v1", index: 0, context: "backend" },
    { soul: "todo.processView.read", version: "todo.processView.read.v1", index: 0, context: "backend" },
    { soul: "todo.processRun.read", version: "todo.processRun.read.v1", index: 0, context: "backend" },
    { soul: "todo.processEvents.record", version: "todo.processEvents.record.v1", index: 0, context: "backend" },
    {
      soul: "todo.todos.list",
      version: "todo.todos.list.v2",
      index: 1,
      context: "backend",
      transitionFrom: "todo.todos.list.v1",
      transitionStrategy: "compatible"
    },
    {
      soul: "todo.todos.create",
      version: "todo.todos.create.v2",
      index: 1,
      context: "backend",
      transitionFrom: "todo.todos.create.v1",
      transitionStrategy: "compatible"
    },
    {
      soul: "todo.todos.update",
      version: "todo.todos.update.v2",
      index: 1,
      context: "backend",
      transitionFrom: "todo.todos.update.v1",
      transitionStrategy: "compatible"
    },
    {
      soul: "todo.todos.delete",
      version: "todo.todos.delete.v2",
      index: 1,
      context: "backend",
      transitionFrom: "todo.todos.delete.v1",
      transitionStrategy: "compatible"
    },
    {
      soul: "todo.privateNotes.list",
      version: "todo.privateNotes.list.v2",
      index: 1,
      context: "backend",
      transitionFrom: "todo.privateNotes.list.v1",
      transitionStrategy: "compatible"
    },
    {
      soul: "todo.privateNotes.create",
      version: "todo.privateNotes.create.v2",
      index: 1,
      context: "backend",
      transitionFrom: "todo.privateNotes.create.v1",
      transitionStrategy: "compatible"
    },
    {
      soul: "todo.widgets.create",
      version: "todo.widgets.create.v2",
      index: 1,
      context: "backend",
      transitionFrom: "todo.widgets.create.v1",
      transitionStrategy: "compatible"
    },
    {
      soul: "todo.witnesses.list",
      version: "todo.witnesses.list.v2",
      index: 1,
      context: "backend",
      transitionFrom: "todo.witnesses.list.v1",
      transitionStrategy: "compatible"
    },
    {
      soul: "todo.network.simulateError",
      version: "todo.network.simulateError.v2",
      index: 1,
      context: "backend",
      transitionFrom: "todo.network.simulateError.v1",
      transitionStrategy: "compatible"
    },
    {
      soul: "todo.worldGraph.read",
      version: "todo.worldGraph.read.v2",
      index: 1,
      context: "backend",
      transitionFrom: "todo.worldGraph.read.v1",
      transitionStrategy: "compatible"
    },
    {
      soul: "todo.processView.read",
      version: "todo.processView.read.v2",
      index: 1,
      context: "backend",
      transitionFrom: "todo.processView.read.v1",
      transitionStrategy: "compatible"
    },
    {
      soul: "todo.processRun.read",
      version: "todo.processRun.read.v2",
      index: 1,
      context: "backend",
      transitionFrom: "todo.processRun.read.v1",
      transitionStrategy: "compatible"
    },
    {
      soul: "todo.processEvents.record",
      version: "todo.processEvents.record.v2",
      index: 1,
      context: "backend",
      transitionFrom: "todo.processEvents.record.v1",
      transitionStrategy: "compatible"
    }
  ];
  const backendProgramVersionTransitions = [
    {
      soul: "todo.todos.list",
      from: "todo.todos.list.v2",
      to: "todo.todos.list.v1",
      strategy: "compatible"
    },
    {
      soul: "todo.todos.create",
      from: "todo.todos.create.v2",
      to: "todo.todos.create.v1",
      strategy: "compatible"
    },
    {
      soul: "todo.todos.update",
      from: "todo.todos.update.v2",
      to: "todo.todos.update.v1",
      strategy: "compatible"
    },
    {
      soul: "todo.todos.delete",
      from: "todo.todos.delete.v2",
      to: "todo.todos.delete.v1",
      strategy: "compatible"
    },
    {
      soul: "todo.privateNotes.list",
      from: "todo.privateNotes.list.v2",
      to: "todo.privateNotes.list.v1",
      strategy: "compatible"
    },
    {
      soul: "todo.privateNotes.create",
      from: "todo.privateNotes.create.v2",
      to: "todo.privateNotes.create.v1",
      strategy: "compatible"
    },
    {
      soul: "todo.widgets.create",
      from: "todo.widgets.create.v2",
      to: "todo.widgets.create.v1",
      strategy: "compatible"
    },
    {
      soul: "todo.witnesses.list",
      from: "todo.witnesses.list.v2",
      to: "todo.witnesses.list.v1",
      strategy: "compatible"
    },
    {
      soul: "todo.network.simulateError",
      from: "todo.network.simulateError.v2",
      to: "todo.network.simulateError.v1",
      strategy: "compatible"
    },
    {
      soul: "todo.worldGraph.read",
      from: "todo.worldGraph.read.v2",
      to: "todo.worldGraph.read.v1",
      strategy: "compatible"
    },
    {
      soul: "todo.processView.read",
      from: "todo.processView.read.v2",
      to: "todo.processView.read.v1",
      strategy: "compatible"
    },
    {
      soul: "todo.processRun.read",
      from: "todo.processRun.read.v2",
      to: "todo.processRun.read.v1",
      strategy: "compatible"
    },
    {
      soul: "todo.processEvents.record",
      from: "todo.processEvents.record.v2",
      to: "todo.processEvents.record.v1",
      strategy: "compatible"
    }
  ];
  const backendSteps = [
    {
      version: "todo.todos.list.v1",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "todos.readModel", method: "GET", path: "/api/todos", into: "todoResponse" })
    },
    {
      version: "todo.todos.list.v1",
      event: "request",
      op: "response.json",
      order: 1,
      paramsJson: JSON.stringify({ from: "todoResponse" })
    },
    {
      version: "todo.todos.list.v2",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "todos.readModel", method: "GET", path: "/api/todos", into: "todoResponse" })
    },
    {
      version: "todo.todos.list.v2",
      event: "request",
      op: "state.assign",
      order: 1,
      paramsJson: JSON.stringify({ into: "meta.version", value: "v2" })
    },
    {
      version: "todo.todos.list.v2",
      event: "request",
      op: "run",
      order: 2,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.todos.list.v2",
      event: "respond",
      op: "response.json",
      order: 0,
      paramsJson: JSON.stringify({ from: "todoResponse" })
    },
    {
      version: "todo.todos.create.v1",
      event: "request",
      op: "request.readJson",
      order: 0,
      paramsJson: JSON.stringify({ into: "draftTodo" })
    },
    {
      version: "todo.todos.create.v1",
      event: "request",
      op: "handler.invoke",
      order: 1,
      paramsJson: JSON.stringify({ handler: "todos.createModel", method: "POST", path: "/api/todos", from: "draftTodo", into: "createResult", allowFailure: true })
    },
    {
      version: "todo.todos.create.v1",
      event: "request",
      op: "run",
      order: 2,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.todos.create.v1",
      event: "respond",
      op: "response.json",
      order: 0,
      whenJson: JSON.stringify({ path: "createResult.ok", truthy: true }),
      paramsJson: JSON.stringify({ from: "createResult.payload", statusFrom: "createResult.status" })
    },
    {
      version: "todo.todos.create.v1",
      event: "respond",
      op: "response.error",
      order: 1,
      whenJson: JSON.stringify({ path: "createResult.ok", falsy: true }),
      paramsJson: JSON.stringify({ statusFrom: "createResult.status", messageFrom: "createResult.error", bodyFrom: "createResult.payload" })
    },
    {
      version: "todo.todos.create.v2",
      event: "request",
      op: "request.readJson",
      order: 0,
      paramsJson: JSON.stringify({ into: "draftTodo" })
    },
    {
      version: "todo.todos.create.v2",
      event: "request",
      op: "handler.invoke",
      order: 1,
      paramsJson: JSON.stringify({ handler: "todos.createModel", method: "POST", path: "/api/todos", from: "draftTodo", into: "createResult", allowFailure: true })
    },
    {
      version: "todo.todos.create.v2",
      event: "request",
      op: "state.assign",
      order: 2,
      paramsJson: JSON.stringify({ into: "meta.version", value: "v2" })
    },
    {
      version: "todo.todos.create.v2",
      event: "request",
      op: "run",
      order: 3,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.todos.create.v2",
      event: "respond",
      op: "response.json",
      order: 0,
      whenJson: JSON.stringify({ path: "createResult.ok", truthy: true }),
      paramsJson: JSON.stringify({ from: "createResult.payload", statusFrom: "createResult.status" })
    },
    {
      version: "todo.todos.create.v2",
      event: "respond",
      op: "response.error",
      order: 1,
      whenJson: JSON.stringify({ path: "createResult.ok", falsy: true }),
      paramsJson: JSON.stringify({ statusFrom: "createResult.status", messageFrom: "createResult.error", bodyFrom: "createResult.payload" })
    },
    {
      version: "todo.todos.update.v1",
      event: "request",
      op: "request.readJson",
      order: 0,
      paramsJson: JSON.stringify({ into: "todoPatch" })
    },
    {
      version: "todo.todos.update.v1",
      event: "request",
      op: "state.assign",
      order: 1,
      paramsJson: JSON.stringify({ into: "todoPatch.id", from: "request.params.id" })
    },
    {
      version: "todo.todos.update.v1",
      event: "request",
      op: "handler.invoke",
      order: 2,
      paramsJson: JSON.stringify({ handler: "todos.updateModel", method: "PATCH", path: "/api/todos/${state.request.params.id}", from: "todoPatch", into: "updateResult", allowFailure: true, params: { id: "${state.request.params.id}" } })
    },
    {
      version: "todo.todos.update.v1",
      event: "request",
      op: "run",
      order: 3,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.todos.update.v1",
      event: "respond",
      op: "response.json",
      order: 0,
      whenJson: JSON.stringify({ path: "updateResult.ok", truthy: true }),
      paramsJson: JSON.stringify({ from: "updateResult.payload", statusFrom: "updateResult.status" })
    },
    {
      version: "todo.todos.update.v1",
      event: "respond",
      op: "response.error",
      order: 1,
      whenJson: JSON.stringify({ path: "updateResult.ok", falsy: true }),
      paramsJson: JSON.stringify({ statusFrom: "updateResult.status", messageFrom: "updateResult.error", bodyFrom: "updateResult.payload" })
    },
    {
      version: "todo.todos.update.v2",
      event: "request",
      op: "request.readJson",
      order: 0,
      paramsJson: JSON.stringify({ into: "todoPatch" })
    },
    {
      version: "todo.todos.update.v2",
      event: "request",
      op: "state.assign",
      order: 1,
      paramsJson: JSON.stringify({ into: "todoPatch.id", from: "request.params.id" })
    },
    {
      version: "todo.todos.update.v2",
      event: "request",
      op: "handler.invoke",
      order: 2,
      paramsJson: JSON.stringify({ handler: "todos.updateModel", method: "PATCH", path: "/api/todos/${state.request.params.id}", from: "todoPatch", into: "updateResult", allowFailure: true, params: { id: "${state.request.params.id}" } })
    },
    {
      version: "todo.todos.update.v2",
      event: "request",
      op: "state.assign",
      order: 3,
      paramsJson: JSON.stringify({ into: "meta.version", value: "v2" })
    },
    {
      version: "todo.todos.update.v2",
      event: "request",
      op: "run",
      order: 4,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.todos.update.v2",
      event: "respond",
      op: "response.json",
      order: 0,
      whenJson: JSON.stringify({ path: "updateResult.ok", truthy: true }),
      paramsJson: JSON.stringify({ from: "updateResult.payload", statusFrom: "updateResult.status" })
    },
    {
      version: "todo.todos.update.v2",
      event: "respond",
      op: "response.error",
      order: 1,
      whenJson: JSON.stringify({ path: "updateResult.ok", falsy: true }),
      paramsJson: JSON.stringify({ statusFrom: "updateResult.status", messageFrom: "updateResult.error", bodyFrom: "updateResult.payload" })
    },
    {
      version: "todo.todos.delete.v1",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "todos.deleteModel", method: "DELETE", path: "/api/todos/${state.request.params.id}", into: "deleteResult", allowFailure: true, params: { id: "${state.request.params.id}" } })
    },
    {
      version: "todo.todos.delete.v1",
      event: "request",
      op: "run",
      order: 1,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.todos.delete.v1",
      event: "respond",
      op: "response.json",
      order: 0,
      whenJson: JSON.stringify({ path: "deleteResult.ok", truthy: true }),
      paramsJson: JSON.stringify({ from: "deleteResult.payload", statusFrom: "deleteResult.status" })
    },
    {
      version: "todo.todos.delete.v1",
      event: "respond",
      op: "response.error",
      order: 1,
      whenJson: JSON.stringify({ path: "deleteResult.ok", falsy: true }),
      paramsJson: JSON.stringify({ statusFrom: "deleteResult.status", messageFrom: "deleteResult.error", bodyFrom: "deleteResult.payload" })
    },
    {
      version: "todo.todos.delete.v2",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "todos.deleteModel", method: "DELETE", path: "/api/todos/${state.request.params.id}", into: "deleteResult", allowFailure: true, params: { id: "${state.request.params.id}" } })
    },
    {
      version: "todo.todos.delete.v2",
      event: "request",
      op: "state.assign",
      order: 1,
      paramsJson: JSON.stringify({ into: "meta.version", value: "v2" })
    },
    {
      version: "todo.todos.delete.v2",
      event: "request",
      op: "run",
      order: 2,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.todos.delete.v2",
      event: "respond",
      op: "response.json",
      order: 0,
      whenJson: JSON.stringify({ path: "deleteResult.ok", truthy: true }),
      paramsJson: JSON.stringify({ from: "deleteResult.payload", statusFrom: "deleteResult.status" })
    },
    {
      version: "todo.todos.delete.v2",
      event: "respond",
      op: "response.error",
      order: 1,
      whenJson: JSON.stringify({ path: "deleteResult.ok", falsy: true }),
      paramsJson: JSON.stringify({ statusFrom: "deleteResult.status", messageFrom: "deleteResult.error", bodyFrom: "deleteResult.payload" })
    },
    {
      version: "todo.privateNotes.list.v1",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "privateNotes.readModel", method: "GET", path: "/api/private-notes", into: "privateNotesResponse" })
    },
    {
      version: "todo.privateNotes.list.v1",
      event: "request",
      op: "response.json",
      order: 1,
      paramsJson: JSON.stringify({ from: "privateNotesResponse" })
    },
    {
      version: "todo.privateNotes.list.v2",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "privateNotes.readModel", method: "GET", path: "/api/private-notes", into: "privateNotesResponse" })
    },
    {
      version: "todo.privateNotes.list.v2",
      event: "request",
      op: "state.assign",
      order: 1,
      paramsJson: JSON.stringify({ into: "meta.version", value: "v2" })
    },
    {
      version: "todo.privateNotes.list.v2",
      event: "request",
      op: "run",
      order: 2,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.privateNotes.list.v2",
      event: "respond",
      op: "response.json",
      order: 0,
      paramsJson: JSON.stringify({ from: "privateNotesResponse" })
    },
    {
      version: "todo.privateNotes.create.v1",
      event: "request",
      op: "request.readJson",
      order: 0,
      paramsJson: JSON.stringify({ into: "privateNoteDraft" })
    },
    {
      version: "todo.privateNotes.create.v1",
      event: "request",
      op: "handler.invoke",
      order: 1,
      paramsJson: JSON.stringify({ handler: "privateNotes.createModel", method: "POST", path: "/api/private-notes", from: "privateNoteDraft", into: "privateNoteResult", allowFailure: true })
    },
    {
      version: "todo.privateNotes.create.v1",
      event: "request",
      op: "run",
      order: 2,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.privateNotes.create.v1",
      event: "respond",
      op: "response.json",
      order: 0,
      whenJson: JSON.stringify({ path: "privateNoteResult.ok", truthy: true }),
      paramsJson: JSON.stringify({ from: "privateNoteResult.payload", statusFrom: "privateNoteResult.status" })
    },
    {
      version: "todo.privateNotes.create.v1",
      event: "respond",
      op: "response.error",
      order: 1,
      whenJson: JSON.stringify({ path: "privateNoteResult.ok", falsy: true }),
      paramsJson: JSON.stringify({ statusFrom: "privateNoteResult.status", messageFrom: "privateNoteResult.error", bodyFrom: "privateNoteResult.payload" })
    },
    {
      version: "todo.privateNotes.create.v2",
      event: "request",
      op: "request.readJson",
      order: 0,
      paramsJson: JSON.stringify({ into: "privateNoteDraft" })
    },
    {
      version: "todo.privateNotes.create.v2",
      event: "request",
      op: "handler.invoke",
      order: 1,
      paramsJson: JSON.stringify({ handler: "privateNotes.createModel", method: "POST", path: "/api/private-notes", from: "privateNoteDraft", into: "privateNoteResult", allowFailure: true })
    },
    {
      version: "todo.privateNotes.create.v2",
      event: "request",
      op: "state.assign",
      order: 2,
      paramsJson: JSON.stringify({ into: "meta.version", value: "v2" })
    },
    {
      version: "todo.privateNotes.create.v2",
      event: "request",
      op: "run",
      order: 3,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.privateNotes.create.v2",
      event: "respond",
      op: "response.json",
      order: 0,
      whenJson: JSON.stringify({ path: "privateNoteResult.ok", truthy: true }),
      paramsJson: JSON.stringify({ from: "privateNoteResult.payload", statusFrom: "privateNoteResult.status" })
    },
    {
      version: "todo.privateNotes.create.v2",
      event: "respond",
      op: "response.error",
      order: 1,
      whenJson: JSON.stringify({ path: "privateNoteResult.ok", falsy: true }),
      paramsJson: JSON.stringify({ statusFrom: "privateNoteResult.status", messageFrom: "privateNoteResult.error", bodyFrom: "privateNoteResult.payload" })
    },
    {
      version: "todo.widgets.create.v1",
      event: "request",
      op: "request.readJson",
      order: 0,
      paramsJson: JSON.stringify({ into: "widgetDraft" })
    },
    {
      version: "todo.widgets.create.v1",
      event: "request",
      op: "state.assign",
      order: 1,
      paramsJson: JSON.stringify({ into: "widgetDraft.parent", value: "todo_app_widget" })
    },
    {
      version: "todo.widgets.create.v1",
      event: "request",
      op: "handler.invoke",
      order: 2,
      paramsJson: JSON.stringify({ handler: "widgets.createModel", method: "POST", path: "/api/widgets", from: "widgetDraft", into: "widgetCreateResult", allowFailure: true, params: { rootWidget: "todo_app_widget", context: "frontend" } })
    },
    {
      version: "todo.widgets.create.v1",
      event: "request",
      op: "run",
      order: 3,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.widgets.create.v1",
      event: "respond",
      op: "response.json",
      order: 0,
      whenJson: JSON.stringify({ path: "widgetCreateResult.ok", truthy: true }),
      paramsJson: JSON.stringify({ from: "widgetCreateResult.payload", statusFrom: "widgetCreateResult.status" })
    },
    {
      version: "todo.widgets.create.v1",
      event: "respond",
      op: "response.error",
      order: 1,
      whenJson: JSON.stringify({ path: "widgetCreateResult.ok", falsy: true }),
      paramsJson: JSON.stringify({ statusFrom: "widgetCreateResult.status", messageFrom: "widgetCreateResult.error", bodyFrom: "widgetCreateResult.payload" })
    },
    {
      version: "todo.widgets.create.v2",
      event: "request",
      op: "request.readJson",
      order: 0,
      paramsJson: JSON.stringify({ into: "widgetDraft" })
    },
    {
      version: "todo.widgets.create.v2",
      event: "request",
      op: "state.assign",
      order: 1,
      paramsJson: JSON.stringify({ into: "widgetDraft.parent", value: "todo_app_widget" })
    },
    {
      version: "todo.widgets.create.v2",
      event: "request",
      op: "handler.invoke",
      order: 2,
      paramsJson: JSON.stringify({ handler: "widgets.createModel", method: "POST", path: "/api/widgets", from: "widgetDraft", into: "widgetCreateResult", allowFailure: true, params: { rootWidget: "todo_app_widget", context: "frontend" } })
    },
    {
      version: "todo.widgets.create.v2",
      event: "request",
      op: "state.assign",
      order: 3,
      paramsJson: JSON.stringify({ into: "meta.version", value: "v2" })
    },
    {
      version: "todo.widgets.create.v2",
      event: "request",
      op: "run",
      order: 4,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.widgets.create.v2",
      event: "respond",
      op: "response.json",
      order: 0,
      whenJson: JSON.stringify({ path: "widgetCreateResult.ok", truthy: true }),
      paramsJson: JSON.stringify({ from: "widgetCreateResult.payload", statusFrom: "widgetCreateResult.status" })
    },
    {
      version: "todo.widgets.create.v2",
      event: "respond",
      op: "response.error",
      order: 1,
      whenJson: JSON.stringify({ path: "widgetCreateResult.ok", falsy: true }),
      paramsJson: JSON.stringify({ statusFrom: "widgetCreateResult.status", messageFrom: "widgetCreateResult.error", bodyFrom: "widgetCreateResult.payload" })
    },
    {
      version: "todo.witnesses.list.v1",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "witnesses.list", method: "GET", path: "/api/witnesses", query: "${state.request.query}", into: "witnessResponse" })
    },
    {
      version: "todo.witnesses.list.v1",
      event: "request",
      op: "response.json",
      order: 1,
      paramsJson: JSON.stringify({ from: "witnessResponse" })
    },
    {
      version: "todo.witnesses.list.v2",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "witnesses.list", method: "GET", path: "/api/witnesses", query: "${state.request.query}", into: "witnessResponse" })
    },
    {
      version: "todo.witnesses.list.v2",
      event: "request",
      op: "state.assign",
      order: 1,
      paramsJson: JSON.stringify({ into: "meta.version", value: "v2" })
    },
    {
      version: "todo.witnesses.list.v2",
      event: "request",
      op: "run",
      order: 2,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.witnesses.list.v2",
      event: "respond",
      op: "response.json",
      order: 0,
      paramsJson: JSON.stringify({ from: "witnessResponse" })
    },
    {
      version: "todo.network.simulateError.v1",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "network.simulateModel", method: "GET", path: "/api/simulate-network-error", into: "networkFailure", allowFailure: true })
    },
    {
      version: "todo.network.simulateError.v1",
      event: "request",
      op: "response.error",
      order: 1,
      paramsJson: JSON.stringify({ statusFrom: "networkFailure.status", messageFrom: "networkFailure.error", bodyFrom: "networkFailure.payload" })
    },
    {
      version: "todo.network.simulateError.v2",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "network.simulateModel", method: "GET", path: "/api/simulate-network-error", into: "networkFailure", allowFailure: true })
    },
    {
      version: "todo.network.simulateError.v2",
      event: "request",
      op: "state.assign",
      order: 1,
      paramsJson: JSON.stringify({ into: "meta.version", value: "v2" })
    },
    {
      version: "todo.network.simulateError.v2",
      event: "request",
      op: "run",
      order: 2,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.network.simulateError.v2",
      event: "respond",
      op: "response.error",
      order: 0,
      paramsJson: JSON.stringify({ statusFrom: "networkFailure.status", messageFrom: "networkFailure.error", bodyFrom: "networkFailure.payload" })
    },
    {
      version: "todo.worldGraph.read.v1",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "worldGraph.read", method: "GET", path: "/api/world-graph", into: "worldGraphResponse" })
    },
    {
      version: "todo.worldGraph.read.v1",
      event: "request",
      op: "response.json",
      order: 1,
      paramsJson: JSON.stringify({ from: "worldGraphResponse" })
    },
    {
      version: "todo.worldGraph.read.v2",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "worldGraph.read", method: "GET", path: "/api/world-graph", into: "worldGraphResponse" })
    },
    {
      version: "todo.worldGraph.read.v2",
      event: "request",
      op: "state.assign",
      order: 1,
      paramsJson: JSON.stringify({ into: "meta.version", value: "v2" })
    },
    {
      version: "todo.worldGraph.read.v2",
      event: "request",
      op: "run",
      order: 2,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.worldGraph.read.v2",
      event: "respond",
      op: "response.json",
      order: 0,
      paramsJson: JSON.stringify({ from: "worldGraphResponse" })
    },
    {
      version: "todo.processView.read.v1",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "processView.read", method: "GET", path: "/api/process-view", query: "${state.request.query}", into: "processViewResponse" })
    },
    {
      version: "todo.processView.read.v1",
      event: "request",
      op: "response.json",
      order: 1,
      paramsJson: JSON.stringify({ from: "processViewResponse" })
    },
    {
      version: "todo.processView.read.v2",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "processView.read", method: "GET", path: "/api/process-view", query: "${state.request.query}", into: "processViewResponse" })
    },
    {
      version: "todo.processView.read.v2",
      event: "request",
      op: "state.assign",
      order: 1,
      paramsJson: JSON.stringify({ into: "meta.version", value: "v2" })
    },
    {
      version: "todo.processView.read.v2",
      event: "request",
      op: "run",
      order: 2,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.processView.read.v2",
      event: "respond",
      op: "response.json",
      order: 0,
      paramsJson: JSON.stringify({ from: "processViewResponse" })
    },
    {
      version: "todo.processRun.read.v1",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "processRun.read", method: "GET", path: "/api/process-runs/${state.request.params.runId}", query: "${state.request.query}", into: "processRunResponse", params: { runId: "${state.request.params.runId}" } })
    },
    {
      version: "todo.processRun.read.v1",
      event: "request",
      op: "response.json",
      order: 1,
      paramsJson: JSON.stringify({ from: "processRunResponse" })
    },
    {
      version: "todo.processRun.read.v2",
      event: "request",
      op: "handler.invoke",
      order: 0,
      paramsJson: JSON.stringify({ handler: "processRun.read", method: "GET", path: "/api/process-runs/${state.request.params.runId}", query: "${state.request.query}", into: "processRunResponse", params: { runId: "${state.request.params.runId}" } })
    },
    {
      version: "todo.processRun.read.v2",
      event: "request",
      op: "state.assign",
      order: 1,
      paramsJson: JSON.stringify({ into: "meta.version", value: "v2" })
    },
    {
      version: "todo.processRun.read.v2",
      event: "request",
      op: "run",
      order: 2,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.processRun.read.v2",
      event: "respond",
      op: "response.json",
      order: 0,
      paramsJson: JSON.stringify({ from: "processRunResponse" })
    },
    {
      version: "todo.processEvents.record.v1",
      event: "request",
      op: "request.readJson",
      order: 0,
      paramsJson: JSON.stringify({ into: "traceEvent" })
    },
    {
      version: "todo.processEvents.record.v1",
      event: "request",
      op: "handler.invoke",
      order: 1,
      paramsJson: JSON.stringify({ handler: "processEvents.record", method: "POST", path: "/api/process-events", from: "traceEvent", into: "processEventResult", allowFailure: true })
    },
    {
      version: "todo.processEvents.record.v1",
      event: "request",
      op: "run",
      order: 2,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.processEvents.record.v1",
      event: "respond",
      op: "response.json",
      order: 0,
      whenJson: JSON.stringify({ path: "processEventResult.ok", truthy: true }),
      paramsJson: JSON.stringify({ from: "processEventResult" })
    },
    {
      version: "todo.processEvents.record.v1",
      event: "respond",
      op: "response.error",
      order: 1,
      whenJson: JSON.stringify({ path: "processEventResult.ok", falsy: true }),
      paramsJson: JSON.stringify({ messageFrom: "processEventResult.error", bodyFrom: "processEventResult" })
    },
    {
      version: "todo.processEvents.record.v2",
      event: "request",
      op: "request.readJson",
      order: 0,
      paramsJson: JSON.stringify({ into: "traceEvent" })
    },
    {
      version: "todo.processEvents.record.v2",
      event: "request",
      op: "handler.invoke",
      order: 1,
      paramsJson: JSON.stringify({ handler: "processEvents.record", method: "POST", path: "/api/process-events", from: "traceEvent", into: "processEventResult", allowFailure: true })
    },
    {
      version: "todo.processEvents.record.v2",
      event: "request",
      op: "state.assign",
      order: 2,
      paramsJson: JSON.stringify({ into: "meta.version", value: "v2" })
    },
    {
      version: "todo.processEvents.record.v2",
      event: "request",
      op: "run",
      order: 3,
      paramsJson: JSON.stringify({ event: "respond" })
    },
    {
      version: "todo.processEvents.record.v2",
      event: "respond",
      op: "response.json",
      order: 0,
      whenJson: JSON.stringify({ path: "processEventResult.ok", truthy: true }),
      paramsJson: JSON.stringify({ from: "processEventResult" })
    },
    {
      version: "todo.processEvents.record.v2",
      event: "respond",
      op: "response.error",
      order: 1,
      whenJson: JSON.stringify({ path: "processEventResult.ok", falsy: true }),
      paramsJson: JSON.stringify({ messageFrom: "processEventResult.error", bodyFrom: "processEventResult" })
    }
  ];
  const backendActivations = [
    { soul: "todo.todos.list", version: "todo.todos.list.v1" },
    { soul: "todo.todos.create", version: "todo.todos.create.v1" },
    { soul: "todo.todos.update", version: "todo.todos.update.v1" },
    { soul: "todo.todos.delete", version: "todo.todos.delete.v1" },
    { soul: "todo.privateNotes.list", version: "todo.privateNotes.list.v1" },
    { soul: "todo.privateNotes.create", version: "todo.privateNotes.create.v1" },
    { soul: "todo.widgets.create", version: "todo.widgets.create.v1" },
    { soul: "todo.witnesses.list", version: "todo.witnesses.list.v1" },
    { soul: "todo.network.simulateError", version: "todo.network.simulateError.v1" },
    { soul: "todo.worldGraph.read", version: "todo.worldGraph.read.v1" },
    { soul: "todo.processView.read", version: "todo.processView.read.v1" },
    { soul: "todo.processRun.read", version: "todo.processRun.read.v1" },
    { soul: "todo.processEvents.record", version: "todo.processEvents.record.v1" }
  ];

  const steps = [
    { program: "todo_frontend_program", event: "load", op: "initSession", order: 0, paramsJson: "{}" },
    { program: "todo_frontend_program", event: "load", op: "setText", order: 1, paramsJson: JSON.stringify({ widget: "todo_session_status", text: "${state.session && state.session.authenticated ? 'Signed in as ' + state.session.label + ' (' + state.session.actor + ')' + (state.session.perspective ? ' in ' + state.session.perspective : '') : 'Not signed in'}" }) },
    { program: "todo_frontend_program", event: "load", op: "setText", order: 2, paramsJson: JSON.stringify({ widget: "todo_status", text: "Loading..." }) },
    { program: "todo_frontend_program", event: "load", op: "fetchJson", order: 3, paramsJson: JSON.stringify({ url: "/api/todos", into: "todoResponse" }) },
    { program: "todo_frontend_program", event: "load", op: "setText", order: 4, paramsJson: JSON.stringify({ widget: "todo_add_button", text: "${state.todoResponse && state.todoResponse.authority && state.todoResponse.authority.mode === 'propose' ? 'Propose Add' : 'Add'}" }) },
    { program: "todo_frontend_program", event: "load", op: "renderCollection", order: 5, paramsJson: JSON.stringify({ widget: "todo_list", from: "todoResponse.todos", template: "todo_item_template" }) },
    { program: "todo_frontend_program", event: "load", op: "fetchJson", order: 6, paramsJson: JSON.stringify({ url: "/api/private-notes", into: "privateNotesResponse" }) },
    { program: "todo_frontend_program", event: "load", op: "setText", order: 7, paramsJson: JSON.stringify({ widget: "todo_private_notes_status", text: "${state.privateNotesResponse && state.privateNotesResponse.privacy && state.privateNotesResponse.privacy.mode === 'private' ? 'Only you can see these notes in your current perspective.' : 'Sign in to see and save notes that belong only to you.'}" }) },
    { program: "todo_frontend_program", event: "load", op: "renderCollection", order: 8, paramsJson: JSON.stringify({ widget: "todo_private_note_list", from: "privateNotesResponse.notes", template: "private_note_template", emptyWidget: "private_note_empty_template" }) },
    { program: "todo_frontend_program", event: "load", op: "setText", order: 9, paramsJson: JSON.stringify({ widget: "todo_status", text: "${state.todoResponse && state.todoResponse.authority && state.todoResponse.authority.mode === 'propose' ? 'Ready. Shared app changes are read-only here. Todo, widget, and version changes will be proposed for review.' : (state.todoResponse && state.todoResponse.authority && state.todoResponse.authority.mode === 'signin' ? 'Ready. Sign in to change shared app state.' : 'Ready')}" }) },
    { program: "todo_frontend_program", event: "load", op: "setText", order: 10, paramsJson: JSON.stringify({ widget: "todo_widget_editor_button", text: "${state.todoResponse && state.todoResponse.authority && state.todoResponse.authority.mode === 'propose' ? 'Propose Add Widget' : 'Add Widget'}" }) },
    { program: "todo_frontend_program", event: "submit:todo_form", op: "readForm", order: 0, paramsJson: JSON.stringify({ widget: "todo_form", into: "draftTodo" }) },
    { program: "todo_frontend_program", event: "submit:todo_form", op: "setText", order: 1, paramsJson: JSON.stringify({ widget: "todo_status", text: "${state.todoResponse && state.todoResponse.authority && state.todoResponse.authority.mode === 'propose' ? 'Proposing add...' : 'Saving...'}" }) },
    { program: "todo_frontend_program", event: "submit:todo_form", op: "postJson", order: 2, paramsJson: JSON.stringify({ url: "/api/todos", method: "POST", from: "draftTodo", pick: ["title"], into: "createdTodo" }) },
    { program: "todo_frontend_program", event: "submit:todo_form", op: "clearForm", order: 3, paramsJson: JSON.stringify({ widget: "todo_form" }) },
    { program: "todo_frontend_program", event: "submit:todo_form", op: "run", order: 4, paramsJson: JSON.stringify({ event: "load" }) },
    { program: "todo_frontend_program", event: "submit:todo_form", op: "setText", order: 5, paramsJson: JSON.stringify({ widget: "todo_status", text: "${state.createdTodo && state.createdTodo.statusMessage ? state.createdTodo.statusMessage : 'Saved.'}" }) },
    { program: "todo_frontend_program", event: "click:toggleTodo", op: "setText", order: 0, paramsJson: JSON.stringify({ widget: "todo_status", text: "${state.todoResponse && state.todoResponse.authority && state.todoResponse.authority.mode === 'propose' ? 'Proposing update...' : 'Updating...'}" }) },
    { program: "todo_frontend_program", event: "click:toggleTodo", op: "patchJson", order: 1, paramsJson: JSON.stringify({ url: "/api/todos/${event.id}", body: { done: "${event.done}" }, into: "updatedTodo" }) },
    { program: "todo_frontend_program", event: "click:toggleTodo", op: "run", order: 2, paramsJson: JSON.stringify({ event: "load" }) },
    { program: "todo_frontend_program", event: "click:toggleTodo", op: "setText", order: 3, paramsJson: JSON.stringify({ widget: "todo_status", text: "${state.updatedTodo && state.updatedTodo.statusMessage ? state.updatedTodo.statusMessage : 'Saved.'}" }) },
    { program: "todo_frontend_program", event: "click:deleteTodo", op: "setText", order: 0, paramsJson: JSON.stringify({ widget: "todo_status", text: "${state.todoResponse && state.todoResponse.authority && state.todoResponse.authority.mode === 'propose' ? 'Proposing delete...' : 'Deleting...'}" }) },
    { program: "todo_frontend_program", event: "click:deleteTodo", op: "deleteJson", order: 1, paramsJson: JSON.stringify({ url: "/api/todos/${event.id}", into: "deletedTodo" }) },
    { program: "todo_frontend_program", event: "click:deleteTodo", op: "run", order: 2, paramsJson: JSON.stringify({ event: "load" }) },
    { program: "todo_frontend_program", event: "click:deleteTodo", op: "setText", order: 3, paramsJson: JSON.stringify({ widget: "todo_status", text: "${state.deletedTodo && state.deletedTodo.statusMessage ? state.deletedTodo.statusMessage : 'Deleted.'}" }) },
    { program: "todo_frontend_program", event: "submit:todo_session_form", op: "readForm", order: 0, paramsJson: JSON.stringify({ widget: "todo_session_form", into: "sessionDraft" }) },
    { program: "todo_frontend_program", event: "submit:todo_session_form", op: "setSession", order: 1, paramsJson: JSON.stringify({ from: "sessionDraft" }) },
    { program: "todo_frontend_program", event: "submit:todo_session_form", op: "run", order: 2, paramsJson: JSON.stringify({ event: "load" }) },
    { program: "todo_frontend_program", event: "click:logout", op: "logout", order: 0, paramsJson: "{}" },
    { program: "todo_frontend_program", event: "click:logout", op: "run", order: 1, paramsJson: JSON.stringify({ event: "load" }) },
    { program: "todo_frontend_program", event: "submit:todo_private_notes_form", op: "readForm", order: 0, paramsJson: JSON.stringify({ widget: "todo_private_notes_form", into: "privateNoteDraft" }) },
    { program: "todo_frontend_program", event: "submit:todo_private_notes_form", op: "postJson", order: 1, paramsJson: JSON.stringify({ url: "/api/private-notes", from: "privateNoteDraft", pick: ["text"], into: "privateNoteCreated" }) },
    { program: "todo_frontend_program", event: "submit:todo_private_notes_form", op: "clearForm", order: 2, paramsJson: JSON.stringify({ widget: "todo_private_notes_form" }) },
    { program: "todo_frontend_program", event: "submit:todo_private_notes_form", op: "run", order: 3, paramsJson: JSON.stringify({ event: "load" }) },
    { program: "todo_frontend_program", event: "submit:todo_widget_editor_form", op: "readForm", order: 0, paramsJson: JSON.stringify({ widget: "todo_widget_editor_form", into: "widgetDraft", schema: "widget.define" }) },
    { program: "todo_frontend_program", event: "submit:todo_widget_editor_form", op: "setText", order: 1, paramsJson: JSON.stringify({ widget: "todo_status", text: "${state.todoResponse && state.todoResponse.authority && state.todoResponse.authority.mode === 'propose' ? 'Proposing widget...' : 'Saving widget...'}" }) },
    { program: "todo_frontend_program", event: "submit:todo_widget_editor_form", op: "postJson", order: 2, paramsJson: JSON.stringify({ url: "/api/widgets", method: "POST", from: "widgetDraft", into: "widgetCreated" }) },
    { program: "todo_frontend_program", event: "submit:todo_widget_editor_form", op: "clearForm", order: 3, paramsJson: JSON.stringify({ widget: "todo_widget_editor_form" }) },
    { program: "todo_frontend_program", event: "submit:todo_widget_editor_form", op: "run", order: 4, paramsJson: JSON.stringify({ event: "load" }) },
    { program: "todo_frontend_program", event: "submit:todo_widget_editor_form", op: "setText", order: 5, paramsJson: JSON.stringify({ widget: "todo_status", text: "${state.widgetCreated && state.widgetCreated.statusMessage ? state.widgetCreated.statusMessage : 'Saved widget.'}" }) },
    { program: "todo_frontend_program", event: "error", op: "setText", order: 0, paramsJson: JSON.stringify({ widget: "todo_status", text: "Failed: ${event.message}" }) }
  ];
  const operatingSteps = [
    { program: "world_graph_program", event: "load", op: "initSession", order: 0, paramsJson: "{}" },
    { program: "world_graph_program", event: "load", op: "setText", order: 1, paramsJson: JSON.stringify({ widget: "world_session_status", text: "${state.session && state.session.authenticated ? 'Signed in as ' + state.session.label + ' (' + state.session.actor + ')' + (state.session.perspective ? ' in ' + state.session.perspective : '') : 'Not signed in'}" }) },
    { program: "world_graph_program", event: "load", op: "fetchJson", order: 2, paramsJson: JSON.stringify({ url: "/api/world-graph", into: "worldGraphResponse" }) },
    { program: "world_graph_program", event: "load", op: "renderWorldGraph", order: 3, paramsJson: JSON.stringify({ widget: "world_graph_canvas", from: "worldGraphResponse.graph" }) },
    { program: "world_graph_program", event: "submit:world_session_form", op: "readForm", order: 0, paramsJson: JSON.stringify({ widget: "world_session_form", into: "worldSessionDraft" }) },
    { program: "world_graph_program", event: "submit:world_session_form", op: "setSession", order: 1, paramsJson: JSON.stringify({ from: "worldSessionDraft" }) },
    { program: "world_graph_program", event: "submit:world_session_form", op: "run", order: 2, paramsJson: JSON.stringify({ event: "load" }) },
    { program: "world_graph_program", event: "click:logout", op: "logout", order: 0, paramsJson: "{}" },
    { program: "world_graph_program", event: "click:logout", op: "run", order: 1, paramsJson: JSON.stringify({ event: "load" }) }
  ];

  const routes = [
    withRecordContext({ id: "home_page_route", path: "/", serves: "todoAppView", method: "GET", handler: "page.home", rootWidget: "todo_app_widget", frontendProgram: "todo_frontend_program", page: "home", liveProjection: true }, frontendContext),
    { id: "session_read_route", path: "/api/session", serves: "session", method: "GET", handler: "session.read" },
    { id: "session_open_route", path: "/api/session", serves: "session", method: "POST", handler: "session.open" },
    { id: "session_logout_route", path: "/api/session", serves: "session", method: "DELETE", handler: "session.logout" },
    { id: "todos_list_route", path: "/api/todos", serves: "todoStore", method: "GET", handler: "backendProgram.run", backendProgramSoul: "todo.todos.list", context: "backend" },
    { id: "todos_create_route", path: "/api/todos", serves: "todoStore", method: "POST", handler: "backendProgram.run", backendProgramSoul: "todo.todos.create", context: "backend" },
    { id: "todos_update_route", path: "/api/todos/:id", serves: "todoStore", method: "PATCH", handler: "backendProgram.run", backendProgramSoul: "todo.todos.update", context: "backend" },
    { id: "todos_delete_route", path: "/api/todos/:id", serves: "todoStore", method: "DELETE", handler: "backendProgram.run", backendProgramSoul: "todo.todos.delete", context: "backend" },
    { id: "private_notes_list_route", path: "/api/private-notes", serves: "privateNotes", method: "GET", handler: "backendProgram.run", backendProgramSoul: "todo.privateNotes.list", context: "backend" },
    { id: "private_notes_create_route", path: "/api/private-notes", serves: "privateNotes", method: "POST", handler: "backendProgram.run", backendProgramSoul: "todo.privateNotes.create", context: "backend" },
    { id: "widgets_create_route", path: "/api/widgets", serves: "widgetEditor", method: "POST", handler: "backendProgram.run", backendProgramSoul: "todo.widgets.create", context: "backend" },
    { id: "witnesses_list_route", path: "/api/witnesses", serves: "witnessLog", method: "GET", handler: "backendProgram.run", backendProgramSoul: "todo.witnesses.list", context: "backend" },
    { id: "network_simulate_route", path: "/api/simulate-network-error", serves: "networkFailure", method: "GET", handler: "backendProgram.run", backendProgramSoul: "todo.network.simulateError", context: "backend" },
    { id: "events_stream_route", path: "/api/events", serves: "eventsStream", method: "GET", handler: "events.stream", context: "backend" },
    { id: "process_events_route", path: "/api/process-events", serves: "processEvents", method: "POST", handler: "backendProgram.run", backendProgramSoul: "todo.processEvents.record", context: "backend" }
  ];
  const operatingRoutes = [
    withRecordContext({ id: "world_page_route", path: "/world", serves: "worldGraphView", method: "GET", handler: "page.world", rootWidget: "world_graph_page", frontendProgram: "world_graph_program", page: "world" }, frontendContext),
    { id: "world_graph_read_route", path: "/api/world-graph", serves: "worldGraph", method: "GET", handler: "backendProgram.run", backendProgramSoul: "todo.worldGraph.read", context: "backend" },
    { id: "process_view_read_route", path: "/api/process-view", serves: "processView", method: "GET", handler: "backendProgram.run", backendProgramSoul: "todo.processView.read", context: "backend" },
    { id: "process_run_read_route", path: "/api/process-runs/:runId", serves: "processRun", method: "GET", handler: "backendProgram.run", backendProgramSoul: "todo.processRun.read", context: "backend" },
    { id: "process_page_route", path: "/process", serves: "processView", method: "GET", handler: "page.process" }
  ];

  const serves = [...routes, ...operatingRoutes].map(route => ({ serverRunner: "demo_server", route: route.id }));
  return {
    runner,
    contexts,
    widgets,
    operatingWidgets,
    program,
    operatingPrograms,
    backendPrograms,
    backendProgramVersions,
    backendProgramVersionTransitions,
    backendSteps,
    backendActivations,
    steps,
    operatingSteps,
    routes,
    operatingRoutes,
    serves
  };
}

function bootstrapStep(id, chapterId, title, body, target, payload, completeWhen, nextLabel = "Next", scope = null) {
  return withStepScope({ id, chapterId, page: "bootstrap", title, body, target, payload, completeWhen, nextLabel }, scope || pageScope("bootstrap"));
}

function appStep(id, chapterId, title, body, target, payload, completeWhen, nextLabel = "Next", scope = null) {
  return withStepSurfaceContext(
    withStepScope({ id, chapterId, page: "app", title, body, target, payload, completeWhen, nextLabel }, scope || pageScope("app")),
    "frontend"
  );
}

function worldStep(id, chapterId, title, body, target, payload, completeWhen, nextLabel = "Next", scope = null) {
  return withStepSurfaceContext(
    withStepScope({ id, chapterId, page: "world", title, body, target, payload, completeWhen, nextLabel }, scope || worldScope("World surface")),
    "frontend"
  );
}

export function todoTutorialDefinition() {
  const blueprint = todoStarterBlueprint();
  const bootstrapIdentityScope = sectionScope("bootstrap", "identity-form", "Identity form");
  const bootstrapSessionScope = sectionScope("bootstrap", "session-form", "Session form");
  const bootstrapRunnerScope = sectionScope("bootstrap", "runner-form", "Runtime runner form");
  const bootstrapWidgetScope = sectionScope("bootstrap", "widget-form", "Widget builder");
  const bootstrapProgramScope = sectionScope("bootstrap", "program-form", "Frontend program builder");
  const bootstrapStepScope = sectionScope("bootstrap", "step-form", "Frontend step builder");
  const bootstrapRouteScope = sectionScope("bootstrap", "route-form", "Route builder");
  const bootstrapServeScope = sectionScope("bootstrap", "serve-form", "Serve mount builder");
  const bootstrapOpenAppScope = sectionScope("bootstrap", "open-app-link", "Open app link");
  const concepts = [
    tutorialConcept("identity-principal", "Identity And Principal", "Real work runs as an identity-backed actor, not anonymous edits."),
    tutorialConcept("session-auth", "Session Gate", "After identities exist, writes go through the same authenticated session path as the app."),
    tutorialConcept("runtime-wiring", "Runtime Wiring", "A server runner binds handler logic to backend and frontend hosts so routes can execute."),
    tutorialConcept("widget-tree", "Widget Tree", "The visible page is explicit authored widget structure rather than hidden templates."),
    tutorialConcept("frontend-program", "Frontend Program", "UI behavior comes from authored frontend steps wired to events."),
    tutorialConcept("route-mounts", "Routes And Mounts", "Routes define surfaces and serve mounts attach them to a concrete runner."),
    tutorialConcept("app-boundary", "App Boundary", "Crossing into the live route means using the exact app you assembled through bootstrap."),
    tutorialConcept("witnessed-app-state", "Witnessed App State", "Todo actions operate through real requests and witnessed state changes."),
    tutorialConcept("perspective-data", "Perspective Data", "Private notes belong to the signed-in perspective rather than the shared app view."),
    tutorialConcept("operating-surface", "Operating Surface", "The world page is a real surface for inspecting authored objects, witnessed execution, and hidden modes without leaving the product.")
  ];
  const scopes = [
    ...tutorialScopeAnchorsFromWidgets("app", blueprint.widgets),
    ...tutorialScopeAnchorsFromWidgets("world", blueprint.operatingWidgets)
  ];
  const widgetSteps = tutorialStepsWithConcepts(blueprint.widgets.map(definition => bootstrapStep(
    `widgets:${definition.id}`,
    "widgets",
    "Create the widget tree",
    `Create \`${definition.id}\` as part of the visible todo app structure.`,
    "widget-form",
    { ...definition },
    { kind: "widgetExists", id: definition.id },
    "Next",
    bootstrapWidgetScope
  )), ["widget-tree"]);
  const programSteps = [
    tutorialStepWithConcepts(bootstrapStep(
      "program:create",
      "program",
      "Create the frontend program",
      "Create the program that drives the live todo page.",
      "program-form",
      { ...blueprint.program },
      { kind: "programExists", id: blueprint.program.id },
      "Next",
      bootstrapProgramScope
    ), ["frontend-program"]),
    ...tutorialStepsWithConcepts(blueprint.steps.map(definition => bootstrapStep(
      `program-step:${definition.event}:${definition.order}:${definition.op}`,
      "program",
      "Add program behavior",
      `Add the \`${definition.event}\` / \`${definition.op}\` step so the page behaves like a real app.`,
      "step-form",
      { ...definition },
      { kind: "frontendStepExists", program: definition.program, event: definition.event, op: definition.op, order: definition.order },
      "Next",
      bootstrapStepScope
    )), ["frontend-program"])
  ];
  const routeSteps = [
    ...tutorialStepsWithConcepts(blueprint.routes.map(definition => bootstrapStep(
      `route:${definition.id}`,
      "routes",
      "Define routes",
      `Create the \`${definition.path}\` route.`,
      "route-form",
      { ...definition },
      { kind: "routeExists", id: definition.id },
      "Next",
      bootstrapRouteScope
    )), ["route-mounts"]),
    ...tutorialStepsWithConcepts(blueprint.serves.map(definition => bootstrapStep(
      `serve:${definition.route}`,
      "routes",
      "Mount routes",
      `Mount \`${definition.route}\` onto the active server runner.`,
      "serve-form",
      { ...definition },
      { kind: "serveExists", serverRunner: definition.serverRunner, route: definition.route },
      "Next",
      bootstrapServeScope
    )), ["route-mounts"])
  ];
  const steps = [
    tutorialStepWithConcepts(bootstrapStep(
      "identity:create",
      "identity",
      "Create the first identity",
      "Start with a real identity. This becomes the execution principal for the app you are about to assemble.",
      "identity-form",
      { id: "identity.aaron", actor: "aaron", label: "Aaron", username: "aaron", password: "aaron", homePerspective: "aaron:personal" },
      { kind: "identityExists", id: "identity.aaron" },
      "Next",
      bootstrapIdentityScope
    ), ["identity-principal"]),
    tutorialStepWithConcepts(bootstrapStep(
      "session:signin",
      "session",
      "Sign in to keep authoring",
      "Once identities exist, bootstrap writes go through the normal session path. Sign in with the identity you just created.",
      "session-form",
      { username: "aaron", password: "aaron" },
      { kind: "sessionAuthenticated", actor: "aaron" },
      "Next",
      bootstrapSessionScope
    ), ["session-auth"]),
    tutorialStepWithConcepts(bootstrapStep(
      "runner:create",
      "runner",
      "Create the runtime wiring",
      "Create the server runner that binds the demo handler set to the backend and frontend hosts.",
      "runner-form",
      { ...blueprint.runner },
      { kind: "serverRunnerExists", id: blueprint.runner.id },
      "Next",
      bootstrapRunnerScope
    ), ["runtime-wiring"]),
    ...widgetSteps,
    ...programSteps,
    ...routeSteps,
    tutorialStepWithConcepts(bootstrapStep(
      "open-app",
      "verify",
      "Open the app you just wired",
      "The app boundary is now reachable. Open `/` and continue the tutorial on the live app.",
      "open-app-link",
      null,
      { kind: "manualAdvance" },
      "Open App",
      bootstrapOpenAppScope
    ), ["app-boundary"]),
    tutorialStepWithConcepts(appStep(
      "app:intro",
      "use-app",
      "You are now using the real app",
      "This is the live page you assembled through the bootstrap seam. Click Next to exercise the app behavior.",
      "app-title",
      null,
      { kind: "manualAdvance" },
      "Next",
      widgetScope("app", "todo_title", "App title")
    ), ["app-boundary"]),
    tutorialStepWithConcepts(appStep(
      "app:create-todo",
      "use-app",
      "Create a todo",
      "Prefill the todo form, then click the real Add button.",
      "todo-form",
      { title: "Tutorial todo" },
      { kind: "todoExists", title: "Tutorial todo" },
      "Next",
      sectionScope("app", "todo_form", "Todo form")
    ), ["witnessed-app-state"]),
    tutorialStepWithConcepts(appStep(
      "app:toggle-todo",
      "use-app",
      "Toggle the todo",
      "Use the real row action to mark the tutorial todo as done.",
      "todo-toggle",
      null,
      { kind: "todoDone", title: "Tutorial todo" },
      "Next",
      widgetScope("app", "todo_item_toggle_template", "Todo toggle action")
    ), ["witnessed-app-state"]),
    tutorialStepWithConcepts(appStep(
      "app:delete-todo",
      "use-app",
      "Delete the todo",
      "Now delete the tutorial todo using the real row action.",
      "todo-delete",
      null,
      { kind: "todoMissing", title: "Tutorial todo" },
      "Next",
      widgetScope("app", "todo_item_delete_template", "Todo delete action")
    ), ["witnessed-app-state"]),
    tutorialStepWithConcepts(appStep(
      "app:create-note",
      "use-app",
      "Create a private note",
      "Private notes are perspective-bound. Prefill the real note form and save one now.",
      "note-form",
      { text: "Tutorial private note" },
      { kind: "noteExists", text: "Tutorial private note" },
      "Next",
      sectionScope("app", "todo_private_notes", "Private notes")
    ), ["perspective-data"]),
    tutorialStepWithConcepts(worldStep(
      "world:inspect",
      "inspect-world",
      "Inspect the world surface",
      "Open `/world` and use the operating surface to inspect the app as authored objects, witnesses, and real product handoffs. Click Finish when you are ready to keep exploring on your own.",
      "world-command-toggle",
      null,
      { kind: "manualAdvance" },
      "Finish",
      widgetScope("world", "world-command-toggle", "World command entry")
    ), ["app-boundary", "witnessed-app-state", "perspective-data", "operating-surface"])
  ];
  return {
    id: TODO_TUTORIAL_ID,
    title: "Build The Todo App From Scratch",
    concepts,
    scopes,
    steps
  };
}

export function tutorialDefinition(id) {
  return id === TODO_TUTORIAL_ID ? todoTutorialDefinition() : null;
}

export function tutorialPages(tutorial) {
  const pages = [];
  for (const step of tutorial?.steps ?? []) {
    if (typeof step?.page !== "string" || !step.page.trim() || pages.includes(step.page)) continue;
    pages.push(step.page);
  }
  return pages;
}

export function normalizeTutorialDisabledPages(tutorial, disabledPages = []) {
  const knownPages = new Set(tutorialPages(tutorial));
  return uniqueStrings(disabledPages).filter(page => knownPages.has(page));
}

export function tutorialStepPage(tutorial, stepId) {
  return tutorialStep(tutorial, stepId)?.page ?? null;
}

export function normalizeTutorialReplayStep(tutorial, replayStepId) {
  const id = typeof replayStepId === "string" ? replayStepId : "";
  return tutorialStep(tutorial, id)?.id ?? null;
}

function tutorialScopeRecordInfo(record) {
  if (!record || typeof record !== "object") return null;
  const scopeKey = typeof record.scopeKey === "string" && record.scopeKey.trim()
    ? record.scopeKey.trim()
    : (record.page === "world" ? "world" : tutorialPageScopeKey(record.page));
  if (!scopeKey) return null;
  const scopeKind = typeof record.scopeKind === "string" && record.scopeKind.trim()
    ? record.scopeKind.trim()
    : (scopeKey === "world"
        ? "world"
        : (scopeKey.startsWith("section:")
            ? "section"
            : (scopeKey.startsWith("widget:")
                ? "widget"
                : (scopeKey.startsWith("chapter:")
                    ? "chapter"
                    : "page"))));
  const scopePage = typeof record.scopePage === "string" && record.scopePage.trim()
    ? record.scopePage.trim()
    : (scopeKind === "world" ? "world" : (typeof record.page === "string" && record.page.trim() ? record.page.trim() : null));
  return normalizeScopeFields({
    key: scopeKey,
    kind: scopeKind,
    page: scopePage,
    label: typeof record.scopeLabel === "string" && record.scopeLabel.trim() ? record.scopeLabel.trim() : (record.title || null),
    chapterId: record.chapterId || null,
    sectionId: typeof record.scopeSectionId === "string" && record.scopeSectionId.trim() ? record.scopeSectionId.trim() : null,
    widgetId: typeof record.scopeWidgetId === "string" && record.scopeWidgetId.trim() ? record.scopeWidgetId.trim() : null,
    target: typeof record.target === "string" && record.target.trim() ? record.target.trim() : null
  });
}

function tutorialStepScopeInfo(step) {
  return tutorialScopeRecordInfo(step);
}

function tutorialStepSurfaceContextInfo(step) {
  if (!step || typeof step !== "object") return null;
  const contextId = typeof step.surfaceContextId === "string" && step.surfaceContextId.trim()
    ? step.surfaceContextId.trim()
    : null;
  if (!contextId) return null;
  return normalizeScopeFields({
    id: contextId,
    label: typeof step.surfaceContextLabel === "string" && step.surfaceContextLabel.trim()
      ? step.surfaceContextLabel.trim()
      : tutorialContextLabel(contextId)
  });
}

function addTutorialScopeInfo(map, info) {
  if (!info?.key) return;
  const existing = map.get(info.key);
  if (!existing) {
    map.set(info.key, { ...info });
    return;
  }
  map.set(info.key, {
    ...existing,
    ...Object.fromEntries(Object.entries(info).filter(([, value]) => value != null && value !== ""))
  });
}

export function tutorialScopeCatalog(tutorial) {
  const scopes = new Map();
  for (const page of tutorialPages(tutorial)) {
    addTutorialScopeInfo(scopes, {
      key: tutorialPageScopeKey(page),
      kind: "page",
      page,
      label: tutorialPageLabel(page)
    });
    if (page === "world") addTutorialScopeInfo(scopes, { key: "world", kind: "world", page: "world", label: "World surface" });
  }
  for (const scope of tutorial?.scopes ?? []) addTutorialScopeInfo(scopes, tutorialScopeRecordInfo(scope));
  for (const step of tutorial?.steps ?? []) {
    addTutorialScopeInfo(scopes, tutorialStepScopeInfo(step));
    addTutorialScopeInfo(scopes, {
      key: tutorialChapterScopeKey(step.chapterId),
      kind: "chapter",
      chapterId: step.chapterId || null,
      label: step.chapterId || null
    });
  }
  return scopes;
}

export function tutorialContextCatalog(tutorial) {
  const contexts = new Map();
  for (const step of tutorial?.steps ?? []) {
    const surfaceContext = tutorialStepSurfaceContextInfo(step);
    if (!surfaceContext?.id || contexts.has(surfaceContext.id)) continue;
    contexts.set(surfaceContext.id, { ...surfaceContext });
  }
  return contexts;
}

export function tutorialContextInfo(tutorial, contextId) {
  const id = typeof contextId === "string" ? contextId.trim() : "";
  if (!id) return null;
  return tutorialContextCatalog(tutorial).get(id) ?? null;
}

export function tutorialScopeInfo(tutorial, scopeKey) {
  const key = typeof scopeKey === "string" ? scopeKey.trim() : "";
  if (!key) return null;
  return tutorialScopeCatalog(tutorial).get(key) ?? null;
}

export function tutorialStepScope(tutorial, stepIdOrStep) {
  const step = typeof stepIdOrStep === "string" ? tutorialStep(tutorial, stepIdOrStep) : stepIdOrStep;
  if (!step) return null;
  const scoped = tutorialStepScopeInfo(step);
  if (!scoped?.key) return null;
  return tutorialScopeInfo(tutorial, scoped.key) || scoped;
}

export function tutorialStepSurfaceContext(tutorial, stepIdOrStep) {
  const step = typeof stepIdOrStep === "string" ? tutorialStep(tutorial, stepIdOrStep) : stepIdOrStep;
  if (!step) return null;
  const surfaceContext = tutorialStepSurfaceContextInfo(step);
  if (!surfaceContext?.id) return null;
  return tutorialContextInfo(tutorial, surfaceContext.id) || surfaceContext;
}

export function tutorialDisabledPagesFromScopeKeys(tutorial, disabledScopeKeys = []) {
  const pages = [];
  for (const key of uniqueStrings(disabledScopeKeys)) {
    const scope = tutorialScopeInfo(tutorial, key);
    if (!scope) continue;
    if (scope.kind === "page" && scope.page) pages.push(scope.page);
    if (scope.kind === "world") pages.push("world");
  }
  return normalizeTutorialDisabledPages(tutorial, pages);
}

export function normalizeTutorialDisabledScopeKeys(tutorial, disabledScopeKeys = [], disabledPages = []) {
  const candidates = [];
  for (const key of uniqueStrings(disabledScopeKeys)) candidates.push(key);
  for (const page of normalizeTutorialDisabledPages(tutorial, disabledPages)) {
    const pageKey = tutorialPageScopeKey(page);
    if (pageKey) candidates.push(pageKey);
    if (page === "world") candidates.push("world");
  }
  return uniqueStrings(candidates).filter(key => tutorialScopeInfo(tutorial, key));
}

export function normalizeTutorialDisabledContextIds(tutorial, disabledContextIds = []) {
  return uniqueStrings(disabledContextIds).filter(contextId => tutorialContextInfo(tutorial, contextId));
}

function tutorialReplayScopeKeyCandidate(tutorial, progress) {
  const step = tutorialStep(tutorial, progress?.stepId);
  if (!step) return null;
  const currentScope = tutorialStepScope(tutorial, step);
  const chapterScopeKey = tutorialChapterScopeKey(step.chapterId);
  const explicitKey = typeof progress?.replayScopeKey === "string" ? progress.replayScopeKey.trim() : "";
  if (explicitKey) {
    const explicitScope = tutorialScopeInfo(tutorial, explicitKey);
    if (explicitScope && (explicitScope.key === currentScope?.key || explicitScope.key === chapterScopeKey)) return explicitScope.key;
  }
  const legacyReplayStepId = normalizeTutorialReplayStep(tutorial, progress?.replayStepId);
  if (legacyReplayStepId && legacyReplayStepId === step.id) return currentScope?.key || null;
  return null;
}

export function tutorialReplayScopeKey(tutorial, progress) {
  return tutorialReplayScopeKeyCandidate(tutorial, progress);
}

function tutorialScopeAncestors(tutorial, scopeKey) {
  const scope = tutorialScopeInfo(tutorial, scopeKey);
  if (!scope?.key) return [];
  const keys = [scope.key];
  if (scope.kind === "widget" || scope.kind === "section") {
    const pageKey = tutorialPageScopeKey(scope.page);
    if (pageKey) keys.push(pageKey);
    if (scope.page === "world") keys.push("world");
  } else if (scope.kind === "page" && scope.page === "world") {
    keys.push("world");
  } else if (scope.kind === "world") {
    const pageKey = tutorialPageScopeKey("world");
    if (pageKey) keys.push(pageKey);
  }
  return uniqueStrings(keys);
}

export function tutorialDisabledScopeKeys(tutorial, progress) {
  return normalizeTutorialDisabledScopeKeys(tutorial, progress?.disabledScopeKeys, progress?.disabledPages);
}

export function tutorialDisabledContextIds(tutorial, progress) {
  return normalizeTutorialDisabledContextIds(tutorial, progress?.disabledContextIds);
}

export function isTutorialScopeDisabled(tutorial, progress, scopeKey) {
  if (!progress) return false;
  const disabled = new Set(tutorialDisabledScopeKeys(tutorial, progress));
  return tutorialScopeAncestors(tutorial, scopeKey).some(key => disabled.has(key));
}

export function isTutorialContextDisabled(tutorial, progress, contextId) {
  if (!progress) return false;
  return tutorialDisabledContextIds(tutorial, progress).includes(typeof contextId === "string" ? contextId.trim() : "");
}

export function normalizeTutorialProgress(tutorial, progress) {
  if (!progress || typeof progress !== "object") return null;
  const fallbackStep = tutorial?.steps?.[0] ?? null;
  const step = tutorialStep(tutorial, progress.stepId) ?? fallbackStep;
  const stepId = step?.id ?? null;
  const replayScopeKey = tutorialReplayScopeKeyCandidate(tutorial, { ...progress, stepId });
  const disabledScopeKeys = normalizeTutorialDisabledScopeKeys(tutorial, progress.disabledScopeKeys, progress.disabledPages);
  const disabledContextIds = normalizeTutorialDisabledContextIds(tutorial, progress.disabledContextIds);
  return {
    tutorialId: tutorial?.id || TODO_TUTORIAL_ID,
    chapterId: step?.chapterId || null,
    stepId,
    chapterStatus: typeof progress.chapterStatus === "string" ? progress.chapterStatus : (step ? "in_progress" : "idle"),
    draftInputs: progress.draftInputs && typeof progress.draftInputs === "object" ? progress.draftInputs : {},
    completedAt: typeof progress.completedAt === "string" ? progress.completedAt : null,
    hidden: progress.hidden === true,
    disabledScopeKeys,
    disabledContextIds,
    replayScopeKey,
    disabledPages: tutorialDisabledPagesFromScopeKeys(tutorial, disabledScopeKeys),
    replayStepId: replayScopeKey && stepId ? stepId : null
  };
}

export function createTutorialProgress(tutorial, stepId = tutorial?.steps?.[0]?.id || null) {
  const step = tutorialStep(tutorial, stepId) ?? tutorial?.steps?.[0] ?? null;
  return normalizeTutorialProgress(tutorial, {
    tutorialId: tutorial?.id || TODO_TUTORIAL_ID,
    chapterId: step?.chapterId || null,
    stepId: step?.id || null,
    chapterStatus: step ? "in_progress" : "idle",
    draftInputs: {},
    completedAt: null,
    hidden: false,
    disabledScopeKeys: [],
    disabledContextIds: [],
    replayScopeKey: null
  });
}

export function tutorialStepConcepts(tutorial, stepId) {
  const concepts = new Map((tutorial?.concepts ?? []).map(concept => [concept.id, concept]));
  return [...new Set((tutorialStep(tutorial, stepId)?.concepts ?? []).map(String))]
    .map(id => concepts.get(id))
    .filter(Boolean);
}

export function tutorialRevealedConcepts(tutorial, progressOrStepId) {
  const stepId = typeof progressOrStepId === "string" ? progressOrStepId : progressOrStepId?.stepId;
  const currentIndex = progressOrStepId?.completedAt
    ? ((tutorial?.steps?.length ?? 1) - 1)
    : tutorialStepIndex(tutorial, stepId);
  if (currentIndex < 0) return [];
  const concepts = new Map((tutorial?.concepts ?? []).map(concept => [concept.id, concept]));
  const revealedIds = [];
  for (const step of tutorial?.steps?.slice(0, currentIndex + 1) ?? []) {
    for (const conceptId of [...new Set((step?.concepts ?? []).map(String))]) {
      if (!revealedIds.includes(conceptId) && concepts.has(conceptId)) revealedIds.push(conceptId);
    }
  }
  return revealedIds.map(id => concepts.get(id)).filter(Boolean);
}

export function isTutorialPageDisabled(tutorial, progress, page) {
  if (!(typeof page === "string" && page.trim())) return false;
  return isTutorialScopeDisabled(tutorial, progress, tutorialPageScopeKey(page));
}

export function setTutorialPageDisabled(tutorial, progress, page, disabled = true) {
  return setTutorialScopeDisabled(tutorial, progress, tutorialPageScopeKey(page), disabled);
}

export function setTutorialScopeDisabled(tutorial, progress, scopeKey, disabled = true) {
  if (!progress) return null;
  const current = normalizeTutorialProgress(tutorial, progress);
  const targetScope = tutorialScopeInfo(tutorial, scopeKey);
  if (!current || !targetScope?.key) return current;
  const disabledScopeKeys = new Set(tutorialDisabledScopeKeys(tutorial, current));
  if (disabled) disabledScopeKeys.add(targetScope.key);
  else disabledScopeKeys.delete(targetScope.key);
  return normalizeTutorialProgress(tutorial, {
    ...current,
    disabledScopeKeys: [...disabledScopeKeys]
  });
}

export function setTutorialContextDisabled(tutorial, progress, contextId, disabled = true) {
  if (!progress) return null;
  const current = normalizeTutorialProgress(tutorial, progress);
  const targetContext = tutorialContextInfo(tutorial, contextId);
  if (!current || !targetContext?.id) return current;
  const disabledContextIds = new Set(tutorialDisabledContextIds(tutorial, current));
  if (disabled) disabledContextIds.add(targetContext.id);
  else disabledContextIds.delete(targetContext.id);
  return normalizeTutorialProgress(tutorial, {
    ...current,
    disabledContextIds: [...disabledContextIds]
  });
}

export function restartTutorialFromScope(tutorial, progress, scopeKey, stepId = progress?.stepId) {
  const current = tutorialStep(tutorial, stepId);
  if (!current) return createTutorialProgress(tutorial);
  const replayScope = tutorialScopeInfo(tutorial, scopeKey);
  return normalizeTutorialProgress(tutorial, {
    ...(progress ?? createTutorialProgress(tutorial, current.id)),
    chapterId: current.chapterId,
    stepId: current.id,
    chapterStatus: "in_progress",
    completedAt: null,
    hidden: false,
    draftInputs: {},
    replayScopeKey: replayScope?.key || tutorialStepScope(tutorial, current)?.key || null
  });
}

export function restartTutorialFromHere(tutorial, progress, stepId = progress?.stepId) {
  const current = tutorialStep(tutorial, stepId);
  return restartTutorialFromScope(tutorial, progress, tutorialStepScope(tutorial, current)?.key, current?.id);
}

export function tutorialStepIndex(tutorial, stepId) {
  return tutorial?.steps?.findIndex(step => step.id === stepId) ?? -1;
}

export function tutorialStep(tutorial, stepId) {
  return tutorial?.steps?.find(step => step.id === stepId) ?? null;
}

export function nextTutorialStep(tutorial, stepId) {
  const index = tutorialStepIndex(tutorial, stepId);
  if (index < 0) return tutorial?.steps?.[0] ?? null;
  return tutorial.steps[index + 1] ?? null;
}

export function previousTutorialStep(tutorial, stepId) {
  const index = tutorialStepIndex(tutorial, stepId);
  if (index <= 0) return null;
  return tutorial.steps[index - 1] ?? null;
}

export function firstTutorialStepInChapter(tutorial, chapterId) {
  if (!tutorial?.steps?.length || !chapterId) return null;
  return tutorial.steps.find(step => step.chapterId === chapterId) ?? null;
}

export function skipTutorialChapter(tutorial, progress) {
  const current = tutorialStep(tutorial, progress?.stepId);
  if (!current) return createTutorialProgress(tutorial);
  const next = tutorial.steps.find(step => step.chapterId !== current.chapterId && tutorialStepIndex(tutorial, step.id) > tutorialStepIndex(tutorial, current.id));
  if (!next) {
    return normalizeTutorialProgress(tutorial, { ...progress, chapterStatus: "completed", completedAt: progress.completedAt || new Date().toISOString(), replayScopeKey: null });
  }
  return normalizeTutorialProgress(tutorial, { ...progress, chapterId: next.chapterId, stepId: next.id, chapterStatus: "in_progress", replayScopeKey: null });
}

export function advanceTutorialProgress(tutorial, progress) {
  const next = nextTutorialStep(tutorial, progress?.stepId);
  if (!next) {
    return normalizeTutorialProgress(tutorial, { ...progress, chapterStatus: "completed", completedAt: progress?.completedAt || new Date().toISOString(), replayScopeKey: null });
  }
  return normalizeTutorialProgress(tutorial, {
    ...progress,
    chapterId: next.chapterId,
    stepId: next.id,
    chapterStatus: "in_progress",
    completedAt: null,
    replayScopeKey: null
  });
}

export function retreatTutorialProgress(tutorial, progress) {
  const previous = previousTutorialStep(tutorial, progress?.stepId);
  if (!previous) return progress;
  return normalizeTutorialProgress(tutorial, {
    ...progress,
    chapterId: previous.chapterId,
    stepId: previous.id,
    chapterStatus: "in_progress",
    completedAt: null,
    replayScopeKey: null
  });
}

export function restartTutorialChapter(tutorial, progress, chapterId = progress?.chapterId) {
  const first = firstTutorialStepInChapter(tutorial, chapterId);
  if (!first) return createTutorialProgress(tutorial);
  return normalizeTutorialProgress(tutorial, {
    ...(progress ?? createTutorialProgress(tutorial, first.id)),
    chapterId: first.chapterId,
    stepId: first.id,
    chapterStatus: "in_progress",
    completedAt: null,
    hidden: false,
    draftInputs: {},
    replayScopeKey: null
  });
}

export function mergeTutorialProgress(tutorial, localProgress, remoteProgress) {
  if (localProgress?.completedAt && !remoteProgress?.completedAt) return normalizeTutorialProgress(tutorial, localProgress);
  if (remoteProgress?.completedAt && !localProgress?.completedAt) return normalizeTutorialProgress(tutorial, remoteProgress);
  const localIndex = tutorialStepIndex(tutorial, localProgress?.stepId);
  const remoteIndex = tutorialStepIndex(tutorial, remoteProgress?.stepId);
  if (remoteIndex > localIndex) return normalizeTutorialProgress(tutorial, remoteProgress);
  if (localIndex > remoteIndex) return normalizeTutorialProgress(tutorial, localProgress);
  if (!localProgress) return normalizeTutorialProgress(tutorial, remoteProgress) ?? null;
  if (!remoteProgress) return normalizeTutorialProgress(tutorial, localProgress) ?? null;
  const localNormalized = normalizeTutorialProgress(tutorial, localProgress);
  const remoteNormalized = normalizeTutorialProgress(tutorial, remoteProgress);
  if (localProgress.hidden === false && remoteProgress.hidden === true) {
    return localNormalized;
  }
  if (remoteProgress.hidden === false && localProgress.hidden === true) {
    return remoteNormalized;
  }
  return normalizeTutorialProgress(tutorial, {
    ...remoteNormalized,
    hidden: remoteNormalized.hidden,
    disabledScopeKeys: [...new Set([...tutorialDisabledScopeKeys(tutorial, remoteNormalized), ...tutorialDisabledScopeKeys(tutorial, localNormalized)])],
    disabledContextIds: [...new Set([...tutorialDisabledContextIds(tutorial, remoteNormalized), ...tutorialDisabledContextIds(tutorial, localNormalized)])],
    replayScopeKey: tutorialReplayScopeKey(tutorial, localNormalized) || tutorialReplayScopeKey(tutorial, remoteNormalized) || null
  });
}
