import { projectors, relation } from "./kernel.js";
import { thingId } from "./ids.js";
import {
  createIdentity,
  createServerRunner,
  defineRoute,
  serveRoute,
  defineCapability,
  installCapability,
  removeCapability,
  moduleProjectors
} from "./modules.js";
import { defineFrontendProgram, defineFrontendStep, defineWidget, attachWidget, widgetDefinitions } from "./widgets.js";
import { typeModelProjection, validateProcessInput, validateProcessOutput } from "./type-model.js";

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
  return validateProcessInput(typeModel, process, body, { coerceStrings: false });
}

function validateOutput(world, process, body) {
  const typeModel = typeModelProjection(world.allWitnesses());
  return validateProcessOutput(typeModel, process, body);
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

function propsFromWidgetInput(input) {
  const props = {};
  const direct = ["text", "title", "class", "role", "href", "name", "placeholder", "autocomplete", "type", "action", "label", "valueType", "eventSoul", "eventVersion"];
  for (const key of direct) {
    if (typeof input[key] === "string" && input[key] !== "") props[key] = input[key];
  }
  if (typeof input.dataId === "string" && input.dataId !== "") props["data-id"] = input.dataId;
  if (typeof input.dataDone === "string" && input.dataDone !== "") props["data-done"] = input.dataDone;
  if (typeof input.tutorialTarget === "string" && input.tutorialTarget !== "") props["data-tutorial-target"] = input.tutorialTarget;
  if (input.template === true) props.template = true;
  if (Number.isFinite(Number(input.level))) props.level = Number(input.level);
  return props;
}

export function requestBootstrapIdentityDefine(world, {
  actor,
  backendHost,
  body,
  owner = actor || backendHost
}) {
  const validated = validateInput(world, "identity.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "identity.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (exists(world, input.id)) {
    const witness = fail(world, {
      process: "identity.define.failed",
      actor: actor || backendHost,
      body: { reason: "identity id already exists", id: input.id }
    });
    return { ok: false, status: 409, error: "identity id already exists", witness };
  }
  createIdentity(world, {
    actor: actor || backendHost,
    id: input.id,
    identityActor: input.actor,
    label: input.label,
    username: input.username,
    password: input.password,
    homePerspective: input.homePerspective ?? null,
    owner
  });
  const witness = world.emit({
    process: "identity.define",
    actor: actor || backendHost,
    claims: [relation(owner, "editedProjection", input.id)],
    body: { identity: input }
  });
  return { ok: true, status: 201, identity: input, witness };
}

export function requestBootstrapServerRunnerDefine(world, {
  actor,
  backendHost,
  body,
  allowedHandlerSets = []
}) {
  const validated = validateInput(world, "serverRunner.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "serverRunner.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (exists(world, input.id)) {
    const witness = fail(world, {
      process: "serverRunner.define.failed",
      actor: actor || backendHost,
      body: { reason: "server runner id already exists", id: input.id }
    });
    return { ok: false, status: 409, error: "server runner id already exists", witness };
  }
  if (!exists(world, input.backendHost) || !exists(world, input.frontendHost)) {
    const witness = fail(world, {
      process: "serverRunner.define.failed",
      actor: actor || backendHost,
      body: { reason: "host not found", backendHost: input.backendHost, frontendHost: input.frontendHost }
    });
    return { ok: false, status: 400, error: "host not found", witness };
  }
  if (input.handlerSet && !allowedHandlerSets.includes(input.handlerSet)) {
    const witness = fail(world, {
      process: "serverRunner.define.failed",
      actor: actor || backendHost,
      body: { reason: "unknown handler set", handlerSet: input.handlerSet }
    });
    return { ok: false, status: 400, error: "unknown handler set", witness };
  }
  const storage = {};
  if (input.todoProjection) storage.todoProjection = input.todoProjection;
  if (input.privateNotesProjection) storage.privateNotesProjection = input.privateNotesProjection;
  createServerRunner(world, {
    actor: actor || backendHost,
    id: input.id,
    backendHost: input.backendHost,
    frontendHost: input.frontendHost,
    handlerSet: input.handlerSet || null,
    storage: Object.keys(storage).length ? storage : null,
    allowActorHeader: input.allowActorHeader === true,
    owner: actor || backendHost
  });
  const runner = {
    id: input.id,
    backendHost: input.backendHost,
    frontendHost: input.frontendHost,
    handlerSet: input.handlerSet || null,
    storage: Object.keys(storage).length ? storage : null,
    allowActorHeader: input.allowActorHeader === true
  };
  const witness = world.emit({
    process: "serverRunner.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.id)],
    body: { serverRunner: runner }
  });
  return { ok: true, status: 201, serverRunner: runner, witness };
}

export function requestBootstrapRouteDefine(world, {
  actor,
  backendHost,
  body,
  allowedHandlers = []
}) {
  const validated = validateInput(world, "route.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "route.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (exists(world, input.id)) {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "route id already exists", id: input.id }
    });
    return { ok: false, status: 409, error: "route id already exists", witness };
  }
  if (allowedHandlers.length && !allowedHandlers.includes(input.handler)) {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "unknown handler", handler: input.handler }
    });
    return { ok: false, status: 400, error: "unknown handler", witness };
  }
  const params = {};
  if (typeof body.rootWidget === "string" && body.rootWidget.trim()) params.rootWidget = body.rootWidget.trim();
  if (typeof body.frontendProgram === "string" && body.frontendProgram.trim()) params.frontendProgram = body.frontendProgram.trim();
  if (typeof body.page === "string" && body.page.trim()) params.page = body.page.trim();
  if (body.liveProjection === true) params.liveProjection = true;
  if (Array.isArray(body.excludeWidgetRoles) && body.excludeWidgetRoles.length) params.excludeWidgetRoles = [...body.excludeWidgetRoles];
  if (typeof body.defaultRootWidget === "string" && body.defaultRootWidget.trim()) params.rootWidget = body.defaultRootWidget.trim();
  if ((input.handler === "page.home" || input.handler === "page.world") && !params.rootWidget) {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "page routes require rootWidget", handler: input.handler }
    });
    return { ok: false, status: 400, error: "page routes require rootWidget", witness };
  }
  defineRoute(world, {
    actor: actor || backendHost,
    id: input.id,
    path: input.path,
    serves: input.serves,
    method: input.method,
    handler: input.handler,
    params: Object.keys(params).length ? params : null,
    owner: actor || backendHost
  });
  const route = {
    id: input.id,
    path: input.path,
    serves: input.serves,
    method: input.method,
    handler: input.handler,
    params: Object.keys(params).length ? params : null
  };
  const witness = world.emit({
    process: "route.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.id)],
    body: { route }
  });
  return { ok: true, status: 201, route, witness };
}

export function requestBootstrapServeDefine(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "serve.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "serve.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (!exists(world, input.serverRunner) || !exists(world, input.route)) {
    const witness = fail(world, {
      process: "serve.define.failed",
      actor: actor || backendHost,
      body: { reason: "serverRunner or route missing", serverRunner: input.serverRunner, route: input.route }
    });
    return { ok: false, status: 400, error: "serverRunner or route missing", witness };
  }
  serveRoute(world, {
    actor: actor || backendHost,
    serverRunner: input.serverRunner,
    route: input.route
  });
  const witness = world.emit({
    process: "serve.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.serverRunner)],
    body: { serverRunner: input.serverRunner, route: input.route }
  });
  return { ok: true, status: 201, serve: { serverRunner: input.serverRunner, route: input.route }, witness };
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
    placement
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

export function requestBootstrapFrontendProgramDefine(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "frontendProgram.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "frontendProgram.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (exists(world, input.id)) {
    const witness = fail(world, {
      process: "frontendProgram.define.failed",
      actor: actor || backendHost,
      body: { reason: "frontend program id already exists", id: input.id }
    });
    return { ok: false, status: 409, error: "frontend program id already exists", witness };
  }
  if (!exists(world, input.rootWidget)) {
    const witness = fail(world, {
      process: "frontendProgram.define.failed",
      actor: actor || backendHost,
      body: { reason: "root widget not found", rootWidget: input.rootWidget }
    });
    return { ok: false, status: 400, error: "root widget not found", witness };
  }
  defineFrontendProgram(world, {
    actor: actor || backendHost,
    id: input.id,
    rootWidget: input.rootWidget,
    owner: actor || backendHost
  });
  const witness = world.emit({
    process: "frontendProgram.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.id)],
    body: { frontendProgram: input }
  });
  return { ok: true, status: 201, frontendProgram: input, witness };
}

export function requestBootstrapFrontendStepDefine(world, {
  actor,
  backendHost,
  body,
  allowedOps = []
}) {
  const validated = validateInput(world, "frontendStep.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "frontendStep.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (!exists(world, input.program)) {
    const witness = fail(world, {
      process: "frontendStep.define.failed",
      actor: actor || backendHost,
      body: { reason: "frontend program not found", program: input.program }
    });
    return { ok: false, status: 400, error: "frontend program not found", witness };
  }
  if (allowedOps.length && !allowedOps.includes(input.op)) {
    const witness = fail(world, {
      process: "frontendStep.define.failed",
      actor: actor || backendHost,
      body: { reason: "unknown frontend op", op: input.op }
    });
    return { ok: false, status: 400, error: "unknown frontend op", witness };
  }
  const paramsParsed = parseJsonField(body.paramsJson, "paramsJson");
  if (paramsParsed && !paramsParsed.ok) {
    const witness = fail(world, {
      process: "frontendStep.define.failed",
      actor: actor || backendHost,
      body: { reason: paramsParsed.error }
    });
    return { ok: false, status: 400, error: paramsParsed.error, witness };
  }
  const whenParsed = parseJsonField(body.whenJson, "whenJson");
  if (whenParsed && !whenParsed.ok) {
    const witness = fail(world, {
      process: "frontendStep.define.failed",
      actor: actor || backendHost,
      body: { reason: whenParsed.error }
    });
    return { ok: false, status: 400, error: whenParsed.error, witness };
  }
  const repeatParsed = parseJsonField(body.repeatJson, "repeatJson");
  if (repeatParsed && !repeatParsed.ok) {
    const witness = fail(world, {
      process: "frontendStep.define.failed",
      actor: actor || backendHost,
      body: { reason: repeatParsed.error }
    });
    return { ok: false, status: 400, error: repeatParsed.error, witness };
  }
  const afterParsed = parseJsonField(body.afterJson, "afterJson");
  if (afterParsed && !afterParsed.ok) {
    const witness = fail(world, {
      process: "frontendStep.define.failed",
      actor: actor || backendHost,
      body: { reason: afterParsed.error }
    });
    return { ok: false, status: 400, error: afterParsed.error, witness };
  }
  defineFrontendStep(world, {
    actor: actor || backendHost,
    program: input.program,
    event: input.event,
    op: input.op,
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : 0,
    params: paramsParsed?.value && typeof paramsParsed.value === "object" ? paramsParsed.value : {},
    when: whenParsed?.value && typeof whenParsed.value === "object" ? whenParsed.value : null,
    repeat: repeatParsed?.value && typeof repeatParsed.value === "object" ? repeatParsed.value : null,
    after: Array.isArray(afterParsed?.value) ? afterParsed.value : []
  });
  const step = {
    program: input.program,
    event: input.event,
    op: input.op,
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : 0
  };
  const witness = world.emit({
    process: "frontendStep.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.program)],
    body: { step }
  });
  return { ok: true, status: 201, step, witness };
}

export function requestWidgetDefine(world, {
  actor,
  backendHost,
  body,
  defaultParent = null,
  owner = actor,
  widgetClass = null
}) {
  const validatedInput = validateInput(world, "widget.define", body);
  if (!validatedInput.ok) {
    const witness = fail(world, {
      process: "widget.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validatedInput.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }

  const input = validatedInput.value;
  const attach = input.attach !== false;
  const parent = typeof input.parent === "string" && input.parent.trim()
    ? input.parent.trim()
    : defaultParent;
  if (attach && !parent) {
    const witness = fail(world, {
      process: "widget.define.failed",
      actor: actor || backendHost,
      body: { reason: "root widget not configured" }
    });
    return { ok: false, status: 400, error: "root widget not configured", witness };
  }
  if (parent && !exists(world, parent)) {
    const witness = fail(world, {
      process: "widget.define.failed",
      actor: actor || backendHost,
      body: { reason: "parent widget not found", parent }
    });
    return { ok: false, status: 400, error: "parent widget not found", witness };
  }
  const id = typeof input.id === "string" && input.id.trim()
    ? input.id.trim()
    : thingId("widget", {
      actor: actor || backendHost,
      parent: parent || null,
      kind: input.kind,
      props: propsFromWidgetInput(input),
      ordinal: world.allWitnesses().length
    });
  if (exists(world, id)) {
    const witness = fail(world, {
      process: "widget.define.failed",
      actor: actor || backendHost,
      body: { reason: "widget id already exists", id }
    });
    return { ok: false, status: 409, error: "widget id already exists", witness };
  }
  const props = propsFromWidgetInput(input);
  if (widgetClass && !props.class) props.class = widgetClass;
  const order = Number.isFinite(Number(input.order)) ? Number(input.order) : 999;
  const output = {
    id,
    kind: input.kind,
    ...(attach && parent ? { parent } : {}),
    order,
    ...(typeof props.text === "string" ? { text: props.text } : {})
  };
  const validatedOutput = validateOutput(world, "widget.define", output);
  if (!validatedOutput.ok) {
    const witness = fail(world, {
      process: "widget.define.failed",
      actor: actor || backendHost,
      body: { failures: validatedOutput.failures }
    });
    return { ok: false, status: 500, error: "widget.define output failed typed validation", witness };
  }
  defineWidget(world, {
    actor: actor || backendHost,
    id,
    kind: input.kind,
    props,
    owner: owner || actor || backendHost
  });
  if (attach && parent) {
    attachWidget(world, {
      actor: actor || backendHost,
      parent,
      child: id,
      order
    });
  }
  const widget = { id, kind: input.kind, parent: attach ? parent : null, order, props };
  const witness = world.emit({
    process: "widget.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", parent || id)],
    body: { input, widget }
  });
  return { ok: true, status: 201, widget, witness };
}
