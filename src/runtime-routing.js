import { projectors } from "./kernel.js";
import { DEFAULT_RUNTIME_PROFILE, matchRuntimeBundleRoute } from "./runtime-bundles.js";

export function compileRouteMatcher(routePath) {
  const parts = String(routePath || "/").split("/").filter(Boolean);
  return pathname => {
    const targetParts = String(pathname || "/").split("/").filter(Boolean);
    if (parts.length !== targetParts.length) return null;
    const params = Object.create(null);
    for (let i = 0; i < parts.length; i += 1) {
      const expected = parts[i];
      const actual = targetParts[i];
      if (expected.startsWith(":")) {
        params[expected.slice(1)] = decodeURIComponent(actual);
        continue;
      }
      if (expected !== actual) return null;
    }
    return params;
  };
}

export function matchDeclaredRoute(routeTable, method, pathname) {
  const targetMethod = String(method || "GET").toUpperCase();
  for (const route of routeTable) {
    if (route.method !== targetMethod) continue;
    const params = route.matcher(pathname);
    if (params) return { route, params };
  }
  return null;
}

export function hasReachableHomeRoute(world, routeTable) {
  const home = routeTable.find(route => route.method === "GET" && route.path === "/" && route.handler === "page.home");
  if (!home) return false;
  const rootWidget = home.params?.rootWidget;
  if (!rootWidget) return false;
  return world.project(projectors.things).has(rootWidget);
}

export function runtimeAllowsBootstrapFallback(runtimeBundleSummary) {
  return (runtimeBundleSummary?.routes ?? []).some(route => route.handler === "bootstrap.page");
}

export function shouldServeBootstrapFallback({
  world,
  routeTable,
  runtimeBundleSummary,
  method,
  pathname
}) {
  if (String(method || "GET").toUpperCase() !== "GET") return false;
  if (pathname !== "/") return false;
  if (!runtimeAllowsBootstrapFallback(runtimeBundleSummary)) return false;
  return !hasReachableHomeRoute(world, routeTable);
}

export function matchGenericEndpoint(method, pathname, runtimeProfile = DEFAULT_RUNTIME_PROFILE) {
  const targetMethod = String(method || "GET").toUpperCase();
  return matchRuntimeBundleRoute(runtimeProfile, targetMethod, pathname);
}
