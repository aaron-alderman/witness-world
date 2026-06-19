# Group E - Learning and Interaction

`/goal` Teach and deepen the real system in place through truthful guidance, witnessed interaction, and reusable presentation vocabulary, while refusing fake tutorial simplifications, opaque curation, or one-off UX cheats.

This group combines tranche 7 and tranche 8:

- Sourcery and guided composition
- canvas follow-on
- layout and rendering follow-on
- guidance, curation, and concept reveal

## Mission

Teach and reveal the real platform in context while continuing to deepen live world interaction.

## End-State

Group E is done when:

- guidance is contextual, optional, and truthful
- concepts are revealed where they become relevant
- ambient suggestions are explainable
- canvas history and selective undo scale to shared, long-lived worlds
- layout and rendering vocabulary are richer without demo-specific cheats

## Non-Goals

- a fake simplified learning product
- opaque ranking or curation that hides the real system
- richer visuals built on unowned one-off widget hacks

## Guardrails For New Contributors

This group is vulnerable to "experience polish" cheating.
The risk is building a slick teaching or interaction layer that stops matching the underlying system.

Typical failure modes:

- guidance that triggers hidden mutations
- tutorial language that simplifies by lying
- suggestions driven by opaque heuristics with no explanation
- richer canvas or layout behavior built from ad hoc UI exceptions

### Hard Rules

- guidance must point at real controls, real mutations, or real handoffs
- concept explanations should name the real platform noun, not an easier fake term
- suggestion ranking inputs should be inspectable
- canvas history and undo must preserve witness truth even when UX pressure says to fake it
- new layout or rendering power should emerge as reusable vocabulary, not one-off polished widgets

### Anti-Cheat Tests

Do not accept a slice as done if it only works because:

- a tutorial step does hidden setup the user cannot inspect later
- a suggestion cannot explain why it appeared
- a canvas action bypassed witness or authority rules to feel smoother
- a layout improvement exists only as a bespoke component with no reusable primitive behind it
- learning surfaces describe the system as simpler than it really is instead of progressively revealing the truth

## Workstreams

### E1. Scope-Aware Sourcery

Move from page-aware guidance to world, section, widget, and context-aware guidance.

### E2. Concept Graph and Reveal

Teach concepts as reusable platform ideas, not only tutorial-local labels.

### E3. Ambient Suggestions and Curation

Give honest next steps and explain why they surfaced.

### E4. Canvas History, Undo, and Shared Interaction

Deepen witnessed interaction semantics for longer-lived collaborative worlds.

### E5. Layout and Rendering Vocabulary

Expand the compositional presentation layer without reintroducing cheats.

## Ordered Execution Ladder

### Stage E0. Keep Guidance Truthful

Objective:
Do not let learning surfaces drift away from the real product.

Slices:

- audit every guidance action so it points to a real control, handoff, or authored mutation path
- mark tutorial-only assumptions explicitly
- expose disable or re-enable state consistently

Acceptance:

- guidance never performs hidden magic the product cannot explain

### Stage E1. Scope-Aware Sourcery

Objective:
Guidance understands more than whole pages.

Slices:

#### E1.1 Scope model

Implementation:

- define guidance scopes: world, context, page, section, widget, flow
- project enabled or disabled guidance state by scope

Acceptance:

- guidance can be enabled or disabled at more than page level

#### E1.2 Contextual continuation

Implementation:

- decide how a user resumes from current object or current task
- support continuation from widget, section, and world contexts

Acceptance:

- "continue from here" means something more precise than "go back to the tutorial page"

#### E1.3 Scope inventory surfaces

Implementation:

- add one place that shows where guidance is active, muted, or completed

Acceptance:

- a user can explain the current guidance state across the world

### Stage E2. Concept Graph

Objective:
Concept teaching becomes reusable across surfaces and worlds.

Slices:

#### E2.1 Extract tutorial-local concepts into shared concept objects

Implementation:

- define authored concept entities or a comparable shared representation
- map existing tutorial concepts onto them

Acceptance:

- concepts stop being trapped inside one tutorial sequence

#### E2.2 Multi-trigger reveal rules

Implementation:

- allow concept reveal from authored state, runtime state, capability presence, or interaction milestones

Acceptance:

- concept reveal is not tied only to step order

#### E2.3 Surface-local concept explanation

Implementation:

- when a concept is shown, tie it to the visible structure in front of the user

Acceptance:

- explanation feels anchored to the current system, not abstract teaching copy

### Stage E3. Ambient Suggestions

Objective:
Suggestions become broader without becoming opaque.

Slices:

#### E3.1 Suggestion input model

Implementation:

- define the visible state inputs suggestions may use
- keep the model inspectable

Acceptance:

- a suggestion can always explain why it appeared

#### E3.2 Cross-surface curation

Implementation:

- expand beyond bootstrap-first suggestions
- add world, canvas, and editor-aware next actions

Acceptance:

- suggestions can follow the user without inventing a hidden assistant control plane

#### E3.3 Ranking and filtering policy

Implementation:

- add explicit filters for beginner, advanced, internal, disabled, and already-completed suggestions

Acceptance:

- surfacing logic is understandable and overridable

### Stage E4. Canvas History and Interaction Depth

Objective:
Shared interaction scales without losing witness truth.

Slices:

#### E4.1 Selective undo

Implementation:

- define compensation semantics that preserve later winning claims where possible
- expose blocked or unsafe undo reasons

Acceptance:

- selective undo exists as a truthful product feature

#### E4.2 History scaling

Implementation:

- improve timeline virtualization and prefix projection
- keep long histories interactive

Acceptance:

- large logs remain usable

#### E4.3 World-graph and manual layout interplay

Implementation:

- let users move between auto and manual layout intentionally
- expose what is derived versus manually positioned

Acceptance:

- layout decisions are visible and reversible

### Stage E5. Layout and Rendering Vocabulary

Objective:
Add stronger compositional presentation primitives.

Slices:

#### E5.1 Base layout vocabulary

Implementation:

- identify the most repeated layout hacks in current surfaces
- replace them with explicit reusable primitives

Acceptance:

- fewer one-off composite cheats remain

#### E5.2 Styling and rendering primitives

Implementation:

- grow the widget and style vocabulary where repeated needs already exist
- keep primitives generic and inspectable

Acceptance:

- richer surfaces can be authored without hidden special cases

## Detailed Task Backlog

### Immediate tranche of concrete work

1. Audit guidance actions for hidden behavior.
2. Define the guidance scope model.
3. Create a shared concept representation and migrate current tutorial concepts onto it.
4. Define suggestion input fields and explanation output shape.
5. Design selective undo semantics for shared canvas history.
6. Inventory repeated layout hacks and promote the first reusable primitives.

### "Trivialized" implementation breakdown for the first three slices

#### Guidance truth audit

- enumerate guidance actions
- map each to a real route, control, or mutation path
- flag any action that does more than it claims
- add a regression test for the audited list

#### Guidance scope model

- add scope enum
- add enabled or disabled state projection by scope
- add one read surface showing current scope states

#### Shared concept representation

- define concept schema
- migrate existing tutorial concept metadata
- add one renderer that can consume either tutorial step or shared concept source

## Acceptance Gates

- learning surfaces remain explainable and optional
- interaction depth is backed by witness truth
- new layout or rendering power arrives as reusable vocabulary
- ambient help never becomes a hidden authority layer
- a newcomer trying to "polish the UX" would be forced back through real nouns, witness truth, and reusable primitives

## Primary Source Map

- [ROADMAP.md](../ROADMAP.md)
- [docs/CAPABILITIES.md](../CAPABILITIES.md)
- [docs/ROADMAP-TRANCHES.md](../ROADMAP-TRANCHES.md)
