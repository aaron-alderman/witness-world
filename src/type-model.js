import { thing, relation } from "./kernel.js";

const FALLBACK_EDITOR_BY_TRAIT = {
  numeric: { control: "number" },
  boolean: { control: "checkbox" },
  color: { control: "color" },
  enumerated: { control: "select" },
  textual: { control: "text" }
};

export function defineTrait(world, { actor, id, owner = actor, label = id }) {
  return world.emit({
    process: "defineTrait",
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id),
      relation(id, "hasModuleKind", "trait")
    ],
    body: { id, label }
  });
}

export function defineValueType(world, { actor, id, owner = actor, label = id, editor = null, compatibleWith = [] }) {
  return world.emit({
    process: "defineValueType",
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id),
      relation(id, "hasModuleKind", "valueType"),
      ...compatibleWith.filter(Boolean).map(target => relation(id, "compatibleWith", target))
    ],
    body: { id, label, editor, compatibleWith: [...compatibleWith] }
  });
}

export function defineProcessSpec(world, { actor, id, process, owner = actor, inputs = [], outputs = [] }) {
  return world.emit({
    process: "defineProcessSpec",
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id),
      relation(id, "hasModuleKind", "processSpec")
    ],
    body: {
      id,
      process,
      inputs: normalizeFields(inputs),
      outputs: normalizeFields(outputs)
    }
  });
}

export function typeModelProjection(witnesses) {
  const traitsById = Object.create(null);
  const valueTypesById = Object.create(null);
  const processSpecsById = Object.create(null);
  const processSpecsByProcess = Object.create(null);
  const compatibleWith = Object.create(null);

  for (const w of witnesses) {
    if (w.process === "defineTrait" && w.body?.id) {
      traitsById[w.body.id] = { id: w.body.id, label: w.body.label ?? w.body.id };
    }
    if (w.process === "defineValueType" && w.body?.id) {
      valueTypesById[w.body.id] = {
        id: w.body.id,
        label: w.body.label ?? w.body.id,
        editor: normalizeEditor(w.body.editor),
        compatibleWith: Array.isArray(w.body.compatibleWith) ? [...w.body.compatibleWith] : []
      };
    }
    if (w.process === "defineProcessSpec" && w.body?.id && w.body?.process) {
      const spec = {
        id: w.body.id,
        process: w.body.process,
        inputs: normalizeFields(w.body.inputs),
        outputs: normalizeFields(w.body.outputs)
      };
      processSpecsById[w.body.id] = spec;
      processSpecsByProcess[w.body.process] = spec;
    }
  }

  for (const w of witnesses) {
    for (const claim of w.claims ?? []) {
      if (claim?.op !== "relation" || claim.rel !== "compatibleWith" || !claim.from || !claim.to) continue;
      if (!compatibleWith[claim.from]) compatibleWith[claim.from] = [];
      if (!compatibleWith[claim.from].includes(claim.to)) compatibleWith[claim.from].push(claim.to);
    }
  }

  for (const valueType of Object.values(valueTypesById)) {
    valueType.compatibleWith = dedupe([...(compatibleWith[valueType.id] ?? []), ...(valueType.compatibleWith ?? [])]);
    compatibleWith[valueType.id] = [...valueType.compatibleWith];
  }

  return {
    traitsById,
    valueTypesById,
    processSpecsById,
    processSpecsByProcess,
    compatibleWith
  };
}

export function processSpecFor(model, process) {
  return model?.processSpecsByProcess?.[process] ?? null;
}

export function compatibleWithType(model, from, target) {
  if (!from || !target) return false;
  if (from === target) return true;
  const queue = [...(model?.compatibleWith?.[from] ?? [])];
  const seen = new Set([from]);
  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    if (current === target) return true;
    seen.add(current);
    queue.push(...(model?.compatibleWith?.[current] ?? []));
  }
  return false;
}

export function editorForValueType(model, valueTypeId) {
  const exact = model?.valueTypesById?.[valueTypeId];
  if (!exact) return { control: "text" };
  if (exact.editor?.control) return exact.editor;
  for (const trait of Object.keys(FALLBACK_EDITOR_BY_TRAIT)) {
    if (compatibleWithType(model, valueTypeId, trait)) return { ...FALLBACK_EDITOR_BY_TRAIT[trait] };
  }
  return { control: "text" };
}

export function validateProcessInput(model, process, value, { coerceStrings = false } = {}) {
  return validateFlatRecord(model, processSpecFor(model, process), value, { coerceStrings, mode: "inputs" });
}

export function validateProcessOutput(model, process, value) {
  return validateFlatRecord(model, processSpecFor(model, process), value, { coerceStrings: false, mode: "outputs" });
}

export function validateFlatRecord(model, spec, value, { coerceStrings = false, mode = "inputs" } = {}) {
  const fields = normalizeFields(spec?.[mode] ?? []);
  const input = value && typeof value === "object" ? value : {};
  const output = {};
  const failures = [];

  for (const field of fields) {
    const key = field.source ?? field.name;
    const hasKey = Object.prototype.hasOwnProperty.call(input, key);
    const raw = hasKey ? input[key] : undefined;
    if (raw === undefined || raw === null || raw === "") {
      if (field.required) {
        failures.push({
          field: field.name,
          expected: field.accepts,
          actual: "missing",
          valuePreview: raw === "" ? '""' : String(raw),
          reason: `${field.name} required`
        });
      }
      continue;
    }

    const normalized = coerceStrings ? coerceDomValue(model, field.accepts, raw) : raw;
    const match = matchAccepts(model, normalized, field.accepts);
    if (!match.ok) {
      failures.push({
        field: field.name,
        expected: field.accepts,
        actual: match.actual,
        valuePreview: previewValue(normalized),
        reason: match.reason
      });
      continue;
    }
    output[field.name] = normalized;
  }

  return { ok: failures.length === 0, value: output, failures, spec };
}

function matchAccepts(model, value, accepts) {
  const candidates = matchingValueTypes(model, value);
  if (model?.valueTypesById?.[accepts]) {
    const matched = candidates.find(typeId => compatibleWithType(model, typeId, accepts));
    if (matched) return { ok: true, actual: matched };
    return {
      ok: false,
      actual: candidates.join("|") || jsTypeOf(value),
      reason: `${previewValue(value)} is not compatible with ${accepts}`
    };
  }
  if (model?.traitsById?.[accepts]) {
    const matched = candidates.find(typeId => compatibleWithType(model, typeId, accepts));
    if (matched) return { ok: true, actual: matched };
    return {
      ok: false,
      actual: candidates.join("|") || jsTypeOf(value),
      reason: `${previewValue(value)} does not satisfy trait ${accepts}`
    };
  }
  return {
    ok: false,
    actual: jsTypeOf(value),
    reason: `unknown type or trait ${accepts}`
  };
}

function matchingValueTypes(model, value) {
  return Object.values(model?.valueTypesById ?? {})
    .filter(type => valueMatchesType(model, type.id, value))
    .map(type => type.id)
    .sort();
}

function valueMatchesType(model, typeId, value) {
  const editor = editorForValueType(model, typeId);
  if (editor.control === "number") return typeof value === "number" && Number.isFinite(value);
  if (editor.control === "checkbox") return typeof value === "boolean";
  if (editor.control === "color") return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  if (editor.control === "select") return typeof value === "string" && Array.isArray(editor.options) && editor.options.includes(value);
  return typeof value === "string";
}

function coerceDomValue(model, accepts, raw) {
  if (typeof raw !== "string") return raw;
  const editor = model?.valueTypesById?.[accepts] ? editorForValueType(model, accepts) : inferTraitEditor(model, accepts);
  if (editor.control === "number") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : raw;
  }
  if (editor.control === "checkbox") {
    if (["true", "1", "on", "yes"].includes(raw.toLowerCase())) return true;
    if (["false", "0", "off", "no"].includes(raw.toLowerCase())) return false;
  }
  return raw;
}

function inferTraitEditor(model, accepts) {
  if (FALLBACK_EDITOR_BY_TRAIT[accepts]) return FALLBACK_EDITOR_BY_TRAIT[accepts];
  for (const [trait, editor] of Object.entries(FALLBACK_EDITOR_BY_TRAIT)) {
    if (model?.traitsById?.[accepts] && accepts === trait) return editor;
  }
  return { control: "text" };
}

function normalizeFields(fields) {
  return Array.isArray(fields)
    ? fields
      .filter(Boolean)
      .map(field => ({
        name: String(field.name ?? ""),
        accepts: String(field.accepts ?? ""),
        required: field.required === true,
        ...(field.source ? { source: String(field.source) } : {})
      }))
      .filter(field => field.name && field.accepts)
    : [];
}

function normalizeEditor(editor) {
  if (!editor || typeof editor !== "object") return null;
  const control = typeof editor.control === "string" && editor.control ? editor.control : null;
  if (!control) return null;
  const normalized = { control };
  if (Array.isArray(editor.options)) normalized.options = editor.options.map(String);
  return normalized;
}

function jsTypeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function previewValue(value) {
  if (typeof value === "string") return JSON.stringify(value.length > 36 ? `${value.slice(0, 33)}...` : value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return String(value);
  return JSON.stringify(value);
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}
