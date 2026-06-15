# DESIRE-SPA - Engentus rescue status

A faithful re-expression of the hand-coded Mill-iQ SPA (`example-ports/engentus/`)
in the DESIRE IR. The goal is not a plugin wrapper around the app - it is to
say the app in the language, lowering only at genuine symmetry breaks.

This document is the canonical Engentus planning and status document. The app
README is secondary and should only point back here.

## Thesis

- The shell, copy, route states, assets, and CSS belong to the app layer.
- Generic rendering belongs in reusable runtime seams, not in Engentus-specific
  shims.
- `plugin.chart-runtime` is a real reusable capability boundary.
- Any lowered JS must justify itself as universal runtime/presentation
  infrastructure, explicit reusable chart capability, or app-owned helper code
  at a true symmetry break.
- The reference app is an oracle for parity comparison only. It is not to be
  executed as hidden frontend authority.

## Current honest state

### Salvageable progress

- `examples/engentus/app.wtoml` serves Engentus through core `page.surface`
  routes instead of an Engentus runtime plugin.
- `src/runtime-surface-shell.js` is a generic route-aware shell projector for
  authored `surface` trees.
- `plugin.chart-runtime` remains the reusable chart capability boundary.
- `examples/engentus/app/shell.rvm` is the primary authored source of shell
  structure, copy, route keys, ids, and chrome.
- Engentus keeps app-owned shell/chart CSS, images, module SVGs, and
  chart-function helpers under the app boundary.
- The direct HTML parity and CSS parity harness is worth keeping because it
  measures authored projection quality without delegating authority to the
  reference runtime.

### False progress / regressions

- `pageModuleHref` / presenter bootstraps were introduced as a hidden live
  execution seam for Engentus routes. That is not a faithful DESIRE seam.
- Copied `examples/engentus/app/presenters/*` controller code and
  `examples/engentus/app/client/*` shared runtime code became executable
  frontend authority. That is explicitly out of bounds for this slice.
- The README drifted into blessing that seam instead of pointing back to this
  document.
- Browser-level parity was previously claimed as complete while the live served
  app still depended on the forbidden seam and had failing browser proofs.

### Still-unfinished proof obligations

- Rebuild Goodman, mill-charge, and mill-force live module behavior on
  thesis-aligned seams:
  - authored shell state and props
  - generic shell runtime interactions
  - reusable chart-runtime behavior
  - app-owned helper code only where a real symmetry break remains
- Re-establish browser integration proof for the supported flow:
  - login -> home -> Goodman / mill-charge / mill-force -> signout
  - no dynamic import 404s
  - no copied presenter/client authority
- Re-establish live browser parity against the reference flow after that rebuild.

Until those proofs are green again, live module execution parity is not complete.

## Accepted boundaries

### Keep

- Core `page.surface` route handling
- `src/runtime-surface-shell.js` for genuinely app-neutral shell behavior
- `plugin.chart-runtime`
- App-owned shell/assets/CSS/chart-function helpers
- HTML/CSS parity tests and reference comparison harness

### Remove

- `pageModuleHref` / `pageModuleExport` as Engentus shell bootstraps
- `examples/engentus/app/presenters/*` as executable app authority
- `examples/engentus/app/client/*` as executable shared frontend runtime
- Any doc or test language that treats those seams as acceptable architecture

## Proof categories

These categories should stay explicit and separate:

- DESIRE model/chart/shell node proof
- Generic shell runtime proof
- Chart-runtime boundary proof
- Direct HTML parity proof
- CSS parity proof
- Browser shell-route proof
- Browser live execution proof
- Boundary / no-cheat proof

The structure/CSS parity categories can be green before live execution proof is
green. They are not the same thing.

## Focused commands

The rescue keeps these proof commands as the honest baseline:

```powershell
node --test test/desire-engentus-shell.test.js test/runtime-surface-shell.test.js test/runtime-core-surface-page.test.js
node --test test/engentus-html-parity.test.js test/engentus-frontend-host.test.js
node --test test/engentus-browser-parity.test.js test/engentus-no-cheat-boundary.test.js
```

When the live module rebuild lands, browser integration and reference-vs-DESIRE
live parity should be promoted back into this list.
