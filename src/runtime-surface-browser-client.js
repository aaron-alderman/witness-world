function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function createMemoryScope() {
  const values = new Map();
  return {
    get(key) {
      return values.has(key) ? values.get(key) : null;
    },
    set(key, value) {
      values.set(key, value);
    },
    remove(key) {
      values.delete(key);
    }
  };
}

function createStorageScope(storage) {
  return {
    get(key) {
      try {
        return storage?.getItem?.(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage?.setItem?.(key, value);
      } catch {}
    },
    remove(key) {
      try {
        storage?.removeItem?.(key);
      } catch {}
    }
  };
}

function createHostServices(config) {
  const routeListeners = new Set();
  const memoryScope = createMemoryScope();
  const scopedStorage = Object.freeze({
    ephemeral: memoryScope,
    session: createStorageScope(globalThis.sessionStorage),
    persistent: createStorageScope(globalThis.localStorage)
  });
  const availableCapabilities = new Set(config?.runtime?.availableCapabilities ?? []);
  const declaredCapabilities = new Set(config?.runtime?.declaredCapabilities ?? []);
  const declaredPlugins = new Set(config?.runtime?.declaredPlugins ?? []);

  const emitRouteChange = () => {
    const payload = Object.freeze({
      pathname: globalThis.location?.pathname ?? "/",
      href: globalThis.location?.href ?? ""
    });
    for (const listener of routeListeners) listener(payload);
  };

  const onPopState = () => emitRouteChange();
  globalThis.addEventListener("popstate", onPopState);

  return {
    window: globalThis,
    document: globalThis.document,
    surface: Object.freeze(config?.surface ?? {}),
    runtime: Object.freeze({
      availableCapabilities: Object.freeze([...availableCapabilities]),
      declaredCapabilities: Object.freeze([...declaredCapabilities]),
      declaredPlugins: Object.freeze([...declaredPlugins]),
      hasCapability(capabilityId) {
        return availableCapabilities.has(String(capabilityId || ""));
      },
      declaresCapability(capabilityId) {
        return declaredCapabilities.has(String(capabilityId || ""));
      },
      declaresPlugin(pluginId) {
        return declaredPlugins.has(String(pluginId || ""));
      }
    }),
    navigation: Object.freeze({
      current() {
        return Object.freeze({
          pathname: globalThis.location?.pathname ?? "/",
          href: globalThis.location?.href ?? ""
        });
      },
      assign(href) {
        if (!href) return;
        globalThis.location.assign(String(href));
      },
      replace(href) {
        if (!href) return;
        globalThis.location.replace(String(href));
      },
      onChange(listener) {
        if (typeof listener !== "function") return () => {};
        routeListeners.add(listener);
        return () => routeListeners.delete(listener);
      }
    }),
    persistence: Object.freeze({
      read(scope, key, fallback = null) {
        const storage = scopedStorage[scope] ?? null;
        if (!storage || !key) return fallback;
        const raw = storage.get(String(key));
        return raw == null ? fallback : safeJsonParse(raw, fallback);
      },
      write(scope, key, value) {
        const storage = scopedStorage[scope] ?? null;
        if (!storage || !key) return;
        storage.set(String(key), JSON.stringify(value ?? null));
      },
      remove(scope, key) {
        const storage = scopedStorage[scope] ?? null;
        if (!storage || !key) return;
        storage.remove(String(key));
      }
    }),
    async fetchJson(href) {
      if (!href) return null;
      const response = await fetch(String(href), { credentials: "same-origin" });
      if (!response.ok) {
        throw new Error(`failed to load frontend artifact config: ${response.status}`);
      }
      return response.json();
    },
    dispose() {
      globalThis.removeEventListener("popstate", onPopState);
      routeListeners.clear();
    }
  };
}

async function loadRenderer(config) {
  const href = typeof config?.rendererHref === "string" ? config.rendererHref.trim() : "";
  if (!href) return null;
  const exportName = typeof config?.rendererExport === "string" && config.rendererExport.trim()
    ? config.rendererExport.trim()
    : "default";
  const moduleNamespace = await import(href);
  const renderer = exportName === "default"
    ? moduleNamespace.default
    : moduleNamespace?.[exportName];
  if (typeof renderer !== "function") {
    throw new Error(`surface renderer export not found: ${exportName}`);
  }
  return renderer;
}

async function bootSurfaceHost(config) {
  if (!config?.rendererHref) return;
  const renderer = await loadRenderer(config);
  if (!renderer) return;
  const services = createHostServices(config);
  let teardown = null;
  try {
    teardown = await renderer({
      surface: services.surface,
      runtime: services.runtime,
      navigation: services.navigation,
      persistence: services.persistence,
      fetchJson: services.fetchJson,
      window: services.window,
      document: services.document,
      configHref: config.configHref ?? null
    });
  } catch (error) {
    services.dispose();
    throw error;
  }

  const destroy = () => {
    try {
      if (typeof teardown === "function") teardown();
      else if (teardown && typeof teardown.destroy === "function") teardown.destroy();
    } finally {
      services.dispose();
    }
  };

  globalThis.addEventListener("beforeunload", destroy, { once: true });
}

bootSurfaceHost(globalThis.desireSurfaceClientConfig ?? null)
  .catch(error => {
    console.error("[surface-host]", error);
  });
