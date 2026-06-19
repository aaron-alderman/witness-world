import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  bootstrapTopCardsSubmitContractsByFamily,
  loadBootstrapTopCardsSubmitContracts
} from "./bootstrap-top-cards-submit-contracts.js";
import {
  bindBootstrapTopCardsSubmit,
  buildBootstrapTopCardsSubmitRequest,
  renderBootstrapTopCardsSubmitFactory,
  runBootstrapTopCardsSubmit
} from "./bootstrap-top-cards-submit.js";

test("top-cards submit contracts load from authored WTOML", async () => {
  const source = await readFile(new URL("./bootstrap-top-cards-submit-contracts.wtoml", import.meta.url), "utf8");
  const contracts = loadBootstrapTopCardsSubmitContracts();

  assert.equal(source.includes('family = "identity-submit"'), true);
  assert.equal(source.includes('strategy = "identityId"'), true);
  assert.equal(source.includes('family = "bootstrap-app-boundary"'), true);
  assert.equal(source.includes('family = "operator-import"'), true);
  assert.equal(Array.isArray(contracts["identity-submit"]), true);
  assert.equal(contracts["identity-submit"].length, 2);
  assert.equal(contracts["session-logout"][0].omitBody, true);
  assert.equal(contracts["bootstrap-app-boundary"][0].omitBody, true);
});

test("top-cards submit request builder preserves identity, session, and operator contracts", () => {
  assert.deepEqual(
    buildBootstrapTopCardsSubmitRequest({
      detail: {
        family: "identity-submit",
        id: "",
        actor: "aaron",
        label: "Aaron",
        username: "aaron",
        password: "secret",
        homeContext: "aaron:home",
        homePerspective: "aaron:personal"
      }
      ,
      contractsByFamily: bootstrapTopCardsSubmitContractsByFamily
    }),
    {
      url: "/api/identities",
      method: "POST",
      body: {
        id: "identity.aaron",
        actor: "aaron",
        label: "Aaron",
        username: "aaron",
        password: "secret",
        homeContext: "aaron:home",
        homePerspective: "aaron:personal"
      },
      successText: "Identity created.",
      resetOnSuccess: true,
      followUp: "refresh"
    }
  );

  assert.deepEqual(
    buildBootstrapTopCardsSubmitRequest({
      detail: {
        family: "identity-submit",
        editId: "identity.aaron",
        label: "Aaron Updated",
        username: "aaron",
        password: "secret",
        homeContext: "aaron:home",
        homePerspective: "aaron:work"
      }
      ,
      contractsByFamily: bootstrapTopCardsSubmitContractsByFamily
    }),
    {
      url: "/api/identities/identity.aaron",
      method: "PATCH",
      body: {
        label: "Aaron Updated",
        username: "aaron",
        password: "secret",
        homeContext: "aaron:home",
        homePerspective: "aaron:work"
      },
      successText: "Identity updated.",
      resetOnSuccess: false,
      followUp: "refresh"
    }
  );

  assert.deepEqual(
    buildBootstrapTopCardsSubmitRequest({
      detail: {
        family: "bootstrap-app-boundary"
      },
      contractsByFamily: bootstrapTopCardsSubmitContractsByFamily
    }),
    {
      url: "/api/bootstrap/app-boundary",
      body: undefined,
      followUp: "refresh"
    }
  );

  assert.deepEqual(
    buildBootstrapTopCardsSubmitRequest({
      detail: {
        family: "session-logout"
      },
      contractsByFamily: bootstrapTopCardsSubmitContractsByFamily
    }),
    {
      url: "/api/session",
      method: "DELETE",
      body: undefined,
      followUp: "refresh"
    }
  );

  assert.deepEqual(
    buildBootstrapTopCardsSubmitRequest({
      detail: {
        family: "operator-restore",
        artifactId: "artifact-1",
        preserveCurrent: "true"
      }
      ,
      contractsByFamily: bootstrapTopCardsSubmitContractsByFamily
    }),
    {
      url: "/api/operator/restores",
      body: {
        artifactId: "artifact-1",
        preserveCurrent: true
      },
      followUp: "reload"
    }
  );
});

test("top-cards submit helper refreshes identity/session flows and resets create forms", async () => {
  const calls = [];
  const statuses = [];
  const resets = [];
  let refreshed = 0;
  let reloaded = 0;

  const ok = await runBootstrapTopCardsSubmit({
    detail: {
      family: "identity-submit",
      formId: "identity-form",
      statusId: "identity-status",
      id: "",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "secret",
      homeContext: "aaron:home",
      homePerspective: "aaron:personal"
    },
    contractsByFamily: bootstrapTopCardsSubmitContractsByFamily,
    postJson: async (url, body, method) => {
      calls.push({ url, body, method });
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    },
    reload: async () => {
      reloaded += 1;
    }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [{
    url: "/api/identities",
    body: {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "secret",
      homeContext: "aaron:home",
      homePerspective: "aaron:personal"
    },
    method: "POST"
  }]);
  assert.deepEqual(statuses, [{ id: "identity-status", text: "Identity created." }]);
  assert.deepEqual(resets, ["identity-form"]);
  assert.equal(refreshed, 1);
  assert.equal(reloaded, 0);
});

test("top-cards submit helper prefers server status messages for bootstrap-boundary actions", async () => {
  const statuses = [];
  let refreshed = 0;

  const ok = await runBootstrapTopCardsSubmit({
    detail: {
      family: "bootstrap-app-boundary",
      statusId: "bootstrap-status"
    },
    contractsByFamily: bootstrapTopCardsSubmitContractsByFamily,
    postJson: async () => ({
      statusMessage: "Proposed authored app-boundary establishment for review."
    }),
    setStatus: (id, text) => statuses.push({ id, text }),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, true);
  assert.deepEqual(statuses, [{
    id: "bootstrap-status",
    text: "Proposed authored app-boundary establishment for review."
  }]);
  assert.equal(refreshed, 1);
});

test("top-cards submit helper reloads operator flows without resetting forms", async () => {
  const calls = [];
  const statuses = [];
  const resets = [];
  let refreshed = 0;
  let reloaded = 0;

  const ok = await runBootstrapTopCardsSubmit({
    detail: {
      family: "operator-backup",
      statusId: "operator-backup-status",
      label: "before-change",
      includeDerived: "true"
    },
    contractsByFamily: bootstrapTopCardsSubmitContractsByFamily,
    postJson: async (url, body, method) => {
      calls.push({ url, body, method });
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    },
    reload: async () => {
      reloaded += 1;
    }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [{
    url: "/api/operator/backups",
    body: {
      label: "before-change",
      includeDerived: true
    },
    method: "POST"
  }]);
  assert.deepEqual(statuses, []);
  assert.deepEqual(resets, []);
  assert.equal(refreshed, 0);
  assert.equal(reloaded, 1);
});

test("top-cards submit helper reports errors without follow-up side effects", async () => {
  const statuses = [];
  const resets = [];
  let refreshed = 0;
  let reloaded = 0;

  const ok = await runBootstrapTopCardsSubmit({
    detail: {
      family: "session-open",
      statusId: "bootstrap-status",
      username: "aaron",
      password: "bad"
    },
    contractsByFamily: bootstrapTopCardsSubmitContractsByFamily,
    postJson: async () => {
      throw new Error("sign in failed");
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    },
    reload: async () => {
      reloaded += 1;
    }
  });

  assert.equal(ok, false);
  assert.deepEqual(statuses, [{ id: "bootstrap-status", text: "sign in failed" }]);
  assert.deepEqual(resets, []);
  assert.equal(refreshed, 0);
  assert.equal(reloaded, 0);
});

test("top-cards submit bridge binds one documented event family", () => {
  const events = [];
  const target = {
    addEventListener(name, handler) {
      events.push([name, handler]);
    }
  };

  const registered = bindBootstrapTopCardsSubmit({ target });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "witness:bootstrap-top-cards-submit");
  assert.equal(typeof registered, "function");

  const factory = renderBootstrapTopCardsSubmitFactory();
  assert.equal(factory.includes("const bootstrapTopCardsSubmitContractsByFamily ="), true);
  assert.equal(factory.includes("const bootstrapTopCardsContractForFamily ="), true);
  assert.equal(factory.includes("const bootstrapTopCardsResolveUrlTemplate ="), true);
  assert.equal(factory.includes("const buildBootstrapTopCardsSubmitRequest ="), true);
  assert.equal(factory.includes("const runBootstrapTopCardsSubmit ="), true);
  assert.equal(factory.includes("const bindBootstrapTopCardsSubmit ="), true);
});
