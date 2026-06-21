# Projections

## What it is

A first-class derived view object.

In the RVM semantic core, `derive` lowers to `projection`.

`projection` is how derived data is prepared for rendered or runtime consumption.

## Main fields

The semantic shape carries:

- `projectionKind`
- `source`
- `props`

The public authoring policy treats projection authoring as supported through:

- `projection.create`

## What an author uses it for

- derive view-oriented data from a source
- shape data before binding it to a surface
- express computed or transformed read models

## What it relates to

A projection participates in:

- `surface`
- `collection`
- `process`
- `page.surface`
- other derived data flows

## Why it matters

Without `projection`, authors are forced to collapse raw source data and rendered structure into one layer.
