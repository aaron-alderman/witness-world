# Engentus Oracle Behavior Inventory

This document records behavior evidence read from the reference oracle in
`example-ports/engentus/`.

The reference JavaScript may be inspected to understand behavior, timing,
state, and visual effects. It must not be copied back as an app runtime,
presenter, controller, or hidden browser facade.

## Role

The reference app is an oracle for:

- what screens exist
- what interactions occur
- what state changes happen
- what timing and animation effects are visible
- what data is durable, session-like, or ephemeral
- what math and rendering helpers are true leaf implementation details

It is not an authority for:

- runtime architecture
- app-local browser runtimes
- DOM reconstruction code in `examples/engentus`
- generic `page.surface` behavior
- `data-*` authored contracts

The target remains the DESIRE expression described in `docs/DESIRE-SPA.md`.
This inventory is evidence feeding WHTML/WCSS/WAS uplift and later authored
surface/process/projection work.

## Reference Files Read

- `example-ports/engentus/index.html`
- `example-ports/engentus/js/main.js`
- `example-ports/engentus/js/store.js`
- `example-ports/engentus/js/storage.js`
- `example-ports/engentus/js/sidebar.js`
- `example-ports/engentus/js/simulation.js`
- `example-ports/engentus/js/scrubber.js`
- `example-ports/engentus/js/windows.js`
- `example-ports/engentus/js/chart.js`
- `example-ports/engentus/js/canvas.js`
- `example-ports/engentus/js/mill_main.js`
- `example-ports/engentus/js/mill_view.js`
- `example-ports/engentus/js/mill_canvas.js`
- `example-ports/engentus/js/mill_force_main.js`
- `example-ports/engentus/js/bus.js`

## Shell And Auth Flow

Reference evidence:

- The hash router maps `#login`, `#signout`, `#home`, `#goodman`, `#mill`, and
  `#mill-force` to visible screen regions.
- The toolbar is hidden on auth screens and visible on app screens.
- The toolbar brand navigates from module screens back to home.
- The profile menu toggles open locally and closes on outside click.
- Sign-in is not immediate. It enters a pending button state, waits about
  1250 ms, reveals the app shell underneath, applies a page-fold transform,
  waits about 920 ms, then changes route to home and resets the login view.
- Sign-out prepares the signout book at a rotated start pose, animates it into
  place after double `requestAnimationFrame`, then changes route after about
  950 ms.
- Sign-back-in shows login underneath, folds signout away, then changes route
  after about 920 ms.
- Password reveal toggles the password input type and the visible glyph.

DESIRE mapping:

- Routes and current screen are process-owned navigation state.
- Auth transition pending state is process state.
- Button disabled/spinner content is projection from transition state.
- Page-fold timing is active behavior evidence and should be represented by a
  WAS-style timeline, with WCSS providing the style/transition evidence.
- Password reveal is generic input presentation state, not Engentus bespoke JS.
- Profile menu visibility is generic local UI state.

Do not copy:

- `authSignIn`, `authSignOut`, `authGoLogin`, or the hash router as app JS.
- Inline `onclick` behavior.
- Any DOM-id-specific shell controller into generic runtime.

## Goodman State Model

Reference evidence:

- `store.js` owns the canonical Goodman state shape.
- `storage.js` persists state to `localStorage` under `linersense_mc_v7`, with
  a migration read from `linersense_mc_v6`.
- State updates are deep-merged, debounced for persistence by 400 ms, and
  broadcast to subscribers.
- Monte Carlo result arrays and active RAF/controller handles are ephemeral.
- Restored state resets scrubber playback to not playing and recomputes stale
  metrics instead of trusting persisted runtime products.

DESIRE mapping:

- Default state shape should become authored process defaults and schemas.
- Durable fields should be declared with persistent scope.
- Ephemeral arrays/controllers should remain runtime/leaf-only.
- Debounced persistence is a platform behavior primitive, not an app-local save
  facade.

Leaf helper candidates:

- `deepMerge` semantics, if not already provided generically.
- Mechanical/statistical defaults and formatters while the language cannot
  express them cleanly.

## Goodman Sidebar And Modes

Reference evidence:

- Modes are `static`, `mc`, and `edit`.
- Mode state controls visible sidebar sections, scrubber visibility, body
  `edit-mode` class, mode button active state, and chart redraw behavior.
- Static mode renders five sliders: applied shear, mill speed, endurance limit,
  SN slope, and probe preload.
- Static slider input updates state, updates displayed value, and redraws the
  chart.
- "Save as Simulation" creates a simulation, switches mode to `mc`, removes
  edit body state, refreshes sidebar, and refreshes MC view.
- MC mode renders simulation list rows with active selection, clone/delete
  row actions, and a new simulation action.
- Run config locks while running or done and updates buttons, progress, labels,
  and time slider max.
- Edit mode renders chart labels, sizes, grid toggle, band colors, and
  annotations. Inputs update chart edit state and redraw the chart.
- Bolt sets render as explicit items with expand/collapse, edit form,
  clone/delete, color/name save, parameter sliders, free toggles, distribution
  type selection, and distribution-specific inputs.

DESIRE mapping:

- Mode and active simulation are process state.
- Sidebar sections are surface regions projected from mode state.
- Rows and actions are authored repeated collections, not handwritten DOM
  reconstruction.
- Distribution editors are authored conditional subviews over process state.
- Chart redraw is capability/plugin output driven by state changes.

Do not copy:

- `renderSidebar`, `renderSimList`, `renderEditPanel`, or `renderBoltSets` as a
  hidden app renderer.
- `data-sid`, `data-act`, `data-bsid`, or similar DOM attributes as the authored
  contract.

## Goodman Simulation And Scrubber

Reference evidence:

- Simulation CRUD creates, deletes, and clones simulation records.
- `runSimulation` creates typed-array result storage, processes bolts in chunks,
  supports pause/stop, emits progress/done/stopped bus events, and yields to the
  browser between chunks.
- Summaries compute failure count, probability, mean time, standard deviation,
  and P10/P50/P90.
- The scrubber owns `t`, `tMax`, `playing`, `speed`, and `showTrail`.
- Playback is RAF-driven, stops at `tMax`, and toggles play button content
  between play, pause, and restart.
- Scrubber refresh updates chart/canvas/windows and failure badge.

DESIRE mapping:

- Simulation metadata/config/status/progress is process state.
- Large result arrays are ephemeral leaf runtime state.
- Bus events correspond to process messages.
- RAF playback is a generic timed process/WAS primitive plus chart/canvas
  capability hooks.
- Statistical calculations can stay leaf JS.

Leaf helper candidates:

- Monte Carlo sampling and fatigue physics.
- Typed-array result storage.
- Summary statistics.

## Goodman Windows

Reference evidence:

- CDF, Stats, and ANOVA are floating windows.
- Window layout is stored fractionally: x, y, width, height, visible, z.
- Opening a window updates state, display, toolbar button active state, z-order,
  and content.
- Drag and resize persist fractional layout on pointer up.
- CDF and ANOVA render SVG charts. Stats renders a table.
- Window content is sensitive to active simulation, visible state, completed
  results, and scrubber time.

DESIRE mapping:

- Window definitions and visibility/layout belong in authored process state.
- Drag/resize/z-order are generic window capability behavior.
- CDF/Stats/ANOVA content is projection over simulation state and leaf
  statistical/chart helpers.

Do not copy:

- `ensureWindows` as DOM creation authority.
- Pointer handlers as Engentus-local runtime code.

## Goodman Chart And Canvas

Reference evidence:

- The D3 chart builds a fixed group structure for axes, grid, bands, curves,
  probe, annotations, and hover hit area.
- Chart labels, band fills, grid flag, and annotations come from state.
- Static view draws Goodman bands, response curves, slip thresholds, probe
  marker, legend, static info, optional distribution cloud, and user
  annotations.
- Hover computes a probe point and displays a tooltip.
- MC view overlays a canvas on top of the static chart.
- The MC canvas draws trajectory traces, optional monthly trail dots, and
  current position dots.

DESIRE mapping:

- Chart host surfaces and chart edit state are authored.
- Chart evaluation/rendering belongs behind `plugin.chart-runtime` or another
  explicit capability.
- Physics/math stays leaf JS.
- Hover/probe/scrub are reusable chart capability interactions, not generic
  surface host behavior.

Do not copy:

- D3 DOM construction into shell/runtime code.
- Chart-specific assumptions into generic `page.surface`.

## Mill Charge

Reference evidence:

- Mill Charge uses the shared store under `millSim`.
- Parameters persist in `millSim.params`.
- Metrics are recomputed when params change and stored under `millSim.metrics`.
- Metrics are also attached to the canvas for animation.
- Sidebar sliders update state and value labels.
- Preset buttons apply grouped parameter patches.
- The canvas animation is RAF-driven and stops when leaving `#mill`.
- Rendering is pure canvas drawing over current params/metrics and animation
  phase.

DESIRE mapping:

- Parameters, presets, and metrics panel are authored process/projection state.
- Canvas animation is a capability/leaf renderer.
- Physics and frame drawing can remain leaf JS.
- Enter/leave route lifecycle should start/stop capability animation.

## Mill Force

Reference evidence:

- Mill Force currently owns local module state inside `mill_force_main.js`.
- State includes inputs, mode, chart view, selected model(s), MC config/results,
  comparison output, and debounce timer.
- Sidebar is rebuilt imperatively for mode, model selection, sliders, results,
  and MC config.
- Chart tabs show one of cross-section, force-vs-angle, or rose views.
- Input changes are debounced before model recompute and redraw.
- MC run uses RAF to let status paint before blocking calculation.
- Cross-section tooltip maps pointer position into model segment data.

DESIRE mapping:

- This module needs more reauthoring than Goodman because the reference JS
  combines state, view rendering, and controller logic.
- Inputs, modes, model selection, chart tab, MC config, and results should be
  authored process/projection data.
- Model calculations and chart draw functions are leaf/capability candidates.
- Tooltip hit testing is chart capability behavior.

Do not copy:

- `mill_force_main.js` as an app runtime.
- `renderSidebar` or `switchChartView` as route-local controller authority.

## Cross-Cutting Runtime Primitives Exposed By The Oracle

The reference JS provides evidence for these generic primitives:

- route-state equivalence
- delayed action / transition timeline
- pending action state
- process message delivery
- process-owned durable state
- process-owned ephemeral state
- debounced persistence
- subscriber/projection recompute
- conditional visibility
- class/state projection
- repeated collection projection
- input value and checked binding
- pointer drag and resize
- z-order management
- route enter/leave lifecycle
- RAF playback/animation lifecycle
- capability mount/update/destroy
- hover/probe/readout

These primitives must be proved through the canonical authoring pathway and
capability matrix before being claimed as supported.

## Immediate Implications

- The login route change working is insufficient by itself; auth also needs a
  pending state and page-fold timeline.
- WCSS must capture transition and animation style evidence. WAS should capture
  trigger, delay, route change, and visible deltas over time.
- Goodman should be rebuilt from authored state/process/projection using the
  reference state model as evidence, while preserving math/simulation/chart
  logic as leaf/capability boundaries.
- Mill Charge can probably be authored around process params plus a canvas
  capability.
- Mill Force should not be used as the first behavior proof because the
  reference controller is more entangled.
