import {
  readInitialStateFromWorld,
  readSurfaceMapFromWorld,
  renderSurfaceStaticFragment,
  resolveSurfaceShellFromMap
} from "./runtime-surface-shell.js";
import {
  buildSurfaceRuntimeManifest,
  renderSurfaceInteractionRuntimeModule
} from "./runtime-surface-interaction-runtime.js";

function escapeScriptBody(source) {
  return String(source ?? "").replaceAll("</script", "<\\/script");
}

function injectInteractionRuntime(html, manifest) {
  if (!manifest) return html;
  const manifestScript = `<script type="application/json" id="surface-runtime-manifest">${escapeScriptBody(JSON.stringify(manifest))}</script>`;
  const script = `<script type="module">\n${escapeScriptBody(renderSurfaceInteractionRuntimeModule())}\n</script>`;
  return String(html).includes("</body>")
    ? String(html).replace("</body>", `    ${manifestScript}\n    ${script}\n  </body>`)
    : `${html}\n${manifestScript}\n${script}`;
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

function capabilityAssetsForRenderers(renderers = []) {
  const stylesheetHrefs = uniqueStrings(renderers.flatMap(renderer => renderer.stylesheetHrefs ?? []));
  const scriptSrcs = uniqueStrings(renderers.flatMap(renderer => renderer.scriptSrcs ?? []));
  const inlineCss = uniqueStrings(renderers.map(renderer => renderer.inlineCss ?? ""));
  const scriptBodies = uniqueStrings(renderers.map(renderer => String(renderer.scriptBody ?? "").trim()).filter(Boolean));
  if (!stylesheetHrefs.length && !scriptSrcs.length && !inlineCss.length && !scriptBodies.length) return null;
  return {
    stylesheetHrefs,
    scriptSrcs,
    inlineCss,
    scriptBodies
  };
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
    inlineCss.length ? `<style>\n${inlineCss.join("\n")}\n</style>` : ""
  ].filter(Boolean).join("\n");
  const bodyAssets = scriptBodies.length
    ? `<script type="module">\n${scriptBodies.join("\n\n")}\n</script>`
    : "";
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
  routeStateDescriptor = null,
  surfaceCapabilityRenderers = []
} = {}) {
  const initialState = readInitialStateFromWorld(world);
  const surfaces = readSurfaceMapFromWorld(world);
  const shellState = resolveSurfaceShellFromMap({
    surfaces,
    rootSurfaceId,
    requestPathname,
    route,
    initialState
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
    initialState
  });
  const shell = surfaceRenderers.length
    ? resolveSurfaceShellFromMap({
        surfaces,
        rootSurfaceId,
        requestPathname,
        route,
        surfaceRenderers,
        initialState
      })
    : shellState;
  if (!shell?.html) return null;
  const capabilityAssets = capabilityAssetsForRenderers(surfaceRenderers);
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
    requestPathname: shell.requestPathname,
    routeStateDescriptor
  });
  return injectInteractionRuntime(injectCapabilityAssets(shell.html, surfaceRenderers), manifest);
}
