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

export function renderSurfacePage(world, {
  rootSurfaceId,
  requestPathname = "/",
  route = null,
  browserRuntimeCapabilities = [],
  routeStateDescriptor = null
} = {}) {
  const shell = resolveSurfaceShellPage(world, {
    rootSurfaceId,
    requestPathname,
    route
  });
  if (!shell?.html) return null;
  const manifest = buildSurfaceRuntimeManifest({
    world,
    root: shell.rootSurface,
    activeSurface: shell.activeSurface,
    surfaces: shell.surfaces,
    browserRuntimeCapabilities,
    rootSurfaceId,
    requestPathname: shell.requestPathname,
    routeStateDescriptor
  });
  if (manifest) {
    manifest.routeSurfaceFragments = Object.fromEntries((manifest.routeTargets ?? [])
      .map(target => [target.key, renderSurfaceStaticFragment(shell.surfaces, target.surfaceId)]));
  }
  return injectInteractionRuntime(shell.html, manifest);
}
