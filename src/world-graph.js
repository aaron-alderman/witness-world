import { projectors } from "./kernel.js";
import { witnessRelations } from "./modules.js";
import { todoState } from "./projections.js";
import { activeWidgetVersions, frontendProgram } from "./widgets.js";

export function worldGraphProjection(witnesses, { includeWitnesses = false, limitWitnesses = 36 } = {}) {
  const nodeMap = new Map();
  const edgeMap = new Map();
  const relations = witnessRelations(witnesses);
  const owners = projectors.owners(witnesses);
  const main = projectors.main(witnesses);
  const activeVersions = activeWidgetVersions(witnesses);
  const todos = todoState(witnesses);
  const contexts = contextProjection(relations);
  const nodeContext = projectedNodeContexts(witnesses, contexts);
  const semanticLayout = applySemanticLayoutContexts(relations, nodeContext, contexts);

  const addNode = (id, kind, label = id, badges = [], context = null) => {
    if (!id) return;
    const safeLabel = displayLabel(label);
    const safeBadges = normalizeBadges(badges);
    const prev = nodeMap.get(id);
    if (prev) {
      const merged = new Map([...prev.badges, ...safeBadges].map(b => [b.label, b]));
      nodeMap.set(id, {
        ...prev,
        kind: rankKind(prev.kind) <= rankKind(kind) ? prev.kind : kind,
        label: prev.label || safeLabel,
        context: prev.context ?? context ?? nodeContext.get(id) ?? null,
        badges: [...merged.values()]
      });
      return;
    }
    nodeMap.set(id, { id, kind, label: safeLabel, href: `#${encodeURIComponent(id)}`, badges: safeBadges, context: context ?? nodeContext.get(id) ?? null });
  };

  const addEdge = (from, to, rel, witness = null, style = "relation", properties = {}) => {
    if (!from || !to) return;
    const safeRel = displayLabel(rel);
    const key = `${from}\u0000${safeRel}\u0000${to}\u0000${style}`;
    const safeProperties = normalizeProperties(properties);
    if (!edgeMap.has(key)) edgeMap.set(key, { from, to, rel: safeRel, witness, style, properties: safeProperties });
    else if (safeProperties.length) {
      const prev = edgeMap.get(key);
      edgeMap.set(key, { ...prev, properties: mergeProperties(prev.properties, safeProperties) });
    }
  };

  addNode("genesis", "thing", "genesis", [], "system");
  if (main) addNode(main, "thing", main, [{ label: "main" }], nodeContext.get(main) ?? "system");
  if (main) addEdge("genesis", main, "authorizes", null, "authority");

  for (const thing of projectors.things(witnesses)) {
    const badges = [];
    const owner = owners.get(thing);
    if (owner) badges.push({ label: `owner:${owner}` });
    const activeVersion = activeVersions.get(thing);
    if (activeVersion) badges.push({ label: `active:${activeVersion}` });
    const todo = todos.find(t => t.id === thing);
    if (todo) badges.push({ label: todo.done ? "done" : "open" });
    addNode(thing, inferKind(thing, relations), thing, badges, nodeContext.get(thing));
  }

  for (const [contextId, context] of contexts) {
    addNode(contextId, "context", contextId, context.capabilities.map(c => ({ label: c })), context.parent ?? contextId);
  }

  for (const r of relations) {
    if (!isGraphId(r.from) || !isGraphId(r.to) || !isGraphId(r.rel)) continue;
    // Frontend steps are rendered from their structured semantic paths below.
    // The raw relation target is legacy/storage identity and must not leak into the view.
    if (r.rel === "hasFrontendStep") continue;
    // Canvas view-state is perspective-local; the geometry/style/camera/grid tokens are not world objects.
    if (r.rel === "hasGeometry" || r.rel === "hasStyle" || r.rel === "hasCamera" || r.rel === "hasGrid") continue;
    if (r.rel === "hasModuleKind") {
      addNode(r.from, inferKind(r.from, relations), r.from, [{ label: `kind:${displayLabel(r.to)}` }], nodeContext.get(r.from));
      if (isGraphId(r.to)) addNode(r.to, "vocabulary", r.to, [{ label: "kind" }], "system/vocabulary");
      continue;
    }
    if (r.rel === "contextCapability" || r.rel === "hostCapability") {
      addNode(r.from, inferKind(r.from, relations), r.from, [], nodeContext.get(r.from));
      const capabilityContext = capabilityContextFor(r.from, r.to, nodeContext);
      addNode(r.to, "capability", r.to, [], capabilityContext);
      addEdge(r.from, r.to, "capability", r.witness, "capability", r.meta);
      continue;
    }
    if (r.rel === "usesFrontendProgram") {
      addNode(r.from, inferKind(r.from, relations), r.from, [], nodeContext.get(r.from));
      addNode(r.to, inferKind(r.to, relations), r.to, [], nodeContext.get(r.to));
      addEdge(r.from, r.to, "uses program", r.witness, "api", r.meta);
      continue;
    }
    if (r.rel === "owns") {
      addNode(r.from, inferKind(r.from, relations), r.from, [], nodeContext.get(r.from));
      addNode(r.to, inferKind(r.to, relations), r.to, [], nodeContext.get(r.to));
      // Visual direction points to the owner, while source relation remains owner --owns--> thing.
      addEdge(r.to, r.from, "owner", r.witness, "ownership", r.meta);
      continue;
    }
    addNode(r.from, inferKind(r.from, relations), r.from, [], nodeContext.get(r.from));
    addNode(r.to, inferKind(r.to, relations), r.to, [], nodeContext.get(r.to));
    addEdge(r.from, r.to, r.rel, r.witness, relationStyle(r.rel), r.meta);
  }

  addWidgetLayoutProjection(semanticLayout, addNode, addEdge);
  addFrontendProcessGraphs(witnesses, relations, addNode, addEdge, nodeContext, contexts);

  if (includeWitnesses) {
    const recent = witnesses.slice(-limitWitnesses);
    for (const w of recent) {
      const processId = `process:${w.process}`;
      addNode(processId, "process", w.process, [{ label: `count:${countProcess(witnesses, w.process)}` }], nodeContext.get(processId));
      addNode(w.id, "witness", shortWitness(w), [{ label: w.actor }], nodeContext.get(w.id));
      addEdge(processId, w.id, "emitted", null, "witness");
      if (w.cause) addEdge(w.cause, w.id, "caused", null, "witness");
    }
  } else {
    for (const [processName, count] of processCounts(witnesses)) {
      const processId = `process:${processName}`;
      addNode(processId, "process", processName, [{ label: `witnesses:${count}` }], nodeContext.get(processId));
    }
  }

  const details = nodeDetails(witnesses, relations, new Set(nodeMap.keys()));
  const nodes = [...nodeMap.values()].map(node => ({ ...node, ...(details.get(node.id) ?? {}) }));
  const edges = [...edgeMap.values()].filter(e => nodeMap.has(e.from) && nodeMap.has(e.to));
  const { nodes: positioned, groups } = layout(nodes, edges, contexts);
  return { nodes: positioned, edges, groups, stats: { nodes: positioned.length, edges: edges.length, groups: groups.length, witnesses: witnesses.length } };
}

function nodeDetails(witnesses, relations, knownIds = new Set()) {
  const map = new Map();
  const ensure = id => {
    if (!map.has(id)) map.set(id, { properties: [], values: [], sources: [], associationProperties: [] });
    return map.get(id);
  };

  for (const w of witnesses) {
    const targets = new Set();
    for (const c of w.claims ?? []) {
      if (c.op === "thing" && c.id) targets.add(c.id);
      if (c.op === "relation" && c.from) targets.add(c.from);
      if (c.op === "relation" && c.to && isGraphId(c.to) && !looksLikeCapability(c.to) && !looksLikeKind(c.to)) targets.add(c.to);
    }

    for (const target of targets) {
      const d = ensure(target);
      d.lastWitness = w.id;
      d.lastProcess = w.process;
      d.lastActor = w.actor;
      if (w.body && typeof w.body === "object") {
        d.values = mergeProperties(d.values, normalizeValues(w.body, knownIds));
      }
    }

    if (w.process === "dsl.source.annotate" && w.body?.target) {
      const d = ensure(w.body.target);
      d.sources = dedupeObjects([...(d.sources ?? []), {
        file: w.body.file,
        section: w.body.section,
        line: w.body.line ?? null,
        values: w.body.values ?? {},
        witness: w.id
      }], x => `${x.file}\u0000${x.section}\u0000${JSON.stringify(x.values)}`);
    }
  }

  for (const r of relations) {
    if (r.meta && Object.keys(r.meta).length) {
      const row = { rel: r.rel, from: r.from, to: r.to, properties: normalizeProperties(r.meta), witness: r.witness };
      ensure(r.from).associationProperties.push(row);
      ensure(r.to).associationProperties.push(row);
    }
  }

  return map;
}

function normalizeValues(value, knownIds = new Set()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value)
    .filter(([, v]) => v !== undefined && typeof v !== "function")
    .map(([key, value]) => ({ key, value: typedValue(value, knownIds) }));
}

function typedValue(value, knownIds = new Set()) {
  if (value === null) return { type: "null", value: null };
  if (Array.isArray(value)) return { type: "list", items: value.map(v => typedValue(v, knownIds)) };
  if (typeof value === "string") {
    if (knownIds.has(value)) return { type: "ref", target: value };
    return { type: "string", value };
  }
  if (typeof value === "number") return { type: "number", value };
  if (typeof value === "boolean") return { type: "boolean", value };
  if (value && typeof value === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(value)) fields[k] = typedValue(v, knownIds);
    return { type: "record", fields };
  }
  return { type: typeof value, value: String(value) };
}

function normalizeProperties(value, { compactObjects = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value)
    .filter(([, v]) => v !== undefined && typeof v !== "function")
    .map(([key, value]) => ({ key, value: compactObjects && value && typeof value === "object" ? compactValue(value) : value }));
}

function mergeProperties(a = [], b = []) {
  const map = new Map(a.map(p => [p.key, p]));
  for (const p of b) map.set(p.key, p);
  return [...map.values()].sort((x, y) => x.key.localeCompare(y.key));
}

function compactValue(value) {
  if (Array.isArray(value)) return value.length > 6 ? [...value.slice(0, 6), `… ${value.length - 6} more`] : value;
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    return Object.fromEntries(entries.slice(0, 12));
  }
  return value;
}

function dedupeObjects(items, keyFn) {
  const map = new Map();
  for (const item of items) map.set(keyFn(item), item);
  return [...map.values()];
}

function addFrontendProcessGraphs(witnesses, relations, addNode, addEdge, nodeContext, contexts) {
  const programs = relations.filter(r => r.rel === "hasModuleKind" && r.to === "frontendProgram").map(r => r.from);
  const apiContext = ensureContext(contexts, "api");
  apiContext.label = "API Boundary";
  apiContext.kind = "api";

  for (const programId of [...new Set(programs)]) {
    const program = frontendProgram(witnesses, programId);
    if (!program?.graph) continue;
    const programContext = nodeContext.get(programId) ?? "frontend/execution";
    addNode(programId, "process", programId, [{ label: "frontend program" }], programContext);

    const actionNodes = new Map();
    for (const step of program.graph) {
      const semantic = semanticActionContexts(step.path ?? [], programContext);
      let previousSemanticNode = programId;
      for (const ctx of semantic.contexts) {
        const entry = ensureContext(contexts, ctx.id);
        entry.parent = ctx.parent;
        entry.kind = ctx.kind;
        entry.label = ctx.label;

        const anchorId = semanticContextNodeId(ctx.id);
        addNode(anchorId, "context-ref", ctx.label, [{ label: ctx.kind }], ctx.id);
        addEdge(previousSemanticNode, anchorId, "contains", null, "process");
        previousSemanticNode = anchorId;
      }

      if (semantic.actionNode) actionNodes.set(actionKey(step.path ?? []), semantic.actionNode);

      const api = apiCallForStep(step);
      if (api) {
        const source = semantic.actionNode ?? previousSemanticNode;
        addNode(api.id, "api", api.label, [{ label: api.method }], "api");
        addEdge(source, api.id, "requests", null, "api");
        addEdge(api.id, api.handler, "handled by", null, "api");
        addNode(api.handler, "process", api.handler, [{ label: "backend route" }], "backend/routes");
      }
    }
  }
}

function semanticContextNodeId(contextId) {
  return `ctx:${contextId}`;
}

function apiCallForStep(step) {
  const p = step.params ?? {};
  if (step.op === "fetchJson") return apiCall("GET", p.url, "backend.http.get");
  if (step.op === "postJson") return apiCall(p.method ?? "POST", p.url, "backend.http.post");
  if (step.op === "patchJson") return apiCall(p.method ?? "PATCH", p.url, "backend.http.patch");
  if (step.op === "deleteJson") return apiCall(p.method ?? "DELETE", p.url, "backend.http.delete");
  if (step.op === "postWidgetDefinition") return apiCall("POST", "/api/widgets", "backend.widgets.create");
  if (step.op === "activateWidgetVersion") return apiCall("POST", "/api/widget-versions/:soul/activate", "backend.widgetVersion.activate");
  return null;
}

function apiCall(method, url, handler) {
  const safeUrl = String(url || "unknown").replace(/\$\{[^}]+\}/g, ":param");
  return {
    id: `api:${method}:${safeUrl}`,
    method,
    label: `${method} ${safeUrl}`,
    handler
  };
}

function semanticActionContexts(path, parentContext) {
  if (parentContext === "frontend") parentContext = "frontend/execution";
  let parent = parentContext;
  const contexts = [];
  let actionNode = null;

  for (const segment of path) {
    if (segment.kind === "step") continue;
    if (segment.kind === "operation") continue;

    const label = String(segment.id ?? segment.kind);
    const encoded = `${segment.kind}=${segment.id}`;
    const id = `${parent}/${encoded}`;
    contexts.push({ id, parent, kind: segment.kind, label: `${segment.kind}: ${label}` });
    if (segment.kind === "action" || segment.kind === "widget") actionNode = semanticContextNodeId(id);
    parent = id;
  }

  return { contexts, leaf: parent, actionNode };
}

function actionKey(path) {
  return path.filter(s => s.kind !== "step" && s.kind !== "operation").map(s => `${s.kind}:${s.id}`).join("/");
}

function applySemanticLayoutContexts(relations, nodeContext, contexts) {
  const frontendWidgets = ensureContext(contexts, "frontend/widgets");
  frontendWidgets.parent = "frontend";
  frontendWidgets.kind = "widget-area";
  frontendWidgets.label = "Widget definitions";

  const widgetVersions = ensureContext(contexts, "frontend/widgets/versions");
  widgetVersions.parent = "frontend/widgets";
  widgetVersions.kind = "widget-version-area";
  widgetVersions.label = "Widget versions";

  const webpageLayout = ensureContext(contexts, "frontend/webpage-layout");
  webpageLayout.parent = "frontend";
  webpageLayout.kind = "layout-area";
  webpageLayout.label = "Webpage layout";

  const frontendExecution = ensureContext(contexts, "frontend/execution");
  frontendExecution.parent = "frontend";
  frontendExecution.kind = "execution-area";
  frontendExecution.label = "Frontend execution";

  const backendRoutes = ensureContext(contexts, "backend/routes");
  backendRoutes.parent = "backend";
  backendRoutes.kind = "route-area";
  backendRoutes.label = "Backend routes";

  const backendRuntime = ensureContext(contexts, "backend/runtime");
  backendRuntime.parent = "backend";
  backendRuntime.kind = "runtime-area";
  backendRuntime.label = "Backend runtime";

  const backendCapabilities = ensureContext(contexts, "backend/capabilities");
  backendCapabilities.parent = "backend";
  backendCapabilities.kind = "capability-area";
  backendCapabilities.label = "Backend capabilities";

  const frontendRuntime = ensureContext(contexts, "frontend/runtime");
  frontendRuntime.parent = "frontend";
  frontendRuntime.kind = "runtime-area";
  frontendRuntime.label = "Frontend runtime";

  const frontendCapabilities = ensureContext(contexts, "frontend/capabilities");
  frontendCapabilities.parent = "frontend";
  frontendCapabilities.kind = "capability-area";
  frontendCapabilities.label = "Frontend capabilities";

  const vocabulary = ensureContext(contexts, "system/vocabulary");
  vocabulary.parent = "system";
  vocabulary.kind = "vocabulary-area";
  vocabulary.label = "System vocabulary";

  const api = ensureContext(contexts, "api");
  api.label = "API Boundary";
  api.kind = "api";

  const moduleKinds = new Map(relations.filter(r => r.rel === "hasModuleKind").map(r => [r.from, r.to]));
  const widgetIds = [...moduleKinds.entries()].filter(([, kind]) => kind === "widget").map(([id]) => id);
  const widgetVersionIds = [...moduleKinds.entries()].filter(([, kind]) => kind === "widgetVersion").map(([id]) => id);
  const frontendPrograms = [...moduleKinds.entries()].filter(([, kind]) => kind === "frontendProgram").map(([id]) => id);
  const routes = [...moduleKinds.entries()].filter(([, kind]) => kind === "route").map(([id]) => id);
  const serverRunners = [...moduleKinds.entries()].filter(([, kind]) => kind === "serverRunner").map(([id]) => id);
  const backendHosts = [...new Set(relations.filter(r => r.rel === "hostCapability" && ["http.serve", "fs.json.read", "fs.json.write"].includes(r.to)).map(r => r.from))];
  const frontendHosts = [...new Set(relations.filter(r => r.rel === "hostCapability" && ["dom.render", "http.fetch"].includes(r.to)).map(r => r.from))];
  const todoServers = [...new Set(relations.filter(r => r.rel === "usesBackendHost").map(r => r.from))];

  const children = new Map();
  for (const r of relations.filter(r => r.rel === "hasChildWidget")) {
    if (!children.has(r.from)) children.set(r.from, []);
    children.get(r.from).push(r.to);
  }

  const roots = relations.filter(r => r.rel === "targetsRootWidget" || r.rel === "usesRootWidget").map(r => r.to).filter(Boolean);
  const layoutWidgets = new Set();
  const visit = id => {
    if (!id || layoutWidgets.has(id)) return;
    layoutWidgets.add(id);
    for (const child of children.get(id) ?? []) visit(child);
  };
  roots.forEach(visit);

  for (const id of widgetIds) nodeContext.set(id, "frontend/widgets");
  for (const id of widgetVersionIds) nodeContext.set(id, "frontend/widgets/versions");
  for (const id of frontendPrograms) nodeContext.set(id, "frontend/execution");
  for (const id of routes) nodeContext.set(id, "backend/routes");
  for (const id of serverRunners) nodeContext.set(id, "backend/runtime");
  for (const id of backendHosts) nodeContext.set(id, "backend/runtime");
  for (const id of frontendHosts) nodeContext.set(id, "frontend/runtime");
  for (const id of todoServers) nodeContext.set(id, "backend/runtime");

  return { layoutWidgets, children, roots };
}

function addWidgetLayoutProjection(semanticLayout, addNode, addEdge) {
  if (!semanticLayout) return;
  const { layoutWidgets, children, roots } = semanticLayout;
  if (!layoutWidgets?.size) return;

  for (const id of [...layoutWidgets].sort()) {
    const layoutId = `layout:${id}`;
    addNode(layoutId, "layout", id, [{ label: "placement" }], "frontend/webpage-layout");
    addEdge(layoutId, id, "represents", null, "relation");
  }

  for (const [parent, childIds] of children.entries()) {
    if (!layoutWidgets.has(parent)) continue;
    for (const child of childIds) {
      if (!layoutWidgets.has(child)) continue;
      addEdge(`layout:${parent}`, `layout:${child}`, "contains", null, "composition");
    }
  }

  for (const root of [...new Set(roots)].sort()) {
    if (layoutWidgets.has(root)) addNode(`layout-root:${root}`, "layout", "webpage root", [{ label: root }], "frontend/webpage-layout");
    if (layoutWidgets.has(root)) addEdge(`layout-root:${root}`, `layout:${root}`, "root", null, "composition");
  }
}

function contextProjection(relations) {
  const map = new Map();
  for (const r of relations) {
    if (r.rel === "hasModuleKind" && r.to === "context") ensureContext(map, r.from);
  }
  for (const r of relations) {
    if (!map.has(r.from)) continue;
    const ctx = ensureContext(map, r.from);
    if (r.rel === "contextActor") ctx.actor = r.to;
    if (r.rel === "contextCapability") ctx.capabilities.push(r.to);
    if (r.rel === "parentContext") ctx.parent = r.to;
  }
  return map;
}

function ensureContext(map, id) {
  if (!map.has(id)) map.set(id, { id, actor: null, capabilities: [], parent: null });
  return map.get(id);
}

function projectedNodeContexts(witnesses, contexts) {
  const byActor = new Map([...contexts.values()].filter(c => c.actor).map(c => [c.actor, c.id]));
  const nodeContext = new Map();

  // First pass: module/thing definition witnesses own the primary context.
  // Cross-context references such as backend.todoServer -> frontendProgram must not steal context.
  for (const w of witnesses) {
    const ctx = byActor.get(w.actor);
    if (!ctx) continue;
    for (const c of w.claims ?? []) {
      if (c.op === "thing" && c.id) setIfAbsent(nodeContext, c.id, ctx);
      if (c.op === "relation" && c.rel === "hasModuleKind" && c.from) nodeContext.set(c.from, ctx);
    }
  }

  // Second pass: assign local relation sources, but do not drag relation targets across context boundaries.
  for (const w of witnesses) {
    const ctx = byActor.get(w.actor);
    if (!ctx) continue;
    for (const c of w.claims ?? []) {
      if (c.op === "relation") {
        if (c.from) setIfAbsent(nodeContext, c.from, ctx);
        if (shouldAssignRelationTargetContext(c) && c.to) setIfAbsent(nodeContext, c.to, ctx);
      }
    }
    setIfAbsent(nodeContext, `process:${w.process}`, ctx);
    setIfAbsent(nodeContext, w.id, ctx);
  }
  return nodeContext;
}

function shouldAssignRelationTargetContext(c) {
  if (!c.to || looksLikeCapability(c.to) || looksLikeKind(c.to)) return false;
  // These are cross-context references; target context should come from its own definition.
  if (["usesFrontendProgram", "usesFrontendHost", "usesBackendHost", "usesRootWidget"].includes(c.rel)) return false;
  return true;
}

function setIfAbsent(map, key, value) {
  if (!map.has(key)) map.set(key, value);
}

function looksLikeCapability(value) {
  return typeof value === "string" && value.includes(".");
}

function looksLikeKind(value) {
  return ["widget", "widgetVersion", "frontendProgram", "context", "app", "route", "serverRunner", "frontendRunner", "compiler", "description", "compiledArtifact"].includes(value);
}

function capabilityContextFor(source, capability, nodeContext) {
  const sourceContext = nodeContext.get(source) ?? "";
  if (sourceContext.startsWith("backend") || ["http.serve", "fs.json.read", "fs.json.write"].includes(capability)) return "backend/capabilities";
  if (sourceContext.startsWith("frontend") || ["dom.render", "http.fetch"].includes(capability)) return "frontend/capabilities";
  return "system/vocabulary";
}

function relationStyle(rel) {
  if (rel === "contextCapability" || rel === "hostCapability") return "capability";
  if (rel === "hasChildWidget") return "composition";
  if (rel === "hasFrontendStep") return "process";
  return "relation";
}

function inferKind(id, relations) {
  if (!isGraphId(id)) return "thing";
  if (id.startsWith("w_")) return "witness";
  if (id.startsWith("process:")) return "process";
  if (id.startsWith("step:")) return "step";
  if (id.startsWith("api:")) return "api";
  if (id.startsWith("layout:")) return "layout";
  const moduleKind = relations.find(r => r.from === id && r.rel === "hasModuleKind")?.to;
  if (moduleKind === "context") return "context";
  if (moduleKind?.includes("widget")) return "widget";
  if (moduleKind) return "module";
  return "thing";
}

function isGraphId(value) {
  return typeof value === "string" && value.length > 0;
}

function rankKind(kind) {
  return { context: 0, "context-ref": 1, thing: 1, module: 2, widget: 3, layout: 3, process: 4, step: 5, api: 5, capability: 5, vocabulary: 5, witness: 6 }[kind] ?? 9;
}

function shortWitness(w) {
  return `${w.process}#${String(w.id).slice(-6)}`;
}

function countProcess(witnesses, process) {
  return witnesses.filter(w => w.process === process).length;
}

function processCounts(witnesses) {
  const counts = new Map();
  for (const w of witnesses) counts.set(w.process, (counts.get(w.process) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function displayLabel(value) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    if (typeof value.label === "string") return value.label;
    if (typeof value.id === "string") return value.id;
    return JSON.stringify(value);
  }
  return String(value);
}

function normalizeBadges(badges) {
  return (badges ?? []).map(b => ({ label: displayLabel(b?.label ?? b) })).filter(b => b.label);
}

function layout(nodes, edges, contexts) {
  const contextIds = [...contexts.keys()].sort((a, b) => contextOrder(a) - contextOrder(b) || a.localeCompare(b));
  const contextSet = new Set(contextIds);
  const nodesByContext = new Map();
  for (const node of nodes) {
    const ctx = contextSet.has(node.context) ? node.context : (node.kind === "context" && contextSet.has(node.id) ? node.id : "unscoped");
    if (!nodesByContext.has(ctx)) nodesByContext.set(ctx, []);
    nodesByContext.get(ctx).push({ ...node, context: ctx });
  }

  const edgeWeight = new Map();
  for (const e of edges) {
    edgeWeight.set(e.from, (edgeWeight.get(e.from) ?? 0) + 1);
    edgeWeight.set(e.to, (edgeWeight.get(e.to) ?? 0) + 1);
  }

  const children = new Map();
  for (const id of contextIds) {
    const parent = contexts.get(id)?.parent;
    if (parent && contextSet.has(parent) && parent !== id) {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(id);
    }
  }
  for (const ids of children.values()) ids.sort((a, b) => contextOrder(a) - contextOrder(b) || a.localeCompare(b));

  const roots = contextIds.filter(id => {
    const parent = contexts.get(id)?.parent;
    return !parent || parent === id || !contextSet.has(parent);
  });
  if (nodesByContext.has("unscoped")) roots.push("unscoped");

  const positioned = [];
  const groups = [];
  const layerByKind = { context: 0, "context-ref": 0, thing: 1, module: 1, widget: 2, layout: 2, process: 3, step: 4, api: 4, capability: 4, vocabulary: 4, witness: 5 };

  function layoutContext(groupId, x, y) {
    const groupNodes = nodesByContext.get(groupId) ?? [];
    const childIds = children.get(groupId) ?? [];
    const byLayer = new Map();
    for (const n of groupNodes) {
      const layer = layerByKind[n.kind] ?? 2;
      if (!byLayer.has(layer)) byLayer.set(layer, []);
      byLayer.get(layer).push(n);
    }

    const groupX = x;
    const groupY = y;
    const labelPad = 42;
    let localHeight = labelPad;
    let maxLayer = Math.max(0, ...[...byLayer.keys()]);

    for (const [layer, items] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
      items.sort((a, b) => (edgeWeight.get(b.id) ?? 0) - (edgeWeight.get(a.id) ?? 0) || a.label.localeCompare(b.label));
      items.forEach((n, i) => {
        const nx = groupX + 28 + layer * 230;
        const ny = groupY + labelPad + i * 86;
        localHeight = Math.max(localHeight, ny - groupY + 78);
        positioned.push({ ...n, x: nx, y: ny });
      });
    }

    let childY = groupY + localHeight + 14;
    let maxChildWidth = 0;
    for (const childId of childIds) {
      const child = layoutContext(childId, groupX + 24, childY);
      childY += child.height + 16;
      maxChildWidth = Math.max(maxChildWidth, child.width + 48);
    }

    const width = Math.max(880, 80 + (maxLayer + 1) * 230, maxChildWidth);
    const height = Math.max(120, childIds.length ? childY - groupY + 8 : localHeight + 18);
    const context = contexts.get(groupId);
    groups.push({ id: groupId, label: groupId === "unscoped" ? "Unscoped" : (context?.label ?? groupId), parent: context?.parent ?? null, x: groupX, y: groupY, width, height });
    return { width, height };
  }

  let yCursor = 24;
  for (const groupId of roots) {
    const hasNodes = (nodesByContext.get(groupId) ?? []).length > 0;
    const hasChildren = (children.get(groupId) ?? []).length > 0;
    if (!hasNodes && !hasChildren && groupId === "unscoped") continue;
    const result = layoutContext(groupId, 24, yCursor);
    yCursor += result.height + 28;
  }
  return { nodes: positioned, groups };
}

function contextOrder(id) {
  return { common: 0, backend: 1, frontend: 2, system: 3 }[id] ?? 10;
}

export function astNodesProjection(witnesses) {
  const byFile = new Map();
  const byTarget = new Map();
  for (const w of witnesses) {
    if (w.process !== "dsl.source.annotate" || !w.body?.file) continue;
    const { file, section, line, target, values } = w.body;
    const node = { id: `ast:${section}:${target}`, section, line: line ?? null, target, values, witness: w.id, file };
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(node);
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target).push(node);
  }
  return { byFile, byTarget };
}
