import { renderSurfaceStaticFragment, resolveSurfaceShellPage } from "./runtime-surface-shell.js";
import {
  buildSurfaceRuntimeManifest,
  renderSurfaceInteractionRuntimeModule
} from "./runtime-surface-interaction-runtime.js";

function escapeScriptBody(source) {
  return String(source ?? "").replaceAll("</script", "<\\/script");
}

function injectInteractionRuntime(html, manifest) {
  if (!manifest) return html;
  const script = `<script type="module">\n${escapeScriptBody(renderSurfaceInteractionRuntimeModule(manifest))}\n</script>`;
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

function injectCapabilityAssets(html, renderers = []) {
  if (!renderers.length) return html;
  const stylesheetHrefs = uniqueStrings(renderers.flatMap(renderer => renderer.stylesheetHrefs ?? []));
  const scriptSrcs = uniqueStrings(renderers.flatMap(renderer => renderer.scriptSrcs ?? []));
  const inlineCss = uniqueStrings(renderers.map(renderer => renderer.inlineCss ?? ""));
  const scriptBodies = renderers.map(renderer => String(renderer.scriptBody ?? "").trim()).filter(Boolean);
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
  const shellState = resolveSurfaceShellPage(world, {
    rootSurfaceId,
    requestPathname,
    route
  });
  if (!shellState?.html) return null;
  const surfaceRenderers = buildSurfaceRenderers(surfaceCapabilityRenderers, {
    world,
    rootSurface: shellState.rootSurface,
    activeSurface: shellState.activeSurface,
    surfaces: shellState.surfaces,
    browserRuntimeCapabilities
  });
  const shell = resolveSurfaceShellPage(world, {
    rootSurfaceId,
    requestPathname,
    route,
    surfaceRenderers
  });
  if (!shell?.html) return null;
  const manifest = buildSurfaceRuntimeManifest({
    world,
    root: shell.rootSurface,
    activeSurface: shell.activeSurface,
    surfaces: shell.surfaces,
    browserRuntimeCapabilities: uniqueStrings([
      ...(browserRuntimeCapabilities ?? []),
      ...surfaceRenderers.map(renderer => renderer.capability)
    ]),
    rootSurfaceId,
    requestPathname: shell.requestPathname,
    routeStateDescriptor
  });
  if (manifest) {
    manifest.routeSurfaceFragments = Object.fromEntries((manifest.routeTargets ?? [])
      .map(target => [target.key, renderSurfaceStaticFragment(shell.surfaces, target.surfaceId, { surfaceRenderers })]));
  }
  return injectInteractionRuntime(injectCapabilityAssets(shell.html, surfaceRenderers), manifest);
}
