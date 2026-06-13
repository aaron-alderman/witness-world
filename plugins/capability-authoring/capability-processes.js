import { projectors, relation } from "../../src/kernel.js";
import {
  defineCapability,
  installCapability,
  removeCapability,
  moduleProjectors
} from "../../src/modules.js";
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

  const provenanceParsed = normalizeJsonObject(parseJsonField(body.provenanceJson, "provenanceJson"), "provenanceJson");
  if (!provenanceParsed.ok) {
    const witness = fail(world, { process: "capability.define.failed", actor: actor || backendHost, body: { reason: provenanceParsed.error } });
    return { ok: false, status: 400, error: provenanceParsed.error, witness };
  }
  const dependsOnParsed = normalizeJsonArray(parseJsonField(body.dependsOnJson, "dependsOnJson"), "dependsOnJson");
  if (!dependsOnParsed.ok) {
    const witness = fail(world, { process: "capability.define.failed", actor: actor || backendHost, body: { reason: dependsOnParsed.error } });
    return { ok: false, status: 400, error: dependsOnParsed.error, witness };
  }
  const publicApiParsed = normalizeJsonArray(parseJsonField(body.publicApiJson, "publicApiJson"), "publicApiJson");
  if (!publicApiParsed.ok) {
    const witness = fail(world, { process: "capability.define.failed", actor: actor || backendHost, body: { reason: publicApiParsed.error } });
    return { ok: false, status: 400, error: publicApiParsed.error, witness };
  }
  const configParsed = normalizeJsonArray(parseJsonField(body.configJson, "configJson"), "configJson");
  if (!configParsed.ok) {
    const witness = fail(world, { process: "capability.define.failed", actor: actor || backendHost, body: { reason: configParsed.error } });
    return { ok: false, status: 400, error: configParsed.error, witness };
  }
  const internalsParsed = normalizeJsonArray(parseJsonField(body.internalsJson, "internalsJson"), "internalsJson");
  if (!internalsParsed.ok) {
    const witness = fail(world, { process: "capability.define.failed", actor: actor || backendHost, body: { reason: internalsParsed.error } });
    return { ok: false, status: 400, error: internalsParsed.error, witness };
  }
  const authorityParsed = normalizeJsonArray(parseJsonField(body.authorityJson, "authorityJson"), "authorityJson");
  if (!authorityParsed.ok) {
    const witness = fail(world, { process: "capability.define.failed", actor: actor || backendHost, body: { reason: authorityParsed.error } });
    return { ok: false, status: 400, error: authorityParsed.error, witness };
  }
  const placementParsed = normalizeJsonArray(parseJsonField(body.placementJson, "placementJson"), "placementJson");
  if (!placementParsed.ok) {
    const witness = fail(world, { process: "capability.define.failed", actor: actor || backendHost, body: { reason: placementParsed.error } });
    return { ok: false, status: 400, error: placementParsed.error, witness };
  }

  const dependsOn = dependsOnParsed.value.map(String).filter(Boolean);
  const unknownDependencies = dependsOn.filter(id => !knownCapability(world, id));
  if (unknownDependencies.length) {
    const witness = fail(world, {
      process: "capability.define.failed",
      actor: actor || backendHost,
      body: { reason: "unknown capability dependencies", dependsOn: unknownDependencies }
    });
    return { ok: false, status: 400, error: "unknown capability dependencies", witness };
  }

  const placement = placementParsed.value.map(String).filter(Boolean);
  const invalidPlacement = placement.filter(kind => !["context", "serverRunner", "routePage"].includes(kind));
  if (invalidPlacement.length) {
    const witness = fail(world, {
      process: "capability.define.failed",
      actor: actor || backendHost,
      body: { reason: "unknown capability placement target", placement: invalidPlacement }
    });
    return { ok: false, status: 400, error: "unknown capability placement target", witness };
  }

  defineCapability(world, {
    actor: actor || backendHost,
    id: input.id,
    label: input.label,
    version: input.version ?? null,
    provenance: provenanceParsed.value,
    dependsOn,
    publicApi: publicApiParsed.value,
    config: configParsed.value,
    internals: internalsParsed.value,
    authority: authorityParsed.value,
    placement,
    context: input.context ?? null,
    owner: actor || backendHost
  });
  const capability = knownCapability(world, input.id) ?? {
    id: input.id,
    label: input.label,
    version: input.version ?? null,
    provenance: provenanceParsed.value,
    dependsOn,
    publicApi: publicApiParsed.value,
    config: configParsed.value,
    internals: internalsParsed.value,
    authority: authorityParsed.value,
    placement,
    context: input.context ?? null
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
  const input = validated.value;
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
  if (!capability.placement.includes(input.targetKind)) {
    const witness = fail(world, {
      process: "capability.install.failed",
      actor: actor || backendHost,
      body: { reason: "capability placement incompatible with target", capability: input.capability, targetKind: input.targetKind, placement: capability.placement }
    });
    return { ok: false, status: 400, error: "capability placement incompatible with target", witness };
  }

  if (input.targetKind === "context") {
    const context = world.project(moduleProjectors.contexts).find(row => row.id === input.target);
    if (!context) {
      const witness = fail(world, {
        process: "capability.install.failed",
        actor: actor || backendHost,
        body: { reason: "context target not found", target: input.target }
      });
      return { ok: false, status: 400, error: "context target not found", witness };
    }
  } else if (input.targetKind === "serverRunner") {
    const serverRunner = world.project(moduleProjectors.serverRunners).find(row => row.id === input.target);
    if (!serverRunner) {
      const witness = fail(world, {
        process: "capability.install.failed",
        actor: actor || backendHost,
        body: { reason: "server runner target not found", target: input.target }
      });
      return { ok: false, status: 400, error: "server runner target not found", witness };
    }
  } else if (input.targetKind === "routePage") {
    const routePage = isRoutePageTarget(world, input.target);
    if (!routePage.ok) {
      const witness = fail(world, {
        process: "capability.install.failed",
        actor: actor || backendHost,
        body: { reason: routePage.reason, target: input.target }
      });
      return { ok: false, status: 400, error: routePage.reason, witness };
    }
  }

  const missingDependencies = capability.dependsOn.filter(dep => !installExists(world, { capability: dep, target: input.target, targetKind: input.targetKind }));
  if (missingDependencies.length) {
    const witness = fail(world, {
      process: "capability.install.failed",
      actor: actor || backendHost,
      body: { reason: "capability dependencies are not installed on target", capability: input.capability, target: input.target, targetKind: input.targetKind, dependsOn: missingDependencies }
    });
    return { ok: false, status: 400, error: "capability dependencies are not installed on target", witness };
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
  const input = validated.value;
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
