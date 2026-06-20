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
      return normalizeOperatorWorkbenchDisplaySettings(all?.[workspaceKey] ?? {});
    },
    async save(workspaceKey, settings) {
      const all = await readAll();
      all[workspaceKey] = normalizeOperatorWorkbenchDisplaySettings(settings);
      await fsModule.mkdir(path.dirname(filePath), { recursive: true });
      await fsModule.writeFile(filePath, `${JSON.stringify(all, null, 2)}\n`, "utf8");
      return all[workspaceKey];
    }
  };
}
