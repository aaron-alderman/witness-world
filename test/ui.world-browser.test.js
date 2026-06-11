import assert from "node:assert/strict";
import test from "node:test";
import { expectNoRuntimeErrors, launchBrowser, startUiDemoServer } from "./support/harness.js";

test("world browser supports graph/primitive/source mode transitions and interactive selection", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/world`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-widget="world_graph_page"]').waitFor();
    await page.locator('[data-widget="world_session_status"]').waitFor();
    assert.match((await page.locator('[data-widget="world_session_status"]').textContent()) || "", /Not signed in/);

    await page.fill('[data-widget="world_username_input"]', "aaron");
    await page.fill('[data-widget="world_password_input"]', "aaron");
    await page.locator('[data-widget="world_open_button"]').click();
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-widget="world_session_status"]');
      return Boolean(status && status.textContent && status.textContent.includes("Signed in as Aaron"));
    });

    const modeCount = await page.locator('[data-world-mode]').count();
    assert.equal(modeCount >= 3, true);

    await page.locator('[data-world-mode="graph"]').click();
    const graphCanvas = page.locator(".world-graph-canvas");
    await graphCanvas.waitFor();
    assert.equal(await graphCanvas.isVisible(), true);

    await page.locator('[data-world-mode="primitive"]').click();
    const primitiveView = page.locator(".world-primitive-browser");
    await primitiveView.waitFor();
    assert.equal(await primitiveView.isVisible(), true);

    await page.locator('[data-world-mode="source"]').click();
    const sourceWork = page.locator(".world-document-view");
    await sourceWork.waitFor();
    assert.equal(await sourceWork.isVisible(), true);

    const sourceFileButtons = page.locator('[data-world-source-file]');
    const sourceButtonCount = await sourceFileButtons.count();
    if (sourceButtonCount > 0) {
      const sourceFileButton = sourceFileButtons.first();
      const sourceLabel = (await sourceFileButton.textContent())?.trim() || "";
      await sourceFileButton.click();
      const sourceTitle = page.locator(".world-source-title");
      await sourceTitle.waitFor();
      const sourceText = (await sourceTitle.textContent()) || "";
      if (sourceLabel) {
        assert.equal(sourceText.includes(sourceLabel), true);
      }
      const sourceCode = (await page.locator(".world-source-code").textContent()) || "";
      assert.equal(sourceCode.length > 0, true);
    } else {
      const sourceEmpty = page.locator(".world-source-empty");
      await sourceEmpty.waitFor();
      assert.equal(await sourceEmpty.isVisible(), true);
    }

    await page.locator('[data-world-mode="graph"]').click();
    const nodeLocator = page.locator('[data-world-node-id]');
    const nodeCount = await nodeLocator.count();
    assert.equal(nodeCount > 0, true);

    const secondNodeId = await nodeLocator.nth(Math.min(1, nodeCount - 1)).getAttribute("data-world-node-id");
    const targetNodeId = secondNodeId;
    assert.ok(targetNodeId);

    await nodeLocator.nth(Math.min(1, nodeCount - 1)).click();
    await page.waitForFunction(
      expected => {
        const inspector = document.querySelector(".world-graph-inspector");
        return Boolean(inspector && inspector.textContent && inspector.textContent.includes(expected));
      },
      targetNodeId
    );

    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});
