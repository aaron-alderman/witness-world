# DESIRE-SPA — Engentus SPA in DESIRE: implementation status

Re-expressing the hand-coded Mill-iQ SPA (`example-ports/engentus/`) in the DESIRE IR,
**faithfully first** — lowering only at genuine *symmetry breaks*. Success = the work
spawns **generic, reusable capabilities**, not an `engentus` plugin.

This doc is the honest status of the tranche. Legend: ✅ done & node-verified · 🟡 partial ·
⛔ parked (mop-up, waits on the in-flight runtime/plugin-install migration) · ⬜ not started.

## The thesis (unchanged)

- **One primitive — the product type.** A `model` emits a product over named *axes* (float /
  int / bool / category). The labeled tensor is its dense-float face.
- **Charts = grammar-of-graphics over the model's axes**, D3-backed; dtypes drive defaults.
- **Lower at the symmetry break** — two-slightly-similar-things whose difference can't be
  parameterised away. Everything above the break stays honest IR.

---

## What's built (✅ unless noted)

### Two new authored DESIRE forms — `src/desire/` (ir.js, rvm.js, normalize.js, apply.js)

- **`model`** → new kernel kind **`dataflow`**. Line-oriented body:
  `axis x = sweep(a,b,step) | category(…) | from(src)`, `param p = default`,
  `derive name = <expr> [over a,b]`, `reduce name = <expr> over a`.
- **`chart X of Model`** → `surface` node with `surfaceKind:"chart"`. Line-oriented body:
  `frame cartesian|polar`, `x|y|r|theta <field>` + `.domain` / `.label`, `editable …`,
  `layer name = <mark> [over axis] | chan:src …`.
- The block-header grammar accepts `of` as a model ref; `category(…)` is always a literal
  value list; `from(src)` marks an external axis.
- 🟡 **serialize.js round-trip** for the two forms is **not** implemented (deferred — not on
  the render path; the broad-specimen audit and apply path don't need it).

### Two GENERIC client runtimes — `plugins/chart-runtime/` (contain zero domain logic)

- **`dataflow-eval.js`** — product-type evaluator + expression engine over named axes
  (`over` map, `where`-style indexing, param-resolved axis dims, injected `functions`).
- **`gog-runtime.js`** — `planChart(view, evaluated)` (pure geometry → render plan) +
  `drawChart(plan, d3)`. Marks: `area`, `line` (x-from-field + `where` slice), `rule`,
  `point`, and **polar** `polygon` / `wedge`. Cartesian + polar frames, auto-fit scales.

### Domain libraries (the only non-generic code)

- **`goodman-stdlib.js`** — honest one-liner fatigue functions (Goodman has no kernels).
- **`mill-force-kernels.js`** — **the first compute kernels**: `fill_angle`, `gravity_area`,
  `cf_mass_moment` (grid/Brent/Gauss-Legendre/shoelace) + `tangential_sign`. Injected like a
  std-lib; the lowered leaves at the symmetry break.

### The chart-runtime plugin (the dependency target — replaces direct routing)

- **`plugin.json`** declares the **`chart.render`** capability; **`runtime.js`** resolves a
  witnessed `chart` over its `model` from the world and serves a self-contained page;
  **`chart-page.js`** inlines the runtimes + domain lib into one ES module + embeds the spec;
  **`chart-client.js`** is the browser boot. Co-located `chart-runtime.test.js`.
- 🟡 **Not registered** in `store/seeds/first-party-plugin-catalog.json` (install is mop-up).

### Two science verticals

- **Goodman bolt-fatigue** ✅ — `models/goodman.rvm` + `views/goodman.rvm`. Pure composition,
  **zero kernels**; evaluator reproduces `physics.js` bands + bolt-response curve to **1e-6**.
- **Mill liner force** ✅ — `models/mill-force.rvm` (one model over a `method` axis) +
  `views/mill-force.rvm` (force-angle cartesian, rose + cross-section polar). The
  faithful/grounded duality collapsed to **one model + a sign parameter + three kernels**;
  the IR reproduces **both** hand-coded models per-segment to **1e-6**. ← the symmetry-break proof.

### Shell — `shell.rvm`

- ✅ Authored as a tree of **`view` surface nodes** (login → home → app screens, module grid,
  Goodman + mill-force app screens) composing down to the chart nodes by id. Faithful DESIRE,
  no direct route/widget plumbing (deliberately churn-proof). Mill-charge card stays locked.

---

## Architecture as built (vs the original plan)

```
*.rvm (model + chart + shell)
  → parse (rvm.js) → DESIRE+ → normalize → DESIRE kernel nodes
        model → `dataflow` (axes/params/derives/reduces)
        chart → `surface` (surfaceKind:"chart", frame/encoding/layers/modelRef)
        shell → `surface` tree
  → apply.js → witnessed semantic definitions
  → [chart-runtime plugin] resolveChartSpec(world, name) → {model, view}
  → [client] dataflow-eval(model, {functions}) → product tensor
  → [client] gog-runtime.planChart(view, tensor) → render plan → drawChart (D3)
```

Deliberate divergences from the first plan (recorded honestly):

1. Charts are **not** mounted by injecting `mountGoGChart` into `plugins/inspect/widget-page.js`.
   We built the **chart-runtime plugin** instead and the module declares a **plugin dependency**
   — per the "plugin dependency, not direct routing" steer, and to avoid the migrating runtime.
2. The shell is **`view` surface nodes**, not widget/`frontendProgram`/`defineRoute` forms.
3. Surface syntax is **line-oriented `chart … of Model`**, not the nested-brace `view { frame {} }`.
4. A concurrent **runtime refactor** (runtime.doc → a separate residual channel) landed during
   the work and **settled**; our additive changes coexist (desire.test.js green).

---

## Verification (node-level, churn-proof — all GREEN)

- `test/desire-engentus-forms.test.js` — forms parse → classify semantic → normalize → apply.
- `test/desire-engentus-eval.test.js` — Goodman eval vs `physics.js` (1e-6).
- `test/desire-engentus-chart.test.js` — Goodman render-plan geometry.
- `test/desire-engentus-millforce-eval.test.js` — mill-force eval vs `mill_force_model.js`,
  **both methods** (1e-6) — the symmetry-break proof.
- `test/desire-engentus-millforce-chart.test.js` — force-angle + polar rose/wedge plans.
- `test/desire-engentus-shell.test.js` — shell surfaces compose to the charts.
- `plugins/chart-runtime/chart-runtime.test.js` — spec resolution, inlined-bundle validity, page HTML.
- `test/desire.test.js` 45/45 — incl. broad-specimen over all engentus `.rvm` files (zero unknowns).
- `test/plugin-boundaries.test.js` — chart-runtime is a valid package; generic runtimes import no `src/`.
- Thesis grep: `dataflow-eval.js` + `gog-runtime.js` carry **no** domain terms (comments only).

---

## Still TODO to honestly complete the tranche

### Feature work

- ⬜ **Mill-charge** (3rd science) — the animation/charge-motion view. Stresses the unproven
  part of the grammar: a **time/phase axis** + a particle/field representation. Likely the next
  symmetry break (the fill solver / cataracting model).
- ⛔ **Monte-Carlo across sciences** — `axis sample = ensemble(N)` + `reduce p10/p50/p90 over sample`,
  and MC bands/cloud layers. The axis machinery exists; needs the `ensemble` axis kind + reductions
  wired and the chart bands. (The evaluator already treats stochasticity as "just another axis".)
- ⬜ Probe / scrubber interactivity bound to axes (local rebind in `drawChart`).

### Integration (mop-up — once the runtime/plugin-install migration stabilises)

- ⛔ Register `plugin.chart-runtime` in `store/seeds/first-party-plugin-catalog.json`; promote
  `mill-force-kernels.js` to a registered **`plugin.compute`** (plugin.json + co-located test).
- ⛔ **Live browser render** for all sciences — serve the chart route, Playwright screenshot,
  pixel-parity vs the SPA static charts. (Render path is built + node-verified; this is the paint.)
- ⛔ Wire the shell surfaces to served routes / a real navigable page in the widget runtime.
- ⛔ Investigate the unrelated full-suite hang (`node scripts/run-tests.mjs` stalls ~test 309 in a
  server/integration test — not our code; everything in our scope passes fast in isolation).

### Faithfulness debt

- 🟡 `serialize.js` round-trip for `model`/`chart` (so `.rvm` ⇄ IR stays honest both ways).
- 🟡 Goodman's `boltSet` multiplicity (multiple overlaid bolt sets) — modelled as a single set;
  add a `from(boltSets)` category axis when MC lands.
- 🟡 Mill-force `m_liner > 0` collapsed-segment edge case differs from the JS by `cos·m_liner·g`
  (the JS zeroes `Fw` there); exact at the `DEFAULT_INPUTS` (`m_liner = 0`) used for verification.

### Deferred by design

- Symmetry-break-as-witness (auditable "why we lowered here") — obvious once on the canvas.
- Sourcery guided/on-rails authoring of these forms.

---

## Thesis scorecard

- ✅ The reusable capabilities (`dataflow-eval`, `gog-runtime`) carry **no** domain logic and
  only *grew* generic features (polar frame, `where`, param-resolved axes) for the 2nd science.
- ✅ Goodman needed **zero kernels** (pure composition) — which is why it was one-shottable.
- ✅ The **first kernel appeared exactly at mill-force**, at the faithful/grounded divergence,
  and nowhere earlier. The duality reduced to one parameterised model + three named kernels.
- The model composes. The remaining tranche is breadth (mill-charge, MC) + integration (browser,
  install), not new core.
