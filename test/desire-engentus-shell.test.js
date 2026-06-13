import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createWorld, projectors } from "../src/kernel.js";
import {
  applyDesire,
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";

// ── M4: the engentus shell is a tree of DESIRE surfaces composing to the chart ──

async function shellDesire() {
  const file = path.join(process.cwd(), "examples_rvm", "engentus", "app", "shell.rvm");
  return normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(file));
}

test("the engentus shell normalizes into surface nodes for every screen", async () => {
  const desire = await shellDesire();
  const surfaces = new Map(desire.nodes.filter(n => n.kind === "surface").map(n => [n.name, n]));
  for (const screen of ["EngentusRoot", "EngentusLogin", "EngentusHome", "EngentusApp", "ModuleGrid", "GoodmanSidebar"]) {
    assert.ok(surfaces.has(screen), `missing surface ${screen}`);
  }
  // the router composes the screens (Goodman + mill-force apps now both present)
  assert.deepEqual(surfaces.get("EngentusRoot").body.children,
    ["EngentusLogin", "EngentusHome", "EngentusApp", "EngentusMillForceApp", "EngentusSignout"]);
});

test("the mill-force app screen composes the three mill-force charts", async () => {
  const desire = await shellDesire();
  const app = desire.nodes.find(n => n.kind === "surface" && n.name === "EngentusMillForceApp");
  assert.ok(app);
  for (const chart of ["MillForceCross", "MillForceAngle", "MillForceRose"]) {
    assert.ok(app.body.children.includes(chart), `mill-force app should reference ${chart}`);
  }
});

test("the app screen composes down to the GoodmanDiagram chart", async () => {
  const desire = await shellDesire();
  const app = desire.nodes.find(n => n.kind === "surface" && n.name === "EngentusApp");
  assert.ok(app.body.children.includes("GoodmanDiagram"),
    "EngentusApp should reference the GoodmanDiagram chart by id");
});

test("the module grid lists the three sciences (Goodman active, others locked)", async () => {
  const desire = await shellDesire();
  const grid = desire.nodes.find(n => n.kind === "surface" && n.name === "ModuleGrid");
  assert.deepEqual(grid.body.children, ["card_goodman", "card_mill_charge", "card_mill_force"]);
  const goodmanCard = desire.nodes.find(n => n.kind === "surface" && n.name === "ModuleCardGoodman");
  assert.equal(goodmanCard.body.className, "active");
  assert.equal(desire.nodes.find(n => n.name === "ModuleCardMillForce").body.className, "active");
  assert.equal(desire.nodes.find(n => n.name === "ModuleCardMillCharge").body.className, "locked");
});

test("the shell applies into witnessed surfaces (hasChildSurface relations)", async () => {
  const world = createWorld();
  applyDesire(world, await shellDesire());
  const rels = world.project(projectors.currentRelations);
  assert.ok(rels.some(r => r.from === "EngentusRoot" && r.rel === "hasChildSurface" && r.to === "EngentusApp"));
  assert.ok(rels.some(r => r.from === "EngentusApp" && r.rel === "hasChildSurface" && r.to === "GoodmanDiagram"));
});
