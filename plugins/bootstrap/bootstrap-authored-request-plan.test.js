import test from "node:test";
import assert from "node:assert/strict";
import { buildBootstrapAuthoredRequestPlanRequests } from "./bootstrap-authored-request-plan.js";

test("authored request-plan helper resolves placeholders, pickFields, and url templates", () => {
  const requests = buildBootstrapAuthoredRequestPlanRequests({
    dynamicValues: {
      backendHost: "backend-host-a",
      frontendHost: "frontend-host-a"
    },
    plan: {
      requestPlan: [
        { from: "contexts", url: "/api/contexts" },
        { from: "backendActivations", urlTemplate: "/api/backend-program-versions/${soul}/activate", pickFields: ["version"] }
      ],
      contexts: [
        { id: "frontend", owner: "frontendHost", nested: { host: "backendHost" } }
      ],
      backendActivations: [
        { soul: "todo.todos.list", version: "todo.todos.list.v1", ignored: true }
      ]
    }
  });

  assert.deepEqual(requests, [
    {
      url: "/api/contexts",
      body: { id: "frontend", owner: "frontend-host-a", nested: { host: "backend-host-a" } }
    },
    {
      url: "/api/backend-program-versions/todo.todos.list/activate",
      body: { version: "todo.todos.list.v1" }
    }
  ]);
});

test("authored request-plan helper skips rows already present in authored state", () => {
  const requests = buildBootstrapAuthoredRequestPlanRequests({
    authoredState: {
      contexts: [{ id: "backend" }]
    },
    plan: {
      requestPlan: [
        { from: "contexts", url: "/api/contexts", skipIfPresentIn: "contexts", matchField: "id" },
        { from: "widgets", url: "/api/widgets" }
      ],
      contexts: [
        { id: "backend", owner: "backendHost" },
        { id: "frontend", owner: "frontendHost" }
      ],
      widgets: [{ id: "todo_app_widget" }]
    }
  });

  assert.deepEqual(requests, [
    { url: "/api/contexts", body: { id: "frontend", owner: "frontendHost" } },
    { url: "/api/widgets", body: { id: "todo_app_widget" } }
  ]);
});
