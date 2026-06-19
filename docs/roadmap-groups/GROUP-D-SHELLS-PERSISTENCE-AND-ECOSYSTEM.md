# Group D - Shells, Persistence, and Ecosystem

`/goal` Make runtime composition, world ownership, automation, and ecosystem trust explicit and operable from product surfaces, while blocking shell magic, plugin-folder folklore, and invisible persistence or recovery behavior.

This group is tranche 6:

- runtime profiles and bundle composition
- runtime plugins and package discovery
- MCP product surface
- desktop shell
- persistence, backup, import, export, restore
- provenance, trust, compatibility, and future store behavior

## Mission

Turn the platform into something that is locally ownable, remotely operable, and explicitly extensible without hiding composition or trust decisions.

## End-State

Group D is done when:

- runtime composition is explicit from startup through product surfaces
- profile-gated absence is explained in-product
- runtime-plugin intent, reconcile, repair, and update flows are productized
- persistence and whole-world lifecycle operations are durable and understandable
- MCP is a real automation and authoring product surface
- ecosystem trust and provenance rules exist beyond local metadata

## Non-Goals

- a package downloader with no composition explanation
- hidden remote execution powers
- desktop-specific product forks

## Guardrails For New Contributors

This group is where people often rationalize hidden complexity as "ops" or "tooling" and stop applying the platform's own rules.

Typical failure modes:

- treating runtime composition as a startup script concern only
- letting local plugins behave like magic folders with no authored explanation
- adding shell powers that are not represented as explicit boundaries
- making persistence or recovery flows real operationally but invisible product-wise
- expanding MCP into ambient power because it is convenient

### Hard Rules

- if runtime composition changes behavior, that change must be inspectable from product surfaces
- if a shell has a power, the shell boundary must remain explicit
- if a plugin install is broken, the repair path should be a productized flow, not just a startup warning
- if persistence semantics differ between canonical truth and derived runtime payloads, say so directly
- if trust or provenance is only metadata today, do not imply enforcement already exists

### Anti-Cheat Tests

Do not accept a slice as done if it only works because:

- the CLI explains composition but the product does not
- a plugin install can fail with no reconcile or repair story
- a desktop-only feature leaked into generic runtime assumptions
- a restore or recovery flow replaced data without exposing what truth changed
- MCP gained capabilities that do not map to explicit authored or operator-visible concepts

## Workstreams

### D1. Runtime Composition Explanation

Make profiles, bundles, plugins, and missing surfaces understandable.

### D2. Runtime-Plugin Lifecycle

Take local plugin discovery and install intent to a maintainable lifecycle.

### D3. Persistence and World Ownership

Deepen `WORLD_HOME`, artifact lifecycle, and repair semantics.

### D4. MCP As Product Surface

Expand MCP from "first honest slice" to a deliberate operating boundary.

### D5. Trust, Provenance, and Store Protocol

Build the real ecosystem contract after the local package model is coherent.

## Ordered Execution Ladder

### Stage D0. Runtime Composition Truth Everywhere

Objective:
The user should not experience profile or bundle differences as unexplained absence.

Slices:

#### D0.1 Product-facing explanation of profile-gated absence

Implementation:

- add "why unavailable" states in bootstrap and relevant product surfaces
- explain missing routes, missing authoring affordances, and inactive capabilities in terms of profile and plugins

Acceptance:

- profile-gated absence no longer reads as arbitrary 404 or silent omission

#### D0.2 One composition summary shape

Implementation:

- unify CLI, diagnostics, review panels, and read models around one composition summary structure
- include profile, active bundles, authored plugin intent, operator overlay, and rejected items

Acceptance:

- every composition surface tells the same story

### Stage D1. Runtime-Plugin Lifecycle

Objective:
Plugin intent becomes operable, repairable, and updateable.

Slices:

#### D1.1 Reconcile and repair

Implementation:

- detect missing, invalid, incompatible, dependency-broken, and obsolete local packages
- add reconcile recommendations and cleanup actions
- first shipped slice: runner-scoped `runtimePlugin.reconcile` with review-derived repair actions, bootstrap operator controls, direct authority success, and proposal fallback through the shared server-runner path

Acceptance:

- broken installs become explicit product work, not startup archaeology

#### D1.2 Update and replace flow

Implementation:

- define how a package revision supersedes another
- preserve authored intent and operator override boundaries
- surface dependency changes before apply

Acceptance:

- plugin updates are explicit witnessed operations

#### D1.3 Bridge to authored package model

Implementation:

- align runtime-plugin lifecycle with whatever Group A chooses for package or patch authorship
- use [docs/PACKAGE-PLUGIN-AUTHORSHIP-MODEL.md](../PACKAGE-PLUGIN-AUTHORSHIP-MODEL.md) as the current bridge target
- keep manifest-only local packages as compatibility if needed

Acceptance:

- local package discovery is no longer the only serious authorship story

### Stage D2. Persistence and World Ownership

Objective:
World durability and repair become ordinary operations.

Slices:

#### D2.1 Whole-world artifact ergonomics

Implementation:

- improve backup, export, import, and restore explanation
- surface artifact lineage, age, and compatibility

Acceptance:

- operators can choose artifacts without reading raw directories

#### D2.2 Recovery and repair semantics

Implementation:

- define reset, repair-rebuild, identity recovery, and bootstrap recovery flows
- keep canonical truth and derived runtime payload replacement distinct

Acceptance:

- recovery actions have named contracts and limits

#### D2.3 Desktop shell deepening

Implementation:

- add the highest-value native integrations after ownership basics
- keep them shell-local and explicit

Acceptance:

- desktop broadens without becoming a different product

### Stage D3. MCP Product Maturity

Objective:
MCP becomes a deliberate automation and authorship boundary.

Slices:

#### D3.1 Richer MCP review and operations surfaces

Implementation:

- show server identity, acting mode, transport, tool scope, runtime attachment, and risk explanation
- add repair guidance for broken MCP server definitions and tool installs

Acceptance:

- MCP inventory feels operable, not just enumerable

#### D3.2 MCP authorship expansion

Implementation:

- if package or patch authorship is adopted, expose creation and patch emission through MCP tools
- ensure every MCP write path lowers to the same witnessed mutations as direct product writes

Acceptance:

- MCP can author real platform structures without inventing a side channel

#### D3.3 Remote-session and broader protocol decisions

Implementation:

- decide whether prompts, resources, completions, and richer auth metadata belong in the next wave
- keep the local-first operator seam intact while expanding

Acceptance:

- protocol expansion follows product boundaries instead of chasing feature parity blindly

### Stage D4. Trust and Store Protocol

Objective:
Move from local metadata to a real ecosystem contract.

Slices:

#### D4.1 Provenance and trust states

Implementation:

- define trust classes
- define source provenance fields
- define what is enforced versus only reported

Acceptance:

- product surfaces can explain why a package is trusted, unknown, blocked, or degraded

#### D4.2 Remote catalog and update channel

Implementation:

- design the first remote distribution protocol
- keep local install and review semantics aligned
- require explicit compatibility and trust reporting

Acceptance:

- remote distribution does not bypass review and composition explanation

#### D4.3 Namespaced concurrent ecosystem revisions

Implementation:

- if patch-first package authorship is adopted, support coexistence of divergent revisions under distinct ids or namespaces
- let runtime selection choose versions while reconciliation proceeds

Acceptance:

- ecosystem merge pressure does not force premature destructive choices

## Detailed Task Backlog

### Immediate tranche of concrete work

1. Add in-product profile-gated absence explanations.
2. Unify runtime composition summaries across CLI, diagnostics, and review panels.
3. Add runtime-plugin reconcile and repair actions.
4. Add artifact lineage and compatibility display for world backups and exports.
5. Deepen MCP review panels with transport, scope, and acting-mode explanation.
6. Write the first trust-state and provenance contract.
7. Design the bridge from current local package manifests to authored package or patch revisions.

### "Trivialized" implementation breakdown for the first three slices

#### Profile-gated absence explanation

- detect missing surface reason
- map it to inactive profile, missing plugin, or missing capability
- render one explanation component reused across product surfaces

#### Composition summary unification

- define one shared summary schema
- update CLI emitter
- update diagnostics route
- update review panels
- add snapshot tests for consistency

#### Plugin reconcile action

- detect broken package state
- classify fixable actions: remove, reinstall, disable, satisfy dependency
- emit witnessed repair intent
- reflect outcome in review surfaces

## Acceptance Gates

- runtime composition becomes more understandable after each slice
- persistence operations gain explanation and repair, not only more buttons
- MCP remains a scoped boundary
- trust and provenance are explicit before remote ecosystem expansion
- new contributors cannot quietly treat shells, plugins, or ops flows as exempt from the model's honesty rules

## Primary Source Map

- [docs/SHELLS-PERSISTENCE-ECOSYSTEM.md](../SHELLS-PERSISTENCE-ECOSYSTEM.md)
- [ROADMAP.md](../ROADMAP.md)
- [BASELINE.md](../BASELINE.md)
- [docs/ROADMAP-TRANCHES.md](../ROADMAP-TRANCHES.md)
