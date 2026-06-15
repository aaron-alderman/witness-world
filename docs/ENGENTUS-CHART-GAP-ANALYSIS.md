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

## Known Gaps

- Goodman simulation lifecycle, scrubber playback, CDF/Stats/ANOVA windows, and
  bolt-set editing remain to be authored.
- Goodman sidebar sections still include placeholders where the reference app
  dynamically renders parameter/edit/list content. Those must become authored
  state/process/projection surfaces or explicitly justified leaf helpers.
- Mill Force still needs faithful model selection, compare-view behavior, Monte
  Carlo controls/execution, tooltip/overlay behavior, and full reference result
  projection. The current result rows are an initial chart-output binding proof,
  not final parity.
- No app-local browser runtime, presenter, or controller seam should be added to
  close these gaps. The next work should continue through authored surfaces,
  process state, projections, and explicit capability bindings.
