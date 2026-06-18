export function renderSurfaceInspectorPanelViewFactory() {
  return String.raw`
    const renderSurfaceInspectorEditorView = ${renderSurfaceInspectorEditorView.toString()};
    const renderSurfaceInspectorVersionsView = ${renderSurfaceInspectorVersionsView.toString()};
    const renderSurfaceInspectorOwnershipView = ${renderSurfaceInspectorOwnershipView.toString()};
    const renderSurfaceInspectorRuntimeCorrelationView = ${renderSurfaceInspectorRuntimeCorrelationView.toString()};
    const renderSurfaceInspectorPanelView = ${renderSurfaceInspectorPanelView.toString()};
    const renderSurfaceInspectorMenuView = ${renderSurfaceInspectorMenuView.toString()};
  `;
}

export function renderSurfaceInspectorEditorView({
  widgetId = "",
  authoredWidget = null,
  versionRows = [],
  widgetsLoaded = false,
  widgetsError = "",
  authority = { ok: false, reason: "" },
  currentActorPresent = false,
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!widgetId) return "";
  if (versionRows.length) {
    return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">Versioned widgets still use the dedicated version controls. This first save-back slice intentionally blocks direct editing for souls with authored widget versions.</div></section>';
  }
  if (!widgetsLoaded) {
    return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">Loading authored widget state...</div></section>';
  }
  if (widgetsError) {
    return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">Authored widget state is unavailable right now.</div></section>';
  }
  if (!authoredWidget) {
    return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">This selected element is not currently backed by a directly editable authored widget row.</div></section>';
  }
  const props = authoredWidget.props || {};
  const hiddenChecked = props.hidden === true ? " checked" : "";
  if (!authority.ok) {
    if (!currentActorPresent) {
      return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">' + escapeHtml(authority.reason || "This widget is read-only right now.") + "</div></section>";
    }
    return '<section><div class="surface-inspector-meta">Live Save-Back</div>'
      + '<div class="surface-inspector-summary">' + escapeHtml(authority.reason || "This widget is read-only right now.") + "</div>"
      + '<form class="surface-form" data-surface-inspector-proposal-form data-widget-id="' + escapeHtml(widgetId) + '">'
      + '<label class="surface-field"><span>Text</span><textarea name="text" rows="3">' + escapeHtml(String(props.text ?? "")) + "</textarea></label>"
      + '<label class="surface-field"><span>Title</span><input name="title" value="' + escapeHtml(String(props.title ?? "")) + '" /></label>'
      + '<label class="surface-field"><span>Class</span><input name="class" value="' + escapeHtml(String(props.class ?? "")) + '" /></label>'
      + '<label class="surface-field"><span>Hidden</span><input name="hidden" type="checkbox"' + hiddenChecked + " /></label>"
      + '<label class="surface-field"><span>Reason</span><input name="reason" placeholder="Why should this shared widget change?" /></label>'
      + '<div class="surface-actions-compact"><button type="submit" data-surface-inspector-propose>Propose Save-Back</button></div>'
      + "</form>"
      + '<div class="surface-inspector-summary">Direct save is blocked here, but you can create a real <code>widget.update</code> proposal from this live surface for later approval.</div>'
      + "</section>";
  }
  return '<section><div class="surface-inspector-meta">Live Save-Back</div>'
    + '<form class="surface-form" data-surface-inspector-edit-form data-widget-id="' + escapeHtml(widgetId) + '">'
    + '<label class="surface-field"><span>Text</span><textarea name="text" rows="3">' + escapeHtml(String(props.text ?? "")) + "</textarea></label>"
    + '<label class="surface-field"><span>Title</span><input name="title" value="' + escapeHtml(String(props.title ?? "")) + '" /></label>'
    + '<label class="surface-field"><span>Class</span><input name="class" value="' + escapeHtml(String(props.class ?? "")) + '" /></label>'
    + '<label class="surface-field"><span>Hidden</span><input name="hidden" type="checkbox"' + hiddenChecked + " /></label>"
    + '<div class="surface-actions-compact"><button type="submit" data-surface-inspector-save>Save Widget</button></div>'
    + "</form>"
    + '<div class="surface-inspector-summary">Writes a real <code>widget.update</code> witness for the selected widget. This first slice edits <code>text</code>, <code>title</code>, <code>class</code>, and <code>hidden</code>.</div>'
    + "</section>";
}

function renderSurfaceInspectorVersionsView({
  versionState = null,
  versionRows = [],
  versionAuthority = { ok: false, reason: "" },
  currentActorPresent = false,
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!versionRows.length) return "";
  const canProposeVersion = !versionAuthority.ok && currentActorPresent;
  return '<section><div class="surface-inspector-meta">Widget Versions</div><div class="surface-item-list">' + versionRows.map(row =>
      '<div class="surface-item">'
        + '<strong>' + escapeHtml(row.version || row.soul || "") + (row.isActive ? " [active]" : "") + "</strong>"
        + (row.transitionFromActive ? '<div class="surface-inspector-summary">Transition: ' + escapeHtml(row.transitionFromActive) + "</div>" : "")
        + (!row.isActive
          ? (versionAuthority.ok
            ? '<div class="surface-actions-compact"><button type="button" data-surface-inspector-activate="' + escapeHtml(row.soul || "") + '" data-surface-inspector-version="' + escapeHtml(row.version || "") + '">Activate</button></div>'
            : (canProposeVersion
              ? '<form class="surface-form" data-surface-inspector-version-proposal-form data-surface-inspector-proposal-process="widgetVersion.activate" data-surface-inspector-proposal-soul="' + escapeHtml(row.soul || "") + '" data-surface-inspector-proposal-version="' + escapeHtml(row.version || "") + '">'
                + '<label class="surface-field"><span>Reason</span><input name="reason" placeholder="Why should this version go live?" /></label>'
                + '<div class="surface-actions-compact"><button type="submit" data-surface-inspector-propose-version="activate">Propose Activate</button></div>'
              + "</form>"
              : '<div class="surface-inspector-summary">' + escapeHtml(versionAuthority.reason || "Sign in to propose version changes.") + "</div>"))
          : "")
      + "</div>"
    ).join("") + "</div>"
    + (versionState?.rollbackAvailable
      ? (versionAuthority.ok
        ? '<div class="surface-actions-compact"><button type="button" data-surface-inspector-rollback="' + escapeHtml(versionState.soul || "") + '">Rollback To ' + escapeHtml(versionState.rollbackVersion || "previous") + '</button></div>'
        : (canProposeVersion
          ? '<form class="surface-form" data-surface-inspector-version-proposal-form data-surface-inspector-proposal-process="widgetVersion.rollback" data-surface-inspector-proposal-soul="' + escapeHtml(versionState.soul || "") + '" data-surface-inspector-proposal-version="' + escapeHtml(versionState.rollbackVersion || "") + '">'
            + '<label class="surface-field"><span>Reason</span><input name="reason" placeholder="Why should this version be restored?" /></label>'
            + '<div class="surface-actions-compact"><button type="submit" data-surface-inspector-propose-version="rollback">Propose Rollback To ' + escapeHtml(versionState.rollbackVersion || "previous") + '</button></div>'
          + "</form>"
          : '<div class="surface-inspector-summary">' + escapeHtml(versionAuthority.reason || "Sign in to propose version changes.") + "</div>"))
      : "")
    + (!versionAuthority.ok && canProposeVersion
      ? '<div class="surface-inspector-summary">Direct version changes are blocked here, but you can create a real version-change proposal from this live surface for later approval.</div>'
      : "")
    + "</section>";
}

function renderSurfaceInspectorOwnershipView({
  widgetId = "",
  ownershipSummary = "",
  ownershipRows = [],
  ownershipChain = [],
  ownershipUnavailableReason = "",
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!widgetId) return "";
  const rows = Array.isArray(ownershipRows) ? ownershipRows.filter(([, value]) => value) : [];
  const chain = Array.isArray(ownershipChain) ? ownershipChain.filter(entry => entry && typeof entry === "object") : [];
  const unavailable = String(ownershipUnavailableReason || "").trim();
  if (!rows.length && !chain.length && !ownershipSummary && !unavailable) return "";
  const chainHtml = chain.length
    ? '<div class="surface-item-list">' + chain.map(entry => {
        const labels = [
          entry.class || "",
          entry.routeId ? ("route " + entry.routeId) : "",
          entry.method && entry.path ? (String(entry.method) + " " + String(entry.path)) : (entry.path ? String(entry.path) : ""),
          entry.serves ? ("serves " + entry.serves) : "",
          entry.backendProgramSoul ? ("backend program " + entry.backendProgramSoul) : "",
          entry.pluginId ? ("plugin " + entry.pluginId) : "",
          entry.bundleId ? ("bundle " + entry.bundleId) : "",
          entry.handlerSetId ? ("handler set " + entry.handlerSetId) : "",
          entry.handlerId ? ("handler " + entry.handlerId) : "",
          entry.shellId ? ("shell " + entry.shellId) : ""
        ].filter(Boolean).join(" / ");
        return '<div class="surface-item">'
          + '<strong>' + escapeHtml(labels || "owner") + "</strong>"
          + (entry.note ? '<div class="surface-inspector-summary">' + escapeHtml(entry.note) + "</div>" : "")
          + "</div>";
      }).join("") + "</div>"
    : "";
  return '<section data-surface-inspector-ownership>'
    + '<div class="surface-inspector-meta">Runtime Owner</div>'
    + (ownershipSummary
      ? '<div class="surface-inspector-summary">' + escapeHtml(ownershipSummary) + "</div>"
      : "")
    + (unavailable
      ? '<div class="surface-inspector-summary">' + escapeHtml(ownershipUnavailableReason) + "</div>"
      : "")
    + (rows.length
      ? '<div class="surface-inspector-grid">' + rows.map(([label, value]) =>
          '<div class="surface-inspector-row"><div class="surface-inspector-label">' + escapeHtml(label) + '</div><div class="surface-inspector-value">' + escapeHtml(value) + "</div></div>"
        ).join("") + "</div>"
      : "")
    + chainHtml
    + "</section>";
}

function renderSurfaceInspectorRuntimeCorrelationView({
  widgetId = "",
  runtimeCorrelationSummary = "",
  runtimeCorrelationRows = [],
  runtimeCorrelationOps = [],
  runtimeCorrelationUnavailableReason = "",
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!widgetId) return "";
  const rows = Array.isArray(runtimeCorrelationRows) ? runtimeCorrelationRows.filter(([, value]) => value) : [];
  const ops = Array.isArray(runtimeCorrelationOps) ? runtimeCorrelationOps.filter(entry => entry && typeof entry === "object") : [];
  const unavailable = String(runtimeCorrelationUnavailableReason || "").trim();
  if (!rows.length && !ops.length && !runtimeCorrelationSummary && !unavailable) return "";
  const opsHtml = ops.length
    ? '<div class="surface-item-list">' + ops.map(entry =>
        '<div class="surface-item">'
          + '<strong>' + escapeHtml(entry.label || entry.request || "operation") + "</strong>"
          + (entry.summary ? '<div class="surface-inspector-summary">' + escapeHtml(entry.summary) + "</div>" : "")
          + (entry.selectTarget
            ? '<div class="surface-actions-compact"><button type="button" data-surface-inspector-runtime-select="' + escapeHtml(entry.selectTarget) + '">' + escapeHtml(entry.selectLabel || "Open In World") + "</button></div>"
            : "")
          + "</div>"
      ).join("") + "</div>"
    : "";
  return '<section data-surface-inspector-runtime-correlation>'
    + '<div class="surface-inspector-meta">Runtime Correlation</div>'
    + (runtimeCorrelationSummary
      ? '<div class="surface-inspector-summary">' + escapeHtml(runtimeCorrelationSummary) + "</div>"
      : "")
    + (unavailable
      ? '<div class="surface-inspector-summary">' + escapeHtml(runtimeCorrelationUnavailableReason) + "</div>"
      : "")
    + (rows.length
      ? '<div class="surface-inspector-grid">' + rows.map(([label, value]) =>
          '<div class="surface-inspector-row"><div class="surface-inspector-label">' + escapeHtml(label) + '</div><div class="surface-inspector-value">' + escapeHtml(value) + "</div></div>"
        ).join("") + "</div>"
      : "")
    + opsHtml
    + "</section>";
}

export function renderSurfaceInspectorPanelView({
  liveSurfaceInspectable = false,
  surfaceInspectorOpen = false,
  widgetId = "",
  selectedRouteId = "",
  selectedProgramId = "",
  selectedNodeKind = "",
  selectedNodeContext = "",
  selectedElementTag = "",
  selectedSourceFile = "",
  processEvent = "",
  versionState = null,
  versionRows = [],
  versionAuthority = { ok: false, reason: "" },
  currentActorPresent = false,
  statusMessage = "",
  statusLevel = "ok",
  graphError = "",
  ownershipSummary = "",
  ownershipRows = [],
  ownershipChain = [],
  ownershipUnavailableReason = "",
  runtimeCorrelationSummary = "",
  runtimeCorrelationRows = [],
  runtimeCorrelationOps = [],
  runtimeCorrelationUnavailableReason = "",
  editorHtml = "",
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!liveSurfaceInspectable || !surfaceInspectorOpen) return "";
  const summary = widgetId
    ? (selectedNodeKind
      ? ("Inspecting " + widgetId + " as a real " + String(selectedNodeKind || "thing") + " node. Use the handoff buttons to jump into witnesses, source, process, or the world surface.")
      : ("Inspecting " + widgetId + " from the live page. World metadata is loading or not yet available."))
    : "Right-click any widget on this page to inspect it. This first slice is truthful inspect/handoff/version control plus narrow save-back for non-versioned widget text/title/class edits.";
  const rows = widgetId
    ? [
        ["Widget", widgetId],
        ["Kind", selectedNodeKind || selectedElementTag || "widget"],
        ["Context", selectedNodeContext || ""],
        ["Element", selectedElementTag || ""],
        ["Source", selectedSourceFile || ""],
        ["Process", processEvent || ""]
      ].filter(([, value]) => value)
    : [];
  const actions = widgetId
    ? [
        '<button type="button" data-surface-inspector-world>Open In World</button>',
        '<button type="button" data-surface-inspector-world-mode="witness">Show Witnesses</button>',
        selectedRouteId ? '<button type="button" data-surface-inspector-world-select="' + escapeHtml(selectedRouteId) + '">Show Route</button>' : "",
        selectedProgramId ? '<button type="button" data-surface-inspector-world-select="' + escapeHtml(selectedProgramId) + '">Show Frontend Program</button>' : "",
        selectedSourceFile ? '<button type="button" data-surface-inspector-world-mode="source">Show Source</button>' : "",
        processEvent ? '<button type="button" data-surface-inspector-open-process>Open Process View</button>' : ""
      ].filter(Boolean).join("")
    : "";
  const status = statusMessage
    ? '<div class="surface-status-box" data-level="' + escapeHtml(statusLevel || "ok") + '">' + escapeHtml(statusMessage) + "</div>"
    : "";
  const graphErrorHtml = graphError
    ? '<div class="surface-status-box" data-level="error">' + escapeHtml(graphError) + "</div>"
    : "";
  return '<aside class="surface-inspector-panel" data-surface-inspector-panel>'
    + '<div class="surface-inspector-meta">Live Page Inspector</div>'
    + "<h2>" + escapeHtml(widgetId || "Inspect Page") + "</h2>"
    + '<div class="surface-inspector-summary">' + escapeHtml(summary) + "</div>"
    + status
    + graphErrorHtml
    + '<div class="surface-actions-compact">'
      + '<button type="button" data-surface-inspector-close>Close Inspector</button>'
      + (widgetId ? '<button type="button" data-surface-inspector-clear>Clear Selection</button>' : "")
      + '<button type="button" data-surface-inspector-refresh>Refresh Metadata</button>'
    + "</div>"
    + (rows.length
      ? '<div class="surface-inspector-grid">' + rows.map(([label, value]) =>
          '<div class="surface-inspector-row"><div class="surface-inspector-label">' + escapeHtml(label) + '</div><div class="surface-inspector-value">' + escapeHtml(value) + "</div></div>"
        ).join("") + "</div>"
      : "")
    + (actions ? '<div class="surface-actions-compact">' + actions + "</div>" : "")
    + renderSurfaceInspectorOwnershipView({
      widgetId,
      ownershipSummary,
      ownershipRows,
      ownershipChain,
      ownershipUnavailableReason,
      escapeHtml
    })
    + renderSurfaceInspectorRuntimeCorrelationView({
      widgetId,
      runtimeCorrelationSummary,
      runtimeCorrelationRows,
      runtimeCorrelationOps,
      runtimeCorrelationUnavailableReason,
      escapeHtml
    })
    + renderSurfaceInspectorVersionsView({
      versionState,
      versionRows,
      versionAuthority,
      currentActorPresent,
      escapeHtml
    })
    + editorHtml
  + "</aside>";
}

export function renderSurfaceInspectorMenuView({
  liveSurfaceInspectable = false,
  widgetId = "",
  x = 12,
  y = 12,
  selectedSourceFile = "",
  hasProcessSelection = false,
  windowWidth = 0,
  windowHeight = 0,
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!liveSurfaceInspectable || !widgetId) return "";
  const menuX = Math.max(12, Math.min(Number(x) || 12, Number(windowWidth) - 236));
  const menuY = Math.max(12, Math.min(Number(y) || 12, Number(windowHeight) - 220));
  return '<div class="surface-inspector-menu" data-surface-inspector-menu style="left:' + menuX + "px;top:" + menuY + 'px">'
    + '<div class="surface-inspector-meta">Widget</div>'
    + "<p>" + escapeHtml(widgetId) + "</p>"
    + '<button type="button" data-surface-inspector-select>Inspect Widget</button>'
    + '<button type="button" data-surface-inspector-world>Open In World</button>'
    + '<button type="button" data-surface-inspector-world-mode="witness">Show Witnesses</button>'
    + (selectedSourceFile ? '<button type="button" data-surface-inspector-world-mode="source">Show Source</button>' : "")
    + (hasProcessSelection ? '<button type="button" data-surface-inspector-open-process>Open Process View</button>' : "")
  + "</div>";
}
