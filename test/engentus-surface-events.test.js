import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { launchBrowser, startUiServer } from "./support/harness.js";
import {
  ENGENTUS_GENERATED_STYLESHEET_PATHS,
  loadEngentusGeneratedCssBundle
} from "../examples/engentus/app/engentus-style-application.js";

function sliderRow(page, label) {
  return page.locator(".prow").filter({ hasText: label });
}

function startEngentusUiServer({ devMode = false } = {}) {
  return startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus", "app.wtoml"),
    serverRunnerId: "engentus_server",
    runtimeProfile: "authoring",
    devMode
  });
}

async function interceptEngentusWcssAssets(page, switchManifest) {
  const bundle = await loadEngentusGeneratedCssBundle({
    switchManifest
  });
  const shellCss = bundle.files["engentus-shell.css"];
  const chartCss = bundle.files["engentus-chart-pages.css"];

  await page.route(`**${ENGENTUS_GENERATED_STYLESHEET_PATHS.shell}`, route => route.fulfill({
    status: 200,
    contentType: "text/css",
    body: shellCss
  }));
  await page.route(`**${ENGENTUS_GENERATED_STYLESHEET_PATHS.chart}`, route => route.fulfill({
    status: 200,
    contentType: "text/css",
    body: chartCss
  }));

  return { shellCss, chartCss };
}

async function readSurfaceRuntimeDebugSnapshot(page) {
  return await page.evaluate(async () => {
    await window.world?.rerunProbe?.();
    return {
      route: location.pathname,
      issues: (window.world?.issues || []).filter(issue => issue.status === "active"),
      latestProbe: window.world?.latestProbe,
      processState: typeof window.__surfaceInteractionRuntime?.processRuntime?.snapshot === "function"
        ? window.__surfaceInteractionRuntime.processRuntime.snapshot()
        : null
    };
  });
}

async function waitForSurfaceCondition(page, predicate, message, options = {}) {
  const timeout = Number(options.timeout ?? 5000);
  const arg = options.arg;
  try {
    if (typeof arg === "undefined") await page.waitForFunction(predicate, { timeout });
    else await page.waitForFunction(predicate, arg, { timeout });
  } catch (error) {
    const snapshot = await readSurfaceRuntimeDebugSnapshot(page);
    assert.fail(`${message}\n${String(error?.message || error)}\n${JSON.stringify(snapshot, null, 2)}`);
  }
}

async function waitForNoRouteUnderlay(page, message = "Surface route underlay did not clear after settle") {
  await waitForSurfaceCondition(
    page,
    () => document.querySelectorAll("#surface-route-underlay").length === 0,
    message
  );
}

async function waitForSurfaceSettled(page, message = "Surface runtime did not settle") {
  try {
    await page.evaluate(async () => {
      if (typeof window.world?.whenSettled === "function") await window.world.whenSettled();
    });
  } catch (error) {
    const snapshot = await readSurfaceRuntimeDebugSnapshot(page);
    assert.fail(`${message}\n${String(error?.message || error)}\n${JSON.stringify(snapshot, null, 2)}`);
  }
}

async function assertNoActiveShellIssues(page, label) {
  await waitForNoRouteUnderlay(page, `${label}: route underlay never cleared before diagnostics check`);
  const snapshot = await page.evaluate(async () => {
    await window.world.rerunProbe();
    return {
      activeIssues: window.world.issues.filter(issue => issue.status === "active"),
      expectationProviderCount: window.world.expectationProviderCount,
      latestProbe: window.world.latestProbe
    };
  });
  assert.equal(snapshot.expectationProviderCount > 0, true, `${label}: expectation pack not registered`);
  assert.deepEqual(
    snapshot.activeIssues,
    [],
    `${label}: expected no active shell diagnostics issues, saw ${JSON.stringify(snapshot.activeIssues, null, 2)}`
  );
  assert.equal(Array.isArray(snapshot.latestProbe?.expectationIssues), true, `${label}: latest probe missing expectation issues`);
}

async function ensureEngentusSignedIn(page, expectedRouteKey = "home") {
  await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));
  const loginVisible = await page.locator("#view-login").count();
  if (!loginVisible) return;
  await page.click("#surface-engentusloginprimaryaction");
  await waitForSurfaceSettled(page, `Engentus sign-in did not settle for route ${expectedRouteKey}`);
  await waitForSurfaceCondition(page, routeKey =>
    window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === routeKey
    && window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "signedIn"
  , `Engentus sign-in did not land on ${expectedRouteKey}`, { arg: expectedRouteKey, timeout: 15000 });
}

test("Engentus dev shell diagnostics expectation pack stays clean across the shell auth flow", { timeout: 70000 }, async () => {
  const server = await startEngentusUiServer({ devMode: true });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/login`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.world?.expectationProviderCount > 0);
    await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));

    await assertNoActiveShellIssues(page, "login-initial");

    await page.click(".ms-btn");
    await waitForSurfaceSettled(page, "Shell sign-in did not settle");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "home"
      && window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "signedIn"
    );
    await page.waitForSelector("#module-area");
    await assertNoActiveShellIssues(page, "home-after-sign-in");

    await page.evaluate(() => {
      document.getElementById("user-prof")?.click();
    });
    await page.waitForFunction(() =>
      document.getElementById("up-menu")?.classList.contains("open") === true
      && window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusProfileMenuVisible") === true
    );
    await assertNoActiveShellIssues(page, "home-menu-open");

    await page.evaluate(() => {
      document.querySelector(".up-mi-signout")?.click();
    });
    await waitForSurfaceSettled(page, "Shell sign-out did not settle");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "signout"
      && window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "signedOut"
    );
    await page.waitForSelector("#view-signout");
    await assertNoActiveShellIssues(page, "signout");

    await page.getByRole("button", { name: "Sign back in" }).click();
    await waitForSurfaceSettled(page, "Shell return-to-login did not settle");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "login"
      && window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "idle"
    );
    await page.waitForSelector("#view-login");
    await assertNoActiveShellIssues(page, "login-after-return");
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus served WCSS manifest keeps whole-app runtime behavior faithful without injected assets", { timeout: 150000 }, async () => {
  const server = await startEngentusUiServer({ devMode: true });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/login`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.world?.expectationProviderCount > 0);
    await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));
    await assertNoActiveShellIssues(page, "served-login");

    await page.click("#surface-engentusloginprimaryaction");
    await waitForSurfaceSettled(page, "Served WCSS sign-in did not settle");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "home"
      && window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "signedIn"
    , "Served WCSS sign-in did not land on the home route", { timeout: 15000 });
    await page.waitForSelector("#view-home");
    await assertNoActiveShellIssues(page, "served-home");
    assert.ok(await page.locator(".mod-card.active").count() >= 2);
    assert.ok(await page.locator(".news-item").count() >= 4);

    await page.evaluate(() => {
      document.getElementById("user-prof")?.click();
    });
    await waitForSurfaceCondition(page, () =>
      document.getElementById("up-menu")?.classList.contains("open") === true
      && window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusProfileMenuVisible") === true
    , "Served WCSS did not open the profile menu");
    await assertNoActiveShellIssues(page, "served-home-menu-open");

    await page.evaluate(() => {
      document.querySelector(".up-mi-signout")?.click();
    });
    await waitForSurfaceSettled(page, "Served WCSS sign-out did not settle");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "signout"
      && window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "signedOut"
    , "Served WCSS sign-out did not land on signout");
    await page.waitForSelector("#view-signout");
    await assertNoActiveShellIssues(page, "served-signout");

    await page.getByRole("button", { name: "Sign back in" }).click();
    await waitForSurfaceSettled(page, "Served WCSS return-to-login did not settle");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "login"
      && window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "idle"
    );
    await page.click("#surface-engentusloginprimaryaction");
    await waitForSurfaceSettled(page, "Served WCSS second sign-in did not settle");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "home"
      && window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "signedIn"
    , "Served WCSS second sign-in did not return to home", { timeout: 15000 });
    await page.waitForSelector("#view-home");
    await assertNoActiveShellIssues(page, "served-home-after-relogin");

    await page.goto(`${server.url}/engentus/goodman`, { waitUntil: "domcontentloaded" });
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "goodman"
    , "Served WCSS Goodman route did not settle");
    await page.waitForSelector("#view-goodman");
    await waitForSurfaceCondition(page, () => Boolean(document.querySelector("#chart-svg")?.__chartController), "Served WCSS Goodman route did not mount the chart controller");
    await assertNoActiveShellIssues(page, "served-goodman");
    assert.deepEqual(await page.evaluate(() => ({
      mountPresent: Boolean(document.querySelector("#chart-svg")),
      overlayPresent: Boolean(document.querySelector("#mc-canvas")),
      tooltipPresent: Boolean(document.querySelector("#chart-tip"))
    })), {
      mountPresent: true,
      overlayPresent: true,
      tooltipPresent: true
    });
    await page.click("#surface-goodmanmodemontecarlo");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "mc"
    , "Served WCSS Goodman route did not switch to Monte Carlo mode");
    await page.click("#surface-goodmansimulationnewaction");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunConfigVisible") === true
    , "Served WCSS Goodman route did not open the run config");
    await page.click("#surface-goodmanrunactionstart");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunStatusState") !== "ready"
    , "Served WCSS Goodman route never left the ready state");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunStatusState") === "done"
    , "Served WCSS Goodman route did not complete the run");
    const goodmanRunVisuals = await page.evaluate(() => ({
      progressClassName: document.querySelector("#prog-fill")?.className ?? "",
      lockText: document.querySelector("#surface-goodmanrunlocknote")?.textContent ?? ""
    }));
    assert.match(goodmanRunVisuals.progressClassName, /\bdone\b/);
    assert.match(goodmanRunVisuals.lockText, /locked/i);
    await page.click("#surface-goodmanactionstats");
    await waitForSurfaceCondition(page, () =>
      !document.querySelector("#surface-goodmanstatswindow")?.hasAttribute("hidden")
    , "Served WCSS Goodman route did not open the stats window");

    await page.goto(`${server.url}/engentus/mill-charge`, { waitUntil: "domcontentloaded" });
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "mill-charge"
    , "Served WCSS Mill Charge route did not settle");
    await page.waitForSelector("#view-mill");
    await waitForSurfaceCondition(page, () => Boolean(document.querySelector("#mill-canvas")?.__chartController), "Served WCSS Mill Charge route did not mount the canvas chart");
    await assertNoActiveShellIssues(page, "served-mill-charge");
    await sliderRow(page, "Speed N/N_c").locator('input[type="range"]').evaluate(input => {
      input.value = "0.82";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillChargeSpeedFrac") === 0.82
    , "Served WCSS Mill Charge route did not commit the speed input");
    await waitForSurfaceCondition(page, () =>
      document.querySelector("#mill-canvas")?.__chartController?.spec?.params?.speedFrac === 0.82
    , "Served WCSS Mill Charge route did not propagate speed into chart params");
    const millChargeVisuals = await page.evaluate(() => ({
      regimeText: document.querySelector(".mill-regime-badge")?.textContent?.trim() ?? "",
      regimeClassName: document.querySelector(".mill-regime-badge")?.className ?? "",
      metricsPanelPresent: Boolean(document.querySelector("#mill-metrics-panel"))
    }));
    assert.equal(millChargeVisuals.metricsPanelPresent, true);
    assert.equal(millChargeVisuals.regimeText, "CATARACTING");
    assert.match(millChargeVisuals.regimeClassName, /\bcataracting\b/);

    await page.goto(`${server.url}/engentus/mill-force`, { waitUntil: "domcontentloaded" });
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "mill-force"
    , "Served WCSS Mill Force route did not settle");
    await page.waitForSelector("#view-mill-force");
    await waitForSurfaceCondition(page, () => Boolean(document.querySelector("#mill-force-svg-cross")?.__chartController), "Served WCSS Mill Force route did not mount the cross chart");
    await assertNoActiveShellIssues(page, "served-mill-force");
    assert.deepEqual(await page.evaluate(() => ({
      crossOverlayPresent: Boolean(document.querySelector("#mill-force-cross-canvas")),
      crossTooltipPresent: Boolean(document.querySelector("#mill-force-cross-tip"))
    })), {
      crossOverlayPresent: true,
      crossTooltipPresent: true
    });
    await page.getByRole("button", { name: "Compare" }).click();
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveAnalysisMode") === "compare"
    , "Served WCSS Mill Force route did not switch analysis mode");
    await waitForSurfaceCondition(page, () =>
      document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.analysis_mode === "compare"
    , "Served WCSS Mill Force route did not propagate analysis mode into chart params");
    await page.click("#surface-millforcetabforcevsangle");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveChartTab") === "force"
      && Boolean(document.querySelector("#mill-force-svg-force")?.__chartController)
    , "Served WCSS Mill Force route did not materialize the force chart");
    assert.deepEqual(await page.evaluate(() => ({
      forceOverlayPresent: Boolean(document.querySelector("#mill-force-force-canvas")),
      forceTooltipPresent: Boolean(document.querySelector("#mill-force-force-tip")),
      tabClassName: document.querySelector("#surface-millforcetabforcevsangle")?.className ?? ""
    })), {
      forceOverlayPresent: true,
      forceTooltipPresent: true,
      tabClassName: "mill-force-cht-tab active"
    });

    await page.goto(`${server.url}/engentus/platform-config`, { waitUntil: "domcontentloaded" });
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "platform-config-operator"
    , "Served WCSS platform-config operator route did not settle");
    await page.waitForSelector("#view-platform-config");
    await assertNoActiveShellIssues(page, "served-platform-operator");
    const operatorChrome = await page.evaluate(() => ({
      sidebarPresent: Boolean(document.getElementById("platform-config-sidebar")),
      activeLinks: document.querySelectorAll(".platform-config-side-link.active").length,
      noticeClassName: document.getElementById("platform-config-notice")?.className ?? "",
      noticeBackgroundColor: document.getElementById("platform-config-notice")
        ? getComputedStyle(document.getElementById("platform-config-notice")).backgroundColor
        : null
    }));
    assert.equal(operatorChrome.sidebarPresent, true);
    assert.equal(operatorChrome.activeLinks, 1);
    assert.match(operatorChrome.noticeClassName, /\bplatform-config-notice\b/);
    assert.notEqual(operatorChrome.noticeBackgroundColor, "rgba(0, 0, 0, 0)");

  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus dev shell diagnostics expectation pack surfaces induced mismatches without crashing", { timeout: 45000 }, async () => {
  const server = await startEngentusUiServer({ devMode: true });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/home`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "home");
    await page.waitForFunction(() => window.world?.expectationProviderCount > 0);
    await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));
    await page.evaluate(async () => { await window.world.rerunProbe(); });
    assert.deepEqual(await page.evaluate(() =>
      window.world.issues.filter(issue => issue.status === "active")
    ), []);

    await page.evaluate(() => {
      const underlay = document.createElement("div");
      underlay.id = "surface-route-underlay";
      document.body.appendChild(underlay);
    });
    const broken = await page.evaluate(async () => {
      await window.world.rerunProbe();
      return {
        activeIssues: window.world.issues.filter(issue => issue.status === "active"),
        overlayHidden: document.getElementById("surface-runtime-diagnostics-root")?.hidden,
        fabText: document.getElementById("surface-runtime-diagnostics-fab")?.textContent
      };
    });
    assert.equal(broken.activeIssues.some(issue => issue.id === "engentus-shell:stale-underlay:home"), true);
    assert.equal(broken.overlayHidden, false);
    assert.match(broken.fabText || "", /Issues\s+1/);

    await page.evaluate(() => {
      document.getElementById("surface-route-underlay")?.remove();
    });
    const repaired = await page.evaluate(async () => {
      await window.world.rerunProbe();
      return {
        activeIssues: window.world.issues.filter(issue => issue.status === "active"),
        resolvedIssues: window.world.issues.filter(issue => issue.status === "resolved").map(issue => issue.id)
      };
    });
    assert.deepEqual(repaired.activeIssues, []);
    assert.equal(repaired.resolvedIssues.includes("engentus-shell:stale-underlay:home"), true);
    assert.equal(await page.evaluate(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime)), true);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus native auth/platform-config WCSS lane preserves shell behavior on auth flow and operator route", { timeout: 90000 }, async () => {
  const server = await startEngentusUiServer({ devMode: true });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    const switchManifest = {
      theme: "engentus",
      slices: {
        auth: "wcss",
        "platform-config": "wcss"
      }
    };
    const { shellCss } = await interceptEngentusWcssAssets(page, switchManifest);
    assert.equal(shellCss.includes(".auth-submit.pending"), false);
    assert.equal(shellCss.includes(".auth-signout-icon"), false);
    assert.equal(shellCss.includes(".ms-btn.folding svg"), false);

    await page.goto(`${server.url}/engentus/platform-config`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.world?.expectationProviderCount > 0);
    await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));
    await page.click("#surface-engentusloginprimaryaction");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "pending"
    );
    await waitForSurfaceSettled(page, "Platform-config sign-in did not settle");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "platform-config-operator"
      && window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "signedIn"
    , "Platform-config sign-in did not land on the operator route", { timeout: 15000 });
    await page.waitForSelector("#view-platform-config");
    await assertNoActiveShellIssues(page, "platform-operator");

  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus direct platform-config access sign-in hydrates authority selectors on the resumed route", { timeout: 90000 }, async () => {
  const server = await startEngentusUiServer({ devMode: true });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/platform-config/access`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));
    await page.waitForFunction(() => window.world?.expectationProviderCount > 0);

    await ensureEngentusSignedIn(page, "platform-config-access");
    await page.waitForSelector("#view-platform-config-access");
    await waitForSurfaceCondition(page, () => {
      const identityOptions = document.querySelectorAll("#platform-config-assume-identity option");
      const actorOptions = document.querySelectorAll("#platform-config-assume-actor option");
      const authorityCard = document.querySelector("#platform-config-access-content");
      return identityOptions.length > 0
        && actorOptions.length > 0
        && /Authenticated identity:/i.test(authorityCard?.textContent || "")
        && /Effective actor:/i.test(authorityCard?.textContent || "");
    }, "Platform-config access route never hydrated authority selectors after direct sign-in", { timeout: 15000 });

    const hydrated = await page.evaluate(() => ({
      route: window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute"),
      authStatus: window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus"),
      identityOptions: [...document.querySelectorAll("#platform-config-assume-identity option")].map(node => node.textContent?.trim()),
      actorOptions: [...document.querySelectorAll("#platform-config-assume-actor option")].map(node => node.textContent?.trim()),
      authoritySummary: document.querySelector("#platform-config-access-content")?.textContent || ""
    }));
    assert.equal(hydrated.route, "platform-config-access");
    assert.equal(hydrated.authStatus, "signedIn");
    assert.equal(hydrated.identityOptions.length > 0, true);
    assert.equal(hydrated.actorOptions.length > 0, true);
    assert.match(hydrated.authoritySummary, /Authenticated identity:/i);
    assert.match(hydrated.authoritySummary, /Effective actor:/i);
    await assertNoActiveShellIssues(page, "platform-access-direct-sign-in");
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus native home WCSS proof lane preserves home route behavior under injected assets", { timeout: 90000 }, async () => {
  const server = await startEngentusUiServer({ devMode: true });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    const switchManifest = {
      theme: "engentus",
      slices: {
        home: "wcss"
      }
    };
    const { shellCss } = await interceptEngentusWcssAssets(page, switchManifest);
    assert.equal(shellCss.includes(".news-item.ni-alert"), true);
    assert.equal(shellCss.includes(".mod-card.active:hover"), true);
    assert.equal(shellCss.includes(".mod-status.ms-open"), true);

    await page.goto(`${server.url}/engentus/home`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "home");
    await page.waitForSelector("#view-home");
    await assertNoActiveShellIssues(page, "home-wcss");

    assert.ok(await page.locator(".news-item").count() >= 4);
    assert.ok(await page.locator(".mod-card.active").count() >= 2);
    assert.ok(await page.locator(".mod-card.locked").count() >= 1);

    const [activeCard, lockedCard, liveDot] = await Promise.all([
      page.locator(".mod-card.active").first().evaluate(node => {
        const style = getComputedStyle(node);
        return {
          cursor: style.cursor,
          backgroundColor: style.backgroundColor
        };
      }),
      page.locator(".mod-card.locked").first().evaluate(node => {
        const style = getComputedStyle(node);
        return {
          opacity: style.opacity
        };
      }),
      page.locator(".news-live-dot").evaluate(node => getComputedStyle(node).animationName)
    ]);

    assert.equal(activeCard.cursor, "pointer");
    assert.notEqual(activeCard.backgroundColor, "rgba(0, 0, 0, 0)");
    assert.notEqual(lockedCard.opacity, "1");
    assert.match(liveDot, /livepulse/i);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus native goodman WCSS proof lane preserves Goodman shell behavior under injected assets", { timeout: 90000 }, async () => {
  const server = await startEngentusUiServer({ devMode: true });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    const switchManifest = {
      theme: "engentus",
      slices: {
        goodman: "wcss"
      }
    };
    const { shellCss } = await interceptEngentusWcssAssets(page, switchManifest);
    assert.equal(shellCss.includes("#goodman-bolt-primary-swatch"), true);
    assert.equal(shellCss.includes("#goodman-legend-infinite-swatch"), true);
    assert.equal(shellCss.includes("#prog-fill.done"), true);

    await page.goto(`${server.url}/engentus/goodman`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "goodman");
    await page.waitForSelector("#view-goodman");
    await assertNoActiveShellIssues(page, "goodman-wcss");
    await waitForSurfaceCondition(page, () => Boolean(window.__surfaceInteractionRuntime?.processRuntime), "Goodman native WCSS lane did not boot the runtime");
    await waitForSurfaceCondition(page, () => Boolean(document.querySelector("#chart-svg")?.__chartController), "Goodman native WCSS lane did not mount the chart controller");

    const swatches = await page.evaluate(() => {
      const sample = selector => {
        const node = document.querySelector(selector);
        const style = node ? getComputedStyle(node) : null;
        return {
          backgroundColor: style?.backgroundColor ?? null,
          borderColor: style?.borderColor ?? null
        };
      };
      return {
        primary: sample("#goodman-bolt-primary-swatch"),
        maintenance: sample("#goodman-bolt-maintenance-swatch"),
        infinite: sample("#goodman-legend-infinite-swatch"),
        imminent: sample("#goodman-legend-imminent-swatch")
      };
    });
    assert.equal(swatches.primary.backgroundColor, "rgb(220, 38, 38)");
    assert.equal(swatches.maintenance.backgroundColor, "rgb(140, 196, 212)");
    assert.notEqual(swatches.infinite.borderColor, "rgba(0, 0, 0, 0)");
    assert.notEqual(swatches.imminent.backgroundColor, "rgba(0, 0, 0, 0)");

    await page.click("#surface-goodmanmodemontecarlo");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "mc"
    , "Goodman native WCSS lane did not switch to Monte Carlo mode");
    await page.click("#surface-goodmansimulationnewaction");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunConfigVisible") === true
    , "Goodman native WCSS lane did not open the run config");
    await page.click("#surface-goodmanrunactionstart");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunStatusState") !== "ready"
    , "Goodman native WCSS lane never left the ready state after starting a run");

    const runningProgress = await page.evaluate(() => {
      const fill = document.querySelector("#prog-fill");
      const style = fill ? getComputedStyle(fill) : null;
      return {
        className: fill?.className ?? "",
        opacity: style?.opacity ?? null,
        lockText: document.querySelector("#surface-goodmanrunlocknote")?.textContent ?? ""
      };
    });
    assert.match(runningProgress.className, /\b(running|done)\b/);
    assert.match(runningProgress.lockText, /(running|locked)/i);
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunStatusState") === "done"
    , "Goodman native WCSS lane did not complete the run");

    const doneProgress = await page.evaluate(() => {
      const fill = document.querySelector("#prog-fill");
      const style = fill ? getComputedStyle(fill) : null;
      const fillRect = fill?.getBoundingClientRect();
      const wrapRect = fill?.parentElement?.getBoundingClientRect();
      return {
        className: fill?.className ?? "",
        backgroundColor: style?.backgroundColor ?? null,
        opacity: style?.opacity ?? null,
        fillWidth: fillRect?.width ?? 0,
        wrapWidth: wrapRect?.width ?? 0,
        lockText: document.querySelector("#surface-goodmanrunlocknote")?.textContent ?? ""
      };
    });
    assert.match(doneProgress.className, /\bdone\b/);
    assert.equal(doneProgress.opacity, "1");
    assert.equal(doneProgress.fillWidth > 0, true);
    assert.equal(doneProgress.wrapWidth >= doneProgress.fillWidth, true);
    assert.match(doneProgress.lockText, /locked/i);

    await page.click("#surface-goodmanactionstats");
    await waitForSurfaceCondition(page, () =>
      !document.querySelector("#surface-goodmanstatswindow")?.hasAttribute("hidden")
    , "Goodman native WCSS lane did not surface the stats window after the run completed");

    await page.click("#surface-goodmanboltsetprimaryeditaction");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanBoltPrimaryEditVisible") === true
    , "Goodman native WCSS lane did not open the primary bolt edit form");
    assert.equal(await page.locator(".bs-edit-form.open").count(), 1);
    await page.click("#surface-goodmanboltsetprimaryeditsaveaction");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanBoltPrimaryEditVisible") === false
    , "Goodman native WCSS lane did not close the primary bolt edit form");
    await page.click("#surface-goodmanboltsetprimarychevron");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanBoltPrimaryParamsOpen") === true
    , "Goodman native WCSS lane did not open the primary bolt params");
    assert.equal(await page.locator(".bs-params.open").count(), 1);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus native mill-charge WCSS proof lane preserves control, chart, and regime badge behavior under injected assets", { timeout: 90000 }, async () => {
  const server = await startEngentusUiServer({ devMode: true });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    const switchManifest = {
      theme: "engentus",
      slices: {
        "mill-charge": "wcss"
      }
    };
    const { shellCss } = await interceptEngentusWcssAssets(page, switchManifest);
    assert.equal(shellCss.includes("#mill-canvas-wrap canvas"), true);
    assert.equal(shellCss.includes(".mill-regime-badge.cataracting"), true);

    await page.goto(`${server.url}/engentus/mill-charge`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "mill-charge");
    await page.waitForSelector("#view-mill");
    await assertNoActiveShellIssues(page, "mill-charge-wcss");
    await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));

    const speedRow = sliderRow(page, "Speed N/N_c");
    const speedInput = speedRow.locator('input[type="range"]');
    await speedInput.waitFor();

    await speedInput.evaluate(input => {
      input.value = "0.82";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillChargeSpeedFrac") === 0.82
    , "Mill Charge native WCSS lane did not commit the speed input");
    await waitForSurfaceCondition(page, () =>
      document.querySelector("#mill-canvas")?.__chartController?.spec?.params?.speedFrac === 0.82
    , "Mill Charge native WCSS lane did not update chart params from speed input");

    const regime = await page.locator(".mill-regime-badge").evaluate(node => {
      const style = getComputedStyle(node);
      return {
        text: node.textContent?.trim(),
        className: node.className,
        color: style.color,
        backgroundColor: style.backgroundColor
      };
    });
    assert.equal(regime.text, "CATARACTING");
    assert.match(regime.className, /\bcataracting\b/);
    assert.equal(regime.color, "rgb(248, 113, 113)");
    assert.notEqual(regime.backgroundColor, "rgba(0, 0, 0, 0)");

    await page.click("#surface-millchargepresetdenseslurry");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillChargeSlurryContent") === 0.72
    , "Mill Charge native WCSS lane did not apply the dense slurry preset");
    await waitForSurfaceCondition(page, () =>
      document.querySelector("#mill-canvas")?.__chartController?.spec?.params?.slurryContent === 0.72
    , "Mill Charge native WCSS lane did not propagate preset state into the chart");
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus native mill-force WCSS proof lane preserves tabs, analysis mode, and shell behavior under injected assets", { timeout: 90000 }, async () => {
  const server = await startEngentusUiServer({ devMode: true });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    const switchManifest = {
      theme: "engentus",
      slices: {
        "mill-force": "wcss"
      }
    };
    const { shellCss } = await interceptEngentusWcssAssets(page, switchManifest);
    assert.equal(shellCss.includes(".mill-force-pill.active"), true);
    assert.equal(shellCss.includes(".mill-force-cht-tab.active"), true);

    await page.goto(`${server.url}/engentus/mill-force`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "mill-force");
    await page.waitForSelector("#view-mill-force");
    await assertNoActiveShellIssues(page, "mill-force-wcss");
    await waitForSurfaceCondition(page, () => Boolean(window.__surfaceInteractionRuntime?.processRuntime), "Mill Force native WCSS lane did not boot the runtime");
    await waitForSurfaceCondition(page, () => Boolean(document.querySelector("#mill-force-svg-cross")?.__chartController), "Mill Force native WCSS lane did not mount the cross-section chart");

    await page.getByRole("button", { name: "Compare" }).click();
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveAnalysisMode") === "compare"
    , "Mill Force native WCSS lane did not switch the analysis mode");
    await waitForSurfaceCondition(page, () =>
      document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.analysis_mode === "compare"
    , "Mill Force native WCSS lane did not propagate analysis mode into chart params");
    assert.deepEqual(await page.evaluate(() => ({
      single: document.querySelector("#surface-millforcemodesingle")?.className,
      compare: document.querySelector("#surface-millforcemodecompare")?.className
    })), {
      single: "mill-force-pill",
      compare: "mill-force-pill active"
    });

    await page.click("#surface-millforcetabforcevsangle");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveChartTab") === "force"
    , "Mill Force native WCSS lane did not switch the active chart tab");
    await waitForSurfaceCondition(page, () =>
      Boolean(document.querySelector("#mill-force-svg-force")?.__chartController)
    , "Mill Force native WCSS lane did not materialize the force-vs-angle chart");
    assert.equal(await page.evaluate(() =>
      document.querySelector("#surface-millforcetabforcevsangle")?.className
    ), "mill-force-cht-tab active");

    const speedRow = sliderRow(page, "Speed N/Nc");
    await speedRow.locator("input").fill("0.8");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForcePercentCrit") === 0.8
    , "Mill Force native WCSS lane did not commit the speed input");

    await page.getByRole("button", { name: "Monte Carlo" }).click();
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveAnalysisMode") === "mc"
    , "Mill Force native WCSS lane did not enter Monte Carlo mode");
    assert.deepEqual(await page.evaluate(() => ({
      mcBodyHidden: document.querySelector("#surface-millforcemcbody")?.hasAttribute("hidden"),
      chevron: document.querySelector("#surface-millforcemcchevron")?.textContent
    })), {
      mcBodyHidden: false,
      chevron: "▲"
    });
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus native chart-pages WCSS proof lane preserves chart page host, mount, overlay, and tooltip behavior under injected assets", { timeout: 120000 }, async () => {
  const server = await startEngentusUiServer({ devMode: true });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    const switchManifest = {
      theme: "engentus",
      slices: {
        "chart-pages": "wcss"
      }
    };
    const { chartCss } = await interceptEngentusWcssAssets(page, switchManifest);
    assert.equal(chartCss.includes("body.chart-page"), true);
    assert.equal(chartCss.includes("#mill-force-force-tip"), true);
    assert.equal(chartCss.includes("#mill-force-cross-tip"), true);
    assert.equal(chartCss.includes("#mill-force-rose-tip"), true);
    assert.equal(chartCss.includes("#mill-force-tip"), false);
    assert.equal(chartCss.includes("#mill-force-mc-canvas"), false);

    await page.goto(`${server.url}/engentus/goodman`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "goodman");
    await page.waitForSelector("#view-goodman");
    await assertNoActiveShellIssues(page, "goodman-chart-pages-wcss");
    await waitForSurfaceCondition(page, () => Boolean(document.querySelector("#chart-svg")?.__chartController), "Goodman chart page native lane did not mount the chart controller");

    const goodmanStyles = await page.evaluate(() => {
      const read = selector => {
        const node = document.querySelector(selector);
        const style = node ? getComputedStyle(node) : null;
        return {
          present: Boolean(node),
          position: style?.position ?? null,
          display: style?.display ?? null,
          pointerEvents: style?.pointerEvents ?? null,
          backgroundColor: style?.backgroundColor ?? null
        };
      };
      return {
        mount: read("#chart-svg"),
        overlay: read("#mc-canvas"),
        tooltip: read("#chart-tip")
      };
    });
    assert.equal(goodmanStyles.mount.position, "absolute");
    assert.equal(goodmanStyles.mount.display, "block");
    assert.equal(goodmanStyles.overlay.pointerEvents, "none");
    assert.equal(goodmanStyles.tooltip.position, "absolute");

    await page.goto(`${server.url}/engentus/mill-charge`, { waitUntil: "domcontentloaded" });
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "mill-charge"
    , "Mill Charge route did not settle after navigating under the native chart lane");
    await page.waitForSelector("#view-mill");
    await waitForSurfaceCondition(page, () => Boolean(document.querySelector("#mill-canvas")?.__chartController), "Mill Charge chart page native lane did not mount the canvas controller");
    await assertNoActiveShellIssues(page, "mill-charge-chart-pages-wcss");

    const millChargeStyles = await page.evaluate(() => {
      const mount = document.querySelector("#mill-canvas");
      const mountStyle = mount ? getComputedStyle(mount) : null;
      return {
        mountDisplay: mountStyle?.display ?? null,
        mountRadius: mountStyle?.borderRadius ?? null
      };
    });
    assert.equal(millChargeStyles.mountDisplay, "block");
    assert.equal(millChargeStyles.mountRadius, "10px");

    await page.goto(`${server.url}/engentus/mill-force`, { waitUntil: "domcontentloaded" });
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "mill-force"
    , "Mill Force route did not settle after navigating under the native chart lane");
    await page.waitForSelector("#view-mill-force");
    await waitForSurfaceCondition(page, () => Boolean(document.querySelector("#mill-force-svg-cross")?.__chartController), "Mill Force cross chart did not mount under the native chart lane");
    await assertNoActiveShellIssues(page, "mill-force-chart-pages-wcss");

    const crossStyles = await page.evaluate(() => {
      const overlay = document.querySelector("#mill-force-cross-canvas");
      const tooltip = document.querySelector("#mill-force-cross-tip");
      const overlayStyle = overlay ? getComputedStyle(overlay) : null;
      const tooltipStyle = tooltip ? getComputedStyle(tooltip) : null;
      return {
        overlayPresent: Boolean(overlay),
        overlayPosition: overlayStyle?.position ?? null,
        tooltipPresent: Boolean(tooltip),
        tooltipDisplay: tooltipStyle?.display ?? null,
        tooltipPointerEvents: tooltipStyle?.pointerEvents ?? null
      };
    });
    assert.equal(crossStyles.overlayPresent, true);
    assert.equal(crossStyles.overlayPosition, "absolute");
    assert.equal(crossStyles.tooltipPresent, true);
    assert.equal(crossStyles.tooltipDisplay, "none");
    assert.equal(crossStyles.tooltipPointerEvents, "none");

    await page.click("#surface-millforcetabforcevsangle");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveChartTab") === "force"
      && Boolean(document.querySelector("#mill-force-svg-force")?.__chartController)
    , "Mill Force force-vs-angle chart did not materialize under the native chart lane");
    const forceStyles = await page.evaluate(() => {
      const overlay = document.querySelector("#mill-force-force-canvas");
      const tooltip = document.querySelector("#mill-force-force-tip");
      const overlayStyle = overlay ? getComputedStyle(overlay) : null;
      const tooltipStyle = tooltip ? getComputedStyle(tooltip) : null;
      return {
        overlayPresent: Boolean(overlay),
        overlayPosition: overlayStyle?.position ?? null,
        tooltipPresent: Boolean(tooltip),
        tooltipDisplay: tooltipStyle?.display ?? null
      };
    });
    assert.equal(forceStyles.overlayPresent, true);
    assert.equal(forceStyles.overlayPosition, "absolute");
    assert.equal(forceStyles.tooltipPresent, true);
    assert.equal(forceStyles.tooltipDisplay, "none");

    await page.click("#surface-millforcetabforcerose");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveChartTab") === "rose"
      && Boolean(document.querySelector("#mill-force-svg-rose")?.__chartController)
    , "Mill Force rose chart did not materialize under the native chart lane");
    const roseStyles = await page.evaluate(() => {
      const overlay = document.querySelector("#mill-force-rose-canvas");
      const tooltip = document.querySelector("#mill-force-rose-tip");
      const overlayStyle = overlay ? getComputedStyle(overlay) : null;
      const tooltipStyle = tooltip ? getComputedStyle(tooltip) : null;
      return {
        overlayPresent: Boolean(overlay),
        overlayPosition: overlayStyle?.position ?? null,
        tooltipPresent: Boolean(tooltip),
        tooltipDisplay: tooltipStyle?.display ?? null
      };
    });
    assert.equal(roseStyles.overlayPresent, true);
    assert.equal(roseStyles.overlayPosition, "absolute");
    assert.equal(roseStyles.tooltipPresent, true);
    assert.equal(roseStyles.tooltipDisplay, "none");
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus native shell-base WCSS proof lane preserves shared toolbar, route shell, and window chrome behavior under injected assets", { timeout: 120000 }, async () => {
  const server = await startEngentusUiServer({ devMode: true });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    const switchManifest = {
      theme: "engentus",
      slices: {
        "shell-base": "wcss"
      }
    };
    const { shellCss } = await interceptEngentusWcssAssets(page, switchManifest);
    assert.equal(shellCss.includes("#tb"), true);
    assert.equal(shellCss.includes(".fw"), true);
    assert.equal(shellCss.includes(".prog-fill.done"), true);
    assert.equal(shellCss.includes("#mill-force-chart-wrap iframe"), true);

    await page.goto(`${server.url}/engentus/home`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "home");
    await page.waitForSelector("#view-home");
    await assertNoActiveShellIssues(page, "shell-base-home-wcss");

    const homeChrome = await page.evaluate(() => {
      const toolbar = document.getElementById("tb");
      const menu = document.getElementById("up-menu");
      const body = document.getElementById("body");
      const toolbarStyle = toolbar ? getComputedStyle(toolbar) : null;
      const bodyStyle = body ? getComputedStyle(body) : null;
      return {
        toolbarDisplay: toolbarStyle?.display ?? null,
        toolbarHeight: toolbarStyle?.height ?? null,
        bodyDisplay: bodyStyle?.display ?? null,
        menuDisplay: menu ? getComputedStyle(menu).display : null
      };
    });
    assert.equal(homeChrome.toolbarDisplay, "flex");
    assert.equal(homeChrome.bodyDisplay, "flex");
    assert.equal(homeChrome.menuDisplay, "none");

    await page.evaluate(() => {
      document.getElementById("user-prof")?.click();
    });
    await waitForSurfaceCondition(page, () =>
      document.getElementById("up-menu")?.classList.contains("open") === true,
    "Shell-base native lane did not expose the profile menu open state");
    await assertNoActiveShellIssues(page, "shell-base-home-menu-open");

    await page.goto(`${server.url}/engentus/goodman`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "goodman");
    await page.waitForSelector("#view-goodman");
    await waitForSurfaceCondition(page, () => Boolean(document.querySelector("#chart-svg")?.__chartController), "Goodman chart controller did not mount under the native shell-base lane");
    await assertNoActiveShellIssues(page, "shell-base-goodman-wcss");
    await page.getByRole("button", { name: /stats/i }).click();
    await waitForSurfaceCondition(page, () => Boolean(document.querySelector(".fw")), "Goodman floating window did not open under the native shell-base lane");

    const goodmanChrome = await page.evaluate(() => {
      const windowLayer = document.getElementById("wl");
      const windowNode = document.querySelector(".fw");
      const layerStyle = windowLayer ? getComputedStyle(windowLayer) : null;
      const windowStyle = windowNode ? getComputedStyle(windowNode) : null;
      return {
        layerPointerEvents: layerStyle?.pointerEvents ?? null,
        windowDisplay: windowStyle?.display ?? null,
        windowPosition: windowStyle?.position ?? null
      };
    });
    assert.equal(goodmanChrome.layerPointerEvents, "none");
    assert.equal(goodmanChrome.windowDisplay, "flex");
    assert.equal(goodmanChrome.windowPosition, "absolute");

    await page.goto(`${server.url}/engentus/mill-charge`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "mill-charge");
    await page.waitForSelector("#view-mill");
    await waitForSurfaceCondition(page, () => Boolean(document.querySelector("#mill-canvas")?.__chartController), "Mill Charge chart controller did not mount under the native shell-base lane");
    await assertNoActiveShellIssues(page, "shell-base-mill-charge-wcss");

    const millChargeChrome = await page.evaluate(() => {
      const body = document.getElementById("mill-body");
      const main = document.getElementById("mill-main");
      return {
        bodyDisplay: body ? getComputedStyle(body).display : null,
        mainDisplay: main ? getComputedStyle(main).display : null
      };
    });
    assert.equal(millChargeChrome.bodyDisplay, "flex");
    assert.equal(millChargeChrome.mainDisplay, "flex");

    await page.goto(`${server.url}/engentus/mill-force`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "mill-force");
    await page.waitForSelector("#view-mill-force");
    await waitForSurfaceCondition(page, () => Boolean(document.querySelector("#mill-force-svg-cross")?.__chartController), "Mill Force cross chart did not mount under the native shell-base lane");
    await assertNoActiveShellIssues(page, "shell-base-mill-force-wcss");

    const millForceChrome = await page.evaluate(() => {
      const chartArea = document.getElementById("mill-force-chart-area");
      return {
        chartAreaDisplay: chartArea ? getComputedStyle(chartArea).display : null,
        chartAreaFlexDirection: chartArea ? getComputedStyle(chartArea).flexDirection : null
      };
    });
    assert.equal(millForceChrome.chartAreaDisplay, "flex");
    assert.equal(millForceChrome.chartAreaFlexDirection, "column");

    await page.goto(`${server.url}/engentus/platform-config`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "platform-config-operator");
    await page.waitForSelector("#view-platform-config");
    await assertNoActiveShellIssues(page, "shell-base-platform-config-wcss");

    const platformChrome = await page.evaluate(() => {
      const body = document.getElementById("platform-config-body");
      return {
        bodyDisplay: body ? getComputedStyle(body).display : null,
        bodyOverflow: body ? getComputedStyle(body).overflow : null
      };
    });
    assert.equal(platformChrome.bodyDisplay, "flex");
    assert.equal(platformChrome.bodyOverflow, "hidden");
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus login click dispatches the authored process rule through the generic surface runtime", { timeout: 70000 }, async () => {
  const server = await startEngentusUiServer({ devMode: false });
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
    assert.equal(await page.textContent(".ms-btn span"), "Signing inâ€¦");
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
    await page.waitForFunction(() =>
      document.querySelectorAll("#surface-route-underlay #module-area").length === 1
    );
    assert.notEqual(await page.evaluate(() =>
      getComputedStyle(document.querySelector("#view-login .auth-book")).transform
    ), "none");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "signedIn"
    );
    assert.equal(await page.evaluate(() =>
      window.__surfaceInteractionRuntime.processRuntime.value("EngentusShellActiveRoute")
    ), "home");
    assert.equal(new URL(page.url()).pathname, "/engentus/home");
    await page.waitForSelector("#module-area");
    await waitForNoRouteUnderlay(page, "Login flow never cleared the route underlay after reaching home");
    assert.match(await page.textContent("#module-area"), /Analysis Modules/);
    assert.equal(await page.locator("#view-login").count(), 0);
    assert.equal(await page.locator("#surface-route-underlay").count(), 0);
    await page.evaluate(() => {
      window.__surfaceInteractionRuntime.__sameDocumentProbe = "before-back";
    });
    await page.goBack();
    await waitForSurfaceSettled(page, "Back navigation did not settle on the login route");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "login"
    );
    assert.equal(await page.evaluate(() =>
      window.__surfaceInteractionRuntime.__sameDocumentProbe
    ), "before-back");
    assert.equal(new URL(page.url()).pathname, "/engentus/login");
    await page.waitForSelector("#view-login");
    await waitForNoRouteUnderlay(page, "Back navigation never fully settled on the login route");
    assert.equal(await page.locator("#module-area").count(), 0);
    await page.click(".ms-btn");
    await waitForSurfaceSettled(page, "Second login flow did not settle");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellActiveRoute") === "home"
    , "Second login flow did not switch the active shell route back to home");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "signedIn"
    , "Second login flow did not settle into signedIn auth status");
    await page.waitForSelector("#module-area");
    await page.waitForSelector("#user-prof");
    await waitForNoRouteUnderlay(page, "Login flow never cleared the route underlay after reaching home");
    assert.equal(await page.locator("#surface-route-underlay").count(), 0);
    if (!await page.locator(".up-mi-signout").isVisible()) {
      await page.click("#user-prof");
      await page.waitForSelector(".up-mi-signout");
    }
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
    await page.waitForFunction(() =>
      document.querySelectorAll("#surface-route-underlay #module-area").length === 1
    );
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("EngentusShellAuthStatus") === "signedOut"
    );
    await page.waitForSelector("#view-signout");
    await waitForNoRouteUnderlay(page, "Signout flow never cleared the route underlay after settle");
    assert.equal(await page.locator("#surface-route-underlay").count(), 0);
    const recentExecutionKinds = await page.evaluate(() =>
      (window.world.execution?.recentTasks ?? []).map(task => task.kind)
    );
    assert.equal(recentExecutionKinds.includes("process.rule"), true);
    assert.equal(recentExecutionKinds.includes("process.delay"), true);
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
  const server = await startEngentusUiServer({ devMode: false });
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
    assert.doesNotMatch(html, /bootChartsFromDom\(document, __chartRuntimeFunctions\)/);
    assert.doesNotMatch(html, /\/chart\?chart=MillChargeCrossSection/);
  } finally {
    await server.close();
  }
});

async function assertEngentusHomeModuleCardNavigation(item) {
  const server = await startEngentusUiServer({ devMode: true });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/home`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "home");
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
    const activeIssues = await page.evaluate(async () => {
      await window.world?.rerunProbe?.();
      return (window.world?.issues ?? []).filter(issue => issue.status === "active");
    });
    assert.deepEqual(
      activeIssues,
      [],
      `${item.routeKey}: expected no active runtime issues after module navigation, saw ${JSON.stringify(activeIssues, null, 2)}`
    );
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
      assert.deepEqual(await page.evaluate(() => ({
        cross: document.getElementById("mill-force-svg-cross")?.__chartController?.spec?.view?.modelRef,
        force: document.getElementById("mill-force-svg-force")?.__chartController?.spec?.view?.modelRef ?? null,
        rose: document.getElementById("mill-force-svg-rose")?.__chartController?.spec?.view?.modelRef ?? null
      })), {
        cross: "MillForce",
        force: null,
        rose: null
      });
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

test("Engentus home Goodman card navigates through authored surface interactions", { timeout: 45000 }, async () => {
  await assertEngentusHomeModuleCardNavigation({
    cardId: "surface-modulecardgoodman",
    routeKey: "goodman",
    path: "/engentus/goodman",
    viewId: "view-goodman",
    chartIds: ["chart-svg"]
  });
});

test("Engentus home mill-charge card navigates through authored surface interactions", { timeout: 45000 }, async () => {
  await assertEngentusHomeModuleCardNavigation({
    cardId: "surface-modulecardmillcharge",
    routeKey: "mill-charge",
    path: "/engentus/mill-charge",
    viewId: "view-mill",
    chartIds: ["mill-canvas"]
  });
});

test("Engentus home mill-force card navigates through authored surface interactions", { timeout: 45000 }, async () => {
  await assertEngentusHomeModuleCardNavigation({
    cardId: "surface-modulecardmillforce",
    routeKey: "mill-force",
    path: "/engentus/mill-force",
    viewId: "view-mill-force",
    chartIds: ["mill-force-svg-cross"]
  });
});

test("Engentus Goodman modes switch authored chart views through process state", { timeout: 45000 }, async () => {
  const server = await startEngentusUiServer({ devMode: false });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/goodman`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "goodman");
    await waitForSurfaceCondition(page, () => Boolean(window.__surfaceInteractionRuntime?.processRuntime), "Goodman runtime did not boot");
    await waitForSurfaceCondition(page, () =>
      document.querySelector("#chart-svg defs clipPath rect")?.getAttribute("width") !== null
    , "Goodman chart clip path did not initialize");
    await waitForSurfaceCondition(page, () =>
      Boolean(document.querySelector("#chart-svg")?.__chartController)
    , "Goodman chart controller did not mount");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "static"
    , "Goodman did not settle into static mode");
    assert.deepEqual(await page.evaluate(() => ({
      staticClass: document.querySelector("#surface-goodmanmodestatic")?.className,
      mcClass: document.querySelector("#surface-goodmanmodemontecarlo")?.className,
      deterministicHidden: document.querySelector("#chart-svg")?.hasAttribute("hidden"),
      monteCarloHostCount: document.querySelectorAll("#chart-svg-mc").length,
      deterministicModel: document.querySelector("#chart-svg")?.__chartController?.spec?.view?.modelRef,
      scenarioHidden: document.querySelector("#surface-goodmanscenariosection")?.hasAttribute("hidden"),
      simulationPresent: Boolean(document.querySelector("#surface-goodmansimulationsection")),
      runConfigPresent: Boolean(document.querySelector("#surface-goodmanrunconfigsection")),
      chartStylePresent: Boolean(document.querySelector("#surface-goodmanchartstylesection"))
    })), {
      staticClass: "mode-btn on",
      mcClass: "mode-btn",
      deterministicHidden: false,
      monteCarloHostCount: 0,
      deterministicModel: "BoltFatigue",
      scenarioHidden: false,
      simulationPresent: false,
      runConfigPresent: false,
      chartStylePresent: false
    });

    assert.deepEqual(await page.evaluate(() =>
      [...document.querySelectorAll(".goodman-probe-bolt")].map(card => ({
        title: card.querySelector(".goodman-probe-bolt-name")?.textContent?.trim(),
        rows: [...card.querySelectorAll(".info-row")].map(row => ({
          label: row.querySelector(".info-label")?.textContent?.replace(/\s+/g, " ").trim(),
          value: row.querySelector(".info-value")?.textContent?.replace(/\s+/g, " ").trim()
        }))
      }))
    ), [
      {
        title: "No Jemtec",
        rows: [
          { label: "σ_a", value: "57.6 MPa" },
          { label: "F_shear", value: "2,496 N" },
          { label: "damage/cyc ×10⁶", value: "4.590" },
          { label: "slip threshold", value: "3 MPa" }
        ]
      },
      {
        title: "Jemtec",
        rows: [
          { label: "σ_a", value: "3.0 MPa" },
          { label: "F_shear", value: "131 N" },
          { label: "damage/cyc ×10⁶", value: "≈0" },
          { label: "slip threshold", value: "3 MPa" }
        ]
      }
    ]);

    const goodmanProbeTarget = await page.evaluate(() => {
      const node = document.querySelector("#chart-svg");
      const curve = node?.__chartController?.plan?.layers
        ?.find(layer => layer.name === "curves")
        ?.primitives?.[0]?.points
        ?.find(point => point?.tooltip?.F_shear_N);
      if (!node || !curve) return null;
      const projected = node.projectPoint(curve.x, curve.y);
      const readout = node.probeAtPoint(projected.x, projected.y);
      const reading = readout?.readings?.find(item => item?.tooltip?.F_shear_N);
      return { x: projected.x, y: projected.y, reading };
    });
    assert.equal(typeof goodmanProbeTarget?.reading?.tooltip?.sigma_m_MPa, "number");
    assert.equal(typeof goodmanProbeTarget?.reading?.tooltip?.sigma_a_MPa, "number");
    assert.equal(typeof goodmanProbeTarget?.reading?.tooltip?.F_shear_N, "number");
    assert.equal(typeof goodmanProbeTarget?.reading?.tooltip?.damage_per_cycle_x10_6, "number");
    await page.evaluate(({ x, y }) => {
      const node = document.querySelector("#chart-svg");
      const rect = node.getBoundingClientRect();
      node.parentElement.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        clientX: rect.left + x,
        clientY: rect.top + y
      }));
    }, { x: goodmanProbeTarget.x, y: goodmanProbeTarget.y });
    await page.waitForFunction(() =>
      document.querySelector("#chart-tip")?.style?.display === "block"
    );
    assert.match(await page.textContent("#chart-tip"), /F_shear=/i);
    assert.match(await page.textContent("#chart-tip"), /Δ\/cyc=/i);

    await page.click("#surface-goodmansavestaticsimulationaction");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "mc"
    , "Saving the static Goodman simulation did not switch mode to Monte Carlo");
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
      deterministicPresent: Boolean(document.querySelector("#chart-svg")),
      monteCarloHostCount: document.querySelectorAll("#chart-svg-mc").length,
      scenarioPresent: Boolean(document.querySelector("#surface-goodmanscenariosection")),
      simulationPresent: Boolean(document.querySelector("#surface-goodmansimulationsection")),
      runConfigPresent: Boolean(document.querySelector("#surface-goodmanrunconfigsection")),
      chartStylePresent: Boolean(document.querySelector("#surface-goodmanchartstylesection"))
    })), {
      staticClass: "mode-btn",
      mcClass: "mode-btn on",
      deterministicPresent: true,
      monteCarloHostCount: 0,
      scenarioPresent: false,
      simulationPresent: true,
      runConfigPresent: true,
      chartStylePresent: false
    });

    await page.click("#surface-goodmanmodeedit");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "edit"
    );
    assert.deepEqual(await page.evaluate(() => ({
      editClass: document.querySelector("#surface-goodmanmodeedit")?.className,
      deterministicPresent: Boolean(document.querySelector("#chart-svg")),
      monteCarloHostCount: document.querySelectorAll("#chart-svg-mc").length,
      scenarioPresent: Boolean(document.querySelector("#surface-goodmanscenariosection")),
      simulationPresent: Boolean(document.querySelector("#surface-goodmansimulationsection")),
      runConfigPresent: Boolean(document.querySelector("#surface-goodmanrunconfigsection")),
      chartStylePresent: Boolean(document.querySelector("#surface-goodmanchartstylesection"))
    })), {
      editClass: "mode-btn on",
      deterministicPresent: true,
      monteCarloHostCount: 0,
      scenarioPresent: false,
      simulationPresent: false,
      runConfigPresent: false,
      chartStylePresent: true
    });
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus Goodman authored sidebar controls and windows update process state", { timeout: 180000 }, async () => {
  const server = await startEngentusUiServer({ devMode: false });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/goodman`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "goodman");
    await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));

    assert.equal(await page.locator("#surface-goodmancdfwindow").count(), 0);
    await page.click("#surface-goodmanactioncdf");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanCdfWindowVisible") === true
    , "Goodman CDF action did not update process state");
    await waitForSurfaceCondition(page, () => {
      const node = document.querySelector("#surface-goodmancdfwindow");
      return Boolean(node && !node.hasAttribute("hidden"));
    }, "Goodman CDF window never materialized after its visible state turned on");
    assert.match(await page.textContent("#surface-goodmancdfwindow"), /Failure CDF/);
    assert.match(await page.textContent("#surface-goodmancdfwindow"), /Bolt Survival Over Time/);
    assert.match(await page.textContent("#surface-goodmancdfwindow"), /Run a Monte Carlo simulation to see results\./);
    await page.click("#surface-goodmancdfwindowclose");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanCdfWindowVisible") === false
    );
    assert.equal(await page.locator("#surface-goodmancdfwindow").count(), 0);

    await page.click("#surface-goodmanactionstats");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanStatsWindowVisible") === true
    , "Goodman Stats action did not update process state");
    assert.match(await page.textContent("#surface-goodmanstatswindow"), /Summary Statistics/);
    assert.match(await page.textContent("#surface-goodmanstatswindow"), /No completed simulations\./);
    await page.click("#surface-goodmanstatswindowclose");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanStatsWindowVisible") === false
    );

    await page.click("#surface-goodmanactionanova");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanAnovaWindowVisible") === true
    , "Goodman ANOVA action did not update process state");
    const anovaEmptyText = await page.textContent("#surface-goodmananovawindow");
    assert.match(anovaEmptyText, /ANOVA/);
    assert.match(anovaEmptyText, /Between-Group Comparison/);
    assert.doesNotMatch(anovaEmptyText, /F-statistic/);
    assert.match(anovaEmptyText, /Need >=2 groups with failed bolts for ANOVA\./);
    await page.click("#surface-goodmananovawindowclose");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanAnovaWindowVisible") === false
    );

    await page.click("#surface-goodmansavestaticsimulationaction");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "mc"
    , "Goodman save-static action did not switch to Monte Carlo mode");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunConfigVisible") === true
    , "Goodman save-static action did not turn on run config visibility");
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
      pauseLabel: undefined,
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
    await page.locator("#surface-goodmanstaticappliedshearinput").evaluate(input => {
      input.value = "25000";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanStaticAppliedShear") === 25000
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.params?.F_alt_applied_N === 25000
    );
    await page.locator("#surface-goodmanstaticrpminput").evaluate(input => {
      input.value = "12.5";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanStaticRpm") === 12.5
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.params?.rpm === 12.5
    );
    await page.locator("#surface-goodmanstaticprobemeanstressinput").evaluate(input => {
      input.value = "425";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanStaticProbeMeanStress") === 425
    );
    await page.waitForFunction(() =>
      document.querySelector("#chart-svg")?.__chartController?.spec?.params?.probe_sm === 425
    );
    await page.waitForFunction(() =>
      document.querySelector("#surface-goodmanscenariosection")?.textContent.includes("425 MPa")
    );
    await page.waitForFunction(() =>
      /[\d,.]+ N/.test(document.querySelector("#surface-goodmanscenariosection")?.textContent || "")
    );
    await page.waitForFunction(() =>
      /damage\/cyc ×10⁶\d+\.\d{3}/.test(document.querySelector("#surface-goodmanscenariosection")?.textContent || "")
    );
    assert.equal(await page.locator(".bs-params.open").count(), 0);
    assert.equal(await page.locator(".bs-edit-form.open").count(), 0);
    await page.click("#surface-goodmanboltsetprimaryeditaction");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanBoltPrimaryEditVisible") === true
    );
    assert.equal(await page.locator(".bs-edit-form.open").count(), 1);
    await page.locator("#surface-goodmanboltsetprimaryeditnameinput").fill("No Jemtec Edited");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanBoltPrimaryNameState") === "No Jemtec Edited"
    );
    assert.equal(await page.textContent("#surface-goodmanboltsetprimaryname"), "No Jemtec Edited");
    await page.locator("#surface-goodmanboltsetprimaryeditcolourinput").evaluate(input => {
      input.value = "#22c55e";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanBoltPrimaryColorState") === "#22c55e"
    );
    await page.click("#surface-goodmanboltsetprimaryeditsaveaction");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanBoltPrimaryEditVisible") === false
    );
    assert.equal(await page.locator(".bs-edit-form.open").count(), 0);
    await page.click("#surface-goodmanboltsetprimarychevron");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanBoltPrimaryParamsOpen") === true
    );
    assert.equal(await page.locator(".bs-params.open").count(), 1);

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

    await page.click("#surface-goodmanmodemontecarlo");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "mc"
    );
    await page.click("#surface-goodmansimulationnewaction");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunConfigVisible") === true
    );
    await page.click("#surface-goodmanrunactionstart");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunStatusState") !== "ready"
    );
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanActiveMode") === "mc"
    );
    assert.equal(await page.locator("#chart-svg-mc").count(), 0);
    assert.match(await page.textContent("#prog-lbl"), /(Running|Complete)/);
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("GoodmanRunStatusState") === "done"
    );
    await page.click("#surface-goodmanactionstats");
    await page.waitForFunction(() =>
      !document.querySelector("#surface-goodmanstatswindow")?.hasAttribute("hidden")
    );
    await page.click("#surface-goodmanactioncdf");
    await page.waitForFunction(() =>
      !document.querySelector("#surface-goodmancdfwindow")?.hasAttribute("hidden")
    );
    assert.equal(await page.locator("#chart-svg-mc").count(), 0);
    assert.match(await page.textContent("#prog-lbl"), /Complete/);
    const completedRun = await page.evaluate(() => {
      const fill = document.querySelector("#prog-fill");
      const style = fill ? getComputedStyle(fill) : null;
      const fillRect = fill?.getBoundingClientRect();
      const wrapRect = fill?.parentElement?.getBoundingClientRect();
      return {
        runDisabled: document.querySelector("#surface-goodmanrunactionstart")?.disabled,
        pauseDisabled: document.querySelector("#surface-goodmanrunactionpause")?.disabled,
        pauseHidden: document.querySelector("#surface-goodmanrunactionpause")?.hasAttribute("hidden"),
        resumeHidden: document.querySelector("#surface-goodmanrunactionresume")?.hasAttribute("hidden"),
        stopDisabled: document.querySelector("#surface-goodmanrunactionstop")?.disabled,
        cfgDisabled: document.querySelector("#cfg-n")?.disabled,
        lockText: document.querySelector("#surface-goodmanrunlocknote")?.textContent,
        fillClass: fill?.className ?? "",
        fillOpacity: style?.opacity ?? null,
        fillWidth: fillRect?.width ?? 0,
        wrapWidth: wrapRect?.width ?? 0
      };
    });
    assert.deepEqual({
      runDisabled: completedRun.runDisabled,
      stopDisabled: completedRun.stopDisabled,
      cfgDisabled: completedRun.cfgDisabled,
      lockText: completedRun.lockText
    }, {
      runDisabled: false,
      stopDisabled: true,
      cfgDisabled: true,
      lockText: "🔒 Config locked — clone or create a new simulation to change"
    });
    assert.match(completedRun.fillClass, /\bdone\b/);
    assert.equal(completedRun.fillOpacity, "1");
    assert.equal(completedRun.fillWidth > 0, true);
    assert.equal(completedRun.wrapWidth >= completedRun.fillWidth, true);
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus Mill Charge controls mutate authored process state through generic bindings", { timeout: 45000 }, async () => {
  const server = await startEngentusUiServer({ devMode: false });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/mill-charge`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "mill-charge");
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
  const server = await startEngentusUiServer({ devMode: false });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/mill-force`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "mill-force");
    await waitForSurfaceCondition(page, () => Boolean(window.__surfaceInteractionRuntime?.processRuntime), "Mill Force runtime did not boot");
    await waitForSurfaceCondition(page, () =>
      Boolean(document.querySelector("#mill-force-svg-cross")?.__chartController)
    , "Mill Force cross-section chart did not mount");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveChartTab") === "cross"
    , "Mill Force did not settle into the cross-section tab");
    assert.deepEqual(await page.evaluate(() => ({
      crossHidden: document.querySelector("#mill-force-svg-cross")?.hasAttribute("hidden"),
      forcePresent: Boolean(document.querySelector("#mill-force-svg-force")),
      rosePresent: Boolean(document.querySelector("#mill-force-svg-rose")),
      crossClass: document.querySelector("#surface-millforcetabcrosssection")?.className,
      forceClass: document.querySelector("#surface-millforcetabforcevsangle")?.className
    })), {
      crossHidden: false,
      forcePresent: false,
      rosePresent: false,
      crossClass: "mill-force-cht-tab active",
      forceClass: "mill-force-cht-tab"
    });
    const probeTarget = await page.evaluate(() => {
      const svg = document.querySelector("#mill-force-svg-cross");
      const plan = svg?.__chartController?.plan;
      const forceBars = plan?.layers?.find(layer => layer.name === "force_bars");
      const primitive = plan?.layers
        ?.find(layer => layer.name === "liners")
        ?.primitives
        ?.find(item => item?.tooltip?.method);
      if (!primitive) return null;
      const theta = Math.atan2(
        Math.sin(primitive.theta0) + Math.sin(primitive.theta1),
        Math.cos(primitive.theta0) + Math.cos(primitive.theta1)
      );
      const radius = (Number(primitive.r0) + Number(primitive.r1)) / 2;
      const [r0, r1] = plan.scales.r.domain;
      const rPx = (radius - r0) / ((r1 - r0) || 1) * plan.maxRadius;
      const x = plan.center.x + rPx * Math.sin(theta);
      const y = plan.center.y - rPx * Math.cos(theta);
      const readout = svg.__chartController.node.probeAtPoint(x, y);
      return {
        x,
        y,
        forceBarMark: forceBars?.mark,
        forceBarCount: forceBars?.primitives?.length ?? 0,
        tooltip: readout?.tooltip ?? null
      };
    });
    assert.equal(probeTarget?.forceBarMark, "polar-quad");
    assert.equal(probeTarget?.forceBarCount, 39);
    assert.equal(probeTarget?.tooltip?.method, "grounded");
    assert.equal(typeof probeTarget?.tooltip?.F_resultant_N, "number");
    await page.evaluate(({ x, y }) => {
      const svg = document.querySelector("#mill-force-svg-cross");
      const rendered = svg?.__chartController?.node;
      const rect = svg.getBoundingClientRect();
      const target = rendered?.parentElement ?? rendered ?? svg.parentElement ?? svg;
      target.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        clientX: rect.left + x,
        clientY: rect.top + y
      }));
    }, { x: probeTarget.x, y: probeTarget.y });
    await waitForSurfaceCondition(page, () => {
      const tip = document.querySelector("#mill-force-cross-tip");
      return Boolean(tip && getComputedStyle(tip).display !== "none" && /F Resultant N/i.test(tip.textContent || ""));
    }, "Mill Force cross-section hover tip never appeared");

    await page.click("#surface-millforcetabforcevsangle");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveChartTab") === "force"
    , "Mill Force did not switch process state to the force-vs-angle tab");
    await waitForSurfaceCondition(page, () =>
      Boolean(document.querySelector("#mill-force-svg-force")?.__chartController)
    , "Mill Force force-vs-angle chart never materialized after the tab became active");
    assert.deepEqual(await page.evaluate(() => ({
      crossPresent: Boolean(document.querySelector("#mill-force-svg-cross")),
      forcePresent: Boolean(document.querySelector("#mill-force-svg-force")),
      rosePresent: Boolean(document.querySelector("#mill-force-svg-rose")),
      forceClass: document.querySelector("#surface-millforcetabforcevsangle")?.className
    })), {
      crossPresent: false,
      forcePresent: true,
      rosePresent: false,
      forceClass: "mill-force-cht-tab active"
    });
    const forceProbeTarget = await page.evaluate(() => {
      const svg = document.querySelector("#mill-force-svg-force");
      const plan = svg?.__chartController?.plan;
      const point = plan?.layers
        ?.find(layer => layer.name === "fres")
        ?.primitives
        ?.[0]
        ?.points
        ?.filter(item => item?.tooltip?.method && Number.isFinite(item.x) && Number.isFinite(item.y))
        ?.sort((a, b) => Math.abs(a.x - 180) - Math.abs(b.x - 180))
        ?.[0];
      if (!point) return null;
      const projected = svg.__chartController.node.projectPoint(point.x, point.y);
      const readout = svg.__chartController.node.probeAtPoint(projected.x, projected.y);
      return { x: projected.x, y: projected.y, reading: readout?.readings?.find(item => item?.tooltip?.method) ?? null };
    });
    assert.equal(forceProbeTarget?.reading?.tooltip?.method, "grounded");
    assert.equal(typeof forceProbeTarget?.reading?.tooltip?.F_resultant_N, "number");
    await page.evaluate(({ x, y }) => {
      const svg = document.querySelector("#mill-force-svg-force");
      const rendered = svg?.__chartController?.node;
      const rect = svg.getBoundingClientRect();
      const target = rendered?.parentElement ?? rendered ?? svg.parentElement ?? svg;
      target.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        clientX: rect.left + x,
        clientY: rect.top + y
      }));
    }, { x: forceProbeTarget.x, y: forceProbeTarget.y });
    await waitForSurfaceCondition(page, () => {
      const tip = document.querySelector("#mill-force-force-tip");
      return Boolean(tip && getComputedStyle(tip).display !== "none" && /F Resultant N/i.test(tip.textContent || ""));
    }, "Mill Force force-vs-angle hover tip never appeared");

    await page.click("#surface-millforcetabforcerose");
    await waitForSurfaceCondition(page, () =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveChartTab") === "rose"
    , "Mill Force did not switch process state to the force-rose tab");
    await waitForSurfaceCondition(page, () =>
      Boolean(document.querySelector("#mill-force-svg-rose")?.__chartController)
    , "Mill Force force-rose chart never materialized after the tab became active");
    assert.deepEqual(await page.evaluate(() => ({
      crossPresent: Boolean(document.querySelector("#mill-force-svg-cross")),
      forcePresent: Boolean(document.querySelector("#mill-force-svg-force")),
      rosePresent: Boolean(document.querySelector("#mill-force-svg-rose")),
      roseClass: document.querySelector("#surface-millforcetabforcerose")?.className
    })), {
      crossPresent: false,
      forcePresent: false,
      rosePresent: true,
      roseClass: "mill-force-cht-tab active"
    });
    const roseProbeTarget = await page.evaluate(() => {
      const svg = document.querySelector("#mill-force-svg-rose");
      const plan = svg?.__chartController?.plan;
      const point = plan?.layers
        ?.find(layer => layer.name === "rose")
        ?.primitives
        ?.[0]
        ?.points
        ?.find(item => item?.tooltip?.method);
      if (!point) return null;
      const [r0, r1] = plan.scales.r.domain;
      const rPx = (point.r - r0) / ((r1 - r0) || 1) * plan.maxRadius;
      const x = plan.center.x + rPx * Math.sin(point.theta);
      const y = plan.center.y - rPx * Math.cos(point.theta);
      const readout = svg.__chartController.node.probeAtPoint(x, y);
      return { x, y, tooltip: readout?.tooltip ?? null };
    });
    assert.equal(roseProbeTarget?.tooltip?.method, "grounded");
    assert.equal(typeof roseProbeTarget?.tooltip?.F_resultant_N, "number");
    await page.evaluate(({ x, y }) => {
      const svg = document.querySelector("#mill-force-svg-rose");
      const rendered = svg?.__chartController?.node;
      const rect = svg.getBoundingClientRect();
      const target = rendered?.parentElement ?? rendered ?? svg.parentElement ?? svg;
      target.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        clientX: rect.left + x,
        clientY: rect.top + y
      }));
    }, { x: roseProbeTarget.x, y: roseProbeTarget.y });
    await waitForSurfaceCondition(page, () => {
      const tip = document.querySelector("#mill-force-rose-tip");
      return Boolean(tip && getComputedStyle(tip).display !== "none" && /F Resultant N/i.test(tip.textContent || ""));
    }, "Mill Force force-rose hover tip never appeared");
  } finally {
    await browser.close();
    await server.close();
  }
});

test("Engentus Mill Force controls update authored state, chart params, and results", { timeout: 45000 }, async () => {
  const server = await startEngentusUiServer({ devMode: false });
  const browser = await launchBrowser({
    headless: true,
    viewport: { width: 1280, height: 900 }
  });
  try {
    const page = await browser.context.newPage();
    await page.goto(`${server.url}/engentus/mill-force`, { waitUntil: "domcontentloaded" });
    await ensureEngentusSignedIn(page, "mill-force");
    await page.waitForFunction(() => Boolean(window.__surfaceInteractionRuntime?.processRuntime));
    await page.waitForFunction(() => Boolean(document.querySelector("#mill-force-svg-cross")?.__chartController));
    assert.deepEqual(await page.evaluate(() => ({
      modelHidden: document.querySelector("#surface-millforcemodelsection")?.hasAttribute("hidden"),
      compareSectionPresent: Boolean(document.querySelector("#surface-millforcecomparesection")),
      mcSectionPresent: [...document.querySelectorAll(".ssec")]
        .some(section => section.textContent.includes("Monte Carlo Config")),
      mcBodyPresent: Boolean(document.querySelector("#surface-millforcemcbody")),
      mcChevron: document.querySelector("#surface-millforcemcchevron")?.textContent,
      model: window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveModel")
    })), {
      modelHidden: false,
      compareSectionPresent: false,
      mcSectionPresent: true,
      mcBodyPresent: false,
      mcChevron: "▼",
      model: "grounded"
    });
    assert.equal(await page.evaluate(() =>
      document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.gammaText
    ), "2.5°");

    await page.locator("#surface-millforcemodelfaithfulinput").check();
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveModel") === "faithful"
    );
    await page.waitForFunction(() =>
      document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.active_method === "faithful"
    );
    assert.deepEqual(await page.evaluate(() => ({
      groundedChecked: document.querySelector("#surface-millforcemodelgroundedinput")?.checked,
      faithfulChecked: document.querySelector("#surface-millforcemodelfaithfulinput")?.checked,
      modelChoiceClass: document.querySelector(".mill-force-model-radios")?.className,
      modelNoteExists: Boolean(document.querySelector("#surface-millforcemodelnote")),
      chartMethod: document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.active_method,
      modelResultRow: [...document.querySelectorAll(".mill-force-result-row")]
        .map(row => row.textContent)
        .find(text => text.includes("Model"))
    })), {
      groundedChecked: false,
      faithfulChecked: true,
      modelChoiceClass: "mill-force-model-radios",
      modelNoteExists: false,
      chartMethod: "faithful",
      modelResultRow: undefined
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
    assert.equal(resultOutputs.gammaText, "2.4°");
    assert.match(resultOutputs.omegaText, /rad\/s$/);
    assert.match(resultOutputs.forceText, /kN$/);
    assert.equal(resultOutputs.resultRows.some(text => text.includes("Max |F|")), true);

    await page.getByRole("button", { name: "Compare" }).click();
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveAnalysisMode") === "compare"
    );
    await page.waitForFunction(() =>
      document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.analysis_mode === "compare"
    );
    const modeState = await page.evaluate(() => ({
      single: document.querySelector("#surface-millforcemodesingle")?.className,
      compare: document.querySelector("#surface-millforcemodecompare")?.className,
      activeChartMode: document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.analysis_mode,
      modeResultRow: [...document.querySelectorAll(".mill-force-result-row")]
        .map(row => row.textContent)
        .find(text => text.includes("Mode"))
    }));
    assert.equal(modeState.single, "mill-force-pill");
    assert.equal(modeState.compare, "mill-force-pill active");
    assert.equal(modeState.activeChartMode, "compare");
    assert.equal(modeState.modeResultRow, undefined);
    const chartAnnotationText = await page.evaluate(() => ({
      texts: [...document.querySelectorAll("#mill-force-svg-cross text")].map(node => node.textContent),
      max: document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.F_resultant_scale_max_text,
      min: document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.F_resultant_scale_min_text
    }));
    assert.equal(chartAnnotationText.texts.includes("Grounded"), true);
    assert.equal(chartAnnotationText.texts.includes("Faithful"), true);
    assert.equal(chartAnnotationText.texts.includes("|F|"), true);
    assert.equal(chartAnnotationText.texts.includes(chartAnnotationText.max), true);
    assert.equal(chartAnnotationText.texts.includes(chartAnnotationText.min), true);
    const compareState = await page.evaluate(() => ({
      modelPresent: Boolean(document.querySelector("#surface-millforcemodelsection")),
      compareSectionPresent: Boolean(document.querySelector("#surface-millforcecomparesection")),
      mcSectionPresent: [...document.querySelectorAll(".ssec")]
        .some(section => section.textContent.includes("Monte Carlo Config")),
      mcBodyPresent: Boolean(document.querySelector("#surface-millforcemcbody")),
      mcChevron: document.querySelector("#surface-millforcemcchevron")?.textContent,
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
    assert.equal(compareState.modelPresent, false);
    assert.equal(compareState.compareSectionPresent, false);
    assert.equal(compareState.mcSectionPresent, true);
    assert.equal(compareState.mcBodyPresent, false);
    assert.equal(compareState.mcChevron, "▼");
    assert.match(compareState.deltaOutputs.fill, /^[+-]?\d+\.\d°$/u);
    assert.match(compareState.deltaOutputs.fillPct, /^[+-]?\d+\.\d\d%$/);
    assert.match(compareState.deltaOutputs.resultant, /^[+-]?\d+\.\d kN$/);

    await page.getByRole("button", { name: "Monte Carlo" }).click();
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceActiveAnalysisMode") === "mc"
    );
    await page.waitForFunction(() =>
      document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.analysis_mode === "static"
    );
    assert.deepEqual(await page.evaluate(() => ({
      compareSectionPresent: Boolean(document.querySelector("#surface-millforcecomparesection")),
      chartMode: document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.analysis_mode,
      chartState: window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceChartAnalysisMode"),
      mcSectionPresent: [...document.querySelectorAll(".ssec")]
        .some(section => section.textContent.includes("Monte Carlo Config")),
      mcBodyHidden: document.querySelector("#surface-millforcemcbody")?.hasAttribute("hidden"),
      mcChevron: document.querySelector("#surface-millforcemcchevron")?.textContent,
      runLabel: document.querySelector("#surface-millforcemcrunaction")?.textContent,
      clearLabel: document.querySelector("#surface-millforcemcclearaction")?.textContent,
      clearDisabled: document.querySelector("#surface-millforcemcclearaction")?.disabled,
      samplesRowClass: document.querySelector("#surface-millforcemcsamplesrow")?.className,
      samplesLabel: document.querySelector("#surface-millforcemcsamplesrow label")?.textContent,
      samplesInputStyle: document.querySelector("#mill-force-mc-n")?.getAttribute("style"),
      mcParamRows: [...document.querySelectorAll("#surface-millforcemcbody .mc-row")]
        .map(row => row.textContent.trim())
    })), {
      compareSectionPresent: false,
      chartMode: "static",
      chartState: "static",
      mcSectionPresent: true,
      mcBodyHidden: false,
      mcChevron: "▲",
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
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceMcStatusState") === "calculating"
    );
    assert.equal(await page.textContent("#surface-millforcemcstatuscalculatingtext"), "Running…");
    assert.equal(await page.locator("#surface-millforcemcp90maxrow:not([hidden])").count(), 0);
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceMcStatusState") === "running"
    );
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceChartAnalysisMode") === "mc"
    );
    await page.waitForFunction(() =>
      document.querySelector("#surface-millforcemcstatuscomputedtext")?.textContent === "350 samples computed"
    );
    assert.equal(await page.textContent("#surface-millforcemcstatuscomputedtext"), "350 samples computed");
    await page.waitForFunction(() =>
      /kN$/.test(document.querySelector("#surface-millforcemcp90maxvalue")?.textContent || "")
    );
    assert.match(await page.textContent("#surface-millforcemcp10maxrow"), /P10 max \|F_r\|/);
    assert.match(await page.textContent("#surface-millforcemcp90maxrow"), /P90 max \|F_r\|/);
    assert.equal(await page.evaluate(() =>
      document.querySelector("#mill-force-svg-cross")?.__surfaceCapabilityOutputs?.F_r_p90_abs_max_text
        === document.querySelector("#surface-millforcemcp90maxvalue")?.textContent
    ), true);
    assert.equal(await page.locator("#surface-millforcemcclearaction").isEnabled(), true);
    await page.waitForFunction(() =>
      document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.analysis_mode === "mc"
      && document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.n_samples === 350
    );
    const mcOverlay = await page.evaluate(() => {
      const controller = document.querySelector("#mill-force-svg-cross")?.__chartController;
      const p90 = controller?.plan?.layers?.find(layer => layer.name === "mc_p90");
      const p10 = controller?.plan?.layers?.find(layer => layer.name === "mc_p10");
      return {
        sampleCount: controller?.spec?.params?.n_samples,
        jTotalFree: controller?.spec?.params?.mc_J_total_free,
        p90Mark: p90?.mark,
        p10Mark: p10?.mark,
        p90Hidden: p90?.hidden === true,
        p10Hidden: p10?.hidden === true,
        p90Count: p90?.primitives?.length ?? 0,
        p10Count: p10?.primitives?.length ?? 0,
        firstBandHasReadout: typeof p90?.primitives?.[0]?.tooltip?.F_r_p90_N === "number"
      };
    });
    assert.deepEqual(mcOverlay, {
      sampleCount: 350,
      jTotalFree: true,
      p90Mark: "polar-quad",
      p10Mark: "polar-point",
      p90Hidden: false,
      p10Hidden: false,
      p90Count: 39,
      p10Count: 39,
      firstBandHasReadout: true
    });
    await page.click("#surface-millforcemcclearaction");
    await page.waitForFunction(() =>
      window.__surfaceInteractionRuntime?.processRuntime?.value("MillForceMcStatusState") === "cleared"
    );
    await page.waitForFunction(() =>
      document.querySelector("#mill-force-svg-cross")?.__chartController?.spec?.params?.analysis_mode === "static"
    );
    assert.equal(await page.textContent("#surface-millforcemcstatusclearedtext"), "Cleared");
    assert.equal(await page.locator("#surface-millforcemcp90maxrow:not([hidden])").count(), 0);
    assert.equal(await page.locator("#surface-millforcemcclearaction").isEnabled(), false);
    assert.deepEqual(await page.evaluate(() => {
      const runtime = window.__surfaceInteractionRuntime?.processRuntime;
      const controller = document.querySelector("#mill-force-svg-cross")?.__chartController;
      const p90 = controller?.plan?.layers?.find(layer => layer.name === "mc_p90");
      const p10 = controller?.plan?.layers?.find(layer => layer.name === "mc_p10");
      return {
        activeMode: runtime?.value("MillForceActiveAnalysisMode"),
        chartState: runtime?.value("MillForceChartAnalysisMode"),
        chartMode: controller?.spec?.params?.analysis_mode,
        p90Hidden: p90?.hidden === true,
        p10Hidden: p10?.hidden === true
      };
    }), {
      activeMode: "mc",
      chartState: "static",
      chartMode: "static",
      p90Hidden: true,
      p10Hidden: true
    });
  } finally {
    await browser.close();
    await server.close();
  }
});
