import {
  normalizeQueryBindings,
  normalizeRouteStateDescriptor,
  resolveRouteStateDescriptor,
  trimString
} from "./runtime-surface-runtime-shared.js";

export function activeRouteTargetForPath(manifest, pathname) {
  const normalized = String(pathname || "/").replace(/\/+$/, "") || "/";
  return (manifest?.routeTargets ?? []).find(target =>
    (String(target.path || "/").replace(/\/+$/, "") || "/") === normalized
  ) ?? null;
}

export function routeStateBindingForProcess(manifest, processRef) {
  const descriptor = resolveRouteStateDescriptor(manifest);
  if (!descriptor) return null;
  const state = trimString(descriptor.state) || trimString(descriptor.stateRef);
  const descriptorProcess = trimString(descriptor.process) || trimString(descriptor.processRef);
  if (!state) return null;
  if (descriptorProcess && processRef && descriptorProcess !== processRef) return null;
  return { processRef: descriptorProcess || processRef, state };
}

export function routeTargetForProcessState(manifest, processRuntime, processRef) {
  const targets = manifest?.routeTargets ?? [];
  if (!targets.length || !processRef) return null;
  const routeState = routeStateBindingForProcess(manifest, processRef);
  if (!routeState) return null;
  const value = processRuntime.value(routeState.state);
  return targets.find(target => String(target.key) === String(value)) ?? null;
}

export function routeTargetForManifestState(manifest, processRuntime) {
  const descriptor = normalizeRouteStateDescriptor(manifest?.routeState);
  const processRef = trimString(descriptor?.process) || trimString(descriptor?.processRef);
  if (!processRef) return null;
  return routeTargetForProcessState(manifest, processRuntime, processRef);
}

export function queryBindingsForProcess(manifest, processRef) {
  const normalizedProcessRef = trimString(processRef);
  return normalizeQueryBindings(manifest?.queryBindings)
    .filter(binding => !normalizedProcessRef || binding.processRef === normalizedProcessRef);
}

function sameQueryValue(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((value, index) => String(value) === String(right[index]));
  }
  return left === right;
}

function normalizeSearchValue(values = []) {
  if (!values.length) return undefined;
  return values.length === 1 ? values[0] : values;
}

function coerceQueryValue(rawValue, exemplar) {
  if (Array.isArray(exemplar)) {
    const values = Array.isArray(rawValue) ? rawValue : (rawValue == null ? [] : [rawValue]);
    return values.map(value => String(value));
  }
  if (typeof exemplar === "boolean") {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (typeof value === "boolean") return value;
    const normalized = String(value ?? "").trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
  }
  if (typeof exemplar === "number") {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
  if (Array.isArray(rawValue)) return rawValue.map(value => String(value));
  return rawValue == null ? "" : String(rawValue);
}

function queryUrlForWindow(window) {
  if (typeof window?.location?.href === "string" && window.location.href.trim()) {
    try {
      return new URL(window.location.href, window.location.origin || "http://127.0.0.1");
    } catch {}
  }
  const pathname = String(window?.location?.pathname || "/");
  const search = String(window?.location?.search || "");
  return new URL(`${pathname}${search}`, "http://127.0.0.1");
}

export function syncUrlToQueryState({ manifest, processRuntime, processRef, window }) {
  const bindings = queryBindingsForProcess(manifest, processRef);
  if (!bindings.length) return false;
  const url = queryUrlForWindow(window);
  let changed = false;
  for (const binding of bindings) {
    const values = url.searchParams.getAll(binding.param);
    const current = processRuntime.value(binding.state);
    if (!values.length && !Object.prototype.hasOwnProperty.call(binding, "defaultValue")) continue;
    const next = values.length
      ? coerceQueryValue(normalizeSearchValue(values), Object.prototype.hasOwnProperty.call(binding, "defaultValue") ? binding.defaultValue : current)
      : binding.defaultValue;
    if (sameQueryValue(current, next)) continue;
    processRuntime.set(binding.state, next);
    changed = true;
  }
  return changed;
}

export function syncUrlToRouteState({ manifest, processRuntime, processRef, window }) {
  const active = activeRouteTargetForPath(manifest, window?.location?.pathname);
  if (!active || !processRef) return false;
  const routeState = routeStateBindingForProcess(manifest, processRef);
  if (!routeState) return false;
  if (String(processRuntime.value(routeState.state)) === String(active.key)) return false;
  processRuntime.set(routeState.state, active.key);
  return true;
}

export function syncRouteStateToUrl({ manifest, processRuntime, processRef, window }) {
  const target = routeTargetForProcessState(manifest, processRuntime, processRef);
  if (!target?.path || !window?.history || !window?.location) return null;
  const currentPath = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
  const nextPath = String(target.path || "/").replace(/\/+$/, "") || "/";
  if (currentPath !== nextPath) window.history.pushState({ surfaceRouteKey: target.key }, "", target.path);
  return target;
}

export function syncQueryStateToUrl({ manifest, processRuntime, processRef, window }) {
  const bindings = queryBindingsForProcess(manifest, processRef);
  if (!bindings.length || !window?.history || !window?.location) return false;
  const url = queryUrlForWindow(window);
  const before = url.search;
  for (const binding of bindings) {
    const value = processRuntime.value(binding.state);
    const useDefault = Object.prototype.hasOwnProperty.call(binding, "defaultValue")
      && sameQueryValue(value, binding.defaultValue);
    const isEmpty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
    url.searchParams.delete(binding.param);
    if (useDefault || isEmpty) continue;
    if (Array.isArray(value)) {
      for (const entry of value) url.searchParams.append(binding.param, String(entry));
      continue;
    }
    url.searchParams.set(binding.param, String(value));
  }
  if (url.search === before) return false;
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({ surfaceQuerySync: true }, "", next);
  return true;
}

export function forceDocumentNavigation(window, targetPath) {
  const nextPath = trimString(targetPath);
  if (!nextPath || !window?.location) return false;
  if (typeof window.location.assign === "function") {
    window.location.assign(nextPath);
    return true;
  }
  try {
    window.location.href = nextPath;
    return true;
  } catch {
    return false;
  }
}

export function domParserForWindow(window) {
  if (typeof window?.DOMParser === "function") return new window.DOMParser();
  if (typeof DOMParser === "function") return new DOMParser();
  return null;
}

export function supportsSameDocumentRouteReplacement(document, window) {
  const hasFetch = typeof window?.fetch === "function";
  const hasTemplateParser = Boolean(document?.createElement?.("template")?.content);
  const hasDomParser = Boolean(domParserForWindow(window));
  return hasFetch && (hasDomParser || hasTemplateParser);
}

export function parseFirstElement(document, html) {
  if (!document || typeof html !== "string" || !html.trim()) return null;
  const template = document.createElement("template");
  if (!template?.content) return null;
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function readSurfaceRuntimeManifest(document) {
  const node = document?.getElementById?.("surface-runtime-manifest");
  if (!node) return null;
  try {
    return JSON.parse(node.textContent || "null");
  } catch {
    return null;
  }
}

export function parseRouteSurfacePage({ document, window, html, rootId = null } = {}) {
  if (!html || typeof html !== "string") return { fragment: null, manifest: null };
  const parser = domParserForWindow(window);
  if (parser) {
    const parsed = parser.parseFromString(html, "text/html");
    const manifestNode = parsed?.getElementById?.("surface-runtime-manifest");
    let manifest = null;
    if (manifestNode?.textContent) {
      try {
        manifest = JSON.parse(manifestNode.textContent);
      } catch {}
    }
    if (rootId) {
      const root = parsed?.getElementById?.(rootId);
      if (root?.outerHTML) return { fragment: root.outerHTML, manifest };
    }
    return { fragment: parsed?.body?.firstElementChild?.outerHTML ?? null, manifest };
  }
  const first = parseFirstElement(document, html);
  if (!first) return { fragment: null, manifest: null };
  if (rootId && trimString(first?.id) && trimString(first.id) !== rootId) return { fragment: null, manifest: null };
  return { fragment: first.outerHTML ?? html.trim(), manifest: null };
}

export async function loadRouteSurfacePage({ document, window, manifest, surfaceById, target, requireManifest = false } = {}) {
  if (!target?.surfaceId || !target?.path) return null;
  const pageMatchesTarget = page => {
    const targetPath = trimString(target?.path);
    if (!targetPath) return true;
    const requestPathname = trimString(page?.manifest?.requestPathname);
    if (!requestPathname) return true;
    const normalizePath = pathname => String(pathname || "/").replace(/\/+$/, "") || "/";
    return normalizePath(requestPathname) === normalizePath(targetPath);
  };
  const cacheKey = trimString(target.key) || trimString(target.surfaceId);
  if (!manifest.__routeSurfacePageCache) manifest.__routeSurfacePageCache = {};
  if (cacheKey && manifest.__routeSurfacePageCache[cacheKey]) {
    const cached = manifest.__routeSurfacePageCache[cacheKey];
    if ((!requireManifest || cached?.manifest?.surfaces) && pageMatchesTarget(cached)) return cached;
  }
  const fetchImpl = typeof window?.fetch === "function"
    ? window.fetch.bind(window)
    : null;
  if (!fetchImpl) return null;
  const rootId = trimString(surfaceById?.get(target.surfaceId)?.view?.rootId);
  const loadAttempt = async headers => {
    const response = await fetchImpl(target.path, headers ? { headers } : {});
    const html = await response.text();
    if (!response?.ok) {
      const contentType = typeof response?.headers?.get === "function"
        ? String(response.headers.get("content-type") || "")
        : "";
      if (!contentType.includes("text/html")) return null;
    }
    return parseRouteSurfacePage({
      document,
      window,
      html,
      rootId
    });
  };
  let page = await loadAttempt({ "x-surface-fragment-request": "1" });
  if (requireManifest && !page?.manifest?.surfaces) {
    page = await loadAttempt();
  }
  if (cacheKey && page?.fragment && pageMatchesTarget(page)) {
    manifest.__routeSurfacePageCache[cacheKey] = page;
  }
  return page;
}

export function routeTemplateValue(request = {}, expression = "") {
  const parts = String(expression || "").split(".").filter(Boolean);
  let current = request;
  for (const part of parts) {
    if (current == null || typeof current !== "object" || !(part in current)) return "";
    current = current[part];
  }
  return current == null ? "" : String(current);
}

export function interpolateRouteTemplate(template = "", request = {}) {
  return String(template || "").replace(/\$\{([A-Za-z0-9_.-]+)\}/g, (_, expression) =>
    encodeURIComponent(routeTemplateValue(request, expression))
  );
}

export function parseRouteResponseBody(response, text = "") {
  const responseHeaders = response?.headers;
  const contentType = typeof responseHeaders?.get === "function"
    ? String(responseHeaders.get("content-type") || "")
    : "";
  const raw = String(text || "");
  if (!raw) return {};
  if (contentType.includes("application/json") || /^[\[{]/.test(raw.trim())) {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }
  return { raw };
}

export function normalizeRouteResponsePayload(body, {
  ok = false,
  status = 0,
  method = "POST",
  route = ""
} = {}) {
  const payload = body && typeof body === "object" && !Array.isArray(body)
    ? { ...body }
    : { value: body };
  const fallback = ok
    ? `${String(method || "POST").toUpperCase()} ${route || "request"} succeeded`
    : `${String(method || "POST").toUpperCase()} ${route || "request"} failed (${status || 0})`;
  const message = trimString(payload.message)
    || trimString(payload.error)
    || fallback;
  payload.message = message;
  payload.summary = JSON.stringify(body == null ? {} : body, null, 2);
  payload.statusCode = Number(status || 0);
  return payload;
}

export function createBrowserRouteInvoker(window, {
  collectionStore = null
} = {}) {
  const readRouteResponsePath = (body, path) => {
    const parts = String(path || "").split(".").filter(Boolean);
    let current = body;
    for (const part of parts) {
      if (current == null || typeof current !== "object" || !(part in current)) {
        return { found: false, value: undefined };
      }
      current = current[part];
    }
    return { found: true, value: current };
  };
  const resolveRouteCollectionOutputs = (body, mapping) => {
    const entries = Object.entries(mapping ?? {}).filter(([collectionId, responsePath]) => (
      trimString(collectionId) && trimString(responsePath)
    ));
    if (!entries.length) return null;
    const next = {};
    for (const [collectionId, responsePath] of entries) {
      const resolved = readRouteResponsePath(body, responsePath);
      if (!resolved.found) continue;
      next[collectionId] = Array.isArray(resolved.value) ? structuredClone(resolved.value) : [];
    }
    return Object.keys(next).length ? next : null;
  };
  return async ({
    route,
    method = "POST",
    actorState = null,
    request = {},
    binding = null,
    runtime = null
  } = {}) => {
    if (!window || typeof window.fetch !== "function") {
      throw new Error("route invoker requires window.fetch");
    }
    const normalizedMethod = trimString(method)?.toUpperCase() || "POST";
    const resolvedRoute = interpolateRouteTemplate(route, request);
    const headers = { "content-type": "application/json" };
    if (actorState && runtime && typeof runtime.value === "function") {
      const actor = trimString(runtime.value(actorState));
      if (actor) headers["x-witness-actor"] = actor;
    }
    const init = {
      method: normalizedMethod,
      headers,
      credentials: "same-origin"
    };
    if (!["GET", "HEAD"].includes(normalizedMethod)) {
      const hasBody = normalizedMethod !== "DELETE" || Object.keys(request ?? {}).length > 0;
      if (hasBody) init.body = JSON.stringify(request ?? {});
    }
    const response = await window.fetch(resolvedRoute, init);
    const text = typeof response.text === "function" ? await response.text() : "";
    const body = parseRouteResponseBody(response, text);
    const collectionOutputs = response.ok
      ? resolveRouteCollectionOutputs(body, binding?.op?.collectionOutputs)
      : null;
    if (response.ok && collectionOutputs && collectionStore && typeof collectionStore.replaceMany === "function") {
      collectionStore.replaceMany(collectionOutputs);
    }
    return {
      status: response.ok ? "success" : "failure",
      collections: collectionOutputs,
      payload: normalizeRouteResponsePayload(body, {
        ok: response.ok,
        status: response.status,
        method: normalizedMethod,
        route: resolvedRoute
      })
    };
  };
}
