# DESIRE

This document proposes a small authored language for expressing the first-session experience as one thing at once:

- script
- scene
- graph
- code
- quest
- world state

The goal is not to invent a separate fake runtime.
The goal is to give product authors a high-level way to "shout into the world" while still compiling down into truthful modeled structures.

---

## Name

`DESIRE` is the working name.

It should feel like command, ritual, and authorship at the same time.
Not a normal programming language.
Not pure prose.
Something between stage direction and spellcasting.

Example tone:

```text
CREATE EXPERIMENT
CONTEXT HOUSE
SET COLOUR TO BLUE
LIGHTER 20%
SAVE EXPERIMENT
```

That is the right emotional register:

- imperative
- legible
- compact
- magical without becoming fantasy nonsense

---

## Product role

`DESIRE` should be able to describe:

- what the user sees
- what the world reveals
- what actions are available
- what is gated
- what state changes
- what is saved
- what recovery path exists

It is not just scripting animation.
It is experience authoring over the real world model.

It should also be visible while it runs.

The user should be able to encounter `DESIRE` in at least three forms:

- as authored source
- as a live running score
- as compiled world structure

---

## Core idea

Every `DESIRE` statement should correspond to one of four things:

- a projection
- an affordance
- a gate
- a witnessed change

That keeps it honest.

If a statement cannot eventually map to real modeled structures, it should remain outside the language.

When the program is running, the active line should also correspond to a visible present-tense fact:

- something being shown
- something being revealed
- something being gated
- something being saved
- something being changed

---

## Desired properties

The language should be:

- readable by designers
- writable by builders
- testable by engineers
- compilable into world structures
- dramatic enough to carry the product voice

The language should not be:

- a general-purpose programming language
- a pile of browser-only animation commands
- a second hidden authoring system disconnected from witnesses

---

## Shape of the language

The language should read in short, strong lines.

Suggested grammar families:

- `MAKE` / `CREATE` / `SHOW` for existence
- `SET` / `USE` / `APPLY` for state
- `ALLOW` / `DENY` / `REQUIRE` for power
- `WHEN` / `THEN` / `UNTIL` for flow
- `SAVE` / `PUBLISH` / `RESTORE` for continuity
- `ENTER` / `OPEN` / `REVEAL` / `ZOOM` for spatial movement

Examples:

```text
SHOW TODO APP
SEED TODO "be a sourcerer"
WHISPER "Use the mouse wheel to zoom out"

WHEN USER ZOOMS OUT
REVEAL WORLD
SHOW ACTION "Edit Page"

ALLOW THEME ON PAGE HOME
ALLOW WIDGETS IN AREA PERSONAL_BOX
REQUIRE PERSONAL_CAPABILITY FOR ACTION EDIT_SHARED_SURFACE

SAVE LAST_GOOD_VERSION OF PAGE HOME
```

Some lines should be editable in place while the experience is running.

Example:

```text
COLOUR PAPER_CREAM
```

can become:

```text
COLOUR STRAW
```

or:

```text
LIGHTER 20%
```

That edit should update real theme/material tokens and leave an inspectable trace.

---

## Live program surface

`DESIRE` should not live only in a text editor.

It should appear as a visible running program line by line while the world is being revealed.

Think of it as:

- stage directions becoming active
- a score being performed
- the world speaking its own instructions aloud in code

Minimum behaviors:

- the current line is highlighted
- prior lines remain visible as completed
- future lines remain visible as latent
- some lines are editable in place
- edits take effect on the world, not only in the text view

Example:

```text
SCENE HOME
COLOUR PAPER_CREAM
LIGHT WARM 70
SHOW TODO_APP
SEED TODO "be a sourcerer"
```

As the user watches, each line becomes true.

This is the crucial product move:

- the script is not behind the scene
- the script is part of the scene

---

## F1 control surface

`F1` should do more than open a command palette.

At early levels it can open a command surface.
At deeper levels it should also expose transport controls over the running experience.

Desired controls:

- `STOP`
- `PAUSE`
- `STEP`
- `GO BACKWARDS`
- `GO TO END`
- `OPEN SOURCE`
- `OPEN GRAPH`

Important constraint:

- going backwards must mean something truthful
- if the system rewinds, it should rewind projection state, replay state, or draft state explicitly
- it must not become an illusion that contradicts witnessed continuity

In practice, this suggests:

- some lines are reversible scene/theme transitions
- some lines are recoverable draft operations
- some lines require replay-from-checkpoint rather than literal witness deletion

The controls can feel magical.
The semantics must stay rigorous.

---

## Editable lines

Not every line should be editable live.

Good live-edit candidates:

- `COLOUR PAPER_CREAM`
- `COLOUR MOSS_GREEN`
- `LIGHT WARM 70`
- `MOTION DRIFT LOW`
- `TEXTURE GRAIN SOFT`
- prompt wording
- local page mood/material settings

Bad live-edit candidates, at least early:

- authority inheritance
- irreversible publish semantics
- core witness causality
- hidden runtime plumbing

So the user can touch the poetry and the local structure first, without silently corrupting the ontology underneath.

---

## First 5 minutes in DESIRE

This is the first practical script.

```text
EXPERIENCE FIRST_FIVE_MINUTES

CONTEXT HOME
MOOD CALM
MATERIAL PAPER WOOD GLASS BRASS
LIGHT MORNING WARM

SHOW TODO_APP
SEED TODO "be a sourcerer"
PLACE SOURCERY AT EDGE
SET SOURCERY TO QUIET

WHISPER "Use the mouse wheel to zoom out"

WHEN USER ZOOMS_OUT
THEN REVEAL WORLD
THEN SHOW SURFACE WORLD_GRAPH
THEN SHOW SURFACE PROCESS_VIEW
THEN SHOW SURFACE CANVAS
THEN SHOW ACTION EDIT_PAGE

WHEN USER OPENS EDIT_PAGE
THEN ALLOW THEME
THEN ALLOW LIGHT
THEN ALLOW TYPOGRAPHY
THEN DENY STRUCTURE WITH "Requires personal capability"

GIVE USER AREA PERSONAL_BOX
ALLOW ADD_WIDGET IN PERSONAL_BOX
ALLOW EDIT_WIDGET IN PERSONAL_BOX
ALLOW DELETE_WIDGET IN PERSONAL_BOX
DENY EDIT_SHARED_SURFACE WITH "Requires personal capability"

SAVE LAST_GOOD_VERSION OF TODO_APP
SHOW ACTION RESTORE_LAST_GOOD_VERSION

WHEN USER PRESSES F1
THEN OPEN COMMAND_SURFACE

WHEN USER RUNS "whoami"
THEN SHOW RESULT "user"
THEN ALLOW ENTER IDENTITY USER

WHEN USER ENTERS IDENTITY USER
THEN REVEAL PROPERTY SOURCERER TRUE

END EXPERIENCE
```

This already contains:

- scene
- progression
- gates
- powers
- safety
- expert shortcut

It should also be playable as a visible score:

- lines advance as the session unfolds
- the user can inspect the current line
- some scene lines can be edited while active
- `F1` can pause, scrub, or jump

---

## Scene form

`DESIRE` should be able to describe the visible scene directly.

Example:

```text
SCENE HOME
MOOD CALM
COLOUR PAPER_CREAM
COLOUR MOSS_GREEN
COLOUR BRASS_GOLD
LIGHT WARM 70
TEXTURE GRAIN SOFT
MOTION DRIFT LOW
```

This is where the product gets its atmosphere.
But these values should still resolve to real theme/material tokens.

For v1, scene form does not need to imply a first-person room.
It can describe a top-down or plan-view world on an infinite canvas.

Example:

```text
SCENE HOME_MAP
CANVAS INFINITE
VIEW TOP_DOWN
PLACE TODO_APP AT 0 0
PLACE WORLD_GRAPH AT 1400 120
PLACE PROCESS_VIEW AT 1400 760
RUN PIPE DATA FROM TODO_APP TO PROCESS_VIEW
RUN WIRE CONTEXT FROM TODO_APP TO WORLD_GRAPH
```

This keeps the world spatial without demanding a full 3D asset pipeline on day one.

---

## Quest form

`DESIRE` should also describe progression.

Example:

```text
QUEST BE_A_SOURCERER
START AT TODO "be a sourcerer"
STEP ZOOM_OUT
STEP EDIT_PAGE
STEP CLAIM_PERSONAL_BOX
STEP REVEAL_SOURCERER
```

This gives one authoring surface for both experience and academy structure.

---

## Graph form

Underneath the authored lines, the experience should compile into a graph of:

- contexts
- surfaces
- actions
- gates
- prompts
- transitions
- witnesses

For the first five minutes, the graph roughly looks like:

```text
HOME
  -> TODO_APP
  -> PROMPT:ZOOM_OUT
  -> ACTION:EDIT_PAGE
  -> AREA:PERSONAL_BOX
  -> SURFACE:WORLD_GRAPH
  -> SURFACE:PROCESS_VIEW
  -> SURFACE:CANVAS

USER
  -> CAPABILITY:PERSONAL
  -> PROPERTY:SOURCERER

EDIT_PAGE
  -> ALLOW:THEME
  -> ALLOW:LIGHT
  -> ALLOW:TYPOGRAPHY
  -> DENY:EDIT_SHARED_SURFACE

TODO_APP
  -> SAVE:LAST_GOOD_VERSION
```

The authored text is allowed to feel magical.
The compiled graph must remain explicit.

The running program surface should also expose a live execution graph:

- current line
- prior lines completed
- pending lines
- jumps caused by user action
- gates that blocked progress

That graph is the bridge between authored drama and testable system behavior.

The visible canvas can make some of that graph literal:

- wires for lighter logical or contextual relations
- pipes for stronger data/process flow
- boards or surfaces as authored islands on the shared canvas

---

## Runtime meaning

The cleanest implementation path is:

1. author `DESIRE`
2. lower it into ordinary world structures
3. project those structures into UI affordances, prompts, gates, and transitions
4. witness the important transitions

That means `DESIRE` should eventually compile into things like:

- page theme/material descriptors
- first-session prompt definitions
- action inventories
- capability-gate rules
- quest steps
- recovery markers
- command-surface affordances
- transport controls for playable experiences
- editable scene tokens
- execution checkpoints for pause/scrub/replay

It should not need a special privileged runtime.

The clean conceptual model is:

- `DESIRE` is compiled into a plan
- the plan is executed by an experience runner
- the runner emits visible state and control affordances
- the user can inspect and sometimes edit the active plan while it runs

This is closer to playable authored process than to static config.

---

## Testability

This is where `DESIRE` becomes valuable.

If the first five minutes are authored as data, then most of the product can be tested without a real browser.

Test layers:

- parse `DESIRE` into an authored intermediate
- lower into world structures
- assert projected actions/prompts/gates from pure tests
- keep only a few browser smoke tests for shell behavior

Examples of non-browser tests:

- `be a sourcerer` is seeded into the Todo app
- zoom-out prompt appears for a new user
- `Edit Page` appears after the reveal transition
- local edits are allowed in `PERSONAL_BOX`
- shared edits remain visible but locked
- `RESTORE_LAST_GOOD_VERSION` appears when a draft exists
- `whoami` reveals `user`
- entering `user` reveals `SOURCERER TRUE`
- `COLOUR PAPER_CREAM` can be edited to `COLOUR STRAW`
- `PAUSE` freezes the active experience line without losing state
- `GO TO END` resolves the plan to its end state truthfully

This is the main implementation win.

---

## 3D implications

If the world really becomes spatial, `DESIRE` immediately raises an asset question.

That is not a problem to avoid.
It is a design constraint to stage carefully.

The right sequence is probably:

### Stage 1: tokenized 2.5D

Use an infinite 2D canvas plus theme/material/light/layout tokens and simple depth tricks first:

- zoom
- pan
- layered panels
- parallax
- boards, islands, rails, wires, and pipes as authored planes
- lighting and shadow tokens
- camera pullback without heavy asset dependence

This proves the interaction model before a large asset pipeline exists.

### Stage 2: bounded 3D set dressing

Introduce a small curated library of reusable spatial assets:

- table
- wall
- shelf
- lamp
- frame
- card
- cabinet
- window
- plant
- notebook

These should feel domestic, architectural, and material.
Not futuristic props.

### Stage 3: authored world kits

Once the experience runner is stable, `DESIRE` can reference reusable scene kits:

```text
USE KIT STUDY_ROOM
PLACE TODO_APP ON DESK
PLACE WORLD_GRAPH ON WALL
LIGHT WINDOW EAST MORNING
```

That is where the world becomes properly spatial.

---

## 3D asset stance

The asset strategy should follow the same truth-before-convenience rule as the rest of the product.

That means:

- assets should be named and inspectable
- material/theme swaps should be token-driven where possible
- the same surface should have a flat reading and a spatial reading
- authored scenes should degrade gracefully back to 2D/2.5D shells

Avoid a dependency on giant bespoke scenes just to prove the first-session concept.

The first five minutes only need:

- one convincing board/canvas grammar
- one convincing wire/pipe grammar
- one convincing reveal from app to world

Not an entire asset universe.

That is why a 2D infinite-canvas v1 is attractive:

- it preserves spatial discovery
- it keeps the world inspectable
- it makes flows visible
- it avoids premature 3D asset debt

---

## Why this is better than plain config

Plain config can represent the same facts, but it does not carry intention.

`DESIRE` would let authors write in the native language of product experience:

- reveal this
- allow that
- deny this until stewardship exists
- save the current good version
- whisper this prompt at the edge

It becomes easier to reason about the world as authored drama rather than only component trees and route tables.

---

## Why this is better than a hidden wizard

If implemented correctly, `DESIRE` does not become a fake experience layer.

It remains honest because:

- it lowers into explicit world structures
- gates remain modeled
- prompts remain inspectable
- actions remain real
- saves and restores remain witnessed

So the script, the scene, the graph, the code, the word, and the universe all remain the same thing seen at different levels.

---

## Suggested first implementation

Do not try to build the whole language at once.

Start with one narrow authored file for the first five minutes and support only a tiny verb set:

- `SHOW`
- `SEED`
- `WHISPER`
- `WHEN`
- `REVEAL`
- `ALLOW`
- `DENY`
- `GIVE`
- `SAVE`

Plus one tiny live-edit/theme subset:

- `COLOUR`
- `LIGHT`
- `TEXTURE`
- `LIGHTER`

That is enough to prove the idea.

If it works, then extend into:

- quest authoring
- academy chapters
- theme authoring
- contextual Sourcery narration
- later world-building acts
- playable runner controls
- spatial kits and asset references

---

## Small example

```text
EXPERIENCE HOME_BOOT

SHOW TODO_APP
SEED TODO "be a sourcerer"
WHISPER "Use the mouse wheel to zoom out"

WHEN USER ZOOMS_OUT
THEN REVEAL EDIT_PAGE
THEN GIVE USER AREA PERSONAL_BOX

ALLOW THEME ON HOME
ALLOW ADD_WIDGET IN PERSONAL_BOX
DENY EDIT_SHARED_SURFACE WITH "Requires personal capability"

SAVE LAST_GOOD_VERSION OF TODO_APP
```

That is close to the right size.

It reads like intent.
It can lower into truth.
And it gives the first five minutes a single authored spine.

See also:

- [FIRST-NEIGHBOURHOOD.md](/C:/Users/aaron/Documents/world/docs/FIRST-NEIGHBOURHOOD.md)
