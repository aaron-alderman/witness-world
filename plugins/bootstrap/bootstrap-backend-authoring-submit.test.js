import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  bootstrapBackendAuthoringSubmitContractsByFamily,
  loadBootstrapBackendAuthoringSubmitContracts
} from "./bootstrap-backend-authoring-submit-contracts.js";
import {
  bindBootstrapBackendAuthoringSubmit,
  buildBootstrapBackendAuthoringSubmitRequest,
  renderBootstrapBackendAuthoringSubmitFactory,
  runBootstrapBackendAuthoringSubmit
} from "./bootstrap-backend-authoring-submit.js";

test("backend authoring submit contracts load from authored WTOML", async () => {
  const source = await readFile(new URL("./bootstrap-backend-authoring-submit-contracts.wtoml", import.meta.url), "utf8");
  const contracts = loadBootstrapBackendAuthoringSubmitContracts();

  assert.equal(source.includes('family = "program-version"'), true);
  assert.deepEqual(contracts.step.bodyFields, ["version", "event", "op", "order", "paramsJson", "whenJson", "repeatJson", "afterJson"]);
});

test("backend authoring submit request builder preserves typed backend create payload contracts", () => {
  assert.deepEqual(
    buildBootstrapBackendAuthoringSubmitRequest({
      detail: {
        family: "program",
        soul: "todo.todos.list",
        label: "Todo Todos List",
        context: "ctx.demo"
      }
    }),
    {
      url: "/api/backend-programs",
      body: {
        soul: "todo.todos.list",
        label: "Todo Todos List",
        context: "ctx.demo"
      }
    }
  );

  assert.deepEqual(
    buildBootstrapBackendAuthoringSubmitRequest({
      detail: {
        family: "program-version",
        soul: "todo.todos.list",
        version: "todo.todos.list.v1",
        index: 0,
        context: "ctx.demo",
        transitionFrom: "",
        transitionStrategy: "replace"
      }
    }),
    {
      url: "/api/backend-program-versions",
      body: {
        soul: "todo.todos.list",
        version: "todo.todos.list.v1",
        index: 0,
        context: "ctx.demo",
        transitionFrom: "",
        transitionStrategy: "replace"
      }
    }
  );

  assert.deepEqual(
    buildBootstrapBackendAuthoringSubmitRequest({
      detail: {
        family: "step",
        version: "todo.todos.list.v1",
        event: "request",
        op: "emit",
        order: 0,
        paramsJson: "{\"handler\":\"todos.readModel\"}",
        whenJson: "",
        repeatJson: "",
        afterJson: ""
      }
    }),
    {
      url: "/api/backend-steps",
      body: {
        version: "todo.todos.list.v1",
        event: "request",
        op: "emit",
        order: 0,
        paramsJson: "{\"handler\":\"todos.readModel\"}",
        whenJson: "",
        repeatJson: "",
        afterJson: ""
      }
    }
  );
});

test("backend authoring submit helper posts, resets, and refreshes on success", async () => {
  const calls = [];
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapBackendAuthoringSubmit({
    detail: {
      family: "step",
      formId: "backend-step-form",
      statusId: "backend-step-status",
      version: "todo.todos.list.v1",
      event: "request",
      op: "emit",
      order: 0,
      paramsJson: "{\"handler\":\"todos.readModel\"}",
      whenJson: "",
      repeatJson: "",
      afterJson: ""
    },
    contractsByFamily: bootstrapBackendAuthoringSubmitContractsByFamily,
    postJson: async (url, body) => {
      calls.push({ url, body });
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [{
    url: "/api/backend-steps",
    body: {
      version: "todo.todos.list.v1",
      event: "request",
      op: "emit",
      order: 0,
      paramsJson: "{\"handler\":\"todos.readModel\"}",
      whenJson: "",
      repeatJson: "",
      afterJson: ""
    }
  }]);
  assert.deepEqual(statuses, [{ id: "backend-step-status", text: "Saved." }]);
  assert.deepEqual(resets, ["backend-step-form"]);
  assert.equal(refreshed, 1);
});

test("backend authoring submit helper reports errors without reset or refresh", async () => {
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapBackendAuthoringSubmit({
    detail: {
      family: "program",
      formId: "backend-program-form",
      statusId: "backend-program-status",
      soul: "todo.todos.list"
    },
    contractsByFamily: bootstrapBackendAuthoringSubmitContractsByFamily,
    postJson: async () => {
      throw new Error("backend conflict");
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, false);
  assert.deepEqual(statuses, [{ id: "backend-program-status", text: "backend conflict" }]);
  assert.deepEqual(resets, []);
  assert.equal(refreshed, 0);
});

test("backend authoring submit bridge binds one documented event family", () => {
  const events = [];
  const target = {
    addEventListener(name, handler) {
      events.push([name, handler]);
    }
  };

  const registered = bindBootstrapBackendAuthoringSubmit({ target });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "witness:bootstrap-backend-authoring-submit");
  assert.equal(typeof registered, "function");

  const factory = renderBootstrapBackendAuthoringSubmitFactory();
  assert.equal(factory.includes("const bootstrapBackendAuthoringSubmitContractsByFamily ="), true);
  assert.equal(factory.includes("const buildBootstrapBackendAuthoringSubmitRequest ="), true);
  assert.equal(factory.includes("const runBootstrapBackendAuthoringSubmit ="), true);
  assert.equal(factory.includes("const bindBootstrapBackendAuthoringSubmit ="), true);
});
