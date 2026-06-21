export function renderWorldSurfaceViewFactory() {
  return String.raw`
    const renderWorldModeMenuView = ${renderWorldModeMenuView.toString()};
    const renderWorldCommandPaletteView = ${renderWorldCommandPaletteView.toString()};
    const renderWorldTutorialConceptListView = ${renderWorldTutorialConceptListView.toString()};
    const renderWorldTutorialPanelView = ${renderWorldTutorialPanelView.toString()};
  `;
}

export function renderWorldModeMenuView({
  currentMode = "graph",
  escapeHtml = value => String(value ?? "")
} = {}) {
  const modeButton = (mode, label) => '<button class="world-mode-button ' + (currentMode === mode ? "world-mode-active" : "") + '" data-world-mode="' + escapeHtml(mode) + '">' + escapeHtml(label) + "</button>";
  return '<nav class="surface-header-bar surface-toolbar world-mode-menu">'
    + modeButton("system", "System Overview")
    + modeButton("graph", "Graph")
    + modeButton("things", "Thing List")
    + modeButton("primitive", "Primitive Browser")
    + modeButton("witness", "Witness Browser")
    + modeButton("source", "Source Browser")
    + modeButton("process", "Process Explorer")
    + '<span class="surface-toolbar-spacer world-mode-spacer"></span>'
    + '<button class="world-command-toggle" data-world-command-toggle data-tutorial-target="world-command-toggle">Search / Command</button>'
    + '<span class="world-command-hint">Ctrl+K</span>'
    + "</nav>";
}

export function renderWorldCommandPaletteView({
  worldCommandOpen = false,
  query = "",
  items = [],
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!worldCommandOpen) return "";
  const results = items.length
    ? items.map((item, index) => '<button class="world-command-item" data-world-command-run="' + index + '"><strong>' + escapeHtml(item.title) + "</strong><span class=\"world-command-meta\">" + escapeHtml(item.type) + (item.tier ? " / " + escapeHtml(item.tier) : "") + (item.subtitle ? " / " + escapeHtml(item.subtitle) : "") + "</span></button>").join("")
    : '<div class="world-command-empty">No matching surfaces, objects, or commands.</div>';
  return '<section class="world-command-palette" data-world-command-palette>'
    + '<div class="world-command-head">'
    + '<input class="world-command-input" data-world-command-input placeholder="Search pages, widgets, capabilities, execution, commands..." value="' + escapeHtml(query) + '" />'
    + '<button class="world-command-toggle" data-world-command-close>Close</button>'
    + "</div>"
    + '<div class="world-command-list">' + results + "</div>"
    + "</section>";
}

export function renderWorldTutorialConceptListView({
  concepts = [],
  emptyText = "",
  escapeHtml = value => String(value ?? "")
} = {}) {
  return '<div class="tutorial-concept-list">'
    + (concepts.length
      ? concepts.map(concept => '<div class="tutorial-concept"><strong>' + escapeHtml(concept.label) + "</strong><span>" + escapeHtml(concept.summary) + "</span></div>").join("")
      : '<div class="tutorial-concept"><span>' + escapeHtml(emptyText) + "</span></div>")
    + "</div>";
}

export function renderWorldTutorialPanelView({
  sessionAuthenticated = false,
  progress = null,
  error = "",
  step = null,
  surfaceKind = "",
  summary = "",
  disabledRows = [],
  inventoryRows = [],
  previousStep = null,
  currentSurfaceContext = null,
  currentConcepts = [],
  revealedConcepts = [],
  resumeLabel = "",
  companionActive = Boolean(globalThis?.window?.__sourceryCompanionShell),
  escapeHtml = value => String(value ?? "")
} = {}) {
  if (!sessionAuthenticated) return "";
  if (!progress && !error) return "";
  const secondaryClass = "surface-button-secondary";
  const scopeRows = inventoryRows.length ? inventoryRows : disabledRows;
  const showCompanionRecovery = companionActive && progress && !progress.completedAt;
  const scopeStatusLabel = status => status === "active" ? "Active" : status === "muted" ? "Muted" : status === "completed" ? "Completed" : "Available";
  const scopeDescription = row => row.currentStepTitle
    ? ("Current step there: " + row.currentStepTitle + ".")
    : (row.status === "active"
        ? "Sourcery is active on this scope right now."
        : (row.status === "completed"
            ? "This scope was already covered by tutorial progress."
            : (row.type === "context"
                ? "Sourcery is disabled for this context, but you can re-enable it without resetting progress."
                : (row.status === "muted"
                    ? "Sourcery is disabled for this scope, but you can re-enable it without resetting progress."
                    : "Sourcery is available on this scope."))));
  const disabledList = scopeRows.length
    ? '<div class="world-tutorial-list surface-item-list" data-world-tutorial-disabled-list data-guidance-scope-inventory="true">' + scopeRows.map(row =>
      '<div class="world-tutorial-item surface-item surface-stack" data-guidance-scope-status="' + escapeHtml(row.status || "muted") + '"><strong>' + escapeHtml((row.pageLabel ? (row.pageLabel + " / ") : "") + row.label) + '</strong><span class="surface-badge">' + escapeHtml(scopeStatusLabel(row.status || "muted")) + '</span><p>' + escapeHtml(scopeDescription(row)) + '</p><div class="surface-actions">' + (row.target && (row.status === "muted" || row.status === "active") ? '<button type="button" class="' + secondaryClass + '" data-world-tutorial-focus-scope-target="' + escapeHtml(row.target) + '">Show This Control</button>' : "") + (row.status === "muted" ? ((row.type === "context" ? '<button type="button" class="' + secondaryClass + '" data-world-tutorial-enable-context="' + escapeHtml(row.contextId) + '">Enable This Context</button>' : '<button type="button" class="' + secondaryClass + '" data-world-tutorial-enable-scope="' + escapeHtml(row.scopeKey) + '">Enable Sourcery Here</button>') + (row.href ? '<button type="button" class="' + secondaryClass + '" data-world-tutorial-open-scope="' + escapeHtml(row.href) + '">Open Surface</button>' : "")) : "") + "</div></div>"
    ).join("") + "</div>"
    : '<div class="world-tutorial-list surface-item-list" data-world-tutorial-disabled-list data-guidance-scope-inventory="true"><div class="world-tutorial-item surface-item"><p>No Sourcery scopes to show right now.</p></div></div>';
  return '<section class="world-tutorial-panel surface-card surface-stack" data-world-tutorial-panel>'
    + '<div class="world-tutorial-meta surface-kicker">Sourcery / ' + escapeHtml(surfaceKind) + "</div>"
    + "<h2>" + escapeHtml(step?.title || "Tutorial status") + "</h2>"
    + '<div class="world-tutorial-summary surface-note">' + escapeHtml(summary) + "</div>"
    + '<div class="surface-actions">'
      + (scopeRows.length && !showCompanionRecovery ? '<button type="button" class="' + secondaryClass + '" data-world-tutorial-show-disabled>Show Sourcery Scope Inventory</button>' : "")
      + (step?.target && surfaceKind === "active" ? '<button type="button" class="' + secondaryClass + '" data-world-tutorial-focus-target="' + escapeHtml(step.target) + '">Show Current Control</button>' : "")
      + (progress && !progress.completedAt && !showCompanionRecovery ? '<button type="button" class="' + secondaryClass + '" data-world-tutorial-resume>' + escapeHtml(resumeLabel) + "</button>" : "")
      + (surfaceKind === "active" && previousStep ? '<button type="button" class="' + secondaryClass + '" data-world-tutorial-back>Back</button>' : "")
      + (surfaceKind === "active" && step ? '<button type="button" data-world-tutorial-next>' + escapeHtml(step.nextLabel || "Next") + "</button>" : "")
      + (progress && !progress.completedAt ? '<button type="button" class="' + secondaryClass + '" data-world-tutorial-restart-chapter>Restart Chapter</button>' : "")
      + (progress && !progress.completedAt && step ? '<button type="button" class="' + secondaryClass + '" data-world-tutorial-restart-step>Restart From This Scope</button>' : "")
      + (surfaceKind === "active" && step?.page === "world" ? '<button type="button" class="' + secondaryClass + '" data-world-tutorial-disable>Disable Sourcery Here</button>' : "")
      + (surfaceKind === "active" && currentSurfaceContext ? '<button type="button" class="' + secondaryClass + '" data-world-tutorial-disable-context>Disable Sourcery In This Context</button>' : "")
      + (progress && !progress.completedAt && !progress.hidden ? '<button type="button" class="' + secondaryClass + '" data-world-tutorial-exit>Exit</button>' : "")
      + (progress ? '<button type="button" class="' + secondaryClass + '" data-world-tutorial-reset>Reset</button>' : "")
    + "</div>"
    + renderWorldTutorialConceptListView({
      concepts: currentConcepts,
      emptyText: "This step uses the current product surface without unlocking a new concept.",
      escapeHtml
    })
    + renderWorldTutorialConceptListView({
      concepts: revealedConcepts,
      emptyText: "No concepts revealed on this surface yet.",
      escapeHtml
    })
    + disabledList
    + "</section>";
}
