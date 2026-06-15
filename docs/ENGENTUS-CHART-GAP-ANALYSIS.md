# Engentus Chart Gap Analysis

This document records the current DESIRE-owned chart hookup state for the
Engentus shell. The oracle remains `example-ports/engentus/`; this file does not
grant runtime authority to copied JS or presenter code.

## Hooked Through `chart.render`

- Goodman deterministic chart: `GoodmanDiagram` mounts live in
  `/engentus/goodman` from `examples/engentus/app/views/goodman.rvm`.
- Goodman mode switching now drives authored process state for Static, Monte
  Carlo, and Edit; Static/Edit show `GoodmanDiagram` and Monte Carlo shows
  `GoodmanMCBands` through separate chart mounts.
- Goodman sidebar/window structure has an authored first-pass control loop:
  scenario/probe info, simulation rows, chart-style controls, bolt-set cards,
  fatigue legend rows, scrubber controls, CDF/Stats/ANOVA window visibility, and
  run-status controls are expressed in `shell.rvm` and driven by
  `EngentusShellNavigation` state.
- Goodman chart-style controls now match the reference edit-panel shape more
  closely: Labels, Band Colours, and Annotations are authored as explicit
  RVM child groups. Title, X/Y axis labels, title size, axis size, grid,
  annotation visibility, point size, and the four band colour states reach the
  mounted `chart.render` controller through generic `presentation.*`
  capability props. The chart runtime accepts these as view-presentation
  patches, including nested values such as `bandFills.0`, not
  Goodman-specific logic.
- Goodman static reference controls now exist as authored inputs for applied
  shear, mill speed, probe mean stress, endurance limit, and SN slope; their
  process state binds into `GoodmanDiagram` model params through
  `chart.render`.
- Goodman deterministic chart readout now carries authored tooltip channels for
  mean stress, alternating stress, shear force, and damage per cycle x10^6. The
  values are derived in `BoltFatigue`, preserved by the generic cartesian
  `chart.render` probe path, and displayed without a Goodman-local browser
  controller.
- Goodman Static scenario rows now render deterministic chart capability
  outputs instead of placeholder shell text: probe shear, probe mean stress,
  probe alternating stress, and slip threshold are derived in `BoltFatigue`,
  formatted by app-owned pure helpers, published by `GoodmanDiagram.*`, and
  consumed by authored `shell.rvm` bindings.
- Goodman CDF, Stats, and ANOVA windows now have authored empty states without
  fake result scaffolding: CDF declares the no-run chart message, Stats starts
  with the reference "No completed simulations." paragraph and only reveals the
  first-pass scalar summary table after the authored run-summary state is
  active, and ANOVA stays on the reference insufficient-groups message until
  real failure-time groups exist.
- Goodman floating window chrome now uses the reference titles for CDF,
  Summary Statistics, and ANOVA, keeping the visible copy authored in
  `shell.rvm` rather than supplied by a copied window controller.
- The shared toolbar/profile dropdown now follows the reference class-based
  menu contract: `EngentusProfileMenuVisible` drives the `open` class on
  `#up-menu` through authored state instead of using a hidden-attribute
  shortcut or page-local click script.
- Goodman run-state UI is authored through process state: Run switches to
  Monte Carlo mode, config fields lock while running/paused, Pause/Resume/Stop
  controls patch visibility/disabled state, reference run/pause/stop labels are
  authored in `shell.rvm`, and the progress label/fill/lock note reflect
  `GoodmanRunStatusState` without app-local controller code.
- Goodman sidebar sections now follow the reference mode gates through authored
  `GoodmanActiveMode` bindings: Static shows scenario controls, Monte Carlo
  shows simulations/run config/scrubber, and Edit shows chart-style controls.
- Goodman Static now exposes the reference "Save as Simulation" action as an
  authored process message that moves into Monte Carlo mode. Dynamic simulation
  creation remains part of the repeated-collection gap rather than a JS
  workaround.
- Goodman Monte Carlo simulation list now starts from the reference empty
  collection shape: the authored shell shows "No simulations yet." plus the
  full-width "+ New simulation" action and no longer invents fixed Baseline /
  Maintenance simulation rows. Creating, cloning, selecting, and deleting
  simulations remain part of the authored repeated-collection/runtime gap.
- Goodman bolt-set cards now include a reference-shaped first-pass authored
  structure: header actions, inline name/colour edit form, collapsed params
  wrapper, and a representative Material & Fatigue parameter group with range,
  free-toggle, and distribution-editor controls. Name/colour are process-owned
  state; UTS and yield are authored scalar states that bind into the Goodman
  chart params. The primary bolt-set expansion is now process-owned authored
  state; generated parameter rows and clone/delete/new behavior remain explicit
  collection/runtime gaps rather than a JS controller workaround.
- Goodman default bolt-set identities now follow the reference store:
  the authored shell starts with "No Jemtec" using the red `#dc2626` swatch
  and "Jemtec" using the blue `#8CC4D4` swatch. The second card remains a
  static authored default identity until generated bolt-set parameter rows are
  available through authored collection semantics.
- Goodman Monte Carlo chart evaluation now consumes authored run sample count:
  `GoodmanRunBoltsPerSet` binds to `GoodmanMCBands.param.n_samples`, so the
  ensemble axis re-evaluates from process-owned run config.
- Goodman Monte Carlo now exposes first-pass scalar chart summaries for authored
  windows: `BoltFatigueMC` reduces the mounted MC bands to sample count and
  p10/p50/p90 plus standard-deviation stress summary text outputs,
  `chart.render` publishes them as `GoodmanMCBands.*` capability outputs, and
  the Stats window and the CDF window's explicit stress-band summary table
  consume those outputs through authored surface bindings after the run state
  becomes active.
- Goodman run completion now has an authored first-pass lifecycle instead of
  treating `running` as the permanent result state: `GoodmanRunRequested` moves
  the shell into MC mode, exposes the transient running state through the
  process delay machinery, then lands in a process-owned `done` state. The
  completed state drives the reference-shaped "Complete" progress label, green
  full progress fill, locked config note, and Stats-window result visibility.
- Goodman deterministic chart overlays now cover more of the reference static
  view without controller code: `GoodmanDiagram` authors dashed lifetime
  Goodman guide lines, the purple nominal yield boundary style, the probe point,
  and the primary bolt-set curve label. The generic chart runtime learned
  category-split cartesian line primitives plus styled point/text marks, and
  the RVM chart parser now preserves quoted layer-channel strings with spaces
  such as `"No Jemtec"`.
- Goodman scrubber range now follows authored run duration:
  `GoodmanRunDurationMonths` binds to the time slider `max` attribute through
  the generic form-control binding path, matching the reference relationship
  between run config and timeline controls without app-local controller code.
- Goodman scrubber Play is no longer wired to the run action. It carries the
  reference play label but does not yet implement animated timeline playback,
  avoiding the previous false behavior where Play started a Monte Carlo run.
- Mill Charge chart: `MillChargeCrossSection` mounts live in
  `/engentus/mill-charge`, accepts authored parameter bindings, updates derived
  RHS metrics, and keeps its transient animation phase during parameter changes.
- Mill Force stock charts: `MillForceCross`, `MillForceAngle`, and
  `MillForceRose` mount live in `/engentus/mill-force`; the shell currently
  shows the Cross-section chart as the initial tab state and switches between
  the three chart tabs through authored process state.
- Mill Force now has an authored first-pass control/result loop: Single /
  Compare / Monte Carlo mode state, the main reference input sliders, live chart
  parameter rebinding, and reference-aligned scalar result rows are driven
  through `EngentusShellNavigation` state and `chart.render` outputs.
- Mill Force result readouts are authored in the dataflow model: method-indexed
  fields are collapsed through the active authored model parameter, then exposed
  as scalar chart capability outputs for fill angle, shoulder angle, toe angle,
  omega, charge density, max radial force, and max resultant force.
- Mill Force model/MC shell controls are now authored: grounded/faithful model
  selection, compare-mode explanatory rows, reference-shaped Monte Carlo sample
  count input,
  free-parameter rows with reference sigma labels, reference-aligned run/clear
  labels, Clear disabled state, and run/clear status all live in `shell.rvm`
  and mutate process state through generic bindings.
- Mill Force single-mode model selection now matches the reference control
  shape more closely: the grounded/faithful selector is authored as radio
  labels in `shell.rvm`, not as a DESIRE-local pill abstraction, while still
  driving `MillForceActiveModel` through the existing process messages.
- Mill Force Monte Carlo config now keeps the reference shell shape: the
  `Monte Carlo Config` section is always present with a process-owned
  collapsed/open body and chevron, opens automatically when MC mode or Run is
  selected, and remains implemented through authored state/visibility rather
  than page-local DOM toggling.
- Mill Force Monte Carlo run status now follows an authored lifecycle instead
  of jumping directly to computed output: `MillForceRunMonteCarloRequested`
  sets MC mode/config open, shows a process-owned `calculating`/`Running...`
  state through an authored delay, then transitions to the computed `running`
  state where chart-derived sample/envelope outputs are displayed.
- Mill Force chart model selection now flows through `chart.render` as an
  authored chart parameter: the force, rose, and cross-section chart layers
  slice `method` from `param.active_method`, which is bound to
  `MillForceActiveModel`.
- Mill Force compare mode now reaches the authored chart layer plan for the
  force-vs-angle and force-rose charts: `param.analysis_mode` selects compare
  layers that render grounded and faithful model traces from the existing
  `method` axis.
- Mill Force compare readouts now come from authored dataflow reductions over
  the same `method` axis: fill/toe angle deltas and max radial/resultant force
  deltas are exposed as scalar `chart.render` outputs. Fill/toe percentage
  differences also render inline on the existing Results rows in Compare mode,
  matching the reference table shape more closely.
- Mill Force cross-section now uses authored polar shell geometry rather than
  centre-filled pie slices: `circle` guide layers and `annular-wedge` liner
  bands render the shell, inner radius, single-model liner ring, and compare
  mode grounded/faithful split rings.
- Mill Force cross-section now includes the reference charge-region shading as
  authored chart geometry: `phiPrime` to `phi` and `rInner` to `radius` are
  declared in `views/mill-force.rvm` as `annular-wedge` layers with the
  reference pale-blue fill and process-driven active/compare model selection.
- Mill Force cross-section now authors the reference fill chord plus
  shoulder/toe radial guide-line geometry through dataflow rather than shell
  SVG: two-point guide axes in `models/mill-force.rvm` derive the active
  `phi`/`phiPrime` line coordinates and `views/mill-force.rvm` lowers them as
  polar `line` layers for static and compare modes. The generic polar line
  planner now preserves authored `width`, `dash`, and `opacity`, so the guide
  lines also carry the reference dashed/faded styling without app-local SVG.
- Mill Force cross-section angle labels are now authored chart labels rather
  than shell-local SVG: a generic polar `text` mark in `plugin.chart-runtime`
  consumes `theta`, `r`, and literal/data-backed `label` channels, while
  `views/mill-force.rvm` declares the shoulder `φ`, toe `φ'`, and cardinal
  degree labels from model-owned geometry.
- Mill Force cross-section legend and force colour-scale annotations are now
  authored chart layers rather than shell-local SVG: generic `screen-rect` and
  `screen-text` marks in `plugin.chart-runtime` draw anchored SVG-space
  swatches and labels, while `views/mill-force.rvm` declares the compare-mode
  Grounded/Faithful legend plus the reference `|F|` force scale. The max/min
  kN labels are scalar outputs from `models/mill-force.rvm`.
- Mill Force force bars now use a generic straight-sided polar rectangle mark:
  `polar-quad` is implemented in `plugin.chart-runtime` as a reusable polar
  primitive, while Mill Force declares the reference radial bar geometry in
  `models/mill-force.rvm` and `views/mill-force.rvm`. Single, compare, and MC
  cross-section overlays now draw straight radial bar polygons rather than
  relying on app-local canvas/controller code.
- Mill Force tooltip data is now authored on chart layers: liner number, model
  method, charge mass where relevant, radial/tangential force, and resultant
  force flow through generic `tooltip.*` chart channels. The `chart.render`
  runtime preserves those primitive tooltip values, exposes cartesian and polar
  point-probe hooks, and displays authored tooltip elements for the
  cross-section, force-vs-angle, and force-rose charts without a
  Mill-Force-local controller.
- Mill Force Monte Carlo now has an authored dataflow/chart first pass:
  `MillForce` includes a `sample` ensemble axis, seeded normal sampling for the
  four reference MC controls, segment-wise p10/p90 radial-force reductions, and
  cross-section overlay layers expressed with generic polar chart marks. The
  p90 overlay uses `polar-quad` radial force bands and the p10 overlay uses the
  reusable `polar-point` glyph. The MC sample count/free toggles bind from
  process-owned shell state into `chart.render`, the model publishes a scalar
  computed-sample summary plus p10/p90 radial-force envelope summaries back
  through `MillForceCross.*` capability outputs, and the live route exposes the
  p10/p90 overlay plus computed MC panel summaries without app-local
  chart/controller JS.

## Known Gaps

- Goodman numerical simulation lifecycle, animated scrubber playback, full
  CDF/Stats/ANOVA result datasets, ANOVA statistic/box-plot rendering,
  multi-bolt-set response curves, dynamic annotation row creation,
  generated bolt-set parameter rows, and
  clone/delete/new behavior remain to be authored. The current Goodman run
  controls, MC band chart, chart edit panel, deterministic chart tooltip/static
  scenario readout, process-owned primary bolt-set expansion, bolt-set shell,
  completed-run state, and windows now expose authored stateful shell/chart
  behavior and first-pass MC scalar stress-band summaries, but they do not yet
  execute or consume full reference Monte Carlo failure-time/CDF/statistical
  datasets. Cancellable chunked simulation progress remains a real platform/
  authored-process gap; it should not be faked with page-local JS.
- Goodman dynamic repeated collections remain a gap. Current simulation and
  bolt-set rows do not yet execute full collection creation/clone/delete
  semantics; full reference parity still needs authored collection/repeated-
  action semantics or a justified platform primitive.
- Mill Force still needs full reference Monte Carlo result parity. The p10/p90
  cross-section overlay, p10 point glyph, and straight-sided radial force-bar
  geometry are now authored and live, and the MC panel reports computed sample
  count plus p10/p90 radial-force envelope summaries from chart capability
  output after Run, with an authored calculating-to-computed status transition.
  The richer reference MC result datasets and final compare/MC panel polish
  remain first-pass gaps. Tooltip readout for the three
  stock charts now exists through the generic chart tooltip seam. Compare
  deltas now exist as authored scalar outputs and inline percent readouts, and
  the cross-section chart now carries authored legend/force-scale annotations,
  but the compare panel is still a first-pass authored analysis view rather
  than final reference parity.
- No app-local browser runtime, presenter, or controller seam should be added to
  close these gaps. The next work should continue through authored surfaces,
  process state, projections, and explicit capability bindings.
