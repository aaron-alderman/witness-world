import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { moduleProjectors } from "../../src/modules.js";
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
  ["docs/AUTHORING-REPLAY-PLAYBOOK.md", ["author", "verify"]]
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
  addEdge(edges, "doc:docs/PLUGIN-MIGRATION-CONTROL.md", "governs", "plugin.authoring", "docs");
  addEdge(edges, "doc:docs/RUNTIME-STACK-MAP.md", "governs", "bundle-core-runtime", "docs");
  addEdge(edges, "doc:docs/CAPABILITIES.md", "governs", "plugin.platform", "docs");
  addEdge(edges, "plugin.platform", "documentedBy", "doc:docs/CAPABILITIES.md", "docs");

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
    nodes: [...nodes.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.from.localeCompare(b.from) || a.rel.localeCompare(b.rel) || a.to.localeCompare(b.to)),
    summaries: summarize(nodes, edges, profiles),
    gaps,
    profiles,
    proposals: proposals.map(row => ({ ...row })),
    proposalActions: platformProposalTemplates()
  };
}

export function filterPlatformModel(model, view, id = null) {
  if (!view || view === "model") return model;
  if (view === "gaps") return { gaps: model.gaps, summaries: model.summaries };
  if (view === "profiles") return { profiles: model.profiles, summaries: model.summaries };
  if (view === "proposals") return { proposals: model.proposals, proposalActions: model.proposalActions, summaries: model.summaries };
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
