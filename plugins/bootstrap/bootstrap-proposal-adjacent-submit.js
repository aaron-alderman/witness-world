import {
  bootstrapProposalAdjacentSubmitContractsByFamily
} from "./bootstrap-proposal-adjacent-submit-contracts.js";

export function renderBootstrapProposalAdjacentSubmitFactory() {
  return String.raw`
    const bootstrapProposalAdjacentSubmitContractsByFamily = ${JSON.stringify(bootstrapProposalAdjacentSubmitContractsByFamily)};
    const bootstrapProposalAdjacentContractForFamily = ${bootstrapProposalAdjacentContractForFamily.toString()};
    const buildBootstrapProposalAdjacentSubmitBody = ${buildBootstrapProposalAdjacentSubmitBody.toString()};
    const buildBootstrapProposalAdjacentSubmitRequest = ${buildBootstrapProposalAdjacentSubmitRequest.toString()};
    const runBootstrapProposalAdjacentSubmit = ${runBootstrapProposalAdjacentSubmit.toString()};
    const bindBootstrapProposalAdjacentSubmit = ${bindBootstrapProposalAdjacentSubmit.toString()};
  `;
}

function bootstrapProposalAdjacentContractForFamily(family = "", contractsByFamily = bootstrapProposalAdjacentSubmitContractsByFamily) {
  const key = typeof family === "string" ? family.trim() : "";
  return key ? (contractsByFamily[key] || null) : null;
}

export function buildBootstrapProposalAdjacentSubmitBody({
  contract = null,
  detail = {},
  resolveServerRunner = server => server,
  runtimePluginProposalBodyFn = null,
  mcpServerProposalBodyFn = null,
  mcpToolProposalBodyFn = null
} = {}) {
  if (!contract) return null;
  const builderName = typeof contract.bodyBuilder === "string" ? contract.bodyBuilder.trim() : "";
  const action = typeof contract.action === "string" ? contract.action.trim() : "";
  if (builderName === "runtimePluginProposalBody" && typeof runtimePluginProposalBodyFn === "function") {
    return runtimePluginProposalBodyFn(detail, action);
  }
  if (builderName === "mcpServerProposalBody" && typeof mcpServerProposalBodyFn === "function") {
    return mcpServerProposalBodyFn(detail);
  }
  if (builderName === "mcpToolProposalBody" && typeof mcpToolProposalBodyFn === "function") {
    const nextDetail = contract.resolveServerRunner === true
      ? { ...detail, serverRunner: resolveServerRunner(detail.server) }
      : detail;
    return mcpToolProposalBodyFn(nextDetail, action);
  }
  return null;
}

export function buildBootstrapProposalAdjacentSubmitRequest({
  detail = {},
  resolveServerRunner = server => server,
  runtimePluginProposalBodyFn = null,
  mcpServerProposalBodyFn = null,
  mcpToolProposalBodyFn = null,
  contractsByFamily = bootstrapProposalAdjacentSubmitContractsByFamily
} = {}) {
  const contract = bootstrapProposalAdjacentContractForFamily(detail.family, contractsByFamily);
  if (!contract) return null;
  const body = buildBootstrapProposalAdjacentSubmitBody({
    contract,
    detail,
    resolveServerRunner,
    runtimePluginProposalBodyFn,
    mcpServerProposalBodyFn,
    mcpToolProposalBodyFn
  });
  if (!body) return null;
  return {
    url: contract.url || "",
    ...(contract.method ? { method: contract.method } : {}),
    body,
    successText: contract.successText || "Saved."
  };
}

export async function runBootstrapProposalAdjacentSubmit({
  detail = {},
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  resolveServerRunner = server => server,
  runtimePluginProposalBodyFn = null,
  mcpServerProposalBodyFn = null,
  mcpToolProposalBodyFn = null,
  contractsByFamily = bootstrapProposalAdjacentSubmitContractsByFamily
} = {}) {
  try {
    const request = buildBootstrapProposalAdjacentSubmitRequest({
      detail,
      resolveServerRunner,
      runtimePluginProposalBodyFn,
      mcpServerProposalBodyFn,
      mcpToolProposalBodyFn,
      contractsByFamily
    });
    if (!request) return false;
    await postJson(request.url, request.body, request.method || "POST");
    setStatus(detail.statusId, request.successText);
    resetForm(detail.formId);
    await refresh();
    return true;
  } catch (error) {
    setStatus(detail.statusId, error.message);
    return false;
  }
}

export function bindBootstrapProposalAdjacentSubmit({
  target = null,
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  resolveServerRunner = server => server,
  runtimePluginProposalBodyFn = null,
  mcpServerProposalBodyFn = null,
  mcpToolProposalBodyFn = null,
  contractsByFamily = bootstrapProposalAdjacentSubmitContractsByFamily
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  const resolvedDocument = resolvedTarget?.document || globalThis?.document || null;
  if (!resolvedDocument?.getElementById) return null;
  const handler = event => {
    const detail = event?.detail || {};
    if (detail.source !== "bootstrap-proposal-adjacent-controls") return false;
    return runBootstrapProposalAdjacentSubmit({
      detail,
      postJson,
      refresh,
      setStatus,
      resetForm,
      resolveServerRunner,
      runtimePluginProposalBodyFn,
      mcpServerProposalBodyFn,
      mcpToolProposalBodyFn,
      contractsByFamily
    });
  };
  for (const detail of [
    { source: "bootstrap-proposal-adjacent-controls", family: "runtime-plugin-install", formId: "runtime-plugin-install-proposal-form", statusId: "runtime-plugin-install-proposal-status" },
    { source: "bootstrap-proposal-adjacent-controls", family: "runtime-plugin-remove", formId: "runtime-plugin-remove-proposal-form", statusId: "runtime-plugin-remove-proposal-status" },
    { source: "bootstrap-proposal-adjacent-controls", family: "mcp-server", formId: "mcp-server-proposal-form", statusId: "mcp-server-proposal-status" },
    { source: "bootstrap-proposal-adjacent-controls", family: "mcp-tool-install", formId: "mcp-tool-install-proposal-form", statusId: "mcp-tool-install-proposal-status" },
    { source: "bootstrap-proposal-adjacent-controls", family: "mcp-tool-remove", formId: "mcp-tool-remove-proposal-form", statusId: "mcp-tool-remove-proposal-status" }
  ]) {
    const form = resolvedDocument?.getElementById?.(detail.formId);
    if (!form || form.__bootstrapProposalAdjacentSubmitBound) continue;
    form.__bootstrapProposalAdjacentSubmitBound = true;
    form.addEventListener("submit", event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      void handler({ detail: { ...detail, ...data } });
    });
  }
  return handler;
}
