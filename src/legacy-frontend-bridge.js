import { moduleProjectors } from "./modules.js";

export const LEGACY_FRONTEND_SURFACE_CAPABILITY_ID = "compat.legacy-widget-program";
export const LEGACY_FRONTEND_SURFACE_KIND = "legacy-widget-program-bridge";
export const LEGACY_FRONTEND_ROUTE_PARAM_NAMES = Object.freeze([
  "rootWidget",
  "frontendProgram",
  "page",
  "excludeWidgetRoles",
  "liveProjection"
]);

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function uniqueStrings(values = []) {
  return [...new Set((values ?? []).map(value => trimString(value)).filter(Boolean))];
}

function normalizedLegacyExcludeWidgetRoles(value) {
  const normalized = Array.isArray(value)
    ? uniqueStrings(value)
    : [];
  return normalized.length ? normalized : ["world-graph-body"];
}

function surfaceRowsFromWitnesses(witnesses = []) {
  const rows = new Map();
  for (const witness of witnesses ?? []) {
    if (witness?.process !== "desire.defineSurface" || !trimString(witness?.body?.id)) continue;
    rows.set(witness.body.id, witness.body);
  }
  return [...rows.values()];
}

export function legacySurfaceIdForRoute(routeId = "") {
  const normalizedRouteId = trimString(routeId);
  if (!normalizedRouteId) throw new Error("route id is required for legacy frontend bridge surface");
  return `legacySurface.${normalizedRouteId}`;
}

export function legacyFrontendBridgeConfigFromRoute(route = {}) {
  const params = route?.params && typeof route.params === "object" ? route.params : {};
  const rootWidget = trimString(params.rootWidget);
  if (!rootWidget) return null;
  return {
    rootWidget,
    frontendProgram: trimString(params.frontendProgram) || null,
    page: trimString(params.page) || "home",
    excludeWidgetRoles: normalizedLegacyExcludeWidgetRoles(params.excludeWidgetRoles),
    liveProjection: params.liveProjection !== false
  };
}

export function legacyFrontendBridgeSurfaceForRoute(route = {}) {
  const routeId = trimString(route?.id);
  const bridge = legacyFrontendBridgeConfigFromRoute(route);
  if (!routeId || !bridge) {
    throw new Error("legacy frontend bridge surface requires a page.home route with rootWidget");
  }
  return {
    id: legacySurfaceIdForRoute(routeId),
    context: trimString(route?.context) || null,
    surfaceKind: LEGACY_FRONTEND_SURFACE_KIND,
    capabilityRefs: [LEGACY_FRONTEND_SURFACE_CAPABILITY_ID],
    props: {
      title: `Legacy Frontend Bridge ${routeId}`,
      legacyBridge: true,
      legacyRouteId: routeId,
      legacyRootWidget: bridge.rootWidget,
      ...(bridge.frontendProgram ? { legacyFrontendProgram: bridge.frontendProgram } : {}),
      legacyPage: bridge.page,
      legacyExcludeWidgetRoles: [...bridge.excludeWidgetRoles],
      legacyLiveProjection: bridge.liveProjection
    }
  };
}

export function isLegacyFrontendBridgeSurface(surface = null) {
  if (!surface || typeof surface !== "object") return false;
  return trimString(surface.surfaceKind) === LEGACY_FRONTEND_SURFACE_KIND;
}

export function legacyFrontendBridgeConfigFromSurface(surface = null) {
  if (!isLegacyFrontendBridgeSurface(surface)) return null;
  const props = surface?.props && typeof surface.props === "object" ? surface.props : {};
  const rootWidget = trimString(props.legacyRootWidget);
  if (!rootWidget) return null;
  return {
    rootWidget,
    frontendProgram: trimString(props.legacyFrontendProgram) || null,
    page: trimString(props.legacyPage) || "home",
    excludeWidgetRoles: normalizedLegacyExcludeWidgetRoles(props.legacyExcludeWidgetRoles),
    liveProjection: props.legacyLiveProjection !== false
  };
}

export function legacyFrontendCompatibilityBridgeObservationsFromProject(project) {
  if (typeof project !== "function") throw new Error("project must be a function");
  const routes = project(moduleProjectors.routes) ?? [];
  const surfaceRows = project(surfaceRowsFromWitnesses) ?? [];
  const surfacesById = new Map(surfaceRows.map(surface => [surface.id, surface]));
  const pageHomeRoutes = routes.filter(route =>
    trimString(route?.handler) === "page.home"
    && legacyFrontendBridgeConfigFromRoute(route)
  );
  const pageSurfaceCompatibilityRoutes = routes.filter(route => {
    if (trimString(route?.handler) !== "page.surface") return false;
    const rootSurfaceId = trimString(route?.params?.rootSurface);
    if (!rootSurfaceId) return false;
    return isLegacyFrontendBridgeSurface(surfacesById.get(rootSurfaceId) ?? null);
  });
  return [
    {
      bridgeId: "compatibilityBridge:legacyFrontend.pageHomeShim",
      count: pageHomeRoutes.length,
      sampleTarget: pageHomeRoutes[0]?.id ?? null,
      sampleSource: pageHomeRoutes[0] ? "route.handler:page.home" : null
    },
    {
      bridgeId: "compatibilityBridge:legacyFrontend.pageSurfaceCompatibility",
      count: pageSurfaceCompatibilityRoutes.length,
      sampleTarget: pageSurfaceCompatibilityRoutes[0]?.id ?? null,
      sampleSource: pageSurfaceCompatibilityRoutes[0] ? "route.handler:page.surface" : null
    }
  ].filter(row => row.count > 0);
}
