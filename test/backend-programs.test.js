import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import {
  defineBackendProgram,
  defineBackendProgramVersion,
  defineBackendProgramVersionTransition,
  defineBackendStep,
  activateBackendProgramVersion,
  requestBackendProgramVersionActivation,
  rollbackBackendProgramVersion,
  backendProgramVersionDefinition
} from "../src/backend-programs.js";

test("backend program versions honor migrate, block, fork, and rollback semantics", () => {
  const world = createWorld();
  defineBackendProgram(world, { actor: "backendHost", soul: "backend.echo", owner: "backendHost" });
  defineBackendProgramVersion(world, { actor: "backendHost", soul: "backend.echo", version: "backend.echo.v1", owner: "backendHost" });
  defineBackendProgramVersion(world, { actor: "backendHost", soul: "backend.echo", version: "backend.echo.v2", owner: "backendHost" });
  defineBackendProgramVersion(world, { actor: "backendHost", soul: "backend.echo", version: "backend.echo.v3", owner: "backendHost" });
  defineBackendProgramVersion(world, { actor: "backendHost", soul: "backend.echo", version: "backend.echo.v4", owner: "backendHost" });
  defineBackendProgramVersionTransition(world, { actor: "backendHost", soul: "backend.echo", from: "backend.echo.v1", to: "backend.echo.v2", strategy: "migrate", owner: "backendHost" });
  defineBackendProgramVersionTransition(world, { actor: "backendHost", soul: "backend.echo", from: "backend.echo.v2", to: "backend.echo.v4", strategy: "fork", owner: "backendHost" });
  activateBackendProgramVersion(world, { actor: "backendHost", soul: "backend.echo", version: "backend.echo.v1" });

  const migrated = requestBackendProgramVersionActivation(world, {
    actor: "backendHost",
    soul: "backend.echo",
    version: "backend.echo.v2"
  });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.status, "migrated");
  assert.equal(world.allWitnesses().some(witness => witness.process === "backendProgramVersion.migrate"), true);

  const blocked = requestBackendProgramVersionActivation(world, {
    actor: "backendHost",
    soul: "backend.echo",
    version: "backend.echo.v3"
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, "blocked");

  const forkRequired = requestBackendProgramVersionActivation(world, {
    actor: "backendHost",
    soul: "backend.echo",
    version: "backend.echo.v4"
  });
  assert.equal(forkRequired.ok, false);
  assert.equal(forkRequired.status, "forkRequired");

  const rolledBack = rollbackBackendProgramVersion(world, {
    actor: "backendHost",
    soul: "backend.echo"
  });
  assert.equal(rolledBack.ok, true);
  assert.equal(rolledBack.status, "rolledBack");
  assert.equal(rolledBack.version, "backend.echo.v1");
  assert.equal(world.allWitnesses().some(witness => witness.process === "backendProgramVersion.rollback"), true);
});

test("backend program version definitions build executable graphs from authored steps", () => {
  const world = createWorld();
  defineBackendProgram(world, { actor: "backendHost", soul: "backend.echo", owner: "backendHost" });
  defineBackendProgramVersion(world, { actor: "backendHost", soul: "backend.echo", version: "backend.echo.v1", owner: "backendHost" });
  defineBackendStep(world, {
    actor: "backendHost",
    version: "backend.echo.v1",
    event: "request",
    op: "request.readJson",
    order: 0,
    params: { into: "requestBody" }
  });
  defineBackendStep(world, {
    actor: "backendHost",
    version: "backend.echo.v1",
    event: "request",
    op: "state.assign",
    order: 1,
    when: { path: "requestBody.enabled", truthy: true },
    params: { into: "result.message", value: "ok" }
  });
  defineBackendStep(world, {
    actor: "backendHost",
    version: "backend.echo.v1",
    event: "request",
    op: "response.json",
    order: 2,
    params: { body: { ok: true } }
  });

  const program = backendProgramVersionDefinition(world.allWitnesses(), "backend.echo.v1");
  assert.ok(program);
  assert.equal(program.soul, "backend.echo");
  assert.equal(program.steps.length, 3);
  assert.equal(program.graph.length, 3);
  assert.equal(program.graph.some(step => step.op === "request.readJson"), true);
});
