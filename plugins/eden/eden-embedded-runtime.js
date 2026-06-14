function readEdenReliefSections(surface) {
  return Array.isArray(surface?.reliefSections) ? surface.reliefSections : [];
}

function buildEdenReliefKey(surfaceId, sectionId) {
  return String(surfaceId || "") + "::" + String(sectionId || "");
}

function readEdenReliefActiveSignals(section, deps) {
  const {
    byId,
    versionsRuntime,
    state
  } = deps;
  const activeSignals = [];
  const signals = Array.isArray(section?.signals) ? section.signals : [];
  const versionsSurface = byId.get("eden.surface.versions");
  const versions = versionsSurface ? versionsRuntime(versionsSurface) : null;
  for (const signal of signals) {
    if (signal === "session.authenticated" && state.session?.authenticated && state.session?.actor) activeSignals.push(signal);
    if (signal === "versions.liveDiff" && versions?.activeVersion && versions?.publishedVersion && versions.activeVersion !== versions.publishedVersion) activeSignals.push(signal);
    if (signal === "versions.draftDiff" && versions?.draftVersion && versions?.publishedVersion && versions.draftVersion !== versions.publishedVersion) activeSignals.push(signal);
    if (signal === "versions.rollbackAvailable" && versions?.rollbackAvailable) activeSignals.push(signal);
  }
  return activeSignals;
}

function readEdenReliefLevelForSection(surface, section, deps) {
  const {
    state,
    reliefKey,
    reliefActiveSignals
  } = deps;
  const key = reliefKey(surface.id, section.id);
  const relief = section.relief || {};
  const activeSignals = reliefActiveSignals(section);
  if (state.focusReliefKey === key) return Math.round(relief.focus ?? relief.base ?? 1);
  if (state.hoverReliefKey === key) return Math.round(relief.hover ?? relief.base ?? 1);
  if (activeSignals.length) return Math.round(relief.active ?? relief.base ?? 1);
  return Math.round(relief.base ?? 1);
}

function scrollEdenReliefSectionIntoView(surface, sectionId, deps) {
  const { stateElements } = deps;
  const node = stateElements.get(surface.id);
  const frame = node?.querySelector?.("iframe");
  const doc = frame?.contentDocument;
  if (!doc) return;
  const target = doc.querySelector('[data-widget="' + String(sectionId).replace(/"/g, '\\"') + '"]');
  if (target && typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function computeEdenReliefBoxes(surface, node, deps) {
  const { reliefSections } = deps;
  const frame = node?.querySelector?.("iframe");
  const doc = frame?.contentDocument;
  if (!frame || !doc) return [];
  const pageId = surface.pageId || "todo_app_widget";
  const root = doc.querySelector('[data-widget="' + String(pageId).replace(/"/g, '\\"') + '"]') || doc.body;
  if (!root) return [];
  const rootRect = root.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const widthBase = Math.max(rootRect.width || root.scrollWidth || 0, 1);
  const heightBase = Math.max(rootRect.height || root.scrollHeight || 0, 1);
  const frameLeft = frameRect.left - nodeRect.left;
  const frameTop = frameRect.top - nodeRect.top;
  const frameWidth = frameRect.width;
  const frameHeight = frameRect.height;
  return reliefSections(surface).map(section => {
    const element = doc.querySelector('[data-widget="' + String(section.widgetId).replace(/"/g, '\\"') + '"]');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const left = frameLeft + ((rect.left - rootRect.left) / widthBase) * frameWidth;
    const top = frameTop + ((rect.top - rootRect.top) / heightBase) * frameHeight;
    const width = Math.max(78, (rect.width / widthBase) * frameWidth);
    const height = Math.max(28, (rect.height / heightBase) * frameHeight);
    return { section, left, top, width, height };
  }).filter(Boolean);
}

function renderEdenEmbeddedRelief(node, surface, deps) {
  const {
    state,
    render,
    embeddedMode,
    reliefActiveSignals,
    reliefKey,
    reliefLevelForSection,
    scrollReliefSectionIntoView,
    computeReliefBoxes
  } = deps;
  const layer = node?.querySelector?.("[data-eden-relief-layer]");
  if (!layer) return;
  if (embeddedMode(surface.id).inspect) {
    layer.hidden = true;
    layer.innerHTML = "";
    return;
  }
  layer.hidden = false;
  layer.innerHTML = "";
  const boxes = computeReliefBoxes(surface, node);
  for (const box of boxes) {
    const section = box.section;
    const activeSignals = reliefActiveSignals(section);
    const key = reliefKey(surface.id, section.id);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "eden-relief-card";
    card.dataset.edenRelief = section.id;
    card.dataset.relief = String(Math.max(0, Math.min(4, reliefLevelForSection(surface, section))));
    card.dataset.signalCount = String(activeSignals.length);
    card.classList.toggle("is-signal", activeSignals.length > 0);
    card.classList.toggle("is-focused", state.focusReliefKey === key);
    card.style.left = box.left + "px";
    card.style.top = box.top + "px";
    card.style.width = box.width + "px";
    card.style.height = box.height + "px";
    const title = document.createElement("div");
    title.className = "eden-relief-title";
    title.textContent = section.title || section.id;
    card.appendChild(title);
    const meta = document.createElement("div");
    meta.className = "eden-relief-meta";
    meta.textContent = activeSignals.length
      ? activeSignals.join(" Â· ")
      : (section.role || section.chromeKind || section.id);
    card.appendChild(meta);
    card.addEventListener("pointerenter", () => {
      state.hoverReliefKey = key;
      render();
    });
    card.addEventListener("pointerleave", () => {
      if (state.hoverReliefKey === key) state.hoverReliefKey = null;
      render();
    });
    card.addEventListener("click", () => {
      state.focusReliefKey = key;
      scrollReliefSectionIntoView(surface, section.id);
      state.detailStatus = (section.title || section.id) + (section.meaning ? " Â· " + section.meaning : "");
      render();
    });
    layer.appendChild(card);
  }
}

function openEdenExpertShortcut(surfaceId = "eden.surface.todo", query = "whoami", deps) {
  const {
    byId,
    isVisible,
    targetById,
    focusTarget,
    state,
    cameraForSurface,
    toggleEmbeddedInspect,
    embeddedDocument,
    embeddedWindow,
    setStatus,
    setEmbeddedSurfaceCommand,
    seedEmbeddedCommandQuery
  } = deps;
  const surface = byId.get(surfaceId);
  if (!surface) return;
  if (!isVisible(surface)) {
    if (targetById.has("home")) focusTarget("home");
    else {
      state.focusSurfaceId = surface.id;
      state.camera = cameraForSurface(surface, 1.02);
    }
  }
  toggleEmbeddedInspect(surface, true);
  const applyQuery = (attempts = 10) => {
    if (String(query || "").trim().toLowerCase() === "whoami") {
      const doc = embeddedDocument(surface.id);
      const win = embeddedWindow(surface.id);
      if (doc?.querySelector?.("[data-surface-command-toggle]") && win?.dispatchEvent) {
        const event = typeof win.KeyboardEvent === "function"
          ? new win.KeyboardEvent("keydown", { key: "F1", bubbles: true, cancelable: true })
          : new KeyboardEvent("keydown", { key: "F1", bubbles: true, cancelable: true });
        win.dispatchEvent(event);
        setStatus("Expert shortcut active. whoami is on the board command surface.");
        return;
      }
    }
    setEmbeddedSurfaceCommand(surface.id, true);
    if (seedEmbeddedCommandQuery(surface.id, query)) {
      setStatus("Expert shortcut active. whoami is on the board command surface.");
      return;
    }
    if (attempts <= 0) return;
    setTimeout(() => applyQuery(attempts - 1), 60);
  };
  setTimeout(applyQuery, 0);
}

export function renderEdenEmbeddedRuntimePrelude() {
  return `
${readEdenReliefSections.toString()}
${buildEdenReliefKey.toString()}
${readEdenReliefActiveSignals.toString()}
${readEdenReliefLevelForSection.toString()}
${scrollEdenReliefSectionIntoView.toString()}
${computeEdenReliefBoxes.toString()}
${renderEdenEmbeddedRelief.toString()}
${openEdenExpertShortcut.toString()}
`;
}
