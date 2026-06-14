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

async function waitForRouteReady(page, routeKind) {
  if (routeKind === "goodman") {
    await page.waitForFunction(() => Boolean(document.querySelector("#g-bands")));
    return;
  }
  if (routeKind === "mill-charge") {
    await page.waitForFunction(() => document.querySelectorAll("#mill-metrics-panel .mill-metric-row").length > 0);
    return;
  }
  if (routeKind === "mill-force") {
    await waitForVisible(page, "#mill-force-sb-scroll .mill-force-pill.active");
    await page.waitForFunction(() => document.querySelectorAll("#mill-force-results-sec .mill-force-result-row").length > 0);
  }
}

async function captureShellSnapshot(page, kind) {
  return page.evaluate(routeKind => {
    const normalizeText = value => String(value ?? "").replace(/\s+/g, " ").trim();
    const visible = selector => {
      const node = document.querySelector(selector);
      return Boolean(node) && getComputedStyle(node).display !== "none";
    };
    const pick = (selector, props, { text = false, width = false, height = false } = {}) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const computed = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      const snapshot = Object.fromEntries(props.map(prop => [prop, computed[prop]]));
      if (text) snapshot.text = normalizeText(node.innerText ?? node.textContent);
      if (width) snapshot.width = Math.round(visibleWidth);
      if (height) snapshot.height = Math.round(visibleHeight);
      return snapshot;
    };
    const pickList = selector => [...document.querySelectorAll(selector)].map(node => normalizeText(node.innerText ?? node.textContent));
    const visibleViews = [
      "#view-login",
      "#view-signout",
      "#view-home",
      "#view-goodman",
      "#view-mill",
      "#view-mill-force"
    ].filter(visible).map(selector => selector.slice(1));

    if (routeKind === "login") {
      return {
        visibleViews,
        bulletCount: document.querySelectorAll("#view-login .auth-bullet").length,
        body: pick("body", ["display", "flexDirection", "overflowX", "overflowY", "fontSize"], { width: true, height: true }),
        authBook: pick("#view-login .auth-book", ["display", "position", "transformOrigin"], { width: true, height: true }),
        tagline: pick("#view-login .auth-tagline", ["fontSize", "lineHeight", "marginBottom", "color"], { text: true }),
        msButton: pick("#view-login .ms-btn", ["backgroundColor", "borderRadius", "fontSize", "paddingTop", "paddingLeft"], { text: true }),
        submit: pick("#view-login .auth-submit", ["backgroundColor", "borderRadius", "fontSize", "paddingTop"], { text: true })
      };
    }

    if (routeKind === "signout") {
      return {
        visibleViews,
        signoutIcon: pick("#view-signout .auth-signout-icon", ["backgroundColor", "borderRadius", "width", "height"], { text: true }),
        title: pick("#view-signout .auth-so-title", ["fontSize", "marginBottom", "textAlign"], { text: true }),
        subtitle: pick("#view-signout .auth-so-sub", ["fontSize", "lineHeight", "textAlign"], { text: true }),
        submit: pick("#view-signout .auth-submit", ["backgroundColor", "borderRadius", "fontSize", "paddingTop"], { text: true })
      };
    }

    if (routeKind === "home") {
      return {
        visibleViews,
        activeCardCount: document.querySelectorAll("#view-home .mod-card.active").length,
        lockedCardCount: document.querySelectorAll("#view-home .mod-card.locked").length,
        newsItemCount: document.querySelectorAll("#view-home .news-item").length,
        toolbar: pick("#tb", ["height", "display", "alignItems", "borderBottomWidth", "borderBottomStyle"], { width: true }),
        brand: pick("#tb-brand", ["minWidth", "paddingLeft", "paddingRight", "gap", "cursor"]),
        newsPanel: pick("#news-panel", ["width", "minWidth", "display", "flexDirection"], { height: true }),
        newsItem: pick("#view-home .news-item", ["paddingTop", "paddingLeft", "borderLeftWidth", "borderLeftStyle", "borderRadius", "cursor"]),
        moduleGrid: pick("#module-grid", ["display", "gridTemplateColumns", "gap"]),
        activeCard: pick("#view-home .mod-card.active", ["minHeight", "paddingTop", "paddingLeft", "borderRadius"], { text: true }),
        lockedCard: pick("#view-home .mod-card.locked", ["opacity"]),
        pill: pick("#view-home .mill-pill", ["display", "fontSize", "borderRadius", "gap"], { text: true })
      };
    }

    if (routeKind === "goodman") {
      return {
        visibleViews,
        sectionCount: document.querySelectorAll("#view-goodman .ssec-title").length,
        toolbarTools: pick("#tb-goodman-tools", ["display", "alignItems"]),
        brand: pick("#tb-brand", ["cursor"]),
        sidebar: pick("#sb", ["width", "minWidth", "display", "flexDirection"], { height: true }),
        sectionTitle: pick("#view-goodman .ssec-title", ["fontSize", "textTransform", "letterSpacing", "display", "justifyContent"]),
        scrubber: pick("#scr", ["display", "height", "gap", "paddingLeft", "marginTop", "borderTopLeftRadius"]),
        playButton: pick("#play-btn", ["width", "height", "borderRadius", "backgroundColor", "fontSize"]),
        chartWrap: pick("#chart-wrap", ["position", "marginTop", "marginLeft", "borderBottomLeftRadius", "backgroundColor"], { width: true, height: true }),
        toolbarModes: pickList("#tb-goodman-tools .mode-btn"),
        toolbarActions: pickList("#tb-goodman-tools .tbw")
      };
    }

    if (routeKind === "mill-charge") {
      return {
        visibleViews,
        brand: pick("#tb-brand", ["cursor"]),
        sidebar: pick("#mill-sb", ["width", "minWidth", "display", "flexDirection"], { height: true }),
        main: pick("#mill-main", ["display", "flexDirection", "backgroundColor"], { width: true, height: true }),
        canvasWrap: pick("#mill-canvas-wrap", ["display", "paddingTop", "paddingLeft"], { width: true, height: true }),
        metrics: pick("#mill-metrics", ["width", "minWidth", "display", "flexDirection"], { height: true }),
        metricsHeader: pick("#mill-metrics-hdr", ["fontSize", "textTransform", "letterSpacing", "borderBottomWidth"], { text: true })
      };
    }

    return {
      visibleViews,
      brand: pick("#tb-brand", ["cursor"]),
      sidebar: pick("#mill-force-sb", ["width", "minWidth", "display", "flexDirection"], { height: true }),
      tabs: pickList("#mill-force-chart-tabs .mill-force-cht-tab"),
      tabsWrap: pick("#mill-force-chart-tabs", ["display", "gap", "paddingTop", "paddingLeft", "backgroundColor", "borderBottomWidth"]),
      activeTab: pick("#mill-force-chart-tabs .mill-force-cht-tab.active", ["backgroundColor", "color", "borderTopWidth", "borderLeftWidth"], { text: true }),
      chartWrap: pick("#mill-force-chart-wrap", ["position", "marginTop", "marginLeft", "borderTopLeftRadius", "backgroundColor"], { width: true, height: true }),
      hiddenForce: pick("#mill-force-svg-force", ["display"]),
      hiddenRose: pick("#mill-force-svg-rose", ["display"])
    };
  }, kind);
}

test("reference and DESIRE shell layouts stay aligned across the main routes", async () => {
  const desireServer = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus/app.wtoml"),
    serverRunnerId: "engentus_server"
  });
  const referenceServer = await startStaticServer(path.join(process.cwd(), "example-ports", "engentus"));
  const browser = await launchBrowser();
  const referencePage = await browser.context.newPage();
  const referenceRuntime = createRuntimeCollector(referencePage);
  try {
    for (const routeKind of ["login", "home", "goodman", "mill-charge", "mill-force", "signout"]) {
      await openReferenceRoute(referencePage, referenceServer.url, routeKind);
      await openTargetRoute(browser.page, desireServer.url, routeKind);
      await waitForRouteReady(referencePage, routeKind);
      await waitForRouteReady(browser.page, routeKind);
      assert.deepEqual(
        await captureShellSnapshot(browser.page, routeKind),
        await captureShellSnapshot(referencePage, routeKind)
      );
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
