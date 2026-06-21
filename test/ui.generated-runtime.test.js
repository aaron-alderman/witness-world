import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { applyWitnessToml } from "../src/dsl.js";
import { renderWidgetPage } from "../src/runtime-widget-page.js";
import { expectNoRuntimeErrors, launchBrowser, startBlankUiServer, startUiDemoServer, waitForAppReady } from "./support/harness.js";

function bodyInner(html) {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return match ? match[1] : html;
}

test("generated UI boots, renders core widgets, and is executable", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);

    const appRoot = page.locator('[data-widget="todo_app_widget"]');
    await appRoot.waitFor();
    assert.equal(await page.locator('[data-widget="todo_form"]').count() > 0, true);
    assert.equal(await page.locator('[data-widget="todo_list"]').count() > 0, true);
    assert.equal(await page.locator('[data-widget-template="todo_item_template"]').count(), 1);
    assert.equal(await page.locator('[data-role="app-status"]').count(), 1);
    assert.equal(await page.locator('[data-widget="todo_session"]').count() > 0, true);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("generated live widget pages expose shared runtime inspection through the widget runtime", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    await page.waitForFunction(() => Boolean(window.__surfaceRuntimeInspection?.latestProbe));

    const inspection = await page.evaluate(async () => {
      const inspection = window.__surfaceRuntimeInspection;
      const probe = await inspection.rerunProbe();
      const diagnostics = await inspection.refreshServerDiagnostics();
      return {
        aliasesShared: inspection === window.world && inspection === window.witnessWorld,
        activeSurfaceId: inspection.activeSurfaceId,
        runtimeIds: inspection.runtimeIds,
        traceLength: inspection.process?.traceLength ?? 0,
        currentProcessRefs: probe?.currentProcessRefs ?? [],
        activeRoutePath: probe?.activeRouteTarget?.path ?? null,
        mountedHomeRoutePath: diagnostics?.mountedRoutes?.find(route => route.id === "home_page_route")?.path ?? null
      };
    });

    assert.equal(inspection.aliasesShared, true);
    assert.equal(inspection.activeSurfaceId, "todo_app_widget");
    assert.equal(inspection.runtimeIds.includes("todo_frontend_program"), true);
    assert.equal(inspection.traceLength > 0, true);
    assert.equal(inspection.currentProcessRefs.includes("todo_frontend_program"), true);
    assert.equal(inspection.activeRoutePath, "/");
    assert.equal(inspection.mountedHomeRoutePath, "/");

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("generated runtime executes repeat.forEach steps in the browser", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Repeat Runtime" }

[[text]]
actor = "adam"
id = "slot0"
text = "pending-0"

[[text]]
actor = "adam"
id = "slot1"
text = "pending-1"

[[text]]
actor = "adam"
id = "slot2"
text = "pending-2"

[[attachWidget]]
actor = "adam"
parent = "root"
child = "slot0"
order = 0

[[attachWidget]]
actor = "adam"
parent = "root"
child = "slot1"
order = 1

[[attachWidget]]
actor = "adam"
parent = "root"
child = "slot2"
order = 2

[[frontendProgram]]
actor = "adam"
id = "program"
rootWidget = "root"

[[frontendStep]]
actor = "adam"
program = "program"
event = "load"
order = 0
op = "fetchJson"
params = { url = "data:application/json,%7B%22items%22%3A%5B%7B%22target%22%3A%22slot0%22%2C%22label%22%3A%22Alpha%22%7D%2C%7B%22target%22%3A%22slot1%22%2C%22label%22%3A%22Beta%22%7D%2C%7B%22target%22%3A%22slot2%22%2C%22label%22%3A%22Gamma%22%7D%5D%7D", into = "payload" }

[[frontendStep]]
actor = "adam"
program = "program"
event = "load"
order = 1
op = "setText"
repeat = { forEach = { from = "payload.items", as = "item" } }
params = { widget = "\${item.target}", text = "\${item.label}" }

[[frontendStep]]
actor = "adam"
program = "program"
event = "error"
order = 0
op = "setText"
params = { widget = "slot0", text = "Failed: \${event.message}" }
`);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root", frontendProgram: "program" });
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const slot0 = document.querySelector('[data-widget="slot0"]');
      const slot1 = document.querySelector('[data-widget="slot1"]');
      const slot2 = document.querySelector('[data-widget="slot2"]');
      return slot0?.textContent === "Alpha" && slot1?.textContent === "Beta" && slot2?.textContent === "Gamma";
    });
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
  }
});

test("generated runtime can post serial repeated request bodies from repeat-scope objects", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[defaults]]
actor = "adam"
context = "frontend"
program = "program"

[[box]]
id = "root"
children = ["run_button", "status"]

[[button]]
id = "run_button"
text = "Run"
type = "button"
action = "runSequence"

[[text]]
id = "status"
text = "Waiting"

[[frontendProgram]]
id = "program"
rootWidget = "root"

[[step]]
order = 0
op = "postJson"
on = "click:runSequence"
repeat = { forEach = { from = "payload.requests", as = "item", serial = true } }
url = "/echo/\${item.id}"
from = "item.body"
into = "lastEcho"

[[step]]
order = 1
op = "setText"
on = "click:runSequence"
widget = "status"
text = "Done"

[[step]]
order = 0
op = "setText"
on = "error"
widget = "status"
text = "Failed: \${event.message}"
`);

  const html = renderWidgetPage(world, {
    actor: "frontendHost",
    rootWidget: "root",
    frontendProgram: "program",
    appConfig: {
      initialStateScriptId: "runtime-sequence-state",
      initialStateInto: "payload"
    }
  }).replace(/<body[^>]*>/i, "$&<script type=\"application/json\" id=\"runtime-sequence-state\">{\"requests\":[{\"id\":\"one\",\"body\":{\"label\":\"Alpha\"}},{\"id\":\"two\",\"body\":{\"label\":\"Beta\"}}]}</script>");

  const requests = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.route("**/echo/*", async route => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      requests.push({
        url: route.request().url(),
        body: JSON.parse(route.request().postData() || "{}")
      });
      await new Promise(resolve => setTimeout(resolve, 25));
      inFlight -= 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
    });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.locator('[data-action="runSequence"]').click();
    await page.waitForFunction(() => document.querySelector('[data-widget="status"]')?.textContent === "Done");
    assert.deepEqual(requests.map(row => row.url.split("/").at(-1)), ["one", "two"]);
    assert.deepEqual(requests.map(row => row.body), [{ label: "Alpha" }, { label: "Beta" }]);
    assert.equal(maxInFlight, 1);
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
  }
});

test("generated runtime routes authored input events through semantic input:<widget> handlers", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Input Runtime" }

[[input]]
actor = "adam"
id = "query"
props = { name = "query", placeholder = "Search" }

[[text]]
actor = "adam"
id = "echo"
text = "Waiting"

[[attachWidget]]
actor = "adam"
parent = "root"
child = "query"
order = 0

[[attachWidget]]
actor = "adam"
parent = "root"
child = "echo"
order = 1

[[frontendProgram]]
actor = "adam"
id = "program"
rootWidget = "root"

[[frontendStep]]
actor = "adam"
program = "program"
event = "input:query"
order = 0
op = "setText"
params = { widget = "echo", text = "Typed: \${event.value}" }

[[frontendStep]]
actor = "adam"
program = "program"
event = "error"
order = 0
op = "setText"
params = { widget = "echo", text = "Failed: \${event.message}" }
`);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root", frontendProgram: "program" });
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.locator('[data-widget="query"]').fill("Alpha");
    await page.waitForFunction(() => document.querySelector('[data-widget="echo"]')?.textContent === "Typed: Alpha");
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
  }
});

test("generated runtime can coerce authored checkbox fields to booleans during readForm", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[defaults]]
actor = "adam"
context = "frontend"
program = "program"

[[box]]
id = "root"
children = ["prefs_form", "status"]

[[form]]
id = "prefs_form"
children = ["include_derived", "submit_button"]

[[input]]
id = "include_derived"
name = "includeDerived"
type = "checkbox"

[[button]]
id = "submit_button"
text = "Save"
type = "submit"

[[text]]
id = "status"
text = "Waiting"

[[frontendProgram]]
id = "program"
rootWidget = "root"

[[step]]
order = 0
op = "readForm"
on = "submit:prefs_form"
widget = "prefs_form"
checkboxes = "boolean"
into = "draft"

[[step]]
order = 1
op = "setText"
on = "submit:prefs_form"
widget = "status"
text = "Include derived: \${state.draft.includeDerived}"

[[step]]
order = 0
op = "setText"
on = "error"
widget = "status"
text = "Failed: \${event.message}"
`);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root", frontendProgram: "program" });
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector('[data-widget="prefs_form"]')?.__witnessBound === true);
    await page.locator('[data-widget="submit_button"]').click();
    await page.waitForFunction(() => document.querySelector('[data-widget="status"]')?.textContent !== "Waiting");
    assert.equal(await page.locator('[data-widget="status"]').textContent(), "Include derived: false");
    await page.locator('[data-widget="include_derived"]').check();
    await page.locator('[data-widget="submit_button"]').click();
    await page.waitForFunction(() => document.querySelector('[data-widget="status"]')?.textContent !== "Include derived: false");
    assert.equal(await page.locator('[data-widget="status"]').textContent(), "Include derived: true");
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
  }
});

test("generated runtimes can coexist on one page when each embedded program uses a unique script id", async () => {
  const worldA = createWorld();
  applyWitnessToml(worldA, `
[[defaults]]
actor = "adam"
context = "frontend"
program = "program_a"

[[box]]
id = "root_a"
children = ["form_a", "status_a"]

[[form]]
id = "form_a"
children = ["input_a", "submit_a"]

[[input]]
id = "input_a"
name = "name"

[[button]]
id = "submit_a"
text = "Save A"
type = "submit"

[[text]]
id = "status_a"
text = "Waiting A"

[[frontendProgram]]
id = "program_a"
rootWidget = "root_a"

[[step]]
order = 0
op = "readForm"
on = "submit:form_a"
widget = "form_a"
into = "draftA"

[[step]]
order = 1
op = "setText"
on = "submit:form_a"
widget = "status_a"
text = "A: \${state.draftA.name}"
`);

  const worldB = createWorld();
  applyWitnessToml(worldB, `
[[defaults]]
actor = "beth"
context = "frontend"
program = "program_b"

[[box]]
id = "root_b"
children = ["form_b", "status_b"]

[[form]]
id = "form_b"
children = ["input_b", "submit_b"]

[[input]]
id = "input_b"
name = "name"

[[button]]
id = "submit_b"
text = "Save B"
type = "submit"

[[text]]
id = "status_b"
text = "Waiting B"

[[frontendProgram]]
id = "program_b"
rootWidget = "root_b"

[[step]]
order = 0
op = "readForm"
on = "submit:form_b"
widget = "form_b"
into = "draftB"

[[step]]
order = 1
op = "setText"
on = "submit:form_b"
widget = "status_b"
text = "B: \${state.draftB.name}"
`);

  const htmlA = renderWidgetPage(worldA, {
    actor: "frontendHost",
    rootWidget: "root_a",
    frontendProgram: "program_a",
    appConfig: {
      frontendProgramScriptId: "witness-program-a"
    }
  });
  const htmlB = renderWidgetPage(worldB, {
    actor: "frontendHost",
    rootWidget: "root_b",
    frontendProgram: "program_b",
    appConfig: {
      frontendProgramScriptId: "witness-program-b"
    }
  });
  const combinedHtml = `<!doctype html><html><body>${bodyInner(htmlA)}${bodyInner(htmlB)}</body></html>`;

  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.setContent(combinedHtml, { waitUntil: "domcontentloaded" });
    await page.locator('[data-widget="input_a"]').fill("Alpha");
    await page.locator('[data-widget="form_a"] button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('[data-widget="status_a"]')?.textContent === "A: Alpha");

    await page.locator('[data-widget="input_b"]').fill("Beta");
    await page.locator('[data-widget="form_b"] button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('[data-widget="status_b"]')?.textContent === "B: Beta");

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
  }
});

test("generated runtime rejects retired dispatchDomEvent authored steps", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[defaults]]
actor = "adam"
context = "frontend"
program = "program"

[[box]]
id = "root"
children = ["notify_button", "status"]

[[button]]
id = "notify_button"
text = "Notify"
type = "button"
action = "notifyHost"

[[text]]
id = "status"
text = "Waiting"

[[frontendProgram]]
id = "program"
rootWidget = "root"

[[step]]
order = 0
op = "dispatchDomEvent"
on = "click:notifyHost"
eventName = "witness:test-event"
detail = { value = "Alpha" }

[[step]]
order = 0
op = "setText"
on = "error"
widget = "status"
text = "Failed: \${event.message}"
`);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root", frontendProgram: "program" });
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.locator('[data-widget="notify_button"]').click();
    await page.waitForFunction(() => {
      const text = document.querySelector('[data-widget="status"]')?.textContent || "";
      return text.includes("dispatchDomEvent has been retired");
    });
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
  }
});

test("generated runtime can update query params without forcing navigation", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[defaults]]
actor = "adam"
context = "frontend"
program = "program"

[[box]]
id = "root"
children = ["clear_button"]

[[button]]
id = "clear_button"
text = "Clear"
type = "button"
action = "clearIdentity"

[[frontendProgram]]
id = "program"
rootWidget = "root"

[[step]]
order = 0
op = "setQueryParam"
on = "click:clearIdentity"
name = "identity"
value = ""
`);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root", frontendProgram: "program" });
  const { server, close: closeServer } = await startBlankUiServer();
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    runtime.pageErrors.length = 0;
    runtime.consoleErrors.length = 0;
    await page.evaluate(() => { window.history.replaceState({}, "", "/?identity=identity.aaron"); });
    await page.locator('[data-widget="clear_button"]').click();
    await page.waitForFunction(() => new URL(window.location.href).searchParams.get("identity") === null);
    assert.equal(runtime.pageErrors.length, 0);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});

test("generated runtime routes root keyboard shortcuts through semantic keydown:<rootWidget> handlers", async () => {
  const world = createWorld();
  applyWitnessToml(world, `
[[widget]]
actor = "adam"
id = "root"
kind = "Page"
props = { title = "Shortcut Runtime" }

[[text]]
actor = "adam"
id = "status"
text = "Waiting"

[[attachWidget]]
actor = "adam"
parent = "root"
child = "status"
order = 0

[[frontendProgram]]
actor = "adam"
id = "program"
rootWidget = "root"

[[frontendStep]]
actor = "adam"
program = "program"
event = "keydown:root"
order = 0
op = "setText"
when = { path = "event.ctrlKey", truthy = true }
params = { widget = "status", text = "Shortcut: \${event.key}" }

[[frontendStep]]
actor = "adam"
program = "program"
event = "error"
order = 0
op = "setText"
params = { widget = "status", text = "Failed: \${event.message}" }
`);

  const html = renderWidgetPage(world, { actor: "frontendHost", rootWidget: "root", frontendProgram: "program" });
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'k',
        code: 'KeyK',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      }));
    });
    await page.waitForFunction(() => document.querySelector('[data-widget="status"]')?.textContent === "Shortcut: k");
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
  }
});
