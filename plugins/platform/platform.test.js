import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createWorld } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { approveProposal, bindContextName, createProposal, grantStewardship, moduleProjectors, updateCapability } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { compileRvmToDesirePlus } from "../../src/desire/index.js";
import { bundleId, capabilities, createHandlers, handlerCatalog, providers, routes, surfaces } from "./runtime.js";
import { buildPlatformCssDriftGap, buildPlatformModel, filterPlatformModel, parseRoadmapTasks, PLATFORM_LIFECYCLES, selectVerificationRequirementState } from "./platform-model.js";
import { renderPlatformPage, renderPlatformPageFragment, renderPlatformShellPage, sortRecordsForSurface } from "./platform-page.js";
import { readPlatformConsoleLayout } from "./platform-console-layout.js";
import { buildPlatformProposalCreateBody, platformProposalTemplates } from "./platform-proposals.js";
import { executePlatformProposalTarget } from "./platform-proposal-targets.js";
import { platformModuleProjectors } from "./projections.js";
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

async function runGitFixtureCommand(args, cwd) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.platform === "win32" ? "git.exe" : "git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", chunk => { stdout += chunk; });
    child.stderr?.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `git ${args.join(" ")} failed`));
    });
  });
}

async function createTempPlatformGitPushFixture() {
  const root = path.join(process.cwd(), "test", `.platform-git-push-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`);
  const repoRoot = path.join(root, "repo");
  const remoteRoot = path.join(root, "remote.git");
  const mirrorRoot = path.join(root, "mirror");
  await mkdir(repoRoot, { recursive: true });
  await mkdir(remoteRoot, { recursive: true });
  await runGitFixtureCommand(["init", "--initial-branch=main"], repoRoot);
  await runGitFixtureCommand(["config", "user.name", "Platform Test"], repoRoot);
  await runGitFixtureCommand(["config", "user.email", "platform@example.local"], repoRoot);
  const relativeFile = "fixture.json";
  const absoluteFile = path.join(repoRoot, relativeFile);
  await writeFile(absoluteFile, `${JSON.stringify({ version: 1 }, null, 2)}\n`, "utf8");
  await runGitFixtureCommand(["add", relativeFile], repoRoot);
  await runGitFixtureCommand(["commit", "-m", "initial"], repoRoot);
  await runGitFixtureCommand(["init", "--bare", "--initial-branch=main"], remoteRoot);
  await runGitFixtureCommand(["remote", "add", "origin", remoteRoot], repoRoot);
  await runGitFixtureCommand(["push", "-u", "origin", "main"], repoRoot);
  return {
    root,
    repoRoot,
    remoteRoot,
    mirrorRoot,
    stagedPath: path.relative(process.cwd(), absoluteFile).replaceAll("\\", "/")
  };
}

async function removeTempPlatformGitPushFixture(root) {
  await rm(root, { recursive: true, force: true });
}

async function stageAppliedPushBranch({
  handlers,
  branchId,
  changeSetId,
  stagedPath,
  content
}) {
  await handlers["platform.branch.create"]({
    req: { body: { id: branchId, title: branchId } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  await handlers["platform.changeSet.create"]({
    req: { body: { id: changeSetId, branchId } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });
  await handlers["platform.changeSet.edit"]({
    req: {
      body: {
        edits: [{ path: stagedPath, content }]
      }
    },
    res: {},
    params: { id: changeSetId },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
  await handlers["platform.changeSet.apply"]({
    req: { body: {} },
    res: {},
    params: { id: changeSetId },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("platform plugin exposes platform bundle ownership", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));

  assert.equal(manifest.id, "plugin.platform");
  assert.equal(bundleId, "bundle-platform");
  assert.deepEqual(capabilities, ["platform.self"]);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.page.read"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.model.read"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.gaps.read"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.branch.list"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.branch.read"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.branch.create"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.branch.push"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.branch.ship"), true);
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
  assert.equal(handlerCatalog.dispatchHandlers.includes("platform.artifact.content"), true);
  assert.equal(handlerCatalog.pageHandlers.includes("page.platform"), true);
  assert.equal(routes.some(route => route.path === "/platform" && route.handler === "page.platform"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-page" && route.handler === "platform.page.read"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-model" && route.handler === "platform.model.read"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-branches" && route.handler === "platform.branch.list"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-branches" && route.handler === "platform.branch.create"), true);
  assert.equal(routes.some(route => route.handler === "platform.branch.read"), true);
  assert.equal(routes.some(route => route.handler === "platform.branch.push"), true);
  assert.equal(routes.some(route => route.handler === "platform.branch.ship"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-change-sets" && route.handler === "platform.changeSet.list"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-change-sets" && route.handler === "platform.changeSet.create"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.read"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.edit"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.removeEdit"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.validate"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.apply"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.reject"), true);
  assert.equal(routes.some(route => route.handler === "platform.changeSet.abandon"), true);
  assert.equal(routes.some(route => route.handler === "platform.artifact.content"), true);
  assert.equal(routes.some(route => route.path === "/api/platform-proposals" && route.handler === "platform.proposal.create"), true);
  assert.equal(routes.some(route => route.handler === "platform.proposal.approve"), true);
  assert.equal(surfaces.some(surface => surface.id === "surface:platform" && surface.href === "/platform"), true);
  assert.equal(providers.some(provider => provider.kind === "moduleProjectors" && provider.id === "platform.projections"), true);
  assert.equal(providers.some(provider => provider.kind === "providerRuntimeFactory" && provider.id === "platform.testMonitor"), true);
});

test("platform runtime declares every change-set route with owned handler metadata", () => {
  const expectedRoutes = [
    { method: "GET", path: "/api/platform-page", handler: "platform.page.read" },
    { method: "POST", handler: "platform.branch.push", pattern: /^\/api\/platform-branches\/([^/]+)\/push$/, paramNames: ["id"] },
    { method: "POST", handler: "platform.branch.ship", pattern: /^\/api\/platform-branches\/([^/]+)\/ship$/, paramNames: ["id"] },
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
    { method: "GET", handler: "platform.testRun.read", pattern: /^\/api\/platform-test-runs\/([^/]+)$/, paramNames: ["id"] },
    { method: "GET", handler: "platform.artifact.content", pattern: /^\/api\/platform-artifacts\/([^/]+)\/content$/, paramNames: ["id"] }
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
      routes: [
        { method: "GET", matcher: "/platform", handler: "page.platform" },
        { method: "POST", matcher: "/api/platform-change-sets/demo/apply", handler: "platform.changeSet.apply" }
      ],
      surfaces: [{ id: "surface:platform", href: "/platform" }],
    plugins: {
      activePluginIds: ["plugin.platform"],
      effectivePluginIds: ["plugin.platform"],
      rejectedPlugins: []
    },
      composition: {
        storyId: "authored-runner-driven",
        startupMode: "serve",
        activeRunnerId: "server_runner",
        activeRunnerSource: "authored-server-runner",
        activePluginSource: "authored-runtime-plugin-installs",
        usesAuthoredServerRunner: true,
        usesAuthoredRuntimePluginInstalls: true,
        explanation: "Runtime is running in serve mode from authored runner server_runner; plugin activation source is authored-runtime-plugin-installs.",
        notes: ["Authored runtimePluginInstall rows participate in the active runtime plugin composition."]
      },
      testMonitor: {
        enabled: true,
        watchFs: true,
        maxAutoRunsPerCycle: 6,
        watchDebounceMs: 150,
        status: "queued",
        processing: false,
        pendingSourcePaths: ["plugins/platform/platform-page.js"],
        pendingSourceCount: 1,
        pendingChangeSets: [{
          branchId: "branch.platform",
          changeSetId: "changeSet:platform",
          candidateSnapshotId: "candidateSnapshot:platform:1"
        }],
        pendingChangeSetCount: 1
      },
      proposalTargetGovernance: [{
        id: "governanceProposalTarget:runtimePlugin.install",
        targetProcess: "runtimePlugin.install",
        operationSemantics: "governed-mutation",
        governanceMode: "proposal-fallback",
        authorityMechanism: "bootstrap-target-authority",
        sharedAuthorityPath: true,
        workflowRole: "proposal-target",
        bootstrapSelectable: true,
        notes: "Runtime-plugin install proposals execute through shared server-runner target authority once approved."
      }]
    },
    project: () => []
  });

  assert.deepEqual(model.lifecycleVocabulary, PLATFORM_LIFECYCLES);
  assert.equal(Array.isArray(model.lifecycleBoard), true);
  assert.equal(model.lifecycleBoard.every(lane => Array.isArray(lane.nodes) && typeof lane.countLabel === "string"), true);
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
  assert.equal(model.nodes.some(node => node.id === "compatibilityBridge:canonicalIdSugar.sameContextVisibleTarget" && node.kind === "compatibilityBridge"), true);
  assert.equal(model.nodes.some(node => node.id === "governanceRoute:POST /api/platform-change-sets/demo/apply" && node.kind === "governanceRoute"), true);
  assert.equal(model.nodes.some(node => node.id === "governanceProposalTarget:runtimePlugin.install" && node.kind === "governanceCommand"), true);
  assert.equal(model.nodes.some(node => node.id === "mutableSurface:canvas.perspective" && node.kind === "mutableSurface"), true);
  assert.equal(model.nodes.some(node => node.id === "testEnvironment:local-node" && node.kind === "testEnvironment"), true);
  assert.equal(model.nodes.some(node => node.id === "testEnvironment:local-browser" && node.kind === "testEnvironment"), true);
  assert.equal(model.edges.some(edge => edge.from === "surface:platform" && edge.rel === "authoredBy" && edge.to === "rvm:plugins/platform/platform-console.rvm"), true);
  assert.equal(model.edges.some(edge => edge.from === "surface:platform" && edge.rel === "styledBy" && edge.to === "wcss:plugins/platform/platform-console.wcss"), true);
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
  assert.equal(model.testMonitorDiagnostics?.status, "queued");
  assert.equal(model.testMonitorDiagnostics?.pendingSourceCount, 1);
  assert.equal(model.testMonitorDiagnostics?.pendingChangeSetCount, 1);
  assert.equal(model.runtimeComposition?.storyId, "authored-runner-driven");
  assert.equal(model.runtimeComposition?.activeRunnerSource, "authored-server-runner");
  assert.equal(model.runtimeComposition?.activePluginSource, "authored-runtime-plugin-installs");
  const activeProfile = model.profiles.find(row => row.id === "full");
  assert.equal(activeProfile?.status, "active");
  assert.equal(activeProfile?.runnerSummary, "server_runner (authored-server-runner)");
  assert.match(activeProfile?.compositionSummary ?? "", /authored runner server_runner/);
  assert.equal(model.compatibilityBridges.some(row => row.id === "compatibilityBridge:canonicalIdSugar.importedVisibleTarget" && row.status === "policy"), true);
  assert.equal(model.governanceRoutes.some(row =>
    row.handler === "platform.changeSet.apply"
    && row.governanceMode === "direct-authority"
    && row.authorityMechanism === "platform-policy:platform.execute.operator"
  ), true);
  assert.equal(model.proposalTargetGovernance.some(row => row.targetProcess === "runtimePlugin.install" && row.governanceMode === "proposal-fallback"), true);
  assert.equal(model.mutableSurfaceSemantics.some(row => row.id === "mutableSurface:demo.privateNotes" && row.sharingClass === "personal" && row.stateClass === "actor-scoped"), true);
  assert.equal(model.mutableSurfaceSemantics.some(row => row.id === "mutableSurface:canvas.perspective" && row.sharingClass === "mixed"), true);
  assert.equal(model.roadmapTasks.some(task => task.doc === "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"), true);
});

test("platform package coexistence view surfaces divergent revisions as first-class review objects", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[package]]
actor = "system"
id = "package.plugin.inspect"
label = "Inspect"
packageKind = "plugin"

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v1"
package = "package.plugin.inspect"
version = "0.1.0"
status = "published"
manifest = { pluginId = "plugin.inspect" }

[[packageRevision]]
actor = "system"
id = "packageRevision.plugin.inspect.v2"
package = "package.plugin.inspect"
version = "0.2.0"
status = "review"
manifest = { pluginId = "plugin.inspect" }

[[packageNamespace]]
actor = "system"
context = "ctx.alpha"
name = "inspectA"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageNamespace]]
actor = "system"
context = "ctx.beta"
name = "inspectB"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"

[[packageTransformer]]
actor = "system"
id = "packageTransformer.inspect.v1-to-v2"
package = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
targetRevision = "packageRevision.plugin.inspect.v2"
remainingGlue = ["rename remaining runtimePlugin installs"]

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"
transformer = "packageTransformer.inspect.v1-to-v2"
path = "plugins/inspect/runtime.js"
operation = "replace"
sourceLanguage = "js"
body = { export = "migrated" }
`);

  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: [],
      routes: [],
      surfaces: [],
      plugins: {
        activePluginIds: [],
        effectivePluginIds: [],
        rejectedPlugins: []
      }
    },
    project: projector => world.project(projector)
  });

  assert.equal(model.nodes.some(node => node.id === "packageCoexistence:package.plugin.inspect" && node.kind === "packageCoexistence"), true);
  assert.equal(model.nodes.some(node => node.id === "package.plugin.inspect" && node.kind === "package"), true);
  assert.equal(model.nodes.some(node => node.id === "packageRevision.plugin.inspect.v1" && node.kind === "packageRevision"), true);
  assert.equal(model.nodes.some(node => node.id === "packageNamespace:ctx.alpha:inspectA" && node.kind === "packageNamespace"), true);
  assert.equal(model.nodes.some(node => node.id === "packageTransformer.inspect.v1-to-v2" && node.kind === "packageTransformer"), true);
  assert.equal(model.nodes.some(node => node.id === "packageApplyPreview:packageRevision.plugin.inspect.v2" && node.kind === "packageApplyPreview"), true);

  const packageView = filterPlatformModel(model, "packageCoexistence", "package.plugin.inspect");
  assert.equal(packageView.packageCoexistence.length, 1);
  assert.equal(packageView.packageCoexistence[0].coexistenceMode, "coexisting");
  assert.deepEqual(packageView.packageCoexistence[0].selectedRevisionIds, [
    "packageRevision.plugin.inspect.v1",
    "packageRevision.plugin.inspect.v2"
  ]);

  const revisionView = filterPlatformModel(model, "packageCoexistence", "packageRevision.plugin.inspect.v2");
  assert.equal(revisionView.packageCoexistence.length, 1);
  assert.equal(revisionView.packageCoexistence[0].packageId, "package.plugin.inspect");

  const convergenceView = filterPlatformModel(model, "packageConvergence", "package.plugin.inspect");
  assert.equal(convergenceView.packageConvergence.length, 1);
  assert.equal(convergenceView.packageConvergence[0].status, "glue-required");
  assert.deepEqual(convergenceView.packageConvergence[0].transformerIds, ["packageTransformer.inspect.v1-to-v2"]);

  const applyPreviewView = filterPlatformModel(model, "packageApplyPreview", "packageRevision.plugin.inspect.v2");
  assert.equal(applyPreviewView.packageApplyPreviews.length, 1);
  assert.equal(applyPreviewView.packageApplyPreviews[0].status, "glue-required");
  assert.deepEqual(applyPreviewView.packageApplyPreviews[0].relatedTransformerIds, ["packageTransformer.inspect.v1-to-v2"]);
});

test("platform model surfaces capability revision history as a first-class review slice", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[capability]]
actor = "system"
id = "notes.sidebar"
label = "Notes Sidebar"
version = "1.0.0"
placement = ["context"]
`);
  updateCapability(world, {
    actor: "system",
    id: "notes.sidebar",
    label: "Notes Sidebar",
    version: "2.0.0",
    placement: ["context", "serverRunner"],
    previousDefinition: world.project(moduleProjectors.capabilityIndex).byId["notes.sidebar"],
    previousVersion: "1.0.0"
  });

  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: [],
      routes: [],
      surfaces: [],
      plugins: {
        activePluginIds: [],
        effectivePluginIds: [],
        rejectedPlugins: []
      }
    },
    project: projector => world.project(projector)
  });

  assert.equal(model.nodes.some(node =>
    node.id.startsWith("capabilityRevision:notes.sidebar:")
    && node.kind === "capabilityRevision"
  ), true);
  const historyView = filterPlatformModel(model, "capabilityRevisionHistory", "notes.sidebar");
  assert.deepEqual(historyView.capabilityRevisionHistory.map(row => row.action), ["define", "update"]);
  assert.equal(historyView.capabilityRevisionHistory[1].previousVersion, "1.0.0");
});

test("platform context naming view surfaces resolution and visibility explanations", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[context]]
actor = "system"
id = "ctx.hidden"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx.source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[serverRunner]]
actor = "system"
id = "hidden_server"
context = "ctx.hidden"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[serverRunner]]
actor = "system"
id = "local_server"
context = "ctx.target"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "sourceRunner"
target = "source_server"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "sourceRunner"
name = "importedRunner"
`);
  bindContextName(world, {
    actor: "system",
    context: "ctx.target",
    name: "importedRunner",
    target: "local_server"
  });

  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [],
      providedCapabilities: [],
      routes: [],
      surfaces: [],
      plugins: {
        activePluginIds: [],
        effectivePluginIds: [],
        rejectedPlugins: []
      }
    },
    project: projector => world.project(projector)
  });

  const contextView = filterPlatformModel(model, "contextNaming", null, {
    context: "ctx.target",
    name: "importedRunner",
    target: "hidden_server"
  });
  assert.deepEqual(contextView.contextNaming.canonicalIdPolicyClasses, [
    "same-context-convenience",
    "imported-target-reference",
    "legacy-only-path"
  ]);
  assert.equal(contextView.contextNaming.contextScopes.some(row =>
    row.context === "ctx.target"
    && row.name === "importedRunner"
    && row.target === "source_server"
    && row.sourceKind === "import"
  ), true);
  assert.equal(contextView.contextNaming.contextNameConflicts.length, 1);
  assert.equal(contextView.contextNaming.nameExplanation.ok, false);
  assert.equal(contextView.contextNaming.nameExplanation.resolution, "ambiguous");
  assert.equal(contextView.contextNaming.canonicalIdPolicy.ok, false);
  assert.equal(contextView.contextNaming.targetVisibility.ok, false);
  assert.equal(contextView.contextNaming.targetVisibility.visibility, "hidden");
});

test("platform model emits a gap when a platform surface lacks modeled RVM or WCSS source", async () => {
  const model = await buildPlatformModel({
    diagnostics: {
      activeProfile: "full",
      activeBundles: [{ id: "bundle-platform", displayName: "Platform Self Model" }],
      providedCapabilities: ["platform.self"],
      routes: [],
      surfaces: [
        { id: "surface:platform", href: "/platform" },
        { id: "surface:platform-secondary", href: "/platform/secondary" }
      ],
      plugins: {
        activePluginIds: ["plugin.platform"],
        effectivePluginIds: ["plugin.platform"],
        rejectedPlugins: []
      }
    },
    project: () => []
  });

  const missingSourceGap = model.gaps.find(gap => gap.id === "gap.platform-sources.surface:platform-secondary");
  assert.ok(missingSourceGap);
  assert.equal(missingSourceGap.kind, "missing-platform-source");
  assert.deepEqual(missingSourceGap.missingSourceKinds, ["rvmSource", "wcssSource"]);
  assert.equal(model.gaps.some(gap => gap.id === "gap.platform-sources.surface:platform"), false);
});

test("platform model does not emit a live gap when generated console CSS matches authored WCSS", async () => {
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

  assert.equal(model.gaps.some(gap => gap.id === "gap.platform-css-drift.surface:platform"), false);
});

test("platform css drift helper reports missing and extra selectors when generated CSS diverges from authored WCSS", () => {
  const gap = buildPlatformCssDriftGap({
    authoredWcss: `theme platform-console

styles
  style one
    selector = .alpha
    base
      color = red
  style two
    selector = .beta
    base
      color = blue
`,
    generatedCss: `.alpha { color: red; }\n.gamma { color: green; }`
  });

  assert.ok(gap);
  assert.equal(gap.kind, "platform-css-drift");
  assert.equal(gap.target, "surface:platform");
  assert.deepEqual(gap.missingInGenerated, [".beta"]);
  assert.deepEqual(gap.extraInGenerated, [".gamma"]);
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
  assert.equal(page?.semantic.props?.title, "Platform Console");
  assert.equal(page?.semantic.props?.summary, "RVM-authored platform pages for overview, workflow, verification, telemetry, defects, security, artifacts, sessions, knowledge, signals compatibility, model inspection, and supplemental governance/model seams.");
  assert.equal(page?.semantic.children.includes("PlatformWorkflowPage"), true);
  assert.equal(createCommand?.semantic.route, "/api/platform-proposals");
  assert.match(css, /Generated from plugins\/platform\/platform-console\.wcss/);
  assert.match(css, /body\.platform-console/);
  assert.match(css, /--platform-accent: #1f6feb;/);
  assert.match(css, /#selected-test-run-status/);
  assert.match(css, /@media \(max-width: 880px\)/);
});

test("platform console layout compiles authored top-level surface metadata from RVM", () => {
  const layout = readPlatformConsoleLayout();

  assert.equal(layout.error, null);
  assert.equal(layout.page.title, "Platform Console");
  assert.equal(layout.page.identity, "surface:platform");
  assert.deepEqual(layout.page.children, [
    "PlatformOverviewPage",
    "PlatformWorkflowPage",
    "PlatformWorkflowBranchesPage",
    "PlatformWorkflowChangeSetsPage",
    "PlatformWorkflowPushesPage",
    "PlatformWorkflowShipsPage",
    "PlatformWorkflowProposalsPage",
    "PlatformVerificationPage",
    "PlatformVerificationStatusPage",
    "PlatformVerificationRunsPage",
    "PlatformVerificationRuntimePage",
    "PlatformTelemetryPage",
    "PlatformDefectsPage",
    "PlatformSecurityPage",
    "PlatformArtifactsPage",
    "PlatformSessionsPage",
    "PlatformKnowledgePage",
    "PlatformKnowledgeDocsPage",
    "PlatformKnowledgeFoldersPage",
    "PlatformKnowledgeRoadmapPage",
    "PlatformSignalsPage",
    "PlatformSignalsGapsPage",
    "PlatformSignalsCatalogPage",
    "PlatformModelPage",
    "PlatformModelObjectsPage",
    "PlatformModelProfilesPage",
    "PlatformModelCoveragePage",
    "PlatformBridgesPage",
    "PlatformGovernancePage",
    "PlatformSemanticsPage",
    "PlatformPackageCoexistencePage",
    "PlatformPackageConvergencePage",
    "PlatformPackageApplyPreviewPage"
  ]);
  const overviewPage = layout.children.find(surface => surface.name === "PlatformOverviewPage");
  const workflowPage = layout.children.find(surface => surface.name === "PlatformWorkflowPage");
  const workflowBranchesPage = layout.children.find(surface => surface.name === "PlatformWorkflowBranchesPage");
  const workflowChangeSetsPage = layout.children.find(surface => surface.name === "PlatformWorkflowChangeSetsPage");
  const workflowProposalsPage = layout.children.find(surface => surface.name === "PlatformWorkflowProposalsPage");
  const verificationPage = layout.children.find(surface => surface.name === "PlatformVerificationPage");
  const verificationStatusPage = layout.children.find(surface => surface.name === "PlatformVerificationStatusPage");
  const verificationRunsPage = layout.children.find(surface => surface.name === "PlatformVerificationRunsPage");
  const verificationRuntimePage = layout.children.find(surface => surface.name === "PlatformVerificationRuntimePage");
  const telemetryPage = layout.children.find(surface => surface.name === "PlatformTelemetryPage");
  const defectsPage = layout.children.find(surface => surface.name === "PlatformDefectsPage");
  const artifactsPage = layout.children.find(surface => surface.name === "PlatformArtifactsPage");
  const sessionsPage = layout.children.find(surface => surface.name === "PlatformSessionsPage");
  const knowledgePage = layout.children.find(surface => surface.name === "PlatformKnowledgePage");
  const knowledgeDocsPage = layout.children.find(surface => surface.name === "PlatformKnowledgeDocsPage");
  const knowledgeFoldersPage = layout.children.find(surface => surface.name === "PlatformKnowledgeFoldersPage");
  const knowledgeRoadmapPage = layout.children.find(surface => surface.name === "PlatformKnowledgeRoadmapPage");
  const signalsPage = layout.children.find(surface => surface.name === "PlatformSignalsPage");
  const signalsGapsPage = layout.children.find(surface => surface.name === "PlatformSignalsGapsPage");
  const signalsCatalogPage = layout.children.find(surface => surface.name === "PlatformSignalsCatalogPage");
  const bridgesPage = layout.children.find(surface => surface.name === "PlatformBridgesPage");
  const modelPage = layout.children.find(surface => surface.name === "PlatformModelPage");
  const modelObjectsPage = layout.children.find(surface => surface.name === "PlatformModelObjectsPage");
  const modelProfilesPage = layout.children.find(surface => surface.name === "PlatformModelProfilesPage");
  const modelCoveragePage = layout.children.find(surface => surface.name === "PlatformModelCoveragePage");
  const governancePage = layout.children.find(surface => surface.name === "PlatformGovernancePage");
  const semanticsPage = layout.children.find(surface => surface.name === "PlatformSemanticsPage");
  const packageCoexistencePage = layout.children.find(surface => surface.name === "PlatformPackageCoexistencePage");
  const packageConvergencePage = layout.children.find(surface => surface.name === "PlatformPackageConvergencePage");
  const packageApplyPreviewPage = layout.children.find(surface => surface.name === "PlatformPackageApplyPreviewPage");
  assert.ok(overviewPage);
  assert.equal(overviewPage.pageId, "overview");
  assert.equal(overviewPage.props.modelView, "overview");
  assert.match(overviewPage.props.summaryCards, /Plugins=nodes@countKind:plugin/);
  assert.deepEqual(overviewPage.children, [
    "PlatformConsoleSummary",
    "PlatformAuthoredSurfaceTree",
    "PlatformLifecycleBoard",
    "PlatformMap",
    "PlatformProfileComparison"
  ]);
  assert.ok(workflowPage);
  assert.equal(workflowPage.pageId, "workflow");
  assert.equal(workflowPage.props.modelView, "workflowOverview");
  assert.match(workflowPage.props.summaryCards, /Open Proposals=proposals@countWhere:status=open/);
  assert.deepEqual(workflowPage.children, [
    "PlatformBranchBoard"
  ]);
  assert.ok(workflowBranchesPage);
  assert.equal(workflowBranchesPage.pageId, "workflowBranches");
  assert.equal(workflowBranchesPage.props.modelView, "workflowBranches");
  assert.match(workflowBranchesPage.props.summaryCards, /Candidate Snapshots=candidateSnapshots@count/);
  assert.deepEqual(workflowBranchesPage.children, [
    "PlatformBranchBoard",
    "PlatformWorkflowBranchesList",
    "PlatformWorkflowDetail",
    "PlatformBranchCreatePanel"
  ]);
  assert.ok(workflowChangeSetsPage);
  assert.equal(workflowChangeSetsPage.pageId, "workflowChangeSets");
  assert.equal(workflowChangeSetsPage.props.modelView, "workflowChangeSets");
  assert.match(workflowChangeSetsPage.props.summaryCards, /Validated=changeSets@countWhere:status=validated/);
  assert.deepEqual(workflowChangeSetsPage.children, [
    "PlatformWorkflowChangeSetsList",
    "PlatformWorkflowDetail",
    "PlatformChangeSetCreatePanel",
    "PlatformChangeSetEditPanel",
    "PlatformChangeSetValidatePanel",
    "PlatformChangeSetApplyPanel",
    "PlatformChangeSetLifecyclePanel"
  ]);
  assert.ok(workflowProposalsPage);
  assert.equal(workflowProposalsPage.pageId, "workflowProposals");
  assert.equal(workflowProposalsPage.props.modelView, "workflowProposals");
  assert.match(workflowProposalsPage.props.summaryCards, /Open Proposals=proposals@countWhere:status=open/);
  assert.deepEqual(workflowPage.children, [
    "PlatformBranchBoard"
  ]);
  assert.deepEqual(workflowProposalsPage.children, [
    "PlatformWorkflowProposalsList",
    "PlatformWorkflowDetail",
    "PlatformProposalPanel",
    "PlatformProposalReviewList"
  ]);
  const workflowDetailSurface = workflowBranchesPage.childSurfaces.find(surface => surface.name === "PlatformWorkflowDetail");
  assert.ok(workflowDetailSurface);
  assert.equal(workflowDetailSurface.props.detailSource, "workflow");
  assert.equal(workflowDetailSurface.props.detailSelectionSources, "branches|changeSets|proposals");
  assert.equal(workflowDetailSurface.props.branchIdPrefixes, "branch:");
  assert.equal(workflowDetailSurface.props.changeSetIdPrefixes, "changeSet:|changeset.");
  assert.equal(workflowDetailSurface.props.proposalIdPrefixes, "proposal:");
  assert.equal(workflowDetailSurface.props.emptyTitle, "Detail");
  assert.equal(workflowDetailSurface.props.emptyState, "No workflow rows are projected yet.");
  assert.deepEqual(workflowDetailSurface.children, [
    "PlatformWorkflowPrimaryPanel",
    "PlatformWorkflowRelatedPanel",
    "PlatformVerificationRequirementSummary",
    "PlatformVerificationRequirementsTable",
    "PlatformVerificationBlockingReasons",
    "PlatformWorkflowSnapshotHistory",
    "PlatformWorkflowEditHistory"
  ]);
  assert.deepEqual(workflowDetailSurface.childSurfaces.map(surface => surface.props.detailPanelRole || null), [
    "primary",
    "related",
    "verificationRequirementSummary",
    "verificationRequirements",
    "verificationBlockingReasons",
    "snapshotHistory",
    "editHistory"
  ]);
  assert.deepEqual(workflowDetailSurface.childSurfaces.map(surface => surface.props.detailKinds || null), [
    "branch|changeSet|proposal",
    "branch|changeSet|proposal",
    "changeSet|candidateSnapshot",
    "changeSet|candidateSnapshot",
    "changeSet|candidateSnapshot",
    "branch|changeSet",
    "changeSet"
  ]);
  assert.equal(workflowDetailSurface.childSurfaces.some(surface => surface.name === "PlatformWorkflowSnapshotHistory" && surface.summary === "Candidate snapshot history for the selected workflow object when available."), true);
  const workflowSnapshotSurface = workflowDetailSurface.childSurfaces.find(surface => surface.name === "PlatformWorkflowSnapshotHistory");
  assert.ok(workflowSnapshotSurface);
  assert.equal(workflowSnapshotSurface.props.columns, "Status|Snapshot|Revision|Change Set|Errors");
  assert.equal(workflowSnapshotSurface.props.rowFields, "Status=status|Snapshot=id@concept|Revision=revision|Change Set=changeSetId@concept|Errors=errorCount");
  assert.equal(workflowSnapshotSurface.props.changeSetEmptyState, "No candidate snapshots for this change set.");
  assert.equal(workflowSnapshotSurface.props.rowLimit, "12");
  const workflowEditSurface = workflowDetailSurface.childSurfaces.find(surface => surface.name === "PlatformWorkflowEditHistory");
  assert.ok(workflowEditSurface);
  assert.equal(workflowEditSurface.props.rowFields, "Path=path|Language=sourceLanguage|Previous Hash=previousHashShort|Next Hash=nextHashShort");
  const workflowRequirementSummarySurface = workflowDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationRequirementSummary");
  assert.ok(workflowRequirementSummarySurface);
  assert.equal(workflowRequirementSummarySurface.props.detailKinds, "changeSet|candidateSnapshot");
  assert.match(workflowRequirementSummarySurface.props.propertyFields, /Blocking status=blockingStatus/);
  const workflowRequirementsSurface = workflowDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationRequirementsTable");
  assert.ok(workflowRequirementsSurface);
  assert.equal(workflowRequirementsSurface.props.columns, "Status|Blocking|Gate|Execution Class|Freshness|Regression|Latest Run|Latest Passed");
  const workflowBlockingSurface = workflowDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationBlockingReasons");
  assert.ok(workflowBlockingSurface);
  assert.equal(workflowBlockingSurface.props.emptyState, "No blocking verification requirements.");
  const workflowPrimarySurface = workflowDetailSurface.childSurfaces.find(surface => surface.name === "PlatformWorkflowPrimaryPanel");
  assert.ok(workflowPrimarySurface);
  assert.equal(workflowPrimarySurface.props.longTailCardTitle, "Properties");
  assert.equal(workflowPrimarySurface.props.longTailValueKinds, "string|number|boolean|scalarList");
  assert.equal(workflowPrimarySurface.props.branchLongTailExcludedFields, "changeSetIds|pushRecordIds|shipRecordIds|affectedSystemSummaries|telemetryImpactSummaries");
  assert.equal(workflowPrimarySurface.props.changeSetLongTailExcludedFields, "changedPaths");
  assert.equal(workflowPrimarySurface.props.branchCardTitle, "Branch Detail");
  assert.match(workflowPrimarySurface.props.branchFields, /Branch=id@concept/);
  assert.match(workflowPrimarySurface.props.changeSetFields, /Change set=id@concept/);
  assert.match(workflowPrimarySurface.props.proposalFields, /Target process=targetProcess/);
  const workflowRelatedSurface = workflowDetailSurface.childSurfaces.find(surface => surface.name === "PlatformWorkflowRelatedPanel");
  assert.ok(workflowRelatedSurface);
  assert.equal(workflowRelatedSurface.props.cardItemLimit, "12");
  assert.equal(workflowRelatedSurface.props.branchLinkCards, "Change Sets=changeSetIds|Push Records=pushRecordIds|Ship Records=shipRecordIds");
  assert.equal(workflowRelatedSurface.props.branchLinkCardEmptyStates, "Change Sets=No change sets linked to this branch.|Push Records=No push records linked to this branch.|Ship Records=No ship records linked to this branch.");
  assert.equal(workflowRelatedSurface.props.branchTextCards, "Affected Systems=affectedSystemSummaries@label|Telemetry Impacts=telemetryImpactSummaries@label");
  assert.equal(workflowRelatedSurface.props.branchTextCardEmptyStates, "Affected Systems=No affected system summaries.|Telemetry Impacts=No telemetry impact summaries.");
  assert.equal(workflowRelatedSurface.props.changeSetLinkCards, "Changed Paths=changedPaths");
  assert.equal(workflowRelatedSurface.props.changeSetLinkCardEmptyStates, "Changed Paths=No changed paths staged for this change set.");
  assert.equal(workflowRelatedSurface.props.proposalLinkCards, "Target Resource=targetId");
  assert.equal(workflowRelatedSurface.props.proposalLinkCardEmptyStates, "Target Resource=No linked target resource.");
  const workflowBranchesListSurface = workflowBranchesPage.childSurfaces.find(surface => surface.name === "PlatformWorkflowBranchesList");
  assert.ok(workflowBranchesListSurface);
  assert.equal(workflowBranchesListSurface.props.listSource, "workflowItems");
  assert.equal(workflowBranchesListSurface.props.columns, "Kind|Status|Resource|Scope|Summary");
  assert.equal(workflowBranchesListSurface.props.emptyState, "No branches.");
  assert.equal(workflowBranchesListSurface.props.pageSize, "20");
  const workflowChangeSetsListSurface = workflowChangeSetsPage.childSurfaces.find(surface => surface.name === "PlatformWorkflowChangeSetsList");
  assert.ok(workflowChangeSetsListSurface);
  assert.equal(workflowChangeSetsListSurface.props.listSource, "workflowItems");
  assert.equal(workflowChangeSetsListSurface.props.emptyState, "No change sets.");
  const workflowProposalsListSurface = workflowProposalsPage.childSurfaces.find(surface => surface.name === "PlatformWorkflowProposalsList");
  assert.ok(workflowProposalsListSurface);
  assert.equal(workflowProposalsListSurface.props.listSource, "workflowItems");
  assert.equal(workflowProposalsListSurface.props.emptyState, "No proposals.");
  const overviewMapSurface = overviewPage.childSurfaces.find(surface => surface.name === "PlatformMap");
  assert.ok(overviewMapSurface);
  assert.equal(overviewMapSurface.props.listSource, "platformMapRows");
  assert.equal(overviewMapSurface.props.rowFields, "Kind=kind|Resource=id@concept|Lifecycle=lifecycleText|Status=status|Source=source");
  assert.equal(overviewMapSurface.props.sortOptions, "kind=kind|resource=id|lifecycle=lifecycleText|status=status|source=source");
  assert.equal(overviewMapSurface.props.defaultSort, "kind:asc");
  assert.equal(overviewMapSurface.props.pageSize, "12");
  const surfaceTreeSurface = overviewPage.childSurfaces.find(surface => surface.name === "PlatformAuthoredSurfaceTree");
  assert.ok(surfaceTreeSurface);
  assert.equal(surfaceTreeSurface.props.surfaceFields, "View=pageId||name|Kind=surfaceKind|Class=className|Process=processRoute|Projection=projectionRoutesText|Summary=summary|Sections=sectionTitles");
  const lifecycleBoardSurface = overviewPage.childSurfaces.find(surface => surface.name === "PlatformLifecycleBoard");
  assert.ok(lifecycleBoardSurface);
  assert.equal(lifecycleBoardSurface.props.boardSource, "lifecycleBoard");
  assert.equal(lifecycleBoardSurface.props.laneMetaFields, "Count=countLabel");
  assert.equal(lifecycleBoardSurface.props.itemTitlePath, "titleLink");
  assert.equal(lifecycleBoardSurface.props.itemFields, "Kind=kind");
  const branchBoardSurface = workflowPage.childSurfaces.find(surface => surface.name === "PlatformBranchBoard");
  assert.ok(branchBoardSurface);
  assert.equal(branchBoardSurface.props.boardSource, "branchBoard");
  assert.equal(branchBoardSurface.props.laneMetaFields, "Count=countLabel");
  assert.equal(branchBoardSurface.props.itemTitlePath, "titleLink");
  assert.equal(branchBoardSurface.props.itemFields, "Status=status|Activity=activitySummary|Latest Candidate Snapshot=latestCandidateSnapshotId@concept");
  const proposalPanelSurface = workflowProposalsPage.childSurfaces.find(surface => surface.name === "PlatformProposalPanel");
  assert.ok(proposalPanelSurface);
  assert.equal(proposalPanelSurface.processRoute, "/api/platform-proposals");
  assert.equal(proposalPanelSurface.props.formId, "platform-proposal-form");
  assert.equal(proposalPanelSurface.props.clientAction, "proposal.create");
  assert.equal(proposalPanelSurface.props.formFields, "Action=action@select:proposalActionOptions|Proposal id=id@text|Target kind override=targetKind@text|Target id override=targetId@text|Reason=reason@text|Body JSON=bodyJson@textarea");
  assert.equal(proposalPanelSurface.props.submitPath, "/api/platform-proposals");
  assert.equal(proposalPanelSurface.props.submitBodyFields, "id=id@nullable|action=action@nullable|targetKind=targetKind@nullable|targetId=targetId@nullable|body=bodyJson@json|reason=reason@nullable");
  assert.equal(proposalPanelSurface.props.invalidFieldMessages, "bodyJson=Body JSON is invalid.");
  assert.equal(proposalPanelSurface.props.fieldSyncs, "bodyJson=action:data-sample-body@jsonPretty");
  assert.equal(proposalPanelSurface.props.proposalActionOptionsSource, "proposalActions");
  assert.equal(proposalPanelSurface.props.proposalActionOptionsValuePath, "action");
  assert.equal(proposalPanelSurface.props.proposalActionOptionsLabelPath, "action");
  assert.equal(proposalPanelSurface.props.proposalActionOptionsAttrFields, "data-sample-body=sampleBody@json");
  const proposalReviewSurface = workflowProposalsPage.childSurfaces.find(surface => surface.name === "PlatformProposalReviewList");
  assert.ok(proposalReviewSurface);
  assert.equal(proposalReviewSurface.props.formId, "platform-review-form");
  assert.equal(proposalReviewSurface.props.clientAction, "proposal.review");
  assert.equal(proposalReviewSurface.props.formFields, "Open proposal=id@select:openProposalOptions|Reject reason=reason@text");
  assert.equal(proposalReviewSurface.props.submitPath, "/api/platform-proposals/{id}/{reviewAction}");
  assert.equal(proposalReviewSurface.props.submitBodyFields, "reason=reason@nullable");
  assert.equal(proposalReviewSurface.props.requiredFieldMessages, "id=No open proposal selected.");
  assert.equal(proposalReviewSurface.props.successMessageTemplate, "Proposal {proposal.status}.");
  assert.equal(proposalReviewSurface.props.openProposalOptionsSource, "proposals");
  assert.equal(proposalReviewSurface.props.openProposalOptionsValuePath, "id");
  assert.equal(proposalReviewSurface.props.openProposalOptionsLabelPath, "id");
  assert.equal(proposalReviewSurface.props.openProposalOptionsWhere, "status=open");
  assert.equal(proposalReviewSurface.props.actionButtons, "Approve=approve|Reject=reject");
  const branchCreateSurface = workflowBranchesPage.childSurfaces.find(surface => surface.name === "PlatformBranchCreatePanel");
  assert.ok(branchCreateSurface);
  assert.equal(branchCreateSurface.props.formId, "platform-branch-create-form");
  assert.equal(branchCreateSurface.props.clientAction, "branch.create");
  assert.equal(branchCreateSurface.props.formFields, "Branch id=id@text|Title=title@text|Parent branch=parentBranchId@text|Epic=epic@text|Feature=feature@text|Defect=defect@text");
  assert.equal(branchCreateSurface.props.submitPath, "/api/platform-branches");
  assert.equal(branchCreateSurface.props.submitBodyFields, "id=id@nullable|title=title@nullable|parentBranchId=parentBranchId@nullable|epic=epic@nullable|feature=feature@nullable|defect=defect@nullable");
  assert.equal(branchCreateSurface.props.successMessage, "Branch created.");
  const changeSetCreateSurface = workflowChangeSetsPage.childSurfaces.find(surface => surface.name === "PlatformChangeSetCreatePanel");
  assert.ok(changeSetCreateSurface);
  assert.equal(changeSetCreateSurface.props.formId, "platform-change-set-create-form");
  assert.equal(changeSetCreateSurface.props.submitPath, "/api/platform-change-sets");
  assert.equal(changeSetCreateSurface.props.submitBodyFields, "id=id@nullable|branchId=branchId@nullable|title=title@nullable|reason=reason@nullable");
  assert.equal(changeSetCreateSurface.props.fieldDefaults, "id=changeSet:{generatedId}|branchId=branch:platform-console|title=Platform console change|reason=Stage platform console edits");
  const changeSetEditSurface = workflowChangeSetsPage.childSurfaces.find(surface => surface.name === "PlatformChangeSetEditPanel");
  assert.ok(changeSetEditSurface);
  assert.equal(changeSetEditSurface.props.formId, "platform-change-set-edit-form");
  assert.equal(changeSetEditSurface.props.formFields, "Change set=changeSetId@select:changeSetOptions|Path=path@text|Content=content@textarea");
  assert.equal(changeSetEditSurface.props.submitPath, "/api/platform-change-sets/{changeSetId}/edits");
  assert.equal(changeSetEditSurface.props.submitBodyFields, "edits[0].path=path@value|edits[0].content=content@value");
  assert.equal(changeSetEditSurface.props.requiredFieldMessages, "changeSetId=Select a change set first.");
  assert.equal(changeSetEditSurface.props.changeSetOptionsSource, "changeSets");
  assert.equal(changeSetEditSurface.props.changeSetOptionsValuePath, "id");
  assert.equal(changeSetEditSurface.props.changeSetOptionsLabelPath, "id");
  const changeSetApplySurface = workflowChangeSetsPage.childSurfaces.find(surface => surface.name === "PlatformChangeSetApplyPanel");
  assert.ok(changeSetApplySurface);
  assert.equal(changeSetApplySurface.props.submitPath, "/api/platform-change-sets/{changeSetId}/apply");
  assert.equal(changeSetApplySurface.props.requiredFieldMessages, "changeSetId=Select a change set first.");
  assert.equal(changeSetApplySurface.props.successMessage, "Change set applied.");
  const changeSetLifecycleSurface = workflowChangeSetsPage.childSurfaces.find(surface => surface.name === "PlatformChangeSetLifecyclePanel");
  assert.ok(changeSetLifecycleSurface);
  assert.equal(changeSetLifecycleSurface.props.formFields, "Change set=changeSetId@select:changeSetOptions|Action=action@select:lifecycleActions|Reason=reason@text");
  assert.equal(changeSetLifecycleSurface.props.submitPath, "/api/platform-change-sets/{changeSetId}/{action}");
  assert.equal(changeSetLifecycleSurface.props.submitBodyFields, "reason=reason@nullable");
  assert.equal(changeSetLifecycleSurface.props.requiredFieldMessages, "changeSetId=Select a change set first.");
  assert.equal(changeSetLifecycleSurface.props.successMessageTemplate, "Change set {action}ed.");
  assert.equal(changeSetLifecycleSurface.props.changeSetOptionsSource, "changeSets");
  assert.equal(changeSetLifecycleSurface.props.changeSetOptionsValuePath, "id");
  assert.equal(changeSetLifecycleSurface.props.changeSetOptionsLabelPath, "id");
  assert.equal(changeSetLifecycleSurface.props.lifecycleActionsOptions, "Reject=reject|Abandon=abandon");
  assert.ok(verificationPage);
  assert.equal(verificationPage.pageId, "verification");
  assert.equal(verificationPage.props.modelView, "verificationOverview");
  assert.match(verificationPage.props.summaryCards, /Queued=verificationQueue@count/);
  assert.deepEqual(verificationPage.children, [
    "PlatformVerificationStatusBanner",
    "PlatformVerificationStreams",
    "PlatformBranchRedGreenList",
    "PlatformChangeSetRedGreenList"
  ]);
  assert.ok(verificationStatusPage);
  assert.equal(verificationStatusPage.pageId, "verificationStatus");
  assert.equal(verificationStatusPage.props.modelView, "verificationStatus");
  assert.match(verificationStatusPage.props.summaryCards, /Policies=verificationPolicies@count/);
  assert.deepEqual(verificationStatusPage.children, [
    "PlatformVerificationStatusBanner",
    "PlatformVerificationStatusList",
    "PlatformVerificationDetail"
  ]);
  assert.ok(verificationRunsPage);
  assert.equal(verificationRunsPage.pageId, "verificationRuns");
  assert.equal(verificationRunsPage.props.modelView, "verificationRuns");
  assert.match(verificationRunsPage.props.summaryCards, /Artifacts=testArtifacts@count/);
  assert.deepEqual(verificationRunsPage.children, [
    "PlatformVerificationRunsList",
    "PlatformVerificationDetail",
    "PlatformTestRunPanel",
    "PlatformSelectedTestRunPanel"
  ]);
  assert.ok(verificationRuntimePage);
  assert.equal(verificationRuntimePage.pageId, "verificationRuntime");
  assert.equal(verificationRuntimePage.props.modelView, "verificationRuntime");
  assert.match(verificationRuntimePage.props.summaryCards, /Build Errors=snapshotBuildErrors@count/);
  assert.deepEqual(verificationRuntimePage.children, [
    "PlatformVerificationRuntimeList",
    "PlatformVerificationDetail",
    "PlatformVerificationStreams"
  ]);
  const verificationDetailSurface = verificationStatusPage.childSurfaces.find(surface => surface.name === "PlatformVerificationDetail");
  assert.ok(verificationDetailSurface);
  assert.equal(verificationDetailSurface.props.detailSource, "verification");
  assert.equal(verificationDetailSurface.props.detailSelectionSources, "verificationPolicies|verificationFreshness|verificationInvalidations|verificationQueue|verificationExecutions|testGates|runtimeRevisions|testRuns|testReports|candidateSnapshots");
  assert.equal(verificationDetailSurface.props.verificationPolicyIdPrefixes, "verificationPolicy:");
  assert.equal(verificationDetailSurface.props.verificationFreshnessIdPrefixes, "verificationFreshness:");
  assert.equal(verificationDetailSurface.props.verificationInvalidationIdPrefixes, "verificationInvalidation:");
  assert.equal(verificationDetailSurface.props.verificationQueueIdPrefixes, "verificationQueue:");
  assert.equal(verificationDetailSurface.props.verificationExecutionIdPrefixes, "verificationExecution:");
  assert.equal(verificationDetailSurface.props.gateIdPrefixes, "gate:");
  assert.equal(verificationDetailSurface.props.runtimeRevisionIdPrefixes, "runtimeRevision:|backendRevision:|frontendRevision:");
  assert.equal(verificationDetailSurface.props.candidateSnapshotIdPrefixes, "candidateSnapshot:");
  assert.equal(verificationDetailSurface.props.testRunIdPrefixes, "testRun:");
  assert.equal(verificationDetailSurface.props.testReportIdPrefixes, "testReport:");
  assert.equal(verificationDetailSurface.props.emptyTitle, "Detail");
  assert.equal(verificationDetailSurface.props.emptyState, "No verification rows are projected yet.");
  assert.deepEqual(verificationDetailSurface.children, [
    "PlatformVerificationPrimaryPanel",
    "PlatformVerificationRelatedPanel",
    "PlatformVerificationRunHistory",
    "PlatformVerificationBuildHistory",
    "PlatformVerificationBuildErrors",
    "PlatformVerificationFreshnessSummary",
    "PlatformVerificationInvalidationReasons",
    "PlatformVerificationRequirementSummary",
    "PlatformVerificationRequirementsTable",
    "PlatformVerificationBlockingReasons",
    "PlatformVerificationReportSummary",
    "PlatformVerificationArtifactsReport",
    "PlatformVerificationSuiteSummary",
    "PlatformVerificationFailingCases",
    "PlatformVerificationRegressionSummary"
  ]);
  assert.deepEqual(verificationDetailSurface.childSurfaces.map(surface => surface.props.detailPanelRole || null), [
    "primary",
    "related",
    "runHistory",
    "buildHistory",
    "buildErrors",
    "freshnessSummary",
    "invalidationReasons",
    "verificationRequirementSummary",
    "verificationRequirements",
    "verificationBlockingReasons",
    "reportSummary",
    "artifacts",
    "suiteSummary",
    "failingCases",
    "regressionSummary"
  ]);
  assert.deepEqual(verificationDetailSurface.childSurfaces.map(surface => surface.props.detailKinds || null), [
    "verificationPolicy|verificationFreshness|verificationInvalidation|verificationExecution|gate|runtimeRevision|candidateSnapshot|testRun|testReport",
    "verificationPolicy|gate|runtimeRevision|candidateSnapshot|testRun|testReport",
    "gate|verificationFreshness|verificationInvalidation",
    "runtimeRevision",
    "runtimeRevision",
    "gate|verificationFreshness|verificationInvalidation|testRun|testReport",
    "gate|verificationFreshness|verificationInvalidation|testRun|testReport",
    "changeSet|candidateSnapshot",
    "changeSet|candidateSnapshot",
    "changeSet|candidateSnapshot",
    "testRun|testReport",
    "testRun|testReport",
    "testRun|testReport",
    "testRun|testReport",
    "testRun|testReport"
  ]);
  assert.equal(verificationDetailSurface.childSurfaces.some(surface => surface.name === "PlatformVerificationBuildErrors" && surface.summary === "Build errors for the selected runtime revision when available."), true);
  const verificationRunSurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationRunHistory");
  assert.ok(verificationRunSurface);
  assert.equal(verificationRunSurface.props.columns, "Status|Run|Branch|Duration|Exit");
  assert.equal(verificationRunSurface.props.rowFields, "Status=status|Run=id@concept|Branch=branchId@concept|Duration=durationMs|Exit=exitCode");
  assert.equal(verificationRunSurface.props.rowLimit, "12");
  const verificationBuildSurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationBuildHistory");
  assert.ok(verificationBuildSurface);
  assert.equal(verificationBuildSurface.props.rowFields, "Status=status|Build=id@concept|Candidate Snapshot=candidateSnapshotId@concept|Branch=branchId@concept|Errors=errorCount");
  const verificationBuildErrorsSurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationBuildErrors");
  assert.ok(verificationBuildErrorsSurface);
  assert.equal(verificationBuildErrorsSurface.props.rowFields, "Build=snapshotBuildId@concept|Path=path|Kind=kind|Message=message");
  const verificationPrimarySurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationPrimaryPanel");
  assert.ok(verificationPrimarySurface);
  assert.equal(verificationPrimarySurface.props.longTailCardTitle, "Properties");
  assert.equal(verificationPrimarySurface.props.longTailValueKinds, "string|number|boolean|scalarList");
  assert.equal(verificationPrimarySurface.props.gateLongTailExcludedFields, "protectedObjects|selectedByBranches|selectedByChangeSets");
  assert.equal(verificationPrimarySurface.props.runtimeRevisionLongTailExcludedFields, "candidateBranchCount");
  assert.equal(verificationPrimarySurface.props.candidateSnapshotLongTailExcludedFields, "files|errors");
  assert.equal(verificationPrimarySurface.props.gateCardTitle, "Test Gate Detail");
  assert.match(verificationPrimarySurface.props.gateFields, /Gate=id@concept/);
  assert.equal(verificationPrimarySurface.props.verificationFreshnessCardTitle, "Verification Freshness");
  assert.match(verificationPrimarySurface.props.verificationFreshnessFields, /Latest run=latestRunId@concept/);
  assert.equal(verificationPrimarySurface.props.verificationInvalidationCardTitle, "Verification Invalidation");
  assert.match(verificationPrimarySurface.props.verificationInvalidationFields, /Previous run=previousRunId@concept/);
  assert.match(verificationPrimarySurface.props.runtimeRevisionFields, /Revision=id@concept/);
  assert.match(verificationPrimarySurface.props.candidateSnapshotFields, /Snapshot=id@concept/);
  assert.match(verificationPrimarySurface.props.testRunFields, /Gate=gateId@concept/);
  assert.match(verificationPrimarySurface.props.testRunFields, /Freshness=freshnessAtReadStatus/);
  assert.match(verificationPrimarySurface.props.testRunFields, /Invalidations=invalidationReasonKinds@value/);
  const verificationRelatedSurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationRelatedPanel");
  assert.ok(verificationRelatedSurface);
  assert.equal(verificationRelatedSurface.props.cardItemLimit, "12");
  assert.equal(verificationRelatedSurface.props.gateLinkCards, "Protected Objects=protectedObjects|Selected Branches=selectedByBranches|Selected Change Sets=selectedByChangeSets");
  assert.equal(verificationRelatedSurface.props.gateLinkCardEmptyStates, "Protected Objects=No protected objects linked to this gate.|Selected Branches=No branches currently select this gate.|Selected Change Sets=No change sets currently select this gate.");
  assert.equal(verificationRelatedSurface.props.runtimeRevisionLinkCards, "Changed Sources=changedSources");
  assert.equal(verificationRelatedSurface.props.runtimeRevisionLinkCardEmptyStates, "Changed Sources=No changed sources recorded for this revision.");
  assert.equal(verificationRelatedSurface.props.runtimeRevisionPropertyCardTitle, "Snapshot Diagnostics");
  assert.equal(verificationRelatedSurface.props.runtimeRevisionPropertyFields, "Active revision=snapshotDiagnostics.appRevision|Last good=snapshotDiagnostics.lastGoodAppRevision|Pending dirty=snapshotDiagnostics.pendingDirtySources@count|Verification status=testMonitorDiagnostics.status|Queued sources=testMonitorDiagnostics.pendingSourceCount|Queued change sets=testMonitorDiagnostics.pendingChangeSetCount|Persistence source=verificationPersistence.source|Ledger backend=verificationPersistence.ledgerBackend.provider|Backend revision event stream=backendRevisionEventsHref@href");
  assert.equal(verificationRelatedSurface.props.candidateSnapshotTextCards, "Files=files@path|Errors=errors@errorMessage");
  assert.equal(verificationRelatedSurface.props.candidateSnapshotTextCardEmptyStates, "Files=No files captured in this candidate snapshot.|Errors=No build or validation errors.");
  assert.equal(verificationRelatedSurface.props.testRunPropertyCardTitle, "Verification Streams");
  assert.equal(verificationRelatedSurface.props.testRunPropertyFields, "Test run event stream=testRunEventsHref@href|Backend revision event stream=backendRevisionEventsHref@href");
  const verificationFreshnessSurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationFreshnessSummary");
  assert.ok(verificationFreshnessSurface);
  assert.equal(verificationFreshnessSurface.props.detailPanelRole, "freshnessSummary");
  assert.equal(verificationFreshnessSurface.props.detailKinds, "gate|verificationFreshness|verificationInvalidation|testRun|testReport");
  assert.equal(verificationFreshnessSurface.props.propertyCardTitle, "Freshness");
  assert.match(verificationFreshnessSurface.props.propertyFields, /Changed paths=changedPaths@value/);
  const verificationInvalidationSurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationInvalidationReasons");
  assert.ok(verificationInvalidationSurface);
  assert.equal(verificationInvalidationSurface.props.detailPanelRole, "invalidationReasons");
  assert.equal(verificationInvalidationSurface.props.detailKinds, "gate|verificationFreshness|verificationInvalidation|testRun|testReport");
  assert.equal(verificationInvalidationSurface.props.columns, "Reason|Summary|Changed Paths|Targets");
  assert.equal(verificationInvalidationSurface.props.rowFields, "Reason=reasonKind|Summary=reasonSummary|Changed Paths=changedPaths@value|Targets=targetIds@value");
  const verificationRequirementSummarySurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationRequirementSummary");
  assert.ok(verificationRequirementSummarySurface);
  assert.equal(verificationRequirementSummarySurface.props.detailPanelRole, "verificationRequirementSummary");
  assert.equal(verificationRequirementSummarySurface.props.detailKinds, "changeSet|candidateSnapshot");
  assert.match(verificationRequirementSummarySurface.props.propertyFields, /Blocking status=blockingStatus/);
  const verificationRequirementsSurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationRequirementsTable");
  assert.ok(verificationRequirementsSurface);
  assert.equal(verificationRequirementsSurface.props.detailPanelRole, "verificationRequirements");
  assert.equal(verificationRequirementsSurface.props.rowFields, "Status=status|Blocking=blocking|Gate=gateId@concept|Execution Class=executionClass|Freshness=freshnessStatus|Regression=regressionStatus|Latest Run=latestRunId@concept|Latest Passed=latestPassedRunId@concept");
  const verificationBlockingSurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationBlockingReasons");
  assert.ok(verificationBlockingSurface);
  assert.equal(verificationBlockingSurface.props.detailPanelRole, "verificationBlockingReasons");
  assert.equal(verificationBlockingSurface.props.rowFields, "Gate=gateId@concept|Status=status|Reason=reasonSummary|Changed Paths=changedPaths@value|Targets=targetIds@value");
  const verificationStreamsSurface = verificationPage.childSurfaces.find(surface => surface.name === "PlatformVerificationStreams");
  assert.ok(verificationStreamsSurface);
  assert.equal(verificationStreamsSurface.props.propertyCardTitle, "Event Streams");
  assert.equal(verificationStreamsSurface.props.propertyFields, "Test run event stream=testRunEventsHref@href|Backend revision event stream=backendRevisionEventsHref@href");
  assert.equal(verificationStreamsSurface.props.propertyValues, "testRunEventsHref=/api/platform-test-runs/events|backendRevisionEventsHref=/api/runtime/backend-revisions/events");
  const verificationStatusSurface = verificationStatusPage.childSurfaces.find(surface => surface.name === "PlatformVerificationStatusBanner");
  assert.ok(verificationStatusSurface);
  assert.equal(verificationStatusSurface.props.propertyRecordSource, "verificationStatus");
  assert.match(verificationStatusSurface.props.propertyFields, /Fresh gates=freshGateCount/);
  assert.match(verificationStatusSurface.props.propertyFields, /Stale gates=staleGateCount/);
  assert.match(verificationStatusSurface.props.propertyFields, /Missing gates=missingGateCount/);
  assert.match(verificationStatusSurface.props.propertyFields, /Running runs=runningCount/);
  const verificationReportSummarySurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationReportSummary");
  assert.ok(verificationReportSummarySurface);
  assert.match(verificationReportSummarySurface.props.propertyFields, /Report=reportId@concept/);
  const verificationArtifactsSurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationArtifactsReport");
  assert.ok(verificationArtifactsSurface);
  assert.equal(verificationArtifactsSurface.props.rowFields, "Kind=artifactKind|Artifact=id@concept|File=fileName|Content Type=contentType|Bytes=sizeBytes");
  const verificationSuiteSummarySurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationSuiteSummary");
  assert.ok(verificationSuiteSummarySurface);
  assert.equal(verificationSuiteSummarySurface.props.rowFields, "Status=status|Suite=id@concept|Total=total|Failed=failed|Errors=errors");
  const verificationFailingCasesSurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationFailingCases");
  assert.ok(verificationFailingCasesSurface);
  assert.equal(verificationFailingCasesSurface.props.rowFields, "Status=status|Case=id@concept|Suite=suiteId@concept|Class=classname|Duration=durationMs");
  const verificationRegressionSurface = verificationDetailSurface.childSurfaces.find(surface => surface.name === "PlatformVerificationRegressionSummary");
  assert.ok(verificationRegressionSurface);
  assert.match(verificationRegressionSurface.props.propertyFields, /Baseline run=baselineRunId@concept/);
  const testRunPanelSurface = verificationRunsPage.childSurfaces.find(surface => surface.name === "PlatformTestRunPanel");
  assert.ok(testRunPanelSurface);
  assert.equal(testRunPanelSurface.props.formId, "platform-test-run-form");
  assert.equal(testRunPanelSurface.props.formFields, "Test gate=gateId@select:testGateOptions|Branch id=branchId@text|Change set id=changeSetId@text|Candidate snapshot id=candidateSnapshotId@text");
  assert.equal(testRunPanelSurface.props.submitPath, "/api/platform-test-runs");
  assert.equal(testRunPanelSurface.props.submitBodyFields, "gateId=gateId@nullable|branchId=branchId@nullable|changeSetId=changeSetId@nullable|candidateSnapshotId=candidateSnapshotId@nullable");
  assert.equal(testRunPanelSurface.props.successMessageTemplate, "Test run finished: {latestResult.status||testRun.status||unknown}");
  assert.equal(testRunPanelSurface.props.testGateOptionsSource, "testGates");
  assert.equal(testRunPanelSurface.props.testGateOptionsValuePath, "id");
  assert.equal(testRunPanelSurface.props.testGateOptionsLabelPath, "title||id");
  const selectedTestRunPanelSurface = verificationRunsPage.childSurfaces.find(surface => surface.name === "PlatformSelectedTestRunPanel");
  assert.ok(selectedTestRunPanelSurface);
  assert.equal(selectedTestRunPanelSurface.props.formId, "platform-selected-test-run-form");
  assert.equal(selectedTestRunPanelSurface.props.formFields, "Branch id=branchId@text|Change set id=changeSetId@text|Candidate snapshot id=candidateSnapshotId@text");
  assert.equal(selectedTestRunPanelSurface.props.submitPath, "/api/platform-test-runs");
  assert.equal(selectedTestRunPanelSurface.props.submitBodyFields, "branchId=branchId@nullable|changeSetId=changeSetId@nullable|candidateSnapshotId=candidateSnapshotId@nullable");
  assert.equal(selectedTestRunPanelSurface.props.successMessageTemplate, "Selected gates finished: {summaries.passed}/{summaries.totalRuns} passed");
  const branchRedGreenSurface = verificationPage.childSurfaces.find(surface => surface.name === "PlatformBranchRedGreenList");
  assert.ok(branchRedGreenSurface);
  assert.equal(branchRedGreenSurface.props.listSource, "branchRedGreenRows");
  assert.equal(branchRedGreenSurface.props.rowFields, "Status=status|Branch=branchId@concept|Selected=totalSelectedGates|Passed=passedCount|Failed=failedCount|Summary=summary");
  assert.equal(branchRedGreenSurface.props.sortOptions, "status=status|branch=branchId|selected=totalSelectedGates|passed=passedCount|failed=failedCount|summary=summary");
  assert.equal(branchRedGreenSurface.props.defaultSort, "branch:asc");
  assert.equal(branchRedGreenSurface.props.pageSize, "12");
  const changeSetRedGreenSurface = verificationPage.childSurfaces.find(surface => surface.name === "PlatformChangeSetRedGreenList");
  assert.ok(changeSetRedGreenSurface);
  assert.equal(changeSetRedGreenSurface.props.listSource, "changeSetRedGreenRows");
  assert.equal(changeSetRedGreenSurface.props.rowFields, "Status=status|Change Set=changeSetId@concept|Selected=totalSelectedGates|Passed=passedCount|Failed=failedCount|Summary=summary");
  assert.equal(changeSetRedGreenSurface.props.sortOptions, "status=status|changeSet=changeSetId|selected=totalSelectedGates|passed=passedCount|failed=failedCount|summary=summary");
  assert.equal(changeSetRedGreenSurface.props.defaultSort, "changeSet:asc");
  assert.equal(changeSetRedGreenSurface.props.pageSize, "12");
  const verificationStatusListSurface = verificationStatusPage.childSurfaces.find(surface => surface.name === "PlatformVerificationStatusList");
  assert.ok(verificationStatusListSurface);
  assert.equal(verificationStatusListSurface.props.listSource, "verificationItems");
  const verificationRunsListSurface = verificationRunsPage.childSurfaces.find(surface => surface.name === "PlatformVerificationRunsList");
  assert.ok(verificationRunsListSurface);
  assert.equal(verificationRunsListSurface.props.listSource, "verificationItems");
  const verificationRuntimeListSurface = verificationRuntimePage.childSurfaces.find(surface => surface.name === "PlatformVerificationRuntimeList");
  assert.ok(verificationRuntimeListSurface);
  assert.equal(verificationRuntimeListSurface.props.listSource, "verificationItems");
  assert.ok(signalsPage);
  assert.equal(signalsPage.pageId, "signals");
  assert.equal(signalsPage.props.modelView, "signalsOverview");
  assert.match(signalsPage.props.summaryCards, /Telemetry Metrics=nodes@countKind:telemetryMetric/);
  assert.deepEqual(signalsPage.children, []);
  assert.ok(signalsGapsPage);
  assert.equal(signalsGapsPage.pageId, "signalsGaps");
  assert.equal(signalsGapsPage.props.modelView, "signalsGaps");
  assert.deepEqual(signalsGapsPage.children, [
    "PlatformGapList",
    "PlatformGapDetail"
  ]);
  assert.ok(signalsCatalogPage);
  assert.equal(signalsCatalogPage.pageId, "signalsCatalog");
  assert.equal(signalsCatalogPage.props.modelView, "signalsCatalog");
  assert.deepEqual(signalsCatalogPage.children, [
    "PlatformSignalList",
    "PlatformSignalCatalogDetail"
  ]);
  const gapDetailSurface = signalsGapsPage.childSurfaces.find(surface => surface.name === "PlatformGapDetail");
  assert.ok(gapDetailSurface);
  assert.equal(gapDetailSurface.props.detailSource, "signals");
  assert.equal(gapDetailSurface.props.detailSelectionSources, "gaps");
  assert.equal(gapDetailSurface.props.gapIdPrefixes, "gap.");
  assert.equal(gapDetailSurface.props.emptyTitle, "Detail");
  assert.equal(gapDetailSurface.props.emptyState, "No gaps are projected yet.");
  assert.deepEqual(gapDetailSurface.children, [
    "PlatformSignalPrimaryPanel",
    "PlatformSignalRelatedPanel",
    "PlatformSignalRelationships"
  ]);
  assert.deepEqual(gapDetailSurface.childSurfaces.map(surface => surface.props.detailPanelRole || null), [
    "primary",
    "related",
    "relationships"
  ]);
  assert.deepEqual(gapDetailSurface.childSurfaces.map(surface => surface.props.detailKinds || null), [
    "gap|signal",
    "gap",
    "gap|signal"
  ]);
  const signalCatalogDetailSurface = signalsCatalogPage.childSurfaces.find(surface => surface.name === "PlatformSignalCatalogDetail");
  assert.ok(signalCatalogDetailSurface);
  assert.equal(signalCatalogDetailSurface.props.detailSource, "signals");
  assert.equal(signalCatalogDetailSurface.props.detailSelectionSources, "telemetryMetric|defectCluster|boundary");
  assert.equal(signalCatalogDetailSurface.props.signalNodeKinds, "telemetryMetric|defectCluster|boundary");
  assert.equal(signalCatalogDetailSurface.props.emptyState, "No signal nodes are projected yet.");
  assert.deepEqual(signalCatalogDetailSurface.children, [
    "PlatformSignalPrimaryPanel",
    "PlatformSignalRelationships"
  ]);
  assert.equal(gapDetailSurface.childSurfaces.some(surface => surface.name === "PlatformSignalRelationships" && surface.summary === "Linked graph relationships for the selected signal when available."), true);
  const signalRelationshipsSurface = gapDetailSurface.childSurfaces.find(surface => surface.name === "PlatformSignalRelationships");
  assert.ok(signalRelationshipsSurface);
  assert.equal(signalRelationshipsSurface.props.rowFields, "From=from@concept|Relation=rel|To=to@concept");
  assert.equal(signalsGapsPage.childSurfaces.some(surface => surface.name === "PlatformGapList" && surface.projectionRoutes.includes("/api/platform-gaps")), true);
  const gapListSurface = signalsGapsPage.childSurfaces.find(surface => surface.name === "PlatformGapList");
  assert.ok(gapListSurface);
  assert.equal(gapListSurface.props.listSource, "gapRows");
  assert.equal(gapListSurface.props.columns, "Severity|Kind|Target|Reason");
  assert.equal(gapListSurface.props.rowFields, "Severity=severity|Kind=kind|Target=target@concept|Reason=reason");
  assert.equal(gapListSurface.props.sortOptions, "severity=severity|kind=kind|target=target|reason=reason");
  assert.equal(gapListSurface.props.defaultSort, "severity:asc");
  assert.equal(gapListSurface.props.emptyState, "No gaps.");
  assert.equal(gapListSurface.props.pageSize, "12");
  const signalListSurface = signalsCatalogPage.childSurfaces.find(surface => surface.name === "PlatformSignalList");
  assert.ok(signalListSurface);
  assert.equal(signalListSurface.props.listSource, "signalItems");
  assert.ok(telemetryPage);
  assert.equal(telemetryPage.pageId, "telemetry");
  assert.equal(telemetryPage.props.modelView, "telemetry");
  assert.match(telemetryPage.props.summaryCards, /Metrics=telemetryMetrics@count/);
  assert.deepEqual(telemetryPage.children, [
    "PlatformTelemetryList",
    "PlatformTelemetryDetail"
  ]);
  const telemetryListSurface = telemetryPage.childSurfaces.find(surface => surface.name === "PlatformTelemetryList");
  assert.ok(telemetryListSurface);
  assert.equal(telemetryListSurface.props.listSource, "telemetryItems");
  assert.equal(telemetryListSurface.props.pageSize, "20");
  const telemetryDetailSurface = telemetryPage.childSurfaces.find(surface => surface.name === "PlatformTelemetryDetail");
  assert.ok(telemetryDetailSurface);
  assert.equal(telemetryDetailSurface.props.detailSource, "telemetry");
  assert.equal(telemetryDetailSurface.props.detailSelectionSources, "telemetryMetrics|performanceRegressions|telemetryWindows|telemetrySamples|materializedViewStates|resourceProbeOperations");
  assert.deepEqual(telemetryDetailSurface.children, [
    "PlatformTelemetryPrimaryPanel",
    "PlatformTelemetryRelatedPanel",
    "PlatformTelemetryRelationships"
  ]);
  assert.ok(defectsPage);
  assert.equal(defectsPage.pageId, "defects");
  assert.equal(defectsPage.props.modelView, "defects");
  assert.match(defectsPage.props.summaryCards, /Defects=defects@count/);
  assert.deepEqual(defectsPage.children, [
    "PlatformDefectList",
    "PlatformDefectDetail"
  ]);
  const defectListSurface = defectsPage.childSurfaces.find(surface => surface.name === "PlatformDefectList");
  assert.ok(defectListSurface);
  assert.equal(defectListSurface.props.listSource, "defectItems");
  assert.equal(defectListSurface.props.pageSize, "20");
  const defectDetailSurface = defectsPage.childSurfaces.find(surface => surface.name === "PlatformDefectDetail");
  assert.ok(defectDetailSurface);
  assert.equal(defectDetailSurface.props.detailSource, "defects");
  assert.equal(defectDetailSurface.props.detailSelectionSources, "defectClusters|defects|defectObservations|proposals");
  assert.deepEqual(defectDetailSurface.children, [
    "PlatformDefectPrimaryPanel",
    "PlatformDefectRelatedPanel",
    "PlatformDefectRelationships"
  ]);
  assert.ok(sessionsPage);
  assert.ok(artifactsPage);
  assert.equal(artifactsPage.pageId, "artifacts");
  assert.equal(artifactsPage.props.modelView, "artifacts");
  assert.match(artifactsPage.props.summaryCards, /Artifacts=artifacts@count/);
  assert.deepEqual(artifactsPage.children, [
    "PlatformArtifactsList",
    "PlatformArtifactsDetail"
  ]);
  const artifactsListSurface = artifactsPage.childSurfaces.find(surface => surface.name === "PlatformArtifactsList");
  assert.ok(artifactsListSurface);
  assert.equal(artifactsListSurface.props.listSource, "artifactItems");
  assert.equal(artifactsListSurface.props.pageSize, "20");
  const artifactsDetailSurface = artifactsPage.childSurfaces.find(surface => surface.name === "PlatformArtifactsDetail");
  assert.ok(artifactsDetailSurface);
  assert.equal(artifactsDetailSurface.props.detailSource, "artifacts");
  assert.equal(artifactsDetailSurface.props.detailSelectionSources, "artifacts");
  assert.equal(sessionsPage.pageId, "sessions");
  assert.equal(sessionsPage.props.modelView, "sessions");
  assert.match(sessionsPage.props.summaryCards, /Sessions=sessions@count/);
  assert.deepEqual(sessionsPage.children, [
    "PlatformSessionsList",
    "PlatformSessionsDetail"
  ]);
  const sessionsListSurface = sessionsPage.childSurfaces.find(surface => surface.name === "PlatformSessionsList");
  assert.ok(sessionsListSurface);
  assert.equal(sessionsListSurface.props.listSource, "sessionItems");
  assert.equal(sessionsListSurface.props.pageSize, "20");
  const sessionsDetailSurface = sessionsPage.childSurfaces.find(surface => surface.name === "PlatformSessionsDetail");
  assert.ok(sessionsDetailSurface);
  assert.equal(sessionsDetailSurface.props.detailSource, "sessions");
  assert.equal(sessionsDetailSurface.props.detailSelectionSources, "sessions|executions|sessionTags|executionArtifacts|authorityDecisions");
  assert.deepEqual(sessionsDetailSurface.children, [
    "PlatformSessionsPrimaryPanel",
    "PlatformSessionsRelatedPanel",
    "PlatformSessionsRelationships"
  ]);
  assert.ok(knowledgePage);
  assert.equal(knowledgePage.props.modelView, "knowledgeOverview");
  assert.match(knowledgePage.props.summaryCards, /Governed Docs=docs@count/);
  assert.deepEqual(knowledgePage.children, []);
  assert.ok(knowledgeDocsPage);
  assert.equal(knowledgeDocsPage.props.modelView, "knowledgeDocs");
  assert.deepEqual(knowledgeDocsPage.children, [
    "PlatformKnowledgeDocsList",
    "PlatformKnowledgeDocsDetail"
  ]);
  assert.ok(knowledgeFoldersPage);
  assert.equal(knowledgeFoldersPage.props.modelView, "knowledgeFolders");
  assert.deepEqual(knowledgeFoldersPage.children, [
    "PlatformKnowledgeFoldersList",
    "PlatformKnowledgeFoldersDetail"
  ]);
  assert.ok(knowledgeRoadmapPage);
  assert.equal(knowledgeRoadmapPage.props.modelView, "knowledgeRoadmap");
  assert.deepEqual(knowledgeRoadmapPage.children, [
    "PlatformKnowledgeRoadmapList",
    "PlatformKnowledgeRoadmapDetail"
  ]);
  const knowledgeDocsDetailSurface = knowledgeDocsPage.childSurfaces.find(surface => surface.name === "PlatformKnowledgeDocsDetail");
  assert.ok(knowledgeDocsDetailSurface);
  assert.equal(knowledgeDocsDetailSurface.props.detailSource, "knowledge");
  assert.equal(knowledgeDocsDetailSurface.props.detailSelectionSources, "docs");
  assert.equal(knowledgeDocsDetailSurface.props.documentPathField, "path");
  assert.equal(knowledgeDocsDetailSurface.props.emptyTitle, "Detail");
  assert.equal(knowledgeDocsDetailSurface.props.emptyState, "No governed docs are projected yet.");
  assert.deepEqual(knowledgeDocsDetailSurface.children, [
    "PlatformKnowledgePrimaryPanel",
    "PlatformKnowledgeRelatedPanel",
    "PlatformKnowledgeSections",
    "PlatformKnowledgeTasks"
  ]);
  assert.deepEqual(knowledgeDocsDetailSurface.childSurfaces.map(surface => surface.props.detailPanelRole || null), [
    "primary",
    "related",
    "sections",
    "tasks"
  ]);
  assert.deepEqual(knowledgeDocsDetailSurface.childSurfaces.map(surface => surface.props.detailKinds || null), [
    "document|roadmapTask|epic|feature|folder",
    "document|roadmapTask|epic|feature|folder",
    "document",
    "document"
  ]);
  assert.equal(knowledgeDocsDetailSurface.childSurfaces.some(surface => surface.name === "PlatformKnowledgeTasks" && surface.summary === "Document tasks for the selected governed document when available."), true);
  const knowledgeTaskSurface = knowledgeDocsDetailSurface.childSurfaces.find(surface => surface.name === "PlatformKnowledgeTasks");
  assert.ok(knowledgeTaskSurface);
  assert.equal(knowledgeTaskSurface.props.columns, "Status|Task|Line|Section");
  assert.equal(knowledgeTaskSurface.props.rowFields, "Status=status|Task=id@concept|Line=line|Section=section");
  assert.equal(knowledgeTaskSurface.props.rowLimit, "20");
  const knowledgeSectionsSurface = knowledgeDocsDetailSurface.childSurfaces.find(surface => surface.name === "PlatformKnowledgeSections");
  assert.ok(knowledgeSectionsSurface);
  assert.equal(knowledgeSectionsSurface.props.rowFields, "Title=title|Line=line|Depth=depth");
  const knowledgeDocsListSurface = knowledgeDocsPage.childSurfaces.find(surface => surface.name === "PlatformKnowledgeDocsList");
  assert.ok(knowledgeDocsListSurface);
  assert.equal(knowledgeDocsListSurface.props.listSource, "knowledgeItems");
  assert.equal(knowledgeDocsListSurface.props.columns, "Freshness|Document|Role|Summary");
  assert.equal(knowledgeDocsListSurface.props.pageSize, "12");
  const knowledgeFoldersListSurface = knowledgeFoldersPage.childSurfaces.find(surface => surface.name === "PlatformKnowledgeFoldersList");
  assert.ok(knowledgeFoldersListSurface);
  assert.equal(knowledgeFoldersListSurface.props.listSource, "knowledgeItems");
  assert.equal(knowledgeFoldersListSurface.props.columns, "Kind|Folder|Path|Summary");
  assert.equal(knowledgeFoldersListSurface.props.rowFields, "Kind=pageKind|Folder=folderLink@concept|Path=scope@value|Summary=summary");
  assert.equal(knowledgeFoldersListSurface.props.emptyState, "No folder metas.");
  const knowledgeFoldersDetailSurface = knowledgeFoldersPage.childSurfaces.find(surface => surface.name === "PlatformKnowledgeFoldersDetail");
  assert.ok(knowledgeFoldersDetailSurface);
  assert.equal(knowledgeFoldersDetailSurface.props.detailSource, "knowledge");
  assert.equal(knowledgeFoldersDetailSurface.props.detailSelectionSources, "folders");
  assert.equal(knowledgeFoldersDetailSurface.props.folderIdPrefixes, "folder:");
  assert.equal(knowledgeFoldersDetailSurface.props.emptyState, "No folder metadata is projected yet.");
  const knowledgeRoadmapListSurface = knowledgeRoadmapPage.childSurfaces.find(surface => surface.name === "PlatformKnowledgeRoadmapList");
  assert.ok(knowledgeRoadmapListSurface);
  assert.equal(knowledgeRoadmapListSurface.props.listSource, "knowledgeItems");
  assert.equal(knowledgeRoadmapListSurface.props.emptyState, "No roadmap work.");
  const knowledgeRoadmapDetailSurface = knowledgeRoadmapPage.childSurfaces.find(surface => surface.name === "PlatformKnowledgeRoadmapDetail");
  assert.ok(knowledgeRoadmapDetailSurface);
  assert.equal(knowledgeRoadmapDetailSurface.props.detailSource, "knowledge");
  assert.equal(knowledgeRoadmapDetailSurface.props.detailSelectionSources, "roadmapTasks|epics|features");
  assert.equal(knowledgeRoadmapDetailSurface.props.roadmapTaskIdPrefixes, "roadmapTask:");
  assert.equal(knowledgeRoadmapDetailSurface.props.roadmapTaskFallbackField, "doc");
  assert.equal(knowledgeRoadmapDetailSurface.props.epicIdPrefixes, "epic:");
  assert.equal(knowledgeRoadmapDetailSurface.props.featureIdPrefixes, "feature:");
  assert.equal(knowledgeRoadmapDetailSurface.props.emptyState, "No roadmap work is projected yet.");
  const knowledgePrimarySurface = knowledgeDocsDetailSurface.childSurfaces.find(surface => surface.name === "PlatformKnowledgePrimaryPanel");
  assert.ok(knowledgePrimarySurface);
  assert.equal(knowledgePrimarySurface.props.longTailCardTitle, "Properties");
  assert.equal(knowledgePrimarySurface.props.longTailValueKinds, "string|number|boolean|scalarList");
  assert.equal(knowledgePrimarySurface.props.documentLongTailExcludedFields, "references");
  assert.equal(knowledgePrimarySurface.props.roadmapTaskLongTailExcludedFields, "targets|derivedSummary|evidence");
  assert.equal(knowledgePrimarySurface.props.epicLongTailExcludedFields, "defectClusterIds");
  assert.equal(knowledgePrimarySurface.props.featureLongTailExcludedFields, "defectClusterIds");
  assert.equal(knowledgePrimarySurface.props.documentCardTitle, "Document Detail");
  assert.match(knowledgePrimarySurface.props.documentFields, /Document=path@concept/);
  assert.match(knowledgePrimarySurface.props.roadmapTaskFields, /Evidence=derivedSummary\|\|evidence\.summary/);
  assert.match(knowledgePrimarySurface.props.epicFields, /Roadmap=roadmapId@concept/);
  assert.match(knowledgePrimarySurface.props.featureFields, /Epic=epicId@concept/);
  assert.equal(knowledgePrimarySurface.props.folderLongTailExcludedFields, "linkedConcepts");
  assert.match(knowledgePrimarySurface.props.folderFields, /Folder=id@concept/);
  const knowledgeRelatedSurface = knowledgeDocsDetailSurface.childSurfaces.find(surface => surface.name === "PlatformKnowledgeRelatedPanel");
  assert.ok(knowledgeRelatedSurface);
  assert.equal(knowledgeRelatedSurface.props.cardItemLimit, "12");
  assert.deepEqual(knowledgeRelatedSurface.children, [
    "PlatformKnowledgeDocumentLinks",
    "PlatformKnowledgeRoadmapTaskLinks",
    "PlatformKnowledgeEpicLinks",
    "PlatformKnowledgeFeatureLinks",
    "PlatformKnowledgeFolderLinks"
  ]);
  const knowledgeDocumentLinksSurface = knowledgeRelatedSurface.childSurfaces.find(surface => surface.name === "PlatformKnowledgeDocumentLinks");
  assert.ok(knowledgeDocumentLinksSurface);
  assert.equal(knowledgeDocumentLinksSurface.props.detailKinds, "document");
  assert.equal(knowledgeDocumentLinksSurface.props.linkCards, "Referenced Routes=references.routes|Referenced Plugins=references.pluginIds|Referenced Files=references.filePaths|Authored Doc Links=references.authoredDocLinks@authoredLink|Authored Code Links=references.authoredCodeLinks@authoredLink");
  assert.equal(knowledgeDocumentLinksSurface.props.linkCardEmptyStates, "Referenced Routes=No referenced routes in this document.|Referenced Plugins=No referenced plugins in this document.|Referenced Files=No referenced files in this document.|Authored Doc Links=No authored doc-to-doc links in the knowledge model.|Authored Code Links=No authored doc-to-code realizations in the knowledge model.");
  const knowledgeRoadmapTaskLinksSurface = knowledgeRelatedSurface.childSurfaces.find(surface => surface.name === "PlatformKnowledgeRoadmapTaskLinks");
  assert.ok(knowledgeRoadmapTaskLinksSurface);
  assert.equal(knowledgeRoadmapTaskLinksSurface.props.detailKinds, "roadmapTask");
  assert.equal(knowledgeRoadmapTaskLinksSurface.props.linkCards, "Linked Targets=targets@targetId");
  assert.equal(knowledgeRoadmapTaskLinksSurface.props.linkCardEmptyStates, "Linked Targets=No linked platform targets for this roadmap task.");
  const knowledgeEpicLinksSurface = knowledgeRelatedSurface.childSurfaces.find(surface => surface.name === "PlatformKnowledgeEpicLinks");
  assert.ok(knowledgeEpicLinksSurface);
  assert.equal(knowledgeEpicLinksSurface.props.detailKinds, "epic");
  assert.equal(knowledgeEpicLinksSurface.props.linkCards, "Branches=branchIds|Features=featureIds|Verification Gates=gateIds|Docs=docIds");
  assert.equal(knowledgeEpicLinksSurface.props.linkCardEmptyStates, "Branches=No branches linked to this epic.|Features=No features linked to this epic.|Verification Gates=No verification gates linked to this epic.|Docs=No docs linked to this epic.");
  const knowledgeFeatureLinksSurface = knowledgeRelatedSurface.childSurfaces.find(surface => surface.name === "PlatformKnowledgeFeatureLinks");
  assert.ok(knowledgeFeatureLinksSurface);
  assert.equal(knowledgeFeatureLinksSurface.props.detailKinds, "feature");
  assert.equal(knowledgeFeatureLinksSurface.props.linkCards, "Branches=branchIds|Verification Gates=gateIds|Docs=docIds");
  assert.equal(knowledgeFeatureLinksSurface.props.linkCardEmptyStates, "Branches=No branches linked to this feature.|Verification Gates=No verification gates linked to this feature.|Docs=No docs linked to this feature.");
  const knowledgeFolderLinksSurface = knowledgeRelatedSurface.childSurfaces.find(surface => surface.name === "PlatformKnowledgeFolderLinks");
  assert.ok(knowledgeFolderLinksSurface);
  assert.equal(knowledgeFolderLinksSurface.props.detailKinds, "folder");
  assert.equal(knowledgeFolderLinksSurface.props.linkCards, "Linked Concepts=linkedConcepts");
  assert.equal(knowledgeFolderLinksSurface.props.linkCardEmptyStates, "Linked Concepts=No linked concepts were projected for this folder.");
  const signalPrimarySurface = gapDetailSurface.childSurfaces.find(surface => surface.name === "PlatformSignalPrimaryPanel");
  assert.ok(signalPrimarySurface);
  assert.equal(signalPrimarySurface.props.longTailCardTitle, "Properties");
  assert.equal(signalPrimarySurface.props.longTailValueKinds, "string|number|boolean|scalarList");
  assert.equal(signalPrimarySurface.props.gapLongTailExcludedFields, "recommendedProposal|missingInGenerated|extraInGenerated");
  assert.equal(signalPrimarySurface.props.gapCardTitle, "Gap Detail");
  assert.match(signalPrimarySurface.props.gapFields, /Target=target@concept/);
  assert.match(signalPrimarySurface.props.signalFields, /Node=id@concept/);
  const signalRelatedSurface = gapDetailSurface.childSurfaces.find(surface => surface.name === "PlatformSignalRelatedPanel");
  assert.ok(signalRelatedSurface);
  assert.equal(signalRelatedSurface.props.cardItemLimit, "12");
  assert.equal(signalRelatedSurface.props.gapLinkCards, "Recommended Proposal=recommendedProposal");
  assert.equal(signalRelatedSurface.props.gapLinkCardEmptyStates, "Recommended Proposal=No recommended proposal is attached to this gap.");
  assert.equal(signalRelatedSurface.props.gapTextCards, "Missing In Generated=missingInGenerated|Extra In Generated=extraInGenerated");
  assert.equal(signalRelatedSurface.props.gapTextCardEmptyStates, "Missing In Generated=No missing selectors detected.|Extra In Generated=No extra selectors detected.");
  assert.ok(modelPage);
  assert.equal(modelPage.pageId, "model");
  assert.equal(modelPage.props.modelView, "modelOverview");
  assert.match(modelPage.props.summaryCards, /Coverage Edges=coverageEdges@count/);
  assert.deepEqual(modelPage.children, []);
  assert.ok(modelObjectsPage);
  assert.equal(modelObjectsPage.pageId, "modelObjects");
  assert.equal(modelObjectsPage.props.modelView, "modelObjects");
  assert.deepEqual(modelObjectsPage.children, ["PlatformModelList", "PlatformModelDetail"]);
  assert.ok(modelProfilesPage);
  assert.equal(modelProfilesPage.pageId, "modelProfiles");
  assert.equal(modelProfilesPage.props.modelView, "modelProfiles");
  assert.deepEqual(modelProfilesPage.children, ["PlatformProfileComparison"]);
  assert.ok(modelCoveragePage);
  assert.equal(modelCoveragePage.pageId, "modelCoverage");
  assert.equal(modelCoveragePage.props.modelView, "modelCoverage");
  assert.deepEqual(modelCoveragePage.children, ["PlatformCoverageMatrix"]);
  assert.ok(bridgesPage);
  assert.equal(bridgesPage.pageId, "bridges");
  assert.equal(bridgesPage.props.modelView, "bridges");
  assert.equal(bridgesPage.props.summaryCards, "Bridges=compatibilityBridges@count");
  assert.equal(bridgesPage.props.supplementalPageSource, "bridges");
  assert.deepEqual(bridgesPage.children, ["PlatformBridgesList", "PlatformBridgesDetail"]);
  assert.equal(bridgesPage.summary, "Compatibility bridge inventory for remaining convenience seams.");
  assert.ok(governancePage);
  assert.equal(governancePage.pageId, "governance");
  assert.equal(governancePage.props.modelView, "governance");
  assert.equal(governancePage.props.summaryCards, "Routes=governanceRoutes@count|Proposal Targets=proposalTargetGovernance@count");
  assert.equal(governancePage.props.supplementalPageSource, "governance");
  assert.deepEqual(governancePage.children, ["PlatformGovernanceList", "PlatformGovernanceDetail"]);
  assert.equal(governancePage.summary, "Route and proposal-target governance coverage for mutating platform seams.");
  assert.ok(semanticsPage);
  assert.equal(semanticsPage.pageId, "semantics");
  assert.equal(semanticsPage.props.modelView, "semantics");
  assert.equal(semanticsPage.props.summaryCards, "Mutable Surfaces=mutableSurfaceSemantics@count");
  assert.equal(semanticsPage.props.supplementalPageSource, "semantics");
  assert.deepEqual(semanticsPage.children, ["PlatformSemanticsList", "PlatformSemanticsDetail"]);
  assert.ok(packageCoexistencePage);
  assert.equal(packageCoexistencePage.pageId, "packageCoexistence");
  assert.equal(packageCoexistencePage.props.modelView, "packageCoexistence");
  assert.equal(packageCoexistencePage.props.summaryCards, "Packages=packageCoexistence@count");
  assert.equal(packageCoexistencePage.props.supplementalPageSource, "packageCoexistence");
  assert.deepEqual(packageCoexistencePage.children, ["PlatformPackageCoexistenceList", "PlatformPackageCoexistenceDetail"]);
  assert.ok(packageConvergencePage);
  assert.equal(packageConvergencePage.pageId, "packageConvergence");
  assert.equal(packageConvergencePage.props.modelView, "packageConvergence");
  assert.equal(packageConvergencePage.props.summaryCards, "Packages=packageConvergence@count");
  assert.equal(packageConvergencePage.props.supplementalPageSource, "packageConvergence");
  assert.deepEqual(packageConvergencePage.children, ["PlatformPackageConvergenceList", "PlatformPackageConvergenceDetail"]);
  assert.ok(packageApplyPreviewPage);
  assert.equal(packageApplyPreviewPage.pageId, "packageApplyPreview");
  assert.equal(packageApplyPreviewPage.props.modelView, "packageApplyPreview");
  assert.equal(packageApplyPreviewPage.props.summaryCards, "Revisions=packageApplyPreviews@count");
  assert.equal(packageApplyPreviewPage.props.supplementalPageSource, "packageApplyPreview");
  assert.deepEqual(packageApplyPreviewPage.children, ["PlatformPackageApplyPreviewList", "PlatformPackageApplyPreviewDetail"]);
  const bridgesListSurface = bridgesPage.childSurfaces.find(surface => surface.name === "PlatformBridgesList");
  assert.ok(bridgesListSurface);
  assert.equal(bridgesListSurface.props.listSource, "bridges");
  assert.equal(bridgesListSurface.props.columns, "Bridge|Class|Owner|Status|Surfaces");
  assert.equal(bridgesListSurface.props.rowFields, "Bridge=id@concept|Class=bridgeClass|Owner=owner@value|Status=status|Surfaces=surfaces@value");
  assert.equal(bridgesListSurface.props.emptyState, "No compatibility bridges.");
  const bridgesDetailSurface = bridgesPage.childSurfaces.find(surface => surface.name === "PlatformBridgesDetail");
  assert.ok(bridgesDetailSurface);
  assert.equal(bridgesDetailSurface.props.detailSource, "bridges");
  assert.equal(bridgesDetailSurface.props.detailCardTitle, "Bridge Detail");
  assert.equal(bridgesDetailSurface.props.primaryFields, "Bridge=id@concept|Class=bridgeClass|Owner=owner@value|Status=status|Surfaces=surfaces@value|Sample Targets=sampleTargets@value");
  assert.equal(bridgesDetailSurface.props.emptyState, "No compatibility bridge selected.");
  const governanceListSurface = governancePage.childSurfaces.find(surface => surface.name === "PlatformGovernanceList");
  assert.ok(governanceListSurface);
  assert.equal(governanceListSurface.props.listSource, "governance");
  assert.equal(governanceListSurface.props.columns, "Kind|Object|Mode|Authority|Scope");
  const governanceDetailSurface = governancePage.childSurfaces.find(surface => surface.name === "PlatformGovernanceDetail");
  assert.ok(governanceDetailSurface);
  assert.equal(governanceDetailSurface.props.detailSource, "governance");
  assert.equal(governanceDetailSurface.props.detailCardTitle, "Governance Object Detail");
  assert.equal(governanceDetailSurface.props.primaryFields, "Object=objectLink@concept|Kind=pageKind|Mode=governanceMode|Authority=authorityMechanism|Workflow=workflowRole|Operation=operationSemantics");
  const semanticsListSurface = semanticsPage.childSurfaces.find(surface => surface.name === "PlatformSemanticsList");
  assert.ok(semanticsListSurface);
  assert.equal(semanticsListSurface.props.listSource, "semantics");
  const semanticsDetailSurface = semanticsPage.childSurfaces.find(surface => surface.name === "PlatformSemanticsDetail");
  assert.ok(semanticsDetailSurface);
  assert.equal(semanticsDetailSurface.props.detailSource, "semantics");
  assert.equal(semanticsDetailSurface.props.detailCardTitle, "Mutable Surface Detail");
  const packageCoexistenceListSurface = packageCoexistencePage.childSurfaces.find(surface => surface.name === "PlatformPackageCoexistenceList");
  assert.ok(packageCoexistenceListSurface);
  assert.equal(packageCoexistenceListSurface.props.listSource, "packageCoexistence");
  const packageCoexistenceDetailSurface = packageCoexistencePage.childSurfaces.find(surface => surface.name === "PlatformPackageCoexistenceDetail");
  assert.ok(packageCoexistenceDetailSurface);
  assert.equal(packageCoexistenceDetailSurface.props.detailSource, "packageCoexistence");
  assert.equal(packageCoexistenceDetailSurface.props.detailCardTitle, "Package Coexistence Detail");
  const packageConvergenceListSurface = packageConvergencePage.childSurfaces.find(surface => surface.name === "PlatformPackageConvergenceList");
  assert.ok(packageConvergenceListSurface);
  assert.equal(packageConvergenceListSurface.props.listSource, "packageConvergence");
  const packageConvergenceDetailSurface = packageConvergencePage.childSurfaces.find(surface => surface.name === "PlatformPackageConvergenceDetail");
  assert.ok(packageConvergenceDetailSurface);
  assert.equal(packageConvergenceDetailSurface.props.detailSource, "packageConvergence");
  assert.equal(packageConvergenceDetailSurface.props.detailCardTitle, "Package Convergence Detail");
  const packageApplyPreviewListSurface = packageApplyPreviewPage.childSurfaces.find(surface => surface.name === "PlatformPackageApplyPreviewList");
  assert.ok(packageApplyPreviewListSurface);
  assert.equal(packageApplyPreviewListSurface.props.listSource, "packageApplyPreview");
  const packageApplyPreviewDetailSurface = packageApplyPreviewPage.childSurfaces.find(surface => surface.name === "PlatformPackageApplyPreviewDetail");
  assert.ok(packageApplyPreviewDetailSurface);
  assert.equal(packageApplyPreviewDetailSurface.props.detailSource, "packageApplyPreview");
  assert.equal(packageApplyPreviewDetailSurface.props.detailCardTitle, "Package Apply Preview Detail");
  const consoleSummarySurface = overviewPage.childSurfaces.find(surface => surface.name === "PlatformConsoleSummary");
  assert.ok(consoleSummarySurface);
  assert.equal(consoleSummarySurface.props.summaryPageId, "overview");
  const profileSurface = modelProfilesPage.childSurfaces.find(surface => surface.name === "PlatformProfileComparison");
  assert.ok(profileSurface);
  assert.equal(profileSurface.props.listSource, "profileComparisonRows");
  assert.equal(profileSurface.props.columns, "Profile|Status|Runner|Composition|Plugins|Capabilities");
  assert.equal(profileSurface.props.rowFields, "Profile=id|Status=status|Runner=runnerSummary|Composition=compositionSummary|Plugins=pluginCount|Capabilities=capabilityCount");
  assert.equal(profileSurface.props.sortOptions, "profile=id|status=status|runner=runnerSummary|composition=compositionSummary|plugins=pluginCount|capabilities=capabilityCount");
  assert.equal(profileSurface.props.defaultSort, "profile:asc");
  assert.equal(profileSurface.props.pageSize, "12");
  const modelListSurface = modelObjectsPage.childSurfaces.find(surface => surface.name === "PlatformModelList");
  assert.ok(modelListSurface);
  assert.equal(modelListSurface.props.listSource, "modelItems");
  assert.equal(modelListSurface.props.rowFields, "Kind=pageKind|Status=status|Resource=id@concept|Source=scope|Owner=summary");
  assert.equal(modelListSurface.props.sortOptions, "kind=pageKind|status=status|resource=title|source=scope|owner=summary");
  assert.equal(modelListSurface.props.defaultSort, "kind:asc");
  const coverageSurface = modelCoveragePage.childSurfaces.find(surface => surface.name === "PlatformCoverageMatrix");
  assert.ok(coverageSurface);
  assert.equal(coverageSurface.props.listSource, "coverageRows");
  assert.equal(coverageSurface.props.rowFields, "Gate=gateId@concept|Target=targetId||targetLabel@concept|Kind=coverageKind");
  assert.equal(coverageSurface.props.sortOptions, "gate=gateId|target=targetId|kind=coverageKind");
  assert.equal(coverageSurface.props.defaultSort, "gate:asc");
  assert.equal(coverageSurface.props.pageSize, "12");
  const modelDetailSurface = modelObjectsPage.childSurfaces.find(surface => surface.name === "PlatformModelDetail");
  assert.ok(modelDetailSurface);
  assert.equal(modelDetailSurface.props.detailSource, "model");
  assert.equal(modelDetailSurface.props.detailSelectionSources, "nodes");
  assert.equal(modelDetailSurface.props.emptyTitle, "Detail");
  assert.equal(modelDetailSurface.props.emptyState, "No platform objects are projected yet.");
  assert.deepEqual(modelDetailSurface.children, [
    "PlatformModelPrimaryPanel",
    "PlatformModelRelationships"
  ]);
  assert.deepEqual(modelDetailSurface.childSurfaces.map(surface => surface.props.detailPanelRole || null), [
    "primary",
    "relationships"
  ]);
  assert.deepEqual(modelDetailSurface.childSurfaces.map(surface => surface.props.detailKinds || null), [
    "object",
    "object"
  ]);
  assert.equal(modelDetailSurface.childSurfaces.some(surface => surface.name === "PlatformModelRelationships" && surface.summary === "Linked graph relationships for the selected platform object when available."), true);
  const modelRelationshipsSurface = modelDetailSurface.childSurfaces.find(surface => surface.name === "PlatformModelRelationships");
  assert.ok(modelRelationshipsSurface);
  assert.equal(modelRelationshipsSurface.props.columns, "From|Relation|To");
  assert.equal(modelRelationshipsSurface.props.rowFields, "From=from@concept|Relation=rel|To=to@concept");
  assert.equal(modelRelationshipsSurface.props.rowLimit, "20");
  const modelPrimarySurface = modelDetailSurface.childSurfaces.find(surface => surface.name === "PlatformModelPrimaryPanel");
  assert.ok(modelPrimarySurface);
  assert.equal(modelPrimarySurface.props.longTailCardTitle, "Properties");
  assert.equal(modelPrimarySurface.props.longTailValueKinds, "string|number|boolean|scalarList");
  assert.equal(modelPrimarySurface.props.objectCardTitle, "Platform Object Detail");
  assert.match(modelPrimarySurface.props.objectFields, /Object=id@concept/);
});

test("platform page views filter the model to page-scoped slices", () => {
  const model = {
    lifecycleVocabulary: ["author", "verify"],
    lifecycleBoard: [{ id: "author", title: "author", count: 1, countLabel: "1 object", nodes: [{ id: "plugin.platform", titleLink: { id: "plugin.platform", title: "plugin.platform" }, kind: "plugin" }] }],
    nodes: [
      { id: "plugin.platform", kind: "plugin" },
      { id: "telemetryMetric:platform.self", kind: "telemetryMetric" },
      { id: "boundary:testRunner.platform", kind: "boundary" },
      { id: "defectCluster:platform", kind: "defectCluster" }
    ],
    edges: [
      { from: "telemetryMetric:platform.self", rel: "observes", to: "plugin.platform" },
      { from: "boundary:testRunner.platform", rel: "guards", to: "plugin.platform" },
      { from: "folder:docs", rel: "contains", to: "doc:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" }
    ],
    docs: [{ path: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" }],
    folders: [{ id: "folder:docs", title: "Docs", path: "docs", facet: "knowledge", source: "docs/this.folder.wtoml" }],
    gaps: [{ id: "gap.platform", kind: "missing-coverage" }],
    profiles: [{ id: "full", status: "active" }],
    changeSets: [{ id: "changeSet:platform", status: "draft" }],
    branches: [{ id: "branch:platform", status: "open" }],
    branchBoard: [{ id: "draft", title: "Draft", count: 1, countLabel: "1 branch", branches: [{ id: "branch:platform", titleLink: { id: "branch:platform", title: "branch:platform" }, status: "open", activitySummary: "change sets 0" }] }],
    branchLifecycleVocabulary: ["author"],
    changeSetEdits: [{ id: "changeSetEdit:platform:rvm", changeSetId: "changeSet:platform" }],
    candidateSnapshots: [{ id: "candidateSnapshot:platform", branchId: "branch:platform", changeSetId: "changeSet:platform" }],
    proposals: [{ id: "proposal:platform", status: "open" }],
    proposalActions: [{ action: "proposal.create" }],
    testGates: [{ id: "gate:platform", title: "Platform Gate" }],
    testRuns: [{ id: "testRun:platform", gateId: "gate:platform", status: "passed" }],
    runtimeRevisions: [{ id: "runtimeRevision:platform", revision: 7, status: "active" }],
    activeRuntimeRevision: { id: "runtimeRevision:platform", revision: 7, status: "active" },
    snapshotBuilds: [{ id: "snapshotBuild:platform", candidateSnapshotId: "candidateSnapshot:platform" }],
    snapshotBuildErrors: [{ id: "snapshotBuildError:platform", candidateSnapshotId: "candidateSnapshot:platform" }],
    snapshotDiagnostics: { appRevision: 7 },
    testMonitorDiagnostics: { status: "idle", pendingSourceCount: 0, pendingChangeSetCount: 0 },
    compatibilityBridges: [{ id: "compatibilityBridge:canonicalIdSugar.sameContextVisibleTarget", bridgeClass: "canonical-id-sugar", owner: "context.naming", surfaces: ["src/modules.js"], sampleTargets: [], status: "policy" }],
    governanceRoutes: [{ id: "governanceRoute:POST /api/platform-change-sets/demo/apply", routeId: "route:POST /api/platform-change-sets/demo/apply", method: "POST", matcher: "/api/platform-change-sets/demo/apply", handler: "platform.changeSet.apply", operationSemantics: "governed-mutation", governanceMode: "direct-authority", authorityMechanism: "platform-policy:platform.execute.operator", sharedAuthorityPath: false, workflowRole: "direct-mutation", notes: "Platform change-set apply evaluates the operator execution policy before mutating active platform state.", ownerClass: "runtime-plugin", ownerBundleId: "bundle-platform", ownerPluginId: "plugin.platform" }],
    proposalTargetGovernance: [{ id: "governanceProposalTarget:runtimePlugin.install", targetProcess: "runtimePlugin.install", operationSemantics: "governed-mutation", governanceMode: "proposal-fallback", authorityMechanism: "bootstrap-target-authority", sharedAuthorityPath: true, workflowRole: "proposal-target", bootstrapSelectable: true, notes: "Runtime-plugin install proposals execute through shared server-runner target authority once approved." }],
    authorityPolicies: [{ id: "authorityPolicy:platform.read.general", policyKey: "platform.read.general", title: "Platform General Read", requiredAuthority: "platform.read.general", accessClass: "read", sensitivity: "general", summary: "General platform reads.", source: "platform-policy" }],
    authorityDecisions: [{ id: "authorityDecision:w_demo", policyId: "authorityPolicy:platform.read.general", action: "platform.model.read", decision: "allow", requiredAuthority: "platform.read.general", handlerId: "platform.model.read", routeId: "route:GET /api/platform-model", view: "overview", effectiveActor: "aaron", targetObjectId: "plugin.platform", reason: "authenticated actor aaron may read general platform surfaces" }],
    artifacts: [{ id: "artifact:testRun:platform:stdout", artifactKind: "stdout", producerKind: "testRun", producerId: "testRun:platform", testRunId: "testRun:platform", sessionId: "session.platform", executionId: "execution:w_demo", branchId: "branch:platform", changeSetId: "changeSet:platform", candidateSnapshotId: "candidateSnapshot:platform", gateId: "gate:platform", contentType: "text/plain", sizeBytes: 14, preview: "platform stdout", contentUrl: "/api/platform-artifacts/artifact%3AtestRun%3Aplatform%3Astdout/content", artifactSourceId: "testArtifact:testRun:platform:stdout" }],
    sessions: [{ id: "session.platform", effectiveActor: "aaron", authorityMode: "direct", executionIds: ["execution:w_demo"], authorityDecisionIds: ["authorityDecision:w_demo"], branchIds: ["branch:platform"], changeSetIds: ["changeSet:platform"], pushRecordIds: ["pushRecord:platform:1"], shipRecordIds: ["shipRecord:platform:1"], testRunIds: ["testRun:platform"], executionCount: 1, authorityDecisionCount: 1, startedAt: "2026-01-01T00:00:00.000Z", lastActivityAt: "2026-01-01T00:01:00.000Z" }],
    executions: [{ id: "execution:w_demo", sessionId: "session.platform", title: "platform.model.read", executionKind: "read", status: "observed", handlerId: "platform.model.read", routeId: "route:GET /api/platform-model", view: "overview", branchId: "branch:platform", changeSetId: "changeSet:platform", pushRecordId: "pushRecord:platform:1", shipRecordId: "shipRecord:platform:1", testRunId: "testRun:platform", targetObjectIds: ["plugin.platform"] }],
    sessionTags: [{ id: "sessionTag:platform:branch", sessionId: "session.platform", tagKind: "branch", value: "branch:platform", executionIds: ["execution:w_demo"] }],
    executionArtifacts: [{ id: "executionArtifact:platform:push", executionId: "execution:w_demo", sessionId: "session.platform", artifactKind: "pushRecord", artifactId: "pushRecord:platform:1", producedAt: "2026-01-01T00:01:00.000Z" }],
    mutableSurfaceSemantics: [{ id: "mutableSurface:demo.privateNotes", surface: "demo.privateNotes", title: "Private Notes", sharingClass: "personal", stateClass: "actor-scoped", visibilityRule: "actor-private", authorityRule: "request-actor", mutationMode: "direct", variantOf: null, readSurfaces: ["/api/private-notes"], mutationSurfaces: ["POST /api/private-notes"], witnessProcesses: ["privateNote.create"], sourceFiles: ["plugins/demo/projections.js"], variants: [], notes: "Private notes stay actor-private." }],
    branchTestRedGreen: [{ id: "branchRedGreen:platform", branchId: "branch:platform", status: "green" }],
    changeSetTestRedGreen: [{ id: "changeSetRedGreen:platform", changeSetId: "changeSet:platform", status: "green" }],
    latestTestResultsByGate: { "gate:platform": { runId: "testRun:platform", status: "passed" } },
    telemetryThresholds: [{ id: "telemetryThreshold:platform.self.http", metricId: "telemetryMetric:platform.self" }],
    telemetrySamples: [{ id: "telemetrySample:platform", metricId: "telemetryMetric:platform.self", ownerId: "backend.readPlatformModel", status: "observed" }],
    telemetryWindows: [{ id: "telemetryWindow:platform", metricId: "telemetryMetric:platform.self", ownerId: "backend.readPlatformModel", status: "observed" }],
    performanceRegressions: [{ id: "performanceRegression:platform", metricId: "telemetryMetric:platform.self", ownerId: "backend.readPlatformModel", status: "open" }],
    defects: [{ id: "defect:platform", clusterId: "defectCluster:platform", metricId: "telemetryMetric:platform.self", status: "open" }],
    defectObservations: [{ id: "defectObservation:platform", defectId: "defect:platform", metricId: "telemetryMetric:platform.self", status: "observed" }],
    defectClusters: [{ id: "defectCluster:platform", defectIds: ["defect:platform"], observationIds: ["defectObservation:platform"], status: "open" }],
    gitRemotes: [{ id: "gitRemote:origin", name: "origin", remoteUrl: "https://github.com/example/platform.git", provider: "github" }],
    gitRefs: [{ id: "gitRef:refs/heads/platform/demo", refName: "refs/heads/platform/demo", shortName: "platform/demo", scope: "localBranch", objectId: "abc123" }],
    pushRecords: [{ id: "pushRecord:platform:1", branchId: "branch:platform", changeSetId: "changeSet:platform", status: "pushed", remoteName: "origin", gitBranchName: "platform/demo", localBranchRef: "refs/heads/platform/demo", remoteBranchRef: "refs/heads/platform/demo", commitSha: "abc123" }],
    releaseChannels: [{ id: "releaseChannel:local", name: "local", title: "Local", executable: true }],
    shipRecords: [{ id: "shipRecord:platform:1", branchId: "branch:platform", changeSetId: "changeSet:platform", pushRecordId: "pushRecord:platform:1", releaseChannelId: "releaseChannel:local", status: "shipped", proposalId: "proposal:platform-ship", observationStatus: "open" }],
    docSections: [{ id: "docSection:platform", doc: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" }],
    docTasks: [{ id: "docTask:platform", doc: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" }],
    roadmapTasks: [{ id: "roadmapTask:platform", doc: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" }],
    epics: [{ id: "epic:platform" }],
    features: [{ id: "feature:platform" }],
    coverageEdges: [{ id: "coverageEdge:platform", gateId: "gate:platform", targetId: "plugin.platform" }],
    summaries: { byKind: { plugin: 1 } }
  };

  const overview = filterPlatformModel(model, "overview");
  const workflow = filterPlatformModel(model, "workflow");
  const verification = filterPlatformModel(model, "verification");
  const knowledge = filterPlatformModel(model, "knowledge");
  const knowledgeDocs = filterPlatformModel(model, "knowledgeDocs");
  const knowledgeFolders = filterPlatformModel(model, "knowledgeFolders");
  const knowledgeRoadmap = filterPlatformModel(model, "knowledgeRoadmap");
  const signals = filterPlatformModel(model, "signals");
  const signalsGaps = filterPlatformModel(model, "signalsGaps");
  const signalsCatalog = filterPlatformModel(model, "signalsCatalog");
  const telemetry = filterPlatformModel(model, "telemetry");
  const defects = filterPlatformModel(model, "defects");
  const security = filterPlatformModel(model, "security");
  const artifacts = filterPlatformModel(model, "artifacts");
  const sessions = filterPlatformModel(model, "sessions");
  const pushes = filterPlatformModel(model, "pushes");
  const ships = filterPlatformModel(model, "ships");
  const modelPage = filterPlatformModel(model, "model");
  const modelObjects = filterPlatformModel(model, "modelObjects");
  const modelProfiles = filterPlatformModel(model, "modelProfiles");
  const modelCoverage = filterPlatformModel(model, "modelCoverage");
  const bridges = filterPlatformModel(model, "bridges");
  const governance = filterPlatformModel(model, "governance");
  const semantics = filterPlatformModel(model, "semantics");

  assert.deepEqual(Object.keys(overview).sort(), ["changeSets", "docs", "gaps", "lifecycleBoard", "lifecycleVocabulary", "nodes", "profiles", "summaries", "testGates"]);
  assert.deepEqual(Object.keys(workflow).sort(), ["branchBoard", "branchLifecycleVocabulary", "branches", "candidateSnapshots", "changeSetEdits", "changeSets", "proposalActions", "proposals", "pushRecords", "shipRecords", "summaries", "verificationRequirementSummaries", "verificationRequirements"]);
  assert.deepEqual(Object.keys(verification).sort(), ["activeRuntimeRevision", "branchTestRedGreen", "candidateSnapshots", "changeSetTestRedGreen", "latestTestResultsByGate", "runtimeRevisions", "snapshotBuildErrors", "snapshotBuilds", "snapshotDiagnostics", "summaries", "testArtifacts", "testCases", "testGates", "testMonitorDiagnostics", "testReports", "testRuns", "testSuites", "verificationExecutions", "verificationFreshness", "verificationInvalidations", "verificationPersistence", "verificationPolicies", "verificationQueue", "verificationRequirementSummaries", "verificationRequirements"]);
  assert.deepEqual(Object.keys(knowledge).sort(), ["docTasks", "docs", "epics", "features", "folders", "roadmapTasks", "summaries"]);
  assert.deepEqual(Object.keys(knowledgeDocs).sort(), ["docSections", "docTasks", "docs", "summaries"]);
  assert.deepEqual(Object.keys(knowledgeFolders).sort(), ["edges", "folders", "summaries"]);
  assert.deepEqual(Object.keys(knowledgeRoadmap).sort(), ["epics", "features", "roadmapTasks", "summaries"]);
  assert.deepEqual(Object.keys(signals).sort(), ["gaps", "nodes", "summaries"]);
  assert.deepEqual(Object.keys(signalsGaps).sort(), ["gaps", "summaries"]);
  assert.deepEqual(Object.keys(signalsCatalog).sort(), ["edges", "nodes", "summaries"]);
  assert.deepEqual(Object.keys(telemetry).sort(), ["branches", "changeSets", "latestTestResultsByGate", "materializedViewStates", "performanceRegressions", "resourceProbeOperations", "summaries", "telemetryEdges", "telemetryMetrics", "telemetrySamples", "telemetryThresholds", "telemetryWindows", "testGates"]);
  assert.deepEqual(Object.keys(defects).sort(), ["branches", "changeSets", "defectClusters", "defectObservations", "defects", "proposals", "summaries", "testGates"]);
  assert.deepEqual(Object.keys(artifacts).sort(), ["artifacts", "branches", "candidateSnapshots", "changeSets", "executions", "proposals", "sessions", "summaries", "testReports", "testResults", "testRuns"]);
  assert.deepEqual(Object.keys(sessions).sort(), ["authorityDecisions", "branches", "changeSets", "executionArtifacts", "executions", "proposals", "pushRecords", "sessionTags", "sessions", "shipRecords", "summaries", "testRuns"]);
  assert.deepEqual(Object.keys(pushes).sort(), ["branches", "changeSets", "defects", "gitRefs", "gitRemotes", "proposals", "pushRecords", "summaries"]);
  assert.deepEqual(Object.keys(ships).sort(), ["branches", "changeSets", "defects", "latestTestResultsByGate", "performanceRegressions", "proposals", "pushRecords", "releaseChannels", "shipRecords", "summaries", "testGates"]);
  assert.deepEqual(Object.keys(security).sort(), ["authorityDecisions", "authorityPolicies", "branches", "changeSets", "governanceRoutes", "proposalTargetGovernance", "proposals", "pushRecords", "shipRecords", "summaries"]);
  assert.deepEqual(Object.keys(modelPage).sort(), ["coverageEdges", "edges", "nodes", "profiles", "summaries"]);
  assert.deepEqual(Object.keys(modelObjects).sort(), ["edges", "nodes", "summaries"]);
  assert.deepEqual(Object.keys(modelProfiles).sort(), ["profiles", "summaries"]);
  assert.deepEqual(Object.keys(modelCoverage).sort(), ["coverageEdges", "summaries"]);
  assert.deepEqual(Object.keys(bridges).sort(), ["compatibilityBridges", "summaries"]);
  assert.deepEqual(Object.keys(governance).sort(), ["governanceRoutes", "proposalTargetGovernance", "summaries"]);
  assert.deepEqual(Object.keys(semantics).sort(), ["mutableSurfaceSemantics", "summaries"]);
  assert.equal("nodes" in workflow, false);
  assert.equal("docs" in verification, false);
  assert.equal(signals.nodes.length, 3);
  assert.equal(knowledgeFolders.folders.length, 1);
  assert.equal(knowledgeFolders.edges.length, 3);
  assert.equal("edges" in signals, false);
  assert.equal(signalsGaps.gaps.length, 1);
  assert.equal(signalsCatalog.edges.length, 2);
  assert.equal(telemetry.telemetryMetrics.length, 1);
  assert.equal(telemetry.telemetrySamples.length, 1);
  assert.equal(telemetry.performanceRegressions.length, 1);
  assert.equal(defects.defects.length, 1);
  assert.equal(defects.defectObservations.length, 1);
  assert.equal(defects.defectClusters.length, 1);
  assert.equal(artifacts.artifacts.length, 1);
  assert.equal(artifacts.sessions.length, 1);
  assert.equal(artifacts.executions.length, 1);
  assert.equal(sessions.sessions.length, 1);
  assert.equal(sessions.executions.length, 1);
  assert.equal(sessions.sessionTags.length, 1);
  assert.equal(sessions.executionArtifacts.length, 1);
  assert.equal(pushes.pushRecords.length, 1);
  assert.equal(pushes.gitRemotes.length, 1);
  assert.equal(pushes.gitRefs.length, 1);
  assert.equal(ships.shipRecords.length, 1);
  assert.equal(ships.releaseChannels.length, 1);
  assert.equal(signals.nodes.some(node => node.id === "plugin.platform"), false);
  assert.equal(modelObjects.nodes.length, model.nodes.length);
  assert.equal(modelProfiles.profiles.length, 1);
  assert.equal(modelCoverage.coverageEdges.length, 1);
  assert.equal(bridges.compatibilityBridges.length, 1);
  assert.equal(governance.governanceRoutes.length, 1);
  assert.equal(governance.proposalTargetGovernance.length, 1);
  assert.equal(semantics.mutableSurfaceSemantics.length, 1);
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

test("platform telemetry and defect projectors derive regressions, hot loops, and clusters deterministically", async () => withRegisteredPluginProjectors(providers, async () => {
  const witnesses = [
    {
      id: "sample.http.1",
      process: "backend.readPlatformModel",
      time: "2026-06-18T00:00:00.000Z",
      body: {
        durationMs: 55,
        routeId: "route:GET /platform",
        handlerId: "backend.readPlatformModel",
        section: "summary",
        startedAt: "2026-06-18T00:00:00.000Z",
        finishedAt: "2026-06-18T00:00:00.055Z"
      }
    },
    {
      id: "sample.http.2",
      process: "backend.readPlatformModel",
      time: "2026-06-18T00:01:00.000Z",
      body: {
        durationMs: 60,
        routeId: "route:GET /platform",
        handlerId: "backend.readPlatformModel",
        section: "summary",
        startedAt: "2026-06-18T00:01:00.000Z",
        finishedAt: "2026-06-18T00:01:00.060Z"
      }
    },
    {
      id: "sample.http.3",
      process: "backend.readPlatformModel",
      time: "2026-06-18T00:02:00.000Z",
      body: {
        durationMs: 58,
        routeId: "route:GET /platform",
        handlerId: "backend.readPlatformModel",
        section: "summary",
        startedAt: "2026-06-18T00:02:00.000Z",
        finishedAt: "2026-06-18T00:02:00.058Z"
      }
    },
    {
      id: "sample.http.4",
      process: "backend.readPlatformModel",
      time: "2026-06-18T00:03:00.000Z",
      body: {
        durationMs: 142,
        routeId: "route:GET /platform",
        handlerId: "backend.readPlatformModel",
        section: "summary",
        startedAt: "2026-06-18T00:03:00.000Z",
        finishedAt: "2026-06-18T00:03:00.142Z"
      }
    },
    {
      id: "sample.http.5",
      process: "backend.readPlatformModel",
      time: "2026-06-18T00:04:00.000Z",
      body: {
        durationMs: 148,
        routeId: "route:GET /platform",
        handlerId: "backend.readPlatformModel",
        section: "summary",
        startedAt: "2026-06-18T00:04:00.000Z",
        finishedAt: "2026-06-18T00:04:00.148Z"
      }
    },
    {
      id: "sample.http.6",
      process: "backend.readPlatformModel",
      time: "2026-06-18T00:05:00.000Z",
      body: {
        durationMs: 145,
        routeId: "route:GET /platform",
        handlerId: "backend.readPlatformModel",
        section: "summary",
        startedAt: "2026-06-18T00:05:00.000Z",
        finishedAt: "2026-06-18T00:05:00.145Z"
      }
    },
    {
      id: "sample.gate.1",
      process: "platform.test.run.finish",
      time: "2026-06-18T00:06:00.000Z",
      body: {
        id: "testRun:demo-1",
        gateId: "gate:demo",
        branchId: "branch:demo",
        changeSetId: "changeSet:demo",
        candidateSnapshotId: "candidateSnapshot:demo",
        protectedObjects: ["telemetryMetric:verification.gates"],
        status: "failed",
        durationMs: 70,
        error: "boom",
        startedAt: "2026-06-18T00:06:00.000Z",
        finishedAt: "2026-06-18T00:06:00.070Z"
      }
    },
    {
      id: "sample.gate.2",
      process: "platform.test.run.finish",
      time: "2026-06-18T00:06:30.000Z",
      body: {
        id: "testRun:demo-2",
        gateId: "gate:demo",
        branchId: "branch:demo",
        changeSetId: "changeSet:demo",
        candidateSnapshotId: "candidateSnapshot:demo",
        protectedObjects: ["telemetryMetric:verification.gates"],
        status: "failed",
        durationMs: 72,
        error: "boom",
        startedAt: "2026-06-18T00:06:30.000Z",
        finishedAt: "2026-06-18T00:06:30.072Z"
      }
    },
    {
      id: "sample.gate.3",
      process: "platform.test.run.finish",
      time: "2026-06-18T00:07:00.000Z",
      body: {
        id: "testRun:demo-3",
        gateId: "gate:demo",
        branchId: "branch:demo",
        changeSetId: "changeSet:demo",
        candidateSnapshotId: "candidateSnapshot:demo",
        protectedObjects: ["telemetryMetric:verification.gates"],
        status: "failed",
        durationMs: 74,
        error: "boom",
        startedAt: "2026-06-18T00:07:00.000Z",
        finishedAt: "2026-06-18T00:07:00.074Z"
      }
    }
  ];

  const thresholds = moduleProjectors.telemetryThresholds(witnesses);
  const samples = moduleProjectors.telemetrySamples(witnesses);
  const windows = moduleProjectors.telemetryWindows(witnesses);
  const regressions = moduleProjectors.performanceRegressions(witnesses);
  const defects = moduleProjectors.defects(witnesses);
  const observations = moduleProjectors.defectObservations(witnesses);
  const clusters = moduleProjectors.defectClusters(witnesses);

  assert.equal(thresholds.length >= 3, true);
  assert.equal(samples.length, 9);
  assert.equal(windows.some(row => row.metricId === "telemetryMetric:platform.self" && row.currentAggregateMs > row.previousAggregateMs), true);
  assert.equal(regressions.some(row => row.metricId === "telemetryMetric:platform.self" && row.ownerId === "backend.readPlatformModel"), true);
  assert.equal(defects.some(row => row.defectKind === "performanceRegression" && row.metricId === "telemetryMetric:platform.self"), true);
  assert.equal(defects.some(row => row.defectKind === "slowSample" && row.metricId === "telemetryMetric:platform.self"), true);
  assert.equal(defects.some(row => row.defectKind === "hotLoop" && row.gateId === "gate:demo"), true);
  assert.equal(defects.some(row => row.defectKind === "failingGate" && row.gateId === "gate:demo"), true);
  assert.equal(observations.some(row => row.sourceKind === "performanceRegression"), true);
  assert.equal(observations.filter(row => row.defectId.startsWith("defect:hotLoop:")).length, 3);
  assert.equal(clusters.some(row => row.id === "defectCluster:telemetrymetric-platform-self" && row.defectCount >= 2), true);
  assert.equal(clusters.some(row => row.id === "defectCluster:gate-demo" && row.defectCount >= 2), true);
}));

test("platform session projectors derive sessions, executions, tags, and artifacts deterministically", async () => withRegisteredPluginProjectors(providers, async () => {
  const witnesses = [
    {
      id: "w_decision",
      process: "platform.authority.decision",
      actor: "aaron",
      body: {
        action: "platform.model.read",
        kind: "read",
        handlerId: "platform.model.read",
        routeId: "route:GET /api/platform-model",
        requestPath: "/api/platform-model?view=sessions",
        view: "sessions",
        targetObjectId: "plugin.platform",
        sessionId: "session.platform",
        policyId: "authorityPolicy:platform.read.sensitive",
        requiredAuthority: "platform.read.sensitive",
        decision: "allow",
        reason: "platform steward may read sensitive platform surfaces",
        authenticatedActor: "aaron",
        effectiveActor: "aaron",
        authorityMode: "direct",
        evaluatedAt: "2026-01-01T00:00:00.000Z"
      }
    },
    {
      id: "w_read",
      process: "backend.readPlatformModel",
      actor: "backendHost",
      body: {
        sessionId: "session.platform",
        handlerId: "platform.model.read",
        routeId: "route:GET /api/platform-model",
        requestPath: "/api/platform-model?view=sessions",
        view: "sessions",
        targetObjectId: "plugin.platform",
        authenticatedActor: "aaron",
        effectiveActor: "aaron",
        authorityMode: "direct",
        authorityDecisionId: "authorityDecision:w_decision",
        authorityPolicyId: "authorityPolicy:platform.read.sensitive",
        runtimeProfile: "full",
        startedAt: "2026-01-01T00:00:01.000Z",
        finishedAt: "2026-01-01T00:00:02.000Z",
        durationMs: 11
      }
    },
    {
      id: "w_validate",
      process: "platform.changeSet.validate",
      actor: "aaron",
      body: {
        id: "changeSet.demo",
        branchId: "branch.demo",
        session: "session.platform",
        status: "valid",
        startedAt: "2026-01-01T00:01:00.000Z",
        validatedAt: "2026-01-01T00:01:03.000Z",
        durationMs: 31,
        candidateSnapshot: {
          id: "candidateSnapshot:changeSet.demo:1"
        }
      }
    },
    {
      id: "w_push",
      process: "platform.branch.push",
      actor: "aaron",
      body: {
        id: "pushRecord:branch.demo:1",
        branchId: "branch.demo",
        changeSetId: "changeSet.demo",
        session: "session.platform",
        status: "pushed",
        gitBranchName: "platform/demo",
        createdAt: "2026-01-01T00:02:00.000Z"
      }
    }
  ];

  const sessions = platformModuleProjectors.sessions(witnesses);
  const executions = platformModuleProjectors.executions(witnesses);
  const sessionTags = platformModuleProjectors.sessionTags(witnesses);
  const executionArtifacts = platformModuleProjectors.executionArtifacts(witnesses);
  const decisions = platformModuleProjectors.authorityDecisions(witnesses);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, "session.platform");
  assert.equal(sessions[0].effectiveActor, "aaron");
  assert.equal(sessions[0].executionCount, 3);
  assert.equal(sessions[0].authorityDecisionCount, 1);
  assert.equal(sessions[0].branchIds.includes("branch.demo"), true);
  assert.equal(sessions[0].changeSetIds.includes("changeSet.demo"), true);
  assert.equal(executions.some(row => row.sourceProcess === "backend.readPlatformModel" && row.authorityDecisionId === "authorityDecision:w_decision"), true);
  assert.equal(executions.some(row => row.sourceProcess === "platform.changeSet.validate" && row.candidateSnapshotId === "candidateSnapshot:changeSet.demo:1"), true);
  assert.equal(executions.some(row => row.sourceProcess === "platform.branch.push" && row.pushRecordId === "pushRecord:branch.demo:1"), true);
  assert.equal(sessionTags.some(row => row.tagKind === "view" && row.value === "sessions"), true);
  assert.equal(sessionTags.some(row => row.tagKind === "branch" && row.value === "branch.demo"), true);
  assert.equal(executionArtifacts.some(row => row.artifactKind === "authorityDecision" && row.artifactId === "authorityDecision:w_decision"), true);
  assert.equal(executionArtifacts.some(row => row.artifactKind === "candidateSnapshot" && row.artifactId === "candidateSnapshot:changeSet.demo:1"), true);
  assert.equal(executionArtifacts.some(row => row.artifactKind === "pushRecord" && row.artifactId === "pushRecord:branch.demo:1"), true);
  assert.equal(decisions[0].sessionId, "session.platform");
}));

test("platform artifact projectors derive canonical artifacts and execution provenance deterministically", async () => withRegisteredPluginProjectors(providers, async () => {
  const witnesses = [
    {
      id: "w_run",
      process: "platform.test.run.finish",
      actor: "aaron",
      body: {
        id: "testRun:demo",
        title: "Demo run",
        gateId: "gate:demo",
        branchId: "branch.demo",
        changeSetId: "changeSet.demo",
        candidateSnapshotId: "candidateSnapshot:demo:1",
        session: "session.platform",
        stdout: "stdout text",
        stderr: "stderr text",
        startedAt: "2026-01-01T00:00:00.000Z",
        finishedAt: "2026-01-01T00:00:01.000Z",
        status: "passed"
      }
    }
  ];

  const artifacts = platformModuleProjectors.artifacts(witnesses);
  const executionArtifacts = platformModuleProjectors.executionArtifacts(witnesses);
  const testArtifacts = platformModuleProjectors.testArtifacts(witnesses);

  assert.equal(artifacts.some(row => row.id === "artifact:testRun:demo:stdout" && row.artifactSourceId === "testArtifact:testRun:demo:stdout"), true);
  assert.equal(artifacts.some(row => row.id === "artifact:testRun:demo:stdout" && row.sessionId === "session.platform" && row.executionId === "execution:w_run"), true);
  assert.equal(artifacts.some(row => row.id === "artifact:testRun:demo:stdout" && row.contentUrl === "/api/platform-artifacts/artifact%3AtestRun%3Ademo%3Astdout/content"), true);
  assert.equal(testArtifacts.some(row => row.id === "testArtifact:testRun:demo:stdout" && row.artifactId === "artifact:testRun:demo:stdout"), true);
  assert.equal(executionArtifacts.some(row => row.artifactKind === "artifact" && row.artifactId === "artifact:testRun:demo:stdout"), true);
})); 

test("platform push projectors derive deterministic push records and pushed branch state", async () => withRegisteredPluginProjectors(providers, async () => {
  const witnesses = [
    {
      id: "branch.demo",
      process: "platform.branch.create",
      time: "2026-06-18T00:00:00.000Z",
      body: {
        id: "branch.demo",
        title: "Demo Branch",
        owner: "aaron",
        createdAt: "2026-06-18T00:00:00.000Z"
      }
    },
    {
      id: "changeset.demo",
      process: "platform.changeSet.create",
      time: "2026-06-18T00:01:00.000Z",
      body: {
        id: "changeset.demo",
        branchId: "branch.demo",
        owner: "aaron",
        createdAt: "2026-06-18T00:01:00.000Z"
      }
    },
    {
      id: "changeset.demo.apply",
      process: "platform.changeSet.apply",
      time: "2026-06-18T00:02:00.000Z",
      body: {
        id: "changeset.demo",
        branchId: "branch.demo",
        candidateSnapshotId: "candidateSnapshot:demo:1",
        status: "applied",
        appliedAt: "2026-06-18T00:02:00.000Z"
      }
    },
    {
      id: "push.demo",
      process: "platform.branch.push",
      time: "2026-06-18T00:03:00.000Z",
      body: {
        id: "pushRecord:branch.demo:1",
        branchId: "branch.demo",
        changeSetId: "changeset.demo",
        status: "pushed",
        remoteName: "origin",
        remoteUrl: "https://github.com/example/platform.git",
        provider: "github",
        gitBranchName: "platform/demo",
        localBranchRef: "refs/heads/platform/demo",
        remoteBranchRef: "refs/heads/platform/demo",
        commitSha: "abc123",
        commitMessage: "platform push platform/demo",
        compareUrl: "https://github.com/example/platform/compare/main...platform%2Fdemo?expand=1",
        pullRequestUrl: "https://github.com/example/platform/pull/new/platform%2Fdemo",
        owner: "aaron",
        createdAt: "2026-06-18T00:03:00.000Z"
      }
    }
  ];

  const pushRecords = moduleProjectors.pushRecords(witnesses);
  const pushRecordIndex = moduleProjectors.pushRecordIndex(witnesses);
  const branches = moduleProjectors.branches(witnesses);

  assert.equal(pushRecords.length, 1);
  assert.equal(pushRecords[0].id, "pushRecord:branch.demo:1");
  assert.equal(pushRecords[0].provider, "github");
  assert.equal(pushRecords[0].compareUrl, "https://github.com/example/platform/compare/main...platform%2Fdemo?expand=1");
  assert.equal(pushRecords[0].pullRequestUrl, "https://github.com/example/platform/pull/new/platform%2Fdemo");
  assert.equal(pushRecordIndex.byBranch["branch.demo"][0].commitSha, "abc123");
  assert.equal(branches[0].gitBranchName, "platform/demo");
  assert.equal(branches[0].latestPushRecordId, "pushRecord:branch.demo:1");
  assert.equal(branches[0].latestPushStatus, "pushed");
  assert.equal(branches[0].status, "pushed");
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
    testReports: [
      { id: "testReport:testRun:demo:summary", runId: "testRun:demo", gateId: "gate:test/runtime-profile.test.js", reportKind: "summary", status: "passed" }
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
  const verificationModel = filterPlatformModel({
    ...model,
    testRuns: [
      { id: "testRun:demo", gateId: "gate:test/runtime-profile.test.js", branchId: "branch.demo", status: "passed" }
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
    testReports: [
      { id: "testReport:testRun:demo:summary", runId: "testRun:demo", gateId: "gate:test/runtime-profile.test.js", reportKind: "summary", status: "passed" }
    ],
    runtimeRevisions: [],
    activeRuntimeRevision: null,
    candidateSnapshots: [],
    snapshotBuilds: [],
    snapshotBuildErrors: [],
    snapshotDiagnostics: {},
    testMonitorDiagnostics: {},
    branchTestRedGreen: [],
    changeSetTestRedGreen: [],
    latestTestResultsByGate: {}
  }, "verification", "testRun:demo");
  const telemetry = filterPlatformModel({
    ...model,
    nodes: [
      { id: "telemetryMetric:platform.self", kind: "telemetryMetric", title: "Platform Self" },
      { id: "telemetryMetric:mcp.availability", kind: "telemetryMetric", title: "MCP Availability" },
      { id: "plugin.platform", kind: "plugin", title: "plugin.platform" }
    ],
    edges: [
      { from: "gate:test/runtime-profile.test.js", rel: "verifies", to: "telemetryMetric:platform.self" },
      { from: "telemetryMetric:platform.self", rel: "verifiedBy", to: "gate:test/runtime-profile.test.js" },
      { from: "plugin.platform", rel: "owns", to: "bundle-platform" }
    ],
    branches: [
      {
        id: "branch.demo",
        telemetryImpactSummaries: [{ id: "platform.self", label: "Platform Self" }]
      }
    ],
    changeSets: [
      {
        id: "changeset.demo",
        branchId: "branch.demo",
        telemetryImpactSummaries: [{ id: "platform.self", label: "Platform Self" }]
      }
    ],
    testGates: [
      {
        id: "gate:test/runtime-profile.test.js",
        protectedObjects: ["telemetryMetric:platform.self"]
      }
    ],
    latestTestResultsByGate: {
      "gate:test/runtime-profile.test.js": { id: "testResult:demo:1", runId: "testRun:demo", gateId: "gate:test/runtime-profile.test.js", status: "passed" }
    }
  }, "telemetry", "branch.demo");
  const branches = filterPlatformModel({
    ...model,
    branches: [{ id: "branch.demo", status: "open" }],
    changeSets: [{ id: "changeset.demo", status: "draft" }],
    candidateSnapshots: [{ id: "candidateSnapshot:demo:1", branchId: "branch.demo", changeSetId: "changeset.demo" }]
  }, "branches");
  const pushes = filterPlatformModel({
    ...model,
    branches: [{ id: "branch.demo", status: "pushed", pushRecordIds: ["pushRecord:demo:1"] }],
    changeSets: [{ id: "changeset.demo", branchId: "branch.demo", status: "applied" }],
    pushRecords: [{ id: "pushRecord:demo:1", branchId: "branch.demo", changeSetId: "changeset.demo", remoteName: "origin", gitBranchName: "platform/demo", localBranchRef: "refs/heads/platform/demo", remoteBranchRef: "refs/heads/platform/demo", status: "pushed" }],
    gitRemotes: [{ id: "gitRemote:origin", name: "origin", remoteUrl: "https://github.com/example/platform.git", provider: "github" }],
    gitRefs: [{ id: "gitRef:refs/heads/platform/demo", refName: "refs/heads/platform/demo", shortName: "platform/demo", scope: "localBranch", objectId: "abc123" }],
    defects: [{ id: "defect:push", pushRecordId: "pushRecord:demo:1", branchId: "branch.demo", changeSetId: "changeset.demo", status: "open" }],
    proposals: [{ id: "proposal:push", targetId: "defect:push", status: "open" }]
  }, "pushes", "branch.demo");
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
  assert.equal(testRuns.testReports[0].id, "testReport:testRun:demo:summary");
  assert.equal(testRuns.latestTestResultsByGate["gate:test/runtime-profile.test.js"].status, "passed");
  assert.equal(verificationModel.testReports[0].id, "testReport:testRun:demo:summary");
  assert.equal(verificationModel.testArtifacts[0].id, "testArtifact:demo:stdout");
  assert.equal(testRedGreen.branchTestRedGreen[0].status, "green");
  assert.equal(testRedGreen.changeSetTestRedGreen[0].status, "red");
  assert.equal(testRedGreen.testGates[0].id, "gate:test/runtime-profile.test.js");
  assert.equal(telemetry.telemetryMetrics.length, 1);
  assert.equal(telemetry.telemetryMetrics[0].id, "telemetryMetric:platform.self");
  assert.equal(telemetry.telemetryEdges.length, 2);
  assert.equal(telemetry.branches[0].id, "branch.demo");
  assert.equal(telemetry.changeSets[0].id, "changeset.demo");
  assert.equal(telemetry.testGates[0].id, "gate:test/runtime-profile.test.js");
  assert.equal(telemetry.latestTestResultsByGate["gate:test/runtime-profile.test.js"].status, "passed");
  assert.equal(branches.branches[0].id, "branch.demo");
  assert.equal(pushes.pushRecords[0].id, "pushRecord:demo:1");
  assert.equal(pushes.gitRemotes[0].id, "gitRemote:origin");
  assert.equal(pushes.gitRefs[0].id, "gitRef:refs/heads/platform/demo");
  assert.equal(pushes.proposals[0].id, "proposal:push");
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

  const pluginTask = model.roadmapTasks.find(task => task.targets.some(target => target.targetId === "plugin.platform"));
  const routeTask = model.roadmapTasks.find(task => task.targets.some(target => target.targetId === "route:GET /platform"));
  const sourceTask = model.roadmapTasks.find(task => task.targets.some(target => target.targetId === "rvm:plugins/platform/platform-console.rvm"));
  const fileTask = model.roadmapTasks.find(task => task.targets.some(target => target.targetId === "file:plugins/platform/platform-page.js"));
  const jsonTask = model.roadmapTasks.find(task => task.targets.some(target => target.targetId === "json:store/seeds/runtime-profiles.json"));
  const testFileTask = model.roadmapTasks.find(task => task.targets.some(target => target.targetId === "file:plugins/platform/platform.test.js"));

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
  assert.equal(testFileTask.targets.some(target => target.targetId === "file:plugins/platform/platform.test.js"), true);
  assert.equal(testFileTask.targets.some(target => target.targetKind === "testFile"), true);
  assert.equal(model.edges.some(edge => edge.from === testFileTask.id && edge.rel === "targets" && edge.to === "file:plugins/platform/platform.test.js"), true);
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

  const task = model.roadmapTasks.find(row => row.targets.some(target => target.targetId === "plugin.platform"));

  assert.ok(task);
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
  assert.equal(platformProposalTemplates().some(template => template.action === "branch.ship"), true);
  assert.equal(platformProposalTemplates().some(template => template.action === "branch.rollback"), true);
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

test("platform security policies enforce steward and operator lanes and emit auditable decisions", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  grantStewardship(world, {
    actor: "platform-owner",
    steward: "steward",
    target: "plugin.platform",
    targetKind: "plugin"
  });
  const sent = [];
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    readJson: async req => req.body,
    authoringServices: {
      requireBootstrapActor: actor => actor === "operator"
        ? { ok: true, actor }
        : { ok: false, status: 403, reason: "operator authority required" },
      executeBootstrapProposal: actor => async proposal => ({ ok: true, actor, proposal })
    },
    sendGateFailure: (res, gate) => sent.push({ status: gate.status, body: { error: gate.reason } }),
    send: () => {},
    sendJson: (res, status, body) => sent.push({ status, body })
  });

  await handlers["platform.changeSet.create"]({
    req: { body: { id: "changeSet.security", title: "Security policy test" } },
    res: {},
    requestActor: "steward",
    requestSession: { id: "session.steward", actor: "steward" }
  });
  assert.equal(sent.at(-1).status, 201);

  await handlers["platform.changeSet.apply"]({
    req: { body: {} },
    res: {},
    params: { id: "changeSet.security" },
    requestActor: "steward",
    requestSession: { id: "session.steward", actor: "steward" }
  });
  assert.equal(sent.at(-1).status, 403);
  assert.equal(sent.at(-1).body.policyId, "authorityPolicy:platform.execute.operator");
  assert.equal(sent.at(-1).body.requiredAuthority, "platform.execute.operator");
  assert.match(sent.at(-1).body.decisionId || "", /^authorityDecision:/);

  await handlers["platform.model.read"]({
    res: {},
    requestUrl: new URL("http://platform.local/api/platform-model?view=security"),
    requestActor: "viewer",
    requestSession: { id: "session.viewer", actor: "viewer" },
    appContext: {
      runtimeProfile: "full",
      project: projector => world.project(projector)
    }
  });
  assert.equal(sent.at(-1).status, 403);
  assert.equal(sent.at(-1).body.policyId, "authorityPolicy:platform.read.sensitive");
  assert.equal(sent.at(-1).body.requiredAuthority, "platform.read.sensitive");
  assert.match(sent.at(-1).body.decisionId || "", /^authorityDecision:/);

  await handlers["platform.model.read"]({
    res: {},
    requestUrl: new URL("http://platform.local/api/platform-model?view=security"),
    requestActor: "aaron",
    requestSession: {
      id: "session.assumed",
      actor: "aaron",
      authenticatedActor: "aaron",
      effectiveActor: "operator",
      authorityMode: "assumed",
      assumptionGrantId: "assumptionGrant:platform-security"
    },
    appContext: {
      runtimeProfile: "full",
      project: projector => world.project(projector)
    }
  });
  assert.equal(sent.at(-1).status, 200);
  assert.equal(Array.isArray(sent.at(-1).body.authorityPolicies), true);
  assert.equal(Array.isArray(sent.at(-1).body.authorityDecisions), true);

  const decisions = world.project(platformModuleProjectors.authorityDecisions);
  assert.equal(decisions.some(row =>
    row.handlerId === "platform.changeSet.create"
    && row.decision === "allow"
    && row.policyId === "authorityPolicy:platform.write.steward"
    && row.effectiveActor === "steward"
  ), true);
  assert.equal(decisions.some(row =>
    row.handlerId === "platform.changeSet.apply"
    && row.decision === "deny"
    && row.policyId === "authorityPolicy:platform.execute.operator"
    && row.effectiveActor === "steward"
  ), true);
  assert.equal(decisions.some(row =>
    row.handlerId === "platform.model.read"
    && row.view === "security"
    && row.decision === "deny"
    && row.policyId === "authorityPolicy:platform.read.sensitive"
    && row.effectiveActor === "viewer"
  ), true);
  assert.equal(decisions.some(row =>
    row.handlerId === "platform.model.read"
    && row.view === "security"
    && row.decision === "allow"
    && row.policyId === "authorityPolicy:platform.read.sensitive"
    && row.authorityMode === "assumed"
    && row.assumptionGrantId === "assumptionGrant:platform-security"
    && row.effectiveActor === "operator"
  ), true);
}));

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
    params: { id: "testRun.platform.demo" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" }
  });

  assert.equal(sent.at(-1).status, 200);
  assert.equal(sent.at(-1).body.testRun.id, "testRun.platform.demo");
  assert.equal(sent.at(-1).body.testResults.length, 1);
  assert.equal(sent.at(-1).body.testArtifacts.length, 4);
  assert.equal(sent.at(-1).body.testSuites.length, 2);
  assert.equal(sent.at(-1).body.testCases.length, 1);
  assert.equal(sent.at(-1).body.testReports.length, 6);
  assert.equal(sent.at(-1).body.regressionSummary.status, "unknown");
  assert.equal(sent.at(-1).body.testRun.environmentInputs.environment, "platform-candidate-snapshot");
  assert.equal(sent.at(-1).body.testResults[0].sourceRevision.branchId, "branch.platform.demo");
}));

test("platform test reports derive TAP summaries and default regression heuristics", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const observeRun = ({ id, startedAt, finishedAt, durationMs, cacheStatus = "miss", stdout = "", stderr = "" }) => {
    const cacheIdentity = { environmentIdentityHash: "env:local-node" };
    world.emit({
      process: "platform.test.run.start",
      actor: "aaron",
      body: {
        id,
        gateId: "gate:demo.tap",
        title: "Demo TAP Gate",
        command: "node --test demo.tap.test.js",
        runner: "node-test",
        environment: "local-node",
        timeoutMs: 5000,
        runtimeProfile: "full",
        cacheStatus,
        cacheIdentity,
        startedAt,
        sourceDependencies: ["tests/demo.tap.test.js"],
        protectedObjects: ["plugin.platform"]
      }
    });
    world.emit({
      process: "platform.test.run.finish",
      actor: "aaron",
      body: {
        id,
        gateId: "gate:demo.tap",
        title: "Demo TAP Gate",
        command: "node --test demo.tap.test.js",
        runner: "node-test",
        environment: "local-node",
        timeoutMs: 5000,
        runtimeProfile: "full",
        cacheStatus,
        cacheIdentity,
        status: "passed",
        startedAt,
        finishedAt,
        durationMs,
        exitCode: 0,
        signal: null,
        stdout,
        stderr,
        timedOut: false,
        error: null,
        results: [{
          id: `testResult:${id}:1`,
          runId: id,
          gateId: "gate:demo.tap",
          title: "Demo TAP Gate",
          status: "passed",
          exitCode: 0,
          signal: null,
          stdout,
          stderr,
          durationMs,
          timedOut: false,
          cacheStatus,
          cacheIdentity,
          producedAt: finishedAt
        }]
      }
    });
  };

  const tapOutput = "TAP version 13\n1..2\nok 1 - boots\nok 2 - verifies\n";
  observeRun({ id: "testRun:tap:1", startedAt: "2026-06-18T00:00:00.000Z", finishedAt: "2026-06-18T00:00:01.000Z", durationMs: 1000, stdout: tapOutput });
  observeRun({ id: "testRun:tap:2", startedAt: "2026-06-18T00:01:00.000Z", finishedAt: "2026-06-18T00:01:01.200Z", durationMs: 1200, stdout: tapOutput });
  observeRun({ id: "testRun:tap:3", startedAt: "2026-06-18T00:02:00.000Z", finishedAt: "2026-06-18T00:02:01.800Z", durationMs: 1800, stdout: tapOutput });
  observeRun({ id: "testRun:tap:4", startedAt: "2026-06-18T00:03:00.000Z", finishedAt: "2026-06-18T00:03:02.500Z", durationMs: 2500, cacheStatus: "hit", stdout: tapOutput });
  observeRun({ id: "testRun:tap:5", startedAt: "2026-06-18T00:04:00.000Z", finishedAt: "2026-06-18T00:04:00.700Z", durationMs: 700, stdout: tapOutput });

  const reports = world.project(moduleProjectors.testReports);
  const summary = reports.find(row => row.id === "testReport:testRun:tap:1:summary");
  const failures = reports.find(row => row.id === "testReport:testRun:tap:1:failures");
  const run1Regression = reports.find(row => row.id === "testReport:testRun:tap:1:regression");
  const steadyRegression = reports.find(row => row.id === "testReport:testRun:tap:2:regression");
  const regressed = reports.find(row => row.id === "testReport:testRun:tap:4:regression");
  const improved = reports.find(row => row.id === "testReport:testRun:tap:5:regression");

  assert.ok(summary);
  assert.equal(summary.format, "tap");
  assert.equal(summary.suiteCount, 1);
  assert.equal(summary.caseCount, 2);
  assert.equal(summary.passedCount, 2);
  assert.equal(summary.failedCount, 0);
  assert.equal(failures.summary, "No failing or error cases were derived for this run.");
  assert.equal(run1Regression.status, "unknown");
  assert.equal(steadyRegression.status, "steady");
  assert.equal(regressed.status, "regressed");
  assert.equal(regressed.regressionSummary.baselineRunId, "testRun:tap:3");
  assert.equal(improved.status, "improved");
  assert.equal(improved.regressionSummary.baselineRunId, "testRun:tap:3");
}));

test("platform test reports derive JUnit failures from structured artifacts", async () => withRegisteredPluginProjectors(providers, async () => {
  const world = createWorld();
  const junit = `<?xml version="1.0" encoding="UTF-8"?><testsuite name="demo" tests="3" failures="1" errors="1" skipped="0"><testcase classname="demo" name="passes" time="0.1" /><testcase classname="demo" name="fails" time="0.2"><failure message="boom">boom</failure></testcase><testcase classname="demo" name="errors" time="0.3"><error message="kaput">kaput</error></testcase></testsuite>`;
  world.emit({
    process: "platform.test.run.start",
    actor: "aaron",
    body: {
      id: "testRun:junit:1",
      gateId: "gate:demo.junit",
      title: "Demo JUnit Gate",
      command: "node --test demo.junit.test.js",
      runner: "node-test",
      environment: "local-node",
      timeoutMs: 5000,
      runtimeProfile: "full",
      cacheStatus: "miss",
      cacheIdentity: { environmentIdentityHash: "env:local-node" },
      startedAt: "2026-06-18T01:00:00.000Z"
    }
  });
  world.emit({
    process: "platform.test.run.finish",
    actor: "aaron",
    body: {
      id: "testRun:junit:1",
      gateId: "gate:demo.junit",
      title: "Demo JUnit Gate",
      command: "node --test demo.junit.test.js",
      runner: "node-test",
      environment: "local-node",
      timeoutMs: 5000,
      runtimeProfile: "full",
      cacheStatus: "miss",
      cacheIdentity: { environmentIdentityHash: "env:local-node" },
      status: "failed",
      startedAt: "2026-06-18T01:00:00.000Z",
      finishedAt: "2026-06-18T01:00:01.900Z",
      durationMs: 1900,
      exitCode: 1,
      signal: null,
      stdout: "",
      stderr: junit,
      timedOut: false,
      error: null,
      results: [{
        id: "testResult:testRun:junit:1:1",
        runId: "testRun:junit:1",
        gateId: "gate:demo.junit",
        title: "Demo JUnit Gate",
        status: "failed",
        exitCode: 1,
        signal: null,
        stdout: "",
        stderr: junit,
        durationMs: 1900,
        timedOut: false,
        cacheStatus: "miss",
        cacheIdentity: { environmentIdentityHash: "env:local-node" },
        producedAt: "2026-06-18T01:00:01.900Z"
      }]
    }
  });

  const byRun = world.project(moduleProjectors.testReportIndex).byRun["testRun:junit:1"];
  const failures = byRun.find(row => row.reportKind === "failures");
  const suites = byRun.find(row => row.reportKind === "suites");

  assert.ok(failures);
  assert.equal(failures.status, "error");
  assert.equal(failures.caseIds.length, 2);
  assert.ok(suites);
  assert.equal(suites.status, "error");
  assert.equal(suites.suiteIds.length, 1);
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
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
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

test("platform branch push rejects branches without an applied change set", async () => withRegisteredPluginProjectors(providers, async () => {
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
    req: { body: { id: "branch.push.reject", title: "Reject Push" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  await handlers["platform.branch.push"]({
    req: { body: {} },
    res: {},
    params: { id: "branch.push.reject" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  assert.equal(sent.at(-1).status, 409);
  assert.match(sent.at(-1).body.error, /no applied change set/i);
}));

test("platform branch push dry runs record push state without marking the branch pushed", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformGitPushFixture();
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

    await stageAppliedPushBranch({
      handlers,
      branchId: "branch.push.dry",
      changeSetId: "changeset.push.dry",
      stagedPath: fixture.stagedPath,
      content: `${JSON.stringify({ version: 2 }, null, 2)}\n`
    });

    await handlers["platform.branch.push"]({
      req: { body: { dryRun: true } },
      res: {},
      params: { id: "branch.push.dry" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: {
        runtimeProfile: "full",
        platformGit: {
          repoRoot: fixture.repoRoot,
          mirrorRoot: fixture.mirrorRoot
        }
      }
    });

    assert.equal(sent.at(-1).status, 200);
    assert.equal(sent.at(-1).body.pushRecord.status, "dryRun");
    assert.equal(sent.at(-1).body.branch.status, "valid");
    assert.equal(sent.at(-1).body.branch.latestPushStatus, "dryRun");

  } finally {
    await removeTempPlatformGitPushFixture(fixture.root);
  }
}));

test("platform branch push creates mirror commits, updates branch state, and records pushed refs", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformGitPushFixture();
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

    await stageAppliedPushBranch({
      handlers,
      branchId: "branch.push.real",
      changeSetId: "changeset.push.real",
      stagedPath: fixture.stagedPath,
      content: `${JSON.stringify({ version: 3 }, null, 2)}\n`
    });

    await handlers["platform.branch.push"]({
      req: { body: {} },
      res: {},
      params: { id: "branch.push.real" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: {
        runtimeProfile: "full",
        platformGit: {
          repoRoot: fixture.repoRoot,
          mirrorRoot: fixture.mirrorRoot
        }
      }
    });

    const response = sent.at(-1);
    assert.equal(response.status, 200);
    assert.equal(response.body.pushRecord.status, "pushed");
    assert.equal(response.body.branch.status, "pushed");
    assert.equal(response.body.pushRecord.remoteName, "origin");
    assert.equal(response.body.pushRecord.provider, "generic");
    assert.match(response.body.pushRecord.commitSha || "", /^[0-9a-f]{40}$/);
    assert.equal(response.body.pushRecord.remoteBranchRef, "refs/heads/platform/push-real");

    const remoteHead = await runGitFixtureCommand(["rev-parse", "refs/heads/platform/push-real"], fixture.remoteRoot);
    assert.equal(remoteHead.stdout.trim(), response.body.pushRecord.commitSha);
  } finally {
    await removeTempPlatformGitPushFixture(fixture.root);
  }
}));

test("platform branch push failures preserve mirror commits and emit linked defect proposals", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformGitPushFixture();
  try {
    const brokenRemoteRoot = path.join(fixture.root, "broken-remote");
    await mkdir(brokenRemoteRoot, { recursive: true });
    await runGitFixtureCommand(["remote", "add", "broken", brokenRemoteRoot], fixture.repoRoot);
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

    await stageAppliedPushBranch({
      handlers,
      branchId: "branch.push.fail",
      changeSetId: "changeset.push.fail",
      stagedPath: fixture.stagedPath,
      content: `${JSON.stringify({ version: 4 }, null, 2)}\n`
    });

    await handlers["platform.branch.push"]({
      req: { body: { remoteName: "broken" } },
      res: {},
      params: { id: "branch.push.fail" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: {
        runtimeProfile: "full",
        platformGit: {
          repoRoot: fixture.repoRoot,
          mirrorRoot: fixture.mirrorRoot
        }
      }
    });

    const response = sent.at(-1);
    assert.equal(response.status, 409);
    assert.equal(response.body.pushRecord.status, "failed");
    assert.match(response.body.pushRecord.commitSha || "", /^[0-9a-f]{40}$/);
    assert.equal(response.body.defect.pushRecordId, response.body.pushRecord.id);
    assert.equal(response.body.proposal.targetId, response.body.defect.id);

    const mirrorHead = await runGitFixtureCommand(["rev-parse", "HEAD"], fixture.mirrorRoot);
    assert.equal(mirrorHead.stdout.trim(), response.body.pushRecord.commitSha);
  } finally {
    await removeTempPlatformGitPushFixture(fixture.root);
  }
}));

test("platform branch ship rejects branches without a successful push record", async () => withRegisteredPluginProjectors(providers, async () => {
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
    req: { body: { id: "branch.ship.reject", title: "Reject Ship" } },
    res: {},
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: { runtimeProfile: "full" }
  });

  await handlers["platform.branch.ship"]({
    req: { body: { releaseChannelId: "releaseChannel:local" } },
    res: {},
    params: { id: "branch.ship.reject" },
    requestActor: "aaron",
    requestSession: { id: "session.platform" },
    appContext: {
      runtimeProfile: "full",
      project: projector => world.project(projector)
    }
  });

  assert.equal(sent.at(-1).status, 409);
  assert.match(sent.at(-1).body.error, /no successful push record/i);
}));

test("platform branch ship records local ship state and opens an observation window", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformGitPushFixture();
  try {
    const world = createWorld();
    const sent = [];
    const shipProject = projector => {
      if (projector === moduleProjectors.testGates) {
        return [{
          id: "gate:ship.local",
          title: "Ship local gate",
          sourcePath: fixture.stagedPath,
          sourceDependencies: [fixture.stagedPath],
          command: "node --test plugins/platform/platform.test.js",
          protectedObjects: ["plugin.platform"]
        }];
      }
      if (projector === moduleProjectors.testResults) {
        return [{
          id: "testResult:ship.local:1",
          runId: "testRun:ship.local",
          gateId: "gate:ship.local",
          branchId: "branch.ship.local",
          changeSetId: "changeset.ship.local",
          status: "passed",
          exitCode: 0,
          durationMs: 12,
          producedAt: "2026-06-19T00:01:00.000Z"
        }];
      }
      if (projector === moduleProjectors.testRuns) {
        return [{
          id: "testRun:ship.local",
          gateId: "gate:ship.local",
          branchId: "branch.ship.local",
          changeSetId: "changeset.ship.local",
          status: "passed",
          startedAt: "2026-06-19T00:00:30.000Z",
          finishedAt: "2026-06-19T00:01:00.000Z"
        }];
      }
      if (projector === moduleProjectors.latestTestResultsByGate) {
        return {
          byGate: {
            "gate:ship.local": {
              runId: "testRun:ship.local",
              status: "passed"
            }
          }
        };
      }
      return world.project(projector);
    };
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

    await stageAppliedPushBranch({
      handlers,
      branchId: "branch.ship.local",
      changeSetId: "changeset.ship.local",
      stagedPath: fixture.stagedPath,
      content: `${JSON.stringify({ version: 5 }, null, 2)}\n`
    });

    await handlers["platform.branch.push"]({
      req: { body: {} },
      res: {},
      params: { id: "branch.ship.local" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: {
        runtimeProfile: "full",
        platformGit: {
          repoRoot: fixture.repoRoot,
          mirrorRoot: fixture.mirrorRoot
        },
        project: shipProject
      }
    });

    createProposal(world, {
      actor: "aaron",
      id: "proposal.platform.branch.ship.local",
      targetProcess: "branch.ship",
      targetKind: "branch",
      targetId: "branch.ship.local",
      body: {
        branchId: "branch.ship.local",
        releaseChannelId: "releaseChannel:local"
      },
      reason: "Ship locally"
    });
    approveProposal(world, {
      actor: "reviewer",
      id: "proposal.platform.branch.ship.local"
    });

    await handlers["platform.branch.ship"]({
      req: { body: { releaseChannelId: "releaseChannel:local", proposalId: "proposal.platform.branch.ship.local" } },
      res: {},
      params: { id: "branch.ship.local" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: {
        runtimeProfile: "full",
        project: shipProject
      }
    });

    const response = sent.at(-1);
    assert.equal(response.status, 200);
    assert.equal(response.body.shipRecord.status, "shipped");
    assert.equal(response.body.releaseChannel.id, "releaseChannel:local");
    assert.equal(response.body.branch.status, "shipped");
    assert.equal(response.body.branch.latestShipStatus, "shipped");
    assert.equal(response.body.pushRecord.status, "pushed");
    assert.equal(response.body.proposal.id, "proposal.platform.branch.ship.local");
    assert.equal(response.body.gateResults.ok, true);
    assert.equal(typeof response.body.shipRecord.observationWindowEndsAt, "string");
    assert.equal(response.body.shipRecord.observationStatus, "open");
    assert.equal(world.project(moduleProjectors.shipRecords).some(row => row.id === response.body.shipRecord.id), true);
  } finally {
    await removeTempPlatformGitPushFixture(fixture.root);
  }
}));

test("platform branch ship to non-local channels records intent without marking the branch shipped", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformGitPushFixture();
  try {
    const world = createWorld();
    const sent = [];
    const shipProject = projector => {
      if (projector === moduleProjectors.testGates) {
        return [{
          id: "gate:ship.preview",
          title: "Ship preview gate",
          sourcePath: fixture.stagedPath,
          sourceDependencies: [fixture.stagedPath],
          command: "node --test plugins/platform/platform.test.js",
          protectedObjects: ["plugin.platform"]
        }];
      }
      if (projector === moduleProjectors.testResults) {
        return [{
          id: "testResult:ship.preview:1",
          runId: "testRun:ship.preview",
          gateId: "gate:ship.preview",
          branchId: "branch.ship.preview",
          changeSetId: "changeset.ship.preview",
          status: "passed",
          exitCode: 0,
          durationMs: 12,
          producedAt: "2026-06-19T00:01:00.000Z"
        }];
      }
      if (projector === moduleProjectors.testRuns) {
        return [{
          id: "testRun:ship.preview",
          gateId: "gate:ship.preview",
          branchId: "branch.ship.preview",
          changeSetId: "changeset.ship.preview",
          status: "passed",
          startedAt: "2026-06-19T00:00:30.000Z",
          finishedAt: "2026-06-19T00:01:00.000Z"
        }];
      }
      if (projector === moduleProjectors.latestTestResultsByGate) {
        return {
          byGate: {
            "gate:ship.preview": {
              runId: "testRun:ship.preview",
              status: "passed"
            }
          }
        };
      }
      return world.project(projector);
    };
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

    await stageAppliedPushBranch({
      handlers,
      branchId: "branch.ship.preview",
      changeSetId: "changeset.ship.preview",
      stagedPath: fixture.stagedPath,
      content: `${JSON.stringify({ version: 6 }, null, 2)}\n`
    });

    await handlers["platform.branch.push"]({
      req: { body: {} },
      res: {},
      params: { id: "branch.ship.preview" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: {
        runtimeProfile: "full",
        platformGit: {
          repoRoot: fixture.repoRoot,
          mirrorRoot: fixture.mirrorRoot
        },
        project: shipProject
      }
    });

    createProposal(world, {
      actor: "aaron",
      id: "proposal.platform.branch.ship.preview",
      targetProcess: "branch.ship",
      targetKind: "branch",
      targetId: "branch.ship.preview",
      body: {
        branchId: "branch.ship.preview",
        releaseChannelId: "releaseChannel:preview"
      },
      reason: "Record preview ship intent"
    });
    approveProposal(world, {
      actor: "reviewer",
      id: "proposal.platform.branch.ship.preview"
    });

    await handlers["platform.branch.ship"]({
      req: { body: { releaseChannelId: "releaseChannel:preview", proposalId: "proposal.platform.branch.ship.preview" } },
      res: {},
      params: { id: "branch.ship.preview" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext: {
        runtimeProfile: "full",
        project: shipProject
      }
    });

    const response = sent.at(-1);
    assert.equal(response.status, 200);
    assert.equal(response.body.shipRecord.status, "recorded");
    assert.equal(response.body.releaseChannel.id, "releaseChannel:preview");
    assert.notEqual(response.body.branch.status, "shipped");
    assert.equal(response.body.branch.latestShipStatus, "recorded");
    assert.equal(response.body.shipRecord.observationWindowEndsAt, null);
  } finally {
    await removeTempPlatformGitPushFixture(fixture.root);
  }
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

test("platform change-set validate returns derived verification requirements", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformApplyFixture();
  try {
    const world = createWorld();
    const sent = [];
    const scheduled = [];
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
    const appContext = {
      runtimeProfile: "full",
      verificationPolicy: {
        enabled: true,
        serverRunnerId: "runner.main",
        runtimeProfile: "full",
        defaults: { onChangeSet: true },
        verifierEntries: [{
          gateId: "gate:changeset.validate.requirement",
          title: "Change-set requirement gate",
          providerId: "verification.javascriptModule",
          executionClass: "candidate_snapshot",
          safetyClass: "safe",
          sourceDependencies: [fixture.first],
          targetIds: ["testEnvironment:platform-candidate-snapshot"],
          input: { module: "plugins/platform/test-verifier-fixture.js" }
        }]
      },
      providerRuntimes: {
        "platform.testMonitor": {
          scheduleChangeSetValidation: meta => scheduled.push({ ...meta })
        }
      }
    };

    await handlers["platform.changeSet.create"]({
      req: { body: { id: "changeset.requirements.validate", branchId: "branch.requirements.validate" } },
      res: {},
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext
    });
    await handlers["platform.changeSet.edit"]({
      req: {
        body: {
          edits: [{ path: fixture.first, content: JSON.stringify({ value: 99 }, null, 2) }]
        }
      },
      res: {},
      params: { id: "changeset.requirements.validate" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.changeSet.validate"]({
      res: {},
      params: { id: "changeset.requirements.validate" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext
    });

    const response = sent.at(-1);
    assert.equal(response.status, 200);
    assert.equal(Array.isArray(response.body.verificationRequirements), true);
    assert.equal(response.body.verificationRequirements.some(row => row.gateId === "gate:changeset.validate.requirement"), true);
    assert.equal(response.body.verificationRequirementSummary?.targetKind, "candidateSnapshot");
    assert.equal((response.body.verificationRequirementSummary?.missingCount ?? 0) >= 1, true);
    assert.equal(scheduled.length >= 1, true);
    assert.equal(scheduled.at(-1).candidateSnapshotId, response.body.candidateSnapshot.id);
  } finally {
    await removeTempPlatformApplyFixture(fixture.root);
  }
}));

test("platform verification requirements keep candidate-snapshot evidence scoped to the snapshot id", async () => withRegisteredPluginProjectors(providers, async () => {
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
    const appContext = {
      runtimeProfile: "full",
      verificationPolicy: {
        enabled: true,
        serverRunnerId: "runner.main",
        runtimeProfile: "full",
        defaults: { onChangeSet: true },
        verifierEntries: [{
          gateId: "gate:candidate.snapshot.scope",
          title: "Candidate snapshot scope gate",
          providerId: "verification.javascriptModule",
          executionClass: "candidate_snapshot",
          safetyClass: "safe",
          sourceDependencies: [fixture.first],
          targetIds: ["testEnvironment:platform-candidate-snapshot"],
          input: { module: "plugins/platform/test-verifier-fixture.js" }
        }]
      }
    };

    await handlers["platform.changeSet.create"]({
      req: { body: { id: "changeset.snapshot.scope", branchId: "branch.snapshot.scope" } },
      res: {},
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext
    });
    await handlers["platform.changeSet.edit"]({
      req: { body: { edits: [{ path: fixture.first, content: JSON.stringify({ value: 10 }, null, 2) }] } },
      res: {},
      params: { id: "changeset.snapshot.scope" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.changeSet.validate"]({
      res: {},
      params: { id: "changeset.snapshot.scope" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext
    });
    const snapshotOne = world.project(moduleProjectors.candidateSnapshotIndex).byChangeSet["changeset.snapshot.scope"]?.at(-1) ?? null;
    assert.ok(snapshotOne);

    const run = await runPlatformTestGate(world, {
      actor: "aaron",
      gate: {
        id: "gate:candidate.snapshot.scope",
        title: "Candidate snapshot scope gate",
        executionClass: "candidate_snapshot",
        command: "node --test plugins/platform/platform.test.js",
        runner: "node-test",
        timeoutMs: 1200,
        protectedObjects: ["testEnvironment:platform-candidate-snapshot"],
        sourceDependencies: [fixture.first]
      },
      branchId: "branch.snapshot.scope",
      changeSetId: "changeset.snapshot.scope",
      candidateSnapshotId: snapshotOne.id,
      runtimeProfile: "full",
      appContext,
      runCommand: async () => ({
        startedAt: "2026-06-19T00:00:00.000Z",
        finishedAt: "2026-06-19T00:00:00.015Z",
        durationMs: 15,
        exitCode: 0,
        signal: null,
        status: "passed",
        stdout: "ok 1 - candidate snapshot scope",
        stderr: "",
        timedOut: false,
        error: null
      })
    });
    assert.equal(run.status, 201);

    await handlers["platform.changeSet.edit"]({
      req: { body: { edits: [{ path: fixture.first, content: JSON.stringify({ value: 11 }, null, 2) }] } },
      res: {},
      params: { id: "changeset.snapshot.scope" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.changeSet.validate"]({
      res: {},
      params: { id: "changeset.snapshot.scope" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext
    });
    const snapshotTwo = world.project(moduleProjectors.candidateSnapshotIndex).byChangeSet["changeset.snapshot.scope"]?.at(-1) ?? null;
    assert.ok(snapshotTwo);
    assert.notEqual(snapshotTwo.id, snapshotOne.id);

    const model = await buildPlatformModel({
      appContext,
      project: projector => world.project(projector)
    });
    const verificationState = selectVerificationRequirementState(model, {
      changeSetId: "changeset.snapshot.scope",
      candidateSnapshotId: snapshotTwo.id
    });
    const requirement = verificationState.verificationRequirements.find(row =>
      row.targetKind === "candidateSnapshot" && row.gateId === "gate:candidate.snapshot.scope"
    );
    assert.ok(requirement);
    assert.notEqual(requirement.status, "satisfied");
    assert.equal(verificationState.verificationRequirementSummary?.blockingStatus, "blocked");
  } finally {
    await removeTempPlatformApplyFixture(fixture.root);
  }
}));

test("platform change-set apply blocks when verification requirements are missing and leaves files unchanged", async () => withRegisteredPluginProjectors(providers, async () => {
  const fixture = await createTempPlatformApplyFixture();
  try {
    const world = createWorld();
    const sent = [];
    const scheduled = [];
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
    const appContext = {
      runtimeProfile: "full",
      verificationPolicy: {
        enabled: true,
        serverRunnerId: "runner.main",
        runtimeProfile: "full",
        defaults: { onChangeSet: true },
        verifierEntries: [{
          gateId: "gate:changeset.apply.blocked",
          title: "Apply gating requirement",
          providerId: "verification.javascriptModule",
          executionClass: "candidate_snapshot",
          safetyClass: "safe",
          sourceDependencies: [fixture.first],
          targetIds: ["testEnvironment:platform-candidate-snapshot"],
          input: { module: "plugins/platform/test-verifier-fixture.js" }
        }]
      },
      providerRuntimes: {
        "platform.testMonitor": {
          scheduleChangeSetValidation: meta => scheduled.push({ ...meta })
        }
      }
    };

    await handlers["platform.changeSet.create"]({
      req: { body: { id: "changeset.apply.blocked", branchId: "branch.apply.blocked" } },
      res: {},
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext
    });
    await handlers["platform.changeSet.edit"]({
      req: { body: { edits: [{ path: fixture.first, content: JSON.stringify({ value: 7 }, null, 2) }] } },
      res: {},
      params: { id: "changeset.apply.blocked" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" }
    });
    await handlers["platform.changeSet.apply"]({
      res: {},
      params: { id: "changeset.apply.blocked" },
      requestActor: "aaron",
      requestSession: { id: "session.platform" },
      appContext
    });

    const response = sent.at(-1);
    assert.equal(response.status, 409);
    assert.equal(response.body.error, "verification requirements block apply");
    assert.equal(Array.isArray(response.body.verificationRequirements), true);
    assert.equal(response.body.verificationRequirements[0].status, "missing");
    assert.equal(response.body.verificationRequirementSummary?.blockingStatus, "blocked");
    assert.equal(scheduled.length, 1);
    assert.deepEqual(JSON.parse(await readFile(path.join(fixture.root, "first.json"), "utf8")), { value: 1 });
  } finally {
    await removeTempPlatformApplyFixture(fixture.root);
  }
}));

test("platform page renders required operating views", async () => {
  const baseModel = await buildPlatformModel({
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
  const branches = Array.from({ length: 21 }, (_, index) => ({
    id: `branch:demo-${index}`,
    title: `Demo Branch ${index}`,
    status: index === 0 ? "draft" : "active",
    lifecycleLane: index === 0 ? "draft" : "review",
    owner: "aaron",
    changeSetIds: [`changeSet:demo-${index}`],
    changeSetCount: 1,
    docsFreshness: { status: "fresh", summary: "fresh" },
    testRedGreen: { status: "green", summary: "all gates passing" },
    latestCandidateSnapshotId: `candidateSnapshot:demo-${index}`,
    affectedSystemSummaries: [{ label: "platform console" }],
    telemetryImpactSummaries: [{ label: "requests" }]
  }));
  const changeSets = branches.map((branch, index) => ({
    id: `changeSet:demo-${index}`,
    title: `Demo Change Set ${index}`,
    status: index === 0 ? "draft" : "validated",
    branchId: branch.id,
    owner: "aaron",
    editCount: 1,
    changedPaths: ["plugins/platform/platform-console.rvm"],
    latestCandidateSnapshotId: `candidateSnapshot:demo-${index}`,
    testRedGreen: { status: "green", summary: "all gates passing" }
  }));
  const candidateSnapshots = branches.map((branch, index) => ({
    id: `candidateSnapshot:demo-${index}`,
    status: "valid",
    branchId: branch.id,
    changeSetId: `changeSet:demo-${index}`,
    revision: index + 1,
    files: [{ path: "plugins/platform/platform-console.rvm" }],
    errors: []
  }));
  branches[1] = {
    ...branches[1],
    status: "pushed",
    gitBranchName: "platform/demo-1",
    latestPushRecordId: "pushRecord:demo-1:1",
    latestPushStatus: "pushed",
    pushRecordIds: ["pushRecord:demo-1:1"],
    latestShipRecordId: "shipRecord:demo-1:1",
    latestShipStatus: "shipped",
    latestReleaseChannelId: "releaseChannel:local",
    shipRecordIds: ["shipRecord:demo-1:1"]
  };
  const model = {
    ...baseModel,
    lifecycleBoard: [
      {
        id: "author",
        title: "author",
        count: 2,
        countLabel: "2 objects",
        nodes: [
          { id: "plugin.platform", titleLink: { id: "plugin.platform", title: "Platform Plugin" }, kind: "plugin" },
          { id: "route:GET /platform", titleLink: { id: "route:GET /platform", title: "GET /platform" }, kind: "route" }
        ]
      },
      {
        id: "observe",
        title: "observe",
        count: 1,
        countLabel: "1 object",
        nodes: [{ id: "telemetryMetric:requests", titleLink: { id: "telemetryMetric:requests", title: "Requests" }, kind: "telemetryMetric" }]
      }
    ],
    profiles: [{ id: "full", status: "active", pluginIds: ["plugin.platform"], capabilities: ["platform.self"] }],
    branchBoard: [
      {
        id: "draft",
        title: "Draft",
        count: 1,
        countLabel: "1 branch",
        branches: [{
          id: "branch:demo-0",
          title: "Demo Branch 0",
          titleLink: { id: "branch:demo-0", title: "Demo Branch 0" },
          status: "draft",
          changeSetCount: 1,
          reviewProposalCount: 0,
          activitySummary: "change sets 1",
          latestCandidateSnapshotId: "candidateSnapshot:demo-0"
        }]
      },
      {
        id: "review",
        title: "Review",
        count: 20,
        countLabel: "20 branches",
        branches: branches.slice(1).map(branch => ({
          id: branch.id,
          title: branch.title,
          titleLink: { id: branch.id, title: branch.title },
          status: branch.status,
          changeSetCount: 1,
          reviewProposalCount: 1,
          activitySummary: "change sets 1, review 1",
          latestCandidateSnapshotId: branch.latestCandidateSnapshotId
        }))
      }
    ],
    branches,
    changeSets,
    changeSetEdits: [{ changeSetId: "changeSet:demo-0", path: "plugins/platform/platform-console.rvm", sourceLanguage: "rvm", previousHash: "abc123", nextHash: "def456" }],
    candidateSnapshots,
    pushRecords: [{
      id: "pushRecord:demo-1:1",
      branchId: "branch:demo-1",
      changeSetId: "changeSet:demo-1",
      status: "pushed",
      remoteName: "origin",
      remoteUrl: "https://github.com/example/platform.git",
      provider: "github",
      gitBranchName: "platform/demo-1",
      localBranchRef: "refs/heads/platform/demo-1",
      remoteBranchRef: "refs/heads/platform/demo-1",
      commitSha: "abc123def456",
      commitMessage: "platform push platform/demo-1",
      compareUrl: "https://github.com/example/platform/compare/main...platform%2Fdemo-1?expand=1",
      pullRequestUrl: "https://github.com/example/platform/pull/new/platform%2Fdemo-1"
    }],
    releaseChannels: [{
      id: "releaseChannel:local",
      name: "local",
      title: "Local",
      executable: true,
      description: "Records a real local ship event for the latest pushed branch state."
    }],
    shipRecords: [{
      id: "shipRecord:demo-1:1",
      branchId: "branch:demo-1",
      changeSetId: "changeSet:demo-1",
      pushRecordId: "pushRecord:demo-1:1",
      releaseChannelId: "releaseChannel:local",
      releaseChannelName: "local",
      status: "shipped",
      remoteName: "origin",
      remoteUrl: "https://github.com/example/platform.git",
      provider: "github",
      gitBranchName: "platform/demo-1",
      localBranchRef: "refs/heads/platform/demo-1",
      remoteBranchRef: "refs/heads/platform/demo-1",
      commitSha: "abc123def456",
      commitMessage: "platform push platform/demo-1",
      compareUrl: "https://github.com/example/platform/compare/main...platform%2Fdemo-1?expand=1",
      pullRequestUrl: "https://github.com/example/platform/pull/new/platform%2Fdemo-1",
      proposalId: "proposal:demo-ship",
      observationWindowEndsAt: "2026-06-18T00:30:00.000Z",
      observationStatus: "open"
    }],
    gitRemotes: [{
      id: "gitRemote:origin",
      name: "origin",
      fetchUrl: "https://github.com/example/platform.git",
      pushUrl: "https://github.com/example/platform.git",
      remoteUrl: "https://github.com/example/platform.git",
      provider: "github",
      webUrl: "https://github.com/example/platform"
    }],
    gitRefs: [
      { id: "gitRef:refs/heads/platform/demo-1", refName: "refs/heads/platform/demo-1", shortName: "platform/demo-1", remoteName: null, scope: "localBranch", objectId: "abc123def456", upstream: "refs/remotes/origin/platform/demo-1", symref: null },
      { id: "gitRef:refs/remotes/origin/platform/demo-1", refName: "refs/remotes/origin/platform/demo-1", shortName: "platform/demo-1", remoteName: "origin", scope: "remoteBranch", objectId: "abc123def456", upstream: null, symref: null }
    ],
    proposals: [
      { id: "proposal:demo", status: "open", targetProcess: "platform.changeSet.create", targetId: "changeSet:demo-0", reason: "Demo proposal" },
      { id: "proposal:demo-defect", status: "open", targetProcess: "defect.create", targetId: "defect:requests", reason: "Investigate platform request regression" },
      { id: "proposal:demo-ship", status: "approved", targetProcess: "branch.ship", targetId: "branch:demo-1", body: { shipRecordId: "shipRecord:demo-1:1", releaseChannelId: "releaseChannel:local" }, reason: "Ship demo branch locally" }
    ],
    proposalActions: [{ action: "changeSet.create", sampleBody: { branchId: "branch:demo-0" } }],
    verificationPolicies: [{
      id: "verificationPolicy:demo",
      status: "active",
      gateId: "gate:demo",
      policySource: "workspace",
      executionClass: "child_process",
      enabled: true,
      startup: "lazy",
      watch: "changed-sources",
      onChangeSet: true,
      exclusive: false,
      requiresCleanWorkspace: true,
      priority: 5,
      timeoutMs: 1000
    }],
    verificationQueue: [{
      id: "verificationQueue:demo",
      gateId: "gate:demo",
      gateTitle: "Demo gate",
      status: "queued",
      triggerKind: "change-set",
      executionClass: "child_process",
      runId: "testRun:demo"
    }],
    verificationExecutions: [{
      id: "verificationExecution:demo",
      gateId: "gate:demo",
      gateTitle: "Demo gate",
      status: "running",
      triggerKind: "change-set",
      executionClass: "child_process",
      runId: "testRun:demo",
      exclusive: false,
      startedAt: "2026-06-18T00:00:00.000Z",
      finishedAt: null
    }],
    testGates: [{
      id: "gate:demo",
      title: "Demo gate",
      runner: "node-test",
      environment: "local-node",
      timeoutMs: 1000,
      costEstimate: "low",
      command: "node --test demo",
      protectedObjects: ["branch:demo-0", "route:GET /platform"],
      selectedByBranches: ["branch:demo-0"],
      selectedByChangeSets: ["changeSet:demo-0"],
      lastResult: { status: "passed", exitCode: 0 }
    }],
    telemetryThresholds: [{
      id: "telemetryThreshold:platform.self.http",
      metricId: "telemetryMetric:requests",
      title: "Platform HTTP handler latency",
      thresholdMs: 125,
      regressionMinDeltaMs: 40,
      regressionMinDeltaPct: 35
    }],
    telemetrySamples: [{
      id: "telemetrySample:demo",
      metricId: "telemetryMetric:requests",
      thresholdId: "telemetryThreshold:platform.self.http",
      ownerId: "backend.readPlatformModel",
      ownerKind: "handler",
      sampleKind: "httpRequest",
      status: "observed",
      durationMs: 148,
      routeId: "route:GET /platform",
      handlerId: "backend.readPlatformModel",
      branchId: "branch:demo-0",
      changeSetId: "changeSet:demo-0",
      gateId: "gate:demo",
      candidateSnapshotId: "candidateSnapshot:demo-0",
      observedAt: "2026-06-18T00:00:00.015Z",
      message: "platform model read"
    }],
    telemetryWindows: [{
      id: "telemetryWindow:requests",
      metricId: "telemetryMetric:requests",
      ownerId: "backend.readPlatformModel",
      ownerKind: "handler",
      sampleKind: "httpRequest",
      thresholdId: "telemetryThreshold:platform.self.http",
      currentSampleIds: ["telemetrySample:demo"],
      previousSampleIds: ["telemetrySample:baseline"],
      currentAggregateMs: 148,
      previousAggregateMs: 80,
      currentSampleCount: 1,
      previousSampleCount: 1,
      failureCount: 0,
      latestSampleId: "telemetrySample:demo",
      latestObservedAt: "2026-06-18T00:00:00.015Z",
      branchIds: ["branch:demo-0"],
      changeSetIds: ["changeSet:demo-0"],
      gateIds: ["gate:demo"],
      candidateSnapshotIds: ["candidateSnapshot:demo-0"],
      thresholdMs: 125,
      regressionMinDeltaMs: 40,
      regressionMinDeltaPct: 35
    }],
    performanceRegressions: [{
      id: "performanceRegression:requests",
      metricId: "telemetryMetric:requests",
      thresholdId: "telemetryThreshold:platform.self.http",
      ownerId: "backend.readPlatformModel",
      ownerKind: "handler",
      sampleKind: "httpRequest",
      windowId: "telemetryWindow:requests",
      latestSampleId: "telemetrySample:demo",
      currentAggregateMs: 148,
      previousAggregateMs: 80,
      deltaMs: 68,
      deltaPercent: 85,
      branchIds: ["branch:demo-0"],
      changeSetIds: ["changeSet:demo-0"],
      gateIds: ["gate:demo"],
      candidateSnapshotIds: ["candidateSnapshot:demo-0"],
      observedAt: "2026-06-18T00:00:00.015Z",
      status: "open"
    }],
    defects: [{
      id: "defect:requests",
      title: "Platform request regression",
      defectKind: "performanceRegression",
      status: "open",
      clusterId: "defectCluster:requests",
      clusterKey: "telemetryMetric:requests",
      metricId: "telemetryMetric:requests",
      gateId: "gate:demo",
      branchId: "branch:demo-0",
      changeSetId: "changeSet:demo-0",
      candidateSnapshotId: "candidateSnapshot:demo-0",
      ownerId: "backend.readPlatformModel",
      summary: "68 ms slower than prior aggregate",
      observedAt: "2026-06-18T00:00:00.015Z",
      proposalId: "proposal:demo-defect"
    }],
    defectObservations: [{
      id: "defectObservation:requests",
      defectId: "defect:requests",
      clusterId: "defectCluster:requests",
      sourceKind: "performanceRegression",
      sourceId: "performanceRegression:requests",
      status: "regressed",
      branchId: "branch:demo-0",
      changeSetId: "changeSet:demo-0",
      gateId: "gate:demo",
      metricId: "telemetryMetric:requests",
      candidateSnapshotId: "candidateSnapshot:demo-0",
      observedAt: "2026-06-18T00:00:00.015Z",
      message: "68 ms slower than prior aggregate"
    }],
    defectClusters: [{
      id: "defectCluster:requests",
      title: "telemetryMetric:requests",
      defectIds: ["defect:requests"],
      branchIds: ["branch:demo-0"],
      changeSetIds: ["changeSet:demo-0"],
      gateIds: ["gate:demo"],
      metricIds: ["telemetryMetric:requests"],
      candidateSnapshotIds: ["candidateSnapshot:demo-0"],
      proposalIds: ["proposal:demo-defect"],
      observationIds: ["defectObservation:requests"],
      defectCount: 1,
      observationCount: 1,
      latestObservedAt: "2026-06-18T00:00:00.015Z",
      status: "open"
    }],
    testRuns: [{
      id: "testRun:demo",
      title: "Demo gate",
      status: "passed",
      gateId: "gate:demo",
      branchId: "branch:demo-0",
      changeSetId: "changeSet:demo-0",
      candidateSnapshotId: "candidateSnapshot:demo-0",
      cacheStatus: "hit",
      cacheHit: { runId: "testRun:baseline" },
      durationMs: 12,
      exitCode: 0
    }],
    testArtifacts: [
      { id: "testArtifact:demo:stdout", runId: "testRun:demo", resultId: "testResult:demo:1", gateId: "gate:demo", artifactKind: "stdout", fileName: "stdout.txt", contentType: "text/plain", sizeBytes: 24 },
      { id: "testArtifact:demo:tap", runId: "testRun:demo", resultId: "testResult:demo:1", gateId: "gate:demo", artifactKind: "tap", fileName: "stdout.tap", contentType: "application/tap", sizeBytes: 24, structuredFormat: "tap" }
    ],
    testSuites: [
      { id: "testSuite:demo", runId: "testRun:demo", resultId: "testResult:demo:1", artifactId: "testArtifact:demo:tap", gateId: "gate:demo", format: "tap", status: "passed", total: 1, failed: 0, errors: 0 }
    ],
    testCases: [
      { id: "testCase:demo:1", suiteId: "testSuite:demo", runId: "testRun:demo", resultId: "testResult:demo:1", artifactId: "testArtifact:demo:tap", gateId: "gate:demo", format: "tap", status: "passed", classname: "demo", durationMs: 12 }
    ],
    testReports: [
      { id: "testReport:testRun:demo:summary", runId: "testRun:demo", gateId: "gate:demo", reportKind: "summary", title: "Report Summary", status: "passed", summary: "1 suite, 1 case", artifactIds: ["testArtifact:demo:stdout", "testArtifact:demo:tap"], suiteIds: ["testSuite:demo"], caseIds: ["testCase:demo:1"], producedAt: "2026-06-18T00:00:00.012Z", format: "tap", suiteCount: 1, caseCount: 1, passedCount: 1, failedCount: 0, errorCount: 0, skippedCount: 0, cached: false },
      { id: "testReport:testRun:demo:suites", runId: "testRun:demo", gateId: "gate:demo", reportKind: "suites", title: "Suite Summary", status: "passed", summary: "1 suite, 1 case", artifactIds: ["testArtifact:demo:tap"], suiteIds: ["testSuite:demo"], caseIds: ["testCase:demo:1"], producedAt: "2026-06-18T00:00:00.012Z", format: "tap", suiteCount: 1, caseCount: 1, failedCount: 0, errorCount: 0, skippedCount: 0 },
      { id: "testReport:testRun:demo:failures", runId: "testRun:demo", gateId: "gate:demo", reportKind: "failures", title: "Failing Cases", status: "passed", summary: "No failing or error cases were derived for this run.", artifactIds: [], suiteIds: [], caseIds: [], producedAt: "2026-06-18T00:00:00.012Z", format: "tap", failureCount: 0 },
      { id: "testReport:testRun:demo:regression", runId: "testRun:demo", gateId: "gate:demo", reportKind: "regression", title: "Regression Summary", status: "regressed", summary: "regressed vs testRun:baseline", artifactIds: [], suiteIds: [], caseIds: [], producedAt: "2026-06-18T00:00:00.012Z", regressionSummary: { baselineRunId: "testRun:baseline", baselineDurationMs: 6, currentDurationMs: 12, deltaMs: 6, deltaPercent: 100 } }
    ],
    branchTestRedGreen: [{
      branchId: "branch:demo-0",
      status: "green",
      totalSelectedGates: 1,
      passedGateIds: ["gate:demo"],
      failedGateIds: [],
      errorGateIds: [],
      timedOutGateIds: [],
      summary: "all selected gates passing"
    }],
    changeSetTestRedGreen: [{
      changeSetId: "changeSet:demo-0",
      status: "green",
      totalSelectedGates: 1,
      passedGateIds: ["gate:demo"],
      failedGateIds: [],
      errorGateIds: [],
      timedOutGateIds: [],
      summary: "all selected gates passing"
    }],
    runtimeRevisions: [{
      id: "runtimeRevision:demo",
      revision: 21,
      status: "active",
      trigger: "platform-change-set-apply",
      branchId: "branch:demo-0",
      changeSetId: "changeSet:demo-0",
      changedSources: ["plugins/platform/platform-console.rvm"],
      buildErrorCount: 0
    }],
    snapshotBuilds: [{
      id: "snapshotBuild:demo",
      status: "valid",
      candidateSnapshotId: "candidateSnapshot:demo-0",
      branchId: "branch:demo-0",
      changeSetId: "changeSet:demo-0",
      revision: 21,
      errorCount: 0
    }],
    snapshotBuildErrors: [],
    snapshotDiagnostics: { appRevision: 21, lastGoodAppRevision: 21, pendingDirtySources: [] },
    testMonitorDiagnostics: { status: "queued", pendingSourceCount: 1, pendingChangeSetCount: 1, policySource: "workspace" },
    verificationPersistence: {
      source: "sqlite",
      verificationRoot: ".world/verification",
      ledgerBackend: { provider: "sqlite" },
      artifactBackend: { provider: "disk" },
      cacheBackend: { provider: "disk" },
      diagnostics: [{ id: "verificationPersistenceDiagnostic:demo" }]
    },
    docs: [{
      id: "doc:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md",
      path: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md",
      role: "roadmap",
      owner: "plugin.platform",
      status: "active",
      freshness: { status: "fresh" },
      sectionCount: 1,
      taskCount: 1,
      references: {
        routes: ["route:GET /platform"],
        pluginIds: ["plugin.platform"],
        filePaths: ["plugins/platform/platform-console.rvm"]
      }
    }],
    docSections: [{ doc: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md", title: "Phase 12", line: 1, depth: 1 }],
    docTasks: [{ id: "docTask:roadmap:1", doc: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md", status: "open", title: "Split console into platform pages", line: 2, section: "Phase 12" }],
    folders: [{
      id: "folder:docs",
      title: "Docs",
      path: "docs",
      facet: "knowledge",
      source: "docs/this.folder.wtoml"
    }],
    roadmapTasks: [{
      id: "roadmapTask:1",
      doc: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md",
      status: "open",
      derivedStatus: "ready",
      title: "Split console pages",
      line: 2,
      section: "Phase 12",
      derivedSummary: "ready to land",
      targets: [{ targetId: "route:GET /platform" }]
    }],
    epics: [{
      id: "epic:platform",
      title: "Platform",
      status: "active",
      roadmapId: "roadmap:platform",
      branchIds: ["branch:demo-0"],
      featureIds: ["feature:console"],
      gateIds: ["gate:demo"],
      docIds: ["doc:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"]
    }],
    features: [{
      id: "feature:console",
      title: "Console",
      status: "active",
      epicId: "epic:platform",
      branchIds: ["branch:demo-0"],
      gateIds: ["gate:demo"],
      docIds: ["doc:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md"]
    }],
    authorityDecisions: [{
      id: "authorityDecision:session",
      action: "platform.model.read",
      decision: "allow",
      requiredAuthority: "platform.read.sensitive",
      sessionId: "session.platform",
      effectiveActor: "aaron",
      targetObjectId: "plugin.platform",
      reason: "platform steward may read sensitive platform surfaces",
      evaluatedAt: "2026-01-01T00:00:00.000Z"
    }],
    sessions: [{
      id: "session.platform",
      effectiveActor: "aaron",
      authorityMode: "direct",
      executionIds: ["execution:render"],
      authorityDecisionIds: ["authorityDecision:session"],
      branchIds: ["branch:demo-0"],
      changeSetIds: ["changeSet:demo-0"],
      pushRecordIds: ["pushRecord:demo-1:1"],
      shipRecordIds: ["shipRecord:demo-1:1"],
      testRunIds: ["testRun:demo"],
      executionCount: 1,
      authorityDecisionCount: 1,
      startedAt: "2026-01-01T00:00:00.000Z",
      lastActivityAt: "2026-01-01T00:02:00.000Z"
    }],
    executions: [{
      id: "execution:render",
      sessionId: "session.platform",
      title: "platform.model.read",
      executionKind: "read",
      status: "observed",
      handlerId: "platform.model.read",
      routeId: "route:GET /api/platform-model",
      view: "sessions",
      branchId: "branch:demo-0",
      changeSetId: "changeSet:demo-0",
      pushRecordId: "pushRecord:demo-1:1",
      shipRecordId: "shipRecord:demo-1:1",
      testRunId: "testRun:demo",
      authorityDecisionId: "authorityDecision:session",
      targetObjectIds: ["plugin.platform"]
    }],
    sessionTags: [{
      id: "sessionTag:platform:branch",
      sessionId: "session.platform",
      tagKind: "branch",
      value: "branch:demo-0",
      executionIds: ["execution:render"]
    }],
    executionArtifacts: [{
      id: "executionArtifact:platform:push",
      executionId: "execution:render",
      sessionId: "session.platform",
      artifactKind: "pushRecord",
      artifactId: "pushRecord:demo-1:1",
      producedAt: "2026-01-01T00:02:00.000Z"
    }],
    artifacts: [{
      id: "artifact:testRun:demo:stdout",
      title: "Demo stdout",
      artifactKind: "stdout",
      producerKind: "testRun",
      producerId: "testRun:demo",
      contentType: "text/plain",
      sizeBytes: 11,
      contentRef: "verification/artifacts/artifact-testRun-demo-stdout/blob",
      contentUrl: "/api/platform-artifacts/artifact%3AtestRun%3Ademo%3Astdout/content",
      preview: "hello world",
      producedAt: "2026-01-01T00:02:00.000Z",
      sessionId: "session.platform",
      executionId: "execution:render",
      branchId: "branch:demo-0",
      changeSetId: "changeSet:demo-0",
      candidateSnapshotId: "candidateSnapshot:demo-0",
      testRunId: "testRun:demo",
      resultId: "testResult:demo",
      gateId: "gate:demo",
      artifactSourceId: "testArtifact:testRun:demo:stdout"
    }],
    gaps: [{ id: "gap.demo", severity: "low", kind: "meta-defect", target: "branch:demo-0", reason: "Demo gap" }],
    nodes: [
      ...baseModel.nodes,
      { id: "telemetryMetric:requests", kind: "telemetryMetric", title: "Requests", status: "known", owner: "plugin.platform", source: "platform", lifecycle: ["observe"] },
      { id: "defectCluster:demo", kind: "defectCluster", title: "Console drift", status: "open", owner: "plugin.platform", source: "platform", lifecycle: ["observe"] },
      { id: "boundary:git", kind: "boundary", title: "Git", status: "known", owner: "plugin.platform", source: "platform", lifecycle: ["execute"] }
    ],
    edges: [
      ...baseModel.edges,
      { from: "folder:docs", rel: "contains", to: "doc:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md" },
      { from: "telemetryMetric:requests", rel: "verifies", to: "route:GET /platform" },
      { from: "defectCluster:demo", rel: "targets", to: "branch:demo-0" },
      { from: "boundary:git", rel: "supports", to: "plugin.platform" }
    ]
  };

  const overviewHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform") });
  const workflowLandingHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=change&section=branches") });
  const workflowBranchesHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=change&section=branches&id=branch:demo-0") });
  const workflowBranchesSortedHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=change&section=branches&id=branch:demo-0&sort=status&dir=desc&limit=5") });
  const workflowChangeSetHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=change&section=changesets&id=changeSet:demo-0") });
  const workflowPushesHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=change&section=pushes&id=pushRecord:demo-1:1") });
  const workflowShipsHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=change&section=ships&id=shipRecord:demo-1:1") });
  const workflowProposalHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=change&section=proposals&id=proposal:demo") });
  const verificationLandingHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=verification&section=status") });
  const verificationStatusHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=verification&section=status&id=gate:demo") });
  const verificationPolicyHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=verification&section=status&id=verificationPolicy:demo") });
  const verificationExecutionHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=verification&section=status&id=verificationExecution:demo") });
  const verificationRevisionHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=verification&section=runtime&id=runtimeRevision:demo") });
  const verificationRunHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=verification&section=runs&id=testRun:demo") });
  const verificationRunFragmentHtml = renderPlatformPageFragment(model, { requestUrl: new URL("http://platform.local/api/platform-page?area=verification&section=runs&id=testRun:demo") });
  const verificationRunShellHtml = renderPlatformShellPage({ requestUrl: new URL("http://platform.local/platform?area=verification&section=runs&id=testRun:demo") });
  const telemetryLandingHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=telemetry") });
  const telemetryDetailHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=telemetry&id=telemetryMetric:requests") });
  const defectsLandingHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=defects") });
  const defectsDetailHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=defects&id=defect:requests") });
  const artifactsLandingHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=artifacts") });
  const artifactsDetailHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=artifacts&id=artifact:testRun:demo:stdout") });
  const sessionsLandingHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=sessions") });
  const sessionsDetailHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=sessions&id=session.platform") });
  const knowledgeLandingHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=knowledge&section=docs") });
  const knowledgeDocsHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=knowledge&section=docs&id=docs/PLATFORM-ALL-THE-WAY-ROADMAP.md") });
  const knowledgeFoldersHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=knowledge&section=folders&id=folder:docs") });
  const knowledgeRoadmapHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=knowledge&section=roadmap&id=roadmapTask:1") });
  const signalsLandingHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=signals&section=gaps") });
  const signalsGapHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=signals&section=gaps&id=gap.demo") });
  const signalsCatalogHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=signals&section=catalog&id=telemetryMetric:requests") });
  const modelLandingHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=advanced&section=model") });
  const modelCompatHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=advanced&section=model&id=route:GET%20/platform") });
  const modelObjectsHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=advanced&section=model&id=route:GET%20/platform") });
  const modelProfilesHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=advanced&section=profiles&sort=profile&dir=desc") });
  const modelCoverageHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?area=advanced&section=coverage&sort=gate&dir=desc") });

  assert.match(overviewHtml, /Platform Console - Overview/);
  assert.match(overviewHtml, /Generated from plugins\/platform\/platform-console\.wcss/);
  assert.match(overviewHtml, /Authored Surface Tree/);
  assert.match(overviewHtml, /Inspectable page and section ownership compiled from the authored console RVM\./);
  assert.match(overviewHtml, /data-platform-rvm-view="PlatformOverviewPage"/);
  assert.match(overviewHtml, /Platform Summary, Authored Surface Tree, Lifecycle Board, Platform Map, Runtime Profiles/);
  assert.match(overviewHtml, /Counts, authored surface ownership, lifecycle, and quick platform links\./);
  assert.match(overviewHtml, /offset=12/);
  assert.match(overviewHtml, /sort=kind&amp;dir=desc/);
  assert.match(overviewHtml, /\?area=change&amp;section=branches/);
  assert.match(overviewHtml, /\?area=verification&amp;section=status/);
  assert.match(overviewHtml, /\?area=telemetry&amp;section=summary/);
  assert.match(overviewHtml, /\?area=defects&amp;section=summary/);
  assert.match(overviewHtml, /\?area=knowledge&amp;section=docs/);
  assert.match(overviewHtml, /\?area=signals&amp;section=gaps/);
  assert.match(overviewHtml, /\?area=advanced&amp;section=model/);
  assert.doesNotMatch(overviewHtml, /bindAuthoredJsonSubmit/);
  assert.doesNotMatch(overviewHtml, /<pre/);

  assert.match(workflowLandingHtml, /Platform Console - Change \/ Branches/);
  assert.match(workflowLandingHtml, /Branch Board/);
  assert.match(workflowLandingHtml, /Lifecycle lanes for branch-backed work\./);
  assert.match(workflowLandingHtml, /Branches/);
  assert.match(workflowLandingHtml, /<form id="platform-branch-create-form"/);
  assert.doesNotMatch(workflowLandingHtml, /<pre/);
  assert.match(workflowBranchesHtml, /Platform Console - Change \/ Branches/);
  assert.match(workflowBranchesHtml, /Branches/);
  assert.match(workflowBranchesHtml, /Properties and linked resources for the selected workflow item\./);
  assert.match(workflowBranchesHtml, /Primary Detail/);
  assert.match(workflowBranchesHtml, /Selected workflow object properties and long-tail fields\./);
  assert.match(workflowBranchesHtml, /Related Resources/);
  assert.match(workflowBranchesHtml, /Linked resources and supporting context for the selected workflow object\./);
  assert.match(workflowBranchesHtml, /Change Sets/);
  assert.match(workflowBranchesHtml, /Affected Systems/);
  assert.match(workflowBranchesHtml, /Candidate Snapshots/);
  assert.match(workflowBranchesHtml, /Candidate snapshot history for the selected workflow object when available\./);
  assert.match(workflowBranchesHtml, /Branch Detail/);
  assert.match(workflowBranchesHtml, /<form id="platform-branch-create-form" data-platform-client-action="branch.create" data-platform-submit-spec=/);
  assert.match(workflowBranchesHtml, /\/api\/platform-branches\/branch%3Ademo-0/);
  assert.match(workflowBranchesHtml, /offset=20/);
  assert.match(workflowBranchesHtml, /Sort/);
  assert.match(workflowBranchesSortedHtml, /sort=status&amp;dir=asc/);
  assert.match(workflowBranchesSortedHtml, /sort=status&amp;dir=desc/);
  assert.match(workflowBranchesSortedHtml, /offset=5&amp;limit=5&amp;sort=status&amp;dir=desc/);
  assert.doesNotMatch(workflowBranchesHtml, /platform-initial-state/);
  assert.doesNotMatch(workflowBranchesHtml, /<pre/);
  assert.match(workflowChangeSetHtml, /Platform Console - Change \/ Change Sets/);
  assert.match(workflowChangeSetHtml, /Change Sets/);
  assert.match(workflowChangeSetHtml, /Change Set Detail/);
  assert.match(workflowChangeSetHtml, /Staged Edits/);
  assert.match(workflowChangeSetHtml, /Stage an authored source edit into the selected change set\./);
  assert.match(workflowChangeSetHtml, /<form id="platform-change-set-create-form" data-platform-client-action="changeSet.create" data-platform-submit-spec=/);
  assert.match(workflowChangeSetHtml, /<option value="changeSet:demo-0">changeSet:demo-0<\/option>/);
  assert.match(workflowChangeSetHtml, /<form id="platform-change-set-edit-form"/);
  assert.match(workflowChangeSetHtml, /<form id="platform-change-set-lifecycle-form" data-platform-client-action="changeSet.lifecycle" data-platform-submit-spec=/);
  assert.match(workflowChangeSetHtml, /<option value="reject" selected>Reject<\/option>/);
  assert.match(workflowChangeSetHtml, /<option value="abandon">Abandon<\/option>/);
  assert.match(workflowPushesHtml, /Platform Console - Change \/ Pushes/);
  assert.match(workflowPushesHtml, /Push Records/);
  assert.match(workflowPushesHtml, /Paginated list of push records, remotes, refs, and linked failure follow-up\./);
  assert.match(workflowPushesHtml, /Push Detail/);
  assert.match(workflowPushesHtml, /Primary Detail/);
  assert.match(workflowPushesHtml, /Push Record Detail/);
  assert.match(workflowPushesHtml, /Related Resources/);
  assert.match(workflowPushesHtml, /platform\/demo-1/);
  assert.match(workflowPushesHtml, /https:\/\/github\.com\/example\/platform\/compare\/main\.\.\.platform%2Fdemo-1\?expand=1/);
  assert.match(workflowPushesHtml, /\/api\/platform-model\?view=pushes&amp;id=pushRecord%3Ademo-1%3A1/);
  assert.doesNotMatch(workflowPushesHtml, /<pre/);
  assert.match(workflowShipsHtml, /Platform Console - Change \/ Ships/);
  assert.match(workflowShipsHtml, /Ship Records/);
  assert.match(workflowShipsHtml, /Paginated list of ship records, release channels, linked pushes, and rollback proposals\./);
  assert.match(workflowShipsHtml, /Ship Detail/);
  assert.match(workflowShipsHtml, /Ship Record Detail/);
  assert.match(workflowShipsHtml, /Release channel/);
  assert.match(workflowShipsHtml, /Observation Status/);
  assert.match(workflowShipsHtml, /\/api\/platform-model\?view=ships&amp;id=shipRecord%3Ademo-1%3A1/);
  assert.doesNotMatch(workflowShipsHtml, /<pre/);
  assert.match(workflowProposalHtml, /Platform Console - Change \/ Proposals/);
  assert.match(workflowProposalHtml, /Proposals/);
  assert.match(workflowProposalHtml, /Proposal Detail/);
  assert.match(workflowProposalHtml, /Proposal Panel/);
  assert.match(workflowProposalHtml, /<form id="platform-proposal-form" data-platform-client-action="proposal.create" data-platform-submit-spec=.*data-platform-field-syncs=.*data-platform-status-id="proposal-status"/);
  assert.match(workflowProposalHtml, /data-sample-body=/);
  assert.match(workflowProposalHtml, /<form id="platform-review-form" data-platform-client-action="proposal.review" data-platform-submit-spec=.*data-platform-status-id="review-status"/);
  assert.match(workflowProposalHtml, /<option value="proposal:demo">proposal:demo<\/option>/);
  assert.match(workflowProposalHtml, /name="reviewAction" value="approve"/);

  assert.match(verificationLandingHtml, /Platform Console - Verification \/ Status/);
  assert.match(verificationLandingHtml, /Live Verification Status/);
  assert.match(verificationLandingHtml, /Current Verification State/);
  assert.match(verificationLandingHtml, /Queued items/);
  assert.match(verificationLandingHtml, /Policy source/);
  assert.match(verificationLandingHtml, /Persistence source/);
  assert.match(verificationLandingHtml, /Ledger backend/);
  assert.match(verificationLandingHtml, /Verification Status Items/);
  assert.doesNotMatch(verificationLandingHtml, /<pre/);
  assert.match(verificationStatusHtml, /Platform Console - Verification \/ Status/);
  assert.match(verificationStatusHtml, /Verification Status Items/);
  assert.match(verificationStatusHtml, /Policies/);
  assert.match(verificationStatusHtml, /Queue/);
  assert.match(verificationStatusHtml, /Executions/);
  assert.match(verificationStatusHtml, /Properties and linked resources for the selected verification object\./);
  assert.match(verificationStatusHtml, /Primary Detail/);
  assert.match(verificationStatusHtml, /Selected verification object properties and long-tail fields\./);
  assert.match(verificationStatusHtml, /Related Resources/);
  assert.match(verificationStatusHtml, /Linked verification resources, streams, and supporting context\./);
  assert.match(verificationStatusHtml, /Protected Objects/);
  assert.match(verificationStatusHtml, /Recent Test Runs/);
  assert.match(verificationStatusHtml, /Test Gate Detail/);
  assert.match(verificationStatusHtml, /\?area=verification&amp;section=runs&amp;id=testRun%3Ademo/);
  assert.doesNotMatch(verificationStatusHtml, /<form id="platform-test-run-form"/);
  assert.match(verificationPolicyHtml, /Verification Policy Detail/);
  assert.match(verificationPolicyHtml, /Verification Persistence/);
  assert.match(verificationPolicyHtml, /workspace/);
  assert.match(verificationExecutionHtml, /Verification Execution Detail/);
  assert.match(verificationExecutionHtml, /change-set/);
  assert.match(verificationRevisionHtml, /Platform Console - Verification \/ Runtime/);
  assert.match(verificationRevisionHtml, />Backend revision event stream</);
  assert.match(verificationRevisionHtml, /Verification status/);
  assert.match(verificationRevisionHtml, /Persistence source/);
  assert.match(verificationRunHtml, /Platform Console - Verification \/ Runs/);
  assert.match(verificationRunHtml, />Test run event stream</);
  assert.match(verificationRunHtml, />Backend revision event stream</);
  assert.match(verificationRunHtml, /Verification Run Items/);
  assert.match(verificationRunHtml, /\?area=verification&amp;section=status&amp;id=gate%3Ademo/);
  assert.match(verificationRunHtml, /\?area=verification&amp;section=runtime&amp;id=candidateSnapshot%3Ademo-0/);
  assert.match(verificationRunHtml, /<form id="platform-test-run-form" data-platform-client-action="testRun.single" data-platform-submit-spec=/);
  assert.match(verificationRunHtml, /<option value="gate:demo">Demo gate<\/option>/);
  assert.match(verificationRunHtml, /<form id="platform-selected-test-run-form" data-platform-client-action="testRun.selected" data-platform-submit-spec=/);
  assert.match(verificationRunHtml, /Run Report Summary/);
  assert.match(verificationRunHtml, /Cache hit run/);
  assert.match(verificationRunHtml, /testRun:baseline/);
  assert.match(verificationRunHtml, /Artifacts and Report Streams/);
  assert.match(verificationRunHtml, /Suite Summary/);
  assert.match(verificationRunHtml, /Failing Cases/);
  assert.match(verificationRunHtml, /Timing Regression/);
  assert.match(verificationRunFragmentHtml, /Verification Run Items/);
  assert.match(verificationRunFragmentHtml, /\?area=verification&amp;section=status&amp;id=gate%3Ademo/);
  assert.doesNotMatch(verificationRunFragmentHtml, /<!doctype html>/);
  assert.match(verificationRunShellHtml, /Loading platform content/);
  assert.match(verificationRunShellHtml, /\/api\/platform-page\?area=verification&amp;section=runs&amp;id=testRun%3Ademo/);
  assert.doesNotMatch(verificationRunShellHtml, /Selected Test Run/);

  assert.match(telemetryLandingHtml, /Platform Console - Telemetry/);
  assert.match(telemetryLandingHtml, /Paginated list of telemetry metrics, recent samples, windows, and regressions\./);
  assert.match(telemetryLandingHtml, /Primary Detail/);
  assert.doesNotMatch(telemetryLandingHtml, /<pre/);
  assert.match(telemetryDetailHtml, /Properties and linked relationships for the selected telemetry concept\./);
  assert.match(telemetryDetailHtml, /Primary Detail/);
  assert.match(telemetryDetailHtml, /Telemetry Metric Detail/);
  assert.match(telemetryDetailHtml, /Related Resources/);
  assert.match(telemetryDetailHtml, /Related Relationships/);
  assert.match(telemetryDetailHtml, /\/api\/platform-model\?view=telemetry&amp;id=telemetryMetric%3Arequests/);
  assert.doesNotMatch(telemetryDetailHtml, /<pre/);
  assert.match(defectsLandingHtml, /Platform Console - Defects/);
  assert.match(defectsLandingHtml, /Paginated list of defect clusters, defects, observations, and linked proposals\./);
  assert.match(defectsLandingHtml, /Primary Detail/);
  assert.doesNotMatch(defectsLandingHtml, /<pre/);
  assert.match(defectsDetailHtml, /Properties and linked relationships for the selected defect concept\./);
  assert.match(defectsDetailHtml, /Primary Detail/);
  assert.match(defectsDetailHtml, /Defect Detail/);
  assert.match(defectsDetailHtml, /Related Resources/);
  assert.match(defectsDetailHtml, /Observations/);
  assert.match(defectsDetailHtml, /proposal:demo-defect/);
  assert.match(defectsDetailHtml, /\/api\/platform-model\?view=defects&amp;id=defect%3Arequests/);
  assert.doesNotMatch(defectsDetailHtml, /<pre/);
  assert.match(artifactsLandingHtml, /Platform Console - Artifacts/);
  assert.match(artifactsLandingHtml, /Paginated list of durable artifacts, producer metadata, and linked execution context\./);
  assert.match(artifactsLandingHtml, /Primary Detail/);
  assert.doesNotMatch(artifactsLandingHtml, /<pre/);
  assert.match(artifactsDetailHtml, /Properties and linked relationships for the selected artifact\./);
  assert.match(artifactsDetailHtml, /Artifact Detail/);
  assert.match(artifactsDetailHtml, /Related Resources/);
  assert.match(artifactsDetailHtml, /Content/);
  assert.match(artifactsDetailHtml, /\/api\/platform-artifacts\/artifact%3AtestRun%3Ademo%3Astdout\/content/);
  assert.match(artifactsDetailHtml, /session\.platform/);
  assert.match(artifactsDetailHtml, /execution:render/);
  assert.doesNotMatch(artifactsDetailHtml, /<pre/);
  assert.match(sessionsLandingHtml, /Platform Console - Sessions/);
  assert.match(sessionsLandingHtml, /Paginated list of sessions, executions, session tags, execution artifacts, and linked authority decisions\./);
  assert.match(sessionsLandingHtml, /Primary Detail/);
  assert.doesNotMatch(sessionsLandingHtml, /<pre/);
  assert.match(sessionsDetailHtml, /Properties and linked relationships for the selected session concept\./);
  assert.match(sessionsDetailHtml, /Session Detail/);
  assert.match(sessionsDetailHtml, /Related Resources/);
  assert.match(sessionsDetailHtml, /execution:render/);
  assert.match(sessionsDetailHtml, /\/api\/platform-model\?view=sessions&amp;id=session\.platform/);
  assert.doesNotMatch(sessionsDetailHtml, /<pre/);

  assert.match(knowledgeLandingHtml, /Platform Console - Knowledge \/ Docs/);
  assert.match(knowledgeLandingHtml, /Governed Docs/);
  assert.match(knowledgeLandingHtml, /Folders/);
  assert.match(knowledgeLandingHtml, /Knowledge Doc Detail/);
  assert.doesNotMatch(knowledgeLandingHtml, /<pre/);
  assert.match(knowledgeDocsHtml, /Platform Console - Knowledge \/ Docs/);
  assert.match(knowledgeDocsHtml, /Governed Docs/);
  assert.match(knowledgeDocsHtml, /Properties and linked resources for the selected governed document\./);
  assert.match(knowledgeDocsHtml, /Primary Detail/);
  assert.match(knowledgeDocsHtml, /Related Resources/);
  assert.match(knowledgeDocsHtml, /Referenced Routes/);
  assert.match(knowledgeDocsHtml, /Authored Doc Links/);
  assert.match(knowledgeDocsHtml, /Authored Code Links/);
  assert.match(knowledgeDocsHtml, /Sections/);
  assert.match(knowledgeDocsHtml, /Document sections for the selected governed document when available\./);
  assert.match(knowledgeDocsHtml, /Tasks/);
  assert.match(knowledgeDocsHtml, /Document tasks for the selected governed document when available\./);
  assert.match(knowledgeDocsHtml, /Document Detail/);
  assert.doesNotMatch(knowledgeDocsHtml, /<pre/);
  assert.match(knowledgeFoldersHtml, /Platform Console - Knowledge \/ Folders/);
  assert.match(knowledgeFoldersHtml, /Folders/);
  assert.match(knowledgeFoldersHtml, /Properties and linked resources for the selected folder when available\./);
  assert.match(knowledgeFoldersHtml, /Folder Detail/);
  assert.match(knowledgeFoldersHtml, /Linked Concepts/);
  assert.match(knowledgeFoldersHtml, /Showing first \d+ of \d+ entries\./);
  assert.doesNotMatch(knowledgeFoldersHtml, /<pre/);
  assert.match(knowledgeRoadmapHtml, /Platform Console - Knowledge \/ Roadmap/);
  assert.match(knowledgeRoadmapHtml, /Roadmap Work/);
  assert.match(knowledgeRoadmapHtml, /Properties and linked resources for the selected roadmap object\./);
  assert.match(knowledgeRoadmapHtml, /Roadmap Task Detail/);
  assert.match(knowledgeRoadmapHtml, /Linked Targets/);
  assert.doesNotMatch(knowledgeRoadmapHtml, /<pre/);

  assert.match(signalsLandingHtml, /Platform Console - Signals \/ Gaps/);
  assert.doesNotMatch(signalsLandingHtml, /<pre/);
  assert.match(signalsGapHtml, /Platform Console - Signals \/ Gaps/);
  assert.match(signalsGapHtml, /Properties and linked relationships for the selected gap\./);
  assert.match(signalsGapHtml, /Primary Detail/);
  assert.match(signalsGapHtml, /Selected signal properties and long-tail fields\./);
  assert.match(signalsGapHtml, /Related Resources/);
  assert.match(signalsGapHtml, /Linked proposals, selector drift, and supporting signal context\./);
  assert.match(signalsGapHtml, /Recommended Proposal/);
  assert.match(signalsGapHtml, /Related Relationships/);
  assert.match(signalsGapHtml, /Linked graph relationships for the selected signal when available\./);
  assert.match(signalsGapHtml, /Gap Detail/);
  assert.match(signalsGapHtml, /API resource/);
  assert.match(signalsGapHtml, /sort=severity&amp;dir=desc/);
  assert.doesNotMatch(signalsGapHtml, /<pre/);
  assert.match(signalsCatalogHtml, /Platform Console - Signals \/ Catalog/);
  assert.match(signalsCatalogHtml, /Properties and linked relationships for the selected signal node\./);
  assert.match(signalsCatalogHtml, /Signals/);
  assert.match(signalsCatalogHtml, /Related Relationships/);
  assert.doesNotMatch(signalsCatalogHtml, /<pre/);

  assert.match(modelLandingHtml, /Platform Console - Advanced \/ Model/);
  assert.doesNotMatch(modelLandingHtml, /<pre/);
  assert.match(modelCompatHtml, /Platform Console - Advanced \/ Model/);
  assert.match(modelCompatHtml, /Platform Object Detail/);
  assert.match(modelObjectsHtml, /Platform Console - Advanced \/ Model/);
  assert.match(modelObjectsHtml, /Platform Map/);
  assert.match(modelObjectsHtml, /Properties and linked relationships for the selected platform object\./);
  assert.match(modelObjectsHtml, /Primary Detail/);
  assert.match(modelObjectsHtml, /Selected platform object properties and long-tail fields\./);
  assert.match(modelObjectsHtml, /Relationships/);
  assert.match(modelObjectsHtml, /Linked graph relationships for the selected platform object when available\./);
  assert.match(modelObjectsHtml, /Platform Object Detail/);
  assert.doesNotMatch(modelObjectsHtml, /<pre/);
  assert.match(modelProfilesHtml, /Platform Console - Advanced \/ Profiles/);
  assert.match(modelProfilesHtml, /Runtime Profiles/);
  assert.match(modelProfilesHtml, /sort=profile&amp;dir=asc/);
  assert.doesNotMatch(modelProfilesHtml, /<pre/);
  assert.match(modelCoverageHtml, /Platform Console - Advanced \/ Coverage/);
  assert.match(modelCoverageHtml, /Coverage Edges/);
  assert.match(modelCoverageHtml, /sort=gate&amp;dir=asc/);
  assert.doesNotMatch(modelCoverageHtml, /<pre/);
});

test("platform knowledge page renders authored knowledge relation links as linkable cards", () => {
  const html = renderPlatformPage({
    docs: [{
      id: "doc:docs/intent/README.md",
      path: "docs/intent/README.md",
      role: "governed",
      owner: "plugin.platform",
      status: "authored",
      freshness: { status: "fresh" },
      sectionCount: 0,
      taskCount: 0,
      references: {
        routes: [],
        pluginIds: [],
        filePaths: [],
        authoredDocLinks: [{ rel: "explains", target: "doc:docs/intent/knowledge-relations.wtoml" }],
        authoredCodeLinks: [{ rel: "isRealizedBy", target: "code:plugins/platform/platform-model.js" }]
      }
    }],
    docSections: [],
    docTasks: [],
    roadmapTasks: [],
    epics: [],
    features: [],
    summaries: {}
  }, {
    requestUrl: new URL("http://platform.local/platform?view=knowledgeDocs&id=docs/intent/README.md")
  });

  assert.match(html, /Authored Doc Links/);
  assert.match(html, /Authored Code Links/);
  assert.match(html, />explains: doc:docs\/intent\/knowledge-relations\.wtoml</);
  assert.match(html, /href="\/platform\?area=knowledge&amp;section=docs&amp;id=docs%2Fintent%2Fknowledge-relations\.wtoml"/);
  assert.match(html, />isRealizedBy: code:plugins\/platform\/platform-model\.js</);
  assert.match(html, /href="\/platform\?area=advanced&amp;section=model&amp;id=code%3Aplugins%2Fplatform%2Fplatform-model\.js"/);
});

test("platform page renders authored supplemental pages from the RVM page tree", () => {
  const model = {
    compatibilityBridges: [{
      id: "compatibilityBridge:detail-panels",
      bridgeClass: "rendering",
      owner: "plugin.platform",
      status: "active",
      surfaces: ["PlatformWorkflowDetail"],
      sampleTargets: ["surface:platform"]
    }],
    governanceRoutes: [{
      id: "governanceRoute:POST /api/platform-change-sets/demo/apply",
      pageKind: "route",
      method: "POST",
      matcher: "/api/platform-change-sets/demo/apply",
      handler: "platform.changeSet.apply",
      governanceMode: "direct-authority",
      authorityMechanism: "platform-policy:platform.execute.operator"
    }],
    proposalTargetGovernance: [{
      id: "governanceProposalTarget:runtimePlugin.install",
      pageKind: "proposal-target",
      targetProcess: "runtimePlugin.install",
      governanceMode: "proposal-fallback",
      authorityMechanism: "bootstrap-target-authority"
    }],
    mutableSurfaceSemantics: [{
      id: "mutableSurface:plugin.platform",
      title: "plugin.platform",
      surface: "plugin.platform",
      sharingClass: "shared",
      stateClass: "platform-graph",
      authorityRule: "proposal",
      visibilityRule: "modeled"
    }],
    packageCoexistence: [{
      id: "packageCoexistence:package.plugin.inspect",
      packageId: "package.plugin.inspect",
      packageLabel: "Plugin Inspect",
      coexistenceMode: "coexisting",
      selectedRevisionIds: ["packageRevision.plugin.inspect.v1", "packageRevision.plugin.inspect.v2"],
      namespaceSelections: [{ id: "namespaceSelection:plugin.inspect", context: "platform", name: "inspect" }]
    }],
    packageConvergence: [{
      id: "packageConvergence:package.plugin.inspect",
      packageId: "package.plugin.inspect",
      packageLabel: "Plugin Inspect",
      status: "glue-required",
      transformerIds: ["packageTransformer.inspect.v1-to-v2"],
      convergencePatchIds: ["packagePatch.inspect"],
      remainingGlue: [{ message: "Shared shim still needed." }]
    }],
    packageApplyPreviews: [{
      id: "packageApplyPreview:packageRevision.plugin.inspect.v2",
      packageId: "package.plugin.inspect",
      packageLabel: "Plugin Inspect",
      revisionId: "packageRevision.plugin.inspect.v2",
      revisionVersion: "v2",
      status: "glue-required",
      bundleHash: "bundle.inspect.v2",
      bundleFileCount: 3,
      relatedTransformerIds: ["packageTransformer.inspect.v1-to-v2"],
      relatedConvergencePatchIds: ["packagePatch.inspect"],
      remainingGlueMessages: ["Shared shim still needed."],
      explanation: "Preview still requires shared shim glue."
    }],
    summaries: {}
  };

  const bridgesHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=bridges&id=compatibilityBridge:detail-panels") });
  const governanceHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=governance&id=governanceRoute:POST%20/api/platform-change-sets/demo/apply") });
  const semanticsHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=semantics&id=mutableSurface:plugin.platform") });
  const coexistenceHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=packageCoexistence&id=package.plugin.inspect") });
  const convergenceHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=packageConvergence&id=package.plugin.inspect") });
  const applyPreviewHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=packageApplyPreview&id=packageRevision.plugin.inspect.v2") });

  assert.match(bridgesHtml, /Platform Console - Advanced \/ Bridges/);
  assert.match(bridgesHtml, /Bridge Inventory/);
  assert.match(bridgesHtml, /Compatibility bridge inventory for remaining convenience seams\./);
  assert.match(bridgesHtml, /Bridge Detail/);
  assert.match(bridgesHtml, /compatibilityBridge:detail-panels/);
  assert.match(bridgesHtml, /\?area=advanced&amp;section=packages/);
  assert.doesNotMatch(bridgesHtml, /<pre/);

  assert.match(governanceHtml, /Platform Console - Advanced \/ Governance/);
  assert.match(governanceHtml, /Governance Rows/);
  assert.match(governanceHtml, /Route and proposal-target governance coverage for mutating platform seams\./);
  assert.match(governanceHtml, /Governance Object Detail/);
  assert.match(governanceHtml, /governanceRoute:POST \/api\/platform-change-sets\/demo\/apply/);
  assert.doesNotMatch(governanceHtml, /<pre/);

  assert.match(semanticsHtml, /Platform Console - Advanced \/ Semantics/);
  assert.match(semanticsHtml, /Mutable Surface Semantics/);
  assert.match(semanticsHtml, /Personal, shared, and mixed mutable-surface semantics contract rows\./);
  assert.match(semanticsHtml, /Mutable Surface Detail/);
  assert.match(semanticsHtml, /mutableSurface:plugin\.platform/);
  assert.doesNotMatch(semanticsHtml, /<pre/);

  assert.match(coexistenceHtml, /Platform Console - Advanced \/ Packages/);
  assert.match(coexistenceHtml, /Package Coexistence Rows/);
  assert.match(coexistenceHtml, /Divergent package revision lines and namespace selections\./);
  assert.match(coexistenceHtml, /Package Coexistence Detail/);
  assert.match(coexistenceHtml, /packageRevision\.plugin\.inspect\.v1/);
  assert.doesNotMatch(coexistenceHtml, /<pre/);

  assert.match(convergenceHtml, /Platform Console - Advanced \/ Packages/);
  assert.match(convergenceHtml, /Package Convergence Rows/);
  assert.match(convergenceHtml, /Transformer contracts, convergence patches, and remaining authored glue\./);
  assert.match(convergenceHtml, /Package Convergence Detail/);
  assert.match(convergenceHtml, /packageTransformer\.inspect\.v1-to-v2/);
  assert.match(convergenceHtml, /Shared shim still needed\./);
  assert.doesNotMatch(convergenceHtml, /<pre/);

  assert.match(applyPreviewHtml, /Platform Console - Advanced \/ Packages/);
  assert.match(applyPreviewHtml, /Package Apply Preview Rows/);
  assert.match(applyPreviewHtml, /Revision-scoped apply impact, emitted bundle summary, and convergence truth\./);
  assert.match(applyPreviewHtml, /Package Apply Preview Detail/);
  assert.match(applyPreviewHtml, /packageRevision\.plugin\.inspect\.v2/);
  assert.match(applyPreviewHtml, /packageTransformer\.inspect\.v1-to-v2/);
  assert.doesNotMatch(applyPreviewHtml, /<pre/);
});

test("platform supplemental pages use authored empty states", () => {
  const emptyModel = { summaries: {} };

  const bridgesHtml = renderPlatformPage(emptyModel, { requestUrl: new URL("http://platform.local/platform?view=bridges") });
  const governanceHtml = renderPlatformPage(emptyModel, { requestUrl: new URL("http://platform.local/platform?view=governance") });
  const semanticsHtml = renderPlatformPage(emptyModel, { requestUrl: new URL("http://platform.local/platform?view=semantics") });
  const coexistenceHtml = renderPlatformPage(emptyModel, { requestUrl: new URL("http://platform.local/platform?view=packageCoexistence") });
  const convergenceHtml = renderPlatformPage(emptyModel, { requestUrl: new URL("http://platform.local/platform?view=packageConvergence") });
  const applyPreviewHtml = renderPlatformPage(emptyModel, { requestUrl: new URL("http://platform.local/platform?view=packageApplyPreview") });

  assert.match(bridgesHtml, /No compatibility bridges\./);
  assert.match(bridgesHtml, /No compatibility bridge selected\./);
  assert.match(governanceHtml, /No governance rows\./);
  assert.match(governanceHtml, /No governance object selected\./);
  assert.match(semanticsHtml, /No mutable-surface semantics rows\./);
  assert.match(semanticsHtml, /No mutable surface selected\./);
  assert.match(coexistenceHtml, /No package coexistence rows\./);
  assert.match(coexistenceHtml, /No package coexistence row selected\./);
  assert.match(convergenceHtml, /No package convergence rows\./);
  assert.match(convergenceHtml, /No package convergence row selected\./);
  assert.match(applyPreviewHtml, /No package apply preview rows\./);
  assert.match(applyPreviewHtml, /No package apply preview row selected\./);
});

test("platform page uses authored related-card empty states and item limits", () => {
  const changeSetIds = Array.from({ length: 13 }, (_, index) => `changeSet:demo-${index}`);
  const model = {
    lifecycleVocabulary: [],
    lifecycleBoard: [],
    branchLifecycleVocabulary: ["draft"],
    branchBoard: [{
      id: "draft",
      title: "Draft",
      count: 1,
      countLabel: "1 branch",
      branches: [{
        id: "branch:demo",
        titleLink: { id: "branch:demo", title: "Demo Branch" },
        status: "draft",
        activitySummary: "change sets 13"
      }]
    }],
    branches: [{
      id: "branch:demo",
      title: "Demo Branch",
      status: "draft",
      lifecycleLane: "draft",
      owner: "aaron",
      changeSetIds,
      affectedSystemSummaries: [],
      telemetryImpactSummaries: []
    }],
    changeSets: [],
    changeSetEdits: [],
    candidateSnapshots: [],
    proposals: [],
    proposalActions: [],
    summaries: {}
  };

  const html = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=workflowBranches&id=branch:demo") });

  assert.match(html, /No affected system summaries\./);
  assert.match(html, /No telemetry impact summaries\./);
  assert.match(html, /Showing first 12 of 13 entries\./);
  assert.match(html, /changeSet:demo-11/);
  assert.doesNotMatch(html, /changeSet:demo-12/);
  assert.doesNotMatch(html, /No linked resources\./);
  assert.doesNotMatch(html, /No entries\./);
});

test("platform page uses authored change-set snapshot empty state", () => {
  const model = {
    lifecycleVocabulary: [],
    lifecycleBoard: [],
    branchLifecycleVocabulary: [],
    branchBoard: [],
    branches: [],
    changeSets: [{
      id: "changeSet:demo",
      title: "Demo Change Set",
      status: "draft",
      branchId: "branch:demo",
      owner: "aaron",
      changedPaths: []
    }],
    changeSetEdits: [],
    candidateSnapshots: [],
    proposals: [],
    proposalActions: [],
    summaries: {}
  };

  const html = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=workflowChangeSets&id=changeSet:demo") });

  assert.match(html, /No candidate snapshots for this change set\./);
  assert.doesNotMatch(html, /No candidate snapshots for this branch\./);
});

test("platform workflow detail follows authored child-surface order", () => {
  const model = {
    lifecycleVocabulary: [],
    lifecycleBoard: [],
    branchLifecycleVocabulary: [],
    branchBoard: [],
    branches: [],
    changeSets: [{
      id: "changeSet:demo",
      title: "Demo Change Set",
      status: "draft",
      branchId: "branch:demo",
      owner: "aaron",
      changedPaths: []
    }],
    changeSetEdits: [],
    candidateSnapshots: [],
    proposals: [],
    proposalActions: [],
    summaries: {}
  };

  const html = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=workflowChangeSets&id=changeSet:demo") });

  assert.ok(html.indexOf("Candidate Snapshots") < html.indexOf("Staged Edits"));
});

test("platform page renders verification requirement sections for change sets and candidate snapshots", () => {
  const model = {
    lifecycleVocabulary: [],
    lifecycleBoard: [],
    branchLifecycleVocabulary: [],
    branchBoard: [],
    branches: [],
    changeSets: [{
      id: "changeSet:demo",
      title: "Demo Change Set",
      status: "validated",
      branchId: "branch:demo",
      owner: "aaron",
      changedPaths: ["plugins/platform/platform-console.rvm"]
    }],
    changeSetEdits: [],
    candidateSnapshots: [{
      id: "candidateSnapshot:demo",
      status: "valid",
      branchId: "branch:demo",
      changeSetId: "changeSet:demo",
      revision: 1,
      files: [],
      errors: []
    }],
    verificationRequirementSummaries: [{
      id: "verificationRequirementSummary:changeSet:changeSet:demo",
      targetKind: "changeSet",
      targetId: "changeSet:demo",
      changeSetId: "changeSet:demo",
      candidateSnapshotId: null,
      blockingStatus: "blocked",
      totalGateCount: 1,
      blockingGateCount: 1,
      satisfiedCount: 0,
      failedCount: 0,
      staleCount: 1,
      missingCount: 0,
      runningCount: 0,
      latestRunAt: "2026-06-19T00:00:00Z",
      summary: "1 gate selected, 1 stale",
      producedAt: "2026-06-19T00:00:00Z"
    }, {
      id: "verificationRequirementSummary:candidateSnapshot:candidateSnapshot:demo",
      targetKind: "candidateSnapshot",
      targetId: "candidateSnapshot:demo",
      changeSetId: "changeSet:demo",
      candidateSnapshotId: "candidateSnapshot:demo",
      blockingStatus: "blocked",
      totalGateCount: 1,
      blockingGateCount: 1,
      satisfiedCount: 0,
      failedCount: 0,
      staleCount: 1,
      missingCount: 0,
      runningCount: 0,
      latestRunAt: "2026-06-19T00:00:00Z",
      summary: "1 gate selected, 1 stale",
      producedAt: "2026-06-19T00:00:00Z"
    }],
    verificationRequirements: [{
      id: "verificationRequirement:changeSet:changeSet:demo:gate:demo",
      targetKind: "changeSet",
      targetId: "changeSet:demo",
      changeSetId: "changeSet:demo",
      candidateSnapshotId: null,
      gateId: "gate:demo",
      gateTitle: "Demo Gate",
      serverRunnerId: "runner.main",
      runtimeProfile: "full",
      executionClass: "candidate_snapshot",
      blocking: true,
      status: "stale",
      latestRunId: "testRun:demo",
      latestPassedRunId: "testRun:demo",
      freshnessStatus: "stale",
      reasonKinds: ["source_changed"],
      reasonSummary: "Source changed after the last passing run.",
      regressionStatus: "steady",
      changedPaths: ["plugins/platform/platform-console.rvm"],
      targetIds: ["testEnvironment:platform-candidate-snapshot"],
      producedAt: "2026-06-19T00:00:00Z"
    }, {
      id: "verificationRequirement:candidateSnapshot:candidateSnapshot:demo:gate:demo",
      targetKind: "candidateSnapshot",
      targetId: "candidateSnapshot:demo",
      changeSetId: "changeSet:demo",
      candidateSnapshotId: "candidateSnapshot:demo",
      gateId: "gate:demo",
      gateTitle: "Demo Gate",
      serverRunnerId: "runner.main",
      runtimeProfile: "full",
      executionClass: "candidate_snapshot",
      blocking: true,
      status: "stale",
      latestRunId: "testRun:demo",
      latestPassedRunId: "testRun:demo",
      freshnessStatus: "stale",
      reasonKinds: ["source_changed"],
      reasonSummary: "Source changed after the last passing run.",
      regressionStatus: "steady",
      changedPaths: ["plugins/platform/platform-console.rvm"],
      targetIds: ["testEnvironment:platform-candidate-snapshot"],
      producedAt: "2026-06-19T00:00:00Z"
    }],
    proposals: [],
    proposalActions: [],
    testRuns: [],
    testReports: [],
    testArtifacts: [],
    testSuites: [],
    testCases: [],
    runtimeRevisions: [],
    snapshotBuilds: [],
    snapshotBuildErrors: [],
    snapshotDiagnostics: {},
    testMonitorDiagnostics: {},
    summaries: {}
  };

  const workflowHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=workflowChangeSets&id=changeSet:demo") });
  const runtimeHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=verificationRuntime&id=candidateSnapshot:demo") });

  assert.match(workflowHtml, /Verification Requirement Summary/);
  assert.match(workflowHtml, /Required Gates/);
  assert.match(workflowHtml, /Blocking Reasons/);
  assert.match(workflowHtml, /gate:demo/);
  assert.match(workflowHtml, /Source changed after the last passing run\./);
  assert.match(runtimeHtml, /Verification Requirement Summary/);
  assert.match(runtimeHtml, /Required Gates/);
  assert.match(runtimeHtml, /Blocking Reasons/);
  assert.match(runtimeHtml, /candidateSnapshot:demo/);
});

test("platform detail sections render authored child-surface metadata", () => {
  const consoleLayout = readPlatformConsoleLayout();
  const workflowPage = consoleLayout.children.find(surface => surface.props?.pageId === "workflowBranches");
  const verificationPage = consoleLayout.children.find(surface => surface.props?.pageId === "verificationStatus");
  const knowledgeDocsPage = consoleLayout.children.find(surface => surface.props?.pageId === "knowledgeDocs");
  const signalsGapsPage = consoleLayout.children.find(surface => surface.props?.pageId === "signalsGaps");
  const modelPage = consoleLayout.children.find(surface => surface.props?.pageId === "modelObjects");
  const appliesToDetailKind = (surface, detailKind) => {
    const raw = surface?.props?.detailKinds;
    if (!raw) return true;
    return String(raw).split("|").map(part => part.trim()).filter(Boolean).includes(detailKind);
  };
  const workflowDetailSurface = workflowPage.childSurfaces.find(surface => surface.name === "PlatformWorkflowDetail");
  const verificationDetailSurface = verificationPage.childSurfaces.find(surface => surface.name === "PlatformVerificationDetail");
  const knowledgeDetailSurface = knowledgeDocsPage.childSurfaces.find(surface => surface.name === "PlatformKnowledgeDocsDetail");
  const signalDetailSurface = signalsGapsPage.childSurfaces.find(surface => surface.name === "PlatformGapDetail");
  const modelDetailSurface = modelPage.childSurfaces.find(surface => surface.name === "PlatformModelDetail");
  const model = {
    lifecycleVocabulary: [],
    lifecycleBoard: [],
    branchLifecycleVocabulary: [],
    branchBoard: [],
    branches: [{
      id: "branch:demo",
      title: "Demo Branch",
      status: "draft",
      lifecycleLane: "draft",
      owner: "aaron",
      changeSetIds: ["changeSet:demo"],
      affectedSystemSummaries: [],
      telemetryImpactSummaries: []
    }],
    changeSets: [{
      id: "changeSet:demo",
      title: "Demo Change Set",
      status: "draft",
      branchId: "branch:demo",
      owner: "aaron",
      changedPaths: [],
      editCount: 0
    }],
    changeSetEdits: [],
    candidateSnapshots: [],
    proposals: [],
    proposalActions: [],
    testGates: [{
      id: "gate:demo",
      title: "Demo Gate",
      status: "ready",
      runner: "node",
      environment: "local",
      command: "node --test",
      lastResult: { status: "passed", exitCode: 0 },
      protectedObjects: [],
      selectedByBranches: [],
      selectedByChangeSets: []
    }],
    runtimeRevisions: [{
      id: "runtimeRevision:demo",
      revision: 7,
      status: "ready",
      trigger: "candidateSnapshot",
      branchId: "branch:demo",
      changeSetId: "changeSet:demo",
      changedSources: ["plugins/platform/platform-console.rvm"],
      buildErrorCount: 1
    }],
    testRuns: [{
      id: "testRun:demo",
      title: "Demo Run",
      status: "passed",
      gateId: "gate:demo",
      branchId: "branch:demo",
      changeSetId: "changeSet:demo",
      candidateSnapshotId: "candidateSnapshot:demo",
      durationMs: 25,
      exitCode: 0
    }],
    verificationFreshness: [{
      id: "verificationFreshness:gate:demo",
      gateId: "gate:demo",
      status: "fresh",
      latestRunId: "testRun:demo",
      latestPassedRunId: "testRun:demo",
      reasonKinds: ["clean"],
      reasonSummary: "Verification evidence is current.",
      changedPaths: [],
      targetIds: [],
      blocking: false,
      producedAt: "2026-06-19T00:00:00Z"
    }],
    verificationInvalidations: [],
    testReports: [{
      id: "testReport:testRun:demo:summary",
      runId: "testRun:demo",
      reportKind: "summary",
      status: "passed",
      summary: "All good",
      format: "json",
      suiteCount: 1,
      caseCount: 2,
      passedCount: 2,
      failedCount: 0,
      errorCount: 0,
      skippedCount: 0,
      cached: false,
      producedAt: "2026-06-19T00:00:00Z"
    }, {
      id: "testReport:testRun:demo:regression",
      runId: "testRun:demo",
      reportKind: "regression",
      status: "passed",
      summary: "Within baseline",
      regressionSummary: {
        baselineRunId: "testRun:baseline",
        baselineDurationMs: 20,
        currentDurationMs: 25,
        deltaMs: 5,
        deltaPercent: 25
      }
    }],
    testArtifacts: [],
    testSuites: [],
    testCases: [],
    snapshotBuilds: [{
      id: "snapshotBuild:demo",
      revision: 7,
      status: "built",
      candidateSnapshotId: "candidateSnapshot:demo",
      branchId: "branch:demo",
      errorCount: 1
    }],
    snapshotBuildErrors: [{
      snapshotBuildId: "snapshotBuild:demo",
      revision: 7,
      path: "plugins/platform/platform-console.rvm",
      kind: "parse",
      message: "demo error"
    }],
    snapshotDiagnostics: {},
    testMonitorDiagnostics: {},
    branchTestRedGreen: [],
    changeSetTestRedGreen: [],
    latestTestResultsByGate: {},
    docs: [{
      id: "doc:docs/PLATFORM-ALL-THE-WAY-ROADMAP.md",
      path: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md",
      role: "roadmap",
      owner: "plugin.platform",
      status: "active",
      freshness: { status: "current" },
      sectionCount: 1,
      taskCount: 1,
      references: { routes: ["route:GET /platform"], pluginIds: [], filePaths: [] }
    }],
    docSections: [{
      doc: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md",
      title: "Phase 12",
      line: 1,
      depth: 1
    }],
    docTasks: [{
      id: "roadmapTask:demo",
      title: "Split console pages",
      status: "open",
      derivedStatus: "ready",
      doc: "docs/PLATFORM-ALL-THE-WAY-ROADMAP.md",
      line: 2,
      section: "Phase 12"
    }],
    gaps: [{
      id: "gap.demo",
      severity: "low",
      kind: "meta-defect",
      target: "branch:demo",
      reason: "Demo gap"
    }],
    nodes: [{
      id: "route:GET /platform",
      kind: "route",
      title: "GET /platform",
      status: "live",
      owner: "plugin.platform",
      source: "platform",
      lifecycle: ["observe"]
    }],
    edges: [{
      from: "route:GET /platform",
      rel: "supports",
      to: "branch:demo"
    }],
    summaries: {}
  };

  const workflowHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=workflowChangeSets&id=changeSet:demo") });
  const verificationGateHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=verificationStatus&id=gate:demo") });
  const verificationRevisionHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=verificationRuntime&id=runtimeRevision:demo") });
  const verificationRunHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=verificationRuns&id=testRun:demo") });
  const knowledgeHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=knowledgeDocs&id=docs/PLATFORM-ALL-THE-WAY-ROADMAP.md") });
  const signalHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=signalsGaps&id=gap.demo") });
  const modelHtml = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=modelObjects&id=route:GET%20/platform") });

  for (const child of workflowDetailSurface.childSurfaces.filter(surface => appliesToDetailKind(surface, "changeSet"))) {
    if (child.title) assert.match(workflowHtml, new RegExp(escapeRegExp(child.title)));
    if (child.summary) assert.match(workflowHtml, new RegExp(escapeRegExp(child.summary)));
  }
  for (const child of verificationDetailSurface.childSurfaces.filter(surface => appliesToDetailKind(surface, "gate"))) {
    if (child.title) assert.match(verificationGateHtml, new RegExp(escapeRegExp(child.title)));
    if (child.summary) assert.match(verificationGateHtml, new RegExp(escapeRegExp(child.summary)));
  }
  for (const child of verificationDetailSurface.childSurfaces.filter(surface => appliesToDetailKind(surface, "runtimeRevision"))) {
    if (child.title) assert.match(verificationRevisionHtml, new RegExp(escapeRegExp(child.title)));
    if (child.summary) assert.match(verificationRevisionHtml, new RegExp(escapeRegExp(child.summary)));
  }
  for (const child of verificationDetailSurface.childSurfaces.filter(surface => appliesToDetailKind(surface, "testRun"))) {
    if (child.title) assert.match(verificationRunHtml, new RegExp(escapeRegExp(child.title)));
    if (child.summary) assert.match(verificationRunHtml, new RegExp(escapeRegExp(child.summary)));
  }
  for (const child of knowledgeDetailSurface.childSurfaces.filter(surface => appliesToDetailKind(surface, "document"))) {
    if (child.title) assert.match(knowledgeHtml, new RegExp(escapeRegExp(child.title)));
    if (child.summary) assert.match(knowledgeHtml, new RegExp(escapeRegExp(child.summary)));
  }
  for (const child of signalDetailSurface.childSurfaces.filter(surface => appliesToDetailKind(surface, "gap"))) {
    if (child.title) assert.match(signalHtml, new RegExp(escapeRegExp(child.title)));
    if (child.summary) assert.match(signalHtml, new RegExp(escapeRegExp(child.summary)));
  }
  for (const child of modelDetailSurface.childSurfaces.filter(surface => appliesToDetailKind(surface, "object"))) {
    if (child.title) assert.match(modelHtml, new RegExp(escapeRegExp(child.title)));
    if (child.summary) assert.match(modelHtml, new RegExp(escapeRegExp(child.summary)));
  }
});

test("platform detail sections filter child surfaces by authored detailKinds", () => {
  const model = {
    lifecycleVocabulary: [],
    lifecycleBoard: [],
    branchLifecycleVocabulary: [],
    branchBoard: [],
    nodes: [{
      id: "telemetryMetric:platform.self",
      kind: "telemetryMetric",
      title: "platform.self latency",
      status: "active",
      owner: "plugin.platform",
      source: "platform",
      lifecycle: ["observe"]
    }],
    edges: [{
      from: "telemetryMetric:platform.self",
      rel: "observes",
      to: "plugin.platform"
    }],
    gaps: [],
    summaries: {}
  };

  const html = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=signalsCatalog&id=telemetryMetric:platform.self") });

  assert.match(html, /Primary Detail/);
  assert.match(html, /Related Relationships/);
  assert.doesNotMatch(html, /Linked proposals, selector drift, and supporting signal context\./);
});

test("platform verification run detail respects authored empty states for reports, suites, and failures", () => {
  const model = {
    lifecycleVocabulary: [],
    lifecycleBoard: [],
    branchLifecycleVocabulary: [],
    branchBoard: [],
    nodes: [],
    edges: [],
    testGates: [],
    testRuns: [{
      id: "testRun:empty",
      title: "Empty Run",
      status: "passed",
      gateId: "gate:empty",
      durationMs: 10,
      exitCode: 0
    }],
    testArtifacts: [],
    testSuites: [],
    testCases: [],
    testReports: [],
    runtimeRevisions: [],
    activeRuntimeRevision: null,
    candidateSnapshots: [],
    snapshotBuilds: [],
    snapshotBuildErrors: [],
    snapshotDiagnostics: {},
    testMonitorDiagnostics: {},
    branchTestRedGreen: [],
    changeSetTestRedGreen: [],
    latestTestResultsByGate: {},
    summaries: {}
  };

  const html = renderPlatformPage(model, { requestUrl: new URL("http://platform.local/platform?view=verificationRuns&id=testRun:empty") });

  assert.match(html, /No artifacts or report streams were captured for this run\./);
  assert.match(html, /No structured suites were derived for this run\./);
  assert.match(html, /No failing or error cases were derived for this run\./);
});

test("platform page uses authored empty-detail states", () => {
  const emptyModel = {
    lifecycleVocabulary: [],
    lifecycleBoard: [],
    branchLifecycleVocabulary: [],
    branchBoard: [],
    nodes: [],
    edges: [],
    docs: [],
    gaps: [],
    profiles: [],
    changeSets: [],
    branches: [],
    changeSetEdits: [],
    candidateSnapshots: [],
    proposals: [],
    proposalActions: [],
    testGates: [],
    testRuns: [],
    testArtifacts: [],
    testSuites: [],
    testCases: [],
    testReports: [],
    runtimeRevisions: [],
    activeRuntimeRevision: null,
    snapshotBuilds: [],
    snapshotBuildErrors: [],
    snapshotDiagnostics: {},
    branchTestRedGreen: [],
    changeSetTestRedGreen: [],
    latestTestResultsByGate: {},
    docSections: [],
    docTasks: [],
    folders: [],
    roadmapTasks: [],
    epics: [],
    features: [],
    coverageEdges: [],
    summaries: {}
  };

  const workflowHtml = renderPlatformPage(emptyModel, { requestUrl: new URL("http://platform.local/platform?view=workflowBranches&id=branch:missing") });
  const verificationHtml = renderPlatformPage(emptyModel, { requestUrl: new URL("http://platform.local/platform?view=verificationStatus&id=gate:missing") });
  const knowledgeHtml = renderPlatformPage(emptyModel, { requestUrl: new URL("http://platform.local/platform?view=knowledgeDocs&id=doc:missing") });
  const knowledgeFoldersHtml = renderPlatformPage(emptyModel, { requestUrl: new URL("http://platform.local/platform?view=knowledgeFolders&id=folder:missing") });
  const signalsHtml = renderPlatformPage(emptyModel, { requestUrl: new URL("http://platform.local/platform?view=signalsGaps&id=gap.missing") });
  const modelHtml = renderPlatformPage(emptyModel, { requestUrl: new URL("http://platform.local/platform?view=modelObjects&id=route:missing") });

  assert.match(workflowHtml, /No workflow rows are projected yet\./);
  assert.match(verificationHtml, /No verification rows are projected yet\./);
  assert.match(knowledgeHtml, /No governed docs are projected yet\./);
  assert.match(knowledgeFoldersHtml, /No folder metadata is projected yet\./);
  assert.match(signalsHtml, /No gaps are projected yet\./);
  assert.match(modelHtml, /No platform objects are projected yet\./);
});

test("platform page applies authored list sort semantics and preserves them through pagination links", async () => {
  const surface = {
    props: {
      sortOptions: "kind=pageKind|status=status|resource=title|source=scope|owner=summary",
      defaultSort: "kind:asc"
    }
  };
  const rows = [
    { id: "route:selected", pageKind: "route", title: "Selected", status: "known", scope: "platform", summary: "plugin.platform" },
    { id: "route:alpha", pageKind: "route", title: "Alpha", status: "known", scope: "platform", summary: "plugin.platform" },
    { id: "route:beta", pageKind: "route", title: "Beta", status: "known", scope: "platform", summary: "plugin.platform" },
    { id: "route:gamma", pageKind: "route", title: "Gamma", status: "known", scope: "platform", summary: "plugin.platform" },
    { id: "route:omega", pageKind: "route", title: "Omega", status: "known", scope: "platform", summary: "plugin.platform" },
    { id: "route:theta", pageKind: "route", title: "Theta", status: "known", scope: "platform", summary: "plugin.platform" }
  ];
  const sorted = sortRecordsForSurface(rows, surface, { sort: "resource", dir: "desc" }, { defaultSortKey: "kind" });

  assert.deepEqual(sorted.items.slice(0, 5).map(row => row.title), ["Theta", "Selected", "Omega", "Gamma", "Beta"]);

  const baseModel = await buildPlatformModel({
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
  const model = {
    ...baseModel,
    profiles: [{ id: "full", status: "active", pluginIds: ["plugin.platform"], capabilities: ["platform.self"] }],
    nodes: rows.map(row => ({
      id: row.id,
      kind: row.pageKind,
      title: row.title,
      status: row.status,
      owner: row.summary,
      source: row.scope,
      lifecycle: ["observe"]
    })),
    edges: [],
    gaps: [],
    docs: [],
    docSections: [],
    docTasks: [],
    roadmapTasks: [],
    epics: [],
    features: [],
    branches: [],
    changeSets: [],
    proposals: [],
    testGates: [],
    testRuns: [],
    candidateSnapshots: [],
    runtimeRevisions: []
  };
  const html = renderPlatformPage(model, {
    requestUrl: new URL("http://platform.local/platform?view=modelObjects&id=route:selected&sort=resource&dir=desc&limit=5")
  });

  assert.match(html, /offset=5&amp;limit=5&amp;sort=resource&amp;dir=desc/);
  assert.match(html, /sort=resource&amp;dir=asc/);
});
