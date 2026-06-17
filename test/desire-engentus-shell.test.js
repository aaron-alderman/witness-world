import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createWorld, projectors } from "../src/kernel.js";
import { loadWitnessAppFile } from "../src/dsl.js";
import {
  applyDesire,
  compileRvmFileToDesirePlus,
  compileWtomlDocsToDesirePlus,
  createProcessRuntime,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";
import {
  DEFAULT_STATE as GOODMAN_DEFAULT_STATE,
  PARAM_CATS as GOODMAN_PARAM_CATS,
  PARAM_META as GOODMAN_PARAM_META
} from "../example-ports/engentus/js/store.js";

const shellFiles = [
  "shell.rvm",
  "shell-shared.rvm",
  "shell-auth.rvm",
  "shell-goodman.rvm",
  "shell-mill-charge.rvm",
  "shell-mill-force.rvm",
  "shell-platform-config.rvm"
].map(file => path.join(process.cwd(), "examples", "engentus", "app", file));
const appFile = path.join(process.cwd(), "examples", "engentus", "app.wtoml");
const boltDefinitionFile = path.join(process.cwd(), "examples", "engentus", "app", "models", "goodman-bolt-sets.rvm");

async function shellDesire() {
  const loaded = await loadWitnessAppFile(appFile);
  const witnessDesire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(loaded.witnessDocs));
  const authoredNodes = loaded.authoredDesireDocs.flatMap(doc => doc.nodes ?? []);
  return {
    ...witnessDesire,
    nodes: [...witnessDesire.nodes, ...authoredNodes]
  };
}

async function boltDefinitionDesire() {
  return normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(boltDefinitionFile));
}

async function shellSource() {
  const sources = await Promise.all(shellFiles.map(file => fs.readFile(file, "utf8")));
  return sources.join("\n\n");
}

function nodeMap(desire, kind) {
  return new Map(desire.nodes.filter(node => node.kind === kind).map(node => [node.name, node]));
}

function safeSurfaceName(value) {
  return String(value)
    .replace(/^[^A-Za-z_]+/, "")
    .replace(/[^A-Za-z0-9]+(.)/g, (_, ch) => ch.toUpperCase())
    .replace(/[^A-Za-z0-9]/g, "")
    .replace(/^./, ch => ch.toUpperCase());
}

function boltParamSurfaceName(paramKey) {
  return `GoodmanBoltParam${safeSurfaceName(paramKey)}`;
}

function prefixedDistProp(prefix, key) {
  return `${prefix}${key[0].toUpperCase()}${key.slice(1)}`;
}

function boltEditorSetInfo() {
  return [
    { prefix: "Rubber", paramPrefix: "GoodmanBoltRubberParam", paramsSurface: "GoodmanBoltSetRubberParams" },
    { prefix: "Jemtec", paramPrefix: "GoodmanBoltJemtecParam", paramsSurface: "GoodmanBoltSetJemtecParams" }
  ];
}

function setParamsForEditor(setInfo, paramKey) {
  const set = setInfo.prefix === "Rubber"
    ? GOODMAN_DEFAULT_STATE.boltSets.bs_rubber
    : GOODMAN_DEFAULT_STATE.boltSets.bs_jemtec;
  return set.params[paramKey];
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
    "EngentusPlatformConfigApp",
    "EngentusSignout"
  ]) {
    assert.ok(surfaces.has(screen), `missing surface ${screen}`);
  }

  assert.ok(processes.has("EngentusShellNavigation"));
  assert.ok(messages.has("EngentusSignInRequested"));
  assert.ok(messages.has("EngentusSaveGuidedTourSession"));
  assert.ok(messages.has("EngentusSignOutRequested"));
  assert.ok(messages.has("EngentusSignBackInRequested"));
  assert.ok(messages.has("EngentusSessionOpened"));
  assert.ok(messages.has("EngentusSessionOpenFailed"));
  assert.ok(messages.has("EngentusSessionClosed"));
  assert.ok(messages.has("EngentusNavigateHomeRequested"));
  assert.ok(messages.has("EngentusNavigateGoodmanRequested"));
  assert.ok(messages.has("EngentusNavigateMillChargeRequested"));
  assert.ok(messages.has("EngentusNavigateMillForceRequested"));
  assert.ok(messages.has("EngentusNavigatePlatformConfigRequested"));
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
  assert.ok(messages.has("GoodmanSaveStaticSimulationRequested"));
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
  assert.equal(types.get("EngentusLoginUsername")?.body?.role, "state");
  assert.equal(types.get("EngentusLoginPassword")?.body?.role, "state");
  assert.equal(types.get("EngentusAuthNotice")?.body?.role, "state");
  assert.equal(types.get("MillForceChartTab")?.body?.role, "enum");
  assert.equal(types.get("MillForceActiveChartTab")?.body?.role, "state");
  assert.equal(types.get("MillForceAnalysisMode")?.body?.role, "enum");
  assert.equal(types.get("MillForceActiveAnalysisMode")?.body?.role, "state");
  assert.equal(types.get("MillForceChartAnalysisMode")?.body?.role, "state");
  assert.equal(types.get("MillForceModelSelection")?.body?.role, "enum");
  assert.equal(types.get("MillForceActiveModel")?.body?.role, "state");
  assert.equal(types.get("MillForceMcStatus")?.body?.role, "enum");
  assert.equal(types.get("MillForceMcStatusState")?.body?.role, "state");
  assert.equal(types.get("MillForceMcConfigOpen")?.body?.role, "state");
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
  assert.equal(types.get("GoodmanChartTitle")?.body?.role, "state");
  assert.equal(types.get("GoodmanChartTitle")?.body?.valueType, "string");
  assert.equal(types.get("GoodmanChartTitle")?.body?.initial, "Goodman Fatigue Diagram — M48 Mill Liner Bolt");
  assert.equal(types.get("GoodmanChartXAxisLabel")?.body?.role, "state");
  assert.equal(types.get("GoodmanChartXAxisLabel")?.body?.initial, "Preload / Mean Stress  (MPa)");
  assert.equal(types.get("GoodmanChartYAxisLabel")?.body?.role, "state");
  assert.equal(types.get("GoodmanChartYAxisLabel")?.body?.initial, "Alternating Bending Stress  (MPa)");
  assert.equal(types.get("GoodmanChartTitleSize")?.body?.valueType, "number");
  assert.equal(types.get("GoodmanChartAxisSize")?.body?.valueType, "number");
  assert.equal(types.get("GoodmanChartBandFill1")?.body?.valueType, "string");
  assert.equal(types.get("GoodmanBoltPrimaryParamsOpen")?.body?.valueType, "bool");
  assert.equal(types.get("GoodmanBoltPrimaryEditVisible")?.body?.valueType, "bool");
  assert.equal(types.get("GoodmanBoltPrimaryNameState")?.body?.valueType, "string");
  assert.equal(types.get("GoodmanBoltPrimaryColorState")?.body?.valueType, "string");
  assert.equal(types.get("GoodmanBoltPrimaryUts")?.body?.valueType, "number");
  assert.equal(types.get("GoodmanBoltPrimaryUtsFree")?.body?.valueType, "bool");
  assert.equal(types.get("GoodmanBoltPrimaryUtsDist")?.body?.valueType, "string");
  assert.equal(types.get("GoodmanBoltPrimaryYieldStress")?.body?.valueType, "number");
  assert.equal(surfaces.get("EngentusRoot")?.body?.processRef, "EngentusShellNavigation");
  assert.equal(surfaces.get("EngentusLoginBook")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("EngentusLoginEmailField")?.body?.bindings[0]?.source?.state, "EngentusLoginUsername");
  assert.equal(surfaces.get("EngentusLoginEmailField")?.body?.interactions[0]?.action?.state, "EngentusLoginUsername");
  assert.equal(surfaces.get("EngentusLoginPasswordField")?.body?.bindings[0]?.prop, "inputType");
  assert.equal(surfaces.get("EngentusLoginPasswordField")?.body?.bindings[1]?.source?.state, "EngentusLoginPassword");
  assert.equal(surfaces.get("EngentusLoginPasswordField")?.body?.interactions[0]?.action?.state, "EngentusLoginPassword");
  assert.equal(surfaces.get("EngentusProfileMenu")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("EngentusProfileMenu")?.body?.bindings[0]?.source?.map?.true, "open");
  assert.deepEqual(surfaces.get("EngentusLoginPrimaryAction")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "setState", state: "EngentusLoginUsername", value: { literal: "aaron" } }
    },
    {
      target: "self",
      event: "click",
      action: { kind: "setState", state: "EngentusLoginPassword", value: { literal: "aaron" } }
    },
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
  assert.deepEqual(surfaces.get("MillForceModelFaithfulInput")?.body?.interactions, [
    {
      target: "self",
      event: "change",
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
  assert.equal(surfaces.get("GoodmanModeStatic")?.body?.props?.tag, "button");
  assert.equal(surfaces.get("GoodmanModeMonteCarlo")?.body?.props?.tag, "button");
  assert.equal(surfaces.get("GoodmanModeEdit")?.body?.props?.tag, "button");
  assert.deepEqual(surfaces.get("GoodmanActionCdf")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "deliver", message: "GoodmanToggleCdfWindowRequested" }
    }
  ]);
  assert.deepEqual(surfaces.get("GoodmanSaveStaticSimulationAction")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "deliver", message: "GoodmanSaveStaticSimulationRequested" }
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
  assert.equal(surfaces.get("GoodmanRunLockNote")?.body?.bindings[0]?.source?.map?.done, true);
  assert.equal(surfaces.get("GoodmanRunProgressFill")?.body?.bindings[0]?.prop, "style");
  assert.match(surfaces.get("GoodmanRunProgressFill")?.body?.bindings[0]?.source?.map?.done, /width:100%/);
  assert.equal(surfaces.get("GoodmanStaticAppliedShearInput")?.body?.bindings[0]?.prop, "value");
  assert.equal(surfaces.get("GoodmanStaticAppliedShearInput")?.body?.interactions[0]?.action?.state, "GoodmanStaticAppliedShear");
  assert.equal(surfaces.get("GoodmanStaticProbeMeanStressInput")?.body?.bindings[0]?.prop, "value");
  assert.equal(surfaces.get("GoodmanStaticProbeMeanStressInput")?.body?.interactions[0]?.action?.state, "GoodmanStaticProbeMeanStress");
  assert.equal(surfaces.get("GoodmanTrailToggle")?.body?.interactions[0]?.action?.state, "GoodmanTrailVisible");
  assert.equal(surfaces.get("GoodmanCdfWindowTitle")?.body?.props?.text, "📈 Failure CDF — Bolt Survival Over Time");
  assert.equal(surfaces.get("GoodmanStatsWindowTitle")?.body?.props?.text, "📊 Summary Statistics");
  assert.equal(surfaces.get("GoodmanAnovaWindowTitle")?.body?.props?.text, "🔬 ANOVA — Between-Group Comparison");
  assert.equal(surfaces.get("MillForceTabCrossSection")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("MillForceTabForceVsAngle")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("MillForceTabForceRose")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("MillForceSpeedInput")?.body?.bindings[0]?.prop, "value");
  assert.equal(surfaces.get("MillForceSpeedInput")?.body?.interactions[0]?.action?.state, "MillForcePercentCrit");
  assert.equal(surfaces.get("MillForceFillAngleValue")?.body?.bindings[0]?.source?.projection, "gammaText");
  assert.equal(surfaces.get("MillForceShoulderAngleValue")?.body?.bindings[0]?.source?.projection, "phiText");
  assert.equal(surfaces.get("MillForceToeAngleValue")?.body?.bindings[0]?.source?.projection, "phiPrimeText");
  assert.equal(surfaces.get("MillForceFillAngleDiff")?.body?.bindings[0]?.prop, "visible");
  assert.equal(surfaces.get("MillForceFillAngleDiff")?.body?.bindings[1]?.source?.projection, "gammaDeltaPercentText");
  assert.equal(surfaces.get("MillForceToeAngleDiff")?.body?.bindings[0]?.prop, "visible");
  assert.equal(surfaces.get("MillForceToeAngleDiff")?.body?.bindings[1]?.source?.projection, "phiPrimeDeltaPercentText");
  assert.equal(surfaces.get("MillForceOmegaValue")?.body?.bindings[0]?.source?.projection, "omegaText");
  assert.equal(surfaces.get("MillForceChargeDensityValue")?.body?.bindings[0]?.source?.projection, "rhoChargeText");
  assert.equal(surfaces.get("MillForceMaxRadialValue")?.body?.bindings[0]?.source?.projection, "F_r_max_text");
  assert.equal(surfaces.get("MillForceMaxResultantValue")?.body?.bindings[0]?.source?.projection, "F_resultant_max_text");
  assert.deepEqual(surfaces.get("MillForceResultsSection")?.body?.children, [
    "MillForceResultsTitle",
    "MillForceFillAngleRow",
    "MillForceShoulderAngleRow",
    "MillForceToeAngleRow",
    "MillForceOmegaRow",
    "MillForceChargeDensityRow",
    "MillForceMaxRadialRow",
    "MillForceMaxResultantRow"
  ]);
  assert.equal(surfaces.has("MillForceModeStateRow"), false);
  assert.equal(surfaces.has("MillForceModelStateRow"), false);
  assert.equal(surfaces.has("MillForceCompareSection"), false);
  assert.equal(surfaces.has("MillForceCompareFillDeltaRow"), false);
  assert.equal(surfaces.has("MillForceCompareResultantDeltaRow"), false);
  assert.equal(surfaces.get("MillForceModelGroundedInput")?.body?.props?.inputType, "radio");
  assert.equal(surfaces.get("MillForceModelGroundedInput")?.body?.props?.name, "mill-force-model-sel");
  assert.equal(surfaces.get("MillForceModelGroundedInput")?.body?.bindings[0]?.prop, "checked");
  assert.equal(surfaces.get("MillForceModelGroundedInput")?.body?.bindings[0]?.source?.state, "MillForceActiveModel");
  assert.equal(surfaces.get("MillForceModelFaithfulInput")?.body?.props?.inputType, "radio");
  assert.equal(surfaces.get("MillForceModelFaithfulInput")?.body?.props?.name, "mill-force-model-sel");
  assert.deepEqual(surfaces.get("MillForceModelChoices")?.body?.children, [
    "MillForceModelGroundedLabel",
    "MillForceModelFaithfulLabel"
  ]);
  assert.equal(surfaces.has("MillForceModelNote"), false);
  assert.equal(surfaces.get("MillForceMcTitleText")?.body?.surfaceKind, "action");
  assert.equal(surfaces.get("MillForceMcTitleText")?.body?.interactions[0]?.action?.state, "MillForceMcConfigOpen");
  assert.equal(surfaces.get("MillForceMcTitleText")?.body?.interactions[0]?.action?.value?.kind, "toggleState");
  assert.deepEqual(surfaces.get("MillForceMcTitleText")?.body?.children, [
    "MillForceMcTitleLabel",
    "MillForceMcChevron"
  ]);
  assert.equal(surfaces.get("MillForceMcChevron")?.body?.bindings[0]?.source?.state, "MillForceMcConfigOpen");
  assert.equal(surfaces.get("MillForceMcBody")?.body?.bindings[0]?.prop, "visible");
  assert.equal(surfaces.get("MillForceMcBody")?.body?.bindings[0]?.source?.state, "MillForceMcConfigOpen");
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
  const shellRules = new Map((processes.get("EngentusShellNavigation")?.body?.rules ?? []).map(rule => [rule.trigger, rule.steps]));
  assert.deepEqual(shellRules.get("EngentusSignInRequested"), [
    { kind: "setState", state: "EngentusShellAuthStatus", value: "pending" },
    { kind: "setState", state: "EngentusAuthNotice", value: "" },
    { kind: "command", command: "EngentusOpenSession" }
  ]);
  assert.deepEqual(shellRules.get("EngentusSessionOpened"), [
    {
      kind: "option",
      config: "config.presentation.guidedTour",
      real: [{ kind: "command", command: "EngentusSaveGuidedTourSession" }],
      else: [{ kind: "delay", ms: 1250 }]
    },
    { kind: "setState", state: "EngentusShellAuthStatus", value: "folding" },
    { kind: "delay", ms: 920 },
    { kind: "setState", state: "EngentusShellAuthStatus", value: "signedIn" }
  ]);
  assert.deepEqual(shellRules.get("PlatformConfigOpenAccessRequested"), [
    { kind: "setState", state: "EngentusShellActiveRoute", value: "platform-config-access" },
    { kind: "setState", state: "PlatformConfigAccessBusy", value: true },
    { kind: "setState", state: "PlatformConfigNoticeTone", value: "warn" },
    { kind: "setState", state: "PlatformConfigNoticeText", value: "Loading identities and feature policies..." },
    { kind: "command", command: "PlatformConfigLoadSnapshot" }
  ]);
  assert.deepEqual(shellRules.get("PlatformConfigLoadAccessIdentityRequested"), [
    { kind: "setState", state: "PlatformConfigAccessBusy", value: true },
    { kind: "setState", state: "PlatformConfigNoticeTone", value: "warn" },
    { kind: "setState", state: "PlatformConfigNoticeText", value: "Loading identity..." },
    { kind: "command", command: "PlatformConfigLoadAccessIdentity" }
  ]);
  assert.deepEqual(shellRules.get("PlatformConfigUpdateAccessFeatureRequested"), [
    { kind: "setState", state: "PlatformConfigAccessBusy", value: true },
    { kind: "setState", state: "PlatformConfigNoticeTone", value: "warn" },
    { kind: "setState", state: "PlatformConfigNoticeText", value: "Updating feature policy..." },
    { kind: "command", command: "PlatformConfigUpdateAccessFeature" }
  ]);
  assert.deepEqual(shellRules.get("MillForceRunMonteCarloRequested"), [
    { kind: "setState", state: "MillForceActiveAnalysisMode", value: "mc" },
    { kind: "setState", state: "MillForceMcConfigOpen", value: true },
    { kind: "setState", state: "MillForceMcStatusState", value: "calculating" },
    { kind: "delay", ms: 120 },
    { kind: "setState", state: "MillForceChartAnalysisMode", value: "mc" },
    { kind: "setState", state: "MillForceMcStatusState", value: "running" }
  ]);
});

test("the authored Engentus sign-in story runs through generic process rules with the delay branch", async () => {
  const desire = await shellDesire();
  const world = createWorld();
  applyDesire(world, desire);
  const delays = [];
  const runtime = createProcessRuntime(world, {
    config: { presentation: { guidedTour: false } },
    delayScheduler: async ms => delays.push(ms),
    routeInvoker: async ({ command }) => {
      assert.equal(command, "EngentusOpenSession");
      return {
        status: "success",
        payload: {
          authenticated: true,
          actor: "aaron",
          identity: "identity.aaron",
          label: "Aaron",
          displayName: "Aaron A.",
          jobTitle: "Lead Engineer",
          initials: "AA",
          resumeRouteKey: "platform-config-access",
          featureAccess__engentus_mill_force: "granted",
          featureAccess__engentus_platform_config: "granted"
        }
      };
    }
  });

  assert.equal(runtime.value("EngentusShellActiveRoute"), "login");
  assert.equal(runtime.value("EngentusShellAuthStatus"), "idle");

  await runtime.deliverAuthored("EngentusSignInRequested");

  assert.deepEqual(delays, [1250, 920]);
  assert.equal(runtime.value("EngentusShellAuthStatus"), "signedIn");
  assert.equal(runtime.value("EngentusShellActiveRoute"), "platform-config-access");
  assert.deepEqual(runtime.history("EngentusShellAuthStatus"), ["pending", "folding", "signedIn"]);
  assert.deepEqual(runtime.history("EngentusShellActiveRoute"), ["platform-config-access"]);
  assert.deepEqual(runtime.trace.map(row => [row.kind, row.label]), [
    ["deliver", "EngentusSignInRequested"],
    ["rule.setState", "EngentusSignInRequested:EngentusShellAuthStatus"],
    ["rule.setState", "EngentusSignInRequested:EngentusAuthNotice"],
    ["dispatch", "EngentusOpenSession"],
    ["deliver", "EngentusSessionOpened"],
    ["rule.delay", "EngentusSessionOpened:1250ms"],
    ["rule.setState", "EngentusSessionOpened:EngentusShellAuthStatus"],
    ["rule.delay", "EngentusSessionOpened:920ms"],
    ["rule.setState", "EngentusSessionOpened:EngentusShellAuthStatus"]
  ]);
});

test("the authored Mill Force Monte Carlo run has a visible calculating delay before computed output", async () => {
  const desire = await shellDesire();
  const world = createWorld();
  applyDesire(world, desire);
  const delays = [];
  const runtime = createProcessRuntime(world, {
    delayScheduler: async ms => delays.push(ms)
  });

  await runtime.deliverAuthored("MillForceRunMonteCarloRequested");

  assert.deepEqual(delays, [120]);
  assert.equal(runtime.value("MillForceActiveAnalysisMode"), "mc");
  assert.equal(runtime.value("MillForceChartAnalysisMode"), "mc");
  assert.equal(runtime.value("MillForceMcConfigOpen"), true);
  assert.equal(runtime.value("MillForceMcStatusState"), "running");
  assert.deepEqual(runtime.trace.slice(-6).map(observation => [observation.kind, observation.label]), [
    ["rule.setState", "MillForceRunMonteCarloRequested:MillForceActiveAnalysisMode"],
    ["rule.setState", "MillForceRunMonteCarloRequested:MillForceMcConfigOpen"],
    ["rule.setState", "MillForceRunMonteCarloRequested:MillForceMcStatusState"],
    ["rule.delay", "MillForceRunMonteCarloRequested:120ms"],
    ["rule.setState", "MillForceRunMonteCarloRequested:MillForceChartAnalysisMode"],
    ["rule.setState", "MillForceRunMonteCarloRequested:MillForceMcStatusState"]
  ]);
});

test("the authored Goodman Monte Carlo run completes through a process-owned done state", async () => {
  const desire = await shellDesire();
  const world = createWorld();
  applyDesire(world, desire);
  const delays = [];
  const runtime = createProcessRuntime(world, {
    delayScheduler: async ms => delays.push(ms)
  });

  await runtime.deliverAuthored("GoodmanRunRequested");

  assert.deepEqual(delays, [220]);
  assert.equal(runtime.value("GoodmanActiveMode"), "mc");
  assert.equal(runtime.value("GoodmanSimulationSelected"), true);
  assert.equal(runtime.value("GoodmanRunConfigVisible"), true);
  assert.equal(runtime.value("GoodmanRunStatusState"), "done");
  assert.deepEqual(runtime.history("GoodmanRunStatusState"), ["running", "done"]);
  assert.deepEqual(runtime.trace.slice(-6).map(observation => [observation.kind, observation.label]), [
    ["rule.setState", "GoodmanRunRequested:GoodmanActiveMode"],
    ["rule.setState", "GoodmanRunRequested:GoodmanSimulationSelected"],
    ["rule.setState", "GoodmanRunRequested:GoodmanRunConfigVisible"],
    ["rule.setState", "GoodmanRunRequested:GoodmanRunStatusState"],
    ["rule.delay", "GoodmanRunRequested:220ms"],
    ["rule.setState", "GoodmanRunRequested:GoodmanRunStatusState"]
  ]);
});

test("the Goodman bolt-set definitions mirror the oracle PARAM_META and DEFAULT_STATE", async () => {
  const desire = await boltDefinitionDesire();
  const surfaces = nodeMap(desire, "surface");
  const categoryKeys = Object.keys(GOODMAN_PARAM_CATS);
  const paramKeys = Object.keys(GOODMAN_PARAM_META);
  const distKeys = ["value", "free", "dist", "mean", "std", "umin", "umax", "lm", "ls", "tri_a", "tri_c", "tri_b", "prob"];

  assert.deepEqual(surfaces.get("GoodmanBoltSetDefinitions")?.body?.children, [
    "GoodmanBoltSetRubberDefinition",
    "GoodmanBoltSetJemtecDefinition",
    "GoodmanBoltParamCatalog"
  ]);

  for (const [surfaceId, set] of [
    ["GoodmanBoltSetRubberDefinition", GOODMAN_DEFAULT_STATE.boltSets.bs_rubber],
    ["GoodmanBoltSetJemtecDefinition", GOODMAN_DEFAULT_STATE.boltSets.bs_jemtec]
  ]) {
    assert.deepEqual(surfaces.get(surfaceId)?.body?.props, {
      boltSetId: set.id,
      name: set.name,
      color: set.color,
      visible: set.visible,
      paramCatalog: "GoodmanBoltParamCatalog"
    });
  }

  assert.deepEqual(
    surfaces.get("GoodmanBoltParamCatalog")?.body?.children,
    categoryKeys.map(categoryKey => `GoodmanBoltParamCategory${safeSurfaceName(categoryKey)}`)
  );

  for (const categoryKey of categoryKeys) {
    const categorySurface = surfaces.get(`GoodmanBoltParamCategory${safeSurfaceName(categoryKey)}`);
    const expectedChildren = paramKeys
      .filter(paramKey => GOODMAN_PARAM_META[paramKey].cat === categoryKey)
      .map(boltParamSurfaceName);
    assert.deepEqual(categorySurface?.body?.props, {
      categoryKey,
      label: GOODMAN_PARAM_CATS[categoryKey]
    });
    assert.deepEqual(categorySurface?.body?.children, expectedChildren);
  }

  for (const paramKey of paramKeys) {
    const meta = GOODMAN_PARAM_META[paramKey];
    const expected = {
      paramKey,
      category: meta.cat,
      label: meta.label,
      unit: meta.unit,
      min: meta.min,
      max: meta.max,
      step: meta.step,
      valueType: meta.type
    };

    for (const [prefix, set] of [
      ["rubber", GOODMAN_DEFAULT_STATE.boltSets.bs_rubber],
      ["jemtec", GOODMAN_DEFAULT_STATE.boltSets.bs_jemtec]
    ]) {
      const spec = set.params[paramKey];
      for (const distKey of distKeys) {
        if (Object.hasOwn(spec, distKey)) expected[prefixedDistProp(prefix, distKey)] = spec[distKey];
      }
    }

    assert.deepEqual(surfaces.get(boltParamSurfaceName(paramKey))?.body?.props, expected, paramKey);
  }
});

test("the Goodman bolt-set editor authors full distribution controls for every oracle parameter", async () => {
  const desire = await boltDefinitionDesire();
  const surfaces = nodeMap(desire, "surface");
  const processes = nodeMap(desire, "process");
  const types = nodeMap(desire, "type");
  const categoryKeys = Object.keys(GOODMAN_PARAM_CATS);
  const paramKeys = Object.keys(GOODMAN_PARAM_META);
  const distributionOptions = ["fixed", "normal", "uniform", "lognormal", "triangular"];
  const distributionGroups = ["Normal", "Uniform", "Lognormal", "Triangular"];

  assert.ok(processes.has("GoodmanBoltSetEditor"));

  for (const setInfo of boltEditorSetInfo()) {
    assert.deepEqual(
      surfaces.get(setInfo.paramsSurface)?.body?.children,
      categoryKeys.map(categoryKey => `GoodmanBoltSet${setInfo.prefix}Category${safeSurfaceName(categoryKey)}`)
    );

    for (const categoryKey of categoryKeys) {
      const expectedRows = paramKeys
        .filter(paramKey => GOODMAN_PARAM_META[paramKey].cat === categoryKey)
        .map(paramKey => `${setInfo.paramPrefix}${safeSurfaceName(paramKey)}Row`);
      assert.deepEqual(
        surfaces.get(`GoodmanBoltSet${setInfo.prefix}Category${safeSurfaceName(categoryKey)}`)?.body?.children,
        [`GoodmanBoltSet${setInfo.prefix}Category${safeSurfaceName(categoryKey)}Title`, ...expectedRows]
      );
    }

    for (const paramKey of paramKeys) {
      const meta = GOODMAN_PARAM_META[paramKey];
      const base = `${setInfo.paramPrefix}${safeSurfaceName(paramKey)}`;
      assert.equal(surfaces.get(`${base}Row`)?.body?.processRef, "GoodmanBoltSetEditor");
      assert.equal(types.get(`GoodmanBolt${setInfo.prefix}${safeSurfaceName(paramKey)}Value`)?.body?.role, "state");

      if (meta.type === "toggle") {
        assert.deepEqual(surfaces.get(`${base}Row`)?.body?.children, [`${base}Top`]);
        assert.equal(surfaces.get(`${base}Checkbox`)?.body?.props?.inputType, "checkbox");
        assert.equal(
          surfaces.get(`${base}Checkbox`)?.body?.interactions?.[0]?.action?.state,
          `GoodmanBolt${setInfo.prefix}${safeSurfaceName(paramKey)}Value`
        );
        continue;
      }

      assert.deepEqual(surfaces.get(`${base}Row`)?.body?.children, [
        `${base}Top`,
        `${base}Slider`,
        `${base}DistBox`
      ]);
      assert.equal(types.get(`GoodmanBolt${setInfo.prefix}${safeSurfaceName(paramKey)}Free`)?.body?.role, "state");
      assert.equal(types.get(`GoodmanBolt${setInfo.prefix}${safeSurfaceName(paramKey)}Dist`)?.body?.role, "state");
      assert.equal(surfaces.get(`${base}Slider`)?.body?.props?.min, meta.min);
      assert.equal(surfaces.get(`${base}Slider`)?.body?.props?.max, meta.max);
      assert.equal(surfaces.get(`${base}Slider`)?.body?.props?.step, meta.step);
      assert.equal(surfaces.get(`${base}FreeToggle`)?.body?.interactions?.[0]?.action?.state, `GoodmanBolt${setInfo.prefix}${safeSurfaceName(paramKey)}Free`);
      assert.equal(surfaces.get(`${base}DistSelect`)?.body?.props?.tag, "select");
      assert.equal(surfaces.get(`${base}DistSelect`)?.body?.interactions?.[0]?.action?.state, `GoodmanBolt${setInfo.prefix}${safeSurfaceName(paramKey)}Dist`);
      assert.deepEqual(
        surfaces.get(`${base}DistSelect`)?.body?.children,
        distributionOptions.map(option => `${base}Dist${safeSurfaceName(option)}`)
      );
      for (const option of distributionOptions) {
        assert.equal(surfaces.get(`${base}Dist${safeSurfaceName(option)}`)?.body?.props?.value, option);
      }
      assert.equal(surfaces.get(`${base}Dist${safeSurfaceName(setParamsForEditor(setInfo, paramKey).dist)}`)?.body?.props?.selected, true);
      for (const group of distributionGroups) {
        assert.ok(surfaces.has(`${base}Dist${group}Inputs`), `${base}Dist${group}Inputs`);
      }
    }
  }
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
    "GoodmanSidebarScroll"
  ]);

  assert.deepEqual(surfaces.get("GoodmanSidebarScroll")?.body?.children, [
    "GoodmanScenarioSection",
    "GoodmanSimulationSection",
    "GoodmanRunConfigSection",
    "GoodmanChartStyleSection",
    "GoodmanBoltSetsSection",
    "GoodmanFatigueLegendSection"
  ]);

  assert.deepEqual(surfaces.get("GoodmanChartRegion")?.body?.children, [
    "GoodmanDiagram"
  ]);
  assert.deepEqual(surfaces.get("GoodmanChartArea")?.body?.children, [
    "GoodmanScrubber",
    "GoodmanChartRegion",
    "GoodmanWindowLayer"
  ]);
  assert.deepEqual(surfaces.get("GoodmanBody")?.body?.children, [
    "GoodmanSidebar",
    "GoodmanChartArea"
  ]);
  assert.equal(surfaces.get("GoodmanBody")?.body?.props?.domId, "body");

  assert.deepEqual(surfaces.get("GoodmanScenarioSection")?.body?.children, [
    "GoodmanScenarioTitle",
    "GoodmanStaticAppliedShearField",
    "GoodmanStaticRpmField",
    "GoodmanStaticEnduranceLimitField",
    "GoodmanStaticSlopeField",
    "GoodmanStaticProbeMeanStressField",
    "GoodmanProbeComparisonBox",
    "GoodmanSaveStaticSimulationAction"
  ]);
  assert.deepEqual(surfaces.get("GoodmanProbeComparisonBox")?.body?.children, [
    "GoodmanProbeIntro",
    "GoodmanProbeComparisonRows"
  ]);
  assert.deepEqual(surfaces.get("GoodmanProbeComparisonRows")?.body?.children, [
    "GoodmanProbePrimaryCard",
    "GoodmanProbeMaintenanceCard"
  ]);
  assert.equal(
    surfaces.get("GoodmanProbePrimaryShearValue")?.body?.bindings?.[0]?.source?.output,
    "probe_shear_text"
  );
  assert.equal(
    surfaces.get("GoodmanProbePrimaryDamageValue")?.body?.bindings?.[0]?.source?.output,
    "probe_damage_text"
  );
  assert.equal(
    surfaces.get("GoodmanProbeMaintenanceShearValue")?.body?.bindings?.[0]?.source?.output,
    "probe_shear_jemtec_text"
  );
  assert.equal(
    surfaces.get("GoodmanProbeMaintenanceDamageValue")?.body?.bindings?.[0]?.source?.output,
    "probe_damage_jemtec_text"
  );
  assert.equal(surfaces.get("GoodmanScenarioSection")?.body?.bindings[0]?.prop, "visible");
  assert.equal(surfaces.get("GoodmanStaticEnduranceLimitLabel")?.body?.props?.text, "σ_lim endurance");
  assert.equal(surfaces.get("GoodmanScenarioSection")?.body?.bindings[0]?.source?.state, "GoodmanActiveMode");
  assert.equal(surfaces.get("GoodmanSimulationSection")?.body?.props?.hidden, true);
  assert.equal(surfaces.get("GoodmanSimulationSection")?.body?.bindings[0]?.source?.map?.mc, true);
  assert.equal(surfaces.get("GoodmanRunConfigSection")?.body?.props?.hidden, true);
  assert.equal(surfaces.get("GoodmanRunConfigSection")?.body?.bindings[0]?.source?.state, "GoodmanRunConfigVisible");
  assert.equal(surfaces.get("GoodmanRunConfigSection")?.body?.bindings[0]?.source?.map?.true, true);
  assert.equal(surfaces.get("GoodmanChartStyleSection")?.body?.props?.hidden, true);
  assert.equal(surfaces.get("GoodmanChartStyleSection")?.body?.bindings[0]?.source?.map?.edit, true);

  assert.deepEqual(surfaces.get("GoodmanSimulationList")?.body?.children, [
    "GoodmanSimulationEmptyState",
    "GoodmanSimulationNewAction"
  ]);
  assert.equal(surfaces.get("GoodmanSimulationEmptyState")?.body?.props?.text, "No simulations yet.");
  assert.equal(surfaces.get("GoodmanSimulationNewAction")?.body?.className, "add-sim-btn");
  assert.equal(surfaces.get("GoodmanSimulationNewAction")?.body?.props?.label, "+ New simulation");
  for (const removed of [
    "GoodmanSimulationPrimaryRow",
    "GoodmanSimulationCompareRow",
    "GoodmanSimulationPrimaryName",
    "GoodmanSimulationCompareName"
  ]) {
    assert.equal(surfaces.has(removed), false, `${removed} should not be an authored fixed simulation row`);
  }

  assert.deepEqual(surfaces.get("GoodmanChartStyleControls")?.body?.children, [
    "GoodmanChartLabelsGroup",
    "GoodmanChartBandColoursGroup",
    "GoodmanChartAnnotationsGroup"
  ]);
  assert.deepEqual(surfaces.get("GoodmanChartLabelsGroup")?.body?.children, [
    "GoodmanChartLabelsGroupTitle",
    "GoodmanChartTitleRow",
    "GoodmanChartXAxisRow",
    "GoodmanChartYAxisRow",
    "GoodmanChartTitleSizeRow",
    "GoodmanChartAxisSizeRow",
    "GoodmanChartGridRow"
  ]);
  assert.deepEqual(surfaces.get("GoodmanChartBandColoursGroup")?.body?.children, [
    "GoodmanChartBandColoursGroupTitle",
    "GoodmanChartBand1Row",
    "GoodmanChartBand2Row",
    "GoodmanChartBand3Row",
    "GoodmanChartBand4Row"
  ]);
  assert.deepEqual(surfaces.get("GoodmanChartAnnotationsGroup")?.body?.children, [
    "GoodmanChartAnnotationsGroupTitle",
    "GoodmanChartAnnotationList",
    "GoodmanChartAddAnnotationAction"
  ]);
  assert.equal(surfaces.has("GoodmanChartAnnotationsToggle"), false);
  assert.equal(surfaces.has("GoodmanChartPointSizeRow"), false);
  assert.equal(surfaces.get("GoodmanChartTitleInput")?.body?.bindings[0]?.source?.state, "GoodmanChartTitle");
  assert.equal(surfaces.get("GoodmanChartTitleInput")?.body?.interactions[0]?.action?.state, "GoodmanChartTitle");
  assert.equal(surfaces.get("GoodmanChartTitleInput")?.body?.props?.value, "Goodman Fatigue Diagram — M48 Mill Liner Bolt");
  assert.equal(surfaces.get("GoodmanChartXAxisInput")?.body?.props?.value, "Preload / Mean Stress  (MPa)");
  assert.equal(surfaces.get("GoodmanChartYAxisInput")?.body?.props?.value, "Alternating Bending Stress  (MPa)");
  assert.equal(surfaces.get("GoodmanChartBand1Input")?.body?.props?.inputType, "color");
  assert.equal(surfaces.get("GoodmanChartBand1Input")?.body?.interactions[0]?.action?.state, "GoodmanChartBandFill1");

  assert.deepEqual(surfaces.get("GoodmanBoltSetsList")?.body?.children, [
    "GoodmanBoltSetPrimaryCard",
    "GoodmanBoltSetMaintenanceCard"
  ]);
  assert.equal(surfaces.get("GoodmanBoltSetsSection")?.body?.props?.definitionRef, "GoodmanBoltSetDefinitions");
  assert.deepEqual(surfaces.get("GoodmanBoltSetPrimaryCard")?.body?.children, [
    "GoodmanBoltSetPrimaryHeader",
    "GoodmanBoltSetPrimaryEditForm",
    "GoodmanBoltSetPrimaryParams"
  ]);
  assert.deepEqual(surfaces.get("GoodmanBoltSetPrimaryHeader")?.body?.children, [
    "GoodmanBoltSetPrimarySwatch",
    "GoodmanBoltSetPrimaryName",
    "GoodmanBoltSetPrimaryActions",
    "GoodmanBoltSetPrimaryChevron"
  ]);
  assert.deepEqual(surfaces.get("GoodmanBoltSetPrimaryActions")?.body?.children, [
    "GoodmanBoltSetPrimaryEditAction",
    "GoodmanBoltSetPrimaryCloneAction",
    "GoodmanBoltSetPrimaryDeleteAction"
  ]);
  assert.deepEqual(surfaces.get("GoodmanBoltSetMaintenanceCard")?.body?.children, [
    "GoodmanBoltSetMaintenanceHeader",
    "GoodmanBoltSetMaintenanceEditForm",
    "GoodmanBoltSetMaintenanceParams"
  ]);
  assert.deepEqual(surfaces.get("GoodmanBoltSetMaintenanceHeader")?.body?.children, [
    "GoodmanBoltSetMaintenanceSwatch",
    "GoodmanBoltSetMaintenanceName",
    "GoodmanBoltSetMaintenanceActions",
    "GoodmanBoltSetMaintenanceChevron"
  ]);
  assert.equal(surfaces.get("GoodmanBoltSetMaintenanceName")?.body?.props?.text, "Jemtec");
  assert.equal(surfaces.get("GoodmanBoltSetMaintenanceName")?.body?.bindings?.[0]?.source?.state, "GoodmanBoltMaintenanceNameState");
  assert.equal(surfaces.get("GoodmanBoltSetMaintenanceSwatch")?.body?.props?.style, "background:#8CC4D4");
  assert.equal(surfaces.get("GoodmanBoltSetMaintenanceChevron")?.body?.interactions[0]?.action?.state, "GoodmanBoltMaintenanceParamsOpen");
  assert.equal(surfaces.get("GoodmanBoltSetMaintenanceChevron")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("GoodmanBoltSetMaintenanceChevron")?.body?.props?.text, ">");
  assert.equal(surfaces.get("GoodmanBoltSetMaintenanceEditAction")?.body?.interactions[0]?.action?.state, "GoodmanBoltMaintenanceEditVisible");
  assert.deepEqual(surfaces.get("GoodmanBoltSetMaintenanceEditForm")?.body?.children, [
    "GoodmanBoltSetMaintenanceEditNameRow",
    "GoodmanBoltSetMaintenanceEditColourRow",
    "GoodmanBoltSetMaintenanceEditSaveAction"
  ]);
  assert.equal(surfaces.get("GoodmanBoltSetMaintenanceParams")?.body?.bindings[0]?.source?.state, "GoodmanBoltMaintenanceParamsOpen");
  assert.equal(surfaces.has("GoodmanBoltSetMaintenanceNote"), false);
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryChevron")?.body?.surfaceKind, "action");
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryChevron")?.body?.interactions[0]?.action?.state, "GoodmanBoltPrimaryParamsOpen");
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryChevron")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryChevron")?.body?.props?.text, ">");
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryEditAction")?.body?.interactions[0]?.action?.state, "GoodmanBoltPrimaryEditVisible");
  assert.deepEqual(surfaces.get("GoodmanBoltSetPrimaryEditForm")?.body?.children, [
    "GoodmanBoltSetPrimaryEditNameRow",
    "GoodmanBoltSetPrimaryEditColourRow",
    "GoodmanBoltSetPrimaryEditSaveAction"
  ]);
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryEditForm")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryEditForm")?.body?.bindings[0]?.source?.state, "GoodmanBoltPrimaryEditVisible");
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryEditForm")?.body?.bindings[1]?.prop, "visible");
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryEditForm")?.body?.bindings[1]?.source?.state, "GoodmanBoltPrimaryEditVisible");
  assert.deepEqual(surfaces.get("GoodmanBoltSetPrimaryParams")?.body?.children, [
    "GoodmanBoltSetRubberCategoryPreload",
    "GoodmanBoltSetRubberCategoryLoad",
    "GoodmanBoltSetRubberCategoryJoint",
    "GoodmanBoltSetRubberCategoryGeometry",
    "GoodmanBoltSetRubberCategoryFatigue"
  ]);
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryParams")?.body?.className, "bs-params");
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryParams")?.body?.bindings[0]?.prop, "className");
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryParams")?.body?.bindings[0]?.source?.state, "GoodmanBoltPrimaryParamsOpen");
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryEditNameInput")?.body?.interactions[0]?.action?.state, "GoodmanBoltPrimaryNameState");
  assert.equal(surfaces.get("GoodmanBoltSetPrimaryEditColourInput")?.body?.props?.inputType, "color");

  assert.deepEqual(surfaces.get("GoodmanFatigueLegend")?.body?.children, [
    "GoodmanLegendInfiniteRow",
    "GoodmanLegendFiniteRow",
    "GoodmanLegendShortRow",
    "GoodmanLegendImminentRow"
  ]);
  assert.equal(surfaces.get("GoodmanLegendInfiniteText")?.body?.props?.text, "> 6 months ✓ safe");
  assert.equal(surfaces.get("GoodmanLegendFiniteText")?.body?.props?.text, "2–6 months");
  assert.equal(surfaces.get("GoodmanLegendShortText")?.body?.props?.text, "0.5–2 months");
  assert.equal(surfaces.get("GoodmanLegendImminentText")?.body?.props?.text, "< 0.5 months ⚠ imminent");

  assert.deepEqual(surfaces.get("GoodmanWindowLayer")?.body?.children, [
    "GoodmanCdfWindow",
    "GoodmanStatsWindow",
    "GoodmanAnovaWindow"
  ]);

  assert.deepEqual(surfaces.get("EngentusApp")?.body?.children, [
    "EngentusAppChrome",
    "GoodmanBody"
  ]);
  assert.equal(surfaces.has("EngentusGoodmanHeader"), false);
  assert.deepEqual(surfaces.get("EngentusToolbarMiddle")?.body?.children, [
    "GoodmanModesToolbar",
    "GoodmanWindowToolbar"
  ]);
  assert.equal(surfaces.get("EngentusToolbarMiddle")?.body?.props?.domId, "tb-goodman-tools");
  assert.equal(surfaces.get("GoodmanWindowToolbar")?.body?.props?.domId, "tb-wins");

  assert.deepEqual(surfaces.get("MillForceTabs")?.body?.children, [
    "MillForceTabCrossSection",
    "MillForceTabForceVsAngle",
    "MillForceTabForceRose"
  ]);

  assert.deepEqual(surfaces.get("MillForceModelHost")?.body?.children, [
    "MillForceModelSection",
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

  assert.deepEqual(surfaces.get("MillForceMcSection")?.body?.children, [
    "MillForceMcTitleText",
    "MillForceMcBody"
  ]);
  assert.deepEqual(surfaces.get("MillForceMcBody")?.body?.children, [
    "MillForceMcSamplesRow",
    "MillForceMcVaryTitle",
    "MillForceMcJTotalToggle",
    "MillForceMcPercentCritToggle",
    "MillForceMcPercentSolidsToggle",
    "MillForceMcHeightToggle",
    "MillForceMcActions",
    "MillForceMcStatusText",
    "MillForceMcEnvelopeTitle",
    "MillForceMcP10MaxRow",
    "MillForceMcP90MaxRow"
  ]);
  assert.deepEqual(surfaces.get("MillForceMcStatusText")?.body?.children, [
    "MillForceMcStatusReadyText",
    "MillForceMcStatusCalculatingText",
    "MillForceMcStatusComputedText",
    "MillForceMcStatusClearedText"
  ]);
  assert.equal(
    surfaces.get("MillForceMcStatusComputedText")?.body?.bindings?.[1]?.source?.output,
    "mc_sample_count_text"
  );
  assert.equal(
    surfaces.get("MillForceMcP10MaxValue")?.body?.bindings?.[0]?.source?.output,
    "F_r_p10_abs_max_text"
  );
  assert.equal(
    surfaces.get("MillForceMcP90MaxValue")?.body?.bindings?.[0]?.source?.output,
    "F_r_p90_abs_max_text"
  );

  assert.deepEqual(surfaces.get("EngentusMillChargeApp")?.body?.children, [
    "EngentusModuleChrome",
    "MillChargeBody"
  ]);

  assert.deepEqual(surfaces.get("EngentusMillForceApp")?.body?.children, [
    "EngentusModuleChrome",
    "MillForceBody"
  ]);

  assert.deepEqual(surfaces.get("EngentusPlatformConfigApp")?.body?.children, [
    "EngentusModuleChrome",
    "EngentusPlatformConfigBody"
  ]);

  assert.deepEqual(surfaces.get("EngentusPlatformConfigBody")?.body?.children, [
    "PlatformConfigSidebar",
    "PlatformConfigOperatorMainColumn"
  ]);

  assert.deepEqual(surfaces.get("PlatformConfigSidebar")?.body?.children, [
    "PlatformConfigSidebarTitle",
    "PlatformConfigSidebarHint",
    "PlatformConfigSidebarNav"
  ]);

  assert.deepEqual(surfaces.get("PlatformConfigSidebarNav")?.body?.children, [
    "PlatformConfigSidebarOperatorAction",
    "PlatformConfigSidebarSecretsAction",
    "PlatformConfigSidebarDatasourcesAction",
    "PlatformConfigSidebarScriptsAction",
    "PlatformConfigSidebarAccessAction"
  ]);

  assert.deepEqual(surfaces.get("PlatformConfigOperatorMainColumn")?.body?.children, [
    "PlatformConfigSectionShell",
    "PlatformConfigOperatorContent"
  ]);

  assert.deepEqual(surfaces.get("PlatformConfigSectionShell")?.body?.children, [
    "PlatformConfigPageHero",
    "PlatformConfigNotice"
  ]);

  assert.deepEqual(surfaces.get("PlatformConfigSecretTableRowAction")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "setState", state: "PlatformConfigSecretSelectedId", value: { kind: "eventValue" } }
    },
    {
      target: "self",
      event: "click",
      action: { kind: "deliver", message: "PlatformConfigLoadSecretRequested" }
    }
  ]);
  assert.equal(surfaces.get("PlatformConfigSecretTableBody")?.body?.interactions?.length ?? 0, 0);
  assert.equal(surfaces.get("PlatformConfigSecretTableRowUpdated")?.body?.props?.title, "${item.updatedAtTitle}");

  assert.deepEqual(surfaces.get("PlatformConfigDatasourceTableRowAction")?.body?.interactions, [
    {
      target: "self",
      event: "click",
      action: { kind: "setState", state: "PlatformConfigDatasourceSelectedId", value: { kind: "eventValue" } }
    },
    {
      target: "self",
      event: "click",
      action: { kind: "deliver", message: "PlatformConfigLoadDatasourceRequested" }
    }
  ]);
  assert.equal(surfaces.get("PlatformConfigDatasourceTableBody")?.body?.interactions?.length ?? 0, 0);
  assert.equal(surfaces.get("PlatformConfigDatasourceTableRowUpdated")?.body?.props?.title, "${item.updatedAtTitle}");

  assert.deepEqual(surfaces.get("EngentusPlatformConfigSecretsApp")?.body?.children, [
    "EngentusModuleChrome",
    "PlatformConfigSecretsBody"
  ]);

  assert.deepEqual(surfaces.get("PlatformConfigSecretsBody")?.body?.children, [
    "PlatformConfigSidebar",
    "PlatformConfigSecretsMainColumn"
  ]);

  assert.deepEqual(surfaces.get("PlatformConfigSecretsMainColumn")?.body?.children, [
    "PlatformConfigSectionShell",
    "PlatformConfigSecretsContent"
  ]);

  assert.deepEqual(surfaces.get("EngentusPlatformConfigDatasourcesApp")?.body?.children, [
    "EngentusModuleChrome",
    "PlatformConfigDatasourcesBody"
  ]);

  assert.deepEqual(surfaces.get("PlatformConfigDatasourcesBody")?.body?.children, [
    "PlatformConfigSidebar",
    "PlatformConfigDatasourcesMainColumn"
  ]);

  assert.deepEqual(surfaces.get("PlatformConfigDatasourcesMainColumn")?.body?.children, [
    "PlatformConfigSectionShell",
    "PlatformConfigDatasourcesContent"
  ]);

  assert.deepEqual(surfaces.get("EngentusPlatformConfigScriptsApp")?.body?.children, [
    "EngentusModuleChrome",
    "PlatformConfigScriptsBody"
  ]);

  assert.deepEqual(surfaces.get("PlatformConfigScriptsBody")?.body?.children, [
    "PlatformConfigSidebar",
    "PlatformConfigScriptsMainColumn"
  ]);

  assert.deepEqual(surfaces.get("PlatformConfigScriptsMainColumn")?.body?.children, [
    "PlatformConfigSectionShell",
    "PlatformConfigScriptsContent"
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
  assert.deepEqual(surfaces.get("GoodmanCdfWindowBody")?.body?.children, [
    "GoodmanCdfEmptyChart",
    "GoodmanCdfSummaryTable"
  ]);
  assert.equal(
    surfaces.get("GoodmanCdfSummarySamplesValue")?.body?.bindings?.[0]?.source?.output,
    "mc_sample_count_text"
  );
  assert.equal(
    surfaces.get("GoodmanCdfSummaryStdValue")?.body?.bindings?.[0]?.source?.output,
    "mc_sa_p50_std_text"
  );
  assert.deepEqual(surfaces.get("GoodmanStatsWindowBody")?.body?.children, [
    "GoodmanStatsEmptyMessage",
    "GoodmanStatsTable"
  ]);
  assert.equal(surfaces.get("GoodmanStatsEmptyMessage")?.body?.props?.text, "No completed simulations.");
  assert.equal(surfaces.get("GoodmanStatsEmptyMessage")?.body?.bindings?.[0]?.source?.state, "GoodmanRunStatusState");
  assert.equal(surfaces.get("GoodmanStatsEmptyMessage")?.body?.bindings?.[0]?.source?.map?.done, false);
  assert.equal(surfaces.get("GoodmanStatsTable")?.body?.props?.hidden, true);
  assert.equal(surfaces.get("GoodmanStatsTable")?.body?.bindings?.[0]?.source?.map?.done, true);
  assert.equal(surfaces.get("GoodmanCdfSummaryTable")?.body?.bindings?.[0]?.source?.map?.running, true);
  assert.equal(surfaces.get("GoodmanCdfSummaryTable")?.body?.bindings?.[0]?.source?.map?.done, true);
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
  assert.equal(
    surfaces.get("GoodmanStatsDataStd")?.body?.bindings?.[0]?.source?.output,
    "mc_sa_p50_std_text"
  );
  assert.deepEqual(surfaces.get("GoodmanStatsTableBody")?.body?.children, ["GoodmanStatsDataRow"]);
  assert.deepEqual(surfaces.get("GoodmanAnovaWindowBody")?.body?.children, ["GoodmanAnovaEmptyMessage"]);
  assert.equal(surfaces.get("GoodmanAnovaEmptyMessage")?.body?.props?.text, "Need >=2 groups with failed bolts for ANOVA.");
  for (const removed of [
    "GoodmanStatsEmptyRow",
    "GoodmanStatsEmptyCell",
    "GoodmanAnovaStatBlock",
    "GoodmanAnovaFStatistic",
    "GoodmanAnovaBoxPlot"
  ]) {
    assert.equal(surfaces.has(removed), false, `${removed} should not remain as fake no-data window output`);
  }
  assert.equal(surfaces.get("GoodmanRunProgressLabel")?.body?.bindings[0]?.source?.kind, "state");
  assert.equal(surfaces.get("GoodmanSimulationEmptyState")?.body?.props?.text, "No simulations yet.");
});

test("the module shells declare process and capability dependencies semantically", async () => {
  const desire = await shellDesire();
  const surfaces = nodeMap(desire, "surface");

  const goodman = surfaces.get("EngentusApp");
  const millCharge = surfaces.get("EngentusMillChargeApp");
  const millChargeCanvas = surfaces.get("MillChargeCanvasWrap");
  const millForce = surfaces.get("EngentusMillForceApp");
  const platformConfig = surfaces.get("EngentusPlatformConfigApp");

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

  assert.equal(platformConfig?.body?.processRef, "EngentusShellNavigation");
  assert.deepEqual(platformConfig?.body?.capabilityRefs, []);
  assert.equal("dependsOnCapabilities" in (platformConfig?.body?.props ?? {}), false);
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
