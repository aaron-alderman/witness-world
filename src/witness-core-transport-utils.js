export function normalizeWitnessCoreUrl(value) {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\/$/, "") : "";
}

export function createWitnessCoreRequestError(message, {
  status = 500,
  code = null,
  details = null
} = {}) {
  const error = new Error(message);
  error.status = Number(status || 500);
  if (code) error.code = String(code);
  if (details && typeof details === "object") Object.assign(error, details);
  return error;
}
