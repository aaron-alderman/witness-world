import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createWorld, projectors } from "../src/kernel.js";
import {
  applyDesire,
  compileRvmFileToDesirePlus,
  createProcessRuntime,
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
  assert.ok(messages.has("EngentusSaveGuidedTourSession"));
  assert.ok(messages.has("EngentusSignOutRequested"));
  assert.ok(messages.has("EngentusSignBackInRequested"));
  assert.ok(messages.has("EngentusNavigateHomeRequested"));
  assert.ok(messages.has("EngentusNavigateGoodmanRequested"));
  assert.ok(messages.has("EngentusNavigateMillChargeRequested"));
  assert.ok(messages.has("EngentusNavigateMillForceRequested"));
  assert.equal(types.get("EngentusShellRoute")?.body?.role, "enum");
  assert.equal(types.get("EngentusShellActiveRoute")?.body?.role, "state");
  assert.equal(types.get("EngentusShellAuthState")?.body?.role, "enum");
  assert.equal(types.get("EngentusShellAuthStatus")?.body?.role, "state");
  assert.equal(types.get("EngentusProfileMenuVisible")?.body?.role, "state");
  assert.equal(types.get("EngentusPasswordRevealed")?.body?.role, "state");
  assert.equal(surfaces.get("EngentusRoot")?.body?.processRef, "EngentusShellNavigation");
  assert.equal(surfaces.get("EngentusLoginBook")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("EngentusLoginPasswordField")?.body?.bindings[0]?.prop, "inputType");
  assert.equal(surfaces.get("EngentusProfileMenu")?.body?.bindings[0]?.prop, "visible");
  assert.deepEqual(surfaces.get("EngentusLoginPrimaryAction")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "deliver", message: "EngentusSignInRequested" }
    }
  ]);
  assert.deepEqual(surfaces.get("EngentusLoginSubmitAction")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "deliver", message: "EngentusSignInRequested" }
    }
  ]);
  assert.deepEqual(surfaces.get("EngentusLoginPasswordToggle")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: {
        kind: "setState",
        state: "EngentusPasswordRevealed",
        value: { kind: "toggleState", state: "EngentusPasswordRevealed" }
      }
    }
  ]);
  assert.deepEqual(surfaces.get("EngentusProfileSummary")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: {
        kind: "setState",
        state: "EngentusProfileMenuVisible",
        value: { kind: "toggleState", state: "EngentusProfileMenuVisible" }
      }
    }
  ]);
  assert.deepEqual(surfaces.get("EngentusProfileMenuSignout")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "deliver", message: "EngentusSignOutRequested" }
    }
  ]);
  assert.deepEqual(processes.get("EngentusShellNavigation")?.body?.rules, [
    {
      trigger: "EngentusSignInRequested",
      steps: [
        { kind: "setState", state: "EngentusShellAuthStatus", value: "pending" },
        {
          kind: "option",
          config: "config.presentation.guidedTour",
          real: [{ kind: "command", command: "EngentusSaveGuidedTourSession" }],
          else: [{ kind: "delay", ms: 1250 }]
        },
        { kind: "setState", state: "EngentusShellAuthStatus", value: "folding" },
        { kind: "delay", ms: 920 },
        { kind: "setState", state: "EngentusShellActiveRoute", value: "home" },
        { kind: "setState", state: "EngentusShellAuthStatus", value: "signedIn" }
      ]
    },
    {
      trigger: "EngentusSignOutRequested",
      steps: [
        { kind: "setState", state: "EngentusProfileMenuVisible", value: false },
        { kind: "setState", state: "EngentusShellAuthStatus", value: "signingOut" },
        { kind: "setState", state: "EngentusShellActiveRoute", value: "signout" },
        { kind: "delay", ms: 950 },
        { kind: "setState", state: "EngentusShellAuthStatus", value: "signedOut" }
      ]
    },
    {
      trigger: "EngentusSignBackInRequested",
      steps: [
        { kind: "setState", state: "EngentusShellActiveRoute", value: "login" },
        { kind: "setState", state: "EngentusShellAuthStatus", value: "idle" }
      ]
    }
  ]);
});

test("the authored Engentus sign-in story runs through generic process rules with the delay branch", async () => {
  const desire = await shellDesire();
  const world = createWorld();
  applyDesire(world, desire);
  const delays = [];
  const runtime = createProcessRuntime(world, {
    config: { presentation: { guidedTour: false } },
    delayScheduler: async ms => delays.push(ms)
  });

  assert.equal(runtime.value("EngentusShellActiveRoute"), "login");
  assert.equal(runtime.value("EngentusShellAuthStatus"), "idle");

  await runtime.deliverAuthored("EngentusSignInRequested");

  assert.deepEqual(delays, [1250, 920]);
  assert.equal(runtime.value("EngentusShellAuthStatus"), "signedIn");
  assert.equal(runtime.value("EngentusShellActiveRoute"), "home");
  assert.deepEqual(runtime.history("EngentusShellAuthStatus"), ["pending", "folding", "signedIn"]);
  assert.deepEqual(runtime.history("EngentusShellActiveRoute"), ["home"]);
  assert.deepEqual(runtime.trace.map(row => [row.kind, row.label]), [
    ["rule.setState", "EngentusSignInRequested:EngentusShellAuthStatus"],
    ["rule.delay", "EngentusSignInRequested:1250ms"],
    ["rule.setState", "EngentusSignInRequested:EngentusShellAuthStatus"],
    ["rule.delay", "EngentusSignInRequested:920ms"],
    ["rule.setState", "EngentusSignInRequested:EngentusShellActiveRoute"],
    ["rule.setState", "EngentusSignInRequested:EngentusShellAuthStatus"]
  ]);
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
    "NewsFeedList"
  ]);

  assert.deepEqual(surfaces.get("NewsFeedList")?.body?.children, [
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

  assert.deepEqual(surfaces.get("EngentusMillChargeApp")?.body?.children, [
    "EngentusAppChrome",
    "MillChargeBody"
  ]);

  assert.deepEqual(surfaces.get("MillChargeBody")?.body?.children, [
    "MillChargeSidebar",
    "MillChargeViewer",
    "MillChargeMetrics"
  ]);

  assert.deepEqual(surfaces.get("MillChargeSidebar")?.body?.children, [
    "MillChargeSidebarScroll"
  ]);

  assert.deepEqual(surfaces.get("MillChargeSidebarScroll")?.body?.children, [
    "MillChargeParameterSection",
    "MillChargePresetSection"
  ]);

  assert.deepEqual(surfaces.get("MillChargeParameterSection")?.body?.children, [
    "MillChargeParameterTitle",
    "MillChargeSpeedRow",
    "MillChargeFillRow",
    "MillChargeSlurryRow",
    "MillChargeWallFrictionRow",
    "MillChargeInternalFrictionRow",
    "MillChargeBulkDensityRow"
  ]);

  assert.deepEqual(surfaces.get("EngentusHome")?.body?.children, [
    "EngentusHomeChrome",
    "EngentusHomeBody"
  ]);
});

test("the Mill Charge shell authors controls, presets, and metrics rather than empty host placeholders", async () => {
  const desire = await shellDesire();
  const surfaces = nodeMap(desire, "surface");
  const messages = nodeMap(desire, "message");
  const types = nodeMap(desire, "type");
  const process = nodeMap(desire, "process").get("EngentusShellNavigation")?.body;

  for (const state of [
    "MillChargeSpeedFrac",
    "MillChargeFillFrac",
    "MillChargeSlurryContent",
    "MillChargeWallFriction",
    "MillChargeInternalFriction",
    "MillChargeBulkDensity"
  ]) {
    assert.equal(types.get(state)?.body?.role, "state");
    assert.equal(types.get(state)?.body?.valueType, "number");
    assert.ok(process?.state?.includes(state), `process missing state ${state}`);
  }

  assert.deepEqual(surfaces.get("MillChargeSpeedInput")?.body?.interactions, [
    {
      target: "self",
      event: "input",
      action: {
        kind: "setState",
        state: "MillChargeSpeedFrac",
        value: { kind: "eventValue" }
      }
    }
  ]);

  assert.deepEqual(surfaces.get("MillChargePresetSection")?.body?.children, [
    "MillChargePresetTitle",
    "MillChargePresetHardOre",
    "MillChargePresetAverageOre",
    "MillChargePresetClayeyOre",
    "MillChargePresetDenseSlurry"
  ]);

  assert.equal(messages.get("MillChargePresetHardOreRequested")?.body?.writes?.MillChargeInternalFriction, 42);
  assert.equal(messages.get("MillChargePresetDenseSlurryRequested")?.body?.writes?.MillChargeSlurryContent, 0.72);

  assert.deepEqual(surfaces.get("MillChargeMetricsPanel")?.body?.children, [
    "MillChargeMetricShoulder",
    "MillChargeMetricToe",
    "MillChargeMetricCom",
    "MillChargeMetricPower",
    "MillChargeMetricCataracting",
    "MillChargeRegimeBadge"
  ]);
});

test("the module shells declare process and capability dependencies semantically", async () => {
  const desire = await shellDesire();
  const surfaces = nodeMap(desire, "surface");

  const goodman = surfaces.get("EngentusApp");
  const millCharge = surfaces.get("EngentusMillChargeApp");
  const millChargeCanvas = surfaces.get("MillChargeCanvasWrap");
  const millForce = surfaces.get("EngentusMillForceApp");

  assert.equal(goodman?.body?.processRef, "EngentusShellNavigation");
  assert.deepEqual(goodman?.body?.capabilityRefs, ["chart.render"]);
  assert.equal("dependsOnCapabilities" in (goodman?.body?.props ?? {}), false);

  assert.equal(millCharge?.body?.processRef, "EngentusShellNavigation");
  assert.deepEqual(millCharge?.body?.capabilityRefs, []);
  assert.deepEqual(millChargeCanvas?.body?.capabilityRefs, ["chart.render"]);
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
