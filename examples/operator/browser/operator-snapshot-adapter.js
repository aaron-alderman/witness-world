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
  const leftPane = buildBrowserLeftPane(safeSnapshot);
  return {
    viewportId: "default",
    viewportLayout: buildViewportLayout(safeSnapshot),
    viewportLayoutDraft: null,
    localUi: {
      overlayIds: []
    },
    scrollBySurfaceId: {
      session_reader: { x: 0, y: 0 }
    },
    leftPane,
    snapshot: safeSnapshot
  };
}
