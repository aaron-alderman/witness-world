# Plan — Express the Engentus SPA in DESIRE (model + view forms, Goodman vertical)

## Context

`example-ports/engentus/` is a hand-coded SPA (login → home → app shell → three scientific "apps", each with bespoke D3/canvas charts driven by real models + Monte Carlo). The goal is **not** to wrap it in a plugin. It is to re-express it *faithfully in DESIRE first*, lowering only at genuine **symmetry breaks** (two-slightly-similar-things whose irreducible difference can't be parameterised away). The success test of the grand thesis is that doing so **spawns generic, reusable capabilities** — not an `engentus` plugin.

Converged design (from the jam):
- **One primitive — the product type.** A model emits a product over named *axes* whose fields are heterogeneously typed (float / int / bool / category). The labeled tensor is its dense-float face. Admitting int/bool is what makes both MIP *and* dtype-driven chart defaults fall out of the same primitive.
- **Charts = grammar-of-graphics over the model's axes**, D3-backed. dtypes drive the 80% defaults; explicit encodings reach the 20%. Representation choices are editable/witnessed.
- **Lower at the symmetry break.** Goodman has *none* — it is pure composition — so this first vertical needs **zero numeric kernels** (no `compute` plugin). It stays fully in the IR; only rasterisation lowers. The thesis predicts mill-force is where the first `primitive` appears (its faithful/grounded duality). That is deliberately out of scope here.

Decisions already locked with the user:
- Location: `examples_rvm/engentus/app/`.
- First delivery: **full engentus shell + the Goodman fatigue diagram**.
- Render locus: **client-side reactive runtimes** (a JS dataflow evaluator + a D3-backed GoG runtime) — the real interactive app, and the generic reusable capability.

Deferred (explicitly out of scope): symmetry-break-as-witness; the `compute`/kernel capability; mill-charge animation and mill-force models; Sourcery guided authoring.

---

## Architecture

Three strata, three homes:

| Stratum | Home | New work |
|---|---|---|
| Shell / nav / auth / news / module-grid / windows | existing **widget runtime** (`defineWidget`/`widgetTree`/`renderWidgetPage`) + `frontendProgram` + `defineRoute` | author only — minimal new widget kinds |
| The science (Goodman bolt-fatigue) | new **`model`** form → DESIRE `dataflow` kernel node → client **dataflow evaluator** | new form + new runtime |
| The chart (Goodman diagram) | new **`view`** form → DESIRE `surface` node (`surfaceKind:"chart"`) → client **GoG/D3 runtime** mounted by a `Chart` widget | new form + new runtime |

Data flow end-to-end:
```
goodman.rvm (model + view)
  → parse (rvm.js)  → DESIRE+  → normalize  → DESIRE kernel nodes
        model  → kernel kind `dataflow`  (params, axes, derives, reduces)
        view   → kernel kind `surface` (surfaceKind:"chart", gog spec, modelRef)
  → apply.js:
        dataflow node → register model spec (queryable/witnessed)
        chart surface → defineWidget(kind:"Chart", props:{ modelSpec, viewSpec })
  → page tree includes the Chart widget; defineRoute serves it
  → renderWidgetPage → HTML + embedded client engine
  → [client] dataflow-eval(modelSpec) → labeled product tensor
  → [client] gog-runtime(viewSpec, tensor) → reactive D3 SVG
        probe / hover / scrubber bind to axes → local redraw, no round-trip
```

---

## New language forms

### `model` (→ DESIRE kernel kind `dataflow`)
```
model BoltFatigue {
  axis sm       : sweep over [0,650] step 1.6
  axis lifetime : category [0.5, 2, 6]
  axis boltSet  : category from boltSets
  param preload_stress : float
  param F_alt, rpm, sigma_lim, m_slope, UTS, YS : float
  derive cycles    = months_to_cycles(lifetime, rpm)
  derive fat_limit = sn_hannover(cycles, sigma_lim, m_slope)
  derive band      = goodman_sa(sm, fat_limit, UTS, YS)  over sm, lifetime
  derive curve     = sigma_a_response(sm, gamma, F_alt)  over sm, boltSet
  derive slip      = F_per_bolt / (mu * A_s * n_interfaces) over boltSet
}
```
Body shape: `{ axes:[{name,kind,spec}], params:[{name,type,dist?}], derives:[{name,expr,over?}], reduces:[{name,expr,over}] }`. `expr` is an honest expression string parsed to an AST by the evaluator. Function leaves (`sn_hannover`, `goodman_sa`, `months_to_cycles`, `sigma_a_response`) are **honest one-liner library exprs**, *not* kernels — defined in the evaluator's standard library.

### `view` (→ DESIRE `surface`, `surfaceKind:"chart"`)
```
view GoodmanDiagram of BoltFatigue {
  frame cartesian { x: sm [0,650] ; y: sigma_a [0, auto] }
  editable { title, x.label, y.label, band.fills[], annotations[] }
  layer bands  { mark area over lifetime encode { y0..y1: band ; fill: band.fills } }
  layer curves { mark line over boltSet  encode { y: curve ; stroke: boltSet.color } }
  layer slip   { mark rule over boltSet  encode { x: slip ; dash: true } }
  layer yield  { mark rule               encode { line: 600 - sm } }
  layer probe  { mark point over boltSet encode { x: probe ; y: curve@probe } }
}
```
Body shape: `{ modelRef, frame:{kind,scales}, editable:[...], layers:[{name, mark, over?, encode:{...}, when?}] }`.

---

## Files to create

- `examples_rvm/engentus/app/models/goodman.rvm` — the `model` form (no kernels).
- `examples_rvm/engentus/app/views/goodman.rvm` — the `view` form.
- `examples_rvm/engentus/app/shell.rvm` — login → home (news panel + module grid) → app view, as widget/page/form/button forms + a frontendProgram + routes. Goodman is the one "active" app; others rendered as locked cards (matches the SPA).
- `examples_rvm/engentus/app/README.md` — what this is, the stratum map, how to run.
- `plugins/chart-runtime/` (or fold into `plugins/inspect`) — the **two client runtimes** as embeddable JS strings:
  - `dataflow-eval.js` — expr parser + evaluator over the product type (sweep/reduce/`over`), std-lib of the Goodman leaf functions.
  - `gog-runtime.js` — D3-backed GoG interpreter: frame → scales, layers → marks (area/line/rule/point), encodings, editable tokens, reactive rebind.

## Files to modify (known surface from recon)

- `src/desire/ir.js` — add `dataflow` to `DESIRE_KERNEL_KINDS` + `DESIRE_PLUS_SEMANTIC_KINDS`; add `validateDesireNodeBody` case for `dataflow`; allow `surfaceKind:"chart"` body fields on `surface`.
- `src/desire/rvm.js` — add `model`/`view` to the inline + block form recognisers; add `semanticRvmShape` cases producing `kind:"dataflow"` and `kind:"surface"`(chart); parse the nested `axis`/`param`/`derive`/`layer`/`encode` blocks (reuse `extractNamedBlock`, `parseNamedValueBlock`, `parseTypedFieldBlock`).
- `src/desire/normalize.js` — `normalizeSemanticNode` cases: `dataflow` → kernel node; `surface`(chart) carries the gog spec + `modelRef`.
- `src/desire/apply.js` — `applyNativeSemanticNode`: `dataflow` → register model spec witness; `surface`(chart) → `defineWidget(kind:"Chart", props:{modelSpec, viewSpec})` resolving `modelRef`.
- `src/desire/serialize.js` — round-trip cases for both (keeps the `.rvm` ⇄ IR honest).
- `plugins/inspect/widget-page.js` — (a) `renderWidget` case for `kind:"Chart"` → `<div data-chart-spec="…">` placeholder; (b) in the client engine IIFE, embed `dataflow-eval.js` + `gog-runtime.js` and a `mountGoGChart(el, {modelSpec, viewSpec})` boot pass over `[data-chart-spec]`; load D3 (CDN `<script>` in `renderHead`, mirroring `index.html`).

---

## Build sequence (milestones — core vertical first, shell last)

**M1 — Forms + IR (no rendering).** Add `model`/`view` parsing through parse→normalize→apply→serialize. Unit-test in `test/desire.test.js`: a fixture `.rvm` emits a `dataflow` node + a `Chart` surface widget with the expected body. *Acceptance: pipeline round-trips; nodes validate.*

**M2 — Dataflow evaluator (standalone).** `dataflow-eval.js` evaluates `BoltFatigue` to a labeled product tensor. Node test against numbers cross-checked from `example-ports/engentus/js/physics.js`. *Acceptance: band/curve/slip arrays match the JS within tolerance.*

**M3 — GoG runtime + Chart widget (static Goodman on a bare page).** Wire `mountGoGChart` + D3; serve a minimal route holding only the Chart widget. *Acceptance: the static Goodman diagram (bands + curves + slip + yield + probe) renders in the browser from the `.rvm` alone, matching the SPA's static chart.* — **this is the thesis proof point.**

**M4 — Shell.** Author login → home (news + module grid) → app view + nav as widget forms + frontendProgram; mount Goodman in the app view; lock the other two cards. *Acceptance: full navigable shell with a working Goodman app.*

(Probe interactivity is in M3 via local rebind. MC cloud + scrubber `sample`/`t` axes are a clean follow-on increment that adds axes without touching view structure — not in this plan's delivery but designed for.)

---

## Verification

- **Unit:** `node --test test/desire.test.js` — form parsing, normalization, apply emits `dataflow` + `Chart` nodes; serialize round-trips.
- **Evaluator:** a node test comparing `dataflow-eval` outputs to values computed by `example-ports/engentus/js/physics.js` for fixed params.
- **End-to-end:** boot the runtime server (via `src/cli.js` / `src/runtime-server.js`), GET the engentus route, assert the returned HTML contains the chart spec + engine; then open in a browser (Playwright is already a devDependency) and confirm the Goodman SVG renders and the probe responds. Screenshot-compare against `example-ports/engentus/` static chart.

## Thesis check (record at the end)

Confirm the two artifacts under `plugins/` (`dataflow-eval`, `gog-runtime`) contain **no** engentus-specific logic — only the product-type evaluator and the GoG grammar. If a future scientific app could reuse them verbatim, the model composed.
