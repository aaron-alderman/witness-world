import path from "node:path";
import fs from "node:fs/promises";
import readline from "node:readline";
import { createWorld } from "./kernel.js";
import { applyWitnessDocsWithRuntimePlugins } from "./dsl.js";
import { applyDesire } from "./desire/index.js";
import { loadAppProject } from "./app-project.js";
import { AppPreviewSessionManager, AppSnapshotManager } from "./app-snapshot-manager.js";
import { declareBackendHost, declareFrontendHost, resolveServerRunner } from "./host.js";
import { buildOperatorWorkbenchDefinition } from "./operator-screen-specs.js";
import { resolveRuntimeOperatorPaths } from "./runtime-operator-contract.js";
import { resolveCliRuntimeProfile } from "./runtime-local-launcher.js";
import { buildPlatformModel } from "../plugins/platform/platform-model.js";
import { worldGraphProjection } from "../plugins/inspect/world-graph.js";

const DEFAULT_TUI_RUNTIME_PROFILE = "full";
const ROOT_CONTAINER_ID = "root";
const FOCUS_ROOT_CONTAINER_ID = "focus:root";
const RESULT_VIEW_PAGE_SIZE = 25;
const SOURCE_EXCERPT_RADIUS = 8;

const ANSI = Object.freeze({
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  dim: "\x1b[90m",
  reset: "\x1b[0m"
});

const DEFAULT_RESULT_VIEW_COLUMNS = Object.freeze([
  "title",
  "kind",
  "scope",
  "id"
]);

const RESULT_VIEW_COLUMN_CATALOG = Object.freeze({
  title: { label: "title", maxWidth: 28 },
  kind: { label: "kind", maxWidth: 16 },
  scope: { label: "scope", maxWidth: 10 },
  id: { label: "id", maxWidth: 32 },
  summary: { label: "summary", maxWidth: 36 },
  source: { label: "source", maxWidth: 40 },
  context: { label: "context", maxWidth: 20 },
  status: { label: "status", maxWidth: 16 }
});

const RESULT_VIEW_SORT_NAMES = new Set([
  "relevance",
  ...Object.keys(RESULT_VIEW_COLUMN_CATALOG)
]);

const WORLD_KIND_ORDER = Object.freeze([
  "context",
  "surface",
  "process",
  "capability",
  "widget",
  "layout",
  "entity",
  "message",
  "boundary",
  "store",
  "projection",
  "policy",
  "type",
  "module",
  "thing",
  "witness",
  "trait",
  "valueType",
  "processSpec",
  "graphNode",
  "graphEdge",
  "graphEntityType",
  "graphEdgeType",
  "api",
  "vocabulary"
]);

const PLATFORM_KIND_ORDER = Object.freeze([
  "plugin",
  "bundle",
  "doc",
  "folder",
  "task",
  "testGate",
  "testFile",
  "docSection",
  "docReference",
  "wtomlSource",
  "rvmSource",
  "wcssSource",
  "fileSource",
  "jsonSource",
  "profile",
  "telemetryMetric",
  "compatibilityBridge",
  "boundary",
  "roadmap",
  "intent",
  "testEnvironment",
  "coverageEdge",
  "mutableSurface"
]);

const SESSION_SECTION_ORDER = Object.freeze([
  "selection",
  "aliases",
  "preview",
  "notes",
  "programs"
]);

const WORLD_GROUP_LABELS = Object.freeze({
  context: "Contexts",
  surface: "Surfaces",
  process: "Processes",
  capability: "Capabilities",
  widget: "Widgets",
  layout: "Layout",
  entity: "Entities",
  message: "Messages",
  boundary: "Boundaries",
  store: "Stores",
  projection: "Projections",
  policy: "Policies",
  type: "Types",
  module: "Modules",
  thing: "Things",
  witness: "Witnesses",
  trait: "Traits",
  valueType: "Value Types",
  processSpec: "Process Specs",
  graphNode: "Graph Nodes",
  graphEdge: "Graph Edges",
  graphEntityType: "Graph Entity Types",
  graphEdgeType: "Graph Edge Types",
  api: "API",
  vocabulary: "Vocabulary"
});

const PLATFORM_GROUP_LABELS = Object.freeze({
  plugin: "Plugins",
  bundle: "Bundles",
  doc: "Docs",
  folder: "Folders",
  task: "Tasks",
  testGate: "Test Gates",
  testFile: "Test Files",
  docSection: "Doc Sections",
  docReference: "Doc References",
  wtomlSource: "WTOML Sources",
  rvmSource: "RVM Sources",
  wcssSource: "WCSS Sources",
  fileSource: "Files",
  jsonSource: "JSON Sources",
  profile: "Runtime Profiles",
  telemetryMetric: "Telemetry Metrics",
  compatibilityBridge: "Compatibility Bridges",
  boundary: "Boundaries",
  roadmap: "Roadmaps",
  intent: "Intent Nodes",
  testEnvironment: "Test Environments",
  coverageEdge: "Coverage Edges",
  mutableSurface: "Mutable Surfaces"
});

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatValue(value) {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

function cloneSerializableValue(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function parsePreviewCommandValue(text) {
  const raw = String(text ?? "");
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: "" };
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const quote = trimmed[0];
    if (quote === "\"") {
      try {
        return { ok: true, value: JSON.parse(trimmed) };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
    return {
      ok: true,
      value: trimmed.slice(1, -1)
        .replace(/\\\\/g, "\\")
        .replace(/\\'/g, "'")
    };
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { ok: true, value: JSON.parse(trimmed) };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  if (trimmed === "true") return { ok: true, value: true };
  if (trimmed === "false") return { ok: true, value: false };
  if (trimmed === "null") return { ok: true, value: null };
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return { ok: true, value: Number(trimmed) };
  }
  return { ok: true, value: raw };
}

function stableSortStrings(values = []) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(value => String(value)))];
}

function previewValueSummary(value) {
  const raw = formatValue(value);
  return raw.length > 72 ? `${raw.slice(0, 69)}...` : raw;
}

function formatPreviewMutationSummary(mutation = null) {
  if (!mutation?.target || !mutation?.property) return "(none)";
  return `${mutation.target}.${mutation.property} = ${previewValueSummary(mutation.nextValue)}`;
}

function timestamp() {
  return new Date().toISOString();
}

function arrayWrap(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeNavigationToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeAutocompleteLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trimStart();
}

function humanizeAutocompleteName(value) {
  return String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function supportsAnsiColor(stream = process.stdout, env = process.env) {
  if (!stream?.isTTY) return false;
  if (Object.prototype.hasOwnProperty.call(env, "NO_COLOR")) return false;
  return String(env.TERM ?? "").toLowerCase() !== "dumb";
}

function colorize(text, color, enabled = supportsAnsiColor()) {
  if (!enabled || !ANSI[color]) return text;
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

function makeContainer({
  id,
  name,
  label,
  summary,
  parentId
}) {
  return {
    id,
    name,
    label,
    summary,
    parentId,
    type: "container"
  };
}

function makeRecord({
  scope,
  id,
  kind,
  title,
  summary,
  raw,
  metadata = {},
  sourceHints = []
}) {
  return {
    scope,
    id,
    kind,
    title,
    summary,
    raw,
    metadata,
    sourceHints
  };
}

function recordDescriptor(record) {
  return `${record.scope}:${record.id}`;
}

function normalizeWorldRecord(node) {
  const title = optionalText(node?.label) ?? node?.id ?? "world-object";
  const sourceHints = arrayWrap(node?.sources).map(source => ({
    file: source.file,
    line: source.startLine ?? source.line ?? null,
    section: source.section ?? null,
    sourceLanguage: source.sourceLanguage ?? null
  }));
  return makeRecord({
    scope: "world",
    id: String(node.id || ""),
    kind: String(node.kind || "thing"),
    title,
    summary: optionalText(node?.surfaceLabel)
      ?? optionalText(node?.context)
      ?? arrayWrap(node?.badges).map(entry => entry?.label).filter(Boolean).join(", ")
      ?? "",
    raw: node,
    metadata: {
      context: node?.context ?? null,
      surfaceTier: node?.surfaceTier ?? null,
      surfaceLabel: node?.surfaceLabel ?? null,
      badges: arrayWrap(node?.badges).map(entry => entry?.label).filter(Boolean),
      properties: arrayWrap(node?.properties),
      values: arrayWrap(node?.values),
      recentWitnesses: arrayWrap(node?.recentWitnesses),
      processEvents: arrayWrap(node?.processEvents),
      processSelection: node?.processSelection ?? null
    },
    sourceHints
  });
}

function normalizePlatformRecord(node) {
  const source = optionalText(node?.source);
  const title = optionalText(node?.title) ?? node?.id ?? "platform-object";
  const sourceHints = source ? [{
    file: path.resolve(process.cwd(), source),
    line: null,
    section: null,
    sourceLanguage: null
  }] : [];
  return makeRecord({
    scope: "platform",
    id: String(node.id || ""),
    kind: String(node.kind || "object"),
    title,
    summary: [optionalText(node?.status), optionalText(node?.owner), source].filter(Boolean).join(" | "),
    raw: node,
    metadata: {
      owner: node?.owner ?? null,
      status: node?.status ?? null,
      source,
      lifecycle: arrayWrap(node?.lifecycle),
      command: node?.command ?? null,
      sourceDependencies: arrayWrap(node?.sourceDependencies)
    },
    sourceHints
  });
}

function buildGroupedRecords(records, order, labels) {
  const grouped = new Map();
  for (const record of records) {
    const groupKey = order.includes(record.kind) ? record.kind : "other";
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push(record);
  }
  const groupKeys = [
    ...order.filter(key => grouped.has(key)),
    ...stableSortStrings([...grouped.keys()].filter(key => !order.includes(key)))
  ];
  return groupKeys.map(groupKey => ({
    id: groupKey,
    label: labels[groupKey] ?? `${groupKey[0]?.toUpperCase() ?? ""}${groupKey.slice(1)}`,
    records: grouped.get(groupKey)
      .slice()
      .sort((left, right) =>
        left.title.localeCompare(right.title)
        || left.id.localeCompare(right.id))
  }));
}

function isContextFocusActive(session) {
  return session.focusKind === "context" && Boolean(session.focusId);
}

function activeRootContainerId(session) {
  return isContextFocusActive(session) ? FOCUS_ROOT_CONTAINER_ID : ROOT_CONTAINER_ID;
}

function focusRootLabel(session) {
  return isContextFocusActive(session) ? `context:${session.focusId}` : "root";
}

function focusScopedWorldRecords(state, focusContextId) {
  const contextId = optionalText(focusContextId);
  if (!contextId) return [];
  return state.worldRecords.filter(record =>
    record.id !== contextId
    && record.metadata?.context === contextId);
}

function currentPathEntries(session) {
  return arrayWrap(session.currentPath).map(String).filter(Boolean);
}

function normalizeSearchText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function searchableRecordTexts(record) {
  return [
    record.id,
    recordDescriptor(record),
    record.title,
    record.kind,
    record.summary,
    ...arrayWrap(record.sourceHints).map(source => source?.file).filter(Boolean)
  ]
    .map(value => String(value ?? "").trim())
    .filter(Boolean);
}

function searchRankForRecord(record, queryText) {
  const exactIdCandidates = [record.id, recordDescriptor(record)]
    .map(normalizeSearchText)
    .filter(Boolean);
  if (exactIdCandidates.includes(queryText)) return 0;
  if (normalizeSearchText(record.title) === queryText) return 1;
  const searchable = searchableRecordTexts(record).map(normalizeSearchText);
  if (searchable.some(value => value.startsWith(queryText))) return 2;
  if (searchable.some(value => value.includes(queryText))) return 3;
  return Number.POSITIVE_INFINITY;
}

function searchRecords(state, {
  query,
  scope = "all",
  focusContextId = null
}) {
  const queryText = normalizeSearchText(query);
  if (!queryText) return [];
  const records = scope === "context"
    ? focusScopedWorldRecords(state, focusContextId)
    : (scope === "world"
      ? state.worldRecords
      : (scope === "platform" ? state.platformRecords : [...state.worldRecords, ...state.platformRecords]));
  return records
    .map(record => ({
      record,
      rank: searchRankForRecord(record, queryText)
    }))
    .filter(entry => Number.isFinite(entry.rank))
    .sort((left, right) =>
      left.rank - right.rank
      || left.record.title.localeCompare(right.record.title)
      || left.record.id.localeCompare(right.record.id))
    .map(entry => entry.record);
}

function parseSearchCommand(command) {
  const text = String(command ?? "").trim();
  if (!/^search(?:\s|$)/i.test(text)) return null;
  const rest = text.slice("search".length).trim();
  if (!rest) return { error: "usage" };
  if (/^--scope(?:\s|$)/i.test(rest)) {
    const scoped = rest.match(/^--scope\s+(all|world|platform)\s+(.+)$/i);
    if (!scoped) return { error: "usage" };
    return {
      scope: scoped[1].toLowerCase(),
      query: scoped[2].trim(),
      explicitScope: true
    };
  }
  return {
    scope: "all",
    query: rest,
    explicitScope: false
  };
}

function normalizeResultViewColumn(value) {
  const normalized = optionalText(value)?.toLowerCase() ?? null;
  return normalized && RESULT_VIEW_COLUMN_CATALOG[normalized] ? normalized : null;
}

function sanitizeResultViewColumns(columns) {
  const normalized = [];
  for (const column of arrayWrap(columns)) {
    const name = normalizeResultViewColumn(column);
    if (name && !normalized.includes(name)) normalized.push(name);
  }
  return normalized.length ? normalized : [...DEFAULT_RESULT_VIEW_COLUMNS];
}

function sanitizeResultViewSort(value) {
  const normalized = optionalText(value)?.toLowerCase() ?? "relevance";
  return RESULT_VIEW_SORT_NAMES.has(normalized) ? normalized : "relevance";
}

function sanitizeResultViewFilters(filters) {
  return arrayWrap(filters)
    .map(filter => {
      const column = normalizeResultViewColumn(filter?.column);
      const value = optionalText(filter?.value);
      if (!column || !value) return null;
      return { column, value };
    })
    .filter(Boolean);
}

function resultViewColumnValue(record, column) {
  if (column === "title") return record.title ?? "";
  if (column === "kind") return record.kind ?? "";
  if (column === "scope") return record.scope ?? "";
  if (column === "id") return record.id ?? "";
  if (column === "summary") return record.summary ?? "";
  if (column === "source") return record.sourceHints[0]?.file ?? "";
  if (column === "context") return record.scope === "world" ? (record.metadata?.context ?? "") : "";
  if (column === "status") return record.scope === "platform" ? (record.metadata?.status ?? "") : "";
  return "";
}

function fitTableCell(value, width) {
  const text = String(value ?? "");
  if (text.length <= width) return text.padEnd(width);
  if (width <= 3) return text.slice(0, width);
  return `${text.slice(0, width - 3)}...`;
}

function describeResultViewFilter(filter) {
  return `${filter.column}=${filter.value}`;
}

function describeResultViewValue(value) {
  return optionalText(value) ?? "(blank)";
}

function createResultViewRows(records) {
  return arrayWrap(records).map((record, relevance) => ({
    record,
    relevance
  }));
}

function buildResultView({
  query,
  scope,
  records,
  columns = DEFAULT_RESULT_VIEW_COLUMNS,
  sort = "relevance",
  filters = [],
  page = 1,
  pageSize = RESULT_VIEW_PAGE_SIZE,
  activeViewName = null,
  focusContextId = null
}) {
  return {
    query,
    scope,
    focusContextId: optionalText(focusContextId),
    rawRows: createResultViewRows(records),
    columns: sanitizeResultViewColumns(columns),
    sort: sanitizeResultViewSort(sort),
    filters: sanitizeResultViewFilters(filters),
    page: Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.trunc(pageSize) : RESULT_VIEW_PAGE_SIZE,
    activeViewName: optionalText(activeViewName)
  };
}

function snapshotResultViewConfig(resultView) {
  return {
    query: resultView.query,
    scope: resultView.scope,
    focusContextId: resultView.focusContextId ?? null,
    columns: [...resultView.columns],
    sort: resultView.sort,
    filters: resultView.filters.map(filter => ({ ...filter })),
    pageSize: resultView.pageSize
  };
}

function sortResultViewRows(rows, sort) {
  const nextRows = rows.slice();
  if (sort === "relevance") {
    return nextRows.sort((left, right) =>
      left.relevance - right.relevance
      || left.record.title.localeCompare(right.record.title)
      || left.record.id.localeCompare(right.record.id));
  }
  return nextRows.sort((left, right) =>
    resultViewColumnValue(left.record, sort).localeCompare(resultViewColumnValue(right.record, sort))
    || left.record.title.localeCompare(right.record.title)
    || left.record.id.localeCompare(right.record.id));
}

function materializeResultView(resultView) {
  const filteredRows = resultView.filters.reduce((rows, filter) => {
    const expected = normalizeSearchText(filter.value);
    return rows.filter(row => normalizeSearchText(resultViewColumnValue(row.record, filter.column)) === expected);
  }, resultView.rawRows.slice());
  const sortedRows = sortResultViewRows(filteredRows, resultView.sort);
  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / resultView.pageSize));
  resultView.page = Math.min(Math.max(1, resultView.page), totalPages);
  const startIndex = totalRows ? (resultView.page - 1) * resultView.pageSize : 0;
  const pageRows = sortedRows.slice(startIndex, startIndex + resultView.pageSize);
  return {
    rows: sortedRows,
    pageRows,
    entries: pageRows.map(row => ({ type: "record", record: row.record })),
    totalRows,
    totalPages,
    page: resultView.page,
    pageSize: resultView.pageSize,
    rangeStart: totalRows ? startIndex + 1 : 0,
    rangeEnd: totalRows ? startIndex + pageRows.length : 0
  };
}

function renderResultView(session) {
  const resultView = session.resultView;
  if (!resultView) return "no active result view.";
  const ansi = supportsAnsiColor();
  const materialized = materializeResultView(resultView);
  session.lastEntries = materialized.entries;
  const filtersText = resultView.filters.length
    ? resultView.filters.map(describeResultViewFilter).join(", ")
    : "none";
  const headerBits = [
    `search ${JSON.stringify(resultView.query)}`,
    `scope=${resultView.scope}`,
    `rows=${materialized.rangeStart}-${materialized.rangeEnd} of ${materialized.totalRows}`,
    `sort=${resultView.sort}`,
    `filters=${filtersText}`
  ];
  if (resultView.focusContextId) {
    headerBits.push(`focus=context:${resultView.focusContextId}`);
  }
  if (resultView.activeViewName) {
    headerBits.push(ansi ? `view=👁 ${resultView.activeViewName}` : `view=${resultView.activeViewName}`);
  }

  const rowLabelWidth = Math.max(2, String(Math.max(1, materialized.pageRows.length)).length + 1);
  const widths = new Map();
  for (const column of resultView.columns) {
    const spec = RESULT_VIEW_COLUMN_CATALOG[column];
    const labelWidth = spec.label.length;
    const valueWidth = Math.max(
      labelWidth,
      ...materialized.pageRows.map(row => String(resultViewColumnValue(row.record, column)).length)
    );
    widths.set(column, Math.min(spec.maxWidth, valueWidth));
  }

  const headerRow = [
    fitTableCell("#", rowLabelWidth),
    ...resultView.columns.map(column => fitTableCell(RESULT_VIEW_COLUMN_CATALOG[column].label, widths.get(column)))
  ].join("  ");
  const separatorRow = [
    "-".repeat(rowLabelWidth),
    ...resultView.columns.map(column => "-".repeat(widths.get(column)))
  ].join("  ");
  const lines = [
    colorize(`${ansi ? "🔎 " : ""}${headerBits.join(" | ")}`, "blue", ansi),
    colorize(headerRow, "green", ansi),
    colorize(separatorRow, "dim", ansi)
  ];

  if (!materialized.pageRows.length) {
    lines.push("(no rows)");
    return lines.join("\n");
  }

  materialized.pageRows.forEach((row, index) => {
    const marker = session.selectionId === row.record.id ? "*" : " ";
    const rowLabel = fitTableCell(`${marker}${index + 1}`, rowLabelWidth);
    const values = resultView.columns.map(column =>
      fitTableCell(resultViewColumnValue(row.record, column), widths.get(column)));
    lines.push([rowLabel, ...values].join("  "));
  });
  return lines.join("\n");
}

function summarizeResultViewValues(resultView, column) {
  const materialized = materializeResultView(resultView);
  const counts = new Map();
  for (const row of materialized.rows) {
    const value = describeResultViewValue(resultViewColumnValue(row.record, column));
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const entries = [...counts.entries()]
    .sort((left, right) =>
      right[1] - left[1]
      || left[0].localeCompare(right[0]));
  if (!entries.length) return `(no values for ${column})`;
  return [
    `values ${column} (${materialized.totalRows} row${materialized.totalRows === 1 ? "" : "s"})`,
    ...entries.map(([value, count], index) => `${index + 1}. ${value} (${count})`)
  ].join("\n");
}

function buildSessionGroups(session) {
  const previewCount = session.previewSessionId ? 1 : 0;
  const previewLabel = session.previewSessionId
    ? (session.previewStatus === "stale" ? "Preview Session (stale)" : "Preview Session")
    : "Preview Session";
  return [
    {
      id: "selection",
      label: "Selection",
      count: session.selectionId ? 1 : 0
    },
    {
      id: "aliases",
      label: "Aliases",
      count: Object.keys(session.aliases).length
    },
    {
      id: "preview",
      label: previewLabel,
      count: previewCount
    },
    {
      id: "notes",
      label: "Notes",
      count: session.notes.length
    },
    {
      id: "programs",
      label: "Mini-Programs",
      count: Object.keys(session.programs).length
    }
  ];
}

function snapshotSessionState(session) {
  return deepClone({
    currentPath: session.currentPath,
    selectionId: session.selectionId,
    focusKind: session.focusKind,
    focusId: session.focusId,
    focusLabel: session.focusLabel,
    focusReturnPath: session.focusReturnPath,
    focusReturnSelectionId: session.focusReturnSelectionId,
    aliases: session.aliases,
    notes: session.notes,
    programs: session.programs
  });
}

function restoreSessionState(session, snapshot) {
  session.currentPath = arrayWrap(snapshot?.currentPath);
  session.selectionId = snapshot?.selectionId ?? null;
  session.focusKind = snapshot?.focusKind ?? null;
  session.focusId = snapshot?.focusId ?? null;
  session.focusLabel = snapshot?.focusLabel ?? null;
  session.focusReturnPath = arrayWrap(snapshot?.focusReturnPath);
  session.focusReturnSelectionId = snapshot?.focusReturnSelectionId ?? null;
  session.aliases = { ...(snapshot?.aliases ?? {}) };
  session.notes = arrayWrap(snapshot?.notes);
  session.programs = { ...(snapshot?.programs ?? {}) };
}

function pushLocalUndoState(session, label) {
  session.undoStack.push({
    kind: "local",
    label,
    snapshot: snapshotSessionState(session)
  });
  if (session.undoStack.length > 100) session.undoStack.shift();
  session.redoStack.length = 0;
}

function pushPreviewUndoState(session, entry) {
  session.undoStack.push({
    kind: "preview",
    ...entry
  });
  if (session.undoStack.length > 100) session.undoStack.shift();
  session.redoStack.length = 0;
}

function normalizeCurrentPath(currentPath) {
  const pathEntries = arrayWrap(currentPath).map(String).filter(Boolean);
  if (!pathEntries.length) return [ROOT_CONTAINER_ID];
  return [ROOT_CONTAINER_ID, ...pathEntries.filter(entry => entry !== ROOT_CONTAINER_ID)];
}

function currentContainerId(session) {
  const pathEntries = currentPathEntries(session);
  return pathEntries.at(-1) ?? activeRootContainerId(session);
}

function createContainerIndex(state, session) {
  const index = new Map();
  const add = container => index.set(container.id, container);

  if (isContextFocusActive(session)) {
    const focusedRecords = focusScopedWorldRecords(state, session.focusId);
    add(makeContainer({
      id: FOCUS_ROOT_CONTAINER_ID,
      name: session.focusId,
      label: focusRootLabel(session),
      summary: "Focused context root.",
      parentId: null
    }));
    for (const group of buildGroupedRecords(focusedRecords, WORLD_KIND_ORDER, WORLD_GROUP_LABELS)) {
      add(makeContainer({
        id: `focus:${group.id}`,
        name: group.id,
        label: group.label,
        summary: `${group.records.length} item${group.records.length === 1 ? "" : "s"}.`,
        parentId: FOCUS_ROOT_CONTAINER_ID
      }));
    }
    return index;
  }

  add(makeContainer({
    id: ROOT_CONTAINER_ID,
    name: "root",
    label: "Workbench Root",
    summary: "Session, world, and platform representations.",
    parentId: null
  }));
  add(makeContainer({
    id: "session",
    name: "session",
    label: "Session",
    summary: "Selection, aliases, notes, preview session, and mini-programs.",
    parentId: ROOT_CONTAINER_ID
  }));
  add(makeContainer({
    id: "world",
    name: "world",
    label: "World",
    summary: "Live modeled world graph in detached mode.",
    parentId: ROOT_CONTAINER_ID
  }));
  add(makeContainer({
    id: "platform",
    name: "platform",
    label: "Platform",
    summary: "Platform self-model, docs, tests, and runtime inventory.",
    parentId: ROOT_CONTAINER_ID
  }));

  for (const section of SESSION_SECTION_ORDER) {
    const group = buildSessionGroups(session).find(entry => entry.id === section);
    add(makeContainer({
      id: `session:${section}`,
      name: section,
      label: group?.label ?? section,
      summary: group ? `${group.count} item${group.count === 1 ? "" : "s"}.` : "",
      parentId: "session"
    }));
  }

  for (const group of buildGroupedRecords(state.worldRecords, WORLD_KIND_ORDER, WORLD_GROUP_LABELS)) {
    add(makeContainer({
      id: `world:${group.id}`,
      name: group.id,
      label: group.label,
      summary: `${group.records.length} item${group.records.length === 1 ? "" : "s"}.`,
      parentId: "world"
    }));
  }

  for (const group of buildGroupedRecords(state.platformRecords, PLATFORM_KIND_ORDER, PLATFORM_GROUP_LABELS)) {
    add(makeContainer({
      id: `platform:${group.id}`,
      name: group.id,
      label: group.label,
      summary: `${group.records.length} item${group.records.length === 1 ? "" : "s"}.`,
      parentId: "platform"
    }));
  }

  return index;
}

function sessionSectionItems(state, session, sectionId) {
  if (sectionId === "session:selection") {
    if (!session.selectionId) return [];
    const record = state.recordIndex.get(session.selectionId);
    if (!record) return [];
    return [{ type: "record", record }];
  }
  if (sectionId === "session:aliases") {
    return Object.entries(session.aliases)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([alias, targetId]) => {
        const record = state.recordIndex.get(targetId) ?? null;
        return {
          type: "alias",
          alias,
          targetId,
          record
        };
      });
  }
  if (sectionId === "session:preview") {
    if (!session.previewSessionId) return [];
    return [{
      type: "preview-session",
      entry: {
        sessionId: session.previewSessionId,
        baseAppRevision: session.baseAppRevision,
        previewRevision: session.previewRevision,
        status: session.previewStatus,
        invalidReason: session.invalidReason
      }
    }];
  }
  if (sectionId === "session:notes") {
    return session.notes.map(entry => ({ type: "note", entry }));
  }
  if (sectionId === "session:programs") {
    return Object.entries(session.programs)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, commands]) => ({
        type: "program",
        entry: {
          name,
          commands: arrayWrap(commands)
        }
      }));
  }
  return [];
}

function buildContainerEntries(state, session, containerId) {
  if (isContextFocusActive(session) && containerId === FOCUS_ROOT_CONTAINER_ID) {
    return buildGroupedRecords(focusScopedWorldRecords(state, session.focusId), WORLD_KIND_ORDER, WORLD_GROUP_LABELS).map(group => ({
      type: "container",
      container: state.containerIndex.get(`focus:${group.id}`),
      count: group.records.length
    }));
  }
  if (isContextFocusActive(session) && containerId.startsWith("focus:") && containerId !== FOCUS_ROOT_CONTAINER_ID) {
    const groupId = containerId.slice("focus:".length);
    const group = buildGroupedRecords(focusScopedWorldRecords(state, session.focusId), WORLD_KIND_ORDER, WORLD_GROUP_LABELS)
      .find(entry => entry.id === groupId);
    return (group?.records ?? []).map(record => ({ type: "record", record }));
  }
  if (containerId === ROOT_CONTAINER_ID) {
    return ["session", "world", "platform"].map(id => ({
      type: "container",
      container: state.containerIndex.get(id)
    }));
  }
  if (containerId === "session") {
    return buildSessionGroups(session).map(group => ({
      type: "container",
      container: state.containerIndex.get(`session:${group.id}`),
      count: group.count
    }));
  }
  if (containerId === "world") {
    return buildGroupedRecords(state.worldRecords, WORLD_KIND_ORDER, WORLD_GROUP_LABELS).map(group => ({
      type: "container",
      container: state.containerIndex.get(`world:${group.id}`),
      count: group.records.length
    }));
  }
  if (containerId === "platform") {
    return buildGroupedRecords(state.platformRecords, PLATFORM_KIND_ORDER, PLATFORM_GROUP_LABELS).map(group => ({
      type: "container",
      container: state.containerIndex.get(`platform:${group.id}`),
      count: group.records.length
    }));
  }
  if (containerId.startsWith("world:")) {
    const groupId = containerId.slice("world:".length);
    const group = buildGroupedRecords(state.worldRecords, WORLD_KIND_ORDER, WORLD_GROUP_LABELS)
      .find(entry => entry.id === groupId);
    return (group?.records ?? []).map(record => ({ type: "record", record }));
  }
  if (containerId.startsWith("platform:")) {
    const groupId = containerId.slice("platform:".length);
    const group = buildGroupedRecords(state.platformRecords, PLATFORM_KIND_ORDER, PLATFORM_GROUP_LABELS)
      .find(entry => entry.id === groupId);
    return (group?.records ?? []).map(record => ({ type: "record", record }));
  }
  if (containerId.startsWith("session:")) {
    return sessionSectionItems(state, session, containerId);
  }
  return [];
}

function renderEntry(entry, index, session) {
  const marker = session.selectionId && entry.type === "record" && entry.record.id === session.selectionId
    ? "*"
    : " ";
  if (entry.type === "container") {
    const label = entry.container?.label ?? "Container";
    const count = Number.isFinite(entry.count) ? ` (${entry.count})` : "";
    const summary = optionalText(entry.container?.summary);
    return `${marker}[${index}] ${label}${count}${summary ? ` - ${summary}` : ""}`;
  }
  if (entry.type === "record") {
    const record = entry.record;
    const summary = optionalText(record.summary);
    return `${marker}[${index}] ${record.title} <${record.kind}>${summary ? ` - ${summary}` : ""}`;
  }
  if (entry.type === "alias") {
    const label = entry.record ? `${entry.record.title} <${entry.record.kind}>` : entry.targetId;
    return `${marker}[${index}] ${entry.alias} = ${label}`;
  }
  if (entry.type === "preview") {
    const source = optionalText(entry.entry.sourceId);
    return `${marker}[${index}] ${entry.entry.targetId}.${entry.entry.field} = ${previewValueSummary(entry.entry.value)}${source ? ` (${source})` : ""}`;
  }
  if (entry.type === "preview-session") {
    return `${marker}[${index}] ${entry.entry.sessionId} rev:${entry.entry.previewRevision ?? 0} status:${entry.entry.status}${entry.entry.invalidReason ? ` - ${entry.entry.invalidReason}` : ""}`;
  }
  if (entry.type === "note") {
    return `${marker}[${index}] ${entry.entry.text}`;
  }
  if (entry.type === "program") {
    return `${marker}[${index}] ${entry.entry.name} (${entry.entry.commands.length} command${entry.entry.commands.length === 1 ? "" : "s"})`;
  }
  return `${marker}[${index}] item`;
}

function resolveTreeTarget(state, session, token) {
  const trimmed = optionalText(token);
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const entry = session.lastEntries[Number(trimmed) - 1] ?? null;
    if (entry?.type === "container") return { kind: "container", value: entry.container };
    if (entry?.type === "record") return { kind: "record", value: entry.record };
    if (entry?.type === "alias") return { kind: "alias", value: entry };
    if (entry?.type === "preview") return { kind: "preview", value: entry.entry };
    if (entry?.type === "note") return { kind: "note", value: entry.entry };
    if (entry?.type === "program") return { kind: "program", value: entry.entry };
  }
  const normalized = normalizeNavigationToken(trimmed);
  const container = state.containerIndex.get(trimmed)
    ?? [...state.containerIndex.values()].find(entry =>
      normalizeNavigationToken(entry.id) === normalized
      || normalizeNavigationToken(entry.name) === normalized
      || normalizeNavigationToken(entry.label) === normalized)
    ?? null;
  if (container) return { kind: "container", value: container };
  const record = resolveRecordReference(state, session, trimmed);
  if (record) return { kind: "record", value: record };
  return null;
}

function resolveRecordReference(state, session, token) {
  const trimmed = optionalText(token);
  if (!trimmed) return null;
  if (trimmed === "this") {
    return session.selectionId ? (state.recordIndex.get(session.selectionId) ?? null) : null;
  }
  const aliasTarget = session.aliases[trimmed];
  if (aliasTarget) return state.recordIndex.get(aliasTarget) ?? null;
  if (/^\d+$/.test(trimmed)) {
    const entry = session.lastEntries[Number(trimmed) - 1] ?? null;
    if (entry?.type === "record") return entry.record;
    if (entry?.type === "alias") return entry.record ?? null;
  }
  if (state.recordIndex.has(trimmed)) return state.recordIndex.get(trimmed);
  const record = [...state.recordIndex.values()].find(entry => entry.title === trimmed);
  return record ?? null;
}

function renderRecordDetails(record) {
  const lines = [
    `${record.title}`,
    `id: ${record.id}`,
    `scope: ${record.scope}`,
    `kind: ${record.kind}`
  ];
  if (record.summary) lines.push(`summary: ${record.summary}`);

  if (record.scope === "platform") {
    if (record.metadata.status) lines.push(`status: ${record.metadata.status}`);
    if (record.metadata.owner) lines.push(`owner: ${record.metadata.owner}`);
    if (record.metadata.source) lines.push(`source: ${record.metadata.source}`);
    if (record.metadata.lifecycle.length) lines.push(`lifecycle: ${record.metadata.lifecycle.join(", ")}`);
    if (record.metadata.command) lines.push(`command: ${record.metadata.command}`);
    if (record.metadata.sourceDependencies.length) {
      lines.push("source dependencies:");
      for (const dependency of record.metadata.sourceDependencies.slice(0, 8)) {
        lines.push(`  - ${dependency}`);
      }
    }
  } else {
    if (record.metadata.context) lines.push(`context: ${record.metadata.context}`);
    if (record.metadata.surfaceLabel) lines.push(`surface: ${record.metadata.surfaceLabel}`);
    if (record.metadata.badges.length) lines.push(`badges: ${record.metadata.badges.join(", ")}`);
    if (record.metadata.properties.length) {
      lines.push("properties:");
      for (const property of record.metadata.properties.slice(0, 8)) {
        lines.push(`  - ${property.key}: ${formatValue(property.value?.value ?? property.value?.target ?? property.value)}`);
      }
    }
    if (record.metadata.values.length) {
      lines.push("values:");
      for (const value of record.metadata.values.slice(0, 8)) {
        lines.push(`  - ${value.key}: ${formatValue(value.value?.value ?? value.value?.target ?? value.value)}`);
      }
    }
    if (record.metadata.processEvents.length) {
      lines.push("process events:");
      for (const event of record.metadata.processEvents.slice(0, 8)) {
        lines.push(`  - ${event.event} (${event.stepCount} step${event.stepCount === 1 ? "" : "s"})`);
      }
    }
    if (record.metadata.recentWitnesses.length) {
      lines.push("recent witnesses:");
      for (const witness of record.metadata.recentWitnesses.slice(0, 6)) {
        lines.push(`  - ${witness.process} by ${witness.actor}`);
      }
    }
  }

  if (record.sourceHints.length) {
    lines.push("provenance:");
    for (const source of record.sourceHints.slice(0, 8)) {
      const location = source.line ? `${source.file}:${source.line}` : source.file;
      const detailBits = [optionalText(source.section), optionalText(source.sourceLanguage)].filter(Boolean).join(" | ");
      lines.push(`  - ${location}${detailBits ? ` (${detailBits})` : ""}`);
    }
  }
  return lines.join("\n");
}

function summarizeStatus(state, session) {
  const currentPath = buildTuiPathText(state, session);
  const resultView = session.resultView ?? null;
  const materializedResultView = resultView ? materializeResultView(resultView) : null;
  const navigationSummary = buildWorkbenchNavigationModel(state, session, {
    inspectorTab: "inspect",
    resultView,
    materializedResultView,
    selectedIndex: 0
  }).chips.map(chip => chip.label).join(" > ");
  const previewAvailability = state.runtimeContext?.appProject
    ? (previewManagerForState(state) ? null : "preview session manager unavailable")
    : "preview sessions unavailable in repo self-model mode";
  const previewState = previewAvailability
    ? `unavailable (${previewAvailability})`
    : (session.previewSessionId
        ? `${session.previewStatus}${session.invalidReason ? ` (${session.invalidReason})` : ""}`
        : "inactive");
  return [
    `mode: detached`,
    `navigation: ${navigationSummary}`,
    `path: ${currentPath}`,
    `focus kind: ${session.focusKind ?? "(none)"}`,
    `focus id: ${session.focusId ?? "(none)"}`,
    `selection: ${session.selectionId || "(none)"}`,
    `aliases: ${Object.keys(session.aliases).length}`,
    `preview session: ${session.previewSessionId ?? "(none)"}`,
    `preview base revision: ${session.baseAppRevision ?? "(none)"}`,
    `preview revision: ${session.previewRevision ?? 0}`,
    `preview status: ${previewState}`,
    `preview writes: ${previewAvailability ? "unavailable" : "preview-only authored property edits"}`,
    `last preview edit: ${session.lastPreviewMutation ? formatPreviewMutationSummary(session.lastPreviewMutation) : "(none)"}`,
    `notes: ${session.notes.length}`,
    `programs: ${Object.keys(session.programs).length}`,
    `world records: ${state.worldRecords.length}`,
    `platform records: ${state.platformRecords.length}`,
    `app: ${state.runtimeContext.appProject?.appRoot ?? "(repo self-model only)"}`,
    `world home: ${state.runtimeContext.operatorContract?.worldHome ?? "(ephemeral)"}`
  ].join("\n");
}

export function buildTuiPrompt(state, session) {
  return `${buildTuiPathText(state, session)}> `;
}

function buildTuiPathText(state, session) {
  const pathIds = currentPathEntries(session);
  if (isContextFocusActive(session)) {
    const labels = pathIds.map(id => state.containerIndex.get(id)?.label ?? id);
    return [focusRootLabel(session), ...labels].join("/");
  }
  if (!pathIds.length) return "root";
  const labels = pathIds.map(id => state.containerIndex.get(id)?.label ?? id);
  return labels.join("/");
}

function isContextRecord(record) {
  return record?.scope === "world" && record?.kind === "context";
}

function deepLinkKindForRecord(record) {
  return isContextRecord(record) ? "context" : "record";
}

function sourceLocationLabel(file, line = null) {
  return line ? `${file}:${line}` : file;
}

function buildRecordDeepLink(state, record, overrides = {}) {
  if (!record) return null;
  const sourceHint = record.sourceHints?.[0] ?? null;
  const kind = overrides.kind ?? deepLinkKindForRecord(record);
  return withOperatorUri({
    kind,
    label: overrides.label ?? record.title,
    targetId: record.id,
    scope: record.scope,
    contextId: overrides.contextId ?? (kind === "context" ? record.id : optionalText(record.metadata?.context)),
    sourcePath: overrides.sourcePath ?? sourceHint?.file ?? null,
    sourceLine: overrides.sourceLine ?? sourceHint?.line ?? null,
    detail: overrides.detail ?? [
      record.kind ? `<${record.kind}>` : null,
      optionalText(record.summary)
    ].filter(Boolean).join(" - "),
    actionable: overrides.actionable ?? true,
    disabledReason: overrides.disabledReason ?? null,
    ownerTargetId: overrides.ownerTargetId ?? record.id,
    section: overrides.section ?? null
  });
}

function buildSourceDeepLink(source, record, overrides = {}) {
  const file = optionalText(overrides.sourcePath ?? source?.file);
  if (!file) return null;
  const line = Number(overrides.sourceLine ?? source?.startLine ?? source?.line ?? 0) || null;
  return withOperatorUri({
    kind: "source",
    label: overrides.label ?? sourceLocationLabel(file, line),
    targetId: null,
    scope: record?.scope ?? "world",
    contextId: optionalText(record?.metadata?.context),
    sourcePath: file,
    sourceLine: line,
    sourceId: optionalText(overrides.sourceId ?? source?.sourceId) ?? null,
    sourceLanguage: optionalText(overrides.sourceLanguage ?? source?.sourceLanguage) ?? null,
    sourceKind: optionalText(overrides.sourceKind ?? source?.sourceKind ?? source?.section) ?? null,
    detail: overrides.detail ?? [
      optionalText(source?.sourceKind ?? source?.section),
      optionalText(source?.sourceLanguage)
    ].filter(Boolean).join(" | "),
    actionable: overrides.actionable ?? true,
    disabledReason: overrides.disabledReason ?? null,
    ownerTargetId: overrides.ownerTargetId ?? record?.id ?? null,
    section: overrides.section ?? "source"
  });
}

function buildProvenanceDeepLink(reason, record) {
  const label = [optionalText(reason?.kind), optionalText(reason?.value)].filter(Boolean).join(": ");
  return withOperatorUri({
    kind: "provenance",
    label: label || "provenance",
    targetId: record?.id ?? null,
    scope: record?.scope ?? "world",
    contextId: optionalText(record?.metadata?.context),
    sourcePath: null,
    sourceLine: null,
    detail: "Provenance reason",
    actionable: Boolean(record?.id),
    disabledReason: record?.id ? null : "owning record unavailable.",
    ownerTargetId: record?.id ?? null,
    section: "provenance"
  });
}

function buildProvenanceEntry({
  kind,
  label,
  detail = "",
  actionable = false,
  actionKind = "info",
  scope = "world",
  targetId = null,
  ownerTargetId = null,
  contextId = null,
  sourcePath = null,
  sourceLine = null,
  sourceId = null,
  sourceLanguage = null,
  sourceKind = null,
  disabledReason = null,
  payload = null
} = {}) {
  const entry = {
    kind: optionalText(kind) ?? "reason",
    label: optionalText(label) ?? "(unnamed)",
    detail: optionalText(detail) ?? "",
    actionable: Boolean(actionable),
    actionKind: optionalText(actionKind) ?? "info",
    scope: optionalText(scope) ?? "world",
    targetId: optionalText(targetId) ?? null,
    ownerTargetId: optionalText(ownerTargetId) ?? null,
    contextId: optionalText(contextId) ?? null,
    sourcePath: optionalText(sourcePath) ?? null,
    sourceLine: Number(sourceLine ?? 0) || null,
    sourceId: optionalText(sourceId) ?? null,
    sourceLanguage: optionalText(sourceLanguage) ?? null,
    sourceKind: optionalText(sourceKind) ?? null,
    disabledReason: optionalText(disabledReason) ?? null,
    payload: payload && typeof payload === "object" ? deepClone(payload) : null
  };
  entry.uri = operatorUriForProvenanceEntry(entry);
  return entry;
}

function provenanceEntryOrder(entry) {
  switch (entry?.kind) {
    case "breadcrumb":
      return 10;
    case "candidate":
      return 20;
    case "source":
      return 30;
    case "preview-session":
      return 40;
    case "reason":
      return 50;
    default:
      return 60;
  }
}

function provenanceEntryKey(entry) {
  return JSON.stringify([
    entry?.kind,
    entry?.label,
    entry?.targetId,
    entry?.ownerTargetId,
    entry?.sourcePath,
    entry?.sourceLine,
    entry?.sourceId,
    entry?.actionKind
  ]);
}

function provenanceEntriesMatch(left, right) {
  return provenanceEntryKey(left) === provenanceEntryKey(right);
}

function provenanceEntryMarker(entry) {
  switch (entry?.kind) {
    case "breadcrumb":
      return "BREADCRUMB";
    case "candidate":
      return "CANDIDATE";
    case "source":
      return "SOURCE";
    case "preview-session":
      return "PREVIEW";
    case "reason":
      return "REASON";
    default:
      return "ENTRY";
  }
}

function collectProvenanceEntries(record, inspection = null, session = null, override = null) {
  if (Array.isArray(override?.entries) && override.entries.length) {
    return override.entries.map(entry => buildProvenanceEntry(entry)).filter(Boolean);
  }
  const entries = [];
  const seen = new Set();
  const push = entry => {
    const normalized = buildProvenanceEntry(entry);
    const key = provenanceEntryKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(normalized);
  };
  const recordContextId = optionalText(record?.metadata?.context) ?? null;
  for (const breadcrumb of arrayWrap(inspection?.breadcrumbs)) {
    const target = optionalText(breadcrumb?.target ?? breadcrumb?.id) ?? null;
    const label = optionalText(breadcrumb?.label) ?? target ?? record?.title ?? "breadcrumb";
    if (target && target !== record?.id) {
      push({
        kind: "breadcrumb",
        label,
        detail: "Breadcrumb target",
        actionable: true,
        actionKind: "inspect-record",
        scope: record?.scope ?? "world",
        targetId: target,
        ownerTargetId: record?.id ?? null,
        contextId: recordContextId,
        payload: { breadcrumb }
      });
      continue;
    }
    push({
      kind: "breadcrumb",
      label,
      detail: "Owning record breadcrumb",
      actionable: Boolean(record?.id),
      actionKind: "open-provenance",
      scope: record?.scope ?? "world",
      targetId: record?.id ?? null,
      ownerTargetId: record?.id ?? null,
      contextId: recordContextId,
      disabledReason: record?.id ? null : "owning record unavailable.",
      payload: { breadcrumb }
    });
  }
  for (const candidate of arrayWrap(inspection?.candidates)) {
    const target = optionalText(candidate?.target) ?? null;
    if (!target || target === record?.id) continue;
    push({
      kind: "candidate",
      label: target,
      detail: [
        optionalText(candidate?.matchType),
        optionalText(candidate?.confidence)
      ].filter(Boolean).join(" | ") || "Candidate target",
      actionable: true,
      actionKind: "inspect-record",
      scope: record?.scope ?? "world",
      targetId: target,
      ownerTargetId: record?.id ?? null,
      contextId: recordContextId,
      payload: { candidate }
    });
  }
  const sourceEntries = inspection?.sources?.length
    ? inspection.sources
    : arrayWrap(record?.sourceHints).map(source => ({
        file: source.file,
        sourceId: null,
        startLine: source.line ?? null,
        endLine: source.endLine ?? null,
        sourceLanguage: source.sourceLanguage ?? null,
        sourceKind: source.section ?? null
      }));
  for (const source of sourceEntries) {
    const sourcePath = optionalText(source?.file) ?? null;
    if (!sourcePath) continue;
    const sourceLine = Number(source?.startLine ?? source?.line ?? 0) || null;
    const location = sourceLocationLabel(sourcePath, sourceLine);
    push({
      kind: "source",
      label: location,
      detail: [
        optionalText(source?.sourceKind ?? source?.section),
        optionalText(source?.sourceLanguage)
      ].filter(Boolean).join(" | ") || "Source",
      actionable: Boolean(record?.id),
      actionKind: "open-source",
      scope: record?.scope ?? "world",
      targetId: record?.id ?? null,
      ownerTargetId: record?.id ?? null,
      contextId: recordContextId,
      sourcePath,
      sourceLine,
      sourceId: optionalText(source?.sourceId) ?? null,
      sourceLanguage: optionalText(source?.sourceLanguage) ?? null,
      sourceKind: optionalText(source?.sourceKind ?? source?.section) ?? null
    });
  }
  if (record?.scope !== "platform" && session?.previewSessionId) {
    push({
      kind: "preview-session",
      label: session.previewSessionId,
      detail: `base ${session.baseAppRevision ?? "(none)"} | rev ${session.previewRevision ?? 0} | ${session.previewStatus}`,
      actionable: true,
      actionKind: "open-preview-session",
      scope: "preview",
      targetId: session.previewSessionId,
      ownerTargetId: record?.id ?? null,
      contextId: recordContextId
    });
  }
  for (const reason of arrayWrap(inspection?.provenance?.reasons)) {
    const label = [optionalText(reason?.kind), optionalText(reason?.value)].filter(Boolean).join(": ") || JSON.stringify(reason);
    push({
      kind: "reason",
      label,
      detail: "Provenance reason",
      actionable: false,
      actionKind: "info",
      scope: record?.scope ?? "world",
      targetId: record?.id ?? null,
      ownerTargetId: record?.id ?? null,
      contextId: recordContextId,
      disabledReason: "reason rows are informational only.",
      payload: { reason }
    });
  }
  return entries.sort((left, right) => {
    const priority = provenanceEntryOrder(left) - provenanceEntryOrder(right);
    if (priority !== 0) return priority;
    return 0;
  });
}

function resolveActiveProvenanceIndex(entries, override = null) {
  if (!entries.length) return 0;
  const preferredIndex = Number(override?.activeProvenanceIndex ?? -1);
  if (preferredIndex >= 0 && preferredIndex < entries.length) return preferredIndex;
  const probe = buildProvenanceEntry(override ?? {});
  if (optionalText(probe.kind) || optionalText(probe.label) || optionalText(probe.sourcePath) || optionalText(probe.targetId)) {
    const matchIndex = entries.findIndex(entry => provenanceEntriesMatch(entry, probe));
    if (matchIndex >= 0) return matchIndex;
  }
  return 0;
}

function renderProvenanceListLines(entries, activeProvenanceIndex) {
  if (!entries.length) return ["entries: (none)"];
  return [
    "entries:",
    ...entries.map((entry, index) => {
      const marker = index === activeProvenanceIndex ? "*" : " ";
      const cue = entry.actionable ? "open" : "info";
      const detail = [entry.detail, entry.disabledReason].filter(Boolean).join(" | ");
      return ` ${marker} ${index + 1}. [${provenanceEntryMarker(entry)}] ${entry.label} [${cue}]${detail ? ` - ${detail}` : ""}`;
    })
  ];
}

function renderProvenanceEntryDetailLines(entry) {
  if (!entry) return ["active entry: (none)"];
  const lines = [
    "active entry:",
    `kind: ${entry.kind}`,
    `label: ${entry.label}`,
    `action: ${entry.actionKind}`
  ];
  if (entry.detail) lines.push(`detail: ${entry.detail}`);
  if (entry.targetId) lines.push(`target: ${entry.targetId}`);
  if (entry.ownerTargetId) lines.push(`owner: ${entry.ownerTargetId}`);
  if (entry.contextId) lines.push(`context: ${entry.contextId}`);
  if (entry.sourcePath) lines.push(`source: ${sourceLocationLabel(entry.sourcePath, entry.sourceLine)}`);
  if (entry.sourceId) lines.push(`source id: ${entry.sourceId}`);
  if (entry.sourceLanguage) lines.push(`source language: ${entry.sourceLanguage}`);
  if (entry.sourceKind) lines.push(`source kind: ${entry.sourceKind}`);
  if (entry.disabledReason) lines.push(`disabled: ${entry.disabledReason}`);
  return lines;
}

function buildPreviewSessionDeepLink(session, record) {
  if (!session?.previewSessionId) return null;
  return withOperatorUri({
    kind: "preview-session",
    label: session.previewSessionId,
    targetId: session.previewSessionId,
    scope: "preview",
    contextId: optionalText(record?.metadata?.context),
    sourcePath: null,
    sourceLine: null,
    detail: `base ${session.baseAppRevision ?? "(none)"} | rev ${session.previewRevision ?? 0} | ${session.previewStatus}`,
    actionable: true,
    disabledReason: null,
    ownerTargetId: record?.id ?? null,
    section: "preview"
  });
}

function buildSavedViewDeepLink(name) {
  const viewName = optionalText(name);
  if (!viewName) return null;
  return withOperatorUri({
    kind: "view",
    label: viewName,
    targetId: viewName,
    scope: "session",
    contextId: null,
    sourcePath: null,
    sourceLine: null,
    detail: "Saved result view",
    actionable: true,
    disabledReason: null,
    ownerTargetId: null,
    section: "view"
  });
}

function encodeOperatorUriSegment(value) {
  return encodeURIComponent(String(value ?? ""));
}

function withOperatorUri(reference) {
  if (!reference || typeof reference !== "object") return reference;
  const uri = operatorUriForReference(reference);
  return {
    ...reference,
    uri
  };
}

export function operatorUriForReference(reference = null) {
  if (!reference || typeof reference !== "object") return null;
  if (reference.kind === "record") {
    const scope = optionalText(reference.scope) ?? "world";
    const targetId = optionalText(reference.targetId);
    if (!targetId) return null;
    return `operator://record/${encodeOperatorUriSegment(scope)}/${encodeOperatorUriSegment(targetId)}`;
  }
  if (reference.kind === "context") {
    const contextId = optionalText(reference.contextId ?? reference.targetId);
    if (!contextId) return null;
    return `operator://context/${encodeOperatorUriSegment(contextId)}`;
  }
  if (reference.kind === "source") {
    const scope = optionalText(reference.scope) ?? "world";
    const ownerTargetId = optionalText(reference.ownerTargetId ?? reference.targetId);
    if (!ownerTargetId) return null;
    const params = new URLSearchParams();
    if (reference.sourcePath) params.set("file", String(reference.sourcePath));
    if (reference.sourceLine !== undefined && reference.sourceLine !== null) params.set("line", String(reference.sourceLine));
    if (reference.sourceId) params.set("sourceId", String(reference.sourceId));
    if (reference.sourceLanguage) params.set("sourceLanguage", String(reference.sourceLanguage));
    if (reference.sourceKind) params.set("sourceKind", String(reference.sourceKind));
    const search = params.toString();
    return `operator://source/${encodeOperatorUriSegment(scope)}/${encodeOperatorUriSegment(ownerTargetId)}${search ? `?${search}` : ""}`;
  }
  if (reference.kind === "provenance") {
    const scope = optionalText(reference.scope) ?? "world";
    const ownerTargetId = optionalText(reference.ownerTargetId ?? reference.targetId);
    if (!ownerTargetId) return null;
    return `operator://provenance/${encodeOperatorUriSegment(scope)}/${encodeOperatorUriSegment(ownerTargetId)}`;
  }
  if (reference.kind === "preview-session") {
    const sessionId = optionalText(reference.targetId);
    if (!sessionId) return null;
    const params = new URLSearchParams();
    if (reference.ownerTargetId) params.set("owner", String(reference.ownerTargetId));
    const search = params.toString();
    return `operator://preview-session/${encodeOperatorUriSegment(sessionId)}${search ? `?${search}` : ""}`;
  }
  if (reference.kind === "view") {
    const viewName = optionalText(reference.targetId ?? reference.label);
    if (!viewName) return null;
    return `operator://view/${encodeOperatorUriSegment(viewName)}`;
  }
  return null;
}

export function operatorUriForProvenanceEntry(entry = null) {
  if (!entry || typeof entry !== "object") return null;
  if (entry.actionKind === "inspect-record") {
    return operatorUriForReference({
      kind: "record",
      scope: entry.scope ?? "world",
      targetId: entry.targetId
    });
  }
  if (entry.actionKind === "open-provenance") {
    return operatorUriForReference({
      kind: "provenance",
      scope: entry.scope ?? "world",
      targetId: entry.targetId ?? entry.ownerTargetId,
      ownerTargetId: entry.ownerTargetId ?? entry.targetId
    });
  }
  if (entry.actionKind === "open-source") {
    return operatorUriForReference({
      kind: "source",
      scope: entry.scope ?? "world",
      targetId: entry.targetId ?? entry.ownerTargetId,
      ownerTargetId: entry.ownerTargetId ?? entry.targetId,
      sourcePath: entry.sourcePath ?? null,
      sourceLine: entry.sourceLine ?? null,
      sourceId: entry.sourceId ?? null,
      sourceLanguage: entry.sourceLanguage ?? null,
      sourceKind: entry.sourceKind ?? null
    });
  }
  if (entry.actionKind === "open-preview-session") {
    return operatorUriForReference({
      kind: "preview-session",
      targetId: entry.targetId,
      ownerTargetId: entry.ownerTargetId ?? null
    });
  }
  return null;
}

function parseOperatorUri(uriText) {
  const text = optionalText(uriText);
  if (!text) return { ok: false, error: "missing operator URI." };
  let parsed;
  try {
    parsed = new URL(text);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
  if (parsed.protocol !== "operator:") {
    return { ok: false, error: `unsupported operator URI scheme: ${parsed.protocol}` };
  }
  const kind = optionalText(parsed.hostname);
  const pathSegments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map(segment => decodeURIComponent(segment));
  if (!kind) return { ok: false, error: "operator URI is missing a target kind." };
  if (kind === "record" || kind === "source" || kind === "provenance") {
    if (pathSegments.length < 2) {
      return { ok: false, error: `operator URI ${kind} target is incomplete.` };
    }
    return {
      ok: true,
      kind,
      scope: pathSegments[0],
      targetId: pathSegments.slice(1).join("/"),
      sourcePath: parsed.searchParams.get("file") ?? null,
      sourceLine: Number(parsed.searchParams.get("line") ?? 0) || null,
      sourceId: parsed.searchParams.get("sourceId") ?? null,
      sourceLanguage: parsed.searchParams.get("sourceLanguage") ?? null,
      sourceKind: parsed.searchParams.get("sourceKind") ?? null
    };
  }
  if (kind === "context" || kind === "view" || kind === "preview-session") {
    if (!pathSegments.length) {
      return { ok: false, error: `operator URI ${kind} target is incomplete.` };
    }
    return {
      ok: true,
      kind,
      targetId: pathSegments.join("/"),
      ownerTargetId: parsed.searchParams.get("owner") ?? null
    };
  }
  return { ok: false, error: `unsupported operator URI kind: ${kind}` };
}

function normalizeDeepLinkKey(reference) {
  return JSON.stringify([
    reference.kind,
    reference.label,
    reference.targetId,
    reference.contextId,
    reference.sourcePath,
    reference.sourceLine,
    reference.ownerTargetId,
    reference.section
  ]);
}

function deepLinkPriority(reference) {
  switch (reference?.kind) {
    case "record":
      return 10;
    case "context":
      return 20;
    case "preview-session":
      return 30;
    case "source":
      return 40;
    case "provenance":
      return 50;
    default:
      return 60;
  }
}

function sortDeepLinks(references = []) {
  return [...references].sort((left, right) => {
    const priority = deepLinkPriority(left) - deepLinkPriority(right);
    if (priority !== 0) return priority;
    const actionable = Number(Boolean(right?.actionable)) - Number(Boolean(left?.actionable));
    if (actionable !== 0) return actionable;
    const label = String(left?.label ?? "").localeCompare(String(right?.label ?? ""));
    if (label !== 0) return label;
    return String(left?.targetId ?? "").localeCompare(String(right?.targetId ?? ""));
  });
}

function formatDeepLink(reference) {
  const kind = String(reference?.kind ?? "link").toUpperCase();
  const action = reference?.actionable ? "open" : "info";
  const lines = [
    `${kind} ${reference?.label ?? "(unnamed)"}`,
    `action: ${action}`
  ];
  if (reference?.uri) lines.push(`uri: ${reference.uri}`);
  if (reference?.targetId) lines.push(`target: ${reference.targetId}`);
  if (reference?.contextId) lines.push(`context: ${reference.contextId}`);
  if (reference?.sourcePath) lines.push(`source: ${sourceLocationLabel(reference.sourcePath, reference.sourceLine)}`);
  if (reference?.detail) lines.push(`detail: ${reference.detail}`);
  if (reference?.disabledReason) lines.push(`disabled: ${reference.disabledReason}`);
  return lines.join("\n");
}

function formatDeepLinkList(references = []) {
  if (!references.length) return "(no references)";
  return references.map((reference, index) => {
    const cue = reference.actionable ? "open" : "info";
    const detail = [reference.detail, reference.disabledReason].filter(Boolean).join(" | ");
    return `[${index + 1}] ${String(reference.kind ?? "link").toUpperCase()} ${reference.label} [${cue}]${detail ? ` - ${detail}` : ""}`;
  }).join("\n");
}

const REFERENCES_WORKBENCH_GROUPS = Object.freeze([
  { id: "contexts", label: "Contexts & Breadcrumbs" },
  { id: "records", label: "Record Candidates" },
  { id: "sources", label: "Source Links" },
  { id: "provenance", label: "Provenance" },
  { id: "preview", label: "Preview Sessions" }
]);

function referencesWorkbenchGroupIdForReference(reference = null) {
  if (reference?.kind === "context") return "contexts";
  if (reference?.kind === "record") return "records";
  if (reference?.kind === "source") return "sources";
  if (reference?.kind === "preview-session") return "preview";
  if (reference?.kind === "provenance") return "provenance";
  return "records";
}

function referencesWorkbenchGroupIdForProvenanceEntry(entry = null) {
  if (entry?.kind === "breadcrumb") return "contexts";
  if (entry?.kind === "candidate") return "records";
  if (entry?.kind === "source") return "sources";
  if (entry?.kind === "preview-session") return "preview";
  return "provenance";
}

function referencesWorkbenchRowKey(row = null) {
  return JSON.stringify([
    row?.groupId,
    row?.uri,
    row?.kind,
    row?.label,
    row?.targetId,
    row?.sourcePath,
    row?.sourceLine
  ]);
}

function referencesWorkbenchRowFromReference(reference = null) {
  if (!reference) return null;
  return {
    sourceType: "reference",
    groupId: referencesWorkbenchGroupIdForReference(reference),
    kind: reference.kind ?? "link",
    label: reference.label ?? "(unnamed)",
    detail: [reference.detail, reference.disabledReason].filter(Boolean).join(" | "),
    actionable: Boolean(reference.actionable && reference.uri),
    uri: reference.uri ?? null,
    targetId: reference.targetId ?? null,
    contextId: reference.contextId ?? null,
    sourcePath: reference.sourcePath ?? null,
    sourceLine: reference.sourceLine ?? null,
    detailLines: formatDeepLink(reference).split("\n")
  };
}

function referencesWorkbenchRowFromProvenanceEntry(entry = null) {
  if (!entry) return null;
  const uri = operatorUriForProvenanceEntry(entry);
  const detailLines = renderProvenanceEntryDetailLines(entry);
  if (uri) detailLines.push(`uri: ${uri}`);
  return {
    sourceType: "provenance-entry",
    groupId: referencesWorkbenchGroupIdForProvenanceEntry(entry),
    kind: entry.kind ?? "entry",
    label: entry.label ?? "(unnamed)",
    detail: [entry.detail, entry.actionKind, entry.disabledReason].filter(Boolean).join(" | "),
    actionable: Boolean(entry.actionable && uri),
    uri,
    targetId: entry.targetId ?? null,
    contextId: entry.contextId ?? null,
    sourcePath: entry.sourcePath ?? null,
    sourceLine: entry.sourceLine ?? null,
    detailLines
  };
}

function buildReferencesWorkbenchModel(inspector, activeRowIndex = 0) {
  const groupedRows = new Map(REFERENCES_WORKBENCH_GROUPS.map(group => [group.id, []]));
  const seen = new Set();
  const pushRow = row => {
    if (!row) return;
    const key = referencesWorkbenchRowKey(row);
    if (seen.has(key)) return;
    seen.add(key);
    if (!groupedRows.has(row.groupId)) groupedRows.set(row.groupId, []);
    groupedRows.get(row.groupId).push(row);
  };

  for (const reference of arrayWrap(inspector?.references)) {
    pushRow(referencesWorkbenchRowFromReference(reference));
  }
  for (const entry of arrayWrap(inspector?.provenanceEntries)) {
    pushRow(referencesWorkbenchRowFromProvenanceEntry(entry));
  }

  const rows = [];
  const groups = [];
  for (const group of REFERENCES_WORKBENCH_GROUPS) {
    const entries = groupedRows.get(group.id) ?? [];
    if (!entries.length) continue;
    const startIndex = rows.length;
    rows.push(...entries);
    groups.push({
      id: group.id,
      label: group.label,
      startIndex,
      count: entries.length
    });
  }

  const normalizedIndex = Math.min(Math.max(0, Number(activeRowIndex ?? 0) || 0), Math.max(0, rows.length - 1));
  const activeRow = rows[normalizedIndex] ?? null;
  return {
    title: `${inspector?.title ?? "References"} References`,
    groups,
    rows,
    activeRowIndex: normalizedIndex,
    detailLines: activeRow?.detailLines ?? ["Select a reference to inspect its address and action."]
  };
}

function buildSourceWorkbenchRow(entry = null, scope = "world", ownerTargetId = null) {
  if (!entry) return null;
  const detail = [entry.sourceOrigin, entry.sourceKind, entry.sourceLanguage].filter(Boolean).join(" | ");
  return {
    kind: "source",
    label: sourceLocationLabel(entry.file, entry.line),
    detail,
    actionable: Boolean(entry.file),
    uri: operatorUriForReference({
      kind: "source",
      scope,
      ownerTargetId,
      targetId: ownerTargetId,
      sourcePath: entry.file ?? null,
      sourceLine: entry.line ?? null,
      sourceId: entry.sourceId ?? null,
      sourceLanguage: entry.sourceLanguage ?? null,
      sourceKind: entry.sourceKind ?? null
    }),
    targetId: ownerTargetId ?? null,
    ownerTargetId: ownerTargetId ?? null,
    sourcePath: entry.file ?? null,
    sourceLine: entry.line ?? null,
    sourceId: entry.sourceId ?? null,
    sourceLanguage: entry.sourceLanguage ?? null,
    sourceKind: entry.sourceKind ?? null,
    detailLines: []
  };
}

async function buildSourceWorkbenchModel(record, inspection, activeRowIndex = 0, override = null) {
  const representation = await buildSourceRepresentation(record, inspection, {
    ...(override && typeof override === "object" ? override : {}),
    activeSourceIndex: activeRowIndex
  });
  const rows = arrayWrap(representation.sources).map(entry =>
    buildSourceWorkbenchRow(entry, record?.scope ?? "world", record?.id ?? null));
  rows.forEach((row, index) => {
    if (row) row.baseIndex = index;
  });
  const normalizedIndex = Math.min(
    Math.max(0, Number(representation.activeSourceIndex ?? activeRowIndex ?? 0) || 0),
    Math.max(0, rows.length - 1)
  );
  return {
    title: `${record?.title ?? "Source"} Source`,
    rows,
    activeRowIndex: normalizedIndex,
    detailLines: representation.lines,
    target: representation.target ?? null
  };
}

function sourceEntryLabel(entry) {
  const span = entry.endLine && entry.endLine !== entry.line
    ? `${entry.line}-${entry.endLine}`
    : `${entry.line ?? "?"}`;
  const detail = [entry.sourceOrigin, entry.sourceKind].filter(Boolean).join(" | ");
  return `${sourceLocationLabel(entry.file, entry.line)}${detail ? ` (${detail})` : ""}`;
}

function normalizeSourceEntry(raw, sourceOrigin) {
  const file = optionalText(raw?.file);
  if (!file) return null;
  const line = Number(raw?.startLine ?? raw?.line ?? 0) || null;
  const endLine = Number(raw?.endLine ?? 0) || line || null;
  const sourceId = optionalText(raw?.sourceId) ?? null;
  const sourceLanguage = optionalText(raw?.sourceLanguage) ?? null;
  const sourceKind = optionalText(raw?.sourceKind ?? raw?.section) ?? null;
  const entry = {
    file,
    line,
    endLine,
    sourceId,
    sourceLanguage,
    sourceKind,
    sourceOrigin,
    label: ""
  };
  entry.label = sourceEntryLabel(entry);
  return entry;
}

function sourceEntryKey(entry) {
  return [
    optionalText(entry?.file) ?? "",
    Number(entry?.line ?? 0) || 0,
    optionalText(entry?.sourceId) ?? ""
  ].join("\u0000");
}

function sourceOriginPriority(origin) {
  switch (origin) {
    case "editable":
      return 0;
    case "inspection":
      return 1;
    case "record-hint":
      return 2;
    default:
      return 3;
  }
}

function collectSourceEntries(record, inspection = null, override = null) {
  const collected = [];
  const pushEntry = (entry, sourceOrigin) => {
    const normalized = normalizeSourceEntry(entry, sourceOrigin);
    if (normalized) collected.push(normalized);
  };
  if (inspection?.editableSource?.file) {
    const matchingInspectionSource = arrayWrap(inspection?.sources).find(source =>
      source?.file === inspection.editableSource.file
      && (source?.sourceId ?? null) === (inspection.editableSource.sourceId ?? null))
      ?? arrayWrap(inspection?.sources).find(source => source?.file === inspection.editableSource.file)
      ?? null;
    pushEntry({
      file: inspection.editableSource.file,
      startLine: matchingInspectionSource?.startLine ?? matchingInspectionSource?.line ?? null,
      endLine: matchingInspectionSource?.endLine ?? null,
      sourceId: inspection.editableSource.sourceId ?? null,
      sourceLanguage: inspection.editableSource.sourceLanguage ?? null,
      sourceKind: "editable-source"
    }, "editable");
  }
  for (const source of arrayWrap(inspection?.sources)) {
    pushEntry(source, "inspection");
  }
  for (const sourceHint of arrayWrap(record?.sourceHints)) {
    pushEntry({
      file: sourceHint.file,
      line: sourceHint.line ?? null,
      endLine: sourceHint.endLine ?? null,
      sourceId: null,
      sourceLanguage: sourceHint.sourceLanguage ?? null,
      sourceKind: sourceHint.section ?? null
    }, "record-hint");
  }
  if (Array.isArray(override?.sources) && override.sources.length) {
    return override.sources.map(entry => normalizeSourceEntry(entry, entry.sourceOrigin ?? "inspection")).filter(Boolean);
  }
  const unique = new Map();
  for (const entry of collected) {
    const key = sourceEntryKey(entry);
    if (!unique.has(key)) unique.set(key, entry);
  }
  return [...unique.values()].sort((left, right) => {
    const priority = sourceOriginPriority(left.sourceOrigin) - sourceOriginPriority(right.sourceOrigin);
    if (priority !== 0) return priority;
    const file = left.file.localeCompare(right.file);
    if (file !== 0) return file;
    return (left.line ?? 0) - (right.line ?? 0);
  });
}

function resolveActiveSourceIndex(sources, override = null) {
  if (!sources.length) return 0;
  const preferredIndex = Number(override?.activeSourceIndex ?? -1);
  if (preferredIndex >= 0 && preferredIndex < sources.length) return preferredIndex;
  const preferredPath = optionalText(override?.sourcePath);
  const preferredLine = Number(override?.sourceLine ?? 0) || null;
  const preferredSourceId = optionalText(override?.sourceId) ?? null;
  if (preferredPath) {
    const matchIndex = sources.findIndex(entry =>
      entry.file === preferredPath
      && (preferredLine === null || entry.line === preferredLine)
      && (preferredSourceId === null || entry.sourceId === preferredSourceId));
    if (matchIndex >= 0) return matchIndex;
  }
  return 0;
}

function renderSourceListLines(sources, activeSourceIndex) {
  if (!sources.length) return ["sources: (none)"];
  return [
    "sources:",
    ...sources.map((entry, index) => {
      const marker = index === activeSourceIndex ? "*" : " ";
      const span = entry.endLine && entry.endLine !== entry.line
        ? `${entry.line}-${entry.endLine}`
        : `${entry.line ?? "(none)"}`;
      const detail = [entry.sourceOrigin, entry.sourceKind, entry.sourceLanguage].filter(Boolean).join(" | ");
      return ` ${marker} ${index + 1}. ${entry.file}:${span}${detail ? ` (${detail})` : ""}`;
    })
  ];
}

async function readSourceExcerpt(file, startLine = null, endLine = null) {
  if (!file) {
    return {
      available: false,
      unavailableReason: "no source file is available for this target.",
      excerpt: []
    };
  }
  try {
    const content = await fs.readFile(file, "utf8");
    const allLines = String(content).replace(/\r\n/g, "\n").split("\n");
    const activeStartLine = Number(startLine ?? 0) || null;
    const activeEndLine = Number(endLine ?? 0) || activeStartLine || null;
    const excerptStartLine = activeStartLine
      ? Math.max(1, activeStartLine - SOURCE_EXCERPT_RADIUS)
      : 1;
    const excerptEndLine = activeEndLine
      ? Math.min(allLines.length, activeEndLine + SOURCE_EXCERPT_RADIUS)
      : Math.min(allLines.length, (SOURCE_EXCERPT_RADIUS * 2) + 1);
    const excerpt = [];
    for (let current = excerptStartLine; current <= excerptEndLine; current += 1) {
      excerpt.push({
        lineNumber: current,
        text: allLines[current - 1] ?? "",
        active: Boolean(activeStartLine && activeEndLine && current >= activeStartLine && current <= activeEndLine)
      });
    }
    return {
      available: true,
      unavailableReason: null,
      excerpt
    };
  } catch (error) {
    return {
      available: false,
      unavailableReason: error instanceof Error ? error.message : String(error),
      excerpt: []
    };
  }
}

async function buildSourceRepresentation(record, inspection = null, override = null) {
  const sources = collectSourceEntries(record, inspection, override);
  const activeSourceIndex = resolveActiveSourceIndex(sources, override);
  const activeSource = sources[activeSourceIndex] ?? null;
  const excerpt = await readSourceExcerpt(activeSource?.file ?? null, activeSource?.line ?? null, activeSource?.endLine ?? null);
  const title = activeSource?.file
    ? sourceLocationLabel(activeSource.file, activeSource.line)
    : `${record?.title ?? "Source"} Source`;
  const sourceListLines = renderSourceListLines(sources, activeSourceIndex);
  const activeSpan = activeSource?.endLine && activeSource?.endLine !== activeSource?.line
    ? `${activeSource.line}-${activeSource.endLine}`
    : `${activeSource?.line ?? "(none)"}`;
  const lines = [
    title,
    "kind: source",
    `owner: ${record?.id ?? "(none)"}`,
    `context: ${optionalText(record?.metadata?.context) ?? "(none)"}`,
    `path: ${activeSource?.file ?? "(none)"}`,
    `line: ${activeSpan}`,
    `status: ${excerpt.available ? "available" : "unavailable"}`
  ];
  if (activeSource?.sourceId) lines.push(`source id: ${activeSource.sourceId}`);
  if (activeSource?.sourceLanguage) lines.push(`source language: ${activeSource.sourceLanguage}`);
  if (activeSource?.sourceKind) lines.push(`source kind: ${activeSource.sourceKind}`);
  lines.push(...sourceListLines);
  if (!excerpt.available) {
    lines.push(`reason: ${excerpt.unavailableReason ?? "source excerpt unavailable."}`);
  } else if (!excerpt.excerpt.length) {
    lines.push("excerpt: (empty file)");
  } else {
    lines.push("excerpt:");
    for (const entry of excerpt.excerpt) {
      const marker = entry.active ? ">" : " ";
      lines.push(`${marker} ${String(entry.lineNumber).padStart(4)} | ${entry.text}`);
    }
  }
  return {
    title,
    lines,
    sources,
    activeSourceIndex,
    activeSource,
    sourceListLines,
    target: {
      kind: "source",
      id: activeSource?.file ?? null,
      label: title,
      ownerTargetId: record?.id ?? null,
      contextId: optionalText(record?.metadata?.context),
      mode: "source",
      uri: operatorUriForReference({
        kind: "source",
        scope: record?.scope ?? "world",
        ownerTargetId: record?.id ?? null,
        targetId: record?.id ?? null,
        sourcePath: activeSource?.file ?? null,
        sourceLine: activeSource?.line ?? null,
        sourceId: activeSource?.sourceId ?? null,
        sourceLanguage: activeSource?.sourceLanguage ?? null,
        sourceKind: activeSource?.sourceKind ?? null
      }),
      pinned: true,
      sourceAvailable: excerpt.available,
      previewBacked: Boolean(inspection),
      activeSourceIndex,
      sources
    }
  };
}

function buildProvenanceRepresentation(record, inspection = null, session = null, override = null) {
  const entries = collectProvenanceEntries(record, inspection, session, override);
  const activeProvenanceIndex = resolveActiveProvenanceIndex(entries, override);
  const activeProvenanceEntry = entries[activeProvenanceIndex] ?? null;
  const provenanceListLines = renderProvenanceListLines(entries, activeProvenanceIndex);
  const provenanceDetailLines = renderProvenanceEntryDetailLines(activeProvenanceEntry);
  const sources = entries.filter(entry => entry.kind === "source");
  const lines = [
    `${record?.title ?? "Provenance"}`,
    "kind: provenance",
    `owner: ${record?.id ?? "(none)"}`,
    `context: ${optionalText(record?.metadata?.context) ?? "(none)"}`,
    `preview session: ${session?.previewSessionId ?? "(none)"}`
  ];
  lines.push(...provenanceListLines);
  lines.push(...provenanceDetailLines);
  return {
    title: `${record?.title ?? "Provenance"} Provenance`,
    lines,
    entries,
    activeProvenanceIndex,
    activeProvenanceEntry,
    provenanceListLines,
    provenanceDetailLines,
    target: {
      kind: "provenance",
      id: record?.id ?? null,
      label: record?.title ?? "Provenance",
      ownerTargetId: record?.id ?? null,
      contextId: optionalText(record?.metadata?.context),
      mode: "provenance",
      uri: operatorUriForReference({
        kind: "provenance",
        scope: record?.scope ?? "world",
        targetId: record?.id ?? null,
        ownerTargetId: record?.id ?? null
      }),
      pinned: true,
      previewBacked: Boolean(inspection),
      sourceAvailable: Boolean(sources.length),
      activeProvenanceIndex,
      provenanceEntries: entries
    }
  };
}

function buildProvenanceWorkbenchRow(entry = null) {
  if (!entry) return null;
  const uri = operatorUriForProvenanceEntry(entry);
  const detailLines = renderProvenanceEntryDetailLines(entry);
  if (uri) detailLines.push(`uri: ${uri}`);
  return {
    kind: entry.kind ?? "entry",
    label: entry.label ?? "(unnamed)",
    detail: [entry.detail, entry.actionKind, entry.disabledReason].filter(Boolean).join(" | "),
    actionable: Boolean(entry.actionable),
    actionKind: entry.actionKind ?? null,
    uri,
    targetId: entry.targetId ?? null,
    ownerTargetId: entry.ownerTargetId ?? null,
    sourcePath: entry.sourcePath ?? null,
    sourceLine: entry.sourceLine ?? null,
    sourceId: entry.sourceId ?? null,
    sourceLanguage: entry.sourceLanguage ?? null,
    sourceKind: entry.sourceKind ?? null,
    detailLines
  };
}

function buildProvenanceWorkbenchModel(record, inspection, session, activeRowIndex = 0, override = null) {
  const representation = buildProvenanceRepresentation(record, inspection, session, {
    ...(override && typeof override === "object" ? override : {}),
    activeProvenanceIndex: activeRowIndex
  });
  const rows = arrayWrap(representation.entries).map(buildProvenanceWorkbenchRow);
  rows.forEach((row, index) => {
    if (row) row.baseIndex = index;
  });
  const normalizedIndex = Math.min(
    Math.max(0, Number(representation.activeProvenanceIndex ?? activeRowIndex ?? 0) || 0),
    Math.max(0, rows.length - 1)
  );
  return {
    title: representation.title,
    rows,
    activeRowIndex: normalizedIndex,
    detailLines: representation.provenanceDetailLines ?? representation.lines,
    target: representation.target ?? null
  };
}

function workbenchReferencesForInspection(state, session, record, inspection = null) {
  const references = [];
  const seen = new Set();
  const pushReference = reference => {
    if (!reference) return;
    const key = normalizeDeepLinkKey(reference);
    if (seen.has(key)) return;
    seen.add(key);
    references.push(reference);
  };
  const recordContextId = optionalText(record?.metadata?.context);
  if (recordContextId) {
    const contextRecord = state.recordIndex.get(recordContextId) ?? null;
    if (contextRecord) {
      pushReference(buildRecordDeepLink(state, contextRecord, {
        kind: "context",
        label: contextRecord.title,
        detail: "Focus root"
      }));
    }
  }
  for (const breadcrumb of arrayWrap(inspection?.breadcrumbs)) {
    const target = optionalText(breadcrumb?.target ?? breadcrumb?.id);
    const label = optionalText(breadcrumb?.label) ?? target;
    if (!target || target === record.id) {
      if (label && label !== record.title) {
        pushReference(withOperatorUri({
          kind: "provenance",
          label,
          targetId: record.id,
          scope: record.scope,
          contextId: recordContextId,
          sourcePath: null,
          sourceLine: null,
          detail: "Breadcrumb",
          actionable: Boolean(record?.id),
          disabledReason: record?.id ? null : "owning record unavailable.",
          ownerTargetId: record?.id ?? null,
          section: "provenance"
        }));
      }
      continue;
    }
    const targetRecord = state.recordIndex.get(target) ?? null;
    pushReference(targetRecord
      ? buildRecordDeepLink(state, targetRecord, {
          label: label ?? targetRecord.title,
          detail: "Breadcrumb"
        })
      : {
          ...withOperatorUri({
            kind: "record",
            label,
            targetId: target,
            scope: "world",
            contextId: null,
            sourcePath: null,
            sourceLine: null,
            detail: "Breadcrumb",
            actionable: true,
            disabledReason: null,
            ownerTargetId: record?.id ?? null,
            section: null
          })
        });
  }
  for (const candidate of arrayWrap(inspection?.candidates)) {
    const target = optionalText(candidate?.target);
    if (!target || target === record.id) continue;
    const targetRecord = state.recordIndex.get(target) ?? null;
    pushReference(targetRecord
      ? buildRecordDeepLink(state, targetRecord, {
          detail: [optionalText(candidate.matchType), optionalText(candidate.confidence)].filter(Boolean).join(" | ")
        })
      : {
          ...withOperatorUri({
            kind: "record",
            label: target,
            targetId: target,
            scope: "world",
            contextId: null,
            sourcePath: null,
            sourceLine: null,
            detail: [optionalText(candidate.matchType), optionalText(candidate.confidence)].filter(Boolean).join(" | "),
            actionable: true,
            disabledReason: null,
            ownerTargetId: record?.id ?? null,
            section: null
          })
        });
  }
  for (const reason of arrayWrap(inspection?.provenance?.reasons)) {
    pushReference(buildProvenanceDeepLink(reason, record));
  }
  if (record.scope !== "platform") {
    pushReference(buildPreviewSessionDeepLink(session, record));
  }
  for (const source of arrayWrap(inspection?.sources)) {
    pushReference(buildSourceDeepLink(source, record));
  }
  for (const source of arrayWrap(record?.sourceHints)) {
    pushReference(buildSourceDeepLink(source, record));
  }
  return sortDeepLinks(references);
}

function describeContainerForWorkbench(container, session) {
  const inspectLines = !container
    ? ["No container selected."]
    : [
        container.label ?? container.id,
        `id: ${container.id}`,
        `kind: container`
      ];
  if (container?.parentId === null) {
    inspectLines.push(`root: ${isContextFocusActive(session) ? "focus" : "global"}`);
  }
  if (container?.summary) inspectLines.push(`summary: ${container.summary}`);
  if (!container) {
    return {
      title: "Inspector",
      inspectLines,
      sourceLines: ["Source unavailable for this target."],
      provenanceLines: ["Provenance unavailable for this target."],
      references: [],
      target: {
        kind: "container",
        id: null,
        pinned: false,
        mode: "container"
      }
    };
  }
  return {
    title: container.label ?? container.id,
    inspectLines,
    sourceLines: ["Source unavailable for this target."],
    provenanceLines: ["Provenance unavailable for this target."],
    references: [],
    target: {
      kind: "container",
      id: container.id,
      label: container.label ?? container.id,
      pinned: false,
      mode: "container"
    }
  };
}

function describePreviewSessionForWorkbench(session) {
  const lines = [
    session.previewSessionId ?? "Preview Session",
    `kind: preview-session`,
    `session: ${session.previewSessionId ?? "(none)"}`,
    `base app revision: ${session.baseAppRevision ?? "(none)"}`,
    `preview revision: ${session.previewRevision ?? 0}`,
    `status: ${session.previewStatus ?? "inactive"}`,
    `writes: preview-only authored property edits`
  ];
  if (session.invalidReason) lines.push(`invalid reason: ${session.invalidReason}`);
  if (session.lastPreviewMutation) lines.push(`last edit: ${formatPreviewMutationSummary(session.lastPreviewMutation)}`);
  return {
    title: session.previewSessionId ?? "Preview Session",
    inspectLines: lines,
    sourceLines: ["Source unavailable for preview sessions."],
    provenanceLines: ["Provenance unavailable for preview sessions."],
    references: [],
    target: {
      kind: "preview-session",
      id: session.previewSessionId ?? null,
      label: session.previewSessionId ?? "Preview Session",
      uri: operatorUriForReference({
        kind: "preview-session",
        targetId: session.previewSessionId ?? null
      }),
      pinned: true,
      mode: "preview-session"
    },
    previewState: {
      sessionId: session.previewSessionId ?? null,
      baseAppRevision: session.baseAppRevision ?? null,
      previewRevision: session.previewRevision ?? 0,
      status: session.previewStatus ?? "inactive",
      invalidReason: session.invalidReason ?? null,
      lastMutation: session.lastPreviewMutation ? structuredClone(session.lastPreviewMutation) : null
    }
  };
}

function resolveWorkbenchScreenId(requestedScreenId, requestedTab) {
  const normalizedScreenId = optionalText(requestedScreenId);
  if (normalizedScreenId) return normalizedScreenId;
  const normalizedTab = optionalText(requestedTab) ?? "inspect";
  if (["inspect", "references", "source", "provenance"].includes(normalizedTab)) return normalizedTab;
  return "inspect";
}

function rightPaneTitleForScreen(customScreen) {
  return customScreen?.title ?? "Screen";
}

function workbenchTabLabelForScreenId(screenId) {
  if (screenId === "references") return "References";
  if (screenId === "source") return "Source";
  if (screenId === "provenance") return "Provenance";
  return "Inspect";
}

function builtInScreenUi(screenId, extra = {}) {
  return {
    rightScreenMode: "custom-screen",
    activeScreenId: screenId,
    inspectorTab: screenId,
    ...(extra && typeof extra === "object" ? extra : {})
  };
}

function workbenchResultHeader(resultView, materialized) {
  const filtersText = resultView.filters.length
    ? resultView.filters.map(describeResultViewFilter).join(", ")
    : "(none)";
  const bits = [
    `query=${JSON.stringify(resultView.query)}`,
    `scope=${resultView.scope}`,
    `${materialized.start}-${materialized.end} of ${materialized.totalRows}`,
    `sort=${resultView.sort}`,
    `filters=${filtersText}`
  ];
  if (resultView.focusContextId) bits.push(`focus=context:${resultView.focusContextId}`);
  if (resultView.activeViewName) bits.push(`view=${resultView.activeViewName}`);
  return bits.join(" | ");
}

function workbenchPrimaryActionForType(type, index) {
  const ordinal = Math.max(1, (Number(index) || 0) + 1);
  if (type === "container") {
    return {
      command: `open ${ordinal}`,
      label: "open"
    };
  }
  if (type === "record" || type === "alias") {
    return {
      command: `inspect ${ordinal}`,
      label: "inspect"
    };
  }
  return null;
}

function primaryCommandForSessionEntry(entry, index) {
  return workbenchPrimaryActionForType(entry?.type, index)?.command ?? null;
}

function workbenchLeftPanePaging(resultView, materialized) {
  if (!resultView || !materialized) return null;
  return {
    page: materialized.page,
    pageSize: materialized.pageSize,
    totalPages: materialized.totalPages,
    totalRows: materialized.totalRows,
    start: materialized.start,
    end: materialized.end,
    query: resultView.query,
    scope: resultView.scope,
    sort: resultView.sort,
    filters: resultView.filters.map(filter => ({ ...filter })),
    activeViewName: resultView.activeViewName ?? null,
    focusContextId: resultView.focusContextId ?? null
  };
}

function workbenchRowsFromEntries(entries, session) {
  return entries.map((entry, index) => {
    const primaryAction = workbenchPrimaryActionForType(entry.type, index);
    const row = {
      index: index + 1,
      type: entry.type,
      actionable: Boolean(primaryAction),
      primaryAction,
      selected: Boolean(
        session.selectionId
        && entry.type === "record"
        && entry.record.id === session.selectionId
      ),
      summary: "",
      label: "",
      columns: null,
      target: null
    };
    if (entry.type === "container") {
      row.label = entry.container?.label ?? "Container";
      row.summary = optionalText(entry.container?.summary) ?? "";
      row.target = entry.container?.id ?? null;
      return row;
    }
    if (entry.type === "record") {
      row.label = entry.record.title;
      row.summary = optionalText(entry.record.summary) ?? "";
      row.target = entry.record.id;
      row.record = {
        id: entry.record.id,
        title: entry.record.title,
        kind: entry.record.kind,
        scope: entry.record.scope
      };
      row.kind = entry.record.kind;
      row.scope = entry.record.scope;
      return row;
    }
    if (entry.type === "alias") {
      row.label = entry.alias;
      row.summary = entry.record ? `${entry.record.title} <${entry.record.kind}>` : entry.targetId;
      row.target = entry.targetId;
      row.kind = entry.record?.kind ?? null;
      row.scope = entry.record?.scope ?? null;
      return row;
    }
    if (entry.type === "note") {
      row.label = "Note";
      row.summary = entry.entry.text;
      return row;
    }
    if (entry.type === "program") {
      row.label = entry.entry.name;
      row.summary = `${entry.entry.commands.length} command${entry.entry.commands.length === 1 ? "" : "s"}`;
      return row;
    }
    if (entry.type === "preview-session") {
      row.label = entry.entry.sessionId;
      row.summary = `rev:${entry.entry.previewRevision ?? 0} status:${entry.entry.status}`;
      return row;
    }
    row.label = "Item";
    row.summary = "";
    return row;
  });
}

export async function inspectRecordForWorkbench(state, session, record) {
  if (!record) {
    return {
      title: "Inspector",
      inspectLines: ["No record selected."],
      sourceLines: ["Source unavailable for this target."],
      provenanceLines: ["Provenance unavailable for this target."],
      references: [],
      inspection: null,
      target: {
        kind: "record",
        id: null,
        pinned: false,
        mode: "record"
      }
    };
  }
  if (record.scope !== "platform") {
    const previewSession = ensurePreviewSessionForRead(state, session, { create: true });
    if (previewSession) {
      readPreviewSession(state, session);
      if (previewSession.status === "stale") {
        return {
          title: record.title,
          inspectLines: [
            record.title,
            `id: ${record.id}`,
            `preview session stale: ${previewSession.invalidReason}`
          ],
          sourceLines: ["Source unavailable while preview session is stale."],
          provenanceLines: [
            `${record.title} Provenance`,
            "kind: provenance",
            `owner: ${record.id}`,
            `context: ${optionalText(record.metadata?.context) ?? "(none)"}`,
            `preview session: ${previewSession.id}`,
            `stale: ${previewSession.invalidReason}`
          ],
          references: workbenchReferencesForInspection(state, session, record, null),
          inspection: null,
          stale: true,
          target: {
            kind: deepLinkKindForRecord(record),
            id: record.id,
            label: record.title,
            uri: createLinkForRecord(state, record)?.uri ?? null,
            pinned: false,
            mode: "record",
            previewBacked: true
          }
        };
      }
      const inspection = await previewManagerForState(state).inspectTarget(previewSession.id, record.id, {
        preferredTarget: record.id
      });
      if (inspection) {
        const normalized = normalizePreviewInspection(record, inspection);
        const sourceRepresentation = await buildSourceRepresentation(record, normalized);
        const provenanceRepresentation = buildProvenanceRepresentation(record, normalized, session);
        return {
          title: normalized.title,
          inspectLines: renderPreviewInspection(normalized).split("\n"),
          sourceTitle: sourceRepresentation.title,
          sourceLines: sourceRepresentation.lines,
          provenanceTitle: provenanceRepresentation.title,
          provenanceLines: provenanceRepresentation.lines,
          provenanceEntries: provenanceRepresentation.entries,
          activeProvenanceIndex: provenanceRepresentation.activeProvenanceIndex,
          provenanceDetailLines: provenanceRepresentation.provenanceDetailLines,
          references: workbenchReferencesForInspection(state, session, record, normalized),
          inspection: normalized,
          target: {
            kind: deepLinkKindForRecord(record),
            id: record.id,
            label: normalized.title,
            uri: createLinkForRecord(state, record)?.uri ?? null,
            pinned: false,
            mode: "record",
            previewBacked: true,
            sourceBacked: Boolean(normalized.editableSource?.file)
          }
        };
      }
    }
  }
  const sourceRepresentation = await buildSourceRepresentation(record, null);
  const provenanceRepresentation = buildProvenanceRepresentation(record, null, session);
  return {
    title: record.title,
    inspectLines: renderRecordDetails(record).split("\n"),
    sourceTitle: sourceRepresentation.title,
    sourceLines: sourceRepresentation.lines,
    provenanceTitle: provenanceRepresentation.title,
    provenanceLines: provenanceRepresentation.lines,
    provenanceEntries: provenanceRepresentation.entries,
    activeProvenanceIndex: provenanceRepresentation.activeProvenanceIndex,
    provenanceDetailLines: provenanceRepresentation.provenanceDetailLines,
    references: workbenchReferencesForInspection(state, session, record, null),
    inspection: null,
    target: {
      kind: deepLinkKindForRecord(record),
      id: record.id,
      label: record.title,
      uri: createLinkForRecord(state, record)?.uri ?? null,
      pinned: false,
      mode: "record",
      previewBacked: false,
      sourceBacked: Boolean(record.sourceHints?.length)
    }
  };
}

function workbenchTabLabel(tab) {
  if (tab === "references") return "References";
  if (tab === "source") return "Source";
  if (tab === "provenance") return "Provenance";
  return "Inspect";
}

function previewNavigationChip(state, session) {
  const available = previewReadAvailability(state).ok;
  if (!available) {
    return {
      id: "preview",
      type: "preview",
      label: "preview unavailable",
      tone: "muted",
      active: false,
      helpText: "Preview sessions are unavailable in repo self-model mode.",
      action: {
        kind: "command",
        command: "preview"
      }
    };
  }
  if (session.previewStatus === "stale") {
    return {
      id: "preview",
      type: "preview",
      label: `preview stale r${session.previewRevision ?? 0}`,
      tone: "warning",
      active: true,
      helpText: session.invalidReason ?? "Preview session is stale.",
      action: {
        kind: "command",
        command: "preview"
      }
    };
  }
  if (session.previewSessionId) {
    return {
      id: "preview",
      type: "preview",
      label: `preview ${session.previewStatus ?? "active"} r${session.previewRevision ?? 0}`,
      tone: "ok",
      active: true,
      helpText: `Preview session ${session.previewSessionId}`,
      action: {
        kind: "command",
        command: "preview"
      }
    };
  }
  return {
    id: "preview",
    type: "preview",
    label: "preview ready",
    tone: "default",
    active: false,
    helpText: "Open preview status for this detached session.",
    action: {
      kind: "command",
      command: "preview"
    }
  };
}

function resultViewNavigationChip(resultView, materialized) {
  if (!resultView || !materialized) return null;
  const range = materialized.totalRows
    ? `${materialized.startIndex + 1}-${materialized.startIndex + materialized.pageRows.length}/${materialized.totalRows}`
    : "0/0";
  const viewLabel = resultView.activeViewName ? `view ${resultView.activeViewName}` : `search ${JSON.stringify(resultView.query)}`;
  return {
    id: "view",
    type: "view",
    label: `${viewLabel} ${range}`,
    tone: resultView.activeViewName ? "accent" : "default",
    active: true,
    helpText: `scope=${resultView.scope} sort=${resultView.sort}${resultView.filters.length ? ` filters=${resultView.filters.length}` : ""}`,
    action: {
      kind: "command",
      command: "columns"
    }
  };
}

function operatorWorkbenchDefinitionForState(state) {
  return state.runtimeContext?.appProject?.operatorWorkbench ?? buildOperatorWorkbenchDefinition(null);
}

function operatorWorkbenchScreenSpec(state, screenId) {
  if (!screenId) return null;
  return operatorWorkbenchDefinitionForState(state).screensById.get(screenId) ?? null;
}

function operatorWorkbenchLeftScreenSpec(state, screenId) {
  if (!screenId) return null;
  return operatorWorkbenchDefinitionForState(state).leftScreensById?.get(screenId) ?? null;
}

function operatorWorkbenchDatasetSpec(state, datasetId) {
  if (!datasetId) return null;
  return operatorWorkbenchDefinitionForState(state).datasetsById.get(datasetId) ?? null;
}

function operatorWorkbenchScreenLines(state) {
  const definition = operatorWorkbenchDefinitionForState(state);
  if (!definition.screens.length) return ["(no screens)"];
  return definition.screens.map(screen => {
    const shortcut = screen.shortcut ? ` [${screen.shortcut}]` : "";
    const subtitle = optionalText(screen.subtitle) ? ` - ${screen.subtitle}` : "";
    const dataset = screen.sections?.length
      ? ` sections=${screen.sections.length}`
      : (screen.datasetId ? ` dataset=${screen.datasetId}` : ` provider=${screen.dataSource ?? "(none)"}`);
    return `${screen.id}${shortcut} <${screen.shape}>${dataset}${subtitle}`;
  });
}

function filterDatasetRows(rows, datasetSpec, screenSpec) {
  const expectedKind = optionalText(datasetSpec?.rowFilterKind) ?? optionalText(screenSpec?.rowFilterKind);
  const expectedAction = optionalText(datasetSpec?.rowFilterAction) ?? optionalText(screenSpec?.rowFilterAction);
  return arrayWrap(rows).filter(row => {
    if (expectedKind && optionalText(row?.kind) !== expectedKind) return false;
    if (expectedAction && optionalText(row?.actionKind) !== expectedAction) return false;
    return true;
  });
}

function datasetProviderColumns(provider) {
  if (provider === "source") return ["kind", "path", "line", "detail"];
  if (provider === "provenance") return ["kind", "action", "target", "detail"];
  return ["kind", "label", "detail"];
}

function legacySectionKindForScreenShape(shape) {
  if (shape === "detail") return "detail";
  if (shape === "table-detail") return "table";
  return "list";
}

function genericScreenColumnCatalog(sectionSpec, datasetSpec) {
  if (sectionSpec?.kind === "kv") return ["key", "value"];
  if (sectionSpec?.kind !== "table" && sectionSpec?.shape !== "table-detail") return [];
  const explicitColumns = arrayWrap(sectionSpec?.columns).map(optionalText).filter(Boolean);
  if (explicitColumns.length) return explicitColumns;
  const columns = arrayWrap(datasetSpec?.columns).map(optionalText).filter(Boolean);
  if (columns.length) return columns;
  return datasetProviderColumns(datasetSpec?.provider ?? sectionSpec?.dataSource ?? "references");
}

function genericScreenRowColumns(row, provider, columns, sectionKind = "list") {
  if (sectionKind === "kv") {
    return {
      key: row.key ?? row.label ?? "",
      value: row.value ?? row.detail ?? ""
    };
  }
  const values = {
    kind: row.kind ?? "",
    key: row.key ?? "",
    value: row.value ?? "",
    label: row.label ?? "",
    detail: row.detail ?? "",
    path: row.sourcePath ?? row.label ?? "",
    line: row.sourceLine ?? "",
    action: row.actionKind ?? row.primaryAction ?? "",
    target: row.targetId ?? row.sourcePath ?? ""
  };
  if (provider === "source") {
    return {
      kind: values.kind || "source",
      path: values.path,
      line: values.line,
      detail: values.detail
    };
  }
  if (provider === "provenance") {
    return {
      kind: values.kind,
      action: values.action,
      target: values.target,
      detail: values.detail
    };
  }
  return Object.fromEntries(columns.map(column => [column, values[column] ?? ""]));
}

function normalizedDatasetPrimaryAction(datasetSpec) {
  const action = optionalText(datasetSpec?.primaryAction);
  if (["open-link", "source-open", "provenance-open", "inspect-record", "none"].includes(action)) return action;
  return null;
}

function defaultDatasetPrimaryAction(provider) {
  if (provider === "references") return "open-link";
  if (provider === "source") return "source-open";
  return "none";
}

function normalizedDatasetRowAction(provider, row) {
  if (provider === "references") return row?.uri ? "open-link" : "none";
  if (provider === "source") return row?.actionable ? "source-open" : "none";
  if (provider === "provenance") {
    if (row?.actionKind === "inspect-record") return "inspect-record";
    if (row?.actionKind === "open-provenance") return "provenance-open";
    if (row?.actionKind === "open-source") return "source-open";
    return "none";
  }
  return null;
}

function datasetRowPrimaryCommand(action, row) {
  if (action === "open-link") return row?.uri ? `open-link ${row.uri}` : null;
  if (action === "source-open") return `source ${row?.ownerTargetId || row?.targetId || "this"}`;
  if (action === "provenance-open") return `provenance ${row?.targetId || row?.ownerTargetId || "this"}`;
  if (action === "inspect-record") return optionalText(row?.targetId) ? `inspect ${row.targetId}` : null;
  return null;
}

function datasetRowPrimaryUi(action, row) {
  return null;
}

function buildDatasetScreenRow(row, {
  provider,
  datasetSpec,
  columns,
  sectionKind,
  baseIndex
} = {}) {
  const rowAction = normalizedDatasetRowAction(provider, row);
  const datasetAction = normalizedDatasetPrimaryAction(datasetSpec) ?? defaultDatasetPrimaryAction(provider);
  const primaryAction = rowAction ?? datasetAction;
  const primaryCommand = datasetRowPrimaryCommand(primaryAction, { ...row, baseIndex });
  return {
    ...deepClone(row),
    baseIndex,
    primaryAction,
    primaryCommand,
    primaryUi: primaryCommand ? datasetRowPrimaryUi(primaryAction, row) : null,
    columns: genericScreenRowColumns({ ...row, baseIndex, primaryAction }, provider, columns, sectionKind)
  };
}

function buildInspectMetadataRows(inspector) {
  const rows = [];
  const push = (key, value) => {
    const label = optionalText(key);
    if (!label || value === undefined || value === null || value === "") return;
    rows.push({
      kind: "field",
      key: label,
      value: typeof value === "string" ? value : formatValue(value),
      label,
      detail: typeof value === "string" ? value : formatValue(value)
    });
  };
  const inspection = inspector?.inspection ?? null;
  const target = inspector?.target ?? null;
  push("title", inspection?.title ?? inspector?.title ?? target?.label ?? null);
  push("id", inspection?.id ?? target?.id ?? null);
  push("scope", inspection?.scope ?? null);
  push("kind", inspection?.kind ?? target?.kind ?? null);
  push("target", inspection?.target ?? null);
  push("resolved from", inspection?.resolvedFrom ?? null);
  push("component kind", inspection?.componentKind ?? null);
  if (inspection) {
    push("editable", inspection.editable ? "yes" : "no");
    push("source file", inspection.editableSource?.file ?? null);
    push("source id", inspection.editableSource?.sourceId ?? null);
    push("source language", inspection.editableSource?.sourceLanguage ?? null);
    push("breadcrumbs", arrayWrap(inspection.breadcrumbs).map(entry => entry?.label ?? entry?.target ?? entry?.id).filter(Boolean).join(" > "));
    push("authored props", Object.keys(inspection.authoredProps ?? {}).length || 0);
    push("runtime props", Object.keys(inspection.runtimeProps?.props ?? {}).length || 0);
    push("valid props", arrayWrap(inspection.validProps).length || 0);
    push("provenance reasons", arrayWrap(inspection.provenance?.reasons).length || 0);
    push("sources", arrayWrap(inspection.sources).length || 0);
    push("candidates", arrayWrap(inspection.candidates).length || 0);
  } else {
    push("mode", target?.mode ?? null);
    push("preview backed", target?.previewBacked === undefined ? null : (target.previewBacked ? "yes" : "no"));
    push("source backed", target?.sourceBacked === undefined ? null : (target.sourceBacked ? "yes" : "no"));
  }
  return rows;
}

function defaultSectionCollapsible(kind) {
  return ["detail", "list", "table", "kv"].includes(optionalText(kind) ?? "detail");
}

function clampWorkbenchRowCursor(index, rows = []) {
  return Math.min(Math.max(0, Number(index) || 0), Math.max(0, arrayWrap(rows).length - 1));
}

function screenSectionSessionState(session, screenId) {
  if (!session || !screenId) return null;
  const byScreenId = session.workbenchSectionStateByScreenId;
  if (!byScreenId || typeof byScreenId !== "object") return null;
  return byScreenId[screenId] ?? null;
}

function ensureScreenSectionSessionState(session, screenId) {
  if (!session.workbenchSectionStateByScreenId || typeof session.workbenchSectionStateByScreenId !== "object") {
    session.workbenchSectionStateByScreenId = {};
  }
  if (!session.workbenchSectionStateByScreenId[screenId]) {
    session.workbenchSectionStateByScreenId[screenId] = {
      activeSectionId: null,
      cursorsBySectionId: {},
      collapsedSectionIds: [],
      lastCollapsedSectionId: null
    };
  }
  return session.workbenchSectionStateByScreenId[screenId];
}

function sectionActiveIndex(sectionModels = [], {
  preferredSectionId = null,
  defaultSectionId = null
} = {}) {
  const preferredIndex = preferredSectionId
    ? sectionModels.findIndex(section => section?.id === preferredSectionId)
    : -1;
  if (preferredIndex >= 0) return preferredIndex;
  const defaultIndex = defaultSectionId
    ? sectionModels.findIndex(section => section?.id === defaultSectionId)
    : -1;
  if (defaultIndex >= 0) return defaultIndex;
  const actionableIndex = sectionModels.findIndex(section => section?.actionable);
  if (actionableIndex >= 0) return actionableIndex;
  const rowsIndex = sectionModels.findIndex(section => arrayWrap(section.rows).length);
  if (rowsIndex >= 0) return rowsIndex;
  return 0;
}

function buildWorkbenchScreenSection(sectionSpec, datasetSpec, {
  screenState = null,
  inspector,
  referencesWorkbench,
  sourceWorkbench,
  provenanceWorkbench
} = {}) {
  const fallbackTitle = sectionSpec?.title ?? "Section";
  const provider = datasetSpec?.provider ?? sectionSpec?.dataSource ?? null;
  const columns = genericScreenColumnCatalog(sectionSpec, datasetSpec);
  let title = fallbackTitle;
  let rows = [];
  let activeRowIndex = 0;
  let detailLines = [];
  if (provider === "inspect") {
    title = sectionSpec?.title ?? inspector?.title ?? fallbackTitle;
    if (sectionSpec?.kind === "detail") {
      detailLines = inspector?.inspectLines ?? [sectionSpec.emptyMessage ?? datasetSpec?.emptyMessage ?? "Select a record to inspect."];
    } else {
      rows = buildInspectMetadataRows(inspector).map((row, baseIndex) => ({
        ...row,
        baseIndex,
        primaryAction: "none",
        primaryCommand: null,
        primaryUi: null,
        columns: genericScreenRowColumns(row, provider, columns, sectionSpec?.kind ?? "list")
      }));
      detailLines = sectionSpec?.kind === "list"
        ? (inspector?.inspectLines ?? [sectionSpec.emptyMessage ?? datasetSpec?.emptyMessage ?? "Select a record to inspect."])
        : [];
    }
  } else if (provider === "references") {
    title = sectionSpec?.title ?? referencesWorkbench?.title ?? fallbackTitle;
    rows = filterDatasetRows(referencesWorkbench?.rows ?? [], datasetSpec, sectionSpec)
      .map((row, baseIndex) => buildDatasetScreenRow(row, {
        provider,
        datasetSpec,
        columns,
        sectionKind: sectionSpec?.kind ?? "list",
        baseIndex: Number(row?.baseIndex ?? baseIndex) || 0
      }));
    const preferredBaseIndex = Math.max(0, Number(referencesWorkbench?.activeRowIndex ?? 0) || 0);
    activeRowIndex = Math.max(0, rows.findIndex(row => row.baseIndex === preferredBaseIndex));
    detailLines = rows[activeRowIndex]?.detailLines ?? referencesWorkbench?.detailLines ?? [];
  } else if (provider === "source") {
    title = sectionSpec?.title ?? sourceWorkbench?.title ?? fallbackTitle;
    rows = filterDatasetRows(sourceWorkbench?.rows ?? [], datasetSpec, sectionSpec)
      .map(row => buildDatasetScreenRow(row, {
        provider,
        datasetSpec,
        columns,
        sectionKind: sectionSpec?.kind ?? "list",
        baseIndex: Number(row?.baseIndex ?? row?.index ?? 0) || 0
      }));
    const preferredBaseIndex = Math.max(0, Number(sourceWorkbench?.activeRowIndex ?? 0) || 0);
    activeRowIndex = Math.max(0, rows.findIndex(row => row.baseIndex === preferredBaseIndex));
    detailLines = sourceWorkbench?.detailLines ?? [];
  } else if (provider === "provenance") {
    title = sectionSpec?.title ?? provenanceWorkbench?.title ?? fallbackTitle;
    rows = filterDatasetRows(provenanceWorkbench?.rows ?? [], datasetSpec, sectionSpec)
      .map(row => buildDatasetScreenRow(row, {
        provider,
        datasetSpec,
        columns,
        sectionKind: sectionSpec?.kind ?? "list",
        baseIndex: Number(row?.baseIndex ?? row?.index ?? 0) || 0
      }));
    const preferredBaseIndex = Math.max(0, Number(provenanceWorkbench?.activeRowIndex ?? 0) || 0);
    activeRowIndex = Math.max(0, rows.findIndex(row => row.baseIndex === preferredBaseIndex));
    detailLines = rows[activeRowIndex]?.detailLines ?? provenanceWorkbench?.detailLines ?? [];
  }
  const sectionId = sectionSpec?.id ?? null;
  const collapsible = sectionSpec?.collapsible === null || sectionSpec?.collapsible === undefined
    ? defaultSectionCollapsible(sectionSpec?.kind)
    : Boolean(sectionSpec.collapsible);
  const collapsed = collapsible && (
    Boolean(sectionSpec?.collapsed)
    || (sectionId ? arrayWrap(screenState?.collapsedSectionIds).includes(sectionId) : false)
  );
  const actionable = arrayWrap(rows).some(row => row.primaryCommand);
  const rememberedRowIndex = sectionId ? screenState?.cursorsBySectionId?.[sectionId] : null;
  activeRowIndex = clampWorkbenchRowCursor(rememberedRowIndex ?? activeRowIndex, rows);
  if (provider === "references" || provider === "provenance") {
    detailLines = rows[activeRowIndex]?.detailLines ?? detailLines;
  }
  return {
    id: sectionId,
    title,
    kind: sectionSpec?.kind ?? legacySectionKindForScreenShape(sectionSpec?.shape),
    shape: sectionSpec?.kind === "table"
      ? "table-detail"
      : (sectionSpec?.kind === "detail" ? "detail" : "list-detail"),
    dataSource: provider,
    datasetId: datasetSpec?.id ?? sectionSpec?.datasetId ?? null,
    provider,
    emptyMessage: sectionSpec?.emptyMessage ?? datasetSpec?.emptyMessage ?? "(no rows)",
    columns,
    rows,
    activeRowIndex,
    detailLines: detailLines.length ? detailLines : [sectionSpec?.emptyMessage ?? datasetSpec?.emptyMessage ?? "(no rows)"],
    collapsible,
    collapsed,
    actionable,
    origin: sectionSpec?.origin ?? "authored"
  };
}

function buildCustomWorkbenchScreen(spec, datasetSpec, {
  session = null,
  datasetLookup = null,
  inspector,
  referencesWorkbench,
  sourceWorkbench,
  provenanceWorkbench
} = {}) {
  const fallbackTitle = spec?.title ?? "Screen";
  if (!spec) {
    const unavailableSection = {
      id: "unavailable",
      title: fallbackTitle,
      kind: "detail",
      shape: "detail",
      dataSource: null,
      datasetId: null,
      provider: null,
      emptyMessage: "(screen unavailable)",
      columns: [],
      rows: [],
      activeRowIndex: 0,
      detailLines: ["Screen unavailable."],
      collapsed: false,
      collapsible: false,
      actionable: false,
      origin: "builtin"
    };
    return {
      title: fallbackTitle,
      subtitle: null,
      shape: "detail",
      helpText: null,
      emptyMessage: "(screen unavailable)",
      rows: [],
      activeRowIndex: 0,
      detailLines: unavailableSection.detailLines,
      columns: [],
      datasetId: null,
      provider: null,
      sections: [unavailableSection],
      activeSectionIndex: 0
    };
  }
  const normalizedSections = arrayWrap(spec.sections).length
    ? arrayWrap(spec.sections)
    : [{
        id: `${spec.id}.main`,
        title: null,
        kind: legacySectionKindForScreenShape(spec.shape),
        datasetId: spec.datasetId ?? datasetSpec?.id ?? null,
        dataSource: spec.dataSource ?? datasetSpec?.provider ?? null,
        columns: arrayWrap(datasetSpec?.columns),
        emptyMessage: spec.emptyMessage ?? datasetSpec?.emptyMessage ?? "(no rows)",
        rowFilterKind: spec.rowFilterKind ?? null,
        rowFilterAction: spec.rowFilterAction ?? null,
        origin: spec.origin ?? "authored",
        shape: spec.shape,
        collapsible: null,
        collapsed: null
      }];
  const screenState = spec?.id ? screenSectionSessionState(session, spec.id) : null;
  const sectionModels = normalizedSections.map(section => {
    const sectionDatasetSpec = section.datasetId
      ? (datasetSpec?.id === section.datasetId ? datasetSpec : datasetLookup?.(section.datasetId) ?? null)
      : (section.dataSource === datasetSpec?.provider ? datasetSpec : null);
    return buildWorkbenchScreenSection(section, sectionDatasetSpec ?? datasetSpec, {
      screenState,
      inspector,
      referencesWorkbench,
      sourceWorkbench,
      provenanceWorkbench
    });
  });
  const activeSectionIndex = sectionActiveIndex(sectionModels, {
    preferredSectionId: screenState?.activeSectionId ?? null,
    defaultSectionId: spec?.defaultSectionId ?? null
  });
  const activeSection = sectionModels[activeSectionIndex] ?? sectionModels[0] ?? null;
  const activeRows = activeSection?.collapsed ? [] : (activeSection?.rows ?? []);
  return {
    id: spec.id,
    title: spec.origin === "builtin"
      ? (activeSection?.title ?? fallbackTitle)
      : fallbackTitle,
    subtitle: spec.subtitle ?? null,
    shape: spec.shape ?? "list-detail",
    dataSource: activeSection?.provider ?? datasetSpec?.provider ?? spec.dataSource ?? null,
    datasetId: datasetSpec?.id ?? spec.datasetId ?? null,
    provider: activeSection?.provider ?? datasetSpec?.provider ?? spec.dataSource ?? null,
    helpText: spec.helpText ?? null,
    emptyMessage: spec.emptyMessage ?? datasetSpec?.emptyMessage ?? "(no rows)",
    columns: activeSection?.columns ?? [],
    rows: activeRows,
    activeRowIndex: activeSection?.collapsed ? 0 : (activeSection?.activeRowIndex ?? 0),
    activeSectionIndex,
    activeSectionId: activeSection?.id ?? null,
    activeSectionTitle: activeSection?.title ?? null,
    activeSectionRowCount: arrayWrap(activeSection?.rows).length,
    activeSectionActionable: Boolean(activeSection?.actionable),
    activeSectionCollapsible: activeSection?.collapsible === false ? false : true,
    activeSectionCollapsed: Boolean(activeSection?.collapsed),
    sections: sectionModels,
    detailLines: activeSection?.collapsed
      ? [`${activeSection?.title ?? "Section"} is collapsed.`]
      : (activeSection?.detailLines?.length ? activeSection.detailLines : [spec.emptyMessage ?? datasetSpec?.emptyMessage ?? "(no rows)"]),
    origin: spec.origin ?? "authored",
    shortcut: spec.shortcut ?? null
  };
}

function buildWorkbenchNavigationModel(state, session, {
  screenId = "inspect",
  screenSpec = null,
  resultView = null,
  materializedResultView = null,
  selectedIndex = 0
} = {}) {
  const chips = [];
  const rootLabel = isContextFocusActive(session) ? focusRootLabel(session) : "root";
  chips.push({
    id: "root",
    type: "root",
    label: rootLabel,
    tone: isContextFocusActive(session) ? "accent" : "default",
    active: true,
    helpText: "Return to the current semantic root.",
    action: {
      kind: "command",
      command: "home"
    }
  });

  if (isContextFocusActive(session)) {
    chips.push({
      id: "focus",
      type: "focus",
      label: `focus ${session.focusId}`,
      tone: "accent",
      active: true,
      helpText: "Inspect the active context focus root.",
      action: {
        kind: "inspect-focus",
        targetId: session.focusId
      }
    });
  }

  const pathIds = currentPathEntries(session);
  for (let index = 0; index < pathIds.length; index += 1) {
    const containerId = pathIds[index];
    const label = state.containerIndex.get(containerId)?.label ?? containerId;
    const isLast = index === pathIds.length - 1;
    chips.push({
      id: `path:${containerId}`,
      type: "path",
      label,
      tone: isLast ? "accent" : "default",
      active: isLast,
      helpText: isLast ? `Current location: ${label}` : `Jump to ${label}`,
      action: {
        kind: isLast ? "noop" : "navigate-path",
        containerId
      }
    });
  }

  chips.push(previewNavigationChip(state, session));

  const viewChip = resultViewNavigationChip(resultView, materializedResultView);
  if (viewChip) chips.push(viewChip);

  const modeLabel = screenSpec?.title ?? workbenchTabLabelForScreenId(screenId);
  chips.push({
    id: "mode",
    type: "mode",
    label: modeLabel,
    tone: screenId !== "inspect" ? "accent" : "default",
    active: true,
    helpText: screenId !== "inspect"
      ? "Return to the inspect screen."
      : "Cycle the right-pane mode.",
    action: {
      kind: screenId !== "inspect" ? "set-right-screen-mode" : "cycle-mode",
      screenMode: "custom-screen",
      screenId: "inspect"
    }
  });

  const nextSelectedIndex = Math.min(Math.max(0, Number(selectedIndex) || 0), Math.max(0, chips.length - 1));
  return {
    chips,
    selectedIndex: nextSelectedIndex
  };
}

function buildNavigationLeftPaneModel(state, session, {
  screenId = "builtin.navigation",
  title = null,
  header = null,
  helpText = null,
  origin = "builtin"
} = {}) {
  const entries = buildContainerEntries(state, session, currentContainerId(session));
  session.lastEntries = entries;
  return {
    mode: "tree",
    screenId,
    shape: "tree",
    dataSource: "navigation",
    title: title ?? (isContextFocusActive(session) ? focusRootLabel(session) : "Tree"),
    header: header ?? buildTuiPathText(state, session),
    helpText: helpText ?? "Browse the current navigation tree and activate rows to open containers or inspect targets.",
    origin,
    overlay: false,
    columns: [],
    rows: workbenchRowsFromEntries(entries, session),
    paging: null
  };
}

function workbenchPrimaryLabelForCommand(command) {
  const normalized = optionalText(command);
  if (!normalized) return null;
  const token = normalized.split(/\s+/, 1)[0]?.toLowerCase() ?? null;
  return token || null;
}

function leftPaneRowFromWorkbenchRow(row, index, session) {
  const recordId = optionalText(row?.targetId) ?? optionalText(row?.ownerTargetId) ?? null;
  return {
    index: index + 1,
    type: "record",
    actionable: Boolean(row?.primaryCommand),
    primaryAction: row?.primaryCommand
      ? {
          command: row.primaryCommand,
          label: workbenchPrimaryLabelForCommand(row.primaryCommand)
        }
      : null,
    selected: Boolean(session.selectionId && recordId && session.selectionId === recordId),
    summary: optionalText(row?.detail) ?? "",
    label: optionalText(row?.label) ?? optionalText(row?.key) ?? "(row)",
    columns: row?.columns ? deepClone(row.columns) : null,
    target: recordId,
    kind: optionalText(row?.kind) ?? null,
    scope: optionalText(row?.scope) ?? null,
    record: recordId
      ? {
          id: recordId,
          title: optionalText(row?.label) ?? recordId,
          kind: optionalText(row?.kind) ?? "record",
          scope: optionalText(row?.scope) ?? "world"
        }
      : null
  };
}

function buildResultLeftPaneModel(resultView, materializedResultView, session) {
  session.lastEntries = materializedResultView.entries;
  return {
    mode: "results",
    screenId: "builtin.search",
    shape: "table",
    dataSource: "search",
    title: "Search Results",
    header: workbenchResultHeader(resultView, materializedResultView),
    helpText: "Search results overlay the authored left pane until cleared.",
    origin: "builtin",
    overlay: true,
    columns: [...resultView.columns],
    rows: materializedResultView.pageRows.map((row, index) => ({
      index: index + 1,
      type: "record",
      actionable: true,
      primaryAction: workbenchPrimaryActionForType("record", index),
      label: row.record.title,
      summary: optionalText(row.record.summary) ?? "",
      target: row.record.id,
      selected: session.selectionId === row.record.id,
      kind: row.record.kind,
      scope: row.record.scope,
      record: {
        id: row.record.id,
        title: row.record.title,
        kind: row.record.kind,
        scope: row.record.scope
      },
      columns: Object.fromEntries(resultView.columns.map(column => [column, resultViewColumnValue(row.record, column)]))
    })),
    paging: workbenchLeftPanePaging(resultView, materializedResultView)
  };
}

function buildAuthoredLeftPaneModel(state, session, leftScreenSpec, datasetSpec, {
  inspector,
  referencesWorkbench,
  sourceWorkbench,
  provenanceWorkbench
} = {}) {
  if (!leftScreenSpec) return buildNavigationLeftPaneModel(state, session);
  if (leftScreenSpec.shape === "tree") {
    return buildNavigationLeftPaneModel(state, session, {
      screenId: leftScreenSpec.id,
      title: leftScreenSpec.title,
      header: leftScreenSpec.subtitle ?? buildTuiPathText(state, session),
      helpText: leftScreenSpec.helpText ?? null,
      origin: leftScreenSpec.origin ?? "authored"
    });
  }
  const section = buildWorkbenchScreenSection({
    id: `${leftScreenSpec.id}.main`,
    title: leftScreenSpec.title,
    kind: leftScreenSpec.shape === "table" ? "table" : "list",
    shape: leftScreenSpec.shape === "table" ? "table-detail" : "list-detail",
    datasetId: leftScreenSpec.datasetId ?? null,
    dataSource: leftScreenSpec.dataSource ?? null,
    columns: arrayWrap(datasetSpec?.columns),
    emptyMessage: leftScreenSpec.emptyMessage ?? datasetSpec?.emptyMessage ?? "(no rows)",
    rowFilterKind: leftScreenSpec.rowFilterKind ?? null,
    rowFilterAction: leftScreenSpec.rowFilterAction ?? null,
    origin: leftScreenSpec.origin ?? "authored",
    collapsible: false,
    collapsed: false
  }, datasetSpec, {
    screenState: null,
    inspector,
    referencesWorkbench,
    sourceWorkbench,
    provenanceWorkbench
  });
  return {
    mode: "tree",
    screenId: leftScreenSpec.id,
    shape: leftScreenSpec.shape,
    dataSource: section.provider ?? leftScreenSpec.dataSource ?? null,
    title: leftScreenSpec.title ?? section.title ?? "Pane",
    header: leftScreenSpec.subtitle ?? buildTuiPathText(state, session),
    helpText: leftScreenSpec.helpText ?? `Authored ${leftScreenSpec.shape} view.`,
    origin: leftScreenSpec.origin ?? "authored",
    overlay: false,
    columns: leftScreenSpec.shape === "table" ? [...section.columns] : [],
    rows: section.rows.map((row, index) => leftPaneRowFromWorkbenchRow(row, index, session)),
    paging: null
  };
}

function normalizeWorkbenchInspectorSpec(spec = null) {
  if (!spec || typeof spec !== "object") return null;
  const kind = optionalText(spec.kind);
  if (!kind) return null;
  return deepClone(spec);
}

export async function buildOperatorWorkbenchSnapshot(state, session, uiState = {}) {
  const focusedPane = optionalText(uiState.focusedPane) ?? "left";
  const requestedInspectorTab = optionalText(uiState.inspectorTab) ?? session.activeWorkbenchInspectorTab ?? "inspect";
  const requestedRightScreenMode = optionalText(uiState.rightScreenMode) ?? "custom-screen";
  const requestedActiveScreenId = optionalText(uiState.activeScreenId) ?? session.activeWorkbenchScreenId ?? null;
  const resultView = session.resultView ?? null;
  const workbenchDefinition = operatorWorkbenchDefinitionForState(state);
  let materializedResultView = null;
  let provisionalLeftRows = [];
  if (resultView) {
    materializedResultView = materializeResultView(resultView);
    provisionalLeftRows = buildResultLeftPaneModel(resultView, materializedResultView, session).rows;
  } else {
    const entries = buildContainerEntries(state, session, currentContainerId(session));
    session.lastEntries = entries;
    provisionalLeftRows = workbenchRowsFromEntries(entries, session);
  }

  const provisionalLeftCursorLimit = Math.max(0, provisionalLeftRows.length - 1);
  const provisionalLeftCursor = Math.min(Math.max(0, Number(uiState.leftCursor ?? 0) || 0), provisionalLeftCursorLimit);
  const activeLeftRow = provisionalLeftRows[provisionalLeftCursor] ?? null;
  const activeLeftRecord = activeLeftRow?.record
    ? state.recordIndex.get(activeLeftRow.record.id) ?? null
    : null;
  const selectedRecord = session.selectionId ? (state.recordIndex.get(session.selectionId) ?? null) : null;
  const pinnedInspector = normalizeWorkbenchInspectorSpec(uiState.inspectorSpec ?? session.workbenchInspectorSpec ?? null);
  let inspector = null;
  if (pinnedInspector?.kind === "record" || pinnedInspector?.kind === "context" || pinnedInspector?.kind === "provenance") {
    const pinnedRecord = state.recordIndex.get(pinnedInspector.targetId) ?? null;
    if (pinnedRecord) {
      inspector = await inspectRecordForWorkbench(state, session, pinnedRecord);
      inspector.target = {
        ...(inspector.target ?? {}),
        kind: pinnedInspector.kind,
        pinned: true,
        section: pinnedInspector.section ?? null
      };
      if (pinnedInspector.kind === "provenance" || pinnedInspector.section === "provenance") {
        const provenanceRepresentation = buildProvenanceRepresentation(
          pinnedRecord,
          inspector.inspection,
          session,
          pinnedInspector
        );
        inspector.provenanceTitle = provenanceRepresentation.title;
        inspector.provenanceLines = provenanceRepresentation.lines;
        inspector.provenanceEntries = provenanceRepresentation.entries;
        inspector.activeProvenanceIndex = provenanceRepresentation.activeProvenanceIndex;
        inspector.provenanceDetailLines = provenanceRepresentation.provenanceDetailLines;
        if (!inspector.provenanceLines.some(line => line === "focus: provenance")) {
          inspector.provenanceLines = ["focus: provenance", ...inspector.provenanceLines];
        }
      }
    }
  } else if (pinnedInspector?.kind === "source") {
    const ownerRecord = pinnedInspector.ownerTargetId
      ? (state.recordIndex.get(pinnedInspector.ownerTargetId) ?? null)
      : null;
    if (ownerRecord) {
      const ownerInspector = await inspectRecordForWorkbench(state, session, ownerRecord);
      const sourceRepresentation = await buildSourceRepresentation(ownerRecord, ownerInspector.inspection, pinnedInspector);
      inspector = {
        ...ownerInspector,
        title: sourceRepresentation.title,
        sourceTitle: sourceRepresentation.title,
        sourceLines: sourceRepresentation.lines,
        sources: sourceRepresentation.sources,
        activeSourceIndex: sourceRepresentation.activeSourceIndex,
        sourceListLines: sourceRepresentation.sourceListLines,
        target: {
          ...sourceRepresentation.target,
          pinned: true
        }
      };
    } else {
      const sourceRepresentation = await buildSourceRepresentation(null, null, pinnedInspector);
      inspector = {
        title: sourceRepresentation.title,
        inspectLines: ["No record selected."],
        sourceTitle: sourceRepresentation.title,
        sourceLines: sourceRepresentation.lines,
        sources: sourceRepresentation.sources,
        activeSourceIndex: sourceRepresentation.activeSourceIndex,
        sourceListLines: sourceRepresentation.sourceListLines,
        provenanceTitle: "Provenance",
        provenanceLines: ["Provenance unavailable for this target."],
        references: [],
        target: {
          ...sourceRepresentation.target,
          pinned: true
        }
      };
    }
  } else if (pinnedInspector?.kind === "preview-session") {
    inspector = describePreviewSessionForWorkbench(session);
  }
  if (!inspector) {
    const inspectorRecord = activeLeftRecord ?? selectedRecord ?? null;
    inspector = inspectorRecord
      ? await inspectRecordForWorkbench(state, session, inspectorRecord)
      : describeContainerForWorkbench(
          activeLeftRow?.type === "container" ? state.containerIndex.get(activeLeftRow.target) ?? null : null,
        session
      );
  }
  const activeScreenId = resolveWorkbenchScreenId(requestedActiveScreenId, requestedInspectorTab);
  const inspectorTab = workbenchTabLabelForScreenId(activeScreenId).toLowerCase();
  const rightScreenMode = "custom-screen";
  const referencesWorkbench = buildReferencesWorkbenchModel(inspector, uiState.rightCursor ?? 0);
  const sourceWorkbenchRecord = inspector?.target?.ownerTargetId
    ? (state.recordIndex.get(inspector.target.ownerTargetId) ?? null)
    : (inspector?.target?.ownerTargetId === null ? null : (inspector?.target?.kind === "record" || inspector?.target?.kind === "context" || inspector?.target?.kind === "provenance"
      ? (state.recordIndex.get(inspector.target.id) ?? null)
      : selectedRecord ?? activeLeftRecord ?? null));
  const sourceWorkbenchOverride = sourceWorkbenchRecord
    ? (
        pinnedInspector?.kind === "source"
        && pinnedInspector.ownerTargetId === sourceWorkbenchRecord.id
          ? {
              ...(sessionSourceViewIsActive(session) && session.sourceView.targetId === sourceWorkbenchRecord.id
                ? {
                    sources: session.sourceView.sources,
                    activeSourceIndex: session.sourceView.activeSourceIndex
                  }
                : {}),
              sourcePath: pinnedInspector.sourcePath ?? null,
              sourceLine: pinnedInspector.sourceLine ?? null,
              sourceId: pinnedInspector.sourceId ?? null,
              sourceLanguage: pinnedInspector.sourceLanguage ?? null,
              sourceKind: pinnedInspector.sourceKind ?? null
            }
          : (sessionSourceViewIsActive(session) && session.sourceView.targetId === sourceWorkbenchRecord.id
              ? {
                  sources: session.sourceView.sources,
                  activeSourceIndex: session.sourceView.activeSourceIndex
                }
              : null)
      )
    : null;
  const sourceWorkbench = sourceWorkbenchRecord
    ? await buildSourceWorkbenchModel(
        sourceWorkbenchRecord,
        inspector.inspection ?? null,
        (uiState.rightCursor ?? Number(inspector.activeSourceIndex ?? 0) ?? 0),
        sourceWorkbenchOverride
      )
    : {
        title: "Source",
        rows: [],
        activeRowIndex: 0,
        detailLines: ["No source target selected."],
        target: null
      };
  const provenanceWorkbenchRecord = inspector?.target?.ownerTargetId
    ? (state.recordIndex.get(inspector.target.ownerTargetId) ?? null)
    : (inspector?.target?.kind === "record" || inspector?.target?.kind === "context" || inspector?.target?.kind === "provenance"
      ? (state.recordIndex.get(inspector.target.id) ?? null)
      : selectedRecord ?? activeLeftRecord ?? null);
  const provenanceWorkbench = provenanceWorkbenchRecord
    ? buildProvenanceWorkbenchModel(
        provenanceWorkbenchRecord,
        inspector.inspection ?? null,
        session,
        (uiState.rightCursor ?? Number(inspector.activeProvenanceIndex ?? 0) ?? 0),
        sessionProvenanceViewIsActive(session) && session.provenanceView.targetId === provenanceWorkbenchRecord.id
          ? {
              entries: session.provenanceView.entries,
              activeProvenanceIndex: session.provenanceView.activeProvenanceIndex
            }
          : null
      )
    : {
        title: "Provenance",
        rows: [],
        activeRowIndex: 0,
        detailLines: ["No provenance target selected."],
        target: null
      };
  const activeScreenSpec = operatorWorkbenchScreenSpec(state, activeScreenId) ?? null;
  const activeDatasetSpec = activeScreenSpec?.datasetId
    ? (operatorWorkbenchDatasetSpec(state, activeScreenSpec.datasetId) ?? null)
    : null;
  const customScreen = activeScreenSpec
    ? buildCustomWorkbenchScreen(activeScreenSpec, activeDatasetSpec, {
        session,
        datasetLookup: datasetId => operatorWorkbenchDatasetSpec(state, datasetId),
        inspector,
        referencesWorkbench,
        sourceWorkbench,
        provenanceWorkbench
      })
    : null;
  if (customScreen?.id) {
    const nextScreenState = ensureScreenSectionSessionState(session, customScreen.id);
    nextScreenState.activeSectionId = customScreen.activeSectionId ?? null;
    for (const section of arrayWrap(customScreen.sections)) {
      if (!section?.id) continue;
      nextScreenState.cursorsBySectionId[section.id] = clampWorkbenchRowCursor(
        nextScreenState.cursorsBySectionId?.[section.id] ?? section.activeRowIndex ?? 0,
        section.rows
      );
    }
  }
  const rightCursorRows = arrayWrap(customScreen?.rows);
  const rightCursorLimit = Math.max(0, rightCursorRows.length - 1);
  const requestedRightCursor = uiState.rightCursor ?? customScreen?.activeRowIndex ?? 0;
  const rightCursor = Math.min(Math.max(0, Number(requestedRightCursor) || 0), rightCursorLimit);
  const activeLeftScreenSpec = resultView
    ? null
    : (
        (activeScreenSpec?.leftScreenId ? operatorWorkbenchLeftScreenSpec(state, activeScreenSpec.leftScreenId) : null)
        ?? (workbenchDefinition.defaultLeftScreen ? operatorWorkbenchLeftScreenSpec(state, workbenchDefinition.defaultLeftScreen) : null)
      );
  const activeLeftDatasetSpec = activeLeftScreenSpec?.datasetId
    ? (operatorWorkbenchDatasetSpec(state, activeLeftScreenSpec.datasetId) ?? null)
    : null;
  const leftPaneModel = resultView
    ? buildResultLeftPaneModel(resultView, materializedResultView, session)
    : buildAuthoredLeftPaneModel(state, session, activeLeftScreenSpec, activeLeftDatasetSpec, {
        inspector,
        referencesWorkbench,
        sourceWorkbench,
        provenanceWorkbench
      });
  const leftCursorLimit = Math.max(0, leftPaneModel.rows.length - 1);
  const leftCursor = Math.min(Math.max(0, Number(uiState.leftCursor ?? 0) || 0), leftCursorLimit);
  const resolvedActiveLeftRow = leftPaneModel.rows[leftCursor] ?? null;

  return {
    mode: "detached",
    path: buildTuiPathText(state, session),
    focus: {
      kind: session.focusKind ?? null,
      id: session.focusId ?? null,
      active: Boolean(session.focusKind)
    },
    preview: {
      available: previewReadAvailability(state).ok,
      writable: previewReadAvailability(state).ok,
      sessionId: session.previewSessionId ?? null,
      baseAppRevision: session.baseAppRevision ?? null,
      previewRevision: session.previewRevision ?? 0,
      status: session.previewStatus,
      invalidReason: session.invalidReason ?? null,
      lastMutation: session.lastPreviewMutation ? structuredClone(session.lastPreviewMutation) : null
    },
    session: {
      selectionId: session.selectionId ?? null,
      worldRecordCount: state.worldRecords.length,
      platformRecordCount: state.platformRecords.length,
      appRoot: state.runtimeContext.appProject?.appRoot ?? null,
      worldHome: state.runtimeContext.operatorContract?.worldHome ?? null
    },
    ui: {
      focusedPane,
      inspectorTab,
      rightScreenMode,
      helpOpen: Boolean(uiState.helpOpen),
      rightSectionIndex: Number(customScreen?.activeSectionIndex ?? uiState.rightSectionIndex ?? 0) || 0,
      rightSectionCursorsByScreenId: structuredClone(uiState.rightSectionCursorsByScreenId ?? {}),
      collapsedSectionIdsByScreenId: structuredClone(uiState.collapsedSectionIdsByScreenId ?? {}),
      numberBuffer: String(uiState.numberBuffer ?? ""),
      lastOutput: optionalText(uiState.lastOutput) ?? "",
      lastStatus: optionalText(uiState.lastStatus) ?? "info",
      displaySettings: structuredClone(uiState.displaySettings ?? {})
    },
    screens: {
      activeScreenId: activeScreenSpec?.id ?? activeScreenId,
      available: workbenchDefinition.screens.map(screen => ({
        id: screen.id,
        title: screen.title,
        subtitle: screen.subtitle ?? null,
        shape: screen.shape,
        datasetId: screen.datasetId ?? null,
        dataSource: screen.dataSource,
        shortcut: screen.shortcut ?? null,
        origin: screen.origin ?? "builtin"
      })),
      shortcuts: workbenchDefinition.shortcutRows.map(row => ({
        shortcut: row.shortcut,
        screenId: row.screenId,
        title: row.title,
        origin: row.origin
      }))
    },
    topPane: {
      title: "Operator Workbench",
      subtitle: session.focusKind ? `focus=${session.focusKind}:${session.focusId}` : "global",
      navigation: buildWorkbenchNavigationModel(state, session, {
        screenId: activeScreenSpec?.id ?? activeScreenId,
        screenSpec: activeScreenSpec,
        resultView,
        materializedResultView,
        selectedIndex: uiState.topCursor ?? 0
      })
    },
    leftPane: {
      mode: leftPaneModel.mode,
      screenId: leftPaneModel.screenId ?? null,
      shape: leftPaneModel.shape ?? (leftPaneModel.mode === "results" ? "table" : "tree"),
      dataSource: leftPaneModel.dataSource ?? null,
      title: leftPaneModel.title,
      header: leftPaneModel.header,
      path: buildTuiPathText(state, session),
      helpText: leftPaneModel.helpText ?? null,
      origin: leftPaneModel.origin ?? "builtin",
      overlay: Boolean(leftPaneModel.overlay),
      columns: leftPaneModel.columns,
      rows: leftPaneModel.rows,
      cursor: leftCursor,
      activeRowIndex: leftCursor,
      activeRow: resolvedActiveLeftRow ? structuredClone(resolvedActiveLeftRow) : null,
      rowCount: leftPaneModel.rows.length,
      paging: leftPaneModel.paging
    },
    rightPane: {
      title: rightPaneTitleForScreen(customScreen),
      screenMode: rightScreenMode,
      activeScreenId: activeScreenSpec?.id ?? activeScreenId,
      screen: customScreen,
      activeSection: customScreen
        ? {
            id: customScreen.activeSectionId ?? null,
            title: customScreen.activeSectionTitle ?? null,
            rowCount: customScreen.activeSectionRowCount ?? 0,
            actionable: Boolean(customScreen.activeSectionActionable),
            collapsible: customScreen.activeSectionCollapsible === false ? false : true,
            collapsed: Boolean(customScreen.activeSectionCollapsed)
          }
        : null,
      tab: activeScreenSpec?.id ?? activeScreenId,
      bodyLines: customScreen?.detailLines ?? [],
      references: inspector.references,
      referencesWorkbench,
      sourceWorkbench,
      sourceEntries: inspector.sources ?? [],
      activeSourceIndex: Number(inspector.activeSourceIndex ?? 0) || 0,
      provenanceWorkbench,
      provenanceEntries: inspector.provenanceEntries ?? [],
      activeProvenanceIndex: Number(inspector.activeProvenanceIndex ?? 0) || 0,
      provenanceDetailLines: inspector.provenanceDetailLines ?? inspector.provenanceLines ?? [],
      cursor: rightCursor,
      target: inspector.target ?? null,
      previewInspection: inspector.inspection ? {
        target: inspector.inspection.target,
        componentKind: inspector.inspection.componentKind ?? null,
        editable: Boolean(inspector.inspection.editable),
        editableSource: inspector.inspection.editableSource ? structuredClone(inspector.inspection.editableSource) : null,
        authoredProps: structuredClone(inspector.inspection.authoredProps ?? {}),
        runtimeProps: structuredClone(inspector.inspection.runtimeProps ?? {}),
        validProps: structuredClone(inspector.inspection.validProps ?? []),
        previewSessionId: session.previewSessionId ?? null,
        previewRevision: session.previewRevision ?? 0,
        previewStatus: session.previewStatus ?? "inactive"
      } : null,
      tabs: {
        inspect: true,
        references: true,
        source: true,
        provenance: true
      }
    }
  };
}

function autocompleteContainerNames(state) {
  return [...state.containerIndex.values()]
    .filter(container => container.id !== ROOT_CONTAINER_ID)
    .flatMap(container => {
      const names = [
        optionalText(container.label)?.toLowerCase(),
        humanizeAutocompleteName(container.name),
        humanizeAutocompleteName(container.id).includes(":") ? null : humanizeAutocompleteName(container.id)
      ].filter(Boolean);
      return uniqueStrings(names);
    });
}

function autocompleteContextTargets(state) {
  return state.worldRecords
    .filter(record => record.scope === "world" && record.kind === "context")
    .flatMap(record => uniqueStrings([record.id, record.title]));
}

function autocompleteRecordReferences(session) {
  const aliases = Object.keys(session.aliases).sort();
  const indexed = session.lastEntries
    .map((entry, index) => entry?.type === "record" ? String(index + 1) : null)
    .filter(Boolean);
  const visibleRecords = session.lastEntries
    .flatMap(entry => entry?.type === "record" ? [
      entry.record.id,
      entry.record.title
    ] : [])
    .filter(Boolean);
  return uniqueStrings([
    "this",
    ...aliases,
    ...indexed,
    ...visibleRecords
  ]);
}

function autocompleteSavedViewNames(session) {
  return stableSortStrings(Object.keys(session.savedResultViews ?? {}));
}

function autocompleteProgramNames(session) {
  return stableSortStrings(Object.keys(session.programs ?? {}));
}

export function buildTuiAutocompleteCandidates(state, session) {
  const columns = Object.keys(RESULT_VIEW_COLUMN_CATALOG);
  const sorts = [...RESULT_VIEW_SORT_NAMES];
  const containerNames = autocompleteContainerNames(state);
  const recordRefs = autocompleteRecordReferences(session);
  const savedViews = autocompleteSavedViewNames(session);
  const programs = autocompleteProgramNames(session);
  const contextTargets = autocompleteContextTargets(state);
  const screenIds = operatorWorkbenchDefinitionForState(state).screens.map(screen => screen.id);
  return uniqueStrings([
    "status",
    "tree",
    "look",
    "ls",
    "pwd",
    "open ",
    ...containerNames.map(name => `open ${name}`),
    "back",
    "close",
    "home",
    "use ",
    "use context ",
    ...contextTargets.map(target => `use context ${target}`),
    "select ",
    ...recordRefs.map(ref => `select ${ref}`),
    "inspect",
    "inspect ",
    ...recordRefs.map(ref => `inspect ${ref}`),
    "source",
    "source ",
    ...recordRefs.map(ref => `source ${ref}`),
    "source next",
    "source prev",
    "source open ",
    ...["1","2","3","4","5"].map(index => `source open ${index}`),
    "sources",
    "sources ",
    ...recordRefs.map(ref => `sources ${ref}`),
    "provenance",
    "provenance ",
    "provenance next",
    "provenance prev",
    "provenance open ",
    ...["1", "2", "3", "4", "5"].map(index => `provenance open ${index}`),
    ...recordRefs.map(ref => `provenance ${ref}`),
    "refs",
    "refs ",
    ...recordRefs.map(ref => `refs ${ref}`),
    ...recordRefs.map(ref => `link ${ref}`),
    "search ",
    "search --scope world ",
    "search --scope platform ",
    "columns",
    "column add ",
    ...columns.map(column => `column add ${column}`),
    "column remove ",
    ...columns.map(column => `column remove ${column}`),
    "column reset",
    "sort by ",
    ...sorts.map(sort => `sort by ${sort}`),
    "sort reset",
    "filter ",
    ...columns.map(column => `filter ${column}=`),
    "filter clear",
    "filters",
    "values ",
    ...columns.map(column => `values ${column}`),
    "next",
    "prev",
    "page ",
    "view save ",
    ...savedViews.map(name => `view open ${name}`),
    ...savedViews.map(name => `view delete ${name}`),
    "view open ",
    "view close",
    "view delete ",
    "views",
    "clear",
    "aliases",
    "history",
    "history ",
    "note add ",
    "notes",
    "program save ",
    ...programs.map(name => `program run ${name}`),
    "program run ",
    "programs",
    "props",
    "props ",
    "props runtime",
    "props runtime ",
    "props valid",
    "props valid ",
    "set ",
    "preview",
    "preview clear",
    "undo",
    "redo",
    "link",
    "link ",
    ...recordRefs.map(ref => `link ${ref}`),
    "open-link ",
    "screen",
    "screen inspect",
    ...screenIds.map(id => `screen ${id}`),
    "section",
    "section next",
    "section prev",
    "section collapse",
    "section expand",
    "section toggle",
    "refresh",
    "leave",
    "help",
    "quit",
    "exit"
  ]);
}

function matchingTuiAutocompleteCandidates(candidates, line) {
  const normalizedLine = normalizeAutocompleteLine(line).toLowerCase();
  if (!normalizedLine) return candidates.slice();
  return candidates.filter(candidate => candidate.toLowerCase().startsWith(normalizedLine));
}

export function buildTuiAutocompletePreview(state, session, line) {
  const normalizedLine = normalizeAutocompleteLine(line);
  if (!normalizedLine) return "";
  const candidates = buildTuiAutocompleteCandidates(state, session);
  const matches = matchingTuiAutocompleteCandidates(candidates, normalizedLine);
  if (!matches.length) return "";
  const suggestion = matches[0];
  if (!suggestion || suggestion.length <= normalizedLine.length) return "";
  return suggestion.slice(normalizedLine.length);
}

function createLinkForRecord(state, record) {
  return buildRecordDeepLink(state, record, {
    label: `${record.scope}:${record.id}`
  });
}

function clearContextFocusState(session) {
  session.focusKind = null;
  session.focusId = null;
  session.focusLabel = null;
  session.focusReturnPath = [];
  session.focusReturnSelectionId = null;
}

function setContextFocusState(session, record) {
  session.focusKind = "context";
  session.focusId = record.id;
  session.focusLabel = record.title;
}

function currentWorkbenchWorld(runtimeContext) {
  return runtimeContext?.appSnapshotManager?.getActiveSnapshot?.()?.world ?? runtimeContext.world;
}

function previewManagerForState(state) {
  return state.runtimeContext?.appPreviewSessionManager ?? null;
}

function previewReadAvailability(state) {
  const previewManager = previewManagerForState(state);
  if (previewManager) return { ok: true, previewManager };
  if (!state.runtimeContext?.appProject) {
    return {
      ok: false,
      reason: "preview sessions unavailable in detached repo self-model mode (no app snapshot manager)."
    };
  }
  return {
    ok: false,
    reason: "preview sessions unavailable because the app preview session manager is not ready."
  };
}

function clearPreviewSessionState(session) {
  session.previewSessionId = null;
  session.baseAppRevision = null;
  session.previewRevision = 0;
  session.previewStatus = "inactive";
  session.invalidReason = null;
  session.lastPreviewMutation = null;
}

function syncPreviewSessionState(session, previewSession = null) {
  if (!previewSession) {
    clearPreviewSessionState(session);
    return;
  }
  session.previewSessionId = previewSession.id ?? null;
  session.baseAppRevision = Number(previewSession.baseAppRevision ?? 0) || 0;
  session.previewRevision = Number(previewSession.previewRevision ?? 0) || 0;
  session.previewStatus = String(previewSession.status || "inactive");
  session.invalidReason = previewSession.invalidReason ?? null;
}

function readPreviewSession(state, session) {
  const previewManager = previewManagerForState(state);
  if (!previewManager || !session.previewSessionId) return null;
  const previewSession = previewManager.readSession(session.previewSessionId);
  if (!previewSession) {
    clearPreviewSessionState(session);
    return null;
  }
  syncPreviewSessionState(session, previewSession);
  return previewSession;
}

function resolveSetCommandInput(state, session, text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;
  const firstToken = parts[0];
  const secondToken = parts[1];
  const resolvedTarget = resolveRecordReference(state, session, firstToken);
  if (resolvedTarget && parts.length >= 3) {
    return {
      record: resolvedTarget,
      target: firstToken,
      field: secondToken,
      valueText: trimmed.slice(firstToken.length + secondToken.length + 2)
    };
  }
  return {
    record: null,
    target: null,
    field: firstToken,
    valueText: trimmed.slice(firstToken.length + 1)
  };
}

async function resolvePreviewInspectionForRecord(state, session, record, {
  createPreviewSession = true
} = {}) {
  if (!record) {
    return { ok: false, error: "no selected target." };
  }
  if (record.scope === "platform") {
    return { ok: false, error: "preview properties are unavailable for platform records." };
  }
  const previewSession = ensurePreviewSessionForRead(state, session, { create: createPreviewSession });
  if (!previewSession) {
    return {
      ok: false,
      error: previewReadAvailability(state).reason
    };
  }
  const refreshed = readPreviewSession(state, session) ?? previewSession;
  if (refreshed?.status === "stale") {
    return {
      ok: false,
      error: `preview session stale: ${refreshed.invalidReason}`,
      previewSession: refreshed
    };
  }
  const previewManager = previewManagerForState(state);
  const inspection = await previewManager?.inspectTarget?.(refreshed.id, record.id, {
    preferredTarget: record.id
  });
  if (!inspection) {
    return {
      ok: false,
      error: `preview target not found: ${record.id}`,
      previewSession: refreshed
    };
  }
  return {
    ok: true,
    previewManager,
    previewSession: refreshed,
    inspection: normalizePreviewInspection(record, inspection)
  };
}

async function applyPreviewPropertyChange(state, session, {
  previewSessionId = null,
  record,
  property,
  value,
  createPreviewSession = true
} = {}) {
  const resolved = await resolvePreviewInspectionForRecord(state, session, record, {
    createPreviewSession
  });
  if (!resolved.ok) return resolved;
  if (previewSessionId && resolved.previewSession?.id !== previewSessionId) {
    return {
      ok: false,
      error: `preview session changed or missing; expected ${previewSessionId}, active ${resolved.previewSession?.id ?? "(none)"}.`
    };
  }
  const beforeRevision = Number(resolved.previewSession?.previewRevision ?? session.previewRevision ?? 0) || 0;
  const result = await resolved.previewManager.patchTargetProperty(resolved.previewSession.id, {
    target: resolved.inspection.target,
    property,
    value
  });
  syncPreviewSessionState(session, result?.previewSession ?? null);
  const normalizedInspection = normalizePreviewInspection(record, result?.inspection ?? null);
  return {
    ok: true,
    previewSession: result?.previewSession ?? null,
    inspection: normalizedInspection,
    previewRevisionBefore: beforeRevision,
    previewRevisionAfter: Number(result?.previewSession?.previewRevision ?? session.previewRevision ?? beforeRevision) || beforeRevision
  };
}

function ensurePreviewSessionForRead(state, session, { create = false } = {}) {
  const availability = previewReadAvailability(state);
  if (!availability.ok) return null;
  if (session.previewSessionId) {
    const previewSession = readPreviewSession(state, session);
    if (!previewSession) {
      clearPreviewSessionState(session);
    } else {
      return previewSession;
    }
  }
  if (!create) return null;
  const previewSession = availability.previewManager.createSession();
  syncPreviewSessionState(session, previewSession);
  return previewSession;
}

function normalizePreviewInspection(record, inspection) {
  if (!inspection) return null;
  return {
    title: record?.title ?? inspection.target,
    id: record?.id ?? inspection.target,
    scope: record?.scope ?? "world",
    kind: record?.kind ?? inspection.componentKind ?? "surface",
    target: inspection.target,
    resolvedFrom: inspection.resolvedFrom ?? null,
    componentKind: inspection.componentKind ?? null,
    editable: Boolean(inspection.editable),
    editableSource: inspection.editableSource ? {
      file: inspection.editableSource.file,
      sourceId: inspection.editableSource.sourceId ?? null,
      sourceLanguage: inspection.editableSource.sourceLanguage ?? null
    } : null,
    authoredProps: structuredClone(inspection.authoredProps ?? {}),
    runtimeProps: structuredClone(inspection.runtimeProps ?? {}),
    validProps: arrayWrap(inspection.validProps).map(entry => ({
      key: entry?.key ?? null,
      valueType: entry?.valueType ?? null,
      options: arrayWrap(entry?.options)
    })),
    breadcrumbs: arrayWrap(inspection.breadcrumbs),
    provenance: inspection.provenance ? structuredClone(inspection.provenance) : null,
    sources: arrayWrap(inspection.sources).map(source => ({
      file: source.file,
      sourceId: source.sourceId ?? null,
      startLine: source.startLine ?? source.line ?? null,
      sourceLanguage: source.sourceLanguage ?? null,
      sourceKind: source.sourceKind ?? null
    })),
    candidates: arrayWrap(inspection.candidates).map(candidate => ({
      target: candidate.target,
      confidence: candidate.confidence ?? null,
      matchType: candidate.matchType ?? null,
      sourceCount: candidate.sourceCount ?? null
    }))
  };
}

function renderPreviewInspection(inspection) {
  const lines = [
    `${inspection.title}`,
    `id: ${inspection.id}`,
    `scope: ${inspection.scope}`,
    `kind: ${inspection.kind}`,
    `preview target: ${inspection.target}`,
    `component kind: ${inspection.componentKind ?? "(unknown)"}`,
    `editable: ${inspection.editable ? "yes" : "no"}`
  ];
  if (inspection.resolvedFrom && inspection.resolvedFrom !== inspection.target) {
    lines.push(`resolved from: ${inspection.resolvedFrom}`);
  }
  if (inspection.editableSource?.file) {
    lines.push(`source: ${inspection.editableSource.file}`);
    if (inspection.editableSource.sourceId) lines.push(`source id: ${inspection.editableSource.sourceId}`);
    if (inspection.editableSource.sourceLanguage) lines.push(`source language: ${inspection.editableSource.sourceLanguage}`);
  }
  const authoredEntries = Object.entries(inspection.authoredProps ?? {});
  if (authoredEntries.length) {
    lines.push("authored props:");
    for (const [key, value] of authoredEntries.slice(0, 12)) {
      lines.push(`  - ${key}: ${formatValue(value)}`);
    }
  }
  const runtimeEntries = Object.entries(inspection.runtimeProps?.props ?? {});
  if (runtimeEntries.length) {
    lines.push("runtime props:");
    for (const [key, value] of runtimeEntries.slice(0, 12)) {
      lines.push(`  - ${key}: ${formatValue(value)}`);
    }
  }
  if (inspection.validProps.length) {
    lines.push(`valid props: ${inspection.validProps.map(entry => entry.valueType ? `${entry.key} (${entry.valueType})` : entry.key).join(", ")}`);
  }
  if (inspection.breadcrumbs.length) {
    lines.push(`breadcrumbs: ${inspection.breadcrumbs.map(entry => entry?.label ?? entry?.target ?? entry?.id).filter(Boolean).join(" > ")}`);
  }
  const provenanceReasons = arrayWrap(inspection.provenance?.reasons);
  if (provenanceReasons.length) {
    lines.push("provenance reasons:");
    for (const reason of provenanceReasons.slice(0, 8)) {
      const detail = [reason.kind, reason.value].filter(Boolean).join(": ");
      lines.push(`  - ${detail || JSON.stringify(reason)}`);
    }
  }
  if (inspection.sources.length) {
    lines.push("provenance:");
    for (const source of inspection.sources.slice(0, 8)) {
      const location = source.startLine ? `${source.file}:${source.startLine}` : source.file;
      const detail = [optionalText(source.sourceKind), optionalText(source.sourceLanguage)].filter(Boolean).join(" | ");
      lines.push(`  - ${location}${detail ? ` (${detail})` : ""}`);
    }
  }
  return lines.join("\n");
}

function renderPreviewPropsView(inspection, session, mode = "authored") {
  const header = [
    `${inspection.title}`,
    `id: ${inspection.id}`,
    `preview target: ${inspection.target}`,
    `component kind: ${inspection.componentKind ?? "(unknown)"}`,
    `preview session: ${session?.previewSessionId ?? "(none)"}`,
    `preview revision: ${session?.previewRevision ?? 0}`,
    `editable: ${inspection.editable ? "yes" : "no"}`
  ];
  if (inspection.editableSource?.sourceId) header.push(`source id: ${inspection.editableSource.sourceId}`);
  if (mode === "runtime") {
    const runtimeEntries = Object.entries(inspection.runtimeProps?.props ?? {});
    header.push("runtime props:");
    if (!runtimeEntries.length) header.push("  - (none)");
    for (const [key, value] of runtimeEntries) {
      header.push(`  - ${key}: ${formatValue(value)}`);
    }
    return header.join("\n");
  }
  if (mode === "valid") {
    header.push("valid props:");
    if (!inspection.validProps.length) header.push("  - (none)");
    for (const entry of inspection.validProps) {
      const label = entry?.valueType ? `${entry.key} (${entry.valueType})` : entry.key;
      const options = arrayWrap(entry?.options).length ? ` [${entry.options.join(", ")}]` : "";
      header.push(`  - ${label}${options}`);
    }
    return header.join("\n");
  }
  const authoredEntries = Object.entries(inspection.authoredProps ?? {});
  header.push("authored props:");
  if (!authoredEntries.length) header.push("  - (none)");
  for (const [key, value] of authoredEntries) {
    header.push(`  - ${key}: ${formatValue(value)}`);
  }
  return header.join("\n");
}

async function executeBatchCommands(engine, commands) {
  const outputs = [];
  for (const command of commands) {
    const result = await engine.execute(command, { allowProgramRecursion: true });
    if (result.output) outputs.push(`> ${command}\n${result.output}`);
    else outputs.push(`> ${command}`);
    if (result.exit) break;
  }
  return outputs.join("\n\n");
}

function createEmptySession() {
  return {
    currentPath: [],
    selectionId: null,
    focusKind: null,
    focusId: null,
    focusLabel: null,
    focusReturnPath: [],
    focusReturnSelectionId: null,
    aliases: {},
    notes: [],
    resultView: null,
    savedResultViews: {},
    previewSessionId: null,
    baseAppRevision: null,
    previewRevision: 0,
    previewStatus: "inactive",
    invalidReason: null,
    lastPreviewMutation: null,
    programs: {},
    history: [],
    undoStack: [],
    redoStack: [],
    sourceView: null,
    provenanceView: null,
    lastEntries: [],
    activeWorkbenchScreenId: "inspect",
    activeWorkbenchInspectorTab: "inspect",
    workbenchInspectorSpec: null,
    workbenchSectionStateByScreenId: {}
  };
}

function applyWorkbenchUiToSession(session, ui = null) {
  if (!ui || typeof ui !== "object") return;
  if (ui.activeScreenId !== undefined && ui.activeScreenId !== null) {
    session.activeWorkbenchScreenId = optionalText(ui.activeScreenId) ?? "inspect";
  }
  if (ui.inspectorTab !== undefined && ui.inspectorTab !== null) {
    session.activeWorkbenchInspectorTab = optionalText(ui.inspectorTab) ?? "inspect";
  }
  if (ui.inspectorSpec !== undefined) {
    session.workbenchInspectorSpec = ui.inspectorSpec ? deepClone(ui.inspectorSpec) : null;
  }
}

function buildWorkbenchState(runtimeContext) {
  const workbenchWorld = currentWorkbenchWorld(runtimeContext);
  const worldGraph = worldGraphProjection(workbenchWorld.allWitnesses());
  const platformModelProject = typeof workbenchWorld?.project === "function"
    ? workbenchWorld.project.bind(workbenchWorld)
    : (() => []);
  return buildPlatformModel({
    project: platformModelProject
  }).then(platformModel => {
    const worldRecords = worldGraph.nodes.map(normalizeWorldRecord);
    const platformRecords = platformModel.nodes.map(normalizePlatformRecord);
    const recordIndex = new Map();
    for (const record of [...worldRecords, ...platformRecords]) {
      recordIndex.set(`${record.scope}:${record.id}`, record);
      if (!recordIndex.has(record.id)) recordIndex.set(record.id, record);
    }
    return {
      runtimeContext,
      worldGraph,
      platformModel,
      worldRecords,
      platformRecords,
      recordIndex,
      containerIndex: new Map()
    };
  });
}

function recordCommand(session, command, status, extra = {}) {
  session.history.push({
    at: timestamp(),
    command,
    status,
    ...extra
  });
  if (session.history.length > 200) session.history.shift();
}

function setSessionSourceView(session, record, representation) {
  if (!representation) {
    session.sourceView = null;
    return;
  }
  session.sourceView = {
    targetId: record?.id ?? null,
    contextId: optionalText(record?.metadata?.context) ?? null,
    sources: deepClone(representation.sources ?? []),
    activeSourceIndex: Number(representation.activeSourceIndex ?? 0) || 0
  };
}

function sessionSourceViewIsActive(session) {
  return Boolean(session?.sourceView?.targetId && Array.isArray(session?.sourceView?.sources));
}

function setSessionProvenanceView(session, record, representation) {
  if (!representation) {
    session.provenanceView = null;
    return;
  }
  session.provenanceView = {
    targetId: record?.id ?? null,
    contextId: optionalText(record?.metadata?.context) ?? null,
    entries: deepClone(representation.entries ?? []),
    activeProvenanceIndex: Number(representation.activeProvenanceIndex ?? 0) || 0
  };
}

function sessionProvenanceViewIsActive(session) {
  return Boolean(session?.provenanceView?.targetId && Array.isArray(session?.provenanceView?.entries));
}

function parseProgramDefinition(text) {
  const match = String(text || "").match(/^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+)$/);
  if (!match) return null;
  const name = match[1];
  const commands = match[2]
    .split(";")
    .map(entry => entry.trim())
    .filter(Boolean);
  if (!commands.length) return null;
  return { name, commands };
}

export function createOperatorTuiEngine(state, session = createEmptySession()) {
  const engine = {
    state,
    session,
    async rebuild() {
      const nextState = await buildWorkbenchState(state.runtimeContext);
      state.worldGraph = nextState.worldGraph;
      state.platformModel = nextState.platformModel;
      state.worldRecords = nextState.worldRecords;
      state.platformRecords = nextState.platformRecords;
      state.recordIndex = nextState.recordIndex;
      state.containerIndex = nextState.containerIndex;
      refreshContainerIndex();
      if (session.resultView) {
        requeryResultView(session.resultView);
        materializeResultView(session.resultView);
        session.lastEntries = materializeResultView(session.resultView).entries;
      } else {
        session.lastEntries = [];
      }
    },
    async execute(input, options = {}) {
      const command = String(input ?? "").trim();
      if (!command) return { output: "", exit: false };

      refreshContainerIndex();

      try {
        const result = await executeInternal(command, options);
        applyWorkbenchUiToSession(session, result?.ui);
        if (!options.skipHistory) {
          recordCommand(session, command, result.status ?? (result.exit ? "exit" : "ok"), {
            selectionId: session.selectionId,
            ...(result.history ?? {})
          });
        }
        return result;
      } catch (error) {
        if (!options.skipHistory) {
          const extra = error?.tuiMeta && typeof error.tuiMeta === "object" ? error.tuiMeta : {};
          recordCommand(session, command, "error", {
            error: error instanceof Error ? error.message : String(error),
            selectionId: session.selectionId,
            ...extra
          });
        }
        return {
          output: `error: ${error instanceof Error ? error.message : String(error)}`,
          exit: false,
          status: "error"
        };
      }
    }
  };

  function refreshContainerIndex() {
    state.containerIndex = createContainerIndex(state, session);
  }

  function listContainer(containerId = currentContainerId(session)) {
    refreshContainerIndex();
    const entries = buildContainerEntries(state, session, containerId);
    session.lastEntries = entries;
    const container = state.containerIndex.get(containerId);
    const header = containerId === ROOT_CONTAINER_ID
      ? "root"
      : `${container?.label ?? containerId}`;
    const lines = [`${header}`];
    if (!entries.length) lines.push("(empty)");
    entries.forEach((entry, index) => {
      lines.push(renderEntry(entry, index + 1, session));
    });
    return lines.join("\n");
  }

  function requireResultView() {
    return session.resultView ?? null;
  }

  function requeryResultView(resultView, { activeViewName } = {}) {
    const nextRows = searchRecords(state, {
      query: resultView.query,
      scope: resultView.scope,
      focusContextId: resultView.focusContextId ?? null
    });
    resultView.rawRows = createResultViewRows(nextRows);
    if (activeViewName !== undefined) {
      resultView.activeViewName = optionalText(activeViewName);
    }
    return resultView;
  }

  async function currentWorkbenchSectionContext() {
    const snapshot = await buildOperatorWorkbenchSnapshot(state, session, {});
    return {
      snapshot,
      screenId: snapshot.rightPane?.activeScreenId ?? session.activeWorkbenchScreenId ?? "inspect",
      screen: snapshot.rightPane?.screen ?? null
    };
  }

  function formatSectionCommandLines(screen) {
    const sections = arrayWrap(screen?.sections);
    if (!sections.length) return ["(no sections)"];
    return sections.map((section, index) => {
      const markers = [
        index === (screen.activeSectionIndex ?? 0) ? "*" : " ",
        section.collapsed ? "-" : " "
      ].join("");
      const state = section.actionable ? "actionable" : "info";
      return ` [${markers}] ${index + 1}. ${section.title ?? section.id ?? "Section"} <${section.kind ?? "list"}> rows=${arrayWrap(section.rows).length} state=${state}${section.id ? ` id=${section.id}` : ""}`;
    });
  }

  function formatSectionCommandOutput(screen, heading = null) {
    const title = heading ?? `${screen?.title ?? "Screen"} sections`;
    const activeSummary = screen
      ? `active=${screen.activeSectionTitle ?? screen.activeSectionId ?? "(none)"} | rows=${screen.activeSectionRowCount ?? 0} | state=${screen.activeSectionCollapsed ? "collapsed" : "expanded"} | ${screen.activeSectionActionable ? "actionable" : "info"}`
      : "active=(none)";
    return [title, activeSummary, ...formatSectionCommandLines(screen)].join("\n");
  }

  function resolveScreenSectionReference(screen, token) {
    const sections = arrayWrap(screen?.sections);
    const normalized = optionalText(token);
    if (!normalized) return null;
    const numeric = Number(normalized);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= sections.length) {
      return sections[numeric - 1] ?? null;
    }
    return sections.find(section => section?.id === normalized) ?? null;
  }

  function setActiveResultView(resultView) {
    session.resultView = resultView;
    return renderResultView(session);
  }

  function clearActiveResultView() {
    session.resultView = null;
    session.lastEntries = [];
  }

  function buildSavedResultView(name) {
    const saved = session.savedResultViews[name] ?? null;
    if (!saved) return null;
    return buildResultView({
      ...saved,
      records: searchRecords(state, {
        query: saved.query,
        scope: saved.scope,
        focusContextId: saved.focusContextId ?? null
      }),
      activeViewName: name
    });
  }

  function resolveSearchConfig(searchParams) {
    if (!searchParams.explicitScope && isContextFocusActive(session)) {
      return {
        scope: "context",
        focusContextId: session.focusId
      };
    }
    return {
      scope: searchParams.scope,
      focusContextId: null
    };
  }

  async function runProgram(name, options = {}) {
    const commands = arrayWrap(session.programs[name]);
    if (!commands.length) {
      return {
        output: `program ${name} not found.`,
        exit: false
      };
    }
    const depth = Number(options.depth ?? 0);
    if (depth >= 5) {
      return {
        output: "program recursion depth exceeded.",
        exit: false
      };
    }
    const outputs = [];
    for (const command of commands) {
      const result = await engine.execute(command, {
        skipHistory: true,
        allowProgramRecursion: true,
        depth: depth + 1
      });
      outputs.push(`> ${command}`);
      if (result.output) outputs.push(result.output);
      if (result.exit) return { output: outputs.join("\n"), exit: true };
    }
    return { output: outputs.join("\n"), exit: false };
  }

  async function previewInspectionForRecord(record) {
    if (!record || record.scope === "platform") return null;
    const previewSession = ensurePreviewSessionForRead(state, session, { create: true });
    readPreviewSession(state, session);
    if (previewSession?.status === "stale") {
      return {
        error: `preview session stale: ${previewSession.invalidReason}`,
        previewSession
      };
    }
    if (!previewSession) return { inspection: null, previewSession: null };
    const previewInspection = await previewManagerForState(state).inspectTarget(previewSession.id, record.id, {
      preferredTarget: record.id
    });
    return {
      inspection: previewInspection ? normalizePreviewInspection(record, previewInspection) : null,
      previewSession
    };
  }

  async function sourceRepresentationForRecord(record, override = null) {
    if (!record) return { error: "no selected target.", representation: null, inspection: null };
    const previewState = await previewInspectionForRecord(record);
    if (previewState?.error) return { error: previewState.error, representation: null, inspection: null };
    const representation = await buildSourceRepresentation(record, previewState?.inspection ?? null, override);
    return {
      error: null,
      representation,
      inspection: previewState?.inspection ?? null
    };
  }

  async function provenanceRepresentationForRecord(record, override = null) {
    if (!record) return { error: "no selected target.", representation: null, inspection: null };
    const previewState = await previewInspectionForRecord(record);
    if (previewState?.error) return { error: previewState.error, representation: null, inspection: null };
    return {
      error: null,
      representation: buildProvenanceRepresentation(record, previewState?.inspection ?? null, session, override),
      inspection: previewState?.inspection ?? null
    };
  }

  function formatSourcesList(representation) {
    if (!representation?.sources?.length) return "sources: (none)";
    return renderSourceListLines(representation.sources, representation.activeSourceIndex).join("\n");
  }

  function formatProvenanceView(representation) {
    if (!representation) return "entries: (none)";
    return representation.lines.join("\n");
  }

  async function openSourceForEntry(record, entry) {
    const { representation, error } = await sourceRepresentationForRecord(record, {
      sourcePath: entry?.sourcePath ?? null,
      sourceLine: entry?.sourceLine ?? null,
      sourceId: entry?.sourceId ?? null,
      sourceLanguage: entry?.sourceLanguage ?? null,
      sourceKind: entry?.sourceKind ?? null
    });
    if (error) return { output: error, exit: false, status: "error" };
    setSessionSourceView(session, record, representation);
      return {
        output: representation.lines.join("\n"),
        exit: false,
        ui: {
          ...builtInScreenUi("source"),
          inspectorSpec: {
            kind: "source",
            ownerTargetId: record.id,
            contextId: session.sourceView.contextId,
            activeSourceIndex: representation.activeSourceIndex,
            sources: representation.sources,
            sourcePath: entry?.sourcePath ?? null,
            sourceLine: entry?.sourceLine ?? null,
            sourceId: entry?.sourceId ?? null,
            sourceLanguage: entry?.sourceLanguage ?? null,
            sourceKind: entry?.sourceKind ?? null
          }
        }
      };
  }

  async function executeProvenanceEntryAction(entry) {
    if (!entry?.actionable) {
      return {
        output: entry?.disabledReason ?? "provenance entry is informational only.",
        exit: false,
        status: "error"
      };
    }
    if (entry.actionKind === "inspect-record") {
      return executeInternal(`inspect ${entry.targetId}`);
    }
    if (entry.actionKind === "open-provenance") {
      const record = entry.targetId ? (state.recordIndex.get(entry.targetId) ?? null) : null;
      if (!record) {
        return { output: "provenance target no longer exists.", exit: false, status: "error" };
      }
      const { representation, error } = await provenanceRepresentationForRecord(record, {
        entries: session.provenanceView?.entries ?? null,
        ...entry
      });
      if (error) return { output: error, exit: false, status: "error" };
      setSessionProvenanceView(session, record, representation);
      return {
        output: formatProvenanceView(representation),
        exit: false,
        ui: {
          ...builtInScreenUi("provenance"),
          inspectorSpec: {
            kind: "provenance",
            targetId: record.id,
            activeProvenanceIndex: representation.activeProvenanceIndex,
            entries: representation.entries
          }
        }
      };
    }
    if (entry.actionKind === "open-source") {
      const record = entry.ownerTargetId ? (state.recordIndex.get(entry.ownerTargetId) ?? null) : null;
      if (!record) {
        return { output: "source owner no longer exists.", exit: false, status: "error" };
      }
      return openSourceForEntry(record, entry);
    }
    if (entry.actionKind === "open-preview-session") {
      const previewView = describePreviewSessionForWorkbench(session);
      return {
        output: previewView.inspectLines.join("\n"),
        exit: false,
        ui: {
          ...builtInScreenUi("inspect"),
          inspectorSpec: {
            kind: "preview-session",
            targetId: entry.targetId ?? session.previewSessionId ?? null
          }
        }
      };
    }
    return {
      output: "provenance entry action is not supported.",
      exit: false,
      status: "error"
    };
  }

  async function openOperatorLink(uriText) {
    const parsed = parseOperatorUri(uriText);
    if (!parsed.ok) {
      return {
        output: `invalid operator URI: ${parsed.error}`,
        exit: false,
        status: "error"
      };
    }
    if (parsed.kind === "record") {
      const target = `${parsed.scope}:${parsed.targetId}`;
      const result = await engine.execute(`inspect ${target}`, { skipHistory: true });
      return {
        ...result,
        ui: {
          ...(result.ui ?? {}),
          ...builtInScreenUi("inspect"),
          inspectorSpec: {
            kind: "record",
            targetId: parsed.targetId
          }
        }
      };
    }
    if (parsed.kind === "context") {
      const result = await engine.execute(`use context ${parsed.targetId}`, { skipHistory: true });
      return {
        ...result,
        ui: {
          ...(result.ui ?? {}),
          ...builtInScreenUi("inspect"),
          inspectorSpec: {
            kind: "context",
            targetId: parsed.targetId
          }
        }
      };
    }
    if (parsed.kind === "source") {
      const target = `${parsed.scope}:${parsed.targetId}`;
      const result = await engine.execute(`source ${target}`, { skipHistory: true });
      return {
        ...result,
        ui: {
          ...(result.ui ?? {}),
          ...builtInScreenUi("source"),
          inspectorSpec: {
            kind: "source",
            ownerTargetId: parsed.targetId,
            sourcePath: parsed.sourcePath,
            sourceLine: parsed.sourceLine,
            sourceId: parsed.sourceId,
            sourceLanguage: parsed.sourceLanguage,
            sourceKind: parsed.sourceKind
          }
        }
      };
    }
    if (parsed.kind === "provenance") {
      const target = `${parsed.scope}:${parsed.targetId}`;
      const result = await engine.execute(`provenance ${target}`, { skipHistory: true });
      return {
        ...result,
        ui: {
          ...(result.ui ?? {}),
          ...builtInScreenUi("provenance"),
          inspectorSpec: {
            kind: "provenance",
            targetId: parsed.targetId
          }
        }
      };
    }
    if (parsed.kind === "preview-session") {
      const previewView = describePreviewSessionForWorkbench(session);
      return {
        output: previewView.inspectLines.join("\n"),
        exit: false,
        ui: {
          ...builtInScreenUi("inspect"),
          inspectorSpec: {
            kind: "preview-session",
            targetId: parsed.targetId
          }
        }
      };
    }
    if (parsed.kind === "view") {
      const result = await engine.execute(`view open ${parsed.targetId}`, { skipHistory: true });
      return {
        ...result,
        ui: {
          ...(result.ui ?? {}),
          ...builtInScreenUi("inspect")
        }
      };
    }
    return {
      output: `unsupported operator URI kind: ${parsed.kind}`,
      exit: false,
      status: "error"
    };
  }

  async function executeInternal(command, options = {}) {
    if (command === "help") {
      return {
        output: [
          "Commands:",
          "  status",
          "  tree",
          "  look",
          "  ls",
          "  pwd",
          "  <index>  (default primary action for the current list row)",
          "  open <index|container>",
          "  back",
          "  close",
          "  use <index|id|alias|this>",
          "  use context <id|title>",
          "  leave",
          "  home",
          "  select <index|id|alias|this>",
          "  inspect [index|id|alias|this]",
          "  source [index|id|alias|this]",
          "  sources [index|id|alias|this]",
          "  source next",
          "  source prev",
          "  source open <index>",
          "  provenance [index|id|alias|this]",
          "  provenance next",
          "  provenance prev",
          "  provenance open <index>",
          "  search <text>",
          "  search --scope all|world|platform <text>",
          "  columns",
          "  column add <name>",
          "  column remove <name>",
          "  column reset",
          "  sort by <column>",
          "  sort reset",
          "  filter <column>=<value>",
          "  filter clear",
          "  filters",
          "  values <column>",
          "  next",
          "  prev",
          "  page <n>",
          "  view save <name>",
          "  view open <name>",
          "  view close",
          "  view delete <name>",
          "  views",
          "  clear",
          "  aliases",
          "  history [text]",
          "  note add <text>",
          "  notes",
          "  program save <name> = <cmd ; cmd>",
          "  program run <name>",
          "  programs",
          "  props [target]",
          "  props runtime [target]",
          "  props valid [target]",
          "  set <field> <json-or-text>",
          "  set <target> <field> <json-or-text>",
          "  preview",
          "  preview clear",
          "  undo",
          "  redo",
          "  source [target]",
          "  provenance [target]",
          "  refs [target]",
          "  link [target]",
          "  open-link <operator-uri>",
          "  screen",
          "  screen inspect",
          "  screen <id> [target]",
          "  section",
          "  section next",
          "  section prev",
          "  section <id|index>",
          "  section collapse",
          "  section expand",
          "  section toggle",
          "  refresh",
          "  quit"
        ].join("\n"),
        exit: false
      };
    }

    if (command === "status") {
      const previewSession = ensurePreviewSessionForRead(state, session, { create: true });
      return {
        output: summarizeStatus(state, session),
        exit: false,
        history: previewSession ? {
          previewSessionId: previewSession.id,
          previewRevisionBefore: previewSession.previewRevision,
          previewRevisionAfter: previewSession.previewRevision
        } : {}
      };
    }

    if (command === "tree") {
      return { output: listContainer(), exit: false };
    }

    if (command === "ls" || command === "look") {
      return { output: listContainer(), exit: false };
    }

    if (command === "pwd") {
      return {
        output: buildTuiPathText(state, session),
        exit: false
      };
    }

    if (/^\d+$/.test(command)) {
      const index = Number(command) - 1;
      const entry = session.lastEntries[index] ?? null;
      const primaryCommand = primaryCommandForSessionEntry(entry, index);
      if (!entry || !primaryCommand) {
        return {
          output: `no primary action for row ${command}.`,
          exit: false,
          status: "error"
        };
      }
      return executeInternal(primaryCommand, options);
    }

    if (command === "back" || command === "close") {
      pushLocalUndoState(session, command);
      const next = currentPathEntries(session).slice(0, -1);
      session.currentPath = next;
      return { output: listContainer(), exit: false };
    }

    if (command === "home") {
      pushLocalUndoState(session, "home");
      session.currentPath = [];
      return { output: listContainer(), exit: false };
    }

    const useContextMatch = command.match(/^use\s+context\s+(.+)$/);
    if (useContextMatch) {
      const record = resolveRecordReference(state, session, useContextMatch[1]);
      if (!record || record.scope !== "world" || record.kind !== "context") {
        return {
          output: `context not found: ${useContextMatch[1]}`,
          exit: false,
          status: "error"
        };
      }
      pushLocalUndoState(session, `use ${record.id}`);
      clearActiveResultView();
      session.focusReturnPath = currentPathEntries(session);
      session.focusReturnSelectionId = session.selectionId;
      setContextFocusState(session, record);
      session.currentPath = [];
      session.selectionId = record.id;
      refreshContainerIndex();
      return { output: listContainer(), exit: false };
    }

    const useMatch = command.match(/^use\s+(.+)$/);
    if (useMatch) {
      const record = resolveRecordReference(state, session, useMatch[1]);
      if (!record) return { output: `target not found: ${useMatch[1]}`, exit: false };
      if (record.scope !== "world" || record.kind !== "context") {
        return {
          output: "use is context-only in this tranche.",
          exit: false,
          status: "error"
        };
      }
      pushLocalUndoState(session, `use ${record.id}`);
      clearActiveResultView();
      session.focusReturnPath = currentPathEntries(session);
      session.focusReturnSelectionId = session.selectionId;
      setContextFocusState(session, record);
      session.currentPath = [];
      session.selectionId = record.id;
      refreshContainerIndex();
      return { output: listContainer(), exit: false };
    }

    if (command === "leave") {
      if (!isContextFocusActive(session)) {
        return { output: "no active focus.", exit: false, status: "error" };
      }
      pushLocalUndoState(session, "leave");
      const returnPath = arrayWrap(session.focusReturnPath);
      const returnSelectionId = session.focusReturnSelectionId ?? null;
      clearActiveResultView();
      clearContextFocusState(session);
      session.currentPath = returnPath;
      session.selectionId = returnSelectionId;
      refreshContainerIndex();
      return { output: listContainer(), exit: false };
    }

    if (command === "aliases") {
      const rows = Object.entries(session.aliases)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([alias, targetId]) => `${alias} = ${targetId}`);
      return {
        output: rows.length ? rows.join("\n") : "(no aliases)",
        exit: false
      };
    }

    if (command === "notes") {
      return {
        output: session.notes.length
          ? session.notes.map((entry, index) => `${index + 1}. ${entry.text}`).join("\n")
          : "(no notes)",
        exit: false
      };
    }

    if (command === "programs") {
      const names = Object.keys(session.programs).sort();
      return {
        output: names.length
          ? names.map(name => `${name}: ${session.programs[name].join(" ; ")}`).join("\n")
          : "(no programs)",
        exit: false
      };
    }

    if (command === "columns") {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      const active = resultView.columns.join(", ");
      const available = Object.keys(RESULT_VIEW_COLUMN_CATALOG)
        .filter(column => !resultView.columns.includes(column))
        .join(", ");
      return {
        output: [
          `active columns: ${active || "(none)"}`,
          `available columns: ${available || "(none)"}`
        ].join("\n"),
        exit: false
      };
    }

    const columnAddMatch = command.match(/^column\s+add\s+(.+)$/);
    if (columnAddMatch) {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      const column = normalizeResultViewColumn(columnAddMatch[1]);
      if (!column) {
        return {
          output: `unknown column: ${columnAddMatch[1]} (available: ${Object.keys(RESULT_VIEW_COLUMN_CATALOG).join(", ")})`,
          exit: false,
          status: "error"
        };
      }
      if (!resultView.columns.includes(column)) resultView.columns.push(column);
      resultView.activeViewName = null;
      resultView.page = 1;
      return { output: setActiveResultView(resultView), exit: false };
    }

    const columnRemoveMatch = command.match(/^column\s+remove\s+(.+)$/);
    if (columnRemoveMatch) {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      const column = normalizeResultViewColumn(columnRemoveMatch[1]);
      if (!column) {
        return {
          output: `unknown column: ${columnRemoveMatch[1]} (available: ${Object.keys(RESULT_VIEW_COLUMN_CATALOG).join(", ")})`,
          exit: false,
          status: "error"
        };
      }
      const nextColumns = resultView.columns.filter(entry => entry !== column);
      if (!nextColumns.length) {
        return {
          output: "at least one column must remain active.",
          exit: false,
          status: "error"
        };
      }
      resultView.columns = nextColumns;
      resultView.activeViewName = null;
      resultView.page = 1;
      return { output: setActiveResultView(resultView), exit: false };
    }

    if (command === "column reset") {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      resultView.columns = [...DEFAULT_RESULT_VIEW_COLUMNS];
      resultView.activeViewName = null;
      resultView.page = 1;
      return { output: setActiveResultView(resultView), exit: false };
    }

    const sortByMatch = command.match(/^sort\s+by\s+(.+)$/);
    if (sortByMatch) {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      const sort = sanitizeResultViewSort(sortByMatch[1]);
      if (normalizeResultViewColumn(sortByMatch[1]) == null && normalizeSearchText(sortByMatch[1]) !== "relevance") {
        return {
          output: `unknown sort: ${sortByMatch[1]} (available: relevance, ${Object.keys(RESULT_VIEW_COLUMN_CATALOG).join(", ")})`,
          exit: false,
          status: "error"
        };
      }
      resultView.sort = sort;
      resultView.activeViewName = null;
      resultView.page = 1;
      return { output: setActiveResultView(resultView), exit: false };
    }

    if (command === "sort reset") {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      resultView.sort = "relevance";
      resultView.activeViewName = null;
      resultView.page = 1;
      return { output: setActiveResultView(resultView), exit: false };
    }

    if (command === "filter clear") {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      resultView.filters = [];
      resultView.activeViewName = null;
      resultView.page = 1;
      return { output: setActiveResultView(resultView), exit: false };
    }

    if (command === "filters") {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      return {
        output: resultView.filters.length
          ? resultView.filters.map((filter, index) => `${index + 1}. ${describeResultViewFilter(filter)}`).join("\n")
          : "(no filters)",
        exit: false
      };
    }

    const valuesMatch = command.match(/^values\s+(.+)$/);
    if (valuesMatch) {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      const column = normalizeResultViewColumn(valuesMatch[1]);
      if (!column) {
        return {
          output: `unknown column: ${valuesMatch[1]} (available: ${Object.keys(RESULT_VIEW_COLUMN_CATALOG).join(", ")})`,
          exit: false,
          status: "error"
        };
      }
      return {
        output: summarizeResultViewValues(resultView, column),
        exit: false
      };
    }
    if (/^values(?:\s|$)/.test(command)) {
      return {
        output: "usage: values <column>",
        exit: false,
        status: "error"
      };
    }

    const filterMatch = command.match(/^filter\s+([^=\s]+)=(.+)$/);
    if (filterMatch) {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      const column = normalizeResultViewColumn(filterMatch[1]);
      const value = optionalText(filterMatch[2]);
      if (!column || !value) {
        return {
          output: "usage: filter <column>=<value>",
          exit: false,
          status: "error"
        };
      }
      resultView.filters.push({ column, value });
      resultView.activeViewName = null;
      resultView.page = 1;
      return { output: setActiveResultView(resultView), exit: false };
    }
    if (/^filter(?:\s|$)/.test(command)) {
      return {
        output: "usage: filter <column>=<value> or filter clear",
        exit: false,
        status: "error"
      };
    }

    if (command === "next") {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      const materialized = materializeResultView(resultView);
      resultView.page = Math.min(materialized.totalPages, resultView.page + 1);
      return { output: setActiveResultView(resultView), exit: false };
    }

    if (command === "prev") {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      resultView.page = Math.max(1, resultView.page - 1);
      return { output: setActiveResultView(resultView), exit: false };
    }

    const pageMatch = command.match(/^page\s+(\d+)$/);
    if (pageMatch) {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      const nextPage = Number(pageMatch[1]);
      const materialized = materializeResultView(resultView);
      if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage > materialized.totalPages) {
        return {
          output: `page out of range: ${nextPage} (valid range: 1-${materialized.totalPages})`,
          exit: false,
          status: "error"
        };
      }
      resultView.page = nextPage;
      return { output: setActiveResultView(resultView), exit: false };
    }
    if (/^page(?:\s|$)/.test(command)) {
      return { output: "usage: page <n>", exit: false, status: "error" };
    }

    const viewSaveMatch = command.match(/^view\s+save\s+([A-Za-z][A-Za-z0-9_-]*)$/);
    if (viewSaveMatch) {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      const name = viewSaveMatch[1];
      session.savedResultViews[name] = snapshotResultViewConfig(resultView);
      resultView.activeViewName = name;
      return { output: `saved view ${name}.`, exit: false };
    }

    const viewOpenMatch = command.match(/^view\s+open\s+([A-Za-z][A-Za-z0-9_-]*)$/);
    if (viewOpenMatch) {
      const nextView = buildSavedResultView(viewOpenMatch[1]);
      if (!nextView) {
        return {
          output: `view not found: ${viewOpenMatch[1]}`,
          exit: false,
          status: "error"
        };
      }
      return { output: setActiveResultView(nextView), exit: false };
    }

    if (command === "view close") {
      const resultView = requireResultView();
      if (!resultView) return { output: "no active result view.", exit: false, status: "error" };
      if (!resultView.activeViewName) {
        return { output: "no active saved view.", exit: false, status: "error" };
      }
      resultView.activeViewName = null;
      return { output: "view closed; result view remains active in ad hoc mode.", exit: false };
    }

    const viewDeleteMatch = command.match(/^view\s+delete\s+([A-Za-z][A-Za-z0-9_-]*)$/);
    if (viewDeleteMatch) {
      const name = viewDeleteMatch[1];
      if (!session.savedResultViews[name]) {
        return {
          output: `view not found: ${name}`,
          exit: false,
          status: "error"
        };
      }
      delete session.savedResultViews[name];
      if (session.resultView?.activeViewName === name) session.resultView.activeViewName = null;
      return { output: `deleted view ${name}.`, exit: false };
    }

    if (command === "views") {
      const names = Object.keys(session.savedResultViews).sort();
      const ansi = supportsAnsiColor();
      return {
        output: names.length
          ? names.map(name => {
              const active = session.resultView?.activeViewName === name;
              const prefix = active ? (ansi ? "👁 " : "* ") : "  ";
              const saved = session.savedResultViews[name];
              return `${prefix}${name}: search ${JSON.stringify(saved.query)} [scope=${saved.scope}]`;
            }).join("\n")
          : "(no saved views)",
        exit: false
      };
    }

    if (command === "clear") {
      if (!session.resultView) return { output: "no active result view.", exit: false, status: "error" };
      clearActiveResultView();
      return { output: "result view cleared.", exit: false };
    }

    if (/^view(?:\s|$)/.test(command)) {
      return {
        output: "usage: view save <name> | view open <name> | view close | view delete <name> | views",
        exit: false,
        status: "error"
      };
    }

    if (command === "preview") {
      const previewSession = ensurePreviewSessionForRead(state, session, { create: true });
      if (!previewSession) {
        return {
          output: previewReadAvailability(state).reason,
          exit: false
        };
      }
      readPreviewSession(state, session);
      if (previewSession.status === "stale") {
        return {
          output: [
            `session: ${session.previewSessionId}`,
            `base revision: ${session.baseAppRevision ?? 0}`,
            `preview revision: ${session.previewRevision ?? 0}`,
            `status: ${session.previewStatus}${session.invalidReason ? ` (${session.invalidReason})` : ""}`,
            "writes: blocked while stale; run `refresh` to clear and recreate"
          ].join("\n"),
          exit: false,
          status: "error",
          history: {
            previewSessionId: session.previewSessionId,
            previewRevisionBefore: session.previewRevision,
            previewRevisionAfter: session.previewRevision,
            invalidReason: session.invalidReason
          }
        };
      }
      if (!session.previewSessionId) {
        return {
          output: "(no preview session)",
          exit: false
        };
      }
      const header = [
        `session: ${session.previewSessionId}`,
        `base revision: ${session.baseAppRevision ?? 0}`,
        `preview revision: ${session.previewRevision ?? 0}`,
        `status: ${session.previewStatus}${session.invalidReason ? ` (${session.invalidReason})` : ""}`,
        "writes: preview-only authored property edits"
      ];
      if (session.lastPreviewMutation) {
        header.push(`last edit: ${formatPreviewMutationSummary(session.lastPreviewMutation)}`);
      }
      return {
        output: header.join("\n"),
        exit: false,
        history: {
          previewSessionId: session.previewSessionId,
          previewRevisionBefore: session.previewRevision,
          previewRevisionAfter: session.previewRevision
        }
      };
    }

    if (command === "preview clear") {
      const previewManager = previewManagerForState(state);
      if (previewManager && session.previewSessionId) {
        previewManager.deleteSession(session.previewSessionId);
      }
      clearPreviewSessionState(session);
      return { output: "preview session cleared.", exit: false };
    }

    if (command === "refresh") {
      const snapshotManager = state.runtimeContext?.appSnapshotManager ?? null;
      if (snapshotManager?.ensureFresh) {
        await snapshotManager.ensureFresh({ trigger: "request" });
      }
      let suffix = "";
      const previewSession = readPreviewSession(state, session);
      if (previewSession?.status === "stale") {
        if (previewManagerForState(state)?.deleteSession && session.previewSessionId) {
          previewManagerForState(state).deleteSession(session.previewSessionId);
        }
        clearPreviewSessionState(session);
        suffix = " stale preview session cleared.";
      }
      await engine.rebuild();
      return { output: `workbench refreshed.${suffix}`, exit: false };
    }

    if (command === "undo") {
      const entry = session.undoStack[session.undoStack.length - 1] ?? null;
      if (!entry) return { output: "nothing to undo.", exit: false };
      if (entry.kind === "local") {
        session.undoStack.pop();
        session.redoStack.push({
          kind: "local",
          label: entry.label,
          snapshot: snapshotSessionState(session)
        });
        restoreSessionState(session, entry.snapshot);
        return { output: `undid ${entry.label}.`, exit: false };
      }
      if (entry.kind === "preview") {
        const activePreviewSession = readPreviewSession(state, session);
        if (!activePreviewSession || activePreviewSession.id !== entry.previewSessionId) {
          return {
            output: `preview undo unavailable: expected session ${entry.previewSessionId}, active ${activePreviewSession?.id ?? "(none)"}.`,
            exit: false,
            status: "error"
          };
        }
        if (activePreviewSession.status === "stale") {
          return {
            output: `preview session stale: ${activePreviewSession.invalidReason}`,
            exit: false,
            status: "error"
          };
        }
        const record = state.recordIndex.get(entry.recordId) ?? null;
        const result = await applyPreviewPropertyChange(state, session, {
          previewSessionId: entry.previewSessionId,
          record,
          property: entry.property,
          value: cloneSerializableValue(entry.previousValue),
          createPreviewSession: false
        });
        if (!result.ok) {
          return {
            output: result.error,
            exit: false,
            status: "error"
          };
        }
        session.undoStack.pop();
        session.redoStack.push(entry);
        session.lastPreviewMutation = {
          target: entry.target,
          property: entry.property,
          previousValue: cloneSerializableValue(entry.nextValue),
          nextValue: cloneSerializableValue(entry.previousValue),
          previewSessionId: entry.previewSessionId,
          previewRevisionBefore: result.previewRevisionBefore,
          previewRevisionAfter: result.previewRevisionAfter
        };
        return {
          output: `undid ${entry.label}.`,
          exit: false,
          history: {
            previewSessionId: entry.previewSessionId,
            previewRevisionBefore: result.previewRevisionBefore,
            previewRevisionAfter: result.previewRevisionAfter,
            target: entry.target,
            property: entry.property
          }
        };
      }
      return { output: "nothing to undo.", exit: false };
    }

    if (command === "redo") {
      const entry = session.redoStack[session.redoStack.length - 1] ?? null;
      if (!entry) return { output: "nothing to redo.", exit: false };
      if (entry.kind === "local") {
        session.redoStack.pop();
        session.undoStack.push({
          kind: "local",
          label: entry.label,
          snapshot: snapshotSessionState(session)
        });
        restoreSessionState(session, entry.snapshot);
        return { output: `redid ${entry.label}.`, exit: false };
      }
      if (entry.kind === "preview") {
        const activePreviewSession = readPreviewSession(state, session);
        if (!activePreviewSession || activePreviewSession.id !== entry.previewSessionId) {
          return {
            output: `preview redo unavailable: expected session ${entry.previewSessionId}, active ${activePreviewSession?.id ?? "(none)"}.`,
            exit: false,
            status: "error"
          };
        }
        if (activePreviewSession.status === "stale") {
          return {
            output: `preview session stale: ${activePreviewSession.invalidReason}`,
            exit: false,
            status: "error"
          };
        }
        const record = state.recordIndex.get(entry.recordId) ?? null;
        const result = await applyPreviewPropertyChange(state, session, {
          previewSessionId: entry.previewSessionId,
          record,
          property: entry.property,
          value: cloneSerializableValue(entry.nextValue),
          createPreviewSession: false
        });
        if (!result.ok) {
          return {
            output: result.error,
            exit: false,
            status: "error"
          };
        }
        session.redoStack.pop();
        session.undoStack.push(entry);
        session.lastPreviewMutation = {
          target: entry.target,
          property: entry.property,
          previousValue: cloneSerializableValue(entry.previousValue),
          nextValue: cloneSerializableValue(entry.nextValue),
          previewSessionId: entry.previewSessionId,
          previewRevisionBefore: result.previewRevisionBefore,
          previewRevisionAfter: result.previewRevisionAfter
        };
        return {
          output: `redid ${entry.label}.`,
          exit: false,
          history: {
            previewSessionId: entry.previewSessionId,
            previewRevisionBefore: result.previewRevisionBefore,
            previewRevisionAfter: result.previewRevisionAfter,
            target: entry.target,
            property: entry.property
          }
        };
      }
      return { output: "nothing to redo.", exit: false };
    }

    if (command === "quit" || command === "exit") {
      return { output: "bye.", exit: true };
    }

    const openMatch = command.match(/^open\s+(.+)$/);
    if (openMatch) {
      const target = resolveTreeTarget(state, session, openMatch[1]);
      if (!target || target.kind !== "container") {
        return { output: `container not found: ${openMatch[1]}`, exit: false };
      }
      pushLocalUndoState(session, `open ${target.value.id}`);
      const normalized = currentPathEntries(session);
      const parentId = target.value.parentId;
      if (parentId && parentId !== currentContainerId(session)) {
        if (target.value.id === activeRootContainerId(session)) session.currentPath = [];
        else session.currentPath = buildPathFromContainer(state.containerIndex, target.value.id);
      } else if (target.value.id === activeRootContainerId(session)) {
        session.currentPath = [];
      } else {
        session.currentPath = [...normalized, target.value.id];
      }
      return { output: listContainer(target.value.id), exit: false };
    }

    const selectMatch = command.match(/^select\s+(.+)$/);
    if (selectMatch) {
      const record = resolveRecordReference(state, session, selectMatch[1]);
      if (!record) return { output: `target not found: ${selectMatch[1]}`, exit: false };
      pushLocalUndoState(session, `select ${record.id}`);
      session.selectionId = record.id;
      return { output: `this = ${recordDescriptor(record)}`, exit: false };
    }

    const inspectMatch = command.match(/^inspect(?:\s+(.+))?$/);
    if (inspectMatch) {
      const record = inspectMatch[1]
        ? resolveRecordReference(state, session, inspectMatch[1])
        : resolveRecordReference(state, session, "this");
      if (!record) return { output: "no selected target.", exit: false };
      if (record.scope !== "platform") {
        const previewSession = ensurePreviewSessionForRead(state, session, { create: true });
        if (!previewSession) {
          return {
            output: renderRecordDetails(record),
            exit: false,
            ui: {
              inspectorSpec: {
                kind: deepLinkKindForRecord(record),
                targetId: record.id
              }
            }
          };
        }
        readPreviewSession(state, session);
        if (previewSession?.status === "stale") {
          return {
            output: `preview session stale: ${previewSession.invalidReason}`,
            exit: false,
            status: "error",
            history: {
              resolvedTarget: record.id,
              previewSessionId: previewSession.id,
              previewRevisionBefore: previewSession.previewRevision,
              previewRevisionAfter: previewSession.previewRevision,
              invalidReason: previewSession.invalidReason
            }
          };
        }
        if (previewSession) {
          const inspection = await previewManagerForState(state).inspectTarget(previewSession.id, record.id, {
            preferredTarget: record.id
          });
          if (inspection) {
            return {
              output: renderPreviewInspection(normalizePreviewInspection(record, inspection)),
              exit: false,
              ui: {
                ...builtInScreenUi("inspect"),
                inspectorSpec: {
                  kind: deepLinkKindForRecord(record),
                  targetId: record.id
                }
              },
              history: {
                resolvedTarget: inspection.target,
                previewSessionId: previewSession.id,
                previewRevisionBefore: previewSession.previewRevision,
                previewRevisionAfter: previewSession.previewRevision
              }
            };
          }
        }
      }
      return {
        output: renderRecordDetails(record),
        exit: false,
        ui: {
          ...builtInScreenUi("inspect"),
          inspectorSpec: {
            kind: deepLinkKindForRecord(record),
            targetId: record.id
          }
        }
      };
    }

    const refsMatch = command.match(/^refs(?:\s+(.+))?$/);
    if (refsMatch) {
      const record = refsMatch[1]
        ? resolveRecordReference(state, session, refsMatch[1])
        : resolveRecordReference(state, session, "this");
      if (!record) return { output: "no selected target.", exit: false };
      let inspection = null;
      if (record.scope !== "platform") {
        const previewSession = ensurePreviewSessionForRead(state, session, { create: true });
        readPreviewSession(state, session);
        if (previewSession?.status === "stale") {
          return {
            output: `preview session stale: ${previewSession.invalidReason}`,
            exit: false,
            status: "error"
          };
        }
        if (previewSession) {
          const previewInspection = await previewManagerForState(state).inspectTarget(previewSession.id, record.id, {
            preferredTarget: record.id
          });
          inspection = previewInspection ? normalizePreviewInspection(record, previewInspection) : null;
        }
      }
      const references = workbenchReferencesForInspection(state, session, record, inspection);
      return {
        output: formatDeepLinkList(references),
        exit: false,
        ui: {
          ...builtInScreenUi("references"),
          inspectorSpec: {
            kind: deepLinkKindForRecord(record),
            targetId: record.id
          }
        }
      };
    }

    if (command === "screen") {
      return {
        output: operatorWorkbenchScreenLines(state).join("\n"),
        exit: false
      };
    }

    const screenMatch = command.match(/^screen\s+([A-Za-z_][A-Za-z0-9_.:-]*)(?:\s+(.+))?$/);
    if (screenMatch) {
      const screen = screenMatch[1];
      const target = optionalText(screenMatch[2]);
      const screenSpec = operatorWorkbenchScreenSpec(state, screen);
      if (screen === "inspect") {
        if (!target) {
          return {
            output: "inspector screen active.",
            exit: false,
            ui: builtInScreenUi("inspect")
          };
        }
        const result = await executeInternal(`inspect ${target}`);
        return {
          ...result,
          ui: {
            ...(result.ui ?? {}),
            ...builtInScreenUi("inspect")
          }
        };
      }
      if (!screenSpec) {
        return {
          output: `unknown screen: ${screen}`,
          exit: false,
          status: "error"
        };
      }
      if (screen === "references") {
        const result = await executeInternal(target ? `refs ${target}` : "refs");
        return {
          ...result,
          ui: {
            ...(result.ui ?? {}),
            ...builtInScreenUi("references")
          }
        };
      }
      if (screen === "source") {
        const result = await executeInternal(target ? `source ${target}` : "source");
        return {
          ...result,
          ui: {
            ...(result.ui ?? {}),
            ...builtInScreenUi("source")
          }
        };
      }
      if (screen === "provenance") {
        const result = await executeInternal(target ? `provenance ${target}` : "provenance");
        return {
          ...result,
          ui: {
            ...(result.ui ?? {}),
            ...builtInScreenUi("provenance")
          }
        };
      }
      const result = target ? await executeInternal(`inspect ${target}`) : { output: `${screenSpec.title} screen active.`, exit: false };
      return {
        ...result,
        ui: {
          ...(result.ui ?? {}),
          rightScreenMode: "custom-screen",
          activeScreenId: screenSpec.id,
          inspectorTab: screenSpec.id
        }
      };
    }

    if (command === "section"
      || command === "section next"
      || command === "section prev"
      || command === "section collapse"
      || command === "section expand"
      || command === "section toggle"
      || /^section\s+(.+)$/.test(command)) {
      const { screenId, screen } = await currentWorkbenchSectionContext();
      if (!screen) {
        return { output: "no active right-pane screen.", exit: false, status: "error" };
      }
      const sections = arrayWrap(screen.sections);
      if (!sections.length) {
        return { output: "active screen has no sections.", exit: false, status: "error" };
      }
      const screenState = ensureScreenSectionSessionState(session, screenId);
      const activeSection = sections[screen.activeSectionIndex ?? 0] ?? sections[0] ?? null;
      if (command === "section") {
        return {
          output: formatSectionCommandOutput(screen, `${screen.title ?? screenId} sections`),
          exit: false
        };
      }
      if (command === "section collapse" || command === "section expand" || command === "section toggle") {
        if (!activeSection) {
          return { output: "no active section.", exit: false, status: "error" };
        }
        if (activeSection.collapsible === false) {
          return {
            output: `${activeSection.title ?? activeSection.id ?? "section"} cannot be collapsed.`,
            exit: false,
            status: "error"
          };
        }
        const collapsedIds = new Set(arrayWrap(screenState.collapsedSectionIds));
        const shouldCollapse = command === "section collapse"
          ? true
          : (command === "section expand" ? false : !collapsedIds.has(activeSection.id));
        if (shouldCollapse) {
          collapsedIds.add(activeSection.id);
          screenState.lastCollapsedSectionId = activeSection.id;
        } else {
          collapsedIds.delete(activeSection.id);
          if (screenState.lastCollapsedSectionId === activeSection.id) screenState.lastCollapsedSectionId = null;
        }
        screenState.collapsedSectionIds = [...collapsedIds];
        const nextSnapshot = await buildOperatorWorkbenchSnapshot(state, session, {});
        const nextScreen = nextSnapshot.rightPane?.screen ?? null;
        return {
          output: formatSectionCommandOutput(nextScreen ?? screen, `${nextScreen?.title ?? screen.title ?? screenId} sections`),
          exit: false,
          ui: {
            activeScreenId: screenId,
            inspectorTab: screenId
          }
        };
      }
      if (command === "section next" || command === "section prev") {
        const delta = command === "section next" ? 1 : -1;
        let nextIndex = screen.activeSectionIndex ?? 0;
        for (let step = 0; step < sections.length; step += 1) {
          nextIndex = (nextIndex + delta + sections.length) % sections.length;
          const candidate = sections[nextIndex];
          if (!candidate) continue;
          if (candidate.collapsed && !candidate.actionable && !arrayWrap(candidate.rows).length) continue;
          break;
        }
        const nextSection = sections[nextIndex] ?? null;
        if (!nextSection) {
          return { output: "no target section.", exit: false, status: "error" };
        }
        screenState.activeSectionId = nextSection.id ?? null;
        const nextSnapshot = await buildOperatorWorkbenchSnapshot(state, session, {});
        const nextScreen = nextSnapshot.rightPane?.screen ?? null;
        return {
          output: formatSectionCommandOutput(nextScreen ?? screen, `${nextScreen?.title ?? screen.title ?? screenId} sections`),
          exit: false,
          ui: {
            activeScreenId: screenId,
            inspectorTab: screenId
          }
        };
      }
      const sectionMatch = command.match(/^section\s+(.+)$/);
      const targetSection = resolveScreenSectionReference(screen, sectionMatch?.[1]);
      if (!targetSection) {
        return {
          output: `section not found: ${sectionMatch?.[1] ?? "(empty)"}`,
          exit: false,
          status: "error"
        };
      }
      screenState.activeSectionId = targetSection.id ?? null;
      const nextSnapshot = await buildOperatorWorkbenchSnapshot(state, session, {});
      const nextScreen = nextSnapshot.rightPane?.screen ?? null;
      return {
        output: formatSectionCommandOutput(nextScreen ?? screen, `${nextScreen?.title ?? screen.title ?? screenId} sections`),
        exit: false,
        ui: {
          activeScreenId: screenId,
          inspectorTab: screenId
        }
      };
    }

    if (command === "source next" || command === "source prev") {
      if (!sessionSourceViewIsActive(session)) {
        return { output: "no active source representation.", exit: false, status: "error" };
      }
      const record = state.recordIndex.get(session.sourceView.targetId) ?? null;
      if (!record) return { output: "source target no longer exists.", exit: false, status: "error" };
      const sources = arrayWrap(session.sourceView.sources);
      if (!sources.length) return { output: "no sources are available for this target.", exit: false, status: "error" };
      const delta = command === "source next" ? 1 : -1;
      const nextIndex = (Number(session.sourceView.activeSourceIndex ?? 0) + delta + sources.length) % sources.length;
      const { representation, error } = await sourceRepresentationForRecord(record, {
        sources,
        activeSourceIndex: nextIndex
      });
      if (error) return { output: error, exit: false, status: "error" };
      setSessionSourceView(session, record, representation);
      return {
        output: representation.lines.join("\n"),
        exit: false,
        ui: {
          ...builtInScreenUi("source"),
          inspectorSpec: {
            kind: "source",
            ownerTargetId: record.id,
            contextId: session.sourceView.contextId,
            activeSourceIndex: representation.activeSourceIndex,
            sources: representation.sources
          }
        }
      };
    }

    const sourceOpenMatch = command.match(/^source\s+open\s+(\d+)$/);
    if (sourceOpenMatch) {
      if (!sessionSourceViewIsActive(session)) {
        return { output: "no active source representation.", exit: false, status: "error" };
      }
      const record = state.recordIndex.get(session.sourceView.targetId) ?? null;
      if (!record) return { output: "source target no longer exists.", exit: false, status: "error" };
      const sources = arrayWrap(session.sourceView.sources);
      const nextIndex = Number(sourceOpenMatch[1]) - 1;
      if (nextIndex < 0 || nextIndex >= sources.length) {
        return { output: `source index out of range: ${sourceOpenMatch[1]}`, exit: false, status: "error" };
      }
      const { representation, error } = await sourceRepresentationForRecord(record, {
        sources,
        activeSourceIndex: nextIndex
      });
      if (error) return { output: error, exit: false, status: "error" };
      setSessionSourceView(session, record, representation);
      return {
        output: representation.lines.join("\n"),
        exit: false,
        ui: {
          ...builtInScreenUi("source"),
          inspectorSpec: {
            kind: "source",
            ownerTargetId: record.id,
            contextId: session.sourceView.contextId,
            activeSourceIndex: representation.activeSourceIndex,
            sources: representation.sources
          }
        }
      };
    }

    const sourcesMatch = command.match(/^sources(?:\s+(.+))?$/);
    if (sourcesMatch) {
      const record = sourcesMatch[1]
        ? resolveRecordReference(state, session, sourcesMatch[1])
        : (sessionSourceViewIsActive(session)
            ? (state.recordIndex.get(session.sourceView.targetId) ?? null)
            : resolveRecordReference(state, session, "this"));
      if (!record) return { output: "no selected target.", exit: false };
      const override = !sourcesMatch[1] && sessionSourceViewIsActive(session) && session.sourceView.targetId === record.id
        ? {
            sources: session.sourceView.sources,
            activeSourceIndex: session.sourceView.activeSourceIndex
          }
        : null;
      const { representation, error } = await sourceRepresentationForRecord(record, override);
      if (error) return { output: error, exit: false, status: "error" };
      setSessionSourceView(session, record, representation);
      return {
        output: formatSourcesList(representation),
        exit: false,
        ui: {
          ...builtInScreenUi("source"),
          inspectorSpec: {
            kind: "source",
            ownerTargetId: record.id,
            contextId: session.sourceView.contextId,
            activeSourceIndex: representation.activeSourceIndex,
            sources: representation.sources
          }
        }
      };
    }

    const sourceMatch = command.match(/^source(?:\s+(.+))?$/);
    if (sourceMatch) {
      const record = sourceMatch[1]
        ? resolveRecordReference(state, session, sourceMatch[1])
        : (sessionSourceViewIsActive(session)
            ? (state.recordIndex.get(session.sourceView.targetId) ?? null)
            : resolveRecordReference(state, session, "this"));
      if (!record) return { output: "no selected target.", exit: false };
      const override = !sourceMatch[1] && sessionSourceViewIsActive(session) && session.sourceView.targetId === record.id
        ? {
            sources: session.sourceView.sources,
            activeSourceIndex: session.sourceView.activeSourceIndex
          }
        : null;
      const { representation, error } = await sourceRepresentationForRecord(record, override);
      if (error) return { output: error, exit: false, status: "error" };
      setSessionSourceView(session, record, representation);
      return {
        output: representation.lines.join("\n"),
        exit: false,
        ui: {
          ...builtInScreenUi("source"),
          inspectorSpec: {
            kind: "source",
            ownerTargetId: record.id,
            contextId: session.sourceView.contextId,
            activeSourceIndex: representation.activeSourceIndex,
            sources: representation.sources
          }
        }
      };
    }

    if (command === "provenance next" || command === "provenance prev") {
      if (!sessionProvenanceViewIsActive(session)) {
        return { output: "no active provenance representation.", exit: false, status: "error" };
      }
      const record = state.recordIndex.get(session.provenanceView.targetId) ?? null;
      if (!record) return { output: "provenance target no longer exists.", exit: false, status: "error" };
      const entries = arrayWrap(session.provenanceView.entries);
      if (!entries.length) return { output: "no provenance entries are available for this target.", exit: false, status: "error" };
      const delta = command === "provenance next" ? 1 : -1;
      const nextIndex = (Number(session.provenanceView.activeProvenanceIndex ?? 0) + delta + entries.length) % entries.length;
      const { representation, error } = await provenanceRepresentationForRecord(record, {
        entries,
        activeProvenanceIndex: nextIndex
      });
      if (error) return { output: error, exit: false, status: "error" };
      setSessionProvenanceView(session, record, representation);
      return {
        output: formatProvenanceView(representation),
        exit: false,
        ui: {
          ...builtInScreenUi("provenance"),
          inspectorSpec: {
            kind: "provenance",
            targetId: record.id,
            activeProvenanceIndex: representation.activeProvenanceIndex,
            entries: representation.entries
          }
        }
      };
    }

    const provenanceOpenMatch = command.match(/^provenance\s+open\s+(\d+)$/);
    if (provenanceOpenMatch) {
      if (!sessionProvenanceViewIsActive(session)) {
        return { output: "no active provenance representation.", exit: false, status: "error" };
      }
      const record = state.recordIndex.get(session.provenanceView.targetId) ?? null;
      if (!record) return { output: "provenance target no longer exists.", exit: false, status: "error" };
      const entries = arrayWrap(session.provenanceView.entries);
      const nextIndex = Number(provenanceOpenMatch[1]) - 1;
      if (nextIndex < 0 || nextIndex >= entries.length) {
        return { output: `provenance index out of range: ${provenanceOpenMatch[1]}`, exit: false, status: "error" };
      }
      const { representation, error } = await provenanceRepresentationForRecord(record, {
        entries,
        activeProvenanceIndex: nextIndex
      });
      if (error) return { output: error, exit: false, status: "error" };
      setSessionProvenanceView(session, record, representation);
      return executeProvenanceEntryAction(representation.activeProvenanceEntry);
    }

    const provenanceMatch = command.match(/^provenance(?:\s+(.+))?$/);
    if (provenanceMatch) {
      const record = provenanceMatch[1]
        ? resolveRecordReference(state, session, provenanceMatch[1])
        : (sessionProvenanceViewIsActive(session)
            ? (state.recordIndex.get(session.provenanceView.targetId) ?? null)
            : resolveRecordReference(state, session, "this"));
      if (!record) return { output: "no selected target.", exit: false };
      const override = !provenanceMatch[1] && sessionProvenanceViewIsActive(session) && session.provenanceView.targetId === record.id
        ? {
            entries: session.provenanceView.entries,
            activeProvenanceIndex: session.provenanceView.activeProvenanceIndex
          }
        : null;
      const { representation: provenanceRepresentation, error } = await provenanceRepresentationForRecord(record, override);
      if (error) return { output: error, exit: false, status: "error" };
      setSessionProvenanceView(session, record, provenanceRepresentation);
      return {
        output: formatProvenanceView(provenanceRepresentation),
        exit: false,
        ui: {
          ...builtInScreenUi("provenance"),
          inspectorSpec: {
            kind: "provenance",
            targetId: record.id,
            activeProvenanceIndex: provenanceRepresentation.activeProvenanceIndex,
            entries: provenanceRepresentation.entries
          }
        }
      };
    }

    const propsRuntimeMatch = command.match(/^props\s+runtime(?:\s+(.+))?$/);
    if (propsRuntimeMatch) {
      const record = propsRuntimeMatch[1]
        ? resolveRecordReference(state, session, propsRuntimeMatch[1])
        : resolveRecordReference(state, session, "this");
      const resolved = await resolvePreviewInspectionForRecord(state, session, record, {
        createPreviewSession: true
      });
      if (!resolved.ok) {
        return {
          output: resolved.error,
          exit: false,
          status: "error"
        };
      }
      return {
        output: renderPreviewPropsView(resolved.inspection, session, "runtime"),
        exit: false,
        history: {
          previewSessionId: resolved.previewSession.id,
          previewRevisionBefore: resolved.previewSession.previewRevision,
          previewRevisionAfter: resolved.previewSession.previewRevision,
          target: resolved.inspection.target
        }
      };
    }

    const propsValidMatch = command.match(/^props\s+valid(?:\s+(.+))?$/);
    if (propsValidMatch) {
      const record = propsValidMatch[1]
        ? resolveRecordReference(state, session, propsValidMatch[1])
        : resolveRecordReference(state, session, "this");
      const resolved = await resolvePreviewInspectionForRecord(state, session, record, {
        createPreviewSession: true
      });
      if (!resolved.ok) {
        return {
          output: resolved.error,
          exit: false,
          status: "error"
        };
      }
      return {
        output: renderPreviewPropsView(resolved.inspection, session, "valid"),
        exit: false,
        history: {
          previewSessionId: resolved.previewSession.id,
          previewRevisionBefore: resolved.previewSession.previewRevision,
          previewRevisionAfter: resolved.previewSession.previewRevision,
          target: resolved.inspection.target
        }
      };
    }

    const propsMatch = command.match(/^props(?:\s+(.+))?$/);
    if (propsMatch) {
      const record = propsMatch[1]
        ? resolveRecordReference(state, session, propsMatch[1])
        : resolveRecordReference(state, session, "this");
      const resolved = await resolvePreviewInspectionForRecord(state, session, record, {
        createPreviewSession: true
      });
      if (!resolved.ok) {
        return {
          output: resolved.error,
          exit: false,
          status: "error"
        };
      }
      return {
        output: renderPreviewPropsView(resolved.inspection, session, "authored"),
        exit: false,
        history: {
          previewSessionId: resolved.previewSession.id,
          previewRevisionBefore: resolved.previewSession.previewRevision,
          previewRevisionAfter: resolved.previewSession.previewRevision,
          target: resolved.inspection.target
        }
      };
    }

    const noteMatch = command.match(/^note\s+add\s+(.+)$/);
    if (noteMatch) {
      pushLocalUndoState(session, "note add");
      session.notes.push({
        id: `note.${session.notes.length + 1}`,
        text: noteMatch[1],
        createdAt: timestamp()
      });
      return { output: "note added.", exit: false };
    }

    const historyMatch = command.match(/^history(?:\s+(.+))?$/);
    if (historyMatch) {
      const filter = optionalText(historyMatch[1]);
      const rows = session.history
        .filter(entry => !filter || entry.command.includes(filter) || String(entry.status || "").includes(filter))
        .slice(-40)
        .map(entry => `${entry.at} ${entry.status.padEnd(7)} ${entry.command}`);
      return {
        output: rows.length ? rows.join("\n") : "(no history)",
        exit: false
      };
    }

    const searchParams = parseSearchCommand(command);
    if (searchParams) {
      if (searchParams.error === "usage") {
        return {
          output: "usage: search <text> or search --scope all|world|platform <text>",
          exit: false,
          status: "error"
        };
      }
      const searchConfig = resolveSearchConfig(searchParams);
      const results = searchRecords(state, {
        query: searchParams.query,
        scope: searchConfig.scope,
        focusContextId: searchConfig.focusContextId
      });
      session.resultView = buildResultView({
        query: searchParams.query,
        scope: searchConfig.scope,
        focusContextId: searchConfig.focusContextId,
        records: results,
        columns: DEFAULT_RESULT_VIEW_COLUMNS,
        sort: "relevance",
        filters: [],
        page: 1,
        pageSize: RESULT_VIEW_PAGE_SIZE,
        activeViewName: null
      });
      if (!results.length) {
        session.lastEntries = [];
        return {
          output: `(no matches for ${JSON.stringify(searchParams.query)})`,
          exit: false
        };
      }
      return { output: setActiveResultView(session.resultView), exit: false };
    }

    const openLinkMatch = command.match(/^open-link\s+(.+)$/);
    if (openLinkMatch) {
      return openOperatorLink(openLinkMatch[1]);
    }

    const linkMatch = command.match(/^link(?:\s+(.+))?$/);
    if (linkMatch) {
      const record = linkMatch[1]
        ? resolveRecordReference(state, session, linkMatch[1])
        : resolveRecordReference(state, session, "this");
      if (!record) return { output: "no selected target.", exit: false };
      const link = createLinkForRecord(state, record);
      return {
        output: formatDeepLink(link),
        exit: false,
        ui: {
          inspectorSpec: {
            kind: deepLinkKindForRecord(record),
            targetId: record.id
          }
        }
      };
    }

    const programSaveMatch = command.match(/^program\s+save\s+(.+)$/);
    if (programSaveMatch) {
      const parsed = parseProgramDefinition(programSaveMatch[1]);
      if (!parsed) return { output: "usage: program save <name> = <cmd ; cmd>", exit: false };
      pushLocalUndoState(session, `program save ${parsed.name}`);
      session.programs[parsed.name] = parsed.commands;
      return { output: `saved program ${parsed.name}.`, exit: false };
    }

    const programRunMatch = command.match(/^program\s+run\s+([A-Za-z][A-Za-z0-9_-]*)$/);
    if (programRunMatch) {
      return runProgram(programRunMatch[1], options);
    }

    const assignmentMatch = command.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.+)$/);
    if (assignmentMatch) {
      const alias = assignmentMatch[1];
      const record = resolveRecordReference(state, session, assignmentMatch[2]);
      if (!record) return { output: `target not found: ${assignmentMatch[2]}`, exit: false };
      pushLocalUndoState(session, `alias ${alias}`);
      session.aliases[alias] = record.id;
      return { output: `${alias} = ${recordDescriptor(record)}`, exit: false };
    }

    const setMatch = command.match(/^set\s+(.+)$/);
    if (setMatch) {
      const tokens = resolveSetCommandInput(state, session, setMatch[1]);
      if (!tokens) return { output: "usage: set <target> <field> <value> or set <field> <value>", exit: false };
      const record = tokens.record ?? resolveRecordReference(state, session, "this");
      const property = optionalText(tokens.field);
      if (!record) {
        return { output: "no selected target.", exit: false, status: "error" };
      }
      if (!property) {
        return { output: "usage: set <target> <field> <value> or set <field> <value>", exit: false, status: "error" };
      }
      const parsedValue = parsePreviewCommandValue(tokens.valueText);
      if (!parsedValue.ok) {
        return {
          output: `invalid value: ${parsedValue.error}`,
          exit: false,
          status: "error"
        };
      }
      const previewState = await resolvePreviewInspectionForRecord(state, session, record, {
        createPreviewSession: true
      });
      if (!previewState.ok) {
        return {
          output: previewState.error,
          exit: false,
          status: "error"
        };
      }
      const previousValue = cloneSerializableValue(previewState.inspection.authoredProps?.[property]);
      const result = await applyPreviewPropertyChange(state, session, {
        previewSessionId: previewState.previewSession.id,
        record,
        property,
        value: parsedValue.value,
        createPreviewSession: false
      });
      if (!result.ok) {
        return {
          output: result.error,
          exit: false,
          status: "error"
        };
      }
      pushPreviewUndoState(session, {
        label: `set ${result.inspection.target} ${property}`,
        previewSessionId: previewState.previewSession.id,
        recordId: record.id,
        target: result.inspection.target,
        property,
        previousValue,
        nextValue: cloneSerializableValue(parsedValue.value),
        previewRevisionBefore: result.previewRevisionBefore,
        previewRevisionAfter: result.previewRevisionAfter
      });
      session.lastPreviewMutation = {
        target: result.inspection.target,
        property,
        previousValue: cloneSerializableValue(previousValue),
        nextValue: cloneSerializableValue(parsedValue.value),
        previewSessionId: previewState.previewSession.id,
        previewRevisionBefore: result.previewRevisionBefore,
        previewRevisionAfter: result.previewRevisionAfter
      };
      return {
        output: [
          `updated preview property: ${property}`,
          `target: ${result.inspection.target}`,
          `preview session: ${session.previewSessionId ?? previewState.previewSession.id}`,
          `preview revision: ${session.previewRevision ?? result.previewRevisionAfter}`,
          `previous: ${formatValue(previousValue)}`,
          `current: ${formatValue(parsedValue.value)}`
        ].join("\n"),
        exit: false,
        history: {
          previewSessionId: previewState.previewSession.id,
          previewRevisionBefore: result.previewRevisionBefore,
          previewRevisionAfter: result.previewRevisionAfter,
          target: result.inspection.target,
          property
        }
      };
    }

    return { output: `unknown command: ${command}`, exit: false };
  }

  refreshContainerIndex();
  return engine;
}

export function buildPathFromContainer(containerIndex, containerId) {
  const pathEntries = [];
  let current = containerIndex.get(containerId) ?? null;
  while (current && current.parentId !== null) {
    pathEntries.unshift(current.id);
    current = current.parentId ? (containerIndex.get(current.parentId) ?? null) : null;
  }
  return pathEntries;
}

export async function buildOperatorTuiState(runtimeContext) {
  return buildWorkbenchState(runtimeContext);
}

export async function loadOperatorTuiRuntimeContext({
  appPath = null,
  worldHome = null,
  runtimeProfile = DEFAULT_TUI_RUNTIME_PROFILE,
  runtimeProfileExplicit = false,
  runtimePluginIds = [],
  cwd = process.cwd(),
  env = process.env
} = {}) {
  const runtimeProfileInfo = resolveCliRuntimeProfile({
    runtimeProfile,
    explicit: runtimeProfileExplicit
  });
  const operatorContract = await resolveRuntimeOperatorPaths({
    startupMode: "operator",
    cwd,
    env: {
      ...env,
      ...(worldHome ? { WORLD_HOME: worldHome } : {})
    }
  });
  const world = createWorld({
    genesis: {
      system: "witness-world",
      mode: "operator-tui",
      definitionPath: appPath ?? null
    },
    witnessLogPath: operatorContract.canonicalTruth.witnessLogPath,
    observationLogPath: operatorContract.canonicalTruth.observationLogPath
  });

  let appProject = null;
  let appSnapshotManager = null;
  let appPreviewSessionManager = null;
  if (appPath) {
    appProject = await loadAppProject(appPath, {
      runtimeProfile: runtimeProfileInfo.id,
      runtimePluginIds,
      env
    });
    await applyWitnessDocsWithRuntimePlugins(world, appProject.witnessDocs, {
      runtimeProfile: runtimeProfileInfo.id,
      runtimePluginIds: runtimePluginIds.length ? runtimePluginIds : null,
      env
    });
    const runtimeDeclarationRegistry = appProject.runtimePluginRegistries?.runtimeDeclarationRegistry ?? null;
    for (const desire of appProject.authoredDesireDocs) {
      applyDesire(world, desire, { runtimeDeclarationRegistry });
    }
    const resolvedRunner = resolveServerRunner(world, null);
    if (resolvedRunner.ok) {
      declareBackendHost(world, {
        actor: "system",
        id: resolvedRunner.runner.backendHost,
        runtimeProfile: runtimeProfileInfo.id
      });
      declareFrontendHost(world, {
        actor: "system",
        id: resolvedRunner.runner.frontendHost,
        runtimeProfile: runtimeProfileInfo.id
      });
    }
    appSnapshotManager = await AppSnapshotManager.create({
      appProject,
      runtimeProfile: runtimeProfileInfo.id,
      runtimePluginIds,
      env,
      devMode: false
    });
    appPreviewSessionManager = new AppPreviewSessionManager({
      appSnapshotManager
    });
  } else {
    declareBackendHost(world, {
      actor: "system",
      id: "backendHost",
      runtimeProfile: runtimeProfileInfo.id
    });
    declareFrontendHost(world, {
      actor: "system",
      id: "frontendHost",
      runtimeProfile: runtimeProfileInfo.id
    });
  }

  return {
    world,
    appProject,
    appSnapshotManager,
    appPreviewSessionManager,
    operatorContract,
    runtimeProfile: runtimeProfileInfo.id,
    runtimeProfileInfo,
    close: async () => {
      appSnapshotManager?.close?.();
    }
  };
}

export function parseTuiArgs(args) {
  const result = {
    appPath: null,
    worldHome: null,
    runtimeProfile: DEFAULT_TUI_RUNTIME_PROFILE,
    runtimeProfileExplicit: false,
    runtimePluginIds: [],
    commands: []
  };
  const queue = [...args];
  if (queue.length && !queue[0].startsWith("--")) result.appPath = queue.shift();
  while (queue.length) {
    const token = queue.shift();
    if (token === "--world-home") {
      result.worldHome = queue.shift() ?? null;
      continue;
    }
    if (token === "--runtime-profile") {
      result.runtimeProfile = queue.shift() ?? DEFAULT_TUI_RUNTIME_PROFILE;
      result.runtimeProfileExplicit = true;
      continue;
    }
    if (token === "--runtime-plugin") {
      const pluginId = queue.shift() ?? "";
      if (pluginId) result.runtimePluginIds.push(pluginId);
      continue;
    }
    if (token === "--command") {
      const command = queue.shift() ?? "";
      if (command) result.commands.push(command);
    }
  }
  return result;
}

export async function runOperatorTui({
  args = [],
  cwd = process.cwd(),
  env = process.env,
  stdin = process.stdin,
  stdout = process.stdout
} = {}) {
  const parsed = parseTuiArgs(args);
  const runtimeContext = await loadOperatorTuiRuntimeContext({
    appPath: parsed.appPath,
    worldHome: parsed.worldHome,
    runtimeProfile: parsed.runtimeProfile,
    runtimeProfileExplicit: parsed.runtimeProfileExplicit,
    runtimePluginIds: parsed.runtimePluginIds,
    cwd,
    env
  });
  try {
    const state = await buildWorkbenchState(runtimeContext);
    const engine = createOperatorTuiEngine(state);

    if (parsed.commands.length) {
      stdout.write(`${await executeBatchCommands(engine, parsed.commands)}\n`);
      return 0;
    }

    stdout.write([
      "Collaborative Operator Environment TUI",
      "mode: detached",
      "type `help` for commands",
      ""
    ].join("\n"));
    stdout.write(`${summarizeStatus(state, engine.session)}\n\n`);
    stdout.write(`${await buildInitialTree(engine)}\n`);

    const ansiAutocomplete = supportsAnsiColor(stdout, env);
    const completer = line => {
      const candidates = buildTuiAutocompleteCandidates(state, engine.session);
      const matches = matchingTuiAutocompleteCandidates(candidates, line);
      return [matches.length ? matches : candidates, normalizeAutocompleteLine(line)];
    };
    const rl = readline.createInterface({
      input: stdin,
      output: stdout,
      prompt: buildTuiPrompt(state, engine.session),
      completer
    });
    const originalRefreshLine = typeof rl._refreshLine === "function"
      ? rl._refreshLine.bind(rl)
      : null;
    if (originalRefreshLine && ansiAutocomplete) {
      rl._refreshLine = function refreshLineWithAutocomplete() {
        originalRefreshLine();
        const cursorAtEnd = (rl.cursor ?? rl.line.length) === rl.line.length;
        if (!cursorAtEnd) return;
        const preview = buildTuiAutocompletePreview(state, engine.session, rl.line);
        if (!preview) return;
        stdout.write(colorize(preview, "dim", true));
        readline.moveCursor(stdout, -preview.length, 0);
      };
      readline.emitKeypressEvents(stdin, rl);
    }
    rl.prompt();
    for await (const line of rl) {
      const result = await engine.execute(line);
      if (result.output) stdout.write(`${result.output}\n`);
      if (result.exit) {
        rl.close();
        return 0;
      }
      rl.setPrompt(buildTuiPrompt(state, engine.session));
      rl.prompt();
    }
    return 0;
  } finally {
    await runtimeContext.close?.();
  }
}

function buildInitialTree(engine) {
  return engine.execute("tree", { skipHistory: true }).then(result => result.output);
}
