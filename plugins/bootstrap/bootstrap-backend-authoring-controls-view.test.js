import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBootstrapBackendAuthoringControlsView,
  buildBootstrapBackendAuthoringControlsProjection,
  buildBootstrapBackendAuthoringControlsView,
  renderBootstrapBackendAuthoringControlsViewFactory
} from "./bootstrap-backend-authoring-controls-view.js";

test("backend authoring controls projection derives options from bootstrap rows before applying selection rules", () => {
  const view = buildBootstrapBackendAuthoringControlsProjection({
    programContext: "ctx-a",
    versionSoul: "soul-a",
    versionContext: "ctx-b",
    transitionFrom: "v1",
    transitionStrategy: "fork",
    stepVersion: "v2",
    stepOp: "op-b",
    contextRows: [{ id: "ctx-a" }, { id: "ctx-b" }],
    backendProgramRows: [{ soul: "soul-a" }, { soul: "soul-b" }],
    backendProgramVersionRows: [
      { soul: "soul-a", version: "v1" },
      { soul: "soul-a", version: "v2" },
      { soul: "soul-b", version: "v9" }
    ],
    supportedBackendOps: ["op-a", "op-b"]
  });

  assert.equal(view.selectedProgramContext, "ctx-a");
  assert.equal(view.selectedVersionSoul, "soul-a");
  assert.deepEqual(view.transitionFromOptions, [{ value: "v1", label: "v1" }, { value: "v2", label: "v2" }]);
  assert.deepEqual(view.strategyOptions.map(row => row.value), ["compatible", "migrate", "block", "fork"]);
  assert.equal(view.selectedTransitionStrategy, "fork");
  assert.deepEqual(view.stepVersionOptions, [{ value: "v1", label: "v1" }, { value: "v2", label: "v2" }, { value: "v9", label: "v9" }]);
  assert.deepEqual(view.stepOpOptions, [{ value: "op-a", label: "op-a" }, { value: "op-b", label: "op-b" }]);
});

test("backend authoring controls view builder derives selected options and fallbacks", () => {
  const view = buildBootstrapBackendAuthoringControlsView({
    programContext: "ctx-a",
    versionSoul: "soul-a",
    versionContext: "ctx-b",
    transitionFrom: "v1",
    transitionStrategy: "migrate",
    stepVersion: "v2",
    stepOp: "op-b",
    contextRows: [{ id: "ctx-a" }, { id: "ctx-b" }],
    soulOptions: [{ value: "soul-a", label: "soul-a" }, { value: "soul-b", label: "soul-b" }],
    transitionFromOptions: [{ value: "v1", label: "v1" }, { value: "v2", label: "v2" }],
    strategyOptions: [{ value: "compatible", label: "compatible" }, { value: "migrate", label: "migrate" }],
    stepVersionOptions: [{ value: "v1", label: "v1" }, { value: "v2", label: "v2" }],
    stepOpOptions: [{ value: "op-a", label: "op-a" }, { value: "op-b", label: "op-b" }]
  });

  assert.deepEqual(view, {
    contextOptions: [{ value: "ctx-a", label: "ctx-a" }, { value: "ctx-b", label: "ctx-b" }],
    soulOptions: [{ value: "soul-a", label: "soul-a" }, { value: "soul-b", label: "soul-b" }],
    selectedProgramContext: "ctx-a",
    selectedVersionSoul: "soul-a",
    selectedVersionContext: "ctx-b",
    transitionFromOptions: [{ value: "v1", label: "v1" }, { value: "v2", label: "v2" }],
    selectedTransitionFrom: "v1",
    strategyOptions: [{ value: "compatible", label: "compatible" }, { value: "migrate", label: "migrate" }],
    selectedTransitionStrategy: "migrate",
    stepVersionOptions: [{ value: "v1", label: "v1" }, { value: "v2", label: "v2" }],
    selectedStepVersion: "v2",
    stepOpOptions: [{ value: "op-a", label: "op-a" }, { value: "op-b", label: "op-b" }],
    selectedStepOp: "op-b"
  });
});

test("backend authoring controls view builder clears transition strategy when no transition source remains", () => {
  const view = buildBootstrapBackendAuthoringControlsView({
    versionSoul: "missing",
    transitionFrom: "missing",
    transitionStrategy: "migrate",
    soulOptions: [{ value: "soul-a", label: "soul-a" }],
    strategyOptions: [{ value: "compatible", label: "compatible" }]
  });

  assert.equal(view.selectedVersionSoul, "soul-a");
  assert.equal(view.selectedTransitionFrom, "");
  assert.equal(view.selectedTransitionStrategy, "");
});

test("backend authoring controls view apply helper pushes select options and selections", () => {
  const calls = [];
  applyBootstrapBackendAuthoringControlsView({
    view: {
      contextOptions: [{ value: "ctx-a", label: "ctx-a" }],
      soulOptions: [{ value: "soul-a", label: "soul-a" }],
      selectedProgramContext: "ctx-a",
      selectedVersionContext: "ctx-a",
      selectedVersionSoul: "soul-a",
      transitionFromOptions: [{ value: "v1", label: "v1" }],
      selectedTransitionFrom: "v1",
      strategyOptions: [{ value: "compatible", label: "compatible" }],
      selectedTransitionStrategy: "compatible",
      stepVersionOptions: [{ value: "v1", label: "v1" }],
      selectedStepVersion: "v1",
      stepOpOptions: [{ value: "op-a", label: "op-a" }],
      selectedStepOp: "op-a"
    },
    fillSelect: (id, options, getValue, getLabel, config) => calls.push([
      "fillSelect",
      id,
      options.map(row => ({ value: getValue(row), label: getLabel(row) })),
      config
    ]),
    setSelectedValue: (id, value) => calls.push(["setSelectedValue", id, value])
  });

  assert.deepEqual(calls, [
    ["fillSelect", "backend-program-context", [{ value: "ctx-a", label: "ctx-a" }], undefined],
    ["setSelectedValue", "backend-program-context", "ctx-a"],
    ["fillSelect", "backend-program-version-context", [{ value: "ctx-a", label: "ctx-a" }], undefined],
    ["setSelectedValue", "backend-program-version-context", "ctx-a"],
    ["fillSelect", "backend-program-version-soul", [{ value: "soul-a", label: "soul-a" }], { includeBlank: false }],
    ["setSelectedValue", "backend-program-version-soul", "soul-a"],
    ["fillSelect", "backend-program-version-transition-from", [{ value: "v1", label: "v1" }], undefined],
    ["setSelectedValue", "backend-program-version-transition-from", "v1"],
    ["fillSelect", "backend-program-version-transition-strategy", [{ value: "compatible", label: "compatible" }], undefined],
    ["setSelectedValue", "backend-program-version-transition-strategy", "compatible"],
    ["fillSelect", "backend-step-version", [{ value: "v1", label: "v1" }], { includeBlank: false }],
    ["setSelectedValue", "backend-step-version", "v1"],
    ["fillSelect", "backend-step-op", [{ value: "op-a", label: "op-a" }], { includeBlank: false }],
    ["setSelectedValue", "backend-step-op", "op-a"]
  ]);
});

test("backend authoring controls view factory exposes shared helper seam", () => {
  const factory = renderBootstrapBackendAuthoringControlsViewFactory();
  assert.equal(factory.includes("const buildBootstrapBackendAuthoringControlsProjection ="), true);
  assert.equal(factory.includes("const buildBootstrapBackendAuthoringControlsView ="), true);
  assert.equal(factory.includes("const applyBootstrapBackendAuthoringControlsView ="), true);
});
