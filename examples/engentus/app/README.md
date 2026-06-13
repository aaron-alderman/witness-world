# Engentus SPA — expressed in DESIRE

A faithful re-expression of the hand-coded Mill-iQ SPA (`example-ports/engentus/`)
in the DESIRE IR. The goal is **not** a plugin wrapper around the app — it is to
say the app *in the language*, lowering only at genuine symmetry breaks. The
Goodman fatigue vertical is the first proof.

## Strata → homes

| Stratum | Expressed as | Where |
|---|---|---|
| Shell / screens (login → home → app) | `view` surface nodes | [shell.rvm](shell.rvm) |
| Science — bolt fatigue (Goodman) | `model` → `dataflow` kernel node | [models/goodman.rvm](models/goodman.rvm) |
| Chart — Goodman diagram | `chart` → `surface(chart)` node | [views/goodman.rvm](views/goodman.rvm) |
| Science — mill liner force | `model` over a `method` axis | [models/mill-force.rvm](models/mill-force.rvm) |
| Charts — force-angle / rose / cross-section | `chart` (cartesian + polar) | [views/mill-force.rvm](views/mill-force.rvm) |

Two new authored DESIRE forms make this possible (added to `src/desire`):

- **`model`** — a product-type dataflow graph: `axis` (sweep/category),
  `param`, `derive … over <axes>`, `reduce`. Output is a labeled product tensor.
- **`chart`** — grammar-of-graphics over a model's axes: `frame`, `x`/`y`
  encodings, `editable` tokens, and a `layer` stack of marks (`area`, `line`,
  `rule`, `point`) bound to model channels. `chart X of Model { … }`.

## Plugin dependency (no direct routing)

This module **depends on `plugin.chart-runtime`** (capability `chart.render`).
The platform installs it; the module does not wire routes itself. The plugin
([plugins/chart-runtime/](../../../plugins/chart-runtime/)) is **generic** — it
resolves any witnessed `chart` over its `model` and paints it with D3:

- `dataflow-eval.js` — product-type evaluator (no domain logic)
- `gog-runtime.js` — `planChart` (pure geometry) + `drawChart` (D3)
- `goodman-stdlib.js` — the fatigue domain functions (honest one-liners, injected)
- `chart-page.js` / `chart-client.js` — self-contained render page + browser boot
- `runtime.js` / `plugin.json` — the bundle + the `chart.render` contract

## Thesis check

The two reusable artifacts (`dataflow-eval.js`, `gog-runtime.js`) contain **no
engentus/fatigue/Goodman logic** — only a product-type evaluator and a GoG
grammar. A future scientific module reuses them verbatim. The model composes.

Goodman itself has **no symmetry break**: every model leaf is an honest one-liner,
so it needed **zero numeric kernels** — it stays fully in the IR.

**Mill-force confirmed the prediction.** Its faithful-vs-grounded duality collapsed to
**one `MillForce` model over a `method` axis**: the easy half (the `Fw_t` sign) became a
parameter, and the irreducible half — `fill_angle`, `gravity_area`, `cf_mass_moment`
(grid/Brent/Gauss-Legendre/shoelace) — became the **first three kernels**
([plugins/chart-runtime/mill-force-kernels.js](../../../plugins/chart-runtime/mill-force-kernels.js)),
referenced from the IR and injected like a std-lib. The IR reproduces **both** hand-coded
models per-segment to 1e-6, and `dataflow-eval.js`/`gog-runtime.js` stayed domain-free —
the latter only *grew* a generic polar frame + `polygon`/`wedge` marks + a `where` slice.
The first kernel appeared exactly where the thesis said it would.

## Verified (node, no browser)

- forms parse → classify semantic → normalize → apply (`test/desire-engentus-forms.test.js`)
- the evaluator reproduces `physics.js` bands + bolt-response curve to 1e-6 (`test/desire-engentus-eval.test.js`)
- the chart render plan matches the model geometry (`test/desire-engentus-chart.test.js`)
- the chart-runtime plugin resolves specs, inlines into valid JS, emits the page
  (`plugins/chart-runtime/chart-runtime.test.js`)
- the shell composes screens down to the chart (`test/desire-engentus-shell.test.js`)
- mill-force: the IR model reproduces BOTH hand-coded models to 1e-6
  (`test/desire-engentus-millforce-eval.test.js`) and its cartesian + polar charts plan
  faithfully (`test/desire-engentus-millforce-chart.test.js`)

## Deferred to runtime-settle

The live browser render (Playwright screenshot vs the SPA) and the literal
shell-screen serving wait on the in-flight runtime/plugin-install migration. The
render path is fully built and node-verified; the browser step is a thin D3 paint
of an already-verified plan.
