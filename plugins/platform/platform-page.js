import { renderPlatformConsoleCss } from "./platform-style.js";
import { readPlatformConsoleLayout } from "./platform-console-layout.js";
import { filterPlatformModel } from "./platform-model.js";

const FALLBACK_PLATFORM_PAGE_VIEWS = Object.freeze([
  Object.freeze({ id: "overview", title: "Overview", subtitle: "Counts, authored surfaces, lifecycle, and quick links.", modelView: "overview" }),
  Object.freeze({ id: "workflow", title: "Workflow", subtitle: "Workflow landing page for branch activity and links into narrower authored workflow pages.", modelView: "workflowOverview" }),
  Object.freeze({ id: "workflowBranches", title: "Workflow Branches", subtitle: "Branch lifecycle, linked change sets, and branch authoring.", modelView: "workflowBranches" }),
  Object.freeze({ id: "workflowChangeSets", title: "Workflow Change Sets", subtitle: "Staged change sets, overlays, candidate snapshots, and change-set operations.", modelView: "workflowChangeSets" }),
  Object.freeze({ id: "workflowProposals", title: "Workflow Proposals", subtitle: "Proposal intake, review, and proposal-linked workflow detail.", modelView: "workflowProposals" }),
  Object.freeze({ id: "verification", title: "Verification", subtitle: "Verification landing page for live health, red/green state, and links into narrower authored verification pages.", modelView: "verificationOverview" }),
  Object.freeze({ id: "verificationStatus", title: "Verification Status", subtitle: "Policies, freshness, invalidations, queue state, and test-gate detail.", modelView: "verificationStatus" }),
  Object.freeze({ id: "verificationRuns", title: "Verification Runs", subtitle: "Test runs, authored reports, artifacts, suites, failures, and run execution commands.", modelView: "verificationRuns" }),
  Object.freeze({ id: "verificationRuntime", title: "Verification Runtime", subtitle: "Candidate snapshots, runtime revisions, snapshot builds, and runtime rebuild diagnostics.", modelView: "verificationRuntime" }),
  Object.freeze({ id: "knowledge", title: "Knowledge", subtitle: "Knowledge landing page with links into narrower docs, folders (this.folder.wtoml), and roadmap views.", modelView: "knowledgeOverview" }),
  Object.freeze({ id: "knowledgeDocs", title: "Knowledge Docs", subtitle: "Governed documents, authored references, and document detail.", modelView: "knowledgeDocs" }),
  Object.freeze({ id: "knowledgeFolders", title: "Knowledge Folders", subtitle: "Folders with this.folder.wtoml metadata and their linked platform concepts.", modelView: "knowledgeFolders" }),
  Object.freeze({ id: "knowledgeRoadmap", title: "Knowledge Roadmap", subtitle: "Roadmap tasks, epics, features, and linked platform work.", modelView: "knowledgeRoadmap" }),
  Object.freeze({ id: "signals", title: "Signals", subtitle: "Signals landing page with links into narrower gap and signal-catalog views.", modelView: "signalsOverview" }),
  Object.freeze({ id: "signalsGaps", title: "Signals Gaps", subtitle: "Gap inventory, selector drift, and gap detail.", modelView: "signalsGaps" }),
  Object.freeze({ id: "signalsCatalog", title: "Signals Catalog", subtitle: "Telemetry metrics, defect clusters, boundaries, and linked signal-node detail.", modelView: "signalsCatalog" }),
  Object.freeze({ id: "model", title: "Model", subtitle: "Model landing page with links into narrower objects, profiles, and coverage views.", modelView: "modelOverview" }),
  Object.freeze({ id: "modelObjects", title: "Model Objects", subtitle: "Platform objects, their properties, and linked relationships.", modelView: "modelObjects" }),
  Object.freeze({ id: "modelProfiles", title: "Model Profiles", subtitle: "Runtime profile exposure and composition evidence.", modelView: "modelProfiles" }),
  Object.freeze({ id: "modelCoverage", title: "Model Coverage", subtitle: "Coverage edges between gates and protected platform targets.", modelView: "modelCoverage" }),
  Object.freeze({ id: "bridges", title: "Bridges", subtitle: "Compatibility bridge inventory for remaining convenience seams.", modelView: "bridges", supplementalPageSource: "bridges" }),
  Object.freeze({ id: "governance", title: "Governance", subtitle: "Route and proposal-target governance coverage for mutating platform seams.", modelView: "governance", supplementalPageSource: "governance" }),
  Object.freeze({ id: "semantics", title: "Semantics", subtitle: "Personal, shared, and mixed mutable-surface semantics contract rows.", modelView: "semantics", supplementalPageSource: "semantics" }),
  Object.freeze({ id: "packageCoexistence", title: "Package Coexistence", subtitle: "Divergent package revision lines and namespace selections.", modelView: "packageCoexistence", supplementalPageSource: "packageCoexistence" }),
  Object.freeze({ id: "packageConvergence", title: "Package Convergence", subtitle: "Transformer contracts, convergence patches, and remaining authored glue.", modelView: "packageConvergence", supplementalPageSource: "packageConvergence" }),
  Object.freeze({ id: "packageApplyPreview", title: "Package Apply Preview", subtitle: "Revision-scoped apply impact, emitted bundle summary, and convergence truth.", modelView: "packageApplyPreview", supplementalPageSource: "packageApplyPreview" })
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
    requestedArea: optionalText(url.searchParams.get("area")) || "overview",
    requestedSection: optionalText(url.searchParams.get("section")),
    id: optionalText(url.searchParams.get("id")),
    context: optionalText(url.searchParams.get("context")),
    name: optionalText(url.searchParams.get("name")),
    target: optionalText(url.searchParams.get("target")),
    offset: safeInteger(url.searchParams.get("offset"), 0),
    limit: limitParam ? clampPageSize(limitParam) : null,
    sort: optionalText(url.searchParams.get("sort")),
    dir: optionalText(url.searchParams.get("dir")) === "desc" ? "desc" : "asc"
  };
}

const PLATFORM_IA = Object.freeze([
  Object.freeze({
    id: "overview",
    title: "Overview",
    defaultSection: "summary",
    sections: Object.freeze([
      Object.freeze({
        id: "summary",
        title: "Summary",
        subtitle: "Global platform summary, quick links, and high-signal status.",
        pageIds: Object.freeze(["overview"]),
        modelView: "overview",
        sliceKey: "overview",
        emptyDetailTitle: "Overview Detail",
        emptyDetailMessage: "Overview focuses on summary state rather than record detail."
      })
    ])
  }),
  Object.freeze({
    id: "change",
    title: "Change",
    defaultSection: "branches",
    sections: Object.freeze([
      Object.freeze({
        id: "branches",
        title: "Branches",
        subtitle: "Branch lifecycle, candidate snapshots, and branch detail.",
        pageIds: Object.freeze(["workflowBranches"]),
        modelView: "workflowBranches",
        sliceKey: "change",
        emptyDetailTitle: "Branch Detail",
        emptyDetailMessage: "Select a branch to inspect its lifecycle, snapshots, and linked work."
      }),
      Object.freeze({
        id: "changesets",
        title: "Change Sets",
        subtitle: "Staged edits, validation state, and change-set detail.",
        pageIds: Object.freeze(["workflowChangeSets"]),
        modelView: "workflowChangeSets",
        sliceKey: "change",
        emptyDetailTitle: "Change Set Detail",
        emptyDetailMessage: "Select a change set to inspect edits, validation results, and apply state."
      }),
      Object.freeze({
        id: "proposals",
        title: "Proposals",
        subtitle: "Proposal intake, review, and proposal detail.",
        pageIds: Object.freeze(["workflowProposals"]),
        modelView: "workflowProposals",
        sliceKey: "change",
        emptyDetailTitle: "Proposal Detail",
        emptyDetailMessage: "Select a proposal to inspect its target, state, and review actions."
      })
    ])
  }),
  Object.freeze({
    id: "verification",
    title: "Verification",
    defaultSection: "status",
    sections: Object.freeze([
      Object.freeze({
        id: "status",
        title: "Status",
        subtitle: "Policies, freshness, invalidations, queue state, and gate detail.",
        pageIds: Object.freeze(["verificationStatus"]),
        modelView: "verificationStatus",
        sliceKey: "verification",
        emptyDetailTitle: "Verification Detail",
        emptyDetailMessage: "Select a gate, policy, or execution row to inspect verification detail."
      }),
      Object.freeze({
        id: "runs",
        title: "Runs",
        subtitle: "Runs, reports, artifacts, suites, cases, and run detail.",
        pageIds: Object.freeze(["verificationRuns"]),
        modelView: "verificationRuns",
        sliceKey: "verification",
        emptyDetailTitle: "Run Detail",
        emptyDetailMessage: "Select a run, report, or artifact to inspect verification outputs."
      }),
      Object.freeze({
        id: "runtime",
        title: "Runtime",
        subtitle: "Runtime revisions, candidate snapshots, build status, and runtime detail.",
        pageIds: Object.freeze(["verificationRuntime"]),
        modelView: "verificationRuntime",
        sliceKey: "verification",
        emptyDetailTitle: "Runtime Detail",
        emptyDetailMessage: "Select a runtime revision or candidate snapshot to inspect runtime state."
      })
    ])
  }),
  Object.freeze({
    id: "knowledge",
    title: "Knowledge",
    defaultSection: "docs",
    sections: Object.freeze([
      Object.freeze({
        id: "docs",
        title: "Docs",
        subtitle: "Governed documents, references, tasks, and document detail.",
        pageIds: Object.freeze(["knowledgeDocs"]),
        modelView: "knowledgeDocs",
        sliceKey: "knowledgeDocs",
        emptyDetailTitle: "Document Detail",
        emptyDetailMessage: "Select a document to inspect freshness, sections, tasks, and references."
      }),
      Object.freeze({
        id: "folders",
        title: "Folders",
        subtitle: "Folder metadata, relations, and folder detail.",
        pageIds: Object.freeze(["knowledgeFolders"]),
        modelView: "knowledgeFolders",
        sliceKey: "knowledgeFolders",
        emptyDetailTitle: "Folder Detail",
        emptyDetailMessage: "Select a folder to inspect metadata and linked platform concepts."
      }),
      Object.freeze({
        id: "roadmap",
        title: "Roadmap",
        subtitle: "Roadmap tasks, epics, features, and roadmap detail.",
        pageIds: Object.freeze(["knowledgeRoadmap"]),
        modelView: "knowledgeRoadmap",
        sliceKey: "knowledgeRoadmap",
        emptyDetailTitle: "Roadmap Detail",
        emptyDetailMessage: "Select a roadmap task, epic, or feature to inspect planning detail."
      })
    ])
  }),
  Object.freeze({
    id: "advanced",
    title: "Advanced",
    defaultSection: "model",
    sections: Object.freeze([
      Object.freeze({
        id: "model",
        title: "Model",
        subtitle: "Platform objects, relationships, and object detail.",
        pageIds: Object.freeze(["modelObjects"]),
        modelView: "modelObjects",
        sliceKey: "advancedModel",
        emptyDetailTitle: "Object Detail",
        emptyDetailMessage: "Select a platform object to inspect its properties and relationships."
      }),
      Object.freeze({
        id: "coverage",
        title: "Coverage",
        subtitle: "Coverage edges between gates and protected targets.",
        pageIds: Object.freeze(["modelCoverage"]),
        modelView: "modelCoverage",
        sliceKey: "advancedCoverage",
        emptyDetailTitle: "Coverage Detail",
        emptyDetailMessage: "Select a coverage edge target or gate to inspect verification coverage."
      }),
      Object.freeze({
        id: "governance",
        title: "Governance",
        subtitle: "Governance routes and proposal-target coverage.",
        pageIds: Object.freeze(["governance"]),
        modelView: "governance",
        sliceKey: "advancedGovernance",
        emptyDetailTitle: "Governance Detail",
        emptyDetailMessage: "Select a governance object to inspect mutating platform seams."
      }),
      Object.freeze({
        id: "bridges",
        title: "Bridges",
        subtitle: "Compatibility bridge inventory and detail.",
        pageIds: Object.freeze(["bridges"]),
        modelView: "bridges",
        sliceKey: "advancedBridges",
        emptyDetailTitle: "Bridge Detail",
        emptyDetailMessage: "Select a compatibility bridge to inspect its role and scope."
      }),
      Object.freeze({
        id: "semantics",
        title: "Semantics",
        subtitle: "Mutable-surface semantics and detail.",
        pageIds: Object.freeze(["semantics"]),
        modelView: "semantics",
        sliceKey: "advancedSemantics",
        emptyDetailTitle: "Semantics Detail",
        emptyDetailMessage: "Select a mutable surface to inspect its sharing and authority rules."
      }),
      Object.freeze({
        id: "packages",
        title: "Packages",
        subtitle: "Package coexistence, convergence, apply preview, and package detail.",
        pageIds: Object.freeze(["packageCoexistence", "packageConvergence", "packageApplyPreview"]),
        modelView: "advancedPackages",
        sliceKey: "advancedPackages",
        emptyDetailTitle: "Package Detail",
        emptyDetailMessage: "Select a package or revision to inspect coexistence, convergence, or apply preview detail."
      }),
      Object.freeze({
        id: "context",
        title: "Context",
        subtitle: "Context naming state, bindings, scopes, and resolution detail.",
        pageIds: Object.freeze([]),
        modelView: "contextNaming",
        sliceKey: "advancedContext",
        emptyDetailTitle: "Context Detail",
        emptyDetailMessage: "Select a binding, scope, or resolution row to inspect context naming detail."
      }),
      Object.freeze({
        id: "revision-history",
        title: "Revision History",
        subtitle: "Capability revision history and capability detail.",
        pageIds: Object.freeze([]),
        modelView: "capabilityRevisionHistory",
        sliceKey: "advancedRevisionHistory",
        emptyDetailTitle: "Revision Detail",
        emptyDetailMessage: "Select a capability revision row to inspect revision history detail."
      }),
      Object.freeze({
        id: "conflicts",
        title: "Conflicts",
        subtitle: "Conflicts, merge intents, and conflict detail.",
        pageIds: Object.freeze([]),
        modelView: "advancedConflicts",
        sliceKey: "advancedConflicts",
        emptyDetailTitle: "Conflict Detail",
        emptyDetailMessage: "Select a conflict or merge intent to inspect conflict detail."
      })
    ])
  })
]);

const PLATFORM_AREAS_BY_ID = Object.freeze(Object.fromEntries(PLATFORM_IA.map(area => [area.id, area])));
const PLATFORM_SECTION_BY_KEY = Object.freeze(Object.fromEntries(
  PLATFORM_IA.flatMap(area => area.sections.map(section => [`${area.id}:${section.id}`, { area, section }]))
));

function platformSectionConfig(areaId, sectionId = null) {
  const area = PLATFORM_AREAS_BY_ID[areaId] || PLATFORM_IA[0];
  const section = area.sections.find(candidate => candidate.id === sectionId) || area.sections[0];
  return { area, section };
}

export function resolvePlatformLocation(requestUrl) {
  const consoleLayout = readPlatformConsoleLayout();
  const rawCtx = parsePlatformPageRequest(requestUrl);
  const fallbackDestination = rawCtx.id ? conceptDestination(rawCtx.id) : null;
  const resolvedArea = rawCtx.requestedArea || fallbackDestination?.area || "overview";
  const resolvedSection = rawCtx.requestedSection || fallbackDestination?.section || null;
  const { area, section } = platformSectionConfig(resolvedArea, resolvedSection);
  const ctx = {
    ...rawCtx,
    area: area.id,
    section: section.id,
    id: fallbackDestination?.id ?? rawCtx.id,
    view: section.modelView
  };
  const pages = section.pageIds.map(pageId => pageSurfaceById(consoleLayout, pageId)).filter(Boolean);
  return {
    consoleLayout,
    consolePage: consoleLayout.page ?? { title: "Platform Console", summary: "" },
    area,
    section,
    pages,
    ctx
  };
}

function authoredPageViews(consoleLayout) {
  const authored = (consoleLayout?.children ?? [])
    .filter(surface => optionalText(surface.pageId))
    .map(surface => Object.freeze({
      id: String(surface.pageId),
      title: surface.title || humanizeKey(surface.pageId),
      subtitle: surface.summary || "",
      modelView: surfaceModelView(surface),
      supplementalPageSource: surfacePropText(surface, "supplementalPageSource", null),
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

function pageViewModelView(pageView) {
  return optionalText(pageView?.modelView) || surfaceModelView(pageView?.surface);
}

function platformHref(ctx, destination = null, params = {}) {
  const targetArea = typeof destination === "object" && destination ? destination.area : (ctx?.area || "overview");
  const targetSection = typeof destination === "object" && destination ? destination.section : (ctx?.section || "summary");
  const url = new URL("/platform", "http://platform.local");
  url.searchParams.set("area", targetArea);
  url.searchParams.set("section", targetSection);
  for (const [key, rawValue] of Object.entries({
    id: typeof destination === "object" && destination ? destination.id : ctx?.id,
    context: ctx?.context,
    name: ctx?.name,
    target: ctx?.target,
    ...params
  })) {
    if (rawValue === undefined || rawValue === null || rawValue === "" || (key === "offset" && Number(rawValue) === 0)) {
      url.searchParams.delete(key);
      continue;
    }
    url.searchParams.set(key, String(rawValue));
  }
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

function platformFragmentHref(ctx, params = {}) {
  const url = new URL("/api/platform-page", "http://platform.local");
  for (const [key, rawValue] of Object.entries({
    area: ctx?.area,
    section: ctx?.section,
    id: ctx?.id,
    context: ctx?.context,
    name: ctx?.name,
    target: ctx?.target,
    sort: ctx?.sort,
    dir: ctx?.dir,
    limit: ctx?.limit,
    offset: ctx?.offset,
    ...params
  })) {
    if (rawValue === undefined || rawValue === null || rawValue === "" || (key === "offset" && Number(rawValue) === 0)) continue;
    url.searchParams.set(key, String(rawValue));
  }
  return `${url.pathname}?${url.searchParams.toString()}`;
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

function uniqueLinkEntries(values = []) {
  const seen = new Set();
  const entries = [];
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const entry = typeof value === "object" && value
      ? {
          id: optionalText(value.id) || optionalText(value.target) || optionalText(value.path) || null,
          label: optionalText(value.label) || optionalText(value.title) || optionalText(value.target) || optionalText(value.id) || optionalText(value.path) || null
        }
      : {
          id: optionalText(value),
          label: optionalText(value)
        };
    if (!entry.id) continue;
    const key = `${entry.id}|${entry.label || entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries;
}

function conceptDestination(value) {
  const raw = optionalText(value);
  if (!raw) return null;
  if (raw.startsWith("branch:")) return { area: "change", section: "branches", id: raw };
  if (raw.startsWith("changeSet:") || raw.startsWith("changeset.")) return { area: "change", section: "changesets", id: raw };
  if (raw.startsWith("proposal:")) return { area: "change", section: "proposals", id: raw };
  if (raw.startsWith("candidateSnapshot:")) return { area: "verification", section: "runtime", id: raw };
  if (raw.startsWith("runtimeRevision:") || raw.startsWith("backendRevision:") || raw.startsWith("frontendRevision:") || raw.startsWith("snapshotBuild:") || raw.startsWith("snapshotBuildError:")) {
    return { area: "verification", section: "runtime", id: raw };
  }
  if (raw.startsWith("gate:") || raw.startsWith("testRun:") || raw.startsWith("testResult:") || raw.startsWith("testArtifact:") || raw.startsWith("testSuite:") || raw.startsWith("testCase:") || raw.startsWith("testReport:")) {
    return raw.startsWith("gate:")
      ? { area: "verification", section: "status", id: raw }
      : { area: "verification", section: "runs", id: raw };
  }
  if (raw.startsWith("verificationPolicy:") || raw.startsWith("verificationFreshness:") || raw.startsWith("verificationInvalidation:") || raw.startsWith("verificationQueue:") || raw.startsWith("verificationExecution:")) {
    return { area: "verification", section: "status", id: raw };
  }
  if (raw.startsWith("roadmap:") || raw.startsWith("epic:") || raw.startsWith("feature:") || raw.startsWith("roadmapTask:") || raw.startsWith("docTask:")) {
    return { area: "knowledge", section: "roadmap", id: raw };
  }
  if (raw.startsWith("folder:")) return { area: "knowledge", section: "folders", id: raw };
  if (raw.startsWith("doc:")) return { area: "knowledge", section: "docs", id: raw.slice(4) };
  if (raw.endsWith(".md")) return { area: "knowledge", section: "docs", id: raw };
  if (raw.startsWith("gap.")) return { area: "overview", section: "summary", id: raw };
  if (raw.startsWith("telemetryMetric:") || raw.startsWith("defectCluster:") || raw.startsWith("boundary:")) return { area: "advanced", section: "model", id: raw };
  if (raw.startsWith("compatibilityBridge:")) return { area: "advanced", section: "bridges", id: raw };
  if (raw.startsWith("governanceRoute:") || raw.startsWith("governanceProposalTarget:")) return { area: "advanced", section: "governance", id: raw };
  if (raw.startsWith("mutableSurface:")) return { area: "advanced", section: "semantics", id: raw };
  if (raw.startsWith("packageCoexistence:")) return { area: "advanced", section: "packages", id: raw };
  if (raw.startsWith("packageConvergence:")) return { area: "advanced", section: "packages", id: raw };
  if (raw.startsWith("packageApplyPreview:")) return { area: "advanced", section: "packages", id: raw };
  if (raw.startsWith("packageTransformer:") || raw.startsWith("packageTransformer.")) return { area: "advanced", section: "packages", id: raw };
  if (raw.startsWith("packagePatch:")) return { area: "advanced", section: "packages", id: raw };
  if (raw.startsWith("packageDependency:")) return { area: "advanced", section: "model", id: raw };
  if (raw.startsWith("code:")) return { area: "advanced", section: "model", id: raw };
  if (raw.startsWith("package.") || raw.startsWith("packageRevision.") || raw.startsWith("packageNamespace:") || raw.startsWith("packageConflict:")) {
    return { area: "advanced", section: "packages", id: raw };
  }
  if (raw.startsWith("route:") || raw.startsWith("handler:") || raw.startsWith("surface:") || raw.startsWith("capability:") || raw.startsWith("plugin.") || raw.startsWith("bundle:") || raw.startsWith("rvm:") || raw.startsWith("wcss:") || raw.startsWith("wtoml:") || raw.startsWith("json:") || raw.startsWith("file:")) {
    if (raw.startsWith("capabilityRevision:")) return { area: "advanced", section: "revision-history", id: raw };
    return { area: "advanced", section: "model", id: raw };
  }
  if (raw.startsWith("conflict:") || raw.startsWith("mergeIntent:")) {
    return { area: "advanced", section: "conflicts", id: raw };
  }
  if (raw.startsWith("context:") || raw.startsWith("contextBinding:") || raw.startsWith("contextExport:") || raw.startsWith("contextImport:") || raw.startsWith("contextScope:") || raw.startsWith("contextTarget:") || raw.startsWith("contextResolution:") || raw.startsWith("contextConflict:")) {
    return { area: "advanced", section: "context", id: raw };
  }
  return null;
}

function conceptApiHref(value) {
  const raw = optionalText(value);
  if (!raw) return null;
  if (raw.startsWith("branch:")) return `/api/platform-branches/${encodeURIComponent(raw)}`;
  if (raw.startsWith("changeSet:") || raw.startsWith("changeset.")) return `/api/platform-change-sets/${encodeURIComponent(raw)}`;
  if (raw.startsWith("candidateSnapshot:") || raw.startsWith("runtimeRevision:") || raw.startsWith("backendRevision:") || raw.startsWith("frontendRevision:") || raw.startsWith("snapshotBuild:") || raw.startsWith("snapshotBuildError:")) {
    return `/api/platform-model?area=verification&section=runtime&id=${encodeURIComponent(raw)}`;
  }
  if (raw.startsWith("gate:")) return `/api/platform-model?area=verification&section=status&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("testRun:")) return `/api/platform-test-runs/${encodeURIComponent(raw)}`;
  if (raw.startsWith("testResult:") || raw.startsWith("testArtifact:") || raw.startsWith("testSuite:") || raw.startsWith("testCase:") || raw.startsWith("testReport:")) {
    return `/api/platform-model?area=verification&section=runs&id=${encodeURIComponent(raw)}`;
  }
  if (raw.startsWith("roadmap:") || raw.startsWith("epic:") || raw.startsWith("feature:") || raw.startsWith("roadmapTask:") || raw.startsWith("docTask:")) {
    return `/api/platform-model?area=knowledge&section=roadmap&id=${encodeURIComponent(raw)}`;
  }
  if (raw.startsWith("folder:")) return `/api/platform-model?area=knowledge&section=folders&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("doc:")) return `/api/platform-model?area=knowledge&section=docs&id=${encodeURIComponent(raw.slice(4))}`;
  if (raw.endsWith(".md")) return `/api/platform-model?area=knowledge&section=docs&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("telemetryMetric:")) return `/api/platform-model?area=advanced&section=model&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("compatibilityBridge:")) return `/api/platform-model?area=advanced&section=bridges&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("governanceRoute:") || raw.startsWith("governanceProposalTarget:")) return `/api/platform-model?area=advanced&section=governance&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("mutableSurface:")) return `/api/platform-model?area=advanced&section=semantics&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("packageCoexistence:") || raw.startsWith("packageConvergence:") || raw.startsWith("packageApplyPreview:")) return `/api/platform-model?area=advanced&section=packages&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("packageTransformer:") || raw.startsWith("packageTransformer.") || raw.startsWith("packagePatch:")) {
    return `/api/platform-model?area=advanced&section=packages&id=${encodeURIComponent(raw)}`;
  }
  if (raw.startsWith("packageDependency:")) return `/api/platform-model?area=advanced&section=model&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("code:")) return `/api/platform-model?area=advanced&section=model&id=${encodeURIComponent(raw)}`;
  if (raw.startsWith("package.") || raw.startsWith("packageRevision.") || raw.startsWith("packageNamespace:") || raw.startsWith("packageConflict:")) {
    return `/api/platform-model?area=advanced&section=packages&id=${encodeURIComponent(raw)}`;
  }
  if (raw.startsWith("gap.")) return "/api/platform-model?area=overview&section=summary";
  if (raw.startsWith("proposal:")) return "/api/platform-model?area=change&section=proposals";
  return "/api/platform-model";
}

function renderConceptLink(ctx, value, label = null) {
  const raw = optionalText(value);
  if (!raw) return "";
  const destination = conceptDestination(raw);
  const display = label || raw;
  if (!destination) return esc(display);
  return `<a href="${esc(platformHref(ctx, destination))}">${esc(display)}</a>`;
}

function renderApiLink(value) {
  const href = conceptApiHref(value);
  if (!href) return "";
  return `<a href="${esc(href)}">API resource</a>`;
}

function renderValueWithApi(ctx, value) {
  if (value === undefined || value === null || value === "") return "";
  if (Array.isArray(value)) {
    const items = value.map(item => renderValueWithApi(ctx, item)).filter(Boolean);
    return items.length ? items.join(", ") : "";
  }
  if (typeof value === "object") {
    const id = optionalText(value.id) || optionalText(value.path) || null;
    const label = value.title || value.label || value.path || value.id || JSON.stringify(value);
    const rendered = id ? renderConceptLink(ctx, id, label) : esc(label);
    return id && conceptApiHref(id)
      ? `${rendered} <span class="muted">(${renderApiLink(id)})</span>`
      : rendered;
  }
  const text = String(value);
  const rendered = renderValue(ctx, text);
  return conceptDestination(text) && conceptApiHref(text)
    ? `${rendered} <span class="muted">(${renderApiLink(text)})</span>`
    : rendered;
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

function authoredChildSurface(surface, name, fallback = {}) {
  return surface?.childSurfaces?.find(child => child.name === name) || {
    name,
    ...fallback
  };
}

function authoredChildSurfaceByProp(surface, propName, propValue, fallbackName = null, fallback = {}) {
  return surface?.childSurfaces?.find(child => surfacePropText(child, propName, null) === propValue)
    || (fallbackName ? authoredChildSurface(surface, fallbackName, fallback) : { name: fallbackName || propValue, ...fallback });
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
  const allItems = uniqueLinkEntries(values);
  const renderedItems = allItems.slice(0, itemLimit);
  const items = renderedItems
    .map(entry => `<li>${renderConceptLink(ctx, entry.id, entry.label || entry.id)}${conceptApiHref(entry.id) ? ` <span class="muted">(${renderApiLink(entry.id)})</span>` : ""}</li>`)
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

function renderRecordPropertyTable(ctx, title, record, fields = []) {
  const entries = fields.map(field => ({
    label: field.label,
    valueHtml: renderValueWithApi(ctx, record?.[field.key])
  }));
  return renderPropertyTable(title, entries);
}

function renderRecordLongTailTable(ctx, title, record, excludedKeys = []) {
  const excluded = new Set(excludedKeys);
  const entries = Object.entries(record ?? {})
    .filter(([key, value]) => !excluded.has(key) && value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({
      label: humanizeKey(key),
      valueHtml: renderValueWithApi(ctx, value)
    }));
  return renderPropertyTable(title, entries);
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

function renderNav(ctx, area, section) {
  const areaCards = PLATFORM_IA.map(candidate => {
    const isSelected = candidate.id === area.id;
    return `
      <a class="platform-nav-link${isSelected ? " selected" : ""}" href="${esc(platformHref(ctx, { area: candidate.id, section: candidate.defaultSection }))}">
        <strong>${esc(candidate.title)}</strong>
      </a>
    `;
  }).join("");
  const sectionLinks = area.sections.map(candidate => {
    const isSelected = candidate.id === section.id;
    return `
      <a class="platform-section-link${isSelected ? " selected" : ""}" href="${esc(platformHref(ctx, { area: area.id, section: candidate.id }))}">
        <span>${esc(candidate.title)}</span>
        <span class="muted">${esc(candidate.subtitle)}</span>
      </a>
    `;
  }).join("");
  return `
    <aside class="platform-console-nav card" aria-label="Platform navigation">
      <div class="platform-console-nav-header">
        <h2>Areas</h2>
        <div class="muted">${esc(area.title)}</div>
      </div>
      <div class="platform-nav-list">${areaCards}</div>
      <div class="platform-console-nav-header">
        <h2>Sections</h2>
        <div class="muted">${esc(section.subtitle)}</div>
      </div>
      <div class="platform-section-list">${sectionLinks}</div>
    </aside>
  `;
}

function renderPlatformIaCss() {
  return `
    .platform-console-shell {
      display: grid;
      gap: 1rem;
      grid-template-columns: minmax(15rem, 19rem) minmax(0, 1fr);
      align-items: start;
    }
    .platform-console-nav,
    .platform-console-pane {
      position: sticky;
      top: 1rem;
    }
    .platform-console-nav {
      display: grid;
      gap: 1rem;
    }
    .platform-console-nav-header {
      display: grid;
      gap: 0.25rem;
    }
    .platform-nav-list,
    .platform-section-list {
      display: grid;
      gap: 0.5rem;
    }
    .platform-nav-link,
    .platform-section-link {
      display: grid;
      gap: 0.2rem;
      padding: 0.8rem 0.9rem;
      border-radius: 0.8rem;
      text-decoration: none;
      color: inherit;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .platform-nav-link.selected,
    .platform-section-link.selected {
      border-color: rgba(255, 255, 255, 0.22);
      background: rgba(255, 255, 255, 0.1);
    }
    .platform-console-content {
      display: grid;
      gap: 1rem;
      grid-template-columns: minmax(0, 1.4fr) minmax(18rem, 0.9fr);
      align-items: start;
    }
    .platform-console-pane {
      display: grid;
      gap: 1rem;
    }
    .platform-console-pane-main,
    .platform-console-pane-detail {
      min-width: 0;
    }
    .platform-pane-group {
      display: grid;
      gap: 1rem;
    }
    .platform-pane-header {
      display: grid;
      gap: 0.35rem;
    }
    .platform-pane-placeholder {
      min-height: 12rem;
      align-content: start;
    }
    @media (max-width: 980px) {
      .platform-console-shell,
      .platform-console-content {
        grid-template-columns: 1fr;
      }
      .platform-console-nav,
      .platform-console-pane {
        position: static;
      }
      .platform-nav-list {
        grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
      }
    }
  `;
}

function renderPlatformPaneHeader(title, subtitle = "") {
  return `
    <div class="platform-pane-header">
      <h2>${esc(title)}</h2>
      ${subtitle ? `<div class="muted">${esc(subtitle)}</div>` : ""}
    </div>
  `;
}

function platformLocationTitle(area, section) {
  if (!area || !section) return "Platform Console";
  return area.id === "overview" && section.id === "summary"
    ? area.title
    : `${area.title} / ${section.title}`;
}

function surfaceBelongsToDetailPane(surface) {
  const name = String(surface?.name || "");
  return name.includes("Detail") || name.includes("Selected");
}

function renderSectionSurfaceGroups(pages, model, ctx, consoleLayout, predicate, {
  includeSummaryCards = false
} = {}) {
  return pages.map(pageSurface => {
    const sections = (pageSurface?.childSurfaces ?? [])
      .filter(predicate)
      .map(surface => renderSurfaceSection(surface, model, ctx, consoleLayout))
      .join("");
    const summaryCards = includeSummaryCards ? renderSummaryCardsFromSurface(pageSurface, model) : "";
    if (!summaryCards && !sections) return "";
    return `
      <section class="platform-pane-group" data-platform-page="${esc(pageSurface?.pageId || pageSurface?.name || "page")}">
        ${summaryCards}
        ${sections}
      </section>
    `;
  }).join("");
}

function genericRecordDetailMatch(record, id) {
  if (!record || !id) return false;
  const directKeys = ["id", "path", "packageId", "revisionId", "coexistenceId", "convergenceId", "capabilityId", "witnessId", "branchId", "changeSetId", "proposalId", "routeId", "gateId", "runId", "resultId", "targetId"];
  for (const key of directKeys) {
    if (optionalText(record?.[key]) === id) return true;
  }
  const listKeys = ["revisionIds", "selectedRevisionIds", "transformerIds", "convergencePatchIds", "selectedNamespaceIds", "manifestConflictIds", "relatedTransformerIds", "relatedConvergencePatchIds", "sampleTargets", "surfaces", "routes"];
  for (const key of listKeys) {
    if (Array.isArray(record?.[key]) && record[key].map(String).includes(id)) return true;
  }
  if (Array.isArray(record?.namespaceSelections) && record.namespaceSelections.some(namespace =>
    namespace?.id === id
    || namespace?.revision === id
    || `${namespace?.context}:${namespace?.name}` === id
  )) {
    return true;
  }
  return false;
}

function sectionDetailRecords(section, model) {
  switch (section.modelView) {
    case "workflowBranches":
      return model.branches ?? [];
    case "workflowChangeSets":
      return model.changeSets ?? [];
    case "workflowProposals":
      return model.proposals ?? [];
    case "verificationStatus":
      return [
        ...(model.testGates ?? []),
        ...(model.verificationPolicies ?? []),
        ...(model.verificationFreshness ?? []),
        ...(model.verificationInvalidations ?? []),
        ...(model.verificationQueue ?? []),
        ...(model.verificationExecutions ?? [])
      ];
    case "verificationRuns":
      return [
        ...(model.testRuns ?? []),
        ...(model.testReports ?? []),
        ...(model.testArtifacts ?? []),
        ...(model.testSuites ?? []),
        ...(model.testCases ?? [])
      ];
    case "verificationRuntime":
      return [
        ...(model.runtimeRevisions ?? []),
        ...(model.candidateSnapshots ?? []),
        ...(model.snapshotBuilds ?? []),
        ...(model.snapshotBuildErrors ?? [])
      ];
    case "knowledgeDocs":
      return model.docs ?? [];
    case "knowledgeFolders":
      return model.folders ?? [];
    case "knowledgeRoadmap":
      return [
        ...(model.roadmapTasks ?? []),
        ...(model.epics ?? []),
        ...(model.features ?? [])
      ];
    case "modelObjects":
      return model.nodes ?? [];
    case "modelCoverage":
      return model.coverageEdges ?? [];
    case "governance":
      return [
        ...(model.governanceRoutes ?? []),
        ...(model.proposalTargetGovernance ?? [])
      ];
    case "bridges":
      return model.compatibilityBridges ?? [];
    case "semantics":
      return model.mutableSurfaceSemantics ?? [];
    case "advancedPackages":
      return [
        ...(model.packageCoexistence ?? []),
        ...(model.packageConvergence ?? []),
        ...(model.packageApplyPreviews ?? [])
      ];
    case "contextNaming": {
      const naming = model.contextNaming ?? {};
      return [
        ...(naming.contextBindings ?? []),
        ...(naming.contextScopes ?? []),
        ...(naming.contextNameResolutions ?? []),
        ...(naming.contextNameConflicts ?? []),
        ...(naming.contextExports ?? []),
        ...(naming.contextImports ?? []),
        ...(naming.contextualTargets ?? [])
      ];
    }
    case "capabilityRevisionHistory":
      return model.capabilityRevisionHistory ?? [];
    case "advancedConflicts":
      return [
        ...(model.conflicts ?? []),
        ...(model.mergeIntents ?? [])
      ];
    default:
      return [];
  }
}

function selectedSectionRecord(section, model, id) {
  if (!id) return null;
  return sectionDetailRecords(section, model).find(record => genericRecordDetailMatch(record, id)) ?? null;
}

function renderGenericRecordRows(records, ctx, columns) {
  return records.map(record => `
    <tr>
      ${columns.map(column => {
        const value = typeof column.value === "function" ? column.value(record) : record?.[column.value];
        const html = column.link
          ? renderConceptLink(ctx, typeof column.link === "function" ? column.link(record) : value, value)
          : renderValue(ctx, value);
        return `<td>${html}</td>`;
      }).join("")}
    </tr>
  `);
}

function renderAdvancedContextSection(model, ctx) {
  const naming = model.contextNaming ?? {};
  return [
    renderDataTable(
      "Bindings",
      ["Binding", "Context", "Name", "Target"],
      renderGenericRecordRows(naming.contextBindings ?? [], ctx, [
        { value: row => row.id || row.bindingId || row.name, link: row => row.id || row.bindingId || row.name },
        { value: "context" },
        { value: "name" },
        { value: "target" }
      ]),
      "No context bindings."
    ),
    renderDataTable(
      "Resolutions",
      ["Resolution", "Context", "Name", "Status"],
      renderGenericRecordRows(naming.contextNameResolutions ?? [], ctx, [
        { value: row => row.id || row.name, link: row => row.id || row.name },
        { value: "context" },
        { value: "name" },
        { value: "status" }
      ]),
      "No context resolutions."
    ),
    renderDataTable(
      "Conflicts",
      ["Conflict", "Context", "Name", "Summary"],
      renderGenericRecordRows(naming.contextNameConflicts ?? [], ctx, [
        { value: row => row.id || row.name, link: row => row.id || row.name },
        { value: "context" },
        { value: "name" },
        { value: row => row.summary || row.reason || "" }
      ]),
      "No context naming conflicts."
    )
  ].join("");
}

function renderAdvancedRevisionHistorySection(model, ctx) {
  return renderDataTable(
    "Capability Revisions",
    ["Capability", "Version", "Action", "Witness"],
    renderGenericRecordRows(model.capabilityRevisionHistory ?? [], ctx, [
      { value: row => row.capabilityId || row.id, link: row => row.id || row.capabilityId },
      { value: "version" },
      { value: "action" },
      { value: "witnessId" }
    ]),
    "No capability revisions."
  );
}

function renderAdvancedConflictsSection(model, ctx) {
  return [
    renderDataTable(
      "Conflicts",
      ["Conflict", "Branch", "Change Set", "Status"],
      renderGenericRecordRows(model.conflicts ?? [], ctx, [
        { value: row => row.id || row.path, link: row => row.id || row.path },
        { value: "branchId" },
        { value: "changeSetId" },
        { value: "status" }
      ]),
      "No conflicts."
    ),
    renderDataTable(
      "Merge Intents",
      ["Intent", "Branch", "Proposal", "Status"],
      renderGenericRecordRows(model.mergeIntents ?? [], ctx, [
        { value: row => row.id || row.mode, link: row => row.id || row.mode },
        { value: "branchId" },
        { value: "proposalId" },
        { value: "status" }
      ]),
      "No merge intents."
    )
  ].join("");
}

function renderCustomSectionCenter(section, model, ctx) {
  switch (section.modelView) {
    case "contextNaming":
      return renderAdvancedContextSection(model, ctx);
    case "capabilityRevisionHistory":
      return renderAdvancedRevisionHistorySection(model, ctx);
    case "advancedConflicts":
      return renderAdvancedConflictsSection(model, ctx);
    default:
      return "";
  }
}

function renderGenericSectionDetail(section, model, ctx) {
  const record = selectedSectionRecord(section, model, ctx.id);
  if (!record) {
    return `
      <section class="card platform-pane-placeholder">
        <h2>${esc(section.emptyDetailTitle)}</h2>
        <div class="muted">${esc(section.emptyDetailMessage)}</div>
      </section>
    `;
  }
  const title = record.title || record.label || record.id || section.emptyDetailTitle;
  return `
    <section class="card">
      <h2>${esc(title)}</h2>
      <div class="grid2">
        <div>${renderRecordPropertyTable(ctx, section.emptyDetailTitle, record, [
          { key: "id", label: "ID" },
          { key: "kind", label: "Kind" },
          { key: "status", label: "Status" },
          { key: "title", label: "Title" }
        ])}</div>
        <div>${renderRecordLongTailTable(ctx, "Properties", record, ["id", "kind", "status", "title"])}</div>
      </div>
    </section>
  `;
}

function renderSectionFragment(section, pages, model, ctx, consoleLayout) {
  const centerAuthored = renderSectionSurfaceGroups(
    pages,
    model,
    ctx,
    consoleLayout,
    surface => !surfaceBelongsToDetailPane(surface),
    { includeSummaryCards: true }
  );
  const detailAuthored = renderSectionSurfaceGroups(
    pages,
    model,
    ctx,
    consoleLayout,
    surface => surfaceBelongsToDetailPane(surface)
  );
  const centerCustom = renderCustomSectionCenter(section, model, ctx);
  const detailCustom = renderGenericSectionDetail(section, model, ctx);
  const centerHtml = centerAuthored || centerCustom || `
    <section class="card platform-pane-placeholder">
      <h2>${esc(section.title)}</h2>
      <div class="muted">${esc(section.subtitle)}</div>
    </section>
  `;
  return `
    <section class="platform-console-pane platform-console-pane-main">
      ${renderPlatformPaneHeader(section.title, section.subtitle)}
      ${centerHtml}
    </section>
    <aside class="platform-console-pane platform-console-pane-detail">
      ${renderPlatformPaneHeader("Detail", ctx.id ? `Selected: ${ctx.id}` : section.emptyDetailMessage)}
      ${detailAuthored || detailCustom}
    </aside>
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

function setAuthoredDetailSection(sectionsByName, surface, detailKind, bodyHtml) {
  if (!surface || !surfaceAppliesToDetailKinds(surface, detailKind) || !bodyHtml) return;
  sectionsByName.set(surface.name, renderSurfaceFrame(surface, bodyHtml));
}

function surfaceAppliesToDetailKinds(surface, detailKind = null) {
  const kinds = surfaceValueList(surface, "detailKinds", []);
  if (!kinds.length || !detailKind) return !kinds.length || Boolean(detailKind);
  return kinds.includes(detailKind);
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
    case "authoredLink":
      return items.map(item => {
        if (typeof item === "object" && item) {
          const t = item.target || item.to || item.id || "";
          const r = item.rel || "";
          return {
            id: t,
            label: r ? `${r}: ${t}` : t
          };
        }
        return item;
      }).filter(Boolean);
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

function renderAuthoredCardSpecChildren(surface, detailKind, ctx, record) {
  return (surface?.childSurfaces ?? [])
    .filter(child => surfaceAppliesToDetailKinds(child, detailKind))
    .map(child => `
      ${renderCardSpecs(child, "linkCards", "linkCardEmptyStates", ctx, record, "links")}
      ${renderCardSpecs(child, "textCards", "textCardEmptyStates", ctx, record, "text")}
    `)
    .join("");
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

function surfaceFormRequestSpec(surface) {
  const path = surfacePropText(surface, "submitPath", "");
  if (!path) return null;
  return {
    path,
    method: surfacePropText(surface, "submitMethod", "POST"),
    bodyFields: parseSurfaceSchemaEntries(surface?.props?.submitBodyFields).map(entry => ({
      target: entry.label,
      source: entry.path,
      mode: entry.mode || "value"
    })),
    requiredFieldMessages: Object.fromEntries(parseSurfaceLabelMap(surface?.props?.requiredFieldMessages).entries()),
    invalidFieldMessages: Object.fromEntries(parseSurfaceLabelMap(surface?.props?.invalidFieldMessages).entries()),
    successMessage: surfacePropText(surface, "successMessage", ""),
    successMessageTemplate: surfacePropText(surface, "successMessageTemplate", ""),
    errorMessage: surfacePropText(surface, "errorMessage", "")
  };
}

function surfaceFieldSyncSpecs(surface) {
  return parseSurfaceSchemaEntries(surface?.props?.fieldSyncs).map(entry => {
    const [sourceField = "", attr = "value"] = String(entry.path || "").split(":");
    return {
      targetField: entry.label,
      sourceField: sourceField.trim(),
      attr: attr.trim(),
      mode: entry.mode || "text"
    };
  }).filter(spec => spec.targetField && spec.sourceField);
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
  const policies = (model.verificationPolicies ?? []).map(policy => ({
    pageKind: "verificationPolicy",
    id: policy.id,
    title: policy.gateId ? `Policy ${policy.gateId}` : "Verification Defaults",
    status: policy.status || (policy.enabled ? "resolved" : "disabled"),
    scope: policy.runtimeProfile || policy.policySource || "",
    summary: `${policy.executionClass || "defaults"}, ${policy.policySource || "synthesized"}`
  }));
  const freshnessRows = (model.verificationFreshness ?? []).map(row => ({
    pageKind: "verificationFreshness",
    id: row.id,
    title: row.gateId ? `Freshness ${row.gateId}` : row.id,
    status: row.status,
    scope: row.runtimeProfile || "",
    summary: row.reasonSummary || "Verification freshness"
  }));
  const invalidationRows = (model.verificationInvalidations ?? []).map(row => ({
    pageKind: "verificationInvalidation",
    id: row.id,
    title: row.gateId ? `Invalidation ${row.gateId}` : row.id,
    status: row.reasonKind,
    scope: row.runtimeProfile || "",
    summary: row.reasonSummary || ""
  }));
  const queueRows = (model.verificationQueue ?? []).map(row => ({
    pageKind: "verificationQueue",
    id: row.id,
    title: row.gateTitle || row.gateId || row.id,
    status: row.status,
    scope: row.triggerKind || "",
    summary: `${row.executionClass || "child_process"}, ${row.runId || "no run"}`
  }));
  const executions = (model.verificationExecutions ?? []).map(row => ({
    pageKind: "verificationExecution",
    id: row.id,
    title: row.gateTitle || row.gateId || row.id,
    status: row.status,
    scope: row.triggerKind || "",
    summary: `${row.executionClass || "child_process"}, ${row.runId || "no run"}`
  }));
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
  return [...policies, ...freshnessRows, ...invalidationRows, ...queueRows, ...executions, ...gates, ...runs, ...revisions, ...snapshots].sort((left, right) =>
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
  const folders = (model.folders ?? []).map(folder => ({
    pageKind: "folder",
    id: folder.id,
    title: folder.title || folder.id,
    folderLink: {
      id: folder.id,
      title: folder.title || folder.id
    },
    status: folder.source ? "authored" : "known",
    scope: folder.path || "",
    summary: `folder meta${folder.source ? ` from ${folder.source}` : ""}`
  }));
  return [...docs, ...tasks, ...epics, ...features, ...folders].sort((left, right) =>
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
    case "verificationPolicies":
      return model.verificationPolicies ?? [];
    case "verificationFreshness":
      return model.verificationFreshness ?? [];
    case "verificationInvalidations":
      return model.verificationInvalidations ?? [];
    case "verificationQueue":
      return model.verificationQueue ?? [];
    case "verificationExecutions":
      return model.verificationExecutions ?? [];
    case "runtimeRevisions":
      return model.runtimeRevisions ?? [];
    case "testRuns":
      return model.testRuns ?? [];
    case "testReports":
      return model.testReports ?? [];
    case "candidateSnapshots":
      return model.candidateSnapshots ?? [];
    case "nodes":
      return model.nodes ?? [];
    case "docs":
      return model.docs ?? [];
    case "folders":
      return model.folders ?? [];
    case "roadmapTasks":
      return model.roadmapTasks ?? [];
    case "epics":
      return model.epics ?? [];
    case "features":
      return model.features ?? [];
    case "gaps":
      return model.gaps ?? [];
    case "bridges":
    case "governance":
    case "semantics":
    case "packageCoexistence":
    case "packageConvergence":
    case "packageApplyPreview":
      return platformSourceRows(source, model);
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
    case "packageConvergence":
      return record.id === id
        || record.packageId === id
        || record.coexistenceId === id
        || (record.transformerIds ?? []).includes(id)
        || (record.convergencePatchIds ?? []).includes(id);
    case "packageApplyPreview":
      return record.id === id
        || record.packageId === id
        || record.revisionId === id
        || record.coexistenceId === id
        || record.convergenceId === id
        || (record.selectedNamespaceIds ?? []).includes(id)
        || (record.manifestConflictIds ?? []).includes(id)
        || (record.relatedTransformerIds ?? []).includes(id)
        || (record.relatedConvergencePatchIds ?? []).includes(id);
    case "packageCoexistence":
      return record.id === id
        || record.packageId === id
        || (record.revisionIds ?? []).includes(id)
        || (record.selectedRevisionIds ?? []).includes(id)
        || (record.namespaceSelections ?? []).some(namespace =>
          namespace.id === id
          || namespace.revision === id
          || `${namespace.context}:${namespace.name}` === id
        );
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
  const primarySurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "primary", "PlatformWorkflowPrimaryPanel");
  const relatedSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "related", "PlatformWorkflowRelatedPanel");
  const snapshotSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "snapshotHistory", "PlatformWorkflowSnapshotHistory");
  const editSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "editHistory", "PlatformWorkflowEditHistory");
  const branchIdPrefixes = surfaceIdPrefixes(surface, "branchIdPrefixes");
  const changeSetIdPrefixes = surfaceIdPrefixes(surface, "changeSetIdPrefixes");
  const proposalIdPrefixes = surfaceIdPrefixes(surface, "proposalIdPrefixes");
  if (!detail) return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No workflow rows are projected yet." });
  if (recordMatchesIdPrefixes(detail, branchIdPrefixes)) {
    const detailKind = "branch";
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
    const sections = new Map();
    setAuthoredDetailSection(sections, primarySurface, detailKind, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, branch, usedKeys)}
    `);
    setAuthoredDetailSection(sections, relatedSurface, detailKind, `
      ${renderCardSpecs(relatedSurface, "branchLinkCards", "branchLinkCardEmptyStates", ctx, branch, "links")}
      ${renderCardSpecs(relatedSurface, "branchTextCards", "branchTextCardEmptyStates", ctx, branch, "text")}
    `);
    setAuthoredDetailSection(sections, snapshotSurface, detailKind, renderAuthoredSurfaceTable(snapshotSurface, renderRowsFromSurfaceSchema(snapshotSurface, "rowFields", snapshotRows, ctx, snapshot => `
      <tr>
        <td>${esc(snapshot.status || "")}</td>
        <td>${renderConceptLink(ctx, snapshot.id)}</td>
        <td>${esc(snapshot.revision ?? "")}</td>
        <td>${renderConceptLink(ctx, snapshot.changeSetId)}</td>
        <td>${esc(Array.isArray(snapshot.errors) ? snapshot.errors.length : 0)}</td>
      </tr>
    `)));
    return renderAuthoredDetailLayout(surface, sections);
  }
  if (recordMatchesIdPrefixes(detail, changeSetIdPrefixes)) {
    const detailKind = "changeSet";
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
    const sections = new Map();
    setAuthoredDetailSection(sections, primarySurface, detailKind, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, changeSet, usedKeys)}
    `);
    setAuthoredDetailSection(sections, relatedSurface, detailKind, `
      ${renderCardSpecs(relatedSurface, "changeSetLinkCards", "changeSetLinkCardEmptyStates", ctx, changeSet, "links")}
    `);
    setAuthoredDetailSection(sections, editSurface, detailKind, renderAuthoredSurfaceTable(editSurface, renderRowsFromSurfaceSchema(editSurface, "rowFields", editRows, ctx, edit => `
      <tr>
        <td>${esc(edit.path || "")}</td>
        <td>${esc(edit.sourceLanguage || "")}</td>
        <td>${esc(edit.previousHash ? String(edit.previousHash).slice(0, 12) : "")}</td>
        <td>${esc(edit.nextHash ? String(edit.nextHash).slice(0, 12) : "")}</td>
      </tr>
    `)));
    setAuthoredDetailSection(sections, snapshotSurface, detailKind, renderTable(surfaceColumnLabels(snapshotSurface, []), renderRowsFromSurfaceSchema(snapshotSurface, "rowFields", snapshotRows, ctx, snapshot => `
      <tr>
        <td>${esc(snapshot.status || "")}</td>
        <td>${renderConceptLink(ctx, snapshot.id)}</td>
        <td>${esc(snapshot.revision ?? "")}</td>
        <td>${renderConceptLink(ctx, snapshot.changeSetId)}</td>
        <td>${esc(Array.isArray(snapshot.errors) ? snapshot.errors.length : 0)}</td>
      </tr>
    `), surfaceVariantEmptyState(snapshotSurface, "changeSetEmptyState", "No candidate snapshots for this change set.")));
    return renderAuthoredDetailLayout(surface, sections);
  }
  const detailKind = "proposal";
  const proposal = detail;
  if (!recordMatchesIdPrefixes(proposal, proposalIdPrefixes) && detail.id) {
    return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No workflow rows are projected yet." });
  }
  const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "proposalCardTitle", "proposalFields", ctx, proposal, "Proposal Detail");
  const usedKeys = rootKeysFromSurfaceSchema(primarySurface, "proposalFields").length
    ? rootKeysFromSurfaceSchema(primarySurface, "proposalFields")
    : ["id", "status", "targetProcess", "targetId", "reason", "action"];
  const sections = new Map();
  setAuthoredDetailSection(sections, primarySurface, detailKind, `
    ${renderPropertyCard(primaryCard)}
    ${renderLongTailProperties(primarySurface, ctx, proposal, usedKeys)}
  `);
  setAuthoredDetailSection(sections, relatedSurface, detailKind, `
    ${renderCardSpecs(relatedSurface, "proposalLinkCards", "proposalLinkCardEmptyStates", ctx, proposal, "links")}
  `);
  return renderAuthoredDetailLayout(surface, sections);
}

function reportRunId(reportId) {
  const raw = optionalText(reportId);
  if (!raw || !raw.startsWith("testReport:")) return null;
  const suffixIndex = raw.lastIndexOf(":");
  if (suffixIndex <= "testReport:".length) return null;
  return raw.slice("testReport:".length, suffixIndex);
}

function countByStatus(rows = []) {
  return rows.reduce((counts, row) => {
    const status = String(row?.status || "unknown");
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, Object.create(null));
}

function verificationStatusRecord(model) {
  const runs = model.testRuns ?? [];
  const freshnessRows = model.verificationFreshness ?? [];
  const runningCount = runs.filter(run => run.status === "running").length;
  const queueCount = (model.verificationQueue ?? []).filter(row => row.status === "queued" || row.status === "running").length;
  const latestResults = Object.values(model.latestTestResultsByGate ?? {});
  const failingGateCount = latestResults.filter(result =>
    ["failed", "error"].includes(String(result?.status || ""))
    || result?.timedOut === true
  ).length;
  const regressionRows = (model.testReports ?? []).filter(report => report.reportKind === "regression");
  const regressedRunCount = regressionRows.filter(report => report.status === "regressed").length;
  const freshGateCount = freshnessRows.filter(row => row.status === "fresh").length;
  const staleGateCount = freshnessRows.filter(row => row.status === "stale").length;
  const missingGateCount = freshnessRows.filter(row => row.status === "missing").length;
  const completedRuns = runs
    .filter(run => optionalText(run.finishedAt))
    .sort((left, right) => String(right.finishedAt || "").localeCompare(String(left.finishedAt || "")));
  const latestCompletedRun = completedRuns[0] ?? null;
  const status = failingGateCount > 0
    ? "failed"
    : staleGateCount > 0
      ? "stale"
      : missingGateCount > 0
        ? "missing"
    : regressedRunCount > 0
      ? "regressed"
      : runningCount > 0
        ? "running"
        : "passed";
  const summary = failingGateCount > 0
    ? `${failingGateCount} failing gate${failingGateCount === 1 ? "" : "s"} need attention.`
    : staleGateCount > 0
      ? `${staleGateCount} gate${staleGateCount === 1 ? "" : "s"} have stale verification evidence.`
      : missingGateCount > 0
        ? `${missingGateCount} gate${missingGateCount === 1 ? "" : "s"} have no verification evidence yet.`
    : regressedRunCount > 0
      ? `${regressedRunCount} run${regressedRunCount === 1 ? "" : "s"} show a timing regression.`
      : runningCount > 0
        ? `${runningCount} run${runningCount === 1 ? "" : "s"} currently executing.`
        : "No active failures or regressions are currently projected.";
  return {
    id: "verificationStatus:current",
    status,
    summary,
    freshGateCount,
    staleGateCount,
    missingGateCount,
    runningCount,
    failingGateCount,
    regressedRunCount,
    queueCount,
    policySource: model.testMonitorDiagnostics?.policySource ?? "synthesized",
    persistenceSource: model.verificationPersistence?.source ?? "synthesized",
    ledgerBackend: model.verificationPersistence?.ledgerBackend?.provider ?? "sqlite",
    artifactBackend: model.verificationPersistence?.artifactBackend?.provider ?? "disk",
    cacheBackend: model.verificationPersistence?.cacheBackend?.provider ?? "disk",
    latestCompletedRunId: latestCompletedRun?.id ?? null,
    latestCompletedAt: latestCompletedRun?.finishedAt ?? null,
    activeRuntimeRevision: model.activeRuntimeRevision?.id ?? null
  };
}

function propertyRecordForSource(source, model) {
  switch (source) {
    case "verificationStatus":
      return verificationStatusRecord(model);
    default:
      return null;
  }
}

function renderComputedPropertySection(surface, model, ctx) {
  const source = surfacePropText(surface, "propertyRecordSource", "");
  const record = propertyRecordForSource(source, model);
  if (!record) return "";
  const card = propertyRowsFromSurfaceSchema(
    surface,
    "propertyCardTitle",
    "propertyFields",
    ctx,
    record,
    surfacePropText(surface, "title", "Properties")
  );
  return renderSurfaceFrame(surface, renderPropertyCard(card));
}

function renderVerificationDetail(surface, detail, model, ctx) {
  const primarySurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "primary", "PlatformVerificationPrimaryPanel");
  const relatedSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "related", "PlatformVerificationRelatedPanel");
  const runHistorySurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "runHistory", "PlatformVerificationRunHistory");
  const buildHistorySurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "buildHistory", "PlatformVerificationBuildHistory");
  const buildErrorsSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "buildErrors", "PlatformVerificationBuildErrors");
  const reportSummarySurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "reportSummary", "PlatformVerificationReportSummary");
  const artifactsSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "artifacts", "PlatformVerificationArtifactsReport");
  const suiteSummarySurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "suiteSummary", "PlatformVerificationSuiteSummary");
  const failingCasesSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "failingCases", "PlatformVerificationFailingCases");
  const regressionSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "regressionSummary", "PlatformVerificationRegressionSummary");
  const freshnessSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "freshnessSummary", "PlatformVerificationFreshnessSummary");
  const invalidationSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "invalidationReasons", "PlatformVerificationInvalidationReasons");
  const verificationPolicyIdPrefixes = surfaceIdPrefixes(surface, "verificationPolicyIdPrefixes");
  const verificationFreshnessIdPrefixes = surfaceIdPrefixes(surface, "verificationFreshnessIdPrefixes");
  const verificationInvalidationIdPrefixes = surfaceIdPrefixes(surface, "verificationInvalidationIdPrefixes");
  const verificationQueueIdPrefixes = surfaceIdPrefixes(surface, "verificationQueueIdPrefixes");
  const verificationExecutionIdPrefixes = surfaceIdPrefixes(surface, "verificationExecutionIdPrefixes");
  const gateIdPrefixes = surfaceIdPrefixes(surface, "gateIdPrefixes");
  const runtimeRevisionIdPrefixes = surfaceIdPrefixes(surface, "runtimeRevisionIdPrefixes");
  const candidateSnapshotIdPrefixes = surfaceIdPrefixes(surface, "candidateSnapshotIdPrefixes");
  const testRunIdPrefixes = surfaceIdPrefixes(surface, "testRunIdPrefixes");
  const testReportIdPrefixes = surfaceIdPrefixes(surface, "testReportIdPrefixes");
  if (!detail) return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No verification rows are projected yet." });
  if (recordMatchesIdPrefixes(detail, verificationPolicyIdPrefixes)) {
    const detailKind = "verificationPolicy";
    const policy = detail;
    const policyRecord = {
      ...policy,
      policySource: policy.policySource ?? policy.source ?? "synthesized"
    };
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "verificationPolicyCardTitle", "verificationPolicyFields", ctx, policyRecord, "Verification Policy Detail");
    const persistenceRecord = {
      ...(model.verificationPersistence ?? {}),
      ledgerBackendLabel: model.verificationPersistence?.ledgerBackend?.provider ?? null,
      artifactBackendLabel: model.verificationPersistence?.artifactBackend?.provider ?? null,
      cacheBackendLabel: model.verificationPersistence?.cacheBackend?.provider ?? null
    };
    const persistenceCard = propertyRowsFromSurfaceSchema(relatedSurface, "verificationPersistenceCardTitle", "verificationPersistenceFields", ctx, persistenceRecord, "Verification Persistence");
    const sections = new Map();
    setAuthoredDetailSection(sections, primarySurface, detailKind, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, policy, rootKeysFromSurfaceSchema(primarySurface, "verificationPolicyFields"))}
    `);
    setAuthoredDetailSection(sections, relatedSurface, detailKind, `
      ${renderPropertyCard(persistenceCard)}
    `);
    return renderAuthoredDetailLayout(surface, sections);
  }
  if (recordMatchesIdPrefixes(detail, verificationQueueIdPrefixes) || recordMatchesIdPrefixes(detail, verificationExecutionIdPrefixes)) {
    const detailKind = "verificationExecution";
    const execution = detail;
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "verificationExecutionCardTitle", "verificationExecutionFields", ctx, execution, "Verification Execution Detail");
    const sections = new Map();
    setAuthoredDetailSection(sections, primarySurface, detailKind, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, execution, rootKeysFromSurfaceSchema(primarySurface, "verificationExecutionFields"))}
    `);
    return renderAuthoredDetailLayout(surface, sections);
  }
  if (recordMatchesIdPrefixes(detail, verificationFreshnessIdPrefixes) || recordMatchesIdPrefixes(detail, verificationInvalidationIdPrefixes)) {
    const detailKind = recordMatchesIdPrefixes(detail, verificationFreshnessIdPrefixes) ? "verificationFreshness" : "verificationInvalidation";
    const freshness = recordMatchesIdPrefixes(detail, verificationFreshnessIdPrefixes)
      ? detail
      : ((model.verificationFreshness ?? []).find(row =>
          String(row?.gateId || "") === String(detail?.gateId || "")
          && String(row?.serverRunnerId || "") === String(detail?.serverRunnerId || "")
          && String(row?.runtimeProfile || "") === String(detail?.runtimeProfile || "")
        ) ?? null);
    const invalidationRows = (model.verificationInvalidations ?? [])
      .filter(row =>
        String(row?.gateId || "") === String(detail?.gateId || freshness?.gateId || "")
        && String(row?.serverRunnerId || "") === String(detail?.serverRunnerId || freshness?.serverRunnerId || "")
        && String(row?.runtimeProfile || "") === String(detail?.runtimeProfile || freshness?.runtimeProfile || "")
      )
      .sort((left, right) => String(right?.producedAt || "").localeCompare(String(left?.producedAt || "")))
      .slice(0, surfaceRowLimit(invalidationSurface, 20));
    const runRows = (model.testRuns ?? [])
      .filter(run => String(run?.gateId || "") === String(detail?.gateId || freshness?.gateId || ""))
      .slice(0, surfaceRowLimit(runHistorySurface, 12));
    const primaryRecord = detailKind === "verificationFreshness"
      ? freshness
      : detail;
    const primaryCard = detailKind === "verificationFreshness"
      ? propertyRowsFromSurfaceSchema(primarySurface, "verificationFreshnessCardTitle", "verificationFreshnessFields", ctx, primaryRecord, "Verification Freshness")
      : propertyRowsFromSurfaceSchema(primarySurface, "verificationInvalidationCardTitle", "verificationInvalidationFields", ctx, primaryRecord, "Verification Invalidation");
    const sections = new Map();
    setAuthoredDetailSection(sections, primarySurface, detailKind, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, primaryRecord, rootKeysFromSurfaceSchema(primarySurface, detailKind === "verificationFreshness" ? "verificationFreshnessFields" : "verificationInvalidationFields"))}
    `);
    if (freshness) {
      const freshnessCard = propertyRowsFromSurfaceSchema(freshnessSurface, "propertyCardTitle", "propertyFields", ctx, freshness, "Gate Freshness");
      setAuthoredDetailSection(sections, freshnessSurface, detailKind, renderPropertyCard(freshnessCard));
    }
    setAuthoredDetailSection(sections, invalidationSurface, detailKind, renderAuthoredSurfaceTable(invalidationSurface, renderRowsFromSurfaceSchema(invalidationSurface, "rowFields", invalidationRows, ctx, row => `
      <tr>
        <td>${esc(row.reasonKind || "")}</td>
        <td>${esc(row.reasonSummary || "")}</td>
        <td>${esc((row.changedPaths ?? []).join(", "))}</td>
        <td>${renderValue(ctx, row.targetIds ?? [])}</td>
      </tr>
    `)));
    setAuthoredDetailSection(sections, runHistorySurface, detailKind, renderAuthoredSurfaceTable(runHistorySurface, renderRowsFromSurfaceSchema(runHistorySurface, "rowFields", runRows, ctx, run => `
      <tr>
        <td>${esc(run.status || "")}</td>
        <td>${renderConceptLink(ctx, run.id)}</td>
        <td>${run.branchId ? renderConceptLink(ctx, run.branchId) : ""}</td>
        <td>${esc(run.durationMs ?? "")}</td>
        <td>${esc(run.exitCode ?? "")}</td>
      </tr>
    `)));
    return renderAuthoredDetailLayout(surface, sections);
  }
  if (recordMatchesIdPrefixes(detail, gateIdPrefixes)) {
    const detailKind = "gate";
    const gate = detail;
    const runRows = (model.testRuns ?? []).filter(run => run.gateId === gate.id).slice(0, surfaceRowLimit(runHistorySurface, 12));
    const gateFreshness = (model.verificationFreshness ?? []).find(row => String(row?.gateId || "") === String(gate.id || "")) ?? null;
    const gateInvalidations = (model.verificationInvalidations ?? [])
      .filter(row => String(row?.gateId || "") === String(gate.id || ""))
      .sort((left, right) => String(right?.producedAt || "").localeCompare(String(left?.producedAt || "")))
      .slice(0, surfaceRowLimit(invalidationSurface, 20));
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "gateCardTitle", "gateFields", ctx, gate, "Test Gate Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "gateFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "gateFields")
        : ["id", "title", "runner", "environment", "timeoutMs", "costEstimate", "command", "lastResult"]),
      ...surfaceKeyList(primarySurface, "gateLongTailExcludedFields", ["protectedObjects", "selectedByBranches", "selectedByChangeSets"])
    ];
    const sections = new Map();
    setAuthoredDetailSection(sections, primarySurface, detailKind, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, gate, usedKeys)}
    `);
    setAuthoredDetailSection(sections, relatedSurface, detailKind, `
      ${renderCardSpecs(relatedSurface, "gateLinkCards", "gateLinkCardEmptyStates", ctx, gate, "links")}
    `);
    if (gateFreshness) {
      const freshnessCard = propertyRowsFromSurfaceSchema(freshnessSurface, "propertyCardTitle", "propertyFields", ctx, gateFreshness, "Gate Freshness");
      setAuthoredDetailSection(sections, freshnessSurface, detailKind, renderPropertyCard(freshnessCard));
    }
    setAuthoredDetailSection(sections, invalidationSurface, detailKind, renderAuthoredSurfaceTable(invalidationSurface, renderRowsFromSurfaceSchema(invalidationSurface, "rowFields", gateInvalidations, ctx, row => `
      <tr>
        <td>${esc(row.reasonKind || "")}</td>
        <td>${esc(row.reasonSummary || "")}</td>
        <td>${esc((row.changedPaths ?? []).join(", "))}</td>
        <td>${renderValue(ctx, row.targetIds ?? [])}</td>
      </tr>
    `)));
    setAuthoredDetailSection(sections, runHistorySurface, detailKind, renderAuthoredSurfaceTable(runHistorySurface, renderRowsFromSurfaceSchema(runHistorySurface, "rowFields", runRows, ctx, run => `
      <tr>
        <td>${esc(run.status || "")}</td>
        <td>${renderConceptLink(ctx, run.id)}</td>
        <td>${run.branchId ? renderConceptLink(ctx, run.branchId) : ""}</td>
        <td>${esc(run.durationMs ?? "")}</td>
        <td>${esc(run.exitCode ?? "")}</td>
      </tr>
    `)));
    return renderAuthoredDetailLayout(surface, sections);
  }
  if (recordMatchesIdPrefixes(detail, runtimeRevisionIdPrefixes)) {
    const detailKind = "runtimeRevision";
    const revision = detail;
    const builds = (model.snapshotBuilds ?? []).filter(build => Number(build.revision || 0) === Number(revision.revision || 0)).slice(0, surfaceRowLimit(buildHistorySurface, 12));
    const errors = (model.snapshotBuildErrors ?? []).filter(error => Number(error.revision || 0) === Number(revision.revision || 0)).slice(0, surfaceRowLimit(buildErrorsSurface, 12));
    const buildRows = builds.map(build => ({ ...build }));
    const errorRows = errors.map(error => ({ ...error }));
    const diagnosticsRecord = {
      ...revision,
      snapshotDiagnostics: model.snapshotDiagnostics,
      testMonitorDiagnostics: model.testMonitorDiagnostics,
      verificationPersistence: model.verificationPersistence,
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
    const sections = new Map();
    setAuthoredDetailSection(sections, primarySurface, detailKind, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, revision, usedKeys)}
    `);
    setAuthoredDetailSection(sections, relatedSurface, detailKind, `
      ${renderCardSpecs(relatedSurface, "runtimeRevisionLinkCards", "runtimeRevisionLinkCardEmptyStates", ctx, revision, "links")}
      ${renderPropertyCard(diagnosticsCard)}
    `);
    setAuthoredDetailSection(sections, buildHistorySurface, detailKind, renderAuthoredSurfaceTable(buildHistorySurface, renderRowsFromSurfaceSchema(buildHistorySurface, "rowFields", buildRows, ctx, build => `
      <tr>
        <td>${esc(build.status || "")}</td>
        <td>${esc(build.id || "")}</td>
        <td>${build.candidateSnapshotId ? renderConceptLink(ctx, build.candidateSnapshotId) : ""}</td>
        <td>${build.branchId ? renderConceptLink(ctx, build.branchId) : ""}</td>
        <td>${esc(build.errorCount ?? 0)}</td>
      </tr>
    `)));
    setAuthoredDetailSection(sections, buildErrorsSurface, detailKind, renderAuthoredSurfaceTable(buildErrorsSurface, renderRowsFromSurfaceSchema(buildErrorsSurface, "rowFields", errorRows, ctx, error => `
      <tr>
        <td>${esc(error.snapshotBuildId || "")}</td>
        <td>${esc(error.path || "")}</td>
        <td>${esc(error.kind || "")}</td>
        <td>${esc(error.message || "")}</td>
      </tr>
    `)));
    return renderAuthoredDetailLayout(surface, sections);
  }
  if (recordMatchesIdPrefixes(detail, candidateSnapshotIdPrefixes)) {
    const detailKind = "candidateSnapshot";
    const snapshot = detail;
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "candidateSnapshotCardTitle", "candidateSnapshotFields", ctx, snapshot, "Candidate Snapshot Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "candidateSnapshotFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "candidateSnapshotFields")
        : ["id", "status", "branchId", "changeSetId", "revision"]),
      ...surfaceKeyList(primarySurface, "candidateSnapshotLongTailExcludedFields", ["files", "errors"])
    ];
    const sections = new Map();
    setAuthoredDetailSection(sections, primarySurface, detailKind, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, snapshot, usedKeys)}
    `);
    setAuthoredDetailSection(sections, relatedSurface, detailKind, `
      ${renderCardSpecs(relatedSurface, "candidateSnapshotTextCards", "candidateSnapshotTextCardEmptyStates", ctx, snapshot, "text")}
    `);
    return renderAuthoredDetailLayout(surface, sections);
  }
  const selectedReport = recordMatchesIdPrefixes(detail, testReportIdPrefixes) ? detail : null;
  const run = selectedReport
    ? ((model.testRuns ?? []).find(row => row.id === selectedReport.runId) ?? null)
    : detail;
  if (!run || (!recordMatchesIdPrefixes(run, testRunIdPrefixes) && detail.id)) {
    return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No verification rows are projected yet." });
  }
  const gateFreshness = (model.verificationFreshness ?? []).find(row =>
    String(row?.gateId || "") === String(run?.gateId || "")
    && String(row?.serverRunnerId || "") === String(run?.serverRunnerId || "")
    && String(row?.runtimeProfile || "") === String(run?.runtimeProfile || "")
  ) ?? null;
  const freshnessAtRead = gateFreshness
    ? {
        ...gateFreshness,
        status: gateFreshness.latestRunId === run.id || gateFreshness.latestPassedRunId === run.id
          ? gateFreshness.status
          : "stale",
        reasonSummary: gateFreshness.latestRunId === run.id || gateFreshness.latestPassedRunId === run.id
          ? gateFreshness.reasonSummary
          : (gateFreshness.reasonSummary || "Newer verification evidence exists for this gate.")
      }
    : null;
  const invalidationRows = (model.verificationInvalidations ?? [])
    .filter(row =>
      String(row?.gateId || "") === String(run?.gateId || "")
      && String(row?.serverRunnerId || "") === String(run?.serverRunnerId || "")
      && String(row?.runtimeProfile || "") === String(run?.runtimeProfile || "")
    )
    .sort((left, right) => String(right?.producedAt || "").localeCompare(String(left?.producedAt || "")))
    .slice(0, surfaceRowLimit(invalidationSurface, 20));
  const runRecord = {
    ...run,
    cacheHitRunId: run.cacheHit?.runId ?? null,
    freshnessAtReadStatus: freshnessAtRead?.status ?? null,
    freshnessAtReadSummary: freshnessAtRead?.reasonSummary ?? null,
    invalidationReasonKinds: invalidationRows.map(row => row.reasonKind),
    testRunEventsHref: "/api/platform-test-runs/events",
    backendRevisionEventsHref: "/api/runtime/backend-revisions/events"
  };
  const runReports = (model.testReports ?? []).filter(report => report.runId === run.id);
  const reportByKind = Object.fromEntries(runReports.map(report => [report.reportKind, report]));
  const summaryReport = selectedReport?.reportKind === "summary" ? selectedReport : (reportByKind.summary ?? null);
  const suitesReport = selectedReport?.reportKind === "suites" ? selectedReport : (reportByKind.suites ?? null);
  const failuresReport = selectedReport?.reportKind === "failures" ? selectedReport : (reportByKind.failures ?? null);
  const regressionReport = selectedReport?.reportKind === "regression" ? selectedReport : (reportByKind.regression ?? null);
  const artifactsById = new Map((model.testArtifacts ?? []).map(row => [row.id, row]));
  const suitesById = new Map((model.testSuites ?? []).map(row => [row.id, row]));
  const casesById = new Map((model.testCases ?? []).map(row => [row.id, row]));
  const artifactRows = selectedReport?.artifactIds?.length
    ? selectedReport.artifactIds.map(id => artifactsById.get(id)).filter(Boolean)
    : (model.testArtifacts ?? []).filter(row => row.runId === run.id);
  const suiteRows = suitesReport?.suiteIds?.length
    ? suitesReport.suiteIds.map(id => suitesById.get(id)).filter(Boolean)
    : (model.testSuites ?? []).filter(row => row.runId === run.id);
  const failureRows = failuresReport?.caseIds?.length
    ? failuresReport.caseIds.map(id => casesById.get(id)).filter(Boolean)
    : (model.testCases ?? []).filter(row => row.runId === run.id && ["failed", "error"].includes(String(row.status || "")));
  const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "testRunCardTitle", "testRunFields", ctx, runRecord, "Test Run Detail");
  const streamsCard = propertyRowsFromSurfaceSchema(relatedSurface, "testRunPropertyCardTitle", "testRunPropertyFields", ctx, runRecord, "Verification Streams");
  const usedKeys = rootKeysFromSurfaceSchema(primarySurface, "testRunFields").length
    ? rootKeysFromSurfaceSchema(primarySurface, "testRunFields")
    : ["id", "title", "status", "gateId", "branchId", "changeSetId", "candidateSnapshotId", "durationMs", "exitCode", "startedAt", "finishedAt"];
  const detailKind = selectedReport ? "testReport" : "testRun";
  const sections = new Map();
  setAuthoredDetailSection(sections, primarySurface, detailKind, `
    ${renderPropertyCard(primaryCard)}
    ${renderLongTailProperties(primarySurface, ctx, run, usedKeys)}
  `);
  setAuthoredDetailSection(sections, relatedSurface, detailKind, `
    ${renderPropertyCard(streamsCard)}
  `);
  if (freshnessAtRead) {
    const freshnessCard = propertyRowsFromSurfaceSchema(freshnessSurface, "propertyCardTitle", "propertyFields", ctx, freshnessAtRead, "Gate Freshness");
    setAuthoredDetailSection(sections, freshnessSurface, detailKind, renderPropertyCard(freshnessCard));
  }
  setAuthoredDetailSection(sections, invalidationSurface, detailKind, renderAuthoredSurfaceTable(
    invalidationSurface,
    renderRowsFromSurfaceSchema(invalidationSurface, "rowFields", invalidationRows, ctx, row => `
      <tr>
        <td>${esc(row.reasonKind || "")}</td>
        <td>${esc(row.reasonSummary || "")}</td>
        <td>${esc((row.changedPaths ?? []).join(", "))}</td>
        <td>${renderValue(ctx, row.targetIds ?? [])}</td>
      </tr>
    `)
  ));
  if (summaryReport) {
    const summaryRecord = {
      reportId: summaryReport.id,
      status: summaryReport.status,
      summary: summaryReport.summary,
      format: summaryReport.format ?? null,
      suiteCount: summaryReport.suiteCount ?? 0,
      caseCount: summaryReport.caseCount ?? 0,
      passedCount: summaryReport.passedCount ?? 0,
      failedCount: summaryReport.failedCount ?? 0,
      errorCount: summaryReport.errorCount ?? 0,
      skippedCount: summaryReport.skippedCount ?? 0,
      cached: summaryReport.cached === true ? "yes" : "no",
      producedAt: summaryReport.producedAt ?? null
    };
    const card = propertyRowsFromSurfaceSchema(reportSummarySurface, "propertyCardTitle", "propertyFields", ctx, summaryRecord, "Report Summary");
    setAuthoredDetailSection(sections, reportSummarySurface, detailKind, renderPropertyCard(card));
  }
  setAuthoredDetailSection(sections, artifactsSurface, detailKind, renderAuthoredSurfaceTable(
    artifactsSurface,
    renderRowsFromSurfaceSchema(artifactsSurface, "rowFields", artifactRows.slice(0, surfaceRowLimit(artifactsSurface, 12)), ctx, artifact => `
      <tr>
        <td>${esc(artifact.artifactKind || "")}</td>
        <td>${renderConceptLink(ctx, artifact.id)}</td>
        <td>${artifact.contentUrl ? `<a href="${esc(artifact.contentUrl)}" target="_blank" rel="noreferrer">${esc(artifact.fileName || "")}</a>` : esc(artifact.fileName || "")}</td>
        <td>${esc(artifact.contentType || "")}</td>
        <td>${esc(artifact.sizeBytes ?? "")}</td>
      </tr>
    `)
  ));
  setAuthoredDetailSection(sections, suiteSummarySurface, detailKind, renderAuthoredSurfaceTable(
    suiteSummarySurface,
    renderRowsFromSurfaceSchema(suiteSummarySurface, "rowFields", suiteRows.slice(0, surfaceRowLimit(suiteSummarySurface, 12)), ctx, suite => `
      <tr>
        <td>${esc(suite.status || "")}</td>
        <td>${renderConceptLink(ctx, suite.id)}</td>
        <td>${esc(suite.total ?? "")}</td>
        <td>${esc(suite.failed ?? "")}</td>
        <td>${esc(suite.errors ?? "")}</td>
      </tr>
    `)
  ));
  setAuthoredDetailSection(sections, failingCasesSurface, detailKind, renderAuthoredSurfaceTable(
    failingCasesSurface,
    renderRowsFromSurfaceSchema(failingCasesSurface, "rowFields", failureRows.slice(0, surfaceRowLimit(failingCasesSurface, 20)), ctx, testCase => `
      <tr>
        <td>${esc(testCase.status || "")}</td>
        <td>${renderConceptLink(ctx, testCase.id)}</td>
        <td>${testCase.suiteId ? renderConceptLink(ctx, testCase.suiteId) : ""}</td>
        <td>${esc(testCase.classname || "")}</td>
        <td>${esc(testCase.durationMs ?? "")}</td>
      </tr>
    `)
  ));
  if (regressionReport) {
    const regression = regressionReport.regressionSummary ?? {};
    const regressionRecord = {
      reportId: regressionReport.id,
      status: regressionReport.status,
      summary: regressionReport.summary,
      baselineRunId: regression.baselineRunId ?? null,
      baselineDurationMs: regression.baselineDurationMs ?? null,
      currentDurationMs: regression.currentDurationMs ?? null,
      deltaMs: regression.deltaMs ?? null,
      deltaPercent: regression.deltaPercent == null ? null : `${regression.deltaPercent >= 0 ? "+" : ""}${Math.round(regression.deltaPercent)}%`
    };
    const card = propertyRowsFromSurfaceSchema(regressionSurface, "propertyCardTitle", "propertyFields", ctx, regressionRecord, "Regression Summary");
    setAuthoredDetailSection(sections, regressionSurface, detailKind, renderPropertyCard(card));
  }
  return renderAuthoredDetailLayout(surface, sections);
}

function renderKnowledgeDetail(surface, detail, model, ctx) {
  const primarySurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "primary", "PlatformKnowledgePrimaryPanel");
  const relatedSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "related", "PlatformKnowledgeRelatedPanel");
  const sectionsSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "sections", "PlatformKnowledgeSections");
  const tasksSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "tasks", "PlatformKnowledgeTasks");
  const documentPathField = surfacePropText(surface, "documentPathField", "path");
  const roadmapTaskIdPrefixes = surfaceIdPrefixes(surface, "roadmapTaskIdPrefixes");
  const roadmapTaskFallbackField = surfacePropText(surface, "roadmapTaskFallbackField", "");
  const epicIdPrefixes = surfaceIdPrefixes(surface, "epicIdPrefixes");
  const featureIdPrefixes = surfaceIdPrefixes(surface, "featureIdPrefixes");
  const folderIdPrefixes = surfaceIdPrefixes(surface, "folderIdPrefixes");
  const emptyDetail = () => renderSurfaceEmptyCard(surface, {
    title: surfacePropText(surface, "emptyTitle", "Detail"),
    message: surfaceEmptyState(surface, "No knowledge rows are projected yet.")
  });
  if (!detail) return emptyDetail();
  if (resolveFieldPath(detail, documentPathField)) {
    const detailKind = "document";
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
    const detailSections = new Map();
    setAuthoredDetailSection(detailSections, primarySurface, detailKind, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, doc, usedKeys)}
    `);
    setAuthoredDetailSection(detailSections, relatedSurface, detailKind, `
      ${renderAuthoredCardSpecChildren(relatedSurface, detailKind, ctx, doc)}
    `);
    setAuthoredDetailSection(detailSections, sectionsSurface, detailKind, renderAuthoredSurfaceTable(sectionsSurface, renderRowsFromSurfaceSchema(sectionsSurface, "rowFields", sections, ctx, section => `
      <tr>
        <td>${esc(section.title || "")}</td>
        <td>${esc(section.line ?? "")}</td>
        <td>${esc(section.depth ?? "")}</td>
      </tr>
    `)));
    setAuthoredDetailSection(detailSections, tasksSurface, detailKind, renderAuthoredSurfaceTable(tasksSurface, renderRowsFromSurfaceSchema(tasksSurface, "rowFields", tasks, ctx, task => `
      <tr>
        <td>${esc(task.status || "")}</td>
        <td>${task.id ? renderConceptLink(ctx, task.id, task.title || task.id) : esc(task.title || "")}</td>
        <td>${esc(task.line ?? "")}</td>
        <td>${esc(task.section || "")}</td>
      </tr>
    `)));
    return renderAuthoredDetailLayout(surface, detailSections);
  }
  if (recordMatchesIdPrefixes(detail, roadmapTaskIdPrefixes) || (roadmapTaskFallbackField && resolveFieldPath(detail, roadmapTaskFallbackField))) {
    const detailKind = "roadmapTask";
    const task = detail;
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "roadmapTaskCardTitle", "roadmapTaskFields", ctx, task, "Roadmap Task Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "roadmapTaskFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "roadmapTaskFields")
        : ["id", "title", "status", "derivedStatus", "section", "doc", "line"]),
      ...surfaceKeyList(primarySurface, "roadmapTaskLongTailExcludedFields", ["targets", "derivedSummary", "evidence"])
    ];
    const detailSections = new Map();
    setAuthoredDetailSection(detailSections, primarySurface, detailKind, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, task, usedKeys)}
    `);
    setAuthoredDetailSection(detailSections, relatedSurface, detailKind, `
      ${renderAuthoredCardSpecChildren(relatedSurface, detailKind, ctx, task)}
    `);
    return renderAuthoredDetailLayout(surface, detailSections);
  }
  if (recordMatchesIdPrefixes(detail, epicIdPrefixes)) {
    const detailKind = "epic";
    const epic = detail;
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "epicCardTitle", "epicFields", ctx, epic, "Epic Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "epicFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "epicFields")
        : ["id", "title", "status", "roadmapId", "branchIds", "featureIds", "gateIds", "docIds"]),
      ...surfaceKeyList(primarySurface, "epicLongTailExcludedFields", ["defectClusterIds"])
    ];
    const detailSections = new Map();
    setAuthoredDetailSection(detailSections, primarySurface, detailKind, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, epic, usedKeys)}
    `);
    setAuthoredDetailSection(detailSections, relatedSurface, detailKind, `
      ${renderAuthoredCardSpecChildren(relatedSurface, detailKind, ctx, epic)}
    `);
    return renderAuthoredDetailLayout(surface, detailSections);
  }
  if (recordMatchesIdPrefixes(detail, folderIdPrefixes)) {
    const detailKind = "folder";
    const folder = {
      ...detail,
      linkedConcepts: [...new Set((model.edges ?? [])
        .flatMap(edge => {
          if (edge.from === detail.id) return [edge.to];
          if (edge.to === detail.id) return [edge.from];
          return [];
        })
        .filter(Boolean)
        .sort((left, right) => String(left).localeCompare(String(right))))]
    };
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "folderCardTitle", "folderFields", ctx, folder, "Folder Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "folderFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "folderFields")
        : ["id", "title", "path", "facet", "source"]),
      ...surfaceKeyList(primarySurface, "folderLongTailExcludedFields", ["linkedConcepts"])
    ];
    const detailSections = new Map();
    setAuthoredDetailSection(detailSections, primarySurface, detailKind, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, folder, usedKeys)}
    `);
    setAuthoredDetailSection(detailSections, relatedSurface, detailKind, `
      ${renderAuthoredCardSpecChildren(relatedSurface, detailKind, ctx, folder)}
    `);
    return renderAuthoredDetailLayout(surface, detailSections);
  }
  const detailKind = "feature";
  const feature = detail;
  if (!recordMatchesIdPrefixes(feature, featureIdPrefixes) && detail.id) {
    return emptyDetail();
  }
  const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "featureCardTitle", "featureFields", ctx, feature, "Feature Detail");
  const usedKeys = [
    ...(rootKeysFromSurfaceSchema(primarySurface, "featureFields").length
      ? rootKeysFromSurfaceSchema(primarySurface, "featureFields")
      : ["id", "title", "status", "epicId", "branchIds", "gateIds", "docIds"]),
    ...surfaceKeyList(primarySurface, "featureLongTailExcludedFields", ["defectClusterIds"])
  ];
  const detailSections = new Map();
  setAuthoredDetailSection(detailSections, primarySurface, detailKind, `
    ${renderPropertyCard(primaryCard)}
    ${renderLongTailProperties(primarySurface, ctx, feature, usedKeys)}
  `);
  setAuthoredDetailSection(detailSections, relatedSurface, detailKind, `
    ${renderAuthoredCardSpecChildren(relatedSurface, detailKind, ctx, feature)}
  `);
  return renderAuthoredDetailLayout(surface, detailSections);
}

function renderSignalDetail(surface, detail, model, ctx) {
  const primarySurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "primary", "PlatformSignalPrimaryPanel");
  const relatedSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "related", "PlatformSignalRelatedPanel");
  const relationshipsSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "relationships", "PlatformSignalRelationships");
  const gapIdPrefixes = surfaceIdPrefixes(surface, "gapIdPrefixes");
  const signalNodeKinds = surfaceValueList(surface, "signalNodeKinds");
  const emptyDetail = () => renderSurfaceEmptyCard(surface, {
    title: surfacePropText(surface, "emptyTitle", "Detail"),
    message: surfaceEmptyState(surface, "No signal rows are projected yet.")
  });
  if (!detail) return emptyDetail();
  if (recordMatchesIdPrefixes(detail, gapIdPrefixes)) {
    const detailKind = "gap";
    const gap = detail;
    const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "gapCardTitle", "gapFields", ctx, gap, "Gap Detail");
    const usedKeys = [
      ...(rootKeysFromSurfaceSchema(primarySurface, "gapFields").length
        ? rootKeysFromSurfaceSchema(primarySurface, "gapFields")
        : ["id", "severity", "kind", "target", "reason"]),
      ...surfaceKeyList(primarySurface, "gapLongTailExcludedFields", ["recommendedProposal", "missingInGenerated", "extraInGenerated"])
    ];
    const sections = new Map();
    setAuthoredDetailSection(sections, primarySurface, detailKind, `
      ${renderPropertyCard(primaryCard)}
      ${renderLongTailProperties(primarySurface, ctx, gap, usedKeys)}
    `);
    setAuthoredDetailSection(sections, relatedSurface, detailKind, `
      ${renderCardSpecs(relatedSurface, "gapLinkCards", "gapLinkCardEmptyStates", ctx, gap, "links")}
      ${renderCardSpecs(relatedSurface, "gapTextCards", "gapTextCardEmptyStates", ctx, gap, "text")}
    `);
    setAuthoredDetailSection(sections, relationshipsSurface, detailKind, renderAuthoredSurfaceTable(relationshipsSurface, []));
    return renderAuthoredDetailLayout(surface, sections);
  }
  const detailKind = "signal";
  const node = detail;
  if (!recordMatchesKinds(node, signalNodeKinds) && detail.id) {
    return emptyDetail();
  }
  const relatedEdges = (model.edges ?? []).filter(edge => edge.from === node.id || edge.to === node.id).slice(0, surfaceRowLimit(relationshipsSurface, 20));
  const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "signalCardTitle", "signalFields", ctx, node, "Signal Detail");
  const usedKeys = rootKeysFromSurfaceSchema(primarySurface, "signalFields").length
    ? rootKeysFromSurfaceSchema(primarySurface, "signalFields")
    : ["id", "kind", "title", "status", "owner", "source", "lifecycle"];
  const sections = new Map();
  setAuthoredDetailSection(sections, primarySurface, detailKind, `
    ${renderPropertyCard(primaryCard)}
    ${renderLongTailProperties(primarySurface, ctx, node, usedKeys)}
  `);
  setAuthoredDetailSection(sections, relationshipsSurface, detailKind, renderAuthoredSurfaceTable(relationshipsSurface, renderRowsFromSurfaceSchema(relationshipsSurface, "rowFields", relatedEdges, ctx, edge => `
        <tr>
          <td>${renderConceptLink(ctx, edge.from)}</td>
          <td>${esc(edge.rel || "")}</td>
          <td>${renderConceptLink(ctx, edge.to)}</td>
        </tr>
      `)));
  return renderAuthoredDetailLayout(surface, sections);
}

function renderModelDetail(surface, node, model, ctx) {
  const detailKind = "object";
  const primarySurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "primary", "PlatformModelPrimaryPanel");
  const relationshipsSurface = authoredChildSurfaceByProp(surface, "detailPanelRole", "relationships", "PlatformModelRelationships");
  if (!node) return renderSurfaceEmptyCard(surface, { title: "Detail", message: "No platform objects are projected yet." });
  const relatedEdges = (model.edges ?? []).filter(edge => edge.from === node.id || edge.to === node.id).slice(0, surfaceRowLimit(relationshipsSurface, 20));
  const primaryCard = propertyRowsFromSurfaceSchema(primarySurface, "objectCardTitle", "objectFields", ctx, node, "Platform Object Detail");
  const usedKeys = rootKeysFromSurfaceSchema(primarySurface, "objectFields").length
    ? rootKeysFromSurfaceSchema(primarySurface, "objectFields")
    : ["id", "kind", "title", "status", "owner", "source", "lifecycle"];
  const sections = new Map();
  setAuthoredDetailSection(sections, primarySurface, detailKind, `
    ${renderPropertyCard(primaryCard)}
    ${renderLongTailProperties(primarySurface, ctx, node, usedKeys)}
  `);
  setAuthoredDetailSection(sections, relationshipsSurface, detailKind, renderAuthoredSurfaceTable(relationshipsSurface, renderRowsFromSurfaceSchema(relationshipsSurface, "rowFields", relatedEdges, ctx, edge => `
        <tr>
          <td>${renderConceptLink(ctx, edge.from)}</td>
          <td>${esc(edge.rel || "")}</td>
          <td>${renderConceptLink(ctx, edge.to)}</td>
        </tr>
      `)));
  return renderAuthoredDetailLayout(surface, sections);
}

function recordsForAuthoredListSource(source, model) {
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
    case "bridges":
    case "governance":
    case "semantics":
    case "packageCoexistence":
    case "packageConvergence":
      return platformSourceRows(source, model);
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

function renderAuthoredFormSection(surface, model) {
  const fields = parseFormFieldEntries(surface?.props?.formFields);
  const defaultsMap = parseSurfaceLabelMap(surface?.props?.fieldDefaults);
  const placeholdersMap = parseSurfaceLabelMap(surface?.props?.fieldPlaceholders);
  const rowMap = parseSurfaceLabelMap(surface?.props?.fieldRows);
  const formId = surfacePropText(surface, "formId", `${surface?.name || "platform-form"}`);
  const statusId = surfacePropText(surface, "statusId", `${surface?.name || "platform-status"}`);
  const clientAction = optionalText(surface?.props?.clientAction);
  const requestSpec = surfaceFormRequestSpec(surface);
  const fieldSyncs = surfaceFieldSyncSpecs(surface);
  const requestAttrs = requestSpec ? ` data-platform-submit-spec="${esc(JSON.stringify(requestSpec))}"` : "";
  const syncAttrs = fieldSyncs.length ? ` data-platform-field-syncs="${esc(JSON.stringify(fieldSyncs))}"` : "";
  return renderSurfaceFrame(surface, `
      <form id="${esc(formId)}"${clientAction ? ` data-platform-client-action="${esc(clientAction)}"` : ""}${requestAttrs}${syncAttrs} data-platform-status-id="${esc(statusId)}">
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

function renderAuthoredRecordDetailSection(surface, detail, ctx) {
  if (!detail) {
    return renderSurfaceEmptyCard(surface, {
      title: surfacePropText(surface, "emptyTitle", surface.title || "Detail"),
      message: surfaceEmptyState(surface, "No rows are projected yet.")
    });
  }
  const primaryCard = propertyRowsFromSurfaceSchema(
    surface,
    "detailCardTitle",
    "primaryFields",
    ctx,
    detail,
    surfacePropText(surface, "detailCardTitle", surface.title || "Detail"),
    []
  );
  const primaryKeys = new Set([
    ...rootKeysFromSurfaceSchema(surface, "primaryFields"),
    ...surfaceKeyList(surface, "longTailExcludedFields", ["title", "scope", "summary"])
  ]);
  return renderSurfaceFrame(surface, `
    <div class="grid2">
      <div>${renderPropertyCard(primaryCard)}</div>
      <div>${renderRecordLongTailTable(ctx, surfacePropText(surface, "longTailCardTitle", "Properties"), detail, [...primaryKeys])}</div>
    </div>
  `);
}

function renderAuthoredDetailSourceSection(surface, model, ctx) {
  switch (surfacePropText(surface, "detailSource", "")) {
    case "workflow":
      return renderSurfaceFrame(surface, renderWorkflowDetail(
        surface,
        findAuthoredDetailBySources(surface, model, ctx.id),
        model,
        ctx
      ));
    case "verification":
      return renderSurfaceFrame(surface, renderVerificationDetail(
        surface,
        findAuthoredDetailBySources(surface, model, ctx.id),
        model,
        ctx
      ));
    case "knowledge":
      return renderSurfaceFrame(surface, renderKnowledgeDetail(
        surface,
        findAuthoredDetailBySources(surface, model, ctx.id),
        model,
        ctx
      ));
    case "signals":
      return renderSurfaceFrame(surface, renderSignalDetail(
        surface,
        findAuthoredDetailBySources(surface, model, ctx.id),
        model,
        ctx
      ));
    case "model":
      return renderSurfaceFrame(surface, renderModelDetail(
        surface,
        findAuthoredDetailBySources(surface, model, ctx.id),
        model,
        ctx
      ));
    case "bridges":
    case "governance":
    case "semantics":
    case "packageCoexistence":
    case "packageConvergence":
    case "packageApplyPreview":
      return renderAuthoredRecordDetailSection(
        surface,
        findAuthoredDetailBySources(surface, model, ctx.id, [surfacePropText(surface, "detailSource", "")]),
        ctx
      );
    default:
      return "";
  }
}

function renderPlatformClientRuntime({
  enableVerificationLiveUpdates = false,
  fragmentHref = null
} = {}) {
  return `
    <script>
      (function () {
        const platformPageState = {
          enableVerificationLiveUpdates: ${enableVerificationLiveUpdates ? "true" : "false"},
          testRunEventsHref: "/api/platform-test-runs/events",
          backendRevisionEventsHref: "/api/runtime/backend-revisions/events",
          fragmentHref: ${fragmentHref ? JSON.stringify(fragmentHref) : "null"}
        };
        function escapeHtml(value) {
          return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
        }
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
        function parseSubmitSpec(form) {
          const raw = form && form.getAttribute("data-platform-submit-spec");
          if (!raw) return null;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        }
        function parseFieldSyncSpecs(form) {
          const raw = form && form.getAttribute("data-platform-field-syncs");
          if (!raw) return [];
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }
        function assignBodyPath(target, path, value) {
          const tokens = String(path || "").match(/[^.[\\]]+|\\[\\d+\\]/g) || [];
          if (!tokens.length) return;
          let cursor = target;
          for (let index = 0; index < tokens.length; index += 1) {
            const token = tokens[index];
            const isIndex = token.startsWith("[") && token.endsWith("]");
            const key = isIndex ? Number(token.slice(1, -1)) : token;
            const next = tokens[index + 1];
            const nextIsIndex = Boolean(next && next.startsWith("[") && next.endsWith("]"));
            if (index === tokens.length - 1) {
              cursor[key] = value;
              return;
            }
            if (cursor[key] === undefined) cursor[key] = nextIsIndex ? [] : {};
            cursor = cursor[key];
          }
        }
        function formFieldRequestValue(form, entry) {
          const element = form && form.elements ? form.elements[entry.source] : null;
          const raw = element ? element.value : "";
          switch (entry.mode) {
            case "json":
              try {
                return JSON.parse(raw || "null");
              } catch {
                return { __platformInvalidJson: true, raw };
              }
            case "nullable":
              return raw === "" ? null : raw;
            case "value":
            default:
              return raw;
          }
        }
        function resolveMessagePath(context, pathSpec) {
          const alternatives = String(pathSpec || "").split("||").map(part => part.trim()).filter(Boolean);
          for (const candidate of alternatives) {
            const segments = candidate.split(".").map(part => part.trim()).filter(Boolean);
            let value = context;
            let found = true;
            for (const segment of segments) {
              if (value && typeof value === "object" && segment in value) value = value[segment];
              else {
                found = false;
                break;
              }
            }
            if (found && value !== undefined && value !== null && value !== "") return value;
            if (!segments.length) continue;
            if (segments.length === 1 && !(segments[0] in (context || {}))) return candidate;
          }
          return "";
        }
        function renderMessageTemplate(template, context) {
          return String(template || "").replaceAll(/\\{([^}]+)\\}/g, (_, pathSpec) => String(resolveMessagePath(context, pathSpec)));
        }
        function submitContext(form, submitter) {
          const context = {};
          Array.from(form?.elements || []).forEach(element => {
            if (element?.name) context[element.name] = element.value;
          });
          if (submitter?.name) context[submitter.name] = submitter.value;
          return context;
        }
        function resolveSubmitPath(form, pathTemplate) {
          return String(pathTemplate || "").replaceAll(/\\{([^}]+)\\}/g, (_, fieldName) => {
            const value = form?.elements?.[fieldName]?.value || "";
            return encodeURIComponent(value);
          });
        }
        function bindAuthoredJsonSubmit(form) {
          const spec = parseSubmitSpec(form);
          if (!spec || !spec.path) return false;
          form.addEventListener("submit", async event => {
            event.preventDefault();
            const context = submitContext(form, event.submitter);
            for (const [fieldName, message] of Object.entries(spec.requiredFieldMessages || {})) {
              if (!context[fieldName]) {
                setFormStatus(form, message || "Required field missing.");
                return;
              }
            }
            const requestPath = String(spec.path || "").replaceAll(/\\{([^}]+)\\}/g, (_, fieldName) => encodeURIComponent(context[fieldName] || ""));
            const bodyEntries = Array.isArray(spec.bodyFields) ? spec.bodyFields : [];
            const requestBody = {};
            for (const entry of bodyEntries) {
              const value = formFieldRequestValue(form, entry);
              if (value && typeof value === "object" && value.__platformInvalidJson) {
                const invalidMessage = spec.invalidFieldMessages?.[entry.source] || "Invalid JSON.";
                setFormStatus(form, invalidMessage);
                return;
              }
              assignBodyPath(requestBody, entry.target, value);
            }
            const requestInit = {
              method: spec.method || "POST",
              headers: { "content-type": "application/json" }
            };
            if (bodyEntries.length) requestInit.body = JSON.stringify(requestBody);
            const response = await fetch(requestPath, requestInit);
            const json = await readResponseJson(response);
            const successMessage = spec.successMessageTemplate
              ? renderMessageTemplate(spec.successMessageTemplate, { ...json, ...context })
              : (spec.successMessage || "Submitted.");
            setFormStatus(form, response.ok ? successMessage : (json.error || spec.errorMessage || "Request failed."));
          });
          return true;
        }
        function bindAuthoredFieldSyncs(form) {
          const specs = parseFieldSyncSpecs(form);
          if (!specs.length) return;
          for (const spec of specs) {
            const source = form?.elements?.[spec.sourceField];
            const target = form?.elements?.[spec.targetField];
            if (!source || !target) continue;
            const sync = () => {
              let raw = "";
              if (String(spec.attr || "").startsWith("data-")) {
                const option = source.options ? source.options[source.selectedIndex] : null;
                raw = option ? (option.getAttribute(spec.attr) || "") : "";
              } else if (spec.attr === "value") {
                raw = source.value || "";
              }
              if (spec.mode === "jsonPretty") {
                try {
                  target.value = JSON.stringify(JSON.parse(raw || "null"), null, 2);
                } catch {}
                return;
              }
              target.value = raw;
            };
            source.addEventListener("change", sync);
            sync();
          }
        }
        function selectedVerificationId() {
          try {
            return new URL(window.location.href).searchParams.get("id") || null;
          } catch {
            return null;
          }
        }
        function reportRunId(reportId) {
          const raw = String(reportId || "").trim();
          if (!raw.startsWith("testReport:")) return null;
          const suffixIndex = raw.lastIndexOf(":");
          if (suffixIndex <= "testReport:".length) return null;
          return raw.slice("testReport:".length, suffixIndex);
        }
        function closeVerificationSources() {
          const sources = Array.isArray(window.__platformVerificationSources) ? window.__platformVerificationSources : [];
          for (const source of sources) {
            try { source.close(); } catch {}
          }
          window.__platformVerificationSources = [];
        }
        function platformContentMount() {
          return document.getElementById("platform-page-content");
        }
        async function refreshVerificationPage() {
          if (window.__platformVerificationRefreshInFlight) return;
          window.__platformVerificationRefreshInFlight = true;
          try {
            const response = await fetch(platformPageState.fragmentHref || window.location.href, { headers: { "x-platform-verification-refresh": "1" } });
            const html = await response.text();
            closeVerificationSources();
            if (platformPageState.fragmentHref) {
              const mount = platformContentMount();
              if (!mount) return;
              mount.innerHTML = html;
            } else {
              const next = new DOMParser().parseFromString(html, "text/html").querySelector("main");
              const current = document.querySelector("main");
              if (!next || !current) return;
              current.innerHTML = next.innerHTML;
            }
            bindPlatformPage(document);
          } catch {}
          window.__platformVerificationRefreshInFlight = false;
        }
        function scheduleVerificationRefresh() {
          clearTimeout(window.__platformVerificationRefreshTimer);
          window.__platformVerificationRefreshTimer = setTimeout(() => {
            void refreshVerificationPage();
          }, 150);
        }
        function shouldRefreshForTestRun(payload) {
          if (!payload || typeof payload !== "object") return false;
          const id = selectedVerificationId();
          if (!id) return payload.phase === "start" || payload.phase === "finish";
          if (id.startsWith("testRun:") || id.startsWith("testRun.")) return payload.runId === id;
          if (id.startsWith("testReport:")) return payload.runId === reportRunId(id);
          if (id.startsWith("gate:")) return payload.gateId === id;
          if (id.startsWith("candidateSnapshot:")) return payload.candidateSnapshotId === id;
          if (id.startsWith("runtimeRevision:") || id.startsWith("backendRevision:") || id.startsWith("frontendRevision:")) return payload.phase === "finish";
          return payload.phase === "finish";
        }
        function bindVerificationLiveUpdates() {
          if (!platformPageState.enableVerificationLiveUpdates || typeof EventSource !== "function") return;
          closeVerificationSources();
          const testRunSource = new EventSource(platformPageState.testRunEventsHref);
          testRunSource.addEventListener("testRun", event => {
            try {
              const payload = JSON.parse(event.data || "{}");
              if (shouldRefreshForTestRun(payload)) scheduleVerificationRefresh();
            } catch {}
          });
          testRunSource.onerror = () => {};
          const backendSource = new EventSource(platformPageState.backendRevisionEventsHref);
          let backendPrimed = false;
          backendSource.onmessage = () => {
            if (!backendPrimed) {
              backendPrimed = true;
              return;
            }
            scheduleVerificationRefresh();
          };
          backendSource.onerror = () => {};
          window.__platformVerificationSources = [testRunSource, backendSource];
        }
        function bindPlatformPage(root) {
          root.querySelectorAll("form[data-platform-submit-spec], form[data-platform-field-syncs]").forEach(form => {
            bindAuthoredFieldSyncs(form);
            bindAuthoredJsonSubmit(form);
          });
          bindVerificationLiveUpdates();
        }
        async function loadPlatformFragment() {
          const mount = platformContentMount();
          if (!platformPageState.fragmentHref || !mount) {
            bindPlatformPage(document);
            return;
          }
          try {
            const response = await fetch(platformPageState.fragmentHref, {
              headers: {
                accept: "text/html",
                "x-platform-page-fragment": "1"
              }
            });
            const html = await response.text();
            if (!response.ok) {
              mount.innerHTML = '<section class="card"><h2>Platform Page Unavailable</h2><div class="muted">' + escapeHtml(html || "Fragment request failed.") + '</div></section>';
              return;
            }
            mount.innerHTML = html;
            bindPlatformPage(document);
          } catch (error) {
            mount.innerHTML = '<section class="card"><h2>Platform Page Unavailable</h2><div class="muted">' + escapeHtml(error instanceof Error ? error.message : "Fragment request failed.") + '</div></section>';
          }
        }
        void loadPlatformFragment();
      }());
    </script>
  `;
}

function renderSurfaceSection(surface, model, ctx, consoleLayout) {
  if (surfacePropText(surface, "propertyRecordSource", "")) {
    return renderComputedPropertySection(surface, model, ctx);
  }
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
  if (surfaceFormRequestSpec(surface) || surfaceFieldSyncSpecs(surface).length) return true;
  return (surface.childSurfaces ?? []).some(child => surfaceNeedsClientScript(child));
}

function pageNeedsClientScript(pageSurface, ctx) {
  return surfaceNeedsClientScript(pageSurface) || isVerificationLivePage(ctx?.view);
}

function isVerificationLivePage(view) {
  return ["verification", "verificationStatus", "verificationRuns", "verificationRuntime"].includes(String(view || ""));
}

function renderPageFromSurface(pageSurface, model, ctx, consoleLayout, {
  includeClientRuntime = true,
  fragmentHref = null
} = {}) {
  const sections = (pageSurface?.childSurfaces ?? []).map(surface => renderSurfaceSection(surface, model, ctx, consoleLayout)).join("");
  return `
    ${renderSummaryCardsFromSurface(pageSurface, model)}
    ${sections}
    ${includeClientRuntime && pageNeedsClientScript(pageSurface, ctx)
      ? renderPlatformClientRuntime({
          enableVerificationLiveUpdates: isVerificationLivePage(ctx.view),
          fragmentHref
        })
      : ""}
  `;
}

function platformSourceRows(source, model) {
  switch (source) {
    case "bridges":
      return (model.compatibilityBridges ?? []).map(row => ({
        ...row,
        title: row.title || row.id,
        scope: row.owner || "",
        summary: inlineSummary(row.surfaces ?? [])
      }));
    case "governance":
      return [
        ...(model.governanceRoutes ?? []).map(row => ({
          ...row,
          pageKind: "route",
          title: `${row.method} ${row.matcher}`,
          objectLink: { id: row.id, title: `${row.method} ${row.matcher}` },
          scopeValue: row.handler || "",
          scope: row.handler || "",
          summary: row.notes || ""
        })),
        ...(model.proposalTargetGovernance ?? []).map(row => ({
          ...row,
          pageKind: "proposal-target",
          title: row.targetProcess,
          objectLink: { id: row.id, title: row.targetProcess },
          scopeValue: row.targetProcess || "",
          scope: row.authorityMechanism || "",
          summary: row.notes || ""
        }))
      ];
    case "semantics":
      return (model.mutableSurfaceSemantics ?? []).map(row => ({
        ...row,
        surfaceLink: { id: row.id, title: row.title || row.surface || row.id },
        scope: row.stateClass || "",
        summary: row.authorityRule || ""
      }));
    case "packageCoexistence":
      return (model.packageCoexistence ?? []).map(row => ({
        ...row,
        packageLink: { id: row.packageId, title: row.packageLabel || row.packageId },
        namespaceSelectionIds: (row.namespaceSelections ?? []).map(namespace => namespace.id),
        title: row.packageLabel || row.packageId,
        scope: row.coexistenceMode || "",
        summary: inlineSummary(row.selectedRevisionIds ?? [])
      }));
    case "packageConvergence":
      return (model.packageConvergence ?? []).map(row => ({
        ...row,
        packageLink: { id: row.packageId, title: row.packageLabel || row.packageId },
        remainingGlueMessages: (row.remainingGlue ?? []).map(item => item.message),
        title: row.packageLabel || row.packageId,
        scope: row.status || "",
        summary: row.explanation || ""
      }));
    case "packageApplyPreview":
      return (model.packageApplyPreviews ?? []).map(row => ({
        ...row,
        packageLink: { id: row.packageId, title: row.packageLabel || row.packageId },
        revisionLink: { id: row.id, title: row.revisionVersion ? `${row.packageLabel || row.packageId} ${row.revisionVersion}` : row.revisionId },
        title: row.title || row.revisionId,
        scope: row.status || "",
        summary: row.explanation || ""
      }));
    default:
      return [];
  }
}

function renderPlatformPageSkeleton(section) {
  return `
    <section class="platform-console-pane platform-console-pane-main">
      <section class="card platform-pane-placeholder">
        <h2>${esc(section.title)}</h2>
        <div class="muted" id="platform-page-status">Loading platform content...</div>
      </section>
    </section>
    <aside class="platform-console-pane platform-console-pane-detail">
      <section class="card platform-pane-placeholder">
        <h2>${esc(section.emptyDetailTitle)}</h2>
        <div class="muted">${esc(section.emptyDetailMessage)}</div>
      </section>
    </aside>
  `;
}

export function renderPlatformPageFragment(model, { requestUrl = null } = {}) {
  const { consoleLayout, section, pages, ctx } = resolvePlatformLocation(requestUrl);
  const pageModel = filterPlatformModel(model, section.modelView, ctx.id, {
    context: ctx.context,
    name: ctx.name,
    target: ctx.target
  });
  return renderSectionFragment(section, pages, pageModel, ctx, consoleLayout);
}

export function renderPlatformShellPage({ requestUrl = null } = {}) {
  const { consolePage, area, section, ctx } = resolvePlatformLocation(requestUrl);
  const fragmentHref = platformFragmentHref(ctx);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(consolePage.title || "Platform Console")} - ${esc(platformLocationTitle(area, section))}</title>
  <style>${renderPlatformConsoleCss()}${renderPlatformIaCss()}</style>
</head>
<body class="${esc(consolePage.className || "platform-console")}">
  <header>
    <h1>${esc(consolePage.title || "Platform Console")}</h1>
    <div class="muted">${esc(section.subtitle || consolePage.summary || "Platform self-inspection")}</div>
  </header>
  <main class="platform-console-shell" data-platform-fragment-href="${esc(fragmentHref)}">
    ${renderNav(ctx, area, section)}
    <section id="platform-page-content" class="platform-console-content" aria-live="polite" aria-busy="true">
      ${renderPlatformPageSkeleton(section)}
    </section>
  </main>
  ${renderPlatformClientRuntime({
    enableVerificationLiveUpdates: isVerificationLivePage(ctx.view),
    fragmentHref
  })}
</body>
</html>`;
}

export function renderPlatformPage(model, { requestUrl = null } = {}) {
  const { consoleLayout, consolePage, area, section, pages, ctx } = resolvePlatformLocation(requestUrl);
  const pageModel = filterPlatformModel(model, section.modelView, ctx.id, {
    context: ctx.context,
    name: ctx.name,
    target: ctx.target
  });
  const body = renderSectionFragment(section, pages, pageModel, ctx, consoleLayout);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(consolePage.title || "Platform Console")} - ${esc(platformLocationTitle(area, section))}</title>
  <style>${renderPlatformConsoleCss()}${renderPlatformIaCss()}</style>
</head>
<body class="${esc(consolePage.className || "platform-console")}">
  <header>
    <h1>${esc(consolePage.title || "Platform Console")}</h1>
    <div class="muted">${esc(section.subtitle || consolePage.summary || "Platform self-inspection")}</div>
  </header>
  <main class="platform-console-shell">
    ${renderNav(ctx, area, section)}
    <section id="platform-page-content" class="platform-console-content">
      ${body}
    </section>
  </main>
</body>
</html>`;
}
