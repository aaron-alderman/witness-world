export function renderWorldGraphViewFactory() {
  return String.raw`
    const renderWorldInspectorView = ${renderWorldInspectorView.toString()};
    const renderWorldGraphCanvasView = ${renderWorldGraphCanvasView.toString()};
  `;
}

export function renderWorldInspectorView({
  selectedKind = "",
  nodes = [],
  selectedId = "",
  byId = {},
  edges = [],
  worldGraphVersionStatus = null,
  linkRef = value => String(value ?? ""),
  linkKind = value => String(value ?? ""),
  linkPrimitive = (kind, value) => String(value ?? ""),
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (selectedKind) {
    const matches = nodes
      .filter(n => (n.kind || "thing") === selectedKind)
      .sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
    return "<h2>" + escapeHtml(selectedKind) + " list</h2>"
      + '<div class="world-inspector-row"><span class="world-inspector-key">count</span><span>' + matches.length + "</span></div>"
      + '<button class="world-ref-button" data-world-clear-kind>Back to selected object</button>'
      + '<div class="world-inspector-list">' + matches.map(n =>
        '<button class="surface-item-button world-inspector-item" data-world-select="' + escapeHtml(n.id) + '"><strong>' + escapeHtml(n.label || n.id) + '</strong><br><span class="world-node-kind">' + escapeHtml(n.context || "") + "</span></button>"
      ).join("") + "</div>";
  }
  const node = byId[selectedId];
  const incoming = edges.filter(e => e.to === selectedId).slice(0, 24);
  const outgoing = edges.filter(e => e.from === selectedId).slice(0, 24);
  if (!node) return "<h2>Selection</h2><p>Select a node in the graph.</p>";

  const renderTypedValue = value => {
    if (!value || typeof value !== "object" || !value.type) return "<code>" + escapeHtml(JSON.stringify(value)) + "</code>";
    const type = '<span class="world-value-type">' + escapeHtml(value.type) + "</span>";
    if (value.type === "ref") return '<span class="world-value-widget">' + type + linkRef(value.target) + "</span>";
    if (value.type === "list") return '<span class="world-value-widget">' + type + '<span class="world-value-list">' + (value.items || []).map(renderTypedValue).join("") + "</span></span>";
    if (value.type === "record") {
      const recordRows = Object.entries(value.fields || {}).map(([key, entryValue]) =>
        '<span class="world-value-record-row"><span class="world-inspector-key">' + escapeHtml(key) + "</span><span>" + renderTypedValue(entryValue) + "</span></span>"
      ).join("");
      return '<span class="world-value-widget">' + type + '<span class="world-value-record">' + recordRows + "</span></span>";
    }
    const primitiveValue = value.value ?? (value.type === "null" ? "null" : "");
    return '<span class="world-value-widget">' + type + "<span>" + linkPrimitive(value.type, primitiveValue) + "</span></span>";
  };
  const valueRef = value => {
    if (typeof value === "string" && byId[value]) return linkRef(value);
    if (typeof value === "string") return linkPrimitive("string", value);
    if (typeof value === "number") return linkPrimitive("number", value);
    if (typeof value === "boolean") return linkPrimitive("boolean", value);
    if (Array.isArray(value)) return '<span class="world-value-list">' + value.map(valueRef).join("") + "</span>";
    if (value && typeof value === "object") return renderTypedValue(value);
    return linkPrimitive("null", value ?? "null");
  };
  const propertyList = (title, props) => '<div class="world-inspector-list"><strong>' + title + "</strong>" + ((props || []).length
    ? props.map(p => '<div class="world-inspector-row"><span class="world-inspector-key">' + escapeHtml(p.key) + "</span><span>" + valueRef(p.value) + "</span></div>").join("")
    : '<div class="world-node-kind">none</div>') + "</div>";
  const edgeItem = (edge, dir) => {
    const other = dir === "in" ? edge.from : edge.to;
    const props = (edge.properties || []).length
      ? '<div class="world-edge-props">' + edge.properties.map(p => '<span class="world-badge">' + escapeHtml(p.key) + "=" + escapeHtml(JSON.stringify(p.value)) + "</span>").join("") + "</div>"
      : "";
    return '<div class="surface-item surface-stack world-inspector-item">' + linkRef(other) + '<span class="world-node-kind">' + escapeHtml(edge.rel || "") + "</span>" + props + "</div>";
  };
  const edgeList = (title, list, dir) => '<div class="world-inspector-list"><strong>' + title + "</strong>" + (list.length ? list.map(edge => edgeItem(edge, dir)).join("") : '<div class="world-node-kind">none</div>') + "</div>";
  const associationPropertyList = (node.associationProperties || []).length
    ? '<div class="world-inspector-list"><strong>Association properties</strong>' + node.associationProperties.slice(0, 24).map(association =>
      '<div class="surface-item surface-stack world-inspector-item">' + linkRef(association.from) + ' <span class="world-node-kind">' + escapeHtml(association.rel) + "</span> " + linkRef(association.to)
      + '<div class="world-edge-props">' + (association.properties || []).map(p => '<span class="world-badge">' + escapeHtml(p.key) + "=" + escapeHtml(JSON.stringify(p.value)) + "</span>").join("") + "</div></div>"
    ).join("") + "</div>"
    : "";
  const sourceList = (node.sources || []).length
    ? '<div class="world-inspector-list"><strong>Source definition</strong>' + node.sources.slice(-6).reverse().map(src =>
      '<div class="surface-item surface-stack world-inspector-item"><div>' + escapeHtml(src.section || "") + '</div><button class="world-ref-button" data-world-source-file="' + escapeHtml(src.file || "") + '" data-world-source-focus="' + escapeHtml(node.id) + '">' + escapeHtml(src.file || "") + (src.line != null ? " (line " + src.line + ")" : "") + '</button><pre class="world-source-ast surface-code">' + escapeHtml(JSON.stringify(src.values || {}, null, 2)) + "</pre></div>"
    ).join("") + "</div>"
    : "";
  const witnessList = (node.recentWitnesses || []).length
    ? '<div class="world-inspector-list"><strong>Recent witnesses</strong>' + node.recentWitnesses.slice(0, 6).map(entry =>
      '<div class="surface-item surface-stack world-inspector-item"><div><strong>' + escapeHtml(entry.process || entry.id) + "</strong></div><div class=\"world-node-kind\">" + escapeHtml(entry.actor || "") + '</div><button class="world-ref-button" data-world-mode="witness">Open witness browser</button></div>'
    ).join("") + "</div>"
    : "";
  const processList = (node.processEvents || []).length
    ? '<div class="world-inspector-list"><strong>Process explorer</strong>' + node.processEvents.map(entry =>
      '<div class="surface-item surface-stack world-inspector-item"><div><strong>' + escapeHtml(entry.event) + '</strong></div><div class="world-node-kind">' + escapeHtml(String(entry.stepCount || 0)) + " steps / " + escapeHtml(String(entry.asyncCount || 0)) + ' async</div><button class="world-ref-button" data-world-open-process-program="' + escapeHtml(node.id) + '" data-world-open-process-event="' + escapeHtml(entry.event) + '">Open process view</button></div>'
    ).join("") + "</div>"
    : (node.processSelection?.program && node.processSelection?.event
      ? '<div class="world-inspector-list"><strong>Process explorer</strong><div class="surface-item surface-stack world-inspector-item"><div><strong>' + escapeHtml(node.processSelection.event) + '</strong></div><div class="world-node-kind">' + escapeHtml(node.processSelection.program) + '</div><button class="world-ref-button" data-world-open-process-program="' + escapeHtml(node.processSelection.program) + '" data-world-open-process-event="' + escapeHtml(node.processSelection.event) + '">Open process view</button></div></div>'
      : "");
  const versionState = node.widgetVersionState || null;
  const versionStatus = worldGraphVersionStatus && worldGraphVersionStatus.soul === node.id
    ? '<div class="surface-status-box" data-level="' + escapeHtml(worldGraphVersionStatus.level || "info") + '">' + escapeHtml(worldGraphVersionStatus.message || "") + "</div>"
    : "";
  const widgetVersionList = (node.widgetVersions || []).length
    ? '<div class="surface-item-list"><strong>Widget versions</strong>'
      + '<div class="world-inspector-row"><span class="world-inspector-key">active</span><span>' + (versionState?.activeVersion ? escapeHtml(versionState.activeVersion) : "none") + "</span></div>"
      + node.widgetVersions.map(entry => {
        const badges = [
          entry.isActive ? "active" : "",
          entry.transitionFromActive ? ("from current: " + entry.transitionFromActive) : "",
          entry.transitionToActive ? ("to current: " + entry.transitionToActive) : ""
        ].filter(Boolean).map(label => '<span class="world-badge">' + escapeHtml(label) + "</span>").join("");
        const actions = entry.isActive
          ? ""
          : '<div class="surface-actions-compact"><button class="world-ref-button" data-world-widget-activate="' + escapeHtml(entry.soul) + '" data-world-widget-version="' + escapeHtml(entry.version) + '">Activate</button></div>';
        return '<div class="surface-item world-version-item"><div><strong>' + escapeHtml(entry.version) + '</strong></div><div class="world-node-kind">' + escapeHtml(entry.kind || "widget") + " / index " + escapeHtml(String(entry.index ?? 0)) + '</div><div class="world-badges">' + badges + '</div>' + actions + '<pre class="world-source-ast surface-code">' + escapeHtml(JSON.stringify(entry.propsPreview ?? {}, null, 2)) + "</pre></div>";
      }).join("")
      + (versionState?.rollbackAvailable ? '<div class="surface-actions-compact"><button class="world-ref-button" data-world-widget-rollback="' + escapeHtml(versionState.soul) + '">Rollback to ' + escapeHtml(versionState.rollbackVersion || "") + "</button></div>" : "")
      + ((versionState?.history || []).length
        ? '<div class="surface-item-list"><strong>Activation history</strong>' + versionState.history.slice(-6).reverse().map(entry =>
          '<div class="surface-item"><strong>' + escapeHtml(entry.version || "") + '</strong><br><span class="world-node-kind">' + escapeHtml(entry.actor || "") + " / " + escapeHtml(entry.witnessId || "") + "</span></div>"
        ).join("") + "</div>"
        : "")
      + versionStatus
      + "</div>"
    : "";
  const rows = [
    ["id", linkRef(node.id)],
    ["label", escapeHtml(String(node.label || node.id))],
    ["kind", linkKind(node.kind || "thing")],
    ["surface", node.surfaceLabel ? escapeHtml(String(node.surfaceLabel)) : ""],
    ["context", node.context ? linkRef(node.context) : ""],
    ["href", node.href ? escapeHtml(String(node.href)) : ""]
  ].filter(([, value]) => value !== null && value !== undefined && String(value) !== "");
  const badges = (node.badges || []).map(b => '<span class="world-badge">' + escapeHtml(String(b.label || b)) + "</span>").join("");
  return "<h2>Selected Object</h2>"
    + rows.map(([key, value]) => '<div class="world-inspector-row"><span class="world-inspector-key">' + escapeHtml(key) + "</span><span>" + value + "</span></div>").join("")
    + '<div class="world-badges">' + badges + "</div>"
    + propertyList("Object properties", node.properties)
    + propertyList("Values", node.values)
    + edgeList("Associations from this object", outgoing, "out")
    + edgeList("Associations to this object", incoming, "in")
    + associationPropertyList
    + processList
    + widgetVersionList
    + witnessList
    + sourceList;
}

export function renderWorldGraphCanvasView({
  width = 0,
  height = 0,
  nodes = [],
  edges = [],
  groups = [],
  byId = {},
  selectedId = "",
  escapeHtml = value => String(value ?? "")
} = {}) {
  const marker = '<defs><marker id="world-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L7,3 z" fill="#777" /></marker><marker id="world-arrow-owner" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L7,3 z" fill="#c7352f" /></marker></defs>';
  const svg = '<svg class="world-graph-svg" width="' + width + '" height="' + height + '">' + marker + edges.map(edge => {
    const from = byId[edge.from];
    const to = byId[edge.to];
    if (!from || !to) return "";
    const x1 = (from.x || 0) + 190;
    const y1 = (from.y || 0) + 28;
    const x2 = (to.x || 0);
    const y2 = (to.y || 0) + 28;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const style = edge.style || "relation";
    const markerId = style === "ownership" ? "world-arrow-owner" : "world-arrow";
    return '<line class="world-edge-' + escapeHtml(style) + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" marker-end="url(#' + markerId + ')" />'
      + '<text class="world-edge-label" x="' + mx + '" y="' + (my - 3) + '">' + escapeHtml(String(edge.rel || "")) + "</text>";
  }).join("") + "</svg>";
  const groupHtml = groups.map(group =>
    '<div class="world-context-box" style="left:' + (group.x || 0) + "px;top:" + (group.y || 0) + "px;width:" + (group.width || 0) + "px;height:" + (group.height || 0) + 'px"><div class="world-context-label">' + escapeHtml(group.label || group.id || "") + "</div></div>"
  ).join("");
  const nodeHtml = nodes.map(node =>
    '<div class="world-node world-node-' + escapeHtml(node.kind || "thing") + (node.id === selectedId ? " world-node-selected" : "") + '" data-world-node-id="' + escapeHtml(node.id) + '" style="left:' + (node.x || 0) + "px;top:" + (node.y || 0) + 'px"><div class="world-node-kind">' + escapeHtml(node.kind || "thing") + '</div><a href="' + escapeHtml(node.href || "#") + '" title="' + escapeHtml(node.id) + '">' + escapeHtml(String(node.label || node.id)) + '</a><div class="world-badges">' + (node.badges || []).map(b => '<span class="world-badge">' + escapeHtml(String(b.label || b)) + "</span>").join("") + "</div></div>"
  ).join("");
  return '<div class="world-graph-canvas"><div class="world-graph-content" style="width:' + width + "px;height:" + height + 'px">' + groupHtml + svg + nodeHtml + "</div></div>";
}
