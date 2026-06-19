import { surfaceDomId } from "./runtime-surface-dom-identity.js";
import { renderSurfaceStaticFragment } from "./runtime-surface-shell.js";
import { createExecutionRunner } from "./runtime-execution-runner.js";
import {
  buildRenderedHostTree,
  collectReconcileSurfaceStates,
  createReconcilePlan
} from "./runtime-reconcile-service.js";
import {
  applySurfaceDomHostPlan,
  clearRouteUnderlay,
  fallbackActiveRootNode,
  patchSurfaceDom,
  readSurfaceDomHostTree,
  surfaceIsPresentInDom,
  updateSurfaceRouteUnderlay
} from "./runtime-surface-dom-host.js";
import {
  activeRouteTargetForPath,
  createBrowserRouteInvoker,
  forceDocumentNavigation,
  loadRouteSurfacePage,
  parseFirstElement,
  queryBindingsForProcess,
  routeStateBindingForProcess,
  routeTargetForManifestState,
  routeTargetForProcessState,
  supportsSameDocumentRouteReplacement,
  syncQueryStateToUrl,
  syncRouteStateToUrl,
  syncUrlToQueryState,
  syncUrlToRouteState
} from "./runtime-surface-route-runtime.js";
import {
  bootSurfaceCapabilities,
  ensureSurfaceCapabilityAssets
} from "./runtime-surface-capability-runtime.js";
import { createSurfaceDiagnosticsOverlay } from "./runtime-guidance-companion-shell.js";
import {
  createSurfaceRuntimeIssueLedger,
  createSurfaceRuntimeProbe,
  installSurfaceInspectionPoint,
  installSurfaceRuntimeBootFailure,
  surfaceDiagnosticsOverlayEnabled,
  surfaceExpectedVisible,
  surfaceHasVisibleBinding
} from "./runtime-surface-diagnostics.js";
import {
  normalizeCapabilityAssets as normalizeSharedCapabilityAssets
} from "./runtime-surface-runtime-shared.js";

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
  return normalizeSharedCapabilityAssets(value);
}

function normalizePreloadPolicyWhen(value) {
  const when = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const kind = trimString(when?.kind);
  if (!kind) return null;
  if (kind === "boot") return { kind };
  if (kind === "routeEnter") {
    const route = trimString(when?.route);
    return route ? { kind, route } : null;
  }
  if (kind === "idleAfterRoute") {
    const route = trimString(when?.route);
    const delayMs = Number(when?.delayMs);
    if (!route || !Number.isFinite(delayMs) || delayMs < 0) return null;
    return { kind, route, delayMs };
  }
  return null;
}

function normalizePreloadPolicyLoadList(load, allowed = []) {
  const loads = [...new Set((Array.isArray(load) ? load : [])
    .map(entry => trimString(entry))
    .filter(Boolean))];
  return loads.filter(entry => allowed.includes(entry));
}

function normalizePreloadPolicyTarget(value) {
  const target = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const kind = trimString(target?.kind);
  if (kind === "route") {
    const route = trimString(target?.route);
    const load = normalizePreloadPolicyLoadList(target?.load, ["manifest", "capabilityAssets"]);
    if (!route || !load.length) return null;
    return { kind, route, load };
  }
  if (kind === "capability") {
    const capability = trimString(target?.capability);
    const load = normalizePreloadPolicyLoadList(target?.load, ["assets"]);
    if (!capability || !load.length) return null;
    return { kind, capability, load };
  }
  return null;
}

function normalizePreloadPolicies(value) {
  return (Array.isArray(value) ? value : [])
    .map(policy => {
      const normalizedPolicy = policy && typeof policy === "object" && !Array.isArray(policy) ? policy : null;
      const id = trimString(normalizedPolicy?.id);
      const when = normalizePreloadPolicyWhen(normalizedPolicy?.when);
      const targets = (Array.isArray(normalizedPolicy?.targets) ? normalizedPolicy.targets : [])
        .map(normalizePreloadPolicyTarget)
        .filter(Boolean);
      if (!id || !when || !targets.length) return null;
      return { id, when, targets };
    })
    .filter(Boolean);
}

function normalizeCapabilityPreloadAssets(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([capability, assets]) => [trimString(capability), normalizeCapabilityAssets(assets)])
      .filter(([capability]) => capability)
  );
}

export function syncSurfaceRuntimeManifestScript(document, manifest) {
  if (!document?.createElement || !document?.body?.appendChild) return null;
  let node = document.getElementById?.("surface-runtime-manifest") ?? null;
  if (!node) {
    node = document.createElement("script");
    node.id = "surface-runtime-manifest";
    node.type = "application/json";
    document.body.appendChild(node);
  }
  node.textContent = JSON.stringify(manifest ?? null);
  return node;
}

function runtimeSpecForSurface(surface) {
  return {
    processRef: trimString(surface?.processRef),
    projectionRefs: normalizeRuntimeArray(surface?.projectionRefs),
    capabilityRefs: normalizeRuntimeArray(surface?.capabilityRefs),
    bindings: normalizeRuntimeArray(surface?.bindings),
    interactions: normalizeRuntimeArray(surface?.interactions),
    repeat: normalizeRuntimeObject(surface?.repeat)
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
    || Boolean(runtime.repeat?.collection && runtime.repeat?.template)
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

function collectRelevantProcessWitnesses(world, surfaceEntries = [], routeStateDescriptor = null, queryBindings = [], preloadPolicies = []) {
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
  for (const binding of normalizeQueryBindings(queryBindings)) {
    markDefinition(binding.process ?? binding.processRef);
    markDefinition(binding.state ?? binding.stateRef);
  }
  for (const policy of normalizePreloadPolicies(preloadPolicies)) {
    for (const target of policy.targets ?? []) {
      if (target?.kind === "route") markDefinition(target?.command);
    }
  }

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
        changed = markDefinition(stateId) || changed;
      }
      for (const messageId of processDef.body?.handles ?? []) {
        changed = markDefinition(messageId) || changed;
      }
      for (const messageId of processDef.body?.emits ?? []) {
        changed = markDefinition(messageId) || changed;
      }
      for (const rule of processDef.body?.rules ?? []) {
        const trigger = trimString(rule?.trigger);
        if (!trigger) continue;
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

function normalizeQueryBindings(value) {
  return (Array.isArray(value) ? value : [])
    .map(binding => {
      if (!binding || typeof binding !== "object" || Array.isArray(binding)) return null;
      const param = trimString(binding.param);
      const processRef = trimString(binding.processRef ?? binding.process);
      const stateRef = trimString(binding.stateRef ?? binding.state);
      if (!param || !processRef || !stateRef) return null;
      const next = {
        param,
        processRef,
        process: processRef,
        stateRef,
        state: stateRef
      };
      if (Object.prototype.hasOwnProperty.call(binding, "defaultValue")) {
        next.defaultValue = cloneInspectionValue(binding.defaultValue);
      }
      return next;
    })
    .filter(Boolean);
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
  const isMultiSelect = directTag === "select" && (surface?.surfaceKind === "multi-select" || props.multiple === true);
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
      propTargets.value = [{ id: domId, mode: isMultiSelect ? "selectedValues" : "value" }];
      if (directTag === "input") propTargets.checked = [{ id: domId, mode: "checked" }];
    }
    if (directTag === "option") {
      propTargets.value = [{ id: domId, mode: "attribute", attr: "value" }];
      propTargets.label = [{ id: domId, mode: "attribute", attr: "label" }];
      propTargets.disabled = [{ id: domId, mode: "disabled" }];
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
  route = null,
  requestPathname = "/",
  describeSurfaceRuntimeViewImpl = null,
  routeStateDescriptor = null,
  queryBindings = [],
  preloadPolicies = [],
  capabilityPreloadAssets = {},
  surfaceRenderers = [],
  initialState = null,
  projectionState = {},
  initialStateOverrides = null
}) {
  const rootId = rootSurfaceId ?? root?.id ?? activeSurface.id;
  const parentById = new Map();
  const shellSurfaceIds = [];
  const fullQueue = [{ id: rootId, parentId: null }];
  const fullSeen = new Set();
  while (fullQueue.length) {
    const next = fullQueue.shift();
    if (!next?.id || fullSeen.has(next.id)) continue;
    fullSeen.add(next.id);
    const surface = surfaces.get(next.id);
    if (!surface) continue;
    shellSurfaceIds.push(surface.id);
    parentById.set(surface.id, next.parentId ?? null);
    for (const childId of Array.isArray(surface.children) ? surface.children : []) {
      fullQueue.push({ id: childId, parentId: surface.id });
    }
  }
  const routeTargets = collectRouteTargets(surfaces, rootId);
  if (!routeTargets.length) {
    const routeId = trimString(route?.id);
    const routePath = trimString(route?.path) || trimString(requestPathname);
    if (routePath) {
      routeTargets.push({
        key: routeId || routePath,
        path: routePath,
        surfaceId: activeSurface.id
      });
    }
  }
  const includedIds = new Set(shellSurfaceIds);
  const includedParentById = new Map(parentById);
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
  const referencedTemplateIds = new Set();
  const referencedCollectionIds = new Set();
  for (const surfaceId of shellSurfaceIds) {
    const surface = surfaces.get(surfaceId);
    if (!surface) continue;
    if (!includedIds.has(surfaceId)) continue;
    const runtime = runtimeSpecForSurface(surface);
    if (runtime.repeat?.template) referencedTemplateIds.add(trimString(runtime.repeat.template));
    if (runtime.repeat?.collection) referencedCollectionIds.add(trimString(runtime.repeat.collection));
    const view = describeSurfaceRuntimeView(surface, { describeSurfaceRuntimeViewImpl });
    surfaceEntries.push({
      id: surface.id,
      parentId: includedParentById.get(surface.id) ?? null,
      children: childSurfaceIds(surface).filter(childId => includedIds.has(childId)),
      surfaceKind: surface.surfaceKind ?? null,
        props: normalizeRuntimeObject(surface.props),
        runtime,
        view,
        fragmentHtml: runtime.bindings.some(binding => trimString(binding?.prop) === "visible")
          ? renderSurfaceStaticFragment(surfaces, surface.id, {
            surfaceRenderers,
            initialState,
            projectionState,
            forceVisibleSurfaceIds: [surface.id]
            })
          : null
      });
    }
    const interactive = surfaceEntries.some(entry => (
      entry.runtime.processRef
      || entry.runtime.bindings.length
      || entry.runtime.interactions.length
      || Boolean(entry.runtime.repeat?.collection && entry.runtime.repeat?.template)
    ));
    if (!interactive) return null;
    const templates = [...referencedTemplateIds]
      .map(templateId => {
        const templateSurface = templateId ? surfaces.get(templateId) : null;
        if (!templateSurface) return null;
        const html = renderSurfaceStaticFragment(surfaces, templateId, {
          surfaceRenderers,
          initialState,
          projectionState,
          forceVisibleSurfaceIds: [templateId],
          templateContent: true
        });
        if (!html) return null;
        return {
          id: templateId,
          html,
          tag: trimString(templateSurface?.props?.tag) ?? null
        };
      })
      .filter(Boolean);
    const declaredCollections = referencedCollectionIds.size
      ? new Set(
          (world?.allWitnesses?.() ?? [])
            .filter(witness => witness?.process === "desire.defineCollection")
            .map(witness => trimString(witness?.body?.id))
            .filter(Boolean)
        )
      : new Set();
    const collections = [...new Set([
      ...declaredCollections,
      ...referencedCollectionIds
    ])].map(id => ({ id }));
    const runtimeFragment = collectRelevantProcessWitnesses(world, surfaceEntries, routeStateDescriptor, queryBindings, preloadPolicies);
  const diagnostics = buildRuntimeManifestDiagnostics({
    requestPathname,
    activeSurfaceId: activeSurface.id,
    surfaceEntries,
    processWitnesses: runtimeFragment.processWitnesses,
    runtimeIds: runtimeFragment.runtimeIds
  });
  const manifest = {
    rootSurfaceId: rootId,
    activeSurfaceId: activeSurface.id,
    requestPathname,
    routeTargets,
      preloadPolicies: normalizePreloadPolicies(preloadPolicies),
      capabilityPreloadAssets: normalizeCapabilityPreloadAssets(capabilityPreloadAssets),
      browserRuntimeCapabilities: [...new Set((browserRuntimeCapabilities ?? []).map(value => String(value || "")).filter(Boolean))],
      capabilityAssets: normalizeCapabilityAssets(capabilityAssets),
      surfaces: surfaceEntries,
      collections,
      templates,
      processWitnesses: runtimeFragment.processWitnesses,
      initialStateOverrides: normalizeRuntimeObject(initialStateOverrides),
      routeState: normalizeRouteStateDescriptor(routeStateDescriptor),
      queryBindings: normalizeQueryBindings(queryBindings),
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

function collectCapabilityOutputsFromDom(document) {
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

function eventValueFromSpec(spec, event, processRuntime) {
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

export function createSurfaceInteractionRuntime({
  document,
  window,
  manifest,
  createProcessRuntimeImpl,
  expectationProviders = []
}) {
  const normalizePathname = value => String(value || "/").replace(/\/+$/, "") || "/";
  const processRuntimeFactory = typeof createProcessRuntimeImpl === "function"
    ? createProcessRuntimeImpl
    : (() => {
        throw new Error("createProcessRuntime implementation required");
      });
  const executionRunner = createExecutionRunner();
  const issueLedger = createSurfaceRuntimeIssueLedger();
  const diagnosticsOverlayEnabled = surfaceDiagnosticsOverlayEnabled(window);
  const runtimeDisposers = [];
  manifest.preloadPolicies = normalizePreloadPolicies(manifest?.preloadPolicies);
  manifest.queryBindings = normalizeQueryBindings(manifest?.queryBindings);
  manifest.capabilityPreloadAssets = normalizeCapabilityPreloadAssets(manifest?.capabilityPreloadAssets);
  const declaredCollectionIds = new Set((manifest?.collections ?? []).map(entry => trimString(entry?.id)).filter(Boolean));
  const collectionValues = new Map([...declaredCollectionIds].map(id => [id, []]));
  const ensureDeclaredCollection = id => {
    const nextId = trimString(id);
    if (!nextId) return null;
    declaredCollectionIds.add(nextId);
    if (!collectionValues.has(nextId)) collectionValues.set(nextId, []);
    return nextId;
  };
  let requestSyncRouteAndRefresh = async () => null;
  const collectionStore = {
    getCollection(id) {
      const nextId = ensureDeclaredCollection(id);
      return nextId ? cloneInspectionValue(collectionValues.get(nextId) ?? []) : [];
    },
    setCollection(id, items) {
      const nextId = ensureDeclaredCollection(id);
      if (!nextId) return;
      collectionValues.set(nextId, Array.isArray(items) ? cloneInspectionValue(items) : []);
      void requestSyncRouteAndRefresh("collection");
    },
    clearCollection(id) {
      const nextId = ensureDeclaredCollection(id);
      if (!nextId) return;
      collectionValues.set(nextId, []);
      void requestSyncRouteAndRefresh("collection");
    },
    replaceMany(entries = {}) {
      for (const [id, items] of Object.entries(entries ?? {})) {
        const nextId = ensureDeclaredCollection(id);
        if (!nextId) continue;
        collectionValues.set(nextId, Array.isArray(items) ? cloneInspectionValue(items) : []);
      }
    },
    syncDeclarations(entries = []) {
      const nextIds = new Set((entries ?? []).map(entry => trimString(entry?.id)).filter(Boolean));
      for (const id of nextIds) ensureDeclaredCollection(id);
      for (const existingId of [...declaredCollectionIds]) {
        if (nextIds.has(existingId)) continue;
        declaredCollectionIds.delete(existingId);
        collectionValues.delete(existingId);
      }
    }
  };
  const runtime = {
    blocked: undefined,
    latestProbe: null,
    issues: issueLedger.list(),
    issueLedger,
    expectationProviderCount: Array.isArray(expectationProviders) ? expectationProviders.filter(provider => typeof provider === "function").length : 0,
    rerunProbe: async () => runtime.latestProbe,
    whenSettled() {
      return executionRunner.whenSettled();
    },
    settleSnapshot() {
      return executionRunner.settledSnapshot();
    },
    clearIssues() {
      issueLedger.clear();
      return [];
    },
      refresh() {
        return Promise.resolve(null);
      },
      getCollection(id) {
        return collectionStore.getCollection(id);
      },
      setCollection(id, items) {
        collectionStore.setCollection(id, items);
      },
      clearCollection(id) {
        collectionStore.clearCollection(id);
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
    get executionRunner() {
      return executionRunner;
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
  let lastRouteSwap = null;
  let lastReconcileSummary = null;
  let fallbackNavigationPath = null;
  const routeDebugLog = [];
  const preloadTasks = new Map();
  const completedPreloadOperations = new Set();
  const inFlightPreloadOperations = new Map();
  const preloadIdleTimers = new Map();
  let bootPreloadsTriggered = false;
  let lastStablePreloadRouteKey = null;
  const pushRouteDebug = entry => {
    routeDebugLog.push({
      at: Date.now(),
      ...entry
    });
    if (routeDebugLog.length > 40) routeDebugLog.shift();
  };
  const updatePreloadTask = (operationKey, update = {}) => {
    const previous = preloadTasks.get(operationKey) ?? {
      key: operationKey,
      attempts: 0
    };
    const next = {
      ...previous,
      ...update
    };
    preloadTasks.set(operationKey, next);
    return next;
  };
  const clearPreloadIdleTimers = () => {
    for (const timer of preloadIdleTimers.values()) clearTimeout(timer);
    preloadIdleTimers.clear();
  };
  const preloadOperationKeyFor = (target, load) => {
    if (target?.kind === "route") {
      const command = trimString(target?.command);
      return command && load === "command"
        ? `route:${target.route}:command:${command}`
        : `route:${target.route}:${load}`;
    }
    if (target?.kind === "capability") return `capability:${target.capability}:${load}`;
    return `unknown:${load}`;
  };
  const executePreloadOperation = async ({ policyId, target, load, triggerKind, triggerRoute = null, correlationId }) => {
    const operationKey = preloadOperationKeyFor(target, load);
    if (completedPreloadOperations.has(operationKey)) return "completed";
    if (inFlightPreloadOperations.has(operationKey)) return inFlightPreloadOperations.get(operationKey);
    updatePreloadTask(operationKey, {
      policyId,
      triggerKind,
      triggerRoute,
      targetKind: target?.kind ?? null,
      targetRoute: target?.route ?? null,
      targetCapability: target?.capability ?? null,
      load,
      status: "running",
      attempts: Number(preloadTasks.get(operationKey)?.attempts || 0) + 1,
      startedAt: Date.now(),
      error: null
    });
    const run = executionRunner.track("preload", async () => {
      if (target?.kind === "route") {
        if (load === "command") {
          const commandId = trimString(target?.command);
          if (!commandId) throw new Error(`preload route command missing for ${target.route}`);
          await processRuntime.stepViaRoute(commandId);
          return "completed";
        }
        const routeTarget = (manifest?.routeTargets ?? []).find(candidate => trimString(candidate?.key) === trimString(target.route));
        if (!routeTarget) throw new Error(`preload route target not found: ${target.route}`);
        const page = await loadRouteSurfacePage({
          document,
          window,
          manifest,
          surfaceById,
          target: routeTarget,
          requireManifest: true
        });
        if (!page?.manifest?.surfaces) throw new Error(`preload route manifest missing for ${target.route}`);
        if (load === "capabilityAssets") {
          await ensureSurfaceCapabilityAssets(document, window, page.manifest.capabilityAssets);
        }
        return "completed";
      }
      if (target?.kind === "capability") {
        const assets = manifest?.capabilityPreloadAssets?.[target.capability] ?? null;
        if (!assets) throw new Error(`preload capability assets not found: ${target.capability}`);
        await ensureSurfaceCapabilityAssets(document, window, assets);
        return "completed";
      }
      throw new Error(`unsupported preload target kind: ${target?.kind ?? "unknown"}`);
    }, {
      phase: "preload",
      correlationId,
      route: triggerRoute,
      surfaceId: activeSurfaceId,
      details: {
        policyId,
        triggerKind,
        targetKind: target?.kind ?? null,
        targetRoute: target?.route ?? null,
        targetCapability: target?.capability ?? null,
        load
      }
    })
      .then(result => {
        completedPreloadOperations.add(operationKey);
        updatePreloadTask(operationKey, {
          status: "completed",
          completedAt: Date.now(),
          error: null
        });
        return result;
      })
      .catch(error => {
        updatePreloadTask(operationKey, {
          status: "failed",
          failedAt: Date.now(),
          error: String(error?.message || error)
        });
        throw error;
      })
      .finally(() => {
        inFlightPreloadOperations.delete(operationKey);
        diagnosticsOverlay.render();
      });
    inFlightPreloadOperations.set(operationKey, run);
    diagnosticsOverlay.render();
    return run;
  };
  const runPreloadPolicy = (policy, { triggerKind, triggerRoute = null }) => {
    const normalizedPolicy = policy && typeof policy === "object" ? policy : null;
    if (!normalizedPolicy) return;
    const correlationId = issueLedger.nextCorrelationId(`preload:${triggerKind}`);
    for (const target of normalizedPolicy.targets ?? []) {
      for (const load of target.load ?? []) {
        const operationKey = preloadOperationKeyFor(target, load);
        if (completedPreloadOperations.has(operationKey)) continue;
        updatePreloadTask(operationKey, {
          policyId: normalizedPolicy.id,
          triggerKind,
          triggerRoute,
          targetKind: target?.kind ?? null,
          targetRoute: target?.route ?? null,
          targetCapability: target?.capability ?? null,
          load,
          status: "scheduled",
          scheduledAt: Date.now(),
          error: null
        });
        Promise.resolve()
          .then(() => executePreloadOperation({
            policyId: normalizedPolicy.id,
            target,
            load,
            triggerKind,
            triggerRoute,
            correlationId
          }))
          .catch(() => {});
      }
    }
    diagnosticsOverlay.render();
  };
  const scheduleStableRoutePreloads = () => {
    const policies = normalizePreloadPolicies(manifest?.preloadPolicies);
    if (!policies.length) return;
    const currentRouteKey = trimString(activeRouteTargetForPath(manifest, window?.location?.pathname)?.key);
    if (!bootPreloadsTriggered) {
      bootPreloadsTriggered = true;
      for (const policy of policies.filter(candidate => candidate.when.kind === "boot")) {
        runPreloadPolicy(policy, { triggerKind: "boot", triggerRoute: currentRouteKey });
      }
    }
    if (currentRouteKey === lastStablePreloadRouteKey) return;
    clearPreloadIdleTimers();
    lastStablePreloadRouteKey = currentRouteKey;
    if (!currentRouteKey) return;
    for (const policy of policies.filter(candidate => candidate.when.kind === "routeEnter" && candidate.when.route === currentRouteKey)) {
      runPreloadPolicy(policy, { triggerKind: "routeEnter", triggerRoute: currentRouteKey });
    }
    for (const policy of policies.filter(candidate => candidate.when.kind === "idleAfterRoute" && candidate.when.route === currentRouteKey)) {
      const timerKey = policy.id;
      updatePreloadTask(`idle:${timerKey}`, {
        key: `idle:${timerKey}`,
        policyId: policy.id,
        triggerKind: "idleAfterRoute",
        triggerRoute: currentRouteKey,
        status: "scheduled",
        scheduledAt: Date.now(),
        delayMs: policy.when.delayMs
      });
      const timer = setTimeout(() => {
        preloadIdleTimers.delete(timerKey);
        runPreloadPolicy(policy, { triggerKind: "idleAfterRoute", triggerRoute: currentRouteKey });
      }, policy.when.delayMs);
      preloadIdleTimers.set(timerKey, timer);
    }
    diagnosticsOverlay.render();
  };
  const syncLocationToManifestRequestPath = reason => {
    const manifestPath = trimString(manifest?.requestPathname);
    if (!manifestPath || !window?.history || !window?.location) return false;
    const currentPath = normalizePathname(window.location.pathname);
    const nextPath = normalizePathname(manifestPath);
    if (currentPath === nextPath) return false;
    window.history.replaceState({ surfaceRoutePath: nextPath }, "", nextPath);
    pushRouteDebug({
      kind: "manifest-path-sync",
      reason: trimString(reason) || "runtime",
      previousPath: currentPath,
      nextPath
    });
    return true;
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
    for (const entry of snapshot.missingVisibleSurfaces ?? []) {
      manage({
        id: `surface-runtime:missing-visible-surface:${entry.surfaceId}`,
        severity: "error",
        kind: "missing-visible-surface",
        message: "Surface state resolved visible but no DOM root exists for that surface",
        surfaceId: entry.surfaceId,
        targetId: entry.rootId,
        details: { parentId: entry.parentId ?? null }
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
  const instantiateProcessRuntime = witnesses => {
    const nextWitnesses = Array.isArray(witnesses) ? witnesses : [];
    return processRuntimeFactory({
      witnesses: nextWitnesses,
      executionRunner,
      routeInvoker: createBrowserRouteInvoker(window, { collectionStore })
    });
  };
  const initializeProcessRuntime = witnesses => {
    const nextRuntime = instantiateProcessRuntime(witnesses);
    const routeStateId = trimString(routeStateBindingForProcess(manifest)?.state);
    if (manifest?.initialStateOverrides && typeof manifest.initialStateOverrides === "object") {
      for (const [stateId, value] of Object.entries(manifest.initialStateOverrides)) {
        if (nextRuntime.value(stateId) === undefined) continue;
        nextRuntime.set(stateId, value);
      }
    }
    unsubscribeProcessRuntime?.();
    processRuntime = nextRuntime;
    if (routeStateId) {
      syncUrlToRouteState({
        manifest,
        processRuntime,
        processRef: routeStateBindingForProcess(manifest)?.processRef,
        window
      });
    }
    const queryProcessRefs = [...new Set([
      ...((manifest.surfaces ?? [])
        .map(surface => resolveSurfaceRuntimeBinding(manifest, surface.id).processRef)
        .filter(Boolean)),
      ...queryBindingsForProcess(manifest).map(binding => binding.processRef).filter(Boolean),
      trimString(routeStateBindingForProcess(manifest)?.processRef)
    ].filter(Boolean))];
    for (const processRef of queryProcessRefs) {
      syncUrlToQueryState({ manifest, processRuntime, processRef, window });
    }
    unsubscribeProcessRuntime = typeof processRuntime.subscribe === "function"
      ? processRuntime.subscribe(() => {
          void requestSyncRouteAndRefresh();
        })
      : null;
  };
  initializeProcessRuntime(manifest.processWitnesses || []);
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
  const refreshSurfaceBindings = async (correlationId = issueLedger.nextCorrelationId("refresh")) => {
    return executionRunner.track("reconcile", async () => {
      readExistingCapabilityOutputs(document);
      const activeIds = activeRuntimeSurfaceIds(surfaceById, activeSurfaceId);
      const currentActiveSurface = surfaceById.get(activeSurfaceId) || null;
      const renderedHostTree = buildRenderedHostTree(readSurfaceDomHostTree({
        document,
        surfaceById,
        activeSurfaceId
      }));
      const surfaceStates = collectReconcileSurfaceStates({
        surfaces: manifest.surfaces ?? [],
        activeSurfaceIds: activeIds,
        renderedHostTree,
        resolveSurfaceState(surface) {
          const repeat = surface?.runtime?.repeat ?? null;
          const template = trimString(repeat?.template)
            ? (manifest?.templates ?? []).find(entry => trimString(entry?.id) === trimString(repeat.template)) ?? null
            : null;
          const collectionId = trimString(repeat?.collection);
          const nextRepeat = collectionId && template?.html
            ? {
                collectionId,
                templateId: trimString(template.id),
                templateHtml: String(template.html),
                templateTag: trimString(template.tag),
                itemAs: trimString(repeat?.itemAs) || "item",
                indexAs: trimString(repeat?.indexAs) || "index",
                items: collectionStore.getCollection(collectionId)
              }
            : null;
          if (!(surface?.runtime?.bindings?.length) && !nextRepeat) return null;
          const binding = resolveSurfaceRuntimeBinding(manifest, surface.id);
          if (!binding.processRef) return null;
          const capabilities = resolveSurfaceCapabilities(binding, manifest.browserRuntimeCapabilities);
          if (capabilities.missing.length) return null;
          const nextProps = overlaySurfaceProps(surface, processRuntime, capabilityOutputs);
          return {
            hasBindings: Boolean(surface?.runtime?.bindings?.length),
            hasRepeat: Boolean(nextRepeat),
            hasVisibleBinding: surfaceHasVisibleBinding(surface),
            expectedVisible: surfaceExpectedVisible(surface, processRuntime, capabilityOutputs),
            nextProps,
            nextRepeat
          };
        }
      });
      const plan = createReconcilePlan({
        surfaceStates,
        activeSurfaceId
      });
      lastReconcileSummary = {
        at: Date.now(),
        activeSurfaceId,
        surfaceStateCount: surfaceStates.length,
        opCount: Array.isArray(plan?.ops) ? plan.ops.length : 0,
        opKinds: Array.isArray(plan?.ops)
          ? plan.ops.reduce((counts, op) => {
              const kind = trimString(op?.kind) || "unknown";
              counts[kind] = Number(counts[kind] || 0) + 1;
              return counts;
            }, {})
          : {},
        structureChanged: Boolean(plan?.structureChanged),
        activeSurfaceUnderlayUpdated: Boolean(plan?.activeSurfaceUnderlayUpdated)
      };
      const applied = await applySurfaceDomHostPlan({
        document,
        window,
        surfaceById,
        activeSurfaceId,
        plan,
        correlationId,
        bootSurfaceCapabilities(insertedRoot, taskMeta) {
          return Promise.resolve(bootSurfaceCapabilities(window, insertedRoot, {
            reportIssue,
            resolveIssue,
            phase: taskMeta?.phase ?? "capability-mount",
            correlationId: taskMeta?.correlationId ?? correlationId
          }));
        },
        async resolveRouteUnderlaySpec(_surface, routeKey) {
          const nextRouteKey = trimString(routeKey);
          if (!nextRouteKey) return { routeKey: null, html: null };
          const target = (manifest?.routeTargets ?? []).find(candidate => String(candidate.key) === nextRouteKey);
          const page = target
            ? await loadRouteSurfacePage({ document, window, manifest, surfaceById, target })
            : null;
          return {
            routeKey: nextRouteKey,
            html: page?.fragment ?? null
          };
        },
        readExistingCapabilityOutputs
      });
      if (currentActiveSurface && !applied.activeSurfaceUnderlayUpdated) {
        const nextProps = overlaySurfaceProps(currentActiveSurface, processRuntime, capabilityOutputs);
        const nextRouteKey = trimString(nextProps?.routeUnderlay);
        if (!nextRouteKey) clearRouteUnderlay(document);
        else {
          const target = (manifest?.routeTargets ?? []).find(candidate => String(candidate.key) === nextRouteKey);
          const page = target
            ? await loadRouteSurfacePage({ document, window, manifest, surfaceById, target })
            : null;
          updateSurfaceRouteUnderlay(document, currentActiveSurface, {
            routeKey: nextRouteKey,
            html: page?.fragment ?? null
          });
        }
      }
      return Boolean(applied.structureChanged);
    }, {
      phase: "refresh",
      correlationId,
      route: trimString(window?.location?.pathname),
      surfaceId: activeSurfaceId
    });
  };
  const refresh = async (correlationId = issueLedger.nextCorrelationId("refresh")) => {
    for (let pass = 0; pass < 4; pass += 1) {
      const structureChanged = await refreshSurfaceBindings(correlationId);
      if (!structureChanged) break;
      disposeInteractions();
      bindInteractions();
    }
  };
  const disposeInteractions = () => {
    for (const dispose of disposers.splice(0)) dispose();
  };
  const replaceActiveRouteSurface = async target => {
    const correlationId = issueLedger.nextCorrelationId("route-swap");
    return executionRunner.track("route-swap", async () => {
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
          correlationId
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
      const page = await executionRunner.track("manifest-replacement", () => loadRouteSurfacePage({
        document,
        window,
        manifest,
        surfaceById,
        target,
        requireManifest: true
      }), {
        phase: "route-swap",
        correlationId,
        route: trimString(target?.path),
        surfaceId: trimString(target?.surfaceId)
      });
      const fetchedTarget = page?.manifest ? activeRouteTargetForPath(page.manifest, target?.path) : null;
      const manifestRootSurfaceId = trimString(manifest?.rootSurfaceId);
      const pageRootSurfaceId = trimString(page?.manifest?.rootSurfaceId);
      const fetchedManifestMatchesShell = Boolean(
        page?.manifest?.surfaces
        && (!manifestRootSurfaceId || !pageRootSurfaceId || manifestRootSurfaceId === pageRootSurfaceId)
        && trimString(fetchedTarget?.key) === trimString(target?.key)
        && trimString(fetchedTarget?.surfaceId) === trimString(target?.surfaceId)
      );
      if (!fetchedManifestMatchesShell) {
        lastRouteSwap = {
          ok: false,
          reason: "manifest-mismatch",
          targetSurfaceId: target.surfaceId,
          hasManifest: Boolean(page?.manifest?.surfaces)
        };
        pushRouteDebug({
          kind: "replace:manifest-mismatch",
          targetSurfaceId: target.surfaceId,
          manifestRootSurfaceId: pageRootSurfaceId,
          manifestActiveSurfaceId: trimString(page?.manifest?.activeSurfaceId),
          manifestRequestPathname: trimString(page?.manifest?.requestPathname)
        });
        reportIssue({
          id: `surface-runtime:route-swap-manifest-mismatch:${target.surfaceId}`,
          severity: "error",
          phase: "route-swap",
          kind: "route-swap",
          message: "Fetched route manifest did not match the active shell or requested route",
          surfaceId: target.surfaceId,
          details: {
            manifestRootSurfaceId: pageRootSurfaceId,
            manifestActiveSurfaceId: trimString(page?.manifest?.activeSurfaceId),
            manifestRequestPathname: trimString(page?.manifest?.requestPathname)
          },
          correlationId
        });
        return false;
      }
      const nextActiveSurfaceId = trimString(page.manifest.activeSurfaceId) || target.surfaceId;
      if (!surfaceById.has(nextActiveSurfaceId)) {
        lastRouteSwap = {
          ok: false,
          reason: "unknown-target-surface",
          targetSurfaceId: target.surfaceId,
          activeSurfaceId: nextActiveSurfaceId
        };
        pushRouteDebug({
          kind: "replace:unknown-target-surface",
          targetSurfaceId: target.surfaceId,
          activeSurfaceId: nextActiveSurfaceId
        });
        reportIssue({
          id: `surface-runtime:route-swap-unknown-surface:${target.surfaceId}`,
          severity: "error",
          phase: "route-swap",
          kind: "route-swap",
          message: "Fetched route manifest activated a surface outside the bootstrapped shell manifest",
          surfaceId: target.surfaceId,
          details: {
            activeSurfaceId: nextActiveSurfaceId
          },
          correlationId
        });
        return false;
      }
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
          correlationId
        });
        return false;
      }
      disposeInteractions();
      currentRoot.replaceWith(nextRoot);
      pushRouteDebug({
        kind: "replace:manifest",
        targetSurfaceId: target.surfaceId,
        manifestActiveSurfaceId: trimString(page.manifest.activeSurfaceId),
        manifestRequestPathname: trimString(page.manifest.requestPathname),
        manifestSurfaceCount: Array.isArray(page.manifest.surfaces) ? page.manifest.surfaces.length : 0
      });
      const nextCapabilityAssets = Object.prototype.hasOwnProperty.call(page.manifest, "capabilityAssets")
        ? page.manifest.capabilityAssets
        : manifest.capabilityAssets;
      manifest.requestPathname = page.manifest.requestPathname ?? target.path ?? manifest.requestPathname;
      manifest.routeState = page.manifest.routeState ?? manifest.routeState;
      manifest.browserRuntimeCapabilities = page.manifest.browserRuntimeCapabilities ?? manifest.browserRuntimeCapabilities;
      manifest.chartSpecs = Object.prototype.hasOwnProperty.call(page.manifest, "chartSpecs")
        ? normalizeRuntimeObject(page.manifest.chartSpecs)
        : manifest.chartSpecs;
      manifest.capabilityAssets = normalizeCapabilityAssets(nextCapabilityAssets);
      manifest.diagnostics = page.manifest.diagnostics ?? manifest.diagnostics;
      activeSurfaceId = nextActiveSurfaceId;
      manifest.activeSurfaceId = activeSurfaceId;
      syncSurfaceRuntimeManifestScript(document, manifest);
      syncLocationToManifestRequestPath("route-swap");
      fallbackNavigationPath = null;
      try {
        await executionRunner.track("capability-assets", () =>
          ensureSurfaceCapabilityAssets(document, window, manifest.capabilityAssets)
        , {
          phase: "route-swap",
          correlationId,
          surfaceId: activeSurfaceId
        });
        resolveIssue("surface-runtime:capability-assets-load-failed", { phase: "route-swap" });
      } catch (error) {
        reportIssue({
          id: "surface-runtime:capability-assets-load-failed",
          severity: "error",
          phase: "route-swap",
          kind: "capability-assets",
          message: "Capability assets failed to load during route swap",
          details: String(error?.message || error),
          correlationId
        });
      }
      await executionRunner.track("capability-mount", () => Promise.resolve(bootSurfaceCapabilities(window, nextRoot, {
        reportIssue,
        resolveIssue,
        phase: "capability-mount",
        correlationId
      })), {
        phase: "route-swap",
        correlationId,
        surfaceId: activeSurfaceId
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
    }, {
      phase: "route-swap",
      correlationId,
      route: trimString(target?.path),
      surfaceId: trimString(target?.surfaceId)
    });
  };
  Promise.resolve(executionRunner.track("capability-assets", () =>
    ensureSurfaceCapabilityAssets(document, window, manifest.capabilityAssets)
  , {
    phase: "boot",
    correlationId: issueLedger.nextCorrelationId("boot")
  }))
    .then(() => {
      resolveIssue("surface-runtime:capability-assets-load-failed", { phase: "boot" });
      void executionRunner.track("capability-mount", () => Promise.resolve(
        bootActiveSurfaceCapabilities("capability-mount", issueLedger.nextCorrelationId("boot"))
      ), {
        phase: "boot",
        correlationId: issueLedger.nextCorrelationId("boot"),
        surfaceId: activeSurfaceId
      });
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
  const currentProcessRefs = () => [...new Set([
    ...(manifest.surfaces ?? [])
      .map(surface => resolveSurfaceRuntimeBinding(manifest, surface.id).processRef)
      .filter(Boolean),
    ...queryBindingsForProcess(manifest).map(binding => binding.processRef).filter(Boolean),
    trimString(routeStateBindingForProcess(manifest)?.processRef)
  ].filter(Boolean))];
  const runSettleProbe = async (phase = "settle-probe", correlationId = issueLedger.nextCorrelationId("probe")) => {
    const snapshot = createSurfaceRuntimeProbe({
      document,
      window,
      manifest,
      surfaceById,
      activeSurfaceId,
      processRuntime,
      executionRunner,
      issueLedger,
      boundInteractionCount: disposers.length,
      expectationProviders,
      runtimeBridgeCount: 0
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
    await refresh(correlationId);
    for (const processRef of currentProcessRefs()) {
      const routeTarget = syncRouteStateToUrl({ manifest, processRuntime, processRef, window });
      syncQueryStateToUrl({ manifest, processRuntime, processRef, window });
      if (routeTarget?.surfaceId && await replaceActiveRouteSurface(routeTarget)) {
        bindInteractions();
        await refresh(correlationId);
      }
    }
    if (await reconcileActiveRouteFromManifestState()) {
      bindInteractions();
      await refresh(correlationId);
    }
    await runSettleProbe("settle-probe", correlationId);
    Promise.resolve().then(() => scheduleStableRoutePreloads());
  };
  let syncInFlight = null;
  let syncQueued = false;
  requestSyncRouteAndRefresh = async (reason = "refresh") => {
    if (syncInFlight) {
      syncQueued = true;
      await syncInFlight;
      return syncInFlight;
    }
    do {
      syncQueued = false;
      const correlationId = issueLedger.nextCorrelationId(reason);
      syncInFlight = executionRunner.track("surface-sync", () => syncRouteAndRefresh(correlationId), {
        phase: "refresh",
        correlationId,
        route: trimString(window?.location?.pathname),
        surfaceId: activeSurfaceId,
        details: { reason }
      });
      await syncInFlight;
      syncInFlight = null;
    } while (syncQueued);
    return null;
  };
  syncLocationToManifestRequestPath("boot");
  for (const processRef of currentProcessRefs()) {
    syncUrlToRouteState({ manifest, processRuntime, processRef, window });
    syncUrlToQueryState({ manifest, processRuntime, processRef, window });
  }
  if (window && typeof window.addEventListener === "function") {
    const onPopState = async () => {
      for (const processRef of currentProcessRefs()) {
        syncUrlToRouteState({ manifest, processRuntime, processRef, window });
        syncUrlToQueryState({ manifest, processRuntime, processRef, window });
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
    preloadPolicies: { get() { return normalizePreloadPolicies(manifest?.preloadPolicies); } },
    queryBindings: { get() { return normalizeQueryBindings(manifest?.queryBindings); } },
    capabilityPreloadAssets: { get() { return normalizeCapabilityPreloadAssets(manifest?.capabilityPreloadAssets); } },
    preloadTasks: { get() { return [...preloadTasks.values()].map(task => cloneInspectionValue(task)); } },
    surfaceIds: { get() { return [...surfaceById.keys()]; } },
    lastRouteSwap: { get() { return lastRouteSwap; } },
    lastReconcileSummary: { get() { return lastReconcileSummary; } },
    routeDebugLog: { get() { return [...routeDebugLog]; } },
    processRuntime: { get() { return processRuntime; } },
    runtimeBridgeCount: { get() { return 0; } },
    settleSnapshot: { get() { return executionRunner.settledSnapshot(); } }
  });
  runtime.destroy = () => {
    disposeInteractions();
    unsubscribeProcessRuntime?.();
    clearPreloadIdleTimers();
    for (const dispose of runtimeDisposers.splice(0)) dispose();
  };
  void requestSyncRouteAndRefresh("boot");
  return runtime;
}

export {
  currentWitnessCount,
  resolvedSurfaceDomId,
  normalizeRuntimeArray,
  normalizeRuntimeObject,
  normalizePreloadPolicyWhen,
  normalizePreloadPolicyLoadList,
  normalizePreloadPolicyTarget,
  normalizePreloadPolicies,
  normalizeQueryBindings,
  normalizeCapabilityPreloadAssets,
  runtimeSpecForSurface,
  surfaceHasRuntimeMeaning,
  trimmedIdSet,
  addToGroupedSet,
  addToIndexedSet,
  collectRuleStepReferences,
  buildProcessWitnessCatalog,
  collectRelevantProcessWitnesses,
  buildRuntimeManifestDiagnostics,
  childSurfaceIds,
  collectRouteTargets,
  normalizeViewTargets,
  classTokensForSurface,
  genericSurfaceRuntimeView,
  createBlockedInteractionRuntime
};
