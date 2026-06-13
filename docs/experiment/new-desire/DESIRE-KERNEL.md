# DESIRE Kernel

## Goal

`DESIRE` is the smallest semantic kernel that:

- can express domain truth
- can express governed process behavior
- can express semantic surfaces without committing to DOM/HTML
- can serve as the canonical target of multiple source languages

`DESIRE` is intentionally not:

- a runtime wiring language
- a transport language
- a plugin installation language
- a DOM/widget language
- a source round-tripping layer

## Core principles

1. `DESIRE` stores semantic meaning, not authored sugar.
2. `DESIRE` must be smaller than `RVM` and smaller than `wtoml`.
3. `DESIRE` must not depend on one renderer, one transport, or one host.
4. `DESIRE` can be normalized aggressively.
5. `DESIRE` does not promise reconstruction of the original source tree.

## Canonical form

This draft uses an s-expression-like notation for precision only.

```lisp
(kind Name clause...)
```

Each clause is explicit:

```lisp
(label value...)
```

There are no implicit defaults in the kernel.

## Kernel inventory

The first draft kernel consists of these semantic kinds:

- `context`
- `type`
- `message`
- `store`
- `entity`
- `projection`
- `dataflow`
- `capability`
- `boundary`
- `policy`
- `process`
- `surface`

### `context`

Defines semantic scope and parentage.

```lisp
(context Name
  (parent ParentName?))
```

Semantics:

- a `context` is a semantic visibility/governance region
- parentage is semantic, not transport-specific

### `type`

Defines scalar, collection, and alias types.

```lisp
(type Name TypeExpr)
```

Base `TypeExpr` forms:

```lisp
string
number
bool
json
symbol
(list TypeExpr)
(set TypeExpr)
(map KeyType ValueType)
(option TypeExpr)
(ref TypeName)
```

The kernel does not yet distinguish editor hints from type meaning.
Editor hints belong in `DESIRE+`.

### `message`

Defines transportable or emitted structured payloads.

```lisp
(message Name
  (fields
    (fieldName TypeExpr)*))
```

Semantics:

- messages are typed payload contracts
- messages are used by processes and boundaries
- messages do not imply any specific transport

### `store`

Defines semantic persistence class.

```lisp
(store Name
  (kind durable|ephemeral|derived))
```

Semantics:

- `durable` means identity-bearing truth may be persisted there
- `ephemeral` means process/session-local storage class
- `derived` means projection/read-model storage class

### `entity`

Defines durable domain truth.

```lisp
(entity Name
  (context ContextName)
  (store StoreName?)
  (identity FieldName)
  (version FieldName?)
  (fields
    (fieldName TypeExpr)*))
```

Semantics:

- `entity` is the kernel notion of durable truth with identity
- `version` is semantic optimistic-concurrency state, not a formatting convention
- the kernel does not encode CRUD as syntax

### `projection`

Defines derived read shape.

```lisp
(projection Name
  (source SourceName)
  (shape
    (fieldName Expr)*))
```

Semantics:

- projections are derived views over entities or process state
- projections are not canonical truth

### `dataflow`

Defines named semantic computation graphs that are not themselves runtime wiring.

```lisp
(dataflow Name
  (axes Axis*)
  (params Param*)
  (derives Derive*)
  (reduces Reduce*))
```

Semantics:

- dataflows capture model-like computation meaning
- axes and params describe semantic dimensions and inputs
- derives/reduces describe named computation steps without committing to a host language
- charts or other surfaces may reference dataflows, but renderer encodings remain separate surface semantics

### `capability`

Defines named authority or substrate affordance.

```lisp
(capability Name
  (verbs Symbol*)
  (scope Symbol*))
```

Examples:

- `http.fetch`
- `world.read`
- `entity.write`
- `dom.render`

Semantics:

- capability names are semantic affordances
- installation/placement is not kernel-level

### `boundary`

Defines external or cross-context operations.

```lisp
(boundary Name
  (capabilities CapabilityName*)
  (operations
    (OpName
      (input MessageName?)
      (output MessageName?))*))
```

Semantics:

- a `boundary` is the semantic seam to an external or delegated world
- operations are named contracts
- transport and route realization are not part of the kernel

### `policy`

Defines whether certain actions are allowed or require proposal/governance.

```lisp
(policy Name
  (allows AllowRule*))
```

Minimal `AllowRule` draft:

```lisp
(allow
  (actor Expr)
  (action Expr)
  (target Expr)
  (mode direct|propose|deny))
```

Semantics:

- policy is kernel-level because authority is semantic, not incidental

### `process`

Defines stateful, effectful semantic behavior.

```lisp
(process Name
  (state
    (stateName TypeExpr InitialExpr?)*)
  (handles MessageName*)
  (emits MessageName*)
  (rules Rule*))
```

Rules:

```lisp
(rule
  (on Trigger)
  Effect*)
```

Triggers:

```lisp
(message MessageName)
(command Symbol)
(init)
(timer Symbol)
```

Effects:

```lisp
(assign stateName Expr)
(read ProjectionName into localName)
(create EntityName Expr)
(update EntityName Expr)
(delete EntityName Expr)
(call BoundaryName OpName Expr into localName?)
(emit MessageName Expr)
(guard Predicate)
(branch Predicate Effect* Effect*)
(propose Action PolicyName)
(fail Code Expr?)
```

Semantics:

- `process` is the only kernel place where imperative behavior lives
- effect kinds are closed and explicit
- arbitrary host scripting is not kernel-level

### `surface`

Defines semantic UI intent, not DOM widgets.

```lisp
(surface Name
  (bind
    (bindingName Expr)*)
  (intents
    (IntentName MessageName)*)
  (view ViewExpr))
```

Initial semantic `ViewExpr` vocabulary:

```lisp
(screen Node*)
(section Label Node*)
(group Node*)
(text Expr)
(field FieldKind
  (bind Expr)
  (label Expr?))
(action IntentName
  (label Expr))
(list
  (items Expr)
  (item itemName Node*))
(detail
  (value Expr)
  Node*)
(when Predicate Node*)
```

Initial `FieldKind` set:

- `text`
- `multiline`
- `toggle`
- `select`

Semantics:

- `surface` captures user-visible meaning
- DOM tags, classes, layout atoms, and renderer hints are not kernel-level

## Not in the kernel

The following do not belong in `DESIRE`:

- routes
- server runners
- transports
- plugin installation
- MCP runtime declarations
- widget trees
- DOM tags
- CSS classes
- source spans
- source imports/modules
- pretty-print preservation metadata
- bridge-only compatibility residuals such as `runtime.declaration` or legacy `runtime.doc`

Those belong in `DESIRE+`, `DESIRE.runtimeResiduals`, or lower runtime layers.

## Runtime residual bridge

The implementation carries residual WTOML runtime-facing material in `DESIRE.runtimeResiduals`, not in the kernel node stream.

The canonical residual kind is `runtime.declaration`. Legacy `runtime.doc` is accepted only as compatibility input for older callers and is deliberately excluded from `DESIRE_KERNEL_KINDS` and `DESIRE_NODE_KINDS`.

`runtime.declaration` residuals carry a first-class `body.declaration` envelope:

- `kind`: normalized runtime declaration kind
- `values`: normalized runtime declaration payload after source-local defaults
- `sourceDefaultsApplied`: whether source defaults have already been applied
- `source`: source language, source kind, file/span/order/style, and trace payload

Compatibility aliases such as `body.values`, `body.declarationKind`, and `body.sourceLanguage` may be present after validation for older projection and source annotation code, but raw WTOML-shaped `runtime.declaration` residuals without `body.declaration` are rejected.

Runtime residuals are not canonical kernel semantics. They are a bridge for implementation-facing declarations that still need traceability while WTOML remains the runnable authored surface.

## Minimal example

```lisp
(context todo_items)

(message TodoCreateRequest
  (fields
    (id string)
    (title string)
    (notes string)
    (done bool)))

(message TodoItemResponse
  (fields
    (item json)))

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

(boundary HostedCommand
  (capabilities capability:write:hosted_command)
  (operations
    (createTodo
      (input TodoCreateRequest)
      (output TodoItemResponse))))

(process TodoSession
  (state
    (DraftTodoId string "todo-alpha")
    (DraftTodoTitle string "")
    (DraftTodoNotes string "")
    (CreateTodoLoading bool false))
  (handles TodoItemResponse)
  (emits TodoCreateRequest)
  (rules
    (rule
      (on (command CreateTodo))
      (assign CreateTodoLoading true)
      (emit TodoCreateRequest
        (record
          (id DraftTodoId)
          (title DraftTodoTitle)
          (notes DraftTodoNotes)
          (done false)))
      (call HostedCommand createTodo $TodoCreateRequest into CreatedItem)
      (assign CreateTodoLoading false))))
```

## Open questions

The main unresolved points for the kernel are:

1. whether `projection.shape` and `dataflow` should share a richer query/computation algebra
2. whether `policy` should remain a top-level kind or become boundary/process metadata
3. whether `surface` should stay in the kernel or move fully into `DESIRE+`
4. whether `command` deserves a distinct trigger/message kind in the kernel

Current recommendation:

- keep `surface` in the kernel, but only at semantic intent level
- keep `policy` in the kernel
- keep runtime realization outside the kernel
