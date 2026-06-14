import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWitnessToml } from "../../src/dsl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadBootstrapRouteAuthoringContracts({
  manifestFile = "bootstrap-route-authoring-contracts.wtoml",
  policyKind = "bootstrapRouteAuthoringPolicy",
  handlerRuleKind = "bootstrapRouteAuthoringHandlerRule",
  baseDir = __dirname,
  readFileSyncFn = fs.readFileSync,
  parseWitnessTomlFn = parseWitnessToml
} = {}) {
  const docs = parseWitnessTomlFn(readFileSyncFn(path.join(baseDir, manifestFile), "utf8"));
  const policiesByRouteKind = Object.create(null);
  const handlerRulesByHandler = Object.create(null);
  const managedFields = new Set();
  for (const doc of docs) {
    if (doc.kind !== policyKind) continue;
    const routeKind = typeof doc.values?.routeKind === "string" ? doc.values.routeKind.trim() : "";
    if (!routeKind) continue;
    policiesByRouteKind[routeKind] = doc.values;
    for (const field of doc.values.enabledFields || []) {
      if (typeof field === "string" && field.trim()) managedFields.add(field.trim());
    }
  }
  for (const doc of docs) {
    if (doc.kind !== handlerRuleKind) continue;
    const handler = typeof doc.values?.handler === "string" ? doc.values.handler.trim() : "";
    if (!handler) continue;
    handlerRulesByHandler[handler] = doc.values;
  }
  return {
    policiesByRouteKind,
    handlerRulesByHandler,
    managedFields: [...managedFields]
  };
}

export const bootstrapRouteAuthoringContracts = loadBootstrapRouteAuthoringContracts();
