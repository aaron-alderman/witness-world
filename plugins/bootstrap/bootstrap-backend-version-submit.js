import {
  bootstrapBackendVersionSubmitContractsByFamily
} from "./bootstrap-backend-version-submit-contracts.js";

export function renderBootstrapBackendVersionSubmitFactory() {
  return String.raw`
    const bootstrapBackendVersionSubmitContractsByFamily = ${JSON.stringify(bootstrapBackendVersionSubmitContractsByFamily)};
    const bootstrapBackendVersionContractForFamily = ${bootstrapBackendVersionContractForFamily.toString()};
    const bootstrapBackendVersionResolveUrlTemplate = ${bootstrapBackendVersionResolveUrlTemplate.toString()};
    const buildBootstrapBackendVersionSubmitRequest = ${buildBootstrapBackendVersionSubmitRequest.toString()};
    const runBootstrapBackendVersionSubmit = ${runBootstrapBackendVersionSubmit.toString()};
    const bindBootstrapBackendVersionSubmit = ${bindBootstrapBackendVersionSubmit.toString()};
  `;
}

function bootstrapBackendVersionContractForFamily(family = "", contractsByFamily = bootstrapBackendVersionSubmitContractsByFamily) {
  const key = typeof family === "string" ? family.trim() : "";
  return key ? (contractsByFamily[key] || null) : null;
}

function bootstrapBackendVersionResolveUrlTemplate(template = "", detail = {}) {
  return String(template || "").replace(/\$\{([^}]+)\}/g, (_match, key) => (
    encodeURIComponent(detail?.[String(key).trim()] || "")
  ));
}

export function buildBootstrapBackendVersionSubmitRequest({
  detail = {},
  contractsByFamily = bootstrapBackendVersionSubmitContractsByFamily
} = {}) {
  const contract = bootstrapBackendVersionContractForFamily(detail.family, contractsByFamily);
  if (!contract) return null;
  const body = Object.fromEntries(
    (contract.bodyFields || []).map(field => [field, detail[field] || ""])
  );
  return {
    url: bootstrapBackendVersionResolveUrlTemplate(contract.urlTemplate, detail),
    body,
    successText: contract.successText || "Saved."
  };
}

export async function runBootstrapBackendVersionSubmit({
  detail = {},
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  contractsByFamily = bootstrapBackendVersionSubmitContractsByFamily
} = {}) {
  const request = buildBootstrapBackendVersionSubmitRequest({ detail, contractsByFamily });
  if (!request) return false;
  try {
    await postJson(request.url, request.body);
    setStatus(detail.statusId, request.successText);
    await refresh();
    return true;
  } catch (error) {
    setStatus(detail.statusId, error.message);
    return false;
  }
}

export function bindBootstrapBackendVersionSubmit({
  target = null,
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  contractsByFamily = bootstrapBackendVersionSubmitContractsByFamily
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  if (!resolvedTarget?.addEventListener) return null;
  const handler = event => {
    const detail = event?.detail || {};
    if (detail.source !== "bootstrap-backend-version-controls") return false;
    return runBootstrapBackendVersionSubmit({
      detail,
      postJson,
      refresh,
      setStatus,
      contractsByFamily
    });
  };
  resolvedTarget.addEventListener("witness:bootstrap-backend-version-submit", handler);
  return handler;
}
