import { projectors, relation } from "../../src/kernel.js";
import {
  defineCapability,
  installCapability,
  removeCapability,
  rollbackCapability,
  moduleProjectors,
  resolveCoveredContextualRef
  ,
  updateCapability
} from "../../src/modules.js";
import {
  evaluateCapabilityCompatibility,
  normalizeCapabilityCompatibility
} from "../../src/capability-compatibility.js";
import { processSpecFor, typeModelProjection, validateProcessInput } from "../../src/type-model.js";
import { widgetDefinitions } from "../../src/widgets.js";

function fail(world, { process, actor, body }) {
  return world.emit({ process, actor, claims: [], body });
}

function exists(world, id) {
  return world.project(projectors.things).has(id);
}

function parseJsonField(raw, field) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return { ok: false, error: `${field} must be a JSON string` };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: `${field} is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function validateInput(world, process, body) {
  const typeModel = typeModelProjection(world.allWitnesses());
  if (!processSpecFor(typeModel, process)) {
    return {
      ok: true,
      value: body && typeof body === "object" ? { ...body } : {},
      failures: [],
      spec: null
    };
  }
  const validated = validateProcessInput(typeModel, process, body, { coerceStrings: false });
  if (!validated.ok) return validated;
  return {
    ...validated,
    value: body && typeof body === "object"
      ? { ...body, ...validated.value }
      : validated.value
  };
}

function knownCapability(world, id) {
  return world.project(moduleProjectors.capabilityIndex).byId[id] ?? null;
}

function normalizeJsonArray(parsed, field) {
  if (!parsed) return { ok: true, value: [] };
  if (!Array.isArray(parsed.value)) return { ok: false, error: `${field} must be a JSON array` };
  return { ok: true, value: parsed.value };
}

function normalizeJsonObject(parsed, field) {
  if (!parsed) return { ok: true, value: null };
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return { ok: false, error: `${field} must be a JSON object` };
  return { ok: true, value: parsed.value };
}

function compatibilityFailureMessage(report) {
  const primary = report?.reasons?.[0];
  switch (primary?.code) {
    case "target-kind-incompatible":
      return "capability placement incompatible with target";
    case "target-missing":
      return `${primary.targetKind || "capability"} target not found`;
    case "target-invalid":
      return primary.detail || "capability target invalid";
    case "dependency-missing":
      return "capability dependencies are not installed on target";
    case "runtime-profile-incompatible":
      return "capability runtime profile incompatible with target";
    case "authority-assumptions-unmet":
      return "capability authority assumptions are not met";
    case "compatibility-target-kind-incompatible":
      return "capability compatibility contract blocks this target kind";
    default:
      return "capability compatibility check failed";
  }
}

function parseJsonArrayField(body, field, existingValue = []) {
  if (body?.[field] === undefined) return { ok: true, value: Array.isArray(existingValue) ? [...existingValue] : [] };
  return normalizeJsonArray(parseJsonField(body[field], field), field);
}

function parseJsonObjectField(body, field, existingValue = null) {
  if (body?.[field] === undefined) {
    return {
      ok: true,
      value: existingValue && typeof existingValue === "object"
        ? structuredClone(existingValue)
        : null
    };
  }
  return normalizeJsonObject(parseJsonField(body[field], field), field);
}

function capabilityTargetFacts(world, target, targetKind) {
  if (targetKind === "context") {
    const context = world.project(moduleProjectors.contexts).find(row => row.id === target);
    return {
      targetExists: Boolean(context),
      targetValidation: context ? { ok: true } : { ok: false, reason: "context target not found" }
    };
  }
  if (targetKind === "serverRunner") {
    const serverRunner = world.project(moduleProjectors.serverRunners).find(row => row.id === target);
    return {
      targetExists: Boolean(serverRunner),
      targetValidation: serverRunner ? { ok: true } : { ok: false, reason: "server runner target not found" }
    };
  }
  if (targetKind === "routePage") {
    return {
      targetExists: world.project(moduleProjectors.routes).some(row => row.id === target),
      targetValidation: isRoutePageTarget(world, target)
    };
  }
  return {
    targetExists: world.project(projectors.things).has(target),
    targetValidation: { ok: true }
  };
}

function installedCapabilitiesForTarget(world, target, targetKind) {
  return world.project(moduleProjectors.capabilityInstalls)
    .filter(row => row.target === target && row.targetKind === targetKind)
    .map(row => row.capability);
}

function validateCapabilityInstallsForDefinition(world, capability) {
  const installs = world.project(moduleProjectors.capabilityInstalls)
    .filter(row => row.capability === capability.id);
  const blocking = [];
  for (const install of installs) {
    const facts = capabilityTargetFacts(world, install.target, install.targetKind);
    const compatibility = evaluateCapabilityCompatibility(capability, {
      target: install.target,
      targetKind: install.targetKind,
      targetExists: facts.targetExists,
      targetValidation: facts.targetValidation,
      installedCapabilities: installedCapabilitiesForTarget(world, install.target, install.targetKind)
    });
    if (!compatibility.compatible) {
      blocking.push({
        target: install.target,
        targetKind: install.targetKind,
        compatibility
      });
    }
  }
  return blocking;
}

function capabilityRevisionRows(world, capabilityId) {
  return world.project(moduleProjectors.capabilityRevisionHistoryIndex).byCapability[capabilityId] ?? [];
}

function parseCapabilityDefinitionInput(world, body, existingCapability = null) {
  const provenanceParsed = parseJsonObjectField(body, "provenanceJson", existingCapability?.provenance ?? null);
  if (!provenanceParsed.ok) return provenanceParsed;
  const dependsOnParsed = parseJsonArrayField(body, "dependsOnJson", existingCapability?.dependsOn ?? []);
  if (!dependsOnParsed.ok) return dependsOnParsed;
  const publicApiParsed = parseJsonArrayField(body, "publicApiJson", existingCapability?.publicApi ?? []);
  if (!publicApiParsed.ok) return publicApiParsed;
  const configParsed = parseJsonArrayField(body, "configJson", existingCapability?.config ?? []);
  if (!configParsed.ok) return configParsed;
  const internalsParsed = parseJsonArrayField(body, "internalsJson", existingCapability?.internals ?? []);
  if (!internalsParsed.ok) return internalsParsed;
  const authorityParsed = parseJsonArrayField(body, "authorityJson", existingCapability?.authority ?? []);
  if (!authorityParsed.ok) return authorityParsed;
  const compatibilityParsed = parseJsonObjectField(body, "compatibilityJson", existingCapability?.compatibility ?? null);
  if (!compatibilityParsed.ok) return compatibilityParsed;
  const placementParsed = parseJsonArrayField(body, "placementJson", existingCapability?.placement ?? []);
  if (!placementParsed.ok) return placementParsed;

  const dependsOn = dependsOnParsed.value.map(String).filter(Boolean);
  const unknownDependencies = dependsOn.filter(id => id !== body?.id && !knownCapability(world, id));
  if (unknownDependencies.length) {
    return { ok: false, error: "unknown capability dependencies", details: { dependsOn: unknownDependencies } };
  }

  const placement = placementParsed.value.map(String).filter(Boolean);
  const invalidPlacement = placement.filter(kind => !["context", "serverRunner", "routePage"].includes(kind));
  if (invalidPlacement.length) {
    return { ok: false, error: "unknown capability placement target", details: { placement: invalidPlacement } };
  }

  const id = String(body?.id ?? existingCapability?.id ?? "");
  const label = body?.label ?? existingCapability?.label ?? id;
  const version = body?.version ?? existingCapability?.version ?? null;
  const context = body?.context ?? existingCapability?.context ?? null;
  return {
    ok: true,
    capability: {
      id,
      label,
      version: typeof version === "string" && version.trim() ? version.trim() : null,
      provenance: provenanceParsed.value,
      dependsOn,
      publicApi: publicApiParsed.value,
      config: configParsed.value,
      internals: internalsParsed.value,
      authority: authorityParsed.value,
      compatibility: normalizeCapabilityCompatibility(compatibilityParsed.value),
      placement,
      context: typeof context === "string" && context.trim() ? context.trim() : null
    }
  };
}

function isRoutePageTarget(world, routeId) {
  const route = world.project(moduleProjectors.routes).find(row => row.id === routeId) ?? null;
  if (!route || typeof route.handler !== "string" || !route.handler.startsWith("page.")) {
    return { ok: false, reason: "routePage target must be a page route" };
  }
  const rootWidget = route.params?.rootWidget ?? null;
  if (!rootWidget) return { ok: false, reason: "routePage target requires a rootWidget" };
  const widget = widgetDefinitions(world.allWitnesses()).find(row => row.id === rootWidget) ?? null;
  if (!widget || widget.kind !== "Page") {
    return { ok: false, reason: "routePage target root widget must exist and be kind Page" };
  }
  return { ok: true, route, rootWidget };
}

function installExists(world, { capability, target, targetKind }) {
  return world.project(moduleProjectors.capabilityInstalls)
    .some(row => row.capability === capability && row.target === target && row.targetKind === targetKind);
}

export function resolveCapabilityTargetInput(world, body, {
  contextField = "context",
  idField = "target",
  refField = "targetRef",
  label = "capability target"
} = {}) {
  const resolved = resolveCoveredContextualRef(world.allWitnesses(), {
    context: body?.[contextField] ?? null,
    id: body?.[idField] ?? null,
    ref: body?.[refField] ?? null,
    label
  });
  if (!resolved.ok) return resolved;
  if (!resolved.target) return { ok: false, error: `${label} is required` };
  return resolved;
}

export function requestBootstrapCapabilityDefine(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "capability.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "capability.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (exists(world, input.id)) {
    const witness = fail(world, {
      process: "capability.define.failed",
      actor: actor || backendHost,
      body: { reason: "capability id already exists", id: input.id }
    });
    return { ok: false, status: 409, error: "capability id already exists", witness };
  }
  const parsed = parseCapabilityDefinitionInput(world, body, null);
  if (!parsed.ok) {
    const witness = fail(world, {
      process: "capability.define.failed",
      actor: actor || backendHost,
      body: { reason: parsed.error, ...(parsed.details ?? {}) }
    });
    return { ok: false, status: 400, error: parsed.error, witness };
  }
  const capabilityInput = parsed.capability;

  defineCapability(world, {
    actor: actor || backendHost,
    ...capabilityInput,
    owner: actor || backendHost
  });
  const capability = knownCapability(world, input.id) ?? {
    ...capabilityInput
  };
  const witness = world.emit({
    process: "capability.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.id)],
    body: { capability }
  });
  return { ok: true, status: 201, capability, witness };
}

export function requestBootstrapCapabilityInstall(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "capability.install", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "capability.install.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const resolvedTarget = resolveCapabilityTargetInput(world, validated.value, {
    label: "capability install target"
  });
  if (!resolvedTarget.ok) {
    const witness = fail(world, {
      process: "capability.install.failed",
      actor: actor || backendHost,
      body: { reason: resolvedTarget.error }
    });
    return { ok: false, status: 400, error: resolvedTarget.error, witness };
  }
  const input = {
    ...validated.value,
    target: resolvedTarget.target
  };
  const capability = knownCapability(world, input.capability);
  if (!capability) {
    const witness = fail(world, {
      process: "capability.install.failed",
      actor: actor || backendHost,
      body: { reason: "capability not found", capability: input.capability }
    });
    return { ok: false, status: 404, error: "capability not found", witness };
  }
  if (installExists(world, input)) {
    const witness = fail(world, {
      process: "capability.install.failed",
      actor: actor || backendHost,
      body: { reason: "capability already installed on target", ...input }
    });
    return { ok: false, status: 409, error: "capability already installed on target", witness };
  }

  let targetValidation = { ok: true };
  let targetExists = true;
  if (input.targetKind === "context") {
    const context = world.project(moduleProjectors.contexts).find(row => row.id === input.target);
    if (!context) {
      targetValidation = { ok: false, reason: "context target not found" };
      targetExists = false;
    }
  } else if (input.targetKind === "serverRunner") {
    const serverRunner = world.project(moduleProjectors.serverRunners).find(row => row.id === input.target);
    if (!serverRunner) {
      targetValidation = { ok: false, reason: "server runner target not found" };
      targetExists = false;
    }
  } else if (input.targetKind === "routePage") {
    targetValidation = isRoutePageTarget(world, input.target);
    targetExists = world.project(moduleProjectors.routes).some(row => row.id === input.target);
  }

  const installedCapabilities = world.project(moduleProjectors.capabilityInstalls)
    .filter(row => row.target === input.target && row.targetKind === input.targetKind)
    .map(row => row.capability);
  const compatibility = evaluateCapabilityCompatibility(capability, {
    target: input.target,
    targetKind: input.targetKind,
    targetExists,
    targetValidation,
    installedCapabilities
  });
  if (!compatibility.compatible) {
    const error = compatibilityFailureMessage(compatibility);
    const witness = fail(world, {
      process: "capability.install.failed",
      actor: actor || backendHost,
      body: { reason: error, capability: input.capability, target: input.target, targetKind: input.targetKind, compatibility }
    });
    return { ok: false, status: 400, error, witness };
  }

  const installed = installCapability(world, {
    actor: actor || backendHost,
    capability: input.capability,
    target: input.target,
    targetKind: input.targetKind
  });
  if (installed.body?.ok === false) {
    return { ok: false, status: 400, error: installed.body?.reason ?? "capability install failed", witness: installed };
  }
  const row = world.project(moduleProjectors.capabilityInstalls)
    .find(entry => entry.capability === input.capability && entry.target === input.target && entry.targetKind === input.targetKind);
  const witness = world.emit({
    process: "capability.install",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.target)],
    body: { install: row ?? input }
  });
  return { ok: true, status: 201, capabilityInstall: row ?? input, witness };
}

export function requestBootstrapCapabilityRemove(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "capability.remove", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "capability.remove.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const resolvedTarget = resolveCapabilityTargetInput(world, validated.value, {
    label: "capability remove target"
  });
  if (!resolvedTarget.ok) {
    const witness = fail(world, {
      process: "capability.remove.failed",
      actor: actor || backendHost,
      body: { reason: resolvedTarget.error }
    });
    return { ok: false, status: 400, error: resolvedTarget.error, witness };
  }
  const input = {
    ...validated.value,
    target: resolvedTarget.target
  };
  if (!installExists(world, input)) {
    const witness = fail(world, {
      process: "capability.remove.failed",
      actor: actor || backendHost,
      body: { reason: "capability install not found", ...input }
    });
    return { ok: false, status: 404, error: "capability install not found", witness };
  }
  const removed = removeCapability(world, {
    actor: actor || backendHost,
    capability: input.capability,
    target: input.target,
    targetKind: input.targetKind
  });
  if (removed.body?.ok === false) {
    return { ok: false, status: 400, error: removed.body?.reason ?? "capability remove failed", witness: removed };
  }
  const witness = world.emit({
    process: "capability.remove",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.target)],
    body: { capability: input.capability, target: input.target, targetKind: input.targetKind }
  });
  return { ok: true, status: 200, capabilityInstall: input, witness };
}
