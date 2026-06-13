export function renderBootstrapHostRefreshFactory() {
  return String.raw`
    const bindBootstrapHostRefresh = ${bindBootstrapHostRefresh.toString()};
  `;
}

export function bindBootstrapHostRefresh({
  target,
  refresh = async () => {},
  setBootstrapStatus = () => {},
  allowedSources = [
    "bootstrap-top-cards",
    "bootstrap-backend-authoring-controls",
    "bootstrap-backend-version-controls",
    "bootstrap-proposal-create-controls",
    "bootstrap-proposal-review-controls",
    "bootstrap-scoped-controls",
    "bootstrap-remove-controls",
    "bootstrap-capability-controls",
    "bootstrap-starter-controls"
  ]
} = {}) {
  target.addEventListener("witness:host-refresh", event => {
    if (!allowedSources.includes(event?.detail?.source)) return;
    Promise.resolve(refresh()).catch(error => setBootstrapStatus(error.message));
  });
  return target;
}
