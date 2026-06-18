export function projectionTruthiness(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "" && value !== "false";
  return Boolean(value);
}

export function formatProjectionValue(value, props = {}) {
  if (value == null || value === "") return "";
  const scale = props.style === "percent"
    ? 100
    : (props.scale != null ? Number(props.scale) : 1);
  const numeric = Number(value) * (Number.isFinite(scale) ? scale : 1);
  const hasNumeric = Number.isFinite(numeric);
  const digits = props.digits != null ? Number(props.digits) : null;
  const suffix = props.suffix != null
    ? String(props.suffix)
    : (props.style === "percent" ? "%" : "");
  const prefix = props.prefix != null ? String(props.prefix) : "";
  const body = hasNumeric
    ? (Number.isFinite(digits) ? numeric.toFixed(Math.max(0, digits)) : String(numeric))
    : String(value);
  return `${prefix}${body}${suffix}`;
}

const DERIVE_OPS = {
  bool_not: value => !projectionTruthiness(value),
  format: (value, body) => formatProjectionValue(value, body?.props ?? {}),
  identity: value => value
};

export function deriveProjectionValue(body = {}, value) {
  const derive = DERIVE_OPS[String(body?.projectionKind || "").trim()];
  return typeof derive === "function" ? derive(value, body) : undefined;
}

export function deriveProjectionSnapshot(projectionWitnesses = [], stateValues = new Map()) {
  const readState = stateId => {
    if (!stateId) return undefined;
    if (stateValues instanceof Map) return stateValues.get(stateId);
    if (stateValues && typeof stateValues === "object") return stateValues[stateId];
    return undefined;
  };
  const derived = {};
  for (const witness of projectionWitnesses ?? []) {
    const body = witness?.body ?? {};
    const projectionId = typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
    if (!projectionId) continue;
    derived[projectionId] = deriveProjectionValue(body, readState(body.source));
  }
  return derived;
}
