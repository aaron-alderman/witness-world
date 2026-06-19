import { buildServerRunnerOptions } from "./bootstrap-runtime-integration-options-view.js";
import {
  runtimePluginReviewRows,
  runtimePluginReviewOptionLabel
} from "./bootstrap-runtime-plugin-review-view.js";

export function renderBootstrapShellRenderViewFactory() {
  return String.raw`
    const bootstrapShellPortableBasename = ${bootstrapShellPortableBasename.toString()};
    const bootstrapOrderedRouteHandlers = ${bootstrapOrderedRouteHandlers.toString()};
    const buildBootstrapShellStatusView = ${buildBootstrapShellStatusView.toString()};
    const applyBootstrapShellStatusView = ${applyBootstrapShellStatusView.toString()};
    const applyBootstrapShellSelectFill = ${applyBootstrapShellSelectFill.toString()};
  `;
}

function bootstrapShellPortableBasename(value = "") {
  const text = String(value || "");
  if (!text) return "";
  const pieces = text.split(/[\\/]+/);
  return pieces[pieces.length - 1] || "";
}

export function buildBootstrapShellStatusView({
  model = null,
  bootstrapState = null,
  session = null,
  desktopShell = null
} = {}) {
  const authored = bootstrapState || {};
  const operator = authored.operator || {};
  const appBoundary = authored.appBoundary || {};
  const appReady = model?.appReady === true;
  const stableStringify = value => JSON.stringify(value, null, 2);
  const boundaryStatus = String(appBoundary.status || "").trim() || "missing";
  const missingKinds = Array.isArray(appBoundary.missingKinds) ? appBoundary.missingKinds : [];
  const blockedReasons = Array.isArray(appBoundary.blockedReasons) ? appBoundary.blockedReasons : [];
  const boundaryPlanSummary = appBoundary.planSummary || {};
  const composition = appBoundary.composition || {};
  const boundaryStateText = (() => {
    if (boundaryStatus === "authoredActive") {
      return "App boundary status: authoredActive. / now resolves through the canonical authored page.surface boundary.";
    }
    if (boundaryStatus === "blocked") {
      return "App boundary status: blocked. " + (blockedReasons.length
        ? "Blocked reasons: " + blockedReasons.join("; ") + "."
        : "Conflicts prevent the canonical authored boundary from being established.");
    }
    const kindsText = missingKinds.length ? missingKinds.join(", ") : "(none)";
    return "App boundary status: " + boundaryStatus + ". Missing kinds: " + kindsText + ".";
  })();
  const appendPlanRows = (rows = [], kind, lines) => {
    for (const row of rows) {
      lines.push(`${kind} ${stableStringify(row)}`);
    }
  };
  const boundaryPlanText = (() => {
    const lines = [];
    appendPlanRows(boundaryPlanSummary.contexts, "context", lines);
    appendPlanRows(boundaryPlanSummary.serverRunners, "serverRunner", lines);
    appendPlanRows(boundaryPlanSummary.runtimePluginInstalls, "runtimePluginInstall", lines);
    appendPlanRows(boundaryPlanSummary.types, "type", lines);
    appendPlanRows(boundaryPlanSummary.processes, "process", lines);
    appendPlanRows(boundaryPlanSummary.messages, "message", lines);
    appendPlanRows(boundaryPlanSummary.projections, "projection", lines);
    appendPlanRows(boundaryPlanSummary.surfaces, "surface", lines);
    appendPlanRows(boundaryPlanSummary.routes, "route", lines);
    appendPlanRows(boundaryPlanSummary.serveMounts, "serveMount", lines);
    return lines.length
      ? "Plan summary:\n" + lines.join("\n")
      : "Plan summary:\nNo authored objects remain to create.";
  })();
  const boundaryCompositionText = (() => {
    const root = composition.root || {};
    const bootstrap = composition.bootstrap || {};
    const rootParts = [
      `/: ${root.note || "no active composition story"}`,
      `route=${root.routeId || "(none)"}`,
      `handler=${root.handler || "(none)"}`,
      `runner=${root.serverRunner || "(none)"}`,
      `source=${root.source || "(unknown)"}`,
      `usesAuthoredServerRunner=${root.usesAuthoredServerRunner === true ? "true" : "false"}`,
      `usesAuthoredRuntimePluginInstalls=${root.usesAuthoredRuntimePluginInstalls === true ? "true" : "false"}`
    ];
    const bootstrapParts = [
      `/_bootstrap: ${bootstrap.note || "recovery surface"}`,
      `handler=${bootstrap.handler || "(none)"}`,
      `source=${bootstrap.source || "(unknown)"}`
    ];
    return "Composition:\n" + rootParts.join(" | ") + "\n" + bootstrapParts.join(" | ");
  })();
  const bootstrapSummary = boundaryStatus === "authoredActive"
    ? "The canonical authored app boundary is active. /_bootstrap remains available as the recovery and operator seam."
    : (boundaryStatus === "blocked"
      ? "Bootstrap cannot establish the canonical authored app boundary until the reported conflicts are resolved."
      : (boundaryStatus === "partial"
        ? "Some canonical authored boundary pieces exist already, but / is not yet owned by the live authored page.surface boundary."
        : "Bootstrap still owns the landing experience until you establish the first real authored app boundary."));
  return {
    bootstrapSummary: appReady && boundaryStatus !== "authoredActive"
      ? "A reachable app route exists, but the canonical authored app boundary is not yet active."
      : bootstrapSummary,
    openAppHref: "/",
    openAppText: boundaryStatus === "authoredActive" ? "Open Authored App" : "Open App",
    bootstrapBoundaryStatus: boundaryStateText,
    bootstrapBoundaryPlan: boundaryPlanText,
    bootstrapBoundaryComposition: boundaryCompositionText,
    bootstrapBoundaryActionText: boundaryStatus === "authoredActive"
      ? "App Boundary Active"
      : (boundaryStatus === "blocked"
        ? "Boundary Blocked"
        : (boundaryStatus === "partial" ? "Complete App Boundary" : "Establish App Boundary")),
    bootstrapBoundaryActionDisabled: boundaryStatus === "authoredActive" || boundaryStatus === "blocked",
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
  const boundaryStatus = byId("bootstrap-app-boundary-status");
  if (boundaryStatus) boundaryStatus.textContent = view.bootstrapBoundaryStatus || "";
  const boundaryPlan = byId("bootstrap-app-boundary-plan");
  if (boundaryPlan) boundaryPlan.textContent = view.bootstrapBoundaryPlan || "";
  const boundaryComposition = byId("bootstrap-app-boundary-composition");
  if (boundaryComposition) boundaryComposition.textContent = view.bootstrapBoundaryComposition || "";
  const openAppLink = byId("open-app-link");
  if (openAppLink) openAppLink.href = view.openAppHref || "/";
  const openAppButton = byId("open-app-button");
  if (openAppButton) openAppButton.textContent = view.openAppText || "Open App";
  const establishBoundaryButton = byId("establish-app-boundary");
  if (establishBoundaryButton) {
    establishBoundaryButton.textContent = view.bootstrapBoundaryActionText || "Establish App Boundary";
    establishBoundaryButton.disabled = view.bootstrapBoundaryActionDisabled === true;
  }
  const desktopSummary = byId("desktop-summary");
  if (desktopSummary) desktopSummary.textContent = view.desktopSummary || "";
  const sessionSummary = byId("session-summary");
  if (sessionSummary) sessionSummary.textContent = view.sessionSummary || "";
  const operatorSummary = byId("operator-summary");
  if (operatorSummary) operatorSummary.textContent = view.operatorSummary || "";
  const operatorWarning = byId("operator-warning");
  if (operatorWarning) operatorWarning.textContent = view.operatorWarning || "";
}

function bootstrapOrderedRouteHandlers(handlers = []) {
  return [...(handlers || [])].sort((left, right) => {
    const a = String(left || "");
    const b = String(right || "");
    const rank = value => value === "page.surface" ? 0 : 1;
    return rank(a) - rank(b) || a.localeCompare(b);
  });
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
  fillSelect("route-root-widget", authored.widgets || [], x => x.id, x => x.id);
  fillSelect("route-root-surface", authored.surfaces || [], x => x.id, x => x.id);
  fillSelect("route-state-process", authored.processes || [], x => x.id, x => x.id);
  fillSelect("route-state-state", (authored.types || []).filter(row => row.role === "state"), x => x.id, x => x.id);
  fillSelect("route-backend-program-soul", authored.backendPrograms || [], x => x.soul, x => x.soul);
  fillSelect("route-context", authored.contexts || [], x => x.id, x => x.id);
  fillSelect("route-method", model?.supportedMethods || [], x => x, x => x, { includeBlank: false });
  fillSelect("route-handler", bootstrapOrderedRouteHandlers(model?.supportedHandlers || []), x => x, x => x, { includeBlank: false });
  fillSelect("serve-route", authored.routes || [], x => x.id, x => x.id);
  fillSelect("serve-server-runner", authored.serverRunners || [], x => x.id, x => x.id);
  fillSelect("serve-context", authored.contexts || [], x => x.id, x => x.id);
  fillSelect("runner-handler-set", model?.supportedHandlerSets || [], x => x, x => x);
  fillSelect("runner-context", authored.contexts || [], x => x.id, x => x.id);
  fillSelect("runner-runtime-profile", model?.runtimeProfiles || [], x => x.id || x, x => x.label || x);
  fillSelect("runner-backend-host", model?.backendHosts || [], x => x.id, x => x.id);
  fillSelect("runner-frontend-host", model?.frontendHosts || [], x => x.id, x => x.id);
  fillSelect("runtime-plugin-review-runner", buildServerRunnerOptionsFn(authored.serverRunners || []), row => row.value, row => row.label, { includeBlank: false });
  fillSelect("operator-restore-artifact", operator.inventory?.backups || [], x => x.id, x => `${x.id} [${x.status || "unknown"}]${x.lineage?.worldHome ? ' (from ' + bootstrapShellPortableBasename(x.lineage.worldHome) + ')' : ''}${x.compatibility?.platformVersion ? ' [v:' + x.compatibility.platformVersion + ']' : ''}`, { includeBlank: false });
  fillSelect("operator-import-artifact", operator.inventory?.imports || [], x => x.id, x => `${x.id} [${x.status || "unknown"}]${x.lineage?.worldHome ? ' (from ' + bootstrapShellPortableBasename(x.lineage.worldHome) + ')' : ''}${x.compatibility?.platformVersion ? ' [v:' + x.compatibility.platformVersion + ']' : ''}`, { includeBlank: false });
  fillSelect("runtime-plugin-review-plugin", runtimePluginReviewRowsFn(runtimePluginReview), row => row.plugin, runtimePluginReviewOptionLabelFn, { includeBlank: false });

  setSelectedValue("runtime-plugin-review-runner", runtimePluginReview?.serverRunner);
  setSelectedValue("runtime-plugin-review-plugin", runtimePluginReview?.selectedPluginId);
  setSelectedValue("runner-runtime-profile", model?.runtimeProfile);
  if (runtimePluginReview) runtimePluginReview.selectedPluginId = byId("runtime-plugin-review-plugin")?.value || "";
}
