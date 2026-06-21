# Routes

## What it is

A first-class delivery object.

`route` defines an addressable path that serves a target through a handler.

## Main fields

The authored shape carries:

- `path`
- `serves`
- `method`
- `handler`
- `params`
- `context`

Route params may also carry route-state and preload-related structure.

## What an author uses it for

- define an addressable entrypoint
- bind a path to a served target
- choose request method
- attach route parameters and route-state behavior
- place a route in a semantic context

## What it relates to

A route participates in:

- `serve`
- `serverRunner`
- `surface`
- route-selected output
- route/state synchronization
- runtime preload behavior

## Why it matters

`route` is one of the main objects that turns authored content into a reachable application surface.
