// Browser-first framebuffer seam for future lowering.
// The JS runtime remains authoritative today, but this AssemblyScript contract
// keeps the buffer shape explicit before presentation details sprawl.

export const CELL_FLAG_NONE:u8 = 0;
export const CELL_FLAG_INVERSE:u8 = 1 << 0;
export const CELL_FLAG_UNDERLINE:u8 = 1 << 1;
export const CELL_FLAG_HANDLE:u8 = 1 << 2;
export const CELL_FLAG_OVERLAY:u8 = 1 << 3;

export function bufferIndex(width:i32, x:i32, y:i32):i32 {
  return (y * width) + x;
}

export function clearU32(buffer:StaticArray<u32>, value:u32):void {
  for (let i = 0; i < buffer.length; i += 1) {
    unchecked(buffer[i] = value);
  }
}

export function clearU8(buffer:StaticArray<u8>, value:u8):void {
  for (let i = 0; i < buffer.length; i += 1) {
    unchecked(buffer[i] = value);
  }
}

export function putGlyph(
  glyphs:StaticArray<u32>,
  width:i32,
  height:i32,
  x:i32,
  y:i32,
  glyph:u32
):void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  unchecked(glyphs[bufferIndex(width, x, y)] = glyph);
}
