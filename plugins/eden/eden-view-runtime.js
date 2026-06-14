function readEdenAcademyCanvasState(model, state) {
  return model.academy && model.academy.mode === "academy"
    ? model.academy
    : { mode: "academy", actor: state.session.actor || null, quests: [], tracks: [], signals: [], practice: {} };
}

function readEdenViewport(stage) {
  return { width: stage.clientWidth, height: stage.clientHeight };
}

function isEdenActionVisible(action, state) {
  const minZoom = action.visibleRange?.minZoom ?? 0;
  const maxZoom = action.visibleRange?.maxZoom ?? 99;
  return state.camera.zoom >= minZoom && state.camera.zoom <= maxZoom;
}

function cameraForEdenSurface(surface, deps) {
  const {
    core,
    overrideZoom = null,
    stage,
    state
  } = deps;
  return core.cameraToFocusRect(surface, readEdenViewport(stage), {
    zoom: overrideZoom ?? null,
    padding: 48,
    maxZoom: 1.25
  });
}

function focusEdenTarget(targetId, deps) {
  const {
    byId,
    cameraForSurface,
    modelCameraTargets,
    render,
    state,
    targetById
  } = deps;
  const target = targetById.get(targetId) || modelCameraTargets.find(row => row.surfaceId === targetId) || null;
  if (!target) return;
  const surface = byId.get(target.surfaceId);
  if (!surface) return;
  state.focusSurfaceId = surface.id;
  state.camera = target.zoom == null
    ? cameraForSurface(surface, null)
    : cameraForSurface(surface, target.zoom);
  render();
}

function isEdenSurfaceVisible(surface, state) {
  const range = surface.visibleRange || {};
  const minZoom = typeof range.minZoom === "number" ? range.minZoom : 0;
  const maxZoom = typeof range.maxZoom === "number" ? range.maxZoom : 99;
  return state.camera.zoom >= minZoom && state.camera.zoom <= maxZoom;
}

function projectEdenSurfaceRect(surface, deps) {
  const { core, state } = deps;
  const topLeft = core.worldToScreen(state.camera, surface.x, surface.y);
  return {
    left: topLeft.x,
    top: topLeft.y,
    width: surface.w * state.camera.zoom,
    height: surface.h * state.camera.zoom
  };
}

function readEdenSurfaceReliefLevel(surface, state) {
  const relief = surface.relief || {};
  if (state.focusSurfaceId === surface.id) return Math.round(relief.focus ?? relief.base ?? 1);
  if (state.hoverSurfaceId === surface.id) return Math.round(relief.hover ?? relief.base ?? 1);
  return Math.round(relief.base ?? 1);
}

function applyEdenSurfaceMeta(container, surface) {
  if (!container) return;
  container.innerHTML = "";
  const tags = [];
  if (surface.district) tags.push(surface.district);
  for (const tag of surface.tags || []) tags.push(tag);
  for (const tag of tags) {
    const chip = document.createElement("span");
    chip.className = "eden-surface-tag";
    chip.textContent = tag;
    container.appendChild(chip);
  }
}

function renderEdenCheckpointView(model, state, elements) {
  const academy = readEdenAcademyCanvasState(model, state);
  const checkpoint = readEdenVisibleCheckpoint(model, state);
  return renderEdenCheckpoint(elements, checkpoint, academy);
}

export function renderEdenViewRuntimePrelude() {
  return `
${readEdenAcademyCanvasState.toString()}
${readEdenViewport.toString()}
${isEdenActionVisible.toString()}
${cameraForEdenSurface.toString()}
${focusEdenTarget.toString()}
${isEdenSurfaceVisible.toString()}
${projectEdenSurfaceRect.toString()}
${readEdenSurfaceReliefLevel.toString()}
${applyEdenSurfaceMeta.toString()}
${renderEdenCheckpointView.toString()}
`;
}
