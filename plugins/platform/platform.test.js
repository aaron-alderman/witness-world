import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
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
import { runPlatformTestGate } from "./test-runs.js";

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
    { method: "POST", handler: "platform.changeSet.abandon", pattern: /^\/api\/platform-change-sets\/([^/]+)\/abandon$/, paramNames: ["id"] },
    { method: "POST", path: "/api/platform-test-runs", handler: "platform.testRun.create" },
    { method: "GET", path: "/api/platform-test-runs/events", handler: "platform.testRun.events" },
    { method: "GET", handler: "platform.testRun.read", pattern: /^\/api\/platform-test-runs\/([^/]+)$/, paramNames: ["id"] }
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
  assert.equal(model.nodes.some(node => node.id === "boundary:testRunner.platform" && node.kind === "boundary"), true);
  assert.equal(model.nodes.some(node => node.id === "testEnvironment:local-node" && node.kind === "testEnvironment"), true);
  assert.equal(model.nodes.some(node => node.id === "testEnvironment:local-browser" && node.kind === "testEnvironment"), true);
  assert.equal(model.edges.some(edge => edge.from === "surface:platform" && edge.rel === "authoredBy" && edge.to === "rvm:plugins/platform/platform-console.rvm"), true);
  assert.equal(model.edges.some(edge => edge.from === "doc:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" && edge.rel === "references" && edge.to === "plugin.platform"), true);
  assert.equal(model.nodes.some(node => node.kind === "testGate" && node.id.includes("plugins/platform/platform.test.js")), true);
  assert.equal(model.edges.some(edge => edge.from === "gate:plugins/platform/platform.test.js" && edge.rel === "usesBoundary" && edge.to === "boundary:testRunner.platform"), true);
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
  assert.equal(model.nodes.some(node => node.kind === "frontendRevision" && node.id === "frontendRevision:7"), true);
  assert.equal(model.nodes.some(node => node.kind === "snapshotBuild" && node.id === "snapshotBuild:candidateSnapshot:branch.demo:1"), true);
  assert.equal(model.nodes.some(node => node.kind === "snapshotBuildError" && node.id === "snapshotBuildError:candidateSnapshot:branch.demo:2:1"), true);
  assert.equal(model.runtimeRevisions[0].revision, 7);
  assert.equal(model.activeRuntimeRevision.id, "runtimeRevision:backend:7");
  assert.equal(model.runtimeRevisions[0].frontendRevisionId, "frontendRevision:7");
  assert.equal(model.runtimeRevisions[0].frontendEventsPath, "/api/runtime/app-revisions/events");
  assert.equal(model.edges.some(edge => edge.from === "runtimeRevision:backend:7" && edge.rel === "materializes" && edge.to === "frontendRevision:7"), true);
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

test("platform delegated test-gate projectors discover gate catalog rows", async () => withRegisteredPluginProjectors(providers, async () => {
  const testGates = moduleProjectors.testGates([]);
  const testGateIndex = moduleProjectors.testGateIndex([]);
  const coverageEdges = moduleProjectors.coverageEdges([]);

  assert.equal(testGates.some(row => row.id === "gate:plugins/platform/platform.test.js"), true);
  assert.equal(testGates.some(row => row.id === "gate:script:test-plugin-mcp"), true);
  assert.equal(testGateIndex.byId["gate:plugins/platform/platform.test.js"].id, "gate:plugins/platform/platform.test.js");
  assert.equal(Array.isArray(testGateIndex.byProtectedObject["plugin.platform"]), true);
  assert.equal(coverageEdges.some(row => row.gateId === "gate:plugins/platform/platform.test.js" && row.coverageKind === "sourceDependency"), true);
}));

test("platform test gates derive flake scores from non-cached result transitions", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const gate = {
    id: "gate:plugins/platform/platform.test.js",
    title: "plugins/platform/platform.test.js",
    command: "node --test plugins/platform/platform.test.js",
    runner: "node-test",
    environment: "local-node",
    timeoutMs: 180000,
    sourceDependencies: ["plugins/platform/platform.test.js"],
    protectedObjects: ["plugin.platform"]
  };
  let executions = 0;

  async function runWith(version, status) {
    return await runPlatformTestGate(world, {
      actor: "aaron",
      gate,
      id: `testRun.flake.${version}`,
      runtimeProfile: "full",
      resolveRunnerVersion: async () => version,
      runCommand: async () => {
        executions += 1;
        return {
          startedAt: `2026-06-18T00:00:0${executions}.000Z`,
          finishedAt: `2026-06-18T00:00:0${executions}.100Z`,
          durationMs: 100,
          exitCode: status === "passed" ? 0 : 1,
          signal: null,
          status,
          stdout: `${status} ${executions}`,
          stderr: "",
          timedOut: false,
          error: null
        };
      }
    });
  }

  await runWith("node-test:flake-v1", "passed");
  await runWith("node-test:flake-v2", "failed");
  await runWith("node-test:flake-v3", "passed");
  const cached = await runPlatformTestGate(world, {
    actor: "aaron",
    gate,
    id: "testRun.flake.cached",
    runtimeProfile: "full",
    resolveRunnerVersion: async () => "node-test:flake-v3",
    runCommand: async () => {
      throw new Error("cache hit should not execute runner");
    }
  });

  assert.equal(cached.testRun.cacheStatus, "hit");
  assert.equal(executions, 3);
  const projectedGate = world.project(moduleProjectors.testGates).find(row => row.id === gate.id);
  assert.ok(projectedGate);
  assert.equal(projectedGate.flakeScore, 1);

  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: ["platform.self"],
      routes: [{ method: "GET", matcher: "/platform", handler: "page.platform" }],
      surfaces: [],
      plugins: { activePluginIds: ["plugin.platform"], effectivePluginIds: ["plugin.platform"], rejectedPlugins: [] }
    },
    project: projector => world.project(projector)
  });
  assert.equal(model.testGates.find(row => row.id === gate.id)?.flakeScore, 1);
}));

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
  const roadmap = filterPlatformModel(model, "roadmap", "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md");
  const gates = filterPlatformModel(model, "gates");
  const testGates = filterPlatformModel({
    ...model,
    testGates: [
      {
        id: "gate:test/runtime-profile.test.js",
        title: "test/runtime-profile.test.js",
        protectedObjects: ["profile:minimal", "plugin.platform"],
        protectedObjectLabels: ["Minimal runtime", "Platform plugin"],
        selectedByBranches: ["branch.demo"],
        selectedByChangeSets: ["changeset.demo"]
      },
      {
        id: "gate:plugins/platform/platform.test.js",
        title: "plugins/platform/platform.test.js",
        protectedObjects: ["plugin.platform"],
        protectedObjectLabels: ["Platform plugin"],
        selectedByBranches: [],
        selectedByChangeSets: []
      }
    ],
    testGateIndex: {
      byId: {
        "gate:test/runtime-profile.test.js": {
          id: "gate:test/runtime-profile.test.js",
          title: "test/runtime-profile.test.js"
        },
        "gate:plugins/platform/platform.test.js": {
          id: "gate:plugins/platform/platform.test.js",
          title: "plugins/platform/platform.test.js"
        }
      },
      byProtectedObject: {
        "profile:minimal": ["gate:test/runtime-profile.test.js"],
        "plugin.platform": ["gate:plugins/platform/platform.test.js", "gate:test/runtime-profile.test.js"]
      },
      byBranch: {
        "branch.demo": ["gate:test/runtime-profile.test.js"]
      },
      byChangeSet: {
        "changeset.demo": ["gate:test/runtime-profile.test.js"]
      }
    },
    coverageEdges: [
      {
        id: "coverageEdge:gate:test/runtime-profile.test.js:protectedObject:profile:minimal",
        gateId: "gate:test/runtime-profile.test.js",
        gateTitle: "test/runtime-profile.test.js",
        coverageKind: "protectedObject",
        targetId: "profile:minimal",
        targetLabel: "Minimal runtime",
        sourceDependency: null,
        sourcePath: "test/runtime-profile.test.js"
      }
    ],
    affectedTestGates: [
      {
        id: "affectedTestGate:branch.demo:gate:test/runtime-profile.test.js",
        branchId: "branch.demo",
        gateId: "gate:test/runtime-profile.test.js",
        gateTitle: "test/runtime-profile.test.js",
        protectedObjects: ["profile:minimal", "plugin.platform"],
        protectedObjectLabels: ["Minimal runtime", "Platform plugin"],
        matchedTargets: ["profile:minimal"],
        matchedTargetLabels: ["Minimal runtime"],
        sourceDependencies: ["test/runtime-profile.test.js"],
        selectionReasons: []
      },
      {
        id: "affectedTestGate:changeSet:changeset.demo:gate:test/runtime-profile.test.js",
        changeSetId: "changeset.demo",
        gateId: "gate:test/runtime-profile.test.js",
        gateTitle: "test/runtime-profile.test.js",
        protectedObjects: ["profile:minimal", "plugin.platform"],
        protectedObjectLabels: ["Minimal runtime", "Platform plugin"],
        matchedTargets: ["profile:minimal"],
        matchedTargetLabels: ["Minimal runtime"],
        sourceDependencies: ["test/runtime-profile.test.js"],
        selectionReasons: []
      }
    ],
    affectedTestGatesByBranch: {
      "branch.demo": ["gate:test/runtime-profile.test.js"]
    },
    affectedTestGatesByChangeSet: {
      "changeset.demo": ["gate:test/runtime-profile.test.js"]
    }
  }, "testGates", "branch.demo");
  const testGatesByChangeSet = filterPlatformModel({
    ...model,
    testGates: [
      {
        id: "gate:test/runtime-profile.test.js",
        title: "test/runtime-profile.test.js",
        protectedObjects: ["profile:minimal", "plugin.platform"],
        protectedObjectLabels: ["Minimal runtime", "Platform plugin"],
        selectedByBranches: ["branch.demo"],
        selectedByChangeSets: ["changeset.demo"]
      }
    ],
    testGateIndex: {
      byId: {
        "gate:test/runtime-profile.test.js": {
          id: "gate:test/runtime-profile.test.js",
          title: "test/runtime-profile.test.js"
        }
      },
      byProtectedObject: {
        "profile:minimal": ["gate:test/runtime-profile.test.js"]
      },
      byBranch: {
        "branch.demo": ["gate:test/runtime-profile.test.js"]
      },
      byChangeSet: {
        "changeset.demo": ["gate:test/runtime-profile.test.js"]
      }
    },
    coverageEdges: [
      {
        id: "coverageEdge:gate:test/runtime-profile.test.js:protectedObject:profile:minimal",
        gateId: "gate:test/runtime-profile.test.js",
        gateTitle: "test/runtime-profile.test.js",
        coverageKind: "protectedObject",
        targetId: "profile:minimal",
        targetLabel: "Minimal runtime",
        sourceDependency: null,
        sourcePath: "test/runtime-profile.test.js"
      }
    ],
    affectedTestGates: [
      {
        id: "affectedTestGate:changeSet:changeset.demo:gate:test/runtime-profile.test.js",
        changeSetId: "changeset.demo",
        gateId: "gate:test/runtime-profile.test.js",
        gateTitle: "test/runtime-profile.test.js",
        protectedObjects: ["profile:minimal", "plugin.platform"],
        protectedObjectLabels: ["Minimal runtime", "Platform plugin"],
        matchedTargets: ["profile:minimal"],
        matchedTargetLabels: ["Minimal runtime"],
        sourceDependencies: ["test/runtime-profile.test.js"],
        selectionReasons: []
      }
    ],
    affectedTestGatesByBranch: {},
    affectedTestGatesByChangeSet: {
      "changeset.demo": ["gate:test/runtime-profile.test.js"]
    }
  }, "testGates", "changeset.demo");
  const testRuns = filterPlatformModel({
    ...model,
    testRuns: [
      { id: "testRun:demo", gateId: "gate:test/runtime-profile.test.js", branchId: "branch.demo", status: "passed" }
    ],
    testResults: [
      { id: "testResult:demo:1", runId: "testRun:demo", gateId: "gate:test/runtime-profile.test.js", status: "passed" }
    ],
    testArtifacts: [
      { id: "testArtifact:demo:stdout", runId: "testRun:demo", resultId: "testResult:demo:1", gateId: "gate:test/runtime-profile.test.js", artifactKind: "stdout" }
    ],
    testSuites: [
      { id: "testSuite:demo", runId: "testRun:demo", resultId: "testResult:demo:1", artifactId: "testArtifact:demo:stdout", gateId: "gate:test/runtime-profile.test.js", status: "passed" }
    ],
    testCases: [
      { id: "testCase:demo:1", suiteId: "testSuite:demo", runId: "testRun:demo", resultId: "testResult:demo:1", artifactId: "testArtifact:demo:stdout", gateId: "gate:test/runtime-profile.test.js", status: "passed" }
    ],
    latestTestResultsByGate: {
      "gate:test/runtime-profile.test.js": { id: "testResult:demo:1", runId: "testRun:demo", gateId: "gate:test/runtime-profile.test.js", status: "passed" }
    }
  }, "testRuns", "branch.demo");
  const testRedGreen = filterPlatformModel({
    ...model,
    branchTestRedGreen: [
      {
        id: "testRedGreen:branch:branch.demo",
        scopeType: "branch",
        branchId: "branch.demo",
        title: "branch.demo",
        status: "green",
        summary: "1 selected, 1 passed",
        selectedGateIds: ["gate:test/runtime-profile.test.js"],
        totalSelectedGates: 1,
        passedGateIds: ["gate:test/runtime-profile.test.js"],
        failedGateIds: [],
        errorGateIds: [],
        timedOutGateIds: [],
        runningGateIds: [],
        pendingGateIds: [],
        latestActivityAt: "2026-06-18T00:00:00.000Z",
        gateStates: []
      }
    ],
    changeSetTestRedGreen: [
      {
        id: "testRedGreen:changeSet:changeset.demo",
        scopeType: "changeSet",
        changeSetId: "changeset.demo",
        title: "changeset.demo",
        status: "red",
        summary: "1 selected, 1 failed",
        selectedGateIds: ["gate:test/runtime-profile.test.js"],
        totalSelectedGates: 1,
        passedGateIds: [],
        failedGateIds: ["gate:test/runtime-profile.test.js"],
        errorGateIds: [],
        timedOutGateIds: [],
        runningGateIds: [],
        pendingGateIds: [],
        latestActivityAt: "2026-06-18T00:01:00.000Z",
        gateStates: []
      }
    ],
    testGates: [{ id: "gate:test/runtime-profile.test.js", title: "test/runtime-profile.test.js" }],
    latestTestResultsByGate: {
      "gate:test/runtime-profile.test.js": { id: "testResult:demo:1", runId: "testRun:demo", gateId: "gate:test/runtime-profile.test.js", status: "passed" }
    }
  }, "testRedGreen");
  const branches = filterPlatformModel({
    ...model,
    branches: [{ id: "branch.demo", status: "open" }],
    changeSets: [{ id: "changeset.demo", status: "draft" }],
    candidateSnapshots: [{ id: "candidateSnapshot:demo:1", branchId: "branch.demo", changeSetId: "changeset.demo" }]
  }, "branches");
  const runtimeRevisions = filterPlatformModel({
    ...model,
    runtimeRevisions: [{ id: "runtimeRevision:backend:3", backendRevisionId: "backendRevision:3", frontendRevisionId: "frontendRevision:3", revision: 3, status: "active", trigger: "watch", changedSources: [], branchId: "branch.demo", changeSetId: "changeset.demo", candidateBranchCount: 1, buildErrorCount: 1 }],
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
    runtimeRevisions: [{ id: "runtimeRevision:backend:3", backendRevisionId: "backendRevision:3", frontendRevisionId: "frontendRevision:3", revision: 3, status: "active", trigger: "watch", changedSources: [], branchId: "branch.demo", changeSetId: "changeset.demo", candidateBranchCount: 1, buildErrorCount: 1 }],
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
  const frontendRevisionDetail = filterPlatformModel({
    ...model,
    runtimeRevisions: [{ id: "runtimeRevision:backend:3", backendRevisionId: "backendRevision:3", frontendRevisionId: "frontendRevision:3", revision: 3, status: "active", trigger: "watch", changedSources: [], branchId: "branch.demo", changeSetId: "changeset.demo", candidateBranchCount: 1, buildErrorCount: 1 }],
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
  }, "runtimeRevisions", "frontendRevision:3");

  assert.equal(mcp.nodes.some(node => node.id === "mcp:mcp.platform"), true);
  assert.equal(mcp.nodes.some(node => node.id === "mcpTool:platform.read"), true);
  assert.equal(docs.docs.length, 1);
  assert.equal(docs.docs[0].path, "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md");
  assert.equal(docs.docSections.length > 0, true);
  assert.equal(docs.docTasks.length > 0, true);
  assert.equal(docs.roadmapTasks.length > 0, true);
  assert.equal(roadmap.docs.length, 1);
  assert.equal(roadmap.roadmaps.length, 1);
  assert.equal(roadmap.roadmaps[0].id, "roadmap:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md");
  assert.equal(roadmap.docs[0].path, "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md");
  assert.equal(roadmap.docSections.length > 0, true);
  assert.equal(roadmap.docTasks.length > 0, true);
  assert.equal(roadmap.roadmapTasks.length > 0, true);
  assert.equal(Array.isArray(roadmap.defectsByEpic), true);
  assert.equal(Array.isArray(roadmap.testsByFeature), true);
  assert.equal(gates.gates.every(node => node.kind === "testGate"), true);
  assert.equal(testGates.testGates.length, 1);
  assert.equal(testGates.testGates[0].id, "gate:test/runtime-profile.test.js");
  assert.equal(testGates.testGateIndex.byId["gate:test/runtime-profile.test.js"].title, "test/runtime-profile.test.js");
  assert.deepEqual(testGates.testGateIndex.byBranch["branch.demo"], ["gate:test/runtime-profile.test.js"]);
  assert.deepEqual(testGates.testGateIndex.byChangeSet["changeset.demo"], ["gate:test/runtime-profile.test.js"]);
  assert.equal(testGates.affectedTestGates[0].branchId, "branch.demo");
  assert.equal(testGates.affectedTestGates[0].gateId, "gate:test/runtime-profile.test.js");
  assert.deepEqual(testGates.affectedTestGatesByBranch["branch.demo"], ["gate:test/runtime-profile.test.js"]);
  assert.equal(testGates.coverageEdges.length, 1);
  assert.equal(testGates.coverageEdges[0].targetId, "profile:minimal");
  assert.equal(testGatesByChangeSet.testGates[0].selectedByChangeSets.includes("changeset.demo"), true);
  assert.equal(testGatesByChangeSet.affectedTestGates[0].changeSetId, "changeset.demo");
  assert.deepEqual(testGatesByChangeSet.affectedTestGatesByChangeSet["changeset.demo"], ["gate:test/runtime-profile.test.js"]);
  assert.equal(testGatesByChangeSet.coverageEdges[0].gateId, "gate:test/runtime-profile.test.js");
  assert.equal(testRuns.testRuns.length, 1);
  assert.equal(testRuns.testRuns[0].id, "testRun:demo");
  assert.equal(testRuns.testResults[0].id, "testResult:demo:1");
  assert.equal(testRuns.testArtifacts[0].id, "testArtifact:demo:stdout");
  assert.equal(testRuns.testSuites[0].id, "testSuite:demo");
  assert.equal(testRuns.testCases[0].id, "testCase:demo:1");
  assert.equal(testRuns.latestTestResultsByGate["gate:test/runtime-profile.test.js"].status, "passed");
  assert.equal(testRedGreen.branchTestRedGreen[0].status, "green");
  assert.equal(testRedGreen.changeSetTestRedGreen[0].status, "red");
  assert.equal(testRedGreen.testGates[0].id, "gate:test/runtime-profile.test.js");
  assert.equal(branches.branches[0].id, "branch.demo");
  assert.equal(runtimeRevisions.runtimeRevisions[0].id, "runtimeRevision:backend:3");
  assert.equal(runtimeRevisions.runtimeRevisions[0].frontendRevisionId, "frontendRevision:3");
  assert.equal(runtimeRevisions.activeRuntimeRevision.revision, 3);
  assert.equal(runtimeRevisionDetail.snapshotBuilds.length, 1);
  assert.equal(runtimeRevisionDetail.snapshotBuildErrors.length, 1);
  assert.equal(runtimeRevisionDetail.candidateSnapshots.length, 1);
  assert.equal(runtimeRevisionDetail.candidateSnapshots[0].id, "candidateSnapshot:demo:1");
  assert.equal(frontendRevisionDetail.runtimeRevisions.length, 1);
  assert.equal(frontendRevisionDetail.runtimeRevisions[0].id, "runtimeRevision:backend:3");
});

test("roadmap planning model projects branch-backed roadmap, epic, and feature links", async () => {
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: [],
      routes: [],
      surfaces: [],
      plugins: { activePluginIds: ["plugin.platform"], effectivePluginIds: ["plugin.platform"], rejectedPlugins: [] }
    },
    project: projector => {
      if (projector === moduleProjectors.branches) {
        return [
          {
            id: "branch.platform.console",
            title: "Platform Console",
            epic: "platform",
            feature: "console",
            defect: "platform-console-regression",
            status: "valid"
          },
          {
            id: "branch.platform.runtime",
            title: "Platform Runtime",
            epic: "platform",
            feature: "runtime",
            defect: "platform-runtime-regression",
            status: "open"
          }
        ];
      }
      if (projector === moduleProjectors.changeSets) {
        return [
          { id: "changeSet.platform.console", branchId: "branch.platform.console", status: "valid" },
          { id: "changeSet.platform.runtime", branchId: "branch.platform.runtime", status: "draft" }
        ];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [
          { id: "changeSetEdit:platform:console", changeSetId: "changeSet.platform.console", path: "plugins/platform/platform-page.js" },
          { id: "changeSetEdit:platform:runtime", changeSetId: "changeSet.platform.runtime", path: "store/seeds/runtime-profiles.json" }
        ];
      }
      return [];
    }
  });

  assert.equal(model.roadmaps.length, 1);
  assert.equal(model.roadmaps[0].id, "roadmap:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md");
  assert.equal(model.nodes.some(node => node.kind === "roadmap" && node.id === "roadmap:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"), true);
  assert.equal(model.nodes.some(node => node.kind === "epic" && node.id === "epic:platform"), true);
  assert.equal(model.nodes.some(node => node.kind === "feature" && node.id === "feature:platform:console"), true);
  assert.equal(model.features.some(row => row.id === "feature:platform:console" && row.epicId === "epic:platform"), true);
  assert.equal(model.branchesByEpic["epic:platform"].includes("branch.platform.console"), true);
  assert.equal(model.defectsByEpic.some(row => row.epicId === "epic:platform" && row.defectCount === 2), true);
  assert.equal(model.testsByFeature.some(row => row.featureId === "feature:platform:console" && row.gateCount > 0), true);
  assert.equal(model.edges.some(edge => edge.from === "branch:branch.platform.console" && edge.rel === "targets" && edge.to === "feature:platform:console"), true);
  assert.equal(model.edges.some(edge => edge.from === "feature:platform:console" && edge.rel === "belongsTo" && edge.to === "epic:platform"), true);
  assert.equal(model.edges.some(edge => edge.from === "feature:platform:console" && edge.rel === "verifiedBy" && edge.to === "gate:plugins/platform/platform.test.js"), true);
  assert.equal(model.edges.some(edge => edge.from === "feature:platform:console" && edge.rel === "documentedBy" && edge.to === "doc:docs/CAPABILITIES.md"), true);
  assert.equal(model.edges.some(edge => edge.from === "epic:platform" && edge.rel === "verifiedBy" && edge.to === "gate:plugins/platform/platform.test.js"), true);
  assert.equal(model.edges.some(edge => edge.from === "defectCluster:platform-console-regression" && edge.rel === "targets" && edge.to === "feature:platform:console"), true);
  assert.equal(model.edges.some(edge => edge.from === "defectCluster:platform-console-regression" && edge.rel === "targets" && edge.to === "epic:platform"), true);
  assert.equal(model.edges.some(edge => edge.from === "roadmap:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" && edge.rel === "contains" && edge.to === "epic:platform"), true);

  const roadmap = filterPlatformModel(model, "roadmap", "epic:platform");
  assert.equal(roadmap.roadmaps.length, 1);
  assert.equal(roadmap.epics.length, 1);
  assert.equal(roadmap.features.length, 2);
  assert.equal(roadmap.defectsByEpic.some(row => row.epicId === "epic:platform" && row.defectCount === 2), true);
  assert.equal(roadmap.testsByFeature.some(row => row.featureId === "feature:platform:console"), true);
  assert.equal(roadmap.branchesByEpic["epic:platform"].includes("branch.platform.runtime"), true);
});

test("platform docs projections expose dependency indexes and reverse target lookups", async () => {
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: ["platform.self"],
      routes: [
        { method: "GET", matcher: "/platform", handler: "page.platform" },
        { method: "GET", matcher: "/api/platform-model", handler: "platform.model.read" }
      ],
      surfaces: [{ id: "surface:platform", href: "/platform" }],
      plugins: {
        activePluginIds: ["plugin.platform", "plugin.mcp"],
        effectivePluginIds: ["plugin.platform", "plugin.mcp"],
        rejectedPlugins: []
      }
    },
    project: () => []
  });

  assert.equal(model.docIndex.byPath["docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"], "doc:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md");
  assert.equal(model.nodes.some(node => node.kind === "docReference"), true);
  assert.equal(model.docReferences.some(row =>
    row.doc === "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"
    && row.referenceKind === "route"
    && row.targetId === "route:GET /platform"
  ), true);
  assert.equal(model.docDependencies.some(row =>
    row.doc === "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"
    && row.dependencyKind === "governs"
    && row.targetId === "plugin.platform"
  ), true);
  assert.equal(model.docsByPlatformObject["plugin.platform"].some(row =>
    row.docId === "doc:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"
  ), true);

  const docsByTarget = filterPlatformModel(model, "docs", "plugin.platform");
  assert.equal(docsByTarget.docs.some(doc => doc.path === "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"), true);
  assert.equal(docsByTarget.docDependencies.some(row =>
    row.doc === "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"
    && row.targetId === "plugin.platform"
  ), true);
  assert.equal(docsByTarget.docsByPlatformObject["plugin.platform"].some(row =>
    row.path === "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"
  ), true);
});

test("roadmap task projections link resolved platform targets", async () => {
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: ["platform.self"],
      routes: [{ method: "GET", matcher: "/platform", handler: "page.platform" }],
      surfaces: [{ id: "surface:platform", href: "/platform" }],
      plugins: {
        activePluginIds: ["plugin.platform", "plugin.mcp"],
        effectivePluginIds: ["plugin.platform", "plugin.mcp"],
        rejectedPlugins: []
      }
    },
    project: () => []
  });

  const pluginTask = model.roadmapTasks.find(task => task.title === "Treat `plugin.platform` as the existing home for this work.");
  const routeTask = model.roadmapTasks.find(task => task.title === "Treat `/platform` as the human surface for platform self-inspection.");
  const sourceTask = model.roadmapTasks.find(task => task.title === "Read `plugins/platform/platform-console.rvm`.");
  const fileTask = model.roadmapTasks.find(task => task.title === "Treat `plugins/platform/platform-page.js` as the current HTML/JS console renderer.");
  const jsonTask = model.roadmapTasks.find(task => task.title === "Treat `store/seeds/runtime-profiles.json` as the runtime profile seed source.");
  const testFileTask = model.roadmapTasks.find(task => task.title === "Treat `test/runtime-profile.test.js` as the profile isolation/exposure test suite.");

  assert.ok(pluginTask);
  assert.equal(pluginTask.targets.some(target => target.targetId === "plugin.platform"), true);
  assert.equal(model.edges.some(edge => edge.from === pluginTask.id && edge.rel === "targets" && edge.to === "plugin.platform"), true);
  assert.equal(pluginTask.evidence.status !== "unlinked", true);
  assert.equal(pluginTask.derivedStatus !== "untracked", true);
  assert.equal(pluginTask.evidence.gateIds.length > 0, true);

  assert.ok(routeTask);
  assert.equal(routeTask.targets.some(target => target.targetId === "route:GET /platform"), true);
  assert.equal(model.edges.some(edge => edge.from === routeTask.id && edge.rel === "targets" && edge.to === "route:GET /platform"), true);
  assert.equal(routeTask.evidence.status !== "unlinked", true);
  assert.equal(routeTask.derivedStatus !== "untracked", true);

  assert.ok(sourceTask);
  assert.equal(sourceTask.targets.some(target => target.targetId === "rvm:plugins/platform/platform-console.rvm"), true);
  assert.equal(model.edges.some(edge => edge.from === sourceTask.id && edge.rel === "targets" && edge.to === "rvm:plugins/platform/platform-console.rvm"), true);
  assert.equal(sourceTask.evidence.status !== "unlinked", true);
  assert.equal(sourceTask.derivedStatus !== "untracked", true);
  assert.equal(sourceTask.evidence.targetCount > 0, true);

  assert.ok(fileTask);
  assert.equal(fileTask.targets.some(target => target.targetId === "file:plugins/platform/platform-page.js"), true);
  assert.equal(fileTask.targets.some(target => target.targetKind === "fileSource"), true);
  assert.equal(model.edges.some(edge => edge.from === fileTask.id && edge.rel === "targets" && edge.to === "file:plugins/platform/platform-page.js"), true);
  assert.equal(fileTask.evidence.status !== "unlinked", true);
  assert.equal(fileTask.evidence.gateIds.length > 0, true);

  assert.ok(jsonTask);
  assert.equal(jsonTask.targets.some(target => target.targetId === "json:store/seeds/runtime-profiles.json"), true);
  assert.equal(jsonTask.targets.some(target => target.targetKind === "jsonSource"), true);
  assert.equal(model.edges.some(edge => edge.from === jsonTask.id && edge.rel === "targets" && edge.to === "json:store/seeds/runtime-profiles.json"), true);
  assert.equal(jsonTask.evidence.status !== "unlinked", true);
  assert.equal(jsonTask.evidence.gateIds.length > 0, true);

  assert.ok(testFileTask);
  assert.equal(testFileTask.targets.some(target => target.targetId === "file:test/runtime-profile.test.js"), true);
  assert.equal(testFileTask.targets.some(target => target.targetKind === "testFile"), true);
  assert.equal(model.edges.some(edge => edge.from === testFileTask.id && edge.rel === "targets" && edge.to === "file:test/runtime-profile.test.js"), true);
  assert.equal(testFileTask.evidence.status !== "unlinked", true);
  assert.equal(testFileTask.evidence.gateIds.length > 0, true);
});

test("roadmap task evidence tracks linked targets, gates, and gaps without replacing markdown status", async () => {
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

  const task = model.roadmapTasks.find(row => row.title === "Treat `plugin.platform` as the existing home for this work.");

  assert.ok(task);
  assert.equal(task.status, "open");
  assert.equal(task.evidence.status !== "unlinked", true);
  assert.equal(task.derivedStatus !== "untracked", true);
  assert.equal(Array.isArray(task.evidence.gapIds), true);
  assert.equal(task.evidence.gateIds.length > 0, true);
});

test("verified task evidence can derive ready or done without replacing markdown state", async () => {
  const fixtureName = `PLATFORM-TEMP-DERIVED-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}.md`;
  const fixtureRelativePath = `docs/${fixtureName}`;
  const fixtureAbsolutePath = path.join(process.cwd(), fixtureRelativePath);
  await writeFile(fixtureAbsolutePath, `# Temp Derived

- [ ] Verify \`/platform\`
- [X] Completed \`/platform\`
`, "utf8");

  try {
    const sharedContext = {
      diagnostics: {
        activeProfile: "full",
        activeBundles: [],
        providedCapabilities: [],
        routes: [{ method: "GET", matcher: "/platform", handler: "page.platform" }],
        surfaces: [],
        plugins: { activePluginIds: ["plugin.platform"], effectivePluginIds: ["plugin.platform"], rejectedPlugins: [] }
      }
    };
    const baseline = await buildPlatformModel({
      ...sharedContext,
      project: () => []
    });
    const baselineDoneTask = baseline.docTasks.find(row => row.doc === fixtureRelativePath && row.title === "Completed `/platform`");
    const byGate = Object.fromEntries((baselineDoneTask?.evidence?.gateIds ?? []).map((gateId, index) => [gateId, {
      id: `testResult:platform:derived:${index + 1}`,
      runId: `testRun:platform:derived:${index + 1}`,
      gateId,
      status: "passed",
      exitCode: 0,
      durationMs: 1000,
      producedAt: "2026-06-18T00:00:00.000Z"
    }]));
    const model = await buildPlatformModel({
      ...sharedContext,
      project: projector => {
        if (projector === moduleProjectors.latestTestResultsByGate) {
          return {
            rows: Object.values(byGate),
            byGate
          };
        }
        return [];
      }
    });

    const readyTask = model.docTasks.find(row => row.doc === fixtureRelativePath && row.title === "Verify `/platform`");
    const doneTask = model.docTasks.find(row => row.doc === fixtureRelativePath && row.title === "Completed `/platform`");

    assert.ok(readyTask);
    assert.equal(readyTask.status, "open");
    assert.equal(readyTask.evidence.status, "verified");
    assert.equal(readyTask.derivedStatus, "ready");

    assert.ok(doneTask);
    assert.equal(doneTask.status, "done");
    assert.equal(doneTask.evidence.status, "verified");
    assert.equal(doneTask.derivedStatus, "done");
  } finally {
    await rm(fixtureAbsolutePath, { force: true });
  }
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
        return [
          { id: "changeSetEdit:platform-gates:model", changeSetId: "changeSet:platform-gates", path: "plugins/platform/platform-model.js" },
          { id: "changeSetEdit:platform-gates:package", changeSetId: "changeSet:platform-gates", path: "package.json" }
        ];
      }
      return [];
    }
  });

  const runtimeProfileGate = model.testGates.find(row => row.id === "gate:test/runtime-profile.test.js");
  const platformGate = model.testGates.find(row => row.id === "gate:plugins/platform/platform.test.js");
  const packageScriptGate = model.testGates.find(row => row.command === "npm run test:plugin:mcp");
  const docGate = model.testGates.find(row =>
    row.command === "node --test test/runtime-profile.test.js"
    && row.sourceDependencies.includes("docs/RUNTIME-BUNDLE-MIGRATION-PLAN.md")
  );
  const branchView = filterPlatformModel(model, "testGates", "branch.platform.gates");
  const runtimeProfileSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.platform.gates"
    && row.gateId === "gate:test/runtime-profile.test.js"
  );
  const platformGateSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.platform.gates"
    && row.gateId === "gate:plugins/platform/platform.test.js"
  );
  const packageGateSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.platform.gates"
    && row.gateId === packageScriptGate?.id
  );

  assert.ok(runtimeProfileGate);
  assert.equal(runtimeProfileGate.runner, "node-test");
  assert.equal(runtimeProfileGate.environment, "local-node");
  assert.equal(runtimeProfileGate.timeoutMs, 180000);
  assert.equal(runtimeProfileGate.protectedObjects.includes("profile:minimal"), true);
  assert.equal(runtimeProfileGate.protectedObjects.includes("plugin.platform"), true);
  assert.equal(runtimeProfileGate.protectedObjects.includes("telemetryMetric:platform.self"), true);
  assert.equal(runtimeProfileGate.sourceDependencies.includes("test/runtime-profile.test.js"), true);
  assert.equal(runtimeProfileGate.costEstimate, "high");
  assert.equal(runtimeProfileGate.selectedByBranches.includes("branch.platform.gates"), true);
  assert.equal(runtimeProfileGate.selectedByChangeSets.includes("changeSet:platform-gates"), true);
  assert.ok(platformGate);
  assert.equal(platformGate.protectedObjects.includes("route:GET /platform"), true);
  assert.equal(platformGate.protectedObjects.includes("handler:page.platform"), true);
  assert.equal(platformGate.protectedObjects.includes("plugin.mcp"), true);
  assert.equal(platformGate.protectedObjects.includes("telemetryMetric:platform.self"), true);
  assert.equal(platformGate.protectedObjects.includes("telemetryMetric:mcp.availability"), true);
  assert.equal(platformGate.sourceDependencies.includes("plugins/platform/platform-model.js"), true);
  assert.equal(platformGate.sourceDependencies.includes("plugins/platform/platform-console.rvm"), true);
  assert.equal(platformGate.selectedByBranches.includes("branch.platform.gates"), true);
  assert.equal(platformGate.selectedByChangeSets.includes("changeSet:platform-gates"), true);
  assert.ok(packageScriptGate);
  assert.equal(packageScriptGate.protectedObjects.includes("plugin.mcp"), true);
  assert.equal(packageScriptGate.protectedObjects.includes("telemetryMetric:mcp.availability"), true);
  assert.deepEqual(packageScriptGate.sourceDependencies, ["package.json"]);
  assert.equal(packageScriptGate.selectedByBranches.includes("branch.platform.gates"), true);
  assert.equal(packageScriptGate.selectedByChangeSets.includes("changeSet:platform-gates"), true);
  assert.ok(docGate);
  assert.equal(docGate.protectedObjects.includes("doc:docs/RUNTIME-BUNDLE-MIGRATION-PLAN.md"), true);
  assert.equal(docGate.runner, "node-test");
  assert.deepEqual(docGate.sourceDependencies, ["docs/RUNTIME-BUNDLE-MIGRATION-PLAN.md"]);
  assert.equal(model.testGateIndex.byId["gate:test/runtime-profile.test.js"].title, "test/runtime-profile.test.js");
  assert.equal(model.testGateIndex.byProtectedObject["plugin.platform"].includes("gate:plugins/platform/platform.test.js"), true);
  assert.equal(model.testGateIndex.byProtectedObject["telemetryMetric:platform.self"].includes("gate:test/runtime-profile.test.js"), true);
  assert.equal(model.coverageEdges.some(row =>
    row.gateId === "gate:test/runtime-profile.test.js"
    && row.coverageKind === "protectedObject"
    && row.targetId === "profile:minimal"
  ), true);
  assert.equal(model.coverageEdges.some(row =>
    row.gateId === "gate:plugins/platform/platform.test.js"
    && row.coverageKind === "sourceDependency"
    && row.sourceDependency === "plugins/platform/platform-model.js"
  ), true);
  assert.equal(model.nodes.some(node => node.kind === "coverageEdge" && node.id.includes("gate:test/runtime-profile.test.js")), true);
  assert.equal(model.nodes.some(node => node.id === "telemetryMetric:platform.self" && node.kind === "telemetryMetric"), true);
  assert.equal(model.affectedTestGates.some(row =>
    row.branchId === "branch.platform.gates"
    && row.gateId === "gate:test/runtime-profile.test.js"
  ), true);
  assert.equal(model.affectedTestGates.some(row =>
    row.branchId === "branch.platform.gates"
    && row.gateId === packageScriptGate.id
    && row.matchedSourceDependencies.includes("package.json")
  ), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.gates"].includes("gate:test/runtime-profile.test.js"), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.gates"].includes("gate:plugins/platform/platform.test.js"), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.gates"].includes(packageScriptGate.id), true);
  assert.equal(model.affectedTestGatesByChangeSet["changeSet:platform-gates"].includes("gate:test/runtime-profile.test.js"), true);
  assert.equal(model.affectedTestGatesByChangeSet["changeSet:platform-gates"].includes("gate:plugins/platform/platform.test.js"), true);
  assert.equal(model.affectedTestGatesByChangeSet["changeSet:platform-gates"].includes(packageScriptGate.id), true);
  assert.ok(runtimeProfileSelection);
  assert.equal(runtimeProfileSelection.selectionReasons.some(reason => reason.kind === "plugin-ownership-dependency" && reason.targets.includes("plugin.platform")), true);
  assert.equal(runtimeProfileSelection.selectionReasons.some(reason => reason.kind === "telemetry-regression-dependency" && reason.targets.includes("telemetryMetric:platform.self")), true);
  assert.ok(platformGateSelection);
  assert.equal(platformGateSelection.selectionReasons.some(reason => reason.kind === "imported-source-dependency" && reason.paths.includes("plugins/platform/platform-model.js")), true);
  assert.equal(platformGateSelection.selectionReasons.some(reason => reason.kind === "telemetry-regression-dependency" && reason.targets.includes("telemetryMetric:platform.self")), true);
  assert.ok(packageGateSelection);
  assert.equal(packageGateSelection.selectionReasons.some(reason => reason.kind === "direct-file-dependency" && reason.paths.includes("package.json")), true);
  assert.equal(branchView.testGates.some(row => row.id === "gate:test/runtime-profile.test.js"), true);
  assert.equal(branchView.testGates.some(row => row.id === packageScriptGate.id), true);
  assert.equal(branchView.coverageEdges.some(row => row.gateId === "gate:test/runtime-profile.test.js"), true);
  assert.equal(branchView.affectedTestGates.some(row => row.branchId === "branch.platform.gates"), true);
  assert.deepEqual(branchView.testGateIndex.byBranch["branch.platform.gates"], model.testGateIndex.byBranch["branch.platform.gates"]);
  assert.deepEqual(branchView.affectedTestGatesByBranch["branch.platform.gates"], model.affectedTestGatesByBranch["branch.platform.gates"]);
  assert.deepEqual(branchView.selectedTestGatesByBranch["branch.platform.gates"], model.selectedTestGatesByBranch["branch.platform.gates"]);
  const changeSetView = filterPlatformModel(model, "testGates", "changeSet:platform-gates");
  assert.equal(changeSetView.testGates.some(row => row.id === "gate:test/runtime-profile.test.js"), true);
  assert.equal(changeSetView.coverageEdges.some(row => row.gateId === "gate:test/runtime-profile.test.js"), true);
  assert.equal(changeSetView.affectedTestGates.some(row => row.changeSetId === "changeSet:platform-gates"), true);
  assert.deepEqual(changeSetView.testGateIndex.byChangeSet["changeSet:platform-gates"], model.testGateIndex.byChangeSet["changeSet:platform-gates"]);
  assert.deepEqual(changeSetView.affectedTestGatesByChangeSet["changeSet:platform-gates"], model.affectedTestGatesByChangeSet["changeSet:platform-gates"]);
  assert.deepEqual(changeSetView.selectedTestGatesByChangeSet["changeSet:platform-gates"], model.selectedTestGatesByChangeSet["changeSet:platform-gates"]);
});

test("platform model derives scope specific red green summaries from scoped test results", async () => {
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
        return [
          { id: "branch.tests.green", title: "Green Branch", status: "open" },
          { id: "branch.tests.red", title: "Red Branch", status: "open" }
        ];
      }
      if (projector === moduleProjectors.changeSets) {
        return [
          { id: "changeSet:tests.green", branchId: "branch.tests.green", title: "Green Change Set", status: "draft" },
          { id: "changeSet:tests.red", branchId: "branch.tests.red", title: "Red Change Set", status: "draft" }
        ];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [
          { id: "changeSetEdit:tests.green:gate", changeSetId: "changeSet:tests.green", path: "plugins/platform/platform.test.js" },
          { id: "changeSetEdit:tests.red:gate", changeSetId: "changeSet:tests.red", path: "plugins/platform/platform.test.js" }
        ];
      }
      if (projector === moduleProjectors.testGates) {
        return [{
          id: "gate:plugins/platform/platform.test.js",
          title: "plugins/platform/platform.test.js",
          sourcePath: "plugins/platform/platform.test.js",
          command: "node --test plugins/platform/platform.test.js",
          runner: "node-test",
          environment: "local-node",
          timeoutMs: 120000,
          protectedObjects: ["verification.tests"],
          protectedObjectLabels: ["Verification tests"],
          sourceDependencies: ["plugins/platform/platform.test.js"],
          costEstimate: "low",
          selectedByBranches: [],
          selectedByChangeSets: []
        }];
      }
      if (projector === moduleProjectors.testRuns) {
        return [
          {
            id: "testRun:tests.green",
            gateId: "gate:plugins/platform/platform.test.js",
            title: "plugins/platform/platform.test.js",
            status: "passed",
            branchId: "branch.tests.green",
            changeSetId: "changeSet:tests.green",
            startedAt: "2026-06-18T00:00:00.000Z",
            finishedAt: "2026-06-18T00:00:02.000Z",
            durationMs: 2000,
            exitCode: 0
          },
          {
            id: "testRun:tests.red",
            gateId: "gate:plugins/platform/platform.test.js",
            title: "plugins/platform/platform.test.js",
            status: "failed",
            branchId: "branch.tests.red",
            changeSetId: "changeSet:tests.red",
            startedAt: "2026-06-18T00:01:00.000Z",
            finishedAt: "2026-06-18T00:01:03.000Z",
            durationMs: 3000,
            exitCode: 1
          }
        ];
      }
      if (projector === moduleProjectors.testResults) {
        return [
          {
            id: "testResult:tests.green:1",
            runId: "testRun:tests.green",
            gateId: "gate:plugins/platform/platform.test.js",
            status: "passed",
            branchId: "branch.tests.green",
            changeSetId: "changeSet:tests.green",
            exitCode: 0,
            durationMs: 2000,
            producedAt: "2026-06-18T00:00:02.000Z"
          },
          {
            id: "testResult:tests.red:1",
            runId: "testRun:tests.red",
            gateId: "gate:plugins/platform/platform.test.js",
            status: "failed",
            branchId: "branch.tests.red",
            changeSetId: "changeSet:tests.red",
            exitCode: 1,
            durationMs: 3000,
            producedAt: "2026-06-18T00:01:03.000Z"
          }
        ];
      }
      return [];
    }
  });

  const branchGreen = model.branchTestRedGreen.find(row => row.branchId === "branch.tests.green");
  const branchRed = model.branchTestRedGreen.find(row => row.branchId === "branch.tests.red");
  const changeSetGreen = model.changeSetTestRedGreen.find(row => row.changeSetId === "changeSet:tests.green");
  const changeSetRed = model.changeSetTestRedGreen.find(row => row.changeSetId === "changeSet:tests.red");
  const branchRedGreenView = filterPlatformModel(model, "testRedGreen", "branch.tests.red");
  const changeSetRedGreenView = filterPlatformModel(model, "testRedGreen", "changeSet:tests.red");

  assert.ok(branchGreen);
  assert.equal(branchGreen.status, "green");
  assert.deepEqual(branchGreen.selectedGateIds, ["gate:plugins/platform/platform.test.js"]);
  assert.deepEqual(branchGreen.passedGateIds, ["gate:plugins/platform/platform.test.js"]);
  assert.ok(branchRed);
  assert.equal(branchRed.status, "red");
  assert.ok(changeSetGreen);
  assert.equal(changeSetGreen.status, "green");
  assert.ok(changeSetRed);
  assert.equal(changeSetRed.status, "red");
  assert.equal(model.branches.find(row => row.id === "branch.tests.green")?.testRedGreen?.status, "green");
  assert.equal(model.changeSets.find(row => row.id === "changeSet:tests.red")?.testRedGreen?.status, "red");
  assert.equal(branchRedGreenView.branchTestRedGreen.length, 1);
  assert.equal(branchRedGreenView.branchTestRedGreen[0].branchId, "branch.tests.red");
  assert.equal(changeSetRedGreenView.changeSetTestRedGreen.length, 1);
  assert.equal(changeSetRedGreenView.changeSetTestRedGreen[0].changeSetId, "changeSet:tests.red");
  assert.equal(changeSetRedGreenView.testGates.some(row => row.id === "gate:plugins/platform/platform.test.js"), true);
});

test("platform route edits select platform and runtime-profile gates through owned route targets", async () => {
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
        return [{ id: "branch.platform.route", title: "Platform Route", status: "open" }];
      }
      if (projector === moduleProjectors.changeSets) {
        return [{ id: "changeSet:platform-route", branchId: "branch.platform.route", status: "draft" }];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [
          { id: "changeSetEdit:platform-route:runtime", changeSetId: "changeSet:platform-route", path: "plugins/platform/runtime.js" }
        ];
      }
      return [];
    }
  });

  const runtimeProfileSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.platform.route"
    && row.gateId === "gate:test/runtime-profile.test.js"
  );
  const platformGateSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.platform.route"
    && row.gateId === "gate:plugins/platform/platform.test.js"
  );
  const packageScriptGate = model.testGates.find(row => row.command === "npm run test:plugin:mcp");

  assert.ok(runtimeProfileSelection);
  assert.equal(runtimeProfileSelection.matchedTargets.includes("plugin.platform"), true);
  assert.equal(runtimeProfileSelection.matchedTargets.includes("telemetryMetric:platform.self"), true);
  assert.equal(runtimeProfileSelection.selectionReasons.some(reason =>
    reason.kind === "plugin-ownership-dependency"
    && reason.targets.includes("plugin.platform")
  ), true);
  assert.equal(runtimeProfileSelection.selectionReasons.some(reason =>
    reason.kind === "telemetry-regression-dependency"
    && reason.targets.includes("telemetryMetric:platform.self")
  ), true);

  assert.ok(platformGateSelection);
  assert.equal(platformGateSelection.matchedTargets.includes("route:GET /platform"), true);
  assert.equal(platformGateSelection.matchedTargets.includes("handler:page.platform"), true);
  assert.equal(platformGateSelection.selectionReasons.some(reason =>
    reason.kind === "route-ownership-dependency"
    && reason.targets.includes("route:GET /platform")
  ), true);

  assert.equal(model.affectedTestGatesByBranch["branch.platform.route"].includes("gate:test/runtime-profile.test.js"), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.route"].includes("gate:plugins/platform/platform.test.js"), true);
  assert.equal(model.affectedTestGatesByChangeSet["changeSet:platform-route"].includes("gate:test/runtime-profile.test.js"), true);
  assert.equal(model.affectedTestGatesByChangeSet["changeSet:platform-route"].includes("gate:plugins/platform/platform.test.js"), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.route"].includes(packageScriptGate?.id), false);
});

test("prior defect clusters select historically relevant platform gates", async () => {
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
        return [
          {
            id: "branch.defect.prior",
            title: "Prior Defect Branch",
            status: "open",
            defect: "platform-route-regression",
            createdAt: "2026-01-01T00:00:00.000Z"
          },
          {
            id: "branch.defect.current",
            title: "Current Defect Branch",
            status: "open",
            defect: "platform-route-regression",
            createdAt: "2026-01-02T00:00:00.000Z"
          }
        ];
      }
      if (projector === moduleProjectors.changeSets) {
        return [
          { id: "changeSet:defect-prior", branchId: "branch.defect.prior", status: "draft" },
          { id: "changeSet:defect-current", branchId: "branch.defect.current", status: "draft" }
        ];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [
          { id: "changeSetEdit:defect-prior:runtime", changeSetId: "changeSet:defect-prior", path: "plugins/platform/runtime.js" },
          { id: "changeSetEdit:defect-current:package", changeSetId: "changeSet:defect-current", path: "package.json" }
        ];
      }
      return [];
    }
  });

  const defectClusterId = "defectCluster:platform-route-regression";
  const runtimeProfileSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.defect.current"
    && row.gateId === "gate:test/runtime-profile.test.js"
  );
  const platformGateSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.defect.current"
    && row.gateId === "gate:plugins/platform/platform.test.js"
  );
  const packageScriptGate = model.testGates.find(row => row.command === "npm run test:plugin:mcp");
  const packageGateSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.defect.current"
    && row.gateId === packageScriptGate?.id
  );

  assert.equal(model.nodes.some(node => node.id === defectClusterId && node.kind === "defectCluster"), true);
  assert.ok(runtimeProfileSelection);
  assert.deepEqual(runtimeProfileSelection.matchedTargets, [defectClusterId]);
  assert.equal(runtimeProfileSelection.matchedSourceDependencies.length, 0);
  assert.equal(runtimeProfileSelection.selectionReasons.some(reason =>
    reason.kind === "prior-defect-cluster-dependency"
    && reason.targets.includes(defectClusterId)
    && reason.branchIds.includes("branch.defect.prior")
  ), true);

  assert.ok(platformGateSelection);
  assert.equal(platformGateSelection.selectionReasons.some(reason =>
    reason.kind === "prior-defect-cluster-dependency"
    && reason.targets.includes(defectClusterId)
  ), true);

  assert.ok(packageGateSelection);
  assert.equal(packageGateSelection.selectionReasons.some(reason => reason.kind === "prior-defect-cluster-dependency"), false);
  assert.equal(model.affectedTestGatesByBranch["branch.defect.current"].includes("gate:test/runtime-profile.test.js"), true);
  assert.equal(model.affectedTestGatesByBranch["branch.defect.current"].includes("gate:plugins/platform/platform.test.js"), true);
  assert.equal(model.selectedTestGatesByBranch["branch.defect.current"].length, 2);
  assert.equal(
    model.selectedTestGatesByBranch["branch.defect.current"].length
      < model.affectedTestGatesByBranch["branch.defect.current"].length,
    true
  );
  assert.equal(model.selectedTestGatesByBranch["branch.defect.current"].includes("gate:test/runtime-profile.test.js"), false);
});

test("platform WCSS-only edits do not select runtime-core backend gates", async () => {
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
        return [{ id: "branch.platform.wcss", title: "Platform WCSS", status: "open" }];
      }
      if (projector === moduleProjectors.changeSets) {
        return [{ id: "changeSet:platform-wcss", branchId: "branch.platform.wcss", status: "draft" }];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [
          { id: "changeSetEdit:platform-wcss:styles", changeSetId: "changeSet:platform-wcss", path: "plugins/platform/platform-console.wcss" }
        ];
      }
      return [];
    }
  });

  const runtimeServerGate = model.testGates.find(row => row.id === "gate:test/runtime-server.test.js");
  const platformGateSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.platform.wcss"
    && row.gateId === "gate:plugins/platform/platform.test.js"
  );

  assert.ok(runtimeServerGate);
  assert.equal(runtimeServerGate.sourceDependencies.includes("src/runtime-server.js"), true);
  assert.equal(runtimeServerGate.selectedByBranches.includes("branch.platform.wcss"), false);
  assert.equal(runtimeServerGate.selectedByChangeSets.includes("changeSet:platform-wcss"), false);

  assert.ok(platformGateSelection);
  assert.equal(platformGateSelection.matchedTargets.includes("route:GET /platform"), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.wcss"].includes("gate:plugins/platform/platform.test.js"), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.wcss"].includes("gate:test/runtime-server.test.js"), false);
  assert.equal(model.affectedTestGatesByChangeSet["changeSet:platform-wcss"].includes("gate:test/runtime-server.test.js"), false);
});

test("platform RVM-only edits select platform and candidate-snapshot gates without runtime-core backend gates", async () => {
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
        return [{ id: "branch.platform.rvm", title: "Platform RVM", status: "open" }];
      }
      if (projector === moduleProjectors.changeSets) {
        return [{ id: "changeSet:platform-rvm", branchId: "branch.platform.rvm", status: "draft" }];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [
          { id: "changeSetEdit:platform-rvm:surface", changeSetId: "changeSet:platform-rvm", path: "plugins/platform/platform-console.rvm" }
        ];
      }
      return [];
    }
  });

  const platformGate = model.testGates.find(row => row.id === "gate:plugins/platform/platform.test.js");
  const appSnapshotGate = model.testGates.find(row => row.id === "gate:test/app-snapshot-runtime.test.js");
  const runtimeProfileGate = model.testGates.find(row => row.id === "gate:test/runtime-profile.test.js");
  const runtimeServerGate = model.testGates.find(row => row.id === "gate:test/runtime-server.test.js");
  const appSnapshotSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.platform.rvm"
    && row.gateId === "gate:test/app-snapshot-runtime.test.js"
  );
  const runtimeProfileSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.platform.rvm"
    && row.gateId === "gate:test/runtime-profile.test.js"
  );
  const platformGateSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.platform.rvm"
    && row.gateId === "gate:plugins/platform/platform.test.js"
  );

  assert.ok(platformGate);
  assert.ok(appSnapshotGate);
  assert.ok(runtimeProfileGate);
  assert.ok(runtimeServerGate);
  assert.equal(platformGate.selectedByBranches.includes("branch.platform.rvm"), true);
  assert.equal(platformGate.selectedByChangeSets.includes("changeSet:platform-rvm"), true);
  assert.equal(appSnapshotGate.protectedObjects.includes("testEnvironment:platform-candidate-snapshot"), true);
  assert.equal(appSnapshotGate.selectedByBranches.includes("branch.platform.rvm"), true);
  assert.equal(appSnapshotGate.selectedByChangeSets.includes("changeSet:platform-rvm"), true);
  assert.equal(runtimeProfileGate.selectedByBranches.includes("branch.platform.rvm"), true);
  assert.equal(runtimeProfileGate.selectedByChangeSets.includes("changeSet:platform-rvm"), true);
  assert.equal(runtimeServerGate.selectedByBranches.includes("branch.platform.rvm"), false);
  assert.equal(runtimeServerGate.selectedByChangeSets.includes("changeSet:platform-rvm"), false);

  assert.ok(appSnapshotSelection);
  assert.equal(appSnapshotSelection.matchedTargets.includes("testEnvironment:platform-candidate-snapshot"), true);
  assert.equal(appSnapshotSelection.selectionReasons.some(reason =>
    reason.kind === "candidate-snapshot-environment-dependency"
    && reason.targets.includes("testEnvironment:platform-candidate-snapshot")
  ), true);
  assert.ok(runtimeProfileSelection);
  assert.equal(runtimeProfileSelection.matchedTargets.includes("route:GET /platform"), true);
  assert.ok(platformGateSelection);
  assert.equal(platformGateSelection.matchedSourceDependencies.includes("plugins/platform/platform-console.rvm"), true);
  assert.equal(platformGateSelection.matchedTargets.includes("route:GET /platform"), true);
  assert.equal(platformGateSelection.selectionReasons.some(reason =>
    reason.kind === "direct-file-dependency"
    && reason.paths.includes("plugins/platform/platform.test.js")
  ), false);
  assert.equal(platformGateSelection.selectionReasons.some(reason =>
    reason.kind === "imported-source-dependency"
    && reason.paths.includes("plugins/platform/platform-console.rvm")
  ), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.rvm"].includes("gate:plugins/platform/platform.test.js"), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.rvm"].includes("gate:test/app-snapshot-runtime.test.js"), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.rvm"].includes("gate:test/runtime-profile.test.js"), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.rvm"].includes("gate:test/runtime-server.test.js"), false);
  assert.equal(model.affectedTestGatesByChangeSet["changeSet:platform-rvm"].includes("gate:plugins/platform/platform.test.js"), true);
  assert.equal(model.affectedTestGatesByChangeSet["changeSet:platform-rvm"].includes("gate:test/app-snapshot-runtime.test.js"), true);
  assert.equal(model.affectedTestGatesByChangeSet["changeSet:platform-rvm"].includes("gate:test/runtime-profile.test.js"), true);
  assert.equal(model.affectedTestGatesByChangeSet["changeSet:platform-rvm"].includes("gate:test/runtime-server.test.js"), false);
});

test("platform authored source edits infer the owning platform bundle as an affected runtime object", async () => {
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [{ id: "bundle-platform", displayName: "Platform Self Model" }],
      providedCapabilities: [],
      routes: [{ method: "GET", matcher: "/platform", handler: "page.platform" }],
      surfaces: [],
      plugins: { activePluginIds: ["plugin.platform"], effectivePluginIds: ["plugin.platform"], rejectedPlugins: [] }
    },
    project: projector => {
      if (projector === moduleProjectors.branches) {
        return [{ id: "branch.platform.bundle", title: "Platform Bundle", status: "open" }];
      }
      if (projector === moduleProjectors.changeSets) {
        return [{ id: "changeSet:platform-bundle", branchId: "branch.platform.bundle", status: "draft" }];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [
          { id: "changeSetEdit:platform-bundle:surface", changeSetId: "changeSet:platform-bundle", path: "plugins/platform/platform-console.rvm" }
        ];
      }
      return [];
    }
  });

  const platformGate = model.testGates.find(row => row.id === "gate:plugins/platform/platform.test.js");
  const platformGateSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.platform.bundle"
    && row.gateId === "gate:plugins/platform/platform.test.js"
  );

  assert.ok(platformGate);
  assert.equal(platformGate.protectedObjects.includes("bundle-platform"), true);
  assert.ok(platformGateSelection);
  assert.equal(platformGateSelection.matchedTargets.includes("bundle-platform"), true);
  assert.equal(platformGateSelection.matchedTargetLabels.includes("Platform Self Model"), true);
  assert.equal(model.affectedTestGatesByBranch["branch.platform.bundle"].includes("gate:plugins/platform/platform.test.js"), true);
});

test("dependency graph misses are logged as meta-defect gaps when no gates cover changed sources", async () => {
  const uncoveredPath = ["src", "unmodeled", "dependency-gap.js"].join("/");
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
        return [{ id: "branch.dependency.miss", title: "Dependency Miss", status: "open" }];
      }
      if (projector === moduleProjectors.changeSets) {
        return [{ id: "changeSet:dependency-miss", branchId: "branch.dependency.miss", status: "draft" }];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [
          {
            id: "changeSetEdit:dependency-miss:store",
            changeSetId: "changeSet:dependency-miss",
            path: uncoveredPath
          }
        ];
      }
      return [];
    }
  });

  const changeSetGap = model.gaps.find(gap => gap.id === "gap.meta-defect.dependency-graph.changeSet.changeSet:dependency-miss");

  assert.ok(changeSetGap);
  assert.equal(changeSetGap.kind, "meta-defect");
  assert.equal(changeSetGap.category, "dependency-graph-miss");
  assert.equal(changeSetGap.scopeKind, "changeSet");
  assert.equal(changeSetGap.target, "changeSet:changeSet:dependency-miss");
  assert.equal(changeSetGap.branchId, "branch.dependency.miss");
  assert.equal(changeSetGap.changeSetId, "changeSet:dependency-miss");
  assert.deepEqual(changeSetGap.changedPaths, [uncoveredPath]);

  assert.equal(model.affectedTestGatesByChangeSet["changeSet:dependency-miss"], undefined);
});

test("doc-only changes do not emit dependency graph miss meta-defects", async () => {
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
        return [{ id: "branch.docs.only", title: "Docs Only", status: "open" }];
      }
      if (projector === moduleProjectors.changeSets) {
        return [{ id: "changeSet:docs-only", branchId: "branch.docs.only", status: "draft" }];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [
          {
            id: "changeSetEdit:docs-only:roadmap",
            changeSetId: "changeSet:docs-only",
            path: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"
          }
        ];
      }
      return [];
    }
  });

  assert.equal(model.gaps.some(gap => gap.category === "dependency-graph-miss" && gap.target === "changeSet:changeSet:docs-only"), false);
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

test("markdown ingestion parses explicit branch and proposal ids into task and doc edges", async () => {
  const fixtureName = `PLATFORM-TEMP-REF-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}.md`;
  const fixtureRelativePath = `docs/${fixtureName}`;
  const fixtureAbsolutePath = path.join(process.cwd(), fixtureRelativePath);
  await writeFile(fixtureAbsolutePath, `# Temp References

See \`branch:docs-fixture\` and \`proposal.platform.docs.fixture\`.

- [ ] Review \`branch:docs-fixture\` before approving \`proposal.platform.docs.fixture\`.
`, "utf8");

  try {
    const model = await buildPlatformModel({
      diagnostics: {
        activeProfile: "full",
        activeBundles: [],
        providedCapabilities: [],
        routes: [],
        surfaces: [],
        plugins: { activePluginIds: ["plugin.platform"], effectivePluginIds: ["plugin.platform"], rejectedPlugins: [] }
      },
      project: projector => {
        if (projector === moduleProjectors.branches) {
          return [{ id: "branch:docs-fixture", title: "Docs Fixture", status: "open" }];
        }
        if (projector === moduleProjectors.proposals) {
          return [{ id: "proposal.platform.docs.fixture", status: "open", targetProcess: "branch.merge", targetKind: "branch", targetId: "branch:docs-fixture" }];
        }
        return [];
      }
    });

    const doc = model.docs.find(row => row.path === fixtureRelativePath);
    const task = model.docTasks.find(row => row.doc === fixtureRelativePath);

    assert.ok(doc);
    assert.ok(task);
    assert.equal(doc.references.branchIds.includes("branch:docs-fixture"), true);
    assert.equal(doc.references.proposalIds.includes("proposal.platform.docs.fixture"), true);
    assert.equal(model.docReferences.some(row => row.doc === fixtureRelativePath && row.targetId === "branch:branch:docs-fixture"), true);
    assert.equal(model.docReferences.some(row => row.doc === fixtureRelativePath && row.targetId === "proposal:proposal.platform.docs.fixture"), true);
    assert.equal(task.targets.some(target => target.targetId === "branch:branch:docs-fixture"), true);
    assert.equal(task.targets.some(target => target.targetId === "proposal:proposal.platform.docs.fixture"), true);
    assert.equal(model.edges.some(edge => edge.from === task.id && edge.rel === "targets" && edge.to === "branch:branch:docs-fixture"), true);
    assert.equal(model.edges.some(edge => edge.from === task.id && edge.rel === "targets" && edge.to === "proposal:proposal.platform.docs.fixture"), true);
  } finally {
    await rm(fixtureAbsolutePath, { force: true });
  }
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
  assert.equal(branch?.affectedSystemSummaries?.some(row => row.system === "surface.platform"), true);
  assert.equal(branch?.affectedSystemSummaries?.some(row => row.system === "docs"), true);
  assert.equal(branch?.telemetryImpactSummaries?.some(row => row.id === "platform.self"), true);
});

test("platform test file edits are surfaced as verification test systems and select the changed gate", async () => {
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
        return [{ id: "branch.tests.changed", title: "Changed Test", status: "open", changeSetIds: ["changeSet:tests-changed"] }];
      }
      if (projector === moduleProjectors.changeSets) {
        return [{ id: "changeSet:tests-changed", branchId: "branch.tests.changed", status: "draft" }];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [
          { id: "changeSetEdit:tests-changed:platform-test", changeSetId: "changeSet:tests-changed", path: "plugins/platform/platform.test.js" }
        ];
      }
      return [];
    }
  });

  const branch = filterPlatformModel(model, "branches").branches.find(row => row.id === "branch.tests.changed");
  const changedGateSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.tests.changed"
    && row.gateId === "gate:plugins/platform/platform.test.js"
  );

  assert.ok(branch);
  assert.equal(branch.affectedSystemSummaries.some(row => row.system === "verification.tests"), true);
  assert.equal(branch.telemetryImpactSummaries.some(row => row.id === "verification.gates"), true);
  assert.ok(changedGateSelection);
  assert.equal(changedGateSelection.matchedSourceDependencies.includes("plugins/platform/platform.test.js"), true);
  assert.equal(changedGateSelection.selectionReasons.some(reason =>
    reason.kind === "direct-file-dependency"
    && reason.paths.includes("plugins/platform/platform.test.js")
  ), true);
  assert.equal(model.affectedTestGatesByBranch["branch.tests.changed"].includes("gate:plugins/platform/platform.test.js"), true);
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

test("stale governed docs contribute doc-freshness selection reasons to affected gates", async () => {
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
        return [{ id: "branch.docs.reason", title: "Docs Reason", status: "open", changeSetIds: ["changeset.docs.reason"] }];
      }
      if (projector === moduleProjectors.changeSets) {
        return [{ id: "changeset.docs.reason", branchId: "branch.docs.reason", status: "draft" }];
      }
      if (projector === moduleProjectors.changeSetEdits) {
        return [{ id: "changeSetEdit:changeset.docs.reason:platform", changeSetId: "changeset.docs.reason", path: "plugins/platform/platform-console.rvm" }];
      }
      return [];
    }
  });

  const branchSelection = model.affectedTestGates.find(row =>
    row.branchId === "branch.docs.reason"
    && row.gateId === "gate:plugins/platform/platform.test.js"
  );
  const changeSetSelection = model.affectedTestGates.find(row =>
    row.changeSetId === "changeset.docs.reason"
    && row.gateId === "gate:plugins/platform/platform.test.js"
  );

  assert.ok(branchSelection);
  assert.equal(branchSelection.matchedTargets.includes("doc:docs/CAPABILITIES.md"), true);
  assert.equal(branchSelection.selectionReasons.some(reason =>
    reason.kind === "doc-freshness-dependency"
    && reason.targets.includes("doc:docs/CAPABILITIES.md")
  ), true);

  assert.ok(changeSetSelection);
  assert.equal(changeSetSelection.matchedTargets.includes("doc:docs/CAPABILITIES.md"), true);
  assert.equal(changeSetSelection.selectionReasons.some(reason =>
    reason.kind === "doc-freshness-dependency"
    && reason.targets.includes("doc:docs/CAPABILITIES.md")
  ), true);
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

test("platform test run handlers execute modeled gates and expose read model state", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const sent = [];
  const rvm = await readFile(new URL("./platform-console.rvm", import.meta.url), "utf8");
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async req => req.body,
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" }
    },
    platformTestRunner: async ({ command, timeoutMs }) => ({
      startedAt: "2026-06-18T00:00:00.000Z",
      finishedAt: "2026-06-18T00:00:01.000Z",
      durationMs: 1000,
      exitCode: 0,
      signal: null,
      status: "passed",
      stdout: `TAP version 13\n1..1\nok 1 - ran ${command}\n`,
      stderr: `<?xml version="1.0" encoding="UTF-8"?><testsuite name="platform" tests="1" failures="0" errors="0" skipped="0"></testsuite>`,
      timedOut: false,
      error: null,
      timeoutMs
    }),
    sendGateFailure: (res, gate) => sent.push({ status: gate.status, body: { error: gate.reason } }),
    send: () => {},
    sendJson: (res, status, body) => sent.push({ status, body })
  });

  await handlers["platform.changeSet.create"]({
    req: {
      body: {
        id: "changeset.test.run.handlers",
        branchId: "branch.test.run.handlers",
        title: "Test run handler snapshot"
      }
    },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  await handlers["platform.changeSet.edit"]({
    req: {
      body: {
        edits: [{
          path: "plugins/platform/platform-console.rvm",
          content: `${rvm}\n`
        }]
      }
    },
    res: {},
    params: { id: "changeset.test.run.handlers" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });

  await handlers["platform.changeSet.validate"]({
    res: {},
    params: { id: "changeset.test.run.handlers" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });

  const candidateSnapshotId = sent.at(-1).body.candidateSnapshot.id;

  await handlers["platform.testRun.create"]({
    req: {
      body: {
        id: "testRun.platform.demo",
        gateId: "gate:plugins/platform/platform.test.js",
        branchId: "branch.platform.demo",
        candidateSnapshotId
      }
    },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: {
      runtimeProfile: "full",
      project: projector => world.project(projector)
    }
  });

  assert.equal(sent.at(-1).status, 201);
  assert.equal(sent.at(-1).body.testRun.id, "testRun.platform.demo");
  assert.equal(sent.at(-1).body.testRun.status, "passed");
  assert.equal(sent.at(-1).body.testRun.environment, "platform-candidate-snapshot");
  assert.equal(sent.at(-1).body.testRun.environmentInputs.cwd, ".");
  assert.equal(sent.at(-1).body.testRun.environmentInputs.environment, "platform-candidate-snapshot");
  assert.equal(sent.at(-1).body.testRun.environmentInputs.runner, "node-test");
  assert.equal(sent.at(-1).body.testRun.environmentInputs.workspaceMode, "isolated-temp-workspace");
  assert.equal(sent.at(-1).body.testRun.environmentInputs.workspaceSource, "candidateSnapshot");
  assert.equal(sent.at(-1).body.testRun.environmentInputs.runtimeProfile, "full");
  assert.equal(Array.isArray(sent.at(-1).body.testRun.environmentInputs.shellArgs), true);
  assert.equal(Array.isArray(sent.at(-1).body.testRun.environmentInputs.envOverrideKeys), true);
  assert.equal(sent.at(-1).body.testRun.sourceRevision.branchId, "branch.platform.demo");
  assert.equal(sent.at(-1).body.testRun.sourceRevision.candidateSnapshotId, candidateSnapshotId);
  assert.equal(Array.isArray(sent.at(-1).body.testRun.sourceRevision.dependencyHashes), true);
  assert.equal(sent.at(-1).body.latestResult.status, "passed");
  assert.equal(sent.at(-1).body.latestResult.environmentInputs.environment, "platform-candidate-snapshot");
  assert.equal(sent.at(-1).body.latestResult.sourceRevision.branchId, "branch.platform.demo");
  assert.equal(sent.at(-1).body.testArtifacts.length, 4);
  assert.equal(sent.at(-1).body.testSuites.length, 2);
  assert.equal(sent.at(-1).body.testCases.length, 1);
  assert.equal(sent.at(-1).body.testArtifacts.some(row => row.artifactKind === "stdout"), true);
  assert.equal(sent.at(-1).body.testArtifacts.some(row => row.artifactKind === "stderr"), true);
  assert.equal(sent.at(-1).body.testArtifacts.some(row => row.artifactKind === "tap" && row.summary?.total === 1), true);
  assert.equal(sent.at(-1).body.testArtifacts.some(row => row.artifactKind === "junit" && row.summary?.total === 1), true);
  assert.equal(sent.at(-1).body.testSuites.some(row => row.format === "tap" && row.total === 1), true);
  assert.equal(sent.at(-1).body.testCases.some(row => row.format === "tap" && row.status === "passed"), true);
  assert.equal(world.project(moduleProjectors.testRuns).length, 1);
  assert.equal(world.project(moduleProjectors.testResults).length, 1);
  assert.equal(world.project(moduleProjectors.testArtifacts).length, 4);
  assert.equal(world.project(moduleProjectors.testSuites).length, 2);
  assert.equal(world.project(moduleProjectors.testCases).length, 1);
  assert.equal(world.project(moduleProjectors.latestTestResultsByGate).byGate["gate:plugins/platform/platform.test.js"].status, "passed");
  const runtimeModel = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: ["platform.self"],
      routes: [{ method: "GET", matcher: "/platform", handler: "page.platform" }],
      surfaces: [],
      plugins: { activePluginIds: ["plugin.platform"], effectivePluginIds: ["plugin.platform"], rejectedPlugins: [] }
    },
    project: projector => world.project(projector)
  });
  assert.equal(runtimeModel.nodes.some(node => node.id === "testRun.platform.demo" && node.kind === "testRun"), true);
  assert.equal(runtimeModel.nodes.some(node => node.id === "testResult:testRun.platform.demo:1" && node.kind === "testResult"), true);
  assert.equal(runtimeModel.nodes.some(node => node.id === "testArtifact:testRun.platform.demo:stdout" && node.kind === "testArtifact"), true);
  assert.equal(runtimeModel.nodes.some(node => node.id === "testArtifact:testRun.platform.demo:tap:stdout" && node.kind === "testArtifact"), true);
  assert.equal(runtimeModel.nodes.some(node => node.id === "testArtifact:testRun.platform.demo:junit:stderr" && node.kind === "testArtifact"), true);
  assert.equal(runtimeModel.nodes.some(node => node.kind === "testSuite" && node.id === "testSuite:testArtifact:testRun.platform.demo:tap:stdout"), true);
  assert.equal(runtimeModel.nodes.some(node => node.kind === "testSuite" && node.id === "testSuite:testArtifact:testRun.platform.demo:junit:stderr:suite-1"), true);
  assert.equal(runtimeModel.nodes.some(node => node.kind === "testCase" && node.id === "testCase:testArtifact:testRun.platform.demo:tap:stdout:1"), true);
  assert.equal(runtimeModel.nodes.some(node => node.id === "testEnvironment:platform-candidate-snapshot" && node.kind === "testEnvironment" && node.status === "active"), true);
  assert.equal(runtimeModel.edges.some(edge => edge.from === "testRun.platform.demo" && edge.rel === "usesBoundary" && edge.to === "boundary:testRunner.platform"), true);
  assert.equal(runtimeModel.edges.some(edge => edge.from === "testRun.platform.demo" && edge.rel === "executesOn" && edge.to === "testEnvironment:platform-candidate-snapshot"), true);

  await handlers["platform.testRun.read"]({
    res: {},
    params: { id: "testRun.platform.demo" }
  });

  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.testRun.id, "testRun.platform.demo");
  assert.equal(sent.at(-1).body.testResults.length, 1);
  assert.equal(sent.at(-1).body.testArtifacts.length, 4);
  assert.equal(sent.at(-1).body.testSuites.length, 2);
  assert.equal(sent.at(-1).body.testCases.length, 1);
  assert.equal(sent.at(-1).body.testRun.environmentInputs.environment, "platform-candidate-snapshot");
  assert.equal(sent.at(-1).body.testResults[0].sourceRevision.branchId, "branch.platform.demo");
}));

test("platform test run handlers can execute the selected gate set for a change set", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const sent = [];
  const runnerCalls = [];
  const rvm = await readFile(new URL("./platform-console.rvm", import.meta.url), "utf8");
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async req => req.body,
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" }
    },
    platformTestRunner: async ({ command, candidateSnapshotId }) => {
      runnerCalls.push({ command, candidateSnapshotId });
      return {
        startedAt: "2026-06-18T00:00:00.000Z",
        finishedAt: "2026-06-18T00:00:01.000Z",
        durationMs: 1000,
        exitCode: 0,
        signal: null,
        status: "passed",
        stdout: `TAP version 13\n1..1\nok 1 - ran ${command}\n`,
        stderr: `<?xml version="1.0" encoding="UTF-8"?><testsuite name="platform" tests="1" failures="0" errors="0" skipped="0"></testsuite>`,
        timedOut: false,
        error: null
      };
    },
    sendGateFailure: (res, gate) => sent.push({ status: gate.status, body: { error: gate.reason } }),
    send: () => {},
    sendJson: (res, status, body) => sent.push({ status, body })
  });

  await handlers["platform.changeSet.create"]({
    req: {
      body: {
        id: "changeset.test.run.selected",
        branchId: "branch.test.run.selected",
        title: "Selected test run snapshot"
      }
    },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  await handlers["platform.changeSet.edit"]({
    req: {
      body: {
        edits: [{
          path: "plugins/platform/platform-console.rvm",
          content: `${rvm}\n`
        }]
      }
    },
    res: {},
    params: { id: "changeset.test.run.selected" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });

  await handlers["platform.changeSet.validate"]({
    res: {},
    params: { id: "changeset.test.run.selected" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });

  const candidateSnapshotId = sent.at(-1).body.candidateSnapshot.id;
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: ["platform.self"],
      routes: [{ method: "GET", matcher: "/platform", handler: "page.platform" }],
      surfaces: [],
      plugins: { activePluginIds: ["plugin.platform"], effectivePluginIds: ["plugin.platform"], rejectedPlugins: [] }
    },
    project: projector => world.project(projector)
  });
  const selectedGateIds = model.selectedTestGatesByChangeSet["changeset.test.run.selected"] ?? [];
  assert.equal(selectedGateIds.length > 0, true);
  assert.equal(selectedGateIds.includes("gate:plugins/platform/platform.test.js"), true);

  await handlers["platform.testRun.create"]({
    req: {
      body: {
        changeSetId: "changeset.test.run.selected",
        candidateSnapshotId
      }
    },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: {
      runtimeProfile: "full",
      project: projector => world.project(projector)
    }
  });

  assert.equal(sent.at(-1).status, 201);
  assert.equal(sent.at(-1).body.selectionScope.scopeType, "changeSet");
  assert.equal(sent.at(-1).body.selectionScope.branchId, "branch.test.run.selected");
  assert.equal(sent.at(-1).body.selectionScope.changeSetId, "changeset.test.run.selected");
  assert.deepEqual(sent.at(-1).body.selectionScope.selectedGateIds, selectedGateIds);
  assert.equal(sent.at(-1).body.testRuns.length, selectedGateIds.length);
  assert.equal(sent.at(-1).body.latestResults.length, selectedGateIds.length);
  assert.equal(sent.at(-1).body.summaries.totalRuns, selectedGateIds.length);
  assert.equal(sent.at(-1).body.summaries.passed, selectedGateIds.length);
  assert.equal(sent.at(-1).body.testRuns.every(row => row.changeSetId === "changeset.test.run.selected"), true);
  assert.equal(sent.at(-1).body.latestResults.every(row => row.status === "passed"), true);
  assert.equal(sent.at(-1).body.testRuns.some(row => row.sourceRevision?.candidateSnapshotId === candidateSnapshotId), true);
  assert.equal(world.project(moduleProjectors.testRuns).length, selectedGateIds.length);
  assert.equal(runnerCalls.length, selectedGateIds.length);
}));

test("platform test run handlers reject selected gate execution when a scope has no selected gates", async () => withRegisteredPluginProjectors(providers, async () => {
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
    platformTestRunner: async () => {
      throw new Error("selected gate runner should not execute");
    },
    sendGateFailure: (res, gate) => sent.push({ status: gate.status, body: { error: gate.reason } }),
    send: () => {},
    sendJson: (res, status, body) => sent.push({ status, body })
  });

  await handlers["platform.branch.create"]({
    req: {
      body: {
        id: "branch.test.run.empty",
        title: "Empty selected gate scope"
      }
    },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  await handlers["platform.testRun.create"]({
    req: {
      body: {
        branchId: "branch.test.run.empty"
      }
    },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: {
      runtimeProfile: "full",
      project: projector => world.project(projector)
    }
  });

  assert.equal(sent.at(-1).status, 409);
  assert.equal(sent.at(-1).body.error, "no selected test gates for scope");
  assert.deepEqual(sent.at(-1).body.selectionScope, {
    scopeType: "branch",
    branchId: "branch.test.run.empty",
    changeSetId: null,
    selectedGateIds: []
  });
}));

test("platform test runs capture environment inputs and prefer candidate snapshot hashes for source revision", async () => withRegisteredPluginProjectors(providers, async () => {
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

  const originalConsole = await readFile(new URL("./platform-console.rvm", import.meta.url), "utf8");
  const updatedConsole = originalConsole.replace("Platform Console", "Platform Console Candidate Snapshot");

  await handlers["platform.changeSet.create"]({
    req: {
      body: {
        id: "changeset.test.source.revision",
        branchId: "branch.test.source.revision",
        title: "Source revision proof"
      }
    },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  await handlers["platform.changeSet.edit"]({
    req: {
      body: {
        edits: [{
          path: "plugins/platform/platform-console.rvm",
          content: updatedConsole
        }]
      }
    },
    res: {},
    params: { id: "changeset.test.source.revision" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });

  await handlers["platform.changeSet.validate"]({
    res: {},
    params: { id: "changeset.test.source.revision" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });

  const candidateSnapshot = world.project(moduleProjectors.candidateSnapshotIndex).byChangeSet["changeset.test.source.revision"]?.at(-1) ?? null;
  assert.ok(candidateSnapshot);
  const candidateFile = candidateSnapshot.files.find(file => file.path === "plugins/platform/platform-console.rvm");
  assert.ok(candidateFile);

  const run = await runPlatformTestGate(world, {
    actor: "aaron",
    gate: {
      id: "gate:platform-source-revision",
      title: "Platform source revision gate",
      command: "node --test plugins/platform/platform.test.js",
      runner: "node-test",
      timeoutMs: 3210,
      sourceDependencies: [
        "plugins/platform/platform-console.rvm",
        "plugins/platform/platform-console.wcss"
      ],
      protectedObjects: ["plugin.platform"]
    },
    id: "testRun.platform.source.revision",
    branchId: "branch.test.source.revision",
    changeSetId: "changeset.test.source.revision",
    candidateSnapshotId: candidateSnapshot.id,
    session: { id: "session.platform" },
    runtimeProfile: "full",
    runCommand: async () => ({
      startedAt: "2026-06-18T00:00:00.000Z",
      finishedAt: "2026-06-18T00:00:00.250Z",
      durationMs: 250,
      exitCode: 0,
      signal: null,
      status: "passed",
      stdout: "ok 1 - platform source revision",
      stderr: "",
      timedOut: false,
      error: null
    })
  });

  assert.equal(run.status, 201);
  assert.equal(run.testRun.environmentInputs.cwd, ".");
  assert.equal(run.testRun.environmentInputs.environment, "platform-candidate-snapshot");
  assert.equal(run.testRun.environmentInputs.workspaceMode, "isolated-temp-workspace");
  assert.equal(run.testRun.environmentInputs.workspaceSource, "candidateSnapshot");
  assert.equal(run.testRun.environmentInputs.overlayFileCount, 1);
  assert.equal(run.testRun.environmentInputs.timeoutMs, 3210);
  assert.equal(run.testRun.environmentInputs.runtimeProfile, "full");
  assert.equal(run.testRun.sourceRevision.branchId, "branch.test.source.revision");
  assert.equal(run.testRun.sourceRevision.changeSetId, "changeset.test.source.revision");
  assert.equal(run.testRun.sourceRevision.candidateSnapshotId, candidateSnapshot.id);
  assert.equal(run.testRun.sourceRevision.candidateSnapshotRevision, candidateSnapshot.revision);
  assert.equal(run.testRun.sourceRevision.candidateSnapshotStatus, candidateSnapshot.status);
  const candidateHashEntry = run.testRun.sourceRevision.dependencyHashes.find(row => row.path === "plugins/platform/platform-console.rvm");
  assert.ok(candidateHashEntry);
  assert.equal(candidateHashEntry.source, "candidateSnapshot");
  assert.equal(candidateHashEntry.hash, candidateFile.nextContentHash);
  const workspaceHashEntry = run.testRun.sourceRevision.dependencyHashes.find(row => row.path === "plugins/platform/platform-console.wcss");
  assert.ok(workspaceHashEntry);
  assert.equal(workspaceHashEntry.source, "workspace");
  assert.equal(typeof workspaceHashEntry.hash, "string");
  assert.equal(workspaceHashEntry.hash.length, 64);
  assert.equal(run.testResults[0].environmentInputs.environment, "platform-candidate-snapshot");
  assert.equal(run.testResults[0].sourceRevision.candidateSnapshotId, candidateSnapshot.id);
}));

test("platform candidate snapshot test runs execute against an isolated temp workspace overlay", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const fixture = await createTempPlatformApplyFixture();
  try {
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
      req: {
        body: {
          id: "changeset.test.temp.overlay",
          branchId: "branch.test.temp.overlay",
          title: "Temp workspace overlay"
        }
      },
      res: {},
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: { runtimeProfile: "full" }
    });

    await handlers["platform.changeSet.edit"]({
      req: {
        body: {
          edits: [{
            path: fixture.first,
            content: JSON.stringify({ value: 99 }, null, 2)
          }]
        }
      },
      res: {},
      params: { id: "changeset.test.temp.overlay" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });

    await handlers["platform.changeSet.validate"]({
      res: {},
      params: { id: "changeset.test.temp.overlay" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });

    const candidateSnapshot = world.project(moduleProjectors.candidateSnapshotIndex).byChangeSet["changeset.test.temp.overlay"]?.at(-1) ?? null;
    assert.ok(candidateSnapshot);

    const run = await runPlatformTestGate(world, {
      actor: "aaron",
      gate: {
        id: "gate:platform-temp-overlay",
        title: "Platform temp overlay gate",
        command: "node --test plugins/platform/platform.test.js",
        runner: "node-test",
        timeoutMs: 2100,
        sourceDependencies: [fixture.first],
        protectedObjects: ["plugin.platform"]
      },
      id: "testRun.platform.temp.overlay",
      branchId: "branch.test.temp.overlay",
      changeSetId: "changeset.test.temp.overlay",
      candidateSnapshotId: candidateSnapshot.id,
      runtimeProfile: "full",
      runCommand: async ({ cwd }) => {
        const tempContent = JSON.parse(await readFile(path.join(cwd, fixture.first), "utf8"));
        const liveContent = JSON.parse(await readFile(path.join(process.cwd(), fixture.first), "utf8"));
        assert.notEqual(path.resolve(cwd), process.cwd());
        assert.deepEqual(tempContent, { value: 99 });
        assert.deepEqual(liveContent, { value: 1 });
        await writeFile(path.join(cwd, fixture.first), JSON.stringify({ value: 123 }, null, 2), "utf8");
        return {
          startedAt: "2026-06-18T00:00:00.000Z",
          finishedAt: "2026-06-18T00:00:00.150Z",
          durationMs: 150,
          exitCode: 0,
          signal: null,
          status: "passed",
          stdout: "ok 1 - candidate snapshot workspace",
          stderr: "",
          timedOut: false,
          error: null
        };
      }
    });

    assert.equal(run.status, 201);
    assert.equal(run.testRun.environment, "platform-candidate-snapshot");
    assert.equal(run.testRun.environmentInputs.workspaceMode, "isolated-temp-workspace");
    assert.equal(run.testRun.environmentInputs.workspaceSource, "candidateSnapshot");
    assert.equal(run.testRun.environmentInputs.overlayFileCount, 1);
    assert.deepEqual(JSON.parse(await readFile(path.join(process.cwd(), fixture.first), "utf8")), { value: 1 });
  } finally {
    await removeTempPlatformApplyFixture(fixture.root);
  }
}));

test("isolated temp workspace test runs copy the live workspace without mutating it", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const fixture = await createTempPlatformApplyFixture();
  try {
    const run = await runPlatformTestGate(world, {
      actor: "aaron",
      gate: {
        id: "gate:platform-temp-workspace",
        title: "Platform temp workspace gate",
        command: "node --test plugins/platform/platform.test.js",
        runner: "node-test",
        environment: "isolated-temp-workspace",
        timeoutMs: 1700,
        sourceDependencies: [fixture.first],
        protectedObjects: ["plugin.platform"]
      },
      id: "testRun.platform.temp.workspace",
      runtimeProfile: "full",
      runCommand: async ({ cwd }) => {
        const tempContent = JSON.parse(await readFile(path.join(cwd, fixture.first), "utf8"));
        const liveContent = JSON.parse(await readFile(path.join(process.cwd(), fixture.first), "utf8"));
        assert.notEqual(path.resolve(cwd), process.cwd());
        assert.deepEqual(tempContent, { value: 1 });
        assert.deepEqual(liveContent, { value: 1 });
        await writeFile(path.join(cwd, fixture.first), JSON.stringify({ value: 7 }, null, 2), "utf8");
        return {
          startedAt: "2026-06-18T00:00:00.000Z",
          finishedAt: "2026-06-18T00:00:00.120Z",
          durationMs: 120,
          exitCode: 0,
          signal: null,
          status: "passed",
          stdout: "ok 1 - isolated temp workspace",
          stderr: "",
          timedOut: false,
          error: null
        };
      }
    });

    assert.equal(run.status, 201);
    assert.equal(run.testRun.environment, "isolated-temp-workspace");
    assert.equal(run.testRun.environmentInputs.workspaceMode, "isolated-temp-workspace");
    assert.equal(run.testRun.environmentInputs.workspaceSource, "workspace");
    assert.equal(run.testRun.environmentInputs.overlayFileCount, 0);
    assert.deepEqual(JSON.parse(await readFile(path.join(process.cwd(), fixture.first), "utf8")), { value: 1 });
  } finally {
    await removeTempPlatformApplyFixture(fixture.root);
  }
}));

test("platform test runs cache successful results and invalidate on source, environment, runner, and dependency graph changes", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const fixture = await createTempPlatformApplyFixture();
  let commandCalls = 0;
  const gateId = "gate:platform-cache-proof";
  const baseGate = {
    id: gateId,
    title: "Platform cache proof gate",
    command: "node --test plugins/platform/platform.test.js",
    runner: "node-test",
    timeoutMs: 1234,
    sourceDependencies: [fixture.first],
    protectedObjects: ["plugin.platform"]
  };
  async function runCached({
    id,
    gate = baseGate,
    runtimeProfile = "full",
    runnerVersion = "node-test:fixture-v1"
  }) {
    return await runPlatformTestGate(world, {
      actor: "aaron",
      gate,
      id,
      runtimeProfile,
      resolveRunnerVersion: async () => runnerVersion,
      runCommand: async () => {
        commandCalls += 1;
        return {
          startedAt: "2026-06-18T00:00:00.000Z",
          finishedAt: "2026-06-18T00:00:00.100Z",
          durationMs: 100,
          exitCode: 0,
          signal: null,
          status: "passed",
          stdout: `ok 1 - cache call ${commandCalls}`,
          stderr: "",
          timedOut: false,
          error: null
        };
      }
    });
  }

  try {
    const first = await runCached({ id: "testRun.cache.first" });
    const second = await runCached({ id: "testRun.cache.second" });

    assert.equal(first.testRun.cacheStatus, "miss");
    assert.equal(second.testRun.cacheStatus, "hit");
    assert.equal(commandCalls, 1);
    assert.equal(second.latestResult.cacheHit.resultId, first.latestResult.id);
    assert.equal(second.testRun.cacheIdentity.sourceHashSetHash, first.testRun.cacheIdentity.sourceHashSetHash);
    assert.equal(second.testRun.cacheIdentity.environmentIdentityHash, first.testRun.cacheIdentity.environmentIdentityHash);
    assert.equal(second.testRun.cacheIdentity.testRunnerVersion, "node-test:fixture-v1");
    assert.equal(second.testRun.cacheIdentity.dependencyGraphVersion, first.testRun.cacheIdentity.dependencyGraphVersion);
    assert.equal(world.project(moduleProjectors.latestTestResultsByGate).byGate[gateId].cacheStatus, "hit");

    await writeFile(path.join(process.cwd(), fixture.first), JSON.stringify({ value: 11 }, null, 2), "utf8");
    const third = await runCached({ id: "testRun.cache.third" });
    assert.equal(third.testRun.cacheStatus, "miss");
    assert.equal(commandCalls, 2);
    assert.notEqual(third.testRun.cacheIdentity.sourceHashSetHash, first.testRun.cacheIdentity.sourceHashSetHash);

    const fourth = await runCached({ id: "testRun.cache.fourth", runtimeProfile: "minimal" });
    assert.equal(fourth.testRun.cacheStatus, "miss");
    assert.equal(commandCalls, 3);
    assert.notEqual(fourth.testRun.cacheIdentity.environmentIdentityHash, third.testRun.cacheIdentity.environmentIdentityHash);

    const fifth = await runCached({ id: "testRun.cache.fifth", runnerVersion: "node-test:fixture-v2" });
    assert.equal(fifth.testRun.cacheStatus, "miss");
    assert.equal(commandCalls, 4);
    assert.equal(fifth.testRun.cacheIdentity.testRunnerVersion, "node-test:fixture-v2");
    assert.notEqual(fifth.testRun.cacheIdentity.testRunnerVersion, third.testRun.cacheIdentity.testRunnerVersion);

    const sixth = await runCached({
      id: "testRun.cache.sixth",
      gate: {
        ...baseGate,
        protectedObjects: ["plugin.platform", "route:GET /platform"]
      }
    });
    assert.equal(sixth.testRun.cacheStatus, "miss");
    assert.equal(commandCalls, 5);
    assert.notEqual(sixth.testRun.cacheIdentity.dependencyGraphVersion, third.testRun.cacheIdentity.dependencyGraphVersion);
  } finally {
    await removeTempPlatformApplyFixture(fixture.root);
  }
}));

test("platform test run cache keys include candidate snapshot hashes", async () => withRegisteredPluginProjectors(providers, async () => {
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

  const originalConsole = await readFile(new URL("./platform-console.rvm", import.meta.url), "utf8");
  const firstConsole = `${originalConsole}\n`;
  const secondConsole = `${originalConsole}\n\n`;
  assert.notEqual(firstConsole, secondConsole);

  await handlers["platform.changeSet.create"]({
    req: {
      body: {
        id: "changeset.test.cache.snapshot",
        branchId: "branch.test.cache.snapshot",
        title: "Snapshot cache proof"
      }
    },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  await handlers["platform.changeSet.edit"]({
    req: {
      body: {
        edits: [{ path: "plugins/platform/platform-console.rvm", content: firstConsole }]
      }
    },
    res: {},
    params: { id: "changeset.test.cache.snapshot" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  await handlers["platform.changeSet.validate"]({
    res: {},
    params: { id: "changeset.test.cache.snapshot" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });

  const snapshotOne = world.project(moduleProjectors.candidateSnapshotIndex).byChangeSet["changeset.test.cache.snapshot"]?.at(-1) ?? null;
  assert.ok(snapshotOne);

  let commandCalls = 0;
  const gate = {
    id: "gate:platform-cache-snapshot",
    title: "Platform cache snapshot gate",
    command: "node --test plugins/platform/platform.test.js",
    runner: "node-test",
    timeoutMs: 2100,
    sourceDependencies: ["plugins/platform/platform-console.rvm"],
    protectedObjects: ["plugin.platform"]
  };

  const firstRun = await runPlatformTestGate(world, {
    actor: "aaron",
    gate,
    id: "testRun.cache.snapshot.one",
    branchId: "branch.test.cache.snapshot",
    changeSetId: "changeset.test.cache.snapshot",
    candidateSnapshotId: snapshotOne.id,
    runtimeProfile: "full",
    resolveRunnerVersion: async () => "node-test:fixture-v1",
    runCommand: async () => {
      commandCalls += 1;
      return {
        startedAt: "2026-06-18T00:00:00.000Z",
        finishedAt: "2026-06-18T00:00:00.100Z",
        durationMs: 100,
        exitCode: 0,
        signal: null,
        status: "passed",
        stdout: `ok 1 - snapshot cache call ${commandCalls}`,
        stderr: "",
        timedOut: false,
        error: null
      };
    }
  });
  const secondRun = await runPlatformTestGate(world, {
    actor: "aaron",
    gate,
    id: "testRun.cache.snapshot.two",
    branchId: "branch.test.cache.snapshot",
    changeSetId: "changeset.test.cache.snapshot",
    candidateSnapshotId: snapshotOne.id,
    runtimeProfile: "full",
    resolveRunnerVersion: async () => "node-test:fixture-v1",
    runCommand: async () => {
      commandCalls += 1;
      return {
        startedAt: "2026-06-18T00:00:00.000Z",
        finishedAt: "2026-06-18T00:00:00.100Z",
        durationMs: 100,
        exitCode: 0,
        signal: null,
        status: "passed",
        stdout: `ok 1 - snapshot cache call ${commandCalls}`,
        stderr: "",
        timedOut: false,
        error: null
      };
    }
  });

  assert.equal(firstRun.testRun.cacheStatus, "miss");
  assert.equal(secondRun.testRun.cacheStatus, "hit");
  assert.equal(commandCalls, 1);

  await handlers["platform.changeSet.edit"]({
    req: {
      body: {
        edits: [{ path: "plugins/platform/platform-console.rvm", content: secondConsole }]
      }
    },
    res: {},
    params: { id: "changeset.test.cache.snapshot" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  await handlers["platform.changeSet.validate"]({
    res: {},
    params: { id: "changeset.test.cache.snapshot" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });

  const snapshotTwo = world.project(moduleProjectors.candidateSnapshotIndex).byChangeSet["changeset.test.cache.snapshot"]?.at(-1) ?? null;
  assert.ok(snapshotTwo);
  assert.notEqual(snapshotTwo.id, snapshotOne.id);

  const thirdRun = await runPlatformTestGate(world, {
    actor: "aaron",
    gate,
    id: "testRun.cache.snapshot.three",
    branchId: "branch.test.cache.snapshot",
    changeSetId: "changeset.test.cache.snapshot",
    candidateSnapshotId: snapshotTwo.id,
    runtimeProfile: "full",
    resolveRunnerVersion: async () => "node-test:fixture-v1",
    runCommand: async () => {
      commandCalls += 1;
      return {
        startedAt: "2026-06-18T00:00:00.000Z",
        finishedAt: "2026-06-18T00:00:00.100Z",
        durationMs: 100,
        exitCode: 0,
        signal: null,
        status: "passed",
        stdout: `ok 1 - snapshot cache call ${commandCalls}`,
        stderr: "",
        timedOut: false,
        error: null
      };
    }
  });

  assert.equal(thirdRun.testRun.cacheStatus, "miss");
  assert.equal(commandCalls, 2);
  assert.notEqual(thirdRun.testRun.cacheIdentity.candidateSnapshotHash, firstRun.testRun.cacheIdentity.candidateSnapshotHash);
}));

test("platform test run event stream publishes start and finish witnesses", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async req => req.body,
    authoringServices: {
      requireBootstrapActor: actor => actor ? { ok: true, actor } : { ok: false, status: 401, reason: "sign in" }
    },
    platformTestRunner: async () => ({
      startedAt: "2026-06-18T00:00:00.000Z",
      finishedAt: "2026-06-18T00:00:01.000Z",
      durationMs: 1000,
      exitCode: 0,
      signal: null,
      status: "passed",
      stdout: "ok",
      stderr: "",
      timedOut: false,
      error: null
    }),
    sendGateFailure: () => {},
    send: () => {},
    sendJson: () => {}
  });

  const req = new EventEmitter();
  const chunks = [];
  const res = {
    writeHead: () => {},
    write: chunk => chunks.push(String(chunk)),
    end: () => {}
  };

  await handlers["platform.testRun.events"]({
    req,
    res,
    appContext: { runtimeProfile: "full" }
  });

  await handlers["platform.testRun.create"]({
    req: { body: { id: "testRun.platform.events", gateId: "gate:plugins/platform/platform.test.js", branchId: "branch.platform.events" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: {
      runtimeProfile: "full",
      project: projector => world.project(projector)
    }
  });

  await new Promise(resolve => setTimeout(resolve, 250));
  req.emit("close");

  const output = chunks.join("");
  assert.match(output, /event: ready/);
  assert.match(output, /event: testRun/);
  assert.match(output, /"phase":"start"/);
  assert.match(output, /"phase":"finish"/);
  assert.match(output, /"runId":"testRun.platform.events"/);
  assert.match(output, /"status":"passed"/);
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
  assert.equal(sent.at(-1).body.branch.affectedSystemSummaries.some(row => row.system === "surface.platform"), true);
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
  assert.equal(sent.at(-1).body.changeSet.changedPaths.includes("plugins/platform/platform-console.rvm"), true);
  assert.equal(sent.at(-1).body.changeSet.affectedSystemSummaries.some(row => row.system === "surface.platform"), true);
  assert.equal(sent.at(-1).body.changeSet.telemetryImpactSummaries.some(row => row.id === "platform.self"), true);
  assert.equal(sent.at(-1).body.changeSet.docsFreshness.status, "stale");
  assert.equal(sent.at(-1).body.changeSet.docsFreshness.missingDocs.includes("docs/CAPABILITIES.md"), true);

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
  assert.match(html, /Red \/ Green/);
  assert.match(html, /Branch Red \/ Green/);
  assert.match(html, /Change Set Red \/ Green/);
  assert.match(html, /Test Gates/);
  assert.match(html, /Affected Test Gates By Branch/);
  assert.match(html, /Selected Test Gates By Branch/);
  assert.match(html, /Affected Test Gate Selections/);
  assert.match(html, /Selected Test Gates By Change Set/);
  assert.match(html, /Test Gate Index/);
  assert.match(html, /Protected Objects/);
  assert.match(html, /Selected Branches/);
  assert.match(html, /Test Runs/);
  assert.match(html, /Latest Test Results/);
  assert.match(html, /Test Suites/);
  assert.match(html, /Test Cases/);
  assert.match(html, /Live Test Run Events/);
  assert.match(html, /Run Test Gate/);
  assert.match(html, /Run Selected Gates/);
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
  assert.match(html, /Roadmap detail/);
  assert.match(html, /platform-roadmap-select/);
  assert.match(html, /platform-roadmap-detail-output/);
  assert.match(html, /\/api\/platform-model\?view=roadmap/);
  assert.match(html, />Derived</);
  assert.match(html, />Evidence</);
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
  assert.match(html, /platform-test-run-form/);
  assert.match(html, /platform-selected-test-run-form/);
  assert.match(html, /selected-test-run-status/);
  assert.match(html, /test-run-stream-status/);
  assert.match(html, /test-run-stream-log/);
  assert.match(html, /platform-branch-detail-select/);
  assert.match(html, /platform-branch-test-gates-summary/);
  assert.match(html, /platform-branch-red-green-status/);
  assert.match(html, /platform-branch-red-green-summary/);
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
  assert.match(html, /\/api\/platform-test-runs/);
  assert.match(html, /\/api\/platform-test-runs\/events/);
  assert.match(html, /\/api\/runtime\/backend-revisions\/events/);
  assert.match(html, /\/apply/);
  assert.match(html, /\/reject/);
  assert.match(html, /\/abandon/);
});
