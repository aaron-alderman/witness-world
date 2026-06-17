function trimString(value) {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next || null;
}

export function buildRenderedHostTree({ surfaceStates = [] } = {}) {
  const nodesBySurfaceId = {};
  for (const state of surfaceStates ?? []) {
    const surfaceId = trimString(state?.surfaceId);
    if (!surfaceId) continue;
    nodesBySurfaceId[surfaceId] = {
      present: Boolean(state?.present),
      rootId: trimString(state?.rootId)
    };
  }
  return { nodesBySurfaceId };
}

export function collectReconcileSurfaceStates({
  surfaces = [],
  activeSurfaceIds = new Set(),
  renderedHostTree = {},
  resolveSurfaceState = null
} = {}) {
  const activeIds = activeSurfaceIds instanceof Set
    ? activeSurfaceIds
    : new Set((activeSurfaceIds ?? []).map(value => trimString(value)).filter(Boolean));
  const states = [];
  for (const surface of surfaces ?? []) {
    const surfaceId = trimString(surface?.id);
    if (!surfaceId || !activeIds.has(surfaceId)) continue;
    const renderedState = renderedHostTree?.nodesBySurfaceId?.[surfaceId] ?? {};
    const resolved = typeof resolveSurfaceState === "function"
      ? resolveSurfaceState(surface, renderedState)
      : null;
    if (!resolved) continue;
    states.push({
      surfaceId,
      rootId: trimString(surface?.view?.rootId),
      present: Boolean(renderedState.present),
      ...resolved
    });
  }
  return states;
}

export function createReconcilePlan({
  surfaceStates = [],
  activeSurfaceId = null
} = {}) {
  const nextActiveSurfaceId = trimString(activeSurfaceId);
  const ops = [];
  let structureChanged = false;
  let activeSurfaceUnderlayUpdated = false;

  for (const state of surfaceStates ?? []) {
    const surfaceId = trimString(state?.surfaceId);
    if (!surfaceId || (!state?.hasBindings && !state?.hasRepeat)) continue;
    const present = Boolean(state.present);
    const expectedVisible = Boolean(state.expectedVisible);
    const hasVisibleBinding = Boolean(state.hasVisibleBinding);
    if (hasVisibleBinding && !expectedVisible && present && surfaceId !== nextActiveSurfaceId) {
      ops.push({ kind: "dematerialize", surfaceId });
      structureChanged = true;
      continue;
    }
    if (expectedVisible && !present) {
      ops.push({ kind: "materialize", surfaceId });
      structureChanged = true;
    }
    if (surfaceId === nextActiveSurfaceId) {
      ops.push({
        kind: "route-underlay",
        surfaceId,
        routeKey: trimString(state?.nextProps?.routeUnderlay)
      });
      activeSurfaceUnderlayUpdated = true;
    }
    if (state?.hasRepeat && state?.nextRepeat) {
      ops.push({
        kind: "render-repeat",
        surfaceId,
        repeat: structuredClone(state.nextRepeat)
      });
    }
    ops.push({
      kind: "patch-props",
      surfaceId,
      props: state?.nextProps && typeof state.nextProps === "object"
        ? structuredClone(state.nextProps)
        : {}
    });
  }

  return {
    ops,
    structureChanged,
    activeSurfaceUnderlayUpdated
  };
}
