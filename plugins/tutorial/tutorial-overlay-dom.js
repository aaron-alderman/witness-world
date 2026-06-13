export function renderTutorialOverlayDomFactory() {
  return String.raw`
    const createTutorialOverlayDom = ${createTutorialOverlayDom.toString()};
  `;
}

export function createTutorialOverlayDom({
  document = globalThis?.document || null
} = {}) {
  const create = tagName => document?.createElement?.(tagName) || null;
  const append = (parent, ...children) => {
    if (!parent?.append) return parent;
    parent.append(...children.filter(Boolean));
    return parent;
  };
  const button = ({ id, text, className = "" } = {}) => {
    const node = create("button");
    if (!node) return null;
    node.type = "button";
    if (id) node.id = id;
    if (className) node.className = className;
    node.textContent = text || "";
    return node;
  };

  const dimmer = create("div");
  if (dimmer) {
    dimmer.className = "tutorial-dimmer";
    dimmer.hidden = true;
    document.body.appendChild(dimmer);
  }

  const overlay = create("aside");
  if (overlay) {
    overlay.className = "tutorial-overlay";
    overlay.hidden = true;

    const handle = create("div");
    handle.className = "tutorial-overlay-handle";
    handle.id = "tutorial-overlay-handle";
    const handleCopy = create("div");
    handleCopy.className = "tutorial-handle-copy";
    const meta = create("div");
    meta.className = "tutorial-overlay-meta";
    meta.id = "tutorial-overlay-meta";
    const kicker = create("div");
    kicker.className = "tutorial-handle-kicker";
    kicker.textContent = "Drag tutorial window";
    append(handleCopy, meta, kicker);
    const grip = create("div");
    grip.className = "tutorial-handle-grip";
    grip.setAttribute("aria-hidden", "true");
    grip.textContent = "::";
    append(handle, handleCopy, grip);

    const title = create("h3");
    title.id = "tutorial-overlay-title";
    const body = create("p");
    body.id = "tutorial-overlay-body";
    const concepts = create("div");
    concepts.className = "tutorial-concept-list";
    concepts.id = "tutorial-overlay-concepts";

    const actions = create("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.flexWrap = "wrap";
    append(
      actions,
      button({ id: "tutorial-next", text: "Next" }),
      button({ id: "tutorial-back", text: "Back" }),
      button({ id: "tutorial-restart-chapter", text: "Restart Chapter" }),
      button({ id: "tutorial-restart-step", text: "Restart From This Scope" }),
      button({ id: "tutorial-show-current-control", text: "Show Current Control" }),
      button({ id: "tutorial-disable-page", text: "Disable Sourcery Here" }),
      button({ id: "tutorial-disable-context", text: "Disable Sourcery In This Context" }),
      button({ id: "tutorial-exit", text: "Exit" }),
      button({ id: "tutorial-reset", text: "Reset" })
    );

    append(overlay, handle, title, body, concepts, actions);
    document.body.appendChild(overlay);
  }

  const resumeButton = button({
    id: "tutorial-resume-page",
    text: "Resume Tutorial",
    className: "tutorial-resume"
  });
  if (resumeButton) {
    resumeButton.hidden = true;
    document.body.appendChild(resumeButton);
  }

  const disabledScopesToggle = button({
    id: "tutorial-disabled-scopes-toggle",
    text: "Show Disabled Sourcery Scopes",
    className: "tutorial-resume"
  });
  if (disabledScopesToggle) {
    disabledScopesToggle.style.bottom = "72px";
    disabledScopesToggle.hidden = true;
    document.body.appendChild(disabledScopesToggle);
  }

  const disabledScopesPanel = create("aside");
  if (disabledScopesPanel) {
    disabledScopesPanel.id = "tutorial-disabled-scopes-panel";
    disabledScopesPanel.className = "tutorial-overlay";
    disabledScopesPanel.hidden = true;
    disabledScopesPanel.style.width = "320px";
    disabledScopesPanel.style.maxWidth = "calc(100vw - 24px)";
    disabledScopesPanel.style.right = "16px";
    disabledScopesPanel.style.left = "auto";
    disabledScopesPanel.style.top = "72px";

    const panelHeader = create("div");
    panelHeader.style.display = "flex";
    panelHeader.style.justifyContent = "space-between";
    panelHeader.style.alignItems = "flex-start";
    panelHeader.style.gap = "10px";
    const panelCopy = create("div");
    const panelMeta = create("div");
    panelMeta.className = "tutorial-overlay-meta";
    panelMeta.textContent = "Disabled Sourcery Scopes";
    const panelTitle = create("h3");
    panelTitle.style.margin = "4px 0 0";
    panelTitle.textContent = "Recover guidance on real surfaces";
    append(panelCopy, panelMeta, panelTitle);
    const panelClose = button({
      id: "tutorial-disabled-scopes-close",
      text: "Close",
      className: "secondary"
    });
    append(panelHeader, panelCopy, panelClose);

    const panelList = create("div");
    panelList.id = "tutorial-disabled-scopes-list";
    panelList.style.display = "grid";
    panelList.style.gap = "8px";
    panelList.style.marginTop = "10px";

    append(disabledScopesPanel, panelHeader, panelList);
    document.body.appendChild(disabledScopesPanel);
  }

  return {
    dimmer,
    overlay,
    resumeButton,
    disabledScopesToggle,
    disabledScopesPanel
  };
}
