import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWitnessToml } from "../../src/dsl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadBootstrapAppAuthoringSubmitContracts({
  manifestFile = "bootstrap-app-authoring-submit-contracts.wtoml",
  contractKind = "bootstrapAppAuthoringSubmit",
  fieldKind = "bootstrapAppAuthoringSubmitField",
  baseDir = __dirname,
  readFileSyncFn = fs.readFileSync,
  parseWitnessTomlFn = parseWitnessToml
} = {}) {
  const docs = parseWitnessTomlFn(readFileSyncFn(path.join(baseDir, manifestFile), "utf8"));
  const contractsByFamily = Object.create(null);
  for (const doc of docs) {
    if (doc.kind !== contractKind) continue;
    const family = typeof doc.values?.family === "string" ? doc.values.family.trim() : "";
    if (!family) continue;
    contractsByFamily[family] = {
      fields: [],
      ...doc.values
    };
  }
  for (const doc of docs) {
    if (doc.kind !== fieldKind) continue;
    const family = typeof doc.values?.family === "string" ? doc.values.family.trim() : "";
    if (!family || !contractsByFamily[family]) continue;
    contractsByFamily[family].fields.push(doc.values);
  }
  return contractsByFamily;
}

export const bootstrapAppAuthoringSubmitContractsByFamily = loadBootstrapAppAuthoringSubmitContracts();
