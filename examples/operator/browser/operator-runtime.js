import {
  ANSI16_PALETTE,
  CELL_FLAGS,
  clearCellBuffer,
  createCellBuffer,
  drawFrame,
  drawText,
  fillRect,
  putCell
} from "./operator-framebuffer.js";
import {
  collectGlyphCodepoints,
  createGlyphAtlas,
  DEFAULT_GLYPH_FONT_FAMILY,
  resolveCanvasCellMetrics
} from "./operator-glyph-atlas.js";

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

export function layoutViewport(model, runtimeState, viewportId = runtimeState.viewportId || "default") {
  const viewport = model.viewportById.get(viewportId);
  if (!viewport) throw new Error(`unknown viewport: ${viewportId}`);
  const { width, height } = viewport.size;
  const topSize = clamp(runtimeState.splits?.top ?? viewport.top?.size ?? 3, 3, Math.max(3, height - 10));
  const bottomSize = clamp(runtimeState.splits?.bottom ?? viewport.bottom?.size ?? 4, 3, Math.max(3, height - topSize - 4));
  const centerHeight = Math.max(6, height - topSize - bottomSize);
  const leftWeight = clamp(runtimeState.splits?.leftWeight ?? viewport.center?.leftWeight ?? 28, 15, 85);
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

function renderPaneBox(buffer, rect, title, focused = false) {
  drawFrame(buffer, rect, { fg: focused ? 10 : 8, bg: 0 });
  drawText(buffer, rect.x + 1, rect.y, `─ ${fitLabel(title, Math.max(1, rect.width - 8))} ─`, {
    fg: focused ? 10 : 15,
    bg: 0
  });
}

function renderStatusSurface(buffer, rect, surface, state) {
  renderPaneBox(buffer, rect, surface.title, false);
  const chipText = (state.statusChips || []).join(" | ");
  drawText(buffer, rect.x + 2, rect.y + 1, fitText(chipText, Math.max(1, rect.width - 4)), { fg: 15, bg: 0 });
}

function renderTreeSurface(buffer, rect, surface, state, focused) {
  renderPaneBox(buffer, rect, surface.title, focused);
  const innerWidth = Math.max(1, rect.width - 4);
  const rows = state.treeRows || [];
  rows.slice(0, Math.max(0, rect.height - 2)).forEach((row, index) => {
    const primary = fitText(row.label, Math.min(innerWidth, surface.maxPrimaryChars ?? innerWidth));
    const secondary = row.detail ? ` ${String(row.detail).slice(0, Math.max(0, innerWidth - primary.length - 1))}` : "";
    drawText(buffer, rect.x + 2, rect.y + 1 + index, fitText(`${primary}${secondary}`, innerWidth), {
      fg: index === 0 ? 14 : 7,
      bg: 0
    });
  });
}

function renderTextReaderSurface(buffer, rect, surface, state, focused) {
  renderPaneBox(buffer, rect, surface.title, focused);
  const innerWidth = Math.max(1, rect.width - 4);
  const innerHeight = Math.max(1, rect.height - 2);
  const scroll = state.scrollBySurfaceId?.[surface.id] || { x: 0, y: 0 };
  const lines = state.sessionLines || [];
  const visible = lines.slice(scroll.y, scroll.y + innerHeight);
  visible.forEach((line, index) => {
    drawText(buffer, rect.x + 2, rect.y + 1 + index, fitText(String(line).slice(scroll.x), innerWidth), {
      fg: 15,
      bg: 0
    });
  });
  const status = `x:${scroll.x} y:${scroll.y}`;
  drawText(buffer, rect.x + rect.width - status.length - 5, rect.y, `─ ${status} ─`, { fg: 11, bg: 0 });
}

function renderCommandSurface(buffer, rect, surface, state) {
  renderPaneBox(buffer, rect, surface.title, false);
  drawText(buffer, rect.x + 2, rect.y + 1, fitText(state.commandText || ":", Math.max(1, rect.width - 4)), { fg: 10, bg: 0 });
  drawText(buffer, rect.x + 2, rect.y + 2, fitText("F1 help | Right click menu | Drag handles resize", Math.max(1, rect.width - 4)), { fg: 8, bg: 0 });
}

function renderOverlaySurface(buffer, rect, surface, state) {
  fillRect(buffer, rect.x, rect.y, rect.width, rect.height, { ch: " ", fg: 7, bg: 0, flags: CELL_FLAGS.overlay });
  drawFrame(buffer, rect, { fg: 11, bg: 0, flags: CELL_FLAGS.overlay });
  drawText(buffer, rect.x + 2, rect.y, ` ${surface.title} `, { fg: 15, bg: 0, flags: CELL_FLAGS.overlay });
  const lines = surface.kind === "menu" ? (state.contextMenuItems || []) : (state.helpLines || []);
  lines.forEach((line, index) => {
    const prefix = surface.kind === "menu" ? `${index + 1}. ` : "";
    drawText(buffer, rect.x + 2, rect.y + 1 + index, fitText(`${prefix}${line}`, Math.max(1, rect.width - 4)), {
      fg: surface.kind === "menu" ? 14 : 15,
      bg: 0,
      flags: CELL_FLAGS.overlay
    });
  });
}

function renderHandle(buffer, rect, axis) {
  const style = { fg: 8, bg: 0, flags: CELL_FLAGS.handle };
  if (axis === "vertical") {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) putCell(buffer, rect.x, y, { ...style, ch: "║" });
    putCell(buffer, rect.x, rect.y + Math.floor(rect.height / 2), { ...style, ch: "╫" });
    return;
  }
  for (let x = rect.x; x < rect.x + rect.width; x += 1) putCell(buffer, x, rect.y, { ...style, ch: "═" });
  putCell(buffer, rect.x + Math.floor(rect.width / 2), rect.y, { ...style, ch: "╪" });
}

export function composeViewportToBuffer(model, runtimeState) {
  const layout = layoutViewport(model, runtimeState);
  const buffer = clearCellBuffer(createCellBuffer(layout.viewport.size.width, layout.viewport.size.height));
  const topSurface = model.surfaceById.get(layout.viewport.top.surfaceId);
  const leftSurface = model.surfaceById.get(layout.viewport.center.leftSurfaceId);
  const rightSurface = model.surfaceById.get(layout.viewport.center.rightSurfaceId);
  const bottomSurface = model.surfaceById.get(layout.viewport.bottom.surfaceId);

  renderStatusSurface(buffer, layout.top, topSurface, runtimeState);
  renderTreeSurface(buffer, layout.left, leftSurface, runtimeState, runtimeState.focusedSurfaceId === leftSurface.id);
  renderTextReaderSurface(buffer, layout.right, rightSurface, runtimeState, runtimeState.focusedSurfaceId === rightSurface.id);
  renderCommandSurface(buffer, layout.bottom, bottomSurface, runtimeState);
  renderHandle(buffer, layout.handles.vertical, "vertical");
  renderHandle(buffer, layout.handles.top, "horizontal");
  renderHandle(buffer, layout.handles.bottom, "horizontal");

  for (const overlayId of runtimeState.overlays || []) {
    const surface = model.surfaceById.get(overlayId);
    if (!surface) continue;
    const rect = centeredRect(
      layout.bounds,
      Math.min(surface.width || 48, layout.bounds.width - 8),
      Math.min(surface.height || (surface.kind === "menu" ? 8 : 10), layout.bounds.height - 2)
    );
    renderOverlaySurface(buffer, rect, surface, runtimeState);
  }

  return { buffer, layout };
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

export function createOperatorBrowserRuntime({ canvas, model, initialState }) {
  const runtimeState = structuredClone(initialState);
  const glyphAtlasCache = new Map();
  let dragHandle = null;
  let composed = composeViewportToBuffer(model, runtimeState);

  function render() {
    composed = composeViewportToBuffer(model, runtimeState);
    renderBufferToCanvas(canvas, composed.buffer, glyphAtlasCache);
  }

  function openOverlay(surfaceId) {
    runtimeState.overlays = runtimeState.overlays.includes(surfaceId) ? [] : [surfaceId];
    render();
  }

  function triggerBinding(trigger, verb) {
    const viewport = model.viewportById.get(runtimeState.viewportId || "default");
    const binding = viewport ? findBinding(viewport, trigger, verb) : null;
    if (!binding) return false;
    if (binding.verb === "overlay" && binding.target) {
      openOverlay(binding.target);
      return true;
    }
    return false;
  }

  function handleKey(event) {
    if (triggerBinding(event.key, "overlay")) {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      runtimeState.overlays = [];
      render();
      return;
    }
    if (runtimeState.focusedSurfaceId === "session_reader") {
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

  function handlePointerDown(event) {
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
    }
  }

  function handlePointerMove(event) {
    if (!dragHandle) return;
    const cell = pointToCell(canvas, composed.layout, event);
    if (dragHandle === "vertical") {
      runtimeState.splits.leftWeight = clamp(Math.round((cell.x / composed.layout.bounds.width) * 100), 15, 85);
    } else if (dragHandle === "top") {
      runtimeState.splits.top = clamp(cell.y + 1, 3, composed.layout.bounds.height - runtimeState.splits.bottom - 6);
    } else if (dragHandle === "bottom") {
      runtimeState.splits.bottom = clamp(composed.layout.bounds.height - cell.y, 3, composed.layout.bounds.height - runtimeState.splits.top - 6);
    }
    render();
  }

  function handlePointerUp() {
    dragHandle = null;
  }

  function handleContextMenu(event) {
    event.preventDefault();
    triggerBinding("MouseSecondary", "overlay");
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
    window.addEventListener("keydown", handleKey);
    canvas.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("contextmenu", handleContextMenu);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("resize", render);
  }

  return {
    runtimeState,
    render,
    mount,
    compose: () => composeViewportToBuffer(model, runtimeState)
  };
}
