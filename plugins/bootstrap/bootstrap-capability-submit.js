import {
  bootstrapCapabilitySubmitContractsByFamily
} from "./bootstrap-capability-submit-contracts.js";

export function renderBootstrapCapabilitySubmitFactory() {
  return String.raw`
    const bootstrapCapabilitySubmitContractsByFamily = ${JSON.stringify(bootstrapCapabilitySubmitContractsByFamily)};
    const bootstrapCapabilityContractForFamily = ${bootstrapCapabilityContractForFamily.toString()};
    const buildBootstrapCapabilitySubmitRequest = ${buildBootstrapCapabilitySubmitRequest.toString()};
    const runBootstrapCapabilitySubmit = ${runBootstrapCapabilitySubmit.toString()};
    const bindBootstrapCapabilitySubmit = ${bindBootstrapCapabilitySubmit.toString()};
  `;
}

function bootstrapCapabilityContractForFamily(family = "", contractsByFamily = bootstrapCapabilitySubmitContractsByFamily) {
  const key = typeof family === "string" ? family.trim() : "";
  return key ? (contractsByFamily[key] || null) : null;
}

export function buildBootstrapCapabilitySubmitRequest({
  detail = {},
  contractsByFamily = bootstrapCapabilitySubmitContractsByFamily
} = {}) {
  const contract = bootstrapCapabilityContractForFamily(detail.family, contractsByFamily);
  if (!contract) return null;
  const body = Object.fromEntries(
    (contract.bodyFields || []).map(field => [field, detail[field] || ""])
  );
  return {
    url: contract.url || "",
    ...(contract.method ? { method: contract.method } : {}),
    body,
    successText: contract.successText || "Saved.",
    resetOnSuccess: contract.resetOnSuccess === true
  };
}

export async function runBootstrapCapabilitySubmit({
  detail = {},
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapCapabilitySubmitContractsByFamily
} = {}) {
  const request = buildBootstrapCapabilitySubmitRequest({ detail, contractsByFamily });
  if (!request) return false;
  try {
    await postJson(request.url, request.body, request.method || "POST");
    setStatus(detail.statusId, request.successText);
    if (request.resetOnSuccess && detail.formId) resetForm(detail.formId);
    await refresh();
    return true;
  } catch (error) {
    setStatus(detail.statusId, error.message);
    return false;
  }
}

export function bindBootstrapCapabilitySubmit({
  target = null,
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapCapabilitySubmitContractsByFamily
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  if (!resolvedTarget?.addEventListener) return null;
  const handler = event => {
    const detail = event?.detail || {};
    if (!["bootstrap-capability-controls", "bootstrap-remove-controls"].includes(detail.source)) return false;
    return runBootstrapCapabilitySubmit({
      detail,
      postJson,
      refresh,
      setStatus,
      resetForm,
      contractsByFamily
    });
  };
  resolvedTarget.addEventListener("witness:bootstrap-capability-submit", handler);
  return handler;
}
