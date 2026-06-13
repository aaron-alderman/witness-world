import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorld, createThing, projectors } from "../src/kernel.js";
import { parseWitnessToml, applyWitnessToml, applyWitnessDocs, applyWitnessDocsLegacy, applyWitnessDocsWithRuntimePlugins, loadWitnessTomlFile } from "../src/dsl.js";
import { moduleProjectors } from "../src/modules.js";
import { frontendProgramsProjection, widgetTree } from "../src/widgets.js";
import { mcpServers, mcpToolInstalls } from "../plugins/mcp/projections.js";

const script = `
# Compiler ladder
[[thing]]
actor = "adam"
id = "aaron"

[[compiler]]
actor = "aaron"
id = "compiler_0"

[[description]]
actor = "aaron"
id = "compiler_1_description"
language = "witness-ir"
source = "compiler subset v1"

[[compile]]
actor = "aaron"
compiler = "compiler_0"
description = "compiler_1_description"
output = "compiler_1_artifact"

# Browser host
[[serverRunner]]
actor = "aaron"
id = "server_runner"

[context.common]
actor = "system"

[[identity]]
context = "common"
id = "identity.aaron"
actor = "aaron"
label = "Aaron"
username = "aaron"
password = "aaron"
homePerspective = "aaron:personal"

[[frontendRunner]]
actor = "aaron"
id = "frontend_runner"

[[view]]
actor = "aaron"
id = "aaron_canvas"
target = "aaron"

[[render]]
actor = "aaron"
frontendRunner = "frontend_runner"
view = "aaron_canvas"
frame = "frame_1"

[[route]]
actor = "aaron"
id = "root_route"
path = "/"
serves = "frame_1"

[[serve]]
actor = "aaron"
serverRunner = "server_runner"
route = "root_route"

[[action]]
actor = "aaron"
frontendRunner = "frontend_runner"
id = "drag_aaron_proxy"
target = "aaron"
body = { x = 12, y = 34 }
`;

test("parses TOML-ish witness DSL into ordered documents", () => {
  const docs = parseWitnessToml(script);
  assert.equal(docs.length, 13);
  assert.equal(docs[1].kind, "compiler");
  assert.deepEqual(docs.find(doc => doc.kind === "action")?.values.body, { x: 12, y: 34 });
});

test("applies witness DSL to build compiler and browser runner ladder", () => {
  const world = createWorld();
  const witnesses = applyWitnessToml(world, script);

  assert.equal(witnesses.length, 14);
  assert.deepEqual(world.project(moduleProjectors.compiledArtifacts), [
    { artifact: "compiler_1_artifact", source: "compiler_1_description", compiler: "compiler_0" }
  ]);
  assert.deepEqual(world.project(moduleProjectors.renderedFrames), [
    { frame: "frame_1", view: "aaron_canvas", runner: "frontend_runner" }
  ]);
  assert.equal(
    world.project(projectors.currentRelations).some(r => r.from === "server_runner" && r.rel === "serves" && r.to === "root_route"),
    true
  );
  assert.equal(world.project(moduleProjectors.identityIndex).byUsername.aaron.id, "identity.aaron");
  assert.equal(world.allWitnesses().some(w => w.process === "emitUserAction" && w.body.x === 12), true);
});

test("legacy WTOML apply export delegates through DESIRE pipeline", () => {
  const world = createWorld();
  const docs = parseWitnessToml(`
[context.frontend]
actor = "browser"

[[page]]
actor = "browser"
id = "home_page"
`).map(doc => ({ ...doc, file: "C:/demo/legacy-alias.wtoml" }));

  applyWitnessDocsLegacy(world, docs);

  assert.equal(world.allWitnesses().some(w => w.process === "defineContext" && w.body?.id === "frontend"), true);
  assert.equal(world.allWitnesses().some(w =>
    w.process === "dsl.source.annotate"
    && w.body?.target === "home_page"
    && w.body?.sourceLanguage === "wtoml"
    && typeof w.body?.desireNodeId === "string"
    && Array.isArray(w.body?.desireSourceNodeIds)
  ), true);
});

test("WTOML widget sections supported by the renderer are also first-class in the DESIRE apply path", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[page]]
actor = "browser"
id = "root"

[[label]]
actor = "browser"
id = "proposal_label"
text = "Proposal Body"

[[textarea]]
actor = "browser"
id = "proposal_body"
name = "bodyJson"
text = "{}"

[[details]]
actor = "browser"
id = "proposal_details"

[[summary]]
actor = "browser"
id = "proposal_summary"
text = "More"

[[valueEditor]]
actor = "browser"
id = "proposal_kind_editor"
name = "targetKind"
valueType = "proposal.kind"

[[attachWidget]]
actor = "browser"
parent = "root"
child = "proposal_label"
order = 0

[[attachWidget]]
actor = "browser"
parent = "root"
child = "proposal_body"
order = 1

[[attachWidget]]
actor = "browser"
parent = "root"
child = "proposal_details"
order = 2

[[attachWidget]]
actor = "browser"
parent = "proposal_details"
child = "proposal_summary"
order = 0

[[attachWidget]]
actor = "browser"
parent = "root"
child = "proposal_kind_editor"
order = 3
`);

  const tree = world.project(w => widgetTree(w, "root"));
  assert.equal(tree.kind, "Page");
  assert.equal(tree.children.some(child => child.id === "proposal_label" && child.kind === "Label"), true);
  assert.equal(tree.children.some(child => child.id === "proposal_body" && child.kind === "Textarea"), true);
  assert.equal(tree.children.some(child => child.id === "proposal_details" && child.kind === "Details"), true);
  assert.equal(tree.children.some(child => child.id === "proposal_kind_editor" && child.kind === "ValueEditor"), true);
  const details = tree.children.find(child => child.id === "proposal_details");
  assert.equal(details.children.some(child => child.id === "proposal_summary" && child.kind === "Summary"), true);
});

test("rejects unsupported DSL value syntax", () => {
  assert.throws(() => {
    parseWitnessToml(`
[[thing]]
actor = "adam"
id = "bad_thing"
note = null
`);
  }, /unsupported value/);
});

test("parses unknown DSL sections but rejects unregistered runtime declarations", () => {
  const source = `
[[mystery]]
actor = "adam"
id = "mystery_object"
`;
  const docs = parseWitnessToml(source);
  assert.equal(docs[0].kind, "mystery");
  assert.equal(docs[0].values.id, "mystery_object");
  assert.throws(() => applyWitnessToml(createWorld(), source), /unsupported runtime declaration: kind=mystery/);
});

test("authored runtime plugin installs activate plugin DESIRE runtime declaration handlers during WTOML loading", async () => {
  const pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-desire-plugin-"));
  try {
    const pluginDir = path.join(pluginRoot, "dashboard");
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify({
      id: "plugin.dashboard",
      version: "0.1.0",
      displayName: "Dashboard",
      description: "Dashboard DESIRE runtime declaration extension",
      kind: "plugin",
      runtime: { entry: "./runtime.js" },
      contributes: {}
    }, null, 2));
    await fs.writeFile(path.join(pluginDir, "runtime.js"), `
      export function applyDashboardRuntime(world, doc) {
        return world.emit({
          process: "plugin.dashboard.runtime",
          actor: "plugin.dashboard",
          claims: [],
          body: { id: doc.values.id, label: doc.values.label ?? null }
        });
      }
      export default {
        desireExtensions: {
          runtimeDeclarations: [{ kind: "dashboardRuntime", apply: applyDashboardRuntime }]
        }
      };
    `);
    const docs = parseWitnessToml(`
[[runtimePluginInstall]]
actor = "system"
serverRunner = "app_runner"
plugin = "plugin.dashboard"

[[dashboardRuntime]]
id = "main_dashboard"
label = "Main Dashboard"
`);

    assert.throws(() => applyWitnessDocs(createWorld(), docs), /unsupported runtime declaration: kind=dashboardRuntime/);

    const world = createWorld();
    await applyWitnessDocsWithRuntimePlugins(world, docs, { pluginRoot, runtimeProfile: "minimal" });

    assert.equal(world.allWitnesses().some(w =>
      w.process === "plugin.dashboard.runtime"
      && w.actor === "plugin.dashboard"
      && w.body?.id === "main_dashboard"
      && w.body?.label === "Main Dashboard"
    ), true);
  } finally {
    await fs.rm(pluginRoot, { recursive: true, force: true });
  }
});

test("missing required fields in DSL relation section fail fast", () => {
  const world = createWorld();
  assert.throws(() => {
    applyWitnessToml(world, `
[[relation]]
actor = "adam"
from = "thing_a"
rel = "owns"
`);
  }, /missing required key: to/);
});

test("clone witness requires clone source fields", () => {
  const world = createWorld();
  assert.throws(() => {
    applyWitnessToml(world, `
[[clone]]
actor = "adam"
source = "w"
`);
  }, /missing required key: clone/);
});

test("transfer DSL section updates ownership via transferOwnership", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[thing]]
actor = "adam"
id = "aaron"

[[thing]]
actor = "aaron"
id = "w"

[[transfer]]
actor = "aaron"
thing = "w"
from = "aaron"
to = "callan"
  `);
  assert.equal(world.project(projectors.owners).get("w"), "callan");
  assert.equal(world.allWitnesses().some(w => w.process === "transferOwnership.failed"), false);
});

test("type-model DSL sections emit witnessed definitions and source annotations", () => {
  const world = createWorld();
  const docs = parseWitnessToml(`
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
`).map(doc => ({ ...doc, file: "C:/demo/types.wtoml" }));

  applyWitnessDocs(world, docs);

  assert.equal(world.allWitnesses().some(w => w.process === "defineTrait" && w.body.id === "textual"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "defineValueType" && w.body.id === "widget.text"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "defineProcessSpec" && w.body.process === "widget.define"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "dsl.source.annotate" && w.body.section === "trait" && w.body.target === "textual"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "dsl.source.annotate" && w.body.section === "valueType" && w.body.target === "widget.text"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "dsl.source.annotate" && w.body.section === "processSpec" && w.body.target === "widget_define_spec"), true);
});

test("capability DSL sections emit first-class capability definitions and installs", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[context.frontend]
actor = "browser"
capabilities = ["dom.render"]

[[capability]]
actor = "adam"
id = "notes.sidebar"
label = "Notes Sidebar"
version = "0.1.0"
provenance = { source = "local" }
dependsOn = ["dom.render"]
publicApi = [{ name = "mount", accepts = "widget.id", required = true }]
config = [{ name = "title", accepts = "widget.text", required = false }]
internals = []
authority = [{ name = "browser.dom", accepts = "authority.id", required = true }]
providerAdapters = [{ id = "dom", label = "DOM", kind = "local", status = "shipped", default = true }]
witnessContract = { success = ["notes.sidebar.mount"], failure = ["notes.sidebar.mount.failed"], externalRefs = ["domNodeId"] }
placement = ["context", "routePage"]

[[capabilityInstall]]
actor = "adam"
capability = "notes.sidebar"
target = "frontend"
targetKind = "context"
`);

  const capabilities = world.project(moduleProjectors.capabilities);
  const installs = world.project(moduleProjectors.capabilityInstalls);
  const custom = capabilities.find(row => row.id === "notes.sidebar");
  assert.ok(custom);
  assert.deepEqual(custom.placement, ["context", "routePage"]);
  assert.deepEqual(custom.dependsOn, ["dom.render"]);
  assert.deepEqual(custom.providerAdapters, [
    {
      id: "dom",
      label: "DOM",
      kind: "local",
      status: "shipped",
      default: true,
      requires: []
    }
  ]);
  assert.deepEqual(custom.witnessContract, {
    phases: ["success", "failure"],
    processes: {
      success: ["notes.sidebar.mount"],
      failure: ["notes.sidebar.mount.failed"]
    },
    externalRefs: ["domNodeId"]
  });
  assert.equal(capabilities.some(row => row.id === "dom.render"), true);
  assert.equal(installs.some(row => row.capability === "dom.render" && row.target === "frontend" && row.targetKind === "context"), true);
  assert.equal(installs.some(row => row.capability === "notes.sidebar" && row.target === "frontend" && row.targetKind === "context"), true);
});

test("mcp server DSL sections are applied by the active mcp-authoring plugin", async () => {
  const docs = parseWitnessToml(`
[[serverRunner]]
actor = "system"
id = "app_runner"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[mcpServer]]
actor = "system"
id = "project_mcp"
label = "Project MCP"
serverRunner = "app_runner"
serviceIdentity = "svc.project"
transports = ["stdio", "http"]

[[mcpToolInstall]]
actor = "system"
server = "project_mcp"
tool = "world.read"
actingMode = "service"
scopeContexts = ["ctx.docs"]
scopeTargets = ["page.root"]
`);

  const coreOnlyWorld = createWorld();
  createThing(coreOnlyWorld, { actor: "system", id: "backendHost" });
  createThing(coreOnlyWorld, { actor: "system", id: "frontendHost" });
  assert.throws(() => applyWitnessDocs(coreOnlyWorld, docs), /unsupported runtime declaration/);

  const world = createWorld();
  createThing(world, { actor: "system", id: "backendHost" });
  createThing(world, { actor: "system", id: "frontendHost" });
  await applyWitnessDocsWithRuntimePlugins(world, docs, {
    runtimeProfile: "minimal",
    runtimePluginIds: ["plugin.mcp-authoring"]
  });

  assert.deepEqual(mcpServers(world.allWitnesses()), [{
    id: "project_mcp",
    label: "Project MCP",
    serverRunner: "app_runner",
    serviceIdentity: "svc.project",
    transports: ["http", "stdio"],
    context: null
  }]);
  const projectedToolInstalls = mcpToolInstalls(world.allWitnesses());
  assert.deepEqual(projectedToolInstalls, [{
    server: "project_mcp",
    tool: "world.read",
    actingMode: "service",
    scopeContexts: ["ctx.docs"],
    scopeTargets: ["page.root"],
    witness: projectedToolInstalls[0].witness
  }]);
});

test("runtime plugin DSL sections emit serverRunner-scoped runtime plugin installs", () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "backendHost" });
  createThing(world, { actor: "system", id: "frontendHost" });
  const docs = parseWitnessToml(`
[[serverRunner]]
actor = "system"
id = "app_runner"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[runtimePluginInstall]]
actor = "system"
serverRunner = "app_runner"
plugin = "plugin.inspect"

[[runtimePluginRemove]]
actor = "system"
serverRunner = "app_runner"
plugin = "plugin.inspect"
`).map(doc => ({ ...doc, file: "C:/demo/runtime-plugins.wtoml" }));

  applyWitnessDocs(world, docs);

  assert.deepEqual(world.project(moduleProjectors.runtimePluginInstalls), []);
  assert.equal(world.allWitnesses().some(w => w.process === "installRuntimePlugin" && w.body.plugin === "plugin.inspect"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "removeRuntimePlugin" && w.body.plugin === "plugin.inspect"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "dsl.source.annotate" && w.body.section === "runtimePluginInstall" && w.body.target === "app_runner"), true);
});

test("maintained demo entrypoints inherit authored runtime plugin installs without duplicates", async () => {
  const expected = ["plugin.authoring", "plugin.canvas", "plugin.demo", "plugin.inspect"];
  const loadRunnerState = async relativePath => {
    const world = createWorld();
    const docs = await loadWitnessTomlFile(path.join(process.cwd(), relativePath));
    applyWitnessDocs(world, docs);
    const plugins = world.project(moduleProjectors.runtimePluginInstalls)
      .filter(row => row.serverRunner === "demo_server")
      .map(row => row.plugin)
      .sort();
    const runner = world.project(moduleProjectors.serverRunners).find(row => row.id === "demo_server");
    return { plugins, runner };
  };

  for (const relativePath of [
    "examples/demo-todo-app/app.wtoml",
    "examples/eden/app.wtoml"
  ]) {
    const { plugins, runner } = await loadRunnerState(relativePath);
    assert.deepEqual(plugins, expected);
    assert.equal(runner?.handlerSet ?? null, "demo");
  }
});

test("context composition DSL sections project bindings and lower contextual refs to canonical ids across covered surfaces", () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "backendHost" });
  createThing(world, { actor: "system", id: "frontendHost" });
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"
parent = "ctx.source"

[[widget]]
actor = "system"
id = "page_root"
kind = "Page"
context = "ctx.source"

[[widget]]
actor = "system"
id = "shell_box"
kind = "Box"
context = "ctx.target"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "homePage"
target = "page_root"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "homePage"
target = "page_root"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "homePage"
name = "landingPage"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "backendNode"
target = "backendHost"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "frontendNode"
target = "frontendHost"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "backendNode"
target = "backendHost"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "frontendNode"
target = "frontendHost"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "backendNode"
name = "backendAlias"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "frontendNode"
name = "frontendAlias"

[[contextBinding]]
actor = "system"
context = "ctx.target"
name = "shellBox"
target = "shell_box"

[[widget]]
actor = "system"
id = "shell_child"
kind = "Text"
context = "ctx.target"
parentRef = "shellBox"
text = "Child"

[[frontendProgram]]
actor = "system"
id = "landing_program"
context = "ctx.target"
rootWidgetRef = "landingPage"

[[contextBinding]]
actor = "system"
context = "ctx.target"
name = "landingProgram"
target = "landing_program"

[[serverRunner]]
actor = "system"
id = "demo_server"
context = "ctx.target"
backendHostRef = "backendAlias"
frontendHostRef = "frontendAlias"

[[contextBinding]]
actor = "system"
context = "ctx.target"
name = "runnerNode"
target = "demo_server"

[[route]]
actor = "system"
id = "landing_route"
context = "ctx.target"
path = "/landing"
method = "GET"
handler = "page.home"
servesRef = "landingProgram"
rootWidgetRef = "landingPage"

[[contextBinding]]
actor = "system"
context = "ctx.target"
name = "landingRoute"
target = "landing_route"

[[serve]]
actor = "system"
context = "ctx.target"
serverRunnerRef = "runnerNode"
routeRef = "landingRoute"
`);

  const program = frontendProgramsProjection(world.allWitnesses()).find(row => row.id === "landing_program");
  assert.ok(program);
  assert.equal(program.rootWidget, "page_root");
  const child = world.project(w => widgetTree(w, "shell_box")).children.find(row => row.id === "shell_child");
  assert.ok(child);
  assert.equal(child.props.text, "Child");
  const runner = world.project(moduleProjectors.serverRunners).find(row => row.id === "demo_server");
  assert.ok(runner);
  assert.equal(runner.backendHost, "backendHost");
  assert.equal(runner.frontendHost, "frontendHost");
  const route = world.project(moduleProjectors.routes).find(row => row.id === "landing_route");
  assert.ok(route);
  assert.equal(route.serves, "landing_program");
  assert.equal(route.params?.rootWidget, "page_root");
  assert.equal(world.project(moduleProjectors.servedRoutes).some(row => row.id === "landing_route" && row.serverRunner === "demo_server"), true);
  assert.equal(world.project(moduleProjectors.contextScopes).some(row => row.context === "ctx.target" && row.name === "landingPage" && row.target === "page_root" && row.sourceKind === "import"), true);
  assert.equal(world.project(moduleProjectors.contextScopes).some(row => row.context === "ctx.target" && row.name === "homePage"), false);
});

test("context composition DSL rejects duplicate visible names in one context", () => {
  const world = createWorld();
  assert.throws(() => {
    applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[widget]]
actor = "system"
id = "page_root"
kind = "Page"
context = "ctx.source"

[[widget]]
actor = "system"
id = "local_note"
kind = "Text"
context = "ctx.target"
text = "Note"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "homePage"
target = "page_root"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "homePage"
target = "page_root"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "homePage"
name = "landingPage"

[[contextBinding]]
actor = "system"
context = "ctx.target"
name = "landingPage"
target = "local_note"
`);
  }, /name already visible in context/);
});

test("context composition DSL rejects missing exported names on import", () => {
  const world = createWorld();
  assert.throws(() => {
    applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "missingPage"
name = "landingPage"
`);
  }, /exported name not found/);
});

test("context composition DSL does not inherit parent visibility without explicit import", () => {
  const world = createWorld();
  assert.throws(() => {
    applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"
parent = "ctx.source"

[[widget]]
actor = "system"
id = "page_root"
kind = "Page"
context = "ctx.source"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "homePage"
target = "page_root"

[[frontendProgram]]
actor = "system"
id = "landing_program"
context = "ctx.target"
rootWidgetRef = "homePage"
`);
  }, /root widget ref name not visible in context: homePage/);
});

test("context composition DSL rejects exporting imported names without a local binding", () => {
  const world = createWorld();
  assert.throws(() => {
    applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[widget]]
actor = "system"
id = "page_root"
kind = "Page"
context = "ctx.source"

[[contextBinding]]
actor = "system"
context = "ctx.source"
name = "homePage"
target = "page_root"

[[contextExport]]
actor = "system"
context = "ctx.source"
name = "homePage"
target = "page_root"

[[contextImport]]
actor = "system"
context = "ctx.target"
sourceContext = "ctx.source"
exportName = "homePage"
name = "landingPage"

[[contextExport]]
actor = "system"
context = "ctx.target"
name = "landingPage"
target = "page_root"
`);
  }, /target is not locally bound in context/);
});

test("context composition DSL keeps canonical ids valid for local targets, allows unscoped legacy objects to be locally bound, and rejects hidden foreign scoped canonical refs", () => {
  const blockedWorld = createWorld();
  assert.throws(() => {
    applyWitnessToml(blockedWorld, `
[[context]]
actor = "system"
id = "ctx.source"

[[context]]
actor = "system"
id = "ctx.target"

[[widget]]
actor = "system"
id = "page_root"
kind = "Page"
context = "ctx.source"

[[widget]]
actor = "system"
id = "legacy_shell"
kind = "Box"

[[contextBinding]]
actor = "system"
context = "ctx.target"
name = "legacyShell"
target = "legacy_shell"

[[widget]]
actor = "system"
id = "legacy_child"
kind = "Text"
context = "ctx.target"
parentRef = "legacyShell"
text = "Child"

[[frontendProgram]]
actor = "system"
id = "canonical_program"
context = "ctx.target"
rootWidget = "page_root"
`);
  }, /root widget id targets page_root in context ctx.source and is not visible in authoring context ctx.target/);

  const world = createWorld();
  applyWitnessToml(world, `
[[context]]
actor = "system"
id = "ctx.target"

[[widget]]
actor = "system"
id = "local_page"
kind = "Page"
context = "ctx.target"

[[widget]]
actor = "system"
id = "legacy_shell"
kind = "Box"

[[contextBinding]]
actor = "system"
context = "ctx.target"
name = "legacyShell"
target = "legacy_shell"

[[widget]]
actor = "system"
id = "legacy_child"
kind = "Text"
context = "ctx.target"
parentRef = "legacyShell"
text = "Child"

[[frontendProgram]]
actor = "system"
id = "canonical_program"
context = "ctx.target"
rootWidget = "local_page"
`);

  const child = world.project(w => widgetTree(w, "legacy_shell")).children.find(row => row.id === "legacy_child");
  assert.ok(child);
  assert.equal(child.props.text, "Child");
  const program = frontendProgramsProjection(world.allWitnesses()).find(row => row.id === "canonical_program");
  assert.ok(program);
  assert.equal(program.rootWidget, "local_page");
  assert.equal(world.project(moduleProjectors.contextScopes).some(row => row.context === "ctx.target" && row.name === "legacyShell" && row.target === "legacy_shell" && row.sourceKind === "local"), true);
});

