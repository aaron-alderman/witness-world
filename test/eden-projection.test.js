import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { loadWitnessTomlFile, applyWitnessDocs, applyWitnessToml } from "../src/dsl.js";
import { canvasProjection, edenNeighborhoodProjection } from "../src/canvas-projection.js";
import { requestEdenPersonalBoxItemCreate, requestEdenPersonalBoxItemDelete, requestEdenPersonalBoxItemUpdate } from "../src/eden-personal-box.js";
import { requestEdenPageThemeSet } from "../src/eden-page-theme.js";
import { requestEdenVersionActivate, requestEdenVersionPublish } from "../src/eden-versions.js";

async function loadDemoWorld() {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);
  return world;
}

test("eden neighborhood projection returns the authored first neighborhood", async () => {
  const world = await loadDemoWorld();
  const model = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home");
  assert.ok(model);
  assert.equal(model.neighborhood.title, "First Neighbourhood");
  assert.equal(model.surfaces.some(surface => surface.id === "eden.surface.todo" && surface.surfaceKind === "embeddedPage"), true);
  assert.equal(model.surfaces.some(surface => surface.id === "eden.surface.tree" && surface.actions.some(action => action.label === "Claim Your Room")), true);
  assert.equal(model.surfaces.some(surface => surface.id === "eden.surface.versions" && surface.relief.base === 2), true);
  assert.equal(model.gotos.some(surface => surface.id === "eden.goto.world" && surface.href === "/world"), true);
  assert.equal(model.prompts.some(prompt => prompt.text.includes("mouse wheel")), true);
  assert.equal(model.prompts.some(prompt => prompt.text.includes("What you see is real")), true);
  assert.equal(model.checkpoints.some(checkpoint => checkpoint.title === "Act 2: Orientation"), true);
  assert.equal(model.checkpoints.some(checkpoint => checkpoint.unlocks.includes("World Graph")), true);
  assert.equal(model.connections.some(connection => connection.visualType === "pipe" && connection.label === "events/data"), true);
});

test("canvas projection exposes a shared spatial view alongside editable instances", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "adam"
id = "customer"

[[perspective]]
actor = "adam"
id = "demo_perspective"
title = "Demo"

[[thing]]
actor = "adam"
id = "projection-instance-a"

[[relation]]
actor = "adam"
from = "projection-instance-a"
rel = "hasModuleKind"
to = "projectionInstance"

[[relation]]
actor = "adam"
from = "projection-instance-a"
rel = "proxies"
to = "customer"

[[relation]]
actor = "adam"
from = "demo_perspective"
rel = "contains"
to = "projection-instance-a"

[[relation]]
actor = "adam"
from = "projection-instance-a"
rel = "hasGeometry"
to = "geometry"
meta = { x = 10, y = 20, w = 120, h = 60 }
`);
  const canvas = canvasProjection(world.allWitnesses(), "demo_perspective");
  assert.ok(canvas?.spatial);
  assert.equal(canvas.spatial.mode, "perspective");
  assert.equal(canvas.spatial.surfaces.some(surface => surface.id === "projection-instance-a"), true);
});

test("eden neighborhood projection exposes owner-scoped personal box items", async () => {
  const world = await loadDemoWorld();
  requestEdenPersonalBoxItemCreate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { kind: "note", text: "Plant a lantern" }
  });
  const first = requestEdenPersonalBoxItemCreate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { kind: "check", text: "Check the gate" }
  });
  requestEdenPersonalBoxItemUpdate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    itemId: first.item.id,
    body: { kind: "link", text: "Open the map", href: "/world" }
  });
  const second = requestEdenPersonalBoxItemCreate(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: { kind: "note", text: "Callan only" }
  });
  requestEdenPersonalBoxItemDelete(world, {
    actor: "callan",
    backendHost: "backendHost",
    itemId: second.item.id
  });

  const aaronModel = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: "aaron" });
  const personal = aaronModel.surfaces.find(surface => surface.id === "eden.surface.personal");
  assert.ok(personal?.runtime);
  assert.equal(personal.panelKind, "personalBox");
  assert.equal(personal.runtime.items.length, 2);
  assert.equal(personal.runtime.items.some(item => item.text === "Plant a lantern"), true);
  assert.equal(personal.runtime.items.some(item => item.kind === "link" && item.href === "/world"), true);

  const callanModel = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: "callan" });
  const callanPersonal = callanModel.surfaces.find(surface => surface.id === "eden.surface.personal");
  assert.equal(callanPersonal.runtime.items.length, 0);
});

test("eden neighborhood projection exposes actor-scoped edit page theme state", async () => {
  const world = await loadDemoWorld();
  requestEdenPageThemeSet(world, {
    actor: "aaron",
    backendHost: "backendHost",
    pageId: "todo_app_widget",
    body: { themeId: "moss", material: "stone", typography: "serif" }
  });

  const aaronModel = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: "aaron" });
  const editSurface = aaronModel.surfaces.find(surface => surface.id === "eden.surface.edit");
  assert.ok(editSurface?.runtime);
  assert.equal(editSurface.panelKind, "editPage");
  assert.equal(editSurface.runtime.pageTheme.themeId, "moss");
  assert.equal(editSurface.runtime.pageTheme.material, "stone");
  assert.equal(editSurface.runtime.pageTheme.typography, "serif");

  const anonymousModel = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: null });
  const anonymousEdit = anonymousModel.surfaces.find(surface => surface.id === "eden.surface.edit");
  assert.equal(anonymousEdit.runtime.pageTheme.themeId, "paper");
});

test("eden neighborhood projection exposes real version state for the live Todo board seam", async () => {
  const world = await loadDemoWorld();
  requestEdenVersionActivate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2",
    body: { version: "todo_versioned_banner_v2" }
  });
  requestEdenVersionPublish(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2",
    body: { version: "todo_versioned_banner_v2" }
  });

  const model = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: "aaron" });
  const versionsSurface = model.surfaces.find(surface => surface.id === "eden.surface.versions");
  assert.ok(versionsSurface?.runtime);
  assert.equal(versionsSurface.panelKind, "versions");
  assert.equal(versionsSurface.runtime.activeVersion, "todo_versioned_banner_v2");
  assert.equal(versionsSurface.runtime.publishedVersion, "todo_versioned_banner_v2");
  assert.equal(versionsSurface.runtime.draftVersion, "todo_versioned_banner_v1");
  assert.equal(versionsSurface.runtime.versions.some(row => row.version === "todo_versioned_banner_v2" && row.isPublished), true);
  assert.equal(Array.isArray(versionsSurface.runtime.compare.activeToPublished), true);
});
