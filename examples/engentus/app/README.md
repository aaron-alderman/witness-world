# Engentus SPA expressed in DESIRE

This app is a faithful DESIRE-owned re-expression of the reference frontend in
`example-ports/engentus/`.

The goal is not to hide Engentus behind a plugin shim. The goal is to say the
app in authored forms, keep the runtime generic, and only lower at genuine
symmetry breaks.

## Ownership

| Layer | Owner | Where |
|---|---|---|
| Shell screens and route states | Authored DESIRE surfaces | [shell.rvm](shell.rvm) |
| Goodman science model | Authored DESIRE model | [models/goodman.rvm](models/goodman.rvm) |
| Goodman chart surface | Authored DESIRE chart/view | [views/goodman.rvm](views/goodman.rvm) |
| Mill charge model and chart | Authored DESIRE model/view | [models/mill-charge.rvm](models/mill-charge.rvm), [views/mill-charge.rvm](views/mill-charge.rvm) |
| Mill force model and charts | Authored DESIRE model/view | [models/mill-force.rvm](models/mill-force.rvm), [views/mill-force.rvm](views/mill-force.rvm) |
| Generic chart rendering | Reusable runtime plugin | [plugins/chart-runtime/](../../../plugins/chart-runtime/) |
| Generic shell rendering | Reusable core runtime | [src/runtime-surface-shell.js](../../../src/runtime-surface-shell.js) |

## Runtime boundary

`plugin.chart-runtime` remains the reusable chart capability. It owns generic:

- chart spec resolution
- model evaluation
- chart planning and drawing
- mounted chart page boot

It does not own Engentus shell layout, copy, routes, ids, or CSS.

The main app shell is rendered by the generic core surface runtime. Engentus
expresses its frontend through authored surface trees and props instead of an
Engentus-specific runtime plugin.

Decontamination status:

- `examples/engentus/app.wtoml` installs only `plugin.chart-runtime`
- `/`, `/engentus`, and `/engentus/:screen` resolve through core `page.surface`
- there is no `plugin.engentus-example` runtime dependency in the app path
- the first-party plugin seed catalog no longer carries an Engentus example plugin

## HTML and CSS parity contract

The parity target is the reference app in `example-ports/engentus/`.

That reference stays a static oracle only. We use it for authored structure,
copy, asset, selector, and CSS comparison. We do not treat it as the served app
under normal parity proof.

Current seam:

- authored structure parity lives in [shell.rvm](shell.rvm)
- app-owned shell CSS lives in [engentus-shell.css](engentus-shell.css)
- app-owned chart page CSS lives in [engentus-chart-pages.css](engentus-chart-pages.css)
- app-owned presenter bootstraps live in [presenters/](presenters/)
- generic shell projection lives in [src/runtime-surface-shell.js](../../../src/runtime-surface-shell.js)
- generic chart mounting lives in [plugins/chart-runtime/runtime.js](../../../plugins/chart-runtime/runtime.js)

Rules:

- app-specific ids, copy, route targets, module metadata, and selector hooks
  stay authored in Engentus
- generic shell templates stay generic in core runtime
- no Engentus-specific layout branches belong in the renderer
- chart mini-app mounting stays behind the shell boundary
- route-specific chart/sidebar behavior stays behind the app-owned presenter boundary

## Presenter bootstrap contract

The core shell page now supports generic app-owned presentation assets:

- `pageModuleHref`
- `pageModuleExport`
- `pageStylesheetHrefs`
- `pageScriptSrcs`

Engentus uses `pageModuleHref` on the authored route surfaces themselves.
Goodman, mill-charge, and mill-force each point directly at their own presenter
module. Core only passes generic page context plus mounted chart descriptors;
route semantics stay in the app layer.

For fidelity, the route presenters now load app-owned copies of the reference
frontend modules from `examples/engentus/app/presenters/reference/`. The
`example-ports/engentus` tree remains the oracle only and is not executed by
the served DESIRE app.

## Shell template contract

The core renderer is driven by authored `app-shell` props. The current templates
used by Engentus are:

- `sidebar-grid`
- `viewer-sidebar-main`
- `viewer-sidebar-main-metrics`
- `viewer-sidebar-tabs`

Engentus-specific ids and hooks such as `chart-wrap`,
`mill-canvas-wrap`, `mill-force-chart-tabs`, `tb-goodman-tools`,
`mill-pill`, `mill-metrics-hdr`, and `mill-metrics-panel` stay in
[shell.rvm](shell.rvm) as plain authored props.

## Chart page contract

Each chart surface may author page props such as:

- `pageStylesheetHref`
- `bodyClass`
- `viewportClass`
- `hostClass`
- `mountId`
- `mountClass`
- `mountTag`
- `overlayCanvasId`
- `tooltipId`
- `functionsModules`
- `functionsExports`

`functionsModules` are authored browser module URLs, typically under
`/app-static/app/...`. The runtime projects only the generic chart page
skeleton and loads those helpers generically at runtime. Engentus owns the
actual ids, selector hooks, CSS, and domain helper modules.

## Proof

Focused parity commands:

```powershell
node --test test/desire-engentus-shell.test.js test/runtime-surface-shell.test.js test/runtime-core-surface-page.test.js
node --test test/engentus-html-parity.test.js test/engentus-frontend-host.test.js
node --test test/engentus-browser-parity.test.js test/engentus-frontend-browser.test.js
```

Current evidence on top of those commands:

- direct DESIRE-to-HTML parity passes for login, signout, home, Goodman, mill charge, and mill force
- app-owned shell CSS and chart CSS match the reference selectors and token blocks being checked
- browser routing proves the DESIRE app follows login -> home -> Goodman / mill-charge / mill-force -> signout
- the served DESIRE app loads no backend pipeline witnesses
- `src/runtime-surface-shell.js` is template-driven and does not encode Engentus product layouts

What those prove:

- DESIRE shell surfaces normalize with route and module metadata intact
- the generic shell renderer stays template-driven rather than Engentus-specific
- direct DESIRE projection matches the reference login, signout, home, and
  viewer-shell HTML structure and copy
- app-owned shell CSS and chart-page CSS match the reference selectors and root
  theme tokens being checked
- live browser parity checks the served DESIRE shell against the authored
  presentation contract for login, home, Goodman, mill charge, mill force, and
  signout without executing `example-ports/engentus`
- the hosted DESIRE app serves the real shell without backend pipeline witnesses
- the live browser flow follows login -> home -> Goodman / mill-charge /
  mill-force -> signout
- core `page.surface` routing renders authored surface trees by request path

## Current boundary

The outer Engentus frontend is now owned by authored DESIRE plus app-owned CSS.
The reusable runtime surface area is:

- core shell projection
- generic chart mounting
- generic chart rendering

Any remaining fidelity work should be treated as one of:

- authored structure or asset drift in Engentus
- app-owned CSS drift in Engentus
- genuinely generic renderer behavior missing from the core shell or chart runtime

It should not be solved by reintroducing an Engentus-specific runtime branch.
