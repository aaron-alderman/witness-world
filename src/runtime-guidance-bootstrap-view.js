export function renderBootstrapGuidanceConceptList({
  root,
  concepts = [],
  emptyText = "",
  document
} = {}) {
  if (!root) return;
  root.innerHTML = "";
  if (!concepts.length) {
    const empty = document.createElement("div");
    empty.className = "tutorial-concept";
    const label = document.createElement("span");
    label.textContent = emptyText;
    empty.append(label);
    root.append(empty);
    return;
  }
  for (const concept of concepts) {
    const item = document.createElement("div");
    item.className = "tutorial-concept";
    const title = document.createElement("strong");
    title.textContent = concept.label;
    const summary = document.createElement("span");
    summary.textContent = concept.summary;
    item.append(title, summary);
    root.append(item);
  }
}

export function renderBootstrapGuidanceSuggestionList({
  root,
  suggestions = [],
  document
} = {}) {
  if (!root) return;
  root.innerHTML = "";
  if (!suggestions.length) {
    const empty = document.createElement("div");
    empty.className = "tutorial-suggestion";
    const copy = document.createElement("p");
    copy.textContent = "No extra curation yet. The visible controls remain the source of truth.";
    empty.append(copy);
    root.append(empty);
    return;
  }
  for (const suggestion of suggestions) {
    const item = document.createElement("div");
    item.className = "tutorial-suggestion";
    const title = document.createElement("strong");
    title.textContent = suggestion.title;
    const body = document.createElement("p");
    body.textContent = suggestion.body;
    const actions = document.createElement("div");
    actions.className = "surface-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "surface-button-secondary";
    button.dataset.suggestionId = suggestion.id;
    button.textContent = suggestion.buttonLabel;
    actions.append(button);
    item.append(title, body, actions);
    root.append(item);
  }
}

export function renderBootstrapGuidanceScopeInventoryRows({
  root,
  rows = [],
  document
} = {}) {
  function guidanceScopeInventoryStatusLabel(status = "") {
    if (status === "active") return "Active";
    if (status === "muted") return "Muted";
    if (status === "completed") return "Completed";
    return "Available";
  }

  function guidanceScopeInventoryDescription(row = {}) {
    if (row.currentStepTitle) return "Current step there: " + row.currentStepTitle + ".";
    if (row.status === "active") return "Sourcery is active on this scope right now.";
    if (row.status === "completed") return "This scope was already covered by tutorial progress.";
    if (row.type === "context") return "Sourcery is disabled for this context, but you can re-enable it without losing progress.";
    if (row.status === "muted") return "Sourcery is disabled for this scope, but you can re-enable it without losing progress.";
    return "Sourcery is available on this scope.";
  }

  if (!root) return;
  root.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "tutorial-disabled-item";
    const body = document.createElement("p");
    body.textContent = "No Sourcery scopes to show right now.";
    empty.append(body);
    root.append(empty);
    return;
  }
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "tutorial-disabled-item";
    item.dataset.guidanceScopeStatus = row.status || "available";
    const title = document.createElement("strong");
    title.textContent = (row.pageLabel ? row.pageLabel + " / " : "") + row.label;
    const badge = document.createElement("span");
    badge.className = "surface-badge";
    badge.textContent = guidanceScopeInventoryStatusLabel(row.status);
    const body = document.createElement("p");
    body.textContent = guidanceScopeInventoryDescription(row);
    const actions = document.createElement("div");
    actions.className = "surface-actions";
    if (row.target && (row.status === "muted" || row.status === "active")) {
      const focusButton = document.createElement("button");
      focusButton.type = "button";
      focusButton.className = "surface-button-secondary";
      focusButton.dataset.disabledFocus = row.target;
      focusButton.textContent = "Show This Control";
      actions.append(focusButton);
    }
    if (row.status === "muted") {
      const enableButton = document.createElement("button");
      enableButton.type = "button";
      enableButton.className = "surface-button-secondary";
      if (row.type === "context") enableButton.dataset.disabledContext = row.contextId;
      else enableButton.dataset.disabledScope = row.scopeKey;
      enableButton.dataset.disabledEnable = row.page;
      enableButton.textContent = row.type === "context"
        ? (row.isCurrentSurface ? "Enable This Context" : "Enable Sourcery")
        : (row.isCurrentSurface ? "Enable Sourcery Here" : "Enable Sourcery");
      actions.append(enableButton);
      if (!row.isCurrentSurface && row.page) {
        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "surface-button-secondary";
        openButton.dataset.disabledOpen = row.page;
        openButton.textContent = "Open " + (row.pageLabel || row.label);
        actions.append(openButton);
      }
    }
    item.append(title, badge, body, actions);
    root.append(item);
  }
}

export function renderBootstrapGuidanceDisabledRows({
  root,
  rows = [],
  document
} = {}) {
  renderBootstrapGuidanceScopeInventoryRows({
    root,
    rows: rows.map(row => ({ ...row, status: row.status || "muted" })),
    document
  });
}
