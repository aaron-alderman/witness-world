export function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function stableSurfaceDomToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function fallbackSurfaceDomId(surface, prefix = "surface") {
  const props = surface?.props && typeof surface.props === "object" ? surface.props : {};
  const surfaceId = trimString(surface?.id);
  const routeKey = trimString(props.routeKey);
  const token = stableSurfaceDomToken(surfaceId || routeKey || surface?.surfaceKind || "node");
  return token ? `${prefix}-${token}` : prefix;
}

export function surfaceNeedsRuntimeDomId(surface) {
  return (Array.isArray(surface?.interactions) && surface.interactions.length > 0)
    || (Array.isArray(surface?.bindings) && surface.bindings.length > 0);
}

export function surfaceDomId(surface, {
  requireRuntimeAttachment = false
} = {}) {
  const props = surface?.props && typeof surface.props === "object" ? surface.props : {};
  const authoredPresentationAnchor = trimString(props.presentationAnchor);
  if (authoredPresentationAnchor) return authoredPresentationAnchor;
  const authoredDomId = trimString(props.domId);
  if (authoredDomId) return authoredDomId;
  if (requireRuntimeAttachment && !surfaceNeedsRuntimeDomId(surface)) return null;
  return fallbackSurfaceDomId(surface);
}
