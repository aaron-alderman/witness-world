export function createRvmFormRegistry(entries = []) {
  const active = new Map();
  const unresolved = new Map();

  const registry = {
    register(entry) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error("RVM form entry must be an object");
      }
      const kind = normalizeKind(entry.kind);
      if (active.has(kind) || unresolved.has(kind)) {
        throw new Error(`duplicate RVM form kind: ${kind}`);
      }
      if (typeof entry.parse !== "function") {
        throw new Error(`RVM form ${kind} requires parse(form, context)`);
      }
      if (typeof entry.serialize !== "function") {
        throw new Error(`RVM form ${kind} requires serialize(payload, context)`);
      }
      if (typeof entry.validate !== "function") {
        throw new Error(`RVM form ${kind} requires validate(form, context)`);
      }
      if (typeof entry.normalize !== "function") {
        throw new Error(`RVM form ${kind} requires normalize(node, context)`);
      }
      active.set(kind, {
        pluginId: normalizePluginId(entry.pluginId),
        kind,
        parse: entry.parse,
        serialize: entry.serialize,
        validate: entry.validate,
        normalize: entry.normalize
      });
      return registry;
    },
    registerUnresolved(kind, entry = {}) {
      const normalizedKind = normalizeKind(kind);
      if (active.has(normalizedKind) || unresolved.has(normalizedKind)) {
        throw new Error(`duplicate RVM form kind: ${normalizedKind}`);
      }
      unresolved.set(normalizedKind, {
        kind: normalizedKind,
        pluginId: normalizePluginId(entry.pluginId),
        reason: typeof entry.reason === "string" && entry.reason.trim() ? entry.reason.trim() : null
      });
      return registry;
    },
    has(kind) {
      return active.has(String(kind || "").trim());
    },
    get(kind) {
      return active.get(String(kind || "").trim()) ?? null;
    },
    getUnresolved(kind) {
      return unresolved.get(String(kind || "").trim()) ?? null;
    },
    knows(kind) {
      const normalizedKind = String(kind || "").trim();
      return active.has(normalizedKind) || unresolved.has(normalizedKind);
    },
    kinds() {
      return [...active.keys()];
    },
    unresolvedKinds() {
      return [...unresolved.keys()];
    },
    entries() {
      return [...active.values()];
    }
  };

  for (const entry of entries) registry.register(entry);
  return registry;
}

function normalizeKind(kind) {
  const normalized = typeof kind === "string" ? kind.trim() : "";
  if (!normalized) throw new Error("RVM form kind must be a non-empty string");
  return normalized;
}

function normalizePluginId(pluginId) {
  return typeof pluginId === "string" && pluginId.trim() ? pluginId.trim() : null;
}
