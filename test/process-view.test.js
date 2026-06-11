import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { applyWitnessDocs, applyWitnessToml, loadWitnessTomlFile } from "../src/dsl.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { processRunProjection, processViewProjection } from "../src/process-view.js";
import { frontendProgram } from "../src/widgets.js";

async function tempRuntimeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "witness-process-view-"));
}

test("process view projection derives branch, loop, parallel, and async metadata from authored graphs", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[frontendProgram]]
actor = "adam"
id = "lab_program"
rootWidget = "root"

[[frontendStep]]
actor = "adam"
program = "lab_program"
event = "inspect"
order = 0
op = "fetchJson"
params = { url = "/api/things", into = "things" }

[[frontendStep]]
actor = "adam"
program = "lab_program"
event = "inspect"
order = 1
op = "setText"
when = { path = "session.authenticated", truthy = true }
params = { widget = "status", text = "signed in" }

[[frontendStep]]
actor = "adam"
program = "lab_program"
event = "inspect"
order = 1
op = "setText"
when = { path = "session.authenticated", falsy = true }
params = { widget = "status", text = "signed out" }

[[frontendStep]]
actor = "adam"
program = "lab_program"
event = "inspect"
order = 2
op = "renderCollection"
repeat = { forEach = { from = "things.items", as = "thing" } }
params = { widget = "list", from = "things.items", template = "row_template" }

[[frontendStep]]
actor = "adam"
program = "lab_program"
event = "inspect"
order = 3
op = "setText"
repeat = { while = { path = "session.authenticated", falsy = true }, max = 2 }
params = { widget = "status", text = "loop" }
`);

  const model = processViewProjection({ witnesses: world.allWitnesses(), observations: [] }, {
    program: "lab_program",
    event: "inspect"
  });

  assert.equal(model.catalog.some(item => item.program === "lab_program" && item.event === "inspect"), true);
  assert.equal(model.graph.layers.some(layer => layer.nodeIds.length === 2), true);
  assert.equal(model.graph.nodes.some(node => node.semantics.async), true);
  assert.equal(model.graph.nodes.filter(node => node.semantics.branch).length, 2);
  assert.equal(model.graph.nodes.some(node => node.semantics.loopKind === "forEach"), true);
  assert.equal(model.graph.nodes.some(node => node.semantics.loopKind === "while"), true);
});

test("process view routes expose correlated runs and dedicated process page", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const runtimeRoot = await tempRuntimeRoot();
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot
  });

  try {
    assert.equal(server.ok, true);

    const program = world.project(witnesses => frontendProgram(witnesses, "todo_frontend_program"));
    const tracedStep = program.graph.find(step => step.event === "load" && step.op === "fetchJson" && step.params?.url === "/api/todos");
    assert.ok(tracedStep, "expected a load fetchJson step for todo_frontend_program");

    const runId = "process-view-run";
    const trace = async (process, body = {}) => {
      const response = await fetch(`${server.url}/api/process-events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          process,
          runId,
          program: "todo_frontend_program",
          event: "load",
          timestamp: Date.now(),
          ...body
        })
      });
      assert.equal(response.status, 200);
    };

    await trace("frontend.process.start");
    await trace("frontend.step.start", { nodeId: tracedStep.id, op: tracedStep.op });
    const todos = await fetch(`${server.url}/api/todos`, {
      headers: {
        "x-witness-process-run": runId,
        "x-witness-step-id": tracedStep.id
      }
    });
    assert.equal(todos.status, 200);
    await trace("frontend.step.done", { nodeId: tracedStep.id, op: tracedStep.op });
    await trace("frontend.process.done");

    const pageHtml = await fetch(`${server.url}/process?program=todo_frontend_program&event=load&runId=${runId}`).then(response => response.text());
    assert.match(pageHtml, /Process View/);
    assert.match(pageHtml, /data-process-node/);
    assert.match(pageHtml, /data-process-replay-range/);

    const processView = await fetch(`${server.url}/api/process-view?program=todo_frontend_program&event=load&runId=${runId}`).then(response => response.json());
    assert.equal(processView.selection.runId, runId);
    assert.equal(processView.run.requests.length, 1);
    assert.equal(processView.run.requests[0].stepId, tracedStep.id);
    assert.equal(processView.run.requests[0].url, "/api/todos");

    const processRun = await fetch(`${server.url}/api/process-runs/${runId}`).then(response => response.json());
    assert.equal(processRun.run.runId, runId);
    assert.equal(processRun.run.requests[0].route, "todos_list_route");
    assert.equal(processRun.replay.max >= 2, true);

    const directRun = processRunProjection({
      witnesses: world.allWitnesses(),
      observations: world.allObservations()
    }, { runId });
    assert.equal(directRun.run.requests[0].handler, "todos.list");
  } finally {
    await server.close();
  }
});
