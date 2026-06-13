export function renderBootstrapFormAccessViewFactory() {
  return String.raw`
    const buildBootstrapFormAccessView = ${buildBootstrapFormAccessView.toString()};
    const applyBootstrapFormAccessView = ${applyBootstrapFormAccessView.toString()};
  `;
}

export function buildBootstrapFormAccessView({
  bootstrapState = null,
  session = null,
  operator = null
} = {}) {
  const identities = bootstrapState?.identities || [];
  return {
    editingDisabled: !(session?.authenticated === true || !identities.length),
    operatorMutationsDisabled: operator?.mutations?.enabled === false
  };
}

export function applyBootstrapFormAccessView({
  view = {},
  byId = () => null
} = {}) {
  for (const formId of [
    "identity-form",
    "context-form", "perspective-form", "context-binding-form", "context-binding-remove-form",
    "context-export-form", "context-export-remove-form", "context-import-form", "context-import-remove-form",
    "stewardship-form", "stewardship-remove-form", "proposal-form", "proposal-approve-form",
    "proposal-reject-form", "widget-form", "program-form", "step-form", "backend-program-form",
    "backend-program-version-form", "backend-step-form", "backend-program-activate-form",
    "backend-program-rollback-form", "route-form", "serve-form", "runner-form",
    "runtime-plugin-install-form", "runtime-plugin-remove-form", "runtime-plugin-install-proposal-form",
    "runtime-plugin-remove-proposal-form", "mcp-server-form", "mcp-tool-install-form",
    "mcp-tool-remove-form", "mcp-server-proposal-form", "mcp-tool-install-proposal-form",
    "mcp-tool-remove-proposal-form", "capability-form", "capability-install-form",
    "capability-remove-form", "operator-backup-form", "operator-export-form", "operator-restore-form",
    "operator-import-form"
  ]) {
    const form = byId(formId);
    if (!form) continue;
    const operatorLocked = formId.startsWith("operator-") && view.operatorMutationsDisabled === true;
    form.querySelectorAll("input,select,textarea,button").forEach(el => {
      el.disabled = view.editingDisabled === true || operatorLocked;
    });
  }
}
