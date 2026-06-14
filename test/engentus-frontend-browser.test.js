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

async function waitForText(page, selector, predicate, { timeoutMs = 15000, intervalMs = 100 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = String(await page.locator(selector).textContent() ?? "").trim();
    if (predicate(text)) return text;
    await page.waitForTimeout(intervalMs);
  }
  assert.fail(`timed out waiting for ${selector}`);
}

test("engentus browser flow matches login, home, module, and signout shell routing", async () => {
  const { url, close } = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus/app.wtoml"),
    serverRunnerId: "engentus_server"
  });
  const browser = await launchBrowser();
  try {
    await browser.page.goto(`${url}/`, { waitUntil: "domcontentloaded" });
    await browser.page.waitForURL(/\/$/);
    await (await expectUnique(browser.page, 'button.auth-submit[data-shell-nav-href="/engentus/home"]')).click();
    await browser.page.waitForURL(/\/engentus\/home$/);
    await browser.page.getByText("Analysis Modules").waitFor();

    await (await expectUnique(browser.page, '[data-shell-nav-href="/engentus/goodman"]')).click();
    await browser.page.waitForURL(/\/engentus\/goodman$/);
    await browser.page.locator("#view-goodman").waitFor();
    await browser.page.locator("#static-save-sim-btn").waitFor();
    assert.equal(await browser.page.locator("#chart-svg[data-mount-mode=\"mounted-panel\"]").count(), 1);
    assert.equal(await browser.page.locator("iframe[data-mount-mode=\"mounted-panel\"]").count(), 0);

    await (await expectUnique(browser.page, "#static-save-sim-btn")).click();
    await browser.page.locator("#sim-list .sim-row").waitFor();
    const goodmanMcSummary = await browser.page.evaluate(() => ({
      mode: document.querySelector(".mode-btn.on")?.textContent?.trim(),
      secStatic: getComputedStyle(document.getElementById("sec-static")).display,
      secMc: getComputedStyle(document.getElementById("sec-mc")).display,
      secRun: getComputedStyle(document.getElementById("sec-run")).display,
      simRows: document.querySelectorAll("#sim-list .sim-row").length,
      activeSim: document.querySelector("#sim-list .sim-row.on")?.getAttribute("data-sid") ?? null,
      btnRunText: document.getElementById("btn-run")?.textContent?.trim(),
      btnPauseText: document.getElementById("btn-pause")?.textContent?.trim(),
      btnStopText: document.getElementById("btn-stop")?.textContent?.trim()
    }));
    assert.equal(goodmanMcSummary.mode, "Monte Carlo");
    assert.equal(goodmanMcSummary.secStatic, "none");
    assert.equal(goodmanMcSummary.secMc, "block");
    assert.equal(goodmanMcSummary.secRun, "block");
    assert.equal(goodmanMcSummary.simRows, 1);
    assert.notEqual(goodmanMcSummary.activeSim, null);
    assert.equal(goodmanMcSummary.btnRunText, "▶ Run");
    assert.equal(goodmanMcSummary.btnPauseText, "⏸");
    assert.equal(goodmanMcSummary.btnStopText, "■");

    await (await expectUnique(browser.page, "#cfg-n")).fill("50");
    await (await expectUnique(browser.page, "#cfg-tmax")).fill("3");
    await (await expectUnique(browser.page, "#cfg-dt")).fill("1");
    await (await expectUnique(browser.page, "#btn-run")).click();
    await waitForText(browser.page, "#prog-lbl", text => text.includes("Complete"));

    await (await expectUnique(browser.page, '.tbw[data-win="cdf"]')).click();
    await (await expectUnique(browser.page, '.tbw[data-win="stats"]')).click();
    await (await expectUnique(browser.page, '.tbw[data-win="anova"]')).click();
    const goodmanWindowSummary = await browser.page.evaluate(() => ({
      cdfVisible: getComputedStyle(document.getElementById("fw-cdf")).display,
      statsVisible: getComputedStyle(document.getElementById("fw-stats")).display,
      anovaVisible: getComputedStyle(document.getElementById("fw-anova")).display,
      cdfTitle: document.querySelector("#fw-cdf .fw-title")?.textContent?.trim(),
      statsRows: document.querySelectorAll("#fwb-stats .stbl tr").length,
      anovaText: document.getElementById("fwb-anova")?.textContent?.replace(/\s+/g, " ").trim()
    }));
    assert.equal(goodmanWindowSummary.cdfVisible, "flex");
    assert.equal(goodmanWindowSummary.statsVisible, "flex");
    assert.equal(goodmanWindowSummary.anovaVisible, "flex");
    assert.match(goodmanWindowSummary.cdfTitle, /Failure CDF/);
    assert.equal(goodmanWindowSummary.statsRows > 1, true);
    assert.equal(goodmanWindowSummary.anovaText.length > 0, true);

    await (await expectUnique(browser.page, "#tb-brand")).click();
    await browser.page.waitForURL(/\/engentus\/home$/);
    await (await expectUnique(browser.page, '[data-shell-nav-href="/engentus/mill-charge"]')).click();
    await browser.page.waitForURL(/\/engentus\/mill-charge$/);
    await browser.page.locator("#view-mill").waitFor();
    await browser.page.locator("#mill-sb-scroll .ssec-title").first().waitFor();
    await browser.page.locator("#mill-metrics-panel .mill-metric-row").first().waitFor();

    await (await expectUnique(browser.page, "#tb-brand")).click();
    await browser.page.waitForURL(/\/engentus\/home$/);
    await (await expectUnique(browser.page, '[data-shell-nav-href="/engentus/mill-force"]')).click();
    await browser.page.waitForURL(/\/engentus\/mill-force$/);
    await browser.page.locator("#view-mill-force").waitFor();
    await browser.page.locator("#mill-force-sb-scroll .mill-force-pill").first().waitFor();
    await browser.page.locator("#mill-force-results-sec .mill-force-result-row").first().waitFor();
    assert.equal(await browser.page.locator("#mill-force-svg-cross[data-mount-mode=\"mounted-panel\"]").count(), 1);
    assert.equal(await browser.page.locator("#mill-force-svg-force[data-mount-mode=\"mounted-panel\"]").count(), 1);
    assert.equal(await browser.page.locator("#mill-force-svg-rose[data-mount-mode=\"mounted-panel\"]").count(), 1);
    assert.equal(await browser.page.locator("#mill-force-mc-canvas").count(), 1);
    assert.equal(await browser.page.locator("iframe[data-mount-mode=\"iframe\"]").count(), 0);
    const millForceSummary = await browser.page.evaluate(() => ({
      resultsText: document.getElementById("mill-force-results-sec")?.textContent?.replace(/\s+/g, " ").trim(),
      activeTab: document.querySelector("#mill-force-chart-tabs .mill-force-cht-tab.active")?.textContent?.trim()
    }));
    assert.match(millForceSummary.resultsText, /γ \(fill\)/);
    assert.match(millForceSummary.resultsText, /φ \(shoulder\)/);
    assert.match(millForceSummary.resultsText, /φ' \(toe\)/);
    assert.match(millForceSummary.resultsText, /ω/);
    assert.match(millForceSummary.resultsText, /ρ charge/);
    assert.equal(millForceSummary.activeTab, "Cross-section");

    await browser.page.getByRole("button", { name: "Force vs Angle" }).click();
    const forceAngleLabels = await browser.page.evaluate(() => ({
      activeTab: document.querySelector("#mill-force-chart-tabs .mill-force-cht-tab.active")?.textContent?.trim(),
      forceDisplay: getComputedStyle(document.getElementById("mill-force-svg-force")).display,
      roseDisplay: getComputedStyle(document.getElementById("mill-force-svg-rose")).display,
      labels: [...document.querySelectorAll("#mill-force-svg-force text")].map(node => node.textContent?.trim()).filter(Boolean)
    }));
    assert.equal(forceAngleLabels.activeTab, "Force vs Angle");
    assert.equal(forceAngleLabels.forceDisplay, "block");
    assert.equal(forceAngleLabels.roseDisplay, "none");
    assert.equal(forceAngleLabels.labels.includes("θ (°, standard — 0° = East)"), true);

    await browser.page.getByRole("button", { name: "Force Rose" }).click();
    const forceRoseLabels = await browser.page.evaluate(() => ({
      activeTab: document.querySelector("#mill-force-chart-tabs .mill-force-cht-tab.active")?.textContent?.trim(),
      forceDisplay: getComputedStyle(document.getElementById("mill-force-svg-force")).display,
      roseDisplay: getComputedStyle(document.getElementById("mill-force-svg-rose")).display,
      labels: [...document.querySelectorAll("#mill-force-svg-rose text")].map(node => node.textContent?.trim()).filter(Boolean)
    }));
    assert.equal(forceRoseLabels.activeTab, "Force Rose");
    assert.equal(forceRoseLabels.forceDisplay, "none");
    assert.equal(forceRoseLabels.roseDisplay, "block");
    assert.equal(forceRoseLabels.labels.includes("0°"), true);
    assert.equal(forceRoseLabels.labels.includes("90°"), true);
    assert.equal(forceRoseLabels.labels.includes("180°"), true);
    assert.equal(forceRoseLabels.labels.includes("270°"), true);

    await browser.page.getByRole("button", { name: "Monte Carlo" }).click();
    await (await expectUnique(browser.page, "#mill-force-mc-n")).fill("50");
    await (await expectUnique(browser.page, "#mill-force-mc-run")).click();
    const millForceMcStatus = await waitForText(browser.page, "#mill-force-mc-status", text => text.includes("samples computed"));
    assert.match(millForceMcStatus, /samples computed/);
    const millForceMcSummary = await browser.page.evaluate(() => ({
      mode: document.querySelector("#mill-force-sb-scroll .mill-force-pill.active")?.textContent?.trim(),
      mcBody: getComputedStyle(document.getElementById("mill-force-mc-body")).display,
      clearDisabled: document.getElementById("mill-force-mc-clear")?.disabled
    }));
    assert.equal(millForceMcSummary.mode, "Monte Carlo");
    assert.equal(millForceMcSummary.mcBody, "block");
    assert.equal(millForceMcSummary.clearDisabled, false);

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
