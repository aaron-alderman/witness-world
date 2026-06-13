import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../src/kernel.js";
import { ensureRuntimeBuiltins } from "../src/runtime-builtins.js";
import { typeModelProjection } from "../src/type-model.js";
import { runtimeBuiltinSeedContributionsForProfile } from "../src/runtime-bundles.js";
import { DEMO_RUNTIME_BUILTIN_SEEDS } from "../plugins/demo/runtime-builtins.js";
import { MCP_AUTHORING_RUNTIME_BUILTIN_SEEDS } from "../plugins/mcp-authoring/runtime-builtins.js";
import { TUTORIAL_RUNTIME_BUILTIN_SEEDS } from "../plugins/tutorial/runtime-builtins.js";

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
  assert.equal(Boolean(model.valueTypesById["widget.tutorialTarget"]), false);
  assert.equal(processSpecIds.has("todo_create_spec"), false);
  assert.equal(processSpecIds.has("demo_server_runner_storage_spec"), false);
  assert.equal(processSpecIds.has("mcp_server_define_spec"), false);
  assert.equal(processSpecIds.has("tutorial_widget_target_spec"), false);
  assert.equal(processSpecIds.has("widget_define_spec"), true);
  assert.equal(processSpecIds.has("backend_program_define_spec"), true);
});

test("profile seed rows alone do not install plugin-owned builtin seeds", () => {
  const world = createWorld();
  ensureRuntimeBuiltins(world, {
    capabilityIds: [],
    seedContributions: runtimeBuiltinSeedContributionsForProfile("full")
  });
  const model = typeModelProjection(world.allWitnesses());
  const specs = processIds(world);

  assert.equal(Boolean(model.valueTypesById["mcpServer.id"]), false);
  assert.equal(Boolean(model.valueTypesById["todo.id"]), false);
  assert.equal(Boolean(model.valueTypesById["widget.tutorialTarget"]), false);
  assert.equal(specs.has("mcp_server_define_spec"), false);
  assert.equal(specs.has("todo_create_spec"), false);
  assert.equal(specs.has("tutorial_widget_target_spec"), false);
});

test("plugin-owned runtime builtin seeds install when contributed by active plugins", () => {
  const world = createWorld();
  ensureRuntimeBuiltins(world, {
    capabilityIds: [],
    seedContributions: [
      DEMO_RUNTIME_BUILTIN_SEEDS,
      MCP_AUTHORING_RUNTIME_BUILTIN_SEEDS,
      TUTORIAL_RUNTIME_BUILTIN_SEEDS
    ]
  });
  const model = typeModelProjection(world.allWitnesses());
  const specs = processIds(world);

  assert.equal(Boolean(model.valueTypesById["mcpServer.id"]), true);
  assert.equal(Boolean(model.valueTypesById["todo.id"]), true);
  assert.equal(Boolean(model.valueTypesById["widget.tutorialTarget"]), true);
  assert.equal(specs.has("mcp_server_define_spec"), true);
  assert.equal(specs.has("todo_create_spec"), true);
  assert.equal(specs.has("demo_server_runner_storage_spec"), true);
  assert.equal(specs.has("tutorial_widget_target_spec"), true);
});
