import {
  bootstrapProposalSubmitContractsByFamily
} from "./bootstrap-proposal-submit-contracts.js";

export function renderBootstrapProposalSubmitFactory() {
  return String.raw`
    const bootstrapProposalSubmitContractsByFamily = ${JSON.stringify(bootstrapProposalSubmitContractsByFamily)};
    const contractForFamily = ${contractForFamily.toString()};
    const resolveUrlTemplate = ${resolveUrlTemplate.toString()};
    const buildBootstrapProposalSubmitRequest = ${buildBootstrapProposalSubmitRequest.toString()};
    const runBootstrapProposalSubmit = ${runBootstrapProposalSubmit.toString()};
    const bindBootstrapProposalSubmit = ${bindBootstrapProposalSubmit.toString()};
  `;
}

function contractForFamily(family = "", contractsByFamily = bootstrapProposalSubmitContractsByFamily) {
  const key = typeof family === "string" ? family.trim() : "";
  return key ? (contractsByFamily[key] || null) : null;
}

function resolveUrlTemplate(template = "", detail = {}) {
  return String(template || "").replace(/\$\{([^}]+)\}/g, (_match, key) => (
    encodeURIComponent(detail?.[String(key).trim()] || "")
  ));
}

export function buildBootstrapProposalSubmitRequest({
  detail = {},
  contractsByFamily = bootstrapProposalSubmitContractsByFamily
} = {}) {
  const contract = contractForFamily(detail.family, contractsByFamily);
  if (!contract) return null;
  const body = Object.fromEntries(
    (contract.bodyFields || []).map(field => [field, detail[field] || ""])
  );
  return {
    url: contract.urlTemplate ? resolveUrlTemplate(contract.urlTemplate, detail) : (contract.url || ""),
    body,
    successText: contract.successText || "Saved."
  };
}

export async function runBootstrapProposalSubmit({
  detail = {},
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapProposalSubmitContractsByFamily
} = {}) {
  const request = buildBootstrapProposalSubmitRequest({ detail, contractsByFamily });
  if (!request) return false;
  try {
    await postJson(request.url, request.body);
    setStatus(detail.statusId, request.successText);
    if (detail.formId) resetForm(detail.formId);
    await refresh();
    return true;
  } catch (error) {
    setStatus(detail.statusId, error.message);
    return false;
  }
}

export function bindBootstrapProposalSubmit({
  target = null,
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapProposalSubmitContractsByFamily
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  if (!resolvedTarget?.addEventListener) return null;
  const handler = event => {
    const detail = event?.detail || {};
    if (!["bootstrap-proposal-create-controls", "bootstrap-proposal-review-controls"].includes(detail.source)) return false;
    return runBootstrapProposalSubmit({
      detail,
      postJson,
      refresh,
      setStatus,
      resetForm,
      contractsByFamily
    });
  };
  resolvedTarget.addEventListener("witness:bootstrap-proposal-submit", handler);
  return handler;
}
