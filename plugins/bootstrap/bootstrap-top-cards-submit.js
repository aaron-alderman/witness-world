import {
  bootstrapTopCardsSubmitContractsByFamily
} from "./bootstrap-top-cards-submit-contracts.js";

export function renderBootstrapTopCardsSubmitFactory() {
  return String.raw`
    const bootstrapTopCardsSubmitContractsByFamily = ${JSON.stringify(bootstrapTopCardsSubmitContractsByFamily)};
    const buildBootstrapTopCardsSubmitRequest = ${buildBootstrapTopCardsSubmitRequest.toString()};
    const contractMatchesDetail = ${contractMatchesDetail.toString()};
    const normalizeBootstrapTopCardsBoolean = ${normalizeBootstrapTopCardsBoolean.toString()};
    const bootstrapTopCardsContractForFamily = ${bootstrapTopCardsContractForFamily.toString()};
    const runBootstrapTopCardsSubmit = ${runBootstrapTopCardsSubmit.toString()};
    const bootstrapTopCardsResolveUrlTemplate = ${bootstrapTopCardsResolveUrlTemplate.toString()};
    const applyBootstrapTopCardsSubmitFieldRule = ${applyBootstrapTopCardsSubmitFieldRule.toString()};
    const bindBootstrapTopCardsSubmit = ${bindBootstrapTopCardsSubmit.toString()};
  `;
}

function normalizeBootstrapTopCardsBoolean(value) {
  return value === true || value === "true";
}

function contractMatchesDetail(contract = {}, detail = {}) {
  const whenField = typeof contract.whenField === "string" ? contract.whenField.trim() : "";
  if (!whenField) return true;
  const value = detail?.[whenField];
  const truthy = !(value == null || value === "" || value === false);
  if (contract.whenTruthy === true) return truthy;
  if (contract.whenTruthy === false) return !truthy;
  return true;
}

function bootstrapTopCardsContractForFamily(family = "", detail = {}, contractsByFamily = bootstrapTopCardsSubmitContractsByFamily) {
  const key = typeof family === "string" ? family.trim() : "";
  const variants = key ? (contractsByFamily[key] || []) : [];
  return variants.find(contract => contractMatchesDetail(contract, detail)) || null;
}

function bootstrapTopCardsResolveUrlTemplate(template = "", detail = {}) {
  return String(template || "").replace(/\$\{([^}]+)\}/g, (_match, key) => (
    encodeURIComponent(detail?.[String(key).trim()] || "")
  ));
}

function applyBootstrapTopCardsSubmitFieldRule({
  body = {},
  detail = {},
  rule = {}
} = {}) {
  const name = typeof rule.name === "string" ? rule.name.trim() : "";
  if (!name) return body;
  const source = typeof rule.source === "string" && rule.source.trim()
    ? rule.source.trim()
    : name;
  if (rule.strategy === "boolean") {
    body[name] = normalizeBootstrapTopCardsBoolean(detail?.[source]);
    return body;
  }
  if (rule.strategy === "identityId") {
    const current = detail?.[source];
    if (current != null && String(current).trim() !== "") {
      body[name] = current;
      return body;
    }
    const fallbackSource = typeof rule.fallbackSource === "string" ? rule.fallbackSource.trim() : "";
    const fallback = fallbackSource ? detail?.[fallbackSource] : "";
    body[name] = "identity." + String(fallback || "").trim();
    return body;
  }
  body[name] = detail?.[source];
  return body;
}

export function buildBootstrapTopCardsSubmitRequest({
  detail = {},
  contractsByFamily = bootstrapTopCardsSubmitContractsByFamily
} = {}) {
  const contract = bootstrapTopCardsContractForFamily(detail.family, detail, contractsByFamily);
  if (!contract) return null;
  let body = contract.omitBody === true
    ? undefined
    : Object.fromEntries(
        (contract.bodyFields || []).map(field => [field, detail[field] || ""])
      );
  if (body && Array.isArray(contract.fields)) {
    for (const rule of contract.fields) {
      body = applyBootstrapTopCardsSubmitFieldRule({ body, detail, rule });
    }
  }
  return {
    url: contract.urlTemplate ? bootstrapTopCardsResolveUrlTemplate(contract.urlTemplate, detail) : (contract.url || ""),
    ...(contract.method ? { method: contract.method } : {}),
    body,
    ...(contract.successText ? { successText: contract.successText } : {}),
    ...(contract.resetOnSuccess != null ? { resetOnSuccess: contract.resetOnSuccess === true } : {}),
    ...(contract.followUp ? { followUp: contract.followUp } : {})
  };
}

export async function runBootstrapTopCardsSubmit({
  detail = {},
  postJson = async () => ({}),
  refresh = async () => {},
  reload = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapTopCardsSubmitContractsByFamily
} = {}) {
  const request = buildBootstrapTopCardsSubmitRequest({ detail, contractsByFamily });
  if (!request) return false;
  try {
    await postJson(request.url, request.body, request.method || "POST");
    if (request.successText && detail.statusId) {
      setStatus(detail.statusId, request.successText);
    }
    if (request.resetOnSuccess && detail.formId) {
      resetForm(detail.formId);
    }
    if (request.followUp === "reload") {
      await reload();
      return true;
    }
    if (request.followUp === "refresh") {
      await refresh();
      return true;
    }
    return true;
  } catch (error) {
    setStatus(detail.statusId, error.message);
    return false;
  }
}

export function bindBootstrapTopCardsSubmit({
  target = null,
  postJson = async () => ({}),
  refresh = async () => {},
  reload = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapTopCardsSubmitContractsByFamily
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  if (!resolvedTarget?.addEventListener) return null;
  const handler = event => {
    const detail = event?.detail || {};
    if (detail.source !== "bootstrap-top-cards") return false;
    return runBootstrapTopCardsSubmit({
      detail,
      postJson,
      refresh,
      reload,
      setStatus,
      resetForm,
      contractsByFamily
    });
  };
  resolvedTarget.addEventListener("witness:bootstrap-top-cards-submit", handler);
  return handler;
}
