import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { applyWitnessToml } from "../src/dsl.js";
import { installRuntimePlugin, moduleProjectors } from "../src/modules.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import {
  DEFAULT_BOOTSTRAP_RUNTIME_PROFILE,
  DEFAULT_BOOTSTRAP_STARTUP_PLUGIN_IDS
} from "../src/runtime-bundles.js";
import { resolveRuntimeOperatorPaths } from "../src/runtime-operator-contract.js";
import { defineWidgetVersion, defineWidgetVersionTransition, activateWidgetVersion } from "../src/widgets.js";
import { runCanonicalAuthoringPathwayProbe } from "../scripts/mcp-authoring-replay-probe.mjs";

async function tempRuntimeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "witness-bootstrap-host-"));
}

function cookieHeader(setCookie) {
  return (setCookie || "").split(";")[0];
}

async function openSession(serverUrl, { username = "aaron", password = username } = {}) {
  const response = await fetch(`${serverUrl}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return {
    response,
    body: await response.json(),
    cookie: cookieHeader(response.headers.get("set-cookie"))
  };
}

function widgetInput(input) {
  const id = typeof input?.id === "string" && input.id.trim() ? input.id.trim() : "widget";
  return {
    guidanceTarget: input?.guidanceTarget ?? input?.tutorialTarget ?? id,
    ...input
  };
}

async function startBlankServer({ runtimePluginIds = null } = {}) {
  const world = createWorld();
  declareBackendHost(world, { actor: "system", id: "backendHost", runtimeProfile: DEFAULT_BOOTSTRAP_RUNTIME_PROFILE });
  declareFrontendHost(world, { actor: "system", id: "frontendHost", runtimeProfile: DEFAULT_BOOTSTRAP_RUNTIME_PROFILE });
  const server = await startServer(world, {
    actor: "system",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeStartupMode: "bootstrap",
    runtimePluginIds,
    startupRuntimePluginIds: runtimePluginIds == null ? [...DEFAULT_BOOTSTRAP_STARTUP_PLUGIN_IDS] : null
  });
  assert.equal(server.ok, true);
  return { world, server };
}

async function startBlankServerWithWorldHome(worldHome) {
  const operatorContract = await resolveRuntimeOperatorPaths({
    startupMode: "bootstrap",
    cwd: process.cwd(),
    env: { WORLD_HOME: worldHome }
  });
  const world = createWorld({
    genesis: { system: "witness-world", mode: "bootstrap" },
    witnessLogPath: operatorContract.canonicalTruth.witnessLogPath,
    observationLogPath: operatorContract.canonicalTruth.observationLogPath
  });
  declareBackendHost(world, { actor: "system", id: "backendHost", runtimeProfile: DEFAULT_BOOTSTRAP_RUNTIME_PROFILE });
  declareFrontendHost(world, { actor: "system", id: "frontendHost", runtimeProfile: DEFAULT_BOOTSTRAP_RUNTIME_PROFILE });
  const server = await startServer(world, {
    actor: "system",
    runtimeRoot: operatorContract.directories.runtimeRoot,
    runtimeStartupMode: "bootstrap",
    runtimeOperatorContract: operatorContract,
    startupRuntimePluginIds: [...DEFAULT_BOOTSTRAP_STARTUP_PLUGIN_IDS]
  });
  assert.equal(server.ok, true);
  return { world, server, operatorContract };
}

test("blank world falls back to bootstrap instead of failing hard", async () => {
  const { server } = await startBlankServer();
  try {
    const rootHtml = await fetch(`${server.url}/`).then(response => response.text());
    const bootstrapHtml = await fetch(`${server.url}/_bootstrap`).then(response => response.text());
    const model = await fetch(`${server.url}/api/bootstrap-model`).then(response => response.json());
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(response => response.json());

    assert.match(rootHtml, /Recover And Author The App Boundary/);
    assert.match(bootstrapHtml, /Semi-Internal Bootstrap Seam/);
    assert.equal(model.appReady, false);
    assert(model.supportedHandlers.includes("backendProgram.run"));
    assert(model.supportedHandlers.includes("page.surface"));
    assert(model.supportedHandlers.includes("events.stream"));
    assert(model.supportedHandlerSets.includes("demo"));
    assert.equal(model.supportedHandlerMetadata["backendProgram.run"].routeKind, "backendProgram");
    assert.equal(model.supportedHandlerMetadata["events.stream"].routeKind, "stream");
    assert(model.supportedBackendOps.includes("handler.invoke"));
    assert(model.supportedBackendOps.includes("process.request"));
    assert(model.supportedBackendOps.includes("project.read"));
    assert(model.supportedBackendOps.includes("witness.emit"));
    assert(model.supportedFrontendOps.includes("renderCollection"));
    assert.equal(model.authoringPolicy.mode, "mcp_only");
    assert.equal(model.authoringPolicy.llmWritePath, "plugin.authoring");
    assert.equal(diagnostics.activeProfile, "minimal");
    assert.equal(diagnostics.authoringPolicy.mode, "mcp_only");
    assert.equal(diagnostics.authoringPolicy.proposalAccess, "read_only");
    assert.deepEqual(diagnostics.authoringMatrix.baseline.publicFrontendModel, [
      "surface",
      "collection",
      "process",
      "projection",
      "message",
      "boundary",
      "policy",
      "capability"
    ]);
    assert.equal(diagnostics.authoringMatrix.publicAuthoringConcepts.surface.status, "supported");
    assert.equal(diagnostics.authoringMatrix.publicAuthoringConcepts.process.status, "supported");
    assert.equal(diagnostics.authoringMatrix.publicAuthoringConcepts.frontendProgram.status, "legacy_only");
    assert.equal(diagnostics.proposalTargetGovernance.some(row => row.targetProcess === "runtimePlugin.install" && row.governanceMode === "proposal-fallback"), true);
    assert.equal(diagnostics.proposalTargetGovernance.some(row => row.targetProcess === "changeSet.apply" && row.governanceMode === "direct-authority"), true);
    assert.deepEqual([...diagnostics.activeBundles.map(bundle => bundle.id)].sort(), [
      "bundle-authoring-core",
      "bundle-core-runtime",
      "bundle-bootstrap",
      "bundle-capability-authoring",
      "bundle-mcp-authoring",
      "bundle-program-authoring",
      "bundle-proposals",
      "bundle-server-runner-authoring",
      "bundle-starter",
      "bundle-tutorial"
    ].sort());
    assert.equal(diagnostics.startupRunner?.bootstrapOnly, true);
    assert.equal(diagnostics.composition.storyId, "startup-runner-driven");
    assert.equal(diagnostics.composition.activeRunnerSource, "startup-default-runner");
    assert.equal(diagnostics.composition.activePluginSource, "startup-defaults");
    assert.equal(diagnostics.composition.usesAuthoredServerRunner, false);
    assert.equal(diagnostics.composition.usesAuthoredRuntimePluginInstalls, false);
    assert.match(diagnostics.composition.explanation, /startup default runner __bootstrap__/);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-demo"), false);
  } finally {
    await server.close();
  }
});

test("bootstrap state exposes operator contract and artifact inventory for world-home runtimes", async () => {
  const worldHome = await fs.mkdtemp(path.join(os.tmpdir(), "witness-operator-state-"));
  const { server } = await startBlankServerWithWorldHome(worldHome);
  try {
    const state = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(state.operator.contract.layout, "world-home-v1");
    assert.equal(state.operator.contract.worldHome, path.resolve(worldHome));
    assert.equal(state.authoringPolicy.mode, "mcp_only");
    assert.equal(state.authoringPolicy.llmWritePath, "plugin.authoring");
    assert.deepEqual(state.operator.inventory.backups, []);
    assert.deepEqual(state.operator.inventory.exports, []);
    assert.deepEqual(state.operator.inventory.imports, []);
    assert.equal(state.operator.mutations.enabled, true);
    assert.equal(state.governanceRoutes.some(row =>
      row.handler === "widgets.create"
        && row.governanceMode === "proposal-fallback"
        && row.authorityMechanism === "bootstrap-context-or-target-authority"
    ), true);
    assert.equal(state.proposalTargetGovernance.some(row =>
      row.targetProcess === "runtimePlugin.install"
        && row.governanceMode === "proposal-fallback"
        && row.bootstrapSelectable === true
    ), true);
    assert.equal(Array.isArray(state.widgetVersions), true);
    assert.equal(Array.isArray(state.widgetVersionTransitions), true);
    assert.equal(Array.isArray(state.widgetVersionActivationHistory), true);
    assert.equal(Array.isArray(state.backendProgramTransitions), true);
    assert.equal(Array.isArray(state.backendProgramActivationHistory), true);
  } finally {
    await server.close();
    await fs.rm(worldHome, { recursive: true, force: true });
  }
});

test("bootstrap state exposes authored package nouns and coexistence projections through HTTP", async () => {
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
id = "packageNamespace:ctx.alpha:inspectA"
context = "ctx.alpha"
name = "inspectA"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.beta:inspectB"
context = "ctx.beta"
name = "inspectB"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v2"

[[packageTransformer]]
actor = "system"
id = "packageTransformer.inspect.v1-to-v2"
package = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
sourceNamespace = "packageNamespace:ctx.alpha:inspectA"
targetRevision = "packageRevision.plugin.inspect.v2"
targetNamespace = "packageNamespace:ctx.beta:inspectB"
strategy = "follow-up-revision"
status = "active"
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

[[packageDependency]]
actor = "system"
sourcePackage = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v2"
targetKind = "capability"
targetId = "dom.render"
`);
  declareBackendHost(world, { actor: "system", id: "backendHost", runtimeProfile: DEFAULT_BOOTSTRAP_RUNTIME_PROFILE });
  declareFrontendHost(world, { actor: "system", id: "frontendHost", runtimeProfile: DEFAULT_BOOTSTRAP_RUNTIME_PROFILE });
  const server = await startServer(world, {
    actor: "system",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeStartupMode: "bootstrap",
    startupRuntimePluginIds: [...DEFAULT_BOOTSTRAP_STARTUP_PLUGIN_IDS]
  });
  assert.equal(server.ok, true);
  try {
    const state = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(state.packages.length, 1);
    assert.equal(state.packageRevisions.length, 2);
    assert.equal(state.packagePatches.length, 1);
    assert.equal(state.packageNamespaces.length, 2);
    assert.equal(state.packageDependencies.length, 1);
    assert.equal(state.packageTransformers.length, 1);
    assert.equal(state.packageCoexistence.length, 1);
    assert.equal(state.packageCoexistence[0].coexistenceMode, "coexisting");
    assert.equal(state.packageConvergence.length, 1);
    assert.equal(state.packageConvergence[0].status, "glue-required");
    const preview = state.packageApplyPreviews.find(row => row.revisionId === "packageRevision.plugin.inspect.v2");
    assert.ok(preview);
    assert.equal(preview.status, "glue-required");
    assert.deepEqual(preview.relatedTransformerIds, ["packageTransformer.inspect.v1-to-v2"]);
  } finally {
    await server.close();
  }
});

test("bootstrap model exposes authored package nouns as bindable HTTP composition targets", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.packages"

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

[[packagePatch]]
actor = "system"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"
path = "plugins/inspect/runtime.js"
operation = "replace"
sourceLanguage = "js"
body = { export = "inspect" }

[[packageNamespace]]
actor = "system"
id = "packageNamespace:ctx.packages:inspectLocal"
context = "ctx.packages"
name = "inspectLocal"
package = "package.plugin.inspect"
revision = "packageRevision.plugin.inspect.v1"

[[packageDependency]]
actor = "system"
sourcePackage = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
targetKind = "capability"
targetId = "dom.render"

[[packageTransformer]]
actor = "system"
id = "packageTransformer.inspect.v1"
package = "package.plugin.inspect"
sourceRevision = "packageRevision.plugin.inspect.v1"
targetRevision = "packageRevision.plugin.inspect.v1"
`);
  declareBackendHost(world, { actor: "system", id: "backendHost", runtimeProfile: DEFAULT_BOOTSTRAP_RUNTIME_PROFILE });
  declareFrontendHost(world, { actor: "system", id: "frontendHost", runtimeProfile: DEFAULT_BOOTSTRAP_RUNTIME_PROFILE });
  const server = await startServer(world, {
    actor: "system",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeStartupMode: "bootstrap",
    startupRuntimePluginIds: [...DEFAULT_BOOTSTRAP_STARTUP_PLUGIN_IDS]
  });
  assert.equal(server.ok, true);
  try {
    const model = await fetch(`${server.url}/api/bootstrap-model`).then(response => response.json());
    assert.equal(model.contextBindableTargets.some(row => row.id === "package.plugin.inspect"), true);
    assert.equal(model.contextBindableTargets.some(row => row.id === "packageRevision.plugin.inspect.v1"), true);
    assert.equal(model.contextBindableTargets.some(row => String(row.id).startsWith("packagePatch:")), true);
    assert.equal(model.contextBindableTargets.some(row => row.id === "packageNamespace:ctx.packages:inspectLocal" && row.context === "ctx.packages"), true);
    assert.equal(model.contextBindableTargets.some(row => row.id === "packageDependency:packageRevision.plugin.inspect.v1:capability:dom.render"), true);
    assert.equal(model.contextBindableTargets.some(row => row.id === "packageTransformer.inspect.v1"), true);
  } finally {
    await server.close();
  }
});

test("bootstrap mcp-only mode rejects direct runtime app source writes with a blocked handoff", async () => {
  const { server } = await startBlankServer();
  try {
    const response = await fetch(`${server.url}/api/runtime/app-sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        edits: [{ path: "app/shell.rvm", content: "bad" }]
      })
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error, "blocked by MCP-authoring-only policy");
    assert.equal(body.authoringPolicy.mode, "mcp_only");
    assert.equal(body.blockedHandoff.attemptedAuthoringPath, "/api/runtime/app-sources");
    assert.match(body.blockedHandoff.minimumHumanAction, /plugin\.authoring|human platform lane/i);
  } finally {
    await server.close();
  }
});

test("operator routes require auth after first identity and reject non world-home mutation layouts", async () => {
  const { server } = await startBlankServer();
  try {
    const createdIdentity = await fetch(`${server.url}/api/identities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "identity.aaron",
        actor: "aaron",
        label: "Aaron",
        username: "aaron",
        password: "aaron",
        homePerspective: "aaron:personal"
      })
    });
    assert.equal(createdIdentity.status, 201);

    const denied = await fetch(`${server.url}/api/operator/state`);
    assert.equal(denied.status, 401);

    const login = await openSession(server.url);
    assert.equal(login.response.status, 200);

    const disabled = await fetch(`${server.url}/api/operator/backups`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({ label: "not-allowed" })
    });
    assert.equal(disabled.status, 409);
    const body = await disabled.json();
    assert.match(body.error, /world-home-v1/);
  } finally {
    await server.close();
  }
});

test("operator restore and import replace live bootstrap truth and create safety backups when requested", async () => {
  const worldHome = await fs.mkdtemp(path.join(os.tmpdir(), "witness-operator-restore-"));
  const { world, server, operatorContract } = await startBlankServerWithWorldHome(worldHome);
  try {
    const runtimeSentinel = path.join(operatorContract.directories.runtimeRoot, "operator-sentinel.txt");
    await fs.mkdir(path.dirname(runtimeSentinel), { recursive: true });
    await fs.writeFile(runtimeSentinel, "keep-live-runtime", "utf8");
    const post = (pathname, body) => fetch(`${server.url}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    assert.equal((await post("/api/widgets", widgetInput({ id: "alpha_page", kind: "Page", title: "Alpha", attach: false }))).status, 201);

    const createdBackup = await post("/api/operator/backups", { label: "alpha" });
    assert.equal(createdBackup.status, 201);
    const backupBody = await createdBackup.json();
    const backupId = backupBody.artifact.id;

    const createdExport = await post("/api/operator/exports", { label: "alpha-export" });
    assert.equal(createdExport.status, 201);
    const exportBody = await createdExport.json();
    const exportedPath = exportBody.artifact.path;
    const importedArtifactId = `import-${Date.now()}`;
    await fs.cp(exportedPath, path.join(operatorContract.directories.importsRoot, importedArtifactId), { recursive: true });

    assert.equal((await post("/api/widgets", widgetInput({ id: "beta_page", kind: "Page", title: "Beta", attach: false }))).status, 201);
    let state = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(state.widgets.some(row => row.id === "beta_page"), true);

    const unsafeRestore = await post("/api/operator/restores", { artifactId: "../escape" });
    assert.equal(unsafeRestore.status, 400);

    const restored = await post("/api/operator/restores", {
      artifactId: backupId,
      preserveCurrent: true
    });
    assert.equal(restored.status, 200);
    const restoreBody = await restored.json();
      assert.ok(restoreBody.safetyBackup?.id);
      state = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
      assert.equal(state.widgets.some(row => row.id === "alpha_page"), true);
      assert.equal(state.widgets.some(row => row.id === "beta_page"), false);
      assert.equal(world.allWitnesses().some(row => row.body?.id === "beta_page"), false);
      assert.equal(await fs.readFile(runtimeSentinel, "utf8"), "keep-live-runtime");

      assert.equal((await post("/api/widgets", widgetInput({ id: "gamma_page", kind: "Page", title: "Gamma", attach: false }))).status, 201);
      state = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
      assert.equal(state.widgets.some(row => row.id === "gamma_page"), true);

    const imported = await post("/api/operator/imports", {
      artifactId: importedArtifactId,
      preserveCurrent: true
    });
    assert.equal(imported.status, 200);
    const importBody = await imported.json();
    assert.ok(importBody.safetyBackup?.id);
    assert.equal(importBody.restartRequired, false);

      state = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
      assert.equal(state.widgets.some(row => row.id === "alpha_page"), true);
      assert.equal(state.widgets.some(row => row.id === "gamma_page"), false);
      assert.equal(await fs.readFile(runtimeSentinel, "utf8"), "keep-live-runtime");

      const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(response => response.json());
      assert.equal(diagnostics.operator.mutations.enabled, true);
      assert.equal(diagnostics.operator.artifacts.backups >= 2, true);
    assert.equal(diagnostics.operator.recentActivity.some(entry => entry.process === "operator.import"), true);
  } finally {
    await server.close();
    await fs.rm(worldHome, { recursive: true, force: true });
  }
});

test("bootstrap server runner authoring accepts runtimeConfigJson and preserves config structure", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body) => fetch(`${server.url}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    const createdRunner = await post("/api/server-runners", {
      id: "config_runner",
      backendHost: "backendHost",
      frontendHost: "frontendHost",
      runtimeConfigJson: JSON.stringify({
        publicBaseUrl: { value: "https://world.test" },
        serviceToken: { secret: "WITNESS_RUNTIME_SECRET" }
      })
    });
    assert.equal(createdRunner.status, 201);
    const createdBody = await createdRunner.json();
    assert.equal(createdBody.serverRunner.runtimeConfig.publicBaseUrl.value, "https://world.test");
    assert.equal(createdBody.serverRunner.runtimeConfig.serviceToken.secret, "WITNESS_RUNTIME_SECRET");

    const state = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    const runner = state.serverRunners.find(row => row.id === "config_runner");
    assert.ok(runner);
    assert.equal(runner.runtimeConfig.publicBaseUrl.value, "https://world.test");
    assert.equal(runner.runtimeConfig.serviceToken.secret, "WITNESS_RUNTIME_SECRET");
  } finally {
    await server.close();
  }
});

test("bootstrap route authoring validates backendProgram.run shape", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body) => fetch(`${server.url}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    const createdProgram = await post("/api/backend-programs", {
      soul: "backend.echo",
      label: "Backend Echo"
    });
    assert.equal(createdProgram.status, 201);

    const missingSoul = await post("/api/routes", {
      id: "missing_backend_program_route",
      path: "/api/missing-backend-program",
      serves: "backendProgram",
      method: "GET",
      handler: "backendProgram.run"
    });
    assert.equal(missingSoul.status, 400);

    const mixedShape = await post("/api/routes", {
      id: "mixed_backend_program_route",
      path: "/api/mixed-backend-program",
      serves: "backendProgram",
      method: "GET",
      handler: "page.surface",
      backendProgramSoul: "backend.echo"
    });
    assert.equal(mixedShape.status, 400);

    const unknownSoul = await post("/api/routes", {
      id: "unknown_backend_program_route",
      path: "/api/unknown-backend-program",
      serves: "backendProgram",
      method: "GET",
      handler: "backendProgram.run",
      backendProgramSoul: "backend.unknown"
    });
    assert.equal(unknownSoul.status, 400);
  } finally {
    await server.close();
  }
});

test("bootstrap route authoring validates stream handler shape and method contract", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body) => fetch(`${server.url}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    const valid = await post("/api/routes", {
      id: "events_stream_route",
      path: "/api/events",
      serves: "eventsStream",
      method: "GET",
      handler: "events.stream"
    });
    assert.equal(valid.status, 201);

    const wrongMethod = await post("/api/routes", {
      id: "events_stream_post_route",
      path: "/api/events-post",
      serves: "eventsStream",
      method: "POST",
      handler: "events.stream"
    });
    assert.equal(wrongMethod.status, 400);

    const mixedShape = await post("/api/routes", {
      id: "events_stream_mixed_route",
      path: "/api/events-mixed",
      serves: "eventsStream",
      method: "GET",
      handler: "events.stream",
      page: "home",
      rootWidget: "some_page"
    });
    assert.equal(mixedShape.status, 400);
  } finally {
    await server.close();
  }
});

test("bootstrap write auth allows first identity unauthenticated and then requires session", async () => {
  const { server } = await startBlankServer();
  try {
    const createdIdentity = await fetch(`${server.url}/api/identities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "identity.aaron",
        actor: "aaron",
        label: "Aaron",
        username: "aaron",
        password: "aaron",
        homePerspective: "aaron:personal"
      })
    });
    assert.equal(createdIdentity.status, 201);

    const denied = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(widgetInput({ id: "root", kind: "Page", title: "Blocked", attach: false }))
    });
    assert.equal(denied.status, 401);

    const login = await openSession(server.url);
    assert.equal(login.response.status, 200);

    const createdWidget = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify(widgetInput({ id: "root", kind: "Page", title: "Authorized", attach: false }))
    });
    assert.equal(createdWidget.status, 201);
  } finally {
    await server.close();
  }
});

test("identity update lets the signed-in actor edit their own record and refreshes the current session", async () => {
  const { world, server } = await startBlankServer();
  try {
    const request = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await request("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);
    assert.equal((await request("/api/contexts", { id: "ctx.platform", label: "Platform" }, aaron.cookie)).status, 201);

    const updated = await request("/api/identities/identity.aaron", {
      label: "Aaron Updated",
      username: "aaron-updated",
      password: "newpass",
      homeContext: "ctx.platform",
      homePerspective: "aaron:workspace"
    }, aaron.cookie, "PATCH");
    assert.equal(updated.status, 200);
    const updatedBody = await updated.json();
    assert.equal(updatedBody.identity.label, "Aaron Updated");
    assert.equal(updatedBody.identity.username, "aaron-updated");
    assert.equal(updatedBody.identity.homeContext, "ctx.platform");
    assert.equal(updatedBody.session.label, "Aaron Updated");
    assert.equal(updatedBody.session.homeContext, "ctx.platform");
    assert.equal(updatedBody.session.perspective, "aaron:workspace");

    const session = await fetch(`${server.url}/api/session`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    assert.equal(session.label, "Aaron Updated");
    assert.equal(session.homeContext, "ctx.platform");
    assert.equal(session.perspective, "aaron:workspace");

    const oldLogin = await openSession(server.url, { username: "aaron", password: "aaron" });
    assert.equal(oldLogin.response.status, 401);
    const newLogin = await openSession(server.url, { username: "aaron-updated", password: "newpass" });
    assert.equal(newLogin.response.status, 200);

    await request("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);
    const callan = await openSession(server.url, { username: "callan", password: "callan" });
    const denied = await request("/api/identities/identity.aaron", {
      label: "Nope"
    }, callan.cookie, "PATCH");
    assert.equal(denied.status, 403);

    assert.equal(world.allWitnesses().some(w => w.process === "updateIdentity" && w.body?.id === "identity.aaron"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "identity.update" && w.body?.identity?.id === "identity.aaron"), true);
  } finally {
    await server.close();
  }
});

test("a bootstrap-authored runner and page.surface route take over without restarting the server", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body) => fetch(`${server.url}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    assert.equal((await post("/api/processes", {
      id: "bootstrap_surface_process",
      state: [],
      handles: [],
      emits: [],
      rules: []
    })).status, 201);
    assert.equal((await post("/api/surfaces", [
      {
        id: "bootstrap_surface_root",
        surfaceKind: "app-root",
        processRef: "bootstrap_surface_process",
        children: ["bootstrap_surface_title"]
      },
      {
        id: "bootstrap_surface_title",
        surfaceKind: "text",
        props: {
          tag: "div",
          domId: "bootstrap-home",
          text: "Bootstrap App"
        }
      }
    ])).status, 201);
    assert.equal((await post("/api/server-runners", {
      id: "demo_server",
      backendHost: "backendHost",
      frontendHost: "frontendHost"
    })).status, 201);
    assert.equal((await post("/api/routes", {
      id: "home_route",
      path: "/",
      serves: "bootstrap_surface_root",
      method: "GET",
      handler: "page.surface",
      rootSurface: "bootstrap_surface_root"
    })).status, 201);
    assert.equal((await post("/api/serve-mounts", {
      serverRunner: "demo_server",
      route: "home_route"
    })).status, 201);

    const html = await fetch(`${server.url}/`).then(response => response.text());
    assert.match(html, /(Bootstrap App|bootstrap_home)/);
    assert.doesNotMatch(html, /Widget rendering is not active in this runtime composition\./);
    assert.doesNotMatch(html, /Recover And Author The App Boundary/);
  } finally {
    await server.close();
  }
});

test("explicit bootstrap app-boundary action establishes the canonical authored page.surface boundary without restart", async () => {
  const { server } = await startBlankServer();
  try {
    const before = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(before.appBoundary.status, "missing");

    const established = await fetch(`${server.url}/api/bootstrap/app-boundary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(established.status, 200);
    const establishedBody = await established.json();
    assert.equal(establishedBody.status, "authoredActive");
    assert.equal(establishedBody.boundary.status, "authoredActive");
    assert.equal(establishedBody.created.some(row => row.kind === "serverRunner" && row.id === "demo_server"), true);
    assert.equal(establishedBody.created.some(row => row.kind === "route" && row.id === "home_route"), true);

    const state = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(state.appBoundary.status, "authoredActive");
    assert.equal(state.appBoundary.composition.root.source, "authored-route");
    assert.equal(state.appBoundary.composition.root.usesAuthoredServerRunner, true);
    assert.equal(state.appBoundary.composition.root.usesAuthoredRuntimePluginInstalls, true);

    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(response => response.json());
    assert.equal(diagnostics.composition.storyId, "authored-runner-driven");
    assert.equal(diagnostics.composition.usesAuthoredServerRunner, true);
    assert.equal(diagnostics.composition.usesAuthoredRuntimePluginInstalls, true);

    const html = await fetch(`${server.url}/`).then(response => response.text());
    assert.match(html, /Authored App Boundary/);
    assert.doesNotMatch(html, /Recover And Author The App Boundary/);

    const bootstrapHtml = await fetch(`${server.url}/_bootstrap`).then(response => response.text());
    assert.match(bootstrapHtml, /Semi-Internal Bootstrap Seam/);
  } finally {
    await server.close();
  }
});

test("bootstrap server-runner authoring accepts compatible plugin-provided handler sets", async () => {
  const { server } = await startBlankServer();
  try {
    const created = await fetch(`${server.url}/api/server-runners`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "demo_server",
        handlerSet: "demo",
        backendHost: "backendHost",
        frontendHost: "frontendHost"
      })
    });
    assert.equal(created.status, 201);
    const body = await created.json();
    assert.equal(body.serverRunner?.handlerSet, "demo");
  } finally {
    await server.close();
  }
});

test("bootstrap app-boundary action falls back to a witnessed proposal when shared authority blocks direct mutation", async () => {
  const { server } = await startBlankServer();
  try {
    const request = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    assert.equal((await request("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    })).status, 201);
    const aaron = await openSession(server.url);
    assert.equal((await request("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie)).status, 201);
    assert.equal((await request("/api/contexts", {
      id: "bootstrap.app",
      label: "Authored App Boundary"
    }, aaron.cookie)).status, 201);
    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    const proposed = await request("/api/bootstrap/app-boundary", {}, callan.cookie);
    assert.equal(proposed.status, 202);
    const proposedBody = await proposed.json();
    assert.equal(proposedBody.status, "proposed");
    assert.equal(proposedBody.proposal?.targetProcess, "bootstrap.appBoundary.establish");
    assert.equal(proposedBody.statusMessage, "Proposed authored app-boundary establishment for review.");

    const approved = await fetch(`${server.url}/api/proposals/${encodeURIComponent(proposedBody.proposal.id)}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(approved.status, 200);

    const state = await fetch(`${server.url}/api/bootstrap-state`, {
      headers: { cookie: aaron.cookie }
    }).then(response => response.json());
    assert.equal(state.appBoundary.status, "authoredActive");
    assert.equal(state.proposals.some(row =>
      row.id === proposedBody.proposal.id
        && row.status === "approved"
        && Array.isArray(row.executedWitnessIds)
        && row.executedWitnessIds.length > 0
    ), true);
  } finally {
    await server.close();
  }
});

test("canonical authoring pathway probe proves interactive authored page.surface routing", { timeout: 30000 }, async (t) => {
  const { server } = await startBlankServer({
    runtimePluginIds: [...DEFAULT_BOOTSTRAP_STARTUP_PLUGIN_IDS, "plugin.mcp"]
  });
  try {
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(response => response.json());
    assert.equal(diagnostics.authoringPolicy.mode, "mcp_only");
    assert.equal(diagnostics.plugins.activePluginIds.includes("plugin.inspect"), false);
    assert.equal(diagnostics.plugins.activePluginIds.includes("plugin.mcp"), true);

    let result;
    try {
      result = await runCanonicalAuthoringPathwayProbe(server.url);
    } catch (error) {
      const message = String(error?.message || error);
      if (/browserType\.launch|spawn EPERM/i.test(message)) {
        t.skip("Playwright launch is blocked in this environment");
        return;
      }
      throw error;
    }
    assert.equal(result.ok, true);
    assert.deepEqual(result.capabilityChecks.canonicalFrontendModel, ["surface", "process", "projection", "capability"]);
    assert.equal(result.capabilityChecks.publicSurfaceCreate, true);
      assert.equal(result.capabilityChecks.publicProcessCreate, true);
      assert.equal(result.capabilityChecks.publicTypeCreate, true);
      assert.equal(result.capabilityChecks.publicProjectionCreate, true);
      assert.equal(result.capabilityChecks.publicMessageCreate, true);
      assert.equal(result.capabilityChecks.legacyWidgetCreateHidden, true);
      assert.equal(result.capabilityChecks.legacyFrontendProgramHidden, true);
      assert.equal(result.pathwayProbe.surfaceHttpStatus, 200);
      assert.equal(result.pathwayProbe.alternateSurfaceHttpStatus, 200);
      assert.equal(result.pathwayProbe.staticSurfaceProjectionVisible, true);
      assert.equal(result.pathwayProbe.routeSelectedSurfaceVisible, true);
      assert.equal(result.pathwayProbe.blockedResetHostVisible, false);
      assert.equal(result.pathwayProbe.firstBlockedRung, null);
      assert.equal(result.blockers.firstBlocked ?? null, null);
      assert.equal(result.stateChecks.rootSurfacePresent, true);
    } finally {
      await server.close();
    }
  });

test("guidance progress syncs into the authenticated session store", async () => {
  const { server } = await startBlankServer();
  try {
    await fetch(`${server.url}/api/identities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "identity.aaron",
        actor: "aaron",
        label: "Aaron",
        username: "aaron",
        password: "aaron",
        homePerspective: "aaron:personal"
      })
    });

    const login = await openSession(server.url);
    assert.equal(login.response.status, 200);

    const empty = await fetch(`${server.url}/api/guidance-progress/todo-from-scratch`, {
      headers: { cookie: login.cookie }
    }).then(response => response.json());
    assert.equal(empty.progress, null);

    const written = await fetch(`${server.url}/api/guidance-progress/todo-from-scratch`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: login.cookie },
      body: JSON.stringify({
        guidanceId: "todo-from-scratch",
        chapterId: "identity",
        stepId: "identity:create",
        chapterStatus: "in_progress",
        draftInputs: { id: "identity.aaron" },
        completedAt: null,
        hidden: false,
        disabledContextIds: ["frontend", "unknown"],
        disabledPages: ["app", "unknown"],
        replayStepId: "identity:create"
      })
    }).then(response => response.json());
    assert.equal(written.progress.stepId, "identity:create");

    const readBack = await fetch(`${server.url}/api/guidance-progress/todo-from-scratch`, {
      headers: { cookie: login.cookie }
    }).then(response => response.json());
    assert.equal(readBack.progress.chapterId, "identity");
    assert.deepEqual(readBack.progress.draftInputs, { id: "identity.aaron" });
    assert.deepEqual(readBack.progress.disabledScopeKeys, ["page:app"]);
    assert.deepEqual(readBack.progress.disabledContextIds, ["frontend"]);
    assert.deepEqual(readBack.progress.disabledPages, ["app"]);
    assert.equal(readBack.progress.replayScopeKey, "section:bootstrap:identity-form");
    assert.equal(readBack.progress.replayStepId, "identity:create");

    const cleared = await fetch(`${server.url}/api/guidance-progress/todo-from-scratch`, {
      method: "DELETE",
      headers: { cookie: login.cookie }
    }).then(response => response.json());
    assert.equal(cleared.ok, true);

    const emptyAgain = await fetch(`${server.url}/api/guidance-progress/todo-from-scratch`, {
      headers: { cookie: login.cookie }
    }).then(response => response.json());
    assert.equal(emptyAgain.progress, null);
  } finally {
    await server.close();
  }
});

test("bootstrap capability catalog and install lifecycle are exposed through the generic API", async () => {
  const { server } = await startBlankServer();
  try {
    const initialState = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(initialState.capabilityCatalog.some(row => row.id === "dom.render"), true);
    assert.equal(initialState.pluginCatalog.summary.validCount >= 1, true);
    assert.equal(initialState.pluginCatalog.packages.some(row => row.id === "plugin.notes-sidebar" && row.execution.executable === false), true);
    assert.equal(initialState.capabilityPackageSources.some(row => row.capabilityId === "notes.sidebar" && row.sourceState === "package-only"), true);
    assert.equal(initialState.capabilityCatalog.find(row => row.id === "dom.render")?.capabilitySourceState, "catalog-only");

    const post = (pathname, body, method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    assert.equal((await post("/api/server-runners", {
      id: "demo_server",
      backendHost: "backendHost",
      frontendHost: "frontendHost"
    })).status, 201);

    const created = await post("/api/capabilities", {
      id: "notes.sidebar",
      label: "Notes Sidebar",
      version: "0.1.0",
      provenanceJson: JSON.stringify({ source: "local" }),
      dependsOnJson: "[]",
      publicApiJson: "[]",
      configJson: "[]",
      internalsJson: "[]",
      authorityJson: "[]",
      placementJson: JSON.stringify(["serverRunner", "routePage"])
    });
    assert.equal(created.status, 201);

    const installed = await post("/api/capability-installs", {
      capability: "notes.sidebar",
      target: "demo_server",
      targetKind: "serverRunner"
    });
    assert.equal(installed.status, 201);

    const duplicate = await post("/api/capability-installs", {
      capability: "notes.sidebar",
      target: "demo_server",
      targetKind: "serverRunner"
    });
    assert.equal(duplicate.status, 409);

    const afterInstall = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(afterInstall.capabilityInstalls.some(row => row.capability === "notes.sidebar" && row.target === "demo_server" && row.targetKind === "serverRunner"), true);
    assert.equal(afterInstall.capabilityCatalog.find(row => row.id === "notes.sidebar")?.capabilitySourceState, "both");
    assert.equal(afterInstall.capabilityCatalog.find(row => row.id === "notes.sidebar")?.packageSources?.some(row => row.pluginId === "plugin.notes-sidebar"), true);
    assert.equal(afterInstall.capabilityPackageSources.some(row => row.capabilityId === "notes.sidebar" && row.sourceState === "both"), true);

    const removed = await post("/api/capability-installs", {
      capability: "notes.sidebar",
      target: "demo_server",
      targetKind: "serverRunner"
    }, "DELETE");
    assert.equal(removed.status, 200);

    const afterRemove = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(afterRemove.capabilityInstalls.some(row => row.capability === "notes.sidebar" && row.target === "demo_server" && row.targetKind === "serverRunner"), false);
  } finally {
    await server.close();
  }
});

test("bootstrap runtime plugin availability and authoring flows are exposed through the generic API", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body, method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    const model = await fetch(`${server.url}/api/bootstrap-model`).then(response => response.json());
    assert.equal(model.proposalTargetProcesses.includes("runtimePlugin.install"), true);
    assert.equal(model.proposalTargetProcesses.includes("runtimePlugin.remove"), true);
    assert.equal(
      model.proposalTargetGovernance.some(row =>
        row.targetProcess === "runtimePlugin.install"
        && row.governanceMode === "proposal-fallback"
        && row.authorityMechanism === "bootstrap-target-authority"
      ),
      true
    );

    assert.equal((await post("/api/server-runners", {
      id: "demo_server",
      backendHost: "backendHost",
      frontendHost: "frontendHost"
    })).status, 201);

    const initialState = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    const installableInspect = initialState.runtimePluginAvailability.find(row => row.serverRunner === "demo_server" && row.plugin === "plugin.inspect");
    assert.ok(installableInspect);
    assert.equal(installableInspect.installed, false);
    assert.equal(installableInspect.executable, true);
    assert.equal(installableInspect.installable, true);
    const metadataOnly = initialState.runtimePluginAvailability.find(row => row.serverRunner === "demo_server" && row.plugin === "plugin.notes-sidebar");
    assert.ok(metadataOnly);
    assert.equal(metadataOnly.executable, false);
    assert.equal(metadataOnly.installable, false);

    const installed = await post("/api/runtime-plugin-installs", {
      serverRunner: "demo_server",
      plugin: "plugin.inspect"
    });
    assert.equal(installed.status, 201);

    const duplicate = await post("/api/runtime-plugin-installs", {
      serverRunner: "demo_server",
      plugin: "plugin.inspect"
    });
    assert.equal(duplicate.status, 409);

    const afterInstall = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(afterInstall.runtimePluginInstalls.some(row => row.serverRunner === "demo_server" && row.plugin === "plugin.inspect"), true);
    assert.equal(
      afterInstall.runtimePluginAvailability.some(row => row.serverRunner === "demo_server" && row.plugin === "plugin.inspect" && row.installed === true),
      true
    );

    const proposedInstall = await post("/api/proposals", {
      id: "proposal.runtime-plugin.canvas",
      targetProcess: "runtimePlugin.install",
      targetKind: "serverRunner",
      targetId: "demo_server",
      bodyJson: JSON.stringify({ serverRunner: "demo_server", plugin: "plugin.canvas" }),
      reason: "Need canvas on this runner"
    });
    assert.equal(proposedInstall.status, 201);
    assert.equal((await post("/api/proposals/proposal.runtime-plugin.canvas/approve", {})).status, 200);

    const proposedRemove = await post("/api/proposals", {
      id: "proposal.runtime-plugin.inspect.remove",
      targetProcess: "runtimePlugin.remove",
      targetKind: "serverRunner",
      targetId: "demo_server",
      bodyJson: JSON.stringify({ serverRunner: "demo_server", plugin: "plugin.inspect" }),
      reason: "Remove inspect from this runner"
    });
    assert.equal(proposedRemove.status, 201);
    assert.equal((await post("/api/proposals/proposal.runtime-plugin.inspect.remove/approve", {})).status, 200);

    const afterProposal = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(afterProposal.runtimePluginInstalls.some(row => row.serverRunner === "demo_server" && row.plugin === "plugin.canvas"), true);
    assert.equal(afterProposal.runtimePluginInstalls.some(row => row.serverRunner === "demo_server" && row.plugin === "plugin.inspect"), false);

    const removed = await post("/api/runtime-plugin-installs", {
      serverRunner: "demo_server",
      plugin: "plugin.canvas"
    }, "DELETE");
    assert.equal(removed.status, 200);

    const afterRemove = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(afterRemove.runtimePluginInstalls.some(row => row.serverRunner === "demo_server" && row.plugin === "plugin.canvas"), false);
  } finally {
    await server.close();
  }
});

test("bootstrap MCP authoring and grouped MCP state are exposed through the generic API", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body, method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    const model = await fetch(`${server.url}/api/bootstrap-model`).then(response => response.json());
    assert.equal(model.proposalTargetProcesses.includes("mcpServer.define"), true);
    assert.equal(model.proposalTargetProcesses.includes("mcpTool.install"), true);
    assert.equal(model.proposalTargetProcesses.includes("mcpTool.remove"), true);
    assert.equal(
      model.proposalTargetGovernance.some(row =>
        row.targetProcess === "mcpServer.define"
        && row.governanceMode === "proposal-fallback"
        && row.authorityMechanism === "bootstrap-target-authority"
      ),
      true
    );
    assert.equal(model.supportedMcpActingModes.includes("delegated"), true);
    assert.equal(model.supportedMcpActingModes.includes("service"), true);
    assert.equal(model.supportedMcpTools.some(row => row.name === "world.read"), true);

    assert.equal((await post("/api/server-runners", {
      id: "demo_server",
      backendHost: "backendHost",
      frontendHost: "frontendHost"
    })).status, 201);

    assert.equal((await post("/api/mcp-servers", {
      id: "personal_mcp",
      label: "Personal MCP",
      serverRunner: "demo_server",
      serviceIdentity: "aaron",
      transportsJson: JSON.stringify(["http"])
    })).status, 201);

    const installed = await post("/api/mcp-tool-installs", {
      server: "personal_mcp",
      tool: "authoring.write",
      actingMode: "service",
      scopeContextsJson: JSON.stringify(["ctx.docs"]),
      scopeTargetsJson: JSON.stringify(["ctx.docs:home"])
    });
    assert.equal(installed.status, 201);

    const duplicate = await post("/api/mcp-tool-installs", {
      server: "personal_mcp",
      tool: "authoring.write",
      actingMode: "service"
    });
    assert.equal(duplicate.status, 409);

    const afterInstall = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    const personalServer = afterInstall.mcp.servers.find(row => row.id === "personal_mcp");
    assert.ok(personalServer);
    assert.equal(personalServer.httpPath, "/mcp/personal_mcp");
    assert.equal(personalServer.transportVisibility.http, true);
    assert.equal(personalServer.transportVisibility.stdio, false);
    assert.equal(personalServer.tools.some(row => row.tool === "authoring.write" && row.actingMode === "service"), true);
    assert.equal(personalServer.tools.some(row => row.scopeContexts.includes("ctx.docs")), true);
    assert.equal(afterInstall.mcpServers.some(row => row.id === "personal_mcp"), true);
    assert.equal(afterInstall.mcpToolInstalls.some(row => row.server === "personal_mcp" && row.tool === "authoring.write"), true);

    const proposedServer = await post("/api/proposals", {
      id: "proposal.mcp.server.ops",
      targetProcess: "mcpServer.define",
      targetKind: "serverRunner",
      targetId: "demo_server",
      bodyJson: JSON.stringify({
        id: "ops_mcp",
        label: "Ops MCP",
        serverRunner: "demo_server",
        transportsJson: JSON.stringify(["stdio", "http"])
      }),
      reason: "Need an ops automation surface"
    });
    assert.equal(proposedServer.status, 201);
    assert.equal((await post("/api/proposals/proposal.mcp.server.ops/approve", {})).status, 200);

    const proposedInstall = await post("/api/proposals", {
      id: "proposal.mcp.tool.install.ops",
      targetProcess: "mcpTool.install",
      targetKind: "serverRunner",
      targetId: "demo_server",
      bodyJson: JSON.stringify({
        server: "ops_mcp",
        tool: "world.read",
        actingMode: "delegated",
        scopeContextsJson: JSON.stringify([]),
        scopeTargetsJson: JSON.stringify([])
      }),
      reason: "Need world inspection"
    });
    assert.equal(proposedInstall.status, 201);
    assert.equal((await post("/api/proposals/proposal.mcp.tool.install.ops/approve", {})).status, 200);

    const proposedRemove = await post("/api/proposals", {
      id: "proposal.mcp.tool.remove.personal",
      targetProcess: "mcpTool.remove",
      targetKind: "serverRunner",
      targetId: "demo_server",
      bodyJson: JSON.stringify({
        server: "personal_mcp",
        tool: "authoring.write"
      }),
      reason: "Remove direct authoring from personal server"
    });
    assert.equal(proposedRemove.status, 201);
    assert.equal((await post("/api/proposals/proposal.mcp.tool.remove.personal/approve", {})).status, 200);

    const afterProposal = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    const opsServer = afterProposal.mcp.servers.find(row => row.id === "ops_mcp");
    assert.ok(opsServer);
    assert.equal(opsServer.transportVisibility.http, true);
    assert.equal(opsServer.transportVisibility.stdio, true);
    assert.equal(opsServer.tools.some(row => row.tool === "world.read" && row.actingMode === "delegated"), true);
    assert.equal(afterProposal.mcp.servers.find(row => row.id === "personal_mcp")?.tools.some(row => row.tool === "authoring.write"), false);

    const removed = await post("/api/mcp-tool-installs", {
      server: "ops_mcp",
      tool: "world.read"
    }, "DELETE");
    assert.equal(removed.status, 200);

    const afterRemove = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(afterRemove.mcp.servers.find(row => row.id === "ops_mcp")?.tools.some(row => row.tool === "world.read"), false);
  } finally {
    await server.close();
  }
});

test("direct runtime-plugin and MCP authoring routes create proposals when target authority is missing", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await post("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);
    await post("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);

    assert.equal((await post("/api/contexts", { id: "ctx.runtime", label: "Runtime" }, aaron.cookie)).status, 201);
    assert.equal((await post("/api/server-runners", {
      id: "shared_runner",
      context: "ctx.runtime",
      backendHost: "backendHost",
      frontendHost: "frontendHost"
    }, aaron.cookie)).status, 201);

    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    const proposedPluginInstall = await post("/api/runtime-plugin-installs", {
      serverRunner: "shared_runner",
      plugin: "plugin.inspect",
      id: "proposal.runtime-plugin.install.inspect",
      reason: "Install inspect on the shared runner"
    }, callan.cookie);
    assert.equal(proposedPluginInstall.status, 202);
    const proposedPluginInstallBody = await proposedPluginInstall.json();
    assert.equal(proposedPluginInstallBody.proposal.targetProcess, "runtimePlugin.install");
    assert.equal(proposedPluginInstallBody.proposal.id, "proposal.runtime-plugin.install.inspect");
    assert.equal(proposedPluginInstallBody.proposal.reason, "Install inspect on the shared runner");
    assert.equal((await post(`/api/proposals/${encodeURIComponent(proposedPluginInstallBody.proposal.id)}/approve`, {}, aaron.cookie)).status, 200);

    const proposedMcpServer = await post("/api/mcp-servers", {
      proposalId: "proposal.mcp.server.shared",
      id: "shared_mcp",
      label: "Shared MCP",
      serverRunner: "shared_runner",
      transportsJson: JSON.stringify(["http"]),
      reason: "Create a shared MCP server for runtime tooling"
    }, callan.cookie);
    assert.equal(proposedMcpServer.status, 202);
    const proposedMcpServerBody = await proposedMcpServer.json();
    assert.equal(proposedMcpServerBody.proposal.targetProcess, "mcpServer.define");
    assert.equal(proposedMcpServerBody.proposal.id, "proposal.mcp.server.shared");
    assert.equal(proposedMcpServerBody.proposal.reason, "Create a shared MCP server for runtime tooling");
    assert.equal((await post(`/api/proposals/${encodeURIComponent(proposedMcpServerBody.proposal.id)}/approve`, {}, aaron.cookie)).status, 200);

    const proposedToolInstall = await post("/api/mcp-tool-installs", {
      server: "shared_mcp",
      tool: "world.read",
      actingMode: "delegated",
      id: "proposal.mcp.tool.install.world-read",
      reason: "Install world.read on the shared MCP server"
    }, callan.cookie);
    assert.equal(proposedToolInstall.status, 202);
    const proposedToolInstallBody = await proposedToolInstall.json();
    assert.equal(proposedToolInstallBody.proposal.targetProcess, "mcpTool.install");
    assert.equal(proposedToolInstallBody.proposal.id, "proposal.mcp.tool.install.world-read");
    assert.equal(proposedToolInstallBody.proposal.reason, "Install world.read on the shared MCP server");
    assert.equal((await post(`/api/proposals/${encodeURIComponent(proposedToolInstallBody.proposal.id)}/approve`, {}, aaron.cookie)).status, 200);

    let state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(response => response.json());
    assert.equal(state.runtimePluginInstalls.some(row => row.serverRunner === "shared_runner" && row.plugin === "plugin.inspect"), true);
    assert.equal(state.mcpServers.some(row => row.id === "shared_mcp" && row.serverRunner === "shared_runner"), true);
    assert.equal(state.mcpToolInstalls.some(row => row.server === "shared_mcp" && row.tool === "world.read"), true);

    const proposedToolRemove = await post("/api/mcp-tool-installs", {
      server: "shared_mcp",
      tool: "world.read",
      id: "proposal.mcp.tool.remove.world-read",
      reason: "Remove world.read from the shared MCP server"
    }, callan.cookie, "DELETE");
    assert.equal(proposedToolRemove.status, 202);
    const proposedToolRemoveBody = await proposedToolRemove.json();
    assert.equal(proposedToolRemoveBody.proposal.targetProcess, "mcpTool.remove");
    assert.equal(proposedToolRemoveBody.proposal.id, "proposal.mcp.tool.remove.world-read");
    assert.equal(proposedToolRemoveBody.proposal.reason, "Remove world.read from the shared MCP server");
    assert.equal((await post(`/api/proposals/${encodeURIComponent(proposedToolRemoveBody.proposal.id)}/approve`, {}, aaron.cookie)).status, 200);

    const proposedPluginRemove = await post("/api/runtime-plugin-installs", {
      serverRunner: "shared_runner",
      plugin: "plugin.inspect",
      id: "proposal.runtime-plugin.remove.inspect",
      reason: "Remove inspect from the shared runner"
    }, callan.cookie, "DELETE");
    assert.equal(proposedPluginRemove.status, 202);
    const proposedPluginRemoveBody = await proposedPluginRemove.json();
    assert.equal(proposedPluginRemoveBody.proposal.targetProcess, "runtimePlugin.remove");
    assert.equal(proposedPluginRemoveBody.proposal.id, "proposal.runtime-plugin.remove.inspect");
    assert.equal(proposedPluginRemoveBody.proposal.reason, "Remove inspect from the shared runner");
    assert.equal((await post(`/api/proposals/${encodeURIComponent(proposedPluginRemoveBody.proposal.id)}/approve`, {}, aaron.cookie)).status, 200);

    state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(response => response.json());
    assert.equal(state.runtimePluginInstalls.some(row => row.serverRunner === "shared_runner" && row.plugin === "plugin.inspect"), false);
    assert.equal(state.mcpToolInstalls.some(row => row.server === "shared_mcp" && row.tool === "world.read"), false);
  } finally {
    await server.close();
  }
});

test("runtime plugin review API exposes authored runner composition previews without operator overlays", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body, method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    assert.equal((await post("/api/server-runners", {
      id: "demo_server",
      backendHost: "backendHost",
      frontendHost: "frontendHost"
    })).status, 201);

    const missingRunner = await fetch(`${server.url}/api/runtime/plugin-reviews?serverRunner=missing`);
    assert.equal(missingRunner.status, 404);

    const initialReview = await fetch(`${server.url}/api/runtime/plugin-reviews?serverRunner=demo_server`).then(response => response.json());
    assert.equal(initialReview.serverRunner, "demo_server");
    assert.match(initialReview.note, /authored runner intent only/i);
    const inspect = initialReview.packages.find(row => row.plugin === "plugin.inspect");
    const notes = initialReview.packages.find(row => row.plugin === "plugin.notes-sidebar");
    assert.ok(inspect);
    assert.ok(notes);
    assert.equal(Array.isArray(initialReview.authoredPluginIds), true);
    assert.equal(initialReview.currentComposition.handlerMetadata["backendProgram.run"].routeKind, "backendProgram");
    assert.equal(inspect.installPreview.available, true);
    assert.equal(Array.isArray(inspect.installPreview.delta.addedSurfaces), true);
    assert.equal(inspect.installPreview.nextComposition.routes.some(route =>
      route.handlerMetadata && typeof route.handlerMetadata.routeKind === "string"
    ), true);
    assert.equal(notes.installPreview.available, false);
    assert.equal(notes.blockingReasons.some(reason => reason.includes("metadata-only")), true);

    assert.equal((await post("/api/runtime-plugin-installs", {
      serverRunner: "demo_server",
      plugin: "plugin.inspect"
    })).status, 201);

    const filteredReview = await fetch(`${server.url}/api/runtime/plugin-reviews?serverRunner=demo_server&plugin=plugin.inspect`).then(response => response.json());
    assert.deepEqual(filteredReview.authoredPluginIds, ["plugin.inspect"]);
    assert.equal(filteredReview.packages.length, 1);
    assert.equal(filteredReview.packages[0].plugin, "plugin.inspect");
    assert.equal(filteredReview.packages[0].installed, true);
    assert.equal(filteredReview.packages[0].removePreview.available, true);
  } finally {
    await server.close();
  }
});

test("context, perspective, and stewardship flows expose authority through bootstrap state", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body, cookie = "") => fetch(`${server.url}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await post("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homeContext: "ctx.platform",
      homePerspective: "aaron:personal"
    });
    await post("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, (await openSession(server.url)).cookie);

    const aaron = await openSession(server.url);
    assert.equal((await post("/api/contexts", { id: "ctx.platform", label: "Platform" }, aaron.cookie)).status, 201);
    assert.equal((await post("/api/perspectives", { id: "platform.board", title: "Platform Board", context: "ctx.platform" }, aaron.cookie)).status, 201);
    assert.equal((await post("/api/stewardships", { steward: "callan", target: "ctx.platform", targetKind: "context" }, aaron.cookie)).status, 201);

    const session = await fetch(`${server.url}/api/session`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    assert.equal(session.homeContext, "ctx.platform");

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    assert.equal(state.contexts.some(row => row.id === "ctx.platform"), true);
    assert.equal(state.perspectives.some(row => row.id === "platform.board" && row.context === "ctx.platform"), true);
    assert.equal(state.stewardships.some(row => row.steward === "callan" && row.target === "ctx.platform"), true);
    assert.equal(state.authority.mutationContexts.includes("ctx.platform"), true);
  } finally {
    await server.close();
  }
});

test("unauthorized scoped writes return 403 and proposals can be approved exactly once", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await post("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);
    await post("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);
    assert.equal((await post("/api/contexts", { id: "ctx.platform", label: "Platform" }, aaron.cookie)).status, 201);

    const callan = await openSession(server.url, { username: "callan", password: "callan" });
    const proposed = await post("/api/widgets", widgetInput({ id: "proposed_root", kind: "Page", title: "Proposed", attach: false, context: "ctx.platform" }), callan.cookie);
    assert.equal(proposed.status, 202);
    const proposedBody = await proposed.json();
    assert.equal(proposedBody.proposal.targetProcess, "widget.define");
    assert.equal(proposedBody.proposal.targetKind, "context");
    assert.equal(proposedBody.proposal.targetId, "ctx.platform");
    const proposalId = proposedBody.proposal.id;

    const approved = await post(`/api/proposals/${encodeURIComponent(proposalId)}/approve`, {}, aaron.cookie);
    assert.equal(approved.status, 200);
    const approveAgain = await post(`/api/proposals/${encodeURIComponent(proposalId)}/approve`, {}, aaron.cookie);
    assert.equal(approveAgain.status, 409);

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    const proposal = state.proposals.find(row => row.id === proposalId);
    assert.equal(proposal.status, "approved");
    assert.equal(Array.isArray(proposal.executedWitnessIds), true);
    assert.equal(proposal.executedWitnessIds.length > 0, true);
    assert.equal(state.widgets.some(row => row.id === "proposed_root" && row.context === "ctx.platform"), true);
  } finally {
    await server.close();
  }
});

test("live-surface style widget.update proposals can be created without direct authority and approved once by an authorized actor", async () => {
  const { server } = await startBlankServer();
  try {
    const request = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await request("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);

    assert.equal((await request("/api/widgets", widgetInput({
      id: "shared_title",
      kind: "Text",
      text: "Original",
      attach: false
    }), aaron.cookie)).status, 201);

    await request("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);
    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    const proposed = await request("/api/widgets/shared_title", { text: "Proposed" }, callan.cookie, "PATCH");
    assert.equal(proposed.status, 202);
    const proposedBody = await proposed.json();
    assert.equal(proposedBody.proposal.targetProcess, "widget.update");
    assert.equal(proposedBody.proposal.targetKind, "widget");
    assert.equal(proposedBody.proposal.targetId, "shared_title");
    const proposalId = proposedBody.proposal.id;

    const approved = await request(`/api/proposals/${encodeURIComponent(proposalId)}/approve`, {}, aaron.cookie);
    assert.equal(approved.status, 200);
    const approveAgain = await request(`/api/proposals/${encodeURIComponent(proposalId)}/approve`, {}, aaron.cookie);
    assert.equal(approveAgain.status, 409);

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    const proposal = state.proposals.find(row => row.id === proposalId);
    assert.equal(proposal.status, "approved");
    assert.equal(Array.isArray(proposal.executedWitnessIds), true);
    assert.equal(proposal.executedWitnessIds.length > 0, true);
    assert.equal(state.widgets.some(row => row.id === "shared_title" && row.props?.text === "Proposed"), true);
  } finally {
    await server.close();
  }
});

test("package authoring proposals can be created without direct authority and approved once by an authorized actor", async () => {
  const { world, server } = await startBlankServer();
  try {
    const request = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await request("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);
    assert.equal((await request("/api/contexts", { id: "ctx.packages", label: "Packages" }, aaron.cookie)).status, 201);

    await request("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);
    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    const proposed = await request("/api/packages", {
      id: "package.plugin.inspect",
      context: "ctx.packages",
      label: "Inspect",
      packageKind: "plugin",
      exports: [{ id: "surface.world" }]
    }, callan.cookie);
    assert.equal(proposed.status, 202);
    const proposedBody = await proposed.json();
    assert.equal(proposedBody.proposal.targetProcess, "package.define");
    assert.equal(proposedBody.proposal.targetKind, "context");
    assert.equal(proposedBody.proposal.targetId, "ctx.packages");
    const proposalId = proposedBody.proposal.id;

    const approved = await request(`/api/proposals/${encodeURIComponent(proposalId)}/approve`, {}, aaron.cookie);
    assert.equal(approved.status, 200);
    const approveAgain = await request(`/api/proposals/${encodeURIComponent(proposalId)}/approve`, {}, aaron.cookie);
    assert.equal(approveAgain.status, 409);

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    const proposal = state.proposals.find(row => row.id === proposalId);
    assert.equal(proposal.status, "approved");
    assert.equal(Array.isArray(proposal.executedWitnessIds), true);
    assert.equal(proposal.executedWitnessIds.length > 0, true);
    assert.equal(world.project(moduleProjectors.packageIndex).byId["package.plugin.inspect"]?.id, "package.plugin.inspect");
  } finally {
    await server.close();
  }
});

test("widgetVersion.activate proposals can be created without direct authority and approved once by an authorized steward", async () => {
  const { world, server } = await startBlankServer();
  try {
    const request = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await request("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);
    assert.equal((await request("/api/contexts", { id: "ctx.shared", label: "Shared", stewards: ["aaron"] }, aaron.cookie)).status, 201);

    await request("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);
    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    defineWidgetVersion(world, {
      actor: "system",
      owner: "system",
      context: "ctx.shared",
      soul: "shared_banner",
      version: "shared_banner_v1",
      kind: "Text",
      props: { text: "Shared banner v1" },
      index: 0
    });
    defineWidgetVersion(world, {
      actor: "system",
      owner: "system",
      context: "ctx.shared",
      soul: "shared_banner",
      version: "shared_banner_v2",
      kind: "Text",
      props: { text: "Shared banner v2" },
      index: 1
    });
    defineWidgetVersionTransition(world, {
      actor: "system",
      owner: "system",
      soul: "shared_banner",
      from: "shared_banner_v1",
      to: "shared_banner_v2",
      strategy: "compatible"
    });
    activateWidgetVersion(world, { actor: "system", soul: "shared_banner", version: "shared_banner_v1" });

    const proposed = await request("/api/proposals", {
      id: "proposal.widgetVersion.activate.shared-banner",
      targetProcess: "widgetVersion.activate",
      targetKind: "widget",
      targetId: "shared_banner",
      bodyJson: JSON.stringify({ soul: "shared_banner", version: "shared_banner_v2" }),
      reason: "Promote the shared banner"
    }, callan.cookie);
    assert.equal(proposed.status, 201);

    const approved = await request("/api/proposals/proposal.widgetVersion.activate.shared-banner/approve", {}, aaron.cookie);
    assert.equal(approved.status, 200);

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    const proposal = state.proposals.find(row => row.id === "proposal.widgetVersion.activate.shared-banner");
    assert.equal(proposal.status, "approved");
    assert.equal(Array.isArray(proposal.executedWitnessIds), true);
    assert.equal(proposal.executedWitnessIds.length > 0, true);
    assert.equal(world.allWitnesses().some(w => w.process === "activateWidgetVersion" && w.actor === "aaron" && w.body?.soul === "shared_banner" && w.body?.version === "shared_banner_v2"), true);
  } finally {
    await server.close();
  }
});

test("widgetVersion.rollback proposals can be created without direct authority and approved once by an authorized steward", async () => {
  const { world, server } = await startBlankServer();
  try {
    const request = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await request("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);
    assert.equal((await request("/api/contexts", { id: "ctx.shared", label: "Shared", stewards: ["aaron"] }, aaron.cookie)).status, 201);

    await request("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);
    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    defineWidgetVersion(world, {
      actor: "system",
      owner: "system",
      context: "ctx.shared",
      soul: "shared_banner",
      version: "shared_banner_v1",
      kind: "Text",
      props: { text: "Shared banner v1" },
      index: 0
    });
    defineWidgetVersion(world, {
      actor: "system",
      owner: "system",
      context: "ctx.shared",
      soul: "shared_banner",
      version: "shared_banner_v2",
      kind: "Text",
      props: { text: "Shared banner v2" },
      index: 1
    });
    defineWidgetVersionTransition(world, {
      actor: "system",
      owner: "system",
      soul: "shared_banner",
      from: "shared_banner_v1",
      to: "shared_banner_v2",
      strategy: "compatible"
    });
    activateWidgetVersion(world, { actor: "system", soul: "shared_banner", version: "shared_banner_v1" });
    activateWidgetVersion(world, { actor: "system", soul: "shared_banner", version: "shared_banner_v2" });

    const proposed = await request("/api/proposals", {
      id: "proposal.widgetVersion.rollback.shared-banner",
      targetProcess: "widgetVersion.rollback",
      targetKind: "widget",
      targetId: "shared_banner",
      bodyJson: JSON.stringify({ soul: "shared_banner" }),
      reason: "Restore the previous shared banner"
    }, callan.cookie);
    assert.equal(proposed.status, 201);

    const approved = await request("/api/proposals/proposal.widgetVersion.rollback.shared-banner/approve", {}, aaron.cookie);
    assert.equal(approved.status, 200);

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    const proposal = state.proposals.find(row => row.id === "proposal.widgetVersion.rollback.shared-banner");
    assert.equal(proposal.status, "approved");
    assert.equal(Array.isArray(proposal.executedWitnessIds), true);
    assert.equal(proposal.executedWitnessIds.length > 0, true);
    assert.equal(world.allWitnesses().some(w => w.process === "widgetVersion.rollback" && w.actor === "aaron" && w.body?.soul === "shared_banner" && w.body?.to === "shared_banner_v1"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "activateWidgetVersion" && w.actor === "aaron" && w.body?.soul === "shared_banner" && w.body?.version === "shared_banner_v1"), true);
  } finally {
    await server.close();
  }
});

test("widget update writes real save-back witnesses and blocks versioned widget souls", async () => {
  const { world, server } = await startBlankServer();
  try {
    const request = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await request("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);

    assert.equal((await request("/api/widgets", widgetInput({
      id: "editable_page",
      kind: "Page",
      title: "Original title",
      attach: false
    }), aaron.cookie)).status, 201);

    defineWidgetVersion(world, {
      actor: "system",
      owner: "aaron",
      soul: "versioned_banner",
      version: "versioned_banner_v1",
      kind: "Text",
      props: { text: "Versioned banner" }
    });
    activateWidgetVersion(world, { actor: "system", soul: "versioned_banner", version: "versioned_banner_v1" });

    const updated = await request("/api/widgets/editable_page", { title: "Updated title" }, aaron.cookie, "PATCH");
    assert.equal(updated.status, 200);
    const updatedBody = await updated.json();
    assert.equal(updatedBody.widget.props.title, "Updated title");

    const hidden = await request("/api/widgets/editable_page", { hidden: true }, aaron.cookie, "PATCH");
    assert.equal(hidden.status, 200);
    const hiddenBody = await hidden.json();
    assert.equal(hiddenBody.widget.props.hidden, true);

    const shown = await request("/api/widgets/editable_page", { hidden: false }, aaron.cookie, "PATCH");
    assert.equal(shown.status, 200);
    const shownBody = await shown.json();
    assert.equal(Object.prototype.hasOwnProperty.call(shownBody.widget.props || {}, "hidden"), false);

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    assert.equal(state.widgets.some(row => row.id === "editable_page" && row.props?.title === "Updated title"), true);
    assert.equal(state.widgets.some(row => row.id === "editable_page" && Object.prototype.hasOwnProperty.call(row.props || {}, "hidden")), false);
    assert.equal(world.allWitnesses().some(w => w.process === "widget.update" && w.body?.widget?.id === "editable_page"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "widget.update" && w.body?.patch?.hidden === true && w.body?.widget?.id === "editable_page"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "widget.update" && w.body?.patch?.hidden === false && w.body?.widget?.id === "editable_page"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "updateWidget" && w.body?.id === "editable_page"), true);

    const blocked = await request("/api/widgets/versioned_banner", { text: "Nope" }, aaron.cookie, "PATCH");
    assert.equal(blocked.status, 409);
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.error, "versioned widgets must be edited through widget versions");
  } finally {
    await server.close();
  }
});

test("runtime plugin reconcile route removes a seeded broken authored install and returns before/after review state", async () => {
  const { world, server } = await startBlankServer();
  try {
    const post = (pathname, body, method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    assert.equal((await post("/api/server-runners", {
      id: "demo_server",
      backendHost: "backendHost",
      frontendHost: "frontendHost"
    })).status, 201);
    installRuntimePlugin(world, {
      actor: "system",
      serverRunner: "demo_server",
      plugin: "plugin.notes-sidebar"
    });

    const reconciled = await post("/api/runtime-plugin-reconciles", {
      serverRunner: "demo_server",
      plugin: "plugin.notes-sidebar",
      actionId: "remove-broken-install"
    });
    assert.equal(reconciled.status, 200);
    const reconciledBody = await reconciled.json();
    assert.equal(reconciledBody.action.id, "remove-broken-install");
    assert.equal(reconciledBody.reviewBefore.serverRunner, "demo_server");
    assert.equal(reconciledBody.reviewBefore.packages.find(row => row.plugin === "plugin.notes-sidebar")?.installed, true);
    assert.equal(reconciledBody.reviewAfter.packages.find(row => row.plugin === "plugin.notes-sidebar")?.installed, false);
    assert.equal(reconciledBody.compositionBefore.profile, "minimal");
    assert.equal(reconciledBody.witness.process, "runtimePlugin.reconcile");
    assert.equal(world.project(moduleProjectors.runtimePluginInstalls).some(row =>
      row.serverRunner === "demo_server" && row.plugin === "plugin.notes-sidebar"
    ), false);
  } finally {
    await server.close();
  }
});

test("runtime plugin reconcile route creates proposals when shared server-runner authority blocks direct repair", async () => {
  const { world, server } = await startBlankServer();
  try {
    const post = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await post("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);
    await post("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);
    assert.equal((await post("/api/contexts", { id: "ctx.runtime", label: "Runtime" }, aaron.cookie)).status, 201);
    assert.equal((await post("/api/server-runners", {
      id: "shared_runner",
      context: "ctx.runtime",
      backendHost: "backendHost",
      frontendHost: "frontendHost"
    }, aaron.cookie)).status, 201);
    installRuntimePlugin(world, {
      actor: "system",
      serverRunner: "shared_runner",
      plugin: "plugin.notes-sidebar"
    });

    const callan = await openSession(server.url, { username: "callan", password: "callan" });
    const proposed = await post("/api/runtime-plugin-reconciles", {
      serverRunner: "shared_runner",
      plugin: "plugin.notes-sidebar",
      actionId: "remove-broken-install",
      id: "proposal.runtime-plugin.reconcile.notes-sidebar",
      reason: "Repair the broken notes sidebar install"
    }, callan.cookie);
    assert.equal(proposed.status, 202);
    const proposedBody = await proposed.json();
    assert.equal(proposedBody.proposal.targetProcess, "runtimePlugin.reconcile");
    assert.equal(proposedBody.proposal.id, "proposal.runtime-plugin.reconcile.notes-sidebar");
    assert.equal(proposedBody.proposal.reason, "Repair the broken notes sidebar install");
    assert.equal((await post(`/api/proposals/${encodeURIComponent(proposedBody.proposal.id)}/approve`, {}, aaron.cookie)).status, 200);
    assert.equal(world.project(moduleProjectors.runtimePluginInstalls).some(row =>
      row.serverRunner === "shared_runner" && row.plugin === "plugin.notes-sidebar"
    ), false);
  } finally {
    await server.close();
  }
});

test("widget replace and rollback follow shared authority semantics and preserve prior widget state", async () => {
  const { world, server } = await startBlankServer();
  try {
    const request = (pathname, body, cookie = "", method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });

    await request("/api/identities", {
      id: "identity.aaron",
      actor: "aaron",
      label: "Aaron",
      username: "aaron",
      password: "aaron",
      homePerspective: "aaron:personal"
    });
    const aaron = await openSession(server.url);
    await request("/api/identities", {
      id: "identity.callan",
      actor: "callan",
      label: "Callan",
      username: "callan",
      password: "callan",
      homePerspective: "callan:personal"
    }, aaron.cookie);
    const callan = await openSession(server.url, { username: "callan", password: "callan" });

    assert.equal((await request("/api/widgets", widgetInput({
      id: "replaceable_title",
      kind: "Heading",
      text: "Original heading",
      level: 1,
      attach: false
    }), aaron.cookie)).status, 201);

    const replaced = await request("/api/widgets/replaceable_title/replace", {
      kind: "Button",
      text: "Replacement button"
    }, aaron.cookie);
    assert.equal(replaced.status, 200);
    const replacedBody = await replaced.json();
    assert.equal(replacedBody.widget.kind, "Button");
    assert.equal(replacedBody.widget.props.text, "Replacement button");
    assert.equal(replacedBody.migrationStatus, "migrate");

    const rollback = await request("/api/widgets/replaceable_title/replace/rollback", {}, aaron.cookie);
    assert.equal(rollback.status, 200);
    const rollbackBody = await rollback.json();
    assert.equal(rollbackBody.widget.kind, "Heading");
    assert.equal(rollbackBody.widget.props.text, "Original heading");

    const proposed = await request("/api/widgets/replaceable_title/replace", {
      kind: "Paragraph",
      text: "Shared replace request",
      reason: "Shared widget should evolve"
    }, callan.cookie);
    assert.equal(proposed.status, 202);
    const proposedBody = await proposed.json();
    assert.equal(proposedBody.proposal?.targetProcess, "widget.replace");

    const approved = await fetch(`${server.url}/api/proposals/${encodeURIComponent(proposedBody.proposal.id)}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: aaron.cookie },
      body: JSON.stringify({})
    });
    assert.equal(approved.status, 200);

    const state = await fetch(`${server.url}/api/bootstrap-state`, { headers: { cookie: aaron.cookie } }).then(r => r.json());
    assert.equal(state.widgets.some(row => row.id === "replaceable_title" && row.kind === "Paragraph" && row.props?.text === "Shared replace request"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "widget.replace" && w.body?.next?.id === "replaceable_title"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "widget.replace.rollback" && w.body?.id === "replaceable_title"), true);
    assert.equal(world.allWitnesses().some(w => w.process === "updateWidget" && w.body?.id === "replaceable_title" && w.body?.kind === "Paragraph"), true);

    defineWidgetVersion(world, {
      actor: "system",
      owner: "aaron",
      soul: "replace_blocked_banner",
      version: "replace_blocked_banner_v1",
      kind: "Text",
      props: { text: "Versioned" }
    });
    activateWidgetVersion(world, { actor: "system", soul: "replace_blocked_banner", version: "replace_blocked_banner_v1" });

    const blocked = await request("/api/widgets/replace_blocked_banner/replace", {
      kind: "Paragraph",
      text: "Nope"
    }, aaron.cookie);
    assert.equal(blocked.status, 409);
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.error, "versioned widgets must evolve through widget versions");
  } finally {
    await server.close();
  }
});

test("bootstrap context composition endpoints expose scope state and lower contextual refs across covered authoring flows", async () => {
  const { server } = await startBlankServer();
  try {
    const post = (pathname, body, method = "POST") => fetch(`${server.url}${pathname}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const model = await fetch(`${server.url}/api/bootstrap-model`).then(response => response.json());
    const backendHost = model.backendHosts[0]?.id;
    const frontendHost = model.frontendHosts[0]?.id;

    assert.equal((await post("/api/contexts", { id: "ctx.source", label: "Source" })).status, 201);
    assert.equal((await post("/api/contexts", { id: "ctx.target", label: "Target", parent: "ctx.source" })).status, 201);
    assert.equal((await post("/api/widgets", widgetInput({ id: "page_root", kind: "Page", title: "Home", attach: false, context: "ctx.source" }))).status, 201);
    assert.equal((await post("/api/widgets", widgetInput({ id: "secret_page", kind: "Page", title: "Secret", attach: false, context: "ctx.source" }))).status, 201);
    assert.equal((await post("/api/widgets", widgetInput({ id: "shell_box", kind: "Box", attach: false, context: "ctx.target" }))).status, 201);
    assert.equal((await post("/api/widgets", widgetInput({ id: "legacy_shell", kind: "Box", attach: false }))).status, 201);
    assert.equal((await post("/api/widgets", widgetInput({ id: "local_note", kind: "Text", text: "Note", attach: false }))).status, 201);

    assert.equal((await post("/api/context-bindings", { context: "ctx.source", name: "homePage", target: "page_root" })).status, 201);
    assert.equal((await post("/api/context-bindings", { context: "ctx.source", name: "backendNode", target: backendHost })).status, 201);
    assert.equal((await post("/api/context-bindings", { context: "ctx.source", name: "frontendNode", target: frontendHost })).status, 201);
    assert.equal((await post("/api/context-exports", { context: "ctx.source", name: "homePage", target: "page_root" })).status, 201);
    assert.equal((await post("/api/context-exports", { context: "ctx.source", name: "backendNode", target: backendHost })).status, 201);
    assert.equal((await post("/api/context-exports", { context: "ctx.source", name: "frontendNode", target: frontendHost })).status, 201);
    assert.equal((await post("/api/context-imports", { context: "ctx.target", sourceContext: "ctx.source", exportName: "homePage", name: "landingPage" })).status, 201);
    assert.equal((await post("/api/context-imports", { context: "ctx.target", sourceContext: "ctx.source", exportName: "backendNode", name: "backendAlias" })).status, 201);
    assert.equal((await post("/api/context-imports", { context: "ctx.target", sourceContext: "ctx.source", exportName: "frontendNode", name: "frontendAlias" })).status, 201);
    assert.equal((await post("/api/context-bindings", { context: "ctx.target", name: "shellBox", target: "shell_box" })).status, 201);
    assert.equal((await post("/api/context-bindings", { context: "ctx.target", name: "legacyShell", target: "legacy_shell" })).status, 201);

    const childWidget = await post("/api/widgets", widgetInput({
      id: "shell_child",
      kind: "Text",
      context: "ctx.target",
      parentRef: "shellBox",
      text: "Child"
    }));
    assert.equal(childWidget.status, 201);
    const childWidgetBody = await childWidget.json();
    assert.equal(childWidgetBody.widget.parent, "shell_box");
    const legacyChildWidget = await post("/api/widgets", widgetInput({
      id: "legacy_child",
      kind: "Text",
      context: "ctx.target",
      parentRef: "legacyShell",
      text: "Legacy Child"
    }));
    assert.equal(legacyChildWidget.status, 201);
    const legacyChildWidgetBody = await legacyChildWidget.json();
    assert.equal(legacyChildWidgetBody.widget.parent, "legacy_shell");

    const createdRunner = await post("/api/server-runners", {
      id: "demo_server",
      context: "ctx.target",
      backendHostRef: "backendAlias",
      frontendHostRef: "frontendAlias"
    });
    assert.equal(createdRunner.status, 201);
    assert.equal((await post("/api/context-bindings", { context: "ctx.target", name: "runnerNode", target: "demo_server" })).status, 201);

    const createdRoute = await post("/api/routes", {
      id: "landing_route",
      context: "ctx.target",
      path: "/landing",
      method: "GET",
      handler: "page.world",
      servesRef: "landingPage",
      rootWidgetRef: "landingPage"
    });
    assert.equal(createdRoute.status, 201);
    assert.equal((await post("/api/context-bindings", { context: "ctx.target", name: "landingRoute", target: "landing_route" })).status, 201);

    const createdServe = await post("/api/serve-mounts", {
      context: "ctx.target",
      serverRunnerRef: "runnerNode",
      routeRef: "landingRoute"
    });
    assert.equal(createdServe.status, 201);

    const unresolvedParent = await post("/api/widgets", widgetInput({
      id: "broken_child",
      kind: "Text",
      context: "ctx.target",
      parentRef: "missingShell",
      text: "Broken"
    }));
    assert.equal(unresolvedParent.status, 400);

    const collision = await post("/api/context-bindings", { context: "ctx.target", name: "landingPage", target: "local_note" });
    assert.equal(collision.status, 409);
    const foreignScopedBind = await post("/api/context-bindings", { context: "ctx.target", name: "foreignPage", target: "page_root" });
    assert.equal(foreignScopedBind.status, 400);

    const state = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());
    assert.equal(state.contextBindings.some(row => row.context === "ctx.source" && row.name === "homePage" && row.target === "page_root"), true);
    assert.equal(state.contextExports.some(row => row.context === "ctx.source" && row.name === "homePage" && row.target === "page_root"), true);
    assert.equal(state.contextImports.some(row => row.context === "ctx.target" && row.sourceContext === "ctx.source" && row.exportName === "homePage" && row.name === "landingPage"), true);
    assert.equal(state.contextScopes.some(row => row.context === "ctx.target" && row.name === "landingPage" && row.target === "page_root" && row.sourceKind === "import" && row.sourceContext === "ctx.source" && row.exportName === "homePage"), true);
    assert.equal(state.contextScopes.some(row => row.context === "ctx.target" && row.name === "homePage"), false);
    assert.equal(state.contextualTargets.some(row => row.id === "page_root" && row.context === "ctx.source"), true);
    assert.equal(state.contextNameResolutions.some(row => row.context === "ctx.target" && row.name === "landingPage" && row.target === "page_root" && row.resolution === "resolved"), true);
    assert.equal((state.contextNameConflicts || []).length, 0);
    assert.equal(state.compatibilityBridges.some(row => row.id === "compatibilityBridge:canonicalIdSugar.sameContextVisibleTarget" && row.policyStatus === "allowed-transitional"), true);
    assert.deepEqual(state.canonicalIdPolicyClasses, ["same-context-convenience", "imported-target-reference", "legacy-only-path"]);
    assert.equal(state.contextScopes.some(row => row.context === "ctx.target" && row.name === "backendAlias" && row.target === backendHost && row.sourceKind === "import"), true);
    assert.equal(state.widgets.some(row => row.id === "shell_child" && row.context === "ctx.target"), true);
    assert.equal(state.widgets.some(row => row.id === "legacy_child" && row.context === "ctx.target"), true);
    assert.equal(state.serverRunners.some(row => row.id === "demo_server" && row.backendHost === backendHost && row.frontendHost === frontendHost), true);
    assert.equal(state.routes.some(row => row.id === "landing_route" && row.serves === "page_root" && row.params?.rootWidget === "page_root"), true);
    assert.equal(state.servedRoutes.some(row => row.id === "landing_route" && row.serverRunner === "demo_server"), true);

    assert.equal((await post("/api/context-imports", { context: "ctx.target", sourceContext: "ctx.source", exportName: "homePage", name: "landingPage" }, "DELETE")).status, 200);
    assert.equal((await post("/api/context-exports", { context: "ctx.source", name: "homePage", target: "page_root" }, "DELETE")).status, 200);
    assert.equal((await post("/api/context-bindings", { context: "ctx.source", name: "homePage", target: "page_root" }, "DELETE")).status, 200);
  } finally {
    await server.close();
  }
});
