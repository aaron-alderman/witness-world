import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const todoStarterLegacyFixtureDocument = JSON.parse(
  fs.readFileSync(path.join(__dirname, "todo-starter-legacy-fixture.json"), "utf8")
);

const NATIVE_TODO_STARTER = Object.freeze({
  collections: [
    { id: "native_todo_items", context: "frontend" }
  ],
  types: [
    { id: "nativeTodoDraftTitle", role: "state", valueType: "text", initial: "", context: "frontend" },
    { id: "nativeTodoStatusText", role: "state", valueType: "text", initial: "Loading todos...", context: "frontend" },
    { id: "nativeTodoStatusTone", role: "state", valueType: "text", initial: "surface-status pending", context: "frontend" },
    { id: "nativeTodoLoadStatusState", role: "state", valueType: "text", initial: "idle", context: "frontend" },
    { id: "nativeTodoLoadLoading", role: "state", valueType: "bool", initial: false, context: "frontend" },
    { id: "nativeTodoCreateStatusState", role: "state", valueType: "text", initial: "idle", context: "frontend" },
    { id: "nativeTodoCreateLoading", role: "state", valueType: "bool", initial: false, context: "frontend" }
  ],
  messages: [
    {
      id: "nativeTodoRefreshRequested",
      role: "event",
      context: "frontend",
      writes: {
        nativeTodoStatusText: "Refreshing todos...",
        nativeTodoStatusTone: "surface-status pending"
      }
    },
    {
      id: "nativeTodoCreateRequested",
      role: "event",
      context: "frontend",
      writes: {
        nativeTodoStatusText: "Saving todo...",
        nativeTodoStatusTone: "surface-status pending"
      }
    },
    {
      id: "nativeTodoLoadCommand",
      role: "command",
      context: "frontend",
      fields: [],
      writes: {}
    },
    {
      id: "nativeTodoLoadSuccess",
      role: "event",
      context: "frontend",
      fields: [{ name: "message", type: "nativeTodoStatusText" }],
      writes: {
        nativeTodoLoadLoading: false,
        nativeTodoLoadStatusState: "ready",
        nativeTodoStatusTone: "surface-status ok"
      }
    },
    {
      id: "nativeTodoLoadFailure",
      role: "event",
      context: "frontend",
      fields: [{ name: "message", type: "nativeTodoStatusText" }],
      writes: {
        nativeTodoLoadLoading: false,
        nativeTodoLoadStatusState: "repair_required",
        nativeTodoStatusTone: "surface-status error"
      }
    },
    {
      id: "nativeTodoCreateCommand",
      role: "command",
      context: "frontend",
      fields: [{ name: "title", type: "nativeTodoDraftTitle" }],
      writes: {}
    },
    {
      id: "nativeTodoCreateSuccess",
      role: "event",
      context: "frontend",
      fields: [{ name: "message", type: "nativeTodoStatusText" }],
      writes: {
        nativeTodoCreateLoading: false,
        nativeTodoCreateStatusState: "ready",
        nativeTodoStatusTone: "surface-status ok"
      }
    },
    {
      id: "nativeTodoCreateFailure",
      role: "event",
      context: "frontend",
      fields: [{ name: "message", type: "nativeTodoStatusText" }],
      writes: {
        nativeTodoCreateLoading: false,
        nativeTodoCreateStatusState: "repair_required",
        nativeTodoStatusTone: "surface-status error"
      }
    }
  ],
  projections: [
    {
      id: "nativeTodoStatusProjection",
      context: "frontend",
      projectionKind: "format",
      source: "nativeTodoStatusText",
      props: { prefix: "" }
    }
  ],
  processes: [
    {
      id: "nativeTodoProcess",
      context: "frontend",
      state: [
        "nativeTodoDraftTitle",
        "nativeTodoStatusText",
        "nativeTodoStatusTone",
        "nativeTodoLoadStatusState",
        "nativeTodoLoadLoading",
        "nativeTodoCreateStatusState",
        "nativeTodoCreateLoading"
      ],
      handles: [
        "nativeTodoRefreshRequested",
        "nativeTodoCreateRequested",
        "nativeTodoLoadSuccess",
        "nativeTodoLoadFailure",
        "nativeTodoCreateSuccess",
        "nativeTodoCreateFailure"
      ],
      emits: [
        "nativeTodoLoadCommand",
        "nativeTodoCreateCommand"
      ],
      rules: [
        {
          trigger: "nativeTodoRefreshRequested",
          steps: [{ kind: "command", command: "nativeTodoLoadCommand" }]
        },
        {
          trigger: "nativeTodoCreateRequested",
          steps: [{ kind: "command", command: "nativeTodoCreateCommand" }]
        },
        {
          trigger: "nativeTodoCreateSuccess",
          steps: [
            { kind: "setState", state: "nativeTodoDraftTitle", value: "" },
            { kind: "command", command: "nativeTodoLoadCommand" }
          ]
        }
      ]
    }
  ],
  boundaries: [
    {
      id: "nativeTodoLoadBoundary",
      context: "frontend",
      capabilities: [],
      operations: [{
        name: "nativeTodoLoad",
        kind: "adapter",
        command: "nativeTodoLoadCommand",
        route: "/api/todos",
        method: "GET",
        loadingState: "nativeTodoLoadLoading",
        successEvent: "nativeTodoLoadSuccess",
        failureEvent: "nativeTodoLoadFailure",
        refreshRuntime: true,
        collectionOutputs: {
          native_todo_items: "todos"
        }
      }]
    },
    {
      id: "nativeTodoCreateBoundary",
      context: "frontend",
      capabilities: [],
      operations: [{
        name: "nativeTodoCreate",
        kind: "adapter",
        command: "nativeTodoCreateCommand",
        route: "/api/todos",
        method: "POST",
        loadingState: "nativeTodoCreateLoading",
        successEvent: "nativeTodoCreateSuccess",
        failureEvent: "nativeTodoCreateFailure",
        refreshRuntime: true
      }]
    }
  ],
  policies: [
    {
      id: "nativeTodoLoadPolicy",
      context: "frontend",
      subject: "nativeTodoProcess",
      initialState: "idle",
      stateField: "nativeTodoLoadStatusState",
      readyState: "ready",
      disagreementState: "repair_required",
      policyOutcomes: {
        ready: "ready",
        repair_required: "repair_required"
      },
      disagreementOutcomes: {}
    },
    {
      id: "nativeTodoCreatePolicy",
      context: "frontend",
      subject: "nativeTodoProcess",
      initialState: "idle",
      stateField: "nativeTodoCreateStatusState",
      readyState: "ready",
      disagreementState: "repair_required",
      policyOutcomes: {
        ready: "ready",
        repair_required: "repair_required"
      },
      disagreementOutcomes: {}
    }
  ],
  surfaces: [
    {
      id: "native_todo_title",
      context: "frontend",
      surfaceKind: "text",
      props: { tag: "h1", text: "Witness Todo", dataGuidanceTarget: "app-title" }
    },
    {
      id: "native_todo_copy",
      context: "frontend",
      surfaceKind: "text",
      props: { tag: "p", text: "Starter apps now author directly on canonical page.surface nouns." }
    },
    {
      id: "native_todo_input",
      context: "frontend",
      surfaceKind: "input",
      props: {
        tag: "input",
        domId: "native-todo-input",
        name: "title",
        placeholder: "New todo title"
      },
      bindings: [
        { prop: "value", source: { kind: "state", state: "nativeTodoDraftTitle" } }
      ],
      interactions: [
        { target: "self", event: "input", action: { kind: "setState", state: "nativeTodoDraftTitle", value: { kind: "eventValue" } } }
      ]
    },
    {
      id: "native_todo_submit",
      context: "frontend",
      surfaceKind: "action",
      props: {
        tag: "button",
        buttonType: "submit",
        label: "Add todo"
      },
      bindings: [
        {
          prop: "disabled",
          source: {
            kind: "state",
            state: "nativeTodoDraftTitle",
            map: { "": true, default: false }
          }
        }
      ]
    },
    {
      id: "native_todo_form",
      context: "frontend",
      surfaceKind: "generic",
      className: "surface-inline-form",
      children: ["native_todo_input", "native_todo_submit"],
      props: { tag: "form", dataGuidanceTarget: "todo-form" },
      interactions: [
        { target: "self", event: "submit", action: { kind: "deliver", message: "nativeTodoCreateRequested" } }
      ]
    },
    {
      id: "native_todo_refresh",
      context: "frontend",
      surfaceKind: "action",
      props: {
        tag: "button",
        buttonType: "button",
        label: "Refresh",
        dataGuidanceTarget: "todo-refresh"
      },
      interactions: [
        { target: "self", event: "click", action: { kind: "deliver", message: "nativeTodoRefreshRequested" } }
      ]
    },
    {
      id: "native_todo_status",
      context: "frontend",
      surfaceKind: "text",
      className: "surface-status",
      props: { tag: "p", text: "Loading todos..." },
      bindings: [
        { prop: "text", source: { kind: "state", state: "nativeTodoStatusText" } },
        { prop: "className", source: { kind: "state", state: "nativeTodoStatusTone" } }
      ]
    },
    {
      id: "native_todo_list_heading",
      context: "frontend",
      surfaceKind: "text",
      props: { tag: "h2", text: "Todos" }
    },
    {
      id: "native_todo_item_title",
      context: "frontend",
      surfaceKind: "text",
      props: {
        tag: "span",
        text: "${item.title}"
      }
    },
    {
      id: "native_todo_item_template",
      context: "frontend",
      surfaceKind: "generic",
      className: "surface-item",
      children: ["native_todo_item_title"],
      props: {
        tag: "article",
        template: true
      }
    },
    {
      id: "native_todo_list",
      context: "frontend",
      surfaceKind: "generic",
      className: "surface-stack",
      props: { tag: "div" },
      repeat: {
        collection: "native_todo_items",
        template: "native_todo_item_template",
        itemAs: "item",
        indexAs: "index"
      }
    },
    {
      id: "native_todo_list_panel",
      context: "frontend",
      surfaceKind: "generic",
      className: "surface-card surface-stack",
      children: ["native_todo_list_heading", "native_todo_list"],
      props: { tag: "section", dataGuidanceTarget: "todo-list-panel" }
    },
    {
      id: "native_todo_surface_root",
      context: "frontend",
      surfaceKind: "app-root",
      className: "surface-card surface-stack native-todo-app",
      children: [
        "native_todo_title",
        "native_todo_copy",
        "native_todo_form",
        "native_todo_refresh",
        "native_todo_status",
        "native_todo_list_panel"
      ],
      processRef: "nativeTodoProcess",
      projectionRefs: ["nativeTodoStatusProjection"],
      props: {
        dataGuidanceTarget: "app-root"
      }
    }
  ],
  routes: [
    {
      id: "home_page_route",
      path: "/",
      serves: "todoAppView",
      method: "GET",
      handler: "page.surface",
      rootSurface: "native_todo_surface_root",
      context: "frontend",
      preloadPolicies: [{
        id: "nativeTodoRouteEnter",
        when: { kind: "routeEnter", route: "home_page_route" },
        targets: [{
          kind: "route",
          route: "home_page_route",
          command: "nativeTodoLoadCommand",
          load: ["command"]
        }]
      }]
    }
  ]
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function todoStarterBlueprint() {
  const legacy = clone(todoStarterLegacyFixtureDocument);
  return {
    runner: legacy.runner,
    contexts: legacy.contexts,
    requestPlan: [
      { from: "contexts", url: "/api/contexts", skipIfPresentIn: "contexts", matchField: "id" },
      { from: "runner", url: "/api/server-runners", skipIfPresentIn: "serverRunners", matchField: "id" },
      { from: "runtimePluginInstalls", url: "/api/runtime-plugin-installs" },
      { from: "backendPrograms", url: "/api/backend-programs" },
      { from: "backendProgramVersions", url: "/api/backend-program-versions" },
      { from: "backendSteps", url: "/api/backend-steps" },
      { from: "backendActivations", urlTemplate: "/api/backend-program-versions/${soul}/activate", pickFields: ["version"] },
      { from: "types", url: "/api/types" },
      { from: "collections", url: "/api/collections" },
      { from: "messages", url: "/api/messages" },
      { from: "projections", url: "/api/projections" },
      { from: "processes", url: "/api/processes" },
      { from: "boundaries", url: "/api/boundaries" },
      { from: "policies", url: "/api/policies" },
      { from: "surfaces", url: "/api/surfaces" },
      { from: "contextBindings", url: "/api/context-bindings" },
      { from: "routes", url: "/api/routes" },
      { from: "serves", url: "/api/serve-mounts" }
    ],
    runtimePluginInstalls: legacy.runtimePluginInstalls,
    // This JSON asset is now historical substrate only. We still reuse its
    // runner, inspect-facing widgets, and uplift fixtures, but the maintained
    // runnable starter below is authored directly through native page.surface
    // nouns.
    widgets: legacy.widgets,
    program: legacy.program,
    steps: legacy.steps,
    operatingWidgets: legacy.operatingWidgets,
    operatingPrograms: legacy.operatingPrograms,
    operatingSteps: legacy.operatingSteps,
    backendPrograms: legacy.backendPrograms,
    backendProgramVersions: legacy.backendProgramVersions,
    backendSteps: legacy.backendSteps,
    backendActivations: legacy.backendActivations,
    contextBindings: [
      {
        context: "frontend",
        name: "todoAppView",
        target: "native_todo_surface_root"
      }
    ],
    collections: clone(NATIVE_TODO_STARTER.collections),
    types: clone(NATIVE_TODO_STARTER.types),
    messages: clone(NATIVE_TODO_STARTER.messages),
    projections: clone(NATIVE_TODO_STARTER.projections),
    processes: clone(NATIVE_TODO_STARTER.processes),
    boundaries: clone(NATIVE_TODO_STARTER.boundaries),
    policies: clone(NATIVE_TODO_STARTER.policies),
    surfaces: clone(NATIVE_TODO_STARTER.surfaces),
    routes: [
      ...clone(NATIVE_TODO_STARTER.routes).map(route => ({
        ...route,
        servesRef: route.id === "home_page_route" ? "todoAppView" : route.servesRef,
        rootSurfaceRef: route.id === "home_page_route" ? "todoAppView" : route.rootSurfaceRef,
        serves: route.id === "home_page_route" ? undefined : route.serves,
        rootSurface: route.id === "home_page_route" ? undefined : route.rootSurface
      })),
      ...legacy.routes.filter(route => route.id !== "home_page_route")
    ],
    operatingRoutes: legacy.operatingRoutes,
    serves: legacy.serves
  };
}
