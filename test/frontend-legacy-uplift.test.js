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

const SESSION_SUMMARY_FIELDS = [
  "authenticated",
  "identity",
  "actor",
  "authenticatedIdentity",
  "authenticatedActor",
  "effectiveIdentity",
  "effectiveActor",
  "authorityMode",
  "assumptionGrantId",
  "label",
  "authenticatedLabel",
  "effectiveLabel",
  "displayName",
  "jobTitle",
  "initials",
  "roles",
  "homeContext",
  "perspective",
  "authenticatedHomeContext",
  "authenticatedPerspective",
  "effectiveHomeContext",
  "effectivePerspective"
];

function expectedSessionSummaryFields(routeId) {
  return SESSION_SUMMARY_FIELDS.map(field => ({
    name: field,
    type: `legacyUplift.${routeId}.type.state.session.${field}`
  }));
}

function expectedLoggedOutSessionWrites(routeId) {
  return {
    [`legacyUplift.${routeId}.type.state.session.authenticated`]: false,
    [`legacyUplift.${routeId}.type.state.session.identity`]: "",
    [`legacyUplift.${routeId}.type.state.session.actor`]: "",
    [`legacyUplift.${routeId}.type.state.session.authenticatedIdentity`]: "",
    [`legacyUplift.${routeId}.type.state.session.authenticatedActor`]: "",
    [`legacyUplift.${routeId}.type.state.session.effectiveIdentity`]: "",
    [`legacyUplift.${routeId}.type.state.session.effectiveActor`]: "",
    [`legacyUplift.${routeId}.type.state.session.authorityMode`]: "",
    [`legacyUplift.${routeId}.type.state.session.assumptionGrantId`]: "",
    [`legacyUplift.${routeId}.type.state.session.label`]: "",
    [`legacyUplift.${routeId}.type.state.session.authenticatedLabel`]: "",
    [`legacyUplift.${routeId}.type.state.session.effectiveLabel`]: "",
    [`legacyUplift.${routeId}.type.state.session.displayName`]: "",
    [`legacyUplift.${routeId}.type.state.session.jobTitle`]: "",
    [`legacyUplift.${routeId}.type.state.session.initials`]: "",
    [`legacyUplift.${routeId}.type.state.session.roles`]: [],
    [`legacyUplift.${routeId}.type.state.session.homeContext`]: "",
    [`legacyUplift.${routeId}.type.state.session.perspective`]: "",
    [`legacyUplift.${routeId}.type.state.session.authenticatedHomeContext`]: "",
    [`legacyUplift.${routeId}.type.state.session.authenticatedPerspective`]: "",
    [`legacyUplift.${routeId}.type.state.session.effectiveHomeContext`]: "",
    [`legacyUplift.${routeId}.type.state.session.effectivePerspective`]: ""
  };
}

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
  const loginSuccess = world.allWitnesses().find(witness =>
    witness.process === "desire.defineMessage"
    && witness.body?.id === "legacyUplift.login_route.message.success.submit:login_form.setSession.1"
  );
  assert.deepEqual(loginSuccess?.body?.fields, expectedSessionSummaryFields("login_route"));

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
  assert.deepEqual(successMessage?.body?.fields, expectedSessionSummaryFields("session_refresh_route"));
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

test("legacy frontend native uplift lowers input-driven postJson writes onto native timed interactions", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "search_submit_route"
path = "/search-submit"
serves = "search_submit_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "search_submit_page", frontendProgram = "search_submit_program" }

[[widget]]
actor = "system"
id = "search_submit_page"
kind = "Page"
props = { title = "Search Submit" }

[[widget]]
actor = "system"
id = "search_form"
kind = "Form"
props = { }

[[widget]]
actor = "system"
id = "live_search_input"
kind = "Input"
props = { name = "q", value = "" }

[[attachWidget]]
actor = "system"
parent = "search_submit_page"
child = "search_form"
order = 0

[[attachWidget]]
actor = "system"
parent = "search_form"
child = "live_search_input"
order = 0

[[frontendProgram]]
actor = "system"
id = "search_submit_program"
rootWidget = "search_submit_page"

[[frontendStep]]
actor = "system"
program = "search_submit_program"
event = "input:live_search_input"
order = 0
op = "readForm"
params = { widget = "search_form", into = "search" }

[[frontendStep]]
actor = "system"
program = "search_submit_program"
event = "input:live_search_input"
order = 1
op = "postJson"
params = { url = "/api/search", from = "search" }
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.blocked.length, 0);

  const result = applyLegacyFrontendUplift(world, {
    actor: "callan"
  });
  assert.equal(result.ok, true);
  assert.equal(result.previewAfter.blocked.length, 0);

  const inputSurface = world.allWitnesses().find(witness =>
    witness.process === "desire.defineSurface"
    && witness.body?.id === "legacyUplift.search_submit_route.surface.widget.live_search_input"
  );
  assert.equal(inputSurface?.body?.interactions?.some(interaction => JSON.stringify(interaction) === JSON.stringify({
    target: "self",
    event: "input",
    action: {
      kind: "deliver",
      message: "legacyUplift.search_submit_route.message.trigger.input:live_search_input"
    },
    timing: {
      mode: "debounce",
      ms: 300
    }
  })), true);
  const boundary = world.allWitnesses().find(witness =>
    witness.process === "desire.defineBoundary"
    && witness.body?.id === "legacyUplift.search_submit_route.boundary.input:live_search_input.postJson.1"
  );
  assert.deepEqual(boundary?.body?.operations?.[0], {
    name: "input:live_search_input.postJson.1",
    kind: "adapter",
    command: "legacyUplift.search_submit_route.message.command.input:live_search_input.postJson.1",
    route: "/api/search",
    method: "POST",
    loadingState: "legacyUplift.search_submit_route.type.state.input:live_search_input.postJson.1.loading",
    successEvent: "legacyUplift.search_submit_route.message.success.input:live_search_input.postJson.1",
    failureEvent: "legacyUplift.search_submit_route.message.failure.input:live_search_input.postJson.1",
    refreshRuntime: true
  });
});

test("legacy frontend native uplift lowers input-driven patchJson writes onto native timed interactions", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "search_patch_route"
path = "/search-patch"
serves = "search_patch_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "search_patch_page", frontendProgram = "search_patch_program" }

[[widget]]
actor = "system"
id = "search_patch_page"
kind = "Page"
props = { title = "Search Patch" }

[[widget]]
actor = "system"
id = "search_patch_form"
kind = "Form"
props = { }

[[widget]]
actor = "system"
id = "search_patch_input"
kind = "Input"
props = { name = "q", value = "" }

[[attachWidget]]
actor = "system"
parent = "search_patch_page"
child = "search_patch_form"
order = 0

[[attachWidget]]
actor = "system"
parent = "search_patch_form"
child = "search_patch_input"
order = 0

[[frontendProgram]]
actor = "system"
id = "search_patch_program"
rootWidget = "search_patch_page"

[[frontendStep]]
actor = "system"
program = "search_patch_program"
event = "input:search_patch_input"
order = 0
op = "readForm"
params = { widget = "search_patch_form", into = "search" }

[[frontendStep]]
actor = "system"
program = "search_patch_program"
event = "input:search_patch_input"
order = 1
op = "patchJson"
params = { url = "/api/search", from = "search" }
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.blocked.length, 0);

  const result = applyLegacyFrontendUplift(world, {
    actor: "callan"
  });
  assert.equal(result.ok, true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "desire.defineBoundary"
    && witness.body?.operations?.[0]?.method === "PATCH"
    && witness.body?.id === "legacyUplift.search_patch_route.boundary.input:search_patch_input.patchJson.1"
  ), true);
});

test("legacy frontend native uplift lowers input-driven deleteJson writes onto native timed interactions", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "search_delete_route"
path = "/search-delete"
serves = "search_delete_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "search_delete_page", frontendProgram = "search_delete_program" }

[[widget]]
actor = "system"
id = "search_delete_page"
kind = "Page"
props = { title = "Search Delete" }

[[widget]]
actor = "system"
id = "search_delete_form"
kind = "Form"
props = { }

[[widget]]
actor = "system"
id = "search_delete_input"
kind = "Input"
props = { name = "q", value = "" }

[[attachWidget]]
actor = "system"
parent = "search_delete_page"
child = "search_delete_form"
order = 0

[[attachWidget]]
actor = "system"
parent = "search_delete_form"
child = "search_delete_input"
order = 0

[[frontendProgram]]
actor = "system"
id = "search_delete_program"
rootWidget = "search_delete_page"

[[frontendStep]]
actor = "system"
program = "search_delete_program"
event = "input:search_delete_input"
order = 0
op = "readForm"
params = { widget = "search_delete_form", into = "search" }

[[frontendStep]]
actor = "system"
program = "search_delete_program"
event = "input:search_delete_input"
order = 1
op = "deleteJson"
params = { url = "/api/search", from = "search" }
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.blocked.length, 0);

  const result = applyLegacyFrontendUplift(world, {
    actor: "callan"
  });
  assert.equal(result.ok, true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "desire.defineBoundary"
    && witness.body?.operations?.[0]?.method === "DELETE"
    && witness.body?.id === "legacyUplift.search_delete_route.boundary.input:search_delete_input.deleteJson.1"
  ), true);
});

test("legacy frontend native uplift lowers input-driven setSession mutations onto native timed interactions", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "session_write_route"
path = "/session-write"
serves = "session_write_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "session_write_page", frontendProgram = "session_write_program" }

[[widget]]
actor = "system"
id = "session_write_page"
kind = "Page"
props = { title = "Session Write" }

[[widget]]
actor = "system"
id = "session_write_form"
kind = "Form"
props = { }

[[attachWidget]]
actor = "system"
parent = "session_write_page"
child = "session_write_form"
order = 0

[[widget]]
actor = "system"
id = "session_write_input"
kind = "Input"
props = { name = "username", value = "" }

[[attachWidget]]
actor = "system"
parent = "session_write_form"
child = "session_write_input"
order = 0

[[frontendProgram]]
actor = "system"
id = "session_write_program"
rootWidget = "session_write_page"

[[frontendStep]]
actor = "system"
program = "session_write_program"
event = "input:session_write_input"
order = 0
op = "readForm"
params = { widget = "session_write_form", into = "credentials" }

[[frontendStep]]
actor = "system"
program = "session_write_program"
event = "input:session_write_input"
order = 1
op = "setSession"
params = { from = "credentials" }
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.blocked.length, 0);

  const result = applyLegacyFrontendUplift(world, {
    actor: "callan"
  });
  assert.equal(result.ok, true);

  const inputSurface = world.allWitnesses().find(witness =>
    witness.process === "desire.defineSurface"
    && witness.body?.id === "legacyUplift.session_write_route.surface.widget.session_write_input"
  );
  assert.equal(inputSurface?.body?.interactions?.some(interaction => JSON.stringify(interaction) === JSON.stringify({
    target: "self",
    event: "input",
    action: {
      kind: "deliver",
      message: "legacyUplift.session_write_route.message.trigger.input:session_write_input"
    },
    timing: {
      mode: "debounce",
      ms: 300
    }
  })), true);
  const boundary = world.allWitnesses().find(witness =>
    witness.process === "desire.defineBoundary"
    && witness.body?.id === "legacyUplift.session_write_route.boundary.input:session_write_input.setSession.1"
  );
  assert.equal(boundary?.body?.operations?.[0]?.route, "/api/session");
  assert.equal(boundary?.body?.operations?.[0]?.method, "POST");
  const successMessage = world.allWitnesses().find(witness =>
    witness.process === "desire.defineMessage"
    && witness.body?.id === "legacyUplift.session_write_route.message.success.input:session_write_input.setSession.1"
  );
  assert.deepEqual(successMessage?.body?.fields, expectedSessionSummaryFields("session_write_route"));
});

test("legacy frontend native uplift lowers input-driven logout mutations onto native timed interactions", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "session_logout_route"
path = "/session-logout"
serves = "session_logout_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "session_logout_page", frontendProgram = "session_logout_program" }

[[widget]]
actor = "system"
id = "session_logout_page"
kind = "Page"
props = { title = "Session Logout" }

[[widget]]
actor = "system"
id = "session_logout_input"
kind = "Input"
props = { name = "token", value = "" }

[[attachWidget]]
actor = "system"
parent = "session_logout_page"
child = "session_logout_input"
order = 0

[[frontendProgram]]
actor = "system"
id = "session_logout_program"
rootWidget = "session_logout_page"

[[frontendStep]]
actor = "system"
program = "session_logout_program"
event = "input:session_logout_input"
order = 0
op = "logout"
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.blocked.length, 0);

  const result = applyLegacyFrontendUplift(world, {
    actor: "callan"
  });
  assert.equal(result.ok, true);

  const inputSurface = world.allWitnesses().find(witness =>
    witness.process === "desire.defineSurface"
    && witness.body?.id === "legacyUplift.session_logout_route.surface.widget.session_logout_input"
  );
  assert.equal(inputSurface?.body?.interactions?.some(interaction => JSON.stringify(interaction) === JSON.stringify({
    target: "self",
    event: "input",
    action: {
      kind: "deliver",
      message: "legacyUplift.session_logout_route.message.trigger.input:session_logout_input"
    },
    timing: {
      mode: "debounce",
      ms: 300
    }
  })), true);
  const boundary = world.allWitnesses().find(witness =>
    witness.process === "desire.defineBoundary"
    && witness.body?.id === "legacyUplift.session_logout_route.boundary.input:session_logout_input.logout.0"
  );
  assert.equal(boundary?.body?.operations?.[0]?.route, "/api/session");
  assert.equal(boundary?.body?.operations?.[0]?.method, "DELETE");
  const successMessage = world.allWitnesses().find(witness =>
    witness.process === "desire.defineMessage"
    && witness.body?.id === "legacyUplift.session_logout_route.message.success.input:session_logout_input.logout.0"
  );
  assert.deepEqual(successMessage?.body?.fields, []);
  assert.deepEqual(successMessage?.body?.writes, {
    "legacyUplift.session_logout_route.type.state.input:session_logout_input.logout.0.loading": false,
    "legacyUplift.session_logout_route.type.state.input:session_logout_input.logout.0.status": "ready",
    ...expectedLoggedOutSessionWrites("session_logout_route")
  });
});

test("legacy frontend native uplift keeps input-driven external session mutation honestly blocked", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "external_session_route"
path = "/external-session"
serves = "external_session_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "external_session_page", frontendProgram = "external_session_program" }

[[widget]]
actor = "system"
id = "external_session_page"
kind = "Page"
props = { title = "External Session" }

[[widget]]
actor = "system"
id = "external_session_form"
kind = "Form"
props = { }

[[widget]]
actor = "system"
id = "external_session_input"
kind = "Input"
props = { name = "username", value = "" }

[[attachWidget]]
actor = "system"
parent = "external_session_page"
child = "external_session_form"
order = 0

[[attachWidget]]
actor = "system"
parent = "external_session_form"
child = "external_session_input"
order = 0

[[frontendProgram]]
actor = "system"
id = "external_session_program"
rootWidget = "external_session_page"

[[frontendStep]]
actor = "system"
program = "external_session_program"
event = "input:external_session_input"
order = 0
op = "readForm"
params = { widget = "external_session_form", into = "credentials" }

[[frontendStep]]
actor = "system"
program = "external_session_program"
event = "input:external_session_input"
order = 1
op = "setSession"
params = { from = "credentials", url = "https://example.com/api/session" }
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.pending.length, 0);
  assert.equal(preview.blocked.some(row =>
    row.id === "legacyFrontendUplift:blocked:external_session_route:network:1"
    && row.missingPrimitive === "non-route-backed or external network effects are not native-authored in this tranche"
  ), true);
});

test("legacy frontend native uplift lowers conditional and computed UI updates onto native branches and projections", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "conditional_route"
path = "/conditional"
serves = "conditional_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "conditional_page", frontendProgram = "conditional_program" }

[[widget]]
actor = "system"
id = "conditional_page"
kind = "Page"
props = { title = "Conditional" }

[[widget]]
actor = "system"
id = "conditional_form"
kind = "Form"
props = { }

[[widget]]
actor = "system"
id = "search_input"
kind = "Input"
props = { name = "q", value = "" }

[[widget]]
actor = "system"
id = "toggle_input"
kind = "Input"
props = { name = "enabled", type = "checkbox", checked = false }

[[widget]]
actor = "system"
id = "status_text"
kind = "Text"
props = { text = "" }

[[attachWidget]]
actor = "system"
parent = "conditional_page"
child = "conditional_form"
order = 0

[[attachWidget]]
actor = "system"
parent = "conditional_form"
child = "search_input"
order = 0

[[attachWidget]]
actor = "system"
parent = "conditional_form"
child = "toggle_input"
order = 1

[[attachWidget]]
actor = "system"
parent = "conditional_page"
child = "status_text"
order = 1

[[frontendProgram]]
actor = "system"
id = "conditional_program"
rootWidget = "conditional_page"

[[frontendStep]]
actor = "system"
program = "conditional_program"
event = "submit:conditional_form"
order = 0
op = "readForm"
params = { widget = "conditional_form", into = "search" }

[[frontendStep]]
actor = "system"
program = "conditional_program"
event = "input:search_input"
order = 0
op = "setText"
params = { widget = "status_text", text = "Hello \${search.q}" }

[[frontendStep]]
actor = "system"
program = "conditional_program"
event = "change:toggle_input"
order = 0
op = "setHidden"
when = { path = "event.checked", equals = true }
params = { widget = "status_text", hidden = true }
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.deepEqual(preview.blocked, []);
  assert.equal(preview.pending.some(row => row.kind === "projection" && row.action === "projection.define"), true);

  const result = applyLegacyFrontendUplift(world, { actor: "callan" });
  assert.equal(result.ok, true);

  const projections = world.allWitnesses()
    .filter(witness => witness.process === "desire.defineProjection")
    .map(witness => witness.body);
  assert.equal(projections.some(body =>
    body?.id === "legacyUplift.conditional_route.projection.input:search_input.setText.0.status_text.text"
    && body?.projectionKind === "template"
  ), true);
  assert.equal(projections.some(body =>
    body?.id === "legacyUplift.conditional_route.projection.change:toggle_input.setHidden.0.equals"
    && body?.projectionKind === "equals"
  ), true);

  const process = world.allWitnesses().find(witness =>
    witness.process === "desire.defineProcess"
    && witness.body?.id === "legacyUplift.conditional_route.process"
  )?.body;
  const inputRule = process?.rules?.find(rule =>
    rule.trigger === "legacyUplift.conditional_route.message.trigger.input:search_input"
  );
  assert.equal(inputRule?.steps?.some(step =>
    step.kind === "setState"
    && step.state === "legacyUplift.conditional_route.type.state.status_text.text"
    && step.valueFrom?.kind === "projection"
    && step.valueFrom?.projection === "legacyUplift.conditional_route.projection.input:search_input.setText.0.status_text.text"
  ), true);
  const changeRule = process?.rules?.find(rule =>
    rule.trigger === "legacyUplift.conditional_route.message.trigger.change:toggle_input"
  );
  assert.equal(changeRule?.steps?.some(step => step.kind === "branch" && step.condition?.kind === "projection"), true);
});

test("legacy frontend native uplift lowers computed post-command UI updates onto native success rules", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "computed_success_route"
path = "/computed-success"
serves = "computed_success_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "computed_success_page", frontendProgram = "computed_success_program" }

[[widget]]
actor = "system"
id = "computed_success_page"
kind = "Page"
props = { title = "Computed Success" }

[[widget]]
actor = "system"
id = "computed_success_button"
kind = "Button"
props = { text = "Load" }

[[widget]]
actor = "system"
id = "computed_success_status"
kind = "Text"
props = { text = "" }

[[attachWidget]]
actor = "system"
parent = "computed_success_page"
child = "computed_success_button"
order = 0

[[attachWidget]]
actor = "system"
parent = "computed_success_page"
child = "computed_success_status"
order = 1

[[frontendProgram]]
actor = "system"
id = "computed_success_program"
rootWidget = "computed_success_page"

[[frontendStep]]
actor = "system"
program = "computed_success_program"
event = "click:computed_success_button"
order = 0
op = "fetchJson"
params = { url = "/api/search", into = "payload" }

[[frontendStep]]
actor = "system"
program = "computed_success_program"
event = "click:computed_success_button"
order = 1
op = "setText"
params = { widget = "computed_success_status", text = "Result \${payload}" }
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.deepEqual(preview.blocked, []);

  const result = applyLegacyFrontendUplift(world, { actor: "callan" });
  assert.equal(result.ok, true);

  const process = world.allWitnesses().find(witness =>
    witness.process === "desire.defineProcess"
    && witness.body?.id === "legacyUplift.computed_success_route.process"
  )?.body;
  const successRule = process?.rules?.find(rule =>
    rule.trigger === "legacyUplift.computed_success_route.message.success.click:computed_success_button.fetchJson.0"
  );
  assert.equal(successRule?.steps?.some(step =>
    step.kind === "setState"
    && step.state === "legacyUplift.computed_success_route.type.state.computed_success_status.text"
    && step.valueFrom?.kind === "projection"
    && step.valueFrom?.projection === "legacyUplift.computed_success_route.projection.legacyUplift.computed_success_route.message.success.click:computed_success_button.fetchJson.0.setText.1.computed_success_status.text"
  ), true);
  assert.equal(world.allWitnesses().some(witness =>
    witness.process === "desire.defineProjection"
    && witness.body?.id === "legacyUplift.computed_success_route.projection.legacyUplift.computed_success_route.message.success.click:computed_success_button.fetchJson.0.setText.1.computed_success_status.text"
    && witness.body?.projectionKind === "template"
  ), true);
});

test("legacy frontend native uplift keeps input-driven external writes honestly blocked", () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[route]]
actor = "system"
id = "external_write_route"
path = "/external-write"
serves = "external_write_route"
method = "GET"
handler = "page.home"
params = { rootWidget = "external_write_page", frontendProgram = "external_write_program" }

[[widget]]
actor = "system"
id = "external_write_page"
kind = "Page"
props = { title = "External Write" }

[[widget]]
actor = "system"
id = "external_write_form"
kind = "Form"
props = { }

[[widget]]
actor = "system"
id = "external_write_input"
kind = "Input"
props = { name = "q", value = "" }

[[attachWidget]]
actor = "system"
parent = "external_write_page"
child = "external_write_form"
order = 0

[[attachWidget]]
actor = "system"
parent = "external_write_form"
child = "external_write_input"
order = 0

[[frontendProgram]]
actor = "system"
id = "external_write_program"
rootWidget = "external_write_page"

[[frontendStep]]
actor = "system"
program = "external_write_program"
event = "input:external_write_input"
order = 0
op = "readForm"
params = { widget = "external_write_form", into = "search" }

[[frontendStep]]
actor = "system"
program = "external_write_program"
event = "input:external_write_input"
order = 1
op = "postJson"
params = { url = "https://example.com/api/search", from = "search" }
  `);

  const preview = previewLegacyFrontendUplift(world);
  assert.equal(preview.pending.length, 0);
  assert.equal(preview.blocked.some(row =>
    row.id === "legacyFrontendUplift:blocked:external_write_route:route:1"
    && row.missingPrimitive === "external or unresolved route target"
  ), true);
});
