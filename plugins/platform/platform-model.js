import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { moduleProjectors } from "../../src/modules.js";
import { platformBranchInsights, PLATFORM_BRANCH_LIFECYCLE_LANES } from "./branch-insights.js";
import { platformProposalTemplates } from "./platform-proposals.js";

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

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function unique(values = []) {
  return [...new Set(values.map(String).filter(Boolean))];
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
    source: node.source ?? existing?.source ?? "platform"
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
    status: "active",
    trigger: snapshotDiagnostics.lastRevisionEvent?.trigger || "initial",
    changedSources: [...(snapshotDiagnostics.lastRevisionEvent?.changedSources ?? [])],
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

function buildGaps(nodes, edges) {
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
  }
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
      status: parsedStatus.status
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
  const changeSets = projectRows(project, moduleProjectors.changeSets);
  const changeSetEdits = projectRows(project, moduleProjectors.changeSetEdits);
  const conflicts = projectRows(project, moduleProjectors.conflicts);
  const mergeIntents = projectRows(project, moduleProjectors.mergeIntents);
  const changeSetsByBranch = Object.create(null);
  const editsByChangeSet = Object.create(null);
  for (const changeSet of changeSets) pushByKey(changeSetsByBranch, changeSet.branchId, changeSet);
  for (const edit of changeSetEdits) pushByKey(editsByChangeSet, edit.changeSetId, edit);
  const branches = projectRows(project, moduleProjectors.branches).map(branch => ({
    ...branch,
    ...platformBranchInsights(branch, {
      changeSets: changeSetsByBranch[branch.id] ?? [],
      edits: (changeSetsByBranch[branch.id] ?? []).flatMap(changeSet => editsByChangeSet[changeSet.id] ?? []),
      proposals
    })
  }));
  const candidateSnapshots = projectRows(project, moduleProjectors.candidateSnapshots);
  const candidateSnapshotsByBranch = candidateSnapshotsByBranchIndex(candidateSnapshots);
  const snapshotDiagnostics = normalizeSnapshotDiagnostics(diagnostics?.appSnapshot ?? null);
  const runtimeRevisions = buildRuntimeRevisionRows(snapshotDiagnostics, candidateSnapshotsByBranch);
  const activeRuntimeRevision = runtimeRevisions[0] ?? null;
  const snapshotBuilds = buildSnapshotBuildRows(candidateSnapshots);
  const snapshotBuildErrors = buildSnapshotBuildErrorRows(candidateSnapshots);

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

  for (const [doc, lifecycle] of CONTROL_DOCS.entries()) {
    addNode(nodes, {
      id: `doc:${doc}`,
      kind: "doc",
      title: doc,
      lifecycle,
      owner: "stewardship",
      status: "known",
      source: doc
    });
  }

  const roadmapDocPath = "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md";
  const roadmapTasks = parseRoadmapTasks(roadmapDocPath, await readText(roadmapDocPath, ""));
  for (const task of roadmapTasks) {
    addNode(nodes, {
      id: task.id,
      kind: "task",
      title: task.title,
      lifecycle: ["author", "steward"],
      owner: "plugin.platform",
      status: task.status,
      source: `${task.doc}:${task.line}`
    });
    addEdge(edges, `doc:${task.doc}`, "describes", task.id, "roadmap");
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
  addEdge(edges, "doc:docs/PLUGIN-MIGRATION-CONTROL.md", "governs", "plugin.authoring", "docs");
  addEdge(edges, "doc:docs/RUNTIME-STACK-MAP.md", "governs", "bundle-core-runtime", "docs");
  addEdge(edges, "doc:docs/CAPABILITIES.md", "governs", "plugin.platform", "docs");
  addEdge(edges, "doc:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md", "governs", "plugin.platform", "docs");
  addEdge(edges, "plugin.platform", "documentedBy", "doc:docs/CAPABILITIES.md", "docs");
  addEdge(edges, "plugin.platform", "documentedBy", "doc:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md", "docs");

  const testFiles = await listFiles(path.join(repoRoot, "test"), file => file.endsWith(".test.js"));
  const pluginTestFiles = await listFiles(path.join(repoRoot, "plugins"), file => file.endsWith(".test.js"));
  for (const file of [...testFiles, ...pluginTestFiles]) {
    const relative = slash(path.relative(repoRoot, file));
    const id = `gate:${relative}`;
    addNode(nodes, {
      id,
      kind: "gate",
      title: relative,
      lifecycle: lifecycleForTest(relative),
      owner: "tests",
      status: "modeled",
      source: relative
    });
    const base = path.basename(relative, ".test.js");
    for (const plugin of pluginPackages) {
      if (relative.includes(`plugins/${plugin.directory}/`) || base.includes(plugin.directory)) {
        addEdge(edges, id, "verifies", plugin.id, "tests");
        addEdge(edges, plugin.id, "verifiedBy", id, "tests");
      }
    }
    if (relative.includes("plugin-boundaries")) addEdge(edges, id, "verifies", "doc:docs/PLUGIN-MIGRATION-CONTROL.md", "tests");
    if (relative.includes("runtime-profile")) addEdge(edges, id, "verifies", "profile:minimal", "tests");
  }

  const gaps = buildGaps(nodes, edges);
  return {
    lifecycleVocabulary: [...PLATFORM_LIFECYCLES],
    branchLifecycleVocabulary: [...PLATFORM_BRANCH_LIFECYCLE_LANES],
    nodes: [...nodes.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.from.localeCompare(b.from) || a.rel.localeCompare(b.rel) || a.to.localeCompare(b.to)),
    summaries: summarize(nodes, edges, profiles),
    gaps,
    profiles,
    proposals: proposals.map(row => ({ ...row })),
    proposalActions: platformProposalTemplates(),
    branches: branches.map(row => ({ ...row })),
    branchBoard: buildBranchBoard(branches),
    changeSets: changeSets.map(row => ({ ...row })),
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
  if (view === "candidateSnapshots") {
    const candidateSnapshots = id ? model.candidateSnapshots.filter(row => row.id === id || row.branchId === id || row.changeSetId === id) : model.candidateSnapshots;
    return { candidateSnapshots, summaries: model.summaries };
  }
  if (view === "runtimeRevisions") {
    const runtimeRevisions = id
      ? model.runtimeRevisions.filter(row => row.id === id || row.backendRevisionId === id)
      : model.runtimeRevisions;
    return {
      runtimeRevisions,
      activeRuntimeRevision: model.activeRuntimeRevision,
      snapshotBuilds: id
        ? model.snapshotBuilds.filter(row => row.id === id || row.branchId === id || row.changeSetId === id || row.candidateSnapshotId === id)
        : model.snapshotBuilds,
      snapshotBuildErrors: id
        ? model.snapshotBuildErrors.filter(row => row.id === id || row.branchId === id || row.changeSetId === id || row.candidateSnapshotId === id)
        : model.snapshotBuildErrors,
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
  if (view === "gates") return { gates: model.nodes.filter(node => node.kind === "gate"), summaries: model.summaries };
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
