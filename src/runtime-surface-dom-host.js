function trimString(value) {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next || null;
}

export function formatInlineText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replace(/\n/g, "<br>");
}

export function surfaceViewNodeIds(surface) {
  const ids = new Set();
  const add = value => {
    const id = trimString(value);
    if (id) ids.add(id);
  };
  add(surface?.view?.rootId);
  for (const targets of Object.values(surface?.view?.propTargets ?? {})) {
    for (const target of targets ?? []) add(target?.id);
  }
  for (const targets of Object.values(surface?.view?.interactionTargets ?? {})) {
    for (const target of targets ?? []) add(target?.id);
  }
  return [...ids];
}

export function fallbackActiveRootNode(document) {
  const body = document?.body;
  if (!body) return null;
  const elementCtor = typeof Element === "function" ? Element : null;
  for (const child of body.children ?? []) {
    if (elementCtor && !(child instanceof elementCtor)) continue;
    if (trimString(child.id) === "surface-route-underlay") continue;
    if (child.tagName?.toLowerCase?.() === "script") continue;
    return child;
  }
  return null;
}

export function surfaceIsPresentInDom(document, surface) {
  return surfaceViewNodeIds(surface).some(id => Boolean(document?.getElementById?.(id)));
}

export function parseFirstElement(document, html) {
  if (!document || typeof html !== "string" || !html.trim()) return null;
  const template = document.createElement("template");
  if (!template?.content) return null;
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function nextPresentSiblingRoot(document, surfaceById, parentSurface, surfaceId) {
  const children = Array.isArray(parentSurface?.children) ? parentSurface.children : [];
  const currentIndex = children.findIndex(childId => trimString(childId) === surfaceId);
  if (currentIndex < 0) return null;
  for (let index = currentIndex + 1; index < children.length; index += 1) {
    const sibling = surfaceById.get(trimString(children[index]));
    const siblingRootId = trimString(sibling?.view?.rootId);
    const siblingNode = siblingRootId ? document?.getElementById?.(siblingRootId) : null;
    if (siblingNode) return siblingNode;
  }
  return null;
}

export function materializeMissingVisibleSurface(document, surfaceById, surface) {
  const fragmentHtml = trimString(surface?.fragmentHtml);
  if (!fragmentHtml) return null;
  let parentSurface = null;
  let parentId = trimString(surface?.parentId);
  while (parentId) {
    const candidate = surfaceById.get(parentId) || null;
    if (candidate && surfaceIsPresentInDom(document, candidate)) {
      parentSurface = candidate;
      break;
    }
    parentId = trimString(candidate?.parentId);
  }
  const parentRootId = trimString(parentSurface?.view?.rootId);
  const parentRoot = parentRootId ? document?.getElementById?.(parentRootId) : null;
  if (!parentRoot) return null;
  const template = document?.createElement?.("template");
  if (!template?.content) return null;
  template.innerHTML = fragmentHtml.trim();
  const nextRoot = template.content.firstElementChild;
  if (!nextRoot) return null;
  const fragment = template.content;
  const beforeNode = nextPresentSiblingRoot(document, surfaceById, parentSurface, surface.id);
  if (beforeNode && beforeNode.parentNode === parentRoot) parentRoot.insertBefore(fragment, beforeNode);
  else parentRoot.appendChild(fragment);
  return nextRoot;
}

export function dematerializeHiddenSurface(document, surface) {
  const rootId = trimString(surface?.view?.rootId);
  const node = rootId ? document?.getElementById?.(rootId) : null;
  if (!node?.parentNode || typeof node.parentNode.removeChild !== "function") return false;
  node.parentNode.removeChild(node);
  return true;
}

export function patchSurfaceDom(document, surface, nextProps) {
  const propTargets = surface?.view?.propTargets ?? {};
  for (const [prop, targets] of Object.entries(propTargets)) {
    if (!Object.prototype.hasOwnProperty.call(nextProps, prop)) continue;
    const value = nextProps[prop];
    for (const target of targets ?? []) {
      const node = trimString(target?.id) ? document.getElementById(target.id) : null;
      if (!node) continue;
      switch (target.mode) {
        case "attribute": {
          const attr = trimString(target.attr);
          if (!attr) break;
          if (value == null || (value === false && !target.falseAsValue)) node.removeAttribute(attr);
          else node.setAttribute(attr, String(value));
          break;
        }
        case "capabilityProp": {
          if (typeof node.__surfaceCapabilityController?.updateProps === "function") {
            node.__surfaceCapabilityController.updateProps({ [target.prop || prop]: value });
          }
          break;
        }
        case "checked":
          node.checked = Boolean(value);
          if (value) node.setAttribute("checked", "");
          else node.removeAttribute("checked");
          break;
        case "className": {
          const baseClass = trimString(target.baseClass);
          const dynamicClass = typeof value === "string" ? value.trim() : "";
          node.className = [baseClass, dynamicClass].filter(Boolean).join(" ");
          break;
        }
        case "disabled":
          node.disabled = Boolean(value);
          if (value) node.setAttribute("disabled", "");
          else node.removeAttribute("disabled");
          break;
        case "navHref": {
          const href = trimString(value);
          if (href) node.setAttribute("href", href);
          else node.removeAttribute("href");
          break;
        }
        case "value":
          node.value = value == null ? "" : String(value);
          if (value == null) node.removeAttribute("value");
          else node.setAttribute("value", String(value));
          break;
        case "visibility":
          if (value) node.removeAttribute("hidden");
          else node.setAttribute("hidden", "");
          break;
        case "formattedText":
          node.innerHTML = formatInlineText(value);
          break;
        case "text":
        default:
          node.textContent = value == null ? "" : String(value);
          break;
      }
    }
  }
}

export function clearRouteUnderlay(document) {
  const layer = document?.getElementById?.("surface-route-underlay");
  if (layer?.parentNode) layer.parentNode.removeChild(layer);
}

export function updateSurfaceRouteUnderlay(document, activeSurface, spec = {}) {
  const routeKey = trimString(spec?.routeKey);
  const html = trimString(spec?.html);
  if (!routeKey || !html) {
    clearRouteUnderlay(document);
    return false;
  }
  const currentRootId = trimString(activeSurface?.view?.rootId);
  const currentRoot = currentRootId ? document?.getElementById?.(currentRootId) : null;
  if (!currentRoot?.parentNode) {
    clearRouteUnderlay(document);
    return false;
  }
  let layer = document.getElementById("surface-route-underlay");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "surface-route-underlay";
    layer.style.position = "fixed";
    layer.style.inset = "0";
    layer.style.zIndex = "0";
    layer.style.pointerEvents = "none";
    layer.style.overflow = "hidden";
    currentRoot.parentNode.insertBefore(layer, currentRoot);
  }
  if (layer.__surfaceRouteKey !== routeKey || layer.innerHTML !== html) {
    layer.innerHTML = html;
    layer.__surfaceRouteKey = routeKey;
  }
  if (!currentRoot.style.position) currentRoot.style.position = "relative";
  currentRoot.style.zIndex = "1";
  return true;
}

export function readSurfaceDomHostTree({ document, surfaceById, activeSurfaceId }) {
  const states = [];
  for (const [surfaceId, surface] of surfaceById.entries()) {
    states.push({
      surfaceId,
      rootId: trimString(surface?.view?.rootId),
      present: surfaceIsPresentInDom(document, surface),
      active: surfaceId === activeSurfaceId
    });
  }
  return { surfaceStates: states };
}

export async function applySurfaceDomHostPlan({
  document,
  window,
  surfaceById,
  activeSurfaceId,
  plan,
  correlationId = null,
  bootSurfaceCapabilities = null,
  resolveRouteUnderlaySpec = null,
  readExistingCapabilityOutputs = null
} = {}) {
  const result = {
    structureChanged: false,
    activeSurfaceUnderlayUpdated: false
  };
  const escapeRepeatHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const repeatScopeValue = (scope, expression) => {
    const parts = String(expression || "").split(".").filter(Boolean);
    let current = scope;
    for (const part of parts) {
      if (current == null || typeof current !== "object" || !(part in current)) return "";
      current = current[part];
    }
    return current == null ? "" : current;
  };
  const interpolateRepeatTemplate = (templateHtml, scope) => String(templateHtml || "").replace(/\$\{([A-Za-z0-9_.-]+)\}/g, (_match, expression) =>
    escapeRepeatHtml(repeatScopeValue(scope, expression))
  );
  for (const op of plan?.ops ?? []) {
    const surface = surfaceById.get(trimString(op?.surfaceId));
    if (!surface) continue;
    if (op.kind === "dematerialize") {
      result.structureChanged = dematerializeHiddenSurface(document, surface) || result.structureChanged;
      continue;
    }
    if (op.kind === "materialize") {
      const insertedRoot = materializeMissingVisibleSurface(document, surfaceById, surface);
      if (!insertedRoot) continue;
      result.structureChanged = true;
      if (typeof bootSurfaceCapabilities === "function") {
        await Promise.resolve(bootSurfaceCapabilities(insertedRoot, {
          phase: "capability-mount",
          correlationId
        }));
      }
      if (typeof readExistingCapabilityOutputs === "function") readExistingCapabilityOutputs(insertedRoot);
      continue;
    }
    if (op.kind === "route-underlay") {
      if (typeof resolveRouteUnderlaySpec === "function" && surface.id === activeSurfaceId) {
        const spec = await Promise.resolve(resolveRouteUnderlaySpec(surface, op.routeKey));
        updateSurfaceRouteUnderlay(document, surface, spec);
        result.activeSurfaceUnderlayUpdated = true;
      }
      continue;
    }
    if (op.kind === "render-repeat") {
      const rootId = trimString(surface?.view?.rootId);
      const node = rootId ? document?.getElementById?.(rootId) : null;
      const repeat = op?.repeat ?? {};
      if (!node || typeof node.innerHTML === "undefined") continue;
      const hostTag = String(node.tagName || "").toLowerCase();
      const templateTag = trimString(repeat?.templateTag)?.toLowerCase() ?? null;
      if (hostTag === "select" && templateTag && templateTag !== "option") continue;
      const items = Array.isArray(repeat?.items) ? repeat.items : [];
      const itemAs = trimString(repeat?.itemAs) || "item";
      const indexAs = trimString(repeat?.indexAs) || "index";
      node.innerHTML = items.map((item, index) => interpolateRepeatTemplate(repeat.templateHtml, {
        [itemAs]: item,
        [indexAs]: index,
        item,
        index
      })).join("");
      continue;
    }
    if (op.kind === "patch-props") {
      patchSurfaceDom(document, surface, op.props ?? {});
    }
  }
  return result;
}
