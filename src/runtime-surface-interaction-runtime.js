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

function cloneInspectionValue(value) {
  if (value == null) return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function normalizeCapabilityAssets(value) {
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
  capabilityAssets = null,
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
  const includedParentById = new Map();
  const markActiveClosure = surfaceId => {
    const queue = [{
      id: trimString(surfaceId),
      parentId: trimString(parentById.get(surfaceId)) || null
    }];
    const seen = new Set();
    while (queue.length) {
      const next = queue.shift();
      const currentId = trimString(next?.id);
      if (!currentId || seen.has(currentId)) continue;
      seen.add(currentId);
      includedIds.add(currentId);
      includedParentById.set(currentId, trimString(next?.parentId) || null);
      const surface = surfaces.get(currentId);
      for (const childId of Array.isArray(surface?.children) ? surface.children : []) {
        const child = trimString(childId);
        if (child) queue.push({ id: child, parentId: currentId });
      }
    }
  };
  const markAncestors = surfaceId => {
    let currentId = trimString(surfaceId);
    while (currentId) {
      includedIds.add(currentId);
      const nextParentId = trimString(parentById.get(currentId)) || null;
      if (!includedParentById.has(currentId)) includedParentById.set(currentId, nextParentId);
      currentId = nextParentId;
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
      parentId: includedParentById.get(surface.id) ?? null,
      children: childSurfaceIds(surface).filter(childId => includedIds.has(childId)),
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
    capabilityAssets: normalizeCapabilityAssets(capabilityAssets),
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
  if (!routeState) return null;
  const value = processRuntime.value(routeState.state);
  return targets.find(target => String(target.key) === String(value)) ?? null;
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
  if (!routeState) return false;
  if (String(processRuntime.value(routeState.state)) === String(active.key)) return false;
  processRuntime.set(routeState.state, active.key);
  return true;
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

function capabilityBootIssueId(hook, index, root) {
  const hookName = trimString(hook?.name) || `hook-${Number(index) + 1}`;
  const rootId = trimString(root?.id) || "active-root";
  return `surface-runtime:capability-boot-failed:${rootId}:${hookName}`;
}

function bootSurfaceCapabilities(window, root, {
  reportIssue = null,
  resolveIssue = null,
  phase = "capability-mount",
  correlationId = null
} = {}) {
  const hooks = Array.isArray(window?.__surfaceCapabilityBootHooks)
    ? window.__surfaceCapabilityBootHooks
    : [];
  for (const [index, hook] of hooks.entries()) {
    if (typeof hook !== "function") continue;
    const issueId = capabilityBootIssueId(hook, index, root);
    try {
      hook(root);
      if (typeof resolveIssue === "function") resolveIssue(issueId, { phase, correlationId });
    } catch (error) {
      window?.console?.error?.("surface capability boot failed", error);
      if (typeof reportIssue === "function") {
        reportIssue({
          id: issueId,
          severity: "error",
          phase,
          kind: "capability-boot-failed",
          message: "Surface capability boot hook failed",
          capability: trimString(hook?.capability) || null,
          targetId: trimString(root?.id),
          details: {
            hookName: trimString(hook?.name) || null,
            rootId: trimString(root?.id) || null,
            name: error?.name || "Error",
            message: String(error?.message || error),
            stack: String(error?.stack || "")
          },
          correlationId
        });
      }
    }
  }
}

function capabilityAssetHash(value) {
  const text = String(value ?? "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function waitForNodeLoad(node) {
  return new Promise((resolve, reject) => {
    if (!node || typeof node.addEventListener !== "function") {
      resolve();
      return;
    }
    const cleanup = () => {
      node.removeEventListener?.("load", onLoad);
      node.removeEventListener?.("error", onError);
    };
    const onLoad = () => {
      cleanup();
      resolve();
    };
    const onError = error => {
      cleanup();
      reject(error instanceof Error ? error : new Error("surface capability asset failed to load"));
    };
    node.addEventListener("load", onLoad, { once: true });
    node.addEventListener("error", onError, { once: true });
  });
}

async function waitForSurfaceCapabilityModuleSettle(window, {
  readyStart = 0,
  hookStart = 0,
  maxPasses = 8
} = {}) {
  const tick = async () => {
    if (typeof window?.requestAnimationFrame === "function") {
      await new Promise(resolve => window.requestAnimationFrame(() => resolve()));
      return;
    }
    await new Promise(resolve => {
      if (typeof setTimeout === "function") {
        setTimeout(resolve, 0);
        return;
      }
      resolve();
    });
  };

  let lastReady = readyStart;
  let lastHooks = hookStart;
  let stablePasses = 0;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    await tick();
    const nextReady = Array.isArray(window?.__surfaceCapabilityReadyPromises)
      ? window.__surfaceCapabilityReadyPromises.length
      : 0;
    const nextHooks = Array.isArray(window?.__surfaceCapabilityBootHooks)
      ? window.__surfaceCapabilityBootHooks.length
      : 0;
    if (nextReady === lastReady && nextHooks === lastHooks) {
      stablePasses += 1;
      if (stablePasses >= 2) break;
      continue;
    }
    lastReady = nextReady;
    lastHooks = nextHooks;
    stablePasses = 0;
  }
}

async function waitForSurfaceCapabilityModuleRegistration(window, {
  readyStart = 0,
  hookStart = 0,
  maxPasses = 40
} = {}) {
  for (let pass = 0; pass < maxPasses; pass += 1) {
    await waitForSurfaceCapabilityModuleSettle(window, {
      readyStart,
      hookStart,
      maxPasses: 1
    });
    const nextReady = Array.isArray(window?.__surfaceCapabilityReadyPromises)
      ? window.__surfaceCapabilityReadyPromises.length
      : 0;
    const nextHooks = Array.isArray(window?.__surfaceCapabilityBootHooks)
      ? window.__surfaceCapabilityBootHooks.length
      : 0;
    if (nextReady > readyStart || nextHooks > hookStart) return;
  }
}

async function ensureSurfaceCapabilityAssets(document, window, capabilityAssets) {
  const assets = normalizeCapabilityAssets(capabilityAssets);
  const readyStart = Array.isArray(window?.__surfaceCapabilityReadyPromises)
    ? window.__surfaceCapabilityReadyPromises.length
    : 0;
  const hookStart = Array.isArray(window?.__surfaceCapabilityBootHooks)
    ? window.__surfaceCapabilityBootHooks.length
    : 0;
  const registry = window?.__surfaceCapabilityAssetRegistry && typeof window.__surfaceCapabilityAssetRegistry === "object"
    ? window.__surfaceCapabilityAssetRegistry
    : (window.__surfaceCapabilityAssetRegistry = {
        stylesheets: new Set(),
        scripts: new Set(),
        inlineStyles: new Set(),
        inlineModules: new Set()
      });
  const head = document?.head ?? document?.documentElement ?? document?.body ?? null;
  if (!head) return;

  for (const href of assets.stylesheetHrefs) {
    if (registry.stylesheets.has(href)) continue;
    if (typeof document?.querySelector === "function" && document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
      registry.stylesheets.add(href);
      continue;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    head.appendChild(link);
    registry.stylesheets.add(href);
  }

  for (const cssText of assets.inlineCss) {
    const key = capabilityAssetHash(cssText);
    if (registry.inlineStyles.has(key)) continue;
    if (typeof document?.querySelector === "function" && document.querySelector(`style[data-surface-capability-style="${key}"]`)) {
      registry.inlineStyles.add(key);
      continue;
    }
    const style = document.createElement("style");
    style.setAttribute("data-surface-capability-style", key);
    style.textContent = cssText;
    head.appendChild(style);
    registry.inlineStyles.add(key);
  }

  for (const src of assets.scriptSrcs) {
    if (registry.scripts.has(src)) continue;
    if (typeof document?.querySelector === "function" && document.querySelector(`script[src="${src}"]`)) {
      registry.scripts.add(src);
      continue;
    }
    const script = document.createElement("script");
    script.src = src;
    head.appendChild(script);
    await waitForNodeLoad(script);
    registry.scripts.add(src);
  }

  for (const moduleSource of assets.scriptBodies) {
    const key = capabilityAssetHash(moduleSource);
    if (registry.inlineModules.has(key)) continue;
    if (typeof document?.querySelector === "function" && document.querySelector(`script[data-surface-capability-module="${key}"]`)) {
      registry.inlineModules.add(key);
      continue;
    }
    const script = document.createElement("script");
    script.type = "module";
    script.setAttribute("data-surface-capability-module", key);
    script.textContent = moduleSource;
    head.appendChild(script);
    registry.inlineModules.add(key);
  }
  if (assets.scriptBodies.length) {
    await waitForSurfaceCapabilityModuleRegistration(window, { readyStart, hookStart });
  }
  await waitForSurfaceCapabilityModuleSettle(window, { readyStart, hookStart });
  const readyQueue = Array.isArray(window?.__surfaceCapabilityReadyPromises)
    ? window.__surfaceCapabilityReadyPromises.slice(readyStart)
    : [];
  if (readyQueue.length) {
    await Promise.all(readyQueue.map(promise => Promise.resolve(promise)));
  }
  await waitForSurfaceCapabilityModuleSettle(window, { readyStart, hookStart });
}

function surfaceAssetRegistrySnapshot(window) {
  const registry = window?.__surfaceCapabilityAssetRegistry && typeof window.__surfaceCapabilityAssetRegistry === "object"
    ? window.__surfaceCapabilityAssetRegistry
    : null;
  const list = value => value instanceof Set ? [...value] : [];
  return {
    stylesheets: list(registry?.stylesheets),
    scripts: list(registry?.scripts),
    inlineStyles: list(registry?.inlineStyles),
    inlineModules: list(registry?.inlineModules)
  };
}

function createSurfaceInspectionPoint({ window, manifest, runtime }) {
  const fetchServerDiagnostics = async () => {
    const fetchImpl = typeof window?.fetch === "function" ? window.fetch.bind(window) : null;
    if (!fetchImpl) return null;
    const response = await fetchImpl("/api/runtime/diagnostics", {
      headers: { accept: "application/json" }
    });
    if (!response?.ok) {
      throw new Error(`runtime diagnostics fetch failed (${response?.status ?? "unknown"})`);
    }
    return await response.json();
  };
  const inspection = {
    kind: "surface-runtime-inspection",
    diagnosticsUrl: "/api/runtime/diagnostics",
    get manifest() {
      return cloneInspectionValue(manifest);
    },
    get activeSurfaceId() {
      return runtime?.activeSurfaceId ?? manifest?.activeSurfaceId ?? null;
    },
    get surfaceIds() {
      return typeof runtime?.surfaceIds !== "undefined"
        ? cloneInspectionValue(runtime.surfaceIds)
        : (manifest?.surfaces ?? []).map(surface => surface.id);
    },
    get routeTargets() {
      return typeof runtime?.routeTargets !== "undefined"
        ? cloneInspectionValue(runtime.routeTargets)
        : cloneInspectionValue(manifest?.routeTargets ?? []);
    },
    get runtimeIds() {
      return cloneInspectionValue(manifest?.diagnostics?.includedRuntimeIds ?? []);
    },
    get browserRuntimeCapabilities() {
      return cloneInspectionValue(manifest?.browserRuntimeCapabilities ?? []);
    },
    get capabilityAssets() {
      return cloneInspectionValue(manifest?.capabilityAssets ?? null);
    },
    get loadedCapabilityAssets() {
      return surfaceAssetRegistrySnapshot(window);
    },
    get capabilityBootHookCount() {
      return Array.isArray(window?.__surfaceCapabilityBootHooks)
        ? window.__surfaceCapabilityBootHooks.length
        : 0;
    },
    get routeDebugLog() {
      return typeof runtime?.routeDebugLog !== "undefined"
        ? cloneInspectionValue(runtime.routeDebugLog)
        : [];
    },
    get lastRouteSwap() {
      return cloneInspectionValue(runtime?.lastRouteSwap ?? null);
    },
    get issues() {
      return cloneInspectionValue(typeof runtime?.issues !== "undefined" ? runtime.issues : []);
    },
    get latestProbe() {
      return cloneInspectionValue(runtime?.latestProbe ?? null);
    },
    get expectationProviderCount() {
      return Number(runtime?.expectationProviderCount ?? 0);
    },
    get process() {
      const processRuntime = runtime?.processRuntime ?? null;
      if (!processRuntime) return null;
      return {
        counts: cloneInspectionValue(processRuntime.counts ?? null),
        inFlightCount: Number(processRuntime.inFlightCount ?? 0),
        state: cloneInspectionValue(typeof processRuntime.snapshot === "function" ? processRuntime.snapshot() : null),
        derives: cloneInspectionValue(typeof processRuntime.derives === "function" ? processRuntime.derives() : null),
        traceLength: Array.isArray(processRuntime.trace) ? processRuntime.trace.length : 0
      };
    },
    inspect() {
      return {
        kind: this.kind,
        activeSurfaceId: this.activeSurfaceId,
        surfaceIds: this.surfaceIds,
        routeTargets: this.routeTargets,
        runtimeIds: this.runtimeIds,
        browserRuntimeCapabilities: this.browserRuntimeCapabilities,
        capabilityAssets: this.capabilityAssets,
        loadedCapabilityAssets: this.loadedCapabilityAssets,
        capabilityBootHookCount: this.capabilityBootHookCount,
        lastRouteSwap: this.lastRouteSwap,
        routeDebugLog: this.routeDebugLog,
        issues: this.issues,
        latestProbe: this.latestProbe,
        expectationProviderCount: this.expectationProviderCount,
        process: this.process,
        manifestDiagnostics: cloneInspectionValue(manifest?.diagnostics ?? null)
      };
    },
    async rerunProbe() {
      return runtime?.rerunProbe ? await runtime.rerunProbe() : null;
    },
    clearIssues() {
      return runtime?.clearIssues ? runtime.clearIssues() : null;
    },
    async refreshServerDiagnostics() {
      const diagnostics = await fetchServerDiagnostics();
      this.serverDiagnostics = diagnostics;
      return diagnostics;
    },
    serverDiagnostics: null
  };
  return inspection;
}

function installSurfaceInspectionPoint(window, manifest, runtime) {
  if (!window || typeof window !== "object") return null;
  const inspection = createSurfaceInspectionPoint({ window, manifest, runtime });
  window.world = inspection;
  window.witnessWorld = inspection;
  window.__surfaceRuntimeInspection = inspection;
  if (typeof window.fetch === "function") {
    Promise.resolve(inspection.refreshServerDiagnostics()).catch(error => {
      inspection.serverDiagnosticsError = {
        name: error?.name || "Error",
        message: String(error?.message || error)
      };
    });
  }
  return inspection;
}

function surfaceDiagnosticsOverlayEnabled(window) {
  const explicit = window?.__surfaceRuntimeDiagnosticsOverlay;
  if (explicit === true) return true;
  if (explicit === false) return false;
  const href = trimString(window?.location?.href);
  if (href) {
    try {
      const url = new URL(href, "http://localhost");
      const mode = trimString(url.searchParams.get("surfaceDiagnostics"));
      if (mode === "1" || mode === "true") return true;
      if (mode === "0" || mode === "false") return false;
    } catch {}
  }
  const hostname = trimString(window?.location?.hostname);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function createSurfaceRuntimeIssueLedger() {
  const issues = [];
  const listeners = new Set();
  let sequence = 0;
  const notify = () => {
    const snapshot = issues.map(issue => cloneInspectionValue(issue));
    for (const listener of listeners) listener(snapshot);
  };
  const byId = id => issues.findIndex(issue => issue.id === id);
  return {
    nextCorrelationId(prefix = "issue") {
      sequence += 1;
      return `${String(prefix || "issue").trim() || "issue"}:${sequence}`;
    },
    upsert(input = {}) {
      const id = trimString(input.id) || `runtime-issue:${this.nextCorrelationId("auto")}`;
      const now = Date.now();
      const next = {
        id,
        severity: trimString(input.severity) || "error",
        phase: trimString(input.phase) || "runtime",
        kind: trimString(input.kind) || "runtime",
        message: String(input.message ?? ""),
        details: input.details ?? null,
        surfaceId: trimString(input.surfaceId),
        processRef: trimString(input.processRef),
        route: trimString(input.route),
        capability: trimString(input.capability),
        targetId: trimString(input.targetId),
        correlationId: trimString(input.correlationId),
        status: trimString(input.status) || "active"
      };
      const index = byId(id);
      if (index >= 0) {
        const previous = issues[index];
        issues[index] = {
          ...previous,
          ...next,
          at: previous.at ?? now,
          updatedAt: now,
          resolvedAt: next.status === "resolved"
            ? (previous.resolvedAt ?? now)
            : null
        };
      } else {
        issues.push({
          ...next,
          at: now,
          updatedAt: now,
          resolvedAt: next.status === "resolved" ? now : null
        });
      }
      notify();
      return cloneInspectionValue(issues[byId(id)]);
    },
    resolve(id, updates = {}) {
      const trimmed = trimString(id);
      if (!trimmed) return null;
      const index = byId(trimmed);
      if (index < 0) return null;
      const now = Date.now();
      issues[index] = {
        ...issues[index],
        ...updates,
        id: trimmed,
        status: "resolved",
        updatedAt: now,
        resolvedAt: issues[index].resolvedAt ?? now
      };
      notify();
      return cloneInspectionValue(issues[index]);
    },
    clear() {
      issues.splice(0, issues.length);
      notify();
    },
    list() {
      return issues.map(issue => cloneInspectionValue(issue));
    },
    active() {
      return issues.filter(issue => issue.status !== "resolved").map(issue => cloneInspectionValue(issue));
    },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

function surfaceRuntimeIssueSeverityRank(severity) {
  if (severity === "error") return 3;
  if (severity === "warning") return 2;
  return 1;
}

function summarizeSurfaceRuntimeIssues(issues = []) {
  const summary = {
    total: 0,
    active: 0,
    resolved: 0,
    bySeverity: { error: 0, warning: 0, info: 0 },
    worstSeverity: null
  };
  for (const issue of issues ?? []) {
    summary.total += 1;
    if (issue?.status === "resolved") summary.resolved += 1;
    else summary.active += 1;
    const severity = trimString(issue?.severity) || "info";
    if (!Object.prototype.hasOwnProperty.call(summary.bySeverity, severity)) summary.bySeverity[severity] = 0;
    summary.bySeverity[severity] += 1;
    if (!summary.worstSeverity || surfaceRuntimeIssueSeverityRank(severity) > surfaceRuntimeIssueSeverityRank(summary.worstSeverity)) {
      summary.worstSeverity = severity;
    }
  }
  return summary;
}

function summarizeSurfaceRuntimeExpectationIssues(issues = []) {
  const summary = {
    total: 0,
    bySeverity: { error: 0, warning: 0, info: 0 }
  };
  for (const issue of issues ?? []) {
    summary.total += 1;
    const severity = trimString(issue?.severity) || "info";
    if (!Object.prototype.hasOwnProperty.call(summary.bySeverity, severity)) summary.bySeverity[severity] = 0;
    summary.bySeverity[severity] += 1;
  }
  return summary;
}

function ensureSurfaceDiagnosticsOverlayStyles(document) {
  if (!document?.createElement || !document?.head?.appendChild) return null;
  const existing = document.getElementById?.("surface-runtime-diagnostics-style");
  if (existing) return existing;
  const style = document.createElement("style");
  style.id = "surface-runtime-diagnostics-style";
  style.textContent = `
#surface-runtime-diagnostics-root { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; font: 12px/1.4 system-ui, sans-serif; }
#surface-runtime-diagnostics-root[hidden] { display: none; }
#surface-runtime-diagnostics-fab { min-width: 56px; min-height: 56px; border-radius: 999px; border: 1px solid rgba(255,255,255,.12); color: #fff; background: #334155; box-shadow: 0 10px 30px rgba(0,0,0,.35); cursor: pointer; padding: 0 14px; font-weight: 700; }
#surface-runtime-diagnostics-fab.surface-runtime-diagnostics-severity-error { background: #991b1b; }
#surface-runtime-diagnostics-fab.surface-runtime-diagnostics-severity-warning { background: #92400e; }
#surface-runtime-diagnostics-fab.surface-runtime-diagnostics-severity-info { background: #1d4ed8; }
#surface-runtime-diagnostics-panel { position: absolute; right: 0; bottom: 72px; width: min(520px, calc(100vw - 32px)); max-height: min(70vh, 720px); overflow: auto; border-radius: 14px; background: rgba(15,23,42,.98); color: #e2e8f0; border: 1px solid rgba(148,163,184,.28); box-shadow: 0 18px 48px rgba(0,0,0,.42); padding: 14px; }
#surface-runtime-diagnostics-panel[hidden] { display: none; }
.surface-runtime-diagnostics-summary { font-weight: 700; margin-bottom: 8px; }
.surface-runtime-diagnostics-meta { color: #94a3b8; margin-bottom: 8px; white-space: pre-wrap; }
.surface-runtime-diagnostics-actions { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.surface-runtime-diagnostics-actions button { border-radius: 10px; border: 1px solid rgba(148,163,184,.28); background: #1e293b; color: #e2e8f0; padding: 6px 10px; cursor: pointer; }
.surface-runtime-diagnostics-list { display: grid; gap: 8px; }
.surface-runtime-diagnostics-item { border: 1px solid rgba(148,163,184,.18); border-radius: 10px; padding: 10px; background: rgba(30,41,59,.75); }
.surface-runtime-diagnostics-item.surface-runtime-diagnostics-status-resolved { opacity: .72; }
.surface-runtime-diagnostics-item.surface-runtime-diagnostics-severity-error { border-color: rgba(248,113,113,.55); }
.surface-runtime-diagnostics-item.surface-runtime-diagnostics-severity-warning { border-color: rgba(251,191,36,.45); }
.surface-runtime-diagnostics-item.surface-runtime-diagnostics-severity-info { border-color: rgba(96,165,250,.35); }
.surface-runtime-diagnostics-item-head { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; }
.surface-runtime-diagnostics-item-meta { color: #94a3b8; margin-top: 4px; white-space: pre-wrap; }
`;
  document.head.appendChild(style);
  return style;
}

function createSurfaceDiagnosticsOverlay({ document, window, inspection, issueLedger, enabled = false } = {}) {
  if (!enabled || !document?.createElement || !document?.body?.appendChild) {
    return { render() {}, destroy() {} };
  }
  const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  ensureSurfaceDiagnosticsOverlayStyles(document);
  const root = document.createElement("div");
  root.id = "surface-runtime-diagnostics-root";
  root.hidden = true;
  const fab = document.createElement("button");
  fab.id = "surface-runtime-diagnostics-fab";
  fab.type = "button";
  const panel = document.createElement("div");
  panel.id = "surface-runtime-diagnostics-panel";
  panel.hidden = true;
  const summary = document.createElement("div");
  summary.className = "surface-runtime-diagnostics-summary";
  const meta = document.createElement("div");
  meta.className = "surface-runtime-diagnostics-meta";
  const actions = document.createElement("div");
  actions.className = "surface-runtime-diagnostics-actions";
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copy JSON";
  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Clear";
  const rerunButton = document.createElement("button");
  rerunButton.type = "button";
  rerunButton.textContent = "Rerun Probe";
  const list = document.createElement("div");
  list.className = "surface-runtime-diagnostics-list";
  actions.appendChild(copyButton);
  actions.appendChild(clearButton);
  actions.appendChild(rerunButton);
  panel.appendChild(summary);
  panel.appendChild(meta);
  panel.appendChild(actions);
  panel.appendChild(list);
  root.appendChild(fab);
  root.appendChild(panel);
  document.body.appendChild(root);
  let open = false;
  const toggle = () => {
    open = !open;
    panel.hidden = !open;
  };
  fab.addEventListener?.("click", toggle);
  copyButton.addEventListener?.("click", async () => {
    const payload = typeof inspection?.inspect === "function" ? inspection.inspect() : null;
    const json = JSON.stringify(payload, null, 2);
    if (window?.navigator?.clipboard?.writeText) {
      try {
        await window.navigator.clipboard.writeText(json);
      } catch {}
    }
  });
  clearButton.addEventListener?.("click", () => inspection?.clearIssues?.());
  rerunButton.addEventListener?.("click", () => inspection?.rerunProbe?.());
  const render = () => {
    const issues = typeof issueLedger?.list === "function" ? issueLedger.list() : [];
    const summaryState = summarizeSurfaceRuntimeIssues(issues);
    root.hidden = issues.length === 0;
    fab.className = `surface-runtime-diagnostics-severity-${summaryState.worstSeverity || "info"}`;
    fab.textContent = summaryState.active > 0
      ? `Issues ${summaryState.active}`
      : `Issues ${summaryState.total}`;
    summary.textContent = `Runtime issues: ${summaryState.active} active / ${summaryState.resolved} resolved`;
    meta.textContent = [
      `route: ${trimString(window?.location?.pathname) || "/"}`,
      `active surface: ${trimString(inspection?.activeSurfaceId) || "-"}`,
      `process refs: ${((inspection?.latestProbe?.currentProcessRefs ?? []).join(", ")) || "-"}`
    ].join("\n");
    list.innerHTML = issues.map(issue => {
      const details = issue?.details == null
        ? ""
        : (typeof issue.details === "string" ? issue.details : JSON.stringify(issue.details));
      return `<div class="surface-runtime-diagnostics-item surface-runtime-diagnostics-severity-${escapeHtml(issue.severity || "info")} surface-runtime-diagnostics-status-${escapeHtml(issue.status || "active")}">
  <div class="surface-runtime-diagnostics-item-head"><span>${escapeHtml(issue.message || issue.kind || issue.id)}</span><span>${escapeHtml(issue.severity || "info")} / ${escapeHtml(issue.status || "active")}</span></div>
  <div class="surface-runtime-diagnostics-item-meta">${escapeHtml([
    issue.phase ? `phase=${issue.phase}` : "",
    issue.surfaceId ? `surface=${issue.surfaceId}` : "",
    issue.processRef ? `process=${issue.processRef}` : "",
    issue.targetId ? `target=${issue.targetId}` : "",
    issue.route ? `route=${issue.route}` : "",
    issue.correlationId ? `corr=${issue.correlationId}` : ""
  ].filter(Boolean).join(" | "))}</div>
  ${details ? `<div class="surface-runtime-diagnostics-item-meta">${escapeHtml(details)}</div>` : ""}
</div>`;
    }).join("");
  };
  const unsubscribe = issueLedger?.subscribe?.(() => render()) ?? (() => {});
  render();
  return {
    render,
    destroy() {
      unsubscribe();
      root.parentNode?.removeChild?.(root);
    }
  };
}

function installSurfaceRuntimeBootFailure({ document, window, manifest, error }) {
  const issueLedger = createSurfaceRuntimeIssueLedger();
  const runtime = {
    blocked: {
      limitationType: "runtime",
      missingPrimitive: "surface runtime boot",
      reason: String(error?.message || error)
    },
    latestProbe: null,
    issues: [],
    expectationProviderCount: 0,
    rerunProbe: async () => null,
    clearIssues() {
      issueLedger.clear();
      return [];
    },
    refresh() {
      return Promise.resolve(null);
    },
    get activeSurfaceId() {
      return trimString(manifest?.activeSurfaceId);
    },
    get manifestDiagnostics() {
      return manifest?.diagnostics ?? null;
    },
    get routeTargets() {
      return manifest?.routeTargets ?? [];
    },
    get surfaceIds() {
      return (manifest?.surfaces ?? []).map(surface => surface.id);
    },
    get lastRouteSwap() {
      return null;
    },
    get routeDebugLog() {
      return [];
    },
    get processRuntime() {
      return null;
    },
    destroy() {}
  };
  issueLedger.subscribe(issues => {
    runtime.issues = issues;
  });
  const inspection = installSurfaceInspectionPoint(window, manifest ?? {}, runtime);
  const overlay = createSurfaceDiagnosticsOverlay({
    document,
    window,
    inspection,
    issueLedger,
    enabled: surfaceDiagnosticsOverlayEnabled(window)
  });
  issueLedger.upsert({
    id: "surface-runtime:boot-exception",
    severity: "error",
    phase: "boot",
    kind: "runtime-boot-failure",
    message: "Surface interaction runtime boot failed",
    details: {
      name: error?.name || "Error",
      message: String(error?.message || error),
      stack: String(error?.stack || "")
    },
    correlationId: issueLedger.nextCorrelationId("boot")
  });
  runtime.destroy = () => overlay.destroy();
  return runtime;
}

function clearRouteUnderlay(document) {
  const layer = document?.getElementById?.("surface-route-underlay");
  if (layer?.parentNode) layer.parentNode.removeChild(layer);
}

function mountedCapabilityMarkersForSurface(document, surface) {
  const rootId = trimString(surface?.view?.rootId);
  const nodes = [];
  const seen = new Set();
  const addNode = node => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    nodes.push(node);
  };
  const root = rootId ? document?.getElementById?.(rootId) : null;
  addNode(root);
  if (root && typeof root.querySelectorAll === "function") {
    for (const node of root.querySelectorAll("[data-surface-id]")) addNode(node);
  }
  const surfaceId = trimString(surface?.id);
  if (surfaceId && typeof document?.querySelectorAll === "function") {
    for (const node of document.querySelectorAll(`[data-surface-id="${surfaceId}"]`)) addNode(node);
  }
  const controller = nodes.some(node => Boolean(node?.__surfaceCapabilityController));
  const outputs = nodes.some(node => Boolean(node?.__surfaceCapabilityOutputs));
  return {
    rootId,
    mounted: controller || outputs,
    outputs,
    controller
  };
}

function surfaceViewNodeIds(surface) {
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

function surfaceIsPresentInDom(document, surface) {
  return surfaceViewNodeIds(surface).some(id => Boolean(document?.getElementById?.(id)));
}

function capabilityAssetPresence(expected, loaded) {
  const missing = {
    stylesheetHrefs: [],
    scriptSrcs: [],
    inlineCss: [],
    scriptBodies: []
  };
  const loadedStylesheets = new Set(loaded?.stylesheets ?? []);
  const loadedScripts = new Set(loaded?.scripts ?? []);
  const loadedInlineStyles = new Set(loaded?.inlineStyles ?? []);
  const loadedInlineModules = new Set(loaded?.inlineModules ?? []);
  for (const href of expected?.stylesheetHrefs ?? []) {
    if (!loadedStylesheets.has(href)) missing.stylesheetHrefs.push(href);
  }
  for (const src of expected?.scriptSrcs ?? []) {
    if (!loadedScripts.has(src)) missing.scriptSrcs.push(src);
  }
  for (const cssText of expected?.inlineCss ?? []) {
    const key = capabilityAssetHash(cssText);
    if (!loadedInlineStyles.has(key)) missing.inlineCss.push(key);
  }
  for (const source of expected?.scriptBodies ?? []) {
    const key = capabilityAssetHash(source);
    if (!loadedInlineModules.has(key)) missing.scriptBodies.push(key);
  }
  return missing;
}

function createSurfaceRuntimeProbe({
  document,
  window,
  manifest,
  surfaceById,
  activeSurfaceId,
  processRuntime,
  issueLedger,
  boundInteractionCount = 0,
  expectationProviders = []
} = {}) {
  const activeIds = activeRuntimeSurfaceIds(surfaceById, activeSurfaceId);
  const activeSurfaces = [...activeIds].map(id => surfaceById.get(id)).filter(Boolean);
  const currentSurface = surfaceById.get(activeSurfaceId) || null;
  const currentRootId = trimString(currentSurface?.view?.rootId);
  const currentRoot = (currentRootId ? document?.getElementById?.(currentRootId) : null)
    ?? fallbackActiveRootNode(document);
  const currentProcessRefs = [...new Set(activeSurfaces
    .map(surface => resolveSurfaceRuntimeBinding(manifest, surface.id).processRef)
    .filter(Boolean))];
  const missingInteractionTargets = [];
  const missingBindingTargets = [];
  const missingProcessBindings = [];
  const missingCapabilities = [];
  const missingCapabilityControllers = [];
  const missingCapabilityOutputs = [];
  const capabilityMarkers = new Map(
    activeSurfaces.map(surface => [surface.id, mountedCapabilityMarkersForSurface(document, surface)])
  );
  for (const surface of activeSurfaces) {
    const present = surfaceIsPresentInDom(document, surface);
    const binding = resolveSurfaceRuntimeBinding(manifest, surface.id);
    const hasInteractiveMeaning = (surface?.runtime?.interactions?.length ?? 0) > 0 || (surface?.runtime?.bindings?.length ?? 0) > 0;
    if (present && hasInteractiveMeaning && !binding.processRef) {
      missingProcessBindings.push({ surfaceId: surface.id });
    }
    const capabilities = resolveSurfaceCapabilities(binding, manifest?.browserRuntimeCapabilities);
    if (present && capabilities.missing.length) {
      missingCapabilities.push({ surfaceId: surface.id, capabilities: capabilities.missing });
    }
    const marker = capabilityMarkers.get(surface.id) ?? mountedCapabilityMarkersForSurface(document, surface);
    if (present && (surface?.runtime?.capabilityRefs?.length ?? 0) > 0 && !marker.controller) {
      missingCapabilityControllers.push({ surfaceId: surface.id, rootId: marker.rootId ?? null });
    }
    if (!present) continue;
    for (const interaction of surface?.runtime?.interactions ?? []) {
      const targetKey = trimString(interaction?.target);
      const targets = targetKey ? (surface?.view?.interactionTargets?.[targetKey] ?? []) : [];
      if (!targets.length) {
        missingInteractionTargets.push({ surfaceId: surface.id, targetKey, targetId: null });
        continue;
      }
      for (const target of targets) {
        const targetId = trimString(target?.id);
        if (!targetId || !document?.getElementById?.(targetId)) {
          missingInteractionTargets.push({ surfaceId: surface.id, targetKey, targetId });
        }
      }
    }
    for (const bindingSpec of surface?.runtime?.bindings ?? []) {
      const prop = trimString(bindingSpec?.prop);
      const targets = prop ? (surface?.view?.propTargets?.[prop] ?? []) : [];
      if (!targets.length) {
        missingBindingTargets.push({ surfaceId: surface.id, prop, targetId: null });
        continue;
      }
      for (const target of targets) {
        const targetId = trimString(target?.id);
        if (!targetId || !document?.getElementById?.(targetId)) {
          missingBindingTargets.push({ surfaceId: surface.id, prop, targetId });
        }
      }
    }
    const capabilitySources = (surface?.runtime?.bindings ?? [])
      .filter(bindingSpec => bindingSpec?.source?.kind === "capability")
      .map(bindingSpec => ({
        dependentSurfaceId: surface.id,
        sourceSurfaceId: trimString(bindingSpec?.source?.surface),
        output: trimString(bindingSpec?.source?.output)
      }))
      .filter(entry => entry.sourceSurfaceId && entry.output);
    for (const source of capabilitySources) {
      const sourceMarker = capabilityMarkers.get(source.sourceSurfaceId)
        ?? mountedCapabilityMarkersForSurface(document, surfaceById.get(source.sourceSurfaceId) ?? { id: source.sourceSurfaceId });
      if (!sourceMarker.outputs) {
        missingCapabilityOutputs.push({
          surfaceId: surface.id,
          rootId: sourceMarker.rootId,
          sourceSurfaceId: source.sourceSurfaceId,
          output: source.output
        });
      }
    }
  }
  const activeRouteTarget = activeRouteTargetForPath(manifest, window?.location?.pathname);
  const routeStateTarget = routeTargetForManifestState(manifest, processRuntime);
  const loadedCapabilityAssets = surfaceAssetRegistrySnapshot(window);
  const missingCapabilityAssets = capabilityAssetPresence(normalizeCapabilityAssets(manifest?.capabilityAssets), loadedCapabilityAssets);
  const mountedCapabilitiesBySurface = activeSurfaces
    .filter(surface => (surface?.runtime?.capabilityRefs?.length ?? 0) > 0 && surfaceIsPresentInDom(document, surface))
    .map(surface => ({
      surfaceId: surface.id,
      capabilities: [...surface.runtime.capabilityRefs],
      ...(capabilityMarkers.get(surface.id) ?? mountedCapabilityMarkersForSurface(document, surface))
    }));
  const snapshot = {
    at: Date.now(),
    routePathname: trimString(window?.location?.pathname) || "/",
    activeSurfaceId: trimString(activeSurfaceId),
    rootNodeId: trimString(currentRoot?.id) || null,
    currentProcessRefs,
    processState: cloneInspectionValue(typeof processRuntime?.snapshot === "function" ? processRuntime.snapshot() : null),
    processDerives: cloneInspectionValue(typeof processRuntime?.derives === "function" ? processRuntime.derives() : null),
    routeState: cloneInspectionValue(resolveRouteStateDescriptor(manifest)),
    boundInteractionCount: Number(boundInteractionCount || 0),
    missingInteractionTargets,
    missingBindingTargets,
    missingProcessBindings,
    missingCapabilities,
    missingCapabilityControllers,
    missingCapabilityOutputs,
    activeRouteTarget: cloneInspectionValue(activeRouteTarget),
    routeStateTarget: cloneInspectionValue(routeStateTarget),
    loadedCapabilityAssets,
    missingCapabilityAssets,
    mountedCapabilitiesBySurface,
    issues: typeof issueLedger?.list === "function" ? issueLedger.list() : []
  };
  const expectationIssues = [];
  for (const provider of expectationProviders ?? []) {
    if (typeof provider !== "function") continue;
    try {
      const issues = provider(snapshot, {
        manifest,
        activeSurfaceId,
        routePathname: snapshot.routePathname
      });
      if (Array.isArray(issues)) expectationIssues.push(...issues);
    } catch (error) {
      expectationIssues.push({
        id: `expectation-provider-failure:${expectationIssues.length}`,
        severity: "warning",
        phase: "settle-probe",
        kind: "expectation-provider-failure",
        message: "Surface expectation provider failed",
        details: String(error?.message || error)
      });
    }
  }
  snapshot.expectationIssues = expectationIssues;
  snapshot.expectationSummary = summarizeSurfaceRuntimeExpectationIssues(expectationIssues);
  return snapshot;
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
  createProcessRuntimeImpl,
  expectationProviders = []
}) {
  const processRuntimeFactory = typeof createProcessRuntimeImpl === "function"
    ? createProcessRuntimeImpl
    : (() => {
        throw new Error("createProcessRuntime implementation required");
      });
  const issueLedger = createSurfaceRuntimeIssueLedger();
  const diagnosticsOverlayEnabled = surfaceDiagnosticsOverlayEnabled(window);
  const runtimeDisposers = [];
  const runtime = {
    blocked: undefined,
    latestProbe: null,
    issues: issueLedger.list(),
    issueLedger,
    expectationProviderCount: Array.isArray(expectationProviders) ? expectationProviders.filter(provider => typeof provider === "function").length : 0,
    rerunProbe: async () => runtime.latestProbe,
    clearIssues() {
      issueLedger.clear();
      return [];
    },
    refresh() {
      return Promise.resolve(null);
    },
    get activeSurfaceId() {
      return trimString(manifest?.activeSurfaceId);
    },
    get manifestDiagnostics() {
      return manifest?.diagnostics ?? null;
    },
    get routeTargets() {
      return manifest?.routeTargets ?? [];
    },
    get surfaceIds() {
      return (manifest?.surfaces ?? []).map(surface => surface.id);
    },
    get lastRouteSwap() {
      return null;
    },
    get routeDebugLog() {
      return [];
    },
    get processRuntime() {
      return null;
    },
    destroy() {
      for (const dispose of runtimeDisposers.splice(0)) dispose();
    }
  };
  issueLedger.subscribe(issues => {
    runtime.issues = issues;
  });
  const inspection = installSurfaceInspectionPoint(window, manifest, runtime);
  const diagnosticsOverlay = createSurfaceDiagnosticsOverlay({
    document,
    window,
    inspection,
    issueLedger,
    enabled: diagnosticsOverlayEnabled
  });
  runtimeDisposers.push(() => diagnosticsOverlay.destroy());
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
    runtime.blocked = {
      limitationType: "platform",
      missingPrimitive: "generic surface interaction target descriptors",
      reason: "interactive surface execution cannot proceed until the host emits generic interaction target descriptors instead of surface-kind-specific conventions"
    };
    issueLedger.upsert({
      id: "surface-runtime:missing-interaction-target-descriptors",
      severity: "error",
      phase: "boot",
      kind: "blocked-runtime",
      message: "Surface interaction runtime blocked: missing generic interaction target descriptors",
      details: runtime.blocked.reason,
      correlationId: issueLedger.nextCorrelationId("boot")
    });
    return runtime;
  }
  const disposers = [];
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
  const probeManagedIssueIds = new Set();
  const reportIssue = issue => issueLedger.upsert({
    route: trimString(window?.location?.pathname) || "/",
    ...issue
  });
  const resolveIssue = (id, updates = {}) => issueLedger.resolve(id, {
    route: trimString(window?.location?.pathname) || "/",
    ...updates
  });
  const bootActiveSurfaceCapabilities = (phase = "capability-mount", correlationId = issueLedger.nextCorrelationId("capability-mount")) => {
    const currentSurface = surfaceById.get(activeSurfaceId) || null;
    const rootId = trimString(currentSurface?.view?.rootId);
    const root = (rootId ? document?.getElementById?.(rootId) : null) ?? fallbackActiveRootNode(document);
    bootSurfaceCapabilities(window, root, {
      reportIssue,
      resolveIssue,
      phase,
      correlationId
    });
  };
  const syncProbeIssues = (snapshot, phase, correlationId) => {
    const nextManaged = new Set();
    const manage = issue => {
      const nextIssue = {
        phase,
        correlationId,
        severity: "warning",
        ...issue
      };
      nextManaged.add(nextIssue.id);
      reportIssue(nextIssue);
    };
    if (!snapshot.rootNodeId) {
      manage({
        id: `surface-runtime:missing-active-root:${snapshot.activeSurfaceId || "unknown"}`,
        severity: "error",
        kind: "missing-active-root",
        message: "Active surface root node is missing",
        surfaceId: snapshot.activeSurfaceId,
        details: { rootNodeId: snapshot.rootNodeId }
      });
    }
    if (snapshot.activeRouteTarget && snapshot.activeRouteTarget.surfaceId !== snapshot.activeSurfaceId) {
      manage({
        id: `surface-runtime:url-surface-mismatch:${snapshot.activeSurfaceId || "unknown"}`,
        severity: "error",
        kind: "route-state-mismatch",
        message: "URL-selected route surface does not match the active surface",
        surfaceId: snapshot.activeSurfaceId,
        details: {
          activeRouteSurfaceId: snapshot.activeRouteTarget.surfaceId,
          activeSurfaceId: snapshot.activeSurfaceId
        }
      });
    }
    if (snapshot.routeStateTarget && snapshot.routeStateTarget.surfaceId !== snapshot.activeSurfaceId) {
      manage({
        id: `surface-runtime:route-state-surface-mismatch:${snapshot.activeSurfaceId || "unknown"}`,
        severity: "error",
        kind: "route-state-mismatch",
        message: "Authored route state does not match the active surface",
        surfaceId: snapshot.activeSurfaceId,
        details: {
          routeStateSurfaceId: snapshot.routeStateTarget.surfaceId,
          activeSurfaceId: snapshot.activeSurfaceId
        }
      });
    }
    for (const entry of snapshot.missingProcessBindings ?? []) {
      manage({
        id: `surface-runtime:missing-process:${entry.surfaceId}`,
        severity: "error",
        kind: "missing-process-binding",
        message: "Interactive surface did not resolve an owning process",
        surfaceId: entry.surfaceId
      });
    }
    for (const entry of snapshot.missingInteractionTargets ?? []) {
      manage({
        id: `surface-runtime:missing-interaction-target:${entry.surfaceId}:${entry.targetKey || "self"}:${entry.targetId || "unresolved"}`,
        severity: "error",
        kind: "missing-interaction-target",
        message: "Declared interaction target did not resolve to a DOM node",
        surfaceId: entry.surfaceId,
        targetId: entry.targetId,
        details: { targetKey: entry.targetKey ?? null }
      });
    }
    for (const entry of snapshot.missingBindingTargets ?? []) {
      manage({
        id: `surface-runtime:missing-binding-target:${entry.surfaceId}:${entry.prop || "prop"}:${entry.targetId || "unresolved"}`,
        severity: "warning",
        kind: "missing-binding-target",
        message: "Declared binding target did not resolve to a DOM node",
        surfaceId: entry.surfaceId,
        targetId: entry.targetId,
        details: { prop: entry.prop ?? null }
      });
    }
    for (const entry of snapshot.missingCapabilities ?? []) {
      manage({
        id: `surface-runtime:missing-capabilities:${entry.surfaceId}`,
        severity: "error",
        kind: "missing-capabilities",
        message: "Surface interaction runtime is missing required browser capabilities",
        surfaceId: entry.surfaceId,
        details: { capabilities: entry.capabilities }
      });
    }
    for (const entry of snapshot.missingCapabilityControllers ?? []) {
      manage({
        id: `surface-runtime:missing-capability-controller:${entry.surfaceId}`,
        severity: "error",
        kind: "missing-capability-controller",
        message: "Capability surface settled without a mounted capability controller",
        surfaceId: entry.surfaceId,
        details: { rootId: entry.rootId ?? null }
      });
    }
    for (const entry of snapshot.missingCapabilityOutputs ?? []) {
      manage({
        id: `surface-runtime:missing-capability-outputs:${entry.surfaceId}`,
        severity: "warning",
        kind: "missing-capability-outputs",
        message: "Capability-backed bindings settled without capability outputs",
        surfaceId: entry.surfaceId,
        details: { rootId: entry.rootId ?? null }
      });
    }
    for (const [group, values] of Object.entries(snapshot.missingCapabilityAssets ?? {})) {
      if (!(values ?? []).length) continue;
      manage({
        id: `surface-runtime:missing-capability-assets:${group}`,
        severity: "error",
        kind: "missing-capability-assets",
        message: "Required capability assets were not loaded before settle",
        details: { group, values }
      });
    }
    for (const issue of snapshot.expectationIssues ?? []) {
      manage({
        ...issue,
        id: trimString(issue?.id) || `surface-runtime:expectation:${nextManaged.size + 1}`
      });
    }
    for (const issueId of [...probeManagedIssueIds]) {
      if (nextManaged.has(issueId)) continue;
      resolveIssue(issueId, { correlationId, phase, kind: "resolved" });
      probeManagedIssueIds.delete(issueId);
    }
    for (const issueId of nextManaged) probeManagedIssueIds.add(issueId);
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
      reportIssue({
        id: "surface-runtime:route-swap-missing-target",
        severity: "error",
        phase: "route-swap",
        kind: "route-swap",
        message: "Route swap was requested without a target surface",
        correlationId: issueLedger.nextCorrelationId("route-swap")
      });
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
      reportIssue({
        id: `surface-runtime:route-swap-missing-root:${target.surfaceId}`,
        severity: "error",
        phase: "route-swap",
        kind: "route-swap",
        message: "Route swap could not resolve both current and next root nodes",
        surfaceId: target.surfaceId,
        details: {
          currentRootId,
          nextRootId: trimString(nextRoot?.id),
          hasManifest: Boolean(page?.manifest?.surfaces)
        },
        correlationId: issueLedger.nextCorrelationId("route-swap")
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
      manifest.capabilityAssets = normalizeCapabilityAssets(page.manifest.capabilityAssets ?? manifest.capabilityAssets);
      manifest.processWitnesses = page.manifest.processWitnesses ?? manifest.processWitnesses;
      replaceProcessRuntime(manifest.processWitnesses || []);
      surfaceById = new Map((manifest.surfaces ?? []).map(surface => [surface.id, surface]));
      activeSurfaceId = trimString(page.manifest.activeSurfaceId) || target.surfaceId;
    } else {
      activeSurfaceId = target.surfaceId;
    }
    manifest.activeSurfaceId = activeSurfaceId;
    fallbackNavigationPath = null;
    try {
      await ensureSurfaceCapabilityAssets(document, window, manifest.capabilityAssets);
      resolveIssue("surface-runtime:capability-assets-load-failed", { phase: "route-swap" });
    } catch (error) {
      reportIssue({
        id: "surface-runtime:capability-assets-load-failed",
        severity: "error",
        phase: "route-swap",
        kind: "capability-assets",
        message: "Capability assets failed to load during route swap",
        details: String(error?.message || error),
        correlationId: issueLedger.nextCorrelationId("route-swap")
      });
    }
    bootSurfaceCapabilities(window, nextRoot, {
      reportIssue,
      resolveIssue,
      phase: "capability-mount",
      correlationId: issueLedger.nextCorrelationId("route-swap")
    });
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
    resolveIssue(`surface-runtime:route-swap-missing-root:${target.surfaceId}`, { phase: "route-swap" });
    return true;
  };
  Promise.resolve(ensureSurfaceCapabilityAssets(document, window, manifest.capabilityAssets))
    .then(() => {
      resolveIssue("surface-runtime:capability-assets-load-failed", { phase: "boot" });
      bootActiveSurfaceCapabilities("capability-mount", issueLedger.nextCorrelationId("boot"));
    })
    .catch(error => {
      reportIssue({
        id: "surface-runtime:capability-assets-load-failed",
        severity: "error",
        phase: "boot",
        kind: "capability-assets",
        message: "Capability assets failed to load during boot",
        details: String(error?.message || error),
        correlationId: issueLedger.nextCorrelationId("boot")
      });
    });
  const currentProcessRefs = () => [...new Set((manifest.surfaces ?? [])
    .map(surface => resolveSurfaceRuntimeBinding(manifest, surface.id).processRef)
    .filter(Boolean))];
  const runSettleProbe = async (phase = "settle-probe", correlationId = issueLedger.nextCorrelationId("probe")) => {
    const snapshot = createSurfaceRuntimeProbe({
      document,
      window,
      manifest,
      surfaceById,
      activeSurfaceId,
      processRuntime,
      issueLedger,
      boundInteractionCount: disposers.length,
      expectationProviders
    });
    syncProbeIssues(snapshot, phase, correlationId);
    const nextSnapshot = {
      ...snapshot,
      issues: issueLedger.list()
    };
    runtime.latestProbe = cloneInspectionValue(nextSnapshot);
    diagnosticsOverlay.render();
    return runtime.latestProbe;
  };
  runtime.rerunProbe = () => runSettleProbe("settle-probe", issueLedger.nextCorrelationId("probe"));
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
  const syncRouteAndRefresh = async (correlationId = issueLedger.nextCorrelationId("refresh")) => {
    await refresh();
    for (const processRef of currentProcessRefs()) {
      const routeTarget = syncRouteStateToUrl({ manifest, processRuntime, processRef, window });
      if (routeTarget?.surfaceId && await replaceActiveRouteSurface(routeTarget)) {
        bindInteractions();
        await refresh();
      }
    }
    if (await reconcileActiveRouteFromManifestState()) {
      bindInteractions();
      await refresh();
    }
    await runSettleProbe("settle-probe", correlationId);
  };
  let syncInFlight = null;
  let syncQueued = false;
  const requestSyncRouteAndRefresh = async (reason = "refresh") => {
    if (syncInFlight) {
      syncQueued = true;
      await syncInFlight;
      return syncInFlight;
    }
    do {
      syncQueued = false;
      syncInFlight = Promise.resolve(syncRouteAndRefresh(issueLedger.nextCorrelationId(reason)));
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
      await requestSyncRouteAndRefresh("popstate");
    };
    window.addEventListener("popstate", onPopState);
    runtimeDisposers.push(() => window.removeEventListener?.("popstate", onPopState));
    const onCapabilityOutput = event => {
      const surfaceId = trimString(event?.detail?.surfaceId);
      if (!surfaceId) return;
      capabilityOutputs[surfaceId] = event.detail?.outputs ?? {};
      void requestSyncRouteAndRefresh("capability-output");
    };
    window.addEventListener("surface-capability-output", onCapabilityOutput);
    runtimeDisposers.push(() => window.removeEventListener?.("surface-capability-output", onCapabilityOutput));
    const onCapabilityError = event => {
      const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
      const capability = trimString(detail.capability) || "unknown-capability";
      const surfaceId = trimString(detail.surfaceId) || "unknown-surface";
      const phase = trimString(detail.phase) || "capability-mount";
      reportIssue({
        id: `surface-runtime:capability-error:${capability}:${surfaceId}:${phase}`,
        severity: "error",
        phase,
        kind: "capability-error",
        message: trimString(detail.message) || "Capability runtime reported an error",
        surfaceId: trimString(detail.surfaceId),
        capability,
        targetId: trimString(detail.targetId),
        details: cloneInspectionValue(detail.details ?? null),
        correlationId: issueLedger.nextCorrelationId("capability-error")
      });
    };
    window.addEventListener("surface-capability-error", onCapabilityError);
    runtimeDisposers.push(() => window.removeEventListener?.("surface-capability-error", onCapabilityError));
  }

  const bindInteractions = () => {
    const activeIds = activeRuntimeSurfaceIds(surfaceById, activeSurfaceId);
    for (const surface of manifest.surfaces ?? []) {
      if (!activeIds.has(surface.id)) continue;
      if (!surfaceIsPresentInDom(document, surface)) continue;
      if (!(surface?.runtime?.interactions?.length)) continue;
      const binding = resolveSurfaceRuntimeBinding(manifest, surface.id);
      if (!binding.processRef) {
        reportIssue({
          id: `surface-runtime:missing-process:${surface.id}`,
          severity: "error",
          phase: "refresh",
          kind: "missing-process-binding",
          message: "Interactive surface did not resolve an owning process",
          surfaceId: surface.id,
          correlationId: issueLedger.nextCorrelationId("refresh")
        });
        continue;
      }
      const capabilities = resolveSurfaceCapabilities(binding, manifest.browserRuntimeCapabilities);
      if (capabilities.missing.length) {
        window?.console?.error?.("surface interaction runtime blocked: missing capabilities", capabilities.missing);
        reportIssue({
          id: `surface-runtime:missing-capabilities:${surface.id}`,
          severity: "error",
          phase: "refresh",
          kind: "missing-capabilities",
          message: "Surface interaction runtime is missing required browser capabilities",
          surfaceId: surface.id,
          details: { capabilities: capabilities.missing },
          correlationId: issueLedger.nextCorrelationId("refresh")
        });
        continue;
      }
      resolveIssue(`surface-runtime:missing-process:${surface.id}`, { phase: "refresh" });
      resolveIssue(`surface-runtime:missing-capabilities:${surface.id}`, { phase: "refresh" });
      for (const interaction of surface?.runtime?.interactions ?? []) {
        const targetKey = trimString(interaction?.target);
        const eventName = trimString(interaction?.event) || "click";
        const action = interaction?.action && typeof interaction.action === "object" ? interaction.action : null;
        const targets = targetKey ? (surface?.view?.interactionTargets?.[targetKey] ?? []) : [];
        if (!targets.length) {
          reportIssue({
            id: `surface-runtime:missing-interaction-target:${surface.id}:${targetKey || "self"}:unresolved`,
            severity: "error",
            phase: "refresh",
            kind: "missing-interaction-target",
            message: "Declared interaction target did not resolve to a DOM node",
            surfaceId: surface.id,
            details: { targetKey: targetKey ?? null },
            correlationId: issueLedger.nextCorrelationId("refresh")
          });
        }
        for (const target of targets) {
          const node = trimString(target?.id) ? document.getElementById(target.id) : null;
          if (!node || !action) {
            reportIssue({
              id: `surface-runtime:missing-interaction-target:${surface.id}:${targetKey || "self"}:${trimString(target?.id) || "unresolved"}`,
              severity: "error",
              phase: "refresh",
              kind: "missing-interaction-target",
              message: "Declared interaction target did not resolve to a DOM node",
              surfaceId: surface.id,
              targetId: trimString(target?.id),
              details: { targetKey: targetKey ?? null },
              correlationId: issueLedger.nextCorrelationId("refresh")
            });
            continue;
          }
          resolveIssue(`surface-runtime:missing-interaction-target:${surface.id}:${targetKey || "self"}:${trimString(target?.id) || "unresolved"}`, { phase: "refresh" });
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
              await requestSyncRouteAndRefresh("deliver");
              return;
            }
            if (action.kind === "setState" && trimString(action.state)) {
              event.preventDefault();
              processRuntime.set(action.state, eventValueFromSpec(action.value ?? {}, event, processRuntime));
              await requestSyncRouteAndRefresh("set-state");
            }
          };
          node.addEventListener(eventName, listener);
          disposers.push(() => node.removeEventListener(eventName, listener));
        }
      }
    }
  };
  bindInteractions();

  runtime.refresh = () => requestSyncRouteAndRefresh("refresh");
  Object.defineProperties(runtime, {
    activeSurfaceId: { get() { return activeSurfaceId; } },
    manifestDiagnostics: { get() { return manifest?.diagnostics ?? null; } },
    routeTargets: { get() { return manifest?.routeTargets ?? []; } },
    surfaceIds: { get() { return [...surfaceById.keys()]; } },
    lastRouteSwap: { get() { return lastRouteSwap; } },
    routeDebugLog: { get() { return [...routeDebugLog]; } },
    processRuntime: { get() { return processRuntime; } }
  });
  runtime.destroy = () => {
    disposeInteractions();
    unsubscribeProcessRuntime?.();
    for (const bridge of inFlightRuntimeBridges) bridge();
    inFlightRuntimeBridges.clear();
    for (const dispose of runtimeDisposers.splice(0)) dispose();
  };
  void requestSyncRouteAndRefresh("boot");
  return runtime;
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
    capabilityBootIssueId.toString(),
    bootSurfaceCapabilities.toString(),
    capabilityAssetHash.toString(),
    waitForNodeLoad.toString(),
    waitForSurfaceCapabilityModuleSettle.toString(),
    waitForSurfaceCapabilityModuleRegistration.toString(),
    normalizeCapabilityAssets.toString(),
    ensureSurfaceCapabilityAssets.toString(),
    cloneInspectionValue.toString(),
    surfaceAssetRegistrySnapshot.toString(),
    createSurfaceInspectionPoint.toString(),
    installSurfaceInspectionPoint.toString(),
    surfaceDiagnosticsOverlayEnabled.toString(),
    createSurfaceRuntimeIssueLedger.toString(),
    surfaceRuntimeIssueSeverityRank.toString(),
    summarizeSurfaceRuntimeIssues.toString(),
    ensureSurfaceDiagnosticsOverlayStyles.toString(),
    createSurfaceDiagnosticsOverlay.toString(),
    installSurfaceRuntimeBootFailure.toString(),
    clearRouteUnderlay.toString(),
    mountedCapabilityMarkersForSurface.toString(),
    capabilityAssetPresence.toString(),
    surfaceViewNodeIds.toString(),
    surfaceIsPresentInDom.toString(),
    createSurfaceRuntimeProbe.toString(),
    summarizeSurfaceRuntimeExpectationIssues.toString(),
    updateRouteUnderlay.toString(),
    `function formatInlineText(value) { return SURFACE_INTERACTION_FORMATTERS.formattedText(value); }`,
    patchSurfaceDom.toString(),
    createSurfaceInteractionRuntime.toString(),
    `function bootSurfaceInteractionRuntime(manifest) {
  if (!manifest || !Array.isArray(manifest.surfaces) || !manifest.surfaces.length) return;
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    window.__surfaceRuntimeBootStarted = true;
    try {
      window.__surfaceInteractionRuntime = createSurfaceInteractionRuntime({
        document,
        window,
        manifest,
        createProcessRuntimeImpl: createProcessRuntime,
        expectationProviders: Array.isArray(window.__surfaceRuntimeExpectationProviders)
          ? window.__surfaceRuntimeExpectationProviders
          : []
      });
      window.__surfaceRuntimeBootError = null;
    } catch (error) {
      window.__surfaceRuntimeBootError = {
        name: error?.name || "Error",
        message: String(error?.message || error),
        stack: String(error?.stack || "")
      };
      window.__surfaceInteractionRuntime = installSurfaceRuntimeBootFailure({
        document,
        window,
        manifest,
        error
      });
      window.console?.error?.("surface interaction runtime boot failed", error);
    }
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
    cachedSurfaceInteractionRuntimeModuleSource = `const __surfaceRuntimeGlobal = typeof window === "object" && window
  ? window
  : (typeof self === "object" && self ? self : {});
__surfaceRuntimeGlobal.__surfaceRuntimeModuleLoaded = true;

${renderProcessRuntimeModuleSource()}

${browserHelpersSource()}

try {
  const surfaceRuntimeManifest = readSurfaceRuntimeManifest(document);
  bootSurfaceInteractionRuntime(surfaceRuntimeManifest);
} catch (error) {
  __surfaceRuntimeGlobal.__surfaceRuntimeBootError = {
    name: error?.name || "Error",
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  };
  __surfaceRuntimeGlobal.console?.error?.("surface interaction runtime module failed", error);
}
`;
  }
  return cachedSurfaceInteractionRuntimeModuleSource;
}
