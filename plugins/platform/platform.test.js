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
import { applyPlatformChangeSet, readPlatformBranch, validatePlatformChangeSet } from "./change-sets.js";
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

async function createTempPlatformRvmApplyFixture() {
  const root = path.join(process.cwd(), "test", `.platform-rvm-apply-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  const first = path.join(root, "first.rvm");
  const second = path.join(root, "second.rvm");
  const source = await readFile(new URL("./platform-console.rvm", import.meta.url), "utf8");
  await writeFile(first, source, "utf8");
  await writeFile(second, source, "utf8");
  return {
    root,
    source,
    first: path.relative(process.cwd(), first).replaceAll("\\", "/"),
    second: path.relative(process.cwd(), second).replaceAll("\\", "/")
  };
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

test("platform runtime declares every change-set route with owned handler metadata", () => {
  const expectedRoutes = [
    { method: "GET", path: "/api/platform-change-sets", handler: "platform.changeSet.list" },
    { method: "GET", handler: "platform.changeSet.read", pattern: /^\/api\/platform-change-sets\/([^/]+)$/, paramNames: ["id"] },
    { method: "POST", path: "/api/platform-change-sets", handler: "platform.changeSet.create" },
    { method: "POST", handler: "platform.changeSet.edit", pattern: /^\/api\/platform-change-sets\/([^/]+)\/edits$/, paramNames: ["id"] },
    { method: "DELETE", handler: "platform.changeSet.removeEdit", pattern: /^\/api\/platform-change-sets\/([^/]+)\/edits\/([^/]+)$/, paramNames: ["id", "pathHash"] },
    { method: "POST", handler: "platform.changeSet.validate", pattern: /^\/api\/platform-change-sets\/([^/]+)\/validate$/, paramNames: ["id"] },
    { method: "POST", handler: "platform.changeSet.apply", pattern: /^\/api\/platform-change-sets\/([^/]+)\/apply$/, paramNames: ["id"] },
    { method: "POST", handler: "platform.changeSet.reject", pattern: /^\/api\/platform-change-sets\/([^/]+)\/reject$/, paramNames: ["id"] },
    { method: "POST", handler: "platform.changeSet.abandon", pattern: /^\/api\/platform-change-sets\/([^/]+)\/abandon$/, paramNames: ["id"] }
  ];

  for (const expected of expectedRoutes) {
    const route = routes.find(entry => entry.handler === expected.handler);
    assert.ok(route, `missing route for ${expected.handler}`);
    assert.equal(route.method, expected.method);
    if (expected.path) assert.equal(route.path, expected.path);
    if (expected.pattern) {
      assert.equal(String(route.pattern), String(expected.pattern));
      assert.deepEqual(route.paramNames, expected.paramNames);
    }
    assert.deepEqual(handlerCatalog.handlerMetadata[expected.handler]?.methods, [expected.method]);
  }
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
  assert.equal(model.nodes.some(node => node.id === "doc:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" && node.kind === "doc"), true);
  assert.equal(model.nodes.some(node => node.kind === "docSection" && node.id.includes("docs/PLATFORM-ALL-THE-WAY-ROADMAP.md")), true);
  assert.equal(model.nodes.some(node => node.kind === "task" && node.id.includes("docs/PLATFORM-ALL-THE-WAY-ROADMAP.md")), true);
  assert.equal(model.edges.some(edge => edge.from === "surface:platform" && edge.rel === "authoredBy" && edge.to === "rvm:plugins/platform/platform-console.rvm"), true);
  assert.equal(model.edges.some(edge => edge.from === "doc:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" && edge.rel === "references" && edge.to === "plugin.platform"), true);
  assert.equal(model.nodes.some(node => node.kind === "gate" && node.id.includes("plugins/platform/platform.test.js")), true);
  assert.equal(model.edges.some(edge => edge.from === "plugin.platform" && edge.rel === "owns" && edge.to === "bundle-platform"), true);
  assert.equal(Array.isArray(model.gaps), true);
  assert.equal(model.summaries.byKind.plugin > 0, true);
  assert.equal(Array.isArray(model.docs), true);
  assert.equal(Array.isArray(model.docSections), true);
  assert.equal(Array.isArray(model.docTasks), true);
  assert.equal(Array.isArray(model.roadmapTasks), true);
  assert.equal(model.roadmapTasks.some(task => task.doc === "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"), true);
});

test("platform model promotes runtime snapshot diagnostics into revision and build nodes", async () => {
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: [],
      routes: [],
      surfaces: [],
      plugins: { activePluginIds: [], effectivePluginIds: [], rejectedPlugins: [] },
      appSnapshot: {
        appRevision: 7,
        lastGoodAppRevision: 7,
        buildErrors: [{ message: "Broken route projection", code: "BROKEN_ROUTE" }],
        pendingDirtySources: ["plugins/platform/platform-console.rvm"],
        activeSourceIds: ["plugins/platform/platform-console.rvm", "plugins/platform/platform-console.wcss"],
        sourceCount: 2,
        devMode: true,
        lastRevisionEvent: {
          appRevision: 7,
          changedSources: ["plugins/platform/platform-console.rvm"],
          trigger: "watch"
        }
      }
    },
    project: projector => {
      if (projector === moduleProjectors.candidateSnapshots) {
        return [
          {
            id: "candidateSnapshot:branch.demo:1",
            branchId: "branch.demo",
            changeSetId: "changeSet:demo",
            status: "valid",
            revision: 1,
            createdAt: "2026-06-18T00:00:00.000Z",
            files: [{ path: "plugins/platform/platform-console.rvm" }],
            errors: []
          },
          {
            id: "candidateSnapshot:branch.demo:2",
            branchId: "branch.demo",
            changeSetId: "changeSet:demo",
            status: "invalid",
            revision: 2,
            createdAt: "2026-06-18T00:01:00.000Z",
            files: [{ path: "plugins/platform/platform-console.wcss" }],
            errors: [{ kind: "parse", message: "Unexpected selector", path: "plugins/platform/platform-console.wcss" }]
          }
        ];
      }
      return [];
    }
  });

  assert.equal(model.nodes.some(node => node.kind === "runtimeRevision" && node.id === "runtimeRevision:backend:7"), true);
  assert.equal(model.nodes.some(node => node.kind === "backendRevision" && node.id === "backendRevision:7"), true);
  assert.equal(model.nodes.some(node => node.kind === "snapshotBuild" && node.id === "snapshotBuild:candidateSnapshot:branch.demo:1"), true);
  assert.equal(model.nodes.some(node => node.kind === "snapshotBuildError" && node.id === "snapshotBuildError:candidateSnapshot:branch.demo:2:1"), true);
  assert.equal(model.runtimeRevisions[0].revision, 7);
  assert.equal(model.activeRuntimeRevision.id, "runtimeRevision:backend:7");
  assert.equal(model.snapshotBuilds.length, 2);
  assert.equal(model.snapshotBuildErrors.length, 1);
  assert.equal(model.candidateSnapshotsByBranch["branch.demo"].length, 2);
  assert.equal(model.snapshotDiagnostics.lastGoodAppRevision, 7);
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
  const docs = filterPlatformModel(model, "docs", "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md");
  const gates = filterPlatformModel(model, "gates");
  const testGates = filterPlatformModel({
    ...model,
    testGates: [
      {
        id: "gate:test/runtime-profile.test.js",
        title: "test/runtime-profile.test.js",
        protectedObjects: ["profile:minimal", "plugin.platform"],
        protectedObjectLabels: ["Minimal runtime", "Platform plugin"],
        selectedByBranches: ["branch.demo"]
      },
      {
        id: "gate:plugins/platform/platform.test.js",
        title: "plugins/platform/platform.test.js",
        protectedObjects: ["plugin.platform"],
        protectedObjectLabels: ["Platform plugin"],
        selectedByBranches: []
      }
    ],
    affectedTestGatesByBranch: {
      "branch.demo": ["gate:test/runtime-profile.test.js"]
    }
  }, "testGates", "branch.demo");
  const branches = filterPlatformModel({
    ...model,
    branches: [{ id: "branch.demo", status: "open" }],
    changeSets: [{ id: "changeset.demo", status: "draft" }],
    candidateSnapshots: [{ id: "candidateSnapshot:demo:1", branchId: "branch.demo", changeSetId: "changeset.demo" }]
  }, "branches");
  const runtimeRevisions = filterPlatformModel({
    ...model,
    runtimeRevisions: [{ id: "runtimeRevision:backend:3", backendRevisionId: "backendRevision:3", revision: 3, status: "active", trigger: "watch", changedSources: [], branchId: "branch.demo", changeSetId: "changeset.demo", candidateBranchCount: 1, buildErrorCount: 1 }],
    activeRuntimeRevision: { id: "runtimeRevision:backend:3", revision: 3 },
    snapshotBuilds: [
      { id: "snapshotBuild:candidateSnapshot:demo:1", branchId: "branch.demo", changeSetId: "changeset.demo", candidateSnapshotId: "candidateSnapshot:demo:1", revision: 3 },
      { id: "snapshotBuild:candidateSnapshot:other:1", branchId: "branch.other", changeSetId: "changeset.other", candidateSnapshotId: "candidateSnapshot:other:1", revision: 9 }
    ],
    snapshotBuildErrors: [
      { id: "snapshotBuildError:candidateSnapshot:demo:1:1", snapshotBuildId: "snapshotBuild:candidateSnapshot:demo:1", branchId: "branch.demo", changeSetId: "changeset.demo", candidateSnapshotId: "candidateSnapshot:demo:1", revision: 3 },
      { id: "snapshotBuildError:candidateSnapshot:other:1:1", snapshotBuildId: "snapshotBuild:candidateSnapshot:other:1", branchId: "branch.other", changeSetId: "changeset.other", candidateSnapshotId: "candidateSnapshot:other:1", revision: 9 }
    ],
    candidateSnapshots: [
      { id: "candidateSnapshot:demo:1", branchId: "branch.demo", changeSetId: "changeset.demo", revision: 3 },
      { id: "candidateSnapshot:other:1", branchId: "branch.other", changeSetId: "changeset.other", revision: 9 }
    ],
    candidateSnapshotsByBranch: { "branch.demo": [{ id: "candidateSnapshot:demo:1", branchId: "branch.demo" }] },
    snapshotDiagnostics: { appRevision: 3, lastGoodAppRevision: 3, pendingDirtySources: [] }
  }, "runtimeRevisions");
  const runtimeRevisionDetail = filterPlatformModel({
    ...model,
    runtimeRevisions: [{ id: "runtimeRevision:backend:3", backendRevisionId: "backendRevision:3", revision: 3, status: "active", trigger: "watch", changedSources: [], branchId: "branch.demo", changeSetId: "changeset.demo", candidateBranchCount: 1, buildErrorCount: 1 }],
    activeRuntimeRevision: { id: "runtimeRevision:backend:3", revision: 3 },
    snapshotBuilds: [
      { id: "snapshotBuild:candidateSnapshot:demo:1", branchId: "branch.demo", changeSetId: "changeset.demo", candidateSnapshotId: "candidateSnapshot:demo:1", revision: 3 },
      { id: "snapshotBuild:candidateSnapshot:other:1", branchId: "branch.other", changeSetId: "changeset.other", candidateSnapshotId: "candidateSnapshot:other:1", revision: 9 }
    ],
    snapshotBuildErrors: [
      { id: "snapshotBuildError:candidateSnapshot:demo:1:1", snapshotBuildId: "snapshotBuild:candidateSnapshot:demo:1", branchId: "branch.demo", changeSetId: "changeset.demo", candidateSnapshotId: "candidateSnapshot:demo:1", revision: 3 },
      { id: "snapshotBuildError:candidateSnapshot:other:1:1", snapshotBuildId: "snapshotBuild:candidateSnapshot:other:1", branchId: "branch.other", changeSetId: "changeset.other", candidateSnapshotId: "candidateSnapshot:other:1", revision: 9 }
    ],
    candidateSnapshots: [
      { id: "candidateSnapshot:demo:1", branchId: "branch.demo", changeSetId: "changeset.demo", revision: 3 },
      { id: "candidateSnapshot:other:1", branchId: "branch.other", changeSetId: "changeset.other", revision: 9 }
    ],
    candidateSnapshotsByBranch: { "branch.demo": [{ id: "candidateSnapshot:demo:1", branchId: "branch.demo" }] },
    snapshotDiagnostics: { appRevision: 3, lastGoodAppRevision: 3, pendingDirtySources: [] }
  }, "runtimeRevisions", "runtimeRevision:backend:3");

  assert.equal(mcp.nodes.some(node => node.id === "mcp:mcp.platform"), true);
  assert.equal(mcp.nodes.some(node => node.id === "mcpTool:platform.read"), true);
  assert.equal(docs.docs.length, 1);
  assert.equal(docs.docs[0].path, "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md");
  assert.equal(docs.docSections.length > 0, true);
  assert.equal(docs.docTasks.length > 0, true);
  assert.equal(gates.gates.every(node => node.kind === "gate"), true);
  assert.equal(testGates.testGates.length, 1);
  assert.equal(testGates.testGates[0].id, "gate:test/runtime-profile.test.js");
  assert.deepEqual(testGates.affectedTestGatesByBranch["branch.demo"], ["gate:test/runtime-profile.test.js"]);
  assert.equal(branches.branches[0].id, "branch.demo");
  assert.equal(runtimeRevisions.runtimeRevisions[0].id, "runtimeRevision:backend:3");
  assert.equal(runtimeRevisions.activeRuntimeRevision.revision, 3);
  assert.equal(runtimeRevisionDetail.snapshotBuilds.length, 1);
  assert.equal(runtimeRevisionDetail.snapshotBuildErrors.length, 1);
  assert.equal(runtimeRevisionDetail.candidateSnapshots.length, 1);
  assert.equal(runtimeRevisionDetail.candidateSnapshots[0].id, "candidateSnapshot:demo:1");
});

test("platform model projects structured test gates and affected branch selection", async () => {
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: [],
      routes: [{ method: "GET", matcher: "/platform", handler: "page.platform" }],
      surfaces: [],
      plugins: { activePluginIds: ["plugin.platform"], effectivePluginIds: ["plugin.platform"], rejectedPlugins: [] }
    },
    project: projector => {
      if (projector === moduleProjectors.branches) {
        return [{ id: "branch.platform.gates", title: "Platform Gates", status: "open" }];
      }
      if (projector === moduleProjectors.changeSets) {
        return [{ id: "changeSet:platform-gates", branchId: "branch.platform.gates", status: "draft" }];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [{ id: "changeSetEdit:platform-gates:model", changeSetId: "changeSet:platform-gates", path: "plugins/platform/platform-model.js" }];
      }
      return [];
    }
  });

  const runtimeProfileGate = model.testGates.find(row => row.id === "gate:test/runtime-profile.test.js");
  const platformGate = model.testGates.find(row => row.id === "gate:plugins/platform/platform.test.js");
  const branchView = filterPlatformModel(model, "testGates", "branch.platform.gates");

  assert.ok(runtimeProfileGate);
  assert.equal(runtimeProfileGate.runner, "node-test");
  assert.equal(runtimeProfileGate.environment, "local-node");
  assert.equal(runtimeProfileGate.timeoutMs, 180000);
  assert.equal(runtimeProfileGate.protectedObjects.includes("profile:minimal"), true);
  assert.equal(runtimeProfileGate.protectedObjects.includes("plugin.platform"), true);
  assert.deepEqual(runtimeProfileGate.sourceDependencies, ["test/runtime-profile.test.js"]);
  assert.equal(runtimeProfileGate.costEstimate, "high");
  assert.equal(runtimeProfileGate.selectedByBranches.includes("branch.platform.gates"), true);
  assert.ok(platformGate);
  assert.equal(platformGate.selectedByBranches.includes("branch.platform.gates"), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.gates"].includes("gate:test/runtime-profile.test.js"), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.gates"].includes("gate:plugins/platform/platform.test.js"), true);
  assert.equal(branchView.testGates.some(row => row.id === "gate:test/runtime-profile.test.js"), true);
  assert.deepEqual(branchView.affectedTestGatesByBranch["branch.platform.gates"], model.affectedTestGatesByBranch["branch.platform.gates"]);
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

test("platform model carries branch docs freshness and impact summaries", async () => {
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
      if (projector === moduleProjectors.branches) {
        return [{ id: "branch.summary", title: "Summary Branch", status: "open", changeSetIds: ["changeset.summary"] }];
      }
      if (projector === moduleProjectors.changeSets) {
        return [{ id: "changeset.summary", branchId: "branch.summary", status: "draft" }];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [
          { id: "changeSetEdit:changeset.summary:platform", changeSetId: "changeset.summary", path: "plugins/platform/platform-console.rvm" },
          { id: "changeSetEdit:changeset.summary:docs", changeSetId: "changeset.summary", path: "docs/CAPABILITIES.md" }
        ];
      }
      return [];
    }
  });

  const branch = filterPlatformModel(model, "branches").branches.find(row => row.id === "branch.summary");
  assert.equal(branch?.docsFreshness?.status, "fresh");
  assert.equal(branch?.affectedSystemSummaries?.some(row => row.system === "plugin.platform"), true);
  assert.equal(branch?.telemetryImpactSummaries?.some(row => row.id === "platform.self"), true);
});

test("platform docs view surfaces stale and fresh governed docs from branch changes", async () => {
  const staleModel = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: [],
      routes: [{ method: "GET", matcher: "/platform", handler: "page.platform" }],
      surfaces: [],
      plugins: { activePluginIds: [], effectivePluginIds: [], rejectedPlugins: [] }
    },
    project: projector => {
      if (projector === moduleProjectors.branches) {
        return [{ id: "branch.docs.stale", title: "Stale Docs", status: "open", changeSetIds: ["changeset.docs.stale"] }];
      }
      if (projector === moduleProjectors.changeSets) {
        return [{ id: "changeset.docs.stale", branchId: "branch.docs.stale", status: "draft" }];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [{ id: "changeSetEdit:changeset.docs.stale:platform", changeSetId: "changeset.docs.stale", path: "plugins/platform/platform-console.rvm" }];
      }
      return [];
    }
  });
  const staleDocs = filterPlatformModel(staleModel, "docs", "docs/CAPABILITIES.md");

  assert.equal(staleDocs.docs[0].freshness.status, "stale");
  assert.equal(staleDocs.docs[0].freshness.staleBranches.includes("branch.docs.stale"), true);
  assert.equal(staleModel.gaps.some(gap => gap.kind === "stale-doc" && gap.target === "doc:docs/CAPABILITIES.md"), true);

  const freshModel = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: [],
      routes: [{ method: "GET", matcher: "/platform", handler: "page.platform" }],
      surfaces: [],
      plugins: { activePluginIds: [], effectivePluginIds: [], rejectedPlugins: [] }
    },
    project: projector => {
      if (projector === moduleProjectors.branches) {
        return [{ id: "branch.docs.fresh.model", title: "Fresh Docs", status: "open", changeSetIds: ["changeset.docs.fresh.model"] }];
      }
      if (projector === moduleProjectors.changeSets) {
        return [{ id: "changeset.docs.fresh.model", branchId: "branch.docs.fresh.model", status: "draft" }];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [
          { id: "changeSetEdit:changeset.docs.fresh.model:platform", changeSetId: "changeset.docs.fresh.model", path: "plugins/platform/platform-console.rvm" },
          { id: "changeSetEdit:changeset.docs.fresh.model:docs", changeSetId: "changeset.docs.fresh.model", path: "docs/CAPABILITIES.md" }
        ];
      }
      return [];
    }
  });
  const freshDocs = filterPlatformModel(freshModel, "docs", "docs/CAPABILITIES.md");

  assert.equal(freshDocs.docs[0].freshness.status, "fresh");
  assert.equal(freshDocs.docs[0].freshness.touchedBranches.includes("branch.docs.fresh.model"), true);
  assert.equal(freshModel.gaps.some(gap => gap.kind === "stale-doc" && gap.target === "doc:docs/CAPABILITIES.md"), false);
});

test("platform model includes projected conflict nodes from validation errors", async () => {
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
      if (projector === moduleProjectors.conflicts) {
        return [{
          id: "conflict:changeSet:demo:abc123",
          changeSetId: "changeSet:demo",
          branchId: "branch:demo",
          candidateSnapshotId: "candidateSnapshot:changeSet:demo:1",
          path: "plugins/platform/platform-console.rvm",
          pathHash: "abc123",
          status: "open"
        }];
      }
      return [];
    }
  });

  assert.equal(model.nodes.some(node => node.id === "conflict:changeSet:demo:abc123" && node.kind === "conflict"), true);
  assert.equal(model.edges.some(edge => edge.from === "changeSet:changeSet:demo" && edge.rel === "conflictsWith" && edge.to === "conflict:changeSet:demo:abc123"), true);
  assert.equal(filterPlatformModel(model, "conflicts").conflicts[0].id, "conflict:changeSet:demo:abc123");
});

test("platform model includes projected merge intent nodes from proposal state", async () => {
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
        return [{
          id: "proposal.branch.merge.demo",
          status: "open",
          targetProcess: "branch.merge",
          targetKind: "branch",
          targetId: "branch.demo",
          reason: "Merge demo branch"
        }];
      }
      if (projector === moduleProjectors.mergeIntents) {
        return [{
          id: "mergeIntent:proposal.branch.merge.demo",
          proposalId: "proposal.branch.merge.demo",
          branchId: "branch.demo",
          mode: "merge",
          intoBranchId: "branch.root",
          status: "open"
        }];
      }
      return [];
    }
  });

  assert.equal(model.nodes.some(node => node.id === "mergeIntent:proposal.branch.merge.demo" && node.kind === "mergeIntent"), true);
  assert.equal(model.edges.some(edge => edge.from === "branch:branch.demo" && edge.rel === "requests" && edge.to === "mergeIntent:proposal.branch.merge.demo"), true);
  assert.equal(model.edges.some(edge => edge.from === "proposal:proposal.branch.merge.demo" && edge.rel === "expresses" && edge.to === "mergeIntent:proposal.branch.merge.demo"), true);
  assert.equal(filterPlatformModel(model, "mergeIntents").mergeIntents[0].id, "mergeIntent:proposal.branch.merge.demo");
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
  const merge = buildPlatformProposalCreateBody({
    id: "proposal.platform.merge",
    action: "branch.merge",
    body: {
      branchId: "branch.platform.console",
      intoBranchId: "branch.platform.root",
      reason: "Merge validated branch"
    },
    reason: "Merge the validated branch"
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
  assert.equal(merge.ok, true);
  assert.equal(merge.value.targetProcess, "branch.merge");
  assert.equal(merge.value.targetKind, "branch");
  assert.equal(merge.value.targetId, "branch.platform.console");
  assert.deepEqual(JSON.parse(merge.value.bodyJson), {
    branchId: "branch.platform.console",
    intoBranchId: "branch.platform.root",
    reason: "Merge validated branch"
  });
  assert.equal(platformProposalTemplates().some(template => template.action === "changeSet.apply"), true);
  assert.equal(platformProposalTemplates().some(template => template.action === "branch.merge"), true);
  assert.equal(platformProposalTemplates().some(template => template.action === "branch.rebase"), true);
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

  await handlers["platform.proposal.create"]({
    req: {
      body: {
        id: "proposal.platform.merge.intent",
        action: "branch.merge",
        body: {
          branchId: "branch.platform.console",
          intoBranchId: "branch.platform.root"
        },
        reason: "Merge platform branch"
      }
    },
    res: {},
    requestActor: "aaron"
  });
  assert.equal(sent.at(-1).status, 201);
  assert.equal(sent.at(-1).body.proposal.targetProcess, "branch.merge");
  assert.equal(sent.at(-1).body.proposal.targetKind, "branch");
  assert.equal(sent.at(-1).body.proposal.targetId, "branch.platform.console");

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
  assert.equal(world.project(moduleProjectors.branchIndex).byId["branch:platform-console-proposed"].id, "branch:platform-console-proposed");

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

test("platform proposal handlers approve branch merge and rebase intents through the shared executor", async () => withRegisteredPluginProjectors(providers, async () => {
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
    req: { body: { id: "branch.intent.source", title: "Intent Source" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  await handlers["platform.branch.create"]({
    req: { body: { id: "branch.intent.target", title: "Intent Target" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  await handlers["platform.proposal.create"]({
    req: {
      body: {
        id: "proposal.platform.branch.merge",
        action: "branch.merge",
        reason: "Review merge intent",
        body: {
          branchId: "branch.intent.source",
          intoBranchId: "branch.intent.target"
        }
      }
    },
    res: {},
    requestActor: "aaron"
  });
  await handlers["platform.proposal.approve"]({
    res: {},
    params: { id: "proposal.platform.branch.merge" },
    requestActor: "aaron"
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.proposal.status, "approved");
  assert.equal(world.allWitnesses().some(witness => witness.process === "platform.branch.merge.reviewed" && witness.body?.branchId === "branch.intent.source"), true);

  await handlers["platform.proposal.create"]({
    req: {
      body: {
        id: "proposal.platform.branch.rebase",
        action: "branch.rebase",
        reason: "Review rebase intent",
        body: {
          branchId: "branch.intent.source",
          ontoBranchId: "branch.intent.target"
        }
      }
    },
    res: {},
    requestActor: "aaron"
  });
  await handlers["platform.proposal.approve"]({
    res: {},
    params: { id: "proposal.platform.branch.rebase" },
    requestActor: "aaron"
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.proposal.status, "approved");
  assert.equal(world.allWitnesses().some(witness => witness.process === "platform.branch.rebase.reviewed" && witness.body?.branchId === "branch.intent.source"), true);
}));

test("platform proposal approval auto-creates a canonical branch when change-set proposals omit branchId", async () => withRegisteredPluginProjectors(providers, async () => {
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
        id: "proposal.platform.changeSet.autobranch",
        action: "changeSet.create",
        reason: "Stage work without pre-creating a branch",
        body: {
          id: "changeset.platform.auto.branch",
          title: "Auto branch proposal"
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
    params: { id: "proposal.platform.changeSet.autobranch" },
    requestActor: "aaron"
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(world.project(moduleProjectors.changeSetIndex).byId["changeset.platform.auto.branch"].branchId, "branch:platform-auto-branch");
  assert.equal(world.project(moduleProjectors.branchIndex).byId["branch:platform-auto-branch"].id, "branch:platform-auto-branch");
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

test("platform merge intent projector derives rows from merge proposals", async () => withRegisteredPluginProjectors(providers, async () => {
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
        id: "proposal.platform.merge.projector",
        action: "branch.merge",
        body: {
          branchId: "branch.platform.console",
          intoBranchId: "branch.platform.root"
        },
        reason: "Merge validated branch"
      }
    },
    res: {},
    requestActor: "aaron"
  });

  assert.equal(sent.at(-1).status, 201);
  const mergeIntents = world.project(moduleProjectors.mergeIntents);
  assert.equal(mergeIntents.length, 1);
  assert.equal(mergeIntents[0].id, "mergeIntent:proposal.platform.merge.projector");
  assert.equal(mergeIntents[0].branchId, "branch.platform.console");
  assert.equal(mergeIntents[0].mode, "merge");
  assert.equal(mergeIntents[0].intoBranchId, "branch.platform.root");
  assert.equal(mergeIntents[0].status, "open");
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

test("platform change-set validation exposes a transient validating status before final result", async () => withRegisteredPluginProjectors(providers, async () => {
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
    req: { body: { id: "changeset.validating", branchId: "branch.validating" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  const rvm = await readFile(new URL("./platform-console.rvm", import.meta.url), "utf8");
  await handlers["platform.changeSet.edit"]({
    req: { body: { edits: [{ path: "plugins/platform/platform-console.rvm", content: `${rvm}\n` }] } },
    res: {},
    params: { id: "changeset.validating" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });

  const result = await validatePlatformChangeSet(world, {
    actor: "aaron",
    changeSetId: "changeset.validating",
    session: { id: "session.platform" },
    hooks: {
      beforeInspect() {
        assert.equal(world.project(moduleProjectors.changeSetIndex).byId["changeset.validating"].status, "validating");
        const branch = readPlatformBranch(world, "branch.validating");
        assert.equal(branch.ok, true);
        assert.equal(branch.branch.lifecycleLane, "validate");
      }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.startWitness?.body?.status, "validating");
  assert.equal(world.project(moduleProjectors.changeSetIndex).byId["changeset.validating"].status, "valid");
  assert.equal(result.candidateSnapshot.status, "valid");
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

test("platform branch and change-set creation use canonical generated ids when omitted", async () => withRegisteredPluginProjectors(providers, async () => {
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
    req: { body: { title: "Generated Branch" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  assert.equal(sent.at(-1).status, 201);
  assert.match(sent.at(-1).body.branch.id, /^branch:/);

  await handlers["platform.changeSet.create"]({
    req: { body: { title: "Generated Change Set" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  assert.equal(sent.at(-1).status, 201);
  assert.match(sent.at(-1).body.changeSet.id, /^changeSet:/);
  assert.match(sent.at(-1).body.branch.id, /^branch:/);
  assert.equal(sent.at(-1).body.changeSet.branchId, sent.at(-1).body.branch.id);
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
  assert.equal(sent.at(-1).body.branch.docsFreshness.status, "stale");
  assert.equal(sent.at(-1).body.branch.docsFreshness.missingDocs.includes("docs/CAPABILITIES.md"), true);
  assert.equal(sent.at(-1).body.branch.affectedSystemSummaries.some(row => row.system === "plugin.platform"), true);
  assert.equal(sent.at(-1).body.branch.telemetryImpactSummaries.some(row => row.id === "platform.self"), true);
  assert.equal(sent.at(-1).body.changeSets.length, 2);
  assert.equal(sent.at(-1).body.edits.length, 1);
  assert.equal(sent.at(-1).body.candidateSnapshots.length, 1);
  assert.equal(sent.at(-1).body.validationHistory.length, 1);
  assert.equal(sent.at(-1).body.validationHistory[0].changeSetId, "changeset.branch.a");
}));

test("platform branch docs freshness becomes fresh when governed docs are staged with code edits", async () => withRegisteredPluginProjectors(providers, async () => {
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
    req: { body: { id: "branch.docs.fresh", title: "Fresh Docs" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  await handlers["platform.changeSet.create"]({
    req: { body: { id: "changeset.docs.fresh", branchId: "branch.docs.fresh" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  const rvm = await readFile(new URL("./platform-console.rvm", import.meta.url), "utf8");
  const capabilities = await readFile(new URL("../../docs/CAPABILITIES.md", import.meta.url), "utf8");
  await handlers["platform.changeSet.edit"]({
    req: {
      body: {
        edits: [
          { path: "plugins/platform/platform-console.rvm", content: `${rvm}\n` },
          { path: "docs/CAPABILITIES.md", content: `${capabilities}\n` }
        ]
      }
    },
    res: {},
    params: { id: "changeset.docs.fresh" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });

  await handlers["platform.branch.read"]({
    res: {},
    params: { id: "branch.docs.fresh" }
  });

  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.branch.docsFreshness.status, "fresh");
  assert.equal(sent.at(-1).body.branch.docsFreshness.touchedDocs.includes("docs/CAPABILITIES.md"), true);
  assert.equal(sent.at(-1).body.branch.affectedSystemSummaries.some(row => row.system === "docs"), true);
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
  assert.equal(world.project(moduleProjectors.branchIndex).byId["branch.inspect.lifecycle"].status, "closed");

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
  assert.equal(world.project(moduleProjectors.branchIndex).byId["branch.inspect.abandon"].status, "closed");

  await handlers["platform.branch.read"]({
    res: {},
    params: { id: "branch.inspect.abandon" }
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.branch.status, "closed");
  assert.equal(sent.at(-1).body.branch.lifecycleLane, "ship");
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

test("platform change-set apply persists two-file RVM edits atomically", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformRvmApplyFixture();
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
      req: { body: { id: "changeset.apply.rvm", branchId: "branch.apply.rvm" } },
      res: {},
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: { runtimeProfile: "full" }
    });
    await handlers["platform.changeSet.edit"]({
      req: {
        body: {
          edits: [
            { path: fixture.first, content: `${fixture.source}\n` },
            { path: fixture.second, content: `${fixture.source}\n\n` }
          ]
        }
      },
      res: {},
      params: { id: "changeset.apply.rvm" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.changeSet.validate"]({
      res: {},
      params: { id: "changeset.apply.rvm" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.changeSet.apply"]({
      res: {},
      params: { id: "changeset.apply.rvm" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });

    assert.equal(sent.at(-1).status, 200);
    assert.equal(world.project(moduleProjectors.changeSetIndex).byId["changeset.apply.rvm"].status, "applied");
    assert.equal(await readFile(path.join(process.cwd(), fixture.first), "utf8"), `${fixture.source}\n`);
    assert.equal(await readFile(path.join(process.cwd(), fixture.second), "utf8"), `${fixture.source}\n\n`);
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
    assert.equal(sent.at(-1).body.candidateSnapshot.errors[0].kind, "conflict");
    assert.match(sent.at(-1).body.candidateSnapshot.errors[0].id, /^conflict:/);
    assert.match(sent.at(-1).body.candidateSnapshot.errors[0].message, /base file hash changed since the edit was staged/);
    const projectedConflicts = world.project(moduleProjectors.conflicts);
    assert.equal(projectedConflicts.length, 1);
    assert.equal(projectedConflicts[0].changeSetId, "changeset.conflict.validate");
    assert.equal(projectedConflicts[0].path, fixture.first);

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
  assert.match(html, /Docs freshness/);
  assert.match(html, /Affected systems/);
  assert.match(html, /Telemetry impacts/);
  assert.match(html, /Selected test gates/);
  assert.match(html, /Test Gates/);
  assert.match(html, /Affected Test Gates By Branch/);
  assert.match(html, /Protected Objects/);
  assert.match(html, /Selected Branches/);
  assert.match(html, /Candidate Snapshots/);
  assert.match(html, /Runtime Revisions/);
  assert.match(html, /Revision detail/);
  assert.match(html, /platform-runtime-revision-select/);
  assert.match(html, /Revision Snapshot Builds/);
  assert.match(html, /Revision Build Errors/);
  assert.match(html, /\/api\/platform-model\?view=runtimeRevisions/);
  assert.match(html, /Backend Revision Stream/);
  assert.match(html, /Snapshot Builds/);
  assert.match(html, /Last Good/);
  assert.match(html, /Failed Snapshot Builds/);
  assert.match(html, /Governed Docs/);
  assert.match(html, /Doc Structure/);
  assert.match(html, /Doc Tasks/);
  assert.match(html, /Roadmap Tasks/);
  assert.match(html, /platform-proposal-form/);
  assert.match(html, /platform-review-form/);
  assert.match(html, /platform-branch-create-form/);
  assert.match(html, /platform-change-set-create-form/);
  assert.match(html, /branch:/);
  assert.match(html, /changeSet:/);
  assert.match(html, /platform-change-set-edit-form/);
  assert.match(html, /platform-change-set-validate-form/);
  assert.match(html, /platform-change-set-apply-form/);
  assert.match(html, /platform-change-set-lifecycle-form/);
  assert.match(html, /platform-branch-detail-select/);
  assert.match(html, /platform-branch-test-gates-summary/);
  assert.match(html, /data-branch-lane="draft"/);
  assert.match(html, /data-branch-lane="validate"/);
  assert.match(html, /data-branch-lane="review"/);
  assert.match(html, /data-branch-lane="apply"/);
  assert.match(html, /data-branch-lane="push"/);
  assert.match(html, /data-branch-lane="ship"/);
  assert.match(html, />Lane</);
  assert.match(html, />Docs</);
  assert.match(html, />Affected Systems</);
  assert.match(html, />Telemetry</);
  assert.match(html, /Parent branch/);
  assert.match(html, /Epic/);
  assert.match(html, /Feature/);
  assert.match(html, /Defect/);
  assert.match(html, /\/api\/platform-branches/);
  assert.match(html, /\/api\/platform-proposals/);
  assert.match(html, /\/api\/platform-change-sets/);
  assert.match(html, /\/api\/runtime\/backend-revisions\/events/);
  assert.match(html, /\/apply/);
  assert.match(html, /\/reject/);
  assert.match(html, /\/abandon/);
});
