# DESIRE-SPA — Engentus SPA in DESIRE: implementation status

Re-expressing the hand-coded Mill-iQ SPA (`example-ports/engentus/`) in the DESIRE IR,
**faithfully first** — lowering only at genuine *symmetry breaks*. Success = the work
spawns **generic, reusable capabilities**, not an `engentus` plugin.

This doc is the honest status of the DESIRE SPA slice. Legend: ✅ done & node-verified · 🟡 partial ·
⛔ parked integration work · ⬜ not started.

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

### Three GENERIC client runtimes — `plugins/chart-runtime/` (contain zero domain logic)

- **`dataflow-eval.js`** — product-type evaluator + expression engine over named axes
  (`over` map, `where`-style indexing, param-resolved axis dims, injected `functions`). Axis
  kinds: `sweep` / `category` / `from` / **`ensemble`** (a stochastic sample dimension). Real
  **`reduce`**: collapses its `over` axes by resolving a field that carries them to the *vector*
  along that axis and applying an array-aware reducer (generic stats `percentile`/`quantile`/
  `mean`/`median`/`std`/…). This is the only evaluator change the MC tranche needed.
- **`gog-runtime.js`** — `planChart(view, evaluated)` (pure geometry → render plan) +
  `drawChart(plan, d3)`. Marks: `area`, `line` (x-from-field + `where` slice), `rule`,
  `point`, **polar** `polygon` / `wedge`, **disc** `polygon`/`point`/`particles`, and MC
  `band` (p10..p90 region) / `cloud` (per-sample spaghetti). Cartesian + polar + **disc**
  frames (the disc = equal-aspect centred xy), auto-fit scales. The `particles` mark emits one
  render frame per step of a time/phase axis it discovers in its field — the generic
  particle/field representation, animated by `drawChart`.
- **`sampling.js`** — generic seeded MC sampler (`normal`/`lognormal`/`uniform`/`rand`), pure
  functions of the `ensemble` sample index → reproducible draws. Injected like a std-lib (the
  evaluator carries the reducers, this carries the per-sample draws); no domain logic.

### Domain libraries (the only non-generic code)

- **`goodman-stdlib.js`** — honest one-liner fatigue functions (Goodman has no kernels).
- **`mill-force-kernels.js`** — **the first compute kernels**: `fill_angle`, `gravity_area`,
  `cf_mass_moment` (grid/Brent/Gauss-Legendre/shoelace) + `tangential_sign`. Injected like a
  std-lib; the lowered leaves at the symmetry break.
- **`mill-charge-kernels.js`** — the 3rd-science leaves: `segment_half_angle` (the fill solver,
  Newton-Raphson on `θ−sinθ=2πJ`) + `charge_com_x`/`charge_com_y` (80-pt arc+chord shoelace
  centroid), plus a **seeded sampler** (`spread`/`vjit`/`tphase`) — the "stochastic" cataracting
  jitter as a reproducible injected function. Promotable to a generic sampling capability for MC.

### The chart-runtime plugin (the dependency target — replaces direct routing)

- **`plugin.json`** declares the **`chart.render`** capability; **`runtime.js`** resolves a
  witnessed `chart` over its `model` from the world and serves a self-contained page;
  **`chart-page.js`** inlines the runtimes + domain lib into one ES module + embeds the spec;
  **`chart-client.js`** is the browser boot. Co-located `chart-runtime.test.js`.
- ✅ Registered in `store/seeds/first-party-plugin-catalog.json` as `plugin.chart-runtime`.

### Three science verticals

- **Goodman bolt-fatigue** ✅ — `models/goodman.rvm` + `views/goodman.rvm`. Pure composition,
  **zero kernels**; evaluator reproduces `physics.js` bands + bolt-response curve to **1e-6**.
  Now also the **Monte-Carlo** sibling `BoltFatigueMC` + `GoodmanMCBands` chart: a
  `sample = ensemble(N)` axis draws the applied force per sample (seeded lognormal), propagates
  it through the *same* honest response chain, and collapses to p10/p50/p90 σa bands via
  `reduce … over sample` — band + median + cloud. The deterministic `BoltFatigue` model, chart,
  page, and 1e-6 proof are untouched.
- **Mill liner force** ✅ — `models/mill-force.rvm` (one model over a `method` axis) +
  `views/mill-force.rvm` (force-angle cartesian, rose + cross-section polar). The
  faithful/grounded duality collapsed to **one model + a sign parameter + three kernels**;
  the IR reproduces **both** hand-coded models per-segment to **1e-6**. ← the symmetry-break proof.
- **Mill charge-motion** ✅ — `models/mill-charge.rvm` + `views/mill-charge.rvm` (the **disc**
  cross-section: charge region + COM + the cataracting particle stream). Reproduces the
  hand-coded charge geometry (shoulder/toe/COM/cataracting-index) to **1e-6**. ← the
  **time/phase axis + particle/field** proof: the entire ballistic trajectory is honest dataflow
  over the `(particle, t)` product — **no kernel, and zero evaluator change**. The only lowered
  leaves are the fill solver + the polygon centroid; stochastic launch jitter is the injected
  seeded sampler. (The doc guessed the cataracting model might be a break — it isn't; the
  grammar absorbs time and particles as "just more axes".)

### Shell — `shell.rvm`

- ✅ Authored as a tree of **`view` surface nodes** (login → home → app screens, module grid,
  Goodman + mill-force + mill-charge app screens) composing down to the chart nodes by id.
  Faithful DESIRE, no direct route/widget plumbing (deliberately churn-proof). All three science
  cards are now **active** (the mill-charge card unlocked).

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
- `test/desire-engentus-millcharge-eval.test.js` — charge geometry vs `mill_physics.js` (1e-6,
  3 param sets); the fill solver residual; the `(particle, t)` trajectory field recomputed
  independently with the same seeded sampler — the time/phase-axis proof.
- `test/desire-engentus-millcharge-chart.test.js` — disc-frame plan: charge polygon, COM point,
  and the `particles` mark emitting one frame per time step.
- `test/desire-engentus-millcharge-anim.test.js` — animation polish: `frameIndexForElapsed`
  cadence (loop/speed/clamp/uneven spacing) + disc wall-collision clipping (`inDisc`, `wallClip`).
- `test/desire-engentus-mc-eval.test.js` — Monte-Carlo: `ensemble` axis materialises N samples;
  the response varies per sample; `reduce percentile over sample` matches an independent type-7
  percentile (1e-12); p10 ≤ p50 ≤ p90; the reducer convention pinned on a known set.
- `test/desire-engentus-mc-chart.test.js` — `band` (p10..p90) + median line + per-sample `cloud`
  plans, with the y-axis auto-fitting above the band.
- `test/desire-engentus-probe.test.js` — `probeReadout` (exact + interpolated curve, band p10/p90,
  area categories, per-sample cloud) + `frameIndexForValue` nearest-frame scrubbing (with clamp).
- `test/desire-engentus-shell.test.js` — shell surfaces compose to the charts (all three apps,
  incl. the Goodman MC bands chart).
- `plugins/chart-runtime/chart-runtime.test.js` — spec resolution, inlined-bundle validity, page HTML.
- `test/desire.test.js` 45/45 — incl. broad-specimen over all engentus `.rvm` files (zero unknowns).
- `test/plugin-boundaries.test.js` — chart-runtime is a valid package; generic runtimes import no `src/`.
- Thesis grep: `dataflow-eval.js` + `gog-runtime.js` carry **no** domain terms (comments only).

---

## Still TODO to honestly complete the DESIRE SPA slice

### Feature work

- ✅ **Mill-charge** (3rd science) — the charge-motion / cataracting view. The time/phase axis +
  particle/field representation are proven (see "Three science verticals"); the predicted
  symmetry break was just the fill solver, and the cataracting model needed no kernel at all.
- 🟡 **Live particle animation polish** — frame **cadence** (`frameIndexForElapsed`: rAF tracks
  the time axis's physical span × `speed`, loops — no longer tied to display refresh) and
  **wall-collision clipping** (disc-frame `inDisc` flag, tunable `wallClip` fraction) are built
  and node-verified at the plan/helper level. Remaining: the final on-canvas visual tuning of
  `speed`/`wallClip` against the SPA (waits on the live-browser render below).
- ✅ **Monte-Carlo across sciences** — `axis sample = ensemble(N)` + `reduce p10/p50/p90 over
  sample` + `band`/`cloud` layers, demonstrated on Goodman (`BoltFatigueMC` + `GoodmanMCBands`).
  The prediction held exactly: stochasticity stayed "just another axis" (the `ensemble` kind) +
  an injected seeded sampler (`sampling.js`); the only evaluator work was wiring a real `reduce`
  (array-aware reducers). Reusable verbatim by any science.
- 🟡 Probe / scrubber interactivity bound to axes (local rebind in `drawChart`). The binding
  logic is built and node-verified: **`probeReadout(plan, x)`** reads each cartesian layer's
  value(s) at an arbitrary x (line/curve, band p10/p90, area categories, per-sample cloud) by
  linear interpolation — no model re-eval; **`frameIndexForValue(tValues, t)`** maps an axis
  value to the nearest frame (the value-driven companion to `frameIndexForElapsed`). `drawChart`
  exposes the host hooks (cartesian `node.probeAt(x)` + a hover/drag overlay; disc
  `node.scrubTo(i)` / `scrubToValue(v)` / `play()`) that rebind only the overlay/dots. Remaining:
  the on-canvas drag affordance + readout styling (waits on the live-browser render below).

### Integration

- ⛔ Promote `mill-force-kernels.js` to a registered **`plugin.compute`** package
  (plugin.json + co-located test).
- ⛔ **Live browser render** for all sciences — serve the chart route, Playwright screenshot,
  pixel-parity vs the SPA static charts. (Render path is built + node-verified; this is the paint.)
- ⛔ Wire the shell surfaces to served routes / a real navigable page in the widget runtime.
- ⛔ Investigate the unrelated full-suite hang (`node scripts/run-tests.mjs` stalls ~test 309 in a
  server/integration test — not our code; everything in our scope passes fast in isolation).

### Faithfulness debt

- 🟡 `serialize.js` round-trip for `model`/`chart` (so `.rvm` ⇄ IR stays honest both ways).
- 🟡 Goodman's `boltSet` multiplicity (multiple overlaid bolt sets) — modelled as a single set;
  now that MC has landed the pattern is clear (a `from(boltSets)` axis alongside `sample`), but
  the multi-set overlay itself is not yet authored.
- 🟡 Mill-force `m_liner > 0` collapsed-segment edge case differs from the JS by `cos·m_liner·g`
  (the JS zeroes `Fw` there); exact at the `DEFAULT_INPUTS` (`m_liner = 0`) used for verification.

### Deferred by design

- Symmetry-break-as-witness (auditable "why we lowered here") — obvious once on the canvas.
- Sourcery guided/on-rails authoring of these forms.

---

## Thesis scorecard

- ✅ The reusable capabilities (`dataflow-eval`, `gog-runtime`, `sampling.js`) carry **no** domain
  logic and only *grew* generic features (polar frame, `where`, param-resolved axes for the 2nd
  science; the disc frame + `particles` mark for the 3rd; the `ensemble` axis, array-aware
  `reduce`, and `band`/`cloud` marks for MC). `dataflow-eval` was **not touched** for mill-charge
  (time/particles are just sweep axes) and grew only the generic `reduce`/`ensemble` for MC.
- ✅ Goodman needed **zero kernels** (pure composition) — which is why it was one-shottable.
- ✅ The **first kernel appeared exactly at mill-force**, at the faithful/grounded divergence,
  and nowhere earlier. The duality reduced to one parameterised model + three named kernels.
- ✅ Mill-charge confirmed the prediction *and* sharpened it: the symmetry break was only the
  fill solver (+ the polygon centroid); the **entire cataracting trajectory is honest dataflow
  over a time×particle product**, and stochasticity entered as one more injected function.
- ✅ Monte-Carlo held the "stochasticity is just another axis" claim literally: the `ensemble`
  axis + injected seeded sampler + a real `reduce` (generic stats) gave p10/p50/p90 bands with
  no domain code and no change to any science's honest composition.
- The model composes across three sciences + an MC overlay, with probe/scrubber axis-binding
  built. All Feature work is done at the node level; the remaining work is integration only —
  the live-browser paint (where the animation cadence, wall-clip, and probe/scrub drag
  affordances get their final visual tuning) and the plugin-install mop-up. No new core.
