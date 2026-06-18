import { renderPlatformConsoleCss } from "./platform-style.js";
import { readPlatformConsoleLayout } from "./platform-console-layout.js";

const FALLBACK_PLATFORM_PAGE_VIEWS = Object.freeze([
  Object.freeze({ id: "overview", title: "Overview", subtitle: "Counts, authored surfaces, lifecycle, and quick links." }),
  Object.freeze({ id: "workflow", title: "Workflow", subtitle: "Branches, change sets, proposals, and authoring commands." }),
  Object.freeze({ id: "verification", title: "Verification", subtitle: "Test gates, test runs, candidate snapshots, and runtime revisions." }),
  Object.freeze({ id: "knowledge", title: "Knowledge", subtitle: "Governed docs, roadmap tasks, epics, and features." }),
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
  return {
    url,
    requestedView: optionalText(url.searchParams.get("view")) || "overview",
    id: optionalText(url.searchParams.get("id")),
    offset: safeInteger(url.searchParams.get("offset"), 0),
    limit: clampPageSize(url.searchParams.get("limit"))
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

function countByKind(model, kind) {
  return (model?.nodes ?? []).filter(node => node.kind === kind).length;
}

function paginateRows(rows, ctx) {
  const total = Array.isArray(rows) ? rows.length : 0;
  if (!total) {
    return { items: [], total: 0, offset: 0, limit: ctx.limit, nextOffset: null, prevOffset: null };
  }
  const maxOffset = Math.max(0, total - 1);
  const offset = Math.min(ctx.offset, maxOffset);
  const limit = Math.max(1, ctx.limit);
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
    ? platformHref(ctx, ctx.view, { id: ctx.id, offset: Math.max(0, offset - limit), limit })
    : null;
  const nextHref = offset + limit < total
    ? platformHref(ctx, ctx.view, { id: ctx.id, offset: offset + limit, limit })
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

function renderLongTailProperties(ctx, record, usedKeys = []) {
  const used = new Set(usedKeys);
  const entries = Object.entries(record ?? {})
    .filter(([key, value]) => !used.has(key) && value !== undefined && value !== null && value !== "")
    .filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0 && value.every(item => item === null || ["string", "number", "boolean"].includes(typeof item));
      return ["string", "number", "boolean"].includes(typeof value);
    })
    .map(([key, value]) => ({
      label: humanizeKey(key),
      valueHtml: renderValue(ctx, value)
    }));
  return renderPropertyTable("Properties", entries);
}

function renderLinksCard(title, ctx, values = []) {
  const items = uniqueStrings(values)
    .map(value => `<li>${renderConceptLink(ctx, value)}${conceptApiHref(value) ? ` <span class="muted">(${renderApiLink(value)})</span>` : ""}</li>`)
    .join("");
  return `
    <div class="card">
      <h3>${esc(title)}</h3>
      ${items ? `<ul>${items}</ul>` : `<div class="muted">No linked resources.</div>`}
    </div>
  `;
}

function renderTextListCard(title, values = []) {
  const items = uniqueStrings(values).map(value => `<li>${esc(value)}</li>`).join("");
  return `
    <div class="card">
      <h3>${esc(title)}</h3>
      ${items ? `<ul>${items}</ul>` : `<div class="muted">No entries.</div>`}
    </div>
  `;
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

function renderDataTable(title, headers, rows, emptyMessage = "No rows.") {
  return `
    <section>
      <h2>${esc(title)}</h2>
      ${renderTable(headers, rows, emptyMessage)}
    </section>
  `;
}

function renderLifecycleBoard(surface, model) {
  const lifecycle = model.lifecycleVocabulary ?? [];
  const nodes = model.nodes ?? [];
  return renderSurfaceFrame(surface, `
    <div class="board">
      ${lifecycle.map(step => `
        <section class="platform-column" data-platform-lifecycle="${esc(step)}">
          <h3>${esc(step)}</h3>
          ${nodes
            .filter(node => (node.lifecycle ?? []).includes(step))
            .slice(0, 14)
            .map(node => `<div class="platform-chip">${renderConceptLink({ url: new URL("http://platform.local/platform?view=model") }, node.id, node.title)} <span>${esc(node.kind)}</span></div>`)
            .join("")}
        </section>
      `).join("")}
    </div>
  `);
}

function renderBranchBoard(surface, model, ctx) {
  const branchBoard = model.branchBoard ?? [];
  return renderSurfaceFrame(surface, `
    <div class="board">
      ${branchBoard.map(lane => `
        <section class="platform-column" data-branch-lane="${esc(lane.id)}">
          <h3>${esc(lane.title)}</h3>
          <div class="muted">${esc(lane.count)} branch${lane.count === 1 ? "" : "es"}</div>
          ${lane.branches.map(branch => `
            <div class="platform-chip">
              ${renderConceptLink(ctx, branch.id, branch.title || branch.id)}
              <span>${esc(branch.status)}</span>
              <div class="muted">change sets ${esc(branch.changeSetCount)}${branch.reviewProposalCount ? `, review ${esc(branch.reviewProposalCount)}` : ""}</div>
            </div>
          `).join("")}
        </section>
      `).join("")}
    </div>
  `);
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
      ${(consoleLayout.children ?? []).map(childSurface => `
        <div class="card" data-platform-rvm-view="${esc(childSurface.name)}" data-platform-rvm-kind="${esc(childSurface.surfaceKind || "")}">
          <div><strong>${esc(childSurface.title || childSurface.name)}</strong></div>
          <div class="muted">${esc(childSurface.pageId || childSurface.name)}</div>
          <div class="muted">${esc(childSurface.surfaceKind || "surface")}${childSurface.className ? `, class ${esc(childSurface.className)}` : ""}</div>
          ${childSurface.processRoute ? `<div class="muted">Process: ${esc(childSurface.processRoute)}</div>` : ""}
          ${(childSurface.projectionRoutes ?? []).length ? `<div class="muted">Projection: ${esc(childSurface.projectionRoutes.join(", "))}</div>` : ""}
          ${childSurface.summary ? `<div class="muted">${esc(childSurface.summary)}</div>` : ""}
          ${(childSurface.childSurfaces ?? []).length ? `
            <div class="muted">Sections: ${(childSurface.childSurfaces ?? []).map(child => esc(child.title || child.name)).join(", ")}</div>
          ` : ""}
        </div>
      `).join("")}
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

function findWorkflowDetail(model, id) {
  if (!id) return (model.branches ?? [])[0] || (model.changeSets ?? [])[0] || (model.proposals ?? [])[0] || null;
  return (model.branches ?? []).find(branch => branch.id === id)
    || (model.changeSets ?? []).find(changeSet => changeSet.id === id)
    || (model.proposals ?? []).find(proposal => proposal.id === id)
    || null;
}

function findVerificationDetail(model, id) {
  if (!id) return (model.testGates ?? [])[0] || (model.runtimeRevisions ?? [])[0] || (model.testRuns ?? [])[0] || (model.candidateSnapshots ?? [])[0] || null;
  return (model.testGates ?? []).find(gate => gate.id === id)
    || (model.runtimeRevisions ?? []).find(revision => revision.id === id)
    || (model.testRuns ?? []).find(run => run.id === id)
    || (model.candidateSnapshots ?? []).find(snapshot => snapshot.id === id)
    || null;
}

function findKnowledgeDetail(model, id) {
  if (!id) return (model.docs ?? [])[0] || (model.roadmapTasks ?? [])[0] || (model.epics ?? [])[0] || (model.features ?? [])[0] || null;
  return (model.docs ?? []).find(doc => doc.path === id || doc.id === id)
    || (model.roadmapTasks ?? []).find(task => task.id === id)
    || (model.epics ?? []).find(epic => epic.id === id)
    || (model.features ?? []).find(feature => feature.id === id)
    || null;
}

function findSignalDetail(model, id) {
  const signalNodes = model.nodes ?? [];
  if (!id) return (model.gaps ?? [])[0] || signalNodes.find(node => node.kind === "telemetryMetric" || node.kind === "defectCluster" || node.kind === "boundary") || null;
  return (model.gaps ?? []).find(gap => gap.id === id)
    || signalNodes.find(node => node.id === id && (node.kind === "telemetryMetric" || node.kind === "defectCluster" || node.kind === "boundary"))
    || null;
}

function findModelDetail(model, id) {
  return (model.nodes ?? []).find(node => node.id === id) || (model.nodes ?? [])[0] || null;
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
  if (!detail) return `<div class="card"><h2>Detail</h2><div class="muted">No workflow rows are projected yet.</div></div>`;
  if (detail.id?.startsWith?.("branch:")) {
    const branch = detail;
    const snapshots = (model.candidateSnapshots ?? []).filter(snapshot => snapshot.branchId === branch.id).slice(0, 12);
    const usedKeys = ["id", "title", "status", "lifecycleLane", "owner", "parentBranchId", "epic", "feature", "defect", "runtimeProfile", "latestCandidateSnapshotId", "changeSetIds", "docsFreshness", "testRedGreen", "affectedSystemSummaries", "telemetryImpactSummaries"];
    return `
      <section class="grid2">
        <div>
          ${renderSurfaceFrame(primarySurface, `
            ${renderPropertyTable("Branch Detail", [
            { label: "Branch", valueHtml: renderConceptLink(ctx, branch.id) },
            { label: "Status", valueHtml: esc(branch.status || "") },
            { label: "Title", valueHtml: esc(branch.title || "") },
            { label: "Lane", valueHtml: esc(branch.lifecycleLane || "") },
            { label: "Owner", valueHtml: esc(branch.owner || "") },
            { label: "Parent", valueHtml: branch.parentBranchId ? renderConceptLink(ctx, branch.parentBranchId) : "" },
            { label: "Epic", valueHtml: branch.epic ? renderConceptLink(ctx, branch.epic) : "" },
            { label: "Feature", valueHtml: branch.feature ? renderConceptLink(ctx, branch.feature) : "" },
            { label: "Defect", valueHtml: branch.defect ? renderConceptLink(ctx, branch.defect) : "" },
            { label: "Runtime profile", valueHtml: esc(branch.runtimeProfile || "") },
            { label: "Docs freshness", valueHtml: esc(branch.docsFreshness?.status || "") },
            { label: "Red / green", valueHtml: esc(branch.testRedGreen?.status || "") },
            { label: "Latest candidate", valueHtml: branch.latestCandidateSnapshotId ? renderConceptLink(ctx, branch.latestCandidateSnapshotId) : "" },
            { label: "API resource", valueHtml: renderApiLink(branch.id) }
            ])}
            ${renderLongTailProperties(ctx, branch, usedKeys)}
          `)}
        </div>
        <div>
          ${renderSurfaceFrame(relatedSurface, `
            ${renderLinksCard("Change Sets", ctx, branch.changeSetIds ?? [])}
            ${renderTextListCard("Affected Systems", (branch.affectedSystemSummaries ?? []).map(summary => summary.label || summary.system || summary.id || ""))}
            ${renderTextListCard("Telemetry Impacts", (branch.telemetryImpactSummaries ?? []).map(summary => summary.label || summary.id || ""))}
          `)}
        </div>
      </section>
      ${renderSurfaceFrame(snapshotSurface, renderTable(["Status", "Snapshot", "Revision", "Change Set", "Errors"], snapshots.map(snapshot => `
        <tr>
          <td>${esc(snapshot.status || "")}</td>
          <td>${renderConceptLink(ctx, snapshot.id)}</td>
          <td>${esc(snapshot.revision ?? "")}</td>
          <td>${renderConceptLink(ctx, snapshot.changeSetId)}</td>
          <td>${esc(Array.isArray(snapshot.errors) ? snapshot.errors.length : 0)}</td>
        </tr>
      `), "No candidate snapshots for this branch."))}
    `;
  }
  if (detail.id?.startsWith?.("changeSet:") || detail.id?.startsWith?.("changeset.")) {
    const changeSet = detail;
    const edits = (model.changeSetEdits ?? []).filter(edit => edit.changeSetId === changeSet.id).slice(0, 20);
    const snapshots = (model.candidateSnapshots ?? []).filter(snapshot => snapshot.changeSetId === changeSet.id).slice(0, 12);
    const usedKeys = ["id", "title", "status", "branchId", "owner", "reason", "editCount", "latestCandidateSnapshotId", "testRedGreen", "changedPaths"];
    return `
      <section class="grid2">
        <div>
          ${renderSurfaceFrame(primarySurface, `
            ${renderPropertyTable("Change Set Detail", [
            { label: "Change set", valueHtml: renderConceptLink(ctx, changeSet.id) },
            { label: "Status", valueHtml: esc(changeSet.status || "") },
            { label: "Title", valueHtml: esc(changeSet.title || "") },
            { label: "Branch", valueHtml: changeSet.branchId ? renderConceptLink(ctx, changeSet.branchId) : "" },
            { label: "Owner", valueHtml: esc(changeSet.owner || "") },
            { label: "Reason", valueHtml: esc(changeSet.reason || "") },
            { label: "Edits", valueHtml: esc(changeSet.editCount ?? 0) },
            { label: "Red / green", valueHtml: esc(changeSet.testRedGreen?.status || "") },
            { label: "Latest candidate", valueHtml: changeSet.latestCandidateSnapshotId ? renderConceptLink(ctx, changeSet.latestCandidateSnapshotId) : "" },
            { label: "API resource", valueHtml: renderApiLink(changeSet.id) }
            ])}
            ${renderLongTailProperties(ctx, changeSet, usedKeys)}
          `)}
        </div>
        <div>
          ${renderSurfaceFrame(relatedSurface, `
            ${renderLinksCard("Changed Paths", ctx, changeSet.changedPaths ?? [])}
          `)}
        </div>
      </section>
      ${renderSurfaceFrame(editSurface, renderTable(["Path", "Language", "Previous Hash", "Next Hash"], edits.map(edit => `
        <tr>
          <td>${esc(edit.path || "")}</td>
          <td>${esc(edit.sourceLanguage || "")}</td>
          <td>${esc(edit.previousHash ? String(edit.previousHash).slice(0, 12) : "")}</td>
          <td>${esc(edit.nextHash ? String(edit.nextHash).slice(0, 12) : "")}</td>
        </tr>
      `), "No staged edits."))}
      ${renderSurfaceFrame(snapshotSurface, renderTable(["Status", "Snapshot", "Revision", "Errors"], snapshots.map(snapshot => `
        <tr>
          <td>${esc(snapshot.status || "")}</td>
          <td>${renderConceptLink(ctx, snapshot.id)}</td>
          <td>${esc(snapshot.revision ?? "")}</td>
          <td>${esc(Array.isArray(snapshot.errors) ? snapshot.errors.length : 0)}</td>
        </tr>
      `), "No candidate snapshots for this change set."))}
    `;
  }
  const proposal = detail;
  const usedKeys = ["id", "status", "targetProcess", "targetId", "reason", "action"];
  return `
    <section class="grid2">
      <div>
        ${renderSurfaceFrame(primarySurface, `
          ${renderPropertyTable("Proposal Detail", [
          { label: "Proposal", valueHtml: renderConceptLink(ctx, proposal.id) },
          { label: "Status", valueHtml: esc(proposal.status || "") },
          { label: "Target process", valueHtml: esc(proposal.targetProcess || "") },
          { label: "Target", valueHtml: proposal.targetId ? renderConceptLink(ctx, proposal.targetId) : "" },
          { label: "Reason", valueHtml: esc(proposal.reason || "") },
          { label: "API resource", valueHtml: renderApiLink(proposal.id) }
          ])}
          ${renderLongTailProperties(ctx, proposal, usedKeys)}
        `)}
      </div>
      <div>
        ${renderSurfaceFrame(relatedSurface, `
          ${renderLinksCard("Target Resource", ctx, proposal.targetId ? [proposal.targetId] : [])}
        `)}
      </div>
    </section>
  `;
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
  if (!detail) return `<div class="card"><h2>Detail</h2><div class="muted">No verification rows are projected yet.</div></div>`;
  if (detail.id?.startsWith?.("gate:")) {
    const gate = detail;
    const runs = (model.testRuns ?? []).filter(run => run.gateId === gate.id).slice(0, 12);
    const usedKeys = ["id", "title", "runner", "environment", "timeoutMs", "costEstimate", "command", "protectedObjects", "selectedByBranches", "selectedByChangeSets", "lastResult"];
    return `
      <section class="grid2">
        <div>
          ${renderSurfaceFrame(primarySurface, `
            ${renderPropertyTable("Test Gate Detail", [
            { label: "Gate", valueHtml: renderConceptLink(ctx, gate.id, gate.title || gate.id) },
            { label: "Runner", valueHtml: esc(gate.runner || "") },
            { label: "Environment", valueHtml: esc(gate.environment || "") },
            { label: "Timeout", valueHtml: esc(gate.timeoutMs ?? "") },
            { label: "Cost", valueHtml: esc(gate.costEstimate || "") },
            { label: "Command", valueHtml: esc(gate.command || "") },
            { label: "Latest result", valueHtml: esc(gate.lastResult ? `${gate.lastResult.status} (${gate.lastResult.exitCode ?? "n/a"})` : "idle") },
            { label: "API resource", valueHtml: renderApiLink(gate.id) }
            ])}
            ${renderLongTailProperties(ctx, gate, usedKeys)}
          `)}
        </div>
        <div>
          ${renderSurfaceFrame(relatedSurface, `
            ${renderLinksCard("Protected Objects", ctx, gate.protectedObjects ?? [])}
            ${renderLinksCard("Selected Branches", ctx, gate.selectedByBranches ?? [])}
            ${renderLinksCard("Selected Change Sets", ctx, gate.selectedByChangeSets ?? [])}
          `)}
        </div>
      </section>
      ${renderSurfaceFrame(runHistorySurface, renderTable(["Status", "Run", "Branch", "Duration", "Exit"], runs.map(run => `
        <tr>
          <td>${esc(run.status || "")}</td>
          <td>${renderConceptLink(ctx, run.id)}</td>
          <td>${run.branchId ? renderConceptLink(ctx, run.branchId) : ""}</td>
          <td>${esc(run.durationMs ?? "")}</td>
          <td>${esc(run.exitCode ?? "")}</td>
        </tr>
      `), "No runs for this gate yet."))}
    `;
  }
  if (detail.id?.startsWith?.("runtimeRevision:") || detail.id?.startsWith?.("backendRevision:") || detail.id?.startsWith?.("frontendRevision:")) {
    const revision = detail;
    const builds = (model.snapshotBuilds ?? []).filter(build => Number(build.revision || 0) === Number(revision.revision || 0)).slice(0, 12);
    const errors = (model.snapshotBuildErrors ?? []).filter(error => Number(error.revision || 0) === Number(revision.revision || 0)).slice(0, 12);
    const usedKeys = ["id", "revision", "status", "trigger", "branchId", "changeSetId", "changedSources", "candidateBranchCount", "buildErrorCount"];
    return `
      <section class="grid2">
        <div>
          ${renderSurfaceFrame(primarySurface, `
            ${renderPropertyTable("Runtime Revision Detail", [
            { label: "Revision", valueHtml: renderConceptLink(ctx, revision.id, `Revision ${revision.revision}`) },
            { label: "Status", valueHtml: esc(revision.status || "") },
            { label: "Trigger", valueHtml: esc(revision.trigger || "") },
            { label: "Branch", valueHtml: revision.branchId ? renderConceptLink(ctx, revision.branchId) : "" },
            { label: "Change set", valueHtml: revision.changeSetId ? renderConceptLink(ctx, revision.changeSetId) : "" },
            { label: "Changed sources", valueHtml: esc((revision.changedSources ?? []).length) },
            { label: "Build errors", valueHtml: esc(revision.buildErrorCount ?? 0) },
            { label: "API resource", valueHtml: renderApiLink(revision.id) }
            ])}
            ${renderLongTailProperties(ctx, revision, usedKeys)}
          `)}
        </div>
        <div>
          ${renderSurfaceFrame(relatedSurface, `
            ${renderLinksCard("Changed Sources", ctx, revision.changedSources ?? [])}
            ${renderPropertyTable("Snapshot Diagnostics", [
              { label: "Active revision", valueHtml: esc(model.snapshotDiagnostics?.appRevision ?? "") },
              { label: "Last good", valueHtml: esc(model.snapshotDiagnostics?.lastGoodAppRevision ?? "") },
              { label: "Pending dirty", valueHtml: esc((model.snapshotDiagnostics?.pendingDirtySources ?? []).length) },
              { label: "Backend stream", valueHtml: `<a href="/api/runtime/backend-revisions/events">Event stream</a>` }
            ])}
          `)}
        </div>
      </section>
      ${renderSurfaceFrame(buildHistorySurface, renderTable(["Status", "Build", "Candidate Snapshot", "Branch", "Errors"], builds.map(build => `
        <tr>
          <td>${esc(build.status || "")}</td>
          <td>${esc(build.id || "")}</td>
          <td>${build.candidateSnapshotId ? renderConceptLink(ctx, build.candidateSnapshotId) : ""}</td>
          <td>${build.branchId ? renderConceptLink(ctx, build.branchId) : ""}</td>
          <td>${esc(build.errorCount ?? 0)}</td>
        </tr>
      `), "No snapshot builds for this revision."))}
      ${renderSurfaceFrame(buildErrorsSurface, renderTable(["Build", "Path", "Kind", "Message"], errors.map(error => `
        <tr>
          <td>${esc(error.snapshotBuildId || "")}</td>
          <td>${esc(error.path || "")}</td>
          <td>${esc(error.kind || "")}</td>
          <td>${esc(error.message || "")}</td>
        </tr>
      `), "No build errors for this revision."))}
    `;
  }
  if (detail.id?.startsWith?.("candidateSnapshot:")) {
    const snapshot = detail;
    const usedKeys = ["id", "status", "branchId", "changeSetId", "revision", "files", "errors"];
    return `
      <section class="grid2">
        <div>
          ${renderSurfaceFrame(primarySurface, `
            ${renderPropertyTable("Candidate Snapshot Detail", [
            { label: "Snapshot", valueHtml: renderConceptLink(ctx, snapshot.id) },
            { label: "Status", valueHtml: esc(snapshot.status || "") },
            { label: "Branch", valueHtml: snapshot.branchId ? renderConceptLink(ctx, snapshot.branchId) : "" },
            { label: "Change set", valueHtml: snapshot.changeSetId ? renderConceptLink(ctx, snapshot.changeSetId) : "" },
            { label: "Revision", valueHtml: esc(snapshot.revision ?? "") },
            { label: "API resource", valueHtml: renderApiLink(snapshot.id) }
            ])}
            ${renderLongTailProperties(ctx, snapshot, usedKeys)}
          `)}
        </div>
        <div>
          ${renderSurfaceFrame(relatedSurface, `
            ${renderTextListCard("Files", (snapshot.files ?? []).map(file => file.path || ""))}
            ${renderTextListCard("Errors", (snapshot.errors ?? []).map(error => `${error.kind || "error"}: ${error.message || ""}`))}
          `)}
        </div>
      </section>
    `;
  }
  const run = detail;
  const usedKeys = ["id", "title", "status", "gateId", "branchId", "changeSetId", "candidateSnapshotId", "durationMs", "exitCode", "startedAt", "finishedAt"];
  return `
    <section class="grid2">
      <div>
        ${renderSurfaceFrame(primarySurface, `
          ${renderPropertyTable("Test Run Detail", [
          { label: "Run", valueHtml: renderConceptLink(ctx, run.id) },
          { label: "Status", valueHtml: esc(run.status || "") },
          { label: "Gate", valueHtml: run.gateId ? renderConceptLink(ctx, run.gateId, run.title || run.gateId) : esc(run.title || "") },
          { label: "Branch", valueHtml: run.branchId ? renderConceptLink(ctx, run.branchId) : "" },
          { label: "Change set", valueHtml: run.changeSetId ? renderConceptLink(ctx, run.changeSetId) : "" },
          { label: "Candidate snapshot", valueHtml: run.candidateSnapshotId ? renderConceptLink(ctx, run.candidateSnapshotId) : "" },
          { label: "Duration", valueHtml: esc(run.durationMs ?? "") },
          { label: "Exit", valueHtml: esc(run.exitCode ?? "") },
          { label: "API resource", valueHtml: renderApiLink(run.id) }
          ])}
          ${renderLongTailProperties(ctx, run, usedKeys)}
        `)}
      </div>
      <div>
        ${renderSurfaceFrame(relatedSurface, `
          ${renderPropertyTable("Verification Streams", [
            { label: "Test events", valueHtml: `<a href="/api/platform-test-runs/events">Test run event stream</a>` },
            { label: "Backend revisions", valueHtml: `<a href="/api/runtime/backend-revisions/events">Backend revision stream</a>` }
          ])}
        `)}
      </div>
    </section>
  `;
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
  if (!detail) return `<div class="card"><h2>Detail</h2><div class="muted">No knowledge rows are projected yet.</div></div>`;
  if (detail.path) {
    const doc = detail;
    const sections = (model.docSections ?? []).filter(section => section.doc === doc.path).slice(0, 20);
    const tasks = (model.docTasks ?? []).filter(task => task.doc === doc.path).slice(0, 20);
    const usedKeys = ["id", "path", "role", "owner", "status", "freshness", "sectionCount", "taskCount", "references"];
    return `
      <section class="grid2">
        <div>
          ${renderSurfaceFrame(primarySurface, `
            ${renderPropertyTable("Document Detail", [
            { label: "Document", valueHtml: renderConceptLink(ctx, doc.path, doc.path) },
            { label: "Role", valueHtml: esc(doc.role || "") },
            { label: "Owner", valueHtml: esc(doc.owner || "") },
            { label: "Status", valueHtml: esc(doc.status || "") },
            { label: "Freshness", valueHtml: esc(doc.freshness?.status || "") },
            { label: "Sections", valueHtml: esc(doc.sectionCount ?? 0) },
            { label: "Tasks", valueHtml: esc(doc.taskCount ?? 0) },
            { label: "API resource", valueHtml: renderApiLink(doc.path) }
            ])}
            ${renderLongTailProperties(ctx, doc, usedKeys)}
          `)}
        </div>
        <div>
          ${renderSurfaceFrame(relatedSurface, `
            ${renderLinksCard("Referenced Routes", ctx, doc.references?.routes ?? [])}
            ${renderLinksCard("Referenced Plugins", ctx, doc.references?.pluginIds ?? [])}
            ${renderLinksCard("Referenced Files", ctx, doc.references?.filePaths ?? [])}
          `)}
        </div>
      </section>
      ${renderSurfaceFrame(sectionsSurface, renderTable(["Title", "Line", "Depth"], sections.map(section => `
        <tr>
          <td>${esc(section.title || "")}</td>
          <td>${esc(section.line ?? "")}</td>
          <td>${esc(section.depth ?? "")}</td>
        </tr>
      `), "No sections projected for this document."))}
      ${renderSurfaceFrame(tasksSurface, renderTable(["Status", "Task", "Line", "Section"], tasks.map(task => `
        <tr>
          <td>${esc(task.status || "")}</td>
          <td>${task.id ? renderConceptLink(ctx, task.id, task.title || task.id) : esc(task.title || "")}</td>
          <td>${esc(task.line ?? "")}</td>
          <td>${esc(task.section || "")}</td>
        </tr>
      `), "No tasks projected for this document."))}
    `;
  }
  if (detail.id?.startsWith?.("roadmapTask:") || detail.doc) {
    const task = detail;
    const usedKeys = ["id", "title", "status", "derivedStatus", "section", "doc", "line", "targets", "derivedSummary", "evidence"];
    return `
      <section class="grid2">
        <div>
          ${renderSurfaceFrame(primarySurface, `
            ${renderPropertyTable("Roadmap Task Detail", [
            { label: "Task", valueHtml: renderConceptLink(ctx, task.id, task.title || task.id) },
            { label: "Markdown status", valueHtml: esc(task.status || "") },
            { label: "Derived status", valueHtml: esc(task.derivedStatus || "") },
            { label: "Section", valueHtml: esc(task.section || "") },
            { label: "Document", valueHtml: task.doc ? renderConceptLink(ctx, task.doc, task.doc) : "" },
            { label: "Line", valueHtml: esc(task.line ?? "") },
            { label: "Evidence", valueHtml: esc(task.derivedSummary || task.evidence?.summary || "") },
            { label: "API resource", valueHtml: renderApiLink(task.id) }
            ])}
            ${renderLongTailProperties(ctx, task, usedKeys)}
          `)}
        </div>
        <div>
          ${renderSurfaceFrame(relatedSurface, `
            ${renderLinksCard("Linked Targets", ctx, (task.targets ?? []).map(target => target.targetId || target.id || "").filter(Boolean))}
          `)}
        </div>
      </section>
      ${renderSurfaceFrame(relationshipsSurface, renderTable(["From", "Relation", "To"], [], "No related relationships."))}
    `;
  }
  if (detail.id?.startsWith?.("epic:")) {
    const epic = detail;
    const usedKeys = ["id", "title", "status", "roadmapId", "branchIds", "featureIds", "gateIds", "docIds", "defectClusterIds"];
    return `
      <section class="grid2">
        <div>
          ${renderSurfaceFrame(primarySurface, `
            ${renderPropertyTable("Epic Detail", [
            { label: "Epic", valueHtml: renderConceptLink(ctx, epic.id, epic.title || epic.id) },
            { label: "Status", valueHtml: esc(epic.status || "") },
            { label: "Roadmap", valueHtml: epic.roadmapId ? renderConceptLink(ctx, epic.roadmapId) : "" },
            { label: "Branches", valueHtml: esc((epic.branchIds ?? []).length) },
            { label: "Features", valueHtml: esc((epic.featureIds ?? []).length) },
            { label: "Verification gates", valueHtml: esc((epic.gateIds ?? []).length) },
            { label: "Docs", valueHtml: esc((epic.docIds ?? []).length) },
            { label: "API resource", valueHtml: renderApiLink(epic.id) }
            ])}
            ${renderLongTailProperties(ctx, epic, usedKeys)}
          `)}
        </div>
        <div>
          ${renderSurfaceFrame(relatedSurface, `
            ${renderLinksCard("Branches", ctx, epic.branchIds ?? [])}
            ${renderLinksCard("Features", ctx, epic.featureIds ?? [])}
            ${renderLinksCard("Verification Gates", ctx, epic.gateIds ?? [])}
            ${renderLinksCard("Docs", ctx, epic.docIds ?? [])}
          `)}
        </div>
      </section>
    `;
  }
  const feature = detail;
  const usedKeys = ["id", "title", "status", "epicId", "branchIds", "gateIds", "docIds", "defectClusterIds"];
  return `
    <section class="grid2">
      <div>
        ${renderSurfaceFrame(primarySurface, `
          ${renderPropertyTable("Feature Detail", [
          { label: "Feature", valueHtml: renderConceptLink(ctx, feature.id, feature.title || feature.id) },
          { label: "Status", valueHtml: esc(feature.status || "") },
          { label: "Epic", valueHtml: feature.epicId ? renderConceptLink(ctx, feature.epicId) : "" },
          { label: "Branches", valueHtml: esc((feature.branchIds ?? []).length) },
          { label: "Verification gates", valueHtml: esc((feature.gateIds ?? []).length) },
          { label: "Docs", valueHtml: esc((feature.docIds ?? []).length) },
          { label: "API resource", valueHtml: renderApiLink(feature.id) }
          ])}
          ${renderLongTailProperties(ctx, feature, usedKeys)}
        `)}
      </div>
      <div>
        ${renderSurfaceFrame(relatedSurface, `
          ${renderLinksCard("Branches", ctx, feature.branchIds ?? [])}
          ${renderLinksCard("Verification Gates", ctx, feature.gateIds ?? [])}
          ${renderLinksCard("Docs", ctx, feature.docIds ?? [])}
        `)}
      </div>
    </section>
  `;
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
  if (!detail) return `<div class="card"><h2>Detail</h2><div class="muted">No signal rows are projected yet.</div></div>`;
  if (detail.kind) {
    const gap = detail;
    const usedKeys = ["id", "severity", "kind", "target", "reason", "recommendedProposal", "missingInGenerated", "extraInGenerated"];
    return `
      <section class="grid2">
        <div>
          ${renderSurfaceFrame(primarySurface, `
            ${renderPropertyTable("Gap Detail", [
            { label: "Gap", valueHtml: esc(gap.id || "") },
            { label: "Severity", valueHtml: esc(gap.severity || "") },
            { label: "Kind", valueHtml: esc(gap.kind || "") },
            { label: "Target", valueHtml: gap.target ? renderConceptLink(ctx, gap.target) : "" },
            { label: "Reason", valueHtml: esc(gap.reason || "") },
            { label: "API resource", valueHtml: renderApiLink(gap.id) }
            ])}
            ${renderLongTailProperties(ctx, gap, usedKeys)}
          `)}
        </div>
        <div>
          ${renderSurfaceFrame(relatedSurface, `
            ${renderLinksCard("Recommended Proposal", ctx, gap.recommendedProposal ? [gap.recommendedProposal] : [])}
            ${renderTextListCard("Missing In Generated", gap.missingInGenerated ?? [])}
            ${renderTextListCard("Extra In Generated", gap.extraInGenerated ?? [])}
          `)}
        </div>
      </section>
      ${renderSurfaceFrame(relationshipsSurface, renderTable(["From", "Relation", "To"], [], "No related relationships."))}
    `;
  }
  const node = detail;
  const relatedEdges = (model.edges ?? []).filter(edge => edge.from === node.id || edge.to === node.id).slice(0, 20);
  const usedKeys = ["id", "kind", "title", "status", "owner", "source", "lifecycle"];
  return `
    <section class="grid2">
      <div>
        ${renderSurfaceFrame(primarySurface, `
          ${renderPropertyTable("Signal Detail", [
          { label: "Node", valueHtml: renderConceptLink(ctx, node.id, node.title || node.id) },
          { label: "Kind", valueHtml: esc(node.kind || "") },
          { label: "Status", valueHtml: esc(node.status || "") },
          { label: "Owner", valueHtml: esc(node.owner || "") },
          { label: "Source", valueHtml: esc(node.source || "") },
          { label: "Lifecycle", valueHtml: esc((node.lifecycle ?? []).join(", ")) },
          { label: "API resource", valueHtml: renderApiLink(node.id) }
          ])}
          ${renderLongTailProperties(ctx, node, usedKeys)}
        `)}
      </div>
      <div>
        ${renderSurfaceFrame(relationshipsSurface, renderTable(["From", "Relation", "To"], relatedEdges.map(edge => `
          <tr>
            <td>${renderConceptLink(ctx, edge.from)}</td>
            <td>${esc(edge.rel || "")}</td>
            <td>${renderConceptLink(ctx, edge.to)}</td>
          </tr>
        `), "No related relationships."))}
      </div>
    </section>
  `;
}

function renderModelDetail(node, model, ctx) {
  if (!node) return `<div class="card"><h2>Detail</h2><div class="muted">No platform objects are projected yet.</div></div>`;
  const relatedEdges = (model.edges ?? []).filter(edge => edge.from === node.id || edge.to === node.id).slice(0, 20);
  const usedKeys = ["id", "kind", "title", "status", "owner", "source", "lifecycle"];
  return `
    <section class="grid2">
      <div>
        ${renderPropertyTable("Platform Object Detail", [
          { label: "Object", valueHtml: renderConceptLink(ctx, node.id, node.title || node.id) },
          { label: "Kind", valueHtml: esc(node.kind || "") },
          { label: "Status", valueHtml: esc(node.status || "") },
          { label: "Owner", valueHtml: esc(node.owner || "") },
          { label: "Source", valueHtml: esc(node.source || "") },
          { label: "Lifecycle", valueHtml: esc((node.lifecycle ?? []).join(", ")) },
          { label: "API resource", valueHtml: renderApiLink(node.id) }
        ])}
        ${renderLongTailProperties(ctx, node, usedKeys)}
      </div>
      <div>
        ${renderDataTable("Relationships", ["From", "Relation", "To"], relatedEdges.map(edge => `
          <tr>
            <td>${renderConceptLink(ctx, edge.from)}</td>
            <td>${esc(edge.rel || "")}</td>
            <td>${renderConceptLink(ctx, edge.to)}</td>
          </tr>
        `), "No relationships for this object.")}
      </div>
    </section>
  `;
}

function summaryCardsForPage(pageId, model) {
  switch (pageId) {
    case "workflow":
      return renderSummaryCards([
        { label: "Branches", value: (model.branches ?? []).length },
        { label: "Change Sets", value: (model.changeSets ?? []).length },
        { label: "Open Proposals", value: (model.proposals ?? []).filter(proposal => proposal.status === "open").length },
        { label: "Candidate Snapshots", value: (model.candidateSnapshots ?? []).length }
      ]);
    case "verification":
      return renderSummaryCards([
        { label: "Test Gates", value: (model.testGates ?? []).length },
        { label: "Test Runs", value: (model.testRuns ?? []).length },
        { label: "Runtime Revisions", value: (model.runtimeRevisions ?? []).length },
        { label: "Snapshot Builds", value: (model.snapshotBuilds ?? []).length }
      ]);
    case "knowledge":
      return renderSummaryCards([
        { label: "Governed Docs", value: (model.docs ?? []).length },
        { label: "Roadmap Tasks", value: (model.roadmapTasks ?? []).length },
        { label: "Epics", value: (model.epics ?? []).length },
        { label: "Features", value: (model.features ?? []).length }
      ]);
    case "signals":
      return renderSummaryCards([
        { label: "Gaps", value: (model.gaps ?? []).length },
        { label: "Telemetry Metrics", value: (model.nodes ?? []).filter(node => node.kind === "telemetryMetric").length },
        { label: "Defect Clusters", value: (model.nodes ?? []).filter(node => node.kind === "defectCluster").length },
        { label: "Boundaries", value: (model.nodes ?? []).filter(node => node.kind === "boundary").length }
      ]);
    case "model":
      return renderSummaryCards([
        { label: "Platform Objects", value: (model.nodes ?? []).length },
        { label: "Relationships", value: (model.edges ?? []).length },
        { label: "Profiles", value: (model.profiles ?? []).length },
        { label: "Coverage Edges", value: (model.coverageEdges ?? []).length }
      ]);
    default:
      return renderSummaryCards([
        { label: "Plugins", value: countByKind(model, "plugin") },
        { label: "Bundles", value: countByKind(model, "bundle") },
        { label: "Handlers", value: countByKind(model, "handler") },
        { label: "Routes", value: countByKind(model, "route") },
        { label: "Docs", value: (model.docs ?? []).length },
        { label: "Change Sets", value: (model.changeSets ?? []).length },
        { label: "Test Gates", value: (model.testGates ?? []).length },
        { label: "Gaps", value: (model.gaps ?? []).length }
      ]);
  }
}

function renderPlatformMapSection(surface, model, ctx) {
  const topNodes = (model.nodes ?? []).slice(0, 12);
  return renderSurfaceFrame(surface, renderTable(["Kind", "Resource", "Lifecycle", "Status", "Source"], topNodes.map(node => `
    <tr>
      <td>${esc(node.kind || "")}</td>
      <td>${renderConceptLink(ctx, node.id, node.title || node.id)}</td>
      <td>${esc((node.lifecycle ?? []).join(", "))}</td>
      <td>${esc(node.status || "")}</td>
      <td>${esc(node.source || "")}</td>
    </tr>
  `), "No platform objects."));
}

function renderProfileComparisonSection(surface, model) {
  return renderSurfaceFrame(surface, renderTable(["Profile", "Status", "Plugins", "Capabilities"], (model.profiles ?? []).slice(0, 12).map(profile => `
    <tr>
      <td>${esc(profile.id || "")}</td>
      <td>${esc(profile.status || "")}</td>
      <td>${esc((profile.pluginIds ?? []).length)}</td>
      <td>${esc((profile.capabilities ?? []).length)}</td>
    </tr>
  `), "No runtime profiles."));
}

function renderWorkflowListSection(surface, model, ctx) {
  const items = workflowItems(model);
  const page = paginateRows(items, ctx);
  return renderSurfaceFrame(surface, `
    ${renderTable(["Kind", "Status", "Resource", "Scope", "Summary"], page.items.map(item => `
      <tr>
        <td>${esc(item.pageKind)}</td>
        <td>${esc(item.status || "")}</td>
        <td>${renderConceptLink(ctx, item.id, item.title)}</td>
        <td>${item.scope ? renderValue(ctx, item.scope) : ""}</td>
        <td>${esc(item.summary || "")}</td>
      </tr>
    `), "No workflow rows.")}
    ${renderPagination(ctx, page.total, page.offset, page.limit)}
  `);
}

function renderVerificationListSection(surface, model, ctx) {
  const items = verificationItems(model);
  const page = paginateRows(items, ctx);
  return renderSurfaceFrame(surface, `
    ${renderTable(["Kind", "Status", "Resource", "Scope", "Summary"], page.items.map(item => `
      <tr>
        <td>${esc(item.pageKind)}</td>
        <td>${esc(item.status || "")}</td>
        <td>${renderConceptLink(ctx, item.id, item.title)}</td>
        <td>${item.scope ? renderValue(ctx, item.scope) : ""}</td>
        <td>${esc(item.summary || "")}</td>
      </tr>
    `), "No verification rows.")}
    ${renderPagination(ctx, page.total, page.offset, page.limit)}
  `);
}

function renderKnowledgeListSection(surface, model, ctx) {
  const items = knowledgeItems(model);
  const page = paginateRows(items, ctx);
  return renderSurfaceFrame(surface, `
    ${renderTable(["Kind", "Status", "Resource", "Scope", "Summary"], page.items.map(item => `
      <tr>
        <td>${esc(item.pageKind)}</td>
        <td>${esc(item.status || "")}</td>
        <td>${renderConceptLink(ctx, item.id, item.title)}</td>
        <td>${item.scope ? renderValue(ctx, item.scope) : ""}</td>
        <td>${esc(item.summary || "")}</td>
      </tr>
    `), "No knowledge rows.")}
    ${renderPagination(ctx, page.total, page.offset, page.limit)}
  `);
}

function renderSignalsListSection(surface, model, ctx) {
  const items = signalItems(model);
  const page = paginateRows(items, ctx);
  return renderSurfaceFrame(surface, `
    ${renderTable(["Kind", "Status", "Resource", "Scope", "Summary"], page.items.map(item => `
      <tr>
        <td>${esc(item.pageKind)}</td>
        <td>${esc(item.status || "")}</td>
        <td>${renderConceptLink(ctx, item.id, item.title)}</td>
        <td>${item.scope ? renderValue(ctx, item.scope) : ""}</td>
        <td>${esc(item.summary || "")}</td>
      </tr>
    `), "No signal rows.")}
    ${renderPagination(ctx, page.total, page.offset, page.limit)}
  `);
}

function renderModelListSection(surface, model, ctx) {
  const items = modelItems(model);
  const page = paginateRows(items, ctx);
  return renderSurfaceFrame(surface, `
    ${renderTable(["Kind", "Status", "Resource", "Source", "Owner"], page.items.map(item => `
      <tr>
        <td>${esc(item.pageKind)}</td>
        <td>${esc(item.status || "")}</td>
        <td>${renderConceptLink(ctx, item.id, item.title)}</td>
        <td>${esc(item.scope || "")}</td>
        <td>${esc(item.summary || "")}</td>
      </tr>
    `), "No platform objects.")}
    ${renderPagination(ctx, page.total, page.offset, page.limit)}
  `);
}

function renderGapListSection(surface, model, ctx) {
  return renderSurfaceFrame(surface, renderTable(["Severity", "Kind", "Target", "Reason"], (model.gaps ?? []).slice(0, 12).map(gap => `
    <tr>
      <td>${esc(gap.severity || "")}</td>
      <td>${esc(gap.kind || "")}</td>
      <td>${gap.target ? renderConceptLink(ctx, gap.target) : ""}</td>
      <td>${esc(gap.reason || "")}</td>
    </tr>
  `), "No gaps."));
}

function renderCoverageMatrixSection(surface, model, ctx) {
  return renderSurfaceFrame(surface, renderTable(["Gate", "Target", "Kind"], (model.coverageEdges ?? []).slice(0, 12).map(edge => `
    <tr>
      <td>${renderConceptLink(ctx, edge.gateId)}</td>
      <td>${edge.targetId ? renderConceptLink(ctx, edge.targetId, edge.targetLabel || edge.targetId) : esc(edge.targetLabel || "")}</td>
      <td>${esc(edge.coverageKind || "")}</td>
    </tr>
  `), "No coverage edges."));
}

function renderProposalPanelSection(surface, model) {
  const proposalActions = model.proposalActions ?? [];
  const firstActionBody = JSON.stringify(proposalActions[0]?.sampleBody ?? {}, null, 2);
  return renderSurfaceFrame(surface, `
    <form id="platform-proposal-form">
      <label>Action
        <select name="action">
          ${proposalActions.map(action => `<option value="${esc(action.action)}" data-sample-body="${esc(JSON.stringify(action.sampleBody ?? {}))}">${esc(action.action)}</option>`).join("")}
        </select>
      </label>
      <label>Proposal id <input name="id" value="proposal.platform.${Date.now().toString(36)}"></label>
      <label>Target kind override <input name="targetKind" placeholder="derived from body"></label>
      <label>Target id override <input name="targetId" placeholder="derived from body"></label>
      <label>Reason <input name="reason" value="Platform stewardship change"></label>
      <label>Body JSON <textarea name="bodyJson">${esc(firstActionBody)}</textarea></label>
      <button type="submit">Create Proposal</button>
      <div id="proposal-status"></div>
    </form>
  `);
}

function renderProposalReviewPanelSection(surface, model) {
  const openProposals = (model.proposals ?? []).filter(proposal => proposal.status === "open");
  return renderSurfaceFrame(surface, `
    <form id="platform-review-form">
      <label>Open proposal
        <select name="id">
          ${openProposals.map(proposal => `<option value="${esc(proposal.id)}">${esc(proposal.id)}</option>`).join("")}
        </select>
      </label>
      <label>Reject reason <input name="reason" placeholder="Only used when rejecting"></label>
      <div style="display:flex; gap:8px;">
        <button type="submit" name="reviewAction" value="approve">Approve</button>
        <button type="submit" name="reviewAction" value="reject">Reject</button>
      </div>
      <div id="review-status"></div>
    </form>
  `);
}

function renderBranchCreatePanelSection(surface) {
  return renderSurfaceFrame(surface, `
      <form id="platform-branch-create-form">
        <label>Branch id <input name="id" value="branch:${Date.now().toString(36)}"></label>
        <label>Title <input name="title" value="Platform branch"></label>
        <label>Parent branch <input name="parentBranchId" placeholder="Optional parent branch id"></label>
        <label>Epic <input name="epic" placeholder="Optional epic tag"></label>
        <label>Feature <input name="feature" placeholder="Optional feature tag"></label>
        <label>Defect <input name="defect" placeholder="Optional defect tag"></label>
        <button type="submit">Create Branch</button>
        <div id="branch-create-status"></div>
      </form>
  `);
}

function renderChangeSetCreatePanelSection(surface) {
  return renderSurfaceFrame(surface, `
      <form id="platform-change-set-create-form">
        <label>Change set id <input name="id" value="changeSet:${Date.now().toString(36)}"></label>
        <label>Branch id <input name="branchId" value="branch:platform-console"></label>
        <label>Title <input name="title" value="Platform console change"></label>
        <label>Reason <input name="reason" value="Stage platform console edits"></label>
        <button type="submit">Create Change Set</button>
        <div id="change-set-create-status"></div>
      </form>
  `);
}

function renderChangeSetEditPanelSection(surface, model) {
  const changeSets = model.changeSets ?? [];
  return renderSurfaceFrame(surface, `
      <form id="platform-change-set-edit-form">
        <label>Change set
          <select name="changeSetId">
            ${changeSets.map(changeSet => `<option value="${esc(changeSet.id)}">${esc(changeSet.id)}</option>`).join("")}
          </select>
        </label>
        <label>Path <input name="path" value="plugins/platform/platform-console.rvm"></label>
        <label>Content <textarea name="content"></textarea></label>
        <button type="submit">Stage Edit</button>
        <div id="change-set-edit-status"></div>
      </form>
  `);
}

function renderChangeSetValidatePanelSection(surface, model) {
  const changeSets = model.changeSets ?? [];
  return renderSurfaceFrame(surface, `
      <form id="platform-change-set-validate-form">
        <label>Change set
          <select name="changeSetId">
            ${changeSets.map(changeSet => `<option value="${esc(changeSet.id)}">${esc(changeSet.id)}</option>`).join("")}
          </select>
        </label>
        <button type="submit">Validate Change Set</button>
        <div id="change-set-validate-status"></div>
      </form>
  `);
}

function renderChangeSetApplyPanelSection(surface, model) {
  const changeSets = model.changeSets ?? [];
  return renderSurfaceFrame(surface, `
      <form id="platform-change-set-apply-form">
        <label>Change set
          <select name="changeSetId">
            ${changeSets.map(changeSet => `<option value="${esc(changeSet.id)}">${esc(changeSet.id)}</option>`).join("")}
          </select>
        </label>
        <button type="submit">Apply Change Set</button>
        <div id="change-set-apply-status"></div>
      </form>
  `);
}

function renderChangeSetLifecyclePanelSection(surface, model) {
  const changeSets = model.changeSets ?? [];
  return renderSurfaceFrame(surface, `
      <form id="platform-change-set-lifecycle-form">
        <label>Change set
          <select name="changeSetId">
            ${changeSets.map(changeSet => `<option value="${esc(changeSet.id)}">${esc(changeSet.id)}</option>`).join("")}
          </select>
        </label>
        <label>Action
          <select name="action">
            <option value="reject">reject</option>
            <option value="abandon">abandon</option>
          </select>
        </label>
        <label>Reason <input name="reason" placeholder="Optional lifecycle reason"></label>
        <button type="submit">Update Change Set</button>
        <div id="change-set-lifecycle-status"></div>
      </form>
  `);
}

function renderVerificationStreamsSection(surface) {
  return renderSurfaceFrame(surface, renderTable(["Property", "Value"], [
    `<tr><td>Test run events</td><td><a href="/api/platform-test-runs/events">/api/platform-test-runs/events</a></td></tr>`,
    `<tr><td>Backend revision events</td><td><a href="/api/runtime/backend-revisions/events">/api/runtime/backend-revisions/events</a></td></tr>`
  ], "No verification streams."));
}

function renderBranchRedGreenSection(surface, model, ctx) {
  const branchRedGreen = (model.branchTestRedGreen ?? []).slice(0, 12);
  return renderSurfaceFrame(surface, renderTable(["Status", "Branch", "Selected", "Passed", "Failed", "Summary"], branchRedGreen.map(row => `
    <tr>
      <td>${esc(row.status || "")}</td>
      <td>${renderConceptLink(ctx, row.branchId)}</td>
      <td>${esc(row.totalSelectedGates ?? 0)}</td>
      <td>${esc((row.passedGateIds ?? []).length)}</td>
      <td>${esc((row.failedGateIds ?? []).length + (row.errorGateIds ?? []).length + (row.timedOutGateIds ?? []).length)}</td>
      <td>${esc(row.summary || "")}</td>
    </tr>
  `), "No branch red/green summaries."));
}

function renderChangeSetRedGreenSection(surface, model, ctx) {
  const changeSetRedGreen = (model.changeSetTestRedGreen ?? []).slice(0, 12);
  return renderSurfaceFrame(surface, renderTable(["Status", "Change Set", "Selected", "Passed", "Failed", "Summary"], changeSetRedGreen.map(row => `
    <tr>
      <td>${esc(row.status || "")}</td>
      <td>${renderConceptLink(ctx, row.changeSetId)}</td>
      <td>${esc(row.totalSelectedGates ?? 0)}</td>
      <td>${esc((row.passedGateIds ?? []).length)}</td>
      <td>${esc((row.failedGateIds ?? []).length + (row.errorGateIds ?? []).length + (row.timedOutGateIds ?? []).length)}</td>
      <td>${esc(row.summary || "")}</td>
    </tr>
  `), "No change-set red/green summaries."));
}

function renderTestRunPanelSection(surface, model) {
  const testGates = model.testGates ?? [];
  return renderSurfaceFrame(surface, `
      <form id="platform-test-run-form">
        <label>Test gate
          <select name="gateId">
            ${testGates.map(gate => `<option value="${esc(gate.id)}">${esc(gate.title || gate.id)}</option>`).join("")}
          </select>
        </label>
        <label>Branch id <input name="branchId" placeholder="Optional branch id"></label>
        <label>Change set id <input name="changeSetId" placeholder="Optional change set id"></label>
        <label>Candidate snapshot id <input name="candidateSnapshotId" placeholder="Optional candidate snapshot id"></label>
        <button type="submit">Run Test Gate</button>
        <div id="test-run-status"></div>
      </form>
  `);
}

function renderSelectedTestRunPanelSection(surface) {
  return renderSurfaceFrame(surface, `
      <form id="platform-selected-test-run-form">
        <label>Branch id <input name="branchId" placeholder="Optional branch id"></label>
        <label>Change set id <input name="changeSetId" placeholder="Optional change set id"></label>
        <label>Candidate snapshot id <input name="candidateSnapshotId" placeholder="Optional candidate snapshot id"></label>
        <button type="submit">Run Selected Gates</button>
        <div id="selected-test-run-status"></div>
      </form>
  `);
}

function renderAuthoringClientScript() {
  return `
    <script>
      (function () {
        const proposalForm = document.getElementById("platform-proposal-form");
        if (proposalForm) {
          const actionSelect = proposalForm.elements.action;
          function syncProposalBody() {
            const option = actionSelect.options[actionSelect.selectedIndex];
            if (!option) return;
            const sample = option.getAttribute("data-sample-body") || "{}";
            try {
              proposalForm.elements.bodyJson.value = JSON.stringify(JSON.parse(sample), null, 2);
            } catch {}
          }
          actionSelect.addEventListener("change", syncProposalBody);
          syncProposalBody();
          proposalForm.addEventListener("submit", async event => {
            event.preventDefault();
            const status = document.getElementById("proposal-status");
            let body = {};
            try {
              body = JSON.parse(proposalForm.elements.bodyJson.value || "{}");
            } catch {
              status.textContent = "Body JSON is invalid.";
              return;
            }
            const response = await fetch("/api/platform-proposals", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                id: proposalForm.elements.id.value || null,
                action: proposalForm.elements.action.value || null,
                targetKind: proposalForm.elements.targetKind.value || null,
                targetId: proposalForm.elements.targetId.value || null,
                body,
                reason: proposalForm.elements.reason.value || null
              })
            });
            const json = await response.json().catch(() => ({}));
            status.textContent = response.ok ? "Proposal created." : (json.error || "Proposal creation failed.");
          });
        }
        document.getElementById("platform-review-form")?.addEventListener("submit", async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const status = document.getElementById("review-status");
          const submitter = event.submitter;
          const action = submitter && submitter.value === "reject" ? "reject" : "approve";
          const id = form.elements.id.value;
          if (!id) {
            status.textContent = "No open proposal selected.";
            return;
          }
          const response = await fetch("/api/platform-proposals/" + encodeURIComponent(id) + "/" + action, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(action === "reject" ? { reason: form.elements.reason.value || null } : {})
          });
          const json = await response.json().catch(() => ({}));
          status.textContent = response.ok ? (action === "approve" ? "Proposal approved." : "Proposal rejected.") : (json.error || "Review failed.");
        });
        document.getElementById("platform-branch-create-form")?.addEventListener("submit", async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const status = document.getElementById("branch-create-status");
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
          const json = await response.json().catch(() => ({}));
          status.textContent = response.ok ? "Branch created." : (json.error || "Branch creation failed.");
        });
        document.getElementById("platform-change-set-create-form")?.addEventListener("submit", async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const status = document.getElementById("change-set-create-status");
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
          const json = await response.json().catch(() => ({}));
          status.textContent = response.ok ? "Change set created." : (json.error || "Change set creation failed.");
        });
        document.getElementById("platform-change-set-edit-form")?.addEventListener("submit", async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const status = document.getElementById("change-set-edit-status");
          const changeSetId = form.elements.changeSetId.value;
          if (!changeSetId) {
            status.textContent = "Select a change set first.";
            return;
          }
          const response = await fetch("/api/platform-change-sets/" + encodeURIComponent(changeSetId) + "/edits", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              edits: [{ path: form.elements.path.value, content: form.elements.content.value }]
            })
          });
          const json = await response.json().catch(() => ({}));
          status.textContent = response.ok ? "Edit staged." : (json.error || "Edit staging failed.");
        });
        document.getElementById("platform-change-set-validate-form")?.addEventListener("submit", async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const status = document.getElementById("change-set-validate-status");
          const changeSetId = form.elements.changeSetId.value;
          if (!changeSetId) {
            status.textContent = "Select a change set first.";
            return;
          }
          const response = await fetch("/api/platform-change-sets/" + encodeURIComponent(changeSetId) + "/validate", {
            method: "POST",
            headers: { "content-type": "application/json" }
          });
          const json = await response.json().catch(() => ({}));
          status.textContent = response.ok
            ? (json.candidateSnapshot?.status === "valid" ? "Change set valid." : "Change set invalid.")
            : (json.error || "Validation failed.");
        });
        document.getElementById("platform-change-set-apply-form")?.addEventListener("submit", async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const status = document.getElementById("change-set-apply-status");
          const changeSetId = form.elements.changeSetId.value;
          if (!changeSetId) {
            status.textContent = "Select a change set first.";
            return;
          }
          const response = await fetch("/api/platform-change-sets/" + encodeURIComponent(changeSetId) + "/apply", {
            method: "POST",
            headers: { "content-type": "application/json" }
          });
          const json = await response.json().catch(() => ({}));
          status.textContent = response.ok ? "Change set applied." : (json.error || "Apply failed.");
        });
        document.getElementById("platform-change-set-lifecycle-form")?.addEventListener("submit", async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const status = document.getElementById("change-set-lifecycle-status");
          const changeSetId = form.elements.changeSetId.value;
          const action = form.elements.action.value || "reject";
          const response = await fetch("/api/platform-change-sets/" + encodeURIComponent(changeSetId) + "/" + action, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason: form.elements.reason.value || null })
          });
          const json = await response.json().catch(() => ({}));
          status.textContent = response.ok ? ("Change set " + action + "ed.") : (json.error || "Lifecycle update failed.");
        });
        document.getElementById("platform-test-run-form")?.addEventListener("submit", async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const status = document.getElementById("test-run-status");
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
          const json = await response.json().catch(() => ({}));
          status.textContent = response.ok
            ? ("Test run finished: " + String(json.latestResult?.status || json.testRun?.status || "unknown"))
            : (json.error || "Test run failed.");
        });
        document.getElementById("platform-selected-test-run-form")?.addEventListener("submit", async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const status = document.getElementById("selected-test-run-status");
          const response = await fetch("/api/platform-test-runs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              branchId: form.elements.branchId.value || null,
              changeSetId: form.elements.changeSetId.value || null,
              candidateSnapshotId: form.elements.candidateSnapshotId.value || null
            })
          });
          const json = await response.json().catch(() => ({}));
          status.textContent = response.ok
            ? ("Selected gates finished: " + String(json.summaries?.passed ?? 0) + "/" + String(json.summaries?.totalRuns ?? 0) + " passed")
            : (json.error || "Selected gate run failed.");
        });
      }());
    </script>
  `;
}

function renderSurfaceSection(surface, model, ctx, consoleLayout) {
  switch (surface?.name) {
    case "PlatformConsoleSummary":
      return summaryCardsForPage("overview", model);
    case "PlatformAuthoredSurfaceTree":
      return renderSurfaceTree(surface, consoleLayout, ctx);
    case "PlatformLifecycleBoard":
      return renderLifecycleBoard(surface, model);
    case "PlatformBranchBoard":
      return renderBranchBoard(surface, model, ctx);
    case "PlatformMap":
      return renderPlatformMapSection(surface, model, ctx);
    case "PlatformProfileComparison":
      return renderProfileComparisonSection(surface, model);
    case "PlatformWorkflowList":
      return renderWorkflowListSection(surface, model, ctx);
    case "PlatformWorkflowDetail":
      return renderSurfaceFrame(surface, renderWorkflowDetail(surface, findWorkflowDetail(model, ctx.id), model, ctx));
    case "PlatformProposalPanel":
      return renderProposalPanelSection(surface, model);
    case "PlatformProposalReviewList":
      return renderProposalReviewPanelSection(surface, model);
    case "PlatformBranchCreatePanel":
      return renderBranchCreatePanelSection(surface);
    case "PlatformChangeSetCreatePanel":
      return renderChangeSetCreatePanelSection(surface);
    case "PlatformChangeSetEditPanel":
      return renderChangeSetEditPanelSection(surface, model);
    case "PlatformChangeSetValidatePanel":
      return renderChangeSetValidatePanelSection(surface, model);
    case "PlatformChangeSetApplyPanel":
      return renderChangeSetApplyPanelSection(surface, model);
    case "PlatformChangeSetLifecyclePanel":
      return renderChangeSetLifecyclePanelSection(surface, model);
    case "PlatformVerificationList":
      return renderVerificationListSection(surface, model, ctx);
    case "PlatformVerificationDetail":
      return renderSurfaceFrame(surface, renderVerificationDetail(surface, findVerificationDetail(model, ctx.id), model, ctx));
    case "PlatformVerificationStreams":
      return renderVerificationStreamsSection(surface);
    case "PlatformBranchRedGreenList":
      return renderBranchRedGreenSection(surface, model, ctx);
    case "PlatformChangeSetRedGreenList":
      return renderChangeSetRedGreenSection(surface, model, ctx);
    case "PlatformTestRunPanel":
      return renderTestRunPanelSection(surface, model);
    case "PlatformSelectedTestRunPanel":
      return renderSelectedTestRunPanelSection(surface);
    case "PlatformKnowledgeList":
      return renderKnowledgeListSection(surface, model, ctx);
    case "PlatformKnowledgeDetail":
      return renderSurfaceFrame(surface, renderKnowledgeDetail(surface, findKnowledgeDetail(model, ctx.id), model, ctx));
    case "PlatformGapList":
      return renderGapListSection(surface, model, ctx);
    case "PlatformSignalList":
      return renderSignalsListSection(surface, model, ctx);
    case "PlatformSignalDetail":
      return renderSurfaceFrame(surface, renderSignalDetail(surface, findSignalDetail(model, ctx.id), model, ctx));
    case "PlatformModelList":
      return renderModelListSection(surface, model, ctx);
    case "PlatformModelDetail":
      return renderSurfaceFrame(surface, renderModelDetail(findModelDetail(model, ctx.id), model, ctx));
    case "PlatformCoverageMatrix":
      return renderCoverageMatrixSection(surface, model, ctx);
    default:
      return `
        <section class="card" data-platform-rvm-view="${esc(surface?.name || "unknown")}">
          <h2>${esc(surface?.title || surface?.name || "Surface")}</h2>
          <div class="muted">${esc(surface?.summary || "No renderer is attached to this authored surface yet.")}</div>
        </section>
      `;
  }
}

const CLIENT_SCRIPT_SURFACE_NAMES = new Set([
  "PlatformProposalPanel",
  "PlatformProposalReviewList",
  "PlatformBranchCreatePanel",
  "PlatformChangeSetCreatePanel",
  "PlatformChangeSetEditPanel",
  "PlatformChangeSetValidatePanel",
  "PlatformChangeSetApplyPanel",
  "PlatformChangeSetLifecyclePanel",
  "PlatformTestRunPanel",
  "PlatformSelectedTestRunPanel"
]);

function surfaceNeedsClientScript(surface) {
  if (!surface) return false;
  if (CLIENT_SCRIPT_SURFACE_NAMES.has(surface.name)) return true;
  return (surface.childSurfaces ?? []).some(child => surfaceNeedsClientScript(child));
}

function pageNeedsClientScript(pageSurface) {
  return surfaceNeedsClientScript(pageSurface);
}

function renderPageFromSurface(pageSurface, model, ctx, consoleLayout) {
  const pageId = pageSurface?.pageId || ctx.view || "overview";
  const sections = (pageSurface?.childSurfaces ?? []).map(surface => renderSurfaceSection(surface, model, ctx, consoleLayout)).join("");
  return `
    ${summaryCardsForPage(pageId, model)}
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
  const body = renderPageFromSurface(currentView.surface ?? null, model, ctx, consoleLayout);
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
