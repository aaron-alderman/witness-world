# Engentus WCSS Theme Grammar

The Engentus shell and chart CSS now has an internal nested `WCSS` source of
truth at `examples/engentus/app/engentus-theme.wcss.js`.

The checked-in emitted files:

- `examples/engentus/app/engentus-shell.css`
- `examples/engentus/app/engentus-chart-pages.css`

are generated from that nested grammar via:

```powershell
cmd /c node scripts\build-engentus-wcss.mjs
```

## Purpose

This is not a new runtime lane. It is a more faithful intermediate grammar for
describing the reference Engentus theme as grouped presentation law instead of a
single flat selector dump.

The immediate goal is to make three things explicit:

- shared tokens
- stable theme families
- local selector/state breaks inside those families

## Grammar Shape

The nested grammar currently uses four block types:

- `group(name, blocks)` for ownership buckets such as `toolbar` or `mill force`
- `rule(selector, declarations, blocks)` for selectors and nested descendants or
  state variants
- `media(query, blocks)` for responsive overrides
- `keyframes(name, frames)` for motion evidence

Children inside a `rule(...)` behave like nested CSS:

- `&.active` expands against the parent selector
- `img` becomes a descendant selector

## Engentus Families

The first back-port uses these shell families:

- `foundation`
- `toolbar`
- `auth`
- `home`
- `shared views`
- `chart scaffold`
- `floating windows`
- `controls and editor`
- `mill charge`
- `mill force`

The chart-page stylesheet currently uses:

- `chart tokens`
- `chart foundation`
- `chart surfaces`

## Ownership Rule

Theme grammar should describe presentation law first and selector accidents
second.

That means:

- tokens belong near the root theme block
- shared chrome belongs in a named family
- pseudo/select-state variants stay nested under the owning selector
- responsive and motion rules remain explicit, not hidden in comments

If later uplift work needs more detail, extend this grammar instead of dropping
back to ad hoc flat CSS edits.
