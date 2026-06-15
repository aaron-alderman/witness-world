import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { startUiServer } from "./support/harness.js";

test("engentus frontend serves the login shell and loads no pipeline witnesses", async () => {
  const { world, url, close } = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus/app.wtoml"),
    serverRunnerId: "engentus_server"
  });
  try {
    const root = await fetch(`${url}/`);
    assert.equal(root.status, 200);
    const rootHtml = await root.text();
    assert.match(rootHtml, /Welcome back/);
    assert.match(rootHtml, /Sign in to your Engentus account/);
    assert.match(rootHtml, /Structural Intelligence/);
    assert.match(rootHtml, /SAG Mills/);
    assert.match(rootHtml, /\/app-static\/app\/engentus-shell\.css/);
    assert.doesNotMatch(rootHtml, /Frontend-only DESIRE app/);

    const alias = await fetch(`${url}/engentus`);
    assert.equal(alias.status, 200);
    const aliasHtml = await alias.text();
    assert.match(aliasHtml, /Welcome back/);

    const home = await fetch(`${url}/engentus/home`);
    assert.equal(home.status, 200);
    const homeHtml = await home.text();
    assert.match(homeHtml, /Analysis Modules/);
    assert.doesNotMatch(homeHtml, /engentus-bootstrap\.js/);

    const goodman = await fetch(`${url}/engentus/goodman`);
    assert.equal(goodman.status, 200);
    const goodmanHtml = await goodman.text();
    assert.match(goodmanHtml, /<svg id="chart-svg" class="chart-page__mount chart-page__mount--goodman" data-chart-spec=/);
    assert.match(goodmanHtml, /\/app-static\/app\/runtime\/engentus-browser-runtime\.js/);
    assert.doesNotMatch(goodmanHtml, /<iframe[^>]+src="\/chart\?chart=GoodmanDiagram"/);
    assert.doesNotMatch(goodmanHtml, /pageModuleHref/);
    assert.doesNotMatch(goodmanHtml, /bootstrapSurfacePage/);
    assert.doesNotMatch(goodmanHtml, /presenters\//);

    const millCharge = await fetch(`${url}/engentus/mill-charge`);
    assert.equal(millCharge.status, 200);
    const millChargePageHtml = await millCharge.text();
    assert.match(millChargePageHtml, /<canvas id="mill-canvas" class="chart-page__mount chart-page__mount--mill-charge" data-chart-spec=/);
    assert.match(millChargePageHtml, /\/app-static\/app\/runtime\/engentus-browser-runtime\.js/);
    assert.doesNotMatch(millChargePageHtml, /<iframe[^>]+src="\/chart\?chart=MillChargeCrossSection"/);
    assert.doesNotMatch(millChargePageHtml, /bootstrapSurfacePage/);
    assert.doesNotMatch(millChargePageHtml, /presenters\//);

    const millForce = await fetch(`${url}/engentus/mill-force`);
    assert.equal(millForce.status, 200);
    const millForcePageHtml = await millForce.text();
    assert.match(millForcePageHtml, /\/app-static\/app\/runtime\/engentus-browser-runtime\.js/);
    assert.match(millForcePageHtml, /id="mill-force-svg-cross"/);
    assert.match(millForcePageHtml, /id="mill-force-svg-force"[^>]*style="display:none"/);
    assert.match(millForcePageHtml, /id="mill-force-svg-rose"[^>]*style="display:none"/);
    assert.match(millForcePageHtml, /id="mill-force-mc-canvas"/);
    assert.match(millForcePageHtml, /id="mill-force-tip"/);
    assert.doesNotMatch(millForcePageHtml, /<iframe[^>]+src="\/chart\?chart=MillForceCross"/);
    assert.doesNotMatch(millForcePageHtml, /bootstrapSurfacePage/);
    assert.doesNotMatch(millForcePageHtml, /presenters\//);

    const stylesheet = await fetch(`${url}/app-static/app/engentus-shell.css`);
    assert.equal(stylesheet.status, 200);
    assert.match(await stylesheet.text(), /#tb-brand/);

    const logo = await fetch(`${url}/app-static/img/engentus.png`);
    assert.equal(logo.status, 200);

    const chart = await fetch(`${url}/chart?chart=GoodmanDiagram`);
    assert.equal(chart.status, 200);
    const chartHtml = await chart.text();
    assert.match(chartHtml, /GoodmanDiagram/);
    assert.match(chartHtml, /engentus-chart-pages\.css/);
    assert.match(chartHtml, /chart-page chart-page--goodman/);
    assert.match(chartHtml, /<svg id="chart-svg" class="chart-page__mount chart-page__mount--goodman" data-chart-spec=/);
    assert.match(chartHtml, /<canvas id="mc-canvas" class="chart-page__overlay-canvas" data-chart-page-overlay="canvas"><\/canvas>/);
    assert.match(chartHtml, /<div id="chart-tip" class="chart-page__tooltip chart-page__tooltip--goodman" data-chart-page-overlay="tooltip"><\/div>/);
    assert.doesNotMatch(chartHtml, /#chart\{position:absolute;inset:16px/);

    const millChargeChart = await fetch(`${url}/chart?chart=MillChargeCrossSection`);
    assert.equal(millChargeChart.status, 200);
    const millChargeHtml = await millChargeChart.text();
    assert.match(millChargeHtml, /<canvas id="mill-canvas" class="chart-page__mount chart-page__mount--mill-charge" data-chart-spec=/);
    assert.match(millChargeHtml, /\/app-static\/app\/chart-functions\/mill-charge-kernels\.js/);

    const millForceChart = await fetch(`${url}/chart?chart=MillForceCross`);
    assert.equal(millForceChart.status, 200);
    const millForceHtml = await millForceChart.text();
    assert.match(millForceHtml, /<svg id="mill-force-svg-cross" class="chart-page__mount chart-page__mount--mill-force" data-chart-spec=/);
    assert.match(millForceHtml, /<canvas id="mill-force-mc-canvas" class="chart-page__overlay-canvas" data-chart-page-overlay="canvas"><\/canvas>/);
    assert.match(millForceHtml, /<div id="mill-force-tip" class="chart-page__tooltip chart-page__tooltip--mill-force" data-chart-page-overlay="tooltip"><\/div>/);
    assert.match(millForceHtml, /\/app-static\/app\/chart-functions\/mill-force-kernels\.js/);

    const chartStyles = await fetch(`${url}/app-static/app/engentus-chart-pages.css`);
    assert.equal(chartStyles.status, 200);
    const chartCss = await chartStyles.text();
    assert.match(chartCss, /#chart-svg,\s*#mc-canvas/);
    assert.match(chartCss, /#mill-canvas/);
    assert.match(chartCss, /#mill-force-svg-cross,\s*#mill-force-svg-force,\s*#mill-force-svg-rose/);

    const chartClient = await fetch(`${url}/canvas-lib/chart-client.js`);
    assert.equal(chartClient.status, 200);
    assert.match(await chartClient.text(), /mountChart/);

    assert.equal(world.allWitnesses().some(witness =>
      JSON.stringify(witness.body ?? {}).includes("engentus.pipeline.")
    ), false);
  } finally {
    await close();
  }
});
