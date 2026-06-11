import assert from "node:assert/strict";
import test from "node:test";
import { expectNoRuntimeErrors, launchBrowser, startUiDemoServer, waitForAppReady } from "./support/harness.js";

test("process view is a dedicated page with recorded runs, graph nodes, and replay controls", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/`);
    await waitForAppReady(page);
    const processHref = await page.locator('[data-widget="todo_process_link"]').getAttribute("href");
    assert.equal(processHref, "/process");
    await page.goto(`${server.url}/process?program=todo_frontend_program&event=load`);
    await page.waitForURL(url => url.pathname === "/process");

    assert.equal(await page.locator('[data-widget="world_graph_page"]').count(), 0);
    await page.locator('[data-process-view]').waitFor();

    const catalogItems = page.locator('[data-process-catalog-item]');
    assert.equal(await catalogItems.count() > 0, true);

    const runItems = page.locator('[data-process-run-item]');
    assert.equal(await runItems.count() > 0, true);

    const graphNodes = page.locator('[data-process-node]');
    assert.equal(await graphNodes.count() > 0, true);

    const replayRange = page.locator('[data-process-replay-range]');
    await replayRange.waitFor();
    assert.equal(await replayRange.getAttribute("type"), "range");

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});
