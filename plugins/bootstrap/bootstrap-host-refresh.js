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
  target.addEventListener("witness:host-refresh", event => {
    if (!allowedSources.includes(event?.detail?.source)) return;
    Promise.resolve(refresh()).catch(error => setBootstrapStatus(error.message));
  });
  return target;
}
