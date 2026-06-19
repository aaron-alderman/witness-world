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
  const resolvedDocument = resolvedTarget?.document || globalThis?.document || null;
  if (!resolvedDocument?.getElementById) return null;
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
  for (const detail of [
    { source: "bootstrap-scoped-controls", family: "context-binding-create", formId: "context-binding-form", statusId: "context-binding-status" },
    { source: "bootstrap-scoped-controls", family: "context-export-create", formId: "context-export-form", statusId: "context-export-status" },
    { source: "bootstrap-scoped-controls", family: "context-import-create", formId: "context-import-form", statusId: "context-import-status" },
    { source: "bootstrap-scoped-controls", family: "stewardship-create", formId: "stewardship-form", statusId: "stewardship-status" },
    { source: "bootstrap-remove-controls", family: "context-binding-remove", formId: "context-binding-remove-form", statusId: "context-binding-remove-status" },
    { source: "bootstrap-remove-controls", family: "context-export-remove", formId: "context-export-remove-form", statusId: "context-export-remove-status" },
    { source: "bootstrap-remove-controls", family: "context-import-remove", formId: "context-import-remove-form", statusId: "context-import-remove-status" },
    { source: "bootstrap-remove-controls", family: "stewardship-remove", formId: "stewardship-remove-form", statusId: "stewardship-remove-status" }
  ]) {
    const form = resolvedDocument?.getElementById?.(detail.formId);
    if (!form || form.__bootstrapScopedSubmitBound) continue;
    form.__bootstrapScopedSubmitBound = true;
    form.addEventListener("submit", event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      void handler({ detail: { ...detail, ...data } });
    });
  }
  return handler;
}
