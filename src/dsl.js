import fs from "node:fs/promises";
import path from "node:path";
import { createThing, transferOwnership, cloneThing, relation, thing } from "./kernel.js";
import {
  createCompiler,
  createDescription,
  compileDescription,
  createServerRunner,
  defineRoute,
  serveRoute,
  createFrontendRunner,
  createViewDescription,
  renderView,
  emitUserAction
} from "./modules.js";
import { defineWidget, defineWidgetVersion, activateWidgetVersion, attachWidget, defineFrontendProgram, defineFrontendStep } from "./widgets.js";

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

  for (const raw of source.split(/\r?\n/)) {
    const line = stripComment(raw).trim();
    if (!line) continue;

    const arraySection = line.match(/^\[\[\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\]\]$/);
    if (arraySection) {
      current = { kind: arraySection[1], values: {} };
      docs.push(current);
      continue;
    }

    const tableSection = line.match(/^\[\s*([A-Za-z_][A-Za-z0-9_-]*)(?:\.([A-Za-z_][A-Za-z0-9_-]*))?\s*\]$/);
    if (tableSection) {
      current = { kind: tableSection[1], values: tableSection[2] ? { id: tableSection[2] } : {} };
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
    body: { target, file: doc.file, section: doc.kind, values: doc.values ?? {} }
  }));
}

function sourceTargets(kind, values) {
  const ids = [];
  if (values.id) ids.push(values.id);
  if (kind === "widgetVersion") {
    if (values.soul) ids.push(values.soul);
    if (values.version) ids.push(values.version);
  }
  if (kind === "activateWidgetVersion" && values.soul) ids.push(values.soul);
  if ((kind === "frontendStep" || kind === "step") && values.program) ids.push(values.program);
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
      return world.emit({
        process: "context.define",
        actor,
        claims: [
          thing(id),
          relation(id, "hasModuleKind", "context"),
          relation(id, "contextActor", actor),
          ...capabilities.map(capability => relation(id, "contextCapability", capability))
        ],
        body: { id, actor, capabilities }
      });
    }

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
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "route":
      return defineRoute(world, {
        actor: req(valuesWithDefaults, "actor"),
        id: req(valuesWithDefaults, "id"),
        path: req(valuesWithDefaults, "path"),
        serves: req(valuesWithDefaults, "serves"),
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "serve":
      return serveRoute(world, {
        actor: req(valuesWithDefaults, "actor"),
        serverRunner: req(valuesWithDefaults, "serverRunner"),
        route: req(valuesWithDefaults, "route")
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
        rootWidget: req(valuesWithDefaults, "rootWidget"),
        owner: valuesWithDefaults.owner ?? valuesWithDefaults.actor
      });

    case "frontendStep":
      return applyFrontendStep(world, valuesWithDefaults);

    case "step":
      return applyFrontendStep(world, { ...valuesWithDefaults, event: valuesWithDefaults.event ?? valuesWithDefaults.on });

    case "todoServer":
      return world.emit({
        process: "dsl.todoServer.define",
        actor: req(valuesWithDefaults, "actor"),
        claims: [
          relation(req(valuesWithDefaults, "id"), "usesBackendHost", req(valuesWithDefaults, "backendHost")),
          relation(req(valuesWithDefaults, "id"), "usesFrontendHost", req(valuesWithDefaults, "frontendHost")),
          relation(req(valuesWithDefaults, "id"), "usesRootWidget", req(valuesWithDefaults, "rootWidget")),
          ...(valuesWithDefaults.frontendProgram ? [relation(req(valuesWithDefaults, "id"), "usesFrontendProgram", valuesWithDefaults.frontendProgram)] : []),
          ...(valuesWithDefaults.worldRootWidget ? [relation(req(valuesWithDefaults, "id"), "usesWorldWidget", valuesWithDefaults.worldRootWidget)] : []),
          ...(valuesWithDefaults.worldFrontendProgram ? [relation(req(valuesWithDefaults, "id"), "usesWorldFrontendProgram", valuesWithDefaults.worldFrontendProgram)] : [])
        ],
        body: valuesWithDefaults
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
  const define = defineWidget(world, {
    actor,
    id,
    kind,
    props: collectProps(values, ["actor", "owner", "context", "id", "kind", "children", "slot", "order", "program"]),
    owner: values.owner ?? values.actor
  });
  const attachments = children.map((child, order) =>
    attachWidget(world, { actor, parent: id, child, slot: values.slot ?? "children", order })
  );
  return [define, ...attachments];
}

function applyFrontendStep(world, values) {
  const reserved = ["actor", "context", "program", "event", "on", "op", "order", "params"];
  return defineFrontendStep(world, {
    actor: req(values, "actor"),
    program: req(values, "program"),
    event: req(values, "event"),
    op: req(values, "op"),
    order: values.order ?? 0,
    params: { ...(values.params ?? {}), ...collectProps(values, reserved) }
  });
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
