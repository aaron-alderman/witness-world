export function currentPreviewManager(appContext = null) {
  return appContext?.appPreviewSessionManager ?? null;
}

export function requestedPreviewSessionId(requestUrl = null) {
  return requestUrl?.searchParams?.get("previewSessionId")?.trim() || null;
}

export function resolvePreviewSessionRequest({ appContext = null, requestUrl = null } = {}) {
  const previewSessionId = requestedPreviewSessionId(requestUrl);
  const previewManager = currentPreviewManager(appContext);
  if (!previewSessionId || !previewManager) {
    return {
      ok: false,
      reason: previewSessionId ? "missing" : "none",
      previewSessionId,
      previewManager,
      resolution: null,
      session: null,
      world: null
    };
  }
  const resolution = previewManager.resolveRenderSession(previewSessionId);
  if (!resolution?.ok) {
    return {
      ok: false,
      reason: resolution?.reason || "missing",
      previewSessionId,
      previewManager,
      resolution,
      session: resolution?.session ?? null,
      world: null
    };
  }
  return {
    ok: true,
    reason: null,
    previewSessionId,
    previewManager,
    resolution,
    session: resolution.session ?? null,
    world: resolution.world ?? null
  };
}

export function previewAwareProject(world, { projectionContext = null } = {}) {
  const project = projector => world.project(projector, {
    projectionContext,
    observations: world.allObservations()
  });
  project.allWitnesses = () => world.allWitnesses();
  return project;
}

export function previewAwareAppContext(appContext = null, world = null) {
  if (!appContext || !world) return appContext ?? null;
  return {
    ...appContext,
    requestWorldOverride: world,
    project: previewAwareProject(world, {
      projectionContext: appContext?.projectionContext ?? null
    }),
    visibleWitnesses: () => world.allWitnesses()
  };
}

export function activeRequestWorld(appContext = null, fallbackWorld = null) {
  return appContext?.requestWorldOverride ?? fallbackWorld;
}
