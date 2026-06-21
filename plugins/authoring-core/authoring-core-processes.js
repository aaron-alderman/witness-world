import { projectors, relation } from "../../src/kernel.js";
import { thingId } from "../../src/ids.js";
import {
  applyWidgetReplace,
  classifyWidgetReplacement,
  rollbackWidgetReplace,
  widgetReplacementPropsFromInput
} from "../../src/widget-evolution.js";
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
  resolveCoveredContextualRef,
  grantStewardship,
  revokeStewardship,
  defineRoute,
  serveRoute,
  defineComputeModule,
  definePackageMaterializedFile,
  markPackageMaterializedFileDeleted,
  defineComputeModuleSmokeTest,
  markComputeModuleSmokeTestDeleted,
  definePackage,
  definePackageRevision,
  publishPackageRevision,
  definePackagePatch,
  definePackageNamespace,
  definePackageDependency,
  definePackageTransformer,
  moduleProjectors
} from "../../src/modules.js";
import { createCanonicalPackagePatch, normalizeCanonicalPath } from "../../src/package-authorship.js";
import { parseWitnessToml } from "../../src/dsl.js";
import { applyLegacyFrontendUplift } from "../../src/frontend-legacy-uplift.js";
import { defineFrontendProgram, defineFrontendStep, defineWidget, updateWidget, attachWidget, widgetDefinitions, widgetVersions } from "../../src/widgets.js";
import { normalizeInteractionTiming } from "../../src/runtime-surface-runtime-shared.js";
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
import { applyDesire, compileRvmToDesirePlus, createDesireDocument, createDesireNode } from "../../src/desire/index.js";





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

function resolveCoveredBodyRef(world, body, {
  contextField = "context",
  idField,
  refField,
  label
}) {
  return resolveCoveredContextualRef(world.allWitnesses(), {
    context: body?.[contextField] ?? null,
    id: body?.[idField] ?? null,
    ref: body?.[refField] ?? null,
    label
  });
}

function resolveCoveredNestedRef(world, values, {
  context = null,
  idField,
  refField,
  label
} = {}) {
  return resolveCoveredContextualRef(world.allWitnesses(), {
    context,
    id: values?.[idField] ?? null,
    ref: values?.[refField] ?? null,
    label
  });
}

export function resolveCoveredAuthoringRefInput(world, body, {
  contextField = "context",
  idField,
  refField,
  label
}) {
  return resolveCoveredBodyRef(world, body, {
    contextField,
    idField,
    refField,
    label
  });
}

export function requireCoveredAuthoringRefInput(world, body, options = {}) {
  const resolved = resolveCoveredAuthoringRefInput(world, body, options);
  if (!resolved.ok) return resolved;
  if (!resolved.target) {
    return {
      ok: false,
      error: `${options?.label ?? "reference"} is required`
    };
  }
  return resolved;
}

export function resolveStewardshipTargetInput(world, body, {
  contextField = "context",
  idField = "target",
  refField = "targetRef",
  label = "stewardship target"
} = {}) {
  const resolved = resolveCoveredBodyRef(world, body, {
    contextField,
    idField,
    refField,
    label
  });
  if (!resolved.ok) return resolved;
  if (!resolved.target) return { ok: false, error: `${label} is required` };
  return resolved;
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

function widgetUpdateOutputFromProps(id, props = {}) {
  const output = { id };
  if (typeof props.text === "string") output.text = props.text;
  if (typeof props.title === "string") output.title = props.title;
  if (typeof props.class === "string") output.class = props.class;
  if (props.hidden === true) output.hidden = true;
  return output;
}

function knownSurfaceIds(world) {
  return new Set(
    world.allWitnesses()
      .filter(witness => witness.process === "desire.defineSurface" && typeof witness.body?.id === "string" && witness.body.id.trim())
      .map(witness => witness.body.id.trim())
  );
}

function normalizeSurfaceCreateBody(body) {
  if (Array.isArray(body)) return { single: false, docs: body };
  return { single: true, docs: [body] };
}

function trimOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validateSurfaceInteractionTiming(interaction, docId, index) {
  const normalized = interaction && typeof interaction === "object" && !Array.isArray(interaction)
    ? interaction
    : null;
  if (!normalized || !Object.prototype.hasOwnProperty.call(normalized, "timing")) return;
  const timing = normalizeInteractionTiming(normalized.timing);
  if (!timing) {
    throw new Error(`surface ${docId} interaction ${index + 1} has invalid timing; expected { mode = "debounce" | "throttle", ms = positive integer }`);
  }
  const actionKind = trimOptionalString(normalized?.action?.kind);
  if (actionKind !== "deliver") {
    throw new Error(`surface ${docId} interaction ${index + 1} timing is only supported for deliver actions`);
  }
}

function surfaceCreateDocAt(body, index) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`surface doc ${index + 1} must be an object`);
  }
  const id = trimOptionalString(body.id);
  if (!id) throw new Error(`surface doc ${index + 1} requires id`);
  return {
    id,
    surfaceKind: body.surfaceKind ?? null,
    className: body.className ?? null,
    children: Array.isArray(body.children) ? [...body.children] : [],
    props: body.props && typeof body.props === "object" && !Array.isArray(body.props) ? { ...body.props } : {},
    processRef: trimOptionalString(body.processRef),
    projectionRefs: Array.isArray(body.projectionRefs) ? structuredClone(body.projectionRefs) : [],
    capabilityRefs: Array.isArray(body.capabilityRefs) ? structuredClone(body.capabilityRefs) : [],
    bindings: Array.isArray(body.bindings) ? structuredClone(body.bindings) : [],
    interactions: Array.isArray(body.interactions) ? structuredClone(body.interactions) : [],
    repeat: body.repeat && typeof body.repeat === "object" && !Array.isArray(body.repeat) ? structuredClone(body.repeat) : null,
    modelRef: body.modelRef ?? null,
    frame: body.frame ?? null,
    encoding: body.encoding && typeof body.encoding === "object" && !Array.isArray(body.encoding) ? structuredClone(body.encoding) : {},
    editable: Array.isArray(body.editable) ? structuredClone(body.editable) : [],
    layers: Array.isArray(body.layers) ? structuredClone(body.layers) : [],
    actor: trimOptionalString(body.actor),
    owner: trimOptionalString(body.owner),
    context: trimOptionalString(body.context)
  };
}

function validateSurfaceCreateDocs(world, docs) {
  const existing = knownSurfaceIds(world);
  const batchIds = new Set();
  const normalized = docs.map((doc, index) => surfaceCreateDocAt(doc, index));
  for (const doc of normalized) {
    if (existing.has(doc.id)) throw new Error(`surface id already exists: ${doc.id}`);
    if (batchIds.has(doc.id)) throw new Error(`duplicate surface id in request: ${doc.id}`);
    batchIds.add(doc.id);
  }
  for (const doc of normalized) {
    for (const child of doc.children) {
      const childId = trimOptionalString(child);
      if (!childId) throw new Error(`surface ${doc.id} has an invalid child reference`);
      if (!existing.has(childId) && !batchIds.has(childId)) {
        throw new Error(`surface ${doc.id} references unknown child surface: ${childId}`);
      }
    }
    for (let index = 0; index < doc.interactions.length; index += 1) {
      validateSurfaceInteractionTiming(doc.interactions[index], doc.id, index);
    }
  }
  return normalized;
}

function surfaceCreateNode(doc, { actor, backendHost, index }) {
  return createDesireNode({
    kind: "surface",
    name: doc.id,
    body: {
      surfaceKind: doc.surfaceKind,
      className: doc.className,
      children: [...doc.children],
      props: structuredClone(doc.props),
      processRef: doc.processRef,
      projectionRefs: structuredClone(doc.projectionRefs),
      capabilityRefs: structuredClone(doc.capabilityRefs),
      bindings: structuredClone(doc.bindings),
      interactions: structuredClone(doc.interactions),
      repeat: structuredClone(doc.repeat),
      modelRef: doc.modelRef,
      frame: doc.frame,
      encoding: structuredClone(doc.encoding),
      editable: structuredClone(doc.editable),
      layers: structuredClone(doc.layers)
    },
    meta: {
      provenance: {
        file: "authoring://plugin.authoring/surface.create",
        sourceLanguage: "authoring",
        sourceKind: "surface",
        startLine: index + 1,
        endLine: index + 1,
        startColumn: 1,
        endColumn: null,
        originNodeId: null,
        via: [`authoring:surface.create:${doc.id}`],
        actor: doc.actor ?? actor ?? backendHost,
        owner: doc.owner ?? actor ?? backendHost,
        context: doc.context ?? null
      }
    }
  });
}

function collectionCreateDoc(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("collection doc must be an object");
  }
  const id = trimOptionalString(body.id);
  if (!id) throw new Error("collection doc requires id");
  return {
    id,
    actor: trimOptionalString(body.actor),
    owner: trimOptionalString(body.owner),
    context: trimOptionalString(body.context)
  };
}

function validateCollectionCreateDoc(world, body) {
  const doc = collectionCreateDoc(body);
  if (exists(world, doc.id)) throw new Error(`collection id already exists: ${doc.id}`);
  return doc;
}

function collectionCreateNode(doc, { actor, backendHost }) {
  return createDesireNode({
    kind: "collection",
    name: doc.id,
    body: {
      id: doc.id
    },
    meta: {
      provenance: {
        file: "authoring://plugin.authoring/collection.create",
        sourceLanguage: "authoring",
        sourceKind: "collection",
        startLine: 1,
        endLine: 1,
        startColumn: 1,
        endColumn: null,
        originNodeId: null,
        via: [`authoring:collection.create:${doc.id}`],
        actor: doc.actor ?? actor ?? backendHost,
        owner: doc.owner ?? actor ?? backendHost,
        context: doc.context ?? null
      }
    }
  });
}

function processCreateDoc(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("process doc must be an object");
  }
  const id = trimOptionalString(body.id);
  if (!id) throw new Error("process doc requires id");
  return {
    id,
    state: Array.isArray(body.state) ? structuredClone(body.state) : [],
    handles: Array.isArray(body.handles) ? structuredClone(body.handles) : [],
    emits: Array.isArray(body.emits) ? structuredClone(body.emits) : [],
    rules: Array.isArray(body.rules) ? structuredClone(body.rules) : [],
    actor: trimOptionalString(body.actor),
    owner: trimOptionalString(body.owner),
    context: trimOptionalString(body.context)
  };
}

function validateProcessCreateDoc(world, body) {
  const doc = processCreateDoc(body);
  if (exists(world, doc.id)) throw new Error(`process id already exists: ${doc.id}`);
  return doc;
}

function processCreateNode(doc, { actor, backendHost }) {
  return createDesireNode({
    kind: "process",
    name: doc.id,
    body: {
      state: structuredClone(doc.state),
      handles: structuredClone(doc.handles),
      emits: structuredClone(doc.emits),
      rules: structuredClone(doc.rules)
    },
    meta: {
      provenance: {
        file: "authoring://plugin.authoring/process.create",
        sourceLanguage: "authoring",
        sourceKind: "process",
        startLine: 1,
        endLine: 1,
        startColumn: 1,
        endColumn: null,
        originNodeId: null,
        via: [`authoring:process.create:${doc.id}`],
        actor: doc.actor ?? actor ?? backendHost,
        owner: doc.owner ?? actor ?? backendHost,
        context: doc.context ?? null
      }
    }
  });
}

function projectionCreateDoc(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("projection doc must be an object");
  }
  const id = trimOptionalString(body.id);
  if (!id) throw new Error("projection doc requires id");
  return {
    id,
    projectionKind: trimOptionalString(body.projectionKind),
    source: trimOptionalString(body.source),
    props: body.props && typeof body.props === "object" && !Array.isArray(body.props)
      ? structuredClone(body.props)
      : {},
    actor: trimOptionalString(body.actor),
    owner: trimOptionalString(body.owner),
    context: trimOptionalString(body.context)
  };
}

function validateProjectionCreateDoc(world, body) {
  const doc = projectionCreateDoc(body);
  if (exists(world, doc.id)) throw new Error(`projection id already exists: ${doc.id}`);
  return doc;
}

function projectionCreateNode(doc, { actor, backendHost }) {
  return createDesireNode({
    kind: "projection",
    name: doc.id,
    body: {
      projectionKind: doc.projectionKind,
      source: doc.source,
      props: structuredClone(doc.props)
    },
    meta: {
      provenance: {
        file: "authoring://plugin.authoring/projection.create",
        sourceLanguage: "authoring",
        sourceKind: "projection",
        startLine: 1,
        endLine: 1,
        startColumn: 1,
        endColumn: null,
        originNodeId: null,
        via: [`authoring:projection.create:${doc.id}`],
        actor: doc.actor ?? actor ?? backendHost,
        owner: doc.owner ?? actor ?? backendHost,
        context: doc.context ?? null
      }
    }
  });
}

function typeCreateDoc(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("type doc must be an object");
  }
  const id = trimOptionalString(body.id);
  if (!id) throw new Error("type doc requires id");
  return {
    id,
    role: trimOptionalString(body.role),
    field: trimOptionalString(body.field),
    versionKind: trimOptionalString(body.versionKind),
    valueType: trimOptionalString(body.valueType),
    initial: body.initial ?? null,
    actor: trimOptionalString(body.actor),
    owner: trimOptionalString(body.owner),
    context: trimOptionalString(body.context)
  };
}

function validateTypeCreateDoc(world, body) {
  const doc = typeCreateDoc(body);
  if (exists(world, doc.id)) throw new Error(`type id already exists: ${doc.id}`);
  return doc;
}

function typeCreateNode(doc, { actor, backendHost }) {
  return createDesireNode({
    kind: "type",
    name: doc.id,
    body: {
      role: doc.role,
      field: doc.field,
      versionKind: doc.versionKind,
      valueType: doc.valueType,
      initial: doc.initial
    },
    meta: {
      provenance: {
        file: "authoring://plugin.authoring/type.create",
        sourceLanguage: "authoring",
        sourceKind: "type",
        startLine: 1,
        endLine: 1,
        startColumn: 1,
        endColumn: null,
        originNodeId: null,
        via: [`authoring:type.create:${doc.id}`],
        actor: doc.actor ?? actor ?? backendHost,
        owner: doc.owner ?? actor ?? backendHost,
        context: doc.context ?? null
      }
    }
  });
}

function messageCreateDoc(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("message doc must be an object");
  }
  const id = trimOptionalString(body.id);
  if (!id) throw new Error("message doc requires id");
  return {
    id,
    role: trimOptionalString(body.role),
    fields: Array.isArray(body.fields) ? structuredClone(body.fields) : [],
    writes: body.writes && typeof body.writes === "object" && !Array.isArray(body.writes)
      ? structuredClone(body.writes)
      : {},
    actor: trimOptionalString(body.actor),
    owner: trimOptionalString(body.owner),
    context: trimOptionalString(body.context)
  };
}

function validateMessageCreateDoc(world, body) {
  const doc = messageCreateDoc(body);
  if (exists(world, doc.id)) throw new Error(`message id already exists: ${doc.id}`);
  return doc;
}

function messageCreateNode(doc, { actor, backendHost }) {
  return createDesireNode({
    kind: "message",
    name: doc.id,
    body: {
      role: doc.role,
      fields: structuredClone(doc.fields),
      writes: structuredClone(doc.writes)
    },
    meta: {
      provenance: {
        file: "authoring://plugin.authoring/message.create",
        sourceLanguage: "authoring",
        sourceKind: "message",
        startLine: 1,
        endLine: 1,
        startColumn: 1,
        endColumn: null,
        originNodeId: null,
        via: [`authoring:message.create:${doc.id}`],
        actor: doc.actor ?? actor ?? backendHost,
        owner: doc.owner ?? actor ?? backendHost,
        context: doc.context ?? null
      }
    }
  });
}

function boundaryCreateDoc(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("boundary doc must be an object");
  }
  const id = trimOptionalString(body.id);
  if (!id) throw new Error("boundary doc requires id");
  return {
    id,
    capabilities: Array.isArray(body.capabilities) ? structuredClone(body.capabilities) : [],
    operations: Array.isArray(body.operations) ? structuredClone(body.operations) : [],
    actor: trimOptionalString(body.actor),
    owner: trimOptionalString(body.owner),
    context: trimOptionalString(body.context)
  };
}

function validateBoundaryCreateDoc(world, body) {
  const doc = boundaryCreateDoc(body);
  if (exists(world, doc.id)) throw new Error(`boundary id already exists: ${doc.id}`);
  return doc;
}

function boundaryCreateNode(doc, { actor, backendHost }) {
  return createDesireNode({
    kind: "boundary",
    name: doc.id,
    body: {
      capabilities: structuredClone(doc.capabilities),
      operations: structuredClone(doc.operations)
    },
    meta: {
      provenance: {
        file: "authoring://plugin.authoring/boundary.create",
        sourceLanguage: "authoring",
        sourceKind: "boundary",
        startLine: 1,
        endLine: 1,
        startColumn: 1,
        endColumn: null,
        originNodeId: null,
        via: [`authoring:boundary.create:${doc.id}`],
        actor: doc.actor ?? actor ?? backendHost,
        owner: doc.owner ?? actor ?? backendHost,
        context: doc.context ?? null
      }
    }
  });
}

function policyCreateDoc(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("policy doc must be an object");
  }
  const id = trimOptionalString(body.id);
  if (!id) throw new Error("policy doc requires id");
  return {
    id,
    subject: trimOptionalString(body.subject),
    initialState: trimOptionalString(body.initialState),
    stateField: trimOptionalString(body.stateField),
    readyState: trimOptionalString(body.readyState),
    disagreementState: trimOptionalString(body.disagreementState),
    policyOutcomes: body.policyOutcomes && typeof body.policyOutcomes === "object" && !Array.isArray(body.policyOutcomes)
      ? structuredClone(body.policyOutcomes)
      : {},
    disagreementOutcomes: body.disagreementOutcomes && typeof body.disagreementOutcomes === "object" && !Array.isArray(body.disagreementOutcomes)
      ? structuredClone(body.disagreementOutcomes)
      : {},
    actor: trimOptionalString(body.actor),
    owner: trimOptionalString(body.owner),
    context: trimOptionalString(body.context)
  };
}

function validatePolicyCreateDoc(world, body) {
  const doc = policyCreateDoc(body);
  if (exists(world, doc.id)) throw new Error(`policy id already exists: ${doc.id}`);
  return doc;
}

function policyCreateNode(doc, { actor, backendHost }) {
  return createDesireNode({
    kind: "policy",
    name: doc.id,
    body: {
      subject: doc.subject,
      initialState: doc.initialState,
      stateField: doc.stateField,
      readyState: doc.readyState,
      disagreementState: doc.disagreementState,
      policyOutcomes: structuredClone(doc.policyOutcomes),
      disagreementOutcomes: structuredClone(doc.disagreementOutcomes)
    },
    meta: {
      provenance: {
        file: "authoring://plugin.authoring/policy.create",
        sourceLanguage: "authoring",
        sourceKind: "policy",
        startLine: 1,
        endLine: 1,
        startColumn: 1,
        endColumn: null,
        originNodeId: null,
        via: [`authoring:policy.create:${doc.id}`],
        actor: doc.actor ?? actor ?? backendHost,
        owner: doc.owner ?? actor ?? backendHost,
        context: doc.context ?? null
      }
    }
  });
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
  const resolvedTarget = resolveStewardshipTargetInput(world, validated.value, {
    label: "stewardship target"
  });
  if (!resolvedTarget.ok) {
    const witness = fail(world, {
      process: "stewardship.grant.failed",
      actor: actor || backendHost,
      body: { reason: resolvedTarget.error }
    });
    return { ok: false, status: 400, error: resolvedTarget.error, witness };
  }
  const input = {
    ...validated.value,
    target: resolvedTarget.target
  };
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
  const resolvedTarget = resolveStewardshipTargetInput(world, validated.value, {
    label: "stewardship target"
  });
  if (!resolvedTarget.ok) {
    const witness = fail(world, {
      process: "stewardship.revoke.failed",
      actor: actor || backendHost,
      body: { reason: resolvedTarget.error }
    });
    return { ok: false, status: 400, error: resolvedTarget.error, witness };
  }
  const input = {
    ...validated.value,
    target: resolvedTarget.target
  };
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

export function requestSurfaceDefine(world, {
  actor,
  backendHost,
  body
}) {
  let normalized;
  try {
    normalized = normalizeSurfaceCreateBody(body);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witnesses: []
    };
  }

  let docs;
  try {
    docs = validateSurfaceCreateDocs(world, normalized.docs);
  } catch (error) {
    return {
      ok: false,
      status: /already exists|duplicate/i.test(error instanceof Error ? error.message : "")
        ? 409
        : 400,
      error: error instanceof Error ? error.message : String(error),
      witnesses: []
    };
  }

  let desire;
  try {
    desire = createDesireDocument(
      docs.map((doc, index) => surfaceCreateNode(doc, { actor, backendHost, index }))
    );
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witnesses: []
    };
  }

  let witnesses;
  try {
    witnesses = applyDesire(world, desire);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witnesses: []
    };
  }

  const surfaceWitnesses = witnesses.filter(witness =>
    witness.process === "desire.defineSurface"
    && typeof witness.body?.id === "string"
  );
  const surfaceIndex = new Map(surfaceWitnesses.map(witness => [witness.body.id, witness.body]));
  return {
    ok: true,
    status: 201,
    single: normalized.single,
    surfaces: docs.map(doc => surfaceIndex.get(doc.id) ?? { id: doc.id }),
    witnesses: surfaceWitnesses
  };
}

export function requestProcessDefine(world, {
  actor,
  backendHost,
  body
}) {
  let doc;
  try {
    doc = validateProcessCreateDoc(world, body);
  } catch (error) {
    return {
      ok: false,
      status: /already exists/i.test(error instanceof Error ? error.message : "")
        ? 409
        : 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let desire;
  try {
    desire = createDesireDocument([
      processCreateNode(doc, { actor, backendHost })
    ]);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let witnesses;
  try {
    witnesses = applyDesire(world, desire);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  const witness = witnesses.find(entry =>
    entry.process === "desire.defineProcess"
    && typeof entry.body?.id === "string"
    && entry.body.id === doc.id
  ) ?? null;
  return {
    ok: true,
    status: 201,
    process: witness?.body ?? { id: doc.id },
    witness
  };
}

export function requestTypeDefine(world, {
  actor,
  backendHost,
  body
}) {
  let doc;
  try {
    doc = validateTypeCreateDoc(world, body);
  } catch (error) {
    return {
      ok: false,
      status: /already exists/i.test(error instanceof Error ? error.message : "") ? 409 : 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let desire;
  try {
    desire = createDesireDocument([
      typeCreateNode(doc, { actor, backendHost })
    ]);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let witnesses;
  try {
    witnesses = applyDesire(world, desire);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  const witness = witnesses.find(
    entry => entry.process === "desire.defineType"
      && entry.body?.id === doc.id
  ) ?? null;
  return {
    ok: true,
    status: 201,
    type: witness?.body ?? { id: doc.id },
    witness
  };
}

export function requestProjectionDefine(world, {
  actor,
  backendHost,
  body
}) {
  let doc;
  try {
    doc = validateProjectionCreateDoc(world, body);
  } catch (error) {
    return {
      ok: false,
      status: /already exists/i.test(error instanceof Error ? error.message : "")
        ? 409
        : 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let desire;
  try {
    desire = createDesireDocument([
      projectionCreateNode(doc, { actor, backendHost })
    ]);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let witnesses;
  try {
    witnesses = applyDesire(world, desire);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  const witness = witnesses.find(entry =>
    entry.process === "desire.defineProjection"
    && typeof entry.body?.id === "string"
    && entry.body.id === doc.id
  ) ?? null;
  return {
    ok: true,
    status: 201,
    projection: witness?.body ?? { id: doc.id },
    witness
  };
}

export function requestMessageDefine(world, {
  actor,
  backendHost,
  body
}) {
  let doc;
  try {
    doc = validateMessageCreateDoc(world, body);
  } catch (error) {
    return {
      ok: false,
      status: /already exists/i.test(error instanceof Error ? error.message : "") ? 409 : 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let desire;
  try {
    desire = createDesireDocument([
      messageCreateNode(doc, { actor, backendHost })
    ]);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let witnesses;
  try {
    witnesses = applyDesire(world, desire);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  const witness = witnesses.find(
    entry => entry.process === "desire.defineMessage"
      && entry.body?.id === doc.id
  ) ?? null;
  return {
    ok: true,
    status: 201,
    message: witness?.body ?? { id: doc.id },
    witness
  };
}

export function requestBoundaryDefine(world, {
  actor,
  backendHost,
  body
}) {
  let doc;
  try {
    doc = validateBoundaryCreateDoc(world, body);
  } catch (error) {
    return {
      ok: false,
      status: /already exists/i.test(error instanceof Error ? error.message : "") ? 409 : 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let desire;
  try {
    desire = createDesireDocument([
      boundaryCreateNode(doc, { actor, backendHost })
    ]);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let witnesses;
  try {
    witnesses = applyDesire(world, desire);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  const witness = witnesses.find(entry =>
    entry.process === "desire.defineBoundary"
    && typeof entry.body?.id === "string"
    && entry.body.id === doc.id
  ) ?? null;
  return {
    ok: true,
    status: 201,
    boundary: witness?.body ?? { id: doc.id },
    witness
  };
}

export function requestPolicyDefine(world, {
  actor,
  backendHost,
  body
}) {
  let doc;
  try {
    doc = validatePolicyCreateDoc(world, body);
  } catch (error) {
    return {
      ok: false,
      status: /already exists/i.test(error instanceof Error ? error.message : "") ? 409 : 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let desire;
  try {
    desire = createDesireDocument([
      policyCreateNode(doc, { actor, backendHost })
    ]);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let witnesses;
  try {
    witnesses = applyDesire(world, desire);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  const witness = witnesses.find(entry =>
    entry.process === "desire.definePolicy"
    && typeof entry.body?.id === "string"
    && entry.body.id === doc.id
  ) ?? null;
  return {
    ok: true,
    status: 201,
    policy: witness?.body ?? { id: doc.id },
    witness
  };
}

function authoringObject(body, label) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${label} must be an object`);
  }
  return { ...body };
}

function requiredStringField(body, field, label) {
  const value = trimOptionalString(body?.[field]);
  if (!value) throw new Error(`${label} requires ${field}`);
  return value;
}

function optionalObjectField(body, field) {
  const value = body?.[field];
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return structuredClone(value);
}

function optionalArrayField(body, field) {
  const value = body?.[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return structuredClone(value);
}

function requiredResolvedAuthoringRef(world, body, {
  contextField = "context",
  idField,
  refField,
  label
}) {
  const resolved = requireCoveredAuthoringRefInput(world, body, {
    contextField,
    idField,
    refField,
    label
  });
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved.target;
}

function optionalResolvedAuthoringRef(world, body, {
  contextField = "context",
  idField,
  refField,
  label
}) {
  const id = trimOptionalString(body?.[idField]);
  const ref = trimOptionalString(body?.[refField]);
  if (!id && !ref) return null;
  const resolved = requireCoveredAuthoringRefInput(world, body, {
    contextField,
    idField,
    refField,
    label
  });
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved.target;
}

function packageNamespaceIdFromBody(body) {
  return trimOptionalString(body?.id) ?? `packageNamespace:${String(body?.context)}:${String(body?.name)}`;
}

function packageDependencyIdFromBody(body) {
  return trimOptionalString(body?.id) ?? `packageDependency:${String(body?.sourceRevision)}:${String(body?.targetKind)}:${String(body?.targetId)}`;
}

function optionalPositiveIntegerField(body, field) {
  const value = body?.[field];
  if (value === undefined || value === null || value === "") return null;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) throw new Error(`${field} must be a positive integer`);
  return normalized;
}

function packageTransformerIdFromBody(body) {
  return trimOptionalString(body?.id)
    ?? `packageTransformer:${String(body?.package)}:${String(body?.targetRevision ?? body?.targetNamespace ?? body?.sourceRevision ?? body?.sourceNamespace ?? "draft")}`;
}

export function requestPackageDefine(world, {
  actor,
  body
}) {
  let input;
  try {
    input = authoringObject(body, "package doc");
    input.id = requiredStringField(input, "id", "package doc");
    if (input.context !== undefined && input.context !== null) {
      input.context = requiredStringField(input, "context", "package doc");
    }
    input.exports = optionalArrayField(input, "exports");
    input.provenance = optionalObjectField(input, "provenance");
    input.compatibleRuntimeProfiles = optionalArrayField(input, "compatibleRuntimeProfiles");
    input.compatibleShells = optionalArrayField(input, "compatibleShells");
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  if (input.context && !exists(world, input.context)) {
    return {
      ok: false,
      status: 404,
      error: "package context not found",
      witness: null
    };
  }
  if (exists(world, input.id)) {
    return {
      ok: false,
      status: 409,
      error: "package id already exists",
      witness: null
    };
  }

  const witness = definePackage(world, {
    actor,
    ...input
  });
  return {
    ok: true,
    status: 201,
    package: witness.body ?? { id: input.id },
    witness
  };
}

export function requestComputeModuleDefine(world, {
  actor,
  backendHost,
  body,
  owner = actor || backendHost
}) {
  let input;
  try {
    input = authoringObject(body, "compute module doc");
    input.id = requiredStringField(input, "id", "compute module doc");
    input.source = requiredStringField(input, "source", "compute module doc");
    input.hostOperation = requiredStringField(input, "hostOperation", "compute module doc");
    input.language = trimOptionalString(input.language) ?? "assemblyscript";
    input.abi = trimOptionalString(input.abi) ?? "world.hostOperation.v1";
    input.export = trimOptionalString(input.export ?? input.exportName) ?? "invoke";
    input.allowedBindings = optionalArrayField(input, "allowedBindings");
    input.maxMemoryPages = optionalPositiveIntegerField(input, "maxMemoryPages");
    input.timeoutMs = optionalPositiveIntegerField(input, "timeoutMs");
    if (input.context !== undefined && input.context !== null) {
      input.context = requiredStringField(input, "context", "compute module doc");
    }
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  if (input.context && !exists(world, input.context)) {
    return {
      ok: false,
      status: 404,
      error: "compute module context not found",
      witness: null
    };
  }
  if (exists(world, input.id)) {
    return {
      ok: false,
      status: 409,
      error: "compute module id already exists",
      witness: null
    };
  }
  if (input.language !== "assemblyscript") {
    return {
      ok: false,
      status: 400,
      error: "compute module language must be assemblyscript",
      witness: null
    };
  }
  if (input.abi !== "world.hostOperation.v1") {
    return {
      ok: false,
      status: 400,
      error: "compute module abi must be world.hostOperation.v1",
      witness: null
    };
  }
  if (/\s/.test(input.hostOperation)) {
    return {
      ok: false,
      status: 400,
      error: "compute module hostOperation must not contain whitespace",
      witness: null
    };
  }
  const existingHostOperation = world.project(moduleProjectors.computeModules)
    .find(row => row.hostOperation === input.hostOperation) ?? null;
  if (existingHostOperation) {
    return {
      ok: false,
      status: 409,
      error: "compute module hostOperation already exists",
      witness: null
    };
  }

  const witness = defineComputeModule(world, {
    actor,
    id: input.id,
    source: input.source,
    hostOperation: input.hostOperation,
    language: input.language,
    abi: input.abi,
    exportName: input.export,
    maxMemoryPages: input.maxMemoryPages,
    timeoutMs: input.timeoutMs,
    allowedBindings: input.allowedBindings,
    context: input.context ?? null,
    owner,
    values: {
      ...body,
      id: input.id,
      source: input.source,
      hostOperation: input.hostOperation,
      language: input.language,
      abi: input.abi,
      export: input.export,
      maxMemoryPages: input.maxMemoryPages,
      timeoutMs: input.timeoutMs,
      allowedBindings: input.allowedBindings,
      ...(input.context ? { context: input.context } : {})
    }
  });
  return {
    ok: true,
    status: 201,
    computeModule: world.project(moduleProjectors.computeModules).find(row => row.id === input.id) ?? witness.body,
    witness
  };
}

function jsonObjectField(body, field, label) {
  const value = body?.[field];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} requires object ${field}`);
  }
  return structuredClone(value);
}

function stableJson(value) {
  return JSON.stringify(value ?? null);
}

function computeModuleSlug(moduleId) {
  return String(moduleId || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "module";
}

function smokeTestSlug(testId) {
  return String(testId || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "smoke";
}

function smokeFixturePath(moduleId, testId) {
  return `app/modules/${computeModuleSlug(moduleId)}/smoke/${smokeTestSlug(testId)}.json`;
}

function smokeFixtureContent(smokeTest) {
  return `${JSON.stringify({
    schema: "world.computeModuleSmokeTest.v1",
    id: smokeTest.id,
    module: smokeTest.module,
    hostOperation: smokeTest.hostOperation,
    request: smokeTest.request,
    expected: smokeTest.expected
  }, null, 2)}\n`;
}

function requirePackageRevisionForBody(world, input) {
  const packageId = requiredResolvedAuthoringRef(world, input, {
    idField: "package",
    refField: "packageRef",
    label: "package"
  });
  const revisionId = requiredResolvedAuthoringRef(world, input, {
    idField: "revision",
    refField: "revisionRef",
    label: "package revision"
  });
  const packageRow = world.project(moduleProjectors.packageIndex).byId?.[packageId] ?? null;
  if (!packageRow) throw new Error("package not found");
  const revisionRow = world.project(moduleProjectors.packageRevisionIndex).byId?.[revisionId] ?? null;
  if (!revisionRow) throw new Error("package revision not found");
  if (revisionRow.package !== packageId) throw new Error("package revision does not belong to package");
  return { packageId, revisionId, packageRow, revisionRow };
}

function requireComputeModuleForBody(world, input) {
  const moduleId = requiredStringField(input, "module", "compute module source doc");
  const moduleRow = (world.project(moduleProjectors.computeModules) ?? [])
    .find(row => row.id === moduleId) ?? null;
  if (!moduleRow) throw new Error("compute module not found");
  return moduleRow;
}

export function requestPackageMaterializedFileUpsert(world, {
  actor,
  body
}) {
  let input;
  let packageId;
  let revisionId;
  try {
    input = authoringObject(body, "package materialized file doc");
    ({ packageId, revisionId } = requirePackageRevisionForBody(world, input));
    input.path = normalizeCanonicalPath(requiredStringField(input, "path", "package materialized file doc")).replace(/^materialized\//, "");
    input.content = String(input.content ?? "");
    input.sourceLanguage = trimOptionalString(input.sourceLanguage) ?? "text";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: /not found/i.test(message) ? 404 : 400, error: message, witness: null };
  }

  const witness = definePackageMaterializedFile(world, {
    actor,
    id: trimOptionalString(input.id),
    package: packageId,
    revision: revisionId,
    path: input.path,
    content: input.content,
    sourceLanguage: input.sourceLanguage
  });
  return {
    ok: true,
    status: 201,
    packageMaterializedFile: witness.body,
    witness
  };
}

export function requestPackageMaterializedFileMarkDeleted(world, {
  actor,
  body
}) {
  let input;
  let packageId;
  let revisionId;
  let existing;
  try {
    input = authoringObject(body, "package materialized file delete doc");
    ({ packageId, revisionId } = requirePackageRevisionForBody(world, input));
    input.path = normalizeCanonicalPath(requiredStringField(input, "path", "package materialized file delete doc")).replace(/^materialized\//, "");
    const index = world.project(moduleProjectors.packageMaterializedFileIndex);
    existing = index.historyByRevisionPath?.[`${revisionId}\u0000${input.path}`] ?? null;
    if (!existing) throw new Error("package materialized file not found");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: /not found/i.test(message) ? 404 : 400, error: message, witness: null };
  }

  const witness = markPackageMaterializedFileDeleted(world, {
    actor,
    id: existing.id,
    package: packageId,
    revision: revisionId,
    path: input.path,
    content: existing.content ?? "",
    sourceLanguage: existing.sourceLanguage ?? "text"
  });
  return {
    ok: true,
    status: 200,
    packageMaterializedFile: witness.body,
    witness
  };
}

export function requestComputeModuleSourceUpsert(world, {
  actor,
  body
}) {
  let input;
  let moduleRow;
  try {
    input = authoringObject(body, "compute module source doc");
    moduleRow = requireComputeModuleForBody(world, input);
    input.path = normalizeCanonicalPath(requiredStringField(input, "path", "compute module source doc"));
    if (input.path !== normalizeCanonicalPath(moduleRow.source)) {
      throw new Error("compute module source path must match declaration source");
    }
    input.content = String(input.content ?? "");
    input.sourceLanguage = trimOptionalString(input.sourceLanguage) ?? "assemblyscript";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: /not found/i.test(message) ? 404 : 400, error: message, witness: null };
  }
  return requestPackageMaterializedFileUpsert(world, {
    actor,
    body: {
      ...input,
      path: moduleRow.source,
      sourceLanguage: input.sourceLanguage
    }
  });
}

export function requestComputeModuleSourceMarkDeleted(world, {
  actor,
  body
}) {
  let input;
  let moduleRow;
  try {
    input = authoringObject(body, "compute module source delete doc");
    moduleRow = requireComputeModuleForBody(world, input);
    input.path = normalizeCanonicalPath(requiredStringField(input, "path", "compute module source delete doc"));
    if (input.path !== normalizeCanonicalPath(moduleRow.source)) {
      throw new Error("compute module source path must match declaration source");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: /not found/i.test(message) ? 404 : 400, error: message, witness: null };
  }
  return requestPackageMaterializedFileMarkDeleted(world, {
    actor,
    body: {
      ...input,
      path: moduleRow.source
    }
  });
}

export function requestComputeModuleSmokeTestUpsert(world, {
  actor,
  body
}) {
  let input;
  let packageId;
  let revisionId;
  let moduleRow;
  try {
    input = authoringObject(body, "compute module smoke test doc");
    ({ packageId, revisionId } = requirePackageRevisionForBody(world, input));
    moduleRow = requireComputeModuleForBody(world, input);
    input.id = requiredStringField(input, "id", "compute module smoke test doc");
    input.hostOperation = trimOptionalString(input.hostOperation) ?? moduleRow.hostOperation;
    if (input.hostOperation !== moduleRow.hostOperation) {
      throw new Error("compute module smoke test hostOperation must match module hostOperation");
    }
    input.request = jsonObjectField(input, "request", "compute module smoke test doc");
    input.expected = jsonObjectField(input, "expected", "compute module smoke test doc");
    input.timeoutMs = optionalPositiveIntegerField(input, "timeoutMs");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: /not found/i.test(message) ? 404 : 400, error: message, witness: null };
  }

  const smokeWitness = defineComputeModuleSmokeTest(world, {
    actor,
    id: input.id,
    module: moduleRow.id,
    package: packageId,
    revision: revisionId,
    hostOperation: input.hostOperation,
    request: input.request,
    expected: input.expected,
    timeoutMs: input.timeoutMs
  });
  const fixturePath = smokeFixturePath(moduleRow.id, input.id);
  const fileWitness = definePackageMaterializedFile(world, {
    actor,
    package: packageId,
    revision: revisionId,
    path: fixturePath,
    content: smokeFixtureContent(smokeWitness.body),
    sourceLanguage: "json"
  });
  return {
    ok: true,
    status: 201,
    computeModuleSmokeTest: smokeWitness.body,
    packageMaterializedFile: fileWitness.body,
    witnesses: [smokeWitness, fileWitness],
    witness: smokeWitness
  };
}

export function requestComputeModuleSmokeTestMarkDeleted(world, {
  actor,
  body
}) {
  let existing;
  try {
    const input = authoringObject(body, "compute module smoke test delete doc");
    const id = requiredStringField(input, "id", "compute module smoke test delete doc");
    existing = world.project(moduleProjectors.computeModuleSmokeTestIndex).historyById?.[id] ?? null;
    if (!existing) throw new Error("compute module smoke test not found");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: /not found/i.test(message) ? 404 : 400, error: message, witness: null };
  }

  const smokeWitness = markComputeModuleSmokeTestDeleted(world, {
    actor,
    ...existing
  });
  const fixturePath = smokeFixturePath(existing.module, existing.id);
  const materializedIndex = world.project(moduleProjectors.packageMaterializedFileIndex);
  const existingFixture = materializedIndex.historyByRevisionPath?.[`${existing.revision}\u0000${fixturePath}`] ?? null;
  const fileWitness = markPackageMaterializedFileDeleted(world, {
    actor,
    id: existingFixture?.id ?? null,
    package: existing.package,
    revision: existing.revision,
    path: fixturePath,
    content: existingFixture?.content ?? smokeFixtureContent(existing),
    sourceLanguage: "json"
  });
  return {
    ok: true,
    status: 200,
    computeModuleSmokeTest: smokeWitness.body,
    packageMaterializedFile: fileWitness.body,
    witnesses: [smokeWitness, fileWitness],
    witness: smokeWitness
  };
}

export async function requestComputeModuleSmokeTestRun(world, {
  body,
  appContext
}) {
  let smokeTest;
  let moduleRow;
  try {
    const input = authoringObject(body, "compute module smoke test run doc");
    if (trimOptionalString(input.id)) {
      smokeTest = world.project(moduleProjectors.computeModuleSmokeTestIndex).byId?.[input.id] ?? null;
      if (!smokeTest) throw new Error("compute module smoke test not found or marked deleted");
    } else {
      moduleRow = requireComputeModuleForBody(world, input);
      smokeTest = {
        id: trimOptionalString(input.id) ?? "inline",
        module: moduleRow.id,
        package: requiredStringField(input, "package", "compute module smoke test run doc"),
        revision: requiredStringField(input, "revision", "compute module smoke test run doc"),
        hostOperation: trimOptionalString(input.hostOperation) ?? moduleRow.hostOperation,
        request: jsonObjectField(input, "request", "compute module smoke test run doc"),
        expected: jsonObjectField(input, "expected", "compute module smoke test run doc"),
        timeoutMs: optionalPositiveIntegerField(input, "timeoutMs")
      };
    }
    moduleRow = moduleRow ?? (world.project(moduleProjectors.computeModules) ?? [])
      .find(row => row.id === smokeTest.module) ?? null;
    if (!moduleRow) throw new Error("compute module not found");
    const fileIndex = world.project(moduleProjectors.packageMaterializedFileIndex);
    const sourceKey = `${smokeTest.revision}\u0000${normalizeCanonicalPath(moduleRow.source)}`;
    const activeSource = fileIndex.byRevisionPath?.[sourceKey] ?? null;
    const historicalSource = fileIndex.historyByRevisionPath?.[sourceKey] ?? null;
    if (!activeSource) {
      if (historicalSource?.deletedAt) throw new Error("compute module source marked deleted");
      throw new Error("compute module source not authored through package materialized files");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: /not found|marked deleted|not authored/i.test(message) ? 404 : 400, error: message };
  }

  if (typeof appContext?.witnessCoreBridge?.shadowInvokeComputeModule !== "function") {
    return {
      ok: false,
      status: 503,
      code: "WITNESS_CORE_REQUIRED",
      error: "witness-core compute module shadow invocation is required"
    };
  }
  const inputJson = stableJson({
    hostOperation: smokeTest.hostOperation,
    request: smokeTest.request
  });
  const expectedJson = stableJson(smokeTest.expected);
  try {
    const shadow = await appContext.witnessCoreBridge.shadowInvokeComputeModule({
      hostOperation: smokeTest.hostOperation,
      inputJson,
      jsResultJson: expectedJson
    });
    const passed = shadow?.ok !== false && shadow?.matched !== false && shadow?.match !== false;
    return {
      ok: true,
      status: 200,
      result: {
        id: smokeTest.id,
        module: smokeTest.module,
        hostOperation: smokeTest.hostOperation,
        passed,
        inputJson,
        expected: smokeTest.expected,
        expectedJson,
        shadow,
        mismatch: passed ? null : (shadow?.mismatch ?? shadow?.diff ?? shadow ?? null)
      }
    };
  } catch (error) {
    const status = Number(error?.status || error?.httpStatus || 503);
    return {
      ok: false,
      status,
      code: typeof error?.code === "string" ? error.code : "WITNESS_CORE_UNAVAILABLE",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function requestPackageRevisionDefine(world, {
  actor,
  body
}) {
  let input;
  try {
    input = authoringObject(body, "package revision doc");
    input.id = requiredStringField(input, "id", "package revision doc");
    input.package = requiredResolvedAuthoringRef(world, input, {
      idField: "package",
      refField: "packageRef",
      label: "package"
    });
    input.supersedes = optionalArrayField(input, "supersedes");
    input.manifest = optionalObjectField(input, "manifest");
    input.compatibility = optionalObjectField(input, "compatibility");
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  if (!world.project(moduleProjectors.packageIndex).byId[input.package]) {
    return {
      ok: false,
      status: 404,
      error: "package not found",
      witness: null
    };
  }
  if (exists(world, input.id)) {
    return {
      ok: false,
      status: 409,
      error: "package revision id already exists",
      witness: null
    };
  }

  const witness = definePackageRevision(world, {
    actor,
    ...input
  });
  return {
    ok: true,
    status: 201,
    packageRevision: witness.body ?? { id: input.id },
    witness
  };
}

export function requestPackageRevisionPublish(world, {
  actor,
  body
}) {
  const revisionIndex = world.project(moduleProjectors.packageRevisionIndex).byId;
  let input;
  try {
    input = authoringObject(body, "package revision publish doc");
    input.id = requiredResolvedAuthoringRef(world, input, {
      idField: "id",
      refField: "idRef",
      label: "package revision"
    });
    if (input.package !== undefined && input.package !== null) {
      input.package = requiredResolvedAuthoringRef(world, input, {
        idField: "package",
        refField: "packageRef",
        label: "package"
      });
    }
    input.manifest = optionalObjectField(input, "manifest");
    input.compatibility = optionalObjectField(input, "compatibility");
    if (input.status !== undefined && input.status !== null) {
      input.status = requiredStringField(input, "status", "package revision publish doc");
    }
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  const revisionRow = revisionIndex[input.id];
  if (!revisionRow) {
    return {
      ok: false,
      status: 404,
      error: "package revision not found",
      witness: null
    };
  }
  if (input.package && input.package !== revisionRow.package) {
    return {
      ok: false,
      status: 400,
      error: "package revision does not belong to package",
      witness: null
    };
  }

  const nextStatus = trimOptionalString(input.status) ?? "published";
  if (nextStatus !== "published") {
    return {
      ok: false,
      status: 400,
      error: "package revision publish only supports published status",
      witness: null
    };
  }
  if (revisionRow.status === "published") {
    return {
      ok: false,
      status: 409,
      error: "package revision is already published",
      witness: null
    };
  }
  if (!["draft", "review"].includes(revisionRow.status)) {
    return {
      ok: false,
      status: 409,
      error: "package revision cannot be published from its current status",
      witness: null
    };
  }

  const witness = publishPackageRevision(world, {
    actor,
    id: revisionRow.id,
    package: revisionRow.package,
    version: revisionRow.version,
    status: nextStatus,
    supersedes: revisionRow.supersedes,
    emittedBundleHash: trimOptionalString(input.emittedBundleHash) ?? revisionRow.emittedBundleHash ?? null,
    manifest: input.manifest ?? revisionRow.manifest ?? null,
    compatibility: input.compatibility ?? revisionRow.compatibility ?? null
  });
  return {
    ok: true,
    status: 200,
    packageRevision: witness.body ?? { id: revisionRow.id },
    witness
  };
}

function normalizePackagePatchDefinition(world, body) {
  const packageIndex = world.project(moduleProjectors.packageIndex).byId;
  const revisionIndex = world.project(moduleProjectors.packageRevisionIndex).byId;
  const transformerIndex = world.project(moduleProjectors.packageTransformerIndex).byId;
  const input = authoringObject(body, "package patch doc");
  const packageId = requiredResolvedAuthoringRef(world, input, {
    idField: "package",
    refField: "packageRef",
    label: "package"
  });
  const revisionId = requiredResolvedAuthoringRef(world, input, {
    idField: "revision",
    refField: "revisionRef",
    label: "package revision"
  });
  if (!packageIndex[packageId]) throw new Error("package not found");
  const revisionRow = revisionIndex[revisionId];
  if (!revisionRow) throw new Error("package revision not found");
  if (revisionRow.package !== packageId) throw new Error("package revision does not belong to package");
  const transformerId = optionalResolvedAuthoringRef(world, input, {
    idField: "transformer",
    refField: "transformerRef",
    label: "package transformer"
  });
  if (transformerId) {
    const transformerRow = transformerIndex[transformerId];
    if (!transformerRow) throw new Error("package transformer not found");
    if (transformerRow.package !== packageId) throw new Error("package transformer does not belong to package");
    if (transformerRow.targetRevision && transformerRow.targetRevision !== revisionId) {
      throw new Error("package patch revision does not match transformer target revision");
    }
  }
  return createCanonicalPackagePatch({
    package: packageId,
    revision: revisionId,
    ordinal: input.ordinal ?? null,
    path: input.path,
    operation: input.operation,
    sourceLanguage: input.sourceLanguage,
    transformer: transformerId,
    previousHash: trimOptionalString(input.previousHash),
    nextHash: trimOptionalString(input.nextHash),
    body: input.body ?? null
  });
}

export function requestPackagePatchDefine(world, {
  actor,
  body
}) {
  let normalized;
  try {
    normalized = normalizePackagePatchDefinition(world, body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: /not found/i.test(message) ? 404 : 400,
      error: message,
      witness: null
    };
  }

  if (exists(world, normalized.id)) {
    return {
      ok: false,
      status: 409,
      error: "package patch id already exists",
      witness: null
    };
  }

  const witness = definePackagePatch(world, {
    actor,
    ...normalized
  });
  return {
    ok: true,
    status: 201,
    packagePatch: witness.body ?? { id: normalized.id },
    witness
  };
}

function packagePatchSourceLanguage(input) {
  const explicit = trimOptionalString(input.sourceLanguage)?.toLowerCase();
  if (explicit) return explicit;
  const sourcePath = trimOptionalString(input.sourcePath ?? input.path);
  if (sourcePath?.toLowerCase().endsWith(".rvm")) return "rvm";
  if (sourcePath?.toLowerCase().endsWith(".wtoml")) return "wtoml";
  throw new Error("package patch source doc requires sourceLanguage of rvm or wtoml");
}

function packagePatchDefinitionsFromSource(world, input) {
  const sourceLanguage = packagePatchSourceLanguage(input);
  const content = requiredStringField(input, "content", "package patch source doc");
  if (sourceLanguage === "wtoml") {
    const docs = parseWitnessToml(content).filter(doc => doc.kind === "packagePatch");
    if (!docs.length) throw new Error("WTOML patch source must contain at least one [[packagePatch]] document");
    return docs.map((doc, index) => ({
      ...(doc.values ?? {}),
      context: doc.values?.context ?? input.context,
      package: doc.values?.package ?? input.package,
      packageRef: doc.values?.packageRef ?? input.packageRef,
      revision: doc.values?.revision ?? input.revision,
      revisionRef: doc.values?.revisionRef ?? input.revisionRef,
      ordinal: doc.values?.ordinal ?? input.ordinal ?? index + 1,
      transformer: doc.values?.transformer ?? input.transformer,
      transformerRef: doc.values?.transformerRef ?? input.transformerRef
    }));
  }
  if (sourceLanguage === "rvm") {
    compileRvmToDesirePlus(content, {
      file: trimOptionalString(input.sourcePath ?? input.path) ?? "inline-package-patch.rvm"
    });
    return [{
      context: input.context,
      package: input.package,
      packageRef: input.packageRef,
      revision: input.revision,
      revisionRef: input.revisionRef,
      transformer: input.transformer,
      transformerRef: input.transformerRef,
      ordinal: input.ordinal ?? null,
      path: input.path,
      operation: input.operation ?? "replace",
      sourceLanguage: "rvm",
      previousHash: input.previousHash,
      nextHash: input.nextHash,
      body: {
        content
      }
    }];
  }
  throw new Error("package patch sourceLanguage must be rvm or wtoml");
}

export function requestPackagePatchSourceUpsert(world, {
  actor,
  body
}) {
  let normalizedPatches;
  try {
    const input = authoringObject(body, "package patch source doc");
    const definitions = packagePatchDefinitionsFromSource(world, input);
    normalizedPatches = definitions.map(definition => normalizePackagePatchDefinition(world, definition));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: /not found/i.test(message) ? 404 : 400,
      error: message,
      witness: null
    };
  }

  const seen = new Set();
  const packagePatches = [];
  const witnesses = [];
  for (const normalized of normalizedPatches) {
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    if (exists(world, normalized.id)) {
      packagePatches.push(normalized);
      continue;
    }
    const witness = definePackagePatch(world, {
      actor,
      ...normalized
    });
    packagePatches.push(witness.body ?? { id: normalized.id });
    witnesses.push(witness);
  }
  return {
    ok: true,
    status: witnesses.length ? 201 : 200,
    packagePatches,
    witnesses
  };
}

export function requestPackageNamespaceDefine(world, {
  actor,
  body
}) {
  const packageIndex = world.project(moduleProjectors.packageIndex).byId;
  const revisionIndex = world.project(moduleProjectors.packageRevisionIndex).byId;
  let input;
  let namespaceId;
  try {
    input = authoringObject(body, "package namespace doc");
    input.context = requiredStringField(input, "context", "package namespace doc");
    input.name = requiredStringField(input, "name", "package namespace doc");
    input.package = requiredResolvedAuthoringRef(world, input, {
      idField: "package",
      refField: "packageRef",
      label: "package"
    });
    const revisionContextField = trimOptionalString(input.revision) ? "__packageRevisionContext" : "context";
    input.revision = optionalResolvedAuthoringRef(world, input, {
      contextField: revisionContextField,
      idField: "revision",
      refField: "revisionRef",
      label: "package revision"
    });
    namespaceId = packageNamespaceIdFromBody(input);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  if (!exists(world, input.context)) {
    return {
      ok: false,
      status: 404,
      error: "package namespace context not found",
      witness: null
    };
  }
  if (!packageIndex[input.package]) {
    return {
      ok: false,
      status: 404,
      error: "package not found",
      witness: null
    };
  }
  if (input.revision) {
    const revisionRow = revisionIndex[input.revision];
    if (!revisionRow) {
      return {
        ok: false,
        status: 404,
        error: "package revision not found",
        witness: null
      };
    }
    if (revisionRow.package !== input.package) {
      return {
        ok: false,
        status: 400,
        error: "package revision does not belong to package",
        witness: null
      };
    }
  }
  if (exists(world, namespaceId)) {
    return {
      ok: false,
      status: 409,
      error: "package namespace id already exists",
      witness: null
    };
  }

  const witness = definePackageNamespace(world, {
    actor,
    ...input,
    id: namespaceId
  });
  return {
    ok: true,
    status: 201,
    packageNamespace: witness.body ?? { id: namespaceId },
    witness
  };
}

export function requestPackageDependencyDefine(world, {
  actor,
  body
}) {
  const packageIndex = world.project(moduleProjectors.packageIndex).byId;
  const revisionIndex = world.project(moduleProjectors.packageRevisionIndex).byId;
  let input;
  let dependencyId;
  try {
    input = authoringObject(body, "package dependency doc");
    input.sourceRevision = requiredResolvedAuthoringRef(world, input, {
      idField: "sourceRevision",
      refField: "sourceRevisionRef",
      label: "package source revision"
    });
    input.targetKind = requiredStringField(input, "targetKind", "package dependency doc");
    input.targetId = requiredResolvedAuthoringRef(world, input, {
      idField: "targetId",
      refField: "targetRef",
      label: "package dependency target"
    });
    input.sourcePackage = optionalResolvedAuthoringRef(world, input, {
      idField: "sourcePackage",
      refField: "sourcePackageRef",
      label: "source package"
    });
    input.compatibility = optionalObjectField(input, "compatibility");
    input.runtimeProfiles = optionalArrayField(input, "runtimeProfiles");
    dependencyId = packageDependencyIdFromBody(input);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  const revisionRow = revisionIndex[input.sourceRevision];
  if (!revisionRow) {
    return {
      ok: false,
      status: 404,
      error: "package source revision not found",
      witness: null
    };
  }
  if (input.sourcePackage) {
    if (!packageIndex[input.sourcePackage]) {
      return {
        ok: false,
        status: 404,
        error: "source package not found",
        witness: null
      };
    }
    if (revisionRow.package !== input.sourcePackage) {
      return {
        ok: false,
        status: 400,
        error: "package source revision does not belong to source package",
        witness: null
      };
    }
  }
  if (exists(world, dependencyId)) {
    return {
      ok: false,
      status: 409,
      error: "package dependency id already exists",
      witness: null
    };
  }

  const witness = definePackageDependency(world, {
    actor,
    ...input,
    id: dependencyId
  });
  return {
    ok: true,
    status: 201,
    packageDependency: witness.body ?? { id: dependencyId },
    witness
  };
}

export function requestPackageTransformerDefine(world, {
  actor,
  body
}) {
  const packageIndex = world.project(moduleProjectors.packageIndex).byId;
  const revisionIndex = world.project(moduleProjectors.packageRevisionIndex).byId;
  const namespaceIndex = world.project(moduleProjectors.packageNamespaceIndex).byId;
  let input;
  let transformerId;
  try {
    input = authoringObject(body, "package transformer doc");
    input.package = requiredResolvedAuthoringRef(world, input, {
      idField: "package",
      refField: "packageRef",
      label: "package"
    });
    input.sourceRevision = optionalResolvedAuthoringRef(world, input, {
      idField: "sourceRevision",
      refField: "sourceRevisionRef",
      label: "source package revision"
    });
    input.sourceNamespace = optionalResolvedAuthoringRef(world, input, {
      idField: "sourceNamespace",
      refField: "sourceNamespaceRef",
      label: "source package namespace"
    });
    input.targetRevision = optionalResolvedAuthoringRef(world, input, {
      idField: "targetRevision",
      refField: "targetRevisionRef",
      label: "target package revision"
    });
    input.targetNamespace = optionalResolvedAuthoringRef(world, input, {
      idField: "targetNamespace",
      refField: "targetNamespaceRef",
      label: "target package namespace"
    });
    if (!trimOptionalString(input.sourceRevision) && !trimOptionalString(input.sourceNamespace)) {
      throw new Error("package transformer requires sourceRevision or sourceNamespace");
    }
    if (!trimOptionalString(input.targetRevision) && !trimOptionalString(input.targetNamespace)) {
      throw new Error("package transformer requires targetRevision or targetNamespace");
    }
    input.mappings = optionalArrayField(input, "mappings");
    input.remainingGlue = optionalArrayField(input, "remainingGlue");
    input.notes = optionalArrayField(input, "notes");
    transformerId = packageTransformerIdFromBody(input);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  if (!packageIndex[input.package]) {
    return {
      ok: false,
      status: 404,
      error: "package not found",
      witness: null
    };
  }
  const packageId = input.package;
  for (const field of ["sourceRevision", "targetRevision"]) {
    const revisionId = trimOptionalString(input[field]);
    if (!revisionId) continue;
    const revisionRow = revisionIndex[revisionId];
    if (!revisionRow) {
      return {
        ok: false,
        status: 404,
        error: "package revision not found",
        witness: null
      };
    }
    if (revisionRow.package !== packageId) {
      return {
        ok: false,
        status: 400,
        error: "package transformer revision does not belong to package",
        witness: null
      };
    }
  }
  for (const field of ["sourceNamespace", "targetNamespace"]) {
    const namespaceId = trimOptionalString(input[field]);
    if (!namespaceId) continue;
    const namespaceRow = namespaceIndex[namespaceId];
    if (!namespaceRow) {
      return {
        ok: false,
        status: 404,
        error: "package namespace not found",
        witness: null
      };
    }
    if (namespaceRow.package !== packageId) {
      return {
        ok: false,
        status: 400,
        error: "package transformer namespace does not belong to package",
        witness: null
      };
    }
  }
  if (exists(world, transformerId)) {
    return {
      ok: false,
      status: 409,
      error: "package transformer id already exists",
      witness: null
    };
  }

  const witness = definePackageTransformer(world, {
    actor,
    ...input,
    id: transformerId
  });
  return {
    ok: true,
    status: 201,
    packageTransformer: witness.body ?? { id: transformerId },
    witness
  };
}

export function requestCollectionDefine(world, {
  actor,
  backendHost,
  body
}) {
  let doc;
  try {
    doc = validateCollectionCreateDoc(world, body);
  } catch (error) {
    return {
      ok: false,
      status: /already exists/i.test(error instanceof Error ? error.message : "")
        ? 409
        : 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let desire;
  try {
    desire = createDesireDocument([
      collectionCreateNode(doc, { actor, backendHost })
    ]);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  let witnesses;
  try {
    witnesses = applyDesire(world, desire);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : String(error),
      witness: null
    };
  }

  const witness = witnesses.find(entry =>
    entry.process === "desire.defineCollection"
    && typeof entry.body?.id === "string"
    && entry.body.id === doc.id
  ) ?? null;
  return {
    ok: true,
    status: 201,
    collection: witness?.body ?? { id: doc.id },
    witness
  };
}

function normalizeRoutePreloadWhenInput(value, label = "preloadPolicies.when") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const kind = trimOptionalString(value.kind);
  if (!kind) throw new Error(`${label}.kind is required`);
  if (kind === "boot") return { kind };
  if (kind === "routeEnter") {
    const route = trimOptionalString(value.route);
    if (!route) throw new Error(`${label}.route is required for routeEnter`);
    return { kind, route };
  }
  if (kind === "idleAfterRoute") {
    const route = trimOptionalString(value.route);
    if (!route) throw new Error(`${label}.route is required for idleAfterRoute`);
    const delayMs = Number(value.delayMs);
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new Error(`${label}.delayMs must be a non-negative number for idleAfterRoute`);
    }
    return { kind, route, delayMs };
  }
  throw new Error(`unsupported ${label}.kind: ${kind}`);
}

function normalizeRoutePreloadLoadListInput(value, allowed, label) {
  const loads = [...new Set((Array.isArray(value) ? value : [])
    .map(entry => trimOptionalString(entry))
    .filter(Boolean))];
  if (!loads.length) throw new Error(`${label} must be a non-empty array`);
  for (const load of loads) {
    if (!allowed.includes(load)) throw new Error(`${label} includes unsupported load: ${load}`);
  }
  return loads;
}

function normalizeRoutePreloadTargetsInput(value, label = "preloadPolicies.targets") {
  const targets = Array.isArray(value) ? value : [];
  if (!targets.length) throw new Error(`${label} must be a non-empty array`);
  return targets.map((target, index) => {
    if (!target || typeof target !== "object" || Array.isArray(target)) {
      throw new Error(`${label}[${index}] must be an object`);
    }
    const kind = trimOptionalString(target.kind);
    if (!kind) throw new Error(`${label}[${index}].kind is required`);
    if (kind === "route") {
      const route = trimOptionalString(target.route);
      if (!route) throw new Error(`${label}[${index}].route is required`);
      const command = trimOptionalString(target.command);
      return {
        kind,
        route,
        ...(command ? { command } : {}),
        load: normalizeRoutePreloadLoadListInput(target.load, ["manifest", "capabilityAssets", "command"], `${label}[${index}].load`)
      };
    }
    if (kind === "capability") {
      const capability = trimOptionalString(target.capability);
      if (!capability) throw new Error(`${label}[${index}].capability is required`);
      return {
        kind,
        capability,
        load: normalizeRoutePreloadLoadListInput(target.load, ["assets"], `${label}[${index}].load`)
      };
    }
    throw new Error(`unsupported ${label}[${index}].kind: ${kind}`);
  });
}

function normalizeRoutePreloadPoliciesInput(value, label = "preloadPolicies") {
  if (value == null) return [];
  const policies = Array.isArray(value) ? value : [];
  return policies.map((policy, index) => {
    if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
      throw new Error(`${label}[${index}] must be an object`);
    }
    const id = trimOptionalString(policy.id);
    if (!id) throw new Error(`${label}[${index}].id is required`);
    return {
      id,
      when: normalizeRoutePreloadWhenInput(policy.when, `${label}[${index}].when`),
      targets: normalizeRoutePreloadTargetsInput(policy.targets, `${label}[${index}].targets`)
    };
  });
}

function normalizeRouteQueryBindingDefaults(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return structuredClone(value);
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  throw new Error("queryBindings.defaultValue must be a scalar or array");
}

function normalizeRouteQueryBindingsInput(world, body, label = "queryBindings") {
  if (body?.[label] == null) return [];
  const rows = Array.isArray(body[label]) ? body[label] : [];
  return rows.map((binding, index) => {
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
      throw new Error(`${label}[${index}] must be an object`);
    }
    const param = trimOptionalString(binding.param);
    if (!param) throw new Error(`${label}[${index}].param is required`);
    const processResolved = resolveCoveredNestedRef(world, binding, {
      context: body?.context ?? null,
      idField: "process",
      refField: "processRef",
      label: `${label}[${index}] process`
    });
    if (!processResolved.ok) throw new Error(processResolved.error);
    if (!processResolved.target) throw new Error(`${label}[${index}].process is required`);
    const stateResolved = resolveCoveredNestedRef(world, binding, {
      context: body?.context ?? null,
      idField: "state",
      refField: "stateRef",
      label: `${label}[${index}] state`
    });
    if (!stateResolved.ok) throw new Error(stateResolved.error);
    if (!stateResolved.target) throw new Error(`${label}[${index}].state is required`);
    return {
      param,
      process: processResolved.target,
      state: stateResolved.target,
      ...(Object.prototype.hasOwnProperty.call(binding, "defaultValue")
        ? { defaultValue: normalizeRouteQueryBindingDefaults(binding.defaultValue) }
        : {})
    };
  });
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
  const backendProgramResolved = resolveCoveredBodyRef(world, body, {
    contextField: "context",
    idField: "backendProgramSoul",
    refField: "backendProgramSoulRef",
    label: "backend program soul"
  });
  if (!backendProgramResolved.ok) {
    const witness = fail(world, { process: "route.define.failed", actor: actor || backendHost, body: { reason: backendProgramResolved.error } });
    return { ok: false, status: 400, error: backendProgramResolved.error, witness };
  }
  const servesResolved = resolveCoveredBodyRef(world, body, {
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
  const rootWidgetResolved = resolveCoveredBodyRef(world, body, {
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
  const rootSurfaceResolved = resolveCoveredBodyRef(world, body, {
    contextField: "context",
    idField: "rootSurface",
    refField: "rootSurfaceRef",
    label: "route root surface"
  });
  if (!rootSurfaceResolved.ok) {
    const witness = fail(world, { process: "route.define.failed", actor: actor || backendHost, body: { reason: rootSurfaceResolved.error } });
    return { ok: false, status: 400, error: rootSurfaceResolved.error, witness };
  }
  if (typeof rootSurfaceResolved.target === "string" && rootSurfaceResolved.target.trim()) params.rootSurface = rootSurfaceResolved.target.trim();
  const frontendProgramResolved = resolveCoveredBodyRef(world, body, {
    contextField: "context",
    idField: "frontendProgram",
    refField: "frontendProgramRef",
    label: "route frontend program"
  });
  if (!frontendProgramResolved.ok) {
    const witness = fail(world, { process: "route.define.failed", actor: actor || backendHost, body: { reason: frontendProgramResolved.error } });
    return { ok: false, status: 400, error: frontendProgramResolved.error, witness };
  }
  if (typeof frontendProgramResolved.target === "string" && frontendProgramResolved.target.trim()) params.frontendProgram = frontendProgramResolved.target.trim();
  if (typeof body.page === "string" && body.page.trim()) params.page = body.page.trim();
  if (typeof body.defaultScreen === "string" && body.defaultScreen.trim()) params.defaultScreen = body.defaultScreen.trim();
  if (body.routeState && typeof body.routeState === "object" && !Array.isArray(body.routeState)) {
    const routeStateProcessResolved = resolveCoveredNestedRef(world, body.routeState, {
      context: body?.context ?? null,
      idField: "process",
      refField: "processRef",
      label: "route state process"
    });
    if (!routeStateProcessResolved.ok) {
      const witness = fail(world, { process: "route.define.failed", actor: actor || backendHost, body: { reason: routeStateProcessResolved.error } });
      return { ok: false, status: 400, error: routeStateProcessResolved.error, witness };
    }
    const routeStateStateResolved = resolveCoveredNestedRef(world, body.routeState, {
      context: body?.context ?? null,
      idField: "state",
      refField: "stateRef",
      label: "route state state"
    });
    if (!routeStateStateResolved.ok) {
      const witness = fail(world, { process: "route.define.failed", actor: actor || backendHost, body: { reason: routeStateStateResolved.error } });
      return { ok: false, status: 400, error: routeStateStateResolved.error, witness };
    }
    if (routeStateStateResolved.target) {
      params.routeState = {
        ...(routeStateProcessResolved.target ? { process: routeStateProcessResolved.target } : {}),
        state: routeStateStateResolved.target
      };
    }
  }
  try {
    const preloadPolicies = normalizeRoutePreloadPoliciesInput(body.preloadPolicies);
    if (preloadPolicies.length) params.preloadPolicies = preloadPolicies;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const witness = fail(world, { process: "route.define.failed", actor: actor || backendHost, body: { reason: message } });
    return { ok: false, status: 400, error: message, witness };
  }
  try {
    const queryBindings = normalizeRouteQueryBindingsInput(world, body);
    if (queryBindings.length) params.queryBindings = queryBindings;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const witness = fail(world, { process: "route.define.failed", actor: actor || backendHost, body: { reason: message } });
    return { ok: false, status: 400, error: message, witness };
  }
  if (body.liveProjection === true) params.liveProjection = true;
  if (Array.isArray(body.excludeWidgetRoles) && body.excludeWidgetRoles.length) params.excludeWidgetRoles = [...body.excludeWidgetRoles];
  const defaultRootWidgetResolved = resolveCoveredBodyRef(world, body, {
    contextField: "context",
    idField: "defaultRootWidget",
    refField: "defaultRootWidgetRef",
    label: "route default root widget"
  });
  if (!defaultRootWidgetResolved.ok) {
    const witness = fail(world, { process: "route.define.failed", actor: actor || backendHost, body: { reason: defaultRootWidgetResolved.error } });
    return { ok: false, status: 400, error: defaultRootWidgetResolved.error, witness };
  }
  if (typeof defaultRootWidgetResolved.target === "string" && defaultRootWidgetResolved.target.trim()) params.rootWidget = defaultRootWidgetResolved.target.trim();
  const hasPageParams = Boolean(
    params.rootWidget
    || params.rootSurface
    || params.frontendProgram
    || body.page
    || params.defaultScreen
    || params.routeState
    || (Array.isArray(params.preloadPolicies) && params.preloadPolicies.length)
    || (Array.isArray(params.queryBindings) && params.queryBindings.length)
    || body.liveProjection === true
    || (Array.isArray(body.excludeWidgetRoles) && body.excludeWidgetRoles.length)
  );
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
  if (routeKind === "backendProgram" && hasPageParams) {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "backend program routes cannot also declare page/frontend params", handler: input.handler }
    });
    return { ok: false, status: 400, error: "backend program routes cannot also declare page/frontend params", witness };
  }
  if (routeKind === "stream" && (hasPageParams || backendProgramSoul)) {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "stream routes cannot declare page or backend-program params", handler: input.handler }
    });
    return { ok: false, status: 400, error: "stream routes cannot declare page or backend-program params", witness };
  }
  if (routeKind === "resource" && (hasPageParams || backendProgramSoul)) {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "resource routes cannot declare page or backend-program params", handler: input.handler }
    });
    return { ok: false, status: 400, error: "resource routes cannot declare page or backend-program params", witness };
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
  if (input.handler === "page.home") {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "page.home is retired; use page.surface and frontend.upliftLegacy", handler: input.handler }
    });
    return { ok: false, status: 400, error: "page.home is retired; use page.surface and frontend.upliftLegacy", witness };
  }
  if (input.handler === "page.world" && !params.rootWidget) {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "page routes require rootWidget", handler: input.handler }
    });
    return { ok: false, status: 400, error: "page routes require rootWidget", witness };
  }
  if (input.handler === "page.surface" && !params.rootSurface) {
    const witness = fail(world, {
      process: "route.define.failed",
      actor: actor || backendHost,
      body: { reason: "page.surface routes require rootSurface", handler: input.handler }
    });
    return { ok: false, status: 400, error: "page.surface routes require rootSurface", witness };
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
  const serverRunnerResolved = resolveCoveredBodyRef(world, body, {
    contextField: "context",
    idField: "serverRunner",
    refField: "serverRunnerRef",
    label: "server runner"
  });
  if (!serverRunnerResolved.ok) {
    const witness = fail(world, { process: "serve.define.failed", actor: actor || backendHost, body: { reason: serverRunnerResolved.error } });
    return { ok: false, status: 400, error: serverRunnerResolved.error, witness };
  }
  const routeResolved = resolveCoveredBodyRef(world, body, {
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

export function requestBootstrapFrontendUpliftLegacy(world, {
  actor,
  backendHost
}) {
  const uplifted = applyLegacyFrontendUplift(world, {
    actor: actor || backendHost,
    backendHost
  });
  if (!uplifted.ok) return uplifted;
  return {
    ok: true,
    status: 200,
    actions: uplifted.actions,
    previewBefore: uplifted.previewBefore,
    previewAfter: uplifted.previewAfter,
    witness: uplifted.witness
  };
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

  const resolvedParent = resolveCoveredBodyRef(world, body, {
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
  const output = widgetUpdateOutputFromProps(current.id, nextProps);
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

export function requestWidgetReplace(world, {
  actor,
  backendHost,
  body
}) {
  const validatedInput = validateInput(world, "widget.replace", body);
  if (!validatedInput.ok) {
    const witness = fail(world, {
      process: "widget.replace.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validatedInput.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validatedInput.value;
  const id = typeof input?.id === "string" ? input.id.trim() : "";
  const current = widgetDefinitions(world.allWitnesses()).find(row => row.id === id) ?? null;
  if (!current) {
    const witness = fail(world, {
      process: "widget.replace.failed",
      actor: actor || backendHost,
      body: { reason: "widget not found", id }
    });
    return { ok: false, status: 404, error: "widget not found", witness };
  }
  if (widgetVersions(world.allWitnesses()).some(row => row.soul === id)) {
    const witness = fail(world, {
      process: "widget.replace.failed",
      actor: actor || backendHost,
      body: { reason: "versioned widgets must evolve through widget versions", id }
    });
    return { ok: false, status: 409, error: "versioned widgets must evolve through widget versions", witness };
  }
  const nextKind = typeof input?.kind === "string" ? input.kind.trim() : "";
  const nextProps = widgetReplacementPropsFromInput(current.props ?? {}, body ?? input);
  const classification = classifyWidgetReplacement({
    currentWidget: current,
    nextKind,
    nextProps
  });
  if (classification.migrationStatus === "blocked") {
    const witness = fail(world, {
      process: "widget.replace.blocked",
      actor: actor || backendHost,
      body: { reason: classification.reason || "widget replacement blocked", id, kind: nextKind }
    });
    return { ok: false, status: 400, error: classification.reason || "widget replacement blocked", witness };
  }
  const validatedOutput = validateOutput(world, "widget.update", widgetUpdateOutputFromProps(id, nextProps));
  if (!validatedOutput.ok) {
    const witness = fail(world, {
      process: "widget.replace.failed",
      actor: actor || backendHost,
      body: { failures: validatedOutput.failures, id }
    });
    return { ok: false, status: 500, error: "widget.replace output failed typed validation", witness };
  }
  const result = applyWidgetReplace(world, {
    actor: actor || backendHost,
    id,
    kind: nextKind,
    props: nextProps,
    context: current.context ?? null,
    previous: current,
    migrationStatus: classification.migrationStatus
  });
  return {
    ok: true,
    status: 200,
    widget: result.widget,
    migrationStatus: result.migrationStatus,
    witness: result.witness,
    witnesses: result.witnesses
  };
}

export function requestWidgetReplaceRollback(world, {
  actor,
  backendHost,
  body
}) {
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) {
    const witness = fail(world, {
      process: "widget.replace.rollback.failed",
      actor: actor || backendHost,
      body: { reason: "widget id is required", id: null }
    });
    return { ok: false, status: 400, error: "widget id is required", witness };
  }
  const result = rollbackWidgetReplace(world, {
    actor: actor || backendHost,
    id
  });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status === "failed" ? 409 : 400,
      error: result.witness?.body?.reason || "widget replace rollback unavailable",
      witness: result.witness
    };
  }
  return {
    ok: true,
    status: 200,
    widget: result.widget,
    migrationStatus: result.migrationStatus,
    witness: result.witness,
    witnesses: result.witnesses
  };
}
