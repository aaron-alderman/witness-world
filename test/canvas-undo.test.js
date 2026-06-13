import assert from "node:assert/strict";
import test from "node:test";
import { createWorld, createThing, projectors } from "../src/kernel.js";
import {
  createPerspective,
  placeThing,
  moveInstance,
  removeInstance,
  setThingTitle,
  batchApply,
  relateThings,
  unrelateThings
} from "../plugins/canvas/canvas-processes.js";
import { compensationClaims, undoState } from "../plugins/canvas/canvas-undo.js";

function worldWithPlacement() {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "customer" });
  createThing(world, { actor: "aaron", id: "proposal" });
  const perspective = createPerspective(world, { actor: "aaron", title: "Workspace" }).body.id;
  const instance = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 10, y: 20 }).body.instance;
  return { world, perspective, instance };
}

test("compensating a move re-emits the prior geometry", () => {
  const { world, perspective, instance } = worldWithPlacement();
  const move = moveInstance(world, { actor: "aaron", perspective, instance, x: 300, y: 400 });
  const claims = compensationClaims(world.allWitnesses(), move);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].op, "relation");
  assert.equal(claims[0].rel, "hasGeometry");
  assert.equal(claims[0].meta.x, 10);
  assert.equal(claims[0].meta.y, 20);
});

test("compensating a placement retracts its relations but the things survive", () => {
  const { world, perspective } = worldWithPlacement();
  const place = placeThing(world, { actor: "aaron", perspective, thing: "proposal", x: 1, y: 2 });
  const claims = compensationClaims(world.allWitnesses(), place);
  assert(claims.every(c => c.op === "retract"));
  assert(claims.some(c => c.rel === "contains"));
  assert(claims.some(c => c.rel === "proxies"));
  world.emit({ process: "canvas.undo", actor: "aaron", claims, body: { perspective, undoes: place.id } });
  assert.equal(
    world.project(projectors.currentRelations).some(r => r.rel === "contains" && r.to === place.body.instance),
    false
  );
  assert(world.project(projectors.things).has("proposal"));
});

test("compensating a removal re-emits the contains relation", () => {
  const { world, perspective, instance } = worldWithPlacement();
  const removal = removeInstance(world, { actor: "aaron", perspective, instance });
  const claims = compensationClaims(world.allWitnesses(), removal);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].op, "relation");
  assert.equal(claims[0].rel, "contains");
  assert.equal(claims[0].to, instance);
});

test("compensating setTitle retracts the new title and re-emits the old (two-claim shape)", () => {
  const { world } = worldWithPlacement();
  setThingTitle(world, { actor: "aaron", thing: "customer", title: "Customer" });
  const rename = setThingTitle(world, { actor: "aaron", thing: "customer", title: "Big Customer" });
  const claims = compensationClaims(world.allWitnesses(), rename);
  assert(claims.some(c => c.op === "retract" && c.to === "Big Customer"));
  assert(claims.some(c => c.op === "relation" && c.to === "Customer"));
});

test("compensating a batch restores geometry/style and retracts camera claimed for the first time", () => {
  const { world, perspective, instance } = worldWithPlacement();
  const batch = batchApply(world, {
    actor: "aaron",
    perspective,
    moves: [{ instance, x: 500, y: 600 }],
    styles: [{ instance, style: { color: "#ffcc00" } }],
    camera: { x: 9, y: 9, zoom: 2 }
  });
  const claims = compensationClaims(world.allWitnesses(), batch);
  const geometry = claims.find(c => c.rel === "hasGeometry");
  assert.equal(geometry.op, "relation");
  assert.equal(geometry.meta.x, 10);
  const style = claims.find(c => c.rel === "hasStyle");
  assert.equal(style.op, "retract");
  const camera = claims.find(c => c.rel === "hasCamera");
  assert.equal(camera.op, "retract");
});

test("compensating relate retracts; compensating unrelate re-emits", () => {
  const { world, perspective } = worldWithPlacement();
  const related = relateThings(world, { actor: "aaron", from: "customer", rel: "references", to: "proposal", perspective });
  let claims = compensationClaims(world.allWitnesses(), related);
  assert.deepEqual(claims.map(c => c.op), ["retract"]);

  const unrelated = unrelateThings(world, { actor: "aaron", from: "customer", rel: "references", to: "proposal", perspective });
  claims = compensationClaims(world.allWitnesses(), unrelated);
  assert.equal(claims[0].op, "relation");
  assert.equal(claims[0].rel, "references");
});

test("an identical re-emitted relation produces no compensation", () => {
  const { world, perspective, instance } = worldWithPlacement();
  const noop = moveInstance(world, { actor: "aaron", perspective, instance, x: 10, y: 20 });
  assert.deepEqual(compensationClaims(world.allWitnesses(), noop), []);
});

test("a triple claimed twice in one witness is compensated once, last claim wins", () => {
  const { world } = worldWithPlacement();
  const w = world.emit({
    process: "canvas.test",
    actor: "aaron",
    claims: [
      { op: "relation", from: "a", rel: "marks", to: "b", meta: { v: 1 } },
      { op: "relation", from: "a", rel: "marks", to: "b", meta: { v: 2 } }
    ],
    body: {}
  });
  const claims = compensationClaims(world.allWitnesses(), w);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].op, "retract");
});

test("undoState pushes actions, pops on undo, and redo restores the chain", () => {
  const { world, perspective, instance } = worldWithPlacement();
  const move1 = moveInstance(world, { actor: "aaron", perspective, instance, x: 100, y: 100 });
  const move2 = moveInstance(world, { actor: "aaron", perspective, instance, x: 200, y: 200 });

  let state = undoState(world.allWitnesses(), "aaron", perspective);
  assert.equal(state.undoTarget.id, move2.id);
  assert.equal(state.redoTarget, null);

  const undo = world.emit({ process: "canvas.undo", actor: "aaron", claims: compensationClaims(world.allWitnesses(), move2), body: { perspective, undoes: move2.id } });
  state = undoState(world.allWitnesses(), "aaron", perspective);
  assert.equal(state.undoTarget.id, move1.id);
  assert.equal(state.redoTarget.id, undo.id);

  const redo = world.emit({ process: "canvas.redo", actor: "aaron", claims: compensationClaims(world.allWitnesses(), undo), body: { perspective, redoes: undo.id } });
  state = undoState(world.allWitnesses(), "aaron", perspective);
  assert.equal(state.undoTarget.id, redo.id);
  assert.equal(state.redoTarget, null);
});

test("a new action clears the redo stack", () => {
  const { world, perspective, instance } = worldWithPlacement();
  const move = moveInstance(world, { actor: "aaron", perspective, instance, x: 100, y: 100 });
  world.emit({ process: "canvas.undo", actor: "aaron", claims: compensationClaims(world.allWitnesses(), move), body: { perspective, undoes: move.id } });
  moveInstance(world, { actor: "aaron", perspective, instance, x: 50, y: 50 });
  const state = undoState(world.allWitnesses(), "aaron", perspective);
  assert.equal(state.redoTarget, null);
});

test("undoState skips foreign actors, other perspectives, failures, and legacy witnesses without perspective", () => {
  const { world, perspective, instance } = worldWithPlacement();
  const mine = moveInstance(world, { actor: "aaron", perspective, instance, x: 100, y: 100 });

  world.emit({ process: "delegateStewardship", actor: "aaron", claims: [{ op: "relation", from: "callan", rel: "stewards", to: perspective, meta: {} }], body: {} });
  moveInstance(world, { actor: "callan", perspective, instance, x: 1, y: 1 });
  moveInstance(world, { actor: "aaron", perspective: "nope", instance, x: 2, y: 2 });
  setThingTitle(world, { actor: "aaron", thing: "customer", title: "Legacy rename without perspective" });

  const state = undoState(world.allWitnesses(), "aaron", perspective);
  assert.equal(state.undoTarget.id, mine.id);
});

test("undo across reload: the stack derives from the log alone", () => {
  const { world, perspective, instance } = worldWithPlacement();
  const move = moveInstance(world, { actor: "aaron", perspective, instance, x: 100, y: 100 });
  const replayed = world.fork();
  const state = undoState(replayed.allWitnesses(), "aaron", perspective);
  assert.equal(state.undoTarget.id, move.id);
});
