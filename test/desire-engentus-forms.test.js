import assert from "node:assert/strict";
import test from "node:test";
import { createWorld, projectors } from "../src/kernel.js";
import {
  applyDesire,
  compileRvmToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";

// ── M1: the `model` (dataflow) and `chart` (chart-surface) DESIRE forms ─────────
// These are the two new authored forms behind the engentus port. They must parse,
// classify as semantic, normalize into kernel nodes (dataflow + surface), and apply
// into witnesses — fully in the IR, no plugin/kernel lowering.

test("RVM model and chart forms normalize into dataflow and chart-surface nodes and apply natively", () => {
  const desirePlus = compileRvmToDesirePlus(`
model BoltFatigue {
  axis sm = sweep(0, 650, 1.6)
  axis lifetime = category(0.5, 2, 6)
  param rpm = 9.0
  param uts = 1000
  derive cycles = months_to_cycles(lifetime, rpm) over lifetime
  derive band = goodman_sa(sm, fat_limit, uts, ys) over sm, lifetime
  derive slip = F_per_bolt / (mu_joint * A_s_nom * n_interfaces)
}

chart GoodmanDiagram of BoltFatigue {
  frame cartesian
  prop pageStylesheetHref = "/engentus/__generated/engentus-chart-pages.css"
  prop bodyClass = "chart-page chart-page--goodman"
  prop mountId = "chart-svg"
  prop mountTag = "svg"
  x sm
  x.domain 0 650
  x.label "Mean stress"
  y sigma_a
  y.domain 0 auto
  editable title, band.fills, annotations
  layer bands = area over lifetime | y:band fill:band.fills
  layer curves = line over sm | y:curve stroke:blue
  layer slip = rule | x:slip dash:true
}
`, { file: "C:/demo/goodman.rvm" });

  // both authored forms classify as semantic (they normalize into the DESIRE kernel)
  assert.equal(desirePlus.nodes.every(node => node.semantic), true);
  assert.equal(desirePlus.nodes.find(n => n.trace.sourceKind === "model")?.meta.sourceCategory, "semantic");
  assert.equal(desirePlus.nodes.find(n => n.trace.sourceKind === "chart")?.meta.sourceCategory, "semantic");

  const desire = normalizeDesirePlusToDesire(desirePlus);

  const model = desire.nodes.find(n => n.kind === "dataflow" && n.name === "BoltFatigue");
  assert.ok(model, "expected a dataflow node named BoltFatigue");
  assert.deepEqual(model.body.axes.find(a => a.name === "sm"), { name: "sm", kind: "sweep", args: [0, 650, 1.6] });
  assert.deepEqual(model.body.axes.find(a => a.name === "lifetime"), { name: "lifetime", kind: "category", values: [0.5, 2, 6] });
  assert.equal(model.body.params.find(p => p.name === "rpm")?.default, 9.0);
  const band = model.body.derives.find(d => d.name === "band");
  assert.equal(band.expr, "goodman_sa(sm, fat_limit, uts, ys)");
  assert.deepEqual(band.over, ["sm", "lifetime"]);
  assert.deepEqual(model.body.derives.find(d => d.name === "slip").over, []);

  const chart = desire.nodes.find(n => n.kind === "surface" && n.name === "GoodmanDiagram");
  assert.ok(chart, "expected a surface node named GoodmanDiagram");
  assert.equal(chart.body.surfaceKind, "chart");
  assert.equal(chart.body.modelRef, "BoltFatigue");
  assert.equal(chart.body.frame, "cartesian");
  assert.equal(chart.body.props.pageStylesheetHref, "/engentus/__generated/engentus-chart-pages.css");
  assert.equal(chart.body.props.bodyClass, "chart-page chart-page--goodman");
  assert.equal(chart.body.props.mountId, "chart-svg");
  assert.equal(chart.body.props.mountTag, "svg");
  assert.deepEqual(chart.body.encoding.x, { field: "sm", domain: [0, 650], label: "Mean stress" });
  assert.deepEqual(chart.body.encoding.y, { field: "sigma_a", domain: [0, "auto"], label: null });
  assert.deepEqual(chart.body.editable, ["title", "band.fills", "annotations"]);
  const bands = chart.body.layers.find(l => l.name === "bands");
  assert.equal(bands.mark, "area");
  assert.deepEqual(bands.over, ["lifetime"]);
  assert.equal(bands.encode.y, "band");
  assert.equal(bands.encode.fill, "band.fills");
  const slipLayer = chart.body.layers.find(l => l.name === "slip");
  assert.equal(slipLayer.mark, "rule");
  assert.equal(slipLayer.encode.dash, true);

  const world = createWorld();
  applyDesire(world, desire);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.define.dataflow" && w.body?.id === "BoltFatigue"), true);
  assert.equal(world.allWitnesses().some(w => w.process === "desire.defineSurface" && w.body?.id === "GoodmanDiagram"), true);
  assert.equal(world.project(projectors.currentRelations).some(row => row.from === "GoodmanDiagram" && row.rel === "surfaceKind" && row.to === "chart"), true);
});
