import { clearCanvas, prepareCanvas2d } from "../graphics/canvas-runtime.js";
import { forceColour } from "../graphics/geometry.js";
import { frameIndexForElapsed, frameIndexForValue } from "../graphics/timeline.js";

function toCanvasPoint(scene, x, y) {
  return [scene.center.x + x * scene.scale, scene.center.y - y * scene.scale];
}

export function renderCanvasScene(canvas, scene) {
  const ctx = prepareCanvas2d(canvas, scene.width, scene.height);
  const plan = scene.sourcePlan;
  const particleLayer = scene.sourceLayers.find(layer => layer.mark === "particles") ?? null;
  const lifterLayers = scene.sourceLayers.filter(layer => layer.mark === "lifters");
  const radialLayers = scene.sourceLayers.filter(layer => layer.mark === "radial-line");
  const staticLayers = scene.sourceLayers.filter(layer => !["particles", "lifters", "radial-line"].includes(layer.mark));
  const chrome = scene.presentation?.chrome ?? {};
  const typography = scene.presentation?.typography ?? {};
  const previousState = canvas.__discChartRuntimeState && typeof canvas.__discChartRuntimeState === "object"
    ? canvas.__discChartRuntimeState
    : {};
  let wallAngle = Number(previousState.wallAngle) || 0;
  let elapsed = Number(previousState.elapsed) || 0;

  const drawStatic = () => {
    clearCanvas(ctx, scene.width, scene.height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(scene.center.x, scene.center.y, scene.discRadius * scene.scale, 0, Math.PI * 2);
    if (chrome.discBackground !== "transparent") {
      ctx.fillStyle = chrome.discBackground;
      ctx.fill();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = chrome.discShellStroke;
    ctx.stroke();
    for (const layer of staticLayers) {
      if (layer.mark === "polygon" || layer.mark === "line") {
        for (const prim of layer.primitives ?? []) {
          const pts = prim.points?.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y)).map(point => toCanvasPoint(scene, point.x, point.y)) ?? [];
          if (!pts.length) continue;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let index = 1; index < pts.length; index += 1) ctx.lineTo(pts[index][0], pts[index][1]);
          if (layer.closed) ctx.closePath();
          if (layer.fill) {
            ctx.fillStyle = layer.fill;
            ctx.globalAlpha = layer.fill ? 0.35 : 1;
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.lineWidth = 2;
          ctx.strokeStyle = layer.stroke ?? "#5AAABF";
          ctx.stroke();
        }
      } else if (layer.mark === "point") {
        for (const prim of layer.primitives ?? []) {
          if (!Number.isFinite(prim.x) || !Number.isFinite(prim.y)) continue;
          const [cx, cy] = toCanvasPoint(scene, prim.x, prim.y);
          const colour = layer.stroke ?? "#dc2626";
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.strokeStyle = colour;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx - 8, cy);
          ctx.lineTo(cx + 8, cy);
          ctx.moveTo(cx, cy - 8);
          ctx.lineTo(cx, cy + 8);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  };

  const drawLifters = () => {
    for (const layer of lifterLayers) {
      const count = Math.max(0, layer.count | 0);
      const liftH = scene.discRadius * scene.scale * layer.height;
      const liftW = scene.discRadius * scene.scale * layer.width;
      for (let index = 0; index < count; index += 1) {
        const baseAngle = wallAngle + (index / count) * Math.PI * 2;
        ctx.save();
        ctx.translate(scene.center.x, scene.center.y);
        ctx.rotate(baseAngle);
        ctx.translate(scene.discRadius * scene.scale - liftH / 2, 0);
        ctx.beginPath();
        ctx.rect(-liftH / 2, -liftW / 2, liftH, liftW);
        ctx.fillStyle = layer.fill ?? "#94a3b8";
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(scene.center.x, scene.center.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = chrome.discCenterFill;
    ctx.fill();
    ctx.restore();
  };

  const drawRadials = () => {
    for (const layer of radialLayers) {
      for (const prim of layer.primitives ?? []) {
        if (!Number.isFinite(prim.theta)) continue;
        const canvasAngle = -prim.theta;
        const ex = scene.center.x + scene.discRadius * scene.scale * Math.cos(canvasAngle);
        const ey = scene.center.y + scene.discRadius * scene.scale * Math.sin(canvasAngle);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(scene.center.x, scene.center.y);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = layer.stroke ?? "#fbbf24";
        ctx.lineWidth = 1.2;
        if (layer.dash) ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(ex, ey, 4, 0, Math.PI * 2);
        ctx.fillStyle = layer.stroke ?? "#fbbf24";
        ctx.fill();
        if (layer.label) {
          const off = 14;
          ctx.font = `bold 10px ${typography.headingFontFamily ?? typography.bodyFontFamily ?? "sans-serif"}`;
          ctx.fillStyle = layer.stroke ?? "#fbbf24";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(layer.label, ex + Math.cos(canvasAngle) * off, ey + Math.sin(canvasAngle) * off);
        }
        ctx.restore();
      }
    }
  };

  const drawParticles = frame => {
    if (!particleLayer) return;
    ctx.save();
    ctx.fillStyle = particleLayer.stroke ?? "#EC7424";
    for (const point of frame.points?.filter(point => point.inDisc !== false && Number.isFinite(point.x) && Number.isFinite(point.y)) ?? []) {
      const [cx, cy] = toCanvasPoint(scene, point.x, point.y);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  const renderFrame = frame => {
    drawStatic();
    if (frame) drawParticles(frame);
    drawLifters();
    drawRadials();
  };

  const persistState = () => {
    canvas.__discChartRuntimeState = { wallAngle, elapsed };
  };
  if (particleLayer && particleLayer.frames?.length) {
    const frames = particleLayer.frames;
    const tValues = frames.map(frame => frame.t);
    renderFrame(frames[frameIndexForElapsed(tValues, elapsed, scene.playback)] ?? frames[0] ?? null);
    persistState();
    let playing = true;
    let destroyed = false;
    let lastTs = null;
    canvas.scrubTo = index => {
      playing = false;
      const frameIndex = Math.max(0, Math.min(frames.length - 1, index | 0));
      elapsed = tValues[frameIndex] ?? elapsed;
      renderFrame(frames[frameIndex] ?? null);
      persistState();
    };
    canvas.scrubToValue = value => {
      playing = false;
      elapsed = Number(value) || 0;
      renderFrame(frames[frameIndexForValue(tValues, value)] ?? null);
      persistState();
    };
    canvas.play = () => { playing = true; };
    canvas.pause = () => { playing = false; };
    canvas.destroy = () => {
      destroyed = true;
      persistState();
      clearCanvas(ctx, scene.width, scene.height);
    };
    if (frames.length > 1 && tValues[0] != null && typeof requestAnimationFrame === "function") {
      const step = ts => {
        if (destroyed) return;
        const dt = lastTs == null ? 0 : Math.min((ts - lastTs) / 1000, 0.05);
        lastTs = ts;
        if (playing) {
          wallAngle -= dt * (scene.playback.wallSpeed ?? 2.35);
          elapsed += dt;
          persistState();
          renderFrame(frames[frameIndexForElapsed(tValues, elapsed, scene.playback)] ?? null);
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  } else {
    renderFrame(null);
    persistState();
  }
  if (typeof canvas.destroy !== "function") {
    canvas.destroy = () => clearCanvas(ctx, scene.width, scene.height);
  }
  return canvas;
}
