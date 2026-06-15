import { renderProcessRuntimeModuleSource } from "./desire/process-eval.js";
import { surfaceDomId } from "./runtime-surface-dom-identity.js";

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolvedSurfaceDomId(surface) {
  const props = surface?.props && typeof surface.props === "object" ? surface.props : {};
  return trimString(props.mountId) ?? surfaceDomId(surface, { requireRuntimeAttachment: true });
}

function normalizeRuntimeArray(value) {
  return Array.isArray(value) ? structuredClone(value) : [];
}

function normalizeRuntimeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? structuredClone(value) : {};
}

function runtimeSpecForSurface(surface) {
  return {
    processRef: trimString(surface?.processRef),
    projectionRefs: normalizeRuntimeArray(surface?.projectionRefs),
    capabilityRefs: normalizeRuntimeArray(surface?.capabilityRefs),
    bindings: normalizeRuntimeArray(surface?.bindings),
    interactions: normalizeRuntimeArray(surface?.interactions)
  };
}

function childSurfaceIds(surface) {
  return Array.isArray(surface?.children)
    ? surface.children.map(child => trimString(child)).filter(Boolean)
    : [];
}

function collectRouteTargets(surfaces, rootSurfaceId) {
  const out = [];
  const queue = [rootSurfaceId];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const surface = surfaces.get(id);
    if (!surface) continue;
    const routeKey = trimString(surface?.props?.routeKey);
    const routePath = trimString(surface?.props?.routePath);
    if (routeKey && routePath) {
      out.push({ key: routeKey, path: routePath, surfaceId: surface.id });
    }
    for (const childId of childSurfaceIds(surface)) queue.push(childId);
  }
  return out;
}

function normalizeViewTargets(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? structuredClone(value)
    : {};
}

function normalizeRouteStateDescriptor(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? structuredClone(value)
    : null;
}

function classTokensForSurface(surface) {
  const tokens = [];
  const push = value => {
    if (typeof value !== "string") return;
    for (const token of value.split(/\s+/)) {
      const trimmed = token.trim();
      if (trimmed) tokens.push(trimmed);
    }
  };
  push(surface?.className);
  push(surface?.props?.class);
  push(surface?.props?.className);
  return [...new Set(tokens)];
}

function genericSurfaceRuntimeView(surface) {
  const domId = resolvedSurfaceDomId(surface);
  const props = surface?.props && typeof surface.props === "object" ? surface.props : {};
  const inputId = trimString(props.inputId);
  const isDirectInput = (trimString(props.tag) ?? "").toLowerCase() === "input";
  const propTargets = {};
  if (domId) {
    propTargets.className = [{ id: domId, mode: "className", baseClass: classTokensForSurface(surface).join(" ") }];
    propTargets.text = [{ id: domId, mode: "text" }];
    propTargets.style = [{ id: domId, mode: "attribute", attr: "style" }];
    propTargets.visible = [{ id: domId, mode: "visibility" }];
    propTargets.disabled = [{ id: domId, mode: "disabled" }];
    if (isDirectInput) {
      propTargets.inputType = [{ id: domId, mode: "attribute", attr: "type" }];
      propTargets.value = [{ id: domId, mode: "value" }];
      propTargets.checked = [{ id: domId, mode: "checked" }];
    }
  }
  if (inputId) {
    propTargets.inputType = [{ id: inputId, mode: "attribute", attr: "type" }];
    propTargets.inputValue = [{ id: inputId, mode: "value" }];
    propTargets.checked = [{ id: inputId, mode: "checked" }];
    propTargets.disabled = [...(propTargets.disabled ?? []), { id: inputId, mode: "disabled" }];
  }
  if (domId) {
    for (const binding of surface?.bindings ?? []) {
      const prop = trimString(binding?.prop);
      if (!prop || propTargets[prop]) continue;
      propTargets[prop] = [{ id: domId, mode: "capabilityProp", prop }];
    }
  }
  return {
    rootId: domId,
    propTargets,
    interactionTargets: domId ? {
      self: [{ id: domId }]
    } : {}
  };
}

export function describeSurfaceRuntimeView(surface, {
  describeSurfaceRuntimeViewImpl = null
} = {}) {
  const described = typeof describeSurfaceRuntimeViewImpl === "function"
    ? describeSurfaceRuntimeViewImpl(surface)
    : null;
  if (described && typeof described === "object" && !Array.isArray(described)) {
    return {
      rootId: trimString(described.rootId) || resolvedSurfaceDomId(surface),
      propTargets: normalizeViewTargets(described.propTargets),
      interactionTargets: normalizeViewTargets(described.interactionTargets)
    };
  }
  return genericSurfaceRuntimeView(surface);
}

export function buildSurfaceRuntimeManifest({
  world,
  root,
  activeSurface,
  surfaces,
  browserRuntimeCapabilities = [],
  rootSurfaceId = null,
  requestPathname = "/",
  describeSurfaceRuntimeViewImpl = null,
  routeStateDescriptor = null
}) {
  const surfaceEntries = [];
  const queue = [{ id: rootSurfaceId ?? root?.id ?? activeSurface.id, parentId: null }];
  const seen = new Set();
  while (queue.length) {
    const next = queue.shift();
    if (!next?.id || seen.has(next.id)) continue;
    seen.add(next.id);
    const surface = surfaces.get(next.id);
    if (!surface) continue;
    const runtime = runtimeSpecForSurface(surface);
    const view = describeSurfaceRuntimeView(surface, { describeSurfaceRuntimeViewImpl });
    surfaceEntries.push({
      id: surface.id,
      parentId: next.parentId,
      surfaceKind: surface.surfaceKind ?? null,
      props: normalizeRuntimeObject(surface.props),
      runtime,
      view
    });
    for (const childId of Array.isArray(surface.children) ? surface.children : []) {
      queue.push({ id: childId, parentId: surface.id });
    }
  }
  const interactive = surfaceEntries.some(entry => entry.runtime.processRef || entry.runtime.bindings.length || entry.runtime.interactions.length);
  if (!interactive) return null;
  const processWitnesses = world.allWitnesses().filter(witness => [
    "desire.defineProcess",
    "desire.defineMessage",
    "desire.defineType",
    "desire.defineBoundary",
    "desire.defineProjection",
    "desire.definePolicy"
  ].includes(witness.process));
  return {
    rootSurfaceId,
    activeSurfaceId: activeSurface.id,
    requestPathname,
    routeTargets: collectRouteTargets(surfaces, rootSurfaceId ?? root?.id ?? activeSurface.id),
    browserRuntimeCapabilities: [...new Set((browserRuntimeCapabilities ?? []).map(value => String(value || "")).filter(Boolean))],
    surfaces: surfaceEntries,
    processWitnesses,
    routeState: normalizeRouteStateDescriptor(routeStateDescriptor)
  };
}

export function resolveSurfaceRuntimeBinding(manifest, surfaceId) {
  const surfaces = new Map((manifest?.surfaces ?? []).map(surface => [surface.id, surface]));
  let current = surfaces.get(surfaceId) || null;
  let processRef = null;
  const projectionRefs = new Set();
  const capabilityRefs = new Set();
  while (current) {
    if (!processRef && trimString(current?.runtime?.processRef)) processRef = trimString(current.runtime.processRef);
    for (const projection of current?.runtime?.projectionRefs ?? []) {
      const value = trimString(projection);
      if (value) projectionRefs.add(value);
    }
    for (const capability of current?.runtime?.capabilityRefs ?? []) {
      const value = trimString(capability);
      if (value) capabilityRefs.add(value);
    }
    current = trimString(current?.parentId) ? surfaces.get(current.parentId) || null : null;
  }
  return {
    processRef,
    projectionRefs: [...projectionRefs],
    capabilityRefs: [...capabilityRefs]
  };
}

export function resolveSurfaceCapabilities(binding, runtimeCapabilities) {
  const installed = new Set((runtimeCapabilities ?? []).map(value => String(value || "").trim()).filter(Boolean));
  const required = [...new Set((binding?.capabilityRefs ?? []).map(value => String(value || "").trim()).filter(Boolean))];
  return {
    required,
    available: required.filter(value => installed.has(value)),
    missing: required.filter(value => !installed.has(value))
  };
}

export function resolveRouteStateDescriptor(manifest) {
  return normalizeRouteStateDescriptor(manifest?.routeState);
}

function collectSurfaceDescendants(surfaceById, surfaceId, out) {
  const surface = surfaceById.get(surfaceId);
  if (!surface) return;
  out.add(surfaceId);
  for (const childId of Array.isArray(surface.children) ? surface.children : []) {
    const value = trimString(childId);
    if (value && !out.has(value)) collectSurfaceDescendants(surfaceById, value, out);
  }
  for (const candidate of surfaceById.values()) {
    if (trimString(candidate?.parentId) === surfaceId && !out.has(candidate.id)) {
      collectSurfaceDescendants(surfaceById, candidate.id, out);
    }
  }
}

function activeRuntimeSurfaceIds(surfaceById, activeSurfaceId) {
  const active = new Set();
  if (!activeSurfaceId) {
    for (const surfaceId of surfaceById.keys()) active.add(surfaceId);
    return active;
  }
  collectSurfaceDescendants(surfaceById, activeSurfaceId, active);
  let current = surfaceById.get(activeSurfaceId) || null;
  while (current) {
    active.add(current.id);
    const parentId = trimString(current.parentId);
    current = parentId ? surfaceById.get(parentId) || null : null;
  }
  return active;
}

function readCapabilityOutput(source, capabilityOutputs = {}) {
  const surfaceId = trimString(source?.surface);
  const output = trimString(source?.output);
  if (!surfaceId || !output) return undefined;
  return capabilityOutputs[surfaceId]?.[output];
}

function readBindingSource(source, processRuntime, capabilityOutputs = {}) {
  if (!source || typeof source !== "object") return undefined;
  let value;
  if (source.kind === "literal") value = source.value;
  else if (source.kind === "state") value = processRuntime.value(source.state);
  else if (source.kind === "projection") value = processRuntime.derive(source.projection);
  else if (source.kind === "capability") value = readCapabilityOutput(source, capabilityOutputs);
  else return undefined;
  if (source.map && typeof source.map === "object" && !Array.isArray(source.map)) {
    const key = String(value);
    if (Object.prototype.hasOwnProperty.call(source.map, key)) return source.map[key];
    if (Object.prototype.hasOwnProperty.call(source.map, "default")) return source.map.default;
  }
  return value;
}

function overlaySurfaceProps(surface, processRuntime, capabilityOutputs = {}) {
  const nextProps = { ...(surface?.props || {}) };
  for (const binding of surface?.runtime?.bindings ?? []) {
    const prop = trimString(binding?.prop);
    if (!prop) continue;
    const nextValue = readBindingSource(binding.source, processRuntime, capabilityOutputs);
    if (nextValue !== undefined) nextProps[prop] = nextValue;
  }
  return nextProps;
}

function formatInlineText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replace(/\n/g, "<br>");
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
          if (value == null || value === false) node.removeAttribute(attr);
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
        case "visibility": {
          if (value) node.removeAttribute("hidden");
          else node.setAttribute("hidden", "");
          break;
        }
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

function eventValueFromSpec(spec, event, processRuntime) {
  if (!spec || typeof spec !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(spec, "literal")) return spec.literal;
  if (spec.kind === "toggleState") return !Boolean(processRuntime.value(spec.state));
  if (spec.kind === "eventValue") return event?.target && "value" in event.target ? event.target.value : null;
  if (spec.kind === "eventChecked") return event?.target && "checked" in event.target ? Boolean(event.target.checked) : false;
  return null;
}

function createBlockedInteractionRuntime({
  limitationType = "platform",
  missingPrimitive,
  reason
} = {}) {
  return {
    blocked: {
      limitationType,
      missingPrimitive,
      reason
    },
    refresh() {},
    processRuntime: null,
    destroy() {}
  };
}

function activeRouteTargetForPath(manifest, pathname) {
  const normalized = String(pathname || "/").replace(/\/+$/, "") || "/";
  return (manifest?.routeTargets ?? []).find(target =>
    (String(target.path || "/").replace(/\/+$/, "") || "/") === normalized
  ) ?? null;
}

function routeStateBindingForProcess(manifest, processRef) {
  const descriptor = resolveRouteStateDescriptor(manifest);
  if (!descriptor) return null;
  const state = trimString(descriptor.state) || trimString(descriptor.stateRef);
  const descriptorProcess = trimString(descriptor.process) || trimString(descriptor.processRef);
  if (!state) return null;
  if (descriptorProcess && processRef && descriptorProcess !== processRef) return null;
  return { processRef: descriptorProcess || processRef, state };
}

function routeTargetForProcessState(manifest, processRuntime, processRef) {
  const targets = manifest?.routeTargets ?? [];
  if (!targets.length || !processRef) return null;
  const routeState = routeStateBindingForProcess(manifest, processRef);
  if (routeState) {
    const value = processRuntime.value(routeState.state);
    return targets.find(target => String(target.key) === String(value)) ?? null;
  }
  const snapshot = processRuntime.snapshot(processRef);
  for (const value of Object.values(snapshot ?? {})) {
    const matched = targets.find(target => String(target.key) === String(value));
    if (matched) return matched;
  }
  return null;
}

function syncUrlToRouteState({ manifest, processRuntime, processRef, window }) {
  const active = activeRouteTargetForPath(manifest, window?.location?.pathname);
  if (!active || !processRef) return false;
  const routeState = routeStateBindingForProcess(manifest, processRef);
  if (routeState) {
    if (String(processRuntime.value(routeState.state)) === String(active.key)) return false;
    processRuntime.set(routeState.state, active.key);
    return true;
  }
  const snapshot = processRuntime.snapshot(processRef);
  for (const [stateId, value] of Object.entries(snapshot ?? {})) {
    if (!(manifest?.routeTargets ?? []).some(target => String(target.key) === String(value))) continue;
    if (String(value) === String(active.key)) return false;
    processRuntime.set(stateId, active.key);
    return true;
  }
  return false;
}

function syncRouteStateToUrl({ manifest, processRuntime, processRef, window }) {
  const target = routeTargetForProcessState(manifest, processRuntime, processRef);
  if (!target?.path || !window?.history || !window?.location) return null;
  const currentPath = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
  const nextPath = String(target.path || "/").replace(/\/+$/, "") || "/";
  if (currentPath !== nextPath) window.history.pushState({ surfaceRouteKey: target.key }, "", target.path);
  return target;
}

function parseFirstElement(document, html) {
  if (!document || typeof html !== "string" || !html.trim()) return null;
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function bootSurfaceCapabilities(window, root) {
  const hooks = Array.isArray(window?.__surfaceCapabilityBootHooks)
    ? window.__surfaceCapabilityBootHooks
    : [];
  for (const hook of hooks) {
    if (typeof hook === "function") hook(root);
  }
}

function clearRouteUnderlay(document) {
  const layer = document?.getElementById?.("surface-route-underlay");
  if (layer?.parentNode) layer.parentNode.removeChild(layer);
}

function updateRouteUnderlay(document, manifest, activeSurface, nextProps) {
  const routeKey = trimString(nextProps?.routeUnderlay);
  if (!routeKey) {
    clearRouteUnderlay(document);
    return;
  }
  const target = (manifest?.routeTargets ?? []).find(candidate => String(candidate.key) === routeKey);
  const html = target ? manifest?.routeSurfaceFragments?.[target.key] ?? manifest?.routeSurfaceFragments?.[target.surfaceId] : null;
  const currentRootId = trimString(activeSurface?.view?.rootId);
  const currentRoot = currentRootId ? document?.getElementById?.(currentRootId) : null;
  if (!html || !currentRoot?.parentNode) {
    clearRouteUnderlay(document);
    return;
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
  if (layer.__surfaceRouteKey !== routeKey) {
    layer.innerHTML = html;
    layer.__surfaceRouteKey = routeKey;
  }
  if (!currentRoot.style.position) currentRoot.style.position = "relative";
  currentRoot.style.zIndex = "1";
}

export function createSurfaceInteractionRuntime({
  document,
  window,
  manifest,
  createProcessRuntimeImpl
}) {
  const processRuntimeFactory = typeof createProcessRuntimeImpl === "function"
    ? createProcessRuntimeImpl
    : (() => {
        throw new Error("createProcessRuntime implementation required");
      });
  const surfaceById = new Map((manifest.surfaces ?? []).map(surface => [surface.id, surface]));
  let activeSurfaceId = trimString(manifest.activeSurfaceId);
  const activeIds = activeRuntimeSurfaceIds(surfaceById, activeSurfaceId);
  const missingInteractionTargets = (manifest?.surfaces ?? []).some(surface =>
    activeIds.has(surface.id)
      && (surface?.runtime?.interactions?.length ?? 0) > 0
      && Object.keys(surface?.view?.interactionTargets ?? {}).length === 0
  );
  if (missingInteractionTargets) {
    window?.console?.error?.(
      "surface interaction runtime blocked: missing generic interaction target descriptors"
    );
    return createBlockedInteractionRuntime({
      missingPrimitive: "generic surface interaction target descriptors",
      reason: "interactive surface execution cannot proceed until the host emits generic interaction target descriptors instead of surface-kind-specific conventions"
    });
  }
  const processRuntime = processRuntimeFactory({ witnesses: manifest.processWitnesses || [] });
  const disposers = [];
  const runtimeDisposers = [];
  const capabilityOutputs = {};
  const readExistingCapabilityOutputs = root => {
    const queryRoot = root ?? document;
    const nodes = [];
    if (typeof queryRoot?.matches === "function" && queryRoot.matches("[data-surface-id]")) nodes.push(queryRoot);
    if (typeof queryRoot?.querySelectorAll === "function") nodes.push(...queryRoot.querySelectorAll("[data-surface-id]"));
    for (const node of nodes) {
      const surfaceId = trimString(node.getAttribute?.("data-surface-id"));
      if (!surfaceId || !node.__surfaceCapabilityOutputs) continue;
      capabilityOutputs[surfaceId] = node.__surfaceCapabilityOutputs;
    }
  };
  const refresh = () => {
    readExistingCapabilityOutputs(document);
    const activeIds = activeRuntimeSurfaceIds(surfaceById, activeSurfaceId);
    for (const surface of manifest.surfaces ?? []) {
      if (!activeIds.has(surface.id)) continue;
      if (!(surface?.runtime?.bindings?.length)) continue;
      const binding = resolveSurfaceRuntimeBinding(manifest, surface.id);
      if (!binding.processRef) continue;
      const capabilities = resolveSurfaceCapabilities(binding, manifest.browserRuntimeCapabilities);
      if (capabilities.missing.length) continue;
      const nextProps = overlaySurfaceProps(surface, processRuntime, capabilityOutputs);
      if (surface.id === activeSurfaceId) updateRouteUnderlay(document, manifest, surface, nextProps);
      patchSurfaceDom(document, surface, nextProps);
    }
  };
  const disposeInteractions = () => {
    for (const dispose of disposers.splice(0)) dispose();
  };
  const replaceActiveRouteSurface = target => {
    if (!target?.surfaceId || target.surfaceId === activeSurfaceId) return false;
    const currentSurface = surfaceById.get(activeSurfaceId);
    const currentRootId = trimString(currentSurface?.view?.rootId);
    const currentRoot = currentRootId ? document.getElementById(currentRootId) : null;
    const html = manifest?.routeSurfaceFragments?.[target.key] ?? manifest?.routeSurfaceFragments?.[target.surfaceId];
    const nextRoot = parseFirstElement(document, html);
    if (!currentRoot || !nextRoot) return false;
    disposeInteractions();
    currentRoot.replaceWith(nextRoot);
    activeSurfaceId = target.surfaceId;
    manifest.activeSurfaceId = target.surfaceId;
    bootSurfaceCapabilities(window, nextRoot);
    clearRouteUnderlay(document);
    return true;
  };
  const processRefs = [...new Set((manifest.surfaces ?? [])
    .map(surface => resolveSurfaceRuntimeBinding(manifest, surface.id).processRef)
    .filter(Boolean))];
  const syncRouteAndRefresh = () => {
    refresh();
    for (const processRef of processRefs) {
      const routeTarget = syncRouteStateToUrl({ manifest, processRuntime, processRef, window });
      if (replaceActiveRouteSurface(routeTarget)) {
        bindInteractions();
        refresh();
      }
    }
  };
  if (typeof processRuntime.subscribe === "function") {
    const unsubscribe = processRuntime.subscribe(() => syncRouteAndRefresh());
    runtimeDisposers.push(unsubscribe);
  }
  for (const processRef of processRefs) {
    syncUrlToRouteState({ manifest, processRuntime, processRef, window });
  }
  if (window && typeof window.addEventListener === "function") {
    const onPopState = () => {
      for (const processRef of processRefs) {
        syncUrlToRouteState({ manifest, processRuntime, processRef, window });
      }
      syncRouteAndRefresh();
    };
    window.addEventListener("popstate", onPopState);
    runtimeDisposers.push(() => window.removeEventListener?.("popstate", onPopState));
    const onCapabilityOutput = event => {
      const surfaceId = trimString(event?.detail?.surfaceId);
      if (!surfaceId) return;
      capabilityOutputs[surfaceId] = event.detail?.outputs ?? {};
      syncRouteAndRefresh();
    };
    window.addEventListener("surface-capability-output", onCapabilityOutput);
    runtimeDisposers.push(() => window.removeEventListener?.("surface-capability-output", onCapabilityOutput));
  }

  const bindInteractions = () => {
    const activeIds = activeRuntimeSurfaceIds(surfaceById, activeSurfaceId);
    for (const surface of manifest.surfaces ?? []) {
      if (!activeIds.has(surface.id)) continue;
      if (!(surface?.runtime?.interactions?.length)) continue;
      const binding = resolveSurfaceRuntimeBinding(manifest, surface.id);
      if (!binding.processRef) continue;
      const capabilities = resolveSurfaceCapabilities(binding, manifest.browserRuntimeCapabilities);
      if (capabilities.missing.length) {
        window?.console?.error?.("surface interaction runtime blocked: missing capabilities", capabilities.missing);
        continue;
      }
      for (const interaction of surface?.runtime?.interactions ?? []) {
        const targetKey = trimString(interaction?.target);
        const eventName = trimString(interaction?.event) || "click";
        const action = interaction?.action && typeof interaction.action === "object" ? interaction.action : null;
        const targets = targetKey ? (surface?.view?.interactionTargets?.[targetKey] ?? []) : [];
        for (const target of targets) {
          const node = trimString(target?.id) ? document.getElementById(target.id) : null;
          if (!node || !action) continue;
          const listener = async event => {
            if (action.kind === "navigate") {
              const href = trimString(action.href);
              if (href) {
                event.preventDefault();
                window.location.assign(href);
              }
              return;
            }
            if (action.kind === "deliver" && trimString(action.message)) {
              event.preventDefault();
              if (typeof processRuntime.deliverAuthored === "function") {
                await processRuntime.deliverAuthored(action.message);
              } else {
                processRuntime.deliver(action.message);
              }
              syncRouteAndRefresh();
              return;
            }
            if (action.kind === "setState" && trimString(action.state)) {
              event.preventDefault();
              processRuntime.set(action.state, eventValueFromSpec(action.value ?? {}, event, processRuntime));
              syncRouteAndRefresh();
            }
          };
          node.addEventListener(eventName, listener);
          disposers.push(() => node.removeEventListener(eventName, listener));
        }
      }
    }
  };
  bindInteractions();

  refresh();
  return {
    refresh,
    processRuntime,
    destroy() {
      disposeInteractions();
      for (const dispose of runtimeDisposers.splice(0)) dispose();
    }
  };
}

function browserHelpersSource() {
  return [
    `const SURFACE_INTERACTION_FORMATTERS = {
  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  },
  formattedText(value) {
    return this.escapeHtml(String(value ?? "")).replace(/\\n/g, "<br>");
  }
};`,
    trimString.toString(),
    normalizeRouteStateDescriptor.toString(),
    resolveRouteStateDescriptor.toString(),
    `function toSurfaceMap(manifest) {
  return new Map((manifest?.surfaces ?? []).map(surface => [surface.id, surface]));
}`,
    eventValueFromSpec.toString(),
    readCapabilityOutput.toString(),
    readBindingSource.toString(),
    overlaySurfaceProps.toString(),
    resolveSurfaceRuntimeBinding.toString(),
    resolveSurfaceCapabilities.toString(),
    collectSurfaceDescendants.toString(),
    activeRuntimeSurfaceIds.toString(),
    activeRouteTargetForPath.toString(),
    routeStateBindingForProcess.toString(),
    routeTargetForProcessState.toString(),
    syncUrlToRouteState.toString(),
    syncRouteStateToUrl.toString(),
    parseFirstElement.toString(),
    bootSurfaceCapabilities.toString(),
    clearRouteUnderlay.toString(),
    updateRouteUnderlay.toString(),
    `function formatInlineText(value) { return SURFACE_INTERACTION_FORMATTERS.formattedText(value); }`,
    patchSurfaceDom.toString(),
    createSurfaceInteractionRuntime.toString(),
    `function bootSurfaceInteractionRuntime(manifest) {
  if (!manifest || !Array.isArray(manifest.surfaces) || !manifest.surfaces.length) return;
  const start = () => {
    window.__surfaceInteractionRuntime = createSurfaceInteractionRuntime({
      document,
      window,
      manifest,
      createProcessRuntimeImpl: createProcessRuntime
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}`
  ].join("\n\n");
}

export function renderSurfaceInteractionRuntimeModule(manifest) {
  return `${renderProcessRuntimeModuleSource()}

${browserHelpersSource()}

const surfaceRuntimeManifest = ${JSON.stringify(manifest)};
bootSurfaceInteractionRuntime(surfaceRuntimeManifest);
`;
}
