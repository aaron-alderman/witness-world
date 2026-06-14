import {
  bootstrapBackendAuthoringSubmitContractsByFamily
} from "./bootstrap-backend-authoring-submit-contracts.js";

export function renderBootstrapBackendAuthoringSubmitFactory() {
  return String.raw`
    const bootstrapBackendAuthoringSubmitContractsByFamily = ${JSON.stringify(bootstrapBackendAuthoringSubmitContractsByFamily)};
    const contractForFamily = ${contractForFamily.toString()};
    const buildBootstrapBackendAuthoringSubmitRequest = ${buildBootstrapBackendAuthoringSubmitRequest.toString()};
    const runBootstrapBackendAuthoringSubmit = ${runBootstrapBackendAuthoringSubmit.toString()};
    const bindBootstrapBackendAuthoringSubmit = ${bindBootstrapBackendAuthoringSubmit.toString()};
  `;
}

function contractForFamily(family = "", contractsByFamily = bootstrapBackendAuthoringSubmitContractsByFamily) {
  const key = typeof family === "string" ? family.trim() : "";
  return key ? (contractsByFamily[key] || null) : null;
}

export function buildBootstrapBackendAuthoringSubmitRequest({
  detail = {},
  contractsByFamily = bootstrapBackendAuthoringSubmitContractsByFamily
} = {}) {
  const contract = contractForFamily(detail.family, contractsByFamily);
  if (!contract) return null;
  const body = Object.fromEntries(
    (contract.bodyFields || []).map(field => [field, detail[field] ?? ""])
  );
  return {
    url: contract.url || "",
    body
  };
}

export async function runBootstrapBackendAuthoringSubmit({
  detail = {},
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapBackendAuthoringSubmitContractsByFamily
} = {}) {
  const request = buildBootstrapBackendAuthoringSubmitRequest({ detail, contractsByFamily });
  if (!request) return false;
  try {
    await postJson(request.url, request.body);
    setStatus(detail.statusId, "Saved.");
    resetForm(detail.formId);
    await refresh();
    return true;
  } catch (error) {
    setStatus(detail.statusId, error.message);
    return false;
  }
}

export function bindBootstrapBackendAuthoringSubmit({
  target = null,
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapBackendAuthoringSubmitContractsByFamily
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  if (!resolvedTarget?.addEventListener) return null;
  const handler = event => {
    const detail = event?.detail || {};
    if (detail.source !== "bootstrap-backend-authoring-controls") return false;
    return runBootstrapBackendAuthoringSubmit({
      detail,
      postJson,
      refresh,
      setStatus,
      resetForm,
      contractsByFamily
    });
  };
  resolvedTarget.addEventListener("witness:bootstrap-backend-authoring-submit", handler);
  return handler;
}
