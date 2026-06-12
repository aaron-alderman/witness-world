import fs from "node:fs/promises";
import path from "node:path";
import { createThing, transferOwnership, cloneThing, relation, thing } from "./kernel.js";
import {
  createCompiler,
  createDescription,
  compileDescription,
  defineContext,
  definePerspective,
  grantStewardship,
  revokeStewardship,
  createProposal,
  bindContextName,
  exportContextName,
  defineCapability,
  ensureCapabilityDefinition,
  importContextName,
  installCapability,
  installMcpTool,
  createMcpServer,
  removeCapability,
  removeMcpTool,
  validateContextBinding,
  validateContextExport,
  validateContextImport,
  resolveContextualRef,
  createServerRunner,
  createIdentity,
  defineRoute,
  serveRoute,
  createFrontendRunner,
  createViewDescription,
  renderView,
  emitUserAction
} from "./modules.js";
import { defineWidget, defineWidgetVersion, defineWidgetVersionTransition, activateWidgetVersion, attachWidget, defineFrontendProgram, defineFrontendStep } from "./widgets.js";
import { defineTrait, defineValueType, defineProcessSpec } from "./type-model.js";

// Tiny TOML-ish DSL parser. Intentional subset:
//   [[section]]
//   key = "value"
//   key = 123
//   key = true
//   key = { a = "b", n = 1 }
//   key = ["a", "b"]
//
// v0.14 adds ergonomic surface sugar while keeping the same witnessed runtime:
//   [[defaults]] actor = "adam"
//   [[heading]] id = "title" text = "Hello" level = 1
//   [[form]] id = "todo_form" role = "todo-form" children = ["todo_input", "todo_add"]
//   [[step]] program = "p" on = "load" op = "fetchJson" url = "/api" into = "response"
// Unknown widget keys become props. Unknown step keys become params.
export function parseWitnessToml(source) {
  const docs = [];
  let current = null;
  let lineNum = 0;

  for (const raw of source.split(/\r?\n/)) {
    lineNum++;
    const line = stripComment(raw).trim();
    if (!line) continue;

    const arraySection = line.match(/^\[\[\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\]\]$/);
    if (arraySection) {
      current = { kind: arraySection[1], values: {}, line: lineNum };
      docs.push(current);
      continue;
    }

    const tableSection = line.match(/^\[\s*([A-Za-z_][A-Za-z0-9_-]*)(?:\.([A-Za-z_][A-Za-z0-9_-]*))?\s*\]$/);
    if (tableSection) {
      current = { kind: tableSection[1], values: tableSection[2] ? { id: tableSection[2] } : {}, line: lineNum };
      docs.push(current);
      continue;
    }

    if (!current) throw new Error(`key/value before section: ${line}`);

    const eq = line.indexOf("=");
    if (eq < 0) throw new Error(`expected key = value: ${line}`);

    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) throw new Error(`invalid key: ${key}`);
    current.values[key] = parseValue(value);
  }

  return docs;
}

export async function loadWitnessTomlFile(file, { seen = new Set() } = {}) {
  const resolved = path.resolve(file);
  if (seen.has(resolved)) return [];
  seen.add(resolved);

  const source = await fs.readFile(resolved, "utf8");
  const docs = parseWitnessToml(source).map(doc => ({ ...doc, file: resolved }));
  const imports = docs
    .filter(doc => doc.kind === "app" && Array.isArray(doc.values.imports))
    .flatMap(doc => doc.values.imports);

  const imported = [];
  for (const spec of imports) {
    imported.push(...await loadWitnessTomlFile(path.resolve(path.dirname(resolved), spec), { seen }));
  }

  return [...docs, ...imported];
}

export function applyWitnessToml(world, source) {
  return applyWitnessDocs(world, parseWitnessToml(source));
}

export function applyWitnessDocs(world, docs) {
  const witnesses = [];
  const context = { defaults: {}, contexts: {} };

  for (const doc of docs) {
    const applied = applyDoc(world, doc, context);
    if (Array.isArray(applied)) witnesses.push(...applied.filter(Boolean));
    else if (applied) witnesses.push(applied);

    const sourceWitnesses = annotateSource(world, doc, context);
    witnesses.push(...sourceWitnesses);
  }

  return witnesses;
}

function resolveDocRef(world, values, {
  contextField = "context",
  idField,
  refField,
  label
}) {
  const resolved = resolveContextualRef(world.allWitnesses(), {
    context: values[contextField] ?? null,
    id: values[idField] ?? null,
    ref: values[refField] ?? null,
    label
  });
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved.target;
}

function annotateSource(world, doc, context) {
  if (!doc.file) return [];
  const values = { ...(context.defaults ?? {}), ...(doc.values ?? {}) };
  if (values.context && context.contexts?.[values.context] && !values.actor) values.actor = context.contexts[values.context].actor;
  const targets = sourceTargets(doc.kind, values);
  if (targets.length === 0) return [];
  const fileId = `source:${doc.file}`;
  return targets.map(target => world.emit({
    process: "dsl.source.annotate",
    actor: values.actor ?? "system",
    claims: [
      thing(fileId),
      relation(fileId, "hasModuleKind", "sourceFile"),
      relation(target, "definedIn", fileId, { section: doc.kind })
    ],
    body: { target, file: doc.file, section: doc.kind, line: doc.line ?? null, values: doc.values ?? {} }
  }));
}

function sourceTargets(kind, values) {
  const ids = [];
  if (values.id) ids.push(values.id);
  if (kind === "widgetVersion") {
    if (values.soul) ids.push(values.soul);
    if (values.version) ids.push(values.version);
  }
  if (kind === "widgetVersionTransition") {
    if (values.id) ids.push(values.id);
    if (values.soul) ids.push(values.soul);
    if (values.from) ids.push(values.from);
    if (values.to) ids.push(values.to);
  }
  if (kind === "activateWidgetVersion" && values.soul) ids.push(values.soul);
  if ((kind === "frontendStep" || kind === "step") && values.program) ids.push(values.program);
  if (kind === "capability" && values.id) ids.push(values.id);
  if (kind === "capabilityInstall") {
    if (values.capability) ids.push(values.capability);
    if (values.target) ids.push(values.target);
  }
  if (kind === "mcpServer") {
    if (values.serverRunner) ids.push(values.serverRunner);
  }
  if (kind === "mcpToolInstall") {
    if (values.server) ids.push(values.server);
  }
  if (kind === "contextBinding") {
    if (values.context) ids.push(values.context);
    if (values.target) ids.push(values.target);
  }
  if (kind === "contextExport") {
    if (values.context) ids.push(values.context);
    if (values.target) ids.push(values.target);
  }
  if (kind === "contextImport") {
    if (values.context) ids.push(values.context);
    if (values.sourceContext) ids.push(values.sourceContext);
  }
  if (kind === "perspective" && values.context) ids.push(values.context);
  if (kind === "stewardship" && values.target) ids.push(values.target);
  if (kind === "proposal" && values.targetId) ids.push(values.targetId);
  if (kind === "attachWidget") {
    if (values.parent) ids.push(values.parent);
    if (values.child) ids.push(values.child);
  }
  return [...new Set(ids.filter(Boolean))];
}

const WIDGET_KIND_BY_SECTION = new Map([
  ["page", "Page"],
  ["box", "Box"],
  ["section", "Section"],
  ["heading", "Heading"],
  ["text", "Text"],
  ["form", "Form"],
  ["input", "Input"],
  ["select", "Select"],
  ["option", "Option"],
  ["button", "Button"],
  ["link", "Link"],
  ["list", "List"]
]);

function applyDoc(world, { kind, values }, context) {
  if (kind === "defaults") {
    context.defaults = { ...context.defaults, ...values };
    return null;
  }

  const valuesWithDefaults = { ...context.defaults, ...values };
  if (valuesWithDefaults.context && context.contexts[valuesWithDefaults.context]) {
    const ctx = context.contexts[valuesWithDefaults.context];
    if (!valuesWithDefaults.actor) valuesWithDefaults.actor = ctx.actor;
  }

  if (WIDGET_KIND_BY_SECTION.has(kind)) {
    return applyWidgetLike(world, valuesWithDefaults, WIDGET_KIND_BY_SECTION.get(kind));
  }

  switch (kind) {
    case "app":
      return world.emit({
        process: "dsl.app.define",
        actor: valuesWithDefaults.actor ?? "system",
        claims: [
          thing(req(valuesWithDefaults, "id")),
          relation(req(valuesWithDefaults, "id"), "hasModuleKind", "app"),
          ...(valuesWithDefaults.spawn ?? []).map(id => relation(req(valuesWithDefaults, "id"), "spawnsContext", id))
        ],
        body: valuesWithDefaults
      });

    case "context": {
      const id = req(valuesWithDefaults, "id");
      const actor = valuesWithDefaults.actor ?? id;
      const capabilities = valuesWithDefaults.capabilities ?? [];
      context.contexts[id] = { ...valuesWithDefaults, id, actor, capabilities };
      const base = defineContext(world, {
        actor,
        id,
        label: valuesWithDefaults.label ?? id,
        parent: valuesWithDefaults.parent ?? null,
        owner: valuesWithDefaults.owner ?? actor,
        stewards: valuesWithDefaults.stewards ?? valuesWithDefaults.initialStewards ?? []
      });
      const define = world.emit({
        process: "context.define",
        actor,
        claims: [],
        body: {
          id,
          label: valuesWithDefaults.label ?? id,
          actor,
          owner: valuesWithDefaults.owner ?? actor,
          parent: valuesWithDefaults.parent ?? null,
          stewards: valuesWithDefaults.stewards ?? valuesWithDefaults.initialStewards ?? [],
          capabilities
        }
      });
      const sugar = [];
      for (const capability of capabilities) {
        ensureCapabilityDefinition(world, {
          actor,
          id: capability,
          label: capability,
          provenance: { source: "dsl.context.capabilities" },
          placement: ["context"]
        });
        sugar.push(installCapability(world, {
          actor,
          capability,
          target: id,
          targetKind: "context"
        }));
      }
      return [base, define, ...sugar];
    }

    case "perspective":
      return definePerspective(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        title: valuesWithDefaults.title ?? valuesWithDefaults.label ?? valuesWithDefaults.id,
        context: valuesWithDefaults.context ?? null,
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "contextBinding":
      {
        const binding = {
          context: req(valuesWithDefaults, "context"),
          name: req(valuesWithDefaults, "name"),
          target: req(valuesWithDefaults, "target")
        };
        const validation = validateContextBinding(world.allWitnesses(), binding);
        if (!validation.ok) throw new Error(validation.error);
      }
      return bindContextName(world, {
        actor: req(valuesWithDefaults, "actor"),
        context: req(valuesWithDefaults, "context"),
        name: req(valuesWithDefaults, "name"),
        target: req(valuesWithDefaults, "target")
      });

    case "contextExport":
      {
        const contextExport = {
          context: req(valuesWithDefaults, "context"),
          name: req(valuesWithDefaults, "name"),
          target: req(valuesWithDefaults, "target")
        };
        const validation = validateContextExport(world.allWitnesses(), contextExport);
        if (!validation.ok) throw new Error(validation.error);
      }
      return exportContextName(world, {
        actor: req(valuesWithDefaults, "actor"),
        context: req(valuesWithDefaults, "context"),
        name: req(valuesWithDefaults, "name"),
        target: req(valuesWithDefaults, "target")
      });

    case "contextImport": {
      const contextImport = {
        context: req(valuesWithDefaults, "context"),
        sourceContext: req(valuesWithDefaults, "sourceContext"),
        exportName: req(valuesWithDefaults, "exportName"),
        name: valuesWithDefaults.name ?? valuesWithDefaults.exportName
      };
      const validation = validateContextImport(world.allWitnesses(), contextImport);
      if (!validation.ok) throw new Error(validation.error);
      return importContextName(world, {
        actor: req(valuesWithDefaults, "actor"),
        context: contextImport.context,
        sourceContext: contextImport.sourceContext,
        exportName: contextImport.exportName,
        name: validation.name ?? contextImport.name
      });
    }

    case "stewardship":
      return (valuesWithDefaults.revoke === true ? revokeStewardship : grantStewardship)(world, {
        actor: req(valuesWithDefaults, "actor"),
        steward: req(valuesWithDefaults, "steward"),
        target: req(valuesWithDefaults, "target"),
        targetKind: valuesWithDefaults.targetKind ?? null
      });

    case "proposal":
      return createProposal(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        targetProcess: req(valuesWithDefaults, "targetProcess"),
        targetKind: req(valuesWithDefaults, "targetKind"),
        targetId: valuesWithDefaults.targetId ?? null,
        body: valuesWithDefaults.body ?? {},
        reason: valuesWithDefaults.reason ?? null,
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "capability":
      return defineCapability(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        label: valuesWithDefaults.label ?? valuesWithDefaults.id,
        version: valuesWithDefaults.version ?? null,
        provenance: valuesWithDefaults.provenance ?? null,
        dependsOn: valuesWithDefaults.dependsOn ?? [],
        publicApi: valuesWithDefaults.publicApi ?? [],
        config: valuesWithDefaults.config ?? [],
        internals: valuesWithDefaults.internals ?? [],
        authority: valuesWithDefaults.authority ?? [],
        providerAdapters: valuesWithDefaults.providerAdapters ?? [],
        witnessContract: valuesWithDefaults.witnessContract ?? null,
        placement: valuesWithDefaults.placement ?? [],
        context: valuesWithDefaults.context ?? null,
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "capabilityInstall":
      return installCapability(world, {
        actor: req(valuesWithDefaults, "actor"),
        capability: req(valuesWithDefaults, "capability"),
        target: req(valuesWithDefaults, "target"),
        targetKind: req(valuesWithDefaults, "targetKind"),
        config: valuesWithDefaults.config ?? null
      });

    case "capabilityRemove":
      return removeCapability(world, {
        actor: req(valuesWithDefaults, "actor"),
        capability: req(valuesWithDefaults, "capability"),
        target: req(valuesWithDefaults, "target"),
        targetKind: valuesWithDefaults.targetKind ?? null
      });

    case "thing":
      return createThing(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "relation":
      return world.emit({
        process: "dsl.relation",
        actor: req(valuesWithDefaults, "actor"),
        claims: [relation(req(valuesWithDefaults, "from"), req(valuesWithDefaults, "rel"), req(valuesWithDefaults, "to"), valuesWithDefaults.meta ?? {})],
        body: valuesWithDefaults
      });

    case "compiler":
      return createCompiler(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "description":
      return createDescription(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        source: req(valuesWithDefaults, "source"),
        language: valuesWithDefaults.language ?? "witness-ir",
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "compile":
      return compileDescription(world, {
        actor: req(valuesWithDefaults, "actor"),
        compiler: req(valuesWithDefaults, "compiler"),
        description: req(valuesWithDefaults, "description"),
        output: req(valuesWithDefaults, "output")
      });

    case "serverRunner":
      return createServerRunner(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        backendHost: resolveDocRef(world, valuesWithDefaults, {
          idField: "backendHost",
          refField: "backendHostRef",
          label: "backend host"
        }) ?? null,
        frontendHost: resolveDocRef(world, valuesWithDefaults, {
          idField: "frontendHost",
          refField: "frontendHostRef",
          label: "frontend host"
        }) ?? null,
        handlerSet: valuesWithDefaults.handlerSet ?? null,
        actors: valuesWithDefaults.actors ?? null,
        storage: valuesWithDefaults.storage ?? null,
        runtimeConfig: valuesWithDefaults.runtimeConfig ?? null,
        allowActorHeader: valuesWithDefaults.allowActorHeader === true,
        context: valuesWithDefaults.context ?? null,
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "mcpServer":
      return createMcpServer(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        label: valuesWithDefaults.label ?? valuesWithDefaults.id,
        serverRunner: resolveDocRef(world, valuesWithDefaults, {
          idField: "serverRunner",
          refField: "serverRunnerRef",
          label: "server runner"
        }) ?? req(valuesWithDefaults, "serverRunner"),
        serviceIdentity: valuesWithDefaults.serviceIdentity ?? null,
        transports: valuesWithDefaults.transports ?? ["stdio", "http"],
        context: valuesWithDefaults.context ?? null,
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "mcpToolInstall":
      return installMcpTool(world, {
        actor: req(valuesWithDefaults, "actor"),
        server: req(valuesWithDefaults, "server"),
        tool: req(valuesWithDefaults, "tool"),
        actingMode: valuesWithDefaults.actingMode ?? "delegated",
        scopeContexts: valuesWithDefaults.scopeContexts ?? [],
        scopeTargets: valuesWithDefaults.scopeTargets ?? []
      });

    case "mcpToolRemove":
      return removeMcpTool(world, {
        actor: req(valuesWithDefaults, "actor"),
        server: req(valuesWithDefaults, "server"),
        tool: req(valuesWithDefaults, "tool")
      });

    case "identity": {
      const contextActor = valuesWithDefaults.context && context.contexts[valuesWithDefaults.context]
        ? context.contexts[valuesWithDefaults.context].actor
        : null;
      const authorActor = valuesWithDefaults.author ?? contextActor ?? req(valuesWithDefaults, "actor");
      return createIdentity(world, {
        actor: authorActor,
        id: req(valuesWithDefaults, "id"),
        identityActor: req(valuesWithDefaults, "actor"),
        label: req(valuesWithDefaults, "label"),
        username: req(valuesWithDefaults, "username"),
        password: req(valuesWithDefaults, "password"),
        homeContext: valuesWithDefaults.homeContext ?? null,
        homePerspective: valuesWithDefaults.homePerspective ?? null,
        owner: valuesWithDefaults.owner ?? authorActor
      });
    }

    case "route":
      return defineRoute(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        path: req(valuesWithDefaults, "path"),
        serves: resolveDocRef(world, valuesWithDefaults, {
          idField: "serves",
          refField: "servesRef",
          label: "route target"
        }) ?? req(valuesWithDefaults, "serves"),
        method: valuesWithDefaults.method ?? "GET",
        handler: valuesWithDefaults.handler ?? null,
        params: routeParams(world, valuesWithDefaults),
        context: valuesWithDefaults.context ?? null,
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "serve":
      return serveRoute(world, {
        actor: req(valuesWithDefaults, "actor"),
        serverRunner: resolveDocRef(world, valuesWithDefaults, {
          idField: "serverRunner",
          refField: "serverRunnerRef",
          label: "server runner"
        }) ?? req(valuesWithDefaults, "serverRunner"),
        route: resolveDocRef(world, valuesWithDefaults, {
          idField: "route",
          refField: "routeRef",
          label: "route"
        }) ?? req(valuesWithDefaults, "route")
      });

    case "frontendRunner":
      return createFrontendRunner(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "view":
      return createViewDescription(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        target: req(valuesWithDefaults, "target"),
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "render":
      return renderView(world, {
        actor: req(valuesWithDefaults, "actor"),
        frontendRunner: req(valuesWithDefaults, "frontendRunner"),
        viewDescription: req(valuesWithDefaults, "view"),
        frame: req(valuesWithDefaults, "frame")
      });

    case "action":
      return emitUserAction(world, {
        actor: req(valuesWithDefaults, "actor"),
        frontendRunner: req(valuesWithDefaults, "frontendRunner"),
        action: req(valuesWithDefaults, "id"),
        target: req(valuesWithDefaults, "target"),
        body: valuesWithDefaults.body ?? {}
      });

    case "trait":
      return defineTrait(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        label: valuesWithDefaults.label ?? valuesWithDefaults.id,
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "valueType":
      return defineValueType(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        label: valuesWithDefaults.label ?? valuesWithDefaults.id,
        editor: valuesWithDefaults.editor ?? null,
        compatibleWith: valuesWithDefaults.compatibleWith ?? [],
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "processSpec":
      return defineProcessSpec(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        process: req(valuesWithDefaults, "process"),
        inputs: valuesWithDefaults.inputs ?? [],
        outputs: valuesWithDefaults.outputs ?? [],
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "widget":
      return applyWidgetLike(world, valuesWithDefaults, req(valuesWithDefaults, "kind"));

    case "widgetVersion":
      return defineWidgetVersion(world, {
        actor: req(valuesWithDefaults, "actor"),
        soul: req(valuesWithDefaults, "soul"),
        version: req(valuesWithDefaults, "version"),
        kind: req(valuesWithDefaults, "kind"),
        props: collectProps(valuesWithDefaults, ["actor", "owner", "context", "soul", "version", "kind", "index", "program"]),
        index: valuesWithDefaults.index ?? 0,
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor,
        context: valuesWithDefaults.context ?? null
      });

    case "widgetVersionTransition":
      return defineWidgetVersionTransition(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: valuesWithDefaults.id ?? `widgetVersionTransition:${req(valuesWithDefaults, "soul")}:${req(valuesWithDefaults, "from")}:${req(valuesWithDefaults, "to")}`,
        soul: req(valuesWithDefaults, "soul"),
        from: req(valuesWithDefaults, "from"),
        to: req(valuesWithDefaults, "to"),
        strategy: req(valuesWithDefaults, "strategy"),
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "activateWidgetVersion":
      return activateWidgetVersion(world, {
        actor: req(valuesWithDefaults, "actor"),
        soul: req(valuesWithDefaults, "soul"),
        version: req(valuesWithDefaults, "version")
      });

    case "attachWidget":
      return attachWidget(world, {
        actor: req(valuesWithDefaults, "actor"),
        parent: req(valuesWithDefaults, "parent"),
        child: req(valuesWithDefaults, "child"),
        slot: valuesWithDefaults.slot ?? "children",
        order: valuesWithDefaults.order ?? 0
      });

    case "frontendProgram":
      return defineFrontendProgram(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        rootWidget: resolveDocRef(world, valuesWithDefaults, {
          idField: "rootWidget",
          refField: "rootWidgetRef",
          label: "root widget"
        }) ?? req(valuesWithDefaults, "rootWidget"),
        context: valuesWithDefaults.context ?? null,
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "frontendStep":
      return applyFrontendStep(world, {
        ...valuesWithDefaults,
        frontendEvent: valuesWithDefaults.frontendEvent ?? valuesWithDefaults.on ?? valuesWithDefaults.event
      });

    case "step":
      return applyFrontendStep(world, {
        ...valuesWithDefaults,
        frontendEvent: valuesWithDefaults.on ?? valuesWithDefaults.event
      });

    case "clone":
      return cloneThing(world, {
        actor: req(valuesWithDefaults, "actor"),
        source: req(valuesWithDefaults, "source"),
        clone: req(valuesWithDefaults, "clone")
      });

    case "transfer":
      return transferOwnership(world, {
        actor: req(valuesWithDefaults, "actor"),
        thingId: req(valuesWithDefaults, "thing"),
        from: req(valuesWithDefaults, "from"),
        to: req(valuesWithDefaults, "to")
      });

    default:
      return world.emit({
        process: "dsl.unknownSection",
        actor: valuesWithDefaults.actor ?? "unknown",
        claims: [],
        body: { kind, values: valuesWithDefaults }
      });
  }
}

function applyWidgetLike(world, values, kind) {
  const actor = req(values, "actor");
  const id = req(values, "id");
  const children = values.children ?? [];
  const parent = resolveDocRef(world, values, {
    idField: "parent",
    refField: "parentRef",
    label: "parent widget"
  });
  const define = defineWidget(world, {
    actor,
    id,
    kind,
    props: collectProps(values, ["actor", "owner", "context", "id", "kind", "children", "slot", "order", "program", "parent", "parentRef"]),
    context: values.context ?? null,
    owner: values.owner ?? values.actor
  });
  const parentAttachment = parent
    ? [attachWidget(world, { actor, parent, child: id, slot: values.slot ?? "children", order: Number.isFinite(Number(values.order)) ? Number(values.order) : 0 })]
    : [];
  const attachments = children.map((child, order) =>
    attachWidget(world, { actor, parent: id, child, slot: values.slot ?? "children", order })
  );
  return [define, ...parentAttachment, ...attachments];
}

function applyFrontendStep(world, values) {
  const triggerEvent = req(values, "frontendEvent");
  const paramValues = { ...values };
  if (!("on" in values) && values.event === triggerEvent) delete paramValues.event;
  const reserved = ["actor", "context", "program", "frontendEvent", "on", "op", "order", "params", "when", "repeat", "after"];
  return defineFrontendStep(world, {
    actor: req(values, "actor"),
    program: req(values, "program"),
    event: triggerEvent,
    op: req(values, "op"),
    order: values.order ?? 0,
    params: { ...(paramValues.params ?? {}), ...collectProps(paramValues, reserved) },
    when: values.when ?? null,
    repeat: values.repeat ?? null,
    after: Array.isArray(values.after) ? values.after : null
  });
}

function routeParams(world, values) {
  const params = values.params && typeof values.params === "object" ? { ...values.params } : {};
  const rootWidget = resolveDocRef(world, values, {
    idField: "rootWidget",
    refField: "rootWidgetRef",
    label: "root widget"
  });
  if (rootWidget) params.rootWidget = rootWidget;
  if (values.page != null) params.page = values.page;
  if (values.frontendProgram != null) params.frontendProgram = values.frontendProgram;
  if (values.liveProjection === true) params.liveProjection = true;
  return Object.keys(params).length ? params : null;
}

function collectProps(values, reserved) {
  const reservedSet = new Set(reserved);
  return { ...(values.props ?? {}), ...Object.fromEntries(Object.entries(values).filter(([k]) => !reservedSet.has(k) && k !== "props")) };
}

function req(values, key) {
  if (!(key in values) || values[key] === undefined) throw new Error(`missing required key: ${key}`);
  return values[key];
}

function stripComment(line) {
  let quote = false;
  let braceDepth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== "\\") quote = !quote;
    if (!quote && ch === "{") braceDepth++;
    if (!quote && ch === "}") braceDepth--;
    if (!quote && braceDepth === 0 && ch === "#") return line.slice(0, i);
  }
  return line;
}

function parseValue(text) {
  if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return JSON.parse(text);
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith("{") && text.endsWith("}")) return parseInlineTable(text);
  if (text.startsWith("[") && text.endsWith("]")) return parseArray(text);
  throw new Error(`unsupported value: ${text}`);
}

function parseInlineTable(text) {
  const inner = text.slice(1, -1).trim();
  if (!inner) return {};
  const out = {};
  for (const part of splitTopLevel(inner, ",")) {
    const eq = part.indexOf("=");
    if (eq < 0) throw new Error(`bad inline table entry: ${part}`);
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    out[key] = parseValue(value);
  }
  return out;
}

function parseArray(text) {
  const inner = text.slice(1, -1).trim();
  if (!inner) return [];
  return splitTopLevel(inner, ",").map(x => parseValue(x.trim()));
}

function splitTopLevel(text, delimiter) {
  const parts = [];
  let quote = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && text[i - 1] !== "\\") quote = !quote;
    if (!quote && ch === "{") braceDepth++;
    if (!quote && ch === "}") braceDepth--;
    if (!quote && ch === "[") bracketDepth++;
    if (!quote && ch === "]") bracketDepth--;
    if (!quote && braceDepth === 0 && bracketDepth === 0 && ch === delimiter) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}
