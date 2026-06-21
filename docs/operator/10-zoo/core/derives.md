# Derives

## What it is

The authoring-language face of projection.

In RVM, authors write `derive`.

The semantic layer normalizes that into:

- `projection`

## Main fields

Current semantic derive/projection fields include:

- `projectionKind`
- `source`
- `props`

## What an author uses it for

- define computed read models
- transform source data for rendering
- produce shaped data for lists, details, and repeated surface content

## Why it matters

`derive` is the author-facing name for one of the core separation lines in the platform:

- source data
- derived view data
- rendered surface
