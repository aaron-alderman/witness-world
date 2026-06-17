import assert from "node:assert/strict";
import test from "node:test";
import { createWorld, createThing, cloneThing, transferOwnership, relation, thing, canAcceptInto, projectors } from "../src/kernel.js";

test("genesis creates Adam as main", () => {
  const world = createWorld();
  assert.equal(world.project(projectors.main), "adam");
  assert.equal(world.project(projectors.owners).get("adam"), "adam");
});

test("world exposes cheap witness accessors without changing witness order", () => {
  const world = createWorld();
  const genesisCount = world.witnessCount();
  const genesisLast = world.lastWitness();
  createThing(world, { actor: "adam", id: "cheap_access_probe" });

  assert.equal(genesisCount, 1);
  assert.equal(genesisLast?.process, "genesis");
  assert.equal(world.witnessCount(), 2);
  assert.equal(world.lastWitness()?.process, "createThing");
  assert.deepEqual(
    world.witnessesSince(genesisCount).map(witness => witness.body?.id),
    ["cheap_access_probe"]
  );
});

test("Aaron, Sourcery, Widget transfer via witnessed ownership", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "sourcery" });
  createThing(world, { actor: "aaron", id: "w" });
  transferOwnership(world, { actor: "aaron", thingId: "w", from: "aaron", to: "sourcery" });

  const owners = world.project(projectors.owners);
  assert.equal(owners.get("sourcery"), "aaron");
  assert.equal(owners.get("w"), "sourcery");
});

test("Callan cannot transfer Sourcery-owned w", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "sourcery" });
  createThing(world, { actor: "aaron", id: "w" });
  transferOwnership(world, { actor: "aaron", thingId: "w", from: "aaron", to: "sourcery" });

  const failure = transferOwnership(world, { actor: "callan", thingId: "w", from: "sourcery", to: "callan" });

  assert.equal(failure.process, "transferOwnership.failed");
  assert.equal(world.project(projectors.owners).get("w"), "sourcery");
});

test("transfer ownership fails when the declared source owner is wrong", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "w" });
  const failure = transferOwnership(world, {
    actor: "aaron",
    thingId: "w",
    from: "sourcery",
    to: "callan"
  });

  assert.equal(failure.process, "transferOwnership.failed");
  assert.equal(failure.body.reason, "from is not current owner");
  assert.equal(world.project(projectors.owners).get("w"), "aaron");
});

test("Callan can clone w, owns w_prime, and proxy relation records lineage", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "sourcery" });
  createThing(world, { actor: "aaron", id: "w" });
  transferOwnership(world, { actor: "aaron", thingId: "w", from: "aaron", to: "sourcery" });
  cloneThing(world, { actor: "callan", source: "w", clone: "w_prime" });

  assert.equal(world.project(projectors.owners).get("w_prime"), "callan");
  assert.equal(world.project(projectors.proxies).get("w_prime"), "w");
});

test("delegated stewardship lets Callan accept w_prime into Sourcery Frontend", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "sourcery" });
  createThing(world, { actor: "aaron", id: "w" });
  transferOwnership(world, { actor: "aaron", thingId: "w", from: "aaron", to: "sourcery" });
  cloneThing(world, { actor: "callan", source: "w", clone: "w_prime" });

  world.emit({ process: "createFrontend", actor: "aaron", claims: [thing("sourcery_frontend"), relation("sourcery", "owns", "sourcery_frontend")], body: {} });
  world.emit({ process: "delegateStewardship", actor: "aaron", claims: [relation("callan", "stewards", "sourcery_frontend")], body: {} });

  assert.equal(canAcceptInto(world, "callan", "sourcery_frontend"), true);

  transferOwnership(world, { actor: "callan", thingId: "w_prime", from: "callan", to: "sourcery_frontend" });
  assert.equal(world.project(projectors.owners).get("w_prime"), "sourcery_frontend");
});

test("view-local position belongs on a proxy, not on Callan", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "callan" });
  createThing(world, { actor: "aaron", id: "aaron_view" });
  createThing(world, { actor: "aaron", id: "callan_in_aaron_view" });
  world.emit({
    process: "placeInView",
    actor: "aaron",
    claims: [
      relation("callan_in_aaron_view", "proxies", "callan"),
      relation("callan_in_aaron_view", "belongsTo", "aaron_view"),
      relation("callan_in_aaron_view", "position", "point_120_300")
    ],
    body: { x: 120, y: 300 }
  });

  const rels = world.project(projectors.currentRelations);
  assert.equal(rels.some(r => r.from === "callan" && r.rel === "position"), false);
  assert.equal(rels.some(r => r.from === "callan_in_aaron_view" && r.rel === "position"), true);
});
