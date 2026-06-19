import {
  bootstrapBackendAuthoringSubmitContractsByFamily
} from "./bootstrap-backend-authoring-submit-contracts.js";

export function renderBootstrapBackendAuthoringSubmitFactory() {
  return String.raw`
    const bootstrapBackendAuthoringSubmitContractsByFamily = ${JSON.stringify(bootstrapBackendAuthoringSubmitContractsByFamily)};
    const bootstrapBackendAuthoringCoerceFieldValue = ${bootstrapBackendAuthoringCoerceFieldValue.toString()};
    const bootstrapBackendAuthoringOmitBlankStringFields = ${bootstrapBackendAuthoringOmitBlankStringFields.toString()};
    const bootstrapBackendAuthoringContractForFamily = ${bootstrapBackendAuthoringContractForFamily.toString()};
    const buildBootstrapBackendAuthoringSubmitRequest = ${buildBootstrapBackendAuthoringSubmitRequest.toString()};
    const runBootstrapBackendAuthoringSubmit = ${runBootstrapBackendAuthoringSubmit.toString()};
    const bindBootstrapBackendAuthoringSubmit = ${bindBootstrapBackendAuthoringSubmit.toString()};
  `;
}

function bootstrapBackendAuthoringCoerceFieldValue(field, value) {
  if (value === "") return value;
  if (field === "index" || field === "order") return Number(value);
  return value;
}

function bootstrapBackendAuthoringOmitBlankStringFields(record = {}) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== "")
  );
}

function bootstrapBackendAuthoringContractForFamily(family = "", contractsByFamily = bootstrapBackendAuthoringSubmitContractsByFamily) {
  const key = typeof family === "string" ? family.trim() : "";
  return key ? (contractsByFamily[key] || null) : null;
}

export function buildBootstrapBackendAuthoringSubmitRequest({
  detail = {},
  contractsByFamily = bootstrapBackendAuthoringSubmitContractsByFamily
} = {}) {
  const contract = bootstrapBackendAuthoringContractForFamily(detail.family, contractsByFamily);
  if (!contract) return null;
  const body = bootstrapBackendAuthoringOmitBlankStringFields(Object.fromEntries(
    (contract.bodyFields || []).map(field => [field, bootstrapBackendAuthoringCoerceFieldValue(field, detail[field] ?? "")])
  ));
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
    resetForm(detail.formId);
    await refresh();
    setStatus(detail.statusId, "Saved.");
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
  const resolvedDocument = resolvedTarget?.document || globalThis?.document || null;
  if (!resolvedDocument?.getElementById) return null;
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
  for (const detail of [
    { source: "bootstrap-backend-authoring-controls", family: "program", formId: "backend-program-form", statusId: "backend-program-status" },
    { source: "bootstrap-backend-authoring-controls", family: "program-version", formId: "backend-program-version-form", statusId: "backend-program-version-status" },
    { source: "bootstrap-backend-authoring-controls", family: "step", formId: "backend-step-form", statusId: "backend-step-status" }
  ]) {
    const form = resolvedDocument?.getElementById?.(detail.formId);
    if (!form || form.__bootstrapBackendAuthoringSubmitBound) continue;
    form.__bootstrapBackendAuthoringSubmitBound = true;
    form.addEventListener("submit", event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      void handler({ detail: { ...detail, ...data } });
    });
  }
  return handler;
}
