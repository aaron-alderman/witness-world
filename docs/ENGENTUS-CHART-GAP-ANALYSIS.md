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
- Goodman CDF, Stats, and ANOVA windows now have authored structured empty
  states: CDF declares the no-run chart message, Stats declares the reference
  table header plus "No completed simulations", and ANOVA declares the
  reference statistic block/box-plot shell plus the insufficient-groups state.
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
- Goodman bolt-set cards now include a reference-shaped first-pass authored
  structure: header actions, inline name/colour edit form, collapsed params
  wrapper, and a representative Material & Fatigue parameter group with range,
  free-toggle, and distribution-editor controls. Name/colour are process-owned
  state; UTS and yield are authored scalar states that bind into the Goodman
  chart params. The primary bolt-set expansion is now process-owned authored
  state; generated parameter rows and clone/delete/new behavior remain explicit
  collection/runtime gaps rather than a JS controller workaround.
- Goodman Monte Carlo chart evaluation now consumes authored run sample count:
  `GoodmanRunBoltsPerSet` binds to `GoodmanMCBands.param.n_samples`, so the
  ensemble axis re-evaluates from process-owned run config.
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

## Known Gaps

- Goodman numerical simulation lifecycle, animated scrubber playback,
  CDF/Stats/ANOVA result datasets, dynamic annotation row creation, generated
  bolt-set parameter rows, and clone/delete/new behavior remain to be authored.
  The current Goodman run controls, MC band chart, chart edit panel,
  process-owned primary bolt-set expansion, bolt-set shell, and windows now
  expose authored stateful shell/chart behavior, but they do not yet execute or
  consume full reference Monte Carlo statistical datasets.
- Goodman dynamic repeated collections remain a gap. Current simulation and
  bolt-set rows are explicit authored first-pass rows; full reference parity
  still needs authored collection/repeated-action semantics or a justified
  platform primitive.
- Mill Force still needs Monte Carlo execution/overlay behavior, tooltip
  behavior, and full reference result parity. Compare deltas now exist as
  authored scalar outputs and inline percent readouts, but the compare panel is
  still a first-pass authored analysis view rather than final reference parity.
- No app-local browser runtime, presenter, or controller seam should be added to
  close these gaps. The next work should continue through authored surfaces,
  process state, projections, and explicit capability bindings.
