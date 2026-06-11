import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld, thing, relation } from "../src/kernel.js";
import { worldGraphProjection } from "../src/world-graph.js";
import { declareBackendHost, declareFrontendHost, startTodoServer } from "../src/host.js";
import { applyWitnessDocs, loadWitnessTomlFile } from "../src/dsl.js";
import { renderWidgetPage } from "../src/widgets.js";

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "witness-world-graph-"));
  return path.join(dir, "todos.json");
}

test("world graph projection returns deterministic positioned nodes and relation edges", () => {
  const world = createWorld();
  world.emit({
    process: "test.defineWorldGraphFacts",
    actor: "adam",
    claims: [thing("sourcery"), thing("widget_w"), relation("sourcery", "owns", "widget_w")],
    body: {}
  });

  const a = worldGraphProjection(world.allWitnesses());
  const b = worldGraphProjection(world.allWitnesses());

  assert.deepEqual(a, b);
  assert.equal(a.nodes.some(n => n.id === "sourcery" && Number.isFinite(n.x) && Number.isFinite(n.y)), true);
  assert.equal(a.edges.some(e => e.from === "widget_w" && e.rel === "owner" && e.to === "sourcery" && e.style === "ownership"), true);
  assert.equal(a.nodes.some(n => n.id === "widget_w" && n.badges.some(b => b.label === "owner:sourcery")), true);
});

test("world graph hides canvas view-state vocabulary nodes and edges", async () => {
  const { createThing } = await import("../src/kernel.js");
  const { createPerspective, placeThing, styleInstance, setCamera, setGrid } = await import("../src/canvas-processes.js");
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "customer" });
  const perspective = createPerspective(world, { actor: "aaron", title: "Workspace" }).body.id;
  const instance = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 10, y: 20 }).body.instance;
  styleInstance(world, { actor: "aaron", perspective, instance, style: { color: "#fff" } });
  setCamera(world, { actor: "aaron", perspective, x: 1, y: 2, zoom: 1 });
  setGrid(world, { actor: "aaron", perspective, snap: true, size: 20 });

  const graph = worldGraphProjection(world.allWitnesses());
  for (const token of ["geometry", "style", "camera", "grid"]) {
    assert.equal(graph.nodes.some(n => n.id === token), false, `unexpected node ${token}`);
  }
  for (const rel of ["hasGeometry", "hasStyle", "hasCamera", "hasGrid"]) {
    assert.equal(graph.edges.some(e => e.rel === rel), false, `unexpected edge ${rel}`);
  }
  assert.equal(graph.nodes.some(n => n.id === perspective), true);
});

test("world graph groups nodes into context boxes and hides witness nodes by default", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());

  assert.equal(graph.groups.some(g => g.id === "backend"), true);
  assert.equal(graph.groups.some(g => g.id === "frontend"), true);
  assert.equal(graph.nodes.some(n => n.kind === "witness"), false);
  assert.equal(graph.nodes.some(n => n.kind === "step"), false);
  assert.equal(graph.nodes.some(n => n.id === "ctx:frontend/execution/program=todo_frontend_program/trigger=load" && n.label === "trigger: load"), true);
});


test("world graph renders frontend process actions as semantic nested path contexts without step nodes", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());
  const submitContext = graph.groups.find(g => String(g.label).includes("trigger: submit"));
  const todoFormContext = graph.groups.find(g => String(g.label).includes("widget: todo_form"));
  const stepNode = graph.nodes.find(n => n.kind === "step");

  assert.ok(submitContext);
  assert.ok(todoFormContext);
  assert.equal(stepNode, undefined);
});

test("world graph can include witness nodes when explicitly requested", () => {
  const world = createWorld();
  world.emit({
    process: "test.defineWorldGraphFacts",
    actor: "adam",
    claims: [thing("sourcery")],
    body: {}
  });

  const graph = worldGraphProjection(world.allWitnesses(), { includeWitnesses: true });

  assert.equal(graph.nodes.some(n => n.kind === "witness"), true);
});


test("demo UI includes world graph widget and frontend render operation", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startTodoServer(world, {
    actor: "adam",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    rootWidget: "todo_app_widget",
    frontendProgram: "todo_frontend_program",
    worldRootWidget: "world_graph_page",
    worldFrontendProgram: "world_graph_program",
    storePath: await tempStore()
  });

  try {
    const homeHtml = await fetch(server.url).then(r => r.text());
    assert.doesNotMatch(homeHtml, /<h1[^>]*>World Graph<\/h1>/);
    assert.doesNotMatch(homeHtml, /data-widget="world_graph_canvas"/);
    assert.match(homeHtml, /\/world/);

    const html = await fetch(`${server.url}/world`).then(r => r.text());
    assert.match(html, /World Graph/);
    assert.match(html, /renderWorldGraph/);
    assert.match(html, /world-graph-inspector/);
    assert.match(html, /world-ref-button/);
    assert.match(html, /data-world-kind/);
    assert.match(html, /data-world-clear-kind/);
    assert.match(html, /world-node-selected/);
    assert.match(html, /data-world-node-id/);
    assert.match(html, /\/api\/world-graph/);

    const graph = await fetch(`${server.url}/api/world-graph`).then(r => r.json());
    assert.equal(Array.isArray(graph.graph.nodes), true);
    assert.equal(Array.isArray(graph.graph.edges), true);
    assert.equal(graph.graph.nodes.some(n => n.id === "todo_app_widget"), true);
    assert.equal(world.allObservations().some(w => w.process === "backend.readWorldGraph"), true);
  } finally {
    await server.close();
  }
});

test("world graph projection skips malformed legacy relation witnesses", () => {
  const witnesses = [
    {
      id: "w_legacy_bad_relation",
      process: "legacy",
      actor: "adam",
      cause: null,
      claims: [
        { op: "thing", id: "backendHost" },
        { op: "relation", rel: "owns", to: "backendHost", meta: {} }
      ],
      body: {}
    }
  ];

  const graph = worldGraphProjection(witnesses);

  assert.equal(Array.isArray(graph.nodes), true);
  assert.equal(Array.isArray(graph.edges), true);
  assert.equal(graph.edges.some(e => e.to === "backendHost" && e.rel === "owns"), false);
});

test("todo server logs request start, projection, and finish for world graph", async () => {
  const lines = [];
  const logger = {
    info: (event, fields) => lines.push({ level: "info", event, fields }),
    warn: (event, fields) => lines.push({ level: "warn", event, fields }),
    error: (event, fields) => lines.push({ level: "error", event, fields })
  };

  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startTodoServer(world, {
    actor: "adam",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    rootWidget: "todo_app_widget",
    frontendProgram: "todo_frontend_program",
    storePath: await tempStore(),
    logger
  });

  try {
    const response = await fetch(`${server.url}/api/world-graph`);
    assert.equal(response.status, 200);
    await response.json();

    assert.equal(lines.some(x => x.event === "http.request.start" && x.fields.url === "/api/world-graph"), true);
    assert.equal(lines.some(x => x.event === "worldGraph.projected" && Number.isFinite(x.fields.nodes)), true);
    assert.equal(lines.some(x => x.event === "http.request.finish" && x.fields.statusCode === 200), true);
  } finally {
    await server.close();
  }
});

test("world graph keeps frontend program actions in frontend context and hides process steps", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());

  const program = graph.nodes.find(n => n.id === "todo_frontend_program");
  assert.ok(program);
  assert.equal(program.context, "frontend/execution");

  const leakedLegacyStep = graph.nodes.find(n => String(n.id).includes("todo_frontend_program:"));
  assert.equal(leakedLegacyStep, undefined);
  assert.equal(graph.nodes.some(n => n.kind === "step"), false);

  const activateAction = graph.nodes.find(n => n.id === "ctx:frontend/execution/program=todo_frontend_program/trigger=click/action=activateWidgetVersion");
  assert.ok(activateAction);
  assert.equal(String(activateAction.context).startsWith("frontend/"), true);
});

test("world graph groups widgets, layout, execution, routes, and API as semantic areas", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());

  assert.ok(graph.groups.find(g => g.id === "frontend/webpage-layout" && g.parent === "frontend"));
  assert.ok(graph.groups.find(g => g.id === "frontend/widgets" && g.parent === "frontend"));
  assert.ok(graph.groups.find(g => g.id === "frontend/widgets/versions" && g.parent === "frontend/widgets"));
  assert.ok(graph.groups.find(g => g.id === "frontend/execution" && g.parent === "frontend"));
  assert.ok(graph.groups.find(g => g.id === "backend/routes" && g.parent === "backend"));
  assert.ok(graph.groups.find(g => g.id === "api" && g.label === "API Boundary"));

  const rootWidget = graph.nodes.find(n => n.id === "todo_app_widget");
  const rootPlacement = graph.nodes.find(n => n.id === "layout:todo_app_widget");
  const versionedWidget = graph.nodes.find(n => n.id === "todo_versioned_banner_v1");
  const program = graph.nodes.find(n => n.id === "todo_frontend_program");

  assert.equal(rootWidget.context, "frontend/widgets");
  assert.equal(rootPlacement.context, "frontend/webpage-layout");
  assert.equal(versionedWidget.context, "frontend/widgets/versions");
  assert.equal(program.context, "frontend/execution");
  assert.equal(graph.edges.some(e => e.from === "layout:todo_app_widget" && e.to === "todo_app_widget" && e.rel === "represents"), true);
});

test("world graph renders explicit API boundary for frontend to backend communication", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());

  const activateAction = graph.nodes.find(n => n.id === "ctx:frontend/execution/program=todo_frontend_program/trigger=click/action=activateWidgetVersion");
  assert.ok(activateAction);

  const apiNode = graph.nodes.find(n => n.kind === "api" && n.label === "POST /api/widget-versions/:soul/activate");
  assert.ok(apiNode);
  assert.equal(apiNode.context, "api");

  assert.equal(graph.edges.some(e => e.from === activateAction.id && e.to === apiNode.id && e.rel === "requests" && e.style === "api"), true);
  assert.equal(graph.edges.some(e => e.from === apiNode.id && e.to === "backend.widgetVersion.activate" && e.rel === "handled by" && e.style === "api"), true);
});


test("world graph stops at action nodes and leaves process step detail to process views", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());

  const actionNode = graph.nodes.find(n => n.id === "ctx:frontend/execution/program=todo_frontend_program/trigger=click/action=activateWidgetVersion");
  assert.ok(actionNode);
  assert.equal(actionNode.label, "action: activateWidgetVersion");

  assert.equal(graph.nodes.some(n => n.kind === "step"), false);
  assert.equal(graph.edges.some(e => e.rel === "has step"), false);
  assert.equal(graph.edges.some(e => e.from === "todo_frontend_program" && e.to === actionNode.id && e.rel === "contains"), false);
  assert.equal(graph.edges.some(e => e.from === actionNode.id && e.rel === "requests" && e.style === "api"), true);
});

test("world graph scopes runtime hosts, capabilities, and vocabulary", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());

  assert.equal(graph.nodes.find(n => n.id === "backendHost")?.context, "backend/runtime");
  assert.equal(graph.nodes.find(n => n.id === "frontendHost")?.context, "frontend/runtime");
  assert.equal(graph.nodes.find(n => n.id === "demo_todo_server")?.context, "backend/runtime");
  assert.equal(graph.nodes.find(n => n.id === "fs.json.read")?.context, "backend/capabilities");
  assert.equal(graph.nodes.find(n => n.id === "dom.render")?.context, "frontend/capabilities");
  assert.equal(graph.nodes.find(n => n.id === "widget")?.context, "system/vocabulary");
  assert.equal(graph.nodes.some(n => n.context === "unscoped" && ["widget", "frontendProgram", "fs.json.read"].includes(n.id)), false);
});

test("world graph exposes object properties, association metadata, and DSL source provenance", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());
  const app = graph.nodes.find(n => n.id === "demo_todo_server");
  assert.ok(app);
  assert.ok(app.values.some(p => p.key === "id" && p.value.type === "ref" && p.value.target === "demo_todo_server"));
  assert.ok(app.sources?.some(s => s.file.endsWith("backend.wtoml") && s.section === "todoServer"));

  const edgeWithMeta = graph.edges.find(e => e.rel === "hasChildWidget" && e.properties?.some(p => p.key === "order"));
  assert.ok(edgeWithMeta);
});

test("world page selected object inspector includes properties, associations, association properties, and source definition sections", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);
  const html = renderWidgetPage(world, { rootWidget: "world_graph_page", frontendProgram: "world_graph_program", appConfig: { page: "world" } });

  assert.match(html, /Object properties/);
  assert.match(html, /Values/);
  assert.match(html, /world-value-widget/);
  assert.match(html, /world-value-type/);
  assert.match(html, /Associations from this object/);
  assert.match(html, /Association properties/);
  assert.match(html, /Source definition/);
  assert.match(html, /world-source-ast/);
});


test("world graph typed values preserve arrays and refs for inspector rendering", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());
  const app = graph.nodes.find(n => n.id === "demo_todo_server");
  assert.ok(app);

  const appRoot = graph.nodes.find(n => n.id === "demo_todo_app");
  assert.ok(appRoot);
  const imports = appRoot.values.find(v => v.key === "imports")?.value;
  assert.equal(imports?.type, "list");
  assert.equal(imports.items.every(item => item.type === "string"), true);

  const rootWidget = graph.nodes.find(n => n.id === "todo_app_widget");
  const active = rootWidget.values.find(v => v.key === "active")?.value;
  if (active) assert.ok(["boolean", "string", "number", "record", "list", "ref", "null"].includes(active.type));
});

test("world page CSS gives inspector and canvas independent scroll containers", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);
  const html = renderWidgetPage(world, { rootWidget: "world_graph_page", frontendProgram: "world_graph_program", appConfig: { page: "world" } });

  assert.match(html, /world-graph-inspector \{[^}]*overflow-y: scroll/s);
  assert.match(html, /world-graph-canvas \{[^}]*overflow: scroll/s);
  assert.match(html, /world-graph-content/);
});

test("world page supports source document and primitive browser UI modes", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);
  const html = renderWidgetPage(world, { rootWidget: "world_graph_page", frontendProgram: "world_graph_program", appConfig: { page: "world" } });

  assert.match(html, /world-document-view/);
  assert.match(html, /data-world-source-file/);
  assert.match(html, /world-primitive-browser/);
  assert.match(html, /data-world-primitive-kind/);
  assert.match(html, /world-graph-canvas/);
});

test("source endpoint returns only witnessed imported DSL files", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  const storePath = await tempStore();
  const server = await startTodoServer(world, {
    actor: "adam",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    storePath,
    rootWidget: "todo_app_widget",
    frontendProgram: "todo_frontend_program",
    worldRootWidget: "world_graph_page",
    worldFrontendProgram: "world_graph_program"
  });

  try {
    const imported = docs.find(doc => doc.file?.endsWith("frontend.wtoml"))?.file;
    assert.ok(imported);
    const ok = await fetch(`${server.url}/api/source?file=${encodeURIComponent(imported)}`);
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.file.endsWith("frontend.wtoml"), true);
    assert.match(body.text, /world_graph_page/);

    const denied = await fetch(`${server.url}/api/source?file=${encodeURIComponent(path.join(process.cwd(), "package.json"))}`);
    assert.equal(denied.status, 404);
  } finally {
    await server.close();
  }
});

test("world browser exposes first-class graph primitive and source modes", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-server.wtoml"));
  applyWitnessDocs(world, docs);
  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "world_graph_page", frontendProgram: "world_graph_program", appConfig: { page: "world" } });
  assert.match(html, /modeButton\('graph', 'Graph'\)/);
  assert.match(html, /modeButton\('primitive', 'Primitive Browser'\)/);
  assert.match(html, /modeButton\('source', 'Source Browser'\)/);
  assert.match(html, /world-source-workbench/);
  assert.match(html, /world-source-highlight/);
});
