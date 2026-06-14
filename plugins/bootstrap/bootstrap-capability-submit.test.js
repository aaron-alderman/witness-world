import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  bootstrapCapabilitySubmitContractsByFamily,
  loadBootstrapCapabilitySubmitContracts
} from "./bootstrap-capability-submit-contracts.js";
import {
  bindBootstrapCapabilitySubmit,
  buildBootstrapCapabilitySubmitRequest,
  renderBootstrapCapabilitySubmitFactory,
  runBootstrapCapabilitySubmit
} from "./bootstrap-capability-submit.js";

test("capability submit contracts load from authored WTOML", async () => {
  const source = await readFile(new URL("./bootstrap-capability-submit-contracts.wtoml", import.meta.url), "utf8");
  const contracts = loadBootstrapCapabilitySubmitContracts();

  assert.equal(source.includes('family = "capability-remove"'), true);
  assert.equal(contracts["capability-create"].successText, "Saved.");
  assert.deepEqual(contracts["capability-install"].bodyFields, ["capability", "target", "targetKind"]);
});

test("capability submit request builder preserves create, install, and remove contracts", () => {
  assert.deepEqual(
    buildBootstrapCapabilitySubmitRequest({
      detail: {
        family: "capability-create",
        id: "notes.sidebar",
        label: "Notes Sidebar",
        version: "0.1.0",
        provenanceJson: "{\"source\":\"local\"}",
        dependsOnJson: "[]",
        publicApiJson: "[]",
        configJson: "[]",
        internalsJson: "[]",
        authorityJson: "[]",
        placementJson: "[\"routePage\"]",
        context: "ctx.docs"
      },
      contractsByFamily: bootstrapCapabilitySubmitContractsByFamily
    }),
    {
      url: "/api/capabilities",
      body: {
        id: "notes.sidebar",
        label: "Notes Sidebar",
        version: "0.1.0",
        provenanceJson: "{\"source\":\"local\"}",
        dependsOnJson: "[]",
        publicApiJson: "[]",
        configJson: "[]",
        internalsJson: "[]",
        authorityJson: "[]",
        placementJson: "[\"routePage\"]",
        context: "ctx.docs"
      },
      successText: "Saved.",
      resetOnSuccess: true
    }
  );

  assert.deepEqual(
    buildBootstrapCapabilitySubmitRequest({
      detail: {
        family: "capability-install",
        capability: "notes.sidebar",
        targetKind: "routePage",
        target: "home_page_route"
      },
      contractsByFamily: bootstrapCapabilitySubmitContractsByFamily
    }),
    {
      url: "/api/capability-installs",
      body: {
        capability: "notes.sidebar",
        target: "home_page_route",
        targetKind: "routePage"
      },
      successText: "Saved.",
      resetOnSuccess: true
    }
  );

  assert.deepEqual(
    buildBootstrapCapabilitySubmitRequest({
      detail: {
        family: "capability-remove",
        capability: "notes.sidebar",
        targetKind: "routePage",
        target: "home_page_route"
      },
      contractsByFamily: bootstrapCapabilitySubmitContractsByFamily
    }),
    {
      url: "/api/capability-installs",
      method: "DELETE",
      body: {
        capability: "notes.sidebar",
        target: "home_page_route",
        targetKind: "routePage"
      },
      successText: "Removed.",
      resetOnSuccess: false
    }
  );
});

test("capability submit helper posts, resets when required, and refreshes on success", async () => {
  const calls = [];
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapCapabilitySubmit({
    detail: {
      family: "capability-install",
      formId: "capability-install-form",
      statusId: "capability-install-status",
      capability: "notes.sidebar",
      targetKind: "routePage",
      target: "home_page_route"
    },
    contractsByFamily: bootstrapCapabilitySubmitContractsByFamily,
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
    url: "/api/capability-installs",
    body: {
      capability: "notes.sidebar",
      target: "home_page_route",
      targetKind: "routePage"
    },
    method: "POST"
  }]);
  assert.deepEqual(statuses, [{ id: "capability-install-status", text: "Saved." }]);
  assert.deepEqual(resets, ["capability-install-form"]);
  assert.equal(refreshed, 1);
});

test("capability submit helper preserves remove semantics without form reset", async () => {
  const calls = [];
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapCapabilitySubmit({
    detail: {
      family: "capability-remove",
      formId: "capability-remove-form",
      statusId: "capability-remove-status",
      capability: "notes.sidebar",
      targetKind: "routePage",
      target: "home_page_route"
    },
    contractsByFamily: bootstrapCapabilitySubmitContractsByFamily,
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
    url: "/api/capability-installs",
    body: {
      capability: "notes.sidebar",
      target: "home_page_route",
      targetKind: "routePage"
    },
    method: "DELETE"
  }]);
  assert.deepEqual(statuses, [{ id: "capability-remove-status", text: "Removed." }]);
  assert.deepEqual(resets, []);
  assert.equal(refreshed, 1);
});

test("capability submit helper reports errors without reset or refresh", async () => {
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapCapabilitySubmit({
    detail: {
      family: "capability-create",
      formId: "capability-form",
      statusId: "capability-status",
      id: "notes.sidebar"
    },
    contractsByFamily: bootstrapCapabilitySubmitContractsByFamily,
    postJson: async () => {
      throw new Error("capability conflict");
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, false);
  assert.deepEqual(statuses, [{ id: "capability-status", text: "capability conflict" }]);
  assert.deepEqual(resets, []);
  assert.equal(refreshed, 0);
});

test("capability submit bridge binds one documented event family", () => {
  const events = [];
  const target = {
    addEventListener(name, handler) {
      events.push([name, handler]);
    }
  };

  const registered = bindBootstrapCapabilitySubmit({ target });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "witness:bootstrap-capability-submit");
  assert.equal(typeof registered, "function");

  const factory = renderBootstrapCapabilitySubmitFactory();
  assert.equal(factory.includes("const bootstrapCapabilitySubmitContractsByFamily ="), true);
  assert.equal(factory.includes("const buildBootstrapCapabilitySubmitRequest ="), true);
  assert.equal(factory.includes("const runBootstrapCapabilitySubmit ="), true);
  assert.equal(factory.includes("const bindBootstrapCapabilitySubmit ="), true);
});
