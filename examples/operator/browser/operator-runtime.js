import {
  ANSI16_PALETTE,
  CELL_FLAGS,
  clearCellBuffer,
  createCellBuffer,
  drawText,
  fillRect,
  putCell
} from "./operator-framebuffer.js";
import {
  buildViewportFrameGraph,
  fillStyleById,
  paintViewportFrameGraph,
  textStyleById
} from "./operator-frame-graph.js";
import {
  collectGlyphCodepoints,
  createGlyphAtlas,
  DEFAULT_GLYPH_FONT_FAMILY,
  resolveCanvasCellMetrics
} from "./operator-glyph-atlas.js";
import { createOperatorBrowserStateFromWorkbenchSnapshot } from "./operator-snapshot-adapter.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fitText(value, width) {
  const text = String(value ?? "");
  if (text.length <= width) return text.padEnd(width, " ");
  if (width <= 1) return text.slice(0, width);
  return `${text.slice(0, width - 1)}…`;
}

function fitLabel(value, width) {
  const text = String(value ?? "");
  if (text.length <= width) return text;
  if (width <= 1) return text.slice(0, width);
  return `${text.slice(0, width - 1)}…`;
}

function optionalText(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function resolveViewportThemeInfo(state = {}, model = null) {
  const themeSpec = state.snapshot?.viewport?.themeSpec && typeof state.snapshot.viewport.themeSpec === "object"
    ? state.snapshot.viewport.themeSpec
    : null;
  if (themeSpec?.id) {
    return {
      id: optionalText(themeSpec.id),
      title: optionalText(themeSpec.title || themeSpec.id),
      mode: optionalText(themeSpec.mode || "ansi16"),
      palette: optionalText(themeSpec.palette || "terminal-dark")
    };
  }
  const themeId = optionalText(state.snapshot?.viewport?.theme || "");
  const modelTheme = themeId && model?.themeById instanceof Map ? model.themeById.get(themeId) : null;
  if (modelTheme?.id) {
    return {
      id: optionalText(modelTheme.id),
      title: optionalText(modelTheme.title || modelTheme.id),
      mode: optionalText(modelTheme.mode || "ansi16"),
      palette: optionalText(modelTheme.palette || "terminal-dark")
    };
  }
  return {
    id: themeId || "ansi16",
    title: themeId || "ansi16",
    mode: "ansi16",
    palette: "terminal-dark"
  };
}

function resolveCanvasPaletteForTheme(themeInfo = null) {
  if (optionalText(themeInfo?.mode) === "ansi16" && optionalText(themeInfo?.palette) === "terminal-dark") {
    return ANSI16_PALETTE;
  }
  return ANSI16_PALETTE;
}

function computeWindowStart(total, visible, activeIndex) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeVisible = Math.max(1, Number(visible) || 1);
  const safeActive = clamp(Number(activeIndex) || 0, 0, Math.max(0, safeTotal - 1));
  if (safeTotal <= safeVisible) return 0;
  const centered = safeActive - Math.floor(safeVisible / 2);
  return clamp(centered, 0, Math.max(0, safeTotal - safeVisible));
}

function focusedSurfaceIdForPane(pane = "left") {
  if (pane === "top") return "top_status";
  if (pane === "bottom") return "command_bar";
  if (pane === "right") return "session_reader";
  return "nav_tree";
}

function currentFocusedPane(state = {}) {
  return optionalText(state.snapshot?.ui?.focusedPane || "left");
}

function currentFocusedSurfaceId(state = {}) {
  return focusedSurfaceIdForPane(currentFocusedPane(state));
}

function currentTopCursor(state = {}) {
  return Number(state.snapshot?.topPane?.navigation?.selectedIndex ?? 0) || 0;
}

function leftPaneModel(state = {}) {
  return state.snapshot?.leftPane && typeof state.snapshot.leftPane === "object"
    ? state.snapshot.leftPane
    : {};
}

function currentLeftCursor(state = {}) {
  return Number(leftPaneModel(state).cursor ?? leftPaneModel(state).activeRowIndex ?? 0) || 0;
}

function currentRightCursor(state = {}) {
  return Number(state.snapshot?.rightPane?.cursor ?? 0) || 0;
}

function rightPaneReaderSurfaceId(state = {}) {
  return optionalText(state.snapshot?.rightPane?.surfaceId || "session_reader") || "session_reader";
}

function rightPaneReaderScroll(state = {}) {
  const surfaceId = rightPaneReaderSurfaceId(state);
  const scroll = state.snapshot?.rightPane?.readerScroll && typeof state.snapshot.rightPane.readerScroll === "object"
    ? state.snapshot.rightPane.readerScroll
    : (state.snapshot?.ui?.readerStateBySurfaceId?.[surfaceId] && typeof state.snapshot.ui.readerStateBySurfaceId[surfaceId] === "object"
        ? state.snapshot.ui.readerStateBySurfaceId[surfaceId]
        : {});
  return {
    surfaceId,
    x: Number(scroll.x ?? 0) || 0,
    y: Number(scroll.y ?? 0) || 0
  };
}

function activeOverlayIds(state = {}) {
  const ui = state.snapshot?.ui && typeof state.snapshot.ui === "object" ? state.snapshot.ui : {};
  const overlayIds = [...new Set(
    (Array.isArray(ui.openOverlayIds) ? ui.openOverlayIds : [])
      .map(id => String(id ?? "").trim())
      .filter(Boolean)
  )];
  if (ui.helpOpen && !overlayIds.includes("help_overlay")) overlayIds.push("help_overlay");
  if (ui.contextMenuOpen && !overlayIds.includes("context_menu")) overlayIds.push("context_menu");
  return overlayIds;
}

function activeOverlayId(state = {}) {
  return optionalText(state.snapshot?.ui?.activeOverlayId || activeOverlayIds(state).at(-1) || "") || null;
}

function buildMetaChips(state = {}) {
  const sharedChips = Array.isArray(state.snapshot?.topPane?.metaChips)
    ? state.snapshot.topPane.metaChips
      .map(chip => optionalText(chip?.label || chip))
      .filter(Boolean)
    : [];
  if (sharedChips.length) return sharedChips;
  const snapshot = state.snapshot || {};
  const viewportChip = snapshot?.viewport?.id ? `viewport:${snapshot.viewport.id}` : "viewport:default";
  const themeChip = `theme:${resolveViewportThemeInfo(state).id}`;
  const paneChip = `pane:${currentFocusedPane(state)}`;
  return [viewportChip, themeChip, paneChip];
}

function topNavigationLabels(state = {}) {
  return Array.isArray(state.snapshot?.topPane?.navigation?.chips)
    ? state.snapshot.topPane.navigation.chips.map(chip => optionalText(chip?.label)).filter(Boolean)
    : [];
}

function commandBarText(state = {}) {
  return optionalText(
    state.snapshot?.bottomPane?.commandText
    || `: screen ${optionalText(state.snapshot?.rightPane?.activeScreenId || state.snapshot?.screens?.activeScreenId || "inspect")}`
  );
}

function commandBarHintText(state = {}) {
  if (state.hostMode === "fixture-readonly") {
    return "Fixture mode: read-only. Start the live core bridge for navigation and authored help.";
  }
  return optionalText(state.snapshot?.bottomPane?.hintText || "F1 help | Right click menu | Drag handles resize");
}

function overlayLines(state = {}, overlayId = null, surface = null) {
  const overlayModel = overlaySnapshotModelById(state, overlayId, surface);
  return Array.isArray(overlayModel?.lines)
    ? overlayModel.lines.map(optionalText).filter(Boolean)
    : [];
}

function activeContextMenuItems(state = {}) {
  const overlayModel = overlaySnapshotModelById(state, "context_menu");
  return Array.isArray(overlayModel?.items) ? overlayModel.items : [];
}

function rightPaneRows(state = {}) {
  return Array.isArray(state.snapshot?.rightPane?.screen?.rows) ? state.snapshot.rightPane.screen.rows : [];
}

function activeRightSectionTitle(state = {}) {
  return optionalText(
    state.snapshot?.rightPane?.activeSection?.title || state.snapshot?.rightPane?.screen?.activeSectionTitle || ""
  );
}

function rightPaneDetailLines(state = {}) {
  return Array.isArray(state.snapshot?.rightPane?.bodyLines)
    ? state.snapshot.rightPane.bodyLines.map(optionalText).filter(Boolean)
    : [];
}

function rightPaneReaderMetrics(rect, state = {}) {
  const innerWidth = Math.max(1, rect.width - 4);
  const innerHeight = Math.max(1, rect.height - 2);
  const rows = rightPaneRows(state);
  const lines = rightPaneDetailLines(state);
  let rowOffset = 0;
  if (rows.length) {
    const maxRowLines = Math.min(Math.max(1, innerHeight - 2), rows.length);
    rowOffset = 1 + maxRowLines;
    if (rowOffset < innerHeight) rowOffset += 1;
  }
  const visibleLineCount = Math.max(0, innerHeight - rowOffset);
  const maxLineWidth = lines.reduce((maxWidth, line) => Math.max(maxWidth, optionalText(line).length), 0);
  return {
    innerWidth,
    innerHeight,
    rows,
    lines,
    rowOffset,
    visibleLineCount,
    maxScrollX: Math.max(0, maxLineWidth - innerWidth),
    maxScrollY: Math.max(0, lines.length - visibleLineCount)
  };
}

function makeRect(x, y, width, height) {
  return { x, y, width, height };
}

function centeredRect(bounds, width, height, marginX = 2, marginY = 1) {
  const safeMarginX = Math.max(0, Number(marginX ?? 2) || 0);
  const safeMarginY = Math.max(0, Number(marginY ?? 1) || 0);
  return makeRect(
    Math.max(bounds.x + safeMarginX, Math.floor(bounds.x + ((bounds.width - width) / 2))),
    Math.max(bounds.y + safeMarginY, Math.floor(bounds.y + ((bounds.height - height) / 2))),
    Math.min(width, Math.max(1, bounds.width - (safeMarginX * 2))),
    Math.min(height, Math.max(1, bounds.height - (safeMarginY * 2)))
  );
}

function findBinding(viewport, trigger, verb) {
  return viewport.bindings.find(binding => binding.trigger === trigger && binding.verb === verb) || null;
}

function resolvedViewportLayout(state = {}, viewport = {}) {
  const draft = state.hostViewportLayoutDraft && typeof state.hostViewportLayoutDraft === "object"
    ? state.hostViewportLayoutDraft
    : null;
  const committed = state.snapshot?.viewport?.layout && typeof state.snapshot.viewport.layout === "object"
    ? state.snapshot.viewport.layout
    : {};
  const authoredLeftWeight = Number(viewport?.center?.leftWeight ?? 28) || 28;
  const leftWeight = clamp(
    Number(draft?.leftWeight ?? committed?.leftWeight ?? authoredLeftWeight) || authoredLeftWeight,
    15,
    85
  );
  return {
    top: clamp(Number(draft?.top ?? committed?.top ?? viewport?.top?.size ?? 3) || 3, 3, Math.max(3, viewport?.size?.height ?? 30)),
    bottom: clamp(Number(draft?.bottom ?? committed?.bottom ?? viewport?.bottom?.size ?? 4) || 4, 3, Math.max(3, viewport?.size?.height ?? 30)),
    leftWeight,
    rightWeight: Number(draft?.rightWeight ?? committed?.rightWeight ?? (100 - leftWeight)) || (100 - leftWeight)
  };
}

export function layoutViewport(model, runtimeState, viewportId = runtimeState.viewportId || "default") {
  const viewport = model.viewportById.get(viewportId);
  if (!viewport) throw new Error(`unknown viewport: ${viewportId}`);
  const { width, height } = viewport.size;
  const layoutState = resolvedViewportLayout(runtimeState, viewport);
  const topSize = clamp(layoutState.top ?? viewport.top?.size ?? 3, 3, Math.max(3, height - 10));
  const bottomSize = clamp(layoutState.bottom ?? viewport.bottom?.size ?? 4, 3, Math.max(3, height - topSize - 4));
  const centerHeight = Math.max(6, height - topSize - bottomSize);
  const leftWeight = clamp(layoutState.leftWeight ?? viewport.center?.leftWeight ?? 28, 15, 85);
  const verticalHandleX = clamp(Math.floor((width * leftWeight) / 100), 16, width - 16);
  const mainTop = topSize;
  const mainBounds = makeRect(0, mainTop, width, centerHeight);
  return {
    viewport,
    bounds: makeRect(0, 0, width, height),
    top: makeRect(0, 0, width, topSize),
    bottom: makeRect(0, height - bottomSize, width, bottomSize),
    main: mainBounds,
    left: makeRect(0, mainTop, verticalHandleX, centerHeight),
    right: makeRect(verticalHandleX + 1, mainTop, width - verticalHandleX - 1, centerHeight),
    handles: {
      top: makeRect(0, topSize - 1, width, 1),
      bottom: makeRect(0, height - bottomSize, width, 1),
      vertical: makeRect(verticalHandleX, mainTop, 1, centerHeight)
    }
  };
}

function frameTitleText(rect, title, focused = false) {
  const rail = focused ? "\u2501" : "\u2500";
  return {
    x: rect.x + 1,
    y: rect.y,
    text: `${rail} ${fitLabel(title, Math.max(1, rect.width - 8))} ${rail}`,
    styleId: focused ? "primary" : "passive"
  };
}

function frameStatusText(rect, status, focused = false) {
  const rail = focused ? "\u2501" : "\u2500";
  return {
    x: rect.x + rect.width - status.length - 5,
    y: rect.y,
    text: `${rail} ${status} ${rail}`,
    styleId: focused ? "primary" : "passive"
  };
}

function overlaySnapshotModelById(state = {}, overlayId = null, surface = null) {
  const overlayRows = Array.isArray(state.snapshot?.overlays) ? state.snapshot.overlays : [];
  const resolvedId = overlayId || surface?.id || null;
  if (resolvedId) {
    const exact = overlayRows.find(row => row?.id === resolvedId);
    if (exact) return exact;
  }
  if (overlayId === "context_menu" || surface?.kind === "menu") {
    return state.snapshot?.contextMenu
      ? {
          ...state.snapshot.contextMenu,
          id: "context_menu",
          kind: "menu"
        }
      : null;
  }
  if (overlayId === "help_overlay") {
    return state.snapshot?.helpOverlay
      ? {
          ...state.snapshot.helpOverlay,
          id: "help_overlay",
          kind: "doc_view"
        }
      : null;
  }
  return null;
}

function overlayInteractionModel(state = {}, overlayId = null, surface = null) {
  const overlayModel = overlaySnapshotModelById(state, overlayId, surface);
  if (overlayModel?.interaction && typeof overlayModel.interaction === "object") {
    return overlayModel.interaction;
  }
  if (surface?.kind === "menu") {
    return {
      family: "menu",
      cursorMode: "items",
      activationMode: "item",
      scrollMode: "none"
    };
  }
  return {
    family: "doc_view",
    cursorMode: "none",
    activationMode: "none",
    scrollMode: "xy"
  };
}

function overlayPolicyModel(state = {}, overlayId = null, surface = null) {
  const overlayModel = overlaySnapshotModelById(state, overlayId, surface);
  if (overlayModel?.policy && typeof overlayModel.policy === "object") {
    return overlayModel.policy;
  }
  if (Array.isArray(surface?.closeIdsOnOpen)) {
    return {
      closeIdsOnOpen: surface.closeIdsOnOpen.map(id => String(id ?? "").trim()).filter(Boolean)
    };
  }
  return {
    closeIdsOnOpen: []
  };
}

function overlayCloseIdsForOpen(state = {}, overlayId = null, surface = null) {
  return (Array.isArray(overlayPolicyModel(state, overlayId, surface)?.closeIdsOnOpen)
    ? overlayPolicyModel(state, overlayId, surface).closeIdsOnOpen
    : [])
    .map(id => String(id ?? "").trim())
    .filter(Boolean);
}

function overlayItems(state = {}, overlayId = null, surface = null) {
  const overlayModel = overlaySnapshotModelById(state, overlayId, surface);
  return Array.isArray(overlayModel?.items) ? overlayModel.items : [];
}

function updateOverlaySnapshotModel(state = {}, overlayId = null, patch = null) {
  if (!overlayId || !patch || typeof patch !== "object") return null;
  const overlayRows = Array.isArray(state.snapshot?.overlays) ? state.snapshot.overlays : [];
  const overlayModel = overlayRows.find(entry => entry?.id === overlayId) ?? null;
  if (overlayModel) Object.assign(overlayModel, patch);
  if (overlayId === "context_menu" && state.snapshot?.contextMenu && typeof state.snapshot.contextMenu === "object") {
    Object.assign(state.snapshot.contextMenu, patch);
  }
  if (overlayId === "help_overlay" && state.snapshot?.helpOverlay && typeof state.snapshot.helpOverlay === "object") {
    Object.assign(state.snapshot.helpOverlay, patch);
  }
  return overlayModel;
}

function overlayTitleText(rect, overlayEntry, state = {}) {
  const { id: overlayId = null, surface = null } = overlayEntry ?? {};
  const overlayModel = overlaySnapshotModelById(state, overlayId, surface);
  const title = surface?.kind === "menu"
    ? optionalText(overlayModel?.frameTitle || overlayModel?.title || surface?.title)
    : optionalText(overlayModel?.frameTitle || surface?.title);
  const titleInsetX = Math.max(0, Number(overlayModel?.titleInsetX ?? 2) || 0);
  return {
    layer: "overlay",
    x: rect.x + titleInsetX,
    y: rect.y,
    text: ` ${title} `,
    styleId: "overlayTitle"
  };
}

function rightPaneSectionOrnaments(rect, state) {
  const rightRows = rightPaneRows(state);
  if (!rightRows.length) return [];
  const innerWidth = Math.max(1, rect.width - 4);
  const innerHeight = Math.max(1, rect.height - 2);
  const maxRowLines = Math.min(Math.max(1, innerHeight - 2), rightRows.length);
  const sectionTitle = optionalText(
    state.snapshot?.rightPane?.activeSection?.rowHeaderLabel
    || (activeRightSectionTitle(state) ? `${activeRightSectionTitle(state)} rows` : "rows")
  );
  const ornaments = [{
    x: rect.x + 2,
    y: rect.y + 1,
    text: fitText(`[${sectionTitle}]`, innerWidth),
    styleId: "sectionHeader"
  }];
  const dividerY = rect.y + 1 + 1 + maxRowLines;
  if ((1 + maxRowLines) < innerHeight) {
    ornaments.push({
      x: rect.x + 2,
      y: dividerY,
      text: fitText("=".repeat(Math.max(1, innerWidth)), innerWidth),
      styleId: "divider"
    });
  }
  return ornaments;
}

function leftPaneTextScene(rect, surface, state, focused) {
  const pane = leftPaneModel(state);
  const innerWidth = Math.max(1, rect.width - 4);
  const innerHeight = Math.max(1, rect.height - 2);
  const rows = Array.isArray(pane.rows) ? pane.rows : [];
  const activeIndex = clamp(currentLeftCursor(state), 0, Math.max(0, rows.length - 1));
  const columns = Array.isArray(pane.columns) ? pane.columns.filter(Boolean) : [];
  const headerText = pane.paging
    ? `${pane.header || ""} :: ${pane.paging.start}-${pane.paging.end}/${pane.paging.totalRows}`
    : optionalText(pane.header);
  let contentY = rect.y + 1;
  let remainingHeight = innerHeight;
  if (headerText && remainingHeight > 0) {
    contentY += 1;
    remainingHeight -= 1;
  }

  const tableMode = (pane.shape === "table" || pane.mode === "results") && columns.length > 0;
  if (tableMode && remainingHeight > 0) {
    contentY += 1;
    remainingHeight -= 1;
  }

  const start = computeWindowStart(rows.length, Math.max(1, remainingHeight), activeIndex);
  return rows.slice(start, start + Math.max(0, remainingHeight)).map((row, index) => {
    const rowIndex = start + index;
    const isActive = rowIndex === activeIndex;
    let line = "";
    if (tableMode) {
      const values = columns.map(column => optionalText(row?.columns?.[column] ?? ""));
      line = `${String(row?.index ?? rowIndex + 1).padStart(2, " ")} ${values.join(" | ")}`.trimEnd();
    } else {
      const primary = fitText(optionalText(row?.label ?? "(row)"), Math.min(innerWidth, surface.maxPrimaryChars ?? innerWidth));
      const detail = optionalText(row?.detail ?? row?.summary ?? "");
      const secondary = detail ? ` ${detail.slice(0, Math.max(0, innerWidth - primary.length - 1))}` : "";
      line = `${primary}${secondary}`;
    }
    return {
      x: rect.x + 2,
      y: contentY + index,
      text: fitText(line, innerWidth),
      styleId: focused && isActive ? "rowSelectedFocused" : (isActive ? "rowSelected" : (row?.type === "container" ? "rowContainer" : "rowDefault"))
    };
  });
}

function leftPaneOrnaments(rect, pane = {}) {
  const innerWidth = Math.max(1, rect.width - 4);
  const ornaments = [];
  const headerText = pane.paging
    ? `${pane.header || ""} :: ${pane.paging.start}-${pane.paging.end}/${pane.paging.totalRows}`
    : optionalText(pane.header);
  if (headerText) {
    ornaments.push({
      x: rect.x + 2,
      y: rect.y + 1,
      text: fitText(headerText, innerWidth),
      styleId: "headerMuted"
    });
  }
  const columns = Array.isArray(pane.columns) ? pane.columns.filter(Boolean) : [];
  const tableMode = (pane.shape === "table" || pane.mode === "results") && columns.length > 0;
  if (tableMode) {
    ornaments.push({
      x: rect.x + 2,
      y: rect.y + 1 + (headerText ? 1 : 0),
      text: fitText(columns.join(" | "), innerWidth),
      styleId: "headerAccent"
    });
  }
  return ornaments;
}

function topStatusOrnaments(rect, state, focused = false) {
  const innerWidth = Math.max(1, rect.width - 4);
  const metaChips = buildMetaChips(state);
  const navigationChips = topNavigationLabels(state);
  const y = rect.y + 1;
  if (!metaChips.length && !navigationChips.length) return [];
  if (!navigationChips.length) {
    return [{
      x: rect.x + 2,
      y,
      text: fitText(metaChips.join(" | "), innerWidth),
      styleId: "textBright"
    }];
  }

  let remainingWidth = innerWidth;
  const segments = [];
  if (metaChips.length) {
    const metaText = fitText(metaChips.join(" | "), remainingWidth);
    segments.push({
      text: metaText,
      styleId: "textBright"
    });
    remainingWidth -= metaText.length;
    if (remainingWidth > 0) {
      segments.push({
        text: " ",
        styleId: "chipMuted"
      });
      remainingWidth -= 1;
    }
  }

  const selectedIndex = currentTopCursor(state);
  for (let index = 0; index < navigationChips.length; index += 1) {
    const token = `[${String(navigationChips[index] ?? "")}]`;
    if (token.length > remainingWidth) break;
    const active = index === selectedIndex;
    segments.push({
      text: token,
      styleId: active ? (focused ? "chipActiveFocused" : "chipActivePassive") : (focused ? "chipFocused" : "chipPassive")
    });
    remainingWidth -= token.length;
    if (index < navigationChips.length - 1 && remainingWidth > 0) {
      segments.push({
        text: " ",
        styleId: focused ? "chipFocused" : "chipPassive"
      });
      remainingWidth -= 1;
    }
  }

  return segments.length
    ? [{
      x: rect.x + 2,
      y,
      segments,
      styleId: "textBright"
    }]
    : [];
}

function topNavigationHitBoxes(rect, state, focused = false) {
  const innerWidth = Math.max(1, rect.width - 4);
  const metaChips = buildMetaChips(state);
  const navigationChips = topNavigationLabels(state);
  if (!navigationChips.length) return [];
  let x = rect.x + 2;
  let remainingWidth = innerWidth;
  if (metaChips.length) {
    const metaText = fitText(metaChips.join(" | "), remainingWidth);
    x += metaText.length;
    remainingWidth -= metaText.length;
    if (remainingWidth > 0) {
      x += 1;
      remainingWidth -= 1;
    }
  }
  const boxes = [];
  for (let index = 0; index < navigationChips.length; index += 1) {
    const token = `[${String(navigationChips[index] ?? "")}]`;
    if (token.length > remainingWidth) break;
    boxes.push({
      index,
      x,
      y: rect.y + 1,
      width: token.length,
      focused
    });
    x += token.length;
    remainingWidth -= token.length;
    if (index < navigationChips.length - 1 && remainingWidth > 0) {
      x += 1;
      remainingWidth -= 1;
    }
  }
  return boxes;
}

function leftPaneVisibleRows(rect, state) {
  const pane = leftPaneModel(state);
  const rows = Array.isArray(pane.rows) ? pane.rows : [];
  const innerHeight = Math.max(1, rect.height - 2);
  const columns = Array.isArray(pane.columns) ? pane.columns.filter(Boolean) : [];
  const headerText = pane.paging
    ? `${pane.header || ""} :: ${pane.paging.start}-${pane.paging.end}/${pane.paging.totalRows}`
    : optionalText(pane.header);
  let contentY = rect.y + 1;
  let remainingHeight = innerHeight;
  if (headerText && remainingHeight > 0) {
    contentY += 1;
    remainingHeight -= 1;
  }
  const tableMode = (pane.shape === "table" || pane.mode === "results") && columns.length > 0;
  if (tableMode && remainingHeight > 0) {
    contentY += 1;
    remainingHeight -= 1;
  }
  const visibleCount = Math.max(0, remainingHeight);
  const activeIndex = clamp(currentLeftCursor(state), 0, Math.max(0, rows.length - 1));
  const start = computeWindowStart(rows.length, Math.max(1, visibleCount || 1), activeIndex);
  return {
    start,
    visibleCount,
    contentY
  };
}

function leftPaneRowIndexAtCell(rect, state, cell) {
  const pane = leftPaneModel(state);
  const rows = Array.isArray(pane.rows) ? pane.rows : [];
  if (!rows.length) return null;
  const visible = leftPaneVisibleRows(rect, state);
  if (cell.y < visible.contentY || cell.y >= visible.contentY + visible.visibleCount) return null;
  const index = visible.start + (cell.y - visible.contentY);
  return index >= 0 && index < rows.length ? index : null;
}

function rightPaneRowIndexAtCell(rect, state, cell) {
  const rows = rightPaneRows(state);
  if (!rows.length) return null;
  const innerHeight = Math.max(1, rect.height - 2);
  const maxRowLines = Math.min(Math.max(1, innerHeight - 2), rows.length);
  const rowStartY = rect.y + 2;
  if (cell.y < rowStartY || cell.y >= rowStartY + maxRowLines) return null;
  const index = cell.y - rowStartY;
  return index >= 0 && index < rows.length ? index : null;
}

function commandSurfaceOrnaments(rect, state) {
  const innerWidth = Math.max(1, rect.width - 4);
  return [{
    x: rect.x + 2,
    y: rect.y + 1,
    text: fitText(commandBarText(state), innerWidth),
    styleId: "textAccent"
  }, {
    x: rect.x + 2,
    y: rect.y + 2,
    text: fitText(commandBarHintText(state), innerWidth),
    styleId: "textMuted"
  }];
}

function rightPaneTextScene(rect, surface, state, focused) {
  const metrics = rightPaneReaderMetrics(rect, state);
  const scroll = rightPaneReaderScroll(state);
  const scrollX = clamp(scroll.x, 0, metrics.maxScrollX);
  const scrollY = clamp(scroll.y, 0, metrics.maxScrollY);
  const lines = metrics.lines;
  const rightRows = metrics.rows;
  const entries = [];
  if (rightRows.length) {
    const maxRowLines = Math.min(Math.max(1, metrics.innerHeight - 2), rightRows.length);
    const visibleRows = rightRows.slice(0, maxRowLines);
    visibleRows.forEach((row, index) => {
      const active = focused && index === currentRightCursor(state);
      entries.push({
        x: rect.x + 2,
        y: rect.y + 1 + 1 + index,
        text: fitText(`${row.label} ${row.detail}`.trim(), metrics.innerWidth),
        styleId: active ? "rowSelectedFocused" : "rowSelected"
      });
    });
  }
  const visible = lines.slice(scrollY, scrollY + metrics.visibleLineCount);
  visible.forEach((line, index) => {
    entries.push({
      x: rect.x + 2,
      y: rect.y + 1 + metrics.rowOffset + index,
      text: fitText(String(line).slice(scrollX), metrics.innerWidth),
      styleId: "rowDetail"
    });
  });
  return entries;
}

function overlayTextScene(overlayRects, state) {
  return overlayRects.flatMap(({ rect, surface, id }) => {
    const overlayModel = overlaySnapshotModelById(state, id, surface);
    const interaction = overlayInteractionModel(state, id, surface);
    const lines = Array.isArray(overlayModel?.visibleLines)
      ? overlayModel.visibleLines
      : overlayLines(state, id, surface);
    const bodyInsetX = Math.max(0, Number(overlayModel?.bodyInsetX ?? 2) || 0);
    const bodyInsetY = Math.max(0, Number(overlayModel?.bodyInsetY ?? 1) || 0);
    return lines.map((line, index) => {
      return {
        x: rect.x + bodyInsetX,
        y: rect.y + bodyInsetY + index,
        text: String(line ?? ""),
        styleId: interaction.family === "menu"
          ? (index === Number(overlayModel?.activeItemIndex ?? -1) ? "overlayMenuSelected" : "overlayMenu")
          : "overlayHelp"
      };
    });
  });
}

function overlayFillScene(overlayRects) {
  return overlayRects.map(({ rect }) => ({
    styleId: "overlay",
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  }));
}

function interiorRect(rect) {
  const width = Math.max(0, rect.width - 2);
  const height = Math.max(0, rect.height - 2);
  return {
    x: rect.x + 1,
    y: rect.y + 1,
    width,
    height
  };
}

function paneFillScene(layout, focusedSurfaceId, surfaceIds) {
  return [
    { id: surfaceIds.top, rect: interiorRect(layout.top), styleId: focusedSurfaceId === surfaceIds.top ? "primary" : "passive" },
    { id: surfaceIds.left, rect: interiorRect(layout.left), styleId: focusedSurfaceId === surfaceIds.left ? "primary" : "container" },
    { id: surfaceIds.right, rect: interiorRect(layout.right), styleId: focusedSurfaceId === surfaceIds.right ? "primary" : "passive" },
    { id: surfaceIds.bottom, rect: interiorRect(layout.bottom), styleId: focusedSurfaceId === surfaceIds.bottom ? "primary" : "passive" }
  ]
    .filter(entry => entry.rect.width > 0 && entry.rect.height > 0)
    .map(entry => ({
      id: entry.id,
      styleId: entry.styleId,
      x: entry.rect.x,
      y: entry.rect.y,
      width: entry.rect.width,
      height: entry.rect.height
    }));
}

function paintFillScene(buffer, entries = []) {
  for (const entry of entries) {
    fillRect(buffer, entry.x, entry.y, entry.width, entry.height, fillStyleById(entry.styleId));
  }
}

function paintTextScene(buffer, entries = []) {
  for (const entry of entries) {
    drawText(buffer, entry.x, entry.y, entry.text, entry.style || textStyleById(entry.styleId || "textBright"));
  }
}

export function composeViewportToBuffer(model, runtimeState) {
  const layout = layoutViewport(model, runtimeState);
  const buffer = clearCellBuffer(createCellBuffer(layout.viewport.size.width, layout.viewport.size.height));
  const topSurface = model.surfaceById.get(layout.viewport.top.surfaceId);
  const leftSurface = model.surfaceById.get(layout.viewport.center.leftSurfaceId);
  const rightSurface = model.surfaceById.get(layout.viewport.center.rightSurfaceId);
  const bottomSurface = model.surfaceById.get(layout.viewport.bottom.surfaceId);

  const focusedSurfaceId = currentFocusedSurfaceId(runtimeState);
  const overlayRects = activeOverlayIds(runtimeState).flatMap(overlayId => {
    const surface = model.surfaceById.get(overlayId);
    if (!surface) return [];
    const overlayModel = overlaySnapshotModelById(runtimeState, overlayId, surface);
    const overlayWidth = Number(overlayModel?.width ?? surface.width ?? 0) || 0;
    const overlayHeight = Number(overlayModel?.height ?? surface.height ?? 0) || 0;
    const overlayMarginX = Math.max(0, Number(overlayModel?.marginX ?? 2) || 0);
    const overlayMarginY = Math.max(0, Number(overlayModel?.marginY ?? 1) || 0);
    if (overlayWidth <= 0 || overlayHeight <= 0) return [];
    return [{
      id: overlayId,
      surface,
      rect: centeredRect(
        layout.bounds,
        Math.min(overlayWidth, Math.max(1, layout.bounds.width - (overlayMarginX * 2))),
        Math.min(overlayHeight, Math.max(1, layout.bounds.height - (overlayMarginY * 2))),
        overlayMarginX,
        overlayMarginY
      )
    }];
  });
  const frameGraph = buildViewportFrameGraph({
    layout,
    paneFrames: [
      { rect: layout.top, styleId: focusedSurfaceId === topSurface.id ? "primary" : "passive" },
      { rect: layout.left, styleId: focusedSurfaceId === leftSurface.id ? "primary" : "container" },
      { rect: layout.right, styleId: focusedSurfaceId === rightSurface.id ? "primary" : "passive" },
      { rect: layout.bottom, styleId: focusedSurfaceId === bottomSurface.id ? "primary" : "passive" }
    ],
    separators: [
      { rect: layout.handles.vertical, axis: "vertical", styleId: "separator" },
      { rect: layout.handles.top, axis: "horizontal", styleId: "separator" },
      { rect: layout.handles.bottom, axis: "horizontal", styleId: "separator" }
    ],
    ornaments: [
      frameTitleText(layout.top, optionalText(runtimeState.snapshot?.topPane?.frameTitle || topSurface.title), focusedSurfaceId === topSurface.id),
      frameTitleText(layout.left, leftPaneModel(runtimeState).title || leftSurface.title, focusedSurfaceId === leftSurface.id),
      frameTitleText(layout.right, optionalText(runtimeState.snapshot?.rightPane?.title || rightSurface.title), focusedSurfaceId === rightSurface.id),
      frameTitleText(layout.bottom, optionalText(runtimeState.snapshot?.bottomPane?.frameTitle || bottomSurface.title), focusedSurfaceId === bottomSurface.id),
      ...topStatusOrnaments(layout.top, runtimeState, focusedSurfaceId === topSurface.id),
      ...leftPaneOrnaments(layout.left, leftPaneModel(runtimeState)),
      ...(
        optionalText(runtimeState.snapshot?.rightPane?.frameStatus)
          ? [frameStatusText(
              layout.right,
              optionalText(runtimeState.snapshot?.rightPane?.frameStatus),
              focusedSurfaceId === rightSurface.id
            )]
          : []
      ),
      ...rightPaneSectionOrnaments(layout.right, runtimeState),
      ...commandSurfaceOrnaments(layout.bottom, runtimeState),
      ...overlayRects.map(overlay => overlayTitleText(overlay.rect, overlay, runtimeState))
    ],
    overlays: overlayRects.map(overlay => ({ rect: overlay.rect, styleId: "overlay" }))
  });
  const baseTextScene = [
    ...leftPaneTextScene(layout.left, leftSurface, runtimeState, focusedSurfaceId === leftSurface.id),
    ...rightPaneTextScene(layout.right, rightSurface, runtimeState, focusedSurfaceId === rightSurface.id)
  ];
  const baseFillScene = paneFillScene(layout, focusedSurfaceId, {
    top: topSurface.id,
    left: leftSurface.id,
    right: rightSurface.id,
    bottom: bottomSurface.id
  });
  const overlayFillEntries = overlayFillScene(overlayRects);
  const overlayScene = overlayTextScene(overlayRects, runtimeState);
  paintFillScene(buffer, baseFillScene);
  paintViewportFrameGraph(buffer, frameGraph, { layerIds: ["base"] });
  paintTextScene(buffer, baseTextScene);
  paintFillScene(buffer, overlayFillEntries);
  paintTextScene(buffer, overlayScene);
  paintViewportFrameGraph(buffer, frameGraph, { layerIds: ["overlay"] });

  return {
    buffer,
    layout,
    frameGraph,
    overlayRects,
    fillScene: { base: baseFillScene, overlay: overlayFillEntries },
    textScene: { base: baseTextScene, overlay: overlayScene }
  };
}

function buildGlyphAtlasCacheKey(buffer, cellSize, themeInfo = null) {
  return `${optionalText(themeInfo?.mode || "ansi16")}:${optionalText(themeInfo?.palette || "terminal-dark")}:${cellSize}:${collectGlyphCodepoints(buffer).join(",")}`;
}

function renderFallbackGlyph(context, codepoint, fg, x, y, cellSize, palette = ANSI16_PALETTE) {
  context.fillStyle = palette[fg] || palette[7];
  context.fillText(String.fromCodePoint(codepoint || 32), x, y);
}

function renderBufferToCanvas(canvas, buffer, cache, scaleHint = null, themeInfo = null) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const palette = resolveCanvasPaletteForTheme(themeInfo);
  const cssWidth = canvas.clientWidth || window.innerWidth || 1280;
  const cssHeight = canvas.clientHeight || window.innerHeight || 900;
  const metrics = resolveCanvasCellMetrics({
    cssWidth,
    cssHeight,
    gridWidth: buffer.width,
    gridHeight: buffer.height,
    scaleHint
  });
  canvas.width = metrics.width;
  canvas.height = metrics.height;
  context.imageSmoothingEnabled = false;
  context.fillStyle = palette[0];
  context.fillRect(0, 0, metrics.width, metrics.height);
  context.font = `${metrics.cellSize}px ${DEFAULT_GLYPH_FONT_FAMILY}`;
  context.textBaseline = "top";

  const glyphAtlasKey = buildGlyphAtlasCacheKey(buffer, metrics.cellSize, themeInfo);
  let glyphAtlas = cache.get(glyphAtlasKey);
  if (!glyphAtlas && typeof document !== "undefined") {
    glyphAtlas = createGlyphAtlas({
      document,
      glyphCodepoints: collectGlyphCodepoints(buffer),
      cellSize: metrics.cellSize,
      palette
    });
    if (glyphAtlas) cache.set(glyphAtlasKey, glyphAtlas);
  }

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const index = (y * buffer.width) + x;
      const drawX = x * metrics.cellSize;
      const drawY = y * metrics.cellSize;
      const bg = palette[buffer.bg[index]];
      if (bg && buffer.bg[index] !== 0) {
        context.fillStyle = bg;
        context.fillRect(drawX, drawY, metrics.cellSize, metrics.cellSize);
      }
      const codepoint = buffer.glyphs[index] || 32;
      if (codepoint === 32) continue;
      const drewFromAtlas = glyphAtlas?.draw(context, codepoint, buffer.fg[index], drawX, drawY) || false;
      if (!drewFromAtlas) renderFallbackGlyph(context, codepoint, buffer.fg[index], drawX, drawY, metrics.cellSize, palette);
    }
  }
}

function pointToCell(canvas, layout, event) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * layout.bounds.width);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * layout.bounds.height);
  return { x, y };
}

export function createOperatorBrowserRuntime({
  canvas,
  model,
  initialState,
  liveApi = null,
  fallbackPolicy = "read-only-fixture",
  windowTarget = globalThis.window
}) {
  const runtimeState = structuredClone(initialState);
  runtimeState.hostMode = optionalText(runtimeState.hostMode || (liveApi ? "live" : "fixture-readonly"));
  const glyphAtlasCache = new Map();
  let dragHandle = null;
  let composed = composeViewportToBuffer(model, runtimeState);

  function hasLiveIntentBridge() {
    return !!(liveApi && typeof liveApi.dispatchIntent === "function");
  }

  function isReadOnlyFixtureMode() {
    return !hasLiveIntentBridge() && fallbackPolicy === "read-only-fixture";
  }

  function render() {
    composed = composeViewportToBuffer(model, runtimeState);
    renderBufferToCanvas(canvas, composed.buffer, glyphAtlasCache, null, resolveViewportThemeInfo(runtimeState, model));
  }

  function replaceRuntimeState(nextState) {
    for (const key of Object.keys(runtimeState)) delete runtimeState[key];
    Object.assign(runtimeState, nextState);
  }

  function setSnapshotOpenOverlayIds(nextOverlayIds = []) {
    if (!runtimeState.snapshot || typeof runtimeState.snapshot !== "object") {
      runtimeState.snapshot = {};
    }
    if (!runtimeState.snapshot.ui || typeof runtimeState.snapshot.ui !== "object") {
      runtimeState.snapshot.ui = {};
    }
    const overlayIds = [...new Set(
      (Array.isArray(nextOverlayIds) ? nextOverlayIds : [])
        .map(id => String(id ?? "").trim())
        .filter(Boolean)
    )];
    runtimeState.snapshot.ui.openOverlayIds = overlayIds;
    runtimeState.snapshot.ui.activeOverlayId = overlayIds.at(-1) ?? null;
    runtimeState.snapshot.ui.helpOpen = overlayIds.includes("help_overlay");
    runtimeState.snapshot.ui.contextMenuOpen = overlayIds.includes("context_menu");
    if (!runtimeState.snapshot.ui.contextMenuOpen) {
      runtimeState.snapshot.ui.contextMenuContext = null;
    }
  }

  async function setActiveOverlay(overlayId) {
    const resolvedOverlayId = optionalText(overlayId);
    if (!resolvedOverlayId) return false;
    if (hasLiveIntentBridge()) {
      return dispatchLiveIntent({ type: "set-active-overlay", overlayId: resolvedOverlayId });
    }
    const overlayIds = activeOverlayIds(runtimeState);
    if (!overlayIds.includes(resolvedOverlayId)) return false;
    const nextOverlayIds = overlayIds.filter(id => id !== resolvedOverlayId);
    nextOverlayIds.push(resolvedOverlayId);
    setSnapshotOpenOverlayIds(nextOverlayIds);
    render();
    return true;
  }

  async function moveActiveOverlayFocus(direction = "next") {
    if (hasLiveIntentBridge()) {
      return dispatchLiveIntent({ type: "move-active-overlay-focus", direction });
    }
    const overlayIds = activeOverlayIds(runtimeState);
    if (!overlayIds.length) return false;
    if (overlayIds.length === 1) return true;
    const activeId = activeOverlayId(runtimeState) ?? overlayIds.at(-1);
    const currentIndex = Math.max(0, overlayIds.indexOf(activeId));
    const delta = direction === "prev" ? -1 : 1;
    const nextIndex = (currentIndex + delta + overlayIds.length) % overlayIds.length;
    return setActiveOverlay(overlayIds[nextIndex]);
  }

  function applyWorkbenchSnapshot(snapshot = {}) {
    const adapted = createOperatorBrowserStateFromWorkbenchSnapshot(snapshot);
    replaceRuntimeState({
      ...adapted,
      hostMode: runtimeState.hostMode || (hasLiveIntentBridge() ? "live" : "fixture-readonly"),
      hostViewportLayoutDraft: null
    });
  }

  function liveSnapshotFromResponse(response = null) {
    if (!response || typeof response !== "object") return null;
    if (response.snapshot && typeof response.snapshot === "object") return response.snapshot;
    if (response.leftPane && typeof response.leftPane === "object") return response;
    return null;
  }

  async function dispatchLiveIntent(intent = {}) {
    if (!hasLiveIntentBridge()) return false;
    const response = await liveApi.dispatchIntent(intent);
    const snapshot = liveSnapshotFromResponse(response);
    if (!snapshot) return false;
    applyWorkbenchSnapshot(snapshot);
    render();
    return true;
  }

  async function setFocusedPane(pane) {
    return dispatchLiveIntent({ type: "set-focused-pane", pane });
  }

  async function dispatchRightSectionIntent(intent = {}) {
    if (currentFocusedPane(runtimeState) !== "right") return false;
    return dispatchLiveIntent(intent);
  }

  function toggleOverlay(surfaceId, { closeIds = [] } = {}) {
    const overlayIds = activeOverlayIds(runtimeState);
    if (overlayIds.includes(surfaceId)) {
      setSnapshotOpenOverlayIds(overlayIds.filter(id => id !== surfaceId));
      render();
      return;
    }
    const closeSet = new Set((Array.isArray(closeIds) ? closeIds : []).map(id => String(id ?? "").trim()).filter(Boolean));
    const nextOverlayIds = overlayIds.filter(id => id !== surfaceId && !closeSet.has(id));
    nextOverlayIds.push(surfaceId);
    setSnapshotOpenOverlayIds(nextOverlayIds);
    render();
  }

  function selectedLeftRowContext() {
    const pane = leftPaneModel(runtimeState);
    const rowIndex = clamp(currentLeftCursor(runtimeState), 0, Math.max(0, (pane.rows?.length ?? 0) - 1));
    const row = pane.rows?.[rowIndex] ?? null;
    return {
      pane: "left",
      rowIndex,
      rowType: optionalText(row?.type || ""),
      rowLabel: optionalText(row?.label || ""),
      targetId: optionalText(row?.record?.id || row?.id || row?.targetId || ""),
      primaryCommand: optionalText(row?.primaryAction?.command || "")
    };
  }

  function selectedRightRowContext() {
    const rows = rightPaneRows(runtimeState);
    const rowIndex = clamp(currentRightCursor(runtimeState), 0, Math.max(0, rows.length - 1));
    const row = rows[rowIndex] ?? null;
    return {
      pane: "right",
      rowIndex,
      rowLabel: optionalText(row?.label || ""),
      actionKind: optionalText(row?.actionKind || ""),
      uri: optionalText(row?.uri || ""),
      screenId: optionalText(runtimeState.snapshot?.rightPane?.activeScreenId || runtimeState.snapshot?.screens?.activeScreenId || ""),
      sectionId: optionalText(runtimeState.snapshot?.rightPane?.activeSection?.id || "")
    };
  }

  function selectedTopChipContext() {
    const chips = Array.isArray(runtimeState.snapshot?.topPane?.navigation?.chips)
      ? runtimeState.snapshot.topPane.navigation.chips
      : [];
    const index = clamp(currentTopCursor(runtimeState), 0, Math.max(0, chips.length - 1));
    const chip = chips[index] ?? null;
    return {
      pane: "top",
      chipIndex: index,
      chipType: optionalText(chip?.type || ""),
      chipLabel: optionalText(chip?.label || "")
    };
  }

  function selectedBottomContext() {
    return {
      pane: "bottom",
      commandText: optionalText(commandBarText(runtimeState))
    };
  }

  function contextMenuContextForPane(pane) {
    if (pane === "top") return selectedTopChipContext();
    if (pane === "right") return selectedRightRowContext();
    if (pane === "bottom") return selectedBottomContext();
    return selectedLeftRowContext();
  }

  async function openContextMenu(context = null) {
    if (hasLiveIntentBridge()) {
      return dispatchLiveIntent({
        type: "open-context-menu",
        context: context && typeof context === "object" ? context : contextMenuContextForPane(currentFocusedPane(runtimeState))
      });
    }
    if (isReadOnlyFixtureMode()) {
      runtimeState.snapshot.ui.contextMenuContext = context && typeof context === "object"
        ? structuredClone(context)
        : contextMenuContextForPane(currentFocusedPane(runtimeState));
      toggleOverlay("context_menu", { closeIds: overlayCloseIdsForOpen(runtimeState, "context_menu", model.surfaceById.get("context_menu")) });
      return true;
    }
    return false;
  }

  async function triggerBinding(trigger, verb) {
    const viewport = model.viewportById.get(runtimeState.viewportId || "default");
    const binding = viewport ? findBinding(viewport, trigger, verb) : null;
    if (!binding) return false;
    if (binding.verb === "overlay" && binding.target) {
      if (binding.target === "context_menu") {
        return openContextMenu();
      }
      if (hasLiveIntentBridge()) {
        return dispatchLiveIntent({ type: "toggle-overlay", overlayId: binding.target });
      }
      toggleOverlay(binding.target, { closeIds: overlayCloseIdsForOpen(runtimeState, binding.target, model.surfaceById.get(binding.target)) });
      return true;
    }
    return false;
  }

  async function triggerScreenShortcut(shortcut) {
    if (!hasLiveIntentBridge()) return false;
    const normalized = optionalText(shortcut).toUpperCase();
    if (!normalized) return false;
    const available = Array.isArray(runtimeState.snapshot?.screens?.shortcuts)
      ? runtimeState.snapshot.screens.shortcuts
      : [];
    if (!available.some(row => optionalText(row?.shortcut).toUpperCase() === normalized)) return false;
    return dispatchLiveIntent({ type: "activate-screen-shortcut", shortcut: normalized });
  }

  async function appendNumberBufferDigit(digit) {
    if (!hasLiveIntentBridge()) return false;
    const normalized = optionalText(digit);
    if (!/^\d$/u.test(normalized)) return false;
    return dispatchLiveIntent({ type: "append-digit", digit: normalized });
  }

  async function clearNumberBuffer() {
    if (!hasLiveIntentBridge()) return false;
    if (!optionalText(runtimeState.snapshot?.ui?.numberBuffer)) return false;
    return dispatchLiveIntent({ type: "clear-number-buffer" });
  }

  async function activateContextMenuItem(index) {
    const itemIndex = Number(index);
    if (!Number.isFinite(itemIndex) || itemIndex < 0) return false;
    const items = activeContextMenuItems(runtimeState);
    if (itemIndex >= items.length) return false;
    if (!hasLiveIntentBridge()) {
      if (!isReadOnlyFixtureMode()) return false;
      const item = items[itemIndex];
      const nextOverlayIds = activeOverlayIds(runtimeState).filter(overlayId => overlayId !== "context_menu");
      setSnapshotOpenOverlayIds(nextOverlayIds);
      runtimeState.snapshot.ui.lastOutput = item?.enabled === false
        ? `${item?.label || "menu item"} is disabled.`
        : `menu action requested: ${item?.action?.hook || item?.id || "item"}${item?.action?.subject ? ` :: ${item.action.subject}` : ""}`;
      runtimeState.snapshot.ui.lastStatus = item?.enabled === false ? "error" : "info";
      render();
      return true;
    }
    return dispatchLiveIntent({ type: "activate-context-menu-item", index: itemIndex });
  }

  async function moveActiveOverlayCursor(direction) {
    if (hasLiveIntentBridge()) {
      return dispatchLiveIntent({ type: "move-active-overlay-cursor", direction });
    }
    const overlayId = activeOverlayId(runtimeState);
    const interaction = overlayInteractionModel(runtimeState, overlayId);
    if (interaction?.cursorMode !== "items") return false;
    const items = overlayItems(runtimeState, overlayId);
    if (!items.length) return false;
    const overlayStateById = runtimeState.snapshot?.ui?.overlayStateById && typeof runtimeState.snapshot.ui.overlayStateById === "object"
      ? runtimeState.snapshot.ui.overlayStateById
      : (runtimeState.snapshot.ui.overlayStateById = {});
    const overlayState = overlayStateById[overlayId] && typeof overlayStateById[overlayId] === "object"
      ? overlayStateById[overlayId]
      : (overlayStateById[overlayId] = {});
    const limit = Math.max(0, items.length - 1);
    let index = clamp(Number(overlayState.activeItemIndex ?? overlaySnapshotModelById(runtimeState, overlayId)?.activeItemIndex ?? 0) || 0, 0, limit);
    if (direction === "up") index = clamp(index - 1, 0, limit);
    if (direction === "down") index = clamp(index + 1, 0, limit);
    if (direction === "home") index = 0;
    if (direction === "end") index = limit;
    overlayState.activeItemIndex = index;
    updateOverlaySnapshotModel(runtimeState, overlayId, { activeItemIndex: index });
    render();
    return true;
  }

  async function activateActiveOverlay() {
    if (hasLiveIntentBridge()) {
      return dispatchLiveIntent({ type: "activate-active-overlay" });
    }
    const overlayId = activeOverlayId(runtimeState);
    const interaction = overlayInteractionModel(runtimeState, overlayId);
    if (interaction?.activationMode !== "item") return false;
    const index = Number(
      runtimeState.snapshot?.ui?.overlayStateById?.[overlayId]?.activeItemIndex
      ?? overlaySnapshotModelById(runtimeState, overlayId)?.activeItemIndex
      ?? 0
    ) || 0;
    return activateContextMenuItem(index);
  }

  async function moveActiveOverlayScroll(direction) {
    if (hasLiveIntentBridge()) {
      return dispatchLiveIntent({ type: "move-active-overlay-scroll", direction });
    }
    const overlayId = activeOverlayId(runtimeState);
    if (!overlayId) return false;
    const overlayRows = Array.isArray(runtimeState.snapshot?.overlays) ? runtimeState.snapshot.overlays : [];
    const overlayModel = overlayRows.find(entry => entry?.id === overlayId) ?? null;
    if (!overlayModel) return false;
    const interaction = overlayInteractionModel(runtimeState, overlayId, overlayModel);
    if (interaction?.scrollMode === "none") return false;
    const overlayStateById = runtimeState.snapshot?.ui?.overlayStateById && typeof runtimeState.snapshot.ui.overlayStateById === "object"
      ? runtimeState.snapshot.ui.overlayStateById
      : (runtimeState.snapshot.ui.overlayStateById = {});
    const overlayState = overlayStateById[overlayId] && typeof overlayStateById[overlayId] === "object"
      ? overlayStateById[overlayId]
      : (overlayStateById[overlayId] = {});
    const lines = Array.isArray(overlayModel.lines) ? overlayModel.lines.map(line => String(line ?? "")) : [];
    const limitX = Math.max(0, lines.reduce((maxWidth, line) => Math.max(maxWidth, line.length), 0) - (Number(overlayModel.contentWidth ?? 0) || 0));
    const limitY = Math.max(0, (Number(overlayModel.lineCount ?? 0) || 0) - (Number(overlayModel.contentHeight ?? 0) || 0));
    let scrollX = clamp(Number(overlayState.scrollX ?? overlayModel.scrollX ?? 0) || 0, 0, limitX);
    let scrollY = clamp(Number(overlayState.scrollY ?? overlayModel.scrollY ?? 0) || 0, 0, limitY);
    if (direction === "left") scrollX = clamp(scrollX - 1, 0, limitX);
    if (direction === "right") scrollX = clamp(scrollX + 1, 0, limitX);
    if (direction === "up") scrollY = clamp(scrollY - 1, 0, limitY);
    if (direction === "down") scrollY = clamp(scrollY + 1, 0, limitY);
    if (direction === "page-up") scrollY = clamp(scrollY - Math.max(1, Number(overlayModel.contentHeight ?? 1) || 1), 0, limitY);
    if (direction === "page-down") scrollY = clamp(scrollY + Math.max(1, Number(overlayModel.contentHeight ?? 1) || 1), 0, limitY);
    if (direction === "home") scrollY = 0;
    if (direction === "end") scrollY = limitY;
    overlayState.scrollX = scrollX;
    overlayState.scrollY = scrollY;
    updateOverlaySnapshotModel(runtimeState, overlayId, { scrollX, scrollY });
    render();
    return true;
  }

  async function moveReaderScroll({
    surfaceId = rightPaneReaderSurfaceId(runtimeState),
    deltaX = 0,
    deltaY = 0,
    setX,
    setY
  } = {}) {
    const resolvedSurfaceId = optionalText(surfaceId) || rightPaneReaderSurfaceId(runtimeState);
    if (!resolvedSurfaceId) return false;
    if (hasLiveIntentBridge()) {
      return dispatchLiveIntent({
        type: "move-reader-scroll",
        surfaceId: resolvedSurfaceId,
        deltaX,
        deltaY,
        ...(setX !== undefined ? { setX } : {}),
        ...(setY !== undefined ? { setY } : {})
      });
    }
    const rect = composed?.layout?.right ?? null;
    if (!rect || !runtimeState.snapshot || typeof runtimeState.snapshot !== "object") return false;
    if (!runtimeState.snapshot.ui || typeof runtimeState.snapshot.ui !== "object") {
      runtimeState.snapshot.ui = {};
    }
    if (!runtimeState.snapshot.ui.readerStateBySurfaceId || typeof runtimeState.snapshot.ui.readerStateBySurfaceId !== "object") {
      runtimeState.snapshot.ui.readerStateBySurfaceId = {};
    }
    const readerState = runtimeState.snapshot.ui.readerStateBySurfaceId[resolvedSurfaceId]
      && typeof runtimeState.snapshot.ui.readerStateBySurfaceId[resolvedSurfaceId] === "object"
      ? runtimeState.snapshot.ui.readerStateBySurfaceId[resolvedSurfaceId]
      : (runtimeState.snapshot.ui.readerStateBySurfaceId[resolvedSurfaceId] = {});
    const metrics = rightPaneReaderMetrics(rect, runtimeState);
    let x = clamp(Number(readerState.x ?? runtimeState.snapshot?.rightPane?.readerScroll?.x ?? 0) || 0, 0, metrics.maxScrollX);
    let y = clamp(Number(readerState.y ?? runtimeState.snapshot?.rightPane?.readerScroll?.y ?? 0) || 0, 0, metrics.maxScrollY);
    x = setX !== undefined ? clamp(Number(setX) || 0, 0, metrics.maxScrollX) : clamp(x + (Number(deltaX) || 0), 0, metrics.maxScrollX);
    y = setY !== undefined ? clamp(Number(setY) || 0, 0, metrics.maxScrollY) : clamp(y + (Number(deltaY) || 0), 0, metrics.maxScrollY);
    readerState.x = x;
    readerState.y = y;
    if (runtimeState.snapshot?.rightPane?.surfaceId === resolvedSurfaceId && runtimeState.snapshot.rightPane) {
      runtimeState.snapshot.rightPane.readerScroll = { x, y };
    }
    render();
    return true;
  }

  async function setTopCursor(index) {
    if (!hasLiveIntentBridge()) return false;
    return dispatchLiveIntent({ type: "set-top-cursor", index });
  }

  async function setLeftCursor(index) {
    if (!hasLiveIntentBridge()) return false;
    return dispatchLiveIntent({ type: "set-left-cursor", index });
  }

  async function setRightCursor(index) {
    if (!hasLiveIntentBridge()) return false;
    return dispatchLiveIntent({ type: "set-right-cursor", index });
  }

  function pointInsideRect(cell, rect) {
    return cell.x >= rect.x
      && cell.x < (rect.x + rect.width)
      && cell.y >= rect.y
      && cell.y < (rect.y + rect.height);
  }

  function contextMenuItemIndexAtCell(cell) {
    if (!runtimeState.snapshot?.ui?.contextMenuOpen) return null;
    const menuOverlay = Array.isArray(composed.overlayRects)
      ? composed.overlayRects.find(entry => entry?.surface?.kind === "menu")
      : null;
    const rect = menuOverlay?.rect ?? null;
    if (!rect) return null;
    if (!pointInsideRect(cell, rect)) return null;
    const items = activeContextMenuItems(runtimeState);
    const overlayModel = overlaySnapshotModelById(runtimeState, "context_menu", menuOverlay?.surface);
    const bodyInsetY = Math.max(0, Number(overlayModel?.bodyInsetY ?? 1) || 0);
    const visibleLineCount = Math.max(
      0,
      Number(overlayModel?.visibleLineCount ?? items.length) || 0
    );
    const lineIndex = cell.y - (rect.y + bodyInsetY);
    return lineIndex >= 0 && lineIndex < Math.min(items.length, visibleLineCount) ? lineIndex : null;
  }

  function overlayIdAtCell(cell) {
    const overlays = Array.isArray(composed.overlayRects) ? composed.overlayRects : [];
    for (let index = overlays.length - 1; index >= 0; index -= 1) {
      const overlay = overlays[index];
      if (overlay?.rect && pointInsideRect(cell, overlay.rect)) {
        return optionalText(overlay.id) || null;
      }
    }
    return null;
  }

  async function focusAndSelectAtCell(cell) {
    if (pointInsideRect(cell, composed.layout.top)) {
      await setFocusedPane("top");
      const chip = topNavigationHitBoxes(composed.layout.top, runtimeState, true)
        .find(entry => cell.y === entry.y && cell.x >= entry.x && cell.x < entry.x + entry.width);
      if (chip && await setTopCursor(chip.index)) {
        return { pane: "top", activatable: true, kind: "navigation-chip", index: chip.index };
      }
      return { pane: "top", activatable: false };
    }
    if (pointInsideRect(cell, composed.layout.bottom)) {
      await setFocusedPane("bottom");
      return { pane: "bottom", activatable: false };
    }
    if (pointInsideRect(cell, composed.layout.left)) {
      await setFocusedPane("left");
      const rowIndex = leftPaneRowIndexAtCell(composed.layout.left, runtimeState, cell);
      if (rowIndex !== null && await setLeftCursor(rowIndex)) {
        return { pane: "left", activatable: true, kind: "row", index: rowIndex };
      }
      return { pane: "left", activatable: false };
    }
    await setFocusedPane("right");
    const rowIndex = rightPaneRowIndexAtCell(composed.layout.right, runtimeState, cell);
    if (rowIndex !== null && await setRightCursor(rowIndex)) {
      return { pane: "right", activatable: true, kind: "row", index: rowIndex };
    }
    return { pane: "right", activatable: false };
  }

  async function handleKey(event) {
    const focusIntent = ({
      ArrowUp: "top",
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowDown: "bottom"
    })[event.key];
    if (event.altKey && focusIntent) {
      event.preventDefault();
      await setFocusedPane(focusIntent);
      return;
    }
    if (await triggerBinding(event.key, "overlay")) {
      event.preventDefault();
      return;
    }
    if (/^F[2-8]$/u.test(optionalText(event.key))) {
      if (await triggerScreenShortcut(event.key)) {
        event.preventDefault();
        return;
      }
    }
    if (activeOverlayId(runtimeState) && event.key === "Tab") {
      event.preventDefault();
      await moveActiveOverlayFocus(event.shiftKey ? "prev" : "next");
      return;
    }
    if (runtimeState.snapshot?.ui?.contextMenuOpen && /^[1-9]$/u.test(optionalText(event.key))) {
      event.preventDefault();
      await activateContextMenuItem(Number(event.key) - 1);
      return;
    }
    const activeOverlay = activeOverlayId(runtimeState);
    const activeOverlayInteraction = activeOverlay ? overlayInteractionModel(runtimeState, activeOverlay) : null;
    if (activeOverlayInteraction?.cursorMode === "items" && ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      const direction = ({
        ArrowUp: "up",
        ArrowDown: "down",
        Home: "home",
        End: "end"
      })[event.key];
      event.preventDefault();
      await moveActiveOverlayCursor(direction);
      return;
    }
    if (activeOverlayInteraction?.activationMode === "item" && event.key === "Enter") {
      event.preventDefault();
      await activateActiveOverlay();
      return;
    }
    if (activeOverlay && activeOverlayInteraction?.scrollMode !== "none" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) {
      const direction = ({
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
        PageUp: "page-up",
        PageDown: "page-down",
        Home: "home",
        End: "end"
      })[event.key];
      event.preventDefault();
      await moveActiveOverlayScroll(direction);
      return;
    }
    if (currentFocusedPane(runtimeState) === "left" && /^\d$/u.test(optionalText(event.key))) {
      event.preventDefault();
      await appendNumberBufferDigit(event.key);
      return;
    }
    if (currentFocusedPane(runtimeState) === "left" && event.key === "Backspace") {
      if (await clearNumberBuffer()) {
        event.preventDefault();
        return;
      }
    }
    if (event.key === "Escape") {
      if (isReadOnlyFixtureMode() && activeOverlayIds(runtimeState).includes("context_menu")) {
        setSnapshotOpenOverlayIds(activeOverlayIds(runtimeState).filter(overlayId => overlayId !== "context_menu"));
        render();
        return;
      }
      if (await dispatchLiveIntent({ type: "escape" })) return;
      setSnapshotOpenOverlayIds([]);
      render();
      return;
    }
    const focusedPane = currentFocusedPane(runtimeState);
    if (focusedPane === "right" && event.key === "[") {
      event.preventDefault();
      await dispatchRightSectionIntent({ type: "move-right-section", direction: "prev" });
      return;
    }
    if (focusedPane === "right" && event.key === "]") {
      event.preventDefault();
      await dispatchRightSectionIntent({ type: "move-right-section", direction: "next" });
      return;
    }
    if (focusedPane === "right" && event.key === "-") {
      event.preventDefault();
      await dispatchRightSectionIntent({ type: "collapse-right-section" });
      return;
    }
    if (focusedPane === "right" && event.key === "=") {
      event.preventDefault();
      await dispatchRightSectionIntent({ type: "expand-right-section" });
      return;
    }
    const moveDirection = ({
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      Home: "home",
      End: "end",
      PageUp: "page-up",
      PageDown: "page-down"
    })[event.key];
    if (focusedPane === "top" && moveDirection) {
      event.preventDefault();
      await dispatchLiveIntent({ type: "move-cursor", direction: moveDirection });
      return;
    }
    if (focusedPane === "left" && moveDirection) {
      event.preventDefault();
      await dispatchLiveIntent({ type: "move-cursor", direction: moveDirection });
      return;
    }
    if (focusedPane === "right" && moveDirection && rightPaneRows(runtimeState).length > 0) {
      event.preventDefault();
      await dispatchLiveIntent({ type: "move-cursor", direction: moveDirection });
      return;
    }
    if ((focusedPane === "left" || focusedPane === "top" || (focusedPane === "right" && rightPaneRows(runtimeState).length > 0))
      && event.key === "Enter") {
      event.preventDefault();
      if (hasLiveIntentBridge()) await dispatchLiveIntent({ type: "activate-primary" });
      return;
    }
    if (currentFocusedSurfaceId(runtimeState) === rightPaneReaderSurfaceId(runtimeState)) {
      const metrics = rightPaneReaderMetrics(composed.layout.right, runtimeState);
      const currentScroll = rightPaneReaderScroll(runtimeState);
      if (event.key === "ArrowRight") {
        event.preventDefault();
        await moveReaderScroll({ deltaX: 1 });
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        await moveReaderScroll({ deltaX: -1 });
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        await moveReaderScroll({ deltaY: 1 });
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        await moveReaderScroll({ deltaY: -1 });
      } else if (event.key === "PageDown") {
        event.preventDefault();
        await moveReaderScroll({ deltaY: Math.max(1, metrics.visibleLineCount) });
      } else if (event.key === "PageUp") {
        event.preventDefault();
        await moveReaderScroll({ deltaY: -Math.max(1, metrics.visibleLineCount) });
      } else if (event.key === "Home") {
        event.preventDefault();
        if (event.ctrlKey) {
          await moveReaderScroll({ setX: 0, setY: 0 });
        } else if (event.shiftKey) {
          await moveReaderScroll({ setX: 0 });
        } else {
          await moveReaderScroll({ setY: 0 });
        }
      } else if (event.key === "End") {
        event.preventDefault();
        if (event.ctrlKey) {
          await moveReaderScroll({ setX: metrics.maxScrollX, setY: metrics.maxScrollY });
        } else if (event.shiftKey) {
          await moveReaderScroll({ setX: metrics.maxScrollX });
        } else {
          await moveReaderScroll({ setY: metrics.maxScrollY });
        }
      }
    }
  }

  async function handlePointerDown(event) {
    const cell = pointToCell(canvas, composed.layout, event);
    const contextMenuIndex = contextMenuItemIndexAtCell(cell);
    if (contextMenuIndex !== null) {
      await activateContextMenuItem(contextMenuIndex);
      return;
    }
    const overlayId = overlayIdAtCell(cell);
    if (overlayId) {
      await setActiveOverlay(overlayId);
      return;
    }
    const { handles } = composed.layout;
    if (cell.x === handles.vertical.x && cell.y >= handles.vertical.y && cell.y < handles.vertical.y + handles.vertical.height) {
      dragHandle = "vertical";
      return;
    }
    if (cell.y === handles.top.y) {
      dragHandle = "top";
      return;
    }
    if (cell.y === handles.bottom.y) {
      dragHandle = "bottom";
      return;
    }
    await focusAndSelectAtCell(cell);
  }

  function handlePointerMove(event) {
    if (!dragHandle) return;
    const cell = pointToCell(canvas, composed.layout, event);
    const currentLayout = resolvedViewportLayout(runtimeState, composed.layout.viewport);
    if (dragHandle === "vertical") {
      const leftWeight = clamp(Math.round((cell.x / composed.layout.bounds.width) * 100), 15, 85);
      runtimeState.hostViewportLayoutDraft = {
        ...currentLayout,
        leftWeight,
        rightWeight: 100 - leftWeight
      };
    } else if (dragHandle === "top") {
      runtimeState.hostViewportLayoutDraft = {
        ...currentLayout,
        top: clamp(cell.y + 1, 3, composed.layout.bounds.height - currentLayout.bottom - 6)
      };
    } else if (dragHandle === "bottom") {
      runtimeState.hostViewportLayoutDraft = {
        ...currentLayout,
        bottom: clamp(composed.layout.bounds.height - cell.y, 3, composed.layout.bounds.height - currentLayout.top - 6)
      };
    }
    render();
  }

  async function handlePointerUp() {
    const releasedHandle = dragHandle;
    dragHandle = null;
    if (!releasedHandle || !runtimeState.hostViewportLayoutDraft) return;
    if (isReadOnlyFixtureMode()) {
      runtimeState.hostViewportLayoutDraft = null;
      render();
      return;
    }
    const draft = structuredClone(runtimeState.hostViewportLayoutDraft);
    try {
      if (!(await dispatchLiveIntent({
        type: "set-viewport-layout",
        layout: draft,
        persistDisplaySettings: true
      }))) {
        runtimeState.hostViewportLayoutDraft = null;
        render();
      }
    } catch {
      runtimeState.hostViewportLayoutDraft = null;
      render();
    }
  }

  async function handleContextMenu(event) {
    event.preventDefault();
    const cell = pointToCell(canvas, composed.layout, event);
    const selection = await focusAndSelectAtCell(cell);
    const pane = selection?.pane || currentFocusedPane(runtimeState);
    await openContextMenu(contextMenuContextForPane(pane));
  }

  async function handleDoubleClick(event) {
    const cell = pointToCell(canvas, composed.layout, event);
    const selection = await focusAndSelectAtCell(cell);
    if (!selection?.activatable || !hasLiveIntentBridge()) return;
    await dispatchLiveIntent({ type: "activate-primary" });
  }

  async function handleWheel(event) {
    event.preventDefault();
    const hasPointer = Number.isFinite(Number(event.clientX)) && Number.isFinite(Number(event.clientY));
    if (hasPointer) {
      const cell = pointToCell(canvas, composed.layout, event);
      const overlayId = overlayIdAtCell(cell);
      if (overlayId) {
        await setActiveOverlay(overlayId);
        const interaction = overlayInteractionModel(runtimeState, overlayId);
        if (interaction?.cursorMode === "items") {
          await moveActiveOverlayCursor(event.deltaY > 0 ? "down" : "up");
          return;
        }
        if (interaction?.scrollMode !== "none") {
          await moveActiveOverlayScroll(event.shiftKey ? (event.deltaY > 0 ? "right" : "left") : (event.deltaY > 0 ? "down" : "up"));
          return;
        }
        return;
      }
    }
    if (event.shiftKey) {
      await moveReaderScroll({ deltaX: event.deltaY > 0 ? 1 : -1 });
    } else {
      await moveReaderScroll({ deltaY: event.deltaY > 0 ? 1 : -1 });
    }
  }

  function mount() {
    render();
    windowTarget.addEventListener("keydown", handleKey);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("dblclick", handleDoubleClick);
    windowTarget.addEventListener("pointermove", handlePointerMove);
    windowTarget.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("contextmenu", handleContextMenu);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    windowTarget.addEventListener("resize", render);
  }

  return {
    runtimeState,
    render,
    mount,
    compose: () => composeViewportToBuffer(model, runtimeState)
  };
}
