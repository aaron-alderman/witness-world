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
  paintViewportFrameGraph
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
  return optionalText(state.snapshot?.ui?.focusedPane || state.focusedPane || "left");
}

function currentFocusedSurfaceId(state = {}) {
  return focusedSurfaceIdForPane(currentFocusedPane(state));
}

function currentTopCursor(state = {}) {
  return Number(state.snapshot?.topPane?.navigation?.selectedIndex ?? state.topCursor ?? 0) || 0;
}

function currentLeftCursor(state = {}) {
  return Number(state.leftPane?.cursor ?? state.snapshot?.leftPane?.cursor ?? state.leftCursor ?? 0) || 0;
}

function currentRightCursor(state = {}) {
  return Number(state.snapshot?.rightPane?.cursor ?? state.rightCursor ?? 0) || 0;
}

function activeOverlayIds(state = {}) {
  const merged = new Set();
  if (Array.isArray(state.localUi?.overlayIds)) {
    for (const overlayId of state.localUi.overlayIds) merged.add(overlayId);
  }
  if (Array.isArray(state.overlays)) {
    for (const overlayId of state.overlays) merged.add(overlayId);
  }
  if (state.snapshot?.ui?.helpOpen) merged.add("help_overlay");
  return [...merged];
}

function buildMetaChips(state = {}) {
  const snapshot = state.snapshot || {};
  const viewportChip = snapshot?.viewport?.id ? `viewport:${snapshot.viewport.id}` : "viewport:default";
  const themeChip = snapshot?.viewport?.theme ? `theme:${snapshot.viewport.theme}` : "theme:ansi16";
  const focusChip = `surface:${currentFocusedSurfaceId(state)}`;
  return [viewportChip, themeChip, focusChip];
}

function topNavigationLabels(state = {}) {
  return Array.isArray(state.snapshot?.topPane?.navigation?.chips)
    ? state.snapshot.topPane.navigation.chips.map(chip => optionalText(chip?.label)).filter(Boolean)
    : [];
}

const HOST_CONTEXT_MENU_ITEMS = ["Edit", "Change Color", "Rename", "Clone"];

function commandBarText(state = {}) {
  const screenId = optionalText(state.snapshot?.rightPane?.activeScreenId || state.snapshot?.screens?.activeScreenId || "inspect");
  return `: screen ${screenId}`;
}

function commandBarHintText(state = {}) {
  if (state.hostMode === "fixture-readonly") {
    return "Fixture mode: read-only. Start the live core bridge for navigation and authored help.";
  }
  return "F1 help | Right click menu | Drag handles resize";
}

function helpOverlayLines(state = {}) {
  const rightTitle = optionalText(state.snapshot?.rightPane?.title || state.snapshot?.rightPane?.screen?.title || "Inspect");
  return [
    "F1 opens the authored help surface.",
    "Right click opens the centered context menu surface.",
    "Drag pane handles to resize the authored split layout.",
    `Active right pane: ${rightTitle}.`
  ];
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
  const bodyLines = Array.isArray(state.snapshot?.rightPane?.bodyLines)
    ? state.snapshot.rightPane.bodyLines.map(optionalText).filter(Boolean)
    : [];
  if (bodyLines.length) return bodyLines;
  const detailLines = Array.isArray(state.snapshot?.rightPane?.screen?.detailLines)
    ? state.snapshot.rightPane.screen.detailLines.map(optionalText).filter(Boolean)
    : [];
  return detailLines.length ? detailLines : ["No detail lines available."];
}

function makeRect(x, y, width, height) {
  return { x, y, width, height };
}

function centeredRect(bounds, width, height) {
  return makeRect(
    Math.max(bounds.x + 2, Math.floor(bounds.x + ((bounds.width - width) / 2))),
    Math.max(bounds.y + 1, Math.floor(bounds.y + ((bounds.height - height) / 2))),
    Math.min(width, bounds.width - 4),
    Math.min(height, bounds.height - 2)
  );
}

function findBinding(viewport, trigger, verb) {
  return viewport.bindings.find(binding => binding.trigger === trigger && binding.verb === verb) || null;
}

function resolvedViewportLayout(state = {}, viewport = {}) {
  const draft = state.viewportLayoutDraft && typeof state.viewportLayoutDraft === "object"
    ? state.viewportLayoutDraft
    : null;
  const committed = state.viewportLayout && typeof state.viewportLayout === "object"
    ? state.viewportLayout
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

function overlayTitleText(rect, surface) {
  return {
    layer: "overlay",
    x: rect.x + 2,
    y: rect.y,
    text: ` ${surface.title} `,
    style: {
      fg: 15,
      bg: 0,
      flags: CELL_FLAGS.overlay
    }
  };
}

function rightPaneSectionOrnaments(rect, state) {
  const rightRows = rightPaneRows(state);
  if (!rightRows.length) return [];
  const innerWidth = Math.max(1, rect.width - 4);
  const innerHeight = Math.max(1, rect.height - 2);
  const maxRowLines = Math.min(Math.max(1, innerHeight - 2), rightRows.length);
  const sectionTitle = activeRightSectionTitle(state) ? `${activeRightSectionTitle(state)} rows` : "rows";
  const ornaments = [{
    x: rect.x + 2,
    y: rect.y + 1,
    text: fitText(`[${sectionTitle}]`, innerWidth),
    style: {
      fg: 11,
      bg: 0,
      flags: CELL_FLAGS.none
    }
  }];
  const dividerY = rect.y + 1 + 1 + maxRowLines;
  if ((1 + maxRowLines) < innerHeight) {
    ornaments.push({
      x: rect.x + 2,
      y: dividerY,
      text: fitText("=".repeat(Math.max(1, innerWidth)), innerWidth),
      style: {
        fg: 8,
        bg: 0,
        flags: CELL_FLAGS.none
      }
    });
  }
  return ornaments;
}

function leftPaneTextScene(rect, surface, state, focused) {
  const pane = state.leftPane || {};
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
      style: {
        fg: focused && isActive ? 0 : (isActive ? 14 : (row?.type === "container" ? 10 : 7)),
        bg: focused && isActive ? 10 : 0
      }
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
      style: {
        fg: 8,
        bg: 0,
        flags: CELL_FLAGS.none
      }
    });
  }
  const columns = Array.isArray(pane.columns) ? pane.columns.filter(Boolean) : [];
  const tableMode = (pane.shape === "table" || pane.mode === "results") && columns.length > 0;
  if (tableMode) {
    ornaments.push({
      x: rect.x + 2,
      y: rect.y + 1 + (headerText ? 1 : 0),
      text: fitText(columns.join(" | "), innerWidth),
      style: {
        fg: 11,
        bg: 0,
        flags: CELL_FLAGS.none
      }
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
      style: { fg: 15, bg: 0, flags: CELL_FLAGS.none }
    }];
  }

  let remainingWidth = innerWidth;
  const segments = [];
  if (metaChips.length) {
    const metaText = fitText(metaChips.join(" | "), remainingWidth);
    segments.push({
      text: metaText,
      style: { fg: 15, bg: 0, flags: CELL_FLAGS.none }
    });
    remainingWidth -= metaText.length;
    if (remainingWidth > 0) {
      segments.push({
        text: " ",
        style: { fg: 8, bg: 0, flags: CELL_FLAGS.none }
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
      style: {
        fg: active ? (focused ? 0 : 14) : (focused ? 15 : 11),
        bg: active ? (focused ? 10 : 0) : 0,
        flags: CELL_FLAGS.none
      }
    });
    remainingWidth -= token.length;
    if (index < navigationChips.length - 1 && remainingWidth > 0) {
      segments.push({
        text: " ",
        style: { fg: focused ? 15 : 11, bg: 0, flags: CELL_FLAGS.none }
      });
      remainingWidth -= 1;
    }
  }

  return segments.length
    ? [{
      x: rect.x + 2,
      y,
      segments,
      style: { fg: 15, bg: 0, flags: CELL_FLAGS.none }
    }]
    : [];
}

function commandSurfaceOrnaments(rect, state) {
  const innerWidth = Math.max(1, rect.width - 4);
  return [{
    x: rect.x + 2,
    y: rect.y + 1,
    text: fitText(commandBarText(state), innerWidth),
    style: { fg: 10, bg: 0, flags: CELL_FLAGS.none }
  }, {
    x: rect.x + 2,
    y: rect.y + 2,
    text: fitText(commandBarHintText(state), innerWidth),
    style: { fg: 8, bg: 0, flags: CELL_FLAGS.none }
  }];
}

function rightPaneTextScene(rect, surface, state, focused) {
  const innerWidth = Math.max(1, rect.width - 4);
  const innerHeight = Math.max(1, rect.height - 2);
  const scroll = state.scrollBySurfaceId?.[surface.id] || { x: 0, y: 0 };
  const lines = rightPaneDetailLines(state);
  const rightRows = rightPaneRows(state);
  const entries = [];
  let rowOffset = 0;
  if (rightRows.length) {
    const maxRowLines = Math.min(Math.max(1, innerHeight - 2), rightRows.length);
    const visibleRows = rightRows.slice(0, maxRowLines);
    visibleRows.forEach((row, index) => {
      const active = focused && index === currentRightCursor(state);
      entries.push({
        x: rect.x + 2,
        y: rect.y + 1 + 1 + index,
        text: fitText(`${row.label} ${row.detail}`.trim(), innerWidth),
        style: {
          fg: active ? 0 : 14,
          bg: active ? 10 : 0,
          flags: CELL_FLAGS.none
        }
      });
    });
    rowOffset = 1 + visibleRows.length;
    if (rowOffset < innerHeight) rowOffset += 1;
  }
  const visible = lines.slice(scroll.y, scroll.y + Math.max(0, innerHeight - rowOffset));
  visible.forEach((line, index) => {
    entries.push({
      x: rect.x + 2,
      y: rect.y + 1 + rowOffset + index,
      text: fitText(String(line).slice(scroll.x), innerWidth),
      style: {
        fg: 15,
        bg: 0,
        flags: CELL_FLAGS.none
      }
    });
  });
  return entries;
}

function overlayTextScene(overlayRects, state) {
  return overlayRects.flatMap(({ rect, surface }) => {
    const lines = surface.kind === "menu" ? HOST_CONTEXT_MENU_ITEMS : helpOverlayLines(state);
    return lines.map((line, index) => {
      const prefix = surface.kind === "menu" ? `${index + 1}. ` : "";
      return {
        x: rect.x + 2,
        y: rect.y + 1 + index,
        text: fitText(`${prefix}${line}`, Math.max(1, rect.width - 4)),
        style: {
          fg: surface.kind === "menu" ? 14 : 15,
          bg: 0,
          flags: CELL_FLAGS.overlay
        }
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
    drawText(buffer, entry.x, entry.y, entry.text, entry.style);
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
    return [{
      id: overlayId,
      surface,
      rect: centeredRect(
        layout.bounds,
        Math.min(surface.width || 48, layout.bounds.width - 8),
        Math.min(surface.height || (surface.kind === "menu" ? 8 : 10), layout.bounds.height - 2)
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
      frameTitleText(layout.top, topSurface.title, focusedSurfaceId === topSurface.id),
      frameTitleText(layout.left, runtimeState.leftPane?.title || leftSurface.title, focusedSurfaceId === leftSurface.id),
      frameTitleText(layout.right, rightSurface.title, focusedSurfaceId === rightSurface.id),
      frameTitleText(layout.bottom, bottomSurface.title, focusedSurfaceId === bottomSurface.id),
      ...topStatusOrnaments(layout.top, runtimeState, focusedSurfaceId === topSurface.id),
      ...leftPaneOrnaments(layout.left, runtimeState.leftPane),
      frameStatusText(
        layout.right,
        rightPaneRows(runtimeState).length
          ? `rows:${rightPaneRows(runtimeState).length} y:${currentRightCursor(runtimeState)}`
          : `x:${runtimeState.scrollBySurfaceId?.[rightSurface.id]?.x || 0} y:${runtimeState.scrollBySurfaceId?.[rightSurface.id]?.y || 0}`,
        focusedSurfaceId === rightSurface.id
      ),
      ...rightPaneSectionOrnaments(layout.right, runtimeState),
      ...commandSurfaceOrnaments(layout.bottom, runtimeState),
      ...overlayRects.map(overlay => overlayTitleText(overlay.rect, overlay.surface))
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

function buildGlyphAtlasCacheKey(buffer, cellSize) {
  return `${cellSize}:${collectGlyphCodepoints(buffer).join(",")}`;
}

function renderFallbackGlyph(context, codepoint, fg, x, y, cellSize) {
  context.fillStyle = ANSI16_PALETTE[fg] || ANSI16_PALETTE[7];
  context.fillText(String.fromCodePoint(codepoint || 32), x, y);
}

function renderBufferToCanvas(canvas, buffer, cache, scaleHint = null) {
  const context = canvas.getContext("2d");
  if (!context) return;
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
  context.fillStyle = ANSI16_PALETTE[0];
  context.fillRect(0, 0, metrics.width, metrics.height);
  context.font = `${metrics.cellSize}px ${DEFAULT_GLYPH_FONT_FAMILY}`;
  context.textBaseline = "top";

  const glyphAtlasKey = buildGlyphAtlasCacheKey(buffer, metrics.cellSize);
  let glyphAtlas = cache.get(glyphAtlasKey);
  if (!glyphAtlas && typeof document !== "undefined") {
    glyphAtlas = createGlyphAtlas({
      document,
      glyphCodepoints: collectGlyphCodepoints(buffer),
      cellSize: metrics.cellSize,
      palette: ANSI16_PALETTE
    });
    if (glyphAtlas) cache.set(glyphAtlasKey, glyphAtlas);
  }

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const index = (y * buffer.width) + x;
      const drawX = x * metrics.cellSize;
      const drawY = y * metrics.cellSize;
      const bg = ANSI16_PALETTE[buffer.bg[index]];
      if (bg && buffer.bg[index] !== 0) {
        context.fillStyle = bg;
        context.fillRect(drawX, drawY, metrics.cellSize, metrics.cellSize);
      }
      const codepoint = buffer.glyphs[index] || 32;
      if (codepoint === 32) continue;
      const drewFromAtlas = glyphAtlas?.draw(context, codepoint, buffer.fg[index], drawX, drawY) || false;
      if (!drewFromAtlas) renderFallbackGlyph(context, codepoint, buffer.fg[index], drawX, drawY, metrics.cellSize);
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
    renderBufferToCanvas(canvas, composed.buffer, glyphAtlasCache);
  }

  function replaceRuntimeState(nextState) {
    for (const key of Object.keys(runtimeState)) delete runtimeState[key];
    Object.assign(runtimeState, nextState);
  }

  function mergeOverlayState(nextOverlays = []) {
    const localOverlayIds = Array.isArray(runtimeState.localUi?.overlayIds)
      ? runtimeState.localUi.overlayIds
      : [];
    const merged = new Set([...nextOverlays, ...localOverlayIds]);
    return [...merged];
  }

  function applyWorkbenchSnapshot(snapshot = {}) {
    const adapted = createOperatorBrowserStateFromWorkbenchSnapshot(snapshot);
    replaceRuntimeState({
      ...adapted,
      hostMode: runtimeState.hostMode || (hasLiveIntentBridge() ? "live" : "fixture-readonly"),
      viewportLayoutDraft: null,
      scrollBySurfaceId: structuredClone(runtimeState.scrollBySurfaceId || adapted.scrollBySurfaceId),
      localUi: {
        overlayIds: mergeOverlayState([])
      }
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
    if (await dispatchLiveIntent({ type: "set-focused-pane", pane })) return true;
    if (isReadOnlyFixtureMode()) return false;
    if (runtimeState.snapshot?.ui) runtimeState.snapshot.ui.focusedPane = pane;
    render();
    return true;
  }

  function moveCursorLocally(direction, { pane = "left" } = {}) {
    if (isReadOnlyFixtureMode()) return false;
    const rows = pane === "right"
      ? rightPaneRows(runtimeState)
      : (runtimeState.leftPane?.rows || []);
    const current = pane === "right" ? currentRightCursor(runtimeState) : currentLeftCursor(runtimeState);
    const limit = Math.max(0, rows.length - 1);
    let next = current;
    if (direction === "up") next = clamp(current - 1, 0, limit);
    if (direction === "down") next = clamp(current + 1, 0, limit);
    if (direction === "home") next = 0;
    if (direction === "end") next = limit;
    if (direction === "page-up") next = clamp(current - 10, 0, limit);
    if (direction === "page-down") next = clamp(current + 10, 0, limit);
    if (pane === "left" && runtimeState.leftPane && typeof runtimeState.leftPane === "object") {
      runtimeState.leftPane.cursor = next;
      runtimeState.leftPane.activeRow = runtimeState.leftPane.rows?.[next] ?? null;
      if (runtimeState.snapshot?.leftPane) {
        runtimeState.snapshot.leftPane.cursor = next;
        runtimeState.snapshot.leftPane.activeRowIndex = next;
      }
    } else if (pane === "right" && runtimeState.snapshot?.rightPane) {
      runtimeState.snapshot.rightPane.cursor = next;
    }
    return true;
  }

  function moveTopCursorLocally(direction) {
    if (isReadOnlyFixtureMode()) return false;
    const limit = Math.max(0, (runtimeState.snapshot?.topPane?.navigation?.chips?.length ?? 1) - 1);
    let next = currentTopCursor(runtimeState);
    if (direction === "left" || direction === "up") next = clamp(next - 1, 0, limit);
    if (direction === "right" || direction === "down") next = clamp(next + 1, 0, limit);
    if (direction === "home") next = 0;
    if (direction === "end") next = limit;
    if (runtimeState.snapshot?.topPane?.navigation) {
      runtimeState.snapshot.topPane.navigation.selectedIndex = next;
    }
    return true;
  }

  async function dispatchRightSectionIntent(intent = {}) {
    if (currentFocusedPane(runtimeState) !== "right") return false;
    return dispatchLiveIntent(intent);
  }

  function openOverlay(surfaceId) {
    const nextOverlays = new Set(Array.isArray(runtimeState.localUi?.overlayIds) ? runtimeState.localUi.overlayIds : []);
    if (nextOverlays.has(surfaceId)) nextOverlays.delete(surfaceId);
    else nextOverlays.add(surfaceId);
    runtimeState.localUi = {
      ...(runtimeState.localUi || {}),
      overlayIds: [...nextOverlays]
    };
    render();
  }

  async function triggerBinding(trigger, verb) {
    const viewport = model.viewportById.get(runtimeState.viewportId || "default");
    const binding = viewport ? findBinding(viewport, trigger, verb) : null;
    if (!binding) return false;
    if (binding.verb === "overlay" && binding.target) {
      if (binding.target === "help_overlay") {
        if (await dispatchLiveIntent({ type: "toggle-help" })) return true;
        if (isReadOnlyFixtureMode()) return false;
      }
      openOverlay(binding.target);
      return true;
    }
    return false;
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
    if (event.key === "Escape") {
      if (activeOverlayIds(runtimeState).includes("context_menu")) {
        runtimeState.localUi = {
          ...(runtimeState.localUi || {}),
          overlayIds: (runtimeState.localUi?.overlayIds || []).filter(overlayId => overlayId !== "context_menu")
        };
        render();
        return;
      }
      if (activeOverlayIds(runtimeState).includes("help_overlay")) {
        if (await dispatchLiveIntent({ type: "escape" })) return;
      }
      runtimeState.localUi = {
        ...(runtimeState.localUi || {}),
        overlayIds: []
      };
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
      if (await dispatchLiveIntent({ type: "move-cursor", direction: moveDirection })) return;
      if (moveTopCursorLocally(moveDirection)) render();
      return;
    }
    if (focusedPane === "left" && moveDirection) {
      event.preventDefault();
      if (await dispatchLiveIntent({ type: "move-cursor", direction: moveDirection })) return;
      if (moveCursorLocally(moveDirection, { pane: "left" })) render();
      return;
    }
    if (focusedPane === "right" && moveDirection && rightPaneRows(runtimeState).length > 0) {
      event.preventDefault();
      if (await dispatchLiveIntent({ type: "move-cursor", direction: moveDirection })) return;
      if (moveCursorLocally(moveDirection, { pane: "right" })) render();
      return;
    }
    if ((focusedPane === "left" || focusedPane === "top" || (focusedPane === "right" && rightPaneRows(runtimeState).length > 0))
      && event.key === "Enter") {
      event.preventDefault();
      if (hasLiveIntentBridge()) await dispatchLiveIntent({ type: "activate-primary" });
      return;
    }
    if (currentFocusedSurfaceId(runtimeState) === "session_reader") {
      const scroll = runtimeState.scrollBySurfaceId.session_reader;
      if (event.key === "ArrowRight") {
        scroll.x += 1;
        render();
      } else if (event.key === "ArrowLeft") {
        scroll.x = Math.max(0, scroll.x - 1);
        render();
      } else if (event.key === "ArrowDown") {
        scroll.y += 1;
        render();
      } else if (event.key === "ArrowUp") {
        scroll.y = Math.max(0, scroll.y - 1);
        render();
      }
    }
  }

  async function handlePointerDown(event) {
    const cell = pointToCell(canvas, composed.layout, event);
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
    if (cell.y < composed.layout.top.y + composed.layout.top.height) {
      await setFocusedPane("top");
      return;
    }
    if (cell.y >= composed.layout.bottom.y) {
      await setFocusedPane("bottom");
      return;
    }
    if (cell.x < composed.layout.left.x + composed.layout.left.width) {
      await setFocusedPane("left");
      return;
    }
    await setFocusedPane("right");
  }

  function handlePointerMove(event) {
    if (!dragHandle) return;
    const cell = pointToCell(canvas, composed.layout, event);
    const currentLayout = resolvedViewportLayout(runtimeState, composed.layout.viewport);
    if (dragHandle === "vertical") {
      const leftWeight = clamp(Math.round((cell.x / composed.layout.bounds.width) * 100), 15, 85);
      runtimeState.viewportLayoutDraft = {
        ...currentLayout,
        leftWeight,
        rightWeight: 100 - leftWeight
      };
    } else if (dragHandle === "top") {
      runtimeState.viewportLayoutDraft = {
        ...currentLayout,
        top: clamp(cell.y + 1, 3, composed.layout.bounds.height - currentLayout.bottom - 6)
      };
    } else if (dragHandle === "bottom") {
      runtimeState.viewportLayoutDraft = {
        ...currentLayout,
        bottom: clamp(composed.layout.bounds.height - cell.y, 3, composed.layout.bounds.height - currentLayout.top - 6)
      };
    }
    render();
  }

  async function handlePointerUp() {
    const releasedHandle = dragHandle;
    dragHandle = null;
    if (!releasedHandle || !runtimeState.viewportLayoutDraft) return;
    if (isReadOnlyFixtureMode()) {
      runtimeState.viewportLayoutDraft = null;
      render();
      return;
    }
    const draft = structuredClone(runtimeState.viewportLayoutDraft);
    try {
      if (!(await dispatchLiveIntent({
        type: "set-viewport-layout",
        layout: draft,
        persistDisplaySettings: true
      }))) {
        runtimeState.viewportLayout = draft;
        runtimeState.viewportLayoutDraft = null;
        render();
      }
    } catch {
      runtimeState.viewportLayout = draft;
      runtimeState.viewportLayoutDraft = null;
      render();
    }
  }

  async function handleContextMenu(event) {
    event.preventDefault();
    await triggerBinding("MouseSecondary", "overlay");
  }

  function handleWheel(event) {
    event.preventDefault();
    const scroll = runtimeState.scrollBySurfaceId.session_reader;
    if (event.shiftKey) {
      scroll.x = Math.max(0, scroll.x + (event.deltaY > 0 ? 1 : -1));
    } else {
      scroll.y = Math.max(0, scroll.y + (event.deltaY > 0 ? 1 : -1));
    }
    render();
  }

  function mount() {
    render();
    windowTarget.addEventListener("keydown", handleKey);
    canvas.addEventListener("pointerdown", handlePointerDown);
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
