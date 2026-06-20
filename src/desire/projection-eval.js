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

export function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function projectionPresent(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value != null && value !== "";
}

export function projectionValueEquals(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }
  return left === right;
}

export function projectionTemplateValue(body = {}, inputs = {}) {
  const parts = Array.isArray(body?.parts) ? body.parts : [];
  return parts.map(part => {
    if (!part || typeof part !== "object") return "";
    if (Object.prototype.hasOwnProperty.call(part, "literal")) return String(part.literal ?? "");
    const inputName = trimString(part.input);
    if (!inputName) return "";
    const value = inputs[inputName];
    if (Array.isArray(value)) return value.join(trimString(body?.props?.arraySeparator) ?? ", ");
    return value == null ? "" : String(value);
  }).join("");
}

export function projectionInputEntries(body = {}) {
  const inputs = body?.inputs;
  if (inputs && typeof inputs === "object" && !Array.isArray(inputs)) {
    return Object.entries(inputs)
      .map(([name, source]) => [trimString(name), source])
      .filter(([name]) => name);
  }
  const legacySource = trimString(body?.source);
  return legacySource ? [["value", { kind: "state", state: legacySource }]] : [];
}

export function resolveProjectionInputSource(source, {
  readState,
  readProjection
} = {}) {
  const normalized = typeof source === "string"
    ? { kind: "state", state: source }
    : (source && typeof source === "object" ? source : null);
  if (!normalized) return undefined;
  if (normalized.kind === "literal") return normalized.value;
  if (normalized.kind === "state") return typeof readState === "function" ? readState(normalized.state) : undefined;
  if (normalized.kind === "projection") return typeof readProjection === "function" ? readProjection(normalized.projection) : undefined;
  return undefined;
}

const DERIVE_OPS = {
  bool_and: inputs => projectionTruthiness(inputs.left) && projectionTruthiness(inputs.right),
  bool_not: inputs => !projectionTruthiness(inputs.value),
  bool_or: inputs => projectionTruthiness(inputs.left) || projectionTruthiness(inputs.right),
  equals: inputs => projectionValueEquals(inputs.left, inputs.right),
  format: (inputs, body) => formatProjectionValue(inputs.value, body?.props ?? {}),
  identity: inputs => inputs.value,
  join: (inputs, body) => {
    const separator = body?.props?.separator != null ? String(body.props.separator) : ", ";
    return Array.isArray(inputs.value) ? inputs.value.map(value => String(value ?? "")).join(separator) : "";
  },
  present: inputs => projectionPresent(inputs.value),
  template: (inputs, body) => projectionTemplateValue(body, inputs)
};

export function deriveProjectionValue(body = {}, valueOrInputs) {
  const inputs = body?.inputs && typeof valueOrInputs === "object" && valueOrInputs !== null && !Array.isArray(valueOrInputs)
    ? valueOrInputs
    : { value: valueOrInputs };
  const derive = DERIVE_OPS[String(body?.projectionKind || "").trim()];
  return typeof derive === "function" ? derive(inputs, body) : undefined;
}

export function deriveProjectionSnapshot(projectionWitnesses = [], stateValues = new Map()) {
  const readState = stateId => {
    if (!stateId) return undefined;
    if (stateValues instanceof Map) return stateValues.get(stateId);
    if (stateValues && typeof stateValues === "object") return stateValues[stateId];
    return undefined;
  };
  const projectionBodies = new Map();
  for (const witness of projectionWitnesses ?? []) {
    const body = witness?.body ?? {};
    const projectionId = trimString(body?.id);
    if (projectionId) projectionBodies.set(projectionId, body);
  }
  const derived = {};
  const resolving = new Set();
  const readProjection = projectionId => {
    const trimmed = trimString(projectionId);
    if (!trimmed) return undefined;
    if (Object.prototype.hasOwnProperty.call(derived, trimmed)) return derived[trimmed];
    if (resolving.has(trimmed)) return undefined;
    const body = projectionBodies.get(trimmed);
    if (!body) return undefined;
    resolving.add(trimmed);
    const inputs = {};
    for (const [name, source] of projectionInputEntries(body)) {
      inputs[name] = resolveProjectionInputSource(source, { readState, readProjection });
    }
    derived[trimmed] = deriveProjectionValue(body, inputs);
    resolving.delete(trimmed);
    return derived[trimmed];
  };
  for (const projectionId of projectionBodies.keys()) readProjection(projectionId);
  return derived;
}
