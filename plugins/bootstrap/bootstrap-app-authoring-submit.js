import {
  bootstrapAppAuthoringSubmitContractsByFamily
} from "./bootstrap-app-authoring-submit-contracts.js";

export function renderBootstrapAppAuthoringSubmitFactory() {
  return String.raw`
    const bootstrapAppAuthoringSubmitContractsByFamily = ${JSON.stringify(bootstrapAppAuthoringSubmitContractsByFamily)};
    const coerceInteger = ${coerceInteger.toString()};
    const firstNonBlank = ${firstNonBlank.toString()};
    const bootstrapAppAuthoringOmitBlankStringFields = ${bootstrapAppAuthoringOmitBlankStringFields.toString()};
    const bootstrapAppAuthoringContractForFamily = ${bootstrapAppAuthoringContractForFamily.toString()};
    const checkboxesModeForFamily = ${checkboxesModeForFamily.toString()};
    const applyBootstrapAppAuthoringSubmitFieldRule = ${applyBootstrapAppAuthoringSubmitFieldRule.toString()};
    const readBootstrapAuthoringFormDataFromDocument = ${readBootstrapAuthoringFormDataFromDocument.toString()};
    const buildBootstrapAppAuthoringSubmitRequest = ${buildBootstrapAppAuthoringSubmitRequest.toString()};
    const runBootstrapAppAuthoringSubmit = ${runBootstrapAppAuthoringSubmit.toString()};
    const bindBootstrapAppAuthoringSubmit = ${bindBootstrapAppAuthoringSubmit.toString()};
  `;
}

function coerceInteger(value) {
  return value === "" || value == null ? undefined : Number(value);
}

function firstNonBlank(values = []) {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return undefined;
}

function bootstrapAppAuthoringOmitBlankStringFields(record = {}) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== "")
  );
}

function bootstrapAppAuthoringContractForFamily(family = "", contractsByFamily = bootstrapAppAuthoringSubmitContractsByFamily) {
  const key = typeof family === "string" ? family.trim() : "";
  return key ? (contractsByFamily[key] || null) : null;
}

function checkboxesModeForFamily(family = "", contractsByFamily = bootstrapAppAuthoringSubmitContractsByFamily) {
  return bootstrapAppAuthoringContractForFamily(family, contractsByFamily)?.checkboxes || null;
}

function applyBootstrapAppAuthoringSubmitFieldRule({
  rule = {},
  data = {},
  body = {}
} = {}) {
  const name = typeof rule.name === "string" ? rule.name.trim() : "";
  if (!name) return body;
  const strategy = typeof rule.strategy === "string" ? rule.strategy.trim() : "";
  const source = typeof rule.source === "string" && rule.source.trim()
    ? rule.source.trim()
    : name;
  if (strategy === "firstNonBlank") {
    body[name] = firstNonBlank((rule.sources || []).map(key => data?.[key]));
    return body;
  }
  if (strategy === "integer") {
    body[name] = coerceInteger(data?.[source]);
    return body;
  }
  if (strategy === "boolean") {
    body[name] = data?.[source] === true;
    return body;
  }
  if (strategy === "routeStateDescriptor") {
    const process = firstNonBlank([data?.[rule.processSource || "routeStateProcess"]]);
    const processRef = firstNonBlank([data?.[rule.processRefSource || "routeStateProcessRef"]]);
    const state = firstNonBlank([data?.[rule.stateSource || "routeStateState"]]);
    const stateRef = firstNonBlank([data?.[rule.stateRefSource || "routeStateStateRef"]]);
    if (process === undefined && processRef === undefined && state === undefined && stateRef === undefined) {
      return body;
    }
    body[name] = {
      ...(process !== undefined ? { process } : {}),
      ...(processRef !== undefined ? { processRef } : {}),
      ...(state !== undefined ? { state } : {}),
      ...(stateRef !== undefined ? { stateRef } : {})
    };
    return body;
  }
  body[name] = data?.[source];
  return body;
}

function readBootstrapAuthoringFormDataFromDocument({
  formId = "",
  family = "",
  contractsByFamily = bootstrapAppAuthoringSubmitContractsByFamily,
  document = globalThis?.document || null
} = {}) {
  const form = document?.getElementById?.(formId);
  if (!form) throw new Error("missing bootstrap form: " + formId);
  const data = Object.fromEntries(new FormData(form).entries());
  if (checkboxesModeForFamily(family, contractsByFamily) === "boolean") {
    for (const field of Array.from(form.elements || [])) {
      if (!field?.name || field?.type !== "checkbox") continue;
      data[field.name] = Boolean(field.checked);
    }
  }
  return data;
}

export function buildBootstrapAppAuthoringSubmitRequest({
  detail = {},
  data = {},
  contractsByFamily = bootstrapAppAuthoringSubmitContractsByFamily
} = {}) {
  const contract = bootstrapAppAuthoringContractForFamily(detail.family, contractsByFamily);
  if (!contract) return null;
  let body = { ...(data || {}) };
  if (contract.omitBlankStrings === true) {
    body = bootstrapAppAuthoringOmitBlankStringFields(body);
  }
  for (const field of contract.dropFields || []) {
    delete body[field];
  }
  for (const rule of contract.fields || []) {
    body = applyBootstrapAppAuthoringSubmitFieldRule({ rule, data, body });
  }
  return {
    url: contract.url || "",
    body
  };
}

export async function runBootstrapAppAuthoringSubmit({
  detail = {},
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapAppAuthoringSubmitContractsByFamily,
  readFormData = payload => readBootstrapAuthoringFormDataFromDocument(payload)
} = {}) {
  const data = readFormData({
    formId: detail.formId || "",
    family: detail.family || "",
    contractsByFamily
  });
  const request = buildBootstrapAppAuthoringSubmitRequest({ detail, data, contractsByFamily });
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

export function bindBootstrapAppAuthoringSubmit({
  target = null,
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  contractsByFamily = bootstrapAppAuthoringSubmitContractsByFamily,
  readFormData = payload => readBootstrapAuthoringFormDataFromDocument(payload)
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  if (!resolvedTarget?.addEventListener) return null;
  const handler = event => runBootstrapAppAuthoringSubmit({
    detail: event?.detail || {},
    postJson,
    refresh,
    setStatus,
    resetForm,
    contractsByFamily,
    readFormData
  });
  resolvedTarget.addEventListener("witness:bootstrap-app-authoring-submit", handler);
  return handler;
}
