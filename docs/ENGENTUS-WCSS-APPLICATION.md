# Engentus WCSS Application

Engentus now treats WCSS as an authored document model first and a browser CSS
delivery pipeline second.

The important boundary is:

- canonical WCSS is authored against presentation identity, traits, families,
  views, slices, and seams
- browser lowering is derived from that authored core
- runtime CSS delivery stays generated, but generated delivery is not part of
  the canonical WCSS contract

## Canonical Source

The canonical internal style source is:

- `examples/engentus/app/engentus-desired-v2.wcss`

That file is parsed into a pure authored `WCSSDocument` core centered on:

- `theme`
- `tokens`
- `styles`
- `views`
- `application`

The canonical core carries the Engentus style grammar and application-facing
style contract:

- normalized visual grammar
- slice ownership
- presentable identities and traits
- typed node-scoped seams
- view-local overrides

It no longer treats browser lowering as first-class authored truth.

## Derived Renderer Data

Browser lowering is now treated as a generated sidecar artifact rather than as
canonical document structure.

The current browser sidecar is derived from:

- canonical WCSS core
- current Engentus presentation inventory and anchor metadata
- current browser renderer logic

The sidecar carries renderer-specific data only:

- backend name
- asset partitioning
- browser group ownership
- selector/declaration evidence
- native-lowering metadata still needed by the browser renderer during the
  transition

This keeps browser buckets, rollback mechanics, and selector evidence out of
the canonical authored contract.

## Inputs

The active Engentus lane uses these authored/runtime inputs:

- canonical WCSS source:
  `examples/engentus/app/engentus-desired-v2.wcss`
- switch manifest:
  `examples/engentus/app/engentus-style-switch.json`

The generated stylesheet URLs remain:

- `/engentus/__generated/engentus-shell.css`
- `/engentus/__generated/engentus-chart-pages.css`

Those routes are served by the standalone `plugin.wcss-runtime` delivery lane.
The runtime delivery seam is generic; Engentus-specific compilation stays in the
Engentus adapter.

## Headless Authoring Baseline

Engentus now also installs a standalone headless authoring lane through
`plugin.wcss-authoring`.

The first authoring surface is still session-scoped and non-persistent, but it
has now moved beyond token-only preview into structured document patches:

- `GET /engentus/__generated/wcss/document`
  - returns the canonical `WCSSDocument` plus a compatibility token catalog
- `GET /engentus/__generated/wcss/schema`
  - returns the editor-facing WCSS schema graph for tokens, styles, slices, and
    read-only views
- `POST /engentus/__generated/wcss/preview-session`
  - creates a preview session id
- `PATCH /engentus/__generated/wcss/preview-session`
  - applies typed document patch ops to that preview session only
- `DELETE /engentus/__generated/wcss/preview-session`
  - clears the preview session

Preview never mutates repo-tracked WCSS. Instead, stylesheet requests may carry:

- `?wcssPreview=<previewSessionId>`

When present, the runtime-generated CSS routes rebuild shell/chart CSS from the
canonical document plus the session document-op overlay for that request only.

Page requests may also carry the same query param. The current page renderers
propagate `wcssPreview` into emitted stylesheet hrefs so browser-session preview
stays explicit and route-local rather than global runner state.

The current typed patch lane supports:

- token ops:
  `token.create`, `token.remove`, `token.set`, `token.reset`
- style ops:
  `style.create`, `style.remove`, `style.field.set`, `style.field.reset`,
  `style.state.create`, `style.state.remove`, `style.state_field.set`,
  `style.state_field.reset`
- slice contract ops:
  `slice.family.assign`, `slice.family.unassign`, `slice.seam.upsert`,
  `slice.seam.remove`

Views and slice topology remain read-only in this tranche.

## Outputs

Running:

```powershell
cmd /c node scripts\build-engentus-wcss.mjs
```

writes proof/debug artifacts under `tmp/engentus-wcss`:

- `engentus-shell.css`
- `engentus-chart-pages.css`
- `engentus-style-grammar.json`
- `engentus-style-lowering-sidecar.json`
- `engentus-style-inventory.json`
- `engentus-style-parity.json`
- `engentus-style-ownership.json`

These outputs split cleanly by role:

- `engentus-style-grammar.json`
  - formalized authored-core grammar
  - token domains
  - style-family domains
  - per-slice family-domain contracts
  - seam-prefix contracts
- `engentus-style-lowering-sidecar.json`
  - renderer-owned lowering attachment
  - browser asset/group mapping
  - backend-specific selector/declaration evidence
- inventory/parity/ownership artifacts
  - proof/debug views over the current Engentus presentation and lowering lane

## Plugin Baseline

The platform still uses one global plugin store.

The plugin contract now has typed contribution lanes for style-side extension:

- `styles`
- `themes`
- `widgets`
- `renderers`
- `authoringTools`

These are contribution categories, not separate plugin stores. The intent is to
let future WCSS authoring and editing resolve through typed plugin
contributions instead of app-local conventions.

## Current Limits

- Engentus still derives its browser lowering sidecar from the same canonical
  `.wcss` text file during the transition
- browser lowering still exists conceptually because the current served output
  is CSS, but it is no longer part of the canonical document model
- layout ownership remains with RVM; WCSS does not become a second structure
  tree in this tranche
- this tranche stops at pure core plus read/serialization and sidecar-derivation
  APIs; it does not implement the visual editor yet

That is deliberate. The immediate target is a clean authored baseline the
future editor can manipulate directly without touching browser buckets,
selector groups, or rollback machinery.
