import { renderProcessRuntimeModuleSource } from "./desire/process-eval.js";
import { surfaceDomId } from "./runtime-surface-dom-identity.js";

const processWitnessCatalogCache = new WeakMap();

function currentWitnessCount(world) {
  if (typeof world?.witnessCount === "function") return Number(world.witnessCount() || 0);
  return typeof world?.allWitnesses === "function" ? Number(world.allWitnesses().length || 0) : 0;
}

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolvedSurfaceDomId(surface) {
  const props = surface?.props && typeof surface.props === "object" ? surface.props : {};
  return trimString(props.domId)
    ?? trimString(props.mountId)
    ?? surfaceDomId(surface, { requireRuntimeAttachment: true });
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

function surfaceHasRuntimeMeaning(surface) {
  const runtime = runtimeSpecForSurface(surface);
  return Boolean(
    runtime.processRef
    || runtime.projectionRefs.length
    || runtime.capabilityRefs.length
    || runtime.bindings.length
    || runtime.interactions.length
  );
}

const PROCESS_WITNESS_KINDS = new Set([
  "desire.defineProcess",
  "desire.defineMessage",
  "desire.defineType",
  "desire.defineBoundary",
  "desire.defineProjection",
  "desire.definePolicy"
]);

function trimmedIdSet(values = []) {
  return new Set(values.map(value => trimString(value)).filter(Boolean));
}

function addToGroupedSet(grouped, group, id) {
  const trimmed = trimString(id);
  if (!trimmed) return false;
  const bucket = grouped[group];
  if (!(bucket instanceof Set) || bucket.has(trimmed)) return false;
  bucket.add(trimmed);
  return true;
}

function addToIndexedSet(map, key, value) {
  const nextKey = trimString(key);
  const nextValue = trimString(value);
  if (!nextKey || !nextValue) return;
  if (!map.has(nextKey)) map.set(nextKey, new Set());
  map.get(nextKey).add(nextValue);
}

function collectRuleStepReferences(steps = [], refs = { states: [], commands: [] }) {
  for (const step of steps ?? []) {
    if (!step || typeof step !== "object") continue;
    if (trimString(step.state)) refs.states.push(trimString(step.state));
    if (trimString(step.command)) refs.commands.push(trimString(step.command));
    if (step.kind === "option") {
      collectRuleStepReferences(step.real ?? [], refs);
      collectRuleStepReferences(step.else ?? [], refs);
    }
  }
  return refs;
}

function buildProcessWitnessCatalog(world) {
  const witnessCount = currentWitnessCount(world);
  const cached = world ? processWitnessCatalogCache.get(world) : null;
  if (cached && cached.witnessCount === witnessCount) return cached.value;
  const ordered = world.allWitnesses()
    .filter(witness => PROCESS_WITNESS_KINDS.has(witness.process) && trimString(witness.body?.id));
  const definitions = new Map(ordered.map(witness => [trimString(witness.body.id), witness]));
  const stateOwners = new Map();
  const handleOwners = new Map();
  const emitOwners = new Map();
  const policyByState = new Map();
  const boundaryOperations = new Map();
  for (const witness of ordered) {
    const id = trimString(witness.body?.id);
    const body = witness.body ?? {};
    if (witness.process === "desire.defineProcess") {
      for (const stateId of body.state ?? []) addToIndexedSet(stateOwners, stateId, id);
      for (const messageId of body.handles ?? []) addToIndexedSet(handleOwners, messageId, id);
      for (const messageId of body.emits ?? []) addToIndexedSet(emitOwners, messageId, id);
      continue;
    }
    if (witness.process === "desire.definePolicy") {
      addToIndexedSet(policyByState, body.stateField, id);
      continue;
    }
    if (witness.process === "desire.defineBoundary") {
      for (const operation of body.operations ?? []) {
        addToIndexedSet(boundaryOperations, operation?.command, id);
        addToIndexedSet(boundaryOperations, operation?.successEvent, id);
        addToIndexedSet(boundaryOperations, operation?.failureEvent, id);
        addToIndexedSet(boundaryOperations, operation?.loadingState, id);
      }
    }
  }
  const catalog = {
    ordered,
    definitions,
    stateOwners,
    handleOwners,
    emitOwners,
    policyByState,
    boundaryOperations
  };
  if (world) processWitnessCatalogCache.set(world, { witnessCount, value: catalog });
  return catalog;
}

function collectRelevantProcessWitnesses(world, surfaceEntries = [], routeStateDescriptor = null) {
  const catalog = buildProcessWitnessCatalog(world);
  const relevant = {
    processes: new Set(),
    messages: new Set(),
    states: new Set(),
    projections: new Set(),
    boundaries: new Set(),
    policies: new Set(),
    types: new Set()
  };
  const markDefinition = id => {
    const trimmed = trimString(id);
    if (!trimmed) return false;
    const witness = catalog.definitions.get(trimmed);
    if (!witness) return false;
    if (witness.process === "desire.defineProcess") return addToGroupedSet(relevant, "processes", trimmed);
    if (witness.process === "desire.defineMessage") return addToGroupedSet(relevant, "messages", trimmed);
    if (witness.process === "desire.defineProjection") return addToGroupedSet(relevant, "projections", trimmed);
    if (witness.process === "desire.defineBoundary") return addToGroupedSet(relevant, "boundaries", trimmed);
    if (witness.process === "desire.definePolicy") return addToGroupedSet(relevant, "policies", trimmed);
    if (witness.process === "desire.defineType") {
      if (witness.body?.role === "state") return addToGroupedSet(relevant, "states", trimmed);
      return addToGroupedSet(relevant, "types", trimmed);
    }
    return false;
  };
  for (const entry of surfaceEntries) {
    markDefinition(entry.runtime?.processRef);
    for (const projectionRef of entry.runtime?.projectionRefs ?? []) markDefinition(projectionRef);
    for (const binding of entry.runtime?.bindings ?? []) {
      const source = binding?.source ?? {};
      if (source.kind === "state") markDefinition(source.state);
      if (source.kind === "projection") markDefinition(source.projection);
    }
    for (const interaction of entry.runtime?.interactions ?? []) {
      const action = interaction?.action ?? {};
      if (action.kind === "deliver") markDefinition(action.message);
      if (action.kind === "setState") {
        markDefinition(action.state);
        if (action.value?.kind === "toggleState") markDefinition(action.value.state);
      }
    }
  }
  markDefinition(routeStateDescriptor?.process ?? routeStateDescriptor?.processRef);
  markDefinition(routeStateDescriptor?.state ?? routeStateDescriptor?.stateRef);

  let changed = true;
  while (changed) {
    changed = false;
    for (const stateId of [...relevant.states]) {
      const stateDef = catalog.definitions.get(stateId);
      if (!stateDef) continue;
      changed = markDefinition(stateDef.body?.valueType) || changed;
      for (const owner of catalog.stateOwners.get(stateId) ?? []) {
        changed = markDefinition(owner) || changed;
      }
      for (const policyId of catalog.policyByState.get(stateId) ?? []) {
        changed = markDefinition(policyId) || changed;
      }
      for (const boundaryId of catalog.boundaryOperations.get(stateId) ?? []) {
        changed = markDefinition(boundaryId) || changed;
      }
    }
    for (const messageId of [...relevant.messages]) {
      const messageDef = catalog.definitions.get(messageId);
      if (!messageDef) continue;
      for (const stateId of Object.keys(messageDef.body?.writes ?? {})) {
        changed = markDefinition(stateId) || changed;
      }
      for (const field of messageDef.body?.fields ?? []) {
        changed = markDefinition(field?.type) || changed;
      }
      for (const owner of catalog.handleOwners.get(messageId) ?? []) {
        changed = markDefinition(owner) || changed;
      }
      for (const owner of catalog.emitOwners.get(messageId) ?? []) {
        changed = markDefinition(owner) || changed;
      }
      for (const boundaryId of catalog.boundaryOperations.get(messageId) ?? []) {
        changed = markDefinition(boundaryId) || changed;
      }
    }
    for (const projectionId of [...relevant.projections]) {
      const projectionDef = catalog.definitions.get(projectionId);
      if (!projectionDef) continue;
      changed = markDefinition(projectionDef.body?.source) || changed;
    }
    for (const policyId of [...relevant.policies]) {
      const policyDef = catalog.definitions.get(policyId);
      if (!policyDef) continue;
      changed = markDefinition(policyDef.body?.stateField) || changed;
    }
    for (const boundaryId of [...relevant.boundaries]) {
      const boundaryDef = catalog.definitions.get(boundaryId);
      if (!boundaryDef) continue;
      for (const operation of boundaryDef.body?.operations ?? []) {
        changed = markDefinition(operation?.command) || changed;
        changed = markDefinition(operation?.successEvent) || changed;
        changed = markDefinition(operation?.failureEvent) || changed;
        changed = markDefinition(operation?.loadingState) || changed;
      }
    }
    for (const processId of [...relevant.processes]) {
      const processDef = catalog.definitions.get(processId);
      if (!processDef) continue;
      for (const stateId of processDef.body?.state ?? []) {
        if (relevant.states.has(trimString(stateId))) changed = markDefinition(stateId) || changed;
      }
      for (const messageId of processDef.body?.handles ?? []) {
        if (relevant.messages.has(trimString(messageId))) changed = markDefinition(messageId) || changed;
      }
      for (const messageId of processDef.body?.emits ?? []) {
        if (relevant.messages.has(trimString(messageId))) changed = markDefinition(messageId) || changed;
      }
      for (const rule of processDef.body?.rules ?? []) {
        const trigger = trimString(rule?.trigger);
        if (!trigger || !relevant.messages.has(trigger)) continue;
        changed = markDefinition(trigger) || changed;
        const refs = collectRuleStepReferences(rule.steps ?? []);
        for (const stateId of refs.states) changed = markDefinition(stateId) || changed;
        for (const commandId of refs.commands) changed = markDefinition(commandId) || changed;
      }
    }
  }

  const slicedWitnesses = [];
  const relevantIds = new Set([
    ...relevant.processes,
    ...relevant.messages,
    ...relevant.states,
    ...relevant.projections,
    ...relevant.boundaries,
    ...relevant.policies,
    ...relevant.types
  ]);
  for (const witness of catalog.ordered) {
    const id = trimString(witness.body?.id);
    if (!relevantIds.has(id)) continue;
    if (witness.process === "desire.defineProcess") {
      const next = structuredClone(witness);
      next.body.state = (next.body.state ?? []).filter(stateId => relevant.states.has(trimString(stateId)));
      next.body.handles = (next.body.handles ?? []).filter(messageId => relevant.messages.has(trimString(messageId)));
      next.body.emits = (next.body.emits ?? []).filter(messageId => relevant.messages.has(trimString(messageId)));
      next.body.rules = (next.body.rules ?? []).filter(rule => relevant.messages.has(trimString(rule?.trigger)));
      slicedWitnesses.push(next);
      continue;
    }
    if (witness.process === "desire.defineBoundary") {
      const next = structuredClone(witness);
      next.body.operations = (next.body.operations ?? []).filter(operation => (
        relevant.messages.has(trimString(operation?.command))
        || relevant.messages.has(trimString(operation?.successEvent))
        || relevant.messages.has(trimString(operation?.failureEvent))
        || relevant.states.has(trimString(operation?.loadingState))
      ));
      slicedWitnesses.push(next);
      continue;
    }
    slicedWitnesses.push(witness);
  }
  return {
    processWitnesses: slicedWitnesses,
    runtimeIds: [...relevantIds]
  };
}

function buildRuntimeManifestDiagnostics({
  requestPathname = "/",
  activeSurfaceId = null,
  surfaceEntries = [],
  processWitnesses = [],
  runtimeIds = []
} = {}) {
  const countsByWitnessKind = {};
  for (const witness of processWitnesses) {
    countsByWitnessKind[witness.process] = (countsByWitnessKind[witness.process] ?? 0) + 1;
  }
  return {
    requestPathname,
    activeSurfaceId: trimString(activeSurfaceId),
    includedSurfaceIds: surfaceEntries.map(entry => entry.id),
    includedRuntimeIds: [...runtimeIds].sort(),
    countsByWitnessKind,
    serializedBytes: 0
  };
}

function stateIdsFromWitnesses(witnesses = []) {
  return (witnesses ?? [])
    .filter(witness => witness?.process === "desire.defineType" && witness?.body?.role === "state")
    .map(witness => trimString(witness?.body?.id))
    .filter(Boolean);
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

const GENERIC_ATTRIBUTE_PROPS = [
  ["htmlRole", "role"],
  ["ariaLabel", "aria-label"],
  ["ariaLabelledBy", "aria-labelledby"],
  ["ariaDescribedBy", "aria-describedby"],
  ["ariaControls", "aria-controls"],
  ["ariaCurrent", "aria-current"],
  ["ariaExpanded", "aria-expanded"],
  ["ariaSelected", "aria-selected"],
  ["ariaChecked", "aria-checked"],
  ["ariaDisabled", "aria-disabled"],
  ["ariaPressed", "aria-pressed"],
  ["ariaHidden", "aria-hidden"],
  ["tabIndex", "tabindex"]
];

function genericSurfaceRuntimeView(surface) {
  const domId = resolvedSurfaceDomId(surface);
  const props = surface?.props && typeof surface.props === "object" ? surface.props : {};
  const inputId = trimString(props.inputId);
  const directTag = (trimString(props.tag) ?? "").toLowerCase();
  const isDirectValueControl = ["input", "select", "textarea"].includes(directTag);
  const propTargets = {};
  if (domId) {
    propTargets.className = [{ id: domId, mode: "className", baseClass: classTokensForSurface(surface).join(" ") }];
    propTargets.text = [{ id: domId, mode: "text" }];
    propTargets.style = [{ id: domId, mode: "attribute", attr: "style" }];
    propTargets.visible = [{ id: domId, mode: "visibility" }];
    propTargets.disabled = [{ id: domId, mode: "disabled" }];
    for (const [prop, attr] of GENERIC_ATTRIBUTE_PROPS) {
      const isAuthored = props[prop] != null
        || (surface?.bindings ?? []).some(binding => trimString(binding?.prop) === prop);
      if (isAuthored) propTargets[prop] = [{ id: domId, mode: "attribute", attr, falseAsValue: true }];
    }
    if (isDirectValueControl) {
      propTargets.inputType = [{ id: domId, mode: "attribute", attr: "type" }];
      propTargets.value = [{ id: domId, mode: "value" }];
      if (directTag === "input") propTargets.checked = [{ id: domId, mode: "checked" }];
    }
  }
  if (inputId) {
    propTargets.inputType = [{ id: inputId, mode: "attribute", attr: "type" }];
    propTargets.value = [{ id: inputId, mode: "value" }];
    propTargets.inputValue = [{ id: inputId, mode: "value" }];
    propTargets.min = [{ id: inputId, mode: "attribute", attr: "min" }];
    propTargets.max = [{ id: inputId, mode: "attribute", attr: "max" }];
    propTargets.step = [{ id: inputId, mode: "attribute", attr: "step" }];
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
  const rootId = rootSurfaceId ?? root?.id ?? activeSurface.id;
  const parentById = new Map();
  const fullQueue = [{ id: rootId, parentId: null }];
  const fullSeen = new Set();
  while (fullQueue.length) {
    const next = fullQueue.shift();
    if (!next?.id || fullSeen.has(next.id)) continue;
    fullSeen.add(next.id);
    const surface = surfaces.get(next.id);
    if (!surface) continue;
    parentById.set(surface.id, next.parentId ?? null);
    for (const childId of Array.isArray(surface.children) ? surface.children : []) {
      fullQueue.push({ id: childId, parentId: surface.id });
    }
  }
  const routeTargets = collectRouteTargets(surfaces, rootId);
  const includedIds = new Set();
  const markActiveClosure = surfaceId => {
    const queue = [trimString(surfaceId)];
    const seen = new Set();
    while (queue.length) {
      const currentId = queue.shift();
      if (!currentId || seen.has(currentId)) continue;
      seen.add(currentId);
      includedIds.add(currentId);
      const surface = surfaces.get(currentId);
      for (const childId of Array.isArray(surface?.children) ? surface.children : []) {
        const child = trimString(childId);
        if (child) queue.push(child);
      }
    }
  };
  const markAncestors = surfaceId => {
    let currentId = trimString(surfaceId);
    while (currentId && !includedIds.has(currentId)) {
      includedIds.add(currentId);
      currentId = trimString(parentById.get(currentId));
    }
  };
  markActiveClosure(activeSurface.id);
  markAncestors(activeSurface.id);
  const surfaceEntries = [];
  for (const surfaceId of includedIds) {
    const surface = surfaces.get(surfaceId);
    if (!surface) continue;
    if (!includedIds.has(surfaceId)) continue;
    const runtime = runtimeSpecForSurface(surface);
    const view = describeSurfaceRuntimeView(surface, { describeSurfaceRuntimeViewImpl });
    surfaceEntries.push({
      id: surface.id,
      parentId: parentById.get(surface.id) ?? null,
      surfaceKind: surface.surfaceKind ?? null,
      props: normalizeRuntimeObject(surface.props),
      runtime,
      view
    });
  }
  const interactive = surfaceEntries.some(entry => entry.runtime.processRef || entry.runtime.bindings.length || entry.runtime.interactions.length);
  if (!interactive) return null;
  const runtimeFragment = collectRelevantProcessWitnesses(world, surfaceEntries, routeStateDescriptor);
  const diagnostics = buildRuntimeManifestDiagnostics({
    requestPathname,
    activeSurfaceId: activeSurface.id,
    surfaceEntries,
    processWitnesses: runtimeFragment.processWitnesses,
    runtimeIds: runtimeFragment.runtimeIds
  });
  const manifest = {
    rootSurfaceId,
    activeSurfaceId: activeSurface.id,
    requestPathname,
    routeTargets,
    browserRuntimeCapabilities: [...new Set((browserRuntimeCapabilities ?? []).map(value => String(value || "")).filter(Boolean))],
    surfaces: surfaceEntries,
    processWitnesses: runtimeFragment.processWitnesses,
    routeState: normalizeRouteStateDescriptor(routeStateDescriptor),
    diagnostics
  };
  manifest.diagnostics.serializedBytes = Buffer.byteLength(JSON.stringify(manifest), "utf8");
  return manifest;
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

function routeTargetForManifestState(manifest, processRuntime) {
  const descriptor = normalizeRouteStateDescriptor(manifest?.routeState);
  const processRef = trimString(descriptor?.process) || trimString(descriptor?.processRef);
  if (!processRef) return null;
  return routeTargetForProcessState(manifest, processRuntime, processRef);
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

function forceDocumentNavigation(window, targetPath) {
  const nextPath = trimString(targetPath);
  if (!nextPath || !window?.location) return false;
  if (typeof window.location.assign === "function") {
    window.location.assign(nextPath);
    return true;
  }
  try {
    window.location.href = nextPath;
    return true;
  } catch {
    return false;
  }
}

function parseFirstElement(document, html) {
  if (!document || typeof html !== "string" || !html.trim()) return null;
  const template = document.createElement("template");
  if (!template?.content) return null;
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function supportsSameDocumentRouteReplacement(document, window) {
  const hasFetch = typeof window?.fetch === "function";
  const hasTemplateParser = Boolean(document?.createElement?.("template")?.content);
  const hasDomParser = Boolean(domParserForWindow(window));
  return hasFetch && (hasDomParser || hasTemplateParser);
}

function fallbackActiveRootNode(document) {
  const body = document?.body;
  if (!body) return null;
  for (const child of body.children ?? []) {
    if (!(child instanceof Element)) continue;
    if (trimString(child.id) === "surface-route-underlay") continue;
    if (child.tagName?.toLowerCase?.() === "script") continue;
    return child;
  }
  return null;
}

function domParserForWindow(window) {
  if (typeof window?.DOMParser === "function") return new window.DOMParser();
  if (typeof DOMParser === "function") return new DOMParser();
  return null;
}

function readSurfaceRuntimeManifest(document) {
  const node = document?.getElementById?.("surface-runtime-manifest");
  if (!node) return null;
  try {
    return JSON.parse(node.textContent || "null");
  } catch {
    return null;
  }
}

function parseRouteSurfacePage({ document, window, html, rootId = null } = {}) {
  if (!html || typeof html !== "string") return { fragment: null, manifest: null };
  const parser = domParserForWindow(window);
  if (parser) {
    const parsed = parser.parseFromString(html, "text/html");
    const manifestNode = parsed?.getElementById?.("surface-runtime-manifest");
    let manifest = null;
    if (manifestNode?.textContent) {
      try {
        manifest = JSON.parse(manifestNode.textContent);
      } catch {}
    }
    if (rootId) {
      const root = parsed?.getElementById?.(rootId);
      if (root?.outerHTML) return { fragment: root.outerHTML, manifest };
    }
    return { fragment: parsed?.body?.firstElementChild?.outerHTML ?? null, manifest };
  }
  const first = parseFirstElement(document, html);
  if (!first) return { fragment: null, manifest: null };
  if (rootId && trimString(first?.id) && trimString(first.id) !== rootId) return { fragment: null, manifest: null };
  return { fragment: first.outerHTML ?? html.trim(), manifest: null };
}

async function loadRouteSurfacePage({ document, window, manifest, surfaceById, target, requireManifest = false } = {}) {
  if (!target?.surfaceId || !target?.path) return null;
  const cacheKey = trimString(target.key) || trimString(target.surfaceId);
  if (!manifest.__routeSurfacePageCache) manifest.__routeSurfacePageCache = {};
  if (cacheKey && manifest.__routeSurfacePageCache[cacheKey]) {
    const cached = manifest.__routeSurfacePageCache[cacheKey];
    if (!requireManifest || cached?.manifest?.surfaces) return cached;
  }
  const fetchImpl = typeof window?.fetch === "function"
    ? window.fetch.bind(window)
    : null;
  if (!fetchImpl) return null;
  const rootId = trimString(surfaceById?.get(target.surfaceId)?.view?.rootId);
  const loadAttempt = async headers => {
    const response = await fetchImpl(target.path, headers ? { headers } : {});
    if (!response?.ok) return null;
    const html = await response.text();
    return parseRouteSurfacePage({
      document,
      window,
      html,
      rootId
    });
  };
  let page = await loadAttempt({ "x-surface-fragment-request": "1" });
  if (requireManifest && !page?.manifest?.surfaces) {
    page = await loadAttempt();
  }
  if (cacheKey && page?.fragment) manifest.__routeSurfacePageCache[cacheKey] = page;
  return page;
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

async function updateRouteUnderlay(document, window, manifest, surfaceById, activeSurface, nextProps) {
  const routeKey = trimString(nextProps?.routeUnderlay);
  if (!routeKey) {
    clearRouteUnderlay(document);
    return;
  }
  const target = (manifest?.routeTargets ?? []).find(candidate => String(candidate.key) === routeKey);
  const page = target
    ? await loadRouteSurfacePage({ document, window, manifest, surfaceById, target })
    : null;
  const html = page?.fragment ?? null;
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
  let surfaceById = new Map((manifest.surfaces ?? []).map(surface => [surface.id, surface]));
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
  const disposers = [];
  const runtimeDisposers = [];
  let processRuntime = null;
  let unsubscribeProcessRuntime = null;
  const inFlightRuntimeBridges = new Set();
  let lastRouteSwap = null;
  let fallbackNavigationPath = null;
  const routeDebugLog = [];
  const pushRouteDebug = entry => {
    routeDebugLog.push({
      at: Date.now(),
      ...entry
    });
    if (routeDebugLog.length > 40) routeDebugLog.shift();
  };
  const replaceProcessRuntime = nextWitnesses => {
    const witnesses = Array.isArray(nextWitnesses) ? nextWitnesses : [];
    const previousRuntime = processRuntime;
    const nextRuntime = processRuntimeFactory({ witnesses });
    if (previousRuntime) {
      for (const stateId of stateIdsFromWitnesses(witnesses)) {
        const previousValue = previousRuntime.value(stateId);
        if (previousValue === undefined) continue;
        nextRuntime.set(stateId, previousValue);
      }
      if (typeof previousRuntime.subscribe === "function") {
        const bridge = previousRuntime.subscribe(observation => {
          let mirrored = false;
          for (const change of observation?.changes ?? []) {
            const stateId = trimString(change?.field);
            if (!stateId) continue;
            if (nextRuntime.value(stateId) === undefined) continue;
            nextRuntime.set(stateId, change.to);
            mirrored = true;
          }
          if (mirrored) void requestSyncRouteAndRefresh();
        });
        inFlightRuntimeBridges.add(bridge);
        Promise.resolve(typeof previousRuntime.whenIdle === "function" ? previousRuntime.whenIdle() : null)
          .finally(() => {
            bridge();
            inFlightRuntimeBridges.delete(bridge);
          });
      }
    }
    unsubscribeProcessRuntime?.();
    processRuntime = nextRuntime;
    unsubscribeProcessRuntime = typeof processRuntime.subscribe === "function"
      ? processRuntime.subscribe(() => {
          void requestSyncRouteAndRefresh();
        })
      : null;
  };
  replaceProcessRuntime(manifest.processWitnesses || []);
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
  const refresh = async () => {
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
      if (surface.id === activeSurfaceId) {
        await updateRouteUnderlay(document, window, manifest, surfaceById, surface, nextProps);
      }
      patchSurfaceDom(document, surface, nextProps);
    }
  };
  const disposeInteractions = () => {
    for (const dispose of disposers.splice(0)) dispose();
  };
  const replaceActiveRouteSurface = async target => {
    pushRouteDebug({
      kind: "replace:start",
      activeSurfaceId,
      targetSurfaceId: target?.surfaceId ?? null,
      targetPath: target?.path ?? null
    });
    if (!target?.surfaceId) {
      lastRouteSwap = { ok: false, reason: "missing-target" };
      pushRouteDebug({ kind: "replace:missing-target" });
      return false;
    }
    if (target.surfaceId === activeSurfaceId) {
      lastRouteSwap = { ok: false, reason: "already-active", targetSurfaceId: target.surfaceId };
      pushRouteDebug({ kind: "replace:already-active", targetSurfaceId: target.surfaceId });
      return false;
    }
    const currentSurface = surfaceById.get(activeSurfaceId);
    const currentRootId = trimString(currentSurface?.view?.rootId);
    const currentRoot = (currentRootId ? document.getElementById(currentRootId) : null)
      ?? fallbackActiveRootNode(document);
    const page = await loadRouteSurfacePage({
      document,
      window,
      manifest,
      surfaceById,
      target,
      requireManifest: true
    });
    const nextRoot = parseFirstElement(document, page?.fragment ?? null);
    if (!currentRoot || !nextRoot) {
      lastRouteSwap = {
        ok: false,
        reason: !currentRoot ? "missing-current-root" : "missing-next-root",
        currentRootId,
        nextRootId: trimString(nextRoot?.id),
        targetSurfaceId: target.surfaceId,
        hasManifest: Boolean(page?.manifest?.surfaces)
      };
      pushRouteDebug({
        kind: "replace:missing-root",
        currentRootId,
        nextRootId: trimString(nextRoot?.id),
        targetSurfaceId: target.surfaceId,
        hasManifest: Boolean(page?.manifest?.surfaces),
        manifestActiveSurfaceId: trimString(page?.manifest?.activeSurfaceId)
      });
      return false;
    }
    disposeInteractions();
    currentRoot.replaceWith(nextRoot);
    if (page?.manifest?.surfaces) {
      pushRouteDebug({
        kind: "replace:manifest",
        targetSurfaceId: target.surfaceId,
        manifestActiveSurfaceId: trimString(page.manifest.activeSurfaceId),
        manifestRequestPathname: trimString(page.manifest.requestPathname),
        manifestSurfaceCount: Array.isArray(page.manifest.surfaces) ? page.manifest.surfaces.length : 0
      });
      manifest.surfaces = page.manifest.surfaces;
      manifest.routeTargets = page.manifest.routeTargets ?? manifest.routeTargets;
      manifest.routeState = page.manifest.routeState ?? manifest.routeState;
      manifest.browserRuntimeCapabilities = page.manifest.browserRuntimeCapabilities ?? manifest.browserRuntimeCapabilities;
      manifest.processWitnesses = page.manifest.processWitnesses ?? manifest.processWitnesses;
      replaceProcessRuntime(manifest.processWitnesses || []);
      surfaceById = new Map((manifest.surfaces ?? []).map(surface => [surface.id, surface]));
      activeSurfaceId = trimString(page.manifest.activeSurfaceId) || target.surfaceId;
    } else {
      activeSurfaceId = target.surfaceId;
    }
    manifest.activeSurfaceId = activeSurfaceId;
    fallbackNavigationPath = null;
    bootSurfaceCapabilities(window, nextRoot);
    clearRouteUnderlay(document);
    lastRouteSwap = {
      ok: true,
      targetSurfaceId: target.surfaceId,
      activeSurfaceId,
      nextRootId: trimString(nextRoot?.id),
      hasManifest: Boolean(page?.manifest?.surfaces)
    };
    pushRouteDebug({
      kind: "replace:done",
      targetSurfaceId: target.surfaceId,
      activeSurfaceId,
      hasManifest: Boolean(page?.manifest?.surfaces)
    });
    return true;
  };
  const currentProcessRefs = () => [...new Set((manifest.surfaces ?? [])
    .map(surface => resolveSurfaceRuntimeBinding(manifest, surface.id).processRef)
    .filter(Boolean))];
  const reconcileActiveRouteFromManifestState = async () => {
    const target = routeTargetForManifestState(manifest, processRuntime);
    pushRouteDebug({
      kind: "reconcile",
      activeSurfaceId,
      targetSurfaceId: target?.surfaceId ?? null,
      targetKey: target?.key ?? null,
      targetPath: target?.path ?? null
    });
    if (!target?.path || !window?.history || !window?.location) return false;
    if (target.surfaceId !== activeSurfaceId && !supportsSameDocumentRouteReplacement(document, window)) {
      const forced = fallbackNavigationPath === target.path
        ? false
        : forceDocumentNavigation(window, target.path);
      if (forced) fallbackNavigationPath = target.path;
      pushRouteDebug({
        kind: forced ? "replace:direct-navigation" : "replace:direct-navigation-missed",
        targetSurfaceId: target.surfaceId,
        targetPath: target.path
      });
      return false;
    }
    const currentPath = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
    const nextPath = String(target.path || "/").replace(/\/+$/, "") || "/";
    if (currentPath !== nextPath) window.history.pushState({ surfaceRouteKey: target.key }, "", target.path);
    if (target.surfaceId === activeSurfaceId) return false;
    const replaced = await replaceActiveRouteSurface(target);
    if (!replaced) {
      const forced = fallbackNavigationPath === nextPath
        ? false
        : forceDocumentNavigation(window, target.path);
      if (forced) fallbackNavigationPath = nextPath;
      pushRouteDebug({
        kind: forced ? "replace:fallback-navigation" : "replace:fallback-missed",
        targetSurfaceId: target.surfaceId,
        targetPath: target.path
      });
    }
    return replaced;
  };
  const syncRouteAndRefresh = async () => {
    await refresh();
    for (const processRef of currentProcessRefs()) {
      const routeTarget = syncRouteStateToUrl({ manifest, processRuntime, processRef, window });
      if (await replaceActiveRouteSurface(routeTarget)) {
        bindInteractions();
        await refresh();
      }
    }
    if (await reconcileActiveRouteFromManifestState()) {
      bindInteractions();
      await refresh();
    }
  };
  let syncInFlight = null;
  let syncQueued = false;
  const requestSyncRouteAndRefresh = async () => {
    if (syncInFlight) {
      syncQueued = true;
      await syncInFlight;
      return syncInFlight;
    }
    do {
      syncQueued = false;
      syncInFlight = Promise.resolve(syncRouteAndRefresh());
      await syncInFlight;
      syncInFlight = null;
    } while (syncQueued);
    return null;
  };
  for (const processRef of currentProcessRefs()) {
    syncUrlToRouteState({ manifest, processRuntime, processRef, window });
  }
  if (window && typeof window.addEventListener === "function") {
    const onPopState = async () => {
      for (const processRef of currentProcessRefs()) {
        syncUrlToRouteState({ manifest, processRuntime, processRef, window });
      }
      await requestSyncRouteAndRefresh();
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
              if (await reconcileActiveRouteFromManifestState()) {
                bindInteractions();
              }
              await requestSyncRouteAndRefresh();
              return;
            }
            if (action.kind === "setState" && trimString(action.state)) {
              event.preventDefault();
              processRuntime.set(action.state, eventValueFromSpec(action.value ?? {}, event, processRuntime));
              if (await reconcileActiveRouteFromManifestState()) {
                bindInteractions();
              }
              await requestSyncRouteAndRefresh();
            }
          };
          node.addEventListener(eventName, listener);
          disposers.push(() => node.removeEventListener(eventName, listener));
        }
      }
    }
  };
  bindInteractions();

  void refresh();
  return {
    refresh() {
      return requestSyncRouteAndRefresh();
    },
    get activeSurfaceId() {
      return activeSurfaceId;
    },
    get manifestDiagnostics() {
      return manifest?.diagnostics ?? null;
    },
    get routeTargets() {
      return manifest?.routeTargets ?? [];
    },
    get surfaceIds() {
      return [...surfaceById.keys()];
    },
    get lastRouteSwap() {
      return lastRouteSwap;
    },
    get routeDebugLog() {
      return [...routeDebugLog];
    },
    get processRuntime() {
      return processRuntime;
    },
    destroy() {
      disposeInteractions();
      unsubscribeProcessRuntime?.();
      for (const bridge of inFlightRuntimeBridges) bridge();
      inFlightRuntimeBridges.clear();
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
    stateIdsFromWitnesses.toString(),
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
    routeTargetForManifestState.toString(),
    syncUrlToRouteState.toString(),
    syncRouteStateToUrl.toString(),
    forceDocumentNavigation.toString(),
    parseFirstElement.toString(),
    supportsSameDocumentRouteReplacement.toString(),
    fallbackActiveRootNode.toString(),
    domParserForWindow.toString(),
    readSurfaceRuntimeManifest.toString(),
    parseRouteSurfacePage.toString(),
    loadRouteSurfacePage.toString(),
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

let cachedSurfaceInteractionRuntimeModuleSource = null;

export function renderSurfaceInteractionRuntimeModule(manifest) {
  if (!cachedSurfaceInteractionRuntimeModuleSource) {
    cachedSurfaceInteractionRuntimeModuleSource = `${renderProcessRuntimeModuleSource()}

${browserHelpersSource()}

const surfaceRuntimeManifest = readSurfaceRuntimeManifest(document);
bootSurfaceInteractionRuntime(surfaceRuntimeManifest);
`;
  }
  return cachedSurfaceInteractionRuntimeModuleSource;
}
