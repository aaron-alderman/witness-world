import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  bootstrapProposalSubmitContractsByFamily,
  loadBootstrapProposalSubmitContracts
} from "./bootstrap-proposal-submit-contracts.js";
import {
  bindBootstrapProposalSubmit,
  buildBootstrapProposalSubmitRequest,
  renderBootstrapProposalSubmitFactory,
  runBootstrapProposalSubmit
} from "./bootstrap-proposal-submit.js";

test("proposal submit contracts load from authored WTOML", async () => {
  const source = await readFile(new URL("./bootstrap-proposal-submit-contracts.wtoml", import.meta.url), "utf8");
  const contracts = loadBootstrapProposalSubmitContracts();

  assert.equal(source.includes('family = "approve"'), true);
  assert.equal(source.includes('urlTemplate = "/api/proposals/${id}/reject"'), true);
  assert.deepEqual(contracts.create.bodyFields, ["id", "targetProcess", "targetKind", "targetId", "bodyJson", "reason"]);
});

test("proposal submit request builder preserves create, approve, and reject contracts", () => {
  assert.deepEqual(
    buildBootstrapProposalSubmitRequest({
      detail: {
        family: "create",
        id: "proposal.route.home",
        targetProcess: "route.define",
        targetKind: "route",
        targetId: "home_route",
        bodyJson: "{\"path\":\"/\"}",
        reason: "Need a home route."
      },
      contractsByFamily: bootstrapProposalSubmitContractsByFamily
    }),
    {
      url: "/api/proposals",
      body: {
        id: "proposal.route.home",
        targetProcess: "route.define",
        targetKind: "route",
        targetId: "home_route",
        bodyJson: "{\"path\":\"/\"}",
        reason: "Need a home route."
      },
      successText: "Saved."
    }
  );

  assert.deepEqual(
    buildBootstrapProposalSubmitRequest({
      detail: {
        family: "approve",
        id: "proposal.route.home"
      },
      contractsByFamily: bootstrapProposalSubmitContractsByFamily
    }),
    {
      url: "/api/proposals/proposal.route.home/approve",
      body: {},
      successText: "Approved."
    }
  );

  assert.deepEqual(
    buildBootstrapProposalSubmitRequest({
      detail: {
        family: "reject",
        id: "proposal.route.home",
        reason: "Rejected in review"
      },
      contractsByFamily: bootstrapProposalSubmitContractsByFamily
    }),
    {
      url: "/api/proposals/proposal.route.home/reject",
      body: {
        reason: "Rejected in review"
      },
      successText: "Rejected."
    }
  );
});

test("proposal submit helper posts, resets, and refreshes on success", async () => {
  const calls = [];
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapProposalSubmit({
    detail: {
      family: "reject",
      formId: "proposal-reject-form",
      statusId: "proposal-reject-status",
      id: "proposal.widget.reject-home",
      reason: "Rejected through authored review controls"
    },
    contractsByFamily: bootstrapProposalSubmitContractsByFamily,
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
    url: "/api/proposals/proposal.widget.reject-home/reject",
    body: { reason: "Rejected through authored review controls" }
  }]);
  assert.deepEqual(statuses, [{ id: "proposal-reject-status", text: "Rejected." }]);
  assert.deepEqual(resets, ["proposal-reject-form"]);
  assert.equal(refreshed, 1);
});

test("proposal submit helper reports errors without reset or refresh", async () => {
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapProposalSubmit({
    detail: {
      family: "approve",
      formId: "proposal-approve-form",
      statusId: "proposal-approve-status",
      id: "proposal.route.home"
    },
    contractsByFamily: bootstrapProposalSubmitContractsByFamily,
    postJson: async () => {
      throw new Error("proposal conflict");
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, false);
  assert.deepEqual(statuses, [{ id: "proposal-approve-status", text: "proposal conflict" }]);
  assert.deepEqual(resets, []);
  assert.equal(refreshed, 0);
});

test("proposal submit bridge binds one documented event family", () => {
  const events = [];
  const target = {
    addEventListener(name, handler) {
      events.push([name, handler]);
    }
  };

  const registered = bindBootstrapProposalSubmit({ target });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "witness:bootstrap-proposal-submit");
  assert.equal(typeof registered, "function");

  const factory = renderBootstrapProposalSubmitFactory();
  assert.equal(factory.includes("const bootstrapProposalSubmitContractsByFamily ="), true);
  assert.equal(factory.includes("const bootstrapProposalResolveUrlTemplate ="), true);
  assert.equal(factory.includes("const buildBootstrapProposalSubmitRequest ="), true);
  assert.equal(factory.includes("const runBootstrapProposalSubmit ="), true);
  assert.equal(factory.includes("const bindBootstrapProposalSubmit ="), true);
});
