export const DEFAULT_GLYPH_FONT_FAMILY = 'Consolas, "Cascadia Mono", "Courier New", monospace';

export function resolveCanvasCellMetrics({
  cssWidth,
  cssHeight,
  gridWidth,
  gridHeight,
  scaleHint = null
}) {
  const safeCssWidth = Math.max(1, Number(cssWidth) || 1);
  const safeCssHeight = Math.max(1, Number(cssHeight) || 1);
  const safeGridWidth = Math.max(1, Number(gridWidth) || 1);
  const safeGridHeight = Math.max(1, Number(gridHeight) || 1);
  const cellWidth = Math.floor(safeCssWidth / safeGridWidth);
  const cellHeight = Math.floor(safeCssHeight / safeGridHeight);
  const scaleCap = Number.isFinite(scaleHint) && scaleHint > 0
    ? scaleHint
    : Math.max(cellWidth, cellHeight);
  const cellSize = Math.max(1, Math.min(cellWidth, cellHeight, scaleCap));
  return {
    cellSize,
    width: safeGridWidth * cellSize,
    height: safeGridHeight * cellSize
  };
}

export function collectGlyphCodepoints(buffer, { includeSpace = false } = {}) {
  const glyphs = new Set();
  for (let index = 0; index < buffer.glyphs.length; index += 1) {
    const codepoint = buffer.glyphs[index] || 32;
    if (!includeSpace && codepoint === 32) continue;
    glyphs.add(codepoint);
  }
  return Array.from(glyphs).sort((left, right) => left - right);
}

function parseHexColor(value = "#ffffff") {
  const hex = String(value).replace(/^#/u, "").trim();
  const normalized = hex.length === 3
    ? hex.split("").map(part => `${part}${part}`).join("")
    : hex.padEnd(6, "0").slice(0, 6);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16) || 0,
    g: Number.parseInt(normalized.slice(2, 4), 16) || 0,
    b: Number.parseInt(normalized.slice(4, 6), 16) || 0
  };
}

function buildGlyphAlphaMask({
  document,
  codepoint,
  cellSize,
  fontFamily,
  alphaThreshold
}) {
  const scratchCanvas = document.createElement("canvas");
  scratchCanvas.width = cellSize;
  scratchCanvas.height = cellSize;
  const context = scratchCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("glyph scratch context unavailable");
  context.clearRect(0, 0, cellSize, cellSize);
  context.fillStyle = "#ffffff";
  context.textBaseline = "alphabetic";
  context.textAlign = "left";
  context.font = `${cellSize}px ${fontFamily}`;
  const glyph = String.fromCodePoint(codepoint);
  const metrics = context.measureText(glyph);
  const drawX = Math.max(0, Math.floor((cellSize - Math.ceil(metrics.width || cellSize * 0.6)) / 2));
  const drawY = Math.max(1, Math.floor(cellSize * 0.8));
  context.fillText(glyph, drawX, drawY);
  const imageData = context.getImageData(0, 0, cellSize, cellSize);
  const alpha = new Uint8ClampedArray(cellSize * cellSize);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const sourceAlpha = imageData.data[(pixel * 4) + 3];
    alpha[pixel] = sourceAlpha >= alphaThreshold ? 255 : 0;
  }
  return alpha;
}

function buildAtlasTileImageData(cellSize, alphaMask, color) {
  const imageData = new ImageData(cellSize, cellSize);
  for (let pixel = 0; pixel < alphaMask.length; pixel += 1) {
    const offset = pixel * 4;
    const alpha = alphaMask[pixel];
    imageData.data[offset] = color.r;
    imageData.data[offset + 1] = color.g;
    imageData.data[offset + 2] = color.b;
    imageData.data[offset + 3] = alpha;
  }
  return imageData;
}

export function createGlyphAtlas({
  document,
  glyphCodepoints,
  cellSize,
  palette,
  fontFamily = DEFAULT_GLYPH_FONT_FAMILY,
  alphaThreshold = 96
}) {
  if (!document?.createElement) return null;
  const glyphs = glyphCodepoints.length ? glyphCodepoints : [32];
  const columns = Math.min(16, Math.max(1, Math.ceil(Math.sqrt(glyphs.length))));
  const rows = Math.max(1, Math.ceil(glyphs.length / columns));
  const glyphIndexByCodepoint = new Map(glyphs.map((codepoint, index) => [codepoint, index]));
  const alphaMasks = glyphs.map(codepoint => buildGlyphAlphaMask({
    document,
    codepoint,
    cellSize,
    fontFamily,
    alphaThreshold
  }));

  const canvasesByColor = palette.map(colorValue => {
    const canvas = document.createElement("canvas");
    canvas.width = columns * cellSize;
    canvas.height = rows * cellSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("glyph atlas context unavailable");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const color = parseHexColor(colorValue);
    alphaMasks.forEach((alphaMask, index) => {
      const tileX = (index % columns) * cellSize;
      const tileY = Math.floor(index / columns) * cellSize;
      context.putImageData(buildAtlasTileImageData(cellSize, alphaMask, color), tileX, tileY);
    });
    return canvas;
  });

  return {
    cellSize,
    columns,
    rows,
    glyphIndexByCodepoint,
    canvasesByColor,
    draw(context, codepoint, fg, x, y) {
      const glyphIndex = glyphIndexByCodepoint.get(codepoint);
      if (glyphIndex == null || codepoint === 32) return false;
      const atlasCanvas = canvasesByColor[fg] || canvasesByColor[7];
      const sourceX = (glyphIndex % columns) * cellSize;
      const sourceY = Math.floor(glyphIndex / columns) * cellSize;
      context.drawImage(atlasCanvas, sourceX, sourceY, cellSize, cellSize, x, y, cellSize, cellSize);
      return true;
    }
  };
}
