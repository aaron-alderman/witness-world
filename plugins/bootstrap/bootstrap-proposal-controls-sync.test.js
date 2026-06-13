import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBootstrapProposalControlsState,
  bindBootstrapProposalControlsSync,
  buildBootstrapProposalControlsSyncDeps,
  renderBootstrapProposalControlsSyncFactory,
  runBootstrapProposalControlsSync,
  syncBootstrapProposalControlsState
} from "./bootstrap-proposal-controls-sync.js";

test("proposal controls sync builds and applies derived state only for the expected source", () => {
  let appliedView = null;

  assert.deepEqual(runBootstrapProposalControlsSync({
    detail: { source: "bootstrap-proposal-create-controls" },
    expectedSource: "bootstrap-proposal-create-controls",
    syncBootstrapProposalControlsStateFn: () => ({
      create: { selectedTargetProcess: "backendProgramVersion.activate" },
      review: { selectedApproveProposalId: "proposal.one" }
    }),
    applyBootstrapProposalControlsStateFn: ({ view }) => { appliedView = view; }
  }), {
    handled: true,
    view: {
      create: { selectedTargetProcess: "backendProgramVersion.activate" },
      review: { selectedApproveProposalId: "proposal.one" }
    }
  });

  assert.deepEqual(runBootstrapProposalControlsSync({
    detail: { source: "other" },
    expectedSource: "bootstrap-proposal-create-controls",
    syncBootstrapProposalControlsStateFn: () => ({
      create: { selectedTargetProcess: "backendProgramVersion.rollback" }
    }),
    applyBootstrapProposalControlsStateFn: ({ view }) => { appliedView = view; }
  }), { handled: false });

  assert.deepEqual(appliedView, {
    create: { selectedTargetProcess: "backendProgramVersion.activate" },
    review: { selectedApproveProposalId: "proposal.one" }
  });
});

test("proposal controls sync supports render-time refresh without an event detail packet", () => {
  assert.deepEqual(runBootstrapProposalControlsSync({
    syncBootstrapProposalControlsStateFn: () => ({
      create: { selectedTargetProcess: "backendProgramVersion.activate" },
      review: { selectedApproveProposalId: "proposal.one" }
    }),
    applyBootstrapProposalControlsStateFn: () => {}
  }), {
    handled: true,
    view: {
      create: { selectedTargetProcess: "backendProgramVersion.activate" },
      review: { selectedApproveProposalId: "proposal.one" }
    }
  });
});

test("proposal state sync helper derives create and review views from current form reads", () => {
  const view = syncBootstrapProposalControlsState({
    readFieldValue(formId, fieldName) {
      const values = {
        "proposal-form:targetProcess": "backendProgramVersion.activate",
        "proposal-form:targetKind": "backendProgram",
        "proposal-form:targetId": "program.alpha",
        "proposal-form:bodyJson": '{"soul":"program.alpha","version":"v2"}'
      };
      return values[`${formId}:${fieldName}`] || "";
    },
    readSelectValue(id) {
      const values = {
        "proposal-approve-id": "proposal.one",
        "proposal-reject-id": "proposal.two"
      };
      return values[id] || "";
    },
    proposalTargetProcesses: ["backendProgramVersion.activate"],
    proposals: [
      {
        id: "proposal.one",
        status: "open",
        proposer: "operator.demo",
        targetProcess: "backendProgramVersion.activate",
        targetKind: "backendProgram",
        targetId: "program.alpha",
        body: { soul: "program.alpha", version: "v2" }
      },
      { id: "proposal.two", status: "open" }
    ],
    proposalBodyIssuesFn: () => [],
    summarizeTarget: ({ targetProcess, targetId }) => `${targetProcess}:${targetId}`,
    openProposalRow: proposalId => proposalId === "proposal.one"
      ? {
          id: "proposal.one",
          proposer: "operator.demo",
          targetProcess: "backendProgramVersion.activate",
          targetKind: "backendProgram",
          targetId: "program.alpha",
          body: { soul: "program.alpha", version: "v2" }
        }
      : null
  });

  assert.equal(view.create.selectedTargetProcess, "backendProgramVersion.activate");
  assert.equal(view.create.helpText, "backendProgramVersion.activate:program.alpha");
  assert.equal(view.review.selectedApproveProposalId, "proposal.one");
  assert.equal(view.review.selectedRejectProposalId, "proposal.two");
  assert.equal(view.review.approveHelpText.includes("operator.demo"), true);
});

test("proposal apply helper writes options, help, and disabled state", () => {
  const selects = new Map([
    ["proposal-target-process", { options: [{ value: "backendProgramVersion.activate" }], value: "" }],
    ["proposal-approve-id", { options: [{ value: "proposal.one" }], value: "" }],
    ["proposal-reject-id", { options: [{ value: "proposal.two" }], value: "" }]
  ]);
  const buttons = {
    create: { disabled: false },
    approve: { disabled: false },
    reject: { disabled: false }
  };
  const statuses = new Map();

  applyBootstrapProposalControlsState({
    view: {
      create: {
        processOptions: [{ value: "backendProgramVersion.activate", label: "backendProgramVersion.activate" }],
        selectedTargetProcess: "backendProgramVersion.activate",
        helpText: "Create help.",
        submitDisabled: false
      },
      review: {
        proposalOptions: [
          { value: "proposal.one", label: "proposal.one" },
          { value: "proposal.two", label: "proposal.two" }
        ],
        selectedApproveProposalId: "proposal.one",
        selectedRejectProposalId: "proposal.two",
        approveHelpText: "Review help.",
        approveDisabled: false,
        rejectDisabled: false
      }
    },
    authored: { identities: [] },
    session: { authenticated: true },
    fillSelect(id, rows) {
      const select = selects.get(id);
      if (!select) return;
      select.options = rows.map(row => ({ value: row.value, label: row.label }));
    },
    byId(id) {
      if (selects.has(id)) return selects.get(id);
      if (id === "proposal-form") return { querySelector: () => buttons.create };
      if (id === "proposal-approve-form") return { querySelector: () => buttons.approve };
      if (id === "proposal-reject-form") return { querySelector: () => buttons.reject };
      return null;
    },
    setStatus(id, text) {
      statuses.set(id, text);
    }
  });

  assert.equal(selects.get("proposal-target-process").value, "backendProgramVersion.activate");
  assert.equal(selects.get("proposal-approve-id").value, "proposal.one");
  assert.equal(selects.get("proposal-reject-id").value, "proposal.two");
  assert.equal(statuses.get("proposal-help"), "Create help.");
  assert.equal(statuses.get("proposal-approve-help"), "Review help.");
  assert.equal(buttons.create.disabled, false);
  assert.equal(buttons.approve.disabled, false);
  assert.equal(buttons.reject.disabled, false);
});

test("proposal deps builder resolves live authored and DOM readers through the shared runtime packet", () => {
  const nodes = new Map([
    ["proposal-approve-id", { value: "proposal.one" }],
    ["proposal-form", {
      elements: {
        namedItem(name) {
          const fields = {
            targetProcess: { value: "backendProgramVersion.activate" },
            targetKind: { value: "backendProgram" },
            targetId: { value: "program.alpha" },
            bodyJson: { value: '{"soul":"program.alpha","version":"v2"}' }
          };
          return fields[name] || null;
        }
      },
      querySelector() {
        return null;
      }
    }]
  ]);

  const deps = buildBootstrapProposalControlsSyncDeps({
    state: {},
    liveState: {
      authored: () => ({
        identities: [],
        proposals: [{ id: "proposal.one", status: "open" }]
      }),
      session: () => ({ authenticated: true }),
      model: () => ({ proposalTargetProcesses: ["backendProgramVersion.activate"] })
    },
    dom: {
      byId(id) {
        return nodes.get(id) || null;
      },
      formField(form, name) {
        return form?.elements?.namedItem(name) || null;
      },
      fillSelect() {},
      setStatus() {}
    }
  });

  assert.deepEqual(deps.authored, {
    identities: [],
    proposals: [{ id: "proposal.one", status: "open" }]
  });
  assert.deepEqual(deps.session, { authenticated: true });
  assert.deepEqual(deps.proposalTargetProcesses, ["backendProgramVersion.activate"]);
  assert.equal(deps.readSelectValue("proposal-approve-id"), "proposal.one");
  assert.equal(deps.readFieldValue("proposal-form", "targetId"), "program.alpha");
});

test("proposal controls sync bind routes create and review events through the shared deps seam", () => {
  const listeners = new Map();
  let runs = 0;
  let applies = 0;

  const target = {
    addEventListener(eventName, handler) {
      listeners.set(eventName, handler);
    }
  };

  assert.equal(bindBootstrapProposalControlsSync({
    target,
    buildDeps: () => ({
      syncBootstrapProposalControlsStateFn: () => {
        runs += 1;
        return {
          create: { selectedTargetProcess: "backendProgramVersion.activate" },
          review: { selectedApproveProposalId: "proposal.one" }
        };
      },
      applyBootstrapProposalControlsStateFn: () => { applies += 1; }
    })
  }), target);

  listeners.get("witness:bootstrap-proposal-create-help-sync")?.({
    detail: { source: "bootstrap-proposal-create-controls" }
  });
  listeners.get("witness:bootstrap-proposal-approve-help-sync")?.({
    detail: { source: "bootstrap-proposal-review-controls" }
  });
  listeners.get("witness:bootstrap-proposal-approve-help-sync")?.({
    detail: { source: "bootstrap-proposal-create-controls" }
  });

  assert.equal(runs, 2);
  assert.equal(applies, 2);
});

test("proposal controls sync factory exposes the shared browser seam", () => {
  const factory = renderBootstrapProposalControlsSyncFactory();

  assert.equal(factory.includes("const syncBootstrapProposalControlsState ="), true);
  assert.equal(factory.includes("const applyBootstrapProposalControlsState ="), true);
  assert.equal(factory.includes("const buildBootstrapProposalControlsSyncDeps ="), true);
  assert.equal(factory.includes("const createBootstrapProposalControlsSyncDepsBuilder ="), true);
  assert.equal(factory.includes("const runBootstrapProposalControlsSync ="), true);
  assert.equal(factory.includes("const bindBootstrapProposalControlsSync ="), true);
  assert.equal(factory.includes('"witness:bootstrap-proposal-create-help-sync"'), true);
});
