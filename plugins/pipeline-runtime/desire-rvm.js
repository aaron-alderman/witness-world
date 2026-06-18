import { hasPipelineDeriveOperator, listPipelineDeriveOperatorIds } from "./proof-runtime.js";

const SYNC_TRIGGERS = new Set(["manual", "scheduled", "source_triggered"]);
const SYNC_PROGRESS_KINDS = new Set(["monotonic"]);
const SYNC_CONSISTENCY_VALUES = new Set(["eventual"]);
const OUTPUT_WRITE_MODES = new Set(["append", "upsert", "insert_ignore"]);
const WORLD_SHAPES = new Set(["Device", "Sensor", "SensorSample"]);
const TEST_SUBJECT_KINDS = new Set(["input_transform", "output_transform", "sync"]);

function readSimpleValue(bodyLines, key) {
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const match = trimmed.match(new RegExp(`^${escapeRegExp(key)}\\s+(.+)$`));
    if (match && !trimmed.endsWith("{")) return cleanValue(match[1]);
  }
  return null;
}

function readRepeatedSimpleValues(bodyLines, key) {
  const values = [];
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const match = trimmed.match(new RegExp(`^${escapeRegExp(key)}\\s+(.+)$`));
    if (match && !trimmed.endsWith("{")) values.push(cleanValue(match[1]));
  }
  return values;
}

function extractNamedBlock(bodyLines, blockName) {
  const out = [];
  let depth = 0;
  let active = false;
  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!active && trimmed === `${blockName} {`) {
      active = true;
      depth = 1;
      continue;
    }
    if (!active) continue;
    for (const ch of line) {
      if (ch === "{") depth += 1;
      if (ch === "}") depth -= 1;
    }
    if (trimmed === "}" && depth === 0) break;
    if (depth <= 0) break;
    out.push(line);
  }
  return out;
}

function extractRepeatedHeaderBlocks(bodyLines, headerPrefix) {
  const blocks = [];
  for (let index = 0; index < bodyLines.length; index += 1) {
    const trimmed = bodyLines[index].trim();
    const match = trimmed.match(new RegExp(`^${escapeRegExp(headerPrefix)}\\s+([A-Za-z_][A-Za-z0-9_.:-]*)\\s*\\{$`));
    if (!match) continue;
    const lines = [];
    let depth = 1;
    index += 1;
    while (index < bodyLines.length && depth > 0) {
      const candidate = bodyLines[index];
      const candidateTrimmed = candidate.trim();
      for (const ch of candidate) {
        if (ch === "{") depth += 1;
        if (ch === "}") depth -= 1;
      }
      if (candidateTrimmed === "}" && depth === 0) break;
      if (depth > 0) lines.push(candidate);
      index += 1;
    }
    blocks.push({ name: match[1], lines });
  }
  return blocks;
}

function extractRepeatedAnonymousBlocks(bodyLines, blockName) {
  const blocks = [];
  for (let index = 0; index < bodyLines.length; index += 1) {
    const trimmed = bodyLines[index].trim();
    if (trimmed !== `${blockName} {`) continue;
    const lines = [];
    let depth = 1;
    index += 1;
    while (index < bodyLines.length && depth > 0) {
      const candidate = bodyLines[index];
      const candidateTrimmed = candidate.trim();
      for (const ch of candidate) {
        if (ch === "{") depth += 1;
        if (ch === "}") depth -= 1;
      }
      if (candidateTrimmed === "}" && depth === 0) break;
      if (depth > 0) lines.push(candidate);
      index += 1;
    }
    blocks.push({ lines });
  }
  return blocks;
}

function cleanValue(value) {
  return String(value || "").trim().replace(/^"|"$/g, "");
}

function parseScalarValue(value) {
  const cleaned = cleanValue(value);
  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    const inner = cleaned.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map(item => parseScalarValue(item.trim()));
  }
  if (cleaned === "true") return true;
  if (cleaned === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  return cleaned;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSyncProgressBlock(bodyLines) {
  const lines = extractNamedBlock(bodyLines, "progress");
  const replayWindowRaw = readSimpleValue(lines, "replay_window_ms");
  return {
    kind: readSimpleValue(lines, "kind"),
    field: readSimpleValue(lines, "field"),
    replayWindowMs: replayWindowRaw === null ? null : parseScalarValue(replayWindowRaw)
  };
}

function parseMappingClauses(bodyLines, ownerLabel, { allowKeys = true, allowFields = true } = {}) {
  const keys = [];
  const fields = [];
  let activeDerived = null;
  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (allowKeys) {
      const keyFromMatch = trimmed.match(/^key\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+from\s+([A-Za-z_][A-Za-z0-9_.:/-]*)$/);
      if (keyFromMatch) {
        keys.push({
          targetField: keyFromMatch[1],
          kind: "from",
          sourceField: keyFromMatch[2]
        });
        activeDerived = null;
        continue;
      }
      const keyDeriveMatch = trimmed.match(/^key\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+derive\s+([A-Za-z_][A-Za-z0-9_.:/-]*)$/);
      if (keyDeriveMatch) {
        activeDerived = {
          targetField: keyDeriveMatch[1],
          kind: "derive",
          derive: keyDeriveMatch[2],
          args: {}
        };
        keys.push(activeDerived);
        continue;
      }
      const keyLiteralMatch = trimmed.match(/^key\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+literal\s+(.+)$/);
      if (keyLiteralMatch) {
        keys.push({
          targetField: keyLiteralMatch[1],
          kind: "literal",
          literal: parseScalarValue(keyLiteralMatch[2])
        });
        activeDerived = null;
        continue;
      }
    }

    if (allowFields) {
      const fieldFromMatch = trimmed.match(/^field\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+from\s+([A-Za-z_][A-Za-z0-9_.:/-]*)$/);
      if (fieldFromMatch) {
        fields.push({
          targetField: fieldFromMatch[1],
          kind: "from",
          sourceField: fieldFromMatch[2]
        });
        activeDerived = null;
        continue;
      }
      const fieldDeriveMatch = trimmed.match(/^field\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+derive\s+([A-Za-z_][A-Za-z0-9_.:/-]*)$/);
      if (fieldDeriveMatch) {
        activeDerived = {
          targetField: fieldDeriveMatch[1],
          kind: "derive",
          derive: fieldDeriveMatch[2],
          args: {}
        };
        fields.push(activeDerived);
        continue;
      }
      const fieldLiteralMatch = trimmed.match(/^field\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+literal\s+(.+)$/);
      if (fieldLiteralMatch) {
        fields.push({
          targetField: fieldLiteralMatch[1],
          kind: "literal",
          literal: parseScalarValue(fieldLiteralMatch[2])
        });
        activeDerived = null;
        continue;
      }
    }

    const argMatch = trimmed.match(/^arg\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+(.+)$/);
    if (argMatch) {
      if (!activeDerived) {
        throw new Error(`${ownerLabel} arg ${argMatch[1]} must follow a derive mapping`);
      }
      activeDerived.args[argMatch[1]] = parseScalarValue(argMatch[2]);
      continue;
    }

    throw new Error(`${ownerLabel} has unsupported clause: ${trimmed}`);
  }
  return { keys, fields };
}

function parseInputTransform(form) {
  const source = readSimpleValue(form.bodyLines, "source");
  const emitBlocks = extractRepeatedHeaderBlocks(form.bodyLines, "emit");
  return {
    source,
    emits: emitBlocks.map(block => ({
      shape: block.name,
      ...parseMappingClauses(block.lines, `input_transform ${form.name} emit ${block.name}`)
    }))
  };
}

function parseOutputTransform(form) {
  const mappingLines = form.bodyLines.filter(line => {
    const trimmed = line.trim();
    return !(
      /^source\s+/.test(trimmed)
      || /^target\s+/.test(trimmed)
      || /^write_mode\s+/.test(trimmed)
    );
  });
  return {
    source: readSimpleValue(form.bodyLines, "source"),
    target: readSimpleValue(form.bodyLines, "target"),
    writeMode: readSimpleValue(form.bodyLines, "write_mode"),
    ...parseMappingClauses(mappingLines, `output_transform ${form.name}`)
  };
}

function parseRowBlockLines(rowLines, ownerLabel) {
  const row = {};
  for (const line of rowLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)\s+(.+)$/);
    if (!match) throw new Error(`${ownerLabel} has malformed row field: ${trimmed}`);
    row[match[1]] = parseScalarValue(match[2]);
  }
  return row;
}

function parseRowSections(bodyLines, headerPrefix, ownerLabel) {
  return extractRepeatedHeaderBlocks(bodyLines, headerPrefix).map(block => ({
    name: block.name,
    rows: extractRepeatedAnonymousBlocks(block.lines, "row").map((rowBlock, index) =>
      parseRowBlockLines(rowBlock.lines, `${ownerLabel} ${block.name} row ${index + 1}`)
    )
  }));
}

function parseSummaryBlock(bodyLines) {
  const summaryLines = extractNamedBlock(bodyLines, "summary");
  if (!summaryLines.length) return null;
  return Object.fromEntries(
    summaryLines
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_.:-]*)\s+(.+)$/);
        if (!match) return null;
        return [match[1], parseScalarValue(match[2])];
      })
      .filter(Boolean)
  );
}

function parsePipelineTest(form) {
  const fixtureLines = extractNamedBlock(form.bodyLines, "fixture");
  const expectLines = extractNamedBlock(form.bodyLines, "expect");
  return {
    subject: readSimpleValue(form.bodyLines, "subject"),
    fixture: {
      sourceRows: parseRowSections(fixtureLines, "source_rows", `pipeline_test ${form.name} fixture source_rows`).map(section => ({
        table: section.name,
        rows: section.rows
      })),
      worldRows: parseRowSections(fixtureLines, "world_rows", `pipeline_test ${form.name} fixture world_rows`).map(section => ({
        shape: section.name,
        rows: section.rows
      }))
    },
    expect: {
      emits: parseRowSections(expectLines, "emit", `pipeline_test ${form.name} expect emit`).map(section => ({
        shape: section.name,
        rows: section.rows
      })),
      sqlRows: parseRowSections(expectLines, "sql_rows", `pipeline_test ${form.name} expect sql_rows`).map(section => ({
        table: section.name,
        rows: section.rows
      })),
      skips: readRepeatedSimpleValues(expectLines, "skip"),
      summary: parseSummaryBlock(expectLines)
    }
  };
}

function serializeScalar(value) {
  if (typeof value === "string") return /^[A-Za-z0-9_.:/-]+$/.test(value) ? value : JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(serializeScalar).join(", ")}]`;
  return JSON.stringify(value ?? null);
}

function block(kind, name, lines) {
  const body = lines.filter(Boolean).map(line => `  ${line}`).join("\n");
  return `${kind} ${name} {\n${body ? `${body}\n` : ""}}`;
}

function simpleLine(key, value) {
  if (value === null || value === undefined || value === "") return null;
  return `${key} ${serializeScalar(value)}`;
}

function syncProgressBlock(progress) {
  if (!progress?.kind && !progress?.field && progress?.replayWindowMs == null) return null;
  return [
    "progress {",
    progress.kind ? `  kind ${serializeScalar(progress.kind)}` : null,
    progress.field ? `  field ${serializeScalar(progress.field)}` : null,
    progress.replayWindowMs != null ? `  replay_window_ms ${serializeScalar(progress.replayWindowMs)}` : null,
    "}"
  ].filter(Boolean);
}

function mappingLines(keys, fields) {
  return [
    ...(keys ?? []).flatMap(mapping => serializeMapping("key", mapping)),
    ...(fields ?? []).flatMap(mapping => serializeMapping("field", mapping))
  ];
}

function serializeMapping(prefix, mapping) {
  if (mapping.kind === "from") {
    return [`${prefix} ${serializeScalar(mapping.targetField)} from ${serializeScalar(mapping.sourceField)}`];
  }
  if (mapping.kind === "literal") {
    return [`${prefix} ${serializeScalar(mapping.targetField)} literal ${serializeScalar(mapping.literal)}`];
  }
  if (mapping.kind === "derive") {
    return [
      `${prefix} ${serializeScalar(mapping.targetField)} derive ${serializeScalar(mapping.derive)}`,
      ...Object.entries(mapping.args ?? {}).map(([key, value]) => `arg ${serializeScalar(key)} ${serializeScalar(value)}`)
    ];
  }
  return [];
}

function serializeRow(row) {
  return [
    "row {",
    ...Object.entries(row ?? {}).map(([key, value]) => `  ${key} ${serializeScalar(value)}`),
    "}"
  ];
}

function serializeRowSections(kind, sections, keyName) {
  return (sections ?? []).flatMap(section => [
    `${kind} ${serializeScalar(section[keyName])} {`,
    ...(section.rows ?? []).flatMap(row => serializeRow(row).map(line => `  ${line}`)),
    "}"
  ]);
}

function serializeSummary(summary) {
  if (!summary || typeof summary !== "object") return null;
  const entries = Object.entries(summary);
  if (!entries.length) return null;
  return [
    "summary {",
    ...entries.map(([key, value]) => `  ${key} ${serializeScalar(value)}`),
    "}"
  ];
}

function validateSqlTableRef(forms, tableId, ownerLabel) {
  if (!tableId) {
    throw new Error(`${ownerLabel} must reference a sql_table`);
  }
  const table = forms.find(candidate => candidate.pluginFormKind === "sql_table" && candidate.name === tableId);
  if (!table) {
    throw new Error(`${ownerLabel} references unknown sql_table ${tableId}`);
  }
  return table;
}

function validateMappingTargetUniqueness(ownerLabel, rows) {
  const seen = new Set();
  for (const row of rows) {
    if (!row?.targetField || !row?.kind) {
      throw new Error(`${ownerLabel} contains an incomplete mapping`);
    }
    if (seen.has(row.targetField)) {
      throw new Error(`${ownerLabel} maps target field ${row.targetField} more than once`);
    }
    seen.add(row.targetField);
    if (row.kind === "from" && !row.sourceField) {
      throw new Error(`${ownerLabel} field ${row.targetField} must declare source field`);
    }
    if (row.kind === "derive" && !row.derive) {
      throw new Error(`${ownerLabel} field ${row.targetField} must declare derive operator`);
    }
    if (row.kind === "literal" && !Object.prototype.hasOwnProperty.call(row, "literal")) {
      throw new Error(`${ownerLabel} field ${row.targetField} must declare literal value`);
    }
  }
}

function validateInputTransform(form, forms) {
  const data = form.pluginData ?? {};
  validateSqlTableRef(forms, data.source, `input_transform ${form.name} source`);
  if (!Array.isArray(data.emits) || data.emits.length === 0) {
    throw new Error(`input_transform ${form.name} must declare at least one emit block`);
  }
  const seenShapes = new Set();
  for (const emit of data.emits) {
    if (!WORLD_SHAPES.has(emit.shape)) {
      throw new Error(`input_transform ${form.name} emits unsupported world shape ${emit.shape}`);
    }
    if (seenShapes.has(emit.shape)) {
      throw new Error(`input_transform ${form.name} emits ${emit.shape} more than once`);
    }
    seenShapes.add(emit.shape);
    validateMappingTargetUniqueness(`input_transform ${form.name} emit ${emit.shape}`, [
      ...(emit.keys ?? []),
      ...(emit.fields ?? [])
    ]);
  }
}

function validateOutputTransform(form, forms) {
  const data = form.pluginData ?? {};
  if (!WORLD_SHAPES.has(data.source)) {
    throw new Error(`output_transform ${form.name} source must reference one of: ${[...WORLD_SHAPES].join(", ")}`);
  }
  validateSqlTableRef(forms, data.target, `output_transform ${form.name} target`);
  if (!OUTPUT_WRITE_MODES.has(data.writeMode)) {
    throw new Error(`output_transform ${form.name} has unknown write_mode ${data.writeMode}`);
  }
  validateMappingTargetUniqueness(`output_transform ${form.name}`, data.fields ?? []);
}

function validateSync(form, forms) {
  const data = form.pluginData ?? {};
  if (!data.input) {
    throw new Error(`sync ${form.name} must declare input`);
  }
  const inputTransform = forms.find(candidate => candidate.pluginFormKind === "input_transform" && candidate.name === data.input);
  if (!inputTransform) {
    throw new Error(`sync ${form.name} references unknown input_transform ${data.input}`);
  }
  if (!Array.isArray(data.outputs) || data.outputs.length === 0) {
    throw new Error(`sync ${form.name} must declare at least one output`);
  }
  const outputNames = new Set(
    forms.filter(candidate => candidate.pluginFormKind === "output_transform").map(candidate => candidate.name)
  );
  for (const output of data.outputs) {
    if (!outputNames.has(output)) {
      throw new Error(`sync ${form.name} references unknown output_transform ${output}`);
    }
  }
  for (const trigger of data.triggers ?? []) {
    if (!SYNC_TRIGGERS.has(trigger)) {
      throw new Error(`sync ${form.name} has unknown trigger ${trigger}`);
    }
  }
  if (!data.progress?.kind || !data.progress?.field) {
    throw new Error(`sync ${form.name} must declare progress kind and field`);
  }
  if (!SYNC_PROGRESS_KINDS.has(data.progress.kind)) {
    throw new Error(`sync ${form.name} has unknown progress kind ${data.progress.kind}`);
  }
  if (!SYNC_CONSISTENCY_VALUES.has(data.consistency)) {
    throw new Error(`sync ${form.name} has unknown consistency ${data.consistency}`);
  }

  const sourceSqlTable = validateSqlTableRef(forms, inputTransform.pluginData?.source, `sync ${form.name} input ${data.input}`);
  const sourceColumns = new Set((sourceSqlTable.pluginData?.columns ?? []).map(column => column.name));
  if (!sourceColumns.has(data.progress.field)) {
    throw new Error(`sync ${form.name} progress field ${data.progress.field} is not a source column on ${sourceSqlTable.name}`);
  }
}

function findSubject(forms, subjectId) {
  return forms.find(form =>
    TEST_SUBJECT_KINDS.has(form.pluginFormKind) && form.name === subjectId
  ) ?? null;
}

function validateNoDuplicateSections(ownerLabel, sections, keyName) {
  const seen = new Set();
  for (const section of sections ?? []) {
    const key = String(section?.[keyName] || "");
    if (seen.has(key)) {
      throw new Error(`${ownerLabel} repeats ${keyName} ${key}`);
    }
    seen.add(key);
  }
}

function validateRowSections(ownerLabel, sections, keyName) {
  validateNoDuplicateSections(ownerLabel, sections, keyName);
  for (const section of sections ?? []) {
    if (!Array.isArray(section.rows) || section.rows.length === 0) {
      throw new Error(`${ownerLabel} ${section[keyName]} must declare at least one row`);
    }
    for (const row of section.rows) {
      if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length === 0) {
        throw new Error(`${ownerLabel} ${section[keyName]} contains a malformed row`);
      }
    }
  }
}

function deriveOperatorsForSubject(subjectForm, forms) {
  if (subjectForm.pluginFormKind === "input_transform") {
    return subjectForm.pluginData.emits.flatMap(emit => [...(emit.keys ?? []), ...(emit.fields ?? [])])
      .filter(mapping => mapping.kind === "derive")
      .map(mapping => mapping.derive);
  }
  if (subjectForm.pluginFormKind === "output_transform") {
    return [...(subjectForm.pluginData.keys ?? []), ...(subjectForm.pluginData.fields ?? [])]
      .filter(mapping => mapping.kind === "derive")
      .map(mapping => mapping.derive);
  }
  if (subjectForm.pluginFormKind === "sync") {
    const inputTransform = forms.find(form => form.pluginFormKind === "input_transform" && form.name === subjectForm.pluginData.input);
    const outputTransforms = subjectForm.pluginData.outputs
      .map(outputId => forms.find(form => form.pluginFormKind === "output_transform" && form.name === outputId))
      .filter(Boolean);
    return [
      ...deriveOperatorsForSubject(inputTransform, forms),
      ...outputTransforms.flatMap(form => deriveOperatorsForSubject(form, forms))
    ];
  }
  return [];
}

function validatePipelineTest(form, forms) {
  const data = form.pluginData ?? {};
  if (!data.subject) {
    throw new Error(`pipeline_test ${form.name} must declare subject`);
  }
  const subjectForm = findSubject(forms, data.subject);
  if (!subjectForm) {
    throw new Error(`pipeline_test ${form.name} references unknown subject ${data.subject}`);
  }

  validateRowSections(`pipeline_test ${form.name} fixture source_rows`, data.fixture?.sourceRows ?? [], "table");
  validateRowSections(`pipeline_test ${form.name} fixture world_rows`, data.fixture?.worldRows ?? [], "shape");
  validateRowSections(`pipeline_test ${form.name} expect emit`, data.expect?.emits ?? [], "shape");
  validateRowSections(`pipeline_test ${form.name} expect sql_rows`, data.expect?.sqlRows ?? [], "table");

  for (const section of data.fixture?.sourceRows ?? []) {
    validateSqlTableRef(forms, section.table, `pipeline_test ${form.name} fixture source_rows`);
  }
  for (const section of data.expect?.sqlRows ?? []) {
    validateSqlTableRef(forms, section.table, `pipeline_test ${form.name} expect sql_rows`);
  }
  for (const section of data.fixture?.worldRows ?? []) {
    if (!WORLD_SHAPES.has(section.shape)) {
      throw new Error(`pipeline_test ${form.name} fixture world_rows references unsupported shape ${section.shape}`);
    }
  }
  for (const section of data.expect?.emits ?? []) {
    if (!WORLD_SHAPES.has(section.shape)) {
      throw new Error(`pipeline_test ${form.name} expect emit references unsupported shape ${section.shape}`);
    }
  }

  if (subjectForm.pluginFormKind === "input_transform" || subjectForm.pluginFormKind === "sync") {
    const expectedTable = subjectForm.pluginFormKind === "input_transform"
      ? subjectForm.pluginData.source
      : forms.find(candidate => candidate.pluginFormKind === "input_transform" && candidate.name === subjectForm.pluginData.input)?.pluginData?.source;
    if (!(data.fixture?.sourceRows ?? []).some(section => section.table === expectedTable)) {
      throw new Error(`pipeline_test ${form.name} must declare source_rows ${expectedTable} for subject ${data.subject}`);
    }
    if ((data.fixture?.worldRows ?? []).length > 0) {
      throw new Error(`pipeline_test ${form.name} may not declare world_rows for subject ${data.subject}`);
    }
  }

  if (subjectForm.pluginFormKind === "output_transform") {
    if (!(data.fixture?.worldRows ?? []).some(section => section.shape === subjectForm.pluginData.source)) {
      throw new Error(`pipeline_test ${form.name} must declare world_rows ${subjectForm.pluginData.source} for subject ${data.subject}`);
    }
    if ((data.fixture?.sourceRows ?? []).length > 0) {
      throw new Error(`pipeline_test ${form.name} may not declare source_rows for output_transform subject ${data.subject}`);
    }
  }

  for (const deriveId of deriveOperatorsForSubject(subjectForm, forms)) {
    if (!hasPipelineDeriveOperator(deriveId)) {
      throw new Error(
        `pipeline_test ${form.name} subject ${data.subject} requires unknown derive operator ${deriveId}. Registered operators: ${listPipelineDeriveOperatorIds().join(", ")}`
      );
    }
  }
}

function createPipelineResidual(node, context) {
  return context.createRuntimeDeclarationResidual(node.payload.pluginFormKind, {
    name: node.name,
    ...(node.payload.pluginData ?? {})
  }, node.name, {
    pluginId: "plugin.pipeline-runtime",
    formKind: node.payload.pluginFormKind
  });
}

export const pipelineRvmForms = Object.freeze([
  {
    kind: "sync",
    parse(form) {
      return {
        input: readSimpleValue(form.bodyLines, "input"),
        outputs: readRepeatedSimpleValues(form.bodyLines, "output"),
        triggers: readRepeatedSimpleValues(form.bodyLines, "trigger"),
        progress: parseSyncProgressBlock(form.bodyLines),
        consistency: readSimpleValue(form.bodyLines, "consistency")
      };
    },
    serialize(payload) {
      const data = payload.pluginData ?? {};
      return block("sync", payload.name, [
        simpleLine("input", data.input),
        ...(data.outputs ?? []).map(value => `output ${serializeScalar(value)}`),
        ...(data.triggers ?? []).map(value => `trigger ${serializeScalar(value)}`),
        ...(syncProgressBlock(data.progress) ?? []),
        simpleLine("consistency", data.consistency)
      ]);
    },
    validate(form, context) {
      validateSync(form, context.forms ?? []);
    },
    normalize(node, context) {
      return { nodes: [], runtimeResiduals: [createPipelineResidual(node, context)] };
    }
  },
  {
    kind: "input_transform",
    parse(form) {
      return parseInputTransform(form);
    },
    serialize(payload) {
      const data = payload.pluginData ?? {};
      return block("input_transform", payload.name, [
        simpleLine("source", data.source),
        ...(data.emits ?? []).flatMap(emit => [
          `emit ${serializeScalar(emit.shape)} {`,
          ...mappingLines(emit.keys, emit.fields).map(line => `  ${line}`),
          "}"
        ])
      ]);
    },
    validate(form, context) {
      validateInputTransform(form, context.forms ?? []);
    },
    normalize(node, context) {
      return { nodes: [], runtimeResiduals: [createPipelineResidual(node, context)] };
    }
  },
  {
    kind: "output_transform",
    parse(form) {
      return parseOutputTransform(form);
    },
    serialize(payload) {
      const data = payload.pluginData ?? {};
      return block("output_transform", payload.name, [
        simpleLine("source", data.source),
        simpleLine("target", data.target),
        simpleLine("write_mode", data.writeMode),
        ...mappingLines(data.keys, data.fields)
      ]);
    },
    validate(form, context) {
      validateOutputTransform(form, context.forms ?? []);
    },
    normalize(node, context) {
      return { nodes: [], runtimeResiduals: [createPipelineResidual(node, context)] };
    }
  },
  {
    kind: "pipeline_test",
    parse(form) {
      return parsePipelineTest(form);
    },
    serialize(payload) {
      const data = payload.pluginData ?? {};
      return block("pipeline_test", payload.name, [
        simpleLine("subject", data.subject),
        "fixture {",
        ...serializeRowSections("source_rows", data.fixture?.sourceRows, "table").map(line => `  ${line}`),
        ...serializeRowSections("world_rows", data.fixture?.worldRows, "shape").map(line => `  ${line}`),
        "}",
        "expect {",
        ...serializeRowSections("emit", data.expect?.emits, "shape").map(line => `  ${line}`),
        ...serializeRowSections("sql_rows", data.expect?.sqlRows, "table").map(line => `  ${line}`),
        ...(data.expect?.skips ?? []).map(skip => `  skip ${serializeScalar(skip)}`),
        ...((serializeSummary(data.expect?.summary) ?? []).map(line => `  ${line}`)),
        "}"
      ]);
    },
    validate(form, context) {
      validatePipelineTest(form, context.forms ?? []);
    },
    normalize(node, context) {
      return { nodes: [], runtimeResiduals: [createPipelineResidual(node, context)] };
    }
  }
]);
