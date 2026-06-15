import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { launchBrowser, startUiServer } from "./support/harness.js";

function sliderRow(page, label) {
  return page.locator(".prow").filter({ hasText: label });
}

test("Engentus login click dispatches the authored process rule through the generic surface runtime", { timeout: 45000 }, async () => {
  const server = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus", "app.wtoml"),
    serverRunnerId: "engentus_server",
    devMode: false
  });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/login`, { waitUntil: "domcontentloaded" });
    assert.equal(await page.locator("[data-action]").count(), 0);
    await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));
    assert.equal(await page.evaluate(() =>
      window.__surfaceInteractionRuntime.processRuntime.value("EngentusShellAuthStatus")
    ), "idle");
    await page.click(".ms-btn");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "pending"
    );
    assert.equal(await page.textContent(".ms-btn span"), "Signing in…");
    assert.equal(await page.evaluate(() =>
      getComputedStyle(document.querySelector(".ms-btn svg")).display
    ), "none");
    assert.equal(await page.textContent("#view-login .auth-submit span"), "Sign in");
    assert.equal(await page.evaluate(() =>
      getComputedStyle(document.querySelector("#view-login .auth-submit"), "::before").content
    ), "none");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "folding"
    );
    await page.waitForTimeout(180);
    assert.notEqual(await page.evaluate(() =>
      getComputedStyle(document.querySelector("#view-login .auth-book")).transform
    ), "none");
    assert.equal(await page.locator("#surface-route-underlay #module-area").count(), 1);
    assert.equal(await page.locator("#view-login .auth-book.folding").count(), 1);
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "signedIn"
    );
    assert.equal(await page.evaluate(() =>
      window.__surfaceInteractionRuntime.processRuntime.value("EngentusShellActiveRoute")
    ), "home");
    assert.equal(new URL(page.url()).pathname, "/engentus/home");
    await page.waitForSelector("#module-area");
    assert.match(await page.textContent("#module-area"), /Analysis Modules/);
    assert.equal(await page.locator("#view-login").count(), 0);
    assert.equal(await page.locator("#surface-route-underlay").count(), 0);
    await page.evaluate(() => {
      window.__surfaceInteractionRuntime.__sameDocumentProbe = "before-back";
    });
    await page.goBack();
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "login"
    );
    assert.equal(await page.evaluate(() =>
      window.__surfaceInteractionRuntime.__sameDocumentProbe
    ), "before-back");
    assert.equal(new URL(page.url()).pathname, "/engentus/login");
    await page.waitForSelector("#view-login");
    assert.equal(await page.locator("#module-area").count(), 0);
    await page.click(".ms-btn");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "home"
    );
    await page.click("#user-prof");
    await page.waitForSelector("#up-menu:not([hidden])");
    assert.deepEqual(await page.evaluate(() =>
      [...document.querySelectorAll("#up-menu .up-mi-icon")].map(node => node.textContent)
    ), ["👤", "⚙", "📋", "🏭", "↩"]);
    await page.click(".up-mi-signout");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "signingOut"
    );
    assert.equal(await page.evaluate(() =>
      window.__surfaceInteractionRuntime.processRuntime.value("EngentusShellActiveRoute")
    ), "signout");
    assert.equal(new URL(page.url()).pathname, "/engentus/signout");
    assert.equal(await page.locator("#surface-route-underlay #module-area").count(), 1);
    assert.equal(await page.locator("#view-signout .auth-book.incoming").count(), 1);
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "signedOut"
    );
    await page.waitForSelector("#view-signout");
    assert.equal(await page.locator("#surface-route-underlay").count(), 0);
    assert.deepEqual(await page.evaluate(() =>
      window.__surfaceInteractionRuntime.processRuntime.trace.map(row => row.kind).slice(0, 6)
    ), [
      "rule.setState",
      "rule.delay",
      "rule.setState",
      "rule.delay",
      "rule.setState",
      "rule.setState"
    ]);
    await page.getByRole("button", { name: "Sign back in" }).click();
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "login"
    );
    assert.equal(await page.evaluate(() =>
      window.__surfaceInteractionRuntime.processRuntime.value("EngentusShellAuthStatus")
    ), "idle");
    assert.equal(new URL(page.url()).pathname, "/engentus/login");
    await page.waitForSelector("#view-login");
    assert.equal(await page.locator("#view-signout").count(), 0);
    assert.equal(await page.locator("#view-signout .auth-book.folding").count(), 0);
    assert.equal(await page.locator("#view-signout .auth-book.incoming").count(), 0);
    assert.equal(await page.locator("#surface-route-underlay").count(), 0);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus Mill Charge route mounts the authored disc chart through chart.render", { timeout: 30000 }, async () => {
  const server = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus", "app.wtoml"),
    serverRunnerId: "engentus_server",
    devMode: false
  });
  try {
    const response = await fetch(`${server.url}/engentus/mill-charge`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /id="view-mill"/);
    assert.match(html, /id="mill-body"/);
    assert.match(html, /id="mill-sb"/);
    assert.match(html, /id="mill-sb-scroll"/);
    assert.match(html, /Mill Parameters/);
    assert.match(html, /Speed N\/N_c/);
    assert.match(html, /class="mill-slider" type="range"/);
    assert.match(html, /Ore \/ Charge Type/);
    assert.match(html, />Hard\/Blocky ore<\/button>/);
    assert.match(html, /id="mill-metrics"/);
    assert.match(html, /id="mill-metrics-panel"/);
    assert.match(html, /COM offset/);
    assert.match(html, /CATARACTING/);
    assert.match(html, /<canvas id="mill-canvas" class="chart-page__mount chart-page__mount--mill-charge" data-chart-spec=/);
    assert.match(html, /\/app-static\/app\/chart-functions\/mill-charge-kernels\.js/);
    assert.match(html, /registerChartSurfaceCapabilityBoot\(__chartRuntimeFunctions\)/);
    assert.match(html, /bootChartsFromDom\(document, __chartRuntimeFunctions\)/);
    assert.doesNotMatch(html, /\/chart\?chart=MillChargeCrossSection/);
  } finally {
    await server.close();
  }
});

test("Engentus home module cards navigate through authored surface interactions", { timeout: 45000 }, async () => {
  const server = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus", "app.wtoml"),
    serverRunnerId: "engentus_server",
    devMode: false
  });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    const cases = [
      {
        cardId: "surface-modulecardmillcharge",
        routeKey: "mill-charge",
        path: "/engentus/mill-charge",
        viewId: "view-mill",
        chartIds: ["mill-canvas"]
      },
      {
        cardId: "surface-modulecardgoodman",
        routeKey: "goodman",
        path: "/engentus/goodman",
        viewId: "view-goodman",
        chartIds: ["chart-svg"]
      },
      {
        cardId: "surface-modulecardmillforce",
        routeKey: "mill-force",
        path: "/engentus/mill-force",
        viewId: "view-mill-force",
        chartIds: ["mill-force-svg-cross", "mill-force-svg-force", "mill-force-svg-rose"]
      }
    ];

    for (const item of cases) {
      await page.goto(`${server.url}/engentus/home`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));
      await page.waitForSelector("#view-home");
      await page.click(`#${item.cardId}`);
      await page.waitForFunction(routeKey =>
        window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === routeKey,
        item.routeKey
      );
      assert.equal(new URL(page.url()).pathname, item.path);
      await page.waitForSelector(`#${item.viewId}`);
      for (const chartId of item.chartIds ?? []) {
        await page.waitForFunction(id => Boolean(document.getElementById(id)?.__chartController), chartId);
      }
      if (item.routeKey === "mill-charge") {
        const canvasSize = await page.evaluate(() => {
          const canvas = document.querySelector("#mill-canvas");
          return { width: canvas.width, height: canvas.height };
        });
        assert.equal(canvasSize.width, canvasSize.height);
        assert.ok(canvasSize.width > 0);
      }
      if (item.routeKey === "goodman") {
        assert.equal(await page.evaluate(() =>
          document.querySelector("#chart-svg")?.__chartController?.spec?.view?.modelRef
        ), "BoltFatigue");
      }
      if (item.routeKey === "mill-force") {
        assert.deepEqual(await page.evaluate(() =>
          ["mill-force-svg-cross", "mill-force-svg-force", "mill-force-svg-rose"]
            .map(id => document.getElementById(id)?.__chartController?.spec?.view?.modelRef)
        ), ["MillForce", "MillForce", "MillForce"]);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus Goodman modes switch authored chart views through process state", { timeout: 45000 }, async () => {
  const server = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus", "app.wtoml"),
    serverRunnerId: "engentus_server",
    devMode: false
  });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/goodman`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));
    await page.waitForFunction(() =>
      Boolean(document.querySelector("#chart-svg")?.__chartController)
      && Boolean(document.querySelector("#chart-svg-mc")?.__chartController)
    );
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "static"
    );
    assert.deepEqual(await page.evaluate(() => ({
      staticClass: document.querySelector("#surface-goodmanmodestatic")?.className,
      mcClass: document.querySelector("#surface-goodmanmodemontecarlo")?.className,
      deterministicHidden: document.querySelector("#chart-svg")?.hasAttribute("hidden"),
      monteCarloHidden: document.querySelector("#chart-svg-mc")?.hasAttribute("hidden"),
      deterministicModel: document.querySelector("#chart-svg")?.__chartController?.spec?.view?.modelRef,
      monteCarloModel: document.querySelector("#chart-svg-mc")?.__chartController?.spec?.view?.modelRef
    })), {
      staticClass: "mode-btn on",
      mcClass: "mode-btn",
      deterministicHidden: false,
      monteCarloHidden: true,
      deterministicModel: "BoltFatigue",
      monteCarloModel: "BoltFatigueMC"
    });

    await page.click("#surface-goodmanmodemontecarlo");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "mc"
    );
    assert.deepEqual(await page.evaluate(() => ({
      staticClass: document.querySelector("#surface-goodmanmodestatic")?.className,
      mcClass: document.querySelector("#surface-goodmanmodemontecarlo")?.className,
      deterministicHidden: document.querySelector("#chart-svg")?.hasAttribute("hidden"),
      monteCarloHidden: document.querySelector("#chart-svg-mc")?.hasAttribute("hidden")
    })), {
      staticClass: "mode-btn",
      mcClass: "mode-btn on",
      deterministicHidden: true,
      monteCarloHidden: false
    });

    await page.click("#surface-goodmanmodeedit");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "edit"
    );
    assert.deepEqual(await page.evaluate(() => ({
      editClass: document.querySelector("#surface-goodmanmodeedit")?.className,
      deterministicHidden: document.querySelector("#chart-svg")?.hasAttribute("hidden"),
      monteCarloHidden: document.querySelector("#chart-svg-mc")?.hasAttribute("hidden")
    })), {
      editClass: "mode-btn on",
      deterministicHidden: false,
      monteCarloHidden: true
    });
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus Mill Charge controls mutate authored process state through generic bindings", { timeout: 45000 }, async () => {
  const server = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus", "app.wtoml"),
    serverRunnerId: "engentus_server",
    devMode: false
  });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/mill-charge`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));
    const speedRow = sliderRow(page, "Speed N/N_c");
    const speedInput = speedRow.locator('input[type="range"]');
    const speedValue = speedRow.locator(".pval");
    const slurryRow = sliderRow(page, "Slurry content");
    const internalFrictionRow = sliderRow(page, "Internal friction");
    const bulkDensityRow = sliderRow(page, "Bulk density");
    await speedInput.waitFor();
    const initialMetrics = await page.textContent("#mill-metrics-panel");

    await speedInput.evaluate(input => {
      input.value = "0.82";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillChargeSpeedFrac") === 0.82
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".prow")]
        .find(row => row.textContent?.includes("Speed N/N_c"))
        ?.querySelector(".pval")?.textContent === "82%"
    );
    await page.waitForFunction(() =>
      document.querySelector("#mill-canvas")?.__chartController?.spec?.params?.speedFrac === 0.82
    );
    await page.waitForFunction(() =>
      document.querySelector("#mill-metrics-panel")?.textContent?.includes("54%")
    );
    const speedMetrics = await page.textContent("#mill-metrics-panel");
    assert.notEqual(speedMetrics, initialMetrics);
    assert.match(speedMetrics, /CATARACTING/);
    assert.match(speedMetrics, /54%/);
    assert.equal(await speedValue.textContent(), "82%");
    assert.equal(await page.evaluate(() =>
      getComputedStyle(document.querySelector(".mill-regime-badge")).color
    ), "rgb(248, 113, 113)");
    const chartCanvas = await page.evaluate(() => {
      const canvas = document.querySelector("#mill-canvas");
      return {
        width: canvas.width,
        height: canvas.height,
        background: getComputedStyle(canvas).backgroundColor
      };
    });
    assert.equal(chartCanvas.width, chartCanvas.height);
    assert.ok(chartCanvas.width > 0);
    assert.equal(chartCanvas.background, "rgba(0, 0, 0, 0)");

    await page.click("#surface-millchargepresetdenseslurry");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillChargeSlurryContent") === 0.72
    );
    assert.equal(await page.evaluate(() =>
      window.__surfaceInteractionRuntime.processRuntime.value("MillChargeInternalFriction")
    ), 30);
    assert.equal(await page.evaluate(() =>
      window.__surfaceInteractionRuntime.processRuntime.value("MillChargeBulkDensity")
    ), 2100);
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".prow")]
        .find(row => row.textContent?.includes("Slurry content"))
        ?.querySelector('input[type="range"]')?.value === "0.72"
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".prow")]
        .find(row => row.textContent?.includes("Internal friction"))
        ?.querySelector('input[type="range"]')?.value === "30"
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".prow")]
        .find(row => row.textContent?.includes("Bulk density"))
        ?.querySelector('input[type="range"]')?.value === "2100"
    );
    assert.equal(await slurryRow.locator('input[type="range"]').inputValue(), "0.72");
    assert.equal(await internalFrictionRow.locator('input[type="range"]').inputValue(), "30");
    assert.equal(await bulkDensityRow.locator('input[type="range"]').inputValue(), "2100");
    assert.equal(await slurryRow.locator(".pval").textContent(), "0.72");
    assert.equal(await internalFrictionRow.locator(".pval").textContent(), "30°");
    assert.equal(await bulkDensityRow.locator(".pval").textContent(), "2100");
    assert.deepEqual(await page.evaluate(() => {
      const params = document.querySelector("#mill-canvas")?.__chartController?.spec?.params ?? {};
      return {
        slurryContent: params.slurryContent,
        internalFriction: params.internalFriction,
        bulkDensity: params.bulkDensity
      };
    }), {
      slurryContent: 0.72,
      internalFriction: 30,
      bulkDensity: 2100
    });
    assert.match(await page.textContent("#mill-metrics-panel"), /CATARACTING/);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus Mill Force tabs switch authored chart views through process state", { timeout: 45000 }, async () => {
  const server = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus", "app.wtoml"),
    serverRunnerId: "engentus_server",
    devMode: false
  });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/mill-force`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));
    await page.waitForFunction(() =>
      Boolean(document.querySelector("#mill-force-svg-cross")?.__chartController)
      && Boolean(document.querySelector("#mill-force-svg-force")?.__chartController)
      && Boolean(document.querySelector("#mill-force-svg-rose")?.__chartController)
    );
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveChartTab") === "cross"
    );
    assert.deepEqual(await page.evaluate(() => ({
      cross: document.querySelector("#mill-force-svg-cross")?.hasAttribute("hidden"),
      force: document.querySelector("#mill-force-svg-force")?.hasAttribute("hidden"),
      rose: document.querySelector("#mill-force-svg-rose")?.hasAttribute("hidden"),
      crossClass: document.querySelector("#surface-millforcetabcrosssection")?.className,
      forceClass: document.querySelector("#surface-millforcetabforcevsangle")?.className
    })), {
      cross: false,
      force: true,
      rose: true,
      crossClass: "mill-force-cht-tab active",
      forceClass: "mill-force-cht-tab"
    });

    await page.click("#surface-millforcetabforcevsangle");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveChartTab") === "force"
    );
    assert.deepEqual(await page.evaluate(() => ({
      cross: document.querySelector("#mill-force-svg-cross")?.hasAttribute("hidden"),
      force: document.querySelector("#mill-force-svg-force")?.hasAttribute("hidden"),
      rose: document.querySelector("#mill-force-svg-rose")?.hasAttribute("hidden"),
      forceClass: document.querySelector("#surface-millforcetabforcevsangle")?.className
    })), {
      cross: true,
      force: false,
      rose: true,
      forceClass: "mill-force-cht-tab active"
    });

    await page.click("#surface-millforcetabforcerose");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveChartTab") === "rose"
    );
    assert.deepEqual(await page.evaluate(() => ({
      cross: document.querySelector("#mill-force-svg-cross")?.hasAttribute("hidden"),
      force: document.querySelector("#mill-force-svg-force")?.hasAttribute("hidden"),
      rose: document.querySelector("#mill-force-svg-rose")?.hasAttribute("hidden"),
      roseClass: document.querySelector("#surface-millforcetabforcerose")?.className
    })), {
      cross: true,
      force: true,
      rose: false,
      roseClass: "mill-force-cht-tab active"
    });
  } finally {
    await browser.close();
    await server.close();
  }
});
