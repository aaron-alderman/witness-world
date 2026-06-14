import test from "node:test";
import assert from "node:assert/strict";
import {
  loadBootstrapPageSlotDefinitions,
  renderBootstrapPageSlotDefinition,
  renderBootstrapPageSlotDefinitions
} from "./bootstrap-page-slot-manifest.js";

test("bootstrap page slot manifest helper loads only bootstrap page slot definitions", () => {
  const definitions = loadBootstrapPageSlotDefinitions({
    manifestFile: "ignored.wtoml",
    readFileSyncFn: () => "[[bootstrapPageSlot]]",
    parseWitnessTomlFn: () => [
      { kind: "bootstrapPageSlot", values: { slotDomId: "slot-a" } },
      { kind: "widget", values: { id: "ignore-me" } },
      { kind: "bootstrapPageSlot", values: { slotDomId: "slot-b" } }
    ]
  });

  assert.deepEqual(definitions, [
    { slotDomId: "slot-a" },
    { slotDomId: "slot-b" }
  ]);
});

test("bootstrap page slot manifest helper renders seeded initial state and replacement content through authored slot rendering", () => {
  const rendered = renderBootstrapPageSlotDefinition({
    slotDomId: "slot-a",
    wtomlFile: "slot-a.wtoml",
    rootWidget: "slot_a_root",
    frontendProgram: "slot_a_program",
    frontendProgramScriptId: "slot-a-program",
    initialStateScriptId: "slot-a-state-script",
    initialStateInto: "slotState",
    initialStateSource: "slotState",
    replacementSlotDomId: "slot-a-replacement",
    replacementContentSource: "slotBody"
  }, {
    initialStateBySource: { slotState: { id: "state-a" } },
    replacementContentBySource: { slotBody: "<div>replacement</div>" },
    renderBootstrapAuthoredSlotFn: options => options
  });

  assert.deepEqual(rendered, {
    wtomlFile: "slot-a.wtoml",
    rootWidget: "slot_a_root",
    frontendProgram: "slot_a_program",
    frontendProgramScriptId: "slot-a-program",
    initialStateScriptId: "slot-a-state-script",
    initialStateInto: "slotState",
    initialState: { id: "state-a" },
    replacementSlotDomId: "slot-a-replacement",
    replacementHtml: "<div>replacement</div>"
  });
});

test("bootstrap page slot manifest helper builds slot html by slot dom id", () => {
  const rendered = renderBootstrapPageSlotDefinitions([
    { slotDomId: "slot-a" },
    { slotDomId: "slot-b" }
  ], {
    renderBootstrapPageSlotDefinitionFn: definition => "<section id=\"" + definition.slotDomId + "\"></section>"
  });

  assert.deepEqual(rendered, {
    "slot-a": "<section id=\"slot-a\"></section>",
    "slot-b": "<section id=\"slot-b\"></section>"
  });
});
