import { renderProcessRuntimeModuleSource } from "./desire/process-eval.js";

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stableDomToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fallbackSurfaceDomId(surface, prefix = "surface") {
  const routeKey = trimString(surface?.props?.routeKey);
  const surfaceId = trimString(surface?.id);
  const token = stableDomToken(routeKey || surfaceId || surface?.surfaceKind || "node");
  return token ? `${prefix}-${token}` : prefix;
}

function surfaceDomId(surface, fallback = "") {
  return trimString(surface?.props?.domId) || fallback;
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

function describeAuthScreenRuntimeView(surface) {
  const domId = surfaceDomId(surface, fallbackSurfaceDomId(surface, "surface-auth"));
  return {
    rootId: domId,
    propTargets: {
      title: [{ id: `${domId}__title`, mode: "formattedText" }],
      subtitle: [{ id: `${domId}__subtitle`, mode: "formattedText" }],
      heroTitle: [{ id: `${domId}__heroTitle`, mode: "formattedText" }],
      heroBody: [{ id: `${domId}__heroBody`, mode: "formattedText" }],
      footnote: [{ id: `${domId}__footnote`, mode: "formattedText" }],
      primaryActionLabel: [{ id: `${domId}__primaryLabel`, mode: "text" }],
      primaryActionHref: [{ id: `${domId}__primaryAction`, mode: "navHref" }]
    },
    interactionTargets: {
      primaryAction: [{ id: `${domId}__primaryAction`, defaultEvent: "click" }]
    }
  };
}

export function describeSurfaceRuntimeView(surface) {
  if (surface?.surfaceKind === "auth-screen") return describeAuthScreenRuntimeView(surface);
  return {
    rootId: surfaceDomId(surface, fallbackSurfaceDomId(surface)),
    propTargets: {},
    interactionTargets: {}
  };
}

export function buildSurfaceRuntimeManifest({
  world,
  root,
  activeSurface,
  surfaces,
  browserRuntimeCapabilities = [],
  rootSurfaceId = null,
  requestPathname = "/"
}) {
  const surfaceEntries = [];
  const queue = [{ id: activeSurface.id, parentId: null }];
  const seen = new Set();
  while (queue.length) {
    const next = queue.shift();
    if (!next?.id || seen.has(next.id)) continue;
    seen.add(next.id);
    const surface = surfaces.get(next.id);
    if (!surface) continue;
    const runtime = runtimeSpecForSurface(surface);
    const view = describeSurfaceRuntimeView(surface);
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
    browserRuntimeCapabilities: [...new Set((browserRuntimeCapabilities ?? []).map(value => String(value || "")).filter(Boolean))],
    surfaces: surfaceEntries,
    processWitnesses
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

function readBindingSource(source, processRuntime) {
  if (!source || typeof source !== "object") return undefined;
  if (source.kind === "literal") return source.value;
  if (source.kind === "state") return processRuntime.value(source.state);
  if (source.kind === "projection") return processRuntime.derive(source.projection);
  return undefined;
}

function overlaySurfaceProps(surface, processRuntime) {
  const nextProps = { ...(surface?.props || {}) };
  for (const binding of surface?.runtime?.bindings ?? []) {
    const prop = trimString(binding?.prop);
    if (!prop) continue;
    const nextValue = readBindingSource(binding.source, processRuntime);
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
    const value = nextProps[prop];
    for (const target of targets ?? []) {
      const node = trimString(target?.id) ? document.getElementById(target.id) : null;
      if (!node) continue;
      switch (target.mode) {
        case "navHref": {
          const href = trimString(value);
          if (href) node.setAttribute("data-shell-nav-href", href);
          else node.removeAttribute("data-shell-nav-href");
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
  const processRuntime = processRuntimeFactory({ witnesses: manifest.processWitnesses || [] });
  const disposers = [];
  const refresh = () => {
    for (const surface of manifest.surfaces ?? []) {
      const binding = resolveSurfaceRuntimeBinding(manifest, surface.id);
      if (!binding.processRef) continue;
      const capabilities = resolveSurfaceCapabilities(binding, manifest.browserRuntimeCapabilities);
      if (capabilities.missing.length) continue;
      patchSurfaceDom(document, surface, overlaySurfaceProps(surface, processRuntime));
    }
  };

  for (const surface of manifest.surfaces ?? []) {
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
        const listener = event => {
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
            processRuntime.deliver(action.message);
            refresh();
            return;
          }
          if (action.kind === "setState" && trimString(action.state)) {
            event.preventDefault();
            processRuntime.set(action.state, eventValueFromSpec(action.value ?? {}, event, processRuntime));
            refresh();
          }
        };
        node.addEventListener(eventName, listener);
        disposers.push(() => node.removeEventListener(eventName, listener));
      }
    }
  }

  refresh();
  return {
    refresh,
    processRuntime,
    destroy() {
      for (const dispose of disposers.splice(0)) dispose();
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
    `function toSurfaceMap(manifest) {
  return new Map((manifest?.surfaces ?? []).map(surface => [surface.id, surface]));
}`,
    eventValueFromSpec.toString(),
    readBindingSource.toString(),
    overlaySurfaceProps.toString(),
    resolveSurfaceRuntimeBinding.toString(),
    resolveSurfaceCapabilities.toString(),
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
