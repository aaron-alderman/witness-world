import { projectors, relation } from "../../src/kernel.js";
import { CONTEXTUAL_CANONICAL_ID_POLICY_CLASSES, resolveContextualRef } from "../../src/modules.js";
import { defineFrontendProgram, defineFrontendStep } from "../../src/widgets.js";
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
import { processSpecFor, typeModelProjection, validateProcessInput } from "../../src/type-model.js";

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

function resolveBodyRef(world, body, {
  contextField = "context",
  idField,
  refField,
  label,
  allowedCanonicalIdPolicyClasses = null
}) {
  return resolveContextualRef(world.allWitnesses(), {
    context: body?.[contextField] ?? null,
    id: body?.[idField] ?? null,
    ref: body?.[refField] ?? null,
    label,
    allowedCanonicalIdPolicyClasses
  });
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
    label: "root widget",
    allowedCanonicalIdPolicyClasses: CONTEXTUAL_CANONICAL_ID_POLICY_CLASSES
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

export function requestBootstrapBackendProgramDefine(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "backendProgram.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "backendProgram.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (exists(world, input.soul)) {
    const witness = fail(world, {
      process: "backendProgram.define.failed",
      actor: actor || backendHost,
      body: { reason: "backend program soul already exists", soul: input.soul }
    });
    return { ok: false, status: 409, error: "backend program soul already exists", witness };
  }
  defineBackendProgram(world, {
    actor: actor || backendHost,
    soul: input.soul,
    label: input.label ?? input.soul,
    context: input.context ?? null,
    owner: actor || backendHost
  });
  const backendProgram = {
    soul: input.soul,
    label: input.label ?? input.soul,
    context: input.context ?? null
  };
  const witness = world.emit({
    process: "backendProgram.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.soul)],
    body: { backendProgram }
  });
  return { ok: true, status: 201, backendProgram, witness };
}

export function requestBootstrapBackendProgramVersionDefine(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "backendProgramVersion.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "backendProgramVersion.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  const backendPrograms = new Set(backendProgramsProjection(world.allWitnesses()).map(row => row.soul));
  if (!backendPrograms.has(input.soul)) {
    const witness = fail(world, {
      process: "backendProgramVersion.define.failed",
      actor: actor || backendHost,
      body: { reason: "backend program not found", soul: input.soul }
    });
    return { ok: false, status: 400, error: "backend program not found", witness };
  }
  if (exists(world, input.version)) {
    const witness = fail(world, {
      process: "backendProgramVersion.define.failed",
      actor: actor || backendHost,
      body: { reason: "backend program version already exists", version: input.version }
    });
    return { ok: false, status: 409, error: "backend program version already exists", witness };
  }
  const versions = backendProgramVersionsProjection(world.allWitnesses()).filter(row => row.soul === input.soul);
  const index = Number.isFinite(Number(input.index)) ? Number(input.index) : versions.length;
  defineBackendProgramVersion(world, {
    actor: actor || backendHost,
    soul: input.soul,
    version: input.version,
    index,
    context: input.context ?? null,
    owner: actor || backendHost
  });
  if (typeof input.transitionFrom === "string" && input.transitionFrom.trim()) {
    defineBackendProgramVersionTransition(world, {
      actor: actor || backendHost,
      soul: input.soul,
      from: input.transitionFrom.trim(),
      to: input.version,
      strategy: input.transitionStrategy || "block",
      owner: actor || backendHost
    });
  }
  const backendProgramVersion = {
    soul: input.soul,
    version: input.version,
    index,
    transitionFrom: input.transitionFrom ?? null,
    transitionStrategy: input.transitionStrategy ?? null,
    context: input.context ?? null
  };
  const witness = world.emit({
    process: "backendProgramVersion.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.soul)],
    body: { backendProgramVersion }
  });
  return { ok: true, status: 201, backendProgramVersion, witness };
}

export function requestBootstrapBackendStepDefine(world, {
  actor,
  backendHost,
  body,
  allowedOps = []
}) {
  const validated = validateInput(world, "backendStep.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "backendStep.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (!exists(world, input.version)) {
    const witness = fail(world, {
      process: "backendStep.define.failed",
      actor: actor || backendHost,
      body: { reason: "backend program version not found", version: input.version }
    });
    return { ok: false, status: 400, error: "backend program version not found", witness };
  }
  if (allowedOps.length && !allowedOps.includes(input.op)) {
    const witness = fail(world, {
      process: "backendStep.define.failed",
      actor: actor || backendHost,
      body: { reason: "unknown backend op", op: input.op }
    });
    return { ok: false, status: 400, error: "unknown backend op", witness };
  }
  const paramsParsed = parseJsonField(body.paramsJson, "paramsJson");
  if (paramsParsed && !paramsParsed.ok) {
    const witness = fail(world, {
      process: "backendStep.define.failed",
      actor: actor || backendHost,
      body: { reason: paramsParsed.error }
    });
    return { ok: false, status: 400, error: paramsParsed.error, witness };
  }
  const whenParsed = parseJsonField(body.whenJson, "whenJson");
  if (whenParsed && !whenParsed.ok) {
    const witness = fail(world, {
      process: "backendStep.define.failed",
      actor: actor || backendHost,
      body: { reason: whenParsed.error }
    });
    return { ok: false, status: 400, error: whenParsed.error, witness };
  }
  const repeatParsed = parseJsonField(body.repeatJson, "repeatJson");
  if (repeatParsed && !repeatParsed.ok) {
    const witness = fail(world, {
      process: "backendStep.define.failed",
      actor: actor || backendHost,
      body: { reason: repeatParsed.error }
    });
    return { ok: false, status: 400, error: repeatParsed.error, witness };
  }
  const afterParsed = parseJsonField(body.afterJson, "afterJson");
  if (afterParsed && !afterParsed.ok) {
    const witness = fail(world, {
      process: "backendStep.define.failed",
      actor: actor || backendHost,
      body: { reason: afterParsed.error }
    });
    return { ok: false, status: 400, error: afterParsed.error, witness };
  }
  defineBackendStep(world, {
    actor: actor || backendHost,
    version: input.version,
    event: input.event,
    op: input.op,
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : 0,
    params: paramsParsed?.value && typeof paramsParsed.value === "object" ? paramsParsed.value : {},
    when: whenParsed?.value && typeof whenParsed.value === "object" ? whenParsed.value : null,
    repeat: repeatParsed?.value && typeof repeatParsed.value === "object" ? repeatParsed.value : null,
    after: Array.isArray(afterParsed?.value) ? afterParsed.value : []
  });
  const step = {
    version: input.version,
    event: input.event,
    op: input.op,
    order: Number.isFinite(Number(input.order)) ? Number(input.order) : 0
  };
  const witness = world.emit({
    process: "backendStep.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.version)],
    body: { step }
  });
  return { ok: true, status: 201, step, witness };
}

export function requestBootstrapBackendProgramVersionActivate(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "backendProgramVersion.activate", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "backendProgramVersion.activate.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const result = requestBackendProgramVersionActivation(world, {
    actor: actor || backendHost,
    soul: validated.value.soul,
    version: validated.value.version
  });
  return result.ok
    ? {
        ok: true,
        status: 200,
        activationStatus: result.status,
        witness: result.witness,
        witnesses: result.witnesses,
        backendProgramVersion: { soul: validated.value.soul, version: validated.value.version }
      }
    : {
        ok: false,
        status: result.status === "failed" ? 400 : 409,
        error: result.witness?.body?.reason || "backend program version activation failed",
        witness: result.witness
      };
}

export function requestBootstrapBackendProgramVersionRollback(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "backendProgramVersion.rollback", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "backendProgramVersion.rollback.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const result = rollbackBackendProgramVersion(world, {
    actor: actor || backendHost,
    soul: validated.value.soul
  });
  return result.ok
    ? {
        ok: true,
        status: 200,
        rollbackStatus: result.status,
        witness: result.witness,
        witnesses: result.witnesses,
        backendProgramVersion: { soul: validated.value.soul, version: result.version }
      }
    : {
        ok: false,
        status: 409,
        error: result.witness?.body?.reason || "backend program version rollback failed",
        witness: result.witness
      };
}
