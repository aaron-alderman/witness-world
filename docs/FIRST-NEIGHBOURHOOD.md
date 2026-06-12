# First Neighbourhood

This document defines the first spatial neighborhood around the starter Todo app.

It is a v1 map spec for the infinite 2D canvas:

- what exists near the Todo app
- where it sits
- what appears at each zoom level
- how wires, pipes, and paths should read
- where `goto` transports live

The neighborhood should feel like a workbench garden:

- practical
- warm
- legible
- asymmetrical
- discoverable by zooming and panning

Not a dashboard.
Not a sci-fi galaxy.
Not an empty whiteboard.

---

## Core shape

The first neighborhood is a small district with one main board and several adjacent truths.

The center is not geometric.
The center is emotional:

- the Todo app is the jewel
- the Tree is the landmark
- the surrounding boards are the first revealed truths

The map should feel like it grew over time rather than being radially generated.

---

## Map units

Use a simple authored canvas coordinate system.

- origin: the center of the Todo app
- units: canvas units, not screen pixels
- positive `x`: east/right
- positive `y`: south/down
- current authored WTOML stores each surface as a rectangle using top-left `x`,`y` plus `w`,`h`
- the prose diagram below still describes the emotional/map centers of each landmark

Suggested v1 camera assumptions:

- default landing zoom shows only the Todo app and hints of nearby edges
- one or two wheel steps out reveal the neighborhood
- larger zoom levels reveal connection lines, labels, and `goto` points

---

## The Tree

The neighborhood needs a single memorable landmark.

That landmark is the Tree.

The Tree is not just decoration.
It is the symbolic center of growth, authorship, and continuity.

The Tree should sit just off-center so the Todo app remains the first focal point.

Suggested role:

- landmark for orientation
- visible sign that the world is cultivated, not abstract
- anchor for `goto home`
- possible future representation of growth, academy progress, or world maturity

Suggested position:

- `TREE` at `(-540, -260)`

Suggested visual treatment:

- top-down canopy
- warm green / straw / moss palette
- ringed soil bed or stone border
- visible path segments leading outward

The Tree should be large enough to read clearly when zoomed out, but not so large that it steals the first-boot composition.

---

## Surface layout

This is the recommended v1 layout.

```text
                      WORLD_GRAPH
                      (980, -760)
                           |
                           | wire: structure
                           |

   TREE               TODO_APP ---------------- PROCESS_VIEW
 (-540,-260)           (0,0)                     (1100,120)
     |                    |                           |
     | path               | pipe: events/data         | pipe: runs
     |                    |                           |
     |                 EDIT_PAGE ---------------- VERSIONS
     |                 (260,640)                  (1120,760)
     |
     |
 PERSONAL_BOX ---------+
 (-920,540)


                GOTO WORLD
                 (0,-1180)

      GOTO HOME                         GOTO PROCESS
     (-1280,-40)                        (1540,120)

                GOTO CANVAS
                 (0,1180)
```

This is intentionally asymmetric:

- the right side is more infrastructural
- the left side is more personal and organic
- the bottom side is more authoring and recovery
- the top side is more structural and world-facing

---

## Surface definitions

### `TODO_APP` at `(0, 0)`

The most polished board.
This is the default landing surface.

Role:

- useful first app
- first quest surface
- facade that hides wider depth

Visible early:

- yes

Editable early:

- theme first
- shared structure later

### `TREE` at `(-540, -260)`

The landmark.

Role:

- orientation anchor
- aesthetic center
- symbol of cultivation
- future academy/world-growth hook

Visible early:

- edge hint at close zoom
- fully readable after zooming out

Editable early:

- no structural editing
- maybe theme/light influence later

### `PERSONAL_BOX` at `(-920, 540)`

The user's first owned patch of land.

Role:

- safe tinkering zone
- local widget experimentation
- first true authorship

Visible early:

- after first reveal

Editable early:

- yes

### `EDIT_PAGE` at `(260, 640)`

The first friendly authoring neighbor.

Role:

- theme
- typography
- mood
- local page treatment

Visible early:

- yes, after reveal

Editable early:

- yes

### `PROCESS_VIEW` at `(1100, 120)`

The machine-room board.

Role:

- process flow
- event movement
- visible operations

Visible early:

- after reveal

Editable early:

- mostly inspect, not alter

### `VERSIONS` at `(1120, 760)`

The recovery shelf.

Role:

- published version
- draft version
- last good version
- rollback / compare

Visible early:

- after reveal

Editable early:

- restore/revert actions yes
- policy editing later

### `WORLD_GRAPH` at `(980, -760)`

The map wall.

Role:

- structure
- context
- capabilities
- relationship truth

Visible early:

- after reveal, but slightly farther out

Editable early:

- inspect first

---

## Zoom bands

The neighborhood should reveal in bands.

### Band 0: app-only

User sees:

- Todo app
- subtle edge of Tree canopy or shadow
- faint edge inscriptions
- prompt: `Use the mouse wheel to zoom out`

User does not yet fully see:

- Process View
- World Graph
- Personal Box
- full path network

### Band 1: neighborhood reveal

User sees:

- Todo app in context
- Tree
- Edit Page
- Personal Box
- Process View
- first visible wires/pipes
- first `goto` markers

This is the main reveal band.

### Band 2: structural reading

User sees:

- World Graph fully
- Versions shelf
- stronger labels
- more wire/pipe semantics
- named districts / islands

This is where the map stops being “an app with extras” and becomes “a small world.”

### Band 3: world routing

User sees:

- `goto` transports clearly
- exits toward other pages/world districts
- higher-level context groupings

This band should not be necessary for the first 30 seconds, but it should exist.

---

## Wires, pipes, and paths

Use different visual grammars for different meanings.

### Wires

Use wires for:

- structure
- authorship
- context
- capability relationships
- inspectable meaning

Visual treatment:

- thin
- taut
- clean
- light brass / graphite / moss accents

### Pipes

Use pipes for:

- data flow
- process flow
- event movement
- live runtime transport

Visual treatment:

- thicker
- jointed
- directional
- slightly industrial

### Paths

Use paths for:

- human navigation
- visual walking routes across the neighborhood
- relation to the Tree
- emotional coherence

Visual treatment:

- soft stone / dirt / inlaid line
- broader than wires
- less literal than pipes

This lets the map feel both diagrammatic and inhabited.

---

## Relief and chrome

Although the v1 world is a top-down infinite canvas, the starter surfaces can still carry shallow 3D relief.

The goal is not to turn the page into a game scene.
The goal is to make the page feel materially alive while staying faithful to the underlying authored structure.

The mental model is:

- `page plane`: canonical flat layout
- `relief layer`: depth, bevel, shadow, trays, raised panels
- `flow layer`: wires, pipes, pulses, sockets
- `interaction layer`: hover, focus, inspect, edit, active-process states

This means a section can "pop out" into shallow depth without becoming a different object.
It remains the same surface in the model, with an extra projected chrome treatment.

### Relief rules

Depth should always explain something truthful.

- depth explains structure
- lift explains relevance
- motion explains state

Avoid arbitrary decorative popping.
If a surface lifts, the user should be able to answer why.

Good reasons for lift:

- hover
- focus
- inspect
- edit mode
- active process
- active data flow
- capability available here
- current `DESIRE` line targets this section
- this surface differs from published or last-good state

Bad reasons for lift:

- idle ornament
- random motion
- fake drama disconnected from state

---

## Todo app relief spec

The Todo app should be composed of shallow raised sections rather than one flat slab.

Suggested sections:

- `todo_session`
- `todo_title`
- `todo_form`
- `todo_list`
- `todo_private_notes`
- `todo_witnesses`
- `todo_widget_editor`
- `todo_process_graph_lab`
- `todo_version_playground`

Each section can be projected with a default relief level and one or more raised states.

### Relief scale

Use a simple conceptual scale:

- `0`: flat ink on page
- `1`: light plate / card
- `2`: tray / framed section
- `3`: active raised panel
- `4`: emphasized focal panel

These do not need to be real world units.
They are a stable authored projection scale.

### `todo_session`

Default:

- relief `1`
- small plate or credential plaque

Raised when:

- sign-in fields focused
- identity/session state changes
- `DESIRE` line references identity or session

Meaning:

- identity is currently relevant

### `todo_title`

Default:

- relief `0`
- mostly typographic

Raised when:

- rarely
- perhaps only during first boot or when the quest line is highlighted

Meaning:

- title is atmospheric, not highly interactive

### `todo_form`

Default:

- relief `2`
- treated like an input tray

Raised when:

- input focused
- add action available
- user is being guided to create or edit a todo

Meaning:

- this is where action enters the system

### `todo_list`

Default:

- relief `2`
- list well or card rail

Raised when:

- an item is hovered
- an item is toggled
- a new todo is inserted
- an active `DESIRE` line or tutorial step targets the list

Meaning:

- live work is happening here

### `todo_private_notes`

Default:

- relief `1`
- quieter side drawer

Raised when:

- user opens or edits notes
- privacy/scoping is being explained

Meaning:

- this is a more personal, less public compartment

### `todo_witnesses`

Default:

- relief `1`
- ledger rail or witness strip

Raised when:

- new witness arrives
- inspect mode focuses provenance
- user asks what changed

Meaning:

- the system is showing memory and evidence

### `todo_widget_editor`

Default:

- relief `1`
- dormant tool drawer

Raised when:

- user enters local editing
- personal-box or widget-edit actions become relevant

Meaning:

- authoring tools are active here

### `todo_process_graph_lab`

Default:

- relief `2`
- exposed machine plate with pipe anchors

Raised when:

- process simulation is active
- runtime flow is being inspected
- the nearby `PROCESS_VIEW` surface is emphasized

Meaning:

- hidden flow is being surfaced

### `todo_version_playground`

Default:

- relief `2`
- stacked shelf or archive drawer

Raised when:

- version switch occurs
- rollback is available
- draft differs from published

Meaning:

- history and recovery are currently relevant

---

## Chrome grammar

The chrome language should stay materially consistent across the neighborhood.

Suggested treatments:

- bevel edges for active panels
- inset wells for collections and lists
- tray lips for inputs and controls
- sockets and couplings where pipes connect
- anchor studs where wires connect
- gentle shadow offsets to indicate lift

Materials can vary by theme, but the grammar should remain stable.

Examples:

- input areas feel like trays
- collections feel like wells or rails
- recovery areas feel like shelves or drawers
- process areas feel like plates with fittings
- personal areas feel warmer and softer

---

## Section pop behavior

Sections should "pop out" shallowly, not leap toward the camera.

Recommended behavior:

- hover: subtle lift
- focus: stronger lift and clearer shadow
- inspect: freeze lift and expose connectors
- active process: add pulse through pipes and sockets
- draft difference: add archive glow or stamped edge

The transition should feel mechanical and calm.
More drawer-slide than sci-fi hover.

---

## Faithfulness rule

Every relief effect must map back to a real underlying surface id.

That means:

- `todo_list` lifted is still `todo_list`
- `todo_form` tray is still `todo_form`
- `todo_version_playground` shelf is still the version surface

No chrome-only ghost objects should carry meaning by themselves.
Chrome is projection, not ontology.

---

## Testable relief model

The relief layer should be testable without a real browser.

Model-level assertions should include:

- every visible section has a stable surface id
- default relief levels are projected deterministically
- lift states derive from explicit inputs such as focus, inspect, active process, or `DESIRE` line targeting
- connection anchors exist for sections that expose wires or pipes
- draft/published difference can change relief state without changing section identity

This keeps the shallow-3D idea rigorous instead of decorative-only.

---

## `goto` transports

The neighborhood should include explicit transport surfaces.

These are not browser links disguised as lore.
They are clear world-navigation objects that move you across page/world scopes.

Suggested v1 `goto` nodes:

- `GOTO HOME`
- `GOTO WORLD`
- `GOTO PROCESS`
- `GOTO CANVAS`

### `GOTO HOME` at `(-1280, -40)`

Role:

- recenter to starter neighborhood
- recover orientation

Behavior:

- animate camera to default home framing

### `GOTO WORLD` at `(0, -1180)`

Role:

- move toward broader world inspection

Behavior:

- navigate to world page or world district
- preserve enough continuity that the user feels transported, not abruptly reloaded

### `GOTO PROCESS` at `(1540, 120)`

Role:

- move toward deeper process understanding

Behavior:

- transport into process page/district

### `GOTO CANVAS` at `(0, 1180)`

Role:

- move toward broader spatial authoring

Behavior:

- transport into the wider canvas world

`goto` objects should feel like transit markers, gates, or signposts.
Not generic buttons floating on the map.

---

## `goto` behavior

All `goto` transports should:

- preserve orientation when possible
- visually acknowledge departure and arrival
- be reachable through both click and command
- remain represented in the model as navigational affordances

Suggested transitions:

- brief camera drift
- subtle line tracing along the path
- arrive centered on destination district

Avoid:

- hard unexplained cuts
- teleporting without a visual cause
- losing the sense that all pages belong to one world

---

## DESIRE scene sketch

This neighborhood should be expressible in `DESIRE`.

Example:

```text
SCENE FIRST_NEIGHBOURHOOD
CANVAS INFINITE
VIEW TOP_DOWN

PLACE TODO_APP AT 0 0
PLACE TREE AT -540 -260
PLACE PERSONAL_BOX AT -920 540
PLACE EDIT_PAGE AT 260 640
PLACE PROCESS_VIEW AT 1100 120
PLACE VERSIONS AT 1120 760
PLACE WORLD_GRAPH AT 980 -760

RUN PATH FROM TREE TO TODO_APP
RUN PATH FROM TREE TO PERSONAL_BOX
RUN WIRE STRUCTURE FROM TODO_APP TO WORLD_GRAPH
RUN PIPE EVENTS FROM TODO_APP TO PROCESS_VIEW
RUN WIRE AUTHORSHIP FROM TODO_APP TO EDIT_PAGE
RUN WIRE OWNERSHIP FROM PERSONAL_BOX TO TODO_APP
RUN WIRE RECOVERY FROM TODO_APP TO VERSIONS

PLACE GOTO_HOME AT -1280 -40
PLACE GOTO_WORLD AT 0 -1180
PLACE GOTO_PROCESS AT 1540 120
PLACE GOTO_CANVAS AT 0 1180
```

---

## Testable model

This layout should be testable without a real browser.

Model-level assertions should include:

- surface positions are stable
- the Tree exists and is near the Todo app
- visible zoom bands contain the intended surfaces
- `goto` nodes exist and declare destinations
- wire/pipe/path relations are typed correctly
- the first reveal band contains the expected neighborhood set

This keeps the neighborhood part of the product contract rather than a hand-waved mockup.

---

## v1 rule

The first neighborhood should answer one question immediately:

`What is around this app?`

The answer should be:

- the place where I personalize it
- the place that is mine
- the place where it flows
- the place where it is mapped
- the place where it can be restored
- the paths that lead elsewhere

That is enough for v1.

---

## Eden Canvas Roadmap

### Shipped now

- [X] `/eden-canvas` exists as a separate route while `/` stays unchanged
- [X] the live Todo app is the center surface rather than a fake canvas redraw
- [X] the Tree, Personal Box, Edit Page, Process View, Versions, World Graph, and `goto` markers are authored neighborhood surfaces
- [X] the neighborhood reveals in zoom bands and now exposes chapter/checkpoint copy in-scene
- [X] wires, pipes, and paths are projected as typed connections
- [X] visible power chips now show early actions and later locked gates on the relevant surfaces
- [X] surface relief and chrome metadata are authored and projected into the Eden shell
- [X] the Personal Box now supports direct in-scene sign-in plus local widget add/edit/delete without handing off to broader tools
- [X] the `Edit Page` surface now writes to a real page chrome/theme model for the embedded Todo board
- [X] the `Versions` surface now drives real published/draft/last-good actions for the embedded Todo board's current version seam
- [X] section-level Todo relief now maps the embedded board's internal sections to stable surface ids backed by real widget ids
- [X] the embedded Todo board can now switch into inspect mode so the real right-click widget inspector and narrow save-back loop work inside Eden itself
- [X] the live center board now supports the direct expert shortcut, so `F1` opens `whoami` on the shared command surface and reveals the current user truth in place
- [X] the `WORLD_GRAPH` surface now hosts the first real in-context capability install panel, so the neighborhood can suggest and install missing powers from the actual discovery point
- [X] the chapter/checkpoint rail now carries real quest-state progression for the first arc, driven by witnessed completion of the practical Personal Box, Edit Page, Versions, and World Graph loops
- [X] the first visible power chips now unlock from real progression, so `Edit Shared Surface` and adjacent Tree gates can open from practiced work instead of staying static locked labels
- [X] the `PROCESS_VIEW` surface now hosts the first real operator quest rail, so `Alter Runtime` unlocks from witnessed publish + process inspection practice and can run a real in-world failure drill
- [X] the Tree now hosts a real optional `Theory Annex`, so the neighborhood can witness lesson study and award the `trained` mark from actual theory work instead of a decorative future chip
- [X] the neighborhood now carries a first repeated-practice layer, so stewardship, operator work, and teaching show up as real responsibility tracks instead of only one-time arc completion
- [X] the Tree now hosts a real `Teach Back` action after the `trained` mark, so teaching can be witnessed in-place as part of the neighborhood
- [X] the shared Todo version seam is now explicitly bound to the `frontend` context, so the `VERSIONS` shelf obeys the same visible shared-surface authority boundary as the rest of the board
- [X] the Tree and adjacent action surfaces now carry the first broader responsibility-family consequences, so repeated work can visibly unlock `Shared Table`, `Run A Stall`, and `Ship A Tiny SaaS` in the neighborhood itself
- [X] the `Commons` surface now hosts a real governance loop, so `Start A Group`, `Set The Rules`, and `Run An Open Organization` complete from real context creation, stewardship delegation, and proposal approval inside the neighborhood

### Next slices

- [ ] expand the neighborhood beyond this first responsibility family into broader academy districts, deeper thresholds, and stronger cross-surface unlock consequences

### Later slices

- [ ] add richer departure/arrival motion on `goto` transport beyond the current camera-and-navigate transition
- [ ] render `DESIRE` playback/edit tokens inside the scene
