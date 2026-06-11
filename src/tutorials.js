export const TODO_TUTORIAL_ID = "todo-from-scratch";

export function todoStarterBlueprint() {
  const runner = {
    id: "demo_server",
    handlerSet: "demo",
    todoProjection: "witness-world-bootstrap-todos.json",
    privateNotesProjection: "witness-world-bootstrap-private-notes.json"
  };

  const widgets = [
    { id: "todo_app_widget", kind: "Page", title: "Witness Todo", attach: false },
    { id: "todo_session", kind: "Box", parent: "todo_app_widget", order: 0, class: "session-panel", role: "session-panel" },
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
    { id: "todo_private_notes", kind: "Box", parent: "todo_app_widget", order: 5, class: "private-notes", role: "private-notes" },
    { id: "todo_private_notes_title", kind: "Heading", parent: "todo_private_notes", order: 0, text: "Private Notes", level: 2 },
    { id: "todo_private_notes_form", kind: "Form", parent: "todo_private_notes", order: 1, role: "private-note-form", tutorialTarget: "note-form" },
    { id: "todo_private_note_input", kind: "Input", parent: "todo_private_notes_form", order: 0, name: "text", placeholder: "Only your perspective can see this", tutorialTarget: "note-input" },
    { id: "todo_private_note_button", kind: "Button", parent: "todo_private_notes_form", order: 1, text: "Save note", type: "submit", tutorialTarget: "note-submit" },
    { id: "todo_private_note_list", kind: "Box", parent: "todo_private_notes", order: 2, class: "private-note-list", role: "private-note-list", tutorialTarget: "note-list" },
    { id: "todo_widget_editor", kind: "Box", parent: "todo_app_widget", order: 6, class: "widget-editor", role: "widget-editor" },
    { id: "todo_widget_editor_title", kind: "Heading", parent: "todo_widget_editor", order: 0, text: "Widget Editor", level: 2 },
    { id: "todo_widget_editor_form", kind: "Form", parent: "todo_widget_editor", order: 1, role: "widget-editor-form" },
    { id: "todo_widget_kind", kind: "ValueEditor", parent: "todo_widget_editor_form", order: 0, name: "kind", valueType: "widget.kind", label: "Kind", placeholder: "Choose a widget kind" },
    { id: "todo_widget_text", kind: "ValueEditor", parent: "todo_widget_editor_form", order: 1, name: "text", valueType: "widget.text", label: "Text", placeholder: "Widget text" },
    { id: "todo_widget_parent", kind: "ValueEditor", parent: "todo_widget_editor_form", order: 2, name: "parent", valueType: "widget.parent", label: "Parent", placeholder: "Parent widget id, blank = root" },
    { id: "todo_widget_order", kind: "ValueEditor", parent: "todo_widget_editor_form", order: 3, name: "order", valueType: "widget.order", label: "Order", placeholder: "Optional order" },
    { id: "todo_widget_editor_button", kind: "Button", parent: "todo_widget_editor_form", order: 4, text: "Add widget", type: "submit" },
    { id: "todo_item_template", kind: "Box", attach: false, template: true, class: "${item.done ? 'todo-row done' : 'todo-row'}" },
    { id: "todo_item_title_template", kind: "Text", parent: "todo_item_template", order: 0, template: true, text: "${item.title}", class: "todo-title" },
    { id: "todo_item_actions_template", kind: "Box", parent: "todo_item_template", order: 1, template: true, class: "todo-actions" },
    { id: "todo_item_toggle_template", kind: "Button", parent: "todo_item_actions_template", order: 0, template: true, text: "${item.done ? 'Undo' : 'Done'}", type: "button", action: "toggleTodo", dataId: "${item.id}", dataDone: "${!item.done}", tutorialTarget: "todo-toggle" },
    { id: "todo_item_delete_template", kind: "Button", parent: "todo_item_actions_template", order: 1, template: true, text: "Delete", type: "button", action: "deleteTodo", dataId: "${item.id}", tutorialTarget: "todo-delete" },
    { id: "private_note_template", kind: "Text", attach: false, template: true, class: "private-note", text: "${item.text}" },
    { id: "private_note_empty_template", kind: "Text", attach: false, template: true, class: "private-note", text: "Sign in to see private notes." }
  ];

  const program = { id: "todo_frontend_program", rootWidget: "todo_app_widget" };

  const steps = [
    { program: "todo_frontend_program", event: "load", op: "initSession", order: 0, paramsJson: "{}" },
    { program: "todo_frontend_program", event: "load", op: "setText", order: 1, paramsJson: JSON.stringify({ widget: "todo_session_status", text: "${state.session && state.session.authenticated ? 'Signed in as ' + state.session.label + ' (' + state.session.actor + ')' + (state.session.perspective ? ' in ' + state.session.perspective : '') : 'Not signed in'}" }) },
    { program: "todo_frontend_program", event: "load", op: "setText", order: 2, paramsJson: JSON.stringify({ widget: "todo_status", text: "Loading..." }) },
    { program: "todo_frontend_program", event: "load", op: "fetchJson", order: 3, paramsJson: JSON.stringify({ url: "/api/todos", into: "todoResponse" }) },
    { program: "todo_frontend_program", event: "load", op: "renderCollection", order: 4, paramsJson: JSON.stringify({ widget: "todo_list", from: "todoResponse.todos", template: "todo_item_template" }) },
    { program: "todo_frontend_program", event: "load", op: "fetchJson", order: 5, paramsJson: JSON.stringify({ url: "/api/private-notes", into: "privateNotesResponse" }) },
    { program: "todo_frontend_program", event: "load", op: "renderCollection", order: 6, paramsJson: JSON.stringify({ widget: "todo_private_note_list", from: "privateNotesResponse.notes", template: "private_note_template", emptyWidget: "private_note_empty_template" }) },
    { program: "todo_frontend_program", event: "load", op: "setText", order: 7, paramsJson: JSON.stringify({ widget: "todo_status", text: "Ready" }) },
    { program: "todo_frontend_program", event: "submit:todo_form", op: "readForm", order: 0, paramsJson: JSON.stringify({ widget: "todo_form", into: "draftTodo" }) },
    { program: "todo_frontend_program", event: "submit:todo_form", op: "setText", order: 1, paramsJson: JSON.stringify({ widget: "todo_status", text: "Saving..." }) },
    { program: "todo_frontend_program", event: "submit:todo_form", op: "postJson", order: 2, paramsJson: JSON.stringify({ url: "/api/todos", method: "POST", from: "draftTodo", pick: ["title"], into: "createdTodo" }) },
    { program: "todo_frontend_program", event: "submit:todo_form", op: "clearForm", order: 3, paramsJson: JSON.stringify({ widget: "todo_form" }) },
    { program: "todo_frontend_program", event: "submit:todo_form", op: "run", order: 4, paramsJson: JSON.stringify({ event: "load" }) },
    { program: "todo_frontend_program", event: "click:toggleTodo", op: "setText", order: 0, paramsJson: JSON.stringify({ widget: "todo_status", text: "Updating..." }) },
    { program: "todo_frontend_program", event: "click:toggleTodo", op: "patchJson", order: 1, paramsJson: JSON.stringify({ url: "/api/todos/${event.id}", body: { done: "${event.done}" }, into: "updatedTodo" }) },
    { program: "todo_frontend_program", event: "click:toggleTodo", op: "run", order: 2, paramsJson: JSON.stringify({ event: "load" }) },
    { program: "todo_frontend_program", event: "click:deleteTodo", op: "setText", order: 0, paramsJson: JSON.stringify({ widget: "todo_status", text: "Deleting..." }) },
    { program: "todo_frontend_program", event: "click:deleteTodo", op: "deleteJson", order: 1, paramsJson: JSON.stringify({ url: "/api/todos/${event.id}", into: "deletedTodo" }) },
    { program: "todo_frontend_program", event: "click:deleteTodo", op: "run", order: 2, paramsJson: JSON.stringify({ event: "load" }) },
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
    { program: "todo_frontend_program", event: "submit:todo_widget_editor_form", op: "postJson", order: 1, paramsJson: JSON.stringify({ url: "/api/widgets", method: "POST", from: "widgetDraft", into: "widgetCreated" }) },
    { program: "todo_frontend_program", event: "submit:todo_widget_editor_form", op: "clearForm", order: 2, paramsJson: JSON.stringify({ widget: "todo_widget_editor_form" }) },
    { program: "todo_frontend_program", event: "submit:todo_widget_editor_form", op: "run", order: 3, paramsJson: JSON.stringify({ event: "load" }) },
    { program: "todo_frontend_program", event: "error", op: "setText", order: 0, paramsJson: JSON.stringify({ widget: "todo_status", text: "Failed: ${event.message}" }) }
  ];

  const routes = [
    { id: "home_page_route", path: "/", serves: "todoAppView", method: "GET", handler: "page.home", rootWidget: "todo_app_widget", frontendProgram: "todo_frontend_program", page: "home", liveProjection: true },
    { id: "session_read_route", path: "/api/session", serves: "session", method: "GET", handler: "session.read" },
    { id: "session_open_route", path: "/api/session", serves: "session", method: "POST", handler: "session.open" },
    { id: "session_logout_route", path: "/api/session", serves: "session", method: "DELETE", handler: "session.logout" },
    { id: "todos_list_route", path: "/api/todos", serves: "todoStore", method: "GET", handler: "todos.list" },
    { id: "todos_create_route", path: "/api/todos", serves: "todoStore", method: "POST", handler: "todos.create" },
    { id: "todos_update_route", path: "/api/todos/:id", serves: "todoStore", method: "PATCH", handler: "todos.update" },
    { id: "todos_delete_route", path: "/api/todos/:id", serves: "todoStore", method: "DELETE", handler: "todos.delete" },
    { id: "private_notes_list_route", path: "/api/private-notes", serves: "privateNotes", method: "GET", handler: "privateNotes.list" },
    { id: "private_notes_create_route", path: "/api/private-notes", serves: "privateNotes", method: "POST", handler: "privateNotes.create" },
    { id: "widgets_create_route", path: "/api/widgets", serves: "widgetEditor", method: "POST", handler: "widgets.create", rootWidget: "todo_app_widget" },
    { id: "process_events_route", path: "/api/process-events", serves: "processEvents", method: "POST", handler: "processEvents.record" }
  ];

  const serves = routes.map(route => ({ serverRunner: "demo_server", route: route.id }));
  return { runner, widgets, program, steps, routes, serves };
}

function bootstrapStep(id, chapterId, title, body, target, payload, completeWhen, nextLabel = "Next") {
  return { id, chapterId, page: "bootstrap", title, body, target, payload, completeWhen, nextLabel };
}

function appStep(id, chapterId, title, body, target, payload, completeWhen, nextLabel = "Next") {
  return { id, chapterId, page: "app", title, body, target, payload, completeWhen, nextLabel };
}

export function todoTutorialDefinition() {
  const blueprint = todoStarterBlueprint();
  const widgetSteps = blueprint.widgets.map(definition => bootstrapStep(
    `widgets:${definition.id}`,
    "widgets",
    "Create the widget tree",
    `Create \`${definition.id}\` as part of the visible todo app structure.`,
    "widget-form",
    { ...definition },
    { kind: "widgetExists", id: definition.id }
  ));
  const programSteps = [
    bootstrapStep(
      "program:create",
      "program",
      "Create the frontend program",
      "Create the program that drives the live todo page.",
      "program-form",
      { ...blueprint.program },
      { kind: "programExists", id: blueprint.program.id }
    ),
    ...blueprint.steps.map(definition => bootstrapStep(
      `program-step:${definition.event}:${definition.order}:${definition.op}`,
      "program",
      "Add program behavior",
      `Add the \`${definition.event}\` / \`${definition.op}\` step so the page behaves like a real app.`,
      "step-form",
      { ...definition },
      { kind: "frontendStepExists", program: definition.program, event: definition.event, op: definition.op, order: definition.order }
    ))
  ];
  const routeSteps = [
    ...blueprint.routes.map(definition => bootstrapStep(
      `route:${definition.id}`,
      "routes",
      "Define routes",
      `Create the \`${definition.path}\` route.`,
      "route-form",
      { ...definition },
      { kind: "routeExists", id: definition.id }
    )),
    ...blueprint.serves.map(definition => bootstrapStep(
      `serve:${definition.route}`,
      "routes",
      "Mount routes",
      `Mount \`${definition.route}\` onto the active server runner.`,
      "serve-form",
      { ...definition },
      { kind: "serveExists", serverRunner: definition.serverRunner, route: definition.route }
    ))
  ];
  const steps = [
    bootstrapStep(
      "identity:create",
      "identity",
      "Create the first identity",
      "Start with a real identity. This becomes the execution principal for the app you are about to assemble.",
      "identity-form",
      { id: "identity.aaron", actor: "aaron", label: "Aaron", username: "aaron", password: "aaron", homePerspective: "aaron:personal" },
      { kind: "identityExists", id: "identity.aaron" }
    ),
    bootstrapStep(
      "session:signin",
      "session",
      "Sign in to keep authoring",
      "Once identities exist, bootstrap writes go through the normal session path. Sign in with the identity you just created.",
      "session-form",
      { username: "aaron", password: "aaron" },
      { kind: "sessionAuthenticated", actor: "aaron" }
    ),
    bootstrapStep(
      "runner:create",
      "runner",
      "Create the runtime wiring",
      "Create the server runner that binds the demo handler set to the backend and frontend hosts.",
      "runner-form",
      { ...blueprint.runner },
      { kind: "serverRunnerExists", id: blueprint.runner.id }
    ),
    ...widgetSteps,
    ...programSteps,
    ...routeSteps,
    bootstrapStep(
      "open-app",
      "verify",
      "Open the app you just wired",
      "The app boundary is now reachable. Open `/` and continue the tutorial on the live app.",
      "open-app-link",
      null,
      { kind: "manualAdvance" },
      "Open App"
    ),
    appStep(
      "app:intro",
      "use-app",
      "You are now using the real app",
      "This is the live page you assembled through the bootstrap seam. Click Next to exercise the app behavior.",
      "app-title",
      null,
      { kind: "manualAdvance" }
    ),
    appStep(
      "app:create-todo",
      "use-app",
      "Create a todo",
      "Prefill the todo form, then click the real Add button.",
      "todo-form",
      { title: "Tutorial todo" },
      { kind: "todoExists", title: "Tutorial todo" }
    ),
    appStep(
      "app:toggle-todo",
      "use-app",
      "Toggle the todo",
      "Use the real row action to mark the tutorial todo as done.",
      "todo-toggle",
      null,
      { kind: "todoDone", title: "Tutorial todo" }
    ),
    appStep(
      "app:delete-todo",
      "use-app",
      "Delete the todo",
      "Now delete the tutorial todo using the real row action.",
      "todo-delete",
      null,
      { kind: "todoMissing", title: "Tutorial todo" }
    ),
    appStep(
      "app:create-note",
      "use-app",
      "Create a private note",
      "Private notes are perspective-bound. Prefill the real note form and save one now.",
      "note-form",
      { text: "Tutorial private note" },
      { kind: "noteExists", text: "Tutorial private note" }
    ),
    appStep(
      "app:done",
      "done",
      "Tutorial complete",
      "You created the todo app from scratch through the real platform surface. You can now keep exploring, or return to the bootstrap seam to inspect the authored wiring.",
      "app-title",
      null,
      { kind: "manualAdvance" },
      "Finish"
    )
  ];
  return {
    id: TODO_TUTORIAL_ID,
    title: "Build The Todo App From Scratch",
    steps
  };
}

export function tutorialDefinition(id) {
  return id === TODO_TUTORIAL_ID ? todoTutorialDefinition() : null;
}

export function createTutorialProgress(tutorial, stepId = tutorial?.steps?.[0]?.id || null) {
  const step = tutorial?.steps?.find(candidate => candidate.id === stepId) ?? tutorial?.steps?.[0] ?? null;
  return {
    tutorialId: tutorial?.id || TODO_TUTORIAL_ID,
    chapterId: step?.chapterId || null,
    stepId: step?.id || null,
    chapterStatus: step ? "in_progress" : "idle",
    draftInputs: {},
    completedAt: null,
    hidden: false
  };
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

export function skipTutorialChapter(tutorial, progress) {
  const current = tutorialStep(tutorial, progress?.stepId);
  if (!current) return createTutorialProgress(tutorial);
  const next = tutorial.steps.find(step => step.chapterId !== current.chapterId && tutorialStepIndex(tutorial, step.id) > tutorialStepIndex(tutorial, current.id));
  if (!next) {
    return { ...progress, chapterStatus: "completed", completedAt: progress.completedAt || new Date().toISOString() };
  }
  return { ...progress, chapterId: next.chapterId, stepId: next.id, chapterStatus: "in_progress" };
}

export function advanceTutorialProgress(tutorial, progress) {
  const next = nextTutorialStep(tutorial, progress?.stepId);
  if (!next) {
    return { ...progress, chapterStatus: "completed", completedAt: progress?.completedAt || new Date().toISOString() };
  }
  return {
    ...progress,
    chapterId: next.chapterId,
    stepId: next.id,
    chapterStatus: "in_progress",
    completedAt: null
  };
}

export function retreatTutorialProgress(tutorial, progress) {
  const previous = previousTutorialStep(tutorial, progress?.stepId);
  if (!previous) return progress;
  return {
    ...progress,
    chapterId: previous.chapterId,
    stepId: previous.id,
    chapterStatus: "in_progress",
    completedAt: null
  };
}

export function mergeTutorialProgress(tutorial, localProgress, remoteProgress) {
  if (localProgress?.completedAt && !remoteProgress?.completedAt) return localProgress;
  if (remoteProgress?.completedAt && !localProgress?.completedAt) return remoteProgress;
  const localIndex = tutorialStepIndex(tutorial, localProgress?.stepId);
  const remoteIndex = tutorialStepIndex(tutorial, remoteProgress?.stepId);
  if (remoteIndex > localIndex) return remoteProgress;
  if (localIndex > remoteIndex) return localProgress;
  if (!localProgress) return remoteProgress ?? null;
  if (!remoteProgress) return localProgress ?? null;
  if (localProgress.hidden === false && remoteProgress.hidden === true) return localProgress;
  return remoteProgress;
}
