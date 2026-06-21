# Contexts

## What it is

A first-class scoping object.

`context` is used to determine:

- where names are local
- what targets are visible
- what can be imported
- what can be exported
- where authored objects belong

## Where it appears

RVM treats `context` and `graph_context` as first-class forms.

The authoring surface also exposes:

- `contextBinding`
- `contextExport`
- `contextImport`

Many authored objects optionally carry a `context` field.

## What an author uses it for

- place an object into a scope
- bind a local name to a target
- export a target from one scope
- import a target into another scope
- reason about visibility explicitly instead of relying on global ids

## What it relates to

A context participates in:

- naming and resolution
- visibility rules
- stewardship targets
- capability targets
- route/app ownership
- package namespaces
- server-runner and runtime attachment

## Why it is special

Without `context`, the system cannot answer:

- where does this object belong
- which names are visible here
- whether this target is local, imported, or hidden
- whether an action is being attempted in the correct scope

That makes `context` a privileged primitive rather than just another typed thing.
