export function renderBootstrapProposalControlsViewFactory() {
  return String.raw`
    const openProposalOptions = ${openProposalOptions.toString()};
    const buildProposalCreateView = ${buildProposalCreateView.toString()};
    const buildProposalReviewView = ${buildProposalReviewView.toString()};
  `;
}

export function openProposalOptions(proposals = []) {
  return (proposals || [])
    .filter(row => row.status === "open")
    .map(row => ({ value: row.id, label: row.id }));
}

export function buildProposalCreateView({
  targetProcess = "",
  targetKind = "",
  targetId = "",
  bodyText = "",
  processOptions = [],
  proposalBodyIssuesFn = () => [],
  summarizeTarget = () => ""
} = {}) {
  const selectedTargetProcess = (processOptions || []).some(row => row.value === targetProcess)
    ? targetProcess
    : (processOptions?.[0]?.value || "");
  let parsedBody = {};
  let parseError = null;
  try {
    parsedBody = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    parseError = "Body JSON must be valid JSON.";
  }
  const issues = parseError ? [] : proposalBodyIssuesFn({
    targetProcess: selectedTargetProcess,
    targetId,
    body: parsedBody
  });
  const summary = parseError
    ? ""
    : summarizeTarget({
      targetProcess: selectedTargetProcess,
      targetKind,
      targetId,
      body: parsedBody
    });
  const help = parseError
    ? parseError
    : (issues.length ? issues.join(" ") + " " + summary : summary);
  return {
    processOptions,
    selectedTargetProcess,
    helpText: help,
    submitDisabled: Boolean(parseError) || issues.length > 0
  };
}

export function buildProposalReviewView({
  approveProposalId = "",
  rejectProposalId = "",
  proposalOptions = [],
  openProposalRow = () => null,
  summarizeTarget = () => ""
} = {}) {
  const selectedApproveProposalId = (proposalOptions || []).some(row => row.value === approveProposalId)
    ? approveProposalId
    : (proposalOptions?.[0]?.value || "");
  const selectedRejectProposalId = (proposalOptions || []).some(row => row.value === rejectProposalId)
    ? rejectProposalId
    : (proposalOptions?.[0]?.value || "");
  const proposal = openProposalRow(selectedApproveProposalId);
  if (!proposal) {
    return {
      proposalOptions,
      selectedApproveProposalId,
      selectedRejectProposalId,
      approveHelpText: "Choose an open proposal to inspect target, proposer, and authority context.",
      approveDisabled: true,
      rejectDisabled: !selectedRejectProposalId
    };
  }
  const summary = summarizeTarget({
    targetProcess: proposal.targetProcess,
    targetKind: proposal.targetKind,
    targetId: proposal.targetId,
    body: proposal.body || {}
  });
  return {
    proposalOptions,
    selectedApproveProposalId,
    selectedRejectProposalId,
    approveHelpText: "Proposed by " + (proposal.proposer || "unknown actor") + ". " + summary + (proposal.reason ? " Reason: " + proposal.reason + "." : ""),
    approveDisabled: false,
    rejectDisabled: !selectedRejectProposalId
  };
}
