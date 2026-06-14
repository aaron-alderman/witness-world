function bindEdenSurfaceNode(node, surface, deps) {
  const {
    focusTarget,
    render,
    state
  } = deps;
  node.dataset.edenSurface = surface.id;
  node.classList.toggle("is-chrome-tray", surface.chromeKind === "tray");
  node.classList.toggle("is-chrome-shelf", surface.chromeKind === "shelf");
  node.classList.toggle("is-chrome-machinePlate", surface.chromeKind === "machinePlate");
  node.classList.toggle("is-chrome-mapWall", surface.chromeKind === "mapWall");
  node.addEventListener("pointerenter", () => {
    state.hoverSurfaceId = surface.id;
    render();
  });
  node.addEventListener("pointerleave", () => {
    if (state.hoverSurfaceId === surface.id) state.hoverSurfaceId = null;
    render();
  });
  node.addEventListener("dblclick", event => {
    if (surface.cameraTargetId) {
      event.preventDefault();
      focusTarget(surface.cameraTargetId);
    }
  });
}

function ensureEdenSurfaceNode(surface, deps) {
  const {
    bindSurfaceNode,
    createCapabilitySurfaceNode,
    createDefaultSurfaceNode,
    createEditSurfaceNode,
    createEmbeddedSurfaceNode,
    createGotoSurfaceNode,
    createOrganizationSurfaceNode,
    createPersonalSurfaceNode,
    createProcessSurfaceNode,
    createTheorySurfaceNode,
    createVersionsSurfaceNode,
    state,
    surfacesRoot
  } = deps;
  if (state.elements.has(surface.id)) return state.elements.get(surface.id);
  let node;
  if (surface.surfaceKind === "embeddedPage") {
    node = createEmbeddedSurfaceNode(surface);
  } else if (surface.surfaceKind === "tree") {
    node = createTheorySurfaceNode(surface);
  } else if (surface.surfaceKind === "goto") {
    node = createGotoSurfaceNode(surface);
  } else if (surface.panelKind === "personalBox") {
    node = createPersonalSurfaceNode(surface);
  } else if (surface.panelKind === "editPage") {
    node = createEditSurfaceNode(surface);
  } else if (surface.panelKind === "organization") {
    node = createOrganizationSurfaceNode(surface);
  } else if (surface.panelKind === "capabilityInstall") {
    node = createCapabilitySurfaceNode(surface);
  } else if (surface.panelKind === "processView") {
    node = createProcessSurfaceNode(surface);
  } else if (surface.panelKind === "versions") {
    node = createVersionsSurfaceNode(surface);
  } else {
    node = createDefaultSurfaceNode(surface);
  }
  bindSurfaceNode(node, surface);
  surfacesRoot.appendChild(node);
  state.elements.set(surface.id, node);
  return node;
}

function renderEdenSurfaceCollection(deps) {
  const {
    ensureSurface,
    isVisible,
    model,
    rectToScreen,
    reliefLevelFor,
    renderActions,
    renderSurfaceDetails,
    state
  } = deps;
  for (const surface of model.surfaces || []) {
    const node = ensureSurface(surface);
    const visible = isVisible(surface);
    node.hidden = !visible;
    if (!visible) continue;
    const rect = rectToScreen(surface);
    node.style.left = rect.left + "px";
    node.style.top = rect.top + "px";
    node.style.width = rect.width + "px";
    node.style.height = rect.height + "px";
    node.dataset.relief = String(Math.max(0, Math.min(4, reliefLevelFor(surface))));
    node.classList.toggle("is-focused", state.focusSurfaceId === surface.id);
    const actionContainer = node.querySelector(".eden-surface-actions");
    if (actionContainer) renderActions(actionContainer, surface);
    renderSurfaceDetails(node, surface);
  }
}

export function renderEdenSurfaceRuntimePrelude() {
  return `
${bindEdenSurfaceNode.toString()}
${ensureEdenSurfaceNode.toString()}
${renderEdenSurfaceCollection.toString()}
`;
}
