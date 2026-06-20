import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { applyWitnessDocs, applyWitnessToml, loadWitnessTomlFile } from "../src/dsl.js";
import { declareBackendHost, declareFrontendHost, hostCapabilities, startServer } from "../src/host.js";
import { startBlankRuntime } from "../src/runtime-local-launcher.js";
import {
  authorableHandlerIdsForProfile,
  pageHandlerIdsForProfile,
  resolveRuntimeProfileStrict
} from "../src/runtime-bundles.js";

function applyMinimalPageDsl(world) {
  applyWitnessToml(world, `
[[surface]]
actor = "adam"
id = "home_surface"
surfaceKind = "app-root"
children = ["home_surface_title"]
props = { title = "Witness Home" }

[[surface]]
actor = "adam"
id = "home_surface_title"
surfaceKind = "text"
props = { text = "Witness Home" }

[[serverRunner]]
actor = "adam"
id = "server_runner"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[route]]
actor = "adam"
id = "home_route"
path = "/"
serves = "page"
method = "GET"
handler = "page.surface"
rootSurface = "home_surface"

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

test("profile-time host declaration stays core-only before active plugin loading", () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "practical-backend" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "practical-backend" });

  const backend = hostCapabilities(world, "backendHost");
  const frontend = hostCapabilities(world, "frontendHost");

  assert.equal(backend.has("http.serve"), true);
  assert.equal(backend.has("runtime.config"), true);
  assert.equal(backend.has("fs.json.write"), false);
  assert.equal(backend.has("fs.blob"), false);
  assert.equal(backend.has("fs.stream"), false);
  assert.equal(backend.has("db.sql"), false);
  assert.equal(backend.has("jobs.queue"), false);
  assert.equal(backend.has("search.index"), false);
  assert.equal(backend.has("notify.email"), false);
  assert.equal(backend.has("http.outbound"), false);
  assert.equal(backend.has("auth.oauth"), false);
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

test("minimal runtime profile does not expose guidance progress routes", async () => {
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
    const response = await fetch(`${server.url}/api/guidance-progress/todo-from-scratch`);
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
    const minimal = await fetch(`${minimalServer.url}/api/runtime/diagnostics`).then(response => response.json());
    const full = await fetch(`${fullServer.url}/api/runtime/diagnostics`).then(response => response.json());
    const minimalMatchers = new Set(minimal.routes.map(route => route.matcher));
    const fullMatchers = new Set(full.routes.map(route => route.matcher));

    assert.equal(minimalMatchers.has("/_bootstrap"), false);
    assert.equal(minimalMatchers.has("/process"), false);
    assert.equal(minimalMatchers.has("/world"), false);
    assert.equal(minimalMatchers.has("/platform"), false);
    assert.equal(fullMatchers.has("/_bootstrap"), true);
    assert.equal(full.surfaces.some(surface => surface.id === "surface:process-view"), true);
    assert.equal(full.surfaces.some(surface => surface.id === "surface:world"), true);
    assert.equal(fullMatchers.has("/platform"), true);
  } finally {
    await minimalServer.close();
    await fullServer.close();
  }
});

test("minimal runtime profile does not expose platform self-model routes", async () => {
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
    assert.equal((await fetch(`${server.url}/platform`)).status, 404);
    assert.equal((await fetch(`${server.url}/platform?area=security&section=summary`)).status, 404);
    assert.equal((await fetch(`${server.url}/platform?area=artifacts&section=summary`)).status, 404);
    assert.equal((await fetch(`${server.url}/platform?area=sessions&section=summary`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-model`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-model?view=security`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-model?view=artifacts`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-model?view=sessions`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-gaps`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-branches`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-branches/demo`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-branches/demo/push`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    })).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-branches/demo/ship`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ releaseChannelId: "releaseChannel:local" })
    })).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-branches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    })).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-change-sets`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-change-sets/demo`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-change-sets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    })).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-change-sets/demo/edits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ edits: [] })
    })).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-change-sets/demo/edits/demo`, {
      method: "DELETE"
    })).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-change-sets/demo/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    })).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-change-sets/demo/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    })).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-change-sets/demo/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    })).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-change-sets/demo/abandon`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    })).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-test-runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    })).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-test-runs/events`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-test-runs/demo`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-artifacts/demo/content`)).status, 404);
    assert.equal((await fetch(`${server.url}/api/platform-proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    })).status, 404);
  } finally {
    await server.close();
  }
});

test("full runtime exposes platform console and platform self-model API", async () => {
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
    const stagedPath = ["test", "runtime-profile-change-set.txt"].join("/");
    const page = await fetch(`${server.url}/platform`);
    const securityPage = await fetch(`${server.url}/platform?area=security&section=summary`);
    const artifactsPage = await fetch(`${server.url}/platform?area=artifacts&section=summary`);
    const sessionsPage = await fetch(`${server.url}/platform?area=sessions&section=summary`);
    const model = await fetch(`${server.url}/api/platform-model`).then(response => response.json());
    const securityModel = await fetch(`${server.url}/api/platform-model?view=security`);
    const artifactsModel = await fetch(`${server.url}/api/platform-model?view=artifacts`);
    const sessionsModel = await fetch(`${server.url}/api/platform-model?view=sessions`);
    const gaps = await fetch(`${server.url}/api/platform-gaps`).then(response => response.json());
    const branchListRoute = await fetch(`${server.url}/api/platform-branches`);
    const branchCreateRoute = await fetch(`${server.url}/api/platform-branches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "branch.runtime.profile" })
    });
    const branchReadRoute = await fetch(`${server.url}/api/platform-branches/branch.runtime.profile`);
    const branchPushRoute = await fetch(`${server.url}/api/platform-branches/branch.runtime.profile/push`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const branchShipRoute = await fetch(`${server.url}/api/platform-branches/branch.runtime.profile/ship`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ releaseChannelId: "releaseChannel:local" })
    });
    const changeSetListRoute = await fetch(`${server.url}/api/platform-change-sets`);
    const changeSetRoute = await fetch(`${server.url}/api/platform-change-sets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "changeset.runtime.profile", branchId: "branch.runtime.profile" })
    });
    const changeSetReadRoute = await fetch(`${server.url}/api/platform-change-sets/changeset.runtime.profile`);
    const editRoute = await fetch(`${server.url}/api/platform-change-sets/changeset.runtime.profile/edits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ edits: [{ path: stagedPath, content: "runtime profile staged edit\n" }] })
    });
    const editBody = await editRoute.json();
    const removeEditRoute = await fetch(`${server.url}/api/platform-change-sets/changeset.runtime.profile/edits/${encodeURIComponent(editBody.edits?.[0]?.pathHash || "missing")}`, {
      method: "DELETE"
    });
    const validateRoute = await fetch(`${server.url}/api/platform-change-sets/changeset.runtime.profile/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const applyRoute = await fetch(`${server.url}/api/platform-change-sets/changeset.runtime.profile/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const rejectRoute = await fetch(`${server.url}/api/platform-change-sets/changeset.runtime.profile/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const abandonRoute = await fetch(`${server.url}/api/platform-change-sets/changeset.runtime.profile/abandon`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const testRunRoute = await fetch(`${server.url}/api/platform-test-runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gateId: "gate:plugins/platform/platform.test.js" })
    });
    const testRunEventsRoute = await fetch(`${server.url}/api/platform-test-runs/events`);
    const testRunBody = await testRunRoute.json();
    const testRunReadRoute = await fetch(`${server.url}/api/platform-test-runs/${encodeURIComponent(testRunBody.testRun?.id || "missing")}`);
    const proposalRoute = await fetch(`${server.url}/api/platform-proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(response => response.json());

    assert.equal(page.status, 200);
    const pageHtml = await page.text();
    assert.match(pageHtml, /Platform Console/);
    assert.match(pageHtml, /Areas/);
    assert.match(pageHtml, /Verification/);
    assert.match(pageHtml, /Knowledge/);
    assert.match(pageHtml, /Overview Detail/);
    assert.match(pageHtml, /\/platform\?area=verification&amp;section=status/);
    assert.match(pageHtml, /\/platform\?area=knowledge&amp;section=docs/);
    assert.notEqual(securityPage.status, 404);
    assert.match(await securityPage.text(), /Security/);
    assert.notEqual(artifactsPage.status, 404);
    assert.match(await artifactsPage.text(), /Artifacts/);
    assert.equal(securityModel.status, 200);
    const securityBody = await securityModel.json();
    assert.equal(Array.isArray(securityBody.authorityPolicies), true);
    assert.equal(Array.isArray(securityBody.authorityDecisions), true);
    assert.equal(artifactsModel.status, 200);
    const artifactsBody = await artifactsModel.json();
    assert.equal(Array.isArray(artifactsBody.artifacts), true);
    assert.notEqual(sessionsPage.status, 404);
    assert.match(await sessionsPage.text(), /Sessions/);
    assert.equal(sessionsModel.status, 200);
    const sessionsBody = await sessionsModel.json();
    assert.equal(Array.isArray(sessionsBody.sessions), true);
    assert.equal(Array.isArray(sessionsBody.executions), true);
    assert.equal(Array.isArray(sessionsBody.sessionTags), true);
    assert.equal(Array.isArray(sessionsBody.executionArtifacts), true);
    assert.equal(model.nodes.some(node => node.id === "plugin.platform"), true);
    assert.equal(model.nodes.some(node => node.id === "surface:platform"), true);
    assert.equal(model.nodes.some(node => node.kind === "task" && node.id.includes("docs/PLATFORM-ALL-THE-WAY-ROADMAP.md")), true);
    assert.equal(model.profiles.find(row => row.id === "full")?.activeRunnerSource, "authored-server-runner");
    assert.equal(model.profiles.find(row => row.id === "full")?.activePluginSource, "profile-or-operator-defaults");
    assert.match(model.profiles.find(row => row.id === "full")?.compositionSummary ?? "", /authored runner server_runner/);
    assert.equal(Array.isArray(gaps.gaps), true);
    assert.notEqual(branchListRoute.status, 404);
    assert.notEqual(branchCreateRoute.status, 404);
    assert.notEqual(branchReadRoute.status, 404);
    assert.notEqual(branchPushRoute.status, 404);
    assert.notEqual(branchShipRoute.status, 404);
    assert.notEqual(changeSetListRoute.status, 404);
    assert.notEqual(changeSetRoute.status, 404);
    assert.notEqual(changeSetReadRoute.status, 404);
    assert.notEqual(editRoute.status, 404);
    assert.notEqual(removeEditRoute.status, 404);
    assert.notEqual(validateRoute.status, 404);
    assert.notEqual(applyRoute.status, 404);
    assert.notEqual(rejectRoute.status, 404);
    assert.notEqual(abandonRoute.status, 404);
    assert.notEqual(testRunRoute.status, 404);
    assert.notEqual(testRunEventsRoute.status, 404);
    await testRunEventsRoute.body?.cancel();
    assert.notEqual(testRunReadRoute.status, 404);
    assert.notEqual(proposalRoute.status, 404);
    assert.equal(diagnostics.plugins.activePluginIds.includes("plugin.platform"), true);
    assert.equal(diagnostics.routes.some(route => route.matcher === "/platform" && route.handler === "page.platform"), true);
    assert.equal(diagnostics.routes.some(route => route.matcher === "/api/platform-branches" && route.handler === "platform.branch.list"), true);
    assert.equal(diagnostics.routes.some(route => route.matcher === "/api/platform-branches" && route.handler === "platform.branch.create"), true);
    assert.equal(diagnostics.routes.some(route => String(route.matcher).includes("platform-branches") && route.handler === "platform.branch.read"), true);
    assert.equal(diagnostics.routes.some(route => String(route.matcher).includes("platform-branches") && route.handler === "platform.branch.push"), true);
    assert.equal(diagnostics.routes.some(route => String(route.matcher).includes("platform-branches") && route.handler === "platform.branch.ship"), true);
    assert.equal(diagnostics.routes.some(route => route.matcher === "/api/platform-change-sets" && route.handler === "platform.changeSet.list"), true);
    assert.equal(diagnostics.routes.some(route => route.matcher === "/api/platform-change-sets" && route.handler === "platform.changeSet.create"), true);
    assert.equal(diagnostics.routes.some(route => String(route.matcher).includes("platform-change-sets") && route.handler === "platform.changeSet.read"), true);
    assert.equal(diagnostics.routes.some(route => String(route.matcher).includes("platform-change-sets") && route.handler === "platform.changeSet.edit"), true);
    assert.equal(diagnostics.routes.some(route => String(route.matcher).includes("platform-change-sets") && route.handler === "platform.changeSet.removeEdit"), true);
    assert.equal(diagnostics.routes.some(route => String(route.matcher).includes("platform-change-sets") && route.handler === "platform.changeSet.validate"), true);
    assert.equal(diagnostics.routes.some(route => String(route.matcher).includes("platform-change-sets") && route.handler === "platform.changeSet.apply"), true);
    assert.equal(diagnostics.routes.some(route => String(route.matcher).includes("platform-change-sets") && route.handler === "platform.changeSet.reject"), true);
    assert.equal(diagnostics.routes.some(route => String(route.matcher).includes("platform-change-sets") && route.handler === "platform.changeSet.abandon"), true);
    assert.equal(diagnostics.routes.some(route => route.matcher === "/api/platform-test-runs" && route.handler === "platform.testRun.create"), true);
    assert.equal(diagnostics.routes.some(route => route.matcher === "/api/platform-test-runs/events" && route.handler === "platform.testRun.events"), true);
    assert.equal(diagnostics.routes.some(route => String(route.matcher).includes("platform-test-runs") && route.handler === "platform.testRun.read"), true);
    assert.equal(diagnostics.routes.some(route => route.matcher === "/api/platform-proposals" && route.handler === "platform.proposal.create"), true);
  } finally {
    await server.close();
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
    assert.equal(diagnostics.plugins.loadedRuntimeCount, 1);
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
    const plugins = await fetch(`${server.url}/api/runtime/plugins`).then(result => result.json());
    const backendPlugin = plugins.packages.find(row => row.id === "plugin.practical-backend");

    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-fs-json"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-assets"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-secret"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-sql"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-jobs"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-search"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-notifications"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-webhooks"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-http-outbound"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-oauth"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-runtime-config"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-backend-seams"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-fs-blob"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-fs-stream"), true);
    assert.equal(diagnostics.providedCapabilities.includes("secret.store"), true);
    assert.equal(diagnostics.providedCapabilities.includes("db.sql"), true);
    assert.equal(diagnostics.providedCapabilities.includes("jobs.queue"), true);
    assert.equal(diagnostics.providedCapabilities.includes("search.index"), true);
    assert.equal(diagnostics.providedCapabilities.includes("notify.email"), true);
    assert.equal(diagnostics.providedCapabilities.includes("webhook.inbound"), true);
    assert.equal(diagnostics.providedCapabilities.includes("http.outbound"), true);
    assert.equal(diagnostics.providedCapabilities.includes("auth.oauth"), true);
    assert.equal(diagnostics.providedCapabilities.includes("fs.json.read"), true);
    assert.equal(diagnostics.providedCapabilities.includes("fs.json.write"), true);
    assert.equal(diagnostics.providedCapabilities.includes("fs.blob"), true);
    assert.equal(diagnostics.providedCapabilities.includes("fs.stream"), true);
    assert.deepEqual(new Set(diagnostics.plugins.activePluginIds), new Set(["plugin.practical-backend", "plugin.assets", "plugin.backend-seams", "plugin.fs-blob", "plugin.fs-json", "plugin.fs-stream", "plugin.http-outbound", "plugin.jobs", "plugin.notifications", "plugin.oauth", "plugin.runtime-config", "plugin.search", "plugin.secret", "plugin.sql", "plugin.webhooks"]));
    assert.deepEqual(new Set(diagnostics.plugins.addedBundleIds), new Set(["bundle-assets", "bundle-backend-seams", "bundle-fs-blob", "bundle-fs-json", "bundle-fs-stream", "bundle-http-outbound", "bundle-jobs", "bundle-notifications", "bundle-oauth", "bundle-runtime-config", "bundle-search", "bundle-secret", "bundle-sql", "bundle-webhooks"]));
    assert.equal(diagnostics.plugins.loadedRuntimeCount, 14);
    assert.equal(backendPlugin.execution.mode, "meta-package");
    assert.equal(backendPlugin.runtimeModule.loadStatus, "not-applicable");
    assert.equal(diagnostics.routes.some(route => route.matcher === "/backend-seams" && route.handler === "page.backendSeams"), true);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.fs-blob exposes blob storage without unrelated practical-backend routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.fs-blob"]
  });

  assert.equal(server.ok, true);
  assert.equal(hostCapabilities(world, "backendHost").has("fs.blob"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("fs.stream"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("upload.asset"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("db.sql"), false);

  try {
    const blobResponse = await fetch(`${server.url}/api/fs/blobs`);
    const streamResponse = await fetch(`${server.url}/api/fs/streams/content`);
    const assetResponse = await fetch(`${server.url}/api/assets/some-asset/content`);
    const backendSeamsResponse = await fetch(`${server.url}/backend-seams`);
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());

    assert.equal(blobResponse.status, 401);
    assert.equal(streamResponse.status, 404);
    assert.equal(assetResponse.status, 404);
    assert.equal(backendSeamsResponse.status, 404);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.fs-blob"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-fs-blob"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-fs-blob"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
    assert.equal(diagnostics.routes.some(route => route.matcher === "/api/fs/blobs" && route.handler === "fs.blob.list"), true);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.fs-stream exposes stream storage through fs-blob dependency only", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.fs-stream"]
  });

  assert.equal(server.ok, true);
  assert.equal(hostCapabilities(world, "backendHost").has("fs.blob"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("fs.stream"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("upload.asset"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("db.sql"), false);

  try {
    const streamResponse = await fetch(`${server.url}/api/fs/streams/content`);
    const blobResponse = await fetch(`${server.url}/api/fs/blobs`);
    const assetResponse = await fetch(`${server.url}/api/assets/some-asset/content`);
    const backendSeamsResponse = await fetch(`${server.url}/backend-seams`);
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());

    assert.equal(streamResponse.status, 401);
    assert.equal(blobResponse.status, 401);
    assert.equal(assetResponse.status, 404);
    assert.equal(backendSeamsResponse.status, 404);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.fs-blob", "plugin.fs-stream"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-fs-blob", "bundle-fs-stream"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-fs-blob"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-fs-stream"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
    assert.equal(diagnostics.routes.some(route => route.matcher === "/api/fs/streams/content" && route.handler === "fs.stream.read"), true);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.sql exposes DB SQL without unrelated practical-backend routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.sql"]
  });

  assert.equal(server.ok, true);
  assert.equal(hostCapabilities(world, "backendHost").has("db.sql"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("jobs.queue"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("search.index"), false);

  try {
    const sqlResponse = await fetch(`${server.url}/api/db/sql`);
    const jobsResponse = await fetch(`${server.url}/api/jobs`);
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());

    assert.equal(sqlResponse.status, 401);
    assert.equal(jobsResponse.status, 404);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.secret", "plugin.sql"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-secret", "bundle-sql"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-secret"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-sql"), true);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.jobs exposes jobs without unrelated practical-backend routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.jobs"]
  });

  assert.equal(server.ok, true);
  assert.equal(hostCapabilities(world, "backendHost").has("jobs.queue"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("db.sql"), false);

  try {
    const jobsResponse = await fetch(`${server.url}/api/jobs`);
    const sqlResponse = await fetch(`${server.url}/api/db/sql`);
    const backendSeamsResponse = await fetch(`${server.url}/backend-seams`);
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());

    assert.equal(jobsResponse.status, 401);
    assert.equal(sqlResponse.status, 404);
    assert.equal(backendSeamsResponse.status, 404);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.jobs"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-jobs"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-jobs"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.search exposes search without unrelated practical-backend routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.search"]
  });

  assert.equal(server.ok, true);
  assert.equal(hostCapabilities(world, "backendHost").has("search.index"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("jobs.queue"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("db.sql"), false);

  try {
    const searchResponse = await fetch(`${server.url}/api/search/index`);
    const jobsResponse = await fetch(`${server.url}/api/jobs`);
    const backendSeamsResponse = await fetch(`${server.url}/backend-seams`);
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());

    assert.equal(searchResponse.status, 401);
    assert.equal(jobsResponse.status, 404);
    assert.equal(backendSeamsResponse.status, 404);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.search"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-search"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-search"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.notifications exposes notifications without unrelated practical-backend routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.notifications"]
  });

  assert.equal(server.ok, true);
  assert.equal(hostCapabilities(world, "backendHost").has("notify.email"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("notify.sms"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("jobs.queue"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("db.sql"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("search.index"), false);

  try {
    const notifyResponse = await fetch(`${server.url}/api/notify/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "aaron@example.test", text: "hi" })
    });
    const jobsResponse = await fetch(`${server.url}/api/jobs`);
    const searchResponse = await fetch(`${server.url}/api/search/index`);
    const backendSeamsResponse = await fetch(`${server.url}/backend-seams`);
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());

    assert.equal(notifyResponse.status, 401);
    assert.equal(jobsResponse.status, 401);
    assert.equal(searchResponse.status, 404);
    assert.equal(backendSeamsResponse.status, 404);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.jobs", "plugin.notifications"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-jobs", "bundle-notifications"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-notifications"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.webhooks exposes webhooks without unrelated practical-backend routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.webhooks"]
  });

  assert.equal(server.ok, true);
  assert.equal(hostCapabilities(world, "backendHost").has("webhook.inbound"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("jobs.queue"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("db.sql"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("search.index"), false);

  try {
    const receiveResponse = await fetch(`${server.url}/api/webhooks/inbound/stripe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-witness-webhook-id": "delivery-1",
        "x-witness-webhook-timestamp": "1718150400",
        "x-witness-webhook-signature": "sha256=bad"
      },
      body: JSON.stringify({ ok: true })
    });
    const listResponse = await fetch(`${server.url}/api/webhooks`);
    const searchResponse = await fetch(`${server.url}/api/search/index`);
    const backendSeamsResponse = await fetch(`${server.url}/backend-seams`);
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());

    assert.equal(receiveResponse.status, 503);
    assert.equal((await receiveResponse.json()).error, "webhook.inbound.secret not configured");
    assert.equal(listResponse.status, 401);
    assert.equal(searchResponse.status, 404);
    assert.equal(backendSeamsResponse.status, 404);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.jobs", "plugin.webhooks"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-jobs", "bundle-webhooks"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-webhooks"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.http-outbound exposes outbound HTTP without unrelated practical-backend routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.http-outbound"]
  });

  assert.equal(server.ok, true);
  assert.equal(hostCapabilities(world, "backendHost").has("http.outbound"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("jobs.queue"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("webhook.inbound"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("db.sql"), false);

  try {
    const sendResponse = await fetch(`${server.url}/api/http/outbound`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: "crm.sync", url: "stub://echo" })
    });
    const listResponse = await fetch(`${server.url}/api/http/outbound`);
    const webhooksResponse = await fetch(`${server.url}/api/webhooks`);
    const backendSeamsResponse = await fetch(`${server.url}/backend-seams`);
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());

    assert.equal(sendResponse.status, 401);
    assert.equal(listResponse.status, 401);
    assert.equal(webhooksResponse.status, 404);
    assert.equal(backendSeamsResponse.status, 404);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.http-outbound"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-http-outbound"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-http-outbound"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.oauth exposes OAuth without unrelated practical-backend routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.oauth"]
  });

  assert.equal(server.ok, true);
  assert.equal(hostCapabilities(world, "backendHost").has("auth.oauth"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("http.outbound"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("jobs.queue"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("db.sql"), false);

  try {
    const startResponse = await fetch(`${server.url}/api/oauth/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "stub" })
    });
    const linksResponse = await fetch(`${server.url}/api/oauth/links`);
    const outboundResponse = await fetch(`${server.url}/api/http/outbound`);
    const backendSeamsResponse = await fetch(`${server.url}/backend-seams`);
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());

    assert.equal(startResponse.status, 503);
    assert.equal(linksResponse.status, 401);
    assert.equal(outboundResponse.status, 404);
    assert.equal(backendSeamsResponse.status, 404);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.oauth"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-oauth"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-oauth"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.runtime-config exposes runtime config without unrelated practical-backend routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.runtime-config"]
  });

  assert.equal(server.ok, true);
  assert.equal(hostCapabilities(world, "backendHost").has("runtime.config"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("fs.blob"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("upload.asset"), false);

  try {
    const runtimeConfigResponse = await fetch(`${server.url}/api/runtime-config`);
    const backendSeamsResponse = await fetch(`${server.url}/backend-seams`);
    const blobResponse = await fetch(`${server.url}/api/fs/blobs`);
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());

    assert.equal(runtimeConfigResponse.status, 401);
    assert.equal(backendSeamsResponse.status, 404);
    assert.equal(blobResponse.status, 404);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.runtime-config"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-runtime-config"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-runtime-config"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.backend-seams exposes backend seams without unrelated practical-backend routes", async () => {
  const world = createWorld();
  applyMinimalPageDsl(world);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.backend-seams"]
  });

  assert.equal(server.ok, true);
  assert.equal(hostCapabilities(world, "backendHost").has("fs.blob"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("upload.asset"), false);
  assert.equal(hostCapabilities(world, "backendHost").has("db.sql"), false);

  try {
    const backendSeamsResponse = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } });
    const backendSeamsPageResponse = await fetch(`${server.url}/backend-seams`);
    const blobResponse = await fetch(`${server.url}/api/fs/blobs`);
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());

    assert.equal(backendSeamsResponse.status, 401);
    assert.equal(backendSeamsPageResponse.status, 401);
    assert.equal(blobResponse.status, 404);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.backend-seams"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-backend-seams"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-backend-seams"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
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
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-authoring-core"), true);
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
    assert.equal(body.activeBundles.every(bundle => bundle.ownerClass === "generic-host"), true);
    assert.equal(body.routes.some(route => route.matcher === "/api/runtime/diagnostics" && route.handler === "runtime.diagnostics.read"), true);
    assert.equal(body.routes.find(route => route.handler === "runtime.diagnostics.read")?.ownerClass, "generic-host");
    assert.equal(body.handlerMetadata["backendProgram.run"].routeKind, "backendProgram");
    assert.equal(body.handlerMetadata["backendProgram.run"].ownerClass, "backend-program");
    assert.deepEqual(body.handlerMetadata["page.surface"].methods, ["GET"]);
    assert.equal(body.handlerMetadata["page.surface"].ownerClass, "generic-host");
    assert.deepEqual(body.installedHostCapabilities.backend, ["http.serve", "runtime.config"]);
    assert.deepEqual(body.installedHostCapabilities.frontend, ["dom.render", "http.fetch"]);
    assert.equal(body.surfaces.some(surface => surface.id === "surface:bootstrap"), false);
    assert.equal(body.surfaces.find(surface => surface.id === "surface:home")?.ownerClass, "generic-host");
    assert.equal(body.shells.shells.some(shell => shell.id === "browser" && shell.active === true), true);
    assert.equal(body.shells.shells.find(shell => shell.id === "browser")?.ownerClass, "shell");
    assert.equal(body.shells.shells.some(shell => shell.id === "desktop" && shell.status === "present"), true);
    assert.equal(body.composition.storyId, "authored-runner-driven");
    assert.equal(body.composition.activeRunnerSource, "authored-server-runner");
    assert.equal(body.composition.activePluginSource, "core-profile-only");
    assert.equal(body.composition.usesAuthoredServerRunner, true);
    assert.equal(body.composition.usesAuthoredRuntimePluginInstalls, false);
    assert.equal(body.startup?.listenReadyAtMs != null, true);
    assert.equal(Array.isArray(body.startup?.phases), true);
    assert.equal(body.mountedRoutes.find(route => route.id === "home_route")?.ownerClass, "generic-host");
    assert.deepEqual(body.mountedRoutes.find(route => route.id === "home_route")?.ownerChain, [
      {
        class: "route",
        routeId: "home_route",
        method: "GET",
        path: "/",
        serves: "page",
        note: "Visible behavior enters through mounted route home_route."
      },
      {
        class: "generic-host",
        bundleId: "bundle-core-runtime",
        pluginId: null,
        handlerId: "page.surface",
        note: "Runtime behavior is owned by shared host/runtime code."
      }
    ]);
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
    assert.equal(body.activeBundles.find(bundle => bundle.id === "bundle-demo")?.ownerClass, "runtime-plugin");
    assert.equal(body.surfaces.some(surface => surface.id === "surface:world"), true);
    assert.equal(body.surfaces.find(surface => surface.id === "surface:world")?.ownerClass, "runtime-plugin");
    assert.equal(body.providedCapabilities.includes("db.sql"), true);
    assert.equal(body.handlerSets.some(entry => entry.id === "demo"), true);
    assert.equal(body.handlerSets.find(entry => entry.id === "demo")?.ownerClass, "handler-set");
    assert.equal(body.handlerSets.find(entry => entry.id === "demo")?.ownerPluginId, "plugin.demo");
    assert.equal(body.handlerMetadata["events.stream"].routeKind, "stream");
    assert.equal(body.handlerMetadata["events.stream"].ownerClass, "runtime-plugin");
    assert.deepEqual(body.handlerMetadata["events.stream"].methods, ["GET"]);
    assert.equal(body.routes.find(route => route.handler === "page.platform")?.ownerClass, "runtime-plugin");
    assert.equal(body.routes.find(route => route.handler === "page.platform")?.ownerPluginId, "plugin.platform");
    assert.equal(body.mountedRoutes.find(route => route.id === "home_route")?.ownerClass, "generic-host");
    assert.equal(body.plugins.validCount >= 5, true);
    assert.equal(body.plugins.compatibleCount >= 1, true);
    assert.equal(body.plugins.trustStateCounts.local >= 1 || body.plugins.trustStateCounts.unsigned >= 1, true);
    assert.equal(body.plugins.activePluginIds.includes("plugin.inspect"), true);
    assert.equal(body.plugins.activePluginIds.includes("plugin.practical-backend"), true);
    assert.equal(body.plugins.activePluginIds.includes("plugin.demo"), true);
    assert.equal(body.plugins.addedBundleIds.includes("bundle-inspect"), true);
    assert.equal(body.plugins.addedBundleIds.includes("bundle-demo"), true);
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
    assert.equal(body.summary.loadedRuntimeCount, 1);
    assert.deepEqual(body.activePluginIds, ["plugin.inspect"]);
    assert.deepEqual(body.addedBundleIds, ["bundle-inspect"]);
    const inspectPlugin = body.packages.find(row => row.id === "plugin.inspect");
    assert.equal(Boolean(inspectPlugin), true);
    assert.equal(inspectPlugin.execution.executable, true);
    assert.equal(inspectPlugin.execution.mode, "plugin-owned");
    assert.equal(inspectPlugin.metadata.runtime.entry, "./runtime.js");
    assert.equal(inspectPlugin.runtimeModule.loadStatus, "loaded");
    assert.equal(inspectPlugin.runtimeModule.bundleId, "bundle-inspect");
    assert.deepEqual(inspectPlugin.runtimeModule.bundleIds, ["bundle-inspect"]);
    assert.equal(inspectPlugin.activation.requested, true);
    assert.equal(inspectPlugin.activation.active, true);
    assert.equal(inspectPlugin.resolvedBundles.some(row => row.id === "bundle-inspect"), true);
    assert.equal(inspectPlugin.resolvedRuntimeContributions.surfaces.some(row => row.id === "surface:world"), true);
    assert.equal(inspectPlugin.resolvedRuntimeContributions.handlerMetadata["events.stream"].routeKind, "stream");
    assert.equal(inspectPlugin.resolvedRuntimeContributions.handlerMetadata["events.stream"].ownerClass, "runtime-plugin");
    assert.equal(inspectPlugin.resolvedRuntimeContributions.handlerMetadata["events.stream"].ownerPluginId, "plugin.inspect");
    assert.equal(inspectPlugin.resolvedRuntimeContributions.routes.find(route => route.handler === "events.stream")?.ownerClass, "runtime-plugin");
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

test("bootstrap default activation loads startup-default authoring, starter, and tutorial plugins on minimal", async () => {
  const result = await startBlankRuntime({
    startupMode: "bootstrap",
    port: 0
  });

  assert.equal(result.server.ok, true);

  try {
    const diagnostics = await fetch(`${result.server.url}/api/runtime/diagnostics`).then(response => response.json());
    const plugins = await fetch(`${result.server.url}/api/runtime/plugins`).then(response => response.json());
    const authoringPlugin = plugins.packages.find(row => row.id === "plugin.authoring");
    const authoringCorePlugin = plugins.packages.find(row => row.id === "plugin.authoring-core");
    const bootstrapPlugin = plugins.packages.find(row => row.id === "plugin.bootstrap");
    const capabilityAuthoringPlugin = plugins.packages.find(row => row.id === "plugin.capability-authoring");
    const programAuthoringPlugin = plugins.packages.find(row => row.id === "plugin.program-authoring");
    const serverRunnerAuthoringPlugin = plugins.packages.find(row => row.id === "plugin.server-runner-authoring");
    const mcpAuthoringPlugin = plugins.packages.find(row => row.id === "plugin.mcp-authoring");
    const proposalsPlugin = plugins.packages.find(row => row.id === "plugin.proposals");
    const starterPlugin = plugins.packages.find(row => row.id === "plugin.starter");
    const tutorialPlugin = plugins.packages.find(row => row.id === "plugin.tutorial");

    assert.equal(diagnostics.activeProfile, "minimal");
    assert.deepEqual([...diagnostics.plugins.startupPluginIds].sort(), ["plugin.authoring", "plugin.starter", "plugin.tutorial"]);
    assert.deepEqual([...diagnostics.plugins.activePluginIds].sort(), ["plugin.authoring", "plugin.authoring-core", "plugin.bootstrap", "plugin.capability-authoring", "plugin.mcp-authoring", "plugin.program-authoring", "plugin.proposals", "plugin.server-runner-authoring", "plugin.starter", "plugin.tutorial"]);
    assert.equal(diagnostics.plugins.loadedRuntimeCount, 9);
    assert.equal(diagnostics.composition.storyId, "startup-runner-driven");
    assert.equal(diagnostics.composition.activeRunnerSource, "startup-default-runner");
    assert.equal(diagnostics.composition.activePluginSource, "startup-defaults");
    assert.equal(authoringPlugin.execution.mode, "meta-package");
    assert.equal(authoringPlugin.runtimeModule.loadStatus, "not-applicable");
    assert.deepEqual(authoringPlugin.runtimeModule.bundleIds, []);
    assert.equal(authoringCorePlugin.execution.mode, "plugin-owned");
    assert.equal(authoringCorePlugin.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(authoringCorePlugin.runtimeModule.bundleIds, ["bundle-authoring-core"]);
    assert.equal(authoringCorePlugin.resolvedBundles.some(row => row.id === "bundle-authoring-core"), true);
    assert.equal(authoringPlugin.resolvedBundles.some(row => row.id === "bundle-bootstrap"), false);
    assert.equal(authoringPlugin.resolvedBundles.some(row => row.id === "bundle-capability-authoring"), false);
    assert.equal(authoringPlugin.resolvedBundles.some(row => row.id === "bundle-program-authoring"), false);
    assert.equal(authoringPlugin.resolvedBundles.some(row => row.id === "bundle-server-runner-authoring"), false);
    assert.equal(authoringPlugin.resolvedBundles.some(row => row.id === "bundle-mcp-authoring"), false);
    assert.equal(authoringPlugin.resolvedBundles.some(row => row.id === "bundle-proposals"), false);
    assert.equal(authoringPlugin.resolvedBundles.some(row => row.id === "bundle-tutorial"), false);
    assert.equal(capabilityAuthoringPlugin.execution.mode, "plugin-owned");
    assert.equal(capabilityAuthoringPlugin.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(capabilityAuthoringPlugin.runtimeModule.bundleIds, ["bundle-capability-authoring"]);
    assert.equal(capabilityAuthoringPlugin.resolvedBundles.some(row => row.id === "bundle-capability-authoring"), true);
    assert.equal(programAuthoringPlugin.execution.mode, "plugin-owned");
    assert.equal(programAuthoringPlugin.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(programAuthoringPlugin.runtimeModule.bundleIds, ["bundle-program-authoring"]);
    assert.equal(programAuthoringPlugin.resolvedBundles.some(row => row.id === "bundle-program-authoring"), true);
    assert.equal(serverRunnerAuthoringPlugin.execution.mode, "plugin-owned");
    assert.equal(serverRunnerAuthoringPlugin.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(serverRunnerAuthoringPlugin.runtimeModule.bundleIds, ["bundle-server-runner-authoring"]);
    assert.equal(serverRunnerAuthoringPlugin.resolvedBundles.some(row => row.id === "bundle-server-runner-authoring"), true);
    assert.equal(mcpAuthoringPlugin.execution.mode, "plugin-owned");
    assert.equal(mcpAuthoringPlugin.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(mcpAuthoringPlugin.runtimeModule.bundleIds, ["bundle-mcp-authoring"]);
    assert.equal(mcpAuthoringPlugin.resolvedBundles.some(row => row.id === "bundle-mcp-authoring"), true);
    assert.equal(bootstrapPlugin.execution.mode, "plugin-owned");
    assert.equal(bootstrapPlugin.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(bootstrapPlugin.runtimeModule.bundleIds, ["bundle-bootstrap"]);
    assert.equal(bootstrapPlugin.resolvedBundles.some(row => row.id === "bundle-bootstrap"), true);
    assert.equal(proposalsPlugin.execution.mode, "plugin-owned");
    assert.equal(proposalsPlugin.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(proposalsPlugin.runtimeModule.bundleIds, ["bundle-proposals"]);
    assert.equal(proposalsPlugin.resolvedBundles.some(row => row.id === "bundle-proposals"), true);
    assert.equal(starterPlugin.execution.mode, "plugin-owned");
    assert.equal(starterPlugin.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(starterPlugin.runtimeModule.bundleIds, ["bundle-starter"]);
    assert.equal(starterPlugin.resolvedBundles.some(row => row.id === "bundle-starter"), true);
    assert.equal(tutorialPlugin.execution.mode, "plugin-owned");
    assert.equal(tutorialPlugin.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(tutorialPlugin.runtimeModule.bundleIds, ["bundle-tutorial"]);
    assert.equal(tutorialPlugin.resolvedBundles.some(row => row.id === "bundle-tutorial"), true);
  } finally {
    await result.server.close();
  }
});

test("maintained demo runs on minimal plus authored runtime plugins", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });
  applyWitnessDocs(world, await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml")));

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, true);

  try {
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());
    const plugins = await fetch(`${server.url}/api/runtime/plugins`).then(result => result.json());
    const canvasPlugin = plugins.packages.find(row => row.id === "plugin.canvas");

    assert.equal(diagnostics.activeProfile, "minimal");
    assert.deepEqual([...diagnostics.plugins.authoredPluginIds].sort(), ["plugin.authoring", "plugin.canvas", "plugin.demo", "plugin.inspect"]);
    assert.deepEqual(diagnostics.plugins.operatorPluginIds, []);
    assert.deepEqual([...diagnostics.plugins.effectivePluginIds].sort(), ["plugin.authoring", "plugin.authoring-core", "plugin.bootstrap", "plugin.canvas", "plugin.capability-authoring", "plugin.demo", "plugin.fs-json", "plugin.inspect", "plugin.mcp-authoring", "plugin.program-authoring", "plugin.proposals", "plugin.server-runner-authoring"].sort());
    assert.deepEqual([...diagnostics.plugins.activePluginIds].sort(), ["plugin.authoring", "plugin.authoring-core", "plugin.bootstrap", "plugin.canvas", "plugin.capability-authoring", "plugin.demo", "plugin.fs-json", "plugin.inspect", "plugin.mcp-authoring", "plugin.program-authoring", "plugin.proposals", "plugin.server-runner-authoring"].sort());
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-core-runtime"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-authoring-core"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-bootstrap"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-capability-authoring"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-program-authoring"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-server-runner-authoring"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-mcp-authoring"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-proposals"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-inspect"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-canvas"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-demo"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-mcp"), false);
    assert.equal(diagnostics.handlerSets.some(entry => entry.id === "demo"), true);
    assert.equal(canvasPlugin.execution.mode, "plugin-owned");
    assert.equal(canvasPlugin.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(canvasPlugin.runtimeModule.bundleIds, ["bundle-canvas"]);

    assert.equal((await fetch(`${server.url}/_bootstrap`)).status, 200);
    assert.equal((await fetch(`${server.url}/world`)).status, 200);
    assert.equal((await fetch(`${server.url}/process`)).status, 200);
    assert.equal((await fetch(`${server.url}/canvas`)).status, 200);
  } finally {
    await server.close();
  }
});

test("maintained demo without authored runtime plugins does not start under minimal while the demo handler set remains authored", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });
  applyWitnessDocs(world, await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml")));
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

[[runtimePluginRemove]]
actor = "aaron"
serverRunner = "demo_server"
plugin = "plugin.demo"
`);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, false);
  assert.equal(server.reason, "unknown handler set");
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
    assert.equal(diagnostics.plugins.activePluginIds.includes("plugin.inspect"), true);
    assert.deepEqual(diagnostics.plugins.operatorPluginIds, ["plugin.inspect"]);
    assert.equal(diagnostics.plugins.addedBundleIds.includes("bundle-inspect"), true);
    assert.equal(diagnostics.activeBundles.filter(bundle => bundle.id === "bundle-inspect").length, 1);
  } finally {
    await server.close();
  }
});

test("static handler catalog helpers stay core-only before plugin runtime loading", () => {
  const minimalHandlers = authorableHandlerIdsForProfile("minimal");
  const minimalPageHandlers = pageHandlerIdsForProfile("minimal");
  const fullHandlers = authorableHandlerIdsForProfile("full");
  const fullPageHandlers = pageHandlerIdsForProfile("full");

  assert.equal(minimalHandlers.includes("page.surface"), true);
  assert.equal(minimalHandlers.includes("page.world"), false);
  assert.equal(minimalHandlers.includes("db.sql.query"), false);
  assert.deepEqual(minimalPageHandlers, ["page.surface"]);

  assert.equal(fullHandlers.includes("page.surface"), true);
  assert.equal(fullHandlers.includes("page.world"), false);
  assert.equal(fullHandlers.includes("db.sql.query"), false);
  assert.equal(fullHandlers.includes("canvas.process"), false);
  assert.equal(fullHandlers.includes("mcp.http"), false);
  assert.deepEqual(fullPageHandlers, ["page.surface"]);
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

test("minimal runtime plus plugin.mcp loads MCP routes from the plugin runtime", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.mcp"]
  });

  assert.equal(server.ok, true);

  try {
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());
    const plugins = await fetch(`${server.url}/api/runtime/plugins`).then(result => result.json());
    const mcpPlugin = plugins.packages.find(row => row.id === "plugin.mcp");

    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-mcp"), true);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.mcp"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-mcp"]);
    assert.equal(diagnostics.plugins.loadedRuntimeCount, 1);
    assert.equal(diagnostics.routes.some(route => route.matcher === "/^\\/mcp\\/([^/]+)$/" && route.handler === "mcp.http"), true);
    assert.equal(mcpPlugin.execution.mode, "plugin-owned");
    assert.equal(mcpPlugin.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(mcpPlugin.runtimeModule.bundleIds, ["bundle-mcp"]);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.eden loads Eden handlers from the plugin runtime", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.eden"]
  });

  assert.equal(server.ok, true);

  try {
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());
    const plugins = await fetch(`${server.url}/api/runtime/plugins`).then(result => result.json());
    const edenPlugin = plugins.packages.find(row => row.id === "plugin.eden");

    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-eden"), true);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.eden"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-eden"]);
    assert.equal(diagnostics.plugins.loadedRuntimeCount, 1);
    assert.equal(edenPlugin.resolvedBundles.some(row => row.id === "bundle-eden"), true);
    assert.equal(edenPlugin.execution.mode, "plugin-owned");
    assert.equal(edenPlugin.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(edenPlugin.runtimeModule.bundleIds, ["bundle-eden"]);
  } finally {
    await server.close();
  }
});

test("minimal runtime plus plugin.demo exposes the demo handler set from the plugin runtime", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.demo"]
  });

  assert.equal(server.ok, true);

  try {
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(result => result.json());
    const plugins = await fetch(`${server.url}/api/runtime/plugins`).then(result => result.json());
    const demoPlugin = plugins.packages.find(row => row.id === "plugin.demo");

    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-demo"), true);
    assert.deepEqual([...diagnostics.plugins.activePluginIds].sort(), ["plugin.fs-json", "plugin.demo"].sort());
    assert.deepEqual([...diagnostics.plugins.addedBundleIds].sort(), ["bundle-fs-json", "bundle-demo"].sort());
    assert.equal(diagnostics.handlerSets.some(entry => entry.id === "demo"), true);
    assert.equal(demoPlugin.execution.mode, "plugin-owned");
    assert.equal(demoPlugin.runtimeModule.loadStatus, "loaded");
    assert.deepEqual(demoPlugin.runtimeModule.bundleIds, ["bundle-demo"]);
    assert.deepEqual(demoPlugin.resolvedRuntimeContributions.handlerSets, ["demo"]);
  } finally {
    await server.close();
  }
});

test("serverRunner.handlerSet no longer auto-activates the demo bundle under minimal", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "server_runner"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
`);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "server_runner",
    runtimeRoot: await tempRuntimeRoot(),
    runtimeProfile: "minimal"
  });

  assert.equal(server.ok, false);
  assert.equal(server.reason, "unknown handler set");
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

