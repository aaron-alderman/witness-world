const VALID_THEME_MODES = new Set(["ansi16"]);
const VALID_RIGHT_SCREEN_SHAPES = new Set(["detail", "list-detail", "table-detail"]);
const VALID_LEFT_SCREEN_SHAPES = new Set(["list", "table", "tree"]);
const VALID_SCREEN_SHAPES = new Set([...VALID_RIGHT_SCREEN_SHAPES, ...VALID_LEFT_SCREEN_SHAPES]);
const VALID_DATASET_PROVIDERS = new Set(["inspect", "references", "source", "provenance"]);
const VALID_SHORTCUTS = new Set(["F2", "F3", "F4", "F5", "F6", "F7", "F8"]);
const VALID_PRIMARY_ACTIONS = new Set(["open-link", "source-open", "provenance-open", "inspect-record", "none"]);
const VALID_SECTION_KINDS = new Set(["detail", "list", "table", "kv"]);
const VALID_SCREEN_PANES = new Set(["right", "left"]);
const VALID_VIEWPORT_SPLIT_ORIENTATIONS = new Set(["horizontal", "vertical"]);
const VALID_VIEWPORT_BINDING_VERBS = new Set(["overlay", "action"]);
const VALID_OVERLAY_KINDS = new Set(["menu", "doc_view"]);
const VALID_HANDLE_KINDS = new Set(["splitter"]);
const VALID_HANDLE_AXES = new Set(["horizontal", "vertical"]);
const VALID_SURFACE_KINDS = new Set(["status_bar", "command_bar"]);
const VALID_PANEL_ROLES = new Set(["left", "right", "aux"]);
const VALID_CANONICAL_CONTENT_KINDS = new Set(["tree", "list", "table", "detail", "kv", "sectioned", "list-detail", "table-detail"]);
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

const BUILTIN_DATASET_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "builtin.inspect",
    title: "Inspect",
    provider: "inspect",
    columns: [],
    emptyMessage: "Select a record to inspect.",
    primaryAction: "none",
    origin: "builtin"
  }),
  Object.freeze({
    id: "builtin.references",
    title: "References",
    provider: "references",
    columns: [],
    emptyMessage: "(no references)",
    primaryAction: "open-link",
    origin: "builtin"
  }),
  Object.freeze({
    id: "builtin.source",
    title: "Source",
    provider: "source",
    columns: [],
    emptyMessage: "(no sources)",
    primaryAction: "source-open",
    origin: "builtin"
  }),
  Object.freeze({
    id: "builtin.provenance",
    title: "Provenance",
    provider: "provenance",
    columns: [],
    emptyMessage: "(no provenance entries)",
    primaryAction: "none",
    origin: "builtin"
  })
]);

const BUILTIN_SCREEN_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "inspect",
    title: "Inspect",
    subtitle: "Record and container detail for the current selection.",
    shape: "detail",
    datasetId: "builtin.inspect",
    dataSource: "inspect",
    helpText: "Review the current target detail and switch tabs for references, source, or provenance.",
    emptyMessage: "Select a record to inspect.",
    shortcut: null,
    origin: "builtin"
  }),
  Object.freeze({
    id: "references",
    title: "References",
    subtitle: "Linked records, breadcrumbs, and operator addresses.",
    shape: "list-detail",
    datasetId: "builtin.references",
    dataSource: "references",
    helpText: "Review grouped links, then open actionable operator addresses.",
    emptyMessage: "(no references)",
    shortcut: "F2",
    origin: "builtin"
  }),
  Object.freeze({
    id: "source",
    title: "Source",
    subtitle: "Source-backed authored locations and excerpts.",
    shape: "list-detail",
    datasetId: "builtin.source",
    dataSource: "source",
    helpText: "Review source rows, then open the selected excerpt in place.",
    emptyMessage: "(no sources)",
    shortcut: "F3",
    origin: "builtin"
  }),
  Object.freeze({
    id: "provenance",
    title: "Provenance",
    subtitle: "Authored and runtime trace for the current target.",
    shape: "list-detail",
    datasetId: "builtin.provenance",
    dataSource: "provenance",
    helpText: "Review provenance rows, then follow the selected authored or runtime trace.",
    emptyMessage: "(no provenance entries)",
    shortcut: "F4",
    origin: "builtin"
  })
]);

const BUILTIN_OVERLAY_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "help_overlay",
    title: "Help",
    kind: "doc_view",
    menuId: null,
    width: 56,
    height: 10,
    resizable: true,
    closeIdsOnOpen: ["context_menu"],
    scroll: [],
    origin: "builtin"
  }),
  Object.freeze({
    id: "context_menu",
    title: "Context",
    kind: "menu",
    menuId: "builtin.context",
    width: 24,
    height: 8,
    resizable: false,
    closeIdsOnOpen: ["help_overlay"],
    scroll: [],
    origin: "builtin"
  })
]);

const BUILTIN_ACTION_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "builtin.help.toggle",
    title: "Help",
    kind: "builtin",
    builtin: "toggle-help",
    origin: "builtin"
  }),
  Object.freeze({
    id: "builtin.screen.references",
    title: "References",
    kind: "builtin",
    builtin: "set-right-screen",
    screenId: "references",
    pane: "right",
    origin: "builtin"
  }),
  Object.freeze({
    id: "builtin.screen.source",
    title: "Source",
    kind: "builtin",
    builtin: "set-right-screen",
    screenId: "source",
    pane: "right",
    origin: "builtin"
  }),
  Object.freeze({
    id: "builtin.screen.provenance",
    title: "Provenance",
    kind: "builtin",
    builtin: "set-right-screen",
    screenId: "provenance",
    pane: "right",
    origin: "builtin"
  }),
  Object.freeze({
    id: "builtin.selection.edit",
    title: "Edit",
    kind: "builtin",
    builtin: "edit",
    origin: "builtin"
  }),
  Object.freeze({
    id: "builtin.selection.change-color",
    title: "Change Color",
    kind: "builtin",
    builtin: "change-color",
    origin: "builtin"
  }),
  Object.freeze({
    id: "builtin.selection.rename",
    title: "Rename",
    kind: "builtin",
    builtin: "rename",
    origin: "builtin"
  }),
  Object.freeze({
    id: "builtin.selection.clone",
    title: "Clone",
    kind: "builtin",
    builtin: "clone",
    origin: "builtin"
  })
]);

const BUILTIN_MENU_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "builtin.context",
    title: "Context",
    itemActionIds: [
      "builtin.selection.edit",
      "builtin.selection.change-color",
      "builtin.selection.rename",
      "builtin.selection.clone"
    ],
    origin: "builtin"
  })
]);

const BUILTIN_VIEWPORT_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "builtin.default",
    title: "Builtin Default",
    theme: null,
    screenId: "inspect",
    leftScreenId: null,
    topSurfaceId: null,
    bottomSurfaceId: null,
    topHandleId: null,
    bottomHandleId: null,
    splitHandleId: null,
    width: 80,
    height: 30,
    top: 3,
    bottom: 4,
    splitOrientation: "horizontal",
    leftWeight: 28,
    rightWeight: 72,
    overlays: ["help_overlay", "context_menu"],
    bindings: [],
    origin: "builtin"
  })
]);

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function optionalInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function deepClone(value) {
  return value == null ? value : structuredClone(value);
}

function normalizeShortcut(value) {
  const shortcut = optionalText(value)?.toUpperCase() ?? null;
  return shortcut && VALID_SHORTCUTS.has(shortcut) ? shortcut : null;
}

function normalizePrimaryAction(value) {
  const action = optionalText(value)?.toLowerCase() ?? null;
  return action && VALID_PRIMARY_ACTIONS.has(action) ? action : null;
}

function normalizeActionRef(value) {
  return normalizePrimaryAction(value) ?? optionalText(value);
}

function normalizeColumns(values) {
  return (Array.isArray(values) ? values : []).map(optionalText).filter(Boolean);
}

function normalizeIdList(value) {
  if (Array.isArray(value)) return value.map(optionalText).filter(Boolean);
  const single = optionalText(value);
  return single ? [single] : [];
}

function arrayWrap(value) {
  return Array.isArray(value) ? value : [];
}

function cloneDatasetSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    provider: spec.provider,
    rowFilterKind: spec.rowFilterKind ?? null,
    rowFilterAction: spec.rowFilterAction ?? null,
    columns: Array.isArray(spec.columns) ? [...spec.columns] : [],
    emptyMessage: spec.emptyMessage ?? null,
    primaryAction: spec.primaryAction ?? null,
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function cloneThemeSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    mode: spec.mode ?? "ansi16",
    palette: spec.palette ?? "terminal-dark",
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function cloneScreenSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title,
    pane: spec.pane ?? "right",
    subtitle: spec.subtitle ?? null,
    shape: spec.shape,
    datasetId: spec.datasetId ?? null,
    dataSource: spec.dataSource ?? null,
    leftScreenId: spec.leftScreenId ?? null,
    helpText: spec.helpText ?? null,
    emptyMessage: spec.emptyMessage ?? null,
    shortcut: spec.shortcut ?? null,
    rowFilterKind: spec.rowFilterKind ?? null,
    rowFilterAction: spec.rowFilterAction ?? null,
    priority: spec.priority ?? null,
    defaultSectionId: spec.defaultSectionId ?? null,
    sectionIds: Array.isArray(spec.sectionIds) ? [...spec.sectionIds] : [],
    sections: Array.isArray(spec.sections) ? spec.sections.map(cloneScreenSectionSpec) : [],
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function cloneScreenSectionSpec(spec = {}) {
  return {
    id: spec.id,
    screenId: spec.screenId ?? null,
    title: spec.title ?? spec.id,
    kind: spec.kind ?? "detail",
    datasetId: spec.datasetId ?? null,
    dataSource: spec.dataSource ?? null,
    columns: Array.isArray(spec.columns) ? [...spec.columns] : [],
    emptyMessage: spec.emptyMessage ?? null,
    collapsible: spec.collapsible ?? null,
    collapsed: spec.collapsed ?? null,
    rowFilterKind: spec.rowFilterKind ?? null,
    rowFilterAction: spec.rowFilterAction ?? null,
    priority: spec.priority ?? null,
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function cloneViewportBindingSpec(spec = {}) {
  return {
    trigger: spec.trigger ?? "",
    verb: spec.verb ?? "",
    target: spec.target ?? ""
  };
}

function cloneActionSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    kind: spec.kind ?? null,
    builtin: spec.builtin ?? null,
    overlayId: spec.overlayId ?? null,
    screenId: spec.screenId ?? null,
    pane: spec.pane ?? null,
    message: spec.message ?? null,
    steps: Array.isArray(spec.steps) ? [...spec.steps] : [],
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function cloneMenuSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    itemActionIds: Array.isArray(spec.itemActionIds) ? [...spec.itemActionIds] : [],
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function cloneOverlaySpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    kind: spec.kind ?? "doc_view",
    menuId: spec.menuId ?? null,
    width: spec.width ?? null,
    height: spec.height ?? null,
    resizable: spec.resizable ?? null,
    closeIdsOnOpen: Array.isArray(spec.closeIdsOnOpen) ? [...spec.closeIdsOnOpen] : [],
    scroll: Array.isArray(spec.scroll) ? [...spec.scroll] : [],
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function cloneHandleSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    kind: spec.kind ?? "splitter",
    axis: spec.axis ?? null,
    size: spec.size ?? null,
    draggable: spec.draggable ?? null,
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function cloneSurfaceSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    kind: spec.kind ?? "status_bar",
    width: spec.width ?? null,
    height: spec.height ?? null,
    resizable: spec.resizable ?? null,
    maxPrimaryChars: spec.maxPrimaryChars ?? null,
    scroll: Array.isArray(spec.scroll) ? [...spec.scroll] : [],
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function cloneViewportSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    theme: spec.theme ?? null,
    screenId: spec.screenId ?? null,
    leftScreenId: spec.leftScreenId ?? null,
    topSurfaceId: spec.topSurfaceId ?? null,
    bottomSurfaceId: spec.bottomSurfaceId ?? null,
    topHandleId: spec.topHandleId ?? null,
    bottomHandleId: spec.bottomHandleId ?? null,
    splitHandleId: spec.splitHandleId ?? null,
    width: spec.width ?? null,
    height: spec.height ?? null,
    top: spec.top ?? null,
    bottom: spec.bottom ?? null,
    splitOrientation: spec.splitOrientation ?? null,
    leftWeight: spec.leftWeight ?? null,
    rightWeight: spec.rightWeight ?? null,
    overlays: Array.isArray(spec.overlays) ? [...spec.overlays] : [],
    bindings: Array.isArray(spec.bindings) ? spec.bindings.map(cloneViewportBindingSpec) : [],
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function cloneSplitSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    axis: spec.axis ?? "horizontal",
    first: spec.first ?? null,
    second: spec.second ?? null,
    firstWeight: spec.firstWeight ?? null,
    secondWeight: spec.secondWeight ?? null,
    handle: spec.handle ?? null,
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function clonePanelSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    subtitle: spec.subtitle ?? null,
    role: spec.role ?? "aux",
    contentId: spec.contentId ?? null,
    shortcut: spec.shortcut ?? null,
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function cloneContentSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    subtitle: spec.subtitle ?? null,
    kind: spec.kind ?? "detail",
    screenShape: spec.screenShape ?? null,
    surfaceKind: spec.surfaceKind ?? null,
    datasetId: spec.datasetId ?? null,
    dataSource: spec.dataSource ?? null,
    leftPanelId: spec.leftPanelId ?? null,
    helpText: spec.helpText ?? null,
    emptyMessage: spec.emptyMessage ?? null,
    rowFilterKind: spec.rowFilterKind ?? null,
    rowFilterAction: spec.rowFilterAction ?? null,
    shortcut: spec.shortcut ?? null,
    defaultSectionId: spec.defaultSectionId ?? null,
    sectionIds: Array.isArray(spec.sectionIds) ? [...spec.sectionIds] : [],
    columns: Array.isArray(spec.columns) ? [...spec.columns] : [],
    collapsible: spec.collapsible ?? null,
    collapsed: spec.collapsed ?? null,
    priority: spec.priority ?? null,
    maxPrimaryChars: spec.maxPrimaryChars ?? null,
    width: spec.width ?? null,
    height: spec.height ?? null,
    resizable: spec.resizable ?? null,
    closeIdsOnOpen: Array.isArray(spec.closeIdsOnOpen) ? [...spec.closeIdsOnOpen] : [],
    scroll: Array.isArray(spec.scroll) ? [...spec.scroll] : [],
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function cloneChromeSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    kind: spec.kind ?? "status_bar",
    contentId: spec.contentId ?? null,
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function cloneWindowSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    theme: spec.theme ?? null,
    rootSplitId: spec.rootSplitId ?? null,
    leftPanelId: spec.leftPanelId ?? null,
    rightPanelId: spec.rightPanelId ?? null,
    topChromeId: spec.topChromeId ?? null,
    bottomChromeId: spec.bottomChromeId ?? null,
    topHandleId: spec.topHandleId ?? null,
    bottomHandleId: spec.bottomHandleId ?? null,
    width: spec.width ?? null,
    height: spec.height ?? null,
    top: spec.top ?? null,
    bottom: spec.bottom ?? null,
    overlays: Array.isArray(spec.overlays) ? [...spec.overlays] : [],
    bindings: Array.isArray(spec.bindings) ? spec.bindings.map(cloneViewportBindingSpec) : [],
    origin: spec.origin ?? "authored",
    pluginId: spec.pluginId ?? null,
    source: spec.source ? { ...spec.source } : null
  };
}

function normalizeAuthoredThemeSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  const mode = optionalText(values.mode) ?? "ansi16";
  const palette = optionalText(values.palette) ?? "terminal-dark";
  if (!id || !VALID_THEME_MODES.has(mode) || !palette) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    mode,
    palette,
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeAuthoredDatasetSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  const provider = optionalText(values.provider);
  if (!id || !VALID_DATASET_PROVIDERS.has(provider)) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    provider,
    rowFilterKind: optionalText(values.rowFilterKind) ?? optionalText(values.row_filter_kind) ?? null,
    rowFilterAction: optionalText(values.rowFilterAction) ?? optionalText(values.row_filter_action) ?? null,
    columns: normalizeColumns(values.columns),
    emptyMessage: optionalText(values.emptyMessage) ?? optionalText(values.empty_message) ?? null,
    primaryAction: normalizeActionRef(values.primaryAction ?? values.primary_action),
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeAuthoredScreenSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  const pane = optionalText(values.pane)?.toLowerCase() ?? "right";
  const shape = optionalText(values.shape) ?? (pane === "left" ? "list" : "list-detail");
  const datasetId = optionalText(values.dataset) ?? optionalText(values.datasetId) ?? optionalText(values.dataset_id);
  const dataSource = optionalText(values.dataSource) ?? optionalText(values.data_source);
  const leftScreenId = optionalText(values.leftScreen) ?? optionalText(values.left_screen) ?? null;
  const sectionIds = Array.isArray(values.sections)
    ? values.sections.map(optionalText).filter(Boolean)
    : [];
  if (!id || !VALID_SCREEN_PANES.has(pane) || !VALID_SCREEN_SHAPES.has(shape)) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    pane,
    subtitle: optionalText(values.subtitle),
    shape,
    datasetId,
    dataSource,
    leftScreenId,
    helpText: optionalText(values.helpText) ?? optionalText(values.help) ?? null,
    emptyMessage: optionalText(values.emptyMessage) ?? optionalText(values.empty_message) ?? null,
    shortcut: normalizeShortcut(values.shortcut),
    rowFilterKind: optionalText(values.rowFilterKind) ?? optionalText(values.row_filter_kind) ?? null,
    rowFilterAction: optionalText(values.rowFilterAction) ?? optionalText(values.row_filter_action) ?? null,
    priority: optionalInteger(values.priority),
    defaultSectionId: optionalText(values.defaultSection) ?? optionalText(values.default_section) ?? null,
    sectionIds,
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeAuthoredScreenSectionSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  const screenId = optionalText(values.screen) ?? optionalText(values.screenId) ?? optionalText(values.screen_id);
  const kind = optionalText(values.kind) ?? "detail";
  const datasetId = optionalText(values.dataset) ?? optionalText(values.datasetId) ?? optionalText(values.dataset_id);
  const dataSource = optionalText(values.dataSource) ?? optionalText(values.data_source);
  if (!id || !screenId || !VALID_SECTION_KINDS.has(kind) || (!datasetId && !VALID_DATASET_PROVIDERS.has(dataSource))) return null;
  return {
    id,
    screenId,
    title: optionalText(values.title) ?? id,
    kind,
    datasetId,
    dataSource,
    columns: normalizeColumns(values.columns),
    emptyMessage: optionalText(values.emptyMessage) ?? optionalText(values.empty_message) ?? null,
    collapsible: values.collapsible === undefined || values.collapsible === null ? null : Boolean(values.collapsible),
    collapsed: values.collapsed === undefined || values.collapsed === null ? null : Boolean(values.collapsed),
    rowFilterKind: optionalText(values.rowFilterKind) ?? optionalText(values.row_filter_kind) ?? null,
    rowFilterAction: optionalText(values.rowFilterAction) ?? optionalText(values.row_filter_action) ?? null,
    priority: optionalInteger(values.priority),
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeSetupShortcutRows(values = {}) {
  const rows = Array.isArray(values.shortcuts) ? values.shortcuts : [];
  return rows
    .map(row => ({
      shortcut: normalizeShortcut(row?.shortcut ?? row?.key),
      screenId: optionalText(row?.screenId) ?? optionalText(row?.screen)
    }))
    .filter(row => row.shortcut && row.screenId);
}

function normalizeAuthoredSetup(residual = null) {
  const values = residual?.body?.values ?? {};
  return {
    id: optionalText(values.id) ?? optionalText(residual?.name) ?? "operator_setup",
    screens: Array.isArray(values.screens)
      ? values.screens.map(optionalText).filter(Boolean)
      : [],
    shortcuts: normalizeSetupShortcutRows(values),
    defaultScreen: optionalText(values.defaultScreen) ?? optionalText(values.default_screen) ?? null,
    defaultLeftScreen: optionalText(values.defaultLeftScreen) ?? optionalText(values.default_left_screen) ?? null,
    defaultViewport: optionalText(values.defaultViewport) ?? optionalText(values.default_viewport) ?? null
  };
}

function normalizeAuthoredActionSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  const kind = optionalText(values.kind);
  if (!id || !VALID_ACTION_KINDS.has(kind)) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    kind,
    builtin: optionalText(values.builtin) ?? null,
    overlayId: optionalText(values.overlay) ?? optionalText(values.overlayId) ?? optionalText(values.overlay_id) ?? null,
    screenId: optionalText(values.screen) ?? optionalText(values.screenId) ?? optionalText(values.screen_id) ?? null,
    pane: optionalText(values.pane) ?? null,
    message: optionalText(values.message) ?? null,
    steps: Array.isArray(values.steps) ? values.steps.map(optionalText).filter(Boolean) : [],
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeAuthoredMenuSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  if (!id) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    itemActionIds: Array.isArray(values.items) ? values.items.map(optionalText).filter(Boolean) : [],
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeOverlayScroll(values = []) {
  return (Array.isArray(values) ? values : []).map(optionalText).filter(Boolean);
}

function normalizeAuthoredOverlaySpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  const kind = optionalText(values.kind) ?? "doc_view";
  if (!id || !VALID_OVERLAY_KINDS.has(kind)) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    kind,
    menuId: optionalText(values.menu) ?? optionalText(values.menuId) ?? optionalText(values.menu_id) ?? null,
    width: optionalInteger(values.width),
    height: optionalInteger(values.height),
    resizable: values.resizable === undefined || values.resizable === null ? null : Boolean(values.resizable),
    closeIdsOnOpen: normalizeIdList(values.closeIdsOnOpen ?? values.closeOnOpen ?? values.close_on_open),
    scroll: normalizeOverlayScroll(values.scroll),
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeAuthoredHandleSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  const kind = optionalText(values.kind) ?? "splitter";
  const axis = optionalText(values.axis) ?? null;
  if (!id || !VALID_HANDLE_KINDS.has(kind) || !VALID_HANDLE_AXES.has(axis)) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    kind,
    axis,
    size: optionalInteger(values.size),
    draggable: values.draggable === undefined || values.draggable === null ? null : Boolean(values.draggable),
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeAuthoredSurfaceSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  const kind = optionalText(values.kind) ?? null;
  if (!id || !VALID_SURFACE_KINDS.has(kind)) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    kind,
    width: optionalInteger(values.width),
    height: optionalInteger(values.height),
    resizable: values.resizable === undefined || values.resizable === null ? null : Boolean(values.resizable),
    maxPrimaryChars: optionalInteger(values.maxPrimaryChars) ?? optionalInteger(values.max_primary_chars),
    scroll: normalizeOverlayScroll(values.scroll),
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeViewportBindings(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(binding => ({
      trigger: optionalText(binding?.trigger) ?? "",
      verb: optionalText(binding?.verb) ?? "",
      target: optionalText(binding?.target) ?? ""
    }))
    .filter(binding => binding.trigger && binding.verb && binding.target);
}

function normalizeAuthoredViewportSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  if (!id) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    theme: optionalText(values.theme) ?? null,
    screenId: optionalText(values.screen) ?? optionalText(values.screenId) ?? null,
    leftScreenId: optionalText(values.leftScreen) ?? optionalText(values.left_screen) ?? null,
    topSurfaceId: optionalText(values.topSurface) ?? optionalText(values.top_surface) ?? null,
    bottomSurfaceId: optionalText(values.bottomSurface) ?? optionalText(values.bottom_surface) ?? null,
    topHandleId: optionalText(values.topHandle) ?? optionalText(values.top_handle) ?? null,
    bottomHandleId: optionalText(values.bottomHandle) ?? optionalText(values.bottom_handle) ?? null,
    splitHandleId: optionalText(values.splitHandle) ?? optionalText(values.split_handle) ?? null,
    width: optionalInteger(values.width),
    height: optionalInteger(values.height),
    top: optionalInteger(values.top),
    bottom: optionalInteger(values.bottom),
    splitOrientation: optionalText(values.splitOrientation) ?? optionalText(values.split_orientation) ?? null,
    leftWeight: optionalInteger(values.leftWeight) ?? optionalInteger(values.left_weight),
    rightWeight: optionalInteger(values.rightWeight) ?? optionalInteger(values.right_weight),
    overlays: Array.isArray(values.overlays) ? values.overlays.map(optionalText).filter(Boolean) : [],
    bindings: normalizeViewportBindings(values.bindings),
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeAuthoredLayoutSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  if (!id) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    viewportId: optionalText(values.viewport) ?? optionalText(values.viewportId) ?? optionalText(values.viewport_id) ?? null,
    focusedPanelId: optionalText(values.focusedPanel) ?? optionalText(values.focused_panel) ?? null,
    root: values.root && typeof values.root === "object" ? deepClone(values.root) : null,
    panels: values.panels && typeof values.panels === "object" ? deepClone(values.panels) : {},
    savedAt: optionalText(values.savedAt) ?? optionalText(values.saved_at) ?? null,
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeAuthoredKeymapSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  if (!id) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    bindings: values.bindings && typeof values.bindings === "object" ? deepClone(values.bindings) : {},
    panelPrimaryActions: values.panelPrimaryActions && typeof values.panelPrimaryActions === "object"
      ? deepClone(values.panelPrimaryActions)
      : {},
    panelSecondaryMenus: values.panelSecondaryMenus && typeof values.panelSecondaryMenus === "object"
      ? deepClone(values.panelSecondaryMenus)
      : {},
    savedAt: optionalText(values.savedAt) ?? optionalText(values.saved_at) ?? null,
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeAuthoredSplitSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  const axis = optionalText(values.axis) ?? "horizontal";
  if (!id || !VALID_HANDLE_AXES.has(axis)) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    axis,
    first: optionalText(values.first) ?? null,
    second: optionalText(values.second) ?? null,
    firstWeight: optionalInteger(values.firstWeight) ?? optionalInteger(values.first_weight),
    secondWeight: optionalInteger(values.secondWeight) ?? optionalInteger(values.second_weight),
    handle: optionalText(values.handle) ?? null,
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeAuthoredPanelSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  const role = optionalText(values.role)?.toLowerCase() ?? "aux";
  if (!id || !VALID_PANEL_ROLES.has(role)) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    subtitle: optionalText(values.subtitle) ?? null,
    role,
    contentId: optionalText(values.content) ?? null,
    shortcut: normalizeShortcut(values.shortcut),
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeAuthoredContentSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  const kind = optionalText(values.kind) ?? "detail";
  if (!id || !VALID_CANONICAL_CONTENT_KINDS.has(kind)) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    subtitle: optionalText(values.subtitle) ?? null,
    kind,
    screenShape: optionalText(values.screenShape) ?? optionalText(values.screen_shape) ?? null,
    surfaceKind: optionalText(values.surfaceKind) ?? optionalText(values.surface_kind) ?? null,
    datasetId: optionalText(values.dataset) ?? optionalText(values.datasetId) ?? optionalText(values.dataset_id),
    dataSource: optionalText(values.dataSource) ?? optionalText(values.data_source),
    leftPanelId: optionalText(values.leftPanel) ?? optionalText(values.left_panel) ?? null,
    helpText: optionalText(values.helpText) ?? optionalText(values.help) ?? null,
    emptyMessage: optionalText(values.emptyMessage) ?? optionalText(values.empty_message) ?? null,
    rowFilterKind: optionalText(values.rowFilterKind) ?? optionalText(values.row_filter_kind) ?? null,
    rowFilterAction: optionalText(values.rowFilterAction) ?? optionalText(values.row_filter_action) ?? null,
    shortcut: normalizeShortcut(values.shortcut),
    defaultSectionId: optionalText(values.defaultSection) ?? optionalText(values.default_section) ?? null,
    sectionIds: Array.isArray(values.sections) ? values.sections.map(optionalText).filter(Boolean) : [],
    columns: normalizeColumns(values.columns),
    collapsible: values.collapsible === undefined || values.collapsible === null ? null : Boolean(values.collapsible),
    collapsed: values.collapsed === undefined || values.collapsed === null ? null : Boolean(values.collapsed),
    priority: optionalInteger(values.priority),
    maxPrimaryChars: optionalInteger(values.maxPrimaryChars) ?? optionalInteger(values.max_primary_chars),
    width: optionalInteger(values.width),
    height: optionalInteger(values.height),
    resizable: values.resizable === undefined || values.resizable === null ? null : Boolean(values.resizable),
    closeIdsOnOpen: normalizeIdList(values.closeIdsOnOpen ?? values.closeOnOpen ?? values.close_on_open),
    scroll: normalizeOverlayScroll(values.scroll),
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeAuthoredChromeSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  const kind = optionalText(values.kind) ?? "status_bar";
  if (!id || !VALID_SURFACE_KINDS.has(kind)) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    kind,
    contentId: optionalText(values.content) ?? null,
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function normalizeAuthoredWindowSpec(residual = null) {
  const values = residual?.body?.values ?? {};
  const id = optionalText(values.id) ?? optionalText(residual?.name);
  if (!id) return null;
  return {
    id,
    title: optionalText(values.title) ?? id,
    theme: optionalText(values.theme) ?? null,
    rootSplitId: optionalText(values.root) ?? null,
    leftPanelId: optionalText(values.leftPanel) ?? optionalText(values.left_panel) ?? null,
    rightPanelId: optionalText(values.rightPanel) ?? optionalText(values.right_panel) ?? null,
    topChromeId: optionalText(values.topChrome) ?? optionalText(values.top_chrome) ?? null,
    bottomChromeId: optionalText(values.bottomChrome) ?? optionalText(values.bottom_chrome) ?? null,
    topHandleId: optionalText(values.topHandle) ?? optionalText(values.top_handle) ?? null,
    bottomHandleId: optionalText(values.bottomHandle) ?? optionalText(values.bottom_handle) ?? null,
    width: optionalInteger(values.width),
    height: optionalInteger(values.height),
    top: optionalInteger(values.top),
    bottom: optionalInteger(values.bottom),
    overlays: Array.isArray(values.overlays) ? values.overlays.map(optionalText).filter(Boolean) : [],
    bindings: normalizeViewportBindings(values.bindings),
    origin: "authored",
    pluginId: residual?.body?.trace?.pluginId ?? residual?.meta?.pluginId ?? null,
    source: {
      file: residual?.body?.file ?? null,
      line: residual?.body?.line ?? null
    }
  };
}

function inferScreenShapeFromContent(content = {}, role = "right") {
  if (content.screenShape) return content.screenShape;
  if (role === "left") return content.kind === "tree" ? "tree" : (content.kind === "table" ? "table" : "list");
  if (content.kind === "sectioned") return "list-detail";
  if (content.kind === "table-detail" || content.kind === "list-detail") return content.kind;
  if (content.kind === "detail") return "detail";
  if (content.kind === "table") return "table-detail";
  if (content.kind === "list") return "list-detail";
  return "detail";
}

function lowerCanonicalOperatorWorkbenchSpecs(authored = {}) {
  const contentById = new Map((authored.contents ?? []).map(spec => [spec.id, cloneContentSpec(spec)]));
  const panelById = new Map((authored.panels ?? []).map(spec => [spec.id, clonePanelSpec(spec)]));
  const chromeById = new Map((authored.chromes ?? []).map(spec => [spec.id, cloneChromeSpec(spec)]));
  const splitById = new Map((authored.splits ?? []).map(spec => [spec.id, cloneSplitSpec(spec)]));
  const windowById = new Map((authored.windows ?? []).map(spec => [spec.id, cloneWindowSpec(spec)]));
  const screens = [];
  const sections = [];
  const surfaces = [];
  const viewports = [];

  for (const panel of panelById.values()) {
    if (!panel.contentId || !contentById.has(panel.contentId)) {
      throw new Error(`operator_panel ${panel.id} content not found: ${panel.contentId}`);
    }
    const content = contentById.get(panel.contentId);
    if (panel.role === "left") {
      screens.push({
        id: panel.id,
        title: panel.title,
        pane: "left",
        subtitle: panel.subtitle,
        shape: inferScreenShapeFromContent(content, "left"),
        datasetId: content.kind === "tree" ? null : content.datasetId,
        dataSource: content.kind === "tree" ? null : content.dataSource,
        helpText: content.helpText,
        emptyMessage: content.emptyMessage,
        rowFilterKind: content.rowFilterKind,
        rowFilterAction: content.rowFilterAction,
        origin: "authored",
        pluginId: panel.pluginId ?? content.pluginId ?? null,
        source: panel.source ?? content.source ?? null
      });
    } else if (panel.role === "right") {
      const screen = {
        id: panel.id,
        title: panel.title,
        pane: "right",
        subtitle: content.subtitle ?? panel.subtitle,
        shape: inferScreenShapeFromContent(content, "right"),
        datasetId: content.kind === "sectioned" ? null : content.datasetId,
        dataSource: content.kind === "sectioned" ? null : content.dataSource,
        leftScreenId: content.leftPanelId,
        helpText: content.helpText,
        emptyMessage: content.emptyMessage,
        shortcut: panel.shortcut ?? content.shortcut ?? null,
        rowFilterKind: content.rowFilterKind,
        rowFilterAction: content.rowFilterAction,
        defaultSectionId: content.defaultSectionId,
        sectionIds: [],
        origin: "authored",
        pluginId: panel.pluginId ?? content.pluginId ?? null,
        source: panel.source ?? content.source ?? null
      };
      if (content.kind === "sectioned") {
        screen.sectionIds = [...content.sectionIds];
        for (const sectionId of content.sectionIds) {
          const sectionContent = contentById.get(sectionId) ?? null;
          if (!sectionContent) throw new Error(`operator_content ${content.id} section not found: ${sectionId}`);
          if (!VALID_SECTION_KINDS.has(sectionContent.kind)) {
            throw new Error(`operator_content ${sectionContent.id} cannot lower to screen section from kind=${sectionContent.kind}`);
          }
          sections.push({
            id: sectionContent.id,
            screenId: panel.id,
            title: sectionContent.title,
            kind: sectionContent.kind,
            datasetId: sectionContent.datasetId,
            dataSource: sectionContent.dataSource,
            columns: [...sectionContent.columns],
            emptyMessage: sectionContent.emptyMessage,
            collapsible: sectionContent.collapsible,
            collapsed: sectionContent.collapsed,
            rowFilterKind: sectionContent.rowFilterKind,
            rowFilterAction: sectionContent.rowFilterAction,
            priority: sectionContent.priority,
            origin: "authored",
            pluginId: sectionContent.pluginId ?? null,
            source: sectionContent.source ?? null
          });
        }
      }
      screens.push(screen);
    }

    const inferredSurfaceKind = content.surfaceKind
      ?? (content.kind === "tree" ? "tree" : "text_reader");
    surfaces.push({
      id: panel.id,
      title: panel.title,
      kind: inferredSurfaceKind,
      width: content.width,
      height: content.height,
      resizable: content.resizable,
      maxPrimaryChars: content.maxPrimaryChars,
      scroll: [...content.scroll],
      origin: "canonical",
      pluginId: panel.pluginId ?? content.pluginId ?? null,
      source: panel.source ?? content.source ?? null
    });
  }

  for (const chrome of chromeById.values()) {
    surfaces.push({
      id: chrome.id,
      title: chrome.title,
      kind: chrome.kind,
      width: null,
      height: null,
      resizable: null,
      maxPrimaryChars: null,
      scroll: [],
      origin: "canonical",
      pluginId: chrome.pluginId ?? null,
      source: chrome.source ?? null
    });
  }

  for (const windowSpec of windowById.values()) {
    const split = splitById.get(windowSpec.rootSplitId) ?? null;
    if (!split) throw new Error(`operator_window ${windowSpec.id} root split not found: ${windowSpec.rootSplitId}`);
    viewports.push({
      id: windowSpec.id,
      title: windowSpec.title,
      theme: windowSpec.theme,
      screenId: windowSpec.rightPanelId ?? null,
      leftScreenId: windowSpec.leftPanelId ?? null,
      topSurfaceId: windowSpec.topChromeId ?? null,
      bottomSurfaceId: windowSpec.bottomChromeId ?? null,
      topHandleId: windowSpec.topHandleId ?? null,
      bottomHandleId: windowSpec.bottomHandleId ?? null,
      splitHandleId: split.handle ?? null,
      width: windowSpec.width,
      height: windowSpec.height,
      top: windowSpec.top,
      bottom: windowSpec.bottom,
      splitOrientation: split.axis,
      leftWeight: split.firstWeight,
      rightWeight: split.secondWeight,
      overlays: [...windowSpec.overlays],
      bindings: windowSpec.bindings.map(cloneViewportBindingSpec),
      origin: "canonical",
      pluginId: windowSpec.pluginId ?? null,
      source: windowSpec.source ?? null
    });
  }

  return { screens, sections, surfaces, viewports };
}

function builtinDatasetIdForProvider(provider) {
  const normalized = optionalText(provider);
  return normalized ? `builtin.${normalized}` : null;
}

function normalizeResolvedScreenSection(section, datasetsById) {
  const datasetId = section.datasetId ?? builtinDatasetIdForProvider(section.dataSource);
  if (datasetId && !datasetsById.has(datasetId)) {
    throw new Error(`operator_screen_section ${section.id} dataset not found: ${datasetId}`);
  }
  const dataset = datasetId ? datasetsById.get(datasetId) : null;
  return {
    ...cloneScreenSectionSpec(section),
    datasetId: datasetId ?? null,
    dataSource: dataset?.provider ?? section.dataSource ?? null,
    collapsible: section.collapsible === null || section.collapsible === undefined ? null : Boolean(section.collapsible),
    collapsed: section.collapsed === null || section.collapsed === undefined ? null : Boolean(section.collapsed)
  };
}

export function collectAuthoredOperatorWorkbenchSpecs(authoredDesireDocs = [], {
  includeLoweredCanonical = true
} = {}) {
  const themes = [];
  const datasets = [];
  const actions = [];
  const menus = [];
  const screens = [];
  const sections = [];
  const overlays = [];
  const handles = [];
  const surfaces = [];
  const viewports = [];
  const layouts = [];
  const keymaps = [];
  const setupRows = [];
  const splits = [];
  const panels = [];
  const contents = [];
  const chromes = [];
  const windows = [];
  for (const desire of authoredDesireDocs ?? []) {
    for (const residual of desire?.runtimeResiduals ?? []) {
      const kind = residual?.body?.declarationKind ?? null;
      if (kind === "operator_theme") {
        const theme = normalizeAuthoredThemeSpec(residual);
        if (theme) themes.push(theme);
      }
      if (kind === "operator_dataset") {
        const dataset = normalizeAuthoredDatasetSpec(residual);
        if (dataset) datasets.push(dataset);
      }
      if (kind === "operator_action") {
        const action = normalizeAuthoredActionSpec(residual);
        if (action) actions.push(action);
      }
      if (kind === "operator_menu") {
        const menu = normalizeAuthoredMenuSpec(residual);
        if (menu) menus.push(menu);
      }
      if (kind === "operator_screen") {
        const screen = normalizeAuthoredScreenSpec(residual);
        if (screen) screens.push(screen);
      }
      if (kind === "operator_screen_section") {
        const section = normalizeAuthoredScreenSectionSpec(residual);
        if (section) sections.push(section);
      }
      if (kind === "operator_overlay") {
        const overlay = normalizeAuthoredOverlaySpec(residual);
        if (overlay) overlays.push(overlay);
      }
      if (kind === "operator_handle") {
        const handle = normalizeAuthoredHandleSpec(residual);
        if (handle) handles.push(handle);
      }
      if (kind === "operator_surface") {
        const surface = normalizeAuthoredSurfaceSpec(residual);
        if (surface) surfaces.push(surface);
      }
      if (kind === "operator_viewport") {
        const viewport = normalizeAuthoredViewportSpec(residual);
        if (viewport) viewports.push(viewport);
      }
      if (kind === "operator_layout") {
        const layout = normalizeAuthoredLayoutSpec(residual);
        if (layout) layouts.push(layout);
      }
      if (kind === "operator_keymap") {
        const keymap = normalizeAuthoredKeymapSpec(residual);
        if (keymap) keymaps.push(keymap);
      }
      if (kind === "operator_setup") {
        setupRows.push(normalizeAuthoredSetup(residual));
      }
      if (kind === "operator_split") {
        const split = normalizeAuthoredSplitSpec(residual);
        if (split) splits.push(split);
      }
      if (kind === "operator_panel") {
        const panel = normalizeAuthoredPanelSpec(residual);
        if (panel) panels.push(panel);
      }
      if (kind === "operator_content") {
        const content = normalizeAuthoredContentSpec(residual);
        if (content) contents.push(content);
      }
      if (kind === "operator_chrome") {
        const chrome = normalizeAuthoredChromeSpec(residual);
        if (chrome) chromes.push(chrome);
      }
      if (kind === "operator_window") {
        const windowSpec = normalizeAuthoredWindowSpec(residual);
        if (windowSpec) windows.push(windowSpec);
      }
    }
  }
  if (includeLoweredCanonical && (splits.length || panels.length || contents.length || chromes.length || windows.length)) {
    const lowered = lowerCanonicalOperatorWorkbenchSpecs({
      splits,
      panels,
      contents,
      chromes,
      windows
    });
    screens.push(...lowered.screens);
    sections.push(...lowered.sections);
    surfaces.push(...lowered.surfaces);
    viewports.push(...lowered.viewports);
  }
  return {
    themes,
    datasets,
    actions,
    menus,
    screens,
    sections,
    overlays,
    handles,
    surfaces,
    viewports,
    layouts,
    keymaps,
    setupRows,
    splits,
    panels,
    contents,
    chromes,
    windows
  };
}

export function buildOperatorWorkbenchDefinitionFromSpecs(authored = {}) {
  const builtinDatasets = BUILTIN_DATASET_DEFINITIONS.map(cloneDatasetSpec);
  const builtinActions = BUILTIN_ACTION_DEFINITIONS.map(cloneActionSpec);
  const builtinMenus = BUILTIN_MENU_DEFINITIONS.map(cloneMenuSpec);
  const builtins = BUILTIN_SCREEN_DEFINITIONS.map(cloneScreenSpec);
  const builtinOverlays = BUILTIN_OVERLAY_DEFINITIONS.map(cloneOverlaySpec);
  const builtinViewports = BUILTIN_VIEWPORT_DEFINITIONS.map(cloneViewportSpec);
  const authoredThemesById = new Map();
  for (const theme of authored.themes) authoredThemesById.set(theme.id, cloneThemeSpec(theme));

  const datasetsById = new Map();
  for (const dataset of builtinDatasets) datasetsById.set(dataset.id, dataset);
  for (const dataset of authored.datasets) datasetsById.set(dataset.id, cloneDatasetSpec(dataset));
  const actionsById = new Map();
  for (const action of builtinActions) actionsById.set(action.id, action);
  for (const action of authored.actions ?? []) actionsById.set(action.id, cloneActionSpec(action));
  const menusById = new Map();
  for (const menu of builtinMenus) menusById.set(menu.id, menu);
  for (const menu of authored.menus ?? []) menusById.set(menu.id, cloneMenuSpec(menu));

  const authoredRightById = new Map();
  const authoredLeftById = new Map();
  for (const screen of authored.screens) {
    const cloned = cloneScreenSpec(screen);
    if (cloned.pane === "left") authoredLeftById.set(cloned.id, cloned);
    else authoredRightById.set(cloned.id, cloned);
  }
  const authoredSectionsById = new Map();
  for (const section of authored.sections) authoredSectionsById.set(section.id, cloneScreenSectionSpec(section));
  const authoredOverlaysById = new Map();
  for (const overlay of authored.overlays) authoredOverlaysById.set(overlay.id, cloneOverlaySpec(overlay));
  const authoredHandlesById = new Map();
  for (const handle of authored.handles) authoredHandlesById.set(handle.id, cloneHandleSpec(handle));
  const authoredSurfacesById = new Map();
  for (const surface of authored.surfaces) authoredSurfacesById.set(surface.id, cloneSurfaceSpec(surface));
  const authoredViewportsById = new Map();
  for (const viewport of authored.viewports) authoredViewportsById.set(viewport.id, cloneViewportSpec(viewport));
  const authoredLayoutsById = new Map();
  for (const layout of authored.layouts ?? []) authoredLayoutsById.set(layout.id, deepClone(layout));
  const authoredKeymapsById = new Map();
  for (const keymap of authored.keymaps ?? []) authoredKeymapsById.set(keymap.id, deepClone(keymap));
  const authoredSplitsById = new Map();
  for (const split of authored.splits ?? []) authoredSplitsById.set(split.id, cloneSplitSpec(split));
  const authoredPanelsById = new Map();
  for (const panel of authored.panels ?? []) authoredPanelsById.set(panel.id, clonePanelSpec(panel));
  const authoredContentsById = new Map();
  for (const content of authored.contents ?? []) authoredContentsById.set(content.id, cloneContentSpec(content));
  const authoredChromesById = new Map();
  for (const chrome of authored.chromes ?? []) authoredChromesById.set(chrome.id, cloneChromeSpec(chrome));
  const authoredWindowsById = new Map();
  for (const windowSpec of authored.windows ?? []) authoredWindowsById.set(windowSpec.id, cloneWindowSpec(windowSpec));
  const actions = [...actionsById.values()].map(action => {
    if (!VALID_ACTION_KINDS.has(action.kind)) {
      throw new Error(`operator_action ${action.id} invalid kind: ${action.kind}`);
    }
    if (action.kind === "builtin" && !VALID_BUILTIN_ACTIONS.has(action.builtin)) {
      throw new Error(`operator_action ${action.id} invalid builtin: ${action.builtin}`);
    }
    if (action.kind === "sequence" && !arrayWrap(action.steps).length) {
      throw new Error(`operator_action ${action.id} sequence requires step rows`);
    }
    if (action.overlayId && !authoredOverlaysById.has(action.overlayId) && !builtinOverlays.some(overlay => overlay.id === action.overlayId)) {
      throw new Error(`operator_action ${action.id} overlay not found: ${action.overlayId}`);
    }
    return cloneActionSpec(action);
  });
  for (const action of actions) {
    if (action.kind !== "sequence") continue;
    for (const stepId of action.steps) {
      if (!actionsById.has(stepId)) {
        throw new Error(`operator_action ${action.id} step not found: ${stepId}`);
      }
    }
  }
  const menus = [...menusById.values()].map(menu => {
    if (!arrayWrap(menu.itemActionIds).length) {
      throw new Error(`operator_menu ${menu.id} requires item actions`);
    }
    for (const actionId of menu.itemActionIds) {
      if (!actionsById.has(actionId)) {
        throw new Error(`operator_menu ${menu.id} action not found: ${actionId}`);
      }
    }
    return cloneMenuSpec(menu);
  });
  for (const dataset of datasetsById.values()) {
    if (dataset.primaryAction && !VALID_PRIMARY_ACTIONS.has(dataset.primaryAction) && !actionsById.has(dataset.primaryAction)) {
      throw new Error(`operator_dataset ${dataset.id} primary_action not found: ${dataset.primaryAction}`);
    }
  }
  const rightScreensById = new Map();
  for (const screen of builtins) rightScreensById.set(screen.id, screen);
  for (const screen of authoredRightById.values()) rightScreensById.set(screen.id, screen);
  const leftScreensById = new Map(authoredLeftById.entries());

  const orderedIds = [];
  const seen = new Set();
  for (const setup of authored.setupRows) {
    for (const id of setup.screens) {
      if (!rightScreensById.has(id) || seen.has(id)) continue;
      seen.add(id);
      orderedIds.push(id);
    }
  }
  for (const screen of authoredRightById.values()) {
    if (seen.has(screen.id)) continue;
    seen.add(screen.id);
    orderedIds.push(screen.id);
  }
  for (const screen of builtins) {
    if (seen.has(screen.id)) continue;
    seen.add(screen.id);
    orderedIds.push(screen.id);
  }

  const screens = orderedIds
    .map(id => rightScreensById.get(id))
    .filter(Boolean)
    .map(screen => {
      if (!VALID_RIGHT_SCREEN_SHAPES.has(screen.shape)) {
        throw new Error(`operator_screen ${screen.id} invalid right-pane shape: ${screen.shape}`);
      }
      const datasetId = screen.datasetId ?? builtinDatasetIdForProvider(screen.dataSource);
      if (!datasetId && !VALID_DATASET_PROVIDERS.has(screen.dataSource) && !arrayWrap(screen.sectionIds).length) {
        throw new Error(`operator_screen ${screen.id} requires dataset, data_source, or sections`);
      }
      if (datasetId && !datasetsById.has(datasetId)) {
        throw new Error(`operator_screen ${screen.id} dataset not found: ${datasetId}`);
      }
      const dataset = datasetId ? datasetsById.get(datasetId) : null;
      const sectionIds = Array.isArray(screen.sectionIds) ? screen.sectionIds : [];
      const sections = sectionIds
        .map((sectionId, declaredIndex) => {
          const section = authoredSectionsById.get(sectionId) ?? null;
          if (!section) throw new Error(`operator_screen ${screen.id} section not found: ${sectionId}`);
          if (section.screenId !== screen.id) {
            throw new Error(`operator_screen_section ${section.id} belongs to ${section.screenId}, not ${screen.id}`);
          }
          return {
            declaredIndex,
            section: normalizeResolvedScreenSection(section, datasetsById)
          };
        })
        .sort((left, right) =>
          (left.section.priority ?? Number.MAX_SAFE_INTEGER) - (right.section.priority ?? Number.MAX_SAFE_INTEGER)
          || left.declaredIndex - right.declaredIndex)
        .map(entry => entry.section);
      const defaultSectionId = screen.defaultSectionId ?? null;
      if (defaultSectionId && !sections.some(section => section.id === defaultSectionId)) {
        throw new Error(`operator_screen ${screen.id} default_section not found: ${defaultSectionId}`);
      }
      const leftScreenId = screen.leftScreenId ?? null;
      if (leftScreenId && !leftScreensById.has(leftScreenId)) {
        throw new Error(`operator_screen ${screen.id} left_screen not found: ${leftScreenId}`);
      }
      return {
        ...screen,
        datasetId: datasetId ?? null,
        dataSource: dataset?.provider ?? screen.dataSource ?? null,
        leftScreenId,
        defaultSectionId,
        sectionIds: [...sectionIds],
        sections
      };
    });

  const leftScreens = [...leftScreensById.values()].map(screen => {
    if (!VALID_LEFT_SCREEN_SHAPES.has(screen.shape)) {
      throw new Error(`operator_screen ${screen.id} invalid left-pane shape: ${screen.shape}`);
    }
    if (screen.shortcut) {
      throw new Error(`operator_screen ${screen.id} cannot declare shortcuts on pane=left`);
    }
    if (screen.leftScreenId) {
      throw new Error(`operator_screen ${screen.id} left_screen is only valid on pane=right`);
    }
    if (screen.defaultSectionId || arrayWrap(screen.sectionIds).length || arrayWrap(screen.sections).length) {
      throw new Error(`operator_screen ${screen.id} pane=left cannot declare sections`);
    }
    if (screen.shape === "tree") {
      if (screen.datasetId || screen.dataSource) {
        throw new Error(`operator_screen ${screen.id} pane=left shape=tree cannot declare dataset or data_source`);
      }
      return {
        ...screen,
        datasetId: null,
        dataSource: "navigation"
      };
    }
    const datasetId = screen.datasetId ?? builtinDatasetIdForProvider(screen.dataSource);
    if (!datasetId || !datasetsById.has(datasetId)) {
      throw new Error(`operator_screen ${screen.id} dataset not found: ${datasetId ?? "(none)"}`);
    }
    const dataset = datasetsById.get(datasetId);
    return {
      ...screen,
      datasetId,
      dataSource: dataset?.provider ?? screen.dataSource ?? null
    };
  });

  const overlaysById = new Map();
  for (const overlay of builtinOverlays) overlaysById.set(overlay.id, cloneOverlaySpec(overlay));
  for (const overlay of authoredOverlaysById.values()) overlaysById.set(overlay.id, cloneOverlaySpec(overlay));
  const overlays = [...overlaysById.values()].map(overlay => {
    if (!VALID_OVERLAY_KINDS.has(overlay.kind)) {
      throw new Error(`operator_overlay ${overlay.id} invalid kind: ${overlay.kind}`);
    }
    if (overlay.menuId && !menusById.has(overlay.menuId)) {
      throw new Error(`operator_overlay ${overlay.id} menu not found: ${overlay.menuId}`);
    }
    if (overlay.kind !== "menu" && overlay.menuId) {
      throw new Error(`operator_overlay ${overlay.id} menu is only valid on kind=menu`);
    }
    if (overlay.width !== null && overlay.width <= 0) {
      throw new Error(`operator_overlay ${overlay.id} width must be positive`);
    }
    if (overlay.height !== null && overlay.height <= 0) {
      throw new Error(`operator_overlay ${overlay.id} height must be positive`);
    }
    if (overlay.closeIdsOnOpen.some(candidate => candidate === overlay.id)) {
      throw new Error(`operator_overlay ${overlay.id} close_on_open cannot reference itself`);
    }
    for (const closeOverlayId of overlay.closeIdsOnOpen) {
      if (!overlaysById.has(closeOverlayId)) {
        throw new Error(`operator_overlay ${overlay.id} close_on_open overlay not found: ${closeOverlayId}`);
      }
    }
    return cloneOverlaySpec(overlay);
  });

  const handles = [...authoredHandlesById.values()].map(handle => {
    if (!VALID_HANDLE_KINDS.has(handle.kind)) {
      throw new Error(`operator_handle ${handle.id} invalid kind: ${handle.kind}`);
    }
    if (!VALID_HANDLE_AXES.has(handle.axis)) {
      throw new Error(`operator_handle ${handle.id} invalid axis: ${handle.axis}`);
    }
    if (handle.size !== null && handle.size <= 0) {
      throw new Error(`operator_handle ${handle.id} size must be positive`);
    }
    return cloneHandleSpec(handle);
  });

  const surfaces = [...authoredSurfacesById.values()].map(surface => {
    const isCanonicalPaneSurface = surface.origin === "canonical" && (surface.kind === "tree" || surface.kind === "text_reader");
    if (!VALID_SURFACE_KINDS.has(surface.kind) && !isCanonicalPaneSurface) {
      throw new Error(`operator_surface ${surface.id} invalid kind: ${surface.kind}`);
    }
    if (surface.width !== null && surface.width <= 0) {
      throw new Error(`operator_surface ${surface.id} width must be positive`);
    }
    if (surface.height !== null && surface.height <= 0) {
      throw new Error(`operator_surface ${surface.id} height must be positive`);
    }
    if (surface.maxPrimaryChars !== null && surface.maxPrimaryChars <= 0) {
      throw new Error(`operator_surface ${surface.id} max_primary_chars must be positive`);
    }
    return cloneSurfaceSpec(surface);
  });

  const themes = [...authoredThemesById.values()].map(theme => {
    if (!VALID_THEME_MODES.has(theme.mode)) {
      throw new Error(`operator_theme ${theme.id} invalid mode: ${theme.mode}`);
    }
    if (!optionalText(theme.palette)) {
      throw new Error(`operator_theme ${theme.id} palette is required`);
    }
    return cloneThemeSpec(theme);
  });

  const allViewportSpecs = new Map();
  for (const viewport of builtinViewports) allViewportSpecs.set(viewport.id, cloneViewportSpec(viewport));
  for (const viewport of authoredViewportsById.values()) allViewportSpecs.set(viewport.id, cloneViewportSpec(viewport));
  const viewports = [...allViewportSpecs.values()].map(viewport => {
    if (viewport.theme && !authoredThemesById.has(viewport.theme)) {
      throw new Error(`operator_viewport ${viewport.id} theme not found: ${viewport.theme}`);
    }
    if (viewport.screenId && !rightScreensById.has(viewport.screenId)) {
      throw new Error(`operator_viewport ${viewport.id} screen not found: ${viewport.screenId}`);
    }
    if (viewport.leftScreenId && !leftScreensById.has(viewport.leftScreenId)) {
      throw new Error(`operator_viewport ${viewport.id} left_screen not found: ${viewport.leftScreenId}`);
    }
    if (viewport.topSurfaceId && !authoredSurfacesById.has(viewport.topSurfaceId)) {
      throw new Error(`operator_viewport ${viewport.id} top_surface not found: ${viewport.topSurfaceId}`);
    }
    if (viewport.bottomSurfaceId && !authoredSurfacesById.has(viewport.bottomSurfaceId)) {
      throw new Error(`operator_viewport ${viewport.id} bottom_surface not found: ${viewport.bottomSurfaceId}`);
    }
    if (viewport.topHandleId && !authoredHandlesById.has(viewport.topHandleId)) {
      throw new Error(`operator_viewport ${viewport.id} top_handle not found: ${viewport.topHandleId}`);
    }
    if (viewport.bottomHandleId && !authoredHandlesById.has(viewport.bottomHandleId)) {
      throw new Error(`operator_viewport ${viewport.id} bottom_handle not found: ${viewport.bottomHandleId}`);
    }
    if (viewport.splitHandleId && !authoredHandlesById.has(viewport.splitHandleId)) {
      throw new Error(`operator_viewport ${viewport.id} split_handle not found: ${viewport.splitHandleId}`);
    }
    if (viewport.width !== null && viewport.width <= 0) {
      throw new Error(`operator_viewport ${viewport.id} width must be positive`);
    }
    if (viewport.height !== null && viewport.height <= 0) {
      throw new Error(`operator_viewport ${viewport.id} height must be positive`);
    }
    if (viewport.top !== null && viewport.top <= 0) {
      throw new Error(`operator_viewport ${viewport.id} top must be positive`);
    }
    if (viewport.bottom !== null && viewport.bottom <= 0) {
      throw new Error(`operator_viewport ${viewport.id} bottom must be positive`);
    }
    if (viewport.splitOrientation && !VALID_VIEWPORT_SPLIT_ORIENTATIONS.has(viewport.splitOrientation)) {
      throw new Error(`operator_viewport ${viewport.id} invalid split orientation: ${viewport.splitOrientation}`);
    }
    if (viewport.topSurfaceId) {
      const topSurface = authoredSurfacesById.get(viewport.topSurfaceId) ?? null;
      if (topSurface?.kind !== "status_bar") {
        throw new Error(`operator_viewport ${viewport.id} top_surface must resolve to kind=status_bar`);
      }
    }
    if (viewport.bottomSurfaceId) {
      const bottomSurface = authoredSurfacesById.get(viewport.bottomSurfaceId) ?? null;
      if (bottomSurface?.kind !== "command_bar") {
        throw new Error(`operator_viewport ${viewport.id} bottom_surface must resolve to kind=command_bar`);
      }
    }
    if (viewport.topHandleId) {
      const topHandle = authoredHandlesById.get(viewport.topHandleId) ?? null;
      if (topHandle?.axis !== "horizontal") {
        throw new Error(`operator_viewport ${viewport.id} top_handle must resolve to axis=horizontal`);
      }
    }
    if (viewport.bottomHandleId) {
      const bottomHandle = authoredHandlesById.get(viewport.bottomHandleId) ?? null;
      if (bottomHandle?.axis !== "horizontal") {
        throw new Error(`operator_viewport ${viewport.id} bottom_handle must resolve to axis=horizontal`);
      }
    }
    if (viewport.splitHandleId) {
      const splitHandle = authoredHandlesById.get(viewport.splitHandleId) ?? null;
      const expectedAxis = viewport.splitOrientation === "vertical" ? "horizontal" : "vertical";
      if (splitHandle?.axis !== expectedAxis) {
        throw new Error(`operator_viewport ${viewport.id} split_handle must resolve to axis=${expectedAxis}`);
      }
    }
    const seenOverlays = new Set();
    for (const overlayId of viewport.overlays) {
      if (seenOverlays.has(overlayId)) {
        throw new Error(`operator_viewport ${viewport.id} duplicate overlay reference: ${overlayId}`);
      }
      seenOverlays.add(overlayId);
      if (!overlaysById.has(overlayId)) {
        throw new Error(`operator_viewport ${viewport.id} overlay not found: ${overlayId}`);
      }
    }
    const seenTriggers = new Set();
    for (const binding of viewport.bindings) {
      if (!binding.trigger) throw new Error(`operator_viewport ${viewport.id} binding trigger is required`);
      if (!VALID_VIEWPORT_BINDING_VERBS.has(binding.verb)) {
        throw new Error(`operator_viewport ${viewport.id} invalid binding verb: ${binding.verb}`);
      }
      if (!binding.target) throw new Error(`operator_viewport ${viewport.id} binding target is required`);
      if (seenTriggers.has(binding.trigger)) {
        throw new Error(`operator_viewport ${viewport.id} duplicate binding trigger: ${binding.trigger}`);
      }
      seenTriggers.add(binding.trigger);
      if (binding.verb === "overlay" && !authoredOverlaysById.has(binding.target)) {
        if (overlaysById.has(binding.target)) continue;
        throw new Error(`operator_viewport ${viewport.id} binding overlay target not found: ${binding.target}`);
      }
      if (binding.verb === "action" && !actionsById.has(binding.target)) {
        throw new Error(`operator_viewport ${viewport.id} binding action target not found: ${binding.target}`);
      }
    }
    return cloneViewportSpec(viewport);
  });

  const shortcuts = new Map();
  for (const screen of builtins) {
    if (screen.shortcut) shortcuts.set(screen.shortcut, screen.id);
  }
  for (const screen of authoredRightById.values()) {
    if (screen.shortcut) shortcuts.set(screen.shortcut, screen.id);
  }
  for (const setup of authored.setupRows) {
    for (const row of setup.shortcuts) {
      if (!rightScreensById.has(row.screenId)) continue;
      shortcuts.set(row.shortcut, row.screenId);
    }
  }

  const shortcutRows = [...shortcuts.entries()]
    .map(([shortcut, screenId]) => {
      const screen = screens.find(candidate => candidate.id === screenId) ?? null;
      return screen ? { shortcut, screenId, title: screen.title, origin: screen.origin } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.shortcut.localeCompare(right.shortcut));

  const invalidDefaultLeftScreen = authored.setupRows.find(row => row.defaultLeftScreen && !leftScreensById.has(row.defaultLeftScreen)) ?? null;
  if (invalidDefaultLeftScreen?.defaultLeftScreen) {
    throw new Error(`operator_setup ${invalidDefaultLeftScreen.id} default_left_screen not found: ${invalidDefaultLeftScreen.defaultLeftScreen}`);
  }
  const invalidDefaultViewport = authored.setupRows.find(row => row.defaultViewport && !allViewportSpecs.has(row.defaultViewport)) ?? null;
  if (invalidDefaultViewport?.defaultViewport) {
    throw new Error(`operator_setup ${invalidDefaultViewport.id} default_viewport not found: ${invalidDefaultViewport.defaultViewport}`);
  }
  const defaultScreen = authored.setupRows.find(row => row.defaultScreen && rightScreensById.has(row.defaultScreen))?.defaultScreen ?? null;
  const defaultLeftScreen = authored.setupRows.find(row => row.defaultLeftScreen && leftScreensById.has(row.defaultLeftScreen))?.defaultLeftScreen ?? null;
  const defaultViewport = authored.setupRows.find(row => row.defaultViewport && allViewportSpecs.has(row.defaultViewport))?.defaultViewport
    ?? builtinViewports[0]?.id
    ?? null;
  return {
    themes,
    themesById: new Map(themes.map(theme => [theme.id, theme])),
    datasets: [...datasetsById.values()].map(cloneDatasetSpec),
    datasetsById,
    actions,
    actionsById: new Map(actions.map(action => [action.id, action])),
    menus,
    menusById: new Map(menus.map(menu => [menu.id, menu])),
    screens,
    screensById: new Map(screens.map(screen => [screen.id, screen])),
    leftScreens,
    leftScreensById: new Map(leftScreens.map(screen => [screen.id, screen])),
    overlays,
    overlaysById: new Map(overlays.map(overlay => [overlay.id, overlay])),
    handles,
    handlesById: new Map(handles.map(handle => [handle.id, handle])),
    surfaces,
    surfacesById: new Map(surfaces.map(surface => [surface.id, surface])),
    viewports,
    viewportsById: new Map(viewports.map(viewport => [viewport.id, viewport])),
    layouts: [...authoredLayoutsById.values()].map(layout => deepClone(layout)),
    layoutsById: new Map([...authoredLayoutsById.values()].map(layout => [layout.id, deepClone(layout)])),
    keymaps: [...authoredKeymapsById.values()].map(keymap => deepClone(keymap)),
    keymapsById: new Map([...authoredKeymapsById.values()].map(keymap => [keymap.id, deepClone(keymap)])),
    splits: [...authoredSplitsById.values()].map(cloneSplitSpec),
    splitsById: new Map([...authoredSplitsById.values()].map(split => [split.id, cloneSplitSpec(split)])),
    panels: [...authoredPanelsById.values()].map(clonePanelSpec),
    panelsById: new Map([...authoredPanelsById.values()].map(panel => [panel.id, clonePanelSpec(panel)])),
    contents: [...authoredContentsById.values()].map(cloneContentSpec),
    contentsById: new Map([...authoredContentsById.values()].map(content => [content.id, cloneContentSpec(content)])),
    chromes: [...authoredChromesById.values()].map(cloneChromeSpec),
    chromesById: new Map([...authoredChromesById.values()].map(chrome => [chrome.id, cloneChromeSpec(chrome)])),
    windows: [...authoredWindowsById.values()].map(cloneWindowSpec),
    windowsById: new Map([...authoredWindowsById.values()].map(windowSpec => [windowSpec.id, cloneWindowSpec(windowSpec)])),
    shortcuts,
    shortcutRows,
    defaultScreen,
    defaultLeftScreen,
    defaultViewport
  };
}

export function buildOperatorWorkbenchDefinition(appProject = null) {
  const authored = collectAuthoredOperatorWorkbenchSpecs(appProject?.authoredDesireDocs ?? []);
  return buildOperatorWorkbenchDefinitionFromSpecs(authored);
}

export function listOperatorScreenIds(appProject = null) {
  return buildOperatorWorkbenchDefinition(appProject).screens.map(screen => screen.id);
}
