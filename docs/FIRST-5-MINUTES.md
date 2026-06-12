# First 5 Minutes

This document narrows the broader experience vision into a concrete first-session product slice.

The goal is not to describe the whole academy.
The goal is to define the first five minutes in a way that is:

- practical
- buildable
- honest about current reality
- testable mostly without a real browser

---

## Product goal

The user should:

1. land in a genuinely good Todo app
2. discover that the app is only one surface in a larger world
3. gain a first safe editing power
4. see that deeper powers exist behind named capability gates
5. understand that the system is truthful all the way down

This is the beginning of the academy, not the whole academy.

---

## Reality check

What the repo already has:

- a working Todo app and maintained demo world that now runs on `minimal` plus authored runtime-plugin installs
- bootstrap/tutorial flows that still remain a separate blank-world runtime path from that pluginized maintained demo
- world, process, and canvas surfaces
- widget version activation and rollback primitives
- a strong non-browser test suite around projections, widgets, routes, host behavior, and world inspection

What the repo does not yet have as a coherent first-session product:

- the polished "Todo first, world second" landing sequence
- the zoom-out reveal as a supported product interaction
- `Edit Page` as a guided first editing surface
- the personal-box ownership model
- named capability gates for local versus shared editing
- the `F1 -> whoami -> user -> sourcerer = true` pro shortcut as an intentional path

So the work here is not "invent a new philosophy."
It is "compose the existing runtime into a much stronger first-session arc."

---

## Hard constraints

The first five minutes must admit the actual shape of the system.

That means:

- the Todo app is a real app, not a fake cinematic front page
- the reveal must lead to real existing surfaces or clearly defined next surfaces
- every prompt should correspond to a real capability, route, or modeled state
- edit powers must be bounded by explicit authority, not hidden hacks
- recovery must be visible from the start so users can be brave

If a moment cannot eventually be represented in the world model, it should not be central to the first-session story.

---

## Concrete session flow

### Minute 0: useful first impression

The root route opens a beautiful Todo app.

Required properties:

- it must look finished enough to stand on its own
- it must feel like a real tool, not a toy scaffold
- it starts with exactly one seeded task: `be a sourcerer`
- Sourcery is present but quiet

The user should be able to spend a few seconds simply believing this is the product.

### Minute 1: spatial provocation

At the lower edge of the app, a small persistent cue appears:

- `Use the mouse wheel to zoom out`

This must not be a modal tutorial step.
It should feel like an inscription or environmental hint.

Success condition:

- the user understands there is a second layer to discover

### Minute 2: reveal the world

When the user zooms out, the app is reframed as one surface in a larger environment.

Minimum requirement for v1:

- reveal adjacent truthful surfaces already present in the product such as world inspection, process view, canvas, or page editing affordances
- do this inside a 2D infinite canvas with zoom/pan rather than requiring full 3D movement

Ideal later behavior:

- a spatial camera pullback
- right-click look
- `WASD` movement
- the app sitting in a room/world

Important practical note:

The v1 product does not need full 3D simulation to prove the concept.
It needs a legible change of scale and the sense that "this app is mounted inside something bigger."

For v1, "something bigger" can simply mean:

- the Todo app is one board on a larger infinite work surface
- nearby surfaces exist around it in map space
- zoom and pan reveal neighboring structures
- data relationships can be shown as visible wires and pipes through the canvas

If the running `DESIRE` score is visible, this is also the moment where the active lines can shift from flat app setup into spatial reveal instructions.

### Minute 3: first safe authorship

From the revealed world, the user sees `Edit Page`.

`Edit Page` must not begin with raw structure editing.
It opens with low-risk powers:

- choose theme
- change light/material/mood
- adjust typography
- personalize the current page

The first lesson is:

- beauty is editable

### Minute 4: bounded ownership

The user is given one small part of the page that is theirs to shape.

Call it a box, panel, plot, alcove, or personal area.

Inside that boundary they can:

- add widget
- edit widget
- delete widget
- move widget
- restyle widget

Outside that boundary they can see deeper actions, but not yet use them freely.

The next lesson is:

- power is local before it is global

### Minute 5: truthful depth

The user should now be able to sense that there are deeper truths behind the page:

- shared surfaces exist
- capability gates exist
- the current app is authored, not sacred
- recovery exists if they make mistakes

For expert users, a compact pro path should also exist:

- `F1`
- `whoami`
- open `user`
- inspect identity properties
- discover `sourcerer = true`

This should reveal that permission-to-begin was always there, while leaving practical mastery as a longer journey.

At this point `F1` should plausibly expand from command entry into experience transport:

- pause
- step
- go backwards
- go to end

That makes the first session feel like a playable authored process rather than a sealed onboarding movie.

---

## First-session copy targets

These should remain short and concrete.

Examples:

- `Todo: be a sourcerer`
- `Use the mouse wheel to zoom out`
- `Edit Page`
- `Your area`
- `Requires personal capability`
- `Restore last good version`

Avoid copy that sounds like lore exposition or onboarding software.

---

## Capability model for v1

The early product should distinguish at least these layers:

- can use app
- can personalize current page
- can edit owned personal area
- can inspect shared structure
- can edit shared surface
- can change world-level theme

This should be modeled explicitly.
It should not be a pile of front-end-only booleans.

At minimum, the product needs a projection that can answer:

- what actions are visible here
- which are unlocked
- which capability or stewardship condition unlocks them

---

## Recovery model for v1

The user must know they can experiment safely.

Minimum visible recovery affordances:

- `view published version`
- `revert my draft`
- `restore last good version`

This matters in the first five minutes because editing without recovery feels like punishment.

The product should teach:

- truth is recoverable

---

## What should be modeled directly

To keep this testable and truthful, the first-session journey should be described mostly as data and projections.

Recommended modeled pieces:

- first-session quest/step definitions
- first-session prompts and affordances
- capability gate definitions
- page-edit action inventory
- personal-area ownership
- last-good-version / published-version state
- expert command-surface route into identity inspection
- experience-runner state such as current line, paused state, and reachable checkpoints
- editable scene tokens such as colour/light/material values
- infinite-canvas placement for first-session surfaces
- visible connection descriptors for wires/pipes between surfaces, widgets, or processes
- section relief descriptors for shallow 3D chrome on otherwise flat surfaces
- relief-state triggers such as hover, focus, inspect, active process, and active `DESIRE` line

The more of this that lives as pure projections over witnessed state, the less browser-only logic the product needs.

---

## Test strategy: mostly no real browser

The win condition is:

- one small number of browser smoke tests
- most first-session behavior covered by non-browser tests

### 1. Projection tests

Add pure tests that assert the first-session projection from world state:

- root page shows seeded task `be a sourcerer`
- first-session hint appears when the user is new
- `Edit Page` becomes visible after the reveal condition
- action inventory reflects capability gates
- personal-area affordances appear only inside owned scope
- recovery actions appear when a draft exists
- visible `DESIRE` lines reflect current runner state
- editable scene tokens project current values
- section relief levels and lift states project deterministically from state

Likely homes:

- [test/widgets.test.js](/C:/Users/aaron/Documents/world/test/widgets.test.js)
- [test/world-graph.test.js](/C:/Users/aaron/Documents/world/test/world-graph.test.js)
- a new focused first-session projection test file

### 2. Host and route tests

Assert the command and route seams without a browser:

- `whoami` returns `user`
- identity inspection route is reachable
- session and identity state line up with page affordances
- edit actions are denied or allowed based on capability

Likely homes:

- [test/host.test.js](/C:/Users/aaron/Documents/world/test/host.test.js)
- [test/bootstrap-host.test.js](/C:/Users/aaron/Documents/world/test/bootstrap-host.test.js)

### 3. Capability gate tests

Build the gate evaluator as a shared pure function or projection and test:

- visible but locked actions
- unlocked personal edits
- locked shared edits
- later unlocked shared edits

Likely homes:

- a new focused capability-gate test
- possibly [test/hardening.test.js](/C:/Users/aaron/Documents/world/test/hardening.test.js) for negative cases

### 4. Recovery tests

Assert the "last good version" semantics independently of browser UI:

- publish creates a recoverable good version marker
- draft edits do not destroy published state
- revert restores draft state correctly
- rollback remains inspectable

Likely homes:

- [test/widgets.test.js](/C:/Users/aaron/Documents/world/test/widgets.test.js)
- existing widget version tests

### 5. Minimal browser smoke

Keep a small number of end-to-end tests to prove the journey still feels real:

- app opens with seeded task and zoom-out cue
- reveal path reaches `Edit Page`
- personal area can be edited
- pro shortcut reaches identity inspection
- visible running score advances line by line

But do not make browser coverage the main proof.

The browser should verify shell wiring.
The bulk of product truth should already be proven lower down.

---

## Suggested implementation slices

Do this in thin vertical slices rather than one giant rewrite.

### Slice 1: seed and cue

- seed `Todo: be a sourcerer`
- add first-session hint projection
- test it without a browser

### Slice 2: reveal state

- add a modeled "revealed world" state or transition
- expose truthful adjacent surfaces
- test affordance changes without a browser
- if the live score exists, move the runner to the reveal checkpoint and assert the active lines

### Slice 3: edit-page starter

- define first `Edit Page` action inventory
- start with theme/personalization only
- test gate logic and rendered affordances

### Slice 3.5: relief layer

- define shallow relief defaults for Todo sections
- define truthful lift triggers
- expose anchor points for wires/pipes where needed
- keep the semantics testable without real 3D rendering

### Slice 4: personal area

- model one owned bounded area
- allow local widget actions there
- deny shared editing elsewhere

### Slice 5: recovery and courage

- make published/draft/last-good state visible
- test rollback behavior at projection and route level

### Slice 6: pro shortcut

- make the `F1 -> whoami -> user` path intentional
- expose identity inspection and `sourcerer = true`
- test command semantics and identity inspection without a browser

### Slice 7: playable score

- expose current/previous/pending `DESIRE` lines
- allow a tiny safe subset of line edits
- add pause/step/end controls
- treat backwards travel as replay/checkpoint semantics, not witness erasure

---

## Definition of done for the first five minutes

The slice is successful when:

- a new user sees a good Todo app, not a builder scaffold
- the world reveal happens through a concrete affordance
- `Edit Page` is real and bounded
- one owned editing area exists
- shared editing is visible but gated
- recovery is visible
- the expert shortcut exists
- the running score is inspectable
- the majority of this behavior is covered by projection/host tests rather than only browser automation

That is enough to prove the shape of the product without pretending the whole academy already exists.

See also:

- [DESIRE.md](/C:/Users/aaron/Documents/world/docs/DESIRE.md)
- [FIRST-NEIGHBOURHOOD.md](/C:/Users/aaron/Documents/world/docs/FIRST-NEIGHBOURHOOD.md)
