import { buildServerRunnerOptions } from "./bootstrap-runtime-integration-options-view.js";
import {
  runtimePluginReviewRows,
  runtimePluginReviewOptionLabel
} from "./bootstrap-runtime-plugin-review-view.js";

export function renderBootstrapShellRenderViewFactory() {
  return String.raw`
    const buildBootstrapShellStatusView = ${buildBootstrapShellStatusView.toString()};
    const applyBootstrapShellStatusView = ${applyBootstrapShellStatusView.toString()};
    const applyBootstrapShellSelectFill = ${applyBootstrapShellSelectFill.toString()};
  `;
}

export function buildBootstrapShellStatusView({
  model = null,
  bootstrapState = null,
  session = null,
  desktopShell = null
} = {}) {
  const authored = bootstrapState || {};
  const operator = authored.operator || {};
  const appReady = model?.appReady === true;
  return {
    bootstrapSummary: appReady
      ? "The app route exists. This seam remains available for recovery and harness edits."
      : "No reachable app home route exists yet. Bootstrap owns the landing experience until the app boundary is wired.",
    openAppHref: "/",
    desktopSummary: desktopShell
      ? "Active shell " + (desktopShell.shellId || "desktop") + " / " + (desktopShell.runtimeStatus || "idle") + " on " + (desktopShell.worldHome || "(no world home)") + " with profile " + (desktopShell.runtimeProfile || "full") + ". Powers: " + ((desktopShell.availablePowers || []).join(", ") || "(none)") + "."
      : "Desktop shell unavailable in this session.",
    sessionSummary: session?.authenticated
      ? "Signed in as " + session.label + " (" + session.actor + ")" + (session.homeContext ? " / " + session.homeContext : "") + (session.perspective ? " in " + session.perspective : "")
      : ((authored.identities || []).length ? "Sign in to continue editing the bootstrap seam." : "No identities yet. Create the first identity to continue."),
    operatorSummary: operator.contract
      ? "Persistence " + (operator.contract.persistence?.mode || "unknown") + " on " + (operator.contract.layout || "unknown") + (operator.contract.worldHome ? " at " + operator.contract.worldHome : "") + "."
      : "Operator contract unavailable on this runtime.",
    operatorWarning: operator.mutations?.enabled === false
      ? "Operator mutations disabled: " + (operator.mutations.reason || "unknown reason") + "."
      : "Restore and import replace current world truth. Use preserve-current when you need a safety backup first."
  };
}

export function applyBootstrapShellStatusView({
  view = {},
  byId = () => null
} = {}) {
  const bootstrapSummary = byId("bootstrap-summary");
  if (bootstrapSummary) bootstrapSummary.textContent = view.bootstrapSummary || "";
  const openAppLink = byId("open-app-link");
  if (openAppLink) openAppLink.href = view.openAppHref || "/";
  const desktopSummary = byId("desktop-summary");
  if (desktopSummary) desktopSummary.textContent = view.desktopSummary || "";
  const sessionSummary = byId("session-summary");
  if (sessionSummary) sessionSummary.textContent = view.sessionSummary || "";
  const operatorSummary = byId("operator-summary");
  if (operatorSummary) operatorSummary.textContent = view.operatorSummary || "";
  const operatorWarning = byId("operator-warning");
  if (operatorWarning) operatorWarning.textContent = view.operatorWarning || "";
}

export function applyBootstrapShellSelectFill({
  model = null,
  bootstrapState = null,
  runtimePluginReview = null,
  byId = () => null,
  fillSelect = () => {},
  setSelectedValue = () => {},
  buildServerRunnerOptionsFn = buildServerRunnerOptions,
  runtimePluginReviewRowsFn = runtimePluginReviewRows,
  runtimePluginReviewOptionLabelFn = runtimePluginReviewOptionLabel
} = {}) {
  const authored = bootstrapState || {};
  const operator = authored.operator || {};

  fillSelect("widget-kind", model?.widgetKinds || [], x => x, x => x, { includeBlank: false });
  fillSelect("identity-home-context", authored.contexts || [], x => x.id, x => x.id);
  fillSelect("context-parent", authored.contexts || [], x => x.id, x => x.id);
  fillSelect("perspective-context", authored.contexts || [], x => x.id, x => x.id);
  fillSelect("widget-context", authored.contexts || [], x => x.id, x => x.id);
  fillSelect("widget-parent", authored.widgets || [], x => x.id, x => x.id);
  fillSelect("program-root-widget", authored.widgets || [], x => x.id, x => x.id);
  fillSelect("program-context", authored.contexts || [], x => x.id, x => x.id);
  fillSelect("route-root-widget", authored.widgets || [], x => x.id, x => x.id);
  fillSelect("route-frontend-program", authored.frontendPrograms || [], x => x.id, x => x.id);
  fillSelect("route-backend-program-soul", authored.backendPrograms || [], x => x.soul, x => x.soul);
  fillSelect("route-context", authored.contexts || [], x => x.id, x => x.id);
  fillSelect("step-program", authored.frontendPrograms || [], x => x.id, x => x.id, { includeBlank: false });
  fillSelect("step-op", model?.supportedFrontendOps || [], x => x, x => x, { includeBlank: false });
  fillSelect("route-method", model?.supportedMethods || [], x => x, x => x, { includeBlank: false });
  fillSelect("route-handler", model?.supportedHandlers || [], x => x, x => x, { includeBlank: false });
  fillSelect("serve-route", authored.routes || [], x => x.id, x => x.id);
  fillSelect("serve-server-runner", authored.serverRunners || [], x => x.id, x => x.id);
  fillSelect("serve-context", authored.contexts || [], x => x.id, x => x.id);
  fillSelect("runner-handler-set", model?.supportedHandlerSets || [], x => x, x => x);
  fillSelect("runner-context", authored.contexts || [], x => x.id, x => x.id);
  fillSelect("runner-backend-host", model?.backendHosts || [], x => x.id, x => x.id);
  fillSelect("runner-frontend-host", model?.frontendHosts || [], x => x.id, x => x.id);
  fillSelect("runtime-plugin-review-runner", buildServerRunnerOptionsFn(authored.serverRunners || []), row => row.value, row => row.label, { includeBlank: false });
  fillSelect("operator-restore-artifact", operator.inventory?.backups || [], x => x.id, x => x.id + " [" + (x.status || "unknown") + "]", { includeBlank: false });
  fillSelect("operator-import-artifact", operator.inventory?.imports || [], x => x.id, x => x.id + " [" + (x.status || "unknown") + "]", { includeBlank: false });
  fillSelect("runtime-plugin-review-plugin", runtimePluginReviewRowsFn(runtimePluginReview), row => row.plugin, runtimePluginReviewOptionLabelFn, { includeBlank: false });

  setSelectedValue("runtime-plugin-review-runner", runtimePluginReview?.serverRunner);
  setSelectedValue("runtime-plugin-review-plugin", runtimePluginReview?.selectedPluginId);
  if (runtimePluginReview) runtimePluginReview.selectedPluginId = byId("runtime-plugin-review-plugin")?.value || "";
}
