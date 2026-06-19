import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { applyWitnessToml } from "../src/dsl.js";
import { moduleProjectors } from "../src/modules.js";
import {
  applyLegacyFrontendUplift,
  frontendLegacyUpliftAuthorityTargets,
  previewLegacyFrontendUplift
} from "../src/frontend-legacy-uplift.js";

test("legacy frontend native uplift previews and applies a supported legacy login route", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "login_route"
path = "/login"
serves = "login_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "login_page", frontendProgram = "login_program", routeState = { process = "ShellNav", state = "ActiveRoute" }, responseStatus = 200 }
context = "ctx.shared"

[[widget]]
actor = "system"
id = "login_page"
kind = "Page"
props = { title = "Login" }

[[widget]]
actor = "system"
id = "login_form"
kind = "Form"
props = { }

[[widget]]
actor = "system"
id = "username_field"
kind = "Input"
props = { name = "username", placeholder = "Username" }

[[widget]]
actor = "system"
id = "password_field"
kind = "Input"
props = { name = "password", type = "password", placeholder = "Password" }

[[widget]]
actor = "system"
id = "submit_button"
kind = "Button"
props = { text = "Sign in", type = "submit" }

[[attachWidget]]
actor = "system"
parent = "login_page"
child = "login_form"
order = 0

[[attachWidget]]
actor = "system"
parent = "login_form"
child = "username_field"
order = 0

[[attachWidget]]
actor = "system"
parent = "login_form"
child = "password_field"
order = 1

[[attachWidget]]
actor = "system"
parent = "login_form"
child = "submit_button"
order = 2

[[frontendProgram]]
actor = "system"
id = "login_program"
rootWidget = "login_page"

[[frontendStep]]
actor = "system"
program = "login_program"
event = "submit:login_form"
order = 0
op = "readForm"
params = { widget = "login_form", into = "credentials" }

[[frontendStep]]
actor = "system"
program = "login_program"
event = "submit:login_form"
order = 1
op = "setSession"
params = { from = "credentials" }

[[frontendStep]]
actor = "system"
program = "login_program"
event = "submit:login_form"
order = 2
op = "clearForm"
params = { widget = "login_form" }
`);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.compatibilityMode, "bridge-active");
  assert.deepEqual(preview.blocked, []);
  assert.equal(preview.pending.some(row => row.action === "route.rewrite" && row.routeId === "login_route"), true);
  assert.equal(preview.pending.some(row => row.action === "boundary.define"), true);
  assert.equal(preview.pending.some(row => row.action === "policy.define"), true);

  const authority = frontendLegacyUpliftAuthorityTargets(world);
  assert.deepEqual(authority.targets, [{ targetKind: "route", target: "login_route" }]);

  const result = applyLegacyFrontendUplift(world, {
    actor: "callan"
  });
  assert.equal(result.ok, true);
  assert.equal(result.witness.process, "frontend.upliftLegacy");
  assert.equal(result.previewAfter.compatibilityMode, "first-class-only");
  assert.deepEqual(result.previewAfter.pending, []);
  assert.deepEqual(result.previewAfter.blocked, []);

  const route = world.project(moduleProjectors.routes).find(row => row.id === "login_route");
  assert.equal(route?.handler, "page.surface");
  assert.equal(route?.params?.rootSurface, "legacyUplift.login_route.surface.root");
  assert.deepEqual(route?.params?.routeState, { process: "ShellNav", state: "ActiveRoute" });
  assert.equal(route?.params?.responseStatus, 200);
  assert.equal(Object.prototype.hasOwnProperty.call(route?.params || {}, "rootWidget"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(route?.params || {}, "frontendProgram"), false);

  assert.equal(world.allWitnesses().some(witness => witness.process === "desire.defineProcess" && witness.body?.id === "legacyUplift.login_route.process"), true);
  assert.equal(world.allWitnesses().some(witness => witness.process === "desire.defineBoundary" && String(witness.body?.id || "").includes("legacyUplift.login_route.boundary")), true);
  assert.equal(world.allWitnesses().some(witness => witness.process === "desire.definePolicy" && String(witness.body?.id || "").includes("legacyUplift.login_route.policy")), true);
  assert.equal(world.allWitnesses().some(witness => witness.process === "desire.defineSurface" && witness.body?.id === "legacyUplift.login_route.surface.root"), true);

  const second = applyLegacyFrontendUplift(world, {
    actor: "callan"
  });
  assert.equal(second.ok, true);
  assert.deepEqual(second.actions, []);
});

test("legacy frontend native uplift lowers repeated collections onto native collection + repeat authoring", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "todos_route"
path = "/todos"
serves = "todos_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "todos_page", frontendProgram = "todos_program" }

[[widget]]
actor = "system"
id = "todos_page"
kind = "Page"
props = { title = "Todos" }

[[widget]]
actor = "system"
id = "todo_list"
kind = "Text"
props = { text = "Waiting" }

[[attachWidget]]
actor = "system"
parent = "todos_page"
child = "todo_list"
order = 0

[[frontendProgram]]
actor = "system"
id = "todos_program"
rootWidget = "todos_page"

[[frontendStep]]
actor = "system"
program = "todos_program"
event = "load"
order = 0
op = "renderCollection"
params = { widget = "todo_list", from = "payload.items", template = "todo_row" }
`);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.compatibilityMode, "bridge-active");
  assert.equal(preview.pending.some(row => row.kind === "collection" && row.action === "collection.define"), true);
  assert.equal(preview.pending.some(row => row.kind === "surface" && row.action === "surface.define"), true);
  assert.deepEqual(preview.blocked, []);

  const result = applyLegacyFrontendUplift(world, {
    actor: "callan"
  });
  assert.equal(result.ok, true);
  const route = world.project(moduleProjectors.routes).find(row => row.id === "todos_route");
  assert.equal(route?.handler, "page.surface");
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "desire.defineCollection"
    && String(witness.body?.id || "").includes("legacyUplift.todos_route.collection")
  ), true);
  const repeatedSurface = world.allWitnesses().find(witness =>
    witness.process === "desire.defineSurface"
    && witness.body?.id === "legacyUplift.todos_route.surface.widget.todo_list"
  );
  assert.deepEqual(repeatedSurface?.body?.repeat, {
    collection: "legacyUplift.todos_route.collection.payload",
    template: "legacyUplift.todos_route.surface.widget.todo_row",
    itemAs: "item",
    indexAs: "index"
  });
});

test("legacy frontend native uplift lowers load fetches, initSession, and query mutation onto native route state", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "search_route"
path = "/search"
serves = "search_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "search_page", frontendProgram = "search_program" }

[[widget]]
actor = "system"
id = "search_page"
kind = "Page"
props = { title = "Search" }

[[widget]]
actor = "system"
id = "search_input"
kind = "Input"
props = { name = "q", value = "" }

[[widget]]
actor = "system"
id = "results_list"
kind = "Text"
props = { text = "" }

[[widget]]
actor = "system"
id = "result_row"
kind = "Text"
props = { text = "\${item.title}" }

[[attachWidget]]
actor = "system"
parent = "search_page"
child = "search_input"
order = 0

[[attachWidget]]
actor = "system"
parent = "search_page"
child = "results_list"
order = 1

[[frontendProgram]]
actor = "system"
id = "search_program"
rootWidget = "search_page"

[[frontendStep]]
actor = "system"
program = "search_program"
event = "load"
order = 0
op = "initSession"

[[frontendStep]]
actor = "system"
program = "search_program"
event = "load"
order = 1
op = "fetchJson"
params = { url = "/api/search", into = "payload" }

[[frontendStep]]
actor = "system"
program = "search_program"
event = "load"
order = 2
op = "renderCollection"
params = { widget = "results_list", from = "payload.items", template = "result_row" }

[[frontendStep]]
actor = "system"
program = "search_program"
event = "input:search_input"
order = 0
op = "setQueryParam"
params = { name = "q", value = "\${event.value}" }
`);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.blocked.length, 0);
  assert.equal(preview.pending.some(row => row.kind === "collection"), true);
  assert.equal(preview.pending.some(row => row.kind === "route" && row.action === "route.rewrite"), true);

  const result = applyLegacyFrontendUplift(world, {
    actor: "callan"
  });
  assert.equal(result.ok, true);

  const route = world.project(moduleProjectors.routes).find(row => row.id === "search_route");
  assert.equal(route?.handler, "page.surface");
  assert.equal(Array.isArray(route?.params?.preloadPolicies), true);
  assert.equal(route?.params?.preloadPolicies.length, 2);
  assert.deepEqual(route?.params?.queryBindings, [{
    param: "q",
    process: "legacyUplift.search_route.process",
    state: "legacyUplift.search_route.type.state.query.q"
  }]);
});
