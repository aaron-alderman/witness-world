export const MIN_CANVAS_ZOOM = 0.2;
export const MAX_CANVAS_ZOOM = 4;

function numberOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function clampZoom(value, min = MIN_CANVAS_ZOOM, max = MAX_CANVAS_ZOOM) {
  return Math.max(min, Math.min(max, numberOr(value, 1)));
}

export function createCameraState(camera = {}) {
  return {
    x: numberOr(camera.x, 0),
    y: numberOr(camera.y, 0),
    zoom: clampZoom(camera.zoom ?? 1)
  };
}

export function createReplayState() {
  return {
    witnesses: [],
    playhead: null,
    filter: "all",
    playing: null,
    open: false
  };
}

export function worldToScreen(camera, x, y) {
  const next = createCameraState(camera);
  return {
    x: numberOr(x, 0) * next.zoom + next.x,
    y: numberOr(y, 0) * next.zoom + next.y
  };
}

export function screenToWorld(camera, px, py) {
  const next = createCameraState(camera);
  return {
    x: (numberOr(px, 0) - next.x) / next.zoom,
    y: (numberOr(py, 0) - next.y) / next.zoom
  };
}

export function zoomCameraAt(camera, px, py, factor, min = MIN_CANVAS_ZOOM, max = MAX_CANVAS_ZOOM) {
  const next = createCameraState(camera);
  const zoom = clampZoom(next.zoom * numberOr(factor, 1), min, max);
  return {
    x: numberOr(px, 0) - ((numberOr(px, 0) - next.x) / next.zoom) * zoom,
    y: numberOr(py, 0) - ((numberOr(py, 0) - next.y) / next.zoom) * zoom,
    zoom
  };
}

export function centerOfRect(node) {
  return {
    x: numberOr(node?.x, 0) + numberOr(node?.w, 0) / 2,
    y: numberOr(node?.y, 0) + numberOr(node?.h, 0) / 2
  };
}

export function connectorKey(connector) {
  return `${connector?.from || ""} ${connector?.rel || ""} ${connector?.to || ""} ${connector?.fromInstance || ""} ${connector?.toInstance || ""}`;
}

export function selectionBounds(nodes) {
  const list = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
  if (!list.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of list) {
    left = Math.min(left, numberOr(node.x, 0));
    top = Math.min(top, numberOr(node.y, 0));
    right = Math.max(right, numberOr(node.x, 0) + numberOr(node.w, 0));
    bottom = Math.max(bottom, numberOr(node.y, 0) + numberOr(node.h, 0));
  }
  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top
  };
}

export function rectEdgePoint(node, towards) {
  const c = centerOfRect(node);
  const dx = numberOr(towards?.x, c.x) - c.x;
  const dy = numberOr(towards?.y, c.y) - c.y;
  if (!dx && !dy) return c;
  const sx = dx ? (numberOr(node?.w, 0) / 2) / Math.abs(dx) : Infinity;
  const sy = dy ? (numberOr(node?.h, 0) / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

export function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = numberOr(bx, 0) - numberOr(ax, 0);
  const dy = numberOr(by, 0) - numberOr(ay, 0);
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((numberOr(px, 0) - numberOr(ax, 0)) * dx + (numberOr(py, 0) - numberOr(ay, 0)) * dy) / lengthSq)) : 0;
  const cx = numberOr(ax, 0) + t * dx;
  const cy = numberOr(ay, 0) + t * dy;
  return Math.hypot(numberOr(px, 0) - cx, numberOr(py, 0) - cy);
}

export function layoutConnector(fromRect, toRect) {
  const start = rectEdgePoint(fromRect, centerOfRect(toRect));
  const end = rectEdgePoint(toRect, centerOfRect(fromRect));
  return { start, end };
}

export function cameraToFocusRect(rect, viewport, {
  zoom = null,
  padding = 24,
  minZoom = MIN_CANVAS_ZOOM,
  maxZoom = MAX_CANVAS_ZOOM
} = {}) {
  const width = Math.max(1, numberOr(viewport?.width, 0));
  const height = Math.max(1, numberOr(viewport?.height, 0));
  const w = Math.max(1, numberOr(rect?.w, 0));
  const h = Math.max(1, numberOr(rect?.h, 0));
  const targetZoom = zoom == null
    ? clampZoom(Math.min((width - padding * 2) / w, (height - padding * 2) / h), minZoom, maxZoom)
    : clampZoom(zoom, minZoom, maxZoom);
  const center = centerOfRect(rect);
  return {
    x: width / 2 - center.x * targetZoom,
    y: height / 2 - center.y * targetZoom,
    zoom: targetZoom
  };
}

export function renderCanvasCorePrelude() {
  return `
const __canvasCore = (() => {
  const MIN_CANVAS_ZOOM = ${JSON.stringify(MIN_CANVAS_ZOOM)};
  const MAX_CANVAS_ZOOM = ${JSON.stringify(MAX_CANVAS_ZOOM)};
  ${numberOr.toString()}
  ${clampZoom.toString()}
  ${createCameraState.toString()}
  ${createReplayState.toString()}
  ${worldToScreen.toString()}
  ${screenToWorld.toString()}
  ${zoomCameraAt.toString()}
  ${centerOfRect.toString()}
  ${connectorKey.toString()}
  ${selectionBounds.toString()}
  ${rectEdgePoint.toString()}
  ${segmentDistance.toString()}
  ${layoutConnector.toString()}
  ${cameraToFocusRect.toString()}
  return {
    MIN_CANVAS_ZOOM,
    MAX_CANVAS_ZOOM,
    clampZoom,
    createCameraState,
    createReplayState,
    worldToScreen,
    screenToWorld,
    zoomCameraAt,
    centerOfRect,
    connectorKey,
    selectionBounds,
    rectEdgePoint,
    segmentDistance,
    layoutConnector,
    cameraToFocusRect
  };
})();`;
}
