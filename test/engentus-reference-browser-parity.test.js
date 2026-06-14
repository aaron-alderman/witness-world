import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import {
  createRuntimeCollector,
  expectNoRuntimeErrors,
  launchBrowser,
  startUiServer
} from "./support/harness.js";

function normalizeText(value) {
  return String(value ?? "")
    .replaceAll("Â°", "°")
    .replaceAll("â€”", "—")
    .replaceAll("â€“", "–")
    .replaceAll("â†’", "→")
    .replaceAll("Î¸", "θ")
    .replaceAll("Ï†", "φ")
    .replaceAll("â„¢", "™")
    .replaceAll("Â©", "©")
    .replace(/\s+/g, " ")
    .trim();
}

function staticMime(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".ico": return "image/x-icon";
    default: return "application/octet-stream";
  }
}

async function startStaticServer(rootDir) {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = path.resolve(root, `.${pathname}`);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.setHeader("Content-Type", staticMime(filePath));
    fs.createReadStream(filePath).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise(resolve => server.close(resolve));
    }
  };
}

async function waitForVisible(page, selector) {
  await page.waitForFunction(target => {
    const node = document.querySelector(target);
    return Boolean(node) && getComputedStyle(node).display !== "none";
  }, selector);
}

async function openTargetRoute(page, baseUrl, routeKind) {
  const routeMap = {
    login: `${baseUrl}/`,
    home: `${baseUrl}/engentus/home`,
    goodman: `${baseUrl}/engentus/goodman`,
    "mill-charge": `${baseUrl}/engentus/mill-charge`,
    "mill-force": `${baseUrl}/engentus/mill-force`,
    signout: `${baseUrl}/engentus/signout`
  };
  const selectorMap = {
    login: "#view-login",
    home: "#view-home",
    goodman: "#view-goodman",
    "mill-charge": "#view-mill",
    "mill-force": "#view-mill-force",
    signout: "#view-signout"
  };
  await page.goto(routeMap[routeKind], { waitUntil: "domcontentloaded" });
  await waitForVisible(page, selectorMap[routeKind]);
}

async function openReferenceRoute(page, baseUrl, routeKind) {
  const routeMap = {
    login: `${baseUrl}/#login`,
    home: `${baseUrl}/#home`,
    goodman: `${baseUrl}/#goodman`,
    "mill-charge": `${baseUrl}/#mill`,
    "mill-force": `${baseUrl}/#mill-force`,
    signout: `${baseUrl}/#signout`
  };
  const selectorMap = {
    login: "#view-login",
    home: "#view-home",
    goodman: "#view-goodman",
    "mill-charge": "#view-mill",
    "mill-force": "#view-mill-force",
    signout: "#view-signout"
  };
  await page.goto(routeMap[routeKind], { waitUntil: "domcontentloaded" });
  await waitForVisible(page, selectorMap[routeKind]);
}

async function waitForText(page, selector, predicate, { timeoutMs = 15000, intervalMs = 100 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const text = normalizeText(await page.locator(selector).textContent());
    if (predicate(text)) return text;
    await page.waitForTimeout(intervalMs);
  }
  assert.fail(`timed out waiting for ${selector}`);
}

async function setInputValue(page, selector, value) {
  await page.locator(selector).evaluate((node, nextValue) => {
    node.value = nextValue;
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, String(value));
}

async function captureLogin(page) {
  return page.evaluate(() => ({
    title: document.querySelector(".auth-form-title")?.textContent?.trim(),
    subtitle: document.querySelector(".auth-form-sub")?.textContent?.trim(),
    heroTitle: document.querySelector(".auth-tagline")?.innerText?.replace(/\s+/g, " ").trim(),
    heroBody: document.querySelector(".auth-sub")?.innerText?.replace(/\s+/g, " ").trim(),
    bulletCount: document.querySelectorAll("#view-login .auth-bullet").length,
    footer: document.querySelector("#view-login .auth-footer")?.textContent?.trim()
  }));
}

async function captureHome(page) {
  return page.evaluate(() => ({
    activeCards: [...document.querySelectorAll("#view-home .mod-card.active .mod-name")].map(node => node.textContent?.trim()),
    lockedCount: document.querySelectorAll("#view-home .mod-card.locked").length,
    newsTitles: [...document.querySelectorAll("#view-home .news-item .ni-title")].map(node => node.textContent?.trim()),
    pill: document.querySelector("#view-home .mill-pill")?.textContent?.replace(/\s+/g, " ").trim()
  }));
}

async function captureGoodman(page) {
  return page.evaluate(() => ({
    mode: document.querySelector("#tb-goodman-tools .mode-btn.on")?.textContent?.trim(),
    modes: [...document.querySelectorAll("#tb-goodman-tools .mode-btn")].map(node => node.textContent?.trim()),
    actions: [...document.querySelectorAll("#tb-goodman-tools .tbw")].map(node => node.textContent?.trim()),
    sectionDisplays: ["sec-static", "sec-mc", "sec-run", "sec-edit"].map(id => [id, getComputedStyle(document.getElementById(id)).display]),
    sectionTitles: [...document.querySelectorAll("#view-goodman .ssec-title")].map(node => {
      const clone = node.cloneNode(true);
      clone.querySelectorAll("button,a").forEach(child => child.remove());
      return clone.textContent?.trim();
    }).filter(Boolean),
    simRows: document.querySelectorAll("#sim-list .sim-row").length,
    activeSimIndex: [...document.querySelectorAll("#sim-list .sim-row")].findIndex(node => node.classList.contains("on")),
    progress: document.getElementById("prog-lbl")?.textContent?.trim(),
    runLabels: [
      document.getElementById("btn-run")?.textContent?.trim(),
      document.getElementById("btn-pause")?.textContent?.trim(),
      document.getElementById("btn-stop")?.textContent?.trim()
    ],
    failBadge: document.getElementById("fail-badge")?.textContent?.trim() ?? ""
  }));
}

async function captureGoodmanEdit(page) {
  return page.evaluate(() => ({
    mode: document.querySelector("#tb-goodman-tools .mode-btn.on")?.textContent?.trim(),
    sectionDisplays: ["sec-static", "sec-mc", "sec-run", "sec-edit"].map(id => [id, getComputedStyle(document.getElementById(id)).display]),
    editText: document.getElementById("edit-panel-html")?.textContent?.replace(/\s+/g, " ").trim() ?? ""
  }));
}

async function captureGoodmanWindows(page) {
  return page.evaluate(() => ({
    cdfTitle: document.querySelector("#fw-cdf .fw-title")?.textContent?.trim(),
    statsText: document.getElementById("fwb-stats")?.textContent?.replace(/\s+/g, " ").trim(),
    anovaText: document.getElementById("fwb-anova")?.textContent?.replace(/\s+/g, " ").trim(),
    statsRows: document.querySelectorAll("#fwb-stats .stbl tr").length,
    cdfVisible: getComputedStyle(document.getElementById("fw-cdf")).display,
    statsVisible: getComputedStyle(document.getElementById("fw-stats")).display,
    anovaVisible: getComputedStyle(document.getElementById("fw-anova")).display
  }));
}

async function captureMillCharge(page) {
  return page.evaluate(() => ({
    metricsHeader: document.getElementById("mill-metrics-hdr")?.textContent?.trim(),
    metricRows: document.querySelectorAll("#mill-metrics-panel .mill-metric-row").length,
    sectionTitles: [...document.querySelectorAll("#mill-sb-scroll .ssec-title")].map(node => node.textContent?.trim())
  }));
}

async function captureMillChargeDetails(page) {
  return page.evaluate(() => ({
    presetLabels: [...document.querySelectorAll("#mill-preset-html .mill-preset-btn")].map(node => node.textContent?.trim()),
    paramValues: [...document.querySelectorAll("#mill-params-html .pval")].map(node => node.textContent?.trim()),
    metricValues: [...document.querySelectorAll("#mill-metrics-panel .mill-metric-row")].map(node => node.textContent?.replace(/\s+/g, " ").trim()),
    regimeBadge: document.querySelector("#mill-metrics-panel .mill-regime-badge")?.textContent?.trim() ?? ""
  }));
}

async function captureMillForce(page) {
  return page.evaluate(() => ({
    mode: document.querySelector("#mill-force-sb-scroll .mill-force-pill.active")?.textContent?.trim(),
    tabs: [...document.querySelectorAll("#mill-force-chart-tabs .mill-force-cht-tab")].map(node => node.textContent?.trim()),
    activeTab: document.querySelector("#mill-force-chart-tabs .mill-force-cht-tab.active")?.textContent?.trim(),
    resultsText: document.getElementById("mill-force-results-sec")?.textContent?.replace(/\s+/g, " ").trim(),
    mcStatus: document.getElementById("mill-force-mc-status")?.textContent?.trim(),
    mcBody: (() => {
      const node = document.getElementById("mill-force-mc-body");
      return node ? getComputedStyle(node).display : null;
    })()
  }));
}

async function captureMillForceDetails(page) {
  return page.evaluate(() => ({
    sectionTitles: [...document.querySelectorAll("#mill-force-sb-scroll .ssec-title")].map(node => node.textContent?.replace(/\s+/g, " ").trim()),
    modePills: [...document.querySelectorAll("#mill-force-sb-scroll .mill-force-pill")].map(node => node.textContent?.trim()),
    valueLabels: [...document.querySelectorAll("#mill-force-sb-scroll [data-val]")].map(node => node.textContent?.trim()),
    resultRows: [...document.querySelectorAll("#mill-force-results-sec .mill-force-result-row")].map(node => node.textContent?.replace(/\s+/g, " ").trim()),
    resultDiffs: [...document.querySelectorAll("#mill-force-results-sec .mill-force-rd")].map(node => node.textContent?.trim()),
    mcStatus: document.getElementById("mill-force-mc-status")?.textContent?.trim() ?? ""
  }));
}

async function captureVisibleTextList(page, selector) {
  return (await page.evaluate(target => (
    [...document.querySelectorAll(target)]
      .map(node => node.textContent?.trim())
      .filter(Boolean)
  ), selector)).map(normalizeText);
}

async function captureSvgStructure(page, selector) {
  return page.evaluate(target => {
    const node = document.querySelector(target);
    if (!node) return null;
    const tags = {};
    for (const child of node.querySelectorAll("*")) {
      const tag = child.tagName.toLowerCase();
      tags[tag] = (tags[tag] ?? 0) + 1;
    }
    return {
      childElementCount: node.childElementCount,
      tags
    };
  }, selector);
}

test("reference and DESIRE Engentus frontends stay aligned across live module flows", async () => {
  const desireServer = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus/app.wtoml"),
    serverRunnerId: "engentus_server"
  });
  const referenceServer = await startStaticServer(path.join(process.cwd(), "example-ports", "engentus"));
  const browser = await launchBrowser();
  const targetPage = browser.page;
  const referencePage = await browser.context.newPage();
  const referenceRuntime = createRuntimeCollector(referencePage);
  try {
    await openReferenceRoute(referencePage, referenceServer.url, "login");
    await openTargetRoute(targetPage, desireServer.url, "login");
    assert.deepEqual(await captureLogin(targetPage), await captureLogin(referencePage));

    await referencePage.locator("#view-login .auth-submit").click();
    await waitForVisible(referencePage, "#view-home");
    await targetPage.locator('button.auth-submit[data-shell-nav-href="/engentus/home"]').click();
    await targetPage.waitForURL(/\/engentus\/home$/);
    await waitForVisible(targetPage, "#view-home");
    assert.deepEqual(await captureHome(targetPage), await captureHome(referencePage));

    await openReferenceRoute(referencePage, referenceServer.url, "goodman");
    await openTargetRoute(targetPage, desireServer.url, "goodman");
    assert.deepEqual(await captureGoodman(targetPage), await captureGoodman(referencePage));
    await referencePage.waitForFunction(() => Boolean(document.querySelector("#g-bands")));
    await targetPage.waitForFunction(() => Boolean(document.querySelector("#g-bands")));
    assert.deepEqual(await captureSvgStructure(targetPage, "#chart-svg"), await captureSvgStructure(referencePage, "#chart-svg"));

    for (const page of [referencePage, targetPage]) {
      await page.getByRole("button", { name: "✏ Edit" }).click();
    }
    assert.deepEqual(await captureGoodmanEdit(targetPage), await captureGoodmanEdit(referencePage));

    for (const page of [referencePage, targetPage]) {
      await page.getByRole("button", { name: "Static" }).click();
    }
    assert.deepEqual(await captureGoodman(targetPage), await captureGoodman(referencePage));

    await waitForVisible(referencePage, "#static-save-sim-btn");
    await waitForVisible(targetPage, "#static-save-sim-btn");
    await referencePage.locator("#static-save-sim-btn").evaluate(node => node.click());
    await targetPage.locator("#static-save-sim-btn").evaluate(node => node.click());
    await referencePage.waitForFunction(() => document.querySelectorAll("#sim-list .sim-row").length > 0);
    await targetPage.waitForFunction(() => document.querySelectorAll("#sim-list .sim-row").length > 0);
    assert.deepEqual(await captureGoodman(targetPage), await captureGoodman(referencePage));

    for (const page of [referencePage, targetPage]) {
      await setInputValue(page, "#cfg-n", "50");
      await setInputValue(page, "#cfg-tmax", "3");
      await setInputValue(page, "#cfg-dt", "1");
      await page.locator("#btn-run").evaluate(node => node.click());
    }
    await waitForText(referencePage, "#prog-lbl", text => text.includes("Complete"));
    await waitForText(targetPage, "#prog-lbl", text => text.includes("Complete"));
    assert.deepEqual(await captureGoodman(targetPage), await captureGoodman(referencePage));

    for (const page of [referencePage, targetPage]) {
      await page.locator('.tbw[data-win="cdf"]').evaluate(node => node.click());
      await page.locator('.tbw[data-win="stats"]').evaluate(node => node.click());
      await page.locator('.tbw[data-win="anova"]').evaluate(node => node.click());
    }
    assert.deepEqual(await captureGoodmanWindows(targetPage), await captureGoodmanWindows(referencePage));

    await openReferenceRoute(referencePage, referenceServer.url, "mill-charge");
    await openTargetRoute(targetPage, desireServer.url, "mill-charge");
    assert.deepEqual(await captureMillCharge(targetPage), await captureMillCharge(referencePage));

    for (const page of [referencePage, targetPage]) {
      await page.getByRole("button", { name: "Dense slurry" }).click();
    }
    assert.deepEqual(await captureMillChargeDetails(targetPage), await captureMillChargeDetails(referencePage));

    await openReferenceRoute(referencePage, referenceServer.url, "mill-force");
    await openTargetRoute(targetPage, desireServer.url, "mill-force");
    await waitForVisible(referencePage, "#mill-force-sb-scroll .mill-force-pill.active");
    await waitForVisible(targetPage, "#mill-force-sb-scroll .mill-force-pill.active");
    await referencePage.waitForFunction(() => document.querySelectorAll("#mill-force-svg-cross *").length > 0);
    await targetPage.waitForFunction(() => document.querySelectorAll("#mill-force-svg-cross *").length > 0);
    assert.deepEqual(await captureMillForce(targetPage), await captureMillForce(referencePage));
    const referenceMillForceBefore = await captureMillForceDetails(referencePage);
    const targetMillForceBefore = await captureMillForceDetails(targetPage);
    assert.deepEqual(targetMillForceBefore, referenceMillForceBefore);
    assert.deepEqual(await captureSvgStructure(targetPage, "#mill-force-svg-cross"), await captureSvgStructure(referencePage, "#mill-force-svg-cross"));

    for (const page of [referencePage, targetPage]) {
      await setInputValue(page, '.mill-force-slider[data-key="percent_crit"]', "0.8");
    }
    await waitForText(referencePage, "#mill-force-results-sec", text => text !== referenceMillForceBefore.resultRows.join(" "));
    await waitForText(targetPage, "#mill-force-results-sec", text => text !== targetMillForceBefore.resultRows.join(" "));
    assert.deepEqual(await captureMillForceDetails(targetPage), await captureMillForceDetails(referencePage));

    for (const page of [referencePage, targetPage]) {
      await page.getByRole("button", { name: "Force vs Angle" }).click();
    }
    await referencePage.waitForFunction(() => document.querySelectorAll("#mill-force-svg-force text").length > 0);
    await targetPage.waitForFunction(() => document.querySelectorAll("#mill-force-svg-force text").length > 0);
    assert.deepEqual(
      await captureVisibleTextList(targetPage, "#mill-force-svg-force text"),
      await captureVisibleTextList(referencePage, "#mill-force-svg-force text")
    );
    assert.deepEqual(await captureSvgStructure(targetPage, "#mill-force-svg-force"), await captureSvgStructure(referencePage, "#mill-force-svg-force"));

    for (const page of [referencePage, targetPage]) {
      await page.getByRole("button", { name: "Force Rose" }).click();
    }
    await referencePage.waitForFunction(() => document.querySelectorAll("#mill-force-svg-rose text").length > 0);
    await targetPage.waitForFunction(() => document.querySelectorAll("#mill-force-svg-rose text").length > 0);
    assert.deepEqual(
      await captureVisibleTextList(targetPage, "#mill-force-svg-rose text"),
      await captureVisibleTextList(referencePage, "#mill-force-svg-rose text")
    );
    assert.deepEqual(await captureSvgStructure(targetPage, "#mill-force-svg-rose"), await captureSvgStructure(referencePage, "#mill-force-svg-rose"));

    for (const page of [referencePage, targetPage]) {
      await page.getByRole("button", { name: "Monte Carlo" }).click();
      await setInputValue(page, "#mill-force-mc-n", "50");
      await page.locator("#mill-force-mc-run").evaluate(node => node.click());
    }
    await waitForText(referencePage, "#mill-force-mc-status", text => text.includes("samples computed"));
    await waitForText(targetPage, "#mill-force-mc-status", text => text.includes("samples computed"));
    assert.deepEqual(await captureMillForce(targetPage), await captureMillForce(referencePage));

    await openReferenceRoute(referencePage, referenceServer.url, "signout");
    await openTargetRoute(targetPage, desireServer.url, "signout");
    const refSignout = await referencePage.evaluate(() => ({
      title: document.querySelector("#view-signout .auth-so-title")?.textContent?.trim(),
      subtitle: document.querySelector("#view-signout .auth-so-sub")?.textContent?.replace(/\s+/g, " ").trim(),
      action: document.querySelector("#view-signout .auth-submit")?.textContent?.trim()
    }));
    const targetSignout = await targetPage.evaluate(() => ({
      title: document.querySelector("#view-signout .auth-so-title")?.textContent?.trim(),
      subtitle: document.querySelector("#view-signout .auth-so-sub")?.textContent?.replace(/\s+/g, " ").trim(),
      action: document.querySelector("#view-signout .auth-submit")?.textContent?.trim()
    }));
    assert.deepEqual(targetSignout, refSignout);

    expectNoRuntimeErrors(browser.runtime);
    expectNoRuntimeErrors(referenceRuntime);
  } finally {
    await referencePage.close();
    await browser.close();
    await referenceServer.close();
    await desireServer.close();
  }
});
