const VALID_SHAPES = new Set(["detail", "list-detail", "table-detail"]);
const VALID_DATASET_PROVIDERS = new Set(["inspect", "references", "source", "provenance"]);
const VALID_SHORTCUTS = new Set(["F2", "F3", "F4", "F5", "F6", "F7", "F8"]);
const VALID_PRIMARY_ACTIONS = new Set(["open-link", "source-open", "provenance-open", "inspect-record", "none"]);
const VALID_SECTION_KINDS = new Set(["detail", "list", "table", "kv"]);

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

function parseOperatorScreen(form) {
  const parsed = pluginParsedData(form);
  if (parsed) return parsed;
  const bodyLines = formBodyLines(form);
  return {
    id: formName(form),
    title: readSimpleValue(bodyLines, "title"),
    subtitle: readSimpleValue(bodyLines, "subtitle"),
    shape: readSimpleValue(bodyLines, "shape") ?? "list-detail",
    dataset: readSimpleValue(bodyLines, "dataset"),
    dataSource: readSimpleValue(bodyLines, "data_source"),
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
    defaultScreen: readSimpleValue(bodyLines, "default_screen")
  };
}

function validateOperatorDataset(form) {
  const payload = parseOperatorDataset(form);
  if (!VALID_DATASET_PROVIDERS.has(String(payload.provider))) {
    throw new Error(`operator_dataset ${formName(form)} provider must be one of ${[...VALID_DATASET_PROVIDERS].join(", ")}`);
  }
  if (payload.primaryAction && !normalizePrimaryAction(payload.primaryAction)) {
    throw new Error(`operator_dataset ${formName(form)} primary_action must be one of ${[...VALID_PRIMARY_ACTIONS].join(", ")}`);
  }
}

function validateOperatorScreen(form) {
  const payload = parseOperatorScreen(form);
  if (!VALID_SHAPES.has(String(payload.shape))) {
    throw new Error(`operator_screen ${formName(form)} shape must be one of ${[...VALID_SHAPES].join(", ")}`);
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
    `  shape ${payload.shape ?? "list-detail"}`
  ];
  if (payload.dataset) lines.push(`  dataset ${payload.dataset}`);
  else lines.push(`  data_source ${payload.dataSource ?? "references"}`);
  if (payload.title) lines.push(`  title "${payload.title}"`);
  if (payload.subtitle) lines.push(`  subtitle "${payload.subtitle}"`);
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
  lines.push("}");
  return lines.join("\n");
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
        primaryAction: normalizePrimaryAction(values.primaryAction)
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
        shape: values.shape ?? "list-detail",
        dataset: values.dataset ?? null,
        dataSource: values.dataSource ?? null,
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
        defaultScreen: values.defaultScreen ?? null
      }, values.id, {
        pluginId: "plugin.operator-workbench"
      })
    ]
  };
}

export const operatorWorkbenchRvmForms = Object.freeze([
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
    kind: "operator_setup",
    parse: parseOperatorSetup,
    serialize: serializeOperatorSetup,
    validate: validateOperatorSetup,
    normalize: normalizeOperatorSetup
  })
]);
