import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWitnessToml } from "../../src/dsl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadBootstrapHostRefreshSources({
  manifestFile = "bootstrap-host-refresh-contracts.wtoml",
  contractKind = "bootstrapHostRefreshSource",
  baseDir = __dirname,
  readFileSyncFn = fs.readFileSync,
  parseWitnessTomlFn = parseWitnessToml
} = {}) {
  return parseWitnessTomlFn(readFileSyncFn(path.join(baseDir, manifestFile), "utf8"))
    .filter(doc => doc.kind === contractKind)
    .map(doc => typeof doc.values?.source === "string" ? doc.values.source.trim() : "")
    .filter(Boolean);
}

export const bootstrapHostRefreshAllowedSources = loadBootstrapHostRefreshSources();
