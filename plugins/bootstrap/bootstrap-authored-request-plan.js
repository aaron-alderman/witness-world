function requestRows(value) {
  return Array.isArray(value) ? value : (value ? [value] : []);
}

function resolveDynamicValue(value, dynamicValues) {
  if (Array.isArray(value)) return value.map(item => resolveDynamicValue(item, dynamicValues));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveDynamicValue(item, dynamicValues)]));
  }
  if (typeof value === "string" && Object.hasOwn(dynamicValues, value)) return dynamicValues[value];
  return value;
}

function shouldSkip(step, row, authoredState) {
  const collectionName = typeof step.skipIfPresentIn === "string" ? step.skipIfPresentIn.trim() : "";
  if (!collectionName) return false;
  const collection = authoredState?.[collectionName];
  if (!Array.isArray(collection) || !collection.length) return false;
  const matchField = typeof step.matchField === "string" && step.matchField.trim() ? step.matchField.trim() : "id";
  const rowValue = row?.[matchField];
  return collection.some(existing => existing?.[matchField] === rowValue);
}

function mapBody(step, row, dynamicValues) {
  const resolvedRow = resolveDynamicValue({ ...row }, dynamicValues);
  const pickFields = Array.isArray(step.pickFields) ? step.pickFields.filter(field => typeof field === "string" && field) : [];
  if (!pickFields.length) return resolvedRow;
  return Object.fromEntries(
    pickFields
      .filter(field => Object.hasOwn(resolvedRow, field))
      .map(field => [field, resolvedRow[field]])
  );
}

function resolveUrl(step, row) {
  if (typeof step.url === "string" && step.url) return step.url;
  if (typeof step.urlTemplate === "string" && step.urlTemplate) {
    return step.urlTemplate.replace(/\$\{([^}]+)\}/g, (_, key) => encodeURIComponent(row?.[key] ?? ""));
  }
  return "";
}

export function buildBootstrapAuthoredRequestPlanRequests({
  plan = null,
  authoredState = null,
  dynamicValues = {}
} = {}) {
  const requests = [];
  for (const step of plan?.requestPlan || []) {
    for (const row of requestRows(plan?.[step.from])) {
      if (shouldSkip(step, row, authoredState)) continue;
      requests.push({
        url: resolveUrl(step, row),
        body: mapBody(step, row, dynamicValues)
      });
    }
  }
  return requests;
}
