import assert from "node:assert/strict";
import test from "node:test";
import { createWorld, createThing, projectors } from "../src/kernel.js";
import {
  createCompiler,
  createDescription,
  compileDescription,
  createServerRunner,
  createIdentity,
  defineContext,
  defineRoute,
  installRuntimePlugin,
  removeRuntimePlugin,
  serveRoute,
  createFrontendRunner,
  createViewDescription,
  renderView,
  emitUserAction,
  bindContextName,
  exportContextName,
  importContextName,
  explainContextualName,
  explainContextualTargetVisibility,
  classifyCanonicalIdPolicy,
  CONTEXTUAL_CANONICAL_ID_POLICY_CLASSES,
  resolveCoveredContextualRef,
  resolveContextualRef,
  resolveContextualName,
  moduleProjectors
} from "../src/modules.js";

test("compiler ladder: compiler compiles compiler description into next compiler artifact", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createCompiler(world, { actor: "aaron", id: "compiler_0" });
  createDescription(world, { actor: "aaron", id: "compiler_1_description", source: "compiler subset v1" });
  compileDescription(world, { actor: "aaron", compiler: "compiler_0", description: "compiler_1_description", output: "compiler_1_artifact" });

  const artifacts = world.project(moduleProjectors.compiledArtifacts);
  assert.deepEqual(artifacts, [{ artifact: "compiler_1_artifact", source: "compiler_1_description", compiler: "compiler_0" }]);
  assert.equal(world.project(projectors.owners).get("compiler_1_artifact"), "aaron");
});

test("compile fails if the compiler is not actually a compiler", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "not_a_compiler" });
  createDescription(world, { actor: "aaron", id: "program_description", source: "do thing" });
  const w = compileDescription(world, { actor: "aaron", compiler: "not_a_compiler", description: "program_description", output: "program_artifact" });

  assert.equal(w.process, "compileDescription.failed");
  assert.equal(world.project(moduleProjectors.compiledArtifacts).length, 0);
});

test("server runner serves a route that points at a frontend artifact", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createServerRunner(world, {
    actor: "aaron",
    id: "server_runner",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    handlerSet: "demo",
    actors: [{ id: "aaron", label: "Aaron" }],
    storage: { todoProjection: "todos.json" }
  });
  createThing(world, { actor: "aaron", id: "frontend_bundle" });
  defineRoute(world, { actor: "aaron", id: "root_route", path: "/", serves: "frontend_bundle" });
  const w = serveRoute(world, { actor: "aaron", serverRunner: "server_runner", route: "root_route" });

  assert.equal(w.process, "serveRoute");
  assert.equal(world.project(projectors.currentRelations).some(r => r.from === "server_runner" && r.rel === "serves" && r.to === "root_route"), true);
  assert.deepEqual(world.project(moduleProjectors.serverRunners), [{
    id: "server_runner",
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    handlerSet: "demo",
    actors: [{ id: "aaron", label: "Aaron" }],
    storage: { todoProjection: "todos.json" },
    runtimeConfig: null,
    allowActorHeader: false,
    hosts: null,
    default: false,
    requireAuth: false,
    context: null,
    values: null
  }]);
  assert.deepEqual(world.project(moduleProjectors.servedRoutes), [{
    id: "root_route",
    path: "/",
    serves: "frontend_bundle",
    method: "GET",
    handler: null,
    params: null,
    context: null,
    serverRunner: "server_runner"
  }]);
});

test("runtime plugin installs project as serverRunner-scoped authored relations", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createServerRunner(world, {
    actor: "aaron",
    id: "server_runner",
    backendHost: "backendHost",
    frontendHost: "frontendHost"
  });

  installRuntimePlugin(world, {
    actor: "aaron",
    serverRunner: "server_runner",
    plugin: "plugin.inspect"
  });
  assert.deepEqual(world.project(moduleProjectors.runtimePluginInstalls), [{
    serverRunner: "server_runner",
    plugin: "plugin.inspect",
    witness: world.project(moduleProjectors.runtimePluginInstalls)[0].witness
  }]);

  removeRuntimePlugin(world, {
    actor: "aaron",
    serverRunner: "server_runner",
    plugin: "plugin.inspect"
  });
  assert.deepEqual(world.project(moduleProjectors.runtimePluginInstalls), []);
});

test("frontend runner renders a view and emits user action witnesses", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "callan" });
  createFrontendRunner(world, { actor: "aaron", id: "frontend_runner" });
  createViewDescription(world, { actor: "aaron", id: "aaron_canvas_view", target: "callan" });
  renderView(world, { actor: "aaron", frontendRunner: "frontend_runner", viewDescription: "aaron_canvas_view", frame: "frame_1" });
  emitUserAction(world, { actor: "aaron", frontendRunner: "frontend_runner", action: "drag_callan_proxy", target: "callan", body: { x: 120, y: 300 } });

  assert.deepEqual(world.project(moduleProjectors.renderedFrames), [{ frame: "frame_1", view: "aaron_canvas_view", runner: "frontend_runner" }]);
  assert.equal(world.allWitnesses().some(w => w.process === "emitUserAction" && w.body.x === 120), true);
});

test("identity projector indexes authored identities by id, username, and actor", () => {
  const world = createWorld();
  createThing(world, { actor: "adam", id: "aaron" });
  createIdentity(world, {
    actor: "system",
    id: "identity.aaron",
    identityActor: "aaron",
    label: "Aaron",
    username: "aaron",
    password: "aaron",
    homePerspective: "aaron:personal"
  });

  assert.deepEqual(world.project(moduleProjectors.identities), [{
    id: "identity.aaron",
    actor: "aaron",
    label: "Aaron",
    username: "aaron",
    password: "aaron",
    displayName: null,
    jobTitle: null,
    initials: null,
    homeContext: null,
    homePerspective: "aaron:personal"
  }]);
  const index = world.project(moduleProjectors.identityIndex);
  assert.equal(index.byId["identity.aaron"].username, "aaron");
  assert.equal(index.byUsername.aaron.id, "identity.aaron");
  assert.equal(index.byActor.aaron[0].homePerspective, "aaron:personal");
});

test("context composition projectors expose local bindings, exports, imports, and visible scope", () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "system" });
  defineContext(world, { actor: "system", id: "ctx.source", label: "Source" });
  defineContext(world, { actor: "system", id: "ctx.target", label: "Target", parent: "ctx.source" });
  createThing(world, { actor: "system", id: "page.root" });

  bindContextName(world, { actor: "system", context: "ctx.source", name: "homePage", target: "page.root" });
  exportContextName(world, { actor: "system", context: "ctx.source", name: "homePage", target: "page.root" });
  importContextName(world, { actor: "system", context: "ctx.target", sourceContext: "ctx.source", exportName: "homePage", name: "landingPage" });

  assert.deepEqual(world.project(moduleProjectors.contextBindings), [
    { context: "ctx.source", name: "homePage", target: "page.root", witness: world.project(moduleProjectors.contextBindings)[0].witness }
  ]);
  assert.deepEqual(world.project(moduleProjectors.contextExports), [
    { context: "ctx.source", name: "homePage", target: "page.root", witness: world.project(moduleProjectors.contextExports)[0].witness }
  ]);
  assert.deepEqual(world.project(moduleProjectors.contextImports), [
    {
      context: "ctx.target",
      sourceContext: "ctx.source",
      exportName: "homePage",
      name: "landingPage",
      witness: world.project(moduleProjectors.contextImports)[0].witness
    }
  ]);

  const scopes = world.project(moduleProjectors.contextScopes);
  assert.equal(scopes.some(row => row.context === "ctx.source" && row.name === "homePage" && row.target === "page.root" && row.sourceKind === "local"), true);
  assert.equal(scopes.some(row => row.context === "ctx.target" && row.name === "landingPage" && row.target === "page.root" && row.sourceKind === "import" && row.sourceContext === "ctx.source" && row.exportName === "homePage"), true);
  assert.equal(scopes.some(row => row.context === "ctx.target" && row.name === "homePage"), false);

  const resolved = resolveContextualName(world.allWitnesses(), { context: "ctx.target", name: "landingPage" });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.target, "page.root");
});

test("context explanation helpers expose resolved, ambiguous, and hidden contextual cases", () => {
  const world = createWorld();
  createThing(world, { actor: "system", id: "system" });
  defineContext(world, { actor: "system", id: "ctx.source", label: "Source" });
  defineContext(world, { actor: "system", id: "ctx.target", label: "Target" });
  createThing(world, { actor: "system", id: "page.root" });
  createThing(world, { actor: "system", id: "page.alt" });
  createThing(world, { actor: "system", id: "page.hidden" });
  createThing(world, { actor: "system", id: "legacy.shell" });
  world.emit({
    process: "scope.page.alt",
    actor: "system",
    claims: [{ op: "relation", from: "page.alt", rel: "inContext", to: "ctx.source" }],
    body: {}
  });
  world.emit({
    process: "scope.page.hidden",
    actor: "system",
    claims: [{ op: "relation", from: "page.hidden", rel: "inContext", to: "ctx.source" }],
    body: {}
  });
  bindContextName(world, { actor: "system", context: "ctx.source", name: "homePage", target: "page.root" });
  exportContextName(world, { actor: "system", context: "ctx.source", name: "homePage", target: "page.root" });
  importContextName(world, { actor: "system", context: "ctx.target", sourceContext: "ctx.source", exportName: "homePage", name: "landingPage" });

  const imported = explainContextualName(world.allWitnesses(), { context: "ctx.target", name: "landingPage" });
  assert.equal(imported.ok, true);
  assert.equal(imported.resolution, "import");
  assert.equal(imported.target, "page.root");

  bindContextName(world, { actor: "system", context: "ctx.target", name: "landingPage", target: "page.alt" });
  const ambiguity = explainContextualName(world.allWitnesses(), { context: "ctx.target", name: "landingPage" });
  assert.equal(ambiguity.ok, false);
  assert.equal(ambiguity.resolution, "ambiguous");
  assert.deepEqual(ambiguity.targets, ["page.alt", "page.root"]);

  const resolutions = world.project(moduleProjectors.contextNameResolutions);
  assert.equal(resolutions.some(row =>
    row.context === "ctx.target"
    && row.name === "landingPage"
    && row.resolution === "ambiguous"
    && row.targets.includes("page.root")
    && row.targets.includes("page.alt")
  ), true);
  const conflicts = world.project(moduleProjectors.contextNameConflicts);
  assert.equal(conflicts.some(row =>
    row.context === "ctx.target"
    && row.name === "landingPage"
    && row.targets.includes("page.root")
    && row.targets.includes("page.alt")
  ), true);
  assert.equal(world.project(moduleProjectors.contextualTargets).some(row => row.id === "page.hidden" && row.context === "ctx.source"), true);

  const hidden = explainContextualTargetVisibility(world.allWitnesses(), { context: "ctx.target", target: "page.hidden" });
  assert.equal(hidden.ok, false);
  assert.equal(hidden.visibility, "hidden");
  assert.equal(hidden.targetContext, "ctx.source");

  const importedVisibility = explainContextualTargetVisibility(world.allWitnesses(), { context: "ctx.target", target: "page.root" });
  assert.equal(importedVisibility.ok, true);
  assert.equal(importedVisibility.visibility, "import");
  assert.deepEqual(importedVisibility.names, ["landingPage"]);

  const unscoped = explainContextualTargetVisibility(world.allWitnesses(), { context: "ctx.target", target: "legacy.shell" });
  assert.equal(unscoped.ok, true);
  assert.equal(unscoped.visibility, "unscoped");
});

test("contextual ref resolution classifies canonical-id compatibility and enforces explicit allowed classes", () => {
  const world = createWorld();
  defineContext(world, { actor: "system", id: "ctx.source", label: "Source" });
  defineContext(world, { actor: "system", id: "ctx.target", label: "Target" });
  createThing(world, { actor: "system", id: "page.local" });
  createThing(world, { actor: "system", id: "page.imported" });
  createThing(world, { actor: "system", id: "legacy.shell" });
  world.emit({
    process: "scope.page.local",
    actor: "system",
    claims: [{ op: "relation", from: "page.local", rel: "inContext", to: "ctx.target" }],
    body: {}
  });
  world.emit({
    process: "scope.page.imported",
    actor: "system",
    claims: [{ op: "relation", from: "page.imported", rel: "inContext", to: "ctx.source" }],
    body: {}
  });
  bindContextName(world, { actor: "system", context: "ctx.source", name: "sourcePage", target: "page.imported" });
  exportContextName(world, { actor: "system", context: "ctx.source", name: "sourcePage", target: "page.imported" });
  importContextName(world, { actor: "system", context: "ctx.target", sourceContext: "ctx.source", exportName: "sourcePage", name: "importedPage" });

  assert.deepEqual(CONTEXTUAL_CANONICAL_ID_POLICY_CLASSES, [
    "same-context-convenience",
    "imported-target-reference",
    "legacy-only-path"
  ]);

  const sameContext = classifyCanonicalIdPolicy(world.allWitnesses(), {
    context: "ctx.target",
    target: "page.local"
  });
  assert.equal(sameContext.ok, true);
  assert.equal(sameContext.policyClass, "same-context-convenience");

  const imported = classifyCanonicalIdPolicy(world.allWitnesses(), {
    context: "ctx.target",
    target: "page.imported"
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.policyClass, "imported-target-reference");

  const legacy = classifyCanonicalIdPolicy(world.allWitnesses(), {
    context: "ctx.target",
    target: "legacy.shell"
  });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.policyClass, "legacy-only-path");

  const localResolved = resolveContextualRef(world.allWitnesses(), {
    context: "ctx.target",
    id: "page.local",
    label: "root widget",
    allowedCanonicalIdPolicyClasses: ["same-context-convenience"]
  });
  assert.equal(localResolved.ok, true);
  assert.equal(localResolved.canonicalIdPolicyClass, "same-context-convenience");

  const importedResolved = resolveContextualRef(world.allWitnesses(), {
    context: "ctx.target",
    id: "page.imported",
    label: "root widget",
    allowedCanonicalIdPolicyClasses: ["imported-target-reference"]
  });
  assert.equal(importedResolved.ok, true);
  assert.equal(importedResolved.canonicalIdPolicyClass, "imported-target-reference");

  const blockedImported = resolveContextualRef(world.allWitnesses(), {
    context: "ctx.target",
    id: "page.imported",
    label: "root widget",
    allowedCanonicalIdPolicyClasses: ["same-context-convenience"]
  });
  assert.equal(blockedImported.ok, false);
  assert.match(blockedImported.error, /imported-target-reference/);

  const blockedLegacy = resolveContextualRef(world.allWitnesses(), {
    context: "ctx.target",
    id: "legacy.shell",
    label: "parent widget",
    allowedCanonicalIdPolicyClasses: ["same-context-convenience", "imported-target-reference"]
  });
  assert.equal(blockedLegacy.ok, false);
  assert.match(blockedLegacy.error, /legacy-only-path/);

  createThing(world, { actor: "system", id: "page.hidden" });
  world.emit({
    process: "scope.page.hidden",
    actor: "system",
    claims: [{ op: "relation", from: "page.hidden", rel: "inContext", to: "ctx.hidden" }],
    body: {}
  });

  const coveredImported = resolveCoveredContextualRef(world.allWitnesses(), {
    context: "ctx.target",
    id: "page.imported",
    label: "proposal target"
  });
  assert.equal(coveredImported.ok, true);
  assert.equal(coveredImported.canonicalIdPolicyClass, "imported-target-reference");

  const coveredLegacy = resolveCoveredContextualRef(world.allWitnesses(), {
    context: "ctx.target",
    id: "legacy.shell",
    label: "proposal target"
  });
  assert.equal(coveredLegacy.ok, false);
  assert.match(coveredLegacy.error, /legacy-only-path/);

  const blockedHidden = resolveCoveredContextualRef(world.allWitnesses(), {
    context: "ctx.target",
    id: "page.hidden",
    label: "proposal target"
  });
  assert.equal(blockedHidden.ok, false);
  assert.match(blockedHidden.error, /not visible in authoring context ctx.target/);
});
