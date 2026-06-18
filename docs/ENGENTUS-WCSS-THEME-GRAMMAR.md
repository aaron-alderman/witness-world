# Engentus WCSS Theme Grammar

The Engentus browser CSS now lowers directly from the canonical V1 file:

- `examples/engentus/app/engentus-desired-v2.wcss`

The canonical file carries three internal layers:

- semantic style/application grammar
- inline browser lowering map
- inline browser declaration groups

That separation is intentional.

For `native-browser` slices such as `shell-base`, `auth`, `home`, `goodman`,
`mill-charge`, `mill-force`, `platform-config`, and `chart-pages`, the browser
lowering map now also resolves authored identity references through explicit
presentation anchors in the compiled surface metadata.

## Roles

- `engentus-desired-v2.wcss` is the designer-facing and tooling-facing V1 style
  grammar, inline backend lowering map, and inline browser declaration source
- the live runtime serves generated CSS at:
  - `/engentus/__generated/engentus-shell.css`
  - `/engentus/__generated/engentus-chart-pages.css`
- optional debug snapshots can be written to:
  - `tmp/engentus-wcss/engentus-shell.css`
  - `tmp/engentus-wcss/engentus-chart-pages.css`

## Purpose

The browser declaration grammar is not the canonical style ontology. It is the
lowering layer that lets the current browser runtime serve runtime-generated CSS
while the authored/internal grammar becomes cleaner.

The authored core is now also summarized as a formal grammar artifact under
`tmp/engentus-wcss/engentus-style-grammar.json`, which captures the canonical
token domains, style-family domains, and per-slice application contracts
without browser bucket names mixed in.

Route delivery for those generated stylesheets is app-owned through the
standalone `plugin.wcss-runtime` lane rather than hard-coded into the shared
runtime server.

Browser group names such as `toolbar`, `goodman view`, or `platform config` are
therefore backend-lowering nouns. They are not canonical style-family nouns.

The immediate goal of the lowering declaration grammar is now narrower:

- preserve exact emitted CSS
- keep selector/state groupings explicit for the browser backend
- provide stable backend-group buckets for current proof tooling and rollback
- let native proof slices lower against recovered presentation anchors even when
  the current browser runtime still emits legacy ids/classes underneath

For the validated success paths, that compatibility layer is now thinner:
`auth`, `home`, `platform-config`, and `chart-pages` no longer carry
browser-declaration bodies in the canonical file. The remaining declaration
groups are concentrated around shared substrate and Goodman-heavy rollback.

## Grammar Shape

The inline browser declaration grammar uses four block types:

- `group <name>` for browser lowering buckets such as `toolbar` or
  `platform config`
- `rule <selector>` for selectors and nested descendants
  or state variants
- `media <query>` for responsive overrides
- `keyframes <name>` for motion evidence

Children inside a `rule <selector>` behave like nested CSS:

- `&.active` expands against the parent selector
- `img` becomes a descendant selector

The semantic application layer now declares node-scoped seams. A seam may target
specific identities or traits and may describe:

- enum-like `variant` values
- boolean `toggle` tokens
- numeric `scalar` bounds
- theme `token` substitutions
- explicit `escape` seams where fidelity still requires them

For the current native lane, the intended steady state is stricter:

- `shell-base`, `auth`, `home`, `goodman`, `mill-charge`, `mill-force`,
  `platform-config`, and `chart-pages` should lower through semantic nouns
  first
- raw selector escapes remain available, but they are reported as debt rather
  than treated as normal authored shape
- repeat-template descendants that belong to a native slice should be recovered
  into the presentation inventory instead of forcing structural shadow models
- chart-page subparts such as host, mount, overlay canvas, and tooltip are now
  recovered into the presentation inventory from chart-view metadata instead of
  being treated as authored browser nouns

## Ownership Rule

The authored WCSS grammar should describe presentation law first and selector
accidents second. The lowering declaration grammar should preserve browser fidelity while
remaining clearly downstream of that authored contract.

At this point the default served lane is whole-app native WCSS. Browser
declaration groups remain as backend-lowering buckets and rollback support, not
the authored slice contract.

If later uplift work needs more browser detail, extend the lowering declaration
layer as a backend artifact. Do not treat it as the primary style guide.
