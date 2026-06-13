export function renderBootstrapStarterControlsViewFactory() {
  return String.raw`
    const buildBootstrapStarterControlsView = ${buildBootstrapStarterControlsView.toString()};
    const applyBootstrapStarterControlsView = ${applyBootstrapStarterControlsView.toString()};
  `;
}

export function buildBootstrapStarterControlsView({
  model = null,
  bootstrapState = null,
  session = null
} = {}) {
  const identities = bootstrapState?.identities || [];
  const editingEnabled = session?.authenticated === true || !identities.length;
  return {
    starterDisabled: !editingEnabled || model?.appReady === true
  };
}

export function applyBootstrapStarterControlsView({
  view = {},
  byId = () => null
} = {}) {
  const button = byId("create-todo-starter");
  if (!button) return;
  button.disabled = view.starterDisabled === true;
}
