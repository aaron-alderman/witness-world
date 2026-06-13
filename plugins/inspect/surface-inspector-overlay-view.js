export function renderSurfaceInspectorOverlayViewFactory() {
  return String.raw`
    const ensureSurfaceInspectorOverlayRoot = ${ensureSurfaceInspectorOverlayRoot.toString()};
    const renderSurfaceInspectorOverlayView = ${renderSurfaceInspectorOverlayView.toString()};
  `;
}

export function ensureSurfaceInspectorOverlayRoot({
  documentTarget = globalThis?.document || null
} = {}) {
  let overlay = documentTarget?.getElementById?.("surface-inspector-root");
  if (overlay) return overlay;
  overlay = documentTarget?.createElement?.("div") || null;
  if (!overlay) return null;
  overlay.id = "surface-inspector-root";
  documentTarget?.body?.appendChild?.(overlay);
  return overlay;
}

export function renderSurfaceInspectorOverlayView({
  surfaceCommandOpen = false,
  surfaceInspectorOpen = false,
  commandPalette = "",
  inspectorPanel = "",
  inspectorMenu = ""
} = {}) {
  return '<button type="button" class="surface-command-toggle world-command-toggle" data-surface-command-toggle>'
    + (surfaceCommandOpen ? "Close Search" : "Search / Command")
    + "</button>"
    + commandPalette
    + '<button type="button" class="surface-inspector-toggle" data-surface-inspector-toggle>'
    + (surfaceInspectorOpen ? "Close Inspector" : "Inspect Page")
    + "</button>"
    + inspectorPanel
    + inspectorMenu;
}
