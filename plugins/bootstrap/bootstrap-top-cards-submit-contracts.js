import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWitnessToml } from "../../src/dsl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadBootstrapTopCardsSubmitContracts({
  manifestFile = "bootstrap-top-cards-submit-contracts.wtoml",
  contractKind = "bootstrapTopCardsSubmit",
  fieldKind = "bootstrapTopCardsSubmitField",
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
    if (!contractsByFamily[family]) contractsByFamily[family] = [];
    contractsByFamily[family].push({
      fields: [],
      ...doc.values
    });
  }
  for (const doc of docs) {
    if (doc.kind !== fieldKind) continue;
    const family = typeof doc.values?.family === "string" ? doc.values.family.trim() : "";
    if (!family || !contractsByFamily[family]?.length) continue;
    const variant = typeof doc.values?.variant === "string" ? doc.values.variant.trim() : "";
    const target = variant
      ? contractsByFamily[family].find(entry => String(entry.variant || "").trim() === variant)
      : contractsByFamily[family][0];
    if (target) target.fields.push(doc.values);
  }
  return contractsByFamily;
}

export const bootstrapTopCardsSubmitContractsByFamily = loadBootstrapTopCardsSubmitContracts();
