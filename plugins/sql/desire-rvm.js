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

function cleanValue(value) {
  return String(value || "").trim().replace(/^"|"$/g, "");
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseScalarValue(value) {
  const cleaned = cleanValue(value);
  if (cleaned === "true") return true;
  if (cleaned === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  return cleaned;
}

function parseColumns(bodyLines) {
  return bodyLines
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^column\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s+([A-Za-z_][A-Za-z0-9_.:/\-[\]]*)$/);
      if (!match) return null;
      return { name: match[1], type: match[2] };
    })
    .filter(Boolean);
}

function serializeScalar(value) {
  if (typeof value === "string") return /^[A-Za-z0-9_.:/-]+$/.test(value) ? value : JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
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

function createSqlTableResidual(node, values, { createRuntimeDeclarationResidual }) {
  return createRuntimeDeclarationResidual("sql_table", {
    name: node.name,
    ...values
  }, node.name, {
    pluginId: "plugin.sql",
    formKind: "sql_table"
  });
}

export const sqlRvmForms = Object.freeze([
  {
    kind: "sql_table",
    parse(form) {
      return {
        name: form.name,
        binding: readSimpleValue(form.bodyLines, "binding"),
        provider: readSimpleValue(form.bodyLines, "provider"),
        schema: readSimpleValue(form.bodyLines, "schema"),
        table: readSimpleValue(form.bodyLines, "table"),
        columns: parseColumns(form.bodyLines),
        keys: readRepeatedSimpleValues(form.bodyLines, "key")
      };
    },
    serialize(payload) {
      const data = payload.pluginData ?? {};
      return block("sql_table", payload.name, [
        simpleLine("binding", data.binding),
        simpleLine("provider", data.provider),
        simpleLine("schema", data.schema),
        simpleLine("table", data.table),
        ...(data.columns ?? []).map(column => `column ${serializeScalar(column.name)} ${serializeScalar(column.type)}`),
        ...(data.keys ?? []).map(key => `key ${serializeScalar(key)}`)
      ]);
    },
    validate(form) {
      const data = form.pluginData ?? {};
      if (!data.binding) throw new Error(`sql_table ${form.name} must declare binding`);
      if (!data.provider) throw new Error(`sql_table ${form.name} must declare provider`);
      if (!["postgres", "mysql", "sqlite"].includes(data.provider)) {
        throw new Error(`sql_table ${form.name} has unknown provider ${data.provider}`);
      }
      if (!data.table) throw new Error(`sql_table ${form.name} must declare table`);
      if (!Array.isArray(data.columns) || data.columns.length === 0) {
        throw new Error(`sql_table ${form.name} must declare at least one column`);
      }
    },
    normalize(node, context) {
      return {
        nodes: [],
        runtimeResiduals: [createSqlTableResidual(node, node.payload.pluginData ?? {}, context)]
      };
    }
  }
]);
