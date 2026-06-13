export function renderBootstrapRouteAuthoringSyncFactory() {
  return String.raw`
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

export function buildBootstrapRouteAuthoringView({
  model = {},
  readFieldValue = () => ""
} = {}) {
  const metadata = model?.supportedHandlerMetadata || {};
  const handler = String(readFieldValue("route-form", "handler") || "").trim();
  const handlerMeta = (handler && metadata[handler]) || null;
  const routeKind = handlerMeta?.routeKind || (handler === "backendProgram.run" ? "backendProgram" : (handler.startsWith("page.") ? "page" : "json"));
  const backendRoute = routeKind === "backendProgram";
  const pageRoute = routeKind === "page";
  const supportedMethods = Array.isArray(handlerMeta?.methods) ? handlerMeta.methods : [];
  const method = String(readFieldValue("route-form", "method") || "").trim().toUpperCase();
  const backendProgramSoul = String(readFieldValue("route-form", "backendProgramSoul") || "").trim();
  const rootWidget = String(readFieldValue("route-form", "rootWidget") || "").trim();
  const responseKind = handlerMeta?.responseKind || (routeKind === "page" ? "page" : (routeKind === "stream" ? "stream" : "json"));
  const fieldSummary = routeKind === "backendProgram"
    ? "Enabled fields: backend program soul. Disabled fields: page, root widget, frontend program, live projection."
    : routeKind === "page"
      ? "Enabled fields: page, root widget, frontend program, live projection."
      : routeKind === "stream"
        ? "Uses stream transport only. Page and backend-program fields are disabled."
        : "Backend JSON route. Page and backend-program fields are disabled.";
  const issues = [];
  if (supportedMethods.length && method && !supportedMethods.includes(method)) issues.push("selected method " + method + " is unsupported");
  if (routeKind === "backendProgram" && !backendProgramSoul) issues.push("choose a backend program soul");
  if ((handler === "page.home" || handler === "page.world") && !rootWidget) issues.push("choose a root widget for this page handler");
  const methodSummary = supportedMethods.length ? supportedMethods.join(", ") : "any method";
  return {
    enabledFields: {
      backendProgramSoul: backendRoute,
      page: pageRoute,
      rootWidget: pageRoute,
      rootWidgetRef: pageRoute,
      frontendProgram: pageRoute,
      liveProjection: pageRoute
    },
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
  if (!resolvedTarget?.addEventListener) return null;
  const handler = createBootstrapRouteAuthoringSyncHandler({ buildDeps });
  resolvedTarget.addEventListener("witness:bootstrap-route-authoring-sync", handler);
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
