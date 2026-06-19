import test from "node:test";
import assert from "node:assert/strict";
import { buildBootstrapStarterPlan } from "./bootstrap-starter-plan.js";

test("starter plan builds ordered bootstrap requests and maps host owners", () => {
  const plan = buildBootstrapStarterPlan({
    bootstrapModel: {
      backendHosts: [{ id: "backend-host-a" }],
      frontendHosts: [{ id: "frontend-host-a" }]
    },
    bootstrapState: {
      contexts: [],
      serverRunners: []
    },
    blueprint: {
      requestPlan: [
        { from: "contexts", url: "/api/contexts", skipIfPresentIn: "contexts", matchField: "id" },
        { from: "runner", url: "/api/server-runners", skipIfPresentIn: "serverRunners", matchField: "id" },
        { from: "runtimePluginInstalls", url: "/api/runtime-plugin-installs" },
        { from: "widgets", url: "/api/widgets" },
        { from: "operatingWidgets", url: "/api/widgets" },
        { from: "program", url: "/api/frontend-programs" },
        { from: "operatingPrograms", url: "/api/frontend-programs" },
        { from: "backendPrograms", url: "/api/backend-programs" },
        { from: "backendProgramVersions", url: "/api/backend-program-versions" },
        { from: "backendSteps", url: "/api/backend-steps" },
        { from: "backendActivations", urlTemplate: "/api/backend-program-versions/${soul}/activate", pickFields: ["version"] },
        { from: "steps", url: "/api/frontend-steps" },
        { from: "operatingSteps", url: "/api/frontend-steps" },
        { from: "routes", url: "/api/routes" },
        { from: "operatingRoutes", url: "/api/routes" },
        { from: "serves", url: "/api/serve-mounts" }
      ],
      contexts: [
        { id: "backend", owner: "backendHost" },
        { id: "frontend", owner: "frontendHost" }
      ],
      runner: { id: "demo_server", handlerSet: "demo", backendHost: "backendHost", frontendHost: "frontendHost" },
      runtimePluginInstalls: [{ serverRunner: "demo_server", plugin: "plugin.demo" }],
      widgets: [{ id: "todo_app_widget" }],
      operatingWidgets: [{ id: "world_graph_page" }],
      program: { id: "todo_frontend_program" },
      operatingPrograms: [{ id: "world_graph_program" }],
      backendPrograms: [{ soul: "todo.todos.list" }],
      backendProgramVersions: [{ soul: "todo.todos.list", version: "todo.todos.list.v1" }],
      backendSteps: [{ version: "todo.todos.list.v1", event: "request" }],
      backendActivations: [{ soul: "todo.todos.list", version: "todo.todos.list.v1" }],
      steps: [{ program: "todo_frontend_program", event: "load" }],
      operatingSteps: [{ program: "world_graph_program", event: "load" }],
      routes: [{ id: "home" }],
      operatingRoutes: [{ id: "world" }],
      serves: [{ id: "home", serverRunner: "demo_server" }]
    }
  });

  assert.deepEqual(plan.requests, [
    { url: "/api/contexts", body: { id: "backend", owner: "backend-host-a" } },
    { url: "/api/contexts", body: { id: "frontend", owner: "frontend-host-a" } },
    { url: "/api/server-runners", body: { id: "demo_server", handlerSet: "demo", backendHost: "backend-host-a", frontendHost: "frontend-host-a" } },
    { url: "/api/runtime-plugin-installs", body: { serverRunner: "demo_server", plugin: "plugin.demo" } },
    { url: "/api/widgets", body: { id: "todo_app_widget" } },
    { url: "/api/widgets", body: { id: "world_graph_page" } },
    { url: "/api/frontend-programs", body: { id: "todo_frontend_program" } },
    { url: "/api/frontend-programs", body: { id: "world_graph_program" } },
    { url: "/api/backend-programs", body: { soul: "todo.todos.list" } },
    { url: "/api/backend-program-versions", body: { soul: "todo.todos.list", version: "todo.todos.list.v1" } },
    { url: "/api/backend-steps", body: { version: "todo.todos.list.v1", event: "request" } },
    { url: "/api/backend-program-versions/todo.todos.list/activate", body: { version: "todo.todos.list.v1" } },
    { url: "/api/frontend-steps", body: { program: "todo_frontend_program", event: "load" } },
    { url: "/api/frontend-steps", body: { program: "world_graph_program", event: "load" } },
    { url: "/api/routes", body: { id: "home" } },
    { url: "/api/routes", body: { id: "world" } },
    { url: "/api/serve-mounts", body: { id: "home", serverRunner: "demo_server" } }
  ]);
});

test("starter plan skips contexts and runner that already exist", () => {
  const plan = buildBootstrapStarterPlan({
    bootstrapState: {
      contexts: [{ id: "backend" }],
      serverRunners: [{ id: "demo_server" }]
    },
    blueprint: {
      requestPlan: [
        { from: "contexts", url: "/api/contexts", skipIfPresentIn: "contexts", matchField: "id" },
        { from: "runner", url: "/api/server-runners", skipIfPresentIn: "serverRunners", matchField: "id" },
        { from: "widgets", url: "/api/widgets" }
      ],
      contexts: [{ id: "backend", owner: "backendHost" }],
      runner: { id: "demo_server", handlerSet: "demo", backendHost: "backendHost", frontendHost: "frontendHost" },
      widgets: [{ id: "todo_app_widget" }]
    }
  });

  assert.deepEqual(plan.requests, [
    { url: "/api/widgets", body: { id: "todo_app_widget" } }
  ]);
});

test("starter plan resolves host placeholders and picked fields generically from the authored request plan", () => {
  const plan = buildBootstrapStarterPlan({
    bootstrapModel: {
      backendHosts: [{ id: "backend-host-a" }],
      frontendHosts: [{ id: "frontend-host-a" }]
    },
    blueprint: {
      requestPlan: [
        { from: "contexts", url: "/api/contexts" },
        { from: "runner", url: "/api/server-runners" },
        { from: "backendActivations", urlTemplate: "/api/backend-program-versions/${soul}/activate", pickFields: ["version"] }
      ],
      contexts: [{ id: "frontend", owner: "frontendHost", stewardsJson: "[\"aaron\"]" }],
      runner: { id: "demo_server", backendHost: "backendHost", frontendHost: "frontendHost" },
      backendActivations: [{ soul: "todo.todos.list", version: "todo.todos.list.v1", ignored: true }]
    }
  });

  assert.deepEqual(plan.requests, [
    { url: "/api/contexts", body: { id: "frontend", owner: "frontend-host-a", stewardsJson: "[\"aaron\"]" } },
    { url: "/api/server-runners", body: { id: "demo_server", backendHost: "backend-host-a", frontendHost: "frontend-host-a" } },
    { url: "/api/backend-program-versions/todo.todos.list/activate", body: { version: "todo.todos.list.v1" } }
  ]);
});

test("starter plan degrades cleanly when no starter blueprint is contributed", () => {
  const plan = buildBootstrapStarterPlan();

  assert.deepEqual(plan, { requests: [] });
});

test("starter plan drops unsupported handler sets from runner requests when the live bootstrap model does not expose them", () => {
  const plan = buildBootstrapStarterPlan({
    bootstrapModel: {
      backendHosts: [{ id: "backend-host-a" }],
      frontendHosts: [{ id: "frontend-host-a" }],
      supportedHandlerSets: []
    },
    blueprint: {
      requestPlan: [
        { from: "runner", url: "/api/server-runners" }
      ],
      runner: { id: "demo_server", handlerSet: "demo", backendHost: "backendHost", frontendHost: "frontendHost" }
    }
  });

  assert.deepEqual(plan.requests, [
    { url: "/api/server-runners", body: { id: "demo_server", backendHost: "backend-host-a", frontendHost: "frontend-host-a" } }
  ]);
});
