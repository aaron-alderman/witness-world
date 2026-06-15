import fs from "node:fs/promises";
import path from "node:path";
import { createDesirePlusDocument, createDesirePlusNode, createTrace, validateDesirePlusDocument } from "./ir.js";

export const RVM_LOWERED_RUNTIME_KINDS = new Set([
  "atom",
  "map",
  "witness",
  "machine"
]);

export const RVM_GRAPH_DATA_KINDS = new Set([
  "graph_node",
  "graph_edge",
  "entity_type",
  "edge_type"
]);

const RVM_SOURCE_ONLY_SEMANTIC_KINDS = new Set([
  "import",
  "module",
  "stdlib"
]);

export async function compileRvmFileToDesirePlus(file) {
  const resolved = path.resolve(file);
  const source = await fs.readFile(resolved, "utf8");
  return compileRvmToDesirePlus(source, { file: resolved });
}

export function compileRvmToDesirePlus(source, { file = null } = {}) {
  const forms = parseRvmForms(source);
  const effectiveForms = forms.length === 0
    ? [{
        kind: "source",
        name: path.basename(file || "inline.rvm"),
        header: "",
        body: source,
        raw: source,
        fields: [],
        startLine: 1,
        endLine: source.split(/\r?\n/).length,
        semantic: null
      }]
    : forms;
  const nodes = effectiveForms.map((form, index) => {
    const classification = classifyRvmForm(form);
    return createDesirePlusNode({
      kind: "rvm.form",
      name: form.name ?? null,
      order: index,
      trace: createTrace({
        sourceLanguage: "rvm",
        file,
        startLine: form.startLine,
        endLine: form.endLine,
        sourceKind: form.kind
      }),
      payload: {
        raw: form.raw,
        header: form.header,
        body: form.body,
        fields: form.fields,
        file
      },
      semantic: form.semantic,
      meta: classification
    });
  });
  return createDesirePlusDocument(nodes, { file });
}

export function auditRvmDesirePlus(desirePlus) {
  const doc = validateDesirePlusDocument(desirePlus);
  const audit = {
    total: 0,
    semantic: 0,
    sourceOnly: 0,
    loweredRuntime: 0,
    graphData: 0,
    fixtureCorruption: 0,
    authoredRuntime: 0,
    unknown: 0,
    bySourceKind: {}
  };
  for (const node of doc.nodes.filter(node => node.kind === "rvm.form")) {
    audit.total += 1;
    const kind = node.trace?.sourceKind ?? "unknown";
    audit.bySourceKind[kind] = (audit.bySourceKind[kind] ?? 0) + 1;
    switch (node.meta?.sourceCategory) {
      case "semantic":
        audit.semantic += 1;
        break;
      case "source":
        audit.sourceOnly += 1;
        break;
      case "runtime":
        if (node.meta?.residualCategory === "lowered-runtime") audit.loweredRuntime += 1;
        else audit.authoredRuntime += 1;
        break;
      case "graph-data":
        audit.graphData += 1;
        break;
      case "fixture-corruption":
        audit.fixtureCorruption += 1;
        break;
      default:
        audit.unknown += 1;
        break;
    }
  }
  return audit;
}

function classifyRvmForm(form) {
  if (form.semantic) {
    if (RVM_SOURCE_ONLY_SEMANTIC_KINDS.has(form.semantic.kind)) {
      return {
        sourceCategory: "source",
        desireBoundary: "desire-plus-only",
        boundaryReason: "source organization is preserved for trace/debug but not normalized into DESIRE"
      };
    }
    return {
      sourceCategory: "semantic",
      desireBoundary: "desire-kernel",
      boundaryReason: "stable semantic form normalizes into DESIRE"
    };
  }
  if (RVM_LOWERED_RUNTIME_KINDS.has(form.kind)) {
    return {
      sourceCategory: "runtime",
      residualCategory: "lowered-runtime",
      desireBoundary: "desire-plus-only",
      boundaryReason: "lowered Tiny/RVM implementation detail, not kernel semantics"
    };
  }
  if (form.kind === "source") {
    return {
      sourceCategory: "source",
      desireBoundary: "desire-plus-only",
      boundaryReason: "raw source fallback for trace/debug"
    };
  }
  if (form.kind === "conflict_marker") {
    return {
      sourceCategory: "fixture-corruption",
      residualCategory: "conflict-marker",
      desireBoundary: "desire-plus-only",
      boundaryReason: "git conflict marker preserved for fixture hygiene and parser resilience"
    };
  }
  if (form.kind === "unknown") {
    return {
      sourceCategory: "unknown",
      residualCategory: "unknown",
      desireBoundary: "needs-classification",
      boundaryReason: "unrecognized RVM form"
    };
  }
  return {
    sourceCategory: "runtime",
    residualCategory: "authored-runtime",
    desireBoundary: "desire-plus-only",
    boundaryReason: "authored runtime/support form preserved above the DESIRE boundary"
  };
}

function isGitConflictMarker(line) {
  return /^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/.test(line);
}

function parseRvmForms(source) {
  const lines = source.split(/\r?\n/);
  const forms = [];
  let index = 0;
  while (index < lines.length) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      index += 1;
      continue;
    }
    if (isGitConflictMarker(trimmed)) {
      forms.push(makeConflictMarkerForm(trimmed, index));
      index += 1;
      continue;
    }
    if (trimmed.startsWith("import ")) {
      forms.push(makeImportForm(trimmed, index));
      index += 1;
      continue;
    }
    if (trimmed.startsWith("stdlib ")) {
      forms.push(makeStdlibForm(trimmed, index));
      index += 1;
      continue;
    }
    const moduleBlockHeader = trimmed.match(/^module\s+([A-Za-z_][A-Za-z0-9_.:/-]*)\s*\{$/);
    if (moduleBlockHeader) {
      const { rawText, endLine, bodyLines } = readBraceBlock(lines, index);
      forms.push(makeModuleBlockForm({
        name: moduleBlockHeader[1],
        header: trimmed,
        raw: rawText,
        startLine: index + 1,
        endLine,
        bodyLines
      }));
      index = endLine;
      continue;
    }
    if (/^module\s+/.test(trimmed)) {
      forms.push(makeModuleForm(trimmed, index));
      index += 1;
      continue;
    }
    const actorBlockHeader = trimmed.match(/^actor\s+([A-Za-z_][A-Za-z0-9_.:/-]*)(?:\s+owns\s+([A-Za-z_][A-Za-z0-9_.:/-]*))?\s*\{$/);
    if (actorBlockHeader) {
      const { rawText, endLine, bodyLines } = readBraceBlock(lines, index);
      forms.push(makeBlockForm({
        kind: "actor",
        name: actorBlockHeader[1],
        owns: actorBlockHeader[2] ?? null,
        header: trimmed,
        raw: rawText,
        startLine: index + 1,
        endLine,
        bodyLines
      }));
      index = endLine;
      continue;
    }
    const blockHeader = trimmed.match(/^([A-Za-z_][A-Za-z0-9_./-]*)\s+([A-Za-z_][A-Za-z0-9_.:/-]*)(?:\s+(?:using|of)\s+([A-Za-z_][A-Za-z0-9_.:/-]*))?(?:\s*:\s*([A-Za-z_][A-Za-z0-9_.:/-]*))?\s*\{$/);
    if (blockHeader) {
      const { rawText, endLine, bodyLines } = readBraceBlock(lines, index);
      forms.push(makeBlockForm({
        kind: blockHeader[1],
        name: blockHeader[2],
        using: blockHeader[3] ?? null,
        type: blockHeader[4] ?? null,
        header: trimmed,
        raw: rawText,
        startLine: index + 1,
        endLine,
        bodyLines
      }));
      index = endLine;
      continue;
    }
    const inlineForm = makeInlineSemanticForm(trimmed, index);
    if (inlineForm) {
      forms.push(inlineForm);
      index += 1;
      continue;
    }
    forms.push(makeUnknownForm(trimmed, index));
    index += 1;
  }
  return forms;
}

function readBraceBlock(lines, startIndex) {
  let depth = 0;
  const captured = [];
  const bodyLines = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    captured.push(line);
    for (const ch of line) {
      if (ch === "{") depth += 1;
      if (ch === "}") depth -= 1;
    }
    if (index > startIndex) bodyLines.push(line);
    if (depth === 0) {
      return {
        rawText: captured.join("\n"),
        endLine: index + 1,
        bodyLines: bodyLines.slice(0, -1)
      };
    }
  }
  return {
    rawText: captured.join("\n"),
    endLine: lines.length,
    bodyLines
  };
}

function makeImportForm(line, index) {
  return {
    kind: "import",
    name: line.slice("import ".length).trim(),
    header: line,
    body: "",
    raw: line,
    fields: [],
    startLine: index + 1,
    endLine: index + 1,
    semantic: { kind: "import", target: line.slice("import ".length).trim() }
  };
}

function makeModuleForm(line, index) {
  const name = line.slice("module ".length).trim();
  return {
    kind: "module",
    name,
    header: line,
    body: "",
    raw: line,
    fields: [],
    startLine: index + 1,
    endLine: index + 1,
    semantic: { kind: "module", name }
  };
}

function makeModuleBlockForm({ name, header, raw, startLine, endLine, bodyLines }) {
  return {
    kind: "module",
    name,
    header,
    body: bodyLines.join("\n"),
    raw,
    fields: parseRvmFieldMap(bodyLines),
    startLine,
    endLine,
    semantic: {
      kind: "module",
      name,
      context: readSimpleValue(bodyLines, "in")
    }
  };
}

function makeStdlibForm(line, index) {
  const name = line.slice("stdlib ".length).trim();
  return {
    kind: "stdlib",
    name,
    header: line,
    body: "",
    raw: line,
    fields: [],
    startLine: index + 1,
    endLine: index + 1,
    semantic: { kind: "stdlib", name }
  };
}

function makeUnknownForm(line, index) {
  return {
    kind: "unknown",
    name: null,
    header: line,
    body: "",
    raw: line,
    fields: [],
    startLine: index + 1,
    endLine: index + 1,
    semantic: null
  };
}

function makeConflictMarkerForm(line, index) {
  return {
    kind: "conflict_marker",
    name: null,
    header: line,
    body: "",
    raw: line,
    fields: [],
    startLine: index + 1,
    endLine: index + 1,
    semantic: null
  };
}

function makeBlockForm({ kind, name, owns, using, type, header, raw, startLine, endLine, bodyLines }) {
  const body = bodyLines.join("\n");
  const fields = parseRvmFieldMap(bodyLines);
  return {
    kind,
    name,
    header,
    body,
    raw,
    fields,
    startLine,
    endLine,
    semantic: semanticRvmShape(kind, name, type, bodyLines, { owns, using })
  };
}

function makeInlineSemanticForm(line, index) {
  const actor = makeInlineActorForm(line, index);
  if (actor) return actor;
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_./-]*)\s+([A-Za-z_][A-Za-z0-9_./-]*)(?:\s+using\s+([A-Za-z_][A-Za-z0-9_.:/-]*))?(?:\s*:\s*([A-Za-z_][A-Za-z0-9_.:/-]*))?(?:\s+(.*))?$/);
  if (!match) return null;
  const [, kind, name, using = null, type = null, rest = ""] = match;
  if (!INLINE_SEMANTIC_KINDS.has(kind)) return null;
  const { attrs, target } = parseInlineTail(rest);
  return {
    kind,
    name,
    header: line,
    body: "",
    raw: line,
    fields: Object.entries(attrs).map(([key, value]) => ({ key, value })),
    startLine: index + 1,
    endLine: index + 1,
    semantic: semanticInlineRvmShape(kind, name, type, { using, attrs, target })
  };
}

function makeInlineActorForm(line, index) {
  const match = line.match(/^actor\s+([A-Za-z_][A-Za-z0-9_.:/-]*)(?:\s+owns\s+([A-Za-z_][A-Za-z0-9_.:/-]*))?(?:\s+(.*))?$/);
  if (!match) return null;
  const [, name, owns = null, rest = ""] = match;
  const { attrs, target } = parseInlineTail(rest);
  return {
    kind: "actor",
    name,
    header: line,
    body: "",
    raw: line,
    fields: Object.entries(attrs).map(([key, value]) => ({ key, value })),
    startLine: index + 1,
    endLine: index + 1,
    semantic: semanticActorShape(name, { owns, attrs, target })
  };
}

const INLINE_SEMANTIC_KINDS = new Set([
  "context",
  "graph_context",
  "capability",
  "entity",
  "boundary",
  "policy",
  "state",
  "value",
  "event",
  "command",
  "query",
  "adapter",
  "derive",
  "view",
  "process"
]);

function semanticRvmShape(kind, name, type, bodyLines, header = {}) {
  switch (kind) {
    case "actor":
      return semanticActorShape(name, {
        owns: header.owns ?? null,
        attrs: Object.fromEntries(parseRvmFieldMap(bodyLines).map(({ key, value }) => [key, parseScalarValue(value)])),
        target: null
      });
    case "context":
    case "graph_context":
      return { kind: "context", name, parent: readSimpleValue(bodyLines, "parent") };
    case "capability":
      return {
        kind: "capability",
        name,
        verbs: [],
        scope: readSimpleValue(bodyLines, "in") ? [readSimpleValue(bodyLines, "in")] : [],
        provides: readRepeatedSimpleValues(bodyLines, "provide"),
        source: readSimpleValue(bodyLines, "source"),
        state: readSimpleValue(bodyLines, "state"),
        driver: readSimpleValue(bodyLines, "driver")
      };
    case "enum":
      return {
        kind: "type",
        name,
        role: "enum",
        cases: parseSimpleEntries(bodyLines, "cases")
      };
    case "message":
      return { kind: "message", name, fields: parseTypedFieldBlock(bodyLines, "fields") };
    case "event":
      return {
        kind: "message",
        name,
        role: "event",
        schema: readSimpleValue(bodyLines, "payload_schema"),
        fields: parseNamedValueBlock(bodyLines, "payload").map(({ name, value }) => ({ name, type: value })),
        writes: Object.fromEntries(parseNamedValueBlock(bodyLines, "writes").map(({ name, value }) => [name, value]))
      };
    case "entity":
      return {
        kind: "entity",
        name,
        context: readSimpleValue(bodyLines, "context"),
        store: readSimpleValue(bodyLines, "durable_state"),
        identity: readSimpleValue(bodyLines, "id_prop"),
        versionRef: readSimpleValue(bodyLines, "version_prop"),
        fields: inferEntityFields(bodyLines)
      };
    case "graph_node":
      return {
        kind: "graph",
        name,
        graphKind: "node",
        nodeType: readSimpleValue(bodyLines, "kind") ?? readSimpleValue(bodyLines, "type"),
        schemaType: readSimpleValue(bodyLines, "entity_type") ?? readSimpleValue(bodyLines, "schema"),
        fields: parseTypedFieldBlock(bodyLines, "fields"),
        props: parseGraphProps(bodyLines, new Set(["kind", "type", "entity_type", "schema"]))
      };
    case "graph_edge":
      return {
        kind: "graph",
        name,
        graphKind: "edge",
        from: readSimpleValue(bodyLines, "from"),
        to: readSimpleValue(bodyLines, "to"),
        edgeType: readSimpleValue(bodyLines, "kind") ?? readSimpleValue(bodyLines, "type"),
        schemaType: readSimpleValue(bodyLines, "edge_type") ?? readSimpleValue(bodyLines, "schema"),
        fields: parseTypedFieldBlock(bodyLines, "fields"),
        props: parseGraphProps(bodyLines, new Set(["from", "to", "kind", "type", "edge_type", "schema"]))
      };
    case "entity_type":
      return {
        kind: "graph",
        name,
        graphKind: "entityType",
        fields: parseTypedFieldBlock(bodyLines, "fields"),
        props: parseGraphProps(bodyLines, new Set(["fields"]))
      };
    case "edge_type":
      return {
        kind: "graph",
        name,
        graphKind: "edgeType",
        from: readSimpleValue(bodyLines, "from"),
        to: readSimpleValue(bodyLines, "to"),
        fields: parseTypedFieldBlock(bodyLines, "fields"),
        props: parseGraphProps(bodyLines, new Set(["from", "to", "fields"]))
      };
    case "version":
      return {
        kind: "type",
        name,
        role: "version",
        field: readSimpleValue(bodyLines, "field"),
        versionKind: readSimpleValue(bodyLines, "kind")
      };
    case "process":
      return {
        kind: "process",
        name,
        state: parseSimpleEntries(bodyLines, "values").concat(parseSimpleEntries(bodyLines, "states")),
        handles: parseSimpleEntries(bodyLines, "handles"),
        emits: parseSimpleEntries(bodyLines, "emits")
      };
    case "value":
    case "state":
      return {
        kind: "state",
        name,
        valueType: type,
        initial: readSimpleValue(bodyLines, "initial")
      };
    case "boundary":
      return {
        kind: "boundary",
        name,
        capabilities: readRepeatedSimpleValues(bodyLines, "capability")
      };
    case "read":
    case "write":
      return {
        kind: "boundary",
        name,
        capabilities: readRepeatedSimpleValues(bodyLines, "capability"),
        operations: [{
          kind,
          capability: readSimpleValue(bodyLines, "capability")
        }]
      };
    case "command":
    case "query":
      return {
        kind: "message",
        name,
        role: kind,
        fields: parseNamedValueBlock(bodyLines, "fields").map(({ name, value }) => ({ name, type: value })),
        messageKind: readSimpleValue(bodyLines, "kind"),
        route: readSimpleValue(bodyLines, "route"),
        requestSchema: readSimpleValue(bodyLines, "request_schema"),
        responseSchema: readSimpleValue(bodyLines, "response_schema"),
        requestState: readSimpleValue(bodyLines, "request_state"),
        loadingState: readSimpleValue(bodyLines, "loading_state"),
        successEvent: readSimpleValue(bodyLines, "success_event"),
        failureEvent: readSimpleValue(bodyLines, "failure_event"),
        refreshRuntime: readSimpleValue(bodyLines, "refresh_runtime"),
        sequence: readSimpleValue(bodyLines, "sequence"),
        boundary: readSimpleValue(bodyLines, "external_boundary"),
        steps: parseCommandStepsBlock(bodyLines, "steps")
      };
    case "policy":
      return {
        kind: "policy",
        name,
        subject: readSimpleValue(bodyLines, "subject"),
        initialState: readSimpleValue(bodyLines, "initial_state"),
        stateField: readSimpleValue(bodyLines, "state_field"),
        readyState: readSimpleValue(bodyLines, "ready_state"),
        disagreementState: readSimpleValue(bodyLines, "disagreement_state"),
        disagreementOutcomes: Object.fromEntries(parseNamedValueBlock(bodyLines, "disagreement_outcomes").map(({ name, value }) => [name, value])),
        policyOutcomes: Object.fromEntries(parseNamedValueBlock(bodyLines, "policy_outcomes").map(({ name, value }) => [name, value]))
      };
    case "adapter":
      return {
        kind: "boundary",
        name,
        capabilities: [],
        operations: [{
          kind: "adapter",
          transport: header.using ?? null,
          command: readSimpleValue(bodyLines, "command"),
          operationKind: readSimpleValue(bodyLines, "kind"),
          route: readSimpleValue(bodyLines, "route"),
          hostOperation: readSimpleValue(bodyLines, "host_operation"),
          requestSchema: readSimpleValue(bodyLines, "request_schema"),
          responseSchema: readSimpleValue(bodyLines, "response_schema"),
          requestState: readSimpleValue(bodyLines, "request_state"),
          loadingState: readSimpleValue(bodyLines, "loading_state"),
          successEvent: readSimpleValue(bodyLines, "success_event") ?? readSimpleValue(bodyLines, "success"),
          failureEvent: readSimpleValue(bodyLines, "failure_event") ?? readSimpleValue(bodyLines, "failure"),
          refreshRuntime: readSimpleValue(bodyLines, "refresh_runtime")
        }]
      };
    case "derive":
      return {
        kind: "projection",
        name,
        projectionKind: readSimpleValue(bodyLines, "kind"),
        source: readSimpleValue(bodyLines, "source"),
        props: parsePropAssignments(bodyLines)
      };
    case "view":
      return {
        kind: "surface",
        name,
        surfaceKind: readSimpleValue(bodyLines, "kind"),
        className: readSimpleValue(bodyLines, "class"),
        children: parseSimpleEntries(bodyLines, "children"),
        props: parsePropAssignments(bodyLines)
      };
    case "model":
      return {
        kind: "dataflow",
        name,
        axes: readRepeatedSimpleValues(bodyLines, "axis").map(parseAxisLine).filter(Boolean),
        params: readRepeatedSimpleValues(bodyLines, "param").map(parseParamLine).filter(Boolean),
        derives: readRepeatedSimpleValues(bodyLines, "derive").map(parseFlowLine).filter(Boolean),
        reduces: readRepeatedSimpleValues(bodyLines, "reduce").map(parseFlowLine).filter(Boolean)
      };
    case "chart":
      return {
        kind: "surface",
        name,
        surfaceKind: "chart",
        modelRef: header.using ?? null,
        frame: readSimpleValue(bodyLines, "frame"),
        encoding: parseChartEncoding(bodyLines),
        editable: splitCommaList(readSimpleValue(bodyLines, "editable")),
        layers: readRepeatedSimpleValues(bodyLines, "layer").map(parseLayerLine).filter(Boolean),
        className: null,
        children: [],
        props: parsePropAssignments(bodyLines)
      };
    default:
      return null;
  }
}

// ── model (dataflow) line parsing ──────────────────────────────────────────────

function parseAxisLine(tail) {
  const { name, rhs } = splitAssignment(tail);
  if (!name) return null;
  const rhsMatch = String(rhs).match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/);
  if (!rhsMatch) return { name, kind: cleanRvmValue(rhs) };
  const kind = rhsMatch[1];
  const args = splitCommaList(rhsMatch[2]).map(parseScalarValue);
  if (kind === "category") {
    // literal value list — string or numeric (e.g. category(faithful, grounded))
    return { name, kind: "category", values: args };
  }
  if (kind === "from" || kind === "external") {
    // axis values come from an external source (e.g. from(boltSets))
    return { name, kind: "from", from: args[0] ?? null };
  }
  return { name, kind, args };
}

function parseParamLine(tail) {
  const { name, rhs } = splitAssignment(tail);
  if (!name) return null;
  return { name, default: parseScalarValue(rhs) };
}

function parseFlowLine(tail) {
  const { name, rhs } = splitAssignment(tail);
  if (!name) return null;
  const overAt = String(rhs).lastIndexOf(" over ");
  if (overAt < 0) return { name, expr: String(rhs).trim(), over: [] };
  return {
    name,
    expr: String(rhs).slice(0, overAt).trim(),
    over: splitCommaList(String(rhs).slice(overAt + 6))
  };
}

// ── chart (grammar-of-graphics) line parsing ───────────────────────────────────

function parseChartEncoding(bodyLines) {
  const encoding = {};
  for (const channel of ["x", "y", "r", "theta"]) {
    const field = readSimpleValue(bodyLines, channel);
    if (!field) continue;
    const domainRaw = readSimpleValue(bodyLines, `${channel}.domain`);
    const label = readSimpleValue(bodyLines, `${channel}.label`);
    encoding[channel] = {
      field,
      domain: domainRaw ? domainRaw.split(/\s+/).filter(Boolean).map(parseScalarValue) : null,
      label: label ?? null
    };
  }
  return encoding;
}

function parseLayerLine(tail) {
  const { name, rhs } = splitAssignment(tail);
  if (!name) return null;
  const [specPart, encPart = ""] = String(rhs).split("|");
  const specTokens = specPart.trim().split(/\s+/).filter(Boolean);
  const mark = specTokens[0] ?? null;
  const overIndex = specTokens.indexOf("over");
  const over = overIndex >= 0
    ? splitCommaList(specTokens.slice(overIndex + 1).join(" "))
    : [];
  const encode = {};
  for (const token of encPart.trim().split(/\s+/).filter(Boolean)) {
    const colon = token.indexOf(":");
    if (colon <= 0) continue;
    encode[token.slice(0, colon)] = parseScalarValue(token.slice(colon + 1));
  }
  return { name, mark, over, encode };
}

function splitAssignment(tail) {
  const text = String(tail ?? "");
  const eq = text.indexOf("=");
  if (eq < 0) {
    const space = text.search(/\s/);
    if (space < 0) return { name: text.trim(), rhs: "" };
    return { name: text.slice(0, space).trim(), rhs: text.slice(space + 1).trim() };
  }
  return { name: text.slice(0, eq).trim(), rhs: text.slice(eq + 1).trim() };
}

function splitCommaList(value) {
  if (value == null || value === "") return [];
  return String(value).split(",").map(item => cleanRvmValue(item)).filter(Boolean);
}

function semanticActorShape(name, { owns = null, attrs = {}, target = null } = {}) {
  return {
    kind: "actor",
    name,
    owns,
    entity: attrs.entity ?? null,
    collectionContext: attrs.collection_context ?? null,
    durableState: attrs.durable_state ?? null,
    listProjection: attrs.list_projection ?? null,
    detailProjection: attrs.detail_projection ?? null,
    root: attrs.root ?? null,
    target,
    props: attrs
  };
}

function semanticInlineRvmShape(kind, name, type, { using = null, attrs = {}, target = null } = {}) {
  switch (kind) {
    case "context":
    case "graph_context":
      return {
        kind: "context",
        name,
        parent: attrs.parent ?? null,
        target
      };
    case "capability":
      return {
        kind: "capability",
        name,
        verbs: parseInlineList(attrs.verbs),
        scope: parseInlineList(attrs.in ?? attrs.scope),
        provides: parseInlineList(attrs.provide ?? attrs.provides),
        source: attrs.source ?? null,
        state: attrs.state ?? null,
        driver: attrs.driver ?? null,
        target
      };
    case "entity":
      return {
        kind: "entity",
        name,
        context: attrs.context ?? null,
        store: attrs.durable_state ?? attrs.store ?? null,
        identity: attrs.id_prop ?? attrs.identity ?? null,
        versionRef: attrs.version_prop ?? attrs.version_ref ?? null,
        fields: parseInlineNamedEntries(attrs.fields),
        target
      };
    case "boundary":
      return {
        kind: "boundary",
        name,
        capabilities: parseInlineList(attrs.capability ?? attrs.capabilities),
        operations: [],
        target
      };
    case "policy":
      return {
        kind: "policy",
        name,
        subject: attrs.subject ?? null,
        initialState: attrs.initial_state ?? null,
        stateField: attrs.state_field ?? null,
        readyState: attrs.ready_state ?? null,
        disagreementState: attrs.disagreement_state ?? null,
        disagreementOutcomes: parseInlineObjectEntries(attrs.disagreement_outcomes),
        policyOutcomes: parseInlineObjectEntries(attrs.policy_outcomes),
        target
      };
    case "state":
    case "value":
      return {
        kind: "state",
        name,
        valueType: type,
        initial: attrs.initial ?? null,
        target
      };
    case "event":
      return {
        kind: "message",
        name,
        role: "event",
        schema: attrs.payload_schema ?? null,
        fields: parseInlineNamedEntries(attrs.payload),
        writes: {},
        sequence: target
      };
    case "command":
    case "query":
      return {
        kind: "message",
        name,
        role: kind,
        fields: parseInlineNamedEntries(attrs.fields),
        messageKind: attrs.kind ?? null,
        route: attrs.route ?? null,
        requestSchema: attrs.request_schema ?? null,
        responseSchema: attrs.response_schema ?? null,
        requestState: attrs.request_state ?? null,
        loadingState: attrs.loading_state ?? null,
        successEvent: attrs.success_event ?? attrs.success ?? null,
        failureEvent: attrs.failure_event ?? attrs.failure ?? null,
        refreshRuntime: attrs.refresh_runtime ?? null,
        sequence: target,
        boundary: attrs.external_boundary ?? null,
        steps: parseInlineList(attrs.steps)
      };
    case "adapter":
      return {
        kind: "boundary",
        name,
        capabilities: [],
        operations: [{
          kind: "adapter",
          transport: using,
          command: attrs.command ?? null,
          operationKind: attrs.kind ?? null,
          route: attrs.route ?? null,
          hostOperation: attrs.host_operation ?? null,
          requestSchema: attrs.request_schema ?? null,
          responseSchema: attrs.response_schema ?? null,
          requestState: attrs.request_state ?? null,
          loadingState: attrs.loading_state ?? null,
          successEvent: attrs.success_event ?? attrs.success ?? null,
          failureEvent: attrs.failure_event ?? attrs.failure ?? null,
          refreshRuntime: attrs.refresh_runtime ?? null,
          target
        }]
      };
    case "derive":
      return {
        kind: "projection",
        name,
        projectionKind: attrs.kind ?? null,
        source: attrs.source ?? null,
        target,
        props: inlineProps(attrs)
      };
    case "view":
      return {
        kind: "surface",
        name,
        surfaceKind: attrs.kind ?? null,
        className: attrs.class ?? null,
        processRef: attrs.process ?? null,
        projectionRefs: parseInlineList(attrs.projections),
        capabilityRefs: parseInlineList(attrs.capabilities),
        children: parseInlineList(attrs.children),
        target,
        props: inlineProps(attrs, new Set(["kind", "class", "process", "projections", "capabilities", "children"]))
      };
    case "process":
      return {
        kind: "process",
        name,
        state: [],
        handles: parseInlineList(attrs.handles),
        emits: parseInlineList(attrs.emits),
        rules: parseInlineList(target)
      };
    default:
      return null;
  }
}

function parseRvmFieldMap(bodyLines) {
  const rows = [];
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const direct = trimmed.match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s+(.+)$/);
    if (direct && !trimmed.endsWith("{")) rows.push({ key: direct[1], value: direct[2].trim() });
  }
  return rows;
}

function parseInlineTail(rest) {
  const { beforeArrow, target } = splitInlineArrow(rest);
  const attrs = {};
  for (const token of tokenizeInlineAttrs(beforeArrow)) {
    const eq = token.indexOf("=");
    if (eq <= 0) continue;
    const key = token.slice(0, eq);
    const value = token.slice(eq + 1);
    attrs[key] = parseScalarValue(value);
  }
  return { attrs, target: target ? cleanRvmValue(target) : null };
}

function splitInlineArrow(text) {
  let quote = null;
  for (let index = 0; index < text.length - 1; index += 1) {
    const ch = text[index];
    if ((ch === "\"" || ch === "'") && text[index - 1] !== "\\") {
      quote = quote === ch ? null : (quote ?? ch);
      continue;
    }
    if (!quote && ch === "-" && text[index + 1] === ">") {
      return {
        beforeArrow: text.slice(0, index).trim(),
        target: text.slice(index + 2).trim()
      };
    }
  }
  return { beforeArrow: text.trim(), target: null };
}

function tokenizeInlineAttrs(text) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if ((ch === "\"" || ch === "'") && text[index - 1] !== "\\") {
      quote = quote === ch ? null : (quote ?? ch);
      current += ch;
      continue;
    }
    if (!quote && /\s/.test(ch)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function parseInlineNamedEntries(value) {
  return parseInlineList(value).map(entry => {
    const splitAt = entry.indexOf(":");
    if (splitAt <= 0) return null;
    return { name: entry.slice(0, splitAt), type: parseScalarValue(entry.slice(splitAt + 1)) };
  }).filter(Boolean);
}

function parseInlineObjectEntries(value) {
  return Object.fromEntries(parseInlineNamedEntries(value).map(({ name, type }) => [name, type]));
}

function parseInlineList(value) {
  if (value == null || value === "") return [];
  return String(value).split(",").map(item => cleanRvmValue(item)).filter(Boolean);
}

function inlineProps(attrs, ignored = new Set(["kind", "source"])) {
  return Object.fromEntries(
    Object.entries(attrs).filter(([key]) => !ignored.has(key))
  );
}

function parseTypedFieldBlock(bodyLines, blockName) {
  const block = extractNamedBlock(bodyLines, blockName);
  return block.map(line => {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s*([A-Za-z_][A-Za-z0-9_.:/-]*)$/);
    if (!match) return null;
    return { name: match[1], type: match[2] };
  }).filter(Boolean);
}

function parseSimpleListBlock(bodyLines, blockName) {
  return extractNamedBlock(bodyLines, blockName)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/,$/, ""));
}

function parseSimpleEntries(bodyLines, key) {
  const blockValues = parseSimpleListBlock(bodyLines, key);
  if (blockValues.length > 0) return blockValues;
  return readRepeatedSimpleValues(bodyLines, key);
}

function parseNamedValueBlock(bodyLines, blockName) {
  return extractNamedBlock(bodyLines, blockName)
    .map(line => {
      const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s*(.+)$/);
      if (!match) return null;
      return { name: match[1], value: parseScalarValue(match[2]) };
    })
    .filter(Boolean);
}

function parseCommandStepsBlock(bodyLines, blockName) {
  return extractNamedBlock(bodyLines, blockName)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/,$/, ""));
}

function parsePropAssignments(bodyLines) {
  return Object.fromEntries(
    bodyLines
      .map(line => {
        const match = line.trim().match(/^prop\s+([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.+)$/);
        if (!match) return null;
        return [match[1], parseScalarValue(match[2])];
      })
      .filter(Boolean)
  );
}

function parseGraphProps(bodyLines, ignored = new Set()) {
  return Object.fromEntries(
    parseRvmFieldMap(bodyLines)
      .filter(({ key }) => key && !ignored.has(key))
      .map(({ key, value }) => [key, parseScalarValue(value)])
  );
}

function inferEntityFields(bodyLines) {
  const keys = ["id_prop", "title_prop", "done_prop", "notes_prop", "version_prop"];
  return keys
    .map(key => readSimpleValue(bodyLines, key))
    .filter(Boolean)
    .map(name => ({ name, type: "string" }));
}

function readSimpleValue(bodyLines, key) {
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const match = trimmed.match(new RegExp(`^${escapeRegExp(key)}\\s+(.+)$`));
    if (match && !trimmed.endsWith("{")) return cleanRvmValue(match[1]);
  }
  return null;
}

function readRepeatedSimpleValues(bodyLines, key) {
  const values = [];
  for (const line of bodyLines) {
    const trimmed = line.trim();
    const match = trimmed.match(new RegExp(`^${escapeRegExp(key)}\\s+(.+)$`));
    if (match && !trimmed.endsWith("{")) values.push(cleanRvmValue(match[1]));
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

function cleanRvmValue(value) {
  return String(value || "").trim().replace(/^"|"$/g, "");
}

function parseScalarValue(value) {
  const cleaned = cleanRvmValue(value);
  if (cleaned === "true") return true;
  if (cleaned === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  return cleaned;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
