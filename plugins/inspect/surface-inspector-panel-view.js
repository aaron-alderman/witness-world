export function renderSurfaceInspectorPanelViewFactory() {
  return String.raw`
    const renderSurfaceInspectorEditorView = ${renderSurfaceInspectorEditorView.toString()};
    const renderSurfaceInspectorChildCreateView = ${renderSurfaceInspectorChildCreateView.toString()};
    const renderSurfaceInspectorVersionsView = ${renderSurfaceInspectorVersionsView.toString()};
    const renderSurfaceInspectorOwnershipView = ${renderSurfaceInspectorOwnershipView.toString()};
    const renderSurfaceInspectorScopeView = ${renderSurfaceInspectorScopeView.toString()};
    const renderSurfaceInspectorCapabilitiesView = ${renderSurfaceInspectorCapabilitiesView.toString()};
    const renderSurfaceInspectorCompositionView = ${renderSurfaceInspectorCompositionView.toString()};
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

export function renderSurfaceInspectorChildCreateView({
  widgetId = "",
  authoredWidget = null,
  versionRows = [],
  widgetsLoaded = false,
  widgetsError = "",
  authority = { ok: false, reason: "" },
  currentActorPresent = false,
  kindOptions = [],
  unavailableReason = "",
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!widgetId) return "";
  if (versionRows.length) {
    return '<section><div class="surface-inspector-meta">Child Widget</div><div class="surface-inspector-summary">Child widget creation under versioned souls is deferred until the broader migration and rollback story is shared beyond widget-version activation.</div></section>';
  }
  if (!widgetsLoaded) {
    return '<section><div class="surface-inspector-meta">Child Widget</div><div class="surface-inspector-summary">Loading authored widget state...</div></section>';
  }
  if (widgetsError) {
    return '<section><div class="surface-inspector-meta">Child Widget</div><div class="surface-inspector-summary">Authored widget state is unavailable right now.</div></section>';
  }
  if (!authoredWidget) {
    return '<section><div class="surface-inspector-meta">Child Widget</div><div class="surface-inspector-summary">This selected element is not currently backed by a directly inspectable authored parent widget row.</div></section>';
  }
  if (unavailableReason) {
    return '<section><div class="surface-inspector-meta">Child Widget</div><div class="surface-inspector-summary">' + escapeHtml(unavailableReason) + "</div></section>";
  }
  const options = Array.isArray(kindOptions) ? kindOptions.filter(entry => entry && typeof entry === "object" && entry.value) : [];
  if (!options.length) {
    return '<section><div class="surface-inspector-meta">Child Widget</div><div class="surface-inspector-summary">No shared child-widget kinds are exposed for this surface yet.</div></section>';
  }
  const contextId = typeof authoredWidget.context === "string" && authoredWidget.context.trim() ? authoredWidget.context.trim() : "";
  const formOpen = '<form class="surface-form" data-surface-inspector-child-create-form data-widget-id="' + escapeHtml(widgetId) + '">';
  const commonFields = ''
    + '<label class="surface-field"><span>ID</span><input name="id" placeholder="Leave blank for generated id" /></label>'
    + '<label class="surface-field"><span>Kind</span><select name="kind">' + options.map(option =>
        '<option value="' + escapeHtml(option.value) + '">' + escapeHtml(option.label || option.value) + "</option>"
      ).join("") + "</select></label>"
    + '<label class="surface-field"><span>Text</span><textarea name="text" rows="3" placeholder="Visible text for textual children"></textarea></label>'
    + '<label class="surface-field"><span>Title</span><input name="title" placeholder="Optional title" /></label>'
    + '<label class="surface-field"><span>Class</span><input name="class" placeholder="Optional class" /></label>';
  if (!authority.ok) {
    if (!currentActorPresent) {
      return '<section><div class="surface-inspector-meta">Child Widget</div><div class="surface-inspector-summary">' + escapeHtml(authority.reason || "Sign in to create child widgets here.") + "</div></section>";
    }
    return '<section><div class="surface-inspector-meta">Child Widget</div>'
      + '<div class="surface-inspector-summary">' + escapeHtml(authority.reason || "This parent widget is read-only right now.") + "</div>"
      + '<div class="surface-inspector-summary">Child creation will still lower through the real <code>widget.define</code> seam using parent ' + escapeHtml(widgetId) + (contextId ? (' in context ' + escapeHtml(contextId)) : '') + '.</div>'
      + formOpen
      + commonFields
      + '<label class="surface-field"><span>Reason</span><input name="reason" placeholder="Why should this shared child widget exist?" /></label>'
      + '<div class="surface-actions-compact"><button type="submit" data-surface-inspector-child-create>Request Child Widget</button></div>'
      + "</form>"
      + "</section>";
  }
  return '<section><div class="surface-inspector-meta">Child Widget</div>'
    + '<div class="surface-inspector-summary">Creates a real child widget under ' + escapeHtml(widgetId) + ' through shared <code>widget.define</code> semantics' + (contextId ? (' in context ' + escapeHtml(contextId)) : '') + ".</div>"
    + formOpen
    + commonFields
    + '<div class="surface-actions-compact"><button type="submit" data-surface-inspector-child-create>Add Child Widget</button></div>'
    + "</form>"
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

function renderSurfaceInspectorCompositionView({
  widgetId = "",
  compositionSummary = "",
  compositionRows = [],
  compositionUnavailableReason = "",
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!widgetId) return "";
  const rows = Array.isArray(compositionRows) ? compositionRows.filter(([, value]) => value) : [];
  const unavailable = String(compositionUnavailableReason || "").trim();
  if (!rows.length && !compositionSummary && !unavailable) return "";
  return '<section data-surface-inspector-composition>'
    + '<div class="surface-inspector-meta">Runtime Composition</div>'
    + (compositionSummary
      ? '<div class="surface-inspector-summary">' + escapeHtml(compositionSummary) + "</div>"
      : "")
    + (unavailable
      ? '<div class="surface-inspector-summary">' + escapeHtml(compositionUnavailableReason) + "</div>"
      : "")
    + (rows.length
      ? '<div class="surface-inspector-grid">' + rows.map(([label, value]) =>
          '<div class="surface-inspector-row"><div class="surface-inspector-label">' + escapeHtml(label) + '</div><div class="surface-inspector-value">' + escapeHtml(value) + "</div></div>"
        ).join("") + "</div>"
      : "")
    + "</section>";
}

function renderSurfaceInspectorScopeView({
  widgetId = "",
  scopeSummary = "",
  scopeRows = [],
  scopeContextId = "",
  scopeCapabilities = [],
  scopeUnavailableReason = "",
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!widgetId) return "";
  const rows = Array.isArray(scopeRows) ? scopeRows.filter(([, value]) => value) : [];
  const capabilities = Array.isArray(scopeCapabilities)
    ? scopeCapabilities.filter(entry => entry && typeof entry === "object" && entry.id)
    : [];
  const unavailable = String(scopeUnavailableReason || "").trim();
  if (!rows.length && !scopeSummary && !unavailable && !scopeContextId && !capabilities.length) return "";
  return '<section data-surface-inspector-scope>'
    + '<div class="surface-inspector-meta">Surface Scope</div>'
    + (scopeSummary
      ? '<div class="surface-inspector-summary">' + escapeHtml(scopeSummary) + "</div>"
      : "")
    + (unavailable
      ? '<div class="surface-inspector-summary">' + escapeHtml(scopeUnavailableReason) + "</div>"
      : "")
    + (rows.length
      ? '<div class="surface-inspector-grid">' + rows.map(([label, value]) =>
          '<div class="surface-inspector-row"><div class="surface-inspector-label">' + escapeHtml(label) + '</div><div class="surface-inspector-value">' + escapeHtml(value) + "</div></div>"
        ).join("") + "</div>"
      : "")
    + ((scopeContextId || capabilities.length)
      ? '<div class="surface-actions-compact">'
        + (scopeContextId
          ? '<button type="button" data-surface-inspector-world-select="' + escapeHtml(scopeContextId) + '">Show Context</button>'
          : "")
        + capabilities.map(entry =>
          '<button type="button" data-surface-inspector-world-select="' + escapeHtml(entry.id) + '">Show Capability ' + escapeHtml(entry.label || entry.id) + "</button>"
        ).join("")
        + "</div>"
      : "")
    + "</section>";
}

function renderSurfaceInspectorCapabilitiesView({
  widgetId = "",
  capabilitySummary = "",
  capabilityRows = [],
  capabilityTargetId = "",
  capabilityTargetKind = "context",
  capabilityAuthority = { mode: "signin-required", reason: "" },
  currentActorPresent = false,
  installedCapabilities = [],
  availableCapabilities = [],
  capabilityUnavailableReason = "",
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!widgetId) return "";
  const rows = Array.isArray(capabilityRows) ? capabilityRows.filter(([, value]) => value) : [];
  const installed = Array.isArray(installedCapabilities)
    ? installedCapabilities.filter(entry => entry && typeof entry === "object" && entry.id)
    : [];
  const available = Array.isArray(availableCapabilities)
    ? availableCapabilities.filter(entry => entry && typeof entry === "object" && entry.id)
    : [];
  const unavailable = String(capabilityUnavailableReason || "").trim();
  if (!rows.length && !installed.length && !available.length && !capabilitySummary && !unavailable) return "";
  const authorityMode = capabilityAuthority?.mode || "signin-required";
  const canSubmit = currentActorPresent && capabilityTargetId && !unavailable;
  const installLabel = authorityMode === "proposal" ? "Request Install" : "Install Capability";
  const removeLabel = authorityMode === "proposal" ? "Request Remove" : "Remove";
  const authorityNote = !capabilityTargetId
    ? ""
    : (authorityMode === "direct"
        ? "Writes real capability installs for this context through the shared runtime rules."
        : (currentActorPresent
            ? "Direct mutation is read-only here, but submit still goes through the shared capability runtime and may create a witnessed proposal."
            : (capabilityAuthority?.reason || "Sign in to install or remove authored capabilities for this context.")));
  return '<section data-surface-inspector-capabilities>'
    + '<div class="surface-inspector-meta">Authored Capabilities</div>'
    + (capabilitySummary
      ? '<div class="surface-inspector-summary">' + escapeHtml(capabilitySummary) + "</div>"
      : "")
    + (unavailable
      ? '<div class="surface-inspector-summary">' + escapeHtml(capabilityUnavailableReason) + "</div>"
      : "")
    + (rows.length
      ? '<div class="surface-inspector-grid">' + rows.map(([label, value]) =>
          '<div class="surface-inspector-row"><div class="surface-inspector-label">' + escapeHtml(label) + '</div><div class="surface-inspector-value">' + escapeHtml(value) + "</div></div>"
        ).join("") + "</div>"
      : "")
    + (installed.length
      ? '<div class="surface-item-list">' + installed.map(entry =>
          '<div class="surface-item">'
            + '<strong>' + escapeHtml(entry.label || entry.id) + "</strong>"
            + (entry.summary ? '<div class="surface-inspector-summary">' + escapeHtml(entry.summary) + "</div>" : "")
            + (canSubmit
              ? '<form class="surface-form" data-surface-inspector-capability-remove-form data-surface-inspector-capability="' + escapeHtml(entry.id) + '" data-surface-inspector-capability-target="' + escapeHtml(capabilityTargetId) + '" data-surface-inspector-capability-target-kind="' + escapeHtml(capabilityTargetKind) + '"><div class="surface-actions-compact"><button type="submit" data-surface-inspector-capability-remove="' + escapeHtml(entry.id) + '">' + escapeHtml(removeLabel) + "</button></div></form>"
              : "")
            + (!canSubmit && !currentActorPresent && capabilityAuthority?.reason
              ? '<div class="surface-inspector-summary">' + escapeHtml(capabilityAuthority.reason) + "</div>"
              : "")
            + "</div>"
        ).join("") + "</div>"
      : '<div class="surface-inspector-summary">No explicit authored capability installs are currently attached to this context.</div>')
    + (available.length
      ? (canSubmit
          ? '<form class="surface-form" data-surface-inspector-capability-install-form data-surface-inspector-capability-target="' + escapeHtml(capabilityTargetId) + '" data-surface-inspector-capability-target-kind="' + escapeHtml(capabilityTargetKind) + '">'
            + '<label class="surface-field"><span>Available Capability</span><select name="capability">' + available.map(entry =>
                '<option value="' + escapeHtml(entry.id) + '">' + escapeHtml(entry.label || entry.id) + "</option>"
              ).join("") + "</select></label>"
            + '<div class="surface-actions-compact"><button type="submit" data-surface-inspector-capability-install>' + escapeHtml(installLabel) + "</button></div>"
          + "</form>"
          : "")
      : '<div class="surface-inspector-summary">All context-placeable authored capabilities that are visible in bootstrap state are already installed here.</div>')
    + (authorityNote
      ? '<div class="surface-inspector-summary">' + escapeHtml(authorityNote) + "</div>"
      : "")
    + '<div class="surface-inspector-summary">This section only reflects explicit authored capability installs from bootstrap state. Mounted runtime capability exposure can still be broader than what is directly editable here.</div>'
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
  scopeSummary = "",
  scopeRows = [],
  scopeContextId = "",
  scopeCapabilities = [],
  scopeUnavailableReason = "",
  capabilitySummary = "",
  capabilityRows = [],
  capabilityTargetId = "",
  capabilityTargetKind = "context",
  capabilityAuthority = { mode: "signin-required", reason: "" },
  installedCapabilities = [],
  availableCapabilities = [],
  capabilityUnavailableReason = "",
  compositionSummary = "",
  compositionRows = [],
  compositionUnavailableReason = "",
  runtimeCorrelationSummary = "",
  runtimeCorrelationRows = [],
  runtimeCorrelationOps = [],
  runtimeCorrelationUnavailableReason = "",
  backendEvolutionHtml = "",
  evolutionHtml = "",
  childCreateHtml = "",
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
    + renderSurfaceInspectorScopeView({
      widgetId,
      scopeSummary,
      scopeRows,
      scopeContextId,
      scopeCapabilities,
      scopeUnavailableReason,
      escapeHtml
    })
    + renderSurfaceInspectorCapabilitiesView({
      widgetId,
      capabilitySummary,
      capabilityRows,
      capabilityTargetId,
      capabilityTargetKind,
      capabilityAuthority,
      currentActorPresent,
      installedCapabilities,
      availableCapabilities,
      capabilityUnavailableReason,
      escapeHtml
    })
    + renderSurfaceInspectorCompositionView({
      widgetId,
      compositionSummary,
      compositionRows,
      compositionUnavailableReason,
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
    + backendEvolutionHtml
    + renderSurfaceInspectorVersionsView({
      versionState,
      versionRows,
      versionAuthority,
      currentActorPresent,
      escapeHtml
    })
    + evolutionHtml
    + childCreateHtml
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
