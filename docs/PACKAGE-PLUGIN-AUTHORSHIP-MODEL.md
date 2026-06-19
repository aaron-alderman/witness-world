# Package and Plugin Authorship Model

Status: draft design for Group A A4.

## Why This Exists

The runtime already has a local plugin package contract:

- discovery happens from `plugins/<plugin-id>/plugin.json`
- package validation and review are real
- `runtimePlugin.install` and `runtimePlugin.remove` are real witnessed mutations
- proposal fallback exists for runtime-plugin, MCP, capability, program, and generic authoring writes

What does not exist yet is a first-class authored model for the reusable unit itself.

Today a plugin package is still primarily a filesystem-manifest object. That is good enough for discovery and activation, but it is not good enough for:

- contextual naming
- concurrent revisions
- explicit merge pressure
- MCP-mediated authorship
- inspectable package revision history

This document defines the authored model that should own those concerns.

## Decision Summary

1. The primary authored reusable unit is `package`.
2. `plugin` remains an executable runtime-facing flavor and compatibility export, not the only authorship truth.
3. Package authorship is object-first and patch-first:
   - author `package`, `packageRevision`, `packagePatch`, `packageNamespace`, and `packageDependency`
   - emit a canonical `wtoml` bundle from those objects
4. Contextual namespace rules remain the normal naming boundary.
5. Concurrent revisions may coexist. The model must not pretend destructive overwrite is a merge strategy.

## Current Compatibility Truth

The model must fit the system that already exists:

- `plugin.json` is the current local package manifest contract.
- Runtime plugin execution currently comes from:
  - activated internal bundles
  - plugin runtime entrypoints where the manifest/runtime contract allows it
- `runtimePlugin.install` selects package intent on a `serverRunner`; it does not author the package contents.
- Runtime composition, diagnostics, and review already distinguish:
  - profile-selected plugins
  - authored plugin installs
  - operator overlays
  - rejected or incompatible packages

That current filesystem package lane stays as a compatibility import/export seam until runtime-native package loading exists.

## First-Class Authored Nouns

### `package`

`package` is the durable identity for a reusable unit.

It owns:

- stable package id
- display name and description
- package kind such as `plugin`, `library`, or `meta`
- stewardship and authorship lineage
- default namespace intent
- declared exported concepts

`package` is not a directory path and not a raw manifest file.

### `packageRevision`

`packageRevision` is an immutable authored revision of one `package`.

It owns:

- package id
- revision id
- predecessor or superseded revision links
- semantic version label if one exists
- compatibility claims
- emitted bundle hash
- runtime-facing manifest summary
- publish state such as `draft`, `review`, `published`, `replaced`, or `rejected`

The important rule is immutability: changing a revision produces another revision.

### `packagePatch`

`packagePatch` is the explicit authored delta unit inside a revision.

It owns:

- patch id
- package revision id
- target path or target authored object
- source language such as `wtoml`, `json`, `rvm`, `wcss`, or `js`
- operation such as `add`, `replace`, or `remove`
- previous hash when applicable
- next-content hash

`packagePatch` is where concurrent or conflicting edits become inspectable instead of being flattened into "latest wins".

### `packageNamespace`

`packageNamespace` is the naming lane for reusable packages inside context-sensitive composition.

It owns:

- namespace id
- context or import/export scope
- local alias
- bound package or revision line
- visibility rules

This is the guardrail against a global-id registry shortcut. A package can have a stable id without every use site resolving through one global name soup.

### `packageDependency`

`packageDependency` is the explicit dependency edge from one package revision to another required unit or capability contract.

It owns:

- source package revision
- target package, package revision range, or capability contract
- compatibility assumptions
- runtime profile assumptions
- migration or replacement notes

Dependency reasoning must remain explicit during install, publish, and replacement review.

## Package Versus Plugin

The authored noun is `package`.

`plugin` remains useful, but in a narrower role:

- as a current runtime manifest flavor
- as a compatibility export format
- as a runtime execution category
- as a review/install term in existing runtime-plugin surfaces

That means:

- not every package must be a plugin
- a plugin is one executable package flavor
- meta packages stay first-class packages instead of hidden registries

## Canonical Bundle Format

The emitted bundle for a `packageRevision` is canonical `wtoml`.

Recommended bundle shape:

```text
package.wtoml
revision.wtoml
patches/
  0001-<slug>.wtoml
  0002-<slug>.wtoml
materialized/
  plugins/<plugin-id>/plugin.json
  plugins/<plugin-id>/runtime.js
  ...
```

Rules:

1. `package.wtoml` carries stable package metadata.
2. `revision.wtoml` carries immutable revision metadata.
3. `patches/` is the authoritative authored delta list.
4. `materialized/` is optional compatibility output for current runtime/plugin loading and review tooling.

The authoritative truth is the package metadata plus ordered patch list, not the derived filesystem tree.

## Deterministic Serialization Rules

Two authored revisions that mean the same thing must serialize identically.

Minimum rules:

1. Top-level bundle documents appear in fixed order:
   - `package.wtoml`
   - `revision.wtoml`
   - ordered `patches/*`
   - optional `materialized/*`
2. Within each WTOML document, identity fields come first:
   - `id`
   - `package`
   - `revision`
   - `kind`
   - `version`
   - remaining keys in lexical order
3. Arrays of authored rows sort by stable identity, not write time.
4. Patch documents sort by:
   - explicit `ordinal`
   - normalized target path
   - operation
   - content hash
5. Paths use forward slashes.
6. Text is UTF-8 with LF line endings.
7. `packagePatch` ids are content-addressed by normalized patch body hash.
8. `packageRevision` keeps both:
   - a witnessed revision id for references and review
   - a canonical emitted bundle hash for equality, replay, and diff

This hybrid identity is deliberate. Revision references need stable witnessed ids, while emitted equality needs content addressing.

## Authority and Proposal Contract

The authored nouns above are ordinary governed mutations.

They must use the same shared authority rules already being established elsewhere:

- direct writes when the actor has target authority
- proposal fallback when the actor is authenticated but lacks write authority
- the same execution helpers for approved proposals and direct writes

The package lifecycle should therefore grow route/process pairs such as:

- `package.define`
- `packageRevision.publish`
- `packagePatch.attach`
- `packageNamespace.bind`
- `packageDependency.define`

Filesystem writes under `plugins/` are not the primary authorship act. They are an apply or export consequence of an approved authored revision.

## MCP-Mediated Authorship

MCP is the explicit authorship seam for reusable packages.

The first tool family should be:

- `package.create`
- `package.patch.emit`
- `package.revision.preview`
- `package.revision.publish`

Those MCP tools must:

- create or mutate authored package nouns, not write arbitrary plugin folders directly
- return inspectable proposal or revision objects
- emit canonical bundle artifacts that can be replayed
- reuse the same authority and proposal path as product surfaces

Preview apply should target the same change-set or candidate-snapshot discipline used elsewhere, rather than bypassing world or runtime governance.

## Runtime Bridge

The bridge from current runtime plugins to authored packages should be explicit:

1. Import existing `plugin.json` packages into `package` plus initial `packageRevision`.
2. Keep `plugins/<plugin-id>/plugin.json` discovery as a compatibility input.
3. Emit compatibility `materialized/plugins/<plugin-id>/...` trees from authored revisions for the current loader.
4. Keep `runtimePlugin.install` as runner-scoped selection intent until runtime-native package selection exists.
5. Later, let runtime install/select flows target package revision lines directly instead of raw plugin ids.

Important boundary:

- package authorship defines what exists
- runtime-plugin install defines what a runner selects

Those are related, but they are not the same mutation.

## Namespace and Convergence Rules

This model explicitly rejects fake merge simplicity.

Rules:

1. Conflicting revisions may coexist under different revision ids.
2. Contexts may bind different package namespaces or aliases to different revision lines.
3. Runtime selection may choose side A or side B explicitly.
4. Convergence happens later through an explicit transformer or authored follow-up revision.
5. If two revisions would emit the same compatibility plugin identity, export must block until:
   - one supersedes the other explicitly, or
   - a namespace split makes the coexistence truthful

This keeps collision pressure visible instead of hiding it in overwrite behavior.

## What This Model Prevents

This design is specifically trying to block the following shortcuts:

- treating package authorship as "just edit `plugin.json`"
- hiding executable meaning in undeclared JS entrypoint conventions
- using one global id registry instead of contextual namespace rules
- making MCP a stronger mutation lane than the human proposal path
- pretending concurrent revisions are already merged because one export happened last

## Immediate Follow-On Work

The next concrete slices after this design are:

1. Add first-class world nouns and projectors for `package`, `packageRevision`, `packagePatch`, `packageNamespace`, and `packageDependency`.
2. Add deterministic canonical-bundle serialization tests.
3. Add package authoring proposal targets and execution helpers.
4. Add MCP package authoring tools on the shared authority lane.
5. Add compatibility import/export between authored package revisions and current `plugin.json` packages.

## Out Of Scope For This Document

This document does not decide:

- remote package download or store protocol
- trust enforcement policy beyond current metadata/trust reporting
- final runtime-native loading of package bundles without compatibility export
- full transformer semantics for late convergence

Those belong to later Group D and Group A5 work.
