import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWitnessToml } from "../../src/dsl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadBootstrapScopedSubmitContracts({
  manifestFile = "bootstrap-scoped-submit-contracts.wtoml",
  contractKind = "bootstrapScopedSubmit",
  baseDir = __dirname,
  readFileSyncFn = fs.readFileSync,
  parseWitnessTomlFn = parseWitnessToml
} = {}) {
  const docs = parseWitnessTomlFn(readFileSyncFn(path.join(baseDir, manifestFile), "utf8"));
  return Object.fromEntries(
    docs
      .filter(doc => doc.kind === contractKind)
      .map(doc => {
        const family = typeof doc.values?.family === "string" ? doc.values.family.trim() : "";
        return [family, doc.values];
      })
      .filter(([family]) => family)
  );
}

export const bootstrapScopedSubmitContractsByFamily = loadBootstrapScopedSubmitContracts();
