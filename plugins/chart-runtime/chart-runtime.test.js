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
import { renderSurfacePage } from "../../src/runtime-surface-page.js";
import { buildMountedChartRuntime, createHandlers, providers, resolveChartSpec } from "./runtime.js";
import { renderChartHtml, chartRuntimeAssets, chartRuntimeBundleSource } from "./chart-page.js";
import { applyChartPresentationPatch } from "./chart-presentation-patch.js";
import { registerChartSurfaceCapabilityBoot } from "./chart-client.js";
import { drawChart } from "./gog-runtime.js";
import { linearTicks } from "./graphics/scales.js";
import { renderScene } from "./ports/render-port.js";
import { buildScene } from "./scene/build-scene.js";
import { planChart } from "./plan/chart-plan.js";
import { resolvePresentationView } from "./presentation/resolve-presentation.js";

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

async function worldWithShell(files = []) {
  return worldWithFiles([
    "shell.rvm",
    "shell-shared.rvm",
    "shell-auth.rvm",
    "shell-goodman.rvm",
    "shell-mill-charge.rvm",
    "shell-mill-force.rvm",
    ...files
  ]);
}

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.style = {};
    this.textContent = "";
    this.listeners = new Map();
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentElement = null;
    return child;
  }

  remove() {
    this.parentElement?.removeChild(this);
  }

  getElementById(id) {
    const target = String(id);
    if (this.getAttribute("id") === target) return this;
    for (const child of this.children) {
      const match = typeof child.getElementById === "function" ? child.getElementById(target) : null;
      if (match) return match;
    }
    return null;
  }

  get firstChild() {
    return this.children[0] ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(String(name));
  }

  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
  }

  removeEventListener(name, listener) {
    this.listeners.get(name)?.delete(listener);
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event?.type) ?? []) listener.call(this, event);
    return true;
  }

  matches(selector) {
    if (selector === ".chart-page__mount") return String(this.getAttribute("class") ?? "").split(/\s+/).includes("chart-page__mount");
    return false;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const results = [];
    const classes = value => String(value ?? "").split(/\s+/).filter(Boolean);
    const matches = node => {
      if (selector === "*") return true;
      if (selector === ".chart-page__mount") {
        return String(node.getAttribute("class") ?? "").split(/\s+/).includes("chart-page__mount");
      }
      if (selector === "[data-chart-page-overlay='tooltip']") {
        return node.getAttribute("data-chart-page-overlay") === "tooltip";
      }
      if (selector === "svg.gog") {
        return node.tagName.toLowerCase() === "svg" && classes(node.getAttribute("class")).includes("gog");
      }
      return false;
    };
    const visit = node => {
      for (const child of node.children) {
        if (matches(child)) results.push(child);
        visit(child);
      }
    };
    visit(this);
    return results;
  }
}

class FakeDocument {
  createElementNS(_namespace, tagName) {
    return new FakeElement(this, tagName);
  }
}

function countDescendants(node, tagName) {
  let count = 0;
  const target = String(tagName).toUpperCase();
  const visit = current => {
    for (const child of current.children ?? []) {
      if (child.tagName === target) count += 1;
      visit(child);
    }
  };
  visit(node);
  return count;
}

test("resolveChartSpec assembles {model, view} from the witnessed world", async () => {
  const world = await worldWithGoodman();
  const spec = resolveChartSpec(world.allWitnesses(), "GoodmanDiagram");
  assert.ok(spec, "expected to resolve GoodmanDiagram");
  assert.equal(spec.view.modelRef, "BoltFatigue");
  assert.equal(spec.pageProps.pageStylesheetHref, "/engentus/__generated/engentus-chart-pages.css");
  assert.equal(spec.pageProps.bodyClass, "chart-page chart-page--goodman");
  assert.equal(spec.pageProps.mountId, "chart-svg");
  assert.equal(spec.pageProps.mountTag, "svg");
  assert.equal(spec.pageProps.chartSurfaceId, "GoodmanDiagram");
  assert.equal(spec.pageProps.functionsModules, "/app-static/app/chart-functions/goodman-stdlib.js,/app-static/app/chart-functions/sampling.js");
  assert.equal(spec.pageProps.functionsExports, "goodmanFunctions,samplingFunctions");
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
    const samplingFns = await import(pathToFileURL(path.join(appDir, "chart-functions", "sampling.js")).href);
    assert.equal(typeof mod.evaluateModel, "function");
    assert.equal(typeof mod.planChart, "function");
    assert.equal(typeof mod.bootChartsFromDom, "function");
    assert.equal(typeof appFns.goodmanFunctions.goodman_sa, "function");

    const world = await worldWithGoodman();
    const spec = resolveChartSpec(world.allWitnesses(), "GoodmanDiagram");
    const evaluated = mod.evaluateModel(spec.model, { functions: { ...appFns.goodmanFunctions, ...samplingFns.samplingFunctions } });
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
  assert.equal(source.includes("registerChartSurfaceCapabilityBoot(__chartRuntimeFunctions)"), true);
  assert.equal(source.includes("applyWitnessToml"), false);
  assert.equal(source.includes("renderWidgetPage"), false);
  assert.equal(source.includes("frontendProgram"), false);
  assert.equal(source.includes('"goodman-stdlib.js"'), false);
  assert.equal(source.includes('"goodmanFunctions"'), false);
});

test("mounted chart runtime assets register boot hooks without auto-booting before the surface runtime", () => {
  const mounted = chartRuntimeAssets({ pagePropsList: [], standalone: false });
  const standalone = chartRuntimeAssets({ pagePropsList: [], standalone: true });

  assert.deepEqual(mounted.scriptSrcs, []);
  assert.deepEqual(standalone.scriptSrcs, []);
  assert.match(mounted.scriptBody, /registerChartSurfaceCapabilityBoot\(__chartRuntimeFunctions\)/);
  assert.match(mounted.scriptBody, /__surfaceCapabilityReadyPromises/);
  assert.doesNotMatch(mounted.scriptBody, /bootChartsFromDom\(document, __chartRuntimeFunctions\)/);
  assert.match(standalone.scriptBody, /bootChartsFromDom\(document, __chartRuntimeFunctions\)/);
});

test("cartesian band mark supports category-split primitives generically", () => {
  const view = {
    frame: "cartesian",
    encoding: {
      x: { field: "x", domain: [0, 1] },
      y: { field: "upper", domain: [0, 20] }
    },
    bandFills: ["#111111", "#222222"],
    layers: [{
      name: "zones",
      mark: "band",
      over: ["x", "zone"],
      encode: {
        x: "x",
        y0: "lower",
        y1: "upper",
        fill: "band.fills",
        opacity: 0.72
      }
    }]
  };
  const evaluated = {
    axes: {
      x: { kind: "sweep", values: [0, 1] },
      zone: { kind: "category", values: ["a", "b"] }
    },
    fields: {
      x: { axes: ["x"], data: [0, 1] },
      lower: { axes: ["x", "zone"], data: [[0, 10], [1, 11]] },
      upper: { axes: ["x", "zone"], data: [[5, 15], [6, 16]] }
    }
  };

  const plan = planChart(view, evaluated, { width: 200, height: 120 });
  const zones = plan.layers.find(layer => layer.name === "zones");

  assert.equal(zones.mark, "band");
  assert.equal(zones.opacity, 0.72);
  assert.deepEqual(zones.primitives.map(primitive => primitive.category), ["a", "b"]);
  assert.deepEqual(zones.primitives.map(primitive => primitive.fill), ["#111111", "#222222"]);
  assert.deepEqual(zones.primitives[1].points.map(point => point.y0), [10, 11]);
  assert.deepEqual(zones.primitives[1].points.map(point => point.y1), [15, 16]);
});

test("cartesian guide marks support x-band and horizontal rule primitives generically", () => {
  const view = {
    frame: "cartesian",
    encoding: {
      x: { field: "x", domain: [0, 10] },
      y: { field: "y", domain: [-2, 8] }
    },
    layers: [
      {
        name: "window",
        mark: "x-band",
        encode: { x0: "left", x1: "right", fill: "#ddeeff", opacity: 0.12 }
      },
      {
        name: "zero",
        mark: "h-rule",
        encode: { y: "baseline", stroke: "slate", width: 0.5, dash: true }
      }
    ]
  };
  const evaluated = {
    axes: {},
    fields: {
      left: { axes: [], data: 2 },
      right: { axes: [], data: 7 },
      baseline: { axes: [], data: 0 }
    }
  };

  const plan = planChart(view, evaluated, { width: 200, height: 120 });
  const band = plan.layers.find(layer => layer.name === "window");
  const rule = plan.layers.find(layer => layer.name === "zero");

  assert.equal(band.mark, "x-band");
  assert.equal(band.fill, "#ddeeff");
  assert.equal(band.opacity, 0.12);
  assert.deepEqual(band.primitives, [{ x0: 2, x1: 7 }]);
  assert.equal(rule.mark, "h-rule");
  assert.equal(rule.stroke, "#475569");
  assert.equal(rule.width, 0.5);
  assert.equal(rule.dash, true);
  assert.deepEqual(rule.primitives, [{ y: 0 }]);
});

test("chart presentation patches can target layers by authored layer name", () => {
  const view = {
    layers: [
      { name: "primary_curve", encode: { stroke: "#dc2626" } },
      { name: "primary_label", encode: { fill: "#dc2626" } }
    ]
  };

  assert.equal(applyChartPresentationPatch(view, "layerStyles.primary_label.fill", "#0ea5e9"), true);
  assert.equal(applyChartPresentationPatch(view, "layerStyles.primary_curve.stroke", "#0ea5e9"), true);
  assert.equal(applyChartPresentationPatch(view, "layerStyles.missing.fill", "#fff"), false);
  assert.equal(view.layers[0].encode.stroke, "#0ea5e9");
  assert.equal(view.layers[1].encode.fill, "#0ea5e9");
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
    "chart-presentation-patch.js",
    "dataflow-eval.js",
    "gog-runtime.js",
    "graphics",
    "plan",
    "plugin.json",
    "ports",
    "presentation",
    "runtime.js",
    "scene",
    "this.folder.wtoml"
  ]);
});

test("graphics.linearTicks emits stable nice ticks for chart axes", () => {
  assert.deepEqual(linearTicks([0, 650], 8), [0, 100, 200, 300, 400, 500, 600]);
  assert.deepEqual(linearTicks([-12, 12], 6), [-10, -5, 0, 5, 10]);
});

test("renderChartHtml emits a self-contained page embedding the spec and authored helper urls", async () => {
  const world = await worldWithGoodman();
  const spec = resolveChartSpec(world.allWitnesses(), "GoodmanDiagram");
  const html = renderChartHtml({ title: "GoodmanDiagram", spec, pageProps: spec.pageProps });
  assert.doesNotMatch(html, /d3js\.org\/d3/);
  assert.doesNotMatch(html, /data-chart-spec=/);
  assert.match(html, /<script type="application\/json" id="chart-runtime-manifest">/);
  assert.match(html, /"chartSpecs":\{"GoodmanDiagram":/);
  assert.match(html, /await Promise\.all/);
  assert.match(html, /import\(dep\.href\)/);
  assert.match(html, /\/app-static\/app\/chart-functions\/goodman-stdlib\.js/);
  assert.match(html, /BoltFatigue/);
  assert.match(html, /engentus-chart-pages\.css/);
  assert.match(html, /chart-page chart-page--goodman/);
  assert.match(html, /data-chart-id="GoodmanDiagram" data-chart-page-host/);
  assert.match(html, /<svg id="chart-svg" class="chart-page__mount chart-page__mount--goodman" data-chart-id="GoodmanDiagram"><\/svg>/);
  assert.match(html, /<canvas id="mc-canvas" class="chart-page__overlay-canvas" data-chart-page-overlay="canvas"><\/canvas>/);
  assert.match(html, /<div id="chart-tip" class="chart-page__tooltip chart-page__tooltip--goodman" data-chart-page-overlay="tooltip"><\/div>/);
  assert.doesNotMatch(html, /#chart\{position:absolute;inset:16px/);
  assert.doesNotMatch(html, /svg\.gog text\{[^}]*fill:/);
});

test("drawChart renders cartesian charts without D3 and replaces stale SVG mounts", () => {
  const view = {
    frame: "cartesian",
    encoding: {
      x: { field: "x", domain: [0, 10] },
      y: { field: "lineY", domain: [0, 10] }
    },
    layers: [
      {
        name: "band",
        mark: "band",
        over: ["x"],
        encode: { x: "x", y0: "band0", y1: "band1", fill: "#ddeeff", opacity: 0.25 }
      },
      {
        name: "line",
        mark: "line",
        over: ["x"],
        encode: { x: "x", y: "lineY", stroke: "blue", width: 2 }
      },
      {
        name: "marker",
        mark: "point",
        encode: { x: "pointX", y: "pointY", fill: "#0ea5e9", stroke: "#ffffff", width: 1, size: 4 }
      }
    ]
  };
  const evaluated = {
    axes: {
      x: { kind: "sweep", values: [0, 5, 10] }
    },
    fields: {
      x: { axes: ["x"], data: [0, 5, 10] },
      band0: { axes: ["x"], data: [1, 2, 3] },
      band1: { axes: ["x"], data: [4, 5, 6] },
      lineY: { axes: ["x"], data: [2, 8, 4] },
      pointX: { axes: [], data: 5 },
      pointY: { axes: [], data: 7 }
    }
  };
  const plan = planChart(view, evaluated, { width: 320, height: 180 });
  const doc = new FakeDocument();
  const container = new FakeElement(doc, "div");
  const staleSvg = doc.createElementNS("", "svg");
  staleSvg.setAttribute("class", "gog");
  staleSvg.appendChild(doc.createElementNS("", "line"));
  container.appendChild(staleSvg);

  const node = drawChart(container, plan);

  assert.equal(node.tagName, "SVG");
  assert.equal(container.children.length, 1);
  assert.notEqual(container.children[0], staleSvg);
  assert.equal(container.children[0].getAttribute("class"), "gog");
  assert.ok(countDescendants(node, "polygon") >= 1);
  assert.ok(countDescendants(node, "polyline") >= 1);
  assert.ok(countDescendants(node, "circle") >= 1);
  assert.equal(typeof node.probeAt, "function");
  assert.equal(typeof node.probeAtPoint, "function");
  node.destroy();
  assert.equal(node.children.length, 0);
});

test("resolvePresentationView composes authored overrides above props and CSS chart tokens", () => {
  const previousGetComputedStyle = globalThis.getComputedStyle;
  const rootNode = { nodeType: 1 };
  const container = {
    ownerDocument: {
      documentElement: rootNode
    }
  };
  globalThis.getComputedStyle = node => ({
    getPropertyValue(name) {
      if (node === rootNode) {
        return {
          "--surface-border": "#334155",
          "--body-font": "Root Body",
          "--heading-font": "Root Heading"
        }[name] ?? "";
      }
      return {
        "--chart-grid-stroke": "#123456",
        "--chart-axis-stroke": "#234567",
        "--chart-disc-background": "#345678",
        "--chart-body-font-family": "Chart Body"
      }[name] ?? "";
    }
  });
  try {
    const resolved = resolvePresentationView({
      props: {
        axisStroke: "#456789",
        shellStroke: "#56789a"
      },
      chrome: {
        axisStroke: "#6789ab"
      },
      typography: {
        headingFontFamily: "Authored Heading"
      }
    }, container);

    assert.equal(resolved.chrome.gridStroke, "#123456");
    assert.equal(resolved.chrome.axisStroke, "#6789ab");
    assert.equal(resolved.chrome.discBackground, "#345678");
    assert.equal(resolved.chrome.discShellStroke, "#56789a");
    assert.equal(resolved.chrome.tickStroke, "#e2e8f0");
    assert.equal(resolved.typography.bodyFontFamily, "Chart Body");
    assert.equal(resolved.typography.headingFontFamily, "Authored Heading");
  } finally {
    globalThis.getComputedStyle = previousGetComputedStyle;
  }
});

test("late chart function registration can recover mounts after empty preload boot", () => {
  const previousDocument = globalThis.document;
  const previousHooks = globalThis.__surfaceCapabilityBootHooks;
  const previousBoot = globalThis.__chartSurfaceCapabilityBoot;
  const previousFunctions = globalThis.__chartRuntimeFunctions;
  const doc = new FakeDocument();
  const root = new FakeElement(doc, "div");
  const chart = new FakeElement(doc, "svg");
  chart.setAttribute("class", "chart-page__mount");
  chart.setAttribute("data-chart-id", "RecoveryChart");
  const manifest = new FakeElement(doc, "script");
  manifest.setAttribute("id", "chart-runtime-manifest");
  manifest.textContent = JSON.stringify({
    chartSpecs: {
      RecoveryChart: {
        model: {
          axes: [],
          params: [],
          derives: [
            { name: "x", expr: "months_to_cycles(1, 2)", over: [] },
            { name: "y", expr: "1", over: [] }
          ],
          reduces: []
        },
        view: {
          id: "RecoveryChart",
          frame: "cartesian",
          encoding: {
            x: { field: "x", domain: [0, 100000] },
            y: { field: "y", domain: [0, 2] }
          },
          layers: [{ name: "probe", mark: "point", encode: { x: "x", y: "y" } }],
          props: {}
        },
        params: {}
      }
    }
  });
  root.appendChild(chart);
  root.appendChild(manifest);
  globalThis.document = root;
  globalThis.__surfaceCapabilityBootHooks = [];
  delete globalThis.__chartSurfaceCapabilityBoot;
  delete globalThis.__chartRuntimeFunctions;
  try {
    registerChartSurfaceCapabilityBoot({});
    assert.equal(chart.__chartController ?? null, null);

    registerChartSurfaceCapabilityBoot({
      months_to_cycles: (mo, rpm) => mo * 30 * 24 * 60 * rpm
    });
    assert.ok(chart.__chartController, "expected chart to mount after function registry update");
    assert.equal(chart.__chartController.outputs.x, 86400);
  } finally {
    globalThis.document = previousDocument;
    globalThis.__surfaceCapabilityBootHooks = previousHooks;
    globalThis.__chartSurfaceCapabilityBoot = previousBoot;
    globalThis.__chartRuntimeFunctions = previousFunctions;
  }
});

test("buildScene and renderScene preserve the mounted cartesian controller hooks", () => {
  const doc = new FakeDocument();
  const container = new FakeElement(doc, "div");
  const plan = {
    frame: "cartesian",
    width: 320,
    height: 180,
    margin: { top: 20, right: 20, bottom: 30, left: 40 },
    innerW: 260,
    innerH: 130,
    scales: {
      x: { domain: [0, 10], range: [0, 260] },
      y: { domain: [0, 10], range: [130, 0] }
    },
    layers: [{
      name: "curve",
      mark: "line",
      primitives: [{
        points: [
          { x: 0, y: 1, tooltip: { point: 0 } },
          { x: 10, y: 9, tooltip: { point: 1 } }
        ]
      }]
    }],
    presentation: { showGrid: true, xLabel: "x", yLabel: "y", title: "curve" }
  };

  const scene = buildScene(plan, { mountTag: "div" });
  const node = renderScene(container, scene, { plan });
  const projected = node.projectPoint(5, 5);
  const readout = node.probeAt(5);

  assert.equal(scene.renderer, "svg");
  assert.ok(projected.x > plan.margin.left);
  assert.ok(projected.y > plan.margin.top);
  assert.equal(readout.readings[0].layer, "curve");
  assert.equal(readout.readings[0].tooltip.point, 0);
});

test("drawChart reuses authored SVG mounts and renders polar charts without D3", () => {
  const doc = new FakeDocument();
  const svgMount = new FakeElement(doc, "svg");
  const plan = {
    frame: "polar",
    width: 200,
    height: 200,
    center: { x: 100, y: 100 },
    maxRadius: 80,
    scales: { r: { domain: [0, 1] } },
    layers: [{
      name: "guide",
      mark: "line",
      stroke: "#f1f5f9",
      width: 1.2,
      primitives: [{
        points: [
          { theta: 0, r: 0.25 },
          { theta: Math.PI / 2, r: 0.5 },
          { theta: Math.PI, r: 0.75 }
        ]
      }]
    }]
  };

  const node = drawChart(svgMount, plan);

  assert.equal(node, svgMount);
  assert.equal(node.getAttribute("class"), "gog");
  assert.ok(countDescendants(node, "circle") >= 4);
  assert.ok(countDescendants(node, "polyline") >= 1);
  assert.equal(typeof node.probeAtPoint, "function");
  node.destroy();
  assert.equal(node.children.length, 0);
});

test("buildScene selects the canvas port for animated disc scenes", () => {
  const scene = buildScene({
    frame: "disc",
    width: 200,
    height: 200,
    center: { x: 100, y: 100 },
    scale: 40,
    discRadius: 1,
    layers: [{ mark: "particles", frames: [{ t: 0, points: [] }] }],
    playback: {},
    presentation: {}
  }, { mountTag: "div" });

  assert.equal(scene.renderer, "canvas");
});

test("disc-frame chart pages can mount on an authored canvas host", async () => {
  const world = await worldWithFiles(["models/mill-charge.rvm", "views/mill-charge.rvm"]);
  const spec = resolveChartSpec(world.allWitnesses(), "MillChargeCrossSection");
  const html = renderChartHtml({ title: "MillChargeCrossSection", spec, pageProps: spec.pageProps });
  assert.equal(spec.pageProps.mountTag, "canvas");
  assert.match(html, /<canvas id="mill-canvas" class="chart-page__mount chart-page__mount--mill-charge" data-chart-id="MillChargeCrossSection"><\/canvas>/);
  assert.match(html, /<script type="application\/json" id="chart-runtime-manifest">/);
  assert.match(html, /\/app-static\/app\/chart-functions\/mill-charge-kernels\.js/);
});

test("mounted chart runtime resolves nested chart surfaces under the active app surface", async () => {
  const world = await worldWithShell(["models/mill-charge.rvm", "views/mill-charge.rvm"]);
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
  assert.match(markup, /data-chart-id="MillChargeCrossSection"/);
  assert.doesNotMatch(markup, /data-chart-spec=/);
  assert.match(markup, /chart-page__mount--mill-charge/);
  assert.deepEqual(Object.keys(runtime.chartSpecsById()), ["MillChargeCrossSection"]);
});

test("mounted chart runtime does not activate for charts outside the active route subtree", async () => {
  const world = await worldWithShell(["models/mill-charge.rvm", "views/mill-charge.rvm"]);
  const witnesses = world.allWitnesses();
  const homeSurface = witnesses
    .find(witness => witness.process === "desire.defineSurface" && witness.body?.id === "EngentusHome")
    ?.body;

  const runtime = buildMountedChartRuntime({ world, activeSurface: homeSurface });
  assert.equal(runtime, null);
});

test("mounted chart runtime applies authored initial presentation bindings to chart specs", async () => {
  const world = await worldWithFiles(["models/goodman.rvm", "views/goodman.rvm"]);
  const chartSurface = world.allWitnesses()
    .find(witness => witness.process === "desire.defineSurface" && witness.body?.id === "GoodmanDiagram")
    ?.body;
  assert.ok(chartSurface, "expected GoodmanDiagram surface");

  const runtime = buildMountedChartRuntime({
    world,
    activeSurface: chartSurface,
    initialState: new Map([
      ["GoodmanBoltPrimaryColorState", "#22c55e"],
      ["GoodmanBoltMaintenanceColorState", "#0ea5e9"]
    ])
  });
  const markup = runtime.renderMountedChart(chartSurface);
  const chartSpecs = runtime.chartSpecsById();

  assert.doesNotMatch(markup, /#22c55e/);
  assert.doesNotMatch(markup, /#0ea5e9/);
  assert.equal(chartSpecs.GoodmanDiagram.view.layers.find(layer => layer.name === "curve_label")?.encode?.fill, "#22c55e");
  assert.equal(chartSpecs.GoodmanDiagram.view.layers.find(layer => layer.name === "slip_label_jemtec")?.encode?.fill, "#0ea5e9");
});

test("native Engentus Goodman page.surface manifest includes chart specs for mounted chart capabilities", async () => {
  const world = await worldWithShell(["models/goodman.rvm", "models/goodman-bolt-sets.rvm", "views/goodman.rvm"]);
  const html = renderSurfacePage(world, {
    rootSurfaceId: "EngentusRoot",
    requestPathname: "/engentus/goodman",
    route: {
      id: "engentus_goodman_route",
      path: "/engentus/goodman",
      params: {
        rootSurface: "EngentusRoot",
        routeState: { process: "EngentusShellNavigation", state: "EngentusShellActiveRoute" }
      }
    },
    browserRuntimeCapabilities: ["chart.render"],
    surfaceCapabilityRenderers: providers.filter(provider => provider.kind === "surfaceCapabilityRenderer"),
    capabilityPreloadProviders: providers.filter(provider => provider.kind === "capabilityPreloadProvider")
  });

  assert.equal(typeof html, "string");
  assert.match(html, /data-chart-id="GoodmanDiagram"/);
  const manifestMatch = html.match(/<script type="application\/json" id="surface-runtime-manifest">([\s\S]*?)<\/script>/);
  assert.ok(manifestMatch, "expected surface runtime manifest");
  const manifest = JSON.parse(manifestMatch[1]);
  assert.equal(manifest.activeSurfaceId, "EngentusApp");
  assert.ok(manifest.chartSpecs?.GoodmanDiagram, "expected GoodmanDiagram chart spec in surface runtime manifest");
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

test("screen annotation marks resolve anchored SVG-space rectangles and text", () => {
  const view = {
    frame: "polar",
    encoding: {
      theta: { field: "theta" },
      r: { field: "r", domain: [0, 1] }
    },
    layers: [
      {
        name: "swatch",
        mark: "screen-rect",
        encode: { xAnchor: "right", x: 24, yAnchor: "bottom", y: 32, width: 12, height: 8, fill: "blue", opacity: 0.82 }
      },
      {
        name: "label",
        mark: "screen-text",
        encode: { x: 16, y: 20, label: "Legend", fill: "#f1f5f9", size: 9 }
      }
    ]
  };
  const plan = planChart(view, { axes: {}, fields: {} }, { width: 200, height: 180 });
  const swatch = plan.layers.find(layer => layer.name === "swatch");
  const label = plan.layers.find(layer => layer.name === "label");

  assert.equal(swatch.mark, "screen-rect");
  assert.equal(swatch.fill, "#5AAABF");
  assert.equal(swatch.opacity, 0.82);
  assert.deepEqual(swatch.primitives, [{ x: 176, y: 148, width: 12, height: 8, rx: 0 }]);
  assert.equal(label.mark, "screen-text");
  assert.equal(label.fill, "#f1f5f9");
  assert.equal(label.size, 9);
  assert.deepEqual(label.primitives, [{ x: 16, y: 20, label: "Legend" }]);
});

test("cartesian line plans split category overlays and preserve styled point/text marks", () => {
  const view = {
    frame: "cartesian",
    encoding: {
      x: { field: "x", domain: [0, 1] },
      y: { field: "y", domain: [0, 2] }
    },
    layers: [
      {
        name: "guide",
        mark: "line",
        over: ["kind"],
        encode: { y: "y", stroke: "ylw", width: 1.2, dash: true, opacity: 0.9 }
      },
      {
        name: "marker",
        mark: "point",
        encode: { x: "px", y: "py", fill: "blue", stroke: "#ffffff", width: 2, size: 5.5 }
      },
      {
        name: "label",
        mark: "text",
        encode: { x: "px", y: "py", label: "Bolt A", fill: "blue", size: 11, weight: 600 }
      }
    ]
  };
  const evaluated = {
    axes: {
      x: { kind: "sweep", values: [0, 1] },
      kind: { kind: "category", values: ["a", "b"] }
    },
    fields: {
      y: { axes: ["x", "kind"], data: [[1, 2], [1.5, 2.5]] },
      px: { axes: [], data: 0.75 },
      py: { axes: [], data: 1.25 }
    }
  };

  const plan = planChart(view, evaluated, { width: 200, height: 200 });
  const guide = plan.layers.find(layer => layer.name === "guide");
  const marker = plan.layers.find(layer => layer.name === "marker");
  const label = plan.layers.find(layer => layer.name === "label");

  assert.equal(guide.primitives.length, 2);
  assert.deepEqual(guide.primitives.map(primitive => primitive.category), ["a", "b"]);
  assert.deepEqual(guide.primitives[1].points.map(point => point.y), [2, 2.5]);
  assert.equal(guide.dash, true);
  assert.equal(guide.opacity, 0.9);
  assert.deepEqual(marker.primitives, [{ x: 0.75, y: 1.25 }]);
  assert.equal(marker.size, 5.5);
  assert.equal(marker.stroke, "#ffffff");
  assert.deepEqual(label.primitives, [{ x: 0.75, y: 1.25, label: "Bolt A" }]);
  assert.equal(label.weight, 600);
});

test("cartesian point marks can project one primitive per authored axis value", () => {
  const view = {
    frame: "cartesian",
    encoding: {
      x: { field: "x", domain: [0, 4] },
      y: { field: "y", domain: [0, 8] }
    },
    layers: [{
      name: "samples",
      mark: "point",
      over: ["sample"],
      encode: {
        x: "sample_x",
        y: "sample_y",
        fill: "blue",
        stroke: "#ffffff",
        width: 0.5,
        size: 2.4,
        opacity: 0.22,
        "tooltip.index": "sample"
      }
    }]
  };
  const evaluated = {
    axes: {
      sample: { kind: "ensemble", values: [0, 1, 2] }
    },
    fields: {
      sample_x: { axes: ["sample"], data: [1, 2, 3] },
      sample_y: { axes: ["sample"], data: [4, 5, 6] }
    }
  };

  const plan = planChart(view, evaluated, { width: 200, height: 200 });
  const samples = plan.layers.find(layer => layer.name === "samples");
  assert.equal(samples.mark, "point");
  assert.equal(samples.size, 2.4);
  assert.equal(samples.opacity, 0.22);
  assert.deepEqual(samples.primitives.map(point => [point.x, point.y]), [[1, 4], [2, 5], [3, 6]]);
  assert.deepEqual(samples.primitives.map(point => point.tooltip.index), [0, 1, 2]);
});

test("cartesian line layers with explicit x fields are ordered by x value", () => {
  const view = {
    frame: "cartesian",
    encoding: {
      x: { field: "displayX", domain: [0, 360] },
      y: { field: "y", domain: [0, 10] }
    },
    layers: [
      {
        name: "ordered",
        mark: "line",
        over: ["segment"],
        encode: { x: "displayX", y: "y", stroke: "blue" }
      }
    ]
  };
  const evaluated = {
    axes: {
      segment: { kind: "sweep", values: [1, 2, 3] }
    },
    fields: {
      displayX: { axes: ["segment"], data: [240, 10, 120] },
      y: { axes: ["segment"], data: [1, 2, 3] }
    }
  };

  const plan = planChart(view, evaluated, { width: 200, height: 200 });
  const layer = plan.layers.find(row => row.name === "ordered");
  assert.deepEqual(layer.primitives[0].points.map(point => point.x), [10, 120, 240]);
  assert.deepEqual(layer.primitives[0].points.map(point => point.y), [2, 3, 1]);
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
    const points = resultant?.primitives?.[0]?.points ?? [];
    const first = points[0];

    assert.ok(first, "expected force-vs-angle line points");
    assert.deepEqual(points.map(point => point.x), points.map(point => point.x).slice().sort((a, b) => a - b));
    assert.equal(first.tooltip.liner, evaluated.fields.display_angle_deg.data.indexOf(first.x) + 1);
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
