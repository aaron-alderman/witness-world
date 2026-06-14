import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  bootstrapScopedSubmitContractsByFamily,
  loadBootstrapScopedSubmitContracts
} from "./bootstrap-scoped-submit-contracts.js";
import {
  bindBootstrapScopedSubmit,
  buildBootstrapScopedSubmitRequest,
  renderBootstrapScopedSubmitFactory,
  runBootstrapScopedSubmit
} from "./bootstrap-scoped-submit.js";

test("scoped submit contracts load from authored WTOML", async () => {
  const source = await readFile(new URL("./bootstrap-scoped-submit-contracts.wtoml", import.meta.url), "utf8");
  const contracts = loadBootstrapScopedSubmitContracts();

  assert.equal(source.includes('family = "context-binding-create"'), true);
  assert.equal(source.includes('method = "DELETE"'), true);
  assert.deepEqual(contracts["context-binding-create"].bodyFields, ["context", "name", "target"]);
  assert.equal(contracts["stewardship-remove"].method, "DELETE");
});

test("scoped submit request builder preserves create and remove contracts", () => {
  assert.deepEqual(
    buildBootstrapScopedSubmitRequest({
      detail: {
        family: "context-binding-create",
        context: "ctx.docs",
        name: "homePage",
        target: "page.home"
      }
    }),
    {
      url: "/api/context-bindings",
      body: {
        context: "ctx.docs",
        name: "homePage",
        target: "page.home"
      },
      successText: "Saved.",
      resetOnSuccess: true
    }
  );

  assert.deepEqual(
    buildBootstrapScopedSubmitRequest({
      detail: {
        family: "context-import-create",
        context: "ctx.docs",
        sourceContext: "ctx.shared",
        exportName: "homePage",
        name: "sharedHome"
      }
    }),
    {
      url: "/api/context-imports",
      body: {
        context: "ctx.docs",
        sourceContext: "ctx.shared",
        exportName: "homePage",
        name: "sharedHome"
      },
      successText: "Saved.",
      resetOnSuccess: true
    }
  );

  assert.deepEqual(
    buildBootstrapScopedSubmitRequest({
      detail: {
        family: "stewardship-remove",
        steward: "callan",
        target: "ctx.docs",
        targetKind: "context"
      }
    }),
    {
      url: "/api/stewardships",
      method: "DELETE",
      body: {
        steward: "callan",
        target: "ctx.docs",
        targetKind: "context"
      },
      successText: "Removed.",
      resetOnSuccess: false
    }
  );
});

test("scoped submit helper posts, resets create forms, and refreshes on success", async () => {
  const calls = [];
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapScopedSubmit({
    detail: {
      family: "context-export-create",
      formId: "context-export-form",
      statusId: "context-export-status",
      context: "ctx.docs",
      name: "homePage",
      target: "page.home"
    },
    contractsByFamily: bootstrapScopedSubmitContractsByFamily,
    postJson: async (url, body, method) => {
      calls.push({ url, body, method });
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [{
    url: "/api/context-exports",
    body: {
      context: "ctx.docs",
      name: "homePage",
      target: "page.home"
    },
    method: "POST"
  }]);
  assert.deepEqual(statuses, [{ id: "context-export-status", text: "Saved." }]);
  assert.deepEqual(resets, ["context-export-form"]);
  assert.equal(refreshed, 1);
});

test("scoped submit helper preserves remove semantics without reset", async () => {
  const calls = [];
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapScopedSubmit({
    detail: {
      family: "context-binding-remove",
      formId: "context-binding-remove-form",
      statusId: "context-binding-remove-status",
      context: "ctx.docs",
      name: "homePage",
      target: "page.home"
    },
    contractsByFamily: bootstrapScopedSubmitContractsByFamily,
    postJson: async (url, body, method) => {
      calls.push({ url, body, method });
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [{
    url: "/api/context-bindings",
    body: {
      context: "ctx.docs",
      name: "homePage",
      target: "page.home"
    },
    method: "DELETE"
  }]);
  assert.deepEqual(statuses, [{ id: "context-binding-remove-status", text: "Removed." }]);
  assert.deepEqual(resets, []);
  assert.equal(refreshed, 1);
});

test("scoped submit helper reports errors without refresh or reset", async () => {
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapScopedSubmit({
    detail: {
      family: "stewardship-create",
      formId: "stewardship-form",
      statusId: "stewardship-status",
      steward: "callan",
      target: "ctx.docs",
      targetKind: "context"
    },
    contractsByFamily: bootstrapScopedSubmitContractsByFamily,
    postJson: async () => {
      throw new Error("stewardship failed");
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, false);
  assert.deepEqual(statuses, [{ id: "stewardship-status", text: "stewardship failed" }]);
  assert.deepEqual(resets, []);
  assert.equal(refreshed, 0);
});

test("scoped submit bridge binds one documented event family", () => {
  const events = [];
  const target = {
    addEventListener(name, handler) {
      events.push([name, handler]);
    }
  };

  const registered = bindBootstrapScopedSubmit({ target });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "witness:bootstrap-scoped-submit");
  assert.equal(typeof registered, "function");

  const factory = renderBootstrapScopedSubmitFactory();
  assert.equal(factory.includes("const bootstrapScopedSubmitContractsByFamily ="), true);
  assert.equal(factory.includes("const buildBootstrapScopedSubmitRequest ="), true);
  assert.equal(factory.includes("const runBootstrapScopedSubmit ="), true);
  assert.equal(factory.includes("const bindBootstrapScopedSubmit ="), true);
});
