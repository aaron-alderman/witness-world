import assert from "node:assert/strict";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { applyWitnessToml } from "../src/dsl.js";
import { renderWidgetPage } from "../src/widgets.js";
import { expectNoRuntimeErrors, launchBrowser, startUiDemoServer, waitForAppReady } from "./support/harness.js";

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
