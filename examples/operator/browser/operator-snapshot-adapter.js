function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function buildViewportLayout(snapshot = {}) {
  const layout = snapshot?.viewport?.layout && typeof snapshot.viewport.layout === "object"
    ? snapshot.viewport.layout
    : {};
  const leftWeight = Number(
    layout.leftWeight
    ?? snapshot?.viewport?.leftWeight
    ?? 28
  ) || 28;
  return {
    top: Number(layout.top ?? snapshot?.viewport?.top ?? 3) || 3,
    bottom: Number(layout.bottom ?? snapshot?.viewport?.bottom ?? 4) || 4,
    leftWeight,
    rightWeight: Number(layout.rightWeight ?? snapshot?.viewport?.rightWeight ?? (100 - leftWeight)) || (100 - leftWeight)
  };
}

function buildBrowserUi(snapshot = {}) {
  const source = snapshot?.ui && typeof snapshot.ui === "object"
    ? structuredClone(snapshot.ui)
    : {};
  const openOverlayIds = [...new Set(
    (Array.isArray(source.openOverlayIds) ? source.openOverlayIds : [])
      .map(id => String(id ?? "").trim())
      .filter(Boolean)
  )];
  if (source.helpOpen && !openOverlayIds.includes("help_overlay")) openOverlayIds.push("help_overlay");
  if (source.contextMenuOpen && !openOverlayIds.includes("context_menu")) openOverlayIds.push("context_menu");
  return {
    ...source,
    openOverlayIds,
    overlayStateById: source.overlayStateById && typeof source.overlayStateById === "object"
      ? structuredClone(source.overlayStateById)
      : {},
    readerStateBySurfaceId: source.readerStateBySurfaceId && typeof source.readerStateBySurfaceId === "object"
      ? structuredClone(source.readerStateBySurfaceId)
      : {},
    activeOverlayId: openOverlayIds.at(-1) ?? null,
    helpOpen: openOverlayIds.includes("help_overlay"),
    contextMenuOpen: openOverlayIds.includes("context_menu")
  };
}

function overlayRowById(snapshot = {}, overlayId = null) {
  const resolvedId = optionalText(overlayId);
  if (!resolvedId) return null;
  const overlays = Array.isArray(snapshot?.overlays) ? snapshot.overlays : [];
  return overlays.find(entry => optionalText(entry?.id) === resolvedId) ?? null;
}

function syncCompatibilityOverlayExports(snapshot = {}) {
  const helpOverlay = overlayRowById(snapshot, "help_overlay");
  const contextMenu = overlayRowById(snapshot, "context_menu");
  if (helpOverlay) {
    const existing = snapshot?.helpOverlay && typeof snapshot.helpOverlay === "object"
      ? structuredClone(snapshot.helpOverlay)
      : {};
    snapshot.helpOverlay = {
      ...existing,
      ...structuredClone(helpOverlay),
      context: helpOverlay.context ?? existing.context ?? null,
      summary: helpOverlay.summary ?? existing.summary ?? null,
      visibleLines: Array.isArray(existing.visibleLines) ? existing.visibleLines : helpOverlay.visibleLines,
      visibleLineCount: existing.visibleLineCount ?? helpOverlay.visibleLineCount ?? null,
      overflowLineCount: existing.overflowLineCount ?? helpOverlay.overflowLineCount ?? null
    };
  }
  if (contextMenu) {
    const existing = snapshot?.contextMenu && typeof snapshot.contextMenu === "object"
      ? structuredClone(snapshot.contextMenu)
      : {};
    snapshot.contextMenu = {
      ...existing,
      ...structuredClone(contextMenu),
      subject: contextMenu.subject ?? existing.subject ?? null,
      context: contextMenu.context ?? existing.context ?? null,
      items: Array.isArray(contextMenu.items) ? contextMenu.items : existing.items,
      visibleLines: Array.isArray(existing.visibleLines) ? existing.visibleLines : contextMenu.visibleLines,
      visibleLineCount: existing.visibleLineCount ?? contextMenu.visibleLineCount ?? null,
      overflowLineCount: existing.overflowLineCount ?? contextMenu.overflowLineCount ?? null,
      activeItemIndex: existing.activeItemIndex ?? contextMenu.activeItemIndex ?? null
    };
  }
  return snapshot;
}

export function sanitizeOperatorWorkbenchSnapshot(snapshot = {}) {
  return {
    ...structuredClone(snapshot),
    session: {
      ...(snapshot?.session && typeof snapshot.session === "object" ? structuredClone(snapshot.session) : {}),
      appRoot: null,
      worldHome: null
    }
  };
}

function buildBrowserLeftPane(snapshot = {}) {
  const source = snapshot?.leftPane && typeof snapshot.leftPane === "object"
    ? structuredClone(snapshot.leftPane)
    : {};
  const rows = Array.isArray(source.rows) ? source.rows : [];
  return {
    ...source,
    mode: optionalText(source.mode || "tree"),
    shape: optionalText(source.shape || (source.mode === "results" ? "table" : "tree")),
    title: optionalText(source.title || "Operator Navigation"),
    header: optionalText(source.header || ""),
    helpText: optionalText(source.helpText || ""),
    rows,
    columns: Array.isArray(source.columns) ? source.columns.map(optionalText) : [],
    cursor: Number(source.cursor ?? source.activeRowIndex ?? 0) || 0,
    rowCount: Number(source.rowCount ?? rows.length) || rows.length,
    paging: source.paging && typeof source.paging === "object" ? source.paging : null,
    activeRow: source.activeRow ?? rows[Number(source.cursor ?? source.activeRowIndex ?? 0) || 0] ?? null
  };
}

export function createOperatorBrowserStateFromWorkbenchSnapshot(snapshot = {}) {
  const safeSnapshot = sanitizeOperatorWorkbenchSnapshot(snapshot);
  safeSnapshot.ui = buildBrowserUi(safeSnapshot);
  safeSnapshot.leftPane = buildBrowserLeftPane(safeSnapshot);
  syncCompatibilityOverlayExports(safeSnapshot);
  return {
    viewportId: "default",
    hostViewportLayoutDraft: null,
    snapshot: safeSnapshot
  };
}
