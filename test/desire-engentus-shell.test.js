import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createWorld, projectors } from "../src/kernel.js";
import {
  applyDesire,
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";

async function shellDesire() {
  const file = path.join(process.cwd(), "examples", "engentus", "app", "shell.rvm");
  return normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(file));
}

test("the engentus shell normalizes into surface nodes for every route state", async () => {
  const desire = await shellDesire();
  const surfaces = new Map(desire.nodes.filter(node => node.kind === "surface").map(node => [node.name, node]));
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
  assert.deepEqual(surfaces.get("EngentusRoot").body.children, [
    "EngentusLogin",
    "EngentusHome",
    "EngentusApp",
    "EngentusMillChargeApp",
    "EngentusMillForceApp",
    "EngentusSignout"
  ]);
});

test("the home shell authors route and module metadata through surface props", async () => {
  const desire = await shellDesire();
  const home = desire.nodes.find(node => node.kind === "surface" && node.name === "EngentusHome");
  const grid = desire.nodes.find(node => node.kind === "surface" && node.name === "ModuleGrid");
  const millCharge = desire.nodes.find(node => node.kind === "surface" && node.name === "ModuleCardMillCharge");
  const goodman = desire.nodes.find(node => node.kind === "surface" && node.name === "ModuleCardGoodman");
  const millForce = desire.nodes.find(node => node.kind === "surface" && node.name === "ModuleCardMillForce");

  assert.equal(home.body.props.routePath, "/engentus/home");
  assert.equal(home.body.props.title, "Analysis Modules");
  assert.equal(home.body.props.pillClass, "mill-pill");
  assert.deepEqual(grid.body.children, [
    "ModuleCardMillCharge",
    "ModuleCardGoodman",
    "ModuleCardMillForce",
    "ModuleCardTensionTimeSeries",
    "ModuleCardBoltLoadDistribution",
    "ModuleCardChannelHealthMonitor",
    "ModuleCardCalibrationWorkspace",
    "ModuleCardMaintenanceForecaster",
    "ModuleCardSensorFleetOverview",
    "ModuleCardReportBuilder",
    "ModuleCardAlertTimeline",
    "ModuleCardMillComparison",
    "ModuleCardTorqueAnalysis",
    "ModuleCardVibrationSpectrum",
    "ModuleCardLifeCycleEstimator",
    "ModuleCardApiDataExplorer",
    "ModuleCardHistoricalArchive",
    "ModuleCardComplianceDashboard"
  ]);
  assert.equal(millCharge.body.props.href, "/engentus/mill-charge");
  assert.equal(goodman.body.props.href, "/engentus/goodman");
  assert.equal(millForce.body.props.href, "/engentus/mill-force");
});

test("the module shells carry mount-mode and route props for the core renderer", async () => {
  const desire = await shellDesire();
  const goodman = desire.nodes.find(node => node.kind === "surface" && node.name === "EngentusApp");
  const millCharge = desire.nodes.find(node => node.kind === "surface" && node.name === "EngentusMillChargeApp");
  const millForce = desire.nodes.find(node => node.kind === "surface" && node.name === "EngentusMillForceApp");
  const millChargeMetrics = desire.nodes.find(node => node.kind === "surface" && node.name === "MillChargeMetrics");

  assert.equal(goodman.body.props.routePath, "/engentus/goodman");
  assert.equal(goodman.body.props.shellTemplate, "viewer-sidebar-main");
  assert.equal(goodman.body.props.mountMode, "mounted-panel");
  assert.ok(goodman.body.children.includes("GoodmanDiagram"));
  assert.ok(goodman.body.children.includes("GoodmanMCBands"));

  assert.equal(millCharge.body.props.routePath, "/engentus/mill-charge");
  assert.equal(millCharge.body.props.shellTemplate, "viewer-sidebar-main-metrics");
  assert.equal(millCharge.body.props.mountMode, "mounted-panel");
  assert.ok(millCharge.body.children.includes("MillChargeCrossSection"));
  assert.equal(millChargeMetrics.body.props.headerDomId, "mill-metrics-hdr");
  assert.equal(millChargeMetrics.body.props.panelDomId, "mill-metrics-panel");

  assert.equal(millForce.body.props.routePath, "/engentus/mill-force");
  assert.equal(millForce.body.props.shellTemplate, "viewer-sidebar-tabs");
  assert.equal(millForce.body.props.mountMode, "mounted-panel");
  assert.deepEqual(
    millForce.body.children.filter(child => child.startsWith("MillForce") && child !== "MillForceSidebar"),
    ["MillForceCross", "MillForceAngle", "MillForceRose"]
  );
  assert.equal("layoutVariant" in goodman.body.props, false);
  assert.equal("layoutVariant" in millCharge.body.props, false);
  assert.equal("layoutVariant" in millForce.body.props, false);
});

test("the shell applies into witnessed surfaces with route props intact", async () => {
  const world = createWorld();
  applyDesire(world, await shellDesire());
  const rels = world.project(projectors.currentRelations);
  const loginSurface = world.allWitnesses().find(witness =>
    witness.process === "desire.defineSurface" && witness.body?.id === "EngentusLogin"
  )?.body;

  assert.ok(rels.some(row => row.from === "EngentusRoot" && row.rel === "hasChildSurface" && row.to === "EngentusHome"));
  assert.ok(rels.some(row => row.from === "EngentusApp" && row.rel === "hasChildSurface" && row.to === "GoodmanDiagram"));
  assert.equal(loginSurface?.props?.routePath, "/engentus/login");
});
