import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startTodoServer } from "../src/host.js";
import { applyWitnessToml } from "../src/dsl.js";

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "witness-canvas-host-"));
  return path.join(dir, "todos.json");
}

async function startCanvasServer() {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  applyWitnessToml(world, `
[[widget]]
actor = "adam"
id = "todo_app_widget"
kind = "Page"
props = { title = "Witness Todo" }
`);
  const server = await startTodoServer(world, {
    actor: "adam",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    rootWidget: "todo_app_widget",
    storePath: await tempStore()
  });
  return { world, server };
}

const asAaron = { "x-witness-actor": "aaron", "content-type": "application/json" };

function postProcess(server, process, params, headers = asAaron) {
  return fetch(`${server.url}/api/canvas/process`, {
    method: "POST",
    headers,
    body: JSON.stringify({ process, params })
  });
}

test("canvas page renders with inspector sections and parseable scripts", async () => {
  const { server } = await startCanvasServer();
  try {
    const response = await fetch(`${server.url}/canvas`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /canvas-surface/);
    assert.match(html, /Thing properties/);
    assert.match(html, /Projection properties/);
    assert.match(html, /mode-pan-btn/);
    assert.match(html, /snap-toggle-btn/);
    assert.match(html, /canvas\.batch/);
    assert.match(html, /canvas\.duplicate/);
    assert.match(html, /marquee/);
    assert.match(html, /keepalive/);
    assert.match(html, /queueMove/);
    assert.match(html, /FLUSH_DELAY_MS/);
    assert.match(html, /timeline-panel/);
    assert.match(html, /history-banner/);
    assert.match(html, /undo-btn/);
    assert.match(html, /canvas-lib/);
    assert.match(html, /EventSource/);
    assert.match(html, /groupResize/);
    assert.match(html, /canvas\.undo/);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    assert(scripts.length > 0, "expected generated canvas scripts");
    for (const script of scripts) {
      assert.doesNotThrow(() => new Function(script));
    }
  } finally {
    await server.close();
  }
});

test("canvas routes are themselves witnessed as route things", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const witnesses = world.allWitnesses();
    const routePaths = witnesses.filter(w => w.process === "defineRoute").map(w => w.body.path);
    assert(routePaths.includes("/canvas"));
    assert(routePaths.includes("/api/canvas/process"));
  } finally {
    await server.close();
  }
});

test("end-to-end: perspective, things, placement, move, and relation over HTTP", async () => {
  const { server } = await startCanvasServer();
  try {
    const created = await postProcess(server, "canvas.perspective.create", { title: "Aaron Workspace" });
    assert.equal(created.status, 200);
    const perspective = (await created.json()).witness.body.id;

    const perspectives = await fetch(`${server.url}/api/canvas/perspectives`).then(r => r.json());
    assert(perspectives.perspectives.some(p => p.id === perspective && p.title === "Aaron Workspace"));

    const first = await postProcess(server, "canvas.createThing", { perspective, name: "Customer", x: 100, y: 100 }).then(r => r.json());
    const second = await postProcess(server, "canvas.createThing", { perspective, name: "Proposal", x: 400, y: 220 }).then(r => r.json());

    const moved = await postProcess(server, "canvas.move", { perspective, instance: first.witness.body.instance, x: 150, y: 175 });
    assert.equal(moved.status, 200);

    const related = await postProcess(server, "canvas.relate", { from: first.witness.body.thing, rel: "references", to: second.witness.body.thing, perspective });
    assert.equal(related.status, 200);

    const canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.length, 2);
    const customer = canvas.instances.find(i => i.label === "Customer");
    assert.equal(customer.x, 150);
    assert.equal(customer.y, 175);
    assert.equal(canvas.connectors.length, 1);
    assert.equal(canvas.connectors[0].rel, "references");
  } finally {
    await server.close();
  }
});

test("placing the same thing twice over HTTP yields two instances", async () => {
  const { server } = await startCanvasServer();
  try {
    const created = await postProcess(server, "canvas.perspective.create", { title: "Dupes" }).then(r => r.json());
    const perspective = created.witness.body.id;
    const thing = (await postProcess(server, "canvas.createThing", { perspective, name: "Customer", x: 0, y: 0 }).then(r => r.json())).witness.body.thing;
    const again = await postProcess(server, "canvas.place", { perspective, thing, x: 300, y: 300 });
    assert.equal(again.status, 200);
    const canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.length, 2);
    assert.equal(canvas.availableThings.find(t => t.id === thing).placed, 2);
  } finally {
    await server.close();
  }
});

test("moveMany over HTTP is atomic: happy path moves both, bad instance moves neither", async () => {
  const { server } = await startCanvasServer();
  try {
    const perspective = (await postProcess(server, "canvas.perspective.create", { title: "Batch" }).then(r => r.json())).witness.body.id;
    const a = (await postProcess(server, "canvas.createThing", { perspective, name: "A", x: 0, y: 0 }).then(r => r.json())).witness.body.instance;
    const b = (await postProcess(server, "canvas.createThing", { perspective, name: "B", x: 50, y: 50 }).then(r => r.json())).witness.body.instance;

    const ok = await postProcess(server, "canvas.moveMany", { perspective, moves: [{ instance: a, x: 100, y: 100 }, { instance: b, x: 200, y: 200 }] });
    assert.equal(ok.status, 200);

    const bad = await postProcess(server, "canvas.moveMany", { perspective, moves: [{ instance: a, x: 900, y: 900 }, { instance: "ghost", x: 1, y: 1 }] });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).witness.process, "canvas.moveMany.failed");

    const canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.find(i => i.id === a).x, 100);
    assert.equal(canvas.instances.find(i => i.id === b).y, 200);
  } finally {
    await server.close();
  }
});

test("removeMany and duplicate work end-to-end over HTTP", async () => {
  const { server } = await startCanvasServer();
  try {
    const perspective = (await postProcess(server, "canvas.perspective.create", { title: "Ops" }).then(r => r.json())).witness.body.id;
    const a = (await postProcess(server, "canvas.createThing", { perspective, name: "A", x: 0, y: 0 }).then(r => r.json())).witness.body.instance;
    const b = (await postProcess(server, "canvas.createThing", { perspective, name: "B", x: 50, y: 50 }).then(r => r.json())).witness.body.instance;

    const clone = await postProcess(server, "canvas.duplicate", { perspective, instance: a, x: 240, y: 260 }).then(r => r.json());
    assert.equal(clone.witness.body.x, 240);

    const removed = await postProcess(server, "canvas.removeMany", { perspective, instances: [a, b] });
    assert.equal(removed.status, 200);

    const canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.deepEqual(canvas.instances.map(i => i.id), [clone.witness.body.instance]);
  } finally {
    await server.close();
  }
});

test("canvas.batch applies moves, style, camera, and grid in exactly one witness over HTTP", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const perspective = (await postProcess(server, "canvas.perspective.create", { title: "Outbox" }).then(r => r.json())).witness.body.id;
    const a = (await postProcess(server, "canvas.createThing", { perspective, name: "A", x: 0, y: 0 }).then(r => r.json())).witness.body.instance;
    const b = (await postProcess(server, "canvas.createThing", { perspective, name: "B", x: 50, y: 50 }).then(r => r.json())).witness.body.instance;

    const countBefore = world.allWitnesses().length;
    const response = await postProcess(server, "canvas.batch", {
      perspective,
      moves: [{ instance: a, x: 100, y: 110 }, { instance: b, x: 200, y: 210 }],
      styles: [{ instance: a, style: { color: "#ffcc00" } }],
      camera: { x: 5, y: 6, zoom: 2 },
      grid: { snap: true, size: 20 }
    });
    assert.equal(response.status, 200);
    assert.equal(world.allWitnesses().length, countBefore + 1);

    const canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.find(i => i.id === a).x, 100);
    assert.equal(canvas.instances.find(i => i.id === b).y, 210);
    assert.equal(canvas.instances.find(i => i.id === a).style.color, "#ffcc00");
    assert.deepEqual(canvas.perspective.camera, { x: 5, y: 6, zoom: 2 });
    assert.deepEqual(canvas.perspective.grid, { snap: true, size: 20 });
  } finally {
    await server.close();
  }
});

test("canvas.batch with a ghost instance applies nothing", async () => {
  const { server } = await startCanvasServer();
  try {
    const perspective = (await postProcess(server, "canvas.perspective.create", { title: "Atomic" }).then(r => r.json())).witness.body.id;
    const a = (await postProcess(server, "canvas.createThing", { perspective, name: "A", x: 0, y: 0 }).then(r => r.json())).witness.body.instance;

    const response = await postProcess(server, "canvas.batch", {
      perspective,
      moves: [{ instance: a, x: 900, y: 900 }, { instance: "ghost", x: 1, y: 1 }],
      camera: { x: 50, y: 50, zoom: 3 }
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).witness.process, "canvas.batch.failed");

    const canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.find(i => i.id === a).x, 0);
    assert.equal(canvas.perspective.camera, null);
  } finally {
    await server.close();
  }
});

test("undo and redo work over HTTP; empty stack is a 400 with the failure witness", async () => {
  const { server } = await startCanvasServer();
  try {
    const perspective = (await postProcess(server, "canvas.perspective.create", { title: "History" }).then(r => r.json())).witness.body.id;

    const empty = await postProcess(server, "canvas.undo", { perspective });
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).witness.process, "canvas.undo.failed");

    const a = (await postProcess(server, "canvas.createThing", { perspective, name: "A", x: 10, y: 10 }).then(r => r.json())).witness.body.instance;
    const moved = await postProcess(server, "canvas.move", { perspective, instance: a, x: 300, y: 300 });
    assert.equal(moved.status, 200);

    const undone = await postProcess(server, "canvas.undo", { perspective });
    assert.equal(undone.status, 200);
    let canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.find(i => i.id === a).x, 10);

    const redone = await postProcess(server, "canvas.redo", { perspective });
    assert.equal(redone.status, 200);
    canvas = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.equal(canvas.instances.find(i => i.id === a).x, 300);
  } finally {
    await server.close();
  }
});

test("canvas-lib serves the real projection modules and rejects unknown names", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const projection = await fetch(`${server.url}/canvas-lib/canvas-projection.js`);
    assert.equal(projection.status, 200);
    assert.match(projection.headers.get("content-type"), /text\/javascript/);
    assert.match(await projection.text(), /from "\.\/projectors-core\.js"/);

    const core = await fetch(`${server.url}/canvas-lib/projectors-core.js`);
    assert.equal(core.status, 200);
    assert.match(await core.text(), /currentRelations/);

    assert.equal((await fetch(`${server.url}/canvas-lib/kernel.js`)).status, 404);
    assert.equal((await fetch(`${server.url}/canvas-lib/..%2Fpackage.json`)).status, 404);
    assert(world.allObservations().some(w => w.process === "backend.readCanvasLib"));
  } finally {
    await server.close();
  }
});

test("witness offset fetches return the tail and are not themselves witnessed", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const full = await fetch(`${server.url}/api/witnesses`, { headers: asAaron }).then(r => r.json());
    assert(full.total > 0);

    const readsBefore = world.allObservations().filter(w => w.process === "backend.readWitnesses").length;
    const offset = full.total - 2;
    const tail = await fetch(`${server.url}/api/witnesses?offset=${offset}`, { headers: asAaron }).then(r => r.json());
    assert.equal(tail.offset, offset);
    assert(tail.witnesses.length >= 2);
    assert.equal(tail.witnesses.length, tail.total - offset);
    const readsAfter = world.allObservations().filter(w => w.process === "backend.readWitnesses").length;
    assert.equal(readsAfter, readsBefore);
  } finally {
    await server.close();
  }
});

test("SSE stream signals witness growth and the server still closes cleanly", async () => {
  const { server } = await startCanvasServer();
  const controller = new AbortController();
  try {
    const response = await fetch(`${server.url}/api/events`, { headers: asAaron, signal: controller.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let received = "";
    const readFrame = async () => {
      while (!received.includes("\n\n")) {
        const { value, done } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
      }
      const frame = received.slice(0, received.indexOf("\n\n"));
      received = received.slice(received.indexOf("\n\n") + 2);
      return frame;
    };

    const initial = await readFrame();
    assert.match(initial, /data: \{"count":\d+\}/);

    await postProcess(server, "canvas.perspective.create", { title: "Streamed" });
    const update = await readFrame();
    assert.match(update, /data: \{"count":\d+\}/);

    controller.abort();
  } catch (err) {
    if (err?.name !== "AbortError") throw err;
  } finally {
    await server.close();
  }
});

test("client projection module output matches the server canvas API", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const perspective = (await postProcess(server, "canvas.perspective.create", { title: "Parity" }).then(r => r.json())).witness.body.id;
    const a = (await postProcess(server, "canvas.createThing", { perspective, name: "A", x: 10, y: 10 }).then(r => r.json())).witness.body;
    const b = (await postProcess(server, "canvas.createThing", { perspective, name: "B", x: 200, y: 200 }).then(r => r.json())).witness.body;
    await postProcess(server, "canvas.relate", { from: a.thing, rel: "references", to: b.thing, perspective });

    const served = await fetch(`${server.url}/canvas-lib/canvas-projection.js`).then(r => r.text());
    assert(served.length > 0);
    const { canvasProjection } = await import("../src/canvas-projection.js");
    const { publicWitnessesFor } = await import("../src/projections.js");
    const local = canvasProjection(publicWitnessesFor(world.allWitnesses(), "aaron"), perspective);

    const api = (await fetch(`${server.url}/api/canvas?perspective=${encodeURIComponent(perspective)}`, { headers: asAaron }).then(r => r.json())).canvas;
    assert.deepEqual(local, api);
  } finally {
    await server.close();
  }
});

test("canvas process without an actor is rejected with a failure witness", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const response = await postProcess(server, "canvas.perspective.create", { title: "Nope" }, { "content-type": "application/json" });
    assert.equal(response.status, 401);
    assert(world.allWitnesses().some(w => w.process === "canvas.process.failed" && w.body.reason === "no actor"));
  } finally {
    await server.close();
  }
});

test("unknown canvas process is rejected with a failure witness", async () => {
  const { world, server } = await startCanvasServer();
  try {
    const response = await postProcess(server, "canvas.hack", {});
    assert.equal(response.status, 400);
    assert((await response.json()).error, "unknown canvas process");
    assert(world.allWitnesses().some(w => w.process === "canvas.process.failed" && w.body.process === "canvas.hack"));
  } finally {
    await server.close();
  }
});

test("rejected canvas processes surface their witness over HTTP", async () => {
  const { server } = await startCanvasServer();
  try {
    const response = await postProcess(server, "canvas.move", { perspective: "nope", instance: "missing", x: 1, y: 2 });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.witness.process, "canvas.move.failed");
  } finally {
    await server.close();
  }
});

test("unknown perspective on GET /api/canvas returns 404", async () => {
  const { server } = await startCanvasServer();
  try {
    const response = await fetch(`${server.url}/api/canvas?perspective=ghost`);
    assert.equal(response.status, 404);
  } finally {
    await server.close();
  }
});
