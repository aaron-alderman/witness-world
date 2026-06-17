# Lowering Examples

This document works one small `wtoml` slice and one small `RVM` slice through the proposed stack:

```text
source -> DESIRE+ -> DESIRE
```

The goal is not perfect coverage.
The goal is to make the kernel boundary concrete.

## Example A: WTOML

Source fragment from [examples/_lib/demo-todo/frontend.wtoml](/C:/Users/aaron/Documents/world/examples/_lib/demo-todo/frontend.wtoml:361):

```toml
[[step]]
order = 0
op = "initSession"
on = "load"

[[step]]
order = 1
op = "setText"
on = "load"
widget = "todo_session_status"
text = "${state.session && state.session.authenticated ? 'Signed in as ' + state.session.label + ' (' + state.session.effectiveActor + ')' + (state.session.perspective ? ' in ' + state.session.perspective : '') : 'Not signed in'}"

[[step]]
order = 3
op = "fetchJson"
on = "load"
url = "/api/todos"
into = "todoResponse"
```

### WTOML reading

Today this is:

- explicit frontend program graph authoring
- widget-targeted imperative actions
- transport and UI implementation details mixed into authored behavior

### DESIRE+ form

One plausible `DESIRE+` normalization:

```lisp
(module demo.frontend
  (surfaceNode todo_session_status
    (kind text))

  (processGraph todo_frontend_program
    (on load
      (step 0
        (runtimeOp initSession))
      (step 1
        (runtimeOp setText
          (target todo_session_status)
          (expr sessionStatusText)))
      (step 3
        (runtimeOp fetchJson
          (url "/api/todos")
          (into todoResponse)))))

  (derivedExpr sessionStatusText
    (if state.session.authenticated
      (concat
        "Signed in as "
        state.session.label
        " ("
        state.session.effectiveActor
        ")"
        (if state.session.perspective
          (concat " in " state.session.perspective)
          ""))
      "Not signed in")))
```

Notes:

- widget-targeted imperative steps are preserved
- route/URL string is still present
- the frontend graph remains explicit

This is still not kernel-ready because:

- `runtimeOp`
- widget ids
- concrete URL transport

are all still implementation-facing.

### DESIRE lowering

Kernel lowering:

```lisp
(message SessionInitialized
  (fields
    (authenticated bool)
    (label string)
    (actor string)
    (perspective (option string))))

(message TodosLoaded
  (fields
    (items json)))

(boundary SessionBoundary
  (capabilities http.fetch)
  (operations
    (initSession
      (output SessionInitialized))))

(boundary TodoQueryBoundary
  (capabilities http.fetch)
  (operations
    (listTodos
      (output TodosLoaded))))

(process TodoFrontendSession
  (state
    (SessionState json null)
    (TodoResponse json null))
  (handles SessionInitialized TodosLoaded)
  (emits)
  (rules
    (rule
      (on (init))
      (call SessionBoundary initSession () into SessionInit)
      (assign SessionState SessionInit)
      (call TodoQueryBoundary listTodos () into Todos)
      (assign TodoResponse Todos))))

(surface TodoSessionStatus
  (bind
    (session SessionState))
  (intents)
  (view
    (text
      (if session.authenticated
        (concat
          "Signed in as "
          session.label
          " ("
          session.effectiveActor
          ")"
          (if session.perspective
            (concat " in " session.perspective)
            ""))
        "Not signed in"))))
```

### What changed

- widget mutation became semantic surface binding
- concrete `fetchJson` became boundary call
- load-time imperative graph became process rules
- the route string disappeared from the kernel

That last part is intentional.
The route belongs in `DESIRE+ runtime`, not the kernel.

## Example B: RVM

Source fragment from [examples_rvm/todo-v3-alpha/fixtures/source-input/todo-v3-alpha.rvm](/C:/Users/aaron/Documents/world/examples_rvm/todo-v3-alpha/fixtures/source-input/todo-v3-alpha.rvm:7):

```text
message TodoSelectedPayload {
  fields {
    item_id: string
    title: string
    notes: string
    done: bool
    version: string
  }
}

version TodoRecordVersion {
  field version
  kind optimistic_counter
}

entity TodoItem {
  context todo_items
  trait todo_item
  id_prop id
  title_prop title
  done_prop done
  notes_prop notes
  version_prop TodoRecordVersion
  list_projection todos_list_projection
  detail_projection todo_detail_projection
  durable_state durable_todo_state
  ordering_prop id
}
```

### RVM reading

This is already close to semantic authorship:

- typed message
- version semantics
- entity declaration
- projection references
- persistence reference

### DESIRE+ form

`DESIRE+` can preserve almost the same authored tree:

```lisp
(module TodoV3Alpha
  (message TodoSelectedPayload
    (fields
      (item_id string)
      (title string)
      (notes string)
      (done bool)
      (version string)))

  (entityVersion TodoRecordVersion
    (field version)
    (kind optimistic_counter))

  (entity TodoItem
    (context todo_items)
    (trait todo_item)
    (identity id)
    (titleField title)
    (doneField done)
    (notesField notes)
    (versionRef TodoRecordVersion)
    (listProjection todos_list_projection)
    (detailProjection todo_detail_projection)
    (store durable_todo_state)
    (ordering id)))
```

### DESIRE lowering

Kernel lowering:

```lisp
(message TodoSelectedPayload
  (fields
    (item_id string)
    (title string)
    (notes string)
    (done bool)
    (version string)))

(store durable_todo_state
  (kind durable))

(entity TodoItem
  (context todo_items)
  (store durable_todo_state)
  (identity id)
  (version version)
  (fields
    (id string)
    (title string)
    (notes string)
    (done bool)
    (version string)))
```

Additional semantics such as:

- display ordering
- projection naming
- trait labels
- editor hints

can remain in `DESIRE+` unless they are proven kernel-essential.

### What changed

- source-level `version` declaration collapsed into entity version semantics
- presentation-oriented field-role distinctions stayed above the boundary
- no DOM/runtime information entered the kernel

## Interim comparison

### RVM to DESIRE

The semantic core of `RVM` maps relatively cleanly:

- `message` -> `message`
- `entity` -> `entity`
- `process` -> `process`
- `boundary` -> `boundary`

The main difficulty is not domain/process meaning.
It is the large authored UI/runtime substrate checked into support files.

### WTOML to DESIRE

`wtoml` can lower, but it is less direct:

- some `wtoml` is semantic
- much of `wtoml` is explicit runtime and widget graph assembly

That means `wtoml` needs a thicker `DESIRE+` layer than `RVM`.

## Boundary test

A form probably belongs in `DESIRE` if removing it would make the app semantically incomplete.

A form probably belongs in `DESIRE+` if it mainly answers:

- how is this grouped in source?
- which plugin introduced this?
- which route or server realizes this?
- which widget or DOM node renders this?
- how should this pretty-print back to source?

That is the current draft boundary.

