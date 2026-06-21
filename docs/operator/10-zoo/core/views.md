# Views

## What it is

The authoring-language face of a rendered surface description.

In RVM, `view` lowers to:

- `surface`

This is not the same as the later `view` runtime declaration used by `createViewDescription(...)`.

## Main fields

Current semantic `view` fields include:

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
- bind a surface to process and projection inputs
- repeat over collections or derived rows
- attach interactions and capability requirements

## Why it matters

`view` is the author-friendly name for the rendered semantic layer.

It is where process, projection, capability, and structure meet.
