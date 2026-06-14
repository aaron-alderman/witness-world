import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  bootstrapBackendVersionSubmitContractsByFamily,
  loadBootstrapBackendVersionSubmitContracts
} from "./bootstrap-backend-version-submit-contracts.js";
import {
  bindBootstrapBackendVersionSubmit,
  buildBootstrapBackendVersionSubmitRequest,
  renderBootstrapBackendVersionSubmitFactory,
  runBootstrapBackendVersionSubmit
} from "./bootstrap-backend-version-submit.js";

test("backend version submit contracts load from authored WTOML", async () => {
  const source = await readFile(new URL("./bootstrap-backend-version-submit-contracts.wtoml", import.meta.url), "utf8");
  const contracts = loadBootstrapBackendVersionSubmitContracts();

  assert.equal(source.includes('urlTemplate = "/api/backend-program-versions/${soul}/activate"'), true);
  assert.equal(contracts.activate.successText, "Activated.");
  assert.deepEqual(contracts.rollback.bodyFields, []);
});

test("backend version submit request builder preserves activate and rollback contracts", () => {
  assert.deepEqual(
    buildBootstrapBackendVersionSubmitRequest({
      detail: {
        family: "activate",
        soul: "todo.todos.list",
        version: "todo.todos.list.v2"
      }
    }),
    {
      url: "/api/backend-program-versions/todo.todos.list/activate",
      body: {
        version: "todo.todos.list.v2"
      },
      successText: "Activated."
    }
  );

  assert.deepEqual(
    buildBootstrapBackendVersionSubmitRequest({
      detail: {
        family: "rollback",
        soul: "todo.todos.list"
      }
    }),
    {
      url: "/api/backend-program-versions/todo.todos.list/rollback",
      body: {},
      successText: "Rolled back."
    }
  );
});

test("backend version submit helper posts, reports success, and refreshes on success", async () => {
  const calls = [];
  const statuses = [];
  let refreshed = 0;

  const ok = await runBootstrapBackendVersionSubmit({
    detail: {
      family: "activate",
      statusId: "backend-program-activate-status",
      soul: "todo.todos.list",
      version: "todo.todos.list.v2"
    },
    contractsByFamily: bootstrapBackendVersionSubmitContractsByFamily,
    postJson: async (url, body) => {
      calls.push({ url, body });
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [{
    url: "/api/backend-program-versions/todo.todos.list/activate",
    body: { version: "todo.todos.list.v2" }
  }]);
  assert.deepEqual(statuses, [{ id: "backend-program-activate-status", text: "Activated." }]);
  assert.equal(refreshed, 1);
});

test("backend version submit helper reports errors without refresh", async () => {
  const statuses = [];
  let refreshed = 0;

  const ok = await runBootstrapBackendVersionSubmit({
    detail: {
      family: "rollback",
      statusId: "backend-program-rollback-status",
      soul: "todo.todos.list"
    },
    contractsByFamily: bootstrapBackendVersionSubmitContractsByFamily,
    postJson: async () => {
      throw new Error("rollback conflict");
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, false);
  assert.deepEqual(statuses, [{ id: "backend-program-rollback-status", text: "rollback conflict" }]);
  assert.equal(refreshed, 0);
});

test("backend version submit bridge binds one documented event family", () => {
  const events = [];
  const target = {
    addEventListener(name, handler) {
      events.push([name, handler]);
    }
  };

  const registered = bindBootstrapBackendVersionSubmit({ target });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "witness:bootstrap-backend-version-submit");
  assert.equal(typeof registered, "function");

  const factory = renderBootstrapBackendVersionSubmitFactory();
  assert.equal(factory.includes("const bootstrapBackendVersionSubmitContractsByFamily ="), true);
  assert.equal(factory.includes("const resolveUrlTemplate ="), true);
  assert.equal(factory.includes("const buildBootstrapBackendVersionSubmitRequest ="), true);
  assert.equal(factory.includes("const runBootstrapBackendVersionSubmit ="), true);
  assert.equal(factory.includes("const bindBootstrapBackendVersionSubmit ="), true);
});
