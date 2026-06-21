# Surfaces

## What it is

A first-class rendered interaction object.

In the RVM semantic core, `view` lowers to `surface`.

`surface` is the authored unit consumed by `page.surface`.

## Main fields

The semantic shape carries:

- `identity`
- `context`
- `surfaceKind`
- `className`
- `processRef`
- `projectionRefs`
- `capabilityRefs`
- `bindings`
- `interactions`
- `repeat`
- `children`
- `props`

## What an author uses it for

- define rendered structure
- bind runtime state and projections
- bind capability-backed behavior
- declare interactions
- declare repeated content
- compose child surfaces

## What it relates to

A surface participates in:

- `collection`
- `process`
- `projection`
- `message`
- `boundary`
- `policy`
- `route`
- `page.surface`

## Why it matters

`surface` is the canonical frontend semantic object.

It is the main unit through which authored interactive UI reaches the runtime.
