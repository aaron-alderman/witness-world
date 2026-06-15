import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createWorld } from "../../src/kernel.js";
import {
  applyDesire,
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "../../src/desire/index.js";
import { buildMountedChartRuntime, createHandlers, resolveChartSpec } from "./runtime.js";
import { renderChartHtml, chartRuntimeBundleSource } from "./chart-page.js";
import { planChart } from "./gog-runtime.js";

const appDir = path.join(process.cwd(), "examples", "engentus", "app");

async function worldWithFiles(files) {
  const world = createWorld();
  for (const file of files) {
    const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(path.join(appDir, file)));
    applyDesire(world, desire);
  }
  return world;
}

async function worldWithGoodman() {
  return worldWithFiles(["models/goodman.rvm", "views/goodman.rvm"]);
}

test("resolveChartSpec assembles {model, view} from the witnessed world", async () => {
  const world = await worldWithGoodman();
  const spec = resolveChartSpec(world.allWitnesses(), "GoodmanDiagram");
  assert.ok(spec, "expected to resolve GoodmanDiagram");
  assert.equal(spec.view.modelRef, "BoltFatigue");
  assert.equal(spec.pageProps.pageStylesheetHref, "/app-static/app/engentus-chart-pages.css");
  assert.equal(spec.pageProps.bodyClass, "chart-page chart-page--goodman");
  assert.equal(spec.pageProps.mountId, "chart-svg");
  assert.equal(spec.pageProps.mountTag, "svg");
  assert.equal(spec.pageProps.functionsModules, "/app-static/app/chart-functions/goodman-stdlib.js");
  assert.equal(spec.pageProps.functionsExports, "goodmanFunctions");
  assert.ok(spec.model.axes.some(a => a.name === "sm"));
  assert.ok(spec.model.derives.some(d => d.name === "band"));
  assert.ok(spec.view.layers.some(l => l.name === "bands"));
});

test("the inlined chart runtime bundle is valid JS and still evaluates the model", async () => {
  const source = chartRuntimeBundleSource()
    + "\nexport { evaluateModel, planChart, bootChartsFromDom };\n";
  const tmp = path.join(os.tmpdir(), `chart-bundle-${process.pid}.mjs`);
  fs.writeFileSync(tmp, source, "utf8");
  try {
    const mod = await import(pathToFileURL(tmp).href);
    const appFns = await import(pathToFileURL(path.join(appDir, "chart-functions", "goodman-stdlib.js")).href);
    assert.equal(typeof mod.evaluateModel, "function");
    assert.equal(typeof mod.planChart, "function");
    assert.equal(typeof mod.bootChartsFromDom, "function");
    assert.equal(typeof appFns.goodmanFunctions.goodman_sa, "function");

    const world = await worldWithGoodman();
    const spec = resolveChartSpec(world.allWitnesses(), "GoodmanDiagram");
    const evaluated = mod.evaluateModel(spec.model, { functions: appFns.goodmanFunctions });
    const plan = mod.planChart(spec.view, evaluated, { width: 800, height: 520 });
    assert.deepEqual(plan.scales.x.domain, [0, 650]);
    assert.ok(plan.layers.find(l => l.name === "bands").primitives.length > 0);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test("chart page stays a code-first runtime assembly seam instead of depending on widget or WTOML page runtimes", () => {
  const source = fs.readFileSync(new URL("./chart-page.js", import.meta.url), "utf8");

  assert.equal(source.includes("export function chartRuntimeBundleSource"), true);
  assert.equal(source.includes("export function chartRuntimeAssets"), true);
  assert.equal(source.includes("export function renderChartHtml"), true);
  assert.equal(source.includes("bootChartsFromDom(document"), true);
  assert.equal(source.includes("applyWitnessToml"), false);
  assert.equal(source.includes("renderWidgetPage"), false);
  assert.equal(source.includes("frontendProgram"), false);
  assert.equal(source.includes('"goodman-stdlib.js"'), false);
  assert.equal(source.includes('"goodmanFunctions"'), false);
});

test("shared chart runtime sources stay free of app-specific defaults", () => {
  const runtimeSource = fs.readFileSync(new URL("./runtime.js", import.meta.url), "utf8");
  const gogSource = fs.readFileSync(new URL("./gog-runtime.js", import.meta.url), "utf8");

  assert.equal(runtimeSource.includes('"GoodmanDiagram"'), false);
  assert.equal(runtimeSource.includes("engentus/Goodman"), false);
  assert.equal(gogSource.includes("cross-section, rose"), false);
});

test("plugin.chart-runtime keeps only generic runtime assets in its own directory", () => {
  const files = fs.readdirSync(new URL(".", import.meta.url))
    .filter(name => !name.endsWith(".test.js"))
    .sort();

  assert.deepEqual(files, [
    "chart-client.js",
    "chart-page.js",
    "dataflow-eval.js",
    "gog-runtime.js",
    "plugin.json",
    "runtime.js"
  ]);
});

test("renderChartHtml emits a self-contained page embedding the spec and authored helper urls", async () => {
  const world = await worldWithGoodman();
  const spec = resolveChartSpec(world.allWitnesses(), "GoodmanDiagram");
  const html = renderChartHtml({ title: "GoodmanDiagram", spec, pageProps: spec.pageProps });
  assert.match(html, /d3js\.org\/d3/);
  assert.match(html, /data-chart-spec=/);
  assert.match(html, /await Promise\.all/);
  assert.match(html, /import\(dep\.href\)/);
  assert.match(html, /\/app-static\/app\/chart-functions\/goodman-stdlib\.js/);
  assert.match(html, /BoltFatigue/);
  assert.match(html, /engentus-chart-pages\.css/);
  assert.match(html, /chart-page chart-page--goodman/);
  assert.match(html, /data-chart-page-host/);
  assert.match(html, /<svg id="chart-svg" class="chart-page__mount chart-page__mount--goodman" data-chart-spec=/);
  assert.match(html, /<canvas id="mc-canvas" class="chart-page__overlay-canvas" data-chart-page-overlay="canvas"><\/canvas>/);
  assert.match(html, /<div id="chart-tip" class="chart-page__tooltip chart-page__tooltip--goodman" data-chart-page-overlay="tooltip"><\/div>/);
  assert.doesNotMatch(html, /#chart\{position:absolute;inset:16px/);
});

test("disc-frame chart pages can mount on an authored canvas host", async () => {
  const world = await worldWithFiles(["models/mill-charge.rvm", "views/mill-charge.rvm"]);
  const spec = resolveChartSpec(world.allWitnesses(), "MillChargeCrossSection");
  const html = renderChartHtml({ title: "MillChargeCrossSection", spec, pageProps: spec.pageProps });
  assert.equal(spec.pageProps.mountTag, "canvas");
  assert.match(html, /<canvas id="mill-canvas" class="chart-page__mount chart-page__mount--mill-charge" data-chart-spec=/);
  assert.match(html, /\/app-static\/app\/chart-functions\/mill-charge-kernels\.js/);
});

test("mounted chart runtime resolves nested chart surfaces under the active app surface", async () => {
  const world = await worldWithFiles(["models/mill-charge.rvm", "views/mill-charge.rvm", "shell.rvm"]);
  const millCharge = world.allWitnesses()
    .find(witness => witness.process === "desire.defineSurface" && witness.body?.id === "EngentusMillChargeApp")
    ?.body;
  assert.ok(millCharge, "expected EngentusMillChargeApp surface");

  const runtime = buildMountedChartRuntime({ world, activeSurface: millCharge });
  assert.ok(runtime, "expected chart runtime for active Mill Charge surface");
  const chartSurface = world.allWitnesses()
    .find(witness => witness.process === "desire.defineSurface" && witness.body?.id === "MillChargeCrossSection")
    ?.body;
  const markup = runtime.renderMountedChart(chartSurface);

  assert.match(markup, /<canvas id="mill-canvas"/);
  assert.match(markup, /data-chart-spec=/);
  assert.match(markup, /chart-page__mount--mill-charge/);
});

test("mounted chart runtime discovers chart surfaces outside the initial active route", async () => {
  const world = await worldWithFiles(["models/mill-charge.rvm", "views/mill-charge.rvm", "shell.rvm"]);
  const witnesses = world.allWitnesses();
  const rootSurface = witnesses
    .find(witness => witness.process === "desire.defineSurface" && witness.body?.id === "EngentusRoot")
    ?.body;
  const homeSurface = witnesses
    .find(witness => witness.process === "desire.defineSurface" && witness.body?.id === "EngentusHome")
    ?.body;
  const chartSurface = witnesses
    .find(witness => witness.process === "desire.defineSurface" && witness.body?.id === "MillChargeCrossSection")
    ?.body;

  const runtime = buildMountedChartRuntime({ world, activeSurface: homeSurface, rootSurface });
  assert.ok(runtime, "expected chart runtime assets even when the initial route is Home");
  const markup = runtime.renderMountedChart(chartSurface);

  assert.match(markup, /<canvas id="mill-canvas"/);
  assert.match(markup, /data-chart-spec=/);
});

test("chart pages can compose multiple authored function libraries", async () => {
  const world = await worldWithFiles(["models/goodman.rvm", "views/goodman.rvm"]);
  const spec = resolveChartSpec(world.allWitnesses(), "GoodmanMCBands");
  const html = renderChartHtml({ title: "GoodmanMCBands", spec, pageProps: spec.pageProps });
  assert.equal(spec.pageProps.functionsModules, "/app-static/app/chart-functions/goodman-stdlib.js,/app-static/app/chart-functions/sampling.js");
  assert.equal(spec.pageProps.functionsExports, "goodmanFunctions,samplingFunctions");
  assert.match(html, /\/app-static\/app\/chart-functions\/goodman-stdlib\.js/);
  assert.match(html, /\/app-static\/app\/chart-functions\/sampling\.js/);
});

test("polar chart plans preserve authored tooltip channels on primitives", async () => {
  const source = chartRuntimeBundleSource()
    + "\nexport { evaluateModel, planChart };\n";
  const tmp = path.join(os.tmpdir(), `chart-bundle-tooltip-${process.pid}.mjs`);
  fs.writeFileSync(tmp, source, "utf8");
  try {
    const mod = await import(pathToFileURL(tmp).href);
    const appFns = await import(pathToFileURL(path.join(appDir, "chart-functions", "mill-force-kernels.js")).href);
    const world = await worldWithFiles(["models/mill-force.rvm", "views/mill-force.rvm"]);
    const spec = resolveChartSpec(world.allWitnesses(), "MillForceCross");
    const evaluated = mod.evaluateModel(spec.model, {
      functions: appFns.millForceKernels,
      params: { active_method: "grounded", analysis_mode: "static" }
    });
    const plan = mod.planChart(spec.view, evaluated, { width: 520, height: 520 });
    const liner = plan.layers.find(layer => layer.name === "liners");
    const first = liner?.primitives?.[0];

    assert.ok(first, "expected liner primitives");
    assert.equal(first.tooltip.liner, 1);
    assert.equal(first.tooltip.method, "grounded");
    assert.equal(typeof first.tooltip.mass_kg, "number");
    assert.equal(typeof first.tooltip.F_r_N, "number");
    assert.equal(typeof first.tooltip.F_t_N, "number");
    assert.equal(typeof first.tooltip.F_resultant_N, "number");
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test("polar line plans preserve generic authored style channels", () => {
  const view = {
    frame: "polar",
    encoding: {
      theta: { field: "theta" },
      r: { field: "r", domain: [0, 1] }
    },
    layers: [{
      name: "guide",
      mark: "line",
      over: ["point"],
      encode: {
        theta: "theta",
        r: "r",
        stroke: "#f1f5f9",
        width: 0.8,
        dash: true,
        opacity: 0.6
      }
    }]
  };
  const evaluated = {
    axes: { point: { kind: "sweep", values: [0, 1] } },
    fields: {
      theta: { axes: ["point"], data: [0.4, 0.4] },
      r: { axes: ["point"], data: [0, 1] }
    }
  };

  const plan = planChart(view, evaluated, { width: 200, height: 200 });
  const guide = plan.layers.find(layer => layer.name === "guide");

  assert.equal(guide.mark, "line");
  assert.equal(guide.stroke, "#f1f5f9");
  assert.equal(guide.width, 0.8);
  assert.equal(guide.dash, true);
  assert.equal(guide.opacity, 0.6);
  assert.deepEqual(guide.primitives[0].points.map(point => point.r), [0, 1]);
});

test("polar text plans preserve generic authored label channels", () => {
  const view = {
    frame: "polar",
    encoding: {
      theta: { field: "theta" },
      r: { field: "r", domain: [0, 2] }
    },
    layers: [{
      name: "label",
      mark: "text",
      encode: {
        theta: "theta",
        r: "r",
        label: "φ",
        fill: "#f1f5f9",
        size: 10,
        opacity: 0.8
      }
    }]
  };
  const evaluated = {
    axes: {},
    fields: {
      theta: { axes: [], data: 0.4 },
      r: { axes: [], data: 1.2 }
    }
  };

  const plan = planChart(view, evaluated, { width: 200, height: 200 });
  const label = plan.layers.find(layer => layer.name === "label");

  assert.equal(label.mark, "text");
  assert.equal(label.fill, "#f1f5f9");
  assert.equal(label.size, 10);
  assert.equal(label.opacity, 0.8);
  assert.deepEqual(label.primitives, [{ theta: 0.4, r: 1.2, label: "φ" }]);
});

test("cartesian chart plans preserve authored tooltip channels on line points", async () => {
  const source = chartRuntimeBundleSource()
    + "\nexport { evaluateModel, planChart };\n";
  const tmp = path.join(os.tmpdir(), `chart-bundle-line-tooltip-${process.pid}.mjs`);
  fs.writeFileSync(tmp, source, "utf8");
  try {
    const mod = await import(pathToFileURL(tmp).href);
    const appFns = await import(pathToFileURL(path.join(appDir, "chart-functions", "mill-force-kernels.js")).href);
    const world = await worldWithFiles(["models/mill-force.rvm", "views/mill-force.rvm"]);
    const spec = resolveChartSpec(world.allWitnesses(), "MillForceAngle");
    const evaluated = mod.evaluateModel(spec.model, {
      functions: appFns.millForceKernels,
      params: { active_method: "grounded", analysis_mode: "static" }
    });
    const plan = mod.planChart(spec.view, evaluated, { width: 720, height: 420 });
    const resultant = plan.layers.find(layer => layer.name === "fres");
    const first = resultant?.primitives?.[0]?.points?.[0];

    assert.ok(first, "expected force-vs-angle line points");
    assert.equal(first.tooltip.liner, 1);
    assert.equal(first.tooltip.method, "grounded");
    assert.equal(typeof first.tooltip.F_r_N, "number");
    assert.equal(typeof first.tooltip.F_t_N, "number");
    assert.equal(typeof first.tooltip.F_resultant_N, "number");
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test("page.chart resolves the requested chart from requestUrl search params", async () => {
  const world = await worldWithFiles([
    "models/goodman.rvm",
    "models/mill-force.rvm",
    "views/goodman.rvm",
    "views/mill-force.rvm"
  ]);
  const calls = [];
  const handlers = createHandlers({
    world,
    send: (_res, status, contentType, body) => calls.push({ status, contentType, body }),
    sendJson: (_res, status, body) => calls.push({ status, body })
  });

  await handlers["page.chart"]({
    res: {},
    route: { params: {} },
    requestUrl: new URL("http://engentus.test/chart?chart=MillForceCross")
  });

  assert.equal(calls.at(-1)?.status, 200);
  assert.match(calls.at(-1)?.body ?? "", /\/app-static\/app\/chart-functions\/mill-force-kernels\.js/);
  assert.match(calls.at(-1)?.body ?? "", /id="mill-force-svg-cross"/);
});

test("page.chart requires an explicit chart id instead of defaulting to an app chart", async () => {
  const world = await worldWithGoodman();
  const calls = [];
  const handlers = createHandlers({
    world,
    send: (_res, status, contentType, body) => calls.push({ status, contentType, body }),
    sendJson: (_res, status, body) => calls.push({ status, body })
  });

  await handlers["page.chart"]({
    res: {},
    route: { params: {} },
    requestUrl: new URL("http://chart.test/chart")
  });

  assert.deepEqual(calls.at(-1), {
    status: 400,
    body: { error: "missing chart id" }
  });
});
