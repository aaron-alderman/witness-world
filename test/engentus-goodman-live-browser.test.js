import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  expectNoRuntimeErrors,
  launchBrowser,
  startUiServer
} from "./support/harness.js";

async function waitForVisible(page, selector) {
  await page.waitForFunction(target => {
    const node = document.querySelector(target);
    return Boolean(node) && getComputedStyle(node).display !== "none";
  }, selector);
}

test("goodman live shell runs through simulation, windows, and scrubber flow on the core runtime seam", async () => {
  const { url, close } = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus/app.wtoml"),
    serverRunnerId: "engentus_server"
  });
  const browser = await launchBrowser();
  try {
    await browser.page.goto(`${url}/engentus/goodman`, { waitUntil: "domcontentloaded" });
    await waitForVisible(browser.page, "#view-goodman");
    await browser.page.locator("#static-params-html").waitFor();
    await browser.page.locator("#save-sim-btn").waitFor();

    await browser.page.click("#save-sim-btn");
    await waitForVisible(browser.page, "#sec-mc");
    assert.equal(await browser.page.locator(".sim-row").count(), 1);

    await browser.page.fill("#cfg-n", "80");
    await browser.page.click("#btn-run");
    await browser.page.waitForFunction(() => {
      const label = document.querySelector("#prog-lbl");
      return Boolean(label) && /Completed/i.test(label.textContent || "");
    }, { timeout: 60000 });

    await browser.page.click('.tbw[data-win="cdf"]');
    await waitForVisible(browser.page, "#fw-cdf");
    await browser.page.click('.tbw[data-win="stats"]');
    await waitForVisible(browser.page, "#fw-stats");

    await browser.page.click("#time-sl");
    await browser.page.fill("#time-sl", "6");
    await browser.page.dispatchEvent("#time-sl", "input");
    await browser.page.waitForFunction(() => {
      const label = document.querySelector("#t-lbl");
      return Boolean(label) && !/0\.0/.test(label.textContent || "");
    });

    await browser.page.click('[data-sim-action="clone"]');
    assert.equal(await browser.page.locator(".sim-row").count(), 2);
    await browser.page.locator('[data-sim-action="delete"]').last().click();
    await browser.page.waitForFunction(() => document.querySelectorAll(".sim-row").length === 1);

    expectNoRuntimeErrors(browser.runtime);
  } finally {
    await browser.close();
    await close();
  }
});
