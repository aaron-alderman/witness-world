export function renderTutorialDisabledScopesViewFactory() {
  return String.raw`
    const tutorialDisabledScopeDescription = ${tutorialDisabledScopeDescription.toString()};
    const createTutorialDisabledScopeCard = ${createTutorialDisabledScopeCard.toString()};
    const renderTutorialDisabledScopeRows = ${renderTutorialDisabledScopeRows.toString()};
  `;
}

export function tutorialDisabledScopeDescription({
  row = {}
} = {}) {
  if (row.currentStepTitle) return "Current step there: " + row.currentStepTitle + ".";
  if (row.status === "active") return "Sourcery is active on this scope right now.";
  if (row.status === "completed") return "This scope was already covered by tutorial progress.";
  if (row.type === "context") return "Sourcery is disabled for this context, but you can re-enable it without losing progress.";
  if (row.status === "muted") return "Sourcery is disabled for this scope, but you can re-enable it without losing progress.";
  return "Sourcery is available on this scope.";
}

export function createTutorialDisabledScopeCard({
  row = {},
  currentSurfacePage = "app",
  tutorialPageLabel = page => String(page || ""),
  document = globalThis?.document || null
} = {}) {
  function tutorialScopeInventoryStatusLabel(status = "") {
    if (status === "active") return "Active";
    if (status === "muted") return "Muted";
    if (status === "completed") return "Completed";
    return "Available";
  }

  const create = tagName => document?.createElement?.(tagName) || null;
  const append = (parent, ...children) => {
    if (!parent?.append) return parent;
    parent.append(...children.filter(Boolean));
    return parent;
  };
  const button = ({ text = "", className = "secondary", dataName = "", dataValue = "" } = {}) => {
    const node = create("button");
    if (!node) return null;
    node.type = "button";
    node.className = className;
    if (dataName) node.setAttribute(dataName, dataValue);
    node.textContent = text;
    return node;
  };

  const card = create("div");
  if (!card) return null;
  card.style.border = "1px solid rgba(122,77,42,.18)";
  card.style.borderRadius = "12px";
  card.style.padding = "10px 12px";
  card.style.background = "rgba(255,255,255,.82)";
  card.style.display = "grid";
  card.style.gap = "8px";

  const title = create("strong");
  title.style.fontSize = "14px";
  title.textContent = (row.pageLabel ? row.pageLabel + " / " : "") + (row.label || "");

  const badge = create("span");
  if (badge) {
    badge.style.fontSize = "11px";
    badge.style.letterSpacing = "0.04em";
    badge.style.textTransform = "uppercase";
    badge.style.color = "#7a4d2a";
    badge.textContent = tutorialScopeInventoryStatusLabel(row.status || (row.type === "context" ? "muted" : "muted"));
  }

  const copy = create("p");
  copy.style.margin = "0";
  copy.style.fontSize = "13px";
  copy.style.lineHeight = "1.45";
  copy.style.color = "#5d544d";
  copy.textContent = tutorialDisabledScopeDescription({ row });

  const actions = create("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.style.flexWrap = "wrap";

  if (row.target && (row.status === "muted" || row.status === "active" || !row.status)) {
    append(actions, button({
      text: "Show This Control",
      dataName: "data-disabled-scope-focus",
      dataValue: row.focusScopeKey || row.scopeKey || row.target || ""
    }));
  }
  if (row.status === "muted" || (!row.status && row.type)) {
    if (row.type === "context") {
      append(actions, button({
        text: row.page && row.page !== currentSurfacePage ? "Enable Sourcery" : "Enable This Context",
        dataName: "data-disabled-context-enable",
        dataValue: row.contextId || ""
      }));
    } else {
      append(actions, button({
        text: row.page && row.page !== currentSurfacePage ? "Enable Sourcery" : "Enable Sourcery Here",
        dataName: "data-disabled-scope-enable",
        dataValue: row.scopeKey || ""
      }));
    }
    if (row.page && row.page !== currentSurfacePage) {
      append(actions, button({
        text: "Open " + tutorialPageLabel(row.page),
        dataName: "data-disabled-scope-open",
        dataValue: row.page
      }));
    }
  }

  append(card, title, badge, copy, actions);
  return card;
}

export function renderTutorialDisabledScopeRows({
  list = null,
  rows = [],
  currentSurfacePage = "app",
  tutorialPageLabel = page => String(page || ""),
  document = globalThis?.document || null
} = {}) {
  if (!list?.replaceChildren) return;
  const cards = (rows || [])
    .map(row => createTutorialDisabledScopeCard({
      row,
      currentSurfacePage,
      tutorialPageLabel,
      document
    }))
    .filter(Boolean);
  list.replaceChildren(...cards);
}
