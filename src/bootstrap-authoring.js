import { projectors, relation } from "./kernel.js";
import { thingId } from "./ids.js";
import {
  createIdentity,
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
  createProposal,
  approveProposal,
  rejectProposal,
  createServerRunner,
  defineRoute,
  serveRoute,
  defineCapability,
  installCapability,
  removeCapability,
  moduleProjectors
} from "./modules.js";
import { defineFrontendProgram, defineFrontendStep, defineWidget, updateWidget, attachWidget, widgetDefinitions, widgetVersions } from "./widgets.js";
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
  if (typeof input.tutorialTarget === "string" && input.tutorialTarget !== "") props["data-tutorial-target"] = input.tutorialTarget;
  if (input.template === true) props.template = true;
  if (Number.isFinite(Number(input.level))) props.level = Number(input.level);
  return props;
}

function patchFromWidgetUpdateInput(input, body) {
  const patch = {};
  for (const key of ["text", "title", "class"]) {
    if (Object.prototype.hasOwnProperty.call(body ?? {}, key) && typeof input[key] === "string") patch[key] = input[key];
  }
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

export function requestBootstrapProposalCreate(world, {
  actor,
  backendHost,
  body,
  owner = actor || backendHost
}) {
  const validated = validateInput(world, "proposal.create", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "proposal.create.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (exists(world, input.id)) {
    const witness = fail(world, {
      process: "proposal.create.failed",
      actor: actor || backendHost,
      body: { reason: "proposal id already exists", id: input.id }
    });
    return { ok: false, status: 409, error: "proposal id already exists", witness };
  }
  const bodyParsed = normalizeJsonObject(parseJsonField(body.bodyJson, "bodyJson"), "bodyJson");
  if (!bodyParsed.ok) {
    const witness = fail(world, { process: "proposal.create.failed", actor: actor || backendHost, body: { reason: bodyParsed.error } });
    return { ok: false, status: 400, error: bodyParsed.error, witness };
  }
  createProposal(world, {
    actor: actor || backendHost,
    id: input.id,
    targetProcess: input.targetProcess,
    targetKind: input.targetKind,
    targetId: input.targetId ?? null,
    body: bodyParsed.value ?? {},
    reason: input.reason ?? null,
    owner
  });
  const proposal = world.project(moduleProjectors.proposals).find(row => row.id === input.id) ?? null;
  const witness = world.emit({
    process: "proposal.create",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.id)],
    body: { proposal }
  });
  return { ok: true, status: 201, proposal, witness };
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
  const backendHostResolved = resolveBodyRef(world, body, {
    contextField: "context",
    idField: "backendHost",
    refField: "backendHostRef",
    label: "backend host"
  });
  if (!backendHostResolved.ok) {
    const witness = fail(world, { process: "serverRunner.define.failed", actor: actor || backendHost, body: { reason: backendHostResolved.error } });
    return { ok: false, status: 400, error: backendHostResolved.error, witness };
  }
  const frontendHostResolved = resolveBodyRef(world, body, {
    contextField: "context",
    idField: "frontendHost",
    refField: "frontendHostRef",
    label: "frontend host"
  });
  if (!frontendHostResolved.ok) {
    const witness = fail(world, { process: "serverRunner.define.failed", actor: actor || backendHost, body: { reason: frontendHostResolved.error } });
    return { ok: false, status: 400, error: frontendHostResolved.error, witness };
  }
  const resolvedBackendHost = backendHostResolved.target ?? input.backendHost ?? null;
  const resolvedFrontendHost = frontendHostResolved.target ?? input.frontendHost ?? null;
  if (!resolvedBackendHost || !resolvedFrontendHost) {
    const witness = fail(world, {
      process: "serverRunner.define.failed",
      actor: actor || backendHost,
      body: { reason: "backendHost and frontendHost are required" }
    });
    return { ok: false, status: 400, error: "backendHost and frontendHost are required", witness };
  }
  if (!exists(world, resolvedBackendHost) || !exists(world, resolvedFrontendHost)) {
    const witness = fail(world, {
      process: "serverRunner.define.failed",
      actor: actor || backendHost,
      body: { reason: "host not found", backendHost: resolvedBackendHost, frontendHost: resolvedFrontendHost }
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
  const runtimeConfigParsed = normalizeJsonObject(parseJsonField(body.runtimeConfigJson, "runtimeConfigJson"), "runtimeConfigJson");
  if (!runtimeConfigParsed.ok) {
    const witness = fail(world, {
      process: "serverRunner.define.failed",
      actor: actor || backendHost,
      body: { reason: runtimeConfigParsed.error }
    });
    return { ok: false, status: 400, error: runtimeConfigParsed.error, witness };
  }
  const storage = {};
  if (input.todoProjection) storage.todoProjection = input.todoProjection;
  if (input.privateNotesProjection) storage.privateNotesProjection = input.privateNotesProjection;
  createServerRunner(world, {
    actor: actor || backendHost,
    id: input.id,
    backendHost: resolvedBackendHost,
    frontendHost: resolvedFrontendHost,
    handlerSet: input.handlerSet || null,
    storage: Object.keys(storage).length ? storage : null,
    runtimeConfig: runtimeConfigParsed.value,
    allowActorHeader: input.allowActorHeader === true,
    context: input.context ?? null,
    owner: actor || backendHost
  });
  const runner = {
    id: input.id,
    backendHost: resolvedBackendHost,
    frontendHost: resolvedFrontendHost,
    handlerSet: input.handlerSet || null,
    storage: Object.keys(storage).length ? storage : null,
    runtimeConfig: runtimeConfigParsed.value,
    allowActorHeader: input.allowActorHeader === true,
    context: input.context ?? null
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
  const resolvedRootWidget = resolveBodyRef(world, body, {
    contextField: "context",
    idField: "rootWidget",
    refField: "rootWidgetRef",
    label: "root widget"
  });
  if (!resolvedRootWidget.ok) {
    const witness = fail(world, {
      process: "frontendProgram.define.failed",
      actor: actor || backendHost,
      body: { reason: resolvedRootWidget.error }
    });
    return { ok: false, status: 400, error: resolvedRootWidget.error, witness };
  }
  const input = {
    ...validated.value,
    ...(resolvedRootWidget.target ? { rootWidget: resolvedRootWidget.target } : {})
  };
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
    context: input.context ?? null,
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
    if (value === "") delete nextProps[key];
    else nextProps[key] = value;
  }
  const output = { id: current.id };
  if (typeof nextProps.text === "string") output.text = nextProps.text;
  if (typeof nextProps.title === "string") output.title = nextProps.title;
  if (typeof nextProps.class === "string") output.class = nextProps.class;
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

export function requestBootstrapProposalApprove(world, {
  actor,
  backendHost,
  proposalId,
  executeTarget
}) {
  const proposal = world.project(moduleProjectors.proposals).find(row => row.id === proposalId) ?? null;
  if (!proposal) {
    const witness = fail(world, {
      process: "proposal.approve.failed",
      actor: actor || backendHost,
      body: { reason: "proposal not found", id: proposalId }
    });
    return { ok: false, status: 404, error: "proposal not found", witness };
  }
  if (proposal.status !== "open") {
    const witness = fail(world, {
      process: "proposal.approve.failed",
      actor: actor || backendHost,
      body: { reason: "proposal is not open", id: proposalId, status: proposal.status }
    });
    return { ok: false, status: 409, error: "proposal is not open", witness };
  }
  const executed = executeTarget(proposal);
  if (!executed.ok) return executed;
  approveProposal(world, {
    actor: actor || backendHost,
    id: proposalId,
    executedWitnessIds: executed.witnessIds ?? []
  });
  const approved = world.project(moduleProjectors.proposals).find(row => row.id === proposalId) ?? proposal;
  const witness = world.emit({
    process: "proposal.approve",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", proposalId)],
    body: { proposal: approved }
  });
  return { ok: true, status: 200, proposal: approved, witness };
}

export function requestBootstrapProposalReject(world, {
  actor,
  backendHost,
  proposalId,
  reason = null
}) {
  const proposal = world.project(moduleProjectors.proposals).find(row => row.id === proposalId) ?? null;
  if (!proposal) {
    const witness = fail(world, {
      process: "proposal.reject.failed",
      actor: actor || backendHost,
      body: { reason: "proposal not found", id: proposalId }
    });
    return { ok: false, status: 404, error: "proposal not found", witness };
  }
  if (proposal.status !== "open") {
    const witness = fail(world, {
      process: "proposal.reject.failed",
      actor: actor || backendHost,
      body: { reason: "proposal is not open", id: proposalId, status: proposal.status }
    });
    return { ok: false, status: 409, error: "proposal is not open", witness };
  }
  rejectProposal(world, {
    actor: actor || backendHost,
    id: proposalId,
    reason
  });
  const rejected = world.project(moduleProjectors.proposals).find(row => row.id === proposalId) ?? proposal;
  const witness = world.emit({
    process: "proposal.reject",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", proposalId)],
    body: { proposal: rejected }
  });
  return { ok: true, status: 200, proposal: rejected, witness };
}
