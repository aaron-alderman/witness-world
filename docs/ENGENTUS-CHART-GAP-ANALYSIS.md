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
- Goodman chart-style controls now reach the mounted `chart.render` controller
  through generic `presentation.*` capability props for grid visibility,
  annotation visibility, and point size. The chart runtime accepts these as
  view-presentation patches, not Goodman-specific logic.
- Goodman static reference controls now exist as authored inputs for applied
  shear, mill speed, endurance limit, and SN slope; their process state binds
  into `GoodmanDiagram` model params through `chart.render`.
- Mill Charge chart: `MillChargeCrossSection` mounts live in
  `/engentus/mill-charge`, accepts authored parameter bindings, updates derived
  RHS metrics, and keeps its transient animation phase during parameter changes.
- Mill Force stock charts: `MillForceCross`, `MillForceAngle`, and
  `MillForceRose` mount live in `/engentus/mill-force`; the shell currently
  shows the Cross-section chart as the initial tab state and switches between
  the three chart tabs through authored process state.
- Mill Force now has an authored first-pass control/result loop: Single /
  Compare / Monte Carlo mode state, the main reference input sliders, live chart
  parameter rebinding, and initial scalar result rows are driven through
  `EngentusShellNavigation` state and `chart.render` outputs.
- Mill Force model/MC shell controls are now authored: grounded/faithful model
  selection, compare-mode explanatory rows, Monte Carlo sample count,
  free-parameter toggles, and run/clear status all live in `shell.rvm` and
  mutate process state through generic bindings.
- Mill Force chart model selection now flows through `chart.render` as an
  authored chart parameter: the force, rose, and cross-section chart layers
  slice `method` from `param.active_method`, which is bound to
  `MillForceActiveModel`.
- Mill Force compare mode now reaches the authored chart layer plan for the
  force-vs-angle and force-rose charts: `param.analysis_mode` selects compare
  layers that render grounded and faithful model traces from the existing
  `method` axis.
- Mill Force cross-section now uses authored polar shell geometry rather than
  centre-filled pie slices: `circle` guide layers and `annular-wedge` liner
  bands render the shell, inner radius, single-model liner ring, and compare
  mode grounded/faithful split rings.

## Known Gaps

- Goodman simulation lifecycle, animated scrubber playback, CDF/Stats/ANOVA
  result datasets, and bolt-set edit/clone/delete/new behavior remain to be
  authored. The current Goodman windows are lifecycle/content placeholders, not
  statistical parity.
- Goodman dynamic repeated collections remain a gap. Current simulation and
  bolt-set rows are explicit authored first-pass rows; full reference parity
  still needs authored collection/repeated-action semantics or a justified
  platform primitive.
- Mill Force still needs Monte Carlo execution/overlay behavior, tooltip
  behavior, and full reference result projection. The current result rows and
  MC controls are authored shell proofs, not final numerical/visual parity.
- No app-local browser runtime, presenter, or controller seam should be added to
  close these gaps. The next work should continue through authored surfaces,
  process state, projections, and explicit capability bindings.
