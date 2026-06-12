import assert from "node:assert/strict";
import test from "node:test";
import { createWorld, createThing, relation, projectors } from "../src/kernel.js";
import {
  createPerspective,
  placeThing,
  moveInstance,
  moveManyInstances,
  styleInstance,
  removeInstance,
  removeManyInstances,
  duplicateInstance,
  createThingOnCanvas,
  relateThings,
  unrelateThings,
  setThingTitle,
  setCamera,
  setGrid,
  batchApply,
  undoLastAction,
  redoLastUndo,
  canvasProcessHandlers
} from "../src/canvas-processes.js";
import { canvasProjection } from "../src/canvas-projection.js";

function worldWithPerspective() {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "customer" });
  const perspective = createPerspective(world, { actor: "aaron", title: "Aaron Workspace" }).body.id;
  return { world, perspective };
}

test("createPerspective emits a witnessed perspective thing owned by the actor", () => {
  const world = createWorld();
  const w = createPerspective(world, { actor: "aaron", title: "Sales View" });
  assert.equal(w.process, "canvas.perspective.create");
  const id = w.body.id;
  assert(world.project(projectors.things).has(id));
  assert.equal(world.project(projectors.owners).get(id), "aaron");
  const rels = world.project(projectors.currentRelations);
  assert(rels.some(r => r.from === id && r.rel === "hasModuleKind" && r.to === "perspective"));
  assert(rels.some(r => r.from === id && r.rel === "hasTitle" && r.to === "Sales View"));
});

test("createPerspective without a title is blocked", () => {
  const world = createWorld();
  const w = createPerspective(world, { actor: "aaron", title: "  " });
  assert.equal(w.process, "canvas.perspective.create.blocked");
});

test("placeThing creates a projection instance proxying the thing, positioned in the perspective", () => {
  const { world, perspective } = worldWithPerspective();
  const w = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 120, y: 80 });
  assert.equal(w.process, "canvas.place");
  const rels = world.project(projectors.currentRelations);
  const instance = w.body.instance;
  assert(rels.some(r => r.from === instance && r.rel === "proxies" && r.to === "customer"));
  assert(rels.some(r => r.from === perspective && r.rel === "contains" && r.to === instance));
  const geometry = rels.find(r => r.from === instance && r.rel === "hasGeometry");
  assert.deepEqual(geometry.meta, { x: 120, y: 80, w: 160, h: 56 });
  // the position lives on the proxy, never on the thing itself
  assert.equal(rels.some(r => r.from === "customer" && r.rel === "hasGeometry"), false);
});

test("placeThing fails for unknown perspective or unknown thing", () => {
  const { world, perspective } = worldWithPerspective();
  assert.equal(placeThing(world, { actor: "aaron", perspective: "nope", thing: "customer" }).process, "canvas.place.failed");
  assert.equal(placeThing(world, { actor: "aaron", perspective, thing: "nope" }).process, "canvas.place.failed");
});

test("two moves: latest geometry wins via currentRelations", () => {
  const { world, perspective } = worldWithPerspective();
  const instance = placeThing(world, { actor: "aaron", perspective, thing: "customer" }).body.instance;
  moveInstance(world, { actor: "aaron", perspective, instance, x: 10, y: 20 });
  moveInstance(world, { actor: "aaron", perspective, instance, x: 300, y: 400 });
  const geometry = world
    .project(projectors.currentRelations)
    .find(r => r.from === instance && r.rel === "hasGeometry");
  assert.equal(geometry.meta.x, 300);
  assert.equal(geometry.meta.y, 400);
  assert.equal(geometry.meta.w, 160);
});

test("moving an instance in a foreign perspective fails; a steward succeeds", () => {
  const { world, perspective } = worldWithPerspective();
  const instance = placeThing(world, { actor: "aaron", perspective, thing: "customer" }).body.instance;

  const failure = moveInstance(world, { actor: "callan", perspective, instance, x: 1, y: 2 });
  assert.equal(failure.process, "canvas.move.failed");

  world.emit({ process: "delegateStewardship", actor: "aaron", claims: [relation("callan", "stewards", perspective)], body: {} });
  const success = moveInstance(world, { actor: "callan", perspective, instance, x: 1, y: 2 });
  assert.equal(success.process, "canvas.move");
});

test("styleInstance keeps only whitelisted style keys", () => {
  const { world, perspective } = worldWithPerspective();
  const instance = placeThing(world, { actor: "aaron", perspective, thing: "customer" }).body.instance;
  const w = styleInstance(world, { actor: "aaron", perspective, instance, style: { color: "#ffcc00", evil: "alert(1)" } });
  assert.deepEqual(w.body.style, { color: "#ffcc00" });
});

test("removeInstance retracts containment but the things remain", () => {
  const { world, perspective } = worldWithPerspective();
  const instance = placeThing(world, { actor: "aaron", perspective, thing: "customer" }).body.instance;
  const w = removeInstance(world, { actor: "aaron", perspective, instance });
  assert.equal(w.process, "canvas.remove");
  const rels = world.project(projectors.currentRelations);
  assert.equal(rels.some(r => r.from === perspective && r.rel === "contains" && r.to === instance), false);
  assert(world.project(projectors.things).has(instance));
  assert(world.project(projectors.things).has("customer"));
});

test("createThingOnCanvas creates a titled reality thing and places it atomically", () => {
  const { world, perspective } = worldWithPerspective();
  const w = createThingOnCanvas(world, { actor: "aaron", perspective, name: "Proposal", x: 50, y: 60 });
  assert.equal(w.process, "canvas.createThing");
  const rels = world.project(projectors.currentRelations);
  assert(rels.some(r => r.from === w.body.thing && r.rel === "hasTitle" && r.to === "Proposal"));
  assert(rels.some(r => r.from === w.body.instance && r.rel === "proxies" && r.to === w.body.thing));
  assert.equal(world.project(projectors.owners).get(w.body.thing), "aaron");
});

test("relateThings records a reality relation between things; unrelate retracts it", () => {
  const { world, perspective } = worldWithPerspective();
  createThing(world, { actor: "aaron", id: "todoStore2" });
  const w = relateThings(world, { actor: "aaron", from: "customer", rel: "references", to: "todoStore2", perspective });
  assert.equal(w.process, "canvas.relate");
  assert(world.project(projectors.currentRelations).some(r => r.from === "customer" && r.rel === "references" && r.to === "todoStore2"));

  const u = unrelateThings(world, { actor: "aaron", from: "customer", rel: "references", to: "todoStore2" });
  assert.equal(u.process, "canvas.unrelate");
  assert.equal(world.project(projectors.currentRelations).some(r => r.rel === "references"), false);

  const again = unrelateThings(world, { actor: "aaron", from: "customer", rel: "references", to: "todoStore2" });
  assert.equal(again.process, "canvas.unrelate.failed");
});

test("relateThings fails on unknown things", () => {
  const { world } = worldWithPerspective();
  assert.equal(relateThings(world, { actor: "aaron", from: "customer", rel: "references", to: "ghost" }).process, "canvas.relate.failed");
});

test("setThingTitle re-emits hasTitle and latest wins", () => {
  const { world } = worldWithPerspective();
  setThingTitle(world, { actor: "aaron", thing: "customer", title: "Customer" });
  setThingTitle(world, { actor: "aaron", thing: "customer", title: "Big Customer" });
  const title = world.project(projectors.currentRelations).find(r => r.from === "customer" && r.rel === "hasTitle");
  assert.equal(title.to, "Big Customer");
});

test("setCamera clamps zoom and latest camera wins", () => {
  const { world, perspective } = worldWithPerspective();
  setCamera(world, { actor: "aaron", perspective, x: 5, y: 6, zoom: 99 });
  setCamera(world, { actor: "aaron", perspective, x: 7, y: 8, zoom: 2 });
  const camera = canvasProjection(world.allWitnesses(), perspective).perspective.camera;
  assert.deepEqual(camera, { x: 7, y: 8, zoom: 2 });
});

test("every exported canvas and asset process is reachable through the handler map", () => {
  const expected = [
    "canvas.perspective.create",
    "canvas.place",
    "canvas.move",
    "canvas.moveMany",
    "canvas.style",
    "canvas.remove",
    "canvas.removeMany",
    "canvas.duplicate",
    "canvas.createThing",
    "canvas.relate",
    "canvas.unrelate",
    "canvas.thing.setTitle",
    "asset.attach",
    "asset.detach",
    "canvas.camera",
    "canvas.grid",
    "canvas.batch",
    "canvas.undo",
    "canvas.redo"
  ];
  assert.deepEqual(Object.keys(canvasProcessHandlers).sort(), expected.sort());
  for (const handler of Object.values(canvasProcessHandlers)) assert.equal(typeof handler, "function");
});

test("placing the same thing twice yields distinct instances, both contained", () => {
  const { world, perspective } = worldWithPerspective();
  const first = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 10, y: 10 }).body.instance;
  const second = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 300, y: 300 }).body.instance;
  assert.notEqual(first, second);
  const rels = world.project(projectors.currentRelations);
  assert(rels.some(r => r.from === perspective && r.rel === "contains" && r.to === first));
  assert(rels.some(r => r.from === perspective && r.rel === "contains" && r.to === second));
});

test("moveMany emits one witness with one geometry claim per instance", () => {
  const { world, perspective } = worldWithPerspective();
  createThing(world, { actor: "aaron", id: "proposal" });
  const a = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 0, y: 0 }).body.instance;
  const b = placeThing(world, { actor: "aaron", perspective, thing: "proposal", x: 0, y: 0 }).body.instance;
  const w = moveManyInstances(world, { actor: "aaron", perspective, moves: [{ instance: a, x: 100, y: 110 }, { instance: b, x: 200, y: 210 }] });
  assert.equal(w.process, "canvas.moveMany");
  assert.equal(w.claims.length, 2);
  assert(w.claims.every(c => c.rel === "hasGeometry"));
  const rels = world.project(projectors.currentRelations);
  assert.equal(rels.find(r => r.from === a && r.rel === "hasGeometry").meta.x, 100);
  assert.equal(rels.find(r => r.from === b && r.rel === "hasGeometry").meta.y, 210);
});

test("moveMany is all-or-nothing when any instance is invalid", () => {
  const { world, perspective } = worldWithPerspective();
  const a = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 5, y: 5 }).body.instance;
  const w = moveManyInstances(world, { actor: "aaron", perspective, moves: [{ instance: a, x: 999, y: 999 }, { instance: "ghost", x: 1, y: 1 }] });
  assert.equal(w.process, "canvas.moveMany.failed");
  assert.deepEqual(w.body.invalid, ["ghost"]);
  const geometry = world.project(projectors.currentRelations).find(r => r.from === a && r.rel === "hasGeometry");
  assert.equal(geometry.meta.x, 5);
});

test("moveMany rejects empty or malformed moves and missing actor", () => {
  const { world, perspective } = worldWithPerspective();
  assert.equal(moveManyInstances(world, { actor: "aaron", perspective, moves: [] }).process, "canvas.moveMany.failed");
  assert.equal(moveManyInstances(world, { actor: "aaron", perspective, moves: [{}] }).process, "canvas.moveMany.failed");
  assert.equal(moveManyInstances(world, { actor: "", perspective, moves: [{ instance: "x" }] }).process, "canvas.moveMany.blocked");
});

test("removeMany retracts all containments in one witness; things remain", () => {
  const { world, perspective } = worldWithPerspective();
  createThing(world, { actor: "aaron", id: "proposal" });
  const a = placeThing(world, { actor: "aaron", perspective, thing: "customer" }).body.instance;
  const b = placeThing(world, { actor: "aaron", perspective, thing: "proposal" }).body.instance;
  const w = removeManyInstances(world, { actor: "aaron", perspective, instances: [a, b, a] });
  assert.equal(w.process, "canvas.removeMany");
  assert.equal(w.claims.length, 2);
  const rels = world.project(projectors.currentRelations);
  assert.equal(rels.some(r => r.from === perspective && r.rel === "contains"), false);
  assert(world.project(projectors.things).has("customer"));
});

test("removeMany is all-or-nothing on an unknown instance", () => {
  const { world, perspective } = worldWithPerspective();
  const a = placeThing(world, { actor: "aaron", perspective, thing: "customer" }).body.instance;
  const w = removeManyInstances(world, { actor: "aaron", perspective, instances: [a, "ghost"] });
  assert.equal(w.process, "canvas.removeMany.failed");
  assert(world.project(projectors.currentRelations).some(r => r.from === perspective && r.rel === "contains" && r.to === a));
});

test("duplicate clones geometry offset by 24 and copies style in one witness", () => {
  const { world, perspective } = worldWithPerspective();
  const a = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 100, y: 100 }).body.instance;
  styleInstance(world, { actor: "aaron", perspective, instance: a, style: { color: "#ffe08a" } });
  const w = duplicateInstance(world, { actor: "aaron", perspective, instance: a });
  assert.equal(w.process, "canvas.duplicate");
  assert.notEqual(w.body.instance, a);
  assert.equal(w.body.thing, "customer");
  assert.equal(w.body.x, 124);
  assert.equal(w.body.y, 124);
  const rels = world.project(projectors.currentRelations);
  assert(rels.some(r => r.from === w.body.instance && r.rel === "proxies" && r.to === "customer"));
  assert.deepEqual(rels.find(r => r.from === w.body.instance && r.rel === "hasStyle").meta, { color: "#ffe08a" });
});

test("duplicate honors explicit coordinates and fails on unknown source or foreign actor", () => {
  const { world, perspective } = worldWithPerspective();
  const a = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 10, y: 10 }).body.instance;
  const w = duplicateInstance(world, { actor: "aaron", perspective, instance: a, x: 500, y: 600 });
  assert.equal(w.body.x, 500);
  assert.equal(w.body.y, 600);
  assert.equal(duplicateInstance(world, { actor: "aaron", perspective, instance: "ghost" }).process, "canvas.duplicate.failed");
  assert.equal(duplicateInstance(world, { actor: "callan", perspective, instance: a }).process, "canvas.duplicate.failed");
});

test("setGrid witnesses snap state with clamped size; latest wins", () => {
  const { world, perspective } = worldWithPerspective();
  setGrid(world, { actor: "aaron", perspective, snap: true, size: 9999 });
  setGrid(world, { actor: "aaron", perspective, snap: true, size: 20 });
  const grid = world.project(projectors.currentRelations).find(r => r.from === perspective && r.rel === "hasGrid");
  assert.deepEqual(grid.meta, { snap: true, size: 20 });
  assert.equal(setGrid(world, { actor: "aaron", perspective: "nope", snap: true }).process, "canvas.grid.failed");
  assert.equal(setGrid(world, { actor: "callan", perspective, snap: true }).process, "canvas.grid.failed");
});

test("batch applies moves, styles, camera, and grid in one witness", () => {
  const { world, perspective } = worldWithPerspective();
  createThing(world, { actor: "aaron", id: "proposal" });
  const a = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 0, y: 0 }).body.instance;
  const b = placeThing(world, { actor: "aaron", perspective, thing: "proposal", x: 0, y: 0 }).body.instance;
  const w = batchApply(world, {
    actor: "aaron",
    perspective,
    moves: [{ instance: a, x: 100, y: 110 }, { instance: b, x: 200, y: 210 }],
    styles: [{ instance: a, style: { color: "#ffcc00" } }],
    camera: { x: 5, y: 6, zoom: 2 },
    grid: { snap: true, size: 20 }
  });
  assert.equal(w.process, "canvas.batch");
  assert.equal(w.claims.length, 5);
  const rels = world.project(projectors.currentRelations);
  assert.equal(rels.find(r => r.from === a && r.rel === "hasGeometry").meta.x, 100);
  assert.equal(rels.find(r => r.from === b && r.rel === "hasGeometry").meta.y, 210);
  assert.deepEqual(rels.find(r => r.from === a && r.rel === "hasStyle").meta, { color: "#ffcc00" });
  assert.deepEqual(rels.find(r => r.from === perspective && r.rel === "hasCamera").meta, { x: 5, y: 6, zoom: 2 });
  assert.deepEqual(rels.find(r => r.from === perspective && r.rel === "hasGrid").meta, { snap: true, size: 20 });
});

test("batch is all-or-nothing: a ghost instance in moves fails everything including camera", () => {
  const { world, perspective } = worldWithPerspective();
  const a = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 5, y: 5 }).body.instance;
  const w = batchApply(world, {
    actor: "aaron",
    perspective,
    moves: [{ instance: a, x: 900, y: 900 }, { instance: "ghost", x: 1, y: 1 }],
    camera: { x: 50, y: 50, zoom: 3 }
  });
  assert.equal(w.process, "canvas.batch.failed");
  assert.deepEqual(w.body.invalid, ["ghost"]);
  const rels = world.project(projectors.currentRelations);
  assert.equal(rels.find(r => r.from === a && r.rel === "hasGeometry").meta.x, 5);
  assert.equal(rels.some(r => r.from === perspective && r.rel === "hasCamera"), false);
});

test("batch fails on a ghost instance in styles too", () => {
  const { world, perspective } = worldWithPerspective();
  placeThing(world, { actor: "aaron", perspective, thing: "customer" });
  const w = batchApply(world, { actor: "aaron", perspective, styles: [{ instance: "ghost", style: { color: "#fff" } }] });
  assert.equal(w.process, "canvas.batch.failed");
  assert.deepEqual(w.body.invalid, ["ghost"]);
});

test("empty and malformed batches fail; missing actor is blocked", () => {
  const { world, perspective } = worldWithPerspective();
  assert.equal(batchApply(world, { actor: "aaron", perspective }).process, "canvas.batch.failed");
  assert.equal(batchApply(world, { actor: "aaron", perspective, moves: [], styles: [] }).process, "canvas.batch.failed");
  assert.equal(batchApply(world, { actor: "aaron", perspective, moves: [{}] }).process, "canvas.batch.failed");
  assert.equal(batchApply(world, { actor: "aaron", perspective, camera: "nope" }).process, "canvas.batch.failed");
  assert.equal(batchApply(world, { actor: "", perspective, camera: { x: 1, y: 1, zoom: 1 } }).process, "canvas.batch.blocked");
  assert.equal(batchApply(world, { actor: "aaron", perspective: "nope", camera: {} }).process, "canvas.batch.failed");
});

test("batch dedupes moves and styles last-entry-wins per instance", () => {
  const { world, perspective } = worldWithPerspective();
  const a = placeThing(world, { actor: "aaron", perspective, thing: "customer" }).body.instance;
  const w = batchApply(world, {
    actor: "aaron",
    perspective,
    moves: [{ instance: a, x: 10, y: 10 }, { instance: a, x: 99, y: 98 }],
    styles: [{ instance: a, style: { color: "#111111" } }, { instance: a, style: { color: "#222222" } }]
  });
  assert.equal(w.claims.length, 2);
  assert.equal(w.body.moves.length, 1);
  assert.equal(w.body.moves[0].x, 99);
  assert.equal(w.body.styles[0].style.color, "#222222");
});

test("batch applies all the existing clamps and whitelists", () => {
  const { world, perspective } = worldWithPerspective();
  const a = placeThing(world, { actor: "aaron", perspective, thing: "customer" }).body.instance;
  const w = batchApply(world, {
    actor: "aaron",
    perspective,
    moves: [{ instance: a, x: 0, y: 0, w: 1, h: 1 }],
    styles: [{ instance: a, style: { color: "#abc", evil: "x" } }],
    camera: { x: 0, y: 0, zoom: 99 },
    grid: { snap: true, size: 9999 }
  });
  assert.equal(w.body.moves[0].w, 40);
  assert.equal(w.body.moves[0].h, 24);
  assert.deepEqual(w.body.styles[0].style, { color: "#abc" });
  assert.equal(w.body.camera.zoom, 4);
  assert.equal(w.body.grid.size, 400);
});

test("camera-only batch succeeds with exactly one claim; steward may batch", () => {
  const { world, perspective } = worldWithPerspective();
  const w = batchApply(world, { actor: "aaron", perspective, camera: { x: 1, y: 2, zoom: 1 } });
  assert.equal(w.process, "canvas.batch");
  assert.equal(w.claims.length, 1);

  const foreign = batchApply(world, { actor: "callan", perspective, camera: { x: 9, y: 9, zoom: 1 } });
  assert.equal(foreign.process, "canvas.batch.failed");
  world.emit({ process: "delegateStewardship", actor: "aaron", claims: [relation("callan", "stewards", perspective)], body: {} });
  const steward = batchApply(world, { actor: "callan", perspective, camera: { x: 9, y: 9, zoom: 1 } });
  assert.equal(steward.process, "canvas.batch");
});

const geometryOf = (world, instance) =>
  world.project(projectors.currentRelations).find(r => r.from === instance && r.rel === "hasGeometry").meta;

test("undo restores prior geometry; redo re-applies; new action clears redo", () => {
  const { world, perspective } = worldWithPerspective();
  const instance = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 10, y: 20 }).body.instance;
  moveInstance(world, { actor: "aaron", perspective, instance, x: 300, y: 400 });

  const undo = undoLastAction(world, { actor: "aaron", perspective });
  assert.equal(undo.process, "canvas.undo");
  assert.equal(geometryOf(world, instance).x, 10);

  const redo = redoLastUndo(world, { actor: "aaron", perspective });
  assert.equal(redo.process, "canvas.redo");
  assert.equal(geometryOf(world, instance).x, 300);

  moveInstance(world, { actor: "aaron", perspective, instance, x: 50, y: 50 });
  assert.equal(redoLastUndo(world, { actor: "aaron", perspective }).process, "canvas.redo.failed");
});

test("two undos walk back two actions", () => {
  const { world, perspective } = worldWithPerspective();
  const instance = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 10, y: 20 }).body.instance;
  moveInstance(world, { actor: "aaron", perspective, instance, x: 100, y: 100 });
  moveInstance(world, { actor: "aaron", perspective, instance, x: 200, y: 200 });

  undoLastAction(world, { actor: "aaron", perspective });
  assert.equal(geometryOf(world, instance).x, 100);
  undoLastAction(world, { actor: "aaron", perspective });
  assert.equal(geometryOf(world, instance).x, 10);
});

test("undo with nothing to undo fails; non-owner undo fails", () => {
  const { world, perspective } = worldWithPerspective();
  const empty = undoLastAction(world, { actor: "aaron", perspective });
  assert.equal(empty.process, "canvas.undo.failed");
  assert.equal(empty.body.reason, "nothing to undo");
  assert.equal(undoLastAction(world, { actor: "callan", perspective }).process, "canvas.undo.failed");
  assert.equal(undoLastAction(world, { actor: "aaron", perspective: "nope" }).process, "canvas.undo.failed");
});

test("undo of a batch restores geometry, style, camera, and grid together", () => {
  const { world, perspective } = worldWithPerspective();
  const instance = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 10, y: 20 }).body.instance;
  setCamera(world, { actor: "aaron", perspective, x: 1, y: 1, zoom: 1 });
  batchApply(world, {
    actor: "aaron",
    perspective,
    moves: [{ instance, x: 500, y: 500 }],
    styles: [{ instance, style: { color: "#ffcc00" } }],
    camera: { x: 99, y: 99, zoom: 3 },
    grid: { snap: true, size: 20 }
  });

  undoLastAction(world, { actor: "aaron", perspective });
  const rels = world.project(projectors.currentRelations);
  assert.equal(geometryOf(world, instance).x, 10);
  assert.equal(rels.some(r => r.from === instance && r.rel === "hasStyle"), false);
  assert.deepEqual(rels.find(r => r.from === perspective && r.rel === "hasCamera").meta, { x: 1, y: 1, zoom: 1 });
  assert.equal(rels.some(r => r.from === perspective && r.rel === "hasGrid"), false);
});

test("documented semantics: undo re-emits pre-target state even over a foreign later edit", () => {
  const { world, perspective } = worldWithPerspective();
  const instance = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 10, y: 20 }).body.instance;
  moveInstance(world, { actor: "aaron", perspective, instance, x: 100, y: 100 });
  world.emit({ process: "delegateStewardship", actor: "aaron", claims: [relation("callan", "stewards", perspective)], body: {} });
  moveInstance(world, { actor: "callan", perspective, instance, x: 777, y: 777 });

  undoLastAction(world, { actor: "aaron", perspective });
  assert.equal(geometryOf(world, instance).x, 10);
});

test("geometry is clamped to the minimum node size", () => {
  const { world, perspective } = worldWithPerspective();
  const a = placeThing(world, { actor: "aaron", perspective, thing: "customer" }).body.instance;
  const w = moveInstance(world, { actor: "aaron", perspective, instance: a, x: 0, y: 0, w: 1, h: 1 });
  assert.equal(w.body.w, 40);
  assert.equal(w.body.h, 24);
});
