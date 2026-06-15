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

async function captureShell(page, routeKind) {
  return page.evaluate(kind => {
    const normalizeText = value => String(value ?? "").replace(/\s+/g, " ").trim();
    const visible = selector => {
      const node = document.querySelector(selector);
      return Boolean(node) && getComputedStyle(node).display !== "none";
    };
    const textList = selector => [...document.querySelectorAll(selector)].map(node => normalizeText(node.textContent)).filter(Boolean);
    const pickText = selector => normalizeText(document.querySelector(selector)?.textContent);

    if (kind === "login") {
      return {
        title: pickText(".auth-form-title"),
        subtitle: pickText(".auth-form-sub"),
        heroTitle: normalizeText(document.querySelector(".auth-tagline")?.innerText),
        heroBody: normalizeText(document.querySelector(".auth-sub")?.innerText),
        bullets: textList("#view-login .auth-bullet"),
        primaryAction: pickText("#view-login .auth-submit")
      };
    }

    if (kind === "home") {
      return {
        heading: pickText("#view-home h2"),
        subtitle: pickText("#view-home .mod-area-meta p"),
        activeCards: textList("#view-home .mod-card.active .mod-name"),
        lockedCount: document.querySelectorAll("#view-home .mod-card.locked").length,
        newsTitles: textList("#view-home .news-item .ni-title")
      };
    }

    if (kind === "goodman") {
      return {
        visible: visible("#view-goodman"),
        sectionTitles: textList("#view-goodman .ssec-title").map(text => text.replace(/\+\s*New$/, "").trim()),
        modes: textList("#tb-goodman-tools .mode-btn"),
        actions: textList("#tb-goodman-tools .tbw"),
        chartMount: visible("#chart-svg")
      };
    }

    if (kind === "mill-charge") {
      return {
        visible: visible("#view-mill"),
        metricsHeader: pickText("#mill-metrics-hdr"),
        chartMount: visible("#mill-canvas")
      };
    }

    if (kind === "mill-force") {
      return {
        visible: visible("#view-mill-force"),
        tabs: textList("#mill-force-chart-tabs .mill-force-cht-tab"),
        activeTab: pickText("#mill-force-chart-tabs .mill-force-cht-tab.active"),
        crossVisible: visible("#mill-force-svg-cross"),
        forceVisible: visible("#mill-force-svg-force"),
        roseVisible: visible("#mill-force-svg-rose")
      };
    }

    return {
      title: pickText("#view-signout .auth-so-title"),
      subtitle: pickText("#view-signout .auth-so-sub"),
      primaryAction: pickText("#view-signout .auth-submit")
    };
  }, routeKind);
}

test("reference and DESIRE shells stay aligned across the supported browser route flow", async () => {
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
    for (const routeKind of ["login", "home", "goodman", "mill-charge", "mill-force", "signout"]) {
      await openReferenceRoute(referencePage, referenceServer.url, routeKind);
      await openTargetRoute(targetPage, desireServer.url, routeKind);
      assert.deepEqual(await captureShell(targetPage, routeKind), await captureShell(referencePage, routeKind));
    }

    expectNoRuntimeErrors(browser.runtime);
    expectNoRuntimeErrors(referenceRuntime);
  } finally {
    await referencePage.close();
    await browser.close();
    await referenceServer.close();
    await desireServer.close();
  }
});
