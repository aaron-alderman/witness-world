export function runtimeConfigScalar(value) {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean";
}

export function normalizeRuntimeConfigFieldName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if ((raw.startsWith("\"") && raw.endsWith("\"")) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

export function runtimeConfigLookup(runtimeConfig, key) {
  if (!runtimeConfig || typeof runtimeConfig !== "object" || Array.isArray(runtimeConfig)) return undefined;
  if (Object.prototype.hasOwnProperty.call(runtimeConfig, key)) return runtimeConfig[key];
  const quotedKey = `"${key}"`;
  if (Object.prototype.hasOwnProperty.call(runtimeConfig, quotedKey)) return runtimeConfig[quotedKey];
  const parts = String(key || "").split(".").filter(Boolean);
  if (!parts.length) return undefined;
  let current = runtimeConfig;
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !Object.prototype.hasOwnProperty.call(current, part)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

export function positiveInteger(value, fallback, { minimum = 1 } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

export function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function isoAt(timeMs) {
  return new Date(timeMs).toISOString();
}

export function resolveRuntimeConfig(runtimeConfig, env = process.env) {
  if (runtimeConfig == null) {
    return { ok: true, values: {}, fields: [], failures: [] };
  }
  if (!runtimeConfig || typeof runtimeConfig !== "object" || Array.isArray(runtimeConfig)) {
    return {
      ok: false,
      values: {},
      fields: [],
      failures: [{ field: null, reason: "runtimeConfig must be an object" }]
    };
  }
  const values = {};
  const fields = [];
  const failures = [];

  for (const [name, raw] of Object.entries(runtimeConfig)) {
    const fieldName = normalizeRuntimeConfigFieldName(name);
    if (!fieldName) {
      failures.push({ field: fieldName || name, reason: "runtime config field name required" });
      continue;
    }
    if (runtimeConfigScalar(raw)) {
      values[fieldName] = raw;
      fields.push({
        name: fieldName,
        required: false,
        secret: false,
        secretRef: null,
        exposed: true,
        resolved: true,
        source: "value",
        value: raw
      });
      continue;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      failures.push({ field: fieldName, reason: "runtime config entry must be a scalar or object" });
      continue;
    }

    const hasValue = Object.prototype.hasOwnProperty.call(raw, "value");
    const hasDefault = Object.prototype.hasOwnProperty.call(raw, "default");
    const hasSecret = Object.prototype.hasOwnProperty.call(raw, "secret");
    const secretRef = hasSecret && typeof raw.secret === "string" && raw.secret.trim() ? raw.secret.trim() : null;
    const explicitValue = hasValue ? raw.value : undefined;
    const defaultValue = hasDefault ? raw.default : undefined;
    const required = raw.required === undefined ? !(hasValue || hasDefault) : raw.required === true;
    const exposed = raw.expose === undefined ? !hasSecret : raw.expose === true;

    if (hasValue && !runtimeConfigScalar(explicitValue)) {
      failures.push({ field: fieldName, reason: "runtime config value must be a string, number, or boolean" });
      continue;
    }
    if (hasDefault && !runtimeConfigScalar(defaultValue)) {
      failures.push({ field: fieldName, reason: "runtime config default must be a string, number, or boolean" });
      continue;
    }
    if (hasSecret && !secretRef) {
      failures.push({ field: fieldName, reason: "runtime config secret must be a non-empty string" });
      continue;
    }
    if (hasValue && hasSecret) {
      failures.push({ field: fieldName, reason: "runtime config entry cannot define both value and secret" });
      continue;
    }
    if (!hasValue && !hasDefault && !hasSecret) {
      failures.push({ field: fieldName, reason: "runtime config entry must define value, default, or secret" });
      continue;
    }

    let resolved = false;
    let source = null;
    let value = undefined;
    if (hasValue) {
      resolved = true;
      source = "value";
      value = explicitValue;
    } else if (secretRef) {
      const envValue = env[secretRef];
      if (typeof envValue === "string" && envValue.length) {
        resolved = true;
        source = "secret";
        value = envValue;
      } else if (hasDefault) {
        resolved = true;
        source = "default";
        value = defaultValue;
      } else if (!required) {
        source = "missing";
      } else {
        failures.push({ field: fieldName, reason: "missing secret reference", secretRef });
      }
    } else if (hasDefault) {
      resolved = true;
      source = "default";
      value = defaultValue;
    }

    if (resolved) values[fieldName] = value;
    fields.push({
      name: fieldName,
      required,
      secret: Boolean(secretRef),
      secretRef,
      exposed,
      resolved,
      source,
      ...(resolved && !secretRef && exposed ? { value } : {}),
      ...(resolved && secretRef ? { redacted: true } : {})
    });
  }

  return { ok: failures.length === 0, values, fields, failures };
}
