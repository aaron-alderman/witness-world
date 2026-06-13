export function renderBootstrapProposalAdjacentSubmitFactory() {
  return String.raw`
    const runBootstrapProposalAdjacentSubmit = ${runBootstrapProposalAdjacentSubmit.toString()};
    const bindBootstrapProposalAdjacentSubmit = ${bindBootstrapProposalAdjacentSubmit.toString()};
  `;
}

export async function runBootstrapProposalAdjacentSubmit({
  detail = {},
  proposalCreate = async () => {},
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  resolveServerRunner = server => server,
  runtimePluginProposalBodyFn = null,
  mcpServerProposalBodyFn = null,
  mcpToolProposalBodyFn = null
} = {}) {
  try {
    if (detail.family === "runtime-plugin-install") {
      await proposalCreate(runtimePluginProposalBodyFn(detail, "install"));
    } else if (detail.family === "runtime-plugin-remove") {
      await proposalCreate(runtimePluginProposalBodyFn(detail, "remove"));
    } else if (detail.family === "mcp-server") {
      await proposalCreate(mcpServerProposalBodyFn(detail));
    } else if (detail.family === "mcp-tool-install") {
      await proposalCreate(mcpToolProposalBodyFn({
        ...detail,
        serverRunner: resolveServerRunner(detail.server)
      }, "install"));
    } else if (detail.family === "mcp-tool-remove") {
      await proposalCreate(mcpToolProposalBodyFn({
        ...detail,
        serverRunner: resolveServerRunner(detail.server)
      }, "remove"));
    } else {
      return false;
    }
    setStatus(detail.statusId, "Saved.");
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
  proposalCreate = async () => {},
  refresh = async () => {},
  setStatus = () => {},
  resetForm = () => {},
  resolveServerRunner = server => server,
  runtimePluginProposalBodyFn = null,
  mcpServerProposalBodyFn = null,
  mcpToolProposalBodyFn = null
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  if (!resolvedTarget?.addEventListener) return null;
  const handler = event => {
    const detail = event?.detail || {};
    if (detail.source !== "bootstrap-proposal-adjacent-controls") return false;
    return runBootstrapProposalAdjacentSubmit({
      detail,
      proposalCreate,
      refresh,
      setStatus,
      resetForm,
      resolveServerRunner,
      runtimePluginProposalBodyFn,
      mcpServerProposalBodyFn,
      mcpToolProposalBodyFn
    });
  };
  resolvedTarget.addEventListener("witness:bootstrap-proposal-adjacent-submit", handler);
  return handler;
}
