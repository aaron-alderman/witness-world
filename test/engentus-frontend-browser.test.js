import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  expectNoRuntimeErrors,
  launchBrowser,
  startUiServer
} from "./support/harness.js";

async function expectUnique(page, selector) {
  const locator = page.locator(selector);
  assert.equal(await locator.count(), 1, `expected one match for ${selector}`);
  return locator;
}

test("engentus browser flow serves the DESIRE shell routes without presenter bootstraps", async () => {
  const { url, close } = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus/app.wtoml"),
    serverRunnerId: "engentus_server"
  });
  const browser = await launchBrowser();
  try {
    await browser.page.goto(`${url}/`, { waitUntil: "domcontentloaded" });
    await browser.page.waitForURL(/\/$/);
    await browser.page.getByText("Welcome back").waitFor();

    await (await expectUnique(browser.page, 'button.auth-submit[data-shell-nav-href="/engentus/home"]')).click();
    await browser.page.waitForURL(/\/engentus\/home$/);
    await browser.page.getByText("Analysis Modules").waitFor();

    await (await expectUnique(browser.page, '[data-shell-nav-href="/engentus/goodman"]')).click();
    await browser.page.waitForURL(/\/engentus\/goodman$/);
    await browser.page.locator("#view-goodman").waitFor();
    assert.equal(await browser.page.locator("#chart-svg[data-mount-mode=\"mounted-panel\"]").count(), 1);
    assert.equal(await browser.page.locator("iframe[data-mount-mode=\"mounted-panel\"]").count(), 0);

    await (await expectUnique(browser.page, "#tb-brand")).click();
    await browser.page.waitForURL(/\/engentus\/home$/);

    await (await expectUnique(browser.page, '[data-shell-nav-href="/engentus/mill-charge"]')).click();
    await browser.page.waitForURL(/\/engentus\/mill-charge$/);
    await browser.page.locator("#view-mill").waitFor();
    assert.equal(await browser.page.locator("#mill-canvas[data-mount-mode=\"mounted-panel\"]").count(), 1);

    await (await expectUnique(browser.page, "#tb-brand")).click();
    await browser.page.waitForURL(/\/engentus\/home$/);

    await (await expectUnique(browser.page, '[data-shell-nav-href="/engentus/mill-force"]')).click();
    await browser.page.waitForURL(/\/engentus\/mill-force$/);
    await browser.page.locator("#view-mill-force").waitFor();
    assert.equal(await browser.page.locator("#mill-force-svg-cross[data-mount-mode=\"mounted-panel\"]").count(), 1);
    assert.equal(await browser.page.locator("#mill-force-svg-force[data-mount-mode=\"mounted-panel\"]").count(), 1);
    assert.equal(await browser.page.locator("#mill-force-svg-rose[data-mount-mode=\"mounted-panel\"]").count(), 1);
    assert.equal(await browser.page.locator("iframe[data-mount-mode=\"iframe\"]").count(), 0);

    await (await expectUnique(browser.page, "#user-prof")).click();
    await (await expectUnique(browser.page, '[data-shell-nav-href="/engentus/signout"]')).click();
    await browser.page.waitForURL(/\/engentus\/signout$/);
    await browser.page.getByText("You've been signed out").waitFor();

    expectNoRuntimeErrors(browser.runtime);
  } finally {
    await browser.close();
    await close();
  }
});
