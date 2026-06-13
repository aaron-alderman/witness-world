import { stableId } from "./ids.js";

export const DESIRE_KERNEL_KINDS = new Set([
  "context",
  "type",
  "message",
  "store",
  "entity",
  "graph",
  "projection",
  "capability",
  "boundary",
  "policy",
  "process",
  "surface",
  "dataflow"
]);

export const DESIRE_BRIDGE_KINDS = new Set([
  "runtime.declaration",
  "runtime.doc"
]);

export const DESIRE_NODE_KINDS = new Set([
  ...DESIRE_KERNEL_KINDS
]);

export const DESIRE_PLUS_BUILTIN_NODE_KINDS = new Set([
  "wtoml.doc",
  "rvm.form"
]);

export const DESIRE_PLUS_SEMANTIC_KINDS = new Set([
  "actor",
  "boundary",
  "capability",
  "context",
  "dataflow",
  "entity",
  "graph",
  "import",
  "message",
  "module",
  "policy",
  "process",
  "projection",
  "state",
  "stdlib",
  "store",
  "surface",
  "type"
]);

export const DESIRE_PLUS_SOURCE_CATEGORIES = new Set([
  "semantic",
  "runtime",
  "source",
  "graph-data",
  "fixture-corruption",
  "unknown"
]);

export const DESIRE_PLUS_RESIDUAL_CATEGORIES = new Set([
  "authored-runtime",
  "conflict-marker",
  "graph-data",
  "lowered-runtime",
  "unknown"
]);

export const DESIRE_PLUS_BOUNDARIES = new Set([
  "desire-kernel",
  "desire-plus-only",
  "needs-classification"
]);

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function assertPlainObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected object");
}

function assertString(value, path) {
  if (typeof value !== "string" || !value.trim()) fail(path, "expected non-empty string");
}

function assertNullableString(value, path) {
  if (value !== null && value !== undefined && typeof value !== "string") fail(path, "expected string or null");
}

function assertPositiveIntegerOrNull(value, path) {
  if (value === null || value === undefined) return;
  if (!Number.isInteger(value) || value <= 0) fail(path, "expected positive integer or null");
}

function assertArray(value, path) {
  if (!Array.isArray(value)) fail(path, "expected array");
}

function assertStringArray(value, path) {
  assertArray(value, path);
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string" || !value[index]) fail(`${path}[${index}]`, "expected non-empty string");
  }
}

function assertFiniteOrder(value, path) {
  if (!Number.isInteger(value) || value < 0) fail(path, "expected non-negative integer");
}

function assertStringInSet(value, allowed, path) {
  assertString(value, path);
  if (!allowed.has(value)) fail(path, `unknown value: ${value}`);
}

function assertOptionalStringInSet(value, allowed, path) {
  if (value === null || value === undefined) return;
  assertStringInSet(value, allowed, path);
}

function assertBooleanOrNull(value, path) {
  if (value !== null && value !== undefined && typeof value !== "boolean") fail(path, "expected boolean or null");
}

export function createTrace({
  sourceLanguage,
  file = null,
  startLine = null,
  startColumn = 1,
  endLine = null,
  endColumn = null,
  sourceKind,
  originNodeId = null,
  via = []
}) {
  return validateTrace({
    sourceLanguage,
    file,
    startLine,
    startColumn,
    endLine: endLine ?? startLine,
    endColumn,
    sourceKind,
    originNodeId,
    via: Array.isArray(via) ? [...via] : []
  });
}

export function createDesirePlusNode({
  kind,
  name = null,
  trace,
  order = 0,
  payload = {},
  semantic = null,
  meta = {}
}) {
  const seed = JSON.stringify({
    kind,
    name,
    order,
    file: trace?.file ?? null,
    startLine: trace?.startLine ?? null,
    sourceKind: trace?.sourceKind ?? null
  });
  return validateDesirePlusNode({
    id: stableId("desirePlus", seed),
    kind,
    name,
    order,
    trace,
    payload,
    semantic,
    meta
  });
}

export function validateTrace(trace, { path = "trace" } = {}) {
  assertPlainObject(trace, path);
  assertString(trace.sourceLanguage, `${path}.sourceLanguage`);
  assertNullableString(trace.file, `${path}.file`);
  assertPositiveIntegerOrNull(trace.startLine, `${path}.startLine`);
  assertPositiveIntegerOrNull(trace.startColumn, `${path}.startColumn`);
  assertPositiveIntegerOrNull(trace.endLine, `${path}.endLine`);
  assertPositiveIntegerOrNull(trace.endColumn, `${path}.endColumn`);
  assertString(trace.sourceKind, `${path}.sourceKind`);
  assertNullableString(trace.originNodeId, `${path}.originNodeId`);
  assertArray(trace.via, `${path}.via`);
  for (let index = 0; index < trace.via.length; index += 1) {
    const step = trace.via[index];
    if (!(typeof step === "string" || (step && typeof step === "object" && !Array.isArray(step)))) {
      fail(`${path}.via[${index}]`, "expected string or object");
    }
  }
  if (trace.startLine !== null && trace.endLine !== null && trace.endLine < trace.startLine) {
    fail(`${path}.endLine`, "must be greater than or equal to startLine");
  }
  return {
    sourceLanguage: trace.sourceLanguage,
    file: trace.file ?? null,
    startLine: trace.startLine ?? null,
    startColumn: trace.startColumn ?? 1,
    endLine: trace.endLine ?? trace.startLine ?? null,
    endColumn: trace.endColumn ?? null,
    sourceKind: trace.sourceKind,
    originNodeId: trace.originNodeId ?? null,
    via: [...trace.via]
  };
}

export function validateDesirePlusNode(node, { path = "desirePlusNode" } = {}) {
  assertPlainObject(node, path);
  assertString(node.id, `${path}.id`);
  assertString(node.kind, `${path}.kind`);
  assertNullableString(node.name, `${path}.name`);
  assertFiniteOrder(node.order, `${path}.order`);
  const trace = validateTrace(node.trace, { path: `${path}.trace` });
  assertPlainObject(node.payload ?? {}, `${path}.payload`);
  if (node.semantic !== null && node.semantic !== undefined) {
    assertPlainObject(node.semantic, `${path}.semantic`);
    assertString(node.semantic.kind, `${path}.semantic.kind`);
    if (DESIRE_PLUS_BUILTIN_NODE_KINDS.has(node.kind)) {
      assertStringInSet(node.semantic.kind, DESIRE_PLUS_SEMANTIC_KINDS, `${path}.semantic.kind`);
    }
  }
  assertPlainObject(node.meta ?? {}, `${path}.meta`);
  if (DESIRE_PLUS_BUILTIN_NODE_KINDS.has(node.kind)) {
    assertStringInSet(node.meta?.sourceCategory, DESIRE_PLUS_SOURCE_CATEGORIES, `${path}.meta.sourceCategory`);
    assertOptionalStringInSet(node.meta?.residualCategory, DESIRE_PLUS_RESIDUAL_CATEGORIES, `${path}.meta.residualCategory`);
    assertOptionalStringInSet(node.meta?.desireBoundary, DESIRE_PLUS_BOUNDARIES, `${path}.meta.desireBoundary`);
    if (node.meta?.sourceCategory === "semantic" && (node.semantic === null || node.semantic === undefined)) {
      fail(`${path}.semantic`, "required when meta.sourceCategory is semantic");
    }
  }

  if (node.kind === "wtoml.doc") {
    assertString(node.payload.docKind, `${path}.payload.docKind`);
    assertPlainObject(node.payload.values ?? {}, `${path}.payload.values`);
    assertNullableString(node.payload.file, `${path}.payload.file`);
    assertPositiveIntegerOrNull(node.payload.line, `${path}.payload.line`);
    assertString(node.payload.sectionStyle, `${path}.payload.sectionStyle`);
  }
  if (node.kind === "rvm.form") {
    assertNullableString(node.payload.raw ?? null, `${path}.payload.raw`);
    assertNullableString(node.payload.header ?? null, `${path}.payload.header`);
    assertNullableString(node.payload.body ?? null, `${path}.payload.body`);
    assertArray(node.payload.fields ?? [], `${path}.payload.fields`);
    assertNullableString(node.payload.file, `${path}.payload.file`);
  }

  return {
    id: node.id,
    kind: node.kind,
    name: node.name ?? null,
    order: node.order,
    trace,
    payload: node.payload ?? {},
    semantic: node.semantic ?? null,
    meta: node.meta ?? {}
  };
}

function validateDesireNodeBody(kind, body, path) {
  assertPlainObject(body, path);
  switch (kind) {
    case "context":
      assertNullableString(body.parent, `${path}.parent`);
      return;
    case "type":
      assertNullableString(body.role, `${path}.role`);
      assertNullableString(body.field, `${path}.field`);
      assertNullableString(body.versionKind, `${path}.versionKind`);
      assertNullableString(body.valueType, `${path}.valueType`);
      return;
    case "message":
      assertArray(body.fields ?? [], `${path}.fields`);
      assertNullableString(body.role, `${path}.role`);
      return;
    case "entity":
      assertNullableString(body.context, `${path}.context`);
      assertNullableString(body.store, `${path}.store`);
      assertNullableString(body.identity, `${path}.identity`);
      assertNullableString(body.version, `${path}.version`);
      assertArray(body.fields ?? [], `${path}.fields`);
      return;
    case "graph":
      assertNullableString(body.graphKind, `${path}.graphKind`);
      assertNullableString(body.from, `${path}.from`);
      assertNullableString(body.to, `${path}.to`);
      assertNullableString(body.nodeType, `${path}.nodeType`);
      assertNullableString(body.edgeType, `${path}.edgeType`);
      assertNullableString(body.schemaType, `${path}.schemaType`);
      assertArray(body.fields ?? [], `${path}.fields`);
      assertPlainObject(body.props ?? {}, `${path}.props`);
      return;
    case "capability":
      assertArray(body.verbs ?? [], `${path}.verbs`);
      assertArray(body.scope ?? [], `${path}.scope`);
      return;
    case "boundary":
      assertArray(body.capabilities ?? [], `${path}.capabilities`);
      assertArray(body.operations ?? [], `${path}.operations`);
      return;
    case "process":
      assertArray(body.state ?? [], `${path}.state`);
      assertArray(body.handles ?? [], `${path}.handles`);
      assertArray(body.emits ?? [], `${path}.emits`);
      assertArray(body.rules ?? [], `${path}.rules`);
      return;
    case "dataflow":
      assertArray(body.axes ?? [], `${path}.axes`);
      assertArray(body.params ?? [], `${path}.params`);
      assertArray(body.derives ?? [], `${path}.derives`);
      assertArray(body.reduces ?? [], `${path}.reduces`);
      return;
    case "store":
      assertNullableString(body.storeKind, `${path}.storeKind`);
      assertNullableString(body.context, `${path}.context`);
      assertNullableString(body.owner, `${path}.owner`);
      assertNullableString(body.entity, `${path}.entity`);
      assertPlainObject(body.props ?? {}, `${path}.props`);
      return;
    case "projection":
      assertNullableString(body.projectionKind, `${path}.projectionKind`);
      assertNullableString(body.source, `${path}.source`);
      assertPlainObject(body.props ?? {}, `${path}.props`);
      return;
    case "policy":
      assertNullableString(body.subject, `${path}.subject`);
      assertNullableString(body.initialState, `${path}.initialState`);
      assertNullableString(body.stateField, `${path}.stateField`);
      assertNullableString(body.readyState, `${path}.readyState`);
      assertNullableString(body.disagreementState, `${path}.disagreementState`);
      assertPlainObject(body.disagreementOutcomes ?? {}, `${path}.disagreementOutcomes`);
      assertPlainObject(body.policyOutcomes ?? {}, `${path}.policyOutcomes`);
      return;
    case "surface":
      assertNullableString(body.surfaceKind, `${path}.surfaceKind`);
      assertNullableString(body.className, `${path}.className`);
      assertArray(body.children ?? [], `${path}.children`);
      assertPlainObject(body.props ?? {}, `${path}.props`);
      assertNullableString(body.modelRef, `${path}.modelRef`);
      assertNullableString(body.frame, `${path}.frame`);
      assertPlainObject(body.encoding ?? {}, `${path}.encoding`);
      assertArray(body.editable ?? [], `${path}.editable`);
      assertArray(body.layers ?? [], `${path}.layers`);
      return;
    default:
      fail(path, `unknown DESIRE kind: ${kind}`);
  }
}

export function createDesireNode({
  kind,
  name = null,
  body = {},
  sourceNodeIds = [],
  meta = {}
}) {
  if (!DESIRE_NODE_KINDS.has(kind)) throw new Error(`unknown DESIRE kind: ${kind}`);
  const seed = JSON.stringify({ kind, name, body, sourceNodeIds });
  return validateDesireNode({
    id: stableId("desire", seed),
    kind,
    name,
    body,
    sourceNodeIds: [...new Set(sourceNodeIds.filter(Boolean))],
    meta
  });
}

export function createDesirePlusDocument(nodes, meta = {}) {
  return validateDesirePlusDocument({
    kind: "desire+",
    version: 1,
    nodes: nodes.slice().sort((a, b) => a.order - b.order || String(a.id).localeCompare(String(b.id))),
    meta
  });
}

export function createRuntimeResidual({
  kind = "runtime.declaration",
  name = null,
  body = {},
  sourceNodeIds = [],
  meta = {}
}) {
  if (!DESIRE_BRIDGE_KINDS.has(kind)) throw new Error(`unknown DESIRE residual kind: ${kind}`);
  const seed = JSON.stringify({ kind, name, body, sourceNodeIds });
  return validateRuntimeResidual({
    id: stableId("desireResidual", seed),
    kind,
    name,
    body,
    sourceNodeIds: [...new Set(sourceNodeIds.filter(Boolean))],
    meta
  });
}

export function createDesireDocument(nodes, meta = {}, runtimeResiduals = []) {
  return validateDesireDocument({
    kind: "desire",
    version: 1,
    nodes,
    runtimeResiduals,
    meta
  });
}

export function validateRuntimeResidual(residual, { path = "runtimeResidual" } = {}) {
  assertPlainObject(residual, path);
  assertString(residual.id, `${path}.id`);
  assertString(residual.kind, `${path}.kind`);
  if (!DESIRE_BRIDGE_KINDS.has(residual.kind)) fail(`${path}.kind`, `unknown runtime residual kind: ${residual.kind}`);
  assertNullableString(residual.name, `${path}.name`);
  let body = residual.body ?? {};
  assertPlainObject(body, `${path}.body`);
  switch (residual.kind) {
    case "runtime.declaration":
      body = validateRuntimeDeclarationBody(body, { path: `${path}.body` });
      break;
    case "runtime.doc":
      assertString(body.sourceLanguage, `${path}.body.sourceLanguage`);
      assertString(body.sourceKind, `${path}.body.sourceKind`);
      assertString(body.docKind, `${path}.body.docKind`);
      assertPlainObject(body.values ?? {}, `${path}.body.values`);
      assertNullableString(body.file, `${path}.body.file`);
      assertPositiveIntegerOrNull(body.line, `${path}.body.line`);
      if (!Number.isInteger(body.order) || body.order < 0) fail(`${path}.body.order`, "expected non-negative integer");
      assertString(body.sectionStyle, `${path}.body.sectionStyle`);
      validateTrace(body.trace, { path: `${path}.body.trace` });
      break;
    default:
      fail(path, `unknown runtime residual kind: ${residual.kind}`);
  }
  assertStringArray(residual.sourceNodeIds ?? [], `${path}.sourceNodeIds`);
  assertPlainObject(residual.meta ?? {}, `${path}.meta`);
  return {
    id: residual.id,
    kind: residual.kind,
    name: residual.name ?? null,
    body,
    sourceNodeIds: [...new Set((residual.sourceNodeIds ?? []).filter(Boolean))],
    meta: residual.meta ?? {}
  };
}

function validateRuntimeDeclarationBody(body, { path }) {
  assertPlainObject(body.declaration, `${path}.declaration`);
  const declaration = body.declaration;
  assertString(declaration.kind, `${path}.declaration.kind`);
  assertPlainObject(declaration.values ?? {}, `${path}.declaration.values`);
  assertBooleanOrNull(declaration.sourceDefaultsApplied ?? null, `${path}.declaration.sourceDefaultsApplied`);
  assertPlainObject(declaration.source, `${path}.declaration.source`);
  assertString(declaration.source.language, `${path}.declaration.source.language`);
  assertString(declaration.source.kind, `${path}.declaration.source.kind`);
  assertNullableString(declaration.source.file, `${path}.declaration.source.file`);
  assertPositiveIntegerOrNull(declaration.source.line, `${path}.declaration.source.line`);
  if (!Number.isInteger(declaration.source.order) || declaration.source.order < 0) {
    fail(`${path}.declaration.source.order`, "expected non-negative integer");
  }
  assertString(declaration.source.sectionStyle, `${path}.declaration.source.sectionStyle`);
  const trace = validateTrace(declaration.source.trace, { path: `${path}.declaration.source.trace` });
  const normalizedDeclaration = {
    kind: declaration.kind,
    values: structuredClone(declaration.values ?? {}),
    sourceDefaultsApplied: declaration.sourceDefaultsApplied === true,
    source: {
      language: declaration.source.language,
      kind: declaration.source.kind,
      file: declaration.source.file ?? null,
      line: declaration.source.line ?? null,
      order: declaration.source.order,
      sectionStyle: declaration.source.sectionStyle,
      trace
    }
  };
  return {
    ...body,
    declaration: normalizedDeclaration,
    sourceLanguage: normalizedDeclaration.source.language,
    sourceKind: normalizedDeclaration.source.kind,
    declarationKind: normalizedDeclaration.kind,
    values: structuredClone(normalizedDeclaration.values),
    sourceDefaultsApplied: normalizedDeclaration.sourceDefaultsApplied,
    file: normalizedDeclaration.source.file,
    line: normalizedDeclaration.source.line,
    order: normalizedDeclaration.source.order,
    sectionStyle: normalizedDeclaration.source.sectionStyle,
    trace
  };
}

export function validateDesireNode(node, { path = "desireNode" } = {}) {
  assertPlainObject(node, path);
  assertString(node.id, `${path}.id`);
  assertString(node.kind, `${path}.kind`);
  if (!DESIRE_NODE_KINDS.has(node.kind)) fail(`${path}.kind`, `unknown DESIRE kind: ${node.kind}`);
  assertNullableString(node.name, `${path}.name`);
  validateDesireNodeBody(node.kind, node.body ?? {}, `${path}.body`);
  assertStringArray(node.sourceNodeIds ?? [], `${path}.sourceNodeIds`);
  assertPlainObject(node.meta ?? {}, `${path}.meta`);
  return {
    id: node.id,
    kind: node.kind,
    name: node.name ?? null,
    body: node.body ?? {},
    sourceNodeIds: [...new Set((node.sourceNodeIds ?? []).filter(Boolean))],
    meta: node.meta ?? {}
  };
}

export function validateDesirePlusDocument(document, { path = "desirePlusDocument" } = {}) {
  assertPlainObject(document, path);
  if (document.kind !== "desire+") fail(`${path}.kind`, "expected desire+");
  if (document.version !== 1) fail(`${path}.version`, "expected version 1");
  assertArray(document.nodes, `${path}.nodes`);
  const nodes = document.nodes.map((node, index) => validateDesirePlusNode(node, { path: `${path}.nodes[${index}]` }));
  assertPlainObject(document.meta ?? {}, `${path}.meta`);
  return {
    kind: "desire+",
    version: 1,
    nodes,
    meta: document.meta ?? {}
  };
}

export function validateDesireDocument(document, { path = "desireDocument" } = {}) {
  assertPlainObject(document, path);
  if (document.kind !== "desire") fail(`${path}.kind`, "expected desire");
  if (document.version !== 1) fail(`${path}.version`, "expected version 1");
  assertArray(document.nodes, `${path}.nodes`);
  const nodes = document.nodes.map((node, index) => validateDesireNode(node, { path: `${path}.nodes[${index}]` }));
  assertArray(document.runtimeResiduals ?? [], `${path}.runtimeResiduals`);
  const runtimeResiduals = (document.runtimeResiduals ?? []).map((residual, index) =>
    validateRuntimeResidual(residual, { path: `${path}.runtimeResiduals[${index}]` })
  );
  assertPlainObject(document.meta ?? {}, `${path}.meta`);
  return {
    kind: "desire",
    version: 1,
    nodes,
    runtimeResiduals,
    meta: document.meta ?? {}
  };
}
