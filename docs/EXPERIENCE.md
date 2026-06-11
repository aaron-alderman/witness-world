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

The user should not land in a blank meta-environment first.

The first thing they see should be a genuinely attractive and useful app surface.
The current Todo app is a strong candidate for that role.

The experience should begin with:

- a beautiful, calm, tactile Todo app
- enough completeness that the user can believe "this might just be the product"
- one initial Todo item: `be a sourcerer`
- Sourcery present, but not yet dominant

The environment becomes owned rather than anonymous when the user claims identity.
But the first emotional hook is usefulness and taste, not explanation.

### Act 2: Orientation

Sourcery should reveal the environment, not a fake onboarding overlay over an unrelated product.

The first reveal should happen spatially rather than conceptually.

At the bottom of the Todo surface, a quiet instruction invites discovery:

- `use the mouse wheel to zoom out`

The user scrolls expecting normal page behavior.
Instead, the camera withdraws.
The Todo app starts to read as an object in space rather than a full-screen flat product.

From there, the environment reveals real gadgets and surfaces:

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

The interaction grammar should make this legible through discovery:

- zoom out from the app
- right click and move mouse to look around
- use `WASD` to navigate
- discover that the Todo app is one surface inside a larger world

From that first pullback, the user should be able to see:

- `Edit Page`
- inspectable surfaces around the page
- real backstage structures rather than fake chrome

`Edit Page` should open with safe, intimate powers first:

- choose theme
- choose local mood/material/typography
- personalize a page without yet rewriting it structurally

The page can then become progressively more editable:

- widgets can be hidden, swapped, inspected, or upgraded
- plugin installation and configuration can happen in context
- the user can call up search, a command surface, or plugin install from the current scope

### Act 4: Capability Discovery

The user asks for a capability, not a low-level artifact.

Examples:

- sessions
- charts
- notes
- database browser

The capability appears as a plugin/capability object that remains inspectable.

### Act 5: World Building

The user should not begin with unlimited authority.

The intended progression is:

- first personalize the page
- then receive one small bounded area on the canvas that is theirs
- then add/edit/delete widgets inside that personal area
- only later gain authority to edit shared or canonical surfaces such as the Todo app itself

Some actions should be visible before they are unlocked:

- `add widget`
- `edit widget`
- `delete widget`
- `edit shared surface`
- `change world theme`

Capability gates should feel like named thresholds rather than arbitrary lockouts.
The user sees powers before they possess them.

The user then begins composing their own environment:

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

At advanced levels, they can safely edit even the canonical starter app because:

- the current good version remains visible
- drafts can be explored without fear
- the user can restore the last good version
- truth and recovery are part of the product, not emergency escape hatches

---

## First-Session Hooks

### The Todo facade

The opening Todo app matters because it creates a stable first assumption:

- "this is a nice app"
- "this feels useful already"

That assumption is then broken physically, not verbally, when the user zooms out and discovers that the app is only one surface in a larger world.

### The `Edit Page` threshold

`Edit Page` is the first gentle power.

It should begin with personalization rather than raw structure:

- theme
- light
- typography
- page mood/material

This lets the user exercise taste before they exercise broad authorship.

### The personal box

The user should receive a small, bounded area that is theirs to edit.

Inside that box they can:

- add widget
- edit widget
- delete widget
- move widget
- restyle widget

This creates a true authored foothold without making the whole world chaotic on day one.

### The last good version

Editing becomes much safer if the system always preserves a known-good state.

Visible recovery affordances should include ideas like:

- `restore last good version`
- `view published version`
- `revert my draft`
- `compare current edits`

The user should become braver because the world has a path back.

### The expert shortcut

The main path to authorship is long, practical, and guided.
But the system should also contain a compact pro path.

The starting Todo item can be:

- `Todo: be a sourcerer`

Then an experienced user can:

- press `F1`
- run `whoami`
- open `user`
- enter the identity record directly
- see `sourcerer = true`

This should not confer practical mastery.
It reveals a deeper truth:

- the power was always there
- the system never lied about inspectability
- permission-to-begin is different from learned stewardship

The guided path and the pro path should both lead to the same worldview.

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

The Todo app in particular should now be treated as:

- a genuinely good starter app
- a facade that hides depth until the user discovers it
- the first academy quest surface
- the first shared/canonical page the user eventually earns the right to edit

See also: [ACADEMY.md](/C:/Users/aaron/Documents/world/docs/ACADEMY.md)
