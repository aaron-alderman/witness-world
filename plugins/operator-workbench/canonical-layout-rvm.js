const VALID_PANEL_ROLES = new Set(["left", "right", "aux"]);
const VALID_CONTENT_KINDS = new Set(["tree", "list", "table", "detail", "kv", "sectioned", "list-detail", "table-detail"]);
const VALID_SCREEN_SHAPES = new Set(["tree", "list", "table", "detail", "list-detail", "table-detail"]);
const VALID_SURFACE_KINDS = new Set(["tree", "text_reader", "status_bar", "command_bar"]);
const VALID_CHROME_KINDS = new Set(["status_bar", "command_bar"]);
const VALID_SPLIT_AXES = new Set(["horizontal", "vertical"]);
const VALID_DATASET_PROVIDERS = new Set(["inspect", "references", "source", "provenance"]);
const VALID_SHORTCUTS = new Set(["F2", "F3", "F4", "F5", "F6", "F7", "F8"]);
const VALID_BINDING_VERBS = new Set(["overlay", "action"]);
const VALID_SECTION_KINDS = new Set(["detail", "list", "table", "kv"]);
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
  if (/^-?\d+$/u.test(cleaned)) return Number(cleaned);
  return cleaned;
}

function readSimpleValue(bodyLines, key) {
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const match = trimmed.match(new RegExp(`^${escapeRegExp(key)}\\s+(.+)$`, "u"));
    if (match && !trimmed.endsWith("{")) return parseScalarValue(match[1]);
  }
  return null;
}

function readRepeatedSimpleValues(bodyLines, key) {
  const values = [];
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const match = trimmed.match(new RegExp(`^${escapeRegExp(key)}\\s+(.+)$`, "u"));
    if (match && !trimmed.endsWith("{")) values.push(parseScalarValue(match[1]));
  }
  return values;
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

function normalizeShortcut(value) {
  const shortcut = typeof value === "string" ? value.trim().toUpperCase() : "";
  return VALID_SHORTCUTS.has(shortcut) ? shortcut : null;
}

function parseBindings(bodyLines) {
  const bindings = [];
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^binding\s+([^\s]+)\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+([A-Za-z_][A-Za-z0-9_.:-]*)$/iu);
    if (!match) continue;
    bindings.push({
      trigger: match[1],
      verb: match[2],
      target: match[3]
    });
  }
  return bindings;
}

function isIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(String(value ?? "").trim());
}

function serializeList(lines, key, values = []) {
  for (const value of values ?? []) lines.push(`  ${key} ${value}`);
}

function serializeQuoted(lines, key, value) {
  if (value !== undefined && value !== null && value !== "") lines.push(`  ${key} "${value}"`);
}

function serializeScalar(lines, key, value) {
  if (value !== undefined && value !== null && value !== "") lines.push(`  ${key} ${value}`);
}

function parseOperatorSplit(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    axis: readSimpleValue(bodyLines, "axis") ?? "horizontal",
    first: readSimpleValue(bodyLines, "first"),
    second: readSimpleValue(bodyLines, "second"),
    firstWeight: readSimpleValue(bodyLines, "first_weight"),
    secondWeight: readSimpleValue(bodyLines, "second_weight"),
    handle: readSimpleValue(bodyLines, "handle")
  };
}

function parseOperatorPanel(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    subtitle: readSimpleValue(bodyLines, "subtitle"),
    role: readSimpleValue(bodyLines, "role") ?? "aux",
    content: readSimpleValue(bodyLines, "content"),
    shortcut: readSimpleValue(bodyLines, "shortcut")
  };
}

function parseOperatorContent(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    subtitle: readSimpleValue(bodyLines, "subtitle"),
    kind: readSimpleValue(bodyLines, "kind") ?? "detail",
    screenShape: readSimpleValue(bodyLines, "screen_shape"),
    surfaceKind: readSimpleValue(bodyLines, "surface_kind"),
    dataset: readSimpleValue(bodyLines, "dataset"),
    dataSource: readSimpleValue(bodyLines, "data_source"),
    leftPanel: readSimpleValue(bodyLines, "left_panel"),
    helpText: readSimpleValue(bodyLines, "help"),
    emptyMessage: readSimpleValue(bodyLines, "empty_message"),
    rowFilterKind: readSimpleValue(bodyLines, "row_filter_kind"),
    rowFilterAction: readSimpleValue(bodyLines, "row_filter_action"),
    shortcut: readSimpleValue(bodyLines, "shortcut"),
    defaultSection: readSimpleValue(bodyLines, "default_section"),
    sections: readRepeatedSimpleValues(bodyLines, "section").map(String),
    columns: readRepeatedSimpleValues(bodyLines, "column").map(String),
    collapsible: readSimpleValue(bodyLines, "collapsible"),
    collapsed: readSimpleValue(bodyLines, "collapsed"),
    priority: readSimpleValue(bodyLines, "priority"),
    maxPrimaryChars: readSimpleValue(bodyLines, "max_primary_chars"),
    width: readSimpleValue(bodyLines, "width"),
    height: readSimpleValue(bodyLines, "height"),
    resizable: readSimpleValue(bodyLines, "resizable"),
    closeIdsOnOpen: readRepeatedSimpleValues(bodyLines, "close_on_open").map(String),
    scroll: readRepeatedSimpleValues(bodyLines, "scroll").map(String)
  };
}

function parseOperatorChrome(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    kind: readSimpleValue(bodyLines, "kind") ?? "status_bar",
    content: readSimpleValue(bodyLines, "content")
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
    steps: readRepeatedSimpleValues(bodyLines, "step").map(String)
  };
}

function parseOperatorMenu(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    items: readRepeatedSimpleValues(bodyLines, "item").map(String)
  };
}

function parseOperatorWindow(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    theme: readSimpleValue(bodyLines, "theme"),
    root: readSimpleValue(bodyLines, "root"),
    leftPanel: readSimpleValue(bodyLines, "left_panel"),
    rightPanel: readSimpleValue(bodyLines, "right_panel"),
    topChrome: readSimpleValue(bodyLines, "top_chrome"),
    bottomChrome: readSimpleValue(bodyLines, "bottom_chrome"),
    topHandle: readSimpleValue(bodyLines, "top_handle"),
    bottomHandle: readSimpleValue(bodyLines, "bottom_handle"),
    width: readSimpleValue(bodyLines, "width"),
    height: readSimpleValue(bodyLines, "height"),
    top: readSimpleValue(bodyLines, "top"),
    bottom: readSimpleValue(bodyLines, "bottom"),
    overlays: readRepeatedSimpleValues(bodyLines, "overlay").map(String),
    bindings: parseBindings(bodyLines)
  };
}

function validateOperatorSplit(form) {
  const payload = parseOperatorSplit(form);
  if (!VALID_SPLIT_AXES.has(String(payload.axis))) {
    throw new Error(`operator_split ${formName(form)} axis must be one of ${[...VALID_SPLIT_AXES].join(", ")}`);
  }
  if (!cleanValue(payload.first) || !cleanValue(payload.second)) {
    throw new Error(`operator_split ${formName(form)} must declare first and second`);
  }
}

function validateOperatorPanel(form) {
  const payload = parseOperatorPanel(form);
  if (!VALID_PANEL_ROLES.has(String(payload.role))) {
    throw new Error(`operator_panel ${formName(form)} role must be one of ${[...VALID_PANEL_ROLES].join(", ")}`);
  }
  if (!cleanValue(payload.content)) {
    throw new Error(`operator_panel ${formName(form)} must declare content`);
  }
  if (payload.shortcut && !normalizeShortcut(payload.shortcut)) {
    throw new Error(`operator_panel ${formName(form)} shortcut must be one of ${[...VALID_SHORTCUTS].join(", ")}`);
  }
}

function validateOperatorContent(form) {
  const payload = parseOperatorContent(form);
  if (!VALID_CONTENT_KINDS.has(String(payload.kind))) {
    throw new Error(`operator_content ${formName(form)} kind must be one of ${[...VALID_CONTENT_KINDS].join(", ")}`);
  }
  if (payload.screenShape && !VALID_SCREEN_SHAPES.has(String(payload.screenShape))) {
    throw new Error(`operator_content ${formName(form)} screen_shape must be one of ${[...VALID_SCREEN_SHAPES].join(", ")}`);
  }
  if (payload.surfaceKind && !VALID_SURFACE_KINDS.has(String(payload.surfaceKind))) {
    throw new Error(`operator_content ${formName(form)} surface_kind must be one of ${[...VALID_SURFACE_KINDS].join(", ")}`);
  }
  if (payload.kind === "sectioned" && !(Array.isArray(payload.sections) && payload.sections.length)) {
    throw new Error(`operator_content ${formName(form)} kind sectioned requires section rows`);
  }
  if (payload.defaultSection && !(payload.sections ?? []).includes(payload.defaultSection)) {
    throw new Error(`operator_content ${formName(form)} default_section must match a declared section`);
  }
  if (payload.kind !== "tree" && !payload.dataset && payload.dataSource && !VALID_DATASET_PROVIDERS.has(String(payload.dataSource))) {
    throw new Error(`operator_content ${formName(form)} data_source must be one of ${[...VALID_DATASET_PROVIDERS].join(", ")}`);
  }
  if (payload.kind === "tree" && (payload.dataset || payload.dataSource)) {
    throw new Error(`operator_content ${formName(form)} kind tree cannot declare dataset or data_source`);
  }
  if (payload.collapsible !== null && payload.collapsible !== undefined && typeof payload.collapsible !== "boolean") {
    throw new Error(`operator_content ${formName(form)} collapsible must be true or false`);
  }
  if (payload.collapsed !== null && payload.collapsed !== undefined && typeof payload.collapsed !== "boolean") {
    throw new Error(`operator_content ${formName(form)} collapsed must be true or false`);
  }
}

function validateOperatorChrome(form) {
  const payload = parseOperatorChrome(form);
  if (!VALID_CHROME_KINDS.has(String(payload.kind))) {
    throw new Error(`operator_chrome ${formName(form)} kind must be one of ${[...VALID_CHROME_KINDS].join(", ")}`);
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
    if (payload.screen && !isIdentifier(payload.screen)) {
      throw new Error(`operator_action ${formName(form)} screen must be an identifier`);
    }
    if (payload.overlay && !isIdentifier(payload.overlay)) {
      throw new Error(`operator_action ${formName(form)} overlay must be an identifier`);
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

function validateOperatorWindow(form) {
  const payload = parseOperatorWindow(form);
  if (!cleanValue(payload.root)) {
    throw new Error(`operator_window ${formName(form)} must declare root`);
  }
  if (payload.width !== null && payload.width !== undefined && (!Number.isInteger(payload.width) || payload.width <= 0)) {
    throw new Error(`operator_window ${formName(form)} width must be a positive integer`);
  }
  if (payload.height !== null && payload.height !== undefined && (!Number.isInteger(payload.height) || payload.height <= 0)) {
    throw new Error(`operator_window ${formName(form)} height must be a positive integer`);
  }
  for (const binding of payload.bindings ?? []) {
    if (!binding.trigger?.trim()) throw new Error(`operator_window ${formName(form)} binding trigger is required`);
    if (!VALID_BINDING_VERBS.has(String(binding.verb))) {
      throw new Error(`operator_window ${formName(form)} binding verb must be one of ${[...VALID_BINDING_VERBS].join(", ")}`);
    }
    if (!binding.target?.trim()) throw new Error(`operator_window ${formName(form)} binding target is required`);
  }
}

function serializeOperatorSplit(payload) {
  const lines = [`operator_split ${payload.id} {`];
  serializeQuoted(lines, "title", payload.title);
  serializeScalar(lines, "axis", payload.axis ?? "horizontal");
  serializeScalar(lines, "first", payload.first);
  serializeScalar(lines, "second", payload.second);
  serializeScalar(lines, "first_weight", payload.firstWeight);
  serializeScalar(lines, "second_weight", payload.secondWeight);
  serializeScalar(lines, "handle", payload.handle);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorPanel(payload) {
  const lines = [`operator_panel ${payload.id} {`];
  serializeQuoted(lines, "title", payload.title);
  serializeQuoted(lines, "subtitle", payload.subtitle);
  serializeScalar(lines, "role", payload.role ?? "aux");
  serializeScalar(lines, "content", payload.content);
  serializeScalar(lines, "shortcut", payload.shortcut);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorContent(payload) {
  const lines = [`operator_content ${payload.id} {`];
  serializeQuoted(lines, "title", payload.title);
  serializeQuoted(lines, "subtitle", payload.subtitle);
  serializeScalar(lines, "kind", payload.kind ?? "detail");
  serializeScalar(lines, "screen_shape", payload.screenShape);
  serializeScalar(lines, "surface_kind", payload.surfaceKind);
  serializeScalar(lines, "dataset", payload.dataset);
  if (!payload.dataset) serializeScalar(lines, "data_source", payload.dataSource);
  serializeScalar(lines, "left_panel", payload.leftPanel);
  serializeQuoted(lines, "help", payload.helpText);
  serializeQuoted(lines, "empty_message", payload.emptyMessage);
  serializeScalar(lines, "row_filter_kind", payload.rowFilterKind);
  serializeScalar(lines, "row_filter_action", payload.rowFilterAction);
  serializeScalar(lines, "shortcut", payload.shortcut);
  serializeScalar(lines, "default_section", payload.defaultSection);
  serializeList(lines, "section", payload.sections);
  serializeList(lines, "column", payload.columns);
  serializeScalar(lines, "collapsible", payload.collapsible);
  serializeScalar(lines, "collapsed", payload.collapsed);
  serializeScalar(lines, "priority", payload.priority);
  serializeScalar(lines, "max_primary_chars", payload.maxPrimaryChars);
  serializeScalar(lines, "width", payload.width);
  serializeScalar(lines, "height", payload.height);
  serializeScalar(lines, "resizable", payload.resizable);
  serializeList(lines, "close_on_open", payload.closeIdsOnOpen);
  serializeList(lines, "scroll", payload.scroll);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorChrome(payload) {
  const lines = [`operator_chrome ${payload.id} {`];
  serializeQuoted(lines, "title", payload.title);
  serializeScalar(lines, "kind", payload.kind ?? "status_bar");
  serializeScalar(lines, "content", payload.content);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorAction(payload) {
  const lines = [`operator_action ${payload.id} {`];
  serializeQuoted(lines, "title", payload.title);
  serializeScalar(lines, "kind", payload.kind);
  serializeScalar(lines, "builtin", payload.builtin);
  serializeScalar(lines, "overlay", payload.overlay);
  serializeScalar(lines, "screen", payload.screen);
  serializeScalar(lines, "pane", payload.pane);
  serializeQuoted(lines, "message", payload.message);
  serializeList(lines, "step", payload.steps);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorMenu(payload) {
  const lines = [`operator_menu ${payload.id} {`];
  serializeQuoted(lines, "title", payload.title);
  serializeList(lines, "item", payload.items);
  lines.push("}");
  return lines.join("\n");
}

function serializeOperatorWindow(payload) {
  const lines = [`operator_window ${payload.id} {`];
  serializeQuoted(lines, "title", payload.title);
  serializeScalar(lines, "theme", payload.theme);
  serializeScalar(lines, "root", payload.root);
  serializeScalar(lines, "left_panel", payload.leftPanel);
  serializeScalar(lines, "right_panel", payload.rightPanel);
  serializeScalar(lines, "top_chrome", payload.topChrome);
  serializeScalar(lines, "bottom_chrome", payload.bottomChrome);
  serializeScalar(lines, "top_handle", payload.topHandle);
  serializeScalar(lines, "bottom_handle", payload.bottomHandle);
  serializeScalar(lines, "width", payload.width);
  serializeScalar(lines, "height", payload.height);
  serializeScalar(lines, "top", payload.top);
  serializeScalar(lines, "bottom", payload.bottom);
  serializeList(lines, "overlay", payload.overlays);
  for (const binding of payload.bindings ?? []) {
    if (!binding?.trigger || !binding?.verb || !binding?.target) continue;
    lines.push(`  binding ${binding.trigger} ${binding.verb} ${binding.target}`);
  }
  lines.push("}");
  return lines.join("\n");
}

function normalizeOperatorSplit(node, context) {
  const values = parseOperatorSplit(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_split", {
        id: values.id,
        title: values.title ?? values.id,
        axis: values.axis ?? "horizontal",
        first: values.first ?? null,
        second: values.second ?? null,
        firstWeight: values.firstWeight ?? null,
        secondWeight: values.secondWeight ?? null,
        handle: values.handle ?? null
      }, values.id, { pluginId: "plugin.operator-workbench" })
    ]
  };
}

function normalizeOperatorPanel(node, context) {
  const values = parseOperatorPanel(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_panel", {
        id: values.id,
        title: values.title ?? values.id,
        subtitle: values.subtitle ?? null,
        role: values.role ?? "aux",
        content: values.content ?? null,
        shortcut: normalizeShortcut(values.shortcut)
      }, values.id, { pluginId: "plugin.operator-workbench" })
    ]
  };
}

function normalizeOperatorContent(node, context) {
  const values = parseOperatorContent(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_content", {
        id: values.id,
        title: values.title ?? values.id,
        subtitle: values.subtitle ?? null,
        kind: values.kind ?? "detail",
        screenShape: values.screenShape ?? null,
        surfaceKind: values.surfaceKind ?? null,
        dataset: values.dataset ?? null,
        dataSource: values.dataSource ?? null,
        leftPanel: values.leftPanel ?? null,
        helpText: values.helpText ?? null,
        emptyMessage: values.emptyMessage ?? null,
        rowFilterKind: values.rowFilterKind ?? null,
        rowFilterAction: values.rowFilterAction ?? null,
        shortcut: normalizeShortcut(values.shortcut),
        defaultSection: values.defaultSection ?? null,
        sections: Array.isArray(values.sections) ? values.sections : [],
        columns: Array.isArray(values.columns) ? values.columns : [],
        collapsible: values.collapsible ?? null,
        collapsed: values.collapsed ?? null,
        priority: values.priority ?? null,
        maxPrimaryChars: values.maxPrimaryChars ?? null,
        width: values.width ?? null,
        height: values.height ?? null,
        resizable: values.resizable ?? null,
        closeIdsOnOpen: Array.isArray(values.closeIdsOnOpen) ? values.closeIdsOnOpen : [],
        scroll: Array.isArray(values.scroll) ? values.scroll : []
      }, values.id, { pluginId: "plugin.operator-workbench" })
    ]
  };
}

function normalizeOperatorChrome(node, context) {
  const values = parseOperatorChrome(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_chrome", {
        id: values.id,
        title: values.title ?? values.id,
        kind: values.kind ?? "status_bar",
        content: values.content ?? null
      }, values.id, { pluginId: "plugin.operator-workbench" })
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
      }, values.id, { pluginId: "plugin.operator-workbench" })
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
      }, values.id, { pluginId: "plugin.operator-workbench" })
    ]
  };
}

function normalizeOperatorWindow(node, context) {
  const values = parseOperatorWindow(node.payload);
  return {
    nodes: [],
    runtimeResiduals: [
      context.createRuntimeDeclarationResidual("operator_window", {
        id: values.id,
        title: values.title ?? values.id,
        theme: values.theme ?? null,
        root: values.root ?? null,
        leftPanel: values.leftPanel ?? null,
        rightPanel: values.rightPanel ?? null,
        topChrome: values.topChrome ?? null,
        bottomChrome: values.bottomChrome ?? null,
        topHandle: values.topHandle ?? null,
        bottomHandle: values.bottomHandle ?? null,
        width: values.width ?? null,
        height: values.height ?? null,
        top: values.top ?? null,
        bottom: values.bottom ?? null,
        overlays: Array.isArray(values.overlays) ? values.overlays : [],
        bindings: Array.isArray(values.bindings) ? values.bindings : []
      }, values.id, { pluginId: "plugin.operator-workbench" })
    ]
  };
}

export const canonicalOperatorWorkbenchRvmForms = Object.freeze([
  Object.freeze({
    kind: "operator_split",
    parse: parseOperatorSplit,
    serialize: serializeOperatorSplit,
    validate: validateOperatorSplit,
    normalize: normalizeOperatorSplit
  }),
  Object.freeze({
    kind: "operator_panel",
    parse: parseOperatorPanel,
    serialize: serializeOperatorPanel,
    validate: validateOperatorPanel,
    normalize: normalizeOperatorPanel
  }),
  Object.freeze({
    kind: "operator_content",
    parse: parseOperatorContent,
    serialize: serializeOperatorContent,
    validate: validateOperatorContent,
    normalize: normalizeOperatorContent
  }),
  Object.freeze({
    kind: "operator_chrome",
    parse: parseOperatorChrome,
    serialize: serializeOperatorChrome,
    validate: validateOperatorChrome,
    normalize: normalizeOperatorChrome
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
    kind: "operator_window",
    parse: parseOperatorWindow,
    serialize: serializeOperatorWindow,
    validate: validateOperatorWindow,
    normalize: normalizeOperatorWindow
  })
]);
