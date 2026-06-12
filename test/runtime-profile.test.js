import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { applyWitnessDocs, applyWitnessToml, loadWitnessTomlFile } from "../src/dsl.js";
import { declareBackendHost, declareFrontendHost, hostCapabilities, startServer } from "../src/host.js";
import {
  authorableHandlerIdsForProfile,
  pageHandlerIdsForProfile,
  resolveRuntimeProfileStrict
} from "../src/runtime-bundles.js";

function applyMinimalPageDsl(world) {
  applyWitnessToml(world, `
[[widget]]
actor = "adam"
id = "home_widget"
kind = "Page"
props = { title = "Witness Home" }

[[serverRunner]]
actor = "adam"
id = "server_runner"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[frontendProgram]]
actor = "adam"
id = "home_program"
rootWidget = "home_widget"

[[route]]
actor = "adam"
id = "home_route"
path = "/"
serves = "page"
method = "GET"
handler = "page.home"
params = { rootWidget = "home_widget", frontendProgram = "home_program" }

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "home_route"
`);
}

function applyWorldPageDsl(world) {
  applyWitnessToml(world, `
[[route]]
actor = "adam"
id = "world_route"
path = "/world"
serves = "page"
method = "GET"
handler = "page.world"
params = { rootWidget = "home_widget", frontendProgram = "home_program" }

[[serve]]
actor = "adam"
serverRunner = "server_runner"
route = "world_route"
`);
}

async function tempRuntimeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "witness-runtime-profile-"));
}

test("minimal runtime profile only installs core host capabilities", () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const backend = [...hostCapabilities(world, "backendHost")].sort();
  const frontend = [...hostCapabilities(world, "frontendHost")].sort();

  assert.deepEqual(backend, ["http.serve", "runtime.config"]);
  assert.deepEqual(frontend, ["dom.render", "http.fetch"]);
});

test("practical-backend runtime profile installs extracted backend capabilities", () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "practical-backend" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "practical-backend" });

  const backend = hostCapabilities(world, "backendHost");
  const frontend = hostCapabilities(world, "frontendHost");

  assert.equal(backend.has("http.serve"), true);
  assert.equal(backend.has("runtime.config"), true);
  assert.equal(backend.has("fs.json.write"), true);
  assert.equal(backend.has("db.sql"), true);
  assert.equal(backend.has("notify.email"), true);
  assert.equal(frontend.has("dom.render"), true);
  assert.equal(frontend.has("http.fetch"), true);
  assert.equal(frontend.has("db.sql"), false);
});

test("strict runtime profile resolution rejects unknown operator-selected profile ids", () => {
  const resolved = resolveRuntimeProfileStrict("inspect");
  const invalid = resolveRuntimeProfileStrict("nope");

  assert.equal(resolved.ok, true);
  assert.equal(resolved.id, "inspect");
  assert.equal(invalid.ok, false);
  assert.equal(invalid.requestedProfile, "nope");
  assert.deepEqual(invalid.validProfileIds, ["minimal", "authoring", "inspect", "practical-backend", "full"]);
});

test("bundle-owned generic routes disappear when the runtime profile is inactive", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "full" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "full" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/db/sql`);
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test("minimal runtime profile does not expose bundle-owned search routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "full" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "full" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/search/index`);
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test("minimal runtime profile does not expose tutorial progress routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "full" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "full" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/tutorial-progress/todo-from-scratch`);
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test("minimal runtime profile does not expose backend seam diagnostics routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "full" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "full" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/backend-seams`);
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test("minimal runtime profile does not expose fs blob routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "full" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "full" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/fs/blobs/meta`);
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test("minimal runtime profile does not expose fs stream routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "full" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "full" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/fs/streams/content`);
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test("minimal runtime profile does not expose asset routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "full" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "full" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const content = await fetch(`${server.url}/api/assets/test/content`);
    assert.equal(content.status, 404);

    const upload = await fetch(`${server.url}/api/assets?perspective=test`, { method: "POST", body: "hello" });
    assert.equal(upload.status, 404);

    const retry = await fetch(`${server.url}/api/assets/test/ingest/retry`, { method: "POST" });
    assert.equal(retry.status, 404);

    const reindex = await fetch(`${server.url}/api/assets/test/search/reindex`, { method: "POST" });
    assert.equal(reindex.status, 404);
  } finally {
    await server.close();
  }
});

test("runtime surface contributions vary by active runtime profile", async () => {
  const minimalWorld = createWorld();
  applyMinimalPageDsl(minimalWorld);
  declareBackendHost(minimalWorld, { actor: "adam", id: "backendHost", runtimeProfile: "full" });
  declareFrontendHost(minimalWorld, { actor: "adam", id: "frontendHost", runtimeProfile: "full" });
  const minimalServer = await startServer(minimalWorld, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });
  assert.equal(minimalServer.ok, true);

  const fullWorld = createWorld();
  applyMinimalPageDsl(fullWorld);
  declareBackendHost(fullWorld, { actor: "adam", id: "backendHost", runtimeProfile: "full" });
  declareFrontendHost(fullWorld, { actor: "adam", id: "frontendHost", runtimeProfile: "full" });
  const fullServer = await startServer(fullWorld, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "full"
  });
  assert.equal(fullServer.ok, true);

  try {
    const minimalHtml = await fetch(`${minimalServer.url}/`).then(response => response.text());
    const fullHtml = await fetch(`${fullServer.url}/`).then(response => response.text());

    assert.equal(minimalHtml.includes('"surface:bootstrap"'), false);
    assert.equal(minimalHtml.includes('"surface:process-view"'), false);
    assert.equal(minimalHtml.includes('"surface:world"'), false);
    assert.equal(fullHtml.includes('"surface:bootstrap"'), true);
    assert.equal(fullHtml.includes('"surface:process-view"'), true);
    assert.equal(fullHtml.includes('"surface:world"'), true);
  } finally {
    await minimalServer.close();
    await fullServer.close();
  }
});

test("minimal runtime plus plugin.inspect exposes inspect routes and surfaces", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  applyWorldPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.inspect"]
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/world`);
    assert.notEqual(response.status, 404);
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-inspect"), true);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.inspect"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-inspect"]);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.practical-backend exposes backend routes and capabilities", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.practical-backend"]
  });

  assert.equal(server.ok, true);
  assert.equal(hostCapabilities(world, "backendHost").has("db.sql"), true);

  try {
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), true);
    assert.equal(diagnostics.providedCapabilities.includes("db.sql"), true);
    assert.equal(diagnostics.routes.some(route => route.matcher === "/backend-seams" && route.handler === "page.backendSeams"), true);
  } finally {
    await server.close();
  }
});

test("authoring runtime plus plugin.inspect composes both bundle sets", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  applyWorldPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "authoring" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "authoring" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "authoring",
    runtimePluginIds: ["plugin.inspect"]
  });

  assert.equal(server.ok, true);

  try {
    assert.equal((await fetch(`${server.url}/_bootstrap`)).status, 200);
    assert.notEqual((await fetch(`${server.url}/world`)).status, 404);
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-authoring"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-inspect"), true);
  } finally {
    await server.close();
  }
});

test("runtime diagnostics endpoint exposes truthful minimal composition", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/runtime/diagnostics`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.requestedProfile, "minimal");
    assert.equal(body.activeProfile, "minimal");
    assert.deepEqual(body.availableProfiles, ["minimal", "authoring", "inspect", "practical-backend", "full"]);
    assert.deepEqual(body.activeBundles.map(bundle => bundle.id), ["bundle-core-runtime"]);
    assert.equal(body.routes.some(route => route.matcher === "/api/runtime/diagnostics" && route.handler === "runtime.diagnostics.read"), true);
    assert.equal(body.handlerMetadata["backendProgram.run"].routeKind, "backendProgram");
    assert.deepEqual(body.handlerMetadata["page.home"].methods, ["GET"]);
    assert.deepEqual(body.installedHostCapabilities.backend, ["http.serve", "runtime.config"]);
    assert.deepEqual(body.installedHostCapabilities.frontend, ["dom.render", "http.fetch"]);
    assert.equal(body.surfaces.some(surface => surface.id === "surface:bootstrap"), false);
    assert.equal(body.shells.shells.some(shell => shell.id === "browser" && shell.active === true), true);
    assert.equal(body.shells.shells.some(shell => shell.id === "desktop" && shell.status === "present"), true);
    assert.equal(typeof body.operator.directories.runtimeRoot, "string");
    assert.equal(body.plugins.validCount >= 5, true);
    assert.equal(body.plugins.activePluginIds.length, 0);
    assert.equal(body.plugins.requestedCount, 0);
    assert.equal(body.plugins.activeCount, 0);
  } finally {
    await server.close();
  }
});

test("runtime diagnostics endpoint exposes full-profile bundle and handler-set composition", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "full" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "full" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "full"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/runtime/diagnostics`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.activeProfile, "full");
    assert.equal(body.activeBundles.some(bundle => bundle.id === "bundle-demo"), true);
    assert.equal(body.surfaces.some(surface => surface.id === "surface:world"), true);
    assert.equal(body.providedCapabilities.includes("db.sql"), true);
    assert.equal(body.handlerSets.some(entry => entry.id === "demo"), true);
    assert.equal(body.handlerMetadata["events.stream"].routeKind, "stream");
    assert.deepEqual(body.handlerMetadata["events.stream"].methods, ["GET"]);
    assert.equal(body.plugins.validCount >= 5, true);
    assert.equal(body.plugins.compatibleCount >= 1, true);
    assert.equal(body.plugins.trustStateCounts.local >= 1 || body.plugins.trustStateCounts.unsigned >= 1, true);
    assert.deepEqual(body.plugins.activePluginIds, []);
    assert.deepEqual(body.plugins.addedBundleIds, []);
  } finally {
    await server.close();
  }
});

test("runtime plugins endpoint exposes local plugin package metadata and activation state", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.inspect"]
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/runtime/plugins`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.summary.validCount >= 5, true);
    assert.equal(body.summary.activeCount, 1);
    assert.deepEqual(body.activePluginIds, ["plugin.inspect"]);
    assert.deepEqual(body.addedBundleIds, ["bundle-inspect"]);
    const inspectPlugin = body.packages.find(row => row.id === "plugin.inspect");
    assert.equal(Boolean(inspectPlugin), true);
    assert.equal(inspectPlugin.execution.executable, true);
    assert.equal(inspectPlugin.execution.mode, "bundle-bridge");
    assert.equal(inspectPlugin.activation.requested, true);
    assert.equal(inspectPlugin.activation.active, true);
    assert.equal(inspectPlugin.resolvedBundles.some(row => row.id === "bundle-inspect"), true);
    assert.equal(inspectPlugin.resolvedRuntimeContributions.surfaces.some(row => row.id === "surface:world"), true);
    assert.equal(inspectPlugin.resolvedRuntimeContributions.handlerMetadata["events.stream"].routeKind, "stream");
    assert.deepEqual(inspectPlugin.resolvedRuntimeContributions.routes.find(route => route.handler === "events.stream")?.handlerMetadata?.methods, ["GET"]);
    const pluginPackage = body.packages.find(row => row.id === "plugin.notes-sidebar");
    assert.equal(Boolean(pluginPackage), true);
    assert.equal(pluginPackage.compatibility.compatible, false);
    assert.equal(pluginPackage.execution.executable, false);
    assert.equal(pluginPackage.activation.requested, false);
    assert.equal(pluginPackage.trust.state, "local");
    assert.equal(pluginPackage.declaredCapabilityIds.includes("notes.sidebar"), true);
  } finally {
    await server.close();
  }
});

test("maintained demo runs on minimal plus authored runtime plugins", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });
  applyWitnessDocs(world, await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml")));

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());

    assert.equal(diagnostics.activeProfile, "minimal");
    assert.deepEqual([...diagnostics.plugins.authoredPluginIds].sort(), ["plugin.authoring", "plugin.canvas", "plugin.inspect"]);
    assert.deepEqual(diagnostics.plugins.operatorPluginIds, []);
    assert.deepEqual([...diagnostics.plugins.effectivePluginIds].sort(), ["plugin.authoring", "plugin.canvas", "plugin.inspect"]);
    assert.deepEqual([...diagnostics.plugins.activePluginIds].sort(), ["plugin.authoring", "plugin.canvas", "plugin.inspect"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-core-runtime"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-authoring"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-inspect"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-canvas"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-demo"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-mcp"), false);

    assert.equal((await fetch(`${server.url}/_bootstrap`)).status, 200);
    assert.equal((await fetch(`${server.url}/world`)).status, 200);
    assert.equal((await fetch(`${server.url}/process`)).status, 200);
    assert.equal((await fetch(`${server.url}/canvas`)).status, 200);
  } finally {
    await server.close();
  }
});

test("maintained demo without authored runtime plugins loses optional inspect, authoring, and canvas surfaces under minimal", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });
  applyWitnessDocs(world, await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml")));
  applyWitnessToml(world, `
[[runtimePluginRemove]]
actor = "aaron"
serverRunner = "demo_server"
plugin = "plugin.authoring"

[[runtimePluginRemove]]
actor = "aaron"
serverRunner = "demo_server"
plugin = "plugin.inspect"

[[runtimePluginRemove]]
actor = "aaron"
serverRunner = "demo_server"
plugin = "plugin.canvas"
`);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());

    assert.deepEqual(diagnostics.plugins.authoredPluginIds, []);
    assert.deepEqual(diagnostics.plugins.effectivePluginIds, []);
    assert.deepEqual(diagnostics.activeBundles.map(bundle => bundle.id), ["bundle-core-runtime", "bundle-demo"]);

    assert.equal((await fetch(server.url)).status, 200);
    assert.equal((await fetch(`${server.url}/_bootstrap`)).status, 404);
    assert.equal((await fetch(`${server.url}/world`)).status, 404);
    assert.equal((await fetch(`${server.url}/process`)).status, 404);
    assert.equal((await fetch(`${server.url}/canvas`)).status, 404);
  } finally {
    await server.close();
  }
});

test("full runtime plus plugin.inspect is a no-op in bundle composition but still reported honestly", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "full" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "full" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "full",
    runtimePluginIds: ["plugin.inspect"]
  });

  assert.equal(server.ok, true);

  try {
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.inspect"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, []);
    assert.equal(diagnostics.activeBundles.filter(bundle => bundle.id === "bundle-inspect").length, 1);
  } finally {
    await server.close();
  }
});

test("authorable handler catalogs vary by active runtime profile", () => {
  const minimalHandlers = authorableHandlerIdsForProfile("minimal");
  const minimalPageHandlers = pageHandlerIdsForProfile("minimal");
  const fullHandlers = authorableHandlerIdsForProfile("full");
  const fullPageHandlers = pageHandlerIdsForProfile("full");

  assert.equal(minimalHandlers.includes("page.home"), true);
  assert.equal(minimalHandlers.includes("page.world"), false);
  assert.equal(minimalHandlers.includes("db.sql.query"), false);
  assert.deepEqual(minimalPageHandlers, ["page.home"]);

  assert.equal(fullHandlers.includes("page.world"), true);
  assert.equal(fullHandlers.includes("db.sql.query"), true);
  assert.equal(fullHandlers.includes("canvas.process"), true);
  assert.equal(fullHandlers.includes("mcp.http"), true);
  assert.equal(fullPageHandlers.includes("page.process"), true);
  assert.equal(fullPageHandlers.includes("page.canvas"), true);
  assert.equal(fullPageHandlers.includes("page.backendSeams"), true);
});

test("blank minimal runtime does not expose authoring bootstrap routes or fallback", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const home = await fetch(`${server.url}/`);
    const bootstrap = await fetch(`${server.url}/_bootstrap`);
    const bootstrapModel = await fetch(`${server.url}/api/bootstrap-model`);

    assert.equal(home.status, 404);
    assert.equal(bootstrap.status, 404);
    assert.equal(bootstrapModel.status, 404);
  } finally {
    await server.close();
  }
});

test("blank minimal runtime does not expose authoring CRUD routes", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/widgets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "test_widget", kind: "Text" })
    });

    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test("blank minimal runtime does not expose practical-backend OAuth routes", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/oauth/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "github" })
    });

    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test("blank minimal runtime does not expose practical-backend jobs routes", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handler: "demo.echo", payload: { message: "hello" } })
    });

    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test("blank minimal runtime does not expose practical-backend outbound routes", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/http/outbound`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "crm.sync", url: "stub://echo" })
    });

    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test("blank minimal runtime does not expose practical-backend notification routes", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/notify/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "aaron@example.test", text: "hi" })
    });

    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test("blank minimal runtime does not expose practical-backend webhook routes", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/api/webhooks/inbound/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "invoice.paid" })
    });

    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});

test("blank minimal runtime does not expose MCP routes", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const getResponse = await fetch(`${server.url}/mcp/test`);
    assert.equal(getResponse.status, 404);

    const postResponse = await fetch(`${server.url}/mcp/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "ping" })
    });
    assert.equal(postResponse.status, 404);
  } finally {
    await server.close();
  }
});

test("mounted routes with handlers from inactive bundles return not found", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  applyWorldPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "full" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "full" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const response = await fetch(`${server.url}/world`);
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});
