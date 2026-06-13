export function renderBootstrapRuntimeIntegrationControlsViewFactory() {
  return String.raw`
    const parseBootstrapJsonArrayInput = ${parseBootstrapJsonArrayInput.toString()};
    const buildRuntimePluginControlView = ${buildRuntimePluginControlView.toString()};
    const buildMcpServerControlView = ${buildMcpServerControlView.toString()};
    const buildMcpToolInstallControlView = ${buildMcpToolInstallControlView.toString()};
    const buildMcpToolRemoveControlView = ${buildMcpToolRemoveControlView.toString()};
  `;
}

export function parseBootstrapJsonArrayInput(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: true, value: [] };
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return { ok: false, reason: "must be a JSON array" };
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, reason: "must be valid JSON" };
  }
}

export function buildRuntimePluginControlView({
  row = null,
  profile = "full",
  requireInstalled = false,
  allowInstalled = false
} = {}) {
  const allowed = row
    ? (requireInstalled ? row.installed : (allowInstalled ? true : row.installable))
    : false;
  let helpText = "Select a runtime plugin.";
  if (row) {
    if (row.installed) {
      helpText = "Already installed on this server runner for profile " + profile + ".";
    } else if (row.installable) {
      const dependsOn = (row.dependsOnPlugins || []).length ? " Depends on: " + row.dependsOnPlugins.join(", ") + "." : "";
      helpText = "Installable on profile " + profile + "." + dependsOn;
    } else if ((row.reasons || []).length) {
      helpText = "Blocked on profile " + profile + ": " + row.reasons.join("; ");
    } else {
      helpText = "Not installable on profile " + profile + ".";
    }
  }
  return {
    helpText,
    submitDisabled: !allowed
  };
}

export function buildMcpServerControlView({
  runnerId = "",
  serviceIdentity = "",
  transportsInput = "",
  parseJsonArrayInputFn = parseBootstrapJsonArrayInput
} = {}) {
  if (!runnerId) {
    return {
      helpText: "Choose a server runner to expose MCP transports on its runtime.",
      submitDisabled: true
    };
  }
  const transports = parseJsonArrayInputFn(transportsInput);
  if (!transports.ok) {
    return {
      helpText: "Transports JSON " + transports.reason + ".",
      submitDisabled: true
    };
  }
  const normalizedTransports = transports.value.map(value => String(value)).filter(Boolean);
  const transportSummary = normalizedTransports.length ? normalizedTransports.join(", ") : "none";
  const parts = [
    "Runner " + runnerId + " will expose transports: " + transportSummary + "."
  ];
  if (normalizedTransports.includes("http")) parts.push("HTTP transport will mount a runtime path for this MCP server.");
  if (normalizedTransports.includes("stdio")) parts.push("STDIO transport stays shell-facing.");
  parts.push(serviceIdentity
    ? "Service-mode tools can run as " + serviceIdentity + "."
    : "Service identity is optional here, but required later for service-mode tool installs.");
  return {
    helpText: parts.join(" "),
    submitDisabled: normalizedTransports.length === 0
  };
}

export function buildMcpToolInstallControlView({
  server = null,
  tool = null,
  actingMode = "delegated"
} = {}) {
  if (!server || !tool) {
    return {
      helpText: "Choose an MCP server and tool.",
      submitDisabled: true
    };
  }
  const toolTitle = tool.title ? tool.name + " [" + tool.title + "]" : tool.name;
  const modeCopy = actingMode === "service"
    ? (server.serviceIdentity
      ? "Service mode will run as " + server.serviceIdentity + "."
      : "Service mode requires a serviceIdentity on the selected MCP server.")
    : "Delegated mode will run as the calling actor.";
  const httpCopy = server.httpPath
    ? " HTTP path: " + server.httpPath + "."
    : " HTTP transport is not enabled on this MCP server.";
  return {
    helpText: "Installing " + toolTitle + " on " + server.id + ". " + modeCopy + " Scope JSON narrows what the installed tool may act on." + httpCopy,
    submitDisabled: actingMode === "service" && !server.serviceIdentity
  };
}

export function buildMcpToolRemoveControlView({
  server = null,
  install = null,
  scopeSummary = "unscoped"
} = {}) {
  if (!server || !install) {
    return {
      helpText: "Choose an installed MCP tool to remove.",
      submitDisabled: true
    };
  }
  return {
    helpText: "Removing " + install.tool + " from " + server.id + " (" + install.actingMode + ", " + scopeSummary + "). Service identity: " + (server.serviceIdentity || "none") + ".",
    submitDisabled: false
  };
}
