import { createDesireDocument, createDesireNode, createRuntimeResidual, validateDesirePlusDocument } from "./ir.js";

export function normalizeDesirePlusToDesire(desirePlus, { rvmFormRegistry = null } = {}) {
  const validatedDesirePlus = validateDesirePlusDocument(desirePlus);
  const nodes = [];
  const runtimeResiduals = [];
  const versionFieldsByName = new Map();

  for (const node of validatedDesirePlus.nodes) {
    if (node.semantic?.kind === "type" && node.semantic?.role === "version") {
      versionFieldsByName.set(node.name, node.semantic.field ?? "version");
    }
  }

  const wtomlDefaults = {};
  for (const node of validatedDesirePlus.nodes) {
    if (node.kind === "wtoml.doc" && !isNativeSemanticWtomlNode(node)) {
      let values = structuredClone(node.payload.values);
      if (node.payload.docKind === "defaults") {
        Object.assign(wtomlDefaults, values);
      } else {
        values = { ...wtomlDefaults, ...values };
      }
      runtimeResiduals.push(createRuntimeResidual({
        kind: "runtime.declaration",
        name: node.name,
        body: {
          declaration: {
            kind: node.payload.docKind,
            values,
            sourceDefaultsApplied: true,
            source: {
              language: node.trace.sourceLanguage,
              kind: node.trace.sourceKind,
              file: node.payload.file,
              line: node.payload.line,
              order: node.order,
              sectionStyle: node.payload.sectionStyle,
              trace: structuredClone(node.trace)
            }
          },
          sourceLanguage: node.trace.sourceLanguage,
          sourceKind: node.trace.sourceKind,
          declarationKind: node.payload.docKind,
          values,
          sourceDefaultsApplied: true,
          file: node.payload.file,
          line: node.payload.line,
          order: node.order,
          sectionStyle: node.payload.sectionStyle,
          trace: structuredClone(node.trace)
        },
        sourceNodeIds: [node.id],
        meta: {
          compatibilityBridge: true,
          kernelResident: false,
          residualHome: "desire+",
          sourceCategory: node.meta?.sourceCategory ?? "runtime",
          residualCategory: node.meta?.residualCategory ?? "authored-runtime",
          desireBoundary: node.meta?.desireBoundary ?? "desire-plus-only"
        }
      }));
    }

    if (node.kind === "rvm.form" && node.payload?.pluginFormKind) {
      const pluginEntry = rvmFormRegistry?.get(node.payload.pluginFormKind) ?? null;
      if (!pluginEntry) {
        throw new Error(`RVM plugin form ${node.payload.pluginFormKind} is not available during normalization`);
      }
      const normalized = pluginEntry.normalize(node, pluginNormalizeContext(node));
      for (const semanticNode of normalized?.nodes ?? []) nodes.push(semanticNode);
      for (const residual of normalized?.runtimeResiduals ?? []) runtimeResiduals.push(residual);
      continue;
    }

    const semanticNodes = normalizeSemanticNode(node, versionFieldsByName);
    for (const semantic of semanticNodes) nodes.push(semantic);
  }

  return createDesireDocument(nodes, { sourceKind: validatedDesirePlus.kind }, runtimeResiduals);
}

function pluginNormalizeContext(sourceNode) {
  return {
    sourceNode,
    createRuntimeDeclarationResidual(kind, values, name = null, meta = {}) {
      return createRuntimeResidual({
        kind: "runtime.declaration",
        name,
        body: {
          declaration: {
            kind,
            values: structuredClone(values ?? {}),
            sourceDefaultsApplied: false,
            source: {
              language: sourceNode.trace.sourceLanguage,
              kind: sourceNode.trace.sourceKind,
              file: sourceNode.payload.file ?? sourceNode.trace.file ?? null,
              line: sourceNode.trace.startLine ?? null,
              order: sourceNode.order,
              sectionStyle: "rvm",
              trace: structuredClone(sourceNode.trace)
            }
          }
        },
        sourceNodeIds: [sourceNode.id],
        meta
      });
    }
  };
}

function isNativeSemanticWtomlNode(node) {
  return node.kind === "wtoml.doc"
    && node.semantic
    && node.meta?.sourceCategory === "semantic"
    && node.meta?.desireBoundary === "desire-kernel";
}

function normalizeSemanticNode(node, versionFieldsByName) {
  const semantic = node.semantic;
  if (!semantic) return [];
  switch (semantic.kind) {
    case "context":
      return [createDesireNode({
        kind: "context",
        name: semantic.name,
        body: {
          parent: semantic.parent ?? null,
          actor: semantic.actor ?? null,
          label: semantic.label ?? null,
          owner: semantic.owner ?? null,
          stewards: semantic.stewards ?? [],
          capabilities: semantic.capabilities ?? []
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "capability":
      return [createDesireNode({
        kind: "capability",
        name: semantic.name,
        body: {
          verbs: semantic.verbs ?? [],
          scope: semantic.scope ?? [],
          provides: semantic.provides ?? [],
          source: semantic.source ?? null,
          state: semantic.state ?? null,
          driver: semantic.driver ?? null,
          actor: semantic.actor ?? null,
          label: semantic.label ?? null,
          version: semantic.version ?? null,
          provenance: semantic.provenance ?? null,
          dependsOn: semantic.dependsOn ?? [],
          publicApi: semantic.publicApi ?? [],
          config: semantic.config ?? [],
          internals: semantic.internals ?? [],
          authority: semantic.authority ?? [],
          providerAdapters: semantic.providerAdapters ?? [],
          witnessContract: semantic.witnessContract ?? null,
          compatibility: semantic.compatibility ?? null,
          placement: semantic.placement ?? [],
          context: semantic.context ?? null,
          owner: semantic.owner ?? null
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "message":
      return [createDesireNode({
        kind: "message",
        name: semantic.name,
        body: {
          fields: semantic.fields ?? [],
          role: semantic.role ?? null,
          schema: semantic.schema ?? null,
          writes: semantic.writes ?? {},
          messageKind: semantic.messageKind ?? null,
          route: semantic.route ?? null,
          requestSchema: semantic.requestSchema ?? null,
          responseSchema: semantic.responseSchema ?? null,
          requestState: semantic.requestState ?? null,
          loadingState: semantic.loadingState ?? null,
          successEvent: semantic.successEvent ?? null,
          failureEvent: semantic.failureEvent ?? null,
          refreshRuntime: semantic.refreshRuntime ?? null,
          sequence: semantic.sequence ?? null,
          boundary: semantic.boundary ?? null,
          steps: semantic.steps ?? [],
          actor: semantic.actor ?? null,
          process: semantic.process ?? null,
          inputs: semantic.inputs ?? [],
          outputs: semantic.outputs ?? [],
          owner: semantic.owner ?? null
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "entity":
      return [createDesireNode({
        kind: "entity",
        name: semantic.name,
        body: {
          context: semantic.context ?? null,
          store: semantic.store ?? null,
          identity: semantic.identity ?? null,
          version: semantic.version ?? (semantic.versionRef ? (versionFieldsByName.get(semantic.versionRef) ?? "version") : null),
          fields: semantic.fields ?? [],
          role: semantic.role ?? null,
          actor: semantic.actor ?? null,
          author: semantic.author ?? null,
          label: semantic.label ?? null,
          username: semantic.username ?? null,
          password: semantic.password ?? null,
          homeContext: semantic.homeContext ?? null,
          homePerspective: semantic.homePerspective ?? null,
          owner: semantic.owner ?? null
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "graph":
      return [createDesireNode({
        kind: "graph",
        name: semantic.name,
        body: {
          graphKind: semantic.graphKind ?? null,
          from: semantic.from ?? null,
          to: semantic.to ?? null,
          nodeType: semantic.nodeType ?? null,
          edgeType: semantic.edgeType ?? null,
          schemaType: semantic.schemaType ?? null,
          fields: semantic.fields ?? [],
          props: semantic.props ?? {}
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "process":
      return [createDesireNode({
        kind: "process",
        name: semantic.name,
        body: {
          state: semantic.state ?? [],
          handles: semantic.handles ?? [],
          emits: semantic.emits ?? [],
          rules: semantic.rules ?? []
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "boundary":
      return [createDesireNode({
        kind: "boundary",
        name: semantic.name,
        body: {
          capabilities: semantic.capabilities ?? [],
          operations: semantic.operations ?? []
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "collection":
      return [createDesireNode({
        kind: "collection",
        name: semantic.name,
        body: {
          id: semantic.name
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "store":
      return [createDesireNode({
        kind: "store",
        name: semantic.name,
        body: {
          storeKind: semantic.storeKind ?? null,
          context: semantic.context ?? null,
          owner: semantic.owner ?? null,
          entity: semantic.entity ?? null,
          props: semantic.props ?? {}
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "actor":
      return normalizeActorSemanticNode(node, semantic);
    case "policy":
      return [createDesireNode({
        kind: "policy",
        name: semantic.name,
        body: {
          subject: semantic.subject ?? null,
          initialState: semantic.initialState ?? null,
          stateField: semantic.stateField ?? null,
          readyState: semantic.readyState ?? null,
          disagreementState: semantic.disagreementState ?? null,
          disagreementOutcomes: semantic.disagreementOutcomes ?? {},
          policyOutcomes: semantic.policyOutcomes ?? {}
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "projection":
      return [createDesireNode({
        kind: "projection",
        name: semantic.name,
        body: {
          projectionKind: semantic.projectionKind ?? null,
          source: semantic.source ?? null,
          props: semantic.props ?? {}
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "surface":
      return [createDesireNode({
        kind: "surface",
        name: semantic.name,
        body: {
          ...(semantic.context ? { context: semantic.context } : {}),
          surfaceKind: semantic.surfaceKind ?? null,
          className: semantic.className ?? null,
          children: semantic.children ?? [],
          props: semantic.props ?? {},
          processRef: semantic.processRef ?? null,
          projectionRefs: semantic.projectionRefs ?? [],
          capabilityRefs: semantic.capabilityRefs ?? [],
          bindings: semantic.bindings ?? [],
          interactions: semantic.interactions ?? [],
          repeat: semantic.repeat ?? null,
          ...(semantic.surfaceKind === "chart"
            ? {
                modelRef: semantic.modelRef ?? null,
                frame: semantic.frame ?? null,
                encoding: semantic.encoding ?? {},
                editable: semantic.editable ?? [],
                layers: semantic.layers ?? []
              }
            : {})
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "dataflow":
      return [createDesireNode({
        kind: "dataflow",
        name: semantic.name,
        body: {
          axes: semantic.axes ?? [],
          params: semantic.params ?? [],
          derives: semantic.derives ?? [],
          reduces: semantic.reduces ?? []
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "state":
      return [createDesireNode({
        kind: "type",
        name: semantic.name,
        body: {
          valueType: semantic.valueType ?? null,
          initial: semantic.initial ?? null,
          role: "state"
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    case "type":
      return [createDesireNode({
        kind: "type",
        name: semantic.name,
        body: {
          role: semantic.role ?? null,
          field: semantic.field ?? null,
          versionKind: semantic.versionKind ?? null,
          actor: semantic.actor ?? null,
          label: semantic.label ?? null,
          editor: semantic.editor ?? null,
          compatibleWith: semantic.compatibleWith ?? [],
          cases: semantic.cases ?? [],
          owner: semantic.owner ?? null
        },
        sourceNodeIds: [node.id],
        meta: semanticMeta(node)
      })];
    default:
      return [];
  }
}

function normalizeActorSemanticNode(node, semantic) {
  const nodes = [];
  const entity = semantic.entity ?? semantic.owns ?? null;
  const storeName = semantic.durableState ?? null;
  if (storeName) {
    nodes.push(createDesireNode({
      kind: "store",
      name: storeName,
      body: {
        storeKind: "durable",
        context: semantic.collectionContext ?? null,
        owner: semantic.name ?? null,
        entity,
        props: compactObject({
          root: semantic.root ?? null,
          target: semantic.target ?? null
        })
      },
      sourceNodeIds: [node.id],
      meta: semanticMeta(node)
    }));
  }
  if (semantic.listProjection) {
    nodes.push(createDesireNode({
      kind: "projection",
      name: semantic.listProjection,
      body: {
        projectionKind: "list",
        source: storeName ?? entity ?? semantic.collectionContext ?? null,
        props: compactObject({ actor: semantic.name ?? null, entity, context: semantic.collectionContext ?? null })
      },
      sourceNodeIds: [node.id],
      meta: semanticMeta(node)
    }));
  }
  if (semantic.detailProjection) {
    nodes.push(createDesireNode({
      kind: "projection",
      name: semantic.detailProjection,
      body: {
        projectionKind: "detail",
        source: storeName ?? entity ?? semantic.collectionContext ?? null,
        props: compactObject({ actor: semantic.name ?? null, entity, context: semantic.collectionContext ?? null })
      },
      sourceNodeIds: [node.id],
      meta: semanticMeta(node)
    }));
  }
  return nodes;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined)
  );
}

function semanticMeta(node) {
  return {
    provenance: {
      sourceLanguage: node.trace?.sourceLanguage ?? null,
      file: node.trace?.file ?? null,
      startLine: node.trace?.startLine ?? null,
      startColumn: node.trace?.startColumn ?? 1,
      endLine: node.trace?.endLine ?? node.trace?.startLine ?? null,
      endColumn: node.trace?.endColumn ?? null,
      sourceKind: node.trace?.sourceKind ?? node.kind,
      originNodeId: node.trace?.originNodeId ?? null,
      via: Array.isArray(node.trace?.via) ? [...node.trace.via] : []
    }
  };
}
