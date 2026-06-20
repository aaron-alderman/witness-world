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
    const normalizeCanvasSelection = ${normalizeCanvasSelection.toString()};
    const canvasSelectionContains = ${canvasSelectionContains.toString()};
    const classifyCanvasTokenChar = ${classifyCanvasTokenChar.toString()};
    const expandCanvasWordSelection = ${expandCanvasWordSelection.toString()};
    const expandCanvasLineSelection = ${expandCanvasLineSelection.toString()};
    const extractCanvasSelectionText = ${extractCanvasSelectionText.toString()};
    const computeViewportStart = ${computeViewportStart.toString()};
    const effectivePaneSplit = ${effectivePaneSplit.toString()};
    const authoredViewportDefaults = ${authoredViewportDefaults.toString()};
    const readDisplaySettingsDraft = ${readDisplaySettingsDraft.toString()};
    const applyDisplaySettingsControls = ${applyDisplaySettingsControls.toString()};
    const settingsResetPatchForScope = ${settingsResetPatchForScope.toString()};
    const leftPaneCanvasModel = ${leftPaneCanvasModel.toString()};
    const rightPaneCanvasModel = ${rightPaneCanvasModel.toString()};
    const topPaneCanvasModel = ${topPaneCanvasModel.toString()};
    const bottomPaneCanvasModel = ${bottomPaneCanvasModel.toString()};
    const windowControlCanvasModel = ${windowControlCanvasModel.toString()};
    const syncWindowChromeOverlays = ${syncWindowChromeOverlays.toString()};
    const paintBox = ${paintBox.toString()};
    const paintText = ${paintText.toString()};
    const paintGlyph = ${paintGlyph.toString()};
    const paintWorkbenchFrame = ${paintWorkbenchFrame.toString()};
    const drawOperatorWorkbenchCanvas = ${drawOperatorWorkbenchCanvas.toString()};
    const helpCopyForSnapshot = ${helpCopyForSnapshot.toString()};
    const renderSectionDetailHtml = ${renderSectionDetailHtml.toString()};
    const renderSectionRowsHtml = ${renderSectionRowsHtml.toString()};
    const renderScreenSectionHtml = ${renderScreenSectionHtml.toString()};
    const renderInteractiveScreenSectionHtml = ${renderInteractiveScreenSectionHtml.toString()};
    const setBridgeUnavailableState = ${setBridgeUnavailableState.toString()};
    const renderOperatorWorkbenchState = ${renderOperatorWorkbenchState.toString()};
    const paintRuntimeFailureCanvas = ${paintRuntimeFailureCanvas.toString()};
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

function getBoxChars(variant = "single") {
  if (variant === "double") {
    return {
      h: "═",
      v: "║",
      tl: "╔",
      tr: "╗",
      bl: "╚",
      br: "╝",
      jt: "╦",
      jb: "╩",
      jl: "╠",
      jr: "╣",
      cross: "╬"
    };
  }
  return {
    h: "─",
    v: "│",
    tl: "┌",
    tr: "┐",
    bl: "└",
    br: "┘",
    jt: "┬",
    jb: "┴",
    jl: "├",
    jr: "┤",
    cross: "┼"
  };
}

function buildUnicodeBorderLine(widths = [], indexWidth = 2, left = "┌", join = "┬", right = "┐", variant = "single") {
  const chars = getBoxChars(variant);
  return `${left}${chars.h.repeat(indexWidth + 2)}${join}${widths.map(width => chars.h.repeat(width + 2)).join(join)}${right}`;
}

function buildUnicodeRowLine(indexLabel, values = [], widths = [], indexWidth = 2, variant = "single") {
  const chars = getBoxChars(variant);
  const safeIndex = fitAsciiCell(indexLabel, indexWidth);
  const cells = values.map((value, index) => fitAsciiCell(value, widths[index] || 6));
  return `${chars.v} ${safeIndex} ${chars.v} ${cells.join(` ${chars.v} `)} ${chars.v}`;
}

function buildUnicodeTableLines({
  columns = [],
  rows = [],
  rowIndexForRow = (_row, index) => String(index + 1),
  rowValuesForRow = (row, resolvedColumns) => resolvedColumns.map(column => row?.columns?.[column] ?? ""),
  maxTableWidth = 92,
  variant = "single"
} = {}) {
  const safeColumns = columns.length ? columns : ["value"];
  const indexWidth = Math.max(2, rows.reduce((maxWidth, row, index) =>
    Math.max(maxWidth, String(rowIndexForRow(row, index)).length), 0));
  const widths = computeAsciiColumnWidths(safeColumns, rows.map((row, index) => ({
    columns: Object.fromEntries(safeColumns.map(column => [column, rowValuesForRow(row, safeColumns, index)?.[safeColumns.indexOf(column)] ?? ""]))
  })), {
    indexWidth,
    maxTableWidth
  });
  const chars = getBoxChars(variant);
  const lines = [];
  const rowLineIndexes = [];
  lines.push(buildUnicodeBorderLine(widths, indexWidth, chars.tl, chars.jt, chars.tr, variant));
  lines.push(buildUnicodeRowLine("#", safeColumns.map(column => String(column).toUpperCase()), widths, indexWidth, variant));
  lines.push(buildUnicodeBorderLine(widths, indexWidth, chars.jl, chars.cross, chars.jr, variant));
  rows.forEach((row, index) => {
    rowLineIndexes.push(lines.length);
    lines.push(buildUnicodeRowLine(
      rowIndexForRow(row, index),
      rowValuesForRow(row, safeColumns, index),
      widths,
      indexWidth,
      variant
    ));
  });
  lines.push(buildUnicodeBorderLine(widths, indexWidth, chars.bl, chars.jb, chars.br, variant));
  return {
    lines,
    rowLineIndexes
  };
}

function buildUnicodeBoxLines(lines = [], width = 78, variant = "single") {
  const chars = getBoxChars(variant);
  const safeWidth = Math.max(16, Number(width) || 78);
  const borderTop = `${chars.tl}${chars.h.repeat(safeWidth - 2)}${chars.tr}`;
  const borderBottom = `${chars.bl}${chars.h.repeat(safeWidth - 2)}${chars.br}`;
  const body = (lines.length ? lines : [""]).map(line => `${chars.v} ${fitAsciiCell(line, safeWidth - 4)} ${chars.v}`);
  return [borderTop, ...body, borderBottom];
}

function fitCanvasLineLegacy(value, width) {
  const normalized = normalizeAsciiCell(value);
  if (normalized.length <= width) return normalized.padEnd(width, " ");
  if (width <= 1) return normalized.slice(0, width);
  return `${normalized.slice(0, width - 1)}…`;
}

function computeViewportStart(totalLines = 0, visibleLines = 0, activeLineIndex = 0) {
  const safeTotal = Math.max(0, Number(totalLines) || 0);
  const safeVisible = Math.max(1, Number(visibleLines) || 1);
  const safeActive = Math.max(0, Number(activeLineIndex) || 0);
  if (safeTotal <= safeVisible) return 0;
  const centered = safeActive - Math.floor(safeVisible / 2);
  return Math.max(0, Math.min(safeTotal - safeVisible, centered));
}

function fitCanvasLine(value, width) {
  const safeValue = String(value ?? "").replace(/[\r\n\t]/g, " ");
  const safeWidth = Math.max(1, Number(width) || 1);
  if (safeValue.length <= safeWidth) return safeValue.padEnd(safeWidth, " ");
  if (safeWidth <= 3) return safeValue.slice(0, safeWidth);
  return `${safeValue.slice(0, safeWidth - 3)}...`;
}

function effectivePaneSplit(snapshot = {}) {
  const layoutLeftWeight = Number(snapshot?.viewport?.layout?.leftWeight);
  if (Number.isFinite(layoutLeftWeight) && layoutLeftWeight > 0) {
    return Math.max(0.15, Math.min(0.85, layoutLeftWeight / 100));
  }
  return Number(snapshot?.ui?.displaySettings?.paneSplit || 0.42) || 0.42;
}

function authoredViewportDefaults(snapshot = {}) {
  const authoredLeftWeight = Number(snapshot?.viewport?.leftWeight);
  return {
    top: Number(snapshot?.viewport?.top ?? snapshot?.viewport?.layout?.top ?? 3) || 3,
    bottom: Number(snapshot?.viewport?.bottom ?? snapshot?.viewport?.layout?.bottom ?? 4) || 4,
    paneSplit: Number.isFinite(authoredLeftWeight) && authoredLeftWeight > 0
      ? Math.max(0.15, Math.min(0.85, authoredLeftWeight / 100))
      : 0.42
  };
}

function readDisplaySettingsDraft(byId) {
  return {
    fontSize: Number(byId("operator-setting-font-size")?.value || 14),
    rowDensity: byId("operator-setting-row-density")?.value || "comfortable",
    viewportTop: Number(byId("operator-setting-viewport-top")?.value || 3),
    viewportBottom: Number(byId("operator-setting-viewport-bottom")?.value || 4),
    paneSplit: Number(byId("operator-setting-pane-split")?.value || 42) / 100,
    pageSize: Number(byId("operator-setting-page-size")?.value || 25),
    colorMode: byId("operator-setting-color-mode")?.value || "auto"
  };
}

function applyDisplaySettingsControls(snapshot = {}, byId) {
  const settings = snapshot?.ui?.displaySettings || {};
  const fontSize = byId("operator-setting-font-size");
  if (fontSize) fontSize.value = settings.fontSize ?? 14;
  const rowDensity = byId("operator-setting-row-density");
  if (rowDensity) rowDensity.value = settings.rowDensity ?? "comfortable";
  const viewportTop = byId("operator-setting-viewport-top");
  if (viewportTop) viewportTop.value = settings.viewportTop ?? snapshot?.viewport?.layout?.top ?? 3;
  const viewportBottom = byId("operator-setting-viewport-bottom");
  if (viewportBottom) viewportBottom.value = settings.viewportBottom ?? snapshot?.viewport?.layout?.bottom ?? 4;
  const paneSplit = byId("operator-setting-pane-split");
  if (paneSplit) paneSplit.value = Math.round(effectivePaneSplit(snapshot) * 100);
  const pageSize = byId("operator-setting-page-size");
  if (pageSize) pageSize.value = settings.pageSize ?? 25;
  const colorMode = byId("operator-setting-color-mode");
  if (colorMode) colorMode.value = settings.colorMode ?? "auto";
}

function settingsResetPatchForScope(scope = "", snapshot = {}) {
  if (scope === "viewport") {
    return {
      patch: {
        viewportTop: null,
        viewportBottom: null,
        paneSplit: 0.42
      },
      defaults: authoredViewportDefaults(snapshot)
    };
  }
  return null;
}

function normalizeCanvasSelection(selection = null) {
  if (!selection?.anchor || !selection?.focus) return null;
  const mode = selection?.mode === "rectangular" ? "rectangular" : "linear";
  const anchorRow = Math.max(0, Number(selection.anchor.row) || 0);
  const anchorColumn = Math.max(0, Number(selection.anchor.column) || 0);
  const focusRow = Math.max(0, Number(selection.focus.row) || 0);
  const focusColumn = Math.max(0, Number(selection.focus.column) || 0);
  if (anchorRow < focusRow || (anchorRow === focusRow && anchorColumn <= focusColumn)) {
    return {
      mode,
      start: { row: anchorRow, column: anchorColumn },
      end: { row: focusRow, column: focusColumn }
    };
  }
  return {
    mode,
    start: { row: focusRow, column: focusColumn },
    end: { row: anchorRow, column: anchorColumn }
  };
}

function canvasSelectionContains(selection = null, row = 0, column = 0) {
  const normalized = normalizeCanvasSelection(selection);
  if (!normalized) return false;
  if (row < normalized.start.row || row > normalized.end.row) return false;
  if (normalized.mode === "rectangular") {
    return column >= normalized.start.column && column <= normalized.end.column;
  }
  if (normalized.start.row === normalized.end.row) {
    return row === normalized.start.row && column >= normalized.start.column && column <= normalized.end.column;
  }
  if (row === normalized.start.row) return column >= normalized.start.column;
  if (row === normalized.end.row) return column <= normalized.end.column;
  return true;
}

function classifyCanvasTokenChar(ch = " ") {
  if (!ch || /\s/u.test(ch)) return "space";
  if (/[\u2500-\u257f]/u.test(ch)) return "box";
  if (/[A-Za-z0-9_./:%<>\-[\]()]/u.test(ch)) return "word";
  return "symbol";
}

function expandCanvasWordSelection(buffer = [], cell = null) {
  const row = Math.max(0, Number(cell?.row) || 0);
  const column = Math.max(0, Number(cell?.column) || 0);
  const rowCells = buffer[row] || [];
  const rowChars = rowCells.map(canvasCell => canvasCell?.ch ?? " ");
  const currentChar = rowChars[column] ?? " ";
  const group = classifyCanvasTokenChar(currentChar);
  let startColumn = column;
  let endColumn = column;
  while (startColumn > 0 && classifyCanvasTokenChar(rowChars[startColumn - 1] ?? " ") === group) {
    startColumn -= 1;
  }
  while (endColumn < rowChars.length - 1 && classifyCanvasTokenChar(rowChars[endColumn + 1] ?? " ") === group) {
    endColumn += 1;
  }
  return {
    mode: "linear",
    anchor: { row, column: startColumn },
    focus: { row, column: endColumn }
  };
}

function expandCanvasLineSelection(buffer = [], cell = null) {
  const row = Math.max(0, Number(cell?.row) || 0);
  const rowCells = buffer[row] || [];
  const rowChars = rowCells.map(canvasCell => canvasCell?.ch ?? " ");
  let startColumn = rowChars.findIndex(ch => !/\s/u.test(ch));
  if (startColumn < 0) startColumn = 0;
  let endColumn = rowChars.length - 1;
  while (endColumn > startColumn && /\s/u.test(rowChars[endColumn] ?? " ")) {
    endColumn -= 1;
  }
  return {
    mode: "linear",
    anchor: { row, column: startColumn },
    focus: { row, column: endColumn }
  };
}

function extractCanvasSelectionText(buffer = [], selection = null) {
  const normalized = normalizeCanvasSelection(selection);
  if (!normalized) return "";
  const lines = [];
  for (let row = normalized.start.row; row <= normalized.end.row; row += 1) {
    const bufferRow = buffer[row] || [];
    const startColumn = normalized.mode === "rectangular"
      ? normalized.start.column
      : (row === normalized.start.row ? normalized.start.column : 0);
    const endColumn = normalized.mode === "rectangular"
      ? normalized.end.column
      : (row === normalized.end.row ? normalized.end.column : Math.max(0, bufferRow.length - 1));
    const text = bufferRow
      .slice(startColumn, endColumn + 1)
      .map(cell => cell?.ch ?? " ")
      .join("");
    lines.push(text);
  }
  return lines.join("\n");
}

function topPaneCanvasModel(snapshot = {}, cols = 80, reservedRight = 0) {
  const contentWidth = Math.max(1, cols - Math.max(0, Number(reservedRight) || 0));
  const navLabels = (snapshot?.topPane?.navigation?.chips || []).map((chip, index) => {
    const selected = index === (snapshot?.topPane?.navigation?.selectedIndex ?? 0) && snapshot?.ui?.focusedPane === "top";
    return selected ? `<${chip.label || "chip"}>` : `[${chip.label || "chip"}]`;
  });
  const line1 = `${snapshot?.topPane?.title || "Operator TUI"} :: ${snapshot?.topPane?.subtitle || "global shell"}`;
  const line2 = `NAV ${navLabels.join(" ")}`.trim();
  const line3 = snapshot?.focus?.active
    ? `FOCUS ${snapshot.focus.kind}:${snapshot.focus.id}`
    : `MODE ${(snapshot?.preview?.available ? "preview-read" : "repo-self")}`;
  return [
    fitCanvasLine(line1, contentWidth),
    fitCanvasLine(line2, contentWidth),
    fitCanvasLine(line3, contentWidth)
  ];
}

function leftPaneCanvasModel(snapshot = {}, width = 60) {
  const rows = snapshot?.leftPane?.rows || [];
  const columns = snapshot?.leftPane?.columns || [];
  const cursor = snapshot?.leftPane?.cursor ?? 0;
  if ((snapshot?.leftPane?.shape === "table" || snapshot?.leftPane?.mode === "results") && columns.length) {
    const table = buildUnicodeTableLines({
      columns,
      rows,
      rowIndexForRow: row => row.index ?? "",
      rowValuesForRow: (row, resolvedColumns) => resolvedColumns.map(column => row.columns?.[column] ?? ""),
      maxTableWidth: Math.max(32, width),
      variant: "single"
    });
    return {
      lines: table.lines,
      activeLineIndex: table.rowLineIndexes[cursor] ?? 0,
      rowLineIndexes: table.rowLineIndexes
    };
  }
  const lines = rows.map((row, index) => {
    const marker = index === cursor ? "▶" : " ";
    const indexLabel = String(row.index ?? index + 1).padStart(2, " ");
    const detail = row.summary ? ` :: ${row.summary}` : "";
    return fitCanvasLine(`${marker} ${indexLabel} ${row.label || ""}${detail}`, Math.max(12, width));
  });
  return {
    lines,
    activeLineIndex: cursor,
    rowLineIndexes: rows.map((_row, index) => index)
  };
}

function rightPaneCanvasModel(snapshot = {}, width = 72) {
  const model = snapshot?.rightPane?.screen || { sections: [] };
  const activeSectionIndex = model.activeSectionIndex ?? 0;
  const contentInset = 2;
  const innerWidth = Math.max(16, width - contentInset);
  const contentPad = " ".repeat(contentInset);
  const tabLabels = [
    formatTabLabel("INSPECT", snapshot?.rightPane?.activeScreenId === "inspect", true),
    formatTabLabel("REFS", snapshot?.rightPane?.activeScreenId === "references", true),
    formatTabLabel("SOURCE", snapshot?.rightPane?.activeScreenId === "source", Boolean(snapshot?.rightPane?.tabs?.source)),
    formatTabLabel("PROVENANCE", snapshot?.rightPane?.activeScreenId === "provenance", Boolean(snapshot?.rightPane?.tabs?.provenance))
  ];
  const lines = [fitCanvasLine(tabLabels.join(" "), width), ""];
  const hitLines = {
    tabLine: 0,
    sectionHeaders: [],
    rowLines: []
  };
  let activeLineIndex = 0;
  const sections = (model.sections || []).length ? model.sections : [model];
  sections.forEach((section, sectionIndex) => {
    const stateText = [
      section.kind || "list",
      `rows=${(section.rows || []).length}`,
      section.collapsed ? "collapsed" : "expanded",
      section.actionable === false ? "info" : "actionable"
    ].join(" | ");
    const headerLines = buildUnicodeBoxLines([
      `${sectionIndex === activeSectionIndex ? "▶" : " "} ${section.title || "Section"} ${section.collapsible === false ? "[ ]" : (section.collapsed ? "[+]" : "[-]")}`,
      stateText
    ], Math.max(20, innerWidth), sectionIndex === activeSectionIndex ? "double" : "single").map(line => `${contentPad}${line}`);
    hitLines.sectionHeaders.push(lines.length);
    if (sectionIndex === activeSectionIndex) activeLineIndex = lines.length;
    lines.push(...headerLines);
    if (section.collapsed) {
      lines.push("");
      return;
    }
    if ((section.kind === "table" || section.shape === "table-detail") && (section.columns || []).length) {
      const table = buildUnicodeTableLines({
        columns: section.columns || [],
        rows: section.rows || [],
        rowValuesForRow: (row, resolvedColumns) => resolvedColumns.map(column => row.columns?.[column] ?? ""),
        maxTableWidth: Math.max(24, innerWidth),
        variant: "single"
      });
      table.lines.forEach((line, index) => {
        if (table.rowLineIndexes.includes(index)) {
          const rowIndex = table.rowLineIndexes.indexOf(index);
          if (sectionIndex === activeSectionIndex && rowIndex === (section.activeRowIndex ?? 0)) {
            activeLineIndex = lines.length;
          }
          hitLines.rowLines.push({ lineIndex: lines.length, rowIndex, sectionIndex });
        }
        lines.push(`${contentPad}${line}`);
      });
    } else {
      (section.rows || []).forEach((row, rowIndex) => {
        if (sectionIndex === activeSectionIndex && rowIndex === (section.activeRowIndex ?? 0)) {
          activeLineIndex = lines.length;
        }
        hitLines.rowLines.push({ lineIndex: lines.length, rowIndex, sectionIndex });
        const marker = sectionIndex === activeSectionIndex && rowIndex === (section.activeRowIndex ?? 0) ? "▶" : " ";
        const detail = row.detail ? ` :: ${row.detail}` : "";
        lines.push(`${contentPad}${fitCanvasLine(`${marker} [${String(row.kind || "row").toUpperCase()}] ${row.label || "(row)"}${detail}`, Math.max(12, innerWidth))}`);
      });
    }
    (section.detailLines || []).forEach(line => {
      lines.push(`${contentPad}${fitCanvasLine(line, Math.max(12, innerWidth))}`);
    });
    lines.push("");
  });
  return {
    lines,
    hitLines,
    activeLineIndex,
    contentInset
  };
}

function bottomPaneCanvasModel(snapshot = {}, commandDraft = "", autocomplete = { preview: "", matches: [] }, cols = 80) {
  const help = "ALT← left ALT→ right ALT↑ top ALT↓ cmd | F1 help | F2 refs | F3 src | F4 prov";
  const output = `${snapshot?.ui?.lastStatus || "info"} :: ${snapshot?.ui?.lastOutput || "ready"}`;
  const command = `:${commandDraft}${snapshot?.ui?.focusedPane === "bottom" ? "█" : ""}${autocomplete.preview ? autocomplete.preview : ""}`;
  const matches = (autocomplete.matches || []).slice(0, 4).join("   ");
  return [
    fitCanvasLine(help, cols),
    fitCanvasLine(command || ":", cols),
    fitCanvasLine(matches, cols),
    fitCanvasLine(output, cols)
  ];
}

function windowControlCanvasModel(snapshot = {}) {
  const maximized = Boolean(snapshot?.hostWindow?.maximized);
  return [
    { id: "minimize", label: "[_]" },
    { id: "toggle-maximize", label: maximized ? "[❐]" : "[□]" },
    { id: "close", label: "[×]" }
  ];
}

function syncWindowChromeOverlays(documentTarget = null, snapshot = null) {
  const byId = id => documentTarget?.getElementById?.(id) || null;
  const hitState = documentTarget?.__operatorCanvasHitRegions || null;
  const canvas = byId("operator-canvas");
  if (!hitState || !canvas || typeof canvas.getBoundingClientRect !== "function") return;
  const drag = byId("operator-window-drag");
  const controls = byId("operator-window-controls");
  const minimize = byId("operator-window-minimize");
  const maximize = byId("operator-window-maximize");
  const close = byId("operator-window-close");
  const rect = canvas.getBoundingClientRect();
  const chrome = hitState.windowChrome || null;
  if (!chrome) return;

  if (drag) {
    drag.style.left = `${rect.left + (chrome.drag.x * hitState.cellWidth)}px`;
    drag.style.top = `${rect.top + (chrome.drag.y * hitState.cellHeight)}px`;
    drag.style.width = `${chrome.drag.width * hitState.cellWidth}px`;
    drag.style.height = `${chrome.drag.height * hitState.cellHeight}px`;
  }

  if (controls) {
    controls.style.left = `${rect.left + (chrome.controls.x * hitState.cellWidth)}px`;
    controls.style.top = `${rect.top + (chrome.controls.y * hitState.cellHeight)}px`;
    controls.style.width = `${chrome.controls.width * hitState.cellWidth}px`;
    controls.style.height = `${chrome.controls.height * hitState.cellHeight}px`;
  }

  const controlButtons = [minimize, maximize, close];
  chrome.buttons.forEach((button, index) => {
    const target = controlButtons[index];
    if (!target) return;
    target.style.width = `${button.width * hitState.cellWidth}px`;
    target.style.height = `${button.height * hitState.cellHeight}px`;
    target.style.minWidth = `${button.width * hitState.cellWidth}px`;
    target.style.minHeight = `${button.height * hitState.cellHeight}px`;
  });

  if (maximize) {
    maximize.setAttribute("aria-label", snapshot?.hostWindow?.maximized ? "Restore" : "Maximize");
  }
}

function paintBox(buffer, x, y, width, height, color = "#d7e2d2", variant = "single") {
  const chars = getBoxChars(variant);
  if (width < 2 || height < 2) return;
  for (let column = x + 1; column < x + width - 1; column += 1) {
    buffer[y][column] = { ch: chars.h, fg: color, bg: null };
    buffer[y + height - 1][column] = { ch: chars.h, fg: color, bg: null };
  }
  for (let row = y + 1; row < y + height - 1; row += 1) {
    buffer[row][x] = { ch: chars.v, fg: color, bg: null };
    buffer[row][x + width - 1] = { ch: chars.v, fg: color, bg: null };
  }
  buffer[y][x] = { ch: chars.tl, fg: color, bg: null };
  buffer[y][x + width - 1] = { ch: chars.tr, fg: color, bg: null };
  buffer[y + height - 1][x] = { ch: chars.bl, fg: color, bg: null };
  buffer[y + height - 1][x + width - 1] = { ch: chars.br, fg: color, bg: null };
}

function paintText(buffer, x, y, text, fg = "#d7e2d2", bg = null) {
  if (!buffer[y]) return;
  const chars = Array.from(String(text || ""));
  chars.forEach((ch, index) => {
    if (!buffer[y][x + index]) return;
    buffer[y][x + index] = { ch, fg, bg };
  });
}

function paintGlyph(buffer, x, y, ch, fg = "#d7e2d2", bg = null) {
  if (!buffer[y] || !buffer[y][x]) return;
  buffer[y][x] = { ch, fg, bg };
}

function paintWorkbenchFrame(buffer, {
  cols = 0,
  rows = 0,
  topHeight = 5,
  bottomHeight = 6,
  leftWidth = 24,
  focusedPane = "left",
  mutedColor = "#51665d",
  accentColor = "#6ee7a8"
} = {}) {
  const chars = getBoxChars("single");
  const topSeparatorY = Math.max(1, topHeight - 1);
  const bottomSeparatorY = Math.max(topSeparatorY + 1, rows - bottomHeight);
  const verticalSeparatorX = Math.max(1, leftWidth - 1);
  const colorFor = pane => (focusedPane === pane ? accentColor : mutedColor);
  const topColor = colorFor("top");
  const leftColor = colorFor("left");
  const rightColor = colorFor("right");
  const bottomColor = colorFor("bottom");
  const topLeftSeparatorColor = (focusedPane === "top" || focusedPane === "left") ? accentColor : mutedColor;
  const topRightSeparatorColor = (focusedPane === "top" || focusedPane === "right") ? accentColor : mutedColor;
  const bottomLeftSeparatorColor = (focusedPane === "bottom" || focusedPane === "left") ? accentColor : mutedColor;
  const bottomRightSeparatorColor = (focusedPane === "bottom" || focusedPane === "right") ? accentColor : mutedColor;
  const verticalSeparatorColor = (focusedPane === "left" || focusedPane === "right") ? accentColor : mutedColor;
  const topCenterColor = (focusedPane === "top" || focusedPane === "left" || focusedPane === "right")
    ? accentColor
    : mutedColor;
  const bottomCenterColor = (focusedPane === "bottom" || focusedPane === "left" || focusedPane === "right")
    ? accentColor
    : mutedColor;

  for (let x = 1; x < cols - 1; x += 1) {
    paintGlyph(buffer, x, 0, chars.h, topColor);
    paintGlyph(buffer, x, rows - 1, chars.h, bottomColor);
  }
  for (let x = 1; x < verticalSeparatorX; x += 1) {
    paintGlyph(buffer, x, topSeparatorY, chars.h, topLeftSeparatorColor);
    paintGlyph(buffer, x, bottomSeparatorY, chars.h, bottomLeftSeparatorColor);
  }
  for (let x = verticalSeparatorX + 1; x < cols - 1; x += 1) {
    paintGlyph(buffer, x, topSeparatorY, chars.h, topRightSeparatorColor);
    paintGlyph(buffer, x, bottomSeparatorY, chars.h, bottomRightSeparatorColor);
  }

  for (let y = 1; y < topSeparatorY; y += 1) {
    paintGlyph(buffer, 0, y, chars.v, topColor);
    paintGlyph(buffer, cols - 1, y, chars.v, topColor);
  }
  for (let y = topSeparatorY + 1; y < bottomSeparatorY; y += 1) {
    paintGlyph(buffer, 0, y, chars.v, leftColor);
    paintGlyph(buffer, cols - 1, y, chars.v, rightColor);
    paintGlyph(buffer, verticalSeparatorX, y, chars.v, verticalSeparatorColor);
  }
  for (let y = bottomSeparatorY + 1; y < rows - 1; y += 1) {
    paintGlyph(buffer, 0, y, chars.v, bottomColor);
    paintGlyph(buffer, cols - 1, y, chars.v, bottomColor);
  }

  paintGlyph(buffer, 0, 0, chars.tl, topColor);
  paintGlyph(buffer, cols - 1, 0, chars.tr, topColor);
  paintGlyph(buffer, 0, rows - 1, chars.bl, bottomColor);
  paintGlyph(buffer, cols - 1, rows - 1, chars.br, bottomColor);

  paintGlyph(buffer, 0, topSeparatorY, chars.jl, topLeftSeparatorColor);
  paintGlyph(buffer, cols - 1, topSeparatorY, chars.jr, topRightSeparatorColor);
  paintGlyph(buffer, verticalSeparatorX, topSeparatorY, chars.jt, topCenterColor);

  paintGlyph(buffer, 0, bottomSeparatorY, chars.jl, bottomLeftSeparatorColor);
  paintGlyph(buffer, cols - 1, bottomSeparatorY, chars.jr, bottomRightSeparatorColor);
  paintGlyph(buffer, verticalSeparatorX, bottomSeparatorY, chars.jb, bottomCenterColor);
}

function drawOperatorWorkbenchCanvas({
  snapshot = null,
  documentTarget = null,
  commandDraft = "",
  autocomplete = { preview: "", matches: [] }
} = {}) {
  const canvas = documentTarget?.getElementById?.("operator-canvas");
  if (!canvas || typeof canvas.getContext !== "function") return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const windowTarget = documentTarget?.defaultView || globalThis?.window || {};
  const fontSize = Number(snapshot?.ui?.displaySettings?.fontSize || 14);
  const fontFamily = "Consolas, Cascadia Mono, Cascadia Code, SFMono-Regular, Courier New, monospace";
  const cssWidth = canvas.clientWidth || windowTarget.innerWidth || 1280;
  const cssHeight = canvas.clientHeight || windowTarget.innerHeight || 900;
  const dpr = Number(windowTarget.devicePixelRatio || 1) || 1;
  if (canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.font = `${fontSize}px ${fontFamily}`;
  context.textBaseline = "top";
  const cellWidth = Math.max(8, Math.ceil(context.measureText("M").width));
  const cellHeight = Math.max(fontSize + 4, Math.ceil(fontSize * 1.35));
  const cols = Math.max(80, Math.floor(cssWidth / cellWidth));
  const rows = Math.max(30, Math.floor(cssHeight / cellHeight));
  const buffer = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ ch: " ", fg: "#d7e2d2", bg: null }))
  );
  const hitRegions = [];
  const topHeight = 5;
  const bottomHeight = 6;
  const mainHeight = Math.max(10, rows - topHeight - bottomHeight);
  const leftWidth = Math.max(24, Math.floor(cols * effectivePaneSplit(snapshot)));
  const rightWidth = Math.max(24, cols - leftWidth);
  const leftContentWidth = Math.max(1, leftWidth - 2);
  const rightContentWidth = Math.max(1, rightWidth - 2);
  const selection = normalizeCanvasSelection(documentTarget?.__operatorCanvasSelection || null);

  paintWorkbenchFrame(buffer, {
    cols,
    rows,
    topHeight,
    bottomHeight,
    leftWidth,
    focusedPane: snapshot?.ui?.focusedPane || "left",
    mutedColor: "#51665d",
    accentColor: "#6ee7a8"
  });

  const controlButtons = windowControlCanvasModel(snapshot);
  const controlCluster = controlButtons.map(button => button.label).join("");
  const controlGap = 1;
  const reservedTopRight = controlCluster.length + controlGap;
  const topLines = topPaneCanvasModel(snapshot, cols - 2, reservedTopRight);
  topLines.forEach((line, index) => paintText(buffer, 1, 1 + index, line, index === 0 ? "#b6ffd7" : "#d7e2d2"));
  const controlsX = Math.max(1, cols - 1 - controlCluster.length);
  paintText(buffer, controlsX, 1, controlCluster, "#b6ffd7");
  let buttonX = controlsX;
  const chromeButtons = [];
  controlButtons.forEach(button => {
    chromeButtons.push({
      id: button.id,
      x: buttonX,
      y: 1,
      width: button.label.length,
      height: 1
    });
    buttonX += button.label.length;
  });

  const leftLinesModel = leftPaneCanvasModel(snapshot, leftContentWidth);
  const leftVisible = Math.max(1, mainHeight - 2);
  const leftOffset = computeViewportStart(leftLinesModel.lines.length, leftVisible - 1, leftLinesModel.activeLineIndex || 0);
  paintText(buffer, 2, topHeight - 1, ` ${snapshot?.leftPane?.title || "LEFT"} `, "#b6ffd7");
  const leftHeaderText = snapshot?.leftPane?.paging
    ? `${snapshot.leftPane.header || ""} :: ${snapshot.leftPane.paging.start}-${snapshot.leftPane.paging.end}/${snapshot.leftPane.paging.totalRows}`
    : (snapshot?.leftPane?.header || "");
  paintText(buffer, 2, topHeight, fitCanvasLine(leftHeaderText, Math.max(1, leftContentWidth - 1)), "#8d9b8c");
  leftLinesModel.lines.slice(leftOffset, leftOffset + leftVisible - 1).forEach((line, index) => {
    const absoluteLine = leftOffset + index;
    const isActive = absoluteLine === leftLinesModel.activeLineIndex;
    const row = snapshot?.leftPane?.rows?.[absoluteLine] ?? null;
    const baseColor = row?.type === "container"
      ? "#8fd8c5"
      : (row?.type === "alias" ? "#d8c78f" : "#d7e2d2");
    paintText(
      buffer,
      1,
      topHeight + 1 + index,
      fitCanvasLine(line, leftContentWidth),
      isActive ? "#b6ffd7" : baseColor
    );
  });
  leftLinesModel.rowLineIndexes.forEach((lineIndex, rowIndex) => {
    const visibleLine = lineIndex - leftOffset;
    if (visibleLine < 0 || visibleLine >= leftVisible - 1) return;
    hitRegions.push({
      kind: "left-row",
      x: 1,
      y: topHeight + 1 + visibleLine,
      width: leftWidth - 2,
      height: 1,
      rowIndex
    });
  });

  const rightModel = rightPaneCanvasModel(snapshot, rightContentWidth);
  const rightVisible = Math.max(1, mainHeight - 2);
  const rightOffset = computeViewportStart(rightModel.lines.length, rightVisible, rightModel.activeLineIndex || 0);
  paintText(buffer, leftWidth + 1, topHeight - 1, ` ${snapshot?.rightPane?.title || "RIGHT"} `, "#b6ffd7");
  rightModel.lines.slice(rightOffset, rightOffset + rightVisible).forEach((line, index) => {
    paintText(buffer, leftWidth, topHeight + index, fitCanvasLine(line, rightContentWidth), index === 0 ? "#b6ffd7" : "#d7e2d2");
  });
  const tabLineY = topHeight;
  const tabLabels = [
    { id: "inspect", label: formatTabLabel("INSPECT", snapshot?.rightPane?.activeScreenId === "inspect", true) },
    { id: "references", label: formatTabLabel("REFS", snapshot?.rightPane?.activeScreenId === "references", true) },
    { id: "source", label: formatTabLabel("SOURCE", snapshot?.rightPane?.activeScreenId === "source", Boolean(snapshot?.rightPane?.tabs?.source)) },
    { id: "provenance", label: formatTabLabel("PROVENANCE", snapshot?.rightPane?.activeScreenId === "provenance", Boolean(snapshot?.rightPane?.tabs?.provenance)) }
  ];
  let tabX = leftWidth + (rightModel.contentInset || 0);
  tabLabels.forEach(tab => {
    hitRegions.push({ kind: "tab", x: tabX, y: tabLineY, width: tab.label.length, height: 1, tabId: tab.id });
    tabX += tab.label.length + 1;
  });
  rightModel.hitLines.sectionHeaders.forEach((lineIndex, sectionIndex) => {
    const visibleLine = lineIndex - rightOffset;
    if (visibleLine < 0 || visibleLine >= rightVisible) return;
    hitRegions.push({
      kind: "section-header",
      x: leftWidth + (rightModel.contentInset || 0),
      y: topHeight + visibleLine,
      width: Math.max(1, rightWidth - 1 - (rightModel.contentInset || 0)),
      height: 3,
      sectionIndex
    });
  });
  rightModel.hitLines.rowLines.forEach(region => {
    const visibleLine = region.lineIndex - rightOffset;
    if (visibleLine < 0 || visibleLine >= rightVisible) return;
    hitRegions.push({
      kind: "right-row",
      x: leftWidth + (rightModel.contentInset || 0),
      y: topHeight + visibleLine,
      width: Math.max(1, rightWidth - 1 - (rightModel.contentInset || 0)),
      height: 1,
      rowIndex: region.rowIndex,
      sectionIndex: region.sectionIndex
    });
  });

  const bottomLines = bottomPaneCanvasModel(snapshot, commandDraft, autocomplete, cols - 2);
  paintText(buffer, 2, rows - bottomHeight, " COMMAND ", "#b6ffd7");
  bottomLines.forEach((line, index) => paintText(buffer, 1, rows - bottomHeight + 1 + index, line, index === 1 ? "#b6ffd7" : "#d7e2d2"));
  hitRegions.push({
    kind: "command",
    x: 1,
    y: rows - bottomHeight + 1,
    width: cols - 2,
    height: 2
  });

  if (snapshot?.ui?.helpOpen) {
    const helpCopy = helpCopyForSnapshot(snapshot);
    const helpLines = buildUnicodeBoxLines([
      "HELP",
      helpCopy.context || "pane",
      helpCopy.summary || "browse and inspect the modeled system",
      "ENTER primary  ESC unwind  TAB complete  F2 refs  F3 src  F4 prov"
    ], Math.min(cols - 6, 84), "double");
    const helpWidth = helpLines[0].length;
    const helpX = Math.max(2, Math.floor((cols - helpWidth) / 2));
    const helpY = Math.max(2, Math.floor((rows - helpLines.length) / 2));
    helpLines.forEach((line, index) => paintText(buffer, helpX, helpY + index, line, index === 0 || index === helpLines.length - 1 ? "#b6ffd7" : "#d7e2d2"));
  }

  context.fillStyle = "#0b0f0d";
  context.fillRect(0, 0, cssWidth, cssHeight);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < cols; column += 1) {
      const cell = buffer[row][column];
      const isSelected = canvasSelectionContains(selection, row, column);
      if (isSelected || cell?.bg) {
        context.fillStyle = isSelected ? "#244233" : cell.bg;
        context.fillRect(column * cellWidth, row * cellHeight, cellWidth, cellHeight);
      }
      if (!cell || cell.ch === " ") continue;
      context.fillStyle = cell.fg || "#d7e2d2";
      context.fillText(cell.ch, column * cellWidth, row * cellHeight);
    }
  }

  documentTarget.__operatorCanvasHitRegions = {
    regions: hitRegions,
    cellWidth,
    cellHeight,
    layout: {
      top: { x: 0, y: 0, width: cols, height: topHeight },
      left: { x: 0, y: topHeight - 1, width: leftWidth, height: mainHeight + 1 },
      right: { x: leftWidth - 1, y: topHeight - 1, width: rightWidth + 1, height: mainHeight + 1 },
      bottom: { x: 0, y: rows - bottomHeight, width: cols, height: bottomHeight }
    },
    windowChrome: {
      drag: {
        x: 0,
        y: 0,
        width: Math.max(1, controlsX - controlGap),
        height: 2
      },
      controls: {
        x: controlsX,
        y: 1,
        width: controlCluster.length,
        height: 1
      },
      buttons: chromeButtons
    }
  };
  documentTarget.__operatorCanvasState = {
    buffer,
    rows,
    cols,
    cellWidth,
    cellHeight,
    selection
  };
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
  rowAttributesForRow = () => "",
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
    return `<button type="button" class="operator-ascii-row" ${rowDataAttr}="${index}"${active}${disabled}${rowAttributesForRow(row, index)}><span class="operator-ascii-line">${escapeHtml(line)}</span></button>`;
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
      <button type="button" class="operator-screen-section-toggle" data-screen-section-toggle="${escapeHtml(String(section.index ?? 0))}"${section.collapsible === false ? ' disabled="true"' : ""} style="display:none">${escapeHtml(toggleLabel)}</button>
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
  const bootstrapStatusMessage = message || "Operator bridge unavailable.";
  documentTarget?.defaultView?.__operatorWorkbenchSetBootstrapStatus?.(
    "Operator workbench unavailable.",
    bootstrapStatusMessage
  );
  const bootstrapStatus = byId("operator-bootstrap-status");
  if (bootstrapStatus) {
    bootstrapStatus.hidden = false;
    bootstrapStatus.dataset.state = "error";
    bootstrapStatus.innerHTML = `<strong>Operator workbench unavailable.</strong><div>${escapeHtml(bootstrapStatusMessage)}</div>`;
  }
  const output = byId("operator-last-output");
  if (output) output.textContent = bootstrapStatusMessage;
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
    body.style.setProperty("--operator-pane-split", `${Math.round(effectivePaneSplit(snapshot) * 100)}%`);
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
      leftRows.innerHTML = `<!-- grid-template-columns:${gridTemplateColumnsForCount(columns.length)} -->${renderAsciiTableHtml({
        columns,
        rows,
        emptyMessage: "(no rows)",
        activeIndex: snapshot.leftPane.cursor ?? 0,
        interactive: true,
        rowDataAttr: "data-left-row",
        rowIndexForRow: row => row.index ?? "",
        rowValuesForRow: (row, resolvedColumns) => resolvedColumns.map(column => row.columns?.[column] ?? ""),
        rowAttributesForRow: row => row.selected ? ' data-selected="true"' : "",
        maxTableWidth: 92
      })}`;
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

  applyDisplaySettingsControls(snapshot, byId);

  drawOperatorWorkbenchCanvas({
    snapshot,
    documentTarget,
    commandDraft,
    autocomplete
  });
  syncWindowChromeOverlays(documentTarget, snapshot);
}

function paintRuntimeFailureCanvas(documentTarget = null, message = "", detail = "") {
  const canvas = documentTarget?.getElementById?.("operator-canvas");
  if (!canvas || typeof canvas.getContext !== "function") return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.clientWidth || documentTarget?.defaultView?.innerWidth || 1280;
  const height = canvas.clientHeight || documentTarget?.defaultView?.innerHeight || 900;
  canvas.width = width;
  canvas.height = height;
  const wrapText = (text, maxWidth) => {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (context.measureText(next).width <= maxWidth || !current) {
        current = next;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };
  context.fillStyle = "#0b0f0d";
  context.fillRect(0, 0, width, height);
  context.font = "16px Consolas, 'Cascadia Mono', 'Courier New', monospace";
  const boxWidth = Math.min(width - 48, 920);
  const messageLines = wrapText(String(message || "Operator workbench failed."), boxWidth - 32);
  const detailLines = detail ? wrapText(String(detail), boxWidth - 32) : [];
  const footerLine = "Press F12 for devtools or Ctrl+W to close.";
  const boxHeight = 110 + (messageLines.length * 24) + (detailLines.length * 24) + 36;
  const boxX = Math.max(24, Math.floor((width - boxWidth) / 2));
  const boxY = Math.max(48, Math.floor((height - boxHeight) / 2));
  context.strokeStyle = "#ffb86c";
  context.strokeRect(boxX, boxY, boxWidth, boxHeight);
  context.strokeRect(boxX, boxY, boxWidth, 36);
  context.fillStyle = "#ffe4c2";
  context.fillText("Operator TUI", boxX + 16, boxY + 22);
  let textY = boxY + 76;
  context.fillStyle = "#ffe4c2";
  messageLines.forEach(line => {
    context.fillText(line, boxX + 16, textY);
    textY += 24;
  });
  context.fillStyle = "#8d9b8c";
  if (detailLines.length) {
    context.fillStyle = "#d7e2d2";
    detailLines.forEach(line => {
      context.fillText(line, boxX + 16, textY);
      textY += 24;
    });
  }
  context.fillStyle = "#8d9b8c";
  context.fillText(footerLine, boxX + 16, boxY + boxHeight - 22);
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
  let suppressCanvasClick = false;
  let canvasSelectionDrag = null;

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
    windowTarget?.__operatorWorkbenchBooted?.();
    return snapshot;
  }

  function repaint() {
    if (!snapshot) return;
    renderOperatorWorkbenchState({
      snapshot,
      documentTarget,
      commandDraft,
      autocomplete
    });
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

  async function runWindowControl(action) {
    if (typeof api.windowControl !== "function") return;
    const nextSnapshot = await api.windowControl(action);
    await refresh(nextSnapshot);
  }

  const commandInput = byId("operator-command-input");
  const canvas = byId("operator-canvas");
  const windowDrag = byId("operator-window-drag");
  const windowMinimize = byId("operator-window-minimize");
  const windowMaximize = byId("operator-window-maximize");
  const windowClose = byId("operator-window-close");
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
  windowDrag?.addEventListener?.("dblclick", async event => {
    event.preventDefault?.();
    await runWindowControl("toggle-maximize");
  });
  windowMinimize?.addEventListener?.("click", async event => {
    event.preventDefault?.();
    await runWindowControl("minimize");
  });
  windowMaximize?.addEventListener?.("click", async event => {
    event.preventDefault?.();
    await runWindowControl("toggle-maximize");
  });
  windowClose?.addEventListener?.("click", async event => {
    event.preventDefault?.();
    await runWindowControl("close");
  });

  function regionForCanvasEvent(event) {
    const state = documentTarget?.__operatorCanvasHitRegions || null;
    if (!state || !canvas || typeof canvas.getBoundingClientRect !== "function") return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = Number(event?.clientX ?? 0);
    const clientY = Number(event?.clientY ?? 0);
    const column = Math.floor((clientX - rect.left) / state.cellWidth);
    const row = Math.floor((clientY - rect.top) / state.cellHeight);
    const exact = state.regions.find(region =>
      column >= region.x
      && column < region.x + region.width
      && row >= region.y
      && row < region.y + region.height
    ) || null;
    if (exact) return exact;
    const pane = state.layout || null;
    if (!pane) return null;
    if (row >= pane.bottom.y && row < pane.bottom.y + pane.bottom.height) return { kind: "command" };
    if (row >= pane.top.y && row < pane.top.y + pane.top.height) return { kind: "top-pane" };
    if (column < pane.left.width) return { kind: "left-pane" };
    return { kind: "right-pane" };
  }

  function cellForCanvasEvent(event) {
    const state = documentTarget?.__operatorCanvasHitRegions || null;
    if (!state || !canvas || typeof canvas.getBoundingClientRect !== "function") return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = Number(event?.clientX ?? 0);
    const clientY = Number(event?.clientY ?? 0);
    return {
      column: Math.max(0, Math.floor((clientX - rect.left) / state.cellWidth)),
      row: Math.max(0, Math.floor((clientY - rect.top) / state.cellHeight))
    };
  }

  function setCanvasSelection(selection = null) {
    if (!selection) {
      delete documentTarget.__operatorCanvasSelection;
    } else {
      documentTarget.__operatorCanvasSelection = selection;
    }
    repaint();
  }

  async function dispatchCanvasRegion(region, { double = false } = {}) {
    if (!region) return false;
    if (region.kind === "command") {
      commandInput?.focus?.();
      await dispatch({ type: "set-focused-pane", pane: "bottom" });
      return true;
    }
    if (region.kind === "tab") {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "set-inspector-tab", tab: region.tabId });
      return true;
    }
    if (region.kind === "left-row") {
      await dispatch({ type: "set-focused-pane", pane: "left" });
      await dispatch({ type: "set-left-cursor", index: region.rowIndex });
      if (double) await dispatch({ type: "activate-primary" });
      return true;
    }
    if (region.kind === "right-row") {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({
        type: "set-right-screen-mode",
        mode: "custom-screen",
        screenId: snapshot?.rightPane?.activeScreenId || snapshot?.screens?.activeScreenId || null
      });
      await dispatch({ type: "set-right-section", index: region.sectionIndex });
      await dispatch({ type: "set-right-cursor", index: region.rowIndex });
      if (double) await dispatch({ type: "activate-primary" });
      return true;
    }
    if (region.kind === "top-pane") {
      await dispatch({ type: "set-focused-pane", pane: "top" });
      return true;
    }
    if (region.kind === "left-pane") {
      await dispatch({ type: "set-focused-pane", pane: "left" });
      return true;
    }
    if (region.kind === "right-pane") {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      return true;
    }
    if (region.kind === "section-header") {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "set-right-section", index: region.sectionIndex });
      if (double) await dispatch({ type: "toggle-right-section-collapsed" });
      return true;
    }
    return false;
  }

  canvas?.addEventListener?.("click", async event => {
    const cell = cellForCanvasEvent(event);
    if (cell && Number(event?.detail || 0) >= 3) {
      const lineSelection = expandCanvasLineSelection(
        documentTarget?.__operatorCanvasState?.buffer || [],
        cell
      );
      setCanvasSelection(lineSelection);
      suppressCanvasClick = true;
      event.preventDefault?.();
      return;
    }
    if (cell && Number(event?.detail || 0) === 2) {
      const wordSelection = expandCanvasWordSelection(
        documentTarget?.__operatorCanvasState?.buffer || [],
        cell
      );
      setCanvasSelection(wordSelection);
      suppressCanvasClick = true;
      event.preventDefault?.();
      return;
    }
    if (suppressCanvasClick) {
      suppressCanvasClick = false;
      event.preventDefault?.();
      return;
    }
    const region = regionForCanvasEvent(event);
    if (await dispatchCanvasRegion(region, { double: false })) {
      event.preventDefault?.();
    }
  });

  canvas?.addEventListener?.("dblclick", event => {
    event.preventDefault?.();
  });

  canvas?.addEventListener?.("wheel", async event => {
    const region = regionForCanvasEvent(event);
    if (!region) return;
    event.preventDefault?.();
    const direction = Number(event.deltaY || 0) < 0 ? "up" : "down";
    if (region.kind === "left-row" || region.kind === "left-pane") {
      await dispatch({ type: "set-focused-pane", pane: "left" });
      await dispatch({ type: "move-cursor", direction });
      return;
    }
    if (region.kind === "right-row" || region.kind === "right-pane" || region.kind === "section-header") {
      await dispatch({ type: "set-focused-pane", pane: "right" });
      await dispatch({ type: "move-cursor", direction });
      return;
    }
    if (region.kind === "top-pane") {
      await dispatch({ type: "set-focused-pane", pane: "top" });
      await dispatch({ type: "move-cursor", direction: Number(event.deltaY || 0) < 0 ? "left" : "right" });
    }
  });

  canvas?.addEventListener?.("mousedown", event => {
    if (Number(event?.button ?? 0) !== 0) return;
    const cell = cellForCanvasEvent(event);
    if (!cell) return;
    canvasSelectionDrag = {
      anchor: cell,
      focus: cell,
      moved: false,
      mode: event?.altKey ? "rectangular" : "linear"
    };
    documentTarget.__operatorCanvasSelection = {
      mode: canvasSelectionDrag.mode,
      anchor: cell,
      focus: cell
    };
    repaint();
  });

  canvas?.addEventListener?.("mousemove", event => {
    if (!canvasSelectionDrag) return;
    const cell = cellForCanvasEvent(event);
    if (!cell) return;
    if (cell.row !== canvasSelectionDrag.focus.row || cell.column !== canvasSelectionDrag.focus.column) {
      canvasSelectionDrag.focus = cell;
      canvasSelectionDrag.moved = true;
      documentTarget.__operatorCanvasSelection = {
        mode: canvasSelectionDrag.mode,
        anchor: canvasSelectionDrag.anchor,
        focus: canvasSelectionDrag.focus
      };
      repaint();
    }
  });

  windowTarget?.addEventListener?.("mouseup", event => {
    if (Number(event?.button ?? 0) !== 0 || !canvasSelectionDrag) return;
    if (!canvasSelectionDrag.moved) {
      delete documentTarget.__operatorCanvasSelection;
      repaint();
    } else {
      suppressCanvasClick = true;
    }
    canvasSelectionDrag = null;
  });

  documentTarget?.addEventListener?.("copy", event => {
    const text = extractCanvasSelectionText(
      documentTarget?.__operatorCanvasState?.buffer || [],
      documentTarget?.__operatorCanvasSelection || null
    );
    if (!text) return;
    event.clipboardData?.setData?.("text/plain", text);
    event.preventDefault?.();
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
      const {
        fontSize,
        rowDensity,
        viewportTop,
        viewportBottom,
        paneSplit,
        pageSize,
        colorMode
      } = readDisplaySettingsDraft(byId);
      await dispatch({ type: "set-focused-pane", pane: "bottom" });
      const result = await api.updateDisplaySettings({
        fontSize,
        rowDensity,
        viewportTop,
        viewportBottom,
        paneSplit,
        pageSize,
        colorMode
      });
      await refresh(result.snapshot);
      return;
    }
    const resetScope = target?.dataset?.settingsResetScope
      ?? target?.closest?.("[data-settings-reset-scope]")?.dataset?.settingsResetScope
      ?? null;
    if (resetScope) {
      const resetPlan = settingsResetPatchForScope(resetScope, snapshot);
      if (!resetPlan) return;
      await dispatch({ type: "set-focused-pane", pane: "bottom" });
      const result = await api.updateDisplaySettings(resetPlan.patch);
      await refresh(result.snapshot);
      applyDisplaySettingsControls(result.snapshot, byId);
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

    if ((event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "c") {
      const text = extractCanvasSelectionText(
        documentTarget?.__operatorCanvasState?.buffer || [],
        documentTarget?.__operatorCanvasSelection || null
      );
      if (text) {
        event.preventDefault();
        if (windowTarget?.navigator?.clipboard?.writeText) {
          await windowTarget.navigator.clipboard.writeText(text);
        }
        return;
      }
    }

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
    applyDisplaySettingsControls(current, byId);
    return current;
  }).catch(error => {
    const detail = error instanceof Error ? error.message : String(error);
    setBridgeUnavailableState(documentTarget, detail);
    paintRuntimeFailureCanvas(documentTarget, "Operator workbench failed during startup.", detail);
    return null;
  });

  windowTarget?.addEventListener?.("resize", () => {
    void refresh();
  });

  return {
    refresh,
    runCommand,
    dispatch,
    started
  };
}
