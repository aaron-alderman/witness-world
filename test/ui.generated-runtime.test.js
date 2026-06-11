import assert from "node:assert/strict";
import test from "node:test";
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
