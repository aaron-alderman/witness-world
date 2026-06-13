import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld, thing, relation } from "../src/kernel.js";
import { worldGraphProjection } from "../plugins/inspect/world-graph.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessDocs, applyWitnessDocsWithRuntimePlugins, applyWitnessToml, loadWitnessTomlFile, parseWitnessToml } from "../src/dsl.js";
import { renderWidgetPage } from "../plugins/inspect/widget-page.js";
import { applyDesire, compileRvmFileToDesirePlus, compileRvmToDesirePlus, normalizeDesirePlusToDesire } from "../src/desire/index.js";

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
  const { createPerspective, placeThing, styleInstance, setCamera, setGrid } = await import("../plugins/canvas/canvas-processes.js");
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

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
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

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
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

test("world graph surfaces trait, valueType, and processSpec nodes with compatibility edges", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());
  assert.equal(graph.nodes.some(n => n.kind === "trait" && n.id === "textual"), true);
  assert.equal(graph.nodes.some(n => n.kind === "valueType" && n.id === "widget.kind"), true);
  assert.equal(graph.nodes.some(n => n.kind === "processSpec" && n.id === "widget_define_spec"), true);
  assert.equal(graph.edges.some(e => e.from === "widget.kind" && e.rel === "compatibleWith" && e.to === "enumerated"), true);

  const specNode = graph.nodes.find(n => n.id === "widget_define_spec");
  assert.ok(specNode);
  assert.equal(specNode.values.some(v => v.key === "process" && v.value.type === "string" && v.value.value === "widget.define"), true);
  assert.equal(specNode.values.some(v => v.key === "inputs" && v.value.type === "list"), true);
});

test("world graph surfaces native RVM semantic message/entity/process/boundary nodes", () => {
  const world = createWorld();
  const desire = normalizeDesirePlusToDesire(compileRvmToDesirePlus(`
context todo_items {
}

message TodoSelectedPayload {
  fields {
    item_id: string
  }
}

entity TodoRecord {
  context todo_items
  durable_state todo_store
  id_prop item_id
}

graph_node TodoRecordGraph {
  kind entity
  entity_type TodoRecord
}

graph_edge TodoFlowReadsTodoRecord {
  from TodoFlow
  to TodoRecordGraph
  edge_type reads
}

process TodoFlow {
  handles TodoSelectedPayload
  emits TodoSelectedPayload
}

boundary TodoApi {
  capability todo.read
}

actor TodoSession owns TodoRecord {
  collection_context todo_items
  entity TodoRecord
  list_projection todos_list_projection
  detail_projection todo_detail_projection
  durable_state todo_store
}
`, { file: "C:/demo/todo.rvm" }));
  applyDesire(world, desire);

  const graph = worldGraphProjection(world.allWitnesses());
  assert.equal(graph.nodes.some(n => n.kind === "message" && n.id === "TodoSelectedPayload"), true);
  assert.equal(graph.nodes.some(n => n.kind === "entity" && n.id === "TodoRecord"), true);
  assert.equal(graph.nodes.some(n => n.kind === "process" && n.id === "TodoFlow"), true);
  assert.equal(graph.nodes.some(n => n.kind === "boundary" && n.id === "TodoApi"), true);
  assert.equal(graph.nodes.some(n => n.kind === "store" && n.id === "todo_store"), true);
  assert.equal(graph.nodes.some(n => n.kind === "projection" && n.id === "todos_list_projection"), true);
  assert.equal(graph.edges.some(e => e.from === "TodoFlow" && e.rel === "handlesMessage" && e.to === "TodoSelectedPayload"), true);
  assert.equal(graph.edges.some(e => e.from === "TodoApi" && e.rel === "depends on" && e.to === "todo.read"), true);
  assert.equal(graph.edges.some(e => e.from === "todo_store" && e.rel === "inContext" && e.to === "todo_items"), true);
  assert.equal(graph.edges.some(e => e.from === "todo_store" && e.rel === "storesEntity" && e.to === "TodoRecord"), true);
  assert.equal(graph.edges.some(e => e.from === "TodoSession" && e.rel === "usesStore" && e.to === "todo_store"), true);
  assert.equal(graph.edges.some(e => e.from === "todos_list_projection" && e.rel === "projectsFrom" && e.to === "todo_store"), true);

  const entityNode = graph.nodes.find(n => n.id === "TodoRecord");
  assert.ok(entityNode);
  assert.equal(graph.edges.some(e => e.from === "TodoRecord" && e.rel === "usesStore" && e.to === "todo_store"), true);
});

test("world graph surfaces native RVM capability and policy nodes", () => {
  const world = createWorld();
  const desire = normalizeDesirePlusToDesire(compileRvmToDesirePlus(`
graph_context scientific_entities {
}

capability host_source_read {
  in scientific_entities
  source builtin
  state configured
  provide "capability:read:source_text"
}

read source_text {
  capability "capability:read:source_text"
}

command OpenPromotionReview {
  fields {
    gate_id: "promotion_gate"
  }
}

event PromotionGateSatisfied {
  writes {
    GovernanceLoading: false
  }
}

adapter GovernancePromotionReviewSbtp using SBTP {
  command OpenPromotionReview
  kind command
  route /api/runtime/materialized-host-operation
  success_event PromotionGateSatisfied
}

process GovernanceWorkflow {
  handles OpenPromotionReview
  emits PromotionGateSatisfied
}

policy GovernanceEvidencePolicy {
  subject GovernanceWorkflow
  initial_state monitoring
  state_field policy_state
  ready_state aligned_evidence
}
`, { file: "C:/demo/governance.rvm" }));
  applyDesire(world, desire);

  const graph = worldGraphProjection(world.allWitnesses());
  assert.equal(graph.nodes.some(n => n.kind === "capability" && n.id === "host_source_read"), true);
  assert.equal(graph.nodes.some(n => n.kind === "policy" && n.id === "GovernanceEvidencePolicy"), true);
  assert.equal(graph.nodes.some(n => n.kind === "message" && n.id === "OpenPromotionReview"), true);
  assert.equal(graph.nodes.some(n => n.kind === "message" && n.id === "PromotionGateSatisfied"), true);
  assert.equal(graph.nodes.some(n => n.kind === "boundary" && n.id === "source_text"), true);
  assert.equal(graph.nodes.some(n => n.kind === "boundary" && n.id === "GovernancePromotionReviewSbtp"), true);
  assert.equal(graph.edges.some(e => e.from === "host_source_read" && e.rel === "provides" && e.to === "capability:read:source_text"), true);
  assert.equal(graph.edges.some(e => e.from === "source_text" && e.rel === "depends on" && e.to === "capability:read:source_text"), true);
  assert.equal(graph.edges.some(e => e.from === "GovernancePromotionReviewSbtp" && e.rel === "handlesMessage" && e.to === "OpenPromotionReview"), true);
  assert.equal(graph.edges.some(e => e.from === "GovernancePromotionReviewSbtp" && e.rel === "emitsMessage" && e.to === "PromotionGateSatisfied"), true);
  assert.equal(graph.edges.some(e => e.from === "GovernanceEvidencePolicy" && e.rel === "governs" && e.to === "GovernanceWorkflow"), true);
  assert.equal(graph.nodes.find(n => n.id === "host_source_read")?.context, "scientific_entities");
});

test("world graph surfaces native RVM projection and surface nodes", () => {
  const world = createWorld();
  const desire = normalizeDesirePlusToDesire(compileRvmToDesirePlus(`
derive TodoItemSummary {
  kind todo_item_summary
}

derive InspectorClosed {
  kind bool_not
  source InspectorOpen
}

view TodoRuntimePage {
  kind runtime_root
  class runtime-shell.runtime-page
  children {
    todo_page_shell
    reflective_hint_root
  }
}
`, { file: "C:/demo/surface.rvm" }));
  applyDesire(world, desire);

  const graph = worldGraphProjection(world.allWitnesses());
  assert.equal(graph.nodes.some(n => n.kind === "projection" && n.id === "TodoItemSummary"), true);
  assert.equal(graph.nodes.some(n => n.kind === "projection" && n.id === "InspectorClosed"), true);
  assert.equal(graph.nodes.some(n => n.kind === "surface" && n.id === "TodoRuntimePage"), true);
  assert.equal(graph.edges.some(e => e.from === "InspectorClosed" && e.rel === "projectsFrom" && e.to === "InspectorOpen"), true);
  assert.equal(graph.edges.some(e => e.from === "TodoRuntimePage" && e.rel === "hasChildSurface" && e.to === "todo_page_shell"), true);
});

test("world graph surfaces native RVM dataflow and chart nodes with provenance", () => {
  const world = createWorld();
  const file = "C:/demo/goodman.rvm";
  const desire = normalizeDesirePlusToDesire(compileRvmToDesirePlus(`
model BoltFatigue {
  axis sm = sweep(0, 650, 1.6)
  axis lifetime = category(0.5, 2, 6)
  param rpm = 9
  derive band = goodman_sa(sm, fat_limit, uts, ys) over sm, lifetime
}

chart GoodmanDiagram of BoltFatigue {
  frame cartesian
  x sm
  x.domain 0 650
  x.label Mean stress
  y sigma_a
  y.domain 0 auto
  editable title, band.fills
  layer bands = area over lifetime | y:band fill:band.fills
}
`, { file }));
  applyDesire(world, desire);

  const graph = worldGraphProjection(world.allWitnesses());
  assert.equal(graph.nodes.some(node => node.kind === "dataflow" && node.id === "BoltFatigue"), true);
  assert.equal(graph.nodes.some(node => node.kind === "surface" && node.id === "GoodmanDiagram"), true);
  assert.equal(graph.nodes.some(node => node.id === "BoltFatigue.axis.sm"), true);
  assert.equal(graph.nodes.some(node => node.id === "GoodmanDiagram.encoding.x"), true);
  assert.equal(graph.nodes.some(node => node.id === "GoodmanDiagram.layer.bands"), true);
  assert.equal(graph.edges.some(edge => edge.from === "BoltFatigue" && edge.rel === "hasAxis" && edge.to === "BoltFatigue.axis.sm"), true);
  assert.equal(graph.edges.some(edge => edge.from === "BoltFatigue" && edge.rel === "hasParameter" && edge.to === "BoltFatigue.param.rpm"), true);
  assert.equal(graph.edges.some(edge => edge.from === "BoltFatigue" && edge.rel === "hasDerive" && edge.to === "BoltFatigue.derive.band"), true);
  assert.equal(graph.edges.some(edge => edge.from === "GoodmanDiagram" && edge.rel === "visualizesDataflow" && edge.to === "BoltFatigue"), true);
  assert.equal(graph.edges.some(edge => edge.from === "GoodmanDiagram" && edge.rel === "hasEncoding" && edge.to === "GoodmanDiagram.encoding.x"), true);
  assert.equal(graph.edges.some(edge => edge.from === "GoodmanDiagram" && edge.rel === "hasLayer" && edge.to === "GoodmanDiagram.layer.bands"), true);
  assert.equal(graph.nodes.some(node =>
    node.id === "BoltFatigue"
    && node.sources?.some(source => source.file === file && source.sourceLanguage === "rvm" && source.sourceKind === "model")
  ), true);
  assert.equal(graph.nodes.some(node =>
    node.id === "GoodmanDiagram"
    && node.sources?.some(source => source.file === file && source.sourceLanguage === "rvm" && source.sourceKind === "chart")
  ), true);
});

test("world graph surfaces native RVM graph nodes and edges with provenance", () => {
  const file = "C:/demo/graph.rvm";
  const desire = normalizeDesirePlusToDesire(compileRvmToDesirePlus(`
graph_node TodoRecordGraph {
  kind entity
  entity_type TodoRecord
}

graph_edge TodoFlowReadsTodoRecord {
  from TodoFlow
  to TodoRecordGraph
  edge_type reads
}
`, { file }));
  const world = createWorld();
  applyDesire(world, desire);
  const graph = worldGraphProjection(world.allWitnesses());

  assert.equal(graph.nodes.some(node =>
    node.id === "TodoRecordGraph"
    && node.kind === "graphNode"
    && node.sources?.some(source => source.file === file && source.sourceLanguage === "rvm" && source.sourceKind === "graph_node")
  ), true);
  assert.equal(graph.nodes.some(node =>
    node.id === "TodoFlowReadsTodoRecord"
    && node.kind === "graphEdge"
    && node.sources?.some(source => source.file === file && source.sourceLanguage === "rvm" && source.sourceKind === "graph_edge")
  ), true);
  assert.equal(graph.edges.some(edge => edge.from === "TodoFlowReadsTodoRecord" && edge.rel === "graphFrom" && edge.to === "TodoFlow"), true);
  assert.equal(graph.edges.some(edge => edge.from === "TodoFlowReadsTodoRecord" && edge.rel === "graphTo" && edge.to === "TodoRecordGraph"), true);
});

test("world graph places mcp servers in backend runtime contexts", async () => {
  const world = createWorld();
  await applyWitnessDocsWithRuntimePlugins(world, parseWitnessToml(`
[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[serverRunner]]
actor = "system"
id = "app_runner"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[runtimePluginInstall]]
actor = "system"
serverRunner = "app_runner"
plugin = "plugin.mcp-authoring"

[[mcpServer]]
actor = "system"
id = "project_mcp"
label = "Project MCP"
serverRunner = "app_runner"
transports = ["http"]
`));

  const graph = worldGraphProjection(world.allWitnesses());
  assert.equal(graph.nodes.some(node => node.id === "project_mcp" && node.badges.some(badge => badge.label === "kind:mcpServer")), true);
});


test("demo UI includes world graph widget and frontend render operation", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore()),
    runtimeProfile: "minimal"
  });

  try {
    const homeHtml = await fetch(server.url).then(r => r.text());
    assert.doesNotMatch(homeHtml, /<h1[^>]*>World Graph<\/h1>/);
    assert.doesNotMatch(homeHtml, /data-widget="world_graph_canvas"/);
    assert.match(homeHtml, /\/world/);

    const html = await fetch(`${server.url}/world`).then(r => r.text());
    assert.match(html, /World Graph/);
    assert.match(html, /Personal Projection/);
    assert.match(html, /world_session_form/);
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

test("server logs request start, projection, and finish for world graph", async () => {
  const lines = [];
  const logger = {
    info: (event, fields) => lines.push({ level: "info", event, fields }),
    warn: (event, fields) => lines.push({ level: "warn", event, fields }),
    error: (event, fields) => lines.push({ level: "error", event, fields })
  };

  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(await tempStore()),
    runtimeProfile: "minimal",
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
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
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
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
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
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());

  const activateAction = graph.nodes.find(n => n.id === "ctx:frontend/execution/program=todo_frontend_program/trigger=click/action=activateWidgetVersion");
  assert.ok(activateAction);

  const apiNode = graph.nodes.find(n => n.kind === "api" && n.label === "POST /api/widget-versions/:param/activate");
  assert.ok(apiNode);
  assert.equal(apiNode.context, "api");

  assert.equal(graph.edges.some(e => e.from === activateAction.id && e.to === apiNode.id && e.rel === "requests" && e.style === "api"), true);
  assert.equal(graph.edges.some(e => e.from === apiNode.id && e.to === "widgetVersions.activate" && e.rel === "handled by" && e.style === "api"), true);
});


test("world graph stops at action nodes and leaves process step detail to process views", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
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

test("world graph exposes process handoff metadata for frontend program and action nodes", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());
  const programNode = graph.nodes.find(node => node.id === "todo_frontend_program");
  const actionNode = graph.nodes.find(node => node.id === "ctx:frontend/execution/program=todo_frontend_program/trigger=click/action=activateWidgetVersion");

  assert.ok(programNode);
  assert.equal(Array.isArray(programNode.processEvents), true);
  assert.equal(programNode.processEvents.some(entry => entry.event === "click:activateWidgetVersion"), true);

  assert.ok(actionNode);
  assert.deepEqual(actionNode.processSelection, {
    program: "todo_frontend_program",
    event: "click:activateWidgetVersion"
  });
});

test("world graph scopes runtime hosts, capabilities, and vocabulary", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());

  assert.equal(graph.nodes.find(n => n.id === "backendHost")?.context, "backend/runtime");
  assert.equal(graph.nodes.find(n => n.id === "frontendHost")?.context, "frontend/runtime");
  assert.equal(graph.nodes.find(n => n.id === "demo_server")?.context, "backend/runtime");
  assert.equal(graph.nodes.find(n => n.id === "fs.json.read")?.context, "backend/capabilities");
  assert.equal(graph.nodes.find(n => n.id === "dom.render")?.context, "frontend/capabilities");
  assert.equal(graph.nodes.find(n => n.id === "widget")?.context, "system/vocabulary");
  assert.equal(graph.nodes.some(n => n.context === "unscoped" && ["widget", "frontendProgram", "fs.json.read"].includes(n.id)), false);
});

test("world graph classifies app routes versus harness and internal operating surfaces", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());
  const homeRoute = graph.nodes.find(node => node.id === "home_page_route");
  const worldRoute = graph.nodes.find(node => node.id === "world_page_route");
  const processRoute = graph.nodes.find(node => node.id === "process_page_route");

  assert.equal(homeRoute?.surfaceTier, "app");
  assert.equal(homeRoute?.badges?.some(entry => entry.label === "surface:app"), true);
  assert.equal(worldRoute?.surfaceTier, "internal");
  assert.equal(processRoute?.surfaceTier, "internal");
});

test("world graph renders explicit capability install and dependency edges", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[defaults]]
actor = "adam"

[[widget]]
id = "home"
kind = "Page"
props = { title = "Home" }

[[route]]
id = "home_route"
path = "/"
serves = "homePage"
method = "GET"
handler = "page.home"
params = { rootWidget = "home", page = "home" }

[[capability]]
id = "notes.sidebar"
label = "Notes Sidebar"
dependsOn = ["dom.render"]
placement = ["routePage"]

[[capabilityInstall]]
capability = "notes.sidebar"
target = "home_route"
targetKind = "routePage"
`);

  const graph = worldGraphProjection(world.allWitnesses());
  assert.equal(graph.nodes.find(n => n.id === "notes.sidebar")?.kind, "capability");
  assert.equal(graph.nodes.find(n => n.id === "notes.sidebar")?.context, "frontend/capabilities");
  assert.equal(graph.edges.some(e => e.from === "home_route" && e.to === "notes.sidebar" && e.rel === "installs capability"), true);
  assert.equal(graph.edges.some(e => e.from === "notes.sidebar" && e.to === "dom.render" && e.rel === "depends on"), true);
});

test("world graph exposes object properties, association metadata, and DSL source provenance", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());
  const app = graph.nodes.find(n => n.id === "demo_server");
  assert.ok(app);
  assert.ok(app.values.some(p => p.key === "id" && p.value.type === "ref" && p.value.target === "demo_server"));
  assert.ok(app.sources?.some(s => s.file.endsWith("backend.wtoml") && s.section === "serverRunner"));

  const edgeWithMeta = graph.edges.find(e => e.rel === "hasChildWidget" && e.properties?.some(p => p.key === "order"));
  assert.ok(edgeWithMeta);
});

test("world graph exposes recent witness history for objects and process nodes", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());
  const runner = graph.nodes.find(n => n.id === "demo_server");

  assert.ok(runner);
  assert.ok(Array.isArray(runner.recentWitnesses));
  assert.equal(runner.recentWitnesses.length > 0, true);

  const recentProcess = runner.recentWitnesses[0]?.process;
  const processNode = graph.nodes.find(n => n.id === `process:${recentProcess}`);

  assert.ok(processNode);
  assert.ok(Array.isArray(processNode.recentWitnesses));
  assert.equal(processNode.recentWitnesses.some(w => w.process === recentProcess), true);
});

test("world graph exposes widget version state on the active widget soul", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[defaults]]
actor = "adam"

[[widgetVersion]]
soul = "banner"
version = "banner_v1"
kind = "Text"
index = 0
props = { text = "Banner v1" }

[[widgetVersion]]
soul = "banner"
version = "banner_v2"
kind = "Text"
index = 1
props = { text = "Banner v2" }

[[widgetVersionTransition]]
soul = "banner"
from = "banner_v1"
to = "banner_v2"
strategy = "compatible"

[[widgetVersionTransition]]
soul = "banner"
from = "banner_v2"
to = "banner_v1"
strategy = "compatible"

[[activateWidgetVersion]]
soul = "banner"
version = "banner_v1"

[[activateWidgetVersion]]
soul = "banner"
version = "banner_v2"
`);

  const graph = worldGraphProjection(world.allWitnesses());
  const banner = graph.nodes.find(node => node.id === "banner");

  assert.ok(banner);
  assert.equal(banner.badges.some(badge => badge.label === "active:banner_v2"), true);
  assert.ok(Array.isArray(banner.widgetVersions));
  assert.equal(banner.widgetVersions.some(row => row.version === "banner_v1" && row.transitionFromActive === "compatible"), true);
  assert.equal(banner.widgetVersions.some(row => row.version === "banner_v2" && row.isActive === true), true);
  assert.equal(banner.widgetVersionState.activeVersion, "banner_v2");
  assert.equal(banner.widgetVersionState.rollbackAvailable, true);
  assert.equal(banner.widgetVersionState.rollbackVersion, "banner_v1");
});

test("world page selected object inspector includes properties, associations, association properties, and source definition sections", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);
  const html = renderWidgetPage(world, { rootWidget: "world_graph_page", frontendProgram: "world_graph_program", appConfig: { page: "world" } });

  assert.match(html, /world_session_status/);
  assert.match(html, /initSession/);
  assert.match(html, /Object properties/);
  assert.match(html, /Values/);
  assert.match(html, /world-value-widget/);
  assert.match(html, /world-value-type/);
  assert.match(html, /Associations from this object/);
  assert.match(html, /Association properties/);
  assert.match(html, /Recent witnesses/);
  assert.match(html, /Widget versions/);
  assert.match(html, /data-world-widget-activate/);
  assert.match(html, /Source definition/);
  assert.match(html, /world-source-ast/);
});


test("world graph typed values preserve arrays and refs for inspector rendering", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);

  const graph = worldGraphProjection(world.allWitnesses());
  const app = graph.nodes.find(n => n.id === "demo_server");
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
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);
  const html = renderWidgetPage(world, { rootWidget: "world_graph_page", frontendProgram: "world_graph_program", appConfig: { page: "world" } });

  assert.match(html, /world-graph-inspector \{[^}]*overflow-y: scroll/s);
  assert.match(html, /world-graph-canvas \{[^}]*overflow: scroll/s);
  assert.match(html, /world-graph-content/);
});

test("world page supports source document and primitive browser UI modes", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);
  const html = renderWidgetPage(world, { rootWidget: "world_graph_page", frontendProgram: "world_graph_program", appConfig: { page: "world" } });

  assert.match(html, /submit:world_session_form/);
  assert.match(html, /click:logout/);
  assert.match(html, /world-document-view/);
  assert.match(html, /data-world-source-file/);
  assert.match(html, /world-primitive-browser/);
  assert.match(html, /world-witness-browser/);
  assert.match(html, /data-world-primitive-kind/);
  assert.match(html, /world-graph-canvas/);
});

test("source endpoint returns only witnessed imported DSL files", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });
  const storePath = await tempStore();
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(storePath),
    runtimeProfile: "minimal"
  });

  try {
    const imported = docs.find(doc => doc.file?.endsWith("frontend.wtoml"))?.file;
    assert.ok(imported);
    const ok = await fetch(`${server.url}/api/source?file=${encodeURIComponent(imported)}`);
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.file.endsWith("frontend.wtoml"), true);
    assert.match(body.text, /world_graph_page/);
    assert.equal(Array.isArray(body.annotations), true);
    assert.equal(Array.isArray(body.targets), true);
    assert.equal(body.annotations.some(node =>
      node.sourceLanguage === "wtoml"
      && typeof node.startLine === "number"
      && node.sourceKind === node.section
      && Array.isArray(node.desireSourceNodeIds)
    ), true);
    assert.equal(body.targets.includes("world_graph_page"), true);

    const denied = await fetch(`${server.url}/api/source?file=${encodeURIComponent(path.join(process.cwd(), "package.json"))}`);
    assert.equal(denied.status, 404);
  } finally {
    await server.close();
  }
});

test("source and world-graph endpoints expose unified WTOML and RVM DESIRE provenance", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);
  declareBackendHost(world, { actor: "adam", id: "backendHost", runtimeProfile: "minimal" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost", runtimeProfile: "minimal" });

  const rvmDir = await fs.mkdtemp(path.join(os.tmpdir(), "witness-rvm-source-"));
  const rvmFile = path.join(rvmDir, "todo.rvm");
  await fs.writeFile(rvmFile, `
context todo_items {
}

message TodoSelectedPayload {
  fields {
    item_id: string
  }
}

entity TodoRecord {
  context todo_items
  durable_state todo_store
  id_prop item_id
}

process TodoFlow {
  handles TodoSelectedPayload
  emits TodoSelectedPayload
}

boundary TodoApi {
  capability todo.read
}

graph_node TodoRecordGraph {
  kind entity
  entity_type TodoRecord
}

graph_edge TodoFlowReadsTodoRecord {
  from TodoFlow
  to TodoRecordGraph
  edge_type reads
}
`.trimStart(), "utf8");

  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(rvmFile));
  applyDesire(world, desire);

  const storePath = await tempStore();
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "demo_server",
    runtimeRoot: path.dirname(storePath),
    runtimeProfile: "minimal"
  });

  try {
    const graphRes = await fetch(`${server.url}/api/world-graph`);
    assert.equal(graphRes.status, 200);
    const graphBody = await graphRes.json();
    const graph = graphBody.graph;
    const wtomlSource = docs.find(doc => doc.file?.endsWith("frontend.wtoml"))?.file;
    assert.ok(wtomlSource);
    assert.equal(graph.nodes.some(node =>
      node.id === "world_graph_page"
      && node.sources?.some(source =>
        source.file === wtomlSource
        && source.sourceLanguage === "wtoml"
        && source.sourceKind === "page"
        && typeof source.startLine === "number"
        && typeof source.desireNodeId === "string"
        && Array.isArray(source.desireSourceNodeIds)
      )
    ), true);
    assert.equal(graph.nodes.some(node => node.id === "TodoRecord" && node.kind === "entity"), true);
    assert.equal(graph.nodes.some(node =>
      node.id === "TodoRecord"
      && node.sources?.some(source =>
        source.file === rvmFile
        && source.sourceLanguage === "rvm"
        && source.sourceKind === "entity"
        && typeof source.startLine === "number"
        && typeof source.desireNodeId === "string"
        && Array.isArray(source.desireSourceNodeIds)
      )
    ), true);
    assert.equal(graph.nodes.some(node =>
      node.id === "TodoFlow"
      && node.sources?.some(source => source.sourceLanguage === "rvm" && source.sourceKind === "process")
    ), true);
    const wtomlSourceRes = await fetch(`${server.url}/api/source?file=${encodeURIComponent(wtomlSource)}`);
    assert.equal(wtomlSourceRes.status, 200);
    const wtomlSourceBody = await wtomlSourceRes.json();
    assert.equal(wtomlSourceBody.file, wtomlSource);
    assert.equal(wtomlSourceBody.targets.includes("world_graph_page"), true);
    assert.equal(wtomlSourceBody.annotations.some(node =>
      node.sourceLanguage === "wtoml"
      && node.file === wtomlSource
      && node.sourceKind === "page"
      && node.target === "world_graph_page"
      && typeof node.startLine === "number"
      && typeof node.desireNodeId === "string"
      && Array.isArray(node.desireSourceNodeIds)
    ), true);

    const sourceRes = await fetch(`${server.url}/api/source?file=${encodeURIComponent(rvmFile)}`);
    assert.equal(sourceRes.status, 200);
    const sourceBody = await sourceRes.json();
    assert.equal(sourceBody.file, rvmFile);
    assert.match(sourceBody.text, /TodoRecord/);
    assert.equal(sourceBody.targets.includes("TodoRecord"), true);
    assert.equal(sourceBody.targets.includes("TodoFlow"), true);
    assert.equal(sourceBody.targets.includes("TodoRecordGraph"), true);
    assert.equal(sourceBody.targets.includes("TodoFlowReadsTodoRecord"), true);
    assert.equal(sourceBody.annotations.some(node =>
      node.sourceLanguage === "rvm"
      && node.file === rvmFile
      && node.sourceKind === "entity"
      && node.target === "TodoRecord"
      && typeof node.startLine === "number"
      && typeof node.desireNodeId === "string"
      && Array.isArray(node.desireSourceNodeIds)
    ), true);
    assert.equal(sourceBody.annotations.some(node =>
      node.sourceLanguage === "rvm"
      && node.file === rvmFile
      && node.sourceKind === "graph_edge"
      && node.target === "TodoFlowReadsTodoRecord"
      && typeof node.desireNodeId === "string"
      && Array.isArray(node.desireSourceNodeIds)
      && Object.prototype.hasOwnProperty.call(node, "originNodeId")
      && Array.isArray(node.via)
    ), true);
    assert.equal(sourceBody.annotations.some(node =>
      node.sourceLanguage === "rvm"
      && node.file === rvmFile
      && node.sourceKind === "process"
      && node.target === "TodoFlow"
    ), true);
  } finally {
    await server.close();
  }
});

test("world browser exposes first-class graph primitive and source modes", async () => {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);
  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "world_graph_page", frontendProgram: "world_graph_program", appConfig: { page: "world" } });
  assert.match(html, /modeButton\('graph', 'Graph'\)/);
  assert.match(html, /modeButton\('primitive', 'Primitive Browser'\)/);
  assert.match(html, /modeButton\('witness', 'Witness Browser'\)/);
  assert.match(html, /modeButton\('source', 'Source Browser'\)/);
  assert.match(html, /world-source-workbench/);
  assert.match(html, /world-source-highlight/);
});

