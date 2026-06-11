import assert from "node:assert/strict";
import test from "node:test";
import { createWorld, createThing, projectors } from "../src/kernel.js";
import {
  createCompiler,
  createDescription,
  compileDescription,
  createServerRunner,
  defineRoute,
  serveRoute,
  createFrontendRunner,
  createViewDescription,
  renderView,
  emitUserAction,
  moduleProjectors
} from "../src/modules.js";

test("compiler ladder: compiler compiles compiler description into next compiler artifact", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createCompiler(world, { actor: "aaron", id: "compiler_0" });
  createDescription(world, { actor: "aaron", id: "compiler_1_description", source: "compiler subset v1" });
  compileDescription(world, { actor: "aaron", compiler: "compiler_0", description: "compiler_1_description", output: "compiler_1_artifact" });

  const artifacts = world.project(moduleProjectors.compiledArtifacts);
  assert.deepEqual(artifacts, [{ artifact: "compiler_1_artifact", source: "compiler_1_description", compiler: "compiler_0" }]);
  assert.equal(world.project(projectors.owners).get("compiler_1_artifact"), "aaron");
});

test("compile fails if the compiler is not actually a compiler", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "not_a_compiler" });
  createDescription(world, { actor: "aaron", id: "program_description", source: "do thing" });
  const w = compileDescription(world, { actor: "aaron", compiler: "not_a_compiler", description: "program_description", output: "program_artifact" });

  assert.equal(w.process, "compileDescription.failed");
  assert.equal(world.project(moduleProjectors.compiledArtifacts).length, 0);
});

test("server runner serves a route that points at a frontend artifact", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createServerRunner(world, {
    actor: "aaron",
    id: "server_runner",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    handlerSet: "demo",
    actors: [{ id: "aaron", label: "Aaron" }],
    storage: { todoProjection: "todos.json" }
  });
  createThing(world, { actor: "aaron", id: "frontend_bundle" });
  defineRoute(world, { actor: "aaron", id: "root_route", path: "/", serves: "frontend_bundle" });
  const w = serveRoute(world, { actor: "aaron", serverRunner: "server_runner", route: "root_route" });

  assert.equal(w.process, "serveRoute");
  assert.equal(world.project(projectors.currentRelations).some(r => r.from === "server_runner" && r.rel === "serves" && r.to === "root_route"), true);
  assert.deepEqual(world.project(moduleProjectors.serverRunners), [{
    id: "server_runner",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    handlerSet: "demo",
    actors: [{ id: "aaron", label: "Aaron" }],
    storage: { todoProjection: "todos.json" }
  }]);
  assert.deepEqual(world.project(moduleProjectors.servedRoutes), [{
    id: "root_route",
    path: "/",
    serves: "frontend_bundle",
    method: "GET",
    handler: null,
    params: null,
    serverRunner: "server_runner"
  }]);
});

test("frontend runner renders a view and emits user action witnesses", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "callan" });
  createFrontendRunner(world, { actor: "aaron", id: "frontend_runner" });
  createViewDescription(world, { actor: "aaron", id: "aaron_canvas_view", target: "callan" });
  renderView(world, { actor: "aaron", frontendRunner: "frontend_runner", viewDescription: "aaron_canvas_view", frame: "frame_1" });
  emitUserAction(world, { actor: "aaron", frontendRunner: "frontend_runner", action: "drag_callan_proxy", target: "callan", body: { x: 120, y: 300 } });

  assert.deepEqual(world.project(moduleProjectors.renderedFrames), [{ frame: "frame_1", view: "aaron_canvas_view", runner: "frontend_runner" }]);
  assert.equal(world.allWitnesses().some(w => w.process === "emitUserAction" && w.body.x === 120), true);
});
