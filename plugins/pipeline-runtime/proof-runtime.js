const WORLD_SHAPES = new Set(["Device", "Sensor", "SensorSample"]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeSqlTable(values = {}) {
  return {
    kind: "sql_table",
    name: normalizeText(values.name),
    binding: normalizeText(values.binding),
    provider: normalizeText(values.provider),
    schema: normalizeText(values.schema),
    table: normalizeText(values.table),
    columns: Array.isArray(values.columns) ? values.columns.map(column => ({
      name: normalizeText(column?.name),
      type: normalizeText(column?.type)
    })) : [],
    keys: Array.isArray(values.keys) ? values.keys.map(normalizeText) : []
  };
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

function normalizeArgs(args = {}) {
  return Object.fromEntries(
    Object.entries(args ?? {}).map(([key, value]) => [normalizeText(key), value])
  );
}

function normalizeRows(rows = []) {
  return (rows ?? []).map(row =>
    Object.fromEntries(
      Object.entries(row ?? {}).map(([key, value]) => [normalizeText(key), value])
    )
  );
}

function normalizePipelineTest(values = {}) {
  return {
    kind: "pipeline_test",
    name: normalizeText(values.name),
    subject: normalizeText(values.subject),
    fixture: {
      sourceRows: Array.isArray(values.fixture?.sourceRows) ? values.fixture.sourceRows.map(section => ({
        table: normalizeText(section?.table),
        rows: normalizeRows(section?.rows)
      })) : [],
      worldRows: Array.isArray(values.fixture?.worldRows) ? values.fixture.worldRows.map(section => ({
        shape: normalizeText(section?.shape),
        rows: normalizeRows(section?.rows)
      })) : []
    },
    expect: {
      emits: Array.isArray(values.expect?.emits) ? values.expect.emits.map(section => ({
        shape: normalizeText(section?.shape),
        rows: normalizeRows(section?.rows)
      })) : [],
      sqlRows: Array.isArray(values.expect?.sqlRows) ? values.expect.sqlRows.map(section => ({
        table: normalizeText(section?.table),
        rows: normalizeRows(section?.rows)
      })) : [],
      skips: Array.isArray(values.expect?.skips) ? values.expect.skips.map(normalizeText) : [],
      summary: values.expect?.summary && typeof values.expect.summary === "object"
        ? Object.fromEntries(Object.entries(values.expect.summary).map(([key, value]) => [normalizeText(key), value]))
        : null
    }
  };
}

function normalizeInputTransform(values = {}) {
  return {
    kind: "input_transform",
    name: normalizeText(values.name),
    source: normalizeText(values.source),
    emits: Array.isArray(values.emits) ? values.emits.map(emit => ({
      shape: normalizeText(emit?.shape),
      keys: Array.isArray(emit?.keys) ? emit.keys.map(normalizeMapping) : [],
      fields: Array.isArray(emit?.fields) ? emit.fields.map(normalizeMapping) : []
    })) : []
  };
}

function normalizeOutputTransform(values = {}) {
  return {
    kind: "output_transform",
    name: normalizeText(values.name),
    source: normalizeText(values.source),
    target: normalizeText(values.target),
    writeMode: normalizeText(values.writeMode),
    keys: Array.isArray(values.keys) ? values.keys.map(normalizeMapping) : [],
    fields: Array.isArray(values.fields) ? values.fields.map(normalizeMapping) : []
  };
}

function normalizeSync(values = {}) {
  return {
    kind: "sync",
    name: normalizeText(values.name),
    input: normalizeText(values.input),
    outputs: Array.isArray(values.outputs) ? values.outputs.map(normalizeText) : [],
    triggers: Array.isArray(values.triggers) ? values.triggers.map(normalizeText) : [],
    progress: values.progress && typeof values.progress === "object"
      ? {
          kind: normalizeText(values.progress.kind),
          field: normalizeText(values.progress.field),
          replayWindowMs: values.progress.replayWindowMs ?? null
        }
      : null,
    consistency: normalizeText(values.consistency)
  };
}

function normalizeProgram(program = {}) {
  const tables = new Map();
  const inputTransforms = new Map();
  const outputTransforms = new Map();
  const syncs = new Map();
  const tests = new Map();

  for (const table of program.tables ?? []) tables.set(table.name, normalizeSqlTable(table));
  for (const transform of program.inputTransforms ?? []) inputTransforms.set(transform.name, normalizeInputTransform(transform));
  for (const transform of program.outputTransforms ?? []) outputTransforms.set(transform.name, normalizeOutputTransform(transform));
  for (const sync of program.syncs ?? []) syncs.set(sync.name, normalizeSync(sync));
  for (const testCase of program.tests ?? []) tests.set(testCase.name, normalizePipelineTest(testCase));

  return { tables, inputTransforms, outputTransforms, syncs, tests };
}

function collectDeclarationRows(runtimeResiduals = []) {
  const rows = [];
  for (const residual of runtimeResiduals ?? []) {
    if (residual?.kind !== "runtime.declaration") continue;
    rows.push({
      kind: normalizeText(residual.body?.declarationKind),
      values: residual.body?.values ?? {}
    });
  }
  return rows;
}

export function createPipelineProofProgramFromDesire(desire) {
  const declarations = collectDeclarationRows(desire?.runtimeResiduals);
  return normalizeProgram({
    tables: declarations.filter(row => row.kind === "sql_table").map(row => row.values),
    inputTransforms: declarations.filter(row => row.kind === "input_transform").map(row => row.values),
    outputTransforms: declarations.filter(row => row.kind === "output_transform").map(row => row.values),
    syncs: declarations.filter(row => row.kind === "sync").map(row => row.values),
    tests: declarations.filter(row => row.kind === "pipeline_test").map(row => row.values)
  });
}

function stableDeviceId(sourceDeviceId) {
  return `device:${sourceDeviceId}`;
}

function stableSensorId(sourceDeviceId, sourceSensorId, sensorType) {
  return `sensor:${sourceDeviceId}:${sourceSensorId}:${sensorType}`;
}

function parseEpochAuto(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`sample_timestamp requires numeric start, received ${JSON.stringify(value)}`);
  }
  return Math.abs(numeric) >= 1e12 ? numeric : numeric * 1000;
}

function resolveEpochStart(start, epochUnit) {
  if (epochUnit === "ms") return Number(start);
  if (epochUnit === "s") return Number(start) * 1000;
  if (epochUnit === "auto" || !epochUnit) return parseEpochAuto(start);
  throw new Error(`sample_timestamp has unsupported epoch_unit ${epochUnit}`);
}

export const pipelineDeriveOperators = Object.freeze({
  device_identity_key(args = {}) {
    return stableDeviceId(normalizeText(args.source_device_id));
  },
  sensor_identity_key(args = {}) {
    return stableSensorId(
      normalizeText(args.source_device_id),
      normalizeText(args.source_sensor_id),
      normalizeText(args.sensor_type)
    );
  },
  sample_timestamp(args = {}) {
    const startMs = resolveEpochStart(args.start, normalizeText(args.epoch_unit || "auto"));
    const counter = Number(args.counter);
    const intervalMs = Number(args.interval_ms);
    if (!Number.isFinite(counter) || !Number.isFinite(intervalMs)) {
      throw new Error("sample_timestamp requires numeric counter and interval_ms");
    }
    const timestamp = startMs + ((counter - 1) * intervalMs);
    return new Date(timestamp).toISOString();
  }
});

export function listPipelineDeriveOperatorIds() {
  return Object.keys(pipelineDeriveOperators);
}

export function hasPipelineDeriveOperator(id) {
  return Object.prototype.hasOwnProperty.call(pipelineDeriveOperators, String(id || ""));
}

function resolveArgumentValue(rawValue, sourceRow) {
  if (typeof rawValue === "string" && Object.prototype.hasOwnProperty.call(sourceRow, rawValue)) {
    return sourceRow[rawValue];
  }
  return rawValue;
}

function evaluateMapping(mapping, sourceRow) {
  if (mapping.kind === "from") {
    return sourceRow[mapping.sourceField];
  }
  if (mapping.kind === "literal") {
    return mapping.literal;
  }
  if (mapping.kind === "derive") {
    const deriveFn = pipelineDeriveOperators[mapping.derive];
    if (!deriveFn) {
      throw new Error(`Unknown pipeline derive operator ${mapping.derive}`);
    }
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

function ensureShapeMapRows(shapeMap) {
  return Object.fromEntries(
    [...WORLD_SHAPES].map(shape => [shape, normalizeRows(shapeMap[shape] ?? [])])
  );
}

export function evaluateInputTransformSubject(program, inputTransformId, sourceRows) {
  const transform = program.inputTransforms.get(inputTransformId);
  if (!transform) throw new Error(`Unknown input_transform ${inputTransformId}`);
  const emissions = Object.fromEntries([...WORLD_SHAPES].map(shape => [shape, []]));

  for (const sourceRow of normalizeRows(sourceRows)) {
    for (const emit of transform.emits) {
      emissions[emit.shape].push(evaluateRow(emit.keys, emit.fields, sourceRow));
    }
  }

  return {
    subjectKind: "input_transform",
    worldEmissions: ensureShapeMapRows(emissions),
    sqlEmissions: {},
    skips: [],
    summary: buildSummary(emissions, {})
  };
}

export function evaluateOutputTransformSubject(program, outputTransformId, worldRowsByShape) {
  const transform = program.outputTransforms.get(outputTransformId);
  if (!transform) throw new Error(`Unknown output_transform ${outputTransformId}`);
  const rows = normalizeRows(worldRowsByShape?.[transform.source] ?? []);
  const emittedRows = rows.map(row => evaluateRow(transform.keys, transform.fields, row));
  const sqlEmissions = { [transform.target]: emittedRows };
  return {
    subjectKind: "output_transform",
    worldEmissions: ensureShapeMapRows({}),
    sqlEmissions,
    skips: [],
    summary: buildSummary({}, sqlEmissions)
  };
}

export function evaluateSyncSubject(program, syncId, sourceRows) {
  const sync = program.syncs.get(syncId);
  if (!sync) throw new Error(`Unknown sync ${syncId}`);
  const inputResult = evaluateInputTransformSubject(program, sync.input, sourceRows);
  const sqlEmissions = {};

  for (const outputId of sync.outputs) {
    const outputTransform = program.outputTransforms.get(outputId);
    if (!outputTransform) throw new Error(`Unknown output_transform ${outputId}`);
    const outputResult = evaluateOutputTransformSubject(program, outputId, inputResult.worldEmissions);
    for (const [table, rows] of Object.entries(outputResult.sqlEmissions)) {
      sqlEmissions[table] = [...(sqlEmissions[table] ?? []), ...rows];
    }
  }

  return {
    subjectKind: "sync",
    worldEmissions: inputResult.worldEmissions,
    sqlEmissions,
    skips: [],
    summary: buildSummary(inputResult.worldEmissions, sqlEmissions)
  };
}

function buildSummary(worldEmissions = {}, sqlEmissions = {}) {
  return {
    worldCounts: Object.fromEntries(
      [...WORLD_SHAPES].map(shape => [shape, (worldEmissions[shape] ?? []).length])
    ),
    sqlCounts: Object.fromEntries(
      Object.entries(sqlEmissions).map(([table, rows]) => [table, rows.length])
    ),
    skipCount: 0
  };
}

function actualWorldShapes(actualWorldEmissions) {
  return [...WORLD_SHAPES].filter(shape => (actualWorldEmissions[shape] ?? []).length > 0);
}

function compareRowArrays(label, actualRows, expectedRows) {
  const mismatches = [];
  if (actualRows.length !== expectedRows.length) {
    mismatches.push(`${label} row count ${actualRows.length} !== expected ${expectedRows.length}`);
  }
  const limit = Math.max(actualRows.length, expectedRows.length);
  for (let index = 0; index < limit; index += 1) {
    const actual = actualRows[index];
    const expected = expectedRows[index];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      mismatches.push(`${label} row ${index + 1} ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
    }
  }
  return mismatches;
}

function compareSummary(actualSummary, expectedSummary) {
  if (!expectedSummary) return [];
  return JSON.stringify(actualSummary) === JSON.stringify(expectedSummary)
    ? []
    : [`summary ${JSON.stringify(actualSummary)} !== ${JSON.stringify(expectedSummary)}`];
}

function compareProofResult(result, expected) {
  const mismatches = [];
  const expectedEmitMap = Object.fromEntries((expected.emits ?? []).map(section => [section.shape, normalizeRows(section.rows)]));
  const expectedSqlMap = Object.fromEntries((expected.sqlRows ?? []).map(section => [section.table, normalizeRows(section.rows)]));
  const worldShapes = new Set([...actualWorldShapes(result.worldEmissions), ...Object.keys(expectedEmitMap)]);
  const sqlTables = new Set([...Object.keys(result.sqlEmissions), ...Object.keys(expectedSqlMap)]);

  for (const shape of worldShapes) {
    mismatches.push(...compareRowArrays(`emit ${shape}`, result.worldEmissions[shape] ?? [], expectedEmitMap[shape] ?? []));
  }
  for (const table of sqlTables) {
    mismatches.push(...compareRowArrays(`sql_rows ${table}`, result.sqlEmissions[table] ?? [], expectedSqlMap[table] ?? []));
  }

  const actualSkips = result.skips ?? [];
  const expectedSkips = expected.skips ?? [];
  if (JSON.stringify(actualSkips) !== JSON.stringify(expectedSkips)) {
    mismatches.push(`skips ${JSON.stringify(actualSkips)} !== ${JSON.stringify(expectedSkips)}`);
  }

  mismatches.push(...compareSummary(result.summary, expected.summary));
  return mismatches;
}

export function evaluatePipelineProof(programOrDesire, testId) {
  const program = typeof programOrDesire?.tables?.get === "function"
    ? programOrDesire
    : createPipelineProofProgramFromDesire(programOrDesire);
  const testCase = program.tests.get(String(testId || ""));
  if (!testCase) throw new Error(`Unknown pipeline_test ${testId}`);

  let result;
  if (program.inputTransforms.has(testCase.subject)) {
    const transform = program.inputTransforms.get(testCase.subject);
    const fixture = testCase.fixture.sourceRows.find(section => section.table === transform.source);
    result = evaluateInputTransformSubject(program, testCase.subject, fixture?.rows ?? []);
  } else if (program.outputTransforms.has(testCase.subject)) {
    const transform = program.outputTransforms.get(testCase.subject);
    const worldFixture = Object.fromEntries(
      testCase.fixture.worldRows.map(section => [section.shape, section.rows])
    );
    result = evaluateOutputTransformSubject(program, testCase.subject, worldFixture);
  } else if (program.syncs.has(testCase.subject)) {
    const sync = program.syncs.get(testCase.subject);
    const inputTransform = program.inputTransforms.get(sync.input);
    const fixture = testCase.fixture.sourceRows.find(section => section.table === inputTransform.source);
    result = evaluateSyncSubject(program, testCase.subject, fixture?.rows ?? []);
  } else {
    throw new Error(`pipeline_test ${testCase.name} references unknown subject ${testCase.subject}`);
  }

  const mismatches = compareProofResult(result, testCase.expect);
  return {
    ok: mismatches.length === 0,
    test: testCase,
    actual: result,
    mismatches
  };
}
