# Product Experience Notes

This document captures the broader product direction around Sourcery, contextual plugins, editable-everywhere pages, and multi-shell ownership.

It is intentionally wider than the straight-line Todo/bootstrap milestone work. The Todo app remains a useful proof, but it is not the destination.

---

## Core Thesis

The product is a witness-oriented operating environment.

That means:

- the world model is the truth
- apps, editors, plugins, and inspectors are all expressions over that same world
- Sourcery is the truthful companion layer over the system
- the user is always in charge of their journey

The platform should feel like an old "real program" in the best sense:

- something you own locally
- something you can host remotely
- something you can inspect all the way down
- something that is batteries-included but never dishonest about how it works

---

## Product Laws

### 1. Truth Before Convenience

Nothing important should happen off-book.

- plugins must be represented in the model
- page structure must be represented in the model
- routes, identities, permissions, and runtime wiring must be represented in the model
- Sourcery may curate, collapse, and explain, but it must not invent a fake simpler world

### 2. The User Owns the Journey

Sourcery guides. It does not steer.

- it can suggest
- it can explain
- it can prefill
- it can highlight
- it can step back
- it can be disabled in context
- it can always be called back

### 3. Every Surface Is Potentially Editable

Pages should not be dead projections.

The intended direction is:

- every page is inspectable
- every page is editable
- widgets can be hidden, replaced, or upgraded in place
- plugin installation and configuration can happen from where the need is discovered

### 4. Plugins Are Glass Atoms

The user should not be forced to think in low-level runtime wiring when their real intent is "I want sessions" or "I want charts".

But the answer must not be a black box.

A plugin should expose:

- what it is
- its public API
- its configuration surface
- its internals
- its context/scope
- its permissions/authority requirements

Installed capabilities stay visible as capabilities. They do not disappear into hidden expansion.

### 5. Context Contains Meaning

The system should not collapse into one global namespace.

Contexts are how the user understands what belongs together and what has authority to act together.

Contexts should eventually carry:

- names
- local composition
- authority/stewardship
- visible boundaries
- import/export edges
- perspective-specific interpretation

### 6. One World, Many Expression Modes

Code, builders, canvas, inspectors, and assistants are not separate truths.

They are different ways of operating the same world.

The user should be able to:

- stay in guided mode
- switch to visual editing
- switch to direct code/source editing
- inspect witnesses and processes
- move back and forth without losing coherence

### 7. Shells Are Adapters, Not Alternate Products

Desktop, browser, and hosted/server shells should all sit over the same core model.

The desktop shell proves ownership.
The web shell proves reachability.
The shared model proves coherence.

---

## The Story From Top To Tail

### Act 1: Arrival

The user lands in an empty world.

Sourcery is present but not overwhelming.
It asks who the user is.
The user creates the first identity and claims the world.

This is the moment the environment becomes owned rather than anonymous.

### Act 2: Orientation

Sourcery reveals the environment, not a fake onboarding overlay over an unrelated product.

The user sees real gadgets and surfaces:

- recent witnesses
- installed capabilities
- open canvas
- open code
- inspect world
- process view

Sourcery explains only what has actually appeared.

### Act 3: First Agency

The user learns the core rule quickly:

- what you see is real
- what you change is modeled
- nothing important is hidden

The page can be inspected and edited.
Widgets can be hidden, swapped, inspected, or upgraded.
The user can call up search, a command surface, or plugin install from the current context.

### Act 4: Capability Discovery

The user asks for a capability, not a low-level artifact.

Examples:

- sessions
- charts
- notes
- database browser

The capability appears as a plugin/capability object that remains inspectable.

### Act 5: World Building

The user begins composing their own environment:

- add a page
- add widgets
- install a plugin
- configure the plugin
- wire routes
- swap widget implementations

The Todo app is one quest within this larger story, not the definition of the system.

### Act 6: Competence

The user no longer needs constant guidance.

Sourcery becomes ambient:

- explain this
- show me what changed
- recommend a capability
- reveal disabled guides for this page
- take me back to the start of this section

### Act 7: Stewardship

The user is no longer merely using an app.

They are shaping a world, curating capabilities, and eventually authoring the surfaces that once taught them.

---

## Sourcery Direction

Sourcery should evolve from a bootstrap tutorial into a first-class contextual companion.

### Desired properties

- always truthful
- always available
- never mandatory
- aware of page/section/widget context
- able to restart guidance from the current scope
- able to show disabled guidance and let the user re-enable it
- able to surface concepts as they become relevant rather than dumping them up front

### Scope model

Sourcery should eventually operate at multiple scopes:

- world
- page
- section
- widget
- chapter/quest

Examples:

- "start over from this page"
- "show me the beginning of this chapter"
- "disable Sourcery for this page"
- "show pages where Sourcery is disabled"

### Important constraint

Sourcery is not a second authoring system.

It should act through the same real surfaces the user can act through directly.

---

## Wider-Net Product Goals

These are not all immediate milestones, but they describe the intended shape of the product.

### Editable-everywhere interaction grammar

- right click `hide widget`
- right click `inspect widget`
- right click `show witnesses`
- right click `show process`
- install/replace/upgrade widget in place
- page-level and section-level editing without navigating away from the current task

### Search and command surface

The system should eventually have the search/command layer old desktop operating systems always wanted:

- search pages
- search widgets
- search plugins/capabilities
- search witnesses/processes
- search commands/actions
- search hidden/disabled surfaces

### Live editable inspector

The long-term direction includes a devtools-like inspector that is not merely observational.

It should:

- inspect the live rendered page
- map visible elements back to authored widgets/definitions
- edit those structures live
- save them back into the world

### Multi-shell environment

The same world should be operable through:

- a desktop shell
- a browser shell
- a hosted/server shell

Shell-specific capabilities should be visible as shell-specific capabilities, not hidden in the core model.

---

## Relationship To Current Milestones

The current baseline/todo/bootstrap work remains valuable because it proves:

- the runtime can be coherent
- a blank world can recover
- real app assembly can happen inside the product
- guided learning can use real surfaces instead of fake wizards

But that work should now be understood as groundwork for a broader composition environment:

- keep building
- keep composing
- keep making more of the system truthful, visible, and local to the world model

