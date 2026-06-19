import {
  bootstrapScopedSubmitContractsByFamily
} from "./bootstrap-scoped-submit-contracts.js";

export function renderBootstrapScopedSubmitFactory() {
  return String.raw`
    const bootstrapScopedSubmitContractsByFamily = ${JSON.stringify(bootstrapScopedSubmitContractsByFamily)};
    const bootstrapScopedContractForFamily = ${bootstrapScopedContractForFamily.toString()};
    const buildBootstrapScopedSubmitRequest = ${buildBootstrapScopedSubmitRequest.toString()};
    const runBootstrapScopedSubmit = ${runBootstrapScopedSubmit.toString()};
    const bindBootstrapScopedSubmit = ${bindBootstrapScopedSubmit.toString()};
  `;
}

function bootstrapScopedContractForFamily(family = "", contractsByFamily = bootstrapScopedSubmitContractsByFamily) {
  const key = typeof family === "string" ? family.trim() : "";
  return key ? (contractsByFamily[key] || null) : null;
}

export function buildBootstrapScopedSubmitRequest({
  detail = {},
  contractsByFamily = bootstrapScopedSubmitContractsByFamily
} = {}) {
  const contract = bootstrapScopedContractForFamily(detail.family, contractsByFamily);
  if (!contract) return null;
  const body = Object.fromEntries(
    (contract.bodyFields || []).map(field => [field, detail[field] || ""])
  );
  return {
    url: contract.url || "",
    body,
    successText: contract.successText || "Saved.",
    resetOnSuccess: contract.resetOnSuccess === true,
    ...(contract.method ? { method: contract.method } : {})
  };
}

export async function runBootstrapScopedSubmit({
  detail = {},
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapScopedSubmitContractsByFamily
} = {}) {
  const request = buildBootstrapScopedSubmitRequest({ detail, contractsByFamily });
  if (!request) return false;
  try {
    await postJson(request.url, request.body, request.method || "POST");
    setStatus(detail.statusId, request.successText);
    if (request.resetOnSuccess && detail.formId) {
      resetForm(detail.formId);
    }
    await refresh();
    return true;
  } catch (error) {
    setStatus(detail.statusId, error.message);
    return false;
  }
}

export function bindBootstrapScopedSubmit({
  target = null,
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapScopedSubmitContractsByFamily
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  if (!resolvedTarget?.addEventListener) return null;
  const handler = event => {
    const detail = event?.detail || {};
    if (!["bootstrap-scoped-controls", "bootstrap-remove-controls"].includes(detail.source)) {
      return false;
    }
    return runBootstrapScopedSubmit({
      detail,
      postJson,
      refresh,
      setStatus,
      resetForm,
      contractsByFamily
    });
  };
  resolvedTarget.addEventListener("witness:bootstrap-scoped-submit", handler);
  return handler;
}
