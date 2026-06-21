# Collections

## What it is

A first-class semantic collection object.

Current RVM collection shape is intentionally small.

It establishes a named collection in the semantic layer without forcing storage and rendering to collapse into one object.

## Main fields

Current semantic shape carries:

- `id`

The public authoring policy treats collection authoring as supported through:

- `collection.create`

## What an author uses it for

- establish a reusable named collection
- bind repeated or grouped records into surface/runtime flows
- provide a target for derived list-oriented data

## Runtime usage

The surface runtime reads `desire.defineCollection` rows as part of its authored interactive model.

## Why it matters

Collection is the named grouping primitive that lets authors talk about sets of items without having to reduce everything to raw messages or ad hoc widget trees.
