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

export function renderBootstrapGuidanceDisabledRows({
  root,
  rows = [],
  document
} = {}) {
  if (!root) return;
  root.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "tutorial-disabled-item";
    const body = document.createElement("p");
    body.textContent = "No disabled Sourcery scopes right now.";
    empty.append(body);
    root.append(empty);
    return;
  }
  for (const row of rows) {
    const item = document.createElement("div");
    item.className = "tutorial-disabled-item";
    const title = document.createElement("strong");
    title.textContent = row.label;
    const body = document.createElement("p");
    body.textContent = row.currentStepTitle
      ? ("Current step there: " + row.currentStepTitle + ".")
      : (row.type === "context"
          ? "Sourcery is disabled for this context, but you can re-enable it without losing progress."
          : "Sourcery is disabled for this scope, but you can re-enable it without losing progress.");
    const actions = document.createElement("div");
    actions.className = "surface-actions";
    if (row.target) {
      const focusButton = document.createElement("button");
      focusButton.type = "button";
      focusButton.className = "surface-button-secondary";
      focusButton.dataset.disabledFocus = row.target;
      focusButton.textContent = "Show This Control";
      actions.append(focusButton);
    }
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
    if (!row.isCurrentSurface) {
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "surface-button-secondary";
      openButton.dataset.disabledOpen = row.page;
      openButton.textContent = "Open " + row.label;
      actions.append(openButton);
    }
    item.append(title, body, actions);
    root.append(item);
  }
}
