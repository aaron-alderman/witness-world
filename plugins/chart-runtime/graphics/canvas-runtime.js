export function prepareCanvas2d(canvas, width, height) {
  const dpr = globalThis.devicePixelRatio && Number.isFinite(globalThis.devicePixelRatio)
    ? globalThis.devicePixelRatio
    : 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function clearCanvas(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
}
