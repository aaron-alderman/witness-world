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
import { resolveChartSpec } from "./runtime.js";
import { renderChartHtml, chartRuntimeBundleSource } from "./chart-page.js";
import { goodmanFunctions } from "./goodman-stdlib.js";

const appDir = path.join(process.cwd(), "examples_rvm", "engentus", "app");

async function worldWithGoodman() {
  const world = createWorld();
  for (const file of ["models/goodman.rvm", "views/goodman.rvm"]) {
    const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(path.join(appDir, file)));
    applyDesire(world, desire);
  }
  return world;
}

test("resolveChartSpec assembles {model, view} from the witnessed world", async () => {
  const world = await worldWithGoodman();
  const spec = resolveChartSpec(world.allWitnesses(), "GoodmanDiagram");
  assert.ok(spec, "expected to resolve GoodmanDiagram");
  assert.equal(spec.view.modelRef, "BoltFatigue");
  assert.ok(spec.model.axes.some(a => a.name === "sm"));
  assert.ok(spec.model.derives.some(d => d.name === "band"));
  assert.ok(spec.view.layers.some(l => l.name === "bands"));
});

test("the inlined chart runtime bundle is valid JS and still evaluates the model", async () => {
  const source = chartRuntimeBundleSource(["goodman-stdlib.js"])
    + "\nexport { evaluateModel, planChart, goodmanFunctions, bootChartsFromDom };\n";
  const tmp = path.join(os.tmpdir(), `chart-bundle-${process.pid}.mjs`);
  fs.writeFileSync(tmp, source, "utf8");
  try {
    const mod = await import(pathToFileURL(tmp).href);
    assert.equal(typeof mod.evaluateModel, "function");
    assert.equal(typeof mod.planChart, "function");
    assert.equal(typeof mod.bootChartsFromDom, "function");
    assert.equal(typeof mod.goodmanFunctions.goodman_sa, "function");

    const world = await worldWithGoodman();
    const spec = resolveChartSpec(world.allWitnesses(), "GoodmanDiagram");
    const evaluated = mod.evaluateModel(spec.model, { functions: mod.goodmanFunctions });
    const plan = mod.planChart(spec.view, evaluated, { width: 800, height: 520 });
    assert.deepEqual(plan.scales.x.domain, [0, 650]);
    assert.ok(plan.layers.find(l => l.name === "bands").primitives.length > 0);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test("renderChartHtml emits a self-contained page embedding the spec and D3", async () => {
  const world = await worldWithGoodman();
  const spec = resolveChartSpec(world.allWitnesses(), "GoodmanDiagram");
  const html = renderChartHtml({ title: "GoodmanDiagram", spec });
  assert.match(html, /d3js\.org\/d3/);
  assert.match(html, /data-chart-spec=/);
  assert.match(html, /bootChartsFromDom\(document, goodmanFunctions\)/);
  assert.match(html, /BoltFatigue/);          // model ref present in embedded spec
  assert.match(html, /goodman_sa/);            // domain std-lib inlined
});
