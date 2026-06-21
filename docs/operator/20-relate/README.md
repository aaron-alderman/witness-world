# Relate

## Canonical mapping rule

Every current operator/workbench concept must land in exactly one layer:

- canonical ontology
- session sidecar
- deferred presentation layout
- deferred presentation appearance
- legacy adapter only

## Scope

How authored objects connect.

This area answers:

- how generic relationships are expressed
- how scoped naming and visibility are expressed
- how install, serve, and authority edges are expressed
- how authors reason about what is visible, local, imported, hidden, or attached

## Relationship families

The current model already uses several different relationship families.

### Generic relation

The generic edge object is:

- `relation`

Used for:

- arbitrary explicit edges
- graph-like authored linkage

### Scoped naming relation

Scoped name and visibility relations are:

- `contextBinding`
- `contextExport`
- `contextImport`

Used for:

- local naming
- exported naming
- imported naming
- explicit visibility

### Authority relation

Authority and identity relations include:

- `stewardship`
- `identityRoleGrant`
- `identityRoleRevoke`

Used for:

- delegated mutation authority
- role assignment
- role removal

### Attachment and install relation

Attachment/install relations include:

- `capabilityInstall`
- `capabilityRemove`
- `runtimePluginInstall`
- `runtimePluginRemove`
- `mcpToolInstall`
- `serve`
- `attachWidget`

Used for:

- mounting or attaching one object onto another
- installing/removing affordances
- exposing tools
- binding routes to environments

## Visibility model

The current context visibility code already distinguishes:

- local
- same-context
- import
- unscoped
- hidden

And name resolution distinguishes:

- local resolution
- imported resolution
- ambiguous resolution
- missing resolution

## Why this matters

The model does not treat "relationship" as one flat category.

That is correct.

Different edge families have different consequences for:

- visibility
- authority
- execution
- serving
- installation
- naming

## Current adapter split

Current workbench forms are not canonical truth:

- `operator_theme`
- `operator_dataset`
- `operator_screen`
- `operator_screen_section`
- `operator_overlay`
- `operator_handle`
- `operator_surface`
- `operator_viewport`
- `operator_setup`

The browser prototype grammar is also not canonical truth:

- `theme`
- `surface`
- `viewport`

Those grammars are useful because they prove current rendering and interaction seams, but they remain adapters over the deeper ontology.

## Migration rule

When a concept is presentation-shaped, do not push it down into ontology just because the current workbench needs it.

Examples:

- pane roots are not ontology roots
- left/right/top/bottom are not semantic categories
- split weights are not semantic relationships
- themes are not semantic types
