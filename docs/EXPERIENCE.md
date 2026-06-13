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

Terminology discipline matters here:

- `fake` should mean theatre: a surface that claims a capability without grounding it in the real world model, runtime, or witnessed persistence
- `stub` should mean a real seam with a simplified local or deterministic provider path
- `projection` should mean a real derived view rather than canonical truth
- `real but narrow` should mean a truthful first slice with intentionally limited coverage or scope
- `compatibility bridge` should mean a deliberate transition path that keeps older worlds or behavior working while first-class modeling catches up

Current honesty snapshot:

- the command/search surface is projection-backed, not a hidden registry
- tutorial recovery commands are derived from persisted tutorial progress rather than a fake onboarding-only command layer
- shipped backend provider seams remain stub-first where vendor realism is intentionally deferred
- capability placeholder synthesis is a compatibility bridge, not a final composition rule
- same-context and unscoped canonical-id authoring still acts as compatibility sugar, but hidden foreign-scoped canonical-id bypasses on covered bootstrap/DSL surfaces are now blocked
- some live editing and proposal flows are real but narrow, even where ambient refresh now works
- the next real honesty risks are migration and governance seams, not a fake command product
- widget-version routes and Eden version routes now do flow through shared authority derivation, the live inspector now has a first `widgetVersion.activate` / `widgetVersion.rollback` proposal fallback, the Eden versions panel now has a first `widgetVersion.activate` / `widgetVersion.rollback` / `edenVersions.publish` proposal fallback, and the Eden capability shelf now has a first `capability.install` proposal fallback, but remaining app-specific and other operating-surface mutation actions still do not all flow through one shared authority/proposal path

Current honesty ledger:

- `fake` at the core product layer: none currently called out
- `stub`: practical backend provider seams with intentionally simplified transports
- `projection but real`: the command/search surface and tutorial recovery surfaces
- `real but narrow`: current live editing, live proposal, current-identity editing, first-slice canvas authority-bound world mutation, and first-slice contextual naming coverage
- `compatibility bridge`: capability placeholder synthesis plus the remaining allowed canonical-id authoring paths

The main product honesty risk right now is not a fake command system or a fake registry.
It is letting narrow truthful slices or compatibility bridges harden into the permanent product rule without an explicit migration or replacement story.
The sharpest examples today are placeholder capability synthesis, remaining canonical-id compatibility, and the app-specific mutation routes that still sit beside rather than inside the shared governance model.

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

The first honest slice now exists through explicit local bindings plus explicit export/import edges.
What is still missing is the stronger product-wide rule where contexts become hard naming boundaries rather than a composition layer that still coexists with canonical-id compatibility.
In practice today that means contextual naming is real on the covered bootstrap/DSL surfaces, but it is still a first slice with bounded ref-lowering coverage and an explicit compatibility bypass through canonical ids.

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

The first shipped desktop shell now proves the ownership seam in a narrow but real way.
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

That pro path now exists on the live Todo board and on the embedded center board inside `/eden-canvas`.

The starting Todo item can be:

- `Todo: be a sourcerer`

Then an experienced user can:

- press `F1`
- run `whoami`
- open `user`
- see `sourcerer = true`

This should not confer practical mastery.
It reveals a deeper truth:

- the power was always there

Today that shortcut can edit the current signed-in identity inline, refresh the active session when that identity changes, and still hand off into the real bootstrap identity editor as well as real world/source views.
It remains a narrow current-identity slice rather than a broader expert transport or full identity lifecycle surface.
- the system never lied about inspectability
- permission-to-begin is different from learned stewardship

The guided path and the pro path should both lead to the same worldview.

## Sourcery Direction

Sourcery should evolve from a bootstrap tutorial into a first-class contextual companion.

The first real contextual slice now exists at page scope:

- bootstrap and the live app can tell when the current guidance belongs on the other surface
- the shipped Todo path now also hands off into the real `/world` operating surface rather than ending at the app page
- the world page now hosts its own guidance panel backed by the same persisted tutorial progress model
- guidance can be disabled and re-enabled per page on those three real surfaces
- bootstrap can now keep those disabled guidance surfaces visible and directly recoverable even when the disabled page is not currently open
- the current authored step can be replayed from here on those surfaces, and backing onto an already-complete step now pins replay instead of immediately skipping forward again
- authored tutorial concepts are revealed progressively on those surfaces as the relevant steps become current
- bootstrap now surfaces suggested next moves from actual world, session, and tutorial state without replacing the underlying controls

The current concept slice is still intentionally narrow:

- concepts are authored on the tutorial rather than inferred from arbitrary world state
- reveal order follows real tutorial progress rather than a broader concept graph
- ambient curation is still bootstrap-first rather than a cross-surface recommendation layer
- restart-from-here only replays guidance for the authored step; it does not roll back live app state or witnessed authored state
- the world-page slice is still page-scoped guidance on one operating surface, not true world/section/widget scope semantics

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

The first real shared slice now exists on the world page and on rendered app pages:

- projected graph objects are searchable
- current rendered widgets are searchable on the live page and can be inspected in place
- real surface handoffs are searchable
- disabled tutorial guidance can now stay visible there as recovery commands derived from persisted tutorial state
- the same world surface can now also host the tutorial's final real guidance handoff instead of acting only as a secondary inspector
- live-page results are backed by rendered widget ancestry plus the same projected world graph, not by a second command registry

What is still missing is the universal version of this idea across every shell, page, widget, and plugin surface.

### Live editable inspector

The long-term direction includes a devtools-like inspector that is not merely observational.

It should:

- inspect the live rendered page
- map visible elements back to authored widgets/definitions
- edit those structures live
- save them back into the world

The first honest slice now exists on rendered app pages and inside Eden's embedded Todo board:

- `Inspect Page` can be toggled directly on the live surface
- right-clicking a rendered widget can select and highlight it
- the inspector can explain the selected widget and hand off into world, witness, source, and process views
- versioned widgets can be activated or rolled back in place from that live inspector
- non-versioned widgets can now save back `text`, `title`, `class`, and `hidden` through a real `widget.update` witness path when the current actor has authority
  The shipped demo world makes that path visible by explicitly granting `aaron` stewardship over the `frontend` context.
- signed-in actors without direct authority can now use that same live inspector to create a real `widget.update` proposal instead of hitting a dead end
  Approval still happens through the generic proposal flow, but the approved change now flows back onto the rendered page through the same live witness-refresh path instead of requiring a manual reload.
- signed-in actors without direct version authority can now use that same live inspector to create real `widgetVersion.activate` and `widgetVersion.rollback` proposals for shared versioned widgets
  That version-proposal path is still intentionally narrow: approval still happens through the generic proposal flow, and while Eden's versions panel now also covers read-only `widgetVersion.activate` / `widgetVersion.rollback` / `edenVersions.publish` proposal creation and Eden's capability shelf now covers read-only `capability.install` proposal creation, broader version governance and broader app-specific review still remain open.

What is still missing is the actual editable-everywhere part:

- replace/widget-structure mutation
- wider property editing and broader editable coverage across authored app chrome
- broader shell coverage beyond the current rendered app surfaces and Eden's embedded Todo board

### Multi-shell environment

The same world should be operable through:

- a first desktop ownership shell, with broader native integrations still to come
- a browser shell
- a hosted/server shell

Shell-specific capabilities should be visible as shell-specific capabilities, not hidden in the core model.

---

## Relationship To Current Milestones

The current baseline/todo/bootstrap work remains valuable because it proves:

- the runtime can be coherent
- the maintained demo can now prove authored plugin composition on `minimal` instead of only riding the implicit `full` profile
- a blank world can recover through a still-separate bootstrap/tutorial runtime path
- real app assembly can happen inside the product
- guided learning can use real surfaces instead of fake wizards

What is still not unified yet is the runtime-composition story:

- the maintained demo is pluginized through authored runtime-plugin installs, including `plugin.demo`; `handlerSet = "demo"` no longer activates `bundle-demo` by itself
- blank-world bootstrap/tutorial startup still does not use that same narrowed baseline and authored plugin story yet

But that work should now be understood as groundwork for a broader composition environment:

- keep building
- keep composing
- keep making more of the system truthful, visible, and local to the world model

The Todo app in particular should now be treated as:

- a genuinely good starter app
- a facade that hides depth until the user discovers it
- the first academy quest surface
- the first shared/canonical page the user eventually earns the right to edit

See also:

- [ACADEMY.md](/C:/Users/aaron/Documents/world/docs/ACADEMY.md)
- [FIRST-5-MINUTES.md](/C:/Users/aaron/Documents/world/docs/FIRST-5-MINUTES.md)

---

## Eden Canvas Roadmap

### Shipped now

- [X] the Todo facade now has a concrete spatial counterpart in `/eden-canvas`
- [X] the first reveal is physical: the user lands on the Todo board, sees the zoom-out prompt, and discovers the neighborhood by camera movement
- [X] the first adjacent truths are present around the board: Tree, Personal Box, Edit Page, Process View, Versions, World Graph, and `goto` transports
- [X] the first-agency layer is visible through action chips and locked gates rather than hidden future promises
- [X] the starter board remains a real live surface hosted inside the neighborhood instead of a hand-waved mock projection
- [X] first-session chapter/checkpoint copy is now authored and rendered from projected data
- [X] the Personal Box is now a real first-owned patch where the user can sign in and add, edit, and delete local widgets inside Eden
- [X] `Edit Page` now mutates a real page chrome/theme model for the live Todo surface, including theme, material, and typography changes from inside Eden
- [X] `Versions` now drives real published/draft/last-good actions for the canonical starter seam inside the live Todo board, including open draft, publish current, and restore last good
- [X] the live Todo board is now mapped into stable projected sub-surfaces so real widget ids like `todo_form`, `todo_list`, `todo_private_notes`, and `todo_version_playground` can lift as authored relief inside Eden
- [X] the live Todo board can now switch from map mode into inspect mode inside Eden so the real right-click inspector, process/world handoffs, and narrow widget save-back work without leaving `/eden-canvas`
- [X] the direct expert shortcut now works on the live board and inside Eden: `F1` opens `whoami`, reveals the current user truth, and shows `sourcerer = TRUE` without pretending that mastery has already been earned
- [X] the first in-context capability install flow now exists inside Eden on the World Graph surface, so missing page powers can be discovered and installed from the place they are needed
- [X] that Eden capability shelf now also has a first read-only proposal fallback, so signed-in users without direct target authority can still open a real `capability.install` proposal from the place the missing power is discovered
- [X] the first Eden chapter rail now reads real quest progression from witnessed practice, so `Claim Your Room`, `Restyle The Page`, `Restore Last Good`, and `Install A Missing Power` complete from actual work rather than static copy
- [X] the first visible capability gates now unlock from that practiced work, so shared-surface stewardship chips stop being decorative locks and open only after the user has actually exercised the first practical loops
- [X] the first later operator gate is now real on `Process View`, where local operator quests, real process inspection, and a witnessed failure drill unlock and prove `Alter Runtime` from actual practice instead of route-local theater
- [X] the Tree's optional `Theory Annex` is now a real Eden side path, where lesson study and the witnessed assessment earn a truthful `trained` mark instead of leaving theory as a decorative promise
- [X] the first repeated-practice layer now exists inside Eden, so stewardship, operator work, and teaching are tracked as real responsibility bands rather than only one-time quest flips
- [X] Tree teach-back is now a real post-`trained` action, so the world can witness explanation and carry teaching forward as practiced work instead of decorative copy
- [X] the shared Todo version seam is now explicitly governed by the `frontend` context, so Eden recovery actions follow the same visible authority boundary as the rest of the shared page
- [X] the first broader responsibility-family consequences now exist inside Eden, so repeated work can open `Shared Table`, `Run A Stall`, and `Ship A Tiny SaaS` as real Tree-facing powers rather than leaving trade and tiny-SaaS growth as prose
- [X] the first Commons governance loop now exists inside Eden, so `Start A Group`, `Set The Rules`, and `Run An Open Organization` complete from real context creation, stewardship delegation, proposal opening, and proposal approval rather than static future copy

### Next slices

- [ ] expand Eden progression beyond the first responsibility family into wider academy taxonomies, deeper thresholds, and stronger cross-surface unlock consequences on Tree, Process View, and shared-surface chips

### Later slices

- [ ] deepen shell transitions so page-to-page travel feels like movement inside one continuous world
