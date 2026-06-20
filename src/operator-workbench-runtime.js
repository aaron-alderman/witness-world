export function renderOperatorWorkbenchRuntimeFactory() {
  return String.raw`
    const escapeHtml = ${escapeHtml.toString()};
    const gridTemplateColumnsForCount = ${gridTemplateColumnsForCount.toString()};
    const normalizeAsciiCell = ${normalizeAsciiCell.toString()};
    const fitAsciiCell = ${fitAsciiCell.toString()};
    const computeAsciiColumnWidths = ${computeAsciiColumnWidths.toString()};
    const buildAsciiBorderLine = ${buildAsciiBorderLine.toString()};
    const buildAsciiRowLine = ${buildAsciiRowLine.toString()};
    const buildAsciiBoxLines = ${buildAsciiBoxLines.toString()};
    const renderAsciiEntryHtml = ${renderAsciiEntryHtml.toString()};
    const renderAsciiTableHtml = ${renderAsciiTableHtml.toString()};
    const formatTabLabel = ${formatTabLabel.toString()};
    const getBoxChars = ${getBoxChars.toString()};
    const buildUnicodeBorderLine = ${buildUnicodeBorderLine.toString()};
    const buildUnicodeRowLine = ${buildUnicodeRowLine.toString()};
    const buildUnicodeTableLines = ${buildUnicodeTableLines.toString()};
    const buildUnicodeBoxLines = ${buildUnicodeBoxLines.toString()};
    const fitCanvasLine = ${fitCanvasLine.toString()};
    const leftPaneCanvasModel = ${leftPaneCanvasModel.toString()};
    const rightPaneCanvasModel = ${rightPaneCanvasModel.toString()};
    const topPaneCanvasModel = ${topPaneCanvasModel.toString()};
    const bottomPaneCanvasModel = ${bottomPaneCanvasModel.toString()};
    const paintBox = ${paintBox.toString()};
    const paintText = ${paintText.toString()};
    const drawOperatorWorkbenchCanvas = ${drawOperatorWorkbenchCanvas.toString()};
    const helpCopyForSnapshot = ${helpCopyForSnapshot.toString()};
    const renderSectionDetailHtml = ${renderSectionDetailHtml.toString()};
    const renderSectionRowsHtml = ${renderSectionRowsHtml.toString()};
    const renderScreenSectionHtml = ${renderScreenSectionHtml.toString()};
    const renderInteractiveScreenSectionHtml = ${renderInteractiveScreenSectionHtml.toString()};
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

function normalizeAsciiCell(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function fitAsciiCell(value, width) {
  const normalized = normalizeAsciiCell(value);
  const safeWidth = Math.max(1, Number(width) || 1);
  if (normalized.length <= safeWidth) {
    return normalized.padEnd(safeWidth, " ");
  }
  if (safeWidth <= 3) {
    return normalized.slice(0, safeWidth);
  }
  return `${normalized.slice(0, safeWidth - 3)}...`;
}

function computeAsciiColumnWidths(columns = [], rows = [], {
  indexWidth = 2,
  maxTableWidth = 96
} = {}) {
  const safeColumns = columns.length ? columns : ["value"];
  const rawWidths = safeColumns.map(column => {
    const labelWidth = normalizeAsciiCell(column).length;
    const rowWidth = rows.reduce((maxWidth, row) => {
      const value = row?.columns?.[column];
      return Math.max(maxWidth, normalizeAsciiCell(value).length);
    }, 0);
    return Math.max(6, labelWidth, rowWidth);
  });
  const widths = [...rawWidths];
  const minWidth = 6;
  const totalWidth = () =>
    1
    + (indexWidth + 2)
    + widths.reduce((sum, width) => sum + width + 3, 0);
  while (totalWidth() > maxTableWidth && widths.some(width => width > minWidth)) {
    const widestIndex = widths.reduce((bestIndex, width, index, list) =>
      width > list[bestIndex] ? index : bestIndex, 0);
    if (widths[widestIndex] <= minWidth) break;
    widths[widestIndex] -= 1;
  }
  return widths;
}

function buildAsciiBorderLine(widths = [], indexWidth = 2) {
  return `+-${"-".repeat(indexWidth)}-+-${widths.map(width => "-".repeat(width)).join("-+-")}-+`;
}

function buildAsciiRowLine(indexLabel, values = [], widths = [], indexWidth = 2) {
  const safeIndex = fitAsciiCell(indexLabel, indexWidth);
  const cells = values.map((value, index) => fitAsciiCell(value, widths[index] || 6));
  return `| ${safeIndex} | ${cells.join(" | ")} |`;
}

function buildAsciiBoxLines(lines = [], width = 78) {
  const safeWidth = Math.max(16, Number(width) || 78);
  const border = `+${"-".repeat(safeWidth - 2)}+`;
  const body = (lines.length ? lines : [""]).map(line => `| ${fitAsciiCell(line, safeWidth - 4)} |`);
  return [border, ...body, border];
}

function renderAsciiEntryHtml(row = {}, {
  active = false,
  interactive = false,
  dataAttr = "data-row",
  rowIndex = 0,
  width = 78
} = {}) {
  const kind = String(row.kind || row.type || "row").toUpperCase();
  const label = normalizeAsciiCell(row.label || "(row)");
  const detail = normalizeAsciiCell(row.detail || row.summary || "");
  const lines = [
    `${active ? ">" : " "} [${kind}] ${label}`,
    detail ? `  ${detail}` : ""
  ].filter((line, index) => index === 0 || line);
  const boxLines = buildAsciiBoxLines(lines, width);
  if (!interactive) {
    return `<div class="operator-ascii-entry-static">${boxLines.map(line => `<pre class="operator-ascii-line operator-ascii-entry-line">${escapeHtml(line)}</pre>`).join("")}</div>`;
  }
  const disabled = row.actionable === false ? ' data-disabled="true"' : "";
  const activeAttr = active ? ' data-active="true"' : "";
  return `<button type="button" class="operator-ascii-entry" ${dataAttr}="${rowIndex}"${activeAttr}${disabled}>${boxLines.map(line => `<span class="operator-ascii-line operator-ascii-entry-line">${escapeHtml(line)}</span>`).join("")}</button>`;
}

function formatTabLabel(label = "", active = false, enabled = true) {
  const safeLabel = normalizeAsciiCell(label || "TAB");
  if (!enabled) return `(${safeLabel})`;
  return active ? `<${safeLabel}>` : `[${safeLabel}]`;
}

function renderAsciiTableHtml({
  columns = [],
  rows = [],
  emptyMessage = "(no rows)",
  activeIndex = -1,
  interactive = false,
  rowDataAttr = "data-row",
  rowIndexForRow = (_row, index) => String(index + 1),
  rowValuesForRow = (row, resolvedColumns) => resolvedColumns.map(column => row?.columns?.[column] ?? ""),
  maxTableWidth = 96
} = {}) {
  const safeColumns = columns.length ? columns : ["value"];
  if (!rows.length) {
    return `<div class="operator-empty">${escapeHtml(emptyMessage)}</div>`;
  }
  const indexWidth = Math.max(2, rows.reduce((maxWidth, row, index) =>
    Math.max(maxWidth, String(rowIndexForRow(row, index)).length), 0));
  const widths = computeAsciiColumnWidths(safeColumns, rows.map((row, index) => ({
    columns: Object.fromEntries(safeColumns.map(column => [column, rowValuesForRow(row, safeColumns, index)?.[safeColumns.indexOf(column)] ?? ""]))
  })), {
    indexWidth,
    maxTableWidth
  });
  const borderLine = buildAsciiBorderLine(widths, indexWidth);
  const headerLine = buildAsciiRowLine("#", safeColumns.map(column => String(column).toUpperCase()), widths, indexWidth);
  const rowHtml = rows.map((row, index) => {
    const line = buildAsciiRowLine(
      rowIndexForRow(row, index),
      rowValuesForRow(row, safeColumns, index),
      widths,
      indexWidth
    );
    if (!interactive) {
      return `<pre class="operator-ascii-line operator-ascii-row operator-ascii-row-static">${escapeHtml(line)}</pre>`;
    }
    const active = index === activeIndex ? ' data-active="true"' : "";
    const disabled = row.actionable === false ? ' data-disabled="true"' : "";
    return `<button type="button" class="operator-ascii-row" ${rowDataAttr}="${index}"${active}${disabled}><span class="operator-ascii-line">${escapeHtml(line)}</span></button>`;
  }).join("");
  return `
    <div class="operator-ascii-table">
      <pre class="operator-ascii-line operator-ascii-border">${escapeHtml(borderLine)}</pre>
      <pre class="operator-ascii-line operator-ascii-header">${escapeHtml(headerLine)}</pre>
      <pre class="operator-ascii-line operator-ascii-border">${escapeHtml(borderLine)}</pre>
      ${rowHtml}
      <pre class="operator-ascii-line operator-ascii-border">${escapeHtml(borderLine)}</pre>
    </div>
  `;
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
    const section = snapshot?.rightPane?.activeSection ?? null;
    const sectionSummary = section
      ? [
          `section=${section.title || section.id || "section"}`,
          `rows=${section.rowCount ?? 0}`,
          `state=${section.collapsed ? "collapsed" : "expanded"}`
        ].join(" | ")
      : "section=(none)";
    return {
      context: `${snapshot?.rightPane?.screen?.title || "Screen"} | ${sectionSummary}`,
      summary: snapshot?.rightPane?.screen?.helpText
        || "Use [ and ] to move sections, - and = to collapse or expand, and Enter to activate the active row when the section is actionable."
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
  const activeRow = snapshot?.leftPane?.activeRow ?? null;
  const primaryLabel = activeRow?.primaryAction?.label ?? null;
  const targetLabel = activeRow?.label ?? "row";
  const leftKind = snapshot?.leftPane?.overlay
    ? "Search Overlay"
    : ((snapshot?.leftPane?.origin === "authored" ? "Authored" : "Navigation"));
  return {
    context: `${snapshot?.leftPane?.title || "Left Pane"} | ${leftKind}${snapshot?.leftPane?.paging ? ` | ${snapshot.leftPane.paging.start}-${snapshot.leftPane.paging.end} of ${snapshot.leftPane.paging.totalRows}` : ""}`,
    summary: primaryLabel
      ? `Move the active row, then Enter to ${primaryLabel} ${targetLabel}.`
      : "Move the active row, then Enter to trigger its primary action."
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
    return renderAsciiTableHtml({
      columns: ["key", "value"],
      rows,
      emptyMessage: section.emptyMessage || "(no rows)",
      interactive: false,
      rowValuesForRow: row => [
        row.columns?.key ?? row.key ?? row.label ?? "",
        row.columns?.value ?? row.value ?? row.detail ?? ""
      ],
      maxTableWidth: 104
    });
  }
  if ((kind === "table" || section.shape === "table-detail") && (section.columns || []).length) {
    return renderAsciiTableHtml({
      columns: section.columns || [],
      rows,
      emptyMessage: section.emptyMessage || "(no rows)",
      activeIndex: active ? cursor : -1,
      interactive: active,
      rowDataAttr: "data-custom-screen-row",
      rowValuesForRow: (row, columns) => columns.map(column => row.columns?.[column] ?? ""),
      maxTableWidth: 104
    });
  }
  return rows.map((row, index) => {
    return renderAsciiEntryHtml({
      ...row,
      kind: row.kind || section.dataSource || "row"
    }, {
      active: active && index === cursor,
      interactive: active,
      dataAttr: "data-custom-screen-row",
      rowIndex: index,
      width: 78
    });
  }).join("") || `<div class="operator-empty">${escapeHtml(section.emptyMessage || "(no rows)")}</div>`;
}

function renderScreenSectionHtml(section = {}, {
  active = false,
  cursor = 0
} = {}) {
  const rowCount = (section.rows || []).length;
  const collapsed = Boolean(section.collapsed);
  const detailStateText = `${section.kind || "detail"} | rows=${rowCount}${collapsed ? " | collapsed" : " | expanded"}`;
  const listStateText = `${section.kind || "list"} | rows=${rowCount}${collapsed ? " | collapsed" : " | expanded"}`;
  const detailHtml = renderSectionDetailHtml(section.detailLines || [], section.emptyMessage || "(no rows)");
  if ((section.kind || "list") === "detail") {
    return `
      <section class="operator-screen-section" data-screen-section-index="${escapeHtml(String(section.index ?? 0))}" data-active="${active ? "true" : "false"}" data-collapsed="${collapsed ? "true" : "false"}">
        <div class="operator-screen-section-head">
          <strong>${escapeHtml(section.title || "Detail")}</strong>
          <span>${escapeHtml(detailStateText)}</span>
        </div>
        ${collapsed ? "" : `<div class="operator-source-excerpt">${detailHtml}</div>`}
      </section>
    `;
  }
  return `
    <section class="operator-screen-section" data-screen-section-index="${escapeHtml(String(section.index ?? 0))}" data-active="${active ? "true" : "false"}" data-collapsed="${collapsed ? "true" : "false"}">
      <div class="operator-screen-section-head">
        <strong>${escapeHtml(section.title || "Section")}</strong>
        <span>${escapeHtml(listStateText)}</span>
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

function renderInteractiveScreenSectionHtml(section = {}, {
  active = false,
  cursor = 0
} = {}) {
  const rowCount = (section.rows || []).length;
  const collapsed = Boolean(section.collapsed);
  const actionable = Boolean(section.actionable);
  const stateText = [
    section.kind || "list",
    `rows=${rowCount}`,
    collapsed ? "collapsed" : "expanded",
    actionable ? "actionable" : "info"
  ].join(" | ");
  const toggleLabel = section.collapsible === false
    ? "[ ]"
    : (collapsed ? "[+]" : "[-]");
  const detailHtml = renderSectionDetailHtml(section.detailLines || [], section.emptyMessage || "(no rows)");
  const headerLines = buildAsciiBoxLines([
    `${section.title || "Section"} ${toggleLabel}`,
    stateText
  ], 82);
  const headerHtml = `
    <div class="operator-screen-section-head">
      <button type="button" class="operator-screen-section-header" data-screen-section-header="${escapeHtml(String(section.index ?? 0))}">
        ${headerLines.map(line => `<span class="operator-ascii-line operator-ascii-header-line">${escapeHtml(line)}</span>`).join("")}
      </button>
    </div>
  `;
  if ((section.kind || "list") === "detail") {
    return `
      <section class="operator-screen-section" data-screen-section-index="${escapeHtml(String(section.index ?? 0))}" data-active="${active ? "true" : "false"}" data-collapsed="${collapsed ? "true" : "false"}" data-actionable="${actionable ? "true" : "false"}">
        ${headerHtml}
        ${collapsed ? "" : `<div class="operator-source-excerpt">${detailHtml}</div>`}
      </section>
    `;
  }
  return `
    <section class="operator-screen-section" data-screen-section-index="${escapeHtml(String(section.index ?? 0))}" data-active="${active ? "true" : "false"}" data-collapsed="${collapsed ? "true" : "false"}" data-actionable="${actionable ? "true" : "false"}">
      ${headerHtml}
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
  if (title) title.textContent = snapshot.topPane?.title || "Operator TUI";
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
  if (leftTitle) leftTitle.textContent = snapshot.leftPane?.title || "LEFT PANE";
  const leftRows = byId("operator-left-rows");
  if (leftRows) {
    const rows = snapshot.leftPane?.rows || [];
    const columns = snapshot.leftPane?.columns || [];
    const leftShape = snapshot.leftPane?.shape || (snapshot.leftPane?.mode === "results" ? "table" : "tree");
    if (leftShape === "table" && columns.length) {
      leftRows.innerHTML = renderAsciiTableHtml({
        columns,
        rows,
        emptyMessage: "(no rows)",
        activeIndex: snapshot.leftPane.cursor ?? 0,
        interactive: true,
        rowDataAttr: "data-left-row",
        rowIndexForRow: row => row.index ?? "",
        rowValuesForRow: (row, resolvedColumns) => resolvedColumns.map(column => row.columns?.[column] ?? ""),
        maxTableWidth: 92
      });
    } else {
      leftRows.innerHTML = rows.map((row, index) => renderAsciiEntryHtml({
        ...row,
        kind: row.kind || row.type || "item",
        label: `${row.index ?? index + 1} ${row.label || ""}`.trim(),
        detail: row.summary || ""
      }, {
        active: index === snapshot.leftPane.cursor,
        interactive: true,
        dataAttr: "data-left-row",
        rowIndex: index,
        width: 72
      })).join("") || '<div class="operator-empty">(no rows)</div>';
    }
  }

  const inspectorTitle = byId("operator-inspector-title");
  if (inspectorTitle) inspectorTitle.textContent = snapshot.rightPane?.title || "RIGHT PANE";
  const inspectTab = byId("operator-tab-inspect");
  if (inspectTab) {
    const activeTab = snapshot.rightPane?.activeScreenId === "inspect";
    inspectTab.dataset.active = activeTab ? "true" : "false";
    inspectTab.textContent = formatTabLabel("INSPECT", activeTab, true);
  }
  const referencesTab = byId("operator-tab-references");
  if (referencesTab) {
    const activeTab = snapshot.rightPane?.activeScreenId === "references";
    referencesTab.dataset.active = activeTab ? "true" : "false";
    referencesTab.textContent = formatTabLabel("REFS", activeTab, true);
  }
  const sourceTab = byId("operator-tab-source");
  if (sourceTab) {
    const enabled = Boolean(snapshot.rightPane?.tabs?.source);
    const activeTab = snapshot.rightPane?.activeScreenId === "source";
    sourceTab.dataset.active = activeTab ? "true" : "false";
    sourceTab.disabled = !enabled;
    sourceTab.textContent = formatTabLabel("SOURCE", activeTab, enabled);
  }
  const provenanceTab = byId("operator-tab-provenance");
  if (provenanceTab) {
    const enabled = Boolean(snapshot.rightPane?.tabs?.provenance);
    const activeTab = snapshot.rightPane?.activeScreenId === "provenance";
    provenanceTab.dataset.active = activeTab ? "true" : "false";
    provenanceTab.disabled = !enabled;
    provenanceTab.textContent = formatTabLabel("PROVENANCE", activeTab, enabled);
  }
  const customScreenBody = byId("operator-custom-screen-body");
  if (customScreenBody) {
    customScreenBody.hidden = false;
    const model = snapshot.rightPane?.screen || { rows: [], detailLines: [], columns: [], shape: "list-detail", emptyMessage: "(no rows)", sections: [] };
    const sections = (model.sections || []).length ? model.sections : [model];
    customScreenBody.innerHTML = `
        <div class="operator-screen-sections">
        ${sections.map((section, index) => renderInteractiveScreenSectionHtml({
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
  if (output) output.textContent = snapshot.ui?.lastOutput || "ready";
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
    const screenSectionToggle = target?.closest?.("[data-screen-section-toggle]");
    if (screenSectionToggle) {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "set-right-section", index: Number(screenSectionToggle.dataset.screenSectionToggle) || 0 });
      await dispatch({ type: "toggle-right-section-collapsed" });
      return;
    }
    const screenSectionHeader = target?.closest?.("[data-screen-section-header]");
    if (screenSectionHeader) {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "set-right-section", index: Number(screenSectionHeader.dataset.screenSectionHeader) || 0 });
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
    const screenSectionHeader = target?.closest?.("[data-screen-section-header]");
    if (screenSectionHeader) {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "set-right-section", index: Number(screenSectionHeader.dataset.screenSectionHeader) || 0 });
      await dispatch({ type: "toggle-right-section-collapsed" });
      return;
    }
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
      if (snapshot?.leftPane?.mode !== "results") return;
      event.preventDefault();
      commandDraft = "sort by ";
      commandInput?.focus?.();
      await updateAutocomplete();
      return;
    }
    if (event.key.toLowerCase() === "f") {
      if (snapshot?.leftPane?.mode !== "results") return;
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
