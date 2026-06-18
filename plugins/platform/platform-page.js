import { renderPlatformConsoleCss } from "./platform-style.js";
import { readPlatformConsoleLayout } from "./platform-console-layout.js";
import { filterPlatformModel } from "./platform-model.js";

const FALLBACK_PLATFORM_PAGE_VIEWS = Object.freeze([
  Object.freeze({ id: "overview", title: "Overview", subtitle: "Counts, authored surfaces, lifecycle, and quick links." }),
  Object.freeze({ id: "workflow", title: "Workflow", subtitle: "Branches, change sets, proposals, and authoring commands." }),
  Object.freeze({ id: "verification", title: "Verification", subtitle: "Live test runs, RVM-authored reports, candidate snapshots, failures, regressions, and runtime revisions." }),
  Object.freeze({ id: "knowledge", title: "Knowledge", subtitle: "Governed docs, roadmap tasks, epics, features, and intent-linked knowledge." }),
  Object.freeze({ id: "signals", title: "Signals", subtitle: "Gaps, telemetry, defect clusters, and boundaries." }),
  Object.freeze({ id: "model", title: "Model", subtitle: "Platform objects, relationships, profiles, and dependency evidence." })
]);
const DEFAULT_PAGE_SIZE = 20;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function safeInteger(value, fallback = 0) {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return number;
}

function clampPageSize(value) {
  const parsed = safeInteger(value, DEFAULT_PAGE_SIZE);
  return Math.max(5, Math.min(50, parsed || DEFAULT_PAGE_SIZE));
}

function parsePlatformPageRequest(requestUrl) {
  const url = requestUrl instanceof URL
    ? requestUrl
    : new URL(typeof requestUrl === "string" ? requestUrl : "http://platform.local/platform");
  const limitParam = optionalText(url.searchParams.get("limit"));
  return {
    url,
    requestedView: optionalText(url.searchParams.get("view")) || "overview",
    id: optionalText(url.searchParams.get("id")),
    offset: safeInteger(url.searchParams.get("offset"), 0),
    limit: limitParam ? clampPageSize(limitParam) : null,
    sort: optionalText(url.searchParams.get("sort")),
    dir: optionalText(url.searchParams.get("dir")) === "desc" ? "desc" : "asc"
  };
}

function authoredPageViews(consoleLayout) {
  const authored = (consoleLayout?.children ?? [])
    .filter(surface => optionalText(surface.pageId))
    .map(surface => Object.freeze({
      id: String(surface.pageId),
      title: surface.title || humanizeKey(surface.pageId),
      subtitle: surface.summary || "",
      surface
    }));
  return authored.length ? authored : FALLBACK_PLATFORM_PAGE_VIEWS;
}

function pageDef(viewId, pageViews) {
  return pageViews.find(view => view.id === viewId) || pageViews[0];
}

function surfaceModelView(surface) {
  return optionalText(surface?.props?.modelView) || optionalText(surface?.pageId) || null;
}

function platformHref(ctx, view, params = {}) {
  const url = new URL(ctx?.url?.pathname || "/platform", "http://platform.local");
  if (view && view !== "overview") url.searchParams.set("view", view);
  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue === undefined || rawValue === null || rawValue === "" || (key === "offset" && Number(rawValue) === 0)) {
      url.searchParams.delete(key);
      continue;
    }
    url.searchParams.set(key, String(rawValue));
  }
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

function humanizeKey(key) {
  return String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, char => char.toUpperCase());
}

function summaryMetricValue(model, path, mode = "count") {
  const value = resolveSchemaPath(model, path);
  const [modeName, rawArg = ""] = String(mode || "count").split(/:(.+)/, 2);
  switch (modeName) {
    case "count":
      if (Array.isArray(value)) return value.length;
      if (value && typeof value === "object") return Object.keys(value).length;
      if (typeof value === "number") return value;
      return value ? 1 : 0;
    case "countKind":
      if (!Array.isArray(value)) return 0;
      return value.filter(item => String(item?.kind || "") === rawArg).length;
    case "countWhere": {
      if (!Array.isArray(value)) return 0;
      const [field, ...expectedParts] = rawArg.split("=");
      const expected = expectedParts.join("=");
      return value.filter(item => String(resolveFieldPath(item, field) ?? "") === expected).length;
    }
    default:
      return value ?? "";
  }
}

function paginateRows(rows, ctx, defaultLimit = DEFAULT_PAGE_SIZE) {
  const total = Array.isArray(rows) ? rows.length : 0;
  const limit = Math.max(1, ctx.limit ?? clampPageSize(defaultLimit));
  if (!total) {
    return { items: [], total: 0, offset: 0, limit, nextOffset: null, prevOffset: null };
  }
  const maxOffset = Math.max(0, total - 1);
  const offset = Math.min(ctx.offset, maxOffset);
  return {
    items: rows.slice(offset, offset + limit),
    total,
    offset,
    limit,
    nextOffset: offset + limit < total ? offset + limit : null,
    prevOffset: offset - limit >= 0 ? offset - limit : null
  };
}

function renderPagination(ctx, total, offset, limit) {
  if (!total || total <= limit) return "";
  const start = offset + 1;
  const end = Math.min(total, offset + limit);
  const previousHref = offset > 0
    ? platformHref(ctx, ctx.view, { id: ctx.id, offset: Math.max(0, offset - limit), limit, sort: ctx.sort, dir: ctx.dir })
    : null;
  const nextHref = offset + limit < total
    ? platformHref(ctx, ctx.view, { id: ctx.id, offset: offset + limit, limit, sort: ctx.sort, dir: ctx.dir })
    : null;
  return `
    <div class="card">
      <strong>Page</strong>
      <div class="muted">Showing ${esc(start)}-${esc(end)} of ${esc(total)} rows.</div>
      <div>
        ${previousHref ? `<a href="${esc(previousHref)}">Previous page</a>` : `<span class="muted">Previous page</span>`}
        <span class="muted"> | </span>
        ${nextHref ? `<a href="${esc(nextHref)}">Next page</a>` : `<span class="muted">Next page</span>`}
      </div>
    </div>
  `;
}

function inlineSummary(items, labelKey = "label") {
  const rows = Array.isArray(items) ? items : [];
  return rows
    .map(row => {
      if (typeof row === "string") return row;
      if (typeof row === "number") return String(row);
      return row?.[labelKey] || row?.title || row?.id || "";
    })
    .filter(Boolean)
    .join(", ");
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(value => String(value || "")).filter(Boolean))];
}

function conceptDestination(value) {
  const raw = optionalText(value);
  if (!raw) return null;
  if (raw.startsWith("branch:")) return { view: "workflow", id: raw };
  if (raw.startsWith("changeSet:") || raw.startsWith("changeset.")) return { view: "workflow", id: raw };
  if (raw.startsWith("proposal:")) return { view: "workflow", id: raw };
  if (raw.startsWith("candidateSnapshot:")) return { view: "verification", id: raw };
  if (raw.startsWith("runtimeRevision:") || raw.startsWith("backendRevision:") || raw.startsWith("frontendRevision:") || raw.startsWith("snapshotBuild:") || raw.startsWith("snapshotBuildError:")) {
    return { view: "verification", id: raw };
  }
  if (raw.startsWith("gate:") || raw.startsWith("testRun:") || raw.startsWith("testResult:") || raw.startsWith("testArtifact:") || raw.startsWith("testSuite:") || raw.startsWith("testCase:")) {
    return { view: "verification", id: raw };
  }
  if (raw.startsWith("roadmap:") || raw.startsWith("epic:") || raw.startsWith("feature:") || raw.startsWith("roadmapTask:") || raw.startsWith("docTask:")) {
    return { view: "knowledge", id: raw };
  }
  if (raw.startsWith("doc:")) return { view: "knowledge", id: raw.slice(4) };
  if (raw.endsWith(".md")) return { view: "knowledge", id: raw };
  if (raw.startsWith("telemetryMetric:") || raw.startsWith("gap.") || raw.startsWith("defectCluster:") || raw.startsWith("boundary:")) {
    return { view: "signals", id: raw };
  }
  if (raw.startsWith("compatibilityBridge:")) return { view: "model", id: raw };
  if (raw.startsWith("route:") || raw.startsWith("handler:") || raw.startsWith("surface:") || raw.startsWith("capability:") || raw.startsWith("plugin.") || raw.startsWith("bundle:") || raw.startsWith("rvm:") || raw.startsWith("wcss:") || raw.startsWith("wtoml:") || raw.startsWith("json:") || raw.startsWith("file:")) {
    return { view: "model", id: raw };
  }
  return null;
}

function conceptApiHref(value) {
  const raw = optionalText(value);
  if (!raw) return null;
  if (raw.startsWith("branch:")) return `/api/platform-branches/${encodeURIComponent(raw)}`;
  if (raw.startsWith("changeSet:") || raw.startsWith("changeset.")) return `/api/platform-change-sets/${encodeURIComponent(raw)}`;
  if (raw.startsWith("candidateSnapshot:") || raw.startsWith("runtimeRevision:") || raw.startsWith("backendRevision:") || raw.startsWith("frontendRevision:") || raw.startsWith("snapshotBuild:") || raw.startsWith("snapshotBuildError:")) {
    return `/api/platform-model?view=runtimeRevisions&id=${encodeURIComponent(raw)}`;
  }
  if (raw.startsWith("gate:")) return `/api/platform-model?view=testGates&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("testRun:")) return `/api/platform-test-runs/${encodeURIComponent(raw)}`;
  if (raw.startsWith("testResult:") || raw.startsWith("testArtifact:") || raw.startsWith("testSuite:") || raw.startsWith("testCase:")) {
    return `/api/platform-model?view=testRuns&id=${encodeURIComponent(raw)}`;
  }
  if (raw.startsWith("roadmap:") || raw.startsWith("epic:") || raw.startsWith("feature:") || raw.startsWith("roadmapTask:") || raw.startsWith("docTask:")) {
    return `/api/platform-model?view=roadmap&id=${encodeURIComponent(raw)}`;
  }
  if (raw.startsWith("doc:")) return `/api/platform-model?view=docs&id=${encodeURIComponent(raw.slice(4))}`;
  if (raw.endsWith(".md")) return `/api/platform-model?view=docs&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("telemetryMetric:")) return `/api/platform-model?view=telemetry&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("compatibilityBridge:")) return `/api/platform-model?view=bridges&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("gap.")) return "/api/platform-gaps";
  if (raw.startsWith("proposal:")) return "/api/platform-model?view=proposals";
  return "/api/platform-model";
}

function renderConceptLink(ctx, value, label = null) {
  const raw = optionalText(value);
  if (!raw) return "";
  const destination = conceptDestination(raw);
  const display = label || raw;
  if (!destination) return esc(display);
  return `<a href="${esc(platformHref(ctx, destination.view, { id: destination.id }))}">${esc(display)}</a>`;
}

function renderApiLink(value) {
  const href = conceptApiHref(value);
  if (!href) return "";
  return `<a href="${esc(href)}">API resource</a>`;
}

function renderValue(ctx, value) {
  if (value === undefined || value === null || value === "") return "";
  if (Array.isArray(value)) {
    const items = value.map(item => renderValue(ctx, item)).filter(Boolean);
    return items.length ? items.join(", ") : "";
  }
  if (typeof value === "object") {
    const id = optionalText(value.id) || optionalText(value.path) || null;
    const label = value.title || value.label || value.path || value.id || JSON.stringify(value);
    if (id) return renderConceptLink(ctx, id, label);
    return esc(label);
  }
  const text = String(value);
  const destination = conceptDestination(text);
  return destination ? renderConceptLink(ctx, text) : esc(text);
}

function renderPropertyTable(title, entries = []) {
  const rows = entries.filter(entry => entry && entry.valueHtml);
  return `
    <div class="card">
      <h3>${esc(title)}</h3>
      ${rows.length ? `
        <table>
          <thead><tr><th>Property</th><th>Value</th></tr></thead>
          <tbody>
            ${rows.map(entry => `<tr><td>${esc(entry.label)}</td><td>${entry.valueHtml}</td></tr>`).join("")}
          </tbody>
        </table>
      ` : `<div class="muted">No properties.</div>`}
    </div>
  `;
}

function propertyTableRows(title, entries = []) {
  return {
    title,
    entries: entries.filter(entry => entry && entry.valueHtml)
  };
}

function renderSurfaceFrame(surface, bodyHtml, {
  summary = null,
  tag = "section",
  className = ""
} = {}) {
  const classes = [surface?.className, className].filter(Boolean).join(" ");
  const renderedSummary = summary ?? surface?.summary ?? null;
  const openingTag = `<${tag}${classes ? ` class="${esc(classes)}"` : ""} data-platform-rvm-view="${esc(surface?.name || "unknown")}" data-platform-rvm-kind="${esc(surface?.surfaceKind || "")}">`;
  return `
    ${openingTag}
      ${surface?.title ? `<h2>${esc(surface.title)}</h2>` : ""}
      ${renderedSummary ? `<div class="muted">${esc(renderedSummary)}</div>` : ""}
      ${bodyHtml}
    </${tag}>
  `;
}

function nestedSurface(surface, name, {
  title = null,
  summary = null,
  surfaceKind = "region",
  className = null
} = {}) {
  return surface?.childSurfaces?.find(child => child.name === name) || {
    name,
    title,
    summary,
    surfaceKind,
    className
  };
}

function surfacePropText(surface, key, fallback = null) {
  const value = surface?.props?.[key];
  return typeof value === "string" && value.length ? value : fallback;
}

function surfaceColumnLabels(surface, fallback = []) {
  const raw = surfacePropText(surface, "columns", null);
  if (!raw) return fallback;
  const columns = raw.split("|").map(part => part.trim()).filter(Boolean);
  return columns.length ? columns : fallback;
}

function surfaceEmptyState(surface, fallback = "No rows.") {
  return surfacePropText(surface, "emptyState", fallback);
}

function surfacePageSize(surface, fallback = DEFAULT_PAGE_SIZE) {
  return clampPageSize(surfacePropText(surface, "pageSize", fallback));
}

function surfaceRowLimit(surface, fallback = 12) {
  const parsed = safeInteger(surfacePropText(surface, "rowLimit", fallback), fallback);
  return Math.max(1, parsed || fallback);
}

function surfaceItemLimit(surface, fallback = 12) {
  const parsed = safeInteger(surfacePropText(surface, "itemLimit", fallback), fallback);
  return Math.max(1, parsed || fallback);
}

function renderPropertyCard(card) {
  return renderPropertyTable(card?.title || "Properties", card?.entries || []);
}

function renderLongTailProperties(surface, ctx, record, usedKeys = [], fallbackTitle = "Properties") {
  const used = new Set(usedKeys);
  const allowedKinds = new Set(surfaceKeyList(surface, "longTailValueKinds", ["string", "number", "boolean", "scalarList"]));
  const entries = Object.entries(record ?? {})
    .filter(([key, value]) => !used.has(key) && value !== undefined && value !== null && value !== "")
    .filter(([, value]) => {
      if (Array.isArray(value)) {
        return allowedKinds.has("scalarList")
          && value.length > 0
          && value.every(item => item === null || allowedKinds.has(typeof item));
      }
      return allowedKinds.has(typeof value);
    })
    .map(([key, value]) => ({
      label: humanizeKey(key),
      valueHtml: renderValue(ctx, value)
    }));
  return renderPropertyTable(surfacePropText(surface, "longTailCardTitle", fallbackTitle), entries);
}

function surfaceCardItemLimit(surface, fallback = 12) {
  const parsed = safeInteger(surfacePropText(surface, "cardItemLimit", fallback), fallback);
  return Math.max(1, parsed || fallback);
}

function parseSurfaceLabelMap(raw) {
  const text = optionalText(raw);
  if (!text) return new Map();
  return new Map(text
    .split("|")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [left, ...rest] = part.split("=");
      const label = optionalText(left);
      const value = optionalText(rest.join("="));
      return label && value ? [label, value] : null;
    })
    .filter(Boolean));
}

function parseFormFieldEntries(raw) {
  const text = optionalText(raw);
  if (!text) return [];
  return text
    .split("|")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [left, ...rest] = part.split("=");
      const label = optionalText(left);
      const rhs = optionalText(rest.join("="));
      if (!label || !rhs) return null;
      const [namePart, rawKind = "text"] = rhs.split("@");
      const name = optionalText(namePart);
      if (!name) return null;
      const [kindPart, sourcePart] = String(rawKind || "text").split(/:(.+)/, 2);
      return {
        label,
        name,
        kind: optionalText(kindPart) || "text",
        source: optionalText(sourcePart)
      };
    })
    .filter(entry => entry?.label && entry?.name);
}

function renderListOverflowSummary(totalItems, renderedItems) {
  if (totalItems <= renderedItems) return "";
  return `<div class="muted">Showing first ${esc(renderedItems)} of ${esc(totalItems)} entries.</div>`;
}

function renderLinksCard(title, ctx, values = [], { emptyState = "No linked resources.", itemLimit = 12 } = {}) {
  const allItems = uniqueStrings(values);
  const renderedItems = allItems.slice(0, itemLimit);
  const items = renderedItems
    .map(value => `<li>${renderConceptLink(ctx, value)}${conceptApiHref(value) ? ` <span class="muted">(${renderApiLink(value)})</span>` : ""}</li>`)
    .join("");
  return `
    <div class="card">
      <h3>${esc(title)}</h3>
      ${items ? `<ul>${items}</ul>${renderListOverflowSummary(allItems.length, renderedItems.length)}` : `<div class="muted">${esc(emptyState)}</div>`}
    </div>
  `;
}

function renderTextListCard(title, values = [], { emptyState = "No entries.", itemLimit = 12 } = {}) {
  const allItems = uniqueStrings(values);
  const renderedItems = allItems.slice(0, itemLimit);
  const items = renderedItems.map(value => `<li>${esc(value)}</li>`).join("");
  return `
    <div class="card">
      <h3>${esc(title)}</h3>
      ${items ? `<ul>${items}</ul>${renderListOverflowSummary(allItems.length, renderedItems.length)}` : `<div class="muted">${esc(emptyState)}</div>`}
    </div>
  `;
}

function renderInlineSchemaSummary(record, entries = [], ctx, className = "muted") {
  const parts = entries
    .map(entry => {
      const valueHtml = renderSchemaValue(ctx, resolveSchemaPath(record, entry.path), entry.mode, entry.label);
      return valueHtml ? `<span>${esc(entry.label)}: ${valueHtml}</span>` : "";
    })
    .filter(Boolean);
  return parts.length ? `<div class="${esc(className)}">${parts.join(" | ")}</div>` : "";
}

function renderSummaryCards(cards = []) {
  return `
    <section class="summary" aria-label="Summary">
      ${cards.map(card => `
        <div class="card">
          <div class="metric">${esc(card.value)}</div>
          <div class="muted">${esc(card.label)}</div>
        </div>
      `).join("")}
    </section>
  `;
}

function renderSummaryCardsFromSurface(surface, model) {
  const entries = parseSurfaceSchemaEntries(surface?.props?.summaryCards);
  if (!entries.length) return "";
  return renderSummaryCards(entries.map(entry => ({
    label: entry.label,
    value: summaryMetricValue(model, entry.path, entry.mode)
  })));
}

function pageSurfaceById(consoleLayout, pageId) {
  return (consoleLayout?.children ?? []).find(surface => surface.pageId === pageId) || null;
}

function renderNav(ctx, pageViews) {
  return `
    <nav class="card" aria-label="Platform pages">
      <h2>Pages</h2>
      <div class="summary">
        ${pageViews.map(view => `
          <div class="card">
            <div><strong><a href="${esc(platformHref(ctx, view.id))}">${esc(view.title)}</a></strong></div>
            <div class="muted">${esc(view.subtitle)}</div>
          </div>
        `).join("")}
      </div>
    </nav>
  `;
}

function renderTable(headers, rows, emptyMessage = "No rows.") {
  const columnCount = headers.length || 1;
  return `
    <table>
      <thead><tr>${headers.map(header => `<th>${esc(header)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.length
          ? rows.join("")
          : `<tr><td colspan="${esc(columnCount)}"><span class="muted">${esc(emptyMessage)}</span></td></tr>`}
      </tbody>
    </table>
  `;
}

function renderAuthoredSurfaceTable(surface, rows) {
  return renderTable(
    surfaceColumnLabels(surface, []),
    rows,
    surfaceEmptyState(surface, "No rows.")
  );
}

function surfaceVariantEmptyState(surface, key, fallback = "No rows.") {
  return surfacePropText(surface, key, surfaceEmptyState(surface, fallback));
}

function renderSurfaceEmptyCard(surface, {
  title = "Detail",
  message = "No rows are projected yet."
} = {}) {
  return `
    <div class="card">
      <h2>${esc(surfacePropText(surface, "emptyTitle", title))}</h2>
      <div class="muted">${esc(surfaceEmptyState(surface, message))}</div>
    </div>
  `;
}

function renderAuthoredDetailLayout(surface, sectionsByName = new Map()) {
  const orderedSections = (surface?.childSurfaces ?? [])
    .map(child => sectionsByName.get(child.name))
    .filter(Boolean);
  if (!orderedSections.length) return "";
  if (orderedSections.length === 1) return orderedSections[0];
  const [left, right, ...rest] = orderedSections;
  return `
    <section class="grid2">
      <div>${left}</div>
      <div>${right}</div>
    </section>
    ${rest.join("")}
  `;
}

function renderDataTable(title, headers, rows, emptyMessage = "No rows.") {
  return `
    <section>
      <h2>${esc(title)}</h2>
      ${renderTable(headers, rows, emptyMessage)}
    </section>
  `;
}

function compareSortValues(left, right) {
  const normalize = value => {
    if (Array.isArray(value)) return value.length;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value === undefined || value === null) return "";
    return String(value).toLowerCase();
  };
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}

function parseSurfaceSchemaEntries(raw) {
  const text = optionalText(raw);
  if (!text) return [];
  return text
    .split("|")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [left, ...rest] = part.split("=");
      const label = optionalText(left);
      const rhs = optionalText(rest.join("="));
      if (!label || !rhs) return null;
      const [path, mode] = rhs.split("@");
      return {
        label,
        path: optionalText(path),
        mode: optionalText(mode) || "text"
      };
    })
    .filter(entry => entry?.label && entry?.path);
}

function surfaceSchemaMap(surface, key) {
  const entries = parseSurfaceSchemaEntries(surface?.props?.[key]);
  return new Map(entries.map(entry => [String(entry.label), entry]));
}

function resolveSchemaPath(record, pathSpec) {
  const paths = String(pathSpec || "").split("||").map(part => part.trim()).filter(Boolean);
  for (const path of paths) {
    const value = resolveFieldPath(record, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function resolveFieldPath(record, fieldPath) {
  return String(fieldPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, segment) => value == null ? null : value[segment], record);
}

function renderSchemaValue(ctx, value, mode = "text", label = null) {
  switch (mode) {
    case "statusExit":
      if (!value || typeof value !== "object") return "idle";
      return esc(`${value.status || "idle"} (${value.exitCode ?? "n/a"})`);
    case "api":
      if (value === undefined || value === null || value === "") return "";
      return renderApiLink(typeof value === "object" ? value.id : value);
    case "href":
      if (value === undefined || value === null || value === "") return "";
      if (typeof value === "object") {
        const href = optionalText(value.href) || optionalText(value.url) || optionalText(value.id);
        const label = optionalText(value.title) || optionalText(value.label) || href;
        return href ? `<a href="${esc(href)}">${esc(label || href)}</a>` : esc(label || "");
      }
      return `<a href="${esc(value)}">${esc(label || "Event stream")}</a>`;
    case "value":
      if (value === undefined || value === null || value === "") return "";
      return renderValue(ctx, value);
    case "concept":
      if (value === undefined || value === null || value === "") return "";
      if (typeof value === "object") {
        const id = optionalText(value.id) || optionalText(value.path);
        const label = optionalText(value.title) || optionalText(value.label) || optionalText(value.path) || optionalText(value.id);
        return id ? renderConceptLink(ctx, id, label || id) : esc(label || "");
      }
      return renderConceptLink(ctx, value);
    case "count":
      if (value === undefined || value === null || value === "") return "";
      return esc(Array.isArray(value) ? value.length : value);
    default:
      if (value === undefined || value === null || value === "") return "";
      return esc(Array.isArray(value) ? value.join(", ") : value);
  }
}

function propertyRowsFromSurfaceSchema(surface, titleProp, fieldsProp, ctx, record, fallbackTitle, fallbackEntries = []) {
  const entries = parseSurfaceSchemaEntries(surface?.props?.[fieldsProp]);
  if (!entries.length) return propertyTableRows(fallbackTitle, fallbackEntries);
  return propertyTableRows(
    surfacePropText(surface, titleProp, fallbackTitle),
    entries.map(entry => ({
      label: entry.label,
      valueHtml: renderSchemaValue(ctx, resolveSchemaPath(record, entry.path), entry.mode, entry.label)
    }))
  );
}

function rootKeysFromSurfaceSchema(surface, fieldsProp) {
  return [...new Set(parseSurfaceSchemaEntries(surface?.props?.[fieldsProp]).map(entry => String(entry.path).split(".")[0]).filter(Boolean))];
}

function surfaceKeyList(surface, key, fallback = []) {
  const raw = surfacePropText(surface, key, null);
  if (!raw) return fallback;
  const values = raw.split("|").map(part => part.trim()).filter(Boolean);
  return values.length ? values : fallback;
}

function parseCardSpecs(raw) {
  return parseSurfaceSchemaEntries(raw).map(entry => ({
    title: entry.label,
    path: entry.path,
    mode: entry.mode
  }));
}

function listValuesFromMode(value, mode = "text") {
  const items = Array.isArray(value) ? value : (value === undefined || value === null || value === "" ? [] : [value]);
  switch (mode) {
    case "targetId":
      return items.map(item => typeof item === "object" && item ? item.targetId || item.id || "" : item).filter(Boolean);
    case "path":
      return items.map(item => typeof item === "object" && item ? item.path || item.id || "" : item).filter(Boolean);
    case "errorMessage":
      return items.map(item => {
        if (typeof item === "object" && item) return `${item.kind || "error"}: ${item.message || ""}`;
        return item;
      }).filter(Boolean);
    case "label":
      return items.map(item => {
        if (typeof item === "object" && item) return item.label || item.title || item.system || item.id || item.path || "";
        return item;
      }).filter(Boolean);
    default:
      return items.map(item => {
        if (typeof item === "object" && item) return item.id || item.path || item.title || item.label || "";
        return item;
      }).filter(Boolean);
  }
}

function renderCardSpecs(surface, schemaProp, emptyStateProp, ctx, record, kind) {
  const emptyStateMap = parseSurfaceLabelMap(surface?.props?.[emptyStateProp]);
  const itemLimit = surfaceCardItemLimit(surface, 12);
  return parseCardSpecs(surface?.props?.[schemaProp]).map(spec => {
    const value = resolveSchemaPath(record, spec.path);
    return kind === "links"
      ? renderLinksCard(spec.title, ctx, listValuesFromMode(value, spec.mode), {
          emptyState: emptyStateMap.get(spec.title) || "No linked resources.",
          itemLimit
        })
      : renderTextListCard(spec.title, listValuesFromMode(value, spec.mode), {
          emptyState: emptyStateMap.get(spec.title) || "No entries.",
          itemLimit
        });
  }).join("");
}

function resolveFormDefaultValue(raw) {
  const text = optionalText(raw);
  if (!text) return "";
  if (text.includes("{generatedId}")) {
    return text.replaceAll("{generatedId}", Date.now().toString(36));
  }
  return text;
}

function authoredStaticFormFieldOptions(surface, source) {
  const authored = parseSurfaceLabelMap(surface?.props?.[`${source}Options`]);
  if (!authored.size) return [];
  return [...authored.entries()].map(([label, value]) => ({
    value,
    label
  }));
}

function recordsForAuthoredFormOptionSource(source, model) {
  if (source === "proposalActions") return model.proposalActions ?? [];
  return detailRecordsForSource(source, model);
}

function authoredFormOptionWhereMatches(record, rawWhere) {
  const clause = optionalText(rawWhere);
  if (!clause) return true;
  const separator = clause.indexOf("=");
  if (separator < 1) return false;
  const path = clause.slice(0, separator).trim();
  const expected = clause.slice(separator + 1).trim();
  if (!path) return false;
  return optionalText(resolveSchemaPath(record, path)) === expected;
}

function optionAttrValue(record, path, mode = "text") {
  const value = resolveSchemaPath(record, path);
  if (mode === "json") return JSON.stringify(value ?? null);
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function authoredDynamicFormFieldOptions(surface, source, model) {
  const sourceKey = optionalText(surface?.props?.[`${source}Source`]);
  if (!sourceKey) return [];
  const valuePath = optionalText(surface?.props?.[`${source}ValuePath`]) || "id";
  const labelPath = optionalText(surface?.props?.[`${source}LabelPath`]) || valuePath;
  const where = optionalText(surface?.props?.[`${source}Where`]);
  const attrEntries = parseSurfaceSchemaEntries(surface?.props?.[`${source}AttrFields`]);
  return recordsForAuthoredFormOptionSource(sourceKey, model)
    .filter(record => authoredFormOptionWhereMatches(record, where))
    .map(record => ({
      value: optionalText(resolveSchemaPath(record, valuePath)),
      label: optionalText(resolveSchemaPath(record, labelPath)) || optionalText(resolveSchemaPath(record, valuePath)),
      attrs: Object.fromEntries(attrEntries.map(entry => [entry.label, optionAttrValue(record, entry.path, entry.mode)]))
    }))
    .filter(option => option.value);
}

function formFieldOptions(surface, source, model) {
  const authored = authoredStaticFormFieldOptions(surface, source);
  if (authored.length) return authored;
  const dynamic = authoredDynamicFormFieldOptions(surface, source, model);
  if (dynamic.length) return dynamic;
  switch (source) {
    case "proposalActionOptions":
      return (model.proposalActions ?? []).map(action => ({
        value: action.action,
        label: action.action,
        attrs: {
          "data-sample-body": JSON.stringify(action.sampleBody ?? {})
        }
      }));
    case "openProposalOptions":
      return (model.proposals ?? [])
        .filter(proposal => proposal.status === "open")
        .map(proposal => ({
          value: proposal.id,
          label: proposal.id
        }));
    case "changeSetOptions":
      return (model.changeSets ?? []).map(changeSet => ({
        value: changeSet.id,
        label: changeSet.id
      }));
    case "testGateOptions":
      return (model.testGates ?? []).map(gate => ({
        value: gate.id,
        label: gate.title || gate.id
      }));
    default:
      return [];
  }
}

function renderAuthoredFormField(surface, field, model, defaultsMap, placeholdersMap, rowMap) {
  const defaultValue = resolveFormDefaultValue(defaultsMap.get(field.name));
  const placeholder = placeholdersMap.get(field.name) || "";
  if (field.kind === "select") {
    const options = formFieldOptions(surface, field.source, model);
    return `
      <label>${esc(field.label)}
        <select name="${esc(field.name)}">
          ${options.map(option => {
            const selected = defaultValue && option.value === defaultValue ? ' selected' : "";
            const attrs = Object.entries(option.attrs ?? {})
              .map(([key, value]) => ` ${esc(key)}="${esc(value)}"`)
              .join("");
            return `<option value="${esc(option.value)}"${selected}${attrs}>${esc(option.label || option.value)}</option>`;
          }).join("")}
        </select>
      </label>
    `;
  }
  if (field.kind === "textarea") {
    const rows = Math.max(2, safeInteger(rowMap.get(field.name), 8));
    return `
      <label>${esc(field.label)}
        <textarea name="${esc(field.name)}" rows="${esc(rows)}" placeholder="${esc(placeholder)}">${esc(defaultValue)}</textarea>
      </label>
    `;
  }
  return `
    <label>${esc(field.label)}
      <input name="${esc(field.name)}" value="${esc(defaultValue)}" placeholder="${esc(placeholder)}">
    </label>
  `;
}

function renderFormActionButtons(surface) {
  const actionButtons = parseSurfaceLabelMap(surface?.props?.actionButtons);
  if (!actionButtons.size) {
    return `<button type="submit">${esc(surfacePropText(surface, "submitLabel", "Submit"))}</button>`;
  }
  const buttonName = optionalText(surface?.props?.actionButtonName);
  return `
    <div style="display:flex; gap:8px;">
      ${[...actionButtons.entries()].map(([label, value]) => `<button type="submit"${buttonName ? ` name="${esc(buttonName)}"` : ""} value="${esc(value)}">${esc(label)}</button>`).join("")}
    </div>
  `;
}

function surfaceDefaultSort(surface, fallbackKey = null, fallbackDir = "asc") {
  const raw = optionalText(surface?.props?.defaultSort);
  if (!raw) return { key: fallbackKey, dir: fallbackDir };
  const [key, dir] = raw.split(":");
  return {
    key: optionalText(key) || fallbackKey,
    dir: dir === "desc" ? "desc" : "asc"
  };
}

export function sortRecordsForSurface(records, surface, ctx, {
  sortProp = "sortOptions",
  defaultSortKey = null
} = {}) {
  const sortMap = surfaceSchemaMap(surface, sortProp);
  const defaultSort = surfaceDefaultSort(surface, defaultSortKey, "asc");
  const requestedKey = ctx.sort && sortMap.has(ctx.sort) ? ctx.sort : defaultSort.key;
  const requestedDir = ctx.dir === "desc" ? "desc" : defaultSort.dir;
  const sorted = [...records].sort((left, right) => {
    if (requestedKey && sortMap.has(requestedKey)) {
      const spec = sortMap.get(requestedKey);
      const comparison = compareSortValues(resolveFieldPath(left, spec.path), resolveFieldPath(right, spec.path));
      if (comparison) return requestedDir === "desc" ? comparison * -1 : comparison;
    }
    return compareSortValues(left.id || "", right.id || "");
  });
  return {
    items: sorted,
    sortKey: requestedKey,
    sortDir: requestedDir,
    sortEntries: [...sortMap.entries()].map(([key, spec]) => ({ key, label: humanizeKey(key), path: spec.path }))
  };
}

function renderSortControls(surface, ctx, sortState) {
  if (!sortState?.sortEntries?.length) return "";
  const links = sortState.sortEntries.map(entry => {
    const isActive = entry.key === sortState.sortKey;
    const nextDir = isActive && sortState.sortDir === "asc" ? "desc" : "asc";
    const href = platformHref(ctx, ctx.view, {
      id: ctx.id,
      offset: 0,
      limit: ctx.limit,
      sort: entry.key,
      dir: nextDir
    });
    return `<a href="${esc(href)}">${esc(entry.label)}${isActive ? ` (${esc(sortState.sortDir)})` : ""}</a>`;
  }).join(" <span class=\"muted\">|</span> ");
  return `
    <div class="card">
      <strong>Sort</strong>
      <div class="muted">${links}</div>
    </div>
  `;
}

function renderRowsFromSurfaceSchema(surface, schemaProp, records, ctx, fallbackRowRenderer) {
  const entries = parseSurfaceSchemaEntries(surface?.props?.[schemaProp]);
  if (!entries.length) return records.map(fallbackRowRenderer);
  return records.map(record => `
    <tr>
      ${entries.map(entry => `<td>${renderSchemaValue(ctx, resolveSchemaPath(record, entry.path), entry.mode, entry.label)}</td>`).join("")}
    </tr>
  `);
}

function shortHash(value) {
  return value ? String(value).slice(0, 12) : "";
}

function renderAuthoredBoard(surface, model, ctx) {
  const lanes = resolveFieldPath(model, surfacePropText(surface, "boardSource", "")) ?? [];
  const laneTitlePath = surfacePropText(surface, "laneTitlePath", "title||id");
  const laneMetaEntries = parseSurfaceSchemaEntries(surface?.props?.laneMetaFields);
  const laneItemsPath = surfacePropText(surface, "laneItemsPath", "items");
  const itemTitlePath = surfacePropText(surface, "itemTitlePath", "title||id");
  const itemTitleMode = surfacePropText(surface, "itemTitleMode", "text");
  const itemFieldEntries = parseSurfaceSchemaEntries(surface?.props?.itemFields);
  const itemLimit = surfaceItemLimit(surface, 14);
  const itemEmptyState = surfacePropText(surface, "itemEmptyState", "No entries.");
  return renderSurfaceFrame(surface, `
    <div class="board">
      ${lanes.map(lane => {
        const laneTitle = resolveSchemaPath(lane, laneTitlePath) || lane.title || lane.id || "";
        const items = Array.isArray(resolveFieldPath(lane, laneItemsPath)) ? resolveFieldPath(lane, laneItemsPath) : [];
        return `
        <section class="platform-column" data-platform-board-lane="${esc(lane.id || laneTitle)}">
          <h3>${esc(laneTitle)}</h3>
          ${renderInlineSchemaSummary(lane, laneMetaEntries, ctx)}
          ${items.length
            ? items.slice(0, itemLimit).map(item => {
                const titleHtml = renderSchemaValue(ctx, resolveSchemaPath(item, itemTitlePath), itemTitleMode);
                const detailHtml = renderInlineSchemaSummary(item, itemFieldEntries, ctx);
                return `
            <div class="platform-chip">
              ${titleHtml ? `<div>${titleHtml}</div>` : ""}
              ${detailHtml}
            </div>
          `;
              }).join("")
            : `<div class="muted">${esc(itemEmptyState)}</div>`}
        </section>
      `;
      }).join("")}
    </div>
  `);
}

function renderLifecycleBoard(surface, model, ctx) {
  return renderAuthoredBoard(surface, model, ctx);
}

function renderBranchBoard(surface, model, ctx) {
  return renderAuthoredBoard(surface, model, ctx);
}

function renderSurfaceTree(surface, consoleLayout, ctx) {
  const baseSummary = surface?.summary
    ? `${surface.summary} Rendered from ${consoleLayout.sourceFile} top-level surface declarations.`
    : `Rendered from ${consoleLayout.sourceFile} top-level surface declarations.`;
  const summary = consoleLayout.error
    ? `${baseSummary} Fallback metadata in use: ${consoleLayout.error}`
    : baseSummary;
  return renderSurfaceFrame(surface, `
    <div class="summary">
      ${(consoleLayout.children ?? []).map(childSurface => {
        const row = {
          ...childSurface,
          projectionRoutesText: (childSurface.projectionRoutes ?? []).join(", "),
          sectionTitles: (childSurface.childSurfaces ?? []).map(child => child.title || child.name).join(", ")
        };
        const card = propertyRowsFromSurfaceSchema(
          surface,
          null,
          "surfaceFields",
          ctx,
          row,
          childSurface.title || childSurface.name,
          []
        );
        return `
          <div data-platform-rvm-view="${esc(childSurface.name)}" data-platform-rvm-kind="${esc(childSurface.surfaceKind || "")}">
            ${renderPropertyCard(card)}
          </div>
        `;
      }).join("")}
    </div>
  `, { summary });
}

function workflowItems(model) {
  const branches = (model.branches ?? []).map(branch => ({
    pageKind: "branch",
    id: branch.id,
    title: branch.title || branch.id,
    status: branch.status,
    scope: branch.lifecycleLane || "",
    summary: `${branch.changeSetCount ?? 0} change sets, ${branch.docsFreshness?.status || "docs"} docs, ${branch.testRedGreen?.status || "tests"} tests`
  }));
  const changeSets = (model.changeSets ?? []).map(changeSet => ({
    pageKind: "changeSet",
    id: changeSet.id,
    title: changeSet.title || changeSet.id,
    status: changeSet.status,
    scope: changeSet.branchId || "",
    summary: `${changeSet.editCount ?? 0} edits, ${changeSet.testRedGreen?.status || "tests"} tests`
  }));
  const proposals = (model.proposals ?? []).map(proposal => ({
    pageKind: "proposal",
    id: proposal.id,
    title: proposal.id,
    status: proposal.status,
    scope: proposal.targetProcess || "",
    summary: `${proposal.targetId || "platform"}${proposal.reason ? `, ${proposal.reason}` : ""}`
  }));
  return [...branches, ...changeSets, ...proposals].sort((left, right) =>
    left.pageKind.localeCompare(right.pageKind)
    || left.status.localeCompare(right.status)
    || left.id.localeCompare(right.id)
  );
}

function verificationItems(model) {
  const gates = (model.testGates ?? []).map(gate => ({
    pageKind: "testGate",
    id: gate.id,
    title: gate.title || gate.id,
    status: gate.lastResult?.status || "idle",
    scope: gate.environment || "",
    summary: `${gate.runner || "runner"}, ${(gate.protectedObjects ?? []).length} protected objects`
  }));
  const runs = (model.testRuns ?? []).map(run => ({
    pageKind: "testRun",
    id: run.id,
    title: run.title || run.id,
    status: run.status,
    scope: run.branchId || run.gateId || "",
    summary: `${run.durationMs ?? "?"} ms, exit ${run.exitCode ?? "n/a"}`
  }));
  const revisions = (model.runtimeRevisions ?? []).map(revision => ({
    pageKind: "runtimeRevision",
    id: revision.id,
    title: `Revision ${revision.revision}`,
    status: revision.status,
    scope: revision.trigger || "",
    summary: `${revision.changedSources?.length ?? 0} changed sources, ${revision.buildErrorCount ?? 0} build errors`
  }));
  const snapshots = (model.candidateSnapshots ?? []).map(snapshot => ({
    pageKind: "candidateSnapshot",
    id: snapshot.id,
    title: snapshot.id,
    status: snapshot.status,
    scope: snapshot.branchId || "",
    summary: `revision ${snapshot.revision ?? "n/a"}, ${snapshot.errorCount ?? snapshot.errors?.length ?? 0} errors`
  }));
  return [...gates, ...runs, ...revisions, ...snapshots].sort((left, right) =>
    left.pageKind.localeCompare(right.pageKind)
    || left.id.localeCompare(right.id)
  );
}

function knowledgeItems(model) {
  const docs = (model.docs ?? []).map(doc => ({
    pageKind: "doc",
    id: doc.path,
    title: doc.path,
    status: doc.freshness?.status || doc.status,
    scope: doc.role || "",
    summary: `${doc.sectionCount ?? 0} sections, ${doc.taskCount ?? 0} tasks`
  }));
  const tasks = (model.roadmapTasks ?? []).map(task => ({
    pageKind: "roadmapTask",
    id: task.id,
    title: task.title,
    status: task.derivedStatus || task.status,
    scope: task.section || "",
    summary: task.derivedSummary || task.doc
  }));
  const epics = (model.epics ?? []).map(epic => ({
    pageKind: "epic",
    id: epic.id,
    title: epic.title,
    status: epic.status,
    scope: epic.roadmapId || "",
    summary: `${(epic.branchIds ?? []).length} branches, ${(epic.featureIds ?? []).length} features`
  }));
  const features = (model.features ?? []).map(feature => ({
    pageKind: "feature",
    id: feature.id,
    title: feature.title,
    status: feature.status,
    scope: feature.epicId || "",
    summary: `${(feature.branchIds ?? []).length} branches, ${(feature.gateIds ?? []).length} gates`
  }));
  return [...docs, ...tasks, ...epics, ...features].sort((left, right) =>
    left.pageKind.localeCompare(right.pageKind)
    || left.id.localeCompare(right.id)
  );
}

function signalItems(model) {
  const gaps = (model.gaps ?? []).map(gap => ({
    pageKind: "gap",
    id: gap.id,
    title: gap.reason || gap.id,
    status: gap.severity || "",
    scope: gap.kind || "",
    summary: gap.target || ""
  }));
  const telemetry = (model.nodes ?? [])
    .filter(node => node.kind === "telemetryMetric")
    .map(node => ({
      pageKind: "telemetryMetric",
      id: node.id,
      title: node.title || node.id,
      status: node.status,
      scope: node.source || "",
      summary: node.owner || ""
    }));
  const defectClusters = (model.nodes ?? [])
    .filter(node => node.kind === "defectCluster")
    .map(node => ({
      pageKind: "defectCluster",
      id: node.id,
      title: node.title || node.id,
      status: node.status,
      scope: node.source || "",
      summary: node.owner || ""
    }));
  const boundaries = (model.nodes ?? [])
    .filter(node => node.kind === "boundary")
    .map(node => ({
      pageKind: "boundary",
      id: node.id,
      title: node.title || node.id,
      status: node.status,
      scope: node.source || "",
      summary: node.owner || ""
    }));
  return [...gaps, ...telemetry, ...defectClusters, ...boundaries].sort((left, right) =>
    left.pageKind.localeCompare(right.pageKind)
    || left.id.localeCompare(right.id)
  );
}

function modelItems(model) {
  return [...(model.nodes ?? [])].sort((left, right) =>
    left.kind.localeCompare(right.kind)
    || left.id.localeCompare(right.id)
  ).map(node => ({
    pageKind: node.kind,
    id: node.id,
    title: node.title || node.id,
    status: node.status,
    scope: node.source || "",
    summary: node.owner || ""
  }));
}

function surfaceIdPrefixes(surface, key, fallback = []) {
  const raw = surfacePropText(surface, key, "");
  if (!raw) return fallback;
  const prefixes = raw.split("|").map(value => value.trim()).filter(Boolean);
  return prefixes.length ? prefixes : fallback;
}

function recordMatchesIdPrefixes(record, prefixes = []) {
  const id = optionalText(record?.id);
  return Boolean(id && prefixes.some(prefix => id.startsWith(prefix)));
}

function surfaceValueList(surface, key, fallback = []) {
  const raw = surfacePropText(surface, key, "");
  if (!raw) return fallback;
  const values = raw.split("|").map(value => value.trim()).filter(Boolean);
  return values.length ? values : fallback;
}

function recordMatchesKinds(record, kinds = []) {
  const kind = optionalText(record?.kind);
  return Boolean(kind && kinds.includes(kind));
}

function detailRecordsForSource(source, model) {
  switch (source) {
    case "branches":
      return model.branches ?? [];
    case "changeSets":
      return model.changeSets ?? [];
    case "proposals":
      return model.proposals ?? [];
    case "testGates":
      return model.testGates ?? [];
    case "runtimeRevisions":
      return model.runtimeRevisions ?? [];
    case "testRuns":
      return model.testRuns ?? [];
    case "candidateSnapshots":
      return model.candidateSnapshots ?? [];
    case "nodes":
      return model.nodes ?? [];
    case "docs":
      return model.docs ?? [];
    case "roadmapTasks":
      return model.roadmapTasks ?? [];
    case "epics":
      return model.epics ?? [];
    case "features":
      return model.features ?? [];
    case "gaps":
      return model.gaps ?? [];
    case "telemetryMetric":
    case "defectCluster":
    case "boundary":
      return (model.nodes ?? []).filter(node => node.kind === source);
    default:
      return [];
  }
}

function detailRecordMatchesSource(source, record, id) {
  if (!record || !id) return false;
  switch (source) {
    case "docs":
      return optionalText(record.path) === id || optionalText(record.id) === id;
    default:
      return optionalText(record.id) === id;
  }
}

function findAuthoredDetailBySources(surface, model, id, fallback = []) {
  const sources = surfaceValueList(surface, "detailSelectionSources", fallback);
  if (!sources.length) return null;
  if (!id) {
    for (const source of sources) {
      const [record] = detailRecordsForSource(source, model);
      if (record) return record;
    }
    return null;
  }
  for (const source of sources) {
    const record = detailRecordsForSource(source, model).find(candidate => detailRecordMatchesSource(source, candidate, id));
    if (record) return record;
  }
  return null;
}

function renderWorkflowDetail(surface, detail, model, ctx) {
  const primarySurface = nestedSurface(surface, "PlatformWorkflowPrimaryPanel", {
    title: "Primary Detail",
    summary: "Selected workflow object properties and long-tail fields."
  });
  const relatedSurface = nestedSurface(surface, "PlatformWorkflowRelatedPanel", {
    title: "Related Resources",
    summary: "Linked resources and supporting context for the selected workflow object."
  });
  const snapshotSurface = nestedSurface(surface, "PlatformWorkflowSnapshotHistory", {
    title: "Candidate Snapshots",
    summary: "Candidate snapshot history for the selected workflow object when available.",
    surfaceKind: "table"
  });
  const editSurface = nestedSurface(surface, "PlatformWorkflowEditHistory", {
    title: "Staged Edits",
    summary: "Staged overlay edits for the selected change set when available.",
    surfaceKind: "table"
  });
  const branchIdPrefixes = surfaceIdPrefixes(surface, "branchIdPrefixes", ["branch:"]);
  const changeSetIdPrefixes = surfaceIdPrefixes(surface, "changeSetIdPrefixes", ["changeSet:", "changeset."]);
  const proposalIdPrefixes = surfaceIdPrefixes(surface, "proposalIdPrefixes", ["proposal:"]);
  if (!detail) return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No workflow rows are projected yet." });
  if (recordMatchesIdPrefixes(detail, branchIdPrefixes)) {
    const branch = detail;
    const snapshots = (model.candidateSnapshots ?? []).filter(snapshot => snapshot.branchId === branch.id).slice(0, surfaceRowLimit(snapshotSurface, 12));
    const snapshotRows = snapshots.map(snapshot => ({
      ...snapshot,
      errorCount: Array.isArray(snapshot.errors) ? snapshot.errors.length : (snapshot.errorCount ?? 0)
    }));
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "branchCardTitle", "branchFields", ctx, branch, "Branch Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "branchFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "branchFields")
        : ["id", "title", "status", "lifecycleLane", "owner", "parentBranchId", "epic", "feature", "defect", "runtimeProfile", "latestCandidateSnapshotId", "docsFreshness", "testRedGreen"]),
      ...surfaceKeyList(primarySurface, "branchLongTailExcludedFields", ["changeSetIds", "affectedSystemSummaries", "telemetryImpactSummaries"])
    ];
    return renderAuthoredDetailLayout(surface, new Map([
      [primarySurface.name, renderSurfaceFrame(primarySurface, `
        ${renderPropertyCard(primaryCard)}
        ${renderLongTailProperties(primarySurface, ctx, branch, usedKeys)}
      `)],
      [relatedSurface.name, renderSurfaceFrame(relatedSurface, `
        ${renderCardSpecs(relatedSurface, "branchLinkCards", "branchLinkCardEmptyStates", ctx, branch, "links")}
        ${renderCardSpecs(relatedSurface, "branchTextCards", "branchTextCardEmptyStates", ctx, branch, "text")}
      `)],
      [snapshotSurface.name, renderSurfaceFrame(snapshotSurface, renderAuthoredSurfaceTable(snapshotSurface, renderRowsFromSurfaceSchema(snapshotSurface, "rowFields", snapshotRows, ctx, snapshot => `
        <tr>
          <td>${esc(snapshot.status || "")}</td>
          <td>${renderConceptLink(ctx, snapshot.id)}</td>
          <td>${esc(snapshot.revision ?? "")}</td>
          <td>${renderConceptLink(ctx, snapshot.changeSetId)}</td>
          <td>${esc(Array.isArray(snapshot.errors) ? snapshot.errors.length : 0)}</td>
        </tr>
      `)))]
    ]));
  }
  if (recordMatchesIdPrefixes(detail, changeSetIdPrefixes)) {
    const changeSet = detail;
    const edits = (model.changeSetEdits ?? []).filter(edit => edit.changeSetId === changeSet.id).slice(0, surfaceRowLimit(editSurface, 20));
    const snapshots = (model.candidateSnapshots ?? []).filter(snapshot => snapshot.changeSetId === changeSet.id).slice(0, surfaceRowLimit(snapshotSurface, 12));
    const editRows = edits.map(edit => ({
      ...edit,
      previousHashShort: shortHash(edit.previousHash),
      nextHashShort: shortHash(edit.nextHash)
    }));
    const snapshotRows = snapshots.map(snapshot => ({
      ...snapshot,
      errorCount: Array.isArray(snapshot.errors) ? snapshot.errors.length : (snapshot.errorCount ?? 0)
    }));
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "changeSetCardTitle", "changeSetFields", ctx, changeSet, "Change Set Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "changeSetFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "changeSetFields")
        : ["id", "title", "status", "branchId", "owner", "reason", "editCount", "latestCandidateSnapshotId", "testRedGreen"]),
      ...surfaceKeyList(primarySurface, "changeSetLongTailExcludedFields", ["changedPaths"])
    ];
    return renderAuthoredDetailLayout(surface, new Map([
      [primarySurface.name, renderSurfaceFrame(primarySurface, `
        ${renderPropertyCard(primaryCard)}
        ${renderLongTailProperties(primarySurface, ctx, changeSet, usedKeys)}
      `)],
      [relatedSurface.name, renderSurfaceFrame(relatedSurface, `
        ${renderCardSpecs(relatedSurface, "changeSetLinkCards", "changeSetLinkCardEmptyStates", ctx, changeSet, "links")}
      `)],
      [editSurface.name, renderSurfaceFrame(editSurface, renderAuthoredSurfaceTable(editSurface, renderRowsFromSurfaceSchema(editSurface, "rowFields", editRows, ctx, edit => `
        <tr>
          <td>${esc(edit.path || "")}</td>
          <td>${esc(edit.sourceLanguage || "")}</td>
          <td>${esc(edit.previousHash ? String(edit.previousHash).slice(0, 12) : "")}</td>
          <td>${esc(edit.nextHash ? String(edit.nextHash).slice(0, 12) : "")}</td>
        </tr>
      `)))],
      [snapshotSurface.name, renderSurfaceFrame(snapshotSurface, renderTable(surfaceColumnLabels(snapshotSurface, []), renderRowsFromSurfaceSchema(snapshotSurface, "rowFields", snapshotRows, ctx, snapshot => `
        <tr>
          <td>${esc(snapshot.status || "")}</td>
          <td>${renderConceptLink(ctx, snapshot.id)}</td>
          <td>${esc(snapshot.revision ?? "")}</td>
          <td>${renderConceptLink(ctx, snapshot.changeSetId)}</td>
          <td>${esc(Array.isArray(snapshot.errors) ? snapshot.errors.length : 0)}</td>
        </tr>
      `), surfaceVariantEmptyState(snapshotSurface, "changeSetEmptyState", "No candidate snapshots for this change set.")))]
    ]));
  }
  const proposal = detail;
  if (!recordMatchesIdPrefixes(proposal, proposalIdPrefixes) && detail.id) {
    return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No workflow rows are projected yet." });
  }
  const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "proposalCardTitle", "proposalFields", ctx, proposal, "Proposal Detail");
  const usedKeys = rootKeysFromSurfaceSchema(primarySurface, "proposalFields").length
    ? rootKeysFromSurfaceSchema(primarySurface, "proposalFields")
    : ["id", "status", "targetProcess", "targetId", "reason", "action"];
  return renderAuthoredDetailLayout(surface, new Map([
    [primarySurface.name, renderSurfaceFrame(primarySurface, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, proposal, usedKeys)}
    `)],
    [relatedSurface.name, renderSurfaceFrame(relatedSurface, `
      ${renderCardSpecs(relatedSurface, "proposalLinkCards", "proposalLinkCardEmptyStates", ctx, proposal, "links")}
    `)]
  ]));
}

function renderVerificationDetail(surface, detail, model, ctx) {
  const primarySurface = nestedSurface(surface, "PlatformVerificationPrimaryPanel", {
    title: "Primary Detail",
    summary: "Selected verification object properties and long-tail fields."
  });
  const relatedSurface = nestedSurface(surface, "PlatformVerificationRelatedPanel", {
    title: "Related Resources",
    summary: "Linked verification resources, streams, and supporting context."
  });
  const runHistorySurface = nestedSurface(surface, "PlatformVerificationRunHistory", {
    title: "Recent Test Runs",
    summary: "Recent test-run history for the selected verification object when available.",
    surfaceKind: "table"
  });
  const buildHistorySurface = nestedSurface(surface, "PlatformVerificationBuildHistory", {
    title: "Snapshot Builds",
    summary: "Snapshot build history for the selected runtime revision when available.",
    surfaceKind: "table"
  });
  const buildErrorsSurface = nestedSurface(surface, "PlatformVerificationBuildErrors", {
    title: "Build Errors",
    summary: "Build errors for the selected runtime revision when available.",
    surfaceKind: "table"
  });
  const gateIdPrefixes = surfaceIdPrefixes(surface, "gateIdPrefixes", ["gate:"]);
  const runtimeRevisionIdPrefixes = surfaceIdPrefixes(surface, "runtimeRevisionIdPrefixes", ["runtimeRevision:", "backendRevision:", "frontendRevision:"]);
  const candidateSnapshotIdPrefixes = surfaceIdPrefixes(surface, "candidateSnapshotIdPrefixes", ["candidateSnapshot:"]);
  const testRunIdPrefixes = surfaceIdPrefixes(surface, "testRunIdPrefixes", ["testRun:"]);
  if (!detail) return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No verification rows are projected yet." });
  if (recordMatchesIdPrefixes(detail, gateIdPrefixes)) {
    const gate = detail;
    const runRows = (model.testRuns ?? []).filter(run => run.gateId === gate.id).slice(0, surfaceRowLimit(runHistorySurface, 12));
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "gateCardTitle", "gateFields", ctx, gate, "Test Gate Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "gateFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "gateFields")
        : ["id", "title", "runner", "environment", "timeoutMs", "costEstimate", "command", "lastResult"]),
      ...surfaceKeyList(primarySurface, "gateLongTailExcludedFields", ["protectedObjects", "selectedByBranches", "selectedByChangeSets"])
    ];
    return renderAuthoredDetailLayout(surface, new Map([
      [primarySurface.name, renderSurfaceFrame(primarySurface, `
        ${renderPropertyCard(primaryCard)}
        ${renderLongTailProperties(primarySurface, ctx, gate, usedKeys)}
      `)],
      [relatedSurface.name, renderSurfaceFrame(relatedSurface, `
        ${renderCardSpecs(relatedSurface, "gateLinkCards", "gateLinkCardEmptyStates", ctx, gate, "links")}
      `)],
      [runHistorySurface.name, renderSurfaceFrame(runHistorySurface, renderAuthoredSurfaceTable(runHistorySurface, renderRowsFromSurfaceSchema(runHistorySurface, "rowFields", runRows, ctx, run => `
        <tr>
          <td>${esc(run.status || "")}</td>
          <td>${renderConceptLink(ctx, run.id)}</td>
          <td>${run.branchId ? renderConceptLink(ctx, run.branchId) : ""}</td>
          <td>${esc(run.durationMs ?? "")}</td>
          <td>${esc(run.exitCode ?? "")}</td>
        </tr>
      `)))]
    ]));
  }
  if (recordMatchesIdPrefixes(detail, runtimeRevisionIdPrefixes)) {
    const revision = detail;
    const builds = (model.snapshotBuilds ?? []).filter(build => Number(build.revision || 0) === Number(revision.revision || 0)).slice(0, surfaceRowLimit(buildHistorySurface, 12));
    const errors = (model.snapshotBuildErrors ?? []).filter(error => Number(error.revision || 0) === Number(revision.revision || 0)).slice(0, surfaceRowLimit(buildErrorsSurface, 12));
    const buildRows = builds.map(build => ({ ...build }));
    const errorRows = errors.map(error => ({ ...error }));
    const diagnosticsRecord = {
      ...revision,
      snapshotDiagnostics: model.snapshotDiagnostics,
      testMonitorDiagnostics: model.testMonitorDiagnostics,
      backendRevisionEventsHref: "/api/runtime/backend-revisions/events"
    };
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "runtimeRevisionCardTitle", "runtimeRevisionFields", ctx, revision, "Runtime Revision Detail");
    const diagnosticsCard = propertyRowsFromSurfaceSchema(relatedSurface, "runtimeRevisionPropertyCardTitle", "runtimeRevisionPropertyFields", ctx, diagnosticsRecord, "Snapshot Diagnostics");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "runtimeRevisionFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "runtimeRevisionFields")
        : ["id", "revision", "status", "trigger", "branchId", "changeSetId", "changedSources", "buildErrorCount"]),
      ...surfaceKeyList(primarySurface, "runtimeRevisionLongTailExcludedFields", ["candidateBranchCount"])
    ];
    return renderAuthoredDetailLayout(surface, new Map([
      [primarySurface.name, renderSurfaceFrame(primarySurface, `
        ${renderPropertyCard(primaryCard)}
        ${renderLongTailProperties(primarySurface, ctx, revision, usedKeys)}
      `)],
      [relatedSurface.name, renderSurfaceFrame(relatedSurface, `
        ${renderCardSpecs(relatedSurface, "runtimeRevisionLinkCards", "runtimeRevisionLinkCardEmptyStates", ctx, revision, "links")}
        ${renderPropertyCard(diagnosticsCard)}
      `)],
      [buildHistorySurface.name, renderSurfaceFrame(buildHistorySurface, renderAuthoredSurfaceTable(buildHistorySurface, renderRowsFromSurfaceSchema(buildHistorySurface, "rowFields", buildRows, ctx, build => `
        <tr>
          <td>${esc(build.status || "")}</td>
          <td>${esc(build.id || "")}</td>
          <td>${build.candidateSnapshotId ? renderConceptLink(ctx, build.candidateSnapshotId) : ""}</td>
          <td>${build.branchId ? renderConceptLink(ctx, build.branchId) : ""}</td>
          <td>${esc(build.errorCount ?? 0)}</td>
        </tr>
      `)))],
      [buildErrorsSurface.name, renderSurfaceFrame(buildErrorsSurface, renderAuthoredSurfaceTable(buildErrorsSurface, renderRowsFromSurfaceSchema(buildErrorsSurface, "rowFields", errorRows, ctx, error => `
        <tr>
          <td>${esc(error.snapshotBuildId || "")}</td>
          <td>${esc(error.path || "")}</td>
          <td>${esc(error.kind || "")}</td>
          <td>${esc(error.message || "")}</td>
        </tr>
      `)))]
    ]));
  }
  if (recordMatchesIdPrefixes(detail, candidateSnapshotIdPrefixes)) {
    const snapshot = detail;
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "candidateSnapshotCardTitle", "candidateSnapshotFields", ctx, snapshot, "Candidate Snapshot Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "candidateSnapshotFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "candidateSnapshotFields")
        : ["id", "status", "branchId", "changeSetId", "revision"]),
      ...surfaceKeyList(primarySurface, "candidateSnapshotLongTailExcludedFields", ["files", "errors"])
    ];
    return renderAuthoredDetailLayout(surface, new Map([
      [primarySurface.name, renderSurfaceFrame(primarySurface, `
        ${renderPropertyCard(primaryCard)}
        ${renderLongTailProperties(primarySurface, ctx, snapshot, usedKeys)}
      `)],
      [relatedSurface.name, renderSurfaceFrame(relatedSurface, `
        ${renderCardSpecs(relatedSurface, "candidateSnapshotTextCards", "candidateSnapshotTextCardEmptyStates", ctx, snapshot, "text")}
      `)]
    ]));
  }
  const run = detail;
  if (!recordMatchesIdPrefixes(run, testRunIdPrefixes) && detail.id) {
    return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No verification rows are projected yet." });
  }
  const runRecord = {
    ...run,
    testRunEventsHref: "/api/platform-test-runs/events",
    backendRevisionEventsHref: "/api/runtime/backend-revisions/events"
  };
  const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "testRunCardTitle", "testRunFields", ctx, runRecord, "Test Run Detail");
  const streamsCard = propertyRowsFromSurfaceSchema(relatedSurface, "testRunPropertyCardTitle", "testRunPropertyFields", ctx, runRecord, "Verification Streams");
  const usedKeys = rootKeysFromSurfaceSchema(primarySurface, "testRunFields").length
    ? rootKeysFromSurfaceSchema(primarySurface, "testRunFields")
    : ["id", "title", "status", "gateId", "branchId", "changeSetId", "candidateSnapshotId", "durationMs", "exitCode", "startedAt", "finishedAt"];
  return renderAuthoredDetailLayout(surface, new Map([
    [primarySurface.name, renderSurfaceFrame(primarySurface, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, run, usedKeys)}
    `)],
    [relatedSurface.name, renderSurfaceFrame(relatedSurface, `
      ${renderPropertyCard(streamsCard)}
    `)]
  ]));
}

function renderKnowledgeDetail(surface, detail, model, ctx) {
  const primarySurface = nestedSurface(surface, "PlatformKnowledgePrimaryPanel", {
    title: "Primary Detail",
    summary: "Selected knowledge object properties and long-tail fields."
  });
  const relatedSurface = nestedSurface(surface, "PlatformKnowledgeRelatedPanel", {
    title: "Related Resources",
    summary: "Linked platform resources and supporting context for the selected knowledge object."
  });
  const sectionsSurface = nestedSurface(surface, "PlatformKnowledgeSections", {
    title: "Sections",
    summary: "Document sections for the selected governed document when available.",
    surfaceKind: "table"
  });
  const tasksSurface = nestedSurface(surface, "PlatformKnowledgeTasks", {
    title: "Tasks",
    summary: "Document or roadmap tasks for the selected knowledge object when available.",
    surfaceKind: "table"
  });
  const documentPathField = surfacePropText(surface, "documentPathField", "path");
  const roadmapTaskIdPrefixes = surfaceIdPrefixes(surface, "roadmapTaskIdPrefixes", ["roadmapTask:"]);
  const roadmapTaskFallbackField = surfacePropText(surface, "roadmapTaskFallbackField", "doc");
  const epicIdPrefixes = surfaceIdPrefixes(surface, "epicIdPrefixes", ["epic:"]);
  const featureIdPrefixes = surfaceIdPrefixes(surface, "featureIdPrefixes", ["feature:"]);
  if (!detail) return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No knowledge rows are projected yet." });
  if (resolveFieldPath(detail, documentPathField)) {
    const doc = detail;
    const sections = (model.docSections ?? []).filter(section => section.doc === doc.path).slice(0, surfaceRowLimit(sectionsSurface, 20));
    const tasks = (model.docTasks ?? []).filter(task => task.doc === doc.path).slice(0, surfaceRowLimit(tasksSurface, 20));
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "documentCardTitle", "documentFields", ctx, doc, "Document Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "documentFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "documentFields")
        : ["id", "path", "role", "owner", "status", "freshness", "sectionCount", "taskCount"]),
      ...surfaceKeyList(primarySurface, "documentLongTailExcludedFields", ["references"])
    ];
    return renderAuthoredDetailLayout(surface, new Map([
      [primarySurface.name, renderSurfaceFrame(primarySurface, `
        ${renderPropertyCard(primaryCard)}
        ${renderLongTailProperties(primarySurface, ctx, doc, usedKeys)}
      `)],
      [relatedSurface.name, renderSurfaceFrame(relatedSurface, `
        ${renderCardSpecs(relatedSurface, "documentLinkCards", "documentLinkCardEmptyStates", ctx, doc, "links")}
      `)],
      [sectionsSurface.name, renderSurfaceFrame(sectionsSurface, renderAuthoredSurfaceTable(sectionsSurface, renderRowsFromSurfaceSchema(sectionsSurface, "rowFields", sections, ctx, section => `
        <tr>
          <td>${esc(section.title || "")}</td>
          <td>${esc(section.line ?? "")}</td>
          <td>${esc(section.depth ?? "")}</td>
        </tr>
      `)))],
      [tasksSurface.name, renderSurfaceFrame(tasksSurface, renderAuthoredSurfaceTable(tasksSurface, renderRowsFromSurfaceSchema(tasksSurface, "rowFields", tasks, ctx, task => `
        <tr>
          <td>${esc(task.status || "")}</td>
          <td>${task.id ? renderConceptLink(ctx, task.id, task.title || task.id) : esc(task.title || "")}</td>
          <td>${esc(task.line ?? "")}</td>
          <td>${esc(task.section || "")}</td>
        </tr>
      `)))]
    ]));
  }
  if (recordMatchesIdPrefixes(detail, roadmapTaskIdPrefixes) || resolveFieldPath(detail, roadmapTaskFallbackField)) {
    const task = detail;
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "roadmapTaskCardTitle", "roadmapTaskFields", ctx, task, "Roadmap Task Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "roadmapTaskFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "roadmapTaskFields")
        : ["id", "title", "status", "derivedStatus", "section", "doc", "line"]),
      ...surfaceKeyList(primarySurface, "roadmapTaskLongTailExcludedFields", ["targets", "derivedSummary", "evidence"])
    ];
    return renderAuthoredDetailLayout(surface, new Map([
      [primarySurface.name, renderSurfaceFrame(primarySurface, `
        ${renderPropertyCard(primaryCard)}
        ${renderLongTailProperties(primarySurface, ctx, task, usedKeys)}
      `)],
      [relatedSurface.name, renderSurfaceFrame(relatedSurface, `
        ${renderCardSpecs(relatedSurface, "roadmapTaskLinkCards", "roadmapTaskLinkCardEmptyStates", ctx, task, "links")}
      `)]
    ]));
  }
  if (recordMatchesIdPrefixes(detail, epicIdPrefixes)) {
    const epic = detail;
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "epicCardTitle", "epicFields", ctx, epic, "Epic Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "epicFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "epicFields")
        : ["id", "title", "status", "roadmapId", "branchIds", "featureIds", "gateIds", "docIds"]),
      ...surfaceKeyList(primarySurface, "epicLongTailExcludedFields", ["defectClusterIds"])
    ];
    return renderAuthoredDetailLayout(surface, new Map([
      [primarySurface.name, renderSurfaceFrame(primarySurface, `
        ${renderPropertyCard(primaryCard)}
        ${renderLongTailProperties(primarySurface, ctx, epic, usedKeys)}
      `)],
      [relatedSurface.name, renderSurfaceFrame(relatedSurface, `
        ${renderCardSpecs(relatedSurface, "epicLinkCards", "epicLinkCardEmptyStates", ctx, epic, "links")}
      `)]
    ]));
  }
  const feature = detail;
  if (!recordMatchesIdPrefixes(feature, featureIdPrefixes) && detail.id) {
    return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No knowledge rows are projected yet." });
  }
  const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "featureCardTitle", "featureFields", ctx, feature, "Feature Detail");
  const usedKeys = [
    ...(rootKeysFromSurfaceSchema(primarySurface, "featureFields").length
      ? rootKeysFromSurfaceSchema(primarySurface, "featureFields")
      : ["id", "title", "status", "epicId", "branchIds", "gateIds", "docIds"]),
    ...surfaceKeyList(primarySurface, "featureLongTailExcludedFields", ["defectClusterIds"])
  ];
  return renderAuthoredDetailLayout(surface, new Map([
    [primarySurface.name, renderSurfaceFrame(primarySurface, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, feature, usedKeys)}
    `)],
    [relatedSurface.name, renderSurfaceFrame(relatedSurface, `
      ${renderCardSpecs(relatedSurface, "featureLinkCards", "featureLinkCardEmptyStates", ctx, feature, "links")}
    `)]
  ]));
}

function renderSignalDetail(surface, detail, model, ctx) {
  const primarySurface = nestedSurface(surface, "PlatformSignalPrimaryPanel", {
    title: "Primary Detail",
    summary: "Selected signal properties and long-tail fields."
  });
  const relatedSurface = nestedSurface(surface, "PlatformSignalRelatedPanel", {
    title: "Related Resources",
    summary: "Linked proposals, selector drift, and supporting signal context."
  });
  const relationshipsSurface = nestedSurface(surface, "PlatformSignalRelationships", {
    title: "Related Relationships",
    summary: "Linked graph relationships for the selected signal when available.",
    surfaceKind: "table"
  });
  const gapIdPrefixes = surfaceIdPrefixes(surface, "gapIdPrefixes", ["gap."]);
  const signalNodeKinds = surfaceValueList(surface, "signalNodeKinds", ["telemetryMetric", "defectCluster", "boundary"]);
  if (!detail) return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No signal rows are projected yet." });
  if (recordMatchesIdPrefixes(detail, gapIdPrefixes)) {
    const gap = detail;
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "gapCardTitle", "gapFields", ctx, gap, "Gap Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "gapFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "gapFields")
        : ["id", "severity", "kind", "target", "reason"]),
      ...surfaceKeyList(primarySurface, "gapLongTailExcludedFields", ["recommendedProposal", "missingInGenerated", "extraInGenerated"])
    ];
    return renderAuthoredDetailLayout(surface, new Map([
      [primarySurface.name, renderSurfaceFrame(primarySurface, `
        ${renderPropertyCard(primaryCard)}
        ${renderLongTailProperties(primarySurface, ctx, gap, usedKeys)}
      `)],
      [relatedSurface.name, renderSurfaceFrame(relatedSurface, `
        ${renderCardSpecs(relatedSurface, "gapLinkCards", "gapLinkCardEmptyStates", ctx, gap, "links")}
        ${renderCardSpecs(relatedSurface, "gapTextCards", "gapTextCardEmptyStates", ctx, gap, "text")}
      `)],
      [relationshipsSurface.name, renderSurfaceFrame(relationshipsSurface, renderAuthoredSurfaceTable(relationshipsSurface, []))]
    ]));
  }
  const node = detail;
  if (!recordMatchesKinds(node, signalNodeKinds) && detail.id) {
    return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No signal rows are projected yet." });
  }
  const relatedEdges = (model.edges ?? []).filter(edge => edge.from === node.id || edge.to === node.id).slice(0, surfaceRowLimit(relationshipsSurface, 20));
  const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "signalCardTitle", "signalFields", ctx, node, "Signal Detail");
  const usedKeys = rootKeysFromSurfaceSchema(primarySurface, "signalFields").length
    ? rootKeysFromSurfaceSchema(primarySurface, "signalFields")
    : ["id", "kind", "title", "status", "owner", "source", "lifecycle"];
  return renderAuthoredDetailLayout(surface, new Map([
    [primarySurface.name, renderSurfaceFrame(primarySurface, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, node, usedKeys)}
    `)],
    [relationshipsSurface.name, renderSurfaceFrame(relationshipsSurface, renderAuthoredSurfaceTable(relationshipsSurface, renderRowsFromSurfaceSchema(relationshipsSurface, "rowFields", relatedEdges, ctx, edge => `
          <tr>
            <td>${renderConceptLink(ctx, edge.from)}</td>
            <td>${esc(edge.rel || "")}</td>
            <td>${renderConceptLink(ctx, edge.to)}</td>
          </tr>
        `)))]
  ]));
}

function renderModelDetail(surface, node, model, ctx) {
  const primarySurface = nestedSurface(surface, "PlatformModelPrimaryPanel", {
    title: "Primary Detail",
    summary: "Selected platform object properties and long-tail fields."
  });
  const relationshipsSurface = nestedSurface(surface, "PlatformModelRelationships", {
    title: "Relationships",
    summary: "Linked graph relationships for the selected platform object when available.",
    surfaceKind: "table"
  });
  if (!node) return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No platform objects are projected yet." });
  const relatedEdges = (model.edges ?? []).filter(edge => edge.from === node.id || edge.to === node.id).slice(0, surfaceRowLimit(relationshipsSurface, 20));
  const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "objectCardTitle", "objectFields", ctx, node, "Platform Object Detail");
  const usedKeys = rootKeysFromSurfaceSchema(primarySurface, "objectFields").length
    ? rootKeysFromSurfaceSchema(primarySurface, "objectFields")
    : ["id", "kind", "title", "status", "owner", "source", "lifecycle"];
  return renderAuthoredDetailLayout(surface, new Map([
    [primarySurface.name, renderSurfaceFrame(primarySurface, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, node, usedKeys)}
    `)],
    [relationshipsSurface.name, renderSurfaceFrame(relationshipsSurface, renderAuthoredSurfaceTable(relationshipsSurface, renderRowsFromSurfaceSchema(relationshipsSurface, "rowFields", relatedEdges, ctx, edge => `
          <tr>
            <td>${renderConceptLink(ctx, edge.from)}</td>
            <td>${esc(edge.rel || "")}</td>
            <td>${renderConceptLink(ctx, edge.to)}</td>
          </tr>
        `)))]
  ]));
}

function recordsForAuthoredListSource(source, model) {
  switch (source) {
    case "workflowItems":
      return workflowItems(model);
    case "verificationItems":
      return verificationItems(model);
    case "knowledgeItems":
      return knowledgeItems(model);
    case "signalItems":
      return signalItems(model);
    case "modelItems":
      return modelItems(model);
    default:
      return [];
  }
}

function recordsForAuthoredTableSource(source, model) {
  switch (source) {
    case "platformMapRows":
      return (model.nodes ?? []).map(node => ({
        ...node,
        lifecycleText: (node.lifecycle ?? []).join(", ")
      }));
    case "profileComparisonRows":
      return (model.profiles ?? []).map(profile => ({
        ...profile,
        pluginCount: (profile.pluginIds ?? []).length,
        capabilityCount: (profile.capabilities ?? []).length
      }));
    case "gapRows":
      return model.gaps ?? [];
    case "coverageRows":
      return model.coverageEdges ?? [];
    case "branchRedGreenRows":
      return (model.branchTestRedGreen ?? []).map(row => ({
        ...row,
        passedCount: (row.passedGateIds ?? []).length,
        failedCount: (row.failedGateIds ?? []).length + (row.errorGateIds ?? []).length + (row.timedOutGateIds ?? []).length
      }));
    case "changeSetRedGreenRows":
      return (model.changeSetTestRedGreen ?? []).map(row => ({
        ...row,
        passedCount: (row.passedGateIds ?? []).length,
        failedCount: (row.failedGateIds ?? []).length + (row.errorGateIds ?? []).length + (row.timedOutGateIds ?? []).length
      }));
    default:
      return [];
  }
}

function renderAuthoredListSection(surface, model, ctx) {
  const source = surfacePropText(surface, "listSource", "");
  const items = recordsForAuthoredListSource(source, model);
  const sorted = sortRecordsForSurface(items, surface, ctx, { defaultSortKey: "kind" });
  const page = paginateRows(sorted.items, { ...ctx, sort: sorted.sortKey, dir: sorted.sortDir }, surfacePageSize(surface));
  return renderSurfaceFrame(surface, `
    ${renderSortControls(surface, { ...ctx, sort: sorted.sortKey, dir: sorted.sortDir }, sorted)}
    ${renderAuthoredSurfaceTable(surface, renderRowsFromSurfaceSchema(surface, "rowFields", page.items, ctx, () => ""))}
    ${renderPagination({ ...ctx, sort: sorted.sortKey, dir: sorted.sortDir }, page.total, page.offset, page.limit)}
  `);
}

function renderAuthoredTableSection(surface, model, ctx) {
  const source = surfacePropText(surface, "tableSource", "");
  const rows = recordsForAuthoredTableSource(source, model).slice(0, surfaceRowLimit(surface, 12));
  return renderSurfaceFrame(surface, renderAuthoredSurfaceTable(surface, renderRowsFromSurfaceSchema(surface, "rowFields", rows, ctx, () => "")));
}

function renderAuthoredFormSection(surface, model) {
  const fields = parseFormFieldEntries(surface?.props?.formFields);
  const defaultsMap = parseSurfaceLabelMap(surface?.props?.fieldDefaults);
  const placeholdersMap = parseSurfaceLabelMap(surface?.props?.fieldPlaceholders);
  const rowMap = parseSurfaceLabelMap(surface?.props?.fieldRows);
  const formId = surfacePropText(surface, "formId", `${surface?.name || "platform-form"}`);
  const statusId = surfacePropText(surface, "statusId", `${surface?.name || "platform-status"}`);
  const clientAction = optionalText(surface?.props?.clientAction);
  return renderSurfaceFrame(surface, `
      <form id="${esc(formId)}"${clientAction ? ` data-platform-client-action="${esc(clientAction)}"` : ""} data-platform-status-id="${esc(statusId)}">
        ${fields.map(field => renderAuthoredFormField(surface, field, model, defaultsMap, placeholdersMap, rowMap)).join("")}
        ${renderFormActionButtons(surface)}
        <div id="${esc(statusId)}"></div>
      </form>
  `);
}

function renderAuthoredStaticPropertySection(surface) {
  const record = Object.fromEntries(parseSurfaceLabelMap(surface?.props?.propertyValues).entries());
  return renderSurfaceFrame(surface, renderPropertyCard(propertyRowsFromSurfaceSchema(
    surface,
    "propertyCardTitle",
    "propertyFields",
    null,
    record,
    "Properties"
  )));
}

function renderAuthoredDetailSourceSection(surface, model, ctx) {
  switch (surfacePropText(surface, "detailSource", "")) {
    case "workflow":
      return renderSurfaceFrame(surface, renderWorkflowDetail(
        surface,
        findAuthoredDetailBySources(surface, model, ctx.id, ["branches", "changeSets", "proposals"]),
        model,
        ctx
      ));
    case "verification":
      return renderSurfaceFrame(surface, renderVerificationDetail(
        surface,
        findAuthoredDetailBySources(surface, model, ctx.id, ["testGates", "runtimeRevisions", "testRuns", "candidateSnapshots"]),
        model,
        ctx
      ));
    case "knowledge":
      return renderSurfaceFrame(surface, renderKnowledgeDetail(
        surface,
        findAuthoredDetailBySources(surface, model, ctx.id, ["docs", "roadmapTasks", "epics", "features"]),
        model,
        ctx
      ));
    case "signals":
      return renderSurfaceFrame(surface, renderSignalDetail(
        surface,
        findAuthoredDetailBySources(surface, model, ctx.id, ["gaps", "telemetryMetric", "defectCluster", "boundary"]),
        model,
        ctx
      ));
    case "model":
      return renderSurfaceFrame(surface, renderModelDetail(
        surface,
        findAuthoredDetailBySources(surface, model, ctx.id, ["nodes"]),
        model,
        ctx
      ));
    default:
      return "";
  }
}

function renderAuthoringClientScript() {
  return `
    <script>
      (function () {
        function formStatus(form) {
          const statusId = form && form.getAttribute("data-platform-status-id");
          return statusId ? document.getElementById(statusId) : null;
        }
        function setFormStatus(form, message) {
          const status = formStatus(form);
          if (status) status.textContent = message;
        }
        async function readResponseJson(response) {
          return response.json().catch(() => ({}));
        }
        function bindProposalCreate(form) {
          const actionSelect = form.elements.action;
          if (!actionSelect) return;
          function syncProposalBody() {
            const option = actionSelect.options[actionSelect.selectedIndex];
            if (!option) return;
            const sample = option.getAttribute("data-sample-body") || "{}";
            try {
              form.elements.bodyJson.value = JSON.stringify(JSON.parse(sample), null, 2);
            } catch {}
          }
          actionSelect.addEventListener("change", syncProposalBody);
          syncProposalBody();
          form.addEventListener("submit", async event => {
            event.preventDefault();
            let body = {};
            try {
              body = JSON.parse(form.elements.bodyJson.value || "{}");
            } catch {
              setFormStatus(form, "Body JSON is invalid.");
              return;
            }
            const response = await fetch("/api/platform-proposals", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                id: form.elements.id.value || null,
                action: form.elements.action.value || null,
                targetKind: form.elements.targetKind.value || null,
                targetId: form.elements.targetId.value || null,
                body,
                reason: form.elements.reason.value || null
              })
            });
            const json = await readResponseJson(response);
            setFormStatus(form, response.ok ? "Proposal created." : (json.error || "Proposal creation failed."));
          });
        }
        function bindProposalReview(form) {
          form.addEventListener("submit", async event => {
            event.preventDefault();
            const submitter = event.submitter;
            const action = submitter && submitter.value === "reject" ? "reject" : "approve";
            const id = form.elements.id.value;
            if (!id) {
              setFormStatus(form, "No open proposal selected.");
              return;
            }
            const response = await fetch("/api/platform-proposals/" + encodeURIComponent(id) + "/" + action, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(action === "reject" ? { reason: form.elements.reason.value || null } : {})
            });
            const json = await readResponseJson(response);
            setFormStatus(form, response.ok ? (action === "approve" ? "Proposal approved." : "Proposal rejected.") : (json.error || "Review failed."));
          });
        }
        function bindBranchCreate(form) {
          form.addEventListener("submit", async event => {
            event.preventDefault();
            const response = await fetch("/api/platform-branches", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                id: form.elements.id.value || null,
                title: form.elements.title.value || null,
                parentBranchId: form.elements.parentBranchId.value || null,
                epic: form.elements.epic.value || null,
                feature: form.elements.feature.value || null,
                defect: form.elements.defect.value || null
              })
            });
            const json = await readResponseJson(response);
            setFormStatus(form, response.ok ? "Branch created." : (json.error || "Branch creation failed."));
          });
        }
        function bindChangeSetCreate(form) {
          form.addEventListener("submit", async event => {
            event.preventDefault();
            const response = await fetch("/api/platform-change-sets", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                id: form.elements.id.value || null,
                branchId: form.elements.branchId.value || null,
                title: form.elements.title.value || null,
                reason: form.elements.reason.value || null
              })
            });
            const json = await readResponseJson(response);
            setFormStatus(form, response.ok ? "Change set created." : (json.error || "Change set creation failed."));
          });
        }
        function bindChangeSetEdit(form) {
          form.addEventListener("submit", async event => {
            event.preventDefault();
            const changeSetId = form.elements.changeSetId.value;
            if (!changeSetId) {
              setFormStatus(form, "Select a change set first.");
              return;
            }
            const response = await fetch("/api/platform-change-sets/" + encodeURIComponent(changeSetId) + "/edits", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                edits: [{ path: form.elements.path.value, content: form.elements.content.value }]
              })
            });
            const json = await readResponseJson(response);
            setFormStatus(form, response.ok ? "Edit staged." : (json.error || "Edit staging failed."));
          });
        }
        function bindChangeSetValidate(form) {
          form.addEventListener("submit", async event => {
            event.preventDefault();
            const changeSetId = form.elements.changeSetId.value;
            if (!changeSetId) {
              setFormStatus(form, "Select a change set first.");
              return;
            }
            const response = await fetch("/api/platform-change-sets/" + encodeURIComponent(changeSetId) + "/validate", {
              method: "POST",
              headers: { "content-type": "application/json" }
            });
            const json = await readResponseJson(response);
            setFormStatus(
              form,
              response.ok
                ? (json.candidateSnapshot?.status === "valid" ? "Change set valid." : "Change set invalid.")
                : (json.error || "Validation failed.")
            );
          });
        }
        function bindChangeSetApply(form) {
          form.addEventListener("submit", async event => {
            event.preventDefault();
            const changeSetId = form.elements.changeSetId.value;
            if (!changeSetId) {
              setFormStatus(form, "Select a change set first.");
              return;
            }
            const response = await fetch("/api/platform-change-sets/" + encodeURIComponent(changeSetId) + "/apply", {
              method: "POST",
              headers: { "content-type": "application/json" }
            });
            const json = await readResponseJson(response);
            setFormStatus(form, response.ok ? "Change set applied." : (json.error || "Apply failed."));
          });
        }
        function bindChangeSetLifecycle(form) {
          form.addEventListener("submit", async event => {
            event.preventDefault();
            const changeSetId = form.elements.changeSetId.value;
            const action = form.elements.action.value || "reject";
            const response = await fetch("/api/platform-change-sets/" + encodeURIComponent(changeSetId) + "/" + action, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ reason: form.elements.reason.value || null })
            });
            const json = await readResponseJson(response);
            setFormStatus(form, response.ok ? ("Change set " + action + "ed.") : (json.error || "Lifecycle update failed."));
          });
        }
        function bindTestRunSingle(form) {
          form.addEventListener("submit", async event => {
            event.preventDefault();
            const response = await fetch("/api/platform-test-runs", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                gateId: form.elements.gateId.value || null,
                branchId: form.elements.branchId.value || null,
                changeSetId: form.elements.changeSetId.value || null,
                candidateSnapshotId: form.elements.candidateSnapshotId.value || null
              })
            });
            const json = await readResponseJson(response);
            setFormStatus(
              form,
              response.ok
                ? ("Test run finished: " + String(json.latestResult?.status || json.testRun?.status || "unknown"))
                : (json.error || "Test run failed.")
            );
          });
        }
        function bindTestRunSelected(form) {
          form.addEventListener("submit", async event => {
            event.preventDefault();
            const response = await fetch("/api/platform-test-runs", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                branchId: form.elements.branchId.value || null,
                changeSetId: form.elements.changeSetId.value || null,
                candidateSnapshotId: form.elements.candidateSnapshotId.value || null
              })
            });
            const json = await readResponseJson(response);
            setFormStatus(
              form,
              response.ok
                ? ("Selected gates finished: " + String(json.summaries?.passed ?? 0) + "/" + String(json.summaries?.totalRuns ?? 0) + " passed")
                : (json.error || "Selected gate run failed.")
            );
          });
        }
        const handlers = {
          "proposal.create": bindProposalCreate,
          "proposal.review": bindProposalReview,
          "branch.create": bindBranchCreate,
          "changeSet.create": bindChangeSetCreate,
          "changeSet.edit": bindChangeSetEdit,
          "changeSet.validate": bindChangeSetValidate,
          "changeSet.apply": bindChangeSetApply,
          "changeSet.lifecycle": bindChangeSetLifecycle,
          "testRun.single": bindTestRunSingle,
          "testRun.selected": bindTestRunSelected
        };
        document.querySelectorAll("form[data-platform-client-action]").forEach(form => {
          const action = form.getAttribute("data-platform-client-action") || "";
          const handler = handlers[action];
          if (handler) handler(form);
        });
      }());
    </script>
  `;
}

function renderSurfaceSection(surface, model, ctx, consoleLayout) {
  if (surface?.props?.summaryPageId) {
    const sourcePageId = surfacePropText(surface, "summaryPageId", "overview");
    return renderSummaryCardsFromSurface(pageSurfaceById(consoleLayout, sourcePageId), model);
  }
  if (surface?.props?.surfaceFields) {
    return renderSurfaceTree(surface, consoleLayout, ctx);
  }
  if (surface?.props?.boardSource) {
    return renderAuthoredBoard(surface, model, ctx);
  }
  if (surface?.props?.listSource) {
    return renderAuthoredListSection(surface, model, ctx);
  }
  if (surface?.props?.tableSource) {
    return renderAuthoredTableSection(surface, model, ctx);
  }
  if (surface?.props?.formId && surface?.props?.formFields) {
    return renderAuthoredFormSection(surface, model);
  }
  if (surface?.props?.propertyValues && surface?.props?.propertyFields) {
    return renderAuthoredStaticPropertySection(surface);
  }
  if (surface?.props?.detailSource) {
    return renderAuthoredDetailSourceSection(surface, model, ctx);
  }
  switch (surface?.name) {
    default:
      return `
        <section class="card" data-platform-rvm-view="${esc(surface?.name || "unknown")}">
          <h2>${esc(surface?.title || surface?.name || "Surface")}</h2>
          <div class="muted">${esc(surface?.summary || "No renderer is attached to this authored surface yet.")}</div>
        </section>
      `;
  }
}

function surfaceNeedsClientScript(surface) {
  if (!surface) return false;
  if (optionalText(surface?.props?.clientAction)) return true;
  return (surface.childSurfaces ?? []).some(child => surfaceNeedsClientScript(child));
}

function pageNeedsClientScript(pageSurface) {
  return surfaceNeedsClientScript(pageSurface);
}

function renderPageFromSurface(pageSurface, model, ctx, consoleLayout) {
  const sections = (pageSurface?.childSurfaces ?? []).map(surface => renderSurfaceSection(surface, model, ctx, consoleLayout)).join("");
  return `
    ${renderSummaryCardsFromSurface(pageSurface, model)}
    ${sections}
    ${pageNeedsClientScript(pageSurface) ? renderAuthoringClientScript() : ""}
  `;
}

export function renderPlatformPage(model, { requestUrl = null } = {}) {
  const consoleLayout = readPlatformConsoleLayout();
  const rawCtx = parsePlatformPageRequest(requestUrl);
  const pageViews = authoredPageViews(consoleLayout);
  const currentView = pageDef(rawCtx.requestedView, pageViews);
  const ctx = {
    ...rawCtx,
    view: currentView.id
  };
  const consolePage = consoleLayout.page ?? { title: "Platform Console", summary: "" };
  const pageModel = filterPlatformModel(model, surfaceModelView(currentView.surface), ctx.id);
  const body = renderPageFromSurface(currentView.surface ?? null, pageModel, ctx, consoleLayout);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(consolePage.title || "Platform Console")} - ${esc(currentView.title)}</title>
  <style>${renderPlatformConsoleCss()}</style>
</head>
<body class="${esc(consolePage.className || "platform-console")}">
  <header>
    <h1>${esc(consolePage.title || "Platform Console")}</h1>
    <div class="muted">${esc(currentView.subtitle || consolePage.summary || "Platform self-inspection")}</div>
  </header>
  <main>
    ${renderNav(ctx, pageViews)}
    ${body}
  </main>
</body>
</html>`;
}
