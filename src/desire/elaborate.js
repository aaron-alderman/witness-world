import {
  createDesirePlusDocument,
  createDesirePlusNode,
  createTrace,
  validateDesirePlusDocument,
  validateDesirePlusNode
} from "./ir.js";

export function createDesirePlusElaboratorRegistry(entries = []) {
  const elaborators = [];
  const registry = {
    register(entry) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error("DESIRE+ elaborator entry must be an object");
      }
      if (typeof entry.elaborate !== "function") {
        throw new Error("DESIRE+ elaborator entry requires elaborate(node, context)");
      }
      const normalized = {
        id: entry.id ?? defaultElaboratorId(entry),
        sourceLanguage: entry.sourceLanguage ?? null,
        sourceKind: normalizeMatcherValue(entry.sourceKind),
        semanticKind: normalizeMatcherValue(entry.semanticKind),
        nodeKind: normalizeMatcherValue(entry.nodeKind),
        name: normalizeMatcherValue(entry.name),
        elaborate: entry.elaborate
      };
      elaborators.push(normalized);
      return registry;
    },
    matching(node) {
      return elaborators.filter(entry => matchesElaborator(entry, node));
    },
    entries() {
      return [...elaborators];
    }
  };
  for (const entry of entries) registry.register(entry);
  return registry;
}

export function elaborateDesirePlus(desirePlus, { elaboratorRegistry = null } = {}) {
  const validated = validateDesirePlusDocument(desirePlus);
  if (!elaboratorRegistry || elaboratorRegistry.entries().length === 0) return validated;

  const output = [];
  for (const node of validated.nodes) {
    let keepOriginal = true;
    const additions = [];
    for (const entry of elaboratorRegistry.matching(node)) {
      const result = normalizeElaboratorResult(entry.elaborate(node, elaboratorContext(node, entry)));
      if (result.replace === true) keepOriginal = false;
      for (const produced of result.nodes) {
        const validatedProduced = validateDesirePlusNode(produced, { path: `elaborator(${entry.id}).node` });
        assertElaboratorAncestry(node, validatedProduced, entry.id);
        additions.push(validatedProduced);
      }
    }
    if (keepOriginal) output.push(node);
    output.push(...additions);
  }
  assertUniqueNodeIds(output);
  return createDesirePlusDocument(output, {
    ...validated.meta,
    elaborated: output.length !== validated.nodes.length || output.some((node, index) => node.id !== validated.nodes[index]?.id)
  });
}

function elaboratorContext(sourceNode, entry) {
  return {
    sourceNode,
    elaboratorId: entry.id,
    createNode({
      kind = sourceNode.kind,
      name = null,
      order = sourceNode.order,
      sourceKind = sourceNode.trace.sourceKind,
      payload = {},
      semantic = null,
      meta = {},
      viaStep = `elaborate:${entry.id}`
    }) {
      return createDesirePlusNode({
        kind,
        name,
        order,
        trace: createTrace({
          sourceLanguage: sourceNode.trace.sourceLanguage,
          file: sourceNode.trace.file,
          startLine: sourceNode.trace.startLine,
          startColumn: sourceNode.trace.startColumn,
          endLine: sourceNode.trace.endLine,
          endColumn: sourceNode.trace.endColumn,
          sourceKind,
          originNodeId: sourceNode.id,
          via: [...(sourceNode.trace.via ?? []), viaStep]
        }),
        payload,
        semantic,
        meta
      });
    }
  };
}

function normalizeElaboratorResult(result) {
  if (Array.isArray(result)) return { replace: false, nodes: result };
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("DESIRE+ elaborator must return an array or { nodes, replace }");
  }
  if (!Array.isArray(result.nodes)) {
    throw new Error("DESIRE+ elaborator result.nodes must be an array");
  }
  return {
    replace: result.replace === true,
    nodes: result.nodes
  };
}

function assertElaboratorAncestry(sourceNode, produced, elaboratorId) {
  if (produced.trace.originNodeId !== sourceNode.id) {
    throw new Error(`DESIRE+ elaborator ${elaboratorId} produced node without originNodeId ${sourceNode.id}`);
  }
  const sourceViaLength = Array.isArray(sourceNode.trace.via) ? sourceNode.trace.via.length : 0;
  if (!Array.isArray(produced.trace.via) || produced.trace.via.length <= sourceViaLength) {
    throw new Error(`DESIRE+ elaborator ${elaboratorId} produced node without transform ancestry`);
  }
}

function assertUniqueNodeIds(nodes) {
  const seen = new Set();
  for (const node of nodes) {
    if (seen.has(node.id)) throw new Error(`duplicate DESIRE+ node id: ${node.id}`);
    seen.add(node.id);
  }
}

function matchesElaborator(entry, node) {
  if (entry.sourceLanguage && entry.sourceLanguage !== node.trace?.sourceLanguage) return false;
  if (!matchesValue(entry.sourceKind, node.trace?.sourceKind)) return false;
  if (!matchesValue(entry.semanticKind, node.semantic?.kind ?? null)) return false;
  if (!matchesValue(entry.nodeKind, node.kind)) return false;
  if (!matchesValue(entry.name, node.name)) return false;
  return true;
}

function normalizeMatcherValue(value) {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? new Set(value) : value;
}

function matchesValue(matcher, value) {
  if (matcher === null || matcher === undefined) return true;
  if (matcher instanceof Set) return matcher.has(value);
  return matcher === value;
}

function defaultElaboratorId(entry) {
  return [
    "elaborator",
    entry.sourceLanguage,
    Array.isArray(entry.sourceKind) ? entry.sourceKind.join("_") : entry.sourceKind,
    Array.isArray(entry.semanticKind) ? entry.semanticKind.join("_") : entry.semanticKind,
    entry.name
  ].filter(Boolean).join(":");
}
