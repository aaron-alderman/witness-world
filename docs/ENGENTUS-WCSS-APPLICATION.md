# Engentus WCSS Application

Engentus now has a canonical V1 WCSS lane that runs in parallel with the
current browser asset path.

The important boundary is:

- presentation identity is authored in the model
- traits remain reusable class-like style families
- DOM selector shape stays a lowering detail

## Canonical Source

The canonical internal style source is now:

- `examples/engentus/app/engentus-desired-v2.wcss`

That file carries three kinds of truth in one place:

- normalized visual grammar: tokens, styles, views, and variants
- presentation application structure relevant to styling
- inline backend lowering metadata for current slice ownership and browser-group
  coverage

The active build no longer treats `engentus-identity-first.wcss` as the
authoritative contract.

## Inputs

The current lane uses three active inputs:

- canonical V1 style grammar:
  `examples/engentus/app/engentus-desired-v2.wcss`
- build-time switch manifest:
  `examples/engentus/app/engentus-style-switch.json`

The canonical `.wcss` file now declares:

- slice ownership
- asset targets (`shell` or `chart`)
- presentable identities and traits
- normalized style families
- explicit runtime override seams
- a separate inline `lowering` section for browser backend mapping
- browser declaration groups for the current backend assets

The three internal layers are now:

- canonical style/application grammar in `engentus-desired-v2.wcss`
- inline backend lowering map in the same file
- inline browser declaration source in the same file

## Outputs

Running:

```powershell
cmd /c node scripts\build-engentus-wcss.mjs
```

still writes the live asset files:

- `examples/engentus/app/engentus-shell.css`
- `examples/engentus/app/engentus-chart-pages.css`

and writes offline proof artifacts outside the app source tree:

- `tmp/engentus-wcss/engentus-style-inventory.json`
- `tmp/engentus-wcss/engentus-style-parity.json`
- `tmp/engentus-wcss/engentus-style-ownership.json`

## Current Limits

- browser group names now belong to the lowering layer, not the authored
  application layer
- the switch manifest still controls rollout, but its slice names are validated
  against canonical V1 plus the browser lowering map
- layout ownership remains with RVM; V1 WCSS does not invent a second runtime
  structure tree

That is deliberate. The current tranche normalizes the authored style grammar
and makes the application contract explicit without changing the runtime/public
asset contract.
