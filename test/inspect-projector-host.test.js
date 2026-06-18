import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessDocs, loadWitnessTomlFile } from "../src/dsl.js";

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "witness-inspect-projector-host-"));
  return path.join(dir, "todos.json");
}

test("demo server executes inspect reads through projector-backed backend programs", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore()),
    runtimeProfile: "minimal"
  });

  try {
    const witnesses = await fetch(`${server.url}/api/witnesses?offset=0`).then(response => response.json());
    assert.equal(Array.isArray(witnesses.witnesses), true);
    assert.equal(witnesses.offset, 0);

    const worldGraph = await fetch(`${server.url}/api/world-graph`).then(response => response.json());
    assert.equal(Array.isArray(worldGraph.graph?.nodes), true);
    assert.equal(Array.isArray(worldGraph.graph?.edges), true);

    const todos = await fetch(`${server.url}/api/todos`).then(response => response.json());
    assert.equal(Array.isArray(todos.todos), true);

    const backendRunId = world.allObservations()
      .filter(observation =>
        observation.process === "backend.process.start"
        && observation.body?.program === "todo.todos.list.v1"
      )
      .at(-1)?.body?.runId;
    assert.ok(backendRunId, "expected a backend run id after /api/todos");

    const processView = await fetch(
      `${server.url}/api/process-view?program=todo.todos.list.v1&event=request&runId=${backendRunId}`
    ).then(response => response.json());
    assert.equal(processView.selection.runId, backendRunId);
    assert.equal(processView.run.requests.some(request => request.projector === "demo.todosReadModel"), true);

    const processRun = await fetch(`${server.url}/api/process-runs/${backendRunId}?replay=1`).then(response => response.json());
    assert.equal(processRun.run.runId, backendRunId);
    assert.equal(processRun.run.requests.some(request => request.projector === "demo.todosReadModel"), true);

    const projectorObservations = world.allObservations().filter(observation =>
      observation.process === "backend.request.finish"
      && observation.body?.method === "PROJECT"
    );
    assert.equal(projectorObservations.some(observation => observation.body?.projector === "inspect.processViewReadModel"), true);
    assert.equal(projectorObservations.some(observation => observation.body?.projector === "inspect.processRunReadModel"), true);
  } finally {
    await server.close();
  }
});
