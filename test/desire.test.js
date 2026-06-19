import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorld, projectors } from "../src/kernel.js";
import { moduleProjectors } from "../src/modules.js";
import { frontendProgramsProjection, frontendStepsProjection, widgetTree, activeWidgetVersions } from "../src/widgets.js";
import { backendProgramsProjection, backendProgramVersionsProjection, backendStepsProjection } from "../src/backend-programs.js";
import { parseWitnessToml, loadWitnessTomlFile, applyWitnessDocs } from "../src/dsl.js";
import { mcpAuthoringRuntimeDeclarations } from "../plugins/mcp-authoring/desire-runtime.js";
import {
  applyDesire,
  applyDesireNativeOnly,
  assertNoLegacyRuntimeDeclarationFallbackRequired,
  auditRuntimeDeclarationBridge,
  createCoreRuntimeDeclarationRegistry,
  createDesirePlusElaboratorRegistry,
  createDesireRegistriesFromPluginExtensions,
  createRuntimeDeclarationRegistry,
  elaborateDesirePlus,
  auditRvmDesirePlus,
  compileWtomlDocsToDesirePlus,
  compileRvmToDesirePlus,
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire,
  serializeDesirePlusToWtoml,
  serializeDesirePlusToRvm,
  DESIRE_BRIDGE_KINDS,
  DESIRE_KERNEL_KINDS,
  DESIRE_NODE_KINDS,
  createDesireDocument,
  createDesireNode,
  createRuntimeResidual,
  createTrace,
  validateTrace,
  validateDesirePlusDocument,
  validateDesireDocument
} from "../src/desire/index.js";
import { readRuntimePluginCatalog } from "../src/runtime-plugin-utils.js";
import { loadRuntimePluginModules } from "../src/runtime-plugin-loader.js";

test("WTOML docs compile to DESIRE+ with trace metadata", () => {
  const docs = parseWitnessToml(`
[context.frontend]
actor = "browser"

[[capability]]
actor = "adam"
id = "notes.sidebar"
`);
  const desirePlus = compileWtomlDocsToDesirePlus(docs.map(doc => ({ ...doc, file: "C:/demo/example.wtoml" })));
  assert.equal(desirePlus.kind, "desire+");
  assert.equal(desirePlus.nodes.length, 2);
  assert.equal(desirePlus.nodes[0].trace.sourceLanguage, "wtoml");
  assert.equal(desirePlus.nodes[0].trace.file, "C:/demo/example.wtoml");
  assert.equal(desirePlus.nodes[0].payload.sectionStyle, "table");
  assert.equal(desirePlus.nodes[0].meta.desireBoundary, "desire-kernel");
  assert.equal(desirePlus.nodes[1].meta.desireBoundary, "desire-kernel");
});

test("DESIRE IR validators accept compiled documents and traces", () => {
  const trace = validateTrace({
    sourceLanguage: "wtoml",
    file: "C:/demo/example.wtoml",
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 20,
    sourceKind: "context",
    via: ["compile:wtoml"]
  });
  assert.equal(trace.sourceLanguage, "wtoml");

  const desirePlus = compileWtomlDocsToDesirePlus(parseWitnessToml(`
[context.frontend]
actor = "browser"
`));
  const validatedDesirePlus = validateDesirePlusDocument(desirePlus);
  assert.equal(validatedDesirePlus.kind, "desire+");

  const desire = normalizeDesirePlusToDesire(desirePlus);
  const validatedDesire = validateDesireDocument(desire);
  assert.equal(validatedDesire.kind, "desire");
});

test("DESIRE kernel kind set excludes bridge-only runtime residuals", () => {
  assert.equal(DESIRE_KERNEL_KINDS.has("runtime.doc"), false);
  assert.equal(DESIRE_BRIDGE_KINDS.has("runtime.doc"), true);
  assert.equal(DESIRE_BRIDGE_KINDS.has("runtime.declaration"), true);
  assert.equal(DESIRE_NODE_KINDS.has("runtime.doc"), false);
  assert.equal(DESIRE_NODE_KINDS.has("runtime.declaration"), false);
  for (const kind of ["context", "type", "message", "store", "entity", "graph", "projection", "capability", "boundary", "policy", "process", "surface", "dataflow", "collection"]) {
    assert.equal(DESIRE_KERNEL_KINDS.has(kind), true, kind);
    assert.equal(DESIRE_NODE_KINDS.has(kind), true, kind);
  }
});

test("DESIRE kernel validators cover every node kind", () => {
  const cases = [
    { kind: "context", valid: { parent: "root" }, invalid: { parent: 42 }, error: /parent/ },
    { kind: "type", valid: { role: "enum", cases: ["open"] }, invalid: { role: [] }, error: /role/ },
    { kind: "message", valid: { fields: [] }, invalid: { fields: {} }, error: /fields/ },
    { kind: "store", valid: { storeKind: "durable", props: {} }, invalid: { props: [] }, error: /props/ },
    { kind: "entity", valid: { context: "ctx", fields: [] }, invalid: { fields: {} }, error: /fields/ },
    { kind: "graph", valid: { graphKind: "edge", from: "a", to: "b", fields: [], props: {} }, invalid: { props: [] }, error: /props/ },
    { kind: "projection", valid: { projectionKind: "list", source: "Todo", props: {} }, invalid: { props: [] }, error: /props/ },
    { kind: "capability", valid: { verbs: ["read"], scope: [] }, invalid: { verbs: {} }, error: /verbs/ },
    { kind: "boundary", valid: { capabilities: [], operations: [] }, invalid: { operations: {} }, error: /operations/ },
    { kind: "policy", valid: { subject: "Todo", policyOutcomes: {} }, invalid: { policyOutcomes: [] }, error: /policyOutcomes/ },
    { kind: "process", valid: { state: [], handles: [], emits: [], rules: [] }, invalid: { state: {} }, error: /state/ },
    { kind: "surface", valid: { surfaceKind: "chart", children: [], props: {}, encoding: {}, editable: [], layers: [] }, invalid: { encoding: [] }, error: /encoding/ },
    { kind: "dataflow", valid: { axes: [], params: [], derives: [], reduces: [] }, invalid: { axes: {} }, error: /axes/ },
    { kind: "collection", valid: {}, invalid: { id: [] }, error: /body\.id/ }
  ];
  assert.deepEqual(cases.map(row => row.kind).sort(), [...DESIRE_KERNEL_KINDS].sort());
  for (const row of cases) {
    assert.equal(createDesireNode({ kind: row.kind, name: `${row.kind}.ok`, body: row.valid }).kind, row.kind);
    assert.throws(() => createDesireNode({ kind: row.kind, name: `${row.kind}.bad`, body: row.invalid }), row.error, row.kind);
  }
});

test("DESIRE native application covers every kernel node kind", () => {
  const nodes = [
    createDesireNode({ kind: "context", name: "ctx", body: { parent: "root" } }),
    createDesireNode({ kind: "type", name: "TodoStatus", body: { role: "enum", cases: ["open", "done"] } }),
    createDesireNode({ kind: "message", name: "TodoCreated", body: { fields: [{ name: "id", type: "string" }] } }),
    createDesireNode({ kind: "store", name: "todo_store", body: { storeKind: "durable", context: "ctx", owner: "TodoFlow", entity: "TodoItem", props: {} } }),
    createDesireNode({ kind: "entity", name: "TodoItem", body: { context: "ctx", store: "todo_store", identity: "id", version: "version", fields: [{ name: "id", type: "string" }] } }),
    createDesireNode({ kind: "graph", name: "TodoEdge", body: { graphKind: "edge", from: "TodoFlow", to: "TodoItem", edgeType: "reads", fields: [], props: {} } }),
    createDesireNode({ kind: "projection", name: "TodoList", body: { projectionKind: "list", source: "todo_store", props: {} } }),
    createDesireNode({ kind: "dataflow", name: "TodoMetrics", body: { axes: [{ name: "done", kind: "category", from: "done" }], params: [{ name: "window", default: 7 }], derives: [{ name: "count", expr: "count(done)", over: [] }], reduces: [] } }),
    createDesireNode({ kind: "capability", name: "todo_backend", body: { verbs: ["read"], scope: ["ctx"], provides: ["capability:read:todo"], dependsOn: [], publicApi: [], providerAdapters: [], placement: [] } }),
    createDesireNode({ kind: "boundary", name: "TodoApi", body: { capabilities: ["capability:read:todo"], operations: [{ name: "list", query: "TodoQuery", successEvent: "TodoListed", route: "/api/todos" }] } }),
    createDesireNode({ kind: "policy", name: "TodoPolicy", body: { subject: "TodoFlow", initialState: "pending", stateField: "policy_state", readyState: "ready", disagreementState: null, policyOutcomes: { promote: "ready" }, disagreementOutcomes: {} } }),
    createDesireNode({ kind: "process", name: "TodoFlow", body: { state: ["DraftTitle"], handles: ["TodoCreated"], emits: ["TodoCreate"], rules: [] } }),
    createDesireNode({ kind: "surface", name: "TodoPage", body: { surfaceKind: "page", className: "todo-page", children: ["TodoList"], props: {}, modelRef: "TodoMetrics", frame: null, encoding: {}, editable: [], layers: [] } }),
    createDesireNode({ kind: "collection", name: "TodoOptions", body: {} })
  ];
  assert.deepEqual(nodes.map(node => node.kind).sort(), [...DESIRE_KERNEL_KINDS].sort());

  const world = createWorld();
  applyDesire(world, createDesireDocument(nodes));

  const witnesses = world.allWitnesses();
  const expectedProcesses = {
    context: "desire.defineContext",
    type: "desire.defineType",
    message: "desire.defineMessage",
    store: "desire.defineStore",
    entity: "desire.defineEntity",
    graph: "desire.defineGraph",
    projection: "desire.defineProjection",
    dataflow: "desire.define.dataflow",
    capability: "desire.defineCapability",
    boundary: "desire.defineBoundary",
    policy: "desire.definePolicy",
    process: "desire.defineProcess",
    surface: "desire.defineSurface",
    collection: "desire.defineCollection"
  };
  for (const node of nodes) {
    assert.equal(
      witnesses.some(witness => witness.process === expectedProcesses[node.kind] && witness.body?.id === node.name),
      true,
      node.kind
    );
  }

  const relations = world.project(projectors.currentRelations);
  assert.equal(relations.some(row => row.from === "TodoMetrics" && row.rel === "hasAxis" && row.to === "TodoMetrics.axis.done"), true);
  assert.equal(relations.some(row => row.from === "TodoEdge" && row.rel === "hasModuleKind" && row.to === "graphEdge"), true);
  assert.equal(relations.some(row => row.from === "TodoEdge" && row.rel === "graphFrom" && row.to === "TodoFlow"), true);
  assert.equal(relations.some(row => row.from === "TodoApi" && row.rel === "hasOperation" && row.to === "TodoApi.operation.list"), true);
  assert.equal(relations.some(row => row.from === "TodoPage" && row.rel === "visualizesDataflow" && row.to === "TodoMetrics"), true);
});

test("DESIRE IR validators reject malformed traces and documents", () => {
  assert.throws(() => validateTrace({
    sourceLanguage: "wtoml",
    sourceKind: "context",
    startLine: 4,
    endLine: 3,
    via: []
  }), /endLine/);

  assert.throws(() => validateDesirePlusDocument({
    kind: "desire+",
    version: 1,
    nodes: [{
      id: "broken",
      kind: "wtoml.doc",
      name: null,
      order: 0,
      trace: {
        sourceLanguage: "wtoml",
        file: null,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: null,
        sourceKind: "context",
        originNodeId: null,
        via: []
      },
      payload: {
        docKind: "context",
        values: [],
        file: null,
        line: 1,
        sectionStyle: "table"
      },
      semantic: null,
      meta: { sourceCategory: "runtime" }
    }],
    meta: {}
  }), /payload\.values/);

  assert.throws(() => validateDesireDocument({
    kind: "desire",
    version: 1,
    nodes: [],
    runtimeResiduals: [{
      id: "raw-runtime-declaration",
      kind: "runtime.declaration",
      name: null,
      body: {
        sourceLanguage: "wtoml",
        sourceKind: "app",
        declarationKind: "app",
        values: {},
        file: null,
        line: 1,
        order: 0,
        sectionStyle: "table",
        trace: createTrace({ sourceLanguage: "wtoml", sourceKind: "app", startLine: 1 })
      },
      sourceNodeIds: [],
      meta: {}
    }],
    meta: {}
  }), /body\.declaration/);

  assert.throws(() => validateDesireDocument({
    kind: "desire",
    version: 1,
    nodes: [],
    runtimeResiduals: [{
      id: "broken",
      kind: "runtime.declaration",
      name: null,
      body: {
        declaration: {
          kind: "app",
          values: {},
          sourceDefaultsApplied: true,
          source: {
            language: "wtoml",
            kind: "app",
            file: null,
            line: 1,
            order: 0,
            sectionStyle: "table",
            trace: {
              sourceLanguage: "wtoml",
              file: null,
              startLine: 2,
              startColumn: 1,
              endLine: 1,
              endColumn: null,
              sourceKind: "app",
              originNodeId: null,
              via: []
            }
          }
        },
        file: null,
        line: 1,
        order: 0,
        sectionStyle: "table"
      },
      sourceNodeIds: ["source-1"],
      meta: {}
    }],
    meta: {}
  }), /trace\.endLine/);
});

test("DESIRE+ validators enforce built-in source categories and semantic kinds", () => {
  assert.throws(() => validateDesirePlusDocument({
    kind: "desire+",
    version: 1,
    nodes: [{
      id: "broken-category",
      kind: "rvm.form",
      name: null,
      order: 0,
      trace: {
        sourceLanguage: "rvm",
        file: null,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: null,
        sourceKind: "atom",
        originNodeId: null,
        via: []
      },
      payload: {
        raw: "atom x {}",
        header: "atom x {",
        body: "",
        fields: [],
        file: null
      },
      semantic: null,
      meta: { sourceCategory: "lowered" }
    }],
    meta: {}
  }), /meta\.sourceCategory/);

  assert.throws(() => validateDesirePlusDocument({
    kind: "desire+",
    version: 1,
    nodes: [{
      id: "broken-semantic",
      kind: "rvm.form",
      name: "Todo",
      order: 0,
      trace: {
        sourceLanguage: "rvm",
        file: null,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: null,
        sourceKind: "todo",
        originNodeId: null,
        via: []
      },
      payload: {
        raw: "todo Todo {}",
        header: "todo Todo {",
        body: "",
        fields: [],
        file: null
      },
      semantic: { kind: "todo", name: "Todo" },
      meta: { sourceCategory: "semantic", desireBoundary: "desire-kernel" }
    }],
    meta: {}
  }), /semantic\.kind/);
});

test("DESIRE+ elaboration is a no-op without a registry", () => {
  const desirePlus = compileRvmToDesirePlus(conciseDashboardRvm(), { file: "C:/demo/dashboard.rvm" });
  const elaborated = elaborateDesirePlus(desirePlus);

  assert.deepEqual(elaborated, validateDesirePlusDocument(desirePlus));
});

test("DESIRE+ elaborator expands registered source forms with provenance ancestry", () => {
  const desirePlus = compileRvmToDesirePlus(conciseDashboardRvm(), { file: "C:/demo/dashboard.rvm" });
  const dashboard = desirePlus.nodes.find(node => node.trace.sourceKind === "dashboard");
  assert.ok(dashboard);
  assert.equal(dashboard.semantic, null);
  assert.equal(dashboard.meta.sourceCategory, "runtime");
  assert.equal(dashboard.meta.desireBoundary, "desire-plus-only");

  const elaborated = elaborateDesirePlus(desirePlus, { elaboratorRegistry: createDashboardElaboratorRegistry() });
  assert.equal(elaborated.nodes.some(node => node.id === dashboard.id), false);

  const generated = elaborated.nodes.filter(node => node.trace.originNodeId === dashboard.id);
  assert.deepEqual(generated.map(node => node.semantic?.kind).sort(), ["dataflow", "projection", "surface"]);
  for (const node of generated) {
    assert.equal(node.trace.sourceLanguage, "rvm");
    assert.equal(node.trace.file, "C:/demo/dashboard.rvm");
    assert.equal(node.trace.via.includes("elaborate:plugin.dashboard"), true);
    assert.equal(node.meta.sourceCategory, "semantic");
    assert.equal(node.meta.desireBoundary, "desire-kernel");
  }
});

test("DESIRE+ elaborator rejects malformed and duplicate output", () => {
  const desirePlus = compileRvmToDesirePlus(conciseDashboardRvm(), { file: "C:/demo/dashboard.rvm" });

  const malformed = createDesirePlusElaboratorRegistry().register({
    id: "bad.dashboard",
    sourceLanguage: "rvm",
    sourceKind: "dashboard",
    elaborate() {
      return [{ kind: "rvm.form" }];
    }
  });
  assert.throws(
    () => elaborateDesirePlus(desirePlus, { elaboratorRegistry: malformed }),
    /elaborator\(bad\.dashboard\)\.node\.id/
  );

  const duplicate = createDesirePlusElaboratorRegistry().register({
    id: "duplicate.dashboard",
    sourceLanguage: "rvm",
    sourceKind: "dashboard",
    elaborate(_node, { createNode }) {
      const meta = { sourceCategory: "semantic", desireBoundary: "desire-kernel" };
      return [
        createNode({ name: "TodoMetrics", sourceKind: "dashboard.dataflow", semantic: dashboardDataflowSemantic("TodoMetrics"), meta }),
        createNode({ name: "TodoMetrics", sourceKind: "dashboard.dataflow", semantic: dashboardDataflowSemantic("TodoMetrics"), meta })
      ];
    }
  });
  assert.throws(
    () => elaborateDesirePlus(desirePlus, { elaboratorRegistry: duplicate }),
    /duplicate DESIRE\+ node id/
  );
});

test("concise RVM extension form stays above DESIRE unless elaborated", () => {
  const desirePlus = compileRvmToDesirePlus(conciseDashboardRvm(), { file: "C:/demo/dashboard.rvm" });
  const audit = auditRvmDesirePlus(desirePlus);

  assert.equal(audit.total, 1);
  assert.equal(audit.authoredRuntime, 1);
  assert.equal(audit.semantic, 0);
  assert.equal(audit.unknown, 0);
  assert.deepEqual(normalizeDesirePlusToDesire(desirePlus).nodes.map(signature), []);
});

test("concise RVM extension elaborates into native DESIRE semantics and applies", () => {
  const desirePlus = compileRvmToDesirePlus(conciseDashboardRvm(), { file: "C:/demo/dashboard.rvm" });
  const elaborated = elaborateDesirePlus(desirePlus, { elaboratorRegistry: createDashboardElaboratorRegistry() });
  const desire = normalizeDesirePlusToDesire(elaborated);
  const signatures = desire.nodes.map(signature).sort(compareSignatures);

  assert.deepEqual(signatures, [
    {
      kind: "dataflow",
      name: "TodoMetrics",
      body: dashboardDataflowBody()
    },
    {
      kind: "projection",
      name: "TodoList",
      body: {
        projectionKind: "list",
        source: "todo_store",
        props: {}
      }
    },
    {
      kind: "surface",
      name: "TodoPage",
      body: {
        surfaceKind: "chart",
        className: "todo-dashboard",
        children: ["TodoList"],
        props: {},
        processRef: null,
        projectionRefs: [],
        capabilityRefs: [],
        bindings: [],
        interactions: [],
        repeat: null,
        modelRef: "TodoMetrics",
        frame: "cartesian",
        encoding: {},
        editable: [],
        layers: []
      }
    }
  ].sort(compareSignatures));

  const world = createWorld();
  applyDesire(world, desire);
  const witnesses = world.allWitnesses();
  const relations = world.project(projectors.currentRelations);

  assert.equal(witnesses.some(w => w.process === "desire.define.dataflow" && w.body?.id === "TodoMetrics"), true);
  assert.equal(witnesses.some(w => w.process === "desire.defineProjection" && w.body?.id === "TodoList"), true);
  assert.equal(witnesses.some(w => w.process === "desire.defineSurface" && w.body?.id === "TodoPage"), true);
  assert.equal(relations.some(row => row.from === "TodoPage" && row.rel === "hasChildSurface" && row.to === "TodoList"), true);
  assert.equal(relations.some(row => row.from === "TodoPage" && row.rel === "visualizesDataflow" && row.to === "TodoMetrics"), true);
  assert.equal(relations.some(row => row.from === "TodoMetrics" && row.rel === "hasAxis" && row.to === "TodoMetrics.axis.status"), true);
});

test("loaded plugin DESIRE+ elaborator expands concise RVM source into native semantics", async () => {
  const pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-desire-elaborator-plugin-"));
  try {
    const pluginDir = path.join(pluginRoot, "dashboard");
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify({
      id: "plugin.dashboard",
      version: "0.1.0",
      displayName: "Dashboard",
      description: "Dashboard DESIRE elaborator",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      contributes: {}
    }, null, 2));
    await fs.writeFile(path.join(pluginDir, "runtime.js"), `
      function fieldsOf(node) {
        return Object.fromEntries((node.payload.fields ?? []).map(({ key, value }) => [key, value]));
      }
      export function elaborateDashboard(node, { createNode }) {
        const fields = fieldsOf(node);
        const model = fields.model ?? "DashboardMetrics";
        const projection = fields.projection ?? "DashboardProjection";
        const page = fields.page ?? node.name;
        const source = fields.source ?? null;
        const meta = { sourceCategory: "semantic", desireBoundary: "desire-kernel" };
        return {
          replace: true,
          nodes: [
            createNode({
              name: model,
              sourceKind: "dashboard.dataflow",
              semantic: {
                kind: "dataflow",
                name: model,
                axes: [{ name: "status", kind: "category", from: "done" }],
                params: [],
                derives: [{ name: "count", expr: "count(status)", over: ["status"] }],
                reduces: []
              },
              meta
            }),
            createNode({
              name: projection,
              sourceKind: "dashboard.projection",
              semantic: { kind: "projection", name: projection, projectionKind: "list", source, props: {} },
              meta
            }),
            createNode({
              name: page,
              sourceKind: "dashboard.surface",
              semantic: {
                kind: "surface",
                name: page,
                surfaceKind: "chart",
                className: "todo-dashboard",
                children: [projection],
                props: {},
                modelRef: model,
                frame: "cartesian",
                encoding: {},
                editable: [],
                layers: []
              },
              meta
            })
          ]
        };
      }
      export default {
        desireExtensions: {
          elaborators: [{ id: "plugin.dashboard.elaborator", sourceLanguage: "rvm", sourceKind: "dashboard", elaborate: elaborateDashboard }]
        }
      };
    `);

    const pluginCatalog = await readRuntimePluginCatalog({
      pluginRoot,
      runtimeProfile: "minimal",
      configuredPluginIds: ["plugin.dashboard"]
    });
    const loadResult = await loadRuntimePluginModules({ pluginCatalog });
    const { elaboratorRegistry } = createDesireRegistriesFromPluginExtensions(loadResult);
    const desirePlus = compileRvmToDesirePlus(conciseDashboardRvm(), { file: "C:/demo/dashboard.rvm" });
    const desire = normalizeDesirePlusToDesire(elaborateDesirePlus(desirePlus, { elaboratorRegistry }));
    const world = createWorld();

    assert.equal(loadResult.hasBlockingErrors, false);
    assert.deepEqual(loadResult.desireExtensions.elaborators.map(row => row.id), ["plugin.dashboard.elaborator"]);
    applyDesire(world, desire);
    assert.equal(world.allWitnesses().some(w => w.process === "desire.define.dataflow" && w.body?.id === "TodoMetrics"), true);
    assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoPage" && row.rel === "visualizesDataflow" && row.to === "TodoMetrics"), true);
  } finally {
    await fs.rm(pluginRoot, { recursive: true, force: true });
  }
});

test("DESIRE normalization separates runtime residuals from semantic nodes", () => {
  const docs = parseWitnessToml(`
[context.frontend]
actor = "browser"
capabilities = ["dom.render"]

[[capability]]
actor = "adam"
id = "notes.sidebar"

[[app]]
id = "demo_app"
label = "Demo App"
`);
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));
  assert.equal(desire.kind, "desire");
  assert.equal(desire.nodes.some(node => node.kind === "runtime.doc"), false);
  assert.equal(desire.runtimeResiduals.some(node => node.kind === "runtime.declaration" && node.body.declarationKind === "app"), true);
  assert.equal(desire.runtimeResiduals.some(node => node.kind === "runtime.declaration" && node.body.declarationKind === "context"), false);
  assert.equal(desire.runtimeResiduals.some(node => node.kind === "runtime.declaration" && node.body.declarationKind === "capability"), false);
  assert.equal(desire.nodes.some(node => node.kind === "context" && node.name === "frontend"), true);
  assert.equal(desire.nodes.some(node => node.kind === "capability" && node.name === "notes.sidebar"), true);
  const appNode = desire.runtimeResiduals.find(node => node.kind === "runtime.declaration" && node.body.declarationKind === "app");
  assert.equal(appNode.meta.compatibilityBridge, true);
  assert.equal(appNode.meta.kernelResident, false);
  assert.equal(appNode.meta.residualHome, "desire+");
  assert.equal(appNode.meta.desireBoundary, "desire-plus-only");
  assert.equal(appNode.body.declaration.kind, "app");
  assert.equal(appNode.body.declaration.source.language, "wtoml");
  assert.deepEqual(appNode.body.declaration.values, appNode.body.values);
});

test("DESIRE normalization applies WTOML source defaults to runtime declarations", () => {
  const docs = parseWitnessToml(`
[[defaults]]
actor = "adam"
context = "frontend"
owner = "adam"

[[page]]
id = "home_page"
`);
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));
  const defaultsNode = desire.runtimeResiduals.find(node => node.kind === "runtime.declaration" && node.body.declarationKind === "defaults");
  const pageNode = desire.runtimeResiduals.find(node => node.kind === "runtime.declaration" && node.body.declarationKind === "page");

  assert.ok(defaultsNode);
  assert.ok(pageNode);
  assert.equal(defaultsNode.body.sourceDefaultsApplied, true);
  assert.equal(pageNode.body.sourceDefaultsApplied, true);
  assert.equal(defaultsNode.body.declaration.sourceDefaultsApplied, true);
  assert.equal(pageNode.body.declaration.sourceDefaultsApplied, true);
  assert.deepEqual(defaultsNode.body.values, { actor: "adam", context: "frontend", owner: "adam" });
  assert.deepEqual(defaultsNode.body.declaration.values, defaultsNode.body.values);
  assert.equal(pageNode.body.values.actor, "adam");
  assert.equal(pageNode.body.values.context, "frontend");
  assert.equal(pageNode.body.values.owner, "adam");
  assert.deepEqual(pageNode.body.declaration.values, pageNode.body.values);
});

test("DESIRE application does not perform runtime default merging", () => {
  const trace = sourceKind => createTrace({ sourceLanguage: "wtoml", sourceKind });
  const desire = createDesireDocument([], {}, [
    createRuntimeResidual({
      kind: "runtime.declaration",
      body: {
        declaration: {
          kind: "defaults",
          values: { actor: "adam" },
          sourceDefaultsApplied: true,
          source: {
            language: "wtoml",
            kind: "defaults",
            file: null,
            line: null,
            order: 0,
            sectionStyle: "array",
            trace: trace("defaults")
          }
        }
      },
      meta: { compatibilityBridge: true, kernelResident: false, residualHome: "desire+" }
    }),
    createRuntimeResidual({
      kind: "runtime.doc",
      body: {
        sourceLanguage: "wtoml",
        sourceKind: "app",
        docKind: "app",
        values: { id: "manual_app" },
        file: null,
        line: null,
        order: 1,
        sectionStyle: "array",
        trace: trace("app")
      },
      meta: { compatibilityBridge: true, kernelResident: false, residualHome: "desire+" }
    })
  ]);
  const world = createWorld();

  applyDesireNativeOnly(world, desire);

  const audit = auditRuntimeDeclarationBridge(desire);
  assert.equal(audit.canonicalResiduals, 1);
  assert.equal(audit.legacyResiduals, 1);
  assert.equal(audit.byResidualKind["runtime.declaration"], 1);
  assert.equal(audit.byResidualKind["runtime.doc"], 1);
  assert.equal(audit.nativeCovered, 2);
  assert.equal(audit.unsupported, 0);

  assert.equal(world.allWitnesses().some(w =>
    w.process === "dsl.app.define"
    && w.actor === "system"
    && w.body?.id === "manual_app"
  ), true);
});

test("runtime declaration bridge audit reports unregistered declaration kinds as unsupported", () => {
  const docs = parseWitnessToml(`
[[app]]
id = "demo_app"
label = "Demo"

[[unsupportedBridge]]
id = "legacy_only"
`);
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));
  const audit = auditRuntimeDeclarationBridge(desire);

  assert.equal(audit.total, 2);
  assert.equal(audit.canonicalResiduals, 2);
  assert.equal(audit.legacyResiduals, 0);
  assert.deepEqual(audit.byResidualKind, { "runtime.declaration": 2 });
  assert.equal(audit.registered, 1);
  assert.equal(audit.unsupported, 1);
  assert.equal(audit.nativeCovered, 1);
  assert.equal(audit.legacyRequired, 1);
  assert.equal(audit.policy.kernelResident, false);
  assert.equal(audit.policy.residualHome, "desire+");
  assert.equal(audit.byKind.app.nativeCovered, true);
  assert.equal(audit.byKind.app.nativeCoverage, "first-class");
  assert.equal(audit.byKind.app.canonicalResiduals, 1);
  assert.equal(audit.byKind.app.legacyResiduals, 0);
  assert.equal(audit.byKind.app.kernelResident, false);
  assert.equal(audit.byKind.app.residualHome, "desire+");
  assert.equal(audit.byKind.unsupportedBridge.registered, false);
  assert.equal(audit.byKind.unsupportedBridge.unsupported, true);
  assert.equal(audit.byKind.unsupportedBridge.nativeCovered, false);
  assert.equal(audit.byKind.unsupportedBridge.nativeCoverage, "unregistered");
  assert.equal(audit.byKind.unsupportedBridge.canonicalResiduals, 1);
  assert.equal(audit.byKind.unsupportedBridge.legacyResiduals, 0);
  assert.equal(audit.byKind.unsupportedBridge.legacyRequired, true);
  assert.equal(audit.byKind.unsupportedBridge.residualHome, "desire+");
});

test("native-only DESIRE application rejects unregistered runtime declarations", () => {
  const docs = parseWitnessToml(`
[[unsupportedBridge]]
id = "legacy_only"
`).map(doc => ({ ...doc, file: "C:/demo/unknown.wtoml" }));
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));
  const world = createWorld();
  const audit = auditRuntimeDeclarationBridge(desire);

  assert.equal(audit.legacyRequired, 1);
  assert.equal(audit.unsupported, 1);
  assert.throws(() => assertNoLegacyRuntimeDeclarationFallbackRequired(desire), /unsupportedBridge/);
  assert.throws(
    () => applyDesireNativeOnly(world, desire),
    /unsupported runtime declaration: kind=unsupportedBridge file=C:\/demo\/unknown\.wtoml line=2 sourceLanguage=wtoml sourceKind=unsupportedBridge/
  );
});

test("native-only DESIRE application accepts native-covered runtime declarations", () => {
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(parseWitnessToml(`
[[app]]
id = "demo_app"
label = "Demo"
`)));
  const audit = assertNoLegacyRuntimeDeclarationFallbackRequired(desire);

  assert.equal(audit.legacyRequired, 0);
  assert.doesNotThrow(() => applyDesireNativeOnly(createWorld(), desire));
});

test("runtime declaration registry applies plugin-registered declaration handlers", () => {
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(parseWitnessToml(`
[[pluginFeature]]
id = "feature_one"
`)));
  const registry = createCoreRuntimeDeclarationRegistry()
    .register("pluginFeature", {
      nativeCoverage: "plugin",
      extension: "plugin.demo",
      apply(world, doc) {
        return world.emit({
          process: "plugin.runtimeDeclaration.apply",
          actor: "plugin.demo",
          claims: [],
          body: {
            kind: doc.kind,
            values: structuredClone(doc.values)
          }
        });
      }
    });
  const audit = auditRuntimeDeclarationBridge(desire, { runtimeDeclarationRegistry: registry });
  const world = createWorld();

  assert.equal(audit.unsupported, 0);
  assert.equal(audit.nativeCovered, 1);
  assert.equal(audit.byKind.pluginFeature.nativeCoverage, "plugin");
  applyDesireNativeOnly(world, desire, { runtimeDeclarationRegistry: registry });
  assert.equal(world.allWitnesses().some(w =>
    w.process === "plugin.runtimeDeclaration.apply"
    && w.body?.values?.id === "feature_one"
  ), true);
});

test("runtime declaration registry rejects registered declarations without handlers", () => {
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(parseWitnessToml(`
[[pluginFeature]]
id = "feature_one"
`)));
  const registry = createRuntimeDeclarationRegistry([{ kind: "pluginFeature", nativeCoverage: "plugin" }]);
  const audit = auditRuntimeDeclarationBridge(desire, { runtimeDeclarationRegistry: registry });

  assert.equal(audit.registered, 1);
  assert.equal(audit.registeredWithoutHandler, 1);
  assert.equal(audit.byKind.pluginFeature.nativeCoverage, "registered-without-handler");
  assert.throws(
    () => applyDesireNativeOnly(createWorld(), desire, { runtimeDeclarationRegistry: registry }),
    /registered runtime declaration has no apply handler: kind=pluginFeature/
  );
});

test("WTOML apply path still runs through the maintained demo entrypoint", async () => {
  const world = createWorld();
  const docs = await loadWitnessTomlFile(path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"));
  applyWitnessDocs(world, docs);
  const runners = world.project(moduleProjectors.serverRunners);
  assert.equal(runners.some(row => row.id === "demo_server"), true);
  const sourceWitness = world.allWitnesses().find(w => w.process === "dsl.source.annotate" && w.body?.file?.endsWith("frontend.wtoml"));
  assert.ok(sourceWitness);
  assert.equal(sourceWitness.body.sourceLanguage, "wtoml");
  assert.equal(typeof sourceWitness.body.startLine, "number");
});

test("checked-in WTOML example surface has no statically legacy-required runtime declaration kinds", async () => {
  const files = await collectFilesByExtension(path.join(process.cwd(), "examples"), ".wtoml");
  assert.ok(files.length > 0);
  for (const file of files) {
    const docs = await loadWitnessTomlFile(file);
    const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));
    const audit = auditRuntimeDeclarationBridge(desire);
    assert.equal(audit.legacyRequired, 0, file);
    assert.equal(audit.legacyResiduals, 0, file);
    assert.equal(audit.canonicalResiduals, audit.total, file);
    assert.deepEqual(audit.byResidualKind, audit.total > 0 ? { "runtime.declaration": audit.total } : {}, file);
    assert.equal(audit.nativeCovered, audit.total, file);
  }
});

test("DESIRE native semantic subset applies alongside runtime declarations without duplicate semantic witnesses", () => {
  const world = createWorld();
  const docs = parseWitnessToml(`
[context.frontend]
actor = "browser"

[[trait]]
actor = "system"
id = "textual"

[[valueType]]
actor = "system"
id = "widget.text"
compatibleWith = ["textual"]
editor = { control = "text" }

[[processSpec]]
actor = "system"
id = "widget_define_spec"
process = "widget.define"
inputs = [{ name = "text", accepts = "widget.text", required = true }]
outputs = [{ name = "id", accepts = "widget.text", required = true }]

[[capability]]
actor = "adam"
id = "notes.sidebar"
label = "Notes Sidebar"

[[capabilityInstall]]
actor = "adam"
capability = "notes.sidebar"
target = "frontend"
targetKind = "context"

[[identity]]
context = "frontend"
id = "identity.aaron"
actor = "aaron"
label = "Aaron"
username = "aaron"
password = "aaron"
homePerspective = "aaron:personal"

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
actor = "aaron"
serverRunner = "app_runner"
plugin = "plugin.inspect"
`).map(doc => ({ ...doc, file: "C:/demo/native-apply.wtoml" }));
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));

  applyDesire(world, desire);

  assert.equal(world.allWitnesses().filter(w => w.process === "defineContext" && w.body?.id === "frontend").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "context.define" && w.body?.id === "frontend").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "defineTrait" && w.body?.id === "textual").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "defineValueType" && w.body?.id === "widget.text").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "defineProcessSpec" && w.body?.id === "widget_define_spec").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "defineCapability" && w.body?.id === "notes.sidebar").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "installCapability" && w.body?.capability === "notes.sidebar").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "defineIdentity" && w.body?.id === "identity.aaron").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "defineServerRunner" && w.body?.id === "app_runner").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "installRuntimePlugin" && w.body?.serverRunner === "app_runner" && w.body?.plugin === "plugin.inspect").length, 1);
  assert.equal(world.project(moduleProjectors.identityIndex).byUsername.aaron.id, "identity.aaron");
  assert.equal(world.project(moduleProjectors.contexts).find(row => row.id === "frontend")?.capabilities.includes("notes.sidebar"), true);
  assert.equal(world.project(moduleProjectors.serverRunners).some(row => row.id === "app_runner"), true);

  for (const target of ["frontend", "textual", "widget.text", "widget_define_spec", "notes.sidebar", "identity.aaron", "app_runner"]) {
    assert.equal(world.allWitnesses().some(w =>
      w.process === "dsl.source.annotate"
      && w.body?.file === "C:/demo/native-apply.wtoml"
      && w.body?.target === target
      && w.body?.sourceLanguage === "wtoml"
    ), true, target);
  }
});

test("DESIRE native runtime declarations resolve contextual refs through native context scope operations", () => {
  const world = createWorld();
  const docs = parseWitnessToml(`
[context.ctx_source]
actor = "system"

[context.ctx_target]
actor = "system"

[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[view]]
actor = "system"
id = "landing_view"
target = "frontendHost"

[[contextBinding]]
actor = "system"
context = "ctx_source"
name = "backendAlias"
target = "backendHost"

[[contextBinding]]
actor = "system"
context = "ctx_source"
name = "frontendAlias"
target = "frontendHost"

[[contextBinding]]
actor = "system"
context = "ctx_source"
name = "landingView"
target = "landing_view"

[[contextExport]]
actor = "system"
context = "ctx_source"
name = "backendAlias"
target = "backendHost"

[[contextExport]]
actor = "system"
context = "ctx_source"
name = "frontendAlias"
target = "frontendHost"

[[contextExport]]
actor = "system"
context = "ctx_source"
name = "landingView"
target = "landing_view"

[[contextImport]]
actor = "system"
context = "ctx_target"
sourceContext = "ctx_source"
exportName = "backendAlias"
name = "backendAlias"

[[contextImport]]
actor = "system"
context = "ctx_target"
sourceContext = "ctx_source"
exportName = "frontendAlias"
name = "frontendAlias"

[[contextImport]]
actor = "system"
context = "ctx_target"
sourceContext = "ctx_source"
exportName = "landingView"
name = "landingView"

[[serverRunner]]
actor = "system"
id = "demo_server"
context = "ctx_target"
backendHostRef = "backendAlias"
frontendHostRef = "frontendAlias"

[[contextBinding]]
actor = "system"
context = "ctx_target"
name = "runnerNode"
target = "demo_server"

[[surface]]
actor = "system"
id = "ReplayRoot"
surfaceKind = "app-root"
context = "ctx_source"

[[contextBinding]]
actor = "system"
context = "ctx_source"
name = "replaySurface"
target = "ReplayRoot"

[[contextExport]]
actor = "system"
context = "ctx_source"
name = "replaySurface"
target = "ReplayRoot"

[[contextImport]]
actor = "system"
context = "ctx_target"
sourceContext = "ctx_source"
exportName = "replaySurface"
name = "replaySurface"

[[process]]
actor = "system"
id = "ReplayFlow"
context = "ctx_source"
state = ["ReplayActiveRoute"]

[[contextBinding]]
actor = "system"
context = "ctx_source"
name = "replayFlow"
target = "ReplayFlow"

[[contextExport]]
actor = "system"
context = "ctx_source"
name = "replayFlow"
target = "ReplayFlow"

[[contextImport]]
actor = "system"
context = "ctx_target"
sourceContext = "ctx_source"
exportName = "replayFlow"
name = "replayFlow"

[[type]]
actor = "system"
id = "ReplayActiveRoute"
context = "ctx_source"
role = "state"
valueType = "text"

[[contextBinding]]
actor = "system"
context = "ctx_source"
name = "activeRoute"
target = "ReplayActiveRoute"

[[contextExport]]
actor = "system"
context = "ctx_source"
name = "activeRoute"
target = "ReplayActiveRoute"

[[contextImport]]
actor = "system"
context = "ctx_target"
sourceContext = "ctx_source"
exportName = "activeRoute"
name = "activeRoute"

[[route]]
actor = "system"
id = "landing_route"
context = "ctx_target"
path = "/landing"
method = "GET"
handler = "page.home"
servesRef = "landingView"

[[route]]
actor = "system"
id = "surface_route"
context = "ctx_target"
path = "/surface"
method = "GET"
handler = "page.surface"
servesRef = "replaySurface"
rootSurfaceRef = "replaySurface"
defaultScreen = "login"
routeState = { processRef = "replayFlow", stateRef = "activeRoute" }
excludeWidgetRoles = ["debug"]

[[contextBinding]]
actor = "system"
context = "ctx_target"
name = "landingRoute"
target = "landing_route"

[[serve]]
actor = "system"
context = "ctx_target"
serverRunnerRef = "runnerNode"
routeRef = "landingRoute"
`).map(doc => ({ ...doc, file: "C:/demo/native-contextual-runtime.wtoml" }));
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));

  applyDesire(world, desire);

  const runner = world.project(moduleProjectors.serverRunners).find(row => row.id === "demo_server");
  assert.ok(runner);
  assert.equal(runner.backendHost, "backendHost");
  assert.equal(runner.frontendHost, "frontendHost");

  const route = world.project(moduleProjectors.routes).find(row => row.id === "landing_route");
  assert.ok(route);
  assert.equal(route.serves, "landing_view");
  const surfaceRoute = world.project(moduleProjectors.routes).find(row => row.id === "surface_route");
  assert.ok(surfaceRoute);
  assert.equal(surfaceRoute.serves, "ReplayRoot");
  assert.equal(surfaceRoute.params?.rootSurface, "ReplayRoot");
  assert.equal(surfaceRoute.params?.defaultScreen, "login");
  assert.deepEqual(surfaceRoute.params?.routeState, {
    process: "ReplayFlow",
    state: "ReplayActiveRoute"
  });
  assert.deepEqual(surfaceRoute.params?.excludeWidgetRoles, ["debug"]);

  assert.equal(world.project(moduleProjectors.servedRoutes).some(row => row.id === "landing_route" && row.serverRunner === "demo_server"), true);
  assert.equal(world.project(moduleProjectors.contextScopes).some(row => row.context === "ctx_target" && row.name === "landingView" && row.target === "landing_view" && row.sourceKind === "import"), true);
});

test("DESIRE native runtime declarations resolve capability target refs without the legacy fallback", () => {
  const world = createWorld();
  const docs = parseWitnessToml(`
[context.ctx_source]
actor = "system"

[context.ctx_target]
actor = "system"

[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx_source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[serverRunner]]
actor = "system"
id = "local_server"
context = "ctx_target"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[contextBinding]]
actor = "system"
context = "ctx_source"
name = "sourceRunner"
target = "source_server"

[[contextExport]]
actor = "system"
context = "ctx_source"
name = "sourceRunner"
target = "source_server"

[[contextImport]]
actor = "system"
context = "ctx_target"
sourceContext = "ctx_source"
exportName = "sourceRunner"
name = "importedRunner"

[[contextBinding]]
actor = "system"
context = "ctx_target"
name = "localRunner"
target = "local_server"

[[capability]]
actor = "system"
id = "notes.sidebar"
label = "Notes Sidebar"
placement = ["serverRunner"]

[[capabilityInstall]]
actor = "system"
capability = "notes.sidebar"
context = "ctx_target"
targetRef = "localRunner"
targetKind = "serverRunner"

[[capabilityInstall]]
actor = "system"
capability = "notes.sidebar"
context = "ctx_target"
targetRef = "importedRunner"
targetKind = "serverRunner"

[[capabilityRemove]]
actor = "system"
capability = "notes.sidebar"
context = "ctx_target"
targetRef = "importedRunner"
targetKind = "serverRunner"
`).map(doc => ({ ...doc, file: "C:/demo/native-capability-target-ref.wtoml" }));
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));

  applyDesireNativeOnly(world, desire);

  const installs = world.project(moduleProjectors.capabilityInstalls);
  assert.equal(installs.some(row =>
    row.capability === "notes.sidebar"
    && row.target === "local_server"
    && row.targetKind === "serverRunner"
  ), true);
  assert.equal(installs.some(row =>
    row.capability === "notes.sidebar"
    && row.target === "source_server"
    && row.targetKind === "serverRunner"
  ), false);
  assert.equal(world.allWitnesses().some(w =>
    w.process === "installCapability"
    && w.body?.capability === "notes.sidebar"
    && w.body?.target === "source_server"
  ), true);
  assert.equal(world.allWitnesses().some(w =>
    w.process === "removeCapability"
    && w.body?.capability === "notes.sidebar"
    && w.body?.target === "source_server"
  ), true);
});

test("DESIRE native runtime declarations resolve stewardship and proposal target refs without the legacy fallback", () => {
  const world = createWorld();
  const docs = parseWitnessToml(`
[context.ctx_source]
actor = "system"

[context.ctx_target]
actor = "system"

[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx_source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[contextBinding]]
actor = "system"
context = "ctx_source"
name = "sourceRunner"
target = "source_server"

[[contextExport]]
actor = "system"
context = "ctx_source"
name = "sourceRunner"
target = "source_server"

[[contextImport]]
actor = "system"
context = "ctx_target"
sourceContext = "ctx_source"
exportName = "sourceRunner"
name = "importedRunner"

[[stewardship]]
actor = "system"
steward = "callan"
context = "ctx_target"
targetRef = "importedRunner"
targetKind = "serverRunner"

[[proposal]]
actor = "system"
id = "proposal.runtime-plugin.source"
targetProcess = "runtimePlugin.install"
targetKind = "serverRunner"
context = "ctx_target"
targetIdRef = "importedRunner"
body = {}
reason = "Govern the imported runner"
`).map(doc => ({ ...doc, file: "C:/demo/native-stewardship-proposal-target-ref.wtoml" }));
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));

  applyDesireNativeOnly(world, desire);

  assert.equal(world.project(moduleProjectors.stewardships).some(row =>
    row.steward === "callan"
    && row.target === "source_server"
    && row.targetKind === "serverRunner"
  ), true);
  assert.equal(world.project(moduleProjectors.proposals).some(row =>
    row.id === "proposal.runtime-plugin.source"
    && row.targetId === "source_server"
  ), true);
});

test("DESIRE native runtime declarations resolve runtime plugin and mcp tool attachment refs without the legacy fallback", () => {
  const world = createWorld();
  const docs = parseWitnessToml(`
[context.ctx_source]
actor = "system"

[context.ctx_target]
actor = "system"

[[thing]]
actor = "system"
id = "backendHost"

[[thing]]
actor = "system"
id = "frontendHost"

[[serverRunner]]
actor = "system"
id = "source_server"
context = "ctx_source"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[mcpServer]]
actor = "system"
id = "source_mcp"
serverRunner = "source_server"

[[contextBinding]]
actor = "system"
context = "ctx_source"
name = "sourceRunner"
target = "source_server"

[[contextBinding]]
actor = "system"
context = "ctx_source"
name = "sourceMcp"
target = "source_mcp"

[[contextExport]]
actor = "system"
context = "ctx_source"
name = "sourceRunner"
target = "source_server"

[[contextExport]]
actor = "system"
context = "ctx_source"
name = "sourceMcp"
target = "source_mcp"

[[contextImport]]
actor = "system"
context = "ctx_target"
sourceContext = "ctx_source"
exportName = "sourceRunner"
name = "importedRunner"

[[contextImport]]
actor = "system"
context = "ctx_target"
sourceContext = "ctx_source"
exportName = "sourceMcp"
name = "importedMcp"

[[runtimePluginInstall]]
actor = "system"
context = "ctx_target"
serverRunnerRef = "importedRunner"
plugin = "plugin.inspect"

[[runtimePluginRemove]]
actor = "system"
context = "ctx_target"
serverRunnerRef = "importedRunner"
plugin = "plugin.inspect"

[[mcpToolInstall]]
actor = "system"
context = "ctx_target"
serverRef = "importedMcp"
tool = "world.read"

[[mcpToolRemove]]
actor = "system"
context = "ctx_target"
serverRef = "importedMcp"
tool = "world.read"
`).map(doc => ({ ...doc, file: "C:/demo/native-runtime-plugin-mcp-target-ref.wtoml" }));
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));

  applyDesireNativeOnly(world, desire, {
    runtimeDeclarationRegistry: createRuntimeDeclarationRegistry([
      ...createCoreRuntimeDeclarationRegistry().entries(),
      ...mcpAuthoringRuntimeDeclarations
    ])
  });
  assert.equal(world.allWitnesses().some(w => w.process === "installRuntimePlugin" && w.body?.serverRunner === "source_server"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "removeRuntimePlugin" && w.body?.serverRunner === "source_server"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "installMcpTool" && w.body?.server === "source_mcp"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "removeMcpTool" && w.body?.server === "source_mcp"), true);
});

test("DESIRE native runtime declarations apply widget/program authored refs without the legacy fallback", () => {
  const world = createWorld();
  const docs = parseWitnessToml(`
[context.ctx_source]
actor = "system"

[context.ctx_target]
actor = "system"

[[widget]]
actor = "system"
id = "page_root"
kind = "Page"
context = "ctx_source"

[[widget]]
actor = "system"
id = "shell_box"
kind = "Box"
context = "ctx_target"

[[contextBinding]]
actor = "system"
context = "ctx_source"
name = "homePage"
target = "page_root"

[[contextExport]]
actor = "system"
context = "ctx_source"
name = "homePage"
target = "page_root"

[[contextImport]]
actor = "system"
context = "ctx_target"
sourceContext = "ctx_source"
exportName = "homePage"
name = "landingPage"

[[contextBinding]]
actor = "system"
context = "ctx_target"
name = "shellBox"
target = "shell_box"

[[text]]
actor = "system"
id = "shell_child"
context = "ctx_target"
parentRef = "shellBox"
text = "Child"

[[frontendProgram]]
actor = "system"
id = "landing_program"
context = "ctx_target"
rootWidgetRef = "landingPage"

[[step]]
actor = "system"
program = "landing_program"
on = "load"
op = "state.assign"
target = "draft.title"
value = "Hello"
`).map(doc => ({ ...doc, file: "C:/demo/native-widget-runtime.wtoml" }));
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));

  applyDesire(world, desire);

  const program = frontendProgramsProjection(world.allWitnesses()).find(row => row.id === "landing_program");
  assert.ok(program);
  assert.equal(program.rootWidget, "page_root");

  const child = widgetTree(world.allWitnesses(), "shell_box").children.find(row => row.id === "shell_child");
  assert.ok(child);
  assert.equal(child.kind, "Text");
  assert.equal(child.props.text, "Child");

  const step = frontendStepsProjection(world.allWitnesses()).find(row => row.program === "landing_program");
  assert.ok(step);
  assert.equal(step.event, "load");
  assert.equal(step.op, "state.assign");
  assert.deepEqual(step.params, { target: "draft.title", value: "Hello" });

  assert.equal(world.allWitnesses().filter(w => w.process === "defineWidget" && w.body?.id === "shell_child").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "defineFrontendProgram" && w.body?.id === "landing_program").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "defineFrontendStep" && w.body?.program === "landing_program").length, 1);

  for (const target of ["shell_child", "landing_program"]) {
    assert.equal(world.allWitnesses().some(w =>
      w.process === "dsl.source.annotate"
      && w.body?.file === "C:/demo/native-widget-runtime.wtoml"
      && w.body?.target === target
      && w.body?.sourceLanguage === "wtoml"
    ), true, target);
  }
});

test("DESIRE native runtime declarations resolve context actors during native application", () => {
  const world = createWorld();
  const docs = parseWitnessToml(`
[context.ctx_target]
actor = "context_actor"

[[page]]
id = "ctx_page"
context = "ctx_target"
title = "Context page"
`).map(doc => ({ ...doc, file: "C:/demo/native-context-actor.wtoml" }));
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));

  applyDesireNativeOnly(world, desire);

  assert.equal(world.allWitnesses().some(w =>
    w.process === "defineWidget"
    && w.actor === "context_actor"
    && w.body?.id === "ctx_page"
  ), true);
});

test("DESIRE native runtime declarations apply widget-version and backend-program authored flows without the legacy fallback", () => {
  const world = createWorld();
  const docs = parseWitnessToml(`
[[widget]]
actor = "system"
id = "root"
kind = "Page"
title = "Home"

[[widgetVersion]]
actor = "system"
soul = "banner"
version = "banner_v1"
kind = "Text"
index = 0
props = { text = "Banner v1" }

[[widgetVersion]]
actor = "system"
soul = "banner"
version = "banner_v2"
kind = "Text"
index = 1
props = { text = "Banner v2" }

[[widgetVersionTransition]]
actor = "system"
soul = "banner"
from = "banner_v1"
to = "banner_v2"
strategy = "compatible"

[[activateWidgetVersion]]
actor = "system"
soul = "banner"
version = "banner_v1"

[[attachWidget]]
actor = "system"
parent = "root"
child = "banner"
order = 0

[[backendProgram]]
actor = "system"
soul = "backend.echo"
label = "Echo"

[[backendProgramVersion]]
actor = "system"
soul = "backend.echo"
version = "backend.echo.v1"
index = 0

[[backendProgramVersion]]
actor = "system"
soul = "backend.echo"
version = "backend.echo.v2"
index = 1
transitionFrom = "backend.echo.v1"
transitionStrategy = "compatible"

[[backendStep]]
actor = "system"
version = "backend.echo.v1"
event = "request"
op = "response.json"
params = { body = { ok = true } }

[[activateBackendProgramVersion]]
actor = "system"
soul = "backend.echo"
version = "backend.echo.v1"
`).map(doc => ({ ...doc, file: "C:/demo/native-program-version-runtime.wtoml" }));
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));

  applyDesire(world, desire);

  const root = widgetTree(world.allWitnesses(), "root");
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].id, "banner");
  assert.equal(root.children[0].props.text, "Banner v1");
  assert.equal(activeWidgetVersions(world.allWitnesses()).get("banner"), "banner_v1");

  const backendProgram = backendProgramsProjection(world.allWitnesses()).find(row => row.soul === "backend.echo");
  assert.ok(backendProgram);
  assert.equal(backendProgram.label, "Echo");

  const backendVersions = backendProgramVersionsProjection(world.allWitnesses()).filter(row => row.soul === "backend.echo");
  assert.equal(backendVersions.length, 2);
  assert.equal(backendVersions.some(row => row.version === "backend.echo.v1" && row.active === true), true);
  assert.equal(backendVersions.some(row => row.version === "backend.echo.v2" && row.active === false), true);

  const backendStep = backendStepsProjection(world.allWitnesses()).find(row => row.version === "backend.echo.v1");
  assert.ok(backendStep);
  assert.equal(backendStep.event, "request");
  assert.equal(backendStep.op, "response.json");
  assert.deepEqual(backendStep.params, { body: { ok: true } });

  assert.equal(world.allWitnesses().filter(w => w.process === "defineWidgetVersion" && w.body?.soul === "banner").length, 2);
  assert.equal(world.allWitnesses().filter(w => w.process === "defineWidgetVersionTransition" && w.body?.soul === "banner").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "activateWidgetVersion" && w.body?.soul === "banner").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "defineBackendProgram" && w.body?.soul === "backend.echo").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "defineBackendProgramVersion" && w.body?.soul === "backend.echo").length, 2);
  assert.equal(world.allWitnesses().filter(w => w.process === "defineBackendProgramVersionTransition" && w.body?.soul === "backend.echo").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "defineBackendStep" && w.body?.version === "backend.echo.v1").length, 1);
  assert.equal(world.allWitnesses().filter(w => w.process === "activateBackendProgramVersion" && w.body?.soul === "backend.echo").length, 1);

  for (const target of ["banner", "banner_v1", "backend.echo", "backend.echo.v1"]) {
    assert.equal(world.allWitnesses().some(w =>
      w.process === "dsl.source.annotate"
      && w.body?.file === "C:/demo/native-program-version-runtime.wtoml"
      && w.body?.target === target
      && w.body?.sourceLanguage === "wtoml"
    ), true, target);
  }
});

test("DESIRE native runtime declarations apply remaining plain WTOML runtime sections without the legacy fallback", () => {
  const world = createWorld();
  const docs = parseWitnessToml(`
[[defaults]]
actor = "adam"

[[app]]
id = "demo_app"
spawn = ["ctx.shared"]

[[context]]
id = "ctx.shared"
owner = "adam"

[[perspective]]
id = "shared.board"
title = "Shared Board"
context = "ctx.shared"

[[stewardship]]
steward = "callan"
target = "ctx.shared"
targetKind = "context"

[[thing]]
id = "owned_thing"

[[clone]]
source = "owned_thing"
clone = "owned_clone"

[[transfer]]
thing = "owned_thing"
from = "adam"
to = "callan"

[[proposal]]
id = "proposal.widget.shared-note"
targetProcess = "widget.define"
targetKind = "widget"
targetId = "owned_thing"
body = { id = "shared_note" }
reason = "Need a shared note"
`).map(doc => ({ ...doc, file: "C:/demo/native-plain-runtime.wtoml" }));
  const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));

  applyDesire(world, desire);

  assert.equal(world.allWitnesses().filter(w => w.process === "dsl.app.define" && w.body?.id === "demo_app").length, 1);
  assert.equal(world.project(moduleProjectors.perspectives).some(row => row.id === "shared.board" && row.context === "ctx.shared"), true);
  assert.equal(world.project(moduleProjectors.stewardships).some(row => row.steward === "callan" && row.target === "ctx.shared"), true);
  assert.equal(world.project(moduleProjectors.proposals).some(row => row.id === "proposal.widget.shared-note" && row.targetProcess === "widget.define" && row.status === "open"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "owned_clone" && row.rel === "cloneOf" && row.to === "owned_thing"), true);
  assert.equal(world.project(projectors.owners).get("owned_thing"), "callan");

  for (const target of ["demo_app", "shared.board", "ctx.shared", "proposal.widget.shared-note"]) {
    assert.equal(world.allWitnesses().some(w =>
      w.process === "dsl.source.annotate"
      && w.body?.file === "C:/demo/native-plain-runtime.wtoml"
      && w.body?.target === target
      && w.body?.sourceLanguage === "wtoml"
    ), true, target);
  }
});

test("WTOML DESIRE+ serializer round-trips through normalization", () => {
  const source = `
[context.frontend]
actor = "browser"

[[capability]]
actor = "adam"
id = "notes.sidebar"
label = "Notes Sidebar"
`;
  const first = compileWtomlDocsToDesirePlus(parseWitnessToml(source));
  const text = serializeDesirePlusToWtoml(first);
  const second = compileWtomlDocsToDesirePlus(parseWitnessToml(text));
  assert.deepEqual(
    normalizeDesirePlusToDesire(first).nodes
      .map(signature),
    normalizeDesirePlusToDesire(second).nodes
      .map(signature)
  );
});

test("WTOML serializer emits semantic fallback for RVM-backed DESIRE+ forms", () => {
  const source = `
context todo_items parent=root_context

message TodoSelectedPayload {
  fields {
    item_id: string
    title: string
  }
}

version TodoRecordVersion {
  field version
  kind optimistic_counter
}

entity TodoItem {
  context todo_items
  durable_state todo_store
  id_prop id
  version_prop TodoRecordVersion
}

actor TodoFlow owns TodoItem {
  collection_context todo_items
  entity TodoItem
  durable_state todo_store
}

process TodoFlow {
  handles TodoSelectedPayload
  emits TodoSelectedPayload
}

boundary TodoApi {
  capability capability:read:todo_store
}

policy TodoPolicy {
  subject TodoFlow
  initial_state monitoring
  state_field policy_state
  ready_state ready
  policy_outcomes {
    ready_for_promotion: ready
  }
}

derive TodoSummary {
  kind list
  source todo_store
}

view TodoPage {
  kind page
  class todo-page
  children {
    todo_list
  }
}

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
`;
  const rvm = compileRvmToDesirePlus(source, { file: "C:/demo/semantic.rvm" });
  const text = serializeDesirePlusToWtoml(rvm);
  assert.match(text, /\[context\.todo_items\]/);
  assert.match(text, /\[\[message\]\]/);
  assert.match(text, /\[\[entity\]\]/);
  assert.match(text, /\[\[surface\]\]/);
  assert.match(text, /\[\[dataflow\]\]/);
  const wtoml = compileWtomlDocsToDesirePlus(parseWitnessToml(text));
  assert.deepEqual(
    normalizeDesirePlusToDesire(wtoml).nodes.map(signature).sort(compareSignatures),
    normalizeDesirePlusToDesire(rvm).nodes.map(signature).sort(compareSignatures)
  );
});

test("WTOML and RVM semantic core normalize to equivalent DESIRE kernel shapes", () => {
  const rvm = compileRvmToDesirePlus(`
context todo_items parent=root_context

message TodoSelectedPayload {
  fields {
    item_id: string
    title: string
  }
}

version TodoRecordVersion {
  field version
  kind optimistic_counter
}

entity TodoItem {
  context todo_items
  durable_state todo_store
  id_prop id
  version_prop TodoRecordVersion
}

actor TodoFlow owns TodoItem {
  collection_context todo_items
  entity TodoItem
  durable_state todo_store
}

process TodoFlow {
  handles TodoSelectedPayload
  emits TodoSelectedPayload
}

boundary TodoApi {
  capability capability:read:todo_store
}

policy TodoPolicy {
  subject TodoFlow
  initial_state monitoring
  state_field policy_state
  ready_state ready
  policy_outcomes {
    ready_for_promotion: ready
  }
}

derive TodoSummary {
  kind list
  source todo_store
}

model TodoMetrics {
  axis completed = category(done)
  param window = 7
  derive count = completed_total + window
}

view TodoPage {
  kind page
  class todo-page
  children {
    todo_list
  }
}
`);
  const wtoml = compileWtomlDocsToDesirePlus(parseWitnessToml(`
[context.todo_items]
parent = "root_context"

[[message]]
id = "TodoSelectedPayload"
fields = [{ name = "item_id", type = "string" }, { name = "title", type = "string" }]

[[type]]
id = "TodoRecordVersion"
role = "version"
field = "version"
versionKind = "optimistic_counter"

[[entity]]
id = "TodoItem"
context = "todo_items"
store = "todo_store"
identity = "id"
version = "version"
fields = [{ name = "id", type = "string" }, { name = "TodoRecordVersion", type = "string" }]

[[store]]
id = "todo_store"
storeKind = "durable"
context = "todo_items"
owner = "TodoFlow"
entity = "TodoItem"

[[process]]
id = "TodoFlow"
handles = ["TodoSelectedPayload"]
emits = ["TodoSelectedPayload"]

[[boundary]]
id = "TodoApi"
capabilities = ["capability:read:todo_store"]

[[policy]]
id = "TodoPolicy"
subject = "TodoFlow"
initialState = "monitoring"
stateField = "policy_state"
readyState = "ready"
policyOutcomes = { ready_for_promotion = "ready" }

[[projection]]
id = "TodoSummary"
projectionKind = "list"
source = "todo_store"

[[surface]]
id = "TodoPage"
surfaceKind = "page"
className = "todo-page"
children = ["todo_list"]

[[dataflow]]
id = "TodoMetrics"
axes = [{ name = "completed", kind = "category", values = ["done"] }]
params = [{ name = "window", default = 7 }]
derives = [{ name = "count", expr = "completed_total + window", over = [] }]
`));
  assert.deepEqual(
    normalizeDesirePlusToDesire(wtoml).nodes.map(signature).sort(compareSignatures),
    normalizeDesirePlusToDesire(rvm).nodes.map(signature).sort(compareSignatures)
  );
});

test("RVM-backed DESIRE semantic nodes apply natively into witnessed semantic definitions", () => {
  const world = createWorld();
  const desire = normalizeDesirePlusToDesire(compileRvmToDesirePlus(`
context todo_items {
}

message TodoSelectedPayload {
  fields {
    item_id: string
    title: string
  }
}

entity TodoRecord {
  context todo_items
  durable_state todo_store
  id_prop item_id
  version_prop version_ref
  fields {
    item_id: string
    title: string
  }
}

process TodoFlow {
  handles TodoSelectedPayload
  emits TodoSelectedPayload
}

boundary TodoApi {
  capability todo.read
}
`, { file: "C:/demo/todo.rvm" }));

  applyDesire(world, desire);

  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineContext" && w.body?.id === "todo_items"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineMessage" && w.body?.id === "TodoSelectedPayload"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineEntity" && w.body?.id === "TodoRecord"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineProcess" && w.body?.id === "TodoFlow"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineBoundary" && w.body?.id === "TodoApi"), true);

  assert.equal(world.project(moduleProjectors.contexts).some(row => row.id === "todo_items"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoSelectedPayload" && row.rel === "hasField" && row.to === "TodoSelectedPayload.item_id"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoSelectedPayload.item_id" && row.rel === "fieldType" && row.to === "string"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoRecord" && row.rel === "usesStore" && row.to === "todo_store"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoFlow" && row.rel === "handlesMessage" && row.to === "TodoSelectedPayload"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoApi" && row.rel === "dependsOnCapability" && row.to === "todo.read"), true);

  for (const target of ["todo_items", "TodoSelectedPayload", "TodoRecord", "TodoFlow", "TodoApi"]) {
    assert.equal(world.allWitnesses().some(w =>
      w.process === "dsl.source.annotate"
      && w.body?.file === "C:/demo/todo.rvm"
      && w.body?.target === target
      && w.body?.sourceLanguage === "rvm"
    ), true, target);
  }
});

test("RVM graph_context, capability, event, command, query, and policy forms normalize and apply natively", () => {
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

write json_artifact_out {
  capability "capability:write:json_artifact_out"
}

event PromotionGateSatisfied {
  payload_schema GovernanceNotePayload
  payload {
    note: GovernanceNote
  }
  writes {
    GovernanceLoading: false
  }
}

command OpenPromotionReview {
  fields {
    gate_id: "promotion_gate"
  }
}

query ReadPromotionReview {
  request_schema governance.review.request
  response_schema governance.review.response
}

adapter GovernancePromotionReviewSbtp using SBTP {
  command OpenPromotionReview
  kind command
  route /api/runtime/materialized-host-operation
  request_schema governance.review.request
  response_schema governance.review.response
  loading_state GovernanceLoading
  success_event PromotionGateSatisfied
  failure_event PromotionGateBlocked
  refresh_runtime true
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
  disagreement_state under_review
  disagreement_outcomes {
    blocked_by_disagreement: repair_required
  }
  policy_outcomes {
    ready_for_promotion: aligned_evidence
  }
}
`, { file: "C:/demo/governance.rvm" }));

  const signatures = desire.nodes.map(signature);
  assert.equal(signatures.some(row => row.kind === "context" && row.name === "scientific_entities"), true);
  assert.equal(signatures.some(row => row.kind === "capability" && row.name === "host_source_read"), true);
  assert.equal(signatures.some(row => row.kind === "message" && row.name === "PromotionGateSatisfied" && row.body.role === "event"), true);
  assert.equal(signatures.some(row => row.kind === "message" && row.name === "OpenPromotionReview" && row.body.role === "command"), true);
  assert.equal(signatures.some(row => row.kind === "message" && row.name === "ReadPromotionReview" && row.body.role === "query"), true);
  assert.equal(signatures.some(row => row.kind === "boundary" && row.name === "source_text"), true);
  assert.equal(signatures.some(row => row.kind === "boundary" && row.name === "json_artifact_out"), true);
  assert.equal(signatures.some(row => row.kind === "boundary" && row.name === "GovernancePromotionReviewSbtp"), true);
  assert.equal(signatures.some(row => row.kind === "policy" && row.name === "GovernanceEvidencePolicy"), true);

  const world = createWorld();
  applyDesire(world, desire);

  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineContext" && w.body?.id === "scientific_entities"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineCapability" && w.body?.id === "host_source_read"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineMessage" && w.body?.id === "PromotionGateSatisfied" && w.body?.role === "event"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineMessage" && w.body?.id === "OpenPromotionReview" && w.body?.role === "command"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineMessage" && w.body?.id === "ReadPromotionReview" && w.body?.role === "query"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineBoundary" && w.body?.id === "source_text"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineBoundary" && w.body?.id === "json_artifact_out"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineBoundary" && w.body?.id === "GovernancePromotionReviewSbtp"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.definePolicy" && w.body?.id === "GovernanceEvidencePolicy"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GovernanceWorkflow" && row.rel === "handlesMessage" && row.to === "OpenPromotionReview"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GovernanceWorkflow" && row.rel === "emitsMessage" && row.to === "PromotionGateSatisfied"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "host_source_read" && row.rel === "inContext" && row.to === "scientific_entities"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "host_source_read" && row.rel === "providesCapability" && row.to === "capability:read:source_text"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "host_source_read" && row.rel === "capabilitySource" && row.to === "builtin"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "host_source_read" && row.rel === "capabilityState" && row.to === "configured"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "PromotionGateSatisfied" && row.rel === "messageRole" && row.to === "event"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "OpenPromotionReview" && row.rel === "messageRole" && row.to === "command"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "ReadPromotionReview" && row.rel === "messageRole" && row.to === "query"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "source_text" && row.rel === "dependsOnCapability" && row.to === "capability:read:source_text"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "json_artifact_out" && row.rel === "dependsOnCapability" && row.to === "capability:write:json_artifact_out"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GovernancePromotionReviewSbtp" && row.rel === "handlesMessage" && row.to === "OpenPromotionReview"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GovernancePromotionReviewSbtp" && row.rel === "emitsMessage" && row.to === "PromotionGateSatisfied"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GovernancePromotionReviewSbtp" && row.rel === "hasOperation" && row.to === "GovernancePromotionReviewSbtp.operation.OpenPromotionReview"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GovernancePromotionReviewSbtp.operation.OpenPromotionReview" && row.rel === "usesTransport" && row.to === "SBTP"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GovernancePromotionReviewSbtp.operation.OpenPromotionReview" && row.rel === "routesTo" && row.to === "/api/runtime/materialized-host-operation"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GovernanceEvidencePolicy" && row.rel === "governs" && row.to === "GovernanceWorkflow"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GovernanceEvidencePolicy" && row.rel === "initialPolicyState" && row.to === "monitoring"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GovernanceEvidencePolicy" && row.rel === "readyPolicyState" && row.to === "aligned_evidence"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GovernanceEvidencePolicy" && row.rel === "hasPolicyOutcome" && row.to === "GovernanceEvidencePolicy.policyOutcome.ready_for_promotion"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GovernanceEvidencePolicy.policyOutcome.ready_for_promotion" && row.rel === "outcomeState" && row.to === "aligned_evidence"), true);
});

test("RVM derive and view forms normalize into projection and surface nodes and apply natively", () => {
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

view TodoList {
  kind borrowed
  children {
    todo_items_group
  }
}
`, { file: "C:/demo/surface.rvm" }));

  const signatures = desire.nodes.map(signature);
  assert.equal(signatures.some(row => row.kind === "projection" && row.name === "TodoItemSummary"), true);
  assert.equal(signatures.some(row => row.kind === "projection" && row.name === "InspectorClosed" && row.body.source === "InspectorOpen"), true);
  assert.equal(signatures.some(row => row.kind === "surface" && row.name === "TodoRuntimePage"), true);
  assert.equal(signatures.some(row => row.kind === "surface" && row.name === "TodoList"), true);

  const world = createWorld();
  applyDesire(world, desire);

  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineProjection" && w.body?.id === "TodoItemSummary"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineProjection" && w.body?.id === "InspectorClosed"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineSurface" && w.body?.id === "TodoRuntimePage"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineSurface" && w.body?.id === "TodoList"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "InspectorClosed" && row.rel === "projectsFrom" && row.to === "InspectorOpen"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "InspectorClosed" && row.rel === "projectionKind" && row.to === "bool_not"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoRuntimePage" && row.rel === "surfaceKind" && row.to === "runtime_root"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoRuntimePage" && row.rel === "surfaceClass" && row.to === "runtime-shell.runtime-page"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoRuntimePage" && row.rel === "hasChildSurface" && row.to === "todo_page_shell"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoList" && row.rel === "hasChildSurface" && row.to === "todo_items_group"), true);
});

test("RVM model and chart forms normalize into dataflow and chart-surface nodes and apply natively", () => {
  const desirePlus = compileRvmToDesirePlus(`
model BoltFatigue {
  axis sm = sweep(0, 650, 1.6)
  axis lifetime = category(0.5, 2, 6)
  param rpm = 9.0
  param uts = 1000
  derive cycles = months_to_cycles(lifetime, rpm) over lifetime
  derive band = goodman_sa(sm, fat_limit, uts, ys) over sm, lifetime
  derive slip = F_per_bolt / (mu_joint * A_s_nom * n_interfaces)
}

chart GoodmanDiagram of BoltFatigue {
  frame cartesian
  x sm
  x.domain 0 650
  x.label Mean stress
  y sigma_a
  y.domain 0 auto
  editable title, band.fills, annotations
  layer bands = area over lifetime | y:band fill:band.fills
  layer curves = line over sm | y:curve stroke:blue
  layer slip = rule | x:slip dash:true
}
`, { file: "C:/demo/goodman.rvm" });

  assert.equal(desirePlus.nodes.every(node => node.semantic), true);
  assert.equal(desirePlus.nodes.find(node => node.trace.sourceKind === "model")?.meta.sourceCategory, "semantic");
  assert.equal(desirePlus.nodes.find(node => node.trace.sourceKind === "chart")?.meta.sourceCategory, "semantic");

  const desire = normalizeDesirePlusToDesire(desirePlus);
  const model = desire.nodes.find(node => node.kind === "dataflow" && node.name === "BoltFatigue");
  assert.ok(model);
  assert.deepEqual(model.body.axes.find(axis => axis.name === "sm"), { name: "sm", kind: "sweep", args: [0, 650, 1.6] });
  assert.deepEqual(model.body.axes.find(axis => axis.name === "lifetime"), { name: "lifetime", kind: "category", values: [0.5, 2, 6] });
  assert.equal(model.body.params.find(param => param.name === "rpm")?.default, 9);
  assert.equal(model.body.derives.find(flow => flow.name === "band")?.expr, "goodman_sa(sm, fat_limit, uts, ys)");
  assert.deepEqual(model.body.derives.find(flow => flow.name === "band")?.over, ["sm", "lifetime"]);
  assert.deepEqual(model.body.derives.find(flow => flow.name === "slip")?.over, []);

  const chart = desire.nodes.find(node => node.kind === "surface" && node.name === "GoodmanDiagram");
  assert.ok(chart);
  assert.equal(chart.body.surfaceKind, "chart");
  assert.equal(chart.body.modelRef, "BoltFatigue");
  assert.equal(chart.body.frame, "cartesian");
  assert.deepEqual(chart.body.encoding.x, { field: "sm", domain: [0, 650], label: "Mean stress" });
  assert.deepEqual(chart.body.encoding.y, { field: "sigma_a", domain: [0, "auto"], label: null });
  assert.deepEqual(chart.body.editable, ["title", "band.fills", "annotations"]);
  assert.equal(chart.body.layers.find(layer => layer.name === "bands")?.encode.fill, "band.fills");
  assert.equal(chart.body.layers.find(layer => layer.name === "slip")?.encode.dash, true);

  const world = createWorld();
  applyDesire(world, desire);
  assert.equal(world.allWitnesses().some(witness => witness.process === "desire.define.dataflow" && witness.body?.id === "BoltFatigue"), true);
  assert.equal(world.allWitnesses().some(witness => witness.process === "desire.defineSurface" && witness.body?.id === "GoodmanDiagram"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "BoltFatigue" && row.rel === "hasAxis" && row.to === "BoltFatigue.axis.sm"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "BoltFatigue.axis.sm" && row.rel === "axisKind" && row.to === "sweep"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "BoltFatigue" && row.rel === "hasParameter" && row.to === "BoltFatigue.param.rpm"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "BoltFatigue.param.rpm" && row.rel === "defaultValue" && row.to === "9"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "BoltFatigue" && row.rel === "hasDerive" && row.to === "BoltFatigue.derive.band"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "BoltFatigue.derive.band" && row.rel === "operationOver" && row.to === "sm"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GoodmanDiagram" && row.rel === "surfaceKind" && row.to === "chart"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GoodmanDiagram" && row.rel === "visualizesDataflow" && row.to === "BoltFatigue"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GoodmanDiagram" && row.rel === "hasEncoding" && row.to === "GoodmanDiagram.encoding.x"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GoodmanDiagram.encoding.x" && row.rel === "encodesField" && row.to === "sm"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GoodmanDiagram" && row.rel === "hasLayer" && row.to === "GoodmanDiagram.layer.bands"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GoodmanDiagram.layer.bands" && row.rel === "layerEncoding" && row.to === "band.fills" && row.meta?.channel === "fill"), true);
});

test("RVM compact semantic forms normalize and apply through native DESIRE", () => {
  const desirePlus = compileRvmToDesirePlus(`
context todo_items parent=root_context -> todo_context_alias
capability todo_backend in=todo_items provide=capability:read:todo_store,capability:write:todo_store source=builtin state=configured -> todo_backend_capability
entity TodoRecord context=todo_items durable_state=todo_store id_prop=item_id version_prop=TodoVersion fields=item_id:string,title:string -> todo_record_schema
boundary TodoApi capabilities=capability:read:todo_store,capability:write:todo_store -> todo_api_boundary
policy TodoPolicy subject=TodoSession initial_state=monitoring state_field=policy_state ready_state=ready disagreement_state=review policy_outcomes=ready_for_promotion:ready -> todo_policy
process TodoSession -> create_todo_sequence,open_inspector_sequence
state DraftTodoTitle: string initial="Prove the generic lane" -> draft_title_state
event TodoSelected payload=item_id:SelectedTodoId,title:SelectedTodoTitle -> select_todo_item_sequence
command CreateTodo fields=id:DraftTodoId,title:DraftTodoTitle kind=command request_schema=todo.command.create.request response_schema=todo.query.item.response refresh_runtime=true -> create_todo_transport_call
adapter TodoCreateSbtp using SBTP command=CreateTodo kind=command route=create_todo_contract request_schema=todo.command.create.request response_schema=todo.query.item.response success=TodoWriteCommitted refresh_runtime=true -> create_todo_transport_call
derive InspectorClosed kind=bool_not source=InspectorOpen -> inspector_closed_expr
view TodoRuntimePage kind=runtime_root class=runtime-shell.runtime-page children=todo_page_shell,reflective_hint_root -> todo_runtime_root
`, { file: "C:/demo/compact.rvm" });
  assert.equal(desirePlus.nodes.every(node => node.semantic), true);

  const desire = normalizeDesirePlusToDesire(desirePlus);
  const signatures = desire.nodes.map(signature);
  assert.equal(signatures.some(row => row.kind === "context" && row.name === "todo_items" && row.body.parent === "root_context"), true);
  assert.equal(signatures.some(row => row.kind === "capability" && row.name === "todo_backend" && row.body.scope.includes("todo_items")), true);
  assert.equal(signatures.some(row => row.kind === "entity" && row.name === "TodoRecord" && row.body.store === "todo_store" && row.body.identity === "item_id"), true);
  assert.equal(signatures.some(row => row.kind === "boundary" && row.name === "TodoApi" && row.body.capabilities.includes("capability:read:todo_store")), true);
  assert.equal(signatures.some(row => row.kind === "policy" && row.name === "TodoPolicy" && row.body.subject === "TodoSession"), true);
  assert.equal(signatures.some(row => row.kind === "process" && row.name === "TodoSession" && row.body.rules.includes("create_todo_sequence")), true);
  assert.equal(signatures.some(row => row.kind === "type" && row.name === "DraftTodoTitle" && row.body.role === "state" && row.body.initial === "Prove the generic lane"), true);
  assert.equal(signatures.some(row => row.kind === "message" && row.name === "TodoSelected" && row.body.role === "event" && row.body.fields.length === 2), true);
  assert.equal(signatures.some(row => row.kind === "message" && row.name === "CreateTodo" && row.body.role === "command" && row.body.refreshRuntime === true), true);
  assert.equal(signatures.some(row => row.kind === "boundary" && row.name === "TodoCreateSbtp" && row.body.operations[0]?.transport === "SBTP"), true);
  assert.equal(signatures.some(row => row.kind === "projection" && row.name === "InspectorClosed" && row.body.source === "InspectorOpen"), true);
  assert.equal(signatures.some(row => row.kind === "surface" && row.name === "TodoRuntimePage" && row.body.children.includes("reflective_hint_root")), true);

  const world = createWorld();
  applyDesire(world, desire);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineContext" && w.body?.id === "todo_items"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineCapability" && w.body?.id === "todo_backend"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineEntity" && w.body?.id === "TodoRecord"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineBoundary" && w.body?.id === "TodoApi"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.definePolicy" && w.body?.id === "TodoPolicy"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "todo_backend" && row.rel === "inContext" && row.to === "todo_items"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoRecord" && row.rel === "usesStore" && row.to === "todo_store"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoApi" && row.rel === "dependsOnCapability" && row.to === "capability:read:todo_store"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoPolicy" && row.rel === "governs" && row.to === "TodoSession"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineMessage" && w.body?.id === "CreateTodo"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineBoundary" && w.body?.id === "TodoCreateSbtp"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoCreateSbtp" && row.rel === "handlesMessage" && row.to === "CreateTodo"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoCreateSbtp" && row.rel === "emitsMessage" && row.to === "TodoWriteCommitted"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoCreateSbtp" && row.rel === "routesTo" && row.to === "create_todo_contract"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoCreateSbtp.operation.CreateTodo" && row.rel === "usesTransport" && row.to === "SBTP"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "InspectorClosed" && row.rel === "projectsFrom" && row.to === "InspectorOpen"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "InspectorClosed" && row.rel === "projectionKind" && row.to === "bool_not"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoRuntimePage" && row.rel === "hasChildSurface" && row.to === "reflective_hint_root"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoRuntimePage" && row.rel === "surfaceKind" && row.to === "runtime_root"), true);
});

test("RVM lowered runtime remains residual while graph-data normalizes into DESIRE graph nodes", () => {
  const desirePlus = compileRvmToDesirePlus(`
atom draft_title_state {
  kind state_cell
}

map create_todo_sequence {
  step draft_title_write
}

witness durable_truth_ready {
  says durable_state_exists
}

machine todo_app {
  root todo_runtime_page
}

graph_node TodoRecord {
  kind entity
  entity_type TodoRecord
}

graph_edge TodoSessionOwnsTodoRecord {
  from TodoSession
  to TodoRecord
  edge_type owns
}

entity_type TodoRecord {
  fields {
    id: string
  }
}

edge_type owns {
  from TodoSession
  to TodoRecord
}

unparsed residual line
`, { file: "C:/demo/lowered-runtime.rvm" });

  const byKind = new Map(desirePlus.nodes.map(node => [node.trace.sourceKind, node]));
  assert.equal(byKind.get("atom")?.meta.sourceCategory, "runtime");
  assert.equal(byKind.get("atom")?.meta.residualCategory, "lowered-runtime");
  assert.equal(byKind.get("atom")?.meta.desireBoundary, "desire-plus-only");
  assert.equal(byKind.get("machine")?.meta.residualCategory, "lowered-runtime");
  assert.equal(byKind.get("graph_node")?.meta.sourceCategory, "semantic");
  assert.equal(byKind.get("graph_node")?.meta.desireBoundary, "desire-kernel");
  assert.equal(byKind.get("entity_type")?.semantic?.kind, "graph");
  assert.equal(byKind.get("unknown")?.meta.desireBoundary, "needs-classification");

  const audit = auditRvmDesirePlus(desirePlus);
  assert.equal(audit.total, 9);
  assert.equal(audit.loweredRuntime, 4);
  assert.equal(audit.graphData, 0);
  assert.equal(audit.unknown, 1);
  assert.equal(audit.semantic, 4);
  assert.equal(audit.bySourceKind.atom, 1);

  const desire = normalizeDesirePlusToDesire(desirePlus);
  assert.equal(desire.nodes.length, 4);
  assert.equal(desire.nodes.every(node => node.kind === "graph"), true);
  assert.equal(desire.nodes.find(node => node.name === "TodoSessionOwnsTodoRecord")?.body.from, "TodoSession");
  assert.equal(desire.nodes.find(node => node.name === "TodoSessionOwnsTodoRecord")?.body.to, "TodoRecord");

  const world = createWorld();
  applyDesire(world, desire);
  const relations = world.project(projectors.currentRelations);
  assert.equal(relations.some(row => row.from === "TodoRecord" && row.rel === "hasModuleKind" && row.to === "graphNode"), true);
  assert.equal(relations.some(row => row.from === "TodoSessionOwnsTodoRecord" && row.rel === "hasModuleKind" && row.to === "graphEdge"), true);
  assert.equal(relations.some(row => row.from === "TodoSessionOwnsTodoRecord" && row.rel === "graphFrom" && row.to === "TodoSession"), true);
  assert.equal(relations.some(row => row.from === "TodoSessionOwnsTodoRecord" && row.rel === "graphTo" && row.to === "TodoRecord"), true);
  assert.equal(world.allWitnesses().some(w =>
    w.process === "dsl.source.annotate"
    && w.body?.target === "TodoSessionOwnsTodoRecord"
    && w.body?.sourceLanguage === "rvm"
    && w.body?.sourceKind === "graph_edge"
    && typeof w.body?.desireNodeId === "string"
    && Array.isArray(w.body?.desireSourceNodeIds)
  ), true);
});

test("RVM module blocks, stdlib directives, comments, and enums classify without residual unknowns", () => {
  const desirePlus = compileRvmToDesirePlus(`
import desire/v3-alpha

// source-only section marker
stdlib frontend_dom_molecules_basic

module TodoRuntime {
  in todo_items
}

enum TodoLifecycle {
  cases {
    draft
    committed
  }
}
`, { file: "C:/demo/source-and-enum.rvm" });

  const audit = auditRvmDesirePlus(desirePlus);
  assert.equal(audit.total, 4);
  assert.equal(audit.sourceOnly, 3);
  assert.equal(audit.semantic, 1);
  assert.equal(audit.unknown, 0);
  assert.equal(audit.bySourceKind.module, 1);
  assert.equal(audit.bySourceKind.stdlib, 1);

  const moduleNode = desirePlus.nodes.find(node => node.trace.sourceKind === "module");
  assert.equal(moduleNode?.meta.sourceCategory, "source");
  assert.equal(moduleNode?.semantic.context, "todo_items");

  const desire = normalizeDesirePlusToDesire(desirePlus);
  assert.deepEqual(desire.nodes.map(signature), [{
    kind: "type",
    name: "TodoLifecycle",
    body: {
      role: "enum",
      field: null,
      versionKind: null,
      actor: null,
      label: null,
      editor: null,
      compatibleWith: [],
      cases: ["draft", "committed"],
      owner: null
    }
  }]);

  const world = createWorld();
  applyDesire(world, desire);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoLifecycle" && row.rel === "typeRole" && row.to === "enum"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoLifecycle" && row.rel === "hasCase" && row.to === "draft"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoLifecycle" && row.rel === "hasCase" && row.to === "committed"), true);
});

test("RVM git conflict markers classify as fixture corruption instead of unknown language forms", () => {
  const desirePlus = compileRvmToDesirePlus(`
<<<<<<< HEAD
atom draft_title_state {
  kind state_cell
}
=======
atom draft_name_state {
  kind state_cell
}
>>>>>>> origin/desire-frontend
`, { file: "C:/demo/corrupt-history.rvm" });

  const audit = auditRvmDesirePlus(desirePlus);
  assert.equal(audit.total, 5);
  assert.equal(audit.loweredRuntime, 2);
  assert.equal(audit.fixtureCorruption, 3);
  assert.equal(audit.unknown, 0);
  assert.equal(audit.bySourceKind.conflict_marker, 3);

  const conflictNode = desirePlus.nodes.find(node => node.trace.sourceKind === "conflict_marker");
  assert.equal(conflictNode?.meta.sourceCategory, "fixture-corruption");
  assert.equal(conflictNode?.meta.residualCategory, "conflict-marker");
  assert.equal(conflictNode?.meta.desireBoundary, "desire-plus-only");

  const desire = normalizeDesirePlusToDesire(desirePlus);
  assert.equal(desire.nodes.length, 0);
});

test("RVM unterminated brace blocks fail compilation", () => {
  assert.throws(
    () => compileRvmToDesirePlus(`
view BrokenLoginPanel {
  kind text
`.trim(), { file: "C:/demo/broken-login.rvm" }),
    /unterminated RVM block at C:\/demo\/broken-login\.rvm: line 1/
  );
});

test("RVM actor durable state normalizes into native store and projection semantics", () => {
  const desire = normalizeDesirePlusToDesire(compileRvmToDesirePlus(`
context todo_items {
}

actor TodoSession owns TodoItem {
  root TodoRuntimePage
  collection_context todo_items
  entity TodoItem
  list_projection todos_list_projection
  detail_projection todo_detail_projection
  durable_state durable_todo_state
}
`, { file: "C:/demo/actor-store.rvm" }));

  const signatures = desire.nodes.map(signature);
  assert.equal(signatures.some(row =>
    row.kind === "store"
    && row.name === "durable_todo_state"
    && row.body.storeKind === "durable"
    && row.body.context === "todo_items"
    && row.body.owner === "TodoSession"
    && row.body.entity === "TodoItem"
  ), true);
  assert.equal(signatures.some(row =>
    row.kind === "projection"
    && row.name === "todos_list_projection"
    && row.body.projectionKind === "list"
    && row.body.source === "durable_todo_state"
  ), true);
  assert.equal(signatures.some(row =>
    row.kind === "projection"
    && row.name === "todo_detail_projection"
    && row.body.projectionKind === "detail"
    && row.body.source === "durable_todo_state"
  ), true);

  const world = createWorld();
  applyDesire(world, desire);

  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineStore" && w.body?.id === "durable_todo_state"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "durable_todo_state" && row.rel === "inContext" && row.to === "todo_items"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "durable_todo_state" && row.rel === "ownedByProcess" && row.to === "TodoSession"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "TodoSession" && row.rel === "usesStore" && row.to === "durable_todo_state"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "durable_todo_state" && row.rel === "storesEntity" && row.to === "TodoItem"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "todos_list_projection" && row.rel === "projectsFrom" && row.to === "durable_todo_state"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "todo_detail_projection" && row.rel === "projectsFrom" && row.to === "durable_todo_state"), true);
});

test("RVM serializer round-trips generic compiled forms", () => {
  const source = `
import desire/v3-alpha

module TodoV3Alpha

message TodoSelectedPayload {
  fields {
    item_id: string
    title: string
  }
}
`.trim();
  const desirePlus = compileRvmToDesirePlus(source, { file: "C:/demo/todo.rvm" });
  const text = serializeDesirePlusToRvm(desirePlus);
  const reparsed = compileRvmToDesirePlus(text, { file: "C:/demo/todo.rvm" });
  assert.deepEqual(
    normalizeDesirePlusToDesire(desirePlus).nodes.map(signature),
    normalizeDesirePlusToDesire(reparsed).nodes.map(signature)
  );
});

test("RVM collections, repeated surfaces, and adapter collection outputs round-trip semantically", () => {
  const source = `
import desire/v3-alpha

module PlatformConfig

collection PlatformConfigSecrets

view SecretOptionTemplate {
  kind option
  prop tag = "option"
  prop value = "\${item.id}"
  prop text = "\${item.title}"
  prop template = true
}

view SecretSelect {
  kind select
  prop tag = "select"
  repeat {
    collection PlatformConfigSecrets
    template SecretOptionTemplate
    itemAs item
    indexAs index
  }
}

event SnapshotLoaded {
  payload {
    message: string
  }
}

adapter PlatformConfigSnapshotHttp using HTTP {
  kind query
  route /api/platform-config/snapshot
  success_event SnapshotLoaded
  collection_outputs {
    PlatformConfigSecrets = "secrets"
  }
}
`.trim();
  const desirePlus = compileRvmToDesirePlus(source, { file: "C:/demo/platform-config.rvm" });
  const desire = normalizeDesirePlusToDesire(desirePlus);
  const collectionNode = desire.nodes.find(node => node.kind === "collection");
  const selectNode = desire.nodes.find(node => node.kind === "surface" && node.name === "SecretSelect");

  assert.equal(collectionNode?.name, "PlatformConfigSecrets");
  assert.deepEqual(selectNode?.body?.repeat, {
    collection: "PlatformConfigSecrets",
    template: "SecretOptionTemplate",
    itemAs: "item",
    indexAs: "index"
  });

  const text = serializeDesirePlusToRvm(desirePlus);
  assert.match(text, /collection PlatformConfigSecrets/);
  assert.match(text, /repeat \{/);
  assert.match(text, /collection_outputs \{/);

  const reparsed = compileRvmToDesirePlus(text, { file: "C:/demo/platform-config.rvm" });
  assert.deepEqual(
    desire.nodes.map(signature),
    normalizeDesirePlusToDesire(reparsed).nodes.map(signature)
  );

  const world = createWorld();
  applyDesire(world, desire);
  const witnesses = world.allWitnesses();
  assert.equal(witnesses.some(witness => witness.process === "desire.defineCollection" && witness.body?.id === "PlatformConfigSecrets"), true);
});

test("RVM multi-select state lists and eventValues round-trip semantically", () => {
  const source = `
import desire/v3-alpha

state SelectedRoles: string[] {
  initial [engentus_user, platform_admin]
}

view RoleSelect {
  kind multi-select
  prop tag = "select"
  prop domId = "role-select"
  interactions {
    on change self set SelectedRoles eventValues
  }
}
`.trim();
  const desirePlus = compileRvmToDesirePlus(source, { file: "C:/demo/multi-select.rvm" });
  const desire = normalizeDesirePlusToDesire(desirePlus);
  const roleState = desire.nodes.find(node => node.kind === "type" && node.name === "SelectedRoles");
  const roleSelect = desire.nodes.find(node => node.kind === "surface" && node.name === "RoleSelect");

  assert.equal(roleState?.body?.valueType, "string[]");
  assert.deepEqual(roleState?.body?.initial, ["engentus_user", "platform_admin"]);
  assert.equal(roleSelect?.body?.surfaceKind, "multi-select");
  assert.deepEqual(roleSelect?.body?.interactions, [{
    target: "self",
    event: "change",
    action: {
      kind: "setState",
      state: "SelectedRoles",
      value: { kind: "eventValues" }
    }
  }]);

  const text = serializeDesirePlusToRvm(desirePlus);
  assert.match(text, /state SelectedRoles: string\[\]/);
  assert.match(text, /initial \[engentus_user, platform_admin\]/);
  assert.match(text, /on change self set SelectedRoles eventValues/);

  const reparsed = compileRvmToDesirePlus(text, { file: "C:/demo/multi-select.rvm" });
  assert.deepEqual(
    desire.nodes.map(signature),
    normalizeDesirePlusToDesire(reparsed).nodes.map(signature)
  );
});

test("RVM serializer emits semantic fallback for broad supported DESIRE+ forms", () => {
  const source = `
context todo_items {
}

capability todo_backend {
  in todo_items
  provide "capability:read:todo_store"
}

entity TodoRecord {
  context todo_items
  durable_state todo_store
  id_prop item_id
}

event TodoSelected {
  payload {
    item_id: string
  }
}

command CreateTodo {
  fields {
    title: string
  }
}

adapter TodoCreateSbtp using SBTP {
  command CreateTodo
  kind command
  route create_todo_contract
  success_event TodoSelected
}

derive TodoItemSummary {
  kind todo_item_summary
  source todo_store
}

view TodoRuntimePage {
  kind runtime_root
  children {
    todo_items_group
  }
}

actor TodoSession owns TodoRecord {
  collection_context todo_items
  entity TodoRecord
  list_projection todos_list_projection
  detail_projection todo_detail_projection
  durable_state todo_store
}

policy TodoPolicy {
  subject TodoSession
  initial_state draft
  policy_outcomes {
    accepted: done
  }
}

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
`.trim();
  const desirePlus = compileRvmToDesirePlus(source, { file: "C:/demo/broad.rvm" });
  const withoutRaw = {
    ...desirePlus,
    nodes: desirePlus.nodes.map(node => ({
      ...node,
      payload: { ...node.payload, raw: "", header: "" }
    }))
  };
  const text = serializeDesirePlusToRvm(withoutRaw);
  assert.match(text, /capability todo_backend/);
  assert.match(text, /adapter TodoCreateSbtp using SBTP/);
  assert.match(text, /actor TodoSession owns TodoRecord/);
  assert.match(text, /model BoltFatigue/);
  assert.match(text, /chart GoodmanDiagram of BoltFatigue/);
  const reparsed = compileRvmToDesirePlus(text, { file: "C:/demo/broad.rvm" });
  assert.deepEqual(
    normalizeDesirePlusToDesire(desirePlus).nodes.map(signature),
    normalizeDesirePlusToDesire(reparsed).nodes.map(signature)
  );
});

test("checked-in runnable WTOML examples apply through DESIRE without legacy runtime declaration fallback", async () => {
  const files = [
    path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml"),
    path.join(process.cwd(), "examples", "eden/app.wtoml"),
    path.join(process.cwd(), "examples", "engentus/app.wtoml")
  ];
  for (const file of files) {
    const docs = await loadWitnessTomlFile(file);
    const desire = normalizeDesirePlusToDesire(compileWtomlDocsToDesirePlus(docs));
    const world = createWorld();
    assert.doesNotThrow(() => applyDesireNativeOnly(world, desire), file);
  }
});

test("broad RVM specimen set compiles into DESIRE+ with classified residuals", async () => {
  const root = path.join(process.cwd(), "examples_rvm");
  const files = await collectFilesByExtension(root, ".rvm");
  const totals = {
    total: 0,
    semantic: 0,
    sourceOnly: 0,
    loweredRuntime: 0,
    graphData: 0,
    fixtureCorruption: 0,
    authoredRuntime: 0,
    unknown: 0
  };
  assert.ok(files.length > 0);
  for (const file of files) {
    const desirePlus = await compileRvmFileToDesirePlus(file);
    assert.equal(desirePlus.kind, "desire+");
    assert.ok(desirePlus.nodes.length > 0, file);
    const audit = auditRvmDesirePlus(desirePlus);
    for (const key of Object.keys(totals)) totals[key] += audit[key];
  }

  assert.equal(totals.unknown, 0);
  assert.equal(totals.authoredRuntime, 0);
  assert.ok(totals.semantic > 0);
  assert.ok(totals.sourceOnly > 0);
  assert.ok(totals.loweredRuntime >= 0);
  assert.equal(totals.graphData, 0);
  assert.ok(totals.fixtureCorruption >= 0);
  assert.equal(
    totals.total,
    totals.semantic
      + totals.sourceOnly
      + totals.loweredRuntime
      + totals.graphData
      + totals.fixtureCorruption
      + totals.authoredRuntime
      + totals.unknown
  );
});

function conciseDashboardRvm() {
  return readFileSync(path.join(process.cwd(), "test", "fixtures", "desire", "concise-dashboard.rvm"), "utf8");
}

function createDashboardElaboratorRegistry() {
  return createDesirePlusElaboratorRegistry().register({
    id: "plugin.dashboard",
    sourceLanguage: "rvm",
    sourceKind: "dashboard",
    elaborate(node, { createNode }) {
      const fields = Object.fromEntries((node.payload.fields ?? []).map(({ key, value }) => [key, value]));
      const model = fields.model ?? `${node.name}Metrics`;
      const projection = fields.projection ?? `${node.name}Projection`;
      const source = fields.source ?? null;
      const page = fields.page ?? node.name;
      const meta = {
        sourceCategory: "semantic",
        desireBoundary: "desire-kernel",
        boundaryReason: "dashboard elaborator generated kernel semantic nodes"
      };
      return {
        replace: true,
        nodes: [
          createNode({
            name: model,
            sourceKind: "dashboard.dataflow",
            semantic: dashboardDataflowSemantic(model),
            meta
          }),
          createNode({
            name: projection,
            sourceKind: "dashboard.projection",
            semantic: {
              kind: "projection",
              name: projection,
              projectionKind: "list",
              source,
              props: {}
            },
            meta
          }),
          createNode({
            name: page,
            sourceKind: "dashboard.surface",
            semantic: {
              kind: "surface",
              name: page,
              surfaceKind: "chart",
              className: "todo-dashboard",
              children: [projection],
              props: {},
              modelRef: model,
              frame: "cartesian",
              encoding: {},
              editable: [],
              layers: []
            },
            meta
          })
        ]
      };
    }
  });
}

function dashboardDataflowSemantic(name) {
  return {
    kind: "dataflow",
    name,
    ...dashboardDataflowBody()
  };
}

function dashboardDataflowBody() {
  return {
    axes: [{ name: "status", kind: "category", from: "done" }],
    params: [],
    derives: [{ name: "count", expr: "count(status)", over: ["status"] }],
    reduces: []
  };
}

async function collectFilesByExtension(dir, extension) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFilesByExtension(target, extension));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(extension)) files.push(target);
  }
  return files;
}

function signature(node) {
  return { kind: node.kind, name: node.name, body: node.body };
}

function compareSignatures(left, right) {
  return String(left.kind).localeCompare(String(right.kind))
    || String(left.name).localeCompare(String(right.name));
}

