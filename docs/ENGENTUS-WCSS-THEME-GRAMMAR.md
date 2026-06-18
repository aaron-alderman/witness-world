# Engentus WCSS Theme Grammar

The Engentus theme grammar now has a cleaner split:

- authored WCSS core is the canonical document model
- renderer lowering is derived downstream
- browser CSS remains an output format, not the authored ontology

## Canonical Model

The canonical source remains:

- `examples/engentus/app/engentus-desired-v2.wcss`

That source is read as a pure `WCSSDocument` core built from:

- `theme`
- `tokens`
- `styles`
- `views`
- `application`

This is the document model future authoring tools are expected to edit.

The canonical grammar is concerned with authored consistency only:

- token-domain rules
- style-domain rules
- per-slice family-domain contracts
- typed seam targeting and naming contracts

It is not supposed to carry browser bucket names, selector groups, rollback
lanes, or backend-specific asset composition as first-class authored semantics.

## Lowering Is Derived

Browser lowering still exists because the current runtime serves CSS, but it now
belongs to a generated renderer-side attachment.

The current browser sidecar contains renderer-specific data such as:

- asset partitioning
- group ownership
- selector/declaration evidence
- native-lowering references used by the browser renderer

That lowering sidecar is emitted as:

- `tmp/engentus-wcss/engentus-style-lowering-sidecar.json`

The formalized authored grammar is emitted separately as:

- `tmp/engentus-wcss/engentus-style-grammar.json`

This split is the important architectural correction. The canonical theme/style
grammar is no longer defined in terms of browser lowering nouns.

## Runtime Role

The live runtime still serves generated CSS at:

- `/engentus/__generated/engentus-shell.css`
- `/engentus/__generated/engentus-chart-pages.css`

Those routes are delivered through `plugin.wcss-runtime`. The delivery plugin is
generic; Engentus-specific derivation remains in the Engentus adapter.

## Plugin Direction

The platform now keeps one global plugin store with typed contribution lanes
that can support future WCSS-side extensibility:

- `styles`
- `themes`
- `widgets`
- `renderers`
- `authoringTools`

The intended direction is:

- authoring tools operate on the canonical WCSS document model
- renderers derive sidecars and outputs from that model
- widget/style/theme plugins contribute typed capabilities into the same global
  store

## Practical Meaning

For Engentus, this means:

- the `.wcss` file is still the seed text
- the canonical meaning is the document model, not the browser declarations
- generated CSS is a renderer output, similar in spirit to generated HTML from
  the runtime view model

If later work needs more browser detail, that detail should live in renderer
sidecars or renderer plugins. It should not flow back into the canonical WCSS
document model.
