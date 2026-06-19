import {
  bootstrapRouteAuthoringContracts
} from "./bootstrap-route-authoring-contracts.js";

export function renderBootstrapRouteAuthoringSyncFactory() {
  return String.raw`
    const bootstrapRouteAuthoringContracts = ${JSON.stringify(bootstrapRouteAuthoringContracts)};
    const fallbackRouteKindForHandler = ${fallbackRouteKindForHandler.toString()};
    const routeAuthoringPolicyForKind = ${routeAuthoringPolicyForKind.toString()};
    const routeAuthoringHandlerRuleForHandler = ${routeAuthoringHandlerRuleForHandler.toString()};
    const buildBootstrapRouteAuthoringView = ${buildBootstrapRouteAuthoringView.toString()};
    const applyBootstrapRouteAuthoringView = ${applyBootstrapRouteAuthoringView.toString()};
    const syncBootstrapRouteAuthoringState = ${syncBootstrapRouteAuthoringState.toString()};
    const runBootstrapRouteAuthoringSync = ${runBootstrapRouteAuthoringSync.toString()};
    const createBootstrapRouteAuthoringSyncHandler = ${createBootstrapRouteAuthoringSyncHandler.toString()};
    const bindBootstrapRouteAuthoringSync = ${bindBootstrapRouteAuthoringSync.toString()};
    const buildBootstrapRouteAuthoringSyncDeps = ${buildBootstrapRouteAuthoringSyncDeps.toString()};
    const createBootstrapRouteAuthoringSyncDepsBuilder = ${createBootstrapRouteAuthoringSyncDepsBuilder.toString()};
  `;
}

function fallbackRouteKindForHandler(handler = "") {
  if (handler === "backendProgram.run") return "backendProgram";
  if (handler.startsWith("page.")) return "page";
  return "json";
}

function routeAuthoringPolicyForKind(routeKind = "", contracts = bootstrapRouteAuthoringContracts) {
  const key = typeof routeKind === "string" ? routeKind.trim() : "";
  return (contracts?.policiesByRouteKind || {})[key] || null;
}

function routeAuthoringHandlerRuleForHandler(handler = "", contracts = bootstrapRouteAuthoringContracts) {
  const key = typeof handler === "string" ? handler.trim() : "";
  return (contracts?.handlerRulesByHandler || {})[key] || null;
}

export function buildBootstrapRouteAuthoringView({
  model = {},
  readFieldValue = () => "",
  routeAuthoringContracts = bootstrapRouteAuthoringContracts
} = {}) {
  const metadata = model?.supportedHandlerMetadata || {};
  const handler = String(readFieldValue("route-form", "handler") || "").trim();
  const handlerMeta = (handler && metadata[handler]) || null;
  const routeKind = handlerMeta?.routeKind || fallbackRouteKindForHandler(handler);
  const policy = routeAuthoringPolicyForKind(routeKind, routeAuthoringContracts)
    || routeAuthoringPolicyForKind("json", routeAuthoringContracts)
    || {};
  const handlerRule = routeAuthoringHandlerRuleForHandler(handler, routeAuthoringContracts) || {};
  const backendRoute = routeKind === "backendProgram";
  const supportedMethods = Array.isArray(handlerMeta?.methods) ? handlerMeta.methods : [];
  const method = String(readFieldValue("route-form", "method") || "").trim().toUpperCase();
  const backendProgramSoul = String(readFieldValue("route-form", "backendProgramSoul") || "").trim();
  const rootWidget = String(readFieldValue("route-form", "rootWidget") || "").trim();
  const rootWidgetRef = String(readFieldValue("route-form", "rootWidgetRef") || "").trim();
  const rootSurface = String(readFieldValue("route-form", "rootSurface") || "").trim();
  const rootSurfaceRef = String(readFieldValue("route-form", "rootSurfaceRef") || "").trim();
  const responseKind = handlerMeta?.responseKind || policy.responseKind || "json";
  const fieldSummary = policy.fieldSummary || "Backend JSON route. Page and backend-program fields are disabled.";
  const issues = [];
  if (supportedMethods.length && method && !supportedMethods.includes(method)) issues.push("selected method " + method + " is unsupported");
  if (backendRoute && !backendProgramSoul && policy.missingBackendProgramSoulIssue) issues.push(policy.missingBackendProgramSoulIssue);
  if (handlerRule.requiresRootWidget === true && !rootWidget && !rootWidgetRef && handlerRule.missingRootWidgetIssue) issues.push(handlerRule.missingRootWidgetIssue);
  if (handlerRule.requiresRootSurface === true && !rootSurface && !rootSurfaceRef && handlerRule.missingRootSurfaceIssue) issues.push(handlerRule.missingRootSurfaceIssue);
  const methodSummary = supportedMethods.length ? supportedMethods.join(", ") : "any method";
  const enabledFieldSet = new Set(Array.isArray(policy.enabledFields) ? policy.enabledFields : []);
  for (const field of handlerRule.enabledFields || []) {
    if (typeof field === "string" && field.trim()) enabledFieldSet.add(field.trim());
  }
  for (const field of handlerRule.disabledFields || []) {
    if (typeof field === "string" && field.trim()) enabledFieldSet.delete(field.trim());
  }
  const managedFields = Array.isArray(routeAuthoringContracts?.managedFields) ? routeAuthoringContracts.managedFields : [];
  return {
    enabledFields: Object.fromEntries(managedFields.map(field => [field, enabledFieldSet.has(field)])),
    helpText: handler
      ? "Profile " + (model?.runtimeProfile || "full") + " exposes handler " + handler + " as " + routeKind + " -> " + responseKind + ". Supported methods: " + methodSummary + ". " + fieldSummary + (issues.length ? " Blocking issues: " + issues.join("; ") + "." : "")
      : "Select a handler to see route-kind, method, and required-field guidance.",
    submitDisabled: Boolean(handler) && issues.length > 0
  };
}

export function applyBootstrapRouteAuthoringView({
  view = {},
  byId = () => null,
  formField = () => null,
  setStatus = () => {},
  setSubmitDisabled = () => {}
} = {}) {
  const form = byId("route-form");
  if (!form) return;
  for (const [name, enabled] of Object.entries(view.enabledFields || {})) {
    const field = formField(form, name);
    if (!field) continue;
    field.disabled = !enabled;
    if (!enabled && ("value" in field)) field.value = "";
    if (!enabled && field.type === "checkbox") field.checked = false;
  }
  setStatus("route-help", view.helpText || "");
  setSubmitDisabled("route-form", Boolean(view.submitDisabled));
}

export function syncBootstrapRouteAuthoringState({
  ...deps
} = {}) {
  return buildBootstrapRouteAuthoringView(deps);
}

export function runBootstrapRouteAuthoringSync({
  ...deps
} = {}) {
  const view = syncBootstrapRouteAuthoringState(deps);
  applyBootstrapRouteAuthoringView({
    view,
    ...deps
  });
  return { handled: true, view };
}

export function createBootstrapRouteAuthoringSyncHandler({
  buildDeps = () => ({})
} = {}) {
  return event => {
    const detail = event?.detail || {};
    if (detail.source !== "bootstrap-app-authoring-controls") return { handled: false };
    return runBootstrapRouteAuthoringSync(buildDeps());
  };
}

export function bindBootstrapRouteAuthoringSync({
  target = null,
  buildDeps = () => ({})
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  const resolvedDocument = resolvedTarget?.document || globalThis?.document || null;
  if (!resolvedDocument?.getElementById) return null;
  const handler = createBootstrapRouteAuthoringSyncHandler({ buildDeps });
  const form = resolvedDocument?.getElementById?.("route-form");
  if (form && !form.__bootstrapRouteAuthoringSyncBound) {
    form.__bootstrapRouteAuthoringSyncBound = true;
    const trigger = () => handler({
      detail: { source: "bootstrap-app-authoring-controls", family: "route-authoring" }
    });
    form.addEventListener("change", trigger);
    form.addEventListener("input", trigger);
  }
  return handler;
}

export function buildBootstrapRouteAuthoringSyncDeps({
  liveState = {},
  dom = {}
} = {}) {
  return {
    model: liveState.model?.() || {},
    byId: dom.byId || (() => null),
    formField: dom.formField || (() => null),
    readFieldValue: dom.readFieldValue || (() => ""),
    setStatus: dom.setStatus || (() => {}),
    setSubmitDisabled: dom.setSubmitDisabled || (() => {})
  };
}

export function createBootstrapRouteAuthoringSyncDepsBuilder({
  liveState = {},
  dom = {}
} = {}) {
  return () => buildBootstrapRouteAuthoringSyncDeps({
    liveState,
    dom
  });
}
