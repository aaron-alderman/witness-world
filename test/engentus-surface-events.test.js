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
      monteCarloModel: document.querySelector("#chart-svg-mc")?.__chartController?.spec?.view?.modelRef,
      scenarioHidden: document.querySelector("#surface-goodmanscenariosection")?.hasAttribute("hidden"),
      simulationHidden: document.querySelector("#surface-goodmansimulationsection")?.hasAttribute("hidden"),
      runConfigHidden: document.querySelector("#surface-goodmanrunconfigsection")?.hasAttribute("hidden"),
      chartStyleHidden: document.querySelector("#surface-goodmanchartstylesection")?.hasAttribute("hidden")
    })), {
      staticClass: "mode-btn on",
      mcClass: "mode-btn",
      deterministicHidden: false,
      monteCarloHidden: true,
      deterministicModel: "BoltFatigue",
      monteCarloModel: "BoltFatigueMC",
      scenarioHidden: false,
      simulationHidden: true,
      runConfigHidden: true,
      chartStyleHidden: true
    });
    await page.click("#surface-goodmansavestaticsimulationaction");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "mc"
    );
    assert.equal(
      await page.locator("#surface-goodmansimulationsection").evaluate(node => node.hasAttribute("hidden")),
      false
    );

    await page.click("#surface-goodmanmodemontecarlo");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "mc"
    );
    assert.deepEqual(await page.evaluate(() => ({
      staticClass: document.querySelector("#surface-goodmanmodestatic")?.className,
      mcClass: document.querySelector("#surface-goodmanmodemontecarlo")?.className,
      deterministicHidden: document.querySelector("#chart-svg")?.hasAttribute("hidden"),
      monteCarloHidden: document.querySelector("#chart-svg-mc")?.hasAttribute("hidden"),
      scenarioHidden: document.querySelector("#surface-goodmanscenariosection")?.hasAttribute("hidden"),
      simulationHidden: document.querySelector("#surface-goodmansimulationsection")?.hasAttribute("hidden"),
      runConfigHidden: document.querySelector("#surface-goodmanrunconfigsection")?.hasAttribute("hidden"),
      chartStyleHidden: document.querySelector("#surface-goodmanchartstylesection")?.hasAttribute("hidden")
    })), {
      staticClass: "mode-btn",
      mcClass: "mode-btn on",
      deterministicHidden: true,
      monteCarloHidden: false,
      scenarioHidden: true,
      simulationHidden: false,
      runConfigHidden: false,
      chartStyleHidden: true
    });

    await page.click("#surface-goodmanmodeedit");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "edit"
    );
    assert.deepEqual(await page.evaluate(() => ({
      editClass: document.querySelector("#surface-goodmanmodeedit")?.className,
      deterministicHidden: document.querySelector("#chart-svg")?.hasAttribute("hidden"),
      monteCarloHidden: document.querySelector("#chart-svg-mc")?.hasAttribute("hidden"),
      scenarioHidden: document.querySelector("#surface-goodmanscenariosection")?.hasAttribute("hidden"),
      simulationHidden: document.querySelector("#surface-goodmansimulationsection")?.hasAttribute("hidden"),
      runConfigHidden: document.querySelector("#surface-goodmanrunconfigsection")?.hasAttribute("hidden"),
      chartStyleHidden: document.querySelector("#surface-goodmanchartstylesection")?.hasAttribute("hidden")
    })), {
      editClass: "mode-btn on",
      deterministicHidden: false,
      monteCarloHidden: true,
      scenarioHidden: true,
      simulationHidden: true,
      runConfigHidden: true,
      chartStyleHidden: false
    });
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus Goodman authored sidebar controls and windows update process state", { timeout: 45000 }, async () => {
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

    assert.equal(await page.locator("#surface-goodmancdfwindow[hidden]").count(), 1);
    await page.click("#surface-goodmanactioncdf");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanCdfWindowVisible") === true
    );
    await page.waitForFunction(() =>
      !document.querySelector("#surface-goodmancdfwindow")?.hasAttribute("hidden")
    );
    assert.match(await page.textContent("#surface-goodmancdfwindow"), /Run a Monte Carlo simulation to see results\./);
    await page.click("#surface-goodmancdfwindowclose");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanCdfWindowVisible") === false
    );
    assert.equal(await page.locator("#surface-goodmancdfwindow[hidden]").count(), 1);

    await page.click("#surface-goodmanactionstats");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanStatsWindowVisible") === true
    );
    assert.match(await page.textContent("#surface-goodmanstatswindow"), /Simulation/);
    assert.match(await page.textContent("#surface-goodmanstatswindow"), /No completed simulations\./);
    await page.click("#surface-goodmanstatswindowclose");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanStatsWindowVisible") === false
    );

    await page.click("#surface-goodmanactionanova");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanAnovaWindowVisible") === true
    );
    assert.match(await page.textContent("#surface-goodmananovawindow"), /F-statistic/);
    assert.match(await page.textContent("#surface-goodmananovawindow"), /Need >=2 groups with failed bolts for ANOVA\./);
    await page.click("#surface-goodmananovawindowclose");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanAnovaWindowVisible") === false
    );

    await page.click("#surface-goodmanmodemontecarlo");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "mc"
    );
    await page.locator("#cfg-n").fill("750");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunBoltsPerSet") === 750
    );
    assert.deepEqual(await page.evaluate(() => ({
      runLabel: document.querySelector("#surface-goodmanrunactionstart")?.textContent,
      pauseLabel: document.querySelector("#surface-goodmanrunactionpause")?.textContent,
      stopLabel: document.querySelector("#surface-goodmanrunactionstop")?.textContent
    })), {
      runLabel: "▶ Run",
      pauseLabel: "⏸",
      stopLabel: "■"
    });
    await page.locator("#cfg-tmax").fill("36");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunDurationMonths") === 36
    );
    assert.equal(await page.locator("#time-sl").getAttribute("max"), "36");
    await page.locator("#time-sl").fill("6.5");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanScrubTimeMonths") === 6.5
    );
    assert.match(await page.textContent("#t-lbl"), /6\.5 mo/);
    assert.equal(await page.textContent("#play-btn"), "▶");
    await page.click("#play-btn");
    assert.deepEqual(await page.evaluate(() => ({
      runStatus: window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunStatusState"),
      activeMode: window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode")
    })), {
      runStatus: "ready",
      activeMode: "mc"
    });
    await page.locator("#trail-cb").check();
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanTrailVisible") === true
    );

    await page.click("#surface-goodmanmodestatic");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "static"
    );
    await page.locator("#surface-goodmanstaticappliedshearfield").evaluate(input => {
      input.value = "25000";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanStaticAppliedShear") === 25000
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.params?.F_alt_applied_N === 25000
    );
    await page.locator("#surface-goodmanstaticrpmfield").evaluate(input => {
      input.value = "12.5";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanStaticRpm") === 12.5
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.params?.rpm === 12.5
    );
    await page.locator("#surface-goodmanstaticprobemeanstressfield").evaluate(input => {
      input.value = "425";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanStaticProbeMeanStress") === 425
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.params?.probe_sm === 425
    );

    await page.click("#surface-goodmanmodeedit");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "edit"
    );
    await page.locator("#surface-goodmancharttitleinput").fill("Edited Goodman Title");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanChartTitle") === "Edited Goodman Title"
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.view?.title === "Edited Goodman Title"
    );
    await page.locator("#surface-goodmanchartxaxisinput").fill("Edited X Axis");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanChartXAxisLabel") === "Edited X Axis"
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.view?.xLabel === "Edited X Axis"
    );
    await page.locator("#surface-goodmanchartyaxisinput").fill("Edited Y Axis");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanChartYAxisLabel") === "Edited Y Axis"
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.view?.yLabel === "Edited Y Axis"
    );
    await page.locator("#surface-goodmancharttitlesizeinput").fill("17");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanChartTitleSize") === 17
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.view?.titleSize === 17
    );
    await page.locator("#surface-goodmanchartaxissizeinput").fill("15");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanChartAxisSize") === 15
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.view?.axisSize === 15
    );
    await page.locator("#surface-goodmanchartband1input").evaluate(input => {
      input.value = "#c084fc";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanChartBandFill1") === "#c084fc"
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.view?.bandFills?.[0] === "#c084fc"
    );
    await page.locator("#surface-goodmanchartgridtoggle").uncheck();
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanChartGridVisible") === false
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.view?.showGrid === false
    );
    await page.locator("#surface-goodmanchartannotationstoggle").uncheck();
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanChartAnnotationsVisible") === false
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.view?.showAnnotations === false
    );
    await page.locator("#surface-goodmanchartpointsizeinput").fill("9");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanChartPointSize") === 9
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.view?.pointSize === 9
    );

    await page.click("#surface-goodmanmodemontecarlo");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "mc"
    );
    await page.click("#surface-goodmanrunactionstart");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunStatusState") === "running"
    );
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "mc"
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg-mc")?.__chartController?.spec?.params?.n_samples === 750
    );
    assert.match(await page.textContent("#surface-goodmanrunprogresslabel"), /Running/);
    assert.deepEqual(await page.evaluate(() => ({
      runDisabled: document.querySelector("#surface-goodmanrunactionstart")?.disabled,
      pauseDisabled: document.querySelector("#surface-goodmanrunactionpause")?.disabled,
      pauseHidden: document.querySelector("#surface-goodmanrunactionpause")?.hasAttribute("hidden"),
      resumeHidden: document.querySelector("#surface-goodmanrunactionresume")?.hasAttribute("hidden"),
      stopDisabled: document.querySelector("#surface-goodmanrunactionstop")?.disabled,
      cfgDisabled: document.querySelector("#cfg-n")?.disabled,
      lockHidden: document.querySelector("#surface-goodmanrunlocknote")?.hasAttribute("hidden"),
      fillStyle: document.querySelector("#surface-goodmanrunprogressfill")?.getAttribute("style") || ""
    })), {
      runDisabled: true,
      pauseDisabled: false,
      pauseHidden: false,
      resumeHidden: true,
      stopDisabled: false,
      cfgDisabled: true,
      lockHidden: false,
      fillStyle: "width:0%;background:var(--blue);opacity:1"
    });

    await page.click("#surface-goodmanrunactionpause");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunStatusState") === "paused"
    );
    assert.match(await page.textContent("#surface-goodmanrunprogresslabel"), /Paused/);
    assert.deepEqual(await page.evaluate(() => ({
      runDisabled: document.querySelector("#surface-goodmanrunactionstart")?.disabled,
      pauseHidden: document.querySelector("#surface-goodmanrunactionpause")?.hasAttribute("hidden"),
      resumeDisabled: document.querySelector("#surface-goodmanrunactionresume")?.disabled,
      resumeHidden: document.querySelector("#surface-goodmanrunactionresume")?.hasAttribute("hidden"),
      stopDisabled: document.querySelector("#surface-goodmanrunactionstop")?.disabled,
      cfgDisabled: document.querySelector("#cfg-n")?.disabled,
      lockText: document.querySelector("#surface-goodmanrunlocknote")?.textContent,
      fillStyle: document.querySelector("#surface-goodmanrunprogressfill")?.getAttribute("style") || ""
    })), {
      runDisabled: true,
      pauseHidden: true,
      resumeDisabled: false,
      resumeHidden: false,
      stopDisabled: false,
      cfgDisabled: true,
      lockText: "⏸ Simulation paused — config locked",
      fillStyle: "width:0%;background:var(--blue);opacity:.4"
    });
    await page.click("#surface-goodmanrunactionresume");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunStatusState") === "running"
    );
    assert.match(await page.textContent("#surface-goodmanrunprogresslabel"), /Running/);
    await page.click("#surface-goodmanrunactionstop");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunStatusState") === "stopped"
    );
    assert.match(await page.textContent("#surface-goodmanrunprogresslabel"), /Stopped/);
    assert.deepEqual(await page.evaluate(() => ({
      runDisabled: document.querySelector("#surface-goodmanrunactionstart")?.disabled,
      pauseHidden: document.querySelector("#surface-goodmanrunactionpause")?.hasAttribute("hidden"),
      resumeHidden: document.querySelector("#surface-goodmanrunactionresume")?.hasAttribute("hidden"),
      stopDisabled: document.querySelector("#surface-goodmanrunactionstop")?.disabled,
      cfgDisabled: document.querySelector("#cfg-n")?.disabled,
      lockHidden: document.querySelector("#surface-goodmanrunlocknote")?.hasAttribute("hidden")
    })), {
      runDisabled: false,
      pauseHidden: true,
      resumeHidden: true,
      stopDisabled: true,
      cfgDisabled: false,
      lockHidden: true
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

test("Engentus Mill Force controls update authored state, chart params, and results", { timeout: 45000 }, async () => {
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
    await page.waitForFunction(() => Boolean(document.querySelector("#mill-force-svg-cross")?.__chartController));
    assert.deepEqual(await page.evaluate(() => ({
      modelHidden: document.querySelector("#surface-millforcemodelsection")?.hasAttribute("hidden"),
      compareHidden: document.querySelector("#surface-millforcecomparesection")?.hasAttribute("hidden"),
      mcHidden: document.querySelector("#surface-millforcemcsection")?.hasAttribute("hidden"),
      model: window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveModel")
    })), {
      modelHidden: false,
      compareHidden: true,
      mcHidden: true,
      model: "grounded"
    });

    await page.click("#surface-millforcemodelfaithful");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveModel") === "faithful"
    );
    await page.waitForFunction(() =>
      document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.active_method === "faithful"
    );
    assert.deepEqual(await page.evaluate(() => ({
      groundedClass: document.querySelector("#surface-millforcemodelgrounded")?.className,
      faithfulClass: document.querySelector("#surface-millforcemodelfaithful")?.className,
      chartMethod: document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.active_method,
      modelRow: [...document.querySelectorAll(".mill-force-result-row")]
        .map(row => row.textContent)
        .find(text => text.includes("Model"))
    })), {
      groundedClass: "mill-force-pill",
      faithfulClass: "mill-force-pill active",
      chartMethod: "faithful",
      modelRow: "ModelFaithful"
    });

    const speedRow = sliderRow(page, "Speed N/Nc");
    const speedInput = speedRow.locator("input");
    const omegaBefore = await page.evaluate(() =>
      document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.omega
    );

    await speedInput.fill("0.8");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForcePercentCrit") === 0.8
    );
    await page.waitForFunction(() =>
      document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.percent_crit === 0.8
    );
    await page.waitForFunction(previous =>
      document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.omega !== previous,
      omegaBefore
    );
    assert.match(await speedRow.textContent(), /0\.80/);
    const resultOutputs = await page.evaluate(() => ({
      omegaText: document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.omegaText,
      gammaText: document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.gammaText,
      forceText: document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.F_resultant_max_text,
      resultRows: [...document.querySelectorAll(".mill-force-result-row")].map(row => row.textContent)
    }));
    assert.match(resultOutputs.omegaText, /rad\/s$/);
    assert.match(resultOutputs.gammaText, /°$/);
    assert.match(resultOutputs.forceText, /kN$/);
    assert.equal(resultOutputs.resultRows.some(text => text.includes("Max |F|")), true);

    await page.getByRole("button", { name: "Compare" }).click();
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveAnalysisMode") === "compare"
    );
    await page.waitForFunction(() =>
      document.querySelector("#mill-force-svg-force")?.__chartController?.spec?.params?.analysis_mode === "compare"
    );
    const modeState = await page.evaluate(() => ({
      single: document.querySelector("#surface-millforcemodesingle")?.className,
      compare: document.querySelector("#surface-millforcemodecompare")?.className,
      forceChartMode: document.querySelector("#mill-force-svg-force")?.__chartController?.spec?.params?.analysis_mode,
      modeRow: [...document.querySelectorAll(".mill-force-result-row")]
        .map(row => row.textContent)
        .find(text => text.includes("Mode"))
    }));
    assert.equal(modeState.single, "mill-force-pill");
    assert.equal(modeState.compare, "mill-force-pill active");
    assert.equal(modeState.forceChartMode, "compare");
    assert.match(modeState.modeRow, /Compare/);
    const compareState = await page.evaluate(() => ({
      modelHidden: document.querySelector("#surface-millforcemodelsection")?.hasAttribute("hidden"),
      compareHidden: document.querySelector("#surface-millforcecomparesection")?.hasAttribute("hidden"),
      compareText: document.querySelector("#surface-millforcecomparesection")?.textContent,
      resultRows: [...document.querySelectorAll(".mill-force-result-row")].map(row => row.textContent),
      deltaOutputs: {
        fill: document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.gammaDeltaText,
        fillPct: document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.gammaDeltaPercentText,
        toe: document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.phiPrimeDeltaText,
        toePct: document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.phiPrimeDeltaPercentText,
        radial: document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.F_r_max_delta_text,
        resultant: document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.F_resultant_max_delta_text
      }
    }));
    assert.equal(compareState.modelHidden, true);
    assert.equal(compareState.compareHidden, false);
    assert.match(compareState.compareText, /Compare Models/);
    assert.match(compareState.compareText, /Δ fill/);
    assert.match(compareState.compareText, /Δ toe/);
    assert.match(compareState.compareText, /Δ max F_r/);
    assert.match(compareState.compareText, /Δ max \|F\|/);
    assert.match(compareState.deltaOutputs.fill, /^[+-]?\d+\.\d(?:Â°|°)$/);
    assert.match(compareState.deltaOutputs.fillPct, /^[+-]?\d+\.\d\d%$/);
    assert.equal(compareState.resultRows.some(text => /γ|Î³/.test(text) && /%/.test(text)), true);
    assert.equal(compareState.resultRows.some(text => /toe/.test(text) && /%/.test(text)), true);
    assert.match(compareState.deltaOutputs.resultant, /^[+-]?\d+\.\d kN$/);

    await page.getByRole("button", { name: "Monte Carlo" }).click();
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveAnalysisMode") === "mc"
    );
    assert.deepEqual(await page.evaluate(() => ({
      compareHidden: document.querySelector("#surface-millforcecomparesection")?.hasAttribute("hidden"),
      mcHidden: document.querySelector("#surface-millforcemcsection")?.hasAttribute("hidden"),
      runLabel: document.querySelector("#surface-millforcemcrunaction")?.textContent,
      clearLabel: document.querySelector("#surface-millforcemcclearaction")?.textContent,
      clearDisabled: document.querySelector("#surface-millforcemcclearaction")?.disabled,
      samplesRowClass: document.querySelector("#surface-millforcemcsamplesrow")?.className,
      samplesLabel: document.querySelector("#surface-millforcemcsamplesrow label")?.textContent,
      samplesInputStyle: document.querySelector("#mill-force-mc-n")?.getAttribute("style"),
      mcParamRows: [...document.querySelectorAll("#surface-millforcemcsection .mc-row")]
        .map(row => row.textContent.trim())
    })), {
      compareHidden: true,
      mcHidden: false,
      runLabel: "▶ Run",
      clearLabel: "✕ Clear",
      clearDisabled: true,
      samplesRowClass: "mc-row",
      samplesLabel: "Samples",
      samplesInputStyle: "width:70px",
      mcParamRows: [
        "Samples",
        "Fill fraction Jσ=0.030",
        "Speed N/Ncσ=0.050",
        "Solids (mass)σ=0.050",
        "Liner heightσ=0.020"
      ]
    });
    await page.locator("#mill-force-mc-n").fill("350");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceMcSamples") === 350
    );
    await page.locator("#surface-millforcemcjtotalinput").check();
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceMcJTotalFree") === true
    );
    await page.click("#surface-millforcemcrunaction");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceMcStatusState") === "running"
    );
    assert.equal(await page.textContent("#surface-millforcemcstatustext"), "Run requested");
    assert.equal(await page.locator("#surface-millforcemcclearaction").isEnabled(), true);
    await page.click("#surface-millforcemcclearaction");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceMcStatusState") === "cleared"
    );
    assert.equal(await page.textContent("#surface-millforcemcstatustext"), "Cleared");
    assert.equal(await page.locator("#surface-millforcemcclearaction").isEnabled(), false);
  } finally {
    await browser.close();
    await server.close();
  }
});
