export function renderOperatorWorkbenchRuntimeFactory() {
  return String.raw`
    const escapeHtml = ${escapeHtml.toString()};
    const gridTemplateColumnsForCount = ${gridTemplateColumnsForCount.toString()};
    const helpCopyForSnapshot = ${helpCopyForSnapshot.toString()};
    const renderSectionDetailHtml = ${renderSectionDetailHtml.toString()};
    const renderSectionRowsHtml = ${renderSectionRowsHtml.toString()};
    const renderScreenSectionHtml = ${renderScreenSectionHtml.toString()};
    const setBridgeUnavailableState = ${setBridgeUnavailableState.toString()};
    const renderOperatorWorkbenchState = ${renderOperatorWorkbenchState.toString()};
    const startOperatorWorkbenchRuntime = ${startOperatorWorkbenchRuntime.toString()};
  `;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function gridTemplateColumnsForCount(count) {
  const safeCount = Math.max(1, Number(count) || 1);
  return `34px repeat(${safeCount}, minmax(0, 1fr))`;
}

function sourceTabContentLines(lines = []) {
  const sourceHeaderIndex = lines.findIndex(line => line === "sources:");
  if (sourceHeaderIndex < 0) return lines;
  const trailingIndex = lines.findIndex((line, index) =>
    index > sourceHeaderIndex
    && (
      line === "excerpt:"
      || line === "excerpt: (empty file)"
      || /^reason: /.test(line)
    ));
  if (trailingIndex < 0) return lines.slice(0, sourceHeaderIndex);
  return [
    ...lines.slice(0, sourceHeaderIndex),
    ...lines.slice(trailingIndex)
  ];
}

function helpCopyForSnapshot(snapshot = null) {
  const pane = snapshot?.ui?.focusedPane || "left";
  if (pane === "right") {
    const section = (() => {
      const screen = snapshot?.rightPane?.screen ?? null;
      const sections = screen?.sections ?? [];
      return sections[screen?.activeSectionIndex ?? 0] ?? null;
    })();
    const sectionSuffix = section
      ? ` | ${section.title || "Section"} (${section.collapsed ? "collapsed" : `${(section.rows || []).length} rows`})`
      : "";
    return {
      context: `${snapshot?.rightPane?.screen?.title || "Screen"}${sectionSuffix}`,
      summary: snapshot?.rightPane?.screen?.helpText || "Review the active screen sections, use [ and ] to move sections, - and = to collapse or expand, then press Enter on actionable rows."
    };
  }
  if (pane === "bottom") {
    return {
      context: "Command Bar",
      summary: "Type commands directly, use Tab for completion, and Enter to execute."
    };
  }
  if (pane === "top") {
    return {
      context: "Navigation",
      summary: "Move across breadcrumb and status chips, then press Enter to trigger the selected navigation action."
    };
  }
  return {
    context: snapshot?.leftPane?.mode === "results" ? "Results" : "Tree",
    summary: "Move the active row, then Enter to open containers or inspect records."
  };
}

function renderSectionDetailHtml(lines = [], emptyMessage = "(no rows)") {
  if (!(lines || []).length) {
    return `<div class="operator-empty">${escapeHtml(emptyMessage || "(no rows)")}</div>`;
  }
  return (lines || []).map(line => `<div class="operator-inspector-line">${escapeHtml(line)}</div>`).join("");
}

function renderSectionRowsHtml(section = {}, {
  active = false,
  cursor = 0
} = {}) {
  const rows = section.rows || [];
  const kind = section.kind || "list";
  if (kind === "kv") {
    const gridStyle = `grid-template-columns:${gridTemplateColumnsForCount(2)};`;
    const header = `
      <div class="operator-table-header" style="${gridStyle}">
        <span class="operator-row-index">#</span>
        <span class="operator-table-cell operator-table-head">key</span>
        <span class="operator-table-cell operator-table-head">value</span>
      </div>
    `;
    const body = rows.map((row, index) => `
      <div class="operator-row operator-row-table operator-row-static" style="${gridStyle}">
        <span class="operator-row-index">${index + 1}</span>
        <span class="operator-table-cell">${escapeHtml(row.columns?.key ?? row.key ?? row.label ?? "")}</span>
        <span class="operator-table-cell">${escapeHtml(row.columns?.value ?? row.value ?? row.detail ?? "")}</span>
      </div>
    `).join("");
    return `${header}${body || `<div class="operator-empty">${escapeHtml(section.emptyMessage || "(no rows)")}</div>`}`;
  }
  if ((kind === "table" || section.shape === "table-detail") && (section.columns || []).length) {
    const columns = section.columns || [];
    const gridStyle = `grid-template-columns:${gridTemplateColumnsForCount(columns.length)};`;
    const headerCells = columns.map(column => `<span class="operator-table-cell operator-table-head">${escapeHtml(column)}</span>`).join("");
    const rowHtml = rows.map((row, index) => {
      const activeRow = active && index === cursor ? ' data-active="true"' : "";
      const disabled = row.primaryCommand ? "" : ' data-disabled="true"';
      const cells = columns.map(column => `<span class="operator-table-cell">${escapeHtml(row.columns?.[column] ?? "")}</span>`).join("");
      if (active) {
        return `<button type="button" class="operator-row operator-row-table" data-custom-screen-row="${index}" style="${gridStyle}"${activeRow}${disabled}><span class="operator-row-index">${index + 1}</span>${cells}</button>`;
      }
      return `<div class="operator-row operator-row-table operator-row-static" style="${gridStyle}"><span class="operator-row-index">${index + 1}</span>${cells}</div>`;
    }).join("");
    return `
      <div class="operator-table-header" style="${gridStyle}">
        <span class="operator-row-index">#</span>
        ${headerCells}
      </div>
      ${rowHtml || `<div class="operator-empty">${escapeHtml(section.emptyMessage || "(no rows)")}</div>`}
    `;
  }
  return rows.map((row, index) => {
    const activeRow = active && index === cursor ? ' data-active="true"' : "";
    const disabled = row.primaryCommand ? "" : ' data-disabled="true"';
    if (active) {
      return `
        <button type="button" class="operator-reference" data-custom-screen-row="${index}"${activeRow}${disabled}>
          <strong>[${escapeHtml(String(row.kind || section.dataSource || "row").toUpperCase())}] ${escapeHtml(row.label || "(row)")}</strong>
          <span>${escapeHtml(row.detail || "")}</span>
        </button>
      `;
    }
    return `
      <div class="operator-reference operator-reference-static">
        <strong>[${escapeHtml(String(row.kind || section.dataSource || "row").toUpperCase())}] ${escapeHtml(row.label || "(row)")}</strong>
        <span>${escapeHtml(row.detail || "")}</span>
      </div>
    `;
  }).join("") || `<div class="operator-empty">${escapeHtml(section.emptyMessage || "(no rows)")}</div>`;
}

function renderScreenSectionHtml(section = {}, {
  active = false,
  cursor = 0
} = {}) {
  const rowCount = (section.rows || []).length;
  const collapsed = Boolean(section.collapsed);
  const detailHtml = renderSectionDetailHtml(section.detailLines || [], section.emptyMessage || "(no rows)");
  if ((section.kind || "list") === "detail") {
    return `
      <section class="operator-screen-section" data-screen-section-index="${escapeHtml(String(section.index ?? 0))}" data-active="${active ? "true" : "false"}" data-collapsed="${collapsed ? "true" : "false"}">
        <div class="operator-screen-section-head">
          <strong>${escapeHtml(section.title || "Detail")}</strong>
          <span>${escapeHtml(section.kind || "detail")} · ${rowCount}${collapsed ? " · collapsed" : ""}</span>
        </div>
        ${collapsed ? "" : `<div class="operator-source-excerpt">${detailHtml}</div>`}
      </section>
    `;
  }
  return `
    <section class="operator-screen-section" data-screen-section-index="${escapeHtml(String(section.index ?? 0))}" data-active="${active ? "true" : "false"}" data-collapsed="${collapsed ? "true" : "false"}">
      <div class="operator-screen-section-head">
        <strong>${escapeHtml(section.title || "Section")}</strong>
        <span>${escapeHtml(section.kind || "list")} · ${rowCount}${collapsed ? " · collapsed" : ""}</span>
      </div>
      ${collapsed ? "" : `<div class="operator-source-layout">
        <div class="operator-source-list">
          ${renderSectionRowsHtml(section, { active, cursor })}
        </div>
        ${(section.detailLines || []).length
          ? `<div class="operator-source-excerpt">${detailHtml}</div>`
          : ""}
      </div>`}
    </section>
  `;
}

function setBridgeUnavailableState(documentTarget = null, message = "") {
  const byId = id => documentTarget?.getElementById?.(id) || null;
  const output = byId("operator-last-output");
  if (output) output.textContent = message || "Operator bridge unavailable.";
  const status = byId("operator-last-status");
  if (status) {
    status.dataset.status = "error";
    status.textContent = "error";
  }
  const commandInput = byId("operator-command-input");
  if (commandInput) commandInput.disabled = true;
}

export function renderOperatorWorkbenchState({
  snapshot = null,
  documentTarget = null,
  commandDraft = "",
  autocomplete = { preview: "", matches: [] }
} = {}) {
  const byId = id => documentTarget?.getElementById?.(id) || null;
  if (!snapshot) return;

  const body = documentTarget?.body;
  if (body) {
    body.dataset.focusPane = snapshot.ui?.focusedPane || "left";
    body.dataset.colorMode = snapshot.ui?.displaySettings?.colorMode || "auto";
    body.dataset.rowDensity = snapshot.ui?.displaySettings?.rowDensity || "comfortable";
    body.style.setProperty("--operator-font-size", `${snapshot.ui?.displaySettings?.fontSize || 14}px`);
    body.style.setProperty("--operator-pane-split", `${Math.round((snapshot.ui?.displaySettings?.paneSplit || 0.42) * 100)}%`);
  }

  const title = byId("operator-title");
  if (title) title.textContent = snapshot.topPane?.title || "Operator Workbench";
  const subtitle = byId("operator-subtitle");
  if (subtitle) subtitle.textContent = snapshot.topPane?.subtitle || "";
  const navigation = snapshot.topPane?.navigation || { chips: [], selectedIndex: 0 };
  const navStrip = byId("operator-nav-strip");
  if (navStrip) {
    navStrip.innerHTML = (navigation.chips || []).map((chip, index) => {
      const selected = snapshot.ui?.focusedPane === "top" && index === navigation.selectedIndex ? ' data-selected="true"' : "";
      const active = chip.active ? ' data-active="true"' : "";
      const tone = chip.tone ? ` data-tone="${escapeHtml(chip.tone)}"` : "";
      return `
        <button type="button" class="operator-nav-chip" data-nav-chip="${index}"${selected}${active}${tone}>
          <strong>${escapeHtml(chip.label || "")}</strong>
          <small>${escapeHtml(chip.type || "")}</small>
        </button>
      `;
    }).join("");
  }
  const navMeta = byId("operator-nav-meta");
  if (navMeta) {
    const chip = navigation.chips?.[navigation.selectedIndex] || null;
    navMeta.textContent = chip?.helpText
      || (snapshot.focus?.active ? `focus=${snapshot.focus.kind}:${snapshot.focus.id}` : "global navigation");
  }

  const leftHeader = byId("operator-left-header");
  if (leftHeader) leftHeader.textContent = snapshot.leftPane?.header || "";
  const leftTitle = byId("operator-left-title");
  if (leftTitle) leftTitle.textContent = snapshot.leftPane?.title || "Tree";
  const leftRows = byId("operator-left-rows");
  if (leftRows) {
    const rows = snapshot.leftPane?.rows || [];
    const columns = snapshot.leftPane?.columns || [];
    if (snapshot.leftPane?.mode === "results" && columns.length) {
      const gridStyle = `grid-template-columns:${gridTemplateColumnsForCount(columns.length)};`;
      const headerCells = columns.map(column => `<span class="operator-table-cell operator-table-head">${escapeHtml(column)}</span>`).join("");
      const rowHtml = rows.map((row, index) => {
        const active = index === snapshot.leftPane.cursor ? ' data-active="true"' : "";
        const selected = row.selected ? ' data-selected="true"' : "";
        const cells = columns.map(column => `<span class="operator-table-cell">${escapeHtml(row.columns?.[column] ?? "")}</span>`).join("");
        return `<button type="button" class="operator-row operator-row-table" data-left-row="${index}" style="${gridStyle}"${active}${selected}><span class="operator-row-index">${row.index}</span>${cells}</button>`;
      }).join("");
      leftRows.innerHTML = `
        <div class="operator-table-header" style="${gridStyle}">
          <span class="operator-row-index">#</span>
          ${headerCells}
        </div>
        ${rowHtml || '<div class="operator-empty">(no rows)</div>'}
      `;
    } else {
      leftRows.innerHTML = rows.map((row, index) => {
        const active = index === snapshot.leftPane.cursor ? ' data-active="true"' : "";
        const selected = row.selected ? ' data-selected="true"' : "";
        return `
          <button type="button" class="operator-row" data-left-row="${index}"${active}${selected}>
            <span class="operator-row-index">${row.index}</span>
            <span class="operator-row-main">
              <strong>${escapeHtml(row.label || "")}</strong>
              <span>${escapeHtml(row.summary || "")}</span>
            </span>
          </button>
        `;
      }).join("") || '<div class="operator-empty">(no rows)</div>';
    }
  }

  const inspectorTitle = byId("operator-inspector-title");
  if (inspectorTitle) inspectorTitle.textContent = snapshot.rightPane?.title || "Inspector";
  const inspectTab = byId("operator-tab-inspect");
  if (inspectTab) inspectTab.dataset.active = snapshot.rightPane?.activeScreenId === "inspect" ? "true" : "false";
  const referencesTab = byId("operator-tab-references");
  if (referencesTab) referencesTab.dataset.active = snapshot.rightPane?.activeScreenId === "references" ? "true" : "false";
  const sourceTab = byId("operator-tab-source");
  if (sourceTab) {
    sourceTab.dataset.active = snapshot.rightPane?.activeScreenId === "source" ? "true" : "false";
    sourceTab.disabled = !snapshot.rightPane?.tabs?.source;
  }
  const provenanceTab = byId("operator-tab-provenance");
  if (provenanceTab) {
    provenanceTab.dataset.active = snapshot.rightPane?.activeScreenId === "provenance" ? "true" : "false";
    provenanceTab.disabled = !snapshot.rightPane?.tabs?.provenance;
  }
  const customScreenBody = byId("operator-custom-screen-body");
  if (customScreenBody) {
    customScreenBody.hidden = false;
    const model = snapshot.rightPane?.screen || { rows: [], detailLines: [], columns: [], shape: "list-detail", emptyMessage: "(no rows)", sections: [] };
    const sections = (model.sections || []).length ? model.sections : [model];
    customScreenBody.innerHTML = `
        <div class="operator-screen-sections">
        ${sections.map((section, index) => renderScreenSectionHtml({
          ...section,
          index
        }, {
          active: index === (model.activeSectionIndex ?? 0),
          cursor: section.activeRowIndex ?? snapshot.rightPane?.cursor ?? 0
        })).join("")}
      </div>
    `;
  }

  const commandInput = byId("operator-command-input");
  if (commandInput && commandInput.value !== commandDraft) commandInput.value = commandDraft;
  const commandPreview = byId("operator-command-preview");
  if (commandPreview) commandPreview.textContent = autocomplete.preview || "";
  const commandMatches = byId("operator-command-matches");
  if (commandMatches) commandMatches.textContent = (autocomplete.matches || []).slice(0, 4).join("   ");
  const output = byId("operator-last-output");
  if (output) output.textContent = snapshot.ui?.lastOutput || "Ready.";
  const status = byId("operator-last-status");
  if (status) {
    status.dataset.status = snapshot.ui?.lastStatus || "info";
    status.textContent = snapshot.ui?.lastStatus || "info";
  }
  const numberBuffer = byId("operator-number-buffer");
  if (numberBuffer) numberBuffer.textContent = snapshot.ui?.numberBuffer ? `# ${snapshot.ui.numberBuffer}` : "";

  const help = byId("operator-help");
  if (help) help.hidden = !snapshot.ui?.helpOpen;
  const helpCopy = helpCopyForSnapshot(snapshot);
  const helpContext = byId("operator-help-context");
  if (helpContext) helpContext.textContent = helpCopy.context;
  const helpSummary = byId("operator-help-summary");
  if (helpSummary) helpSummary.textContent = helpCopy.summary;
}

export function startOperatorWorkbenchRuntime({
  windowTarget = globalThis?.window || null,
  documentTarget = globalThis?.document || null
} = {}) {
  const api = windowTarget?.witnessOperatorWorkbench || null;
  const byId = id => documentTarget?.getElementById?.(id) || null;
  let snapshot = null;
  let commandDraft = "";
  let autocomplete = { preview: "", matches: [] };

  if (!api || typeof api.getSnapshot !== "function") {
    setBridgeUnavailableState(documentTarget, "Operator bridge unavailable. Restart the desktop shell.");
    return {
      refresh: async () => null,
      runCommand: async () => null,
      dispatch: async () => null,
      started: Promise.resolve(null)
    };
  }

  async function refresh(nextSnapshot = null) {
    snapshot = nextSnapshot ?? await api.getSnapshot();
    renderOperatorWorkbenchState({
      snapshot,
      documentTarget,
      commandDraft,
      autocomplete
    });
    return snapshot;
  }

  async function updateAutocomplete() {
    autocomplete = await api.getAutocomplete(commandDraft);
    await refresh(snapshot);
  }

  async function runCommand(command) {
    commandDraft = "";
    autocomplete = { preview: "", matches: [] };
    const result = await api.runCommand(command);
    await refresh(result.snapshot);
  }

  async function dispatch(intent) {
    const result = await api.dispatchIntent(intent);
    await refresh(result.snapshot);
  }

  const commandInput = byId("operator-command-input");
  commandInput?.addEventListener?.("focus", () => {
    void dispatch({ type: "set-focused-pane", pane: "bottom" });
  });
  commandInput?.addEventListener?.("input", async event => {
    commandDraft = event.currentTarget?.value ?? "";
    await updateAutocomplete();
  });
  commandInput?.addEventListener?.("keydown", async event => {
    if (event.key === "Enter") {
      event.preventDefault();
      await runCommand(commandDraft);
      commandInput.focus();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      if (autocomplete.preview) {
        commandDraft = `${commandDraft}${autocomplete.preview}`;
        await updateAutocomplete();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      commandDraft = "";
      autocomplete = { preview: "", matches: [] };
      await dispatch({ type: "escape" });
    }
  });

  documentTarget?.addEventListener?.("click", async event => {
    const target = event.target;
    const leftRow = target?.closest?.("[data-left-row]");
    if (leftRow) {
      await dispatch({ type: "set-focused-pane", pane: "left" });
      await dispatch({ type: "set-left-cursor", index: Number(leftRow.dataset.leftRow) || 0 });
      return;
    }
    const customScreenRow = target?.closest?.("[data-custom-screen-row]");
    if (customScreenRow) {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({
        type: "set-right-screen-mode",
        mode: "custom-screen",
        screenId: snapshot?.rightPane?.activeScreenId || snapshot?.screens?.activeScreenId || null
      });
      await dispatch({ type: "set-right-cursor", index: Number(customScreenRow.dataset.customScreenRow) || 0 });
      return;
    }
    const screenSection = target?.closest?.("[data-screen-section-index]");
    if (screenSection) {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "set-right-section", index: Number(screenSection.dataset.screenSectionIndex) || 0 });
      return;
    }
    const navChip = target?.closest?.("[data-nav-chip]");
    if (navChip) {
      await dispatch({ type: "set-focused-pane", pane: "top" });
      await dispatch({ type: "set-top-cursor", index: Number(navChip.dataset.navChip) || 0 });
      return;
    }
    if (target?.id === "operator-tab-inspect") {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "set-inspector-tab", tab: "inspect" });
      return;
    }
    if (target?.id === "operator-tab-references") {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "set-inspector-tab", tab: "references" });
      return;
    }
    if (target?.id === "operator-tab-source") {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "set-inspector-tab", tab: "source" });
      return;
    }
    if (target?.id === "operator-tab-provenance") {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "set-inspector-tab", tab: "provenance" });
      return;
    }
    if (target?.id === "operator-help-button") {
      await dispatch({ type: "toggle-help" });
      return;
    }
    if (target?.id === "operator-settings-save") {
      await dispatch({ type: "set-focused-pane", pane: "bottom" });
      const fontSize = Number(byId("operator-setting-font-size")?.value || 14);
      const rowDensity = byId("operator-setting-row-density")?.value || "comfortable";
      const paneSplit = Number(byId("operator-setting-pane-split")?.value || 42) / 100;
      const pageSize = Number(byId("operator-setting-page-size")?.value || 25);
      const colorMode = byId("operator-setting-color-mode")?.value || "auto";
      const result = await api.updateDisplaySettings({
        fontSize,
        rowDensity,
        paneSplit,
        pageSize,
        colorMode
      });
      await refresh(result.snapshot);
    }
  });

  documentTarget?.addEventListener?.("dblclick", async event => {
    const target = event.target;
    if (target?.closest?.("[data-left-row]")) {
      await dispatch({ type: "activate-primary" });
      return;
    }
    if (target?.closest?.("[data-custom-screen-row]")) {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({
        type: "set-right-screen-mode",
        mode: "custom-screen",
        screenId: snapshot?.rightPane?.activeScreenId || snapshot?.screens?.activeScreenId || null
      });
      await dispatch({ type: "set-right-cursor", index: Number(target.closest("[data-custom-screen-row]").dataset.customScreenRow) || 0 });
      await dispatch({ type: "activate-primary" });
      return;
    }
    if (target?.closest?.("[data-nav-chip]")) {
      await dispatch({ type: "set-focused-pane", pane: "top" });
      await dispatch({ type: "set-top-cursor", index: Number(target.closest("[data-nav-chip]").dataset.navChip) || 0 });
      await dispatch({ type: "activate-primary" });
    }
  });

  windowTarget?.addEventListener?.("keydown", async event => {
    const editingCommand = event.target === commandInput;
    if (editingCommand && !event.altKey && !["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"].includes(event.key)) return;

    if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      await dispatch({ type: "set-focused-pane", pane: "left" });
      return;
    }
    if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      await dispatch({ type: "set-focused-pane", pane: "right" });
      return;
    }
    if (event.altKey && event.key === "ArrowDown") {
      event.preventDefault();
      commandInput?.focus?.();
      await dispatch({ type: "set-focused-pane", pane: "bottom" });
      return;
    }
    if (event.altKey && event.key === "ArrowUp") {
      event.preventDefault();
      await dispatch({ type: "set-focused-pane", pane: "top" });
      return;
    }
    if (event.key === "F1") {
      event.preventDefault();
      await dispatch({ type: "toggle-help" });
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "set-right-screen-mode", mode: "custom-screen", screenId: "references" });
      return;
    }
    if (event.key === "F3") {
      event.preventDefault();
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "set-right-screen-mode", mode: "custom-screen", screenId: "source" });
      return;
    }
    if (event.key === "F4") {
      event.preventDefault();
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "set-right-screen-mode", mode: "custom-screen", screenId: "provenance" });
      return;
    }
    if (/^F[5-8]$/.test(event.key)) {
      const shortcut = (snapshot?.screens?.shortcuts || []).find(row => row.shortcut === event.key) || null;
      if (shortcut) {
        event.preventDefault();
        await dispatch({ type: "set-focused-pane", pane: "right" });
        await dispatch({ type: "set-right-screen-mode", mode: "custom-screen", screenId: shortcut.screenId });
        return;
      }
    }
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      await dispatch({ type: "append-digit", digit: event.key });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      await dispatch({ type: "activate-primary" });
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      await dispatch({ type: "escape" });
      return;
    }
    if (event.key === "ArrowLeft" && snapshot?.ui?.focusedPane === "top") {
      event.preventDefault();
      await dispatch({ type: "move-cursor", direction: "left" });
      return;
    }
    if (event.key === "ArrowRight" && snapshot?.ui?.focusedPane === "top") {
      event.preventDefault();
      await dispatch({ type: "move-cursor", direction: "right" });
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      await dispatch({ type: "move-cursor", direction: "up" });
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      await dispatch({ type: "move-cursor", direction: "down" });
      return;
    }
    if (snapshot?.ui?.focusedPane === "right" && event.key === "[") {
      event.preventDefault();
      await dispatch({ type: "move-right-section", direction: "prev" });
      return;
    }
    if (snapshot?.ui?.focusedPane === "right" && event.key === "]") {
      event.preventDefault();
      await dispatch({ type: "move-right-section", direction: "next" });
      return;
    }
    if (snapshot?.ui?.focusedPane === "right" && event.key === "-") {
      event.preventDefault();
      await dispatch({ type: "collapse-right-section" });
      return;
    }
    if (snapshot?.ui?.focusedPane === "right" && event.key === "=") {
      event.preventDefault();
      await dispatch({ type: "expand-right-section" });
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      await dispatch({ type: "move-cursor", direction: "home" });
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      await dispatch({ type: "move-cursor", direction: "end" });
      return;
    }
    if (event.key === "PageUp") {
      event.preventDefault();
      await dispatch({ type: "move-cursor", direction: "page-up" });
      return;
    }
    if (event.key === "PageDown") {
      event.preventDefault();
      await dispatch({ type: "move-cursor", direction: "page-down" });
      return;
    }
    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      commandDraft = "sort by ";
      commandInput?.focus?.();
      await updateAutocomplete();
      return;
    }
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      commandDraft = "filter ";
      commandInput?.focus?.();
      await updateAutocomplete();
    }
  });

  const started = refresh().then(current => {
    const settings = current?.ui?.displaySettings || {};
    const fontSize = byId("operator-setting-font-size");
    if (fontSize) fontSize.value = settings.fontSize ?? 14;
    const rowDensity = byId("operator-setting-row-density");
    if (rowDensity) rowDensity.value = settings.rowDensity ?? "comfortable";
    const paneSplit = byId("operator-setting-pane-split");
    if (paneSplit) paneSplit.value = Math.round((settings.paneSplit ?? 0.42) * 100);
    const pageSize = byId("operator-setting-page-size");
    if (pageSize) pageSize.value = settings.pageSize ?? 25;
    const colorMode = byId("operator-setting-color-mode");
    if (colorMode) colorMode.value = settings.colorMode ?? "auto";
    return current;
  }).catch(error => {
    setBridgeUnavailableState(documentTarget, error instanceof Error ? error.message : String(error));
    return null;
  });

  return {
    refresh,
    runCommand,
    dispatch,
    started
  };
}
