// Headless proof of the Hearth loop — no phone, no browser, no ports.
// Drives the seam through intents and asserts the witness/projection behaviour,
// including the load-bearing property: completing a chore changes the present
// without mutating the past. Also proves the shared renderer half (plan) is pure,
// so a native shell can consume it verbatim.

import assert from "node:assert/strict";
import { openWorld, choreList, hearthData, applyIntent } from "./world.js";
import { HEARTH_SURFACE } from "./surface.js";
import { planSurface } from "./render-plan.js";

const world = openWorld(); // fresh in-memory log (genesis only)

// 1. intents append witnesses
assert.equal(applyIntent(world, { intent: "add", value: "take out bins", actor: "callan" }).ok, true);
assert.equal(applyIntent(world, { intent: "add", value: "water plants", actor: "hannah" }).ok, true);

let open = world.project(choreList);
assert.equal(open.length, 2, "two open chores after two adds");
assert.deepEqual(open.map(c => c.text), ["take out bins", "water plants"]);

// 2. empty add is rejected (a non-claim)
assert.equal(applyIntent(world, { intent: "add", value: "   ", actor: "callan" }).ok, false);

// 3. completing flips the projection
const firstId = open[0].id;
const logBefore = world.allWitnesses().length;
assert.equal(applyIntent(world, { intent: "complete", arg: firstId, actor: "hannah" }).ok, true);

const after = world.project(choreList);
assert.equal(after.length, 1, "one open chore after completing one");
assert.equal(after[0].text, "water plants");

// 4. append-only: completing ADDED a witness, mutated none
const all = world.allWitnesses();
assert.equal(all.length, logBefore + 1, "complete appended exactly one witness");
assert.equal(all.filter(w => w.process === "chore.add").length, 2, "both add witnesses intact");
assert.equal(all.filter(w => w.process === "chore.done").length, 1, "one done witness");

// 5. the projection is pure: re-derive over the same log, identical answer
assert.deepEqual(world.project(choreList), after, "projection is deterministic over the log");

// 6. the completed chore is still in history (continuity), just not in the open projection
assert.ok(all.some(w => w.process === "chore.add" && w.body.id === firstId), "completed chore's birth is remembered");

// 7. the SHARED renderer half: plan() is pure, serializable, renderer-agnostic.
//    Same plan feeds the browser draw() and the React Native draw() unchanged.
const plan = planSurface(HEARTH_SURFACE.view, hearthData(world));
assert.equal(plan.prim, "screen", "plan root is a screen");
const list = plan.children.find(n => n.prim === "list");
assert.ok(list, "plan contains the list");
assert.equal(list.rows.length, 1, "plan list expanded to the one open chore");
assert.equal(list.rows[0].children.find(n => n.prim === "text").value, "water plants", "row bound to chore text");
const doneBtn = list.rows[0].children.find(n => n.prim === "button");
assert.equal(doneBtn.intent.arg, after[0].id, "Done button's intent arg resolved to the chore id");
// pure data: survives a JSON round-trip unchanged — no closures, no platform types
assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan, "plan is pure serializable data (renderer-agnostic)");

console.log("ok — hearth loop proven:");
console.log("   2 added -> 1 completed -> 1 open; log append-only; projection pure");
console.log(`   witnesses in log: ${all.length} (genesis + 2 add + 1 done)`);
console.log("   plan() is pure + serializable -> browser and native shells share it verbatim");
