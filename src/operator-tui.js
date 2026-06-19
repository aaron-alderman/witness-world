import path from "node:path";
import readline from "node:readline";
import { createWorld } from "./kernel.js";
import { applyWitnessDocsWithRuntimePlugins } from "./dsl.js";
import { applyDesire } from "./desire/index.js";
import { loadAppProject } from "./app-project.js";
import { AppPreviewSessionManager, AppSnapshotManager } from "./app-snapshot-manager.js";
import { declareBackendHost, declareFrontendHost, resolveServerRunner } from "./host.js";
import { resolveRuntimeOperatorPaths } from "./runtime-operator-contract.js";
import { resolveCliRuntimeProfile } from "./runtime-local-launcher.js";
import { buildPlatformModel } from "../plugins/platform/platform-model.js";
import { worldGraphProjection } from "../plugins/inspect/world-graph.js";

const DEFAULT_TUI_RUNTIME_PROFILE = "full";
const ROOT_CONTAINER_ID = "root";
const RESULT_VIEW_PAGE_SIZE = 25;

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

function parseJsonishValue(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
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
  scope = "all"
}) {
  const queryText = normalizeSearchText(query);
  if (!queryText) return [];
  const records = scope === "world"
    ? state.worldRecords
    : (scope === "platform" ? state.platformRecords : [...state.worldRecords, ...state.platformRecords]);
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
    const scoped = rest.match(/^--scope\s+(world|platform)\s+(.+)$/i);
    if (!scoped) return { error: "usage" };
    return {
      scope: scoped[1].toLowerCase(),
      query: scoped[2].trim()
    };
  }
  return {
    scope: "all",
    query: rest
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
  activeViewName = null
}) {
  return {
    query,
    scope,
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
    aliases: session.aliases,
    notes: session.notes,
    programs: session.programs
  });
}

function restoreSessionState(session, snapshot) {
  session.currentPath = arrayWrap(snapshot?.currentPath);
  session.selectionId = snapshot?.selectionId ?? null;
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

function normalizeCurrentPath(currentPath) {
  const pathEntries = arrayWrap(currentPath).map(String).filter(Boolean);
  if (!pathEntries.length) return [ROOT_CONTAINER_ID];
  return [ROOT_CONTAINER_ID, ...pathEntries.filter(entry => entry !== ROOT_CONTAINER_ID)];
}

function currentContainerId(session) {
  const normalized = normalizeCurrentPath(session.currentPath);
  return normalized.at(-1) ?? ROOT_CONTAINER_ID;
}

function createContainerIndex(state, session) {
  const index = new Map();
  const add = container => index.set(container.id, container);

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
  const currentPath = normalizeCurrentPath(session.currentPath)
    .filter(id => id !== ROOT_CONTAINER_ID)
    .join(" / ") || "root";
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
    `path: ${currentPath}`,
    `selection: ${session.selectionId || "(none)"}`,
    `aliases: ${Object.keys(session.aliases).length}`,
    `preview session: ${session.previewSessionId ?? "(none)"}`,
    `preview base revision: ${session.baseAppRevision ?? "(none)"}`,
    `preview revision: ${session.previewRevision ?? 0}`,
    `preview status: ${previewState}`,
    `notes: ${session.notes.length}`,
    `programs: ${Object.keys(session.programs).length}`,
    `world records: ${state.worldRecords.length}`,
    `platform records: ${state.platformRecords.length}`,
    `app: ${state.runtimeContext.appProject?.appRoot ?? "(repo self-model only)"}`,
    `world home: ${state.runtimeContext.operatorContract?.worldHome ?? "(ephemeral)"}`
  ].join("\n");
}

export function buildTuiPrompt(state, session) {
  const pathIds = normalizeCurrentPath(session.currentPath).filter(id => id !== ROOT_CONTAINER_ID);
  if (!pathIds.length) return "root> ";
  const labels = pathIds.map(id => state.containerIndex.get(id)?.label ?? id);
  return `${labels.join("/")}> `;
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
    "select ",
    ...recordRefs.map(ref => `select ${ref}`),
    "inspect",
    "inspect ",
    ...recordRefs.map(ref => `inspect ${ref}`),
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
    "set ",
    "preview",
    "preview clear",
    "undo",
    "redo",
    "link",
    "link ",
    ...recordRefs.map(ref => `link ${ref}`),
    "refresh",
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

function createLinkForRecord(record) {
  const sourceHint = record.sourceHints[0] ?? null;
  return {
    target: `${record.scope}:${record.id}`,
    source: sourceHint
      ? `${sourceHint.file}${sourceHint.line ? `:${sourceHint.line}` : ""}`
      : null
  };
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
      valueType: entry?.valueType ?? null
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
    aliases: {},
    notes: [],
    resultView: null,
    savedResultViews: {},
    previewSessionId: null,
    baseAppRevision: null,
    previewRevision: 0,
    previewStatus: "inactive",
    invalidReason: null,
    programs: {},
    history: [],
    undoStack: [],
    redoStack: [],
    lastEntries: []
  };
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
      scope: resultView.scope
    });
    resultView.rawRows = createResultViewRows(nextRows);
    if (activeViewName !== undefined) {
      resultView.activeViewName = optionalText(activeViewName);
    }
    return resultView;
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
        scope: saved.scope
      }),
      activeViewName: name
    });
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
          "  open <index|container>",
          "  back",
          "  close",
          "  home",
          "  select <index|id|alias|this>",
          "  inspect [index|id|alias|this]",
          "  search <text>",
          "  search --scope world|platform <text>",
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
          "  set <target> <field> <json-or-text> (disabled in read-only tranche)",
          "  preview",
          "  preview clear",
          "  undo",
          "  redo",
          "  link [target]",
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
        output: normalizeCurrentPath(session.currentPath).filter(id => id !== ROOT_CONTAINER_ID).join(" / ") || "root",
        exit: false
      };
    }

    if (command === "back" || command === "close") {
      pushLocalUndoState(session, command);
      const next = normalizeCurrentPath(session.currentPath).slice(1, -1);
      session.currentPath = next;
      return { output: listContainer(), exit: false };
    }

    if (command === "home") {
      pushLocalUndoState(session, "home");
      session.currentPath = [];
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
            "(read-only preview session stale; run `refresh` to clear and recreate)"
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
        `status: ${session.previewStatus}${session.invalidReason ? ` (${session.invalidReason})` : ""}`
      ];
      return {
        output: `${header.join("\n")}\n(read-only preview session; no property edits in this tranche)`,
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
      const entry = session.undoStack.pop();
      if (!entry) return { output: "nothing to undo.", exit: false };
      if (entry.kind === "local") {
        session.redoStack.push({
          kind: "local",
          label: entry.label,
          snapshot: snapshotSessionState(session)
        });
        restoreSessionState(session, entry.snapshot);
        return { output: `undid ${entry.label}.`, exit: false };
      }
      return { output: "nothing to undo.", exit: false };
    }

    if (command === "redo") {
      const entry = session.redoStack.pop();
      if (!entry) return { output: "nothing to redo.", exit: false };
      if (entry.kind === "local") {
        session.undoStack.push({
          kind: "local",
          label: entry.label,
          snapshot: snapshotSessionState(session)
        });
        restoreSessionState(session, entry.snapshot);
        return { output: `redid ${entry.label}.`, exit: false };
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
      const normalized = normalizeCurrentPath(session.currentPath).slice(1);
      const parentId = target.value.parentId;
      if (parentId && parentId !== currentContainerId(session)) {
        if (target.value.id === ROOT_CONTAINER_ID) session.currentPath = [];
        else session.currentPath = buildPathFromContainer(state.containerIndex, target.value.id);
      } else if (target.value.id === ROOT_CONTAINER_ID) {
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
        if (!previewSession) return { output: renderRecordDetails(record), exit: false };
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
      return { output: renderRecordDetails(record), exit: false };
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
          output: "usage: search <text> or search --scope world|platform <text>",
          exit: false,
          status: "error"
        };
      }
      const results = searchRecords(state, searchParams);
      session.resultView = buildResultView({
        query: searchParams.query,
        scope: searchParams.scope,
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

    const linkMatch = command.match(/^link(?:\s+(.+))?$/);
    if (linkMatch) {
      const record = linkMatch[1]
        ? resolveRecordReference(state, session, linkMatch[1])
        : resolveRecordReference(state, session, "this");
      if (!record) return { output: "no selected target.", exit: false };
      const link = createLinkForRecord(record);
      return {
        output: [
          `target: ${link.target}`,
          `source: ${link.source ?? "(none)"}`
        ].join("\n"),
        exit: false
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
      const tokens = splitSetCommand(setMatch[1]);
      if (!tokens) return { output: "usage: set <target> <field> <value> or set <field> <value>", exit: false };
      return {
        output: "set is disabled in this read-only preview tranche.",
        exit: false,
        status: "error"
      };
    }

    return { output: `unknown command: ${command}`, exit: false };
  }

  refreshContainerIndex();
  return engine;
}

function buildPathFromContainer(containerIndex, containerId) {
  const pathEntries = [];
  let current = containerIndex.get(containerId) ?? null;
  while (current && current.id !== ROOT_CONTAINER_ID) {
    pathEntries.unshift(current.id);
    current = current.parentId ? (containerIndex.get(current.parentId) ?? null) : null;
  }
  return pathEntries;
}

function splitSetCommand(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;
  if (parts.length === 2) return {
    target: null,
    field: parts[0],
    value: parts[1]
  };
  return {
    target: parts[0],
    field: parts[1],
    value: trimmed.slice(parts[0].length + parts[1].length + 2)
  };
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
