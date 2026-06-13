import { todoStarterBlueprint } from "../tutorial/tutorials.js";

export function buildBootstrapStarterPlan({
  bootstrapModel = null,
  bootstrapState = null,
  blueprint = null
} = {}) {
  const model = bootstrapModel || {};
  const authored = bootstrapState || {};
  const plan = blueprint || todoStarterBlueprint();
  const backendHost = model.backendHosts?.[0]?.id || "backendHost";
  const frontendHost = model.frontendHosts?.[0]?.id || "frontendHost";
  const dynamicValues = { backendHost, frontendHost };
  const requests = [];
  const requestRows = value => Array.isArray(value) ? value : (value ? [value] : []);
  const resolveDynamicValue = value => {
    if (Array.isArray(value)) return value.map(resolveDynamicValue);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveDynamicValue(item)]));
    }
    if (typeof value === "string" && Object.hasOwn(dynamicValues, value)) return dynamicValues[value];
    return value;
  };
  const shouldSkip = (step, row) => {
    const collectionName = typeof step.skipIfPresentIn === "string" ? step.skipIfPresentIn.trim() : "";
    if (!collectionName) return false;
    const collection = authored?.[collectionName];
    if (!Array.isArray(collection) || !collection.length) return false;
    const matchField = typeof step.matchField === "string" && step.matchField.trim() ? step.matchField.trim() : "id";
    const rowValue = row?.[matchField];
    return collection.some(existing => existing?.[matchField] === rowValue);
  };
  const mapBody = (step, row) => {
    const resolvedRow = resolveDynamicValue({ ...row });
    const pickFields = Array.isArray(step.pickFields) ? step.pickFields.filter(field => typeof field === "string" && field) : [];
    if (!pickFields.length) return resolvedRow;
    return Object.fromEntries(
      pickFields
        .filter(field => Object.hasOwn(resolvedRow, field))
        .map(field => [field, resolvedRow[field]])
    );
  };
  const resolveUrl = (step, row) => {
    if (typeof step.url === "string" && step.url) return step.url;
    if (typeof step.urlTemplate === "string" && step.urlTemplate) {
      return step.urlTemplate.replace(/\$\{([^}]+)\}/g, (_, key) => encodeURIComponent(row?.[key] ?? ""));
    }
    return "";
  };

  for (const step of plan.requestPlan || []) {
    for (const row of requestRows(plan[step.from])) {
      if (shouldSkip(step, row)) continue;
      requests.push({
        url: resolveUrl(step, row),
        body: mapBody(step, row)
      });
    }
  }

  return { requests };
}
