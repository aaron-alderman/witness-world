import test from "node:test";
import assert from "node:assert/strict";
import {
  openProposalOptions,
  buildProposalCreateView,
  buildProposalReviewView
} from "./bootstrap-proposal-controls-view.js";

test("open proposal options only include open proposals", () => {
  assert.deepEqual(openProposalOptions([
    { id: "proposal.one", status: "open" },
    { id: "proposal.two", status: "approved" },
    { id: "proposal.three", status: "open" }
  ]), [
    { value: "proposal.one", label: "proposal.one" },
    { value: "proposal.three", label: "proposal.three" }
  ]);
});

test("proposal create view keeps selected process and reports JSON parse errors", () => {
  const view = buildProposalCreateView({
    targetProcess: "backendProgramVersion.activate",
    bodyText: "{bad json",
    processOptions: [
      { value: "backendProgramVersion.activate", label: "backendProgramVersion.activate" },
      { value: "backendProgramVersion.rollback", label: "backendProgramVersion.rollback" }
    ]
  });

  assert.deepEqual(view, {
    processOptions: [
      { value: "backendProgramVersion.activate", label: "backendProgramVersion.activate" },
      { value: "backendProgramVersion.rollback", label: "backendProgramVersion.rollback" }
    ],
    selectedTargetProcess: "backendProgramVersion.activate",
    helpText: "Body JSON must be valid JSON.",
    submitDisabled: true
  });
});

test("proposal create view combines issues and summary when body is valid", () => {
  const view = buildProposalCreateView({
    targetProcess: "backendProgramVersion.activate",
    targetKind: "backendProgram",
    targetId: "inventory",
    bodyText: '{"soul":"inventory","version":"v2"}',
    processOptions: [
      { value: "backendProgramVersion.activate", label: "backendProgramVersion.activate" }
    ],
    proposalBodyIssuesFn: ({ targetProcess, targetId, body }) => {
      assert.equal(targetProcess, "backendProgramVersion.activate");
      assert.equal(targetId, "inventory");
      assert.deepEqual(body, { soul: "inventory", version: "v2" });
      return ["requires authority"];
    },
    summarizeTarget: ({ targetProcess, targetKind, targetId, body }) => {
      assert.equal(targetProcess, "backendProgramVersion.activate");
      assert.equal(targetKind, "backendProgram");
      assert.equal(targetId, "inventory");
      assert.deepEqual(body, { soul: "inventory", version: "v2" });
      return "Activation proposal summary.";
    }
  });

  assert.deepEqual(view, {
    processOptions: [
      { value: "backendProgramVersion.activate", label: "backendProgramVersion.activate" }
    ],
    selectedTargetProcess: "backendProgramVersion.activate",
    helpText: "requires authority Activation proposal summary.",
    submitDisabled: true
  });
});

test("proposal review view defaults to the first open proposal and reports summary text", () => {
  const proposalOptions = [
    { value: "proposal.one", label: "proposal.one" },
    { value: "proposal.two", label: "proposal.two" }
  ];
  const view = buildProposalReviewView({
    rejectProposalId: "proposal.two",
    proposalOptions,
    openProposalRow: id => id === "proposal.one"
      ? {
          id,
          proposer: "operator.demo",
          targetProcess: "mcpServer.define",
          targetKind: "serverRunner",
          targetId: "demo_server",
          body: { id: "ops_mcp" },
          reason: "Need ops MCP"
        }
      : null,
    summarizeTarget: ({ targetProcess, targetKind, targetId, body }) => {
      assert.equal(targetProcess, "mcpServer.define");
      assert.equal(targetKind, "serverRunner");
      assert.equal(targetId, "demo_server");
      assert.deepEqual(body, { id: "ops_mcp" });
      return "Proposal summary.";
    }
  });

  assert.deepEqual(view, {
    proposalOptions,
    selectedApproveProposalId: "proposal.one",
    selectedRejectProposalId: "proposal.two",
    approveHelpText: "Proposed by operator.demo. Proposal summary. Reason: Need ops MCP.",
    approveDisabled: false,
    rejectDisabled: false
  });
});

test("proposal review view disables approve when no open proposal is available", () => {
  const view = buildProposalReviewView({
    proposalOptions: [],
    openProposalRow: () => null
  });

  assert.deepEqual(view, {
    proposalOptions: [],
    selectedApproveProposalId: "",
    selectedRejectProposalId: "",
    approveHelpText: "Choose an open proposal to inspect target, proposer, and authority context.",
    approveDisabled: true,
    rejectDisabled: true
  });
});
