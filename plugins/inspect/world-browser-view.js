export function renderWorldBrowserViewFactory() {
  return String.raw`
    const sourceDefinitionRange = ${sourceDefinitionRange.toString()};
    const renderWorldSourceTextView = ${renderWorldSourceTextView.toString()};
    const renderWorldSourceDocumentView = ${renderWorldSourceDocumentView.toString()};
    const renderWorldThingListView = ${renderWorldThingListView.toString()};
    const renderWorldWitnessBrowserView = ${renderWorldWitnessBrowserView.toString()};
    const renderWorldProcessExplorerView = ${renderWorldProcessExplorerView.toString()};
    const renderWorldPrimitiveBrowserView = ${renderWorldPrimitiveBrowserView.toString()};
    const renderWorldSystemOverviewView = ${renderWorldSystemOverviewView.toString()};
    const renderWorldSystemRows = ${renderWorldSystemRows.toString()};
    const renderWorldSystemJson = ${renderWorldSystemJson.toString()};
  `;
}

export function sourceDefinitionRange(text, focusId, byId = {}, selectedId = "") {
  const node = byId[focusId] || byId[selectedId];
  const src = (node?.sources || []).slice(-1)[0];
  if (!src || !text) return null;
  const lines = text.split(/\r?\n/);
  if (src.line != null) {
    const startLine = src.line - 1;
    let endLine = lines.length - 1;
    for (let i = startLine + 1; i < lines.length; i++) {
      if (/^\s*\[\[?/.test(lines[i]) && i > startLine) {
        endLine = i - 1;
        break;
      }
    }
    return { start: startLine, end: endLine };
  }
  const candidates = [src.values?.id, src.values?.soul, src.values?.version, focusId].filter(Boolean).map(String);
  const section = src.section ? "[[" + src.section + "]]" : null;
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const nearSection = !section || lines[i].trim() === section;
    const hasCandidate = candidates.some(c => lines[i].includes('"' + c + '"') || lines[i].includes(c));
    if (nearSection || hasCandidate) {
      if (nearSection) {
        for (let j = i; j < Math.min(lines.length, i + 12); j++) {
          if (candidates.some(c => lines[j].includes('"' + c + '"') || lines[j].includes(c))) {
            startLine = i;
            break;
          }
        }
      }
      if (startLine < 0 && hasCandidate) startLine = Math.max(0, i - 2);
      if (startLine >= 0) break;
    }
  }
  if (startLine < 0) return null;
  let endLine = lines.length - 1;
  for (let i = startLine + 1; i < lines.length; i++) {
    if (/^\s*\[\[?/.test(lines[i]) && i > startLine + 1) {
      endLine = i - 1;
      break;
    }
  }
  return { start: startLine, end: endLine };
}

export function renderWorldSourceTextView({
  text = "",
  focusId = "",
  selectedId = "",
  byId = {},
  escapeHtml = value => String(value ?? "")
} = {}) {
  const range = sourceDefinitionRange(text, focusId, byId, selectedId);
  const ids = Object.keys(byId).filter(id => id && id.length > 2).sort((a, b) => b.length - a.length).slice(0, 400);
  const linkLine = line => {
    let out = escapeHtml(line);
    for (const id of ids) {
      const escaped = escapeHtml(id).replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      out = out.replace(new RegExp('(&quot;)?\\b' + escaped + '\\b(&quot;)?', "g"), match => '<button class="world-source-ref" data-world-select="' + escapeHtml(id) + '">' + match + "</button>");
    }
    return out;
  };
  return text.split(/\r?\n/).map((line, i) => {
    const highlighted = range && i >= range.start && i <= range.end;
    const lineNumAttrs = highlighted && focusId ? ' data-world-jump-to-graph="' + escapeHtml(focusId) + '" title="Jump to object in graph"' : "";
    return '<div class="world-source-line ' + (highlighted ? "world-source-highlight" : "") + '"><span class="world-source-line-number"' + lineNumAttrs + ">" + (i + 1) + '</span><span class="world-source-line-code">' + linkLine(line) + "</span></div>";
  }).join("");
}

export function renderWorldSourceDocumentView({
  doc = null,
  sourceFiles = [],
  worldGraphSourceFocus = "",
  selectedId = "",
  byId = {},
  escapeHtml = value => String(value ?? "")
} = {}) {
  const selectedFile = doc?.file || sourceFiles[0]?.file || "";
  const sidebar = '<aside class="surface-split-pane-sidebar world-source-sidebar"><div class="surface-stack"><strong>Source files</strong>'
    + (sourceFiles.length
      ? sourceFiles.map(src => '<button class="world-source-file-button ' + (src.file === selectedFile ? "world-source-file-active" : "") + '" data-world-source-file="' + escapeHtml(src.file || "") + '">' + escapeHtml((src.file || "").split(/[\\/]/).slice(-2).join("/")) + "</button>").join("")
      : '<div class="world-source-empty surface-empty surface-empty-state">No witnessed source files.</div>')
    + "</div></aside>";
  const body = doc
    ? '<section class="surface-split-pane-main world-source-editor"><div class="world-source-title">' + escapeHtml(doc.file || "Source") + '</div><div class="world-source-code">' + renderWorldSourceTextView({
      text: doc.text || "",
      focusId: worldGraphSourceFocus || selectedId,
      selectedId,
      byId,
      escapeHtml
    }) + "</div></section>"
    : '<section class="surface-split-pane-main world-source-editor"><div class="world-source-title">Source Browser</div><div class="world-source-empty surface-empty surface-empty-state">Select a source file. Definitions linked to the selected object will be highlighted.</div></section>';
  return '<div class="world-document-view"><div class="surface-split-pane world-source-workbench">' + sidebar + body + "</div></div>";
}

export function renderWorldThingListView({
  nodes = [],
  selectedKind = "thing",
  escapeHtml = value => String(value ?? "")
} = {}) {
  const kinds = [...new Set(nodes.map(n => n.kind || "thing"))].sort();
  const items = nodes
    .filter(n => (n.kind || "thing") === selectedKind)
    .sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
  return '<div class="world-primitive-browser surface-stack"><h2>Thing List</h2><div class="world-primitive-grid"><div class="world-primitive-list surface-item-list"><strong>Kinds</strong>'
    + kinds.map(k => '<button class="surface-item-button world-primitive-item" data-world-kind="' + escapeHtml(k) + '">' + escapeHtml(k) + ' <span class="world-node-kind">' + nodes.filter(n => (n.kind || "thing") === k).length + '</span></button>').join("")
    + '</div><div class="world-primitive-list surface-item-list" style="grid-column: span 2"><strong>' + escapeHtml(selectedKind) + "</strong>"
    + items.map(n => '<button class="surface-item-button world-primitive-item" data-world-select="' + escapeHtml(n.id) + '"><strong>' + escapeHtml(n.label || n.id) + '</strong><br><span class="world-node-kind">' + escapeHtml(n.context || "") + '</span></button>').join("")
    + "</div></div></div>";
}

export function renderWorldWitnessBrowserView({
  selectedNode = null,
  escapeHtml = value => String(value ?? "")
} = {}) {
  const witnesses = selectedNode?.recentWitnesses || [];
  if (!selectedNode) return '<div class="world-witness-browser"><h2>Witness Browser</h2><div class="world-command-empty">Select an object to inspect its witnessed history.</div></div>';
  return '<div class="world-witness-browser"><h2>Witness Browser</h2><div class="world-command-meta">' + escapeHtml(String(selectedNode.label || selectedNode.id)) + " / " + escapeHtml(selectedNode.kind || "thing") + "</div>"
    + (witnesses.length
      ? witnesses.map(entry => '<article class="world-witness-card surface-item surface-stack"><div><strong>' + escapeHtml(entry.process || entry.id) + '</strong></div><div class="world-command-meta">' + escapeHtml(entry.id || "") + (entry.actor ? " / actor " + escapeHtml(entry.actor) : "") + (entry.cause ? " / cause " + escapeHtml(entry.cause) : "") + '</div><pre class="surface-code">' + escapeHtml(JSON.stringify(entry.body ?? {}, null, 2)) + "</pre></article>").join("")
      : '<div class="world-command-empty">No recent witnessed history for this object.</div>')
    + "</div>";
}

export function renderWorldProcessExplorerView() {
  return '<div class="world-primitive-browser surface-stack"><h2>Process Explorer</h2><div class="world-primitive-list surface-item-list"><a class="surface-link-item" href="/process"><strong>Open Process View</strong><br><span class="world-node-kind">Dedicated process graph, run inspector, and replay</span></a></div></div>';
}

export function renderWorldSystemJson(value, escapeHtml = input => String(input ?? "")) {
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return escapeHtml(String(value));
  return '<pre class="surface-code">' + escapeHtml(JSON.stringify(value, null, 2)) + "</pre>";
}

export function renderWorldSystemRows(rows = [], {
  empty = "No rows.",
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!rows.length) return '<div class="surface-empty surface-empty-state">' + escapeHtml(empty) + "</div>";
  return '<div class="world-primitive-list surface-item-list">'
    + rows.map(row => {
      const id = row.id || row.capability || row.file || row.process || row.kind || "row";
      const meta = [
        row.kind,
        row.status,
        row.source,
        row.targetKind && row.target ? row.targetKind + ":" + row.target : "",
        row.capability && row.capability !== id ? row.capability : ""
      ].filter(Boolean).join(" / ");
      const details = Object.fromEntries(Object.entries(row).filter(([key]) => !["id", "kind", "status", "source", "targetKind", "target", "capability"].includes(key)));
      return '<article class="surface-item surface-stack world-system-row"><div><strong>' + escapeHtml(id) + "</strong></div>"
        + (meta ? '<div class="world-command-meta">' + escapeHtml(meta) + "</div>" : "")
        + renderWorldSystemJson(details, escapeHtml)
        + "</article>";
    }).join("")
    + "</div>";
}

export function renderWorldSystemOverviewView({
  model = null,
  loading = false,
  error = "",
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (loading && !model) return '<div class="world-primitive-browser surface-stack" data-world-system-overview><h2>System Overview</h2><div class="surface-empty surface-empty-state">Loading system overview...</div></div>';
  if (error && !model) return '<div class="world-primitive-browser surface-stack" data-world-system-overview><h2>System Overview</h2><div class="surface-empty surface-empty-state">' + escapeHtml(error) + "</div></div>";
  const summary = model?.summary ?? {};
  const summaryRows = Object.entries(summary).map(([key, value]) => ({ id: key, status: value }));
  return '<div class="world-primitive-browser surface-stack" data-world-system-overview>'
    + "<h2>System Overview</h2>"
    + '<div class="world-primitive-grid">'
    + '<section class="surface-stack"><h3>World</h3>' + renderWorldSystemRows(summaryRows, { empty: "No summary.", escapeHtml }) + "</section>"
    + '<section class="surface-stack"><h3>Runtime</h3>' + renderWorldSystemRows([model?.runtime ?? {}], { empty: "Runtime health unavailable.", escapeHtml }) + "</section>"
    + '<section class="surface-stack"><h3>Capabilities</h3>' + renderWorldSystemRows(model?.capabilities?.definitions ?? [], { empty: "No capability definitions.", escapeHtml }) + "</section>"
    + '<section class="surface-stack"><h3>Capability Installs</h3>' + renderWorldSystemRows(model?.capabilities?.installs ?? [], { empty: "No capability installs.", escapeHtml }) + "</section>"
    + '<section class="surface-stack"><h3>Boundaries</h3>' + renderWorldSystemRows(model?.boundaries ?? [], { empty: "No boundaries.", escapeHtml }) + "</section>"
    + '<section class="surface-stack"><h3>Processes</h3>' + renderWorldSystemRows(model?.processes ?? [], { empty: "No recent process observations.", escapeHtml }) + "</section>"
    + '<section class="surface-stack"><h3>Sources</h3>' + renderWorldSystemRows(model?.sources ?? [], { empty: "No witnessed source files.", escapeHtml }) + "</section>"
    + '<section class="surface-stack"><h3>Proofs</h3>' + renderWorldSystemRows(model?.proofs ?? [], { empty: "No proof evidence.", escapeHtml }) + "</section>"
    + '<section class="surface-stack"><h3>External Systems</h3>' + renderWorldSystemRows(model?.externalSystems ?? [], { empty: "No external systems.", escapeHtml }) + "</section>"
    + '<section class="surface-stack"><h3>Recent Evidence</h3>' + renderWorldSystemRows(model?.recentEvidence ?? [], { empty: "No recent evidence.", escapeHtml }) + "</section>"
    + "</div>"
    + (error ? '<div class="surface-empty surface-empty-state">' + escapeHtml(error) + "</div>" : "")
    + "</div>";
}

export function renderWorldPrimitiveBrowserView({
  primitiveIndex = new Map(),
  selectedKind = "",
  selectedValue = "",
  byId = {},
  escapeHtml = value => String(value ?? "")
} = {}) {
  const kinds = [...primitiveIndex.keys()].sort();
  const currentKind = selectedKind || kinds[0] || "";
  const bucket = primitiveIndex.get(currentKind) || new Map();
  const items = [...bucket.values()].sort((a, b) => a.value.localeCompare(b.value));
  const selectedItem = bucket.get(selectedValue) || items[0] || null;
  const refs = selectedItem ? [...selectedItem.where].sort() : [];
  return '<div class="world-primitive-browser surface-stack"><h2>Primitive browser</h2><div class="world-primitive-grid"><div class="world-primitive-list surface-item-list"><strong>Kinds</strong>'
    + kinds.map(k => '<button class="surface-item-button world-primitive-item" data-world-primitive-kind-only="' + escapeHtml(k) + '">' + escapeHtml(k) + ' <span class="world-node-kind">' + (primitiveIndex.get(k)?.size || 0) + '</span></button>').join("")
    + '</div><div class="world-primitive-list surface-item-list"><strong>' + escapeHtml(currentKind || "none") + "</strong>"
    + items.map(item => '<button class="surface-item-button world-primitive-item" data-world-primitive="' + escapeHtml(item.value) + '" data-world-primitive-kind="' + escapeHtml(currentKind) + '">' + escapeHtml(item.value) + '<br><span class="world-node-kind">count ' + item.count + '</span></button>').join("")
    + '</div><div class="world-primitive-list surface-item-list"><strong>References</strong>'
    + refs.map(ref => {
      const id = String(ref).split(".")[0].split(/\u2192/)[0];
      return '<button class="surface-item-button world-primitive-item" data-world-select="' + escapeHtml(byId[id] ? id : "") + '" data-world-primitive-ref="' + escapeHtml(ref) + '">' + escapeHtml(ref) + "</button>";
    }).join("")
    + "</div></div></div>";
}
