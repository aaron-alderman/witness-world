import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createWorld, projectors } from "../src/kernel.js";
import {
  applyDesire,
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";

const shellFile = path.join(process.cwd(), "examples", "engentus", "app", "shell.rvm");

async function shellDesire() {
  return normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(shellFile));
}

async function shellSource() {
  return fs.readFile(shellFile, "utf8");
}

function nodeMap(desire, kind) {
  return new Map(desire.nodes.filter(node => node.kind === kind).map(node => [node.name, node]));
}

test("the engentus shell normalizes major screens plus authored shell behavior nodes", async () => {
  const desire = await shellDesire();
  const surfaces = nodeMap(desire, "surface");
  const processes = nodeMap(desire, "process");
  const messages = nodeMap(desire, "message");
  const types = nodeMap(desire, "type");

  for (const screen of [
    "EngentusRoot",
    "EngentusLogin",
    "EngentusHome",
    "EngentusApp",
    "EngentusMillChargeApp",
    "EngentusMillForceApp",
    "EngentusSignout"
  ]) {
    assert.ok(surfaces.has(screen), `missing surface ${screen}`);
  }

  assert.ok(processes.has("EngentusShellNavigation"));
  assert.ok(messages.has("EngentusSignInRequested"));
  assert.ok(messages.has("EngentusSignOutRequested"));
  assert.ok(messages.has("EngentusNavigateHomeRequested"));
  assert.ok(messages.has("EngentusNavigateGoodmanRequested"));
  assert.ok(messages.has("EngentusNavigateMillChargeRequested"));
  assert.ok(messages.has("EngentusNavigateMillForceRequested"));
  assert.equal(types.get("EngentusShellRoute")?.body?.role, "enum");
  assert.equal(types.get("EngentusShellActiveRoute")?.body?.role, "state");
  assert.equal(surfaces.get("EngentusRoot")?.body?.processRef, "EngentusShellNavigation");
});

test("the shell is structured through explicit child regions instead of flattened screen props", async () => {
  const desire = await shellDesire();
  const surfaces = nodeMap(desire, "surface");

  assert.deepEqual(surfaces.get("EngentusLogin")?.body?.children, [
    "EngentusLoginBook"
  ]);

  assert.deepEqual(surfaces.get("EngentusLoginBook")?.body?.children, [
    "EngentusLoginLeft",
    "EngentusLoginRight"
  ]);

  assert.deepEqual(surfaces.get("NewsPanel")?.body?.children, [
    "NewsFeedHeader",
    "NewsFeedAlertReading",
    "NewsFeedMaintenanceWindow",
    "NewsFeedGoodmanRelease",
    "NewsFeedRecalibration",
    "NewsFeedStandardsUpdate",
    "NewsFeedFirmwareUpdate",
    "NewsFeedMonitoringGuidance"
  ]);

  assert.deepEqual(surfaces.get("GoodmanSidebar")?.body?.children, [
    "GoodmanScenarioSection",
    "GoodmanSimulationSection",
    "GoodmanRunConfigSection",
    "GoodmanChartStyleSection",
    "GoodmanBoltSetsSection",
    "GoodmanFatigueLegendSection"
  ]);

  assert.deepEqual(surfaces.get("EngentusApp")?.body?.children, [
    "EngentusAppChrome",
    "EngentusGoodmanHeader",
    "GoodmanModesToolbar",
    "GoodmanWindowToolbar",
    "GoodmanSidebar",
    "GoodmanViewerRegion"
  ]);

  assert.deepEqual(surfaces.get("MillForceTabs")?.body?.children, [
    "MillForceTabCrossSection",
    "MillForceTabForceVsAngle",
    "MillForceTabForceRose"
  ]);

  assert.deepEqual(surfaces.get("EngentusHome")?.body?.children, [
    "EngentusHomeChrome",
    "EngentusHomeBody"
  ]);
});

test("the module shells declare process and capability dependencies semantically", async () => {
  const desire = await shellDesire();
  const surfaces = nodeMap(desire, "surface");

  const goodman = surfaces.get("EngentusApp");
  const millCharge = surfaces.get("EngentusMillChargeApp");
  const millForce = surfaces.get("EngentusMillForceApp");

  assert.equal(goodman?.body?.processRef, "EngentusShellNavigation");
  assert.deepEqual(goodman?.body?.capabilityRefs, ["chart.render"]);
  assert.equal("dependsOnCapabilities" in (goodman?.body?.props ?? {}), false);

  assert.equal(millCharge?.body?.processRef, "EngentusShellNavigation");
  assert.deepEqual(millCharge?.body?.capabilityRefs, ["chart.render"]);
  assert.equal("dependsOnCapabilities" in (millCharge?.body?.props ?? {}), false);

  assert.equal(millForce?.body?.processRef, "EngentusShellNavigation");
  assert.deepEqual(millForce?.body?.capabilityRefs, ["chart.render"]);
  assert.equal("dependsOnCapabilities" in (millForce?.body?.props ?? {}), false);
});

test("the shell source forbids flattened prop families and raw html escape hatches", async () => {
  const source = await shellSource();

  for (const pattern of [
    /\bfeature\d+[A-Za-z]*/i,
    /\bitem\d+[A-Za-z]*/i,
    /\btoolbarMode\d+[A-Za-z]*/i,
    /\btoolbarAction\d+[A-Za-z]*/i,
    /\bchartTab\d+[A-Za-z]*/i,
    /\bsection\d+[A-Za-z]*/i,
    /\b\w*ContentHtml\b/,
    /\bmainBeforeFrameHtml\b/,
    /\bmainAfterFrameHtml\b/,
    /\bshellTemplate\b/,
    /\bdependsOnCapabilities\b/
  ]) {
    assert.equal(pattern.test(source), false, `unexpected legacy shell prop pattern: ${pattern}`);
  }
});

test("the shell applies into witnessed surfaces with route, process, and capability relations intact", async () => {
  const world = createWorld();
  applyDesire(world, await shellDesire());
  const rels = world.project(projectors.currentRelations);
  const loginSurface = world.allWitnesses().find(witness =>
    witness.process === "desire.defineSurface" && witness.body?.id === "EngentusLogin"
  )?.body;

  assert.ok(rels.some(row => row.from === "EngentusRoot" && row.rel === "hasChildSurface" && row.to === "EngentusHome"));
  assert.ok(rels.some(row => row.from === "EngentusRoot" && row.rel === "surfaceProcess" && row.to === "EngentusShellNavigation"));
  assert.ok(rels.some(row => row.from === "EngentusApp" && row.rel === "dependsOnCapability" && row.to === "chart.render"));
  assert.equal(loginSurface?.props?.routePath, "/engentus/login");
});
