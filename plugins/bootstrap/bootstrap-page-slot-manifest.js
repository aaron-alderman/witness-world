import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWitnessToml } from "../../src/dsl.js";
import { renderBootstrapAuthoredSlot } from "./bootstrap-page-helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadBootstrapPageSlotDefinitions({
  manifestFile = "",
  slotKind = "bootstrapPageSlot",
  baseDir = __dirname,
  readFileSyncFn = fs.readFileSync,
  parseWitnessTomlFn = parseWitnessToml
} = {}) {
  return parseWitnessTomlFn(readFileSyncFn(path.join(baseDir, manifestFile), "utf8"))
    .filter(doc => doc.kind === slotKind)
    .map(doc => doc.values);
}

export function renderBootstrapPageSlotDefinition(
  definition,
  {
    initialStateBySource = {},
    replacementContentBySource = {},
    renderBootstrapAuthoredSlotFn = renderBootstrapAuthoredSlot
  } = {}
) {
  return renderBootstrapAuthoredSlotFn({
    wtomlFile: definition.wtomlFile,
    rootWidget: definition.rootWidget,
    frontendProgram: definition.frontendProgram,
    frontendProgramScriptId: definition.frontendProgramScriptId,
    initialStateScriptId: definition.initialStateScriptId ?? null,
    initialStateInto: definition.initialStateInto ?? null,
    initialState: definition.initialStateSource
      ? initialStateBySource[definition.initialStateSource]
      : null,
    replacementSlotDomId: definition.replacementSlotDomId ?? null,
    replacementHtml: definition.replacementContentSource
      ? replacementContentBySource[definition.replacementContentSource]
      : null
  });
}

export function renderBootstrapPageSlotDefinitions(
  definitions,
  {
    initialStateBySource = {},
    replacementContentBySource = {},
    renderBootstrapPageSlotDefinitionFn = renderBootstrapPageSlotDefinition
  } = {}
) {
  return Object.fromEntries((definitions || []).map(definition => [
    definition.slotDomId,
    renderBootstrapPageSlotDefinitionFn(definition, {
      initialStateBySource,
      replacementContentBySource
    })
  ]));
}
