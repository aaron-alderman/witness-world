import { defineRoute, moduleProjectors } from "./modules.js";
import {
  legacyFrontendBridgeConfigFromRoute,
  legacyFrontendBridgeSurfaceForRoute,
  legacySurfaceIdForRoute,
  LEGACY_FRONTEND_ROUTE_PARAM_NAMES,
  isLegacyFrontendBridgeSurface
} from "./legacy-frontend-bridge.js";

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function cloneParams(params = null) {
  return params && typeof params === "object" && !Array.isArray(params)
    ? structuredClone(params)
    : {};
}

function surfaceRowsFromWitnesses(witnesses = []) {
  const rows = new Map();
  for (const witness of witnesses ?? []) {
    if (witness?.process !== "desire.defineSurface" || !trimString(witness?.body?.id)) continue;
    rows.set(witness.body.id, witness.body);
  }
  return [...rows.values()];
}

function legacyFrontendRoutesFromProject(project) {
  return (project(moduleProjectors.routes) ?? [])
    .filter(route => trimString(route?.handler) === "page.home" && legacyFrontendBridgeConfigFromRoute(route));
}

function routeMigrationRow(route) {
  const bridge = legacyFrontendBridgeConfigFromRoute(route);
  if (!bridge) return null;
  return {
    id: `legacyFrontendMigration:route:${route.id}`,
    kind: "route",
    action: "route.rewrite",
    routeId: route.id,
    surfaceId: legacySurfaceIdForRoute(route.id),
    currentHandler: route.handler,
    nextHandler: "page.surface",
    path: route.path,
    method: route.method,
    preserves: {
      routeState: route.params?.routeState ?? null,
      page: bridge.page,
      rootWidget: bridge.rootWidget,
      frontendProgram: bridge.frontendProgram,
      excludeWidgetRoles: [...bridge.excludeWidgetRoles],
      liveProjection: bridge.liveProjection
    }
  };
}

function surfaceMigrationRow(route) {
  const bridge = legacyFrontendBridgeConfigFromRoute(route);
  if (!bridge) return null;
  return {
    id: `legacyFrontendMigration:surface:${route.id}`,
    kind: "surface",
    action: "surface.define",
    routeId: route.id,
    surfaceId: legacySurfaceIdForRoute(route.id),
    context: trimString(route.context) || null,
    capability: "compat.legacy-widget-program",
    legacyRootWidget: bridge.rootWidget,
    legacyFrontendProgram: bridge.frontendProgram,
    legacyPage: bridge.page,
    legacyExcludeWidgetRoles: [...bridge.excludeWidgetRoles],
    legacyLiveProjection: bridge.liveProjection
  };
}

function sortPendingRows(rows = []) {
  return [...rows].sort((left, right) =>
    String(left.routeId || "").localeCompare(String(right.routeId || ""))
    || String(left.kind || "").localeCompare(String(right.kind || ""))
    || String(left.id || "").localeCompare(String(right.id || ""))
  );
}

function stripLegacyFrontendRouteParams(params = {}) {
  const next = cloneParams(params);
  for (const key of LEGACY_FRONTEND_ROUTE_PARAM_NAMES) {
    delete next[key];
  }
  return next;
}

export function previewLegacyFrontendMigrationFromProject(project) {
  if (typeof project !== "function") throw new Error("project must be a function");
  const routes = legacyFrontendRoutesFromProject(project);
  const surfaces = project(surfaceRowsFromWitnesses) ?? [];
  const surfacesById = new Map(surfaces.map(surface => [surface.id, surface]));
  const pending = [];

  for (const route of routes) {
    const row = routeMigrationRow(route);
    if (row) pending.push(row);
    const surfaceId = legacySurfaceIdForRoute(route.id);
    if (!isLegacyFrontendBridgeSurface(surfacesById.get(surfaceId) ?? null)) {
      const surfaceRow = surfaceMigrationRow(route);
      if (surfaceRow) pending.push(surfaceRow);
    }
  }

  const sorted = sortPendingRows(pending);
  return {
    compatibilityMode: sorted.length ? "bridge-active" : "first-class-only",
    pending: sorted,
    summary: {
      pendingRoutes: sorted.filter(row => row.kind === "route").length,
      pendingSurfaces: sorted.filter(row => row.kind === "surface").length
    }
  };
}

export function previewLegacyFrontendMigration(world) {
  return previewLegacyFrontendMigrationFromProject(projector => world.project(projector));
}

export function frontendLegacyMigrationAuthorityTargets(world) {
  const preview = previewLegacyFrontendMigration(world);
  const seen = new Set();
  const targets = [];
  for (const row of preview.pending ?? []) {
    const routeId = trimString(row?.routeId);
    if (!routeId || seen.has(routeId)) continue;
    seen.add(routeId);
    targets.push({ targetKind: "route", target: routeId });
  }
  return { preview, targets };
}

export function applyLegacyFrontendMigration(world, {
  actor
} = {}) {
  const previewBefore = previewLegacyFrontendMigration(world);
  if (!previewBefore.pending.length) {
    const witness = world.emit({
      process: "frontend.migrateLegacy",
      actor,
      claims: [],
      body: { ok: true, actions: [], previewBefore, previewAfter: previewBefore }
    });
    return { ok: true, actions: [], previewBefore, previewAfter: previewBefore, witness };
  }

  const actions = [];
  const routes = legacyFrontendRoutesFromProject(projector => world.project(projector));
  const surfaces = world.project(surfaceRowsFromWitnesses) ?? [];
  const surfacesById = new Map(surfaces.map(surface => [surface.id, surface]));

  for (const route of routes) {
    const surfaceId = legacySurfaceIdForRoute(route.id);
    const existingSurface = surfacesById.get(surfaceId) ?? null;
    if (!isLegacyFrontendBridgeSurface(existingSurface)) {
      const surface = legacyFrontendBridgeSurfaceForRoute(route);
      world.emit({
        process: "desire.defineSurface",
        actor,
        claims: [],
        body: surface
      });
      surfacesById.set(surface.id, surface);
      actions.push({
        action: "surface.define",
        routeId: route.id,
        surfaceId: surface.id
      });
    }

    const nextParams = stripLegacyFrontendRouteParams(route.params);
    nextParams.rootSurface = surfaceId;
    defineRoute(world, {
      actor,
      id: route.id,
      path: route.path,
      serves: route.serves,
      method: route.method,
      handler: "page.surface",
      params: Object.keys(nextParams).length ? nextParams : null,
      context: route.context ?? null,
      owner: actor
    });
    actions.push({
      action: "route.rewrite",
      routeId: route.id,
      handler: "page.surface",
      surfaceId
    });
  }

  const previewAfter = previewLegacyFrontendMigration(world);
  const witness = world.emit({
    process: "frontend.migrateLegacy",
    actor,
    claims: [],
    body: {
      ok: true,
      actions,
      previewBefore,
      previewAfter
    }
  });
  return { ok: true, actions, previewBefore, previewAfter, witness };
}
