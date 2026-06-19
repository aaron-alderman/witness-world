import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { applyWitnessDocs, applyWitnessToml, loadWitnessTomlFile } from "../src/dsl.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { processRunProjection, processViewProjection } from "../plugins/inspect/process-view.js";
import {
  activateBackendProgramVersion,
  backendProgramVersionDefinition,
  defineBackendProgram,
  defineBackendProgramVersion,
  defineBackendStep
} from "../src/backend-programs.js";
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
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const runtimeRoot = await tempRuntimeRoot();
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot,
    runtimeProfile: "minimal"
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
    assert.equal(world.allObservations().filter(observation => observation.process === "backend.process.start").at(-1)?.body?.program, "todo.processEvents.record.v1");
    await trace("frontend.step.start", { nodeId: tracedStep.id, op: tracedStep.op });
    const todos = await fetch(`${server.url}/api/todos`, {
      headers: {
        "x-witness-process-run": runId,
        "x-witness-step-id": tracedStep.id
      }
    });
    assert.equal(todos.status >= 200, true);
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
    assert.equal(world.allObservations().filter(observation => observation.process === "backend.process.start").at(-1)?.body?.program, "todo.processRun.read.v1");

    const directRun = processRunProjection({
      witnesses: world.allWitnesses(),
      observations: world.allObservations()
    }, { runId });
    assert.equal(directRun.run.requests[0].handler, "backendProgram.run");

    const backendRunId = world.allObservations()
      .filter(observation => observation.process === "backend.process.start" && observation.body?.program === "todo.todos.list.v1")
      .at(-1)?.body?.runId;
    assert.ok(backendRunId, "expected a backend program run for /api/todos");

    const backendProcessView = await fetch(`${server.url}/api/process-view?program=todo.todos.list.v1&event=request&runId=${backendRunId}`).then(response => response.json());
    assert.equal(backendProcessView.selection.runId, backendRunId);
    const projectorRequest = backendProcessView.run.requests.find(request => request.projector === "demo.todosReadModel");
    assert.ok(projectorRequest);
    assert.equal(projectorRequest.method, "PROJECT");
    assert.equal(projectorRequest.url, "project:demo.todosReadModel");
  } finally {
    await server.close();
  }
});

test("process view projection includes backend program catalogs, runs, and correlated handler calls", () => {
  const world = createWorld();
  defineBackendProgram(world, { actor: "backendHost", soul: "backend.echo", owner: "backendHost" });
  defineBackendProgramVersion(world, {
    actor: "backendHost",
    soul: "backend.echo",
    version: "backend.echo.v1",
    owner: "backendHost"
  });
  defineBackendStep(world, {
    actor: "backendHost",
    version: "backend.echo.v1",
    event: "request",
    op: "handler.invoke",
    order: 0,
    params: { handler: "session.read", method: "GET", into: "sessionStatus" }
  });
  defineBackendStep(world, {
    actor: "backendHost",
    version: "backend.echo.v1",
    event: "request",
    op: "response.json",
    order: 1,
    params: { body: { ok: true } }
  });
  activateBackendProgramVersion(world, {
    actor: "backendHost",
    soul: "backend.echo",
    version: "backend.echo.v1"
  });

  const program = backendProgramVersionDefinition(world.allWitnesses(), "backend.echo.v1");
  const invokeStep = program.graph.find(node => node.op === "handler.invoke");
  const responseStep = program.graph.find(node => node.op === "response.json");
  assert.ok(invokeStep);
  assert.ok(responseStep);

  const runId = "backend-process-run";
  world.emit({
    process: "backend.process.start",
    actor: "backendHost",
    claims: [],
    body: { runId, program: "backend.echo.v1", event: "request", timestamp: 1 }
  });
  world.emit({
    process: "backend.step.start",
    actor: "backendHost",
    claims: [],
    body: { runId, program: "backend.echo.v1", event: "request", nodeId: invokeStep.id, op: invokeStep.op, timestamp: 2 }
  });
  const requestWitness = world.emit({
    process: "session.read",
    actor: "backendHost",
    claims: [],
    body: { authenticated: false }
  });
  world.observe({
    process: "backend.request.finish",
    actor: "backendHost",
    claims: [],
    body: {
      requestId: `${runId}:${invokeStep.id}:session.read`,
      stepId: invokeStep.id,
      method: "GET",
      url: "/api/session",
      statusCode: 200,
      route: null,
      handler: "session.read",
      runId,
      emittedWitnessIds: [requestWitness.id],
      failureWitnessIds: []
    }
  });
  world.emit({
    process: "backend.step.done",
    actor: "backendHost",
    claims: [],
    body: { runId, program: "backend.echo.v1", event: "request", nodeId: invokeStep.id, op: invokeStep.op, timestamp: 3 }
  });
  world.emit({
    process: "backend.step.start",
    actor: "backendHost",
    claims: [],
    body: { runId, program: "backend.echo.v1", event: "request", nodeId: responseStep.id, op: responseStep.op, timestamp: 4 }
  });
  world.emit({
    process: "backend.step.done",
    actor: "backendHost",
    claims: [],
    body: { runId, program: "backend.echo.v1", event: "request", nodeId: responseStep.id, op: responseStep.op, timestamp: 5 }
  });
  world.emit({
    process: "backend.process.done",
    actor: "backendHost",
    claims: [],
    body: { runId, program: "backend.echo.v1", event: "request", timestamp: 6 }
  });

  const model = processViewProjection({
    witnesses: world.allWitnesses(),
    observations: world.allObservations()
  }, {
    program: "backend.echo.v1",
    event: "request",
    runId
  });
  assert.equal(model.catalog.some(item => item.program === "backend.echo.v1" && item.event === "request"), true);
  assert.equal(model.selection.runId, runId);
  assert.equal(model.run.requests.length, 1);
  assert.equal(model.run.requests[0].handler, "session.read");
  assert.equal(model.run.timeline[0].status, "start");
  assert.equal(model.run.nodeHistory[invokeStep.id].some(item => item.type === "request" && item.handler === "session.read"), true);

  const run = processRunProjection({
    witnesses: world.allWitnesses(),
    observations: world.allObservations()
  }, { runId });
  assert.equal(run.run.requests[0].handler, "session.read");
  assert.equal(run.run.nodeHistory[invokeStep.id][0].status, "start");
});

