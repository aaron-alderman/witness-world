import {
  createPipelineProofProgramFromDesire,
  pipelineDeriveOperators
} from "./proof-runtime.js";

const WORLD_ENTITY_SHAPES = new Set(["Device", "Sensor"]);
const WORLD_SHAPES = new Set([...WORLD_ENTITY_SHAPES, "SensorSample"]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeArgs(args = {}) {
  return Object.fromEntries(
    Object.entries(args ?? {}).map(([key, value]) => [normalizeText(key), value])
  );
}

function normalizeMapping(mapping = {}) {
  return {
    targetField: normalizeText(mapping.targetField),
    kind: normalizeText(mapping.kind),
    sourceField: mapping.sourceField == null ? null : normalizeText(mapping.sourceField),
    literal: Object.prototype.hasOwnProperty.call(mapping, "literal") ? mapping.literal : undefined,
    derive: mapping.derive == null ? null : normalizeText(mapping.derive),
    args: normalizeArgs(mapping.args)
  };
}

function normalizeRows(rows = []) {
  return (rows ?? []).map(row =>
    Object.fromEntries(
      Object.entries(row ?? {}).map(([key, value]) => [normalizeText(key), value])
    )
  );
}

function cloneMappings(mappings = []) {
  return (mappings ?? []).map(normalizeMapping);
}

function cloneTableReference(table) {
  return {
    tableId: table.name,
    binding: table.binding,
    provider: table.provider,
    schema: table.schema,
    table: table.table,
    columns: (table.columns ?? []).map(column => ({
      name: normalizeText(column?.name),
      type: normalizeText(column?.type)
    })),
    keys: (table.keys ?? []).map(normalizeText)
  };
}

function ensureWorldShape(shape, label) {
  if (!WORLD_SHAPES.has(shape)) throw new Error(`${label} references unsupported world shape ${shape}`);
  return shape;
}

function lookupTable(program, tableId, label) {
  const table = program.tables.get(String(tableId || ""));
  if (!table) throw new Error(`${label} references unknown sql_table ${tableId}`);
  return table;
}

function lookupInputTransform(program, transformId, label) {
  const transform = program.inputTransforms.get(String(transformId || ""));
  if (!transform) throw new Error(`${label} references unknown input_transform ${transformId}`);
  return transform;
}

function lookupOutputTransform(program, transformId, label) {
  const transform = program.outputTransforms.get(String(transformId || ""));
  if (!transform) throw new Error(`${label} references unknown output_transform ${transformId}`);
  return transform;
}

function lookupSync(program, syncId, label) {
  const sync = program.syncs.get(String(syncId || ""));
  if (!sync) throw new Error(`${label} references unknown sync ${syncId}`);
  return sync;
}

function resolveArgumentValue(rawValue, sourceRow) {
  if (typeof rawValue === "string" && Object.prototype.hasOwnProperty.call(sourceRow, rawValue)) {
    return sourceRow[rawValue];
  }
  return rawValue;
}

function evaluateMapping(mapping, sourceRow) {
  if (mapping.kind === "from") return sourceRow[mapping.sourceField];
  if (mapping.kind === "literal") return mapping.literal;
  if (mapping.kind === "derive") {
    const deriveFn = pipelineDeriveOperators[mapping.derive];
    if (!deriveFn) throw new Error(`Unknown pipeline derive operator ${mapping.derive}`);
    const args = Object.fromEntries(
      Object.entries(mapping.args ?? {}).map(([key, value]) => [key, resolveArgumentValue(value, sourceRow)])
    );
    return deriveFn(args);
  }
  throw new Error(`Unsupported mapping kind ${mapping.kind}`);
}

function evaluateRow(keys, fields, sourceRow) {
  const row = {};
  for (const mapping of [...(keys ?? []), ...(fields ?? [])]) {
    row[mapping.targetField] = evaluateMapping(mapping, sourceRow);
  }
  return row;
}

function buildSummary(worldEmissions = {}, sqlEmissions = {}) {
  return {
    worldCounts: Object.fromEntries(
      [...WORLD_SHAPES].map(shape => [shape, (worldEmissions[shape] ?? []).length])
    ),
    sqlCounts: Object.fromEntries(
      Object.entries(sqlEmissions).map(([tableId, rows]) => [tableId, rows.length])
    ),
    skipCount: 0
  };
}

function emptyWorldEmissions() {
  return Object.fromEntries([...WORLD_SHAPES].map(shape => [shape, []]));
}

function fixtureSourceRows(fixtures, tableId) {
  if (Array.isArray(fixtures)) return normalizeRows(fixtures);
  if (Array.isArray(fixtures?.sourceRows)) {
    const section = fixtures.sourceRows.find(entry => normalizeText(entry?.table) === tableId);
    return normalizeRows(section?.rows ?? []);
  }
  if (fixtures?.sourceRows && typeof fixtures.sourceRows === "object") {
    return normalizeRows(fixtures.sourceRows[tableId] ?? []);
  }
  return [];
}

function fixtureWorldRows(fixtures) {
  if (Array.isArray(fixtures?.worldRows)) {
    return Object.fromEntries(
      fixtures.worldRows.map(section => [
        ensureWorldShape(normalizeText(section?.shape), "world fixture"),
        normalizeRows(section?.rows ?? [])
      ])
    );
  }
  if (fixtures?.worldRows && typeof fixtures.worldRows === "object") {
    return Object.fromEntries(
      Object.entries(fixtures.worldRows).map(([shape, rows]) => [
        ensureWorldShape(normalizeText(shape), "world fixture"),
        normalizeRows(rows)
      ])
    );
  }
  return {};
}

function materializeInputTransform(transform, table) {
  return {
    id: transform.name,
    source: cloneTableReference(table),
    emits: (transform.emits ?? []).map(emit => ({
      shape: ensureWorldShape(emit.shape, `input_transform ${transform.name}`),
      keys: cloneMappings(emit.keys),
      fields: cloneMappings(emit.fields)
    }))
  };
}

function materializeOutputTransform(transform, table) {
  return {
    id: transform.name,
    sourceShape: ensureWorldShape(transform.source, `output_transform ${transform.name}`),
    target: cloneTableReference(table),
    writeMode: normalizeText(transform.writeMode),
    keys: cloneMappings(transform.keys),
    fields: cloneMappings(transform.fields)
  };
}

function makeReadStage(source) {
  return { kind: "read_sql_rows", source };
}

function makeEmitStage(transformId, emit) {
  return {
    kind: emit.shape === "SensorSample" ? "emit_world_stream" : "emit_world_entities",
    transformId,
    shape: emit.shape,
    keys: cloneMappings(emit.keys),
    fields: cloneMappings(emit.fields)
  };
}

function makeWriteStage(outputTransform) {
  return {
    kind: "write_sql_rows",
    transformId: outputTransform.id,
    sourceShape: outputTransform.sourceShape,
    target: outputTransform.target,
    writeMode: outputTransform.writeMode,
    keys: cloneMappings(outputTransform.keys),
    fields: cloneMappings(outputTransform.fields)
  };
}

function coercePipelineProgram(programOrDesire) {
  if (typeof programOrDesire?.tables?.get === "function"
    && typeof programOrDesire?.inputTransforms?.get === "function"
    && typeof programOrDesire?.outputTransforms?.get === "function"
    && typeof programOrDesire?.syncs?.get === "function") {
    return programOrDesire;
  }
  return createPipelineProofProgramFromDesire(programOrDesire);
}

export function planInputTransform(programOrDesire, inputTransformId) {
  const program = coercePipelineProgram(programOrDesire);
  const transform = lookupInputTransform(program, inputTransformId, "plan");
  const sourceTable = lookupTable(program, transform.source, `input_transform ${transform.name}`);
  const inputTransform = materializeInputTransform(transform, sourceTable);
  return {
    kind: "pipelineExecutionPlan",
    planKind: "input_transform",
    subjectId: transform.name,
    syncId: null,
    sync: null,
    source: inputTransform.source,
    input: transform.name,
    outputs: [],
    inputTransform,
    outputTransforms: [],
    progress: null,
    triggers: [],
    consistency: null,
    stages: [
      makeReadStage(inputTransform.source),
      ...inputTransform.emits.map(emit => makeEmitStage(transform.name, emit))
    ]
  };
}

export function planOutputTransform(programOrDesire, outputTransformId) {
  const program = coercePipelineProgram(programOrDesire);
  const transform = lookupOutputTransform(program, outputTransformId, "plan");
  const targetTable = lookupTable(program, transform.target, `output_transform ${transform.name}`);
  const outputTransform = materializeOutputTransform(transform, targetTable);
  return {
    kind: "pipelineExecutionPlan",
    planKind: "output_transform",
    subjectId: transform.name,
    syncId: null,
    sync: null,
    source: { shape: outputTransform.sourceShape },
    input: null,
    outputs: [transform.name],
    inputTransform: null,
    outputTransforms: [outputTransform],
    progress: null,
    triggers: [],
    consistency: null,
    stages: [makeWriteStage(outputTransform)]
  };
}

export function planPipelineSync(programOrDesire, syncId) {
  const program = coercePipelineProgram(programOrDesire);
  const sync = lookupSync(program, syncId, "plan");
  const inputPlan = planInputTransform(program, sync.input);
  const outputTransforms = sync.outputs.map(outputId => {
    const transform = lookupOutputTransform(program, outputId, `sync ${sync.name}`);
    const targetTable = lookupTable(program, transform.target, `output_transform ${transform.name}`);
    return materializeOutputTransform(transform, targetTable);
  });
  return {
    kind: "pipelineExecutionPlan",
    planKind: "sync",
    subjectId: sync.name,
    syncId: sync.name,
    sync: sync.name,
    source: inputPlan.source,
    input: sync.input,
    outputs: [...sync.outputs],
    inputTransform: inputPlan.inputTransform,
    outputTransforms,
    progress: sync.progress ? { ...sync.progress } : null,
    triggers: [...(sync.triggers ?? [])],
    consistency: sync.consistency,
    stages: [
      makeReadStage(inputPlan.source),
      ...inputPlan.inputTransform.emits.map(emit => makeEmitStage(sync.input, emit)),
      ...outputTransforms.map(makeWriteStage)
    ]
  };
}

export function createPipelineExecutionPlanProgramFromDesire(desire) {
  const program = createPipelineProofProgramFromDesire(desire);
  const syncPlans = new Map(
    [...program.syncs.keys()].map(syncId => [syncId, planPipelineSync(program, syncId)])
  );
  return {
    ...program,
    syncPlans
  };
}

function evaluatePlan(plan, fixtures) {
  const worldEmissions = emptyWorldEmissions();
  const sqlEmissions = {};
  const sourceRows = plan.source?.tableId ? fixtureSourceRows(fixtures, plan.source.tableId) : [];
  const worldFixtures = fixtureWorldRows(fixtures);

  for (const stage of plan.stages ?? []) {
    if (stage.kind !== "emit_world_entities" && stage.kind !== "emit_world_stream") continue;
    for (const sourceRow of sourceRows) {
      worldEmissions[stage.shape].push(evaluateRow(stage.keys, stage.fields, sourceRow));
    }
  }

  for (const stage of plan.stages ?? []) {
    if (stage.kind !== "write_sql_rows") continue;
    const sourceShapeRows = (worldEmissions[stage.sourceShape] ?? []).length > 0
      ? worldEmissions[stage.sourceShape]
      : normalizeRows(worldFixtures[stage.sourceShape] ?? []);
    const emittedRows = sourceShapeRows.map(row => evaluateRow(stage.keys, stage.fields, row));
    const tableId = stage.target.tableId;
    sqlEmissions[tableId] = [...(sqlEmissions[tableId] ?? []), ...emittedRows];
  }

  return {
    subjectKind: plan.planKind,
    worldEmissions,
    sqlEmissions,
    skips: [],
    summary: buildSummary(worldEmissions, sqlEmissions)
  };
}

export function evaluatePlannedInputTransform(plan, fixtures) {
  if (plan?.planKind !== "input_transform") {
    throw new Error(`evaluatePlannedInputTransform requires an input_transform plan, received ${plan?.planKind ?? "unknown"}`);
  }
  return evaluatePlan(plan, fixtures);
}

export function evaluatePlannedOutputTransform(plan, fixtures) {
  if (plan?.planKind !== "output_transform") {
    throw new Error(`evaluatePlannedOutputTransform requires an output_transform plan, received ${plan?.planKind ?? "unknown"}`);
  }
  return evaluatePlan(plan, fixtures);
}

export function evaluatePlannedSync(plan, fixtures) {
  if (plan?.planKind !== "sync") {
    throw new Error(`evaluatePlannedSync requires a sync plan, received ${plan?.planKind ?? "unknown"}`);
  }
  return evaluatePlan(plan, fixtures);
}
