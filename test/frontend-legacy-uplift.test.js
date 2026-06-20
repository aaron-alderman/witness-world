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
  assert.equal(preview.retirementStatus, "legacy-present");
  assert.equal(preview.retiredRoutes.some(row => row.routeId === "login_route" && row.retirementKind === "page.home"), true);
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
  assert.equal(result.previewAfter.retirementStatus, "first-class-only");
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
  assert.equal(preview.retirementStatus, "legacy-present");
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

test("legacy frontend native uplift lowers interactive same-origin fetches onto native route commands and collection outputs", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "interactive_todos_route"
path = "/interactive-todos"
serves = "interactive_todos_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "interactive_todos_page", frontendProgram = "interactive_todos_program" }

[[widget]]
actor = "system"
id = "interactive_todos_page"
kind = "Page"
props = { title = "Interactive Todos" }

[[widget]]
actor = "system"
id = "status_filter"
kind = "Select"
props = { name = "status" }

[[widget]]
actor = "system"
id = "results_list"
kind = "Text"
props = { text = "" }

[[widget]]
actor = "system"
id = "todo_row"
kind = "Text"
props = { text = "\${item.title}" }

[[attachWidget]]
actor = "system"
parent = "interactive_todos_page"
child = "status_filter"
order = 0

[[attachWidget]]
actor = "system"
parent = "interactive_todos_page"
child = "results_list"
order = 1

[[frontendProgram]]
actor = "system"
id = "interactive_todos_program"
rootWidget = "interactive_todos_page"

[[frontendStep]]
actor = "system"
program = "interactive_todos_program"
event = "change:status_filter"
order = 0
op = "fetchJson"
params = { url = "/api/todos", into = "payload" }

[[frontendStep]]
actor = "system"
program = "interactive_todos_program"
event = "change:status_filter"
order = 1
op = "renderCollection"
params = { widget = "results_list", from = "payload.items", template = "todo_row" }
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.blocked.length, 0);

  const result = applyLegacyFrontendUplift(world, {
    actor: "callan"
  });
  assert.equal(result.ok, true);

  const route = world.project(moduleProjectors.routes).find(row => row.id === "interactive_todos_route");
  assert.equal(route?.handler, "page.surface");
  assert.equal(Array.isArray(route?.params?.preloadPolicies), false);

  const boundary = world.allWitnesses().find(witness =>
    witness.process === "desire.defineBoundary"
    && witness.body?.id === "legacyUplift.interactive_todos_route.boundary.change:status_filter.fetchJson.0"
  );
  assert.deepEqual(boundary?.body?.operations?.[0], {
    name: "change:status_filter.fetchJson.0",
    kind: "adapter",
    command: "legacyUplift.interactive_todos_route.message.command.change:status_filter.fetchJson.0",
    route: "/api/todos",
    method: "GET",
    loadingState: "legacyUplift.interactive_todos_route.type.state.change:status_filter.fetchJson.0.loading",
    successEvent: "legacyUplift.interactive_todos_route.message.success.change:status_filter.fetchJson.0",
    failureEvent: "legacyUplift.interactive_todos_route.message.failure.change:status_filter.fetchJson.0",
    refreshRuntime: true,
    collectionOutputs: {
      "legacyUplift.interactive_todos_route.collection.payload": "items"
    }
  });
});

test("legacy frontend native uplift lowers interactive initSession onto a native route command", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "session_refresh_route"
path = "/session-refresh"
serves = "session_refresh_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "session_refresh_page", frontendProgram = "session_refresh_program" }

[[widget]]
actor = "system"
id = "session_refresh_page"
kind = "Page"
props = { title = "Session Refresh" }

[[widget]]
actor = "system"
id = "session_refresh_button"
kind = "Button"
props = { text = "Refresh Session", type = "button" }

[[attachWidget]]
actor = "system"
parent = "session_refresh_page"
child = "session_refresh_button"
order = 0

[[frontendProgram]]
actor = "system"
id = "session_refresh_program"
rootWidget = "session_refresh_page"

[[frontendStep]]
actor = "system"
program = "session_refresh_program"
event = "click:session_refresh_button"
order = 0
op = "initSession"
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.blocked.length, 0);

  const result = applyLegacyFrontendUplift(world, {
    actor: "callan"
  });
  assert.equal(result.ok, true);

  const route = world.project(moduleProjectors.routes).find(row => row.id === "session_refresh_route");
  assert.equal(route?.handler, "page.surface");
  assert.equal(Array.isArray(route?.params?.preloadPolicies), false);

  const boundary = world.allWitnesses().find(witness =>
    witness.process === "desire.defineBoundary"
    && witness.body?.id === "legacyUplift.session_refresh_route.boundary.click:session_refresh_button.initSession.0"
  );
  assert.deepEqual(boundary?.body?.operations?.[0], {
    name: "click:session_refresh_button.initSession.0",
    kind: "adapter",
    command: "legacyUplift.session_refresh_route.message.command.click:session_refresh_button.initSession.0",
    route: "/api/session",
    method: "GET",
    loadingState: "legacyUplift.session_refresh_route.type.state.click:session_refresh_button.initSession.0.loading",
    successEvent: "legacyUplift.session_refresh_route.message.success.click:session_refresh_button.initSession.0",
    failureEvent: "legacyUplift.session_refresh_route.message.failure.click:session_refresh_button.initSession.0",
    refreshRuntime: true
  });
  const successMessage = world.allWitnesses().find(witness =>
    witness.process === "desire.defineMessage"
    && witness.body?.id === "legacyUplift.session_refresh_route.message.success.click:session_refresh_button.initSession.0"
  );
  assert.deepEqual(successMessage?.body?.fields, [{
    name: "value",
    type: "legacyUplift.session_refresh_route.type.state.session"
  }]);
});

test("legacy frontend native uplift lowers input-driven fetchJson reads onto native timed interactions", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "live_search_route"
path = "/live-search"
serves = "live_search_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "live_search_page", frontendProgram = "live_search_program" }

[[widget]]
actor = "system"
id = "live_search_page"
kind = "Page"
props = { title = "Live Search" }

[[widget]]
actor = "system"
id = "live_search_input"
kind = "Input"
props = { name = "q", value = "" }

[[attachWidget]]
actor = "system"
parent = "live_search_page"
child = "live_search_input"
order = 0

[[frontendProgram]]
actor = "system"
id = "live_search_program"
rootWidget = "live_search_page"

[[frontendStep]]
actor = "system"
program = "live_search_program"
event = "input:live_search_input"
order = 0
op = "fetchJson"
params = { url = "/api/search", into = "results" }
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.blocked.length, 0);
  assert.equal(preview.pending.some(row => row.action === "route.rewrite" && row.routeId === "live_search_route"), true);

  const result = applyLegacyFrontendUplift(world, {
    actor: "callan"
  });
  assert.equal(result.ok, true);

  const route = world.project(moduleProjectors.routes).find(row => row.id === "live_search_route");
  assert.equal(route?.handler, "page.surface");
  assert.equal(route?.params?.rootSurface, "legacyUplift.live_search_route.surface.root");

  const inputSurface = world.allWitnesses().find(witness =>
    witness.process === "desire.defineSurface"
    && witness.body?.id === "legacyUplift.live_search_route.surface.widget.live_search_input"
  );
  assert.deepEqual(inputSurface?.body?.interactions, [{
    target: "self",
    event: "input",
    action: {
      kind: "deliver",
      message: "legacyUplift.live_search_route.message.trigger.input:live_search_input"
    },
    timing: {
      mode: "debounce",
      ms: 300
    }
  }]);
});

test("legacy frontend native uplift lowers input-driven initSession reads onto native timed interactions", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "session_probe_route"
path = "/session-probe"
serves = "session_probe_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "session_probe_page", frontendProgram = "session_probe_program" }

[[widget]]
actor = "system"
id = "session_probe_page"
kind = "Page"
props = { title = "Session Probe" }

[[widget]]
actor = "system"
id = "session_probe_input"
kind = "Input"
props = { name = "probe", value = "" }

[[attachWidget]]
actor = "system"
parent = "session_probe_page"
child = "session_probe_input"
order = 0

[[frontendProgram]]
actor = "system"
id = "session_probe_program"
rootWidget = "session_probe_page"

[[frontendStep]]
actor = "system"
program = "session_probe_program"
event = "input:session_probe_input"
order = 0
op = "initSession"
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.blocked.length, 0);

  const result = applyLegacyFrontendUplift(world, {
    actor: "callan"
  });
  assert.equal(result.ok, true);
  assert.equal(result.previewAfter.blocked.length, 0);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "desire.defineBoundary"
    && witness.body?.id === "legacyUplift.session_probe_route.boundary.input:session_probe_input.initSession.0"
  ), true);
});

test("legacy frontend native uplift keeps input-driven writes honestly blocked", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "live_search_route"
path = "/live-search"
serves = "live_search_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "live_search_page", frontendProgram = "live_search_program" }

[[widget]]
actor = "system"
id = "live_search_page"
kind = "Page"
props = { title = "Live Search" }

[[widget]]
actor = "system"
id = "live_search_input"
kind = "Input"
props = { name = "q", value = "" }

[[attachWidget]]
actor = "system"
parent = "live_search_page"
child = "live_search_input"
order = 0

[[frontendProgram]]
actor = "system"
id = "live_search_program"
rootWidget = "live_search_page"

[[frontendStep]]
actor = "system"
program = "live_search_program"
event = "input:live_search_input"
order = 0
op = "postJson"
params = { url = "/api/search" }
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.pending.length, 0);
  assert.equal(preview.blocked.some(row =>
    row.id === "legacyFrontendUplift:blocked:live_search_route:inputNetwork:0"
    && row.missingPrimitive === "input-driven write or unsupported network effects remain outside the native timing subset"
  ), true);
});
