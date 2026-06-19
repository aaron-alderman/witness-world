import {
  bootstrapHostRefreshAllowedSources
} from "./bootstrap-host-refresh-contracts.js";

export function renderBootstrapHostRefreshFactory() {
  return String.raw`
    const bootstrapHostRefreshAllowedSources = ${JSON.stringify(bootstrapHostRefreshAllowedSources)};
    const bindBootstrapHostRefresh = ${bindBootstrapHostRefresh.toString()};
  `;
}

export function bindBootstrapHostRefresh({
  target,
  refresh = async () => {},
  setBootstrapStatus = () => {},
  allowedSources = bootstrapHostRefreshAllowedSources
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  const resolvedDocument = resolvedTarget?.document || globalThis?.document || null;
  const run = event => {
    if (!allowedSources.includes(event?.detail?.source)) return;
    Promise.resolve(refresh()).catch(error => setBootstrapStatus(error.message));
  };
  const button = resolvedDocument?.querySelector?.('[data-action="refreshBootstrapHost"]');
  if (button && !button.__bootstrapHostRefreshBound) {
    button.__bootstrapHostRefreshBound = true;
    button.addEventListener("click", event => {
      event.preventDefault();
      run({ detail: { source: "bootstrap-top-cards", reason: "refresh-bootstrap-button" } });
    });
  }
  return resolvedTarget;
}
