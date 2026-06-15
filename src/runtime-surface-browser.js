import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientSource = fs.readFileSync(path.join(here, "runtime-surface-browser-client.js"), "utf8");

function jsonScriptValue(value) {
  return JSON.stringify(value ?? null).replace(/</g, "\\u003c");
}

export function surfaceBrowserClientConfig(surface) {
  const parseList = value => {
    if (Array.isArray(value)) return value.map(item => String(item ?? "").trim()).filter(Boolean);
    if (typeof value !== "string") return [];
    return value.split(",").map(item => item.trim()).filter(Boolean);
  };
  const firstString = (...values) => {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  };
  const root = surface?.root ?? null;
  const activeSurface = surface?.activeSurface ?? surface ?? null;
  const rootProps = root?.props && typeof root.props === "object" ? root.props : {};
  const activeProps = activeSurface?.props && typeof activeSurface.props === "object" ? activeSurface.props : {};
  const rendererHref = firstString(activeProps.clientRendererHref, rootProps.clientRendererHref);
  const rendererExport = firstString(activeProps.clientRendererExport, rootProps.clientRendererExport, "default");
  const configHref = firstString(
    activeProps.clientConfigHref,
    activeProps.clientRuntimeConfigHref,
    rootProps.clientConfigHref,
    rootProps.clientRuntimeConfigHref
  );
  if (!rendererHref) return null;
  return {
    rendererHref,
    rendererExport,
    configHref: configHref || null,
    surface: {
      id: activeSurface?.id ?? null,
      kind: activeSurface?.surfaceKind ?? null,
      routeKey: firstString(activeProps.routeKey),
      routePath: firstString(activeProps.routePath)
    },
    runtime: {
      availableCapabilities: [...new Set(surface?.runtime?.availableCapabilities ?? [])],
      declaredCapabilities: [...new Set([
        ...parseList(rootProps.dependsOnCapabilities),
        ...parseList(activeProps.dependsOnCapabilities)
      ])],
      declaredPlugins: [...new Set([
        ...parseList(rootProps.dependsOnPlugins),
        ...parseList(activeProps.dependsOnPlugins)
      ])]
    }
  };
}

export function renderSurfaceBrowserRuntime(clientConfig = null) {
  return `const desireSurfaceClientConfig = ${jsonScriptValue(clientConfig)};\n${clientSource}`;
}
