import fs from "node:fs/promises";
import { operatorWorkbenchRvmForms } from "../desire-rvm.js";
import { collectAuthoredOperatorWorkbenchSpecs } from "../operator-screen-specs.js";
import {
  normalizeOperatorWorkbenchKeymapRecord,
  normalizeOperatorWorkbenchLayoutRecord
} from "./settings.js";

const FORM_SERIALIZERS = new Map(
  operatorWorkbenchRvmForms.map(form => [form.kind, form.serialize])
);

function clone(value) {
  return value && typeof value === "object" ? structuredClone(value) : value;
}

function stableById(rows = []) {
  return [...rows].sort((left, right) =>
    String(left?.id ?? left?.name ?? "").localeCompare(String(right?.id ?? right?.name ?? ""))
  );
}

function serializeForm(kind, payload) {
  const serialize = FORM_SERIALIZERS.get(kind);
  if (typeof serialize !== "function") {
    throw new Error(`operator workbench serializer not found for ${kind}`);
  }
  return serialize(payload);
}

function layoutPayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    viewportId: spec.viewportId ?? null,
    focusedPanelId: spec.focusedPanelId ?? null,
    root: clone(spec.root),
    panels: clone(spec.panels ?? {}),
    savedAt: spec.savedAt ?? null
  };
}

function keymapPayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    bindings: clone(spec.bindings ?? {}),
    panelPrimaryActions: clone(spec.panelPrimaryActions ?? {}),
    panelSecondaryMenus: clone(spec.panelSecondaryMenus ?? {}),
    savedAt: spec.savedAt ?? null
  };
}

function actionPayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    kind: spec.kind,
    builtin: spec.builtin ?? null,
    overlay: spec.overlayId ?? null,
    screen: spec.screenId ?? null,
    pane: spec.pane ?? null,
    message: spec.message ?? null,
    steps: [...(spec.steps ?? [])]
  };
}

function menuPayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    items: [...(spec.itemActionIds ?? [])]
  };
}

function screenPayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    pane: spec.pane ?? "right",
    shape: spec.shape,
    dataset: spec.datasetId ?? null,
    dataSource: spec.datasetId ? null : (spec.dataSource ?? null),
    title: spec.title ?? spec.id,
    subtitle: spec.subtitle ?? null,
    leftScreen: spec.leftScreenId ?? null,
    helpText: spec.helpText ?? null,
    emptyMessage: spec.emptyMessage ?? null,
    rowFilterKind: spec.rowFilterKind ?? null,
    rowFilterAction: spec.rowFilterAction ?? null,
    shortcut: spec.shortcut ?? null,
    priority: spec.priority ?? null,
    defaultSection: spec.defaultSectionId ?? null,
    sections: [...(spec.sectionIds ?? [])]
  };
}

function screenSectionPayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    screen: spec.screenId,
    kind: spec.kind,
    dataset: spec.datasetId ?? null,
    dataSource: spec.datasetId ? null : (spec.dataSource ?? null),
    title: spec.title ?? spec.id,
    columns: [...(spec.columns ?? [])],
    emptyMessage: spec.emptyMessage ?? null,
    collapsible: spec.collapsible ?? null,
    collapsed: spec.collapsed ?? null,
    rowFilterKind: spec.rowFilterKind ?? null,
    rowFilterAction: spec.rowFilterAction ?? null,
    priority: spec.priority ?? null
  };
}

function overlayPayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    kind: spec.kind,
    title: spec.title ?? spec.id,
    menu: spec.menuId ?? null,
    width: spec.width ?? null,
    height: spec.height ?? null,
    resizable: spec.resizable ?? null,
    closeIdsOnOpen: [...(spec.closeIdsOnOpen ?? [])],
    scroll: [...(spec.scroll ?? [])]
  };
}

function handlePayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    kind: spec.kind,
    axis: spec.axis ?? null,
    title: spec.title ?? spec.id,
    size: spec.size ?? null,
    draggable: spec.draggable ?? null
  };
}

function surfacePayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    kind: spec.kind,
    title: spec.title ?? spec.id,
    width: spec.width ?? null,
    height: spec.height ?? null,
    resizable: spec.resizable ?? null,
    maxPrimaryChars: spec.maxPrimaryChars ?? null,
    scroll: [...(spec.scroll ?? [])]
  };
}

function viewportPayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    theme: spec.theme ?? null,
    screen: spec.screenId ?? null,
    leftScreen: spec.leftScreenId ?? null,
    topSurface: spec.topSurfaceId ?? null,
    bottomSurface: spec.bottomSurfaceId ?? null,
    topHandle: spec.topHandleId ?? null,
    bottomHandle: spec.bottomHandleId ?? null,
    splitHandle: spec.splitHandleId ?? null,
    width: spec.width ?? null,
    height: spec.height ?? null,
    top: spec.top ?? null,
    bottom: spec.bottom ?? null,
    splitOrientation: spec.splitOrientation ?? null,
    leftWeight: spec.leftWeight ?? null,
    rightWeight: spec.rightWeight ?? null,
    overlays: [...(spec.overlays ?? [])],
    bindings: [...(spec.bindings ?? [])]
  };
}

function splitPayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    axis: spec.axis ?? "horizontal",
    first: spec.first ?? null,
    second: spec.second ?? null,
    firstWeight: spec.firstWeight ?? null,
    secondWeight: spec.secondWeight ?? null,
    handle: spec.handle ?? null
  };
}

function panelPayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    subtitle: spec.subtitle ?? null,
    role: spec.role ?? "aux",
    content: spec.contentId ?? null,
    shortcut: spec.shortcut ?? null
  };
}

function contentPayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    subtitle: spec.subtitle ?? null,
    kind: spec.kind,
    screenShape: spec.screenShape ?? null,
    surfaceKind: spec.surfaceKind ?? null,
    dataset: spec.datasetId ?? null,
    dataSource: spec.datasetId ? null : (spec.dataSource ?? null),
    leftPanel: spec.leftPanelId ?? null,
    helpText: spec.helpText ?? null,
    emptyMessage: spec.emptyMessage ?? null,
    rowFilterKind: spec.rowFilterKind ?? null,
    rowFilterAction: spec.rowFilterAction ?? null,
    shortcut: spec.shortcut ?? null,
    defaultSection: spec.defaultSectionId ?? null,
    sections: [...(spec.sectionIds ?? [])],
    columns: [...(spec.columns ?? [])],
    collapsible: spec.collapsible ?? null,
    collapsed: spec.collapsed ?? null,
    priority: spec.priority ?? null,
    maxPrimaryChars: spec.maxPrimaryChars ?? null,
    width: spec.width ?? null,
    height: spec.height ?? null,
    resizable: spec.resizable ?? null,
    closeIdsOnOpen: [...(spec.closeIdsOnOpen ?? [])],
    scroll: [...(spec.scroll ?? [])]
  };
}

function chromePayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    kind: spec.kind,
    content: spec.contentId ?? null
  };
}

function windowPayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    title: spec.title ?? spec.id,
    theme: spec.theme ?? null,
    root: spec.rootSplitId ?? null,
    leftPanel: spec.leftPanelId ?? null,
    rightPanel: spec.rightPanelId ?? null,
    topChrome: spec.topChromeId ?? null,
    bottomChrome: spec.bottomChromeId ?? null,
    topHandle: spec.topHandleId ?? null,
    bottomHandle: spec.bottomHandleId ?? null,
    width: spec.width ?? null,
    height: spec.height ?? null,
    top: spec.top ?? null,
    bottom: spec.bottom ?? null,
    overlays: [...(spec.overlays ?? [])],
    bindings: [...(spec.bindings ?? [])]
  };
}

function setupPayloadFromSpec(spec = {}) {
  return {
    id: spec.id,
    screens: [...(spec.screens ?? [])],
    shortcuts: [...(spec.shortcuts ?? [])],
    defaultScreen: spec.defaultScreen ?? null,
    defaultLeftScreen: spec.defaultLeftScreen ?? null,
    defaultViewport: spec.defaultViewport ?? null
  };
}

function serializeOperatorWorkbenchSpecs(specs = {}) {
  const blocks = [];
  for (const theme of stableById(specs.themes)) blocks.push(serializeForm("operator_theme", clone(theme)));
  for (const dataset of stableById(specs.datasets)) blocks.push(serializeForm("operator_dataset", clone(dataset)));
  for (const action of stableById(specs.actions)) blocks.push(serializeForm("operator_action", actionPayloadFromSpec(action)));
  for (const menu of stableById(specs.menus)) blocks.push(serializeForm("operator_menu", menuPayloadFromSpec(menu)));
  for (const screen of stableById(specs.screens)) blocks.push(serializeForm("operator_screen", screenPayloadFromSpec(screen)));
  for (const section of stableById(specs.sections)) blocks.push(serializeForm("operator_screen_section", screenSectionPayloadFromSpec(section)));
  for (const overlay of stableById(specs.overlays)) blocks.push(serializeForm("operator_overlay", overlayPayloadFromSpec(overlay)));
  for (const handle of stableById(specs.handles)) blocks.push(serializeForm("operator_handle", handlePayloadFromSpec(handle)));
  for (const surface of stableById(specs.surfaces)) blocks.push(serializeForm("operator_surface", surfacePayloadFromSpec(surface)));
  for (const viewport of stableById(specs.viewports)) blocks.push(serializeForm("operator_viewport", viewportPayloadFromSpec(viewport)));
  for (const split of stableById(specs.splits)) blocks.push(serializeForm("operator_split", splitPayloadFromSpec(split)));
  for (const panel of stableById(specs.panels)) blocks.push(serializeForm("operator_panel", panelPayloadFromSpec(panel)));
  for (const content of stableById(specs.contents)) blocks.push(serializeForm("operator_content", contentPayloadFromSpec(content)));
  for (const chrome of stableById(specs.chromes)) blocks.push(serializeForm("operator_chrome", chromePayloadFromSpec(chrome)));
  for (const windowSpec of stableById(specs.windows)) blocks.push(serializeForm("operator_window", windowPayloadFromSpec(windowSpec)));
  for (const layout of stableById(specs.layouts)) blocks.push(serializeForm("operator_layout", layoutPayloadFromSpec(layout)));
  for (const keymap of stableById(specs.keymaps)) blocks.push(serializeForm("operator_keymap", keymapPayloadFromSpec(keymap)));
  for (const setup of stableById(specs.setupRows)) blocks.push(serializeForm("operator_setup", setupPayloadFromSpec(setup)));
  return `${blocks.join("\n\n")}\n`;
}

function collectOperatorSourceFiles(appProject = null) {
  const files = [];
  for (const desire of appProject?.authoredDesireDocs ?? []) {
    for (const residual of desire?.runtimeResiduals ?? []) {
      const kind = String(residual?.body?.declarationKind ?? "");
      if (!kind.startsWith("operator_")) continue;
      const file = String(residual?.body?.file ?? "").trim();
      if (file) files.push(file);
    }
  }
  return [...new Set(files)];
}

export function resolveOperatorWorkbenchAuthoringFile(appProject = null) {
  const files = collectOperatorSourceFiles(appProject);
  if (!files.length) return null;
  if (files.length > 1) {
    throw new Error(`operator workbench authoring requires a single source file, found: ${files.join(", ")}`);
  }
  return files[0];
}

function authoringStateFromSpecs(specs = {}) {
  return {
    specs: clone(specs),
    layouts: Object.fromEntries(
      stableById(specs.layouts ?? []).map(layout => [layout.id, normalizeOperatorWorkbenchLayoutRecord(layout, layout.id)])
    ),
    keymaps: Object.fromEntries(
      stableById(specs.keymaps ?? []).map(keymap => [keymap.id, normalizeOperatorWorkbenchKeymapRecord(keymap, keymap.id)])
    ),
    panels: Object.fromEntries(
      stableById(specs.panels ?? []).map(panel => [panel.id, clone(panel)])
    ),
    contents: Object.fromEntries(
      stableById(specs.contents ?? []).map(content => [content.id, clone(content)])
    )
  };
}

function nextSpecsWithCatalog(baseSpecs, { layouts, keymaps, panels, contents }) {
  return {
    ...baseSpecs,
    layouts: stableById(Object.values(layouts).map(layout => {
      const normalized = normalizeOperatorWorkbenchLayoutRecord(layout, layout.name ?? layout.id);
      return {
        ...normalized,
        id: normalized.name
      };
    })),
    keymaps: stableById(Object.values(keymaps).map(keymap => {
      const normalized = normalizeOperatorWorkbenchKeymapRecord(keymap, keymap.name ?? keymap.id);
      return {
        ...normalized,
        id: normalized.name
      };
    })),
    panels: stableById(Object.values(panels).map(panel => ({
      ...clone(panel),
      id: panel.id
    }))),
    contents: stableById(Object.values(contents).map(content => ({
      ...clone(content),
      id: content.id
    })))
  };
}

function cloneSpecsWithCatalog(baseSpecs, authoringState) {
  const specs = nextSpecsWithCatalog(baseSpecs, authoringState);
  authoringState.specs = clone(specs);
  return specs;
}

function normalizePanelRecord(record = {}, name) {
  const title = String(record?.title ?? record?.id ?? name ?? "").trim() || name;
  return {
    id: name,
    title: title === String(record?.id ?? "").trim() ? name : title,
    subtitle: record?.subtitle ?? null,
    role: String(record?.role ?? "aux").trim().toLowerCase() || "aux",
    contentId: record?.contentId ?? record?.content ?? null,
    shortcut: record?.shortcut ?? null,
    origin: "authored",
    pluginId: record?.pluginId ?? null,
    source: record?.source ? clone(record.source) : null
  };
}

function normalizeContentRecord(record = {}, name) {
  const title = String(record?.title ?? record?.id ?? name ?? "").trim() || name;
  return {
    id: name,
    title: title === String(record?.id ?? "").trim() ? name : title,
    subtitle: record?.subtitle ?? null,
    kind: record?.kind ?? "detail",
    screenShape: record?.screenShape ?? null,
    surfaceKind: record?.surfaceKind ?? null,
    datasetId: record?.datasetId ?? null,
    dataSource: record?.dataSource ?? null,
    leftPanelId: record?.leftPanelId ?? null,
    helpText: record?.helpText ?? null,
    emptyMessage: record?.emptyMessage ?? null,
    rowFilterKind: record?.rowFilterKind ?? null,
    rowFilterAction: record?.rowFilterAction ?? null,
    shortcut: record?.shortcut ?? null,
    defaultSectionId: record?.defaultSectionId ?? null,
    sectionIds: [...(record?.sectionIds ?? [])],
    columns: [...(record?.columns ?? [])],
    collapsible: record?.collapsible ?? null,
    collapsed: record?.collapsed ?? null,
    priority: record?.priority ?? null,
    maxPrimaryChars: record?.maxPrimaryChars ?? null,
    width: record?.width ?? null,
    height: record?.height ?? null,
    resizable: record?.resizable ?? null,
    closeIdsOnOpen: [...(record?.closeIdsOnOpen ?? [])],
    scroll: [...(record?.scroll ?? [])],
    origin: "authored",
    pluginId: record?.pluginId ?? null,
    source: record?.source ? clone(record.source) : null
  };
}

function namedCatalogMap(rows = []) {
  return Object.fromEntries(stableById(rows).map(row => [row.id, clone(row)]));
}

function panelReferrers(authoringState, panelId) {
  const refs = [];
  for (const split of authoringState.specs?.splits ?? []) {
    if (split?.first === panelId || split?.second === panelId) refs.push(`split:${split.id}`);
  }
  for (const windowSpec of authoringState.specs?.windows ?? []) {
    if (windowSpec?.leftPanelId === panelId || windowSpec?.rightPanelId === panelId) refs.push(`window:${windowSpec.id}`);
  }
  for (const content of authoringState.specs?.contents ?? []) {
    if (content?.leftPanelId === panelId) refs.push(`content:${content.id}`);
  }
  return refs;
}

function contentReferrers(authoringState, contentId) {
  const refs = [];
  for (const panel of authoringState.specs?.panels ?? []) {
    if (panel?.contentId === contentId) refs.push(`panel:${panel.id}`);
  }
  for (const chrome of authoringState.specs?.chromes ?? []) {
    if (chrome?.contentId === contentId) refs.push(`chrome:${chrome.id}`);
  }
  for (const content of authoringState.specs?.contents ?? []) {
    if (content?.leftPanelId === contentId) {
      // not a valid authored relation today; ignore
    }
    if ((content?.sectionIds ?? []).includes(contentId)) refs.push(`content:${content.id}:section`);
    if (content?.defaultSectionId === contentId) refs.push(`content:${content.id}:default-section`);
  }
  return refs;
}

function rewritePanelReferences(authoringState, sourceId, targetId) {
  for (const split of authoringState.specs?.splits ?? []) {
    if (split.first === sourceId) split.first = targetId;
    if (split.second === sourceId) split.second = targetId;
  }
  for (const windowSpec of authoringState.specs?.windows ?? []) {
    if (windowSpec.leftPanelId === sourceId) windowSpec.leftPanelId = targetId;
    if (windowSpec.rightPanelId === sourceId) windowSpec.rightPanelId = targetId;
  }
  for (const content of authoringState.specs?.contents ?? []) {
    if (content.leftPanelId === sourceId) content.leftPanelId = targetId;
  }
}

function rewriteContentReferences(authoringState, sourceId, targetId) {
  for (const panel of authoringState.specs?.panels ?? []) {
    if (panel.contentId === sourceId) panel.contentId = targetId;
  }
  for (const chrome of authoringState.specs?.chromes ?? []) {
    if (chrome.contentId === sourceId) chrome.contentId = targetId;
  }
  for (const content of authoringState.specs?.contents ?? []) {
    content.sectionIds = (content.sectionIds ?? []).map(sectionId => sectionId === sourceId ? targetId : sectionId);
    if (content.defaultSectionId === sourceId) content.defaultSectionId = targetId;
  }
}

export async function createOperatorWorkbenchAuthoringStore({
  appProject = null,
  fsModule = fs
} = {}) {
  if (!appProject) return null;
  const sourceFile = resolveOperatorWorkbenchAuthoringFile(appProject);
  if (!sourceFile) return null;
  const baseSpecs = collectAuthoredOperatorWorkbenchSpecs(appProject.authoredDesireDocs ?? [], {
    includeLoweredCanonical: false
  });
  const authoringState = authoringStateFromSpecs(baseSpecs);

  async function flush() {
    const text = serializeOperatorWorkbenchSpecs(cloneSpecsWithCatalog(baseSpecs, authoringState));
    await fsModule.writeFile(sourceFile, text, "utf8");
  }

  return {
    sourceFile,
    async loadWorkbenchState() {
      return {
        layouts: clone(authoringState.layouts),
        keymaps: clone(authoringState.keymaps),
        panels: clone(authoringState.panels),
        contents: clone(authoringState.contents),
        authoredSpecs: clone(authoringState.specs)
      };
    },
    async saveLayout(name, record) {
      const normalized = normalizeOperatorWorkbenchLayoutRecord({
        ...record,
        name,
        id: name
      }, name);
      authoringState.layouts[name] = normalized;
      await flush();
      return clone(normalized);
    },
    async deleteLayout(name) {
      delete authoringState.layouts[name];
      await flush();
      return true;
    },
    async renameLayout(sourceName, targetName, record = null) {
      const source = normalizeOperatorWorkbenchLayoutRecord(
        record ?? authoringState.layouts[sourceName] ?? {},
        targetName
      );
      delete authoringState.layouts[sourceName];
      authoringState.layouts[targetName] = {
        ...source,
        name: targetName
      };
      await flush();
      return clone(authoringState.layouts[targetName]);
    },
    async saveKeymap(name, record) {
      const normalized = normalizeOperatorWorkbenchKeymapRecord({
        ...record,
        name,
        id: name
      }, name);
      authoringState.keymaps[name] = normalized;
      await flush();
      return clone(normalized);
    },
    async deleteKeymap(name) {
      delete authoringState.keymaps[name];
      await flush();
      return true;
    },
    async renameKeymap(sourceName, targetName, record = null) {
      const source = normalizeOperatorWorkbenchKeymapRecord(
        record ?? authoringState.keymaps[sourceName] ?? {},
        targetName
      );
      delete authoringState.keymaps[sourceName];
      authoringState.keymaps[targetName] = {
        ...source,
        name: targetName
      };
      await flush();
      return clone(authoringState.keymaps[targetName]);
    },
    async savePanel(name, record) {
      const normalized = normalizePanelRecord({
        ...record,
        id: name
      }, name);
      authoringState.panels[name] = normalized;
      await flush();
      return clone(normalized);
    },
    async deletePanel(name) {
      const refs = panelReferrers(authoringState, name);
      if (refs.length) {
        throw new Error(`panel ${name} is still referenced by ${refs.join(", ")}`);
      }
      delete authoringState.panels[name];
      await flush();
      return true;
    },
    async renamePanel(sourceName, targetName, record = null) {
      const source = normalizePanelRecord(
        record ?? authoringState.panels[sourceName] ?? {},
        targetName
      );
      delete authoringState.panels[sourceName];
      authoringState.panels[targetName] = {
        ...source,
        id: targetName,
        title: source.title === sourceName ? targetName : source.title
      };
      rewritePanelReferences(authoringState, sourceName, targetName);
      await flush();
      return clone(authoringState.panels[targetName]);
    },
    async assignPanelContent(panelName, contentName) {
      const panel = authoringState.panels[panelName];
      if (!panel) throw new Error(`panel not found: ${panelName}`);
      if (!authoringState.contents[contentName]) throw new Error(`content not found: ${contentName}`);
      authoringState.panels[panelName] = {
        ...panel,
        contentId: contentName
      };
      await flush();
      return clone(authoringState.panels[panelName]);
    },
    async saveContent(name, record) {
      const normalized = normalizeContentRecord({
        ...record,
        id: name
      }, name);
      authoringState.contents[name] = normalized;
      await flush();
      return clone(normalized);
    },
    async deleteContent(name) {
      const refs = contentReferrers(authoringState, name);
      if (refs.length) {
        throw new Error(`content ${name} is still referenced by ${refs.join(", ")}`);
      }
      delete authoringState.contents[name];
      await flush();
      return true;
    },
    async renameContent(sourceName, targetName, record = null) {
      const source = normalizeContentRecord(
        record ?? authoringState.contents[sourceName] ?? {},
        targetName
      );
      delete authoringState.contents[sourceName];
      authoringState.contents[targetName] = {
        ...source,
        id: targetName,
        title: source.title === sourceName ? targetName : source.title
      };
      rewriteContentReferences(authoringState, sourceName, targetName);
      await flush();
      return clone(authoringState.contents[targetName]);
    }
  };
}
