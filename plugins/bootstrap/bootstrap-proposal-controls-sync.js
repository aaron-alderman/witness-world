import {
  buildProposalCreateView,
  buildProposalReviewView,
  openProposalOptions
} from "./bootstrap-proposal-controls-view.js";
import {
  proposalBodyIssues,
  summarizeGovernedProposalTargetFromBootstrap
} from "./bootstrap-version-guidance.js";

export function renderBootstrapProposalControlsSyncFactory() {
  return String.raw`
    const syncBootstrapProposalControlsState = ${syncBootstrapProposalControlsState.toString()};
    const applyBootstrapProposalControlsState = ${applyBootstrapProposalControlsState.toString()};
    const buildBootstrapProposalControlsSyncDeps = ${buildBootstrapProposalControlsSyncDeps.toString()};
    const createBootstrapProposalControlsSyncDepsBuilder = ${createBootstrapProposalControlsSyncDepsBuilder.toString()};
    const runBootstrapProposalControlsSync = ${runBootstrapProposalControlsSync.toString()};
    const bindBootstrapProposalControlsSync = ${bindBootstrapProposalControlsSync.toString()};
  `;
}

export function syncBootstrapProposalControlsState({
  readFieldValue = () => "",
  readSelectValue = () => "",
  proposalTargetProcesses = [],
  proposals = [],
  proposalBodyIssuesFn = () => [],
  summarizeTarget = () => "",
  openProposalRow = () => null
} = {}) {
  const processOptions = (proposalTargetProcesses || []).map(value => ({ value, label: value }));
  const proposalOptions = openProposalOptions(proposals);
  return {
    create: buildProposalCreateView({
      targetProcess: readFieldValue("proposal-form", "targetProcess"),
      targetKind: readFieldValue("proposal-form", "targetKind"),
      targetId: readFieldValue("proposal-form", "targetId"),
      bodyText: String(readFieldValue("proposal-form", "bodyJson")).trim(),
      processOptions,
      proposalBodyIssuesFn,
      summarizeTarget
    }),
    review: buildProposalReviewView({
      approveProposalId: readSelectValue("proposal-approve-id"),
      rejectProposalId: readSelectValue("proposal-reject-id"),
      proposalOptions,
      openProposalRow,
      summarizeTarget
    })
  };
}

export function applyBootstrapProposalControlsState({
  view = {},
  authored = {},
  session = {},
  fillSelect = () => {},
  byId = () => null,
  setStatus = () => {}
} = {}) {
  fillSelect("proposal-target-process", view.create?.processOptions || [], row => row.value, row => row.label, { includeBlank: false });
  const targetProcessSelect = byId("proposal-target-process");
  if (targetProcessSelect && [...targetProcessSelect.options].some(option => option.value === view.create?.selectedTargetProcess)) {
    targetProcessSelect.value = view.create.selectedTargetProcess;
  }
  fillSelect("proposal-approve-id", view.review?.proposalOptions || [], row => row.value, row => row.label, { includeBlank: false });
  const approveSelect = byId("proposal-approve-id");
  if (approveSelect && [...approveSelect.options].some(option => option.value === view.review?.selectedApproveProposalId)) {
    approveSelect.value = view.review.selectedApproveProposalId;
  }
  fillSelect("proposal-reject-id", view.review?.proposalOptions || [], row => row.value, row => row.label, { includeBlank: false });
  const rejectSelect = byId("proposal-reject-id");
  if (rejectSelect && [...rejectSelect.options].some(option => option.value === view.review?.selectedRejectProposalId)) {
    rejectSelect.value = view.review.selectedRejectProposalId;
  }
  setStatus("proposal-help", view.create?.helpText || "");
  setStatus("proposal-approve-help", view.review?.approveHelpText || "");
  const editingDisabled = !session.authenticated && (authored.identities || []).length > 0;
  const createButton = byId("proposal-form")?.querySelector('button[type="submit"]');
  if (createButton) createButton.disabled = editingDisabled || Boolean(view.create?.submitDisabled);
  const approveButton = byId("proposal-approve-form")?.querySelector('button[type="submit"]');
  if (approveButton) approveButton.disabled = editingDisabled || Boolean(view.review?.approveDisabled);
  const rejectButton = byId("proposal-reject-form")?.querySelector('button[type="submit"]');
  if (rejectButton) rejectButton.disabled = editingDisabled || Boolean(view.review?.rejectDisabled);
  return view || {};
}

export function buildBootstrapProposalControlsSyncDeps({
  state = {},
  liveState = {},
  dom = {},
  proposalBodyIssuesFn = proposalBodyIssues,
  summarizeTarget = ({ targetProcess, targetKind, targetId, body }) =>
    summarizeGovernedProposalTargetFromBootstrap({
      targetProcess,
      targetKind,
      targetId,
      body,
      authored: typeof liveState.authored === "function" ? (liveState.authored() || {}) : (state.bootstrapState || {})
    }),
  ...deps
} = {}) {
  const {
    byId = () => null,
    formField = () => null,
    fillSelect = () => {},
    setStatus = () => {},
    readSelectValue = id => byId(id)?.value || "",
    readFieldValue = (formId, fieldName) => String(formField(byId(formId), fieldName)?.value || "")
  } = dom;
  const authored = typeof liveState.authored === "function" ? (liveState.authored() || {}) : (state.bootstrapState || {});
  const session = typeof liveState.session === "function" ? (liveState.session() || {}) : (state.session || {});
  const model = typeof liveState.model === "function" ? (liveState.model() || {}) : (state.model || {});
  const openProposalRow = deps.openProposalRow || (proposalId => (authored.proposals || []).find(row => row.id === proposalId) || null);
  return {
    ...deps,
    authored,
    session,
    proposalTargetProcesses: deps.proposalTargetProcesses || (model.proposalTargetProcesses || []),
    proposals: deps.proposals || (authored.proposals || []),
    proposalBodyIssuesFn: deps.proposalBodyIssuesFn || proposalBodyIssuesFn,
    summarizeTarget: deps.summarizeTarget || summarizeTarget,
    openProposalRow,
    byId,
    fillSelect,
    setStatus,
    readSelectValue,
    readFieldValue
  };
}

export function createBootstrapProposalControlsSyncDepsBuilder(base = {}) {
  return () => buildBootstrapProposalControlsSyncDeps(base);
}

export function runBootstrapProposalControlsSync({
  detail = null,
  expectedSource = "",
  syncBootstrapProposalControlsStateFn = syncBootstrapProposalControlsState,
  applyBootstrapProposalControlsStateFn = applyBootstrapProposalControlsState,
  ...deps
} = {}) {
  if (detail && detail.source !== expectedSource) return { handled: false };
  const view = syncBootstrapProposalControlsStateFn(deps);
  applyBootstrapProposalControlsStateFn({
    ...deps,
    view
  });
  return { handled: true, view };
}

export function bindBootstrapProposalControlsSync({
  target = null,
  buildDeps = null,
  ...deps
} = {}) {
  for (const expectedSource of [
    "bootstrap-proposal-create-controls",
    "bootstrap-proposal-review-controls"
  ]) {
    const resolvedTarget = target || globalThis?.window || globalThis || null;
    const resolvedDocument = resolvedTarget?.document || globalThis?.document || null;
    const handler = event => {
      const resolvedDeps = typeof buildDeps === "function" ? (buildDeps() || {}) : deps;
      runBootstrapProposalControlsSync({
        ...resolvedDeps,
        detail: event?.detail || {},
        expectedSource,
      });
    };
    const formIds = expectedSource === "bootstrap-proposal-create-controls"
      ? ["proposal-form"]
      : ["proposal-approve-form", "proposal-reject-form"];
    for (const formId of formIds) {
      const form = resolvedDocument?.getElementById?.(formId);
      if (!form || form.__bootstrapProposalControlsSyncBound) continue;
      form.__bootstrapProposalControlsSyncBound = true;
      const trigger = () => handler({ detail: { source: expectedSource } });
      form.addEventListener("change", trigger);
      form.addEventListener("input", trigger);
    }
  }
  return target || globalThis?.window || globalThis || null;
}
