function ensureEdenEmbeddedMode(surfaceId, state) {
  const key = String(surfaceId || "");
  if (!state.embeddedModes[key]) state.embeddedModes[key] = { inspect: false };
  return state.embeddedModes[key];
}

function readEdenEmbeddedFrame(surfaceId, stateElements) {
  return stateElements.get(surfaceId)?.querySelector?.("iframe") || null;
}

function readEdenEmbeddedDocument(surfaceId, stateElements) {
  try {
    return readEdenEmbeddedFrame(surfaceId, stateElements)?.contentDocument || null;
  } catch {
    return null;
  }
}

function readEdenEmbeddedWindow(surfaceId, stateElements) {
  try {
    return readEdenEmbeddedFrame(surfaceId, stateElements)?.contentWindow || null;
  } catch {
    return null;
  }
}

function isEdenSurfaceInspectorPanelOpen(doc) {
  return Boolean(doc?.querySelector?.("[data-surface-inspector-panel]"));
}

function isEdenSurfaceCommandPaletteOpen(doc) {
  return Boolean(doc?.querySelector?.("[data-surface-command-palette]"));
}

function setEdenEmbeddedSurfaceInspector(surfaceId, open, deps) {
  const { embeddedDocument } = deps;
  const doc = embeddedDocument(surfaceId);
  const toggle = doc?.querySelector?.("[data-surface-inspector-toggle]");
  if (!toggle || isEdenSurfaceInspectorPanelOpen(doc) === Boolean(open)) return;
  toggle.click();
}

function setEdenEmbeddedSurfaceCommand(surfaceId, open, deps) {
  const { embeddedDocument } = deps;
  const doc = embeddedDocument(surfaceId);
  const toggle = doc?.querySelector?.("[data-surface-command-toggle]");
  if (!toggle || isEdenSurfaceCommandPaletteOpen(doc) === Boolean(open)) return;
  toggle.click();
}

function seedEdenEmbeddedCommandQuery(surfaceId, query, deps) {
  const { embeddedDocument } = deps;
  const doc = embeddedDocument(surfaceId);
  const input = doc?.querySelector?.("[data-surface-command-input]");
  if (!input) return false;
  const value = String(query || "");
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
  if (typeof input.setSelectionRange === "function") input.setSelectionRange(value.length, value.length);
  return true;
}

function syncEdenEmbeddedModeState(surface, deps) {
  const {
    embeddedMode,
    setEmbeddedSurfaceCommand,
    setEmbeddedSurfaceInspector,
    stateElements,
    syncEmbeddedSurfaceNode
  } = deps;
  const node = stateElements.get(surface.id);
  const mode = embeddedMode(surface.id);
  syncEmbeddedSurfaceNode(node, { inspect: mode.inspect });
  setEmbeddedSurfaceInspector(surface.id, mode.inspect);
  if (!mode.inspect) setEmbeddedSurfaceCommand(surface.id, false);
}

function toggleEdenEmbeddedInspect(surface, next = null, deps) {
  const {
    embeddedMode,
    render,
    setStatus,
    state,
    syncEmbeddedMode
  } = deps;
  const mode = embeddedMode(surface.id);
  mode.inspect = typeof next === "boolean" ? next : !mode.inspect;
  if (!mode.inspect) {
    state.focusReliefKey = null;
    state.hoverReliefKey = null;
  }
  syncEmbeddedMode(surface);
  setStatus(mode.inspect
    ? "Inspect mode active. Right-click widgets on the live board."
    : "Map mode restored. Relief overlays are back.");
  render();
}

export function renderEdenEmbeddedBridgePrelude() {
  return `
${ensureEdenEmbeddedMode.toString()}
${readEdenEmbeddedFrame.toString()}
${readEdenEmbeddedDocument.toString()}
${readEdenEmbeddedWindow.toString()}
${isEdenSurfaceInspectorPanelOpen.toString()}
${isEdenSurfaceCommandPaletteOpen.toString()}
${setEdenEmbeddedSurfaceInspector.toString()}
${setEdenEmbeddedSurfaceCommand.toString()}
${seedEdenEmbeddedCommandQuery.toString()}
${syncEdenEmbeddedModeState.toString()}
${toggleEdenEmbeddedInspect.toString()}
`;
}
