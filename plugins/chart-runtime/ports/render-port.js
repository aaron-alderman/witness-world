import { cartesianProbeReadout, polarProbeReadout } from "../graphics/hit-testing.js";
import { invertLinear, projectLinear } from "../graphics/scales.js";
import { renderCanvasScene } from "./canvas-port.js";
import { destroySvgNode, renderSvgScene } from "./svg-port.js";

function attachCartesianHooks(node, scene, { plan }) {
  const renderProbe = xVal => Number.isFinite(xVal) ? cartesianProbeReadout(plan, xVal) : null;
  node.probeAt = renderProbe;
  node.probeAtPoint = (xPx, yPx) => {
    const plotX = Number(xPx) - scene.margin.left;
    const plotY = Number(yPx) - scene.margin.top;
    if (!Number.isFinite(plotX) || !Number.isFinite(plotY)) return null;
    if (plotX < 0 || plotX > scene.innerW || plotY < 0 || plotY > scene.innerH) return null;
    return renderProbe(invertLinear(scene.scales.x, plotX));
  };
  node.projectPoint = (xVal, yVal) => ({
    x: projectLinear(scene.scales.x, xVal) + scene.margin.left,
    y: projectLinear(scene.scales.y, yVal) + scene.margin.top
  });
  const destroy = node.destroy;
  node.destroy = () => {
    if (typeof destroy === "function") destroy();
    else destroySvgNode(node);
  };
  return node;
}

function attachPolarHooks(node, scene) {
  node.probeAtPoint = (x, y) => polarProbeReadout(scene, x, y);
  const destroy = node.destroy;
  node.destroy = () => {
    if (typeof destroy === "function") destroy();
    else destroySvgNode(node);
  };
  return node;
}

export function renderScene(container, scene, { plan } = {}) {
  if (scene.renderer === "canvas") {
    return renderCanvasScene(container, scene);
  }
  const node = renderSvgScene(container, scene);
  if (scene.frame === "cartesian") return attachCartesianHooks(node, scene, { plan });
  if (scene.frame === "polar") return attachPolarHooks(node, scene);
  return node;
}
