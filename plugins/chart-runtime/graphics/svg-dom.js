const SVG_NS = "http://www.w3.org/2000/svg";

export function ownerDocumentFor(node) {
  return node?.ownerDocument ?? globalThis.document ?? null;
}

export function createSvgElement(doc, tagName) {
  if (!doc?.createElementNS) throw new Error("SVG rendering requires a document with createElementNS");
  return doc.createElementNS(SVG_NS, tagName);
}

export function clearElement(node) {
  while (node?.firstChild) node.removeChild(node.firstChild);
}

export function removeMatchingDescendants(node, selector) {
  if (!node?.querySelectorAll) return;
  for (const match of Array.from(node.querySelectorAll(selector))) match.remove();
}

export function wrapSvgNode(node) {
  return {
    append(tagName) {
      const child = createSvgElement(ownerDocumentFor(node), tagName);
      node.appendChild(child);
      return wrapSvgNode(child);
    },
    attr(name, value) {
      if (value == null) node.removeAttribute?.(name);
      else node.setAttribute?.(name, String(value));
      return this;
    },
    style(name, value) {
      if (node?.style) node.style[name] = value == null ? "" : String(value);
      return this;
    },
    text(value) {
      node.textContent = value == null ? "" : String(value);
      return this;
    },
    node() {
      return node;
    }
  };
}

export function selectChartSvg(container, width, height) {
  const tag = String(container?.tagName ?? "").toLowerCase();
  if (tag === "svg") {
    clearElement(container);
    return wrapSvgNode(container)
      .attr("class", "gog")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`);
  }
  removeMatchingDescendants(container, "svg.gog");
  const svg = createSvgElement(ownerDocumentFor(container), "svg");
  container.appendChild(svg);
  return wrapSvgNode(svg)
    .attr("class", "gog")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`);
}
