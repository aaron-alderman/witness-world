import {
  normalizeCapabilityAssets,
  trimString
} from "./runtime-surface-runtime-shared.js";

export function capabilityBootIssueId(hook, index, root) {
  const hookName = trimString(hook?.name) || `hook-${Number(index) + 1}`;
  const rootId = trimString(root?.id) || "active-root";
  return `surface-runtime:capability-boot-failed:${rootId}:${hookName}`;
}

export function bootSurfaceCapabilities(window, root, {
  reportIssue = null,
  resolveIssue = null,
  phase = "capability-mount",
  correlationId = null
} = {}) {
  const hooks = Array.isArray(window?.__surfaceCapabilityBootHooks)
    ? window.__surfaceCapabilityBootHooks
    : [];
  for (const [index, hook] of hooks.entries()) {
    if (typeof hook !== "function") continue;
    const issueId = capabilityBootIssueId(hook, index, root);
    try {
      hook(root);
      if (typeof resolveIssue === "function") resolveIssue(issueId, { phase, correlationId });
    } catch (error) {
      window?.console?.error?.("surface capability boot failed", error);
      if (typeof reportIssue === "function") {
        reportIssue({
          id: issueId,
          severity: "error",
          phase,
          kind: "capability-boot-failed",
          message: "Surface capability boot hook failed",
          capability: trimString(hook?.capability) || null,
          targetId: trimString(root?.id),
          details: {
            hookName: trimString(hook?.name) || null,
            rootId: trimString(root?.id) || null,
            name: error?.name || "Error",
            message: String(error?.message || error),
            stack: String(error?.stack || "")
          },
          correlationId
        });
      }
    }
  }
}

export function capabilityAssetHash(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function waitForNodeLoad(node) {
  return new Promise((resolve, reject) => {
    if (!node || typeof node.addEventListener !== "function") {
      resolve();
      return;
    }
    const cleanup = () => {
      node.removeEventListener?.("load", onLoad);
      node.removeEventListener?.("error", onError);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = error => {
      cleanup();
      reject(error instanceof Error ? error : new Error("surface capability asset failed to load"));
    };
    node.addEventListener("load", onLoad, { once: true });
    node.addEventListener("error", onError, { once: true });
  });
}

export async function waitForSurfaceCapabilityModuleSettle(window, {
  readyStart = 0,
  hookStart = 0,
  maxPasses = 8
} = {}) {
  const tick = async () => {
    if (typeof window?.requestAnimationFrame === "function") {
      await new Promise(resolve => window.requestAnimationFrame(() => resolve()));
      return;
    }
    await new Promise(resolve => {
      if (typeof setTimeout === "function") {
        setTimeout(resolve, 0);
        return;
      }
      resolve();
    });
  };

  let lastReady = readyStart;
  let lastHooks = hookStart;
  let stablePasses = 0;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    await tick();
    const nextReady = Array.isArray(window?.__surfaceCapabilityReadyPromises)
      ? window.__surfaceCapabilityReadyPromises.length
      : 0;
    const nextHooks = Array.isArray(window?.__surfaceCapabilityBootHooks)
      ? window.__surfaceCapabilityBootHooks.length
      : 0;
    if (nextReady === lastReady && nextHooks === lastHooks) {
      stablePasses += 1;
      if (stablePasses >= 2) break;
      continue;
    }
    lastReady = nextReady;
    lastHooks = nextHooks;
    stablePasses = 0;
  }
}

export async function waitForSurfaceCapabilityModuleRegistration(window, {
  readyStart = 0,
  hookStart = 0,
  maxPasses = 40
} = {}) {
  for (let pass = 0; pass < maxPasses; pass += 1) {
    await waitForSurfaceCapabilityModuleSettle(window, {
      readyStart,
      hookStart,
      maxPasses: 1
    });
    const nextReady = Array.isArray(window?.__surfaceCapabilityReadyPromises)
      ? window.__surfaceCapabilityReadyPromises.length
      : 0;
    const nextHooks = Array.isArray(window?.__surfaceCapabilityBootHooks)
      ? window.__surfaceCapabilityBootHooks.length
      : 0;
    if (nextReady > readyStart || nextHooks > hookStart) return;
  }
}

export async function ensureSurfaceCapabilityAssets(document, window, capabilityAssets) {
  const assets = normalizeCapabilityAssets(capabilityAssets);
  const readyStart = Array.isArray(window?.__surfaceCapabilityReadyPromises)
    ? window.__surfaceCapabilityReadyPromises.length
    : 0;
  const hookStart = Array.isArray(window?.__surfaceCapabilityBootHooks)
    ? window.__surfaceCapabilityBootHooks.length
    : 0;
  const registry = window?.__surfaceCapabilityAssetRegistry && typeof window.__surfaceCapabilityAssetRegistry === "object"
    ? window.__surfaceCapabilityAssetRegistry
    : (window.__surfaceCapabilityAssetRegistry = {
        stylesheets: new Set(),
        scripts: new Set(),
        inlineStyles: new Set(),
        inlineModules: new Set()
      });
  const head = document?.head ?? document?.documentElement ?? document?.body ?? null;
  if (!head) return;

  for (const href of assets.stylesheetHrefs) {
    if (registry.stylesheets.has(href)) continue;
    if (typeof document?.querySelector === "function" && document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
      registry.stylesheets.add(href);
      continue;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    head.appendChild(link);
    registry.stylesheets.add(href);
  }

  for (const cssText of assets.inlineCss) {
    const key = capabilityAssetHash(cssText);
    if (registry.inlineStyles.has(key)) continue;
    if (typeof document?.querySelector === "function" && document.querySelector(`style[data-surface-capability-style="${key}"]`)) {
      registry.inlineStyles.add(key);
      continue;
    }
    const style = document.createElement("style");
    style.setAttribute("data-surface-capability-style", key);
    style.textContent = cssText;
    head.appendChild(style);
    registry.inlineStyles.add(key);
  }

  for (const src of assets.scriptSrcs) {
    if (registry.scripts.has(src)) continue;
    if (typeof document?.querySelector === "function" && document.querySelector(`script[src="${src}"]`)) {
      registry.scripts.add(src);
      continue;
    }
    const script = document.createElement("script");
    script.src = src;
    head.appendChild(script);
    await waitForNodeLoad(script);
    registry.scripts.add(src);
  }

  for (const moduleSource of assets.scriptBodies) {
    const key = capabilityAssetHash(moduleSource);
    if (registry.inlineModules.has(key)) continue;
    if (typeof document?.querySelector === "function" && document.querySelector(`script[data-surface-capability-module="${key}"]`)) {
      registry.inlineModules.add(key);
      continue;
    }
    const script = document.createElement("script");
    script.type = "module";
    script.setAttribute("data-surface-capability-module", key);
    script.textContent = moduleSource;
    head.appendChild(script);
    registry.inlineModules.add(key);
  }
  if (assets.scriptBodies.length) {
    await waitForSurfaceCapabilityModuleRegistration(window, { readyStart, hookStart });
  }
  await waitForSurfaceCapabilityModuleSettle(window, { readyStart, hookStart });
  const readyQueue = Array.isArray(window?.__surfaceCapabilityReadyPromises)
    ? window.__surfaceCapabilityReadyPromises.slice(readyStart)
    : [];
  if (readyQueue.length) {
    await Promise.all(readyQueue.map(promise => Promise.resolve(promise)));
  }
  await waitForSurfaceCapabilityModuleSettle(window, { readyStart, hookStart });
}

export function surfaceAssetRegistrySnapshot(window) {
  const registry = window?.__surfaceCapabilityAssetRegistry && typeof window.__surfaceCapabilityAssetRegistry === "object"
    ? window.__surfaceCapabilityAssetRegistry
    : null;
  const list = value => value instanceof Set ? [...value] : [];
  return {
    stylesheets: list(registry?.stylesheets),
    scripts: list(registry?.scripts),
    inlineStyles: list(registry?.inlineStyles),
    inlineModules: list(registry?.inlineModules)
  };
}
