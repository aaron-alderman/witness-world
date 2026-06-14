import { parseWitnessToml } from "../dsl.js";
import { validateDesirePlusDocument } from "./ir.js";

export function serializeDesirePlusToWtoml(desirePlus) {
  const validatedDesirePlus = validateDesirePlusDocument(desirePlus);
  return validatedDesirePlus.nodes
    .sort((a, b) => a.order - b.order)
    .map(serializeWtomlNode)
    .filter(Boolean)
    .join("\n\n");
}

export function serializeDesirePlusToRvm(desirePlus) {
  const validatedDesirePlus = validateDesirePlusDocument(desirePlus);
  return validatedDesirePlus.nodes
    .filter(node => node.kind === "rvm.form")
    .sort((a, b) => a.order - b.order)
    .map(node => node.payload.raw || serializeSemanticRvmNode(node))
    .join("\n\n");
}

export function normalizeWtomlRoundTrip(text) {
  return parseWitnessToml(text).map(doc => ({ kind: doc.kind, values: doc.values }));
}

function serializeWtomlNode(node) {
  if (node.kind === "rvm.form" && node.semantic) return serializeSemanticWtomlNode(node);
  if (node.kind !== "wtoml.doc") return null;
  const { docKind, values, sectionStyle } = node.payload;
  return serializeWtomlDoc(docKind, values, sectionStyle ?? "array");
}

function serializeSemanticWtomlNode(node) {
  const serialized = semanticWtomlDoc(node.semantic ?? {});
  if (!serialized) return null;
  const docs = Array.isArray(serialized) ? serialized : [serialized];
  return docs
    .map(doc => serializeWtomlDoc(doc.docKind, cleanWtomlValues(doc.values), doc.sectionStyle ?? "array"))
    .join("\n\n");
}

function semanticWtomlDoc(semantic) {
  switch (semantic.kind) {
    case "context":
      return { docKind: "context", sectionStyle: "table", values: { id: semantic.name, parent: semantic.parent } };
    case "capability":
      return {
        docKind: "capability",
        values: {
          id: semantic.name,
          verbs: semantic.verbs,
          scope: semantic.scope,
          provides: semantic.provides,
          source: semantic.source,
          state: semantic.state,
          driver: semantic.driver
        }
      };
    case "type":
      return {
        docKind: "type",
        values: {
          id: semantic.name,
          role: semantic.role,
          field: semantic.field,
          versionKind: semantic.versionKind,
          valueType: semantic.valueType,
          initial: semantic.initial,
          cases: semantic.cases
        }
      };
    case "state":
      return {
        docKind: "state",
        values: {
          id: semantic.name,
          valueType: semantic.valueType,
          initial: semantic.initial
        }
      };
    case "message":
      return {
        docKind: "message",
        values: {
          id: semantic.name,
          role: semantic.role,
          fields: semantic.fields,
          schema: semantic.schema,
          writes: semantic.writes,
          messageKind: semantic.messageKind,
          route: semantic.route,
          requestSchema: semantic.requestSchema,
          responseSchema: semantic.responseSchema,
          requestState: semantic.requestState,
          loadingState: semantic.loadingState,
          successEvent: semantic.successEvent,
          failureEvent: semantic.failureEvent,
          refreshRuntime: semantic.refreshRuntime,
          sequence: semantic.sequence,
          boundary: semantic.boundary,
          steps: semantic.steps
        }
      };
    case "entity":
      return {
        docKind: "entity",
        values: {
          id: semantic.name,
          context: semantic.context,
          store: semantic.store,
          identity: semantic.identity,
          version: semantic.version,
          versionRef: semantic.versionRef,
          fields: semantic.fields,
          role: semantic.role
        }
      };
    case "graph":
      return {
        docKind: "graph",
        values: {
          id: semantic.name,
          graphKind: semantic.graphKind,
          from: semantic.from,
          to: semantic.to,
          nodeType: semantic.nodeType,
          edgeType: semantic.edgeType,
          schemaType: semantic.schemaType,
          fields: semantic.fields,
          props: semantic.props
        }
      };
    case "store":
      return {
        docKind: "store",
        values: {
          id: semantic.name,
          storeKind: semantic.storeKind,
          context: semantic.context,
          owner: semantic.owner,
          entity: semantic.entity,
          props: semantic.props
        }
      };
    case "actor":
      return semanticActorWtomlDocs(semantic);
    case "process":
      return {
        docKind: "process",
        values: {
          id: semantic.name,
          state: semantic.state,
          handles: semantic.handles,
          emits: semantic.emits,
          rules: semantic.rules
        }
      };
    case "boundary":
      return {
        docKind: "boundary",
        values: {
          id: semantic.name,
          capabilities: semantic.capabilities,
          operations: semantic.operations
        }
      };
    case "policy":
      return {
        docKind: "policy",
        values: {
          id: semantic.name,
          subject: semantic.subject,
          initialState: semantic.initialState,
          stateField: semantic.stateField,
          readyState: semantic.readyState,
          disagreementState: semantic.disagreementState,
          disagreementOutcomes: semantic.disagreementOutcomes,
          policyOutcomes: semantic.policyOutcomes
        }
      };
    case "projection":
      return {
        docKind: "projection",
        values: {
          id: semantic.name,
          projectionKind: semantic.projectionKind,
          source: semantic.source,
          props: semantic.props
        }
      };
    case "surface":
      return {
        docKind: "surface",
        values: {
          id: semantic.name,
          surfaceKind: semantic.surfaceKind,
          className: semantic.className,
          children: semantic.children,
          props: semantic.props,
          modelRef: semantic.modelRef,
          frame: semantic.frame,
          encoding: semantic.encoding,
          editable: semantic.editable,
          layers: semantic.layers
        }
      };
    case "dataflow":
      return {
        docKind: "dataflow",
        values: {
          id: semantic.name,
          axes: semantic.axes,
          params: semantic.params,
          derives: semantic.derives,
          reduces: semantic.reduces
        }
      };
    default:
      return null;
  }
}

function semanticActorWtomlDocs(semantic) {
  const docs = [];
  const entity = semantic.entity ?? semantic.owns ?? null;
  const source = semantic.durableState ?? entity ?? semantic.collectionContext ?? null;
  if (semantic.durableState) {
    docs.push({
      docKind: "store",
      values: {
        id: semantic.durableState,
        storeKind: "durable",
        context: semantic.collectionContext,
        owner: semantic.name,
        entity,
        props: compactObject({
          root: semantic.root,
          target: semantic.target
        })
      }
    });
  }
  if (semantic.listProjection) {
    docs.push({
      docKind: "projection",
      values: {
        id: semantic.listProjection,
        projectionKind: "list",
        source,
        props: compactObject({
          actor: semantic.name,
          entity,
          context: semantic.collectionContext
        })
      }
    });
  }
  if (semantic.detailProjection) {
    docs.push({
      docKind: "projection",
      values: {
        id: semantic.detailProjection,
        projectionKind: "detail",
        source,
        props: compactObject({
          actor: semantic.name,
          entity,
          context: semantic.collectionContext
        })
      }
    });
  }
  return docs.length > 0 ? docs : null;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined)
  );
}

function serializeWtomlDoc(docKind, values, sectionStyle = "array") {
  const lines = [];
  const entries = Object.entries(values ?? {});
  if (sectionStyle === "table" && typeof values?.id === "string") {
    lines.push(`[${docKind}.${values.id}]`);
    for (const [key, value] of entries) {
      if (key === "id") continue;
      lines.push(`${key} = ${serializeValue(value)}`);
    }
    return lines.join("\n");
  }
  lines.push(`[[${docKind}]]`);
  for (const [key, value] of entries) lines.push(`${key} = ${serializeValue(value)}`);
  return lines.join("\n");
}

function cleanWtomlValues(value) {
  if (Array.isArray(value)) return value.map(cleanWtomlValues).filter(item => item !== undefined);
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, inner]) => [key, cleanWtomlValues(inner)])
      .filter(([, inner]) => inner !== undefined);
    if (entries.length === 0) return undefined;
    return Object.fromEntries(entries);
  }
  if (value === null || value === undefined || value === "") return undefined;
  return value;
}

function serializeValue(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(serializeValue).join(", ")}]`;
  if (value && typeof value === "object") {
    return `{ ${Object.entries(value).map(([key, inner]) => `${key} = ${serializeValue(inner)}`).join(", ")} }`;
  }
  return JSON.stringify(value ?? null);
}

function serializeSemanticRvmNode(node) {
  const semantic = node.semantic ?? {};
  if (semantic.kind === "import") return `import ${semantic.target}`;
  if (semantic.kind === "module") return `module ${semantic.name}`;
  if (semantic.kind === "context") {
    return `context ${semantic.name} {\n${semantic.parent ? `  parent ${semantic.parent}\n` : ""}}`;
  }
  if (semantic.kind === "capability") {
    return block("capability", semantic.name, [
      ...simpleLines("in", semantic.scope ?? []),
      simpleLine("source", semantic.source),
      simpleLine("state", semantic.state),
      simpleLine("driver", semantic.driver),
      ...simpleLines("provide", semantic.provides ?? [])
    ]);
  }
  if (semantic.kind === "message") return serializeRvmMessage(semantic);
  if (semantic.kind === "entity") {
    return block("entity", semantic.name, [
      simpleLine("context", semantic.context),
      simpleLine("durable_state", semantic.store),
      simpleLine("id_prop", semantic.identity),
      simpleLine("version_prop", semantic.versionRef),
      nestedFieldBlock("fields", semantic.fields ?? [])
    ]);
  }
  if (semantic.kind === "graph") return serializeRvmGraph(semantic);
  if (semantic.kind === "process") {
    return block("process", semantic.name, [
      repeatedBlock("states", semantic.state ?? []),
      ...simpleLines("handles", semantic.handles ?? []),
      ...simpleLines("emits", semantic.emits ?? [])
    ]);
  }
  if (semantic.kind === "state") {
    return block("state", semantic.name, [
      simpleLine("initial", semantic.initial)
    ], semantic.valueType ? `: ${semantic.valueType}` : "");
  }
  if (semantic.kind === "type" && semantic.role === "version") {
    return block("version", semantic.name, [
      simpleLine("field", semantic.field),
      simpleLine("kind", semantic.versionKind)
    ]);
  }
  if (semantic.kind === "boundary") return serializeRvmBoundary(node, semantic);
  if (semantic.kind === "policy") {
    return block("policy", semantic.name, [
      simpleLine("subject", semantic.subject),
      simpleLine("initial_state", semantic.initialState),
      simpleLine("state_field", semantic.stateField),
      simpleLine("ready_state", semantic.readyState),
      simpleLine("disagreement_state", semantic.disagreementState),
      namedValueBlock("disagreement_outcomes", semantic.disagreementOutcomes),
      namedValueBlock("policy_outcomes", semantic.policyOutcomes)
    ]);
  }
  if (semantic.kind === "projection") {
    return block("derive", semantic.name, [
      simpleLine("kind", semantic.projectionKind),
      simpleLine("source", semantic.source),
      ...propLines(semantic.props)
    ]);
  }
  if (semantic.kind === "surface") {
    if (semantic.surfaceKind === "chart") return serializeRvmChart(semantic);
    return block("view", semantic.name, [
      simpleLine("kind", semantic.surfaceKind),
      simpleLine("class", semantic.className),
      repeatedBlock("children", semantic.children ?? []),
      ...propLines(semantic.props)
    ]);
  }
  if (semantic.kind === "dataflow") return serializeRvmDataflow(semantic);
  if (semantic.kind === "actor") {
    return block("actor", semantic.name, [
      simpleLine("root", semantic.root),
      simpleLine("collection_context", semantic.collectionContext),
      simpleLine("entity", semantic.entity),
      simpleLine("list_projection", semantic.listProjection),
      simpleLine("detail_projection", semantic.detailProjection),
      simpleLine("durable_state", semantic.durableState)
    ], semantic.owns ? ` owns ${semantic.owns}` : "");
  }
  return node.payload.raw || node.payload.header || "";
}

function serializeRvmMessage(semantic) {
  if (semantic.role === "event") {
    return block("event", semantic.name, [
      simpleLine("payload_schema", semantic.schema),
      nestedFieldBlock("payload", semantic.fields ?? []),
      namedValueBlock("writes", semantic.writes)
    ]);
  }
  if (semantic.role === "command" || semantic.role === "query") {
    return block(semantic.role, semantic.name, [
      nestedFieldBlock("fields", semantic.fields ?? []),
      simpleLine("kind", semantic.messageKind),
      simpleLine("route", semantic.route),
      simpleLine("request_schema", semantic.requestSchema),
      simpleLine("response_schema", semantic.responseSchema),
      simpleLine("request_state", semantic.requestState),
      simpleLine("loading_state", semantic.loadingState),
      simpleLine("success_event", semantic.successEvent),
      simpleLine("failure_event", semantic.failureEvent),
      simpleLine("refresh_runtime", semantic.refreshRuntime),
      simpleLine("sequence", semantic.sequence),
      simpleLine("external_boundary", semantic.boundary),
      repeatedBlock("steps", semantic.steps ?? [])
    ]);
  }
  return block("message", semantic.name, [
    nestedFieldBlock("fields", semantic.fields ?? [])
  ]);
}

function serializeRvmGraph(semantic) {
  const graphKind = semantic.graphKind ?? "node";
  if (graphKind === "node") {
    return block("graph_node", semantic.name, [
      simpleLine("kind", semantic.nodeType),
      simpleLine("entity_type", semantic.schemaType),
      nestedFieldBlock("fields", semantic.fields ?? []),
      ...propLines(semantic.props)
    ]);
  }
  if (graphKind === "edge") {
    return block("graph_edge", semantic.name, [
      simpleLine("from", semantic.from),
      simpleLine("to", semantic.to),
      simpleLine("kind", semantic.edgeType),
      simpleLine("edge_type", semantic.schemaType),
      nestedFieldBlock("fields", semantic.fields ?? []),
      ...propLines(semantic.props)
    ]);
  }
  if (graphKind === "entityType") {
    return block("entity_type", semantic.name, [
      nestedFieldBlock("fields", semantic.fields ?? []),
      ...propLines(semantic.props)
    ]);
  }
  if (graphKind === "edgeType") {
    return block("edge_type", semantic.name, [
      simpleLine("from", semantic.from),
      simpleLine("to", semantic.to),
      nestedFieldBlock("fields", semantic.fields ?? []),
      ...propLines(semantic.props)
    ]);
  }
  return block("graph", semantic.name, [
    simpleLine("kind", graphKind),
    nestedFieldBlock("fields", semantic.fields ?? []),
    ...propLines(semantic.props)
  ]);
}

function serializeRvmBoundary(node, semantic) {
  const operation = (semantic.operations ?? [])[0] ?? null;
  if (operation?.kind === "adapter") {
    return block("adapter", semantic.name, [
      simpleLine("command", operation.command),
      simpleLine("kind", operation.operationKind),
      simpleLine("route", operation.route),
      simpleLine("host_operation", operation.hostOperation),
      simpleLine("request_schema", operation.requestSchema),
      simpleLine("response_schema", operation.responseSchema),
      simpleLine("request_state", operation.requestState),
      simpleLine("loading_state", operation.loadingState),
      simpleLine("success_event", operation.successEvent),
      simpleLine("failure_event", operation.failureEvent),
      simpleLine("refresh_runtime", operation.refreshRuntime)
    ], operation.transport ? ` using ${operation.transport}` : "");
  }
  if ((operation?.kind === "read" || operation?.kind === "write") && operation.capability) {
    return block(operation.kind, semantic.name, [
      simpleLine("capability", operation.capability)
    ]);
  }
  return block("boundary", semantic.name, [
    ...simpleLines("capability", semantic.capabilities ?? [])
  ]);
}

function serializeRvmDataflow(semantic) {
  return block("model", semantic.name, [
    ...(semantic.axes ?? []).map(axis => simpleLine("axis", serializeAxis(axis))),
    ...(semantic.params ?? []).map(param => simpleLine("param", serializeNamedAssignment(param.name, param.default))),
    ...(semantic.derives ?? []).map(flow => simpleLine("derive", serializeFlow(flow))),
    ...(semantic.reduces ?? []).map(flow => simpleLine("reduce", serializeFlow(flow)))
  ]);
}

function serializeRvmChart(semantic) {
  const encoding = semantic.encoding ?? {};
  return block("chart", semantic.name, [
    simpleLine("frame", semantic.frame),
    ...Object.entries(encoding).flatMap(([channel, spec]) => [
      simpleLine(channel, spec?.field),
      spec?.domain ? simpleLine(`${channel}.domain`, spec.domain.map(serializeRvmScalar).join(" ")) : null,
      simpleLine(`${channel}.label`, spec?.label)
    ]),
    Array.isArray(semantic.editable) && semantic.editable.length > 0
      ? simpleLine("editable", semantic.editable.join(", "))
      : null,
    ...(semantic.layers ?? []).map(layer => simpleLine("layer", serializeLayer(layer))),
    ...propLines(semantic.props)
  ], semantic.modelRef ? ` of ${semantic.modelRef}` : "");
}

function block(kind, name, lines, suffix = "") {
  const body = lines.flat().filter(Boolean).map(line => `  ${line}`).join("\n");
  return `${kind} ${name}${suffix} {\n${body ? `${body}\n` : ""}}`;
}

function simpleLine(key, value) {
  if (value === null || value === undefined || value === "") return null;
  return `${key} ${serializeRvmScalar(value)}`;
}

function simpleLines(key, values) {
  return (values ?? []).map(value => simpleLine(key, value)).filter(Boolean);
}

function repeatedBlock(name, values) {
  const clean = (values ?? []).filter(value => value !== null && value !== undefined && value !== "");
  if (clean.length === 0) return null;
  return [`${name} {`, ...clean.map(value => `  ${serializeRvmScalar(value)}`), "}"];
}

function nestedFieldBlock(name, fields) {
  const clean = (fields ?? []).filter(field => field?.name);
  if (clean.length === 0) return null;
  return [`${name} {`, ...clean.map(field => `  ${field.name}: ${serializeRvmScalar(field.type ?? field.value ?? "string")}`), "}"];
}

function namedValueBlock(name, values) {
  const entries = Object.entries(values ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (entries.length === 0) return null;
  return [`${name} {`, ...entries.map(([key, value]) => `  ${key}: ${serializeRvmScalar(value)}`), "}"];
}

function propLines(props) {
  return Object.entries(props ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `prop ${key} = ${serializeRvmScalar(value)}`);
}

function serializeAxis(axis) {
  if (!axis?.name) return null;
  if (axis.kind && Array.isArray(axis.values)) {
    return serializeNamedAssignment(axis.name, `${axis.kind}(${axis.values.map(serializeRvmScalar).join(", ")})`);
  }
  if (axis.kind && Array.isArray(axis.args)) {
    return serializeNamedAssignment(axis.name, `${axis.kind}(${axis.args.map(serializeRvmScalar).join(", ")})`);
  }
  if (axis.kind && axis.from !== null && axis.from !== undefined) {
    return serializeNamedAssignment(axis.name, `${axis.kind}(${serializeRvmScalar(axis.from)})`);
  }
  return serializeNamedAssignment(axis.name, axis.kind ?? "");
}

function serializeFlow(flow) {
  if (!flow?.name) return null;
  const expr = serializeRvmScalar(flow.expr ?? "");
  const over = Array.isArray(flow.over) && flow.over.length > 0
    ? ` over ${flow.over.map(serializeRvmScalar).join(", ")}`
    : "";
  return serializeNamedAssignment(flow.name, `${expr}${over}`);
}

function serializeLayer(layer) {
  if (!layer?.name) return null;
  const over = Array.isArray(layer.over) && layer.over.length > 0
    ? ` over ${layer.over.map(serializeRvmScalar).join(", ")}`
    : "";
  const encode = Object.entries(layer.encode ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}:${serializeRvmScalar(value)}`)
    .join(" ");
  const tail = encode ? ` | ${encode}` : "";
  return serializeNamedAssignment(layer.name, `${serializeRvmScalar(layer.mark ?? "")}${over}${tail}`);
}

function serializeNamedAssignment(name, value) {
  if (!name) return null;
  return `${name} = ${value}`;
}

function serializeRvmScalar(value) {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return String(value);
}
