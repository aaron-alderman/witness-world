# Operator Product Spec

Status date: `2026-06-21`

This is the crisp product spec for the operator itself.

It is the one file that should answer:

- what the client-facing product model is
- what the equivalent platform-aligned model is
- how those two map
- what actions exist

RVM and AssemblyScript are downstream implementation consequences of this spec. They are not the starting point.

---

## 1. Product Thesis

The operator is a semantic workbench for inspecting, navigating, comparing, substituting, and eventually editing structured world/platform/app content.

It is not fundamentally:

- a TUI
- a left/right pane shell
- a browser app
- an Electron app

Those are presentation choices.

The product is a model of:

- content objects
- presentation objects
- runtime/session state
- actions
- substitution rules

---

## 2. Product Rules

### 2.1 Stable ids, mutable labels

Every object has:

- `id`: stable machine identity
- `label`: human-facing mutable display name

No semantic binding may depend on display labels.

### 2.2 No defaults

If required structure is missing:

- validation fails
- no fallback guessing
- no runtime healing

### 2.3 Presentation is not semantics

Windows, splits, tabs, overlays, and stacks are presentation objects.

What they show is a separate concern.

### 2.4 Traits drive substitution

Traits determine compatibility and swapability.

The product should answer:

- what is this?
- what traits does it satisfy?
- what can replace it?

### 2.5 Actions are first-class

Actions are part of the model, not scattered UI handlers.

---

## 3. Output 1: Client-Aligned Data Model

This is the product model as a client would reasonably understand it.

### 3.1 Content Object

```json
{
  "id": "content.recordInspector.primary",
  "label": "Inspector",
  "kind": "content",
  "contentType": "recordInspector",
  "traits": [
    "inspectable-record",
    "link-emitting",
    "selection-aware"
  ],
  "relations": [
    { "type": "readsFrom", "target": "source.world.records" }
  ],
  "actions": [
    "action.inspect.open",
    "action.references.open",
    "action.source.open"
  ]
}
```

### 3.2 Presentation Object

```json
{
  "id": "presentation.mainWindow",
  "label": "Main Window",
  "kind": "presentation",
  "presentationType": "window",
  "children": [
    "presentation.mainSplit"
  ]
}
```

```json
{
  "id": "presentation.mainSplit",
  "label": "Main Split",
  "kind": "presentation",
  "presentationType": "split",
  "orientation": "vertical",
  "children": [
    "presentation.navWindow",
    "presentation.inspectWindow"
  ]
}
```

```json
{
  "id": "presentation.inspectWindow",
  "label": "Inspect Window",
  "kind": "presentation",
  "presentationType": "window",
  "contentBinding": "content.recordInspector.primary"
}
```

### 3.3 Runtime Session Object

```json
{
  "id": "session.current",
  "focusedPresentationId": "presentation.inspectWindow",
  "activeContentId": "content.recordInspector.primary",
  "selectedEntityId": "world.thing.alpha",
  "openOverlayIds": [
    "presentation.helpOverlay"
  ],
  "scrollStateByContentId": {
    "content.recordInspector.primary": { "x": 0, "y": 12 }
  }
}
```

### 3.4 Trait Definition

```json
{
  "id": "trait.inspectable-record",
  "label": "Inspectable Record",
  "kind": "trait",
  "requires": [
    "capability.render.detail",
    "capability.emit.links"
  ]
}
```

### 3.5 Substitution Question

A slot is compatible with a candidate when:

- required traits are satisfied
- required capabilities are present
- required relations are satisfiable

This is how the product answers:

- "what can I swap this out with?"

---

## 4. Output 2: Platform-Aligned Data Model

This is the same product expressed in the platform’s semantic terms.

### 4.1 Semantic objects

Use existing platform nouns where possible:

- `surface`
- `collection`
- `process`
- `projection`
- `message`
- `boundary`
- `policy`
- `capability`

### 4.2 Platform-aligned content model

Client concept:

- content object

Platform-aligned shape:

- a composition of:
  - one or more `surface` nodes
  - `projection` bindings
  - `collection` bindings where repeated rows/items exist
  - `process` state owners for interactive state
  - `capability` links where special runtime behaviors are required

### 4.3 Platform-aligned presentation model

Client concept:

- presentation object

Platform-aligned shape:

- authored surface tree / page composition objects
- route-served `page.surface` root
- surface relationships and mount structure
- explicit interactive state owned by `process`

### 4.4 Platform-aligned session model

Client concept:

- runtime session object

Platform-aligned shape:

- `process`-owned state
- route state
- projection-visible state
- runtime interaction state carried through the shared surface runtime

### 4.5 Platform-aligned substitution model

Client concept:

- traits and substitution

Platform-aligned shape:

- semantic compatibility expressed through authored object identity, capability, relation, and process/projection contracts
- trait objects can be introduced as explicit authored nouns if needed

---

## 5. Mapping Between Client Model And Platform Model

### 5.1 Content mapping

- client `content object`
  -> platform `surface + projection + collection + process + capability` bundle

### 5.2 Presentation mapping

- client `presentation object`
  -> platform-authored surface composition / route-served shell arrangement

### 5.3 Session mapping

- client `runtime session`
  -> platform `process` state + runtime interaction state + route state

### 5.4 Traits mapping

- client `trait`
  -> authored compatibility contract over platform nouns

### 5.5 Actions mapping

- client `action`
  -> platform `process` transition, route transition, or capability invocation

---

## 6. Action Model

Actions should be explicit model objects.

### 6.1 Action shape

```json
{
  "id": "action.inspect.open",
  "label": "Open Inspect",
  "kind": "action",
  "actionType": "stateTransition",
  "target": "content.recordInspector.primary",
  "requiresTraits": [
    "inspectable-record"
  ]
}
```

### 6.2 Action categories

- `navigate`
- `inspect`
- `openOverlay`
- `closeOverlay`
- `focus`
- `select`
- `swap`
- `rename`
- `clone`
- `openReferences`
- `openSource`
- `openProvenance`
- `edit` later

### 6.3 Platform mapping for actions

- navigation actions
  -> route/process state transitions
- selection/focus actions
  -> process-owned interaction state transitions
- overlay actions
  -> authored overlay/surface visibility transitions
- swap actions
  -> validated rebinding of presentation object to compatible content object
- capability actions
  -> capability invocation through governed platform/runtime seams

---

## 7. What The Product Explicitly Is Not

It is not:

- a model built around `left screen` / `right pane`
- a shell whose semantics come from presentation placement
- a host-owned navigation grammar
- a text-file-first architecture
- a runtime that fills missing fields with defaults

---

## 8. Validation Rules

These are product rules, not optional lint:

- every object must have a stable `id`
- every object must have an explicit `label`
- all required fields must be present
- all references must resolve
- all content bindings must resolve
- all actions must resolve to valid targets
- all substitution claims must be trait-valid

If any of these fail, the model is invalid.

---

## 9. Implementation Consequences

Only after the model above is fixed should implementation follow.

### 9.1 RVM

RVM should express:

- semantic objects
- presentation objects
- relations
- traits
- actions
- route/surface/process/projection bindings

RVM is one expression of the product model, not the semantic source of truth.

### 9.2 AssemblyScript

AssemblyScript is downstream and optional.

It is only justified for:

- framebuffer writes
- glyph blitting
- other measured rendering hotspots

It must not own:

- semantic modeling
- validation
- action semantics
- substitution logic
- governance

---

## 10. Build Order

1. lock the client-aligned product model
2. lock the platform-aligned model
3. lock the mapping
4. lock the action model
5. express it in RVM/MCP flows
6. implement host rendering
7. optimize with AssemblyScript only if needed

This is the intended order.
