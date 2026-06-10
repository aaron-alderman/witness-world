import { createWorld, createThing, cloneThing, transferOwnership, relation, thing, canAcceptInto, projectors } from "./kernel.js";

const world = createWorld();

createThing(world, { actor: "adam", id: "aaron" });
createThing(world, { actor: "aaron", id: "sourcery" });
createThing(world, { actor: "aaron", id: "w" });
transferOwnership(world, { actor: "aaron", thingId: "w", from: "aaron", to: "sourcery" });

world.emit({ process: "hire", actor: "aaron", claims: [thing("callan"), relation("sourcery", "employs", "callan")], body: {} });
cloneThing(world, { actor: "callan", source: "w", clone: "w_prime" });
world.emit({ process: "createFrontend", actor: "aaron", claims: [thing("sourcery_frontend"), relation("sourcery", "owns", "sourcery_frontend")], body: {} });
world.emit({ process: "delegateStewardship", actor: "aaron", claims: [relation("callan", "stewards", "sourcery_frontend")], body: {} });

if (canAcceptInto(world, "callan", "sourcery_frontend")) {
  transferOwnership(world, { actor: "callan", thingId: "w_prime", from: "callan", to: "sourcery_frontend" });
}

console.log("owners", Object.fromEntries(world.project(projectors.owners)));
console.log("proxies", Object.fromEntries(world.project(projectors.proxies)));
console.log("witnesses", world.allWitnesses().map(w => [w.id, w.process]));
