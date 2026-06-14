import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWitnessToml } from "../../src/dsl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadBootstrapHostActionContracts({
  manifestFile = "bootstrap-host-action-contracts.wtoml",
  contractKind = "bootstrapHostAction",
  baseDir = __dirname,
  readFileSyncFn = fs.readFileSync,
  parseWitnessTomlFn = parseWitnessToml
} = {}) {
  const docs = parseWitnessTomlFn(readFileSyncFn(path.join(baseDir, manifestFile), "utf8"));
  return Object.fromEntries(
    docs
      .filter(doc => doc.kind === contractKind)
      .map(doc => {
        const action = typeof doc.values?.action === "string" ? doc.values.action.trim() : "";
        return [action, doc.values];
      })
      .filter(([action]) => action)
  );
}

export const bootstrapHostActionContractsByAction = loadBootstrapHostActionContracts();
