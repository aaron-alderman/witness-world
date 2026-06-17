import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { compileRvmToDesirePlus } from "../../src/desire/index.js";
import { bundleId, capabilities, createHandlers, handlerCatalog, providers, routes, surfaces } from "./runtime.js";
import { buildPlatformModel, filterPlatformModel, parseRoadmapTasks, PLATFORM_LIFECYCLES } from "./platform-model.js";
import { renderPlatformPage } from "./platform-page.js";
import { buildPlatformProposalCreateBody, platformProposalTemplates } from "./platform-proposals.js";
import { renderPlatformConsoleCss } from "./platform-style.js";

test("platform plugin exposes platform bundle ownership", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "plugin.platform");
  assert.equal(bundleId, "bundle-platform");
  assert.deepEqual(capabilities, ["platform.self"]);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.model.read"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.gaps.read"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.changeSet.create"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.changeSet.edit"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.changeSet.validate"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.proposal.create"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.proposal.approve"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.proposal.reject"), true);
  assert.equal(handlerCatalog.pageHandlers.includes("page.platform"), true);
  assert.equal(routes.some(route => route.path === "/platform" && route.handler === "page.platform"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-model" && route.handler === "platform.model.read"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-change-sets" && route.handler === "platform.changeSet.create"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.edit"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.validate"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-proposals" && route.handler === "platform.proposal.create"), true);
  assert.equal(routes.some(route => route.handler === "platform.proposal.approve"), true);
  assert.equal(surfaces.some(surface => surface.id === "surface:platform" && surface.href === "/platform"), true);
  assert.equal(providers.some(provider => provider.kind === "moduleProjectors" && provider.id === "platform.projections"), true);
});

test("platform model merges runtime diagnostics with repo inventory", async () => {
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [{ id: "bundle-platform", displayName: "Platform Self Model" }],
      providedCapabilities: ["platform.self"],
      routes: [{ method: "GET", matcher: "/platform", handler: "page.platform" }],
      surfaces: [{ id: "surface:platform", href: "/platform" }],
      plugins: {
        activePluginIds: ["plugin.platform"],
        effectivePluginIds: ["plugin.platform"],
        rejectedPlugins: []
      }
    },
    project: () => []
  });

  assert.deepEqual(model.lifecycleVocabulary, PLATFORM_LIFECYCLES);
  assert.equal(model.proposalActions.some(action => action.action === "runtimePlugin.install"), true);
  assert.equal(model.nodes.some(node => node.id === "plugin.platform" && node.kind === "plugin" && node.lifecycle.includes("steward")), true);
  assert.equal(model.nodes.some(node => node.id === "bundle-platform" && node.kind === "bundle"), true);
  assert.equal(model.nodes.some(node => node.id === "capability:platform.self" && node.kind === "capability"), true);
  assert.equal(model.nodes.some(node => node.id === "route:GET /platform" && node.kind === "route"), true);
  assert.equal(model.nodes.some(node => node.id === "rvm:plugins/platform/platform-console.rvm" && node.kind === "rvmSource"), true);
  assert.equal(model.nodes.some(node => node.id === "wcss:plugins/platform/platform-console.wcss" && node.kind === "wcssSource"), true);
  assert.equal(model.nodes.some(node => node.kind === "task" && node.id.includes("docs/PLATFORM-ALL-THE-WAY-ROADMAP.md")), true);
  assert.equal(model.edges.some(edge => edge.from === "surface:platform" && edge.rel === "authoredBy" && edge.to === "rvm:plugins/platform/platform-console.rvm"), true);
  assert.equal(model.nodes.some(node => node.kind === "gate" && node.id.includes("plugins/platform/platform.test.js")), true);
  assert.equal(model.edges.some(edge => edge.from === "plugin.platform" && edge.rel === "owns" && edge.to === "bundle-platform"), true);
  assert.equal(Array.isArray(model.gaps), true);
  assert.equal(model.summaries.byKind.plugin > 0, true);
  assert.equal(Array.isArray(model.roadmapTasks), true);
  assert.equal(model.roadmapTasks.some(task => task.doc === "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"), true);
});

test("platform console is declared through RVM and styled through WCSS", async () => {
  const rvm = await readFile(new URL("./platform-console.rvm", import.meta.url), "utf8");
  const desirePlus = compileRvmToDesirePlus(rvm, { file: "plugins/platform/platform-console.rvm" });
  const page = desirePlus.nodes.find(node => node.semantic?.kind === "surface" && node.name === "PlatformConsolePage");
  const createCommand = desirePlus.nodes.find(node => node.semantic?.kind === "message" && node.name === "PlatformProposalCreate");
  const css = renderPlatformConsoleCss();

  assert.equal(page?.semantic.identity, "surface:platform");
  assert.equal(page?.semantic.className, "platform-console");
  assert.equal(page?.semantic.children.includes("PlatformProposalPanel"), true);
  assert.equal(createCommand?.semantic.route, "/api/platform-proposals");
  assert.match(css, /Generated from plugins\/platform\/platform-console\.wcss/);
  assert.match(css, /body\.platform-console/);
  assert.match(css, /--platform-accent: #1f6feb;/);
});

test("platform model filters support MCP views", async () => {
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: [],
      routes: [],
      surfaces: [],
      plugins: { activePluginIds: [], effectivePluginIds: [], rejectedPlugins: [] }
    },
    project: projector => {
      if (projector === moduleProjectors.mcpServers) return [{ id: "mcp.platform", label: "Platform MCP", serverRunner: "runner", serviceIdentity: "svc" }];
      if (projector === moduleProjectors.mcpToolInstalls) return [{ server: "mcp.platform", tool: "platform.read", actingMode: "delegated", scopeContexts: [], scopeTargets: [] }];
      return [];
    }
  });
  const mcp = filterPlatformModel(model, "mcp");
  const gates = filterPlatformModel(model, "gates");

  assert.equal(mcp.nodes.some(node => node.id === "mcp:mcp.platform"), true);
  assert.equal(mcp.nodes.some(node => node.id === "mcpTool:platform.read"), true);
  assert.equal(gates.gates.every(node => node.kind === "gate"), true);
});

test("platform roadmap task parser preserves extended status markers", () => {
  const tasks = parseRoadmapTasks("docs/demo.md", `
# Demo

- [X] Done task
- [~] In progress task
- [B] Blocked task
- [L] Logged task
- [ ] Open task
`);

  assert.deepEqual(tasks.map(task => ({ title: task.title, marker: task.marker, status: task.status, checked: task.checked })), [
    { title: "Done task", marker: "X", status: "done", checked: true },
    { title: "In progress task", marker: "~", status: "in-progress", checked: false },
    { title: "Blocked task", marker: "B", status: "blocked", checked: false },
    { title: "Logged task", marker: "L", status: "logged", checked: false },
    { title: "Open task", marker: " ", status: "open", checked: false }
  ]);
});

test("platform model includes witnessed operating objects and proposal state", async () => {
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: [],
      routes: [],
      surfaces: [],
      plugins: { activePluginIds: [], effectivePluginIds: [], rejectedPlugins: [] }
    },
    project: projector => {
      if (projector === moduleProjectors.serverRunners) return [{ id: "runner.platform" }];
      if (projector === moduleProjectors.runtimePluginInstalls) return [{ serverRunner: "runner.platform", plugin: "plugin.platform" }];
      if (projector === moduleProjectors.capabilityInstalls) return [{ capability: "platform.self", target: "runner.platform", targetKind: "serverRunner" }];
      if (projector === moduleProjectors.proposals) return [{ id: "proposal.platform.install", status: "open", targetProcess: "runtimePlugin.install", targetKind: "serverRunner", targetId: "runner.platform", reason: "Install platform" }];
      return [];
    }
  });

  assert.equal(model.nodes.some(node => node.id === "serverRunner:runner.platform" && node.kind === "serverRunner"), true);
  assert.equal(model.nodes.some(node => node.kind === "runtimePluginInstall" && node.id.includes("plugin.platform")), true);
  assert.equal(model.nodes.some(node => node.kind === "capabilityInstall" && node.id.includes("platform.self")), true);
  assert.equal(model.nodes.some(node => node.id === "proposal:proposal.platform.install" && node.status === "open"), true);
  assert.equal(model.edges.some(edge => edge.from === "proposal:proposal.platform.install" && edge.rel === "targets" && edge.to === "serverRunner:runner.platform"), true);
  assert.equal(filterPlatformModel(model, "proposals").proposals.length, 1);
});

test("platform proposal builder normalizes supported proposal bodies", () => {
  const built = buildPlatformProposalCreateBody({
    id: "proposal.platform.mcp",
    action: "mcpTool.install",
    body: {
      server: "platform_mcp",
      tool: "platform.read",
      actingMode: "delegated",
      scopeContexts: ["ctx.platform"],
      scopeTargets: []
    },
    reason: "Expose platform read"
  });

  assert.equal(built.ok, true);
  assert.equal(built.value.targetProcess, "mcpTool.install");
  assert.equal(built.value.targetKind, "mcpServer");
  assert.equal(built.value.targetId, "platform_mcp");
  assert.deepEqual(JSON.parse(built.value.bodyJson), {
    server: "platform_mcp",
    tool: "platform.read",
    actingMode: "delegated",
    scopeContextsJson: JSON.stringify(["ctx.platform"]),
    scopeTargetsJson: JSON.stringify([])
  });
  assert.equal(platformProposalTemplates().some(template => template.action === "stewardship.grant"), true);
  assert.equal(buildPlatformProposalCreateBody({ action: "unsupported", body: {} }).ok, false);
});

test("platform proposal handlers create and review through proposal machinery", async () => {
  const world = createWorld();
  const sent = [];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async req => req.body,
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" },
      executeBootstrapProposal: actor => async proposal => ({ ok: true, witnessIds: [`${actor}:${proposal.id}`] })
    },
    sendGateFailure: (res, gate) => sent.push({ status: gate.status, body: { error: gate.reason } }),
    send: () => {},
    sendJson: (res, status, body) => sent.push({ status, body })
  });

  await handlers["platform.proposal.create"]({
    req: {
      body: {
        id: "proposal.platform.install",
        action: "runtimePlugin.install",
        body: { serverRunner: "runner.platform", plugin: "plugin.platform" },
        reason: "Dogfood the platform console"
      }
    },
    res: {},
    requestActor: "aaron"
  });
  assert.equal(sent.at(-1).status, 201);
  assert.equal(sent.at(-1).body.proposal.targetProcess, "runtimePlugin.install");
  assert.equal(sent.at(-1).body.proposal.targetKind, "serverRunner");
  assert.equal(sent.at(-1).body.proposal.targetId, "runner.platform");

  await handlers["platform.proposal.approve"]({
    res: {},
    params: { id: "proposal.platform.install" },
    requestActor: "aaron"
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.proposal.status, "approved");
});

test("platform change-set handlers stage overlays and validate candidate snapshots", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const sent = [];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async req => req.body,
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" }
    },
    sendGateFailure: (res, gate) => sent.push({ status: gate.status, body: { error: gate.reason } }),
    send: () => {},
    sendJson: (res, status, body) => sent.push({ status, body })
  });

  await handlers["platform.changeSet.create"]({
    req: { body: { id: "changeset.platform.console", branchId: "branch.platform.console", title: "Platform console slice" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  assert.equal(sent.at(-1).status, 201);
  assert.equal(sent.at(-1).body.changeSet.id, "changeset.platform.console");
  assert.equal(world.project(moduleProjectors.changeSetIndex).byId["changeset.platform.console"].branchId, "branch.platform.console");

  const rvm = await readFile(new URL("./platform-console.rvm", import.meta.url), "utf8");
  const wcss = await readFile(new URL("./platform-console.wcss", import.meta.url), "utf8");
  await handlers["platform.changeSet.edit"]({
    req: {
      body: {
        edits: [
          { path: "plugins/platform/platform-console.rvm", content: `${rvm}\n` },
          { path: "plugins/platform/platform-console.wcss", content: `${wcss}\n` }
        ]
      }
    },
    res: {},
    params: { id: "changeset.platform.console" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.edits.length, 2);

  await handlers["platform.changeSet.validate"]({
    res: {},
    params: { id: "changeset.platform.console" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.candidateSnapshot.status, "valid");
  assert.equal(Boolean(sent.at(-1).body.revisionEvent?.id), true);
  assert.equal(world.project(moduleProjectors.candidateSnapshotIndex).rows.length, 1);
}));

test("invalid WCSS keeps the last active candidate snapshot unchanged", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const sent = [];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async req => req.body,
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" }
    },
    sendGateFailure: () => {},
    send: () => {},
    sendJson: (res, status, body) => sent.push({ status, body })
  });

  const wcss = await readFile(new URL("./platform-console.wcss", import.meta.url), "utf8");
  await handlers["platform.changeSet.create"]({
    req: { body: { id: "changeset.invalid.wcss", branchId: "branch.invalid.wcss" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  await handlers["platform.changeSet.edit"]({
    req: { body: { edits: [{ path: "plugins/platform/platform-console.wcss", content: wcss }] } },
    res: {},
    params: { id: "changeset.invalid.wcss" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  await handlers["platform.changeSet.validate"]({
    res: {},
    params: { id: "changeset.invalid.wcss" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  const validSnapshotId = sent.at(-1).body.candidateSnapshot.id;

  await handlers["platform.changeSet.edit"]({
    req: { body: { edits: [{ path: "plugins/platform/platform-console.wcss", content: "theme platform-console\nstyles\n  style broken\n    selector ???" }] } },
    res: {},
    params: { id: "changeset.invalid.wcss" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  await handlers["platform.changeSet.validate"]({
    res: {},
    params: { id: "changeset.invalid.wcss" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  assert.equal(sent.at(-1).body.candidateSnapshot.status, "invalid");
  assert.equal(sent.at(-1).body.activeCandidateSnapshotId, validSnapshotId);
}));

test("platform page renders required operating views", async () => {
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [{ id: "bundle-platform" }],
      providedCapabilities: ["platform.self"],
      routes: [{ method: "GET", matcher: "/platform", handler: "page.platform" }],
      surfaces: [{ id: "surface:platform", href: "/platform" }],
      plugins: { activePluginIds: ["plugin.platform"], effectivePluginIds: ["plugin.platform"], rejectedPlugins: [] }
    },
    project: () => []
  });
  const html = renderPlatformPage(model);

  assert.match(html, /Platform Console/);
  assert.match(html, /Generated from plugins\/platform\/platform-console\.wcss/);
  assert.match(html, /body class="platform-console"/);
  assert.match(html, /Lifecycle Board/);
  assert.match(html, /Platform Map/);
  assert.match(html, /Runtime Profiles/);
  assert.match(html, /Proposal Panel/);
  assert.match(html, /Review Proposals/);
  assert.match(html, /Change Sets/);
  assert.match(html, /Candidate Snapshots/);
  assert.match(html, /Roadmap Tasks/);
  assert.match(html, /platform-proposal-form/);
  assert.match(html, /platform-review-form/);
  assert.match(html, /platform-change-set-create-form/);
  assert.match(html, /\/api\/platform-proposals/);
  assert.match(html, /\/api\/platform-change-sets/);
});
