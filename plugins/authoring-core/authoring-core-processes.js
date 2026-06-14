import { projectors, relation } from "../../src/kernel.js";
import { thingId } from "../../src/ids.js";
import {
  createIdentity,
  updateIdentity,
  defineContext,
  definePerspective,
  bindContextName,
  unbindContextName,
  exportContextName,
  unexportContextName,
  importContextName,
  unimportContextName,
  validateContextBinding,
  validateContextExport,
  validateContextImport,
  resolveContextualRef,
  grantStewardship,
  revokeStewardship,
  defineRoute,
  serveRoute,
  moduleProjectors
} from "../../src/modules.js";
import { defineFrontendProgram, defineFrontendStep, defineWidget, updateWidget, attachWidget, widgetDefinitions, widgetVersions } from "../../src/widgets.js";
import {
  defineBackendProgram,
  defineBackendProgramVersion,
  defineBackendProgramVersionTransition,
  defineBackendStep,
  backendProgramsProjection,
  backendProgramVersionsProjection,
  requestBackendProgramVersionActivation,
  rollbackBackendProgramVersion
} from "../../src/backend-programs.js";
import { processSpecFor, typeModelProjection, validateProcessInput, validateProcessOutput } from "../../src/type-model.js";





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

function validateOutput(world, process, body) {
  const typeModel = typeModelProjection(world.allWitnesses());
  if (!processSpecFor(typeModel, process)) {
    return {
      ok: true,
      value: body && typeof body === "object" ? { ...body } : {},
      failures: [],
      spec: null
    };
  }
  return validateProcessOutput(typeModel, process, body);
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

function exportedTarget(world, { context, name, target }) {
  return world.project(moduleProjectors.contextExports)
    .some(row => row.context === context && row.name === name && row.target === target);
}

function importedNameExists(world, { context, sourceContext, exportName, name }) {
  return world.project(moduleProjectors.contextImports)
    .some(row =>
      row.context === context
      && row.sourceContext === sourceContext
      && row.exportName === exportName
      && row.name === name
    );
}

function resolveBodyRef(world, body, {
  contextField = "context",
  idField,
  refField,
  label
}) {
  return resolveContextualRef(world.allWitnesses(), {
    context: body?.[contextField] ?? null,
    id: body?.[idField] ?? null,
    ref: body?.[refField] ?? null,
    label
  });
}

function propsFromWidgetInput(input) {
  const props = {};
  const direct = ["text", "title", "class", "role", "href", "name", "placeholder", "autocomplete", "type", "action", "label", "valueType", "eventSoul", "eventVersion"];
  for (const key of direct) {
    if (typeof input[key] === "string" && input[key] !== "") props[key] = input[key];
  }
  if (typeof input.dataId === "string" && input.dataId !== "") props["data-id"] = input.dataId;
  if (typeof input.dataDone === "string" && input.dataDone !== "") props["data-done"] = input.dataDone;
  const guidanceTarget = typeof input.guidanceTarget === "string" && input.guidanceTarget !== ""
    ? input.guidanceTarget
    : (typeof input.tutorialTarget === "string" && input.tutorialTarget !== "" ? input.tutorialTarget : "");
  if (guidanceTarget) {
    props["data-guidance-target"] = guidanceTarget;
    props["data-tutorial-target"] = guidanceTarget;
  }
  if (input.template === true) props.template = true;
  if (Number.isFinite(Number(input.level))) props.level = Number(input.level);
  return props;
}

function patchFromWidgetUpdateInput(input, body) {
  const patch = {};
  for (const key of ["text", "title", "class"]) {
    if (Object.prototype.hasOwnProperty.call(body ?? {}, key) && typeof input[key] === "string") patch[key] = input[key];
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "hidden") && typeof input.hidden === "boolean") patch.hidden = input.hidden;
  return patch;
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
    homeContext: input.homeContext ?? null,
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

export function requestBootstrapIdentityUpdate(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "identity.update", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "identity.update.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  const existing = world.project(moduleProjectors.identityIndex).byId[input.id] ?? null;
  if (!existing) {
    const witness = fail(world, {
      process: "identity.update.failed",
      actor: actor || backendHost,
      body: { reason: "identity not found", id: input.id }
    });
    return { ok: false, status: 404, error: "identity not found", witness };
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "actor") && String(body.actor || "") !== existing.actor) {
    const witness = fail(world, {
      process: "identity.update.failed",
      actor: actor || backendHost,
      body: { reason: "identity actor is immutable in this slice", id: input.id, actor: body.actor }
    });
    return { ok: false, status: 400, error: "identity actor is immutable in this slice", witness };
  }
  const nextIdentity = {
    id: existing.id,
    actor: existing.actor,
    label: Object.prototype.hasOwnProperty.call(body ?? {}, "label") ? input.label : existing.label,
    username: Object.prototype.hasOwnProperty.call(body ?? {}, "username") ? input.username : existing.username,
    password: Object.prototype.hasOwnProperty.call(body ?? {}, "password") ? input.password : existing.password,
    homeContext: Object.prototype.hasOwnProperty.call(body ?? {}, "homeContext")
      ? (typeof input.homeContext === "string" && input.homeContext.trim() ? input.homeContext.trim() : null)
      : existing.homeContext,
    homePerspective: Object.prototype.hasOwnProperty.call(body ?? {}, "homePerspective")
      ? (typeof input.homePerspective === "string" && input.homePerspective.trim() ? input.homePerspective.trim() : null)
      : existing.homePerspective
  };
  updateIdentity(world, {
    actor: actor || backendHost,
    id: nextIdentity.id,
    label: nextIdentity.label,
    username: nextIdentity.username,
    password: nextIdentity.password,
    homeContext: nextIdentity.homeContext,
    homePerspective: nextIdentity.homePerspective
  });
  const witness = world.emit({
    process: "identity.update",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", nextIdentity.id)],
    body: { identity: nextIdentity }
  });
  return { ok: true, status: 200, identity: nextIdentity, witness };
}

export function requestBootstrapContextDefine(world, {
  actor,
  backendHost,
  body,
  owner = actor || backendHost
}) {
  const validated = validateInput(world, "context.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "context.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (exists(world, input.id)) {
    const witness = fail(world, {
      process: "context.define.failed",
      actor: actor || backendHost,
      body: { reason: "context id already exists", id: input.id }
    });
    return { ok: false, status: 409, error: "context id already exists", witness };
  }
  if (input.parent && !exists(world, input.parent)) {
    const witness = fail(world, {
      process: "context.define.failed",
      actor: actor || backendHost,
      body: { reason: "parent context not found", parent: input.parent }
    });
    return { ok: false, status: 400, error: "parent context not found", witness };
  }
  const stewardsParsed = normalizeJsonArray(parseJsonField(body.stewardsJson, "stewardsJson"), "stewardsJson");
  if (!stewardsParsed.ok) {
    const witness = fail(world, { process: "context.define.failed", actor: actor || backendHost, body: { reason: stewardsParsed.error } });
    return { ok: false, status: 400, error: stewardsParsed.error, witness };
  }
  defineContext(world, {
    actor: actor || backendHost,
    id: input.id,
    label: input.label ?? input.id,
    parent: input.parent ?? null,
    owner: input.owner ?? owner,
    stewards: stewardsParsed.value
  });
  const row = world.project(moduleProjectors.contexts).find(entry => entry.id === input.id) ?? null;
  const witness = world.emit({
    process: "context.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.id)],
    body: { context: row ?? { id: input.id, label: input.label ?? input.id, parent: input.parent ?? null } }
  });
  return { ok: true, status: 201, context: row, witness };
}

export function requestBootstrapPerspectiveDefine(world, {
  actor,
  backendHost,
  body,
  owner = actor || backendHost
}) {
  const validated = validateInput(world, "perspective.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "perspective.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (exists(world, input.id)) {
    const witness = fail(world, {
      process: "perspective.define.failed",
      actor: actor || backendHost,
      body: { reason: "perspective id already exists", id: input.id }
    });
    return { ok: false, status: 409, error: "perspective id already exists", witness };
  }
  if (input.context && !world.project(moduleProjectors.contexts).some(row => row.id === input.context)) {
    const witness = fail(world, {
      process: "perspective.define.failed",
      actor: actor || backendHost,
      body: { reason: "context not found", context: input.context }
    });
    return { ok: false, status: 400, error: "context not found", witness };
  }
  definePerspective(world, {
    actor: actor || backendHost,
    id: input.id,
    title: input.title,
    context: input.context ?? null,
    owner
  });
  const perspective = world.project(moduleProjectors.perspectives).find(row => row.id === input.id) ?? null;
  const witness = world.emit({
    process: "perspective.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.id)],
    body: { perspective: perspective ?? { id: input.id, title: input.title, context: input.context ?? null } }
  });
  return { ok: true, status: 201, perspective, witness };
}

export function requestBootstrapContextBindingCreate(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "context.bind", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "context.bind.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  const bindingValidation = validateContextBinding(world.allWitnesses(), input);
  if (!bindingValidation.ok) {
    const witness = fail(world, {
      process: "context.bind.failed",
      actor: actor || backendHost,
      body: { reason: bindingValidation.error, ...(bindingValidation.details ?? {}) }
    });
    return { ok: false, status: bindingValidation.status ?? 400, error: bindingValidation.error, witness };
  }
  const witness = bindContextName(world, {
    actor: actor || backendHost,
    context: input.context,
    name: input.name,
    target: input.target
  });
  const binding = world.project(moduleProjectors.contextBindings)
    .find(row => row.context === input.context && row.name === input.name && row.target === input.target) ?? input;
  return { ok: true, status: 201, contextBinding: binding, witness };
}

export function requestBootstrapContextBindingRemove(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "context.unbind", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "context.unbind.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  const existing = world.project(moduleProjectors.contextBindings)
    .find(row => row.context === input.context && row.name === input.name && row.target === input.target);
  if (!existing) {
    const witness = fail(world, {
      process: "context.unbind.failed",
      actor: actor || backendHost,
      body: { reason: "binding not found", context: input.context, name: input.name, target: input.target }
    });
    return { ok: false, status: 404, error: "binding not found", witness };
  }
  const witness = unbindContextName(world, {
    actor: actor || backendHost,
    context: input.context,
    name: input.name,
    target: input.target
  });
  return { ok: true, status: 200, contextBinding: input, witness };
}

export function requestBootstrapContextExportCreate(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "context.export", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "context.export.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  const exportValidation = validateContextExport(world.allWitnesses(), input);
  if (!exportValidation.ok) {
    const witness = fail(world, {
      process: "context.export.failed",
      actor: actor || backendHost,
      body: { reason: exportValidation.error, ...(exportValidation.details ?? {}) }
    });
    return { ok: false, status: exportValidation.status ?? 400, error: exportValidation.error, witness };
  }
  const witness = exportContextName(world, {
    actor: actor || backendHost,
    context: input.context,
    name: input.name,
    target: input.target
  });
  const contextExport = world.project(moduleProjectors.contextExports)
    .find(row => row.context === input.context && row.name === input.name && row.target === input.target) ?? input;
  return { ok: true, status: 201, contextExport, witness };
}

export function requestBootstrapContextExportRemove(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "context.unexport", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "context.unexport.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (!exportedTarget(world, input)) {
    const witness = fail(world, {
      process: "context.unexport.failed",
      actor: actor || backendHost,
      body: { reason: "export not found", context: input.context, name: input.name, target: input.target }
    });
    return { ok: false, status: 404, error: "export not found", witness };
  }
  const witness = unexportContextName(world, {
    actor: actor || backendHost,
    context: input.context,
    name: input.name,
    target: input.target
  });
  return { ok: true, status: 200, contextExport: input, witness };
}

export function requestBootstrapContextImportCreate(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "context.import", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "context.import.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  const importValidation = validateContextImport(world.allWitnesses(), input);
  if (!importValidation.ok) {
    const witness = fail(world, {
      process: "context.import.failed",
      actor: actor || backendHost,
      body: { reason: importValidation.error, ...(importValidation.details ?? {}) }
    });
    return { ok: false, status: importValidation.status ?? 400, error: importValidation.error, witness };
  }
  const localName = importValidation.name ?? input.name ?? input.exportName;
  const witness = importContextName(world, {
    actor: actor || backendHost,
    context: input.context,
    sourceContext: input.sourceContext,
    exportName: input.exportName,
    name: localName
  });
  const contextImport = world.project(moduleProjectors.contextImports)
    .find(row =>
      row.context === input.context
      && row.sourceContext === input.sourceContext
      && row.exportName === input.exportName
      && row.name === localName
    ) ?? { ...input, name: localName };
  return { ok: true, status: 201, contextImport, witness };
}

export function requestBootstrapContextImportRemove(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "context.unimport", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "context.unimport.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  const localName = input.name ?? input.exportName;
  if (!importedNameExists(world, { context: input.context, sourceContext: input.sourceContext, exportName: input.exportName, name: localName })) {
    const witness = fail(world, {
      process: "context.unimport.failed",
      actor: actor || backendHost,
      body: { reason: "import not found", context: input.context, sourceContext: input.sourceContext, exportName: input.exportName, name: localName }
    });
    return { ok: false, status: 404, error: "import not found", witness };
  }
  const witness = unimportContextName(world, {
    actor: actor || backendHost,
    context: input.context,
    sourceContext: input.sourceContext,
    exportName: input.exportName,
    name: localName
  });
  return { ok: true, status: 200, contextImport: { ...input, name: localName }, witness };
}

export function requestBootstrapStewardshipGrant(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "stewardship.grant", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "stewardship.grant.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (!exists(world, input.target)) {
    const witness = fail(world, {
      process: "stewardship.grant.failed",
      actor: actor || backendHost,
      body: { reason: "target not found", target: input.target }
    });
    return { ok: false, status: 404, error: "target not found", witness };
  }
  if (world.project(moduleProjectors.stewardships).some(row => row.steward === input.steward && row.target === input.target)) {
    const witness = fail(world, {
      process: "stewardship.grant.failed",
      actor: actor || backendHost,
      body: { reason: "stewardship already granted", steward: input.steward, target: input.target }
    });
    return { ok: false, status: 409, error: "stewardship already granted", witness };
  }
  grantStewardship(world, {
    actor: actor || backendHost,
    steward: input.steward,
    target: input.target,
    targetKind: input.targetKind ?? null
  });
  const row = world.project(moduleProjectors.stewardships).find(entry => entry.steward === input.steward && entry.target === input.target) ?? null;
  const witness = world.emit({
    process: "stewardship.grant",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.target)],
    body: { stewardship: row ?? input }
  });
  return { ok: true, status: 201, stewardship: row ?? input, witness };
}

export function requestBootstrapStewardshipRevoke(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "stewardship.revoke", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "stewardship.revoke.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (!world.project(moduleProjectors.stewardships).some(row => row.steward === input.steward && row.target === input.target)) {
    const witness = fail(world, {
      process: "stewardship.revoke.failed",
      actor: actor || backendHost,
      body: { reason: "stewardship not found", steward: input.steward, target: input.target }
    });
    return { ok: false, status: 404, error: "stewardship not found", witness };
  }
  revokeStewardship(world, {
    actor: actor || backendHost,
    steward: input.steward,
    target: input.target,
    targetKind: input.targetKind ?? null
  });
  const witness = world.emit({
    process: "stewardship.revoke",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.target)],
    body: { steward: input.steward, target: input.target, targetKind: input.targetKind ?? null }
  });
  return { ok: true, status: 200, stewardship: input, witness };
}

export function requestBootstrapRouteDefine(world, {
  actor,
  backendHost,
  body,
  allowedHandlers = [],
  handlerMetadataById = {}
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
  const handlerMetadata = handlerMetadataById?.[input.handler] ?? {};
  const routeKind = typeof handlerMetadata.routeKind === "string" && handlerMetadata.routeKind.trim()
    ? handlerMetadata.routeKind.trim()
    : (input.handler === "backendProgram.run" ? "backendProgram" : (input.handler.startsWith("page.") ? "page" : "json"));
  const supportedMethods = Array.isArray(handlerMetadata.methods)
    ? handlerMetadata.methods.map(value => String(value).trim().toUpperCase()).filter(Boolean)
    : [];
  if (supportedMethods.length && !supportedMethods.includes(String(input.method || "").toUpperCase())) {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "handler does not support method", handler: input.handler, method: input.method, supportedMethods }
    });
    return { ok: false, status: 400, error: "handler does not support method", witness };
  }
  const backendProgramResolved = resolveBodyRef(world, body, {
    contextField: "context",
    idField: "backendProgramSoul",
    refField: "backendProgramSoulRef",
    label: "backend program soul"
  });
  if (!backendProgramResolved.ok) {
    const witness = fail(world, { process: "route.define.failed", actor: actor || backendHost, body: { reason: backendProgramResolved.error } });
    return { ok: false, status: 400, error: backendProgramResolved.error, witness };
  }
  const servesResolved = resolveBodyRef(world, body, {
    contextField: "context",
    idField: "serves",
    refField: "servesRef",
    label: "route serves"
  });
  if (!servesResolved.ok) {
    const witness = fail(world, { process: "route.define.failed", actor: actor || backendHost, body: { reason: servesResolved.error } });
    return { ok: false, status: 400, error: servesResolved.error, witness };
  }
  const params = {};
  const rootWidgetResolved = resolveBodyRef(world, body, {
    contextField: "context",
    idField: "rootWidget",
    refField: "rootWidgetRef",
    label: "route root widget"
  });
  if (!rootWidgetResolved.ok) {
    const witness = fail(world, { process: "route.define.failed", actor: actor || backendHost, body: { reason: rootWidgetResolved.error } });
    return { ok: false, status: 400, error: rootWidgetResolved.error, witness };
  }
  if (typeof rootWidgetResolved.target === "string" && rootWidgetResolved.target.trim()) params.rootWidget = rootWidgetResolved.target.trim();
  if (typeof body.frontendProgram === "string" && body.frontendProgram.trim()) params.frontendProgram = body.frontendProgram.trim();
  if (typeof body.page === "string" && body.page.trim()) params.page = body.page.trim();
  if (body.liveProjection === true) params.liveProjection = true;
  if (Array.isArray(body.excludeWidgetRoles) && body.excludeWidgetRoles.length) params.excludeWidgetRoles = [...body.excludeWidgetRoles];
  if (typeof body.defaultRootWidget === "string" && body.defaultRootWidget.trim()) params.rootWidget = body.defaultRootWidget.trim();
  const resolvedServes = servesResolved.target ?? input.serves ?? null;
  if (!resolvedServes) {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "route serves target is required" }
    });
    return { ok: false, status: 400, error: "route serves target is required", witness };
  }
  const backendProgramSoul = backendProgramResolved.target ?? null;
  if (backendProgramSoul && routeKind !== "backendProgram") {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "backend program routes must use backendProgram.run", handler: input.handler, backendProgramSoul }
    });
    return { ok: false, status: 400, error: "backend program routes must use backendProgram.run", witness };
  }
  if (routeKind === "backendProgram" && !backendProgramSoul) {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "backendProgram.run requires backendProgramSoul", handler: input.handler }
    });
    return { ok: false, status: 400, error: "backendProgram.run requires backendProgramSoul", witness };
  }
  if (routeKind === "backendProgram" && (params.rootWidget || body.frontendProgram || body.page || body.liveProjection === true || Array.isArray(body.excludeWidgetRoles) || (typeof body.defaultRootWidget === "string" && body.defaultRootWidget.trim()))) {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "backend program routes cannot also declare page/frontend params", handler: input.handler }
    });
    return { ok: false, status: 400, error: "backend program routes cannot also declare page/frontend params", witness };
  }
  if (routeKind === "stream" && (params.rootWidget || body.frontendProgram || body.page || body.liveProjection === true || Array.isArray(body.excludeWidgetRoles) || (typeof body.defaultRootWidget === "string" && body.defaultRootWidget.trim()) || backendProgramSoul)) {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "stream routes cannot declare page or backend-program params", handler: input.handler }
    });
    return { ok: false, status: 400, error: "stream routes cannot declare page or backend-program params", witness };
  }
  if (backendProgramSoul) {
    const backendPrograms = new Set(backendProgramsProjection(world.allWitnesses()).map(row => row.soul));
    if (!backendPrograms.has(backendProgramSoul)) {
      const witness = fail(world, {
        process: "route.define.failed",
        actor: actor || backendHost,
        body: { reason: "backend program not found", backendProgramSoul }
      });
      return { ok: false, status: 400, error: "backend program not found", witness };
    }
    params.backendProgramSoul = backendProgramSoul;
  }
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
    serves: resolvedServes,
    method: input.method,
    handler: input.handler,
    params: Object.keys(params).length ? params : null,
    context: input.context ?? null,
    owner: actor || backendHost
  });
  const route = {
    id: input.id,
    path: input.path,
    serves: resolvedServes,
    method: input.method,
    handler: input.handler,
    params: Object.keys(params).length ? params : null,
    context: input.context ?? null
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
  const serverRunnerResolved = resolveBodyRef(world, body, {
    contextField: "context",
    idField: "serverRunner",
    refField: "serverRunnerRef",
    label: "server runner"
  });
  if (!serverRunnerResolved.ok) {
    const witness = fail(world, { process: "serve.define.failed", actor: actor || backendHost, body: { reason: serverRunnerResolved.error } });
    return { ok: false, status: 400, error: serverRunnerResolved.error, witness };
  }
  const routeResolved = resolveBodyRef(world, body, {
    contextField: "context",
    idField: "route",
    refField: "routeRef",
    label: "route"
  });
  if (!routeResolved.ok) {
    const witness = fail(world, { process: "serve.define.failed", actor: actor || backendHost, body: { reason: routeResolved.error } });
    return { ok: false, status: 400, error: routeResolved.error, witness };
  }
  const resolvedServerRunner = serverRunnerResolved.target ?? input.serverRunner ?? null;
  const resolvedRoute = routeResolved.target ?? input.route ?? null;
  if (!resolvedServerRunner || !resolvedRoute) {
    const witness = fail(world, {
      process: "serve.define.failed",
      actor: actor || backendHost,
      body: { reason: "serverRunner and route are required", serverRunner: resolvedServerRunner, route: resolvedRoute }
    });
    return { ok: false, status: 400, error: "serverRunner and route are required", witness };
  }
  if (!exists(world, resolvedServerRunner) || !exists(world, resolvedRoute)) {
    const witness = fail(world, {
      process: "serve.define.failed",
      actor: actor || backendHost,
      body: { reason: "serverRunner or route missing", serverRunner: resolvedServerRunner, route: resolvedRoute }
    });
    return { ok: false, status: 400, error: "serverRunner or route missing", witness };
  }
  serveRoute(world, {
    actor: actor || backendHost,
    serverRunner: resolvedServerRunner,
    route: resolvedRoute
  });
  const witness = world.emit({
    process: "serve.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", resolvedServerRunner)],
    body: { serverRunner: resolvedServerRunner, route: resolvedRoute, context: input.context ?? null }
  });
  return { ok: true, status: 201, serve: { serverRunner: resolvedServerRunner, route: resolvedRoute, context: input.context ?? null }, witness };
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

  const resolvedParent = resolveBodyRef(world, body, {
    contextField: "context",
    idField: "parent",
    refField: "parentRef",
    label: "parent widget"
  });
  if (!resolvedParent.ok) {
    const witness = fail(world, {
      process: "widget.define.failed",
      actor: actor || backendHost,
      body: { reason: resolvedParent.error }
    });
    return { ok: false, status: 400, error: resolvedParent.error, witness };
  }

  const input = {
    ...validatedInput.value,
    ...(resolvedParent.target ? { parent: resolvedParent.target } : {})
  };
  const attach = input.attach !== false;
  const parent = attach
    ? (typeof input.parent === "string" && input.parent.trim()
        ? input.parent.trim()
        : defaultParent)
    : null;
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
  const validatedOutput = attach
    ? validateOutput(world, "widget.define", output)
    : { ok: true, value: output, failures: [], spec: null };
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
    context: input.context ?? null,
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
  const widget = { id, kind: input.kind, parent: attach ? parent : null, order, props, context: input.context ?? null };
  const witness = world.emit({
    process: "widget.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", parent || id)],
    body: { input, widget }
  });
  return { ok: true, status: 201, widget, witness };
}

export function requestWidgetUpdate(world, {
  actor,
  backendHost,
  body
}) {
  const validatedInput = validateInput(world, "widget.update", body);
  if (!validatedInput.ok) {
    const witness = fail(world, {
      process: "widget.update.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validatedInput.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validatedInput.value;
  const current = widgetDefinitions(world.allWitnesses()).find(row => row.id === input.id) ?? null;
  if (!current) {
    const witness = fail(world, {
      process: "widget.update.failed",
      actor: actor || backendHost,
      body: { reason: "widget not found", id: input.id }
    });
    return { ok: false, status: 404, error: "widget not found", witness };
  }
  if (widgetVersions(world.allWitnesses()).some(row => row.soul === input.id)) {
    const witness = fail(world, {
      process: "widget.update.failed",
      actor: actor || backendHost,
      body: { reason: "versioned widgets must be edited through widget versions", id: input.id }
    });
    return { ok: false, status: 409, error: "versioned widgets must be edited through widget versions", witness };
  }
  const patch = patchFromWidgetUpdateInput(input, body);
  if (!Object.keys(patch).length) {
    const witness = fail(world, {
      process: "widget.update.failed",
      actor: actor || backendHost,
      body: { reason: "no editable widget fields provided", id: input.id }
    });
    return { ok: false, status: 400, error: "no editable widget fields provided", witness };
  }
  const nextProps = { ...(current.props ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "hidden") {
      if (value === true) nextProps.hidden = true;
      else delete nextProps.hidden;
      continue;
    }
    if (value === "") delete nextProps[key];
    else nextProps[key] = value;
  }
  const output = { id: current.id };
  if (typeof nextProps.text === "string") output.text = nextProps.text;
  if (typeof nextProps.title === "string") output.title = nextProps.title;
  if (typeof nextProps.class === "string") output.class = nextProps.class;
  if (nextProps.hidden === true) output.hidden = true;
  const validatedOutput = validateOutput(world, "widget.update", output);
  if (!validatedOutput.ok) {
    const witness = fail(world, {
      process: "widget.update.failed",
      actor: actor || backendHost,
      body: { failures: validatedOutput.failures, id: input.id }
    });
    return { ok: false, status: 500, error: "widget.update output failed typed validation", witness };
  }
  updateWidget(world, {
    actor: actor || backendHost,
    id: current.id,
    kind: current.kind,
    props: nextProps,
    context: current.context ?? null
  });
  const widget = {
    id: current.id,
    kind: current.kind,
    props: nextProps,
    context: current.context ?? null
  };
  const witness = world.emit({
    process: "widget.update",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", current.id)],
    body: { input, patch, previous: { props: current.props ?? {} }, widget }
  });
  return { ok: true, status: 200, widget, witness };
}
