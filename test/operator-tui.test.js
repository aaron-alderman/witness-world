import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createWorld, relation } from "../src/kernel.js";
import {
  buildOperatorWorkbenchSnapshot,
  buildTuiAutocompleteCandidates,
  buildTuiAutocompletePreview,
  buildTuiPrompt,
  buildOperatorTuiState,
  createOperatorTuiEngine,
  loadOperatorTuiRuntimeContext,
  parseTuiArgs
} from "../plugins/operator-workbench/tui-engine.js";

function makeStubState(options = {}) {
  const worldRecord = {
    scope: "world",
    id: "thing.alpha",
    kind: "thing",
    title: "Alpha",
    summary: "ctx.alpha",
    raw: {},
    metadata: {
      context: "ctx.alpha",
      surfaceTier: null,
      surfaceLabel: null,
      badges: [],
      properties: [],
      values: [],
      recentWitnesses: [],
      processEvents: [],
      processSelection: null
    },
    sourceHints: [{
      file: "C:/tmp/world/alpha.rvm",
      line: 3,
      section: "view",
      sourceLanguage: "rvm"
    }]
  };
  const worldPrefixRecord = {
    scope: "world",
    id: "thing.alphabet",
    kind: "thing",
    title: "Alphabet",
    summary: "prefix candidate",
    raw: {},
    metadata: {
      context: "ctx.alpha",
      surfaceTier: null,
      surfaceLabel: null,
      badges: [],
      properties: [],
      values: [],
      recentWitnesses: [],
      processEvents: [],
      processSelection: null
    },
    sourceHints: []
  };
  const worldLooseRecord = {
    scope: "world",
    id: "thing.gamma",
    kind: "thing",
    title: "Gamma",
    summary: "contains Alpha in summary",
    raw: {},
    metadata: {
      context: "ctx.gamma",
      surfaceTier: null,
      surfaceLabel: null,
      badges: [],
      properties: [],
      values: [],
      recentWitnesses: [],
      processEvents: [],
      processSelection: null
    },
    sourceHints: []
  };
  const worldValueTypeRecord = {
    scope: "world",
    id: "type.scalar",
    kind: "valueType",
    title: "Scalar",
    summary: "core scalar type",
    raw: {},
    metadata: {
      context: "ctx.types",
      surfaceTier: null,
      surfaceLabel: null,
      badges: [],
      properties: [],
      values: [],
      recentWitnesses: [],
      processEvents: [],
      processSelection: null
    },
    sourceHints: []
  };
  const backendRuntimeContextRecord = {
    scope: "world",
    id: "backend/runtime",
    kind: "context",
    title: "backend/runtime",
    summary: "backend/runtime",
    raw: {},
    metadata: {
      context: "backend/runtime",
      surfaceTier: null,
      surfaceLabel: null,
      badges: [],
      properties: [],
      values: [],
      recentWitnesses: [],
      processEvents: [],
      processSelection: null
    },
    sourceHints: []
  };
  const backendRoutesContextRecord = {
    scope: "world",
    id: "backend/routes",
    kind: "context",
    title: "backend/routes",
    summary: "backend/routes",
    raw: {},
    metadata: {
      context: "backend/routes",
      surfaceTier: null,
      surfaceLabel: null,
      badges: [],
      properties: [],
      values: [],
      recentWitnesses: [],
      processEvents: [],
      processSelection: null
    },
    sourceHints: []
  };
  const backendHostRecord = {
    scope: "world",
    id: "backendHost",
    kind: "thing",
    title: "backendHost",
    summary: "backend/runtime",
    raw: {},
    metadata: {
      context: "backend/runtime",
      surfaceTier: null,
      surfaceLabel: null,
      badges: [],
      properties: [],
      values: [],
      recentWitnesses: [],
      processEvents: [],
      processSelection: null
    },
    sourceHints: []
  };
  const serveProcessRecord = {
    scope: "world",
    id: "process.serve",
    kind: "process",
    title: "Serve",
    summary: "backend/runtime",
    raw: {},
    metadata: {
      context: "backend/runtime",
      surfaceTier: null,
      surfaceLabel: null,
      badges: [],
      properties: [],
      values: [],
      recentWitnesses: [],
      processEvents: [],
      processSelection: null
    },
    sourceHints: []
  };
  const platformRecord = {
    scope: "platform",
    id: "plugin.platform",
    kind: "plugin",
    title: "Platform Plugin",
    summary: "active | plugin.platform",
    raw: {},
    metadata: {
      owner: "plugin.platform",
      status: "active",
      source: "plugins/platform/runtime.js",
      lifecycle: ["execute", "steward"],
      command: null,
      sourceDependencies: []
    },
    sourceHints: [{
      file: "C:/repo/plugins/platform/runtime.js",
      line: null,
      section: null,
      sourceLanguage: null
    }]
  };
  const platformLooseRecord = {
    scope: "platform",
    id: "plugin.alpha-tools",
    kind: "plugin",
    title: "Tools Plugin",
    summary: "alpha helper plugin",
    raw: {},
    metadata: {
      owner: "plugin.alpha-tools",
      status: "active",
      source: "plugins/alpha-tools/runtime.js",
      lifecycle: ["execute"],
      command: null,
      sourceDependencies: []
    },
    sourceHints: [{
      file: "C:/repo/plugins/alpha-tools/runtime.js",
      line: null,
      section: null,
      sourceLanguage: null
    }]
  };
  const extraWorldRecords = [];
  const extraPlatformRecords = [];
  for (let index = 0; index < (options.extraWorldCount ?? 0); index += 1) {
    extraWorldRecords.push({
      scope: "world",
      id: `thing.alpha-${String(index + 1).padStart(2, "0")}`,
      kind: index % 2 === 0 ? "surface" : "thing",
      title: `Alpha World ${String(index + 1).padStart(2, "0")}`,
      summary: `alpha world ${String(index + 1).padStart(2, "0")}`,
      raw: {},
      metadata: {
        context: index % 2 === 0 ? "ctx.alpha" : "ctx.beta",
        surfaceTier: null,
        surfaceLabel: null,
        badges: [],
        properties: [],
        values: [],
        recentWitnesses: [],
        processEvents: [],
        processSelection: null
      },
      sourceHints: index % 3 === 0 ? [{
        file: `C:/tmp/world/alpha-${String(index + 1).padStart(2, "0")}.rvm`,
        line: index + 1,
        section: "view",
        sourceLanguage: "rvm"
      }] : []
    });
  }
  for (let index = 0; index < (options.extraPlatformCount ?? 0); index += 1) {
    extraPlatformRecords.push({
      scope: "platform",
      id: `plugin.alpha-${String(index + 1).padStart(2, "0")}`,
      kind: "plugin",
      title: `Alpha Plugin ${String(index + 1).padStart(2, "0")}`,
      summary: `alpha platform ${String(index + 1).padStart(2, "0")}`,
      raw: {},
      metadata: {
        owner: `plugin.alpha-${String(index + 1).padStart(2, "0")}`,
        status: index % 2 === 0 ? "active" : "paused",
        source: `plugins/alpha-${String(index + 1).padStart(2, "0")}/runtime.js`,
        lifecycle: ["execute"],
        command: null,
        sourceDependencies: []
      },
      sourceHints: [{
        file: `C:/repo/plugins/alpha-${String(index + 1).padStart(2, "0")}/runtime.js`,
        line: null,
        section: null,
        sourceLanguage: null
      }]
    });
  }
  const worldRecords = [
    worldRecord,
    worldPrefixRecord,
    worldLooseRecord,
    worldValueTypeRecord,
    backendRuntimeContextRecord,
    backendRoutesContextRecord,
    backendHostRecord,
    serveProcessRecord,
    ...extraWorldRecords
  ];
  const platformRecords = [platformRecord, platformLooseRecord, ...extraPlatformRecords];
  const recordIndex = new Map([
    [worldRecord.id, worldRecord],
    [`world:${worldRecord.id}`, worldRecord],
    [worldPrefixRecord.id, worldPrefixRecord],
    [`world:${worldPrefixRecord.id}`, worldPrefixRecord],
    [worldLooseRecord.id, worldLooseRecord],
    [`world:${worldLooseRecord.id}`, worldLooseRecord],
    [worldValueTypeRecord.id, worldValueTypeRecord],
    [`world:${worldValueTypeRecord.id}`, worldValueTypeRecord],
    [backendRuntimeContextRecord.id, backendRuntimeContextRecord],
    [`world:${backendRuntimeContextRecord.id}`, backendRuntimeContextRecord],
    [backendRoutesContextRecord.id, backendRoutesContextRecord],
    [`world:${backendRoutesContextRecord.id}`, backendRoutesContextRecord],
    [backendHostRecord.id, backendHostRecord],
    [`world:${backendHostRecord.id}`, backendHostRecord],
    [serveProcessRecord.id, serveProcessRecord],
    [`world:${serveProcessRecord.id}`, serveProcessRecord],
    [platformRecord.id, platformRecord],
    [`platform:${platformRecord.id}`, platformRecord],
    [platformLooseRecord.id, platformLooseRecord],
    [`platform:${platformLooseRecord.id}`, platformLooseRecord]
  ]);
  for (const record of [...extraWorldRecords, ...extraPlatformRecords]) {
    recordIndex.set(record.id, record);
    recordIndex.set(`${record.scope}:${record.id}`, record);
  }
  return {
    runtimeContext: {
      world: {
        allWitnesses() { return []; },
        project() { return []; }
      },
      appProject: null,
      appSnapshotManager: null,
      appPreviewSessionManager: null,
      operatorContract: {
        worldHome: null
      },
      close: async () => {}
    },
    worldGraph: { nodes: [] },
    platformModel: { nodes: [] },
    worldRecords,
    platformRecords,
    recordIndex,
    containerIndex: new Map()
  };
}

function createPreviewHarness() {
  let activeRevision = 7;
  let nextSessionId = 1;
  const sessions = new Map();
  const patchCalls = [];
  const propertyValues = new Map([
    ["thing.alpha\u0000fill", "blue"],
    ["thing.alpha\u0000enabled", false],
    ["thing.alpha\u0000count", 1],
    ["thing.alpha\u0000config", { accent: "blue" }]
  ]);
  const world = createWorld({
    genesis: { system: "witness-world", mode: "preview-harness" }
  });
  world.emit({
    process: "defineThing",
    actor: "ctx.alpha",
    claims: [
      { op: "thing", id: "thing.alpha" },
      relation("thing.alpha", "hasModuleKind", "thing")
    ],
    body: { title: "Alpha" }
  });
  const invalidReason = baseRevision =>
    `preview no longer matches active snapshot (expected app revision ${baseRevision}, active revision ${activeRevision})`;
  const readSessionShape = session => {
    if (!session) return null;
    if (activeRevision !== session.baseAppRevision) {
      return {
        id: session.id,
        baseAppRevision: session.baseAppRevision,
        previewRevision: session.previewRevision,
        status: "stale",
        invalidReason: invalidReason(session.baseAppRevision)
      };
    }
    return {
      id: session.id,
      baseAppRevision: session.baseAppRevision,
      previewRevision: session.previewRevision,
      status: "active",
      invalidReason: null
    };
  };
  const previewManager = {
    createSession() {
      const id = `preview-${nextSessionId++}`;
      const session = {
        id,
        baseAppRevision: activeRevision,
        previewRevision: 0
      };
      sessions.set(id, session);
      return readSessionShape(session);
    },
    readSession(id) {
      return readSessionShape(sessions.get(id) ?? null);
    },
    deleteSession(id) {
      return sessions.delete(id);
    },
    async inspectTarget(id, target, options = {}) {
      const session = sessions.get(id) ?? null;
      const sessionShape = readSessionShape(session);
      if (!sessionShape || sessionShape.status === "stale") return null;
      const resolvedTarget = options?.preferredTarget || target || "thing.alpha";
      const fill = propertyValues.get(`${resolvedTarget}\u0000fill`);
      const enabled = propertyValues.get(`${resolvedTarget}\u0000enabled`);
      const count = propertyValues.get(`${resolvedTarget}\u0000count`);
      const config = propertyValues.get(`${resolvedTarget}\u0000config`);
      return {
        query: target,
        resolvedFrom: target,
        target: resolvedTarget,
        componentKind: "leaf",
        editable: true,
        editableSource: {
          file: "C:/tmp/app/alpha.rvm",
          sourceId: "app/alpha.rvm",
          sourceLanguage: "rvm"
        },
        authoredProps: { fill, enabled, count, config },
        runtimeProps: {
          surfaceKind: "leaf",
          props: { fill, enabled, count, config }
        },
        validProps: [
          { key: "fill", valueType: "string" },
          { key: "enabled", valueType: "boolean" },
          { key: "count", valueType: "number" },
          { key: "config", valueType: "object" },
          { key: "inputType", valueType: "string", options: ["text", "password"] }
        ],
        breadcrumbs: [{ label: "App Root" }, { label: "Alpha Surface" }],
        provenance: {
          reasons: [{ kind: "surface-id", value: resolvedTarget }]
        },
        sources: [{
          file: "C:/tmp/app/alpha.rvm",
          sourceId: "app/alpha.rvm",
          startLine: 3,
          sourceLanguage: "rvm",
          sourceKind: "view"
        }],
        candidates: [{
          target: resolvedTarget,
          confidence: "high",
          matchType: "surface-id",
          sourceCount: 1
        }]
      };
    },
    async patchTargetProperty(id, { target, property, value }) {
      const session = sessions.get(id) ?? null;
      const sessionShape = readSessionShape(session);
      if (!session || sessionShape?.status === "stale") {
        throw new Error(sessionShape?.invalidReason ?? "preview session not found");
      }
      patchCalls.push({
        id,
        target,
        property,
        value: structuredClone(value)
      });
      propertyValues.set(`${target}\u0000${property}`, value);
      session.previewRevision += 1;
      return {
        previewSession: readSessionShape(session),
        inspection: await this.inspectTarget(id, target, { preferredTarget: target })
      };
    }
  };
  const snapshotManager = {
    getActiveSnapshot() {
      return {
        appRevision: activeRevision,
        world
      };
    },
    async ensureFresh() {
      return this.getActiveSnapshot();
    },
    close() {}
  };
  return {
    previewManager,
    snapshotManager,
    patchCalls,
    setActiveRevision(value) {
      activeRevision = Number(value);
    }
  };
}

test("parseTuiArgs captures app path, world home, runtime config, and batch commands", () => {
  const parsed = parseTuiArgs([
    "examples/demo-todo-app",
    "--world-home", "C:/worlds/demo",
    "--runtime-profile", "minimal",
    "--runtime-plugin", "plugin.inspect",
    "--runtime-plugin", "plugin.platform",
    "--command", "status",
    "--command", "quit"
  ]);

  assert.equal(parsed.appPath, "examples/demo-todo-app");
  assert.equal(parsed.worldHome, "C:/worlds/demo");
  assert.equal(parsed.runtimeProfile, "minimal");
  assert.equal(parsed.runtimeProfileExplicit, true);
  assert.deepEqual(parsed.runtimePluginIds, ["plugin.inspect", "plugin.platform"]);
  assert.deepEqual(parsed.commands, ["status", "quit"]);
});

test("operator TUI engine keeps tree navigation, aliases, and local programs working", async () => {
  const engine = createOperatorTuiEngine(makeStubState());

  assert.equal(buildTuiPrompt(engine.state, engine.session), "root> ");

  const root = await engine.execute("tree");
  assert.match(root.output, /Workbench/);
  assert.match(root.output, /Things/);
  assert.match(root.output, /Witnesses/);

  const openThingsRoot = await engine.execute("open things");
  assert.match(openThingsRoot.output, /Contexts/);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "Things> ");

  const openThings = await engine.execute("open entities");
  assert.match(openThings.output, /Alpha <thing>/);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "Things/Entities> ");

  const backToThings = await engine.execute("close");
  assert.match(backToThings.output, /Contexts/);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "Things> ");

  const openThingsByLabel = await engine.execute("open Entities");
  assert.match(openThingsByLabel.output, /Alpha <thing>/);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "Things/Entities> ");

  await engine.execute("back");
  const backHome = await engine.execute("home");
  assert.match(backHome.output, /Workbench/);
  const openTypes = await engine.execute("open types");
  assert.match(openTypes.output, /Value Types/);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "Types> ");
  const openValueTypesByLabel = await engine.execute("open Value Types");
  assert.match(openValueTypesByLabel.output, /Value Types/);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "Types/Value Types> ");

  await engine.execute("close");
  await engine.execute("home");
  await engine.execute("open things");
  await engine.execute("open entities");

  const select = await engine.execute("select 1");
  assert.equal(select.output, "this = world:thing.alpha");

  const alias = await engine.execute("a = this");
  assert.equal(alias.output, "a = world:thing.alpha");

  const inspect = await engine.execute("inspect a");
  assert.match(inspect.output, /^Alpha/m);
  assert.match(inspect.output, /context: ctx\.alpha/);

  const saveProgram = await engine.execute("program save demo = select thing.alpha ; inspect this");
  assert.equal(saveProgram.output, "saved program demo.");
  const runProgram = await engine.execute("program run demo");
  assert.match(runProgram.output, /> select thing\.alpha/);
  assert.match(runProgram.output, /Alpha/);
});

test("operator TUI ls aliases tree for the current container", async () => {
  const engine = createOperatorTuiEngine(makeStubState());
  const tree = await engine.execute("tree");
  const ls = await engine.execute("ls");
  const look = await engine.execute("look");
  assert.equal(ls.output, tree.output);
  assert.equal(look.output, tree.output);
});

test("operator TUI autocomplete suggests commands, containers, and column helpers", async () => {
  const engine = createOperatorTuiEngine(makeStubState());

  let candidates = buildTuiAutocompleteCandidates(engine.state, engine.session);
  assert.equal(candidates.includes("look"), true);
  assert.equal(candidates.includes("open things"), true);
  assert.equal(candidates.includes("use context backend/runtime"), true);
  assert.equal(buildTuiAutocompletePreview(engine.state, engine.session, "lo"), "ok");
  assert.equal(buildTuiAutocompletePreview(engine.state, engine.session, "open t"), "hings");
  assert.equal(buildTuiAutocompletePreview(engine.state, engine.session, "use con"), "text ");

  await engine.execute("open things");
  candidates = buildTuiAutocompleteCandidates(engine.state, engine.session);
  assert.equal(candidates.includes("open contexts"), true);
  await engine.execute("home");
  await engine.execute("open types");
  candidates = buildTuiAutocompleteCandidates(engine.state, engine.session);
  assert.equal(candidates.includes("open value types"), true);
  assert.equal(buildTuiAutocompletePreview(engine.state, engine.session, "open val"), "ue types");

  await engine.execute("search Alpha");
  candidates = buildTuiAutocompleteCandidates(engine.state, engine.session);
  assert.equal(candidates.includes("values kind"), true);
  assert.equal(candidates.includes("filter scope="), true);
  assert.equal(buildTuiAutocompletePreview(engine.state, engine.session, "valu"), "es ");
});

test("operator TUI supports context focus roots with use leave and scoped look/search", async () => {
  const engine = createOperatorTuiEngine(makeStubState());

  await engine.execute("open things");
  await engine.execute("open contexts");
  const used = await engine.execute("use 1");
  assert.match(used.output, /^context:backend\/routes$/m);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "context:backend/routes> ");

  const leave = await engine.execute("leave");
  assert.match(leave.output, /^Contexts$/m);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "Things/Contexts> ");

  const useRuntime = await engine.execute("use context backend/runtime");
  assert.match(useRuntime.output, /^context:backend\/runtime$/m);
  assert.match(useRuntime.output, /Things \(2\)/);
  assert.doesNotMatch(useRuntime.output, /Contexts \(/);
  assert.doesNotMatch(useRuntime.output, /Processes \(/);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "context:backend/runtime> ");

  const pwd = await engine.execute("pwd");
  assert.equal(pwd.output, "context:backend/runtime");

  const openThings = await engine.execute("open things");
  assert.match(openThings.output, /^Things$/m);
  assert.match(openThings.output, /Entities \(1\)/);
  assert.match(openThings.output, /Processes \(1\)/);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "context:backend/runtime/Things> ");

  const openEntities = await engine.execute("open entities");
  assert.match(openEntities.output, /backendHost <thing> - backend\/runtime/);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "context:backend/runtime/Things/Entities> ");

  const close = await engine.execute("close");
  assert.match(close.output, /^Things$/m);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "context:backend/runtime/Things> ");

  const closeToFocusRoot = await engine.execute("close");
  assert.match(closeToFocusRoot.output, /^context:backend\/runtime$/m);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "context:backend/runtime> ");

  const home = await engine.execute("home");
  assert.match(home.output, /^context:backend\/runtime$/m);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "context:backend/runtime> ");

  const focusedSearch = await engine.execute("search host");
  assert.match(focusedSearch.output, /scope=context/);
  assert.match(focusedSearch.output, /focus=context:backend\/runtime/);
  assert.match(focusedSearch.output, /backendHost\s+thing\s+world\s+backendHost/);

  const valuesContext = await engine.execute("values context");
  assert.equal(valuesContext.output, [
    "values context (1 row)",
    "1. backend/runtime (1)"
  ].join("\n"));

  const globalWorldSearch = await engine.execute("search --scope world runtime");
  assert.match(globalWorldSearch.output, /scope=world/);
  assert.match(globalWorldSearch.output, /backend\/runtime\s+context\s+world\s+backend\/runtime/);

  const globalAllSearch = await engine.execute("search --scope all platform");
  assert.match(globalAllSearch.output, /scope=all/);
  assert.match(globalAllSearch.output, /Platform Plugin/);

  const platformSearch = await engine.execute("search --scope platform plugin");
  assert.match(platformSearch.output, /scope=platform/);
  assert.match(platformSearch.output, /Platform Plugin/);

  await engine.execute("search host");
  const inspect = await engine.execute("inspect 1");
  assert.match(inspect.output, /^backendHost/m);

  const link = await engine.execute("link 1");
  assert.match(link.output, /RECORD world:backendHost/);
  assert.match(link.output, /target: backendHost/);

  const leaveAfterSearch = await engine.execute("leave");
  assert.match(leaveAfterSearch.output, /^Contexts$/m);
  const columnsAfterLeave = await engine.execute("columns");
  assert.equal(columnsAfterLeave.output, "no active result view.");
});

test("operator TUI use this works for selected contexts and rejects non-context records", async () => {
  const engine = createOperatorTuiEngine(makeStubState());

  await engine.execute("open world");
  await engine.execute("open contexts");
  await engine.execute("select 2");
  const useThis = await engine.execute("use this");
  assert.match(useThis.output, /^context:backend\/runtime$/m);
  assert.equal(buildTuiPrompt(engine.state, engine.session), "context:backend/runtime> ");

  const status = await engine.execute("status");
  assert.match(status.output, /focus kind: context/);
  assert.match(status.output, /focus id: backend\/runtime/);

  await engine.execute("leave");
  const useThing = await engine.execute("use thing.alpha");
  assert.equal(useThing.output, "use is context-only in this tranche.");
});

test("operator TUI search renders a windowed result table and keeps exact matches first", async () => {
  const engine = createOperatorTuiEngine(makeStubState({
    extraWorldCount: 30,
    extraPlatformCount: 10
  }));

  const byTitle = await engine.execute("search Alpha");
  assert.match(byTitle.output, /^search "Alpha" \| scope=all \| rows=1-25 of 44 \| sort=relevance \| filters=none/m);
  assert.match(byTitle.output, /^#\s+title\s+kind\s+scope\s+id/m);
  assert.match(byTitle.output, /\n\s*1\s+Alpha\s+thing\s+world\s+thing\.alpha/m);
  assert.doesNotMatch(byTitle.output, /\n\s*26\s+/m);

  const byId = await engine.execute("search thing.alpha");
  assert.match(byId.output, /\n\s*1\s+Alpha\s+thing\s+world\s+thing\.alpha/m);
});

test("operator TUI search supports scope filtering and plain-text empty or malformed responses", async () => {
  const engine = createOperatorTuiEngine(makeStubState());
  const result = await engine.execute("search --scope platform plugin");
  assert.match(result.output, /^search "plugin" \| scope=platform \| rows=1-2 of 2 \| sort=relevance \| filters=none/m);
  assert.doesNotMatch(result.output, /Alpha\s+thing\s+world/m);
  assert.match(result.output, /Platform Plugin\s+plugin\s+platform\s+plugin\.platform/m);

  const empty = await engine.execute("search zzzzzz");
  assert.equal(empty.output, "(no matches for \"zzzzzz\")");

  const malformed = await engine.execute("search --scope");
  assert.equal(malformed.output, "usage: search <text> or search --scope all|world|platform <text>");
});

test("operator TUI result views support columns filters sorting paging and numeric follow-ups", async () => {
  const engine = createOperatorTuiEngine(makeStubState({
    extraWorldCount: 30,
    extraPlatformCount: 10
  }));

  await engine.execute("search Alpha");

  const columns = await engine.execute("columns");
  assert.equal(columns.output, "active columns: title, kind, scope, id\navailable columns: summary, source, context, status");

  const addColumn = await engine.execute("column add summary");
  assert.match(addColumn.output, /^search "Alpha" .*filters=none/m);
  assert.match(addColumn.output, /^#\s+title\s+kind\s+scope\s+id\s+summary/m);

  const sortByKind = await engine.execute("sort by kind");
  assert.match(sortByKind.output, /sort=kind/);
  assert.match(sortByKind.output, /\n\s*1\s+Alpha Plugin 01\s+plugin\s+platform\s+plugin\.alpha-01/m);

  const filterWorld = await engine.execute("filter scope=world");
  assert.match(filterWorld.output, /filters=scope=world/);
  assert.doesNotMatch(filterWorld.output, /Alpha Plugin 01/);
  assert.match(filterWorld.output, /rows=1-25 of 33/);

  const filters = await engine.execute("filters");
  assert.equal(filters.output, "1. scope=world");

  const kindValues = await engine.execute("values kind");
  assert.equal(kindValues.output, [
    "values kind (33 rows)",
    "1. thing (18)",
    "2. surface (15)",
  ].join("\n"));

  const scopeValues = await engine.execute("values scope");
  assert.equal(scopeValues.output, [
    "values scope (33 rows)",
    "1. world (33)"
  ].join("\n"));

  const sortReset = await engine.execute("sort reset");
  assert.match(sortReset.output, /sort=relevance/);

  const next = await engine.execute("next");
  assert.match(next.output, /rows=26-33 of 33/);

  const inspect = await engine.execute("inspect 3");
  assert.match(inspect.output, /^Alpha World 27/m);

  const link = await engine.execute("link 3");
  assert.match(link.output, /RECORD world:thing\.alpha-27/);
  assert.match(link.output, /target: thing\.alpha-27/);

  const prev = await engine.execute("prev");
  assert.match(prev.output, /rows=1-25 of 33/);

  const pageTwo = await engine.execute("page 2");
  assert.match(pageTwo.output, /rows=26-33 of 33/);
});

test("operator TUI result views support saved views reset and clear", async () => {
  const engine = createOperatorTuiEngine(makeStubState({
    extraWorldCount: 30,
    extraPlatformCount: 10
  }));

  await engine.execute("search Alpha");
  await engine.execute("column add source");
  await engine.execute("sort by kind");
  await engine.execute("filter scope=world");

  const saved = await engine.execute("view save alpha-world");
  assert.equal(saved.output, "saved view alpha-world.");

  const views = await engine.execute("views");
  assert.match(views.output, /\* alpha-world: search "Alpha" \[scope=all\]/);

  const close = await engine.execute("view close");
  assert.equal(close.output, "view closed; result view remains active in ad hoc mode.");

  const resetColumns = await engine.execute("column reset");
  assert.match(resetColumns.output, /^#\s+title\s+kind\s+scope\s+id\s*$/m);

  const clearFilters = await engine.execute("filter clear");
  assert.match(clearFilters.output, /filters=none/);

  const open = await engine.execute("view open alpha-world");
  assert.match(open.output, /sort=kind/);
  assert.match(open.output, /filters=scope=world/);
  assert.match(open.output, /view=alpha-world/);
  assert.match(open.output, /^#\s+title\s+kind\s+scope\s+id\s+source/m);

  const deleted = await engine.execute("view delete alpha-world");
  assert.equal(deleted.output, "deleted view alpha-world.");

  const viewsAfterDelete = await engine.execute("views");
  assert.equal(viewsAfterDelete.output, "(no saved views)");

  const cleared = await engine.execute("clear");
  assert.equal(cleared.output, "result view cleared.");
});

test("operator TUI result-view commands fail clearly when no active result view exists", async () => {
  const engine = createOperatorTuiEngine(makeStubState());

  const columns = await engine.execute("columns");
  assert.equal(columns.output, "no active result view.");

  const malformedFilter = await engine.execute("filter scope");
  assert.equal(malformedFilter.output, "usage: filter <column>=<value> or filter clear");

  const malformedValues = await engine.execute("values");
  assert.equal(malformedValues.output, "usage: values <column>");

  const page = await engine.execute("page 2");
  assert.equal(page.output, "no active result view.");

  const viewSave = await engine.execute("view save alpha-world");
  assert.equal(viewSave.output, "no active result view.");

  const values = await engine.execute("values kind");
  assert.equal(values.output, "no active result view.");
});

test("operator TUI lazily creates a preview session on status for app-backed sessions", async () => {
  const harness = createPreviewHarness();
  const state = makeStubState();
  state.runtimeContext.appProject = { appRoot: "C:/tmp/app" };
  state.runtimeContext.appSnapshotManager = harness.snapshotManager;
  state.runtimeContext.appPreviewSessionManager = harness.previewManager;
  const engine = createOperatorTuiEngine(state);

  const status = await engine.execute("status");
  assert.match(status.output, /preview session: preview-1/);
  assert.match(status.output, /preview base revision: 7/);
  assert.match(status.output, /preview revision: 0/);
  assert.match(status.output, /preview status: active/);

  const statusAgain = await engine.execute("status");
  assert.match(statusAgain.output, /preview session: preview-1/);
});

test("operator TUI lazily creates a preview session on inspect and renders preview provenance", async () => {
  const harness = createPreviewHarness();
  const state = makeStubState();
  state.runtimeContext.appProject = { appRoot: "C:/tmp/app" };
  state.runtimeContext.appSnapshotManager = harness.snapshotManager;
  state.runtimeContext.appPreviewSessionManager = harness.previewManager;
  const engine = createOperatorTuiEngine(state);

  await engine.execute("select thing.alpha");
  const previewInspect = await engine.execute("inspect this");
  assert.match(previewInspect.output, /preview target: thing\.alpha/);
  assert.match(previewInspect.output, /editable: yes/);
  assert.match(previewInspect.output, /source id: app\/alpha\.rvm/);
  assert.match(previewInspect.output, /breadcrumbs: App Root > Alpha Surface/);
  assert.match(previewInspect.output, /provenance reasons:/);
  assert.match(previewInspect.output, /runtime props:/);
});

test("operator TUI link and refs expose typed deep-link summaries", async () => {
  const harness = createPreviewHarness();
  const state = makeStubState();
  state.runtimeContext.appProject = { appRoot: "C:/tmp/app" };
  state.runtimeContext.appSnapshotManager = harness.snapshotManager;
  state.runtimeContext.appPreviewSessionManager = harness.previewManager;
  const engine = createOperatorTuiEngine(state);

  await engine.execute("select thing.alpha");

  const link = await engine.execute("link this");
  assert.match(link.output, /RECORD world:thing\.alpha/);
  assert.match(link.output, /target: thing\.alpha/);
  assert.match(link.output, /source: C:\/tmp\/world\/alpha\.rvm:3/);

  const refs = await engine.execute("refs this");
  assert.match(refs.output, /\[1\] PREVIEW-SESSION preview-1 \[open\]/);
  assert.match(refs.output, /SOURCE C:\/tmp\/app\/alpha\.rvm:3 \[open\]/);

  const source = await engine.execute("source this");
  assert.match(source.output, /kind: source/);
  assert.match(source.output, /path: C:\/tmp\/app\/alpha\.rvm/);
  assert.match(source.output, /line: 3/);

  const provenance = await engine.execute("provenance this");
  assert.match(provenance.output, /kind: provenance/);
  assert.match(provenance.output, /preview session: preview-1/);
  assert.match(provenance.output, /entries:/);
  assert.match(provenance.output, /\* 1\. \[BREADCRUMB\] App Root \[open\]/);
  assert.match(provenance.output, /4\. \[PREVIEW\] preview-1 \[open\]/);
  assert.match(provenance.output, /5\. \[REASON\] surface-id: thing\.alpha \[info\]/);

  const provenanceNext = await engine.execute("provenance next");
  assert.match(provenanceNext.output, /\* 2\. \[BREADCRUMB\] Alpha Surface \[open\]/);
  assert.match(provenanceNext.output, /label: Alpha Surface/);

  const provenanceOpenSource = await engine.execute("provenance open 3");
  assert.match(provenanceOpenSource.output, /kind: source/);
  assert.match(provenanceOpenSource.output, /path: C:\/tmp\/app\/alpha\.rvm/);

  await engine.execute("provenance this");
  const provenanceReason = await engine.execute("provenance open 5");
  assert.equal(provenanceReason.status, "error");
  assert.equal(provenanceReason.output, "reason rows are informational only.");
});

test("operator TUI sources lists and switches between multiple source entries", async () => {
  const state = makeStubState();
  const record = state.recordIndex.get("thing.alpha");
  record.sourceHints = [
    {
      file: "C:/tmp/world/alpha-one.rvm",
      line: 3,
      section: "view",
      sourceLanguage: "rvm"
    },
    {
      file: "C:/tmp/world/alpha-two.rvm",
      line: 19,
      section: "trait",
      sourceLanguage: "rvm"
    }
  ];
  const engine = createOperatorTuiEngine(state);

  await engine.execute("select thing.alpha");

  const sources = await engine.execute("sources this");
  assert.match(sources.output, /sources:/);
  assert.match(sources.output, /\* 1\. C:\/tmp\/world\/alpha-one\.rvm:3/);
  assert.match(sources.output, /2\. C:\/tmp\/world\/alpha-two\.rvm:19/);

  const second = await engine.execute("source open 2");
  assert.match(second.output, /path: C:\/tmp\/world\/alpha-two\.rvm/);
  assert.match(second.output, /line: 19/);

  const previous = await engine.execute("source prev");
  assert.match(previous.output, /path: C:\/tmp\/world\/alpha-one\.rvm/);
  assert.match(previous.output, /line: 3/);
});

test("operator TUI preview reuses the same lazy-created session and reports writable preview state", async () => {
  const harness = createPreviewHarness();
  const state = makeStubState();
  state.runtimeContext.appProject = { appRoot: "C:/tmp/app" };
  state.runtimeContext.appSnapshotManager = harness.snapshotManager;
  state.runtimeContext.appPreviewSessionManager = harness.previewManager;
  const engine = createOperatorTuiEngine(state);

  await engine.execute("status");
  const preview = await engine.execute("preview");
  assert.match(preview.output, /session: preview-1/);
  assert.match(preview.output, /writes: preview-only authored property edits/);

  const previewAgain = await engine.execute("preview");
  assert.match(previewAgain.output, /session: preview-1/);
  assert.match(previewAgain.output, /preview revision: 0/);
});

test("operator TUI marks stale preview sessions and refresh clears them deterministically", async () => {
  const harness = createPreviewHarness();
  const state = makeStubState();
  state.runtimeContext.appProject = { appRoot: "C:/tmp/app" };
  state.runtimeContext.appSnapshotManager = harness.snapshotManager;
  state.runtimeContext.appPreviewSessionManager = harness.previewManager;
  const engine = createOperatorTuiEngine(state);

  await engine.execute("status");
  harness.setActiveRevision(8);

  const status = await engine.execute("status");
  assert.match(status.output, /preview status: stale/);
  assert.match(status.output, /expected app revision 7, active revision 8/);

  await engine.execute("select thing.alpha");
  const staleInspect = await engine.execute("inspect this");
  assert.match(staleInspect.output, /preview session stale: preview no longer matches active snapshot/);

  const staleSet = await engine.execute('set fill "teal"');
  assert.match(staleSet.output, /preview session stale:/);
  assert.equal(staleSet.status, "error");

  const refresh = await engine.execute("refresh");
  assert.match(refresh.output, /stale preview session cleared/);

  const statusAfterRefresh = await engine.execute("status");
  assert.match(statusAfterRefresh.output, /preview session: preview-2/);
  assert.match(statusAfterRefresh.output, /preview status: active/);
});

test("operator TUI preview clear drops the active preview session and next mutation recreates it", async () => {
  const harness = createPreviewHarness();
  const state = makeStubState();
  state.runtimeContext.appProject = { appRoot: "C:/tmp/app" };
  state.runtimeContext.appSnapshotManager = harness.snapshotManager;
  state.runtimeContext.appPreviewSessionManager = harness.previewManager;
  const engine = createOperatorTuiEngine(state);

  await engine.execute("preview");
  const cleared = await engine.execute("preview clear");
  assert.equal(cleared.output, "preview session cleared.");

  const previewRecreated = await engine.execute("preview");
  assert.match(previewRecreated.output, /session: preview-2/);
});

test("operator TUI reports preview-session unavailability in repo self-model mode", async () => {
  const engine = createOperatorTuiEngine(makeStubState());
  const status = await engine.execute("status");
  assert.match(status.output, /preview status: unavailable/);
  assert.match(status.output, /repo self-model mode/);

  const preview = await engine.execute("preview");
  assert.match(preview.output, /preview sessions unavailable in detached repo self-model mode/);
});

test("operator TUI props commands expose authored runtime and valid property views", async () => {
  const harness = createPreviewHarness();
  const state = makeStubState();
  state.runtimeContext.appProject = { appRoot: "C:/tmp/app" };
  state.runtimeContext.appSnapshotManager = harness.snapshotManager;
  state.runtimeContext.appPreviewSessionManager = harness.previewManager;
  const engine = createOperatorTuiEngine(state);
  await engine.execute("select thing.alpha");

  const authored = await engine.execute("props this");
  assert.match(authored.output, /authored props:/);
  assert.match(authored.output, /fill: blue/);

  const runtime = await engine.execute("props runtime this");
  assert.match(runtime.output, /runtime props:/);
  assert.match(runtime.output, /enabled: false/);

  const valid = await engine.execute("props valid this");
  assert.match(valid.output, /valid props:/);
  assert.match(valid.output, /fill \(string\)/);
  assert.match(valid.output, /inputType \(string\) \[text, password\]/);
});

test("operator TUI set applies preview property edits with typed values and supports alias targets", async () => {
  const harness = createPreviewHarness();
  const state = makeStubState();
  state.runtimeContext.appProject = { appRoot: "C:/tmp/app" };
  state.runtimeContext.appSnapshotManager = harness.snapshotManager;
  state.runtimeContext.appPreviewSessionManager = harness.previewManager;
  const engine = createOperatorTuiEngine(state);

  await engine.execute("select thing.alpha");
  await engine.execute("a = this");

  const stringResult = await engine.execute('set fill "#22c55e"');
  assert.match(stringResult.output, /updated preview property: fill/);
  assert.match(stringResult.output, /current: #22c55e/);

  const boolResult = await engine.execute("set a enabled true");
  assert.match(boolResult.output, /updated preview property: enabled/);
  assert.match(boolResult.output, /current: true/);

  const numberResult = await engine.execute("set count 42");
  assert.match(numberResult.output, /updated preview property: count/);
  assert.match(numberResult.output, /current: 42/);

  const objectResult = await engine.execute('set config {"accent":"green"}');
  assert.match(objectResult.output, /updated preview property: config/);
  assert.equal(harness.patchCalls[0].value, "#22c55e");
  assert.equal(harness.patchCalls[1].value, true);
  assert.equal(harness.patchCalls[2].value, 42);
  assert.deepEqual(harness.patchCalls[3].value, { accent: "green" });

  const authored = await engine.execute("props this");
  assert.match(authored.output, /fill: #22c55e/);
  assert.match(authored.output, /enabled: true/);
  assert.match(authored.output, /count: 42/);
  assert.match(authored.output, /config: {"accent":"green"}/);
});

test("operator TUI undo and redo replay preview property edits through the preview session", async () => {
  const harness = createPreviewHarness();
  const state = makeStubState();
  state.runtimeContext.appProject = { appRoot: "C:/tmp/app" };
  state.runtimeContext.appSnapshotManager = harness.snapshotManager;
  state.runtimeContext.appPreviewSessionManager = harness.previewManager;
  const engine = createOperatorTuiEngine(state);

  await engine.execute("select thing.alpha");
  await engine.execute('set fill "orange"');

  const undone = await engine.execute("undo");
  assert.equal(undone.output, "undid set thing.alpha fill.");

  const afterUndo = await engine.execute("props this");
  assert.match(afterUndo.output, /fill: blue/);

  const redone = await engine.execute("redo");
  assert.equal(redone.output, "redid set thing.alpha fill.");

  const afterRedo = await engine.execute("props this");
  assert.match(afterRedo.output, /fill: orange/);
});

test("operator TUI undo leaves preview history intact when the preview session is stale", async () => {
  const harness = createPreviewHarness();
  const state = makeStubState();
  state.runtimeContext.appProject = { appRoot: "C:/tmp/app" };
  state.runtimeContext.appSnapshotManager = harness.snapshotManager;
  state.runtimeContext.appPreviewSessionManager = harness.previewManager;
  const engine = createOperatorTuiEngine(state);

  await engine.execute("select thing.alpha");
  await engine.execute('set fill "orange"');
  harness.setActiveRevision(8);

  const undo = await engine.execute("undo");
  assert.match(undo.output, /preview session stale:/);
  assert.equal(undo.status, "error");

  const refresh = await engine.execute("refresh");
  assert.match(refresh.output, /stale preview session cleared/);
});

test("operator TUI workbench snapshot exposes structured preview inspection and last mutation state", async () => {
  const harness = createPreviewHarness();
  const state = makeStubState();
  state.runtimeContext.appProject = { appRoot: "C:/tmp/app" };
  state.runtimeContext.appSnapshotManager = harness.snapshotManager;
  state.runtimeContext.appPreviewSessionManager = harness.previewManager;
  const engine = createOperatorTuiEngine(state);

  await engine.execute("select thing.alpha");
  await engine.execute('set fill "violet"');

  const snapshot = await buildOperatorWorkbenchSnapshot(state, engine.session, {});
  assert.equal(snapshot.preview.writable, true);
  assert.equal(snapshot.preview.lastMutation?.property, "fill");
  assert.equal(snapshot.rightPane.previewInspection?.target, "thing.alpha");
  assert.equal(snapshot.rightPane.previewInspection?.authoredProps?.fill, "violet");
  assert.equal(snapshot.rightPane.previewInspection?.previewStatus, "active");
});

test("operator TUI reports invalid JSON values before mutating the preview session", async () => {
  const harness = createPreviewHarness();
  const state = makeStubState();
  state.runtimeContext.appProject = { appRoot: "C:/tmp/app" };
  state.runtimeContext.appSnapshotManager = harness.snapshotManager;
  state.runtimeContext.appPreviewSessionManager = harness.previewManager;
  const engine = createOperatorTuiEngine(state);

  await engine.execute("select thing.alpha");
  const result = await engine.execute('set config {"accent": }');
  assert.match(result.output, /invalid value:/);
  assert.equal(result.status, "error");
  assert.equal(harness.patchCalls.length, 0);
});

test("operator TUI runtime context hydrates persisted world-home witnesses", async () => {
  const worldHome = await fs.mkdtemp(path.join(os.tmpdir(), "witness-tui-world-home-"));
  const witnessLogPath = path.join(worldHome, "logs", "witness-world.witnesses.jsonl");
  const observationLogPath = path.join(worldHome, "logs", "witness-world.observations.jsonl");
  await fs.mkdir(path.dirname(witnessLogPath), { recursive: true });
  const world = createWorld({
    genesis: { system: "witness-world", mode: "test" },
    witnessLogPath,
    observationLogPath
  });
  world.emit({
    process: "defineThing",
    actor: "ctx.alpha",
    claims: [
      { op: "thing", id: "thing.persisted" },
      relation("thing.persisted", "hasModuleKind", "entity")
    ],
    body: { title: "Persisted Thing" }
  });
  await world.flushPersistence();

  try {
    const runtimeContext = await loadOperatorTuiRuntimeContext({
      worldHome
    });
    const state = await buildOperatorTuiState(runtimeContext);
    assert.equal(state.worldRecords.some(record => record.id === "thing.persisted"), true);
    assert.equal(state.platformRecords.length > 0, true);
  } finally {
    await fs.rm(worldHome, { recursive: true, force: true });
  }
});

test("plugin-owned operator shell batch mode runs preview-aware reads and windowed search commands cleanly", async () => {
  const child = spawn(process.execPath, [
    "scripts/run-operator-shell.mjs",
    "examples/operator",
    "--runtime-plugin", "plugin.operator-workbench",
    "--command", "search backend",
    "--command", "columns",
    "--command", "column add summary",
    "--command", "sort by kind",
    "--command", "filter scope=world",
    "--command", "inspect 1",
    "--command", "status",
    "--command", "preview",
    "--command", "quit"
  ], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  const code = await onceExitCode(child);

  assert.equal(code, 0);
  assert.equal(normalizeStderr(stderr), "");
  assert.match(stdout, /> search backend/);
  assert.match(stdout, /search "backend" \| scope=all \| rows=/);
  assert.match(stdout, /> columns/);
  assert.match(stdout, /active columns: title, kind, scope, id/);
  assert.match(stdout, /> column add summary/);
  assert.match(stdout, /^#\s+title\s+kind\s+scope\s+id\s+summary/m);
  assert.match(stdout, /> sort by kind/);
  assert.match(stdout, /sort=kind/);
  assert.match(stdout, /> filter scope=world/);
  assert.match(stdout, /filters=scope=world/);
  assert.match(stdout, /> inspect 1/);
  assert.match(stdout, /backend\/capabilities/);
  assert.match(stdout, /preview target: operator_example/);
  assert.match(stdout, /> status/);
  assert.match(stdout, /preview session:/);
  assert.match(stdout, /> preview/);
  assert.match(stdout, /writes: preview-only authored property edits/);
  assert.match(stdout, /> quit/);
  assert.match(stdout, /bye\./);
});

test("plugin-owned operator shell batch mode runs context focus flows cleanly", async () => {
  const child = spawn(process.execPath, [
    "scripts/run-operator-shell.mjs",
    "--command", "open world",
    "--command", "open contexts",
    "--command", "use 4",
    "--command", "look",
    "--command", "open things",
    "--command", "open entities",
    "--command", "close",
    "--command", "close",
    "--command", "search host",
    "--command", "values context",
    "--command", "leave",
    "--command", "quit"
  ], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  const code = await onceExitCode(child);

  assert.equal(code, 0);
  assert.equal(normalizeStderr(stderr), "");
  assert.match(stdout, /> use 4/);
  assert.match(stdout, /^context:backend\/runtime$/m);
  assert.match(stdout, /Things \(\d+\)/);
  assert.match(stdout, /> look/);
  assert.match(stdout, /> open things/);
  assert.match(stdout, /Entities \(\d+\)/);
  assert.match(stdout, /> open entities/);
  assert.match(stdout, /backendHost <thing> - backend\/runtime/);
  assert.match(stdout, /> search host/);
  assert.match(stdout, /scope=context/);
  assert.match(stdout, /focus=context:backend\/runtime/);
  assert.match(stdout, /> values context/);
  assert.match(stdout, /1\. backend\/runtime \(\d+\)/);
  assert.match(stdout, /> leave/);
  assert.match(stdout, /^Contexts$/m);
  assert.match(stdout, /bye\./);
});

function normalizeStderr(stderr) {
  return stderr
    .replace(/\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature and might change at any time\r?\n?/g, "")
    .replace(/\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)\r?\n?/g, "")
    .trim();
}

async function onceExitCode(child) {
  if (child.exitCode != null) return child.exitCode;
  return new Promise(resolve => child.once("exit", code => resolve(code)));
}
