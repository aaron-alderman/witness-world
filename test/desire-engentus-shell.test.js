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
  assert.ok(messages.has("MillForceShowCrossSectionRequested"));
  assert.ok(messages.has("MillForceShowForceVsAngleRequested"));
  assert.ok(messages.has("MillForceShowForceRoseRequested"));
  assert.ok(messages.has("MillForceShowSingleModeRequested"));
  assert.ok(messages.has("MillForceShowCompareModeRequested"));
  assert.ok(messages.has("MillForceShowMonteCarloModeRequested"));
  assert.ok(messages.has("MillForceSelectGroundedModelRequested"));
  assert.ok(messages.has("MillForceSelectFaithfulModelRequested"));
  assert.ok(messages.has("MillForceRunMonteCarloRequested"));
  assert.ok(messages.has("MillForceClearMonteCarloRequested"));
  assert.ok(messages.has("GoodmanShowStaticRequested"));
  assert.ok(messages.has("GoodmanShowMonteCarloRequested"));
  assert.ok(messages.has("GoodmanShowEditRequested"));
  assert.ok(messages.has("GoodmanToggleCdfWindowRequested"));
  assert.ok(messages.has("GoodmanToggleStatsWindowRequested"));
  assert.ok(messages.has("GoodmanToggleAnovaWindowRequested"));
  assert.ok(messages.has("GoodmanRunRequested"));
  assert.ok(messages.has("GoodmanPauseRunRequested"));
  assert.ok(messages.has("GoodmanResumeRunRequested"));
  assert.ok(messages.has("GoodmanStopRunRequested"));
  assert.equal(types.get("EngentusShellRoute")?.body?.role, "enum");
  assert.equal(types.get("EngentusShellActiveRoute")?.body?.role, "state");
  assert.equal(types.get("EngentusShellAuthState")?.body?.role, "enum");
  assert.equal(types.get("EngentusShellAuthStatus")?.body?.role, "state");
  assert.equal(types.get("EngentusProfileMenuVisible")?.body?.role, "state");
  assert.equal(types.get("EngentusPasswordRevealed")?.body?.role, "state");
  assert.equal(types.get("MillForceChartTab")?.body?.role, "enum");
  assert.equal(types.get("MillForceActiveChartTab")?.body?.role, "state");
  assert.equal(types.get("MillForceAnalysisMode")?.body?.role, "enum");
  assert.equal(types.get("MillForceActiveAnalysisMode")?.body?.role, "state");
  assert.equal(types.get("MillForceModelSelection")?.body?.role, "enum");
  assert.equal(types.get("MillForceActiveModel")?.body?.role, "state");
  assert.equal(types.get("MillForceMcStatus")?.body?.role, "enum");
  assert.equal(types.get("MillForceMcStatusState")?.body?.role, "state");
  assert.equal(types.get("MillForceMcSamples")?.body?.role, "state");
  assert.equal(types.get("MillForcePercentCrit")?.body?.role, "state");
  assert.equal(types.get("MillForceTotalFill")?.body?.role, "state");
  assert.equal(types.get("GoodmanMode")?.body?.role, "enum");
  assert.equal(types.get("GoodmanActiveMode")?.body?.role, "state");
  assert.equal(types.get("GoodmanRunStatus")?.body?.role, "enum");
  assert.equal(types.get("GoodmanRunStatusState")?.body?.role, "state");
  assert.equal(types.get("GoodmanCdfWindowVisible")?.body?.role, "state");
  assert.equal(types.get("GoodmanRunBoltsPerSet")?.body?.role, "state");
  assert.equal(types.get("GoodmanStaticAppliedShear")?.body?.role, "state");
  assert.equal(types.get("GoodmanStaticRpm")?.body?.role, "state");
  assert.equal(types.get("GoodmanStaticEnduranceLimit")?.body?.role, "state");
  assert.equal(types.get("GoodmanStaticSlope")?.body?.role, "state");
  assert.equal(types.get("GoodmanStaticProbeMeanStress")?.body?.role, "state");
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
  assert.deepEqual(surfaces.get("MillForceTabForceVsAngle")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "deliver", message: "MillForceShowForceVsAngleRequested" }
    }
  ]);
  assert.deepEqual(surfaces.get("MillForceModeCompare")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "deliver", message: "MillForceShowCompareModeRequested" }
    }
  ]);
  assert.deepEqual(surfaces.get("MillForceModelFaithful")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "deliver", message: "MillForceSelectFaithfulModelRequested" }
    }
  ]);
  assert.deepEqual(surfaces.get("GoodmanModeMonteCarlo")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "deliver", message: "GoodmanShowMonteCarloRequested" }
    }
  ]);
  assert.deepEqual(surfaces.get("GoodmanActionCdf")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "deliver", message: "GoodmanToggleCdfWindowRequested" }
    }
  ]);
  assert.deepEqual(surfaces.get("GoodmanRunActionStart")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "deliver", message: "GoodmanRunRequested" }
    }
  ]);
  assert.equal(surfaces.get("GoodmanModeStatic")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("GoodmanModeMonteCarlo")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("GoodmanModeEdit")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("GoodmanCdfWindow")?.body?.bindings[0]?.prop, "visible");
  assert.equal(surfaces.get("GoodmanRunConfigBoltsPerSetField")?.body?.bindings[0]?.prop, "value");
  assert.equal(surfaces.get("GoodmanRunConfigBoltsPerSetField")?.body?.bindings[1]?.prop, "disabled");
  assert.equal(surfaces.get("GoodmanRunConfigDurationField")?.body?.bindings[1]?.prop, "disabled");
  assert.equal(surfaces.get("GoodmanRunConfigStepField")?.body?.bindings[1]?.prop, "disabled");
  assert.equal(surfaces.get("GoodmanTimeSlider")?.body?.bindings[1]?.prop, "max");
  assert.equal(surfaces.get("GoodmanTimeSlider")?.body?.bindings[1]?.source?.state, "GoodmanRunDurationMonths");
  assert.equal(surfaces.get("GoodmanPlayAction")?.body?.props?.label, "▶");
  assert.equal(surfaces.get("GoodmanPlayAction")?.body?.interactions?.length ?? 0, 0);
  assert.equal(surfaces.get("GoodmanRunActionStart")?.body?.props?.label, "▶ Run");
  assert.equal(surfaces.get("GoodmanRunActionStop")?.body?.props?.label, "■");
  assert.equal(surfaces.get("GoodmanRunActionStart")?.body?.bindings[0]?.prop, "disabled");
  assert.equal(surfaces.get("GoodmanRunActionPause")?.body?.bindings[0]?.prop, "visible");
  assert.equal(surfaces.get("GoodmanRunActionResume")?.body?.bindings[0]?.prop, "visible");
  assert.equal(surfaces.get("GoodmanRunActionResume")?.body?.interactions[0]?.action?.message, "GoodmanResumeRunRequested");
  assert.equal(surfaces.get("GoodmanRunLockNote")?.body?.bindings[0]?.prop, "visible");
  assert.equal(surfaces.get("GoodmanRunProgressFill")?.body?.bindings[0]?.prop, "style");
  assert.equal(surfaces.get("GoodmanStaticAppliedShearField")?.body?.bindings[0]?.prop, "value");
  assert.equal(surfaces.get("GoodmanStaticAppliedShearField")?.body?.interactions[0]?.action?.state, "GoodmanStaticAppliedShear");
  assert.equal(surfaces.get("GoodmanStaticProbeMeanStressField")?.body?.bindings[0]?.prop, "value");
  assert.equal(surfaces.get("GoodmanStaticProbeMeanStressField")?.body?.interactions[0]?.action?.state, "GoodmanStaticProbeMeanStress");
  assert.equal(surfaces.get("GoodmanTrailToggle")?.body?.interactions[0]?.action?.state, "GoodmanTrailVisible");
  assert.equal(surfaces.get("MillForceTabCrossSection")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("MillForceTabForceVsAngle")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("MillForceTabForceRose")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("MillForceSpeedInput")?.body?.bindings[0]?.prop, "value");
  assert.equal(surfaces.get("MillForceSpeedInput")?.body?.interactions[0]?.action?.state, "MillForcePercentCrit");
  assert.equal(surfaces.get("MillForceFillAngleValue")?.body?.bindings[0]?.source?.output, "gammaText");
  assert.equal(surfaces.get("MillForceShoulderAngleValue")?.body?.bindings[0]?.source?.output, "phiText");
  assert.equal(surfaces.get("MillForceToeAngleValue")?.body?.bindings[0]?.source?.output, "phiPrimeText");
  assert.equal(surfaces.get("MillForceFillAngleDiff")?.body?.bindings[0]?.prop, "visible");
  assert.equal(surfaces.get("MillForceFillAngleDiff")?.body?.bindings[1]?.source?.output, "gammaDeltaPercentText");
  assert.equal(surfaces.get("MillForceToeAngleDiff")?.body?.bindings[0]?.prop, "visible");
  assert.equal(surfaces.get("MillForceToeAngleDiff")?.body?.bindings[1]?.source?.output, "phiPrimeDeltaPercentText");
  assert.equal(surfaces.get("MillForceOmegaValue")?.body?.bindings[0]?.source?.output, "omegaText");
  assert.equal(surfaces.get("MillForceChargeDensityValue")?.body?.bindings[0]?.source?.output, "rhoChargeText");
  assert.equal(surfaces.get("MillForceMaxRadialValue")?.body?.bindings[0]?.source?.output, "F_r_max_text");
  assert.equal(surfaces.get("MillForceMaxResultantValue")?.body?.bindings[0]?.source?.output, "F_resultant_max_text");
  assert.equal(surfaces.get("MillForceCompareFillDeltaValue")?.body?.bindings[0]?.source?.output, "gammaDeltaText");
  assert.equal(surfaces.get("MillForceCompareToeDeltaValue")?.body?.bindings[0]?.source?.output, "phiPrimeDeltaText");
  assert.equal(surfaces.get("MillForceCompareRadialDeltaValue")?.body?.bindings[0]?.source?.output, "F_r_max_delta_text");
  assert.equal(surfaces.get("MillForceCompareResultantDeltaValue")?.body?.bindings[0]?.source?.output, "F_resultant_max_delta_text");
  assert.equal(surfaces.get("MillForceMcSamplesRow")?.body?.surfaceKind, "form-field");
  assert.equal(surfaces.get("MillForceMcSamplesRow")?.body?.className, "mc-row");
  assert.equal(surfaces.get("MillForceMcSamplesRow")?.body?.props?.label, "Samples");
  assert.equal(surfaces.get("MillForceMcSamplesRow")?.body?.props?.inputId, "mill-force-mc-n");
  assert.equal(surfaces.get("MillForceMcSamplesRow")?.body?.props?.inputStyle, "width:70px");
  assert.equal(surfaces.get("MillForceMcSamplesRow")?.body?.bindings[0]?.source?.state, "MillForceMcSamples");
  assert.equal(surfaces.get("MillForceMcSamplesRow")?.body?.interactions[0]?.action?.state, "MillForceMcSamples");
  assert.equal(surfaces.get("MillForceMcJTotalInput")?.body?.bindings[0]?.source?.state, "MillForceMcJTotalFree");
  assert.equal(surfaces.get("MillForceMcJTotalInput")?.body?.interactions[0]?.action?.value?.kind, "eventChecked");
  assert.deepEqual(surfaces.get("MillForceMcJTotalToggle")?.body?.children, [
    "MillForceMcJTotalLabel",
    "MillForceMcJTotalSigma"
  ]);
  assert.equal(surfaces.get("MillForceMcJTotalSigma")?.body?.props?.text, "σ=0.030");
  assert.equal(surfaces.get("MillForceMcPercentCritSigma")?.body?.props?.text, "σ=0.050");
  assert.equal(surfaces.get("MillForceMcPercentSolidsSigma")?.body?.props?.text, "σ=0.050");
  assert.equal(surfaces.get("MillForceMcHeightSigma")?.body?.props?.text, "σ=0.020");
  assert.equal(surfaces.get("MillForceMcRunAction")?.body?.props?.label, "▶ Run");
  assert.equal(surfaces.get("MillForceMcClearAction")?.body?.props?.label, "✕ Clear");
  assert.equal(surfaces.get("MillForceMcClearAction")?.body?.bindings[0]?.prop, "disabled");
  assert.equal(surfaces.get("MillForceMcClearAction")?.body?.bindings[0]?.source?.state, "MillForceMcStatusState");
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

  assert.deepEqual(surfaces.get("GoodmanChartRegion")?.body?.children, [
    "GoodmanDiagram",
    "GoodmanMCBands"
  ]);

  assert.deepEqual(surfaces.get("GoodmanScenarioSection")?.body?.children, [
    "GoodmanStaticAppliedShearField",
    "GoodmanStaticRpmField",
    "GoodmanStaticProbeMeanStressField",
    "GoodmanStaticEnduranceLimitField",
    "GoodmanStaticSlopeField"
  ]);

  assert.deepEqual(surfaces.get("GoodmanSimulationList")?.body?.children, [
    "GoodmanSimulationPrimaryRow",
    "GoodmanSimulationCompareRow"
  ]);

  assert.deepEqual(surfaces.get("GoodmanChartStyleControls")?.body?.children, [
    "GoodmanChartGridToggle",
    "GoodmanChartAnnotationsToggle",
    "GoodmanChartPointSizeRow"
  ]);

  assert.deepEqual(surfaces.get("GoodmanBoltSetsList")?.body?.children, [
    "GoodmanBoltSetPrimaryCard",
    "GoodmanBoltSetMaintenanceCard"
  ]);

  assert.deepEqual(surfaces.get("GoodmanFatigueLegend")?.body?.children, [
    "GoodmanLegendInfiniteRow",
    "GoodmanLegendFiniteRow",
    "GoodmanLegendUnsafeRow"
  ]);

  assert.deepEqual(surfaces.get("GoodmanWindowLayer")?.body?.children, [
    "GoodmanCdfWindow",
    "GoodmanStatsWindow",
    "GoodmanAnovaWindow"
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

  assert.deepEqual(surfaces.get("MillForceModelHost")?.body?.children, [
    "MillForceModelSection",
    "MillForceCompareSection",
    "MillForceMcSection"
  ]);

  assert.deepEqual(surfaces.get("MillForceFillAngleRow")?.body?.children, [
    "MillForceFillAngleLabel",
    "MillForceFillAngleValue",
    "MillForceFillAngleDiff"
  ]);

  assert.deepEqual(surfaces.get("MillForceToeAngleRow")?.body?.children, [
    "MillForceToeAngleLabel",
    "MillForceToeAngleValue",
    "MillForceToeAngleDiff"
  ]);

  assert.deepEqual(surfaces.get("MillForceCompareSection")?.body?.children, [
    "MillForceCompareTitle",
    "MillForceCompareGroundedRow",
    "MillForceCompareFaithfulRow",
    "MillForceCompareFillDeltaRow",
    "MillForceCompareToeDeltaRow",
    "MillForceCompareRadialDeltaRow",
    "MillForceCompareResultantDeltaRow"
  ]);

  assert.deepEqual(surfaces.get("MillForceMcSection")?.body?.children, [
    "MillForceMcTitleText",
    "MillForceMcSamplesRow",
    "MillForceMcVaryTitle",
    "MillForceMcJTotalToggle",
    "MillForceMcPercentCritToggle",
    "MillForceMcPercentSolidsToggle",
    "MillForceMcHeightToggle",
    "MillForceMcActions",
    "MillForceMcStatusText"
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

test("the Goodman shell authors sidebar and window content rather than empty host placeholders", async () => {
  const desire = await shellDesire();
  const surfaces = nodeMap(desire, "surface");
  const source = await shellSource();

  for (const removed of [
    "GoodmanScenarioHost",
    "GoodmanSimulationListHost",
    "GoodmanChartStyleHost",
    "GoodmanBoltSetsHost",
    "GoodmanFatigueLegendHost"
  ]) {
    assert.equal(surfaces.has(removed), false, `${removed} should not remain a surface`);
    assert.equal(source.includes(`view ${removed}`), false, `${removed} should not remain in shell source`);
  }

  assert.equal(surfaces.get("GoodmanCdfWindow")?.body?.surfaceKind, "floating-window");
  assert.equal(surfaces.get("GoodmanStatsWindow")?.body?.surfaceKind, "floating-window");
  assert.equal(surfaces.get("GoodmanAnovaWindow")?.body?.surfaceKind, "floating-window");
  assert.deepEqual(surfaces.get("GoodmanCdfWindowBody")?.body?.children, ["GoodmanCdfEmptyChart"]);
  assert.deepEqual(surfaces.get("GoodmanStatsWindowBody")?.body?.children, ["GoodmanStatsTable"]);
  assert.deepEqual(surfaces.get("GoodmanStatsHeaderRow")?.body?.children, [
    "GoodmanStatsHeadSimulation",
    "GoodmanStatsHeadBoltSet",
    "GoodmanStatsHeadN",
    "GoodmanStatsHeadFailed",
    "GoodmanStatsHeadMean",
    "GoodmanStatsHeadStd",
    "GoodmanStatsHeadP10",
    "GoodmanStatsHeadP50",
    "GoodmanStatsHeadP90"
  ]);
  assert.deepEqual(surfaces.get("GoodmanAnovaWindowBody")?.body?.children, [
    "GoodmanAnovaStatBlock",
    "GoodmanAnovaNote",
    "GoodmanAnovaBoxPlot"
  ]);
  assert.equal(surfaces.get("GoodmanRunProgressLabel")?.body?.bindings[0]?.source?.kind, "state");
  assert.equal(surfaces.get("GoodmanSimulationPrimaryBadge")?.body?.bindings[0]?.source?.state, "GoodmanRunStatusState");
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
