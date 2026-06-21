# Serves

## What it is

A first-class attachment object.

`serve` binds a `route` onto a `serverRunner`.

It is the link between authored route definition and concrete runtime exposure.

## Main fields

The authored shape carries:

- `serverRunner`
- `route`

## What an author uses it for

- decide which runtime serves which route
- separate route definition from runtime placement
- attach the same modeled route to a concrete environment

## What it relates to

A serve participates in:

- `route`
- `serverRunner`
- runtime host ownership
- environment selection

## Why it matters

Without `serve`, route definition and runtime delivery remain disconnected.
