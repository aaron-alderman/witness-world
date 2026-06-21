import { CELL_FLAGS, drawText, putCell } from "./operator-framebuffer.js";

const BOX_CHARS = Object.freeze({
  single: Object.freeze({
    h: "\u2500",
    v: "\u2502",
    tl: "\u250c",
    tr: "\u2510",
    bl: "\u2514",
    br: "\u2518",
    jt: "\u252c",
    jb: "\u2534",
    jl: "\u251c",
    jr: "\u2524",
    cross: "\u253c"
  }),
  heavy: Object.freeze({
    h: "\u2501",
    v: "\u2503",
    tl: "\u250f",
    tr: "\u2513",
    bl: "\u2517",
    br: "\u251b",
    jt: "\u2533",
    jb: "\u253b",
    jl: "\u2523",
    jr: "\u252b",
    cross: "\u254b"
  }),
  double: Object.freeze({
    h: "\u2550",
    v: "\u2551",
    tl: "\u2554",
    tr: "\u2557",
    bl: "\u255a",
    br: "\u255d",
    jt: "\u2566",
    jb: "\u2569",
    jl: "\u2560",
    jr: "\u2563",
    cross: "\u256c"
  }),
  mixedHorizontalDouble: Object.freeze({
    tl: "\u2552",
    tr: "\u2555",
    bl: "\u2558",
    br: "\u255b",
    jt: "\u2564",
    jb: "\u2567",
    jl: "\u255e",
    jr: "\u2561",
    cross: "\u256a"
  }),
  mixedHorizontalHeavy: Object.freeze({
    tl: "\u250d",
    tr: "\u2511",
    bl: "\u2515",
    br: "\u2519",
    jt: "\u252f",
    jb: "\u2537",
    jl: "\u251d",
    jr: "\u2525",
    cross: "\u253f"
  }),
  mixedVerticalHeavy: Object.freeze({
    tl: "\u250e",
    tr: "\u2512",
    bl: "\u2516",
    br: "\u251a",
    jt: "\u2530",
    jb: "\u2538",
    jl: "\u2520",
    jr: "\u2528",
    cross: "\u2542"
  }),
  mixedVerticalDouble: Object.freeze({
    tl: "\u2553",
    tr: "\u2556",
    bl: "\u2559",
    br: "\u255c",
    jt: "\u2565",
    jb: "\u2568",
    jl: "\u255f",
    jr: "\u2562",
    cross: "\u256b"
  })
});

export const FRAME_STYLE_VARIANTS = Object.freeze({
  primary: Object.freeze({ id: "primary", fg: 10, bg: 0, flags: CELL_FLAGS.none, variant: "heavy", priority: 20 }),
  passive: Object.freeze({ id: "passive", fg: 8, bg: 0, flags: CELL_FLAGS.none, variant: "single", priority: 10 }),
  container: Object.freeze({ id: "container", fg: 10, bg: 0, flags: CELL_FLAGS.none, variant: "single", priority: 12 }),
  separator: Object.freeze({ id: "separator", fg: 8, bg: 0, flags: CELL_FLAGS.handle, variant: "double", priority: 30 }),
  overlay: Object.freeze({ id: "overlay", fg: 11, bg: 0, flags: CELL_FLAGS.overlay, variant: "single", priority: 40 })
});

export const FILL_STYLE_VARIANTS = Object.freeze({
  primary: Object.freeze({ id: "primary", ch: " ", fg: 7, bg: 0, flags: CELL_FLAGS.none }),
  passive: Object.freeze({ id: "passive", ch: " ", fg: 7, bg: 0, flags: CELL_FLAGS.none }),
  container: Object.freeze({ id: "container", ch: " ", fg: 7, bg: 0, flags: CELL_FLAGS.none }),
  overlay: Object.freeze({ id: "overlay", ch: " ", fg: 7, bg: 0, flags: CELL_FLAGS.overlay })
});

export const TEXT_STYLE_VARIANTS = Object.freeze({
  overlayTitle: Object.freeze({ id: "overlayTitle", fg: 15, bg: 0, flags: CELL_FLAGS.overlay }),
  overlayMenu: Object.freeze({ id: "overlayMenu", fg: 14, bg: 0, flags: CELL_FLAGS.overlay }),
  overlayMenuSelected: Object.freeze({ id: "overlayMenuSelected", fg: 0, bg: 10, flags: CELL_FLAGS.overlay }),
  overlayHelp: Object.freeze({ id: "overlayHelp", fg: 15, bg: 0, flags: CELL_FLAGS.overlay }),
  sectionHeader: Object.freeze({ id: "sectionHeader", fg: 11, bg: 0, flags: CELL_FLAGS.none }),
  divider: Object.freeze({ id: "divider", fg: 8, bg: 0, flags: CELL_FLAGS.none }),
  headerMuted: Object.freeze({ id: "headerMuted", fg: 8, bg: 0, flags: CELL_FLAGS.none }),
  headerAccent: Object.freeze({ id: "headerAccent", fg: 11, bg: 0, flags: CELL_FLAGS.none }),
  textBright: Object.freeze({ id: "textBright", fg: 15, bg: 0, flags: CELL_FLAGS.none }),
  textAccent: Object.freeze({ id: "textAccent", fg: 10, bg: 0, flags: CELL_FLAGS.none }),
  textMuted: Object.freeze({ id: "textMuted", fg: 8, bg: 0, flags: CELL_FLAGS.none }),
  chipMuted: Object.freeze({ id: "chipMuted", fg: 8, bg: 0, flags: CELL_FLAGS.none }),
  chipFocused: Object.freeze({ id: "chipFocused", fg: 15, bg: 0, flags: CELL_FLAGS.none }),
  chipPassive: Object.freeze({ id: "chipPassive", fg: 11, bg: 0, flags: CELL_FLAGS.none }),
  chipActiveFocused: Object.freeze({ id: "chipActiveFocused", fg: 0, bg: 10, flags: CELL_FLAGS.none }),
  chipActivePassive: Object.freeze({ id: "chipActivePassive", fg: 14, bg: 0, flags: CELL_FLAGS.none }),
  rowSelected: Object.freeze({ id: "rowSelected", fg: 14, bg: 0, flags: CELL_FLAGS.none }),
  rowSelectedFocused: Object.freeze({ id: "rowSelectedFocused", fg: 0, bg: 10, flags: CELL_FLAGS.none }),
  rowContainer: Object.freeze({ id: "rowContainer", fg: 10, bg: 0, flags: CELL_FLAGS.none }),
  rowDefault: Object.freeze({ id: "rowDefault", fg: 7, bg: 0, flags: CELL_FLAGS.none }),
  rowDetail: Object.freeze({ id: "rowDetail", fg: 15, bg: 0, flags: CELL_FLAGS.none })
});

function makeCellContribution() {
  return {
    up: null,
    down: null,
    left: null,
    right: null
  };
}

function cellKey(x, y) {
  return `${x},${y}`;
}

function styleById(styleId = "passive") {
  return FRAME_STYLE_VARIANTS[styleId] || FRAME_STYLE_VARIANTS.passive;
}

export function fillStyleById(styleId = "passive") {
  return FILL_STYLE_VARIANTS[styleId] || FILL_STYLE_VARIANTS.passive;
}

export function textStyleById(styleId = "textBright") {
  return TEXT_STYLE_VARIANTS[styleId] || TEXT_STYLE_VARIANTS.textBright;
}

function graphTextStyleById(styleId = "passive") {
  if (FRAME_STYLE_VARIANTS[styleId]) return FRAME_STYLE_VARIANTS[styleId];
  return textStyleById(styleId);
}

function addDirection(cell, direction, style) {
  const existing = cell[direction];
  if (!existing || existing.priority <= style.priority) {
    cell[direction] = style;
  }
}

function ensureCell(graph, x, y) {
  const key = cellKey(x, y);
  let cell = graph.cells.get(key);
  if (!cell) {
    cell = makeCellContribution();
    graph.cells.set(key, cell);
  }
  return cell;
}

function addFrame(graph, rect, style) {
  const { x, y, width, height } = rect;
  if (width < 2 || height < 2) return;
  for (let column = x; column < x + width; column += 1) {
    const topCell = ensureCell(graph, column, y);
    const bottomCell = ensureCell(graph, column, y + height - 1);
    if (column === x) {
      addDirection(topCell, "right", style);
      addDirection(topCell, "down", style);
      addDirection(bottomCell, "right", style);
      addDirection(bottomCell, "up", style);
    } else if (column === x + width - 1) {
      addDirection(topCell, "left", style);
      addDirection(topCell, "down", style);
      addDirection(bottomCell, "left", style);
      addDirection(bottomCell, "up", style);
    } else {
      addDirection(topCell, "left", style);
      addDirection(topCell, "right", style);
      addDirection(bottomCell, "left", style);
      addDirection(bottomCell, "right", style);
    }
  }
  for (let row = y + 1; row < y + height - 1; row += 1) {
    const leftCell = ensureCell(graph, x, row);
    const rightCell = ensureCell(graph, x + width - 1, row);
    addDirection(leftCell, "up", style);
    addDirection(leftCell, "down", style);
    addDirection(rightCell, "up", style);
    addDirection(rightCell, "down", style);
  }
}

function addHorizontalLine(graph, rect, style) {
  const { x, y, width } = rect;
  for (let column = x; column < x + width; column += 1) {
    const cell = ensureCell(graph, column, y);
    if (column > x) addDirection(cell, "left", style);
    if (column < x + width - 1) addDirection(cell, "right", style);
  }
}

function addVerticalLine(graph, rect, style) {
  const { x, y, height } = rect;
  for (let row = y; row < y + height; row += 1) {
    const cell = ensureCell(graph, x, row);
    if (row > y) addDirection(cell, "up", style);
    if (row < y + height - 1) addDirection(cell, "down", style);
  }
}

function dominantStyleForAxis(cell, directions) {
  return directions
    .map(direction => cell[direction])
    .filter(Boolean)
    .sort((left, right) => right.priority - left.priority)[0] || null;
}

function variantForAxis(cell, directions) {
  return dominantStyleForAxis(cell, directions)?.variant || null;
}

export function resolveFrameGraphVariantPolicy(horizontalVariant, verticalVariant) {
  const horizontal = horizontalVariant || "single";
  const vertical = verticalVariant || "single";
  if (horizontal === vertical) {
    return {
      horizontalVariant: horizontal,
      verticalVariant: vertical,
      glyphSet: horizontal,
      policy: "direct"
    };
  }
  if (horizontal === "double" && vertical === "single") {
    return {
      horizontalVariant: horizontal,
      verticalVariant: vertical,
      glyphSet: "mixedHorizontalDouble",
      policy: "direct"
    };
  }
  if (horizontal === "single" && vertical === "double") {
    return {
      horizontalVariant: horizontal,
      verticalVariant: vertical,
      glyphSet: "mixedVerticalDouble",
      policy: "direct"
    };
  }
  if (horizontal === "heavy" && vertical === "single") {
    return {
      horizontalVariant: horizontal,
      verticalVariant: vertical,
      glyphSet: "mixedHorizontalHeavy",
      policy: "direct"
    };
  }
  if (horizontal === "single" && vertical === "heavy") {
    return {
      horizontalVariant: horizontal,
      verticalVariant: vertical,
      glyphSet: "mixedVerticalHeavy",
      policy: "direct"
    };
  }
  if ((horizontal === "double" && vertical === "heavy")
    || (horizontal === "heavy" && vertical === "double")) {
    return {
      horizontalVariant: horizontal,
      verticalVariant: vertical,
      glyphSet: "double",
      policy: "normalized-double-over-heavy"
    };
  }
  if (horizontal === "double" || vertical === "double") {
    return {
      horizontalVariant: horizontal,
      verticalVariant: vertical,
      glyphSet: "double",
      policy: "normalized-double"
    };
  }
  if (horizontal === "heavy" || vertical === "heavy") {
    return {
      horizontalVariant: horizontal,
      verticalVariant: vertical,
      glyphSet: "heavy",
      policy: "normalized-heavy"
    };
  }
  return {
    horizontalVariant: horizontal,
    verticalVariant: vertical,
    glyphSet: "single",
    policy: "normalized-single"
  };
}

function pickDominantStyle(cell) {
  return [cell.up, cell.down, cell.left, cell.right]
    .filter(Boolean)
    .sort((left, right) => right.priority - left.priority)[0] || FRAME_STYLE_VARIANTS.passive;
}

export function resolveFrameGraphCellGlyph(cell) {
  const up = !!cell.up;
  const down = !!cell.down;
  const left = !!cell.left;
  const right = !!cell.right;
  const horizontalVariant = variantForAxis(cell, ["left", "right"]);
  const verticalVariant = variantForAxis(cell, ["up", "down"]);
  const variantPolicy = resolveFrameGraphVariantPolicy(horizontalVariant, verticalVariant);
  if (!(up || down || left || right)) return " ";

  if ((left || right) && !(up || down)) {
    const chars = BOX_CHARS[horizontalVariant || "single"] || BOX_CHARS.single;
    return chars.h;
  }

  if ((up || down) && !(left || right)) {
    const chars = BOX_CHARS[verticalVariant || "single"] || BOX_CHARS.single;
    return chars.v;
  }

  const chars = BOX_CHARS[variantPolicy.glyphSet] || BOX_CHARS.single;

  if (left && right && !up && !down) return chars.h;
  if (up && down && !left && !right) return chars.v;
  if (right && down && !left && !up) return chars.tl;
  if (left && down && !right && !up) return chars.tr;
  if (right && up && !left && !down) return chars.bl;
  if (left && up && !right && !down) return chars.br;
  if (left && right && down && !up) return chars.jt;
  if (left && right && up && !down) return chars.jb;
  if (right && up && down && !left) return chars.jl;
  if (left && up && down && !right) return chars.jr;
  return chars.cross;
}

function paintGraphLayer(buffer, layer) {
  for (const [key, cell] of layer.cells.entries()) {
    const [x, y] = key.split(",").map(Number);
    const style = pickDominantStyle(cell);
    putCell(buffer, x, y, {
      ch: resolveFrameGraphCellGlyph(cell),
      fg: style.fg,
      bg: style.bg,
      flags: style.flags
    });
  }
  for (const marker of layer.markers) {
    putCell(buffer, marker.x, marker.y, {
      ch: marker.ch,
      fg: marker.style.fg,
      bg: marker.style.bg,
      flags: marker.style.flags
    });
  }
  for (const text of layer.texts ?? []) {
    if (Array.isArray(text.segments) && text.segments.length) {
      let cursorX = text.x;
      for (const segment of text.segments) {
        const segmentText = segment?.text || "";
        if (!segmentText) continue;
        const style = segment?.style || graphTextStyleById(segment?.styleId || text.styleId || "textBright");
        drawText(buffer, cursorX, text.y, segmentText, {
          fg: style.fg,
          bg: style.bg,
          flags: style.flags
        });
        cursorX += segmentText.length;
      }
      continue;
    }
    drawText(buffer, text.x, text.y, text.text, {
      fg: (text.style || graphTextStyleById(text.styleId || "textBright")).fg,
      bg: (text.style || graphTextStyleById(text.styleId || "textBright")).bg,
      flags: (text.style || graphTextStyleById(text.styleId || "textBright")).flags
    });
  }
}

export function buildViewportFrameGraph({
  layout,
  paneFrames = [],
  separators = [],
  overlays = [],
  ornaments = []
} = {}) {
  const baseLayer = {
    id: "base",
    cells: new Map(),
    markers: [],
    texts: []
  };
  const overlayLayer = {
    id: "overlay",
    cells: new Map(),
    markers: [],
    texts: []
  };

  const frameEntries = paneFrames.map(frame => ({
    kind: "frame",
    rect: frame.rect,
    styleId: frame.styleId
  }));
  const separatorEntries = separators.map(separator => ({
    kind: "separator",
    rect: separator.rect,
    axis: separator.axis,
    styleId: separator.styleId
  }));
  const overlayEntries = overlays.map(overlay => ({
    kind: "overlay-frame",
    rect: overlay.rect,
    styleId: overlay.styleId
  }));
  const ornamentEntries = ornaments.map(ornament => ({
    kind: ornament.kind || "ornament",
    layer: ornament.layer === "overlay" ? "overlay" : "base",
    x: ornament.x,
    y: ornament.y,
    text: ornament.text || "",
    segments: Array.isArray(ornament.segments) ? ornament.segments : null,
    styleId: ornament.styleId || null,
    style: ornament.style && typeof ornament.style === "object" ? ornament.style : null
  }));

  for (const frame of frameEntries) addFrame(baseLayer, frame.rect, styleById(frame.styleId));
  for (const separator of separatorEntries) {
    const style = styleById(separator.styleId);
    if (separator.axis === "vertical") {
      addVerticalLine(baseLayer, separator.rect, style);
      baseLayer.markers.push({
        x: separator.rect.x,
        y: separator.rect.y + Math.floor(separator.rect.height / 2),
        ch: "\u256b",
        style
      });
    } else {
      addHorizontalLine(baseLayer, separator.rect, style);
      baseLayer.markers.push({
        x: separator.rect.x + Math.floor(separator.rect.width / 2),
        y: separator.rect.y,
        ch: "\u256a",
        style
      });
    }
  }
  for (const overlay of overlayEntries) addFrame(overlayLayer, overlay.rect, styleById(overlay.styleId));
  for (const ornament of ornamentEntries) {
    const layer = ornament.layer === "overlay" ? overlayLayer : baseLayer;
    layer.texts.push({
      x: ornament.x,
      y: ornament.y,
      text: ornament.text,
      segments: ornament.segments,
      styleId: ornament.styleId || "passive",
      style: ornament.style || graphTextStyleById(ornament.styleId || "passive")
    });
  }

  return {
    bounds: layout?.bounds ?? null,
    paneFrames: frameEntries,
    separators: separatorEntries,
    overlays: overlayEntries,
    ornaments: ornamentEntries,
    layers: [baseLayer, overlayLayer]
  };
}

export function paintViewportFrameGraph(buffer, frameGraph, options = {}) {
  const allowedLayerIds = Array.isArray(options.layerIds) && options.layerIds.length
    ? new Set(options.layerIds)
    : null;
  for (const layer of frameGraph?.layers ?? []) {
    if (allowedLayerIds && !allowedLayerIds.has(layer.id)) continue;
    paintGraphLayer(buffer, layer);
  }
  return buffer;
}
