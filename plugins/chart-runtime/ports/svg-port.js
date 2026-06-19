import { clearElement, createSvgElement, ownerDocumentFor, selectChartSvg } from "../graphics/svg-dom.js";

function renderNode(parent, node) {
  if (!node) return null;
  if (node.kind === "defs" || node.kind === "clipPath" || node.kind === "group") {
    const tagName = node.kind === "clipPath" ? "clipPath" : node.kind === "defs" ? "defs" : "g";
    const element = createSvgElement(ownerDocumentFor(parent), tagName);
    parent.appendChild(element);
    for (const [name, value] of Object.entries(node.attrs ?? {})) {
      if (value != null) element.setAttribute(name, String(value));
    }
    for (const child of node.children ?? []) renderNode(element, child);
    return element;
  }
  const element = createSvgElement(ownerDocumentFor(parent), node.kind);
  parent.appendChild(element);
  for (const [name, value] of Object.entries(node.attrs ?? {})) {
    if (value != null) element.setAttribute(name, String(value));
  }
  if (node.text != null) element.textContent = String(node.text);
  for (const child of node.children ?? []) renderNode(element, child);
  return element;
}

export function renderSvgScene(container, scene) {
  const svg = selectChartSvg(container, scene.width, scene.height).node();
  for (const node of scene.nodes ?? []) renderNode(svg, node);
  return svg;
}

export function destroySvgNode(node) {
  clearElement(node);
}
