export function renderBootstrapRuntimeIntegrationDirectSubmitFactory() {
  return String.raw`
    const buildBootstrapRuntimeIntegrationDirectSubmitRequest = ${buildBootstrapRuntimeIntegrationDirectSubmitRequest.toString()};
    const runBootstrapRuntimeIntegrationDirectSubmit = ${runBootstrapRuntimeIntegrationDirectSubmit.toString()};
    const bindBootstrapRuntimeIntegrationDirectSubmit = ${bindBootstrapRuntimeIntegrationDirectSubmit.toString()};
  `;
}

export function buildBootstrapRuntimeIntegrationDirectSubmitRequest({
  detail = {}
} = {}) {
  const omitBlankStringFields = (record = {}) => Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== "")
  );
  if (detail.family === "runtime-plugin-install") {
    return {
      url: "/api/runtime-plugin-installs",
      body: {
        serverRunner: detail.serverRunner || "",
        plugin: detail.plugin || ""
      }
    };
  }
  if (detail.family === "mcp-server") {
    return {
      url: "/api/mcp-servers",
      body: omitBlankStringFields({
        id: detail.id || "",
        label: detail.label || "",
        serverRunner: detail.serverRunner || "",
        context: detail.context || "",
        serviceIdentity: detail.serviceIdentity || "",
        transportsJson: detail.transportsJson || ""
      })
    };
  }
  if (detail.family === "mcp-tool-install") {
    return {
      url: "/api/mcp-tool-installs",
      body: {
        server: detail.server || "",
        tool: detail.tool || "",
        actingMode: detail.actingMode || "delegated",
        scopeContextsJson: detail.scopeContextsJson || "[]",
        scopeTargetsJson: detail.scopeTargetsJson || "[]"
      }
    };
  }
  return null;
}

export async function runBootstrapRuntimeIntegrationDirectSubmit({
  detail = {},
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {}
} = {}) {
  const request = buildBootstrapRuntimeIntegrationDirectSubmitRequest({ detail });
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

export function bindBootstrapRuntimeIntegrationDirectSubmit({
  target = null,
  postJson = async () => ({}),
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {}
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  if (!resolvedTarget?.addEventListener) return null;
  const handler = event => runBootstrapRuntimeIntegrationDirectSubmit({
    detail: event?.detail || {},
    postJson,
    refresh,
    setStatus,
    resetForm
  });
  resolvedTarget.addEventListener("witness:bootstrap-runtime-integration-direct-submit", handler);
  return handler;
}
