const SYNC_CAPABILITIES = new Set(["db.sql"]);
const SYNC_TRIGGERS = new Set(["manual", "scheduled", "source_triggered"]);
const SYNC_WRITE_MODES = new Set(["append", "upsert", "insert_ignore"]);
const SYNC_PROGRESS_KINDS = new Set(["monotonic"]);
const SYNC_CONSISTENCY_VALUES = new Set(["eventual"]);

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

function parseSyncEndpointBlock(bodyLines, blockName) {
  const lines = extractNamedBlock(bodyLines, blockName);
  return {
    capability: readSimpleValue(lines, "capability"),
    binding: readSimpleValue(lines, "binding"),
    dataset: readSimpleValue(lines, "dataset")
  };
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

function parseSyncOutputFields(bodyLines) {
  const fields = [];
  let activeDerivedField = null;
  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const fromMatch = trimmed.match(/^field\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+from\s+([A-Za-z_][A-Za-z0-9_.:/-]*)$/);
    if (fromMatch) {
      fields.push({
        targetField: fromMatch[1],
        kind: "from",
        sourceField: fromMatch[2]
      });
      activeDerivedField = null;
      continue;
    }
    const deriveMatch = trimmed.match(/^field\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+derive\s+([A-Za-z_][A-Za-z0-9_.:/-]*)$/);
    if (deriveMatch) {
      activeDerivedField = {
        targetField: deriveMatch[1],
        kind: "derive",
        derive: deriveMatch[2],
        args: {}
      };
      fields.push(activeDerivedField);
      continue;
    }
    const literalMatch = trimmed.match(/^field\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+literal\s+(.+)$/);
    if (literalMatch) {
      fields.push({
        targetField: literalMatch[1],
        kind: "literal",
        literal: parseScalarValue(literalMatch[2])
      });
      activeDerivedField = null;
      continue;
    }
    const argMatch = trimmed.match(/^arg\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+(.+)$/);
    if (argMatch) {
      if (!activeDerivedField) {
        throw new Error(`sync_output arg ${argMatch[1]} must follow a derive field`);
      }
      activeDerivedField.args[argMatch[1]] = parseScalarValue(argMatch[2]);
      continue;
    }
  }
  return fields;
}

function parseGenericClauses(bodyLines) {
  const clauses = [];
  for (let index = 0; index < bodyLines.length; index += 1) {
    const line = bodyLines[index];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.endsWith("{")) {
      const header = trimmed.slice(0, -1).trim();
      const blockLines = [];
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
        if (depth > 0) blockLines.push(candidate);
        index += 1;
      }
      clauses.push({ kind: "block", header, lines: blockLines.map(row => row.trim()).filter(Boolean) });
      continue;
    }
    clauses.push({ kind: "line", text: trimmed });
  }
  return clauses;
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

function syncEndpointBlock(name, endpoint) {
  if (!endpoint?.capability && !endpoint?.binding && !endpoint?.dataset) return null;
  return [
    `${name} {`,
    endpoint.capability ? `  capability ${serializeScalar(endpoint.capability)}` : null,
    endpoint.binding ? `  binding ${serializeScalar(endpoint.binding)}` : null,
    endpoint.dataset ? `  dataset ${serializeScalar(endpoint.dataset)}` : null,
    "}"
  ].filter(Boolean);
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

function syncFieldLines(fields) {
  return (fields ?? []).flatMap(field => {
    if (field.kind === "from") return [`field ${serializeScalar(field.targetField)} from ${serializeScalar(field.sourceField)}`];
    if (field.kind === "literal") return [`field ${serializeScalar(field.targetField)} literal ${serializeScalar(field.literal)}`];
    if (field.kind === "derive") {
      return [
        `field ${serializeScalar(field.targetField)} derive ${serializeScalar(field.derive)}`,
        ...Object.entries(field.args ?? {}).map(([key, value]) => `arg ${serializeScalar(key)} ${serializeScalar(value)}`)
      ];
    }
    return [];
  });
}

function serializeClauses(clauses) {
  return (clauses ?? []).flatMap(clause => {
    if (clause.kind === "line") return [clause.text];
    if (clause.kind === "block") {
      return [
        `${clause.header} {`,
        ...(clause.lines ?? []).map(line => `  ${line}`),
        "}"
      ];
    }
    return [];
  });
}

function validateSync(form, forms) {
  const data = form.pluginData ?? {};
  if (!data.source?.capability || !data.source?.binding || !data.source?.dataset) {
    throw new Error(`sync ${form.name} must declare source capability, binding, and dataset`);
  }
  if (!SYNC_CAPABILITIES.has(data.source.capability)) {
    throw new Error(`sync ${form.name} source capability must be db.sql`);
  }
  if (!Array.isArray(data.outputs) || data.outputs.length === 0) {
    throw new Error(`sync ${form.name} must declare at least one output`);
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
  const outputNames = new Set(
    forms.filter(candidate => candidate.pluginFormKind === "sync_output").map(candidate => candidate.name)
  );
  for (const output of data.outputs ?? []) {
    if (output && !outputNames.has(output)) {
      throw new Error(`sync ${form.name} references unknown sync_output ${output}`);
    }
  }
}

function validateSyncOutput(form, forms) {
  const data = form.pluginData ?? {};
  if (!data.sync) throw new Error(`sync_output ${form.name} must declare sync`);
  const syncNames = new Set(
    forms.filter(candidate => candidate.pluginFormKind === "sync").map(candidate => candidate.name)
  );
  if (!syncNames.has(data.sync)) {
    throw new Error(`sync_output ${form.name} references unknown sync ${data.sync}`);
  }
  if (!data.target?.capability || !data.target?.binding || !data.target?.dataset) {
    throw new Error(`sync_output ${form.name} must declare target capability, binding, and dataset`);
  }
  if (!SYNC_CAPABILITIES.has(data.target.capability)) {
    throw new Error(`sync_output ${form.name} target capability must be db.sql`);
  }
  if (!SYNC_WRITE_MODES.has(data.writeMode)) {
    throw new Error(`sync_output ${form.name} has unknown write_mode ${data.writeMode}`);
  }
  const seenTargetFields = new Set();
  for (const field of data.fields ?? []) {
    if (!field?.targetField || !field?.kind) {
      throw new Error(`sync_output ${form.name} contains an incomplete field mapping`);
    }
    if (seenTargetFields.has(field.targetField)) {
      throw new Error(`sync_output ${form.name} maps target field ${field.targetField} more than once`);
    }
    seenTargetFields.add(field.targetField);
    if (field.kind === "from" && !field.sourceField) {
      throw new Error(`sync_output ${form.name} field ${field.targetField} must declare source field`);
    }
    if (field.kind === "derive" && !field.derive) {
      throw new Error(`sync_output ${form.name} field ${field.targetField} must declare derive operator`);
    }
    if (field.kind === "literal" && !Object.prototype.hasOwnProperty.call(field, "literal")) {
      throw new Error(`sync_output ${form.name} field ${field.targetField} must declare literal value`);
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
        source: parseSyncEndpointBlock(form.bodyLines, "source"),
        outputs: readRepeatedSimpleValues(form.bodyLines, "output"),
        triggers: readRepeatedSimpleValues(form.bodyLines, "trigger"),
        progress: parseSyncProgressBlock(form.bodyLines),
        consistency: readSimpleValue(form.bodyLines, "consistency")
      };
    },
    serialize(payload) {
      const data = payload.pluginData ?? {};
      return block("sync", payload.name, [
        ...syncEndpointBlock("source", data.source),
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
    kind: "sync_output",
    parse(form) {
      return {
        sync: readSimpleValue(form.bodyLines, "sync"),
        target: parseSyncEndpointBlock(form.bodyLines, "target"),
        writeMode: readSimpleValue(form.bodyLines, "write_mode"),
        keys: readRepeatedSimpleValues(form.bodyLines, "key"),
        fields: parseSyncOutputFields(form.bodyLines)
      };
    },
    serialize(payload) {
      const data = payload.pluginData ?? {};
      return block("sync_output", payload.name, [
        simpleLine("sync", data.sync),
        ...syncEndpointBlock("target", data.target),
        simpleLine("write_mode", data.writeMode),
        ...(data.keys ?? []).map(value => `key ${serializeScalar(value)}`),
        ...syncFieldLines(data.fields)
      ]);
    },
    validate(form, context) {
      validateSyncOutput(form, context.forms ?? []);
    },
    normalize(node, context) {
      return { nodes: [], runtimeResiduals: [createPipelineResidual(node, context)] };
    }
  },
  ...["input_transform", "output_transform", "input_mapping", "output_mapping", "pipeline_test"].map(kind => ({
    kind,
    parse(form) {
      return {
        clauses: parseGenericClauses(form.bodyLines)
      };
    },
    serialize(payload) {
      const data = payload.pluginData ?? {};
      return block(kind, payload.name, serializeClauses(data.clauses));
    },
    validate() {},
    normalize(node, context) {
      return { nodes: [], runtimeResiduals: [createPipelineResidual(node, context)] };
    }
  }))
]);
