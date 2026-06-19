import {
  readInitialStateFromWorld,
  readProjectionStateFromWorld,
  readSurfaceMapFromWorld,
  renderSurfaceStaticFragment,
  resolveSurfaceShellFromMap
} from "./runtime-surface-shell.js";
import {
  buildSurfaceRuntimeManifest,
} from "./runtime-surface-interaction-runtime.js";
import { renderSurfaceInteractionRuntimeModule } from "./runtime-surface-browser-runtime-module.js";

function escapeScriptBody(source) {
  return String(source ?? "").replaceAll("</script", "<\\/script");
}

function injectInteractionRuntime(html, manifest) {
  if (!manifest) return html;
  const manifestScript = `<script type="application/json" id="surface-runtime-manifest">${escapeScriptBody(JSON.stringify(manifest))}</script>`;
  const script = `<script data-surface-runtime-script="1">\n${escapeScriptBody(renderSurfaceInteractionRuntimeModule())}\n</script>`;
  return String(html).includes("</body>")
    ? String(html).replace("</body>", `    ${manifestScript}\n    ${script}\n  </body>`)
    : `${html}\n${manifestScript}\n${script}`;
}

function injectWitnessCoreUrl(html, witnessCoreUrl = null) {
  const url = typeof witnessCoreUrl === "string" && witnessCoreUrl.trim() ? witnessCoreUrl.trim() : "";
  if (!url) return html;
  const script = `<script data-witness-core-url="1">window.__witnessCoreUrl = ${JSON.stringify(url)};</script>`;
  return String(html).includes("</body>")
    ? String(html).replace("</body>", `    ${script}\n  </body>`)
    : `${html}\n${script}`;
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(value => String(value ?? "").trim()).filter(Boolean))];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function capabilityAssetHash(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildSurfaceRenderers(rendererProviders = [], context = {}) {
  return rendererProviders
    .map(provider => {
      if (typeof provider?.factory !== "function") return null;
      const renderer = provider.factory(context);
      if (!renderer || typeof renderer !== "object") return null;
      return {
        providerId: provider.id ?? null,
        capability: provider.capability ?? renderer.capability ?? null,
        ...renderer
      };
    })
    .filter(renderer => renderer && typeof renderer.renderSurface === "function");
}

function buildSurfaceRuntimeSupportAssets(assetProviders = [], context = {}) {
  return assetProviders
    .map(provider => {
      if (typeof provider?.factory !== "function") return null;
      const assets = provider.factory(context);
      if (!assets || typeof assets !== "object") return null;
      return {
        providerId: provider.id ?? null,
        ...assets
      };
    })
    .filter(Boolean);
}

function capabilityAssetsForRenderers(renderers = []) {
  const stylesheetHrefs = uniqueStrings(renderers.flatMap(renderer => (
    Array.isArray(renderer?.stylesheetHrefs) ? renderer.stylesheetHrefs : []
  )));
  const scriptSrcs = uniqueStrings(renderers.flatMap(renderer => (
    Array.isArray(renderer?.scriptSrcs) ? renderer.scriptSrcs : []
  )));
  const inlineCss = uniqueStrings(renderers.flatMap(renderer => {
    if (Array.isArray(renderer?.inlineCss)) return renderer.inlineCss;
    const inlineCss = String(renderer?.inlineCss ?? "").trim();
    return inlineCss ? [inlineCss] : [];
  }));
  const scriptBodies = uniqueStrings(renderers.flatMap(renderer => {
    const inlineModules = Array.isArray(renderer?.scriptBodies) ? renderer.scriptBodies : [];
    const scriptBody = String(renderer?.scriptBody ?? "").trim();
    return scriptBody ? [...inlineModules, scriptBody] : inlineModules;
  }));
  if (!stylesheetHrefs.length && !scriptSrcs.length && !inlineCss.length && !scriptBodies.length) return null;
  return {
    stylesheetHrefs,
    scriptSrcs,
    inlineCss,
    scriptBodies
  };
}

function mergeManifestPayload(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const next = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && next[key]
      && typeof next[key] === "object"
      && !Array.isArray(next[key])
    ) {
      next[key] = { ...next[key], ...value };
      continue;
    }
    next[key] = value;
  }
  return next;
}

function manifestPayloadForRenderers(renderers = []) {
  return renderers.reduce((payload, renderer) => {
    if (typeof renderer?.buildManifest !== "function") return payload;
    return mergeManifestPayload(payload, renderer.buildManifest());
  }, {});
}

function buildCapabilityPreloadAssetsMap(preloadProviders = [], context = {}) {
  const assetsByCapability = {};
  for (const provider of preloadProviders) {
    if (typeof provider?.factory !== "function") continue;
    const capability = String(provider.capability || "").trim();
    if (!capability) continue;
    const assets = provider.factory(context);
    const normalized = capabilityAssetsForRenderers([assets]);
    if (!normalized) continue;
    assetsByCapability[capability] = normalized;
  }
  return assetsByCapability;
}

function collectRootSurfaceCapabilityRefs(surfaces, rootSurfaceId) {
  const required = new Set();
  const queue = [String(rootSurfaceId || "").trim()];
  const seen = new Set();
  while (queue.length) {
    const surfaceId = queue.shift();
    if (!surfaceId || seen.has(surfaceId)) continue;
    seen.add(surfaceId);
    const surface = surfaces.get(surfaceId);
    if (!surface) continue;
    for (const capability of Array.isArray(surface.capabilityRefs) ? surface.capabilityRefs : []) {
      const value = String(capability || "").trim();
      if (value) required.add(value);
    }
    for (const childId of Array.isArray(surface.children) ? surface.children : []) {
      const value = String(childId || "").trim();
      if (value) queue.push(value);
    }
  }
  return required;
}

function routeKeysReferencedByPolicy(policy = {}) {
  const routeKeys = [];
  const whenRoute = String(policy?.when?.route || "").trim();
  if (whenRoute) routeKeys.push(whenRoute);
  for (const target of policy?.targets ?? []) {
    const route = String(target?.route || "").trim();
    if (route) routeKeys.push(route);
  }
  return [...new Set(routeKeys)];
}

function filterRuntimePreloadsForRoot(runtimePreloads = [], { routeTargets = [], rootCapabilities = new Set() } = {}) {
  const routeKeys = new Set((routeTargets ?? []).map(target => String(target?.key || "").trim()).filter(Boolean));
  return (runtimePreloads ?? []).filter(policy => {
    const referencedRoutes = routeKeysReferencedByPolicy(policy);
    if (referencedRoutes.length) return referencedRoutes.every(routeKey => routeKeys.has(routeKey));
    const capabilityTargets = (policy?.targets ?? [])
      .filter(target => target?.kind === "capability")
      .map(target => String(target?.capability || "").trim())
      .filter(Boolean);
    return capabilityTargets.every(capability => rootCapabilities.has(capability));
  });
}

function activeSurfaceCapabilityRefs(surfaces, activeSurfaceId) {
  const required = new Set();
  const queue = [String(activeSurfaceId || "").trim()];
  const seen = new Set();
  while (queue.length) {
    const surfaceId = queue.shift();
    if (!surfaceId || seen.has(surfaceId)) continue;
    seen.add(surfaceId);
    const surface = surfaces.get(surfaceId);
    if (!surface) continue;
    for (const capability of Array.isArray(surface.capabilityRefs) ? surface.capabilityRefs : []) {
      const value = String(capability || "").trim();
      if (value) required.add(value);
    }
    for (const childId of Array.isArray(surface.children) ? surface.children : []) {
      const value = String(childId || "").trim();
      if (value) queue.push(value);
    }
  }
  return required;
}

function injectCapabilityAssets(html, renderers = []) {
  const assets = capabilityAssetsForRenderers(renderers);
  if (!assets) return html;
  const { stylesheetHrefs, scriptSrcs, inlineCss, scriptBodies } = assets;
  const headAssets = [
    ...stylesheetHrefs.map(href => `<link rel="stylesheet" href="${escapeAttr(href)}">`),
    ...scriptSrcs.map(src => `<script src="${escapeAttr(src)}"></script>`),
    ...inlineCss.map(cssText => `<style data-surface-capability-style="${escapeAttr(capabilityAssetHash(cssText))}">\n${cssText}\n</style>`)
  ].filter(Boolean).join("\n");
  const bodyAssets = scriptBodies
    .map(source => `<script type="module" data-surface-capability-module="${escapeAttr(capabilityAssetHash(source))}">\n${source}\n</script>`)
    .join("\n");
  let next = String(html ?? "");
  if (headAssets) {
    next = next.includes("</head>")
      ? next.replace("</head>", `${headAssets}\n  </head>`)
      : `${headAssets}\n${next}`;
  }
  if (bodyAssets) {
    next = next.includes("</body>")
      ? next.replace("</body>", `    ${bodyAssets}\n  </body>`)
      : `${next}\n${bodyAssets}`;
  }
  return next;
}

export function renderSurfacePage(world, {
  rootSurfaceId,
  requestPathname = "/",
  route = null,
  browserRuntimeCapabilities = [],
  runtimePreloads = [],
  routeStateDescriptor = null,
  queryBindings = [],
  surfaceCapabilityRenderers = [],
  capabilityPreloadProviders = [],
  surfaceRuntimeSupportAssets = [],
  devMode = false,
  initialStateOverrides = null,
  stylesheetQuery = null,
  witnessCoreUrl = null
} = {}) {
  const initialState = readInitialStateFromWorld(world);
  const mergedInitialState = initialStateOverrides && typeof initialStateOverrides === "object"
    ? { ...initialState, ...initialStateOverrides }
    : initialState;
  const projectionState = readProjectionStateFromWorld(world, mergedInitialState);
  const surfaces = readSurfaceMapFromWorld(world);
  const shellState = resolveSurfaceShellFromMap({
    surfaces,
    rootSurfaceId,
    requestPathname,
    route,
    initialState: mergedInitialState,
    projectionState,
    stylesheetQuery
  });
  if (!shellState?.html) return null;
  const requiredCapabilities = activeSurfaceCapabilityRefs(shellState.surfaces, shellState.activeSurface?.id);
  const activeRendererProviders = surfaceCapabilityRenderers.filter(provider => requiredCapabilities.has(provider?.capability));
  const surfaceRenderers = buildSurfaceRenderers(activeRendererProviders, {
    world,
    rootSurface: shellState.rootSurface,
    activeSurface: shellState.activeSurface,
    surfaces: shellState.surfaces,
    browserRuntimeCapabilities,
    initialState: mergedInitialState,
    requestPathname,
    route,
    devMode
  });
  const runtimeSupportAssets = buildSurfaceRuntimeSupportAssets(surfaceRuntimeSupportAssets, {
    world,
    rootSurface: shellState.rootSurface,
    activeSurface: shellState.activeSurface,
    surfaces: shellState.surfaces,
    browserRuntimeCapabilities,
    initialState,
    requestPathname,
    route,
    devMode
  });
  const shell = surfaceRenderers.length
    ? resolveSurfaceShellFromMap({
        surfaces,
        rootSurfaceId,
        requestPathname,
        route,
      surfaceRenderers,
      initialState: mergedInitialState,
      projectionState,
      stylesheetQuery
      })
    : shellState;
  if (!shell?.html) return null;
  const capabilityAssets = capabilityAssetsForRenderers([
    ...surfaceRenderers,
    ...runtimeSupportAssets
  ]);
  const rootCapabilityRefs = collectRootSurfaceCapabilityRefs(surfaces, rootSurfaceId);
  const routeTargets = Array.from(shell.surfaces.values())
    .flatMap(surface => {
      const routeKey = String(surface?.props?.routeKey || "").trim();
      const routePath = String(surface?.props?.routePath || "").trim();
      return routeKey && routePath ? [{ key: routeKey, path: routePath, surfaceId: surface.id }] : [];
    });
  const preloadPolicies = filterRuntimePreloadsForRoot(runtimePreloads, {
    routeTargets,
    rootCapabilities: rootCapabilityRefs
  });
  const capabilityPreloadAssets = buildCapabilityPreloadAssetsMap(capabilityPreloadProviders, {
    world,
    rootSurface: shell.rootSurface,
    activeSurface: shell.activeSurface,
    surfaces: shell.surfaces,
    browserRuntimeCapabilities,
    initialState: mergedInitialState,
    requestPathname,
    route,
    devMode
  });
  const manifest = buildSurfaceRuntimeManifest({
    world,
    root: shell.rootSurface,
    activeSurface: shell.activeSurface,
    surfaces: shell.surfaces,
    browserRuntimeCapabilities: uniqueStrings([
      ...(browserRuntimeCapabilities ?? []),
      ...surfaceRenderers.map(renderer => renderer.capability)
    ]),
    capabilityAssets,
    rootSurfaceId,
    route,
    requestPathname: shell.requestPathname,
    routeStateDescriptor,
    queryBindings,
    preloadPolicies,
    capabilityPreloadAssets,
    surfaceRenderers,
    initialState: mergedInitialState,
    projectionState,
    initialStateOverrides
  });
  const rendererManifest = manifestPayloadForRenderers(surfaceRenderers);
  Object.assign(manifest, rendererManifest);
  if (manifest?.diagnostics) {
    manifest.diagnostics.serializedBytes = Buffer.byteLength(JSON.stringify(manifest), "utf8");
  }
  return injectInteractionRuntime(injectWitnessCoreUrl(injectCapabilityAssets(shell.html, [
    ...surfaceRenderers,
    ...runtimeSupportAssets
  ]), witnessCoreUrl), manifest);
}
