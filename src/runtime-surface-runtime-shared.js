import { surfaceDomId } from "./runtime-surface-dom-identity.js";

export function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolvedSurfaceDomId(surface) {
  const props = surface?.props && typeof surface.props === "object" ? surface.props : {};
  return trimString(props.domId)
    ?? trimString(props.mountId)
    ?? surfaceDomId(surface, { requireRuntimeAttachment: true });
}

export function normalizeRuntimeArray(value) {
  return Array.isArray(value) ? structuredClone(value) : [];
}

export function normalizeRuntimeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? structuredClone(value) : {};
}

export function cloneInspectionValue(value) {
  if (value == null) return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

export function normalizeCapabilityAssets(value) {
  const assets = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const readList = key => [...new Set((Array.isArray(assets[key]) ? assets[key] : [])
    .map(entry => String(entry ?? "").trim())
    .filter(Boolean))];
  return {
    stylesheetHrefs: readList("stylesheetHrefs"),
    scriptSrcs: readList("scriptSrcs"),
    inlineCss: readList("inlineCss"),
    scriptBodies: readList("scriptBodies")
  };
}

export function runtimeSpecForSurface(surface) {
  return {
    processRef: trimString(surface?.processRef),
    projectionRefs: normalizeRuntimeArray(surface?.projectionRefs),
    capabilityRefs: normalizeRuntimeArray(surface?.capabilityRefs),
    bindings: normalizeRuntimeArray(surface?.bindings),
    interactions: normalizeRuntimeArray(surface?.interactions),
    repeat: normalizeRuntimeObject(surface?.repeat)
  };
}

export function surfaceHasRuntimeMeaning(surface) {
  const runtime = runtimeSpecForSurface(surface);
  return Boolean(
    runtime.processRef
    || runtime.projectionRefs.length
    || runtime.capabilityRefs.length
    || runtime.bindings.length
    || runtime.interactions.length
    || Boolean(runtime.repeat?.collection && runtime.repeat?.template)
  );
}

export function stateIdsFromWitnesses(witnesses = []) {
  return witnesses
    .filter(witness => witness?.process === "desire.defineType" && witness?.body?.role === "state")
    .map(witness => trimString(witness.body.id))
    .filter(Boolean);
}

export function normalizeRouteStateDescriptor(value) {
  if (!value || typeof value !== "object") return null;
  const processRef = trimString(value.processRef ?? value.process);
  const stateRef = trimString(value.stateRef ?? value.state);
  return processRef && stateRef ? { processRef, stateRef, process: processRef, state: stateRef } : null;
}

export function normalizeQueryBindings(value) {
  return (Array.isArray(value) ? value : [])
    .map(binding => {
      const normalized = binding && typeof binding === "object" && !Array.isArray(binding) ? binding : null;
      const param = trimString(normalized?.param);
      const processRef = trimString(normalized?.processRef ?? normalized?.process);
      const stateRef = trimString(normalized?.stateRef ?? normalized?.state);
      if (!param || !processRef || !stateRef) return null;
      const next = {
        param,
        processRef,
        process: processRef,
        stateRef,
        state: stateRef
      };
      if (Object.prototype.hasOwnProperty.call(normalized ?? {}, "defaultValue")) {
        next.defaultValue = cloneInspectionValue(normalized.defaultValue);
      }
      return next;
    })
    .filter(Boolean);
}

export function resolveRouteStateDescriptor(manifest) {
  return normalizeRouteStateDescriptor(manifest?.routeState);
}

export function resolveSurfaceRuntimeBinding(manifest, surfaceId) {
  const surfaces = new Map((manifest?.surfaces ?? []).map(surface => [surface.id, surface]));
  let current = surfaces.get(surfaceId) ?? null;
  let processRef = null;
  const projectionRefs = [];
  const capabilityRefs = [];
  const bindings = [];
  const interactions = [];
  while (current) {
    const runtime = current?.runtime && typeof current.runtime === "object" ? current.runtime : current;
    if (!processRef) processRef = trimString(runtime?.processRef);
    for (const ref of runtime?.projectionRefs ?? []) {
      const next = trimString(ref);
      if (next && !projectionRefs.includes(next)) projectionRefs.push(next);
    }
    for (const ref of runtime?.capabilityRefs ?? []) {
      const next = trimString(ref);
      if (next && !capabilityRefs.includes(next)) capabilityRefs.push(next);
    }
    for (const binding of runtime?.bindings ?? []) bindings.push(structuredClone(binding));
    for (const interaction of runtime?.interactions ?? []) interactions.push(structuredClone(interaction));
    const parentId = trimString(current.parentId);
    current = parentId ? (surfaces.get(parentId) ?? null) : null;
  }
  return { processRef, projectionRefs, capabilityRefs, bindings, interactions };
}

export function resolveSurfaceCapabilities(binding, runtimeCapabilities) {
  const installed = new Set((runtimeCapabilities ?? []).map(value => String(value || "").trim()).filter(Boolean));
  const required = [...new Set((binding?.capabilityRefs ?? []).map(value => String(value || "").trim()).filter(Boolean))];
  return {
    required,
    missing: required.filter(capability => !installed.has(capability))
  };
}

export function collectSurfaceDescendants(surfaceById, surfaceId, out) {
  if (!surfaceId || out.has(surfaceId)) return;
  out.add(surfaceId);
  const surface = surfaceById.get(surfaceId);
  for (const childId of surface?.children ?? []) collectSurfaceDescendants(surfaceById, trimString(childId), out);
}

export function activeRuntimeSurfaceIds(surfaceById, activeSurfaceId) {
  const activeIds = new Set();
  collectSurfaceDescendants(surfaceById, trimString(activeSurfaceId), activeIds);
  let current = surfaceById.get(trimString(activeSurfaceId)) ?? null;
  while (current) {
    activeIds.add(current.id);
    current = trimString(current.parentId) ? surfaceById.get(trimString(current.parentId)) ?? null : null;
  }
  return activeIds;
}

export function readCapabilityOutput(source, capabilityOutputs = {}) {
  const surfaceId = trimString(source?.surface);
  const output = trimString(source?.output);
  if (!surfaceId || !output) return undefined;
  return capabilityOutputs[surfaceId]?.[output];
}

export function collectCapabilityOutputsFromDom(document) {
  const outputs = {};
  const nodes = typeof document?.querySelectorAll === "function"
    ? document.querySelectorAll("[data-surface-id]")
    : [];
  for (const node of nodes ?? []) {
    const surfaceId = trimString(node.getAttribute?.("data-surface-id"));
    if (!surfaceId || !node.__surfaceCapabilityOutputs) continue;
    outputs[surfaceId] = node.__surfaceCapabilityOutputs;
  }
  return outputs;
}

export function readBindingSource(source, processRuntime, capabilityOutputs = {}) {
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

export function overlaySurfaceProps(surface, processRuntime, capabilityOutputs = {}) {
  const nextProps = { ...(surface?.props || {}) };
  for (const binding of surface?.runtime?.bindings ?? []) {
    const prop = trimString(binding?.prop);
    if (!prop) continue;
    const nextValue = readBindingSource(binding.source, processRuntime, capabilityOutputs);
    if (nextValue !== undefined) nextProps[prop] = nextValue;
  }
  return nextProps;
}

export function eventValueFromSpec(spec, event, processRuntime) {
  if (!spec || typeof spec !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(spec, "literal")) return spec.literal;
  if (spec.kind === "toggleState") return !Boolean(processRuntime.value(spec.state));
  if (spec.kind === "eventValue") return event?.target && "value" in event.target ? event.target.value : null;
  if (spec.kind === "eventChecked") return event?.target && "checked" in event.target ? Boolean(event.target.checked) : false;
  if (spec.kind === "eventValues") {
    const selected = event?.target?.selectedOptions;
    if (selected && typeof selected.length === "number") {
      return [...selected]
        .map(option => option?.value == null ? "" : String(option.value))
        .filter((value, index, values) => value !== "" && values.indexOf(value) === index);
    }
    const options = event?.target?.options;
    if (options && typeof options.length === "number") {
      return [...options]
        .filter(option => option?.selected)
        .map(option => option?.value == null ? "" : String(option.value))
        .filter((value, index, values) => value !== "" && values.indexOf(value) === index);
    }
    return [];
  }
  return null;
}
