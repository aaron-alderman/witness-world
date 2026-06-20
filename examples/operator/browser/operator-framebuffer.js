export const ANSI16_PALETTE = Object.freeze([
  "#050806",
  "#9c2f2f",
  "#2f7d4f",
  "#b88a3b",
  "#3f6db1",
  "#824ea8",
  "#2f8f9d",
  "#d7e2d2",
  "#51665d",
  "#ff7b72",
  "#6ee7a8",
  "#ffd479",
  "#7fb6ff",
  "#d59cff",
  "#8fd8c5",
  "#f8fff5"
]);

export const CELL_FLAGS = Object.freeze({
  none: 0,
  inverse: 1 << 0,
  underline: 1 << 1,
  handle: 1 << 2,
  overlay: 1 << 3
});

const CELL_BUFFER_HEADER_U32 = 8;

export const CELL_MEMORY_LAYOUT = Object.freeze({
  headerU32: CELL_BUFFER_HEADER_U32,
  headerBytes: CELL_BUFFER_HEADER_U32 * Uint32Array.BYTES_PER_ELEMENT
});

function computeCellMemoryLayout(width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const cellCount = safeWidth * safeHeight;
  const headerBytes = CELL_MEMORY_LAYOUT.headerBytes;
  const glyphBytes = cellCount * Uint32Array.BYTES_PER_ELEMENT;
  const fgBytes = cellCount * Uint8Array.BYTES_PER_ELEMENT;
  const bgBytes = cellCount * Uint8Array.BYTES_PER_ELEMENT;
  const flagsBytes = cellCount * Uint8Array.BYTES_PER_ELEMENT;
  const linkBytes = cellCount * Uint16Array.BYTES_PER_ELEMENT;
  const hitBytes = cellCount * Uint16Array.BYTES_PER_ELEMENT;
  const glyphOffset = headerBytes;
  const fgOffset = glyphOffset + glyphBytes;
  const bgOffset = fgOffset + fgBytes;
  const flagsOffset = bgOffset + bgBytes;
  const linkOffset = flagsOffset + flagsBytes;
  const hitOffset = linkOffset + linkBytes;
  return {
    width: safeWidth,
    height: safeHeight,
    cellCount,
    byteLength: hitOffset + hitBytes,
    offsets: Object.freeze({
      header: 0,
      glyphs: glyphOffset,
      fg: fgOffset,
      bg: bgOffset,
      flags: flagsOffset,
      linkIds: linkOffset,
      hitIds: hitOffset
    })
  };
}

export function createCellBuffer(width, height) {
  const layout = computeCellMemoryLayout(width, height);
  const memory = new ArrayBuffer(layout.byteLength);
  const header = new Uint32Array(memory, 0, CELL_BUFFER_HEADER_U32);
  header[0] = layout.width;
  header[1] = layout.height;
  header[2] = layout.cellCount;
  header[3] = layout.offsets.glyphs;
  header[4] = layout.offsets.fg;
  header[5] = layout.offsets.bg;
  header[6] = layout.offsets.flags;
  header[7] = layout.offsets.linkIds;
  return {
    width: layout.width,
    height: layout.height,
    cellCount: layout.cellCount,
    memory,
    header,
    offsets: layout.offsets,
    glyphs: new Uint32Array(memory, layout.offsets.glyphs, layout.cellCount),
    fg: new Uint8Array(memory, layout.offsets.fg, layout.cellCount),
    bg: new Uint8Array(memory, layout.offsets.bg, layout.cellCount),
    flags: new Uint8Array(memory, layout.offsets.flags, layout.cellCount),
    linkIds: new Uint16Array(memory, layout.offsets.linkIds, layout.cellCount),
    hitIds: new Uint16Array(memory, layout.offsets.hitIds, layout.cellCount)
  };
}

export function readCellBufferHeader(buffer) {
  return {
    width: buffer.header[0],
    height: buffer.header[1],
    cellCount: buffer.header[2],
    glyphOffset: buffer.header[3],
    fgOffset: buffer.header[4],
    bgOffset: buffer.header[5],
    flagsOffset: buffer.header[6],
    linkOffset: buffer.header[7],
    hitOffset: buffer.offsets.hitIds
  };
}

export function clearCellBuffer(buffer, {
  glyph = 32,
  fg = 7,
  bg = 0,
  flags = CELL_FLAGS.none,
  linkId = 0,
  hitId = 0
} = {}) {
  buffer.glyphs.fill(glyph);
  buffer.fg.fill(fg);
  buffer.bg.fill(bg);
  buffer.flags.fill(flags);
  buffer.linkIds.fill(linkId);
  buffer.hitIds.fill(hitId);
  return buffer;
}

export function bufferIndex(buffer, x, y) {
  return (y * buffer.width) + x;
}

export function putCell(buffer, x, y, {
  ch = " ",
  fg = 7,
  bg = 0,
  flags = CELL_FLAGS.none,
  linkId = 0,
  hitId = 0
} = {}) {
  if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return;
  const index = bufferIndex(buffer, x, y);
  buffer.glyphs[index] = typeof ch === "string" ? (String(ch).codePointAt(0) ?? 32) : Number(ch);
  buffer.fg[index] = fg;
  buffer.bg[index] = bg;
  buffer.flags[index] = flags;
  buffer.linkIds[index] = linkId;
  buffer.hitIds[index] = hitId;
}

export function drawText(buffer, x, y, text, style = {}) {
  const chars = Array.from(String(text ?? ""));
  chars.forEach((ch, offset) => putCell(buffer, x + offset, y, { ...style, ch }));
}

export function fillRect(buffer, x, y, width, height, style = {}) {
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      putCell(buffer, x + column, y + row, style);
    }
  }
}

export function drawFrame(buffer, rect, style = {}) {
  const chars = {
    tl: "┌",
    tr: "┐",
    bl: "└",
    br: "┘",
    h: "─",
    v: "│"
  };
  const { x, y, width, height } = rect;
  for (let column = x + 1; column < x + width - 1; column += 1) {
    putCell(buffer, column, y, { ...style, ch: chars.h });
    putCell(buffer, column, y + height - 1, { ...style, ch: chars.h });
  }
  for (let row = y + 1; row < y + height - 1; row += 1) {
    putCell(buffer, x, row, { ...style, ch: chars.v });
    putCell(buffer, x + width - 1, row, { ...style, ch: chars.v });
  }
  putCell(buffer, x, y, { ...style, ch: chars.tl });
  putCell(buffer, x + width - 1, y, { ...style, ch: chars.tr });
  putCell(buffer, x, y + height - 1, { ...style, ch: chars.bl });
  putCell(buffer, x + width - 1, y + height - 1, { ...style, ch: chars.br });
}

export function readRowText(buffer, y) {
  let text = "";
  for (let x = 0; x < buffer.width; x += 1) {
    text += String.fromCodePoint(buffer.glyphs[bufferIndex(buffer, x, y)] || 32);
  }
  return text;
}
