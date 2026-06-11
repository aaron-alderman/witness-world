import { projectors, relation } from "./kernel.js";
import { thingId } from "./ids.js";
import { createIdentity, createServerRunner, defineRoute, serveRoute } from "./modules.js";
import { defineFrontendProgram, defineFrontendStep, defineWidget, attachWidget } from "./widgets.js";
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

function propsFromWidgetInput(input) {
  const props = {};
  const direct = ["text", "title", "class", "role", "href", "name", "placeholder", "autocomplete", "type", "action", "label", "valueType", "eventSoul", "eventVersion"];
  for (const key of direct) {
    if (typeof input[key] === "string" && input[key] !== "") props[key] = input[key];
  }
  if (typeof input.dataId === "string" && input.dataId !== "") props["data-id"] = input.dataId;
  if (typeof input.dataDone === "string" && input.dataDone !== "") props["data-done"] = input.dataDone;
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
