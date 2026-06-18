import { thing, relation } from "../../src/kernel.js";
import {
  createMcpServer,
  installMcpTool,
  removeMcpTool,
  resolveContextualRef,
  resolveCoveredContextualRef
} from "../../src/modules.js";

function req(values, key) {
  const value = values[key];
  if (value === undefined || value === null || value === "") throw new Error(`missing required field: ${key}`);
  return value;
}

function sourceTargetsForMcpDoc(doc) {
  const values = doc.values ?? {};
  if (doc.kind === "mcpServer") return [values.id, values.serverRunner].filter(Boolean);
  if (doc.kind === "mcpToolInstall" || doc.kind === "mcpToolRemove") return [values.server].filter(Boolean);
  return [];
}

function emitSourceAnnotationFromDoc(world, doc, target, actor) {
  const file = doc.file ?? null;
  if (!file || !target) return null;
  const trace = doc.trace ?? {};
  const fileId = `source:${file}`;
  return world.emit({
    process: "dsl.source.annotate",
    actor,
    claims: [
      thing(fileId),
      relation(fileId, "hasModuleKind", "sourceFile"),
      relation(target, "definedIn", fileId, { section: doc.kind })
    ],
    body: {
      target,
      file,
      section: doc.kind,
      line: doc.line ?? trace.startLine ?? null,
      startLine: trace.startLine ?? doc.line ?? null,
      startColumn: trace.startColumn ?? 1,
      endLine: trace.endLine ?? doc.line ?? null,
      endColumn: trace.endColumn ?? null,
      sourceLanguage: trace.sourceLanguage ?? "wtoml",
      sourceKind: trace.sourceKind ?? doc.kind,
      desireNodeId: doc.nodeId ?? null,
      desireSourceNodeIds: trace.desireSourceNodeIds ?? [],
      originNodeId: trace.originNodeId ?? null,
      via: Array.isArray(trace.via) ? trace.via : [],
      values: structuredClone(doc.values ?? {})
    }
  });
}

function withSourceAnnotations(world, doc, witnesses) {
  const out = [...witnesses.filter(Boolean)];
  for (const target of [...new Set(sourceTargetsForMcpDoc(doc))]) {
    const annotation = emitSourceAnnotationFromDoc(world, doc, target, req(doc.values ?? {}, "actor"));
    if (annotation) out.push(annotation);
  }
  return out;
}

function resolvePreparedDocRef(world, values, {
  contextField = "context",
  idField,
  refField,
  label,
  allowedCanonicalIdPolicyClasses = null
}) {
  return resolveContextualRef(world.allWitnesses(), {
    context: values[contextField] ?? null,
    id: values[idField] ?? null,
    ref: values[refField] ?? null,
    label,
    allowedCanonicalIdPolicyClasses
  });
}

function resolveCoveredPreparedDocRef(world, values, {
  contextField = "context",
  idField,
  refField,
  label
}) {
  return resolveCoveredContextualRef(world.allWitnesses(), {
    context: values[contextField] ?? null,
    id: values[idField] ?? null,
    ref: values[refField] ?? null,
    label
  });
}

function applyMcpServer(world, doc) {
  const values = doc.values ?? {};
  const serverRunner = resolveCoveredPreparedDocRef(world, values, {
    idField: "serverRunner",
    refField: "serverRunnerRef",
    label: "server runner"
  });
  if (!serverRunner.ok) throw new Error(serverRunner.error);
  if (!serverRunner.target) return null;
  return withSourceAnnotations(world, doc, [
    createMcpServer(world, {
      actor: req(values, "actor"),
      id: req(values, "id"),
      label: values.label ?? values.id,
      serverRunner: serverRunner.target,
      serviceIdentity: values.serviceIdentity ?? null,
      transports: values.transports ?? ["stdio", "http"],
      context: values.context ?? null,
      owner: values.owner ?? values.actor
    })
  ]);
}

function applyMcpToolInstall(world, doc) {
  const values = doc.values ?? {};
  const server = resolveCoveredPreparedDocRef(world, values, {
    idField: "server",
    refField: "serverRef",
    label: "mcp server"
  });
  if (!server.ok) throw new Error(server.error);
  if (!server.target) throw new Error("missing required field: server");
  return withSourceAnnotations(world, doc, [
    installMcpTool(world, {
      actor: req(values, "actor"),
      server: server.target,
      tool: req(values, "tool"),
      actingMode: values.actingMode ?? "delegated",
      scopeContexts: values.scopeContexts ?? [],
      scopeTargets: values.scopeTargets ?? []
    })
  ]);
}

function applyMcpToolRemove(world, doc) {
  const values = doc.values ?? {};
  const server = resolveCoveredPreparedDocRef(world, values, {
    idField: "server",
    refField: "serverRef",
    label: "mcp server"
  });
  if (!server.ok) throw new Error(server.error);
  if (!server.target) throw new Error("missing required field: server");
  return withSourceAnnotations(world, doc, [
    removeMcpTool(world, {
      actor: req(values, "actor"),
      server: server.target,
      tool: req(values, "tool")
    })
  ]);
}

export const mcpAuthoringRuntimeDeclarations = Object.freeze([
  { kind: "mcpServer", apply: applyMcpServer },
  { kind: "mcpToolInstall", apply: applyMcpToolInstall },
  { kind: "mcpToolRemove", apply: applyMcpToolRemove }
]);
