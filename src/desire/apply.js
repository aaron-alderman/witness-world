import { thing, relation, createThing, cloneThing, transferOwnership } from "../kernel.js";
import {
  defineContext,
  ensureCapabilityDefinition,
  installCapability,
  defineCapability,
  moduleProjectors,
  createIdentity,
  defineAuthRole,
  grantIdentityRole,
  revokeIdentityRole,
  setAppFeatureAccessPolicy,
  definePerspective,
  grantStewardship,
  revokeStewardship,
  createProposal,
  bindContextName,
  exportContextName,
  importContextName,
  validateContextBinding,
  validateContextExport,
  validateContextImport,
  resolveContextualRef,
  removeCapability,
  createCompiler,
  createDescription,
  compileDescription,
  installRuntimePlugin,
  removeRuntimePlugin,
  createServerRunner,
  defineRoute,
  serveRoute,
  createFrontendRunner,
  createViewDescription,
  renderView,
  emitUserAction
} from "../modules.js";
import {
  defineTrait,
  defineValueType,
  defineProcessSpec
} from "../type-model.js";
import {
  defineWidget,
  defineWidgetVersion,
  defineWidgetVersionTransition,
  activateWidgetVersion,
  attachWidget,
  defineFrontendProgram,
  defineFrontendStep
} from "../widgets.js";
import {
  defineBackendProgram,
  defineBackendProgramVersion,
  defineBackendProgramVersionTransition,
  defineBackendStep,
  activateBackendProgramVersion
} from "../backend-programs.js";
import { validateDesireDocument } from "./ir.js";

const NATIVE_WTOML_DOC_KINDS = new Set([
  "context",
  "capability",
  "trait",
  "valueType",
  "processSpec",
  "identity"
]);

export const NATIVE_RUNTIME_DECLARATION_KINDS = new Set([
  "defaults",
  "app",
  "perspective",
  "contextBinding",
  "contextExport",
  "contextImport",
  "stewardship",
  "proposal",
  "thing",
  "relation",
  "compiler",
  "description",
  "compile",
  "capabilityInstall",
  "capabilityRemove",
  "runtimePluginInstall",
  "runtimePluginRemove",
  "serverRunner",
  "route",
  "serve",
  "authRole",
  "identityRoleGrant",
  "identityRoleRevoke",
  "appFeatureAccessPolicy",
  "widget",
  "widgetVersion",
  "widgetVersionTransition",
  "activateWidgetVersion",
  "attachWidget",
  "fragment",
  "page",
  "box",
  "section",
  "header",
  "heading",
  "paragraph",
  "small",
  "text",
  "label",
  "form",
  "input",
  "textarea",
  "select",
  "option",
  "details",
  "summary",
  "valueEditor",
  "button",
  "link",
  "list",
  "frontendProgram",
  "frontendStep",
  "step",
  "backendProgram",
  "backendProgramVersion",
  "backendProgramVersionTransition",
  "backendStep",
  "activateBackendProgramVersion",
  "clone",
  "transfer",
  "frontendRunner",
  "view",
  "render",
  "action"
]);

export const RUNTIME_DECLARATION_BRIDGE_POLICY = Object.freeze({
  nodeKind: "runtime.declaration",
  legacyNodeKind: "runtime.doc",
  kernelResident: false,
  residualHome: "desire+",
  executionBoundary: "runtime-boundary"
});

export const NATIVE_RUNTIME_DOC_KINDS = NATIVE_RUNTIME_DECLARATION_KINDS;
export const RUNTIME_DOC_BRIDGE_POLICY = RUNTIME_DECLARATION_BRIDGE_POLICY;

export function createRuntimeDeclarationRegistry(entries = []) {
  const declarations = new Map();
  const registry = {
    register(kind, entry = {}) {
      if (typeof kind !== "string" || !kind.trim()) throw new Error("runtime declaration kind must be a non-empty string");
      declarations.set(kind, {
        kind,
        apply: typeof entry.apply === "function" ? entry.apply : null,
        nativeCoverage: entry.nativeCoverage ?? "registered",
        extension: entry.extension ?? null
      });
      return registry;
    },
    has(kind) {
      return declarations.has(kind);
    },
    get(kind) {
      return declarations.get(kind) ?? null;
    },
    entries() {
      return [...declarations.values()];
    },
    kinds() {
      return [...declarations.keys()];
    }
  };
  for (const entry of entries) {
    if (typeof entry === "string") registry.register(entry);
    else registry.register(entry.kind, entry);
  }
  return registry;
}

export function createCoreRuntimeDeclarationRegistry() {
  const registry = createRuntimeDeclarationRegistry();
  for (const kind of NATIVE_RUNTIME_DECLARATION_KINDS) {
    registry.register(kind, {
      apply: applyCoreRuntimeDeclaration,
      nativeCoverage: "first-class"
    });
  }
  return registry;
}

function resolveRuntimeDeclarationRegistry(registry) {
  if (!registry) return createCoreRuntimeDeclarationRegistry();
  if (typeof registry.get === "function" && typeof registry.has === "function") return registry;
  throw new Error("runtimeDeclarationRegistry must provide get(kind) and has(kind)");
}

export function auditRuntimeDeclarationBridge(desire, options = {}) {
  const validatedDesire = validateDesireDocument(desire);
  const runtimeDeclarationRegistry = resolveRuntimeDeclarationRegistry(options.runtimeDeclarationRegistry);
  const audit = {
    policy: RUNTIME_DECLARATION_BRIDGE_POLICY,
    total: 0,
    canonicalResiduals: 0,
    legacyResiduals: 0,
    registered: 0,
    unsupported: 0,
    registeredWithoutHandler: 0,
    nativeCovered: 0,
    legacyRequired: 0,
    byKind: {},
    byResidualKind: {}
  };
  for (const node of validatedDesire.runtimeResiduals.filter(isRuntimeDeclarationResidual)) {
    const kind = runtimeDeclarationKind(node);
    const registration = runtimeDeclarationRegistry.get(kind);
    const registered = Boolean(registration);
    const hasHandler = typeof registration?.apply === "function";
    const covered = registered && hasHandler;
    const residualKind = node.kind;
    const residualHome = node.meta?.residualHome ?? RUNTIME_DECLARATION_BRIDGE_POLICY.residualHome;
    audit.total += 1;
    audit.byResidualKind[residualKind] = (audit.byResidualKind[residualKind] ?? 0) + 1;
    if (residualKind === RUNTIME_DECLARATION_BRIDGE_POLICY.nodeKind) audit.canonicalResiduals += 1;
    if (residualKind === RUNTIME_DECLARATION_BRIDGE_POLICY.legacyNodeKind) audit.legacyResiduals += 1;
    if (registered) audit.registered += 1;
    else audit.unsupported += 1;
    if (registered && !hasHandler) audit.registeredWithoutHandler += 1;
    if (covered) audit.nativeCovered += 1;
    if (!covered) audit.legacyRequired += 1;
    if (!audit.byKind[kind]) {
      audit.byKind[kind] = {
        total: 0,
        canonicalResiduals: 0,
        legacyResiduals: 0,
        registered,
        unsupported: !registered,
        registeredWithoutHandler: registered && !hasHandler,
        nativeCovered: covered,
        nativeCoverage: covered ? registration.nativeCoverage : (registered ? "registered-without-handler" : "unregistered"),
        legacyRequired: !covered,
        kernelResident: false,
        residualHome
      };
    }
    audit.byKind[kind].total += 1;
    if (residualKind === RUNTIME_DECLARATION_BRIDGE_POLICY.nodeKind) audit.byKind[kind].canonicalResiduals += 1;
    if (residualKind === RUNTIME_DECLARATION_BRIDGE_POLICY.legacyNodeKind) audit.byKind[kind].legacyResiduals += 1;
  }
  return audit;
}

export function auditRuntimeDocBridge(desire, options = {}) {
  return auditRuntimeDeclarationBridge(desire, options);
}

export function assertNoLegacyRuntimeDeclarationFallbackRequired(desire, options = {}) {
  const validatedDesire = validateDesireDocument(desire);
  const runtimeDeclarationRegistry = resolveRuntimeDeclarationRegistry(options.runtimeDeclarationRegistry);
  const runtimeNodes = validatedDesire.runtimeResiduals
    .filter(isRuntimeDeclarationResidual)
    .sort(compareRuntimeResidualOrder);
  for (const doc of prepareRuntimeDeclarations(runtimeNodes)) {
    const registration = runtimeDeclarationRegistry.get(doc.kind);
    if (!registration) throw createUnsupportedRuntimeDeclarationError(doc);
    if (typeof registration.apply !== "function") throw createRegisteredRuntimeDeclarationMissingHandlerError(doc);
  }
  return auditRuntimeDeclarationBridge(validatedDesire, options);
}

export function assertNoLegacyRuntimeDocFallbackRequired(desire, options = {}) {
  return assertNoLegacyRuntimeDeclarationFallbackRequired(desire, options);
}

const WIDGET_KIND_BY_SECTION = new Map([
  ["fragment", "Fragment"],
  ["page", "Page"],
  ["box", "Box"],
  ["section", "Section"],
  ["header", "Header"],
  ["heading", "Heading"],
  ["paragraph", "Paragraph"],
  ["small", "Small"],
  ["text", "Text"],
  ["label", "Label"],
  ["form", "Form"],
  ["input", "Input"],
  ["textarea", "Textarea"],
  ["select", "Select"],
  ["option", "Option"],
  ["details", "Details"],
  ["summary", "Summary"],
  ["valueEditor", "ValueEditor"],
  ["button", "Button"],
  ["link", "Link"],
  ["list", "List"]
]);

export function applyDesire(world, desire, options = {}) {
  const validatedDesire = validateDesireDocument(desire);
  const runtimeDeclarationRegistry = resolveRuntimeDeclarationRegistry(options.runtimeDeclarationRegistry);
  const runtimeNodes = validatedDesire.runtimeResiduals
    .filter(isRuntimeDeclarationResidual)
    .sort(compareRuntimeResidualOrder);
  const runtimeNodesBySourceNodeId = indexRuntimeNodesBySourceNodeId(runtimeNodes);
  const handledRuntimeNodeIds = new Set();
  const witnesses = [];

  for (const node of validatedDesire.nodes) {
    const applied = applyNativeSemanticNode(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds);
    if (Array.isArray(applied)) witnesses.push(...applied.filter(Boolean));
    else if (applied) witnesses.push(applied);
  }

  const preparedRuntimeDeclarations = prepareRuntimeDeclarations(runtimeNodes);
  for (const doc of preparedRuntimeDeclarations) {
    if (handledRuntimeNodeIds.has(doc.nodeId)) continue;
    const registration = runtimeDeclarationRegistry.get(doc.kind);
    if (!registration) {
      throw createUnsupportedRuntimeDeclarationError(doc);
    }
    if (typeof registration.apply !== "function") {
      throw createRegisteredRuntimeDeclarationMissingHandlerError(doc);
    }
    const applied = registration.apply(world, doc, { runtimeDeclarationRegistry });
    if (applied) {
      handledRuntimeNodeIds.add(doc.nodeId);
      if (Array.isArray(applied)) witnesses.push(...applied.filter(Boolean));
      else witnesses.push(applied);
      continue;
    }
    throw new Error(`runtime declaration application failed for ${describeRuntimeDeclaration(doc)}`);
  }

  return witnesses;
}

function compareRuntimeResidualOrder(a, b) {
  const orderA = Number(a.body.order ?? 0);
  const orderB = Number(b.body.order ?? 0);
  return orderA - orderB || String(a.id).localeCompare(String(b.id));
}

export function applyDesireNativeOnly(world, desire, options = {}) {
  assertNoLegacyRuntimeDeclarationFallbackRequired(desire, options);
  return applyDesire(world, desire, options);
}

function indexRuntimeNodesBySourceNodeId(runtimeNodes) {
  const map = new Map();
  for (const node of runtimeNodes) {
    for (const sourceNodeId of node.sourceNodeIds ?? []) {
      if (!sourceNodeId) continue;
      if (!map.has(sourceNodeId)) map.set(sourceNodeId, []);
      map.get(sourceNodeId).push(node);
    }
  }
  return map;
}

function applyNativeSemanticNode(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds) {
  switch (node.kind) {
    case "context":
      return applyNativeWtomlContext(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds)
        || applyGenericSemanticDefinition(world, node);
    case "capability":
      return applyNativeWtomlCapability(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds)
        || applyGenericSemanticDefinition(world, node);
    case "type":
      if (node.body?.role === "trait") {
        return applyNativeWtomlTrait(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds);
      }
      if (node.body?.role === "valueType") {
        return applyNativeWtomlValueType(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds);
      }
      return applyGenericSemanticDefinition(world, node);
    case "message":
      if (node.body?.role === "processSpec") {
        return applyNativeWtomlProcessSpec(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds);
      }
      return applyGenericSemanticDefinition(world, node);
    case "entity":
      return applyNativeWtomlIdentity(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds)
        || applyGenericSemanticDefinition(world, node);
      case "process":
      case "boundary":
      case "collection":
      case "store":
      case "graph":
      case "projection":
    case "policy":
    case "surface":
    case "dataflow":
      return applyGenericSemanticDefinition(world, node);
    default:
      return [];
  }
}

function applyNativeWtomlContext(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds) {
  const native = nativeWtomlValues(node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds, "context");
  if (!native) return null;
  const { values, runtimeNode } = native;
  const id = String(values.id ?? node.name ?? "");
  const actor = String(values.actor ?? id ?? "system");
  const owner = String(values.owner ?? actor);
  const stewards = values.stewards ?? values.initialStewards ?? [];
  const capabilities = Array.isArray(values.capabilities) ? [...values.capabilities] : [];

  const witnesses = [
    defineContext(world, {
      actor,
      id,
      label: values.label ?? id,
      parent: values.parent ?? node.body.parent ?? null,
      owner,
      stewards
    }),
    world.emit({
      process: "context.define",
      actor,
      claims: [],
      body: {
        id,
        label: String(values.label ?? id),
        actor,
        owner,
        parent: values.parent ?? node.body.parent ?? null,
        stewards: Array.isArray(stewards) ? [...stewards] : [],
        capabilities
      }
    })
  ];

  for (const capability of capabilities) {
    ensureCapabilityDefinition(world, {
      actor,
      id: capability,
      label: capability,
      provenance: { source: "dsl.context.capabilities" },
      placement: ["context"]
    });
    witnesses.push(installCapability(world, {
      actor,
      capability,
      target: id,
      targetKind: "context"
    }));
  }

  const annotation = emitNativeWtomlSourceAnnotation(world, runtimeNode, node, id, actor);
  if (annotation) witnesses.push(annotation);
  return witnesses.filter(Boolean);
}

function applyNativeWtomlCapability(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds) {
  const native = nativeWtomlValues(node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds, "capability");
  if (!native) return null;
  const { values, runtimeNode } = native;
  const actor = String(values.actor ?? "system");
  const id = String(values.id ?? node.name ?? "");
  const witness = defineCapability(world, {
    actor,
    id,
    label: values.label ?? id,
    version: values.version ?? null,
    provenance: values.provenance ?? null,
    dependsOn: values.dependsOn ?? [],
    publicApi: values.publicApi ?? [],
    config: values.config ?? [],
    internals: values.internals ?? [],
    authority: values.authority ?? [],
    providerAdapters: values.providerAdapters ?? [],
    witnessContract: values.witnessContract ?? null,
    placement: values.placement ?? [],
    context: values.context ?? null,
    owner: values.owner ?? actor
  });
  const annotation = emitNativeWtomlSourceAnnotation(world, runtimeNode, node, id, actor);
  return [witness, annotation].filter(Boolean);
}

function applyNativeWtomlTrait(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds) {
  const native = nativeWtomlValues(node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds, "trait");
  if (!native) return null;
  const { values, runtimeNode } = native;
  const actor = String(values.actor ?? "system");
  const id = String(values.id ?? node.name ?? "");
  const witness = defineTrait(world, {
    actor,
    id,
    label: values.label ?? id,
    owner: values.owner ?? actor
  });
  const annotation = emitNativeWtomlSourceAnnotation(world, runtimeNode, node, id, actor);
  return [witness, annotation].filter(Boolean);
}

function applyNativeWtomlValueType(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds) {
  const native = nativeWtomlValues(node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds, "valueType");
  if (!native) return null;
  const { values, runtimeNode } = native;
  const actor = String(values.actor ?? "system");
  const id = String(values.id ?? node.name ?? "");
  const witness = defineValueType(world, {
    actor,
    id,
    label: values.label ?? id,
    editor: values.editor ?? null,
    compatibleWith: values.compatibleWith ?? [],
    owner: values.owner ?? actor
  });
  const annotation = emitNativeWtomlSourceAnnotation(world, runtimeNode, node, id, actor);
  return [witness, annotation].filter(Boolean);
}

function applyNativeWtomlProcessSpec(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds) {
  const native = nativeWtomlValues(node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds, "processSpec");
  if (!native) return null;
  const { values, runtimeNode } = native;
  const actor = String(values.actor ?? "system");
  const id = String(values.id ?? node.name ?? "");
  const witness = defineProcessSpec(world, {
    actor,
    id,
    process: String(values.process ?? id),
    inputs: values.inputs ?? [],
    outputs: values.outputs ?? [],
    owner: values.owner ?? actor
  });
  const annotation = emitNativeWtomlSourceAnnotation(world, runtimeNode, node, id, actor);
  return [witness, annotation].filter(Boolean);
}

function applyNativeWtomlIdentity(world, node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds) {
  const native = nativeWtomlValues(node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds, "identity");
  if (!native) return null;
  const { values, runtimeNode } = native;
  const contextActor = typeof values.context === "string"
    ? (world.project(moduleProjectors.contexts).find(row => row.id === values.context)?.actor ?? null)
    : null;
  const identityActor = String(values.actor ?? "");
  const authorActor = String(values.author ?? contextActor ?? identityActor ?? "system");
  const id = String(values.id ?? node.name ?? "");
  const witness = createIdentity(world, {
    actor: authorActor,
    id,
    identityActor,
    label: String(values.label ?? id),
    username: String(values.username ?? ""),
    password: String(values.password ?? ""),
    displayName: values.displayName ?? null,
    jobTitle: values.jobTitle ?? null,
    initials: values.initials ?? null,
    homeContext: values.homeContext ?? null,
    homePerspective: values.homePerspective ?? null,
    owner: values.owner ?? authorActor
  });
  const annotation = emitNativeWtomlSourceAnnotation(world, runtimeNode, node, id, authorActor);
  return [witness, annotation].filter(Boolean);
}

function applyGenericSemanticDefinition(world, node) {
  const name = typeof node.name === "string" && node.name.trim() ? node.name.trim() : null;
  if (!name) return [];
  const actor = "system";
  const claims = [
    thing(name),
    relation(actor, "owns", name),
    relation(name, "hasModuleKind", genericModuleKindForNode(node))
  ];

  if (node.kind === "context" && node.body?.parent) {
    claims.push(relation(name, "parentContext", node.body.parent));
  }
  if (node.kind === "context") {
    for (const capability of node.body?.capabilities ?? []) {
      if (capability) claims.push(relation(name, "declaresCapability", capability));
    }
  }
  if (node.kind === "entity" && node.body?.context) {
    claims.push(relation(name, "inContext", node.body.context));
  }
  if (node.kind === "entity" && node.body?.store) {
    claims.push(relation(name, "usesStore", node.body.store));
  }
  if (node.kind === "entity" && node.body?.identity) {
    claims.push(relation(name, "identityField", node.body.identity));
  }
  if (node.kind === "entity" && node.body?.version) {
    claims.push(relation(name, "versionField", node.body.version));
  }
  if (node.kind === "graph") {
    const graphKind = node.body?.graphKind ?? null;
    if (graphKind) claims.push(relation(name, "graphKind", graphKind));
    if (node.body?.from) claims.push(relation(name, "graphFrom", node.body.from));
    if (node.body?.to) claims.push(relation(name, "graphTo", node.body.to));
    if (node.body?.nodeType) claims.push(relation(name, "graphNodeType", node.body.nodeType));
    if (node.body?.edgeType) claims.push(relation(name, "graphEdgeType", node.body.edgeType));
    if (node.body?.schemaType) claims.push(relation(name, "graphSchemaType", node.body.schemaType));
    for (const field of node.body?.fields ?? []) {
      if (!field?.name) continue;
      const fieldId = `${name}.${field.name}`;
      claims.push(
        thing(fieldId),
        relation(name, "hasField", fieldId),
        relation(fieldId, "fieldOf", name)
      );
      if (field.type) claims.push(relation(fieldId, "fieldType", field.type));
    }
  }
  if (node.kind === "type") {
    if (node.body?.role) claims.push(relation(name, "typeRole", node.body.role));
    if (node.body?.field) claims.push(relation(name, "typeField", node.body.field));
    if (node.body?.versionKind) claims.push(relation(name, "versionKind", node.body.versionKind));
    for (const typeCase of node.body?.cases ?? []) {
      if (typeCase) claims.push(relation(name, "hasCase", typeCase));
    }
  }
  if (node.kind === "message") {
    if (node.body?.role) claims.push(relation(name, "messageRole", node.body.role));
    if (node.body?.schema) claims.push(relation(name, "usesSchema", node.body.schema));
    if (node.body?.process) claims.push(relation(name, "belongsToProcess", node.body.process));
    for (const field of node.body?.fields ?? []) {
      if (!field?.name) continue;
      const fieldId = `${name}.${field.name}`;
      claims.push(
        thing(fieldId),
        relation(name, "hasField", fieldId),
        relation(fieldId, "fieldOf", name)
      );
      if (field.type) claims.push(relation(fieldId, "fieldType", field.type));
    }
  }
  if (node.kind === "store") {
    if (node.body?.context) claims.push(relation(name, "inContext", node.body.context));
    if (node.body?.owner) {
      claims.push(relation(name, "ownedByProcess", node.body.owner));
      claims.push(relation(node.body.owner, "usesStore", name));
    }
    if (node.body?.entity) claims.push(relation(name, "storesEntity", node.body.entity));
  }
  if (node.kind === "process") {
    for (const state of node.body?.state ?? []) {
      if (state) claims.push(relation(name, "hasState", state));
    }
    for (const handled of node.body?.handles ?? []) {
      if (handled) claims.push(relation(name, "handlesMessage", handled));
    }
    for (const emitted of node.body?.emits ?? []) {
      if (emitted) claims.push(relation(name, "emitsMessage", emitted));
    }
  }
  if (node.kind === "capability") {
    for (const verb of node.body?.verbs ?? []) {
      if (verb) claims.push(relation(name, "supportsVerb", verb));
    }
    for (const scopeTarget of node.body?.scope ?? []) {
      if (scopeTarget) claims.push(relation(name, "inContext", scopeTarget));
    }
    for (const provided of node.body?.provides ?? []) {
      if (provided) claims.push(relation(name, "providesCapability", provided));
    }
    for (const dependency of node.body?.dependsOn ?? []) {
      if (dependency) claims.push(relation(name, "dependsOnCapability", dependency));
    }
    for (const api of node.body?.publicApi ?? []) {
      if (api) claims.push(relation(name, "exposesApi", api));
    }
    for (const adapter of node.body?.providerAdapters ?? []) {
      if (adapter) claims.push(relation(name, "usesProviderAdapter", adapter));
    }
    for (const placement of node.body?.placement ?? []) {
      if (placement) claims.push(relation(name, "placedIn", placement));
    }
    if (node.body?.source) claims.push(relation(name, "capabilitySource", node.body.source));
    if (node.body?.state) claims.push(relation(name, "capabilityState", node.body.state));
    if (node.body?.driver) claims.push(relation(name, "capabilityDriver", node.body.driver));
    if (node.body?.witnessContract) claims.push(relation(name, "hasWitnessContract", node.body.witnessContract));
  }
  if (node.kind === "boundary") {
    for (const capability of node.body?.capabilities ?? []) {
      if (capability) claims.push(relation(name, "dependsOnCapability", capability));
    }
    for (const [index, operation] of (node.body?.operations ?? []).entries()) {
      const operationId = boundaryOperationId(name, operation, index);
      if (operationId) {
        claims.push(
          thing(operationId),
          relation(name, "hasOperation", operationId),
          relation(operationId, "operationOf", name)
        );
      }
      if (operation?.capability) claims.push(relation(name, "dependsOnCapability", operation.capability));
      if (operation?.command) claims.push(relation(name, "handlesMessage", operation.command));
      if (operation?.query) claims.push(relation(name, "handlesMessage", operation.query));
      if (operation?.successEvent) claims.push(relation(name, "emitsMessage", operation.successEvent));
      if (operation?.failureEvent) claims.push(relation(name, "emitsMessage", operation.failureEvent));
      if (operation?.route) claims.push(relation(name, "routesTo", operation.route));
      if (operation?.hostOperation) claims.push(relation(name, "invokesHostOperation", operation.hostOperation));
      if (operationId) {
        if (operation?.capability) claims.push(relation(operationId, "dependsOnCapability", operation.capability));
        if (operation?.command) claims.push(relation(operationId, "handlesMessage", operation.command));
        if (operation?.query) claims.push(relation(operationId, "handlesMessage", operation.query));
        if (operation?.successEvent) claims.push(relation(operationId, "emitsMessage", operation.successEvent));
        if (operation?.failureEvent) claims.push(relation(operationId, "emitsMessage", operation.failureEvent));
        if (operation?.route) claims.push(relation(operationId, "routesTo", operation.route));
        if (operation?.transport) claims.push(relation(operationId, "usesTransport", operation.transport));
        if (operation?.kind) claims.push(relation(operationId, "operationKind", operation.kind));
        if (operation?.requestSchema) claims.push(relation(operationId, "requestSchema", operation.requestSchema));
        if (operation?.responseSchema) claims.push(relation(operationId, "responseSchema", operation.responseSchema));
        if (operation?.hostOperation) claims.push(relation(operationId, "invokesHostOperation", operation.hostOperation));
      }
    }
  }
  if (node.kind === "policy") {
    if (node.body?.subject) claims.push(relation(name, "governs", node.body.subject));
    if (node.body?.initialState) claims.push(relation(name, "initialPolicyState", node.body.initialState));
    if (node.body?.stateField) claims.push(relation(name, "policyStateField", node.body.stateField));
    if (node.body?.readyState) claims.push(relation(name, "readyPolicyState", node.body.readyState));
    if (node.body?.disagreementState) claims.push(relation(name, "disagreementPolicyState", node.body.disagreementState));
    for (const [outcome, state] of Object.entries(node.body?.policyOutcomes ?? {})) {
      const outcomeId = `${name}.policyOutcome.${outcome}`;
      claims.push(
        thing(outcomeId),
        relation(name, "hasPolicyOutcome", outcomeId),
        relation(outcomeId, "outcomeState", state)
      );
    }
    for (const [outcome, state] of Object.entries(node.body?.disagreementOutcomes ?? {})) {
      const outcomeId = `${name}.disagreementOutcome.${outcome}`;
      claims.push(
        thing(outcomeId),
        relation(name, "hasDisagreementOutcome", outcomeId),
        relation(outcomeId, "outcomeState", state)
      );
    }
  }
  if (node.kind === "projection") {
    if (node.body?.source) claims.push(relation(name, "projectsFrom", node.body.source));
    if (node.body?.projectionKind) claims.push(relation(name, "projectionKind", node.body.projectionKind));
  }
  if (node.kind === "surface") {
    if (node.body?.context) claims.push(relation(name, "inContext", node.body.context));
    if (node.body?.surfaceKind) claims.push(relation(name, "surfaceKind", node.body.surfaceKind));
    if (node.body?.className) claims.push(relation(name, "surfaceClass", node.body.className));
    if (node.body?.processRef) claims.push(relation(name, "surfaceProcess", node.body.processRef));
    for (const projection of node.body?.projectionRefs ?? []) {
      if (projection) claims.push(relation(name, "consumesProjection", projection));
    }
    for (const capability of node.body?.capabilityRefs ?? []) {
      if (capability) claims.push(relation(name, "dependsOnCapability", capability));
    }
    if (node.body?.repeat?.collection) claims.push(relation(name, "repeatsCollection", node.body.repeat.collection));
    if (node.body?.repeat?.template) claims.push(relation(name, "usesSurfaceTemplate", node.body.repeat.template));
    if (node.body?.modelRef) claims.push(relation(name, "visualizesDataflow", node.body.modelRef));
    for (const child of node.body?.children ?? []) {
      if (child) claims.push(relation(name, "hasChildSurface", child));
    }
    for (const [channel, spec] of Object.entries(node.body?.encoding ?? {})) {
      const channelId = semanticChildId(name, "encoding", channel);
      claims.push(
        thing(channelId),
        relation(name, "hasEncoding", channelId),
        relation(channelId, "encodingChannel", channel)
      );
      if (spec?.field) claims.push(relation(channelId, "encodesField", spec.field));
      if (Array.isArray(spec?.domain)) {
        for (const [index, value] of spec.domain.entries()) {
          claims.push(relation(channelId, "encodingDomainValue", String(value), { index }));
        }
      }
      if (spec?.label) claims.push(relation(channelId, "encodingLabel", spec.label));
    }
    for (const [index, layer] of (node.body?.layers ?? []).entries()) {
      const layerId = semanticChildId(name, "layer", layer?.name ?? index);
      claims.push(
        thing(layerId),
        relation(name, "hasLayer", layerId),
        relation(layerId, "layerOf", name)
      );
      if (layer?.name) claims.push(relation(layerId, "layerName", layer.name));
      if (layer?.mark) claims.push(relation(layerId, "layerMark", layer.mark));
      for (const over of layer?.over ?? []) {
        if (over) claims.push(relation(layerId, "layerOver", over));
      }
      for (const [key, value] of Object.entries(layer?.encode ?? {})) {
        if (value !== null && value !== undefined && value !== "") {
          claims.push(relation(layerId, "layerEncoding", String(value), { channel: key }));
        }
      }
    }
  }
  if (node.kind === "dataflow") {
    for (const [index, axis] of (node.body?.axes ?? []).entries()) {
      const axisId = semanticChildId(name, "axis", axis?.name ?? index);
      claims.push(
        thing(axisId),
        relation(name, "hasAxis", axisId),
        relation(axisId, "axisOf", name)
      );
      if (axis?.name) claims.push(relation(axisId, "axisName", axis.name));
      if (axis?.kind) claims.push(relation(axisId, "axisKind", axis.kind));
      for (const [argIndex, value] of (axis?.args ?? []).entries()) {
        claims.push(relation(axisId, "axisArg", String(value), { index: argIndex }));
      }
      for (const [valueIndex, value] of (axis?.values ?? []).entries()) {
        claims.push(relation(axisId, "axisValue", String(value), { index: valueIndex }));
      }
      if (axis?.from !== null && axis?.from !== undefined) claims.push(relation(axisId, "axisFrom", String(axis.from)));
    }
    for (const [index, param] of (node.body?.params ?? []).entries()) {
      const paramId = semanticChildId(name, "param", param?.name ?? index);
      claims.push(
        thing(paramId),
        relation(name, "hasParameter", paramId),
        relation(paramId, "parameterOf", name)
      );
      if (param?.name) claims.push(relation(paramId, "parameterName", param.name));
      if (param?.default !== null && param?.default !== undefined) claims.push(relation(paramId, "defaultValue", String(param.default)));
    }
    for (const [index, flow] of (node.body?.derives ?? []).entries()) {
      addDataflowOperationClaims(claims, name, "derive", flow, index);
    }
    for (const [index, flow] of (node.body?.reduces ?? []).entries()) {
      addDataflowOperationClaims(claims, name, "reduce", flow, index);
    }
  }

  return withSemanticSourceAnnotations(world, node, [name], actor, [
    world.emit({
      process: genericSemanticProcessForNode(node),
      actor,
      claims,
      body: { id: name, ...structuredClone(node.body ?? {}) }
    })
  ]);
}

function boundaryOperationId(boundaryName, operation, index) {
  const suffix = operation?.name
    ?? operation?.command
    ?? operation?.query
    ?? operation?.route
    ?? operation?.capability
    ?? index;
  if (suffix === null || suffix === undefined || suffix === "") return null;
  return `${boundaryName}.operation.${String(suffix).replace(/[^A-Za-z0-9_.:-]+/g, "_")}`;
}

function addDataflowOperationClaims(claims, dataflowName, operationKind, flow, index) {
  const operationId = semanticChildId(dataflowName, operationKind, flow?.name ?? index);
  claims.push(
    thing(operationId),
    relation(dataflowName, operationKind === "derive" ? "hasDerive" : "hasReduce", operationId),
    relation(operationId, "dataflowOperationOf", dataflowName),
    relation(operationId, "dataflowOperationKind", operationKind)
  );
  if (flow?.name) claims.push(relation(operationId, "operationName", flow.name));
  if (flow?.expr) claims.push(relation(operationId, "operationExpr", flow.expr));
  for (const over of flow?.over ?? []) {
    if (over) claims.push(relation(operationId, "operationOver", over));
  }
}

function semanticChildId(parent, kind, child) {
  return `${parent}.${kind}.${String(child).replace(/[^A-Za-z0-9_.:-]+/g, "_")}`;
}

function genericModuleKindForNode(node) {
  if (node.kind === "graph") {
    switch (node.body?.graphKind) {
      case "node": return "graphNode";
      case "edge": return "graphEdge";
      case "entityType": return "graphEntityType";
      case "edgeType": return "graphEdgeType";
      default: return "graph";
    }
  }
  if (node.kind === "type") return "type";
  return node.kind;
}

function genericSemanticProcessForNode(node) {
  switch (node.kind) {
    case "context": return "desire.defineContext";
    case "capability": return "desire.defineCapability";
    case "type": return "desire.defineType";
    case "message": return "desire.defineMessage";
    case "entity": return "desire.defineEntity";
    case "graph": return "desire.defineGraph";
    case "process": return "desire.defineProcess";
    case "boundary": return "desire.defineBoundary";
    case "collection": return "desire.defineCollection";
    case "store": return "desire.defineStore";
    case "projection": return "desire.defineProjection";
    case "policy": return "desire.definePolicy";
    case "surface": return "desire.defineSurface";
    default: return `desire.define.${node.kind}`;
  }
}

function findCompanionRuntimeNode(node, runtimeNodesBySourceNodeId, expectedDocKind) {
  for (const sourceNodeId of node.sourceNodeIds ?? []) {
    const candidates = runtimeNodesBySourceNodeId.get(sourceNodeId) ?? [];
    const match = candidates.find(candidate =>
      runtimeDeclarationKind(candidate) === expectedDocKind
      && NATIVE_WTOML_DOC_KINDS.has(runtimeDeclarationKind(candidate))
    );
    if (match) return match;
  }
  return null;
}

function nativeWtomlValues(node, runtimeNodesBySourceNodeId, handledRuntimeNodeIds, expectedDocKind) {
  const runtimeNode = findCompanionRuntimeNode(node, runtimeNodesBySourceNodeId, expectedDocKind);
  if (runtimeNode) {
    if (runtimeNode.body.sourceLanguage !== "wtoml") return null;
    handledRuntimeNodeIds.add(runtimeNode.id);
    return { values: structuredClone(runtimeNode.body.values ?? {}), runtimeNode };
  }
  if (node.meta?.provenance?.sourceLanguage !== "wtoml") return null;
  if (node.meta?.provenance?.sourceKind !== expectedDocKind) return null;
  return { values: structuredClone(node.body ?? {}), runtimeNode: null };
}

function emitNativeWtomlSourceAnnotation(world, runtimeNode, semanticNode, target, actor) {
  if (runtimeNode) return emitSourceAnnotation(world, runtimeNode, target, actor);
  return emitSourceAnnotationFromSemanticNode(world, semanticNode, target, actor);
}

function emitSourceAnnotation(world, runtimeNode, target, actor) {
  const file = runtimeNode.body.file ?? null;
  if (!file || !target) return null;
  const trace = runtimeNode.body.trace ?? {};
  const section = runtimeDeclarationKind(runtimeNode);
  const fileId = `source:${file}`;
  return world.emit({
    process: "dsl.source.annotate",
    actor,
    claims: [
      thing(fileId),
      relation(fileId, "hasModuleKind", "sourceFile"),
      relation(target, "definedIn", fileId, { section })
    ],
    body: {
      target,
      file,
      section,
      line: runtimeNode.body.line ?? trace.startLine ?? null,
      startLine: trace.startLine ?? runtimeNode.body.line ?? null,
      startColumn: trace.startColumn ?? 1,
      endLine: trace.endLine ?? runtimeNode.body.line ?? null,
      endColumn: trace.endColumn ?? null,
      sourceLanguage: trace.sourceLanguage ?? runtimeNode.body.sourceLanguage ?? "wtoml",
      sourceKind: trace.sourceKind ?? section,
      desireNodeId: runtimeNode.id,
      desireSourceNodeIds: runtimeNode.sourceNodeIds ?? [],
      originNodeId: trace.originNodeId ?? null,
      via: Array.isArray(trace.via) ? trace.via : [],
      values: structuredClone(runtimeNode.body.values ?? {})
    }
  });
}

function toRuntimeDeclaration(node) {
  const declaration = node.body.declaration ?? {
    kind: runtimeDeclarationKind(node),
    values: node.body.values ?? {},
    source: {
      file: node.body.file ?? null,
      line: node.body.line ?? null,
      sectionStyle: node.body.sectionStyle ?? "array",
      trace: node.body.trace ?? {}
    }
  };
  return {
    nodeId: node.id,
    kind: declaration.kind,
    values: structuredClone(declaration.values ?? {}),
    file: declaration.source?.file ?? node.body.file ?? null,
    line: declaration.source?.line ?? node.body.line ?? null,
    sectionStyle: declaration.source?.sectionStyle ?? node.body.sectionStyle ?? "array",
    sourceLanguage: declaration.source?.language ?? declaration.source?.trace?.sourceLanguage ?? node.body.sourceLanguage ?? node.body.trace?.sourceLanguage ?? null,
    sourceKind: declaration.source?.kind ?? declaration.source?.trace?.sourceKind ?? node.body.sourceKind ?? node.body.trace?.sourceKind ?? null,
    trace: { ...(declaration.source?.trace ?? node.body.trace ?? {}), desireNodeId: node.id, desireSourceNodeIds: node.sourceNodeIds ?? [] }
  };
}

function isRuntimeDeclarationResidual(node) {
  return node.kind === "runtime.declaration" || node.kind === "runtime.doc";
}

function runtimeDeclarationKind(node) {
  return node.body?.declaration?.kind ?? node.body?.declarationKind ?? node.body?.docKind ?? "unknown";
}

function prepareRuntimeDeclarations(nodes) {
  return nodes.map(node => {
    const doc = toRuntimeDeclaration(node);
    return {
      ...doc,
      values: structuredClone(doc.values ?? {}),
      trace: doc.trace ? { ...doc.trace } : undefined
    };
  });
}

function withContextActor(world, values) {
  if (values.actor !== undefined || typeof values.context !== "string") return values;
  const context = world.project(moduleProjectors.contexts).find(row => row.id === values.context);
  if (!context?.actor) return values;
  return { ...values, actor: context.actor };
}

function applyCoreRuntimeDeclaration(world, doc) {
  const values = withContextActor(world, doc.values ?? {});

  switch (doc.kind) {
    case "defaults":
      return [];
    case "app":
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), values.actor ?? "system", [
        world.emit({
          process: "dsl.app.define",
          actor: values.actor ?? "system",
          claims: [
            thing(req(values, "id")),
            relation(req(values, "id"), "hasModuleKind", "app"),
            ...((values.spawn ?? []).map(id => relation(req(values, "id"), "spawnsContext", id)))
          ],
          body: values
        })
      ]);
    case "perspective":
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        definePerspective(world, {
          actor: req(values, "actor"),
          id: req(values, "id"),
          title: values.title ?? values.label ?? values.id,
          context: values.context ?? null,
          owner: values.owner ?? values.actor
        })
      ]);
    case "contextBinding": {
      const binding = {
        context: req(values, "context"),
        name: req(values, "name"),
        target: req(values, "target")
      };
      const validation = validateContextBinding(world.allWitnesses(), binding);
      if (!validation.ok) throw new Error(validation.error);
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        bindContextName(world, {
          actor: req(values, "actor"),
          context: binding.context,
          name: binding.name,
          target: binding.target
        })
      ]);
    }
    case "contextExport": {
      const contextExport = {
        context: req(values, "context"),
        name: req(values, "name"),
        target: req(values, "target")
      };
      const validation = validateContextExport(world.allWitnesses(), contextExport);
      if (!validation.ok) throw new Error(validation.error);
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        exportContextName(world, {
          actor: req(values, "actor"),
          context: contextExport.context,
          name: contextExport.name,
          target: contextExport.target
        })
      ]);
    }
    case "contextImport": {
      const contextImport = {
        context: req(values, "context"),
        sourceContext: req(values, "sourceContext"),
        exportName: req(values, "exportName"),
        name: values.name ?? values.exportName
      };
      const validation = validateContextImport(world.allWitnesses(), contextImport);
      if (!validation.ok) throw new Error(validation.error);
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        importContextName(world, {
          actor: req(values, "actor"),
          context: contextImport.context,
          sourceContext: contextImport.sourceContext,
          exportName: contextImport.exportName,
          name: validation.name ?? contextImport.name
        })
      ]);
    }
    case "stewardship":
      {
        const target = resolvePreparedDocRef(world, values, {
          idField: "target",
          refField: "targetRef",
          label: "stewardship target"
        });
        if (!target.ok) throw new Error(target.error);
        if (!target.target) throw new Error("stewardship target is required");
        return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        (values.revoke === true ? revokeStewardship : grantStewardship)(world, {
          actor: req(values, "actor"),
          steward: req(values, "steward"),
          target: target.target,
          targetKind: values.targetKind ?? null
        })
        ]);
      }
    case "proposal":
      {
        const target = resolvePreparedDocRef(world, values, {
          idField: "targetId",
          refField: "targetIdRef",
          label: "proposal target"
        });
        if (!target.ok) throw new Error(target.error);
        return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        createProposal(world, {
          actor: req(values, "actor"),
          id: req(values, "id"),
          targetProcess: req(values, "targetProcess"),
          targetKind: req(values, "targetKind"),
          targetId: target.target ?? null,
          body: values.body ?? {},
          reason: values.reason ?? null,
          owner: values.owner ?? values.actor
        })
        ]);
      }
    case "thing":
      return withSourceAnnotations(world, doc, [req(values, "id")], req(values, "actor"), [
        createThing(world, {
          actor: req(values, "actor"),
          id: req(values, "id"),
          owner: values.owner ?? values.actor
        })
      ]);
    case "relation":
      return world.emit({
        process: "dsl.relation",
        actor: req(values, "actor"),
        claims: [relation(req(values, "from"), req(values, "rel"), req(values, "to"), values.meta ?? {})],
        body: values
      });
    case "compiler":
      return withSourceAnnotations(world, doc, [req(values, "id")], req(values, "actor"), [
        createCompiler(world, {
          actor: req(values, "actor"),
          id: req(values, "id"),
          owner: values.owner ?? values.actor
        })
      ]);
    case "description":
      return withSourceAnnotations(world, doc, [req(values, "id")], req(values, "actor"), [
        createDescription(world, {
          actor: req(values, "actor"),
          id: req(values, "id"),
          source: req(values, "source"),
          language: values.language ?? "witness-ir",
          owner: values.owner ?? values.actor
        })
      ]);
    case "compile":
      return compileDescription(world, {
        actor: req(values, "actor"),
        compiler: req(values, "compiler"),
        description: req(values, "description"),
        output: req(values, "output")
      });
    case "capabilityInstall":
      {
        const target = resolvePreparedDocRef(world, values, {
          idField: "target",
          refField: "targetRef",
          label: "capability install target"
        });
        if (!target.ok) throw new Error(target.error);
        if (!target.target) throw new Error("capability target is required");
        return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        installCapability(world, {
          actor: req(values, "actor"),
          capability: req(values, "capability"),
          target: target.target,
          targetKind: req(values, "targetKind"),
          config: values.config ?? null
        })
        ]);
      }
    case "capabilityRemove":
      {
        const target = resolvePreparedDocRef(world, values, {
          idField: "target",
          refField: "targetRef",
          label: "capability remove target"
        });
        if (!target.ok) throw new Error(target.error);
        if (!target.target) throw new Error("capability target is required");
        return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        removeCapability(world, {
          actor: req(values, "actor"),
          capability: req(values, "capability"),
          target: target.target,
          targetKind: values.targetKind ?? null
        })
        ]);
      }
    case "runtimePluginInstall":
      {
        const serverRunner = resolvePreparedDocRef(world, values, {
          idField: "serverRunner",
          refField: "serverRunnerRef",
          label: "server runner"
        });
        if (!serverRunner.ok) throw new Error(serverRunner.error);
        if (!serverRunner.target) throw new Error("server runner is required");
        return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        installRuntimePlugin(world, {
          actor: req(values, "actor"),
          serverRunner: serverRunner.target,
          plugin: req(values, "plugin")
        })
        ]);
      }
    case "runtimePluginRemove":
      {
        const serverRunner = resolvePreparedDocRef(world, values, {
          idField: "serverRunner",
          refField: "serverRunnerRef",
          label: "server runner"
        });
        if (!serverRunner.ok) throw new Error(serverRunner.error);
        if (!serverRunner.target) throw new Error("server runner is required");
        return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        removeRuntimePlugin(world, {
          actor: req(values, "actor"),
          serverRunner: serverRunner.target,
          plugin: req(values, "plugin")
        })
        ]);
      }
    case "serverRunner":
      {
        const backendHost = resolvePreparedDocRef(world, values, {
          idField: "backendHost",
          refField: "backendHostRef",
          label: "backend host"
        });
        if (!backendHost.ok) throw new Error(backendHost.error);
        const frontendHost = resolvePreparedDocRef(world, values, {
          idField: "frontendHost",
          refField: "frontendHostRef",
          label: "frontend host"
        });
        if (!frontendHost.ok) throw new Error(frontendHost.error);
        return withSourceAnnotations(world, doc, [req(values, "id")], req(values, "actor"), [
          createServerRunner(world, {
            actor: req(values, "actor"),
            id: req(values, "id"),
            backendHost: backendHost.target ?? null,
            frontendHost: frontendHost.target ?? null,
            handlerSet: values.handlerSet ?? null,
            actors: values.actors ?? null,
            storage: values.storage ?? null,
            runtimeConfig: values.runtimeConfig ?? null,
            allowActorHeader: values.allowActorHeader === true,
            context: values.context ?? null,
            owner: values.owner ?? values.actor
          })
        ]);
      }
    case "route":
      {
        const serves = resolvePreparedDocRef(world, values, {
          idField: "serves",
          refField: "servesRef",
          label: "route target"
        });
        if (!serves.ok) throw new Error(serves.error);
        if (!serves.target) return null;
        const params = routeParamsResolved(world, values);
        if (!params.ok) throw new Error(params.error);
        return withSourceAnnotations(world, doc, [req(values, "id")], req(values, "actor"), [
          defineRoute(world, {
            actor: req(values, "actor"),
            id: req(values, "id"),
            path: req(values, "path"),
            serves: serves.target,
            method: values.method ?? "GET",
            handler: values.handler ?? null,
            params: params.value,
            context: values.context ?? null,
            owner: values.owner ?? values.actor
          })
        ]);
      }
    case "authRole":
      return withSourceAnnotations(world, doc, [req(values, "id")], req(values, "actor"), [
        defineAuthRole(world, {
          actor: req(values, "actor"),
          id: req(values, "id"),
          label: values.label ?? values.id,
          description: values.description ?? "",
          owner: values.owner ?? values.actor
        })
      ]);
    case "identityRoleGrant":
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        grantIdentityRole(world, {
          actor: req(values, "actor"),
          identityId: req(values, "identityId"),
          roleId: req(values, "roleId")
        })
      ]);
    case "identityRoleRevoke":
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        revokeIdentityRole(world, {
          actor: req(values, "actor"),
          identityId: req(values, "identityId"),
          roleId: req(values, "roleId")
        })
      ]);
    case "appFeatureAccessPolicy":
      return withSourceAnnotations(world, doc, [req(values, "featureId")], req(values, "actor"), [
        setAppFeatureAccessPolicy(world, {
          actor: req(values, "actor"),
          featureId: req(values, "featureId"),
          label: values.label ?? values.featureId,
          appId: values.appId ?? "",
          requireAuth: values.requireAuth === true,
          visibilityMode: values.visibilityMode ?? "normal",
          allowedRoles: values.allowedRoles ?? [],
          guestBehavior: values.guestBehavior ?? "allow",
          deniedBehavior: values.deniedBehavior ?? "403",
          owner: values.owner ?? values.actor
        })
      ]);
    case "serve":
      {
        const serverRunner = resolvePreparedDocRef(world, values, {
          idField: "serverRunner",
          refField: "serverRunnerRef",
          label: "server runner"
        });
        if (!serverRunner.ok) throw new Error(serverRunner.error);
        if (!serverRunner.target) return null;
        const route = resolvePreparedDocRef(world, values, {
          idField: "route",
          refField: "routeRef",
          label: "route"
        });
        if (!route.ok) throw new Error(route.error);
        if (!route.target) return null;
        return serveRoute(world, {
          actor: req(values, "actor"),
          serverRunner: serverRunner.target,
          route: route.target
        });
      }
    case "widget":
      return applyNativeWidgetLikeDoc(world, doc, values, req(values, "kind"));
    case "attachWidget":
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        attachWidget(world, {
          actor: req(values, "actor"),
          parent: req(values, "parent"),
          child: req(values, "child"),
          slot: values.slot ?? "children",
          order: values.order ?? 0
        })
      ]);
    case "widgetVersion":
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        defineWidgetVersion(world, {
          actor: req(values, "actor"),
          soul: req(values, "soul"),
          version: req(values, "version"),
          kind: req(values, "kind"),
          props: collectProps(values, ["actor", "owner", "context", "soul", "version", "kind", "index", "program"]),
          index: values.index ?? 0,
          owner: values.owner ?? values.actor,
          context: values.context ?? null
        })
      ]);
    case "widgetVersionTransition":
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        defineWidgetVersionTransition(world, {
          actor: req(values, "actor"),
          id: values.id ?? `widgetVersionTransition:${req(values, "soul")}:${req(values, "from")}:${req(values, "to")}`,
          soul: req(values, "soul"),
          from: req(values, "from"),
          to: req(values, "to"),
          strategy: req(values, "strategy"),
          owner: values.owner ?? values.actor
        })
      ]);
    case "activateWidgetVersion":
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        activateWidgetVersion(world, {
          actor: req(values, "actor"),
          soul: req(values, "soul"),
          version: req(values, "version")
        })
      ]);
    case "fragment":
    case "page":
    case "box":
    case "section":
    case "header":
    case "heading":
    case "paragraph":
    case "small":
    case "text":
    case "label":
    case "form":
    case "input":
    case "textarea":
    case "select":
    case "option":
    case "details":
    case "summary":
    case "valueEditor":
    case "button":
    case "link":
    case "list":
      return applyNativeWidgetLikeDoc(world, doc, values, WIDGET_KIND_BY_SECTION.get(doc.kind));
    case "frontendProgram":
      {
        const rootWidget = resolvePreparedDocRef(world, values, {
          idField: "rootWidget",
          refField: "rootWidgetRef",
          label: "root widget"
        });
        if (!rootWidget.ok) throw new Error(rootWidget.error);
        return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
          defineFrontendProgram(world, {
            actor: req(values, "actor"),
            id: req(values, "id"),
            rootWidget: rootWidget.target ?? req(values, "rootWidget"),
            context: values.context ?? null,
            owner: values.owner ?? values.actor
          })
        ]);
      }
    case "frontendStep":
      return applyNativeFrontendStepDoc(world, doc, {
        ...values,
        frontendEvent: values.frontendEvent ?? values.on ?? values.event
      });
    case "step":
      return applyNativeFrontendStepDoc(world, doc, {
        ...values,
        frontendEvent: values.on ?? values.event
      });
    case "backendProgram":
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        defineBackendProgram(world, {
          actor: req(values, "actor"),
          soul: req(values, "soul"),
          label: values.label ?? values.soul,
          context: values.context ?? null,
          owner: values.owner ?? values.actor
        })
      ]);
    case "backendProgramVersion":
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        defineBackendProgramVersion(world, {
          actor: req(values, "actor"),
          soul: req(values, "soul"),
          version: req(values, "version"),
          index: values.index ?? 0,
          context: values.context ?? null,
          owner: values.owner ?? values.actor
        }),
        ...(typeof values.transitionFrom === "string" && values.transitionFrom.trim()
          ? [defineBackendProgramVersionTransition(world, {
              actor: req(values, "actor"),
              soul: req(values, "soul"),
              from: values.transitionFrom.trim(),
              to: req(values, "version"),
              strategy: values.transitionStrategy ?? "block",
              owner: values.owner ?? values.actor
            })]
          : [])
      ]);
    case "backendProgramVersionTransition":
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        defineBackendProgramVersionTransition(world, {
          actor: req(values, "actor"),
          id: values.id ?? `backendProgramVersionTransition:${req(values, "soul")}:${req(values, "from")}:${req(values, "to")}`,
          soul: req(values, "soul"),
          from: req(values, "from"),
          to: req(values, "to"),
          strategy: req(values, "strategy"),
          owner: values.owner ?? values.actor
        })
      ]);
    case "backendStep":
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        defineBackendStep(world, {
          actor: req(values, "actor"),
          version: req(values, "version"),
          event: req(values, "event"),
          op: req(values, "op"),
          order: values.order ?? 0,
          params: values.params ?? {},
          when: values.when ?? null,
          repeat: values.repeat ?? null,
          after: Array.isArray(values.after) ? values.after : null
        })
      ]);
    case "activateBackendProgramVersion":
      return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
        activateBackendProgramVersion(world, {
          actor: req(values, "actor"),
          soul: req(values, "soul"),
          version: req(values, "version")
        })
      ]);
    case "clone":
      return cloneThing(world, {
        actor: req(values, "actor"),
        source: req(values, "source"),
        clone: req(values, "clone")
      });
    case "transfer":
      return transferOwnership(world, {
        actor: req(values, "actor"),
        thingId: req(values, "thing"),
        from: req(values, "from"),
        to: req(values, "to")
      });
    case "frontendRunner":
      return withSourceAnnotations(world, doc, [req(values, "id")], req(values, "actor"), [
        createFrontendRunner(world, {
          actor: req(values, "actor"),
          id: req(values, "id"),
          owner: values.owner ?? values.actor
        })
      ]);
    case "view":
      return withSourceAnnotations(world, doc, [req(values, "id")], req(values, "actor"), [
        createViewDescription(world, {
          actor: req(values, "actor"),
          id: req(values, "id"),
          target: req(values, "target"),
          owner: values.owner ?? values.actor
        })
      ]);
    case "render":
      return renderView(world, {
        actor: req(values, "actor"),
        frontendRunner: req(values, "frontendRunner"),
        viewDescription: req(values, "view"),
        frame: req(values, "frame")
      });
    case "action":
      return emitUserAction(world, {
        actor: req(values, "actor"),
        frontendRunner: req(values, "frontendRunner"),
        action: req(values, "id"),
        target: req(values, "target"),
        body: values.body ?? {}
      });
    default:
      return null;
  }
}

function createUnsupportedRuntimeDeclarationError(doc) {
  return new Error(`unsupported runtime declaration: ${describeRuntimeDeclaration(doc)}. Install or register a DESIRE runtime declaration extension before applying this document.`);
}

function createRegisteredRuntimeDeclarationMissingHandlerError(doc) {
  return new Error(`registered runtime declaration has no apply handler: ${describeRuntimeDeclaration(doc)}`);
}

function describeRuntimeDeclaration(doc) {
  const parts = [`kind=${doc.kind}`];
  if (doc.file) parts.push(`file=${doc.file}`);
  if (doc.line !== null && doc.line !== undefined) parts.push(`line=${doc.line}`);
  if (doc.sourceLanguage) parts.push(`sourceLanguage=${doc.sourceLanguage}`);
  if (doc.sourceKind) parts.push(`sourceKind=${doc.sourceKind}`);
  return parts.join(" ");
}

function withSourceAnnotations(world, doc, targets, actor, witnesses) {
  const out = [...witnesses.filter(Boolean)];
  for (const target of [...new Set((targets ?? []).filter(Boolean))]) {
    const annotation = emitSourceAnnotationFromDoc(world, doc, target, actor);
    if (annotation) out.push(annotation);
  }
  return out;
}

function withSemanticSourceAnnotations(world, node, targets, actor, witnesses) {
  const out = [...witnesses.filter(Boolean)];
  for (const target of [...new Set((targets ?? []).filter(Boolean))]) {
    const annotation = emitSourceAnnotationFromSemanticNode(world, node, target, actor);
    if (annotation) out.push(annotation);
  }
  return out;
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

function emitSourceAnnotationFromSemanticNode(world, node, target, actor) {
  const provenance = node.meta?.provenance ?? null;
  const file = provenance?.file ?? null;
  if (!file || !target) return null;
  const fileId = `source:${file}`;
  return world.emit({
    process: "dsl.source.annotate",
    actor,
    claims: [
      thing(fileId),
      relation(fileId, "hasModuleKind", "sourceFile"),
      relation(target, "definedIn", fileId, { section: provenance?.sourceKind ?? node.kind })
    ],
    body: {
      target,
      file,
      section: provenance?.sourceKind ?? node.kind,
      line: provenance?.startLine ?? null,
      startLine: provenance?.startLine ?? null,
      startColumn: provenance?.startColumn ?? 1,
      endLine: provenance?.endLine ?? provenance?.startLine ?? null,
      endColumn: provenance?.endColumn ?? null,
      sourceLanguage: provenance?.sourceLanguage ?? "unknown",
      sourceKind: provenance?.sourceKind ?? node.kind,
      desireNodeId: node.id,
      desireSourceNodeIds: node.sourceNodeIds ?? [],
      originNodeId: provenance?.originNodeId ?? null,
      via: Array.isArray(provenance?.via) ? provenance.via : [],
      values: structuredClone(node.body ?? {})
    }
  });
}

function sourceTargetsForDoc(doc) {
  const values = doc.values ?? {};
  const ids = [];
  if (values.id) ids.push(values.id);
  if (doc.kind === "contextBinding" || doc.kind === "contextExport") {
    if (values.context) ids.push(values.context);
    if (values.target) ids.push(values.target);
  }
  if (doc.kind === "contextImport") {
    if (values.context) ids.push(values.context);
    if (values.sourceContext) ids.push(values.sourceContext);
  }
  if (doc.kind === "perspective" && values.context) {
    ids.push(values.context);
  }
  if (doc.kind === "stewardship" && values.target) {
    ids.push(values.target);
  }
  if (doc.kind === "proposal" && values.targetId) {
    ids.push(values.targetId);
  }
  if (doc.kind === "capabilityInstall") {
    if (values.capability) ids.push(values.capability);
    if (values.target) ids.push(values.target);
  }
  if (doc.kind === "runtimePluginInstall" || doc.kind === "runtimePluginRemove") {
    if (values.serverRunner) ids.push(values.serverRunner);
  }
  if (doc.kind === "attachWidget") {
    if (values.parent) ids.push(values.parent);
    if (values.child) ids.push(values.child);
  }
  if (doc.kind === "widgetVersion") {
    if (values.soul) ids.push(values.soul);
    if (values.version) ids.push(values.version);
  }
  if (doc.kind === "widgetVersionTransition") {
    if (values.id) ids.push(values.id);
    if (values.soul) ids.push(values.soul);
    if (values.from) ids.push(values.from);
    if (values.to) ids.push(values.to);
  }
  if (doc.kind === "activateWidgetVersion" && values.soul) {
    ids.push(values.soul);
  }
  if ((doc.kind === "frontendStep" || doc.kind === "step") && values.program) {
    ids.push(values.program);
  }
  if (doc.kind === "backendProgram" && values.soul) {
    ids.push(values.soul);
  }
  if (doc.kind === "backendProgramVersion") {
    if (values.soul) ids.push(values.soul);
    if (values.version) ids.push(values.version);
    if (values.transitionFrom) ids.push(values.transitionFrom);
  }
  if (doc.kind === "backendProgramVersionTransition") {
    if (values.id) ids.push(values.id);
    if (values.soul) ids.push(values.soul);
    if (values.from) ids.push(values.from);
    if (values.to) ids.push(values.to);
  }
  if (doc.kind === "activateBackendProgramVersion") {
    if (values.soul) ids.push(values.soul);
    if (values.version) ids.push(values.version);
  }
  if (doc.kind === "backendStep" && values.version) {
    ids.push(values.version);
  }
  return ids;
}

function applyNativeWidgetLikeDoc(world, doc, values, kind) {
  const parent = resolvePreparedDocRef(world, values, {
    idField: "parent",
    refField: "parentRef",
    label: "parent widget"
  });
  if (!parent.ok) throw new Error(parent.error);
  const actor = req(values, "actor");
  const id = req(values, "id");
  const children = Array.isArray(values.children) ? values.children : [];
  return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), actor, [
    defineWidget(world, {
      actor,
      id,
      kind,
      props: collectProps(values, ["actor", "owner", "context", "id", "kind", "children", "slot", "order", "program", "parent", "parentRef"]),
      context: values.context ?? null,
      owner: values.owner ?? values.actor
    }),
    ...(parent.target ? [attachWidget(world, {
      actor,
      parent: parent.target,
      child: id,
      slot: values.slot ?? "children",
      order: Number.isFinite(Number(values.order)) ? Number(values.order) : 0
    })] : []),
    ...children.map((child, order) => attachWidget(world, {
      actor,
      parent: id,
      child,
      slot: values.slot ?? "children",
      order
    }))
  ]);
}

function applyNativeFrontendStepDoc(world, doc, values) {
  const triggerEvent = req(values, "frontendEvent");
  const paramValues = { ...values };
  if (!("on" in values) && values.event === triggerEvent) delete paramValues.event;
  const reserved = ["actor", "context", "program", "frontendEvent", "on", "op", "order", "params", "when", "repeat", "after"];
  return withSourceAnnotations(world, doc, sourceTargetsForDoc(doc), req(values, "actor"), [
    defineFrontendStep(world, {
      actor: req(values, "actor"),
      program: req(values, "program"),
      event: triggerEvent,
      op: req(values, "op"),
      order: values.order ?? 0,
      params: { ...(paramValues.params ?? {}), ...collectProps(paramValues, reserved) },
      when: values.when ?? null,
      repeat: values.repeat ?? null,
      after: Array.isArray(values.after) ? values.after : null
    })
  ]);
}

function routeParamsDirect(values) {
  const params = values.params && typeof values.params === "object" ? { ...values.params } : {};
  if (values.rootWidget != null) params.rootWidget = values.rootWidget;
  if (values.rootSurface != null) params.rootSurface = values.rootSurface;
  if (values.page != null) params.page = values.page;
  if (values.frontendProgram != null) params.frontendProgram = values.frontendProgram;
  if (values.backendProgramSoul != null) params.backendProgramSoul = values.backendProgramSoul;
  if (values.defaultScreen != null) params.defaultScreen = values.defaultScreen;
  if (values.routeState && typeof values.routeState === "object" && !Array.isArray(values.routeState)) {
    const process = trimOptionalString(values.routeState.process) ?? trimOptionalString(values.routeState.processRef);
    const state = trimOptionalString(values.routeState.state) ?? trimOptionalString(values.routeState.stateRef);
    if (state) {
      params.routeState = {
        ...(process ? { process } : {}),
        state
      };
    }
  }
  if (values.liveProjection === true) params.liveProjection = true;
  if (Array.isArray(values.excludeWidgetRoles) && values.excludeWidgetRoles.length) {
    params.excludeWidgetRoles = [...values.excludeWidgetRoles];
  }
  if (typeof values.defaultRootWidget === "string" && values.defaultRootWidget.trim()) {
    params.rootWidget = values.defaultRootWidget.trim();
  }
  return Object.keys(params).length ? params : null;
}

function routeParamsResolved(world, values) {
  const params = values.params && typeof values.params === "object" ? { ...values.params } : {};
  const rootWidget = resolvePreparedDocRef(world, values, {
    idField: "rootWidget",
    refField: "rootWidgetRef",
    label: "root widget"
  });
  if (!rootWidget.ok) return { ok: false, error: rootWidget.error };
  if (rootWidget.target) params.rootWidget = rootWidget.target;
  const rootSurface = resolvePreparedDocRef(world, values, {
    idField: "rootSurface",
    refField: "rootSurfaceRef",
    label: "root surface"
  });
  if (!rootSurface.ok) return { ok: false, error: rootSurface.error };
  if (rootSurface.target) params.rootSurface = rootSurface.target;
  if (values.page != null) params.page = values.page;
  if (values.frontendProgram != null) params.frontendProgram = values.frontendProgram;
  const backendProgramSoul = resolvePreparedDocRef(world, values, {
    idField: "backendProgramSoul",
    refField: "backendProgramSoulRef",
    label: "backend program soul"
  });
  if (!backendProgramSoul.ok) return { ok: false, error: backendProgramSoul.error };
  if (backendProgramSoul.target) params.backendProgramSoul = backendProgramSoul.target;
  if (values.defaultScreen != null) params.defaultScreen = values.defaultScreen;
  if (values.routeState && typeof values.routeState === "object" && !Array.isArray(values.routeState)) {
    const process = trimOptionalString(values.routeState.process) ?? trimOptionalString(values.routeState.processRef);
    const state = trimOptionalString(values.routeState.state) ?? trimOptionalString(values.routeState.stateRef);
    if (state) {
      params.routeState = {
        ...(process ? { process } : {}),
        state
      };
    }
  }
  if (values.liveProjection === true) params.liveProjection = true;
  if (Array.isArray(values.excludeWidgetRoles) && values.excludeWidgetRoles.length) {
    params.excludeWidgetRoles = [...values.excludeWidgetRoles];
  }
  if (typeof values.defaultRootWidget === "string" && values.defaultRootWidget.trim()) {
    params.rootWidget = values.defaultRootWidget.trim();
  }
  return { ok: true, value: Object.keys(params).length ? params : null };
}

function trimOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolvePreparedDocRef(world, values, {
  contextField = "context",
  idField,
  refField,
  label
}) {
  return resolveContextualRef(world.allWitnesses(), {
    context: values[contextField] ?? null,
    id: values[idField] ?? null,
    ref: values[refField] ?? null,
    label
  });
}

function collectProps(values, reserved) {
  const reservedSet = new Set(reserved);
  return {
    ...(values.props ?? {}),
    ...Object.fromEntries(Object.entries(values).filter(([key]) => !reservedSet.has(key) && key !== "props"))
  };
}

function req(values, key) {
  if (!(key in values) || values[key] === undefined) throw new Error(`missing required key: ${key}`);
  return values[key];
}
