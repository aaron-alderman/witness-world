import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { loadWitnessTomlFile, applyWitnessDocs, applyWitnessToml } from "../src/dsl.js";
import { canvasProjection, edenNeighborhoodProjection } from "../src/canvas-projection.js";
import {
  requestBootstrapContextDefine,
  requestBootstrapProposalApprove,
  requestBootstrapProposalCreate,
  requestBootstrapStewardshipGrant,
  requestWidgetDefine
} from "../src/bootstrap-authoring.js";
import { requestEdenPersonalBoxItemCreate, requestEdenPersonalBoxItemDelete, requestEdenPersonalBoxItemUpdate } from "../src/eden-personal-box.js";
import { requestEdenPageThemeSet } from "../src/eden-page-theme.js";
import { requestEdenVersionActivate, requestEdenVersionPublish, requestEdenVersionRollback } from "../src/eden-versions.js";

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
  assert.equal(model.checkpoints.some(checkpoint => checkpoint.id === "responsibility" && checkpoint.unlocks.includes("Ship A Tiny SaaS")), true);
  assert.equal(model.checkpoints.some(checkpoint => checkpoint.id === "commons" && checkpoint.unlocks.includes("Run An Open Organization")), true);
  assert.equal(model.connections.some(connection => connection.visualType === "pipe" && connection.label === "events/data"), true);
  const todoSurface = model.surfaces.find(surface => surface.id === "eden.surface.todo");
  assert.equal(todoSurface.actions.some(action => action.id === "todo_pro" && action.state === "open" && action.commandQuery === "whoami"), true);
  assert.equal(todoSurface.reliefSections.some(section => section.id === "todo_form" && section.role === "todo-form"), true);
  assert.equal(todoSurface.reliefSections.some(section => section.id === "todo_version_playground" && section.activeSignals.includes("versions.draftDiff")), true);
  const worldSurface = model.surfaces.find(surface => surface.id === "eden.surface.world");
  assert.equal(worldSurface.panelKind, "capabilityInstall");
  assert.equal(worldSurface.runtime.suggestedCapabilities.some(capability => capability.id === "notes.sidebar" && capability.installed === false), true);
  assert.equal(worldSurface.actions.some(action => action.id === "world_capability" && action.state === "open"), true);
  const commonsSurface = model.surfaces.find(surface => surface.id === "eden.surface.commons");
  assert.equal(commonsSurface.panelKind, "organization");
  assert.equal(commonsSurface.runtime.mode, "organization");
  const processSurface = model.surfaces.find(surface => surface.id === "eden.surface.process");
  assert.equal(processSurface.panelKind, "processView");
  assert.equal(processSurface.processProgram, "todo_frontend_program");
  assert.equal(processSurface.processEvent, "load");
  const treeSurface = model.surfaces.find(surface => surface.id === "eden.surface.tree");
  assert.equal(treeSurface.runtime.mode, "theoryAnnex");
  assert.equal(treeSurface.questIds.includes("trained_mark"), true);
  assert.equal(model.academy.quests.some(quest => quest.id === "claim_room" && quest.status === "available"), true);
  const personalSurface = model.surfaces.find(surface => surface.id === "eden.surface.personal");
  assert.equal(personalSurface.actions.some(action => action.id === "personal_shared" && action.state === "locked"), true);
  const orientationCheckpoint = model.checkpoints.find(checkpoint => checkpoint.id === "orientation");
  assert.equal(orientationCheckpoint.quests.some(quest => quest.id === "claim_room" && quest.status === "available"), true);
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
  const aaronTodo = aaronModel.surfaces.find(surface => surface.id === "eden.surface.todo");
  assert.equal(aaronTodo.reliefSections.some(section => section.id === "todo_private_notes" && section.activeSignals.includes("session.authenticated")), true);
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
  assert.equal(Array.isArray(versionsSurface.runtime.versions), true);
});

test("eden neighborhood projection exposes contextual capability install state for the world surface target", async () => {
  const world = await loadDemoWorld();
  applyWitnessToml(world, `
[[capabilityInstall]]
actor = "aaron"
capability = "notes.sidebar"
target = "frontend"
targetKind = "context"
`);

  const model = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: "aaron" });
  const worldSurface = model.surfaces.find(surface => surface.id === "eden.surface.world");
  assert.ok(worldSurface?.runtime);
  assert.equal(worldSurface.panelKind, "capabilityInstall");
  assert.equal(worldSurface.runtime.target, "frontend");
  assert.equal(worldSurface.runtime.suggestedCapabilities.some(capability => capability.id === "notes.sidebar" && capability.installed), true);
  assert.equal(worldSurface.runtime.installedCapabilities.some(capability => capability.id === "notes.sidebar"), true);
});

test("eden academy quests complete from witnessed practice and unlock shared stewardship gates", async () => {
  const world = await loadDemoWorld();
  requestEdenPersonalBoxItemCreate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { kind: "note", text: "Plant the lantern" }
  });
  requestEdenPageThemeSet(world, {
    actor: "aaron",
    backendHost: "backendHost",
    pageId: "todo_app_widget",
    body: { themeId: "moss", material: "stone", typography: "serif" }
  });
  requestEdenVersionActivate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2",
    body: { version: "todo_versioned_banner_v2" }
  });
  requestEdenVersionRollback(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2"
  });
  applyWitnessToml(world, `
[[capabilityInstall]]
actor = "aaron"
capability = "notes.sidebar"
target = "frontend"
targetKind = "context"
`);

  const model = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: "aaron" });
  const academy = model.academy;
  assert.equal(academy.completedQuestIds.includes("claim_room"), true);
  assert.equal(academy.completedQuestIds.includes("restyle_page"), true);
  assert.equal(academy.completedQuestIds.includes("restore_last_good"), true);
  assert.equal(academy.completedQuestIds.includes("install_missing_power"), true);
  assert.equal(academy.completedQuestIds.includes("shared_table"), true);
  const personalSurface = model.surfaces.find(surface => surface.id === "eden.surface.personal");
  const editSurface = model.surfaces.find(surface => surface.id === "eden.surface.edit");
  const treeSurface = model.surfaces.find(surface => surface.id === "eden.surface.tree");
  assert.equal(personalSurface.actions.some(action => action.id === "personal_shared" && action.state === "open"), true);
  assert.equal(editSurface.actions.some(action => action.id === "edit_shared" && action.state === "open"), true);
  assert.equal(treeSurface.actions.some(action => action.id === "tree_shared" && action.state === "open"), true);
  assert.equal(treeSurface.actions.some(action => action.id === "tree_trade" && action.state === "locked"), true);
  assert.equal(academy.tracks.some(track => track.id === "stewardship" && track.count === 3 && track.statusLabel === "steady stewardship"), true);
  const structureCheckpoint = model.checkpoints.find(checkpoint => checkpoint.id === "structure");
  assert.equal(structureCheckpoint.quests.some(quest => quest.id === "restore_last_good" && quest.status === "completed"), true);
  assert.equal(structureCheckpoint.quests.some(quest => quest.id === "install_missing_power" && quest.status === "completed"), true);
});

test("eden responsibility quests open broader Tree consequences from repeated stewardship and operator work", async () => {
  const world = await loadDemoWorld();
  requestEdenPersonalBoxItemCreate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { kind: "note", text: "Claim the room" }
  });
  requestEdenPageThemeSet(world, {
    actor: "aaron",
    backendHost: "backendHost",
    pageId: "todo_app_widget",
    body: { themeId: "moss", material: "stone", typography: "serif" }
  });
  requestEdenVersionActivate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2",
    body: { version: "todo_versioned_banner_v2" }
  });
  requestEdenVersionRollback(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2"
  });
  applyWitnessToml(world, `
[[capabilityInstall]]
actor = "aaron"
capability = "notes.sidebar"
target = "frontend"
targetKind = "context"
`);

  let model = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: "aaron" });
  let treeSurface = model.surfaces.find(surface => surface.id === "eden.surface.tree");
  assert.equal(model.academy.completedQuestIds.includes("shared_table"), true);
  assert.equal(model.academy.completedQuestIds.includes("run_a_stall"), false);
  assert.equal(treeSurface.actions.some(action => action.id === "tree_shared" && action.state === "open"), true);
  assert.equal(treeSurface.actions.some(action => action.id === "tree_trade" && action.state === "locked"), true);
  assert.equal(treeSurface.actions.some(action => action.id === "tree_saas" && action.state === "locked"), true);

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
  world.emit({
    process: "backend.readProcessView",
    actor: "aaron",
    claims: [],
    body: { program: "todo_frontend_program", event: "load" }
  });
  world.emit({
    process: "network.simulated.failed",
    actor: "aaron",
    claims: [],
    body: { reason: "simulated network error", status: 503 }
  });

  model = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: "aaron" });
  treeSurface = model.surfaces.find(surface => surface.id === "eden.surface.tree");
  assert.equal(model.academy.completedQuestIds.includes("run_a_stall"), true);
  assert.equal(model.academy.completedQuestIds.includes("ship_tiny_saas"), false);
  assert.equal(treeSurface.actions.some(action => action.id === "tree_trade" && action.state === "open"), true);
  assert.equal(treeSurface.actions.some(action => action.id === "tree_saas" && action.state === "locked"), true);

  requestEdenPageThemeSet(world, {
    actor: "aaron",
    backendHost: "backendHost",
    pageId: "todo_app_widget",
    body: { themeId: "straw", material: "wood", typography: "mono" }
  });
  requestEdenVersionActivate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2",
    body: { version: "todo_versioned_banner_v1" }
  });
  requestEdenVersionPublish(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2",
    body: { version: "todo_versioned_banner_v1" }
  });

  model = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: "aaron" });
  treeSurface = model.surfaces.find(surface => surface.id === "eden.surface.tree");
  assert.equal(model.academy.completedQuestIds.includes("ship_tiny_saas"), true);
  assert.equal(model.academy.tracks.some(track => track.id === "stewardship" && track.count === 6 && track.statusLabel === "trusted stewardship"), true);
  assert.equal(model.academy.tracks.some(track => track.id === "operator" && track.count === 4 && track.statusLabel === "steady operator work"), true);
  assert.equal(treeSurface.actions.some(action => action.id === "tree_saas" && action.state === "open"), true);
  const responsibilityCheckpoint = model.checkpoints.find(checkpoint => checkpoint.id === "responsibility");
  assert.ok(responsibilityCheckpoint);
  assert.equal(responsibilityCheckpoint.quests.some(quest => quest.id === "shared_table" && quest.status === "completed"), true);
  assert.equal(responsibilityCheckpoint.quests.some(quest => quest.id === "run_a_stall" && quest.status === "completed"), true);
  assert.equal(responsibilityCheckpoint.quests.some(quest => quest.id === "ship_tiny_saas" && quest.status === "completed"), true);
});

test("eden commons quests project real governance practice and open cross-surface consequences", async () => {
  const world = await loadDemoWorld();
  requestEdenPersonalBoxItemCreate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { kind: "note", text: "Practice the commons" }
  });
  requestEdenPageThemeSet(world, {
    actor: "aaron",
    backendHost: "backendHost",
    pageId: "todo_app_widget",
    body: { themeId: "moss", material: "stone", typography: "serif" }
  });
  requestEdenVersionActivate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2",
    body: { version: "todo_versioned_banner_v2" }
  });
  requestEdenVersionRollback(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2"
  });
  applyWitnessToml(world, `
[[capabilityInstall]]
actor = "aaron"
capability = "notes.sidebar"
target = "frontend"
targetKind = "context"
`);
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
  world.emit({
    process: "backend.readProcessView",
    actor: "aaron",
    claims: [],
    body: { program: "todo_frontend_program", event: "load" }
  });
  world.emit({
    process: "network.simulated.failed",
    actor: "aaron",
    claims: [],
    body: { reason: "simulated network error", status: 503 }
  });
  requestEdenPageThemeSet(world, {
    actor: "aaron",
    backendHost: "backendHost",
    pageId: "todo_app_widget",
    body: { themeId: "straw", material: "wood", typography: "mono" }
  });
  requestEdenVersionActivate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2",
    body: { version: "todo_versioned_banner_v1" }
  });
  requestEdenVersionPublish(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2",
    body: { version: "todo_versioned_banner_v1" }
  });

  requestBootstrapContextDefine(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "ctx.eden.guild.aaron",
      label: "Aaron Guild",
      parent: "frontend"
    }
  });
  requestBootstrapStewardshipGrant(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      steward: "callan",
      target: "ctx.eden.guild.aaron",
      targetKind: "context"
    }
  });
  requestBootstrapProposalCreate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: {
      id: "proposal.eden.organization.aaron.1",
      targetProcess: "widget.define",
      targetKind: "widget",
      targetId: "eden_guild_notice_aaron",
      bodyJson: JSON.stringify({
        id: "eden_guild_notice_aaron",
        kind: "Text",
        text: "Aaron Guild is open for shared stewardship.",
        attach: false,
        context: "ctx.eden.guild.aaron"
      }),
      reason: "Open the guild through witnessed governance"
    }
  });
  await requestBootstrapProposalApprove(world, {
    actor: "aaron",
    backendHost: "backendHost",
    proposalId: "proposal.eden.organization.aaron.1",
    executeTarget: proposal => {
      const result = requestWidgetDefine(world, {
        actor: "aaron",
        backendHost: "backendHost",
        body: proposal.body
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
  });

  const model = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: "aaron" });
  assert.equal(model.academy.completedQuestIds.includes("ship_tiny_saas"), true);
  assert.equal(model.academy.completedQuestIds.includes("start_a_group"), true);
  assert.equal(model.academy.completedQuestIds.includes("set_the_rules"), true);
  assert.equal(model.academy.completedQuestIds.includes("run_open_organization"), true);
  assert.equal(model.academy.tracks.some(track => track.id === "governance" && track.count === 4 && track.statusLabel === "governance practiced"), true);
  const commonsCheckpoint = model.checkpoints.find(checkpoint => checkpoint.id === "commons");
  assert.ok(commonsCheckpoint);
  assert.equal(commonsCheckpoint.quests.some(quest => quest.id === "start_a_group" && quest.status === "completed"), true);
  assert.equal(commonsCheckpoint.quests.some(quest => quest.id === "set_the_rules" && quest.status === "completed"), true);
  assert.equal(commonsCheckpoint.quests.some(quest => quest.id === "run_open_organization" && quest.status === "completed"), true);
  const commonsSurface = model.surfaces.find(surface => surface.id === "eden.surface.commons");
  assert.ok(commonsSurface);
  assert.equal(commonsSurface.runtime.contextExists, true);
  assert.equal(commonsSurface.runtime.hasGuestStewardship, true);
  assert.equal(commonsSurface.runtime.noticeWidgetExists, true);
  assert.equal(commonsSurface.runtime.approvedProposalCount, 1);
  const treeSurface = model.surfaces.find(surface => surface.id === "eden.surface.tree");
  const processSurface = model.surfaces.find(surface => surface.id === "eden.surface.process");
  const worldSurface = model.surfaces.find(surface => surface.id === "eden.surface.world");
  assert.equal(treeSurface.actions.some(action => action.id === "tree_commons" && action.state === "open"), true);
  assert.equal(processSurface.actions.some(action => action.id === "process_shared" && action.state === "open"), true);
  assert.equal(worldSurface.actions.some(action => action.id === "world_commons" && action.state === "open"), true);
});

test("eden operator quest path opens Process View alter-runtime after real publish and process inspection", async () => {
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
  requestEdenVersionRollback(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2"
  });
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
  world.emit({
    process: "backend.readProcessView",
    actor: "aaron",
    claims: [],
    body: { program: "todo_frontend_program", event: "load" }
  });
  world.emit({
    process: "network.simulated.failed",
    actor: "aaron",
    claims: [],
    body: { reason: "simulated network error", status: 503 }
  });

  const model = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: "aaron" });
  const academy = model.academy;
  assert.equal(academy.completedQuestIds.includes("inspect_machine_room"), true);
  assert.equal(academy.completedQuestIds.includes("publish_current_cut"), true);
  assert.equal(academy.completedQuestIds.includes("run_failure_drill"), true);
  const processSurface = model.surfaces.find(surface => surface.id === "eden.surface.process");
  assert.equal(processSurface.actions.some(action => action.id === "process_alter" && action.state === "open"), true);
  assert.equal(processSurface.questIds.includes("run_failure_drill"), true);
  assert.equal(processSurface.quests.some(quest => quest.id === "run_failure_drill" && quest.status === "completed"), true);
  assert.equal(academy.tracks.some(track => track.id === "operator" && track.count === 3 && track.statusLabel === "steady operator work"), true);
  const routesCheckpoint = model.checkpoints.find(checkpoint => checkpoint.id === "routes");
  assert.equal(routesCheckpoint.quests.some(quest => quest.id === "inspect_machine_room" && quest.status === "completed"), true);
  assert.equal(routesCheckpoint.quests.some(quest => quest.id === "publish_current_cut" && quest.status === "completed"), true);
  assert.equal(routesCheckpoint.quests.some(quest => quest.id === "run_failure_drill" && quest.status === "completed"), true);
});

test("eden theory annex path studies authored lessons and earns the trained mark", async () => {
  const world = await loadDemoWorld();
  requestEdenPersonalBoxItemCreate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { kind: "note", text: "Claim the room" }
  });
  requestEdenPageThemeSet(world, {
    actor: "aaron",
    backendHost: "backendHost",
    pageId: "todo_app_widget",
    body: { themeId: "moss", material: "stone", typography: "serif" }
  });
  requestEdenVersionActivate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2",
    body: { version: "todo_versioned_banner_v2" }
  });
  requestEdenVersionRollback(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2"
  });
  applyWitnessToml(world, `
[[capabilityInstall]]
actor = "aaron"
capability = "notes.sidebar"
target = "frontend"
targetKind = "context"
`);
  world.emit({ process: "edenTheory.lesson.study", actor: "aaron", claims: [], body: { owner: "aaron", surfaceId: "eden.surface.tree", lessonId: "why_contexts" } });
  world.emit({ process: "edenTheory.lesson.study", actor: "aaron", claims: [], body: { owner: "aaron", surfaceId: "eden.surface.tree", lessonId: "witnesses_truth" } });
  world.emit({ process: "edenTheory.lesson.study", actor: "aaron", claims: [], body: { owner: "aaron", surfaceId: "eden.surface.tree", lessonId: "authority_without_illusion" } });
  world.emit({ process: "edenTheory.lesson.study", actor: "aaron", claims: [], body: { owner: "aaron", surfaceId: "eden.surface.tree", lessonId: "shells_and_expressions" } });
  world.emit({ process: "edenTheory.assessment.pass", actor: "aaron", claims: [], body: { owner: "aaron", surfaceId: "eden.surface.tree", mark: "trained" } });

  const model = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: "aaron" });
  const treeSurface = model.surfaces.find(surface => surface.id === "eden.surface.tree");
  assert.equal(treeSurface.actions.some(action => action.id === "tree_theory" && action.state === "open"), true);
  assert.equal(treeSurface.runtime.allLessonsCompleted, true);
  assert.equal(treeSurface.runtime.trained, true);
  assert.equal(treeSurface.quests.some(quest => quest.id === "trained_mark" && quest.status === "completed"), true);
  assert.equal(model.academy.completedQuestIds.includes("trained_mark"), true);
});

test("eden teaching track records witnessed teach-backs after the trained mark", async () => {
  const world = await loadDemoWorld();
  requestEdenPersonalBoxItemCreate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    body: { kind: "note", text: "Claim the room" }
  });
  requestEdenPageThemeSet(world, {
    actor: "aaron",
    backendHost: "backendHost",
    pageId: "todo_app_widget",
    body: { themeId: "moss", material: "stone", typography: "serif" }
  });
  requestEdenVersionActivate(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2",
    body: { version: "todo_versioned_banner_v2" }
  });
  requestEdenVersionRollback(world, {
    actor: "aaron",
    backendHost: "backendHost",
    surfaceId: "eden.surface.versions",
    soul: "todo_versioned_banner",
    publishedVersion: "todo_versioned_banner_v1",
    draftVersion: "todo_versioned_banner_v2"
  });
  applyWitnessToml(world, `
[[capabilityInstall]]
actor = "aaron"
capability = "notes.sidebar"
target = "frontend"
targetKind = "context"
`);
  world.emit({ process: "edenTheory.lesson.study", actor: "aaron", claims: [], body: { owner: "aaron", surfaceId: "eden.surface.tree", lessonId: "why_contexts" } });
  world.emit({ process: "edenTheory.lesson.study", actor: "aaron", claims: [], body: { owner: "aaron", surfaceId: "eden.surface.tree", lessonId: "witnesses_truth" } });
  world.emit({ process: "edenTheory.lesson.study", actor: "aaron", claims: [], body: { owner: "aaron", surfaceId: "eden.surface.tree", lessonId: "authority_without_illusion" } });
  world.emit({ process: "edenTheory.lesson.study", actor: "aaron", claims: [], body: { owner: "aaron", surfaceId: "eden.surface.tree", lessonId: "shells_and_expressions" } });
  world.emit({ process: "edenTheory.assessment.pass", actor: "aaron", claims: [], body: { owner: "aaron", surfaceId: "eden.surface.tree", mark: "trained" } });
  world.emit({ process: "edenTheory.teachBack", actor: "aaron", claims: [], body: { owner: "aaron", surfaceId: "eden.surface.tree", note: "Contexts stay local until they are carried with intent." } });

  const model = edenNeighborhoodProjection(world.allWitnesses(), "eden.neighborhood.home", { actor: "aaron" });
  const treeSurface = model.surfaces.find(surface => surface.id === "eden.surface.tree");
  assert.equal(treeSurface.runtime.teachBackCount, 1);
  assert.equal(treeSurface.runtime.teachBacks.some(row => row.note.includes("Contexts stay local")), true);
  assert.equal(model.academy.tracks.some(track => track.id === "teaching" && track.count === 1 && track.statusLabel === "first teach-back witnessed"), true);
  assert.equal(model.academy.signals.includes("practice.teaching.first"), true);
});
