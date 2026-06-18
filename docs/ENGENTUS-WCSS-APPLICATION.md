# Engentus WCSS Application

Engentus now serves its canonical V1 WCSS lane by default through runtime-generated
stylesheet routes rather than repo-tracked static CSS assets.

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
- explicit node-scoped runtime override seams
- a separate inline `lowering` section for browser backend mapping
- browser declaration groups where a compatibility lane is still intentionally
  retained

The three internal layers are now:

- canonical style/application grammar in `engentus-desired-v2.wcss`
- inline backend lowering map in the same file
- inline browser declaration source in the same file

Native-lowered slices also rely on compiled presentation anchors for the
specific presentable nodes they address. Those anchors are backend metadata, not
authored WCSS nouns. For `chart-pages`, that inventory now also recovers chart
subparts such as the page body, viewport, host, mount, overlay canvas, and
tooltip from the existing chart view metadata so the proof lane can target them
through identity instead of raw browser selectors.

## Outputs

Running:

```powershell
cmd /c node scripts\build-engentus-wcss.mjs
```

does not write live CSS into the app source tree. The live runtime now serves:

- `/engentus/__generated/engentus-shell.css`
- `/engentus/__generated/engentus-chart-pages.css`

The build script writes proof/debug artifacts outside the app source tree:

- `tmp/engentus-wcss/engentus-shell.css`
- `tmp/engentus-wcss/engentus-chart-pages.css`

- `tmp/engentus-wcss/engentus-style-inventory.json`
- `tmp/engentus-wcss/engentus-style-parity.json`
- `tmp/engentus-wcss/engentus-style-ownership.json`

## Current Limits

- browser group names now belong to the lowering layer, not the authored
  application layer
- the switch manifest still controls rollout, but its slice names are validated
  against canonical V1 plus the browser lowering map
- `shell-base`, `auth`, `home`, `goodman`, `mill-charge`, `mill-force`,
  `platform-config`, and `chart-pages` now have `native-browser` lowering
  definitions, and the checked-in switch manifest serves that lane live by
  default
- the proof lane now has whole-app native coverage; declaration groups remain a
  backend artifact rather than the authored slice contract, and they have
  already been stripped from the validated auth/home/platform-config/chart
  success paths
- injected-asset tests still exercise isolated proof composition, but the
  checked-in runtime now serves the WCSS lane directly from generated routes;
  emergency rollback is a manifest-only change back to `legacy`
- native slices are expected to target identities, traits, variants, tags, and
  pseudos first; raw selector escapes are treated as backend debt and surfaced
  in the proof reports
- native inventory recovery now follows repeat-template descendants for the
  active native slices, so row-action and similar templated nodes can be owned
  semantically without inventing a second authored tree
- layout ownership remains with RVM; V1 WCSS does not invent a second runtime
  structure tree

That is deliberate. The current tranche normalizes the authored style grammar
and makes the application contract explicit while moving CSS delivery onto the
same runtime-generated footing as the HTML.
