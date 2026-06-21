// Legacy adapter grammar for the current operator workbench presentation model.
// Canonical operator truth is ontology-first and must not be inferred from these
// screen/viewport/surface forms directly.
import { canonicalOperatorWorkbenchRvmForms } from "./canonical-layout-rvm.js";

const VALID_THEME_MODES = new Set(["ansi16"]);
const VALID_RIGHT_SHAPES = new Set(["detail", "list-detail", "table-detail"]);
const VALID_LEFT_SHAPES = new Set(["list", "table", "tree"]);
const VALID_SHAPES = new Set([...VALID_RIGHT_SHAPES, ...VALID_LEFT_SHAPES]);
const VALID_DATASET_PROVIDERS = new Set(["inspect", "references", "source", "provenance"]);
const VALID_SHORTCUTS = new Set(["F2", "F3", "F4", "F5", "F6", "F7", "F8"]);
const VALID_PRIMARY_ACTIONS = new Set(["open-link", "source-open", "provenance-open", "inspect-record", "none"]);
const VALID_SECTION_KINDS = new Set(["detail", "list", "table", "kv"]);
const VALID_SCREEN_PANES = new Set(["right", "left"]);
const VALID_VIEWPORT_SPLIT_ORIENTATIONS = new Set(["horizontal", "vertical"]);
const VALID_VIEWPORT_BINDING_VERBS = new Set(["overlay", "action"]);
const VALID_LAYOUT_PANEL_CONTENT_KINDS = new Set(["left-screen", "screen"]);
const VALID_OVERLAY_KINDS = new Set(["menu", "doc_view"]);
const VALID_HANDLE_KINDS = new Set(["splitter"]);
const VALID_HANDLE_AXES = new Set(["horizontal", "vertical"]);
const VALID_SURFACE_KINDS = new Set(["status_bar", "command_bar"]);
const VALID_SURFACE_SCROLL_AXES = new Set(["x", "y"]);
const VALID_ACTION_KINDS = new Set(["builtin", "sequence"]);
const VALID_BUILTIN_ACTIONS = new Set([
  "toggle-help",
  "open-overlay",
  "toggle-overlay",
  "set-right-screen",
  "set-focused-pane",
  "activate-primary",
  "rename",
  "edit",
  "change-color",
  "clone",
  "emit-info"
]);

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanValue(value) {
  return String(value ?? "").trim().replace(/^"|"$/g, "");
}

function parseScalarValue(value) {
  const cleaned = cleanValue(value);
  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    const inner = cleaned.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map(item => parseScalarValue(item.trim()));
  }
  if (cleaned === "true") return true;
  if (cleaned === "false") return false;
  if (/^-?\d+$/.test(cleaned)) return Number(cleaned);
  return cleaned;
}

function readSimpleValue(bodyLines, key) {
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const match = trimmed.match(new RegExp(`^${escapeRegExp(key)}\\s+(.+)$`));
    if (match && !trimmed.endsWith("{")) return parseScalarValue(match[1]);
  }
  return null;
}

function readRepeatedSimpleValues(bodyLines, key) {
  const values = [];
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const match = trimmed.match(new RegExp(`^${escapeRegExp(key)}\\s+(.+)$`));
    if (match && !trimmed.endsWith("{")) values.push(parseScalarValue(match[1]));
  }
  return values;
}

function normalizeShortcut(value) {
  const shortcut = typeof value === "string" ? value.trim().toUpperCase() : "";
  return VALID_SHORTCUTS.has(shortcut) ? shortcut : null;
}

function normalizePrimaryAction(value) {
  const action = typeof value === "string" ? value.trim().toLowerCase() : "";
  return VALID_PRIMARY_ACTIONS.has(action) ? action : null;
}

function isIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(String(value ?? "").trim());
}

function formName(form) {
  return form?.name ?? form?.payload?.name ?? null;
}

function formBodyLines(form) {
  if (Array.isArray(form?.bodyLines)) return form.bodyLines;
  if (Array.isArray(form?.payload?.bodyLines)) return form.payload.bodyLines;
  return [];
}

function pluginParsedData(form) {
  if (form?.pluginData && typeof form.pluginData === "object") return form.pluginData;
  if (form?.payload?.pluginData && typeof form.payload.pluginData === "object") return form.payload.pluginData;
  return null;
}

function parseOperatorDataset(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    provider: readSimpleValue(bodyLines, "provider"),
    rowFilterKind: readSimpleValue(bodyLines, "row_filter_kind"),
    rowFilterAction: readSimpleValue(bodyLines, "row_filter_action"),
    columns: readRepeatedSimpleValues(bodyLines, "column").map(value => String(value)),
    emptyMessage: readSimpleValue(bodyLines, "empty_message"),
    primaryAction: readSimpleValue(bodyLines, "primary_action")
  };
}

function parseOperatorTheme(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    mode: readSimpleValue(bodyLines, "mode") ?? "ansi16",
    palette: readSimpleValue(bodyLines, "palette") ?? "terminal-dark"
  };
}

function parseOperatorAction(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    kind: readSimpleValue(bodyLines, "kind"),
    builtin: readSimpleValue(bodyLines, "builtin"),
    overlay: readSimpleValue(bodyLines, "overlay"),
    screen: readSimpleValue(bodyLines, "screen"),
    pane: readSimpleValue(bodyLines, "pane"),
    message: readSimpleValue(bodyLines, "message"),
    steps: readRepeatedSimpleValues(bodyLines, "step").map(value => String(value))
  };
}

function parseOperatorMenu(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    items: readRepeatedSimpleValues(bodyLines, "item").map(value => String(value))
  };
}

function parseOperatorScreen(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  const pane = readSimpleValue(bodyLines, "pane") ?? "right";
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    subtitle: readSimpleValue(bodyLines, "subtitle"),
    pane,
    shape: readSimpleValue(bodyLines, "shape") ?? (pane === "left" ? "list" : "list-detail"),
    dataset: readSimpleValue(bodyLines, "dataset"),
    dataSource: readSimpleValue(bodyLines, "data_source"),
    leftScreen: readSimpleValue(bodyLines, "left_screen"),
    helpText: readSimpleValue(bodyLines, "help"),
    emptyMessage: readSimpleValue(bodyLines, "empty_message"),
    rowFilterKind: readSimpleValue(bodyLines, "row_filter_kind"),
    rowFilterAction: readSimpleValue(bodyLines, "row_filter_action"),
    shortcut: readSimpleValue(bodyLines, "shortcut"),
    priority: readSimpleValue(bodyLines, "priority"),
    defaultSection: readSimpleValue(bodyLines, "default_section"),
    sections: readRepeatedSimpleValues(bodyLines, "section").map(value => String(value))
  };
}

function parseOperatorScreenSection(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    screen: readSimpleValue(bodyLines, "screen"),
    title: readSimpleValue(bodyLines, "title"),
    kind: readSimpleValue(bodyLines, "kind") ?? "detail",
    dataset: readSimpleValue(bodyLines, "dataset"),
    dataSource: readSimpleValue(bodyLines, "data_source"),
    columns: readRepeatedSimpleValues(bodyLines, "column").map(value => String(value)),
    emptyMessage: readSimpleValue(bodyLines, "empty_message"),
    collapsible: readSimpleValue(bodyLines, "collapsible"),
    collapsed: readSimpleValue(bodyLines, "collapsed"),
    rowFilterKind: readSimpleValue(bodyLines, "row_filter_kind"),
    rowFilterAction: readSimpleValue(bodyLines, "row_filter_action"),
    priority: readSimpleValue(bodyLines, "priority")
  };
}

function parseOperatorSetup(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  const shortcuts = [];
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const shortcutMatch = trimmed.match(/^shortcut\s+(F[2-8])\s+([A-Za-z_][A-Za-z0-9_.:-]*)$/i);
    if (shortcutMatch) {
      shortcuts.push({
        shortcut: shortcutMatch[1].toUpperCase(),
        screenId: shortcutMatch[2]
      });
    }
  }
  return {
    id: formName(form),
    screens: readRepeatedSimpleValues(bodyLines, "screen").map(value => String(value)),
    shortcuts,
    defaultScreen: readSimpleValue(bodyLines, "default_screen"),
    defaultLeftScreen: readSimpleValue(bodyLines, "default_left_screen"),
    defaultViewport: readSimpleValue(bodyLines, "default_viewport")
  };
}

function parseOperatorOverlay(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    kind: readSimpleValue(bodyLines, "kind") ?? "doc_view",
    menu: readSimpleValue(bodyLines, "menu"),
    width: readSimpleValue(bodyLines, "width"),
    height: readSimpleValue(bodyLines, "height"),
    resizable: readSimpleValue(bodyLines, "resizable"),
    closeIdsOnOpen: readRepeatedSimpleValues(bodyLines, "close_on_open").map(value => String(value)),
    scroll: readRepeatedSimpleValues(bodyLines, "scroll").map(value => String(value))
  };
}

function parseOperatorHandle(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    kind: readSimpleValue(bodyLines, "kind") ?? "splitter",
    axis: readSimpleValue(bodyLines, "axis"),
    size: readSimpleValue(bodyLines, "size"),
    draggable: readSimpleValue(bodyLines, "draggable")
  };
}

function parseOperatorSurface(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    kind: readSimpleValue(bodyLines, "kind"),
    width: readSimpleValue(bodyLines, "width"),
    height: readSimpleValue(bodyLines, "height"),
    resizable: readSimpleValue(bodyLines, "resizable"),
    maxPrimaryChars: readSimpleValue(bodyLines, "max_primary_chars"),
    scroll: readRepeatedSimpleValues(bodyLines, "scroll").map(value => String(value))
  };
}

function parseOperatorViewport(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  const overlays = [];
  const bindings = [];
  for (const line of bodyLines) {
    const trimmed = line.trim();
    let match = trimmed.match(/^overlay\s+([A-Za-z_][A-Za-z0-9_.:-]*)$/i);
    if (match) {
      overlays.push(match[1]);
      continue;
    }
    match = trimmed.match(/^binding\s+([^\s]+)\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+([A-Za-z_][A-Za-z0-9_.:-]*)$/i);
    if (match) {
      bindings.push({
        trigger: match[1],
        verb: match[2],
        target: match[3]
      });
    }
  }
  const size = readSimpleValue(bodyLines, "size");
  const split = readSimpleValue(bodyLines, "split");
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    theme: readSimpleValue(bodyLines, "theme"),
    screen: readSimpleValue(bodyLines, "screen"),
    leftScreen: readSimpleValue(bodyLines, "left_screen"),
    topSurface: readSimpleValue(bodyLines, "top_surface"),
    bottomSurface: readSimpleValue(bodyLines, "bottom_surface"),
    topHandle: readSimpleValue(bodyLines, "top_handle"),
    bottomHandle: readSimpleValue(bodyLines, "bottom_handle"),
    splitHandle: readSimpleValue(bodyLines, "split_handle"),
    width: (Array.isArray(size) ? Number(size[0] ?? 0) || null : null) ?? readSimpleValue(bodyLines, "width"),
    height: (Array.isArray(size) ? Number(size[1] ?? 0) || null : null) ?? readSimpleValue(bodyLines, "height"),
    top: readSimpleValue(bodyLines, "top"),
    bottom: readSimpleValue(bodyLines, "bottom"),
    splitOrientation: (Array.isArray(split) ? String(split[0] ?? "") : null) ?? readSimpleValue(bodyLines, "split_orientation"),
    leftWeight: (Array.isArray(split) ? Number(split[1] ?? 0) || null : null) ?? readSimpleValue(bodyLines, "left_weight"),
    rightWeight: (Array.isArray(split) ? Number(split[2] ?? 0) || null : null) ?? readSimpleValue(bodyLines, "right_weight"),
    overlays,
    bindings
  };
}

function parseOperatorLayoutSplitRows(bodyLines) {
  const rows = [];
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^split\s+([^\s]+)\s+(horizontal|vertical)\s+(\d+)\s+([^\s]+)\s+([^\s]+)$/u);
    if (!match) continue;
    rows.push({
      id: match[1],
      axis: match[2],
      weight: Number(match[3]),
      first: match[4],
      second: match[5]
    });
  }
  return rows;
}

function parseOperatorLayoutPanelRows(bodyLines) {
  const rows = [];
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^panel\s+([^\s]+)\s+(left-screen|screen)\s+([^\s]+)(?:\s+"([^"]*)")?$/u);
    if (!match) continue;
    rows.push({
      id: match[1],
      contentKind: match[2],
      targetId: match[3],
      title: match[4] ?? null
    });
  }
  return rows;
}

function parseOperatorLayout(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    viewport: readSimpleValue(bodyLines, "viewport"),
    focusedPanel: readSimpleValue(bodyLines, "focused_panel"),
    root: readSimpleValue(bodyLines, "root"),
    savedAt: readSimpleValue(bodyLines, "saved_at"),
    splits: parseOperatorLayoutSplitRows(bodyLines),
    panels: parseOperatorLayoutPanelRows(bodyLines)
  };
}

function parseOperatorKeymapBindings(bodyLines) {
  const bindings = [];
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^binding\s+([^\s]+)\s+(action)\s+([^\s]+)$/u);
    if (!match) continue;
    bindings.push({
      trigger: match[1],
      targetKind: match[2],
      target: match[3]
    });
  }
  return bindings;
}

function parseOperatorKeymapPanelRows(bodyLines, key) {
  const rows = [];
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s+([^\\s]+)\\s+([^\\s]+)$`, "u");
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const match = trimmed.match(pattern);
    if (!match) continue;
    rows.push({
      panelId: match[1],
      targetId: match[2]
    });
  }
  return rows;
}

function parseOperatorKeymap(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    savedAt: readSimpleValue(bodyLines, "saved_at"),
    bindings: parseOperatorKeymapBindings(bodyLines),
    panelPrimaryActions: parseOperatorKeymapPanelRows(bodyLines, "panel_primary"),
    panelSecondaryMenus: parseOperatorKeymapPanelRows(bodyLines, "panel_secondary")
  };
}

function validateOperatorTheme(form) {
  const payload = parseOperatorTheme(form);
  if (!VALID_THEME_MODES.has(String(payload.mode))) {
    throw new Error(`operator_theme ${formName(form)} mode must be one of ${[...VALID_THEME_MODES].join(", ")}`);
  }
  if (!cleanValue(payload.palette)) {
    throw new Error(`operator_theme ${formName(form)} palette is required`);
  }
}

function validateOperatorDataset(form) {
  const payload = parseOperatorDataset(form);
  if (!VALID_DATASET_PROVIDERS.has(String(payload.provider))) {
    throw new Error(`operator_dataset ${formName(form)} provider must be one of ${[...VALID_DATASET_PROVIDERS].join(", ")}`);
  }
  if (payload.primaryAction && !normalizePrimaryAction(payload.primaryAction) && !isIdentifier(payload.primaryAction)) {
    throw new Error(`operator_dataset ${formName(form)} primary_action must be a legacy action or action identifier`);
  }
}

function validateOperatorAction(form) {
  const payload = parseOperatorAction(form);
  if (!VALID_ACTION_KINDS.has(String(payload.kind))) {
    throw new Error(`operator_action ${formName(form)} kind must be one of ${[...VALID_ACTION_KINDS].join(", ")}`);
  }
  if (payload.kind === "builtin") {
    if (!VALID_BUILTIN_ACTIONS.has(String(payload.builtin))) {
      throw new Error(`operator_action ${formName(form)} builtin must be one of ${[...VALID_BUILTIN_ACTIONS].join(", ")}`);
    }
    if (payload.overlay && !isIdentifier(payload.overlay)) {
      throw new Error(`operator_action ${formName(form)} overlay must be an identifier`);
    }
    if (payload.screen && !isIdentifier(payload.screen)) {
      throw new Error(`operator_action ${formName(form)} screen must be an identifier`);
    }
  }
  if (payload.kind === "sequence" && !(Array.isArray(payload.steps) && payload.steps.length)) {
    throw new Error(`operator_action ${formName(form)} kind sequence requires step rows`);
  }
}

function validateOperatorMenu(form) {
  const payload = parseOperatorMenu(form);
  if (!(Array.isArray(payload.items) && payload.items.length)) {
    throw new Error(`operator_menu ${formName(form)} requires item rows`);
  }
  for (const itemId of payload.items) {
    if (!isIdentifier(itemId)) {
      throw new Error(`operator_menu ${formName(form)} item must be an identifier`);
    }
  }
}

function validateOperatorScreen(form) {
  const payload = parseOperatorScreen(form);
  if (!VALID_SCREEN_PANES.has(String(payload.pane))) {
    throw new Error(`operator_screen ${formName(form)} pane must be one of ${[...VALID_SCREEN_PANES].join(", ")}`);
  }
  if (!VALID_SHAPES.has(String(payload.shape))) {
    throw new Error(`operator_screen ${formName(form)} shape must be one of ${[...VALID_SHAPES].join(", ")}`);
  }
  if (payload.pane === "left") {
    if (!VALID_LEFT_SHAPES.has(String(payload.shape))) {
      throw new Error(`operator_screen ${formName(form)} left-pane shape must be one of ${[...VALID_LEFT_SHAPES].join(", ")}`);
    }
    if (payload.shape === "tree") {
      if (payload.dataset || payload.dataSource) {
        throw new Error(`operator_screen ${formName(form)} pane left tree cannot declare dataset or data_source`);
      }
    } else if (!payload.dataset && !VALID_DATASET_PROVIDERS.has(String(payload.dataSource))) {
      throw new Error(`operator_screen ${formName(form)} must declare dataset or data_source (${[...VALID_DATASET_PROVIDERS].join(", ")})`);
    }
    if (payload.shortcut) {
      throw new Error(`operator_screen ${formName(form)} pane left cannot declare shortcut`);
    }
    if ((payload.sections ?? []).length || payload.defaultSection) {
      throw new Error(`operator_screen ${formName(form)} pane left cannot declare sections`);
    }
    if (payload.leftScreen) {
      throw new Error(`operator_screen ${formName(form)} pane left cannot declare left_screen`);
    }
    return;
  }
  if (!VALID_RIGHT_SHAPES.has(String(payload.shape))) {
    throw new Error(`operator_screen ${formName(form)} right-pane shape must be one of ${[...VALID_RIGHT_SHAPES].join(", ")}`);
  }
  if (!payload.dataset && !VALID_DATASET_PROVIDERS.has(String(payload.dataSource)) && !(payload.sections ?? []).length) {
    throw new Error(`operator_screen ${formName(form)} must declare dataset or data_source (${[...VALID_DATASET_PROVIDERS].join(", ")})`);
  }
  if (payload.shortcut && !normalizeShortcut(payload.shortcut)) {
    throw new Error(`operator_screen ${formName(form)} shortcut must be one of ${[...VALID_SHORTCUTS].join(", ")}`);
  }
  if (payload.defaultSection && !(Array.isArray(payload.sections) && payload.sections.length)) {
    throw new Error(`operator_screen ${formName(form)} default_section requires declared sections`);
  }
  if (payload.defaultSection && !(payload.sections ?? []).includes(payload.defaultSection)) {
    throw new Error(`operator_screen ${formName(form)} default_section must match a declared section`);
  }
}

function validateOperatorScreenSection(form) {
  const payload = parseOperatorScreenSection(form);
  if (!payload.screen) {
    throw new Error(`operator_screen_section ${formName(form)} must declare screen`);
  }
  if (!VALID_SECTION_KINDS.has(String(payload.kind))) {
    throw new Error(`operator_screen_section ${formName(form)} kind must be one of ${[...VALID_SECTION_KINDS].join(", ")}`);
  }
  if (!payload.dataset && !VALID_DATASET_PROVIDERS.has(String(payload.dataSource))) {
    throw new Error(`operator_screen_section ${formName(form)} must declare dataset or data_source (${[...VALID_DATASET_PROVIDERS].join(", ")})`);
  }
  if (payload.collapsible !== null && payload.collapsible !== undefined && typeof payload.collapsible !== "boolean") {
    throw new Error(`operator_screen_section ${formName(form)} collapsible must be true or false`);
  }
  if (payload.collapsed !== null && payload.collapsed !== undefined && typeof payload.collapsed !== "boolean") {
    throw new Error(`operator_screen_section ${formName(form)} collapsed must be true or false`);
  }
}

function validateOperatorSetup(form) {
  const payload = parseOperatorSetup(form);
  for (const row of payload.shortcuts) {
    if (!normalizeShortcut(row.shortcut)) {
      throw new Error(`operator_setup ${formName(form)} shortcut must be one of ${[...VALID_SHORTCUTS].join(", ")}`);
    }
  }
}

function validateOperatorOverlay(form) {
  const payload = parseOperatorOverlay(form);
  if (!VALID_OVERLAY_KINDS.has(String(payload.kind))) {
    throw new Error(`operator_overlay ${formName(form)} kind must be one of ${[...VALID_OVERLAY_KINDS].join(", ")}`);
  }
  if (payload.menu && !isIdentifier(payload.menu)) {
    throw new Error(`operator_overlay ${formName(form)} menu must be an identifier`);
  }
  if (payload.width !== null && payload.width !== undefined && (!Number.isInteger(payload.width) || payload.width <= 0)) {
    throw new Error(`operator_overlay ${formName(form)} width must be a positive integer`);
  }
  if (payload.height !== null && payload.height !== undefined && (!Number.isInteger(payload.height) || payload.height <= 0)) {
    throw new Error(`operator_overlay ${formName(form)} height must be a positive integer`);
  }
  if (payload.resizable !== null && payload.resizable !== undefined && typeof payload.resizable !== "boolean") {
    throw new Error(`operator_overlay ${formName(form)} resizable must be true or false`);
  }
  for (const overlayId of payload.closeIdsOnOpen ?? []) {
    if (!String(overlayId ?? "").trim()) {
      throw new Error(`operator_overlay ${formName(form)} close_on_open entries must be non-empty`);
    }
  }
}

function validateOperatorHandle(form) {
  const payload = parseOperatorHandle(form);
  if (!VALID_HANDLE_KINDS.has(String(payload.kind))) {
    throw new Error(`operator_handle ${formName(form)} kind must be one of ${[...VALID_HANDLE_KINDS].join(", ")}`);
  }
  if (!VALID_HANDLE_AXES.has(String(payload.axis))) {
    throw new Error(`operator_handle ${formName(form)} axis must be one of ${[...VALID_HANDLE_AXES].join(", ")}`);
  }
  if (payload.size !== null && payload.size !== undefined && (!Number.isInteger(payload.size) || payload.size <= 0)) {
    throw new Error(`operator_handle ${formName(form)} size must be a positive integer`);
  }
  if (payload.draggable !== null && payload.draggable !== undefined && typeof payload.draggable !== "boolean") {
    throw new Error(`operator_handle ${formName(form)} draggable must be true or false`);
  }
}

function validateOperatorSurface(form) {
  const payload = parseOperatorSurface(form);
  if (!VALID_SURFACE_KINDS.has(String(payload.kind))) {
    throw new Error(`operator_surface ${formName(form)} kind must be one of ${[...VALID_SURFACE_KINDS].join(", ")}`);
  }
  if (payload.width !== null && payload.width !== undefined && (!Number.isInteger(payload.width) || payload.width <= 0)) {
    throw new Error(`operator_surface ${formName(form)} width must be a positive integer`);
  }
  if (payload.height !== null && payload.height !== undefined && (!Number.isInteger(payload.height) || payload.height <= 0)) {
    throw new Error(`operator_surface ${formName(form)} height must be a positive integer`);
  }
  if (payload.resizable !== null && payload.resizable !== undefined && typeof payload.resizable !== "boolean") {
    throw new Error(`operator_surface ${formName(form)} resizable must be true or false`);
  }
  if (payload.maxPrimaryChars !== null && payload.maxPrimaryChars !== undefined && (!Number.isInteger(payload.maxPrimaryChars) || payload.maxPrimaryChars <= 0)) {
    throw new Error(`operator_surface ${formName(form)} max_primary_chars must be a positive integer`);
  }
  for (const axis of payload.scroll ?? []) {
    if (!VALID_SURFACE_SCROLL_AXES.has(String(axis))) {
      throw new Error(`operator_surface ${formName(form)} scroll axes must be one of ${[...VALID_SURFACE_SCROLL_AXES].join(", ")}`);
    }
  }
}

function validateOperatorViewport(form) {
  const payload = parseOperatorViewport(form);
  if (payload.width !== null && (!Number.isInteger(payload.width) || payload.width <= 0)) {
    throw new Error(`operator_viewport ${formName(form)} size width must be a positive integer`);
  }
  if (payload.height !== null && (!Number.isInteger(payload.height) || payload.height <= 0)) {
    throw new Error(`operator_viewport ${formName(form)} size height must be a positive integer`);
  }
  if (payload.top !== null && payload.top !== undefined && (!Number.isInteger(payload.top) || payload.top <= 0)) {
    throw new Error(`operator_viewport ${formName(form)} top must be a positive integer`);
  }
  if (payload.bottom !== null && payload.bottom !== undefined && (!Number.isInteger(payload.bottom) || payload.bottom <= 0)) {
    throw new Error(`operator_viewport ${formName(form)} bottom must be a positive integer`);
  }
  if (payload.splitOrientation && !VALID_VIEWPORT_SPLIT_ORIENTATIONS.has(payload.splitOrientation)) {
    throw new Error(`operator_viewport ${formName(form)} split orientation must be one of ${[...VALID_VIEWPORT_SPLIT_ORIENTATIONS].join(", ")}`);
  }
  if (payload.leftWeight !== null && (!Number.isInteger(payload.leftWeight) || payload.leftWeight <= 0)) {
    throw new Error(`operator_viewport ${formName(form)} left split weight must be a positive integer`);
  }
  if (payload.rightWeight !== null && (!Number.isInteger(payload.rightWeight) || payload.rightWeight <= 0)) {
    throw new Error(`operator_viewport ${formName(form)} right split weight must be a positive integer`);
  }
  const seenOverlays = new Set();
  for (const overlayId of payload.overlays ?? []) {
    const normalized = String(overlayId ?? "").trim();
    if (!normalized) continue;
    if (seenOverlays.has(normalized)) {
      throw new Error(`operator_viewport ${formName(form)} duplicate overlay reference: ${normalized}`);
    }
    seenOverlays.add(normalized);
  }
  const seenTriggers = new Set();
  for (const binding of payload.bindings) {
    if (!binding.trigger?.trim()) {
      throw new Error(`operator_viewport ${formName(form)} binding trigger is required`);
    }
    if (!VALID_VIEWPORT_BINDING_VERBS.has(String(binding.verb))) {
      throw new Error(`operator_viewport ${formName(form)} binding verb must be one of ${[...VALID_VIEWPORT_BINDING_VERBS].join(", ")}`);
    }
    if (!binding.target?.trim()) {
      throw new Error(`operator_viewport ${formName(form)} binding target is required`);
    }
    const trigger = String(binding.trigger).trim();
    if (seenTriggers.has(trigger)) {
      throw new Error(`operator_viewport ${formName(form)} duplicate binding trigger: ${trigger}`);
    }
    seenTriggers.add(trigger);
  }
}

function validateOperatorLayout(form) {
  const payload = parseOperatorLayout(form);
  if (!cleanValue(payload.root)) {
    throw new Error(`operator_layout ${formName(form)} must declare root`);
  }
  if (!(Array.isArray(payload.panels) && payload.panels.length)) {
    throw new Error(`operator_layout ${formName(form)} requires panel rows`);
  }
  const panelIds = new Set();
  for (const panel of payload.panels) {
    if (!panel.id?.trim()) throw new Error(`operator_layout ${formName(form)} panel id is required`);
    if (panelIds.has(panel.id)) throw new Error(`operator_layout ${formName(form)} duplicate panel id: ${panel.id}`);
    panelIds.add(panel.id);
    if (!VALID_LAYOUT_PANEL_CONTENT_KINDS.has(String(panel.contentKind))) {
      throw new Error(`operator_layout ${formName(form)} panel ${panel.id} content kind must be one of ${[...VALID_LAYOUT_PANEL_CONTENT_KINDS].join(", ")}`);
    }
    if (!panel.targetId?.trim()) {
      throw new Error(`operator_layout ${formName(form)} panel ${panel.id} target is required`);
    }
  }
  const splitIds = new Set();
  for (const split of payload.splits) {
    if (!split.id?.trim()) throw new Error(`operator_layout ${formName(form)} split id is required`);
    if (splitIds.has(split.id)) throw new Error(`operator_layout ${formName(form)} duplicate split id: ${split.id}`);
    splitIds.add(split.id);
    if (!VALID_VIEWPORT_SPLIT_ORIENTATIONS.has(String(split.axis))) {
      throw new Error(`operator_layout ${formName(form)} split ${split.id} axis must be one of ${[...VALID_VIEWPORT_SPLIT_ORIENTATIONS].join(", ")}`);
    }
    if (!Number.isInteger(split.weight) || split.weight <= 0) {
      throw new Error(`operator_layout ${formName(form)} split ${split.id} weight must be a positive integer`);
    }
    if (!split.first?.trim() || !split.second?.trim()) {
      throw new Error(`operator_layout ${formName(form)} split ${split.id} must declare first and second`);
    }
  }
  const splitMap = new Map(payload.splits.map(split => [split.id, split]));
  const resolveNode = (nodeId, stack = new Set()) => {
    if (panelIds.has(nodeId)) return;
    const split = splitMap.get(nodeId);
    if (!split) throw new Error(`operator_layout ${formName(form)} root reference not found: ${nodeId}`);
    if (stack.has(nodeId)) throw new Error(`operator_layout ${formName(form)} split cycle detected: ${nodeId}`);
    const nextStack = new Set(stack);
    nextStack.add(nodeId);
    resolveNode(split.first, nextStack);
    resolveNode(split.second, nextStack);
  };
  resolveNode(payload.root);
}

function validateOperatorKeymap(form) {
  const payload = parseOperatorKeymap(form);
  const seenTriggers = new Set();
  for (const binding of payload.bindings) {
    if (!binding.trigger?.trim()) throw new Error(`operator_keymap ${formName(form)} binding trigger is required`);
    if (!binding.target?.trim()) throw new Error(`operator_keymap ${formName(form)} binding target is required`);
    if (seenTriggers.has(binding.trigger)) {
      throw new Error(`operator_keymap ${formName(form)} duplicate binding trigger: ${binding.trigger}`);
    }
    seenTriggers.add(binding.trigger);
  }
}

function serializeOperatorTheme(payload) {
  const lines = [`operator_theme ${payload.id} {`];
  if (payload.title) lines.push(`  title "${payload.title}"`);
  if (payload.mode) lines.push(`  mode ${payload.mode}`);
  if (payload.palette) lines.push(`  palette ${payload.palette}`);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorAction(payload) {
  const lines = [`operator_action ${payload.id} {`];
  if (payload.title) lines.push(`  title "${payload.title}"`);
  if (payload.kind) lines.push(`  kind ${payload.kind}`);
  if (payload.builtin) lines.push(`  builtin ${payload.builtin}`);
  if (payload.overlay) lines.push(`  overlay ${payload.overlay}`);
  if (payload.screen) lines.push(`  screen ${payload.screen}`);
  if (payload.pane) lines.push(`  pane ${payload.pane}`);
  if (payload.message) lines.push(`  message "${payload.message}"`);
  for (const stepId of payload.steps ?? []) lines.push(`  step ${stepId}`);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorMenu(payload) {
  const lines = [`operator_menu ${payload.id} {`];
  if (payload.title) lines.push(`  title "${payload.title}"`);
  for (const itemId of payload.items ?? []) lines.push(`  item ${itemId}`);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorDataset(payload) {
  const lines = [
    `operator_dataset ${payload.id} {`,
    `  provider ${payload.provider ?? "references"}`
  ];
  if (payload.title) lines.push(`  title "${payload.title}"`);
  if (payload.rowFilterKind) lines.push(`  row_filter_kind ${payload.rowFilterKind}`);
  if (payload.rowFilterAction) lines.push(`  row_filter_action ${payload.rowFilterAction}`);
  for (const column of payload.columns ?? []) lines.push(`  column ${column}`);
  if (payload.emptyMessage) lines.push(`  empty_message "${payload.emptyMessage}"`);
  if (payload.primaryAction) lines.push(`  primary_action ${payload.primaryAction}`);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorScreen(payload) {
  const lines = [
    `operator_screen ${payload.id} {`,
    `  pane ${payload.pane ?? "right"}`,
    `  shape ${payload.shape ?? "list-detail"}`
  ];
  if (payload.shape !== "tree") {
    if (payload.dataset) lines.push(`  dataset ${payload.dataset}`);
    else lines.push(`  data_source ${payload.dataSource ?? "references"}`);
  }
  if (payload.title) lines.push(`  title "${payload.title}"`);
  if (payload.subtitle) lines.push(`  subtitle "${payload.subtitle}"`);
  if (payload.leftScreen) lines.push(`  left_screen ${payload.leftScreen}`);
  if (payload.helpText) lines.push(`  help "${payload.helpText}"`);
  if (payload.emptyMessage) lines.push(`  empty_message "${payload.emptyMessage}"`);
  if (payload.rowFilterKind) lines.push(`  row_filter_kind ${payload.rowFilterKind}`);
  if (payload.rowFilterAction) lines.push(`  row_filter_action ${payload.rowFilterAction}`);
  if (payload.shortcut) lines.push(`  shortcut ${payload.shortcut}`);
  if (payload.priority !== undefined && payload.priority !== null) lines.push(`  priority ${payload.priority}`);
  if (payload.defaultSection) lines.push(`  default_section ${payload.defaultSection}`);
  for (const sectionId of payload.sections ?? []) lines.push(`  section ${sectionId}`);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorScreenSection(payload) {
  const lines = [
    `operator_screen_section ${payload.id} {`,
    `  screen ${payload.screen}`
  ];
  lines.push(`  kind ${payload.kind ?? "detail"}`);
  if (payload.dataset) lines.push(`  dataset ${payload.dataset}`);
  else lines.push(`  data_source ${payload.dataSource ?? "inspect"}`);
  if (payload.title) lines.push(`  title "${payload.title}"`);
  for (const column of payload.columns ?? []) lines.push(`  column ${column}`);
  if (payload.emptyMessage) lines.push(`  empty_message "${payload.emptyMessage}"`);
  if (payload.collapsible !== undefined && payload.collapsible !== null) lines.push(`  collapsible ${payload.collapsible ? "true" : "false"}`);
  if (payload.collapsed !== undefined && payload.collapsed !== null) lines.push(`  collapsed ${payload.collapsed ? "true" : "false"}`);
  if (payload.rowFilterKind) lines.push(`  row_filter_kind ${payload.rowFilterKind}`);
  if (payload.rowFilterAction) lines.push(`  row_filter_action ${payload.rowFilterAction}`);
  if (payload.priority !== undefined && payload.priority !== null) lines.push(`  priority ${payload.priority}`);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorSetup(payload) {
  const lines = [`operator_setup ${payload.id} {`];
  for (const screenId of payload.screens ?? []) lines.push(`  screen ${screenId}`);
  for (const row of payload.shortcuts ?? []) lines.push(`  shortcut ${row.shortcut} ${row.screenId}`);
  if (payload.defaultScreen) lines.push(`  default_screen ${payload.defaultScreen}`);
  if (payload.defaultLeftScreen) lines.push(`  default_left_screen ${payload.defaultLeftScreen}`);
  if (payload.defaultViewport) lines.push(`  default_viewport ${payload.defaultViewport}`);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorOverlay(payload) {
  const lines = [`operator_overlay ${payload.id} {`];
  lines.push(`  kind ${payload.kind ?? "doc_view"}`);
  if (payload.title) lines.push(`  title "${payload.title}"`);
  if (payload.menu) lines.push(`  menu ${payload.menu}`);
  if (payload.width !== undefined && payload.width !== null) lines.push(`  width ${payload.width}`);
  if (payload.height !== undefined && payload.height !== null) lines.push(`  height ${payload.height}`);
  if (payload.resizable !== undefined && payload.resizable !== null) lines.push(`  resizable ${payload.resizable ? "true" : "false"}`);
  for (const overlayId of payload.closeIdsOnOpen ?? []) lines.push(`  close_on_open ${overlayId}`);
  for (const axis of payload.scroll ?? []) lines.push(`  scroll ${axis}`);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorHandle(payload) {
  const lines = [`operator_handle ${payload.id} {`];
  lines.push(`  kind ${payload.kind ?? "splitter"}`);
  if (payload.axis) lines.push(`  axis ${payload.axis}`);
  if (payload.title) lines.push(`  title "${payload.title}"`);
  if (payload.size !== undefined && payload.size !== null) lines.push(`  size ${payload.size}`);
  if (payload.draggable !== undefined && payload.draggable !== null) lines.push(`  draggable ${payload.draggable ? "true" : "false"}`);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorSurface(payload) {
  const lines = [`operator_surface ${payload.id} {`];
  lines.push(`  kind ${payload.kind ?? "status_bar"}`);
  if (payload.title) lines.push(`  title "${payload.title}"`);
  if (payload.width !== undefined && payload.width !== null) lines.push(`  width ${payload.width}`);
  if (payload.height !== undefined && payload.height !== null) lines.push(`  height ${payload.height}`);
  if (payload.resizable !== undefined && payload.resizable !== null) lines.push(`  resizable ${payload.resizable ? "true" : "false"}`);
  if (payload.maxPrimaryChars !== undefined && payload.maxPrimaryChars !== null) lines.push(`  max_primary_chars ${payload.maxPrimaryChars}`);
  for (const axis of payload.scroll ?? []) lines.push(`  scroll ${axis}`);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorViewport(payload) {
  const lines = [`operator_viewport ${payload.id} {`];
  if (payload.title) lines.push(`  title "${payload.title}"`);
  if (payload.theme) lines.push(`  theme ${payload.theme}`);
  if (payload.screen) lines.push(`  screen ${payload.screen}`);
  if (payload.leftScreen) lines.push(`  left_screen ${payload.leftScreen}`);
  if (payload.topSurface) lines.push(`  top_surface ${payload.topSurface}`);
  if (payload.bottomSurface) lines.push(`  bottom_surface ${payload.bottomSurface}`);
  if (payload.topHandle) lines.push(`  top_handle ${payload.topHandle}`);
  if (payload.bottomHandle) lines.push(`  bottom_handle ${payload.bottomHandle}`);
  if (payload.splitHandle) lines.push(`  split_handle ${payload.splitHandle}`);
  if (payload.width && payload.height) lines.push(`  size [${payload.width}, ${payload.height}]`);
  if (payload.top !== undefined && payload.top !== null) lines.push(`  top ${payload.top}`);
  if (payload.bottom !== undefined && payload.bottom !== null) lines.push(`  bottom ${payload.bottom}`);
  if (payload.splitOrientation && payload.leftWeight && payload.rightWeight) {
    lines.push(`  split [${payload.splitOrientation}, ${payload.leftWeight}, ${payload.rightWeight}]`);
  }
  for (const overlay of payload.overlays ?? []) lines.push(`  overlay ${overlay}`);
  for (const binding of payload.bindings ?? []) lines.push(`  binding ${binding.trigger} ${binding.verb} ${binding.target}`);
  lines.push("}");
  return lines.join("\n");
}

function serializeLayoutSplitRows(root, prefix) {
  const rows = [];
  function visit(node, path = []) {
    if (!node || typeof node !== "object") return null;
    if (node.kind === "panel") return node.panelId ?? null;
    const splitId = `${prefix}${path.length ? `.${path.join(".")}` : ""}`;
    const first = visit(node.first, [...path, "first"]);
    const second = visit(node.second, [...path, "second"]);
    rows.push({
      id: splitId,
      axis: node.axis ?? "vertical",
      weight: Number(node.weight ?? 50) || 50,
      first,
      second
    });
    return splitId;
  }
  const rootId = visit(root, ["root"]);
  return {
    rootId,
    rows
  };
}

function serializeOperatorLayout(payload) {
  const lines = [`operator_layout ${payload.id} {`];
  if (payload.title) lines.push(`  title "${payload.title}"`);
  if (payload.viewportId) lines.push(`  viewport ${payload.viewportId}`);
  if (payload.focusedPanelId) lines.push(`  focused_panel ${payload.focusedPanelId}`);
  if (payload.savedAt) lines.push(`  saved_at "${payload.savedAt}"`);
  const splitRows = serializeLayoutSplitRows(payload.root, payload.id);
  if (splitRows.rootId) lines.push(`  root ${splitRows.rootId}`);
  for (const split of splitRows.rows) {
    lines.push(`  split ${split.id} ${split.axis} ${split.weight} ${split.first} ${split.second}`);
  }
  const orderedPanelIds = [...new Set([
    ...collectLayoutPanelIdsForSerialization(payload.root),
    ...Object.keys(payload.panels ?? {}).sort((left, right) => left.localeCompare(right))
  ])];
  for (const panelId of orderedPanelIds) {
    const panel = payload.panels?.[panelId] ?? null;
    if (!panel) continue;
    const targetId = panel.contentKind === "left-screen" ? panel.leftScreenId : panel.screenId;
    if (!targetId) continue;
    const title = panel.title ? ` "${panel.title}"` : "";
    lines.push(`  panel ${panel.id} ${panel.contentKind} ${targetId}${title}`);
  }
  lines.push("}");
  return lines.join("\n");
}

function collectLayoutPanelIdsForSerialization(root, rows = []) {
  if (!root || typeof root !== "object") return rows;
  if (root.kind === "panel" && root.panelId) {
    rows.push(root.panelId);
    return rows;
  }
  if (root.kind === "split") {
    collectLayoutPanelIdsForSerialization(root.first, rows);
    collectLayoutPanelIdsForSerialization(root.second, rows);
  }
  return rows;
}

function serializeOperatorKeymap(payload) {
  const lines = [`operator_keymap ${payload.id} {`];
  if (payload.title) lines.push(`  title "${payload.title}"`);
  if (payload.savedAt) lines.push(`  saved_at "${payload.savedAt}"`);
  for (const [trigger, binding] of Object.entries(payload.bindings ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    if (!binding?.target) continue;
    lines.push(`  binding ${trigger} ${binding.targetKind ?? "action"} ${binding.target}`);
  }
  for (const [panelId, actionId] of Object.entries(payload.panelPrimaryActions ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    if (!actionId) continue;
    lines.push(`  panel_primary ${panelId} ${actionId}`);
  }
  for (const [panelId, menuId] of Object.entries(payload.panelSecondaryMenus ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    if (!menuId) continue;
    lines.push(`  panel_secondary ${panelId} ${menuId}`);
  }
  lines.push("}");
  return lines.join("\n");
}

function normalizeOperatorTheme(node, context) {
  const values = parseOperatorTheme(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_theme", {
        id: values.id,
        title: values.title ?? values.id,
        mode: values.mode ?? "ansi16",
        palette: values.palette ?? "terminal-dark"
      }, values.id, {
        pluginId: "plugin.operator-workbench"
      })
    ]
  };
}

function normalizeOperatorAction(node, context) {
  const values = parseOperatorAction(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_action", {
        id: values.id,
        title: values.title ?? values.id,
        kind: values.kind ?? null,
        builtin: values.builtin ?? null,
        overlay: values.overlay ?? null,
        screen: values.screen ?? null,
        pane: values.pane ?? null,
        message: values.message ?? null,
        steps: Array.isArray(values.steps) ? values.steps : []
      }, values.id, {
        pluginId: "plugin.operator-workbench"
      })
    ]
  };
}

function normalizeOperatorMenu(node, context) {
  const values = parseOperatorMenu(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_menu", {
        id: values.id,
        title: values.title ?? values.id,
        items: Array.isArray(values.items) ? values.items : []
      }, values.id, {
        pluginId: "plugin.operator-workbench"
      })
    ]
  };
}

function normalizeOperatorDataset(node, context) {
  const values = parseOperatorDataset(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_dataset", {
        id: values.id,
        title: values.title ?? values.id,
        provider: values.provider,
        rowFilterKind: values.rowFilterKind ?? null,
        rowFilterAction: values.rowFilterAction ?? null,
        columns: Array.isArray(values.columns) ? values.columns : [],
        emptyMessage: values.emptyMessage ?? null,
        primaryAction: normalizePrimaryAction(values.primaryAction) ?? values.primaryAction ?? null
      }, values.id, {
        pluginId: "plugin.operator-workbench"
      })
    ]
  };
}

function normalizeOperatorScreen(node, context) {
  const values = parseOperatorScreen(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_screen", {
        id: values.id,
        title: values.title ?? values.id,
        subtitle: values.subtitle ?? null,
        pane: values.pane ?? "right",
        shape: values.shape ?? "list-detail",
        dataset: values.dataset ?? null,
        dataSource: values.dataSource ?? null,
        leftScreen: values.leftScreen ?? null,
        helpText: values.helpText ?? null,
        emptyMessage: values.emptyMessage ?? null,
        rowFilterKind: values.rowFilterKind ?? null,
        rowFilterAction: values.rowFilterAction ?? null,
        shortcut: normalizeShortcut(values.shortcut),
        priority: values.priority ?? null,
        defaultSection: values.defaultSection ?? null,
        sections: Array.isArray(values.sections) ? values.sections : []
      }, values.id, {
        pluginId: "plugin.operator-workbench"
      })
    ]
  };
}

function normalizeOperatorScreenSection(node, context) {
  const values = parseOperatorScreenSection(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_screen_section", {
        id: values.id,
        screen: values.screen ?? null,
        title: values.title ?? values.id,
        kind: values.kind ?? "detail",
        dataset: values.dataset ?? null,
        dataSource: values.dataSource ?? null,
        columns: Array.isArray(values.columns) ? values.columns : [],
        emptyMessage: values.emptyMessage ?? null,
        collapsible: values.collapsible ?? null,
        collapsed: values.collapsed ?? null,
        rowFilterKind: values.rowFilterKind ?? null,
        rowFilterAction: values.rowFilterAction ?? null,
        priority: values.priority ?? null
      }, values.id, {
        pluginId: "plugin.operator-workbench"
      })
    ]
  };
}

function normalizeOperatorSetup(node, context) {
  const values = parseOperatorSetup(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_setup", {
        id: values.id,
        screens: values.screens,
        shortcuts: values.shortcuts.map(row => ({
          shortcut: normalizeShortcut(row.shortcut),
          screenId: row.screenId
        })).filter(row => row.shortcut && row.screenId),
        defaultScreen: values.defaultScreen ?? null,
        defaultLeftScreen: values.defaultLeftScreen ?? null,
        defaultViewport: values.defaultViewport ?? null
      }, values.id, {
        pluginId: "plugin.operator-workbench"
      })
    ]
  };
}

function normalizeOperatorOverlay(node, context) {
  const values = parseOperatorOverlay(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_overlay", {
        id: values.id,
        title: values.title ?? values.id,
        kind: values.kind ?? "doc_view",
        menu: values.menu ?? null,
        width: values.width ?? null,
        height: values.height ?? null,
        resizable: values.resizable ?? null,
        closeIdsOnOpen: Array.isArray(values.closeIdsOnOpen) ? values.closeIdsOnOpen : [],
        scroll: Array.isArray(values.scroll) ? values.scroll : []
      }, values.id, {
        pluginId: "plugin.operator-workbench"
      })
    ]
  };
}

function normalizeOperatorHandle(node, context) {
  const values = parseOperatorHandle(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_handle", {
        id: values.id,
        title: values.title ?? values.id,
        kind: values.kind ?? "splitter",
        axis: values.axis ?? null,
        size: values.size ?? null,
        draggable: values.draggable ?? null
      }, values.id, {
        pluginId: "plugin.operator-workbench"
      })
    ]
  };
}

function normalizeOperatorSurface(node, context) {
  const values = parseOperatorSurface(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_surface", {
        id: values.id,
        title: values.title ?? values.id,
        kind: values.kind ?? null,
        width: values.width ?? null,
        height: values.height ?? null,
        resizable: values.resizable ?? null,
        maxPrimaryChars: values.maxPrimaryChars ?? null,
        scroll: Array.isArray(values.scroll) ? values.scroll : []
      }, values.id, {
        pluginId: "plugin.operator-workbench"
      })
    ]
  };
}

function normalizeOperatorViewport(node, context) {
  const values = parseOperatorViewport(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_viewport", {
        id: values.id,
        title: values.title ?? values.id,
        theme: values.theme ?? null,
        screen: values.screen ?? null,
        leftScreen: values.leftScreen ?? null,
        topSurface: values.topSurface ?? null,
        bottomSurface: values.bottomSurface ?? null,
        topHandle: values.topHandle ?? null,
        bottomHandle: values.bottomHandle ?? null,
        splitHandle: values.splitHandle ?? null,
        width: values.width ?? null,
        height: values.height ?? null,
        top: values.top ?? null,
        bottom: values.bottom ?? null,
        splitOrientation: values.splitOrientation ?? null,
        leftWeight: values.leftWeight ?? null,
        rightWeight: values.rightWeight ?? null,
        overlays: Array.isArray(values.overlays) ? values.overlays : [],
        bindings: Array.isArray(values.bindings) ? values.bindings.map(binding => ({
          trigger: String(binding.trigger ?? ""),
          verb: String(binding.verb ?? ""),
          target: String(binding.target ?? "")
        })) : []
      }, values.id, {
        pluginId: "plugin.operator-workbench"
      })
    ]
  };
}

function materializeOperatorLayoutRoot(payload, formId) {
  const panelIds = new Set((payload.panels ?? []).map(panel => panel.id));
  const splitMap = new Map((payload.splits ?? []).map(split => [split.id, split]));
  function visit(nodeId, stack = new Set()) {
    if (panelIds.has(nodeId)) return { kind: "panel", panelId: nodeId };
    const split = splitMap.get(nodeId);
    if (!split) {
      throw new Error(`operator_layout ${formId} root reference not found: ${nodeId}`);
    }
    if (stack.has(nodeId)) {
      throw new Error(`operator_layout ${formId} split cycle detected: ${nodeId}`);
    }
    const nextStack = new Set(stack);
    nextStack.add(nodeId);
    return {
      kind: "split",
      axis: split.axis ?? "vertical",
      weight: split.weight ?? 50,
      first: visit(split.first, nextStack),
      second: visit(split.second, nextStack)
    };
  }
  return visit(payload.root);
}

function normalizeOperatorLayout(node, context) {
  const values = parseOperatorLayout(node.payload);
  const root = materializeOperatorLayoutRoot(values, values.id);
  const panels = Object.fromEntries(
    (values.panels ?? []).map(panel => [
      panel.id,
      {
        id: panel.id,
        title: panel.title ?? panel.id,
        contentKind: panel.contentKind,
        screenId: panel.contentKind === "screen" ? panel.targetId : null,
        leftScreenId: panel.contentKind === "left-screen" ? panel.targetId : null,
        primaryActionId: null,
        secondaryMenuId: null
      }
    ])
  );
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_layout", {
        id: values.id,
        title: values.title ?? values.id,
        viewport: values.viewport ?? null,
        focusedPanel: values.focusedPanel ?? null,
        savedAt: values.savedAt ?? null,
        root,
        panels
      }, values.id, { pluginId: "plugin.operator-workbench" })
    ]
  };
}

function normalizeOperatorKeymap(node, context) {
  const values = parseOperatorKeymap(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_keymap", {
        id: values.id,
        title: values.title ?? values.id,
        savedAt: values.savedAt ?? null,
        bindings: Object.fromEntries(
          (values.bindings ?? []).map(binding => [
            binding.trigger,
            {
              target: binding.target,
              targetKind: binding.targetKind ?? "action"
            }
          ])
        ),
        panelPrimaryActions: Object.fromEntries(
          (values.panelPrimaryActions ?? []).map(row => [row.panelId, row.targetId])
        ),
        panelSecondaryMenus: Object.fromEntries(
          (values.panelSecondaryMenus ?? []).map(row => [row.panelId, row.targetId])
        )
      }, values.id, { pluginId: "plugin.operator-workbench" })
    ]
  };
}

const legacyOperatorWorkbenchRvmForms = Object.freeze([
  Object.freeze({
    kind: "operator_theme",
    parse: parseOperatorTheme,
    serialize: serializeOperatorTheme,
    validate: validateOperatorTheme,
    normalize: normalizeOperatorTheme
  }),
  Object.freeze({
    kind: "operator_action",
    parse: parseOperatorAction,
    serialize: serializeOperatorAction,
    validate: validateOperatorAction,
    normalize: normalizeOperatorAction
  }),
  Object.freeze({
    kind: "operator_menu",
    parse: parseOperatorMenu,
    serialize: serializeOperatorMenu,
    validate: validateOperatorMenu,
    normalize: normalizeOperatorMenu
  }),
  Object.freeze({
    kind: "operator_dataset",
    parse: parseOperatorDataset,
    serialize: serializeOperatorDataset,
    validate: validateOperatorDataset,
    normalize: normalizeOperatorDataset
  }),
  Object.freeze({
    kind: "operator_screen",
    parse: parseOperatorScreen,
    serialize: serializeOperatorScreen,
    validate: validateOperatorScreen,
    normalize: normalizeOperatorScreen
  }),
  Object.freeze({
    kind: "operator_screen_section",
    parse: parseOperatorScreenSection,
    serialize: serializeOperatorScreenSection,
    validate: validateOperatorScreenSection,
    normalize: normalizeOperatorScreenSection
  }),
  Object.freeze({
    kind: "operator_overlay",
    parse: parseOperatorOverlay,
    serialize: serializeOperatorOverlay,
    validate: validateOperatorOverlay,
    normalize: normalizeOperatorOverlay
  }),
  Object.freeze({
    kind: "operator_handle",
    parse: parseOperatorHandle,
    serialize: serializeOperatorHandle,
    validate: validateOperatorHandle,
    normalize: normalizeOperatorHandle
  }),
  Object.freeze({
    kind: "operator_surface",
    parse: parseOperatorSurface,
    serialize: serializeOperatorSurface,
    validate: validateOperatorSurface,
    normalize: normalizeOperatorSurface
  }),
  Object.freeze({
    kind: "operator_viewport",
    parse: parseOperatorViewport,
    serialize: serializeOperatorViewport,
    validate: validateOperatorViewport,
    normalize: normalizeOperatorViewport
  }),
  Object.freeze({
    kind: "operator_layout",
    parse: parseOperatorLayout,
    serialize: serializeOperatorLayout,
    validate: validateOperatorLayout,
    normalize: normalizeOperatorLayout
  }),
  Object.freeze({
    kind: "operator_keymap",
    parse: parseOperatorKeymap,
    serialize: serializeOperatorKeymap,
    validate: validateOperatorKeymap,
    normalize: normalizeOperatorKeymap
  }),
  Object.freeze({
    kind: "operator_setup",
    parse: parseOperatorSetup,
    serialize: serializeOperatorSetup,
    validate: validateOperatorSetup,
    normalize: normalizeOperatorSetup
  })
]);

export const operatorWorkbenchRvmForms = Object.freeze([
  ...new Map(
    [
      ...legacyOperatorWorkbenchRvmForms,
      ...canonicalOperatorWorkbenchRvmForms
    ].map(form => [form.kind, form])
  ).values()
]);
