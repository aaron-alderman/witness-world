# DESIRE-SPA - Engentus rescue status

A faithful re-expression of the hand-coded Mill-iQ SPA (`example-ports/engentus/`)
in the DESIRE IR. The goal is not a plugin wrapper around the app - it is to
say the app in the language, lowering only at genuine symmetry breaks.

This document is the canonical Engentus planning and status document. The app
README is secondary and should only point back here.

Repo-wide constrained LLM app-authoring policy now lives in
`docs/LLM-AUTHORING-POLICY.md`. Engentus is subject to that policy; it is not a
special exemption case.

## Thesis

- The shell, copy, route states, assets, and CSS belong to the app layer.
- The shell must remain authored in `RVM/WTOML` style. The browser must not
  boot into a handwritten JS facade that reconstructs the app UI independently
  of the authored DESIRE program.
- Core runtime code must stay light. It may host, route, load, inject
  capabilities, and manage lifecycle; it must not become a second UI language
  or a hidden frontend authority seam.
- `plugin.chart-runtime` is a real reusable capability boundary.
- Any lowered JS must justify itself as one of:
  - host/runtime infrastructure that every app could plausibly need
  - an explicit optional reusable capability
  - app-owned helper code at a true symmetry break
- Optional capabilities must not be baked into the core surface host contract.
  If an app needs charts, windows, or other non-universal behavior, that must
  be resolved explicitly rather than assumed by core.
- The reference app is an oracle for parity comparison only. It is not to be
  executed as hidden frontend authority.
- In constrained authoring sessions, Engentus work must go through the
  first-party `plugin.authoring` substrate only. If current authoring cannot
  express the needed frontend behavior, the correct result is a blocked handoff
  into the human platform lane rather than handwritten JS or runtime patching.

## Canonical frontend seam

- `examples/engentus/app/shell.rvm` and related authored DESIRE files remain
  the source of truth for shell structure, route states, copy, and UI
  composition.
- Lowering is allowed to produce executable browser artifacts, but those
  artifacts must remain derivative of the authored DESIRE frontend rather than
  a parallel handwritten renderer.
- `src/runtime-surface-browser-client.js` must be a host only:
  - load the lowered app artifact
  - provide universal platform services
  - forward lifecycle and route changes
  - tear down cleanly
- `src/runtime-surface-browser-client.js` must not:
  - assemble app DOM with bespoke render helpers
  - own app state shape or reducers
  - interpret app-specific selectors or templates
  - embed chart, window, Goodman, or other product-local behavior
  - introduce HTML-side authority contracts as a second source language
- App behavior may consume optional capabilities, but only through explicit
  seams. The existence of a capability must never move authority for the shell
  out of the authored DESIRE program.

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
- Allowing core browser runtime code to accumulate bespoke app rendering logic
  is the same category of mistake in a different location. That too creates a
  dangerous hidden authority seam and must be removed.
- `examples/engentus/app/helpers/goodman-study.js` still carries too much
  frontend authority today. It should shrink toward leaf numerical/statistical
  helpers while state, routes, view composition, and interaction intent move
  into authored DESIRE declarations.
- The README drifted into blessing that seam instead of pointing back to this
  document.
- Browser-level parity was previously claimed as complete while the live served
  app still depended on the forbidden seam and had failing browser proofs.

### Still-unfinished proof obligations

- Rebuild Goodman, mill-charge, and mill-force live module behavior on
  thesis-aligned seams:
  - authored shell state and props
  - a host-only core browser seam
  - optional reusable capability seams where genuinely justified
  - app-owned helper code only where a real symmetry break remains
- Rebuild the browser execution path so the served app is driven by lowered
  DESIRE-owned frontend artifacts rather than handwritten browser facades or
  bespoke core render helpers.
- Continue moving Goodman-side UI/state authority out of `goodman-study.js`
  and into authored `RVM/WTOML`, keeping JS only for true leaf mechanics and
  statistics where the language does not yet express them cleanly.
- Re-establish browser integration proof for the supported flow:
  - login -> home -> Goodman / mill-charge / mill-force -> signout
  - no dynamic import 404s
  - no copied presenter/client authority
  - no core-owned bespoke app renderer
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
- Bespoke app rendering and interaction machinery inside
  `src/runtime-surface-browser-client.js`
- Any handwritten browser facade that reconstructs the shell outside authored
  `RVM/WTOML`
- Any doc or test language that treats those seams as acceptable architecture

## Proof categories

These categories should stay explicit and separate:

- DESIRE model/chart/shell node proof
- Generic shell runtime proof
- Chart-runtime boundary proof
- Direct HTML parity proof
- CSS parity proof
- Host-only browser runtime proof
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
