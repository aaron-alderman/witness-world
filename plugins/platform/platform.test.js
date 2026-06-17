import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createWorld } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { compileRvmToDesirePlus } from "../../src/desire/index.js";
import { bundleId, capabilities, createHandlers, handlerCatalog, providers, routes, surfaces } from "./runtime.js";
import { buildPlatformModel, filterPlatformModel, parseRoadmapTasks, PLATFORM_LIFECYCLES } from "./platform-model.js";
import { renderPlatformPage } from "./platform-page.js";
import { buildPlatformProposalCreateBody, platformProposalTemplates } from "./platform-proposals.js";
import { executePlatformProposalTarget } from "./platform-proposal-targets.js";
import { applyPlatformChangeSet } from "./change-sets.js";
import { renderPlatformConsoleCss } from "./platform-style.js";

async function createTempPlatformApplyFixture() {
  const root = path.join(process.cwd(), "test", `.platform-apply-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  const first = path.join(root, "first.json");
  const second = path.join(root, "second.json");
  await writeFile(first, JSON.stringify({ value: 1 }, null, 2), "utf8");
  await writeFile(second, JSON.stringify({ value: 2 }, null, 2), "utf8");
  return {
    root,
    first: path.relative(process.cwd(), first).replaceAll("\\", "/"),
    second: path.relative(process.cwd(), second).replaceAll("\\", "/")
  };
}

async function removeTempPlatformApplyFixture(root) {
  await rm(root, { recursive: true, force: true });
}

test("platform plugin exposes platform bundle ownership", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "plugin.platform");
  assert.equal(bundleId, "bundle-platform");
  assert.deepEqual(capabilities, ["platform.self"]);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.model.read"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.gaps.read"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.branch.list"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.branch.read"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.branch.create"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.changeSet.list"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.changeSet.read"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.changeSet.create"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.changeSet.edit"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.changeSet.removeEdit"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.changeSet.validate"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.changeSet.apply"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.changeSet.reject"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.changeSet.abandon"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.proposal.create"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.proposal.approve"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.proposal.reject"), true);
  assert.equal(handlerCatalog.pageHandlers.includes("page.platform"), true);
  assert.equal(routes.some(route => route.path === "/platform" && route.handler === "page.platform"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-model" && route.handler === "platform.model.read"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-branches" && route.handler === "platform.branch.list"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-branches" && route.handler === "platform.branch.create"), true);
  assert.equal(routes.some(route => route.handler === "platform.branch.read"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-change-sets" && route.handler === "platform.changeSet.list"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-change-sets" && route.handler === "platform.changeSet.create"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.read"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.edit"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.removeEdit"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.validate"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.apply"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.reject"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.abandon"), true);
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
  const branches = filterPlatformModel({
    ...model,
    branches: [{ id: "branch.demo", status: "open" }],
    changeSets: [{ id: "changeset.demo", status: "draft" }],
    candidateSnapshots: [{ id: "candidateSnapshot:demo:1", branchId: "branch.demo", changeSetId: "changeset.demo" }]
  }, "branches");

  assert.equal(mcp.nodes.some(node => node.id === "mcp:mcp.platform"), true);
  assert.equal(mcp.nodes.some(node => node.id === "mcpTool:platform.read"), true);
  assert.equal(gates.gates.every(node => node.kind === "gate"), true);
  assert.equal(branches.branches[0].id, "branch.demo");
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

test("platform model groups branches into lifecycle board lanes", async () => {
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
      if (projector === moduleProjectors.proposals) {
        return [{ id: "proposal.review", status: "open", targetKind: "changeSet", targetId: "changeset.review" }];
      }
      if (projector === moduleProjectors.branches) {
        return [
          { id: "branch.draft", title: "Draft Branch", status: "open", changeSetIds: [] },
          { id: "branch.validate", title: "Validate Branch", status: "open", changeSetIds: ["changeset.validate"] },
          { id: "branch.review", title: "Review Branch", status: "open", changeSetIds: ["changeset.review"] },
          { id: "branch.apply", title: "Apply Branch", status: "valid", changeSetIds: ["changeset.apply"] },
          { id: "branch.push", title: "Push Branch", status: "valid", changeSetIds: ["changeset.push"] },
          { id: "branch.ship", title: "Ship Branch", status: "shipped", changeSetIds: [] }
        ];
      }
      if (projector === moduleProjectors.changeSets) {
        return [
          { id: "changeset.validate", branchId: "branch.validate", status: "draft" },
          { id: "changeset.review", branchId: "branch.review", status: "draft" },
          { id: "changeset.apply", branchId: "branch.apply", status: "valid" },
          { id: "changeset.push", branchId: "branch.push", status: "applied" }
        ];
      }
      return [];
    }
  });

  const branches = filterPlatformModel(model, "branches");
  assert.deepEqual(branches.branchLifecycleVocabulary, ["draft", "validate", "review", "apply", "push", "ship"]);
  assert.equal(branches.branches.find(row => row.id === "branch.draft")?.lifecycleLane, "draft");
  assert.equal(branches.branches.find(row => row.id === "branch.validate")?.lifecycleLane, "validate");
  assert.equal(branches.branches.find(row => row.id === "branch.review")?.lifecycleLane, "review");
  assert.equal(branches.branches.find(row => row.id === "branch.apply")?.lifecycleLane, "apply");
  assert.equal(branches.branches.find(row => row.id === "branch.push")?.lifecycleLane, "push");
  assert.equal(branches.branches.find(row => row.id === "branch.ship")?.lifecycleLane, "ship");
  assert.equal(branches.branches.find(row => row.id === "branch.review")?.reviewProposalIds?.includes("proposal.review"), true);
  assert.equal(branches.branchBoard.find(lane => lane.id === "review")?.branches[0]?.id, "branch.review");
  assert.equal(branches.branchBoard.find(lane => lane.id === "ship")?.branches[0]?.id, "branch.ship");
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
  const branch = buildPlatformProposalCreateBody({
    id: "proposal.platform.branch",
    action: "branch.create",
    body: {
      id: "branch.platform.console",
      title: "Platform console branch",
      parentBranchId: "branch.platform.root",
      epic: "platform",
      feature: "console",
      defect: "n/a"
    },
    reason: "Create a platform branch"
  });
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

  assert.equal(branch.ok, true);
  assert.equal(branch.value.targetProcess, "branch.create");
  assert.equal(branch.value.targetKind, "branch");
  assert.equal(branch.value.targetId, "branch.platform.console");
  assert.deepEqual(JSON.parse(branch.value.bodyJson), {
    id: "branch.platform.console",
    title: "Platform console branch",
    parentBranchId: "branch.platform.root",
    epic: "platform",
    feature: "console",
    defect: "n/a"
  });
  assert.equal(platformProposalTemplates().some(template => template.action === "changeSet.apply"), true);
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
  assert.equal(platformProposalTemplates().some(template => template.action === "changeSet.create"), true);
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

test("platform proposal handlers approve change-set proposals through the shared executor", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const sent = [];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async req => req.body,
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" },
      executeBootstrapProposal: actor => async proposal => executePlatformProposalTarget({
        world,
        actor,
        proposal,
        body: proposal.body ?? {}
      })
    },
    sendGateFailure: (res, gate) => sent.push({ status: gate.status, body: { error: gate.reason } }),
    send: () => {},
    sendJson: (res, status, body) => sent.push({ status, body })
  });

  await handlers["platform.proposal.create"]({
    req: {
      body: {
        id: "proposal.platform.changeSet.create",
        action: "changeSet.create",
        reason: "Stage platform console work",
        body: {
          id: "changeset.platform.console.proposed",
          title: "Platform console proposal"
        }
      }
    },
    res: {},
    requestActor: "aaron"
  });
  assert.equal(sent.at(-1).status, 201);
  assert.equal(sent.at(-1).body.proposal.targetProcess, "changeSet.create");

  await handlers["platform.proposal.approve"]({
    res: {},
    params: { id: "proposal.platform.changeSet.create" },
    requestActor: "aaron"
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(world.project(moduleProjectors.changeSetIndex).byId["changeset.platform.console.proposed"].id, "changeset.platform.console.proposed");
  assert.equal(world.project(moduleProjectors.branchIndex).byId["branch-changeset-platform-console-proposed"].id, "branch-changeset-platform-console-proposed");

  const rvm = await readFile(new URL("./platform-console.rvm", import.meta.url), "utf8");
  await handlers["platform.proposal.create"]({
    req: {
      body: {
        id: "proposal.platform.changeSet.edit",
        action: "changeSet.edit",
        body: {
          changeSetId: "changeset.platform.console.proposed",
          edits: [{ path: "plugins/platform/platform-console.rvm", content: `${rvm}\n` }]
        }
      }
    },
    res: {},
    requestActor: "aaron"
  });
  await handlers["platform.proposal.approve"]({
    res: {},
    params: { id: "proposal.platform.changeSet.edit" },
    requestActor: "aaron"
  });
  assert.equal(world.project(moduleProjectors.changeSetEditIndex).byChangeSet["changeset.platform.console.proposed"].length, 1);

  await handlers["platform.proposal.create"]({
    req: {
      body: {
        id: "proposal.platform.changeSet.validate",
        action: "changeSet.validate",
        body: {
          changeSetId: "changeset.platform.console.proposed"
        }
      }
    },
    res: {},
    requestActor: "aaron"
  });
  await handlers["platform.proposal.approve"]({
    res: {},
    params: { id: "proposal.platform.changeSet.validate" },
    requestActor: "aaron"
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(world.project(moduleProjectors.changeSetIndex).byId["changeset.platform.console.proposed"].status, "valid");
}));

test("platform proposal execution can attach a change set to an existing branch", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const sent = [];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async req => req.body,
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" },
      executeBootstrapProposal: actor => async proposal => executePlatformProposalTarget({
        world,
        actor,
        proposal,
        body: proposal.body ?? {}
      })
    },
    sendGateFailure: (res, gate) => sent.push({ status: gate.status, body: { error: gate.reason } }),
    send: () => {},
    sendJson: (res, status, body) => sent.push({ status, body })
  });

  await handlers["platform.branch.create"]({
    req: { body: { id: "branch.proposal.attach", title: "Attach Here" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  await handlers["platform.proposal.create"]({
    req: {
      body: {
        id: "proposal.platform.changeSet.attach",
        action: "changeSet.create",
        reason: "Attach staged work",
        body: {
          id: "changeset.proposal.attach",
          branchId: "branch.proposal.attach",
          title: "Attached change set"
        }
      }
    },
    res: {},
    requestActor: "aaron"
  });
  await handlers["platform.proposal.approve"]({
    res: {},
    params: { id: "proposal.platform.changeSet.attach" },
    requestActor: "aaron"
  });

  assert.equal(sent.at(-1).status, 200);
  assert.equal(world.project(moduleProjectors.branchIndex).rows.filter(row => row.id === "branch.proposal.attach").length, 1);
  assert.equal(world.project(moduleProjectors.changeSetIndex).byId["changeset.proposal.attach"].branchId, "branch.proposal.attach");
}));

test("platform proposal approval atomically applies all staged files", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformApplyFixture();
  try {
    const world = createWorld();
    const handlers = createHandlers({
      world,
      backendHost: "backendHost",
      frontendHost: "frontendHost",
      readJson: async req => req.body,
      authoringServices: {
        requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" },
        executeBootstrapProposal: actor => async proposal => executePlatformProposalTarget({
          world,
          actor,
          proposal,
          body: proposal.body ?? {}
        })
      },
      sendGateFailure: () => {},
      send: () => {},
      sendJson: () => {}
    });

    await handlers["platform.changeSet.create"]({
      req: { body: { id: "changeset.apply.proposal", branchId: "branch.apply.proposal" } },
      res: {},
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: { runtimeProfile: "full" }
    });
    await handlers["platform.changeSet.edit"]({
      req: {
        body: {
          edits: [
            { path: fixture.first, content: JSON.stringify({ value: 10 }, null, 2) },
            { path: fixture.second, content: JSON.stringify({ value: 20 }, null, 2) }
          ]
        }
      },
      res: {},
      params: { id: "changeset.apply.proposal" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.changeSet.validate"]({
      res: {},
      params: { id: "changeset.apply.proposal" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.proposal.create"]({
      req: {
        body: {
          id: "proposal.platform.changeSet.apply",
          action: "changeSet.apply",
          body: {
            changeSetId: "changeset.apply.proposal"
          }
        }
      },
      res: {},
      requestActor: "aaron"
    });
    await handlers["platform.proposal.approve"]({
      res: {},
      params: { id: "proposal.platform.changeSet.apply" },
      requestActor: "aaron"
    });

    assert.deepEqual(JSON.parse(await readFile(path.join(fixture.root, "first.json"), "utf8")), { value: 10 });
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture.root, "second.json"), "utf8")), { value: 20 });
    assert.equal(world.project(moduleProjectors.changeSetIndex).byId["changeset.apply.proposal"].status, "applied");
  } finally {
    await removeTempPlatformApplyFixture(fixture.root);
  }
}));

test("rejecting an apply proposal leaves the change set intact and unapplied", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformApplyFixture();
  try {
    const world = createWorld();
    const sent = [];
    const handlers = createHandlers({
      world,
      backendHost: "backendHost",
      frontendHost: "frontendHost",
      readJson: async req => req.body,
      authoringServices: {
        requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" },
        executeBootstrapProposal: actor => async proposal => executePlatformProposalTarget({
          world,
          actor,
          proposal,
          body: proposal.body ?? {}
        })
      },
      sendGateFailure: () => {},
      send: () => {},
      sendJson: (res, status, body) => sent.push({ status, body })
    });

    await handlers["platform.changeSet.create"]({
      req: { body: { id: "changeset.reject.apply", branchId: "branch.reject.apply" } },
      res: {},
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: { runtimeProfile: "full" }
    });
    await handlers["platform.changeSet.edit"]({
      req: {
        body: {
          edits: [
            { path: fixture.first, content: JSON.stringify({ value: 100 }, null, 2) },
            { path: fixture.second, content: JSON.stringify({ value: 200 }, null, 2) }
          ]
        }
      },
      res: {},
      params: { id: "changeset.reject.apply" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.changeSet.validate"]({
      res: {},
      params: { id: "changeset.reject.apply" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.proposal.create"]({
      req: {
        body: {
          id: "proposal.platform.changeSet.reject-apply",
          action: "changeSet.apply",
          body: {
            changeSetId: "changeset.reject.apply"
          }
        }
      },
      res: {},
      requestActor: "aaron"
    });
    await handlers["platform.proposal.reject"]({
      req: { body: { reason: "Do not apply yet" } },
      res: {},
      params: { id: "proposal.platform.changeSet.reject-apply" },
      requestActor: "aaron"
    });

    assert.equal(sent.at(-1).status, 200);
    assert.equal(world.project(moduleProjectors.changeSetIndex).byId["changeset.reject.apply"].status, "valid");
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture.root, "first.json"), "utf8")), { value: 1 });
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture.root, "second.json"), "utf8")), { value: 2 });
  } finally {
    await removeTempPlatformApplyFixture(fixture.root);
  }
}));

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

test("platform branch handlers create, list, and read branch detail", async () => withRegisteredPluginProjectors(providers, async () => {
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

  await handlers["platform.branch.create"]({
    req: {
      body: {
        id: "branch.direct.platform",
        title: "Direct Branch",
        epic: "platform",
        feature: "branch-detail",
        defect: "none"
      }
    },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  assert.equal(sent.at(-1).status, 201);
  assert.equal(sent.at(-1).body.branch.id, "branch.direct.platform");
  assert.equal(sent.at(-1).body.branch.epic, "platform");
  assert.equal(sent.at(-1).body.branch.feature, "branch-detail");
  assert.equal(sent.at(-1).body.branch.defect, "none");

  await handlers["platform.changeSet.create"]({
    req: { body: { id: "changeset.branch.detail", branchId: "branch.direct.platform" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  await handlers["platform.branch.list"]({ res: {} });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.branches.some(row => row.id === "branch.direct.platform"), true);
  assert.equal(sent.at(-1).body.branches.find(row => row.id === "branch.direct.platform")?.lifecycleLane, "validate");

  await handlers["platform.branch.read"]({
    res: {},
    params: { id: "branch.direct.platform" }
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.branch.id, "branch.direct.platform");
  assert.equal(sent.at(-1).body.branch.lifecycleLane, "validate");
  assert.equal(sent.at(-1).body.changeSets.some(row => row.id === "changeset.branch.detail"), true);
  assert.deepEqual(sent.at(-1).body.validationHistory, []);
}));

test("platform branch creation validates parent branch dependencies and preserves metadata", async () => withRegisteredPluginProjectors(providers, async () => {
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

  await handlers["platform.branch.create"]({
    req: { body: { id: "branch.parent.root", title: "Root Branch" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  await handlers["platform.branch.create"]({
    req: {
      body: {
        id: "branch.child.feature",
        title: "Child Branch",
        parentBranchId: "branch.parent.root",
        epic: "platform",
        feature: "branch-metadata",
        defect: "none"
      }
    },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  assert.equal(sent.at(-1).status, 201);
  assert.equal(sent.at(-1).body.branch.parentBranchId, "branch.parent.root");
  assert.equal(sent.at(-1).body.branch.epic, "platform");
  assert.equal(sent.at(-1).body.branch.feature, "branch-metadata");
  assert.equal(sent.at(-1).body.branch.defect, "none");

  await handlers["platform.branch.create"]({
    req: { body: { id: "branch.orphan", parentBranchId: "branch.missing.parent" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  assert.equal(sent.at(-1).status, 404);
  assert.match(sent.at(-1).body.error, /parent branch not found/);
}));

test("platform branch detail includes multiple change sets and validation history", async () => withRegisteredPluginProjectors(providers, async () => {
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

  await handlers["platform.branch.create"]({
    req: { body: { id: "branch.validation.history", title: "Validation History" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  const rvm = await readFile(new URL("./platform-console.rvm", import.meta.url), "utf8");
  await handlers["platform.changeSet.create"]({
    req: { body: { id: "changeset.branch.a", branchId: "branch.validation.history" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  await handlers["platform.changeSet.edit"]({
    req: { body: { edits: [{ path: "plugins/platform/platform-console.rvm", content: `${rvm}\n` }] } },
    res: {},
    params: { id: "changeset.branch.a" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  await handlers["platform.changeSet.validate"]({
    res: {},
    params: { id: "changeset.branch.a" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  await handlers["platform.changeSet.create"]({
    req: { body: { id: "changeset.branch.b", branchId: "branch.validation.history" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  await handlers["platform.branch.read"]({
    res: {},
    params: { id: "branch.validation.history" }
  });

  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.changeSets.length, 2);
  assert.equal(sent.at(-1).body.candidateSnapshots.length, 1);
  assert.equal(sent.at(-1).body.validationHistory.length, 1);
  assert.equal(sent.at(-1).body.validationHistory[0].changeSetId, "changeset.branch.a");
}));

test("platform change-set handlers list, read, remove edits, and close change sets", async () => withRegisteredPluginProjectors(providers, async () => {
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

  await handlers["platform.changeSet.create"]({
    req: { body: { id: "changeset.inspect.lifecycle", branchId: "branch.inspect.lifecycle" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  const rvm = await readFile(new URL("./platform-console.rvm", import.meta.url), "utf8");
  await handlers["platform.changeSet.edit"]({
    req: { body: { edits: [{ path: "plugins/platform/platform-console.rvm", content: `${rvm}\n` }] } },
    res: {},
    params: { id: "changeset.inspect.lifecycle" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  const pathHash = sent.at(-1).body.edits[0].pathHash;

  await handlers["platform.changeSet.list"]({ res: {} });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.changeSets.some(row => row.id === "changeset.inspect.lifecycle"), true);

  await handlers["platform.changeSet.read"]({
    res: {},
    params: { id: "changeset.inspect.lifecycle" }
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.changeSet.id, "changeset.inspect.lifecycle");
  assert.equal(sent.at(-1).body.branch.id, "branch.inspect.lifecycle");
  assert.equal(sent.at(-1).body.edits.length, 1);

  await handlers["platform.changeSet.removeEdit"]({
    res: {},
    params: { id: "changeset.inspect.lifecycle", pathHash },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.edits.length, 0);
  assert.equal(world.project(moduleProjectors.changeSetIndex).byId["changeset.inspect.lifecycle"].status, "draft");

  await handlers["platform.changeSet.reject"]({
    req: { body: { reason: "Not pursuing this path" } },
    res: {},
    params: { id: "changeset.inspect.lifecycle" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.changeSet.status, "rejected");

  await handlers["platform.changeSet.edit"]({
    req: { body: { edits: [{ path: "plugins/platform/platform-console.rvm", content: rvm }] } },
    res: {},
    params: { id: "changeset.inspect.lifecycle" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  assert.equal(sent.at(-1).status, 409);

  await handlers["platform.changeSet.create"]({
    req: { body: { id: "changeset.inspect.abandon", branchId: "branch.inspect.abandon" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  await handlers["platform.changeSet.abandon"]({
    req: { body: { reason: "Superseded elsewhere" } },
    res: {},
    params: { id: "changeset.inspect.abandon" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.changeSet.status, "abandoned");
}));

test("platform change-set apply persists multi-file edits atomically", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformApplyFixture();
  try {
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

    await handlers["platform.changeSet.create"]({
      req: { body: { id: "changeset.apply.direct", branchId: "branch.apply.direct" } },
      res: {},
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: { runtimeProfile: "full" }
    });
    await handlers["platform.changeSet.edit"]({
      req: {
        body: {
          edits: [
            { path: fixture.first, content: JSON.stringify({ value: 11 }, null, 2) },
            { path: fixture.second, content: JSON.stringify({ value: 22 }, null, 2) }
          ]
        }
      },
      res: {},
      params: { id: "changeset.apply.direct" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.changeSet.validate"]({
      res: {},
      params: { id: "changeset.apply.direct" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.changeSet.apply"]({
      res: {},
      params: { id: "changeset.apply.direct" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });

    assert.equal(sent.at(-1).status, 200);
    assert.equal(sent.at(-1).body.changeSet.status, "applied");
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture.root, "first.json"), "utf8")), { value: 11 });
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture.root, "second.json"), "utf8")), { value: 22 });
  } finally {
    await removeTempPlatformApplyFixture(fixture.root);
  }
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
  assert.equal(world.project(moduleProjectors.changeSetIndex).byId["changeset.invalid.wcss"].status, "draft");
  await handlers["platform.changeSet.validate"]({
    res: {},
    params: { id: "changeset.invalid.wcss" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  assert.equal(sent.at(-1).body.candidateSnapshot.status, "invalid");
  assert.equal(sent.at(-1).body.activeCandidateSnapshotId, validSnapshotId);
}));

test("platform change-set edits reject path traversal and binary payloads", async () => withRegisteredPluginProjectors(providers, async () => {
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

  await handlers["platform.changeSet.create"]({
    req: { body: { id: "changeset.path.guard", branchId: "branch.path.guard" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  await handlers["platform.changeSet.edit"]({
    req: { body: { edits: [{ path: "../outside.txt", content: "nope" }] } },
    res: {},
    params: { id: "changeset.path.guard" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  assert.equal(sent.at(-1).status, 400);
  assert.match(sent.at(-1).body.error, /inside the workspace|allowed roots/);

  await handlers["platform.changeSet.edit"]({
    req: { body: { edits: [{ path: "plugins/platform/platform-console.rvm", content: "bad\u0000binary" }] } },
    res: {},
    params: { id: "changeset.path.guard" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  assert.equal(sent.at(-1).status, 400);
  assert.match(sent.at(-1).body.error, /binary edits are not supported/);
}));

test("an invalid file prevents the whole change set from being applied", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformApplyFixture();
  try {
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

    await handlers["platform.changeSet.create"]({
      req: { body: { id: "changeset.invalid.apply", branchId: "branch.invalid.apply" } },
      res: {},
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: { runtimeProfile: "full" }
    });
    await handlers["platform.changeSet.edit"]({
      req: {
        body: {
          edits: [
            { path: fixture.first, content: JSON.stringify({ value: 111 }, null, 2) },
            { path: fixture.second, content: "{ broken json" }
          ]
        }
      },
      res: {},
      params: { id: "changeset.invalid.apply" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.changeSet.validate"]({
      res: {},
      params: { id: "changeset.invalid.apply" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.changeSet.apply"]({
      res: {},
      params: { id: "changeset.invalid.apply" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });

    assert.equal(sent.at(-1).status, 409);
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture.root, "first.json"), "utf8")), { value: 1 });
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture.root, "second.json"), "utf8")), { value: 2 });
  } finally {
    await removeTempPlatformApplyFixture(fixture.root);
  }
}));

test("platform change-set validation detects base hash conflicts after staging", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformApplyFixture();
  try {
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

    await handlers["platform.changeSet.create"]({
      req: { body: { id: "changeset.conflict.validate", branchId: "branch.conflict.validate" } },
      res: {},
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: { runtimeProfile: "full" }
    });
    await handlers["platform.changeSet.edit"]({
      req: { body: { edits: [{ path: fixture.first, content: JSON.stringify({ value: 99 }, null, 2) }] } },
      res: {},
      params: { id: "changeset.conflict.validate" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await writeFile(path.join(fixture.root, "first.json"), JSON.stringify({ value: 1234 }, null, 2), "utf8");

    await handlers["platform.changeSet.validate"]({
      res: {},
      params: { id: "changeset.conflict.validate" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    assert.equal(sent.at(-1).status, 200);
    assert.equal(sent.at(-1).body.candidateSnapshot.status, "invalid");
    assert.match(sent.at(-1).body.candidateSnapshot.errors[0].message, /base file hash changed since the edit was staged/);

    await handlers["platform.changeSet.apply"]({
      res: {},
      params: { id: "changeset.conflict.validate" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    assert.equal(sent.at(-1).status, 409);
    assert.match(sent.at(-1).body.details[0].message, /base file hash changed since the edit was staged/);
  } finally {
    await removeTempPlatformApplyFixture(fixture.root);
  }
}));

test("platform change-set apply rolls back previously promoted files on mid-apply failure", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformApplyFixture();
  try {
    const world = createWorld();
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
      sendJson: () => {}
    });

    await handlers["platform.changeSet.create"]({
      req: { body: { id: "changeset.rollback.apply", branchId: "branch.rollback.apply" } },
      res: {},
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: { runtimeProfile: "full" }
    });
    await handlers["platform.changeSet.edit"]({
      req: {
        body: {
          edits: [
            { path: fixture.first, content: JSON.stringify({ value: 7 }, null, 2) },
            { path: fixture.second, content: JSON.stringify({ value: 8 }, null, 2) }
          ]
        }
      },
      res: {},
      params: { id: "changeset.rollback.apply" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.changeSet.validate"]({
      res: {},
      params: { id: "changeset.rollback.apply" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });

    const result = await applyPlatformChangeSet(world, {
      actor: "aaron",
      changeSetId: "changeset.rollback.apply",
      session: { id: "session.platform" },
      hooks: {
        afterPromote: async file => {
          if (file.index === 1) throw new Error("simulated apply failure");
        }
      }
    });

    assert.equal(result.ok, false);
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture.root, "first.json"), "utf8")), { value: 1 });
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture.root, "second.json"), "utf8")), { value: 2 });
  } finally {
    await removeTempPlatformApplyFixture(fixture.root);
  }
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
  assert.match(html, /Branch Board/);
  assert.match(html, /Platform Map/);
  assert.match(html, /Runtime Profiles/);
  assert.match(html, /Proposal Panel/);
  assert.match(html, /Review Proposals/);
  assert.match(html, /Change Sets/);
  assert.match(html, /Branches/);
  assert.match(html, /Branch Detail/);
  assert.match(html, /Candidate Snapshots/);
  assert.match(html, /Roadmap Tasks/);
  assert.match(html, /platform-proposal-form/);
  assert.match(html, /platform-review-form/);
  assert.match(html, /platform-branch-create-form/);
  assert.match(html, /platform-change-set-create-form/);
  assert.match(html, /platform-change-set-edit-form/);
  assert.match(html, /platform-change-set-validate-form/);
  assert.match(html, /platform-change-set-apply-form/);
  assert.match(html, /platform-change-set-lifecycle-form/);
  assert.match(html, /platform-branch-detail-select/);
  assert.match(html, /data-branch-lane="draft"/);
  assert.match(html, /data-branch-lane="validate"/);
  assert.match(html, /data-branch-lane="review"/);
  assert.match(html, /data-branch-lane="apply"/);
  assert.match(html, /data-branch-lane="push"/);
  assert.match(html, /data-branch-lane="ship"/);
  assert.match(html, />Lane</);
  assert.match(html, /Parent branch/);
  assert.match(html, /Epic/);
  assert.match(html, /Feature/);
  assert.match(html, /Defect/);
  assert.match(html, /\/api\/platform-branches/);
  assert.match(html, /\/api\/platform-proposals/);
  assert.match(html, /\/api\/platform-change-sets/);
  assert.match(html, /\/apply/);
  assert.match(html, /\/reject/);
  assert.match(html, /\/abandon/);
});
