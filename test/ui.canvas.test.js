import assert from "node:assert/strict";
import test from "node:test";
import { expectNoRuntimeErrors, launchBrowser, startUiDemoServer } from "./support/harness.js";

test("canvas uses session-backed login before perspective creation", async () => {
  const { server, close: closeServer } = await startUiDemoServer({});
  const {
    page,
    runtime,
    close: closeBrowser
  } = await launchBrowser();

  try {
    await page.goto(`${server.url}/canvas`);
    await page.waitForLoadState("domcontentloaded");

    await page.locator("#session-status").waitFor();
    assert.equal(await page.locator("#actor-select").count(), 0);
    assert.match((await page.locator("#session-status").textContent()) || "", /Not signed in/);

    await page.fill("#session-username", "aaron");
    await page.fill("#session-password", "aaron");
    await page.locator("#session-open-btn").click();

    await page.waitForFunction(() => {
      const status = document.getElementById("session-status");
      return Boolean(status && status.textContent && status.textContent.includes("Signed in as Aaron"));
    });

    await page.locator("#new-perspective-btn").click();
    await page.locator("#overlay-input").fill("Canvas Session");
    await page.locator("#overlay-input").press("Enter");

    await page.waitForFunction(() => {
      const select = document.getElementById("perspective-select");
      return Boolean(select && select.value);
    });

    const sessionValue = (await page.locator("#session-status").textContent()) || "";
    assert.match(sessionValue, /Signed in as Aaron/);
    await expectNoRuntimeErrors(runtime);
  } finally {
    await closeBrowser();
    await closeServer();
  }
});
