import crypto from "node:crypto";

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

export function stableHash(value, prefix = "h") {
  const hash = crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
  return `${prefix}_${hash.slice(0, 24)}`;
}

export function thingId(kind, seed) {
  return stableHash({ kind, seed }, "thing");
}

export function versionId(soul, version) {
  return stableHash({ soul, version }, "version");
}
