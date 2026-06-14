import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  expectNoRuntimeErrors,
  launchBrowser,
  startUiServer
} from "./support/harness.js";

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
      const snapshot = Object.fromEntries(props.map(prop => [prop, computed[prop]]));
      if (text) snapshot.text = normalizeText(node.textContent);
      if (width) snapshot.width = Math.round(rect.width);
      if (height) snapshot.height = Math.round(rect.height);
      return snapshot;
    };
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
        tagline: pick("#view-login .auth-tagline", ["fontSize", "lineHeight", "marginBottom", "color"]),
        msButton: pick("#view-login .ms-btn", ["backgroundColor", "borderRadius", "fontSize", "paddingTop", "paddingLeft"]),
        submit: pick("#view-login .auth-submit", ["backgroundColor", "borderRadius", "fontSize", "paddingTop"])
      };
    }

    if (routeKind === "signout") {
      return {
        visibleViews,
        signoutIcon: pick("#view-signout .auth-signout-icon", ["backgroundColor", "borderRadius", "width", "height"], { text: true }),
        title: pick("#view-signout .auth-so-title", ["fontSize", "marginBottom", "textAlign"]),
        submit: pick("#view-signout .auth-submit", ["backgroundColor", "borderRadius", "fontSize", "paddingTop"])
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
        newsPanel: pick("#news-panel", ["width", "minWidth", "display", "flexDirection"]),
        newsItem: pick("#view-home .news-item", ["paddingTop", "paddingLeft", "borderLeftWidth", "borderLeftStyle", "borderRadius", "cursor"]),
        moduleGrid: pick("#module-grid", ["display", "gridTemplateColumns", "gap"]),
        activeCard: pick("#view-home .mod-card.active", ["minHeight", "paddingTop", "paddingLeft", "borderRadius"]),
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
        sidebar: pick("#sb", ["width", "minWidth", "display", "flexDirection"]),
        sectionTitle: pick("#view-goodman .ssec-title", ["fontSize", "textTransform", "letterSpacing", "display", "justifyContent"]),
        scrubber: pick("#scr", ["display", "height", "gap", "paddingLeft", "marginTop", "borderTopLeftRadius"]),
        playButton: pick("#play-btn", ["width", "height", "borderRadius", "backgroundColor", "fontSize"]),
        chartWrap: pick("#chart-wrap", ["position", "marginTop", "marginLeft", "borderBottomLeftRadius", "backgroundColor"], { height: true })
      };
    }

    if (routeKind === "mill-charge") {
      return {
        visibleViews,
        brand: pick("#tb-brand", ["cursor"]),
        sidebar: pick("#mill-sb", ["width", "minWidth", "display", "flexDirection"]),
        main: pick("#mill-main", ["display", "flexDirection", "backgroundColor"]),
        canvasWrap: pick("#mill-canvas-wrap", ["display", "paddingTop", "paddingLeft"]),
        metrics: pick("#mill-metrics", ["width", "minWidth", "display", "flexDirection"]),
        metricsHeader: pick("#mill-metrics-hdr", ["fontSize", "textTransform", "letterSpacing", "borderBottomWidth"], { text: true })
      };
    }

    return {
      visibleViews,
      brand: pick("#tb-brand", ["cursor"]),
      sidebar: pick("#mill-force-sb", ["width", "minWidth", "display", "flexDirection"]),
      tabs: [...document.querySelectorAll("#mill-force-chart-tabs .mill-force-cht-tab")].map(node => normalizeText(node.textContent)),
      tabsWrap: pick("#mill-force-chart-tabs", ["display", "gap", "paddingTop", "paddingLeft", "backgroundColor", "borderBottomWidth"]),
      activeTab: pick("#mill-force-chart-tabs .mill-force-cht-tab.active", ["backgroundColor", "color", "borderTopWidth", "borderLeftWidth"], { text: true }),
      chartWrap: pick("#mill-force-chart-wrap", ["position", "marginTop", "marginLeft", "borderTopLeftRadius", "backgroundColor"], { height: true }),
      hiddenForce: pick("#mill-force-svg-force", ["display"]),
      hiddenRose: pick("#mill-force-svg-rose", ["display"])
    };
  }, kind);
}

async function openShellRoute(page, baseUrl, routeKind) {
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
  await page.waitForFunction(selector => {
    const node = document.querySelector(selector);
    return Boolean(node) && getComputedStyle(node).display !== "none";
  }, selectorMap[routeKind]);
}

function assertSubset(actual, expected) {
  assert.equal(actual != null, true, "expected value to be present");
  for (const [key, value] of Object.entries(expected)) {
    assert.deepEqual(actual[key], value, `unexpected ${key}`);
  }
}

function assertShellSnapshot(routeKind, snapshot) {
  if (routeKind === "login") {
    assert.deepEqual(snapshot.visibleViews, ["view-login"]);
    assert.equal(snapshot.bulletCount, 4);
    assertSubset(snapshot.body, {
      display: "flex",
      flexDirection: "column",
      overflowX: "hidden",
      overflowY: "hidden",
      fontSize: "12.5px"
    });
    assertSubset(snapshot.authBook, {
      display: "flex",
      position: "relative"
    });
    assertSubset(snapshot.msButton, {
      backgroundColor: "rgb(47, 47, 47)",
      borderRadius: "6px"
    });
    assertSubset(snapshot.submit, {
      backgroundColor: "rgb(44, 60, 99)",
      borderRadius: "6px"
    });
    return;
  }

  if (routeKind === "signout") {
    assert.deepEqual(snapshot.visibleViews, ["view-signout"]);
    assertSubset(snapshot.title, {
      fontSize: "21px",
      textAlign: "center"
    });
    assertSubset(snapshot.submit, {
      backgroundColor: "rgb(44, 60, 99)",
      borderRadius: "6px"
    });
    return;
  }

  if (routeKind === "home") {
    assert.deepEqual(snapshot.visibleViews, ["view-home"]);
    assert.equal(snapshot.activeCardCount, 3);
    assert.equal(snapshot.lockedCardCount, 15);
    assert.equal(snapshot.newsItemCount, 7);
    assertSubset(snapshot.toolbar, {
      display: "flex",
      alignItems: "center",
      borderBottomWidth: "1px",
      borderBottomStyle: "solid"
    });
    assertSubset(snapshot.brand, {
      minWidth: "284px",
      paddingLeft: "14px",
      paddingRight: "14px",
      gap: "8px",
      cursor: "auto"
    });
    assertSubset(snapshot.newsPanel, {
      width: "284px",
      minWidth: "284px",
      display: "flex",
      flexDirection: "column"
    });
    assertSubset(snapshot.newsItem, {
      paddingTop: "9px",
      paddingLeft: "10px",
      borderLeftWidth: "3px",
      borderLeftStyle: "solid",
      borderRadius: "6px",
      cursor: "pointer"
    });
    assertSubset(snapshot.moduleGrid, {
      display: "grid",
      gap: "12px"
    });
    assertSubset(snapshot.activeCard, {
      minHeight: "148px",
      paddingTop: "16px",
      paddingLeft: "14px",
      borderRadius: "10px"
    });
    assertSubset(snapshot.lockedCard, {
      opacity: "0.35"
    });
    return;
  }

  if (routeKind === "goodman") {
    assert.deepEqual(snapshot.visibleViews, ["view-goodman"]);
    assert.equal(snapshot.sectionCount, 6);
    assertSubset(snapshot.toolbarTools, {
      display: "flex",
      alignItems: "center"
    });
    assertSubset(snapshot.brand, {
      cursor: "pointer"
    });
    assertSubset(snapshot.sidebar, {
      width: "284px",
      minWidth: "284px",
      display: "flex",
      flexDirection: "column"
    });
    assertSubset(snapshot.sectionTitle, {
      fontSize: "9.5px",
      textTransform: "uppercase",
      display: "flex",
      justifyContent: "space-between"
    });
    assertSubset(snapshot.scrubber, {
      display: "none"
    });
    assertSubset(snapshot.playButton, {
      width: "26px",
      height: "26px",
      borderRadius: "50%",
      backgroundColor: "rgb(140, 196, 212)",
      fontSize: "11px"
    });
    assertSubset(snapshot.chartWrap, {
      position: "relative",
      backgroundColor: "rgb(255, 255, 255)"
    });
    assert.equal(snapshot.chartWrap.height > 400, true);
    return;
  }

  if (routeKind === "mill-charge") {
    assert.deepEqual(snapshot.visibleViews, ["view-mill"]);
    assertSubset(snapshot.brand, {
      cursor: "pointer"
    });
    assertSubset(snapshot.sidebar, {
      width: "284px",
      minWidth: "284px",
      display: "flex",
      flexDirection: "column"
    });
    assertSubset(snapshot.main, {
      display: "flex",
      flexDirection: "row",
      backgroundColor: "rgb(44, 60, 99)"
    });
    assertSubset(snapshot.canvasWrap, {
      display: "flex",
      paddingTop: "16px",
      paddingLeft: "16px"
    });
    assertSubset(snapshot.metrics, {
      width: "190px",
      minWidth: "190px",
      display: "flex",
      flexDirection: "column"
    });
    assertSubset(snapshot.metricsHeader, {
      fontSize: "9.5px",
      textTransform: "uppercase",
      letterSpacing: "0.76px",
      borderBottomWidth: "1px",
      text: "Metrics"
    });
    return;
  }

  assert.deepEqual(snapshot.visibleViews, ["view-mill-force"]);
  assertSubset(snapshot.brand, {
    cursor: "pointer"
  });
  assertSubset(snapshot.sidebar, {
    width: "284px",
    display: "flex",
    flexDirection: "column"
  });
  assert.deepEqual(snapshot.tabs, ["Cross-section", "Force vs Angle", "Force Rose"]);
  assertSubset(snapshot.tabsWrap, {
    display: "flex",
    gap: "0px",
    paddingTop: "8px",
    paddingLeft: "12px",
    backgroundColor: "rgb(52, 76, 108)",
    borderBottomWidth: "1px"
  });
  assertSubset(snapshot.activeTab, {
    color: "rgb(140, 196, 212)",
    borderTopWidth: "1px",
    borderLeftWidth: "1px",
    text: "Cross-section"
  });
  assertSubset(snapshot.chartWrap, {
    position: "relative",
    backgroundColor: "rgb(44, 60, 99)"
  });
  assert.equal(snapshot.chartWrap.height > 400, true);
  assertSubset(snapshot.hiddenForce, { display: "none" });
  assertSubset(snapshot.hiddenRose, { display: "none" });
}

test("browser-level shell snapshots stay aligned with the authored Engentus presentation contract", async () => {
  const desireServer = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus/app.wtoml"),
    serverRunnerId: "engentus_server"
  });
  const browser = await launchBrowser();
  try {
    for (const routeKind of ["login", "home", "goodman", "mill-charge", "mill-force", "signout"]) {
      await openShellRoute(browser.page, desireServer.url, routeKind);
      assertShellSnapshot(routeKind, await captureShellSnapshot(browser.page, routeKind));
    }

    expectNoRuntimeErrors(browser.runtime);
  } finally {
    await browser.close();
    await desireServer.close();
  }
});
