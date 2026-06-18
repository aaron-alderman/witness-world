import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_REVISION_EVENTS_PATH } from "../../src/app-snapshot-manager.js";
import { moduleProjectors } from "../../src/modules.js";
import {
  platformBranchInsights,
  platformChangeSetInsights,
  PLATFORM_BRANCH_LIFECYCLE_LANES,
  summarizePlatformPathSystem,
  TELEMETRY_IMPACT_RULES
} from "./branch-insights.js";
import { platformProposalTemplates } from "./platform-proposals.js";
import { buildFlakeScoreByGate } from "./test-gate-catalog.js";

export const PLATFORM_LIFECYCLES = Object.freeze([
  "author",
  "transform",
  "execute",
  "observe",
  "verify",
  "ship",
  "steward"
]);

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pluginDir, "..", "..");

const CONTROL_DOCS = new Map([
  ["docs/CAPABILITIES.md", ["author", "steward"]],
  ["docs/RUNTIME-STACK-MAP.md", ["execute", "steward"]],
  ["docs/RUNTIME-AUDIT-INVENTORY.md", ["execute", "verify", "steward"]],
  ["docs/PLUGIN-MIGRATION-CONTROL.md", ["verify", "steward"]],
  ["docs/SHELLS-PERSISTENCE-ECOSYSTEM.md", ["ship", "steward"]],
  ["docs/PIPELINE-FIDELITY-AUDIT.md", ["transform", "verify"]],
  ["docs/AUTHORING-REPLAY-PLAYBOOK.md", ["author", "verify"]],
  ["docs/PLATFORM-ALL-THE-WAY-ROADMAP.md", ["author", "steward"]]
]);

const GOVERNED_DOC_TARGETS = Object.freeze({
  "docs/CAPABILITIES.md": Object.freeze(["plugin.platform", "plugin.mcp", "capability:platform.self"]),
  "docs/RUNTIME-STACK-MAP.md": Object.freeze(["bundle-core-runtime", "profile:full", "profile:minimal"]),
  "docs/RUNTIME-AUDIT-INVENTORY.md": Object.freeze(["runtime.core"]),
  "docs/PLUGIN-MIGRATION-CONTROL.md": Object.freeze(["plugin.authoring"]),
  "docs/SHELLS-PERSISTENCE-ECOSYSTEM.md": Object.freeze(["runtime.core"]),
  "docs/PIPELINE-FIDELITY-AUDIT.md": Object.freeze(["plugin.pipeline-runtime"]),
  "docs/AUTHORING-REPLAY-PLAYBOOK.md": Object.freeze(["plugin.authoring"]),
  "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md": Object.freeze(["plugin.platform"])
});

const PLATFORM_AUTHORED_SOURCES = Object.freeze([
  {
    id: "rvm:plugins/platform/platform-console.rvm",
    kind: "rvmSource",
    title: "Platform Console RVM",
    lifecycle: ["author", "observe", "steward"],
    source: "plugins/platform/platform-console.rvm"
  },
  {
    id: "wcss:plugins/platform/platform-console.wcss",
    kind: "wcssSource",
    title: "Platform Console WCSS",
    lifecycle: ["author", "observe", "steward"],
    source: "plugins/platform/platform-console.wcss"
  }
]);

const TEST_RUNNER_BOUNDARY_ID = "boundary:testRunner.platform";

const TEST_ENVIRONMENT_CATALOG = Object.freeze([
  { id: "local-node", title: "local node" },
  { id: "local-browser", title: "local browser" },
  { id: "local-rust-cargo", title: "local Rust/cargo" },
  { id: "isolated-temp-workspace", title: "isolated temp workspace" },
  { id: "platform-candidate-snapshot", title: "platform candidate snapshot" }
]);

const TEST_ENVIRONMENT_TITLES = Object.freeze(
  Object.fromEntries(TEST_ENVIRONMENT_CATALOG.map(environment => [`testEnvironment:${environment.id}`, environment.title]))
);

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function unique(values = []) {
  return [...new Set(values.map(String).filter(Boolean))];
}

function isKnownPlatformModelTarget(target, nodes) {
  const value = String(target || "");
  return Boolean(value) && (nodes.has(value) || Object.prototype.hasOwnProperty.call(TEST_ENVIRONMENT_TITLES, value));
}

function platformModelTargetTitle(target, nodes) {
  const value = String(target || "");
  return nodes.get(value)?.title || TEST_ENVIRONMENT_TITLES[value] || value;
}

function repoFileTargetId(relativePath) {
  const value = slash(relativePath);
  if (!value) return null;
  if (value.endsWith(".md")) return `doc:${value}`;
  if (value.endsWith(".rvm")) return `rvm:${value}`;
  if (value.endsWith(".wcss")) return `wcss:${value}`;
  if (value.endsWith(".wtoml")) return `wtoml:${value}`;
  if (value.endsWith(".json")) return `json:${value}`;
  return `file:${value}`;
}

function repoFileNodeKind(relativePath) {
  const value = slash(relativePath).toLowerCase();
  if (!value) return "fileSource";
  if (value.startsWith("test/") || value.includes(".test.") || value.includes(".spec.")) return "testFile";
  if (value.endsWith(".rvm")) return "rvmSource";
  if (value.endsWith(".wcss")) return "wcssSource";
  if (value.endsWith(".wtoml")) return "wtomlSource";
  if (value.endsWith(".json")) return "jsonSource";
  return "fileSource";
}

function repoFileLifecycle(relativePath) {
  const kind = repoFileNodeKind(relativePath);
  if (kind === "testFile") return lifecycleForTest(slash(relativePath));
  if (kind === "rvmSource" || kind === "wcssSource") return ["author", "observe", "steward"];
  if (kind === "wtomlSource") return ["author", "transform", "execute", "steward"];
  if (kind === "jsonSource") return ["author", "execute", "steward"];
  const value = slash(relativePath).toLowerCase();
  if (value.startsWith("plugins/")) return ["author", "execute", "steward"];
  if (value.startsWith("src/")) return ["transform", "execute", "steward"];
  if (value.startsWith("store/")) return ["execute", "steward"];
  return ["author", "steward"];
}

function repoFileOwner(relativePath) {
  const value = slash(relativePath);
  const pluginMatch = value.match(/^plugins\/([^/]+)\//);
  if (pluginMatch) return `plugin.${pluginMatch[1]}`;
  if (value.startsWith("src/") || value.startsWith("store/")) return "runtime.core";
  if (value.startsWith("test/")) return "tests";
  if (value.startsWith("examples/")) return "examples";
  if (value.startsWith("docs/")) return docOwnerForPath(value);
  return null;
}

function repoFileReferenceKind(targetId, nodes) {
  const kind = platformObjectKindForId(targetId, nodes);
  if (kind === "doc") return "doc";
  if (kind === "rvmSource") return "rvmSource";
  if (kind === "wcssSource") return "wcssSource";
  if (kind === "wtomlSource") return "wtomlSource";
  if (kind === "jsonSource") return "jsonSource";
  if (kind === "testFile") return "testFile";
  return "fileSource";
}

function addNode(nodes, node) {
  const id = String(node.id || "");
  if (!id) return;
  const existing = nodes.get(id);
  const next = {
    id,
    kind: String(node.kind || existing?.kind || "unknown"),
    title: String(node.title || existing?.title || id),
    lifecycle: unique([...(existing?.lifecycle ?? []), ...(node.lifecycle ?? [])]),
    owner: node.owner ?? existing?.owner ?? null,
    status: node.status ?? existing?.status ?? "known",
    source: node.source ?? existing?.source ?? "platform",
    command: node.command ?? existing?.command ?? null,
    sourceDependencies: unique([...(existing?.sourceDependencies ?? []), ...(node.sourceDependencies ?? [])])
  };
  nodes.set(id, next);
}

function addEdge(edges, from, rel, to, source = "platform") {
  if (!from || !rel || !to) return;
  const id = `${from}\u0000${rel}\u0000${to}`;
  if (edges.has(id)) return;
  edges.set(id, { from, rel, to, source });
}

async function readJson(relativePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), "utf8"));
  } catch {
    return fallback;
  }
}

async function readText(relativePath, fallback = "") {
  try {
    return await fs.readFile(path.join(repoRoot, relativePath), "utf8");
  } catch {
    return fallback;
  }
}

async function listFiles(root, predicate) {
  let entries = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...await listFiles(full, predicate));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function lifecycleForPlugin(id, manifest = {}) {
  const text = `${id} ${manifest.displayName || ""} ${manifest.description || ""}`.toLowerCase();
  const life = new Set(["execute"]);
  if (text.includes("author")) life.add("author");
  if (text.includes("bootstrap") || text.includes("proposal") || text.includes("starter")) life.add("author");
  if (text.includes("inspect") || text.includes("diagnostic") || text.includes("mcp")) life.add("observe");
  if (text.includes("asset") || text.includes("pipeline") || text.includes("stream") || text.includes("blob")) life.add("transform");
  if (text.includes("runtime") || text.includes("config") || text.includes("backend")) life.add("execute");
  if (text.includes("platform") || text.includes("steward")) life.add("steward");
  if (text.includes("operator") || text.includes("shell")) life.add("ship");
  return [...life];
}

function lifecycleForHandler(handler) {
  const id = String(handler || "");
  if (id.startsWith("page.") || id.includes(".read") || id.includes("diagnostics")) return ["observe"];
  if (id.includes("create") || id.includes("install") || id.includes("remove") || id.includes("update")) return ["author", "steward"];
  if (id.includes("backup") || id.includes("restore") || id.includes("export") || id.includes("import")) return ["ship", "steward"];
  return ["execute"];
}

function lifecycleForCapability(id) {
  const value = String(id || "");
  if (value.includes("asset") || value.includes("fs.") || value.includes("stream")) return ["transform", "execute"];
  if (value.includes("runtime") || value.includes("http") || value.includes("db") || value.includes("jobs")) return ["execute"];
  if (value.includes("platform")) return ["observe", "steward"];
  if (value.includes("notify") || value.includes("oauth") || value.includes("secret")) return ["execute", "steward"];
  return ["execute"];
}

function lifecycleForTest(relativePath) {
  const value = relativePath.toLowerCase();
  const life = new Set(["verify"]);
  if (value.includes("plugin") || value.includes("boundary")) life.add("steward");
  if (value.includes("runtime") || value.includes("host")) life.add("execute");
  if (value.includes("ui.") || value.includes("inspect")) life.add("observe");
  if (value.includes("pipeline") || value.includes("asset")) life.add("transform");
  return [...life];
}

function summarize(nodes, edges, profiles = []) {
  const byKind = {};
  const byLifecycle = {};
  const byStatus = {};
  for (const node of nodes.values()) {
    byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
    byStatus[node.status] = (byStatus[node.status] ?? 0) + 1;
    for (const lifecycle of node.lifecycle) byLifecycle[lifecycle] = (byLifecycle[lifecycle] ?? 0) + 1;
  }
  return {
    nodes: nodes.size,
    edges: edges.size,
    byKind,
    byLifecycle,
    byStatus,
    profiles: Object.fromEntries(profiles.map(profile => [profile.id, profile.plugins.length]))
  };
}

function buildBranchBoard(branches = []) {
  const lanes = PLATFORM_BRANCH_LIFECYCLE_LANES.map(id => ({ id, title: id, branches: [] }));
  const byId = Object.fromEntries(lanes.map(lane => [lane.id, lane]));
  for (const branch of branches) {
    const lane = byId[String(branch.lifecycleLane || "draft")] ?? byId.draft;
    lane.branches.push({
      id: branch.id,
      title: branch.title || branch.id,
      status: branch.status || "open",
      changeSetCount: Array.isArray(branch.changeSetIds) ? branch.changeSetIds.length : 0,
      reviewProposalCount: Array.isArray(branch.reviewProposalIds) ? branch.reviewProposalIds.length : 0,
      latestCandidateSnapshotId: branch.latestCandidateSnapshotId ?? null
    });
  }
  for (const lane of lanes) {
    lane.branches.sort((left, right) => String(left.id).localeCompare(String(right.id)));
    lane.count = lane.branches.length;
  }
  return lanes;
}

function aggregatePlanningStatus(statuses = []) {
  const values = unique(statuses);
  if (values.some(status => ["blocked", "invalid"].includes(status))) return "blocked";
  if (values.some(status => ["valid", "applied"].includes(status))) return "active";
  if (values.some(status => ["open", "draft", "validating"].includes(status))) return "open";
  if (values.some(status => ["closed", "rejected", "abandoned"].includes(status))) return "closed";
  return values[0] || "known";
}

function buildRoadmapPlanningRows({ roadmapDocPath, docs = [], branches = [], selectedTestGatesByBranch = Object.create(null) }) {
  const roadmapDoc = docs.find(doc => doc.path === roadmapDocPath) ?? null;
  const roadmapId = `roadmap:${roadmapDocPath}`;
  const epicsById = new Map();
  const featuresById = new Map();
  const branchesByEpic = Object.create(null);

  const ensureEpic = label => {
    const normalized = String(label || "").trim();
    if (!normalized) return null;
    const id = `epic:${slugify(normalized)}`;
    if (!epicsById.has(id)) {
      epicsById.set(id, {
        id,
        title: normalized,
        roadmapId,
        branchIds: [],
        featureIds: [],
        gateIds: [],
        docIds: [],
        status: "known"
      });
    }
    return epicsById.get(id);
  };

  const ensureFeature = (epicLabel, featureLabel) => {
    const normalizedFeature = String(featureLabel || "").trim();
    if (!normalizedFeature) return null;
    const normalizedEpic = String(epicLabel || "").trim();
    const id = normalizedEpic
      ? `feature:${slugify(normalizedEpic)}:${slugify(normalizedFeature)}`
      : `feature:${slugify(normalizedFeature)}`;
    if (!featuresById.has(id)) {
      featuresById.set(id, {
        id,
        title: normalizedFeature,
        epicId: normalizedEpic ? `epic:${slugify(normalizedEpic)}` : null,
        roadmapId,
        branchIds: [],
        gateIds: [],
        docIds: [],
        status: "known"
      });
    }
    return featuresById.get(id);
  };

  for (const branch of branches) {
    const branchId = String(branch.id || "");
    const epic = ensureEpic(branch.epic);
    const feature = ensureFeature(branch.epic, branch.feature);
    const gateIds = unique(selectedTestGatesByBranch[branchId] ?? []);
    const docIds = unique([
      ...(branch.docsFreshness?.requiredDocs ?? []),
      ...(branch.docsFreshness?.touchedDocs ?? []),
      ...(branch.docsFreshness?.missingDocs ?? [])
    ].map(doc => `doc:${doc}`));
    if (epic) {
      if (!epic.branchIds.includes(branchId)) epic.branchIds.push(branchId);
      epic.gateIds.push(...gateIds);
      epic.docIds.push(...docIds);
      pushByKey(branchesByEpic, epic.id, branchId);
    }
    if (feature) {
      if (!feature.branchIds.includes(branchId)) feature.branchIds.push(branchId);
      feature.gateIds.push(...gateIds);
      feature.docIds.push(...docIds);
      feature.status = aggregatePlanningStatus([feature.status, branch.status]);
    }
    if (epic && feature && !epic.featureIds.includes(feature.id)) epic.featureIds.push(feature.id);
    if (epic) epic.status = aggregatePlanningStatus([epic.status, branch.status]);
  }

  const epics = [...epicsById.values()]
    .map(row => ({
      ...row,
      branchIds: [...row.branchIds].sort(),
      featureIds: [...row.featureIds].sort(),
      gateIds: unique(row.gateIds).sort(),
      docIds: unique(row.docIds).sort()
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const features = [...featuresById.values()]
    .map(row => ({
      ...row,
      branchIds: [...row.branchIds].sort(),
      gateIds: unique(row.gateIds).sort(),
      docIds: unique(row.docIds).sort()
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  for (const key of Object.keys(branchesByEpic)) branchesByEpic[key] = unique(branchesByEpic[key]).sort();
  const testsByFeature = features.map(row => ({
    id: `testsByFeature:${row.id}`,
    featureId: row.id,
    epicId: row.epicId,
    roadmapId: row.roadmapId,
    branchIds: [...row.branchIds],
    gateIds: [...row.gateIds],
    gateCount: row.gateIds.length
  }));

  return {
    roadmaps: [{
      id: roadmapId,
      title: roadmapDoc?.path ?? roadmapDocPath,
      doc: roadmapDoc?.path ?? roadmapDocPath,
      docId: roadmapDoc?.id ?? `doc:${roadmapDocPath}`,
      epicIds: epics.map(row => row.id),
      featureIds: features.map(row => row.id),
      branchIds: unique(branches.flatMap(branch => branch.epic || branch.feature ? [branch.id] : [])).sort(),
      status: aggregatePlanningStatus(epics.map(row => row.status))
    }],
    epics,
    features,
    branchesByEpic,
    testsByFeature
  };
}

function pushByKey(target, key, value) {
  if (!target[key]) target[key] = [];
  target[key].push(value);
}

function candidateSnapshotsByBranchIndex(candidateSnapshots = []) {
  const byBranch = Object.create(null);
  for (const snapshot of candidateSnapshots) pushByKey(byBranch, snapshot.branchId, { ...snapshot });
  for (const rows of Object.values(byBranch)) {
    rows.sort((left, right) =>
      Number(right.revision || 0) - Number(left.revision || 0)
      || String(right.createdAt || "").localeCompare(String(left.createdAt || ""))
      || String(right.id || "").localeCompare(String(left.id || ""))
    );
  }
  return byBranch;
}

function normalizeSnapshotDiagnostics(appSnapshot = null) {
  if (!appSnapshot || typeof appSnapshot !== "object") return null;
  const lastRevisionEvent = appSnapshot.lastRevisionEvent && typeof appSnapshot.lastRevisionEvent === "object"
    ? {
        appRevision: Number(appSnapshot.lastRevisionEvent.appRevision || 0),
        changedSources: Array.isArray(appSnapshot.lastRevisionEvent.changedSources)
          ? appSnapshot.lastRevisionEvent.changedSources.map(String)
          : [],
        trigger: appSnapshot.lastRevisionEvent.trigger ? String(appSnapshot.lastRevisionEvent.trigger) : "initial"
      }
    : null;
  return {
    appRevision: Number(appSnapshot.appRevision || 0),
    lastGoodAppRevision: Number(appSnapshot.lastGoodAppRevision || appSnapshot.appRevision || 0),
    buildErrors: Array.isArray(appSnapshot.buildErrors) ? appSnapshot.buildErrors.map(error => ({ ...error })) : [],
    pendingDirtySources: Array.isArray(appSnapshot.pendingDirtySources) ? appSnapshot.pendingDirtySources.map(String) : [],
    activeSourceIds: Array.isArray(appSnapshot.activeSourceIds) ? appSnapshot.activeSourceIds.map(String) : [],
    sourceCount: Number(appSnapshot.sourceCount || 0),
    devMode: appSnapshot.devMode === true,
    frontendEventsPath: appSnapshot.frontendEventsPath ? String(appSnapshot.frontendEventsPath) : APP_REVISION_EVENTS_PATH,
    lastRevisionEvent
  };
}

function buildRuntimeRevisionRows(snapshotDiagnostics, candidateSnapshotsByBranch) {
  if (!snapshotDiagnostics?.appRevision) return [];
  return [{
    id: `runtimeRevision:backend:${snapshotDiagnostics.appRevision}`,
    backendRevisionId: `backendRevision:${snapshotDiagnostics.appRevision}`,
    revision: snapshotDiagnostics.appRevision,
    kind: "backend",
    status: snapshotDiagnostics.lastRevisionEvent?.status || "active",
    trigger: snapshotDiagnostics.lastRevisionEvent?.trigger || "initial",
    changedSources: [...(snapshotDiagnostics.lastRevisionEvent?.changedSources ?? [])],
    branchId: snapshotDiagnostics.lastRevisionEvent?.branchId ?? null,
    changeSetId: snapshotDiagnostics.lastRevisionEvent?.changeSetId ?? null,
    frontendRevisionId: snapshotDiagnostics.devMode ? `frontendRevision:${snapshotDiagnostics.appRevision}` : null,
    frontendEventsPath: snapshotDiagnostics.devMode ? snapshotDiagnostics.frontendEventsPath : null,
    pendingDirtySources: [...snapshotDiagnostics.pendingDirtySources],
    activeSourceIds: [...snapshotDiagnostics.activeSourceIds],
    sourceCount: snapshotDiagnostics.sourceCount,
    candidateBranchCount: Object.keys(candidateSnapshotsByBranch).length,
    buildErrorCount: snapshotDiagnostics.buildErrors.length,
    devMode: snapshotDiagnostics.devMode
  }];
}

function buildSnapshotBuildRows(candidateSnapshots = []) {
  return candidateSnapshots.map(snapshot => ({
    id: `snapshotBuild:${snapshot.id}`,
    candidateSnapshotId: snapshot.id,
    branchId: snapshot.branchId,
    changeSetId: snapshot.changeSetId,
    revision: Number(snapshot.revision || 0),
    status: snapshot.status === "valid" ? "succeeded" : "failed",
    createdAt: snapshot.createdAt ?? null,
    fileCount: Array.isArray(snapshot.files) ? snapshot.files.length : 0,
    errorCount: Array.isArray(snapshot.errors) ? snapshot.errors.length : 0
  }));
}

function buildSnapshotBuildErrorRows(candidateSnapshots = []) {
  const rows = [];
  for (const snapshot of candidateSnapshots) {
    const errors = Array.isArray(snapshot.errors) ? snapshot.errors : [];
    for (const [index, error] of errors.entries()) {
      rows.push({
        id: `snapshotBuildError:${snapshot.id}:${index + 1}`,
        snapshotBuildId: `snapshotBuild:${snapshot.id}`,
        candidateSnapshotId: snapshot.id,
        branchId: snapshot.branchId,
        changeSetId: snapshot.changeSetId,
        revision: Number(snapshot.revision || 0),
        kind: String(error?.kind || "validation"),
        message: String(error?.message || "snapshot build error"),
        sourcePath: error?.path ? String(error.path) : null
      });
    }
  }
  return rows;
}

function platformObjectKindForId(targetId, nodes) {
  const value = String(targetId || "");
  if (!value) return "platformObject";
  const knownKind = nodes.get(value)?.kind;
  if (knownKind) return knownKind;
  if (value.startsWith("plugin.")) return "plugin";
  if (value.startsWith("capability:")) return "capability";
  if (value.startsWith("route:")) return "route";
  if (value.startsWith("doc:")) return "doc";
  if (value.startsWith("rvm:")) return "rvmSource";
  if (value.startsWith("wcss:")) return "wcssSource";
  if (value.startsWith("wtoml:")) return "wtomlSource";
  if (value.startsWith("json:")) return "jsonSource";
  if (value.startsWith("file:")) return "fileSource";
  if (value.startsWith("roadmap:")) return "roadmap";
  if (value.startsWith("epic:")) return "epic";
  if (value.startsWith("feature:")) return "feature";
  if (value.startsWith("branch:")) return "branch";
  if (value.startsWith("proposal:")) return "proposal";
  return "platformObject";
}

function resolveMarkdownReferenceTargets(references = {}, nodes, routeIdsByMatcher = {}) {
  const targets = [];
  const seen = new Set();
  const pushTarget = (referenceKind, targetId) => {
    const normalizedTargetId = String(targetId || "");
    if (!normalizedTargetId) return;
    const key = [referenceKind, normalizedTargetId].join("\u0000");
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({
      referenceKind,
      targetId: normalizedTargetId,
      targetKind: platformObjectKindForId(normalizedTargetId, nodes),
      targetLabel: platformModelTargetTitle(normalizedTargetId, nodes)
    });
  };

  for (const routeRef of references.routes ?? []) {
    const routeId = routeIdsByMatcher[routeRef];
    if (routeId) pushTarget("route", routeId);
  }
  for (const pluginId of references.pluginIds ?? []) pushTarget("plugin", pluginId);
  for (const capabilityId of references.capabilityIds ?? []) pushTarget("capability", `capability:${capabilityId}`);
  for (const proposalId of references.proposalIds ?? []) pushTarget("proposal", `proposal:${proposalId}`);
  for (const branchId of references.branchIds ?? []) pushTarget("branch", `branch:${branchId}`);
  for (const filePath of references.filePaths ?? []) {
    const targetId = repoFileTargetId(filePath);
    if (!targetId || !nodes.has(targetId)) continue;
    pushTarget(repoFileReferenceKind(targetId, nodes), targetId);
  }
  return targets;
}

function buildDocProjectionRows(parsedDocs, nodes, routeIdsByMatcher = {}) {
  const docReferences = [];
  const docDependencies = [];
  const referenceSeen = new Set();
  const dependencySeen = new Set();

  const pushDependency = ({
    doc,
    dependencyKind,
    referenceKind = null,
    targetId
  }) => {
    const normalizedTargetId = String(targetId || "");
    if (!normalizedTargetId) return;
    const key = [
      doc.id,
      dependencyKind,
      referenceKind || "",
      normalizedTargetId
    ].join("\u0000");
    if (dependencySeen.has(key)) return;
    dependencySeen.add(key);
    docDependencies.push({
      id: `docDependency:${slugify(`${doc.path}:${dependencyKind}:${referenceKind || "dependency"}:${normalizedTargetId}`)}`,
      docId: doc.id,
      doc: doc.path,
      role: doc.role,
      owner: doc.owner,
      dependencyKind,
      referenceKind,
      targetId: normalizedTargetId,
      targetKind: platformObjectKindForId(normalizedTargetId, nodes),
      targetLabel: platformModelTargetTitle(normalizedTargetId, nodes)
    });
  };

  const pushReference = ({
    doc,
    referenceKind,
    targetId
  }) => {
    const normalizedTargetId = String(targetId || "");
    if (!normalizedTargetId) return;
    const key = [doc.id, referenceKind, normalizedTargetId].join("\u0000");
    if (referenceSeen.has(key)) return;
    referenceSeen.add(key);
    const row = {
      id: `docReference:${slugify(`${doc.path}:${referenceKind}:${normalizedTargetId}`)}`,
      docId: doc.id,
      doc: doc.path,
      role: doc.role,
      owner: doc.owner,
      referenceKind,
      targetId: normalizedTargetId,
      targetKind: platformObjectKindForId(normalizedTargetId, nodes),
      targetLabel: platformModelTargetTitle(normalizedTargetId, nodes)
    };
    docReferences.push(row);
    pushDependency({
      doc,
      dependencyKind: "references",
      referenceKind,
      targetId: normalizedTargetId
    });
  };

  for (const doc of parsedDocs) {
    for (const targetId of GOVERNED_DOC_TARGETS[doc.path] ?? []) {
      pushDependency({
        doc,
        dependencyKind: "governs",
        referenceKind: "governedObject",
        targetId
      });
    }
    for (const target of resolveMarkdownReferenceTargets(doc.references, nodes, routeIdsByMatcher)) {
      pushReference({
        doc,
        referenceKind: target.referenceKind,
        targetId: target.targetId
      });
    }
  }

  docReferences.sort((left, right) =>
    String(left.doc || "").localeCompare(String(right.doc || ""))
    || String(left.referenceKind || "").localeCompare(String(right.referenceKind || ""))
    || String(left.targetId || "").localeCompare(String(right.targetId || ""))
  );
  docDependencies.sort((left, right) =>
    String(left.doc || "").localeCompare(String(right.doc || ""))
    || String(left.dependencyKind || "").localeCompare(String(right.dependencyKind || ""))
    || String(left.referenceKind || "").localeCompare(String(right.referenceKind || ""))
    || String(left.targetId || "").localeCompare(String(right.targetId || ""))
  );

  return {
    docReferences,
    docDependencies
  };
}

function buildDocIndex(docs = []) {
  const byId = Object.create(null);
  const byPath = Object.create(null);
  const byRole = Object.create(null);
  const byOwner = Object.create(null);
  const byStatus = Object.create(null);
  for (const doc of docs) {
    byId[doc.id] = { ...doc };
    byPath[doc.path] = doc.id;
    pushByKey(byRole, doc.role || "unknown", doc.id);
    pushByKey(byOwner, doc.owner || "unowned", doc.id);
    pushByKey(byStatus, doc.status || "known", doc.id);
  }
  for (const bucket of [byRole, byOwner, byStatus]) {
    for (const key of Object.keys(bucket)) bucket[key] = unique(bucket[key]);
  }
  return {
    byId,
    byPath,
    byRole,
    byOwner,
    byStatus
  };
}

function buildDocsByPlatformObject(docs = [], docDependencies = []) {
  const docsById = Object.fromEntries(docs.map(doc => [doc.id, doc]));
  const byObject = Object.create(null);
  for (const dependency of docDependencies) {
    const doc = docsById[dependency.docId];
    if (!doc) continue;
    if (!byObject[dependency.targetId]) byObject[dependency.targetId] = [];
    let entry = byObject[dependency.targetId].find(row => row.docId === dependency.docId);
    if (!entry) {
      entry = {
        docId: doc.id,
        path: doc.path,
        role: doc.role,
        owner: doc.owner,
        status: doc.status,
        dependencyKinds: [],
        referenceKinds: []
      };
      byObject[dependency.targetId].push(entry);
    }
    if (!entry.dependencyKinds.includes(dependency.dependencyKind)) entry.dependencyKinds.push(dependency.dependencyKind);
    if (dependency.referenceKind && !entry.referenceKinds.includes(dependency.referenceKind)) entry.referenceKinds.push(dependency.referenceKind);
    entry.targetKind = dependency.targetKind;
    entry.targetLabel = dependency.targetLabel;
  }
  for (const entries of Object.values(byObject)) {
    entries.sort((left, right) => String(left.path || "").localeCompare(String(right.path || "")));
    for (const entry of entries) {
      entry.dependencyKinds = unique(entry.dependencyKinds);
      entry.referenceKinds = unique(entry.referenceKinds);
    }
  }
  return byObject;
}

function buildDocTaskEvidence(tasks = [], testGates = [], gaps = []) {
  const gapsByTarget = Object.create(null);
  for (const gap of gaps) {
    if (!gap?.target) continue;
    pushByKey(gapsByTarget, String(gap.target), gap);
  }
  return tasks.map(task => {
    const targets = Array.isArray(task.targets) ? task.targets : [];
    const targetIds = unique(targets.map(target => target.targetId));
    const linkedGates = testGates.filter(gate =>
      Array.isArray(gate.protectedObjects)
      && gate.protectedObjects.some(targetId => targetIds.includes(targetId))
    );
    const gapRows = unique(targetIds.flatMap(targetId => (gapsByTarget[targetId] ?? []).map(row => row.id)))
      .map(gapId => gaps.find(row => row.id === gapId))
      .filter(Boolean);
    const failedGateIds = linkedGates.filter(gate => ["failed", "error", "timedOut"].includes(gate.lastResult?.status)).map(gate => gate.id);
    const passedGateIds = linkedGates.filter(gate => gate.lastResult?.status === "passed").map(gate => gate.id);
    const unknownGateIds = linkedGates.filter(gate => !gate.lastResult?.status).map(gate => gate.id);
    let status = "unlinked";
    let summary = "No resolved platform targets.";
    if (targetIds.length && (gapRows.length || failedGateIds.length)) {
      status = "at-risk";
      summary = `${targetIds.length} target${targetIds.length === 1 ? "" : "s"}, ${gapRows.length} gap${gapRows.length === 1 ? "" : "s"}, ${failedGateIds.length} failing gate${failedGateIds.length === 1 ? "" : "s"}.`;
    } else if (targetIds.length && linkedGates.length && unknownGateIds.length === 0 && passedGateIds.length === linkedGates.length) {
      status = "verified";
      summary = `${targetIds.length} target${targetIds.length === 1 ? "" : "s"} verified by ${linkedGates.length} gate${linkedGates.length === 1 ? "" : "s"}.`;
    } else if (targetIds.length && linkedGates.length) {
      status = "covered";
      summary = `${targetIds.length} target${targetIds.length === 1 ? "" : "s"} linked to ${linkedGates.length} gate${linkedGates.length === 1 ? "" : "s"} (${unknownGateIds.length} without latest result).`;
    } else if (targetIds.length) {
      status = "linked";
      summary = `${targetIds.length} target${targetIds.length === 1 ? "" : "s"} linked without modeled gate coverage yet.`;
    }
    let derivedStatus = "untracked";
    let derivedSummary = "No evidence-derived task status yet.";
    if (status === "at-risk") {
      derivedStatus = "blocked";
      derivedSummary = "Linked evidence shows blocking gaps or failing verification.";
    } else if (status === "verified") {
      derivedStatus = task.status === "done" ? "done" : "ready";
      derivedSummary = task.status === "done"
        ? "Evidence-backed targets are verified and the authored task is marked done."
        : "Evidence-backed targets are verified, but the authored task is not yet marked done.";
    } else if (status === "covered" || status === "linked") {
      derivedStatus = "in-progress";
      derivedSummary = "Evidence links the task to active platform objects or gates, but verification is incomplete.";
    }
    return {
      ...task,
      derivedStatus,
      derivedSummary,
      evidence: {
        status,
        summary,
        targetCount: targetIds.length,
        gateIds: linkedGates.map(gate => gate.id),
        passedGateIds,
        failedGateIds,
        unknownGateIds,
        gapIds: gapRows.map(gap => gap.id)
      }
    };
  });
}

function buildFilteredDocProjection(model, docs, id = null, { expandByTarget = false } = {}) {
  let filteredDocs = [...docs];
  if (expandByTarget && id && !filteredDocs.length) {
    const dependencyMatches = (model.docDependencies ?? []).filter(row =>
      row.id === id
      || row.targetId === id
    );
    const matchedDocIds = new Set(dependencyMatches.map(row => row.docId));
    if (matchedDocIds.size) filteredDocs = model.docs.filter(doc => matchedDocIds.has(doc.id));
  }
  const docIds = new Set(filteredDocs.map(doc => doc.id));
  const docPaths = new Set(filteredDocs.map(doc => doc.path));
  const docSections = model.docSections.filter(section =>
    docPaths.has(section.doc)
    && (!id || section.id === id || section.doc === id || section.title === id)
  );
  const docTasks = model.docTasks.filter(task =>
    docPaths.has(task.doc)
    && (!id || task.id === id || task.doc === id || task.section === id)
  );
  const roadmapTasks = (model.roadmapTasks ?? []).filter(task =>
    docPaths.has(task.doc)
    && (!id || task.id === id || task.doc === id || task.section === id)
  );
  const docReferences = (model.docReferences ?? []).filter(row =>
    docIds.has(row.docId)
    || row.id === id
    || row.targetId === id
  );
  const docDependencies = (model.docDependencies ?? []).filter(row =>
    docIds.has(row.docId)
    || row.id === id
    || row.targetId === id
  );
  return {
    docs: filteredDocs,
    docIndex: buildDocIndex(filteredDocs),
    docSections,
    docTasks,
    roadmapTasks,
    docReferences,
    docDependencies,
    docsByPlatformObject: buildDocsByPlatformObject(filteredDocs, docDependencies),
    summaries: model.summaries
  };
}

function addTestExecutionNodes(nodes, edges, testGates = [], testRuns = [], testResults = [], testArtifacts = [], testSuites = [], testCases = []) {
  addNode(nodes, {
    id: TEST_RUNNER_BOUNDARY_ID,
    kind: "boundary",
    title: "Platform Test Runner",
    lifecycle: ["execute", "verify", "steward"],
    owner: "plugin.platform",
    status: "active",
    source: "plugins/platform/test-runs.js"
  });
  const usedEnvironments = new Set([
    ...testGates.map(row => String(row?.environment || "")),
    ...testRuns.map(row => String(row?.environment || ""))
  ].filter(Boolean));
  for (const environment of TEST_ENVIRONMENT_CATALOG) {
    addNode(nodes, {
      id: `testEnvironment:${environment.id}`,
      kind: "testEnvironment",
      title: environment.title,
      lifecycle: ["execute", "verify"],
      owner: "plugin.platform",
      status: usedEnvironments.has(environment.id) ? "active" : "known",
      source: "plugins/platform/test-runs.js"
    });
    addEdge(edges, TEST_RUNNER_BOUNDARY_ID, "supports", `testEnvironment:${environment.id}`, "tests");
  }
  for (const gate of testGates) {
    addEdge(edges, gate.id, "usesBoundary", TEST_RUNNER_BOUNDARY_ID, "tests");
    if (gate.environment) addEdge(edges, gate.id, "executesOn", `testEnvironment:${gate.environment}`, "tests");
  }
  for (const run of testRuns) {
    addNode(nodes, {
      id: run.id,
      kind: "testRun",
      title: run.title || run.id,
      lifecycle: ["execute", "verify"],
      owner: run.actor ?? "plugin.platform",
      status: run.status || "known",
      source: "witnesses"
    });
    if (run.gateId) addEdge(edges, run.gateId, "executedAs", run.id, "witnesses");
    addEdge(edges, run.id, "usesBoundary", TEST_RUNNER_BOUNDARY_ID, "witnesses");
    if (run.environment) addEdge(edges, run.id, "executesOn", `testEnvironment:${run.environment}`, "witnesses");
    if (run.branchId) addEdge(edges, run.id, "targets", `branch:${run.branchId}`, "witnesses");
    if (run.changeSetId) addEdge(edges, run.id, "targets", `changeSet:${run.changeSetId}`, "witnesses");
    if (run.candidateSnapshotId) addEdge(edges, run.id, "targets", run.candidateSnapshotId, "witnesses");
  }
  for (const result of testResults) {
    addNode(nodes, {
      id: result.id,
      kind: "testResult",
      title: result.title || result.id,
      lifecycle: ["verify", "observe"],
      owner: "plugin.platform",
      status: result.status || "known",
      source: "witnesses"
    });
    if (result.runId) addEdge(edges, result.runId, "produces", result.id, "witnesses");
    if (result.gateId) addEdge(edges, result.id, "targets", result.gateId, "witnesses");
    if (result.candidateSnapshotId) addEdge(edges, result.id, "targets", result.candidateSnapshotId, "witnesses");
  }
  for (const artifact of testArtifacts) {
    addNode(nodes, {
      id: artifact.id,
      kind: "testArtifact",
      title: artifact.title || artifact.id,
      lifecycle: ["observe", "verify"],
      owner: "plugin.platform",
      status: "captured",
      source: "witnesses"
    });
    if (artifact.runId) addEdge(edges, artifact.runId, "produces", artifact.id, "witnesses");
    if (artifact.resultId) addEdge(edges, artifact.resultId, "produces", artifact.id, "witnesses");
    if (artifact.gateId) addEdge(edges, artifact.id, "targets", artifact.gateId, "witnesses");
    if (artifact.candidateSnapshotId) addEdge(edges, artifact.id, "targets", artifact.candidateSnapshotId, "witnesses");
  }
  for (const suite of testSuites) {
    addNode(nodes, {
      id: suite.id,
      kind: "testSuite",
      title: suite.name || suite.id,
      lifecycle: ["verify", "observe"],
      owner: "plugin.platform",
      status: suite.status || "known",
      source: "witnesses"
    });
    if (suite.runId) addEdge(edges, suite.runId, "produces", suite.id, "witnesses");
    if (suite.resultId) addEdge(edges, suite.resultId, "produces", suite.id, "witnesses");
    if (suite.artifactId) addEdge(edges, suite.artifactId, "describes", suite.id, "witnesses");
    if (suite.gateId) addEdge(edges, suite.id, "targets", suite.gateId, "witnesses");
    if (suite.candidateSnapshotId) addEdge(edges, suite.id, "targets", suite.candidateSnapshotId, "witnesses");
  }
  for (const testCase of testCases) {
    addNode(nodes, {
      id: testCase.id,
      kind: "testCase",
      title: testCase.name || testCase.id,
      lifecycle: ["verify", "observe"],
      owner: "plugin.platform",
      status: testCase.status || "known",
      source: "witnesses"
    });
    if (testCase.suiteId) addEdge(edges, testCase.suiteId, "contains", testCase.id, "witnesses");
    if (testCase.runId) addEdge(edges, testCase.runId, "produces", testCase.id, "witnesses");
    if (testCase.resultId) addEdge(edges, testCase.resultId, "produces", testCase.id, "witnesses");
    if (testCase.artifactId) addEdge(edges, testCase.artifactId, "describes", testCase.id, "witnesses");
    if (testCase.gateId) addEdge(edges, testCase.id, "targets", testCase.gateId, "witnesses");
    if (testCase.candidateSnapshotId) addEdge(edges, testCase.id, "targets", testCase.candidateSnapshotId, "witnesses");
  }
}

function buildDependencyGraphMissGaps(_branches = [], changeSets = [], testGateProjection = null) {
  const gaps = [];
  const changeSetGateIds = testGateProjection?.byChangeSet ?? Object.create(null);

  function coverageRelevantPaths(changedPaths = []) {
    return (Array.isArray(changedPaths) ? changedPaths : [])
      .map(String)
      .filter(Boolean)
      .filter(changedPath => !changedPath.startsWith("docs/"))
      .filter(changedPath => !(changedPath.startsWith("test/") || changedPath.endsWith(".test.js")));
  }

  for (const changeSet of Array.isArray(changeSets) ? changeSets : []) {
    const relevantPaths = coverageRelevantPaths(changeSet.changedPaths);
    if (!relevantPaths.length) continue;
    const selectedGateIds = changeSetGateIds[String(changeSet.id)] ?? [];
    if (selectedGateIds.length) continue;
    gaps.push({
      id: `gap.meta-defect.dependency-graph.changeSet.${String(changeSet.id)}`,
      severity: "medium",
      kind: "meta-defect",
      category: "dependency-graph-miss",
      scopeKind: "changeSet",
      target: `changeSet:${String(changeSet.id)}`,
      branchId: changeSet.branchId ? String(changeSet.branchId) : null,
      changeSetId: String(changeSet.id),
      changedPaths: relevantPaths,
      reason: `Dependency graph selected no verification gates for changed non-doc sources in ${String(changeSet.id)}.`,
      recommendedProposal: null
    });
  }

  return gaps;
}

function buildGaps(nodes, edges, { branches = [], changeSets = [], testGateProjection = null } = {}) {
  const incoming = new Map();
  const outgoing = new Map();
  for (const edge of edges.values()) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, []);
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    incoming.get(edge.to).push(edge);
    outgoing.get(edge.from).push(edge);
  }
  const gaps = [];
  for (const node of nodes.values()) {
    if (!node.lifecycle.length) {
      gaps.push({
        id: `gap.lifecycle.${node.id}`,
        severity: "medium",
        kind: "missing-lifecycle",
        target: node.id,
        reason: `${node.kind} has no lifecycle facet`,
        recommendedProposal: null
      });
    }
    if (["plugin", "bundle", "capability"].includes(node.kind) && !(incoming.get(node.id) ?? []).some(edge => edge.rel === "verifiedBy")) {
      gaps.push({
        id: `gap.verify.${node.id}`,
        severity: node.kind === "plugin" ? "medium" : "low",
        kind: "missing-verification",
        target: node.id,
        reason: `${node.kind} has no modeled verification gate`,
        recommendedProposal: null
      });
    }
    if (node.kind === "plugin" && !(incoming.get(node.id) ?? []).some(edge => edge.rel === "documentedBy")) {
      gaps.push({
        id: `gap.docs.${node.id}`,
        severity: "low",
        kind: "missing-doc",
        target: node.id,
        reason: "plugin has no modeled governing document",
        recommendedProposal: null
      });
    }
    if (node.kind === "plugin" && node.status === "inactive") {
      gaps.push({
        id: `gap.inactive.${node.id}`,
        severity: "info",
        kind: "inactive-plugin",
        target: node.id,
        reason: "plugin is known but not active in this runtime",
        recommendedProposal: {
          targetProcess: "runtimePlugin.install",
          targetKind: "plugin",
          targetId: node.id
        }
      });
    }
    if (node.kind === "doc" && node.status === "stale") {
      gaps.push({
        id: `gap.doc-freshness.${node.id}`,
        severity: "medium",
        kind: "stale-doc",
        target: node.id,
        reason: "governed document is stale relative to active branch changes",
        recommendedProposal: null
      });
    }
  }
  gaps.push(...buildDependencyGraphMissGaps(branches, changeSets, testGateProjection));
  return gaps.sort((a, b) => a.severity.localeCompare(b.severity) || a.id.localeCompare(b.id));
}

function projectRows(project, projector) {
  if (!project) return [];
  try {
    const rows = project(projector);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function projectValue(project, projector, fallback) {
  if (!project) return fallback;
  try {
    return projector ? (project(projector) ?? fallback) : fallback;
  } catch {
    return fallback;
  }
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "task";
}

function roadmapTaskStatus(marker) {
  switch (String(marker || "").toLowerCase()) {
    case "x":
      return { checked: true, status: "done" };
    case "~":
      return { checked: false, status: "in-progress" };
    case "b":
      return { checked: false, status: "blocked" };
    case "l":
      return { checked: false, status: "logged" };
    default:
      return { checked: false, status: "open" };
  }
}

function docRoleForPath(docPath) {
  const value = String(docPath || "").toLowerCase();
  if (value.includes("roadmap")) return "roadmap";
  if (value.includes("runbook") || value.includes("playbook")) return "runbook";
  if (value.includes("audit")) return "audit";
  if (value.includes("inventory") || value.includes("map") || value.includes("capabilities")) return "reference";
  return "document";
}

function docLifecycleForPath(docPath) {
  const lifecycle = CONTROL_DOCS.get(docPath);
  if (lifecycle) return [...lifecycle];
  switch (docRoleForPath(docPath)) {
    case "roadmap":
      return ["author", "steward"];
    case "runbook":
      return ["author", "verify", "steward"];
    case "audit":
      return ["verify", "steward"];
    default:
      return ["steward"];
  }
}

function docOwnerForPath(docPath) {
  const targets = GOVERNED_DOC_TARGETS[docPath] ?? [];
  return targets.find(target => String(target).startsWith("plugin.") || String(target).startsWith("runtime."))
    ?? targets.find(target => String(target).startsWith("profile:") || String(target).startsWith("bundle-"))
    ?? "stewardship";
}

function extractMarkdownCodeTokens(source) {
  const tokens = [];
  const pattern = /`([^`\r\n]+)`/g;
  for (const match of String(source || "").matchAll(pattern)) tokens.push(match[1].trim());
  return unique(tokens);
}

function extractMarkdownRouteRefs(source) {
  const routes = [];
  const pattern = /(?:^|[\s(`"])((?:\/platform)|(?:\/api\/[A-Za-z0-9_./:-]+))/g;
  for (const match of String(source || "").matchAll(pattern)) routes.push(match[1].trim());
  return unique(routes);
}

function extractMarkdownReferences(source) {
  const codeTokens = extractMarkdownCodeTokens(source);
  return {
    codeTokens,
    filePaths: unique(codeTokens.filter(token => /^(?:docs|plugins|src|test|store|examples)\//.test(token))),
    pluginIds: unique(codeTokens.filter(token => /^plugin\.[A-Za-z0-9_.-]+$/.test(token))),
    capabilityIds: unique(codeTokens.filter(token => /^[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+$/.test(token))),
    proposalIds: unique(codeTokens.filter(token => /^proposal(?:[:.])[A-Za-z0-9_.:-]+$/.test(token))),
    branchIds: unique(codeTokens.filter(token => /^branch:[A-Za-z0-9_.:-]+$/.test(token))),
    routes: extractMarkdownRouteRefs(source)
  };
}

function parseMarkdownSections(docPath, source) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const stack = [];
  const sections = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    const title = match[2].trim();
    stack[level - 1] = {
      id: `docSection:${docPath}:${index + 1}:${slugify(title)}`,
      level,
      title
    };
    stack.length = level;
    sections.push({
      id: stack[level - 1].id,
      doc: docPath,
      line: index + 1,
      level,
      title,
      parentSectionId: stack[level - 2]?.id ?? null
    });
  }
  return sections;
}

async function listMarkdownDocs() {
  const docsRoot = path.join(repoRoot, "docs");
  const files = await listFiles(docsRoot, file => file.endsWith(".md"));
  return files
    .map(file => slash(path.relative(repoRoot, file)))
    .sort((left, right) => left.localeCompare(right));
}

function gateRunnerForPath(relativePath) {
  const value = String(relativePath || "");
  if (value.includes(".rs") || value.includes("cargo")) return "cargo-test";
  return "node-test";
}

function gateEnvironmentForPath(relativePath) {
  const value = String(relativePath || "");
  if (value.includes(".rs") || value.includes("cargo")) return "local-rust-cargo";
  if (value.includes("ui.") || value.includes("browser")) return "local-browser";
  return "local-node";
}

function gateTimeoutForPath(relativePath) {
  const value = String(relativePath || "");
  if (value.includes("runtime") || value.includes("ui.") || value.includes("host")) return 180000;
  return 120000;
}

function gateCostEstimateForPath(relativePath) {
  const value = String(relativePath || "");
  if (value.includes("runtime") || value.includes("ui.") || value.includes("host")) return "high";
  if (value.includes("platform") || value.includes("pipeline")) return "medium";
  return "low";
}

function normalizeGateCommand(command) {
  return String(command || "").replace(/\s+/g, " ").trim();
}

function looksLikeExplicitTestGateCommand(command) {
  const value = normalizeGateCommand(command);
  return /^(?:cmd \/c )?node --test\b/i.test(value)
    || /^cargo test\b/i.test(value)
    || /^npm run test(?:[:\w-]+)?\b/i.test(value)
    || /^pnpm (?:test|vitest)\b/i.test(value)
    || /^(?:npx )?vitest\b/i.test(value);
}

function extractDocTestGateCommands(source) {
  return unique(
    extractMarkdownCodeTokens(source)
      .map(token => normalizeGateCommand(token))
      .filter(looksLikeExplicitTestGateCommand)
  );
}

function repoRelativeHintPath(fromRelativePath, specifier) {
  const value = String(specifier || "").trim();
  if (!value.startsWith(".")) return null;
  const baseDir = path.dirname(path.join(repoRoot, fromRelativePath));
  const resolved = path.resolve(baseDir, value);
  const relative = slash(path.relative(repoRoot, resolved));
  if (!relative || relative.startsWith("..")) return null;
  return relative;
}

function extractRepoRelativeSpecifiers(fromRelativePath, source) {
  const specifiers = [];
  const patterns = [
    /(?:import|export)\s+(?:[^"'`]+?\s+from\s+)?["'`]([^"'`]+)["'`]/g,
    /require\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /import\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /new URL\(\s*["'`]([^"'`]+)["'`]/g
  ];
  for (const pattern of patterns) {
    for (const match of String(source || "").matchAll(pattern)) {
      const resolved = repoRelativeHintPath(fromRelativePath, match[1]);
      if (resolved) specifiers.push(resolved);
    }
  }
  return unique(specifiers);
}

function extractRepoRootPathHints(source) {
  const paths = [];
  const pattern = /\b(?:docs|plugins|src|test|store|examples)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+\b/g;
  for (const match of String(source || "").matchAll(pattern)) paths.push(match[0]);
  return unique(paths);
}

function extractPlatformModelHintTargets(source, nodes, routeIdsByMatcher) {
  const targets = [];
  const pluginPattern = /\bplugin\.[A-Za-z0-9_.-]+\b/g;
  const handlerOrCapabilityPattern = /\b[a-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+){1,5}\b/g;
  const directNodePattern = /\b(?:profile|surface|testEnvironment):[A-Za-z0-9_./-]+\b/g;
  for (const match of String(source || "").matchAll(pluginPattern)) {
    if (nodes.has(match[0])) targets.push(match[0]);
  }
  for (const match of String(source || "").matchAll(handlerOrCapabilityPattern)) {
    const token = match[0];
    if (nodes.has(`handler:${token}`)) targets.push(`handler:${token}`);
    if (nodes.has(`capability:${token}`)) targets.push(`capability:${token}`);
  }
  for (const match of String(source || "").matchAll(directNodePattern)) {
    if (isKnownPlatformModelTarget(match[0], nodes)) targets.push(match[0]);
  }
  for (const routeRef of extractMarkdownRouteRefs(source)) {
    const routeId = routeIdsByMatcher[routeRef];
    if (routeId) targets.push(routeId);
  }
  return unique(targets);
}

function extractCandidateSnapshotHintTargets(source) {
  const text = String(source || "");
  if (
    text.includes("platform-change-set-apply")
    || text.includes("runtimeSnapshotRefresh")
    || text.includes("/api/runtime/backend-revisions/events")
  ) {
    return ["testEnvironment:platform-candidate-snapshot"];
  }
  return [];
}

function buildTestGateSourceHints(relativePath, source, nodes, routeIdsByMatcher) {
  const sourceDependencies = unique([
    relativePath,
    ...extractRepoRelativeSpecifiers(relativePath, source),
    ...extractRepoRootPathHints(source)
  ]);
  const protectedObjects = new Set([
    ...extractPlatformModelHintTargets(source, nodes, routeIdsByMatcher),
    ...extractCandidateSnapshotHintTargets(source)
  ]);
  for (const dependency of sourceDependencies) {
    const system = summarizePlatformPathSystem(dependency);
    if (nodes.has(system.id)) protectedObjects.add(system.id);
    const targetId = repoFileTargetId(dependency);
    if (targetId && nodes.has(targetId)) protectedObjects.add(targetId);
  }
  return {
    sourceDependencies,
    protectedObjects: [...protectedObjects]
  };
}

function packageScriptProtectedObjects(scriptName, command, nodes) {
  const targets = [];
  const script = String(scriptName || "");
  const normalizedCommand = normalizeGateCommand(command);
  const pluginMatch = script.match(/^test:plugin:([a-z0-9-]+)$/i) || normalizedCommand.match(/\brun-plugin-tests\.mjs\s+([a-z0-9-]+)/i);
  if (pluginMatch) {
    const pluginId = `plugin.${pluginMatch[1]}`;
    if (nodes.has(pluginId)) targets.push(pluginId);
  }
  if (script === "test:ui") targets.push("runtime.core");
  return unique(targets);
}

function buildTestGateIndex(rows, affectedRows = [], affectedRowsByChangeSet = []) {
  const byId = Object.create(null);
  const byProtectedObject = Object.create(null);
  const byBranch = Object.create(null);
  const byChangeSet = Object.create(null);
  for (const row of rows) {
    byId[row.id] = { ...row };
    for (const target of row.protectedObjects ?? []) pushByKey(byProtectedObject, target, row.id);
  }
  for (const row of affectedRows) pushByKey(byBranch, row.branchId, row.gateId);
  for (const row of affectedRowsByChangeSet) pushByKey(byChangeSet, row.changeSetId, row.gateId);
  for (const target of Object.keys(byProtectedObject)) byProtectedObject[target] = unique(byProtectedObject[target]).sort();
  for (const branchId of Object.keys(byBranch)) byBranch[branchId] = unique(byBranch[branchId]).sort();
  for (const changeSetId of Object.keys(byChangeSet)) byChangeSet[changeSetId] = unique(byChangeSet[changeSetId]).sort();
  return { byId, byProtectedObject, byBranch, byChangeSet };
}

function buildCoverageEdgeRows(testGates = [], nodes = new Map()) {
  const rows = [];
  for (const gate of Array.isArray(testGates) ? testGates : []) {
    for (const targetId of Array.isArray(gate.protectedObjects) ? gate.protectedObjects : []) {
      rows.push({
        id: `coverageEdge:${gate.id}:protectedObject:${targetId}`,
        gateId: String(gate.id || ""),
        gateTitle: String(gate.title || gate.id || ""),
        coverageKind: "protectedObject",
        targetId: String(targetId),
        targetLabel: platformModelTargetTitle(targetId, nodes),
        sourceDependency: null,
        sourcePath: gate.sourcePath ? String(gate.sourcePath) : null
      });
    }
    for (const sourceDependency of Array.isArray(gate.sourceDependencies) ? gate.sourceDependencies : []) {
      rows.push({
        id: `coverageEdge:${gate.id}:sourceDependency:${sourceDependency}`,
        gateId: String(gate.id || ""),
        gateTitle: String(gate.title || gate.id || ""),
        coverageKind: "sourceDependency",
        targetId: `file:${String(sourceDependency)}`,
        targetLabel: String(sourceDependency),
        sourceDependency: String(sourceDependency),
        sourcePath: gate.sourcePath ? String(gate.sourcePath) : null
      });
    }
  }
  return rows.sort((left, right) =>
    String(left.gateId || "").localeCompare(String(right.gateId || ""))
    || String(left.coverageKind || "").localeCompare(String(right.coverageKind || ""))
    || String(left.targetId || "").localeCompare(String(right.targetId || ""))
  );
}

function testGateCostRank(costEstimate) {
  switch (String(costEstimate || "")) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    default:
      return 4;
  }
}

function testGateSpecificityRank(gate = null) {
  const sourcePath = String(gate?.sourcePath || "");
  const command = normalizeGateCommand(gate?.command || gate?.title || "");
  if (sourcePath.endsWith(".test.js")) return 1;
  if (sourcePath === "package.json" && /^npm run test:[^ ]+/i.test(command)) return 2;
  if (sourcePath === "package.json" && /^npm run test\b/i.test(command)) return 4;
  if (sourcePath.startsWith("docs/")) return 5;
  return 3;
}

function scopeSelectionCoverageKeys(row) {
  const keys = unique([
    ...((row?.matchedTargets ?? []).map(target => `target:${target}`)),
    ...((row?.matchedSourceDependencies ?? []).map(sourceDependency => `path:${sourceDependency}`))
  ]);
  return keys.length ? keys : [`gate:${String(row?.gateId || "")}`];
}

function isCoverageSubset(leftCoverageKeys, rightCoverageKeys) {
  const right = new Set(Array.isArray(rightCoverageKeys) ? rightCoverageKeys : []);
  return (Array.isArray(leftCoverageKeys) ? leftCoverageKeys : []).every(key => right.has(key));
}

function compareGateSelectionCandidates(left, right) {
  const uncoveredDiff = Number(right.uncoveredCount || 0) - Number(left.uncoveredCount || 0);
  if (uncoveredDiff) return uncoveredDiff;
  const specificityDiff = Number(left.specificityRank || 0) - Number(right.specificityRank || 0);
  if (specificityDiff) return specificityDiff;
  const costDiff = testGateCostRank(left.costEstimate) - testGateCostRank(right.costEstimate);
  if (costDiff) return costDiff;
  const coverageDiff = Number(right.coverageKeys?.length || 0) - Number(left.coverageKeys?.length || 0);
  if (coverageDiff) return coverageDiff;
  return String(left.gateId || "").localeCompare(String(right.gateId || ""));
}

function selectMeaningfulTestGates(scopeRows = [], testGateRows = []) {
  const gateById = Object.fromEntries((Array.isArray(testGateRows) ? testGateRows : []).map(row => [String(row.id), row]));
  const candidates = (Array.isArray(scopeRows) ? scopeRows : [])
    .map(row => ({
      gateId: String(row.gateId || ""),
      costEstimate: gateById[String(row.gateId || "")]?.costEstimate ?? null,
      specificityRank: testGateSpecificityRank(gateById[String(row.gateId || "")] ?? null),
      coverageKeys: scopeSelectionCoverageKeys(row)
    }))
    .filter(candidate => candidate.gateId);
  if (!candidates.length) return [];

  const pruned = candidates.filter((candidate, index) => !candidates.some((other, otherIndex) => {
    if (index === otherIndex) return false;
    if (!isCoverageSubset(candidate.coverageKeys, other.coverageKeys)) return false;
    const candidateCost = testGateCostRank(candidate.costEstimate);
    const otherCost = testGateCostRank(other.costEstimate);
    const candidateSpecificity = Number(candidate.specificityRank || 0);
    const otherSpecificity = Number(other.specificityRank || 0);
    if (otherSpecificity > candidateSpecificity) return false;
    if (otherSpecificity === candidateSpecificity && otherCost > candidateCost) return false;
    const strictSuperset = candidate.coverageKeys.length < other.coverageKeys.length;
    const moreSpecific = otherSpecificity < candidateSpecificity;
    const lowerCost = otherSpecificity === candidateSpecificity && otherCost < candidateCost;
    const deterministicTie = otherSpecificity === candidateSpecificity
      && otherCost === candidateCost
      && candidate.coverageKeys.length === other.coverageKeys.length
      && String(other.gateId || "").localeCompare(String(candidate.gateId || "")) < 0;
    return strictSuperset || moreSpecific || lowerCost || deterministicTie;
  }));

  const universe = unique(pruned.flatMap(candidate => candidate.coverageKeys));
  const uncovered = new Set(universe);
  const selected = [];
  const remaining = [...pruned];
  while (uncovered.size && remaining.length) {
    const ranked = remaining
      .map(candidate => ({
        ...candidate,
        uncoveredCount: candidate.coverageKeys.filter(key => uncovered.has(key)).length
      }))
      .filter(candidate => candidate.uncoveredCount > 0)
      .sort(compareGateSelectionCandidates);
    const next = ranked[0] ?? null;
    if (!next) break;
    selected.push(next.gateId);
    for (const key of next.coverageKeys) uncovered.delete(key);
    const removeIndex = remaining.findIndex(candidate => candidate.gateId === next.gateId);
    if (removeIndex >= 0) remaining.splice(removeIndex, 1);
  }

  if (!selected.length && pruned.length) return [pruned[0].gateId];
  return selected;
}

function compareTestActivityRows(left, right) {
  for (const key of ["producedAt", "finishedAt", "startedAt", "createdAt"]) {
    const leftValue = String(left?.[key] || "");
    const rightValue = String(right?.[key] || "");
    if (leftValue && rightValue && leftValue !== rightValue) return leftValue.localeCompare(rightValue);
  }
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function summarizeTestRedGreenScope({
  scopeType,
  scopeId,
  title,
  selectedGateIds = [],
  testGateRows = [],
  testRuns = [],
  testResults = []
}) {
  const normalizedScopeId = String(scopeId || "");
  const selected = unique(selectedGateIds);
  const gateById = Object.fromEntries((Array.isArray(testGateRows) ? testGateRows : []).map(row => [String(row.id || ""), row]));
  const scopeField = scopeType === "changeSet" ? "changeSetId" : "branchId";
  const scopedResults = (Array.isArray(testResults) ? testResults : [])
    .filter(row => String(row?.[scopeField] || "") === normalizedScopeId && String(row?.gateId || ""));
  const latestResultByGate = Object.create(null);
  for (const result of scopedResults) {
    const gateId = String(result.gateId || "");
    const previous = latestResultByGate[gateId] ?? null;
    if (!previous || compareTestActivityRows(previous, result) < 0) latestResultByGate[gateId] = result;
  }
  const scopedRuns = (Array.isArray(testRuns) ? testRuns : [])
    .filter(row => String(row?.[scopeField] || "") === normalizedScopeId && String(row?.status || "") === "running" && String(row?.gateId || ""));
  const latestRunningByGate = Object.create(null);
  for (const run of scopedRuns) {
    const gateId = String(run.gateId || "");
    const previous = latestRunningByGate[gateId] ?? null;
    if (!previous || compareTestActivityRows(previous, run) < 0) latestRunningByGate[gateId] = run;
  }
  const gateStates = selected.map(gateId => {
    const gate = gateById[gateId] ?? null;
    const latestResult = latestResultByGate[gateId] ?? null;
    const latestRunning = latestRunningByGate[gateId] ?? null;
    let status = "pending";
    if (latestResult) status = String(latestResult.status || "pending");
    else if (latestRunning) status = "running";
    return {
      gateId,
      gateTitle: String(gate?.title || gateId),
      status,
      runId: latestResult?.runId ?? latestRunning?.id ?? null,
      resultId: latestResult?.id ?? null,
      exitCode: typeof latestResult?.exitCode === "number" ? latestResult.exitCode : null,
      durationMs: typeof latestResult?.durationMs === "number" ? latestResult.durationMs : null,
      cacheStatus: latestResult?.cacheStatus ? String(latestResult.cacheStatus) : (latestRunning?.cacheStatus ? String(latestRunning.cacheStatus) : null),
      producedAt: latestResult?.producedAt ?? null,
      startedAt: latestRunning?.startedAt ?? null
    };
  });
  const passedGateIds = gateStates.filter(row => row.status === "passed").map(row => row.gateId);
  const failedGateIds = gateStates.filter(row => row.status === "failed").map(row => row.gateId);
  const errorGateIds = gateStates.filter(row => row.status === "error").map(row => row.gateId);
  const timedOutGateIds = gateStates.filter(row => row.status === "timed_out").map(row => row.gateId);
  const runningGateIds = gateStates.filter(row => row.status === "running").map(row => row.gateId);
  const pendingGateIds = gateStates.filter(row => row.status === "pending").map(row => row.gateId);
  let status = "idle";
  if (failedGateIds.length || errorGateIds.length || timedOutGateIds.length) status = "red";
  else if (runningGateIds.length) status = "running";
  else if (pendingGateIds.length) status = "pending";
  else if (selected.length) status = "green";
  const latestActivityAt = gateStates
    .map(row => String(row.producedAt || row.startedAt || ""))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .at(-1) ?? null;
  const summaryParts = [];
  if (!selected.length) summaryParts.push("No selected gates");
  else {
    summaryParts.push(`${selected.length} selected`);
    if (passedGateIds.length) summaryParts.push(`${passedGateIds.length} passed`);
    if (failedGateIds.length) summaryParts.push(`${failedGateIds.length} failed`);
    if (errorGateIds.length) summaryParts.push(`${errorGateIds.length} errors`);
    if (timedOutGateIds.length) summaryParts.push(`${timedOutGateIds.length} timed out`);
    if (runningGateIds.length) summaryParts.push(`${runningGateIds.length} running`);
    if (pendingGateIds.length) summaryParts.push(`${pendingGateIds.length} pending`);
  }
  return {
    id: `testRedGreen:${scopeType}:${normalizedScopeId}`,
    scopeType,
    ...(scopeType === "changeSet" ? { changeSetId: normalizedScopeId } : { branchId: normalizedScopeId }),
    title: String(title || normalizedScopeId),
    status,
    summary: summaryParts.join(", "),
    selectedGateIds: selected,
    totalSelectedGates: selected.length,
    passedGateIds,
    failedGateIds,
    errorGateIds,
    timedOutGateIds,
    runningGateIds,
    pendingGateIds,
    latestActivityAt,
    gateStates
  };
}

function telemetryMetricNodeId(id) {
  return `telemetryMetric:${String(id || "")}`;
}

function defectClusterNodeId(defect) {
  return `defectCluster:${slugify(String(defect || ""))}`;
}

function telemetryImpactRuleForSystem(systemId) {
  return TELEMETRY_IMPACT_RULES[String(systemId || "")] ?? null;
}

function telemetrySystemIdsForProtectedTarget(target) {
  const value = String(target || "");
  if (value === "plugin.platform" || value === "capability:platform.self") return ["plugin.platform"];
  if (value === "surface:platform" || value === "route:GET /platform" || value === "handler:page.platform") return ["surface.platform"];
  if (value === "plugin.mcp") return ["plugin.mcp"];
  if (value === "runtime.core") return ["runtime.core"];
  if (value.startsWith("profile:")) return ["runtime.profile"];
  if (value.startsWith("doc:")) return ["docs"];
  return [];
}

function telemetryMetricTargetsForProtectedObjects(protectedObjects = []) {
  const targets = new Set();
  for (const target of Array.isArray(protectedObjects) ? protectedObjects : []) {
    for (const systemId of telemetrySystemIdsForProtectedTarget(target)) {
      const rule = telemetryImpactRuleForSystem(systemId);
      if (rule?.id) targets.add(telemetryMetricNodeId(rule.id));
    }
  }
  return [...targets].sort((left, right) => left.localeCompare(right));
}

function addTelemetryMetricNodes(nodes) {
  for (const rule of Object.values(TELEMETRY_IMPACT_RULES)) {
    addNode(nodes, {
      id: telemetryMetricNodeId(rule.id),
      kind: "telemetryMetric",
      title: rule.label,
      lifecycle: ["observe", "verify", "steward"],
      owner: "plugin.platform",
      status: "known",
      source: "plugins/platform/branch-insights.js"
    });
  }
}

function compareTimeline(left, right) {
  const leftCreatedAt = String(left?.createdAt || "");
  const rightCreatedAt = String(right?.createdAt || "");
  if (leftCreatedAt && rightCreatedAt && leftCreatedAt !== rightCreatedAt) return leftCreatedAt.localeCompare(rightCreatedAt);
  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function buildDefectClusterRows(branches = []) {
  const byDefect = new Map();
  for (const branch of Array.isArray(branches) ? branches : []) {
    const defect = String(branch?.defect || "").trim();
    if (!defect) continue;
    const existing = byDefect.get(defect) ?? {
      id: defectClusterNodeId(defect),
      defect,
      title: defect,
      branchMembers: []
    };
    existing.branchMembers.push({
      branchId: String(branch.id),
      title: String(branch.title || branch.id),
      createdAt: branch.createdAt ?? null,
      changedPaths: [...(branch.changedPaths ?? [])],
      affectedSystems: [...((branch.affectedSystemSummaries ?? []).map(row => String(row.system || "")).filter(Boolean))],
      docsFreshness: branch.docsFreshness ? {
        requiredDocs: [...(branch.docsFreshness.requiredDocs ?? [])],
        touchedDocs: [...(branch.docsFreshness.touchedDocs ?? [])],
        missingDocs: [...(branch.docsFreshness.missingDocs ?? [])]
      } : null,
      telemetryImpactIds: [...((branch.telemetryImpactSummaries ?? []).map(row => row?.id).filter(Boolean))]
    });
    byDefect.set(defect, existing);
  }
  return [...byDefect.values()]
    .map(cluster => {
      cluster.branchMembers.sort(compareTimeline);
      return {
        ...cluster,
        branchCount: cluster.branchMembers.length,
        branchIds: cluster.branchMembers.map(member => member.branchId)
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function addDefectClusterNodes(nodes, edges, defectClusters = []) {
  for (const cluster of defectClusters) {
    addNode(nodes, {
      id: cluster.id,
      kind: "defectCluster",
      title: cluster.title,
      lifecycle: ["observe", "verify", "steward"],
      owner: "plugin.platform",
      status: cluster.branchCount > 1 ? "recurring" : "known",
      source: "witnesses"
    });
    for (const branchId of cluster.branchIds ?? []) {
      if (nodes.has(`branch:${branchId}`)) addEdge(edges, cluster.id, "targets", `branch:${branchId}`, "defects");
    }
  }
}

function addTestGateTelemetryEdges(nodes, edges, testGates = []) {
  for (const gate of testGates) {
    for (const target of gate.protectedObjects ?? []) {
      if (!String(target).startsWith("telemetryMetric:")) continue;
      addEdge(edges, gate.id, "verifies", target, "telemetry");
      if (nodes.has(target)) addEdge(edges, target, "verifiedBy", gate.id, "telemetry");
    }
  }
}

function buildTestGateRows(
  nodes,
  edges,
  branches = [],
  changeSets = [],
  latestResultsByGate = Object.create(null),
  defectClusters = [],
  bundleIdsByPlugin = Object.create(null),
  seedRows = null,
  flakeScoresByGate = Object.create(null)
) {
  function pushTarget(targets, id) {
    if (isKnownPlatformModelTarget(id, nodes)) targets.add(String(id));
  }
  function addOwnedBundleTargets(targets, pluginId) {
    for (const bundleId of bundleIdsByPlugin[String(pluginId || "")] ?? []) {
      pushTarget(targets, bundleId);
    }
  }
  function addPlatformRouteTargets(targets) {
    for (const node of nodes.values()) {
      if (node.kind !== "route") continue;
      if (String(node.owner || "").startsWith("platform.") || String(node.owner || "") === "page.platform") {
        targets.add(node.id);
      }
    }
  }
  function addPlatformHandlerTargets(targets) {
    for (const node of nodes.values()) {
      if (node.kind !== "handler") continue;
      if (String(node.id).startsWith("handler:platform.") || String(node.id) === "handler:page.platform") {
        targets.add(node.id);
      }
    }
  }
  function inferredAffectedTargetsForChangedPaths(changedPaths = []) {
    const targets = new Set();
    for (const changedPath of changedPaths.map(String)) {
      pushTarget(targets, repoFileTargetId(changedPath));
      pushTarget(targets, `gate:${changedPath}`);
      if (changedPath === "store/seeds/runtime-profiles.json") {
        pushTarget(targets, "profile:full");
        pushTarget(targets, "profile:minimal");
      }
      if (changedPath === "plugins/platform/runtime.js" || changedPath === "plugins/platform/handlers.js") {
        pushTarget(targets, "plugin.platform");
        addOwnedBundleTargets(targets, "plugin.platform");
        pushTarget(targets, "surface:platform");
        pushTarget(targets, "capability:platform.self");
        addPlatformRouteTargets(targets);
        addPlatformHandlerTargets(targets);
      }
      if (
        changedPath === "plugins/platform/platform-page.js"
        || changedPath === "plugins/platform/platform-console.rvm"
        || changedPath === "plugins/platform/platform-console.wcss"
        || changedPath === "plugins/platform/platform-style.js"
      ) {
        addOwnedBundleTargets(targets, "plugin.platform");
        pushTarget(targets, "surface:platform");
        pushTarget(targets, "route:GET /platform");
        pushTarget(targets, "handler:page.platform");
      }
      if (
        changedPath === "plugins/platform/platform-console.rvm"
        || changedPath === "plugins/platform/platform-console.wcss"
      ) {
        pushTarget(targets, "testEnvironment:platform-candidate-snapshot");
      }
      if (changedPath.startsWith("plugins/mcp/")) {
        pushTarget(targets, "plugin.mcp");
        addOwnedBundleTargets(targets, "plugin.mcp");
      }
    }
    return targets;
  }
  const outgoing = new Map();
  for (const edge of edges.values()) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge);
  }
  const rows = (Array.isArray(seedRows) && seedRows.length
    ? seedRows.map(row => {
        const protectedObjects = unique([
          ...(Array.isArray(row.protectedObjects) ? row.protectedObjects : []),
          ...telemetryMetricTargetsForProtectedObjects(row.protectedObjects ?? [])
        ]);
        return {
          id: String(row.id || ""),
          title: String(row.title || row.id || ""),
          sourcePath: row.sourcePath ? String(row.sourcePath) : null,
          command: normalizeGateCommand(row.command || `node --test ${row.title || row.id || ""}`),
          runner: String(row.runner || gateRunnerForPath(row.command || row.title || row.id || "")),
          environment: String(row.environment || gateEnvironmentForPath(row.command || row.title || row.id || "")),
          timeoutMs: Number(row.timeoutMs || gateTimeoutForPath(row.command || row.title || row.id || "")),
          protectedObjects,
          protectedObjectLabels: protectedObjects.map(target => platformModelTargetTitle(target, nodes)),
          sourceDependencies: unique(Array.isArray(row.sourceDependencies) ? row.sourceDependencies : []),
          lastResult: row.lastResult
            ? {
                runId: row.lastResult.runId,
                status: row.lastResult.status,
                exitCode: row.lastResult.exitCode,
                durationMs: row.lastResult.durationMs,
                producedAt: row.lastResult.producedAt ?? null
              }
            : null,
          flakeScore: typeof row.flakeScore === "number" ? row.flakeScore : (typeof flakeScoresByGate[String(row.id || "")] === "number" ? flakeScoresByGate[String(row.id || "")] : null),
          costEstimate: row.costEstimate ? String(row.costEstimate) : gateCostEstimateForPath(row.command || row.title || row.id || ""),
          selectedByBranches: [],
          selectedByChangeSets: []
        };
      })
    : [...nodes.values()]
      .filter(node => node.kind === "testGate")
      .map(node => {
        const gateEdges = outgoing.get(node.id) ?? [];
        const baseProtectedObjects = unique(gateEdges.filter(edge => edge.rel === "verifies").map(edge => edge.to));
        const protectedObjects = unique([
          ...baseProtectedObjects,
          ...telemetryMetricTargetsForProtectedObjects(baseProtectedObjects)
        ]);
        const protectedObjectLabels = protectedObjects.map(target => platformModelTargetTitle(target, nodes));
        const command = normalizeGateCommand(node.command || `node --test ${node.title}`);
        const sourceDependencies = unique(
          Array.isArray(node.sourceDependencies) && node.sourceDependencies.length
            ? node.sourceDependencies
            : [node.source]
        );
        return {
          id: node.id,
          title: node.title,
          sourcePath: node.source ? String(node.source) : null,
          command,
          runner: gateRunnerForPath(command || node.title),
          environment: gateEnvironmentForPath(command || node.title),
          timeoutMs: gateTimeoutForPath(command || node.title),
          protectedObjects,
          protectedObjectLabels,
          sourceDependencies,
          lastResult: latestResultsByGate[node.id]
            ? {
                runId: latestResultsByGate[node.id].runId,
                status: latestResultsByGate[node.id].status,
                exitCode: latestResultsByGate[node.id].exitCode,
                durationMs: latestResultsByGate[node.id].durationMs,
                producedAt: latestResultsByGate[node.id].producedAt ?? null
              }
            : null,
          flakeScore: typeof flakeScoresByGate[String(node.id || "")] === "number" ? flakeScoresByGate[String(node.id || "")] : null,
          costEstimate: gateCostEstimateForPath(command || node.title),
          selectedByBranches: [],
          selectedByChangeSets: []
        };
      }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const affectedRows = [];
  const affectedRowsByChangeSet = [];
  const branchesById = Object.fromEntries((Array.isArray(branches) ? branches : []).map(branch => [String(branch.id), branch]));
  const defectClustersByDefect = Object.fromEntries((Array.isArray(defectClusters) ? defectClusters : []).map(cluster => [String(cluster.defect), cluster]));

  function priorDefectClusterContextForScope(scopeType, scope) {
    const branchId = scopeType === "branch" ? String(scope.id || "") : String(scope.branchId || "");
    const branch = branchesById[branchId] ?? null;
    const defect = String(scope?.defect || branch?.defect || "").trim();
    if (!defect) return null;
    const cluster = defectClustersByDefect[defect] ?? null;
    if (!cluster) return null;
    const currentMember = (cluster.branchMembers ?? []).find(member => member.branchId === branchId) ?? { branchId, createdAt: branch?.createdAt ?? null };
    const priorMembers = (cluster.branchMembers ?? []).filter(member => {
      if (member.branchId === branchId) return false;
      if (!currentMember.createdAt) return true;
      if (!member.createdAt) return true;
      return compareTimeline(member, currentMember) < 0;
    });
    if (!priorMembers.length) return null;
    const historicalChangedPaths = unique(priorMembers.flatMap(member => member.changedPaths ?? []));
    const historicalAffectedSystems = new Set(unique(priorMembers.flatMap(member => member.affectedSystems ?? [])));
    const historicalDocTargets = new Set(unique(priorMembers.flatMap(member => [
      ...(member.docsFreshness?.requiredDocs ?? []),
      ...(member.docsFreshness?.touchedDocs ?? []),
      ...(member.docsFreshness?.missingDocs ?? [])
    ])).map(doc => `doc:${doc}`));
    const historicalTelemetryTargets = new Set(unique(priorMembers.flatMap(member => member.telemetryImpactIds ?? [])).map(id => telemetryMetricNodeId(id)));
    const historicalTargets = inferredAffectedTargetsForChangedPaths(historicalChangedPaths);
    return {
      id: cluster.id,
      title: cluster.title,
      priorBranchIds: priorMembers.map(member => member.branchId),
      historicalChangedPaths: new Set(historicalChangedPaths),
      historicalAffectedSystems,
      historicalDocTargets,
      historicalTelemetryTargets,
      historicalTargets
    };
  }

  function selectionReasonsForGate(gate, matchedTargets = [], matchedSourceDependencies = [], priorDefectCluster = null) {
    const reasons = [];
    const sourcePath = gate.sourcePath ? String(gate.sourcePath) : null;
    const directDependencies = unique(matchedSourceDependencies.filter(path => sourcePath && path === sourcePath));
    const importedDependencies = unique(matchedSourceDependencies.filter(path => !sourcePath || path !== sourcePath));
    if (directDependencies.length) {
      reasons.push({
        kind: "direct-file-dependency",
        summary: `Gate source changed: ${directDependencies.join(", ")}.`,
        paths: directDependencies
      });
    }
    if (importedDependencies.length) {
      reasons.push({
        kind: "imported-source-dependency",
        summary: `Declared source dependencies changed: ${importedDependencies.join(", ")}.`,
        paths: importedDependencies
      });
    }
    const routeTargets = unique(matchedTargets.filter(target => String(target).startsWith("route:")));
    if (routeTargets.length) {
      reasons.push({
        kind: "route-ownership-dependency",
        summary: `Matched route targets: ${routeTargets.map(target => nodes.get(target)?.title || target).join(", ")}.`,
        targets: routeTargets
      });
    }
    const pluginTargets = unique(matchedTargets.filter(target => String(target).startsWith("plugin.")));
    if (pluginTargets.length) {
      reasons.push({
        kind: "plugin-ownership-dependency",
        summary: `Matched plugin targets: ${pluginTargets.map(target => nodes.get(target)?.title || target).join(", ")}.`,
        targets: pluginTargets
      });
    }
    const docTargets = unique(matchedTargets.filter(target => String(target).startsWith("doc:")));
    if (docTargets.length) {
      reasons.push({
        kind: "doc-freshness-dependency",
        summary: `Matched governed docs: ${docTargets.map(target => nodes.get(target)?.title || target).join(", ")}.`,
        targets: docTargets
      });
    }
    const telemetryTargets = unique(matchedTargets.filter(target => String(target).startsWith("telemetryMetric:")));
    if (telemetryTargets.length) {
      reasons.push({
        kind: "telemetry-regression-dependency",
        summary: `Matched telemetry-sensitive metrics: ${telemetryTargets.map(target => nodes.get(target)?.title || target).join(", ")}.`,
        targets: telemetryTargets
      });
    }
    const testEnvironmentTargets = unique(matchedTargets.filter(target => String(target).startsWith("testEnvironment:")));
    if (testEnvironmentTargets.length) {
      reasons.push({
        kind: "candidate-snapshot-environment-dependency",
        summary: `Matched candidate snapshot environments: ${testEnvironmentTargets.map(target => platformModelTargetTitle(target, nodes)).join(", ")}.`,
        targets: testEnvironmentTargets
      });
    }
    if (priorDefectCluster) {
      reasons.push({
        kind: "prior-defect-cluster-dependency",
        summary: `Matched prior defect cluster ${priorDefectCluster.title} from ${priorDefectCluster.priorBranchIds.join(", ")}.`,
        targets: [priorDefectCluster.id],
        branchIds: [...priorDefectCluster.priorBranchIds]
      });
    }
    return reasons;
  }
  function collectAffectedRows(scopeType, scope) {
    const affectedSystems = new Set((scope.affectedSystemSummaries ?? []).map(row => String(row.system || "")));
    const changedPaths = new Set((scope.changedPaths ?? []).map(String));
    const affectedTargets = inferredAffectedTargetsForChangedPaths(scope.changedPaths ?? []);
    const docTargets = new Set([
      ...(scope.docsFreshness?.requiredDocs ?? []).map(doc => `doc:${doc}`),
      ...(scope.docsFreshness?.touchedDocs ?? []).map(doc => `doc:${doc}`),
      ...(scope.docsFreshness?.missingDocs ?? []).map(doc => `doc:${doc}`)
    ]);
    const telemetryTargets = new Set((scope.telemetryImpactSummaries ?? [])
      .map(summary => summary?.id ? telemetryMetricNodeId(summary.id) : null)
      .filter(Boolean));
    const priorDefectCluster = priorDefectClusterContextForScope(scopeType, scope);
    for (const gate of rows) {
      const clusterMatchedTargets = priorDefectCluster
        ? unique(gate.protectedObjects.filter(target =>
            priorDefectCluster.historicalAffectedSystems.has(target)
            || priorDefectCluster.historicalAffectedSystems.has(target.replace(/^profile:/, ""))
            || priorDefectCluster.historicalDocTargets.has(target)
            || priorDefectCluster.historicalTelemetryTargets.has(target)
            || priorDefectCluster.historicalTargets.has(target)
          ))
        : [];
      const clusterMatchedSourceDependencies = priorDefectCluster
        ? unique(gate.sourceDependencies.filter(dependency => priorDefectCluster.historicalChangedPaths.has(dependency)))
        : [];
      const matchedTargets = unique(gate.protectedObjects.filter(target =>
        affectedSystems.has(target)
        || affectedSystems.has(target.replace(/^profile:/, ""))
        || affectedSystems.has(target.replace(/^capability:/, ""))
        || docTargets.has(target)
        || telemetryTargets.has(target)
        || affectedTargets.has(target)
      ));
      const matchedSourceDependencies = unique(gate.sourceDependencies.filter(dependency => changedPaths.has(dependency)));
      const hasPriorDefectDependency = Boolean(priorDefectCluster && (clusterMatchedTargets.length || clusterMatchedSourceDependencies.length));
      if (!matchedTargets.length && !matchedSourceDependencies.length && !hasPriorDefectDependency) continue;
      const scopeId = String(scope.id);
      const affectedRow = {
        id: `affectedTestGate:${scopeType}:${scopeId}:${gate.id}`,
        gateId: gate.id,
        gateTitle: gate.title,
        protectedObjects: [...gate.protectedObjects],
        protectedObjectLabels: [...gate.protectedObjectLabels],
        matchedTargets: unique([
          ...matchedTargets,
          ...(hasPriorDefectDependency ? [priorDefectCluster.id] : [])
        ]),
        matchedTargetLabels: matchedTargets.map(target => platformModelTargetTitle(target, nodes)),
        matchedSourceDependencies,
        sourceDependencies: [...gate.sourceDependencies],
        selectionReasons: selectionReasonsForGate(
          gate,
          matchedTargets,
          matchedSourceDependencies,
          hasPriorDefectDependency ? priorDefectCluster : null
        )
      };
      if (hasPriorDefectDependency) {
        affectedRow.matchedTargetLabels = unique([
          ...affectedRow.matchedTargetLabels,
          nodes.get(priorDefectCluster.id)?.title || priorDefectCluster.id
        ]);
      }
      if (scopeType === "branch") {
        gate.selectedByBranches.push(scopeId);
        affectedRows.push({
          ...affectedRow,
          branchId: scopeId
        });
      } else {
        gate.selectedByChangeSets.push(scopeId);
        affectedRowsByChangeSet.push({
          ...affectedRow,
          changeSetId: scopeId
        });
      }
    }
  }
  for (const branch of branches) collectAffectedRows("branch", branch);
  for (const changeSet of changeSets) collectAffectedRows("changeSet", changeSet);
  for (const row of rows) {
    row.selectedByBranches = unique(row.selectedByBranches);
    row.selectedByChangeSets = unique(row.selectedByChangeSets);
  }
  affectedRows.sort((left, right) => left.branchId.localeCompare(right.branchId) || left.gateId.localeCompare(right.gateId));
  affectedRowsByChangeSet.sort((left, right) => left.changeSetId.localeCompare(right.changeSetId) || left.gateId.localeCompare(right.gateId));
  const index = buildTestGateIndex(rows, affectedRows, affectedRowsByChangeSet);
  const selectedByBranch = Object.fromEntries(
    Object.entries(index.byBranch).map(([branchId]) => [
      branchId,
      selectMeaningfulTestGates(
        affectedRows.filter(row => row.branchId === branchId),
        rows
      )
    ])
  );
  const selectedByChangeSet = Object.fromEntries(
    Object.entries(index.byChangeSet).map(([changeSetId]) => [
      changeSetId,
      selectMeaningfulTestGates(
        affectedRowsByChangeSet.filter(row => row.changeSetId === changeSetId),
        rows
      )
    ])
  );
  return {
    rows,
    affectedRows,
    affectedRowsByChangeSet,
    index,
    byBranch: index.byBranch,
    byChangeSet: index.byChangeSet,
    selectedByBranch,
    selectedByChangeSet
  };
}

export function parseRoadmapTasks(docPath, source) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const headings = [];
  const tasks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      headings[level - 1] = headingMatch[2].trim();
      headings.length = level;
      continue;
    }
    const taskMatch = line.match(/^- \[([^\]])\] (.+)$/);
    if (!taskMatch) continue;
    const section = headings.filter(Boolean).join(" / ");
    const title = taskMatch[2].trim();
    const marker = taskMatch[1];
    const parsedStatus = roadmapTaskStatus(marker);
    tasks.push({
      id: `task:${docPath}:${index + 1}:${slugify(`${section} ${title}`)}`,
      doc: docPath,
      line: index + 1,
      title,
      section,
      marker,
      checked: parsedStatus.checked,
      status: parsedStatus.status,
      references: extractMarkdownReferences(title),
      targets: []
    });
  }
  return tasks;
}

function platformTargetNodeId(kind, id) {
  if (!id) return null;
  if (String(id).includes(":")) return String(id);
  if (kind === "serverRunner") return `serverRunner:${id}`;
  if (kind === "mcpServer") return `mcp:${id}`;
  if (kind === "capability") return `capability:${id}`;
  return `${kind || "target"}:${id}`;
}

export async function buildPlatformModel({
  appContext = null,
  diagnostics = null,
  project = null
} = {}) {
  const nodes = new Map();
  const edges = new Map();
  const catalog = await readJson("store/seeds/first-party-plugin-catalog.json", { packages: [], bundles: [] });
  const profilesSeed = await readJson("store/seeds/runtime-profiles.json", { profiles: {} });
  const pluginPackages = catalog.packages ?? [];
  const bundleRows = catalog.bundles ?? [];
  const bundleIdsByPlugin = Object.create(null);
  for (const row of bundleRows) pushByKey(bundleIdsByPlugin, row.plugin, row.id);
  const activePlugins = new Set(diagnostics?.plugins?.activePluginIds ?? appContext?.pluginCatalog?.summary?.activePluginIds ?? []);
  const effectivePlugins = new Set(diagnostics?.plugins?.effectivePluginIds ?? []);
  const serverRunners = projectRows(project, moduleProjectors.serverRunners);
  const runtimePluginInstalls = projectRows(project, moduleProjectors.runtimePluginInstalls);
  const authoredCapabilities = [
    ...projectRows(project, moduleProjectors.capabilities),
    ...projectRows(project, moduleProjectors.capabilityCatalog)
  ];
  const capabilityInstalls = projectRows(project, moduleProjectors.capabilityInstalls);
  const proposals = projectRows(project, moduleProjectors.proposals);
  const rawChangeSets = projectRows(project, moduleProjectors.changeSets);
  const changeSetEdits = projectRows(project, moduleProjectors.changeSetEdits);
  const conflicts = projectRows(project, moduleProjectors.conflicts);
  const mergeIntents = projectRows(project, moduleProjectors.mergeIntents);
  const changeSetsByBranch = Object.create(null);
  const editsByChangeSet = Object.create(null);
  for (const edit of changeSetEdits) pushByKey(editsByChangeSet, edit.changeSetId, edit);
  const changeSets = rawChangeSets.map(row => ({
    ...row,
    ...platformChangeSetInsights(row, {
      edits: editsByChangeSet[row.id] ?? []
    })
  }));
  for (const changeSet of changeSets) pushByKey(changeSetsByBranch, changeSet.branchId, changeSet);
  const branches = projectRows(project, moduleProjectors.branches).map(branch => ({
    ...branch,
    ...platformBranchInsights(branch, {
      changeSets: changeSetsByBranch[branch.id] ?? [],
      edits: (changeSetsByBranch[branch.id] ?? []).flatMap(changeSet => editsByChangeSet[changeSet.id] ?? []),
      proposals
    })
  }));
  const candidateSnapshots = projectRows(project, moduleProjectors.candidateSnapshots);
  const testRuns = projectRows(project, moduleProjectors.testRuns);
  const testResults = projectRows(project, moduleProjectors.testResults);
  const testArtifacts = projectRows(project, moduleProjectors.testArtifacts);
  const testSuites = projectRows(project, moduleProjectors.testSuites);
  const testCases = projectRows(project, moduleProjectors.testCases);
  const projectedTestGates = projectRows(project, moduleProjectors.testGates);
  const projectedCoverageEdges = projectRows(project, moduleProjectors.coverageEdges);
  const flakeScoresByGate = buildFlakeScoreByGate(testResults);
  const latestTestResultsProjection = projectValue(project, moduleProjectors.latestTestResultsByGate, { rows: [], byGate: Object.create(null) });
  const candidateSnapshotsByBranch = candidateSnapshotsByBranchIndex(candidateSnapshots);
  const snapshotDiagnostics = normalizeSnapshotDiagnostics(diagnostics?.appSnapshot ?? null);
  const runtimeRevisions = buildRuntimeRevisionRows(snapshotDiagnostics, candidateSnapshotsByBranch);
  const activeRuntimeRevision = runtimeRevisions[0] ?? null;
  const snapshotBuilds = buildSnapshotBuildRows(candidateSnapshots);
  const snapshotBuildErrors = buildSnapshotBuildErrorRows(candidateSnapshots);
  const markdownDocPaths = await listMarkdownDocs();
  const parsedDocs = [];

  for (const row of pluginPackages) {
    const manifest = await readJson(`plugins/${row.directory}/plugin.json`, {});
    const id = row.id || manifest.id;
    const status = activePlugins.has(id) ? "active" : (effectivePlugins.has(id) ? "effective" : "inactive");
    addNode(nodes, {
      id,
      kind: "plugin",
      title: manifest.displayName || id,
      lifecycle: lifecycleForPlugin(id, manifest),
      owner: id,
      status,
      source: `plugins/${row.directory}/plugin.json`
    });
  }

  for (const row of bundleRows) {
    addNode(nodes, {
      id: row.id,
      kind: "bundle",
      title: row.displayName || row.id,
      lifecycle: lifecycleForPlugin(row.plugin || row.id, row),
      owner: row.plugin ?? null,
      status: (diagnostics?.activeBundles ?? []).some(bundle => bundle.id === row.id) ? "active" : "inactive",
      source: "store/seeds/first-party-plugin-catalog.json"
    });
    if (row.plugin) addEdge(edges, row.plugin, "owns", row.id, "catalog");
  }

  const profiles = Object.entries(profilesSeed.profiles ?? {}).map(([id, profile]) => ({
    id,
    coreBundles: [...(profile.coreBundles ?? [])],
    plugins: [...(profile.plugins ?? [])]
  }));
  for (const profile of profiles) {
    addNode(nodes, {
      id: `profile:${profile.id}`,
      kind: "profile",
      title: profile.id,
      lifecycle: profile.id === "minimal" ? ["execute", "verify"] : ["execute", "ship"],
      owner: "runtime",
      status: diagnostics?.activeProfile === profile.id ? "active" : "known",
      source: "store/seeds/runtime-profiles.json"
    });
    for (const plugin of profile.plugins) addEdge(edges, `profile:${profile.id}`, "activates", plugin, "profile");
    for (const bundle of profile.coreBundles) addEdge(edges, `profile:${profile.id}`, "activates", bundle, "profile");
  }

  addTelemetryMetricNodes(nodes);

  for (const runner of serverRunners) {
    addNode(nodes, {
      id: `serverRunner:${runner.id}`,
      kind: "serverRunner",
      title: runner.id,
      lifecycle: ["execute", "ship"],
      owner: runner.context ?? runner.homeContext ?? "runtime",
      status: appContext?.serverRunnerId === runner.id ? "active" : "known",
      source: "witnesses"
    });
  }

  for (const install of runtimePluginInstalls) {
    const id = `runtimePluginInstall:${install.serverRunner}:${install.plugin}`;
    addNode(nodes, {
      id,
      kind: "runtimePluginInstall",
      title: `${install.serverRunner} -> ${install.plugin}`,
      lifecycle: ["execute", "ship"],
      owner: install.serverRunner,
      status: "installed",
      source: "witnesses"
    });
    addEdge(edges, `serverRunner:${install.serverRunner}`, "installs", install.plugin, "witnesses");
    addEdge(edges, id, "targets", `serverRunner:${install.serverRunner}`, "witnesses");
    addEdge(edges, id, "installs", install.plugin, "witnesses");
  }

  for (const route of diagnostics?.routes ?? []) {
    const id = `route:${route.method || "GET"} ${route.matcher}`;
    addNode(nodes, {
      id,
      kind: "route",
      title: `${route.method || "GET"} ${route.matcher}`,
      lifecycle: lifecycleForHandler(route.handler),
      owner: route.handler ?? null,
      status: "active",
      source: "runtime.diagnostics"
    });
    addNode(nodes, {
      id: `handler:${route.handler}`,
      kind: "handler",
      title: route.handler,
      lifecycle: lifecycleForHandler(route.handler),
      owner: null,
      status: "active",
      source: "runtime.diagnostics"
    });
    addEdge(edges, id, "dispatchesTo", `handler:${route.handler}`, "runtime.diagnostics");
  }

  for (const capability of authoredCapabilities) {
    const id = capability.id ?? capability.capability ?? capability.name;
    if (!id) continue;
    addNode(nodes, {
      id: `capability:${id}`,
      kind: "capability",
      title: id,
      lifecycle: lifecycleForCapability(id),
      owner: capability.owner ?? capability.package ?? null,
      status: "authored",
      source: "witnesses"
    });
  }

  for (const capability of diagnostics?.providedCapabilities ?? []) {
    addNode(nodes, {
      id: `capability:${capability}`,
      kind: "capability",
      title: capability,
      lifecycle: lifecycleForCapability(capability),
      owner: null,
      status: "active",
      source: "runtime.diagnostics"
    });
  }

  for (const install of capabilityInstalls) {
    const id = `capabilityInstall:${install.targetKind || "target"}:${install.target}:${install.capability}`;
    addNode(nodes, {
      id,
      kind: "capabilityInstall",
      title: `${install.capability} on ${install.target}`,
      lifecycle: ["execute", "steward"],
      owner: install.target ?? null,
      status: "installed",
      source: "witnesses"
    });
    addEdge(edges, id, "installs", `capability:${install.capability}`, "witnesses");
    addEdge(edges, id, "targets", `${install.targetKind || "target"}:${install.target}`, "witnesses");
  }

  for (const surface of diagnostics?.surfaces ?? []) {
    addNode(nodes, {
      id: surface.id,
      kind: "surface",
      title: surface.id,
      lifecycle: ["observe"],
      owner: null,
      status: surface.href ? "reachable" : "action",
      source: "runtime.diagnostics"
    });
  }

  const activeMcpServers = projectRows(project, moduleProjectors.mcpServers);
  const mcpToolInstalls = projectRows(project, moduleProjectors.mcpToolInstalls);
  for (const server of activeMcpServers ?? []) {
    addNode(nodes, {
      id: `mcp:${server.id}`,
      kind: "mcpServer",
      title: server.label || server.id,
      lifecycle: ["observe", "author"],
      owner: server.serviceIdentity ?? server.context ?? null,
      status: "known",
      source: "witnesses"
    });
    if (server.serverRunner) addEdge(edges, `mcp:${server.id}`, "uses", server.serverRunner, "witnesses");
    if (server.serverRunner) addEdge(edges, `mcp:${server.id}`, "uses", `serverRunner:${server.serverRunner}`, "witnesses");
  }
  for (const install of mcpToolInstalls ?? []) {
    addNode(nodes, {
      id: `mcpTool:${install.tool}`,
      kind: "mcpTool",
      title: install.tool,
      lifecycle: install.tool.startsWith("platform.") ? ["observe", "steward"] : ["execute"],
      owner: "plugin.mcp",
      status: "installed",
      source: "witnesses"
    });
    addEdge(edges, `mcp:${install.server}`, "exposes", `mcpTool:${install.tool}`, "witnesses");
  }

  for (const docPath of markdownDocPaths) {
    const fullPath = path.join(repoRoot, docPath);
    const source = await readText(docPath, "");
    let updatedAt = null;
    try {
      updatedAt = (await fs.stat(fullPath)).mtime.toISOString();
    } catch {}
    const sections = parseMarkdownSections(docPath, source);
    const tasks = parseRoadmapTasks(docPath, source);
    const references = extractMarkdownReferences(source);
    const staleBranches = branches
      .filter(branch => (branch.docsFreshness?.missingDocs ?? []).includes(docPath))
      .map(branch => String(branch.id));
    const touchedBranches = branches
      .filter(branch => (branch.docsFreshness?.touchedDocs ?? []).includes(docPath))
      .map(branch => String(branch.id));
    const requiredBranches = branches
      .filter(branch => (branch.docsFreshness?.requiredDocs ?? []).includes(docPath))
      .map(branch => String(branch.id));
    const status = staleBranches.length ? "stale" : (requiredBranches.length ? "fresh" : "reference");
    const freshness = {
      status,
      staleBranches: unique(staleBranches),
      touchedBranches: unique(touchedBranches),
      requiredBranches: unique(requiredBranches),
      summary: staleBranches.length
        ? `Stale for branches ${unique(staleBranches).join(", ")}.`
        : (requiredBranches.length
          ? `Fresh for branches ${unique(requiredBranches).join(", ")}.`
          : "Reference doc with no active freshness pressure.")
    };
    const docRow = {
      id: `doc:${docPath}`,
      path: docPath,
      role: docRoleForPath(docPath),
      owner: docOwnerForPath(docPath),
      lifecycle: docLifecycleForPath(docPath),
      status,
      updatedAt,
      freshness,
      sectionCount: sections.length,
      taskCount: tasks.length,
      references
    };
    parsedDocs.push({
      ...docRow,
      source,
      sections,
      tasks
    });
    addNode(nodes, {
      id: docRow.id,
      kind: "doc",
      title: docPath,
      lifecycle: docRow.lifecycle,
      owner: docRow.owner,
      status: docRow.status,
      source: docPath
    });
    for (const section of sections) {
      addNode(nodes, {
        id: section.id,
        kind: "docSection",
        title: section.title,
        lifecycle: ["author", "steward"],
        owner: docRow.owner,
        status: "known",
        source: `${docPath}:${section.line}`
      });
      addEdge(edges, docRow.id, "hasSection", section.id, "docs");
      if (section.parentSectionId) addEdge(edges, section.parentSectionId, "contains", section.id, "docs");
    }
    for (const task of tasks) {
      addNode(nodes, {
        id: task.id,
        kind: "task",
        title: task.title,
        lifecycle: ["author", "steward"],
        owner: docRow.owner,
        status: task.status,
        source: `${task.doc}:${task.line}`
      });
      addEdge(edges, docRow.id, "describes", task.id, "roadmap");
    }
  }

  const roadmapDocPath = "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md";
  const rawRoadmapTasks = parsedDocs.find(doc => doc.path === roadmapDocPath)?.tasks ?? [];

  const referencedRepoPaths = unique(parsedDocs.flatMap(doc => doc.references?.filePaths ?? []));
  for (const filePath of referencedRepoPaths) {
    const targetId = repoFileTargetId(filePath);
    if (!targetId || targetId.startsWith("doc:")) continue;
    try {
      await fs.stat(path.join(repoRoot, filePath));
    } catch {
      continue;
    }
    addNode(nodes, {
      id: targetId,
      kind: repoFileNodeKind(filePath),
      title: filePath,
      lifecycle: repoFileLifecycle(filePath),
      owner: repoFileOwner(filePath),
      status: "authored",
      source: filePath
    });
    const owner = repoFileOwner(filePath);
    if (owner && nodes.has(owner)) addEdge(edges, owner, "declares", targetId, "source");
  }

  for (const authoredSource of PLATFORM_AUTHORED_SOURCES) {
    addNode(nodes, {
      ...authoredSource,
      owner: "plugin.platform",
      status: "authored"
    });
    addEdge(edges, "plugin.platform", "declares", authoredSource.id, "source");
    addEdge(edges, "surface:platform", "authoredBy", authoredSource.id, "source");
  }

  for (const proposal of proposals) {
    addNode(nodes, {
      id: `proposal:${proposal.id}`,
      kind: "proposal",
      title: proposal.id,
      lifecycle: ["author", "steward"],
      owner: proposal.owner ?? null,
      status: proposal.status ?? "known",
      source: "witnesses"
    });
    if (proposal.targetProcess) addEdge(edges, `proposal:${proposal.id}`, "proposes", `handler:${proposal.targetProcess}`, "witnesses");
    if (proposal.targetId) addEdge(edges, `proposal:${proposal.id}`, "targets", platformTargetNodeId(proposal.targetKind, proposal.targetId), "witnesses");
  }
  for (const branch of branches) {
    addNode(nodes, {
      id: `branch:${branch.id}`,
      kind: "branch",
      title: branch.title || branch.id,
      lifecycle: ["author", "verify", "steward"],
      owner: branch.owner ?? "plugin.platform",
      status: branch.status ?? "open",
      source: "witnesses"
    });
    for (const changeSetId of branch.changeSetIds ?? []) {
      addEdge(edges, `branch:${branch.id}`, "contains", `changeSet:${changeSetId}`, "witnesses");
    }
    if (branch.parentBranchId) {
      addEdge(edges, `branch:${branch.id}`, "dependsOn", `branch:${branch.parentBranchId}`, "witnesses");
    }
    if (branch.latestCandidateSnapshotId) {
      addEdge(edges, `branch:${branch.id}`, "tracks", branch.latestCandidateSnapshotId, "witnesses");
    }
  }
  for (const changeSet of changeSets) {
    addNode(nodes, {
      id: `changeSet:${changeSet.id}`,
      kind: "changeSet",
      title: changeSet.title || changeSet.id,
      lifecycle: ["author", "transform", "verify"],
      owner: changeSet.owner ?? "plugin.platform",
      status: changeSet.status ?? "draft",
      source: "witnesses"
    });
    addEdge(edges, `branch:${changeSet.branchId}`, "contains", `changeSet:${changeSet.id}`, "witnesses");
    if (changeSet.latestCandidateSnapshotId) {
      addEdge(edges, `changeSet:${changeSet.id}`, "validatesTo", changeSet.latestCandidateSnapshotId, "witnesses");
    }
  }
  for (const edit of changeSetEdits) {
    addNode(nodes, {
      id: edit.id,
      kind: "changeSetEdit",
      title: edit.path,
      lifecycle: ["author", "transform"],
      owner: edit.actor ?? "plugin.platform",
      status: "staged",
      source: edit.path
    });
    addEdge(edges, `changeSet:${edit.changeSetId}`, "stages", edit.id, "witnesses");
  }
  for (const snapshot of candidateSnapshots) {
    addNode(nodes, {
      id: snapshot.id,
      kind: "candidateSnapshot",
      title: snapshot.id,
      lifecycle: ["transform", "verify"],
      owner: "plugin.platform",
      status: snapshot.status ?? "invalid",
      source: "witnesses"
    });
    addEdge(edges, `changeSet:${snapshot.changeSetId}`, "produces", snapshot.id, "witnesses");
    addEdge(edges, `branch:${snapshot.branchId}`, "tracks", snapshot.id, "witnesses");
  }
  for (const revision of runtimeRevisions) {
    addNode(nodes, {
      id: revision.id,
      kind: "runtimeRevision",
      title: `Runtime Revision ${revision.revision}`,
      lifecycle: ["execute", "observe", "verify"],
      owner: "runtime",
      status: revision.status,
      source: "appSnapshot"
    });
    addNode(nodes, {
      id: revision.backendRevisionId,
      kind: "backendRevision",
      title: `Backend Revision ${revision.revision}`,
      lifecycle: ["execute", "observe", "verify"],
      owner: "runtime",
      status: revision.status,
      source: "appSnapshot"
    });
    addEdge(edges, revision.id, "materializes", revision.backendRevisionId, "appSnapshot");
    if (revision.frontendRevisionId) {
      addNode(nodes, {
        id: revision.frontendRevisionId,
        kind: "frontendRevision",
        title: `Frontend Revision ${revision.revision}`,
        lifecycle: ["execute", "observe", "verify"],
        owner: "runtime",
        status: revision.status,
        source: revision.frontendEventsPath || "appSnapshot"
      });
      addEdge(edges, revision.id, "materializes", revision.frontendRevisionId, "appSnapshot");
      addEdge(edges, revision.frontendRevisionId, "tracks", revision.backendRevisionId, "appSnapshot");
    }
    for (const sourceId of revision.changedSources) addEdge(edges, revision.id, "observes", sourceId, "appSnapshot");
  }
  for (const build of snapshotBuilds) {
    addNode(nodes, {
      id: build.id,
      kind: "snapshotBuild",
      title: build.candidateSnapshotId,
      lifecycle: ["transform", "verify"],
      owner: "plugin.platform",
      status: build.status,
      source: build.candidateSnapshotId
    });
    addEdge(edges, `changeSet:${build.changeSetId}`, "builds", build.id, "witnesses");
    addEdge(edges, build.id, "produces", build.candidateSnapshotId, "witnesses");
  }
  for (const error of snapshotBuildErrors) {
    addNode(nodes, {
      id: error.id,
      kind: "snapshotBuildError",
      title: error.message,
      lifecycle: ["verify", "steward"],
      owner: "plugin.platform",
      status: "open",
      source: error.sourcePath || error.candidateSnapshotId
    });
    addEdge(edges, error.snapshotBuildId, "failedWith", error.id, "witnesses");
    addEdge(edges, error.id, "targets", error.candidateSnapshotId, "witnesses");
  }
  for (const conflict of conflicts) {
    addNode(nodes, {
      id: conflict.id,
      kind: "conflict",
      title: conflict.path || conflict.id,
      lifecycle: ["verify", "steward"],
      owner: "plugin.platform",
      status: conflict.status || "open",
      source: conflict.path || "witnesses"
    });
    addEdge(edges, `changeSet:${conflict.changeSetId}`, "conflictsWith", conflict.id, "witnesses");
    addEdge(edges, `branch:${conflict.branchId}`, "contains", conflict.id, "witnesses");
    if (conflict.candidateSnapshotId) addEdge(edges, conflict.id, "detectedBy", conflict.candidateSnapshotId, "witnesses");
  }
  for (const mergeIntent of mergeIntents) {
    addNode(nodes, {
      id: mergeIntent.id,
      kind: "mergeIntent",
      title: `${mergeIntent.mode} ${mergeIntent.branchId}`,
      lifecycle: ["review", "steward"],
      owner: "plugin.platform",
      status: mergeIntent.status || "open",
      source: "witnesses"
    });
    addEdge(edges, `branch:${mergeIntent.branchId}`, "requests", mergeIntent.id, "witnesses");
    addEdge(edges, `proposal:${mergeIntent.proposalId}`, "expresses", mergeIntent.id, "witnesses");
    if (mergeIntent.intoBranchId) addEdge(edges, mergeIntent.id, "targets", `branch:${mergeIntent.intoBranchId}`, "witnesses");
    if (mergeIntent.ontoBranchId) addEdge(edges, mergeIntent.id, "targets", `branch:${mergeIntent.ontoBranchId}`, "witnesses");
  }
  const routeIdsByMatcher = Object.fromEntries((diagnostics?.routes ?? []).map(route => [
    String(route.matcher || ""),
    `route:${route.method || "GET"} ${route.matcher}`
  ]));
  for (const doc of parsedDocs) {
    for (const task of doc.tasks) {
      task.targets = resolveMarkdownReferenceTargets(task.references, nodes, routeIdsByMatcher);
      for (const target of task.targets) addEdge(edges, task.id, "targets", target.targetId, "roadmap");
    }
  }
  const { docReferences, docDependencies } = buildDocProjectionRows(parsedDocs, nodes, routeIdsByMatcher);
  for (const doc of parsedDocs) {
    for (const target of GOVERNED_DOC_TARGETS[doc.path] ?? []) {
      addEdge(edges, doc.id, "governs", target, "docs");
      if (nodes.has(target)) addEdge(edges, target, "documentedBy", doc.id, "docs");
    }
    for (const routeRef of doc.references.routes) {
      const routeId = routeIdsByMatcher[routeRef];
      if (routeId) addEdge(edges, doc.id, "references", routeId, "docs");
    }
    for (const pluginId of doc.references.pluginIds) {
      if (nodes.has(pluginId)) addEdge(edges, doc.id, "references", pluginId, "docs");
    }
    for (const capabilityId of doc.references.capabilityIds) {
      if (nodes.has(`capability:${capabilityId}`)) addEdge(edges, doc.id, "references", `capability:${capabilityId}`, "docs");
    }
    for (const filePath of doc.references.filePaths) {
      const targetId = repoFileTargetId(filePath);
      if (targetId && nodes.has(targetId)) addEdge(edges, doc.id, "references", targetId, "docs");
    }
  }
  for (const reference of docReferences) {
    addNode(nodes, {
      id: reference.id,
      kind: "docReference",
      title: `${reference.doc} -> ${reference.targetLabel}`,
      lifecycle: ["author", "steward"],
      owner: reference.owner,
      status: "known",
      source: reference.doc
    });
    addEdge(edges, reference.docId, "records", reference.id, "docs");
    addEdge(edges, reference.id, "references", reference.targetId, "docs");
  }

  const packageJson = await readJson("package.json", {});
  for (const [scriptName, scriptCommand] of Object.entries(packageJson.scripts ?? {})) {
    if (!String(scriptName).startsWith("test")) continue;
    const gateId = `gate:script:${slugify(scriptName)}`;
    const command = `npm run ${scriptName}`;
      addNode(nodes, {
        id: gateId,
        kind: "testGate",
        title: command,
        lifecycle: ["verify", "steward"],
        owner: "tests",
      status: "modeled",
      source: "package.json",
      command,
      sourceDependencies: ["package.json"]
    });
    for (const target of packageScriptProtectedObjects(scriptName, scriptCommand, nodes)) {
      addEdge(edges, gateId, "verifies", target, "package-scripts");
      if (nodes.has(target)) addEdge(edges, target, "verifiedBy", gateId, "package-scripts");
    }
  }

  for (const doc of parsedDocs) {
    for (const command of extractDocTestGateCommands(doc.source)) {
      const gateId = `gate:doc:${doc.path}:${slugify(command)}`;
        addNode(nodes, {
          id: gateId,
          kind: "testGate",
          title: command,
          lifecycle: ["verify", "steward"],
          owner: doc.owner,
        status: "modeled",
        source: doc.path,
        command,
        sourceDependencies: [doc.path]
      });
      addEdge(edges, gateId, "verifies", doc.id, "docs");
      addEdge(edges, doc.id, "suggests", gateId, "docs");
      for (const target of GOVERNED_DOC_TARGETS[doc.path] ?? []) {
        addEdge(edges, gateId, "verifies", target, "docs");
        if (nodes.has(target)) addEdge(edges, target, "verifiedBy", gateId, "docs");
      }
    }
  }

  const testFiles = await listFiles(path.join(repoRoot, "test"), file => file.endsWith(".test.js"));
  const pluginTestFiles = await listFiles(path.join(repoRoot, "plugins"), file => file.endsWith(".test.js"));
  for (const file of [...testFiles, ...pluginTestFiles]) {
    const relative = slash(path.relative(repoRoot, file));
    const id = `gate:${relative}`;
    const source = await readText(relative, "");
    const hints = buildTestGateSourceHints(relative, source, nodes, routeIdsByMatcher);
      addNode(nodes, {
        id,
        kind: "testGate",
        title: relative,
        lifecycle: lifecycleForTest(relative),
        owner: "tests",
      status: "modeled",
      source: relative,
      sourceDependencies: hints.sourceDependencies
    });
    const base = path.basename(relative, ".test.js");
    for (const plugin of pluginPackages) {
      if (relative.includes(`plugins/${plugin.directory}/`) || base.includes(plugin.directory)) {
        addEdge(edges, id, "verifies", plugin.id, "tests");
        addEdge(edges, plugin.id, "verifiedBy", id, "tests");
        for (const bundleId of bundleIdsByPlugin[plugin.id] ?? []) {
          addEdge(edges, id, "verifies", bundleId, "tests");
          if (nodes.has(bundleId)) addEdge(edges, bundleId, "verifiedBy", id, "tests");
        }
      }
    }
    for (const target of hints.protectedObjects) {
      addEdge(edges, id, "verifies", target, "test-hints");
      if (nodes.has(target)) addEdge(edges, target, "verifiedBy", id, "test-hints");
    }
    if (relative.includes("plugin-boundaries")) addEdge(edges, id, "verifies", "doc:docs/PLUGIN-MIGRATION-CONTROL.md", "tests");
    if (relative.includes("runtime-profile")) {
      addEdge(edges, id, "verifies", "profile:minimal", "tests");
      addEdge(edges, id, "verifies", "profile:full", "tests");
      addEdge(edges, id, "verifies", "plugin.platform", "tests");
    }
  }

  const defectClusters = buildDefectClusterRows(branches);
  addDefectClusterNodes(nodes, edges, defectClusters);
  const testGateProjection = buildTestGateRows(
    nodes,
    edges,
    branches,
    changeSets,
    latestTestResultsProjection.byGate ?? Object.create(null),
    defectClusters,
    bundleIdsByPlugin,
    projectedTestGates.length ? projectedTestGates : null,
    flakeScoresByGate
  );
  const branchTestRedGreen = branches
    .map(branch => summarizeTestRedGreenScope({
      scopeType: "branch",
      scopeId: branch.id,
      title: branch.title || branch.id,
      selectedGateIds: testGateProjection.selectedByBranch[branch.id] ?? [],
      testGateRows: testGateProjection.rows,
      testRuns,
      testResults
    }))
    .sort((left, right) => String(left.branchId || "").localeCompare(String(right.branchId || "")));
  const changeSetTestRedGreen = changeSets
    .map(changeSet => summarizeTestRedGreenScope({
      scopeType: "changeSet",
      scopeId: changeSet.id,
      title: changeSet.title || changeSet.id,
      selectedGateIds: testGateProjection.selectedByChangeSet[changeSet.id] ?? [],
      testGateRows: testGateProjection.rows,
      testRuns,
      testResults
    }))
    .sort((left, right) => String(left.changeSetId || "").localeCompare(String(right.changeSetId || "")));
  const branchTestRedGreenById = Object.fromEntries(branchTestRedGreen.map(row => [String(row.branchId || ""), row]));
  const changeSetTestRedGreenById = Object.fromEntries(changeSetTestRedGreen.map(row => [String(row.changeSetId || ""), row]));
  const enrichedBranches = branches.map(row => ({
    ...row,
    testRedGreen: branchTestRedGreenById[String(row.id || "")] ?? null
  }));
  const enrichedChangeSets = changeSets.map(row => ({
    ...row,
    testRedGreen: changeSetTestRedGreenById[String(row.id || "")] ?? null
  }));
  const coverageEdges = projectedCoverageEdges.length
    ? projectedCoverageEdges.map(row => ({
        ...row,
        targetLabel: row.coverageKind === "protectedObject"
          ? platformModelTargetTitle(row.targetId, nodes)
          : (row.targetLabel || row.sourceDependency || row.targetId)
      }))
    : buildCoverageEdgeRows(testGateProjection.rows, nodes);
  addTestGateTelemetryEdges(nodes, edges, testGateProjection.rows);
  addTestExecutionNodes(nodes, edges, testGateProjection.rows, testRuns, testResults, testArtifacts, testSuites, testCases);
  for (const coverageEdge of coverageEdges) {
    addNode(nodes, {
      id: coverageEdge.id,
      kind: "coverageEdge",
      title: `${coverageEdge.gateTitle} -> ${coverageEdge.targetLabel}`,
      lifecycle: ["verify", "steward"],
      owner: "plugin.platform",
      status: "known",
      source: coverageEdge.sourcePath ?? "platform"
    });
    addEdge(edges, coverageEdge.gateId, "covers", coverageEdge.id, "tests");
    if (coverageEdge.coverageKind === "protectedObject" && isKnownPlatformModelTarget(coverageEdge.targetId, nodes)) {
      addEdge(edges, coverageEdge.id, "protects", coverageEdge.targetId, "tests");
    }
  }
  const gaps = buildGaps(nodes, edges, { branches, changeSets, testGateProjection });
  const docs = parsedDocs.map(doc => ({
    id: doc.id,
    path: doc.path,
    role: doc.role,
    owner: doc.owner,
    updatedAt: doc.updatedAt,
    status: doc.status,
    freshness: { ...doc.freshness },
    sectionCount: doc.sectionCount,
    taskCount: doc.taskCount,
    references: {
      codeTokens: [...doc.references.codeTokens],
      filePaths: [...doc.references.filePaths],
      pluginIds: [...doc.references.pluginIds],
      capabilityIds: [...doc.references.capabilityIds],
      proposalIds: [...(doc.references.proposalIds ?? [])],
      branchIds: [...(doc.references.branchIds ?? [])],
      routes: [...doc.references.routes]
    }
  }));
  const docSections = parsedDocs.flatMap(doc => doc.sections.map(section => ({ ...section })));
  const docTasks = buildDocTaskEvidence(parsedDocs.flatMap(doc => doc.tasks.map(task => ({
    ...task,
    references: {
      codeTokens: [...(task.references?.codeTokens ?? [])],
      filePaths: [...(task.references?.filePaths ?? [])],
      pluginIds: [...(task.references?.pluginIds ?? [])],
      capabilityIds: [...(task.references?.capabilityIds ?? [])],
      proposalIds: [...(task.references?.proposalIds ?? [])],
      branchIds: [...(task.references?.branchIds ?? [])],
      routes: [...(task.references?.routes ?? [])]
    },
    targets: (task.targets ?? []).map(target => ({ ...target }))
  }))), testGateProjection.rows, gaps);
  const roadmapTasks = docTasks.filter(task => task.doc === roadmapDocPath || rawRoadmapTasks.some(rawTask => rawTask.id === task.id));
  const docIndex = buildDocIndex(docs);
  const docsByPlatformObject = buildDocsByPlatformObject(docs, docDependencies);
  const planning = buildRoadmapPlanningRows({
    roadmapDocPath,
    docs,
    branches: enrichedBranches,
    selectedTestGatesByBranch: testGateProjection.selectedByBranch
  });
  for (const roadmap of planning.roadmaps) {
    addNode(nodes, {
      id: roadmap.id,
      kind: "roadmap",
      title: roadmap.title,
      lifecycle: ["author", "steward"],
      owner: "plugin.platform",
      status: roadmap.status,
      source: roadmap.doc
    });
    if (nodes.has(roadmap.docId)) addEdge(edges, roadmap.docId, "describes", roadmap.id, "roadmap");
  }
  for (const epic of planning.epics) {
    addNode(nodes, {
      id: epic.id,
      kind: "epic",
      title: epic.title,
      lifecycle: ["author", "verify", "steward"],
      owner: "plugin.platform",
      status: epic.status,
      source: roadmapDocPath
    });
    addEdge(edges, epic.roadmapId, "contains", epic.id, "roadmap");
    for (const branchId of epic.branchIds) addEdge(edges, `branch:${branchId}`, "belongsTo", epic.id, "roadmap");
    for (const gateId of epic.gateIds) {
      addEdge(edges, epic.id, "verifiedBy", gateId, "roadmap");
      if (nodes.has(gateId)) addEdge(edges, gateId, "verifies", epic.id, "roadmap");
    }
    for (const docId of epic.docIds) {
      addEdge(edges, epic.id, "documentedBy", docId, "roadmap");
      if (nodes.has(docId)) addEdge(edges, docId, "describes", epic.id, "roadmap");
    }
  }
  for (const feature of planning.features) {
    addNode(nodes, {
      id: feature.id,
      kind: "feature",
      title: feature.title,
      lifecycle: ["author", "verify", "steward"],
      owner: "plugin.platform",
      status: feature.status,
      source: roadmapDocPath
    });
    if (feature.epicId) addEdge(edges, feature.id, "belongsTo", feature.epicId, "roadmap");
    if (feature.roadmapId) addEdge(edges, feature.roadmapId, "contains", feature.id, "roadmap");
    for (const branchId of feature.branchIds) addEdge(edges, `branch:${branchId}`, "targets", feature.id, "roadmap");
    for (const gateId of feature.gateIds) {
      addEdge(edges, feature.id, "verifiedBy", gateId, "roadmap");
      if (nodes.has(gateId)) addEdge(edges, gateId, "verifies", feature.id, "roadmap");
    }
    for (const docId of feature.docIds) {
      addEdge(edges, feature.id, "documentedBy", docId, "roadmap");
      if (nodes.has(docId)) addEdge(edges, docId, "describes", feature.id, "roadmap");
    }
  }
  return {
    lifecycleVocabulary: [...PLATFORM_LIFECYCLES],
    branchLifecycleVocabulary: [...PLATFORM_BRANCH_LIFECYCLE_LANES],
    nodes: [...nodes.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.from.localeCompare(b.from) || a.rel.localeCompare(b.rel) || a.to.localeCompare(b.to)),
    summaries: summarize(nodes, edges, profiles),
    gaps,
    profiles,
    docs,
    docIndex,
    docSections,
    docTasks,
    docReferences,
    docDependencies,
    docsByPlatformObject,
    roadmaps: planning.roadmaps,
    epics: planning.epics,
    features: planning.features,
    branchesByEpic: planning.branchesByEpic,
    testsByFeature: planning.testsByFeature,
    testGates: testGateProjection.rows,
    testGateIndex: testGateProjection.index,
    coverageEdges,
    affectedTestGates: [
      ...testGateProjection.affectedRows,
      ...testGateProjection.affectedRowsByChangeSet
    ],
    affectedTestGatesByBranch: testGateProjection.byBranch,
    affectedTestGatesByChangeSet: testGateProjection.byChangeSet,
    selectedTestGatesByBranch: testGateProjection.selectedByBranch,
    selectedTestGatesByChangeSet: testGateProjection.selectedByChangeSet,
    testRuns: testRuns.map(row => ({ ...row })),
    testResults: testResults.map(row => ({ ...row })),
    testArtifacts: testArtifacts.map(row => ({ ...row })),
    testSuites: testSuites.map(row => ({ ...row })),
    testCases: testCases.map(row => ({ ...row })),
    latestTestResultsByGate: latestTestResultsProjection.byGate ?? Object.create(null),
    branchTestRedGreen,
    changeSetTestRedGreen,
    proposals: proposals.map(row => ({ ...row })),
    proposalActions: platformProposalTemplates(),
    branches: enrichedBranches,
    branchBoard: buildBranchBoard(enrichedBranches),
    changeSets: enrichedChangeSets,
    changeSetEdits: changeSetEdits.map(row => ({ ...row })),
    candidateSnapshots: candidateSnapshots.map(row => ({ ...row })),
    candidateSnapshotsByBranch,
    runtimeRevisions,
    activeRuntimeRevision,
    snapshotBuilds,
    snapshotBuildErrors,
    snapshotDiagnostics,
    conflicts: conflicts.map(row => ({ ...row })),
    mergeIntents: mergeIntents.map(row => ({ ...row })),
    roadmapTasks
  };
}

export function filterPlatformModel(model, view, id = null) {
  if (!view || view === "model") return model;
  if (view === "gaps") return { gaps: model.gaps, summaries: model.summaries };
  if (view === "roadmap") {
    const roadmapDocPath = "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md";
    const roadmapDocs = model.docs.filter(doc => doc.path === roadmapDocPath);
    const roadmapDocIds = new Set(roadmapDocs.map(doc => doc.path));
    const roadmaps = (model.roadmaps ?? []).filter(row =>
      !id
      || row.id === id
      || row.doc === id
      || row.epicIds.includes(id)
      || row.featureIds.includes(id)
    );
    const roadmapIds = new Set(roadmaps.map(row => row.id));
    const epics = (model.epics ?? []).filter(row =>
      !id
      || row.id === id
      || row.roadmapId === id
      || roadmapIds.has(row.roadmapId)
      || row.featureIds.includes(id)
      || row.branchIds.includes(id)
    );
    const epicIds = new Set(epics.map(row => row.id));
    const features = (model.features ?? []).filter(row =>
      !id
      || row.id === id
      || row.epicId === id
      || epicIds.has(row.epicId)
      || row.branchIds.includes(id)
    );
    const featureIds = new Set(features.map(row => row.id));
    const testsByFeature = (model.testsByFeature ?? []).filter(row =>
      !id
      || row.id === id
      || row.featureId === id
      || row.epicId === id
      || featureIds.has(row.featureId)
      || row.branchIds.includes(id)
    );
    const roadmapTasks = (model.roadmapTasks ?? []).filter(task =>
      (!id && roadmapDocIds.has(task.doc))
      || task.id === id
      || task.doc === id
      || task.section === id
    );
    const includeRoadmapDoc = !id || roadmapTasks.length > 0 || roadmapDocIds.has(id) || roadmaps.length > 0 || epics.length > 0 || features.length > 0;
    const docs = includeRoadmapDoc ? roadmapDocs : [];
    return {
      ...buildFilteredDocProjection(model, docs, id),
      roadmaps,
      epics,
      features,
      testsByFeature,
      branchesByEpic: Object.fromEntries(
        Object.entries(model.branchesByEpic ?? {})
          .filter(([epicId]) => !id || epicIds.has(epicId) || epicId === id)
          .map(([epicId, branchIds]) => [epicId, [...branchIds]])
      )
    };
  }
  if (view === "docs") {
    const matchDoc = doc => !id || doc.id === id || doc.path === id;
    const docs = model.docs.filter(matchDoc);
    return buildFilteredDocProjection(model, docs, id, { expandByTarget: true });
  }
  if (view === "profiles") return { profiles: model.profiles, summaries: model.summaries };
  if (view === "proposals") return { proposals: model.proposals, proposalActions: model.proposalActions, summaries: model.summaries };
  if (view === "branches") {
    const branches = id ? model.branches.filter(row => row.id === id) : model.branches;
    return { branches, branchBoard: model.branchBoard, branchLifecycleVocabulary: model.branchLifecycleVocabulary, summaries: model.summaries };
  }
  if (view === "changeSets") {
    const changeSets = id ? model.changeSets.filter(row => row.id === id) : model.changeSets;
    return { changeSets, summaries: model.summaries };
  }
  if (view === "testGates") {
    const testGates = id
      ? model.testGates.filter(row =>
        row.id === id
        || row.protectedObjects.includes(id)
        || row.selectedByBranches.includes(id)
        || row.selectedByChangeSets.includes(id)
      )
      : model.testGates;
    const relevantBranchIds = new Set();
    const relevantChangeSetIds = new Set();
    if (id && Object.prototype.hasOwnProperty.call(model.affectedTestGatesByBranch ?? {}, id)) relevantBranchIds.add(id);
    if (id && Object.prototype.hasOwnProperty.call(model.affectedTestGatesByChangeSet ?? {}, id)) relevantChangeSetIds.add(id);
    for (const gate of testGates) {
      for (const branchId of gate.selectedByBranches ?? []) relevantBranchIds.add(branchId);
      for (const changeSetId of gate.selectedByChangeSets ?? []) relevantChangeSetIds.add(changeSetId);
    }
    const affectedTestGates = (model.affectedTestGates ?? []).filter(row =>
      !id
      || row.id === id
      || row.gateId === id
      || relevantBranchIds.has(row.branchId)
      || relevantChangeSetIds.has(row.changeSetId)
    );
    const affectedTestGatesByChangeSet = Object.fromEntries(
      Object.entries(model.affectedTestGatesByChangeSet ?? {})
        .filter(([changeSetId, gateIds]) => !id || relevantChangeSetIds.has(changeSetId) || gateIds.includes(id))
        .map(([changeSetId, gateIds]) => [changeSetId, [...gateIds]])
    );
    const affectedTestGatesByBranch = Object.fromEntries(
      Object.entries(model.affectedTestGatesByBranch ?? {})
        .filter(([branchId, gateIds]) => !id || relevantBranchIds.has(branchId) || gateIds.includes(id))
        .map(([branchId, gateIds]) => [branchId, [...gateIds]])
    );
    const selectedTestGatesByChangeSet = Object.fromEntries(
      Object.entries(model.selectedTestGatesByChangeSet ?? {})
        .filter(([changeSetId, gateIds]) => !id || relevantChangeSetIds.has(changeSetId) || gateIds.includes(id))
        .map(([changeSetId, gateIds]) => [changeSetId, [...gateIds]])
    );
    const selectedTestGatesByBranch = Object.fromEntries(
      Object.entries(model.selectedTestGatesByBranch ?? {})
        .filter(([branchId, gateIds]) => !id || relevantBranchIds.has(branchId) || gateIds.includes(id))
        .map(([branchId, gateIds]) => [branchId, [...gateIds]])
    );
    const gateIds = new Set(testGates.map(row => String(row.id || "")));
    const coverageEdges = (model.coverageEdges ?? []).filter(row =>
      !id
      || gateIds.has(String(row.gateId || ""))
      || String(row.targetId || "") === String(id)
      || String(row.sourceDependency || "") === String(id)
    );
    const affectedTestGatesForBranches = affectedTestGates.filter(row => row.branchId);
    const affectedTestGatesForChangeSets = affectedTestGates.filter(row => row.changeSetId);
    const testGateIndex = buildTestGateIndex(testGates, affectedTestGatesForBranches, affectedTestGatesForChangeSets);
    return {
      testGates,
      testGateIndex,
      coverageEdges,
      affectedTestGates,
      affectedTestGatesByBranch,
      affectedTestGatesByChangeSet,
      selectedTestGatesByBranch,
      selectedTestGatesByChangeSet,
      summaries: model.summaries
    };
  }
  if (view === "testRuns") {
    const testRuns = id
      ? model.testRuns.filter(row =>
        row.id === id
        || row.gateId === id
        || row.branchId === id
        || row.changeSetId === id
        || row.candidateSnapshotId === id
      )
      : model.testRuns;
    const runIds = new Set(testRuns.map(row => row.id));
    const gateIds = new Set(testRuns.map(row => row.gateId));
    const testResults = id
      ? model.testResults.filter(row =>
        runIds.has(row.runId)
        || gateIds.has(row.gateId)
        || row.id === id
        || row.gateId === id
      )
      : model.testResults;
    const resultIds = new Set(testResults.map(row => row.id));
    const testArtifacts = id
      ? (model.testArtifacts ?? []).filter(row =>
        runIds.has(row.runId)
        || resultIds.has(row.resultId)
        || gateIds.has(row.gateId)
        || row.id === id
        || row.runId === id
        || row.resultId === id
        || row.gateId === id
      )
      : (model.testArtifacts ?? []);
    const artifactIds = new Set(testArtifacts.map(row => row.id));
    const testSuites = id
      ? (model.testSuites ?? []).filter(row =>
        runIds.has(row.runId)
        || resultIds.has(row.resultId)
        || artifactIds.has(row.artifactId)
        || gateIds.has(row.gateId)
        || row.id === id
        || row.runId === id
        || row.resultId === id
        || row.artifactId === id
        || row.gateId === id
      )
      : (model.testSuites ?? []);
    const suiteIds = new Set(testSuites.map(row => row.id));
    const testCases = id
      ? (model.testCases ?? []).filter(row =>
        suiteIds.has(row.suiteId)
        || runIds.has(row.runId)
        || resultIds.has(row.resultId)
        || artifactIds.has(row.artifactId)
        || gateIds.has(row.gateId)
        || row.id === id
        || row.suiteId === id
        || row.runId === id
        || row.resultId === id
        || row.artifactId === id
        || row.gateId === id
      )
      : (model.testCases ?? []);
    const latestTestResultsByGate = Object.fromEntries(
      Object.entries(model.latestTestResultsByGate ?? {})
        .filter(([gateId, row]) => !id || gateIds.has(gateId) || runIds.has(row.runId) || gateId === id || row.runId === id)
        .map(([gateId, row]) => [gateId, { ...row }])
    );
    return { testRuns, testResults, testArtifacts, testSuites, testCases, latestTestResultsByGate, summaries: model.summaries };
  }
  if (view === "testRedGreen") {
    const branchTestRedGreen = id
      ? (model.branchTestRedGreen ?? []).filter(row =>
        row.id === id
        || row.branchId === id
        || (row.selectedGateIds ?? []).includes(id)
      )
      : (model.branchTestRedGreen ?? []);
    const changeSetTestRedGreen = id
      ? (model.changeSetTestRedGreen ?? []).filter(row =>
        row.id === id
        || row.changeSetId === id
        || (row.selectedGateIds ?? []).includes(id)
      )
      : (model.changeSetTestRedGreen ?? []);
    const gateIds = new Set([
      ...branchTestRedGreen.flatMap(row => row.selectedGateIds ?? []),
      ...changeSetTestRedGreen.flatMap(row => row.selectedGateIds ?? [])
    ]);
    const testGates = id
      ? model.testGates.filter(row => gateIds.has(row.id) || row.id === id)
      : model.testGates;
    const latestTestResultsByGate = Object.fromEntries(
      Object.entries(model.latestTestResultsByGate ?? {})
        .filter(([gateId]) => !id || gateIds.has(gateId) || gateId === id)
        .map(([gateId, row]) => [gateId, { ...row }])
    );
    return {
      branchTestRedGreen,
      changeSetTestRedGreen,
      testGates,
      latestTestResultsByGate,
      summaries: model.summaries
    };
  }
  if (view === "candidateSnapshots") {
    const candidateSnapshots = id ? model.candidateSnapshots.filter(row => row.id === id || row.branchId === id || row.changeSetId === id) : model.candidateSnapshots;
    return { candidateSnapshots, summaries: model.summaries };
  }
  if (view === "runtimeRevisions") {
    const runtimeRevisions = id
      ? model.runtimeRevisions.filter(row => row.id === id || row.backendRevisionId === id || row.frontendRevisionId === id)
      : model.runtimeRevisions;
    const runtimeRevisionNumbers = new Set(runtimeRevisions.map(row => Number(row.revision || 0)).filter(revision => revision > 0));
    const runtimeBranchIds = new Set(runtimeRevisions.map(row => row.branchId).filter(Boolean));
    const runtimeChangeSetIds = new Set(runtimeRevisions.map(row => row.changeSetId).filter(Boolean));
    const candidateSnapshots = id
      ? model.candidateSnapshots.filter(row =>
        runtimeRevisionNumbers.has(Number(row.revision || 0))
        || runtimeBranchIds.has(row.branchId)
        || runtimeChangeSetIds.has(row.changeSetId)
      )
      : model.candidateSnapshots;
    const candidateSnapshotIds = new Set(candidateSnapshots.map(row => row.id));
    return {
      runtimeRevisions,
      activeRuntimeRevision: model.activeRuntimeRevision,
      snapshotBuilds: id
        ? model.snapshotBuilds.filter(row =>
          row.id === id
          || row.candidateSnapshotId === id
          || candidateSnapshotIds.has(row.candidateSnapshotId)
          || runtimeRevisionNumbers.has(Number(row.revision || 0))
          || runtimeBranchIds.has(row.branchId)
          || runtimeChangeSetIds.has(row.changeSetId)
        )
        : model.snapshotBuilds,
      snapshotBuildErrors: id
        ? model.snapshotBuildErrors.filter(row =>
          row.id === id
          || row.snapshotBuildId === id
          || row.candidateSnapshotId === id
          || candidateSnapshotIds.has(row.candidateSnapshotId)
          || runtimeRevisionNumbers.has(Number(row.revision || 0))
          || runtimeBranchIds.has(row.branchId)
          || runtimeChangeSetIds.has(row.changeSetId)
        )
        : model.snapshotBuildErrors,
      candidateSnapshots,
      candidateSnapshotsByBranch: model.candidateSnapshotsByBranch,
      snapshotDiagnostics: model.snapshotDiagnostics,
      summaries: model.summaries
    };
  }
  if (view === "conflicts") {
    const conflicts = id ? model.conflicts.filter(row => row.id === id || row.branchId === id || row.changeSetId === id) : model.conflicts;
    return { conflicts, summaries: model.summaries };
  }
  if (view === "mergeIntents") {
    const mergeIntents = id ? model.mergeIntents.filter(row => row.id === id || row.branchId === id || row.proposalId === id) : model.mergeIntents;
    return { mergeIntents, summaries: model.summaries };
  }
  if (view === "gates") return { gates: model.nodes.filter(node => node.kind === "testGate"), summaries: model.summaries };
  if (view === "mcp") return {
    nodes: model.nodes.filter(node => node.kind === "mcpServer" || node.kind === "mcpTool"),
    edges: model.edges.filter(edge => edge.from.startsWith("mcp:") || edge.to.startsWith("mcpTool:")),
    summaries: model.summaries
  };
  const kind = view === "plugin" ? "plugin" : (view === "bundle" ? "bundle" : (view === "capability" ? "capability" : null));
  if (!kind) return model;
  const prefix = kind === "capability" ? "capability:" : "";
  const target = id ? `${prefix}${id}` : null;
  const nodes = model.nodes.filter(node => node.kind === kind && (!target || node.id === target));
  const ids = new Set(nodes.map(node => node.id));
  return {
    nodes,
    edges: model.edges.filter(edge => ids.has(edge.from) || ids.has(edge.to)),
    summaries: model.summaries
  };
}
