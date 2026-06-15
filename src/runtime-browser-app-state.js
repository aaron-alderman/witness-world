function cloneJsonValue(value) {
  if (value == null) return value ?? {};
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeBrowserStateKey(key, fallback = "desire.surface-state") {
  return typeof key === "string" && key.trim() ? key.trim() : fallback;
}

export function deepMergeState(base, patch) {
  if (patch == null) return cloneJsonValue(base);
  if (Array.isArray(patch)) return cloneJsonValue(patch);
  if (!isObject(patch)) return patch;
  const target = isObject(base) ? cloneJsonValue(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete target[key];
      continue;
    }
    target[key] = deepMergeState(target[key], value);
  }
  return target;
}

export function readPath(object, path) {
  if (!path) return object;
  const parts = String(path)
    .split(".")
    .map(part => part.trim())
    .filter(Boolean);
  let current = object;
  for (const part of parts) {
    if (!isObject(current) && !Array.isArray(current)) return undefined;
    current = current?.[part];
  }
  return current;
}

export function writePath(object, path, value) {
  const parts = String(path)
    .split(".")
    .map(part => part.trim())
    .filter(Boolean);
  if (!parts.length) return cloneJsonValue(value);
  const root = isObject(object) ? cloneJsonValue(object) : {};
  let current = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const next = current[key];
    current[key] = isObject(next) ? cloneJsonValue(next) : {};
    current = current[key];
  }
  current[parts.at(-1)] = cloneJsonValue(value);
  return root;
}

export function pickPaths(state, paths = []) {
  let picked = {};
  for (const path of paths) {
    const value = readPath(state, path);
    if (value === undefined) continue;
    picked = writePath(picked, path, value);
  }
  return picked;
}

export function mergeScopedBrowserState({
  defaults = {},
  ephemeral = {},
  session = {},
  persistent = {}
} = {}) {
  return deepMergeState(
    deepMergeState(
      deepMergeState(defaults, persistent),
      session
    ),
    ephemeral
  );
}

export function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

export function readScopedBrowserState(storage, key) {
  if (!storage || typeof storage.getItem !== "function") return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function writeScopedBrowserState(storage, key, value) {
  if (!storage || typeof storage.setItem !== "function") return;
  const payload = isObject(value) ? value : {};
  storage.setItem(key, JSON.stringify(payload));
}

export function createBrowserStateSnapshot({
  state = {},
  sessionPaths = [],
  persistentPaths = []
} = {}) {
  return {
    session: pickPaths(state, sessionPaths),
    persistent: pickPaths(state, persistentPaths)
  };
}
