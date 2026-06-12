import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { createServerRunner, defineRoute, serveRoute } from "../src/modules.js";
import {
  activateBackendProgramVersion,
  defineBackendProgram,
  defineBackendProgramVersion,
  defineBackendProgramVersionTransition,
  defineBackendStep
} from "../src/backend-programs.js";

async function tempRuntimeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "witness-backend-program-host-"));
}

test("route-backed backend programs execute existing handlers and switch versions live", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "system", id: "backendHost" });
  declareFrontendHost(world, { actor: "system", id: "frontendHost" });
  createServerRunner(world, {
    actor: "backendHost",
    id: "runner",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    allowActorHeader: true,
    owner: "backendHost"
  });
  defineBackendProgram(world, {
    actor: "backendHost",
    soul: "backend.echo",
    label: "Backend Echo",
    owner: "backendHost"
  });
  defineBackendProgramVersion(world, {
    actor: "backendHost",
    soul: "backend.echo",
    version: "backend.echo.v1",
    owner: "backendHost"
  });
  defineBackendProgramVersion(world, {
    actor: "backendHost",
    soul: "backend.echo",
    version: "backend.echo.v2",
    owner: "backendHost"
  });
  defineBackendProgramVersionTransition(world, {
    actor: "backendHost",
    soul: "backend.echo",
    from: "backend.echo.v1",
    to: "backend.echo.v2",
    strategy: "compatible",
    owner: "backendHost"
  });
  defineBackendStep(world, {
    actor: "backendHost",
    version: "backend.echo.v1",
    event: "request",
    op: "handler.invoke",
    order: 0,
    params: {
      handler: "session.read",
      method: "GET",
      path: "/api/session",
      into: "sessionStatus"
    }
  });
  defineBackendStep(world, {
    actor: "backendHost",
    version: "backend.echo.v1",
    event: "request",
    op: "response.json",
    order: 1,
    params: {
      body: {
        version: "v1",
        authenticated: "${state.sessionStatus.authenticated}"
      }
    }
  });
  defineBackendStep(world, {
    actor: "backendHost",
    version: "backend.echo.v2",
    event: "request",
    op: "handler.invoke",
    order: 0,
    params: {
      handler: "session.read",
      method: "GET",
      path: "/api/session",
      into: "sessionStatus"
    }
  });
  defineBackendStep(world, {
    actor: "backendHost",
    version: "backend.echo.v2",
    event: "request",
    op: "response.json",
    order: 1,
    params: {
      body: {
        version: "v2",
        authenticated: "${state.sessionStatus.authenticated}"
      }
    }
  });
  activateBackendProgramVersion(world, {
    actor: "backendHost",
    soul: "backend.echo",
    version: "backend.echo.v1"
  });
  defineRoute(world, {
    actor: "backendHost",
    id: "backend_program_route",
    path: "/api/runtime-program",
    serves: "backendProgram",
    method: "GET",
    handler: "backendProgram.run",
    params: { backendProgramSoul: "backend.echo" },
    owner: "backendHost"
  });
  serveRoute(world, { actor: "backendHost", serverRunner: "runner", route: "backend_program_route" });

  const server = await startServer(world, {
    actor: "backendHost",
    serverRunnerId: "runner",
    runtimeRoot: await tempRuntimeRoot()
  });
  assert.equal(server.ok, true);

  try {
    const before = await fetch(`${server.url}/api/runtime-program`).then(response => response.json());
    assert.deepEqual(before, { version: "v1", authenticated: false });

    const activated = await fetch(`${server.url}/api/backend-program-versions/backend.echo/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version: "backend.echo.v2" })
    });
    assert.equal(activated.status, 200);

    const afterActivate = await fetch(`${server.url}/api/runtime-program`).then(response => response.json());
    assert.deepEqual(afterActivate, { version: "v2", authenticated: false });

    const rolledBack = await fetch(`${server.url}/api/backend-program-versions/backend.echo/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    assert.equal(rolledBack.status, 200);

    const afterRollback = await fetch(`${server.url}/api/runtime-program`).then(response => response.json());
    assert.deepEqual(afterRollback, { version: "v1", authenticated: false });
  } finally {
    await server.close();
  }
});
