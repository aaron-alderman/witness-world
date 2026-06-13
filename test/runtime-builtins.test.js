import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../src/kernel.js";
import { ensureRuntimeBuiltins } from "../src/runtime-builtins.js";
import { typeModelProjection } from "../src/type-model.js";
import { runtimeBuiltinSeedContributionsForProfile } from "../src/runtime-bundles.js";

function processIds(world) {
  return new Set(
    world.allWitnesses()
      .filter(witness => witness.process === "defineProcessSpec" && witness.body?.id)
      .map(witness => witness.body.id)
  );
}

test("core runtime builtins do not seed demo or mcp authoring metadata by default", () => {
  const world = createWorld();

  ensureRuntimeBuiltins(world, { capabilityIds: [] });

  const model = typeModelProjection(world.allWitnesses());
  const processSpecIds = processIds(world);

  assert.equal(Boolean(model.valueTypesById["todo.id"]), false);
  assert.equal(Boolean(model.valueTypesById["mcpServer.id"]), false);
  assert.equal(processSpecIds.has("todo_create_spec"), false);
  assert.equal(processSpecIds.has("mcp_server_define_spec"), false);
  assert.equal(processSpecIds.has("widget_define_spec"), true);
  assert.equal(processSpecIds.has("backend_program_define_spec"), true);
});

test("runtime builtin seed contributions follow active bundle composition", () => {
  const authoringWorld = createWorld();
  ensureRuntimeBuiltins(authoringWorld, {
    capabilityIds: [],
    seedContributions: runtimeBuiltinSeedContributionsForProfile("authoring")
  });
  const authoringModel = typeModelProjection(authoringWorld.allWitnesses());
  const authoringSpecs = processIds(authoringWorld);
  assert.equal(Boolean(authoringModel.valueTypesById["mcpServer.id"]), true);
  assert.equal(authoringSpecs.has("mcp_server_define_spec"), true);
  assert.equal(Boolean(authoringModel.valueTypesById["todo.id"]), false);
  assert.equal(authoringSpecs.has("todo_create_spec"), false);

  const fullWorld = createWorld();
  ensureRuntimeBuiltins(fullWorld, {
    capabilityIds: [],
    seedContributions: runtimeBuiltinSeedContributionsForProfile("full")
  });
  const fullModel = typeModelProjection(fullWorld.allWitnesses());
  const fullSpecs = processIds(fullWorld);
  assert.equal(Boolean(fullModel.valueTypesById["mcpServer.id"]), true);
  assert.equal(Boolean(fullModel.valueTypesById["todo.id"]), true);
  assert.equal(fullSpecs.has("mcp_server_define_spec"), true);
  assert.equal(fullSpecs.has("todo_create_spec"), true);
});
