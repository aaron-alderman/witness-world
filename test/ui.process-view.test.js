import assert from "node:assert/strict";
import test from "node:test";
import { expectNoRuntimeErrors, launchBrowser, startUiDemoServer } from "./support/harness.js";

test("process view is a dedicated page with recorded runs, graph nodes, and replay controls", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    const program = "todo_frontend_program";
    const event = "load";
    const initialView = await fetch(`${server.url}/api/process-view?program=${program}&event=${event}`).then(response => response.json());
    const tracedNode = initialView.graph?.nodes?.[0];
    assert.ok(tracedNode?.id, "expected a process-view graph node to seed a run");

    const runId = "ui-process-view-run";
    const trace = async (process, body = {}) => {
      const response = await fetch(`${server.url}/api/process-events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          process,
          runId,
          program,
          event,
          timestamp: Date.now(),
          ...body
        })
      });
      assert.equal(response.status, 200);
    };

    await trace("frontend.process.start");
    await trace("frontend.step.start", { nodeId: tracedNode.id, op: tracedNode.op });
    await trace("frontend.step.done", { nodeId: tracedNode.id, op: tracedNode.op });
    await trace("frontend.process.done");

    await page.goto(`${server.url}/process?program=${program}&event=${event}&runId=${runId}`);
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
    const replayTarget = "1";
    await replayRange.evaluate((element, value) => {
      element.value = value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, replayTarget);
    await page.waitForURL(url => url.pathname === "/process" && url.searchParams.get("replay") === replayTarget);

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});
