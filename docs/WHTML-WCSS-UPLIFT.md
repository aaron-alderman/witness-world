# WHTML/WCSS Uplift

`WHTML/WCSS` is an internal import and uplift workspace. It is not a runtime,
not a public MCP authoring noun, and not a second proof lane.

The purpose is to turn reference frontend evidence into inspectable authored
candidate material without asking an LLM to hand-translate a visual app from
memory.

## Position

`WHTML/WCSS` sits between:

- the reference oracle, such as `example-ports/engentus/`
- authored targets, such as widgets and `surface + process + projection`
- the constrained public authoring lane, `plugin.authoring`

It feeds those existing targets. It does not replace them.

## IR Layers

### WHTML

`WHTML` captures observed structure:

- DOM node tree
- attributes
- text
- asset references
- child order
- source provenance

It is evidence, not app semantics by itself.

### WCSS

`WCSS` captures observed presentation evidence:

- stylesheet rules
- selectors
- declarations
- variants where present
- inline styles
- computed styles observed in a browser
- box/layout measurements observed in a browser
- transition and animation timing properties observed in a browser
- source provenance

When uplift starts collapsing faithful flat CSS into a more reusable authored
shape, `WCSS` may also carry an internal nested theme grammar that preserves
family ownership, selector-local variants, responsive overrides, and motion
rules before emission back to flat CSS. See
`docs/ENGENTUS-WCSS-THEME-GRAMMAR.md`.

Inline styles belong to `WCSS`. They are style evidence attached to observed
nodes, not a separate authoring escape hatch.

Computed styles also belong to `WCSS`. They are not authored truth by
themselves; they are observed evidence that correlates selectors, WHTML nodes,
layout boxes, animation names, transition durations, and final rendered values.
This lets parity work distinguish "the authored CSS says X" from "the browser
actually rendered Y".

Active interaction traces are intentionally adjacent but separate. A future
`WAS` layer should witness triggers, timelines, route changes, delayed states,
and DOM/style deltas over time. WCSS can record the style evidence involved in
those traces, but it should not become the behavior trace itself.

For Engentus, the reference JavaScript is also oracle evidence. Its behavior
inventory is tracked in `docs/ENGENTUS-ORACLE-BEHAVIOR-INVENTORY.md`. Reading
that code is allowed for uplift because it reveals delays, transition ordering,
state ownership, and leaf helper boundaries that are not recoverable from a
static DOM snapshot alone. Copying it back as runtime authority remains
forbidden.

Current Engentus WCSS capture is executable as an internal diagnostic:

```powershell
node scripts/engentus-wcss-capture.mjs http://localhost:56693/ login --format=wcss --out C:\tmp\engentus-login.wcss.json
```

The default capture artifact records raw browser evidence. `--format=wcss`
consumes that evidence immediately by correlating it back to imported WHTML and
emitting `WcssComputedStyleSet` entries. This makes the output usable by uplift
tests and parity tooling rather than leaving it as screenshots or ad hoc JSON.

### Symmetry graph

The symmetry graph captures the part a human or AI normally holds in their head
while converting a DOM tree into an authored app:

- which nodes obey the same presentation law
- which nodes intentionally break that law
- which wrappers are presentational only
- which nodes form semantic boundaries
- which many observed nodes correspond to one authored unit

The default move is shared law first, localized break second. The graph should
make that explicit data rather than burying it in comments or node-local tags.

## Guided Collapse

The uplift workspace is collaborative and evidence-preserving. It supports
operations such as:

- group observed nodes into a candidate authored unit
- mark a wrapper as presentational only
- mark a semantic boundary
- define a symmetry group
- define a localized symmetry break
- extract a named reusable unit

This is not automatic HTML-to-app conversion. It is guided uplift into a better
intermediate representation that can be reviewed, collapsed, and emitted.

## Emission

The same uplift snapshot may emit to more than one authored target:

- widget emission for concrete/imported UI representation
- surface emission for the canonical constrained frontend pathway

Neither target is universally declared the winner. The uplift layer preserves
evidence so the project can compare concrete imported output, authored surface
structure, and eventual MCP-only reconstruction without inventing a new runtime.

## Engentus

Engentus is the first oracle because the reference HTML/CSS exists and parity
drift has already caused architectural damage.

The first uplift scope is static shell evidence:

- login shell
- home toolbar/module area
- shared presentation evidence

The output of this work is not executable authority. It is evidence and
candidate authored structure that must still pass through the existing app
serving path, parity checks, and canonical authoring pathway proof.

## Boundaries

`WHTML/WCSS` must not:

- appear as public `whtml.create` or `wcss.create` MCP actions
- become a browser runtime
- become a route handler
- create custom JS fallback authority
- bypass `plugin.authoring` in constrained app-authoring sessions
- claim public `page.surface` support not proved by the pathway probe

If uplift exposes a missing language or runtime primitive, the constrained lane
must stop with a structured blocked handoff rather than smuggling behavior into
the uplift layer.
