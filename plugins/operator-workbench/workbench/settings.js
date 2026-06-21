import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_OPERATOR_WORKBENCH_DISPLAY_SETTINGS = Object.freeze({
  fontSize: 14,
  rowDensity: "comfortable",
  paneSplit: 0.42,
  viewportTop: null,
  viewportBottom: null,
  defaultColumns: ["title", "kind", "scope", "id"],
  pageSize: 25,
  colorMode: "auto"
});

export const DEFAULT_OPERATOR_WORKBENCH_WORKSPACE_STATE = Object.freeze({
  displaySettings: DEFAULT_OPERATOR_WORKBENCH_DISPLAY_SETTINGS,
  layouts: Object.freeze({}),
  keymaps: Object.freeze({})
});

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeOperatorWorkbenchDisplaySettings(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const defaultColumns = Array.isArray(source.defaultColumns) && source.defaultColumns.length
    ? source.defaultColumns.map(String)
    : DEFAULT_OPERATOR_WORKBENCH_DISPLAY_SETTINGS.defaultColumns;
  const viewportTop = source.viewportTop === null || source.viewportTop === undefined
    ? null
    : Math.round(clamp(source.viewportTop, 3, 999, DEFAULT_OPERATOR_WORKBENCH_DISPLAY_SETTINGS.viewportTop));
  const viewportBottom = source.viewportBottom === null || source.viewportBottom === undefined
    ? null
    : Math.round(clamp(source.viewportBottom, 3, 999, DEFAULT_OPERATOR_WORKBENCH_DISPLAY_SETTINGS.viewportBottom));
  return {
    fontSize: Math.round(clamp(source.fontSize, 11, 22, DEFAULT_OPERATOR_WORKBENCH_DISPLAY_SETTINGS.fontSize)),
    rowDensity: ["compact", "comfortable", "relaxed"].includes(source.rowDensity)
      ? source.rowDensity
      : DEFAULT_OPERATOR_WORKBENCH_DISPLAY_SETTINGS.rowDensity,
    paneSplit: clamp(source.paneSplit, 0.25, 0.7, DEFAULT_OPERATOR_WORKBENCH_DISPLAY_SETTINGS.paneSplit),
    viewportTop,
    viewportBottom,
    defaultColumns,
    pageSize: Math.round(clamp(source.pageSize, 10, 100, DEFAULT_OPERATOR_WORKBENCH_DISPLAY_SETTINGS.pageSize)),
    colorMode: ["auto", "on", "off"].includes(source.colorMode)
      ? source.colorMode
      : DEFAULT_OPERATOR_WORKBENCH_DISPLAY_SETTINGS.colorMode
  };
}

function normalizeStringRecordMap(value, normalizeEntry) {
  const source = value && typeof value === "object" ? value : {};
  const normalized = {};
  for (const [key, entry] of Object.entries(source)) {
    const name = String(key ?? "").trim();
    if (!name) continue;
    normalized[name] = normalizeEntry(entry, name);
  }
  return normalized;
}

function normalizeLayoutRoot(root = null) {
  const source = root && typeof root === "object" ? root : {};
  const kind = String(source.kind ?? "").trim().toLowerCase();
  if (kind === "panel") {
    const panelId = String(source.panelId ?? source.panel ?? "").trim();
    return panelId ? { kind: "panel", panelId } : null;
  }
  if (kind !== "split") return null;
  const axis = String(source.axis ?? "vertical").trim().toLowerCase() === "horizontal"
    ? "horizontal"
    : "vertical";
  const first = normalizeLayoutRoot(source.first);
  const second = normalizeLayoutRoot(source.second);
  if (!first || !second) return null;
  const weight = Math.min(85, Math.max(15, Math.round(Number(source.weight ?? source.firstWeight ?? 50) || 50)));
  return {
    kind: "split",
    axis,
    weight,
    first,
    second
  };
}

function normalizePanelStateRecord(value = {}, fallbackId = null) {
  const source = value && typeof value === "object" ? value : {};
  const id = String(source.id ?? fallbackId ?? "").trim();
  if (!id) return null;
  return {
    id,
    title: String(source.title ?? source.label ?? id).trim() || id,
    contentKind: String(source.contentKind ?? source.kind ?? "").trim() || null,
    screenId: String(source.screenId ?? "").trim() || null,
    leftScreenId: String(source.leftScreenId ?? "").trim() || null,
    primaryActionId: String(source.primaryActionId ?? "").trim() || null,
    secondaryMenuId: String(source.secondaryMenuId ?? "").trim() || null
  };
}

export function normalizeOperatorWorkbenchLayoutRecord(value = {}, fallbackName = null) {
  const source = value && typeof value === "object" ? value : {};
  const name = String(source.name ?? fallbackName ?? "").trim();
  const panels = normalizeStringRecordMap(source.panels, normalizePanelStateRecord);
  return {
    name,
    viewportId: String(source.viewportId ?? source.activeViewportId ?? "").trim() || null,
    focusedPanelId: String(source.focusedPanelId ?? "").trim() || null,
    root: normalizeLayoutRoot(source.root),
    panels,
    savedAt: String(source.savedAt ?? source.updatedAt ?? "").trim() || null
  };
}

export function normalizeOperatorWorkbenchKeymapRecord(value = {}, fallbackName = null) {
  const source = value && typeof value === "object" ? value : {};
  const name = String(source.name ?? fallbackName ?? "").trim();
  const bindings = normalizeStringRecordMap(source.bindings, entry => {
    const target = String(entry?.target ?? entry?.actionId ?? "").trim();
    return target
      ? {
          target,
          targetKind: String(entry?.targetKind ?? "action").trim() || "action"
        }
      : null;
  });
  for (const key of Object.keys(bindings)) {
    if (!bindings[key]) delete bindings[key];
  }
  const panelPrimaryActions = normalizeStringRecordMap(source.panelPrimaryActions, entry =>
    String(entry ?? "").trim() || null);
  for (const key of Object.keys(panelPrimaryActions)) {
    if (!panelPrimaryActions[key]) delete panelPrimaryActions[key];
  }
  const panelSecondaryMenus = normalizeStringRecordMap(source.panelSecondaryMenus, entry =>
    String(entry ?? "").trim() || null);
  for (const key of Object.keys(panelSecondaryMenus)) {
    if (!panelSecondaryMenus[key]) delete panelSecondaryMenus[key];
  }
  return {
    name,
    bindings,
    panelPrimaryActions,
    panelSecondaryMenus,
    savedAt: String(source.savedAt ?? source.updatedAt ?? "").trim() || null
  };
}

export function normalizeOperatorWorkbenchWorkspaceState(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    displaySettings: normalizeOperatorWorkbenchDisplaySettings(source.displaySettings ?? source),
    layouts: normalizeStringRecordMap(source.layouts, normalizeOperatorWorkbenchLayoutRecord),
    keymaps: normalizeStringRecordMap(source.keymaps, normalizeOperatorWorkbenchKeymapRecord)
  };
}

function settingsFilePath(userDataRoot) {
  return path.join(userDataRoot, "operator-workbench-settings.json");
}

export function createOperatorWorkbenchWorkspaceKey({
  cwd = process.cwd(),
  appPath = null,
  worldHome = null
} = {}) {
  const appKey = String(appPath || "").trim();
  const worldKey = String(worldHome || "").trim();
  return JSON.stringify({
    cwd: path.resolve(cwd),
    appPath: appKey || null,
    worldHome: worldKey || null
  });
}

export function createOperatorWorkbenchSettingsStore({
  userDataRoot,
  fsModule = fs
}) {
  const filePath = settingsFilePath(userDataRoot);

  async function readAll() {
    try {
      const text = await fsModule.readFile(filePath, "utf8");
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return {
    async load(workspaceKey) {
      const all = await readAll();
      return normalizeOperatorWorkbenchWorkspaceState(all?.[workspaceKey] ?? {}).displaySettings;
    },
    async save(workspaceKey, settings) {
      const all = await readAll();
      const nextWorkspaceState = normalizeOperatorWorkbenchWorkspaceState(all?.[workspaceKey] ?? {});
      nextWorkspaceState.displaySettings = normalizeOperatorWorkbenchDisplaySettings(settings);
      all[workspaceKey] = nextWorkspaceState;
      await fsModule.mkdir(path.dirname(filePath), { recursive: true });
      await fsModule.writeFile(filePath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
      return all[workspaceKey].displaySettings;
    },
    async loadWorkspace(workspaceKey) {
      const all = await readAll();
      return normalizeOperatorWorkbenchWorkspaceState(all?.[workspaceKey] ?? {});
    },
    async saveLayout(workspaceKey, name, layout) {
      const all = await readAll();
      const nextWorkspaceState = normalizeOperatorWorkbenchWorkspaceState(all?.[workspaceKey] ?? {});
      nextWorkspaceState.layouts[name] = normalizeOperatorWorkbenchLayoutRecord({
        ...layout,
        name,
        savedAt: new Date().toISOString()
      }, name);
      all[workspaceKey] = nextWorkspaceState;
      await fsModule.mkdir(path.dirname(filePath), { recursive: true });
      await fsModule.writeFile(filePath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
      return nextWorkspaceState.layouts[name];
    },
    async deleteLayout(workspaceKey, name) {
      const all = await readAll();
      const nextWorkspaceState = normalizeOperatorWorkbenchWorkspaceState(all?.[workspaceKey] ?? {});
      delete nextWorkspaceState.layouts[name];
      all[workspaceKey] = nextWorkspaceState;
      await fsModule.mkdir(path.dirname(filePath), { recursive: true });
      await fsModule.writeFile(filePath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
      return true;
    },
    async saveKeymap(workspaceKey, name, keymap) {
      const all = await readAll();
      const nextWorkspaceState = normalizeOperatorWorkbenchWorkspaceState(all?.[workspaceKey] ?? {});
      nextWorkspaceState.keymaps[name] = normalizeOperatorWorkbenchKeymapRecord({
        ...keymap,
        name,
        savedAt: new Date().toISOString()
      }, name);
      all[workspaceKey] = nextWorkspaceState;
      await fsModule.mkdir(path.dirname(filePath), { recursive: true });
      await fsModule.writeFile(filePath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
      return nextWorkspaceState.keymaps[name];
    },
    async deleteKeymap(workspaceKey, name) {
      const all = await readAll();
      const nextWorkspaceState = normalizeOperatorWorkbenchWorkspaceState(all?.[workspaceKey] ?? {});
      delete nextWorkspaceState.keymaps[name];
      all[workspaceKey] = nextWorkspaceState;
      await fsModule.mkdir(path.dirname(filePath), { recursive: true });
      await fsModule.writeFile(filePath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
      return true;
    }
  };
}
