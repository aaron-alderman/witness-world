import {
  bootstrapRuntimeIntegrationDirectSubmitContractsByFamily
} from "./bootstrap-runtime-integration-direct-submit-contracts.js";

export function renderBootstrapRuntimeIntegrationDirectSubmitFactory() {
  return String.raw`
    const bootstrapRuntimeIntegrationDirectSubmitContractsByFamily = ${JSON.stringify(bootstrapRuntimeIntegrationDirectSubmitContractsByFamily)};
    const bootstrapRuntimeIntegrationDirectOmitBlankStringFields = ${bootstrapRuntimeIntegrationDirectOmitBlankStringFields.toString()};
    const bootstrapRuntimeIntegrationDirectContractForFamily = ${bootstrapRuntimeIntegrationDirectContractForFamily.toString()};
    const applyBootstrapRuntimeIntegrationDirectSubmitFieldRule = ${applyBootstrapRuntimeIntegrationDirectSubmitFieldRule.toString()};
    const buildBootstrapRuntimeIntegrationDirectSubmitRequest = ${buildBootstrapRuntimeIntegrationDirectSubmitRequest.toString()};
    const runBootstrapRuntimeIntegrationDirectSubmit = ${runBootstrapRuntimeIntegrationDirectSubmit.toString()};
    const bindBootstrapRuntimeIntegrationDirectSubmit = ${bindBootstrapRuntimeIntegrationDirectSubmit.toString()};
  `;
}

function bootstrapRuntimeIntegrationDirectOmitBlankStringFields(record = {}) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== "")
  );
}

function bootstrapRuntimeIntegrationDirectContractForFamily(family = "", contractsByFamily = bootstrapRuntimeIntegrationDirectSubmitContractsByFamily) {
  const key = typeof family === "string" ? family.trim() : "";
  return key ? (contractsByFamily[key] || null) : null;
}

function applyBootstrapRuntimeIntegrationDirectSubmitFieldRule({
  body = {},
  detail = {},
  rule = {}
} = {}) {
  const name = typeof rule.name === "string" ? rule.name.trim() : "";
  if (!name) return body;
  const raw = detail?.[name];
  body[name] = raw === "" || raw == null
    ? (rule.defaultValue ?? "")
    : raw;
  return body;
}

export function buildBootstrapRuntimeIntegrationDirectSubmitRequest({
  detail = {},
  contractsByFamily = bootstrapRuntimeIntegrationDirectSubmitContractsByFamily
} = {}) {
  const contract = bootstrapRuntimeIntegrationDirectContractForFamily(detail.family, contractsByFamily);
  if (!contract) return null;
  let body = Object.fromEntries(
    (contract.bodyFields || []).map(field => [field, detail[field] || ""])
  );
  for (const rule of contract.fields || []) {
    body = applyBootstrapRuntimeIntegrationDirectSubmitFieldRule({ body, detail, rule });
  }
  if (contract.omitBlankStrings === true) {
    body = bootstrapRuntimeIntegrationDirectOmitBlankStringFields(body);
  }
  return {
    url: contract.url || "",
    ...(contract.method ? { method: contract.method } : {}),
    body,
    successText: contract.successText || "Saved.",
    resetOnSuccess: contract.resetOnSuccess === true
  };
}

export async function runBootstrapRuntimeIntegrationDirectSubmit({
  detail = {},
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapRuntimeIntegrationDirectSubmitContractsByFamily
} = {}) {
  const request = buildBootstrapRuntimeIntegrationDirectSubmitRequest({ detail, contractsByFamily });
  if (!request) return false;
  try {
    await postJson(request.url, request.body, request.method || "POST");
    setStatus(detail.statusId, request.successText || "Saved.");
    if (request.resetOnSuccess && detail.formId) resetForm(detail.formId);
    await refresh();
    return true;
  } catch (error) {
    setStatus(detail.statusId, error.message);
    return false;
  }
}

export function bindBootstrapRuntimeIntegrationDirectSubmit({
  target = null,
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapRuntimeIntegrationDirectSubmitContractsByFamily
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  const resolvedDocument = resolvedTarget?.document || globalThis?.document || null;
  if (!resolvedDocument?.getElementById) return null;
  const handler = event => runBootstrapRuntimeIntegrationDirectSubmit({
    detail: event?.detail || {},
    postJson,
    refresh,
    setStatus,
    resetForm,
    contractsByFamily
  });
  for (const detail of [
    { source: "bootstrap-runtime-integration-controls", family: "runtime-plugin-install", formId: "runtime-plugin-install-form", statusId: "runtime-plugin-install-status" },
    { source: "bootstrap-remove-controls", family: "runtime-plugin-remove", formId: "runtime-plugin-remove-form", statusId: "runtime-plugin-remove-status" },
    { source: "bootstrap-runtime-integration-controls", family: "mcp-server", formId: "mcp-server-form", statusId: "mcp-server-status" },
    { source: "bootstrap-runtime-integration-controls", family: "mcp-tool-install", formId: "mcp-tool-install-form", statusId: "mcp-tool-install-status" },
    { source: "bootstrap-remove-controls", family: "mcp-tool-remove", formId: "mcp-tool-remove-form", statusId: "mcp-tool-remove-status" }
  ]) {
    const form = resolvedDocument?.getElementById?.(detail.formId);
    if (!form || form.__bootstrapRuntimeIntegrationSubmitBound) continue;
    form.__bootstrapRuntimeIntegrationSubmitBound = true;
    form.addEventListener("submit", event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      void handler({ detail: { ...detail, ...data } });
    });
  }
  return handler;
}
