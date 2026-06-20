const VALID_RIGHT_SCREEN_SHAPES = new Set(["detail", "list-detail", "table-detail"]);
const VALID_LEFT_SCREEN_SHAPES = new Set(["list", "table", "tree"]);
const VALID_SCREEN_SHAPES = new Set([...VALID_RIGHT_SCREEN_SHAPES, ...VALID_LEFT_SCREEN_SHAPES]);
const VALID_DATASET_PROVIDERS = new Set(["inspect", "references", "source", "provenance"]);
const VALID_SHORTCUTS = new Set(["F2", "F3", "F4", "F5", "F6", "F7", "F8"]);
const VALID_PRIMARY_ACTIONS = new Set(["open-link", "source-open", "provenance-open", "inspect-record", "none"]);
const VALID_SECTION_KINDS = new Set(["detail", "list", "table", "kv"]);
const VALID_SCREEN_PANES = new Set(["right", "left"]);

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

function normalizeShortcut(value) {
  const shortcut = optionalText(value)?.toUpperCase() ?? null;
  return shortcut && VALID_SHORTCUTS.has(shortcut) ? shortcut : null;
}

function normalizePrimaryAction(value) {
  const action = optionalText(value)?.toLowerCase() ?? null;
  return action && VALID_PRIMARY_ACTIONS.has(action) ? action : null;
}

function normalizeColumns(values) {
  return (Array.isArray(values) ? values : []).map(optionalText).filter(Boolean);
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
    primaryAction: normalizePrimaryAction(values.primaryAction ?? values.primary_action),
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
    defaultLeftScreen: optionalText(values.defaultLeftScreen) ?? optionalText(values.default_left_screen) ?? null
  };
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

export function collectAuthoredOperatorWorkbenchSpecs(authoredDesireDocs = []) {
  const datasets = [];
  const screens = [];
  const sections = [];
  const setupRows = [];
  for (const desire of authoredDesireDocs ?? []) {
    for (const residual of desire?.runtimeResiduals ?? []) {
      const kind = residual?.body?.declarationKind ?? null;
      if (kind === "operator_dataset") {
        const dataset = normalizeAuthoredDatasetSpec(residual);
        if (dataset) datasets.push(dataset);
      }
      if (kind === "operator_screen") {
        const screen = normalizeAuthoredScreenSpec(residual);
        if (screen) screens.push(screen);
      }
      if (kind === "operator_screen_section") {
        const section = normalizeAuthoredScreenSectionSpec(residual);
        if (section) sections.push(section);
      }
      if (kind === "operator_setup") {
        setupRows.push(normalizeAuthoredSetup(residual));
      }
    }
  }
  return {
    datasets,
    screens,
    sections,
    setupRows
  };
}

export function buildOperatorWorkbenchDefinition(appProject = null) {
  const authored = collectAuthoredOperatorWorkbenchSpecs(appProject?.authoredDesireDocs ?? []);
  const builtinDatasets = BUILTIN_DATASET_DEFINITIONS.map(cloneDatasetSpec);
  const builtins = BUILTIN_SCREEN_DEFINITIONS.map(cloneScreenSpec);

  const datasetsById = new Map();
  for (const dataset of builtinDatasets) datasetsById.set(dataset.id, dataset);
  for (const dataset of authored.datasets) datasetsById.set(dataset.id, cloneDatasetSpec(dataset));

  const authoredRightById = new Map();
  const authoredLeftById = new Map();
  for (const screen of authored.screens) {
    const cloned = cloneScreenSpec(screen);
    if (cloned.pane === "left") authoredLeftById.set(cloned.id, cloned);
    else authoredRightById.set(cloned.id, cloned);
  }
  const authoredSectionsById = new Map();
  for (const section of authored.sections) authoredSectionsById.set(section.id, cloneScreenSectionSpec(section));
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
  const defaultScreen = authored.setupRows.find(row => row.defaultScreen && rightScreensById.has(row.defaultScreen))?.defaultScreen ?? null;
  const defaultLeftScreen = authored.setupRows.find(row => row.defaultLeftScreen && leftScreensById.has(row.defaultLeftScreen))?.defaultLeftScreen ?? null;
  return {
    datasets: [...datasetsById.values()].map(cloneDatasetSpec),
    datasetsById,
    screens,
    screensById: new Map(screens.map(screen => [screen.id, screen])),
    leftScreens,
    leftScreensById: new Map(leftScreens.map(screen => [screen.id, screen])),
    shortcuts,
    shortcutRows,
    defaultScreen,
    defaultLeftScreen
  };
}

export function listOperatorScreenIds(appProject = null) {
  return buildOperatorWorkbenchDefinition(appProject).screens.map(screen => screen.id);
}
