import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { applyWitnessToml } from "../src/dsl.js";
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
    assert.deepEqual(body.installedHostCapabilities.backend, ["http.serve", "runtime.config"]);
    assert.deepEqual(body.installedHostCapabilities.frontend, ["dom.render", "http.fetch"]);
    assert.equal(body.surfaces.some(surface => surface.id === "surface:bootstrap"), false);
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
